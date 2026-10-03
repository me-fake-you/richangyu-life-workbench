"use client";

import {
  CalendarClock,
  Check,
  ChevronRight,
  Circle,
  Clock3,
  FolderKanban,
  ListChecks,
  Pause,
  Pencil,
  Play,
  Plus,
  Search,
  Sparkles,
  Target,
  TimerReset,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import {
  type FocusClockController,
  focusDisplay,
  focusElapsedMs,
} from "./focus-clock";

type Task = {
  id: string;
  parent_id: string | null;
  project_id: string | null;
  project_title: string | null;
  title: string;
  description: string;
  status: string;
  priority: "P0" | "P1" | "P2" | "P3";
  due_at: string | null;
  planned_minutes: number;
  actual_minutes: number;
  estimated_pomodoros: number;
  completed_pomodoros: number;
  today_rank: number | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  subtask_count: number;
  completed_subtask_count: number;
  schedule_id: string | null;
  scheduled_start_at: string | null;
  scheduled_end_at: string | null;
};

type Project = {
  id: string;
  title: string;
  kind: string;
  status: string;
  progress: number;
  color: string;
  target_at: string | null;
};

type FocusLog = {
  id: string;
  task_id: string;
  mode: "stopwatch" | "pomodoro";
  started_at: string;
  ended_at: string;
  minutes: number;
  planned_minutes: number;
  completed: number;
  note: string;
};

type TaskPayload = {
  tasks: Task[];
  projects: Project[];
  sessions: FocusLog[];
  error?: string;
};

type TaskDraft = {
  id?: string;
  parentId: string;
  title: string;
  description: string;
  status: string;
  priority: Task["priority"];
  dueAt: string;
  plannedMinutes: number;
  estimatedPomodoros: number;
  projectId: string;
  todayRank: string;
};

const emptyDraft: TaskDraft = {
  parentId: "",
  title: "",
  description: "",
  status: "收件箱",
  priority: "P2",
  dueAt: "",
  plannedMinutes: 25,
  estimatedPomodoros: 1,
  projectId: "",
  todayRank: "",
};

const statusColumns = ["收件箱", "下一步", "进行中", "等待", "已完成"];
const formatter = new Intl.DateTimeFormat("zh-CN", {
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function toLocalInput(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function defaultTimeBlock(minutes = 25) {
  const start = new Date();
  start.setMinutes(Math.ceil(start.getMinutes() / 30) * 30, 0, 0);
  const end = new Date(start.getTime() + minutes * 60_000);
  return { startAt: toLocalInput(start.toISOString()), endAt: toLocalInput(end.toISOString()) };
}

function isSameLocalDay(value: string | null, date = new Date()) {
  if (!value) return false;
  const candidate = new Date(value);
  return (
    candidate.getFullYear() === date.getFullYear() &&
    candidate.getMonth() === date.getMonth() &&
    candidate.getDate() === date.getDate()
  );
}

function isOverdue(task: Task) {
  return Boolean(
    task.due_at &&
      task.status !== "已完成" &&
      new Date(task.due_at).getTime() < Date.now() &&
      !isSameLocalDay(task.due_at),
  );
}

export function TaskCenter({
  focusClock,
  onNotice,
  onScheduleReload,
}: {
  focusClock: FocusClockController;
  onNotice: (message: string) => void;
  onScheduleReload: () => Promise<void>;
}) {
  const [data, setData] = useState<TaskPayload>({ tasks: [], projects: [], sessions: [] });
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"today" | "list" | "board" | "stats">("today");
  const [query, setQuery] = useState("");
  const [quickTitle, setQuickTitle] = useState("");
  const [draft, setDraft] = useState<TaskDraft | null>(null);
  const [scheduleTask, setScheduleTask] = useState<Task | null>(null);
  const [scheduleTimes, setScheduleTimes] = useState(() => defaultTimeBlock());
  const [finishTask, setFinishTask] = useState<Task | null>(null);
  const [finishNote, setFinishNote] = useState("");
  const [finishComplete, setFinishComplete] = useState(false);

  async function load() {
    try {
      const response = await fetch("/api/tasks", { cache: "no-store" });
      const payload = (await response.json()) as TaskPayload;
      if (!response.ok) throw new Error(payload.error || "任务读取失败。");
      setData(payload);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "任务读取失败。");
    } finally {
      setLoading(false);
    }
  }

  async function action(actionName: string, payload: Record<string, unknown>) {
    const response = await fetch("/api/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: actionName, payload }),
    });
    const result = response.status === 204 ? {} : ((await response.json()) as { error?: string; id?: string });
    if (!response.ok) throw new Error(result.error || "任务操作失败。");
    return result;
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const session = focusClock.session;
    if (
      session?.targetType === "task" &&
      session.mode === "pomodoro" &&
      session.status === "running" &&
      focusElapsedMs(session, focusClock.now) >= session.durationMinutes * 60_000
    ) {
      const timer = window.setTimeout(() => {
        focusClock.pause();
        const task = data.tasks.find((item) => item.id === session.targetId);
        if (task) {
          setFinishTask(task);
          setFinishComplete(false);
          onNotice("本轮番茄专注已完成，写一句结果再保存投入。");
        }
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [data.tasks, focusClock, onNotice]);

  const activeTasks = data.tasks.filter((task) => task.status !== "已取消");
  const topTasks = activeTasks
    .filter((task) => task.today_rank && task.status !== "已完成")
    .sort((a, b) => Number(a.today_rank) - Number(b.today_rank));
  const todayTasks = activeTasks.filter(
    (task) =>
      task.status !== "已完成" &&
      (Boolean(task.today_rank) ||
        isSameLocalDay(task.due_at) ||
        isOverdue(task) ||
        isSameLocalDay(task.scheduled_start_at)),
  );
  const filteredTasks = activeTasks.filter((task) => {
    const haystack = `${task.title} ${task.description} ${task.project_title ?? ""}`.toLowerCase();
    return haystack.includes(query.toLowerCase());
  });
  const visibleTasks = view === "today" ? todayTasks.filter((task) => filteredTasks.includes(task)) : filteredTasks;
  const weekStart = new Date();
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const weekSessions = data.sessions.filter((session) => new Date(session.started_at) >= weekStart);
  const weekMinutes = weekSessions.reduce((sum, session) => sum + Number(session.minutes), 0);
  const completedThisWeek = activeTasks.filter(
    (task) => task.completed_at && new Date(task.completed_at) >= weekStart,
  ).length;

  async function createQuick(event: FormEvent) {
    event.preventDefault();
    if (!quickTitle.trim()) return;
    try {
      await action("task.create", { title: quickTitle, status: "收件箱" });
      setQuickTitle("");
      await load();
      onNotice("任务已放入收件箱，可稍后补充优先级和时间。");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "任务创建失败。");
    }
  }

  function openEditor(task?: Task, parentId = "") {
    setDraft(
      task
        ? {
            id: task.id,
            parentId: task.parent_id ?? "",
            title: task.title,
            description: task.description,
            status: task.status,
            priority: task.priority,
            dueAt: toLocalInput(task.due_at),
            plannedMinutes: task.planned_minutes,
            estimatedPomodoros: task.estimated_pomodoros,
            projectId: task.project_id ?? "",
            todayRank: task.today_rank ? String(task.today_rank) : "",
          }
        : { ...emptyDraft, parentId },
    );
  }

  async function saveDraft(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    try {
      const payload = {
        ...draft,
        dueAt: draft.dueAt ? new Date(draft.dueAt).toISOString() : null,
        todayRank: draft.todayRank || null,
      };
      await action(draft.id ? "task.update" : "task.create", payload);
      setDraft(null);
      await load();
      onNotice(draft.id ? "任务已更新。" : "任务已创建。");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "任务保存失败。");
    }
  }

  async function updateTask(task: Task, changes: Record<string, unknown>, message: string) {
    try {
      await action("task.update", { id: task.id, ...changes });
      await load();
      onNotice(message);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "任务更新失败。");
    }
  }

  async function toggleTop(task: Task) {
    const current = topTasks.map((item) => item.id).filter((id) => id !== task.id);
    if (!task.today_rank) current.push(task.id);
    try {
      await action("task.top3", { ids: current.slice(0, 3) });
      await load();
      onNotice(task.today_rank ? "已移出今日 Top 3。" : "已加入今日 Top 3。");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Top 3 更新失败。");
    }
  }

  function startFocus(task: Task, mode: "stopwatch" | "pomodoro") {
    const started = focusClock.start({
      targetType: "task",
      targetId: task.id,
      title: task.title,
      mode,
      durationMinutes: task.planned_minutes || 25,
    });
    if (!started) {
      onNotice(`请先完成或放弃“${focusClock.session?.title ?? "当前事项"}”的计时。`);
      return;
    }
    if (task.status === "收件箱" || task.status === "下一步") {
      void updateTask(task, { status: "进行中" }, "已开始专注，任务进入进行中。");
    } else {
      onNotice(mode === "pomodoro" ? "番茄专注已开始。" : "正计时已开始，切页和刷新后仍会继续。");
    }
  }

  function openFinish(task?: Task) {
    const target = task ?? data.tasks.find((item) => item.id === focusClock.session?.targetId);
    if (!target) return;
    focusClock.pause();
    setFinishTask(target);
    setFinishComplete(false);
    setFinishNote("");
  }

  async function saveFocus(event: FormEvent) {
    event.preventDefault();
    const session = focusClock.session;
    if (!finishTask || !session || session.targetType !== "task") return;
    const minutes = Math.max(1, Math.round(focusElapsedMs(session, focusClock.now) / 60_000));
    try {
      await action("task.focus.complete", {
        taskId: finishTask.id,
        mode: session.mode,
        startedAt: session.startedAt,
        endedAt: new Date().toISOString(),
        minutes,
        plannedMinutes: session.durationMinutes,
        completed: finishComplete,
        note: finishNote,
      });
      focusClock.clear();
      setFinishTask(null);
      await load();
      onNotice(`已保存 ${minutes} 分钟真实投入${finishComplete ? "，任务已完成" : ""}。`);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "专注记录保存失败。");
    }
  }

  async function planTask(event: FormEvent) {
    event.preventDefault();
    if (!scheduleTask) return;
    try {
      await action("task.schedule", {
        taskId: scheduleTask.id,
        ...scheduleTimes,
        timezoneOffset: new Date().getTimezoneOffset(),
      });
      setScheduleTask(null);
      await Promise.all([load(), onScheduleReload()]);
      onNotice("任务已进入时间表，计划时长会与真实投入对比。");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "安排任务失败。");
    }
  }

  if (loading) {
    return <div className="task-loading"><TimerReset className="spin" /> 正在整理任务…</div>;
  }

  return (
    <section className="task-center standard-page">
      <div className="page-intro task-intro">
        <div>
          <span className="eyebrow">TASK PLANNER · FOCUS CLOCK</span>
          <h1>把想做的事，变成今天能开始的一步</h1>
          <p>先收集，再排优先级；安排到时间表后，用专注时钟记录真实投入。</p>
        </div>
        <button className="primary-button" onClick={() => openEditor()}><Plus size={17} /> 新建任务</button>
      </div>

      <form className="task-quick-add" onSubmit={createQuick}>
        <Circle size={18} />
        <input
          value={quickTitle}
          onChange={(event) => setQuickTitle(event.target.value)}
          placeholder="先记下脑中的事，按 Enter 放入收件箱…"
          aria-label="快速添加任务"
        />
        <button type="submit">收下</button>
      </form>

      {focusClock.session?.targetType === "task" && (
        <section className="task-focus-dock" aria-live="polite">
          <span className={`task-focus-pulse ${focusClock.session.status}`}><TimerReset size={19} /></span>
          <div>
            <small>{focusClock.session.mode === "pomodoro" ? "本轮番茄" : "正在记录真实投入"}</small>
            <strong>{focusClock.session.title}</strong>
          </div>
          <time>{focusDisplay(focusClock.session, focusClock.now)}</time>
          <button onClick={focusClock.toggle}>
            {focusClock.session.status === "running" ? <Pause size={16} /> : <Play size={16} />}
            {focusClock.session.status === "running" ? "暂停" : "继续"}
          </button>
          <button className="finish" onClick={() => openFinish()}><Check size={16} /> 结束</button>
          <button
            className="abandon"
            aria-label="放弃本次计时"
            onClick={() => {
              if (window.confirm("放弃本次计时？尚未保存的投入不会写入任务。")) focusClock.clear();
            }}
          ><X size={16} /></button>
        </section>
      )}

      <div className="task-tabs-row">
        <div className="task-tabs" role="tablist">
          {([
            ["today", "今天"],
            ["list", "全部"],
            ["board", "看板"],
            ["stats", "复盘"],
          ] as const).map(([id, label]) => (
            <button key={id} className={view === id ? "active" : ""} onClick={() => setView(id)}>{label}</button>
          ))}
        </div>
        <label className="task-search"><Search size={15} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索任务或项目" /></label>
      </div>

      {view === "today" && (
        <>
          <section className="top-three-section">
            <header>
              <div><span className="eyebrow">TODAY&apos;S FOCUS</span><h2>今日三件事</h2></div>
              <small>{topTasks.length}/3 · 少选一点，更容易真正完成</small>
            </header>
            <div className="top-three-grid">
              {[0, 1, 2].map((index) => {
                const task = topTasks[index];
                return task ? (
                  <TaskCard key={task.id} task={task} rank={index + 1} compact onEdit={openEditor} onUpdate={updateTask} onTop={toggleTop} onFocus={startFocus} onPlan={(item) => { setScheduleTask(item); setScheduleTimes(defaultTimeBlock(item.planned_minutes)); }} onSubtask={(item) => openEditor(undefined, item.id)} />
                ) : (
                  <button className="top-three-empty" key={index} onClick={() => openEditor()}><span>{index + 1}</span><Plus size={18} /> 选择一件重要的事</button>
                );
              })}
            </div>
          </section>
          <section className="task-list-section">
            <header><div><h2>今天与逾期</h2><p>截止今天、已安排今天或加入 Top 3 的任务。</p></div><strong>{visibleTasks.length}</strong></header>
            <div className="task-list">
              {visibleTasks.length ? visibleTasks.map((task) => (
                <TaskCard key={task.id} task={task} onEdit={openEditor} onUpdate={updateTask} onTop={toggleTop} onFocus={startFocus} onPlan={(item) => { setScheduleTask(item); setScheduleTimes(defaultTimeBlock(item.planned_minutes)); }} onSubtask={(item) => openEditor(undefined, item.id)} />
              )) : <TaskEmpty onAdd={() => openEditor()} />}
            </div>
          </section>
        </>
      )}

      {view === "list" && (
        <section className="task-list-section">
          <header><div><h2>全部任务</h2><p>从收件箱到完成，状态、截止日期和真实投入都在这里。</p></div><strong>{visibleTasks.length}</strong></header>
          <div className="task-list">
            {visibleTasks.length ? visibleTasks.map((task) => (
              <TaskCard key={task.id} task={task} onEdit={openEditor} onUpdate={updateTask} onTop={toggleTop} onFocus={startFocus} onPlan={(item) => { setScheduleTask(item); setScheduleTimes(defaultTimeBlock(item.planned_minutes)); }} onSubtask={(item) => openEditor(undefined, item.id)} />
            )) : <TaskEmpty onAdd={() => openEditor()} />}
          </div>
        </section>
      )}

      {view === "board" && (
        <div className="task-board">
          {statusColumns.map((status) => {
            const tasks = visibleTasks.filter((task) => task.status === status);
            return (
              <section className={`task-column status-${status}`} key={status}>
                <header><h2>{status}</h2><span>{tasks.length}</span></header>
                <div>{tasks.map((task) => <TaskCard key={task.id} task={task} compact onEdit={openEditor} onUpdate={updateTask} onTop={toggleTop} onFocus={startFocus} onPlan={(item) => { setScheduleTask(item); setScheduleTimes(defaultTimeBlock(item.planned_minutes)); }} onSubtask={(item) => openEditor(undefined, item.id)} />)}</div>
              </section>
            );
          })}
        </div>
      )}

      {view === "stats" && (
        <section className="task-review">
          <div className="task-stat-grid">
            <article><Check /><strong>{completedThisWeek}</strong><span>本周完成</span></article>
            <article><Clock3 /><strong>{weekMinutes}</strong><span>本周专注分钟</span></article>
            <article><TimerReset /><strong>{weekSessions.length}</strong><span>专注轮次</span></article>
            <article><Target /><strong>{activeTasks.filter((task) => isOverdue(task)).length}</strong><span>当前逾期</span></article>
          </div>
          <div className="task-insight-grid">
            <article>
              <span className="eyebrow">PLAN VS ACTUAL</span><h2>计划与真实投入</h2>
              <div className="task-compare-list">
                {activeTasks.filter((task) => task.actual_minutes > 0).slice(0, 8).map((task) => (
                  <div key={task.id}><span>{task.title}</span><i><b style={{ width: `${Math.min(100, task.actual_minutes / Math.max(1, task.planned_minutes) * 100)}%` }} /></i><small>{task.planned_minutes} → {task.actual_minutes} 分钟</small></div>
                ))}
                {!activeTasks.some((task) => task.actual_minutes > 0) && <p>完成第一轮专注后，这里会比较计划时间与真实投入。</p>}
              </div>
            </article>
            <article>
              <span className="eyebrow">WEEKLY RHYTHM</span><h2>本周节奏</h2>
              <p>{weekMinutes ? `本周已经留下 ${weekMinutes} 分钟真实投入，完成 ${completedThisWeek} 项任务。` : "本周还没有专注记录。选择一项任务，先从 25 分钟开始。"}</p>
              <ul>
                <li><TrendingUp size={15} /> 实际投入会从专注时钟自动回写</li>
                <li><CalendarClock size={15} /> 安排到时间表后可比较计划与执行</li>
                <li><Sparkles size={15} /> 每周只复盘偏差，不惩罚中断</li>
              </ul>
            </article>
          </div>
        </section>
      )}

      {draft && (
        <div className="task-modal-layer" role="presentation">
          <button className="task-modal-backdrop" onClick={() => setDraft(null)} aria-label="关闭" />
          <form className="task-editor" onSubmit={saveDraft}>
            <header><div><span className="eyebrow">TASK DETAILS</span><h2>{draft.id ? "编辑任务" : draft.parentId ? "新建子任务" : "新建任务"}</h2></div><button type="button" onClick={() => setDraft(null)}><X /></button></header>
            <label className="task-title-field">标题<input autoFocus value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="例如：完成论文实验结果整理" required /></label>
            <label>说明<textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="下一步要做到什么程度？" /></label>
            <div className="task-editor-grid">
              <label>状态<select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>{statusColumns.map((status) => <option key={status}>{status}</option>)}</select></label>
              <label>优先级<select value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value as Task["priority"] })}><option value="P0">P0 · 紧急重要</option><option value="P1">P1 · 重要</option><option value="P2">P2 · 普通</option><option value="P3">P3 · 有空再做</option></select></label>
              <label>截止时间<input type="datetime-local" value={draft.dueAt} onChange={(e) => setDraft({ ...draft, dueAt: e.target.value })} /></label>
              <label>关联项目<select value={draft.projectId} onChange={(e) => setDraft({ ...draft, projectId: e.target.value })}><option value="">不关联项目</option>{data.projects.map((project) => <option value={project.id} key={project.id}>{project.title}</option>)}</select></label>
              <label>预计分钟<input type="number" min="1" max="14400" value={draft.plannedMinutes} onChange={(e) => setDraft({ ...draft, plannedMinutes: Number(e.target.value) })} /></label>
              <label>预计番茄<input type="number" min="1" max="99" value={draft.estimatedPomodoros} onChange={(e) => setDraft({ ...draft, estimatedPomodoros: Number(e.target.value) })} /></label>
              <label>今日 Top 3<select value={draft.todayRank} onChange={(e) => setDraft({ ...draft, todayRank: e.target.value })}><option value="">暂不加入</option><option value="1">第 1 件事</option><option value="2">第 2 件事</option><option value="3">第 3 件事</option></select></label>
            </div>
            <footer>
              {draft.id && <button type="button" className="danger" onClick={async () => { if (!window.confirm("删除这项任务和它的专注记录？")) return; await action("task.delete", { id: draft.id }); setDraft(null); await load(); }}><Trash2 size={15} /> 删除</button>}
              <span />
              <button type="button" onClick={() => setDraft(null)}>取消</button><button className="primary" type="submit">保存任务</button>
            </footer>
          </form>
        </div>
      )}

      {scheduleTask && (
        <div className="task-modal-layer" role="presentation">
          <button className="task-modal-backdrop" onClick={() => setScheduleTask(null)} aria-label="关闭" />
          <form className="task-plan-modal" onSubmit={planTask}>
            <header><div><span className="eyebrow">TIME BOX</span><h2>安排到时间表</h2><p>{scheduleTask.title}</p></div><button type="button" onClick={() => setScheduleTask(null)}><X /></button></header>
            <label>开始时间<input type="datetime-local" value={scheduleTimes.startAt} onChange={(e) => setScheduleTimes({ ...scheduleTimes, startAt: e.target.value })} required /></label>
            <label>结束时间<input type="datetime-local" value={scheduleTimes.endAt} onChange={(e) => setScheduleTimes({ ...scheduleTimes, endAt: e.target.value })} required /></label>
            <p className="task-plan-tip"><CalendarClock size={16} /> 创建后会出现在时间表；日程完成和任务专注仍分别保留，便于比较计划与实际。</p>
            <footer><button type="button" onClick={() => setScheduleTask(null)}>取消</button><button className="primary" type="submit">加入时间表</button></footer>
          </form>
        </div>
      )}

      {finishTask && focusClock.session?.targetType === "task" && (
        <div className="task-modal-layer" role="presentation">
          <button className="task-modal-backdrop" onClick={() => setFinishTask(null)} aria-label="关闭" />
          <form className="task-finish-modal" onSubmit={saveFocus}>
            <header><div><span className="eyebrow">FOCUS RESULT</span><h2>保存本轮投入</h2><p>{finishTask.title}</p></div><button type="button" onClick={() => setFinishTask(null)}><X /></button></header>
            <div className="task-focus-result"><Clock3 /><strong>{Math.max(1, Math.round(focusElapsedMs(focusClock.session, focusClock.now) / 60_000))}</strong><span>分钟真实投入</span></div>
            <label>本轮结果<textarea value={finishNote} onChange={(e) => setFinishNote(e.target.value)} placeholder="完成了什么？哪里被打断？下一步是什么？" /></label>
            <label className="task-check-row"><input type="checkbox" checked={finishComplete} onChange={(e) => setFinishComplete(e.target.checked)} /><span><strong>同时完成这项任务</strong><small>未勾选时只保存本轮投入，任务保持进行中</small></span></label>
            <footer><button type="button" onClick={() => setFinishTask(null)}>稍后再填</button><button className="primary" type="submit">保存投入</button></footer>
          </form>
        </div>
      )}
    </section>
  );
}

