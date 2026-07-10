# 🫙 Dispensa

App per gestire la dispensa di casa: prodotti, scadenze, freezer, lista della
spesa, ricette, report consumi. Login con Google, dati sincronizzati nel cloud
(Firebase/Firestore) e integrazione con **Alexa**.

## Sviluppo

```bash
npm install      # dipendenze (Vite, Firebase, Capacitor)
npm run dev      # server di sviluppo su http://localhost:5173
npm run build    # build di produzione in dist/
npm run preview  # anteprima della build
npm test         # unit test (node:test, nessuna dipendenza)
npm run check    # verifica sintassi JS di index.html
```

> Nota: dopo il passaggio a Vite, l'app **non si apre più** facendo doppio clic
> su `index.html` (usa import di moduli): serve `npm run dev` o `npm run build`.

## Struttura

| Percorso | Cosa |
|---|---|
| `index.html` | App (UI + logica, script classico inline) |
| `src/cloud.js` | Login Google + sincronizzazione Firestore realtime |
| `tests/` | Unit test (helper, categorie, ricette, azioni) |
| `alexa-skill/` | Skill Alexa + Lambda + guida ([alexa-skill/GUIDA.md](alexa-skill/GUIDA.md)) |
| `CAPACITOR.md` | Come generare le app Android e iOS |
| `capacitor.config.json` | Config app nativa (appId `com.dispensa.app`) |

## Architettura cloud

```
  App (web / Android / iOS)  ──►  Firestore  ◄──  Lambda AWS  ◄──  Skill Alexa
        login Google              households/{uid}                  (Echo di casa)
        sync realtime
```

- I dati di ogni utente stanno in `households/{uid}` (vedi
  [alexa-skill/firestore-model.md](alexa-skill/firestore-model.md)).
- Alexa scrive sullo stesso documento → l'app si aggiorna in tempo reale.

## Cosa serve configurare

1. **Firebase**: Firestore + login Google + regole (già impostato). Config web in
   `src/cloud.js`.
2. **Alexa**: segui [alexa-skill/GUIDA.md](alexa-skill/GUIDA.md) (Firebase service
   account → AWS Lambda → Alexa Developer Console).
3. **Mobile**: segui [CAPACITOR.md](CAPACITOR.md) (registrazione app Android/iOS su
   Firebase, login nativo, build).

## Assistente vocale in-app (JARVIS/Groq)

Disattivato (`JARVIS_ENABLED = false` in `index.html`): i comandi vocali passano
ora da Alexa. Il codice è mantenuto per riferimento.
