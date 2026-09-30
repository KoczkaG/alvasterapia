/**
 * Elektronikus aláírás adapter (Port) — eIDAS-konform SMS-kódos aláírás
 * (III. Modul / A, 5. lépés).
 *
 * A dokumentum szerint az aláírás alapértelmezetten a modern, eIDAS-konform
 * SMS-kódos hitelesítés (ugyanaz a zárt technológia, mint az Ügyfélkapunál):
 * a beteg mobiljára 4 jegyű kód érkezik, amelynek beírásával a szerződés jogilag
 * lezárul. A valódi hitelesítést külső szolgáltató végzi; amíg az nem él, egy
 * mock adapter generál és ellenőriz kódot, és időbélyeges aláírás-igazolást ad.
 *
 * Az idős/okostelefon nélküli betegek papíralapú fallback ágon írnak alá — ott
 * ezt a portot nem hívjuk.
 */

export interface SignatureChallenge {
  /** A kihíváshoz tartozó azonosító (a verifikációhoz). */
  challengeId: string;
}

export interface SignatureResult {
  signed: boolean;
  /** Az aláírás időbélyege (ISO), siker esetén. */
  signedAt?: string;
  /** eIDAS aláírás-hivatkozás/pecsét azonosító, siker esetén. */
  signatureRef?: string;
}

export interface ESignPort {
  /**
   * SMS-kódos aláírási kihívás indítása a megadott telefonszámra egy adott
   * dokumentumhoz. Visszaadja a kihívás azonosítóját.
   */
  requestSignature(params: {
    phone: string;
    documentRef: string;
  }): Promise<SignatureChallenge>;

  /**
   * A beteg által beírt kód ellenőrzése. Siker esetén időbélyeges, eIDAS-konform
   * aláírás-igazolást ad vissza.
   */
  verifyCode(params: {
    challengeId: string;
    code: string;
  }): Promise<SignatureResult>;
}

export const ESIGN_PORT = Symbol('ESIGN_PORT');
