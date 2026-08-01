import { Router, type IRouter } from "express";
import { SendInviteBody } from "@workspace/api-zod";
import { extractFbTokens, TokenExtractionError } from "../lib/meta-tokens";

const router: IRouter = Router();

const META_GRAPHQL = "https://www.facebook.com/api/graphql/";

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
  let fbDtsg: string;
  let lsd: string;
  try {
    ({ fbDtsg, lsd } = await extractFbTokens(cookies, businessId));
  } catch (err) {
    if (err instanceof TokenExtractionError) {
      res.status(400).json({ error: err.message });
      return;
    }
    req.log.error({ err }, "Error extracting fb tokens");
    res.status(500).json({ error: "فشل استخراج التوكنات من الكوكيز" });
    return;
  }

  // Build the variables for BizKitSettingsInvitePeopleModalMutation
  const variables: Record<string, unknown> = {
    input: {
      actor_id: resolvedActorId,
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

  // Build form-encoded body
  const params = new URLSearchParams({
    fb_dtsg: fbDtsg,
    lsd: lsd,
    fb_api_caller_class: "RelayModern",
    fb_api_req_friendly_name: "BizKitSettingsInvitePeopleModalMutation",
    server_timestamps: "true",
    variables: JSON.stringify(variables),
    doc_id: "31295717360015609",
  });

  try {
    const response = await fetch(META_GRAPHQL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: cookies,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: "https://business.facebook.com/",
        Origin: "https://business.facebook.com",
      },
      body: params.toString(),
    });

    const raw = await response.text();
    req.log.info({ status: response.status }, "Meta invite API response");

    if (!response.ok) {
      res.status(500).json({
        error: `Meta API returned status ${response.status}`,
        raw,
      });
      return;
    }

    // Try to parse and check for errors
    let parsed_json: unknown;
    try {
      parsed_json = JSON.parse(raw);
    } catch {
      // Not JSON - still return raw
      res.json({ success: true, message: "Invite sent (non-JSON response)", raw });
      return;
    }

    const data = parsed_json as Record<string, unknown>;
    if (data.errors || (data.data && (data.data as Record<string, unknown>).error)) {
      res.json({
        success: false,
        message: "Meta returned an error",
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
