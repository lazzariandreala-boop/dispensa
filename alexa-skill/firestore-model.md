# Modello dati Firestore — contratto condiviso App ↔ Alexa

Questo è il **contratto** che sia l'app web/mobile sia la Lambda della skill Alexa
devono rispettare. Se cambi la forma dei dati, aggiorna **entrambi** i lati.

## Struttura

Una sola "casa" (household). Tutto vive sotto un documento identificato da
`HOUSEHOLD_ID` (default: `casa`). Ogni entità è una **collection** di documenti
(non un array), così Alexa può aggiungere/rimuovere un singolo elemento senza
riscrivere l'intero stato → niente conflitti, e l'app riceve l'aggiornamento in
tempo reale.

```
households/{householdId}                 ← doc: metadati casa
  ├── pantry/{itemId}                     ← prodotti in dispensa
  ├── shopping/{itemId}                   ← lista della spesa
  ├── additionLog/{logId}                 ← storico aggiunte
  ├── consumptionLog/{logId}              ← storico consumi
  └── monthlyReports/{reportId}           ← report mensili
households/{householdId}  campo priceBook ← mappa listino prezzi
```

`householdId` è fisso e identico su app e Lambda (es. `"casa"`). In futuro, per
supportare più case, diventerà l'ID utente autenticato.

## Documento `pantry/{itemId}`

```jsonc
{
  "name": "Latte",            // string, capitalizzato
  "quantity": 1,              // number
  "unit": "l",                // string: g|kg|ml|l|pz|conf
  "category": "latticini",    // string (vedi categorie sotto)
  "expiryDate": "2026-07-20", // string YYYY-MM-DD | null
  "originalExpiry": null,     // string | null (scadenza pre-congelamento)
  "frozen": false,            // bool
  "frozenDate": null,         // string | null
  "thawedDate": null,         // string | null
  "barcode": null,            // string | null
  "addedDate": "2026-07-10",  // string YYYY-MM-DD
  "source": "alexa",          // "app" | "alexa"  (chi l'ha creato)
  "createdAt": 1720598400000, // number, epoch ms (per ordinamento)
  "name_lc": "latte"          // name in minuscolo — serve per le query di Alexa
}
```

## Documento `shopping/{itemId}`

```jsonc
{
  "name": "Pane",
  "category": "pane",
  "checked": false,
  "addedDate": "2026-07-10",
  "hintPrice": null,          // number | null (dal listino)
  "hintQty": null,            // number | null
  "hintUnit": null,           // string | null
  "source": "alexa",
  "createdAt": 1720598400000
}
```

## Documento `additionLog/{logId}`

```jsonc
{ "name": "Latte", "category": "latticini", "qty": 1, "unit": "l",
  "price": null, "date": "2026-07-10", "source": "alexa" }
```

## Categorie valide (`category`)

`carne, pesce, verdure, frutta, latticini, pasta_cereali, pane, salumi,
condimenti, surgelati, bevande, dolci, legumi, uova, farine, scatola, generico`

La categoria viene rilevata dal nome (funzione `detectCat`, condivisa e portata
anche nella Lambda: vedi `lambda/detectCat.js`).

## Note operative

- **ID documento**: generato lato client/Lambda (`push()` o UUID). Non usare il
  `name` come ID (nomi duplicati / caratteri non validi).
- **Timestamp `createdAt`**: sempre epoch ms, così l'ordinamento è stabile su
  tutti i client senza dipendere dai fusi.
- **Deduplica**: prima di aggiungere alla spesa, la Lambda controlla se esiste
  già un doc con lo stesso `name` (case-insensitive) non `checked`.
- **Limite doc Firestore**: 1 MB per documento — irrilevante perché ogni
  prodotto è un doc separato.
