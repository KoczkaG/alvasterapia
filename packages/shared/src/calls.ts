import { z } from 'zod';

/**
 * Szoftverből indított kimenő hívások (I. Modul / C — Click-to-Call).
 *
 * A modell a hívás teljes életciklusát fedi le a jogi védelemre fókuszálva:
 * kötelező GDPR-figyelmeztetés, a hívott fél rögzítés-tiltásának kezelése, és a
 * módosíthatatlan Audit Trail. A tényleges hangkapcsolást és -rögzítést külső
 * VoIP-szolgáltató végzi (adapter mögött).
 */

/**
 * A hívott telefonszám típusa. A Click-to-Call MINDEN regisztrált szám mellett
 * elérhető (dokumentum I/C 1. pont): a beteg mobilja, vezetékes száma, valamint
 * a jogilag jóváhagyott kapcsolattartó / hozzátartozó / megbízott száma.
 */
export const phoneKindSchema = z.enum([
  'patient_mobile',
  'patient_landline',
  'authorized_contact',
]);
export type PhoneKind = z.infer<typeof phoneKindSchema>;

/**
 * A rögzítés-hozzájárulás állapota egy híváson belül.
 *  - pending: még nem dőlt el (a kolléga most mondja be a GDPR-sablont),
 *  - granted: a hívott fél hozzájárult (a felvétel megmarad),
 *  - refused: a hívott fél tiltotta (a sávot törölni kell).
 */
export const recordingConsentSchema = z.enum([
  'pending',
  'granted',
  'refused',
]);
export type RecordingConsent = z.infer<typeof recordingConsentSchema>;

/**
 * A hívás életciklus-státusza.
 *  - dialing: a rendszer indítja a VoIP-hívást,
 *  - connected: a hívott fél felvette,
 *  - completed: a hívás normálisan lezárult,
 *  - failed: nem jött létre kapcsolat (nem vették fel, foglalt stb.).
 */
export const callStatusSchema = z.enum([
  'dialing',
  'connected',
  'completed',
  'failed',
]);
export type CallStatus = z.infer<typeof callStatusSchema>;

/** Hívásindítási kérés (a pulti/szervizes felület küldi). */
export const startCallSchema = z.object({
  /** A KVL-partner kódja, akihez a hívás tartozik. */
  partnerCode: z.string().min(1),
  /** Melyik regisztrált számot hívjuk. */
  phoneKind: phoneKindSchema,
  /** A ténylegesen hívott telefonszám (a felületről, a partner adatlapjáról). */
  phoneNumber: z.string().min(3),
  /** Honnan indult: 'counter' (pult) vagy 'service' (szervizműhely). */
  origin: z.enum(['counter', 'service']),
  /** Opcionális szerviz-munkalapszám, ha a hívás szervizügyhöz kötődik. */
  serviceWorksheetId: z.string().optional(),
});
export type StartCall = z.infer<typeof startCallSchema>;

/**
 * A kimenő híváskor kötelezően bemondandó GDPR-sablon (dokumentum I/C 4. pont).
 * A kolléga ezt olvassa fel a hívott félnek.
 */
export const OUTBOUND_RECORDING_NOTICE =
  'Tájékoztatom, hogy a hívást minőségbiztosítási okokból rögzítjük. ' +
  'Amennyiben ehhez nem járul hozzá, kérem jelezze, és azonnal leállítom a felvételt!';

/**
 * Belső pulti érvkészlet a gyanakvás kezelésére (dokumentum I/C 6. pont).
 * A kolléga ezt használhatja, ha a hívott fél megkérdőjelezi a rögzítés okát.
 */
export const RECORDING_REASSURANCE_SCRIPT =
  'Teljesen megértem az óvatosságát, a mai világban Önnek teljesen igaza van, ' +
  'hogy rákérdezett! Hadd nyugtassam meg: mi a SOMNO SHOP szaküzletéből ' +
  'keressük a folyamatban lévő ügye miatt, és a hívásrögzítés valójában az Ön ' +
  'biztonságát szolgálja. Ha most telefonon egyeztet velünk egy maszkot, méretet ' +
  'vagy szervizbeállítást, a felvétel garantálja, hogy pontosan azt teljesítsük, ' +
  'amit kért. Ez egy esetleges félreértésnél az Ön legfőbb védelme, hiszen így a ' +
  'szavait bármikor vissza tudjuk keresni. Hozzájárul így a rögzítéshez, vagy ' +
  'inkább állítsam le a felvételt és beszéljünk privát vonalon?';

/**
 * A felvétel megszakításakor az Audit Trailbe kerülő, jogilag kötelező ok
 * (dokumentum I/C 5. pont).
 */
export const RECORDING_STOPPED_REASON =
  'Ügyfél tiltása miatt felvétel kimenő hívásnál megszakítva és törölve';
