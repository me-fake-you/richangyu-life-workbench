export type FinancialAccount = {
  id: string;
  name: string;
  type: string;
  color: string;
  initialBalance: number;
  balance: number;
  isArchived: boolean;
};

export type FinanceTransaction = {
  id: string;
  type: string;
  amount: number;
  category: string;
  accountId: string | null;
  transferAccountId: string | null;
  project: string;
  sideHustleProjectId: string | null;
  workSessionId: string | null;
  receivableId: string | null;
  relatedTransactionId: string | null;
  splitGroupId: string | null;
  recurringTransactionId: string | null;
  occurredAt: string;
  note: string;
  isPrivate: boolean;
};

export type FinanceBudget = {
  id: string;
  month: string;
  category: string;
  amount: number;
  note: string;
};

export type SavingsGoal = {
  id: string;
  title: string;
  targetAmount: number;
  savedAmount: number;
  targetAt: string | null;
  color: string;
};

export type SideHustleProject = {
  id: string;
  title: string;
  kind: string;
  clientId: string | null;
  clientName: string | null;
  billingMode: string;
  unitRate: number;
  settlementCycle: string;
  status: string;
  incomeTarget: number;
  startAt: string | null;
  note: string;
  color: string;
};

export type WorkSession = {
  id: string;
  projectId: string;
  projectTitle: string;
  scheduleId: string | null;
  startedAt: string;
  endedAt: string | null;
  minutes: number;
  hiddenMinutes: number;
  pausedAt: string | null;
  pausedMinutes: number;
  workContent: string;
  result: string;
  place: string;
  expectedIncome: number;
  cost: number;
  feeling: string;
  status: string;
  lifeEventId: string | null;
};

export type Receivable = {
  id: string;
  projectId: string;
  projectTitle: string;
  clientId: string | null;
  clientName: string | null;
  workSessionId: string | null;
  amountDue: number;
  amountReceived: number;
  dueAt: string | null;
  status: string;
  note: string;
};

export type Settlement = {
  id: string;
  receivableId: string;
  accountId: string | null;
  transactionId: string | null;
  amount: number;
  receivedAt: string;
  note: string;
};

export type SideHustleClient = {
  id: string;
  name: string;
  contact: string;
  paymentHabit: string;
  note: string;
  nextFollowUpAt: string | null;
};

export type FinanceSummary = {
  month: string;
  totalIncome: number;
  totalExpense: number;
  net: number;
  savingsRate: number;
  sideIncome: number;
  expectedSideIncome: number;
  outstanding: number;
  sideCosts: number;
  sideNet: number;
  workMinutes: number;
  effectiveHourly: number;
  topExpenseCategory: string;
  transactionCount: number;
};

export type RecurringTransaction = {
  id: string;
  title: string;
  type: string;
  amount: number;
  category: string;
  accountId: string | null;
  frequency: string;
  nextAt: string;
  enabled: boolean;
};

export type FinanceDocument = {
  id: string;
  transactionId: string | null;
  settlementId: string | null;
  kind: string;
  filename: string;
  contentType: string;
  size: number;
  url: string;
};

export type FinanceData = {
  accounts: FinancialAccount[];
  transactions: FinanceTransaction[];
  budgets: FinanceBudget[];
  savingsGoals: SavingsGoal[];
  projects: SideHustleProject[];
  workSessions: WorkSession[];
  receivables: Receivable[];
  settlements: Settlement[];
  clients: SideHustleClient[];
  recurring: RecurringTransaction[];
  documents: FinanceDocument[];
  settings: {
    mode: "simple" | "full";
    maskAmounts: boolean;
    showInTimeline: "amount" | "summary" | "hidden";
  };
  summary: FinanceSummary;
};

export const emptyFinanceData: FinanceData = {
  accounts: [],
  transactions: [],
  budgets: [],
  savingsGoals: [],
  projects: [],
  workSessions: [],
  receivables: [],
  settlements: [],
  clients: [],
  recurring: [],
  documents: [],
  settings: {
    mode: "simple",
    maskAmounts: false,
    showInTimeline: "summary",
  },
  summary: {
    month: "",
    totalIncome: 0,
    totalExpense: 0,
    net: 0,
    savingsRate: 0,
    sideIncome: 0,
    expectedSideIncome: 0,
    outstanding: 0,
    sideCosts: 0,
    sideNet: 0,
    workMinutes: 0,
    effectiveHourly: 0,
    topExpenseCategory: "暂无",
    transactionCount: 0,
  },
};

export async function financeAction(
  action: string,
  payload: Record<string, unknown>,
) {
  const response = await fetch("/api/finance", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, payload }),
  });
  const body =
    response.status === 204
      ? {}
      : ((await response.json()) as Record<string, unknown>);
  if (!response.ok) throw new Error(String(body.error || "操作失败。"));
  return body;
}
