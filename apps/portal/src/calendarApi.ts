import type {
  DateOverride,
  OpeningCalendar,
  ResolvedDay,
  WeeklySchedule,
} from '@somnoshop/shared';

const BASE = '/api';

export interface OpeningStatus {
  now: { date: string; time: string };
  open: boolean;
  today: ResolvedDay;
  next: { date: string; time: string } | null;
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? `Hiba (${res.status}).`);
  }
  return res.json() as Promise<T>;
}

export async function getStatus(): Promise<OpeningStatus> {
  return handle<OpeningStatus>(await fetch(`${BASE}/opening/status`));
}

export async function getCalendar(): Promise<OpeningCalendar> {
  return handle<OpeningCalendar>(await fetch(`${BASE}/opening/calendar`));
}

export async function setWeekly(
  schedule: WeeklySchedule,
): Promise<OpeningCalendar> {
  return handle<OpeningCalendar>(
    await fetch(`${BASE}/admin/opening/weekly`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(schedule),
    }),
  );
}

export async function upsertOverride(
  override: DateOverride,
): Promise<OpeningCalendar> {
  return handle<OpeningCalendar>(
    await fetch(`${BASE}/admin/opening/overrides`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(override),
    }),
  );
}

export async function deleteOverride(date: string): Promise<OpeningCalendar> {
  return handle<OpeningCalendar>(
    await fetch(`${BASE}/admin/opening/overrides/${date}`, {
      method: 'DELETE',
    }),
  );
}

export async function getHolidaySuggestions(
  year: number,
): Promise<DateOverride[]> {
  return handle<DateOverride[]>(
    await fetch(`${BASE}/admin/opening/holiday-suggestions/${year}`),
  );
}
