import { getLifeBindings } from "../../../lib/life-store";
import {
  ensureFinanceSchema,
  materializeRecurringTransactions,
} from "../../../lib/finance-store";

type JsonObject = Record<string, unknown>;

function text(value: unknown, max = 1000) {
  return String(value ?? "").trim().slice(0, max);
}

function amount(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100) / 100) : 0;
}

function integer(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

function iso(value: unknown, fallback = new Date()) {
  const parsed = new Date(String(value ?? ""));
  return Number.isNaN(parsed.getTime()) ? fallback.toISOString() : parsed.toISOString();
}

function currentMonth() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function receivableStatus(due: number, received: number, dueAt: string | null) {
  if (due <= 0) return "已取消";
  if (received >= due) return "已到账";
  if (received > 0) return "部分到账";
  if (dueAt && new Date(dueAt).getTime() < Date.now()) return "已逾期";
  return "待结算";
}

async function settleReceivable(
  DB: D1Database,
  payload: {
    receivableId: string;
    amount: number;
    accountId: string;
    receivedAt: string;
    note: string;
  },
) {
  const receivable = await DB.prepare(
    `SELECT r.id, r.amount_due, r.amount_received, r.project_id,
            r.work_session_id, p.title AS project_title
     FROM receivables r
     JOIN side_hustle_projects p ON p.id = r.project_id
     WHERE r.id = ?`,
  )
    .bind(payload.receivableId)
    .first<{
      id: string;
      amount_due: number;
      amount_received: number;
      project_id: string;
      work_session_id: string | null;
      project_title: string;
    }>();
  if (!receivable) throw new Error("没有找到这笔应收款。");
  const remaining = Math.max(
    0,
    Number(receivable.amount_due) - Number(receivable.amount_received),
  );
  const paid = Math.min(remaining, payload.amount);
  if (paid <= 0) throw new Error("到账金额必须大于 0。");
  const settlementId = crypto.randomUUID();
  const transactionId = crypto.randomUUID();
  const nextReceived = Number(receivable.amount_received) + paid;
  const status = receivableStatus(
    Number(receivable.amount_due),
    nextReceived,
    null,
  );
  await DB.batch([
    DB.prepare(
      `INSERT INTO finance_transactions
       (id, type, amount, category, account_id, project,
        side_hustle_project_id, work_session_id, receivable_id,
        occurred_at, note, is_private)
       VALUES (?, '收入', ?, '兼职', ?, ?, ?, ?, ?, ?, ?, 1)`,
    ).bind(
      transactionId,
      paid,
      payload.accountId || null,
      receivable.project_title,
      receivable.project_id,
      receivable.work_session_id,
      receivable.id,
      payload.receivedAt,
      payload.note || `${receivable.project_title}兼职到账`,
    ),
    DB.prepare(
      `INSERT INTO settlements
       (id, receivable_id, account_id, transaction_id, amount, received_at, note)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      settlementId,
      receivable.id,
      payload.accountId || null,
      transactionId,
      paid,
      payload.receivedAt,
      payload.note,
    ),
    DB.prepare(
      `UPDATE receivables
       SET amount_received = ?, status = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).bind(nextReceived, status, receivable.id),
  ]);
  return { settlementId, transactionId, amount: paid, status };
}

export async function GET() {
  try {
    await ensureFinanceSchema();
    await materializeRecurringTransactions();
    const { DB } = getLifeBindings();
    await DB.prepare(
      `UPDATE receivables
       SET status = '已逾期', updated_at = CURRENT_TIMESTAMP
       WHERE status NOT IN ('已到账', '已取消')
         AND amount_received < amount_due
         AND due_at IS NOT NULL AND due_at < ?`,
    )
      .bind(new Date().toISOString())
      .run();
    const [
      accountsResult,
      transactionsResult,
      budgetsResult,
      savingsResult,
      projectsResult,
      sessionsResult,
      receivablesResult,
      settlementsResult,
      clientsResult,
      settingsResult,
      recurringResult,
      documentsResult,
    ] = await DB.batch([
      DB.prepare("SELECT * FROM financial_accounts ORDER BY created_at ASC"),
      DB.prepare(
        `SELECT * FROM finance_transactions
         WHERE deleted_at IS NULL
         ORDER BY occurred_at DESC LIMIT 1500`,
      ),
      DB.prepare("SELECT * FROM finance_budgets ORDER BY month DESC, category ASC"),
      DB.prepare("SELECT * FROM savings_goals ORDER BY created_at DESC"),
      DB.prepare(
        `SELECT p.*, c.name AS client_name
         FROM side_hustle_projects p
         LEFT JOIN side_hustle_clients c ON c.id = p.client_id
         ORDER BY p.updated_at DESC`,
      ),
      DB.prepare(
        `SELECT ws.*, p.title AS project_title
         FROM work_sessions ws
         JOIN side_hustle_projects p ON p.id = ws.project_id
         ORDER BY ws.started_at DESC LIMIT 1000`,
      ),
      DB.prepare(
        `SELECT r.*, p.title AS project_title, c.name AS client_name
         FROM receivables r
         JOIN side_hustle_projects p ON p.id = r.project_id
         LEFT JOIN side_hustle_clients c ON c.id = r.client_id
         ORDER BY r.created_at DESC LIMIT 1000`,
      ),
      DB.prepare(
        "SELECT * FROM settlements ORDER BY received_at DESC LIMIT 1000",
      ),
      DB.prepare("SELECT * FROM side_hustle_clients ORDER BY updated_at DESC"),
      DB.prepare("SELECT * FROM finance_settings WHERE id = 'default'"),
      DB.prepare(
        "SELECT * FROM recurring_transactions ORDER BY next_at ASC",
      ),
      DB.prepare(
        "SELECT * FROM finance_documents ORDER BY created_at DESC LIMIT 500",
      ),
    ]);

    const transactions = transactionsResult.results as JsonObject[];
    const accounts = (accountsResult.results as JsonObject[]).map((row) => {
      let balance = Number(row.initial_balance) || 0;
      for (const transaction of transactions) {
        const value = Number(transaction.amount) || 0;
        if (transaction.type === "转账") {
          if (transaction.account_id === row.id) balance -= value;
          if (transaction.transfer_account_id === row.id) balance += value;
        } else if (
          ["收入", "退款", "报销", "借入"].includes(String(transaction.type)) &&
          transaction.account_id === row.id
        ) {
          balance += value;
        } else if (
          ["支出", "借出", "预付款", "应付"].includes(String(transaction.type)) &&
          transaction.account_id === row.id
        ) {
          balance -= value;
        }
      }
      return {
        id: row.id,
        name: row.name,
        type: row.type,
        color: row.color,
        initialBalance: row.initial_balance,
        balance: Math.round(balance * 100) / 100,
        isArchived: Boolean(row.is_archived),
      };
    });

    const month = currentMonth();
    const monthTransactions = transactions.filter((item) =>
      String(item.occurred_at).startsWith(month),
    );
    const totalIncome = monthTransactions
      .filter((item) => ["收入", "退款", "报销", "借入"].includes(String(item.type)))
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const totalExpense = monthTransactions
      .filter((item) => ["支出", "借出", "预付款", "应付"].includes(String(item.type)))
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const categorySpend = new Map<string, number>();
    for (const item of monthTransactions) {
      if (!["支出", "预付款", "应付"].includes(String(item.type))) continue;
      const category = String(item.category || "其他");
      categorySpend.set(category, (categorySpend.get(category) ?? 0) + Number(item.amount || 0));
    }
    const receivableRows = receivablesResult.results as JsonObject[];
    const outstanding = receivableRows.reduce(
      (sum, row) =>
        sum + Math.max(0, Number(row.amount_due) - Number(row.amount_received)),
      0,
    );
    const sessionRows = sessionsResult.results as JsonObject[];
    const monthSessions = sessionRows.filter((item) =>
      String(item.started_at).startsWith(month),
    );
    const expectedSideIncome = monthSessions.reduce(
      (sum, item) => sum + Number(item.expected_income || 0),
      0,
    );
    const sideCosts = monthSessions.reduce(
      (sum, item) => sum + Number(item.cost || 0),
      0,
    );
    const sideIncome = monthTransactions
      .filter((item) => item.type === "收入" && item.side_hustle_project_id)
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const workMinutes = monthSessions.reduce(
      (sum, item) =>
        sum + Number(item.minutes || 0) + Number(item.hidden_minutes || 0),
      0,
    );

    return Response.json({
      accounts,
      transactions: transactions.map((row) => ({
        id: row.id,
        type: row.type,
        amount: row.amount,
        category: row.category,
        accountId: row.account_id,
        transferAccountId: row.transfer_account_id,
        project: row.project,
        sideHustleProjectId: row.side_hustle_project_id,
        workSessionId: row.work_session_id,
        receivableId: row.receivable_id,
        relatedTransactionId: row.related_transaction_id,
        splitGroupId: row.split_group_id,
        recurringTransactionId: row.recurring_transaction_id,
        occurredAt: row.occurred_at,
        note: row.note,
        isPrivate: Boolean(row.is_private),
      })),
      budgets: (budgetsResult.results as JsonObject[]).map((row) => ({
        id: row.id,
        month: row.month,
        category: row.category,
        amount: row.amount,
        note: row.note,
      })),
      savingsGoals: (savingsResult.results as JsonObject[]).map((row) => ({
        id: row.id,
        title: row.title,
        targetAmount: row.target_amount,
        savedAmount: row.saved_amount,
        targetAt: row.target_at,
        color: row.color,
      })),
      projects: (projectsResult.results as JsonObject[]).map((row) => ({
        id: row.id,
        title: row.title,
        kind: row.kind,
        clientId: row.client_id,
        clientName: row.client_name,
        billingMode: row.billing_mode,
        unitRate: row.unit_rate,
        settlementCycle: row.settlement_cycle,
        status: row.status,
        incomeTarget: row.income_target,
        startAt: row.start_at,
        note: row.note,
        color: row.color,
      })),
      workSessions: sessionRows.map((row) => ({
        id: row.id,
        projectId: row.project_id,
        projectTitle: row.project_title,
        scheduleId: row.schedule_id,
        startedAt: row.started_at,
        endedAt: row.ended_at,
        minutes: row.minutes,
        hiddenMinutes: row.hidden_minutes,
        pausedAt: row.paused_at,
        pausedMinutes: row.paused_minutes,
        workContent: row.work_content,
        result: row.result,
        place: row.place,
        expectedIncome: row.expected_income,
        cost: row.cost,
        feeling: row.feeling,
        status: row.status,
        lifeEventId: row.life_event_id,
      })),
      receivables: receivableRows.map((row) => ({
        id: row.id,
        projectId: row.project_id,
        projectTitle: row.project_title,
        clientId: row.client_id,
        clientName: row.client_name,
        workSessionId: row.work_session_id,
        amountDue: row.amount_due,
        amountReceived: row.amount_received,
        dueAt: row.due_at,
        status:
          row.status === "已取消"
            ? "已取消"
            : receivableStatus(
                Number(row.amount_due),
                Number(row.amount_received),
                row.due_at ? String(row.due_at) : null,
              ),
        note: row.note,
      })),
      settlements: (settlementsResult.results as JsonObject[]).map((row) => ({
        id: row.id,
        receivableId: row.receivable_id,
        accountId: row.account_id,
        transactionId: row.transaction_id,
        amount: row.amount,
        receivedAt: row.received_at,
        note: row.note,
      })),
      clients: (clientsResult.results as JsonObject[]).map((row) => ({
        id: row.id,
        name: row.name,
        contact: row.contact,
        paymentHabit: row.payment_habit,
        note: row.note,
        nextFollowUpAt: row.next_follow_up_at,
      })),
      recurring: (recurringResult.results as JsonObject[]).map((row) => ({
        id: row.id,
        title: row.title,
        type: row.type,
        amount: row.amount,
        category: row.category,
        accountId: row.account_id,
        frequency: row.frequency,
        nextAt: row.next_at,
        enabled: Boolean(row.enabled),
      })),
      documents: (documentsResult.results as JsonObject[]).map((row) => ({
        id: row.id,
        transactionId: row.transaction_id,
        settlementId: row.settlement_id,
        kind: row.kind,
        filename: row.filename,
        contentType: row.content_type,
        size: row.size,
        url: `/api/finance/documents/${row.id}`,
      })),
      settings: settingsResult.results[0]
        ? {
            mode: (settingsResult.results[0] as JsonObject).mode,
            maskAmounts: Boolean((settingsResult.results[0] as JsonObject).mask_amounts),
            showInTimeline: (settingsResult.results[0] as JsonObject).show_in_timeline,
          }
        : { mode: "simple", maskAmounts: false, showInTimeline: "summary" },
      summary: {
        month,
        totalIncome: Math.round(totalIncome * 100) / 100,
        totalExpense: Math.round(totalExpense * 100) / 100,
        net: Math.round((totalIncome - totalExpense) * 100) / 100,
        savingsRate:
          totalIncome > 0
            ? Math.round(((totalIncome - totalExpense) / totalIncome) * 1000) / 10
            : 0,
        sideIncome: Math.round(sideIncome * 100) / 100,
        expectedSideIncome: Math.round(expectedSideIncome * 100) / 100,
        outstanding: Math.round(outstanding * 100) / 100,
        sideCosts: Math.round(sideCosts * 100) / 100,
        sideNet: Math.round((sideIncome - sideCosts) * 100) / 100,
        workMinutes,
        effectiveHourly:
          workMinutes > 0
            ? Math.round(((sideIncome - sideCosts) / workMinutes) * 6000) / 100
            : 0,
        topExpenseCategory:
          [...categorySpend.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "暂无",
        transactionCount: monthTransactions.length,
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "读取财务数据失败。" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    await ensureFinanceSchema();
    const { DB } = getLifeBindings();
    const body = (await request.json()) as JsonObject;
    const action = text(body.action, 80);
    const payload = (body.payload ?? {}) as JsonObject;

    if (action === "account.create") {
      const id = crypto.randomUUID();
      await DB.prepare(
        `INSERT INTO financial_accounts
         (id, name, type, color, initial_balance)
         VALUES (?, ?, ?, ?, ?)`,
      )
        .bind(
          id,
          text(payload.name, 100) || "新账户",
          text(payload.type, 40) || "自定义账户",
          text(payload.color, 20) || "#76528b",
          amount(payload.initialBalance),
        )
        .run();
      return Response.json({ id }, { status: 201 });
    }

    if (action === "transaction.create") {
      const type = text(payload.type, 30) || "支出";
      const value = amount(payload.amount);
      if (value <= 0) return Response.json({ error: "金额必须大于 0。" }, { status: 400 });
      if (type === "转账" && text(payload.accountId) === text(payload.transferAccountId)) {
        return Response.json({ error: "转出和转入账户不能相同。" }, { status: 400 });
      }
      const id = crypto.randomUUID();
      await DB.prepare(
        `INSERT INTO finance_transactions
         (id, type, amount, category, account_id, transfer_account_id,
          project, side_hustle_project_id, occurred_at, note, is_private)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      )
        .bind(
          id,
          type,
          value,
          text(payload.category, 80) || "其他",
          text(payload.accountId, 80) || null,
          text(payload.transferAccountId, 80) || null,
          text(payload.project, 160),
          text(payload.sideHustleProjectId, 80) || null,
          iso(payload.occurredAt),
          text(payload.note, 1000),
        )
        .run();
      return Response.json({ id }, { status: 201 });
    }

    if (action === "transaction.update") {
      const id = text(payload.id, 80);
      const current = await DB.prepare(
        `SELECT id, receivable_id, work_session_id
         FROM finance_transactions
         WHERE id = ? AND deleted_at IS NULL`,
      )
        .bind(id)
        .first<{
          id: string;
          receivable_id: string | null;
          work_session_id: string | null;
        }>();
      if (!current) {
        return Response.json({ error: "没有找到这笔账。" }, { status: 404 });
      }
      if (current.receivable_id || current.work_session_id) {
        return Response.json(
          { error: "联动兼职结算的账目需要在收款中心修改。" },
          { status: 409 },
        );
      }
      const type = text(payload.type, 30) || "支出";
      const value = amount(payload.amount);
      if (value <= 0) {
        return Response.json({ error: "金额必须大于 0。" }, { status: 400 });
      }
      const accountId = text(payload.accountId, 80);
      const transferAccountId = text(payload.transferAccountId, 80);
      if (type === "转账" && accountId === transferAccountId) {
        return Response.json(
          { error: "转出和转入账户不能相同。" },
          { status: 400 },
        );
      }
      await DB.prepare(
        `UPDATE finance_transactions SET
           type = ?, amount = ?, category = ?, account_id = ?,
           transfer_account_id = ?, project = ?, occurred_at = ?, note = ?,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
        .bind(
          type,
          value,
          text(payload.category, 80) || "其他",
          accountId || null,
          transferAccountId || null,
          text(payload.project, 160),
          iso(payload.occurredAt),
          text(payload.note, 1000),
          id,
        )
        .run();
      return Response.json({ id });
    }

    if (
      action === "transaction.refund" ||
      action === "transaction.reimburse"
    ) {
      const originalId = text(payload.id, 80);
      const original = await DB.prepare(
        `SELECT id, type, amount, category, account_id, project,
                side_hustle_project_id, occurred_at
         FROM finance_transactions
         WHERE id = ? AND deleted_at IS NULL`,
      )
        .bind(originalId)
        .first<{
          id: string;
          type: string;
          amount: number;
          category: string;
          account_id: string | null;
          project: string;
          side_hustle_project_id: string | null;
          occurred_at: string;
        }>();
      if (!original) {
        return Response.json({ error: "没有找到原始支出。" }, { status: 404 });
      }
      if (!["支出", "预付款", "应付"].includes(original.type)) {
        return Response.json(
          { error: "只有支出、预付款和应付款可以退款或报销。" },
          { status: 400 },
        );
      }
      const newType = action === "transaction.refund" ? "退款" : "报销";
      const already = await DB.prepare(
        `SELECT COALESCE(SUM(amount), 0) AS value
         FROM finance_transactions
         WHERE related_transaction_id = ? AND type = ?
           AND deleted_at IS NULL`,
      )
        .bind(originalId, newType)
        .first<{ value: number }>();
      const remaining = Math.max(
        0,
        Number(original.amount) - Number(already?.value || 0),
      );
      const value = Math.min(remaining, amount(payload.amount));
      if (value <= 0) {
        return Response.json(
          { error: `这笔支出已经没有可${newType}金额。` },
          { status: 400 },
        );
      }
      const id = crypto.randomUUID();
      await DB.prepare(
        `INSERT INTO finance_transactions
         (id, type, amount, category, account_id, project,
          side_hustle_project_id, related_transaction_id, occurred_at,
          note, is_private)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      )
        .bind(
          id,
          newType,
          value,
          original.category,
          text(payload.accountId, 80) || original.account_id,
          original.project,
          original.side_hustle_project_id,
          original.id,
          iso(payload.occurredAt),
          text(payload.note, 1000) || `${original.category}${newType}`,
        )
        .run();
      return Response.json(
        { id, relatedTransactionId: original.id, amount: value },
        { status: 201 },
      );
    }

    if (action === "transaction.split") {
      const id = text(payload.id, 80);
      const original = await DB.prepare(
        `SELECT * FROM finance_transactions
         WHERE id = ? AND deleted_at IS NULL`,
      )
        .bind(id)
        .first<JsonObject>();
      if (!original) {
        return Response.json({ error: "没有找到要拆分的账目。" }, { status: 404 });
      }
      if (original.receivable_id || original.work_session_id) {
        return Response.json(
          { error: "兼职联动账目不能在普通账本中拆分。" },
          { status: 409 },
        );
      }
      const parts = (Array.isArray(payload.parts) ? payload.parts : [])
        .filter(
          (part): part is JsonObject =>
            Boolean(part) && typeof part === "object" && !Array.isArray(part),
        )
        .slice(0, 20);
      const total = parts.reduce((sum, part) => sum + amount(part.amount), 0);
      if (
        parts.length < 2 ||
        Math.abs(total - Number(original.amount || 0)) > 0.009
      ) {
        return Response.json(
          { error: "至少需要两项，且拆分金额之和必须等于原金额。" },
          { status: 400 },
        );
      }
      const statements = parts.map((part) =>
        DB.prepare(
          `INSERT INTO finance_transactions
           (id, type, amount, category, account_id, transfer_account_id,
            project, side_hustle_project_id, related_transaction_id,
            split_group_id, occurred_at, note, is_private)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          crypto.randomUUID(),
          original.type,
          amount(part.amount),
          text(part.category, 80) || String(original.category),
          original.account_id,
          original.transfer_account_id,
          original.project,
          original.side_hustle_project_id,
          id,
          id,
          original.occurred_at,
          text(part.note, 1000) || String(original.note || ""),
          original.is_private,
        ),
      );
      statements.push(
        DB.prepare(
          `UPDATE finance_transactions
           SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
        ).bind(id),
      );
      await DB.batch(statements);
      return Response.json({ id, splitCount: parts.length });
    }

    if (action === "transaction.delete") {
      const linked = await DB.prepare(
        `SELECT receivable_id, work_session_id
         FROM finance_transactions WHERE id = ?`,
      )
        .bind(text(payload.id, 80))
        .first<{
          receivable_id: string | null;
          work_session_id: string | null;
        }>();
      if (linked?.receivable_id || linked?.work_session_id) {
        return Response.json(
          { error: "这笔账由兼职结算自动生成，请在收款中心处理。" },
          { status: 409 },
        );
      }
      const related = await DB.prepare(
        `SELECT COUNT(*) AS value FROM finance_transactions
         WHERE related_transaction_id = ? AND deleted_at IS NULL`,
      )
        .bind(text(payload.id, 80))
        .first<{ value: number }>();
      if (Number(related?.value || 0) > 0) {
        return Response.json(
          { error: "这笔账已有退款、报销或拆分记录，请先处理关联账目。" },
          { status: 409 },
        );
      }
      await DB.prepare(
        "UPDATE finance_transactions SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?",
      )
        .bind(text(payload.id, 80))
        .run();
      return new Response(null, { status: 204 });
    }

    if (action === "budget.upsert") {
      const month = text(payload.month, 7) || currentMonth();
      const category = text(payload.category, 80) || "其他";
      const id = crypto.randomUUID();
      await DB.prepare(
        `INSERT INTO finance_budgets (id, month, category, amount, note)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(month, category) DO UPDATE SET
           amount = excluded.amount,
           note = excluded.note,
           updated_at = CURRENT_TIMESTAMP`,
      )
        .bind(id, month, category, amount(payload.amount), text(payload.note, 500))
        .run();
      return Response.json({ id }, { status: 201 });
    }

    if (action === "savings.create") {
      const id = crypto.randomUUID();
      await DB.prepare(
        `INSERT INTO savings_goals
         (id, title, target_amount, saved_amount, target_at, color)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          id,
          text(payload.title, 160) || "新的储蓄目标",
          amount(payload.targetAmount),
          amount(payload.savedAmount),
          payload.targetAt ? iso(payload.targetAt) : null,
          text(payload.color, 20) || "#76528b",
        )
        .run();
      return Response.json({ id }, { status: 201 });
    }

    if (action === "savings.deposit") {
      await DB.prepare(
        `UPDATE savings_goals
         SET saved_amount = saved_amount + ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
        .bind(amount(payload.amount), text(payload.id, 80))
        .run();
      return Response.json({ id: payload.id });
    }

    if (action === "recurring.create") {
      const id = crypto.randomUUID();
      await DB.prepare(
        `INSERT INTO recurring_transactions
         (id, title, type, amount, category, account_id, frequency, next_at, enabled)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      )
        .bind(
          id,
          text(payload.title, 160) || "周期账单",
          text(payload.type, 30) || "支出",
          amount(payload.amount),
          text(payload.category, 80) || "订阅服务",
          text(payload.accountId, 80) || null,
          text(payload.frequency, 30) || "每月",
          iso(payload.nextAt),
        )
        .run();
      return Response.json({ id }, { status: 201 });
    }

    if (action === "client.create") {
      const id = crypto.randomUUID();
      await DB.prepare(
        `INSERT INTO side_hustle_clients
         (id, name, contact, payment_habit, note, next_follow_up_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          id,
          text(payload.name, 160) || "未命名客户",
          text(payload.contact, 300),
          text(payload.paymentHabit, 300),
          text(payload.note, 1000),
          payload.nextFollowUpAt ? iso(payload.nextFollowUpAt) : null,
        )
        .run();
      return Response.json({ id }, { status: 201 });
    }

    if (action === "client.update") {
      const id = text(payload.id, 80);
      await DB.prepare(
        `UPDATE side_hustle_clients
         SET name = COALESCE(NULLIF(?, ''), name),
             contact = COALESCE(?, contact),
             payment_habit = COALESCE(?, payment_habit),
             note = COALESCE(?, note),
             next_follow_up_at = COALESCE(?, next_follow_up_at)
         WHERE id = ?`,
      )
        .bind(
          text(payload.name, 160),
          payload.contact === undefined ? null : text(payload.contact, 300),
          payload.paymentHabit === undefined
            ? null
            : text(payload.paymentHabit, 300),
          payload.note === undefined ? null : text(payload.note, 1000),
          payload.nextFollowUpAt === undefined
            ? null
            : payload.nextFollowUpAt
              ? iso(payload.nextFollowUpAt)
              : null,
          id,
        )
        .run();
      return Response.json({ id });
    }

    if (action === "client.delete") {
      const id = text(payload.id, 80);
      const related = await DB.prepare(
        "SELECT COUNT(*) AS count FROM side_hustle_projects WHERE client_id = ?",
      )
        .bind(id)
        .first<{ count: number }>();
      if (Number(related?.count) > 0) {
        return Response.json(
          { error: "请先删除或修改该客户关联的兼职项目。" },
          { status: 409 },
        );
      }
      await DB.prepare("DELETE FROM side_hustle_clients WHERE id = ?")
        .bind(id)
        .run();
      return new Response(null, { status: 204 });
    }

    if (action === "sideProject.create") {
      const id = crypto.randomUUID();
      let clientId = text(payload.clientId, 80);
      const clientName = text(payload.clientName, 160);
      if (!clientId && clientName) {
        clientId = crypto.randomUUID();
        await DB.prepare(
          `INSERT INTO side_hustle_clients (id, name, contact)
           VALUES (?, ?, ?)`,
        )
          .bind(clientId, clientName, text(payload.clientContact, 300))
          .run();
      }
      await DB.prepare(
        `INSERT INTO side_hustle_projects
         (id, title, kind, client_id, billing_mode, unit_rate,
          settlement_cycle, status, income_target, start_at, note, color)
         VALUES (?, ?, ?, ?, ?, ?, ?, '进行中', ?, ?, ?, ?)`,
      )
        .bind(
          id,
          text(payload.title, 180) || "新的兼职项目",
          text(payload.kind, 60) || "兼职",
          clientId || null,
          text(payload.billingMode, 60) || "按小时",
          amount(payload.unitRate),
          text(payload.settlementCycle, 80) || "每次结束",
          amount(payload.incomeTarget),
          payload.startAt ? iso(payload.startAt) : new Date().toISOString(),
          text(payload.note, 1000),
          text(payload.color, 20) || "#477c6a",
        )
        .run();
      return Response.json({ id, clientId }, { status: 201 });
    }

    if (action === "session.start") {
      const projectId = text(payload.projectId, 80);
      if (!projectId) return Response.json({ error: "请选择兼职项目。" }, { status: 400 });
      const id = crypto.randomUUID();
      await DB.prepare(
        `INSERT INTO work_sessions
         (id, project_id, schedule_id, started_at, work_content, place, status)
         VALUES (?, ?, ?, ?, ?, ?, '进行中')`,
      )
        .bind(
          id,
          projectId,
          text(payload.scheduleId, 80) || null,
          iso(payload.startedAt),
          text(payload.workContent, 1200),
          text(payload.place, 200),
        )
        .run();
      return Response.json({ id }, { status: 201 });
    }

    if (action === "sideProject.update") {
      const id = text(payload.id, 80);
      const current = await DB.prepare(
        "SELECT * FROM side_hustle_projects WHERE id = ?",
      )
        .bind(id)
        .first<Record<string, unknown>>();
      if (!current) {
        return Response.json({ error: "没有找到这个兼职项目。" }, { status: 404 });
      }
      await DB.prepare(
        `UPDATE side_hustle_projects
         SET title = ?, kind = ?, client_id = ?, billing_mode = ?,
             unit_rate = ?, settlement_cycle = ?, status = ?,
             income_target = ?, start_at = ?, note = ?, color = ?
         WHERE id = ?`,
      )
        .bind(
          text(payload.title, 200) || String(current.title),
          text(payload.kind, 80) || String(current.kind),
          payload.clientId === undefined
            ? current.client_id
            : text(payload.clientId, 80) || null,
          text(payload.billingMode, 80) || String(current.billing_mode),
          payload.unitRate === undefined
            ? Number(current.unit_rate)
            : amount(payload.unitRate),
          text(payload.settlementCycle, 100) ||
            String(current.settlement_cycle),
          text(payload.status, 40) || String(current.status),
          payload.incomeTarget === undefined
            ? Number(current.income_target)
            : amount(payload.incomeTarget),
          payload.startAt === undefined
            ? current.start_at
            : payload.startAt
              ? iso(payload.startAt)
              : null,
          payload.note === undefined ? current.note : text(payload.note, 2000),
          text(payload.color, 30) || String(current.color),
          id,
        )
        .run();
      return Response.json({ id });
    }

    if (action === "sideProject.delete") {
      const id = text(payload.id, 80);
      const active = await DB.prepare(
        `SELECT COUNT(*) AS count FROM work_sessions
         WHERE project_id = ? AND status IN ('进行中', '暂停')`,
      )
        .bind(id)
        .first<{ count: number }>();
      if (Number(active?.count) > 0) {
        return Response.json(
          { error: "这个项目仍有正在计时的工作，请先结束打卡。" },
          { status: 409 },
        );
      }
      await DB.prepare("DELETE FROM side_hustle_projects WHERE id = ?")
        .bind(id)
        .run();
      return new Response(null, { status: 204 });
    }

    if (action === "session.pause") {
      const id = text(payload.id, 80);
      await DB.prepare(
        `UPDATE work_sessions
         SET status = '暂停', paused_at = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = '进行中'`,
      )
        .bind(new Date().toISOString(), id)
        .run();
      return Response.json({ id, status: "暂停" });
    }

    if (action === "session.resume") {
      const id = text(payload.id, 80);
      const session = await DB.prepare(
        `SELECT paused_at, paused_minutes FROM work_sessions
         WHERE id = ? AND status = '暂停'`,
      )
        .bind(id)
        .first<{ paused_at: string | null; paused_minutes: number }>();
      if (!session) {
        return Response.json({ error: "没有找到暂停中的打卡。" }, { status: 404 });
      }
      const pausedNow = session.paused_at
        ? Math.max(
            0,
            Math.round(
              (Date.now() - new Date(session.paused_at).getTime()) / 60000,
            ),
          )
        : 0;
      await DB.prepare(
        `UPDATE work_sessions
         SET status = '进行中', paused_at = NULL, paused_minutes = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
        .bind(Number(session.paused_minutes || 0) + pausedNow, id)
        .run();
      return Response.json({ id, status: "进行中" });
    }

    if (action === "session.stop" || action === "session.create") {
      const sessionId =
        action === "session.stop" ? text(payload.id, 80) : crypto.randomUUID();
      let projectId = text(payload.projectId, 80);
      let startedAt = iso(payload.startedAt);
      let endedAt = iso(payload.endedAt);
      let pausedMinutes = 0;
      if (action === "session.stop") {
        const session = await DB.prepare(
          `SELECT project_id, started_at, status, paused_at, paused_minutes
           FROM work_sessions WHERE id = ?`,
        )
          .bind(sessionId)
          .first<{
            project_id: string;
            started_at: string;
            status: string;
            paused_at: string | null;
            paused_minutes: number;
          }>();
        if (!session) return Response.json({ error: "没有找到正在进行的打卡。" }, { status: 404 });
        projectId = session.project_id;
        startedAt = session.started_at;
        endedAt = iso(payload.endedAt);
        pausedMinutes =
          Number(session.paused_minutes || 0) +
          (session.status === "暂停" && session.paused_at
            ? Math.max(
                0,
                Math.round(
                  (new Date(endedAt).getTime() -
                    new Date(session.paused_at).getTime()) /
                    60000,
                ),
              )
            : 0);
      }
      const project = await DB.prepare(
        `SELECT id, title, client_id, billing_mode, unit_rate
         FROM side_hustle_projects WHERE id = ?`,
      )
        .bind(projectId)
        .first<{
          id: string;
          title: string;
          client_id: string | null;
          billing_mode: string;
          unit_rate: number;
        }>();
      if (!project) return Response.json({ error: "没有找到兼职项目。" }, { status: 404 });
      const financeSettings = await DB.prepare(
        "SELECT show_in_timeline FROM finance_settings WHERE id = 'default'",
      ).first<{ show_in_timeline: string }>();
      const timelineMode = financeSettings?.show_in_timeline || "summary";
      const calculatedMinutes = Math.max(
        0,
        Math.round(
          (new Date(endedAt).getTime() - new Date(startedAt).getTime()) /
            60000,
        ) - pausedMinutes,
      );
      const minutes = integer(payload.minutes) || calculatedMinutes;
      const hiddenMinutes = integer(payload.hiddenMinutes);
      const expected =
        amount(payload.expectedIncome) ||
        (project.billing_mode === "按小时"
          ? Math.round((Number(project.unit_rate) * (minutes + hiddenMinutes)) / 60 * 100) / 100
          : Number(project.unit_rate));
      const cost = amount(payload.cost);
      const lifeEventId = crypto.randomUUID();
      const workContent = text(payload.workContent, 1200);
      const result = text(payload.result, 1200);
      const feeling = text(payload.feeling, 500);
      const receivableId = crypto.randomUUID();
      const dueAt = payload.dueAt
        ? iso(payload.dueAt)
        : new Date(new Date(endedAt).getTime() + 7 * 86400000).toISOString();
      const statements = [];
      if (action === "session.stop") {
        statements.push(
          DB.prepare(
            `UPDATE work_sessions SET
               ended_at = ?, minutes = ?, hidden_minutes = ?, work_content = ?,
               result = ?, place = ?, expected_income = ?, cost = ?, feeling = ?,
               status = '已完成', paused_at = NULL, paused_minutes = ?,
               life_event_id = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
          ).bind(
            endedAt,
            minutes,
            hiddenMinutes,
            workContent,
            result,
            text(payload.place, 200),
            expected,
            cost,
            feeling,
            pausedMinutes,
            lifeEventId,
            sessionId,
          ),
        );
      } else {
        statements.push(
          DB.prepare(
            `INSERT INTO work_sessions
             (id, project_id, schedule_id, started_at, ended_at, minutes,
              hidden_minutes, work_content, result, place, expected_income,
              cost, feeling, status, life_event_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '已完成', ?)`,
          ).bind(
            sessionId,
            projectId,
            text(payload.scheduleId, 80) || null,
            startedAt,
            endedAt,
            minutes,
            hiddenMinutes,
            workContent,
            result,
            text(payload.place, 200),
            expected,
            cost,
            feeling,
            lifeEventId,
          ),
        );
      }
      statements.unshift(
        DB.prepare(
          `INSERT INTO life_events
           (id, title, content, kind, mood, energy, tags, person, place,
            project, happened_at)
           VALUES (?, ?, ?, '兼职', ?, 3, ?, '', ?, ?, ?)`,
        ).bind(
          lifeEventId,
          `完成兼职：${project.title}`,
          [
            workContent || `完成 ${minutes} 分钟工作`,
            result ? `成果：${result}` : "",
            timelineMode === "amount"
              ? `本次应赚 ¥${expected.toFixed(2)}`
              : timelineMode === "summary"
                ? "本次收益已记录在兼职中心"
                : "",
            feeling ? `感受：${feeling}` : "",
          ]
            .filter(Boolean)
            .join("\n"),
          text(payload.mood, 20) || "平静",
          JSON.stringify(["兼职打卡", project.title]),
          text(payload.place, 200),
          project.title,
          endedAt,
        ),
      );
      statements.push(
        DB.prepare(
          `INSERT INTO receivables
           (id, project_id, client_id, work_session_id, amount_due,
            amount_received, due_at, status, note)
           VALUES (?, ?, ?, ?, ?, 0, ?, '待结算', ?)`,
        ).bind(
          receivableId,
          projectId,
          project.client_id,
          sessionId,
          expected,
          dueAt,
          text(payload.receivableNote, 500),
        ),
      );
      if (cost > 0 && text(payload.costAccountId, 80)) {
        statements.push(
          DB.prepare(
            `INSERT INTO finance_transactions
             (id, type, amount, category, account_id, project,
              side_hustle_project_id, work_session_id, occurred_at, note, is_private)
             VALUES (?, '支出', ?, '兼职成本', ?, ?, ?, ?, ?, ?, 1)`,
          ).bind(
            crypto.randomUUID(),
            cost,
            text(payload.costAccountId, 80),
            project.title,
            projectId,
            sessionId,
            endedAt,
            text(payload.costNote, 500) || `${project.title}兼职成本`,
          ),
        );
      }
      await DB.batch(statements);
      const paidNow = amount(payload.paidAmount);
      let settlement = null;
      if (paidNow > 0) {
        settlement = await settleReceivable(DB, {
          receivableId,
          amount: paidNow,
          accountId: text(payload.paidAccountId, 80),
          receivedAt: endedAt,
          note: `${project.title}完成后即时到账`,
        });
      }
      return Response.json(
        { id: sessionId, receivableId, expectedIncome: expected, settlement },
        { status: action === "session.create" ? 201 : 200 },
      );
    }

    if (action === "settlement.create") {
      const result = await settleReceivable(DB, {
        receivableId: text(payload.receivableId, 80),
        amount: amount(payload.amount),
        accountId: text(payload.accountId, 80),
        receivedAt: iso(payload.receivedAt),
        note: text(payload.note, 500),
      });
      return Response.json(result, { status: 201 });
    }

    if (action === "receivable.cancel") {
      await DB.prepare(
        `UPDATE receivables
         SET status = '已取消', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      )
        .bind(text(payload.id, 80))
        .run();
      return Response.json({ id: payload.id });
    }

    if (action === "settings.update") {
      await DB.prepare(
        `UPDATE finance_settings SET
           mode = ?, mask_amounts = ?, show_in_timeline = ?,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = 'default'`,
      )
        .bind(
          text(payload.mode, 20) || "simple",
          payload.maskAmounts ? 1 : 0,
          text(payload.showInTimeline, 20) || "summary",
        )
        .run();
      return Response.json({ id: "default" });
    }

    return Response.json({ error: "未知的财务操作。" }, { status: 400 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "财务操作失败。" },
      { status: 500 },
    );
  }
}
