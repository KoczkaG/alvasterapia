import type {
  BillingCodeKind,
  CreateDraft,
  HealthFund,
  InvoiceItem,
  InvoicePayee,
  PaymentMethod,
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

export interface CodeValidation {
  valid: boolean;
  message?: string;
  duplicate?: boolean;
}

export async function validateCode(
  kind: BillingCodeKind,
  code: string,
  existing?: string[],
): Promise<CodeValidation> {
  return handle<CodeValidation>(
    await fetch(`${BASE}/invoicing/validate-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, code, existing }),
    }),
  );
}

export interface DraftRecord {
  id: string;
  partnerCode: string;
  items: InvoiceItem[];
  payment: PaymentMethod;
  amountGross: number;
  payee: InvoicePayee | null;
  prescription: boolean;
  eanCode: string | null;
  status: string;
  invoiceNumber: string | null;
  pdfUri: string | null;
}

export async function getHealthFunds(): Promise<HealthFund[]> {
  return handle<HealthFund[]>(await fetch(`${BASE}/invoicing/health-funds`));
}

export interface FinalizeResult {
  status: 'issued' | 'declined';
  draft: DraftRecord;
  declineReason?: string;
}

export async function createDraft(
  input: CreateDraft,
  operator: string,
): Promise<DraftRecord> {
  return handle<DraftRecord>(
    await fetch(`${BASE}/invoicing/drafts`, {
      method: 'POST',
      headers: OP(operator),
      body: JSON.stringify(input),
    }),
  );
}

export async function finalizeDraft(
  id: string,
  operator: string,
): Promise<FinalizeResult> {
  return handle<FinalizeResult>(
    await fetch(`${BASE}/invoicing/drafts/${id}/finalize`, {
      method: 'POST',
      headers: OP(operator),
    }),
  );
}
