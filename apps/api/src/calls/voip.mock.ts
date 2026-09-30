import { Injectable, Logger } from '@nestjs/common';
import type { VoipCallHandle, VoipPort } from './voip.port';

/**
 * Mock VoIP-adapter. Ideiglenes, amíg a valódi felhőalapú telefonközpont
 * integrációja el nem készül. Determinisztikus hívásazonosítót ad, és naplózza
 * a felvétel-leállítást/lezárást.
 */
@Injectable()
export class VoipMockAdapter implements VoipPort {
  private readonly logger = new Logger(VoipMockAdapter.name);
  private seq = 0;

  async dial(params: { to: string; reference: string }): Promise<VoipCallHandle> {
    const providerCallId = `voip-${Date.now()}-${++this.seq}`;
    this.logger.debug(`[MOCK] dial → ${params.to} (ref ${params.reference})`);
    return { providerCallId };
  }

  async stopAndDeleteRecording(providerCallId: string): Promise<void> {
    this.logger.debug(
      `[MOCK] felvétel leállítva és törölve: ${providerCallId}`,
    );
  }

  async finalizeRecording(
    providerCallId: string,
  ): Promise<{ recordingUri: string } | null> {
    // A mock mindig ad egy fiktív felvétel-hivatkozást.
    return { recordingUri: `mock://recordings/${providerCallId}.mp3` };
  }
}
