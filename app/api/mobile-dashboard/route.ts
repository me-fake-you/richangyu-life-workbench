import { getChatGPTUser } from "../../chatgpt-auth";
import { getLifeBindings } from "../../../lib/life-store";
import { ensureFinanceSchema } from "../../../lib/finance-store";
import { dashboardOptions, readMobileDashboard, DashboardError } from "../../../lib/mobile-dashboard.mjs";

export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: {
  "cache-control": "private, no-store", "x-content-type-options": "nosniff",
} });
export async function GET(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) return json({ error: "请重新授权工作台。" }, 401);
    const url = new URL(request.url);
    if (url.pathname !== "/api/mobile-dashboard" || request.headers.get("sec-fetch-site") === "cross-site" ||
        (request.headers.has("origin") && request.headers.get("origin") !== url.origin))
      return json({ error: "只允许工作台同源读取。" }, 403);
    const options = dashboardOptions(url.searchParams);
    await ensureFinanceSchema();
    const data = await readMobileDashboard(getLifeBindings().DB, options);
    return json({ ...data, user: { email: user.email } });
  } catch (error) {
    if (error instanceof DashboardError) return json({ error: error.message }, error.status);
    return json({ error: "数据未读取成功，不代表没有数据。请稍后重试。" }, 503);
  }
}
