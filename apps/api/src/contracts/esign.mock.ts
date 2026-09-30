import { Injectable, Logger } from '@nestjs/common';
import type {
  ESignPort,
  SignatureChallenge,
  SignatureResult,
} from './esign.port';

interface PendingChallenge {
  phone: string;
  documentRef: string;
  code: string;
}

/**
 * MOCK eIDAS SMS-aláírás adapter. Memóriában generál 4 jegyű kódot és ellenőrzi
 * azt, amíg a valódi hitelesítő szolgáltató nem él. Demó-egyszerűsítés: a kódot
 * naplózza (valós rendszerben SMS-ben menne), és az aláírás sikerét visszaadja.
 */
@Injectable()
export class ESignMockAdapter implements ESignPort {
  private readonly logger = new Logger(ESignMockAdapter.name);
  private readonly challenges = new Map<string, PendingChallenge>();
  private seq = 0;

  async requestSignature(params: {
    phone: string;
    documentRef: string;
  }): Promise<SignatureChallenge> {
    const challengeId = `chg-${++this.seq}`;
    // Determinisztikus demó-kód (valós rendszerben véletlen + SMS-ben kézbesítve).
    const code = '4321';
    this.challenges.set(challengeId, {
      phone: params.phone,
      documentRef: params.documentRef,
      code,
    });
    this.logger.debug(
      `[MOCK] SMS-aláírási kód a(z) ${params.phone} számra: ${code} (${challengeId})`,
    );
    return { challengeId };
  }

  async verifyCode(params: {
    challengeId: string;
    code: string;
  }): Promise<SignatureResult> {
    const pending = this.challenges.get(params.challengeId);
    if (!pending || pending.code !== params.code) {
      return { signed: false };
    }
    this.challenges.delete(params.challengeId);
    return {
      signed: true,
      signedAt: new Date().toISOString(),
      signatureRef: `eidas-${params.challengeId}`,
    };
  }
}
