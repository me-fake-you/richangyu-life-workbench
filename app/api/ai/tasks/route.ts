import { waitUntil } from "cloudflare:workers";
import {
  buildAiTransparency,
  processAiTask,
} from "../../../../lib/ai-analysis";
import { ensureAdvancedSchema } from "../../../../lib/advanced-store";
import { getLifeBindings, safeJson } from "../../../../lib/life-store";

function text(value: unknown, max = 5000) {
  return String(value ?? "").trim().slice(0, max);
}

type TaskRow = {
  id: string;
  mode: string;
  prompt: string;
  start_at: string | null;
  end_at: string | null;
  status: string;
  answer: string;
  provider: string;
  model: string;
  source_ids: string;
  error: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

function databaseIso(value: string | null) {
  if (!value) return null;
  const normalized =
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
      ? `${value.replace(" ", "T")}Z`
      : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

function taskPayload(row: TaskRow) {
  const sourceIds = safeJson<string[]>(row.source_ids, []);
  const startedAt = databaseIso(row.started_at);
  const finishedAt = databaseIso(row.finished_at);
  const createdAt = databaseIso(row.created_at) || row.created_at;
  const startedTime = startedAt ? new Date(startedAt).getTime() : 0;
  const finishedTime = finishedAt ? new Date(finishedAt).getTime() : 0;
  return {
    id: row.id,
    mode: row.mode,
    prompt: row.prompt,
    startAt: row.start_at,
    endAt: row.end_at,
    status: row.status,
    answer: row.answer,
    provider: row.provider,
    model: row.model,
    sourceIds,
    error: row.error,
    createdAt,
    startedAt,
    finishedAt,
    transparency: buildAiTransparency({
      provider: row.provider || "local",
      sourceCount: sourceIds.length,
      inputCharacters: row.prompt.length,
      outputCharacters: row.answer.length,
      durationMs:
        startedTime && finishedTime
          ? Math.max(0, finishedTime - startedTime)
          : null,
      generatedAt: finishedAt || createdAt,
    }),
  };
}

export async function GET(request: Request) {
  try {
    await ensureAdvancedSchema();
    const { DB } = getLifeBindings();
    const id = text(new URL(request.url).searchParams.get("id"), 120);
    if (id) {
      let task = await DB.prepare("SELECT * FROM ai_tasks WHERE id = ?")
        .bind(id)
        .first<TaskRow>();
      if (!task) {
        return Response.json({ error: "没有找到这个智能任务。" }, { status: 404 });
      }
      if (
        task.status === "running" &&
        task.started_at &&
        Date.now() - new Date(task.started_at).getTime() > 150_000
      ) {
        await DB.prepare(
          `UPDATE ai_tasks
           SET status = 'pending', started_at = NULL,
               error = '上次执行超时，已自动重试'
           WHERE id = ? AND status = 'running'`,
        )
          .bind(id)
          .run();
        waitUntil(processAiTask(DB, id));
        task =
          (await DB.prepare("SELECT * FROM ai_tasks WHERE id = ?")
            .bind(id)
            .first<TaskRow>()) || task;
      }
      return Response.json({ task: taskPayload(task) });
    }
    const tasks = await DB.prepare(
      `SELECT * FROM ai_tasks ORDER BY created_at DESC LIMIT 50`,
    ).all<TaskRow>();
    return Response.json({ tasks: tasks.results.map(taskPayload) });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "读取智能任务失败。" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    await ensureAdvancedSchema();
    const { DB } = getLifeBindings();
    const body = (await request.json()) as Record<string, unknown>;
    const id = crypto.randomUUID();
    const mode = text(body.mode, 30) || "question";
    await DB.prepare(
      `INSERT INTO ai_tasks
       (id, mode, prompt, start_at, end_at, status)
       VALUES (?, ?, ?, ?, ?, 'pending')`,
    )
      .bind(
        id,
        mode,
        text(body.prompt, 3000),
        body.startAt ? new Date(String(body.startAt)).toISOString() : null,
        body.endAt ? new Date(String(body.endAt)).toISOString() : null,
      )
      .run();
    waitUntil(processAiTask(DB, id));
    return Response.json({ id, status: "pending" }, { status: 202 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "创建智能任务失败。" },
      { status: 500 },
    );
  }
}

export async function PUT() {
  try {
    await ensureAdvancedSchema();
    const { DB } = getLifeBindings();
    await DB.prepare(
      `UPDATE ai_tasks
       SET status = 'pending', started_at = NULL,
           error = '后台发现执行超时，已自动重试'
       WHERE status = 'running'
         AND started_at < datetime('now', '-3 minutes')`,
    ).run();
    const pending = await DB.prepare(
      `SELECT id FROM ai_tasks
       WHERE status = 'pending' ORDER BY created_at ASC LIMIT 5`,
    ).all<{ id: string }>();
    await Promise.all(
      pending.results.map((task) => processAiTask(DB, task.id)),
    );
    return Response.json({ processed: pending.results.length });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "处理智能队列失败。" },
      { status: 500 },
    );
  }
}
