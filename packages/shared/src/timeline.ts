import { z } from 'zod';

/**
 * Központi Ügyféltörténet Idővonal (Timeline) — egységes eseménymodell (I/D).
 *
 * Az eddig szétszórt adatszigetek (pénzügyi számlák, raktármozgások, logisztikai
 * státuszok, hívások, jegyzetek) egyetlen, időrendi, görgethető nézetbe simulnak.
 * Minden forrás egy közös eseménytípusba képződik le, hogy a pultos egyetlen
 * helyen lássa a beteg teljes múltját.
 */

/** Az esemény kategóriája — a UI ez alapján színez/ikonoz és szűr. */
export const timelineCategorySchema = z.enum([
  'communication', // hívás, SMS, e-mail, jegyzet
  'finance', // számla, bizonylat, pénzügyi elszámolás
  'inventory', // raktárközi mozgás, próbagép, kihelyezett eszköz
  'logistics', // csomag/futár státusz
  'service', // szerviz, garancia, méretcsere
  'consent', // GDPR / parkoltatás / adatkezelés
  'alert', // kiemelt figyelmeztetés (pl. Philips-csere)
]);
export type TimelineCategory = z.infer<typeof timelineCategorySchema>;

/**
 * Egy megjelenítendő idővonal-esemény. A `type` géppel olvasható altípus
 * (pl. 'OUTBOUND_CALL', 'INVOICE_ISSUED'), a `category` a csoportosításhoz.
 */
export interface TimelineItem {
  id: string;
  partnerCode: string;
  category: TimelineCategory;
  type: string;
  /** Emberi olvasható összefoglaló (a nézetben ez a fő szöveg). */
  text: string;
  /** Az esemény időpontja (ISO 8601). */
  occurredAt: string;
  /** Forrásrendszer: 'internal' (a mi rendszerünk) vagy 'kvl' (adapteren át). */
  source: 'internal' | 'kvl';
  /** Tetszőleges strukturált részletek (számlatételek, gyári szám, tracking stb.). */
  detail?: Record<string, unknown>;
}

/**
 * A géppel olvasható eseménytípusok → kategória leképezés. Új típus felvételekor
 * ide is fel kell venni, hogy a UI helyesen csoportosítsa. Ismeretlen típus
 * 'communication' kategóriába esik vissza (biztonságos alapértelmezés).
 */
export const TIMELINE_TYPE_CATEGORY: Record<string, TimelineCategory> = {
  // Kommunikáció (I/C, I/E)
  OUTBOUND_CALL: 'communication',
  INBOUND_CALL: 'communication',
  CALL_NOTE: 'communication',
  SMS_SENT: 'communication',
  EMAIL_SENT: 'communication',
  // Hozzájárulás / GDPR (I/A)
  GDPR_CONSENT_RECORDED: 'consent',
  GDPR_PARKOLTATAS_LEZARVA: 'consent',
  DATA_UPDATED: 'consent',
  // Pénzügy (KVL)
  INVOICE_ISSUED: 'finance',
  RECEIPT_ISSUED: 'finance',
  REFUND_ISSUED: 'finance',
  // Raktár (KVL)
  STOCK_MOVEMENT: 'inventory',
  DEVICE_HANDOUT: 'inventory',
  // Logisztika (futár API)
  PACKAGE_SENT: 'logistics',
  PACKAGE_IN_TRANSIT: 'logistics',
  PACKAGE_DELIVERED: 'logistics',
  PACKAGE_FAILED: 'logistics',
  // Szerviz (V. modul)
  SERVICE_OPENED: 'service',
  SERVICE_CLOSED: 'service',
  WARRANTY_REPLACEMENT: 'service',
  // Kiemelt riasztás
  PHILIPS_RECALL: 'alert',
};

export function categoryForType(type: string): TimelineCategory {
  return TIMELINE_TYPE_CATEGORY[type] ?? 'communication';
}

/**
 * Philips-csereprojekt: az érintett betegnél a KVL-ben (a mi importunkban)
 * rögzített aktuális gépcsere-adatok. Ha egy beteg érintett, az adatlapja
 * megnyitásakor KÖTELEZŐ piros riasztást villantani (I/D checklist 3. pont).
 */
export interface PhilipsRecallInfo {
  partnerCode: string;
  /** A csere során kapott új modell neve. */
  replacementModel: string;
  /** Az új készülék egyedi gyári száma. */
  serialNumber: string;
  /** A csere dátuma (ISO YYYY-MM-DD), ha ismert. */
  replacedOn?: string;
}

export const philipsRecallImportRowSchema = z.object({
  partnerCode: z.string().min(1),
  replacementModel: z.string().min(1),
  serialNumber: z.string().min(1),
  replacedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formátum: ÉÉÉÉ-HH-NN')
    .optional(),
});
export type PhilipsRecallImportRow = z.infer<
  typeof philipsRecallImportRowSchema
>;
