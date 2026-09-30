# SOMNO SHOP — Belső Rendszer (KVL-kiegészítő)

A SOMNO SHOP alvásterápiás szaküzlet belső folyamatainak modernizálását szolgáló
saját fejlesztésű rendszer. A meglévő, külső **KVL** vállalatirányítási szoftvert
egészíti ki azokkal a funkciókkal, amelyeket a KVL fejlesztői jelenleg nem tudnak
elkészíteni — a KVL felé kizárólag **API-végpontokon** keresztül kommunikálunk.

> Ez a repó a *stratégiai vázlat* (2026) alapján épül. Az első megvalósított terület:
> **I. MODUL / A) — Online GDPR és Adatlap-kitöltő Rendszer.**

## Architektúra dióhéjban

```
somnoshop/
├── apps/
│   ├── api/          # Backend — NestJS + PostgreSQL (a cég saját szerverén fut)
│   └── portal/       # Páciens-portál — React (online + tabletes adatkitöltés)
├── packages/
│   └── shared/       # Közös típusok, DTO-k, validációs sémák (API ⇄ portal)
└── docs/             # Döntések, KVL API-szerződés, adatvédelmi jegyzetek
```

- **Backend:** NestJS (Node.js 22, TypeScript), PostgreSQL. Konténerizált (Docker),
  hogy a cég saját szerverén fusson — nincs kötelező külső felhőfüggőség.
- **Frontend:** React + Vite + TypeScript.
- **KVL-integráció:** *adapter réteg* mögé rejtve. A KVL-végpontok még nem léteznek,
  ezért egy `KvlPort` interfész + mock implementáció fut, amíg a külső fejlesztők
  el nem készítik a valódi végpontokat (lásd `docs/kvl-api-szerzodes.md`).

## Adatvédelem (kiemelt!)

A rendszer **különleges személyes (egészségügyi) adatot** kezel (TAJ, diagnózis).
Ezért alapkövetelmény:
- hozzájárulás rögzítése **időbélyeggel és IP-címmel** (jogilag = kézi aláírás),
- **audit-log** minden adatkezelési műveletre,
- titkosított tárolás, jogszabályi megőrzési idők betartása.

Részletek: [`docs/adatvedelem.md`](docs/adatvedelem.md).

## Fejlesztés

```bash
npm install                 # workspace-ek telepítése
docker compose up -d db     # PostgreSQL indítása
npm run dev -w apps/api     # backend
npm run dev -w apps/portal  # páciens-portál
```

## Státusz

| Modul | Állapot |
|-------|---------|
| I/A — Online GDPR & Adatlap-kitöltő | ✅ mag kész (KVL-függő pontok mockkal) |
| I/B — Nyitvatartási naptár & IVR-zsilip | ✅ mag kész (IVR/webshop/Google szinkron mockkal) |
| I/C — Click-to-Call & jogi napló | ✅ mag kész (VoIP adapter mockkal) |
| I/D — Központi Ügyféltörténet Idővonal | ✅ mag kész (KVL-események adapter mockkal) |
| I/E — Hívásvégi jegyzet & statisztika | ✅ mag kész (feladatkezelő adapter mockkal) |
| I/F — Automata „ADATLAP HIÁNYOS" protokoll | ✅ mag kész (e-mail/SMS adapter mockkal) |
| **I. MODUL — teljes** | ✅ mind a 6 rész (A–F) magja kész |
| Többi modul | ⏳ tervezett |

### I/F — Automata „ADATLAP HIÁNYOS" riasztási protokoll

Az adatlap megnyitásakor ellenőrzi a kötelező kontaktmezőket (e-mail, mobil,
TAJ). Hiány esetén riasztás + két kezelési út:
- **„A" helyszíni frissítés**: a pultos rögzíti a hiányt → automata GDPR-igazoló
  e-mail webshopos tereléssel;
- **„B" önkiszolgáló link**: egyszer használatos, 72h-s tokenes link (SMS +
  e-mail), amit a beteg otthon tölt ki; a záró képernyőn webshopos terelés.

Végpontok: `GET /completeness/:pc`, `POST /completeness/:pc/update`,
`POST /completeness/:pc/link` (pulti); `GET|POST /self-service/:token` (betegoldali).
E-mail/SMS küldés a `NotificationPort` mögött (mock). Pulti demó:
`?view=completeness`, betegoldali: `?view=self-service&token=…`.

