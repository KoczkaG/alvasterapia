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
| I/A — Online GDPR & Adatlap-kitöltő | 🚧 folyamatban |
| Többi modul | ⏳ tervezett |
