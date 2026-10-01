"use client";

import {
  AlertTriangle,
  Archive,
  Bot,
  Boxes,
  BriefcaseBusiness,
  CalendarDays,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Download,
  EyeOff,
  FileSpreadsheet,
  Filter,
  FolderKanban,
  GraduationCap,
  Grid2X2,
  Heart,
  History,
  Image as ImageIcon,
  Inbox,
  LayoutDashboard,
  Leaf,
  List,
  ListChecks,
  LoaderCircle,
  Menu,
  MoreHorizontal,
  Network,
  Newspaper,
  Pencil,
  Pause,
  Play,
  Plus,
  Repeat2,
  Radar,
  RotateCcw,
  Search,
  Send,
  Settings2,
  Sparkles,
  Table2,
  Target,
  TimerReset,
  Trash2,
  TrendingUp,
  Upload,
  Utensils,
  UserRound,
  WalletCards,
  X,
} from "lucide-react";
import {
  type CSSProperties,
  lazy,
  ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ScheduleReminderWatcher,
} from "./advanced-center";
import { ConfigurableDashboard } from "./configurable-dashboard";
import { HomeStudio } from "./home-studio";
import {
  CommandPalette,
  type CommandNavigationTarget,
  type CommandResult,
} from "./command-palette";
import { DataPortabilityCenter } from "./data-portability-center";
import {
  GlobalSearchPanel,
  type GlobalSearchResult,
} from "./global-search-panel";
import { LifeGraph } from "./life-graph";
import { PwaInstallCard } from "./pwa-client";
import {
  MobileInstallNudge,
  MobileQuickSheet,
  NotificationSetupCard,
} from "./mobile-experience";
import {
  enqueueOfflineMutation,
  enqueueOfflineEventWithPhotos,
  enqueueOfflineEventUpdateWithPhotos,
  getDeviceId,
} from "./offline-sync";
import { SyncStatus } from "./sync-status";
import { SyncCenter } from "./sync-center";
import { ReliabilityCenter } from "./reliability-center";
import { FirstRunGuide } from "./user-guide";
import {
  type FocusClockController,
  type FocusSession as SharedFocusSession,
  focusDisplay,
  focusElapsedMs,
  useFocusClock,
} from "./focus-clock";

const AdvancedCenter = lazy(() =>
  import("./advanced-center").then((module) => ({
    default: module.AdvancedCenter,
  })),
);
const FinanceCenter = lazy(() =>
  import("./finance-center").then((module) => ({
    default: module.FinanceCenter,
  })),
);
const IntelligenceCenter = lazy(() =>
  import("./intelligence-center").then((module) => ({
    default: module.IntelligenceCenter,
  })),
);
const JobCenter = lazy(() =>
  import("./job-center").then((module) => ({ default: module.JobCenter })),
);
const LongTermReviewCenter = lazy(() =>
  import("./long-term-review-center").then((module) => ({
    default: module.LongTermReviewCenter,
  })),
);
const NutritionCenter = lazy(() =>
  import("./nutrition-center").then((module) => ({
    default: module.NutritionCenter,
  })),
);
const PhotoCenter = lazy(() =>
  import("./photo-center").then((module) => ({
    default: module.PhotoCenter,
  })),
);
const SideHustleCenter = lazy(() =>
  import("./side-hustle-center").then((module) => ({
    default: module.SideHustleCenter,
  })),
);
const TopicSpaces = lazy(() =>
  import("./topic-spaces").then((module) => ({
    default: module.TopicSpaces,
  })),
);
const UserGuide = lazy(() =>
  import("./user-guide").then((module) => ({ default: module.UserGuide })),
);
const TaskCenter = lazy(() =>
  import("./task-center").then((module) => ({ default: module.TaskCenter })),
);

type ViewId =
  | "today"
  | "tasks"
  | "schedule"
  | "timeline"
  | "calendar"
  | "graph"
  | "topics"
  | "gallery"
  | "tables"
  | "finance"
  | "sideHustle"
  | "intelligence"
  | "jobs"
  | "review"
  | "inbox"
  | "nutrition"
  | "advanced"
  | "private"
  | "guide"
  | "mine";

type WorkspaceMode = "simple" | "full";
type MobileShortcut =
  | "review"
  | "inbox"
  | "gallery"
  | "finance"
  | "nutrition"
  | "sideHustle";
type ScenePreset =
  | "daily"
  | "teacher"
  | "research"
  | "sideHustle"
  | "health"
  | "finance";

type WorkbenchPreferences = {
  workspaceMode: WorkspaceMode;
  scenePreset: ScenePreset;
  mobileShortcut: MobileShortcut;
};

type Photo = {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  url: string;
};

type LifeEvent = {
  id: string;
  title: string;
  content: string;
  kind: string;
  mood: string;
  energy: number;
  tags: string[];
  person: string;
  place: string;
  project: string;
  isPrivate: boolean;
  recordStatus: string;
  revision: number;
  happenedAt: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  photos: Photo[];
};

type ScheduleEvent = {
  id: string;
  seriesId?: string;
  title: string;
  category: string;
  startAt: string;
  endAt: string;
  place: string;
  person: string;
  project: string;
  note: string;
  repeatRule: string;
  status: string;
  plannedMinutes: number;
  actualMinutes: number;
  taskId?: string | null;
  actualStartAt?: string | null;
  actualEndAt?: string | null;
  interruptionReason?: string;
  reflection?: string;
  repeatUntil?: string | null;
  reminderMinutes?: number | null;
  weekdays?: number[];
  customInterval?: number | null;
  customUnit?: string | null;
  createdAt: string;
};

type FocusSession = SharedFocusSession;

type InboxItem = {
  id: string;
  content: string;
  sourceType: string;
  status: string;
  createdAt: string;
  attachments?: Array<{
    id: string;
    filename: string;
    contentType: string;
    size: number;
    url: string;
  }>;
};

type FieldDefinition = {
  id: string;
  name: string;
  type:
    | "text"
    | "number"
    | "select"
    | "multiSelect"
    | "date"
    | "dateRange"
    | "checkbox"
    | "rating"
    | "progress"
    | "attachment"
    | "person"
    | "place"
    | "relation"
    | "rollup"
    | "formula"
    | "createdTime"
    | "modifiedTime";
  options?: string[];
  formula?: string;
  relationCollectionId?: string;
  relationMultiple?: boolean;
  relationFieldId?: string;
  rollupFieldId?: string;
  rollupFunction?: "list" | "sum" | "average" | "count" | "min" | "max";
  width?: number;
  fixed?: boolean;
};

type Collection = {
  id: string;
  name: string;
  icon: string;
  description: string;
  fields: FieldDefinition[];
  createdAt: string;
};

type CollectionRow = {
  id: string;
  collectionId: string;
  values: Record<string, string | number | boolean>;
  createdAt: string;
  updatedAt: string;
};

type WorkspaceData = {
  events: LifeEvent[];
  schedules: ScheduleEvent[];
  inbox: InboxItem[];
  collections: Collection[];
  rows: CollectionRow[];
};

const initialData: WorkspaceData = {
  events: [],
  schedules: [],
  inbox: [],
  collections: [],
  rows: [],
};

const moods = [
  { label: "开心", mark: "☺", color: "#e4a842" },
  { label: "平静", mark: "◡", color: "#6f9c80" },
  { label: "疲惫", mark: "–", color: "#8a80a0" },
  { label: "焦虑", mark: "⌁", color: "#d97563" },
  { label: "低落", mark: "⌣", color: "#6e82a4" },
];

const eventKinds = [
  "生活",
  "学习",
  "教学",
  "科研",
  "读书",
  "运动",
  "旅行",
  "财务",
  "兼职",
  "亲友",
  "里程碑",
];

const scheduleCategories = [
  "任务",
  "课程",
  "学习",
  "科研",
  "工作",
  "运动",
  "生活",
  "考试",
  "旅行",
  "兼职",
];

const repeatRules = [
  "不重复",
  "每天",
  "每周",
  "工作日",
  "每月",
  "单周",
  "双周",
  "每学期",
  "自定义",
];

const templateLibrary: Array<{
  name: string;
  icon: string;
  description: string;
  fields: FieldDefinition[];
}> = [
  {
    name: "教学记录表",
    icon: "教",
    description: "课程、班级、课堂反馈与课后反思",
    fields: [
      { id: "course", name: "课程", type: "text" },
      { id: "class", name: "班级", type: "text" },
      { id: "date", name: "日期", type: "date" },
      {
        id: "status",
        name: "状态",
        type: "select",
        options: ["备课中", "待上课", "已完成"],
      },
      { id: "feedback", name: "课堂反馈", type: "text" },
    ],
  },
  {
    name: "科研实验表",
    icon: "研",
    description: "数据集、参数、结果、结论与实验状态",
    fields: [
      { id: "experiment", name: "实验名称", type: "text" },
      { id: "dataset", name: "数据集", type: "text" },
      {
        id: "status",
        name: "状态",
        type: "select",
        options: ["未开始", "运行中", "待分析", "已完成"],
      },
      { id: "score", name: "核心结果", type: "number" },
      { id: "conclusion", name: "结论", type: "text" },
    ],
  },
  {
    name: "论文进度表",
    icon: "论",
    description: "章节、截止日期、导师意见和完成度",
    fields: [
      { id: "chapter", name: "章节", type: "text" },
      { id: "deadline", name: "截止日期", type: "date" },
      {
        id: "status",
        name: "状态",
        type: "select",
        options: ["未开始", "撰写中", "待修改", "已完成"],
      },
      { id: "progress", name: "完成度", type: "progress" },
      { id: "comment", name: "导师意见", type: "text" },
    ],
  },
  {
    name: "学习计划表",
    icon: "学",
    description: "知识点、计划时长、实际时长与掌握程度",
    fields: [
      { id: "subject", name: "科目", type: "text" },
      { id: "topic", name: "知识点", type: "text" },
      { id: "planned", name: "计划分钟", type: "number" },
      { id: "actual", name: "实际分钟", type: "number" },
      { id: "mastery", name: "掌握度", type: "progress" },
    ],
  },
  {
    name: "读书表",
    icon: "书",
    description: "书名、状态、阅读进度、评分与笔记",
    fields: [
      { id: "book", name: "书名", type: "text" },
      { id: "author", name: "作者", type: "text" },
      {
        id: "status",
        name: "状态",
        type: "select",
        options: ["想读", "在读", "已读"],
      },
      { id: "progress", name: "进度", type: "progress" },
      { id: "rating", name: "评分", type: "rating" },
    ],
  },
  {
    name: "错题表",
    icon: "题",
    description: "错题、错误原因、知识点与复习次数",
    fields: [
      { id: "subject", name: "科目", type: "text" },
      { id: "question", name: "题目", type: "text" },
      { id: "reason", name: "错误原因", type: "text" },
      { id: "topic", name: "知识点", type: "text" },
      { id: "reviews", name: "复习次数", type: "number" },
    ],
  },
  {
    name: "运动表",
    icon: "动",
    description: "类型、时长、距离和身体感受",
    fields: [
      { id: "date", name: "日期", type: "date" },
      { id: "type", name: "类型", type: "text" },
      { id: "minutes", name: "时长", type: "number" },
      { id: "distance", name: "距离", type: "number" },
      { id: "feeling", name: "感受", type: "text" },
    ],
  },
  {
    name: "旅行表",
    icon: "行",
    description: "地点、日期、预算、花费、攻略和照片",
    fields: [
      { id: "place", name: "地点", type: "text" },
      { id: "date", name: "日期", type: "date" },
      { id: "budget", name: "预算", type: "number" },
      { id: "expense", name: "实际花费", type: "number" },
      { id: "done", name: "已完成", type: "checkbox" },
    ],
  },
  {
    name: "简单记账表",
    icon: "账",
    description: "日期、金额、收支分类与备注",
    fields: [
      { id: "date", name: "日期", type: "date" },
      { id: "amount", name: "金额", type: "number" },
      {
        id: "type",
        name: "收支",
        type: "select",
        options: ["支出", "收入"],
      },
      { id: "category", name: "分类", type: "text" },
      { id: "note", name: "备注", type: "text" },
    ],
  },
  {
    name: "求职投递表",
    icon: "职",
    description: "公司、岗位、投递、笔试和面试状态",
    fields: [
      { id: "company", name: "公司", type: "text" },
      { id: "role", name: "岗位", type: "text" },
      { id: "date", name: "投递时间", type: "date" },
      {
        id: "status",
        name: "状态",
        type: "select",
        options: ["已投递", "笔试", "面试", "Offer", "结束"],
      },
      { id: "note", name: "备注", type: "text" },
    ],
  },
  {
    name: "兼职工作表",
    icon: "兼",
    description: "项目、工作内容、时长、应赚、实收与成本",
    fields: [
      { id: "date", name: "日期", type: "date" },
      { id: "project", name: "项目", type: "text" },
      { id: "content", name: "工作内容", type: "text" },
      { id: "minutes", name: "时长分钟", type: "number" },
      { id: "expected", name: "应赚", type: "number" },
      { id: "received", name: "实收", type: "number" },
      { id: "cost", name: "成本", type: "number" },
      {
        id: "status",
        name: "状态",
        type: "select",
        options: ["待结算", "部分到账", "已到账"],
      },
    ],
  },
  {
    name: "应收款表",
    icon: "收",
    description: "客户、项目、应收、已收、剩余和预计日期",
    fields: [
      { id: "client", name: "客户", type: "text" },
      { id: "project", name: "项目", type: "text" },
      { id: "due", name: "应收金额", type: "number" },
      { id: "received", name: "已收金额", type: "number" },
      { id: "remaining", name: "剩余金额", type: "number" },
      { id: "date", name: "预计日期", type: "date" },
      {
        id: "status",
        name: "状态",
        type: "select",
        options: ["待结算", "部分到账", "已到账", "已逾期"],
      },
    ],
  },
  {
    name: "兼职项目利润表",
    icon: "利",
    description: "收入、成本、净利润、工时与有效时薪",
    fields: [
      { id: "project", name: "项目", type: "text" },
      { id: "income", name: "收入", type: "number" },
      { id: "cost", name: "成本", type: "number" },
      { id: "profit", name: "净利润", type: "number" },
      { id: "minutes", name: "工作时长", type: "number" },
      { id: "hourly", name: "有效时薪", type: "number" },
    ],
  },
  {
    name: "月度预算表",
    icon: "预",
    description: "分类预算、实际支出、剩余与执行率",
    fields: [
      { id: "category", name: "分类", type: "text" },
      { id: "budget", name: "月度预算", type: "number" },
      { id: "spent", name: "实际支出", type: "number" },
      { id: "remaining", name: "剩余", type: "number" },
      { id: "progress", name: "执行率", type: "progress" },
    ],
  },
  {
    name: "储蓄目标表",
    icon: "存",
    description: "目标金额、已存金额、剩余、目标日期和进度",
    fields: [
      { id: "title", name: "目标", type: "text" },
      { id: "target", name: "目标金额", type: "number" },
      { id: "saved", name: "已存金额", type: "number" },
      { id: "remaining", name: "剩余金额", type: "number" },
      { id: "date", name: "目标日期", type: "date" },
      { id: "progress", name: "进度", type: "progress" },
    ],
  },
];

const navGroups: Array<{
  title: string;
  items: Array<{ id: ViewId; label: string; icon: typeof LayoutDashboard }>;
}> = [
  {
    title: "生活主线",
    items: [
      { id: "today", label: "今日", icon: LayoutDashboard },
      { id: "tasks", label: "任务规划", icon: ListChecks },
      { id: "schedule", label: "时间表中心", icon: Clock3 },
      { id: "timeline", label: "生活时间线", icon: Archive },
      { id: "calendar", label: "生活日历", icon: CalendarDays },
      { id: "graph", label: "生活图谱", icon: Network },
    ],
  },
  {
    title: "长期管理",
    items: [
      { id: "tables", label: "自定义表格库", icon: Table2 },
      { id: "topics", label: "专题空间", icon: FolderKanban },
      { id: "finance", label: "财务中心", icon: WalletCards },
      { id: "sideHustle", label: "兼职中心", icon: BriefcaseBusiness },
      { id: "intelligence", label: "情报中心", icon: Newspaper },
      { id: "jobs", label: "求职机会", icon: Radar },
      { id: "gallery", label: "照片回忆", icon: ImageIcon },
      { id: "nutrition", label: "饮食与营养", icon: Utensils },
      { id: "review", label: "回顾与总结", icon: Sparkles },
      { id: "inbox", label: "生活收件箱", icon: Inbox },
    ],
  },
  {
    title: "我的空间",
    items: [
      { id: "private", label: "私密空间", icon: EyeOff },
      { id: "advanced", label: "智能与自动化", icon: Bot },
      { id: "guide", label: "使用指南", icon: CircleHelp },
      { id: "mine", label: "设置与自动化", icon: Settings2 },
    ],
  },
];

const scenePresetMeta: Record<
  ScenePreset,
  { label: string; description: string; modules: ViewId[] }
> = {
  daily: {
    label: "日常生活",
    description: "照片、饮食与回忆",
    modules: ["gallery", "nutrition"],
  },
  teacher: {
    label: "教师工作",
    description: "专题、表格与课程",
    modules: ["topics", "tables"],
  },
  research: {
    label: "科研学习",
    description: "专题、表格与情报",
    modules: ["topics", "tables", "intelligence"],
  },
  sideHustle: {
    label: "兼职经营",
    description: "工时、应收与账本",
    modules: ["sideHustle", "finance"],
  },
  health: {
    label: "健康生活",
    description: "饮食、照片与复盘",
    modules: ["nutrition", "gallery"],
  },
  finance: {
    label: "财务管理",
    description: "账本、兼职与总结",
    modules: ["finance", "sideHustle"],
  },
};

const mobileShortcutMeta: Record<
  MobileShortcut,
  { label: string; icon: typeof LayoutDashboard }
> = {
  review: { label: "回顾", icon: Sparkles },
  inbox: { label: "收件箱", icon: Inbox },
  gallery: { label: "相册", icon: ImageIcon },
  finance: { label: "财务", icon: WalletCards },
  nutrition: { label: "饮食", icon: Utensils },
  sideHustle: { label: "兼职", icon: BriefcaseBusiness },
};

const simpleCoreModules: ViewId[] = [
  "today",
  "tasks",
  "schedule",
  "timeline",
  "review",
  "inbox",
];

const pageTitles: Record<ViewId, [string, string]> = {
  today: ["今日工作台", "安排今天，也留下今天"],
  tasks: ["任务规划", "收集、选择、安排与专注在同一个执行闭环"],
  schedule: ["时间表中心", "计划、执行与复盘在同一条时间轴"],
  timeline: ["生活时间线", "所有发生过的事，都有来处"],
  calendar: ["生活日历", "按日期重新找到生活"],
  graph: ["生活图谱", "看见人物、地点、项目与经历之间的关系"],
  topics: ["专题空间", "把一段持续经历整理成完整档案"],
  finance: ["财务中心", "收入、支出、账户、预算与储蓄目标"],
  sideHustle: ["兼职中心", "工时、应收、到账、成本与真实时薪"],
  intelligence: ["情报中心", "少而有用的新闻、研究与机会简报"],
  jobs: ["求职机会", "岗位监控、投递流程、材料与备考日历"],
  gallery: ["照片回忆", "让照片成为可检索的生活事件"],
  nutrition: ["饮食与营养", "记录三餐、照片、热量与营养结构"],
  tables: ["自定义表格库", "用结构化方式管理长期内容"],
  review: ["回顾与总结", "从记录中看见真实投入和变化"],
  inbox: ["生活收件箱", "先收下，稍后再整理"],
  private: ["私密空间", "与普通记录彻底分开的安静角落"],
  advanced: ["智能与自动化", "项目、导入、照片整理和生活问询"],
  guide: ["使用指南", "从第一次记录到长期回顾的操作说明"],
  mine: ["我的工作台", "模块、自动化、导入与数据安全"],
};

function localDateTime(date = new Date()) {
  if (Number.isNaN(date.getTime())) date = new Date();
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

async function prepareLifePhoto(file: File) {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const longest = Math.max(bitmap.width, bitmap.height);
    if (longest <= 1800 && file.size <= 4 * 1024 * 1024) {
      bitmap.close();
      return file;
    }
    const scale = Math.min(1, 1800 / longest);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85),
    );
    return blob
      ? new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
          type: "image/jpeg",
          lastModified: file.lastModified,
        })
      : file;
  } catch {
    return file;
  }
}

function localDateTimeToIso(value: unknown) {
  const raw = String(value ?? "").trim();
  const parsed = new Date(raw);
  if (!raw || Number.isNaN(parsed.getTime())) {
    throw new Error("请输入有效的日期和时间。");
  }
  return parsed.toISOString();
}

function dayKey(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0",
  )}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateLabel(value: string | Date, withWeek = true) {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: withWeek ? "short" : undefined,
  }).format(date);
}

