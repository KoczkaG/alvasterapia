import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  RECORDING_STOPPED_REASON,
  type RecordingConsent,
  type StartCall,
} from '@somnoshop/shared';
import { AuditService } from '../audit/audit.service';
import { DatabaseService } from '../database/database.service';
import { TIMELINE_PORT, type TimelinePort } from '../timeline/timeline.port';
import { VOIP_PORT, type VoipPort } from './voip.port';

export interface CallRecord {
  id: string;
  partnerCode: string;
  phoneKind: string;
  phoneNumber: string;
  origin: string;
  serviceWorksheetId: string | null;
  providerCallId: string | null;
  status: string;
  recordingConsent: RecordingConsent;
  recordingUri: string | null;
  operator: string;
}

/**
 * A kimenő hívások életciklusának üzleti logikája (I/C). Jogi fókusz:
 *  - a rögzítés alapból elindul, a hívott fél tiltása azonnal leállítja+törli,
 *  - a felvétel-megszakítás MÓDOSÍTHATATLAN Audit Trail bejegyzést kap
 *    (idő, kezelő, ok) — ez a cég hivatalos jogi bizonyítéka,
 *  - a lezárt (engedélyezett) felvétel a beteg Timeline-jához linkelődik.
 */
@Injectable()
export class CallsService {
  private readonly logger = new Logger(CallsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    @Inject(VOIP_PORT) private readonly voip: VoipPort,
    @Inject(TIMELINE_PORT) private readonly timeline: TimelinePort,
  ) {}

  /** Hívás indítása: rekord létrehozása + VoIP-tárcsázás + audit. */
  async start(input: StartCall, operator: string): Promise<CallRecord> {
    const inserted = await this.db.query<{ id: string }>(
      `INSERT INTO outbound_calls
         (partner_code, phone_kind, phone_number, origin, service_worksheet_id, operator)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id`,
      [
        input.partnerCode,
        input.phoneKind,
        input.phoneNumber,
        input.origin,
        input.serviceWorksheetId ?? null,
        operator,
      ],
    );
    const id = inserted.rows[0].id;

    const handle = await this.voip.dial({
      to: input.phoneNumber,
      reference: id,
    });

    await this.db.query(
      `UPDATE outbound_calls
          SET provider_call_id = $1, status = 'dialing'
        WHERE id = $2`,
      [handle.providerCallId, id],
    );

    await this.audit.record({
      actor: operator,
      action: 'CREATE',
      entityType: 'outbound_call',
      entityId: id,
      detail: {
        partnerCode: input.partnerCode,
        phoneKind: input.phoneKind,
        origin: input.origin,
      },
    });

    return this.getOrThrow(id);
  }

  /**
   * A hívott fél tiltotta a rögzítést: azonnali VoIP-leállítás + sáv törlése,
   * majd MÓDOSÍTHATATLAN Audit Trail bejegyzés (idő, kezelő, kötelező ok).
   */
  async refuseRecording(callId: string, operator: string): Promise<CallRecord> {
    const call = await this.getOrThrow(callId);

    if (call.providerCallId) {
      await this.voip.stopAndDeleteRecording(call.providerCallId);
    }

    await this.db.query(
      `UPDATE outbound_calls
          SET recording_consent = 'refused', recording_uri = NULL
        WHERE id = $1`,
      [callId],
    );

    // A jogi bizonyíték: pontos idő, kezelő és a kötelező ok.
    await this.audit.record({
      actor: operator,
      action: 'DELETE',
      entityType: 'call_recording',
      entityId: callId,
      detail: {
        reason: RECORDING_STOPPED_REASON,
        providerCallId: call.providerCallId,
      },
    });

    this.logger.log(
      `Felvétel megszakítva és törölve (hívás ${callId}, kezelő ${operator}).`,
    );

    return this.getOrThrow(callId);
  }

