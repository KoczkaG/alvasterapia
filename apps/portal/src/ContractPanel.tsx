import type { ContractItem, ContractPatient, GdprConsent } from '@somnoshop/shared';
import { useState } from 'react';
import {
  closeContract,
  confirmSms,
  createContract,
  pay,
  recordConsent,
  requestSms,
  scanSheet,
  setCart,
  signPaper,
  type ContractRecord,
} from './contractApi';

/**
 * Pulti Szerződéskötő panel (III. Modul / A). Lépésenkénti folyamat:
 * OCR-beemelés → GDPR-kapu → kosár → fizetés → SMS/papír aláírás → lezárás.
 */
const OP = 'pultos.demo'; // placeholder; később Auth
const fmt = (n: number) => `${n.toLocaleString('hu-HU')} Ft`;

const EMPTY_PATIENT: ContractPatient = {
  name: '',
  taj: '',
  zip: '',
  city: '',
  address: '',
  doctorName: '',
  doctorStamp: '',
  pressure: 0,
};

export function ContractPanel() {
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [partnerCode, setPartnerCode] = useState('P-000456');
  const [docRef, setDocRef] = useState('ambulans-demo-2');
  const [patient, setPatient] = useState<ContractPatient>(EMPTY_PATIENT);

  const [contract, setContract] = useState<ContractRecord | null>(null);
  const [consent, setConsent] = useState<GdprConsent>({
    wearTimeInfo: true,
    newsletter: false,
    postalContact: true,
    emailContact: true,
  });
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState('');

  const status = contract?.status ?? null;

  // Demó-kosár (a dokumentum szerinti tipikus próbakezelés).
  const items: ContractItem[] = [
    { productType: 'keszulek', name: 'Prisma Smart Plus', serialNumber: 'PSP-1001', deposit: 50000, price: 0 },
    { productType: 'szuro', name: 'Baktériumszűrő', deposit: 0, price: 3000 },
    { productType: 'szuro', name: 'Baktériumszűrő', deposit: 0, price: 3000 },
  ];

  function guard<T>(fn: () => Promise<T>) {
    return async () => {
      setError(null);
      setMsg(null);
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Hiba történt.');
      }
    };
  }

  const doScan = guard(async () => {
    setPatient(await scanSheet(docRef));
    setMsg('Ambuláns lap beolvasva — ellenőrizze és pótolja a hiányzó adatokat.');
  });

  const doCreate = guard(async () => {
    setContract(
      await createContract(
        { partnerCode, patient, purchaseDate: new Date().toISOString().slice(0, 10) },
        OP,
      ),
    );
  });

  const doConsent = guard(async () => {
    if (contract) setContract(await recordConsent(contract.id, consent, OP));
  });

  const doCart = guard(async () => {
    if (contract) setContract(await setCart(contract.id, items, OP));
  });

  const doPay = guard(async () => {
    if (!contract) return;
    const res = await pay(contract.id, OP);
    setContract(res.contract);
    if (res.status === 'declined') {
      setError(`Kártyás fizetés elutasítva: ${res.declineReason ?? 'ismeretlen'}. A kosár megmaradt.`);
    }
  });

  const doRequestSms = guard(async () => {
    if (!contract) return;
    const res = await requestSms(contract.id);
    setChallengeId(res.challengeId);
    setMsg('SMS-kód elküldve a beteg mobiljára (mock: 4321).');
  });

  const doConfirmSms = guard(async () => {
    if (contract && challengeId)
      setContract(await confirmSms(contract.id, challengeId, code, OP));
  });

  const doPaper = guard(async () => {
    if (contract) setContract(await signPaper(contract.id, OP));
  });

  const doClose = guard(async () => {
    if (contract) setContract(await closeContract(contract.id, OP));
  });

  return (
    <div className="page">
      <header className="brand">
        <h1>SOMNO SHOP</h1>
        <p>Pulti szerződéskötés (III/A)</p>
      </header>

      {error && <div className="banner danger">{error}</div>}
      {msg && <div className="banner ok">{msg}</div>}

      {status && (
        <div className="banner" style={{ marginBottom: 12 }}>
          Állapot: <strong>{status}</strong>
          {contract?.grandTotal ? ` · Fizetendő: ${fmt(contract.grandTotal)}` : ''}
        </div>
      )}

      {/* 1. OCR + beteg-adatok */}
      <section className="card">
        <h2>1. Ambuláns lap (OCR) és beteg-adatok</h2>
        <label htmlFor="pc">Partnerkód</label>
        <input id="pc" value={partnerCode} onChange={(e) => setPartnerCode(e.target.value)} />
        <label htmlFor="doc">Ambuláns lap azonosító (demó)</label>
        <div className="row">
          <input id="doc" value={docRef} onChange={(e) => setDocRef(e.target.value)} />
          <button type="button" className="btn" style={{ marginTop: 0 }} onClick={doScan}>
            Beolvasás (OCR)
          </button>
        </div>

        <div className="row">
          <div>
            <label>Név</label>
            <input value={patient.name} onChange={(e) => setPatient({ ...patient, name: e.target.value })} />
          </div>
          <div>
            <label>TAJ</label>
            <input value={patient.taj} onChange={(e) => setPatient({ ...patient, taj: e.target.value })} />
          </div>
        </div>
        <div className="row">
          <div>
            <label>Terápiás nyomás (vízcm)</label>
            <input
              type="number"
              value={patient.pressure || ''}
              onChange={(e) => setPatient({ ...patient, pressure: Number(e.target.value) })}
            />
          </div>
          <div>
            <label>Orvos pecsétszáma</label>
            <input value={patient.doctorStamp} onChange={(e) => setPatient({ ...patient, doctorStamp: e.target.value })} />
          </div>
        </div>
        <button type="button" className="btn" onClick={doCreate} disabled={!!contract}>
          Szerződéstervezet létrehozása
        </button>
      </section>

      {/* 2. GDPR */}
      {contract && (
        <section className="card">
          <h2>2. GDPR / marketing kapu</h2>
          {(['wearTimeInfo', 'newsletter', 'postalContact', 'emailContact'] as const).map((k) => (
            <label key={k} style={{ display: 'block' }}>
              <input
                type="checkbox"
                checked={consent[k]}
                onChange={(e) => setConsent({ ...consent, [k]: e.target.checked })}
              />{' '}
              {k === 'wearTimeInfo' && 'Kihordási időről tájékoztatás'}
              {k === 'newsletter' && 'Hírlevél'}
              {k === 'postalContact' && 'Postai küldemény'}
              {k === 'emailContact' && 'E-mailes küldemény'}
            </label>
          ))}
          <button type="button" className="btn" onClick={doConsent} disabled={status !== 'draft'}>
            Nyilatkozat rögzítése
          </button>
        </section>
      )}

      {/* 3-6. további lépések */}
      {contract && (
        <section className="card">
          <h2>3–6. Kosár, fizetés, aláírás, lezárás</h2>
          <p>Demó-kosár: Prisma Smart Plus (kaució 50 000) + 2× baktériumszűrő (3 000).</p>
          <button type="button" className="btn" onClick={doCart} disabled={status !== 'gdpr_ok'}>
            3. Kosár véglegesítése
          </button>
          <button type="button" className="btn" onClick={doPay} disabled={status !== 'cart'}>
            4. Fizetés a terminálon
          </button>

          {status === 'paid' && (
            <div style={{ marginTop: 12 }}>
              <h3>5. Aláírás</h3>
              <button type="button" className="btn" onClick={doRequestSms}>
                SMS-kód küldése
              </button>
              {challengeId && (
                <div className="row">
                  <input placeholder="SMS-kód" value={code} onChange={(e) => setCode(e.target.value)} />
                  <button type="button" className="btn" style={{ marginTop: 0 }} onClick={doConfirmSms}>
                    Kód megerősítése
                  </button>
                </div>
              )}
              <button type="button" className="btn btn-secondary" onClick={doPaper}>
                Papíralapú aláírás (idős/elakadó beteg)
              </button>
            </div>
          )}

          <button type="button" className="btn" onClick={doClose} disabled={status !== 'signed'}>
            6. Lezárás (PDF + jótállás + Idővonal)
          </button>

          {status === 'closed' && (
            <div className="banner ok" style={{ marginTop: 12 }}>
              <p>✅ Szerződés lezárva ({contract.signatureMethod === 'paper' ? 'papír' : 'SMS-aláírás'}).</p>
              <p>Szerződés PDF: {contract.contractPdfUri}</p>
              {contract.warrantyDocs.map((w) => (
                <p key={w.serialNumber}>
                  Jótállás — {w.serialNumber} ({w.productType}): lejárat {w.warrantyExpiry}
                </p>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
