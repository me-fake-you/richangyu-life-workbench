import { generateProviderText } from "../../../lib/ai-provider";
import { ensureIntelligenceSchema } from "../../../lib/intelligence-store";
import { getLifeBindings } from "../../../lib/life-store";

type JsonObject = Record<string, unknown>;

type ReviewOptions = {
  startDate: string;
  endDate: string;
  timezoneOffset: number;
  includeFinance: boolean;
};

function text(value: unknown, max = 5000) {
  return String(value ?? "").trim().slice(0, max);
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function boolean(value: unknown) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function timezoneOffset(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(-840, Math.min(840, Math.round(parsed)));
}

function dateOnly(value: unknown, fallback = new Date()) {
  const raw = text(value, 40);
  const match = raw.match(/^\d{4}-\d{2}-\d{2}/);
  return match?.[0] ?? fallback.toISOString().slice(0, 10);
}

function boundary(date: string, offset: number, nextDay = false) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(
    Date.UTC(year, month - 1, day + (nextDay ? 1 : 0)) +
      offset * 60000,
  ).toISOString();
}

function localParts(value: unknown, offset: number) {
  const parsed = new Date(String(value ?? ""));
  if (Number.isNaN(parsed.getTime())) {
    return { date: "", month: "", day: "", weekday: -1 };
  }
  const local = new Date(parsed.getTime() - offset * 60000);
  return {
    date: local.toISOString().slice(0, 10),
    month: local.toISOString().slice(0, 7),
    day: local.toISOString().slice(5, 10),
    weekday: local.getUTCDay(),
  };
}

