-- SOMNO SHOP — I/A modul adatbázis-séma
-- Minden érzékeny/jogilag releváns tábla append-only szemléletű: a hozzájárulás
-- és az audit-napló bejegyzései nem módosíthatók és üzemszerűen nem törölhetők.

-- =========================================================================
-- Páciens-adatlap beküldések (online portál vagy pulti tablet)
-- Ez a mi oldalunk "landing" táblája; a végleges igazságforrás a KVL marad,
-- ide a KVL-be történő átvezetés előtti/utáni állapotot rögzítjük.
-- =========================================================================
CREATE TABLE IF NOT EXISTS form_submissions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Ha meglévő KVL-partnerhez tartozik, itt a partnerkód; új páciensnél NULL.
  partner_code    TEXT,
  name            TEXT NOT NULL,
  birth_date      DATE NOT NULL,
  taj             TEXT,
  email           TEXT,
  mobile          TEXT,
  zip             TEXT NOT NULL,
  city            TEXT NOT NULL,
  address         TEXT NOT NULL,
  -- A 4 kötelező kérdés válaszai (jsonb).
  marketing       JSONB NOT NULL,
  -- Honnan érkezett: 'online' (páciens otthon) vagy 'kiosk' (pulti tablet).
  channel         TEXT NOT NULL CHECK (channel IN ('online', 'kiosk')),
  -- A feldolgozás állapota (KVL-átvezetés, parkoltatás stb.).
  status          TEXT NOT NULL DEFAULT 'received',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_form_submissions_partner ON form_submissions (partner_code);
CREATE INDEX IF NOT EXISTS idx_form_submissions_birth ON form_submissions (birth_date);

-- =========================================================================
-- Hozzájárulási bejegyzések (APPEND-ONLY) — a digitális "aláírás" bizonyítéka.
-- Visszavonás/módosítás új sort hoz létre, a régit soha nem írjuk felül.
-- =========================================================================
CREATE TABLE IF NOT EXISTS consents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id   UUID NOT NULL REFERENCES form_submissions (id),
  partner_code    TEXT,
  marketing       JSONB NOT NULL,
  -- Jogi hitelesség metaadatai:
  accepted_at     TIMESTAMPTZ NOT NULL,
  ip              TEXT NOT NULL,
  user_agent      TEXT NOT NULL,
  policy_version  TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consents_submission ON consents (submission_id);

-- =========================================================================
-- Audit-napló (APPEND-ONLY) — minden személyesadat-művelet nyoma.
-- =========================================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id              BIGSERIAL PRIMARY KEY,
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Ki/mi végezte (pl. 'portal:anonymous', 'kvl-adapter', vagy egy felhasználó).
  actor           TEXT NOT NULL,
  -- Milyen műveletet: CREATE / READ / UPDATE / EXPORT / DELETE.
  action          TEXT NOT NULL,
  -- Milyen entitáson (pl. 'form_submission', 'partner').
  entity_type     TEXT NOT NULL,
  entity_id       TEXT,
  -- Szabad szöveges / strukturált részletek.
  detail          JSONB
);

CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log (entity_type, entity_id);

-- =========================================================================
-- Számla-parkoltatás ("Zéró Hozzájárulás" radar, I/A checklist 8. pont).
-- Ha a páciens sem postai, sem e-mailes küldést nem engedélyez, a kimenő
-- dokumentumot 1 hónapos időzítővel "parkoltatjuk", és pulti feladatot generálunk.
-- =========================================================================
CREATE TABLE IF NOT EXISTS parked_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id   UUID NOT NULL REFERENCES form_submissions (id),
  partner_code    TEXT,
  reason          TEXT NOT NULL DEFAULT 'zero_consent',
  -- Meddig tart a parkoltatás (alapból létrehozás + 1 hónap).
  expires_at      TIMESTAMPTZ NOT NULL,
  -- 'parked' | 'resolved' | 'expired'
  status          TEXT NOT NULL DEFAULT 'parked',
  -- Az egyeztetés eredménye a lezáráskor (I/A 8. pont kimenetelei).
  resolution      TEXT,
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_parked_status ON parked_documents (status);
