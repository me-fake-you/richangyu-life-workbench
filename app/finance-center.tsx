"use client";

import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Banknote,
  BellRing,
  Check,
  ChevronRight,
  CircleDollarSign,
  Download,
  Eye,
  EyeOff,
  Landmark,
  LoaderCircle,
  Pencil,
  PiggyBank,
  Plus,
  ReceiptText,
  RotateCcw,
  Scissors,
  ShieldCheck,
  Target,
  Trash2,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  emptyFinanceData,
  financeAction,
  type FinanceData,
} from "./financial-types";

type FinanceTab = "overview" | "ledger" | "accounts" | "budget" | "savings";

const incomeCategories = [
  "工资",
  "兼职",
  "家教",
  "投稿",
  "奖金",
  "报销",
  "二手交易",
  "投资收益",
  "红包",
  "其他收入",
];

const expenseCategories = [
  "餐饮",
  "交通",
  "购物",
  "房租",
  "水电通信",
  "学习考试",
  "旅行",
  "医疗",
  "娱乐",
  "人情礼物",
  "工作支出",
  "兼职成本",
  "订阅服务",
  "其他支出",
];

const specialTypes = ["转账", "退款", "报销", "借入", "借出", "应付", "预付款"];

function localDateTime(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function currentMonth() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function money(value: number, masked: boolean) {
  if (masked) return "¥ ••••";
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value || 0);
}

function transactionDirection(type: string) {
  if (["收入", "退款", "报销", "借入"].includes(type)) return 1;
  if (type === "转账") return 0;
  return -1;
}