function counts(rows: JsonObject[], key: string) {
  const map = new Map<string, number>();
  for (const row of rows) {
    const value = text(row[key], 100) || "未分类";
    map.set(value, (map.get(value) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count);
}

function parseOptions(source: URLSearchParams | JsonObject): ReviewOptions {
  const get = (key: string) =>
    source instanceof URLSearchParams ? source.get(key) : source[key];
  const now = new Date();
  const defaultStart = `${now.getFullYear()}-01-01`;
  const defaultEnd = `${now.getFullYear()}-12-31`;
  return {
    startDate: dateOnly(get("startDate"), new Date(defaultStart)),
    endDate: dateOnly(get("endDate"), new Date(defaultEnd)),
    timezoneOffset: timezoneOffset(get("timezoneOffset")),
    includeFinance: boolean(get("includeFinance")),
  };
}

async function buildReview(DB: D1Database, options: ReviewOptions) {
  const startAt = boundary(options.startDate, options.timezoneOffset);
  const endAt = boundary(options.endDate, options.timezoneOffset, true);
  const [
    eventResult,
    scheduleResult,
    financeResult,
    workResult,
    mealResult,
    milestoneResult,
    summaryResult,
    projectResult,
    rangeResult,
    pastEventResult,
  ] = await DB.batch([
    DB.prepare(
      `SELECT e.id, e.title, e.content, e.kind, e.mood, e.energy, e.tags,
              e.person, e.place, e.project, e.happened_at,
              (SELECT COUNT(*) FROM media m WHERE m.event_id = e.id) AS photo_count
       FROM life_events e
       WHERE e.deleted_at IS NULL AND e.is_private = 0
         AND e.happened_at >= ? AND e.happened_at < ?
       ORDER BY e.happened_at ASC LIMIT 10000`,
    ).bind(startAt, endAt),
    DB.prepare(
      `SELECT si.id, si.schedule_id, se.title, se.category,
              si.occurrence_start, si.status, se.planned_minutes,
              si.actual_minutes, si.interruption_reason, si.reflection
       FROM schedule_instances si
       JOIN schedule_events se ON se.id = si.schedule_id
       WHERE si.occurrence_start >= ? AND si.occurrence_start < ?
       ORDER BY si.occurrence_start ASC LIMIT 10000`,
    ).bind(startAt, endAt),
    options.includeFinance
      ? DB.prepare(
          `SELECT id, type, amount, category, project, occurred_at
           FROM finance_transactions
           WHERE deleted_at IS NULL
             AND occurred_at >= ? AND occurred_at < ?
           ORDER BY occurred_at ASC LIMIT 10000`,
        ).bind(startAt, endAt)
      : DB.prepare(
          `SELECT id, type, amount, category, project, occurred_at
           FROM finance_transactions WHERE 0 = 1`,
        ),
    DB.prepare(
      `SELECT ws.id, ws.project_id, sp.title AS project_title, ws.started_at,
              ws.minutes, ws.hidden_minutes, ws.expected_income, ws.cost,
              ws.status, ws.feeling
       FROM work_sessions ws
       JOIN side_hustle_projects sp ON sp.id = ws.project_id
       WHERE ws.started_at >= ? AND ws.started_at < ?
       ORDER BY ws.started_at ASC LIMIT 10000`,
    ).bind(startAt, endAt),
    DB.prepare(
      `SELECT id, meal_type, eaten_at, estimated_calories, protein_g,
              carbs_g, fat_g, note
       FROM meals WHERE eaten_at >= ? AND eaten_at < ?
       ORDER BY eaten_at ASC LIMIT 10000`,
    ).bind(startAt, endAt),
    DB.prepare(
      `SELECT id, project_id, title, happened_at, note, completed
       FROM milestones WHERE happened_at >= ? AND happened_at < ?
       ORDER BY happened_at ASC LIMIT 1000`,
    ).bind(startAt, endAt),
    DB.prepare(
      `SELECT id, kind, period_start, period_end, title, content, source_ids,
              generated_by, created_at
       FROM generated_summaries
       WHERE period_end >= ? AND period_start < ?
       ORDER BY period_end DESC LIMIT 200`,
    ).bind(startAt, endAt),
    DB.prepare(
      `SELECT id, title, kind, status, progress, description, start_at,
              target_at, updated_at
       FROM projects ORDER BY updated_at DESC LIMIT 500`,
    ),
    DB.prepare(
      `SELECT
         MIN(happened_at) AS first_event_at,
         MAX(happened_at) AS last_event_at
       FROM life_events
       WHERE deleted_at IS NULL AND is_private = 0`,
    ),
    DB.prepare(
      `SELECT e.id, e.title, e.content, e.kind, e.mood, e.place,
              e.happened_at,
              (SELECT COUNT(*) FROM media m WHERE m.event_id = e.id) AS photo_count
       FROM life_events e
       WHERE e.deleted_at IS NULL AND e.is_private = 0
         AND e.happened_at < ?
       ORDER BY e.happened_at DESC LIMIT 3000`,
    ).bind(startAt),
  ]);

  const events = eventResult.results as JsonObject[];
  const schedules = scheduleResult.results as JsonObject[];
  const transactions = financeResult.results as JsonObject[];
  const workSessions = workResult.results as JsonObject[];
  const meals = mealResult.results as JsonObject[];
  const milestones = milestoneResult.results as JsonObject[];
  const summaries = summaryResult.results as JsonObject[];
  const projects = projectResult.results as JsonObject[];
  const pastEvents = pastEventResult.results as JsonObject[];

  const completedSchedules = schedules.filter(
    (row) => text(row.status, 30) === "已完成" || number(row.actual_minutes) > 0,
  );
  const plannedMinutes = schedules.reduce(
    (sum, row) => sum + number(row.planned_minutes),
    0,
  );
  const actualMinutes = schedules.reduce(
    (sum, row) => sum + number(row.actual_minutes),
    0,
  );
  const photoCount = events.reduce(
    (sum, event) => sum + number(event.photo_count),
    0,
  );
  const activeDays = new Set(
    events
      .map((event) =>
        localParts(event.happened_at, options.timezoneOffset).date,
      )
      .filter(Boolean),
  );
  const places = new Set(events.map((event) => text(event.place)).filter(Boolean));
  const people = new Set(events.map((event) => text(event.person)).filter(Boolean));
  const incomes = transactions.filter(
    (row) => text(row.type, 30).includes("收入"),
  );
  const expenses = transactions.filter(
    (row) => text(row.type, 30).includes("支出"),
  );
  const totalIncome = incomes.reduce((sum, row) => sum + number(row.amount), 0);
  const totalExpense = expenses.reduce((sum, row) => sum + number(row.amount), 0);
  const workMinutes = workSessions.reduce(
    (sum, row) => sum + number(row.minutes) + number(row.hidden_minutes),
    0,
  );
  const expectedIncome = workSessions.reduce(
    (sum, row) => sum + number(row.expected_income),
    0,
  );
  const workCost = workSessions.reduce((sum, row) => sum + number(row.cost), 0);
  const mealCalories = meals.reduce(
    (sum, row) => sum + number(row.estimated_calories),
    0,
  );

  const monthMap = new Map<
    string,
    {
      month: string;
      events: number;
      photos: number;
      plannedMinutes: number;
      actualMinutes: number;
      income: number;
      expense: number;
      workMinutes: number;
      calories: number;
    }
  >();
  function monthBucket(value: unknown) {
    const month = localParts(value, options.timezoneOffset).month;
    if (!month) return null;
    const current = monthMap.get(month) ?? {
      month,
      events: 0,
      photos: 0,
      plannedMinutes: 0,
      actualMinutes: 0,
      income: 0,
      expense: 0,
      workMinutes: 0,
      calories: 0,
    };
    monthMap.set(month, current);
    return current;
  }
  for (const event of events) {
    const bucket = monthBucket(event.happened_at);
    if (bucket) {
      bucket.events += 1;
      bucket.photos += number(event.photo_count);
    }
  }
  for (const schedule of schedules) {
    const bucket = monthBucket(schedule.occurrence_start);
    if (bucket) {
      bucket.plannedMinutes += number(schedule.planned_minutes);
      bucket.actualMinutes += number(schedule.actual_minutes);
    }
  }
  for (const transaction of transactions) {
    const bucket = monthBucket(transaction.occurred_at);
    if (!bucket) continue;
    if (text(transaction.type).includes("收入")) {
      bucket.income += number(transaction.amount);
    }
    if (text(transaction.type).includes("支出")) {
      bucket.expense += number(transaction.amount);
    }
  }
  for (const session of workSessions) {
    const bucket = monthBucket(session.started_at);
    if (bucket) {
      bucket.workMinutes +=
        number(session.minutes) + number(session.hidden_minutes);
    }
  }
  for (const meal of meals) {
    const bucket = monthBucket(meal.eaten_at);
    if (bucket) bucket.calories += number(meal.estimated_calories);
  }

  const monthKeys = new Set([
    ...events.map((row) => localParts(row.happened_at, options.timezoneOffset).month),
    ...schedules.map(
      (row) => localParts(row.occurrence_start, options.timezoneOffset).month,
    ),
  ]);
  const chapters = [...monthKeys]
    .filter(Boolean)
    .sort()
    .map((month) => {
      const monthEvents = events.filter(
        (row) =>
          localParts(row.happened_at, options.timezoneOffset).month === month,
      );
      const topKind = counts(monthEvents, "kind")[0]?.label ?? "生活";
      const topMood = counts(monthEvents, "mood")[0]?.label ?? "平静";
      const topPlace = counts(
        monthEvents.filter((row) => text(row.place)),
        "place",
      )[0]?.label;
      return {
        month,
        title: `${month.slice(5)}月 · ${topKind}成为生活主线`,
        eventCount: monthEvents.length,
        photoCount: monthEvents.reduce(
          (sum, row) => sum + number(row.photo_count),
          0,
        ),
        topKind,
        topMood,
        topPlace: topPlace ?? "",
        sourceIds: monthEvents.slice(0, 100).map((row) => row.id),
      };
    });

  const highlights = [
    ...events
      .map((event) => ({
        id: event.id,
        sourceType: "event",
        title:
          text(event.title, 160) ||
          text(event.content, 160) ||
          `${text(event.kind, 30) || "生活"}记录`,
        note: text(event.content, 280),
        kind: text(event.kind, 30),
        happenedAt: event.happened_at,
        photoCount: number(event.photo_count),
        score:
          number(event.photo_count) * 4 +
          (text(event.title) ? 3 : 0) +
          (text(event.content).length > 80 ? 2 : 0) +
          number(event.energy),
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, 12),
    ...milestones.map((milestone) => ({
      id: milestone.id,
      sourceType: "milestone",
      title: milestone.title,
      note: milestone.note,
      kind: "人生里程碑",
      happenedAt: milestone.happened_at,
      photoCount: 0,
      score: 20,
    })),
  ]
    .sort(
      (left, right) =>
        right.score - left.score ||
        new Date(String(right.happenedAt)).getTime() -
          new Date(String(left.happenedAt)).getTime(),
    )
    .slice(0, 12);

  const currentDay = localParts(new Date(), options.timezoneOffset).day;
  const onThisDay = pastEvents
    .filter(
      (event) =>
        localParts(event.happened_at, options.timezoneOffset).day === currentDay,
    )
    .slice(0, 10)
    .map((event) => ({
      id: event.id,
      title:
        text(event.title, 160) ||
        text(event.content, 160) ||
        "一段往年今日",
      kind: event.kind,
      mood: event.mood,
      place: event.place,
      happenedAt: event.happened_at,
      photoCount: number(event.photo_count),
    }));

  const firstAt = text(
    (rangeResult.results[0] as JsonObject | undefined)?.first_event_at,
    60,
  );
  const lastAt = text(
    (rangeResult.results[0] as JsonObject | undefined)?.last_event_at,
    60,
  );
  const firstYear = firstAt ? new Date(firstAt).getUTCFullYear() : new Date().getFullYear();
  const lastYear = lastAt ? new Date(lastAt).getUTCFullYear() : new Date().getFullYear();
  const years = Array.from(
    { length: Math.max(1, lastYear - firstYear + 1) },
    (_, index) => lastYear - index,
  );
  const domainCounts = counts(events, "kind");
  const moodCounts = counts(events, "mood");
  const placeCounts = counts(
    events.filter((event) => text(event.place)),
    "place",
  );
  const personCounts = counts(
    events.filter((event) => text(event.person)),
    "person",
  );
  const projectCounts = counts(
    events.filter((event) => text(event.project)),
    "project",
  );
  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const weekdayCounts = weekdays.map((label, index) => ({
    label,
    count: events.filter(
      (event) =>
        localParts(event.happened_at, options.timezoneOffset).weekday === index,
    ).length,
  }));
  const trend = [...monthMap.values()].sort((left, right) =>
    left.month.localeCompare(right.month),
  );
  const mostActiveMonth = [...trend].sort(
    (left, right) => right.events - left.events,
  )[0];
  const localNarrative = [
    `从 ${options.startDate} 到 ${options.endDate}，你留下了 ${events.length} 条生活记录，覆盖 ${activeDays.size} 个有记录的日子，并保存了 ${photoCount} 张照片。`,
    domainCounts[0]
      ? `生活重心更多落在“${domainCounts[0].label}”，共 ${domainCounts[0].count} 次。`
      : "这段时间还没有足够的生活分类记录。",
    moodCounts[0]
      ? `最常出现的心情是“${moodCounts[0].label}”。`
      : "",
    mostActiveMonth
      ? `${mostActiveMonth.month} 是记录最密集的月份，共 ${mostActiveMonth.events} 条。`
      : "",
    schedules.length
      ? `计划完成 ${completedSchedules.length}/${schedules.length} 项，实际投入 ${Math.round(actualMinutes / 6) / 10} 小时。`
      : "",
    "所有结论均来自当前范围内的原始记录，可从高光、章节和总结来源继续回看。",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    range: {
      startDate: options.startDate,
      endDate: options.endDate,
      startAt,
      endAt,
    },
    years,
    overview: {
      eventCount: events.length,
      activeDays: activeDays.size,
      photoCount,
      placeCount: places.size,
      personCount: people.size,
      averageEnergy: events.length
        ? events.reduce((sum, event) => sum + number(event.energy), 0) /
          events.length
        : 0,
      plannedMinutes,
      actualMinutes,
      scheduleCount: schedules.length,
      completedSchedules: completedSchedules.length,
      completionRate: schedules.length
        ? Math.round((completedSchedules.length / schedules.length) * 100)
        : 0,
      mealCount: meals.length,
      averageCalories: meals.length ? mealCalories / meals.length : 0,
      workMinutes,
      expectedIncome,
      workCost,
      totalIncome,
      totalExpense,
      net: totalIncome - totalExpense,
      includeFinance: options.includeFinance,
      milestoneCount: milestones.length,
    },
    narrative: localNarrative,
    domains: domainCounts.slice(0, 12),
    moods: moodCounts.slice(0, 12),
    places: placeCounts.slice(0, 12),
    people: personCounts.slice(0, 12),
    projects: projectCounts.slice(0, 12),
    weekdays: weekdayCounts,
    trend,
    chapters,
    highlights,
    onThisDay,
    milestones: milestones.map((row) => ({
      id: row.id,
      projectId: row.project_id,
      title: row.title,
      happenedAt: row.happened_at,
      note: row.note,
      completed: Boolean(row.completed),
    })),
    summaries: summaries.map((row) => ({
      id: row.id,
      kind: row.kind,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      title: row.title,
      content: row.content,
      sourceIds: (() => {
        try {
          return JSON.parse(String(row.source_ids ?? "[]"));
        } catch {
          return [];
        }
      })(),
      generatedBy: row.generated_by,
      createdAt: row.created_at,
    })),
    goals: projects.map((row) => ({
      id: row.id,
      title: row.title,
      kind: row.kind,
      status: row.status,
      progress: number(row.progress),
      targetAt: row.target_at,
    })),
    sourceIds: events.map((event) => event.id),
  };
}

export async function GET(request: Request) {
  try {
    await ensureIntelligenceSchema();
    const { DB } = getLifeBindings();
    const options = parseOptions(new URL(request.url).searchParams);
    const review = await buildReview(DB, options);
    return Response.json(review);
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "读取长期回顾失败。",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    await ensureIntelligenceSchema();
    const { DB } = getLifeBindings();
    const body = (await request.json()) as JsonObject;
    const action = text(body.action, 40);
    if (action === "delete") {
      const id = text(body.id, 80);
      if (!id) {
        return Response.json({ error: "缺少总结编号。" }, { status: 400 });
      }
      await DB.prepare("DELETE FROM generated_summaries WHERE id = ?")
        .bind(id)
        .run();
      return new Response(null, { status: 204 });
    }
    if (action !== "generate") {
      return Response.json({ error: "不支持的回顾操作。" }, { status: 400 });
    }
    const options = parseOptions(body);
    const review = await buildReview(DB, options);
    const kind = text(body.kind, 40) || "自定义回顾";
    const title =
      text(body.title, 160) ||
      `${options.startDate} 至 ${options.endDate} · ${kind}`;
    let content = review.narrative;
    let generatedBy = "local";
    try {
      const generated = await generateProviderText({
        signal: AbortSignal.timeout(45000),
        system: [
          "你是私人生活档案的长期回顾编辑。",
          "只能依据提供的统计、章节和高光来源写作，不得编造经历、人物、地点或数字。",
          "先写一段总览，再写生活重心、计划与实际、值得保留的高光、下一阶段建议。",
          "语气温和克制，不做心理或医学诊断；若数据不足要明确说明。",
          "只输出中文正文。",
        ].join("\n"),
        prompt: JSON.stringify(
          {
            title,
            range: review.range,
            overview: review.overview,
            domains: review.domains,
            moods: review.moods,
            places: review.places,
            trend: review.trend,
            chapters: review.chapters,
            highlights: review.highlights.slice(0, 12),
            goals: review.goals,
          },
          null,
          2,
        ).slice(0, 42000),
      });
      if (generated?.text.trim()) {
        content = generated.text.trim().slice(0, 12000);
        generatedBy = `${generated.provider}:${generated.model}`;
      }
    } catch {
      generatedBy = "local";
    }
    const id = crypto.randomUUID();
    await DB.prepare(
      `INSERT INTO generated_summaries
       (id, kind, period_start, period_end, title, content, source_ids,
        generated_by, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(kind, period_start, period_end) DO UPDATE SET
         title = excluded.title,
         content = excluded.content,
         source_ids = excluded.source_ids,
         generated_by = excluded.generated_by,
         updated_at = CURRENT_TIMESTAMP`,
    )
      .bind(
        id,
        kind,
        review.range.startAt,
        review.range.endAt,
        title,
        content,
        JSON.stringify(review.sourceIds),
        generatedBy,
      )
      .run();
    return Response.json({
      id,
      title,
      content,
      generatedBy,
      sourceIds: review.sourceIds,
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "生成长期回顾失败。",
      },
      { status: 500 },
    );
  }
}
