import type { RequiredContactField, SelfServiceUpdate } from '@somnoshop/shared';

const BASE = '/api';
const OPERATOR_HEADERS = (op: string) => ({
  'Content-Type': 'application/json',
  'X-Operator': op,
});

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? `Hiba (${res.status}).`);
  }
  return res.json() as Promise<T>;
}

export interface CheckResponse {
  partnerCode: string;
  complete: boolean;
  missing: RequiredContactField[];
}

export async function checkCompleteness(
  partnerCode: string,
): Promise<CheckResponse> {
  return handle<CheckResponse>(
    await fetch(`${BASE}/completeness/${encodeURIComponent(partnerCode)}`),
  );
}

export async function updateInPlace(
  partnerCode: string,
  data: SelfServiceUpdate,
  operator: string,
): Promise<CheckResponse> {
  return handle<CheckResponse>(
    await fetch(`${BASE}/completeness/${encodeURIComponent(partnerCode)}/update`, {
      method: 'POST',
      headers: OPERATOR_HEADERS(operator),
      body: JSON.stringify(data),
    }),
  );
}

export async function issueLink(
  partnerCode: string,
  operator: string,
): Promise<{ token: string; url: string; expiresAt: string }> {
  return handle(
    await fetch(`${BASE}/completeness/${encodeURIComponent(partnerCode)}/link`, {
      method: 'POST',
      headers: OPERATOR_HEADERS(operator),
    }),
  );
}

// --- betegoldali önkiszolgáló ---

export interface ResolveTokenResponse {
  partnerCode: string;
  missing: RequiredContactField[];
  missingLabels: string[];
}

export async function resolveToken(
  token: string,
): Promise<ResolveTokenResponse> {
  return handle<ResolveTokenResponse>(
    await fetch(`${BASE}/self-service/${encodeURIComponent(token)}`),
  );
}

export async function submitSelfService(
  token: string,
  data: SelfServiceUpdate,
): Promise<{ ok: true; marketingMessage: string; webshopUrl: string }> {
  return handle(
    await fetch(`${BASE}/self-service/${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  );
}
