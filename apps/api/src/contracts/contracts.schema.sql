-- Próbakezelési Szerződés-modul — Személyes Kiszolgálás (III. Modul / A)
-- A szerződés életciklusa: draft → gdpr_ok → cart → paid → signed → closed.
-- A beteg-adatok az ambuláns lapból (OCR) emelődnek be; a KVL-profil (KVL API)
-- érintetlen marad — ez a bizonylat/szerződés saját adata.
CREATE TABLE IF NOT EXISTS contracts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_code   TEXT NOT NULL,
  -- draft | gdpr_ok | cart | paid | signed | closed
  status         TEXT NOT NULL DEFAULT 'draft',
  -- Az OCR-beemelt + pulton pótolt beteg-adatok (a szerződéshez).
  -- { name, taj, zip, city, address, doctorName, doctorStamp, pressure }
  patient        JSONB NOT NULL,
  purchase_date  DATE NOT NULL,
  -- A 4 GDPR/marketing hozzájárulás: { wearTimeInfo, newsletter, postalContact, emailContact }
  gdpr_consent   JSONB,
  -- A kosár tételei: [{ productType, name, serialNumber?, deposit, price }]
  items          JSONB NOT NULL DEFAULT '[]',
  -- Fizetés
  total_deposit  NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_price    NUMERIC(12,2) NOT NULL DEFAULT 0,
  grand_total    NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid_at        TIMESTAMPTZ,
  -- Aláírás: 'sms' | 'paper'
  signature_method TEXT,
  signature_ref  TEXT,
  signed_at      TIMESTAMPTZ,
  -- Kiállított dokumentumok
  contract_pdf_uri TEXT,
  -- A jótállási jegyek: [{ serialNumber, productType, warrantyExpiry, uri }]
  warranty_docs  JSONB NOT NULL DEFAULT '[]',
  operator       TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_contracts_partner ON contracts (partner_code);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts (status);

-- Az aktív SMS-aláírási kihívások (a challengeId → contract kötés).
CREATE TABLE IF NOT EXISTS contract_sign_challenges (
  challenge_id TEXT PRIMARY KEY,
  contract_id  UUID NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
