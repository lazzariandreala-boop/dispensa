// ================================================================
// cloud.js — Autenticazione Google + sincronizzazione Firestore
// ----------------------------------------------------------------
// Modulo caricato da index.html come <script type="module">. Gira DOPO
// lo script classico dell'app, quindi le funzioni window.bootApp /
// window.applyCloudData / window.buildCloudPayload esistono già.
//
// Modello dati: un singolo documento per utente in `households/{uid}`
// che contiene l'intero stato dell'app ({items, shopping, ...}). Lo stesso
// documento è quello che la skill Alexa aggiorna (HOUSEHOLD_ID = uid).
// Strategia di sync: last-writer-wins sul timestamp `at` (come il vecchio Gist),
// con listener realtime per ricevere le modifiche di Alexa/altri device.
// ================================================================
import { initializeApp } from 'firebase/app';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithCredential, signOut, onAuthStateChanged,
} from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot } from 'firebase/firestore';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';

// La config web di Firebase NON è segreta (è pubblica per definizione).
const firebaseConfig = {
  apiKey: 'AIzaSyByGwfjsEzCxYT_7axcBgtDCm57tFqtlnE',
  authDomain: 'dispensa-7aecb.firebaseapp.com',
  projectId: 'dispensa-7aecb',
  storageBucket: 'dispensa-7aecb.firebasestorage.app',
  messagingSenderId: '731789281701',
  appId: '1:731789281701:web:75825df4e5a8f1790fc04c',
  measurementId: 'G-XLVQH73EF0',
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

const SK = 'dispensa_v3'; // stessa chiave localStorage dell'app

let currentUser = null;
let unsub = null;
let pushTimer = null;
let lastPushAt = 0;  // timestamp dell'ultima nostra push, per ignorarne l'eco
let firstSnap = true;
let syncReady = false; // true dopo aver riconciliato col cloud: prima non pushiamo
                       // (altrimenti un save() all'avvio sovrascriverebbe i dati di Alexa)

function userDocRef(uid) {
  return doc(db, 'households', uid);
}

function localAt() {
  try {
    return new Date(JSON.parse(localStorage.getItem(SK) || '{}').at || 0).getTime();
  } catch (_) { return 0; }
}

function setStatus(state) {
  // Riusa l'indicatore Sync esistente dell'app, se presente.
  if (typeof window.setSyncStatus === 'function') window.setSyncStatus(state);
}

const Cloud = {
  get user() { return currentUser; },

  async signIn() {
    try {
      if (Capacitor.isNativePlatform()) {
        // App nativa (Android/iOS): il popup web non funziona nel WebView.
        // Usa il login Google nativo del plugin e passa la credenziale al JS SDK.
        const result = await FirebaseAuthentication.signInWithGoogle();
        const idToken = result.credential && result.credential.idToken;
        const credential = GoogleAuthProvider.credential(idToken);
        await signInWithCredential(auth, credential);
      } else {
        // Browser: popup classico.
        await signInWithPopup(auth, provider);
      }
    } catch (err) {
      console.error('Login error:', err);
      if (typeof window.showAlert === 'function') {
        window.showAlert('❌ Accesso non riuscito: ' + (err.code || err.message), 'err', 4000);
      }
    }
  },

  async signOut() {
    try { if (Capacitor.isNativePlatform()) await FirebaseAuthentication.signOut(); } catch (_) {}
    return signOut(auth);
  },

  /** Salva l'intero stato dell'app sul documento cloud (debounced). */
  push(payload) {
    // Finché non abbiamo riconciliato col cloud all'apertura, NON scriviamo:
    // eviterebbe che un save() di avvio sovrascriva le modifiche di Alexa.
    if (!currentUser || !payload || !syncReady) return;
    clearTimeout(pushTimer);
    setStatus('syncing');
    pushTimer = setTimeout(async () => {
      try {
        lastPushAt = new Date(payload.at || 0).getTime();
        await setDoc(userDocRef(currentUser.uid), payload);
        setStatus('ok');
        setTimeout(() => setStatus('idle'), 3000);
      } catch (e) {
        console.error('Cloud push error:', e);
        setStatus('err');
        if (typeof window.showAlert === 'function') {
          window.showAlert('⚠️ Salvataggio cloud fallito: ' + (e.code || e.message), 'err', 6000);
        }
      }
    }, 1200);
  },
};

window.Cloud = Cloud;

// ── Gestione stato di autenticazione ────────────────────────────
onAuthStateChanged(auth, (user) => {
  currentUser = user || null;
  // Auth risolta: nascondi il loader globale (evita il flash della schermata di login).
  document.getElementById('app-loader')?.classList.add('hide');
  const gate = document.getElementById('login-gate');

  if (user) {
    document.body.classList.add('authed');
    if (gate) gate.style.display = 'none';

    const emailEl = document.getElementById('acct-email');
    if (emailEl) emailEl.textContent = user.email || '';
    const uidEl = document.getElementById('acct-uid');
    if (uidEl) uidEl.textContent = user.uid;
    const nameEl = document.getElementById('acct-name');
    if (nameEl) nameEl.textContent = user.displayName || 'Utente';
    // Profilo nella sidebar desktop
    const navName = document.getElementById('nav-name');
    if (navName) navName.textContent = user.displayName || (user.email || 'Utente').split('@')[0];
    const navAv = document.getElementById('nav-avatar');
    if (navAv) navAv.textContent = (user.displayName || user.email || 'U').trim().charAt(0).toUpperCase();

    // Avvia l'app una sola volta
    if (!window.__booted) {
      window.__booted = true;
      try { if (typeof window.bootApp === 'function') window.bootApp(user); } catch (e) { console.error(e); }
    }

    // Listener realtime sul documento dell'utente
    firstSnap = true;
    syncReady = false;
    if (unsub) unsub();
    unsub = onSnapshot(userDocRef(user.uid), (snap) => {
      if (firstSnap) {
        firstSnap = false;
        if (!snap.exists()) {
          // Nessun dato cloud ancora: crea il documento dallo stato locale.
          syncReady = true;
          if (typeof window.buildCloudPayload === 'function') Cloud.push(window.buildCloudPayload());
          return;
        }
        // All'apertura il CLOUD è la fonte di verità: adotta i dati remoti
        // (che possono contenere le aggiunte di Alexa o di altri device).
        if (typeof window.applyCloudData === 'function') window.applyCloudData(snap.data(), true);
        syncReady = true;
        return;
      }

      // Aggiornamenti successivi in tempo reale (Alexa / altri device)
      if (!snap.exists()) return;
      const data = snap.data();
      const remoteAt = new Date(data.at || 0).getTime();
      if (remoteAt <= lastPushAt) return; // eco della nostra push → ignora
      if (typeof window.applyCloudData === 'function') window.applyCloudData(data);
    }, (err) => {
      console.error('Snapshot error:', err);
      // permission-denied = regole Firestore che bloccano l'app (Alexa non si vedrà mai)
      if (typeof window.showAlert === 'function') {
        window.showAlert('⚠️ Sync cloud non attivo (' + (err.code || err.message) + '). Controlla le regole Firestore.', 'err', 8000);
      }
    });

  } else {
    document.body.classList.remove('authed');
    if (gate) gate.style.display = 'flex';
    if (unsub) { unsub(); unsub = null; }
  }
});

// ── Aggancio dei pulsanti (il modulo è deferred: il DOM esiste già) ──
const loginBtn = document.getElementById('login-btn');
if (loginBtn) loginBtn.addEventListener('click', () => Cloud.signIn());

const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) logoutBtn.addEventListener('click', () => Cloud.signOut());

const copyUidBtn = document.getElementById('copy-uid-btn');
if (copyUidBtn) copyUidBtn.addEventListener('click', () => {
  const uid = currentUser?.uid || '';
  if (uid && navigator.clipboard) {
    navigator.clipboard.writeText(uid);
    if (typeof window.showAlert === 'function') window.showAlert('✅ ID copiato', 'ok', 2000);
  }
});
