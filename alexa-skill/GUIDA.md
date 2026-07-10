# Guida: collegare Alexa alla Dispensa (Firebase + AWS + Alexa)

Obiettivo: dire *"Alexa, chiedi alla dispensa di aggiungere il latte"* e vederlo
comparire nell'app (in tempo reale, grazie a Firestore).

Architettura:

```
  Tu parli  ──►  Alexa (Echo)  ──►  Skill "dispensa"  ──►  AWS Lambda
                                                              │
                                                              ▼
   App (telefono/web)  ◄────────  Firestore (Google)  ◄──────┘
        (sync realtime)
```

Tutto quello che serve è **gratis** (piani free di Firebase e AWS). Nessuna
pubblicazione della skill sullo store: resta privata sul tuo account.

Tempo stimato: ~1 ora la prima volta.

---

## Parte 1 — Firebase / Firestore (il database condiviso)

1. Vai su <https://console.firebase.google.com> e accedi con il tuo account Google.
2. **Add project** → nome es. `dispensa` → puoi disattivare Google Analytics → Create.
3. Nel menu a sinistra: **Build → Firestore Database → Create database**.
   - Modalità: **Production mode** (le regole le mettiamo noi sotto).
   - Location: `eur3 (europe-west)` va bene.
4. **Login Google**: menu *Build → Authentication → Sign-in method* → abilita
   **Google** come provider. (Già fatto da te ✅.)
5. **Regole di sicurezza** (Firestore → tab *Rules*): ogni utente legge/scrive
   solo il proprio documento. La Lambda usa l'Admin SDK che **ignora** le regole.
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
   Incolla, poi **Publish**.
5. **Service account** (le credenziali che userà la Lambda):
   - Icona ingranaggio ⚙️ (in alto a sx) → **Project settings → Service accounts**.
   - **Generate new private key** → scarica il file JSON. **Tienilo segreto.**
   - Questo JSON serve nella Parte 2 (variabile `FIREBASE_SERVICE_ACCOUNT`).

---

## Parte 2 — Il "cervello" della skill

Due modi per ospitare il codice:

- **A) Alexa-hosted (Node.js) — CONSIGLIATO per iniziare / uso personale.**
  Nessun account AWS, deploy dall'editor della Developer Console, gratis. Vedi §2-A.
- **B) AWS Lambda (Provision your own).** Più controllo, serve account AWS.
  Necessario se poi vuoi **venderla a terzi** con account linking. Vedi §2-B.

---

### §2-A · Alexa-hosted (via veloce)

1. La crei direttamente nella Parte 3 scegliendo **Alexa-hosted (Node.js)** come
   hosting (invece di "Provision your own"). Torna qui dopo aver creato la skill.
2. Nella skill: tab **Code**. Vedi una cartella `lambda/` con `index.js` e
   `package.json`. Sostituisci/aggiungi i file della nostra cartella
   `alexa-skill/lambda/`:
   - `index.js` e `detectCat.js` → incolla il contenuto
   - `package.json` → assicurati che tra le dipendenze ci siano
     `ask-sdk-core` e `firebase-admin`
   - crea un file **`service-account.json`** e incollaci il JSON del service
     account (Parte 1). *(Il repo della skill è privato sul tuo account Amazon.)*
   - crea un file **`config.json`** con `{ "householdId": "IL_TUO_UID" }`
     (l'UID dal menu Sync dell'app).
3. Premi **Save** poi **Deploy**. Fatto: niente AWS.

> Sicurezza: mettere il service account in un file va bene per uso personale
> (repo privato). Se **vendi** l'app a terzi, NON si usa un service account nel
> codice né un householdId fisso: serve l'account linking (vedi in fondo).

Salta la §2-B e vai alla Parte 3.

---

### §2-B · AWS Lambda (Provision your own)

### 2a. Prepara il pacchetto della Lambda

Sul tuo Mac, nella cartella del progetto:

```bash
cd alexa-skill/lambda
npm install            # scarica ask-sdk-core e firebase-admin
zip -r ../lambda.zip . # crea alexa-skill/lambda.zip (include node_modules)
```

> Il file `lambda.zip` deve contenere `index.js`, `detectCat.js`, `package.json`
> e la cartella `node_modules/` alla radice dello zip.

### 2b. Crea la funzione su AWS

1. Vai su <https://console.aws.amazon.com/lambda> (crea un account AWS gratuito se non ce l'hai).
2. **Region**: in alto a destra scegli una regione supportata da Alexa, es.
   **Europe (Ireland) eu-west-1**.
3. **Create function → Author from scratch**:
   - Name: `dispensa-alexa`
   - Runtime: **Node.js 20.x**
   - Create function.
4. **Carica il codice**: tab *Code* → **Upload from → .zip file** → scegli
   `alexa-skill/lambda.zip` → Save.
