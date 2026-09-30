import {
  CURRENT_POLICY_VERSION,
  isZeroConsent,
  patientFormSchema,
  type MarketingAnswers,
  type PatientForm,
} from '@somnoshop/shared';
import { useEffect, useMemo, useState } from 'react';
import {
  resolveZip,
  searchByBirthDate,
  submitForm,
  type PartnerSummary,
  type SubmissionResult,
} from './api';
import { CONSENT_QUESTIONS } from './consentQuestions';

type FieldErrors = Partial<Record<string, string>>;

const EMPTY_MARKETING: MarketingAnswers = {
  kihordasiIdoTajekoztatas: false,
  hirlevel: false,
  postaiKuldemeny: false,
  emailKuldemeny: false,
};

/**
 * A csatorna a query paraméterből jön:  ?channel=kiosk  a pulti tabletnél.
 * Alapból 'online' (a páciens otthoni kitöltése).
 */
function detectChannel(): 'online' | 'kiosk' {
  const params = new URLSearchParams(window.location.search);
  return params.get('channel') === 'kiosk' ? 'kiosk' : 'online';
}

export function App() {
  const channel = useMemo(detectChannel, []);

  // Űrlap állapot
  const [partnerCode, setPartnerCode] = useState<string | undefined>();
  const [name, setName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [taj, setTaj] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [zip, setZip] = useState('');
  const [city, setCity] = useState('');
  const [cityOptions, setCityOptions] = useState<string[]>([]);
  const [address, setAddress] = useState('');
  const [marketing, setMarketing] = useState<MarketingAnswers>(EMPTY_MARKETING);

  // Folyamatállapot
  const [lookupState, setLookupState] = useState<
    'idle' | 'searching' | 'found' | 'multiple' | 'none'
  >('idle');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmissionResult | null>(null);

  // Irányítószám → település automatikus kitöltés (I/A 4. pont)
  useEffect(() => {
    if (!/^\d{4}$/.test(zip)) {
      setCityOptions([]);
      return;
    }
    let cancelled = false;
    void resolveZip(zip).then((res) => {
      if (cancelled) return;
      if (res) {
        setCityOptions(res.alternatives);
        // Csak akkor töltjük ki, ha a felhasználó még nem írt be sajátot,
        // vagy egyértelmű (egy találat).
        if (res.alternatives.length === 1 || !city) {
          setCity(res.city);
        }
      } else {
        setCityOptions([]);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zip]);

  function applyPartner(p: PartnerSummary) {
    setPartnerCode(p.partnerCode);
    setName(p.name);
    setTaj(p.taj ?? '');
    setEmail(p.email ?? '');
    setMobile(p.mobile ?? '');
    setZip(p.zip ?? '');
    setCity(p.city ?? '');
    setAddress(p.address ?? '');
  }

  async function handleLookup() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
      setErrors((e) => ({
        ...e,
        birthDate: 'Adja meg a születési dátumát az előhíváshoz.',
      }));
      return;
    }
    setLookupState('searching');
    try {
      const res = await searchByBirthDate(birthDate);
      if (res.matchType === 'single') {
        applyPartner(res.partner);
        setLookupState('found');
      } else if (res.matchType === 'multiple') {
        setLookupState('multiple');
      } else {
        setLookupState('none');
      }
    } catch {
      setLookupState('none');
    }
  }

  function buildForm(): PatientForm {
    return {
      partnerCode,
      name: name.trim(),
      birthDate,
      taj: taj.trim() || undefined,
      email: email.trim() || undefined,
      mobile: mobile.trim() || undefined,
      zip: zip.trim(),
      city: city.trim(),
      address: address.trim(),
      marketing,
    };
  }

  async function handleSubmit() {
    setSubmitError(null);
    const form = buildForm();
    const parsed = patientFormSchema.safeParse(form);
    if (!parsed.success) {
      const fieldErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        fieldErrors[issue.path.join('.')] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const res = await submitForm(parsed.data, channel);
      setResult(res);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Ismeretlen hiba történt.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return <SuccessView result={result} channel={channel} />;
  }

  const zeroConsent = isZeroConsent(marketing);

  return (
    <div className="page">
      <header className="brand">
        <h1>SOMNO SHOP</h1>
        <p>
          {channel === 'kiosk'
            ? 'Adatlap kitöltése (üzleti tablet)'
            : 'Online adatlap kitöltése'}
        </p>
      </header>

      {/* Régi ügyfél diszkrét előhívása (I/A 3. pont) */}
      <section className="card">
        <h2>Régi ügyfél vagyok</h2>
        <p className="hint">
          Ha korábban már vásárolt nálunk, a születési dátumával előhívhatja az
          adatait, hogy ne kelljen mindent újra beírnia.
        </p>
        <label htmlFor="lookup-bd">Születési dátum</label>
        <div className="row">
          <input
            id="lookup-bd"
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
          />
          <button
            type="button"
            className="btn btn-secondary"
            style={{ marginTop: 0 }}
            onClick={handleLookup}
            disabled={lookupState === 'searching'}
          >
            {lookupState === 'searching' ? 'Keresés…' : 'Előhívás'}
          </button>
        </div>
        {lookupState === 'found' && (
          <div className="banner ok" style={{ marginTop: 12 }}>
            Megtaláltuk az adatait. Kérjük, ellenőrizze és pótolja a hiányzó
            mezőket lentebb.
          </div>
        )}
        {lookupState === 'multiple' && (
          <div className="banner warn" style={{ marginTop: 12 }}>
            Több páciens is szerepel ezzel a születési dátummal. Kérjük, töltse
            ki az adatlapot alább, vagy kérje munkatársunk segítségét.
          </div>
        )}
        {lookupState === 'none' && (
          <div className="banner warn" style={{ marginTop: 12 }}>
            Nem találtunk adatlapot ezzel a dátummal. Kérjük, töltse ki az
            adatlapot új ügyfélként alább.
          </div>
        )}
      </section>

      {/* Személyes adatok */}
      <section className="card">
        <h2>Személyes adatok</h2>

        <label htmlFor="name">Név *</label>
        <input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {errors.name && <div className="field-error">{errors.name}</div>}

        <label htmlFor="bd">Születési dátum *</label>
        <input
          id="bd"
          type="date"
          value={birthDate}
          onChange={(e) => setBirthDate(e.target.value)}
        />
        {errors.birthDate && (
          <div className="field-error">{errors.birthDate}</div>
        )}

        <label htmlFor="taj">TAJ-szám</label>
        <input
          id="taj"
          type="text"
          inputMode="numeric"
          placeholder="9 számjegy"
          value={taj}
          onChange={(e) => setTaj(e.target.value)}
        />
        {errors.taj && <div className="field-error">{errors.taj}</div>}

        <div className="row">
          <div>
            <label htmlFor="email">E-mail cím</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {errors.email && (
              <div className="field-error">{errors.email}</div>
            )}
          </div>
          <div>
            <label htmlFor="mobile">Mobiltelefonszám</label>
            <input
              id="mobile"
              type="tel"
              placeholder="+36 30 123 4567"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
            />
            {errors.mobile && (
              <div className="field-error">{errors.mobile}</div>
            )}
          </div>
        </div>
      </section>

      {/* Lakcím — irányítószám automatikus feloldással */}
      <section className="card">
        <h2>Lakcím</h2>
        <div className="row">
          <div style={{ flex: '0 0 130px' }}>
            <label htmlFor="zip">Irányítószám *</label>
            <input
              id="zip"
              type="text"
              inputMode="numeric"
              maxLength={4}
              value={zip}
              onChange={(e) =>
                setZip(e.target.value.replace(/\D/g, '').slice(0, 4))
              }
            />
            {errors.zip && <div className="field-error">{errors.zip}</div>}
          </div>
          <div>
            <label htmlFor="city">Település *</label>
            {cityOptions.length > 1 ? (
              <select
                id="city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              >
                <option value="">Válasszon…</option>
                {cityOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id="city"
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
            )}
            {errors.city && <div className="field-error">{errors.city}</div>}
          </div>
        </div>
        {cityOptions.length === 0 && /^\d{4}$/.test(zip) && (
          <div className="hint">
            Ez az irányítószám nincs az adatbázisban — kérjük, adja meg a
            települést kézzel.
          </div>
        )}

        <label htmlFor="address">Cím (utca, házszám) *</label>
        <input
          id="address"
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
        {errors.address && (
          <div className="field-error">{errors.address}</div>
        )}
      </section>

      {/* GDPR / marketing hozzájárulások — a 4 kötelező kérdés */}
      <section className="card">
        <h2>Adatkezelési és kapcsolattartási nyilatkozat</h2>
        <p className="hint">
          Kérjük, jelölje meg az alábbi lehetőségeket. A válaszait bármikor
          módosíthatja.
        </p>
        <div className="consent-group">
          {CONSENT_QUESTIONS.map((q) => (
            <label className="consent-item" key={q.key}>
              <input
                type="checkbox"
                checked={marketing[q.key]}
                onChange={(e) =>
                  setMarketing((m) => ({ ...m, [q.key]: e.target.checked }))
                }
              />
              <span className="consent-text">{q.label}</span>
            </label>
          ))}
        </div>

        {zeroConsent && (
          <div className="banner warn" style={{ marginTop: 12 }}>
            Ön sem postai, sem e-mailes küldeményhez nem járult hozzá. Ebben az
            esetben a dokumentumokat (pl. számla) személyesen, üzletünkben tudja
            átvenni. Munkatársunk telefonon egyeztethet Önnel a részletekről.
          </div>
        )}

        <div className="legal-note">
          A jelölőnégyzetek kiválasztása és az űrlap beküldése a hatályos
          jogszabályok szerint egyenértékű a papíralapú, kézzel írt aláírással.
          A jóváhagyás időpontját és technikai adatait biztonságosan, a
          jogszabályoknak megfelelően rögzítjük. (Nyilatkozat verziója:{' '}
          {CURRENT_POLICY_VERSION})
        </div>
      </section>

      {submitError && <div className="banner danger">{submitError}</div>}

      <button
        type="button"
        className="btn"
        onClick={handleSubmit}
        disabled={submitting}
      >
        {submitting ? 'Beküldés…' : 'Adatlap beküldése'}
      </button>
    </div>
  );
}

function SuccessView({
  result,
  channel,
}: {
  result: SubmissionResult;
  channel: 'online' | 'kiosk';
}) {
  return (
    <div className="page">
      <div className="card success">
        <div className="check">✓</div>
        <h2>Köszönjük, az adatlapot rögzítettük!</h2>
        <p className="hint">
          Ügyfélazonosító: <strong>{result.partnerCode}</strong>
        </p>
        {result.parked ? (
          <div className="banner warn" style={{ marginTop: 16 }}>
            Mivel nem kért postai vagy e-mailes küldést, a dokumentumait
            személyesen, üzletünkben veheti át. Munkatársunk hamarosan felveszi
            Önnel a kapcsolatot az egyeztetéshez.
          </div>
        ) : (
          <div className="banner ok" style={{ marginTop: 16 }}>
            Adatait sikeresen továbbítottuk. A további teendőkről a megadott
            elérhetőségén tájékoztatjuk.
          </div>
        )}
        {channel === 'kiosk' && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => window.location.reload()}
          >
            Új adatlap indítása
          </button>
        )}
      </div>
    </div>
  );
}
