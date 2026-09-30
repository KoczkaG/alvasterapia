import { CALL_TOPIC_LABELS, DEFAULT_REFERRERS } from '@somnoshop/shared';
import { useEffect, useState } from 'react';
import { getCallStats, type CallStatsSummary } from './callsApi';

/**
 * Vezetői statisztikai dashboard (I/E 4. pont). A hívásvégi jegyzetekből
 * összesített kimutatás: milyen okokból keresik a szaküzletet, mely laborok
 * küldik a legtöbb pácienst, hány visszahívási igény keletkezett.
 */

const REFERRER_NAMES: Record<string, string> = Object.fromEntries(
  DEFAULT_REFERRERS.map((r) => [r.id, r.name]),
);

function Bar({ percent }: { percent: number }) {
  return (
    <div
      style={{
        background: '#eef2f7',
        borderRadius: 6,
        height: 10,
        overflow: 'hidden',
        marginTop: 4,
      }}
    >
      <div
        style={{
          width: `${Math.min(percent, 100)}%`,
          background: 'var(--brand)',
          height: '100%',
        }}
      />
    </div>
  );
}

export function CallStatsView() {
  const [stats, setStats] = useState<CallStatsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getCallStats()
      .then(setStats)
      .catch((e) =>
        setError(e instanceof Error ? e.message : 'Betöltési hiba.'),
      );
  }, []);

  return (
    <div className="page">
      <header className="brand">
        <h1>SOMNO SHOP</h1>
        <p>Hívásstatisztika — vezetői dashboard</p>
      </header>

      {error && <div className="banner danger">{error}</div>}

      {stats && (
        <>
          <section className="card">
            <h2>Összesítés</h2>
            <p>
              Rögzített hívásvégi jegyzetek:{' '}
              <strong>{stats.totalNotes}</strong>
              <br />
              Visszahívási igények: <strong>{stats.followUpCount}</strong>
            </p>
          </section>

          <section className="card">
            <h2>Hívások okai (téma szerint)</h2>
            {stats.topicBreakdown.length === 0 && (
              <p className="hint">Nincs adat.</p>
            )}
            {stats.topicBreakdown.map((t) => (
              <div key={t.topic} style={{ margin: '10px 0' }}>
                <div
                  style={{ display: 'flex', justifyContent: 'space-between' }}
                >
                  <span>{CALL_TOPIC_LABELS[t.topic] ?? t.topic}</span>
                  <span className="hint">
                    {t.count} db · {t.percent}%
                  </span>
                </div>
                <Bar percent={t.percent} />
              </div>
            ))}
          </section>

          <section className="card">
            <h2>Küldő laborok / orvosok rangsora</h2>
            {stats.referrerRanking.length === 0 && (
              <p className="hint">Nincs adat.</p>
            )}
            {stats.referrerRanking.map((r, idx) => (
              <div
                key={r.referrerId}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '6px 0',
                  borderBottom: '1px solid #eef1f5',
                }}
              >
                <span>
                  {idx + 1}. {REFERRER_NAMES[r.referrerId] ?? r.referrerId}
                </span>
                <strong>{r.count} db</strong>
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
