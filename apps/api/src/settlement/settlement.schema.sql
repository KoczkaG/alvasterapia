-- Elszámolás és Statisztika (II. Modul / E)

-- 1. Kihordási idő törzsadat (konfigurálható termékenkénti hónap). A vezetőség
--    / admin finomíthatja; ebből számoljuk, mikor válik a beteg jogosulttá új,
--    TB-támogatott eszközre.
CREATE TABLE IF NOT EXISTS wear_time_rules (
  product_type TEXT PRIMARY KEY,
  months       INTEGER NOT NULL CHECK (months > 0),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by   TEXT
);

-- 2. Kaució-Elszámoló Adatlap. A próbaidőszak végi visszajáró átlátható
--    levezetése; a befizetéseket és levonásokat JSONB-ben őrizzük, a végösszeg
--    a bizonylaton is szerepel.
CREATE TABLE IF NOT EXISTS deposit_settlements (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_code     TEXT NOT NULL,
  payments         JSONB NOT NULL,      -- [{ reference, amount, paidOn }]
  deductions       JSONB NOT NULL,      -- [{ label, amount }]
  total_paid       NUMERIC(12,2) NOT NULL,
  total_deductions NUMERIC(12,2) NOT NULL,
  balance          NUMERIC(12,2) NOT NULL, -- >=0 => visszajár, <0 => ráfizetés
  refund_due       BOOLEAN NOT NULL,
  -- Az értesítés (e-mail) elküldve-e a betegnek az átlátható matekkal.
  notified         BOOLEAN NOT NULL DEFAULT false,
  operator         TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deposit_settlements_partner
  ON deposit_settlements (partner_code);

-- 3. OEP Napi Egyeztető pillanatkép. Egy adott napra a KVL-es és a Mankó-s
--    (EESZT) darabszámok összevetésének eredménye, hogy az eltérés
--    visszakereshető legyen.
CREATE TABLE IF NOT EXISTS oep_reconciliations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  for_date     DATE NOT NULL,
  rows         JSONB NOT NULL,          -- [{ productType, kvlCount, mankoCount, diff, match }]
  all_match    BOOLEAN NOT NULL,
  operator     TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_oep_reconciliations_date
  ON oep_reconciliations (for_date);
