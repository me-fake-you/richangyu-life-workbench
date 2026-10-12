import { getChatGPTUser } from "../../chatgpt-auth";
import { ensureAdvancedSchema } from "../../../lib/advanced-store";
import { getLifeBindings } from "../../../lib/life-store";
import { mobileTasksQuery, readMobileTasks, MobileTasksError } from "../../../lib/mobile-tasks.mjs";

export const dynamic = "force-dynamic";
const response = (body: unknown, status = 200) => Response.json(body, { status, headers: {
  "cache-control": "private, no-store", "x-content-type-options": "nosniff",
} });
export async function GET(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) return response({ error: "需要先登录工作台。" }, 401);
    mobileTasksQuery(request.url);
    await ensureAdvancedSchema();
    return response(await readMobileTasks(getLifeBindings().DB, user.email));
  } catch (error) {
    if (error instanceof MobileTasksError) return response({ error: error.message }, error.status);
    return response({ error: "任务读取失败。未读取成功不代表没有任务，请稍后重试。" }, 503);
  }
}
