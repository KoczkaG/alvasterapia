import { z } from 'zod';
import { marketingAnswersSchema } from './consent.js';

/** Magyar irányítószám: pontosan 4 számjegy. */
export const zipSchema = z
  .string()
  .regex(/^\d{4}$/, 'Az irányítószám pontosan 4 számjegy.');

/**
 * Magyar TAJ-szám: 9 számjegy (üzemszerűen 3-3-3 tagolással jelenik meg).
 * Tároláskor tagolás nélkül, 9 számjegyként kezeljük.
 */
export const tajSchema = z
  .string()
  .regex(/^\d{9}$/, 'A TAJ-szám 9 számjegyből áll.');

/**
 * Mobiltelefonszám — megengedő validáció (magyar formátumok: +36..., 06...).
 * A cél a nyilvánvaló elgépelések kiszűrése, nem a teljes körű ellenőrzés.
 */
export const mobileSchema = z
  .string()
  .regex(/^(\+36|06)\s?\d{1,2}[\s-]?\d{3}[\s-]?\d{3,4}$/, 'Érvénytelen mobiltelefonszám.');

export const emailSchema = z.string().email('Érvénytelen e-mail cím.');

/**
 * Az online / tabletes adatlap kitöltésekor beérkező páciens-adatok.
 * A születési dátumot ISO formátumban (YYYY-MM-DD) várjuk.
 */
export const patientFormSchema = z.object({
  name: z.string().trim().min(2, 'A név megadása kötelező.'),
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'A születési dátum formátuma: ÉÉÉÉ-HH-NN.'),
  taj: tajSchema.optional(),
  email: emailSchema.optional(),
  mobile: mobileSchema.optional(),
  zip: zipSchema,
  /** A településnevet az irányítószám alapján automatikusan töltjük ki. */
  city: z.string().trim().min(1),
  address: z.string().trim().min(1, 'A cím megadása kötelező.'),
  /** Ha meglévő (KVL-ből előhívott) partnerről van szó, itt szerepel a kódja. */
  partnerCode: z.string().optional(),
  /** A 4 kötelező kérdésre adott válaszok. */
  marketing: marketingAnswersSchema,
});

export type PatientForm = z.infer<typeof patientFormSchema>;
