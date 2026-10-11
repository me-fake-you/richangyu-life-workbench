import { getChatGPTUser } from "../../chatgpt-auth";
import { ensureAdvancedSchema } from "../../../lib/advanced-store";
import { getLifeBindings } from "../../../lib/life-store";
import { calendarQuery, readMobileCalendar, MobileCalendarError } from "../../../lib/mobile-calendar.mjs";

export const dynamic = "force-dynamic";
const response = (body: unknown, status = 200) => Response.json(body, { status, headers: {
  "cache-control": "private, no-store", "x-content-type-options": "nosniff",
} });
export async function GET(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) return response({ error: "需要先登录工作台。" }, 401);
    const now = Date.now();
    const query = calendarQuery(request.url, now);
    await ensureAdvancedSchema();
    const subject = request.headers.get("oai-authenticated-user-id") || user.email;
    return response(await readMobileCalendar(getLifeBindings().DB, subject, query, now));
  } catch (error) {
    if (error instanceof MobileCalendarError) return response({ error: error.message }, error.status);
    return response({ error: "日程读取失败。未读取成功不代表没有安排，请稍后重试。" }, 503);
  }
}
