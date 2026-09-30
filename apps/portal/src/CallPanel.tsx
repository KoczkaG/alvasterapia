import type { PhoneKind } from '@somnoshop/shared';
import { useEffect, useState } from 'react';
import {
  completeCall,
  getScripts,
  grantRecording,
  refuseRecording,
  startCall,
  type CallRecord,
  type CallScripts,
} from './callsApi';

/**
 * Pulti Click-to-Call panel (I/C). Egy regisztrált beteg számai mellett
 * hívásindító gombokkal, a kötelező GDPR-sablonnal és a rögzítés-kezeléssel.
 *
 * (Demó-adatok: valós használatban a beteg adatlapjáról / KVL-ből jönnek a
 * számok. A kezelő azonosítója később az Auth modulból.)
 */

const PHONE_LABELS: Record<PhoneKind, string> = {
  patient_mobile: 'Beteg mobil',
  patient_landline: 'Beteg vezetékes',
  authorized_contact: 'Jogosult kapcsolattartó',
};

const DEMO_PARTNER = {
  partnerCode: 'P-000123',
  name: 'Kovács Lajosné',
  numbers: [
    { kind: 'patient_mobile' as PhoneKind, number: '+36 30 123 4567' },
    { kind: 'patient_landline' as PhoneKind, number: '+36 1 234 5678' },
    { kind: 'authorized_contact' as PhoneKind, number: '+36 20 987 6543' },
  ],
};

const OPERATOR = 'pult.demo'; // placeholder; később Auth

export function CallPanel() {
  const [scripts, setScripts] = useState<CallScripts | null>(null);
  const [call, setCall] = useState<CallRecord | null>(null);
  const [showReassurance, setShowReassurance] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getScripts().then(setScripts).catch(() => setError('A szövegek betöltése sikertelen.'));
  }, []);

  async function handleDial(kind: PhoneKind, number: string) {
    setError(null);
    setBusy(true);
    try {
      const rec = await startCall(
        {
          partnerCode: DEMO_PARTNER.partnerCode,
          phoneKind: kind,
          phoneNumber: number,
          origin: 'counter',
        },
        OPERATOR,
      );
      setCall(rec);
      setShowReassurance(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Hívásindítási hiba.');
    } finally {
      setBusy(false);
    }
  }

  async function act(fn: () => Promise<CallRecord>) {
    setBusy(true);
    setError(null);
    try {
      setCall(await fn());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Hiba.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <header className="brand">
        <h1>SOMNO SHOP</h1>
        <p>Click-to-Call — kimenő hívás (pult)</p>
      </header>

      {error && <div className="banner danger">{error}</div>}

      {/* A beteg és a hívható számai */}
      <section className="card">
        <h2>{DEMO_PARTNER.name}</h2>
        <p className="hint">Ügyfélazonosító: {DEMO_PARTNER.partnerCode}</p>
        {DEMO_PARTNER.numbers.map((n) => (
          <div
            key={n.kind}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '10px 0',
              borderBottom: '1px solid #eef1f5',
            }}
          >
            <span>
              <strong>{PHONE_LABELS[n.kind]}</strong>
              <br />
              <span className="hint">{n.number}</span>
            </span>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ width: 'auto', marginTop: 0, padding: '10px 16px' }}
              disabled={busy || (call !== null && call.status === 'dialing')}
              onClick={() => handleDial(n.kind, n.number)}
            >
              📞 Hívás
            </button>
          </div>
        ))}
      </section>

      {/* Aktív hívás — GDPR-sablon és rögzítés-kezelés */}
      {call && (
        <section className="card">
          <h2>Aktív hívás</h2>
          <p className="hint">
            {call.phoneNumber} — állapot: <strong>{call.status}</strong>, rögzítés:{' '}
            <strong>{call.recordingConsent}</strong>
          </p>

          {call.recordingConsent === 'pending' && scripts && (
            <>
              <div className="legal-note">
                <strong>Mondja be a hívottnak:</strong>
                <br />
                {scripts.recordingNotice}
              </div>

              {showReassurance && (
                <div className="banner warn" style={{ marginTop: 12 }}>
                  {scripts.reassuranceScript}
                </div>
              )}

              <div className="row" style={{ marginTop: 16 }}>
                <button
                  type="button"
                  className="btn"
                  style={{ marginTop: 0 }}
                  disabled={busy}
                  onClick={() => act(() => grantRecording(call.id, OPERATOR))}
                >
                  Hozzájárult
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ marginTop: 0 }}
                  disabled={busy}
                  onClick={() => act(() => refuseRecording(call.id, OPERATOR))}
                >
                  Hangrögzítés leállítása
                </button>
              </div>

              <button
                type="button"
                className="muted-link"
                style={{ marginTop: 12 }}
                onClick={() => setShowReassurance((v) => !v)}
              >
                {showReassurance ? 'Érvkészlet elrejtése' : 'Az ügyfél gyanakszik? (érvkészlet)'}
              </button>
            </>
          )}

          {call.recordingConsent === 'refused' && (
            <div className="banner danger">
              A felvétel az ügyfél tiltása miatt leállt és törlődött. A művelet
              módosíthatatlanul naplózva.
            </div>
          )}
          {call.recordingConsent === 'granted' && (
            <div className="banner ok">A rögzítés engedélyezve.</div>
          )}

          {call.status !== 'completed' && call.status !== 'failed' && (
            <div className="row" style={{ marginTop: 16 }}>
              <button
                type="button"
                className="btn"
                style={{ marginTop: 0 }}
                disabled={busy}
                onClick={() =>
                  act(() => completeCall(call.id, 'completed', OPERATOR))
                }
              >
                Hívás lezárása
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ marginTop: 0 }}
                disabled={busy}
                onClick={() =>
                  act(() => completeCall(call.id, 'failed', OPERATOR))
                }
              >
                Nem vették fel
              </button>
            </div>
          )}

          {(call.status === 'completed' || call.status === 'failed') && (
            <div
              className={`banner ${call.status === 'completed' ? 'ok' : 'warn'}`}
              style={{ marginTop: 12 }}
            >
              A hívás lezárva ({call.status}). A hívás ténye a beteg
              idővonalára került.
              {call.recordingUri && (
                <>
                  <br />
                  Felvétel: <code>{call.recordingUri}</code>
                </>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
