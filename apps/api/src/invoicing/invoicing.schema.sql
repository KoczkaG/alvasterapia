-- Pulti Védőháló és Terminál-Kassza (II. Modul / D)
-- A számla életciklusa: tervezet (nincs NAV-sorszám) → sikeres fizetés →
-- éles számla. A tervezet mindaddig nyitva marad, amíg a fizetés nem sikerül.
CREATE TABLE IF NOT EXISTS invoice_drafts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_code   TEXT NOT NULL,
  items          JSONB NOT NULL,
  payment        TEXT NOT NULL,
  amount_gross   NUMERIC(12,2) NOT NULL,
  -- A számla vevő-adata (EP-nél összefűzött név + esetleg székhely/adószám).
  -- JSONB: { name, address, taxNumber? }. Sima magánszemélynél NULL is lehet.
  payee          JSONB,
  -- draft | awaiting_payment | issued | cancelled
  status         TEXT NOT NULL DEFAULT 'draft',
  -- Éles számla adatai (csak issued státuszban):
  invoice_number TEXT,
  pdf_uri        TEXT,
  operator       TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  issued_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_invoice_drafts_partner ON invoice_drafts (partner_code);
CREATE INDEX IF NOT EXISTS idx_invoice_drafts_status ON invoice_drafts (status);
