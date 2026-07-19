# alexa-skill — Integrazione Alexa per Dispensa

Skill Alexa personalizzata che aggiunge/rimuove prodotti dalla dispensa e dalla
lista della spesa scrivendo su **Firestore**, lo stesso database usato dall'app.

## File

| File | Cosa contiene |
|---|---|
| [`GUIDA.md`](GUIDA.md) | **Guida passo-passo**: Firebase → AWS Lambda → Alexa → attivazione |
| [`firestore-model.md`](firestore-model.md) | Modello dati condiviso app ↔ Alexa |
| [`interaction-model.json`](interaction-model.json) | Modello di interazione (it-IT) da incollare nella Developer Console |
| [`lambda/index.js`](lambda/index.js) | Handler della skill (ASK SDK + Firestore via REST, no firebase-admin) |
| [`lambda/detectCat.js`](lambda/detectCat.js) | Rilevamento categoria (allineato all'app) |
| [`lambda/package.json`](lambda/package.json) | Dipendenze della Lambda |

## Cosa puoi dire ad Alexa

- "Alexa, chiedi a **mia dispensa** di aggiungere il latte"
- "…di aggiungere 500 grammi di pasta"
- "…di aggiungere il pane alla lista della spesa"
- "…di togliere il tonno dalla dispensa"
- "…che il latte scade il venti luglio" (imposta scadenza)
- "…cosa scade" / "cosa è in scadenza"
- "…cosa è scaduto"
- "…ho ancora il latte" (controlla presenza)
- "…cosa devo comprare"

## Stato

- ✅ Lato Alexa (skill + Lambda + Firestore) — pronto, vedi `GUIDA.md`.
- ⏳ Lato app: la lettura/scrittura su Firestore con sync realtime è la **Fase 2**
  (migrazione dell'app a Vite + Firebase). Finché non è pronta, i comandi Alexa
  scrivono comunque su Firestore (visibili nella console Firebase).
