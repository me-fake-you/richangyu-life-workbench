/** Read-only projections over the private single-owner workbench. Never materializes recurring bills. */
export class DashboardError extends Error {
  constructor(message, status = 422) { super(message); this.status = status; }
}
export function dashboardOptions(params, now = Date.now()) {
  const keys = [...params.keys()];
  if (keys.some(key => !["kind", "month", "page", "days"].includes(key)) ||
      new Set(keys).size !== keys.length) throw new DashboardError("读取参数无效。");
  const kind = params.get("kind");
  if (!["finance", "goals", "review"].includes(kind)) throw new DashboardError("请选择账本、目标或回顾。");
  if (kind === "finance") {
    if (params.has("days")) throw new DashboardError("账本不接受回顾参数。");
    const month = params.get("month") || new Date(now + 28800000).toISOString().slice(0, 7);
    const page = params.get("page") || "0";
    if (!/^(20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(month) || !/^(0|[1-9]\d{0,2})$/.test(page))
      throw new DashboardError("月份或页码无效。");
    const [y, m] = month.split("-").map(Number);
    return { kind, month, page: Number(page), start: new Date(Date.UTC(y, m - 1, 1) - 28800000).toISOString(),
      end: new Date(Date.UTC(y, m, 1) - 28800000).toISOString() };
  }
  if (params.has("month") || params.has("page")) throw new DashboardError("这个页面不接受账本参数。");
  if (kind === "goals") {
    if (params.has("days")) throw new DashboardError("目标不接受回顾参数。");
    return { kind };
  }
  const days = params.get("days") || "7";
  if (!["7", "30", "90"].includes(days)) throw new DashboardError("回顾范围无效。");
  const today = new Date(now + 28800000).toISOString().slice(0, 10);
  const end = Date.parse(today + "T00:00:00+08:00") + 86400000;
  return { kind, days: Number(days), start: new Date(end - Number(days) * 86400000).toISOString(),
    end: new Date(end).toISOString() };
}
const safe = (value, limit = 2000) => String(value ?? "").slice(0, limit);
const n = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const money = value => n(value).toFixed(2);
const metric = (label, value, unit = "") => ({ label, value: String(value), unit });
const item = (id, title, subtitle = "", detail = "", value = "", progress = null) =>
  ({ id: safe(id, 150), title: safe(title, 250), subtitle: safe(subtitle, 500),
    detail: safe(detail, 6000), value: safe(value, 200), progress });
const results = result => {
  if (!result || result.success === false || !Array.isArray(result.results)) throw new Error("Read failed");
  return result.results;
};
const incomeTypes = "'收入','退款','报销','借入'";
const expenseTypes = "'支出','借出','预付款','应付'";
export async function readMobileDashboard(DB, options, now = Date.now()) {
  const base = { schemaVersion: 1, kind: options.kind, readAt: new Date(now).toISOString(), readOnly: true,
    timezone: "Asia/Shanghai", metrics: [], groups: [], accounts: [], ledgerActions: false };
  if (options.kind === "finance") {
    const where = "deleted_at IS NULL AND julianday(occurred_at) >= julianday(?) AND julianday(occurred_at) < julianday(?)";
    const response = await DB.batch([
      DB.prepare("SELECT COUNT(*) AS count, COALESCE(SUM(CASE WHEN type='收入' THEN amount ELSE 0 END),0) AS income, " +
        "COALESCE(SUM(CASE WHEN type='支出' THEN amount ELSE 0 END),0) AS expense FROM finance_transactions WHERE " + where)
        .bind(options.start, options.end),
      DB.prepare("SELECT t.id,t.type,t.amount,t.category,t.occurred_at,t.note,a.name AS account_name " +
        "FROM finance_transactions t LEFT JOIN financial_accounts a ON a.id=t.account_id WHERE t." + where +
        " ORDER BY julianday(t.occurred_at) DESC,t.id DESC LIMIT 51 OFFSET ?").bind(options.start, options.end, options.page * 50),
      DB.prepare("SELECT a.id,a.name,a.type,a.is_archived,ROUND(a.initial_balance + " +
        "(SELECT COALESCE(SUM(CASE WHEN t.type='转账' THEN " +
        "(CASE WHEN t.transfer_account_id=a.id THEN t.amount ELSE 0 END)-(CASE WHEN t.account_id=a.id THEN t.amount ELSE 0 END) " +
        "WHEN t.type IN (" + incomeTypes + ") AND t.account_id=a.id THEN t.amount " +
        "WHEN t.type IN (" + expenseTypes + ") AND t.account_id=a.id THEN -t.amount ELSE 0 END),0) " +
        "FROM finance_transactions t WHERE t.deleted_at IS NULL AND (t.account_id=a.id OR t.transfer_account_id=a.id)),2) AS balance " +
        "FROM financial_accounts a ORDER BY a.is_archived,a.created_at,a.id LIMIT 101"),
      DB.prepare("SELECT b.*,COALESCE((SELECT SUM(t.amount) FROM finance_transactions t WHERE t.deleted_at IS NULL " +
        "AND t.type IN ('支出','预付款','应付') AND t.category=b.category " +
        "AND julianday(t.occurred_at)>=julianday(?) AND julianday(t.occurred_at)<julianday(?)),0) AS spent " +
        "FROM finance_budgets b WHERE b.month=? ORDER BY b.category,b.id LIMIT 101").bind(options.start, options.end, options.month),
      DB.prepare("SELECT id,title,target_amount,saved_amount,target_at FROM savings_goals ORDER BY created_at DESC,id LIMIT 101"),
    ]);
    const [summaryRows, transactions, accounts, budgets, savings] = response.map(results);
    const summary = summaryRows[0] || {};
    const limited = accounts.length > 100 || budgets.length > 100 || savings.length > 100;
    return { ...base, month: options.month, page: options.page, total: n(summary.count),
      nextPage: transactions.length > 50 && options.page < 999 ? options.page + 1 : null,
      ledgerActions: true, truncated: limited || (transactions.length > 50 && options.page === 999),
      accounts: accounts.slice(0, 100).filter(a => !n(a.is_archived)).map(a => ({ id: safe(a.id, 100), name: safe(a.name, 200) })),
      metrics: [metric("本月收入", money(summary.income), "元"), metric("本月支出", money(summary.expense), "元"),
        metric("收支差额", money(n(summary.income) - n(summary.expense)), "元"), metric("本月账目", n(summary.count), "笔")],
      notice: "北京时间自然月。收入与支出分别只统计同名类型，不含转账、借款、退款和报销；分类预算计支出、预付款和应付。账户余额按全部未删除账目计算，不是银行实时余额。读取不会补记周期账单。列表每页50笔，账户、预算和储蓄各最多100项；分页期间数据可能变化。",
      groups: [
        { title: "本月账目", items: transactions.slice(0, 50).map(t => item(t.id, safe(t.type, 30) + " / " + safe(t.category, 100),
          t.occurred_at, (t.account_name || "未指定账户") + "\n" + (t.note || "没有备注"), money(t.amount) + " 元")) },
        { title: "账户余额", items: accounts.slice(0, 100).map(a => item(a.id, a.name, a.type + (n(a.is_archived) ? " / 已归档" : ""),
          "从全部未删除账目计算，含初始余额。不是银行实时余额。", money(a.balance) + " 元")) },
        { title: "分类预算", items: budgets.slice(0, 100).map(b => item(b.id, b.category, options.month,
          "已计入 " + money(b.spent) + " 元 / 预算 " + money(b.amount) + " 元",
          n(b.spent) > n(b.amount) ? "超过预算" : "按分类核对",
          n(b.amount) > 0 ? Math.max(0, Math.min(100, Math.round(n(b.spent) / n(b.amount) * 100))) : null)) },
        { title: "储蓄目标", items: savings.slice(0, 100).map(g => item(g.id, g.title, safe(g.target_at, 60),
          "已储蓄 " + money(g.saved_amount) + " 元 / 目标 " + money(g.target_amount) + " 元", "",
          n(g.target_amount) > 0 ? Math.max(0, Math.min(100, Math.round(n(g.saved_amount) / n(g.target_amount) * 100))) : null)) },
      ] };
  }
  if (options.kind === "goals") {
    const response = await DB.batch([
      DB.prepare("SELECT p.id,p.title,p.kind,p.status,p.progress,p.description,p.target_at," +
        "(SELECT COUNT(*) FROM tasks t WHERE t.project_id=p.id) AS task_count," +
        "(SELECT COUNT(*) FROM tasks t WHERE t.project_id=p.id AND t.status='已完成') AS done_count " +
        "FROM projects p ORDER BY p.updated_at DESC,p.id LIMIT 101"),
      DB.prepare("SELECT COUNT(*) AS count,SUM(CASE WHEN status='已完成' THEN 1 ELSE 0 END) AS done FROM projects"),
      DB.prepare("SELECT m.id,m.title,m.note,m.happened_at,m.completed,p.title AS project_title FROM milestones m " +
        "LEFT JOIN projects p ON p.id=m.project_id ORDER BY julianday(m.happened_at) DESC,m.id LIMIT 51"),
    ]);
    const [goals, totals, milestones] = response.map(results);
    return { ...base, truncated: goals.length > 100 || milestones.length > 50,
      metrics: [metric("全部目标", n(totals[0]?.count), "项"), metric("已完成目标", n(totals[0]?.done), "项")],
      notice: "目标最多100项，最近里程碑最多50项。进度是工作台保存的进度，不从任务完成数自动推算。本页只读；创建、修改目标和里程碑仍在网页版，任务可到原生任务中心操作。",
      groups: [
        { title: "我的目标", items: goals.slice(0, 100).map(g => item(g.id, g.title, g.kind + " / " + g.status,
          "截止：" + (g.target_at || "未设置") + "\n关联任务：" + n(g.done_count) + "/" + n(g.task_count) + " 已完成\n" + safe(g.description),
          "已存进度 " + n(g.progress) + "%", Math.max(0, Math.min(100, n(g.progress))))) },
        { title: "最近里程碑", items: milestones.slice(0, 50).map(m => item(m.id, m.title,
          safe(m.happened_at, 60) + (n(m.completed) ? " / 已完成" : " / 待完成"),
          safe(m.project_title, 250) + "\n" + safe(m.note))) },
      ] };
  }
  if (options.kind !== "review") throw new DashboardError("不支持的总览。");
  const response = await DB.batch([
    DB.prepare("SELECT COUNT(*) AS count,COUNT(DISTINCT date(happened_at,'+8 hours')) AS days FROM life_events " +
      "WHERE deleted_at IS NULL AND is_private=0 AND record_status!='checkin_running' " +
      "AND julianday(happened_at)>=julianday(?) AND julianday(happened_at)<julianday(?)").bind(options.start, options.end),
    DB.prepare("SELECT date(happened_at,'+8 hours') AS day,COUNT(*) AS count FROM life_events " +
      "WHERE deleted_at IS NULL AND is_private=0 AND record_status!='checkin_running' " +
      "AND julianday(happened_at)>=julianday(?) AND julianday(happened_at)<julianday(?) " +
      "GROUP BY date(happened_at,'+8 hours') ORDER BY day DESC").bind(options.start, options.end),
    DB.prepare("SELECT COUNT(*) AS count,COALESCE(SUM(se.planned_minutes),0) AS planned," +
      "COALESCE(SUM(si.actual_minutes),0) AS actual FROM schedule_instances si JOIN schedule_events se ON se.id=si.schedule_id " +
      "WHERE julianday(si.occurrence_start)>=julianday(?) AND julianday(si.occurrence_start)<julianday(?)").bind(options.start, options.end),
    DB.prepare("SELECT COUNT(*) AS count FROM tasks WHERE status='已完成' AND julianday(completed_at)>=julianday(?) " +
      "AND julianday(completed_at)<julianday(?)").bind(options.start, options.end),
    DB.prepare("SELECT COALESCE(SUM(minutes+hidden_minutes),0) AS minutes FROM work_sessions WHERE ended_at IS NOT NULL " +
      "AND julianday(started_at)>=julianday(?) AND julianday(started_at)<julianday(?)").bind(options.start, options.end),
    DB.prepare("SELECT id,title,kind,happened_at FROM life_events WHERE deleted_at IS NULL AND is_private=0 " +
      "AND record_status!='checkin_running' AND julianday(happened_at)>=julianday(?) AND julianday(happened_at)<julianday(?) " +
      "ORDER BY julianday(happened_at) DESC,id LIMIT 10").bind(options.start, options.end),
  ]);
  const [events, trend, schedules, tasks, work, highlights] = response.map(results);
  const startDate = new Date(Date.parse(options.start) + 28800000).toISOString().slice(0, 10);
  const endDate = new Date(Date.parse(options.end) + 28800000 - 1).toISOString().slice(0, 10);
  return { ...base, days: options.days, startDate, endDate, truncated: false,
    metrics: [metric("生活记录", n(events[0]?.count), "条"), metric("有记录的天数", n(events[0]?.days), "天"),
      metric("完成任务", n(tasks[0]?.count), "项"), metric("日程计划", n(schedules[0]?.planned), "分钟"),
      metric("日程实际", n(schedules[0]?.actual), "分钟"), metric("已结束兼职", n(work[0]?.minutes), "分钟")],
    notice: "北京时间 " + startDate + " 至 " + endDate + "。仅统计已保存数据：日程只含已存储实例，不推断重复规则或完整日历；兼职按开始日期归组。排除私密、删除和进行中的打卡。不是AI总结，不调用模型，不读取财务，不保存新总结。",
    groups: [
      { title: "记录足迹", items: trend.map(t => item(t.day, t.day, "", "", n(t.count) + " 条")) },
      { title: "最近记录标题", items: highlights.map(e => item(e.id, e.title || "未命名记录", e.kind, e.happened_at)) },
    ] };
}
