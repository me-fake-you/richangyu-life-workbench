import {
  ensureAdvancedSchema,
  materializeScheduleInstances,
} from "../../../lib/advanced-store";
import { getLifeBindings } from "../../../lib/life-store";

type JsonObject = Record<string, unknown>;

const taskStatuses = new Set([
  "收件箱",
  "下一步",
  "进行中",
  "等待",
  "已完成",
  "已取消",
]);
const priorities = new Set(["P0", "P1", "P2", "P3"]);

function text(value: unknown, max = 5000) {
  return String(value ?? "").trim().slice(0, max);
}

function integer(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Math.round(Number(value));
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : min;
}

function nullableIso(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) throw new Error("日期或时间无效。");
  return parsed.toISOString();
}

function scheduleIso(value: unknown, timezoneOffset: unknown) {
  const raw = text(value, 80);
  const local = raw.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/,
  );
  if (local) {
    const offset = Math.max(-840, Math.min(840, Number(timezoneOffset) || 0));
    return new Date(
      Date.UTC(
        Number(local[1]),
        Number(local[2]) - 1,
        Number(local[3]),
        Number(local[4]),
        Number(local[5]),
        Number(local[6] || 0),
      ) + offset * 60_000,
    ).toISOString();
  }
  const parsed = new Date(raw);
  if (!raw || Number.isNaN(parsed.getTime())) throw new Error("安排时间无效。");
  return parsed.toISOString();
}

function has(payload: JsonObject, key: string) {
  return Object.prototype.hasOwnProperty.call(payload, key);
}

