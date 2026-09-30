import { REQUIRED_FIELD_LABELS, type RequiredContactField } from '@somnoshop/shared';
import { useState } from 'react';
import {
  checkCompleteness,
  issueLink,
  updateInPlace,
  type CheckResponse,
} from './completenessApi';

/**
 * Pulti „ADATLAP HIÁNYOS" panel (I/F). A pultos beírja a partnerkódot; ha hiányos
 * az adatlap, riasztás jelenik meg, és választhat: helyszíni frissítés ("A") vagy
 * önkiszolgáló link kiküldése ("B").
 */

const OPERATOR = 'pult.demo'; // placeholder; később Auth

export function CompletenessPanel() {
  const [partnerCode, setPartnerCode] = useState('P-000123');
  const [check, setCheck] = useState<CheckResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // "A" opció beviteli mezői (csak a hiányzókat mutatjuk)
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [taj, setTaj] = useState('');

  const [linkInfo, setLinkInfo] = useState<{ url: string; expiresAt: string } | null>(
    null,
  );

  async function runCheck() {
    setError(null);
    setMessage(null);
    setLinkInfo(null);
    setBusy(true);
    try {
      const res = await checkCompleteness(partnerCode.trim());
      setCheck(res);
      setEmail('');
      setMobile('');
      setTaj('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ellenőrzési hiba.');
      setCheck(null);
    } finally {
      setBusy(false);
    }
  }

  function needs(field: RequiredContactField): boolean {
    return check?.missing.includes(field) ?? false;
  }

  async function submitInPlace() {
    if (!check) return;
    const data: { email?: string; mobile?: string; taj?: string } = {};
    if (needs('email') && email.trim()) data.email = email.trim();
    if (needs('mobile') && mobile.trim()) data.mobile = mobile.trim();
    if (needs('taj') && taj.trim()) data.taj = taj.trim();
    if (Object.keys(data).length === 0) {
      setError('Adjon meg legalább egy hiányzó adatot.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await updateInPlace(check.partnerCode, data, OPERATOR);
      setCheck(res);
      setMessage(
        res.complete
          ? 'Az adatlap teljes. A GDPR-igazolást kiküldtük.'
          : 'Adat frissítve. Még maradt hiányzó mező.',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Mentési hiba.');
    } finally {
      setBusy(false);
    }
  }

  async function sendLink() {
    if (!check) return;
    setBusy(true);
    setError(null);
    try {
      const res = await issueLink(check.partnerCode, OPERATOR);
      setLinkInfo({ url: res.url, expiresAt: res.expiresAt });
      setMessage('Önkiszolgáló linket kiküldtük a betegnek (SMS/e-mail).');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Link-küldési hiba.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <header className="brand">
        <h1>SOMNO SHOP</h1>
        <p>Adatlap-ellenőrzés (pult)</p>
      </header>

      {error && <div className="banner danger">{error}</div>}
      {message && <div className="banner ok">{message}</div>}

      <section className="card">
        <label htmlFor="pc">Ügyfélazonosító (partnerkód)</label>
        <div className="row">
          <input
            id="pc"
            type="text"
            value={partnerCode}
            onChange={(e) => setPartnerCode(e.target.value)}
            placeholder="pl. P-000123"
          />
          <button
            type="button"
            className="btn"
            style={{ marginTop: 0, width: 'auto', padding: '11px 20px' }}
            onClick={runCheck}
            disabled={busy}
          >
            Ellenőrzés
          </button>
        </div>
        <p className="hint">Demó: a P-000123 ügyfélnek hiányzik az e-mailje és mobilja.</p>
      </section>

      {check && check.complete && (
        <div className="banner ok">
          Az adatlap teljes — minden kötelező kontaktadat megvan.
        </div>
      )}

      {check && !check.complete && (
        <>
          <div className="banner danger">
            ⚠️ FIGYELEM: Az ügyfél adatlapja HIÁNYOS! Hiányzik:{' '}
            <strong>
              {check.missing.map((m) => REQUIRED_FIELD_LABELS[m]).join(', ')}
            </strong>
          </div>

          {/* "A" opció — helyszíni frissítés */}
          <section className="card">
            <h2>„A" — Helyszíni frissítés</h2>
            <p className="hint">
              A hiányzó adat elkérése és rögzítése. Mentés után a GDPR-igazolás
              automatikusan kimegy.
            </p>
            {needs('email') && (
              <>
                <label htmlFor="e">E-mail cím</label>
                <input
                  id="e"
                  type="email"
                  value={email}
                  onChange={(ev) => setEmail(ev.target.value)}
                />
              </>
            )}
            {needs('mobile') && (
              <>
                <label htmlFor="m">Mobiltelefonszám</label>
                <input
                  id="m"
                  type="tel"
                  placeholder="+36 30 123 4567"
                  value={mobile}
                  onChange={(ev) => setMobile(ev.target.value)}
                />
              </>
            )}
            {needs('taj') && (
              <>
                <label htmlFor="t">TAJ-szám</label>
                <input
                  id="t"
                  type="text"
                  inputMode="numeric"
                  placeholder="9 számjegy"
                  value={taj}
                  onChange={(ev) => setTaj(ev.target.value)}
                />
              </>
            )}
            <button
              type="button"
              className="btn"
              onClick={submitInPlace}
              disabled={busy}
            >
              Mentés és GDPR-igazolás
            </button>
          </section>

          {/* "B" opció — önkiszolgáló link */}
          <section className="card">
            <h2>„B" — Önkiszolgáló link</h2>
            <p className="hint">
              Ha nagy a sor: a beteg otthon, saját telefonján pótolja az adatait
              egy biztonságos linken (72 óráig érvényes).
            </p>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={sendLink}
              disabled={busy}
            >
              Önkiszolgáló link kiküldése (SMS + e-mail)
            </button>
            {linkInfo && (
              <div className="legal-note" style={{ marginTop: 12 }}>
                Link kiküldve. Demó-URL:
                <br />
                <code style={{ wordBreak: 'break-all' }}>{linkInfo.url}</code>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
