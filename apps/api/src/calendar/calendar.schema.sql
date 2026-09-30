-- I. Modul / B) — Nyitvatartási Naptár Modul ("egyetlen központi igazságforrás")

-- =========================================================================
-- Heti alap-nyitvatartás — egyetlen sor (singleton), JSONB-ben a 7 nap.
-- A WeeklySchedule (@somnoshop/shared) szerkezetét tárolja.
-- =========================================================================
CREATE TABLE IF NOT EXISTS opening_weekly (
  id          INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  schedule    JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  TEXT
);

-- =========================================================================
-- Dátum-felülírások: ünnepnapok, ledolgozós szombatok, rövidített napok.
-- =========================================================================
CREATE TABLE IF NOT EXISTS opening_overrides (
  date        DATE PRIMARY KEY,               -- egy naphoz egy felülírás
  kind        TEXT NOT NULL CHECK (kind IN ('closed', 'custom')),
  label       TEXT NOT NULL,
  ranges      JSONB,                           -- 'custom'-nál a nyitvatartás
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  TEXT
);

CREATE INDEX IF NOT EXISTS idx_overrides_date ON opening_overrides (date);
