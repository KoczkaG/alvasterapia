-- Belső Feladatkezelő (Task Manager) — minimál alap.
-- A VII. Modul / E) bővíti ki teljes körűvé (felelős, határidő, státuszok,
-- vezetői ellenőrzés). Egyelőre a hívásvégi visszahívási igények (I/E) hoznak
-- létre feladatot.
CREATE TABLE IF NOT EXISTS tasks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT NOT NULL,
  detail        TEXT,
  partner_code  TEXT,
  source        TEXT NOT NULL,
  ref_id        TEXT,
  status        TEXT NOT NULL DEFAULT 'open',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks (status, created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_partner ON tasks (partner_code);