### I/E — Bővített hívásvégi jegyzet és statisztikai dashboard

A hívás lezárásához **kötelező, strukturált jegyzet** kapcsolódik: checkboxos
témák (rendelés, vénybeváltás, panasz stb.), küldő intézmény / alváslabor
legördülő, és kötelező szöveges összefoglaló, amely a beteg **idővonalára**
kerül. Visszahívási igény esetén **automata feladat** generálódik (a belső
Feladatkezelő — `TaskPort` — minimál implementációja mögött; a VII/E bővíti).
A hívásvégi jegyzetekből **vezetői statisztika** épül. Végpontok:

- `POST /calls/:id/complete-with-note` — jegyzetes lezárás,
- `GET /calls/meta/referrers` — küldő intézmények törzsadata,
- `GET /admin/call-stats` — téma-megoszlás, labor-rangsor, visszahívások.

Pulti demó: `?view=call-panel` (jegyzet), vezetői nézet: `?view=call-stats`.

### I/D — Központi Ügyféltörténet Idővonal (Timeline)

Az eddig szétszórt adatszigetek egyetlen, időrendi, görgethető nézetben. A belső
események (I/A GDPR/parkoltatás, I/C hívások) és a KVL-eredetű események
(számlák a **konkrét termék-/modellnévvel**, raktárközi mozgások, csomagstátuszok)
lekérdezéskor fésülődnek össze. Minden lekérdezés **audit-logba** kerül
(egészségügyi adat READ művelete). A **Philips-csereprojekt** adatai egyszeri
Excel-importtal tölthetők fel; érintett betegnél az adatlap megnyitásakor
**kötelező piros riasztás** jelenik meg a gépcsere-adatokkal. Végpontok:

- `GET /timeline/:partnerCode` — teljes idővonal + Philips-riasztás egy hívásban,
- `POST /timeline/philips-recall/import` — a csereprojekt adatainak importja.

Pulti demó: `?view=timeline`.

### I/B — Nyitvatartási Naptár Modul

A cég **egyetlen központi igazságforrása** a nyitvatartásra. Heti alap-rend +
dátum-felülírások (ünnepek, ledolgozós szombatok, rövidített napok). Bármilyen
módosítás automatikusan szinkronizálódik az **IVR / webshop / Google Business**
felé (jelenleg mock adapterekkel). Végpontok:

- `GET /opening/status` — „nyitva van-e most?” + következő nyitás (IVR/webshop hívja),
- `GET /opening/calendar` — teljes naptár,
- `PUT /admin/opening/weekly`, `PUT|DELETE /admin/opening/overrides` — karbantartás,
- `GET /admin/opening/holiday-suggestions/:year` — magyar munkaszüneti napok importja.

Admin felület: a páciens-portál `?view=opening-admin` nézete.

### I/C — Szoftverből indított kimenő hívások (Click-to-Call)

A kimenő hívások életciklusa a **jogi védelemre** fókuszálva. A kolléga a beteg
bármely regisztrált száma mellől (mobil / vezetékes / jogosult kapcsolattartó)
hívást indíthat; a rendszer kezeli a kötelező GDPR-figyelmeztetést, a rögzítés
engedélyezését/tiltását, és a hívás tényét a beteg **idővonalára** (Timeline)
linkeli. A hívott fél tiltása esetén a felvétel **azonnal leáll és törlődik**, a
művelet pedig **módosíthatatlan Audit Trail** bejegyzést kap (idő, kezelő, ok) —
ez a cég jogi bizonyítéka. Végpontok:

- `POST /calls` — hívás indítása; `POST /calls/:id/recording/{grant|refuse}`;
  `POST /calls/:id/complete`; `GET /calls/meta/scripts` (GDPR-sablon + érvkészlet).

A tényleges hangkapcsolást/rögzítést külső **VoIP**-szolgáltató végzi (adapter
mögött, jelenleg mock). A **Timeline** (`TimelinePort`) minimál DB-implementációt
kap; az I/D majd teljes körűvé bővíti. Pulti demó: `?view=call-panel`.
