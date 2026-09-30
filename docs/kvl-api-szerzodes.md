# KVL API-szerződés (a külső fejlesztőknek)

Ez a dokumentum azokat a **KVL-oldali API-végpontokat** írja le, amelyekre az I/A
(Online GDPR és Adatlap-kitöltő) modulnak szüksége van. A KVL fejlesztői jelenleg
csak végpontokat tudnak létrehozni — ez a lista pontosan megmondja, mit kérünk.

Amíg ezek a végpontok nem élnek, a mi rendszerünk egy **mock adapterrel** működik
(`KvlPort` interfész), így a fejlesztés nem blokkolódik.

## Általános

- **Formátum:** JSON, UTF-8.
- **Auth:** kölcsönös TLS vagy API-kulcs a fejlécben (`X-Api-Key`). Egyeztetendő.
- **Hibák:** szabványos HTTP státuszkódok + `{ "error": { "code": "...", "message": "..." } }`.
- **Idempotencia:** az író hívások `Idempotency-Key` fejlécet kapnak, hogy hálózati
  újrapróbálkozásnál ne keletkezzen duplikátum.

---

## 1. Partner keresése (régi ügyfél előhívása)

Az I/A checklist 3. pontjához: a páciens a **születési dátumával** (vagy
partnerkóddal) hívja elő a profilját.

```
GET /api/partners/search?birthDate=1956-03-22
GET /api/partners/search?partnerCode=P-000123
```

**Válasz — pontosan egy találat:**
```json
{
  "matchType": "single",
  "partner": {
    "partnerCode": "P-000123",
    "name": "Kovács Lajosné",
    "birthDate": "1956-03-22",
    "email": "...",            // lehet null (hiányos adat)
    "mobile": "...",           // lehet null
    "taj": "...",              // lehet null
    "zip": "1145",
    "city": "Budapest",
    "address": "Lakatos utca 22."
  }
}
```

**Válasz — több találat (névazonosság):** `{ "matchType": "multiple", "count": 2 }`
(részletes adatot NEM adunk vissza — a páciens ilyenkor nevet ír be / munkatárs segít.)

**Válasz — nincs találat:** `{ "matchType": "none" }`

---

## 2. Partner adatainak frissítése / létrehozása

Az I/A checklist 5., 6., 10. pontjához: az online/pulti kitöltés után az adatok
átvezetése a KVL-be.

```
PUT /api/partners/{partnerCode}     # meglévő frissítése (hiánypótlás)
POST /api/partners                  # új partner létrehozása
```

**Kérés törzse:**
```json
{
  "name": "...",
  "birthDate": "1956-03-22",
  "email": "...",
  "mobile": "...",
  "taj": "...",
  "zip": "1145",
  "city": "Budapest",
  "address": "Lakatos utca 22.",
  "consent": {                       // a 4 kötelező kérdés + metaadat
    "kihordasiIdoTajekoztatas": true,
    "hirlevel": false,
    "postaiKuldemeny": true,
    "emailKuldemeny": true,
    "acceptedAt": "2026-09-30T10:15:00.000Z",
    "ip": "10.0.0.5",
    "policyVersion": "gdpr-2026-06-01"
  }
}
```

**Fontos:** a mezők soha nem törlődhetnek felülírással (adónem-váltásnál sem —
lásd II/A). Ha egy mező hiányzik a kérésből, a KVL a meglévő értéket **megtartja**.

---

## 3. Marketing-hozzájárulás szinkron (opcionális, 7. pont)

Ha a KVL nem továbbítja automatikusan a marketing-szoftver felé, akkor a mi
oldalunk teszi meg — de a KVL-nek jeleznie kell a hozzájárulás állapotát:

```
GET /api/partners/{partnerCode}/marketing-consent
```

---

## 4. Idővonal-esemény rögzítése (History / Timeline, I/D)

Az I/A 8. pont "időzített lezárás" bejegyzéséhez és általában a Timeline-hoz:

```
POST /api/partners/{partnerCode}/timeline
{ "type": "GDPR_PARKOLTATAS_LEZARVA", "text": "...", "occurredAt": "..." }
```

## 5. Idővonal-események lekérdezése (Timeline összefésülés, I/D)

A Központi Ügyféltörténet Idővonal a **belső** események mellé a KVL-ből is
lekérdezi a pénzügyi / raktári / logisztikai eseményeket, és egyetlen időrendi
nézetbe fésüli. A kért végpont:

```
GET /api/partners/{partnerCode}/timeline-events
```

**Válasz — események listája:**
```json
[
  {
    "type": "INVOICE_ISSUED",
    "text": "Számla — Prisma Smart Plus CPAP készülék",
    "occurredAt": "2025-11-12T09:30:00.000Z",
    "detail": {
      "invoiceNumber": "SZ-2025-004521",
      "items": [{ "name": "Prisma Smart Plus CPAP", "model": "Prisma Smart Plus" }]
    }
  },
  { "type": "STOCK_MOVEMENT",   "text": "...", "occurredAt": "...", "detail": {} },
  { "type": "PACKAGE_DELIVERED","text": "...", "occurredAt": "...", "detail": {} }
]
```

**Fontos (I/D kritikus elvárás):** a számláknál ne csak a sorszám szerepeljen,
hanem a **konkrét termék- és modellnév** is olvasható legyen (a `detail.items`
tömbben), hogy a pultos kikeresgélés nélkül lássa, milyen eszköze van a betegnek.

**Típusok** (a mi oldalunkon kategóriákba képződnek): `INVOICE_ISSUED`,
`RECEIPT_ISSUED`, `REFUND_ISSUED`, `STOCK_MOVEMENT`, `DEVICE_HANDOUT`,
`PACKAGE_SENT`, `PACKAGE_IN_TRANSIT`, `PACKAGE_DELIVERED`, `PACKAGE_FAILED`.

> A futárstátuszokat (GLS/MPL) a KVL is szolgáltathatja ezen a végponton, vagy
> külön futár-API adapterrel kötjük be — egyeztetés kérdése (lásd IV. modul).

---

## Nyitott kérdések a KVL-csapat felé

1. Van-e mód **webhookra** (KVL → mi), ha egy partnert a pultban módosítanak?
   Vagy csak pull (mi kérdezünk)? Ez befolyásolja az adat-frissesség garanciáit.
2. A partnerkód formátuma és egyedisége garantált?
3. Rate limit / egyidejű hívások korlátja?
