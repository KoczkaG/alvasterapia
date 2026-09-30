import type { CallTopic, PhoneKind, Referrer } from '@somnoshop/shared';
import { CALL_TOPIC_LABELS } from '@somnoshop/shared';
import { useEffect, useState } from 'react';
import {
  completeCallWithNote,
  getReferrers,
  getScripts,
  grantRecording,
  refuseRecording,
  startCall,
  type CallRecord,
  type CallScripts,
} from './callsApi';

/**
 * Pulti Click-to-Call panel (I/C + I/E). Egy regisztrált beteg számai mellett
 * hívásindító gombokkal, a kötelező GDPR-sablonnal, a rögzítés-kezeléssel, és a
 * hívás végén a KÖTELEZŐ, strukturált hívásvégi jegyzettel (I/E).
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
const ALL_TOPICS = Object.keys(CALL_TOPIC_LABELS) as CallTopic[];

export function CallPanel() {
  const [scripts, setScripts] = useState<CallScripts | null>(null);
  const [referrers, setReferrers] = useState<Referrer[]>([]);
  const [call, setCall] = useState<CallRecord | null>(null);
  const [showReassurance, setShowReassurance] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // A kötelező hívásvégi jegyzet állapota (I/E). A jegyzet-ablak akkor jelenik
  // meg, amikor a kolléga a lezárást kezdeményezi — és amíg nincs kitöltve,
  // a hívás nem zárható le.
  const [closing, setClosing] = useState<null | 'completed' | 'failed'>(null);
  const [topics, setTopics] = useState<CallTopic[]>([]);
  const [referrerId, setReferrerId] = useState('');
  const [summary, setSummary] = useState('');
  const [followUp, setFollowUp] = useState(false);

  useEffect(() => {
    void getScripts()
      .then(setScripts)
      .catch(() => setError('A szövegek betöltése sikertelen.'));
    void getReferrers().then(setReferrers).catch(() => undefined);
  }, []);

  function resetNote() {
    setClosing(null);
    setTopics([]);
    setReferrerId('');
    setSummary('');
    setFollowUp(false);
  }

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
      resetNote();
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

  function toggleTopic(t: CallTopic) {
    setTopics((cur) =>
      cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t],
    );
  }

  async function submitNote() {
    if (!call || !closing) return;
    if (topics.length === 0) {
      setError('Jelöljön meg legalább egy témát.');
      return;
    }
    if (summary.trim().length < 3) {
      setError('Az összefoglaló kitöltése kötelező.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const rec = await completeCallWithNote(
        call.id,
        closing,
        {
          topics,
          referrerId: referrerId || undefined,
          summary: summary.trim(),
          followUpNeeded: followUp,
        },
        OPERATOR,
      );
      setCall(rec);
      resetNote();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'A jegyzet mentése sikertelen.');
    } finally {
      setBusy(false);
    }
  }

  const callClosed =
    call && (call.status === 'completed' || call.status === 'failed');

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
              disabled={busy || (call !== null && !callClosed)}
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
                {showReassurance
                  ? 'Érvkészlet elrejtése'
                  : 'Az ügyfél gyanakszik? (érvkészlet)'}
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

          {/* Lezárás kezdeményezése — a jegyzet-ablak megnyitása */}
          {!callClosed && !closing && (
            <div className="row" style={{ marginTop: 16 }}>
              <button
                type="button"
                className="btn"
                style={{ marginTop: 0 }}
                disabled={busy}
                onClick={() => setClosing('completed')}
              >
                Hívás lezárása
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ marginTop: 0 }}
                disabled={busy}
                onClick={() => setClosing('failed')}
              >
                Nem vették fel
              </button>
            </div>
          )}

          {callClosed && (
            <div
              className={`banner ${call.status === 'completed' ? 'ok' : 'warn'}`}
              style={{ marginTop: 12 }}
            >
              A hívás lezárva ({call.status}), a jegyzet a beteg idővonalára
              került.
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

      {/* KÖTELEZŐ hívásvégi jegyzet (I/E) — amíg nincs kitöltve, nincs lezárás */}
      {call && closing && !callClosed && (
        <section className="card">
          <h2>Hívásvégi jegyzet (kötelező)</h2>
          <p className="hint">
            A hívás csak a jegyzet kitöltése után zárható le.
          </p>

          <label>A hívás témája (legalább egy)</label>
          <div className="consent-group">
            {ALL_TOPICS.map((t) => (
              <label className="consent-item" key={t}>
                <input
                  type="checkbox"
                  checked={topics.includes(t)}
                  onChange={() => toggleTopic(t)}
                />
                <span className="consent-text">{CALL_TOPIC_LABELS[t]}</span>
              </label>
            ))}
          </div>

          <label htmlFor="ref">Küldő intézmény / alváslabor</label>
          <select
            id="ref"
            value={referrerId}
            onChange={(e) => setReferrerId(e.target.value)}
          >
            <option value="">— nincs / nem releváns —</option>
            {referrers.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>

          <label htmlFor="sum">Összefoglaló (kötelező)</label>
          <textarea
            id="sum"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={3}
            style={{
              width: '100%',
              padding: '11px 12px',
              fontSize: 16,
              border: '1px solid var(--border)',
              borderRadius: 8,
              fontFamily: 'inherit',
            }}
            placeholder="A beszélgetés lényege és a megbeszélt megoldás…"
          />

          <label
            className="consent-item"
            style={{ borderBottom: 'none', marginTop: 8 }}
          >
            <input
              type="checkbox"
              checked={followUp}
              onChange={(e) => setFollowUp(e.target.checked)}
            />
            <span className="consent-text">
              Visszahívás / teendő szükséges (automata feladat generálódik)
            </span>
          </label>

          <div className="row" style={{ marginTop: 8 }}>
            <button
              type="button"
              className="btn"
              style={{ marginTop: 0 }}
              disabled={busy}
              onClick={submitNote}
            >
              Jegyzet mentése és lezárás
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ marginTop: 0 }}
              disabled={busy}
              onClick={() => setClosing(null)}
            >
              Mégsem
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