5. **Handler**: in *Runtime settings → Edit* verifica che sia `index.handler`.
6. **Timeout**: tab *Configuration → General configuration → Edit* → Timeout **10 sec**.
7. **Variabili d'ambiente**: *Configuration → Environment variables → Edit → Add*:
   - `FIREBASE_SERVICE_ACCOUNT` = incolla **tutto** il contenuto del JSON scaricato
     dalla Parte 1 (una sola riga; incolla così com'è, è JSON valido).
   - `HOUSEHOLD_ID` = il **tuo UID Firebase**. Lo trovi così: apri l'app, fai
     login con Google, apri il menu **Sync** → copia il valore sotto *"ID per Alexa"*.
     (È l'ID del tuo account: così Alexa scrive sulla tua stessa dispensa.)
8. **Trigger Alexa**: tab *Configuration → Triggers → Add trigger* → cerca
   **Alexa Skills Kit** → per ora lascia *Skill ID verification* disattivato
   (lo attiveremo dopo aver creato la skill, incollando lo Skill ID) → Add.
9. Copia l'**ARN** della funzione (in alto a destra, es.
   `arn:aws:lambda:eu-west-1:1234...:function:dispensa-alexa`). Serve nella Parte 3.

---

## Parte 3 — La skill nella Alexa Developer Console

1. Vai su <https://developer.amazon.com/alexa/console/ask> e accedi con lo
   **stesso account Amazon delle tue Alexa di casa** (fondamentale: così la skill
   in sviluppo è già attiva sui tuoi Echo, senza pubblicarla).
2. **Create Skill**:
   - Name: `Dispensa`
   - Primary locale: **Italian (IT)**
   - Model: **Custom**
   - Hosting: **Provision your own** (usiamo la nostra Lambda).
   - Template: **Start from Scratch** → Create skill.
3. **Invocation name**: menu *Build → Invocation* → imposta `la dispensa` (tutto
   minuscolo) → Save. ⚠️ Deve essere di **almeno 2 parole** (Alexa rifiuta i nomi
   di una sola parola come "dispensa").
4. **Interaction model (JSON)**: menu *Build → Interaction Model → JSON Editor*
   → cancella tutto e incolla il contenuto di
   [`interaction-model.json`](interaction-model.json) → **Save Model** → **Build Model**.
5. **Endpoint**: menu *Build → Endpoint*:
   - Seleziona **AWS Lambda ARN**.
   - In *Default Region* incolla l'**ARN** della Lambda (Parte 2, punto 9).
   - Copia lo **Your Skill ID** (in cima, `amzn1.ask.skill....`).
   - Save Endpoints.
6. **Collega lo Skill ID alla Lambda** (sicurezza): torna nella console AWS Lambda
   → trigger *Alexa Skills Kit* → attiva *Skill ID verification* → incolla lo
   Skill ID → Save. (Così solo la tua skill può invocare la Lambda.)

---

## Parte 4 — Prova

### Nel simulatore (senza Echo)
Developer Console → tab **Test** → abilita *Development* → scrivi o parla:
- "apri la dispensa"
- "chiedi alla dispensa di aggiungere il latte"
- "chiedi alla dispensa cosa sta per scadere"

Controlla la **Firestore Console**: dovresti vedere comparire i documenti in
`households/<il-tuo-uid>`.

### Sui tuoi Echo di casa
Essendo loggato con lo stesso account Amazon, la skill in *Development* è **già
attiva**. Di' semplicemente:
- *"Alexa, apri la dispensa"* poi *"aggiungi il latte"*
- oppure in un colpo solo: *"Alexa, chiedi alla dispensa di aggiungere il latte"*
- *"Alexa, chiedi alla dispensa cosa devo comprare"*

> Nota sulla frase: con una skill personalizzata serve sempre il nome
> d'invocazione ("dispensa"). *"Alexa, aggiungi latte alla lista"* **senza**
> "dispensa" finisce invece nella lista della spesa **nativa** di Alexa, non qui.

---

## Domande frequenti

**Devo pubblicare la skill o farla approvare da Amazon?**
No. Per uso personale resta in *Development* ed è attiva solo sui tuoi dispositivi.
La certificazione Amazon serve solo per pubblicarla sullo store per altri.

**Devo pubblicare l'app web?**
No, l'app non c'entra con Alexa. Comunicano solo tramite Firestore.

**Quanto costa?** Zero per un uso domestico: Firebase (Spark) e AWS Lambda
(1 milione di richieste/mese gratis) restano ampiamente nel free tier.

**L'app non si aggiorna quando parlo ad Alexa.** In **Fase 2** l'app userà i
listener realtime di Firestore e si aggiornerà da sola. Finché la Fase 2 non è
pronta, la scrittura di Alexa è comunque su Firestore e la vedrai nella console.

### Alternativa senza AWS: "Alexa-hosted skill"
In *Create Skill* scegli **Alexa-hosted (Node.js)** invece di "Provision your own".
Ottieni una Lambda gestita da Amazon con editor nel browser: incolli lì
`index.js` e `detectCat.js`, aggiungi le dipendenze in `package.json`
(`ask-sdk-core`, `firebase-admin`) e le variabili d'ambiente le simuli mettendo
il JSON del service account in un file. Più semplice per iniziare, meno
flessibile. La struttura del codice è identica.
