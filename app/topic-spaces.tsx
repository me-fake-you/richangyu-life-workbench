"use client";

import {
  BookOpenCheck,
  CalendarClock,
  ChevronRight,
  ClipboardCheck,
  FileSpreadsheet,
  Flag,
  FolderKanban,
  GraduationCap,
  LoaderCircle,
  Map,
  Microscope,
  Plus,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

type TopicEvent = {
  id: string;
  title: string;
  content: string;
  project: string;
  tags: string[];
  happenedAt: string;
};

type TopicSchedule = {
  id: string;
  title: string;
  project: string;
  startAt: string;
  status: string;
};

type TopicCollection = {
  id: string;
  name: string;
  description: string;
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

type Milestone = {
  id: string;
  projectId: string | null;
  title: string;
  happenedAt: string;
  completed: boolean;
};

type Field = {
  id: string;
  name: string;
  type: "text" | "number" | "select" | "date" | "checkbox" | "rating" | "progress";
  options?: string[];
};

type SpaceTemplate = {
  id: string;
  title: string;
  kind: string;
  icon: typeof GraduationCap;
  color: string;
  description: string;
  creates: string[];
  tables: Array<{
    suffix: string;
    icon: string;
    description: string;
    fields: Field[];
  }>;
};

const spaceTemplates: SpaceTemplate[] = [
  {
    id: "exam",
    title: "考试备考",
    kind: "学习备考",
    icon: GraduationCap,
    color: "#8a5aa1",
    description: "把倒计时、学习安排、错题和模考复盘放进同一个空间。",
    creates: ["专题目标", "备考任务表", "错题与复习表", "目标日里程碑"],
    tables: [
      {
        suffix: "备考任务",
        icon: "学",
        description: "章节计划、计划时长和实际投入",
        fields: [
          { id: "chapter", name: "章节或知识点", type: "text" },
          { id: "deadline", name: "截止日期", type: "date" },
          { id: "planned", name: "计划分钟", type: "number" },
          { id: "actual", name: "实际分钟", type: "number" },
          { id: "status", name: "状态", type: "select", options: ["未开始", "进行中", "已完成"] },
        ],
      },
      {
        suffix: "错题与复习",
        icon: "题",
        description: "记录错误原因、知识点和复习次数",
        fields: [
          { id: "question", name: "题目", type: "text" },
          { id: "topic", name: "知识点", type: "text" },
          { id: "reason", name: "错误原因", type: "text" },
          { id: "reviews", name: "复习次数", type: "number" },
          { id: "mastered", name: "已掌握", type: "checkbox" },
        ],
      },
    ],
  },
  {
    id: "teaching",
    title: "新学期教学",
    kind: "教师工作",
    icon: BookOpenCheck,
    color: "#477c6a",
    description: "连接课程表、备课资料、课堂反馈与每课反思。",
    creates: ["学期专题", "课程进度表", "教学反思表", "学期结束里程碑"],
    tables: [
      {
        suffix: "课程进度",
        icon: "课",
        description: "班级、周次、教学内容与完成情况",
        fields: [
          { id: "course", name: "课程", type: "text" },
          { id: "class", name: "班级", type: "text" },
          { id: "week", name: "周次", type: "number" },
          { id: "content", name: "教学内容", type: "text" },
          { id: "status", name: "状态", type: "select", options: ["待备课", "待上课", "已完成"] },
        ],
      },
      {
        suffix: "教学反思",
        icon: "思",
        description: "课堂反馈、问题和下次改进",
        fields: [
          { id: "date", name: "日期", type: "date" },
          { id: "class", name: "班级", type: "text" },
          { id: "feedback", name: "课堂反馈", type: "text" },
          { id: "issue", name: "主要问题", type: "text" },
          { id: "improve", name: "下次改进", type: "text" },
        ],
      },
    ],
  },
  {
    id: "travel",
    title: "一次旅行",
    kind: "旅行",
    icon: Map,
    color: "#b06d4f",
    description: "从攻略、行程和预算，一直连接到照片故事与旅行总结。",
    creates: ["旅行专题", "行程清单", "预算与支出表", "返程总结里程碑"],
    tables: [
      {
        suffix: "旅行行程",
        icon: "行",
        description: "时间、地点、安排和预订信息",
        fields: [
          { id: "date", name: "日期", type: "date" },
          { id: "place", name: "地点", type: "text" },
          { id: "plan", name: "安排", type: "text" },
          { id: "booking", name: "预订信息", type: "text" },
          { id: "done", name: "已完成", type: "checkbox" },
        ],
      },
      {
        suffix: "旅行账本",
        icon: "账",
        description: "预算、支出分类和实际花费",
        fields: [
          { id: "date", name: "日期", type: "date" },
          { id: "category", name: "分类", type: "select", options: ["交通", "住宿", "餐饮", "门票", "购物", "其他"] },
          { id: "budget", name: "预算", type: "number" },
          { id: "expense", name: "实际花费", type: "number" },
          { id: "note", name: "备注", type: "text" },
        ],
      },
    ],
  },
  {
    id: "research",
    title: "科研与论文",
    kind: "科研工作",
    icon: Microscope,
    color: "#486c91",
    description: "集中管理实验、论文进度、导师意见、文件和科研周报。",
    creates: ["科研专题", "实验记录表", "论文进度表", "投稿里程碑"],
    tables: [
      {
        suffix: "实验记录",
        icon: "研",
        description: "数据集、参数、结果与实验结论",
        fields: [
          { id: "experiment", name: "实验名称", type: "text" },
          { id: "dataset", name: "数据集", type: "text" },
          { id: "parameters", name: "参数", type: "text" },
          { id: "result", name: "核心结果", type: "number" },
          { id: "status", name: "状态", type: "select", options: ["未开始", "运行中", "待分析", "已完成"] },
        ],
      },
      {
        suffix: "论文进度",
        icon: "论",
        description: "章节、截止时间、完成度和导师意见",
        fields: [
          { id: "chapter", name: "章节", type: "text" },
          { id: "deadline", name: "截止日期", type: "date" },
          { id: "progress", name: "完成度", type: "progress" },
          { id: "comment", name: "导师意见", type: "text" },
          { id: "status", name: "状态", type: "select", options: ["未开始", "撰写中", "待修改", "已完成"] },
        ],
      },
    ],
  },
];

async function post(url: string, action: string, payload: Record<string, unknown>) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, payload }),
  });
  const body = response.status === 204 ? {} : ((await response.json()) as Record<string, unknown>);
  if (!response.ok) throw new Error(String(body.error || "操作失败。"));
  return body;
}

