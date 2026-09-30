-- I. Modul / C) — Szoftverből indított kimenő hívások (Click-to-Call)

-- =========================================================================
-- Kimenő hívások rekordjai. A hívás életciklusát és a rögzítés-hozzájárulás
-- állapotát követi. A jogilag kötelező, MÓDOSÍTHATATLAN nyomot a közös
-- audit_log tábla adja (lásd audit modul).
-- =========================================================================
CREATE TABLE IF NOT EXISTS outbound_calls (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_code      TEXT NOT NULL,
  phone_kind        TEXT NOT NULL
                      CHECK (phone_kind IN ('patient_mobile','patient_landline','authorized_contact')),
  phone_number      TEXT NOT NULL,
  origin            TEXT NOT NULL CHECK (origin IN ('counter','service')),
  service_worksheet_id TEXT,
  -- A VoIP-szolgáltató hívásazonosítója (korreláláshoz).
  provider_call_id  TEXT,
  -- Életciklus: dialing | connected | completed | failed
  status            TEXT NOT NULL DEFAULT 'dialing',
  -- Rögzítés-hozzájárulás: pending | granted | refused
  recording_consent TEXT NOT NULL DEFAULT 'pending',
  -- A megőrzött felvétel hivatkozása (ha granted és lezárult); tiltásnál NULL.
  recording_uri     TEXT,
  started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at          TIMESTAMPTZ,
  -- Melyik kezelő (kolléga) indította — jelenleg placeholder, később Auth.
  operator          TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_calls_partner ON outbound_calls (partner_code, started_at);
