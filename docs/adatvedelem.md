# Adatvédelmi alapelvek (I/A modul)

A rendszer **különleges kategóriájú személyes adatot** kezel (egészségügyi adat:
TAJ-szám, diagnózis, terápiás paraméterek). A tervezés az alábbi elveket
kötelezően érvényesíti — ezek nem opcionálisak.

## 1. Hozzájárulás jogi hitelessége

A hatályos szabályozás (GDPR + elektronikus ügyintézési törvények) szerint az
online felületen vagy a pulti tableten történő **aktív jelölőnégyzet-kiválasztás
és az űrlap beküldése jogilag egyenértékű a papíralapú, kézi aláírással** —
feltéve, hogy a jóváhagyás visszakövethető.

Ezért minden hozzájárulásnál rögzítjük:
- a jóváhagyás **pontos időbélyegét** (UTC, ms pontossággal),
- a beküldő **IP-címét**,
- a felhasznált **user-agentet**,
- a megjelenített **nyilatkozat-szöveg verzióját** (hogy utólag bizonyítható legyen,
  *mit* fogadott el a páciens),
- a hozzájárulás **tartalmát** (a 4 kötelező kérdésre adott válaszokat).

A hozzájárulási bejegyzés **módosíthatatlan** (append-only): visszavonás vagy
módosítás új bejegyzést hoz létre, a régit nem írja felül.

## 2. Audit-log (módosíthatatlan napló)

Minden, személyes adatot érintő művelet (létrehozás, olvasás, módosítás, export,
törlés) naplózásra kerül: ki/mi, mikor, milyen entitáson, milyen műveletet végzett.
A napló append-only, üzemszerűen nem törölhető.

## 3. Tárolás és megőrzés

- Az adatok a cég **saját szerverén**, PostgreSQL-ben tárolódnak (nincs kötelező
  külső felhő). A különösen érzékeny mezők titkosítva.
- **Megőrzési idők:** a stratégiai vázlat III. modulja szerint az egészségügyi
  leletek és szerződések esetén **min. 30 év**. A konkrét retenciós időket a
  vezetőséggel egyeztetve, entitásonként konfiguráljuk (nincs külön kinevezett
  DPO; a vezetőség felel a jogszerű megőrzésért).
- Retenciós idő lejárta után az adat **automatikusan, visszaállíthatatlanul törlődik**
  (a törlés ténye az audit-logban megmarad, maga az adat nem).

## 4. Adattakarékosság

- **Okmányfotó (személyi, lakcímkártya) tárolása TILOS.** Az okmányellenőrzés
  kizárólag szemrevételezéssel történik; az okmányadatokat sima mezőbe gépeljük.
- Csak a folyamathoz szükséges adatot kérjük be és tároljuk.

## 5. KVL-átvezetés

A digitálisan rögzített adatok és hozzájárulások az adapter rétegen keresztül,
API-hívással kerülnek át a KVL-be. A KVL-nek küldött minden hívás naplózódik.
