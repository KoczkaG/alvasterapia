import type { PatientForm } from '@somnoshop/shared';

/**
 * A backend elérhetősége. Fejlesztésben a Vite proxy továbbítja a /api hívásokat
 * a NestJS szerverre (lásd vite.config.ts).
 */
const BASE = '/api';

export interface ZipResolution {
  zip: string;
  city: string;
  alternatives: string[];
}

export type PartnerSearchResult =
  | { matchType: 'single'; partner: PartnerSummary }
  | { matchType: 'multiple'; count: number }
  | { matchType: 'none' };

export interface PartnerSummary {
  partnerCode: string;
  name: string;
  birthDate: string;
  email: string | null;
  mobile: string | null;
  taj: string | null;
  zip: string | null;
  city: string | null;
  address: string | null;
}

export interface SubmissionResult {
  submissionId: string;
  partnerCode: string;
  parked: boolean;
  parkedUntil?: string;
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message =
      body?.error?.message ?? `Hiba történt (${res.status}).`;
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export async function resolveZip(zip: string): Promise<ZipResolution | null> {
  const res = await fetch(`${BASE}/postal-codes/${encodeURIComponent(zip)}`);
  if (res.status === 404) return null;
  return handle<ZipResolution>(res);
}

export async function searchByBirthDate(
  birthDate: string,
): Promise<PartnerSearchResult> {
  const res = await fetch(
    `${BASE}/patients/search?birthDate=${encodeURIComponent(birthDate)}`,
  );
  return handle<PartnerSearchResult>(res);
}

export async function submitForm(
  form: PatientForm,
  channel: 'online' | 'kiosk',
): Promise<SubmissionResult> {
  const res = await fetch(`${BASE}/patients/form?channel=${channel}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(form),
  });
  return handle<SubmissionResult>(res);
}
