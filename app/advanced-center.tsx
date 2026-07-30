"use client";

import {
  Bell,
  BellRing,
  Bot,
  CalendarClock,
  Check,
  ChevronRight,
  FileArchive,
  FileText,
  FolderKanban,
  ScanSearch,
  Import,
  LoaderCircle,
  Milestone,
  Plus,
  RefreshCw,
  ScanText,
  SearchCheck,
  Sparkles,
  Target,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Upload,
  WandSparkles,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type PhotoLite = {
  id: string;
  filename: string;
  url: string;
};

type LifeEventLite = {
  id: string;
  title: string;
  content: string;
  happenedAt: string;
  photos: PhotoLite[];
};

export type ReminderSchedule = {
  id: string;
  title: string;
  startAt: string;
  reminderMinutes?: number | null;
  status: string;
};

type Project = {
  id: string;
  title: string;
  kind: string;
  status: string;
  progress: number;
  description: string;
  color: string;
  startAt: string | null;
  targetAt: string | null;
};

type ProjectMilestone = {
  id: string;
  projectId: string | null;
  title: string;
  happenedAt: string;
  note: string;
  completed: boolean;
};

type Automation = {
  id: string;
  name: string;
  triggerType: string;
  triggerValue: string;
  actionType: string;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
};

type AutomationRun = {
  id: string;
  automationId: string;
  runKey: string;
  status: "running" | "succeeded" | "failed";
  scheduledFor: string;
  startedAt: string;
  finishedAt: string | null;
  outcome: Record<string, unknown>;
  error: string;
};

type AutomationMessage = {
  id: string;
  automationId: string;
  runId: string;
  kind: string;
  title: string;
  body: string;
  actionTarget: string;
  dueAt: string;
  readAt: string | null;
  createdAt: string;
};

type GeneratedSummary = {
  id: string;
  kind: string;
  title: string;
  content: string;
  periodStart: string;
  periodEnd: string;
  generatedBy: string;
  sourceIds: string[];
  createdAt: string;
};

type PhotoInsight = {
  mediaId: string;
  sha256: string | null;
  perceptualHash: string | null;
  blurScore: number | null;
  duplicateOf: string | null;
  isScreenshot: boolean;
  note: string;
};

type AdvancedData = {
  projects: Project[];
  milestones: ProjectMilestone[];
  automations: Automation[];
  automationRuns: AutomationRun[];
  automationMessages: AutomationMessage[];
  summaries: GeneratedSummary[];
  photoInsights: PhotoInsight[];
  imports: Array<Record<string, unknown>>;
  dashboardLayout: Array<Record<string, unknown>>;
  savedSearches: Array<Record<string, unknown>>;
  collectionViews: Array<Record<string, unknown>>;
  relations: Array<Record<string, unknown>>;
};

const emptyAdvanced: AdvancedData = {
  projects: [],
  milestones: [],
  automations: [],
  automationRuns: [],
  automationMessages: [],
  summaries: [],
  photoInsights: [],
  imports: [],
  dashboardLayout: [],
  savedSearches: [],
  collectionViews: [],
  relations: [],
};

type CenterTab = "projects" | "automation" | "import" | "photos" | "ai";

function dateOnly(value: string | null) {
  if (!value) return "未设置";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "未设置"
    : date.toLocaleDateString("zh-CN");
}

function dateTime(value: string | null) {
  if (!value) return "待首次运行";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "时间未知"
    : date.toLocaleString("zh-CN", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

async function postAdvanced(action: string, payload: Record<string, unknown>) {
  const response = await fetch("/api/advanced", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, payload }),
  });
  const body = response.status === 204
    ? {}
    : ((await response.json()) as Record<string, unknown>);
  if (!response.ok) throw new Error(String(body.error || "操作失败。"));
  return body;
}