export function FinanceCenter({
  onNotice,
}: {
  onNotice: (notice: string) => void;
}) {
  const [data, setData] = useState<FinanceData>(emptyFinanceData);
  const [tab, setTab] = useState<FinanceTab>("overview");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [transactionType, setTransactionType] = useState("支出");

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/finance", { cache: "no-store" });
      const payload = (await response.json()) as FinanceData & { error?: string };
      if (!response.ok) throw new Error(payload.error || "读取财务中心失败。");
      setData(payload);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "读取财务中心失败。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
    // The finance center loads once when its page opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const masked = data.settings.maskAmounts;
  const monthTransactions = data.transactions.filter((item) =>
    item.occurredAt.startsWith(data.summary.month || currentMonth()),
  );
  const expenseByCategory = useMemo(() => {
    const values = new Map<string, number>();
    for (const item of monthTransactions) {
      if (transactionDirection(item.type) >= 0) continue;
      values.set(item.category, (values.get(item.category) ?? 0) + item.amount);
    }
    return [...values.entries()].sort((a, b) => b[1] - a[1]);
  }, [monthTransactions]);
  const maxCategorySpend = Math.max(1, ...expenseByCategory.map((item) => item[1]));
  const monthBudgets = data.budgets.filter(
    (item) => item.month === (data.summary.month || currentMonth()),
  );

  async function run(
    name: string,
    payload: Record<string, unknown>,
    success: string,
  ) {
    setBusy(name);
    try {
      await financeAction(name, payload);
      await load();
      onNotice(success);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "操作失败。");
    } finally {
      setBusy("");
    }
  }

  async function createTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const receipt = form.get("receipt");
    form.delete("receipt");
    setBusy("transaction.create");
    try {
      const created = (await financeAction(
        "transaction.create",
        Object.fromEntries(form.entries()),
      )) as { id?: string };
      if (receipt instanceof File && receipt.size > 0 && created.id) {
        const document = new FormData();
        document.set("transactionId", created.id);
        document.set("file", receipt);
        const response = await fetch("/api/finance/documents", {
          method: "POST",
          body: document,
        });
        const payload = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(payload.error || "票据上传失败。");
        }
      }
      await load();
      onNotice(
        transactionType === "转账"
          ? "账户转账已保存，不计入收支。"
          : receipt instanceof File && receipt.size > 0
            ? "账目和票据已经保存。"
            : "账目已经保存。",
      );
      formElement.reset();
      setTransactionType("支出");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "保存账目失败。");
    } finally {
      setBusy("");
    }
  }

  async function updateSettings(patch: Partial<FinanceData["settings"]>) {
    await run(
      "settings.update",
      { ...data.settings, ...patch },
      patch.maskAmounts !== undefined
        ? patch.maskAmounts
          ? "金额已经模糊显示。"
          : "金额已经恢复显示。"
        : "财务模式已经更新。",
    );
  }

  function exportFinance() {
    if (
      !window.confirm(
        "财务导出包含账户余额、交易、预算、兼职应收和结算。确认继续吗？",
      )
    ) {
      return;
    }
    const includeContacts = window.confirm(
      "是否同时导出客户联系方式？选择“取消”会生成已隐藏联系方式的副本。",
    );
    const exportData = {
      title: "日常屿财务与兼职数据",
      exportedAt: new Date().toISOString(),
      ...data,
      clients: data.clients.map((client) => ({
        ...client,
        contact: includeContacts ? client.contact : "",
      })),
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `日常屿-财务兼职-${data.summary.month}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    onNotice("财务与兼职数据已经单独导出。");
  }

  async function editTransaction(item: FinanceData["transactions"][number]) {
    const value = window.prompt("修改金额", String(item.amount));
    if (value === null) return;
    const category = window.prompt("修改分类", item.category);
    if (category === null) return;
    const note = window.prompt("修改备注", item.note);
    if (note === null) return;
    await run(
      "transaction.update",
      {
        ...item,
        amount: value,
        category,
        note,
      },
      "账目已经更新。",
    );
  }

  async function offsetTransaction(
    item: FinanceData["transactions"][number],
    mode: "refund" | "reimburse",
  ) {
    const label = mode === "refund" ? "退款" : "报销";
    const value = window.prompt(`${label}到账金额`, String(item.amount));
    if (value === null) return;
    const note = window.prompt(`${label}备注`, `${item.category}${label}`);
    if (note === null) return;
    await run(
      `transaction.${mode}`,
      {
        id: item.id,
        amount: value,
        accountId: item.accountId,
        occurredAt: new Date().toISOString(),
        note,
      },
      `${label}已经关联到原支出，不会重复计算。`,
    );
  }

  async function splitTransaction(item: FinanceData["transactions"][number]) {
    const firstAmount = window.prompt(
      "第一部分金额（剩余金额自动成为第二部分）",
      String(Math.round((item.amount / 2) * 100) / 100),
    );
    if (firstAmount === null) return;
    const first = Number(firstAmount);
    const second = Math.round((item.amount - first) * 100) / 100;
    if (!(first > 0) || !(second > 0)) {
      onNotice("拆分后的两项金额都必须大于 0。");
      return;
    }
    const firstCategory = window.prompt("第一部分分类", item.category);
    if (firstCategory === null) return;
    const secondCategory = window.prompt("第二部分分类", item.category);
    if (secondCategory === null) return;
    await run(
      "transaction.split",
      {
        id: item.id,
        parts: [
          { amount: first, category: firstCategory, note: item.note },
          { amount: second, category: secondCategory, note: item.note },
        ],
      },
      "账目已拆成两项，总金额保持不变。",
    );
  }

  if (loading) {
    return (
      <section className="standard-page finance-loading">
        <LoaderCircle className="spin" size={25} />
        <p>正在整理账户、账本和预算…</p>
      </section>
    );
  }

  return (
    <section className={`standard-page finance-center ${masked ? "amounts-masked" : ""}`}>
      <div className="page-intro finance-page-intro">
        <div>
          <span className="eyebrow">FINANCE CENTER</span>
          <h1>知道钱从哪里来，也知道它最终去了哪里</h1>
          <p>收入、支出、转账、预算、储蓄和兼职到账使用同一份真实账本。</p>
        </div>
        <div className="finance-privacy-actions">
          <button
            onClick={() => void updateSettings({ maskAmounts: !masked })}
            title="在整个财务与兼职模块隐藏金额"
          >
            {masked ? <Eye size={16} /> : <EyeOff size={16} />}
            {masked ? "显示金额" : "隐藏金额"}
          </button>
          <button
            onClick={() =>
              void updateSettings({
                mode: data.settings.mode === "simple" ? "full" : "simple",
              })
            }
          >
            <WalletCards size={16} />
            {data.settings.mode === "simple" ? "切换完整模式" : "切换简单模式"}
          </button>
          <label>
            <span>时间线金额</span>
            <select
              value={data.settings.showInTimeline}
              onChange={(event) =>
                void updateSettings({
                  showInTimeline: event.target
                    .value as FinanceData["settings"]["showInTimeline"],
                })
              }
            >
              <option value="summary">只显示获得收入</option>
              <option value="amount">显示具体金额</option>
              <option value="hidden">完全隐藏金额</option>
            </select>
          </label>
          <button onClick={exportFinance}>
            <Download size={16} />
            单独导出
          </button>
        </div>
      </div>

      <div className="finance-mode-note">
        <ShieldCheck size={17} />
        <div>
          <strong>{data.settings.mode === "simple" ? "简单记账模式" : "完整财务模式"}</strong>
          <span>
            {data.settings.mode === "simple"
              ? "优先提供 5 秒记账；账户、预算和特殊交易随时可进入完整模式。"
              : "已显示多账户、转账、预算、储蓄目标和完整财务报表。"}
          </span>
        </div>
      </div>

      <div className="finance-tabs">
        {([
          ["overview", "财务概览", CircleDollarSign],
          ["ledger", "快速记账", ReceiptText],
          ["accounts", "账户", Landmark],
          ["budget", "预算", Target],
          ["savings", "储蓄目标", PiggyBank],
        ] as const).map(([id, label, Icon]) => (
          <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <>
          <div className="finance-summary-grid">
            <FinanceMetric
              icon={ArrowDownLeft}
              label="本月收入"
              value={money(data.summary.totalIncome, masked)}
              tone="income"
            />
            <FinanceMetric
              icon={ArrowUpRight}
              label="本月支出"
              value={money(data.summary.totalExpense, masked)}
              tone="expense"
            />
            <FinanceMetric
              icon={TrendingUp}
              label="本月结余"
              value={money(data.summary.net, masked)}
              tone="net"
            />
            <FinanceMetric
              icon={BellRing}
              label="兼职待收"
              value={money(data.summary.outstanding, masked)}
              tone="pending"
            />
            <FinanceMetric
              icon={PiggyBank}
              label="储蓄率"
              value={`${data.summary.savingsRate}%`}
              tone="saving"
            />
          </div>

          <div className="finance-overview-layout">
            <section className="finance-panel">
              <header>
                <div>
                  <span className="eyebrow">SPENDING STRUCTURE</span>
                  <h2>本月支出结构</h2>
                </div>
                <span>{data.summary.transactionCount} 笔账目</span>
              </header>
              <div className="finance-category-bars">
                {expenseByCategory.length ? (
                  expenseByCategory.slice(0, 8).map(([category, value]) => (
                    <div key={category}>
                      <span>{category}</span>
                      <i>
                        <b style={{ width: `${Math.max(5, (value / maxCategorySpend) * 100)}%` }} />
                      </i>
                      <strong>{money(value, masked)}</strong>
                    </div>
                  ))
                ) : (
                  <p className="finance-empty">记录支出后，这里会显示分类结构。</p>
                )}
              </div>
            </section>

            <section className="finance-panel">
              <header>
                <div>
                  <span className="eyebrow">ACCOUNT BALANCE</span>
                  <h2>账户余额</h2>
                </div>
                <button onClick={() => setTab("accounts")}>管理账户 <ChevronRight size={14} /></button>
              </header>
              <div className="finance-account-list">
                {data.accounts.filter((item) => !item.isArchived).map((account) => (
                  <div key={account.id}>
                    <i style={{ background: account.color }} />
                    <span>
                      <strong>{account.name}</strong>
                      <small>{account.type}</small>
                    </span>
                    <em>{money(account.balance, masked)}</em>
                  </div>
                ))}
              </div>
              <div className="finance-account-total">
                <span>账户总余额</span>
                <strong>
                  {money(
                    data.accounts.reduce((sum, item) => sum + item.balance, 0),
                    masked,
                  )}
                </strong>
              </div>
            </section>

            <section className="finance-panel wide">
              <header>
                <div>
                  <span className="eyebrow">RECENT LEDGER</span>
                  <h2>最近账目</h2>
                </div>
                <button onClick={() => setTab("ledger")}>继续记账 <Plus size={14} /></button>
              </header>
              <TransactionList
                transactions={data.transactions.slice(0, 8)}
                accounts={data.accounts}
                documents={data.documents}
                masked={masked}
                onAction={(item, action) => {
                  if (action === "edit") void editTransaction(item);
                  if (action === "refund") void offsetTransaction(item, "refund");
                  if (action === "reimburse") {
                    void offsetTransaction(item, "reimburse");
                  }
                  if (action === "split") void splitTransaction(item);
                }}
                onDelete={(id) => {
                  if (window.confirm("把这笔账目移入财务回收记录？")) {
                    void run("transaction.delete", { id }, "账目已移除。");
                  }
                }}
              />
            </section>
          </div>
        </>
      )}

      {tab === "ledger" && (
        <div className="ledger-layout">
          <section className="quick-ledger-card">
            <header>
              <div>
                <span className="eyebrow">5-SECOND ENTRY</span>
                <h2>快速记一笔</h2>
              </div>
              <Banknote size={23} />
            </header>
            <form onSubmit={createTransaction}>
              <div className="transaction-type-switch">
                {[
                  "支出",
                  "收入",
                  ...(data.settings.mode === "full" ? specialTypes : []),
                ].map((type) => (
                  <label key={type} className={transactionType === type ? "active" : ""}>
                    <input
                      type="radio"
                      name="type"
                      value={type}
                      checked={transactionType === type}
                      onChange={() => setTransactionType(type)}
                    />
                    {type}
                  </label>
                ))}
              </div>
              <label className="ledger-amount">
                <span>¥</span>
                <input name="amount" type="number" min="0.01" step="0.01" placeholder="0.00" required autoFocus />
              </label>
              {transactionType !== "转账" && (
                <label>
                  <span>分类</span>
                  <select name="category">
                    {(transactionDirection(transactionType) > 0
                      ? incomeCategories
                      : expenseCategories
                    ).map((item) => <option key={item}>{item}</option>)}
                  </select>
                </label>
              )}
              <label>
                <span>{transactionType === "转账" ? "转出账户" : "账户"}</span>
                <select name="accountId" required>
                  {data.accounts.filter((item) => !item.isArchived).map((item) => (
                    <option value={item.id} key={item.id}>{item.name}</option>
                  ))}
                </select>
              </label>
              {transactionType === "转账" && (
                <label>
                  <span>转入账户</span>
                  <select name="transferAccountId" required>
                    {data.accounts.filter((item) => !item.isArchived).map((item) => (
                      <option value={item.id} key={item.id}>{item.name}</option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                <span>时间</span>
                <input name="occurredAt" type="datetime-local" defaultValue={localDateTime()} />
              </label>
              <label>
                <span>关联项目</span>
                <input name="project" placeholder="旅行、学习、科研或其他项目" />
              </label>
              <label className="wide">
                <span>备注</span>
                <input name="note" placeholder="例如：学校附近晚饭" />
              </label>
              <label className="wide receipt-picker">
                <span><ReceiptText size={14} /> 照片或票据</span>
                <input name="receipt" type="file" accept="image/*,application/pdf" />
                <small>支持照片和 PDF，文件仅在你的私有空间中读取。</small>
              </label>
              <button className="primary-button wide" disabled={busy === "transaction.create"}>
                {busy === "transaction.create" ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}
                保存这笔账
              </button>
            </form>
          </section>
          <section className="ledger-history finance-panel">
            <header>
              <div>
                <span className="eyebrow">ALL TRANSACTIONS</span>
                <h2>完整账本</h2>
              </div>
              <span>{data.transactions.length} 笔</span>
            </header>
            <TransactionList
              transactions={data.transactions}
              accounts={data.accounts}
              documents={data.documents}
              masked={masked}
              onAction={(item, action) => {
                if (action === "edit") void editTransaction(item);
                if (action === "refund") void offsetTransaction(item, "refund");
                if (action === "reimburse") {
                  void offsetTransaction(item, "reimburse");
                }
                if (action === "split") void splitTransaction(item);
              }}
              onDelete={(id) => {
                if (window.confirm("把这笔账目移入财务回收记录？")) {
                  void run("transaction.delete", { id }, "账目已移除。");
                }
              }}
            />
          </section>
        </div>
      )}

      {tab === "accounts" && (
        <div className="finance-management-grid">
          <section className="finance-panel">
            <header><div><span className="eyebrow">ACCOUNTS</span><h2>我的账户</h2></div></header>
            <div className="account-card-grid">
              {data.accounts.map((account) => (
                <article key={account.id} style={{ "--account-color": account.color } as React.CSSProperties}>
                  <span><WalletCards size={18} /></span>
                  <div>
                    <small>{account.type}</small>
                    <h3>{account.name}</h3>
                  </div>
                  <strong>{money(account.balance, masked)}</strong>
                </article>
              ))}
            </div>
          </section>
          <section className="finance-form-panel">
            <h2>新增账户</h2>
            <p>账户之间的转账不会被重复统计为收入或支出。</p>
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                await run("account.create", Object.fromEntries(form.entries()), "新账户已创建。");
                event.currentTarget.reset();
              }}
            >
              <label><span>账户名称</span><input name="name" placeholder="例如：兼职收款账户" required /></label>
              <label><span>账户类型</span><select name="type">{["现金", "微信", "支付宝", "银行卡", "信用卡", "储蓄账户", "兼职收款账户", "虚拟账户", "自定义账户"].map((item) => <option key={item}>{item}</option>)}</select></label>
              <label><span>初始余额</span><input name="initialBalance" type="number" min="0" step="0.01" defaultValue="0" /></label>
              <label><span>识别颜色</span><input name="color" type="color" defaultValue="#76528b" /></label>
              <button className="primary-button"><Plus size={15} /> 新增账户</button>
            </form>
          </section>
        </div>
      )}

      {tab === "budget" && (
        <div className="finance-management-grid">
          <section className="finance-panel">
            <header><div><span className="eyebrow">MONTHLY BUDGET</span><h2>{data.summary.month} 月度预算</h2></div></header>
            <div className="budget-list">
              {monthBudgets.length ? monthBudgets.map((budget) => {
                const spent = expenseByCategory.find(([category]) => category === budget.category)?.[1] || 0;
                const progress = budget.amount > 0 ? Math.round((spent / budget.amount) * 100) : 0;
                return (
                  <article key={budget.id}>
                    <header><strong>{budget.category}</strong><span>{money(spent, masked)} / {money(budget.amount, masked)}</span></header>
                    <i><b className={progress > 100 ? "over" : ""} style={{ width: `${Math.min(100, progress)}%` }} /></i>
                    <footer><span>已使用 {progress}%</span><em>{progress > 100 ? `超出 ${money(spent - budget.amount, masked)}` : `剩余 ${money(budget.amount - spent, masked)}`}</em></footer>
                  </article>
                );
              }) : <p className="finance-empty">设置分类预算后，可以比较预算与实际支出。</p>}
            </div>
          </section>
          <section className="finance-form-panel">
            <h2>设置分类预算</h2>
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                await run("budget.upsert", Object.fromEntries(form.entries()), "预算已更新。");
                event.currentTarget.reset();
              }}
            >
              <label><span>月份</span><input name="month" type="month" defaultValue={data.summary.month || currentMonth()} /></label>
              <label><span>分类</span><select name="category">{expenseCategories.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label><span>预算金额</span><input name="amount" type="number" min="0" step="0.01" required /></label>
              <label><span>备注</span><input name="note" placeholder="可选" /></label>
              <button className="primary-button"><Target size={15} /> 保存预算</button>
            </form>
          </section>
          {data.settings.mode === "full" && (
            <section className="finance-panel recurring-panel">
              <header>
                <div><span className="eyebrow">RECURRING BILLS</span><h2>周期账单</h2></div>
                <span>{data.recurring.length} 项</span>
              </header>
              <div className="recurring-layout">
                <div className="recurring-list">
                  {data.recurring.length ? data.recurring.map((item) => (
                    <article key={item.id}>
                      <span><BellRing size={15} /></span>
                      <div><strong>{item.title}</strong><small>{item.frequency} · 下次 {new Date(item.nextAt).toLocaleDateString("zh-CN")}</small></div>
                      <em>{money(item.amount, masked)}</em>
                    </article>
                  )) : <p className="finance-empty">添加房租、会员、软件等周期账单，避免遗漏。</p>}
                </div>
                <form
                  onSubmit={async (event) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    await run("recurring.create", Object.fromEntries(form.entries()), "周期账单已保存。");
                    event.currentTarget.reset();
                  }}
                >
                  <input name="title" placeholder="账单名称" required />
                  <input name="amount" type="number" min="0" step="0.01" placeholder="金额" required />
                  <select name="category">{expenseCategories.map((item) => <option key={item}>{item}</option>)}</select>
                  <select name="accountId">{data.accounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
                  <select name="frequency">{["每周", "每月", "每季度", "每年"].map((item) => <option key={item}>{item}</option>)}</select>
                  <input name="nextAt" type="date" required />
                  <button className="primary-button"><Plus size={14} /> 添加周期账单</button>
                </form>
              </div>
            </section>
          )}
        </div>
      )}

      {tab === "savings" && (
        <div className="finance-management-grid">
          <section className="finance-panel">
            <header><div><span className="eyebrow">SAVINGS GOALS</span><h2>储蓄目标</h2></div></header>
            <div className="savings-goal-list">
              {data.savingsGoals.length ? data.savingsGoals.map((goal) => {
                const progress = goal.targetAmount > 0 ? Math.round((goal.savedAmount / goal.targetAmount) * 100) : 0;
                return (
                  <article key={goal.id}>
                    <span style={{ color: goal.color, background: `${goal.color}15` }}><PiggyBank size={20} /></span>
                    <div>
                      <header><strong>{goal.title}</strong><em>{progress}%</em></header>
                      <p>{money(goal.savedAmount, masked)} / {money(goal.targetAmount, masked)}</p>
                      <i><b style={{ width: `${Math.min(100, progress)}%`, background: goal.color }} /></i>
                      <small>{goal.targetAt ? `${new Date(goal.targetAt).toLocaleDateString("zh-CN")}前` : "未设置目标日期"} · 还差 {money(Math.max(0, goal.targetAmount - goal.savedAmount), masked)}</small>
                    </div>
                    <button
                      onClick={() => {
                        const value = window.prompt(`向“${goal.title}”增加储蓄金额`);
                        if (value) void run("savings.deposit", { id: goal.id, amount: value }, "储蓄进度已更新。");
                      }}
                    >
                      <Plus size={14} /> 存一笔
                    </button>
                  </article>
                );
              }) : <p className="finance-empty">建立一个愿望目标，让兼职收入和日常储蓄有明确去处。</p>}
            </div>
          </section>
          <section className="finance-form-panel">
            <h2>新建储蓄目标</h2>
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                await run("savings.create", Object.fromEntries(form.entries()), "储蓄目标已创建。");
                event.currentTarget.reset();
              }}
            >
              <label><span>目标名称</span><input name="title" placeholder="例如：新电脑" required /></label>
              <label><span>目标金额</span><input name="targetAmount" type="number" min="0" step="0.01" required /></label>
              <label><span>当前已存</span><input name="savedAmount" type="number" min="0" step="0.01" defaultValue="0" /></label>
              <label><span>目标日期</span><input name="targetAt" type="date" /></label>
              <label><span>识别颜色</span><input name="color" type="color" defaultValue="#76528b" /></label>
              <button className="primary-button"><PiggyBank size={15} /> 创建目标</button>
            </form>
          </section>
        </div>
      )}

      <div className="finance-security-note">
        <ShieldCheck size={17} />
        <p>
          财务和兼职金额默认不进入普通生活总结；使用“隐藏金额”后，两个模块及首页概览都会统一模糊显示。
        </p>
      </div>
    </section>
  );
}

function FinanceMetric({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof TrendingUp;
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <article className={`finance-metric tone-${tone}`}>
      <span><Icon size={18} /></span>
      <small>{label}</small>
      <strong>{value}</strong>
    </article>
  );
}

function TransactionList({
  transactions,
  accounts,
  documents,
  masked,
  onDelete,
  onAction,
}: {
  transactions: FinanceData["transactions"];
  accounts: FinanceData["accounts"];
  documents: FinanceData["documents"];
  masked: boolean;
  onDelete: (id: string) => void;
  onAction: (
    item: FinanceData["transactions"][number],
    action: "edit" | "refund" | "reimburse" | "split",
  ) => void;
}) {
  if (!transactions.length) {
    return <p className="finance-empty">还没有账目，从记录今天的第一笔开始。</p>;
  }
  return (
    <div className="transaction-list">
      {transactions.map((item) => {
        const direction = transactionDirection(item.type);
        const account = accounts.find((candidate) => candidate.id === item.accountId);
        const target = accounts.find((candidate) => candidate.id === item.transferAccountId);
        const document = documents.find(
          (candidate) => candidate.transactionId === item.id,
        );
        return (
          <article key={item.id}>
            <span className={`transaction-icon direction-${direction}`}>
              {direction > 0 ? <ArrowDownLeft size={16} /> : direction < 0 ? <ArrowUpRight size={16} /> : <ArrowLeftRight size={16} />}
            </span>
            <div>
              <strong>{item.category}</strong>
              <p>{item.note || item.project || `${account?.name || "账户"}${target ? ` → ${target.name}` : ""}`}</p>
              <small>
                {new Date(item.occurredAt).toLocaleString("zh-CN")} · {item.type}
                {document ? (
                  <> · <a href={document.url} target="_blank" rel="noreferrer">查看票据</a></>
                ) : null}
              </small>
            </div>
            <em className={`direction-${direction}`}>
              {direction > 0 ? "+" : direction < 0 ? "−" : ""}
              {money(item.amount, masked)}
            </em>
            {item.receivableId || item.workSessionId ? (
              <span
                className="linked-transaction"
                title="由兼职打卡或收款中心自动生成"
              >
                联动
              </span>
            ) : (
              <div className="transaction-row-actions">
                <button
                  onClick={() => onAction(item, "edit")}
                  aria-label="编辑账目"
                  title="编辑"
                >
                  <Pencil size={12} />
                </button>
                {["支出", "预付款", "应付"].includes(item.type) && (
                  <>
                    <button
                      onClick={() => onAction(item, "refund")}
                      aria-label="记录退款"
                      title="退款"
                    >
                      <RotateCcw size={12} />
                    </button>
                    <button
                      onClick={() => onAction(item, "reimburse")}
                      aria-label="记录报销"
                      title="报销"
                    >
                      <ReceiptText size={12} />
                    </button>
                  </>
                )}
                <button
                  onClick={() => onAction(item, "split")}
                  aria-label="拆分账目"
                  title="拆分"
                >
                  <Scissors size={12} />
                </button>
                <button onClick={() => onDelete(item.id)} aria-label="删除账目">
                  <Trash2 size={12} />
                </button>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