export async function GET() {
  try {
    await ensureAdvancedSchema();
    const { DB } = getLifeBindings();
    const [tasksResult, projectsResult, sessionsResult] = await DB.batch([
      DB.prepare(
        `SELECT t.id, t.parent_id, t.project_id, t.title, t.description,
                t.status, t.priority, t.due_at, t.planned_minutes,
                t.actual_minutes, t.estimated_pomodoros,
                t.completed_pomodoros, t.today_rank, t.completed_at,
                t.created_at, t.updated_at, p.title AS project_title,
                (SELECT COUNT(*) FROM tasks child WHERE child.parent_id = t.id) AS subtask_count,
                (SELECT COUNT(*) FROM tasks child
                 WHERE child.parent_id = t.id AND child.status = '已完成') AS completed_subtask_count,
                tsl.schedule_id, se.start_at AS scheduled_start_at,
                se.end_at AS scheduled_end_at
         FROM tasks t
         LEFT JOIN projects p ON p.id = t.project_id
         LEFT JOIN task_schedule_links tsl ON tsl.task_id = t.id
         LEFT JOIN schedule_events se ON se.id = tsl.schedule_id
         ORDER BY
           CASE WHEN t.today_rank IS NULL THEN 1 ELSE 0 END,
           t.today_rank ASC,
           CASE t.priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 ELSE 3 END,
           CASE WHEN t.due_at IS NULL THEN 1 ELSE 0 END,
           t.due_at ASC, t.created_at DESC`,
      ),
      DB.prepare(
        `SELECT id, title, kind, status, progress, color, target_at
         FROM projects WHERE status != '已取消' ORDER BY updated_at DESC`,
      ),
      DB.prepare(
        `SELECT id, task_id, mode, started_at, ended_at, minutes,
                planned_minutes, completed, note, created_at
         FROM task_focus_sessions
         ORDER BY started_at DESC LIMIT 300`,
      ),
    ]);

    return Response.json({
      tasks: tasksResult.results ?? [],
      projects: projectsResult.results ?? [],
      sessions: sessionsResult.results ?? [],
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "任务读取失败。" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    await ensureAdvancedSchema();
    const { DB } = getLifeBindings();
    const body = (await request.json()) as {
      action?: string;
      payload?: JsonObject;
    };
    const action = text(body.action, 80);
    const payload = body.payload ?? {};

    if (action === "task.create") {
      const id = crypto.randomUUID();
      const title = text(payload.title, 200);
      if (!title) throw new Error("请填写任务标题。");
      const status = taskStatuses.has(text(payload.status, 30))
        ? text(payload.status, 30)
        : "收件箱";
      const priority = priorities.has(text(payload.priority, 10))
        ? text(payload.priority, 10)
        : "P2";
      const todayRank = payload.todayRank ? integer(payload.todayRank, 1, 3) : null;
      const statements = [];
      if (todayRank) {
        statements.push(
          DB.prepare(
            "UPDATE tasks SET today_rank = NULL, updated_at = CURRENT_TIMESTAMP WHERE today_rank = ?",
          ).bind(todayRank),
        );
      }
      statements.push(DB.prepare(
        `INSERT INTO tasks
         (id, parent_id, project_id, title, description, status, priority,
          due_at, planned_minutes, estimated_pomodoros, today_rank)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
          id,
          text(payload.parentId, 80) || null,
          text(payload.projectId, 80) || null,
          title,
          text(payload.description, 5000),
          status,
          priority,
          nullableIso(payload.dueAt),
          integer(payload.plannedMinutes, 1, 14400) || 25,
          integer(payload.estimatedPomodoros, 1, 99) || 1,
          todayRank,
        )
      );
      await DB.batch(statements);
      return Response.json({ id }, { status: 201 });
    }

    if (action === "task.update") {
      const id = text(payload.id, 80);
      const current = await DB.prepare("SELECT * FROM tasks WHERE id = ?")
        .bind(id)
        .first<Record<string, unknown>>();
      if (!current) throw new Error("没有找到这项任务。");
      const nextStatus = has(payload, "status")
        ? text(payload.status, 30)
        : String(current.status);
      const nextPriority = has(payload, "priority")
        ? text(payload.priority, 10)
        : String(current.priority);
      if (!taskStatuses.has(nextStatus)) throw new Error("任务状态无效。");
      if (!priorities.has(nextPriority)) throw new Error("任务优先级无效。");
      const completedAt =
        nextStatus === "已完成"
          ? String(current.completed_at || new Date().toISOString())
          : null;
      const nextTodayRank = has(payload, "todayRank")
        ? payload.todayRank
          ? integer(payload.todayRank, 1, 3)
          : null
        : current.today_rank;
      const statements = [];
      if (has(payload, "todayRank") && nextTodayRank) {
        statements.push(
          DB.prepare(
            "UPDATE tasks SET today_rank = NULL, updated_at = CURRENT_TIMESTAMP WHERE today_rank = ? AND id != ?",
          ).bind(nextTodayRank, id),
        );
      }
      statements.push(DB.prepare(
        `UPDATE tasks SET
           parent_id = ?, project_id = ?, title = ?, description = ?,
           status = ?, priority = ?, due_at = ?, planned_minutes = ?,
           estimated_pomodoros = ?, today_rank = ?, completed_at = ?,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
        .bind(
          has(payload, "parentId")
            ? text(payload.parentId, 80) || null
            : current.parent_id,
          has(payload, "projectId")
            ? text(payload.projectId, 80) || null
            : current.project_id,
          has(payload, "title")
            ? text(payload.title, 200) || "未命名任务"
            : current.title,
          has(payload, "description")
            ? text(payload.description, 5000)
            : current.description,
          nextStatus,
          nextPriority,
          has(payload, "dueAt") ? nullableIso(payload.dueAt) : current.due_at,
          has(payload, "plannedMinutes")
            ? integer(payload.plannedMinutes, 1, 14400)
            : current.planned_minutes,
          has(payload, "estimatedPomodoros")
            ? integer(payload.estimatedPomodoros, 1, 99)
            : current.estimated_pomodoros,
          nextTodayRank,
          completedAt,
          id,
        ));
      await DB.batch(statements);
      return Response.json({ id });
    }

    if (action === "task.top3") {
      const ids = Array.isArray(payload.ids)
        ? payload.ids.map((value) => text(value, 80)).filter(Boolean).slice(0, 3)
        : [];
      const statements = [DB.prepare("UPDATE tasks SET today_rank = NULL")];
      ids.forEach((id, index) => {
        statements.push(
          DB.prepare(
            "UPDATE tasks SET today_rank = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status != '已完成'",
          ).bind(index + 1, id),
        );
      });
      await DB.batch(statements);
      return Response.json({ ids });
    }

    if (action === "task.focus.complete") {
      const taskId = text(payload.taskId, 80);
      const current = await DB.prepare("SELECT id, status FROM tasks WHERE id = ?")
        .bind(taskId)
        .first<{ id: string; status: string }>();
      if (!current) throw new Error("没有找到这项任务。");
      const minutes = integer(payload.minutes, 1, 14400);
      const plannedMinutes = integer(payload.plannedMinutes, 1, 14400) || 25;
      const completed = Boolean(payload.completed);
      const completedPomodoro =
        text(payload.mode, 20) === "pomodoro" && minutes >= plannedMinutes;
      const sessionId = crypto.randomUUID();
      const endedAt = nullableIso(payload.endedAt) || new Date().toISOString();
      const startedAt = nullableIso(payload.startedAt) || endedAt;
      await DB.batch([
        DB.prepare(
          `INSERT INTO task_focus_sessions
           (id, task_id, mode, started_at, ended_at, minutes,
            planned_minutes, completed, note)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          sessionId,
          taskId,
          text(payload.mode, 20) === "pomodoro" ? "pomodoro" : "stopwatch",
          startedAt,
          endedAt,
          minutes,
          plannedMinutes,
          completed ? 1 : 0,
          text(payload.note, 2000),
        ),
        DB.prepare(
          `UPDATE tasks SET actual_minutes = actual_minutes + ?,
             completed_pomodoros = completed_pomodoros + ?,
             status = CASE WHEN ? = 1 THEN '已完成'
                           WHEN status = '收件箱' THEN '进行中' ELSE status END,
             completed_at = CASE WHEN ? = 1 THEN ? ELSE completed_at END,
             today_rank = CASE WHEN ? = 1 THEN NULL ELSE today_rank END,
             updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
        ).bind(
          minutes,
          completedPomodoro ? 1 : 0,
          completed ? 1 : 0,
          completed ? 1 : 0,
          completed ? endedAt : null,
          completed ? 1 : 0,
          taskId,
        ),
      ]);
      return Response.json({ id: sessionId });
    }

    if (action === "task.schedule") {
      const taskId = text(payload.taskId, 80);
      const task = await DB.prepare(
        "SELECT id, title, description, project_id, planned_minutes FROM tasks WHERE id = ?",
      )
        .bind(taskId)
        .first<Record<string, unknown>>();
      if (!task) throw new Error("没有找到这项任务。");
      const startAt = scheduleIso(payload.startAt, payload.timezoneOffset);
      const endAt = scheduleIso(payload.endAt, payload.timezoneOffset);
      if (new Date(endAt) <= new Date(startAt)) {
        throw new Error("结束时间必须晚于开始时间。");
      }
      const scheduleId = crypto.randomUUID();
      const plannedMinutes = Math.max(
        1,
        Math.round((new Date(endAt).getTime() - new Date(startAt).getTime()) / 60000),
      );
      await DB.batch([
        DB.prepare(
          `INSERT INTO schedule_events
           (id, title, category, start_at, end_at, place, person, project,
            note, repeat_rule, status, planned_minutes, actual_minutes)
           VALUES (?, ?, '任务', ?, ?, '', '', '', ?, '不重复', '计划中', ?, 0)`,
        ).bind(scheduleId, task.title, startAt, endAt, task.description, plannedMinutes),
        DB.prepare(
          `INSERT INTO schedule_rule_settings
           (schedule_id, reminder_minutes, custom_interval, custom_unit, weekdays)
           VALUES (?, 10, 1, 'week', '[]')`,
        ).bind(scheduleId),
        DB.prepare(
          "INSERT INTO task_schedule_links (task_id, schedule_id) VALUES (?, ?)",
        ).bind(taskId, scheduleId),
        DB.prepare(
          `UPDATE tasks SET status = CASE WHEN status = '收件箱' THEN '下一步' ELSE status END,
             planned_minutes = ?, due_at = COALESCE(due_at, ?), updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
        ).bind(plannedMinutes, endAt, taskId),
      ]);
      await materializeScheduleInstances();
      return Response.json({ id: scheduleId }, { status: 201 });
    }

    if (action === "task.delete") {
      const id = text(payload.id, 80);
      await DB.prepare("DELETE FROM tasks WHERE id = ?").bind(id).run();
      return new Response(null, { status: 204 });
    }

    return Response.json({ error: "不支持的任务操作。" }, { status: 400 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "任务操作失败。" },
      { status: 400 },
    );
  }
}
