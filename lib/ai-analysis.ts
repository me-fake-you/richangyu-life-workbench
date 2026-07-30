import { generateProviderText } from "./ai-provider";

type JsonObject = Record<string, unknown>;

export type AiAnalysisInput = {
  mode: string;
  prompt: string;
  startAt?: string | null;
  endAt?: string | null;
};

export type AiAnalysisResult = {
  answer: string;
  provider: string;
  model: string;
  sourceIds: string[];
  range: { startAt: string; endAt: string };
  transparency: AiTransparency;
};

export type AiTransparency = {
  sourceCount: number;
  confidence: number;
  estimatedTokens: number;
  costLabel: string;
  durationMs: number | null;
  fallback: boolean;
  generatedAt: string;
};

export function buildAiTransparency({
  provider,
  sourceCount,
  inputCharacters,
  outputCharacters,
  durationMs,
  generatedAt = new Date().toISOString(),
}: {
  provider: string;
  sourceCount: number;
  inputCharacters: number;
  outputCharacters: number;
  durationMs: number | null;
  generatedAt?: string;
}): AiTransparency {
  const normalizedProvider = provider || "local";
  const fallback = normalizedProvider === "local";
  const evidenceScore = Math.min(0.38, sourceCount * 0.035);
  const confidence = Math.min(
    0.92,
    Math.max(0.28, (fallback ? 0.38 : 0.5) + evidenceScore),
  );
  return {
    sourceCount,
    confidence: Math.round(confidence * 100) / 100,
    estimatedTokens: Math.max(
      1,
      Math.ceil((Math.max(0, inputCharacters) + Math.max(0, outputCharacters)) / 2),
    ),
    costLabel:
      normalizedProvider === "local"
        ? "本地分析 · ¥0"
        : normalizedProvider === "nvidia"
          ? "NVIDIA 免费额度 / 以账户账单为准"
          : "模型平台计费 / 以账户账单为准",
    durationMs,
    fallback,
    generatedAt,
  };
}

function text(value: unknown, max = 8000) {
  return String(value ?? "").trim().slice(0, max);
}

function validIso(value: unknown, fallback: Date) {
  const parsed = new Date(String(value ?? ""));
  return Number.isNaN(parsed.getTime())
    ? fallback.toISOString()
    : parsed.toISOString();
}

