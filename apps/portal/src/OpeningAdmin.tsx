import type {
  DateOverride,
  OpeningCalendar,
  TimeRange,
  Weekday,
} from '@somnoshop/shared';
import { useEffect, useState } from 'react';
import {
  deleteOverride,
  getCalendar,
  getHolidaySuggestions,
  getStatus,
  setWeekly,
  upsertOverride,
  type OpeningStatus,
} from './calendarApi';

const WEEKDAY_NAMES: Record<Weekday, string> = {
  0: 'Vasárnap',
  1: 'Hétfő',
  2: 'Kedd',
  3: 'Szerda',
  4: 'Csütörtök',
  5: 'Péntek',
  6: 'Szombat',
};

const WEEKDAY_ORDER: Weekday[] = [1, 2, 3, 4, 5, 6, 0];

/**
 * Admin felület a nyitvatartási naptár karbantartásához (I/B).
 * A szaküzlet "egyetlen igazságforrása" — bármilyen módosítás a háttérben
 * automatikusan szinkronizálódik az IVR / webshop / Google felé.
 */
export function OpeningAdmin() {
  const [calendar, setCalendar] = useState<OpeningCalendar | null>(null);
  const [status, setStatus] = useState<OpeningStatus | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Új felülírás űrlap
  const [ovDate, setOvDate] = useState('');
  const [ovKind, setOvKind] = useState<'closed' | 'custom'>('closed');
  const [ovLabel, setOvLabel] = useState('');
  const [ovOpen, setOvOpen] = useState('08:00');
  const [ovClose, setOvClose] = useState('14:00');

  const [year, setYear] = useState(new Date().getFullYear());

  async function refresh() {
    try {
      const [cal, st] = await Promise.all([getCalendar(), getStatus()]);
      setCalendar(cal);
      setStatus(st);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Betöltési hiba.');
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  function flash(msg: string) {
    setMessage(msg);
    setError(null);
    window.setTimeout(() => setMessage(null), 4000);
  }

  async function handleAddOverride() {
    setError(null);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ovDate)) {
      setError('Adjon meg érvényes dátumot.');
      return;
    }
    if (!ovLabel.trim()) {
      setError('Adjon meg megnevezést (pl. ünnep neve).');
      return;
    }
    const override: DateOverride = {
      date: ovDate,
      kind: ovKind,
      label: ovLabel.trim(),
      ...(ovKind === 'custom'
        ? { ranges: [{ open: ovOpen, close: ovClose }] as TimeRange[] }
        : {}),
    };
    try {
      const cal = await upsertOverride(override);
      setCalendar(cal);
      void getStatus().then(setStatus);
      flash('Felülírás mentve és szinkronizálva.');
      setOvDate('');
      setOvLabel('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Mentési hiba.');
    }
  }

  async function handleDelete(date: string) {
    try {
      const cal = await deleteOverride(date);
      setCalendar(cal);
      void getStatus().then(setStatus);
      flash('Felülírás törölve.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Törlési hiba.');
    }
  }

  async function handleImportHolidays() {
    setError(null);
    try {
      const suggestions = await getHolidaySuggestions(year);
      // Csak azokat vesszük fel, amelyek még nincsenek a naptárban.
      const existing = new Set(calendar?.overrides.map((o) => o.date));
      const toAdd = suggestions.filter((s) => !existing.has(s.date));
      for (const s of toAdd) {
        await upsertOverride(s);
      }
      await refresh();
      flash(`${toAdd.length} munkaszüneti nap felvéve a(z) ${year}. évre.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import hiba.');
    }
  }

  async function handleResetWeeklyDefault() {
    // Kényelmi gomb: az alapértelmezett heti rend visszaállítása.
    try {
      const cal = await setWeekly(
        {
          0: [],
          1: [{ open: '08:00', close: '17:00' }],
          2: [{ open: '08:00', close: '17:00' }],
          3: [{ open: '08:00', close: '17:00' }],
          4: [{ open: '08:00', close: '18:00' }],
          5: [{ open: '08:00', close: '16:00' }],
          6: [],
        },
        // az actort a szerver 'admin'-ként naplózza
      );
      setCalendar(cal);
      flash('Alapértelmezett heti nyitvatartás beállítva.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Mentési hiba.');
    }
  }

  return (
    <div className="page">
      <header className="brand">
        <h1>SOMNO SHOP</h1>
        <p>Nyitvatartási naptár — admin</p>
      </header>

      {message && <div className="banner ok">{message}</div>}
      {error && <div className="banner danger">{error}</div>}

      {/* Élő státusz */}
      {status && (
        <section className="card">
          <h2>Állapot most</h2>
          <p>
            {status.now.date} {status.now.time} —{' '}
            {status.open ? (
              <strong style={{ color: 'var(--ok)' }}>NYITVA</strong>
            ) : (
              <strong style={{ color: 'var(--danger)' }}>ZÁRVA</strong>
            )}
          </p>
          {!status.open && status.next && (
            <p className="hint">
              Következő nyitás: {status.next.date} {status.next.time}
            </p>
          )}
        </section>
      )}

      {/* Heti alap-nyitvatartás */}
      <section className="card">
        <h2>Heti alap-nyitvatartás</h2>
        {calendar && (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {WEEKDAY_ORDER.map((wd) => {
                const ranges = calendar.weekly[wd];
                return (
                  <tr key={wd}>
                    <td style={{ padding: '4px 0', fontWeight: 600 }}>
                      {WEEKDAY_NAMES[wd]}
                    </td>
                    <td style={{ padding: '4px 0', textAlign: 'right' }}>
                      {ranges.length === 0
                        ? 'zárva'
                        : ranges
                            .map((r) => `${r.open}–${r.close}`)
                            .join(', ')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <button
          type="button"
          className="btn btn-secondary"
          onClick={handleResetWeeklyDefault}
        >
          Alapértelmezett rend visszaállítása
        </button>
      </section>

      {/* Munkaszüneti napok importja */}
      <section className="card">
        <h2>Munkaszüneti napok importja</h2>
        <p className="hint">
          A magyar hivatalos munkaszüneti napok felvétele az adott évre. A
          ledolgozós szombatokat és áthelyezett napokat külön, kézzel kell
          rögzíteni.
        </p>
        <div className="row">
          <input
            type="number"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            min={2000}
            max={2100}
          />
          <button
            type="button"
            className="btn btn-secondary"
            style={{ marginTop: 0 }}
            onClick={handleImportHolidays}
          >
            Ünnepek felvétele
          </button>
        </div>
      </section>

      {/* Új felülírás */}
      <section className="card">
        <h2>Egyedi nap felvétele</h2>
        <label htmlFor="ov-date">Dátum</label>
        <input
          id="ov-date"
          type="date"
          value={ovDate}
          onChange={(e) => setOvDate(e.target.value)}
        />

        <label htmlFor="ov-kind">Típus</label>
        <select
          id="ov-kind"
          value={ovKind}
          onChange={(e) => setOvKind(e.target.value as 'closed' | 'custom')}
        >
          <option value="closed">Zárva (ünnep / rendkívüli zárás)</option>
          <option value="custom">
            Rendhagyó nyitvatartás (ledolgozós szombat / rövidített nap)
          </option>
        </select>

        <label htmlFor="ov-label">Megnevezés</label>
        <input
          id="ov-label"
          type="text"
          placeholder="pl. Ledolgozós szombat"
          value={ovLabel}
          onChange={(e) => setOvLabel(e.target.value)}
        />

        {ovKind === 'custom' && (
          <div className="row">
            <div>
              <label htmlFor="ov-open">Nyitás</label>
              <input
                id="ov-open"
                type="time"
                value={ovOpen}
                onChange={(e) => setOvOpen(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="ov-close">Zárás</label>
              <input
                id="ov-close"
                type="time"
                value={ovClose}
                onChange={(e) => setOvClose(e.target.value)}
              />
            </div>
          </div>
        )}

        <button type="button" className="btn" onClick={handleAddOverride}>
          Felvétel és szinkronizálás
        </button>
      </section>

      {/* Meglévő felülírások */}
      <section className="card">
        <h2>Rögzített egyedi napok</h2>
        {calendar && calendar.overrides.length === 0 && (
          <p className="hint">Nincs felvett egyedi nap.</p>
        )}
        {calendar &&
          calendar.overrides.map((o) => (
            <div
              key={o.date}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 0',
                borderBottom: '1px solid #eef1f5',
              }}
            >
              <span>
                <strong>{o.date}</strong> — {o.label}{' '}
                {o.kind === 'closed'
                  ? '(zárva)'
                  : `(${o.ranges?.map((r) => `${r.open}–${r.close}`).join(', ')})`}
              </span>
              <button
                type="button"
                className="muted-link"
                onClick={() => handleDelete(o.date)}
              >
                törlés
              </button>
            </div>
          ))}
      </section>
    </div>
  );
}
