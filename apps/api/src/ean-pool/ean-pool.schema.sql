-- Virtuális EAN-kód Pool (II. Modul / C)
-- Egy sor = egy hatósági sorszám (matrica). A kiosztás ATOMIKUS: egyetlen
-- UPDATE ... RETURNING választja ki a legkisebb szabad kódot, így két egyidejű
-- vényes értékesítés sem kaphatja ugyanazt a kódot.
CREATE TABLE IF NOT EXISTS ean_codes (
  code          TEXT PRIMARY KEY,
  -- A tömb megnevezése, amiből származik (kimutatáshoz).
  label         TEXT NOT NULL,
  used          BOOLEAN NOT NULL DEFAULT false,
  -- Kihez / mihez rendeltük (partnerkód, számlatervezet-azonosító).
  assigned_to   TEXT,
  assigned_ref  TEXT,
  assigned_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A szabad kódok gyors, determinisztikus kiválasztásához (legkisebb elöl).
CREATE INDEX IF NOT EXISTS idx_ean_codes_free ON ean_codes (used, code);
