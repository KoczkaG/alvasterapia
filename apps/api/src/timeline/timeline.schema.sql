-- Központi Ügyféltörténet Idővonal (Timeline) — I. Modul / D)
-- Append-only eseménynapló. A belső modulok (I/A parkoltatás, I/C hívások, stb.)
-- ide írnak; a KVL-eredetű események (pénzügy, raktár, futár) adapteren át,
-- lekérdezéskor fésülődnek hozzá.
CREATE TABLE IF NOT EXISTS timeline_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_code  TEXT NOT NULL,
  category      TEXT NOT NULL DEFAULT 'communication',
  type          TEXT NOT NULL,
  text          TEXT NOT NULL,
  occurred_at   TIMESTAMPTZ NOT NULL,
  detail        JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_timeline_partner ON timeline_events (partner_code, occurred_at);

-- =========================================================================
-- Philips-csereprojekt: a visszahívás során kicserélt gépek adatai.
-- Egyszeri, teljes körű Excel-import tölti fel. Ha egy beteg érintett, az
-- adatlapja megnyitásakor KÖTELEZŐ piros riasztást villantani (I/D 3. pont).
-- =========================================================================
CREATE TABLE IF NOT EXISTS philips_recall (
  partner_code       TEXT PRIMARY KEY,
  replacement_model  TEXT NOT NULL,
  serial_number      TEXT NOT NULL,
  replaced_on        DATE,
  imported_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
