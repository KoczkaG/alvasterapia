-- Központi Ügyféltörténet Idővonal (Timeline) — minimál, append-only alap.
-- Az I. Modul / D) ezt bővíti ki teljes körű integrációval (pénzügy, raktár,
-- logisztika, szerviz). Egyelőre a kommunikációs események (pl. kimenő hívások)
-- rögzülnek ide.
CREATE TABLE IF NOT EXISTS timeline_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_code  TEXT NOT NULL,
  type          TEXT NOT NULL,
  text          TEXT NOT NULL,
  occurred_at   TIMESTAMPTZ NOT NULL,
  detail        JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_timeline_partner ON timeline_events (partner_code, occurred_at);
