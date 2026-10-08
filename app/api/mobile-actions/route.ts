import { getChatGPTUser } from "../../chatgpt-auth";
import { getLifeBindings } from "../../../lib/life-store";
import { ensureFinanceSchema } from "../../../lib/finance-store";
import { ensureAdvancedSchema } from "../../../lib/advanced-store";
import { applyMobileAction, readWorkDashboard, readMobileInput, MobileActionError } from "../../../lib/mobile-actions.mjs";

export const dynamic = "force-dynamic";
const response = (body: unknown, status = 200) => Response.json(body, { status, headers: {
  "cache-control": "private, no-store", "x-content-type-options": "nosniff",
}});
export async function GET() {
  try {
    if (!await getChatGPTUser()) return response({ error: "需要先登录工作台。" }, 401);
    await ensureFinanceSchema();
    return response(await readWorkDashboard(getLifeBindings().DB));
  } catch { return response({ error: "兼职数据读取失败，请稍后重试。" }, 503); }
}
export async function POST(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) return response({ error: "需要重新授权。" }, 401);
    if (request.headers.get("origin") !== new URL(request.url).origin ||
        request.headers.get("sec-fetch-site") === "cross-site") return response({ error: "只允许同源操作。" }, 403);
    const input = await readMobileInput(request);
    await ensureAdvancedSchema(); await ensureFinanceSchema();
    const subject = request.headers.get("oai-authenticated-user-id") || user.email;
    return response(await applyMobileAction(getLifeBindings().DB, subject, input));
  } catch (error) {
    if (error instanceof MobileActionError) return response({ error: error.message }, error.status);
    return response({ error: "没有收到确定的保存结果。请核对原操作，不要新建重复记录。" }, 503);
  }
}