function timeLabel(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function startOfWeek(date: Date) {
  const result = new Date(date);
  const day = result.getDay() || 7;
  result.setDate(result.getDate() - day + 1);
  result.setHours(0, 0, 0, 0);
  return result;
}

function addDays(date: Date, amount: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

function firstValue(
  collection: Collection,
  row: CollectionRow,
): string | number | boolean {
  const firstField = collection.fields[0];
  return firstField
    ? resolveFieldValue(firstField, row, collection) ?? "未命名"
    : "未命名";
}

function calculateArithmetic(expression: string) {
  const tokens =
    expression.match(/\d+(?:\.\d+)?|[()+\-*/]/g) ?? [];
  let position = 0;
  function primary(): number {
    const token = tokens[position++];
    if (token === "(") {
      const value = addition();
      if (tokens[position] === ")") position += 1;
      return value;
    }
    if (token === "-") return -primary();
    return Number(token) || 0;
  }
  function multiplication(): number {
    let value = primary();
    while (tokens[position] === "*" || tokens[position] === "/") {
      const operator = tokens[position++];
      const right = primary();
      value = operator === "*" ? value * right : right ? value / right : 0;
    }
    return value;
  }
  function addition(): number {
    let value = multiplication();
    while (tokens[position] === "+" || tokens[position] === "-") {
      const operator = tokens[position++];
      const right = multiplication();
      value = operator === "+" ? value + right : value - right;
    }
    return value;
  }
  const value = addition();
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
}

function resolveFieldValue(
  field: FieldDefinition,
  row: CollectionRow,
  collection: Collection,
  collections: Collection[] = [],
  rows: CollectionRow[] = [],
) {
  if (field.type === "createdTime") return row.createdAt;
  if (field.type === "modifiedTime") return row.updatedAt;
  if (field.type === "relation") {
    const targetCollection = collections.find(
      (candidate) => candidate.id === field.relationCollectionId,
    );
    const targetRows = String(row.values[field.id] ?? "")
      .split("、")
      .map((id) => rows.find((candidate) => candidate.id === id))
      .filter((candidate): candidate is CollectionRow => Boolean(candidate));
    return targetRows.length && targetCollection
      ? targetRows.map((targetRow) => firstValue(targetCollection, targetRow)).join("、")
      : row.values[field.id];
  }
  if (field.type === "rollup") {
    const relation = collection.fields.find(
      (candidate) => candidate.id === field.relationFieldId,
    );
    const relationIds = relation
      ? String(row.values[relation.id] ?? "").split("、").filter(Boolean)
      : [];
    const values = relationIds
      .map((id) => rows.find((candidate) => candidate.id === id))
      .filter((candidate): candidate is CollectionRow => Boolean(candidate))
      .map((targetRow) =>
        field.rollupFieldId ? targetRow.values[field.rollupFieldId] : undefined,
      )
      .filter((value) => value !== undefined && value !== "");
    const operation = field.rollupFunction || "list";
    if (operation === "count") return values.length;
    if (operation === "list") return values.length ? values.join("、") : "—";
    const numbers = values.map(Number).filter(Number.isFinite);
    if (!numbers.length) return 0;
    if (operation === "sum") return numbers.reduce((sum, value) => sum + value, 0);
    if (operation === "average") {
      return Math.round((numbers.reduce((sum, value) => sum + value, 0) / numbers.length) * 100) / 100;
    }
    if (operation === "min") return Math.min(...numbers);
    return Math.max(...numbers);
  }
  if (field.type !== "formula") return row.values[field.id];
  let expression = field.formula || "0";
  const daysMatch = expression.match(/^剩余天数\(\{(.+)\}\)$/);
  if (daysMatch) {
    const source = collection.fields.find((item) => item.name === daysMatch[1]);
    const date = source ? new Date(String(row.values[source.id] ?? "")) : null;
    return date && !Number.isNaN(date.getTime())
      ? Math.ceil((date.getTime() - Date.now()) / 86400000)
      : 0;
  }
  expression = expression.replace(/\{([^}]+)\}/g, (_, name: string) => {
    const source = collection.fields.find((item) => item.name === name);
    return String(source ? Number(row.values[source.id]) || 0 : 0);
  });
  if (!/^[\d+\-*/().\s]+$/.test(expression)) return "公式格式不正确";
  return calculateArithmetic(expression);
}

function Modal({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="modal-layer" role="presentation">
      <button className="modal-backdrop" onClick={onClose} aria-label="关闭" />
      <section className="modal-card" role="dialog" aria-modal="true">
        <div className="modal-heading">
          <div>
            <h2>{title}</h2>
            <p>{description}</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="关闭">
            <X size={19} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function Stat({
  value,
  label,
}: {
  value: string | number;
  label: string;
}) {
  return (
    <div className="stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function GlobalFocusIndicator({
  hidden,
  onOpen,
  controller,
}: {
  hidden: boolean;
  onOpen: () => void;
  controller: FocusClockController;
}) {
  const { session, now } = controller;
  if (hidden || !session) return null;
  return (
    <button
      className="global-focus-indicator"
      onClick={onOpen}
      aria-label={`返回正在计时的${session.targetType === "task" ? "任务" : "日程"}：${session.title}`}
    >
      <span className={session.status}>
        {session.status === "running" ? <Play size={14} /> : <Pause size={14} />}
      </span>
      <span>
        <small>{session.status === "running" ? "正在专注" : "计时已暂停"}</small>
        <strong>{session.title}</strong>
      </span>
      <time>{focusDisplay(session, now)}</time>
    </button>
  );
}

function EmptyBlock({
  icon: Icon,
  title,
  copy,
  action,
  onAction,
}: {
  icon: typeof Archive;
  title: string;
  copy: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <div className="empty-block">
      <span>
        <Icon size={23} />
      </span>
      <h3>{title}</h3>
      <p>{copy}</p>
      <button onClick={onAction}>
        {action} <ChevronRight size={15} />
      </button>
    </div>
  );
}

function EventCard({
  event,
  onDelete,
  onEdit,
}: {
  event: LifeEvent;
  onDelete: (event: LifeEvent) => void;
  onEdit?: (event: LifeEvent) => void;
}) {
  const mood = moods.find((item) => item.label === event.mood) ?? moods[1];
  return (
    <article className="event-card" id={`life-event-${event.id}`}>
      <div className="event-date">
        <strong>{new Date(event.happenedAt).getDate()}</strong>
        <span>{new Date(event.happenedAt).getMonth() + 1}月</span>
      </div>
      <div className="event-body">
        <div className="event-meta">
          <span>{dateLabel(event.happenedAt)}</span>
          <i />
          <span>{timeLabel(event.happenedAt)}</span>
          <em>{event.kind}</em>
          <em
            className="mood-pill"
            style={{ "--mood": mood.color } as React.CSSProperties}
          >
            {mood.mark} {mood.label}
          </em>
          {event.isPrivate && <em className="private-pill">私密</em>}
        </div>
        {event.title && <h3>{event.title}</h3>}
        {event.photos.length > 0 && (
          <div
            className={`event-photos photos-${Math.min(event.photos.length, 4)}`}
          >
            {event.photos.slice(0, 4).map((photo, index) => (
              <figure key={photo.id}>
                <img
                  src={photo.url}
                  alt={photo.filename || `生活照片 ${index + 1}`}
                  loading="lazy"
                  decoding="async"
                />
                {index === 3 && event.photos.length > 4 && (
                  <span>+{event.photos.length - 4}</span>
                )}
              </figure>
            ))}
          </div>
        )}
        {event.content && <p className="event-content">{event.content}</p>}
        {(event.tags.length > 0 ||
          event.person ||
          event.place ||
          event.project) && (
          <div className="relation-row">
            {event.project && <span>项目 · {event.project}</span>}
            {event.person && <span>人物 · {event.person}</span>}
            {event.place && <span>地点 · {event.place}</span>}
            {event.tags.map((tag) => (
              <span key={tag}>#{tag}</span>
            ))}
          </div>
        )}
      </div>
      <div className="event-card-actions">
        {onEdit && (
          <button
            className="icon-button quiet"
            onClick={() => onEdit(event)}
            aria-label="编辑记录"
          >
            <Pencil size={15} />
          </button>
        )}
        <button
          className="icon-button quiet"
          onClick={() => onDelete(event)}
          aria-label="移入回收站"
        >
          <Trash2 size={15} />
        </button>
      </div>
    </article>
  );
}

export function LifeDesk() {
  const [today, setToday] = useState(() => new Date());
  const focusClockController = useFocusClock();
  const [view, setView] = useState<ViewId>("today");
  const [recentViews, setRecentViews] = useState<ViewId[]>([]);
  const [data, setData] = useState<WorkspaceData>(initialData);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [moduleQuery, setModuleQuery] = useState("");
  const [globalSearch, setGlobalSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [focusedEventId, setFocusedEventId] = useState("");
  const [notice, setNotice] = useState("");
  const [commandOpen, setCommandOpen] = useState(false);
  const [mobileQuickOpen, setMobileQuickOpen] = useState(false);
  const [mobileVoiceFirst, setMobileVoiceFirst] = useState(false);
  const [recordOpen, setRecordOpen] = useState(false);
  const [quickRecordFiles, setQuickRecordFiles] = useState<File[]>([]);
  const [quickMealPhoto, setQuickMealPhoto] = useState<File | null>(null);
  const [editingEvent, setEditingEvent] = useState<LifeEvent | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<ScheduleEvent | null>(
    null,
  );
  const [scheduleSeedDate, setScheduleSeedDate] = useState<Date | null>(null);
  const [inboxDraft, setInboxDraft] = useState("");
  const [inboxFiles, setInboxFiles] = useState<File[]>([]);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [tableTemplateOpen, setTableTemplateOpen] = useState(false);
  const [rowOpen, setRowOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<CollectionRow | null>(null);
  const [selectedCollectionId, setSelectedCollectionId] = useState("");
  const [tableView, setTableView] = useState<
    "table" | "board" | "gallery" | "calendar" | "timeline" | "chart"
  >("table");
  const [scheduleRange, setScheduleRange] = useState<
    "today" | "three" | "week" | "month" | "semester" | "actual"
  >("week");
  const [advancedInitialTab, setAdvancedInitialTab] = useState<
    "projects" | "automation" | "import" | "photos" | "ai"
  >("projects");
  const [workbenchPreferences, setWorkbenchPreferences] =
    useState<WorkbenchPreferences>({
      workspaceMode: "simple",
      scenePreset: "daily",
      mobileShortcut: "review",
    });
  const [showAllModules, setShowAllModules] = useState(false);
  const preferenceVersion = useRef(0);
  const mobilePressStartedAt = useRef(0);
  const mobileLongPress = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const consumeQuickMealPhoto = useCallback(() => {
    setQuickMealPhoto(null);
  }, []);

  async function loadWorkspace(showLoading = false) {
    if (showLoading) setLoading(true);
    try {
      const response = await fetch("/api/workspace", { cache: "no-store" });
      const payload = (await response.json()) as WorkspaceData & { error?: string };
      if (!response.ok) throw new Error(payload.error);
      setData(payload);
      if (!selectedCollectionId && payload.collections[0]) {
        setSelectedCollectionId(payload.collections[0].id);
      }
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "工作台暂时无法读取数据。",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void loadWorkspace(), 0);
    return () => window.clearTimeout(timer);
    // The initial workspace request runs only when the shell is mounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const restoreRecentViews = window.setTimeout(() => {
      const saved = window.localStorage.getItem("life-workbench-recent-views");
      if (!saved) return;
      try {
        setRecentViews(
          (JSON.parse(saved) as ViewId[])
            .filter((item) => item !== "today")
            .slice(0, 4),
        );
      } catch {
        window.localStorage.removeItem("life-workbench-recent-views");
      }
    }, 0);
    const clock = window.setInterval(() => setToday(new Date()), 60_000);
    return () => {
      window.clearTimeout(restoreRecentViews);
      window.clearInterval(clock);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadWorkbenchPreferences() {
      try {
        const response = await fetch("/api/preferences", { cache: "no-store" });
        const payload = (await response.json()) as {
          preferences?: Partial<WorkbenchPreferences>;
          version?: number;
        };
        if (!response.ok || cancelled) return;
        preferenceVersion.current = Number(payload.version) || 0;
        setWorkbenchPreferences({
          workspaceMode:
            payload.preferences?.workspaceMode === "full" ? "full" : "simple",
          scenePreset:
            payload.preferences?.scenePreset &&
            payload.preferences.scenePreset in scenePresetMeta
              ? payload.preferences.scenePreset
              : "daily",
          mobileShortcut:
            payload.preferences?.mobileShortcut &&
            payload.preferences.mobileShortcut in mobileShortcutMeta
              ? payload.preferences.mobileShortcut as MobileShortcut
              : "review",
        });
      } catch {
        // The defaults keep navigation usable while offline.
      }
    }
    void loadWorkbenchPreferences();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    const action = url.searchParams.get("action");
    if (!action) return;

    const timer = window.setTimeout(() => {
      if (action === "record") {
        setRecordOpen(true);
      } else if (action === "schedule") {
        setView("schedule");
        setScheduleSeedDate(new Date());
        setScheduleOpen(true);
      } else if (action === "nutrition") {
        setView("nutrition");
      } else if (action === "inbox") {
        setView("inbox");
        setInboxOpen(true);
      } else if (action === "guide") {
        setView("guide");
      }

      url.searchParams.delete("action");
      window.history.replaceState(
        {},
        "",
        `${url.pathname}${url.search}${url.hash}`,
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    function openCommand(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
      }
    }
    window.addEventListener("keydown", openCommand);
    return () => window.removeEventListener("keydown", openCommand);
  }, []);

  useEffect(() => {
    if (loading) return;
    let cancelled = false;

    async function runAutomationCheck() {
      try {
        const response = await fetch("/api/advanced", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "automation.run",
            payload: { timezoneOffset: new Date().getTimezoneOffset() },
          }),
        });
        if (!response.ok || cancelled) return;
        const result = (await response.json()) as {
          notifications?: Array<{
            id: string;
            title: string;
            body: string;
          }>;
        };
        const notifications = result.notifications ?? [];
        if (
          typeof Notification !== "undefined" &&
          Notification.permission === "granted"
        ) {
          for (const item of notifications.slice(0, 5)) {
            new Notification(item.title || "日常屿提醒", {
              body: item.body || "",
              tag: item.id,
            });
          }
        } else if (notifications[0]) {
          setNotice(`${notifications[0].title}：${notifications[0].body}`);
        }
      } catch {
        // A later foreground or interval check safely retries missed work.
      }
    }

    void runAutomationCheck();
    const interval = window.setInterval(
      () => void runAutomationCheck(),
      15 * 60_000,
    );
    function checkOnForeground() {
      if (document.visibilityState === "visible") void runAutomationCheck();
    }
    document.addEventListener("visibilitychange", checkOnForeground);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", checkOnForeground);
    };
  }, [loading]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3400);
    return () => window.clearTimeout(timer);
  }, [notice]);

  async function saveWorkbenchPreferences(
    patch: Partial<WorkbenchPreferences>,
  ) {
    const next = { ...workbenchPreferences, ...patch };
    setWorkbenchPreferences(next);
    if (patch.workspaceMode === "full") setShowAllModules(false);
    let expectedVersion = preferenceVersion.current;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await fetch("/api/preferences", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          patch,
          expectedVersion,
          deviceId: getDeviceId(),
        }),
      });
      const payload = (await response.json()) as {
        preferences?: Partial<WorkbenchPreferences>;
        version?: number;
        error?: string;
      };
      if (response.status === 409 && attempt === 0) {
        expectedVersion = Number(payload.version) || 0;
        preferenceVersion.current = expectedVersion;
        continue;
      }
      if (!response.ok) {
        setNotice(payload.error || "工作台偏好暂时无法同步。");
        return;
      }
      preferenceVersion.current = Number(payload.version) || expectedVersion + 1;
      setNotice("工作台模式已同步到其他设备。");
      return;
    }
    setNotice("另一台设备刚刚修改了偏好，请再选择一次。");
  }

  async function workspaceAction(action: string, payload: Record<string, unknown>) {
    const response = await fetch("/api/workspace", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, payload }),
    });
    const body = response.status === 204 ? {} : ((await response.json()) as {
      error?: string;
      id?: string;
    });
    if (!response.ok) throw new Error(body.error || "操作失败。");
    return body;
  }

  const activeEvents = data.events.filter(
    (event) => !event.deletedAt && !event.isPrivate,
  );
  const privateEvents = data.events.filter(
    (event) => !event.deletedAt && event.isPrivate,
  );
  const deletedEvents = data.events.filter((event) => Boolean(event.deletedAt));
  const pendingInbox = data.inbox.filter((item) => item.status === "待整理");
  const allPhotos = activeEvents.flatMap((event) =>
    event.photos.map((photo) => ({ event, photo })),
  );

  const currentCollection =
    data.collections.find((item) => item.id === selectedCollectionId) ??
    data.collections[0];
  const currentRows = currentCollection
    ? data.rows.filter((row) => row.collectionId === currentCollection.id)
    : [];
  const visibleNavGroups =
    workbenchPreferences.workspaceMode === "full" || showAllModules
      ? navGroups
      : [
          {
            title: "日常主线",
            items: navGroups
              .flatMap((group) => group.items)
              .filter((item) => simpleCoreModules.includes(item.id)),
          },
          {
            title: scenePresetMeta[workbenchPreferences.scenePreset].label,
            items: navGroups
              .flatMap((group) => group.items)
              .filter((item) =>
                scenePresetMeta[
                  workbenchPreferences.scenePreset
                ].modules.includes(item.id),
              ),
          },
          {
            title: "我的空间",
            items: navGroups
              .flatMap((group) => group.items)
              .filter((item) => item.id === "guide" || item.id === "mine"),
          },
        ];
  const mobileShortcut =
    mobileShortcutMeta[workbenchPreferences.mobileShortcut];
  const MobileShortcutIcon = mobileShortcut.icon;
  const allNavItems = navGroups.flatMap((group) => group.items);
  const filteredNavGroups = moduleQuery.trim()
    ? [{ title: "搜索结果", items: allNavItems.filter((item) =>
        `${item.label} ${pageTitles[item.id].join(" ")}`.toLowerCase().includes(moduleQuery.trim().toLowerCase()),
      ) }]
    : visibleNavGroups;
  const recentNavItems = recentViews
    .map((id) => allNavItems.find((item) => item.id === id))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  const commandNavigationTargets: CommandNavigationTarget[] = [
    ...recentNavItems,
    ...allNavItems.filter(
      (item) => !recentViews.includes(item.id) && item.id !== "today",
    ),
  ].map((item) => ({
    id: item.id,
    label: item.label,
    description: pageTitles[item.id][1],
    keywords: [pageTitles[item.id][0], pageTitles[item.id][1]],
  }));

  async function saveRecord(
    form: HTMLFormElement,
    photos: File[],
    event?: LifeEvent | null,
  ) {
    const payload = new FormData(form);
    const uploadPhotos = await Promise.all(photos.map(prepareLifePhoto));
    const deviceId = getDeviceId();
    payload.set("deviceId", deviceId);
    if (event) {
      let textUpdated = false;
      let savedRevision = event.revision;
      const values = {
        id: event.id,
        expectedRevision: event.revision,
        deviceId,
        title: String(payload.get("title") ?? ""),
        content: String(payload.get("content") ?? ""),
        happenedAt: String(payload.get("happenedAt") ?? ""),
        kind: String(payload.get("kind") ?? "生活"),
        mood: String(payload.get("mood") ?? "平静"),
        energy: Number(payload.get("energy") ?? 3),
        person: String(payload.get("person") ?? ""),
        place: String(payload.get("place") ?? ""),
        project: String(payload.get("project") ?? ""),
        tags: String(payload.get("tags") ?? ""),
        isPrivate: payload.get("isPrivate") === "true",
        changeNote: "在记录编辑器中保存",
      };
      try {
        const response = await fetch("/api/events", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(values),
        });
        const body = (await response.json()) as {
          error?: string;
          conflict?: boolean;
          revision?: number;
        };
        if (!response.ok) throw new Error(body.error || "更新失败。");
        textUpdated = true;
        savedRevision = Number(body.revision) || event.revision + 1;
        if (uploadPhotos.length) {
          const photoForm = new FormData();
          photoForm.set("eventId", event.id);
          uploadPhotos.forEach((photo) => photoForm.append("photos", photo));
          const photoResponse = await fetch("/api/events/photos", {
            method: "POST",
            body: photoForm,
          });
          const photoBody = (await photoResponse.json()) as { error?: string };
          if (!photoResponse.ok) {
            throw new Error(photoBody.error || "照片上传失败。");
          }
        }
      } catch (error) {
        if (textUpdated && uploadPhotos.length) {
          await enqueueOfflineEventUpdateWithPhotos(
            event.id,
            savedRevision,
            values,
            uploadPhotos,
          );
          setRecordOpen(false);
          setEditingEvent(null);
          await loadWorkspace();
          setNotice("文字已保存，照片已进入续传队列，联网稳定后自动补齐。");
          return;
        }
        if (!window.navigator.onLine || error instanceof TypeError) {
          await enqueueOfflineMutation({
            action: "event.update",
            entityId: event.id,
            baseRevision: event.revision,
            payload: values,
          });
          setRecordOpen(false);
          setEditingEvent(null);
          setNotice("修改已保存在本机，联网后会自动同步。");
          return;
        }
        throw error;
      }
      setRecordOpen(false);
      setEditingEvent(null);
      await loadWorkspace();
      setNotice(
        uploadPhotos.length
          ? "文字与新增照片已保存，并保留了修改历史。"
          : "记录已更新，并保留了修改历史。",
      );
      return;
    }
    uploadPhotos.forEach((photo) => payload.append("photos", photo));
    try {
      const response = await fetch("/api/events", {
        method: "POST",
        body: payload,
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error || "保存失败。");
    } catch (error) {
      if (!window.navigator.onLine || error instanceof TypeError) {
        const offlinePayload = {
            title: String(payload.get("title") ?? ""),
            content: String(payload.get("content") ?? ""),
            happenedAt: String(payload.get("happenedAt") ?? ""),
            kind: String(payload.get("kind") ?? "生活"),
            mood: String(payload.get("mood") ?? "平静"),
            energy: Number(payload.get("energy") ?? 3),
            person: String(payload.get("person") ?? ""),
            place: String(payload.get("place") ?? ""),
            project: String(payload.get("project") ?? ""),
            tags: String(payload.get("tags") ?? ""),
            isPrivate: payload.get("isPrivate") === "true",
        };
        if (uploadPhotos.length) {
          await enqueueOfflineEventWithPhotos(offlinePayload, uploadPhotos);
        } else {
          await enqueueOfflineMutation({
            action: "event.create",
            payload: offlinePayload,
          });
        }
        setRecordOpen(false);
        setNotice(
          uploadPhotos.length
            ? "图文记录已安全排队，联网后会先同步文字再续传照片。"
            : "记录已保存在本机，联网后会自动进入时间线。",
        );
        return;
      }
      throw error;
    }
    setRecordOpen(false);
    await loadWorkspace();
    setNotice(
      uploadPhotos.length > 0 && !String(payload.get("content") ?? "").trim()
        ? "照片已保存，之后可以在照片整理中补充故事和标签。"
        : "这一刻已经进入生活时间线。",
    );
  }

  async function createCommandRecord(payload: {
    title: string;
    content: string;
    happenedAt: string;
    mood: string;
  }, photo?: File | null): Promise<CommandResult> {
    const form = new FormData();
    form.set("title", payload.title);
    form.set("content", payload.content);
    form.set("happenedAt", payload.happenedAt);
    form.set("mood", payload.mood);
    form.set("kind", "生活");
    form.set("energy", "3");
    if (photo) form.append("photos", await prepareLifePhoto(photo));
    const response = await fetch("/api/events", {
      method: "POST",
      body: form,
    });
    const body = (await response.json()) as { id?: string; error?: string };
    if (!response.ok) throw new Error(body.error || "记录保存失败。");
    await loadWorkspace();
    setNotice("指令已经转换成一条生活记录。");
    return {
      kind: "record",
      id: String(body.id),
      title: "生活记录",
    };
  }

  async function createCommandSchedule(
    payload: Record<string, unknown>,
  ): Promise<CommandResult> {
    const result = await workspaceAction("schedule.create", {
      ...payload,
      timezoneOffset: new Date().getTimezoneOffset(),
    });
    await loadWorkspace();
    setNotice("指令已经转换成时间表安排。");
    return {
      kind: "schedule",
      id: String(result.id),
      title: "时间表安排",
    };
  }

  async function createCommandTask(
    payload: Record<string, unknown>,
  ): Promise<CommandResult> {
    const response = await fetch("/api/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "task.create",
        payload: {
          ...payload,
          status: "收件箱",
          plannedMinutes: 25,
          estimatedPomodoros: 1,
        },
      }),
    });
    const body = (await response.json()) as { id?: string; error?: string };
    if (!response.ok) throw new Error(body.error || "任务创建失败。");
    setNotice("指令已经转换成一项任务。");
    return { kind: "task", id: String(body.id), title: "任务" };
  }

  async function createCommandTransaction(
    payload: Record<string, unknown>,
  ): Promise<CommandResult> {
    const response = await fetch("/api/finance", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "transaction.create",
        payload: {
          ...payload,
          accountId: "account-wechat",
        },
      }),
    });
    const body = (await response.json()) as { id?: string; error?: string };
    if (!response.ok) throw new Error(body.error || "记账失败。");
    setNotice("这句话已经转换成一笔财务支出。");
    return {
      kind: "finance",
      id: String(body.id),
      title: "财务支出",
    };
  }

  async function createCommandTable(template: {
    name: string;
    icon: string;
    description: string;
    fields: Array<{
      id: string;
      name: string;
      type: string;
      options?: string[];
    }>;
  }): Promise<CommandResult> {
    const result = await workspaceAction("collection.create", template);
    setSelectedCollectionId(String(result.id));
    await loadWorkspace();
    setNotice(`“${template.name}”已经创建。`);
    return {
      kind: "table",
      id: String(result.id),
      title: template.name,
    };
  }

  async function createCommandMeal(
    payload: { mealType: string; note: string; eatenAt: string },
    photo?: File | null,
  ): Promise<CommandResult> {
    const form = new FormData();
    form.set("mealType", payload.mealType);
    form.set("note", payload.note);
    form.set("eatenAt", payload.eatenAt);
    if (photo) form.set("photo", photo);
    const response = await fetch("/api/nutrition", {
      method: "POST",
      body: form,
    });
    const body = (await response.json()) as { id?: string; error?: string };
    if (!response.ok) throw new Error(body.error || "餐食记录保存失败。");
    setNotice("餐食已记录，并完成热量估算。");
    return {
      kind: "meal",
      id: String(body.id),
      title: `${payload.mealType}与热量`,
    };
  }

  async function undoCommandResults(results: CommandResult[]) {
    for (const result of [...results].reverse()) {
      if (!result.id || result.id === "undefined") continue;
      if (result.kind === "record") {
        const response = await fetch(`/api/events?id=${encodeURIComponent(result.id)}`, {
          method: "DELETE",
        });
        if (!response.ok) throw new Error("生活记录撤销失败。");
      } else if (result.kind === "schedule") {
        await workspaceAction("schedule.delete", {
          id: result.id,
          seriesId: result.id,
          scope: "series",
        });
      } else if (result.kind === "task") {
        const response = await fetch("/api/tasks", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "task.delete", payload: { id: result.id } }),
        });
        if (!response.ok) throw new Error("任务撤销失败。");
      } else if (result.kind === "table") {
        await workspaceAction("collection.delete", { id: result.id });
      } else if (result.kind === "finance") {
        const response = await fetch("/api/finance", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "transaction.delete",
            payload: { id: result.id },
          }),
        });
        if (!response.ok) throw new Error("财务记录撤销失败。");
      } else {
        const response = await fetch("/api/nutrition", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "meal.delete",
            payload: { id: result.id },
          }),
        });
        if (!response.ok) throw new Error("餐食记录撤销失败。");
      }
    }
    await loadWorkspace();
  }

  async function deleteEvent(event: LifeEvent) {
    if (!window.confirm("将这条记录移入回收站？照片会先保留。")) return;
    const response = await fetch(`/api/events?id=${encodeURIComponent(event.id)}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      setNotice("暂时无法移入回收站。");
      return;
    }
    await loadWorkspace();
    setNotice("记录已移入回收站。");
  }

  async function saveInbox() {
    if (!inboxDraft.trim() && inboxFiles.length === 0) return;
    try {
      const form = new FormData();
      form.set("content", inboxDraft);
      inboxFiles.forEach((file) => form.append("attachments", file));
      try {
        const response = await fetch("/api/inbox", {
          method: "POST",
          body: form,
        });
        const result = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(result.error || "保存失败。");
      } catch (error) {
        if (
          (!window.navigator.onLine || error instanceof TypeError) &&
          inboxDraft.trim() &&
          inboxFiles.length === 0
        ) {
          await enqueueOfflineMutation({
            action: "inbox.create",
            payload: { content: inboxDraft, sourceType: "文字" },
          });
          setInboxDraft("");
          setInboxOpen(false);
          setNotice("内容已保存在本机收件箱队列，联网后自动同步。");
          return;
        }
        throw error;
      }
      setInboxDraft("");
      setInboxFiles([]);
      setInboxOpen(false);
      await loadWorkspace();
      setNotice("已放进生活收件箱，稍后再整理。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "保存失败。");
    }
  }

  async function createCollection(
    template: (typeof templateLibrary)[number],
  ) {
    try {
      const result = await workspaceAction("collection.create", template);
      setSelectedCollectionId(String(result.id));
      setTableTemplateOpen(false);
      await loadWorkspace();
      setNotice(`“${template.name}”已经加入表格库。`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "创建表格失败。");
    }
  }

  function exportWorkspace() {
    const includePrivate =
      privateEvents.length > 0
        ? window.confirm(
            `检测到 ${privateEvents.length} 条私密记录。确定要把它们一起导出吗？选择“取消”会导出不含私密内容的副本。`,
          )
        : false;
    const anchor = document.createElement("a");
    anchor.href = `/api/backup?format=json&includePrivate=${includePrivate}`;
    anchor.download = "";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setNotice("正式元数据备份正在下载；照片原文件请使用“完整可移植备份”。");
  }

  function changeView(next: ViewId) {
    setView(next);
    setSidebarOpen(false);
    setGlobalSearch("");
    if (next !== "today") {
      setRecentViews((current) => {
        const updated = [next, ...current.filter((item) => item !== next)].slice(
          0,
          4,
        );
        window.localStorage.setItem(
          "life-workbench-recent-views",
          JSON.stringify(updated),
        );
        return updated;
      });
    }
  }

  function openMobileQuick(voiceFirst = false) {
    setMobileVoiceFirst(voiceFirst);
    setMobileQuickOpen(true);
    if ("vibrate" in navigator) navigator.vibrate(voiceFirst ? [18, 35, 18] : 10);
  }

  return (
    <main className="app-shell" id="main-content" data-view={view}>
      <FirstRunGuide onNavigate={(next) => changeView(next as ViewId)} />
      <ScheduleReminderWatcher
        schedules={data.schedules}
        onNotice={setNotice}
      />
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="brand">
          <span className="brand-mark">
            <Leaf size={20} />
          </span>
          <div>
            <strong>日常屿</strong>
            <small>LIFE WORKBENCH</small>
          </div>
          <button
            className="icon-button sidebar-close"
            onClick={() => setSidebarOpen(false)}
            aria-label="关闭导航"
          >
            <X size={19} />
          </button>
        </div>

        <label className="module-finder">
          <Search size={15} />
          <input aria-label="查找工作台功能" placeholder="查找功能…" value={moduleQuery}
            onChange={(event) => setModuleQuery(event.target.value)} />
          {moduleQuery && <button type="button" aria-label="清除功能搜索" onClick={() => setModuleQuery("")}><X size={13} /></button>}
        </label>

        {recentNavItems.length > 0 && !moduleQuery && (
          <div className="recent-nav" aria-label="最近使用">
            <span>最近使用</span>
            <div>
              {recentNavItems.slice(0, 3).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  className={view === id ? "active" : ""}
                  onClick={() => changeView(id)}
                  title={label}
                >
                  <Icon size={15} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <nav className="side-nav" aria-label="工作台导航">
          {filteredNavGroups.map((group) => (
            <div className="nav-group" key={group.title}>
              <p>{group.title}</p>
              {group.items.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  className={view === id ? "active" : ""}
                  onClick={() => { changeView(id); setModuleQuery(""); }}
                >
                  <Icon size={18} strokeWidth={1.8} />
                  <span>{label}</span>
                  {id === "inbox" && pendingInbox.length > 0 && (
                    <em>{pendingInbox.length}</em>
                  )}
                </button>
              ))}
            </div>
          ))}
          {moduleQuery && filteredNavGroups[0].items.length === 0 && <p className="module-no-results">没有找到对应功能，试试“日程”“财务”或“打卡”。</p>}
          {workbenchPreferences.workspaceMode === "simple" && !moduleQuery && (
            <button
              className="nav-mode-toggle"
              onClick={() => setShowAllModules((current) => !current)}
            >
              <Grid2X2 size={17} />
              <span>{showAllModules ? "收起全部功能" : "查看全部功能"}</span>
              <ChevronRight size={15} />
            </button>
          )}
        </nav>

        <div className="sidebar-note">
          <span>
            <Target size={16} />
          </span>
          <div>
            <strong>给日常留一点空间</strong>
            <p>重要的事，逐件完成。值得记住的，慢慢留下。</p>
          </div>
        </div>

        <div className="sidebar-user">
          <span>我</span>
          <div>
            <strong>我的生活空间</strong>
            <small>{activeEvents.length} 条生活事件</small>
          </div>
          <button
            className="icon-button quiet"
            aria-label="更多设置"
            onClick={() => changeView("mine")}
          >
            <MoreHorizontal size={17} />
          </button>
        </div>
      </aside>

      {sidebarOpen && (
        <button
          className="sidebar-mask"
          onClick={() => setSidebarOpen(false)}
          aria-label="关闭导航"
        />
      )}

      <section className="workspace">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            onClick={() => setSidebarOpen(true)}
            aria-label="打开导航"
          >
            <Menu size={20} />
          </button>
          <div className="page-name">
            <small>{pageTitles[view][0]}</small>
            <strong>{pageTitles[view][1]}</strong>
          </div>
          <div className="top-actions">
            <SyncStatus
              onSynced={() => loadWorkspace()}
              onNotice={setNotice}
            />
            <button
              className="universal-trigger"
              onClick={() => setCommandOpen(true)}
              title="搜索、记录、创建或打开模块"
            >
              <Search size={17} />
              <span>搜索、记录或创建…</span>
              <kbd>Ctrl K</kbd>
            </button>
            <button
              className="icon-button desktop-only"
              onClick={() => changeView("guide")}
              aria-label="打开使用指南"
              title="使用指南"
            >
              <CircleHelp size={18} />
            </button>
            <button
              className="primary-button desktop-only"
              onClick={() => setRecordOpen(true)}
            >
              <Plus size={17} />
              记录生活
            </button>
          </div>
        </header>

        <GlobalFocusIndicator
          hidden={
            view === "today" ||
            (view === "schedule" && focusClockController.session?.targetType === "schedule") ||
            (view === "tasks" && focusClockController.session?.targetType === "task")
          }
          controller={focusClockController}
          onOpen={() =>
            changeView(
              focusClockController.session?.targetType === "task"
                ? "tasks"
                : "schedule",
            )
          }
        />

        <div className="page-content">
          {loading ? (
            <div className="loading-state">
              <Leaf size={25} />
              <p>正在打开你的生活工作台…</p>
            </div>
          ) : (
            <Suspense
              fallback={
                <div className="loading-state deferred-loading">
                  <LoaderCircle className="spin" size={23} />
                  <p>正在打开这个模块…</p>
                </div>
              }
            >
              {view === "today" && (
                <HomeStudio
                  today={today}
                  events={activeEvents}
                  schedules={data.schedules}
                  inboxCount={pendingInbox.length}
                  focusClock={focusClockController}
                  onRecord={() => setRecordOpen(true)}
                  onSchedule={(date) => {
                    setEditingSchedule(null);
                    setScheduleSeedDate(date ?? null);
                    setScheduleOpen(true);
                  }}
                  onInbox={() => setInboxOpen(true)}
                  onCommand={() => setCommandOpen(true)}
                  onEdit={(id) => {
                    const event = activeEvents.find((item) => item.id === id);
                    if (event) { setEditingEvent(event); setRecordOpen(true); }
                  }}
                  onView={(next) => changeView(next as ViewId)}
                  onReload={() => loadWorkspace()}
                  onNotice={setNotice}
                  dashboard={<ConfigurableDashboard
                    events={activeEvents} schedules={data.schedules}
                    inboxCount={pendingInbox.length} photoCount={allPhotos.length}
                    onView={(next) => changeView(next as ViewId)}
                  />}
                />
              )}

              {view === "schedule" && (
                <ScheduleView
                  today={today}
                  schedules={data.schedules}
                  events={activeEvents}
                  range={scheduleRange}
                  setRange={setScheduleRange}
                  onAdd={(date) => {
                    setEditingSchedule(null);
                    setScheduleSeedDate(date ?? null);
                    setScheduleOpen(true);
                  }}
                  onEdit={(item) => {
                    setEditingSchedule(item);
                    setScheduleSeedDate(null);
                    setScheduleOpen(true);
                  }}
                  onRefresh={() => loadWorkspace()}
                  onAction={workspaceAction}
                  setNotice={setNotice}
                  focusClockController={focusClockController}
                />
              )}

              {view === "tasks" && (
                <TaskCenter
                  focusClock={focusClockController}
                  onNotice={setNotice}
                  onScheduleReload={() => loadWorkspace()}
                />
              )}

              {view === "timeline" && (
                <TimelineView
                  events={activeEvents}
                  deletedEvents={deletedEvents}
                  focusedEventId={focusedEventId}
                  onRecord={() => setRecordOpen(true)}
                  onDelete={deleteEvent}
                  onEdit={(event) => {
                    setEditingEvent(event);
                    setRecordOpen(true);
                  }}
                  onAction={workspaceAction}
                  onRefresh={() => loadWorkspace()}
                  setNotice={setNotice}
                />
              )}

              {view === "calendar" && (
                <CalendarView
                  today={today}
                  events={activeEvents}
                  schedules={data.schedules}
                  onRecord={() => setRecordOpen(true)}
                />
              )}

              {view === "graph" && (
                <LifeGraph
                  events={activeEvents}
                  schedules={data.schedules}
                  onView={(next) => changeView(next as ViewId)}
                />
              )}

              {view === "topics" && (
                <TopicSpaces
                  events={activeEvents}
                  schedules={data.schedules}
                  collections={data.collections}
                  onNotice={setNotice}
                  onWorkspaceReload={() => loadWorkspace()}
                  onView={(next) => changeView(next as ViewId)}
                />
              )}

              {view === "gallery" && (
                <PhotoCenter
                  onRecord={() => setRecordOpen(true)}
                  onNotice={setNotice}
                />
              )}

              {view === "nutrition" && (
                <NutritionCenter
                  onNotice={setNotice}
                  initialPhoto={quickMealPhoto}
                  onInitialPhotoConsumed={consumeQuickMealPhoto}
                />
              )}

              {view === "finance" && (
                <FinanceCenter onNotice={setNotice} />
              )}

              {view === "sideHustle" && (
                <SideHustleCenter
                  schedules={data.schedules}
                  onNotice={setNotice}
                  onWorkspaceReload={() => loadWorkspace()}
                />
              )}

              {view === "intelligence" && (
                <IntelligenceCenter
                  onNotice={setNotice}
                  onWorkspaceReload={() => loadWorkspace()}
                />
              )}

              {view === "jobs" && (
                <JobCenter
                  onNotice={setNotice}
                  onWorkspaceReload={() => loadWorkspace()}
                />
              )}

              {view === "tables" && (
                <TablesView
                  collections={data.collections}
                  rows={data.rows}
                  currentCollection={currentCollection}
                  currentRows={currentRows}
                  selectedId={selectedCollectionId}
                  setSelectedId={setSelectedCollectionId}
                  tableView={tableView}
                  setTableView={setTableView}
                  onTemplates={() => setTableTemplateOpen(true)}
                  onAddRow={() => {
                    setEditingRow(null);
                    setRowOpen(true);
                  }}
                  onEditRow={(row) => {
                    setEditingRow(row);
                    setRowOpen(true);
                  }}
                  onAction={workspaceAction}
                  onRefresh={() => loadWorkspace()}
                  setNotice={setNotice}
                />
              )}

              {view === "review" && (
                <LongTermReviewCenter
                  onNotice={setNotice}
                  onExport={exportWorkspace}
                  onOpenSource={(id) => {
                    setFocusedEventId(id);
                    changeView("timeline");
                  }}
                />
              )}

              {view === "inbox" && (
                <InboxView
                  items={data.inbox}
                  onAdd={() => setInboxOpen(true)}
                  onAction={workspaceAction}
                  onRefresh={() => loadWorkspace()}
                  setNotice={setNotice}
                />
              )}

              {view === "private" && (
                <PrivateView
                  events={privateEvents}
                  onRecord={() => {
                    setEditingEvent(null);
                    setRecordOpen(true);
                  }}
                  onDelete={deleteEvent}
                  onEdit={(event) => {
                    setEditingEvent(event);
                    setRecordOpen(true);
                  }}
                  onRefresh={() => loadWorkspace()}
                  setNotice={setNotice}
                />
              )}

              {view === "advanced" && (
                <AdvancedCenter
                  events={activeEvents}
                  onNotice={setNotice}
                  onWorkspaceReload={() => loadWorkspace()}
                  initialTab={advancedInitialTab}
                />
              )}

              {view === "guide" && (
                <UserGuide onNavigate={(next) => changeView(next as ViewId)} />
              )}

              {view === "mine" && (
                <MineView
                  deletedCount={deletedEvents.length}
                  collectionCount={data.collections.length}
                  preferences={workbenchPreferences}
                  onPreferencesChange={saveWorkbenchPreferences}
                  onView={changeView}
                  onNotice={setNotice}
                  onRestored={() => loadWorkspace()}
                  onOpenAutomation={() => {
                    setAdvancedInitialTab("automation");
                    changeView("advanced");
                  }}
                  onOpenLegacyImport={() => {
                    setAdvancedInitialTab("import");
                    changeView("advanced");
                  }}
                />
              )}
            </Suspense>
          )}
        </div>

        <button
          className="floating-add"
          onClick={() => setRecordOpen(true)}
          aria-label="快速记录此刻"
        >
          <Plus size={20} />
          <span>记录此刻</span>
        </button>

        <nav className="mobile-nav" aria-label="手机端导航">
          <button
            className={view === "today" ? "active" : ""}
            onClick={() => changeView("today")}
          >
            <LayoutDashboard size={20} />
            <span>今日</span>
          </button>
          <button
            className={view === "tasks" ? "active" : ""}
            onClick={() => changeView("tasks")}
          >
            <ListChecks size={20} />
            <span>任务</span>
          </button>
          <button
            className="mobile-create"
            onPointerDown={() => {
              mobilePressStartedAt.current = Date.now();
              mobileLongPress.current = false;
            }}
            onPointerUp={() => {
              if (Date.now() - mobilePressStartedAt.current >= 520) {
                mobileLongPress.current = true;
                openMobileQuick(true);
              }
            }}
            onPointerCancel={() => {
              mobilePressStartedAt.current = 0;
              mobileLongPress.current = false;
            }}
            onClick={() => {
              if (mobileLongPress.current) {
                mobileLongPress.current = false;
                return;
              }
              openMobileQuick(false);
            }}
            aria-label="快捷记录，长按优先打开语音"
            title="点击快捷记录，长按语音"
          >
            <Plus size={24} />
          </button>
          <button
            className={view === workbenchPreferences.mobileShortcut ? "active" : ""}
            onClick={() => changeView(workbenchPreferences.mobileShortcut)}
          >
            <MobileShortcutIcon size={20} />
            <span>{mobileShortcut.label}</span>
          </button>
          <button
            className={view === "mine" ? "active" : ""}
            onClick={() => changeView("mine")}
          >
            <UserRound size={20} />
            <span>我的</span>
            {pendingInbox.length > 0 && (
              <em className="mobile-nav-badge">{pendingInbox.length}</em>
            )}
          </button>
        </nav>
        <MobileInstallNudge onGuide={() => changeView("guide")} />
      </section>

      <MobileQuickSheet
        open={mobileQuickOpen}
        voiceFirst={mobileVoiceFirst}
        onClose={() => setMobileQuickOpen(false)}
        onText={() => {
          setMobileQuickOpen(false);
          setEditingEvent(null);
          setQuickRecordFiles([]);
          setRecordOpen(true);
        }}
        onTask={() => {
          setMobileQuickOpen(false);
          changeView("tasks");
        }}
        onPhoto={(file) => {
          setMobileQuickOpen(false);
          setEditingEvent(null);
          setQuickRecordFiles([file]);
          setRecordOpen(true);
        }}
        onVoice={(file) => {
          setMobileQuickOpen(false);
          setInboxDraft("语音随手记");
          setInboxFiles([file]);
          setInboxOpen(true);
        }}
        onMeal={(file) => {
          setMobileQuickOpen(false);
          setQuickMealPhoto(file ?? null);
          changeView("nutrition");
        }}
        onInbox={() => {
          setMobileQuickOpen(false);
          setInboxOpen(true);
        }}
        onCommand={() => {
          setMobileQuickOpen(false);
          setCommandOpen(true);
        }}
      />

      {commandOpen && (
        <CommandPalette
          templates={templateLibrary}
          navigationTargets={commandNavigationTargets}
          onClose={() => setCommandOpen(false)}
          onCreateRecord={createCommandRecord}
          onCreateSchedule={createCommandSchedule}
          onCreateTask={createCommandTask}
          onCreateTable={createCommandTable}
          onCreateTransaction={createCommandTransaction}
          onCreateMeal={createCommandMeal}
          onUndo={undoCommandResults}
          onSearch={(query) => {
            setGlobalSearch(query);
            setView("today");
            setSearchOpen(true);
          }}
          onNavigate={(targetId) => changeView(targetId as ViewId)}
          onOpenRecord={() => {
            setCommandOpen(false);
            setRecordOpen(true);
          }}
          onOpenSchedule={() => {
            setCommandOpen(false);
            setScheduleOpen(true);
          }}
          onNotice={setNotice}
        />
      )}

      {searchOpen && (
        <GlobalSearchPanel
          query={globalSearch}
          onQueryChange={setGlobalSearch}
          onClose={() => setSearchOpen(false)}
          onOpenResult={(result: GlobalSearchResult) => {
            setSearchOpen(false);
            changeView(result.view as ViewId);
            setNotice(`已打开${result.source}中的“${result.title}”。`);
          }}
          onNotice={setNotice}
        />
      )}

      {recordOpen && (
        <RecordModal
          initialEvent={editingEvent}
          initialFiles={quickRecordFiles}
          onClose={() => {
            setRecordOpen(false);
            setEditingEvent(null);
            setQuickRecordFiles([]);
          }}
          onSubmit={async (...args) => {
            await saveRecord(...args);
            setQuickRecordFiles([]);
          }}
          fileRef={fileRef}
          setNotice={setNotice}
        />
      )}

      {scheduleOpen && (
        <ScheduleModal
          initialSchedule={editingSchedule}
          initialDate={scheduleSeedDate}
          onClose={() => {
            setScheduleOpen(false);
            setEditingSchedule(null);
            setScheduleSeedDate(null);
          }}
          onSubmit={async (payload) => {
            try {
              const action = editingSchedule
                ? "schedule.edit"
                : Array.isArray(payload.items)
                  ? "schedule.batchCreate"
                  : "schedule.create";
              await workspaceAction(action, payload);
              setScheduleOpen(false);
              setEditingSchedule(null);
              setScheduleSeedDate(null);
              await loadWorkspace();
              setNotice(
                editingSchedule
                  ? "日程内容和时间已经更新。"
                  : Array.isArray(payload.items)
                    ? `已批量加入 ${payload.items.length} 项安排。`
                    : "日程已经进入时间表中心。",
              );
            } catch (error) {
              setNotice(error instanceof Error ? error.message : "保存失败。");
            }
          }}
        />
      )}

      {inboxOpen && (
        <Modal
          title="先放进生活收件箱"
          description="不用现在分类，先让想法和线索安全落地。"
          onClose={() => setInboxOpen(false)}
        >
          <div className="inbox-compose">
            <textarea
              value={inboxDraft}
              onChange={(event) => setInboxDraft(event.target.value)}
              placeholder="粘贴文字、链接，或者写下一闪而过的想法…"
              autoFocus
            />
            <label className="inbox-attachment-picker">
              <Upload size={16} />
              <span>添加照片、语音或文件</span>
              <input
                type="file"
                accept="image/*,audio/*,.pdf,.md,.txt"
                multiple
                onChange={(event) =>
                  setInboxFiles(Array.from(event.target.files ?? []).slice(0, 4))
                }
              />
              {inboxFiles.length > 0 && <em>{inboxFiles.length} 个附件</em>}
            </label>
            {inboxFiles.length > 0 && (
              <div className="inbox-file-list">
                {inboxFiles.map((file) => (
                  <span key={`${file.name}-${file.lastModified}`}>
                    {file.type.startsWith("audio/") ? "语音" : file.type.startsWith("image/") ? "照片" : "文件"}
                    · {file.name}
                  </span>
                ))}
              </div>
            )}
            <div className="modal-actions">
              <button
                className="secondary-button"
                onClick={() => setInboxOpen(false)}
              >
                取消
              </button>
              <button className="primary-button" onClick={saveInbox}>
                <Inbox size={16} />
                放入收件箱
              </button>
            </div>
          </div>
        </Modal>
      )}

      {tableTemplateOpen && (
        <Modal
          title="选择一张表格模板"
          description="复制后可以继续添加字段和数据。"
          onClose={() => setTableTemplateOpen(false)}
        >
          <div className="template-grid">
            {templateLibrary.map((template) => (
              <button
                key={template.name}
                onClick={() => createCollection(template)}
              >
                <span>{template.icon}</span>
                <div>
                  <strong>{template.name}</strong>
                  <p>{template.description}</p>
                </div>
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
        </Modal>
      )}

      {rowOpen && currentCollection && (
        <RowModal
          collection={currentCollection}
          collections={data.collections}
          rows={data.rows}
          initialRow={editingRow}
          onClose={() => {
            setEditingRow(null);
            setRowOpen(false);
          }}
          onSubmit={async (values) => {
            try {
              await workspaceAction(
                editingRow ? "row.update" : "row.create",
                editingRow
                  ? { id: editingRow.id, values }
                  : {
                      collectionId: currentCollection.id,
                      values,
                    },
              );
              setEditingRow(null);
              setRowOpen(false);
              await loadWorkspace();
              setNotice(editingRow ? "这一行已经更新。" : "新数据已经加入表格。");
            } catch (error) {
              setNotice(error instanceof Error ? error.message : "保存失败。");
            }
          }}
        />
      )}

      {notice && <div className="toast">{notice}</div>}
    </main>
  );
}

function ScheduleView({
  today,
  schedules,
  events,
  range,
  setRange,
  onAdd,
  onEdit,
  onRefresh,
  onAction,
  setNotice,
  focusClockController,
}: {
  today: Date;
  schedules: ScheduleEvent[];
  events: LifeEvent[];
  range: "today" | "three" | "week" | "month" | "semester" | "actual";
  setRange: (range: "today" | "three" | "week" | "month" | "semester" | "actual") => void;
  onAdd: (date?: Date) => void;
  onEdit: (item: ScheduleEvent) => void;
  onRefresh: () => Promise<void>;
  onAction: (
    action: string,
    payload: Record<string, unknown>,
  ) => Promise<{ id?: string }>;
  setNotice: (notice: string) => void;
  focusClockController: FocusClockController;
}) {
  const calendarFileRef = useRef<HTMLInputElement>(null);
  const focusSession = focusClockController.session;
  const focusNow = focusClockController.now;
  const [completionItem, setCompletionItem] = useState<ScheduleEvent | null>(
    null,
  );
  const rangeOptions = [
    ["today", "今日"],
    ["three", "三日"],
    ["week", "周"],
    ["month", "月"],
    ["semester", "学期"],
    ["actual", "实际时间轴"],
  ] as const;

  function startFocus(item: ScheduleEvent) {
    if (
      focusSession &&
      (focusSession.targetType !== "schedule" || focusSession.targetId !== item.id)
    ) {
      setNotice(`请先完成或放弃“${focusSession.title}”的专注计时。`);
      return;
    }
    focusClockController.start({
      targetType: "schedule",
      targetId: item.id,
      title: item.title,
      mode: "stopwatch",
      durationMinutes: item.plannedMinutes,
    });
    setNotice(`已开始“${item.title}”，切换页面或刷新后仍会继续计时。`);
  }

  function toggleFocus() {
    if (!focusSession) return;
    const wasRunning = focusSession.status === "running";
    focusClockController.toggle();
    setNotice(wasRunning ? "计时已暂停，暂停时间不会计入实际投入。" : "已经继续专注计时。");
  }

  function openCompletion(item: ScheduleEvent) {
    if (
      focusSession?.targetType === "schedule" &&
      focusSession.targetId === item.id &&
      focusSession.status === "running"
    ) {
      focusClockController.pause();
    }
    setCompletionItem(item);
  }

  const start =
    range === "today"
      ? new Date(new Date(today).setHours(0, 0, 0, 0))
      : range === "week" || range === "semester"
        ? startOfWeek(today)
        : new Date(new Date(today).setHours(0, 0, 0, 0));
  const dayCount =
    range === "today" || range === "actual"
      ? 1
      : range === "three"
        ? 3
        : range === "week"
          ? 7
          : range === "month"
            ? 35
            : 126;
  const days = Array.from({ length: dayCount }, (_, index) =>
    addDays(start, index),
  );
  const conflictMap = useMemo(() => {
    const result = new Map<string, string[]>();
    const grouped = new Map<string, ScheduleEvent[]>();
    for (const item of schedules) {
      const key = dayKey(item.startAt);
      const group = grouped.get(key) ?? [];
      group.push(item);
      grouped.set(key, group);
    }
    for (const group of grouped.values()) {
      const sorted = [...group].sort(
        (a, b) =>
          new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
      );
      for (let index = 0; index < sorted.length; index += 1) {
        const current = sorted[index];
        const currentEnd = new Date(current.endAt).getTime();
        for (let nextIndex = index + 1; nextIndex < sorted.length; nextIndex += 1) {
          const next = sorted[nextIndex];
          if (new Date(next.startAt).getTime() >= currentEnd) break;
          result.set(current.id, [
            ...(result.get(current.id) ?? []),
            next.title,
          ]);
          result.set(next.id, [
            ...(result.get(next.id) ?? []),
            current.title,
          ]);
        }
      }
    }
    return result;
  }, [schedules]);
  const visibleDayKeys = new Set(days.map(dayKey));
  const visibleConflictCount = [...conflictMap.keys()].filter((id) => {
    const item = schedules.find((candidate) => candidate.id === id);
    return item && visibleDayKeys.has(dayKey(item.startAt));
  }).length;

  async function complete(
    item: ScheduleEvent,
    values: {
      actualMinutes: number;
      actualStartAt: string;
      actualEndAt: string;
      reflection: string;
      interruptionReason: string;
    },
  ) {
    try {
      await onAction("schedule.update", {
        id: item.id,
        status: "已完成",
        actualMinutes: values.actualMinutes,
        note: values.reflection,
        actualStartAt: localDateTimeToIso(values.actualStartAt),
        actualEndAt: localDateTimeToIso(values.actualEndAt),
        interruptionReason: values.interruptionReason,
        createLifeEvent: true,
      });
      if (
        focusSession?.targetType === "schedule" &&
        focusSession.targetId === item.id
      ) {
        focusClockController.clear();
      }
      setCompletionItem(null);
      await onRefresh();
      setNotice("已记录实际投入，并生成完成记录。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "更新失败。");
    }
  }

  async function removeSchedule(item: ScheduleEvent) {
    let scope = "series";
    if (item.repeatRule !== "不重复") {
      const choice = window.prompt(
        "输入 1 只删除本次，输入 2 删除整个重复系列",
        "1",
      );
      if (choice === null) return;
      scope = choice.trim() === "2" ? "series" : "instance";
    } else if (!window.confirm(`删除“${item.title}”？`)) {
      return;
    }
    try {
      await onAction("schedule.delete", {
        id: item.id,
        seriesId: item.seriesId,
        scope,
      });
      await onRefresh();
      setNotice(scope === "series" ? "重复日程系列已删除。" : "本次日程已删除。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "删除日程失败。");
    }
  }

  async function importCalendar(file?: File) {
    if (!file) return;
    const form = new FormData();
    form.set("calendar", file);
    try {
      const response = await fetch("/api/calendar", {
        method: "POST",
        body: form,
      });
      const result = (await response.json()) as {
        imported?: number;
        skipped?: number;
        error?: string;
      };
      if (!response.ok) throw new Error(result.error || "日历导入失败。");
      await onRefresh();
      setNotice(
        `已导入 ${result.imported ?? 0} 项日程${
          result.skipped ? `，跳过 ${result.skipped} 项无效内容` : ""
        }。`,
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "日历导入失败。");
    } finally {
      if (calendarFileRef.current) calendarFileRef.current.value = "";
    }
  }

  return (
    <section className="standard-page">
      <div className="page-intro">
        <div>
          <span className="eyebrow">SCHEDULE CENTER</span>
          <h1>什么时候做，计划做什么，实际做了什么</h1>
          <p>课程、工作、学习、考试和旅行，都进入同一条时间轴。</p>
        </div>
        <button className="primary-button" onClick={() => onAdd()}>
          <Plus size={17} /> 新建日程
        </button>
      </div>

      {focusSession?.targetType === "schedule" && (
        <section className="focus-dock" aria-live="polite">
          <div className="focus-dock-pulse">
            {focusSession.status === "running" ? <Play size={16} /> : <Pause size={16} />}
          </div>
          <div className="focus-dock-copy">
            <small>{focusSession.status === "running" ? "正在专注" : "计时已暂停"}</small>
            <strong>{focusSession.title}</strong>
          </div>
          <time>{focusDisplay(focusSession, focusNow)}</time>
          <button
            onClick={toggleFocus}
            aria-label={focusSession.status === "running" ? "暂停计时" : "继续计时"}
          >
            {focusSession.status === "running" ? <Pause size={15} /> : <Play size={15} />}
            <span>{focusSession.status === "running" ? "暂停" : "继续"}</span>
          </button>
          <button
            className="focus-finish"
            onClick={() => {
              const item = schedules.find(
                (candidate) => candidate.id === focusSession.targetId,
              );
              if (item) openCompletion(item);
            }}
          >
            <Check size={15} /> <span>完成</span>
          </button>
          <button
            className="focus-abandon"
            onClick={() => {
              if (window.confirm("放弃本次计时？已经记录的专注时长不会写入日程。")) {
                focusClockController.clear();
                setNotice("本次专注计时已放弃，日程仍然保留。 ");
              }
            }}
            aria-label="放弃本次计时"
          >
            <X size={15} />
          </button>
        </section>
      )}

      <div className="schedule-toolbar">
        <div className="segmented-control">
          {rangeOptions.map(([id, label]) => (
            <button
              key={id}
              className={range === id ? "active" : ""}
              onClick={() => setRange(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="schedule-legend">
          <span><i className="planned" />计划</span>
          <span><i className="completed" />已完成</span>
          <span><i className="delayed" />有偏差</span>
        </div>
        <div className="schedule-data-actions">
          <button onClick={() => calendarFileRef.current?.click()}>
            <Upload size={14} /> 导入日历
          </button>
          <a href="/api/calendar" download>
            <Download size={14} /> 导出日历
          </a>
          <input
            ref={calendarFileRef}
            type="file"
            accept=".ics,text/calendar"
            hidden
            onChange={(event) =>
              void importCalendar(event.target.files?.[0])
            }
          />
        </div>
      </div>

      {range === "actual" ? (
        <ThreeTrackTime
          today={today}
          schedules={schedules}
          events={events}
          onComplete={openCompletion}
          onStartFocus={startFocus}
          onAdd={onAdd}
        />
      ) : (
        <>
          {visibleConflictCount > 0 && (
            <div className="schedule-conflict-banner">
              <AlertTriangle size={18} />
              <div>
                <strong>发现时间冲突</strong>
                <span>
                  当前视图有 {visibleConflictCount} 项安排与其他日程重叠，冲突日程已用橙色标出。
                </span>
              </div>
            </div>
          )}

          <div className={`schedule-board range-${range}`}>
        {days.map((day) => {
          const currentDayKey = dayKey(day);
          const daySchedules = schedules
            .filter((item) => dayKey(item.startAt) === currentDayKey)
            .sort(
              (a, b) =>
                new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
            );
          const isToday = currentDayKey === dayKey(new Date());
          return (
            <div
              className={`schedule-day ${isToday ? "is-today" : ""}`}
              key={currentDayKey}
            >
              <header className={isToday ? "today" : ""}>
                <span>{new Intl.DateTimeFormat("zh-CN", { weekday: "short" }).format(day)}</span>
                <strong>{day.getDate()}</strong>
                <small>{day.getMonth() + 1}月</small>
              </header>
              <div className="day-track">
                {daySchedules.length > 0 ? (
                  daySchedules.map((item) => {
                    const hasVariance =
                      item.status === "已完成" &&
                      Math.abs(item.actualMinutes - item.plannedMinutes) >= 20;
                    return (
                      <article
                        key={item.id}
                        className={`schedule-event ${
                          item.status === "已完成" ? "completed" : ""
                        } ${hasVariance ? "variance" : ""} ${
                          conflictMap.has(item.id) ? "conflict" : ""
                        }`}
                      >
                        <span className={`category-dot category-${item.category}`} />
                        <time>
                          {timeLabel(item.startAt)}—{timeLabel(item.endAt)}
                        </time>
                        <h3>{item.title}</h3>
                        <p>
                          {item.category}
                          {item.place ? ` · ${item.place}` : ""}
                        </p>
                        {item.repeatRule !== "不重复" && (
                          <em className="repeat-pill">
                            <Repeat2 size={11} /> {item.repeatRule}
                          </em>
                        )}
                        {conflictMap.has(item.id) && (
                          <em className="conflict-pill">
                            <AlertTriangle size={11} />
                            与{conflictMap.get(item.id)?.slice(0, 2).join("、")}冲突
                          </em>
                        )}
                        <div className="duration-compare">
                          <span>计划 {item.plannedMinutes} 分钟</span>
                          {item.status === "已完成" && (
                            <strong>实际 {item.actualMinutes} 分钟</strong>
                          )}
                        </div>
                        <div className="schedule-event-actions">
                          {item.status !== "已完成" ? (
                            <>
                              {(
                                focusSession?.targetType !== "schedule" ||
                                focusSession.targetId !== item.id
                              ) && (
                                <button
                                  className="focus-start-action"
                                  onClick={() => startFocus(item)}
                                  disabled={Boolean(focusSession)}
                                >
                                  <Play size={13} /> 开始
                                </button>
                              )}
                              <button onClick={() => openCompletion(item)}>
                                <Check size={13} /> 完成
                              </button>
                            </>
                          ) : (
                            <span className="completed-label">
                              <Check size={13} /> 已完成
                            </span>
                          )}
                          <button
                            className="quiet-action"
                            onClick={() => onEdit(item)}
                            title="编辑日程内容和时间"
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            className="quiet-action danger"
                            onClick={() => removeSchedule(item)}
                            title="删除日程"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </article>
                    );
                  })
                ) : (
                  <button className="empty-day" onClick={() => onAdd(day)}>
                    <Plus size={14} />
                    安排
                  </button>
                )}
              </div>
            </div>
          );
        })}
          </div>
        </>
      )}

      {completionItem && (
        <ScheduleCompletionModal
          item={completionItem}
          focusSession={
            focusSession?.targetType === "schedule" &&
            focusSession.targetId === completionItem.id
              ? focusSession
              : null
          }
          now={focusNow}
          onClose={() => setCompletionItem(null)}
          onSubmit={(values) => complete(completionItem, values)}
        />
      )}
    </section>
  );
}

function ThreeTrackTime({
  today,
  schedules,
  events,
  onComplete,
  onStartFocus,
  onAdd,
}: {
  today: Date;
  schedules: ScheduleEvent[];
  events: LifeEvent[];
  onComplete: (item: ScheduleEvent) => void;
  onStartFocus: (item: ScheduleEvent) => void;
  onAdd: () => void;
}) {
  const todaySchedules = schedules
    .filter((item) => dayKey(item.startAt) === dayKey(today))
    .sort(
      (a, b) =>
        new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
    );
  const completed = todaySchedules.filter((item) => item.status === "已完成");
  const memories = events
    .filter((item) => dayKey(item.happenedAt) === dayKey(today))
    .sort(
      (a, b) =>
        new Date(a.happenedAt).getTime() - new Date(b.happenedAt).getTime(),
    );
  const plannedMinutes = todaySchedules.reduce(
    (total, item) => total + item.plannedMinutes,
    0,
  );
  const actualMinutes = completed.reduce(
    (total, item) => total + item.actualMinutes,
    0,
  );
  const variance = actualMinutes - completed.reduce(
    (total, item) => total + item.plannedMinutes,
    0,
  );
  const completionRate = todaySchedules.length
    ? Math.round((completed.length / todaySchedules.length) * 100)
    : 0;

  return (
    <div className="three-track-wrap">
      <div className="three-track-summary">
        <div>
          <span>计划投入</span>
          <strong>{Math.round((plannedMinutes / 60) * 10) / 10}<small> 小时</small></strong>
        </div>
        <div>
          <span>实际投入</span>
          <strong>{Math.round((actualMinutes / 60) * 10) / 10}<small> 小时</small></strong>
        </div>
        <div>
          <span>计划完成率</span>
          <strong>{completionRate}<small>%</small></strong>
        </div>
        <div>
          <span>时长偏差</span>
          <strong className={variance > 0 ? "over" : ""}>
            {variance > 0 ? "+" : ""}{variance}<small> 分钟</small>
          </strong>
        </div>
      </div>

      <div className="three-track-intro">
        <span>{dateLabel(today)} · 三条轨道</span>
        <p>计划告诉你准备做什么，实际记录真正投入，回忆保留感受与细节。</p>
      </div>

      <div className="three-track-grid">
        <section className="time-track plan-track">
          <header>
            <span>01</span>
            <div><small>PLAN</small><h2>计划</h2></div>
            <em>{todaySchedules.length} 项</em>
          </header>
          <div>
            {todaySchedules.length ? (
              todaySchedules.map((item) => (
                <article key={item.id}>
                  <time>{timeLabel(item.startAt)}—{timeLabel(item.endAt)}</time>
                  <h3>{item.title}</h3>
                  <p>{item.category}{item.place ? ` · ${item.place}` : ""}</p>
                  <span>计划 {item.plannedMinutes} 分钟</span>
                </article>
              ))
            ) : (
              <button className="track-empty" onClick={onAdd}>
                <Plus size={15} /> 安排今天的第一个时间块
              </button>
            )}
          </div>
        </section>

        <section className="time-track actual-track">
          <header>
            <span>02</span>
            <div><small>ACTUAL</small><h2>实际</h2></div>
            <em>{completed.length} 项</em>
          </header>
          <div>
            {todaySchedules.length ? (
              todaySchedules.map((item) =>
                item.status === "已完成" ? (
                  <article key={item.id} className="done">
                    <time>
                      {item.actualStartAt ? timeLabel(item.actualStartAt) : timeLabel(item.startAt)}
                      —
                      {item.actualEndAt ? timeLabel(item.actualEndAt) : timeLabel(item.endAt)}
                    </time>
                    <h3>{item.title}</h3>
                    <div className="actual-compare">
                      <span>计划 {item.plannedMinutes}</span>
                      <strong>实际 {item.actualMinutes} 分钟</strong>
                    </div>
                    {item.interruptionReason && <p>中断：{item.interruptionReason}</p>}
                  </article>
                ) : (
                  <article key={item.id} className="pending-actual">
                    <time>{timeLabel(item.startAt)}</time>
                    <h3>{item.title}</h3>
                    <p>还没有记录实际投入</p>
                    <div className="actual-track-actions">
                      <button onClick={() => onStartFocus(item)}>
                        <Play size={13} /> 开始专注
                      </button>
                      <button onClick={() => onComplete(item)}>
                        <Check size={13} /> 记录实际
                      </button>
                    </div>
                  </article>
                ),
              )
            ) : (
              <p className="track-note">完成日程后，真实开始、结束和中断原因会出现在这里。</p>
            )}
          </div>
        </section>

        <section className="time-track memory-track">
          <header>
            <span>03</span>
            <div><small>MEMORY</small><h2>回忆</h2></div>
            <em>{memories.length} 条</em>
          </header>
          <div>
            {memories.length ? (
              memories.map((event) => (
                <article key={event.id}>
                  <time>{timeLabel(event.happenedAt)}</time>
                  <h3>{event.title || event.content.slice(0, 40) || "照片记录"}</h3>
                  {event.content && <p>{event.content.slice(0, 110)}</p>}
                  <div className="memory-tags">
                    <span>{event.mood}</span>
                    <span>{event.kind}</span>
                    {event.photos.length > 0 && <span>{event.photos.length} 张照片</span>}
                  </div>
                </article>
              ))
            ) : (
              <p className="track-note">今天的文字、照片、心情和完成反思会留在这里。</p>
            )}
          </div>
        </section>
      </div>

      <div className="three-track-insight">
        <Sparkles size={18} />
        <div>
          <strong>今天的时间提示</strong>
          <p>
            {completed.length
              ? variance > 20
                ? `已完成事项比原计划多用 ${variance} 分钟，下次可以多预留约 20% 缓冲。`
                : variance < -20
                  ? `已完成事项比计划少用 ${Math.abs(variance)} 分钟，可以把估时经验用于下一次安排。`
                  : "计划与实际比较接近，今天的时间估算很稳定。"
              : "完成一项安排后记录实际时长，系统才能逐步学会你的真实节奏。"}
          </p>
        </div>
      </div>
    </div>
  );
}

function TimelineView({
  events,
  deletedEvents,
  focusedEventId,
  onRecord,
  onDelete,
  onEdit,
  onAction,
  onRefresh,
  setNotice,
}: {
  events: LifeEvent[];
  deletedEvents: LifeEvent[];
  focusedEventId: string;
  onRecord: () => void;
  onDelete: (event: LifeEvent) => void;
  onEdit: (event: LifeEvent) => void;
  onAction: (
    action: string,
    payload: Record<string, unknown>,
  ) => Promise<{ id?: string }>;
  onRefresh: () => Promise<void>;
  setNotice: (notice: string) => void;
}) {
  const [kind, setKind] = useState("全部");
  const [showTrash, setShowTrash] = useState(false);
  useEffect(() => {
    if (!focusedEventId) return;
    const timer = window.setTimeout(() => {
      const element = document.getElementById(`life-event-${focusedEventId}`);
      if (!element) return;
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      element.classList.add("source-focus");
      window.setTimeout(() => element.classList.remove("source-focus"), 2600);
    }, 120);
    return () => window.clearTimeout(timer);
  }, [focusedEventId]);
  const visible = (showTrash ? deletedEvents : events).filter(
    (item) => kind === "全部" || item.kind === kind,
  );

  return (
    <section className="standard-page timeline-page">
      <div className="page-intro">
        <div>
          <span className="eyebrow">LIFE TIMELINE</span>
          <h1>真实发生过的生活，按时间重新展开</h1>
          <p>发生时间和记录时间分别保存，补记过去也不会打乱历史。</p>
        </div>
        <button className="primary-button" onClick={onRecord}>
          <Plus size={17} /> 补记或新建
        </button>
      </div>

      <div className="timeline-toolbar">
        <div className="chip-list">
          {["全部", ...eventKinds].map((item) => (
            <button
              key={item}
              className={kind === item ? "active" : ""}
              onClick={() => setKind(item)}
            >
              {item}
            </button>
          ))}
        </div>
        <button
          className={`trash-toggle ${showTrash ? "active" : ""}`}
          onClick={() => setShowTrash(!showTrash)}
        >
          <Trash2 size={15} />
          回收站 {deletedEvents.length > 0 && `(${deletedEvents.length})`}
        </button>
      </div>

      <div className="timeline-feed">
        {visible.length > 0 ? (
          visible.map((event) =>
            showTrash ? (
              <article className="trash-card" key={event.id}>
                <div>
                  <strong>{event.title || event.content.slice(0, 50) || "照片记录"}</strong>
                  <p>{dateLabel(event.happenedAt)} · {event.kind}</p>
                </div>
                <div className="trash-actions">
                  <button
                    onClick={async () => {
                      try {
                        await onAction("event.restore", { id: event.id });
                        await onRefresh();
                        setNotice("记录已经恢复到时间线。");
                      } catch (error) {
                        setNotice(error instanceof Error ? error.message : "恢复失败。");
                      }
                    }}
                  >
                    <RotateCcw size={15} /> 恢复
                  </button>
                  <button
                    className="danger"
                    onClick={async () => {
                      if (
                        !window.confirm(
                          "永久删除这条记录、历史版本和照片原件？此操作无法恢复。",
                        )
                      ) {
                        return;
                      }
                      try {
                        await onAction("event.purge", { id: event.id });
                        await onRefresh();
                        setNotice("记录已永久删除。");
                      } catch (error) {
                        setNotice(
                          error instanceof Error ? error.message : "永久删除失败。",
                        );
                      }
                    }}
                  >
                    <Trash2 size={15} /> 永久删除
                  </button>
                </div>
              </article>
            ) : (
              <EventCard
                key={event.id}
                event={event}
                onDelete={onDelete}
                onEdit={onEdit}
              />
            ),
          )
        ) : (
          <EmptyBlock
            icon={showTrash ? Trash2 : Archive}
            title={showTrash ? "回收站是空的" : "这条时间线还没有内容"}
            copy={
              showTrash
                ? "删除的生活记录会先保留在这里。"
                : "先记录一件真实发生的小事。"
            }
            action="记录生活"
            onAction={onRecord}
          />
        )}
      </div>
    </section>
  );
}

function ScheduleCompletionModal({
  item,
  focusSession,
  now,
  onClose,
  onSubmit,
}: {
  item: ScheduleEvent;
  focusSession: FocusSession | null;
  now: number;
  onClose: () => void;
  onSubmit: (values: {
    actualMinutes: number;
    actualStartAt: string;
    actualEndAt: string;
    reflection: string;
    interruptionReason: string;
  }) => Promise<void>;
}) {
  const trackedMinutes = focusSession
    ? Math.max(1, Math.round(focusElapsedMs(focusSession, now) / 60000))
    : item.actualMinutes || item.plannedMinutes;
  const defaultStart = focusSession?.startedAt ?? item.actualStartAt ?? item.startAt;
  const defaultEnd = focusSession ? new Date(now).toISOString() : item.actualEndAt ?? item.endAt;
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  return (
    <Modal
      title={`完成：${item.title}`}
      description="确认实际投入与结果；保存后会生成一条可回溯的生活记录。"
      onClose={onClose}
    >
      <form
        className="schedule-completion-form"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const actualStartAt = String(form.get("actualStartAt") || "");
          const actualEndAt = String(form.get("actualEndAt") || "");
          if (new Date(actualEndAt).getTime() < new Date(actualStartAt).getTime()) {
            setFormError("实际结束时间不能早于实际开始时间。");
            return;
          }
          setFormError("");
          setSaving(true);
          try {
            await onSubmit({
              actualMinutes: Math.max(0, Number(form.get("actualMinutes")) || 0),
              actualStartAt,
              actualEndAt,
              reflection: String(form.get("reflection") || ""),
              interruptionReason: String(form.get("interruptionReason") || ""),
            });
          } finally {
            setSaving(false);
          }
        }}
      >
        {focusSession && (
          <div className="completion-tracked-note">
            <TimerReset size={18} />
            <div>
              <strong>已从专注计时带入 {trackedMinutes} 分钟</strong>
              <span>按真实时间差计算，切换页面或进入后台不会让计时变慢。</span>
            </div>
          </div>
        )}
        <div className="completion-time-grid">
          <label>
            <span>实际开始</span>
            <input
              name="actualStartAt"
              type="datetime-local"
              defaultValue={localDateTime(new Date(defaultStart))}
              required
            />
          </label>
          <label>
            <span>实际结束</span>
            <input
              name="actualEndAt"
              type="datetime-local"
              defaultValue={localDateTime(new Date(defaultEnd))}
              required
            />
          </label>
          <label className="wide">
            <span>实际投入（分钟）</span>
            <input
              name="actualMinutes"
              type="number"
              min="0"
              max="1440"
              defaultValue={trackedMinutes}
              required
            />
            <small>计划 {item.plannedMinutes} 分钟，可按真实情况修正。</small>
          </label>
        </div>
        <label>
          <span>完成结果与感受</span>
          <textarea
            name="reflection"
            defaultValue={item.reflection || item.note}
            placeholder="完成了什么？过程中的感受、课程反思或下一步是什么？"
          />
        </label>
        <label>
          <span>中断或偏差原因（可选）</span>
          <input
            name="interruptionReason"
            defaultValue={item.interruptionReason || ""}
            placeholder="例如：临时会议、低估难度、被消息打断"
          />
        </label>
        {formError && <p className="completion-form-error" role="alert">{formError}</p>}
        <div className="modal-actions completion-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="primary-button" disabled={saving}>
            <Check size={16} /> {saving ? "正在保存…" : "完成并写入实际"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function CalendarView({
  today,
  events,
  schedules,
  onRecord,
}: {
  today: Date;
  events: LifeEvent[];
  schedules: ScheduleEvent[];
  onRecord: () => void;
}) {
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  const leading = (first.getDay() + 6) % 7;
  const days = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const cells: Array<Date | null> = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from(
      { length: days },
      (_, index) => new Date(today.getFullYear(), today.getMonth(), index + 1),
    ),
  ];
  return (
    <section className="standard-page">
      <div className="page-intro">
        <div>
          <span className="eyebrow">LIFE CALENDAR</span>
          <h1>{today.getFullYear()}年 {today.getMonth() + 1}月</h1>
          <p>紫色是生活记录，金色是计划日程，同一天可以同时拥有两种。</p>
        </div>
        <button className="primary-button" onClick={onRecord}>
          <Plus size={17} /> 补记这一天
        </button>
      </div>
      <div className="calendar-card">
        <div className="calendar-weekdays">
          {["一", "二", "三", "四", "五", "六", "日"].map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
        <div className="calendar-grid">
          {cells.map((day, index) => {
            if (!day) return <span key={`blank-${index}`} />;
            const dayEvents = events.filter(
              (event) => dayKey(event.happenedAt) === dayKey(day),
            );
            const daySchedules = schedules.filter(
              (event) => dayKey(event.startAt) === dayKey(day),
            );
            return (
              <article
                key={dayKey(day)}
                className={dayKey(day) === dayKey(today) ? "today" : ""}
              >
                <strong>{day.getDate()}</strong>
                <div className="calendar-signals">
                  {dayEvents.slice(0, 2).map((event) => (
                    <span className="event-signal" key={event.id}>
                      {event.title || event.kind}
                    </span>
                  ))}
                  {daySchedules.slice(0, 2).map((event) => (
                    <span className="schedule-signal" key={event.id}>
                      {timeLabel(event.startAt)} {event.title}
                    </span>
                  ))}
                </div>
                {(dayEvents.length > 2 || daySchedules.length > 2) && (
                  <small>还有 {Math.max(0, dayEvents.length + daySchedules.length - 4)} 项</small>
                )}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function TablesView({
  collections,
  rows,
  currentCollection,
  currentRows,
  selectedId,
  setSelectedId,
  tableView,
  setTableView,
  onTemplates,
  onAddRow,
  onEditRow,
  onAction,
  onRefresh,
  setNotice,
}: {
  collections: Collection[];
  rows: CollectionRow[];
  currentCollection?: Collection;
  currentRows: CollectionRow[];
  selectedId: string;
  setSelectedId: (id: string) => void;
  tableView: "table" | "board" | "gallery" | "calendar" | "timeline" | "chart";
  setTableView: (
    view: "table" | "board" | "gallery" | "calendar" | "timeline" | "chart",
  ) => void;
  onTemplates: () => void;
  onAddRow: () => void;
  onEditRow: (row: CollectionRow) => void;
  onAction: (
    action: string,
    payload: Record<string, unknown>,
  ) => Promise<{ id?: string }>;
  onRefresh: () => Promise<void>;
  setNotice: (notice: string) => void;
}) {
  const [tableSearch, setTableSearch] = useState("");
  const [filterField, setFilterField] = useState("");
  const [filterValue, setFilterValue] = useState("");
  const [sortField, setSortField] = useState("");
  const [sortDesc, setSortDesc] = useState(false);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const visibleRows = currentCollection
    ? currentRows
        .filter((row) =>
          Object.values(row.values)
            .join(" ")
            .toLowerCase()
            .includes(tableSearch.toLowerCase()),
        )
        .filter((row) =>
          filterField && filterValue
            ? String(row.values[filterField] ?? "")
                .toLowerCase()
                .includes(filterValue.toLowerCase())
            : true,
        )
        .sort((a, b) => {
          if (!sortField) return 0;
          const left = a.values[sortField] ?? "";
          const right = b.values[sortField] ?? "";
          const result =
            typeof left === "number" && typeof right === "number"
              ? left - right
              : String(left).localeCompare(String(right), "zh-CN");
          return sortDesc ? -result : result;
        })
    : [];
  const selectField = currentCollection?.fields.find(
    (field) => field.type === "select",
  );
  const dateField = currentCollection?.fields.find(
    (field) => field.type === "date",
  );

  async function addField() {
    if (!currentCollection) return;
    const name = window.prompt("新字段名称");
    if (!name?.trim()) return;
    const type =
      window.prompt(
        "字段类型：text / number / select / multiSelect / date / dateRange / checkbox / rating / progress / attachment / person / place / relation / rollup / formula / createdTime / modifiedTime",
        "text",
      ) || "text";
    const normalized = [
      "text",
      "number",
      "select",
      "multiSelect",
      "date",
      "dateRange",
      "checkbox",
      "rating",
      "progress",
      "attachment",
      "person",
      "place",
      "relation",
      "rollup",
      "formula",
      "createdTime",
      "modifiedTime",
    ].includes(type)
      ? type
      : "text";
    const field: FieldDefinition = {
      id: `${name.replace(/\s+/g, "-")}-${Date.now()}`,
      name: name.trim(),
      type: normalized as FieldDefinition["type"],
    };
    if (field.type === "select" || field.type === "multiSelect") {
      const options = window.prompt("选项，用逗号分隔", "未开始,进行中,已完成");
      field.options = (options || "")
        .split(/[,，]/)
        .map((item) => item.trim())
        .filter(Boolean);
    }
    if (field.type === "formula") {
      field.formula =
        window.prompt(
          "输入公式。字段名放在大括号中，例如：{实际时长}-{计划时长}；或 剩余天数({考试日期})",
          "{实际}-{计划}",
        ) || "0";
    }
    if (field.type === "relation") {
      const targetName = window.prompt(
        "要关联哪张表？请输入表名",
        collections.find((item) => item.id !== currentCollection.id)?.name ||
          currentCollection.name,
      );
      const target = collections.find((item) => item.name === targetName);
      if (!target) {
        setNotice("没有找到要关联的表格。");
        return;
      }
      field.relationCollectionId = target.id;
      field.relationMultiple = window.confirm(
        "这个字段是否允许关联多条数据？\n选择“确定”可同时关联多条，选择“取消”则只能关联一条。",
      );
    }
    if (field.type === "rollup") {
      const relationFields = currentCollection.fields.filter(
        (item) => item.type === "relation",
      );
      const relationName = window.prompt(
        "选择当前表中的关联字段",
        relationFields[0]?.name || "",
      );
      const relation = relationFields.find(
        (item) => item.name === relationName,
      );
      const target = collections.find(
        (item) => item.id === relation?.relationCollectionId,
      );
      const targetFieldName = window.prompt(
        "显示关联表中的哪个字段？",
        target?.fields[0]?.name || "",
      );
      const targetField = target?.fields.find(
        (item) => item.name === targetFieldName,
      );
      if (!relation || !targetField) {
        setNotice("请先建立关联字段，再选择有效的汇总字段。");
        return;
      }
      field.relationFieldId = relation.id;
      field.rollupFieldId = targetField.id;
      const operation =
        window.prompt(
          "汇总方式：list / sum / average / count / min / max",
          targetField.type === "number" || targetField.type === "progress"
            ? "sum"
            : "list",
        ) || "list";
      field.rollupFunction = [
        "list",
        "sum",
        "average",
        "count",
        "min",
        "max",
      ].includes(operation)
        ? (operation as FieldDefinition["rollupFunction"])
        : "list";
    }
    await onAction("collection.fields.update", {
      id: currentCollection.id,
      fields: [...currentCollection.fields, field],
    });
    await onRefresh();
    setNotice("新字段已加入当前表格。");
  }

  async function manageCollection() {
    if (!currentCollection) return;
    const action = window.prompt(
      "表格设置：rename（重命名）/ describe（修改说明）/ icon（修改图标）/ delete（删除表格）",
      "rename",
    );
    if (!action) return;
    if (action === "delete") {
      if (
        !window.confirm(
          `确定删除“${currentCollection.name}”及其中 ${currentRows.length} 行数据吗？此操作不会影响其他模块。`,
        )
      ) {
        return;
      }
      await onAction("collection.delete", { id: currentCollection.id });
      setSelectedId(
        collections.find((item) => item.id !== currentCollection.id)?.id || "",
      );
      await onRefresh();
      setNotice("表格及其数据已经删除。");
      return;
    }
    const field =
      action === "describe" ? "description" : action === "icon" ? "icon" : "name";
    const currentValue =
      field === "description"
        ? currentCollection.description
        : field === "icon"
          ? currentCollection.icon
          : currentCollection.name;
    const value = window.prompt(
      field === "description"
        ? "新的表格说明"
        : field === "icon"
          ? "新的表格图标（一个字或表情）"
          : "新的表格名称",
      currentValue,
    );
    if (value === null || !value.trim()) return;
    await onAction("collection.update", {
      id: currentCollection.id,
      [field]: value.trim(),
    });
    await onRefresh();
    setNotice("表格设置已更新。");
  }

  async function manageField() {
    if (!currentCollection?.fields.length) return;
    const fieldName = window.prompt(
      "要管理哪个字段？请输入字段名",
      currentCollection.fields[0]?.name || "",
    );
    const index = currentCollection.fields.findIndex(
      (item) => item.name === fieldName,
    );
    if (index < 0) {
      setNotice("没有找到这个字段。");
      return;
    }
    const action = window.prompt(
      "字段操作：rename（重命名）/ width（列宽）/ fixed（固定或取消固定）/ left（左移）/ right（右移）/ delete（删除）",
      "rename",
    );
    if (!action) return;
    const fields = currentCollection.fields.map((item) => ({ ...item }));
    const field = fields[index];
    if (action === "delete") {
      if (
        fields.length === 1 ||
        !window.confirm(`删除字段“${field.name}”？已有行中的这个字段值将不再显示。`)
      ) {
        return;
      }
      fields.splice(index, 1);
    } else if (action === "left" || action === "right") {
      const target = action === "left" ? index - 1 : index + 1;
      if (target < 0 || target >= fields.length) {
        setNotice("这个字段已经在最边缘。");
        return;
      }
      [fields[index], fields[target]] = [fields[target], fields[index]];
    } else if (action === "fixed") {
      field.fixed = !field.fixed;
    } else if (action === "width") {
      const width = Number(
        window.prompt("列宽（80—480 像素）", String(field.width || 160)),
      );
      if (!Number.isFinite(width)) return;
      field.width = Math.max(80, Math.min(480, Math.round(width)));
    } else {
      const name = window.prompt("新的字段名称", field.name);
      if (!name?.trim()) return;
      field.name = name.trim();
    }
    await onAction("collection.fields.update", {
      id: currentCollection.id,
      fields,
    });
    await onRefresh();
    setNotice("字段设置已更新。");
  }

  async function batchDelete() {
    if (!selectedRows.length || !window.confirm(`删除选中的 ${selectedRows.length} 行？`)) {
      return;
    }
    for (const id of selectedRows) await onAction("row.delete", { id });
    setSelectedRows([]);
    await onRefresh();
    setNotice("选中行已批量删除。");
  }

  async function batchEdit() {
    if (!currentCollection || !selectedRows.length) return;
    const fieldName = window.prompt(
      "要批量修改哪个字段？",
      currentCollection.fields[0]?.name || "",
    );
    const field = currentCollection.fields.find((item) => item.name === fieldName);
    if (!field) {
      setNotice("没有找到这个字段。");
      return;
    }
    const value = window.prompt(`把“${field.name}”统一改为：`);
    if (value === null) return;
    for (const id of selectedRows) {
      const row = currentRows.find((item) => item.id === id);
      if (!row) continue;
      await onAction("row.update", {
        id,
        values: { ...row.values, [field.id]: value },
      });
    }
    await onRefresh();
    setNotice("选中行已批量修改。");
  }

  async function saveCurrentView() {
    if (!currentCollection) return;
    const name = window.prompt("保存这个筛选视图的名称", "我的视图");
    if (!name?.trim()) return;
    const response = await fetch("/api/advanced", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "collection.view.save",
        payload: {
          collectionId: currentCollection.id,
          name,
          viewType: tableView,
          filter: { field: filterField, value: filterValue },
          sort: { field: sortField, desc: sortDesc },
          groupBy: tableView === "board" ? selectField?.id || "" : "",
        },
      }),
    });
    if (!response.ok) {
      setNotice("保存视图失败。");
      return;
    }
    setNotice("当前筛选、排序和视图已保存。");
  }

  function exportCurrentCsv() {
    if (!currentCollection) return;
    const protectSpreadsheet = (value: unknown) => {
      const raw = String(value ?? "");
      return /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
    };
    const csvCell = (value: unknown) =>
      `"${protectSpreadsheet(value).replace(/"/g, '""')}"`;
    const header = currentCollection.fields
      .map((field) => csvCell(field.name))
      .join(",");
    const lines = visibleRows.map((row) =>
      currentCollection.fields
        .map((field) => csvCell(row.values[field.id]))
        .join(","),
    );
    const blob = new Blob([`\uFEFF${[header, ...lines].join("\r\n")}`], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${currentCollection.name}-${dayKey(new Date())}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice(`已导出当前筛选结果，共 ${visibleRows.length} 行。`);
  }

  const numericSummaries = currentCollection
    ? currentCollection.fields
        .filter((field) =>
          ["number", "rating", "progress", "formula", "rollup"].includes(
            field.type,
          ),
        )
        .map((field) => {
          const values = visibleRows
            .map((row) =>
              Number(
                resolveFieldValue(
                  field,
                  row,
                  currentCollection,
                  collections,
                  rows,
                ),
              ),
            )
            .filter(Number.isFinite);
          return {
            id: field.id,
            name: field.name,
            sum: values.reduce((total, value) => total + value, 0),
            average: values.length
              ? values.reduce((total, value) => total + value, 0) /
                values.length
              : 0,
          };
        })
    : [];

  function columnStyle(field: FieldDefinition, index: number): CSSProperties {
    const width = field.width || 160;
    if (!field.fixed || !currentCollection) {
      return { minWidth: width, width };
    }
    const left =
      40 +
      currentCollection.fields
        .slice(0, index)
        .filter((item) => item.fixed)
        .reduce((total, item) => total + (item.width || 160), 0);
    return {
      left,
      minWidth: width,
      position: "sticky",
      width,
      zIndex: 3,
    };
  }

  return (
    <section className="standard-page tables-page">
      <div className="page-intro">
        <div>
          <span className="eyebrow">CUSTOM DATABASE</span>
          <h1>同一份数据，用不同视角理解</h1>
          <p>教学、科研、读书、记账都使用可配置字段，而不是固定页面。</p>
        </div>
        <button className="primary-button" onClick={onTemplates}>
          <Plus size={17} /> 新建表格
        </button>
      </div>

      {collections.length === 0 ? (
        <>
          <div className="table-onboarding">
            <span>
              <FileSpreadsheet size={28} />
            </span>
            <div>
              <h2>从一张模板开始建立表格库</h2>
              <p>
                字段决定记录什么，视图决定如何查看。先选择最常用的教学、科研或读书表。
              </p>
            </div>
            <button className="primary-button" onClick={onTemplates}>
              浏览 {templateLibrary.length} 个模板
            </button>
          </div>
          <div className="template-preview-grid">
            {templateLibrary.slice(0, 6).map((template) => (
              <button key={template.name} onClick={onTemplates}>
                <span>{template.icon}</span>
                <strong>{template.name}</strong>
                <p>{template.fields.map((field) => field.name).join(" · ")}</p>
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="database-layout">
          <aside className="database-sidebar">
            <div className="database-sidebar-head">
              <span>我的表格</span>
              <button onClick={onTemplates} aria-label="新建表格">
                <Plus size={15} />
              </button>
            </div>
            {collections.map((collection) => (
              <button
                key={collection.id}
                className={selectedId === collection.id ? "active" : ""}
                onClick={() => setSelectedId(collection.id)}
              >
                <span>{collection.icon}</span>
                <div>
                  <strong>{collection.name}</strong>
                  <small>
                    {rows.filter((row) => row.collectionId === collection.id).length} 条
                  </small>
                </div>
                <ChevronRight size={15} />
              </button>
            ))}
          </aside>

          {currentCollection && (
            <div className="database-main">
              <div className="database-heading">
                <div className="database-title">
                  <span>{currentCollection.icon}</span>
                  <div>
                    <h2>{currentCollection.name}</h2>
                    <p>{currentCollection.description}</p>
                  </div>
                </div>
                <button className="primary-button" onClick={onAddRow}>
                  <Plus size={16} /> 新增一行
                </button>
              </div>

              <div className="database-toolbar">
                <div className="view-switch">
                  <button
                    className={tableView === "table" ? "active" : ""}
                    onClick={() => setTableView("table")}
                  >
                    <Table2 size={15} /> 表格
                  </button>
                  <button
                    className={tableView === "board" ? "active" : ""}
                    onClick={() => setTableView("board")}
                  >
                    <Grid2X2 size={15} /> 看板
                  </button>
                  <button
                    className={tableView === "gallery" ? "active" : ""}
                    onClick={() => setTableView("gallery")}
                  >
                    <Boxes size={15} /> 卡片
                  </button>
                  <button
                    className={tableView === "calendar" ? "active" : ""}
                    onClick={() => setTableView("calendar")}
                  >
                    <CalendarDays size={15} /> 日历
                  </button>
                  <button
                    className={tableView === "timeline" ? "active" : ""}
                    onClick={() => setTableView("timeline")}
                  >
                    <List size={15} /> 时间线
                  </button>
                  <button
                    className={tableView === "chart" ? "active" : ""}
                    onClick={() => setTableView("chart")}
                  >
                    <TrendingUp size={15} /> 图表
                  </button>
                </div>
                <label className="table-search">
                  <Search size={15} />
                  <input
                    value={tableSearch}
                    onChange={(event) => setTableSearch(event.target.value)}
                    placeholder="搜索当前表"
                  />
                </label>
                <select
                  className="tool-select"
                  value={filterField}
                  onChange={(event) => {
                    setFilterField(event.target.value);
                    setFilterValue("");
                  }}
                  aria-label="筛选字段"
                >
                  <option value="">筛选字段</option>
                  {currentCollection.fields.map((field) => (
                    <option key={field.id} value={field.id}>{field.name}</option>
                  ))}
                </select>
                {filterField && (
                  <input
                    className="filter-value"
                    value={filterValue}
                    onChange={(event) => setFilterValue(event.target.value)}
                    placeholder="筛选值"
                  />
                )}
                <select
                  className="tool-select"
                  value={sortField}
                  onChange={(event) => setSortField(event.target.value)}
                  aria-label="排序字段"
                >
                  <option value="">排序</option>
                  {currentCollection.fields.map((field) => (
                    <option key={field.id} value={field.id}>{field.name}</option>
                  ))}
                </select>
                {sortField && (
                  <button
                    className="tool-button"
                    onClick={() => setSortDesc(!sortDesc)}
                  >
                    <ChevronDown size={15} /> {sortDesc ? "降序" : "升序"}
                  </button>
                )}
                <button className="tool-button" onClick={addField}>
                  <Plus size={15} /> 字段
                </button>
                <button className="tool-button" onClick={manageField}>
                  <Settings2 size={15} /> 管理字段
                </button>
                <button className="tool-button" onClick={manageCollection}>
                  <MoreHorizontal size={15} /> 表格设置
                </button>
                <button className="tool-button" onClick={saveCurrentView}>
                  <Filter size={15} /> 保存视图
                </button>
                <button className="tool-button" onClick={exportCurrentCsv}>
                  <Download size={15} /> 导出 CSV
                </button>
              </div>

              {selectedRows.length > 0 && (
                <div className="batch-toolbar">
                  <strong>已选 {selectedRows.length} 行</strong>
                  <button onClick={batchEdit}>批量修改</button>
                  <button onClick={batchDelete}>批量删除</button>
                  <button onClick={() => setSelectedRows([])}>取消选择</button>
                </div>
              )}

              {visibleRows.length === 0 ? (
                <EmptyBlock
                  icon={Table2}
                  title="这张表还没有数据"
                  copy={`添加第一条${currentCollection.name.replace("表", "")}记录。`}
                  action="新增一行"
                  onAction={onAddRow}
                />
              ) : tableView === "table" ? (
                <>
                  <div className="data-table-wrap">
                    <table className="data-table">
                    <thead>
                      <tr>
                        <th className="select-column">
                          <input
                            type="checkbox"
                            checked={
                              visibleRows.length > 0 &&
                              visibleRows.every((row) => selectedRows.includes(row.id))
                            }
                            onChange={(event) =>
                              setSelectedRows(
                                event.target.checked
                                  ? visibleRows.map((row) => row.id)
                                  : [],
                              )
                            }
                            aria-label="选择全部行"
                          />
                        </th>
                        {currentCollection.fields.map((field, index) => (
                          <th
                            key={field.id}
                            className={field.fixed ? "fixed-database-column" : ""}
                            style={columnStyle(field, index)}
                          >
                            {field.name}
                          </th>
                        ))}
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.map((row) => (
                        <tr key={row.id}>
                          <td className="select-column">
                            <input
                              type="checkbox"
                              checked={selectedRows.includes(row.id)}
                              onChange={(event) =>
                                setSelectedRows((current) =>
                                  event.target.checked
                                    ? [...current, row.id]
                                    : current.filter((id) => id !== row.id),
                                )
                              }
                              aria-label="选择这一行"
                            />
                          </td>
                          {currentCollection.fields.map((field, index) => (
                            <td
                              key={field.id}
                              className={field.fixed ? "fixed-database-column" : ""}
                              style={columnStyle(field, index)}
                            >
                              <FieldValue
                                field={field}
                                value={resolveFieldValue(
                                  field,
                                  row,
                                  currentCollection,
                                  collections,
                                  rows,
                                )}
                              />
                            </td>
                          ))}
                          <td>
                            <button
                              className="icon-button quiet"
                              aria-label="编辑这一行"
                              onClick={() => onEditRow(row)}
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              className="icon-button quiet"
                              aria-label="删除这一行"
                              onClick={async () => {
                                if (!window.confirm("删除这一行数据？")) return;
                                await onAction("row.delete", { id: row.id });
                                await onRefresh();
                                setNotice("表格行已删除。");
                              }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    </table>
                  </div>
                  <div className="mobile-row-cards">
                    {visibleRows.map((row) => (
                      <article key={row.id}>
                        <header>
                          <input
                            type="checkbox"
                            checked={selectedRows.includes(row.id)}
                            onChange={(event) =>
                              setSelectedRows((current) =>
                                event.target.checked
                                  ? [...current, row.id]
                                  : current.filter((id) => id !== row.id),
                              )
                            }
                            aria-label="选择这一行"
                          />
                          <strong>
                            {String(firstValue(currentCollection, row))}
                          </strong>
                          <button
                            className="icon-button quiet"
                            onClick={() => onEditRow(row)}
                            aria-label="编辑这一行"
                          >
                            <Pencil size={14} />
                          </button>
                        </header>
                        {currentCollection.fields.slice(1).map((field) => (
                          <p key={field.id}>
                            <small>{field.name}</small>
                            <FieldValue
                              field={field}
                              value={resolveFieldValue(
                                field,
                                row,
                                currentCollection,
                                collections,
                                rows,
                              )}
                            />
                          </p>
                        ))}
                      </article>
                    ))}
                  </div>
                </>
              ) : tableView === "board" && selectField ? (
                <div className="kanban-board">
                  {(selectField.options ?? ["未分类"]).map((option) => (
                    <section key={option}>
                      <header>
                        <span>{option}</span>
                        <em>
                          {
                            visibleRows.filter(
                              (row) => row.values[selectField.id] === option,
                            ).length
                          }
                        </em>
                      </header>
                      {visibleRows
                        .filter((row) => row.values[selectField.id] === option)
                        .map((row) => (
                          <article key={row.id}>
                            <strong>{String(firstValue(currentCollection, row))}</strong>
                            {currentCollection.fields.slice(1, 4).map((field) => (
                              <p key={field.id}>
                                <span>{field.name}</span>
                                <FieldValue
                                  field={field}
                                  value={resolveFieldValue(
                                    field,
                                    row,
                                    currentCollection,
                                    collections,
                                    rows,
                                  )}
                                />
                              </p>
                            ))}
                          </article>
                        ))}
                    </section>
                  ))}
                </div>
              ) : tableView === "calendar" && dateField ? (
                <div className="database-calendar-view">
                  {visibleRows
                    .slice()
                    .sort(
                      (a, b) =>
                        new Date(String(a.values[dateField.id] || 0)).getTime() -
                        new Date(String(b.values[dateField.id] || 0)).getTime(),
                    )
                    .map((row) => (
                      <article key={row.id}>
                        <time>
                          {String(row.values[dateField.id] || "未设置日期")}
                        </time>
                        <div>
                          <strong>{String(firstValue(currentCollection, row))}</strong>
                          <p>
                            {currentCollection.fields
                              .filter((field) => field.id !== dateField.id)
                              .slice(1, 4)
                              .map((field) => `${field.name}：${row.values[field.id] ?? "—"}`)
                              .join(" · ")}
                          </p>
                        </div>
                      </article>
                    ))}
                </div>
              ) : tableView === "timeline" ? (
                <div className="database-timeline-view">
                  {visibleRows.map((row, index) => (
                    <article key={row.id}>
                      <span>{index + 1}</span>
                      <div>
                        <strong>{String(firstValue(currentCollection, row))}</strong>
                        {currentCollection.fields.slice(1, 5).map((field) => (
                          <p key={field.id}>
                            <small>{field.name}</small>
                            <FieldValue
                              field={field}
                              value={resolveFieldValue(
                                field,
                                row,
                                currentCollection,
                                collections,
                                rows,
                              )}
                            />
                          </p>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              ) : tableView === "chart" && selectField ? (
                <div className="database-chart-view">
                  {(selectField.options ?? []).map((option) => {
                    const count = visibleRows.filter(
                      (row) => row.values[selectField.id] === option,
                    ).length;
                    const max = Math.max(
                      1,
                      ...(selectField.options ?? []).map(
                        (value) =>
                          visibleRows.filter(
                            (row) => row.values[selectField.id] === value,
                          ).length,
                      ),
                    );
                    return (
                      <div key={option}>
                        <span>{option}</span>
                        <i><b style={{ width: `${(count / max) * 100}%` }} /></i>
                        <strong>{count}</strong>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="database-gallery">
                  {visibleRows.map((row) => (
                    <article key={row.id}>
                      <span>{currentCollection.icon}</span>
                      <h3>{String(firstValue(currentCollection, row))}</h3>
                      {currentCollection.fields.slice(1, 5).map((field) => (
                        <p key={field.id}>
                          <small>{field.name}</small>
                          <FieldValue
                            field={field}
                            value={resolveFieldValue(
                              field,
                              row,
                              currentCollection,
                              collections,
                              rows,
                            )}
                          />
                        </p>
                      ))}
                    </article>
                  ))}
                </div>
              )}
              <div className="database-summary-bar">
                <span>当前视图 {visibleRows.length} 行</span>
                {numericSummaries.map((item) => (
                  <span key={item.id}>
                    {item.name}：合计 {Math.round(item.sum * 100) / 100} · 平均{" "}
                    {Math.round(item.average * 100) / 100}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function FieldValue({
  field,
  value,
}: {
  field: FieldDefinition;
  value: string | number | boolean | undefined;
}) {
  if (field.type === "checkbox") {
    return <span className={`check-value ${value ? "on" : ""}`}>{value ? "是" : "否"}</span>;
  }
  if (field.type === "rating") {
    return <span className="rating-value">{"★".repeat(Number(value) || 0)}{"☆".repeat(5 - (Number(value) || 0))}</span>;
  }
  if (field.type === "progress") {
    const progress = Math.min(100, Math.max(0, Number(value) || 0));
    return (
      <span className="progress-value">
        <i><b style={{ width: `${progress}%` }} /></i>
        {progress}%
      </span>
    );
  }
  if (field.type === "select") {
    return <span className="select-value">{String(value || "未选择")}</span>;
  }
  if (field.type === "multiSelect") {
    return (
      <span className="multi-select-value">
        {String(value || "未选择")
          .split(/[、,，]/)
          .filter(Boolean)
          .map((item) => <i key={item}>{item}</i>)}
      </span>
    );
  }
  if (field.type === "attachment" && value) {
    return (
      <a href={String(value)} target="_blank" rel="noreferrer">
        打开附件
      </a>
    );
  }
  if (field.type === "createdTime" || field.type === "modifiedTime") {
    const date = new Date(String(value || ""));
    return (
      <>
        {Number.isNaN(date.getTime())
          ? "—"
          : date.toLocaleString("zh-CN", {
              month: "numeric",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
      </>
    );
  }
  if (field.type === "formula") {
    return <strong className="formula-value">{String(value ?? 0)}</strong>;
  }
  return <>{String(value ?? "—")}</>;
}

export function ReviewView({
  today,
  events,
  plannedMinutes,
  actualMinutes,
  completionRate,
  onExport,
}: {
  today: Date;
  events: LifeEvent[];
  plannedMinutes: number;
  actualMinutes: number;
  completionRate: number;
  onExport: () => void;
}) {
  const monthEvents = events.filter((event) => {
    const date = new Date(event.happenedAt);
    return (
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth()
    );
  });
  const areaCounts = eventKinds
    .map((kind) => ({
      kind,
      count: monthEvents.filter((event) => event.kind === kind).length,
    }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count);
  const moodCounts = moods
    .map((mood) => ({
      ...mood,
      count: monthEvents.filter((event) => event.mood === mood.label).length,
    }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count);
  const variance = actualMinutes - plannedMinutes;

  return (
    <section className="standard-page review-page">
      <div className="page-intro">
        <div>
          <span className="eyebrow">REFLECTION CENTER</span>
          <h1>{today.getMonth() + 1}月生活回顾</h1>
          <p>每一条总结都来自原始记录和真实时间投入。</p>
        </div>
        <button className="secondary-button" onClick={onExport}>
          <Download size={16} /> 导出原始数据
        </button>
      </div>

      <div className="review-hero">
        <div>
          <span className="eyebrow">MONTHLY STORY</span>
          <h2>
            {monthEvents.length
              ? `你在这个月收藏了 ${monthEvents.length} 个生活片段。`
              : "这个月的故事，正等你写下开头。"}
          </h2>
          <p>
            {monthEvents.length
              ? `最常出现的生活领域是“${
                  areaCounts[0]?.kind ?? "生活"
                }”，主要心情是“${
                  moodCounts[0]?.label ?? "平静"
                }”。这些数据不是评价，而是帮助你看见注意力真正流向哪里。`
              : "从一张照片、一句话或一次日程完成开始，系统就能建立可回溯的总结。"}
          </p>
        </div>
        <div className="review-seal">
          <Sparkles size={22} />
          <strong>{monthEvents.length}</strong>
          <span>生活事件</span>
        </div>
      </div>

      <div className="review-stat-grid">
        <Stat value={`${completionRate}%`} label="本周计划完成率" />
        <Stat value={`${Math.round(plannedMinutes / 60)}h`} label="计划投入" />
        <Stat value={`${Math.round(actualMinutes / 60)}h`} label="实际投入" />
        <Stat value={`${variance >= 0 ? "+" : ""}${variance}m`} label="计划偏差" />
      </div>

      <div className="review-panels">
        <section className="review-panel">
          <div className="panel-heading">
            <span className="heading-icon rose"><Heart size={17} /></span>
            <div>
              <h3>心情天气</h3>
              <p>最近的内心更多是什么颜色？</p>
            </div>
          </div>
          {moodCounts.length > 0 ? (
            <div className="mood-bars">
              {moodCounts.map((item) => (
                <div key={item.label}>
                  <span>{item.mark} {item.label}</span>
                  <i>
                    <b
                      style={{
                        width: `${(item.count / monthEvents.length) * 100}%`,
                        background: item.color,
                      }}
                    />
                  </i>
                  <strong>{item.count}</strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="panel-empty">记录几次心情后，这里会出现趋势。</p>
          )}
        </section>

        <section className="review-panel">
          <div className="panel-heading">
            <span className="heading-icon purple"><Target size={17} /></span>
            <div>
              <h3>生活重心</h3>
              <p>时间和注意力流向了哪里？</p>
            </div>
          </div>
          {areaCounts.length > 0 ? (
            <div className="area-ranking">
              {areaCounts.slice(0, 6).map((item, index) => (
                <div key={item.kind}>
                  <span>{index + 1}</span>
                  <strong>{item.kind}</strong>
                  <i />
                  <em>{item.count} 次</em>
                </div>
              ))}
            </div>
          ) : (
            <p className="panel-empty">生活领域会随着记录慢慢浮现。</p>
          )}
        </section>

        <section className="review-panel wide">
          <div className="panel-heading">
            <span className="heading-icon amber"><Sparkles size={17} /></span>
            <div>
              <h3>近期高光与来源</h3>
              <p>每一条摘要都保留回到原始记录的路径。</p>
            </div>
          </div>
          <div className="highlight-grid">
            {monthEvents.slice(0, 4).map((event, index) => (
              <article key={event.id}>
                <span>0{index + 1}</span>
                <div>
                  <small>{dateLabel(event.happenedAt)} · {event.kind}</small>
                  <p>{event.title || event.content || `收藏了 ${event.photos.length} 张照片`}</p>
                  <button>查看原始记录 <ChevronRight size={13} /></button>
                </div>
              </article>
            ))}
            {monthEvents.length === 0 && (
              <p className="panel-empty">记录之后，这里会替你整理高光。</p>
            )}
          </div>
        </section>
      </div>

      <div className="topic-summary-strip">
        {["一次旅行", "一个学期", "考试备考", "论文项目", "自定义日期"].map(
          (topic) => (
            <button key={topic}>
              <Sparkles size={15} />
              <span>{topic}总结</span>
              <small>从关联记录生成</small>
            </button>
          ),
        )}
      </div>
    </section>
  );
}

function InboxView({
  items,
  onAdd,
  onAction,
  onRefresh,
  setNotice,
}: {
  items: InboxItem[];
  onAdd: () => void;
  onAction: (
    action: string,
    payload: Record<string, unknown>,
  ) => Promise<{ id?: string }>;
  onRefresh: () => Promise<void>;
  setNotice: (notice: string) => void;
}) {
  const pending = items.filter((item) => item.status === "待整理");
  const [triageMode, setTriageMode] = useState(false);
  const [triageIndex, setTriageIndex] = useState(0);
  const normalizedTriageIndex = pending.length
    ? triageIndex % pending.length
    : 0;
  const triageItem = pending.length
    ? pending[normalizedTriageIndex]
    : null;

  useEffect(() => {
    if (!triageMode) return;
    function navigate(event: KeyboardEvent) {
      if (event.key === "Escape") setTriageMode(false);
      if (event.key === "ArrowRight") {
        setTriageIndex((current) =>
          pending.length ? (current + 1) % pending.length : 0,
        );
      }
      if (event.key === "ArrowLeft") {
        setTriageIndex((current) =>
          pending.length
            ? (current - 1 + pending.length) % pending.length
            : 0,
        );
      }
    }
    window.addEventListener("keydown", navigate);
    return () => window.removeEventListener("keydown", navigate);
  }, [pending.length, triageMode]);

  async function organize(item: InboxItem) {
    try {
      await onAction("inbox.organize", {
        id: item.id,
        kind: "生活",
        mood: "平静",
        happenedAt: new Date().toISOString(),
      });
      await onRefresh();
      setNotice("已经整理为一条生活事件。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "整理失败。");
    }
  }

  function attachments(item: InboxItem) {
    if (!item.attachments?.length) return null;
    return (
      <div className="inbox-attachments">
        {item.attachments.map((attachment) =>
          attachment.contentType.startsWith("image/") ? (
            <img
              key={attachment.id}
              src={attachment.url}
              alt={attachment.filename}
              loading="lazy"
              decoding="async"
            />
          ) : attachment.contentType.startsWith("audio/") ? (
            <audio
              key={attachment.id}
              src={attachment.url}
              controls
            />
          ) : (
            <a
              key={attachment.id}
              href={attachment.url}
              target="_blank"
              rel="noreferrer"
            >
              {attachment.filename}
            </a>
          ),
        )}
      </div>
    );
  }

  return (
    <section className="standard-page inbox-page">
      <div className="page-intro">
        <div>
          <span className="eyebrow">LIFE INBOX</span>
          <h1>先保存，再决定它属于哪里</h1>
          <p>文字、链接和灵感不需要在捕捉时立刻分类。</p>
        </div>
        <button className="primary-button" onClick={onAdd}>
          <Plus size={17} /> 放入收件箱
        </button>
        {pending.length > 0 && (
          <button
            className="secondary-button"
            onClick={() => {
              setTriageIndex(0);
              setTriageMode(true);
            }}
          >
            <Check size={17} /> 逐条整理
          </button>
        )}
      </div>
      <div className="inbox-overview">
        <Stat value={pending.length} label="待整理" />
        <Stat value={items.filter((item) => item.status === "已整理").length} label="已转为事件" />
        <Stat value={items.length} label="全部线索" />
      </div>
      {triageMode && triageItem && (
        <section className="inbox-triage" aria-label="逐条整理收件箱">
          <header>
            <div>
              <span className="eyebrow">ONE BY ONE</span>
              <h2>一次只处理一条</h2>
            </div>
            <span>{normalizedTriageIndex + 1} / {pending.length}</span>
            <button
              className="icon-button quiet"
              onClick={() => setTriageMode(false)}
              aria-label="退出逐条整理"
            >
              <X size={17} />
            </button>
          </header>
          <article>
            <span className="inbox-type">{triageItem.sourceType}</span>
            <p>{triageItem.content || "这条线索只有附件"}</p>
            {attachments(triageItem)}
            <small>
              {new Date(triageItem.createdAt).toLocaleString("zh-CN")}
            </small>
          </article>
          <footer>
            <button
              onClick={() =>
                setTriageIndex((current) =>
                  pending.length
                    ? (current - 1 + pending.length) % pending.length
                    : 0,
                )
              }
            >
              上一条
            </button>
            <button
              onClick={() =>
                setTriageIndex((current) =>
                  pending.length ? (current + 1) % pending.length : 0,
                )
              }
            >
              稍后处理
            </button>
            <button
              className="danger"
              onClick={async () => {
                await onAction("inbox.delete", { id: triageItem.id });
                await onRefresh();
                setNotice("这条线索已从收件箱移除。");
              }}
            >
              <Trash2 size={14} /> 删除
            </button>
            <button
              className="primary"
              onClick={() => void organize(triageItem)}
            >
              <Check size={14} /> 整理为生活事件
            </button>
          </footer>
        </section>
      )}
      {pending.length > 0 ? (
        <div className="inbox-list">
          {pending.map((item) => (
            <article key={item.id}>
              <span className="inbox-type">{item.sourceType}</span>
              <div>
                <p>{item.content}</p>
                {attachments(item)}
                <small>{new Date(item.createdAt).toLocaleString("zh-CN")}</small>
              </div>
              <button
                className="organize-button"
                onClick={() => void organize(item)}
              >
                整理为事件 <ChevronRight size={14} />
              </button>
              <button
                className="icon-button quiet"
                aria-label="删除收件箱项目"
                onClick={async () => {
                  await onAction("inbox.delete", { id: item.id });
                  await onRefresh();
                  setNotice("已从收件箱移除。");
                }}
              >
                <Trash2 size={14} />
              </button>
            </article>
          ))}
        </div>
      ) : (
        <EmptyBlock
          icon={Inbox}
          title="收件箱已经清空"
          copy="下次遇到来不及整理的内容，先把它放进这里。"
          action="放入一条线索"
          onAction={onAdd}
        />
      )}
    </section>
  );
}

function PrivateView({
  events,
  onRecord,
  onDelete,
  onEdit,
  onRefresh,
  setNotice,
}: {
  events: LifeEvent[];
  onRecord: () => void;
  onDelete: (event: LifeEvent) => void;
  onEdit: (event: LifeEvent) => void;
  onRefresh: () => Promise<void>;
  setNotice: (notice: string) => void;
}) {
  const [vault, setVault] = useState({
    loading: true,
    configured: false,
    unlocked: false,
  });
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadVault() {
    try {
      const response = await fetch("/api/private-vault", {
        cache: "no-store",
      });
      const result = (await response.json()) as {
        configured?: boolean;
        unlocked?: boolean;
        error?: string;
      };
      if (!response.ok) throw new Error(result.error || "读取私密空间失败。");
      setVault({
        loading: false,
        configured: Boolean(result.configured),
        unlocked: Boolean(result.unlocked),
      });
    } catch (error) {
      setVault((current) => ({ ...current, loading: false }));
      setNotice(error instanceof Error ? error.message : "读取私密空间失败。");
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void loadVault(), 0);
    return () => window.clearTimeout(timer);
    // Vault state is checked whenever this page is mounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!vault.unlocked) {
      document.documentElement.classList.remove("privacy-concealed");
      return;
    }
    function concealAndLock() {
      document.documentElement.classList.add("privacy-concealed");
      setVault((current) => ({ ...current, unlocked: false }));
      void fetch("/api/private-vault", {
        method: "DELETE",
        keepalive: true,
      }).catch(() => undefined);
    }
    function visibilityChanged() {
      if (document.visibilityState === "hidden") {
        concealAndLock();
      } else {
        document.documentElement.classList.remove("privacy-concealed");
      }
    }
    document.addEventListener("visibilitychange", visibilityChanged);
    window.addEventListener("pagehide", concealAndLock);
    return () => {
      document.removeEventListener("visibilitychange", visibilityChanged);
      window.removeEventListener("pagehide", concealAndLock);
      document.documentElement.classList.remove("privacy-concealed");
      void fetch("/api/private-vault", {
        method: "DELETE",
        keepalive: true,
      }).catch(() => undefined);
    };
  }, [vault.unlocked]);

  async function unlock() {
    setBusy(true);
    try {
      const response = await fetch("/api/private-vault", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: vault.configured ? "unlock" : "setup",
          pin,
          lockTimeoutMinutes: 30,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "解锁失败。");
      setPin("");
      setVault({ loading: false, configured: true, unlocked: true });
      await onRefresh();
      setNotice(
        vault.configured
          ? "私密空间已解锁，30 分钟后自动锁定。"
          : "独立密码已设置，私密空间已经解锁。",
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "解锁失败。");
    } finally {
      setBusy(false);
    }
  }

  if (vault.loading) {
    return (
      <section className="standard-page private-page">
        <div className="private-vault-gate">
          <LoaderCircle className="spin" size={26} />
          <p>正在检查私密空间锁…</p>
        </div>
      </section>
    );
  }

  if (!vault.unlocked) {
    return (
      <section className="standard-page private-page">
        <div className="private-vault-gate">
          <span><EyeOff size={26} /></span>
          <h1>{vault.configured ? "私密空间已锁定" : "设置私密空间独立密码"}</h1>
          <p>
            {vault.configured
              ? "未解锁时，私密记录不会由工作台接口返回，也不会出现在页面内存中。"
              : "请设置 6—12 位数字密码。它与 Sites 登录共同保护私密记录。"}
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void unlock();
            }}
          >
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]{6,12}"
              minLength={6}
              maxLength={12}
              value={pin}
              onChange={(event) =>
                setPin(event.target.value.replace(/\D/g, ""))
              }
              placeholder="输入独立密码"
              autoComplete="current-password"
              required
            />
            <button className="primary-button" disabled={busy}>
              {busy ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <EyeOff size={16} />
              )}
              {vault.configured ? "解锁私密空间" : "设置并解锁"}
            </button>
          </form>
        </div>
      </section>
    );
  }

  return (
    <section className="standard-page private-page">
      <div className="privacy-banner">
        <span><EyeOff size={23} /></span>
        <div>
          <h1>私密空间与普通工作台完全分开</h1>
          <p>这里的内容不会进入普通首页、搜索、默认总结、往年今日和通知正文；切到后台时会立即遮挡并重新锁定。</p>
        </div>
        <button className="light-button" onClick={onRecord}>
          <Plus size={16} /> 新建私密记录
        </button>
        <button
          className="light-button"
          onClick={async () => {
            await fetch("/api/private-vault", { method: "DELETE" });
            setVault((current) => ({ ...current, unlocked: false }));
            await onRefresh();
            setNotice("私密空间已立即锁定。");
          }}
        >
          <EyeOff size={16} /> 立即锁定
        </button>
      </div>
      {events.length > 0 ? (
        <div className="private-feed">
          {events.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              onDelete={onDelete}
              onEdit={onEdit}
            />
          ))}
        </div>
      ) : (
        <EmptyBlock
          icon={EyeOff}
          title="这里暂时很安静"
          copy="新建记录时打开“私密空间”，内容只会出现在这里。"
          action="写入私密空间"
          onAction={onRecord}
        />
      )}
    </section>
  );
}

function MineView({
  deletedCount,
  collectionCount,
  preferences,
  onPreferencesChange,
  onView,
  onNotice,
  onRestored,
  onOpenLegacyImport,
  onOpenAutomation,
}: {
  deletedCount: number;
  collectionCount: number;
  preferences: WorkbenchPreferences;
  onPreferencesChange: (
    patch: Partial<WorkbenchPreferences>,
  ) => Promise<void>;
  onView: (view: ViewId) => void;
  onNotice: (notice: string) => void;
  onRestored: () => Promise<void>;
  onOpenLegacyImport: () => void;
  onOpenAutomation: () => void;
}) {
  return (
    <section className="standard-page mine-page">
      <div className="page-intro">
        <div>
          <span className="eyebrow">MY WORKBENCH</span>
          <h1>让工作台适应你，而不是相反</h1>
          <p>管理模块、自动化、导入导出和数据隐私。</p>
        </div>
      </div>

      <div className="settings-grid">
        <section className="settings-card module-settings">
          <div className="panel-heading">
            <span className="heading-icon purple"><Grid2X2 size={17} /></span>
            <div><h3>工作台模式与场景</h3><p>先保持简单，需要时再展开全部功能</p></div>
          </div>
          <p className="settings-explainer">
            简洁模式保留“今日、时间表、时间线、回顾、收件箱”，并根据你的主要场景显示最常用模块；所有功能仍可随时展开。
          </p>
          <div className="workspace-mode-switch" aria-label="工作台模式">
            <button
              className={preferences.workspaceMode === "simple" ? "active" : ""}
              onClick={() =>
                void onPreferencesChange({ workspaceMode: "simple" })
              }
            >
              简洁模式
              <small>第一次使用更清楚</small>
            </button>
            <button
              className={preferences.workspaceMode === "full" ? "active" : ""}
              onClick={() =>
                void onPreferencesChange({ workspaceMode: "full" })
              }
            >
              完整模式
              <small>直接显示全部模块</small>
            </button>
          </div>
          <div className="scene-preset-grid">
            {(Object.keys(scenePresetMeta) as ScenePreset[]).map((preset) => (
              <button
                key={preset}
                className={preferences.scenePreset === preset ? "active" : ""}
                onClick={() => void onPreferencesChange({ scenePreset: preset })}
              >
                <strong>{scenePresetMeta[preset].label}</strong>
                <small>{scenePresetMeta[preset].description}</small>
              </button>
            ))}
          </div>
          <div className="mobile-shortcut-settings">
            <div>
              <strong>手机底部快捷入口</strong>
              <small>“今日、时间表、＋、我的”固定，中间右侧入口由你选择。</small>
            </div>
            <div role="group" aria-label="选择手机底部快捷入口">
              {(Object.keys(mobileShortcutMeta) as MobileShortcut[]).map(
                (shortcut) => {
                  const item = mobileShortcutMeta[shortcut];
                  const Icon = item.icon;
                  return (
                    <button
                      key={shortcut}
                      className={
                        preferences.mobileShortcut === shortcut ? "active" : ""
                      }
                      onClick={() =>
                        void onPreferencesChange({
                          mobileShortcut: shortcut,
                        })
                      }
                    >
                      <Icon size={15} />
                      {item.label}
                    </button>
                  );
                },
              )}
            </div>
          </div>
          <div className="data-actions">
            <button onClick={() => onView("today")}>
              <Grid2X2 size={16} />
              <span>
                <strong>打开今日页配置</strong>
                <small>编辑真实生效的首页布局</small>
              </span>
              <ChevronRight size={15} />
            </button>
          </div>
        </section>

        <section className="settings-card automation-card">
          <div className="panel-heading">
            <span className="heading-icon amber"><Repeat2 size={17} /></span>
            <div><h3>自动化中心</h3><p>在合适的时间温和提醒</p></div>
          </div>
          <p className="settings-explainer">
            管理每日记录、日程提醒、照片补注、周报月报和长期未记录提醒；每次执行都有日志并能安全补跑。
          </p>
          <div className="data-actions">
            <button onClick={onOpenAutomation}>
              <Clock3 size={16} />
              <span>
                <strong>进入正式自动化中心</strong>
                <small>设置时间、查看提醒与执行记录</small>
              </span>
              <ChevronRight size={15} />
            </button>
          </div>
        </section>

        <DataPortabilityCenter
          onNotice={onNotice}
          onOpenLegacyImport={onOpenLegacyImport}
          onRestored={onRestored}
        />

        <SyncCenter onNotice={onNotice} onSynced={onRestored} />

        <ReliabilityCenter
          onNotice={onNotice}
          onWorkspaceReload={onRestored}
        />

        <section className="settings-card data-card">
          <div className="panel-heading">
            <span className="heading-icon green"><Archive size={17} /></span>
            <div><h3>回收站与数据保留</h3><p>删除先进入回收站，备份时仍可保留</p></div>
          </div>
          <div className="data-actions">
            <button onClick={() => onView("timeline")}><Trash2 size={16} /><span><strong>查看回收站</strong><small>{deletedCount} 条待处理记录</small></span><ChevronRight size={15} /></button>
          </div>
        </section>

        <section className="settings-card milestones-card">
          <div className="panel-heading">
            <span className="heading-icon rose"><GraduationCap size={17} /></span>
            <div><h3>人生里程碑</h3><p>毕业、入职、论文与重要旅程</p></div>
          </div>
          <div className="milestone-empty">
            <Target size={24} />
            <p>把重要节点记录为“里程碑”生活事件，它会出现在年度回顾中。</p>
            <button onClick={() => onView("timeline")}>查看生活时间线</button>
          </div>
          <small className="collection-count">当前已有 {collectionCount} 张自定义表格</small>
        </section>

        <PwaInstallCard />

        <NotificationSetupCard onNotice={onNotice} />
      </div>
    </section>
  );
}

function RecordModal({
  initialEvent,
  initialFiles,
  onClose,
  onSubmit,
  fileRef,
  setNotice,
}: {
  initialEvent?: LifeEvent | null;
  initialFiles?: File[];
  onClose: () => void;
  onSubmit: (
    form: HTMLFormElement,
    photos: File[],
    event?: LifeEvent | null,
  ) => Promise<void>;
  fileRef: React.RefObject<HTMLInputElement | null>;
  setNotice: (notice: string) => void;
}) {
  const [mood, setMood] = useState(initialEvent?.mood || "平静");
  const [energy, setEnergy] = useState(initialEvent?.energy || 3);
  const [files, setFiles] = useState<File[]>(initialFiles ?? []);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [advanced, setAdvanced] = useState(
    Boolean(
      initialEvent?.person ||
        initialEvent?.place ||
        initialEvent?.project ||
        initialEvent?.tags.length ||
        initialEvent?.isPrivate,
    ),
  );
  const [saving, setSaving] = useState(false);
  const [draftStatus, setDraftStatus] = useState<
    "idle" | "saving" | "saved" | "offline" | "conflict"
  >("idle");
  const [history, setHistory] = useState<
    Array<{
      id: string;
      revision: number;
      snapshot: Record<string, unknown>;
      changeNote: string;
      createdAt: string;
    }>
  >([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const draftIdRef = useRef("");
  const draftRevisionRef = useRef(0);
  const draftTimerRef = useRef<number | null>(null);

  function field(name: string) {
    return formRef.current?.elements.namedItem(name) as
      | HTMLInputElement
      | HTMLTextAreaElement
      | HTMLSelectElement
      | null;
  }

  function draftPayload() {
    return {
      title: field("title")?.value || "",
      content: field("content")?.value || "",
      happenedAt: field("happenedAt")?.value || localDateTime(),
      kind: field("kind")?.value || "生活",
      mood: field("mood")?.value || "平静",
      energy: Number(field("energy")?.value) || 3,
      person: field("person")?.value || "",
      place: field("place")?.value || "",
      project: field("project")?.value || "",
      tags: field("tags")?.value || "",
      relation: field("relation")?.value || "",
      isPrivate: Boolean(
        (field("isPrivate") as HTMLInputElement | null)?.checked,
      ),
    };
  }

  function applySnapshot(snapshot: Record<string, unknown>) {
    const values: Record<string, string> = {
      title: String(snapshot.title ?? ""),
      content: String(snapshot.content ?? ""),
      happenedAt: localDateTime(new Date(String(snapshot.happenedAt ?? ""))),
      kind: String(snapshot.kind ?? "生活"),
      person: String(snapshot.person ?? ""),
      place: String(snapshot.place ?? ""),
      project: String(snapshot.project ?? ""),
      tags: Array.isArray(snapshot.tags)
        ? snapshot.tags.join("，")
        : String(snapshot.tags ?? ""),
      relation: String(snapshot.relation ?? ""),
    };
    for (const [name, value] of Object.entries(values)) {
      const control = field(name);
      if (control) control.value = value;
    }
    const privateInput = field("isPrivate") as HTMLInputElement | null;
    if (privateInput) privateInput.checked = snapshot.isPrivate === true;
    setMood(String(snapshot.mood ?? "平静"));
    setEnergy(Math.min(5, Math.max(1, Number(snapshot.energy) || 3)));
    setAdvanced(
      Boolean(
        values.person ||
          values.place ||
          values.project ||
          values.tags ||
          snapshot.isPrivate,
      ),
    );
    setDraftStatus("idle");
  }

  async function saveDraft() {
    if (!draftIdRef.current) return;
    const draft = draftPayload();
    const hasContent = Object.entries(draft).some(([key, value]) =>
      key === "happenedAt" || key === "kind" || key === "mood" || key === "energy"
        ? false
        : Boolean(value),
    );
    if (!hasContent && !initialEvent) return;
    setDraftStatus("saving");
    window.localStorage.setItem(
      `richangyu-local-${draftIdRef.current}`,
      JSON.stringify(draft),
    );
    if (!window.navigator.onLine) {
      setDraftStatus("offline");
      return;
    }
    try {
      const response = await fetch("/api/drafts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: draftIdRef.current,
          eventId: initialEvent?.id || null,
          deviceId: getDeviceId(),
          expectedRevision: draftRevisionRef.current,
          draft,
        }),
      });
      const result = (await response.json()) as {
        conflict?: boolean;
        draft?: { revision?: number } | null;
      };
      if (response.status === 409 || result.conflict) {
        setDraftStatus("conflict");
        return;
      }
      if (!response.ok) throw new Error("draft save failed");
      draftRevisionRef.current = Number(result.draft?.revision) || 1;
      setDraftStatus("saved");
    } catch {
      setDraftStatus("offline");
    }
  }

  function scheduleDraftSave() {
    setDraftStatus("idle");
    if (draftTimerRef.current) window.clearTimeout(draftTimerRef.current);
    draftTimerRef.current = window.setTimeout(() => void saveDraft(), 800);
  }

  useEffect(() => {
    const urls = files.map((file) => URL.createObjectURL(file));
    const timer = window.setTimeout(() => setPreviewUrls(urls), 0);
    return () => {
      window.clearTimeout(timer);
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [files]);

  useEffect(() => {
    const deviceId = getDeviceId();
    const draftId = `record-${initialEvent?.id || "new"}-${deviceId}`;
    draftIdRef.current = draftId;
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/drafts?id=${encodeURIComponent(draftId)}`,
          { cache: "no-store" },
        );
        const result = (await response.json()) as {
          draft?: {
            draft?: Record<string, unknown>;
            revision?: number;
            updatedAt?: string;
          } | null;
        };
        if (result.draft?.draft) {
          draftRevisionRef.current = Number(result.draft.revision) || 0;
          const eventTime = initialEvent?.updatedAt
            ? new Date(initialEvent.updatedAt).getTime()
            : 0;
          const draftTime = result.draft.updatedAt
            ? new Date(result.draft.updatedAt).getTime()
            : 0;
          if (!initialEvent || draftTime > eventTime) {
            applySnapshot(result.draft.draft);
            setDraftStatus("saved");
          }
          return;
        }
      } catch {
        // Fall through to the local emergency draft.
      }
      const local = window.localStorage.getItem(`richangyu-local-${draftId}`);
      if (local) {
        try {
          applySnapshot(JSON.parse(local) as Record<string, unknown>);
          setDraftStatus("offline");
        } catch {
          // Ignore malformed device-local drafts.
        }
      }
    }, 0);
    return () => {
      window.clearTimeout(timer);
      if (draftTimerRef.current) window.clearTimeout(draftTimerRef.current);
    };
    // The modal is remounted for each selected event.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEvent?.id]);

  async function clearDraft() {
    const draftId = draftIdRef.current;
    if (!draftId) return;
    window.localStorage.removeItem(`richangyu-local-${draftId}`);
    if (window.navigator.onLine) {
      await fetch(`/api/drafts?id=${encodeURIComponent(draftId)}`, {
        method: "DELETE",
      }).catch(() => undefined);
    }
  }

  async function loadHistory() {
    if (!initialEvent) return;
    setHistoryOpen(true);
    try {
      const response = await fetch(
        `/api/events?id=${encodeURIComponent(initialEvent.id)}`,
        { cache: "no-store" },
      );
      const result = (await response.json()) as {
        error?: string;
        versions?: typeof history;
      };
      if (!response.ok) throw new Error(result.error || "读取历史失败。");
      setHistory(result.versions ?? []);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "读取历史失败。");
    }
  }

  return (
    <Modal
      title={initialEvent ? "编辑生活记录" : "记录一条生活事件"}
      description={
        initialEvent
          ? `当前第 ${initialEvent.revision} 版；保存后旧内容仍可恢复。`
          : "发生时间与记录时间分别保存，可以补记过去。"
      }
      onClose={onClose}
    >
      <form
        ref={formRef}
        className="record-form"
        onInput={scheduleDraftSave}
        onSubmit={async (event) => {
          event.preventDefault();
          setSaving(true);
          try {
            await onSubmit(event.currentTarget, files, initialEvent);
            await clearDraft();
          } catch (error) {
            setNotice(error instanceof Error ? error.message : "保存失败。");
          } finally {
            setSaving(false);
          }
        }}
      >
        <div className="record-editor-status">
          <span className={`draft-status ${draftStatus}`}>
            {draftStatus === "saving"
              ? "正在保存草稿…"
              : draftStatus === "saved"
                ? "草稿已同步"
                : draftStatus === "offline"
                  ? "草稿保存在本机"
                  : draftStatus === "conflict"
                    ? "另一台设备有更新"
                    : "修改后自动保存草稿"}
          </span>
          {initialEvent && (
            <button type="button" onClick={() => void loadHistory()}>
              <History size={14} /> 历史版本
            </button>
          )}
        </div>
        <input
          name="title"
          placeholder="标题（可选）"
          className="record-title"
          defaultValue={initialEvent?.title || ""}
        />
        <textarea
          name="content"
          placeholder="写下发生了什么、此刻的感受，或者完成了一件什么事…"
          maxLength={5000}
          defaultValue={initialEvent?.content || ""}
          autoFocus
        />

        {initialEvent && initialEvent.photos.length > 0 && (
          <div className="existing-photo-note">
            <Camera size={15} />
            已保留 {initialEvent.photos.length} 张原照片；可以继续追加新照片。
          </div>
        )}

        {historyOpen && (
          <div className="record-history-panel">
            <header>
              <strong>修改历史</strong>
              <button type="button" onClick={() => setHistoryOpen(false)}>
                <X size={14} />
              </button>
            </header>
            {history.length ? (
              history.map((version) => (
                <button
                  type="button"
                  key={version.id}
                  onClick={() => {
                    applySnapshot(version.snapshot);
                    setHistoryOpen(false);
                    setNotice(`已载入第 ${version.revision} 版，保存后会生成新版本。`);
                  }}
                >
                  <span>第 {version.revision} 版</span>
                  <small>
                    {version.changeNote || "保存记录"} ·{" "}
                    {new Date(version.createdAt).toLocaleString("zh-CN")}
                  </small>
                </button>
              ))
            ) : (
              <p>这条记录还没有可恢复的旧版本。</p>
            )}
          </div>
        )}

        {previewUrls.length > 0 && (
          <div className="upload-preview-list">
            {previewUrls.map((url, index) => (
              <figure key={url}>
                <img src={url} alt={`待上传照片 ${index + 1}`} />
                <button
                  type="button"
                  onClick={() =>
                    setFiles((current) =>
                      current.filter((_, itemIndex) => itemIndex !== index),
                    )
                  }
                  aria-label="移除照片"
                >
                  <X size={13} />
                </button>
              </figure>
            ))}
          </div>
        )}

        <div className="record-quick-row">
          <label>
            <span>发生时间</span>
            <input
              type="datetime-local"
              name="happenedAt"
              defaultValue={
                initialEvent
                  ? localDateTime(new Date(initialEvent.happenedAt))
                  : localDateTime()
              }
            />
          </label>
          <label>
            <span>事件类型</span>
            <select name="kind" defaultValue={initialEvent?.kind || "生活"}>
              {eventKinds.map((kind) => <option key={kind}>{kind}</option>)}
            </select>
          </label>
        </div>

        <div className="mood-energy-row">
          <div>
            <span>心情</span>
            <div className="mood-choices">
              {moods.map((item) => (
                <button
                  type="button"
                  key={item.label}
                  className={mood === item.label ? "active" : ""}
                  style={{ "--mood": item.color } as React.CSSProperties}
                  onClick={() => {
                    setMood(item.label);
                    scheduleDraftSave();
                  }}
                  title={item.label}
                >
                  {item.mark}
                </button>
              ))}
            </div>
            <input type="hidden" name="mood" value={mood} />
          </div>
          <div>
            <span>精力</span>
            <div className="energy-choices">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  type="button"
                  key={value}
                  className={value <= energy ? "active" : ""}
                  onClick={() => {
                    setEnergy(value);
                    scheduleDraftSave();
                  }}
                  aria-label={`精力 ${value}`}
                />
              ))}
            </div>
            <input type="hidden" name="energy" value={energy} />
          </div>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(event) =>
            setFiles(Array.from(event.target.files ?? []).slice(0, 8))
          }
        />
        {files.map((file) => (
          <input key={`${file.name}-${file.lastModified}`} type="hidden" />
        ))}

        <button
          className="advanced-toggle"
          type="button"
          onClick={() => setAdvanced(!advanced)}
        >
          <Settings2 size={15} />
          关联人物、地点、项目和标签
          <ChevronDown size={15} className={advanced ? "rotated" : ""} />
        </button>

        {advanced && (
          <div className="advanced-fields">
            <label><span>人物</span><input name="person" defaultValue={initialEvent?.person || ""} placeholder="同行人、联系人" /></label>
            <label><span>地点</span><input name="place" defaultValue={initialEvent?.place || ""} placeholder="学校、城市、景点" /></label>
            <label><span>项目</span><input name="project" defaultValue={initialEvent?.project || ""} placeholder="论文、备考、旅行…" /></label>
            <label><span>标签</span><input name="tags" defaultValue={initialEvent?.tags.join("，") || ""} placeholder="用逗号分隔" /></label>
            <label className="wide"><span>关联对象</span><input name="relation" placeholder="另一条记录、一本书、一门课程或一次旅行" /></label>
            <label className="private-check">
              <input type="checkbox" name="isPrivate" value="true" defaultChecked={initialEvent?.isPrivate || false} />
              <span>存入私密空间，不进入普通搜索和总结</span>
            </label>
          </div>
        )}

        <div className="modal-actions record-actions">
          <div className="record-media-actions">
            <button
              type="button"
              className="upload-action"
              onClick={() => fileRef.current?.click()}
            >
              <Camera size={17} />
              {initialEvent ? "追加照片" : "上传照片"}
              {files.length > 0 && <em>{files.length}</em>}
            </button>
            {initialEvent && (
              <span className="record-revision-label">
                保存将生成新版本
              </span>
            )}
          </div>
          <div>
            <button type="button" className="secondary-button" onClick={onClose}>
              取消
            </button>
            <button className="primary-button" type="submit" disabled={saving}>
              {saving
                ? "正在保存…"
                : initialEvent
                  ? "保存新版本"
                  : "保存生活事件"}
              <Send size={15} />
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

type BatchScheduleRow = {
  id: string;
  title: string;
  date: string;
  start: string;
  end: string;
  category: string;
};

function ScheduleModal({
  initialSchedule,
  initialDate,
  onClose,
  onSubmit,
}: {
  initialSchedule?: ScheduleEvent | null;
  initialDate?: Date | null;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const initialWindow = useMemo(() => {
    if (initialSchedule) {
      return {
        start: new Date(initialSchedule.startAt),
        end: new Date(initialSchedule.endAt),
      };
    }
    const start = initialDate ? new Date(initialDate) : new Date();
    const now = new Date();
    start.setHours(now.getHours(), Math.ceil(now.getMinutes() / 30) * 30, 0, 0);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    return { start, end };
  }, [initialDate, initialSchedule]);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"single" | "batch">("single");
  const [repeatRule, setRepeatRule] = useState(
    initialSchedule?.repeatRule || "不重复",
  );
  const [batchRows, setBatchRows] = useState<BatchScheduleRow[]>(() => {
    const date = dayKey(initialWindow.start);
    return [
      { id: crypto.randomUUID(), title: "", date, start: "09:00", end: "10:00", category: "学习" },
      { id: crypto.randomUUID(), title: "", date, start: "10:30", end: "11:30", category: "学习" },
      { id: crypto.randomUUID(), title: "", date, start: "14:00", end: "15:00", category: "学习" },
    ];
  });

  function updateBatchRow(id: string, patch: Partial<BatchScheduleRow>) {
    setBatchRows((rows) =>
      rows.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }

  async function submitSingle(form: FormData) {
    const startAt = localDateTimeToIso(form.get("startAt"));
    const endAt = localDateTimeToIso(form.get("endAt"));
    if (new Date(endAt) <= new Date(startAt)) {
      throw new Error("结束时间必须晚于开始时间。");
    }
    await onSubmit({
      ...Object.fromEntries(form.entries()),
      id: initialSchedule?.id,
      seriesId: initialSchedule?.seriesId,
      startAt,
      endAt,
      weekdays: form.getAll("weekdays").map(Number),
      timezoneOffset: new Date().getTimezoneOffset(),
    });
  }

  async function submitBatch(form: FormData) {
    const validRows = batchRows.filter((row) => row.title.trim());
    if (!validRows.length) throw new Error("请至少填写一项安排的标题。");
    const items = validRows.map((row) => {
      const startAt = localDateTimeToIso(`${row.date}T${row.start}`);
      const endAt = localDateTimeToIso(`${row.date}T${row.end}`);
      if (new Date(endAt) <= new Date(startAt)) {
        throw new Error(`“${row.title}”的结束时间必须晚于开始时间。`);
      }
      return {
        title: row.title.trim(),
        category: row.category,
        startAt,
        endAt,
        repeatRule: "不重复",
        place: String(form.get("batchPlace") ?? ""),
        project: String(form.get("batchProject") ?? ""),
        note: String(form.get("batchNote") ?? ""),
        reminderMinutes: Number(form.get("batchReminderMinutes") ?? 10),
      };
    });
    await onSubmit({
      items,
      timezoneOffset: new Date().getTimezoneOffset(),
    });
  }

  return (
    <Modal
      title={initialSchedule ? "编辑时间表事件" : "新建时间表事件"}
      description={
        initialSchedule
          ? initialSchedule.repeatRule !== "不重复"
            ? "可修改内容、时间和提醒；这是重复日程，保存后会同步整个系列。"
            : "可修改标题、时间、分类、地点、人物、项目、备注和提醒。"
          : "支持单个编辑，也可以一次录入一天或一周的多项安排。"
      }
      onClose={onClose}
    >
      {!initialSchedule && (
        <div className="schedule-entry-mode" role="tablist" aria-label="日程录入方式">
          <button
            type="button"
            className={mode === "single" ? "active" : ""}
            onClick={() => setMode("single")}
          >
            单个安排
          </button>
          <button
            type="button"
            className={mode === "batch" ? "active" : ""}
            onClick={() => setMode("batch")}
          >
            批量安排
          </button>
        </div>
      )}

      {mode === "batch" && !initialSchedule ? (
        <form
          className="schedule-batch-form"
          onSubmit={async (event) => {
            event.preventDefault();
            setSaving(true);
            try {
              await submitBatch(new FormData(event.currentTarget));
            } finally {
              setSaving(false);
            }
          }}
        >
          <div className="batch-schedule-heading">
            <div>
              <strong>一次填写多项安排</strong>
              <span>空白行不会保存，最多一次提交 50 项。</span>
            </div>
            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                setBatchRows((rows) => [
                  ...rows,
                  {
                    id: crypto.randomUUID(),
                    title: "",
                    date: rows.at(-1)?.date || dayKey(initialWindow.start),
                    start: rows.at(-1)?.end || "09:00",
                    end: "10:00",
                    category: rows.at(-1)?.category || "学习",
                  },
                ])
              }
            >
              <Plus size={14} /> 添加一行
            </button>
          </div>
          <div className="batch-schedule-list">
            {batchRows.map((row, index) => (
              <div className="batch-schedule-row" key={row.id}>
                <span className="batch-row-number">{index + 1}</span>
                <label className="batch-title">
                  <span>标题</span>
                  <input
                    value={row.title}
                    onChange={(event) =>
                      updateBatchRow(row.id, { title: event.target.value })
                    }
                    placeholder="例如：论文写作"
                    autoFocus={index === 0}
                  />
                </label>
                <label>
                  <span>日期</span>
                  <input
                    type="date"
                    value={row.date}
                    onChange={(event) =>
                      updateBatchRow(row.id, { date: event.target.value })
                    }
                    required
                  />
                </label>
                <label>
                  <span>开始</span>
                  <input
                    type="time"
                    value={row.start}
                    onChange={(event) =>
                      updateBatchRow(row.id, { start: event.target.value })
                    }
                    required
                  />
                </label>
                <label>
                  <span>结束</span>
                  <input
                    type="time"
                    value={row.end}
                    onChange={(event) =>
                      updateBatchRow(row.id, { end: event.target.value })
                    }
                    required
                  />
                </label>
                <label>
                  <span>分类</span>
                  <select
                    value={row.category}
                    onChange={(event) =>
                      updateBatchRow(row.id, { category: event.target.value })
                    }
                  >
                    {scheduleCategories.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="batch-remove-button"
                  aria-label={`删除第 ${index + 1} 行`}
                  onClick={() =>
                    setBatchRows((rows) =>
                      rows.length === 1
                        ? [{ ...rows[0], title: "" }]
                        : rows.filter((item) => item.id !== row.id),
                    )
                  }
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
          <div className="schedule-batch-shared">
            <label><span>统一地点</span><input name="batchPlace" placeholder="可留空" /></label>
            <label><span>关联项目</span><input name="batchProject" placeholder="例如：论文、教资" /></label>
            <label>
              <span>统一提醒</span>
              <select name="batchReminderMinutes" defaultValue="10">
                <option value="0">开始时</option>
                <option value="10">提前10分钟</option>
                <option value="30">提前30分钟</option>
                <option value="60">提前1小时</option>
              </select>
            </label>
            <label className="wide"><span>统一备注</span><textarea name="batchNote" placeholder="这批安排共用的目标或说明…" /></label>
          </div>
          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={onClose}>取消</button>
            <button className="primary-button" disabled={saving}>
              {saving ? "正在批量保存…" : `批量加入（${batchRows.filter((row) => row.title.trim()).length}）`}
            </button>
          </div>
        </form>
      ) : (
        <form
          className="schedule-form"
          onSubmit={async (event) => {
            event.preventDefault();
            setSaving(true);
            try {
              await submitSingle(new FormData(event.currentTarget));
            } finally {
              setSaving(false);
            }
          }}
        >
          <label className="wide">
            <span>标题</span>
            <input
              name="title"
              defaultValue={initialSchedule?.title || ""}
              placeholder="例如：论文实验、初一3班信息技术课"
              required
              autoFocus
            />
          </label>
          <label><span>开始时间</span><input type="datetime-local" name="startAt" defaultValue={localDateTime(initialWindow.start)} required /></label>
          <label><span>结束时间</span><input type="datetime-local" name="endAt" defaultValue={localDateTime(initialWindow.end)} required /></label>
          <label><span>分类</span><select name="category" defaultValue={initialSchedule?.category || "学习"}>{scheduleCategories.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><span>重复规则</span><select name="repeatRule" value={repeatRule} onChange={(event) => setRepeatRule(event.target.value)}>{repeatRules.map((item) => <option key={item}>{item}</option>)}</select></label>
          {repeatRule === "每周" && (
            <fieldset className="weekday-picker wide">
              <legend>每周重复日</legend>
              {[
                [1, "一"],
                [2, "二"],
                [3, "三"],
                [4, "四"],
                [5, "五"],
                [6, "六"],
                [0, "日"],
              ].map(([value, label]) => (
                <label key={value}>
                  <input
                    type="checkbox"
                    name="weekdays"
                    value={value}
                    defaultChecked={
                      initialSchedule?.weekdays?.length
                        ? initialSchedule.weekdays.includes(Number(value))
                        : value === initialWindow.start.getDay()
                    }
                  />
                  <span>周{label}</span>
                </label>
              ))}
            </fieldset>
          )}
          <label><span>重复结束日期</span><input type="date" name="repeatUntil" defaultValue={initialSchedule?.repeatUntil?.slice(0, 10) || ""} /></label>
          <label><span>提前提醒</span><select name="reminderMinutes" defaultValue={String(initialSchedule?.reminderMinutes ?? 10)}><option value="0">开始时</option><option value="5">提前5分钟</option><option value="10">提前10分钟</option><option value="30">提前30分钟</option><option value="60">提前1小时</option><option value="1440">提前1天</option></select></label>
          <label><span>自定义间隔</span><input type="number" name="customInterval" min="1" max="365" defaultValue={String(initialSchedule?.customInterval ?? 1)} /></label>
          <label><span>间隔单位</span><select name="customUnit" defaultValue={initialSchedule?.customUnit || "week"}><option value="day">天</option><option value="week">周</option><option value="month">月</option></select></label>
          <label><span>地点</span><input name="place" defaultValue={initialSchedule?.place || ""} placeholder="教室、图书馆、线上" /></label>
          <label><span>相关人物</span><input name="person" defaultValue={initialSchedule?.person || ""} placeholder="老师、同学、客户…" /></label>
          <label className="wide"><span>关联项目</span><input name="project" defaultValue={initialSchedule?.project || ""} placeholder="教资、论文、课程…" /></label>
          <label className="wide"><span>备注</span><textarea name="note" defaultValue={initialSchedule?.note || ""} placeholder="教学内容、任务目标、提醒事项…" /></label>
          <div className="modal-actions wide">
            <button type="button" className="secondary-button" onClick={onClose}>取消</button>
            <button className="primary-button" disabled={saving}>
              {saving ? "正在保存…" : initialSchedule ? "保存修改" : "加入时间表"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function RowModal({
  collection,
  collections,
  rows,
  initialRow,
  onClose,
  onSubmit,
}: {
  collection: Collection;
  collections: Collection[];
  rows: CollectionRow[];
  initialRow?: CollectionRow | null;
  onClose: () => void;
  onSubmit: (values: Record<string, string | number | boolean>) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  return (
    <Modal
      title={`${initialRow ? "编辑" : "新增"}${collection.name.replace("表", "")}记录`}
      description={
        initialRow
          ? "修改会同步到手机和电脑上的同一张表。"
          : "字段来自当前表格，可继续在表格设置中调整。"
      }
      onClose={onClose}
    >
      <form
        className="row-form"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const values: Record<string, string | number | boolean> = {};
          for (const field of collection.fields) {
            if (field.type === "checkbox") {
              values[field.id] = form.get(field.id) === "on";
            } else if (field.type === "multiSelect") {
              values[field.id] = form
                .getAll(field.id)
                .map(String)
                .filter(Boolean)
                .join("、");
            } else if (field.type === "relation" && field.relationMultiple) {
              values[field.id] = form
                .getAll(field.id)
                .map(String)
                .filter(Boolean)
                .join("、");
            } else if (field.type === "dateRange") {
              const start = String(form.get(`${field.id}__start`) ?? "");
              const end = String(form.get(`${field.id}__end`) ?? "");
              values[field.id] = [start, end].filter(Boolean).join(" 至 ");
            } else if (field.type === "createdTime") {
              values[field.id] = String(
                initialRow?.values[field.id] || new Date().toISOString(),
              );
            } else if (field.type === "modifiedTime") {
              values[field.id] = new Date().toISOString();
            } else if (field.type === "formula" || field.type === "rollup") {
              values[field.id] = String(initialRow?.values[field.id] ?? "");
            } else if (
              field.type === "number" ||
              field.type === "rating" ||
              field.type === "progress"
            ) {
              values[field.id] = Number(form.get(field.id) ?? 0);
            } else {
              values[field.id] = String(form.get(field.id) ?? "");
            }
          }
          setSaving(true);
          try {
            await onSubmit(values);
          } finally {
            setSaving(false);
          }
        }}
      >
        {collection.fields.map((field) => (
          <label key={field.id}>
            <span>{field.name}</span>
            {field.type === "select" ? (
              <select
                name={field.id}
                defaultValue={String(initialRow?.values[field.id] ?? "")}
              >
                {(field.options ?? []).map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            ) : field.type === "multiSelect" ? (
              <select
                name={field.id}
                multiple
                defaultValue={String(initialRow?.values[field.id] ?? "")
                  .split("、")
                  .filter(Boolean)}
              >
                {(field.options ?? []).map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            ) : field.type === "checkbox" ? (
              <input
                name={field.id}
                type="checkbox"
                className="row-checkbox"
                defaultChecked={Boolean(initialRow?.values[field.id])}
              />
            ) : field.type === "date" ? (
              <input
                name={field.id}
                type="date"
                defaultValue={String(initialRow?.values[field.id] ?? "")}
              />
            ) : field.type === "dateRange" ? (
              <span className="date-range-inputs">
                <input
                  name={`${field.id}__start`}
                  type="date"
                  defaultValue={String(initialRow?.values[field.id] ?? "").split(
                    " 至 ",
                  )[0]}
                />
                <em>至</em>
                <input
                  name={`${field.id}__end`}
                  type="date"
                  defaultValue={String(initialRow?.values[field.id] ?? "").split(
                    " 至 ",
                  )[1]}
                />
              </span>
            ) : field.type === "number" ? (
              <input
                name={field.id}
                type="number"
                defaultValue={String(initialRow?.values[field.id] ?? "")}
              />
            ) : field.type === "rating" ? (
              <select
                name={field.id}
                defaultValue={String(initialRow?.values[field.id] ?? 1)}
              >
                {[1, 2, 3, 4, 5].map((value) => (
                  <option key={value} value={value}>{"★".repeat(value)}</option>
                ))}
              </select>
            ) : field.type === "progress" ? (
              <input
                name={field.id}
                type="number"
                min="0"
                max="100"
                defaultValue={String(initialRow?.values[field.id] ?? 0)}
              />
            ) : field.type === "attachment" ? (
              <input
                name={field.id}
                type="url"
                placeholder="粘贴文件或网页链接"
                defaultValue={String(initialRow?.values[field.id] ?? "")}
              />
            ) : field.type === "relation" ? (
              <select
                name={field.id}
                multiple={Boolean(field.relationMultiple)}
                defaultValue={
                  field.relationMultiple
                    ? String(initialRow?.values[field.id] ?? "")
                        .split("、")
                        .filter(Boolean)
                    : String(initialRow?.values[field.id] ?? "")
                }
              >
                {!field.relationMultiple && <option value="">暂不关联</option>}
                {rows
                  .filter(
                    (row) => row.collectionId === field.relationCollectionId,
                  )
                  .map((row) => {
                    const targetCollection = collections.find(
                      (item) => item.id === field.relationCollectionId,
                    );
                    return (
                      <option key={row.id} value={row.id}>
                        {targetCollection
                          ? String(firstValue(targetCollection, row))
                          : row.id}
                      </option>
                    );
                  })}
              </select>
            ) : field.type === "createdTime" ||
              field.type === "modifiedTime" ? (
              <input
                readOnly
                value={
                  field.type === "createdTime"
                    ? String(
                        initialRow?.values[field.id] ||
                          initialRow?.createdAt ||
                          "保存后自动生成",
                      )
                    : String(initialRow?.updatedAt || "保存时自动更新")
                }
              />
            ) : field.type === "formula" ? (
              <input
                readOnly
                value={field.formula || "0"}
                title="公式会根据同一行的其他字段自动计算"
              />
            ) : field.type === "rollup" ? (
              <input
                readOnly
                value={
                  initialRow
                    ? String(
                        resolveFieldValue(
                          field,
                          initialRow,
                          collection,
                          collections,
                          rows,
                        ),
                      )
                    : "选择关联数据后自动汇总"
                }
                title="汇总字段会根据关联数据自动计算"
              />
            ) : (
              <input
                name={field.id}
                placeholder={`填写${field.name}`}
                defaultValue={String(initialRow?.values[field.id] ?? "")}
              />
            )}
          </label>
        ))}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>取消</button>
          <button className="primary-button" disabled={saving}>
            {saving ? "正在保存…" : initialRow ? "保存修改" : "新增到表格"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
