import { ensureAdvancedSchema } from "./advanced-store";
import { getLifeBindings } from "./life-store";

let financeSchemaPromise: Promise<unknown> | null = null;

export async function ensureFinanceSchema() {
  await ensureAdvancedSchema();
  if (financeSchemaPromise) return financeSchemaPromise;
  const { DB } = getLifeBindings();
  financeSchemaPromise = (async () => {
    await DB.batch([
      DB.prepare(`
        CREATE TABLE IF NOT EXISTS financial_accounts (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          type TEXT NOT NULL DEFAULT '现金',
          color TEXT NOT NULL DEFAULT '#76528b',
          initial_balance REAL NOT NULL DEFAULT 0,
          is_archived INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `),
      DB.prepare(`
        CREATE TABLE IF NOT EXISTS side_hustle_clients (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          contact TEXT NOT NULL DEFAULT '',
          payment_habit TEXT NOT NULL DEFAULT '',
          note TEXT NOT NULL DEFAULT '',
          next_follow_up_at TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `),
      DB.prepare(`
        CREATE TABLE IF NOT EXISTS side_hustle_projects (
          id TEXT PRIMARY KEY NOT NULL,
          title TEXT NOT NULL,
          kind TEXT NOT NULL DEFAULT '兼职',
          client_id TEXT,
          billing_mode TEXT NOT NULL DEFAULT '按小时',
          unit_rate REAL NOT NULL DEFAULT 0,
          settlement_cycle TEXT NOT NULL DEFAULT '每次结束',
          status TEXT NOT NULL DEFAULT '进行中',
          income_target REAL NOT NULL DEFAULT 0,
          start_at TEXT,
          note TEXT NOT NULL DEFAULT '',
          color TEXT NOT NULL DEFAULT '#477c6a',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (client_id) REFERENCES side_hustle_clients(id) ON DELETE SET NULL
        )
      `),
      DB.prepare(`
        CREATE TABLE IF NOT EXISTS work_sessions (
          id TEXT PRIMARY KEY NOT NULL,
          project_id TEXT NOT NULL,
          schedule_id TEXT,
          started_at TEXT NOT NULL,
          ended_at TEXT,
          minutes INTEGER NOT NULL DEFAULT 0,
          hidden_minutes INTEGER NOT NULL DEFAULT 0,
          paused_at TEXT,
          paused_minutes INTEGER NOT NULL DEFAULT 0,
          work_content TEXT NOT NULL DEFAULT '',
          result TEXT NOT NULL DEFAULT '',
          place TEXT NOT NULL DEFAULT '',
          expected_income REAL NOT NULL DEFAULT 0,
          cost REAL NOT NULL DEFAULT 0,
          feeling TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT '进行中',
          life_event_id TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (project_id) REFERENCES side_hustle_projects(id) ON DELETE CASCADE,
          FOREIGN KEY (life_event_id) REFERENCES life_events(id) ON DELETE SET NULL
        )
      `),
      DB.prepare(`
        CREATE TABLE IF NOT EXISTS receivables (
          id TEXT PRIMARY KEY NOT NULL,
          project_id TEXT NOT NULL,
          client_id TEXT,
          work_session_id TEXT,
          amount_due REAL NOT NULL DEFAULT 0,
          amount_received REAL NOT NULL DEFAULT 0,
          due_at TEXT,
          status TEXT NOT NULL DEFAULT '待结算',
          note TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (project_id) REFERENCES side_hustle_projects(id) ON DELETE CASCADE,
          FOREIGN KEY (client_id) REFERENCES side_hustle_clients(id) ON DELETE SET NULL,
          FOREIGN KEY (work_session_id) REFERENCES work_sessions(id) ON DELETE SET NULL
        )
      `),
      DB.prepare(`
        CREATE TABLE IF NOT EXISTS finance_transactions (
          id TEXT PRIMARY KEY NOT NULL,
          type TEXT NOT NULL DEFAULT '支出',
          amount REAL NOT NULL,
          category TEXT NOT NULL DEFAULT '其他',
          account_id TEXT,
          transfer_account_id TEXT,
          project TEXT NOT NULL DEFAULT '',
          side_hustle_project_id TEXT,
          work_session_id TEXT,
          receivable_id TEXT,
          related_transaction_id TEXT,
          split_group_id TEXT,
          recurring_transaction_id TEXT,
          occurred_at TEXT NOT NULL,
          note TEXT NOT NULL DEFAULT '',
          is_private INTEGER NOT NULL DEFAULT 1,
          deleted_at TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (account_id) REFERENCES financial_accounts(id) ON DELETE SET NULL,
          FOREIGN KEY (transfer_account_id) REFERENCES financial_accounts(id) ON DELETE SET NULL,
          FOREIGN KEY (side_hustle_project_id) REFERENCES side_hustle_projects(id) ON DELETE SET NULL,
          FOREIGN KEY (work_session_id) REFERENCES work_sessions(id) ON DELETE SET NULL,
          FOREIGN KEY (receivable_id) REFERENCES receivables(id) ON DELETE SET NULL
        )
      `),
      DB.prepare(`
        CREATE TABLE IF NOT EXISTS settlements (
          id TEXT PRIMARY KEY NOT NULL,
          receivable_id TEXT NOT NULL,
          account_id TEXT,
          transaction_id TEXT,
          amount REAL NOT NULL,
          received_at TEXT NOT NULL,
          note TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (receivable_id) REFERENCES receivables(id) ON DELETE CASCADE,
          FOREIGN KEY (account_id) REFERENCES financial_accounts(id) ON DELETE SET NULL,
          FOREIGN KEY (transaction_id) REFERENCES finance_transactions(id) ON DELETE SET NULL
        )
      `),
      DB.prepare(`
        CREATE TABLE IF NOT EXISTS finance_budgets (
          id TEXT PRIMARY KEY NOT NULL,
          month TEXT NOT NULL,
          category TEXT NOT NULL,
          amount REAL NOT NULL DEFAULT 0,
          note TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(month, category)
        )
      `),
      DB.prepare(`
        CREATE TABLE IF NOT EXISTS savings_goals (
          id TEXT PRIMARY KEY NOT NULL,
          title TEXT NOT NULL,
          target_amount REAL NOT NULL DEFAULT 0,
          saved_amount REAL NOT NULL DEFAULT 0,
          target_at TEXT,
          color TEXT NOT NULL DEFAULT '#76528b',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `),
      DB.prepare(`
        CREATE TABLE IF NOT EXISTS recurring_transactions (
          id TEXT PRIMARY KEY NOT NULL,
          title TEXT NOT NULL,
          type TEXT NOT NULL DEFAULT '支出',
          amount REAL NOT NULL DEFAULT 0,
          category TEXT NOT NULL DEFAULT '订阅服务',
          account_id TEXT,
          frequency TEXT NOT NULL DEFAULT '每月',
          next_at TEXT NOT NULL,
          enabled INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (account_id) REFERENCES financial_accounts(id) ON DELETE SET NULL
        )
      `),
      DB.prepare(`
        CREATE TABLE IF NOT EXISTS finance_documents (
          id TEXT PRIMARY KEY NOT NULL,
          transaction_id TEXT,
          settlement_id TEXT,
          kind TEXT NOT NULL DEFAULT '票据',
          object_key TEXT NOT NULL UNIQUE,
          filename TEXT NOT NULL,
          content_type TEXT NOT NULL,
          size INTEGER NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (transaction_id) REFERENCES finance_transactions(id) ON DELETE CASCADE,
          FOREIGN KEY (settlement_id) REFERENCES settlements(id) ON DELETE CASCADE
        )
      `),
      DB.prepare(`
        CREATE TABLE IF NOT EXISTS finance_settings (
          id TEXT PRIMARY KEY NOT NULL,
          mode TEXT NOT NULL DEFAULT 'simple',
          mask_amounts INTEGER NOT NULL DEFAULT 0,
          show_in_timeline TEXT NOT NULL DEFAULT 'summary',
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `),
      DB.prepare(
        "CREATE INDEX IF NOT EXISTS side_hustle_projects_client_idx ON side_hustle_projects(client_id)",
      ),
      DB.prepare(
        "CREATE INDEX IF NOT EXISTS work_sessions_project_idx ON work_sessions(project_id)",
      ),
      DB.prepare(
        "CREATE INDEX IF NOT EXISTS work_sessions_started_idx ON work_sessions(started_at)",
      ),
      DB.prepare(
        "CREATE INDEX IF NOT EXISTS receivables_project_idx ON receivables(project_id)",
      ),
      DB.prepare(
        "CREATE INDEX IF NOT EXISTS receivables_status_idx ON receivables(status)",
      ),
      DB.prepare(
        "CREATE INDEX IF NOT EXISTS finance_transactions_occurred_idx ON finance_transactions(occurred_at)",
      ),
      DB.prepare(
        "CREATE INDEX IF NOT EXISTS finance_transactions_account_idx ON finance_transactions(account_id)",
      ),
      DB.prepare(
        "CREATE INDEX IF NOT EXISTS finance_transactions_side_project_idx ON finance_transactions(side_hustle_project_id)",
      ),
      DB.prepare(
        "CREATE INDEX IF NOT EXISTS settlements_receivable_idx ON settlements(receivable_id)",
      ),
    ]);
    for (const statement of [
      "ALTER TABLE work_sessions ADD COLUMN paused_at TEXT",
      "ALTER TABLE work_sessions ADD COLUMN paused_minutes INTEGER NOT NULL DEFAULT 0",
      "ALTER TABLE finance_transactions ADD COLUMN related_transaction_id TEXT",
      "ALTER TABLE finance_transactions ADD COLUMN split_group_id TEXT",
      "ALTER TABLE finance_transactions ADD COLUMN recurring_transaction_id TEXT",
    ]) {
      try {
        await DB.prepare(statement).run();
      } catch (error) {
        if (!String(error).toLowerCase().includes("duplicate column")) {
          throw error;
        }
      }
    }
    await DB.batch([
      DB.prepare(
        "CREATE INDEX IF NOT EXISTS finance_transactions_related_idx ON finance_transactions(related_transaction_id)",
      ),
      DB.prepare(
        "CREATE INDEX IF NOT EXISTS finance_transactions_split_idx ON finance_transactions(split_group_id)",
      ),
      DB.prepare(
        `CREATE UNIQUE INDEX IF NOT EXISTS finance_transactions_recurring_occurrence_unique
         ON finance_transactions(recurring_transaction_id, occurred_at)`,
      ),
    ]);
    await DB.batch([
      DB.prepare(
        `INSERT OR IGNORE INTO financial_accounts
         (id, name, type, color, initial_balance)
         VALUES ('account-cash', '现金', '现金', '#9a7651', 0)`,
      ),
      DB.prepare(
        `INSERT OR IGNORE INTO financial_accounts
         (id, name, type, color, initial_balance)
         VALUES ('account-wechat', '微信', '虚拟账户', '#4f9473', 0)`,
      ),
      DB.prepare(
        `INSERT OR IGNORE INTO financial_accounts
         (id, name, type, color, initial_balance)
         VALUES ('account-alipay', '支付宝', '虚拟账户', '#4d82b2', 0)`,
      ),
      DB.prepare(
        `INSERT OR IGNORE INTO financial_accounts
         (id, name, type, color, initial_balance)
         VALUES ('account-bank', '银行卡', '银行卡', '#76528b', 0)`,
      ),
      DB.prepare(
        `INSERT OR IGNORE INTO finance_settings
         (id, mode, mask_amounts, show_in_timeline)
         VALUES ('default', 'simple', 0, 'summary')`,
      ),
    ]);
  })();
  return financeSchemaPromise;
}

