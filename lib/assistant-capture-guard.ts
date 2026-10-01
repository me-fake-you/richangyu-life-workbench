import { converseAssistant as converseUnchecked } from "./assistant-capture";
import type { CapturePreview } from "./assistant-capture-types";
import { GroqError } from "./groq-ai";

export { applyCapture } from "./assistant-capture";

type ConversationOptions = Parameters<typeof converseUnchecked>[0];
type ConversationResult = Awaited<ReturnType<typeof converseUnchecked>>;
type CalendarRequest = { day: string | null; prompt: string; source: string };

const DAY = 86400000;
const offsets: Record<string, number> = {
  "大前天": -3, "前天": -2, "昨天": -1, "昨日": -1,
  "今天": 0, "今日": 0, "明天": 1, "明日": 1,
  "后天": 2, "后日": 2, "大后天": 3,
};
const relativeDays = /大前天|大后天|前天|昨天|昨日|今天|今日|明天|明日|后天|后日/g;

function beijingDay(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const value = (key: string) => parts.find((part) => part.type === key)?.value || "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function shiftDay(day: string, offset: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + offset * DAY).toISOString().slice(0, 10);
}

function readableDay(day: string): string {
  const [year, month, date] = day.split("-");
  return `${year}年${Number(month)}月${Number(date)}日`;
}

function explicitDays(text: string): string[] {
  return [...text.matchAll(/(\d{4})\s*(?:年|[-/])\s*(\d{1,2})\s*(?:月|[-/])\s*(\d{1,2})(?:日|号)?/g)]
    .map((match) => `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`)
    .filter((day) => {
      const date = new Date(`${day}T00:00:00Z`);
      return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day;
    });
}

function mentionedDays(text: string, today: string): string[] {
  return [...new Set([
    ...explicitDays(text),
    ...[...text.matchAll(relativeDays)].map((match) => shiftDay(today, offsets[match[0]])),
  ])];
}

export function prepareCalendarRequest(question: string, source = "", now = new Date()): CalendarRequest {
  const today = beijingDay(now);
  const normalize = (text: string) => text.replace(relativeDays, (word) => readableDay(shiftDay(today, offsets[word])));
  const latest = mentionedDays(question, today);
  const candidates = latest.length ? latest : mentionedDays(source, today);
  // A multi-day request must not be constrained to one arbitrarily selected day.
  const multipleDays = /每天|每日|天天|每周|每月|一周|整周|这几天|今明|今后|未来|接下来|连续|为期|(?:安排|计划).{0,8}[一二三四五六七八九十\d]+\s*(?:天|周)/.test(`${source}\n${question}`);
  return {
    day: !multipleDays && candidates.length === 1 ? candidates[0] : null,
    prompt: normalize(question), source: normalize(source),
  };
}

function timestampDay(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? beijingDay(date) : null;
}

export function assertCalendarDraft(draft: Record<string, unknown>, calendar: CalendarRequest): void {
  if (!calendar.day || !Array.isArray(draft.operations)) return;
  const nextDay = shiftDay(calendar.day, 1);
  for (const value of draft.operations) {
    const operation = value && typeof value === "object" ? value as Record<string, unknown> : {};
    const start = timestampDay(operation.startAt);
    const end = timestampDay(operation.endAt);
    if (start !== calendar.day || (end !== calendar.day && end !== nextDay)) {
      throw new GroqError(`你指定的是${readableDay(calendar.day)}，但 AI 生成的日期不一致，已拦截；尚未保存。请重新生成或填写明确日期。`, 422);
    }
  }
}

function captureOf(result: ConversationResult): CapturePreview | null {
  return (result as { capture?: CapturePreview | null }).capture || null;
}

function previewMatchesDay(capture: CapturePreview, day: string): boolean {
  const label = capture.kind === "schedule" ? "北京时间" : "发生时间";
  const fields = capture.fields.filter((field) => field.label === label);
  if (!fields.length) return false;
  return fields.every((field) => {
    const dates = explicitDays(field.value);
    if (!dates.length || dates[0] !== day) return false;
    if (capture.kind !== "schedule") return dates.every((date) => date === day);
    const nextDay = shiftDay(day, 1);
    return dates.slice(1).every((date) => date === day || date === nextDay);
  });
}

function previewResult(result: ConversationResult, capture: CapturePreview) {
  const label = capture.kind === "schedule" ? "日程" : capture.kind === "life" ? "生活记录" : "兼职收入或待收款";
  return {
    ...result,
    reply: `已整理成${label}预览，尚未保存。请核对下面的内容，点击“确认添加到工作台”后才会写入。`,
    capture: { ...capture, title: `${label}预览，确认后才保存` },
  };
}

function blockedDate(result: ConversationResult, options: ConversationOptions, day: string) {
  return {
    ...result, capture: null,
    pendingSource: [options.source, options.question].filter(Boolean).join("\n").slice(-1200),
    reply: `你说的是${readableDay(day)}，但刚才生成的日期不一致，已拦截，没有保存任何记录。请确认这个日期，并补充开始和结束时间；如果只是记下已完成的事，也可以告诉我。`,
  };
}

export async function converseAssistant(options: ConversationOptions) {
  const calendar = prepareCalendarRequest(options.question, options.source);
  const result = await converseUnchecked(options);
  const capture = captureOf(result);
  if (!capture) return result;
  if (!calendar.day || previewMatchesDay(capture, calendar.day)) return previewResult(result, capture);

  // Retry only a mismatched schedule, once, with explicit dates. No paid fallback.
  // Life/finance records retain the user's original wording and are never rewritten.
  if (capture.kind === "schedule" && !options.signal?.aborted) {
    const repaired = await converseUnchecked({ ...options, question: calendar.prompt, source: calendar.source });
    const repairedCapture = captureOf(repaired);
    if (repairedCapture?.kind === "schedule" && previewMatchesDay(repairedCapture, calendar.day)) {
      return previewResult(repaired, repairedCapture);
    }
  }
  return blockedDate(result, options, calendar.day);
}
