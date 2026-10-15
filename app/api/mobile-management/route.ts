import { getChatGPTUser } from "../../chatgpt-auth";
import { getLifeBindings } from "../../../lib/life-store";
import { ensureFinanceSchema } from "../../../lib/finance-store";
import { managementOptions, readManagement } from "../../../lib/mobile-management.mjs";
import { MobileActionError } from "../../../lib/mobile-actions.mjs";
export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: {
  "cache-control": "private, no-store", "x-content-type-options": "nosniff",
} });
export async function GET(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) return json({ error: "请重新授权。" }, 401);
    const url = new URL(request.url);
    if (url.pathname !== "/api/mobile-management" || request.headers.get("sec-fetch-site") === "cross-site" ||
        (request.headers.has("origin") && request.headers.get("origin") !== url.origin))
      return json({ error: "只允许工作台同源读取。" }, 403);
    const options = managementOptions(url.searchParams);
    await ensureFinanceSchema();
    return json({ ...await readManagement(getLifeBindings().DB, options), user: { email: user.email } });
  } catch (error) {
    if (error instanceof MobileActionError) return json({ error: error.message }, error.status);
    return json({ error: "未读取成功，不代表没有数据。" }, 503);
  }
}