export function ScheduleReminderWatcher({
  schedules,
  onNotice,
}: {
  schedules: ReminderSchedule[];
  onNotice: (notice: string) => void;
}) {
  const notified = useRef(new Set<string>());

  useEffect(() => {
    function check() {
      const now = Date.now();
      for (const item of schedules) {
        if (item.status === "已完成" || notified.current.has(item.id)) continue;
        const start = new Date(item.startAt).getTime();
        const reminder = Math.max(0, item.reminderMinutes ?? 10) * 60000;
        if (start - now <= reminder && start - now > -60000) {
          notified.current.add(item.id);
          const copy = `${item.title} · ${new Date(item.startAt).toLocaleTimeString(
            "zh-CN",
            { hour: "2-digit", minute: "2-digit" },
          )}`;
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            new Notification("日常屿日程提醒", { body: copy, tag: item.id });
          } else {
            onNotice(`即将开始：${copy}`);
          }
        }
      }
    }
    check();
    const timer = window.setInterval(check, 30000);
    return () => window.clearInterval(timer);
  }, [schedules, onNotice]);

  return null;
}

export function AdvancedCenter({
  events,
  onNotice,
  onWorkspaceReload,
  initialTab = "projects",
}: {
  events: LifeEventLite[];
  onNotice: (notice: string) => void;
  onWorkspaceReload: () => Promise<void>;
  initialTab?: CenterTab;
}) {
  const [tab, setTab] = useState<CenterTab>(initialTab);
  const [data, setData] = useState<AdvancedData>(emptyAdvanced);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiAnswer, setAiAnswer] = useState("");
  const [aiProvider, setAiProvider] = useState("local");
  const [aiMeta, setAiMeta] = useState<{
    sourceCount: number;
    confidence: number;
    estimatedTokens: number;
    costLabel: string;
    durationMs: number | null;
    fallback: boolean;
  } | null>(null);
  const [ocrText, setOcrText] = useState("");
  const [ocrProgress, setOcrProgress] = useState(0);
  const [photoReport, setPhotoReport] = useState({
    scanned: 0,
    duplicates: 0,
    blurry: 0,
    screenshots: 0,
  });

  async function load() {
    setLoading(true);
    try {
      const [advancedResponse, aiResponse] = await Promise.all([
        fetch("/api/advanced", { cache: "no-store" }),
        fetch("/api/ai", { cache: "no-store" }),
      ]);
      const advanced = (await advancedResponse.json()) as AdvancedData & {
        error?: string;
      };
      const ai = (await aiResponse.json()) as { provider?: string };
      if (!advancedResponse.ok) throw new Error(advanced.error);
      setData(advanced);
      setAiProvider(ai.provider || "local");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "读取智能中心失败。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
    // The loader is intentionally run once when the center is mounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function action(
    name: string,
    payload: Record<string, unknown>,
    success: string,
  ) {
    try {
      setBusy(name);
      await postAdvanced(name, payload);
      await load();
      onNotice(success);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "操作失败。");
    } finally {
      setBusy("");
    }
  }

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await action(
      "project.create",
      {
        title: form.get("title"),
        kind: form.get("kind"),
        description: form.get("description"),
        targetAt: form.get("targetAt"),
        color: form.get("color"),
      },
      "新目标已经加入项目中心。",
    );
    event.currentTarget.reset();
  }

  async function addMilestone(project: Project) {
    const title = window.prompt(`为“${project.title}”添加一个里程碑`);
    if (!title?.trim()) return;
    await action(
      "milestone.create",
      {
        projectId: project.id,
        title,
        happenedAt: new Date().toISOString(),
      },
      "里程碑已保存。",
    );
  }

  async function requestNotifications() {
    if (typeof Notification === "undefined") {
      onNotice("当前浏览器不支持系统通知。");
      return;
    }
    const permission = await Notification.requestPermission();
    onNotice(
      permission === "granted"
        ? "日程通知已开启。"
        : "未获得通知权限，仍会使用站内提醒。",
    );
  }

  async function runAutomations() {
    try {
      setBusy("automation.run");
      const result = await postAdvanced("automation.run", {
        timezoneOffset: new Date().getTimezoneOffset(),
      });
      await Promise.all([load(), onWorkspaceReload()]);
      const generated = Array.isArray(result.generated)
        ? result.generated.join("、")
        : "";
      const failures = Array.isArray(result.failed) ? result.failed.length : 0;
      const notifications = Array.isArray(result.notifications)
        ? (result.notifications as Array<Record<string, unknown>>)
        : [];
      if (
        typeof Notification !== "undefined" &&
        Notification.permission === "granted"
      ) {
        for (const notification of notifications.slice(0, 5)) {
          new Notification(String(notification.title || "日常屿提醒"), {
            body: String(notification.body || ""),
            tag: String(notification.id || crypto.randomUUID()),
          });
        }
      }
      onNotice(generated ? `已刷新${generated}。` : "自动化检查完成。");
      if (failures) onNotice(`${failures} 项自动化执行失败，可查看运行记录。`);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "自动化运行失败。");
    } finally {
      setBusy("");
    }
  }

  async function importFile(file: File) {
    try {
      setBusy("import");
      const extension = file.name.split(".").pop()?.toLowerCase() || "";
      const sourceText = await file.text();
      const payload: {
        sourceType: string;
        filename: string;
        events: Array<Record<string, unknown>>;
        schedules: Array<Record<string, unknown>>;
        inbox: Array<Record<string, unknown>>;
        skipped: number;
      } = {
        sourceType: extension || "file",
        filename: file.name,
        events: [],
        schedules: [],
        inbox: [],
        skipped: 0,
      };

      if (extension === "ics" || extension === "ical") {
        const icalModule = await import("ical.js");
        const ICAL = (icalModule.default ??
          icalModule) as typeof icalModule.default;
        const root = new ICAL.Component(ICAL.parse(sourceText));
        const calendarEvents = root.getAllSubcomponents("vevent");
        payload.schedules = calendarEvents.map((component) => {
          const item = new ICAL.Event(component);
          return {
            title: item.summary || "导入日程",
            startAt: item.startDate.toJSDate().toISOString(),
            endAt: item.endDate.toJSDate().toISOString(),
            place: item.location || "",
            note: item.description || "",
            category: "日历导入",
            repeatRule: "不重复",
          };
        });
        payload.sourceType = "iCalendar";
      } else if (extension === "csv") {
        const Papa = (await import("papaparse")).default;
        const parsed = Papa.parse<Record<string, string>>(sourceText, {
          header: true,
          skipEmptyLines: true,
        });
        payload.events = parsed.data.slice(0, 1000).map((row) => ({
          title:
            row.title || row.标题 || row.Name || row.name || row.名称 || "导入记录",
          content:
            row.content || row.内容 || row.note || row.备注 || JSON.stringify(row),
          happenedAt:
            row.date || row.日期 || row.created_time || row.创建时间 || new Date().toISOString(),
          kind: row.kind || row.类型 || "Notion/CSV",
          mood: row.mood || row.心情 || "平静",
          tags: row.tags ? row.tags.split(/[,，]/) : ["导入"],
        }));
        payload.skipped = parsed.errors.length;
        payload.sourceType = "Notion/CSV";
      } else if (extension === "json") {
        const parsed = JSON.parse(sourceText) as Record<string, unknown>;
        payload.events = Array.isArray(parsed.events)
          ? (parsed.events as Array<Record<string, unknown>>)
          : [];
        payload.schedules = Array.isArray(parsed.schedules)
          ? (parsed.schedules as Array<Record<string, unknown>>)
          : [];
        payload.inbox = Array.isArray(parsed.inbox)
          ? (parsed.inbox as Array<Record<string, unknown>>)
          : [];
        payload.sourceType = "日常屿/JSON";
      } else if (["md", "markdown", "txt"].includes(extension)) {
        const sections = sourceText
          .split(/\n(?=#{1,3}\s)|\n{2,}/)
          .map((section) => section.trim())
          .filter(Boolean);
        payload.events = sections.slice(0, 1000).map((section) => {
          const [firstLine, ...rest] = section.split(/\r?\n/);
          return {
            title: firstLine.replace(/^#{1,6}\s*/, "").slice(0, 200),
            content: rest.join("\n") || firstLine,
            happenedAt: new Date().toISOString(),
            kind: "Markdown导入",
            mood: "平静",
            tags: ["导入"],
          };
        });
        payload.sourceType = extension === "txt" ? "文本" : "Notion/Markdown";
      } else {
        throw new Error("支持 JSON、CSV、Markdown、TXT 和 ICS 文件。");
      }

      const result = await postAdvanced("import.commit", payload);
      await Promise.all([load(), onWorkspaceReload()]);
      onNotice(`导入完成，共加入 ${result.imported ?? 0} 条内容。`);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "导入失败。");
    } finally {
      setBusy("");
    }
  }

  async function recognizeText(file: File) {
    try {
      setBusy("ocr");
      setOcrProgress(0);
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("chi_sim+eng", 1, {
        logger(message) {
          if (message.status === "recognizing text") {
            setOcrProgress(Math.round((message.progress || 0) * 100));
          }
        },
      });
      const result = await worker.recognize(file);
      await worker.terminate();
      setOcrText(result.data.text.trim());
      onNotice("图片文字已经识别，可以保存到收件箱。");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "OCR 识别失败。");
    } finally {
      setBusy("");
    }
  }

  async function saveOcrToInbox() {
    if (!ocrText.trim()) return;
    const response = await fetch("/api/workspace", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "inbox.create",
        payload: { content: ocrText, sourceType: "OCR" },
      }),
    });
    if (!response.ok) {
      onNotice("OCR 文字保存失败。");
      return;
    }
    setOcrText("");
    await onWorkspaceReload();
    onNotice("OCR 文字已放入生活收件箱。");
  }

  async function inspectImage(
    photo: PhotoLite,
  ): Promise<PhotoInsight> {
    const response = await fetch(photo.url);
    const blob = await response.blob();
    const bytes = await blob.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const sha256 = Array.from(new Uint8Array(digest))
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = 16;
    canvas.height = 16;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("浏览器无法分析照片。");
    context.drawImage(bitmap, 0, 0, 16, 16);
    const pixels = context.getImageData(0, 0, 16, 16).data;
    const grays: number[] = [];
    let edge = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const gray =
        pixels[index] * 0.299 +
        pixels[index + 1] * 0.587 +
        pixels[index + 2] * 0.114;
      grays.push(gray);
      if (index >= 4) edge += Math.abs(gray - grays[grays.length - 2]);
    }
    const average = grays.reduce((sum, value) => sum + value, 0) / grays.length;
    const perceptualHash = grays
      .map((value) => (value >= average ? "1" : "0"))
      .join("");
    const blurScore = edge / Math.max(1, grays.length - 1);
    const aspect = bitmap.width / Math.max(1, bitmap.height);
    bitmap.close();
    return {
      mediaId: photo.id,
      sha256,
      perceptualHash,
      blurScore,
      duplicateOf: null,
      isScreenshot:
        /screenshot|截图|截屏/i.test(photo.filename) ||
        aspect > 1.9 ||
        aspect < 0.48,
      note: blurScore < 18 ? "可能较模糊，建议核对" : "",
    };
  }

  async function scanPhotos() {
    try {
      setBusy("photos");
      const photos = events.flatMap((event) => event.photos).slice(0, 200);
      const insights: PhotoInsight[] = [];
      const byHash = new Map<string, string>();
      for (const photo of photos) {
        const insight = await inspectImage(photo);
        const duplicate = byHash.get(insight.sha256 || "");
        if (duplicate) insight.duplicateOf = duplicate;
        else if (insight.sha256) byHash.set(insight.sha256, insight.mediaId);
        insights.push(insight);
      }
      await postAdvanced("photo.insights.save", { insights });
      setPhotoReport({
        scanned: insights.length,
        duplicates: insights.filter((item) => item.duplicateOf).length,
        blurry: insights.filter((item) => (item.blurScore ?? 99) < 18).length,
        screenshots: insights.filter((item) => item.isScreenshot).length,
      });
      await load();
      onNotice("照片整理扫描完成。");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "照片扫描失败。");
    } finally {
      setBusy("");
    }
  }

  async function askAi(mode: "question" | "weekly" | "monthly" | "topic") {
    try {
      setBusy(`ai-${mode}`);
      const response = await fetch("/api/ai/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode, prompt: aiPrompt }),
      });
      const queued = (await response.json()) as {
        id?: string;
        error?: string;
      };
      if (!response.ok || !queued.id) {
        throw new Error(queued.error || "智能任务创建失败。");
      }
      setAiAnswer("任务已进入后台队列，你可以停留在这里等待，也可以先去记录其他内容。");
      let result: {
        status?: string;
        answer?: string;
        provider?: string;
        model?: string;
        error?: string;
        transparency?: {
          sourceCount: number;
          confidence: number;
          estimatedTokens: number;
          costLabel: string;
          durationMs: number | null;
          fallback: boolean;
        };
      } = {};
      for (let attempt = 0; attempt < 120; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 1000));
        const progress = await fetch(
          `/api/ai/tasks?id=${encodeURIComponent(queued.id)}`,
          { cache: "no-store" },
        );
        const payload = (await progress.json()) as {
          task?: typeof result;
          error?: string;
        };
        if (!progress.ok) {
          throw new Error(payload.error || "读取智能任务失败。");
        }
        result = payload.task || {};
        if (result.status === "succeeded") break;
        if (result.status === "failed") {
          throw new Error(result.error || "智能分析失败。");
        }
      }
      if (result.status !== "succeeded") {
        throw new Error("智能任务仍在运行，可稍后回到这里查看总结库。");
      }
      setAiAnswer(result.answer || "");
      setAiProvider(result.provider || "local");
      setAiMeta(result.transparency ?? null);
      if (mode !== "question") await load();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "智能分析失败。");
    } finally {
      setBusy("");
    }
  }

  const duplicateGroups = useMemo(() => {
    const groups = new Map<string, PhotoInsight[]>();
    for (const insight of data.photoInsights) {
      const key = insight.duplicateOf || insight.mediaId;
      const group = groups.get(key) ?? [];
      group.push(insight);
      groups.set(key, group);
    }
    return [...groups.values()].filter((group) => group.length > 1);
  }, [data.photoInsights]);

  const tabs: Array<[CenterTab, string, typeof Bot]> = [
    ["projects", "项目与里程碑", FolderKanban],
    ["automation", "自动化", CalendarClock],
    ["import", "导入与 OCR", Import],
    ["photos", "照片整理", ScanSearch],
    ["ai", "智能问询", Bot],
  ];

  if (loading) {
    return (
      <div className="advanced-loading">
        <LoaderCircle className="spin" size={22} />
        正在整理智能中心…
      </div>
    );
  }

  return (
    <section className="standard-page advanced-center">
      <div className="page-intro">
        <div>
          <span className="eyebrow">LIFE OPERATING SYSTEM</span>
          <h1>智能中心与长期生活管理</h1>
          <p>项目、自动化、历史导入、照片整理与智能问询在这里汇合。</p>
        </div>
        <div className="ai-provider-badge">
          <Sparkles size={16} />
          {aiProvider === "local"
            ? "本地分析模式"
            : `${aiProvider.toUpperCase()} 模型已连接`}
        </div>
      </div>

      <div className="advanced-tabs" role="tablist">
        {tabs.map(([id, label, Icon]) => (
          <button
            key={id}
            className={tab === id ? "active" : ""}
            onClick={() => setTab(id)}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {tab === "projects" && (
        <div className="advanced-grid">
          <section className="advanced-panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">PROJECTS & GOALS</span>
                <h2>把记录、时间和里程碑放进同一个目标</h2>
              </div>
              <Target size={21} />
            </div>
            <form className="project-form" onSubmit={createProject}>
              <input name="title" placeholder="目标或项目名称" required />
              <select name="kind" defaultValue="个人目标">
                <option>个人目标</option>
                <option>科研项目</option>
                <option>论文</option>
                <option>考试备考</option>
                <option>课程教学</option>
                <option>旅行</option>
                <option>入职适应</option>
              </select>
              <input name="targetAt" type="date" aria-label="目标日期" />
              <input name="color" type="color" defaultValue="#76528b" aria-label="项目颜色" />
              <textarea name="description" placeholder="想达成什么，以及为什么重要" />
              <button className="primary-button" disabled={busy === "project.create"}>
                <Plus size={16} /> 创建项目
              </button>
            </form>
          </section>

          <section className="project-board">
            {data.projects.length ? (
              data.projects.map((project) => {
                const milestones = data.milestones.filter(
                  (item) => item.projectId === project.id,
                );
                return (
                  <article className="project-card" key={project.id}>
                    <span
                      className="project-accent"
                      style={{ background: project.color }}
                    />
                    <header>
                      <div>
                        <small>{project.kind}</small>
                        <h3>{project.title}</h3>
                      </div>
                      <em>{project.status}</em>
                    </header>
                    <p>{project.description || "还没有项目说明。"}</p>
                    <div className="project-progress">
                      <div>
                        <span style={{ width: `${project.progress}%` }} />
                      </div>
                      <strong>{project.progress}%</strong>
                    </div>
                    <div className="project-meta">
                      <span>目标 {dateOnly(project.targetAt)}</span>
                      <span>{milestones.length} 个里程碑</span>
                    </div>
                    {milestones.slice(0, 3).map((item) => (
                      <button
                        key={item.id}
                        className={`milestone-line ${item.completed ? "done" : ""}`}
                        onClick={() =>
                          action(
                            "milestone.toggle",
                            { id: item.id, completed: !item.completed },
                            "里程碑状态已更新。",
                          )
                        }
                      >
                        <span>{item.completed ? <Check size={12} /> : null}</span>
                        {item.title}
                      </button>
                    ))}
                    <footer>
                      <button onClick={() => addMilestone(project)}>
                        <Milestone size={14} /> 添加里程碑
                      </button>
                      <button
                        className="danger-link"
                        onClick={() => {
                          if (window.confirm(`删除“${project.title}”？`)) {
                            action(
                              "project.delete",
                              { id: project.id },
                              "项目已删除。",
                            );
                          }
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </footer>
                  </article>
                );
              })
            ) : (
              <div className="advanced-empty">
                <FolderKanban size={28} />
                <h3>从第一个长期目标开始</h3>
                <p>例如论文投稿、教资考试、一次旅行或入职适应期。</p>
              </div>
            )}
          </section>
        </div>
      )}

      {tab === "automation" && (
        <div className="advanced-grid">
          <section className="advanced-panel automation-intro">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">AUTOMATION</span>
                <h2>让工作台在合适的时间主动出现</h2>
              </div>
              <BellRing size={21} />
            </div>
            <p>
              打开工作台、回到前台和使用期间都会检查到期规则；错过时间后会安全补跑，重复打开不会重复生成。系统通知未授权时自动退回站内提醒。
            </p>
            <small className="automation-format-help">
              时间格式：每日 HH:MM；每周 星期日为 0，例如 0@20:30；每月可写
              last@21:00。
            </small>
            <div className="automation-actions">
              <button className="secondary-button" onClick={requestNotifications}>
                <Bell size={16} /> 开启系统通知
              </button>
              <button
                className="primary-button"
                onClick={runAutomations}
                disabled={busy === "automation.run"}
              >
                <RefreshCw
                  size={16}
                  className={busy === "automation.run" ? "spin" : ""}
                />
                立即运行一次
              </button>
            </div>
          </section>
          <section className="automation-list">
            {data.automations.map((automation) => (
              <article key={automation.id}>
                <span className={automation.enabled ? "enabled" : ""}>
                  <WandSparkles size={17} />
                </span>
                <div>
                  <strong>{automation.name}</strong>
                  <p>
                    {automation.triggerType} · {automation.triggerValue || "自动"}
                    {automation.lastRunAt
                      ? ` · 上次 ${dateTime(automation.lastRunAt)}`
                      : ""}
                    {automation.nextRunAt
                      ? ` · 下次 ${dateTime(automation.nextRunAt)}`
                      : ""}
                  </p>
                  {["daily", "weekly", "monthly"].includes(
                    automation.triggerType,
                  ) ? (
                    <input
                      className="automation-trigger-input"
                      aria-label={`${automation.name}触发规则`}
                      defaultValue={automation.triggerValue}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") event.currentTarget.blur();
                      }}
                      onBlur={(event) => {
                        const value = event.currentTarget.value.trim();
                        if (value && value !== automation.triggerValue) {
                          void action(
                            "automation.update",
                            { id: automation.id, triggerValue: value },
                            "自动化时间已更新。",
                          );
                        }
                      }}
                    />
                  ) : null}
                </div>
                <button
                  aria-label={automation.enabled ? "关闭自动化" : "开启自动化"}
                  onClick={() =>
                    action(
                      "automation.toggle",
                      { id: automation.id, enabled: !automation.enabled },
                      automation.enabled ? "自动化已关闭。" : "自动化已开启。",
                    )
                  }
                >
                  {automation.enabled ? (
                    <ToggleRight size={29} />
                  ) : (
                    <ToggleLeft size={29} />
                  )}
                </button>
              </article>
            ))}
          </section>
          <section className="advanced-panel automation-message-center">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">INBOX</span>
                <h2>站内提醒</h2>
              </div>
              <Bell size={20} />
            </div>
            <div className="automation-message-list">
              {data.automationMessages.filter((item) => !item.readAt).length ? (
                data.automationMessages
                  .filter((item) => !item.readAt)
                  .slice(0, 12)
                  .map((item) => (
                    <article key={item.id}>
                      <span className={`message-kind ${item.kind}`}>
                        <BellRing size={16} />
                      </span>
                      <div>
                        <strong>{item.title}</strong>
                        <p>{item.body}</p>
                        <small>
                          {dateTime(item.dueAt)}
                          {item.actionTarget ? ` · 前往${item.actionTarget}` : ""}
                        </small>
                      </div>
                      <button
                        className="icon-button"
                        title="标记为已读"
                        onClick={() =>
                          action(
                            "automation.message.read",
                            { id: item.id },
                            "提醒已归档。",
                          )
                        }
                      >
                        <Check size={17} />
                      </button>
                    </article>
                  ))
              ) : (
                <div className="advanced-empty compact">
                  <Check size={24} />
                  <h3>提醒已处理完</h3>
                  <p>到期日程、日记提示和总结完成通知会出现在这里。</p>
                </div>
              )}
            </div>
          </section>
          <section className="advanced-panel automation-run-history">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">RUN HISTORY</span>
                <h2>执行记录</h2>
              </div>
              <CalendarClock size={20} />
            </div>
            <div className="automation-run-list">
              {data.automationRuns.length ? (
                data.automationRuns.slice(0, 16).map((run) => {
                  const automation = data.automations.find(
                    (item) => item.id === run.automationId,
                  );
                  return (
                    <article key={run.id}>
                      <span className={`run-status ${run.status}`}>
                        {run.status === "succeeded"
                          ? "成功"
                          : run.status === "failed"
                            ? "失败"
                            : "运行中"}
                      </span>
                      <div>
                        <strong>{automation?.name || run.automationId}</strong>
                        <p>
                          计划 {dateTime(run.scheduledFor)} · 执行{" "}
                          {dateTime(run.startedAt)}
                        </p>
                        {run.error ? <small>{run.error}</small> : null}
                      </div>
                    </article>
                  );
                })
              ) : (
                <div className="advanced-empty compact">
                  <CalendarClock size={24} />
                  <h3>还没有运行记录</h3>
                  <p>执行一次检查后，每项动作都会留下可追踪结果。</p>
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {tab === "import" && (
        <div className="advanced-grid">
          <section className="advanced-panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">IMPORT CENTER</span>
                <h2>把过去的记录带回日常屿</h2>
              </div>
              <FileArchive size={21} />
            </div>
            <label className="drop-import">
              {busy === "import" ? (
                <LoaderCircle className="spin" size={28} />
              ) : (
                <Upload size={28} />
              )}
              <strong>选择历史文件</strong>
              <span>JSON、Notion/CSV、Markdown、TXT、ICS 日历</span>
              <input
                type="file"
                accept=".json,.csv,.md,.markdown,.txt,.ics,.ical"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) importFile(file);
                  event.target.value = "";
                }}
              />
            </label>
            <div className="import-history">
              {data.imports.slice(0, 5).map((item, index) => (
                <div key={String(item.id ?? index)}>
                  <Import size={15} />
                  <span>
                    <strong>{String(item.filename || item.source_type)}</strong>
                    <small>
                      导入 {String(item.imported_count ?? 0)} 条 ·{" "}
                      {dateOnly(String(item.created_at ?? ""))}
                    </small>
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="advanced-panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">LOCAL OCR</span>
                <h2>图片文字识别</h2>
              </div>
              <ScanText size={21} />
            </div>
            <label className="ocr-upload">
              <FileText size={20} />
              <span>
                <strong>上传截图、试卷或书页</strong>
                <small>识别过程在浏览器中完成，不需要模型密钥</small>
              </span>
              <input
                type="file"
                accept="image/*"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) recognizeText(file);
                  event.target.value = "";
                }}
              />
            </label>
            {busy === "ocr" && (
              <div className="ocr-progress">
                <span style={{ width: `${ocrProgress}%` }} />
                <strong>{ocrProgress}%</strong>
              </div>
            )}
            <textarea
              className="ocr-result"
              value={ocrText}
              onChange={(event) => setOcrText(event.target.value)}
              placeholder="识别出的文字会出现在这里…"
            />
            <button
              className="secondary-button"
              onClick={saveOcrToInbox}
              disabled={!ocrText.trim()}
            >
              保存到生活收件箱
            </button>
          </section>
        </div>
      )}

      {tab === "photos" && (
        <div className="advanced-grid">
          <section className="advanced-panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">PHOTO HYGIENE</span>
                <h2>重复、截图和模糊照片扫描</h2>
              </div>
              <SearchCheck size={21} />
            </div>
            <p>
              使用内容指纹识别完全重复照片，并用轻量图像特征提示截图与可能模糊的照片。
            </p>
            <button
              className="primary-button"
              onClick={scanPhotos}
              disabled={busy === "photos"}
            >
              {busy === "photos" ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <ScanSearch size={16} />
              )}
              扫描 {events.flatMap((event) => event.photos).length} 张照片
            </button>
          </section>
          <section className="photo-audit-grid">
            {[
              ["已扫描", photoReport.scanned || data.photoInsights.length],
              ["完全重复", photoReport.duplicates || duplicateGroups.length],
              [
                "可能模糊",
                photoReport.blurry ||
                  data.photoInsights.filter(
                    (item) => (item.blurScore ?? 99) < 18,
                  ).length,
              ],
              [
                "截图",
                photoReport.screenshots ||
                  data.photoInsights.filter((item) => item.isScreenshot).length,
              ],
            ].map(([label, value]) => (
              <article key={String(label)}>
                <strong>{value}</strong>
                <span>{label}</span>
              </article>
            ))}
          </section>
        </div>
      )}

      {tab === "ai" && (
        <div className="advanced-grid ai-grid">
          <section className="advanced-panel ai-console">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">ASK YOUR LIFE</span>
                <h2>向自己的记录提问</h2>
              </div>
              <Bot size={22} />
            </div>
            <textarea
              value={aiPrompt}
              onChange={(event) => setAiPrompt(event.target.value)}
              placeholder="例如：最近三个月什么事情最让我有成就感？教资科目二投入了多少时间？"
            />
            <div className="ai-quick-actions">
              <button onClick={() => askAi("question")}>
                <Sparkles size={15} /> 回答问题
              </button>
              <button onClick={() => askAi("weekly")}>生成 AI 周报</button>
              <button onClick={() => askAi("monthly")}>生成 AI 月报</button>
              <button onClick={() => askAi("topic")}>生成专题总结</button>
            </div>
            {busy.startsWith("ai-") && (
              <div className="ai-thinking">
                <LoaderCircle className="spin" size={18} /> 正在阅读原始记录…
              </div>
            )}
            {aiAnswer && (
              <article className="ai-answer">
                <header>
                  <span>
                    <Sparkles size={14} />
                    {aiProvider === "local" ? "本地分析" : aiProvider.toUpperCase()}
                  </span>
                </header>
                <p>{aiAnswer}</p>
                {aiMeta && (
                  <footer className="ai-provenance" aria-label="AI 结果来源说明">
                    <span>{aiMeta.sourceCount} 条原始来源</span>
                    <span>可信度 {Math.round(aiMeta.confidence * 100)}%</span>
                    <span>约 {aiMeta.estimatedTokens} tokens</span>
                    <span>{aiMeta.costLabel}</span>
                    {aiMeta.durationMs !== null && (
                      <span>{(aiMeta.durationMs / 1000).toFixed(1)} 秒</span>
                    )}
                    {aiMeta.fallback && <span>已使用本地回退</span>}
                  </footer>
                )}
              </article>
            )}
          </section>
          <section className="summary-library">
            <header>
              <div>
                <span className="eyebrow">SUMMARY LIBRARY</span>
                <h2>总结历史</h2>
              </div>
              <em>{data.summaries.length}</em>
            </header>
            {data.summaries.length ? (
              data.summaries.slice(0, 8).map((summary) => (
                <article key={summary.id}>
                  <span>{summary.kind}</span>
                  <div>
                    <strong>{summary.title}</strong>
                    <p>{summary.content.slice(0, 160)}</p>
                    <small>
                      {dateOnly(summary.periodStart)}—{dateOnly(summary.periodEnd)}
                      · {summary.sourceIds.length} 条来源
                    </small>
                  </div>
                  <ChevronRight size={16} />
                </article>
              ))
            ) : (
              <div className="advanced-empty compact">
                <Sparkles size={24} />
                <p>运行自动化或生成一次专题总结后会保存在这里。</p>
              </div>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