function TaskCard({ task, rank, compact, onEdit, onUpdate, onTop, onFocus, onPlan, onSubtask }: {
  task: Task;
  rank?: number;
  compact?: boolean;
  onEdit: (task?: Task, parentId?: string) => void;
  onUpdate: (task: Task, changes: Record<string, unknown>, message: string) => void;
  onTop: (task: Task) => void;
  onFocus: (task: Task, mode: "stopwatch" | "pomodoro") => void;
  onPlan: (task: Task) => void;
  onSubtask: (task: Task) => void;
}) {
  const completed = task.status === "已完成";
  return (
    <article className={`task-card ${compact ? "compact" : ""} ${completed ? "completed" : ""} priority-${task.priority}`}>
      {rank && <span className="task-rank">{rank}</span>}
      <button className="task-check" onClick={() => void onUpdate(task, { status: completed ? "下一步" : "已完成" }, completed ? "任务已重新打开。" : "任务已完成。")}>{completed ? <Check /> : <Circle />}</button>
      <div className="task-card-main">
        <div className="task-card-title"><h3>{task.title}</h3><span className={`priority ${task.priority}`}>{task.priority}</span></div>
        {task.description && !compact && <p>{task.description}</p>}
        <div className="task-meta">
          {task.project_title && <span><FolderKanban size={13} /> {task.project_title}</span>}
          {task.due_at && <span className={isOverdue(task) ? "overdue" : ""}><CalendarClock size={13} /> {isOverdue(task) ? "逾期 · " : ""}{formatter.format(new Date(task.due_at))}</span>}
          <span><Clock3 size={13} /> {task.actual_minutes}/{task.planned_minutes} 分钟</span>
          {task.subtask_count > 0 && <span><ListChecks size={13} /> {task.completed_subtask_count}/{task.subtask_count} 子任务</span>}
          {task.scheduled_start_at && <span className="scheduled"><CalendarClock size={13} /> 已安排 {formatter.format(new Date(task.scheduled_start_at))}</span>}
        </div>
        {!completed && (
          <div className="task-card-actions">
            <button className="task-primary-action" onClick={() => onFocus(task, "stopwatch")}><Play size={14} /> 正计时</button>
            <button onClick={() => onFocus(task, "pomodoro")}><TimerReset size={14} /> 番茄</button>
            <button onClick={() => onPlan(task)}><CalendarClock size={14} /> 安排</button>
            <button onClick={() => void onTop(task)}><Target size={14} /> {task.today_rank ? "移出 Top 3" : "Top 3"}</button>
            <button onClick={() => onSubtask(task)}><Plus size={14} /> 子任务</button>
          </div>
        )}
      </div>
      <button className="task-edit" onClick={() => onEdit(task)} aria-label={`编辑${task.title}`}><Pencil size={15} /></button>
    </article>
  );
}

function TaskEmpty({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="task-empty"><span><Check size={23} /></span><h3>这里已经清空了</h3><p>先添加一项真正重要的事，或去全部任务整理收件箱。</p><button onClick={onAdd}>添加任务 <ChevronRight size={15} /></button></div>
  );
}
