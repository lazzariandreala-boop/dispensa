# Test — Dispensa

L'app è un singolo file (`index.html`). Questi test caricano lo `<script>`
inline in un contesto isolato Node (`vm`) con stub minimi delle API del
browser (DOM, `localStorage`, `fetch`, Web Speech, ecc.) e verificano le
funzioni "pure" e la logica dell'assistente AI (JARVIS) — senza browser.

## Comandi

```bash
npm test      # esegue tutti i test (node:test, nessuna dipendenza esterna)
npm run check # controlla che il JS inline di index.html non abbia errori di sintassi
```

Serve solo Node.js (≥ 18). Nessun `npm install` necessario.

## Cosa copre

- Helper date (`today`, `daysTo`, `addDays`, `fmtDate`)
- Rilevamento categoria (`detectCat`)
- Logica freezer/scongelamento (`freezeExp`, `thawExp`)
- Ricette (`findIng`, `canMake`, `canMake1`, integrità di `RECIPES`)
- Sicurezza output (`escHtml`)
- Reportistica (`filterLog`)
- **AI / JARVIS**: costruzione contesto, esecuzione azioni
  (`dispensa_add`, `spesa_add`, `spesa_remove`) e chiamata all'API Groq
  con `fetch` mockato (endpoint, header, parsing JSON, gestione errori).

## Note / limiti noti emersi dai test

- `detectCat` fa match su sottostringa con parole al **singolare**: es.
  "Pomodori pelati" (plurale) non matcha `pomodoro` e finisce in `scatola`
  (per via di "pelati"). Per il plurale conviene aggiungere le forme al
  dizionario `CAT_RULES`.
- Le categorie `farine` e `scatola` esistono in `CAT_RULES`/`CAT_QTY_DEFAULTS`
  ma non in `CATS`/`CAT_LABELS_FULL`/`FREEZE_DAYS` (usano il fallback 📦/60gg).
