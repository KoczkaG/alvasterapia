import type { TimelineCategory, TimelineItem } from '@somnoshop/shared';
import { useState } from 'react';
import { getTimeline, type TimelineResponse } from './timelineApi';

/**
 * Központi Ügyféltörténet Idővonal nézet (I/D). Egy beteg teljes múltja
 * egyetlen, időrendi, görgethető listában. Ha a beteg érintett a
 * Philips-csereprojektben, felül KÖTELEZŐ piros riasztás jelenik meg.
 */

const OPERATOR = 'pult.demo'; // placeholder; később Auth

const CATEGORY_LABEL: Record<TimelineCategory, string> = {
  communication: 'Kommunikáció',
  finance: 'Pénzügy',
  inventory: 'Raktár',
  logistics: 'Logisztika',
  service: 'Szerviz',
  consent: 'Adatkezelés',
  alert: 'Riasztás',
};

const CATEGORY_ICON: Record<TimelineCategory, string> = {
  communication: '📞',
  finance: '🧾',
  inventory: '📦',
  logistics: '🚚',
  service: '🔧',
  consent: '📝',
  alert: '⚠️',
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('hu-HU', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function TimelineView() {
  const [partnerCode, setPartnerCode] = useState('P-000123');
  const [data, setData] = useState<TimelineResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setData(await getTimeline(partnerCode.trim(), OPERATOR));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Betöltési hiba.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <header className="brand">
        <h1>SOMNO SHOP</h1>
        <p>Ügyféltörténet — Idővonal</p>
      </header>

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
            onClick={load}
            disabled={loading}
          >
            {loading ? 'Betöltés…' : 'Megnyitás'}
          </button>
        </div>
        <p className="hint">
          Tipp: a demó adatbázisban a <code>P-000123</code> ügyfélnek van
          összefésült előzménye (számla, raktár, csomag).
        </p>
      </section>

      {error && <div className="banner danger">{error}</div>}

      {/* Kötelező Philips-riasztás (I/D 3. pont) */}
      {data?.philipsRecall && (
        <div className="philips-alert">
          <h3>⚠️ FIGYELEM: Philips-csereprojektben érintett ügyfél</h3>
          <p style={{ margin: 0 }}>
            Jelenlegi gépcsere modellje:{' '}
            <strong>{data.philipsRecall.replacementModel}</strong>
            <br />
            Gyári szám: <strong>{data.philipsRecall.serialNumber}</strong>
            {data.philipsRecall.replacedOn && (
              <>
                <br />
                Csere dátuma: {data.philipsRecall.replacedOn}
              </>
            )}
          </p>
        </div>
      )}

      {data && (
        <section className="card">
          <h2>Előzmények ({data.items.length})</h2>
          {data.items.length === 0 ? (
            <p className="hint">Nincs rögzített előzmény ehhez az ügyfélhez.</p>
          ) : (
            <div className="timeline">
              {data.items.map((item) => (
                <TimelineRow key={item.id} item={item} />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function TimelineRow({ item }: { item: TimelineItem }) {
  const detailEntries = item.detail ? Object.entries(item.detail) : [];
  return (
    <div className="tl-item">
      <div className={`tl-badge cat-${item.category}`}>
        {CATEGORY_ICON[item.category]}
      </div>
      <div className="tl-body">
        <div className="tl-text">
          {item.text}
          <span className="tl-source">
            {item.source === 'kvl' ? 'KVL' : 'belső'}
          </span>
        </div>
        <div className="tl-meta">
          {CATEGORY_LABEL[item.category]} · {formatWhen(item.occurredAt)}
        </div>
        {detailEntries.length > 0 && (
          <div className="tl-detail">
            {detailEntries.map(([k, v]) => (
              <div key={k}>
                <strong>{k}:</strong>{' '}
                {typeof v === 'object' ? JSON.stringify(v) : String(v)}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
