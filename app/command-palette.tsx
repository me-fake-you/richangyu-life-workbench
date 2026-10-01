"use client";

import {
  Bot,
  CalendarPlus,
  Check,
  Command,
  Compass,
  FileSpreadsheet,
  ImagePlus,
  Layers3,
  LoaderCircle,
  Mic,
  ReceiptText,
  ListPlus,
  Search,
  Sparkles,
  Trash2,
  Utensils,
  X,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";

type CommandTemplate = {
  name: string;
  icon: string;
  description: string;
  fields: Array<{
    id: string;
    name: string;
    type: string;
    options?: string[];
  }>;
};

export type CommandNavigationTarget = {
  id: string;
  label: string;
  description: string;
  keywords?: string[];
};

type RecordAction = {
  kind: "record";
  title: string;
  content: string;
  happenedAt: string;
  mood: string;
};

type FinanceAction = {
  kind: "finance";
  type: "支出";
  amount: number;
  category: string;
  note: string;
  occurredAt: string;
};

type MealAction = {
  kind: "meal";
  mealType: string;
  note: string;
  eatenAt: string;
};

type CommandAction = RecordAction | FinanceAction | MealAction;

type CommandPlan =
  | CommandAction
  | {
      kind: "task";
      title: string;
      priority: string;
      dueAt: string | null;
    }
  | {
      kind: "schedule";
      title: string;
      startAt: string;
      endAt: string;
      category: string;
      plannedMinutes: number;
    }
  | {
      kind: "table";
      template: CommandTemplate;
    }
  | {
      kind: "search";
      query: string;
    }
  | {
      kind: "ask";
      prompt: string;
    }
  | {
      kind: "navigate";
      target: CommandNavigationTarget;
    }
  | {
      kind: "bundle";
      actions: CommandAction[];
    };

export type CommandResult = {
  kind: "record" | "task" | "schedule" | "table" | "finance" | "meal";
  id: string;
  title: string;
};

type SpeechRecognitionEventLike = {
  results: ArrayLike<{
    0: { transcript: string };
  }>;
};

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function speechRecognitionConstructor() {
  if (typeof window === "undefined") return null;
  const speechWindow = window as typeof window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return (
    speechWindow.SpeechRecognition ??
    speechWindow.webkitSpeechRecognition ??
    null
  );
}

function localDateTime(date: Date) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function parseTime(text: string) {
  const match = text.match(/(凌晨|早上|上午|中午|下午|晚上)?\s*(\d{1,2})(?:点|时)(?:(\d{1,2})分?)?/);
  if (!match) return null;
  let hour = Number(match[2]);
  const minute = Number(match[3] || 0);
  if (["下午", "晚上"].includes(match[1]) && hour < 12) hour += 12;
  if (match[1] === "中午" && hour < 11) hour += 12;
  if (match[1] === "凌晨" && hour === 12) hour = 0;
  return { hour: Math.min(23, hour), minute: Math.min(59, minute) };
}

function parseCommand(
  raw: string,
  templates: CommandTemplate[],
  navigationTargets: CommandNavigationTarget[],
): CommandPlan | null {
  const input = raw.trim();
  if (!input) return null;
  const navigationMatch = input.match(/^(?:打开|进入|前往|去|切换到)\s*(.+)$/);
  const navigationQuery = (navigationMatch?.[1] ?? input).trim().toLowerCase();
  const navigationTarget = navigationTargets.find((target) => {
    const aliases = [target.label, ...(target.keywords ?? [])].map((item) =>
      item.toLowerCase(),
    );
    return aliases.some(
      (alias) =>
        alias === navigationQuery ||
        (Boolean(navigationMatch) &&
          (alias.includes(navigationQuery) || navigationQuery.includes(alias))),
    );
  });
  if (navigationTarget) return { kind: "navigate", target: navigationTarget };

  if (/^(添加|创建|新建|记下)(一个|一项)?任务|^(任务|待办)[:：]/.test(input)) {
    const due = new Date();
    if (input.includes("后天")) due.setDate(due.getDate() + 2);
    else if (input.includes("明天")) due.setDate(due.getDate() + 1);
    const parsedTime = parseTime(input);
    if (parsedTime) due.setHours(parsedTime.hour, parsedTime.minute, 0, 0);
    else due.setHours(23, 59, 0, 0);
    const title = input
      .replace(/^(添加|创建|新建|记下)(一个|一项)?任务[:：]?/, "")
      .replace(/^(任务|待办)[:：]?/, "")
      .replace(/今天|明天|后天/g, "")
      .replace(/(凌晨|早上|上午|中午|下午|晚上)?\s*\d{1,2}(?:点|时)(?:\d{1,2}分?)?/g, "")
      .trim();
    return {
      kind: "task",
      title: title || "新的任务",
      priority: /紧急|必须|P0/i.test(input) ? "P0" : /重要|P1/i.test(input) ? "P1" : "P2",
      dueAt: /今天|明天|后天|截止/.test(input) ? due.toISOString() : null,
    };
  }

  const tableMatch = input.match(/(?:建立|创建|新建)(?:一个|一张)?(.+?表)(?:格)?$/);
  if (tableMatch) {
    const wanted = tableMatch[1];
    const aliases: Array<[RegExp, string]> = [
      [/错题|教资/, "错题表"],
      [/教学|课程/, "教学记录表"],
      [/科研|实验/, "科研实验表"],
      [/论文/, "论文进度表"],
      [/学习|备考/, "学习计划表"],
      [/读书|阅读/, "读书表"],
      [/运动|健身/, "运动表"],
      [/旅行|行程/, "旅行表"],
      [/记账|消费|财务/, "简单记账表"],
      [/求职|投递/, "求职投递表"],
    ];
    const aliased = aliases.find(([pattern]) => pattern.test(wanted))?.[1];
    const template =
      templates.find((item) => item.name === aliased) ??
      templates.find((item) => wanted.includes(item.name.replace("表", ""))) ??
      {
        name: wanted.endsWith("表") ? wanted : `${wanted}表`,
        icon: "表",
        description: "由全局指令创建的自定义表格",
        fields: [
          { id: "title", name: "名称", type: "text" },
          { id: "status", name: "状态", type: "select", options: ["未开始", "进行中", "已完成"] },
          { id: "date", name: "日期", type: "date" },
          { id: "note", name: "备注", type: "text" },
        ],
      };
    return { kind: "table", template };
  }

  if (
    /^(记录|记下|补记)/.test(input) &&
    !/(早餐|早饭|午餐|午饭|晚餐|晚饭|加餐|夜宵|花了|消费|付款|支出)/.test(
      input,
    )
  ) {
    const content = input.replace(/^(记录|记下|补记)(一下)?/, "").trim();
    const mood = /开心|高兴|很好|幸福/.test(content)
      ? "开心"
      : /焦虑|紧张/.test(content)
        ? "焦虑"
        : /疲惫|很累|累了/.test(content)
          ? "疲惫"
          : "平静";
    const happened = new Date();
    if (input.includes("昨天")) happened.setDate(happened.getDate() - 1);
    return {
      kind: "record",
      title: content.replace(/[，。].*$/, "").slice(0, 38) || "此刻记录",
      content,
      happenedAt: localDateTime(happened),
      mood,
    };
  }

  if (/安排|日程|提醒|计划/.test(input) && parseTime(input)) {
    const parsedTime = parseTime(input)!;
    const start = new Date();
    if (input.includes("后天")) start.setDate(start.getDate() + 2);
    else if (input.includes("明天")) start.setDate(start.getDate() + 1);
    start.setHours(parsedTime.hour, parsedTime.minute, 0, 0);
    const hourDuration = input.match(/(\d+(?:\.\d+)?)\s*个?小时/);
    const minuteDuration = input.match(/(\d+)\s*分钟/);
    const plannedMinutes = hourDuration
      ? Math.round(Number(hourDuration[1]) * 60)
      : /一\s*个?小时/.test(input)
        ? 60
        : /半\s*个?小时/.test(input)
          ? 30
      : minuteDuration
        ? Number(minuteDuration[1])
        : 60;
    const end = new Date(start.getTime() + plannedMinutes * 60000);
    const title =
      input
        .replace(/今天|明天|后天/g, "")
        .replace(/(凌晨|早上|上午|中午|下午|晚上)?\s*\d{1,2}(?:点|时)(?:\d{1,2}分?)?/g, "")
        .replace(/\d+(?:\.\d+)?\s*个?小时|一\s*个?小时|半\s*个?小时|\d+\s*分钟/g, "")
        .replace(/帮我|给我|安排|一个|一场|日程|提醒|计划/g, "")
        .trim() || "新的安排";
    const category = /课|学习|英语|教资|考试/.test(title)
      ? "学习"
      : /论文|实验|科研/.test(title)
        ? "科研"
        : /跑步|运动|健身/.test(title)
          ? "运动"
          : "生活";
    return {
      kind: "schedule",
      title,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      category,
      plannedMinutes,
    };
  }

  const expenseMatch = input.match(
    /(?:花了|消费|付款|支出)\s*(?:¥|￥)?\s*(\d+(?:\.\d+)?)|(?:¥|￥)?\s*(\d+(?:\.\d+)?)\s*元.*(?:午饭|晚饭|早餐|打车|购物|买)/,
  );
  const actions: CommandAction[] = [];
  if (expenseMatch) {
    const value = Number(expenseMatch[1] || expenseMatch[2] || 0);
    const category = /饭|早餐|午餐|晚餐|奶茶|咖啡|吃/.test(input)
      ? "餐饮"
      : /打车|公交|地铁|交通/.test(input)
        ? "交通"
        : /教材|课程|考试|报名/.test(input)
          ? "学习考试"
          : /买|购物/.test(input)
            ? "购物"
            : "其他支出";
    actions.push({
      kind: "finance",
      type: "支出",
      amount: value,
      category,
      note: input,
      occurredAt: localDateTime(new Date()),
    });
  }

  if (/(早餐|早饭|午餐|午饭|晚餐|晚饭|加餐|夜宵|吃了|喝了)/.test(input)) {
    const hour = new Date().getHours();
    const mealType = /早餐|早饭/.test(input)
      ? "早餐"
      : /晚餐|晚饭/.test(input)
        ? "晚餐"
        : /加餐|夜宵/.test(input)
          ? "加餐"
          : /午餐|午饭/.test(input)
            ? "午餐"
            : hour < 10
              ? "早餐"
              : hour < 16
                ? "午餐"
                : "晚餐";
    const note = input
      .replace(/^(记录|记下|补记)(一下)?/, "")
      .replace(/(?:花了|消费|付款|支出)\s*(?:¥|￥)?\s*\d+(?:\.\d+)?\s*元?/g, "")
      .replace(/心情[^，。；;]*/g, "")
      .replace(/[，,。；;]\s*$/, "")
      .trim();
    actions.unshift({
      kind: "meal",
      mealType,
      note: note || input,
      eatenAt: localDateTime(new Date()),
    });
  }

  if (/心情|开心|高兴|不错|幸福|焦虑|紧张|疲惫|很累|累了/.test(input)) {
    const mood = /开心|高兴|很好|幸福|不错/.test(input)
      ? "开心"
      : /焦虑|紧张/.test(input)
        ? "焦虑"
        : /疲惫|很累|累了/.test(input)
          ? "疲惫"
          : "平静";
    actions.push({
      kind: "record",
      title: input.replace(/[，。].*$/, "").slice(0, 38) || "此刻记录",
      content: input.replace(/^(记录|记下|补记)(一下)?/, "").trim(),
      happenedAt: localDateTime(new Date()),
      mood,
    });
  }

  if (actions.length > 1) {
    return { kind: "bundle", actions };
  }
  if (actions[0]) {
    return actions[0];
  }

  if (/^(问|帮我|总结|分析)|[？?]$/.test(input)) {
    return { kind: "ask", prompt: input.replace(/^问[:：]?/, "").trim() };
  }

  return {
    kind: "search",
    query: input.replace(/^搜索[:：]?/, "").trim(),
  };
}

function planMeta(plan: CommandPlan) {
  if (plan.kind === "record") {
    return {
      icon: Sparkles,
      eyebrow: "LIFE EVENT",
      title: `记录：${plan.title}`,
      details: [
        `发生时间 ${new Date(plan.happenedAt).toLocaleString("zh-CN")}`,
        `心情 ${plan.mood}`,
      ],
    };
  }
  if (plan.kind === "schedule") {
    return {
      icon: CalendarPlus,
      eyebrow: "SCHEDULE",
      title: plan.title,
      details: [
        `${new Date(plan.startAt).toLocaleString("zh-CN")}—${new Date(plan.endAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`,
        `${plan.category} · ${plan.plannedMinutes} 分钟`,
      ],
    };
  }
  if (plan.kind === "task") {
    return {
      icon: ListPlus,
      eyebrow: "TASK PLANNER",
      title: `创建任务：${plan.title}`,
      details: [
        `优先级 ${plan.priority}`,
        plan.dueAt ? `截止 ${new Date(plan.dueAt).toLocaleString("zh-CN")}` : "稍后再安排时间",
      ],
    };
  }
  if (plan.kind === "table") {
    return {
      icon: FileSpreadsheet,
      eyebrow: "DATABASE",
      title: `创建“${plan.template.name}”`,
      details: [
        plan.template.description,
        `${plan.template.fields.length} 个预置字段`,
      ],
    };
  }
  if (plan.kind === "ask") {
    return {
      icon: Bot,
      eyebrow: "LIFE ASSISTANT",
      title: plan.prompt,
      details: ["只读取非私密站内数据", "回答会标注模型与原始记录数量"],
    };
  }
  if (plan.kind === "navigate") {
    return {
      icon: Compass,
      eyebrow: "QUICK NAVIGATION",
      title: `打开${plan.target.label}`,
      details: [plan.target.description, "不会修改任何数据"],
    };
  }
  if (plan.kind === "finance") {
    return {
      icon: ReceiptText,
      eyebrow: "QUICK FINANCE",
      title: `记录${plan.category}支出 ¥${plan.amount}`,
      details: [
        new Date(plan.occurredAt).toLocaleString("zh-CN"),
        "将进入财务账本；兼职到账请在收款中心登记，以免重复",
      ],
    };
  }
  if (plan.kind === "meal") {
    return {
      icon: Utensils,
      eyebrow: "MEAL CAPTURE",
      title: `记录${plan.mealType}：${plan.note}`,
      details: [
        new Date(plan.eatenAt).toLocaleString("zh-CN"),
        "将进入饮食与营养，并按文字或照片估算热量",
      ],
    };
  }
  if (plan.kind === "bundle") {
    const labels = plan.actions.map((action) =>
      action.kind === "meal"
        ? `${action.mealType}与热量`
        : action.kind === "finance"
          ? `${action.category}支出 ¥${action.amount}`
          : `生活记录与心情`,
    );
    return {
      icon: Layers3,
      eyebrow: "MULTI-ACTION CAPTURE",
      title: `一次完成 ${plan.actions.length} 项记录`,
      details: labels,
    };
  }
  return {
    icon: Search,
    eyebrow: "GLOBAL SEARCH",
    title: `搜索“${plan.query}”`,
    details: ["生活记录、时间表、人物、地点和表格"],
  };
}

export function CommandPalette({
  templates,
  navigationTargets,
  onClose,
  onCreateRecord,
  onCreateSchedule,
  onCreateTask,
  onCreateTable,
  onCreateTransaction,
  onCreateMeal,
  onUndo,
  onSearch,
  onNavigate,
  onOpenRecord,
  onOpenSchedule,
  onNotice,
}: {
  templates: CommandTemplate[];
  navigationTargets: CommandNavigationTarget[];
  onClose: () => void;
  onCreateRecord: (payload: {
    title: string;
    content: string;
    happenedAt: string;
    mood: string;
  }, photo?: File | null) => Promise<CommandResult>;
  onCreateSchedule: (payload: Record<string, unknown>) => Promise<CommandResult>;
  onCreateTask: (payload: Record<string, unknown>) => Promise<CommandResult>;
  onCreateTable: (template: CommandTemplate) => Promise<CommandResult>;
  onCreateTransaction: (payload: Record<string, unknown>) => Promise<CommandResult>;
  onCreateMeal: (
    payload: MealAction,
    photo?: File | null,
  ) => Promise<CommandResult>;
  onUndo: (results: CommandResult[]) => Promise<void>;
  onSearch: (query: string) => void;
  onNavigate: (targetId: string) => void;
  onOpenRecord: () => void;
  onOpenSchedule: () => void;
  onNotice: (notice: string) => void;
}) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [completed, setCompleted] = useState<CommandResult[]>([]);
  const speechRef = useRef<SpeechRecognitionLike | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const [answer, setAnswer] = useState<{
    text: string;
    provider: string;
    model: string;
    sourceCount: number;
  } | null>(null);
  const plan = useMemo(
    () => parseCommand(input, templates, navigationTargets),
    [input, navigationTargets, templates],
  );
  const meta = plan ? planMeta(plan) : null;

  async function executeAction(action: CommandAction) {
    if (action.kind === "record") return onCreateRecord(action, null);
    if (action.kind === "finance") return onCreateTransaction(action);
    return onCreateMeal(action, photo);
  }

  async function execute() {
    if (!plan) return;
    if (plan.kind === "search") {
      onSearch(plan.query);
      onClose();
      return;
    }
    if (plan.kind === "navigate") {
      onNavigate(plan.target.id);
      onClose();
      return;
    }
    setBusy(true);
    try {
      if (plan.kind === "record") {
        setCompleted([await onCreateRecord(plan, photo)]);
      } else if (plan.kind === "schedule") {
        setCompleted([await onCreateSchedule({
          ...plan,
          repeatRule: "不重复",
          reminderMinutes: 10,
        })]);
      } else if (plan.kind === "task") {
        setCompleted([await onCreateTask(plan)]);
      } else if (plan.kind === "table") {
        setCompleted([await onCreateTable(plan.template)]);
      } else if (plan.kind === "finance") {
        setCompleted([await onCreateTransaction(plan)]);
      } else if (plan.kind === "meal") {
        setCompleted([await onCreateMeal(plan, photo)]);
      } else if (plan.kind === "bundle") {
        const results: CommandResult[] = [];
        for (const action of plan.actions) {
          results.push(await executeAction(action));
          setCompleted([...results]);
        }
      } else {
        const response = await fetch("/api/ai", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ mode: "question", prompt: plan.prompt }),
        });
        const payload = (await response.json()) as {
          answer?: string;
          provider?: string;
          model?: string;
          sourceIds?: string[];
          error?: string;
        };
        if (!response.ok) throw new Error(payload.error || "生活助理暂时无法回答。");
        setAnswer({
          text: payload.answer || "暂时没有足够信息。",
          provider: payload.provider || "local",
          model: payload.model || "本地统计与检索",
          sourceCount: payload.sourceIds?.length || 0,
        });
      }
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "指令执行失败。");
    } finally {
      setBusy(false);
    }
  }

  function startListening() {
    const Constructor = speechRecognitionConstructor();
    if (!Constructor) {
      onNotice("当前浏览器不支持语音输入，可在手机键盘中使用系统语音输入。");
      return;
    }
    const recognition = new Constructor();
    recognition.lang = "zh-CN";
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim();
      if (transcript) setInput(transcript);
    };
    recognition.onerror = () => {
      setListening(false);
      onNotice("没有听清，请再试一次或直接输入文字。");
    };
    recognition.onend = () => setListening(false);
    speechRef.current = recognition;
    setListening(true);
    recognition.start();
  }

  return (
    <div className="command-layer" role="presentation">
      <button className="command-backdrop" onClick={onClose} aria-label="关闭指令栏" />
      <section className="command-palette" role="dialog" aria-modal="true" aria-label="全局指令栏">
        <header>
          <Command size={20} />
          <input
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              setAnswer(null);
              setCompleted([]);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") onClose();
              if (event.key === "Enter" && !event.nativeEvent.isComposing) void execute();
            }}
            placeholder="搜索、记录、创建或打开任意模块…"
            autoFocus
          />
          <input
            ref={photoRef}
            className="command-photo-input"
            type="file"
            accept="image/*"
            onChange={(event) => {
              setPhoto(event.target.files?.[0] ?? null);
              setCompleted([]);
            }}
          />
          <button
            className={photo ? "active" : ""}
            onClick={() => photoRef.current?.click()}
            aria-label="添加照片"
            title={photo ? `已选择 ${photo.name}` : "添加照片"}
          >
            <ImagePlus size={17} />
          </button>
          <button
            className={listening ? "active" : ""}
            onClick={() => {
              if (listening) speechRef.current?.stop();
              else startListening();
            }}
            aria-label="语音输入"
            title="语音输入"
          >
            <Mic size={17} />
          </button>
          <kbd>ESC</kbd>
          <button onClick={onClose} aria-label="关闭"><X size={17} /></button>
        </header>

        {!input.trim() && (
          <div className="command-welcome">
            <div>
              <span className="eyebrow">ONE PLACE TO DO EVERYTHING</span>
              <h2>从一个入口到达所有事情</h2>
              <p>可以搜索和打开模块，也可以用一句话创建记录、日程与表格；写入前仍会先预览。</p>
            </div>
            <div className="command-navigation">
              <small>快速前往</small>
              <div>
                {navigationTargets.slice(0, 8).map((target) => (
                  <button
                    key={target.id}
                    onClick={() => {
                      onNavigate(target.id);
                      onClose();
                    }}
                  >
                    <Compass size={14} />
                    <span>{target.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="command-examples">
              {[
                "打开财务中心",
                "明天晚上7点安排一小时英语学习",
                "午饭鸡肉饭，花了32元，心情不错",
                "记录今天第一次给初一3班上Python课，心情很好",
                "建立一个教资错题表",
                "问：最近哪些事情最让我有成就感？",
              ].map((example) => (
                <button key={example} onClick={() => setInput(example)}>
                  <Sparkles size={14} /> {example}
                </button>
              ))}
            </div>
            <div className="command-quick-actions">
              <button onClick={onOpenRecord}><Sparkles size={15} /> 完整记录</button>
              <button onClick={onOpenSchedule}><CalendarPlus size={15} /> 完整日程</button>
              <button onClick={() => photoRef.current?.click()}>
                <ImagePlus size={15} /> 照片记录
              </button>
            </div>
          </div>
        )}

        {plan && meta && (
          <div className="command-preview">
            <span className="command-preview-icon"><meta.icon size={21} /></span>
            <div>
              <small>{meta.eyebrow} · 执行前预览</small>
              <h3>{meta.title}</h3>
              {meta.details.map((detail) => <p key={detail}>{detail}</p>)}
              {plan.kind === "record" && <blockquote>{plan.content}</blockquote>}
              {photo &&
                (plan.kind === "record" ||
                  plan.kind === "meal" ||
                  (plan.kind === "bundle" &&
                    plan.actions.some(
                      (action) =>
                        action.kind === "record" || action.kind === "meal",
                    ))) && (
                <p className="command-photo-note">
                  <ImagePlus size={13} /> 已附加照片：{photo.name}
                </p>
              )}
            </div>
          </div>
        )}

        {answer && (
          <article className="command-answer">
            <div className="command-answer-head">
              <span><Bot size={16} /> 生活助理回答</span>
              <em>{answer.provider} · {answer.model}</em>
            </div>
            <p>{answer.text}</p>
            <footer>
              来源范围：非私密生活记录、日程、项目和餐食 · 引用记录 {answer.sourceCount} 条
            </footer>
          </article>
        )}

        {completed.length > 0 && (
          <article className="command-completed">
            <span><Check size={22} /></span>
            <div>
              <small>已完成</small>
              <h3>{completed.map((item) => item.title).join("、")}</h3>
              <p>数据已写入对应模块；如果刚才理解有误，可以立即撤销。</p>
            </div>
            <button
              onClick={async () => {
                setBusy(true);
                try {
                  await onUndo(completed);
                  setCompleted([]);
                  onNotice("刚才的快捷操作已经撤销。");
                } catch (error) {
                  onNotice(error instanceof Error ? error.message : "撤销失败。");
                } finally {
                  setBusy(false);
                }
              }}
              disabled={busy}
            >
              <Trash2 size={15} /> 撤销
            </button>
            <button onClick={onClose}>完成</button>
          </article>
        )}

        {plan && !answer && completed.length === 0 && (
          <footer className="command-confirm">
            <span>
              {plan.kind === "ask"
                ? "AI 只读取站内非私密内容，本次不会写入正式记录。"
                : plan.kind === "navigate"
                  ? "将直接打开目标模块，不会修改数据。"
                : plan.kind === "bundle"
                  ? `将同时写入 ${plan.actions.length} 个模块，请确认后执行。`
                  : "请确认预览内容，执行后会同步到对应模块。"}
            </span>
            <button onClick={() => void execute()} disabled={busy}>
              {busy ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}
              {plan.kind === "ask"
                ? "开始分析"
                : plan.kind === "search"
                  ? "打开搜索"
                  : plan.kind === "navigate"
                    ? "打开模块"
                    : "确认执行"}
            </button>
          </footer>
        )}
      </section>
    </div>
  );
}
