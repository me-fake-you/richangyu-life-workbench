"use client";

import {
  AlertTriangle,
  Banknote,
  BellRing,
  BookOpenCheck,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Check,
  ChevronRight,
  CircleCheck,
  ClipboardCheck,
  Clock3,
  ExternalLink,
  FileText,
  GraduationCap,
  LoaderCircle,
  MapPin,
  MonitorCheck,
  Paperclip,
  Plus,
  Radar,
  Search,
  ShieldCheck,
  Target,
  TimerReset,
  Trash2,
  Upload,
  UserRoundCheck,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  emptyIntelligenceData,
  intelligenceAction,
  type IntelligenceData,
} from "./intelligence-types";

type JobTab = "radar" | "applications" | "calendar" | "materials" | "prepare";

const openingStatuses = [
  "招聘预告",
  "暂未开放",
  "已开放",
  "即将截止",
  "已截止",
  "延期",
  "补录开放",
  "岗位取消",
  "信息待确认",
];

const applicationStatuses = [
  "待了解",
  "已收藏",
  "准备材料",
  "待投递",
  "已投递",
  "简历筛选",
  "在线测评",
  "笔试",
  "一面",
  "二面",
  "终面",
  "体检",
  "背调",
  "Offer",
  "已拒绝",
  "主动放弃",
];

const preparationGroups = [
  ["笔试基础", ["行测", "英语", "综合知识", "金融基础", "经济基础", "银行常识", "计算机知识", "时政热点"]],
  ["模拟测评", ["性格测评", "模拟考试", "错题复盘", "时间分配训练"]],
  ["面试准备", ["自我介绍", "银行认知", "岗位认知", "项目介绍", "无领导小组", "半结构化面试", "行为问题", "技术面试", "面试复盘"]],
];

