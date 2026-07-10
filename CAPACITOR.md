# App mobile (Android + iOS) con Capacitor

L'app web viene impacchettata in un'app nativa con **Capacitor** (un solo
codice → Android e iOS). La cartella `dist/` prodotta da `npm run build` è ciò
che finisce dentro l'app.

## Prerequisiti (sul tuo Mac)

- **Node** (già installato)
- **Android Studio** (per Android + APK) → <https://developer.android.com/studio>
- **Xcode** dall'App Store (per iOS, solo su Mac — che hai ✅) + CocoaPods:
  `sudo gem install cocoapods`

## 1. Aggiungi le piattaforme (una volta sola)

```bash
npm install                 # se non già fatto
npm run build               # genera dist/
npx cap add android
npx cap add ios
```

Questo crea le cartelle `android/` e `ios/`. Da qui in poi, ad ogni modifica del
codice web:

```bash
npm run cap:sync            # build + copia dist nelle app native
```

## 2. Registra le app Android e iOS su Firebase

Nella **Firebase Console** del progetto `dispensa-7aecb` → ⚙️ *Project settings*
→ sezione *Your apps* → **Add app**.

### Android — campi da compilare
| Campo | Valore |
|---|---|
| **Android package name** | `com.dispensa.app` ← *deve essere identico* all'`appId` in `capacitor.config.json` |
| **App nickname** (facoltativo) | `Dispensa Android` |
| **Debug signing certificate SHA-1** | *necessario per il login Google* — vedi sotto come ottenerlo |

Ottieni l'SHA-1 di debug:
```bash
keytool -list -v -keystore ~/.android/debug.keystore \
  -alias androiddebugkey -storepass android -keypass android | grep SHA1
```
(quando pubblichi su Play Store aggiungerai anche l'SHA-1 della chiave di release).

Poi **scarica `google-services.json`** e mettilo in `android/app/google-services.json`.

### iOS — campi da compilare
| Campo | Valore |
|---|---|
| **Apple bundle ID** | `com.dispensa.app` ← identico all'`appId` |
| **App nickname** (facoltativo) | `Dispensa iOS` |
| **App Store ID** | lascia vuoto |

Poi **scarica `GoogleService-Info.plist`** e, in Xcode, trascinalo dentro
`ios/App/App/` (spunta *Copy items if needed*).

## ⚠️ CONFIG NATIVA GIÀ APPLICATA (se rigeneri android/ ios/, riapplicala!)

Queste modifiche sono in `android/` e `ios/` (che sono in `.gitignore`). Se
cancelli/rigeneri le cartelle native, vanno rifatte o l'app **crasha**:

- **`android/variables.gradle`** → dentro `ext { }` aggiungi:
  ```gradle
  rgcfaIncludeGoogle = true
  ```
  Senza questa riga il plugin NON include `play-services-auth` e l'app crasha
  all'avvio con `NoClassDefFoundError: ...GoogleSignIn`.
- **`android/app/google-services.json`** → scaricato da Firebase (con SHA-1 registrato).
- **`ios/App/App/AppDelegate.swift`** → `import FirebaseCore` + `FirebaseApp.configure()`
  in `didFinishLaunchingWithOptions`.
- **`ios/App/App/Info.plist`** → URL scheme = `REVERSED_CLIENT_ID` del `GoogleService-Info.plist`.
- **`ios/App/App/GoogleService-Info.plist`** → scaricato da Firebase, aggiunto al target App in Xcode.

## 3. ⚠️ Login Google in app nativa (importante)

Nel **browser** l'accesso funziona con il popup (`signInWithPopup`, già
implementato in `src/cloud.js`). Nelle **app native** il popup NON funziona nel
WebView: serve il login Google nativo. Passi:

1. Installa il plugin:
   ```bash
   npm install @capacitor-firebase/authentication
   npx cap sync
   ```
2. In `src/cloud.js`, usa il login nativo quando sei in app (il web resta col popup):
   ```js
   import { Capacitor } from '@capacitor/core';
   import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
   import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';

   async signIn() {
     if (Capacitor.isNativePlatform()) {
       const res = await FirebaseAuthentication.signInWithGoogle();
       const cred = GoogleAuthProvider.credential(res.credential.idToken);
       await signInWithCredential(auth, cred);
     } else {
       await signInWithPopup(auth, provider); // web
     }
   }
   ```
3. **iOS**: aggiungi in `ios/App/App/Info.plist` lo URL scheme "reversed client ID"
   preso da `GoogleService-Info.plist` (campo `REVERSED_CLIENT_ID`). Il README del
   plugin ha lo snippet esatto.
4. **Android**: assicurati di aver messo l'SHA-1 su Firebase (punto 2) e
   `google-services.json` in `android/app/`.

> Questa parte (auth nativa) è l'unico pezzo che va aggiunto quando passi da web
> a mobile. Sul web l'app è già completa e funzionante.

## 4. Genera APK / esegui su dispositivo

**Android (APK):**
```bash
npm run cap:android         # build + apre Android Studio
```
In Android Studio: *Build → Build Bundle(s)/APK(s) → Build APK(s)*. L'APK è in
`android/app/build/outputs/apk/debug/app-debug.apk` → copialo sul telefono e
installalo (abilita "origini sconosciute").

**iOS:**
```bash
npm run cap:ios             # build + apre Xcode
```
In Xcode: collega l'iPhone, seleziona il tuo team di sviluppo (Apple ID gratuito
va bene per installare sul tuo device) → premi ▶️. Per la distribuzione fuori dal
tuo device serve un account Apple Developer (99 €/anno).

## Note

- **Domini autorizzati**: in Firebase → Authentication → Settings → *Authorized
  domains*, verifica che ci sia `localhost` (per `npm run dev`) e il dominio dove
  pubblichi la versione web.
- `android/` e `ios/` possono essere committati (progetti nativi) oppure ignorati
  e rigenerati con `npx cap add`. Per ora sono in `.gitignore`.
