import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
} from '@nestjs/common';
import { z } from 'zod';
import {
  callNoteSchema,
  DEFAULT_REFERRERS,
  OUTBOUND_RECORDING_NOTICE,
  RECORDING_REASSURANCE_SCRIPT,
  startCallSchema,
  type StartCall,
} from '@somnoshop/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CallsService } from './calls.service';

/** A jegyzetes lezárás kérés-törzse: kimenetel + a kötelező hívásvégi jegyzet. */
const completeWithNoteSchema = z.object({
  outcome: z.enum(['completed', 'failed']).default('completed'),
  note: callNoteSchema,
});
type CompleteWithNote = z.infer<typeof completeWithNoteSchema>;

/**
 * Kimenő hívások (Click-to-Call) végpontjai.
 *
 * A kezelő (kolléga) azonosítója jelenleg az `X-Operator` fejlécből érkezik
 * placeholderként; a valódi felhasználó-azonosítást egy későbbi Auth modul köti
 * be. Az Audit Trail ezt az actort rögzíti.
 */
@Controller('calls')
export class CallsController {
  constructor(private readonly calls: CallsService) {}

  private operator(header?: string): string {
    return header?.trim() || 'operator:unknown';
  }

  /** POST /calls — hívás indítása egy partner adott számára. */
  @Post()
  start(
    @Body(new ZodValidationPipe(startCallSchema)) input: StartCall,
    @Headers('x-operator') operator?: string,
  ) {
    return this.calls.start(input, this.operator(operator));
  }

  /** POST /calls/:id/recording/grant — a hívott fél hozzájárult a rögzítéshez. */
  @Post(':id/recording/grant')
  grant(@Param('id') id: string, @Headers('x-operator') operator?: string) {
    return this.calls.grantRecording(id, this.operator(operator));
  }

  /**
   * POST /calls/:id/recording/refuse — a hívott fél TILTOTTA a rögzítést.
   * A felvétel azonnal leáll és törlődik, a művelet módosíthatatlanul naplózódik.
   */
  @Post(':id/recording/refuse')
  refuse(@Param('id') id: string, @Headers('x-operator') operator?: string) {
    return this.calls.refuseRecording(id, this.operator(operator));
  }

  /**
   * POST /calls/:id/complete — hívás lezárása (completed|failed).
   * Megjegyzés: a jegyzet nélküli lezárás megmarad kompatibilitás miatt; a pulti
   * felület a jegyzetes lezárást (/complete-with-note) használja (I/E).
   */
  @Post(':id/complete')
  complete(
    @Param('id') id: string,
    @Body() body: { outcome?: 'completed' | 'failed' },
    @Headers('x-operator') operator?: string,
  ) {
    const outcome = body?.outcome === 'failed' ? 'failed' : 'completed';
    return this.calls.complete(id, outcome, this.operator(operator));
  }

  /**
   * POST /calls/:id/complete-with-note — hívás lezárása a KÖTELEZŐ hívásvégi
   * jegyzettel együtt (I/E). A jegyzet a Timeline-ra kerül, visszahívási igény
   * esetén automata feladat generálódik.
   */
  @Post(':id/complete-with-note')
  completeWithNote(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(completeWithNoteSchema)) body: CompleteWithNote,
    @Headers('x-operator') operator?: string,
  ) {
    return this.calls.completeWithNote(
      id,
      body.outcome,
      body.note,
      this.operator(operator),
    );
  }

  /**
   * GET /calls/meta/scripts — a pulti felület által megjelenítendő kötelező
   * GDPR-sablon és a gyanakvás-kezelő érvkészlet (I/C 4. és 6. pont).
   * (A param-útvonal ELŐTT regisztrálva, hogy ne fedje el a ':id'.)
   */
  @Get('meta/scripts')
  scripts() {
    return {
      recordingNotice: OUTBOUND_RECORDING_NOTICE,
      reassuranceScript: RECORDING_REASSURANCE_SCRIPT,
    };
  }

  /**
   * GET /calls/meta/referrers — a hívásvégi jegyzet küldő-intézmény
   * legördülőjéhez (alváslaborok / kezelőorvosok törzsadata).
   */
  @Get('meta/referrers')
  referrers() {
    return DEFAULT_REFERRERS;
  }

  /** GET /calls/:id — a hívás aktuális állapota. */
  @Get(':id')
  get(@Param('id') id: string) {
    return this.calls.get(id);
  }
}
