import { getChatGPTUser } from "../../chatgpt-auth";
import { getLifeBindings } from "../../../lib/life-store";
import { ensureFinanceSchema } from "../../../lib/finance-store";
import { readMobileInput, MobileActionError } from "../../../lib/mobile-actions.mjs";
import { applyLedgerAction } from "../../../lib/mobile-ledger-actions.mjs";

export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: {
  "cache-control": "private, no-store", "x-content-type-options": "nosniff",
} });
export async function POST(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) return json({ error: "请重新授权工作台。" }, 401);
    const url = new URL(request.url);
    if (url.pathname !== "/api/mobile-ledger-actions" || url.search || url.hash ||
        request.headers.get("origin") !== url.origin || request.headers.get("sec-fetch-site") === "cross-site")
      return json({ error: "只允许工作台同源记账。" }, 403);
    const input = await readMobileInput(request);
    if (!input || typeof input !== "object" || Array.isArray(input) ||
        Object.keys(input).some(key => !["requestId", "action", "payload", "expectedAccount"].includes(key)))
      return json({ error: "账本提交字段无效。" }, 422);
    if (typeof input.expectedAccount !== "string" || input.expectedAccount !== user.email)
      return json({ error: "账号已变化，请重新读取账本。" }, 409);
    await ensureFinanceSchema();
    const result = await applyLedgerAction(getLifeBindings().DB, user.email, {
      requestId: input.requestId, action: input.action, payload: input.payload,
    });
    return json({ ...result, user: { email: user.email } });
  } catch (error) {
    if (error instanceof MobileActionError) return json({ error: error.message }, error.status);
    return json({ error: "记账结果尚不确定，请核对原提交，不要重新记一笔。" }, 503);
  }
}
