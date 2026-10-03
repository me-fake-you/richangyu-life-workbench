"use client";

import {
  Camera,
  BriefcaseBusiness,
  ChevronRight,
  Cloud,
  CloudOff,
  GripVertical,
  Heart,
  FlaskConical,
  Globe2,
  Inbox,
  LayoutGrid,
  LoaderCircle,
  Maximize2,
  Minimize2,
  Plus,
  Quote,
  Radar,
  RefreshCw,
  RotateCcw,
  Settings2,
  Sparkles,
  Target,
  WandSparkles,
  WalletCards,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type DashboardEvent = {
  id: string;
  title: string;
  content: string;
  mood: string;
  happenedAt: string;
};

type DashboardSchedule = {
  id: string;
  title: string;
  startAt: string;
  status: string;
};

type CardId =
  | "inspiration"
  | "schedule"
  | "top3"
  | "inbox"
  | "photos"
  | "mood"
  | "memory"
  | "finance"
  | "sideHustle"
  | "dailyIntel"
  | "researchRadar"
  | "jobRadar";

type DashboardLayoutItem = {
  id: CardId;
  size: "small" | "wide";
  visible: boolean;
};

type PreferencePayload = {
  preferences: { smartSort?: boolean };
  version: number;
  updatedAt: string | null;
  exists: boolean;
};

type SyncStatus = "loading" | "syncing" | "synced" | "offline";

const defaultLayout: DashboardLayoutItem[] = [
  { id: "inspiration", size: "wide", visible: true },
  { id: "schedule", size: "wide", visible: true },
  { id: "top3", size: "small", visible: true },
  { id: "inbox", size: "small", visible: true },
  { id: "photos", size: "small", visible: true },
  { id: "mood", size: "small", visible: true },
  { id: "memory", size: "wide", visible: true },
  { id: "finance", size: "wide", visible: true },
  { id: "sideHustle", size: "wide", visible: true },
  { id: "dailyIntel", size: "small", visible: true },
  { id: "researchRadar", size: "small", visible: true },
  { id: "jobRadar", size: "small", visible: true },
];

const cardMeta: Record<CardId, { title: string; eyebrow: string }> = {
  inspiration: { title: "写给今天", eyebrow: "DAILY NOTE" },
  schedule: { title: "今日时间表", eyebrow: "PLAN" },
  top3: { title: "今日三件事", eyebrow: "FOCUS" },
  inbox: { title: "生活收件箱", eyebrow: "CAPTURE" },
  photos: { title: "今日照片", eyebrow: "MEMORY" },
  mood: { title: "心情与精力", eyebrow: "STATE" },
  memory: { title: "往年今日", eyebrow: "ON THIS DAY" },
  finance: { title: "本月财务", eyebrow: "FINANCE" },
  sideHustle: { title: "兼职收益", eyebrow: "SIDE HUSTLE" },
  dailyIntel: { title: "今日热点", eyebrow: "DAILY INTEL" },
  researchRadar: { title: "AI研究", eyebrow: "RESEARCH RADAR" },
  jobRadar: { title: "求职雷达", eyebrow: "OPPORTUNITIES" },
};

type DashboardFinance = {
  summary: {
    totalIncome: number;
    totalExpense: number;
    net: number;
    outstanding: number;
    sideIncome: number;
    workMinutes: number;
  };
  settings: { maskAmounts: boolean };
};

type DashboardIntelligence = {
  feedItems: Array<{
    id: string;
    title: string;
    importance: string;
    readStatus: string;
  }>;
  papers: Array<{
    id: string;
    title: string;
    relevance: number;
    readingStatus: string;
    signal: { codeAvailable: boolean } | null;
  }>;
  postings: Array<{
    id: string;
    organizationName: string;
    title: string;
    openingStatus: string;
    deadlineAt: string | null;
  }>;
  summary: {
    unreadNews: number;
    relevantNews: number;
    researchToRead: number;
    openJobs: number;
    urgentJobs: number;
  };
};

type DashboardTask = {
  id: string;
  title: string;
  status: string;
  priority: string;
  today_rank: number | null;
  due_at: string | null;
};

const dailyNotes = [
  ["稳稳向前", "不必一次改变全部生活，今天认真完成一小块，就已经在靠近想去的地方。", "先完成最重要、也最容易开始的十分钟。"],
  ["允许生长", "成长很少发出巨响，它常常只是你在普通的一天里，又做了一次没有放弃的选择。", "为正在坚持的事情留下一条记录。"],
  ["专注此刻", "把注意力从遥远的结果收回来，放在眼前这一页、这一餐、这一段路。", "关掉一个干扰，完成一个完整时间块。"],
  ["温柔坚定", "你可以对自己温柔，也可以对目标坚定；这两件事从来不冲突。", "给今天的安排留出一段缓冲时间。"],
  ["积累证据", "不要只问自己够不够好，看看那些已经完成的小事——它们都是你正在变好的证据。", "完成后写一句真实感受。"],
  ["重新开始", "状态不好不等于一天失败。任何一个时刻，都可以成为今天新的起点。", "选一件五分钟内能开始的事。"],
  ["保留余地", "安排生活不是把每一分钟塞满，而是为重要的事和真实的自己留下位置。", "删除或延后一件并不重要的安排。"],
  ["相信复利", "今天看起来微小的阅读、运动和练习，会在未来某一天一起回答你。", "为长期目标投入一个不被打断的时间块。"],
  ["看见自己", "记录不是为了考核生活，而是为了在忙碌之后，仍然能够认出自己。", "留下一句话或一张今天的照片。"],
  ["先做再好", "开始时不需要完美，只需要让事情从零变成一。", "先做出一个可以继续修改的版本。"],
  ["尊重节奏", "慢一点并不等于停下。找到能够长期保持的速度，比短暂透支更重要。", "按真实精力重新安排今天。"],
  ["把握主动", "有些事情无法控制，但你仍可以决定把下一小时交给什么。", "为下一小时写下唯一重点。"],
  ["完成闭环", "真正带来轻松的不是列出更多计划，而是完成、记录，再从经验里调整。", "结束一个悬而未决的小任务。"],
  ["接受普通", "不是每一天都要闪闪发光。认真吃饭、按时休息、完成本分，也是一种可靠的生活。", "好好完成今天的一餐和一次休息。"],
  ["向内确认", "别急着用别人的进度衡量自己。你真正需要回答的，是今天有没有忠于自己的方向。", "写下这件事为什么对你重要。"],
  ["练习勇气", "勇气不是不害怕，而是带着一点不确定，仍然向前迈了一步。", "处理那件一直被推迟的小事。"],
  ["减少内耗", "反复责备昨天不会让今天更好，把精力还给下一次行动。", "把担心改写成一个具体动作。"],
  ["珍惜具体", "生活不是抽象的将来，它是此刻的阳光、手边的水和正在认真生活的你。", "记录一个今天值得记住的细节。"],
  ["保持好奇", "暂时不会并不可怕，它只是提醒你：这里还有一段可以探索的路。", "带着问题学习，而不是带着评判开始。"],
  ["为自己负责", "你不需要等到充满动力才开始，行动本身会慢慢把动力带回来。", "按下计时器，先投入十五分钟。"],
  ["庆祝完成", "别让下一个目标太快盖住这一次完成。停一下，承认自己确实做到了。", "为今天已经完成的事打一个勾。"],
  ["照顾能量", "精力也是计划的一部分。休息不是偏离轨道，而是让你有能力继续走。", "安排一段真正离开屏幕的休息。"],
  ["缩小问题", "当任务大得让人无法开始，就把它缩小到不再令人害怕。", "只写标题、只整理一页，或者只走第一公里。"],
  ["留下空间", "不是所有空白都需要被填满。有些答案，会在安静里自己浮现。", "给今天保留二十分钟没有目的的时间。"],
  ["诚实复盘", "计划没有完成不是审判，而是一条信息：也许时间估少了，也许方法需要改变。", "记录一次计划与实际的差异。"],
  ["照亮别人", "你认真生活的样子，也可能在不经意间成为别人继续努力的理由。", "向一个重要的人表达具体的感谢。"],
  ["守住重点", "忙碌不等于前进。今天真正重要的，也许只有一件。", "从三个优先项里圈出唯一核心。"],
  ["长期主义", "不追求某一天拼尽全力，而是让明天的自己仍然愿意回来。", "把目标调整到可持续的强度。"],
  ["接纳波动", "情绪和效率都会起伏，你的价值不会因此增减。", "先写下此刻状态，再决定下一步。"],
  ["完成比完美重要", "生活允许草稿存在。先让它真实发生，再慢慢把它变好。", "提交一个八十分但完整的版本。"],
  ["靠近热爱", "时间流向哪里，生活就会慢慢长成什么样子。", "今天为真正喜欢的事留半小时。"],
  ["整理内心", "有些混乱不是需要立刻解决，而是需要先被准确地说出来。", "把脑海里的事情全部放进收件箱。"],
];

function dayKey(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  return `${date.getMonth() + 1}-${date.getDate()}`;
}

function fullDayKey(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function dayOfYear(date: Date) {
  const start = new Date(date.getFullYear(), 0, 0);
  return Math.floor(
    (date.getTime() -
      start.getTime() +
      (start.getTimezoneOffset() - date.getTimezoneOffset()) * 60000) /
      86400000,
  );
}

function deviceId() {
  const key = "richangyu-device-id";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const created = crypto.randomUUID();
  window.localStorage.setItem(key, created);
  return created;
}

export function ConfigurableDashboard({
  events,
  schedules,
  inboxCount,
  photoCount,
  onView,
}: {
  events: DashboardEvent[];
  schedules: DashboardSchedule[];
  inboxCount: number;
  photoCount: number;
  onView: (view: string) => void;
}) {
  const [layout, setLayout] = useState<DashboardLayoutItem[]>(defaultLayout);
  const [editing, setEditing] = useState(false);
  const [dragId, setDragId] = useState<CardId | null>(null);
  const [noteOffset, setNoteOffset] = useState(0);
  const [smartSort, setSmartSort] = useState(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("loading");
  const [syncUpdatedAt, setSyncUpdatedAt] = useState<string | null>(null);
  const preferenceVersion = useRef(0);
  const [finance, setFinance] = useState<DashboardFinance | null>(null);
  const [intelligence, setIntelligence] =
    useState<DashboardIntelligence | null>(null);
  const [tasks, setTasks] = useState<DashboardTask[]>([]);
  const [referenceNow] = useState(() => Date.now());

  useEffect(() => {
    fetch("/api/advanced", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload: { dashboardLayout?: DashboardLayoutItem[] }) => {
        if (
          Array.isArray(payload.dashboardLayout) &&
          payload.dashboardLayout.length
        ) {
          const incoming = payload.dashboardLayout.filter((item) =>
            defaultLayout.some((candidate) => candidate.id === item.id),
          );
          const missing = defaultLayout.filter(
            (candidate) => !incoming.some((item) => item.id === candidate.id),
          );
          setLayout([...incoming, ...missing]);
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    fetch("/api/finance", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload: DashboardFinance) => setFinance(payload))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    fetch("/api/intelligence", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload: DashboardIntelligence) => setIntelligence(payload))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    fetch("/api/tasks", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload: { tasks?: DashboardTask[] }) => setTasks(payload.tasks ?? []))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadPreferences() {
      try {
        const response = await fetch("/api/preferences", {
          cache: "no-store",
        });
        const payload = (await response.json()) as PreferencePayload & {
          error?: string;
        };
        if (!response.ok) throw new Error(payload.error);
        if (cancelled) return;

        preferenceVersion.current = payload.version;
        setSyncUpdatedAt(payload.updatedAt);
        const legacy = window.localStorage.getItem(
          "richangyu-smart-dashboard",
        );
        const nextSmartSort = payload.exists
          ? payload.preferences.smartSort !== false
          : legacy !== "off";
        setSmartSort(nextSmartSort);

        if (!payload.exists && legacy !== null) {
          const saveResponse = await fetch("/api/preferences", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              patch: { smartSort: nextSmartSort },
              expectedVersion: 0,
              deviceId: deviceId(),
            }),
          });
          const saved = (await saveResponse.json()) as PreferencePayload;
          if (saveResponse.ok && !cancelled) {
            preferenceVersion.current = saved.version;
            setSyncUpdatedAt(saved.updatedAt);
            window.localStorage.removeItem("richangyu-smart-dashboard");
          }
        }
        if (!cancelled) setSyncStatus("synced");
      } catch {
        if (!cancelled) setSyncStatus("offline");
      }
    }

    void loadPreferences();
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(next: DashboardLayoutItem[]) {
    setLayout(next);
    setSyncStatus("syncing");
    try {
      const response = await fetch("/api/advanced", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "dashboard.save",
          payload: { layout: next },
        }),
      });
      if (!response.ok) throw new Error("dashboard sync failed");
      setSyncUpdatedAt(new Date().toISOString());
      setSyncStatus("synced");
    } catch {
      setSyncStatus("offline");
    }
  }

  async function saveSmartSort(next: boolean) {
    setSmartSort(next);
    setSyncStatus("syncing");
    let expectedVersion = preferenceVersion.current;

    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const response = await fetch("/api/preferences", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            patch: { smartSort: next },
            expectedVersion,
            deviceId: deviceId(),
          }),
        });
        const payload = (await response.json()) as PreferencePayload & {
          error?: string;
        };
        if (response.status === 409 && attempt === 0) {
          expectedVersion = payload.version;
          preferenceVersion.current = payload.version;
          continue;
        }
        if (!response.ok) throw new Error(payload.error);
        preferenceVersion.current = payload.version;
        setSyncUpdatedAt(payload.updatedAt);
        window.localStorage.removeItem("richangyu-smart-dashboard");
        setSyncStatus("synced");
        return;
      }
      throw new Error("preference conflict");
    } catch {
      setSyncStatus("offline");
    }
  }

  function drop(targetId: CardId) {
    if (!dragId || dragId === targetId) return;
    const next = [...layout];
    const from = next.findIndex((item) => item.id === dragId);
    const to = next.findIndex((item) => item.id === targetId);
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setDragId(null);
    save(next);
  }

  function patchCard(id: CardId, patch: Partial<DashboardLayoutItem>) {
    save(layout.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  const yearsAgo = useMemo(() => {
    const today = new Date();
    return events
      .filter((event) => {
        const date = new Date(event.happenedAt);
        return (
          dayKey(date) === dayKey(today) &&
          date.getFullYear() < today.getFullYear()
        );
      })
      .slice(0, 3);
  }, [events]);
  const latestMood = events[0]?.mood || "等待记录";
  const today = new Date();
  const hour = today.getHours();
  const dayScene =
    hour < 11 ? "早晨" : hour < 18 ? "白天" : hour < 23 ? "晚上" : "深夜";
  const todayEvents = events.filter(
    (event) => fullDayKey(event.happenedAt) === fullDayKey(today),
  );
  const completedSchedules = schedules.filter(
    (item) => item.status === "已完成",
  ).length;
  const noteIndex =
    (today.getFullYear() * 37 + dayOfYear(today) + noteOffset) %
    dailyNotes.length;
  const [noteTheme, noteText, noteAction] = dailyNotes[noteIndex];
  const progressCopy = completedSchedules
    ? `今天已经完成 ${completedSchedules} 项安排，继续保持自己的节奏。`
    : todayEvents.length
      ? `今天已经留下 ${todayEvents.length} 条生活记录，真实发生的都值得被看见。`
      : schedules.length
        ? `今天有 ${schedules.length} 项安排，不必全部同时开始。`
        : "今天还很宽阔，你可以从一件真正重要的事开始。";
  const displayLayout = useMemo(() => {
    if (!smartSort || editing) return layout;
    const sceneOrder: Record<string, CardId[]> = {
      早晨: ["inspiration", "dailyIntel", "researchRadar", "jobRadar", "schedule", "top3", "sideHustle", "finance", "inbox", "mood", "photos", "memory"],
      白天: ["schedule", "top3", "jobRadar", "researchRadar", "dailyIntel", "sideHustle", "inbox", "finance", "inspiration", "photos", "mood", "memory"],
      晚上: ["inspiration", "mood", "photos", "finance", "dailyIntel", "researchRadar", "jobRadar", "sideHustle", "schedule", "memory", "inbox", "top3"],
      深夜: ["inspiration", "mood", "memory", "dailyIntel", "researchRadar", "jobRadar", "finance", "sideHustle", "photos", "schedule", "inbox", "top3"],
    };
    const priority = sceneOrder[dayScene];
    return [...layout].sort(
      (a, b) => priority.indexOf(a.id) - priority.indexOf(b.id),
    );
  }, [dayScene, editing, layout, smartSort]);

  function renderCard(id: CardId) {
    if (id === "inspiration") {
      return (
        <div className="daily-inspiration">
          <div className="inspiration-mark">
            <Quote size={22} />
          </div>
          <div>
            <span>{noteTheme} · 今年第 {dayOfYear(today)} 天</span>
            <blockquote>{noteText}</blockquote>
            <p>
              <strong>今天可以这样做：</strong>
              {noteAction}
            </p>
            <small>{progressCopy}</small>
          </div>
          <button
            onClick={() => setNoteOffset((current) => current + 1)}
            title="今天想换一句"
          >
            <RefreshCw size={14} /> 换一句
          </button>
        </div>
      );
    }
    if (id === "schedule") {
      return schedules.length ? (
        schedules.slice(0, 4).map((item) => (
          <div className="config-row" key={item.id}>
            <time>
              {new Date(item.startAt).toLocaleTimeString("zh-CN", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </time>
            <span>{item.title}</span>
            <em>{item.status}</em>
          </div>
        ))
      ) : (
        <p className="config-empty">今天还没有时间安排。</p>
      );
    }
    if (id === "top3") {
      const topTasks = tasks
        .filter((task) => task.today_rank && task.status !== "已完成")
        .sort((a, b) => Number(a.today_rank) - Number(b.today_rank));
      return (
        <button className="config-priorities" onClick={() => onView("tasks")}>
          {[0, 1, 2].map((index) => (
            <span key={index}>
              <i>{index + 1}</i>
              {topTasks[index]?.title || "留给一件重要的事"}
            </span>
          ))}
        </button>
      );
    }
    if (id === "inbox") {
      return (
        <button className="config-metric" onClick={() => onView("inbox")}>
          <Inbox size={20} />
          <strong>{inboxCount}</strong>
          <span>条内容等待整理</span>
          <ChevronRight size={15} />
        </button>
      );
    }
    if (id === "photos") {
      return (
        <button className="config-metric" onClick={() => onView("gallery")}>
          <Camera size={20} />
          <strong>{photoCount}</strong>
          <span>张照片进入记忆</span>
          <ChevronRight size={15} />
        </button>
      );
    }
    if (id === "mood") {
      return (
        <div className="config-state">
          <Heart size={22} />
          <strong>{latestMood}</strong>
          <span>{events.length ? `${events.length} 条今日记录` : "记录后看见趋势"}</span>
        </div>
      );
    }
    if (id === "finance") {
      const masked = finance?.settings.maskAmounts;
      const format = (value: number) =>
        masked
          ? "¥ ••••"
          : new Intl.NumberFormat("zh-CN", {
              style: "currency",
              currency: "CNY",
              maximumFractionDigits: 0,
            }).format(value || 0);
      return (
        <button className="dashboard-finance-card" onClick={() => onView("finance")}>
          <span><WalletCards size={20} /></span>
          <div><small>收入</small><strong>{format(finance?.summary.totalIncome || 0)}</strong></div>
          <div><small>支出</small><strong>{format(finance?.summary.totalExpense || 0)}</strong></div>
          <div><small>结余</small><strong>{format(finance?.summary.net || 0)}</strong></div>
          <div><small>兼职待收</small><strong>{format(finance?.summary.outstanding || 0)}</strong></div>
          <ChevronRight size={15} />
        </button>
      );
    }
    if (id === "sideHustle") {
      const masked = finance?.settings.maskAmounts;
      const amount = masked
        ? "¥ ••••"
        : new Intl.NumberFormat("zh-CN", {
            style: "currency",
            currency: "CNY",
            maximumFractionDigits: 0,
          }).format(finance?.summary.sideIncome || 0);
      const minutes = finance?.summary.workMinutes || 0;
      return (
        <button className="dashboard-hustle-card" onClick={() => onView("sideHustle")}>
          <span><BriefcaseBusiness size={20} /></span>
          <div>
            <small>本月兼职到账</small>
            <strong>{amount}</strong>
            <p>已工作 {Math.round((minutes / 60) * 10) / 10} 小时 · 待收款在收款中心统一处理</p>
          </div>
          <ChevronRight size={15} />
        </button>
      );
    }
    if (id === "dailyIntel") {
      const first = intelligence?.feedItems.find(
        (item) => item.readStatus !== "已读",
      );
      return (
        <button
          className="dashboard-intelligence-card tone-news"
          onClick={() => onView("intelligence")}
        >
          <span><Globe2 size={20} /></span>
          <div>
            <strong>{intelligence?.summary.unreadNews || 0} 条重要信息</strong>
            <p>
              {intelligence?.summary.relevantNews || 0} 条与你相关
              {first ? ` · ${first.title}` : " · 等待加入真实来源"}
            </p>
          </div>
          <ChevronRight size={15} />
        </button>
      );
    }
    if (id === "researchRadar") {
      const paper = [...(intelligence?.papers || [])].sort(
        (a, b) => b.relevance - a.relevance,
      )[0];
      const openSource = intelligence?.papers.filter(
        (item) => item.signal?.codeAvailable,
      ).length;
      return (
        <button
          className="dashboard-intelligence-card tone-research"
          onClick={() => onView("intelligence")}
        >
          <span><FlaskConical size={20} /></span>
          <div>
            <strong>{intelligence?.summary.researchToRead || 0} 篇准备精读</strong>
            <p>
              {openSource || 0} 个开源项目
              {paper ? ` · 最高相关 ${paper.relevance}%` : " · 等待添加论文"}
            </p>
          </div>
          <ChevronRight size={15} />
        </button>
      );
    }
    if (id === "jobRadar") {
      const urgent = intelligence?.postings.find((item) => {
        if (!item.deadlineAt) return false;
        const days = Math.ceil(
          (new Date(item.deadlineAt).getTime() - referenceNow) / 86400000,
        );
        return days >= 0 && days <= 7;
      });
      return (
        <button
          className="dashboard-intelligence-card tone-job"
          onClick={() => onView("jobs")}
        >
          <span><Radar size={20} /></span>
          <div>
            <strong>{intelligence?.summary.openJobs || 0} 个开放岗位</strong>
            <p>
              {intelligence?.summary.urgentJobs || 0} 个七天内截止
              {urgent ? ` · ${urgent.organizationName}` : " · 等待添加目标银行"}
            </p>
          </div>
          <ChevronRight size={15} />
        </button>
      );
    }
    return yearsAgo.length ? (
      yearsAgo.map((event) => (
        <div className="memory-snippet" key={event.id}>
          <Sparkles size={15} />
          <div>
            <strong>{new Date(event.happenedAt).getFullYear()} 年的今天</strong>
            <p>{event.title || event.content.slice(0, 100)}</p>
          </div>
        </div>
      ))
    ) : (
      <p className="config-empty">持续记录后，这里会出现往年今日。</p>
    );
  }

  return (
    <section className={`configurable-dashboard ${editing ? "editing" : ""}`}>
      <header>
        <div>
          <span className="heading-icon green">
            <LayoutGrid size={17} />
          </span>
          <div>
            <span className="eyebrow">MY DASHBOARD</span>
            <h2>{smartSort && !editing ? `${dayScene}智能工作台` : "可配置今日工作台"}</h2>
          </div>
        </div>
        <div className="dashboard-edit-actions">
          <span
            className={`dashboard-sync-status ${syncStatus}`}
            title={
              syncUpdatedAt
                ? `最近同步：${new Date(syncUpdatedAt).toLocaleString("zh-CN")}`
                : "正在连接云端数据"
            }
          >
            {syncStatus === "offline" ? (
              <CloudOff size={14} />
            ) : syncStatus === "loading" || syncStatus === "syncing" ? (
              <LoaderCircle className="spin" size={14} />
            ) : (
              <Cloud size={14} />
            )}
            {syncStatus === "offline"
              ? "等待联网"
              : syncStatus === "loading"
                ? "连接云端"
                : syncStatus === "syncing"
                  ? "同步中"
                  : "云端已同步"}
          </span>
          {!editing && (
            <button
              className={smartSort ? "smart-active" : ""}
              onClick={() => {
                const next = !smartSort;
                void saveSmartSort(next);
              }}
              title="按早晨、白天和晚上自动调整卡片顺序"
            >
              <WandSparkles size={14} />
              {smartSort ? "智能排序中" : "固定顺序"}
            </button>
          )}
          {editing && (
            <button onClick={() => save(defaultLayout)}>
              <RotateCcw size={14} /> 恢复默认
            </button>
          )}
          <button onClick={() => setEditing(!editing)}>
            {editing ? <X size={15} /> : <Settings2 size={15} />}
            {editing ? "完成" : "调整卡片"}
          </button>
        </div>
      </header>

      <div className="config-card-grid">
        {displayLayout
          .filter((item) => item.visible)
          .map((item) => (
            <article
              key={item.id}
              className={`config-card ${item.size}`}
              draggable={editing}
              onDragStart={() => setDragId(item.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => drop(item.id)}
            >
              <header>
                {editing && <GripVertical size={16} />}
                <div>
                  <small>{cardMeta[item.id].eyebrow}</small>
                  <strong>{cardMeta[item.id].title}</strong>
                </div>
                {editing && (
                  <span className="card-edit-buttons">
                    <button
                      aria-label="调整卡片大小"
                      onClick={() =>
                        patchCard(item.id, {
                          size: item.size === "wide" ? "small" : "wide",
                        })
                      }
                    >
                      {item.size === "wide" ? (
                        <Minimize2 size={14} />
                      ) : (
                        <Maximize2 size={14} />
                      )}
                    </button>
                    <button
                      aria-label="隐藏卡片"
                      onClick={() => patchCard(item.id, { visible: false })}
                    >
                      <X size={14} />
                    </button>
                  </span>
                )}
              </header>
              <div className="config-card-body">{renderCard(item.id)}</div>
            </article>
          ))}
      </div>

      {editing && layout.some((item) => !item.visible) && (
        <div className="hidden-card-tray">
          <Target size={15} />
          <span>已隐藏：</span>
          {layout
            .filter((item) => !item.visible)
            .map((item) => (
              <button
                key={item.id}
                onClick={() => patchCard(item.id, { visible: true })}
              >
                <Plus size={13} /> {cardMeta[item.id].title}
              </button>
            ))}
        </div>
      )}
    </section>
  );
}
