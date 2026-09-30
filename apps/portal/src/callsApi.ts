import type { PhoneKind, StartCall } from '@somnoshop/shared';

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

export async function completeCall(
  callId: string,
  outcome: 'completed' | 'failed',
  operator: string,
): Promise<CallRecord> {
  return handle<CallRecord>(
    await fetch(`${BASE}/calls/${callId}/complete`, {
      method: 'POST',
      headers: operatorHeader(operator),
      body: JSON.stringify({ outcome }),
    }),
  );
}
