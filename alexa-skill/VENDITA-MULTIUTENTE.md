# Vendere l'app a terzi — cosa cambia (multi-utente)

Oggi l'app è già **multi-utente lato dati**: ogni persona ha i suoi dati in
`households/{uid}` col proprio login Google. Questo va benissimo per una SaaS.

Il punto critico è **Alexa**: nella configurazione attuale la Lambda ha un
`HOUSEHOLD_ID` **fisso** (il tuo UID). Va bene solo per te. Per far funzionare
Alexa con i clienti serve l'**Account Linking**.

## 1. Account Linking Alexa (il pezzo chiave)

Serve a collegare l'account Alexa del cliente al suo account nella tua app, così
la Lambda sa **su quale dispensa** scrivere.

Flusso:
1. Configuri un provider **OAuth 2.0**. Due strade:
   - **Login with Amazon (LWA)** come provider — semplice ma l'identità è Amazon,
     va poi mappata all'utente Firebase.
   - **Il tuo OAuth basato su Firebase Auth** (consigliato): usi Firebase come
     identity provider (o un piccolo servizio OAuth che emette token collegati
     allo UID Firebase). Così l'identità Alexa == identità app.
2. Nella skill (Developer Console → *Account Linking*) inserisci authorization
   URL, token URL, client id/secret, scope.
3. Il cliente, nell'app **Alexa** (telefono), abilita la tua skill e fa il login →
   Alexa ottiene un **access token** per quell'utente.
4. Ad ogni richiesta, la Lambda riceve il token in
   `handlerInput.requestEnvelope.context.System.user.accessToken`. Lo verifichi,
   ne ricavi lo **UID Firebase** del cliente, e scrivi su `households/{quelUID}`.

Modifica alla Lambda: al posto di `HOUSEHOLD_ID` fisso, ricavi l'uid dal token:

```js
const token = handlerInput.requestEnvelope.context.System.user.accessToken;
if (!token) return speak(h, 'Collega prima il tuo account nella app Alexa.', false);
const uid = await resolveUidFromToken(token); // verifica il token → UID Firebase
const docRef = db.collection('households').doc(uid);
```

`resolveUidFromToken` dipende dal provider OAuth scelto (verifica JWT Firebase,
oppure chiamata a LWA `/user/profile` + tabella di mapping).

## 2. Pubblicazione

- **Skill Alexa**: per renderla disponibile ad altri va **certificata** da Amazon
  (privacy policy, testi, icone, test). Finché è in *Development* è solo tua.
- **App mobile**: Google Play (account sviluppatore **25 $** una tantum) e Apple
  App Store (**99 $/anno**). Servono icone, screenshot, privacy policy.
- **Web**: pubblica la build (`dist/`) su un hosting HTTPS (Firebase Hosting è
  comodo: `firebase deploy`). Aggiungi il dominio in Firebase → Auth → *Authorized domains*.

## 3. Costi che scalano con gli utenti

- **Firebase**: il piano gratuito Spark ha limiti (50k letture/giorno Firestore).
  Con clienti veri passi a **Blaze** (pay-as-you-go): paghi a consumo, resta
  economico se ottimizzi le letture (evita letture inutili, usa il listener).
- **AWS Lambda**: 1M richieste/mese gratis, poi pochi centesimi.
- Con Alexa-hosted invece non controlli lo scaling → per vendere conviene **AWS
  Lambda (§2-B)**.

## 4. Legale / privacy (obbligatorio per pubblicare)

- **Privacy policy** e **Termini di servizio** (richiesti da Alexa, Play, App Store).
- **GDPR**: consenso, possibilità di cancellare l'account e i dati
  (`households/{uid}`), export dati.
- Informa che i dati vocali passano da Amazon Alexa.

## 5. Ordine consigliato

1. **Ora**: usa l'app + Alexa per te (Alexa-hosted, householdId fisso).
2. **Poi (Fase 3)**: OAuth + Account Linking → Alexa multi-utente, e sposta la
   Lambda su AWS.
3. **Infine**: hosting web, store mobile, certificazione skill, documenti legali.

> La Fase 3 (account linking) è un lavoro a parte e non banale: quando vuoi
> partire con la vendita, la progettiamo insieme.