  /** A hívott fél megerősítette a hozzájárulást (a felvétel megmaradhat). */
  async grantRecording(callId: string, operator: string): Promise<CallRecord> {
    await this.getOrThrow(callId);
    await this.db.query(
      `UPDATE outbound_calls SET recording_consent = 'granted' WHERE id = $1`,
      [callId],
    );
    await this.audit.record({
      actor: operator,
      action: 'UPDATE',
      entityType: 'outbound_call',
      entityId: callId,
      detail: { recordingConsent: 'granted' },
    });
    return this.getOrThrow(callId);
  }

  /**
   * Hívás lezárása. Ha a rögzítés engedélyezett volt, lezárja a felvételt és a
   * beteg Timeline-jához linkeli; ha tiltott/nincs, nem tárol felvételt.
   */
  async complete(
    callId: string,
    outcome: 'completed' | 'failed',
    operator: string,
  ): Promise<CallRecord> {
    const call = await this.getOrThrow(callId);

    let recordingUri: string | null = null;
    if (
      call.recordingConsent !== 'refused' &&
      call.providerCallId &&
      outcome === 'completed'
    ) {
      const finalized = await this.voip.finalizeRecording(call.providerCallId);
      recordingUri = finalized?.recordingUri ?? null;
    }

    await this.db.query(
      `UPDATE outbound_calls
          SET status = $1, ended_at = now(), recording_uri = $2
        WHERE id = $3`,
      [outcome, recordingUri, callId],
    );

    // A hívás ténye a beteg Timeline-jára kerül (I/C 3. pont; I/D valódi nézet).
    await this.timeline.append({
      partnerCode: call.partnerCode,
      type: 'OUTBOUND_CALL',
      text:
        outcome === 'completed'
          ? `Kimenő hívás (${call.origin}) — ${call.phoneNumber}`
          : `Sikertelen kimenő hívás — ${call.phoneNumber}`,
      occurredAt: new Date().toISOString(),
      detail: {
        callId,
        origin: call.origin,
        phoneKind: call.phoneKind,
        recordingConsent: call.recordingConsent,
        ...(recordingUri ? { recordingUri } : {}),
        ...(call.serviceWorksheetId
          ? { serviceWorksheetId: call.serviceWorksheetId }
          : {}),
      },
    });

    await this.audit.record({
      actor: operator,
      action: 'UPDATE',
      entityType: 'outbound_call',
      entityId: callId,
      detail: { status: outcome, hasRecording: recordingUri !== null },
    });

    return this.getOrThrow(callId);
  }

  async get(callId: string): Promise<CallRecord | null> {
    const res = await this.db.query<{
      id: string;
      partner_code: string;
      phone_kind: string;
      phone_number: string;
      origin: string;
      service_worksheet_id: string | null;
      provider_call_id: string | null;
      status: string;
      recording_consent: RecordingConsent;
      recording_uri: string | null;
      operator: string;
    }>(
      `SELECT id, partner_code, phone_kind, phone_number, origin,
              service_worksheet_id, provider_call_id, status,
              recording_consent, recording_uri, operator
         FROM outbound_calls WHERE id = $1`,
      [callId],
    );
    const r = res.rows[0];
    if (!r) return null;
    return {
      id: r.id,
      partnerCode: r.partner_code,
      phoneKind: r.phone_kind,
      phoneNumber: r.phone_number,
      origin: r.origin,
      serviceWorksheetId: r.service_worksheet_id,
      providerCallId: r.provider_call_id,
      status: r.status,
      recordingConsent: r.recording_consent,
      recordingUri: r.recording_uri,
      operator: r.operator,
    };
  }

  private async getOrThrow(callId: string): Promise<CallRecord> {
    const call = await this.get(callId);
    if (!call) {
      throw new NotFoundException({
        error: { code: 'CALL_NOT_FOUND', message: 'Ismeretlen hívásazonosító.' },
      });
    }
    return call;
  }
}