function daysUntil(value: string | null) {
  if (!value) return null;
  return Math.ceil((new Date(value).getTime() - Date.now()) / 86400000);
}

export function TopicSpaces({
  events,
  schedules,
  collections,
  onNotice,
  onWorkspaceReload,
  onView,
}: {
  events: TopicEvent[];
  schedules: TopicSchedule[];
  collections: TopicCollection[];
  onNotice: (notice: string) => void;
  onWorkspaceReload: () => Promise<void>;
  onView: (view: string) => void;
}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [createTemplate, setCreateTemplate] = useState<SpaceTemplate | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const response = await fetch("/api/advanced", { cache: "no-store" });
      const payload = (await response.json()) as {
        projects?: Project[];
        milestones?: Milestone[];
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "读取专题失败。");
      setProjects(payload.projects || []);
      setMilestones(payload.milestones || []);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "读取专题失败。");
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
    // This page loads its topic metadata once when mounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = projects.find((item) => item.id === selectedId) ?? projects[0];
  const topicData = useMemo(() => {
    if (!selected) return null;
    const normalize = selected.title.trim().toLowerCase();
    return {
      events: events.filter(
        (item) =>
          item.project.trim().toLowerCase() === normalize ||
          item.tags.some((tag) => tag.toLowerCase() === normalize),
      ),
      schedules: schedules.filter(
        (item) => item.project.trim().toLowerCase() === normalize,
      ),
      collections: collections.filter(
        (item) =>
          item.name.includes(selected.title) ||
          item.description.includes(selected.title),
      ),
      milestones: milestones.filter((item) => item.projectId === selected.id),
    };
  }, [selected, events, schedules, collections, milestones]);

  async function createSpace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!createTemplate) return;
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") || "").trim();
    const targetAt = String(form.get("targetAt") || "");
    if (!title) return;
    setBusy(true);
    try {
      const project = await post("/api/advanced", "project.create", {
        title,
        kind: createTemplate.kind,
        description: createTemplate.description,
        color: createTemplate.color,
        startAt: new Date().toISOString(),
        targetAt: targetAt || undefined,
      });
      await Promise.all(
        createTemplate.tables.map((table) =>
          post("/api/workspace", "collection.create", {
            name: `${title} · ${table.suffix}`,
            icon: table.icon,
            description: `${title}专题 · ${table.description}`,
            fields: table.fields,
          }),
        ),
      );
      if (targetAt && project.id) {
        await post("/api/advanced", "milestone.create", {
          projectId: project.id,
          title: `${title}目标日`,
          happenedAt: new Date(`${targetAt}T12:00:00`).toISOString(),
          note: "由场景模板自动创建",
        });
      }
      setCreateTemplate(null);
      setSelectedId(String(project.id || ""));
      await Promise.all([load(), onWorkspaceReload()]);
      onNotice(`“${title}”专题和配套表格已经准备好。`);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "创建专题失败。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="standard-page topic-spaces-page">
      <div className="page-intro">
        <div>
          <span className="eyebrow">TOPIC SPACES</span>
          <h1>把一段持续经历，整理成一个完整专题</h1>
          <p>每个专题同时容纳计划、任务、表格、记录、照片、文件和里程碑。</p>
        </div>
        <button
          className="primary-button"
          onClick={() =>
            setCreateTemplate({
              ...spaceTemplates[0],
              title: "空白专题",
              kind: "个人专题",
              description: "从一个目标开始，逐步连接记录、日程与表格。",
              tables: [],
              creates: ["专题目标"],
            })
          }
        >
          <Plus size={17} /> 新建空白专题
        </button>
      </div>

      <div className="space-template-grid">
        {spaceTemplates.map((template) => (
          <button key={template.id} onClick={() => setCreateTemplate(template)}>
            <span style={{ background: `${template.color}18`, color: template.color }}>
              <template.icon size={21} />
            </span>
            <div>
              <strong>{template.title}</strong>
              <p>{template.description}</p>
              <small>{template.creates.join(" · ")}</small>
            </div>
            <ChevronRight size={17} />
          </button>
        ))}
      </div>

      {projects.length > 0 ? (
        <div className="topic-layout">
          <aside className="topic-list">
            <header>
              <FolderKanban size={17} />
              <strong>我的专题</strong>
              <span>{projects.length}</span>
            </header>
            {projects.map((project) => (
              <button
                key={project.id}
                className={selected?.id === project.id ? "active" : ""}
                onClick={() => setSelectedId(project.id)}
              >
                <i style={{ background: project.color }} />
                <span>
                  <strong>{project.title}</strong>
                  <small>{project.kind} · {project.progress}%</small>
                </span>
                <ChevronRight size={14} />
              </button>
            ))}
          </aside>

          {selected && topicData && (
            <article className="topic-detail">
              <header>
                <div>
                  <span className="eyebrow">{selected.kind}</span>
                  <h2>{selected.title}</h2>
                  <p>{selected.description || "把与这段经历有关的内容都连接到这里。"}</p>
                </div>
                <span className="topic-progress-ring" style={{ "--topic-color": selected.color } as React.CSSProperties}>
                  <strong>{selected.progress}%</strong>
                  <small>进度</small>
                </span>
              </header>
              <div className="topic-metrics">
                <span><ArchiveMetric icon={Sparkles} value={topicData.events.length} label="条生活记录" /></span>
                <span><ArchiveMetric icon={CalendarClock} value={topicData.schedules.length} label="项关联日程" /></span>
                <span><ArchiveMetric icon={FileSpreadsheet} value={topicData.collections.length} label="张专题表格" /></span>
                <span>
                  <ArchiveMetric
                    icon={Target}
                    value={daysUntil(selected.targetAt) ?? "—"}
                    label={selected.targetAt ? "天到目标日" : "未设目标日"}
                  />
                </span>
              </div>
              <div className="topic-sections">
                <section>
                  <h3><ClipboardCheck size={16} /> 最近进展</h3>
                  {topicData.events.length ? (
                    topicData.events.slice(0, 4).map((item) => (
                      <button key={item.id} onClick={() => onView("timeline")}>
                        <span>
                          <strong>{item.title || item.content.slice(0, 45)}</strong>
                          <small>{new Date(item.happenedAt).toLocaleDateString("zh-CN")}</small>
                        </span>
                        <ChevronRight size={14} />
                      </button>
                    ))
                  ) : (
                    <p>记录时把“项目”填写为“{selected.title}”，内容会自动汇聚到这里。</p>
                  )}
                </section>
                <section>
                  <h3><Flag size={16} /> 里程碑</h3>
                  {topicData.milestones.length ? (
                    topicData.milestones.map((item) => (
                      <div key={item.id}>
                        <i className={item.completed ? "done" : ""} />
                        <span>
                          <strong>{item.title}</strong>
                          <small>{new Date(item.happenedAt).toLocaleDateString("zh-CN")}</small>
                        </span>
                      </div>
                    ))
                  ) : (
                    <p>在“智能与自动化”中可以继续添加关键节点。</p>
                  )}
                </section>
              </div>
              <footer>
                <button onClick={() => onView("schedule")}><CalendarClock size={15} /> 打开相关时间表</button>
                <button onClick={() => onView("tables")}><FileSpreadsheet size={15} /> 打开专题表格</button>
                <button onClick={() => onView("review")}><Sparkles size={15} /> 生成专题总结</button>
              </footer>
            </article>
          )}
        </div>
      ) : (
        <div className="topic-empty">
          <FolderKanban size={31} />
          <h2>先创建一段正在经历的生活</h2>
          <p>选择上面的场景模板，系统会一次准备好专题、表格和目标日。</p>
        </div>
      )}

      {createTemplate && (
        <div className="topic-modal-layer" role="presentation">
          <button onClick={() => setCreateTemplate(null)} aria-label="关闭" />
          <form onSubmit={createSpace}>
            <header>
              <span style={{ background: `${createTemplate.color}18`, color: createTemplate.color }}>
                <createTemplate.icon size={22} />
              </span>
              <div>
                <small>创建场景专题</small>
                <h2>{createTemplate.title}</h2>
              </div>
              <button type="button" onClick={() => setCreateTemplate(null)} aria-label="关闭"><X size={17} /></button>
            </header>
            <p>{createTemplate.description}</p>
            <label>
              <span>专题名称</span>
              <input name="title" placeholder="例如：2026 教师资格证备考" required autoFocus />
            </label>
            <label>
              <span>目标或结束日期（可选）</span>
              <input name="targetAt" type="date" />
            </label>
            <div className="topic-create-list">
              {createTemplate.creates.map((item) => <span key={item}><Plus size={12} /> {item}</span>)}
            </div>
            <footer>
              <button type="button" onClick={() => setCreateTemplate(null)}>取消</button>
              <button className="primary-button" disabled={busy}>
                {busy ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />}
                确认创建
              </button>
            </footer>
          </form>
        </div>
      )}
    </section>
  );
}

function ArchiveMetric({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof Target;
  value: string | number;
  label: string;
}) {
  return (
    <>
      <Icon size={17} />
      <strong>{value}</strong>
      <small>{label}</small>
    </>
  );
}
