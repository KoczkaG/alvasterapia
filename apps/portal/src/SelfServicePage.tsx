import type { RequiredContactField } from '@somnoshop/shared';
import { useEffect, useState } from 'react';
import {
  resolveToken,
  submitSelfService,
  type ResolveTokenResponse,
} from './completenessApi';

/**
 * Betegoldali önkiszolgáló adatpótló felület (I/F "B"). A tokenes linkről
 * (SMS/e-mail) érkező beteg itt pótolja a hiányzó adatait. A token a query
 * paraméterben érkezik: ?token=...
 */
export function SelfServicePage() {
  const token = new URLSearchParams(window.location.search).get('token') ?? '';
  const [info, setInfo] = useState<ResolveTokenResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ marketingMessage: string; webshopUrl: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [taj, setTaj] = useState('');

  useEffect(() => {
    if (!token) {
      setError('Hiányzó vagy érvénytelen link.');
      return;
    }
    void resolveToken(token)
      .then(setInfo)
      .catch((e) =>
        setError(e instanceof Error ? e.message : 'A link nem érvényes.'),
      );
  }, [token]);

  function needs(field: RequiredContactField): boolean {
    return info?.missing.includes(field) ?? false;
  }

  async function submit() {
    if (!info) return;
    const data: { email?: string; mobile?: string; taj?: string } = {};
    if (needs('email') && email.trim()) data.email = email.trim();
    if (needs('mobile') && mobile.trim()) data.mobile = mobile.trim();
    if (needs('taj') && taj.trim()) data.taj = taj.trim();
    if (Object.keys(data).length === 0) {
      setError('Kérjük, töltse ki a hiányzó adatot.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await submitSelfService(token, data);
      setDone({ marketingMessage: res.marketingMessage, webshopUrl: res.webshopUrl });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'A mentés sikertelen.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="page">
        <div className="card success">
          <div className="check">✓</div>
          <h2>Köszönjük, adatait rögzítettük!</h2>
          <div className="banner ok" style={{ marginTop: 16 }}>
            {done.marketingMessage}
          </div>
          <a
            className="btn"
            style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}
            href={done.webshopUrl}
          >
            Irány a webáruház
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="brand">
        <h1>SOMNO SHOP</h1>
        <p>Adatpótlás</p>
      </header>

      {error && <div className="banner danger">{error}</div>}

      {info && (
        <section className="card">
          <h2>Kérjük, pótolja hiányzó adatait</h2>
          <p className="hint">
            Néhány kontaktadata hiányzik nálunk. Kérjük, adja meg az alábbiakat.
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
          {info.missing.length === 0 && (
            <p className="hint">Nincs pótolandó adat. Köszönjük!</p>
          )}
          <button type="button" className="btn" onClick={submit} disabled={busy}>
            Adatok mentése
          </button>
        </section>
      )}
    </div>
  );
}
