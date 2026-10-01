export type CaptureField = { label: string; value: string };
export type CapturePreview = {
  kind: "schedule" | "life" | "income";
  title: string;
  destination: string;
  fields: CaptureField[];
  warnings: string[];
  payload: string;
  signature: string;
  expiresAt: number;
  requiresFinancialConsent: boolean;
};

export function needsFinancialApproval(value: string) {
  return /收入|工资|到账|收款|金额|赚了|赚到|应收|待收|支出|账户余额|[￥¥]|\d\s*(?:元|块钱|人民币)/.test(value);
}
