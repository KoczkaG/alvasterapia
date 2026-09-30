-- Automata „ADATLAP HIÁNYOS" protokoll (I. Modul / F)

-- =========================================================================
-- Önkiszolgáló adatfrissítő tokenek ("B" opció). Egyszer használatos, lejáró.
-- =========================================================================
CREATE TABLE IF NOT EXISTS self_service_tokens (
  token         TEXT PRIMARY KEY,
  partner_code  TEXT NOT NULL,
  -- Mely mezők pótlására küldtük (jsonb tömb) — a felület csak ezeket kéri.
  missing       JSONB NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  -- Felhasználva (egyszer használatos): a sikeres beküldés időpontja.
  used_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sst_partner ON self_service_tokens (partner_code);
