import {
  invoiceTotal,
  PAYMENT_METHOD_LABELS,
  type BillingCodeKind,
  type InvoiceItem,
  type PaymentMethod,
} from '@somnoshop/shared';
import { useState } from 'react';
import {
  createDraft,
  finalizeDraft,
  validateCode,
  type FinalizeResult,
} from './invoicingApi';

/**
 * Pulti Számlázási Védőháló panel (II/D). Tételek összeállítása, fizetési mód,
 * a kétirányú zárási szűrő és a kártyás terminál-védőháló bemutatása. Külön
 * widget az élő kód-validátorhoz (Elírás-Gátló).
 */

const OPERATOR = 'pult.demo'; // placeholder; később Auth
const PAYMENTS: PaymentMethod[] = ['cash', 'card', 'transfer', 'cod'];
const CODE_KINDS: { kind: BillingCodeKind; label: string; hint: string }[] = [
  { kind: 'prescription', label: 'Vénykód', hint: '27-tel kezdődik' },
  { kind: 'matrica', label: 'Matrica (egyedi)', hint: '21-gyel kezdődik' },
  { kind: 'doctor', label: 'Orvoskód', hint: '99-cel kezdődik' },
];

export function BillingPanel() {
  // Tétellista
  const [items, setItems] = useState<InvoiceItem[]>([
    { code: 'MASK-01', name: 'JOYCEeasy orrmaszk', quantity: 1, unitGross: 12000 },
  ]);
  const [payment, setPayment] = useState<PaymentMethod>('card');
  const [partnerCode] = useState('P-000123');

  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newQty, setNewQty] = useState(1);
  const [newPrice, setNewPrice] = useState(0);
  const [isPostage, setIsPostage] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FinalizeResult | null>(null);
  const [busy, setBusy] = useState(false);

  // Kód-validátor widget
  const [vKind, setVKind] = useState<BillingCodeKind>('prescription');
  const [vCode, setVCode] = useState('');
  const [vResult, setVResult] = useState<{ valid: boolean; message?: string } | null>(
    null,
  );

  const total = invoiceTotal(items);

  function addItem() {
    if (!newCode.trim() || !newName.trim()) {
      setError('A tételhez cikkszám és megnevezés kell.');
      return;
    }
    setItems((cur) => [
      ...cur,
      {
        code: newCode.trim(),
        name: newName.trim(),
        quantity: newQty,
        unitGross: newPrice,
        ...(isPostage ? { isPostage: true } : {}),
      },
    ]);
    setNewCode('');
    setNewName('');
    setNewQty(1);
    setNewPrice(0);
    setIsPostage(false);
    setError(null);
  }

  function removeItem(idx: number) {
    setItems((cur) => cur.filter((_, i) => i !== idx));
  }

  async function finalize() {
    setError(null);
    setResult(null);
    setBusy(true);
    try {
      const draft = await createDraft({ partnerCode, items, payment }, OPERATOR);
      const fin = await finalizeDraft(draft.id, OPERATOR);
      setResult(fin);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Számlázási hiba.');
    } finally {
      setBusy(false);
    }
  }

  async function runValidate() {
    setVResult(await validateCode(vKind, vCode));
  }

  return (
    <div className="page">
      <header className="brand">
        <h1>SOMNO SHOP</h1>
        <p>Pulti számlázás — védőháló (II/D)</p>
      </header>

      {error && <div className="banner danger">{error}</div>}

      {/* Élő kód-validátor */}
      <section className="card">
        <h2>Kód-ellenőrző (Elírás-Gátló)</h2>
        <div className="row">
          <select
            value={vKind}
            onChange={(e) => setVKind(e.target.value as BillingCodeKind)}
          >
            {CODE_KINDS.map((c) => (
              <option key={c.kind} value={c.kind}>
                {c.label} ({c.hint})
              </option>
            ))}
          </select>
          <input
            type="text"
            inputMode="numeric"
            placeholder="kód"
            value={vCode}
            onChange={(e) => setVCode(e.target.value)}
          />
          <button
            type="button"
            className="btn btn-secondary"
            style={{ marginTop: 0, width: 'auto', padding: '11px 16px' }}
            onClick={runValidate}
          >
            Ellenőrzés
          </button>
        </div>
        {vResult && (
          <div
            className={`banner ${vResult.valid ? 'ok' : 'danger'}`}
            style={{ marginTop: 12 }}
          >
            {vResult.valid ? 'Érvényes kód.' : vResult.message}
          </div>
        )}
      </section>

      {/* Tétellista */}
      <section className="card">
        <h2>Számla tételei</h2>
        {items.map((it, idx) => (
          <div
            key={idx}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '8px 0',
              borderBottom: '1px solid #eef1f5',
            }}
          >
            <span>
              <strong>{it.name}</strong> {it.isPostage && '📮'}
              <br />
              <span className="hint">
                {it.quantity} × {it.unitGross.toLocaleString('hu-HU')} Ft
              </span>
            </span>
            <button
              type="button"
              className="muted-link"
              onClick={() => removeItem(idx)}
            >
              törlés
            </button>
          </div>
        ))}
        <p style={{ textAlign: 'right', fontWeight: 700, marginTop: 8 }}>
          Összesen: {total.toLocaleString('hu-HU')} Ft
        </p>

        <h3 style={{ fontSize: 15, marginTop: 8 }}>Új tétel</h3>
        <div className="row">
          <input
            type="text"
            placeholder="cikkszám"
            value={newCode}
            onChange={(e) => setNewCode(e.target.value)}
          />
          <input
            type="text"
            placeholder="megnevezés"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
        </div>
        <div className="row">
          <input
            type="number"
            min={1}
            value={newQty}
            onChange={(e) => setNewQty(Number(e.target.value))}
          />
          <input
            type="number"
            min={0}
            placeholder="bruttó egységár"
            value={newPrice}
            onChange={(e) => setNewPrice(Number(e.target.value))}
          />
        </div>
        <label className="consent-item" style={{ borderBottom: 'none' }}>
          <input
            type="checkbox"
            checked={isPostage}
            onChange={(e) => setIsPostage(e.target.checked)}
          />
          <span className="consent-text">Ez a tétel a postaköltség</span>
        </label>
        <button type="button" className="btn btn-secondary" onClick={addItem}>
          Tétel hozzáadása
        </button>
      </section>

      {/* Fizetési mód + véglegesítés */}
      <section className="card">
        <h2>Fizetés és lezárás</h2>
        <label htmlFor="pm">Fizetési mód</label>
        <select
          id="pm"
          value={payment}
          onChange={(e) => setPayment(e.target.value as PaymentMethod)}
        >
          {PAYMENTS.map((p) => (
            <option key={p} value={p}>
              {PAYMENT_METHOD_LABELS[p]}
            </option>
          ))}
        </select>
        <p className="hint">
          Tipp a demóhoz: a mock terminál a 150 000 Ft feletti kártyás összeget
          „limit" hibával elutasítja — ilyenkor a számla NEM élesedik.
        </p>
        <button type="button" className="btn" onClick={finalize} disabled={busy}>
          Számla lezárása
        </button>
      </section>

      {result && (
        <div
          className={`banner ${result.status === 'issued' ? 'ok' : 'danger'}`}
        >
          {result.status === 'issued' ? (
            <>
              Számla kiállítva: <strong>{result.draft.invoiceNumber}</strong> (
              {result.draft.amountGross.toLocaleString('hu-HU')} Ft). A számla a
              beteg idővonalára került.
            </>
          ) : (
            <>
              A kártyás fizetés elutasítva ({result.declineReason}). A számla NEM
              élesedett — nincs stornó, a tervezet nyitva maradt. Kérjen másik
              kártyát vagy váltson fizetési módot.
            </>
          )}
        </div>
      )}
    </div>
  );
}
