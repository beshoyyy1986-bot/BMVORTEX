import { Router, type IRouter } from "express";
import { SendInviteBody } from "@workspace/api-zod";
// @ts-ignore — unified extraction used by all other tools (getSession/playwright-first)
import { getSession } from "../utils/metaTokens.js";

const router: IRouter = Router();

// Meta validates fb_dtsg with a companion `jazoest` token: the literal "2"
// followed by the sum of the dtsg's char codes. GraphQL requests without it
// are rejected with HTTP 400 on many endpoints.
function jazoest(dtsg: string): string {
  let sum = 0;
  for (const ch of dtsg) sum += ch.charCodeAt(0);
  return "2" + sum;
}

// Facebook prefixes JSON responses with `for (;;);` and GraphQL responses with
// server_timestamps can arrive as several JSON documents (one per newline), so
// parse every chunk instead of JSON.parse-ing the raw body as one object.
function parseChunks(raw: string): Array<Record<string, unknown>> {
  const strip = (s: string) =>
    s.replace(/^\s*for\s*\(;;\);\s*/, "").replace(/^\s*\)\]\}'?,?\s*/, "").trim();
  const chunks: Array<Record<string, unknown>> = [];
  for (const line of raw.split("\n")) {
    const cleaned = strip(line);
    if (!cleaned) continue;
    try {
      chunks.push(JSON.parse(cleaned));
    } catch {
      // partial chunk
    }
  }
  if (!chunks.length) {
    try {
      chunks.push(JSON.parse(strip(raw)));
    } catch {
      // not JSON
    }
  }
  return chunks;
}

function firstError(chunks: Array<Record<string, unknown>>): string {
  for (const c of chunks) {
    const errs = (c?.errors as Array<Record<string, unknown>> | undefined) ?? [];
    for (const e of errs) {
      if (typeof e?.message === "string" && e.message) return e.message;
    }
    if (typeof c?.errorSummary === "string" && c.errorSummary) return c.errorSummary;
    const err = c?.error;
    if (err && typeof err === "object") {
      const em = (err as Record<string, unknown>).message;
      if (typeof em === "string" && em) return em;
    }
  }
  return "";
}

// Send a Meta Business Manager email invitation
router.post("/send-invite", async (req, res): Promise<void> => {
  const parsed = SendInviteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { cookies, businessId, email, assetId, actorId } = parsed.data;

  // Extract actor_id from cookies (c_user) if not provided
  let resolvedActorId = actorId ?? "";
  if (!resolvedActorId) {
    const cUserMatch = cookies.match(/c_user=(\d+)/);
    if (cUserMatch) {
      resolvedActorId = cUserMatch[1];
    }
  }

  // fb_dtsg / lsd are short-lived anti-CSRF tokens tied to the session,
  // so we pull them fresh from the cookies for every request.
  // Uses the same unified getSession() extractor as every other Meta tool
  // (Playwright-first, multi-URL HTTP fallback).
  const sessionUrl = businessId
    ? `https://business.facebook.com/settings/people?business_id=${encodeURIComponent(businessId)}`
    : undefined;
  const session = await getSession(cookies, sessionUrl);

  if (!session?.dtsg) {
    res.status(400).json({
      error: "تعذر استخراج fb_dtsg / lsd من الكوكيز، تأكد من صلاحية الكوكيز",
    });
    return;
  }

  const fbDtsg: string = session.dtsg;
  const lsd: string = session.lsd || "";
  const actorIdStr: string = String(session.userId || resolvedActorId);
  // Post the GraphQL mutation to the same host the session came from
  // (business.facebook.com) — posting to www.facebook.com is rejected.
  const origin: string = String(session.origin || "https://business.facebook.com").replace(/\/$/, "");

  // Build the variables for BizKitSettingsInvitePeopleModalMutation
  const variables: Record<string, unknown> = {
    input: {
      actor_id: actorIdStr,
      client_mutation_id: "5",
      business_id: businessId,
      business_emails: [email],
      business_account_task_ids: ["926381894526285"],
      invite_origin_surface: "MBS_INVITE_USER_FLOW",
      use_detailed_coded_exception: true,
      auto_assign_access: false,
      expiry_time: 0,
      is_spark_permission: false,
      client_timezone_id: "Africa/Cairo",
    },
  };

  // Add asset if provided
  if (assetId) {
    (variables.input as Record<string, unknown>).assets = [
      {
        asset_id: assetId,
        permitted_task_ids: [
          "864195700451909",
          "151821535410699",
          "610690166001223",
          "186595505260379",
        ],
      },
    ];
  }

  // Build form-encoded body — mirrors the params the working BM Creator tools send.
  const params = new URLSearchParams({
    av: actorIdStr,
    __user: actorIdStr,
    __a: "1",
    __comet_req: "11",
    fb_dtsg: fbDtsg,
    jazoest: jazoest(fbDtsg),
    lsd: lsd,
    fb_api_caller_class: "RelayModern",
    fb_api_req_friendly_name: "BizKitSettingsInvitePeopleModalMutation",
    server_timestamps: "true",
    variables: JSON.stringify(variables),
    doc_id: "31295717360015609",
  });

  try {
    const response = await fetch(`${origin}/api/graphql/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: cookies,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "x-fb-lsd": lsd,
        "x-fb-friendly-name": "BizKitSettingsInvitePeopleModalMutation",
        Referer: `${origin}/settings/people?business_id=${encodeURIComponent(businessId)}`,
        Origin: origin,
      },
      body: params.toString(),
    });

    const raw = await response.text();
    req.log.info({ status: response.status }, "Meta invite API response");

    const chunks = parseChunks(raw);
    const metaError = firstError(chunks);
    const hasData = chunks.some(
      (c) => c?.data && typeof c.data === "object" && Object.keys(c.data).length > 0,
    );

    if (!response.ok) {
      // Surface the real Meta reason when available; a bare status code is
      // useless for diagnosis. A raw HTTP 400 here almost always means the
      // persisted GraphQL query (doc_id) rotated, or fb_dtsg/jazoest mismatch.
      const snippet = raw.slice(0, 300).replace(/\s+/g, " ").trim();
      res.status(400).json({
        error:
          metaError ||
          `Meta API returned status ${response.status}` +
            (snippet ? ` — ${snippet}` : ""),
        raw: raw.slice(0, 1000),
      });
      return;
    }

    if (metaError) {
      res.json({ success: false, message: metaError, raw: raw.slice(0, 1000) });
      return;
    }

    if (!hasData) {
      res.json({
        success: false,
        message: "Meta returned an unexpected response",
        raw: raw.slice(0, 1000),
      });
      return;
    }

    res.json({
      success: true,
      message: `Invitation sent successfully to ${email}`,
      raw: raw.slice(0, 500),
    });
  } catch (err) {
    req.log.error({ err }, "Error calling Meta invite API");
    res.status(500).json({ error: "Failed to reach Meta API" });
  }
});

export default router;
