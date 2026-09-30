import type { EanPoolStatus } from '@somnoshop/shared';
import { useEffect, useState } from 'react';
import { getPoolStatus, uploadPool } from './eanPoolApi';

/**
 * Admin felület a Virtuális EAN-kód Poolhoz (II/C). Állapot (szabad/felhasznált
 * + kritikus-szint riasztás) és tömb-feltöltés tartományból VAGY listából.
 */
const OPERATOR = 'admin.demo'; // placeholder; később Auth

export function EanPoolAdmin() {
  const [status, setStatus] = useState<EanPoolStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [mode, setMode] = useState<'range' | 'list'>('range');
  const [label, setLabel] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [list, setList] = useState('');

  async function refresh() {
    try {
      setStatus(await getPoolStatus());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Betöltési hiba.');
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function submit() {
    setError(null);
    setMessage(null);
    if (!label.trim()) {
      setError('Adjon meg megnevezést a tömbnek.');
      return;
    }
    try {
      const upload =
        mode === 'range'
          ? { label: label.trim(), range: { from: from.trim(), to: to.trim() } }
          : {
              label: label.trim(),
              codes: list
                .split(/[\s,;]+/)
                .map((c) => c.trim())
                .filter(Boolean),
            };
      const res = await uploadPool(upload, OPERATOR);
      setMessage(`Feltöltve: ${res.added} új kód (${res.skipped} kihagyva).`);
      setFrom('');
      setTo('');
      setList('');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Feltöltési hiba.');
    }
  }

  return (
    <div className="page">
      <header className="brand">
        <h1>SOMNO SHOP</h1>
        <p>EAN-kód pool — admin (II/C)</p>
      </header>

      {error && <div className="banner danger">{error}</div>}
      {message && <div className="banner ok">{message}</div>}

      {status && (
        <section className="card">
          <h2>Pool állapota</h2>
          <p>
            Szabad kódok: <strong>{status.available}</strong> · Felhasznált:{' '}
            <strong>{status.used}</strong>
          </p>
          {status.low && (
            <div className="banner danger">
              ⚠️ FIGYELEM: A NEAK-matricák száma {status.available} — új digitális
              tömb igénylése szükséges! (kritikus szint: {status.threshold})
            </div>
          )}
        </section>
      )}

      <section className="card">
        <h2>Új digitális tömb feltöltése</h2>
        <label htmlFor="lbl">Megnevezés</label>
        <input
          id="lbl"
          type="text"
          placeholder="pl. CPAP-matrica 2026/1"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />

        <label>Feltöltés módja</label>
        <div className="row">
          <button
            type="button"
            className={`btn ${mode === 'range' ? '' : 'btn-secondary'}`}
            style={{ marginTop: 0 }}
            onClick={() => setMode('range')}
          >
            Tartomány
          </button>
          <button
            type="button"
            className={`btn ${mode === 'list' ? '' : 'btn-secondary'}`}
            style={{ marginTop: 0 }}
            onClick={() => setMode('list')}
          >
            Lista
          </button>
        </div>

        {mode === 'range' ? (
          <div className="row">
            <div>
              <label htmlFor="from">Kezdő sorszám</label>
              <input
                id="from"
                type="text"
                inputMode="numeric"
                placeholder="21000001"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="to">Záró sorszám</label>
              <input
                id="to"
                type="text"
                inputMode="numeric"
                placeholder="21000500"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          </div>
        ) : (
          <>
            <label htmlFor="list">Kódok (vessző/szóköz/új sor elválasztva)</label>
            <textarea
              id="list"
              rows={4}
              value={list}
              onChange={(e) => setList(e.target.value)}
              style={{
                width: '100%',
                padding: '11px 12px',
                fontSize: 16,
                border: '1px solid var(--border)',
                borderRadius: 8,
                fontFamily: 'inherit',
              }}
              placeholder="21000001, 21000002, 21000003"
            />
          </>
        )}

        <button type="button" className="btn" onClick={submit}>
          Feltöltés
        </button>
      </section>
    </div>
  );
}
