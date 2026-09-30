import { z } from 'zod';

/**
 * A GDPR nyilatkozat aktuális szövegverziója. Ha a nyilatkozat szövege változik,
 * ezt a verziót léptetni kell — így utólag bizonyítható, hogy a páciens PONTOSAN
 * melyik szövegváltozatot fogadta el.
 */
export const CURRENT_POLICY_VERSION = 'gdpr-2026-06-01';

/**
 * A papíralapú adatlapon szereplő 4 kötelező kérdés. A stratégiai vázlat I/A
 * pontja szerint ezekre eddig a papíron és a KVL-ben rögzítettük a válaszokat, de
 * semmilyen automatizmus nem kapcsolódott hozzájuk. Itt strukturáltan rögzítjük.
 */
export const marketingAnswersSchema = z.object({
  /** 1. Kérés a kihordási időről szóló tájékoztatásra */
  kihordasiIdoTajekoztatas: z.boolean(),
  /** 2. Hírlevélre feliratkozás */
  hirlevel: z.boolean(),
  /** 3. Hozzájárulás postai küldeményhez */
  postaiKuldemeny: z.boolean(),
  /** 4. Hozzájárulás e-mailes küldeményhez */
  emailKuldemeny: z.boolean(),
});

export type MarketingAnswers = z.infer<typeof marketingAnswersSchema>;

/**
 * A hozzájárulás jogi hitelességét adó metaadatok. Ezek együtt teszik a digitális
 * jóváhagyást a kézi aláírással egyenértékűvé (lásd docs/adatvedelem.md).
 * Ezeket a SZERVER tölti ki a beküldéskor — a kliens NEM adhatja meg.
 */
export const consentProofSchema = z.object({
  /** A jóváhagyás pontos időbélyege (ISO 8601, UTC) */
  acceptedAt: z.string().datetime(),
  /** A beküldő IP-címe */
  ip: z.string(),
  /** A böngésző / eszköz azonosítója */
  userAgent: z.string(),
  /** Az elfogadott nyilatkozat-szöveg verziója */
  policyVersion: z.string(),
});

export type ConsentProof = z.infer<typeof consentProofSchema>;

/**
 * A "Zéró Hozzájárulás" eset detektálása (I/A checklist 8. pont): ha a páciens
 * SEM a postai, SEM az e-mailes információküldéshez nem járul hozzá, be kell
 * lépnie a Számla-Parkoltatási Radarnak.
 */
export function isZeroConsent(answers: MarketingAnswers): boolean {
  return !answers.postaiKuldemeny && !answers.emailKuldemeny;
}
