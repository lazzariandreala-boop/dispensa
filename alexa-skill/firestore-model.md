# Modello dati Firestore — contratto condiviso App ↔ Alexa

Contratto rispettato sia dall'app (web/mobile) sia dalla Lambda Alexa.
Se cambi la forma dei dati, aggiorna **entrambi** i lati.

## Struttura: un documento per utente

Tutto lo stato di un utente sta in **un solo documento**:

```
households/{householdId}
```

dove `householdId` = **UID Firebase dell'utente** (quello mostrato nell'app in
Sync → "ID per Alexa"). Il documento contiene l'intero payload dell'app, identico
a quello che prima veniva salvato su Gist:

```jsonc
{
  "items": [ /* prodotti in dispensa */ ],
  "shopping": [ /* lista della spesa */ ],
  "consumptionLog": [ /* storico consumi */ ],
  "additionLog": [ /* storico aggiunte */ ],
  "monthlyReports": [ /* report mensili */ ],
  "priceBook": { /* listino prezzi */ },
  "v": 3,
  "at": "2026-07-10T12:34:56.000Z"   // timestamp ISO: usato per il last-writer-wins
}
```

> **Perché un solo documento e non collection?** L'app ragiona per array in
> memoria e sincronizza l'intero stato (come faceva col Gist). Un documento
> singolo rende la migrazione minima e il listener `onSnapshot` aggiorna l'app
> in tempo reale quando Alexa scrive. Per una dispensa familiare è ben sotto il
> limite di 1 MB per documento.

### Sincronizzazione (last-writer-wins)
- Ad ogni modifica, chi scrive aggiorna `at` con l'ora corrente ISO.
- L'app applica i dati remoti solo se `remote.at > local.at` (evita di
  sovrascrivere modifiche più recenti) e ignora l'eco delle proprie push.
- La Lambda scrive **in transazione** (`runTransaction`) per non perdere
  aggiornamenti concorrenti.

## Elemento di `items[]`

```jsonc
{
  "id": "abc123",            // string univoca
  "name": "Latte",           // capitalizzato
  "quantity": 1,
  "unit": "l",               // g|kg|ml|l|pz|conf
  "category": "latticini",   // vedi categorie sotto
  "expiryDate": "2026-07-20",// YYYY-MM-DD | null
  "originalExpiry": null,
  "frozen": false,
  "frozenDate": null,
  "thawedDate": null,
  "barcode": null,
  "addedDate": "2026-07-10",
  "source": "alexa"          // "app" | "alexa"
}
```

## Elemento di `shopping[]`

```jsonc
{ "id": "def456", "name": "Pane", "category": "pane", "checked": false,
  "addedDate": "2026-07-10", "hintPrice": null, "hintQty": null,
  "hintUnit": null, "source": "alexa" }
```

## Elemento di `additionLog[]`

```jsonc
{ "id": "ghi789", "name": "Latte", "category": "latticini", "qty": 1,
  "unit": "l", "price": null, "date": "2026-07-10", "source": "alexa" }
```

## Categorie valide (`category`)

`carne, pesce, verdure, frutta, latticini, pasta_cereali, pane, salumi,
condimenti, surgelati, bevande, dolci, legumi, uova, farine, scatola, generico`

Rilevate dal nome via `detectCat` (vedi `lambda/detectCat.js`, allineato all'app).

## Regole di sicurezza Firestore

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /households/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

L'Admin SDK usato dalla Lambda **ignora** queste regole (accesso privilegiato),
quindi Alexa scrive anche con le regole chiuse ai client non autenticati.
