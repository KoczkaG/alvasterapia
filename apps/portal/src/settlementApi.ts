import type {
  Deduction,
  DepositPayment,
  ReconciliationResult,
  SettlementResult,
  WearTimeRule,
} from '@somnoshop/shared';

const BASE = '/api';
const OP = (op: string) => ({
  'Content-Type': 'application/json',
  'X-Operator': op,
});

async function handle<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(body?.error?.message ?? `Hiba (${res.status}).`);
  }
  return body as T;
}

export async function getWearTimeRules(): Promise<WearTimeRule[]> {
  return handle<WearTimeRule[]>(await fetch(`${BASE}/settlement/wear-time-rules`));
}

export async function setWearTimeRule(
  rule: WearTimeRule,
  operator: string,
): Promise<WearTimeRule> {
  return handle(
    await fetch(`${BASE}/settlement/wear-time-rules`, {
      method: 'POST',
      headers: OP(operator),
      body: JSON.stringify(rule),
    }),
  );
}

export interface EligibilityResult {
  productType: string;
  purchaseDate: string;
  eligibleFrom: string | null;
  eligibleNow: boolean;
}

export async function checkEligibility(params: {
  purchaseDate: string;
  productType: string;
  today?: string;
}): Promise<EligibilityResult> {
  const q = new URLSearchParams({
    purchaseDate: params.purchaseDate,
    productType: params.productType,
  });
  if (params.today) q.set('today', params.today);
  return handle<EligibilityResult>(await fetch(`${BASE}/settlement/eligibility?${q}`));
}

export interface DepositSettlementResponse {
  id: string;
  partnerCode: string;
  result: SettlementResult;
  notified: boolean;
}

export async function createDepositSettlement(
  body: { partnerCode: string; payments: DepositPayment[]; deductions: Deduction[] },
  operator: string,
): Promise<DepositSettlementResponse> {
  return handle(
    await fetch(`${BASE}/settlement/deposit`, {
      method: 'POST',
      headers: OP(operator),
      body: JSON.stringify(body),
    }),
  );
}

export async function reconcileOep(
  body: { date: string; kvlCounts: { productType: string; count: number }[] },
  operator: string,
): Promise<ReconciliationResult & { id: string; date: string }> {
  return handle(
    await fetch(`${BASE}/settlement/oep-reconcile`, {
      method: 'POST',
      headers: OP(operator),
      body: JSON.stringify(body),
    }),
  );
}
