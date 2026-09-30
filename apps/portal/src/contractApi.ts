import type {
  ContractItem,
  ContractPatient,
  GdprConsent,
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

export interface WarrantyDoc {
  serialNumber: string;
  productType: string;
  warrantyExpiry: string;
  uri: string;
}

export interface ContractRecord {
  id: string;
  partnerCode: string;
  status: 'draft' | 'gdpr_ok' | 'cart' | 'paid' | 'signed' | 'closed';
  patient: ContractPatient;
  purchaseDate: string;
  gdprConsent: GdprConsent | null;
  items: ContractItem[];
  totalDeposit: number;
  totalPrice: number;
  grandTotal: number;
  signatureMethod: 'sms' | 'paper' | null;
  contractPdfUri: string | null;
  warrantyDocs: WarrantyDoc[];
}

export async function scanSheet(documentRef: string): Promise<ContractPatient> {
  return handle(
    await fetch(`${BASE}/contracts/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentRef }),
    }),
  );
}

export async function createContract(
  body: { partnerCode: string; patient: ContractPatient; purchaseDate: string },
  op: string,
): Promise<ContractRecord> {
  return handle(
    await fetch(`${BASE}/contracts`, {
      method: 'POST',
      headers: OP(op),
      body: JSON.stringify(body),
    }),
  );
}

export async function recordConsent(
  id: string,
  consent: GdprConsent,
  op: string,
): Promise<ContractRecord> {
  return handle(
    await fetch(`${BASE}/contracts/${id}/consent`, {
      method: 'POST',
      headers: OP(op),
      body: JSON.stringify(consent),
    }),
  );
}

export async function setCart(
  id: string,
  items: ContractItem[],
  op: string,
): Promise<ContractRecord> {
  return handle(
    await fetch(`${BASE}/contracts/${id}/cart`, {
      method: 'POST',
      headers: OP(op),
      body: JSON.stringify({ items }),
    }),
  );
}

export async function pay(
  id: string,
  op: string,
): Promise<{ status: 'paid' | 'declined'; contract: ContractRecord; declineReason?: string }> {
  return handle(
    await fetch(`${BASE}/contracts/${id}/pay`, { method: 'POST', headers: OP(op) }),
  );
}

export async function requestSms(id: string): Promise<{ challengeId: string }> {
  return handle(
    await fetch(`${BASE}/contracts/${id}/sign/sms`, { method: 'POST' }),
  );
}

export async function confirmSms(
  id: string,
  challengeId: string,
  code: string,
  op: string,
): Promise<ContractRecord> {
  return handle(
    await fetch(`${BASE}/contracts/${id}/sign/sms/confirm`, {
      method: 'POST',
      headers: OP(op),
      body: JSON.stringify({ challengeId, code }),
    }),
  );
}

export async function signPaper(id: string, op: string): Promise<ContractRecord> {
  return handle(
    await fetch(`${BASE}/contracts/${id}/sign/paper`, { method: 'POST', headers: OP(op) }),
  );
}

export async function closeContract(id: string, op: string): Promise<ContractRecord> {
  return handle(
    await fetch(`${BASE}/contracts/${id}/close`, { method: 'POST', headers: OP(op) }),
  );
}
