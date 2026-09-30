-- Hívásvégi jegyzetek (I. Modul / E). A vezetői statisztika ebből épül.
-- Egy híváshoz egy jegyzet tartozik (a lezáráskor rögzül).
CREATE TABLE IF NOT EXISTS call_notes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- A hívás azonosítója. (Nincs FK-kényszer, hogy a sémafájlok betöltési
  -- sorrendje ne számítson; az integritást az alkalmazáslogika biztosítja.)
  call_id         UUID NOT NULL,
  partner_code    TEXT NOT NULL,
  -- A megjelölt témák (tömb, jsonb) — a statisztika ezt bontja.
  topics          JSONB NOT NULL,
  -- A küldő intézmény / alváslabor azonosítója (statisztikai rangsorhoz).
  referrer_id     TEXT,
  summary         TEXT NOT NULL,
  follow_up       BOOLEAN NOT NULL DEFAULT false,
  operator        TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_call_notes_call ON call_notes (call_id);
CREATE INDEX IF NOT EXISTS idx_call_notes_referrer ON call_notes (referrer_id);
CREATE INDEX IF NOT EXISTS idx_call_notes_created ON call_notes (created_at);
