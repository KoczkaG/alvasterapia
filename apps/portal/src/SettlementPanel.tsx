import type { ReconciliationResult, WearTimeRule } from '@somnoshop/shared';
import { useEffect, useState } from 'react';
import {
  checkEligibility,
  createDepositSettlement,
  getWearTimeRules,
  reconcileOep,
  setWearTimeRule,
  type DepositSettlementResponse,
  type EligibilityResult,
} from './settlementApi';

/**
 * Elszámolás és Statisztika panel (II. Modul / E):
 *  - Kihordási idő (konfigurálható) + jogosultság-ellenőrző.
 *  - Kaució-Elszámoló Adatlap (átlátható matek).
 *  - OEP Napi Egyeztető (KVL vs. Mankó eltérés).
 */
const OPERATOR = 'admin.demo'; // placeholder; később Auth

const fmt = (n: number) => `${n.toLocaleString('hu-HU')} Ft`;

export function SettlementPanel() {
  return (
    <div className="page">
      <header className="brand">
        <h1>SOMNO SHOP</h1>
        <p>Elszámolás és statisztika (II/E)</p>
      </header>
      <WearTimeSection />
      <DepositSection />
      <OepSection />
    </div>
  );
}

// --- 1. Kihordási idő + jogosultság -----------------------------------------

