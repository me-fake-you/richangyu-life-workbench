"use client";

import {
  ArrowDownLeft, ArrowRight, BookOpen, CalendarClock, CalendarDays,
  Check, CheckCheck, ChevronLeft, ChevronRight, Circle, Focus,
  Inbox, Leaf, ListChecks, LoaderCircle, MoreHorizontal, Pause,
  PencilLine, Play, Plus, RefreshCw, Sparkles, X,
} from "lucide-react";
import {
  type FormEvent, type ReactNode, useCallback, useEffect, useRef, useState,
} from "react";
import { type FocusClockController, focusDisplay, focusElapsedMs } from "./focus-clock";
import { enqueueOfflineMutation, getDeviceId } from "./offline-sync";
import { StudioIsland, StudioSpaces } from "./studio-personalization";
import {
  belongsToDay, type HomeTask, localDay, overlaps, shiftDay, sortHomeTasks, taskForDay, weekDays,
} from "../lib/workbench-home";

type StudioEvent = {
  id: string; title: string; content: string; mood: string; kind: string;
  happenedAt: string; recordStatus: string;
  photos: Array<{ id: string; url: string; filename: string }>;
};
type StudioSchedule = {
  id: string; title: string; startAt: string; endAt: string;
  status: string; category: string; place: string;
};
type FocusLog = { id: string; started_at: string; minutes: number };
type TaskData = { tasks: HomeTask[]; sessions: FocusLog[] };
type Props = {
  today: Date;
  events: StudioEvent[];
  schedules: StudioSchedule[];
  inboxCount: number;
  focusClock: FocusClockController;
  onRecord: () => void;
  onSchedule: (date?: Date) => void;
  onInbox: () => void;
  onCommand: () => void;
  onEdit: (id: string) => void;
  onView: (view: string) => void;
  onReload: () => Promise<void>;
  onNotice: (message: string) => void;
  dashboard: ReactNode;
};
const time = (value: string) => new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
const weekdays = ["一", "二", "三", "四", "五", "六", "日"];
const captureLabels = { record: "记录", task: "任务", inbox: "收件箱" };
const templates = [
  { title: "今日小结", content: "今天完成了：\n\n一个值得记住的瞬间：\n\n明天想做：", kind: "生活" },
  { title: "学习笔记", content: "今天学到：\n\n还想弄清楚：\n\n下一步实践：", kind: "学习" },
  { title: "灵感捕捉", content: "想到一个点子：\n\n可以尝试：", kind: "生活" },
];

async function taskRequest(action: string, payload: Record<string, unknown>) {
  const response = await fetch("/api/tasks", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, payload }),
  });
  const result = response.status === 204 ? {} : await response.json() as { error?: string; id?: string };
  if (!response.ok) throw new Error(result.error || "操作没有保存，请重试。");
  return result;
}