function localDateTime(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function dateLabel(value: string | null, withTime = false) {
  if (!value) return "待确认";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "待确认";
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

function daysUntil(value: string | null, now: number) {
  if (!value) return null;
  return Math.ceil((new Date(value).getTime() - now) / 86400000);
}

export function JobCenter({
  onNotice,
  onWorkspaceReload,
}: {
  onNotice: (notice: string) => void;
  onWorkspaceReload: () => Promise<void>;
}) {
  const [data, setData] = useState<IntelligenceData>(emptyIntelligenceData);
  const [tab, setTab] = useState<JobTab>("radar");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("全部");
  const [selectedApplication, setSelectedApplication] = useState("");
  const [referenceNow] = useState(() => Date.now());

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/intelligence", { cache: "no-store" });
      const payload = (await response.json()) as IntelligenceData & {
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "求职中心读取失败。");
      setData(payload);
      if (!selectedApplication && payload.applications[0]) {
        setSelectedApplication(payload.applications[0].id);
      }
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "求职中心读取失败。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run(
    action: string,
    payload: Record<string, unknown>,
    success: string,
    workspaceChanged = false,
  ) {
    setBusy(action);
    try {
      await intelligenceAction(action, payload);
      await load();
      if (workspaceChanged) await onWorkspaceReload();
      onNotice(success);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "操作失败。");
    } finally {
      setBusy("");
    }
  }

  async function uploadMaterial(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy("document.upload");
    try {
      const response = await fetch("/api/intelligence/documents", {
        method: "POST",
        body: form,
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "材料上传失败。");
      await load();
      formElement.reset();
      onNotice("求职材料已经安全保存。");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "材料上传失败。");
    } finally {
      setBusy("");
    }
  }

  const filteredPostings = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return data.postings.filter((item) => {
      if (statusFilter !== "全部" && item.openingStatus !== statusFilter) {
        return false;
      }
      if (!needle) return true;
      return [
        item.organizationName,
        item.title,
        item.region,
        item.majors,
        item.recruitmentBatch,
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [data.postings, query, statusFilter]);

  const urgentPostings = data.postings.filter((item) => {
    const days = daysUntil(item.deadlineAt, referenceNow);
    return days !== null && days >= 0 && days <= 7;
  });
  const upcomingEvents = data.applicationEvents.filter(
    (item) => new Date(item.startAt).getTime() >= referenceNow,
  );

  if (loading) {
    return (
      <section className="standard-page intelligence-loading">
        <LoaderCircle className="spin" size={26} />
        <p>正在整理岗位、投递进度和求职日历…</p>
      </section>
    );
  }

  return (
    <section className="standard-page job-center">
      <div className="page-intro job-page-intro">
        <div>
          <span className="eyebrow">OPPORTUNITY RADAR</span>
          <h1>岗位是否开放，与你投到哪一步，分别记录</h1>
          <p>
            监控官方页面变化，连接投递材料、截止提醒、笔面试日历与求职投入。
          </p>
        </div>
        <div className="job-urgent-summary">
          <span><BellRing size={21} /></span>
          <div>
            <small>未来 7 天</small>
            <strong>{urgentPostings.length}</strong>
            <p>个岗位即将截止</p>
          </div>
          <button onClick={() => setStatusFilter("即将截止")}>立即查看</button>
        </div>
      </div>

      <div className="job-metrics">
        <article>
          <span><Radar size={18} /></span>
          <small>开放岗位</small>
          <strong>{data.summary.openJobs}</strong>
          <p>来源确认后才标记开放</p>
        </article>
        <article>
          <span><ClipboardCheck size={18} /></span>
          <small>推进中投递</small>
          <strong>{data.summary.activeApplications}</strong>
          <p>岗位关闭不影响个人投递状态</p>
        </article>
        <article>
          <span><CalendarDays size={18} /></span>
          <small>近期事项</small>
          <strong>{data.summary.upcomingEvents}</strong>
          <p>测评、笔试、面试与体检</p>
        </article>
        <article>
          <span><FileText size={18} /></span>
          <small>材料版本</small>
          <strong>{data.documents.length}</strong>
          <p>简历、证件与证明集中管理</p>
        </article>
      </div>

      <nav className="intelligence-tabs" aria-label="求职中心页面">
        {[
          ["radar", "招聘雷达", Radar],
          ["applications", "投递管理", BriefcaseBusiness],
          ["calendar", "求职日历", CalendarDays],
          ["materials", "材料中心", FileText],
          ["prepare", "求职准备", GraduationCap],
        ].map(([id, label, Icon]) => (
          <button
            key={String(id)}
            className={tab === id ? "active" : ""}
            onClick={() => setTab(id as JobTab)}
          >
            <Icon size={15} /> {String(label)}
          </button>
        ))}
      </nav>

      {tab === "radar" && (
        <>
          <section className="job-radar-toolbar">
            <label>
              <Search size={15} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索银行、岗位、地区或专业"
              />
            </label>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option>全部</option>
              {openingStatuses.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
            <span>监控频率应按来源能力设置，招聘季建议每 1–4 小时检查。</span>
          </section>

          <div className="job-radar-layout">
            <section className="job-posting-list">
              {filteredPostings.length ? (
                filteredPostings.map((posting) => {
                  const remaining = daysUntil(posting.deadlineAt, referenceNow);
                  return (
                    <article className="job-posting-card" key={posting.id}>
                      <header>
                        <div>
                          <span className={`opening-status status-${posting.openingStatus}`}>
                            {posting.openingStatus}
                          </span>
                          <span>{posting.recruitmentBatch}</span>
                          <span>{posting.matchLevel}匹配</span>
                        </div>
                        {remaining !== null && remaining >= 0 && (
                          <em className={remaining <= 3 ? "urgent" : ""}>
                            {remaining === 0 ? "今天截止" : `${remaining} 天后截止`}
                          </em>
                        )}
                      </header>
                      <div className="job-title-row">
                        <span><Building2 size={19} /></span>
                        <div>
                          <small>
                            {posting.organizationName} · {posting.organizationLevel}
                          </small>
                          <h2>{posting.title}</h2>
                        </div>
                      </div>
                      <div className="job-facts">
                        <span><MapPin size={13} /> {posting.region}</span>
                        <span><GraduationCap size={13} /> {posting.education}</span>
                        <span><Clock3 size={13} /> 截止 {dateLabel(posting.deadlineAt)}</span>
                      </div>
                      <p className="job-majors">
                        专业要求：{posting.majors || "以官方页面为准"}
                      </p>
                      <div className="job-source-state">
                        <span className={posting.sourceConfirmed ? "confirmed" : ""}>
                          <ShieldCheck size={14} />
                          {posting.sourceConfirmed
                            ? "官方页面已确认"
                            : "来源信息待确认"}
                        </span>
                        <span>
                          最后检查：{dateLabel(posting.lastCheckedAt, true)}
                        </span>
                        <p>
                          本次变化：
                          {posting.lastChange || "尚未建立页面快照"}
                        </p>
                      </div>
                      <div className="job-dual-status">
                        <div>
                          <small>岗位开放状态</small>
                          <strong>{posting.openingStatus}</strong>
                        </div>
                        <ChevronRight size={15} />
                        <div>
                          <small>我的投递状态</small>
                          <strong>
                            {posting.applicationStatus || "尚未加入投递"}
                          </strong>
                        </div>
                      </div>
                      <footer>
                        <div>
                          {posting.sourceUrl && (
                            <a
                              href={posting.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              官方入口 <ExternalLink size={12} />
                            </a>
                          )}
                          <button
                            onClick={() =>
                              void run(
                                "posting.monitor",
                                { id: posting.id },
                                "官方招聘页面检查完成。",
                              )
                            }
                            disabled={busy === "posting.monitor"}
                          >
                            <MonitorCheck size={13} />
                            立即检查
                          </button>
                          <button
                            className={posting.favorite ? "active" : ""}
                            onClick={() =>
                              void run(
                                "posting.update",
                                { id: posting.id, favorite: !posting.favorite },
                                posting.favorite
                                  ? "已取消收藏。"
                                  : "岗位已经收藏。",
                              )
                            }
                          >
                            <Target size={13} />
                            {posting.favorite ? "已收藏" : "收藏"}
                          </button>
                          <button
                            onClick={() => {
                              if (
                                !window.confirm(
                                  `删除岗位“${posting.title}”及其投递流程和提醒？`,
                                )
                              ) {
                                return;
                              }
                              void run(
                                "posting.delete",
                                { id: posting.id },
                                "岗位及关联提醒已经删除。",
                              );
                            }}
                          >
                            <Trash2 size={13} />
                            删除
                          </button>
                        </div>
                        {!posting.applicationId ? (
                          <button
                            className="primary-button"
                            onClick={() =>
                              void run(
                                "application.create",
                                {
                                  postingId: posting.id,
                                  status: "准备材料",
                                },
                                "岗位已经加入投递计划。",
                              )
                            }
                          >
                            <Plus size={13} /> 加入投递计划
                          </button>
                        ) : (
                          <button onClick={() => setTab("applications")}>
                            查看投递 <ChevronRight size={13} />
                          </button>
                        )}
                      </footer>
                    </article>
                  );
                })
              ) : (
                <div className="intelligence-empty">
                  <Radar size={25} />
                  <h3>还没有符合条件的岗位</h3>
                  <p>添加目标银行和官方招聘网址，之后每次检查都会保留页面快照。</p>
                </div>
              )}
            </section>

            <aside className="job-add-panel">
              <span className="eyebrow">ADD OPPORTUNITY</span>
              <h2>添加目标岗位</h2>
              <p>岗位开放状态与个人投递状态不会混在同一个字段中。</p>
              <form
                onSubmit={async (event) => {
                  event.preventDefault();
                  const form = event.currentTarget;
                  await run(
                    "posting.create",
                    Object.fromEntries(new FormData(form).entries()),
                    "岗位已经加入机会雷达。",
                  );
                  form.reset();
                }}
              >
                <label>
                  <span>单位</span>
                  <input name="organizationName" placeholder="某银行总行" required />
                </label>
                <label>
                  <span>单位类型</span>
                  <select name="organizationKind">
                    <option>银行</option>
                    <option>银行科技子公司</option>
                    <option>事业单位</option>
                    <option>学校</option>
                    <option>企业</option>
                    <option>保险证券</option>
                  </select>
                </label>
                <label className="wide">
                  <span>岗位</span>
                  <input name="title" placeholder="金融科技岗" required />
                </label>
                <label>
                  <span>招聘批次</span>
                  <select name="recruitmentBatch">
                    <option>秋招</option>
                    <option>春招</option>
                    <option>补录</option>
                    <option>实习</option>
                    <option>社会招聘</option>
                  </select>
                </label>
                <label>
                  <span>机构层级</span>
                  <select name="organizationLevel">
                    <option>总行</option>
                    <option>分行</option>
                    <option>子公司</option>
                    <option>总部</option>
                  </select>
                </label>
                <label>
                  <span>地区</span>
                  <input name="region" defaultValue="全国" />
                </label>
                <label>
                  <span>学历要求</span>
                  <input name="education" defaultValue="硕士" />
                </label>
                <label className="wide">
                  <span>专业要求</span>
                  <input name="majors" placeholder="计算机、统计、金融科技" />
                </label>
                <label>
                  <span>开放状态</span>
                  <select name="openingStatus">
                    {openingStatuses.map((status) => (
                      <option key={status}>{status}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>匹配度</span>
                  <select name="matchLevel">
                    <option>高</option>
                    <option>中</option>
                    <option>低</option>
                    <option>待评估</option>
                  </select>
                </label>
                <label>
                  <span>开放时间</span>
                  <input name="openAt" type="datetime-local" />
                </label>
                <label>
                  <span>截止时间</span>
                  <input name="deadlineAt" type="datetime-local" />
                </label>
                <label className="wide">
                  <span>官方招聘页面</span>
                  <input name="sourceUrl" type="url" required />
                </label>
                <button
                  className="primary-button wide"
                  disabled={busy === "posting.create"}
                >
                  {busy === "posting.create" ? (
                    <LoaderCircle className="spin" size={15} />
                  ) : (
                    <Plus size={15} />
                  )}
                  保存并设置截止提醒
                </button>
              </form>
            </aside>
          </div>
        </>
      )}

      {tab === "applications" && (
        <section className="application-center">
          <header className="section-title-row">
            <div>
              <span className="eyebrow">APPLICATION PIPELINE</span>
              <h2>从准备材料到 Offer 的完整投递流程</h2>
            </div>
            <span>{data.applications.length} 项投递</span>
          </header>
          <div className="application-grid">
            {data.applications.map((application) => (
              <article key={application.id}>
                <header>
                  <span>{application.organizationName}</span>
                  <em>{application.openingStatus}</em>
                </header>
                <h3>{application.postingTitle}</h3>
                <label>
                  <span>个人投递状态</span>
                  <select
                    value={application.status}
                    onChange={(event) =>
                      void run(
                        "application.update",
                        { id: application.id, status: event.target.value },
                        `投递状态已更新为“${event.target.value}”。`,
                      )
                    }
                  >
                    {applicationStatuses.map((status) => (
                      <option key={status}>{status}</option>
                    ))}
                  </select>
                </label>
                <div className="application-progress">
                  <div>
                    <span>材料完整度</span>
                    <strong>{application.materialCompleteness}/10</strong>
                  </div>
                  <progress
                    value={application.materialCompleteness}
                    max="10"
                  />
                  <p>
                    {application.missingMaterials
                      ? `缺少：${application.missingMaterials}`
                      : "暂未填写缺失材料"}
                  </p>
                </div>
                <div className="application-next">
                  <small>下一步</small>
                  <strong>{application.nextAction || "等待安排下一步"}</strong>
                  <time>{dateLabel(application.nextActionAt, true)}</time>
                </div>
                <footer>
                  <button
                    onClick={() => {
                      setSelectedApplication(application.id);
                      setTab("calendar");
                    }}
                  >
                    <CalendarDays size={13} /> 添加测评/笔面试
                  </button>
                  <button
                    onClick={() => {
                      setSelectedApplication(application.id);
                      setTab("materials");
                    }}
                  >
                    <FileText size={13} /> 管理材料
                  </button>
                </footer>
              </article>
            ))}
            {!data.applications.length && (
              <div className="intelligence-empty">
                <BriefcaseBusiness size={25} />
                <h3>还没有投递计划</h3>
                <p>在招聘雷达中收藏岗位并加入投递，流程会从这里开始。</p>
              </div>
            )}
          </div>

          <div className="application-update-form">
            <h2>补充投递准备</h2>
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                const form = event.currentTarget;
                const values = Object.fromEntries(new FormData(form).entries());
                await run(
                  "application.update",
                  values,
                  "投递准备信息已经更新。",
                );
              }}
            >
              <label>
                <span>投递项目</span>
                <select name="id" required>
                  {data.applications.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.organizationName} · {item.postingTitle}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>简历版本</span>
                <input name="resumeVersion" placeholder="银行科技岗简历 V3" />
              </label>
              <label>
                <span>材料完整度</span>
                <input
                  name="materialCompleteness"
                  type="number"
                  min="0"
                  max="10"
                  defaultValue="8"
                />
              </label>
              <label>
                <span>下一步时间</span>
                <input name="nextActionAt" type="datetime-local" />
              </label>
              <label className="wide">
                <span>下一步行动</span>
                <input name="nextAction" placeholder="补充项目经历并完成网申" />
              </label>
              <label className="wide">
                <span>缺失材料</span>
                <input
                  name="missingMaterials"
                  placeholder="英语六级证明、成绩单盖章版"
                />
              </label>
              <button className="primary-button">保存准备进度</button>
            </form>
          </div>
        </section>
      )}

      {tab === "calendar" && (
        <div className="job-calendar-layout">
          <section className="job-calendar-list">
            <header className="section-title-row">
              <div>
                <span className="eyebrow">JOB CALENDAR</span>
                <h2>投递、测评、笔试和面试进入同一时间表</h2>
              </div>
            </header>
            <div className="calendar-timeline">
              {upcomingEvents.length ? (
                upcomingEvents.map((event) => (
                  <article key={event.id}>
                    <time>
                      <strong>
                        {new Date(event.startAt).getDate()}
                      </strong>
                      <span>
                        {new Date(event.startAt).toLocaleDateString("zh-CN", {
                          month: "short",
                        })}
                      </span>
                    </time>
                    <span className="calendar-line" />
                    <div>
                      <header>
                        <span>{event.kind}</span>
                        <em>{event.status}</em>
                      </header>
                      <h3>{event.title}</h3>
                      <p>
                        {event.organizationName} · {event.postingTitle}
                      </p>
                      <small>
                        {dateLabel(event.startAt, true)}
                        {event.place ? ` · ${event.place}` : ""}
                        {` · 提前 ${event.reminderDays} 天提醒`}
                      </small>
                      {event.link && (
                        <a href={event.link} target="_blank" rel="noreferrer">
                          打开会议或测评链接 <ExternalLink size={12} />
                        </a>
                      )}
                    </div>
                  </article>
                ))
              ) : (
                <div className="intelligence-empty">
                  <CalendarDays size={25} />
                  <h3>还没有求职日程</h3>
                  <p>创建后会同步进入时间表中心，并保留对应投递项目。</p>
                </div>
              )}
            </div>
          </section>
          <aside className="job-event-form">
            <h2>添加求职事项</h2>
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                const form = event.currentTarget;
                await run(
                  "application.event.create",
                  Object.fromEntries(new FormData(form).entries()),
                  "求职事项已经同步到时间表。",
                  true,
                );
                form.reset();
              }}
            >
              <label>
                <span>关联投递</span>
                <select
                  name="applicationId"
                  value={selectedApplication}
                  onChange={(event) =>
                    setSelectedApplication(event.target.value)
                  }
                  required
                >
                  <option value="">请选择</option>
                  {data.applications.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.organizationName} · {item.postingTitle}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>事项类型</span>
                <select name="kind">
                  <option>网申截止</option>
                  <option>在线测评</option>
                  <option>笔试</option>
                  <option>一面</option>
                  <option>二面</option>
                  <option>终面</option>
                  <option>体检</option>
                  <option>材料提交</option>
                  <option>备考</option>
                </select>
              </label>
              <label className="wide">
                <span>标题</span>
                <input name="title" placeholder="某银行线上笔试" />
              </label>
              <label>
                <span>开始时间</span>
                <input
                  name="startAt"
                  type="datetime-local"
                  defaultValue={localDateTime(
                    new Date(referenceNow + 86400000),
                  )}
                  required
                />
              </label>
              <label>
                <span>提前提醒</span>
                <select name="reminderDays" defaultValue="1">
                  <option value="7">7 天</option>
                  <option value="3">3 天</option>
                  <option value="2">2 天</option>
                  <option value="1">1 天</option>
                  <option value="0">当天</option>
                </select>
              </label>
              <label>
                <span>地点/形式</span>
                <input name="place" placeholder="线上 / 北京" />
              </label>
              <label>
                <span>会议或测评链接</span>
                <input name="link" type="url" />
              </label>
              <label className="wide">
                <span>备注与携带材料</span>
                <textarea name="note" rows={3} />
              </label>
              <button
                className="primary-button wide"
                disabled={
                  busy === "application.event.create" || !data.applications.length
                }
              >
                <Plus size={14} /> 加入求职日历
              </button>
            </form>
            <div className="email-recognition-note">
              <BellRing size={17} />
              <div>
                <strong>招聘邮件识别原则</strong>
                <p>
                  邮件接入后只生成待确认草稿；时间、形式和链接必须由你确认后才能写入求职日历。
                </p>
              </div>
            </div>
          </aside>
        </div>
      )}

      {tab === "materials" && (
        <div className="materials-layout">
          <section className="materials-list">
            <header className="section-title-row">
              <div>
                <span className="eyebrow">APPLICATION MATERIALS</span>
                <h2>每个岗位知道自己使用了哪个版本</h2>
              </div>
            </header>
            <div className="material-grid">
              {data.documents.map((document) => {
                const application = data.applications.find(
                  (item) => item.id === document.applicationId,
                );
                return (
                  <article key={document.id}>
                    <span><FileText size={20} /></span>
                    <div>
                      <small>{document.kind} · {document.version}</small>
                      <h3>{document.name}</h3>
                      <p>
                        {application
                          ? `${application.organizationName} · ${application.postingTitle}`
                          : "通用材料"}
                      </p>
                      <em>{document.status}</em>
                    </div>
                    {document.url && (
                      <a href={document.url} target="_blank" rel="noreferrer">
                        查看 <ExternalLink size={12} />
                      </a>
                    )}
                  </article>
                );
              })}
              {!data.documents.length && (
                <div className="intelligence-empty">
                  <FileText size={25} />
                  <h3>还没有求职材料</h3>
                  <p>上传简历、证件照、成绩单和证明，并标明用途与版本。</p>
                </div>
              )}
            </div>
          </section>
          <aside className="material-upload-panel">
            <h2>上传材料</h2>
            <p>支持 PDF、Word 和图片，单个文件不超过 12MB。</p>
            <form onSubmit={uploadMaterial}>
              <label>
                <span>关联投递</span>
                <select name="applicationId" defaultValue="">
                  <option value="">通用材料</option>
                  {data.applications.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.organizationName} · {item.postingTitle}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>材料类型</span>
                <select name="kind">
                  <option>中文简历</option>
                  <option>英文简历</option>
                  <option>银行科技岗简历</option>
                  <option>管培生简历</option>
                  <option>证件照</option>
                  <option>成绩单</option>
                  <option>学历证明</option>
                  <option>获奖证书</option>
                  <option>实习证明</option>
                  <option>论文与项目说明</option>
                  <option>常见网申答案</option>
                  <option>自我介绍</option>
                </select>
              </label>
              <label>
                <span>显示名称</span>
                <input name="name" placeholder="银行科技岗简历" />
              </label>
              <label>
                <span>版本</span>
                <input name="version" defaultValue="V1" />
              </label>
              <label className="wide material-file-picker">
                <span><Paperclip size={14} /> 选择文件</span>
                <input
                  name="file"
                  type="file"
                  accept=".pdf,.doc,.docx,image/*"
                  required
                />
              </label>
              <label className="wide">
                <span>用途与限制</span>
                <textarea
                  name="note"
                  rows={3}
                  placeholder="适合科技岗；不要用于管培生岗位"
                />
              </label>
              <button
                className="primary-button wide"
                disabled={busy === "document.upload"}
              >
                {busy === "document.upload" ? (
                  <LoaderCircle className="spin" size={15} />
                ) : (
                  <Upload size={15} />
                )}
                安全保存材料
              </button>
            </form>
          </aside>
        </div>
      )}

      {tab === "prepare" && (
        <section className="job-preparation">
          <header className="section-title-row">
            <div>
              <span className="eyebrow">JOB PREPARATION</span>
              <h2>从岗位倒推笔试、面试和材料准备</h2>
            </div>
          </header>
          <div className="preparation-grid">
            {preparationGroups.map(([group, items]) => (
              <article key={String(group)}>
                <header>
                  {group === "笔试基础" ? (
                    <BookOpenCheck size={20} />
                  ) : group === "模拟测评" ? (
                    <TimerReset size={20} />
                  ) : (
                    <UserRoundCheck size={20} />
                  )}
                  <h3>{group}</h3>
                </header>
                <div>
                  {(items as string[]).map((item) => (
                    <span key={item}>
                      <CircleCheck size={13} /> {item}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
          <div className="preparation-actions-grid">
            <section>
              <h2>安排一次备考</h2>
              <form
                onSubmit={async (event) => {
                  event.preventDefault();
                  const form = event.currentTarget;
                  await run(
                    "application.event.create",
                    Object.fromEntries(new FormData(form).entries()),
                    "备考安排已经加入时间表。",
                    true,
                  );
                  form.reset();
                }}
              >
                <label>
                  <span>关联投递</span>
                  <select name="applicationId" required>
                    {data.applications.map((item) => (
                      <option value={item.id} key={item.id}>
                        {item.organizationName} · {item.postingTitle}
                      </option>
                    ))}
                  </select>
                </label>
                <input name="kind" type="hidden" value="备考" />
                <label>
                  <span>备考内容</span>
                  <input name="title" placeholder="银行行测模拟考试" required />
                </label>
                <label>
                  <span>开始时间</span>
                  <input
                    name="startAt"
                    type="datetime-local"
                    defaultValue={localDateTime(
                      new Date(referenceNow + 86400000),
                    )}
                    required
                  />
                </label>
                <label>
                  <span>提醒</span>
                  <select name="reminderDays">
                    <option value="1">提前 1 天</option>
                    <option value="0">当天</option>
                  </select>
                </label>
                <button
                  className="primary-button"
                  disabled={!data.applications.length}
                >
                  加入时间表
                </button>
              </form>
            </section>
            <section>
              <h2>记录求职投入</h2>
              <p>报名费、证件照、交通、住宿和课程费会进入财务中心。</p>
              <form
                onSubmit={async (event) => {
                  event.preventDefault();
                  const form = event.currentTarget;
                  await run(
                    "job.expense",
                    Object.fromEntries(new FormData(form).entries()),
                    "求职投入已经记入财务账本。",
                  );
                  form.reset();
                }}
              >
                <label>
                  <span>金额</span>
                  <input
                    name="amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                  />
                </label>
                <label>
                  <span>项目</span>
                  <input name="project" placeholder="某银行网申" />
                </label>
                <label>
                  <span>发生时间</span>
                  <input
                    name="occurredAt"
                    type="datetime-local"
                    defaultValue={localDateTime()}
                  />
                </label>
                <label>
                  <span>用途</span>
                  <select name="note">
                    <option>报名费</option>
                    <option>证件照费用</option>
                    <option>考试交通费</option>
                    <option>面试住宿费</option>
                    <option>培训课程费</option>
                    <option>其他求职投入</option>
                  </select>
                </label>
                <button className="primary-button">
                  <Banknote size={14} /> 记入财务
                </button>
              </form>
            </section>
          </div>

          {data.changes.some((item) => item.isImportant && !item.acknowledged) && (
            <section className="important-job-changes">
              <header>
                <AlertTriangle size={18} />
                <h2>需要立即确认的页面变化</h2>
              </header>
              {data.changes
                .filter((item) => item.isImportant && !item.acknowledged)
                .map((change) => (
                  <article key={change.id}>
                    <div>
                      <strong>{change.organizationName} · {change.postingTitle}</strong>
                      <p>{change.summary}</p>
                      <small>{dateLabel(change.detectedAt, true)}</small>
                    </div>
                    <button
                      onClick={() =>
                        void run(
                          "change.acknowledge",
                          { id: change.id },
                          "这项变化已经确认。",
                        )
                      }
                    >
                      <Check size={13} /> 已确认
                    </button>
                  </article>
                ))}
            </section>
          )}
        </section>
      )}
    </section>
  );
}