function WearTimeSection() {
  const [rules, setRules] = useState<WearTimeRule[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [purchaseDate, setPurchaseDate] = useState('');
  const [productType, setProductType] = useState('maszk');
  const [elig, setElig] = useState<EligibilityResult | null>(null);

  async function refresh() {
    try {
      setRules(await getWearTimeRules());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Betöltési hiba.');
    }
  }
  useEffect(() => {
    void refresh();
  }, []);

  async function saveMonths(rule: WearTimeRule, months: number) {
    try {
      await setWearTimeRule({ productType: rule.productType, months }, OPERATOR);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Mentési hiba.');
    }
  }

  async function runEligibility() {
    setError(null);
    try {
      setElig(await checkEligibility({ purchaseDate, productType }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ellenőrzési hiba.');
    }
  }

  return (
    <section className="card">
      <h2>Kihordási idő (törzsadat)</h2>
      {error && <div className="banner danger">{error}</div>}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>Terméktípus</th>
            <th style={{ textAlign: 'left' }}>Kihordás (hónap)</th>
          </tr>
        </thead>
        <tbody>
          {rules.map((r) => (
            <tr key={r.productType}>
              <td>{r.productType}</td>
              <td>
                <input
                  type="number"
                  min={1}
                  defaultValue={r.months}
                  style={{ width: 90 }}
                  onBlur={(e) => {
                    const m = Number(e.target.value);
                    if (m > 0 && m !== r.months) void saveMonths(r, m);
                  }}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Jogosultság-ellenőrző</h3>
      <div className="row">
        <div>
          <label htmlFor="pd">Vásárlás dátuma</label>
          <input
            id="pd"
            type="date"
            value={purchaseDate}
            onChange={(e) => setPurchaseDate(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="pt">Terméktípus</label>
          <select
            id="pt"
            value={productType}
            onChange={(e) => setProductType(e.target.value)}
          >
            {rules.map((r) => (
              <option key={r.productType} value={r.productType}>
                {r.productType}
              </option>
            ))}
          </select>
        </div>
      </div>
      <button type="button" className="btn" onClick={runEligibility}>
        Ellenőrzés
      </button>
      {elig && (
        <div className={`banner ${elig.eligibleNow ? 'ok' : ''}`} style={{ marginTop: 12 }}>
          {elig.eligibleFrom
            ? `Új eszközre jogosult: ${elig.eligibleFrom}-tól. ${
                elig.eligibleNow ? '✅ Már jogosult.' : '⏳ Még nem járt le.'
              }`
            : 'Ehhez a terméktípushoz nincs kihordási szabály.'}
        </div>
      )}
    </section>
  );
}

// --- 2. Kaució-elszámoló ----------------------------------------------------

interface Line {
  a: string;
  b: string;
  c: string;
}

function DepositSection() {
  const [partnerCode, setPartnerCode] = useState('P-000456');
  const [payments, setPayments] = useState<Line[]>([
    { a: '', b: '', c: '' },
  ]);
  const [deductions, setDeductions] = useState<Line[]>([{ a: '', b: '', c: '' }]);
  const [result, setResult] = useState<DepositSettlementResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setResult(null);
    try {
      const p = payments
        .filter((x) => x.a && x.b)
        .map((x) => ({ reference: x.a, amount: Number(x.b), paidOn: x.c }));
      const d = deductions
        .filter((x) => x.a && x.b)
        .map((x) => ({ label: x.a, amount: Number(x.b) }));
      setResult(
        await createDepositSettlement(
          { partnerCode, payments: p, deductions: d },
          OPERATOR,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Elszámolási hiba.');
    }
  }

  return (
    <section className="card">
      <h2>Kaució-Elszámoló Adatlap</h2>
      {error && <div className="banner danger">{error}</div>}
      <label htmlFor="pc">Partnerkód</label>
      <input
        id="pc"
        type="text"
        value={partnerCode}
        onChange={(e) => setPartnerCode(e.target.value)}
      />

      <h3>Befizetések</h3>
      {payments.map((line, i) => (
        <div className="row" key={i}>
          <input
            placeholder="Bizonylatszám"
            value={line.a}
            onChange={(e) =>
              setPayments((s) => s.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)))
            }
          />
          <input
            placeholder="Összeg (Ft)"
            type="number"
            value={line.b}
            onChange={(e) =>
              setPayments((s) => s.map((x, j) => (j === i ? { ...x, b: e.target.value } : x)))
            }
          />
          <input
            type="date"
            value={line.c}
            onChange={(e) =>
              setPayments((s) => s.map((x, j) => (j === i ? { ...x, c: e.target.value } : x)))
            }
          />
        </div>
      ))}
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => setPayments((s) => [...s, { a: '', b: '', c: '' }])}
      >
        + Befizetés
      </button>

      <h3>Levonások</h3>
      {deductions.map((line, i) => (
        <div className="row" key={i}>
          <input
            placeholder="Megnevezés"
            value={line.a}
            onChange={(e) =>
              setDeductions((s) => s.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)))
            }
          />
          <input
            placeholder="Összeg (Ft)"
            type="number"
            value={line.b}
            onChange={(e) =>
              setDeductions((s) => s.map((x, j) => (j === i ? { ...x, b: e.target.value } : x)))
            }
          />
        </div>
      ))}
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => setDeductions((s) => [...s, { a: '', b: '', c: '' }])}
      >
        + Levonás
      </button>

      <button type="button" className="btn" onClick={submit} style={{ marginTop: 12 }}>
        Elszámolás
      </button>

      {result && (
        <div className={`banner ${result.result.refundDue ? 'ok' : 'danger'}`} style={{ marginTop: 12 }}>
          <p>Befizetve: {fmt(result.result.totalPaid)}</p>
          <p>Levonások: {fmt(result.result.totalDeductions)}</p>
          <p>
            <strong>
              {result.result.refundDue
                ? `Visszajár: ${fmt(result.result.balance)}`
                : `Ráfizetés: ${fmt(-result.result.balance)}`}
            </strong>
          </p>
          <p>{result.notified ? '✉️ Értesítés elküldve a betegnek.' : 'Nincs e-mail cím — értesítés nem ment ki.'}</p>
        </div>
      )}
    </section>
  );
}

// --- 3. OEP Napi Egyeztető --------------------------------------------------

function OepSection() {
  const [date, setDate] = useState('');
  const [rows, setRows] = useState<Line[]>([{ a: 'maszk', b: '', c: '' }]);
  const [result, setResult] = useState<(ReconciliationResult & { date: string }) | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setResult(null);
    try {
      const kvlCounts = rows
        .filter((x) => x.a && x.b)
        .map((x) => ({ productType: x.a, count: Number(x.b) }));
      setResult(await reconcileOep({ date, kvlCounts }, OPERATOR));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Egyeztetési hiba.');
    }
  }

  return (
    <section className="card">
      <h2>OEP Napi Egyeztető</h2>
      {error && <div className="banner danger">{error}</div>}
      <label htmlFor="od">Nap</label>
      <input id="od" type="date" value={date} onChange={(e) => setDate(e.target.value)} />

      <h3>KVL-es darabszámok</h3>
      {rows.map((line, i) => (
        <div className="row" key={i}>
          <input
            placeholder="Terméktípus"
            value={line.a}
            onChange={(e) =>
              setRows((s) => s.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)))
            }
          />
          <input
            placeholder="Darab"
            type="number"
            value={line.b}
            onChange={(e) =>
              setRows((s) => s.map((x, j) => (j === i ? { ...x, b: e.target.value } : x)))
            }
          />
        </div>
      ))}
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => setRows((s) => [...s, { a: '', b: '', c: '' }])}
      >
        + Termék
      </button>
      <button type="button" className="btn" onClick={submit} style={{ marginTop: 12 }}>
        Egyeztetés
      </button>

      {result && (
        <>
          <div className={`banner ${result.allMatch ? 'ok' : 'danger'}`} style={{ marginTop: 12 }}>
            {result.allMatch
              ? '✅ Minden darabszám egyezik a Mankóval.'
              : '⚠️ Eltérés a KVL és a Mankó között — javítás szükséges még ma!'}
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Termék</th>
                <th>KVL</th>
                <th>Mankó</th>
                <th>Eltérés</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((r) => (
                <tr key={r.productType} style={{ color: r.match ? undefined : '#b00020' }}>
                  <td>{r.productType}</td>
                  <td style={{ textAlign: 'center' }}>{r.kvlCount}</td>
                  <td style={{ textAlign: 'center' }}>{r.mankoCount}</td>
                  <td style={{ textAlign: 'center' }}>{r.diff === 0 ? '—' : r.diff}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