function nextRecurringDate(value: string, frequency: string) {
  const next = new Date(value);
  if (frequency === "每天") next.setDate(next.getDate() + 1);
  else if (frequency === "每周") next.setDate(next.getDate() + 7);
  else if (frequency === "每年") next.setFullYear(next.getFullYear() + 1);
  else next.setMonth(next.getMonth() + 1);
  return next.toISOString();
}

export async function materializeRecurringTransactions(now = new Date()) {
  await ensureFinanceSchema();
  const { DB } = getLifeBindings();
  const due = await DB.prepare(
    `SELECT id, title, type, amount, category, account_id, frequency, next_at
     FROM recurring_transactions
     WHERE enabled = 1 AND next_at <= ?
     ORDER BY next_at ASC LIMIT 100`,
  )
    .bind(now.toISOString())
    .all<{
      id: string;
      title: string;
      type: string;
      amount: number;
      category: string;
      account_id: string | null;
      frequency: string;
      next_at: string;
    }>();
  let created = 0;
  for (const rule of due.results) {
    let occurrence = rule.next_at;
    let guard = 0;
    while (new Date(occurrence) <= now && guard < 100) {
      const result = await DB.prepare(
        `INSERT OR IGNORE INTO finance_transactions
         (id, type, amount, category, account_id, recurring_transaction_id,
          occurred_at, note, is_private)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      )
        .bind(
          crypto.randomUUID(),
          rule.type,
          rule.amount,
          rule.category,
          rule.account_id,
          rule.id,
          occurrence,
          `周期账单：${rule.title}`,
        )
        .run();
      created += Number(result.meta.changes || 0);
      occurrence = nextRecurringDate(occurrence, rule.frequency);
      guard += 1;
    }
    await DB.prepare(
      `UPDATE recurring_transactions
       SET next_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    )
      .bind(occurrence, rule.id)
      .run();
  }
  return { created };
}
