import type { PhilipsRecallInfo, TimelineItem } from '@somnoshop/shared';

const BASE = '/api';

export interface TimelineResponse {
  partnerCode: string;
  philipsRecall: PhilipsRecallInfo | null;
  items: TimelineItem[];
}

export async function getTimeline(
  partnerCode: string,
  operator: string,
): Promise<TimelineResponse> {
  const res = await fetch(`${BASE}/timeline/${encodeURIComponent(partnerCode)}`, {
    headers: { 'X-Operator': operator },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? `Hiba (${res.status}).`);
  }
  return res.json() as Promise<TimelineResponse>;
}
