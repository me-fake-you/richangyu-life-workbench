import { getChatGPTUser } from "../../chatgpt-auth";
import { getLifeBindings } from "../../../lib/life-store";
import { ensureAdvancedSchema } from "../../../lib/advanced-store";
import { applyMobileAction, readMobileInput, MobileActionError } from "../../../lib/mobile-actions.mjs";

export const dynamic = "force-dynamic";
const response = (body: unknown, status = 200) => Response.json(body, { status, headers: {
  "cache-control": "private, no-store", "x-content-type-options": "nosniff",
} });
export async function POST(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) return response({ error: "需要重新授权。" }, 401);
    const url = new URL(request.url);
    if (url.pathname !== "/api/mobile-task-actions" || url.search || url.hash ||
        request.headers.get("origin") !== url.origin || request.headers.get("sec-fetch-site") === "cross-site")
      return response({ error: "只允许工作台同源任务操作。" }, 403);
    const input = await readMobileInput(request);
    if (!input || typeof input !== "object" || Array.isArray(input) ||
        Object.keys(input).some(key => !["requestId", "action", "payload", "expectedAccount"].includes(key)))
      return response({ error: "任务提交字段无效。" }, 422);
    if (typeof input.expectedAccount !== "string" || input.expectedAccount.length > 320 ||
        input.expectedAccount !== user.email) return response({ error: "账号已变化，请重新读取任务。" }, 409);
    if (!["task.create", "task.update", "task.complete", "task.status", "task.discard"].includes(input.action))
      return response({ error: "不支持这个任务操作。" }, 400);
    await ensureAdvancedSchema();
    const subject = request.headers.get("oai-authenticated-user-id") || user.email;
    const command = { requestId: input.requestId, action: input.action, payload: input.payload };
    const result = await applyMobileAction(getLifeBindings().DB, subject, command, Date.now(), { allowTasks: true });
    return response({ ...result, user: { email: user.email } });
  } catch (error) {
    if (error instanceof MobileActionError) return response({ error: error.message }, error.status);
    return response({ error: "任务保存结果尚不确定。请核对或重试同一笔提交，不要重新创建。" }, 503);
  }
}