function localInsight(
  question: string,
  events: JsonObject[],
  schedules: JsonObject[],
  projects: JsonObject[],
  meals: JsonObject[],
) {
  const words = question
    .toLowerCase()
    .split(/[\s，。！？、,.!?]+/)
    .filter((word) => word.length >= 2);
  const matching = events.filter((event) => {
    const haystack = [
      event.title,
      event.content,
      event.kind,
      event.mood,
      event.person,
      event.place,
      event.project,
      event.tags,
    ]
      .join(" ")
      .toLowerCase();
    return words.some((word) => haystack.includes(word));
  });
  const completed = schedules.filter((item) => item.status === "已完成");
  const actualMinutes = completed.reduce(
    (total, item) => total + (Number(item.actual_minutes) || 0),
    0,
  );
  const calories = meals.reduce(
    (total, item) => total + (Number(item.estimated_calories) || 0),
    0,
  );
  const evidence = (matching.length ? matching : events)
    .slice(0, 8)
    .map((event) => {
      const date = new Date(String(event.happened_at));
      const label = Number.isNaN(date.getTime())
        ? ""
        : `${date.getMonth() + 1}月${date.getDate()}日`;
      return `• ${label} ${text(event.title || event.content, 90)}`;
    })
    .join("\n");
  return [
    question
      ? `我在现有记录中找到 ${matching.length} 条与问题相关的内容。`
      : `这段时间共有 ${events.length} 条生活记录。`,
    `完成日程 ${completed.length}/${schedules.length} 项，实际投入约 ${
      Math.round((actualMinutes / 60) * 10) / 10
    } 小时；进行中的目标 ${
      projects.filter((item) => item.status === "进行中").length
    } 个。`,
    meals.length
      ? `已记录 ${meals.length} 餐，当前查询范围内估算摄入 ${Math.round(
          calories,
        )} 千卡。`
      : "",
    evidence ? `\n相关原始记录：\n${evidence}` : "\n暂无足够记录形成可靠结论。",
    "\n这是基于站内数据的本地分析；外部模型不可用时仍保留可回溯的本地结果。",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function runAiAnalysis(
  DB: D1Database,
  input: AiAnalysisInput,
): Promise<AiAnalysisResult> {
  const analysisStartedAt = Date.now();
  const mode = text(input.mode, 30) || "question";
  const question = text(input.prompt, 3000);
  const now = new Date();
  const defaultStart = new Date(now);
  defaultStart.setDate(defaultStart.getDate() - (mode === "monthly" ? 30 : 7));
  const startAt = validIso(input.startAt, defaultStart);
  const endAt = validIso(input.endAt, now);
  const [eventsResult, schedulesResult, projectsResult, mealsResult] =
    await DB.batch([
      DB.prepare(
        `SELECT id, title, content, kind, mood, energy, tags, person, place,
                project, happened_at
         FROM life_events
         WHERE deleted_at IS NULL AND is_private = 0
           AND happened_at >= ? AND happened_at <= ?
         ORDER BY happened_at DESC LIMIT 300`,
      ).bind(startAt, endAt),
      DB.prepare(
        `SELECT si.id, se.title, se.category, si.status, si.actual_minutes,
                si.reflection, si.occurrence_start
         FROM schedule_instances si
         JOIN schedule_events se ON se.id = si.schedule_id
         WHERE si.occurrence_start >= ? AND si.occurrence_start <= ?
         ORDER BY si.occurrence_start DESC LIMIT 500`,
      ).bind(startAt, endAt),
      DB.prepare(
        `SELECT id, title, kind, status, progress, description, target_at
         FROM projects ORDER BY updated_at DESC LIMIT 100`,
      ),
      DB.prepare(
        `SELECT id, meal_type, eaten_at, note, estimated_calories,
                protein_g, carbs_g, fat_g
         FROM meals WHERE eaten_at >= ? AND eaten_at <= ?
         ORDER BY eaten_at DESC LIMIT 300`,
      ).bind(startAt, endAt),
    ]);
  const events = eventsResult.results as JsonObject[];
  const schedules = schedulesResult.results as JsonObject[];
  const projects = projectsResult.results as JsonObject[];
  const meals = mealsResult.results as JsonObject[];
  const sourceIds = events.map((event) => String(event.id));
  const local = localInsight(question, events, schedules, projects, meals);
  const context = JSON.stringify(
    { range: { startAt, endAt }, events, schedules, projects, meals },
    null,
    2,
  ).slice(0, 42000);
  const system = [
    "你是“日常屿”个人生活工作台的智能回顾助手。",
    "只根据提供的原始记录回答，不要编造人物、地点、数字或经历。",
    "先给结论，再给证据；指出数据不足和不确定性。",
    "涉及饮食热量时必须说明是估算值，不给医疗诊断。",
    "使用简洁、温和、具体的中文，并尽量给出可回溯的日期或记录标题。",
  ].join("\n");
  const providerPrompt = [
    `任务类型：${mode}`,
    `用户问题：${question || "请总结这段时间的生活、时间投入和饮食结构。"}`,
    `可用数据：${context}`,
  ].join("\n\n");
  let answer = local;
  let provider = "local";
  let model = "本地统计与检索";
  try {
    const generated = await generateProviderText({
      system,
      prompt: providerPrompt,
      signal: AbortSignal.timeout(100_000),
      maxTokens: 1200,
    });
    if (generated?.text) {
      answer = generated.text;
      provider = generated.provider;
      model = generated.model;
    }
  } catch (error) {
    answer = `${local}\n\n模型调用未成功：${
      error instanceof Error ? error.message : "未知错误"
    }`;
  }
  if (mode !== "question") {
    const kind =
      mode === "weekly"
        ? "AI周报"
        : mode === "monthly"
          ? "AI月报"
          : "AI专题";
    await DB.prepare(
      `INSERT INTO generated_summaries
       (id, kind, period_start, period_end, title, content, source_ids,
        generated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(kind, period_start, period_end) DO UPDATE SET
         title = excluded.title,
         content = excluded.content,
         source_ids = excluded.source_ids,
         generated_by = excluded.generated_by,
         updated_at = CURRENT_TIMESTAMP`,
    )
      .bind(
        crypto.randomUUID(),
        kind,
        startAt,
        endAt,
        question ||
          `${kind} · ${new Date(endAt).toLocaleDateString("zh-CN")}`,
        answer,
        JSON.stringify(sourceIds),
        `${provider}:${model}`,
      )
      .run();
  }
  return {
    answer,
    provider,
    model,
    sourceIds,
    range: { startAt, endAt },
    transparency: buildAiTransparency({
      provider,
      sourceCount: sourceIds.length,
      inputCharacters: providerPrompt.length,
      outputCharacters: answer.length,
      durationMs: Date.now() - analysisStartedAt,
    }),
  };
}

export async function processAiTask(DB: D1Database, id: string) {
  const claimed = await DB.prepare(
    `UPDATE ai_tasks
     SET status = 'running', started_at = CURRENT_TIMESTAMP, error = ''
     WHERE id = ? AND status = 'pending'`,
  )
    .bind(id)
    .run();
  if ((claimed.meta.changes ?? 0) === 0) return;
  const task = await DB.prepare(
    `SELECT id, mode, prompt, start_at, end_at FROM ai_tasks WHERE id = ?`,
  )
    .bind(id)
    .first<{
      id: string;
      mode: string;
      prompt: string;
      start_at: string | null;
      end_at: string | null;
    }>();
  if (!task) return;
  try {
    const result = await runAiAnalysis(DB, {
      mode: task.mode,
      prompt: task.prompt,
      startAt: task.start_at,
      endAt: task.end_at,
    });
    await DB.prepare(
      `UPDATE ai_tasks SET
         status = 'succeeded', answer = ?, provider = ?, model = ?,
         source_ids = ?, finished_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
      .bind(
        result.answer,
        result.provider,
        result.model,
        JSON.stringify(result.sourceIds),
        id,
      )
      .run();
  } catch (error) {
    await DB.prepare(
      `UPDATE ai_tasks SET
         status = 'failed', error = ?, finished_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
      .bind(error instanceof Error ? error.message.slice(0, 2000) : "智能任务失败", id)
      .run();
  }
}
