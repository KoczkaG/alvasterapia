import type { EanPoolStatus, EanPoolUpload } from '@somnoshop/shared';

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

export async function getPoolStatus(): Promise<EanPoolStatus> {
  return handle<EanPoolStatus>(await fetch(`${BASE}/ean-pool/status`));
}

export async function uploadPool(
  upload: EanPoolUpload,
  operator: string,
): Promise<{ added: number; skipped: number }> {
  return handle(
    await fetch(`${BASE}/ean-pool/upload`, {
      method: 'POST',
      headers: OP(operator),
      body: JSON.stringify(upload),
    }),
  );
}