export function HomeStudio(props: Props) {
  const { today, events, schedules, inboxCount, focusClock, onNotice, onReload } = props;
  const [selected, setSelected] = useState(() => new Date(today));
  const [tasks, setTasks] = useState<TaskData>({ tasks: [], sessions: [] });
  const [taskLoading, setTaskLoading] = useState(true);
  const [taskError, setTaskError] = useState("");
  const [filter, setFilter] = useState<"day" | "all" | "done">("day");
  const [capture, setCapture] = useState<keyof typeof captureLabels>("record");
  const [draft, setDraft] = useState("");
  const [kind, setKind] = useState("生活");
  const [mood, setMood] = useState("平静");
  const [captureTitle, setCaptureTitle] = useState("");
  const [busy, setBusy] = useState("");
  const [captureError, setCaptureError] = useState("");
  const [quiet, setQuiet] = useState(false);
  const [compact, setCompact] = useState(false);
  const [undo, setUndo] = useState<{ id: string; status: string; rank: number | null } | null>(null);
  const [plan, setPlan] = useState<HomeTask | null>(null);
  const [planStart, setPlanStart] = useState("");
  const [planMinutes, setPlanMinutes] = useState(25);
  const [finish, setFinish] = useState(false);
  const [finishNote, setFinishNote] = useState("");
  const [finishComplete, setFinishComplete] = useState(false);
  const [freeTitle, setFreeTitle] = useState("");
  const [focusMinutes, setFocusMinutes] = useState(25);
  const draftRef = useRef<HTMLTextAreaElement>(null);
  const focusCardRef = useRef<HTMLElement>(null);
  const day = localDay(selected);
  const isToday = day === localDay(today);
  const days = weekDays(selected);
  const session = focusClock.session;
  const shownEvents = events.filter(item => localDay(item.happenedAt) === day && item.recordStatus !== "checkin_running")
    .sort((a, b) => new Date(b.happenedAt).getTime() - new Date(a.happenedAt).getTime());
  const shownSchedules = schedules.filter(item => item.status !== "已取消" && belongsToDay(item.startAt, item.endAt, selected))
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  const dailyTasks = tasks.tasks.filter(item => taskForDay(item, selected, today));
  const visibleTasks = sortHomeTasks(tasks.tasks.filter(item => {
    if (item.status === "已取消") return false;
    if (filter === "done") return item.status === "已完成" && taskForDay(item, selected, today);
    if (item.status === "已完成") return false;
    return filter === "all" || taskForDay(item, selected, today);
  }));
  const dayFocus = tasks.sessions.filter(item => localDay(item.started_at) === day)
    .reduce((sum, item) => sum + Number(item.minutes), 0);
  const weekFocus = tasks.sessions.filter(item => new Date(item.started_at) >= days[0] && new Date(item.started_at) < shiftDay(days[6], 1))
    .reduce((sum, item) => sum + Number(item.minutes), 0);
  const completed = dailyTasks.filter(item => item.status === "已完成").length;
  const next = shownSchedules.find(item => item.status !== "已完成" && new Date(item.endAt) > today);
  const trackedConflict = plan && planStart ? schedules.filter(item => item.status !== "已取消" && overlaps(
    new Date(planStart).toISOString(), new Date(new Date(planStart).getTime() + planMinutes * 60000).toISOString(), item.startAt, item.endAt,
  )) : [];

  const loadTasks = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/tasks", { cache: "no-store", signal });
      const body = await response.json() as TaskData & { error?: string };
      if (!response.ok) throw new Error(body.error || "任务暂时无法读取");
      setTasks({ tasks: body.tasks ?? [], sessions: body.sessions ?? [] });
      setTaskError("");
    } catch (error) {
      if (signal?.aborted) return;
      setTaskError(error instanceof Error ? error.message : "任务暂时无法读取");
    } finally {
      if (!signal?.aborted) setTaskLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const initialLoad = window.setTimeout(() => void loadTasks(controller.signal), 0);
    const refresh = () => { if (!document.hidden) void loadTasks(controller.signal); };
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    return () => { controller.abort(); window.clearTimeout(initialLoad); window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [loadTasks]);

  useEffect(() => {
    const restore = window.setTimeout(() => {
      try {
        setQuiet(window.localStorage.getItem("richangyu-home-quiet") === "true");
        setCompact(window.localStorage.getItem("richangyu-home-density") === "compact");
      } catch { /* optional preference */ }
    }, 0);
    return () => window.clearTimeout(restore);
  }, []);

  useEffect(() => {
    if (session?.targetType === "task" && session.mode === "pomodoro" && session.status === "running"
      && focusElapsedMs(session, focusClock.now) >= session.durationMinutes * 60000) {
      focusClock.pause();
      onNotice("本轮专注已结束。可以保存结果，或继续计时。");
    }
  }, [session, focusClock, onNotice]);

  async function perform(key: string, action: () => Promise<void>) {
    if (busy) return;
    setBusy(key);
    try { await action(); } catch (error) { onNotice(error instanceof Error ? error.message : "操作失败，请重试。"); }
    finally { setBusy(""); }
  }

  async function saveCapture(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim() || busy) return;
    setCaptureError("");
    setBusy("capture");
    try {
      if (capture === "task") {
        await taskRequest("task.create", {
          title: draft.trim().split("\n")[0].slice(0, 200), description: draft.trim(),
          status: "下一步", plannedMinutes: 25, dueAt: new Date(`${day}T23:59:00`).toISOString(),
        });
        await loadTasks();
      } else if (capture === "inbox") {
        const payload = { content: draft.trim(), sourceType: "文字" };
        if (!navigator.onLine) {
          await enqueueOfflineMutation({ action: "inbox.create", payload });
        } else {
          const response = await fetch("/api/workspace", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "inbox.create", payload }),
          });
          const body = await response.json() as { error?: string };
          if (!response.ok) throw new Error(body.error || "收件箱保存失败");
        }
        await onReload();
      } else {
        const happenedAt = isToday ? new Date().toISOString() : new Date(`${day}T12:00:00`).toISOString();
        const payload = { content: draft.trim(), title: captureTitle, mood, kind, energy: 3, happenedAt, deviceId: getDeviceId() };
        if (!navigator.onLine) {
          await enqueueOfflineMutation({ action: "event.create", payload });
        } else {
          const form = new FormData();
          Object.entries(payload).forEach(([key, value]) => form.set(key, String(value)));
          const response = await fetch("/api/events", { method: "POST", body: form });
          const body = await response.json() as { error?: string };
          if (!response.ok) throw new Error(body.error || "记录保存失败");
        }
        await onReload();
      }
      setDraft(""); setCaptureTitle(""); setKind("生活");
      onNotice(navigator.onLine ? `${captureLabels[capture]}已保存。` : "已在本机排队，联网后会自动同步。");
    } catch (error) {
      setCaptureError(error instanceof Error ? error.message : "保存失败，内容仍在这里。");
    } finally { setBusy(""); }
  }

  function startFocus(task: HomeTask) {
    if (session) { onNotice(`“${session.title}”正在计时，请先结束当前专注。`); return; }
    focusClock.start({ targetType: "task", targetId: task.id, title: task.title, mode: "pomodoro", durationMinutes: focusMinutes });
    if (window.matchMedia("(max-width: 780px)").matches) {
      window.requestAnimationFrame(() => focusCardRef.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center",
      }));
    }
    onNotice(`已开始 ${focusMinutes} 分钟专注，切换页面后计时仍会继续。`);
  }

  async function startFreeFocus() {
    const title = freeTitle.trim() || visibleTasks[0]?.title;
    if (!title) { onNotice("先写下这次想专注的事情。"); return; }
    if (!freeTitle.trim() && visibleTasks[0]) { startFocus(visibleTasks[0]); return; }
    await perform("focus-start", async () => {
      if (session) return;
      const result = await taskRequest("task.create", {
        title, status: "进行中", plannedMinutes: focusMinutes, dueAt: new Date(`${localDay(today)}T23:59:00`).toISOString(),
      });
      if (!result.id) throw new Error("任务编号缺失，暂时无法启动计时。");
      focusClock.start({ targetType: "task", targetId: result.id, title, mode: "pomodoro", durationMinutes: focusMinutes });
      setFreeTitle(""); await loadTasks();
    });
  }

  async function completeTask(task: HomeTask) {
    await perform(task.id, async () => {
      await taskRequest("task.update", { id: task.id, status: "已完成" });
      setUndo({ id: task.id, status: task.status, rank: task.today_rank });
      await loadTasks();
    });
  }

  function openPlan(task: HomeTask) {
    const date = new Date(selected);
    const now = new Date();
    date.setHours(isToday ? now.getHours() + 1 : 9, 0, 0, 0);
    setPlanStart(`${localDay(date)}T${String(date.getHours()).padStart(2, "0")}:00`);
    setPlanMinutes(task.planned_minutes || 25);
    setPlan(task);
  }

  async function savePlan(event: FormEvent) {
    event.preventDefault();
    if (!plan || !planStart) return;
    await perform("plan", async () => {
      await taskRequest("task.schedule", {
        taskId: plan.id, startAt: new Date(planStart).toISOString(),
        endAt: new Date(new Date(planStart).getTime() + planMinutes * 60000).toISOString(),
      });
      setPlan(null); await Promise.all([loadTasks(), onReload()]);
      onNotice("任务已安排到日程，时间表中也能看到。");
    });
  }

  async function saveFinish(event: FormEvent) {
    event.preventDefault();
    if (!session || session.targetType !== "task") return;
    await perform("finish", async () => {
      await taskRequest("task.focus.complete", {
        taskId: session.targetId, mode: session.mode, startedAt: session.startedAt,
        endedAt: new Date().toISOString(), minutes: Math.max(1, Math.round(focusElapsedMs(session) / 60000)),
        plannedMinutes: session.durationMinutes, completed: finishComplete, note: finishNote,
      });
      focusClock.clear(); setFinish(false); setFinishNote(""); setFinishComplete(false);
      await loadTasks(); onNotice("本轮投入已保存，可以开始下一件事。");
    });
  }

  return (
    <div className={`home-studio ${quiet ? "is-quiet" : ""} ${compact ? "is-compact" : ""}`}>
      <header className="studio-intro">
        <div className="studio-welcome-copy"><span className="studio-eyebrow"><span /> 日常有序，生活有光</span>
          <h1>{isToday ? "今天，过得从容一点。" : "把这一天，好好收藏。"}</h1>
          <p>{new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(selected)}
            <span>计划一点，记录一点，向前一点。</span></p>
          <div className="studio-day-summary" aria-label="选中日期概览">
            <button onClick={() => props.onView("tasks")}><ListChecks size={14} /><strong>{taskLoading ? "…" : taskError ? "—" : dailyTasks.filter(item => item.status !== "已完成").length}</strong>件待办</button>
            <button onClick={() => props.onView("schedule")}><CalendarDays size={14} /><strong>{shownSchedules.length}</strong>项日程</button>
            <button onClick={() => props.onView("timeline")}><PencilLine size={14} /><strong>{shownEvents.length}</strong>条记录</button>
          </div>
          <div className="studio-hero-actions"><button onClick={props.onRecord}><Plus size={15} />记录此刻</button><button onClick={() => props.onSchedule(selected)}><CalendarClock size={15} />安排时间<ArrowRight size={13} /></button></div>
        </div>
        <StudioIsland />
        <button className={`studio-quiet-toggle ${quiet ? "active" : ""}`} aria-pressed={quiet} onClick={() => {
          setQuiet(!quiet); try { window.localStorage.setItem("richangyu-home-quiet", String(!quiet)); } catch { /* optional preference */ }
        }}><Focus size={17} />{quiet ? "完整工作台" : "专注视图"}</button>
      </header>

      <section className="studio-week" aria-label="按周浏览工作台">
        <div className="studio-week-heading"><strong>{selected.getMonth() + 1} 月的日常</strong>
          <div><button onClick={() => setSelected(new Date(today))}>回到今天</button>
            <button aria-label="上一周" onClick={() => setSelected(shiftDay(selected, -7))}><ChevronLeft size={16} /></button>
            <button aria-label="下一周" onClick={() => setSelected(shiftDay(selected, 7))}><ChevronRight size={16} /></button></div>
        </div>
        <div className="studio-week-days">{days.map((date, index) => {
          const count = schedules.filter(item => item.status !== "已取消" && belongsToDay(item.startAt, item.endAt, date)).length;
          const records = events.filter(item => item.recordStatus !== "checkin_running" && localDay(item.happenedAt) === localDay(date)).length;
          return <button key={localDay(date)} className={`${day === localDay(date) ? "selected" : ""} ${localDay(today) === localDay(date) ? "today" : ""}`}
            aria-pressed={day === localDay(date)} onClick={() => { setSelected(date); setUndo(null); }}>
            <span>周{weekdays[index]}</span><strong>{date.getDate()}</strong>
            <small>{count ? `${count} 项安排` : records ? `${records} 条记录` : "留白"}</small>
          </button>;
        })}</div>
      </section>

      <div className="studio-grid">
        <div className="studio-main">
          <form className="studio-panel studio-capture" onSubmit={saveCapture}>
            <div className="studio-capture-top"><div className="studio-tabs" aria-label="记录类型">
              {(Object.keys(captureLabels) as Array<keyof typeof captureLabels>).map(key => <button key={key} type="button" aria-pressed={capture === key}
                className={capture === key ? "active" : ""} onClick={() => { setCapture(key); setCaptureError(""); }}>
                {key === "record" ? <PencilLine size={15} /> : key === "task" ? <ListChecks size={15} /> : <Inbox size={15} />}{captureLabels[key]}</button>)}
            </div><span className="studio-date-note">{isToday ? "此刻" : `${selected.getMonth() + 1}/${selected.getDate()}`}</span></div>
            <textarea ref={draftRef} aria-label="快速记录内容" value={draft} maxLength={5000} disabled={busy === "capture"}
              onChange={event => setDraft(event.target.value)} onKeyDown={event => {
                if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); event.currentTarget.form?.requestSubmit(); }
              }} placeholder={capture === "record" ? "这一刻，有什么值得记下来？" : capture === "task" ? "写下一件要完成的事情…" : "想法、链接、线索，先放在这里…"} />
            {captureTitle && capture === "record" && <span className="studio-template-label"><BookOpen size={13} />{captureTitle}
              <button type="button" aria-label="取消模板标题" onClick={() => { setCaptureTitle(""); setKind("生活"); }}><X size={12} /></button></span>}
            <div className="studio-capture-bottom"><div className="studio-capture-tools">
              {capture === "record" ? <><label>心情<select value={mood} onChange={event => setMood(event.target.value)}><option>平静</option><option>开心</option><option>充实</option><option>疲惫</option><option>低落</option></select></label>
                <button type="button" onClick={props.onRecord}><Plus size={14} />照片 / 更多</button></> : <span>{capture === "task" ? "保存为选中日期的待办" : "不必现在整理"}</span>}
            </div><button className="studio-primary" disabled={!draft.trim() || Boolean(busy)}>{busy === "capture" ? <LoaderCircle size={15} className="spin" /> : <ArrowDownLeft size={15} />}保存{captureLabels[capture]}</button></div>
            {captureError && <p className="studio-error" role="alert">{captureError} 内容未丢失，请重试。</p>}
            {capture === "record" && <div className="studio-templates"><span>从一个模板开始</span>{templates.map(template => <button key={template.title} type="button" disabled={Boolean(busy)} onClick={() => {
              setDraft(draft.trim() ? `${draft}\n\n${template.content}` : template.content); setCaptureTitle(template.title); setKind(template.kind); draftRef.current?.focus();
            }}>{template.title}<Plus size={11} /></button>)}</div>}
          </form>

          <section className="studio-panel studio-tasks">
            <PanelHeading icon={<ListChecks size={18} />} title="重要的事，逐件完成" label="DAILY PRIORITIES"
              action={<button onClick={() => props.onView("tasks")}>任务规划<ArrowRight size={14} /></button>} />
            <div className="studio-task-filters"><div className="studio-tabs">{([
              ["day", isToday ? "今天" : "当天"], ["all", "全部待办"], ["done", "已完成"],
            ] as const).map(([key, label]) => <button key={key} className={filter === key ? "active" : ""} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>)}</div>
              <span>{completed} / {dailyTasks.length} 已完成</span></div>
            {undo && <div className="studio-undo" role="status"><CheckCheck size={15} />任务已完成<button disabled={Boolean(busy)} onClick={() => void perform("undo", async () => {
              await taskRequest("task.update", { id: undo.id, status: undo.status, todayRank: undo.rank }); setUndo(null); await loadTasks();
            })}>撤销</button></div>}
            {taskLoading ? <div className="studio-empty"><LoaderCircle className="spin" size={20} /><p>正在读取任务…</p></div>
              : taskError ? <div className="studio-empty"><p>{taskError}</p><button onClick={() => void loadTasks()}><RefreshCw size={14} />重试</button></div>
                : visibleTasks.length ? <div className="studio-task-list">{visibleTasks.slice(0, 7).map(task => <div key={task.id} className={`studio-task ${task.status === "已完成" ? "done" : ""}`}>
                  <button className="studio-task-check" disabled={Boolean(busy) || task.status === "已完成"} aria-label={`完成任务：${task.title}`} onClick={() => void completeTask(task)}>
                    {busy === task.id ? <LoaderCircle size={20} className="spin" /> : task.status === "已完成" ? <CheckCheck size={20} /> : <Circle size={20} />}</button>
                  <div className="studio-task-copy"><strong>{task.title}</strong><small>
                    {task.today_rank && <b>Top {task.today_rank}</b>}{task.priority === "P0" || task.priority === "P1" ? <em>优先处理</em> : null}
                    {task.due_at && new Date(task.due_at) < today && task.status !== "已完成" ? <em className="overdue">已逾期</em> : null}
                    {task.project_title && <span>{task.project_title}</span>}<span>{task.planned_minutes} 分钟</span></small></div>
                  {task.status !== "已完成" && <div className="studio-task-actions"><button disabled={Boolean(session) || Boolean(busy)} title="开始番茄专注" aria-label={`专注：${task.title}`} onClick={() => startFocus(task)}><Play size={15} /></button>
                    <button disabled={Boolean(busy)} title="安排到日程" aria-label={`安排：${task.title}`} onClick={() => openPlan(task)}><CalendarClock size={16} /></button></div>}
                </div>)}</div> : <div className="studio-empty"><ListChecks size={24} /><strong>{filter === "done" ? "完成的任务会留在这里" : filter === "all" ? "从一件小事开始" : "给这一天选一件重要的事"}</strong>
                  <p>{filter === "done" ? "做完后勾选任务，记录你的进展。" : "在上方切换到“任务”，写一句话就能添加。"}</p><button onClick={() => { setCapture("task"); draftRef.current?.focus(); draftRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }}>添加任务<Plus size={14} /></button></div>}
            {visibleTasks.length > 7 && <button className="studio-more" onClick={() => props.onView("tasks")}>查看其余 {visibleTasks.length - 7} 项任务<ArrowRight size={14} /></button>}
          </section>

          <section className="studio-panel studio-agenda">
            <PanelHeading icon={<CalendarDays size={18} />} title={isToday ? "今天的时间，有了位置" : "这一天的时间安排"} label="YOUR DAILY AGENDA"
              action={<button onClick={() => props.onSchedule(selected)}><Plus size={14} />新建日程</button>} />
            {shownSchedules.length ? <div className="studio-agenda-list">{shownSchedules.map(item => <button key={item.id} className={`studio-agenda-item ${item.status === "已完成" ? "done" : ""} ${item.id === next?.id && isToday ? "next" : ""}`} onClick={() => props.onView("schedule")}>
              <time>{time(item.startAt)}<small>{time(item.endAt)}</small></time><span className="studio-agenda-line" />
              <span className="studio-agenda-copy"><strong>{item.title}</strong><small>{item.category}{item.place ? ` · ${item.place}` : ""}</small></span>
              <em>{item.status === "已完成" ? <Check size={14} /> : item.id === next?.id && isToday ? "接下来" : item.status}</em>
            </button>)}</div> : <div className="studio-empty"><CalendarDays size={24} /><strong>为重要的事留一段时间</strong><p>课程、工作、出行，或者休息。</p><button onClick={() => props.onSchedule(selected)}>安排一个时间块<Plus size={14} /></button></div>}
          </section>

          <section className="studio-panel studio-journal">
            <PanelHeading icon={<Leaf size={18} />} title="留下日常的痕迹" label="LIFE, AS IT HAPPENS"
              action={<button onClick={() => props.onView("timeline")}>时间线<ArrowRight size={14} /></button>} />
            {shownEvents.length ? <div className="studio-journal-list">{shownEvents.slice(0, 5).map(item => <button key={item.id} onClick={() => props.onEdit(item.id)} className="studio-journal-item">
              <time>{time(item.happenedAt)}</time><div><small>{item.kind}<span>{item.mood}</span></small><strong>{item.title || item.content.split("\n")[0] || "生活记录"}</strong>
                {item.title && <p>{item.content}</p>}</div>{item.photos[0] ? <img src={item.photos[0].url} alt={item.photos[0].filename || "生活照片"} loading="lazy" /> : <PencilLine size={15} />}
            </button>)}</div> : <div className="studio-empty"><BookOpen size={24} /><strong>生活里的小事，也值得留下</strong><p>上方的记录框随时等着你。</p><button onClick={props.onRecord}>写下这一刻<PencilLine size={14} /></button></div>}
          </section>
        </div>

        <aside className="studio-rail">
          <section ref={focusCardRef} className="studio-focus-card">
            <div className="studio-focus-label"><span className={session?.status === "running" ? "pulsing" : ""} /><span>{session ? session.status === "running" ? "正在专注" : "计时已暂停" : "把注意力，留给一件事"}</span><Focus size={17} /></div>
            <h2>{session?.title || "一小段专注，\n一点点进展。"}</h2>
            <div className="studio-clock">{session ? focusDisplay(session, focusClock.now).replace(/^00:/, "") : `${String(focusMinutes).padStart(2, "0")}:00`}</div>
            <p>{session ? "你的投入正在被记录" : "先做一件事，其余的稍后再说。"}</p>
            {session ? <div className="studio-focus-controls"><button onClick={focusClock.toggle}>{session.status === "running" ? <Pause size={15} /> : <Play size={15} />}{session.status === "running" ? "暂停" : "继续"}</button>
              <button onClick={() => { if (session.targetType === "task") { focusClock.pause(); setFinish(true); } else props.onView("schedule"); }}><Check size={15} />结束并保存</button></div>
              : <><input aria-label="本次专注内容" value={freeTitle} onChange={event => setFreeTitle(event.target.value)} maxLength={200} placeholder={visibleTasks[0]?.title || "这次想专注什么？"} />
                <div className="studio-duration">{[25, 45, 60].map(minutes => <button key={minutes} aria-pressed={focusMinutes === minutes} className={focusMinutes === minutes ? "active" : ""} onClick={() => setFocusMinutes(minutes)}>{minutes} 分钟</button>)}</div>
                <button className="studio-focus-start" disabled={Boolean(busy) || (!freeTitle.trim() && !visibleTasks.length)} onClick={() => void startFreeFocus()}>{busy === "focus-start" ? <LoaderCircle className="spin" size={15} /> : <Play size={15} />}开始专注</button></>}
            <small className="studio-focus-foot">切换页面或刷新后，计时可继续恢复</small>
          </section>

          <section className="studio-panel studio-progress">
            <PanelHeading icon={<Sparkles size={17} />} title="进展，慢慢看得见" label="SMALL STEPS COUNT" />
            <div className="studio-progress-stats"><div><strong>{taskError ? "—" : completed}<small> / {dailyTasks.length}</small></strong><span>当天完成任务</span></div>
              <div><strong>{taskError ? "—" : dayFocus}<small> min</small></strong><span>当天专注投入</span></div></div>
            <div className="studio-progress-track"><span style={{ width: `${dailyTasks.length ? completed / dailyTasks.length * 100 : 0}%` }} /></div>
            <div className="studio-activity" aria-label="本周记录活跃度">{days.map((date, index) => {
              const amount = events.filter(item => item.recordStatus !== "checkin_running" && localDay(item.happenedAt) === localDay(date)).length;
              return <button key={localDay(date)} title={`${localDay(date)}：${amount} 条记录`} onClick={() => setSelected(date)}><span className={day === localDay(date) ? "selected" : ""} style={{ height: `${amount ? Math.min(70, 12 + amount * 12) : 4}px` }} /><small>{weekdays[index]}</small></button>;
            })}</div><div className="studio-progress-caption"><span>本周记录节奏</span><strong>专注 {taskError ? "—" : weekFocus} 分钟</strong></div>
          </section>

          <button className="studio-inbox-card" onClick={() => props.onView("inbox")}><span className="studio-inbox-icon"><Inbox size={20} /></span><span><strong>生活收件箱</strong><small>{inboxCount ? `${inboxCount} 条内容，等待整理` : "先记下，稍后整理"}</small></span><ChevronRight size={17} /></button>
          <StudioSpaces compact={compact} onDensity={() => {
            setCompact(!compact);
            try { window.localStorage.setItem("richangyu-home-density", compact ? "comfortable" : "compact"); }
            catch { onNotice("布局已切换，但此设备暂时无法记住设置。"); }
          }} onView={props.onView} onRecord={props.onRecord} onNotice={onNotice} />
          <div className="studio-note"><Leaf size={17} /><p>不必把一天填满。<br />让重要的事有位置，让生活有留白。</p></div>
        </aside>
      </div>

      <details className="studio-extra"><summary><span><Sparkles size={16} />我的动态信息</span><small>照片、往年今日、财务与情报</small><ChevronRight size={16} /></summary>{props.dashboard}</details>

      {plan && <StudioModal title="给任务留一段时间" onClose={() => { if (!busy) setPlan(null); }}>
        <form onSubmit={savePlan}><p className="studio-modal-task">{plan.title}</p><label>开始时间<input type="datetime-local" required value={planStart} onInput={event => setPlanStart(event.currentTarget.value)} onChange={event => setPlanStart(event.target.value)} /></label>
          <label>计划时长（分钟）<input type="number" min={1} max={1440} required value={planMinutes} onInput={event => setPlanMinutes(Number(event.currentTarget.value))} onChange={event => setPlanMinutes(Number(event.target.value))} /></label>
          {trackedConflict.length > 0 && <p className="studio-plan-warning">与“{trackedConflict.map(item => item.title).join("、")}”时间重叠。可以调整时间，也可以保留同时进行的安排。</p>}
          <button className="studio-primary" disabled={Boolean(busy)}>{busy === "plan" ? <LoaderCircle className="spin" size={15} /> : <CalendarClock size={15} />}保存到日程</button></form>
      </StudioModal>}
      {finish && session && <StudioModal title="记下这一轮的进展" onClose={() => { if (!busy) setFinish(false); }}>
        <form onSubmit={saveFinish}><p className="studio-modal-task">{session.title}</p><div className="studio-finish-minutes"><strong>{Math.max(1, Math.round(focusElapsedMs(session, focusClock.now) / 60000))}</strong><span>分钟真实投入</span></div>
          <label>这次完成了什么？<textarea value={finishNote} onChange={event => setFinishNote(event.target.value)} maxLength={2000} placeholder="一个结果，一点进展，都可以。" /></label>
          <label className="studio-check-label"><input type="checkbox" checked={finishComplete} onChange={event => setFinishComplete(event.target.checked)} />同时标记任务已完成</label>
          <button className="studio-primary" disabled={Boolean(busy)}>{busy === "finish" ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />}保存本轮投入</button></form>
      </StudioModal>}
    </div>
  );
}

function PanelHeading({ icon, title, label, action }: { icon: ReactNode; title: string; label: string; action?: ReactNode }) {
  return <header className="studio-panel-heading"><div><span className="studio-heading-icon">{icon}</span><div><small>{label}</small><h2>{title}</h2></div></div>{action}</header>;
}

function StudioModal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} className="studio-modal" aria-label={title} onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}><header><h2>{title}</h2><button aria-label="关闭" onClick={onClose}><X size={18} /></button></header>{children}</dialog>;
}
