import type {
  CallNote,
  CallTopic,
  PhoneKind,
  Referrer,
  StartCall,
} from '@somnoshop/shared';

const BASE = '/api';

export interface CallRecord {
  id: string;
  partnerCode: string;
  phoneKind: PhoneKind;
  phoneNumber: string;
  origin: string;
  status: string;
  recordingConsent: 'pending' | 'granted' | 'refused';
  recordingUri: string | null;
  operator: string;
}

export interface CallScripts {
  recordingNotice: string;
  reassuranceScript: string;
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? `Hiba (${res.status}).`);
  }
  return res.json() as Promise<T>;
}

const operatorHeader = (op: string) => ({
  'Content-Type': 'application/json',
  'X-Operator': op,
});

export async function getScripts(): Promise<CallScripts> {
  return handle<CallScripts>(await fetch(`${BASE}/calls/meta/scripts`));
}

export async function startCall(
  input: StartCall,
  operator: string,
): Promise<CallRecord> {
  return handle<CallRecord>(
    await fetch(`${BASE}/calls`, {
      method: 'POST',
      headers: operatorHeader(operator),
      body: JSON.stringify(input),
    }),
  );
}

export async function grantRecording(
  callId: string,
  operator: string,
): Promise<CallRecord> {
  return handle<CallRecord>(
    await fetch(`${BASE}/calls/${callId}/recording/grant`, {
      method: 'POST',
      headers: operatorHeader(operator),
    }),
  );
}

export async function refuseRecording(
  callId: string,
  operator: string,
): Promise<CallRecord> {
  return handle<CallRecord>(
    await fetch(`${BASE}/calls/${callId}/recording/refuse`, {
      method: 'POST',
      headers: operatorHeader(operator),
    }),
  );
}

export async function getReferrers(): Promise<Referrer[]> {
  return handle<Referrer[]>(await fetch(`${BASE}/calls/meta/referrers`));
}

export async function completeCallWithNote(
  callId: string,
  outcome: 'completed' | 'failed',
  note: CallNote,
  operator: string,
): Promise<CallRecord> {
  return handle<CallRecord>(
    await fetch(`${BASE}/calls/${callId}/complete-with-note`, {
      method: 'POST',
      headers: operatorHeader(operator),
      body: JSON.stringify({ outcome, note }),
    }),
  );
}

export interface CallStatsSummary {
  range: { from: string | null; to: string | null };
  totalNotes: number;
  topicBreakdown: { topic: CallTopic; count: number; percent: number }[];
  referrerRanking: { referrerId: string; count: number }[];
  followUpCount: number;
}

export async function getCallStats(): Promise<CallStatsSummary> {
  return handle<CallStatsSummary>(await fetch(`${BASE}/admin/call-stats`));
}
