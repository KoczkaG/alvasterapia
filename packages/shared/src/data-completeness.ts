import { z } from 'zod';
import { emailSchema, mobileSchema, tajSchema } from './patient.js';

/**
 * Automata „ADATLAP HIÁNYOS" riasztási protokoll (I. Modul / F).
 *
 * Amikor a pultos megnyit egy beteg adatlapját, a rendszer ellenőrzi a kötelező
 * kontaktadatok meglétét. Ha bármelyik hiányzik, riasztást ad, és két kezelési
 * utat kínál: helyszíni frissítés vagy önkiszolgáló tokenes link.
 */

/** A kötelezően ellenőrzött mezők (dokumentum I/F 1. pont). */
export const requiredContactFieldSchema = z.enum(['email', 'mobile', 'taj']);
export type RequiredContactField = z.infer<typeof requiredContactFieldSchema>;

export const REQUIRED_FIELD_LABELS: Record<RequiredContactField, string> = {
  email: 'E-mail cím',
  mobile: 'Mobiltelefonszám',
  taj: 'TAJ-szám',
};

/** A partner ellenőrizendő kontaktadatai. */
export interface ContactData {
  email?: string | null;
  mobile?: string | null;
  taj?: string | null;
}

export interface CompletenessResult {
  complete: boolean;
  /** A hiányzó kötelező mezők listája. */
  missing: RequiredContactField[];
}

/**
 * Megállapítja, mely kötelező kontaktmezők hiányoznak. Üres string / null /
 * hiányzó egyaránt „hiányzónak" számít.
 */
export function checkCompleteness(data: ContactData): CompletenessResult {
  const missing: RequiredContactField[] = [];
  if (!data.email || data.email.trim() === '') missing.push('email');
  if (!data.mobile || data.mobile.trim() === '') missing.push('mobile');
  if (!data.taj || data.taj.trim() === '') missing.push('taj');
  return { complete: missing.length === 0, missing };
}

/**
 * A „B" opció önkiszolgáló felületén a beteg által beküldhető adatok. Csak a
 * hiányzó kontaktmezőket kérjük — mindegyik opcionális, de amit megad, azt
 * validáljuk. A token azonosítja, melyik partnerről van szó.
 */
export const selfServiceUpdateSchema = z
  .object({
    email: emailSchema.optional(),
    mobile: mobileSchema.optional(),
    taj: tajSchema.optional(),
  })
  .refine(
    (d) => d.email !== undefined || d.mobile !== undefined || d.taj !== undefined,
    { message: 'Legalább egy adat megadása szükséges.' },
  );
export type SelfServiceUpdate = z.infer<typeof selfServiceUpdateSchema>;

/** A tokenes önkiszolgáló link élettartama (I/F): 72 óra. */
export const SELF_SERVICE_TOKEN_TTL_HOURS = 72;

/**
 * A záró képernyőn / GDPR-igazolásban megjelenő, webshopra terelő marketing
 * üzenet (dokumentum I/F 4. pont). A linket a hívó tölti be (env/konfig).
 */
export const MARKETING_CLOSING_MESSAGE =
  'Köszönjük, hogy naprakészen tartja adatait! Örömmel értesítjük, hogy megújult ' +
  'a SOMNO SHOP Webáruház, ahol mostantól még gyorsabban, kényelmesebben és sorban ' +
  'állás nélkül intézheti tartozék-rendeléseit vagy vénybeváltásait.';
