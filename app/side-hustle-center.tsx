"use client";

import {
  Banknote,
  BellRing,
  BriefcaseBusiness,
  CalendarClock,
  Check,
  CircleDollarSign,
  Clock3,
  Eye,
  EyeOff,
  Gauge,
  HandCoins,
  LoaderCircle,
  Pause,
  Pencil,
  Play,
  Plus,
  Receipt,
  Sparkles,
  TimerReset,
  Trash2,
  TrendingUp,
  UserRound,
  WalletCards,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  emptyFinanceData,
  financeAction,
  type FinanceData,
  type Receivable,
  type SideHustleProject,
} from "./financial-types";

type HustleTab =
  | "today"
  | "projects"
  | "clock"
  | "receivables"
  | "clients"
  | "report";

type ScheduleLite = {
  id: string;
  title: string;
  category: string;
  startAt: string;
  endAt: string;
  project: string;
  status: string;
};

function localDateTime(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function dayKey(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function money(value: number, masked: boolean) {
  if (masked) return "¥ ••••";
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value || 0);
}

function duration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest}分钟`;
  return rest ? `${hours}小时${rest}分钟` : `${hours}小时`;
}

function projectStats(project: SideHustleProject, data: FinanceData) {
  const sessions = data.workSessions.filter(
    (item) => item.projectId === project.id && item.status === "已完成",
  );
  const receivables = data.receivables.filter((item) => item.projectId === project.id);
  const minutes = sessions.reduce(
    (sum, item) => sum + item.minutes + item.hiddenMinutes,
    0,
  );
  const expected = receivables.reduce((sum, item) => sum + item.amountDue, 0);
  const received = receivables.reduce((sum, item) => sum + item.amountReceived, 0);
  const cost = sessions.reduce((sum, item) => sum + item.cost, 0);
  const net = received - cost;
  return {
    sessions: sessions.length,
    minutes,
    expected,
    received,
    outstanding: Math.max(0, expected - received),
    cost,
    net,
    effectiveHourly: minutes > 0 ? Math.round((net / minutes) * 6000) / 100 : 0,
    lastAt: sessions[0]?.startedAt || project.startAt,
  };
}

export function SideHustleCenter({
  schedules,
  onNotice,
  onWorkspaceReload,
}: {
  schedules: ScheduleLite[];
  onNotice: (notice: string) => void;
  onWorkspaceReload: () => Promise<void>;
}) {
  const [data, setData] = useState<FinanceData>(emptyFinanceData);
  const [tab, setTab] = useState<HustleTab>("today");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [now, setNow] = useState(0);
  const [showContacts, setShowContacts] = useState(false);
  const [sessionProjectId, setSessionProjectId] = useState("");

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/finance", { cache: "no-store" });
      const payload = (await response.json()) as FinanceData & { error?: string };
      if (!response.ok) throw new Error(payload.error || "读取兼职中心失败。");
      setData(payload);
      setNow(Date.now());
      if (!sessionProjectId && payload.projects[0]) {
        setSessionProjectId(payload.projects[0].id);
      }
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "读取兼职中心失败。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
    // The page loads its linked finance records once when mounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const running = data.workSessions.find((item) =>
    ["进行中", "暂停"].includes(item.status),
  );

  useEffect(() => {
    if (!running || running.status === "暂停") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  const masked = data.settings.maskAmounts;
  const today = new Date();
  const todaySessions = data.workSessions.filter(
    (item) => dayKey(item.startedAt) === dayKey(today),
  );
  const todaySchedules = schedules.filter(
    (item) =>
      dayKey(item.startAt) === dayKey(today) &&
      (item.category === "兼职" ||
        data.projects.some(
          (project) =>
            item.project === project.title || item.title.includes(project.title),
        )),
  );
  const todayExpected = todaySessions.reduce(
    (sum, item) => sum + item.expectedIncome,
    0,
  );
  const todayCosts = todaySessions.reduce((sum, item) => sum + item.cost, 0);
  const todayMinutes = todaySessions.reduce(
    (sum, item) => sum + item.minutes + item.hiddenMinutes,
    0,
  );
  const todaySettlementReceivableIds = new Set(
    data.receivables
      .filter((item) => item.workSessionId && todaySessions.some((session) => session.id === item.workSessionId))
      .map((item) => item.id),
  );
  const todayReceived = data.settlements
    .filter((item) => todaySettlementReceivableIds.has(item.receivableId))
    .reduce((sum, item) => sum + item.amount, 0);
  const month = data.summary.month;
  const monthSessions = data.workSessions.filter((item) =>
    item.startedAt.startsWith(month),
  );
  const selectedProject =
    data.projects.find((item) => item.id === sessionProjectId) ?? data.projects[0];
  const runningSeconds = running
    ? Math.max(
        0,
        Math.floor(
          (now -
            new Date(running.startedAt).getTime() -
            running.pausedMinutes * 60000 -
            (running.status === "暂停" && running.pausedAt
              ? now - new Date(running.pausedAt).getTime()
              : 0)) /
            1000,
        ),
      )
    : 0;
  const suggestedStartAt = running
    ? localDateTime(new Date(running.startedAt))
    : now
      ? localDateTime(new Date(now - 60 * 60000))
      : "";
  const suggestedEndAt = now ? localDateTime(new Date(now)) : "";

  const rankedProjects = useMemo(
    () =>
      data.projects
        .map((project) => ({ project, stats: projectStats(project, data) }))
        .sort((a, b) => b.stats.net - a.stats.net),
    [data],
  );
  const monthRankedProjects = useMemo(() => {
    const monthSessionIds = new Set(
      data.workSessions
        .filter((item) => item.startedAt.startsWith(data.summary.month))
        .map((item) => item.id),
    );
    const monthData: FinanceData = {
      ...data,
      workSessions: data.workSessions.filter((item) =>
        monthSessionIds.has(item.id),
      ),
      receivables: data.receivables.filter(
        (item) => item.workSessionId && monthSessionIds.has(item.workSessionId),
      ),
    };
    return data.projects
      .map((project) => ({
        project,
        stats: projectStats(project, monthData),
      }))
      .filter((item) => item.stats.sessions > 0)
      .sort((a, b) => b.stats.net - a.stats.net);
  }, [data]);

  async function run(
    name: string,
    payload: Record<string, unknown>,
    success: string,
  ) {
    setBusy(name);
    try {
      await financeAction(name, payload);
      await Promise.all([load(), onWorkspaceReload()]);
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
    await run(
      "sideProject.create",
      Object.fromEntries(form.entries()),
      "兼职项目已经建立。",
    );
    event.currentTarget.reset();
  }

  async function editProject(project: SideHustleProject) {
    const title = window.prompt("项目名称", project.title);
    if (!title?.trim()) return;
    const status =
      window.prompt(
        "项目状态：进行中 / 暂停 / 已结束",
        project.status,
      ) || project.status;
    const unitRate = Number(
      window.prompt("计费单价", String(project.unitRate || 0)),
    );
    await run(
      "sideProject.update",
      {
        id: project.id,
        title: title.trim(),
        status,
        unitRate: Number.isFinite(unitRate) ? unitRate : project.unitRate,
      },
      "兼职项目已更新。",
    );
  }

  async function deleteProject(project: SideHustleProject) {
    if (
      !window.confirm(
        `删除“${project.title}”及关联的工作打卡和应收记录？已经进入账本的交易会保留，避免财务余额被篡改。`,
      )
    ) {
      return;
    }
    await run(
      "sideProject.delete",
      { id: project.id },
      "兼职项目已删除，已入账交易仍保留在财务中心。",
    );
  }

  async function createSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(
      "session.create",
      Object.fromEntries(form.entries()),
      "工作打卡、应收款和生活记录已经同步生成。",
    );
    event.currentTarget.reset();
  }

  async function settle(receivable: Receivable) {
    const remaining = Math.max(
      0,
      receivable.amountDue - receivable.amountReceived,
    );
    const value = window.prompt(
      `“${receivable.projectTitle}”本次到账金额`,
      String(remaining),
    );
    if (!value) return;
    const defaultAccount = data.accounts[0]?.id || "";
    const accountId = window.prompt(
      `输入收款账户编号：\n${data.accounts.map((item) => `${item.id}：${item.name}`).join("\n")}`,
      defaultAccount,
    );
    if (accountId === null) return;
    await run(
      "settlement.create",
      {
        receivableId: receivable.id,
        amount: value,
        accountId,
        receivedAt: new Date().toISOString(),
        note: `${receivable.projectTitle}到账`,
      },
      "到账已登记，并自动写入财务账本。",
    );
  }

  if (loading) {
    return (
      <section className="standard-page hustle-loading">
        <LoaderCircle className="spin" size={25} />
        <p>正在整理兼职项目、工时和应收款…</p>
      </section>
    );
  }

  return (
    <section className="standard-page hustle-center">
      <div className="page-intro">
        <div>
          <span className="eyebrow">SIDE HUSTLE CENTER</span>
          <h1>知道做了多久、应该赚多少，也知道是否真正到账</h1>
          <p>兼职项目、工作打卡、应收款、结算和成本各自独立，又自动形成完整收益闭环。</p>
        </div>
        <button className="primary-button" onClick={() => setTab("clock")}>
          <Clock3 size={17} /> {running ? "查看正在计时" : "开始兼职打卡"}
        </button>
      </div>

      <div className="hustle-tabs">
        {([
          ["today", "今日兼职", CalendarClock],
          ["projects", "项目列表", BriefcaseBusiness],
          ["clock", "兼职打卡", TimerReset],
          ["receivables", "收款中心", HandCoins],
          ["clients", "客户中心", UserRound],
          ["report", "收益总结", TrendingUp],
        ] as const).map(([id, label, Icon]) => (
          <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
            <Icon size={15} /> {label}
            {id === "receivables" && data.summary.outstanding > 0 && <em>{data.receivables.filter((item) => !["已到账", "已取消"].includes(item.status)).length}</em>}
          </button>
        ))}
      </div>

      {tab === "today" && (
        <>
          <div className="hustle-today-grid">
            <HustleMetric icon={Clock3} label="今日工作" value={duration(todayMinutes)} />
            <HustleMetric icon={CircleDollarSign} label="今日应赚" value={money(todayExpected, masked)} />
            <HustleMetric icon={WalletCards} label="今日到账" value={money(todayReceived, masked)} />
            <HustleMetric icon={Receipt} label="今日成本" value={money(todayCosts, masked)} />
            <HustleMetric icon={Gauge} label="今日净收益" value={money(todayReceived - todayCosts, masked)} />
          </div>

          {running && (
            <section className="running-session-banner">
              <span><Play size={18} /></span>
              <div>
                <small>{running.status === "暂停" ? "计时已暂停" : "正在工作"}</small>
                <h2>{running.projectTitle}</h2>
                <p>{running.workContent || "本次工作内容稍后补充"}</p>
              </div>
              <strong>{String(Math.floor(runningSeconds / 3600)).padStart(2, "0")}:{String(Math.floor((runningSeconds % 3600) / 60)).padStart(2, "0")}:{String(runningSeconds % 60).padStart(2, "0")}</strong>
              <button onClick={() => setTab("clock")}><Pause size={15} /> 管理本次打卡</button>
            </section>
          )}

          <div className="hustle-today-layout">
            <section className="hustle-panel">
              <header>
                <div><span className="eyebrow">TODAY SCHEDULE</span><h2>今日排期</h2></div>
                <span>{todaySchedules.length} 项</span>
              </header>
              <div className="hustle-schedule-list">
                {todaySchedules.length ? todaySchedules.map((item) => (
                  <article key={item.id}>
                    <time>{new Date(item.startAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</time>
                    <i />
                    <div><strong>{item.title}</strong><p>{item.project || item.category}</p></div>
                    <em>{item.status}</em>
                  </article>
                )) : <p className="hustle-empty">今天没有关联兼职的时间表安排，可以直接手动打卡。</p>}
              </div>
            </section>

            <section className="hustle-panel">
              <header>
                <div><span className="eyebrow">TODAY WORK</span><h2>今日工作记录</h2></div>
                <button onClick={() => setTab("clock")}><Plus size={14} /> 补录</button>
              </header>
              <div className="today-session-list">
                {todaySessions.length ? todaySessions.map((item) => (
                  <article key={item.id}>
                    <span><Check size={14} /></span>
                    <div>
                      <strong>{item.projectTitle}</strong>
                      <p>{item.workContent || "未填写工作内容"}</p>
                      <small>{duration(item.minutes + item.hiddenMinutes)} · 应赚 {money(item.expectedIncome, masked)}</small>
                    </div>
                  </article>
                )) : <p className="hustle-empty">完成第一次打卡后，这里会出现工作内容与本次应赚。</p>}
              </div>
            </section>
          </div>
        </>
      )}

      {tab === "projects" && (
        <div className="hustle-project-layout">
          <section className="hustle-project-grid">
            {rankedProjects.length ? rankedProjects.map(({ project, stats }) => (
              <article key={project.id} style={{ "--project-color": project.color } as React.CSSProperties}>
                <header>
                  <span><BriefcaseBusiness size={18} /></span>
                  <div><small>{project.kind} · {project.billingMode}</small><h2>{project.title}</h2></div>
                  <em>{project.status}</em>
                </header>
                <p>{project.clientName || "未填写客户"} · {project.settlementCycle}</p>
                <div className="project-income-strip">
                  <span><small>应赚</small><strong>{money(stats.expected, masked)}</strong></span>
                  <span><small>已到账</small><strong>{money(stats.received, masked)}</strong></span>
                  <span><small>待收</small><strong>{money(stats.outstanding, masked)}</strong></span>
                </div>
                <dl>
                  <div><dt>总工时</dt><dd>{duration(stats.minutes)}</dd></div>
                  <div><dt>成本</dt><dd>{money(stats.cost, masked)}</dd></div>
                  <div><dt>净利润</dt><dd>{money(stats.net, masked)}</dd></div>
                  <div><dt>有效时薪</dt><dd>{money(stats.effectiveHourly, masked)}/时</dd></div>
                </dl>
                <footer>
                  <button onClick={() => { setSessionProjectId(project.id); setTab("clock"); }}><Play size={13} /> 开始打卡</button>
                  <button onClick={() => void editProject(project)}><Pencil size={13} /> 编辑</button>
                  <button onClick={() => void deleteProject(project)}><Trash2 size={13} /> 删除</button>
                  <small>{project.unitRate ? `${money(project.unitRate, masked)} / ${project.billingMode.replace("按", "")}` : "自定义计费"}</small>
                </footer>
              </article>
            )) : <div className="hustle-empty-card"><BriefcaseBusiness size={30} /><h2>先建立第一份兼职项目</h2><p>项目会连接客户、工时、应收、到账和成本。</p></div>}
          </section>
          <section className="hustle-form-panel">
            <h2>新建兼职项目</h2>
            <form onSubmit={createProject}>
              <label><span>项目名称</span><input name="title" placeholder="例如：初二物理家教" required /></label>
              <label><span>类型</span><select name="kind">{["家教", "课件制作", "投稿", "自媒体", "设计", "开发", "销售", "平台任务", "其他兼职"].map((item) => <option key={item}>{item}</option>)}</select></label>
              <label><span>客户</span><input name="clientName" placeholder="个人、公司或平台" /></label>
              <label><span>客户联系方式</span><input name="clientContact" placeholder="默认隐藏展示" /></label>
              <label><span>计费方式</span><select name="billingMode">{["按小时", "按次数", "按天", "按件", "固定项目价", "销售提成", "流量或平台收益", "底薪＋提成", "自定义"].map((item) => <option key={item}>{item}</option>)}</select></label>
              <label><span>单价</span><input name="unitRate" type="number" min="0" step="0.01" placeholder="200" /></label>
              <label><span>结算周期</span><select name="settlementCycle">{["每次结束", "每周", "每月", "项目完成", "平台周期", "自定义"].map((item) => <option key={item}>{item}</option>)}</select></label>
              <label><span>本月收入目标</span><input name="incomeTarget" type="number" min="0" step="0.01" /></label>
              <label className="wide"><span>项目备注</span><input name="note" placeholder="合作约定、工作边界或其他说明" /></label>
              <button className="primary-button wide" disabled={busy === "sideProject.create"}><Plus size={15} /> 建立项目</button>
            </form>
          </section>
        </div>
      )}

      {tab === "clock" && (
        <div className="hustle-clock-layout">
          <section className="timer-card">
            <span className="eyebrow">LIVE WORK TIMER</span>
            <h2>{running ? running.projectTitle : selectedProject?.title || "选择一份兼职"}</h2>
            <strong>
              {running
                ? `${String(Math.floor(runningSeconds / 3600)).padStart(2, "0")}:${String(Math.floor((runningSeconds % 3600) / 60)).padStart(2, "0")}:${String(runningSeconds % 60).padStart(2, "0")}`
                : "00:00:00"}
            </strong>
            {!running ? (
              <>
                <select value={sessionProjectId} onChange={(event) => setSessionProjectId(event.target.value)}>
                  {data.projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}
                </select>
                <button
                  className="timer-start"
                  disabled={!selectedProject || busy === "session.start"}
                  onClick={() =>
                    selectedProject &&
                    void run(
                      "session.start",
                      {
                        projectId: selectedProject.id,
                        startedAt: new Date().toISOString(),
                      },
                      "兼职计时已经开始。",
                    )
                  }
                >
                  <Play size={18} /> 开始计时
                </button>
              </>
            ) : (
              <>
                <div className="timer-live-actions">
                  <button
                    onClick={() =>
                      void run(
                        running.status === "暂停"
                          ? "session.resume"
                          : "session.pause",
                        { id: running.id },
                        running.status === "暂停"
                          ? "已经继续计时。"
                          : "计时已暂停，暂停时间不会计入工时。",
                      )
                    }
                  >
                    {running.status === "暂停" ? <Play size={15} /> : <Pause size={15} />}
                    {running.status === "暂停" ? "继续计时" : "暂停计时"}
                  </button>
                </div>
                <p>结束时填写工作内容、成果、成本和到账情况，系统会自动形成应收款。</p>
              </>
            )}
          </section>

          <section className="session-form-card">
            <header>
              <div><span className="eyebrow">WORK SESSION</span><h2>{running ? "结束本次打卡" : "手动补录兼职"}</h2></div>
              <TimerReset size={21} />
            </header>
            {data.projects.length ? (
              <form
                onSubmit={async (event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  const payload = Object.fromEntries(form.entries());
                  if (running) {
                    await run("session.stop", { ...payload, id: running.id }, "打卡已结束，应收款与生活记录已经生成。");
                  } else {
                    await createSession(event);
                  }
                }}
              >
                {!running && (
                  <label><span>兼职项目</span><select name="projectId" value={sessionProjectId} onChange={(event) => setSessionProjectId(event.target.value)}>{data.projects.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
                )}
                <label><span>开始时间</span><input name="startedAt" type="datetime-local" defaultValue={suggestedStartAt} readOnly={Boolean(running)} /></label>
                <label><span>结束时间</span><input name="endedAt" type="datetime-local" defaultValue={suggestedEndAt} /></label>
                <label><span>隐性时间（分钟）</span><input name="hiddenMinutes" type="number" min="0" defaultValue="0" placeholder="备课、沟通、通勤…" /></label>
                <label><span>本次应赚</span><input name="expectedIncome" type="number" min="0" step="0.01" placeholder="留空则按计费规则计算" /></label>
                <label><span>本次成本</span><input name="cost" type="number" min="0" step="0.01" defaultValue="0" /></label>
                <label><span>成本支付账户</span><select name="costAccountId"><option value="">不写入账本</option>{data.accounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                <label><span>本次实际到账</span><input name="paidAmount" type="number" min="0" step="0.01" defaultValue="0" /></label>
                <label><span>收款账户</span><select name="paidAccountId">{data.accounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                <label><span>预计收款日期</span><input name="dueAt" type="date" /></label>
                <label><span>工作地点</span><input name="place" placeholder="学生家、线上、学校…" /></label>
                <label className="wide"><span>工作内容</span><textarea name="workContent" placeholder="做了什么、服务了谁、处理了哪些问题" /></label>
                <label className="wide"><span>工作成果</span><textarea name="result" placeholder="交付内容、教学进展、完成数量…" /></label>
                <label className="wide"><span>今日感受</span><input name="feeling" placeholder="本次工作是否顺利、哪里需要改进" /></label>
                <button className="primary-button wide" disabled={busy === "session.stop" || busy === "session.create"}>
                  {running ? <Pause size={16} /> : <Check size={16} />}
                  {running ? "结束打卡并生成应收" : "保存补录并生成应收"}
                </button>
              </form>
            ) : (
              <div className="hustle-no-project">
                <BriefcaseBusiness size={28} />
                <p>请先到“项目列表”建立兼职项目。</p>
                <button onClick={() => setTab("projects")}>建立项目</button>
              </div>
            )}
          </section>
        </div>
      )}

      {tab === "receivables" && (
        <div className="receivable-center">
          <div className="receivable-summary">
            <HustleMetric icon={CircleDollarSign} label="累计应收" value={money(data.receivables.reduce((sum, item) => sum + item.amountDue, 0), masked)} />
            <HustleMetric icon={WalletCards} label="已经到账" value={money(data.receivables.reduce((sum, item) => sum + item.amountReceived, 0), masked)} />
            <HustleMetric icon={BellRing} label="尚未到账" value={money(data.summary.outstanding, masked)} />
            <HustleMetric icon={TrendingUp} label="本月净收益" value={money(data.summary.sideNet, masked)} />
          </div>
          <section className="hustle-panel">
            <header>
              <div><span className="eyebrow">RECEIVABLES</span><h2>收款中心</h2></div>
              <span>应赚与到账分开记录</span>
            </header>
            <div className="receivable-list">
              {data.receivables.length ? data.receivables.map((item) => {
                const remaining = Math.max(0, item.amountDue - item.amountReceived);
                const progress = item.amountDue > 0 ? Math.round((item.amountReceived / item.amountDue) * 100) : 0;
                return (
                  <article key={item.id} className={`status-${item.status}`}>
                    <header>
                      <span><HandCoins size={17} /></span>
                      <div><strong>{item.projectTitle}</strong><small>{item.clientName || "未填写客户"}</small></div>
                      <em>{item.status}</em>
                    </header>
                    <div className="receivable-money">
                      <span><small>应收</small><strong>{money(item.amountDue, masked)}</strong></span>
                      <span><small>已收</small><strong>{money(item.amountReceived, masked)}</strong></span>
                      <span><small>剩余</small><strong>{money(remaining, masked)}</strong></span>
                    </div>
                    <i><b style={{ width: `${Math.min(100, progress)}%` }} /></i>
                    <footer>
                      <span>{item.dueAt ? `预计 ${new Date(item.dueAt).toLocaleDateString("zh-CN")} 收款` : "未设置收款日期"}</span>
                      {!["已到账", "已取消"].includes(item.status) && (
                        <button onClick={() => void settle(item)}><Banknote size={13} /> 登记到账</button>
                      )}
                    </footer>
                  </article>
                );
              }) : <p className="hustle-empty">完成兼职打卡后，应收款会自动出现在这里。</p>}
            </div>
          </section>
        </div>
      )}

      {tab === "clients" && (
        <div className="client-center">
          <div className="client-privacy-bar">
            <EyeOff size={16} />
            <span>联系方式默认隐藏，财务导出也不会自动包含客户敏感信息。</span>
            <button onClick={() => setShowContacts(!showContacts)}>
              {showContacts ? <EyeOff size={14} /> : <Eye size={14} />}
              {showContacts ? "隐藏联系方式" : "临时显示"}
            </button>
          </div>
          <div className="client-grid">
            {data.clients.length ? data.clients.map((client) => {
              const projects = data.projects.filter((item) => item.clientId === client.id);
              const clientReceivables = data.receivables.filter((item) => item.clientId === client.id);
              const total = clientReceivables.reduce((sum, item) => sum + item.amountReceived, 0);
              const pending = clientReceivables.reduce((sum, item) => sum + Math.max(0, item.amountDue - item.amountReceived), 0);
              return (
                <article key={client.id}>
                  <header><span><UserRound size={18} /></span><div><h2>{client.name}</h2><p>{showContacts ? client.contact || "未填写联系方式" : "联系方式已隐藏"}</p></div></header>
                  <dl>
                    <div><dt>合作项目</dt><dd>{projects.length}</dd></div>
                    <div><dt>历史到账</dt><dd>{money(total, masked)}</dd></div>
                    <div><dt>待收款</dt><dd>{money(pending, masked)}</dd></div>
                  </dl>
                  <p>{client.paymentHabit || client.note || "暂未填写付款习惯和合作备注。"}</p>
                  <footer>
                    <button
                      onClick={() => {
                        const name = window.prompt("客户名称", client.name);
                        if (!name?.trim()) return;
                        const note = window.prompt(
                          "付款习惯或合作备注",
                          client.paymentHabit || client.note,
                        );
                        void run(
                          "client.update",
                          {
                            id: client.id,
                            name: name.trim(),
                            paymentHabit: note ?? client.paymentHabit,
                          },
                          "客户资料已更新。",
                        );
                      }}
                    >
                      <Pencil size={13} /> 编辑
                    </button>
                    <button
                      disabled={projects.length > 0}
                      title={projects.length ? "先处理关联的兼职项目" : "删除客户"}
                      onClick={() => {
                        if (!window.confirm(`删除客户“${client.name}”？`)) return;
                        void run(
                          "client.delete",
                          { id: client.id },
                          "客户资料已删除。",
                        );
                      }}
                    >
                      <Trash2 size={13} /> 删除
                    </button>
                  </footer>
                </article>
              );
            }) : <div className="hustle-empty-card"><UserRound size={30} /><h2>客户会随兼职项目自动建立</h2><p>联系方式默认隐藏，只有主动操作才会展示。</p></div>}
          </div>
        </div>
      )}

      {tab === "report" && (
        <div className="hustle-report">
          <section className="hustle-report-hero">
            <div>
              <span className="eyebrow">{month} MONTHLY REPORT</span>
              <h1>本月完成 {monthSessions.filter((item) => item.status === "已完成").length} 次兼职，投入 {duration(data.summary.workMinutes)}</h1>
              <p>实际到账 {money(data.summary.sideIncome, masked)}，待收 {money(data.summary.outstanding, masked)}，扣除成本后的净收益为 {money(data.summary.sideNet, masked)}。</p>
            </div>
            <span><Sparkles size={24} /><strong>{money(data.summary.effectiveHourly, masked)}</strong><small>平均有效时薪</small></span>
          </section>
          <section className="project-profit-table">
            <header><h2>月度兼职项目总表</h2><span>已包含隐性时间和兼职成本</span></header>
            <div className="profit-table-head">
              <span>项目</span><span>次数</span><span>总时长</span><span>应赚</span><span>已到账</span><span>成本</span><span>净利润</span><span>有效时薪</span>
            </div>
            {monthRankedProjects.map(({ project, stats }) => (
              <div className="profit-table-row" key={project.id}>
                <strong>{project.title}</strong>
                <span>{stats.sessions}</span>
                <span>{duration(stats.minutes)}</span>
                <span>{money(stats.expected, masked)}</span>
                <span>{money(stats.received, masked)}</span>
                <span>{money(stats.cost, masked)}</span>
                <span>{money(stats.net, masked)}</span>
                <span>{money(stats.effectiveHourly, masked)}</span>
              </div>
            ))}
          </section>
          <section className="hustle-insights">
            <Sparkles size={19} />
            <div>
              <strong>收益提示</strong>
              <p>
                {monthRankedProjects[0]
                  ? `本月净收益最高的是“${monthRankedProjects[0].project.title}”。${
                      data.summary.outstanding > 0
                        ? `还有 ${money(data.summary.outstanding, masked)} 尚未到账，建议优先检查已逾期款项。`
                        : "本月应收款均已完成结算。"
                    }`
                  : "完成兼职打卡后，这里会比较不同项目的投入产出。"}
              </p>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

function HustleMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock3;
  label: string;
  value: string;
}) {
  return (
    <article className="hustle-metric">
      <span><Icon size={17} /></span>
      <small>{label}</small>
      <strong>{value}</strong>
    </article>
  );
}
