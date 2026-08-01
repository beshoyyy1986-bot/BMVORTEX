import { Router, type IRouter } from "express";
import { GrantPermissionsBody } from "@workspace/api-zod";
import { extractFbTokens, TokenExtractionError } from "../lib/meta-tokens";

const router: IRouter = Router();

const META_GRAPHQL = "https://www.facebook.com/api/graphql/";

// All Meta Business Manager admin task IDs (from reverse engineering)
const ALL_ADMIN_TASK_IDS = [
  "926381894526285",
  "768085000593466",
  "416103972652535",
  "603931664885191",
  "1327662214465567",
  "862159105082613",
  "6161001899617846786",
  "1633404653754086",
  "967306614466178",
  "2848818871965443",
  "245181923290198",
  "388517145453246",
];

// Grant all admin permissions to a Business User
router.post("/grant-permissions", async (req, res): Promise<void> => {
  const parsed = GrantPermissionsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { cookies, businessId, userId } = parsed.data;

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

  // Build the variables for BusinessAccountPermissionTasksForUserModalMutation
  const variables = {
    businessUserID: userId,
    business_account_task_ids: ALL_ADMIN_TASK_IDS,
    isUnifiedSettings: false,
  };

  const params = new URLSearchParams({
    fb_dtsg: fbDtsg,
    lsd: lsd,
    fb_api_caller_class: "RelayModern",
    fb_api_req_friendly_name: "BusinessAccountPermissionTasksForUserModalMutation",
    server_timestamps: "true",
    variables: JSON.stringify(variables),
    doc_id: "26159731410396148",
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
    req.log.info({ status: response.status }, "Meta permissions API response");

    if (!response.ok) {
      res.status(500).json({
        error: `Meta API returned status ${response.status}`,
        raw,
      });
      return;
    }

    let parsed_json: unknown;
    try {
      parsed_json = JSON.parse(raw);
    } catch {
      res.json({ success: true, message: "Permissions granted (non-JSON response)", raw });
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
      message: `All ${ALL_ADMIN_TASK_IDS.length} admin permissions granted to user ${userId}`,
      raw: raw.slice(0, 500),
    });
  } catch (err) {
    req.log.error({ err }, "Error calling Meta permissions API");
    res.status(500).json({ error: "Failed to reach Meta API" });
  }
});

export default router;
