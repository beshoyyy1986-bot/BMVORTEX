import { Router, type IRouter } from "express";
import {
  GetTempEmailMessagesQueryParams,
  ExtractInviteLinkQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

// mail.tm is preferred (stable addresses, clean JSON), but it returns an
// empty 500 to datacenter IPs — including Vercel's — while working fine from
// residential ones. GuerrillaMail has no such restriction, so it backs up
// every operation. The client never learns which one served it: the provider
// is encoded into the opaque token handed back from /create.
const MAILTM_BASE = "https://api.mail.tm";
const GUERRILLA_BASE = "https://api.guerrillamail.com/ajax.php";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const JSON_HEADERS = { Accept: "application/json", "User-Agent": UA };

type Provider = "mailtm" | "guerrilla";

interface Message {
  id: string;
  from: string;
  subject: string;
  intro: string;
  createdAt: string;
}

// The token the client round-trips. Prefixed so /messages and /invite-link
// know which provider to talk to without a second lookup.
function encodeToken(provider: Provider, secret: string): string {
  return `${provider}:${secret}`;
}

function decodeToken(token: string): { provider: Provider; secret: string } {
  const sep = token.indexOf(":");
  if (sep === -1) {
    // Tokens issued before providers were pluggable were raw mail.tm JWTs.
    return { provider: "mailtm", secret: token };
  }
  const prefix = token.slice(0, sep);
  return {
    provider: prefix === "guerrilla" ? "guerrilla" : "mailtm",
    secret: token.slice(sep + 1),
  };
}

// ── mail.tm ────────────────────────────────────────────────────────────────

async function mailtmCreate(): Promise<{ email: string; token: string; id: string }> {
  const domainRes = await fetch(`${MAILTM_BASE}/domains?page=1`, { headers: JSON_HEADERS });
  if (!domainRes.ok) throw new Error(`domains ${domainRes.status}`);

  const domainData = (await domainRes.json()) as { "hydra:member": { domain: string }[] };
  const domain = domainData["hydra:member"]?.[0]?.domain;
  if (!domain) throw new Error("no domains available");

  const address = `${Math.random().toString(36).slice(2, 10)}@${domain}`;
  const password = Math.random().toString(36).slice(2, 18);

  const createRes = await fetch(`${MAILTM_BASE}/accounts`, {
    method: "POST",
    headers: { ...JSON_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({ address, password }),
  });
  if (!createRes.ok) throw new Error(`accounts ${createRes.status}`);
  const created = (await createRes.json()) as { id: string; address: string };

  const tokenRes = await fetch(`${MAILTM_BASE}/token`, {
    method: "POST",
    headers: { ...JSON_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({ address, password }),
  });
  if (!tokenRes.ok) throw new Error(`token ${tokenRes.status}`);
  const tokenData = (await tokenRes.json()) as { token: string };

  return {
    email: created.address,
    token: encodeToken("mailtm", tokenData.token),
    id: created.id,
  };
}

async function mailtmMessages(secret: string): Promise<Message[]> {
  const res = await fetch(`${MAILTM_BASE}/messages?page=1`, {
    headers: { ...JSON_HEADERS, Authorization: `Bearer ${secret}` },
  });
  if (!res.ok) throw new Error(`messages ${res.status}`);

  const data = (await res.json()) as {
    "hydra:member": {
      id: string;
      from: { address: string };
      subject: string;
      intro: string;
      createdAt: string;
    }[];
  };

  return (data["hydra:member"] || []).map((m) => ({
    id: m.id,
    from: m.from?.address ?? "",
    subject: m.subject ?? "",
    intro: m.intro ?? "",
    createdAt: m.createdAt ?? "",
  }));
}

async function mailtmBody(secret: string, messageId: string): Promise<{ body: string; subject: string; id: string }> {
  const res = await fetch(`${MAILTM_BASE}/messages/${messageId}`, {
    headers: { ...JSON_HEADERS, Authorization: `Bearer ${secret}` },
  });
  if (!res.ok) throw new Error(`message ${res.status}`);

  const data = (await res.json()) as {
    id: string;
    subject: string;
    html?: string[];
    text?: string;
  };

  return {
    body: (data.html?.join("") ?? "") || (data.text ?? ""),
    subject: data.subject ?? "",
    id: data.id,
  };
}

// ── GuerrillaMail ──────────────────────────────────────────────────────────

async function guerrillaCall(params: Record<string, string>): Promise<unknown> {
  const url = `${GUERRILLA_BASE}?${new URLSearchParams(params).toString()}`;
  const res = await fetch(url, { headers: JSON_HEADERS });
  if (!res.ok) throw new Error(`guerrilla ${params.f} ${res.status}`);
  return res.json();
}

async function guerrillaCreate(): Promise<{ email: string; token: string; id: string }> {
  const data = (await guerrillaCall({ f: "get_email_address" })) as {
    email_addr: string;
    sid_token: string;
  };
  if (!data?.sid_token || !data?.email_addr) throw new Error("no address returned");

  return {
    email: data.email_addr,
    token: encodeToken("guerrilla", data.sid_token),
    id: data.email_addr,
  };
}

async function guerrillaMessages(secret: string): Promise<Message[]> {
  const data = (await guerrillaCall({
    f: "check_email",
    seq: "0",
    sid_token: secret,
  })) as {
    list?: {
      mail_id: string | number;
      mail_from: string;
      mail_subject: string;
      mail_excerpt: string;
      mail_timestamp: string | number;
    }[];
  };

  return (data.list || []).map((m) => ({
    id: String(m.mail_id),
    from: m.mail_from ?? "",
    subject: m.mail_subject ?? "",
    intro: m.mail_excerpt ?? "",
    createdAt: m.mail_timestamp
      ? new Date(Number(m.mail_timestamp) * 1000).toISOString()
      : "",
  }));
}

async function guerrillaBody(secret: string, messageId: string): Promise<{ body: string; subject: string; id: string }> {
  const data = (await guerrillaCall({
    f: "fetch_email",
    email_id: messageId,
    sid_token: secret,
  })) as { mail_id?: string | number; mail_subject?: string; mail_body?: string };

  return {
    body: data.mail_body ?? "",
    subject: data.mail_subject ?? "",
    id: String(data.mail_id ?? messageId),
  };
}

// ── Provider dispatch ──────────────────────────────────────────────────────

async function listMessages(token: string): Promise<Message[]> {
  const { provider, secret } = decodeToken(token);
  return provider === "guerrilla"
    ? guerrillaMessages(secret)
    : mailtmMessages(secret);
}

async function fetchBody(token: string, messageId: string) {
  const { provider, secret } = decodeToken(token);
  return provider === "guerrilla"
    ? guerrillaBody(secret, messageId)
    : mailtmBody(secret, messageId);
}

// ── Routes ─────────────────────────────────────────────────────────────────

router.post("/temp-email/create", async (req, res): Promise<void> => {
  try {
    const account = await mailtmCreate();
    res.json(account);
    return;
  } catch (primaryErr) {
    req.log.warn(
      { err: (primaryErr as Error).message },
      "mail.tm unavailable, falling back to GuerrillaMail",
    );
  }

  try {
    const account = await guerrillaCreate();
    res.json(account);
  } catch (fallbackErr) {
    req.log.error({ err: fallbackErr }, "all temp-mail providers failed");
    res.status(502).json({
      error: "No temp-mail provider is reachable right now. Please try again.",
    });
  }
});

router.get("/temp-email/messages", async (req, res): Promise<void> => {
  const parsed = GetTempEmailMessagesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    res.json({ messages: await listMessages(parsed.data.token) });
  } catch (err) {
    req.log.error({ err }, "Error fetching messages");
    res.status(502).json({ error: "Could not reach the temp-mail provider" });
  }
});

// Meta invitation links look like
// https://business.facebook.com/...?invite_token=... — patterns are ordered
// most-specific first so a generic /business URL never wins over a real one.
const LINK_PATTERNS = [
  /https:\/\/business\.facebook\.com\/[^\s"'<>]*invite[^\s"'<>]*/gi,
  /https:\/\/www\.facebook\.com\/[^\s"'<>]*invite[^\s"'<>]*/gi,
  /https:\/\/www\.facebook\.com\/[^\s"'<>]*confirm[^\s"'<>]*/gi,
  /https:\/\/business\.facebook\.com\/[^\s"'<>]+/gi,
  /https:\/\/www\.facebook\.com\/business[^\s"'<>]*/gi,
];

function looksLikeMetaSender(m: Message): boolean {
  const from = m.from?.toLowerCase() ?? "";
  const subject = m.subject?.toLowerCase() ?? "";
  return (
    from.includes("facebook") ||
    from.includes("meta") ||
    subject.includes("invited") ||
    subject.includes("invitation") ||
    subject.includes("business")
  );
}

router.get("/temp-email/invite-link", async (req, res): Promise<void> => {
  const parsed = ExtractInviteLinkQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { token, messageId } = parsed.data;
  const notFound = { found: false, link: null, messageId: null, subject: null };

  try {
    let targetMessageId = messageId;

    if (!targetMessageId) {
      const messages = await listMessages(token);
      const metaMsg = messages.find(looksLikeMetaSender);
      if (!metaMsg) {
        res.json(notFound);
        return;
      }
      targetMessageId = metaMsg.id;
    }

    const { body, subject, id } = await fetchBody(token, targetMessageId);

    let link: string | null = null;
    for (const pattern of LINK_PATTERNS) {
      const match = body.match(pattern);
      if (match?.[0]) {
        link = match[0].replace(/&amp;/g, "&");
        break;
      }
    }

    res.json(
      link
        ? { found: true, link, messageId: id, subject }
        : { found: false, link: null, messageId: id, subject },
    );
  } catch (err) {
    req.log.error({ err }, "Error extracting invite link");
    res.status(502).json({ error: "Could not reach the temp-mail provider" });
  }
});

export default router;
