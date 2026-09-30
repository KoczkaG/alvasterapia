import { z } from 'zod';

/**
 * Virtuális EAN-kód Pool és Hibrid E-számlázás (II. Modul / C).
 *
 * A TB-támogatott (vényes) eszközök egyedi hatósági azonosítóit (EAN-kód
 * matricák) 100%-ban digitalizáljuk: a hatóságtól kapott sorszámokból egy
 * "digitális matrica-tömb" (pool) épül, amiből vényes értékesítéskor a rendszer
 * automatikusan, versenymentesen osztja ki a következő szabad kódot.
 */

/**
 * Kódtömb feltöltése — KÉTFÉLE módon:
 *  - tartomány (from–to, inkluzív), pl. a hatóság által adott sávra, VAGY
 *  - explicit lista.
 * A `label` a tömb megnevezése (pl. termékcsoport), naplózáshoz/kimutatáshoz.
 */
export const eanPoolUploadSchema = z
  .object({
    label: z.string().trim().min(1, 'A tömb megnevezése kötelező.'),
    range: z
      .object({
        from: z.string().regex(/^\d+$/, 'A kezdő sorszám csak számjegy.'),
        to: z.string().regex(/^\d+$/, 'A záró sorszám csak számjegy.'),
      })
      .optional(),
    codes: z.array(z.string().regex(/^\d+$/)).optional(),
  })
  .refine((d) => d.range !== undefined || (d.codes?.length ?? 0) > 0, {
    message: 'Adjon meg tartományt vagy explicit kódlistát.',
  });
export type EanPoolUpload = z.infer<typeof eanPoolUploadSchema>;

/**
 * A feltöltésből előállítja a konkrét kódok listáját. Tartománynál a from..to
 * inkluzív sávot bontja ki (a számjegyek hosszát a `from` szélessége adja, hogy
 * a vezető nullák megmaradjanak). Duplikátumokat kiszűr.
 *
 * Biztonsági korlát: a kibontott tartomány mérete nem haladhatja meg a limitet
 * (véletlen elgépelés — pl. 1..99999999 — elleni védelem).
 */
export const MAX_POOL_EXPANSION = 100_000;

export function expandPoolUpload(upload: EanPoolUpload): string[] {
  const result = new Set<string>();

  if (upload.range) {
    const from = BigInt(upload.range.from);
    const to = BigInt(upload.range.to);
    if (to < from) {
      throw new Error('A záró sorszám nem lehet kisebb a kezdőnél.');
    }
    const count = to - from + 1n;
    if (count > BigInt(MAX_POOL_EXPANSION)) {
      throw new Error(
        `A tartomány túl nagy (max. ${MAX_POOL_EXPANSION} kód egyszerre).`,
      );
    }
    const width = upload.range.from.length;
    for (let v = from; v <= to; v++) {
      result.add(v.toString().padStart(width, '0'));
    }
  }

  for (const c of upload.codes ?? []) {
    result.add(c.trim());
  }

  return [...result];
}

/** A pool állapota (kimutatáshoz / riasztáshoz). */
export interface EanPoolStatus {
  /** Szabad (még ki nem osztott) kódok száma. */
  available: number;
  /** Felhasznált kódok száma. */
  used: number;
  /** Igaz, ha a szabad készlet a kritikus szint alá esett. */
  low: boolean;
  /** A kritikus szint, ami alatt riasztunk. */
  threshold: number;
}

/** A digitális matrica-készlet kritikus szintje (II/C 3. pont). */
export const EAN_POOL_LOW_THRESHOLD = 50;

// ---------------------------------------------------------------------------
// Hibrid e-számla kiadási logika (II/C 5. pont)
// ---------------------------------------------------------------------------

export type InvoiceDelivery = 'email' | 'print';

/**
 * Eldönti a számla kiadási módját: ha a betegnek van e-mail címe, digitálisan
 * (e-mail) küldjük, papírnyomtatás nélkül; egyébként egyetlen ügyfél-példányt
 * nyomtatunk helyben.
 */
export function decideInvoiceDelivery(email?: string | null): InvoiceDelivery {
  return email && email.trim() !== '' ? 'email' : 'print';
}
