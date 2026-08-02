import { Router, type IRouter } from "express";
import {
  GetTempEmailMessagesQueryParams,
  ExtractInviteLinkQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

const MAILTM_BASE = "https://api.mail.tm";

// mail.tm rejects requests it cannot attribute to a real client; a plain
// server-side fetch sends no UA at all, which is what the 500s were.
const MAILTM_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// Create a temporary email account via mail.tm
router.post("/temp-email/create", async (req, res): Promise<void> => {
  try {
    // Step 1: get an available domain
    const domainRes = await fetch(`${MAILTM_BASE}/domains?page=1`, {
      headers: { Accept: "application/json", "User-Agent": MAILTM_UA },
    });
    if (!domainRes.ok) {
      const body = await domainRes.text().catch(() => "");
      req.log.error(
        { status: domainRes.status, body: body.slice(0, 500) },
        "mail.tm domains request failed",
      );
      res.status(502).json({
        error: `Temp-mail provider rejected the domains request (${domainRes.status})`,
      });
      return;
    }
    const domainData = await domainRes.json() as { "hydra:member": { domain: string }[] };
    const domains = domainData["hydra:member"];
    if (!domains || domains.length === 0) {
      res.status(500).json({ error: "No email domains available" });
      return;
    }
    const domain = domains[0].domain;

    // Step 2: create a random address + password
    const randomStr = Math.random().toString(36).slice(2, 10);
    const email = `${randomStr}@${domain}`;
    const password = Math.random().toString(36).slice(2, 18);

    // Step 3: register the account
    const createRes = await fetch(`${MAILTM_BASE}/accounts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": MAILTM_UA,
      },
      body: JSON.stringify({ address: email, password }),
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      req.log.error({ status: createRes.status, body: errText }, "Failed to create mail.tm account");
      res.status(500).json({ error: "Failed to create temp email account" });
      return;
    }
    const created = await createRes.json() as { id: string; address: string };

    // Step 4: get auth token
    const tokenRes = await fetch(`${MAILTM_BASE}/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": MAILTM_UA,
      },
      body: JSON.stringify({ address: email, password }),
    });

    if (!tokenRes.ok) {
      res.status(500).json({ error: "Failed to get email token" });
      return;
    }
    const tokenData = await tokenRes.json() as { token: string };

    res.json({
      email: created.address,
      token: tokenData.token,
      id: created.id,
    });
  } catch (err) {
    req.log.error({ err }, "Error creating temp email");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get messages for a temp email account
router.get("/temp-email/messages", async (req, res): Promise<void> => {
  const parsed = GetTempEmailMessagesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { token } = parsed.data;

  try {
    const messagesRes = await fetch(`${MAILTM_BASE}/messages?page=1`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "User-Agent": MAILTM_UA,
      },
    });

    if (!messagesRes.ok) {
      const body = await messagesRes.text().catch(() => "");
      req.log.error(
        { status: messagesRes.status, body: body.slice(0, 500) },
        "mail.tm messages request failed",
      );
      res.status(502).json({
        error: `Temp-mail provider rejected the messages request (${messagesRes.status})`,
      });
      return;
    }

    const data = await messagesRes.json() as {
      "hydra:member": {
        id: string;
        from: { address: string };
        subject: string;
        intro: string;
        createdAt: string;
      }[];
    };

    const messages = (data["hydra:member"] || []).map((m) => ({
      id: m.id,
      from: m.from?.address ?? "",
      subject: m.subject ?? "",
      intro: m.intro ?? "",
      createdAt: m.createdAt ?? "",
    }));

    res.json({ messages });
  } catch (err) {
    req.log.error({ err }, "Error fetching messages");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Extract Meta Business invite link from inbox
router.get("/temp-email/invite-link", async (req, res): Promise<void> => {
  const parsed = ExtractInviteLinkQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { token, messageId } = parsed.data;

  try {
    // If a specific messageId is given, fetch that message detail
    // Otherwise list messages and find the Meta one
    let targetMessageId = messageId;

    if (!targetMessageId) {
      const listRes = await fetch(`${MAILTM_BASE}/messages?page=1`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "User-Agent": MAILTM_UA,
        },
      });

      if (!listRes.ok) {
        res.json({ found: false, link: null, messageId: null, subject: null });
        return;
      }

      const listData = await listRes.json() as {
        "hydra:member": { id: string; from: { address: string }; subject: string }[];
      };

      const metaMsg = (listData["hydra:member"] || []).find(
        (m) =>
          m.from?.address?.includes("facebook") ||
          m.from?.address?.includes("meta") ||
          m.subject?.toLowerCase().includes("invited") ||
          m.subject?.toLowerCase().includes("invitation") ||
          m.subject?.toLowerCase().includes("business")
      );

      if (!metaMsg) {
        res.json({ found: false, link: null, messageId: null, subject: null });
        return;
      }
      targetMessageId = metaMsg.id;
    }

    // Fetch full message to get HTML/text body
    const msgRes = await fetch(`${MAILTM_BASE}/messages/${targetMessageId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "User-Agent": MAILTM_UA,
      },
    });

    if (!msgRes.ok) {
      res.json({ found: false, link: null, messageId: null, subject: null });
      return;
    }

    const msgData = await msgRes.json() as {
      id: string;
      subject: string;
      html?: string[];
      text?: string;
    };

    // Extract invite link from HTML or text body
    // Meta invitation links typically look like: https://www.facebook.com/business/...?invite_token=...
    // or https://business.facebook.com/...
    const bodyContent = (msgData.html?.join("") ?? "") || (msgData.text ?? "");

    const patterns = [
      /https:\/\/www\.facebook\.com\/[^\s"'<>]+invite[^\s"'<>]+/gi,
      /https:\/\/business\.facebook\.com\/[^\s"'<>]+invite[^\s"'<>]+/gi,
      /https:\/\/www\.facebook\.com\/[^\s"'<>]+confirm[^\s"'<>]+/gi,
      /https:\/\/www\.facebook\.com\/business[^\s"'<>]*/gi,
    ];

    let found_link: string | null = null;
    for (const pattern of patterns) {
      const match = bodyContent.match(pattern);
      if (match && match[0]) {
        // Decode HTML entities
        found_link = match[0].replace(/&amp;/g, "&");
        break;
      }
    }

    if (found_link) {
      res.json({
        found: true,
        link: found_link,
        messageId: msgData.id,
        subject: msgData.subject,
      });
    } else {
      res.json({
        found: false,
        link: null,
        messageId: msgData.id,
        subject: msgData.subject,
      });
    }
  } catch (err) {
    req.log.error({ err }, "Error extracting invite link");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
