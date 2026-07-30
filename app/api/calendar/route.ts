import {
  ensureAdvancedSchema,
  materializeScheduleInstances,
} from "../../../lib/advanced-store";
import { getLifeBindings } from "../../../lib/life-store";

type CalendarRow = {
  id: string;
  title: string;
  category: string;
  start_at: string;
  end_at: string;
  place: string;
  person: string;
  project: string;
  note: string;
  repeat_rule: string;
  repeat_until: string | null;
  custom_interval: number | null;
  custom_unit: string | null;
  weekdays: string | null;
};

function icsText(value: unknown) {
  return String(value ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll("\r\n", "\\n")
    .replaceAll("\n", "\\n")
    .replaceAll(",", "\\,")
    .replaceAll(";", "\\;");
}

function unescapeIcs(value: string) {
  return value
    .replaceAll("\\n", "\n")
    .replaceAll("\\N", "\n")
    .replaceAll("\\,", ",")
    .replaceAll("\\;", ";")
    .replaceAll("\\\\", "\\");
}

function icsDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date
        .toISOString()
        .replaceAll("-", "")
        .replaceAll(":", "")
        .replace(/\.\d{3}Z$/, "Z");
}

function parseIcsDate(value: string) {
  const raw = value.trim();
  const match = raw.match(
    /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?)?(Z)?$/,
  );
  if (!match) {
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const [, year, month, day, hour = "00", minute = "00", second = "00", utc] =
    match;
  const parsed = utc
    ? new Date(
        Date.UTC(
          Number(year),
          Number(month) - 1,
          Number(day),
          Number(hour),
          Number(minute),
          Number(second),
        ),
      )
    : new Date(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
        Number(second),
      );
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const dayCodes = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

function exportRule(row: CalendarRow) {
  const rule = row.repeat_rule;
  if (!rule || rule === "不重复") return "";
  const pieces: string[] = [];
  if (rule === "每天") pieces.push("FREQ=DAILY");
  else if (rule === "每月") pieces.push("FREQ=MONTHLY");
  else if (rule === "工作日") {
    pieces.push("FREQ=WEEKLY", "BYDAY=MO,TU,WE,TH,FR");
  } else if (rule === "单周" || rule === "双周") {
    pieces.push("FREQ=WEEKLY", "INTERVAL=2");
  } else if (rule === "自定义") {
    const unit =
      row.custom_unit === "day"
        ? "DAILY"
        : row.custom_unit === "month"
          ? "MONTHLY"
          : "WEEKLY";
    pieces.push(
      `FREQ=${unit}`,
      `INTERVAL=${Math.max(1, Number(row.custom_interval) || 1)}`,
    );
  } else {
    pieces.push("FREQ=WEEKLY");
  }
  try {
    const weekdays = JSON.parse(row.weekdays || "[]") as number[];
    const values = weekdays
      .map((day) => dayCodes[Number(day)])
      .filter(Boolean);
    if (values.length && !pieces.some((piece) => piece.startsWith("BYDAY"))) {
      pieces.push(`BYDAY=${values.join(",")}`);
    }
  } catch {
    // A malformed optional weekday list should not block the whole export.
  }
  if (row.repeat_until) pieces.push(`UNTIL=${icsDate(row.repeat_until)}`);
  return pieces.length ? `RRULE:${pieces.join(";")}` : "";
}

function readProperty(lines: string[], name: string) {
  const line = lines.find((item) =>
    item.slice(0, item.indexOf(":")).split(";")[0].toUpperCase() === name,
  );
  return line ? line.slice(line.indexOf(":") + 1) : "";
}

function parseRule(raw: string) {
  const values = Object.fromEntries(
    raw
      .split(";")
      .map((part) => part.split("="))
      .filter((part) => part.length === 2)
      .map(([key, value]) => [key.toUpperCase(), value]),
  );
  let repeatRule = "不重复";
  if (values.FREQ === "DAILY") repeatRule = "每天";
  if (values.FREQ === "WEEKLY") repeatRule = "每周";
  if (values.FREQ === "MONTHLY") repeatRule = "每月";
  if (values.BYDAY === "MO,TU,WE,TH,FR") repeatRule = "工作日";
  if (values.INTERVAL && Number(values.INTERVAL) > 1) repeatRule = "自定义";
  const weekdays = String(values.BYDAY ?? "")
    .split(",")
    .map((code) => dayCodes.indexOf(code.replace(/[^A-Z]/g, "")))
    .filter((day) => day >= 0);
  return {
    repeatRule,
    repeatUntil: values.UNTIL
      ? parseIcsDate(values.UNTIL)?.toISOString() ?? null
      : null,
    customInterval: Math.max(1, Number(values.INTERVAL) || 1),
    customUnit:
      values.FREQ === "DAILY"
        ? "day"
        : values.FREQ === "MONTHLY"
          ? "month"
          : "week",
    weekdays,
  };
}

export async function GET() {
  try {
    await ensureAdvancedSchema();
    const { DB } = getLifeBindings();
    const result = await DB.prepare(
      `SELECT se.id, se.title, se.category, se.start_at, se.end_at,
              se.place, se.person, se.project, se.note, se.repeat_rule,
              srs.repeat_until, srs.custom_interval, srs.custom_unit,
              srs.weekdays
       FROM schedule_events se
       LEFT JOIN schedule_rule_settings srs ON srs.schedule_id = se.id
       ORDER BY se.start_at ASC`,
    ).all<CalendarRow>();
    const now = icsDate(new Date().toISOString());
    const events = result.results.flatMap((row) => {
      const rule = exportRule(row);
      return [
        "BEGIN:VEVENT",
        `UID:${icsText(row.id)}@richangyu`,
        `DTSTAMP:${now}`,
        `DTSTART:${icsDate(row.start_at)}`,
        `DTEND:${icsDate(row.end_at)}`,
        `SUMMARY:${icsText(row.title)}`,
        `CATEGORIES:${icsText(row.category)}`,
        row.place ? `LOCATION:${icsText(row.place)}` : "",
        row.note ? `DESCRIPTION:${icsText(row.note)}` : "",
        rule,
        `X-RICHANGYU-PROJECT:${icsText(row.project)}`,
        `X-RICHANGYU-PERSON:${icsText(row.person)}`,
        "END:VEVENT",
      ].filter(Boolean);
    });
    const calendar = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//日常屿//生活时间表//ZH-CN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      ...events,
      "END:VCALENDAR",
      "",
    ].join("\r\n");
    return new Response(calendar, {
      headers: {
        "content-type": "text/calendar; charset=utf-8",
        "content-disposition": `attachment; filename="richangyu-calendar-${new Date()
          .toISOString()
          .slice(0, 10)}.ics"`,
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "日历导出失败。" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    await ensureAdvancedSchema();
    const { DB } = getLifeBindings();
    const form = await request.formData();
    const file = form.get("calendar");
    if (!(file instanceof File) || file.size === 0) {
      return Response.json({ error: "请选择 .ics 日历文件。" }, { status: 400 });
    }
    if (file.size > 5 * 1024 * 1024) {
      return Response.json({ error: "日历文件不能超过 5MB。" }, { status: 400 });
    }
    const unfolded = (await file.text()).replace(/\r?\n[ \t]/g, "");
    const blocks = unfolded.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) ?? [];
    let imported = 0;
    let skipped = 0;
    for (const block of blocks.slice(0, 2000)) {
      const lines = block.split(/\r?\n/);
      const title = unescapeIcs(readProperty(lines, "SUMMARY")).slice(0, 200);
      const start = parseIcsDate(readProperty(lines, "DTSTART"));
      const end = parseIcsDate(readProperty(lines, "DTEND"));
      if (!title || !start) {
        skipped += 1;
        continue;
      }
      const endAt =
        end && end > start
          ? end
          : new Date(start.getTime() + 60 * 60 * 1000);
      const id = crypto.randomUUID();
      const recurrence = parseRule(readProperty(lines, "RRULE"));
      await DB.batch([
        DB.prepare(
          `INSERT INTO schedule_events
           (id, title, category, start_at, end_at, place, person, project,
            note, repeat_rule, status, planned_minutes, actual_minutes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '计划中', ?, 0)`,
        ).bind(
          id,
          title,
          unescapeIcs(readProperty(lines, "CATEGORIES")).slice(0, 30) ||
            "日程",
          start.toISOString(),
          endAt.toISOString(),
          unescapeIcs(readProperty(lines, "LOCATION")).slice(0, 200),
          unescapeIcs(readProperty(lines, "X-RICHANGYU-PERSON")).slice(0, 200),
          unescapeIcs(readProperty(lines, "X-RICHANGYU-PROJECT")).slice(0, 200),
          unescapeIcs(readProperty(lines, "DESCRIPTION")).slice(0, 2000),
          recurrence.repeatRule,
          Math.max(1, Math.round((endAt.getTime() - start.getTime()) / 60000)),
        ),
        DB.prepare(
          `INSERT INTO schedule_rule_settings
           (schedule_id, repeat_until, reminder_minutes, custom_interval,
            custom_unit, weekdays)
           VALUES (?, ?, 10, ?, ?, ?)`,
        ).bind(
          id,
          recurrence.repeatUntil,
          recurrence.customInterval,
          recurrence.customUnit,
          JSON.stringify(recurrence.weekdays),
        ),
      ]);
      imported += 1;
    }
    if (imported > 0) await materializeScheduleInstances();
    return Response.json({ imported, skipped });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "日历导入失败。" },
      { status: 500 },
    );
  }
}
