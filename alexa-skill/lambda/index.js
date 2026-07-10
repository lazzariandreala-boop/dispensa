'use strict';
/**
 * Skill Alexa "Dispensa" — backend Lambda.
 * Legge/scrive UN SOLO documento Firestore `households/{HOUSEHOLD_ID}` che
 * contiene l'intero stato dell'app ({items, shopping, additionLog, ...}),
 * lo stesso che l'app sincronizza. L'app riceve le modifiche in tempo reale
 * grazie al listener onSnapshot.
 *
 * HOUSEHOLD_ID = lo UID Firebase dell'utente (lo trovi nell'app → Sync → "ID per Alexa").
 *
 * Variabili d'ambiente (console Lambda):
 *   FIREBASE_SERVICE_ACCOUNT  = JSON del service account Firebase (stringa)
 *   HOUSEHOLD_ID              = UID utente (es. "aBcD1234...")
 */
const Alexa = require('ask-sdk-core');
const admin = require('firebase-admin');
const { detectCat, qtyDefault } = require('./detectCat');

// Credenziali service account:
//  - AWS Lambda: variabile d'ambiente FIREBASE_SERVICE_ACCOUNT (JSON)
//  - Alexa-hosted: file ./service-account.json accanto a index.js (NON committato)
function loadServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  }
  try { return require('./service-account.json'); }
  catch (e) { console.error('Impossibile leggere service-account.json:', e.message); return null; }
}
// HOUSEHOLD_ID: env var (AWS) oppure ./config.json { "householdId": "..." } (hosted)
function loadHouseholdId() {
  if (process.env.HOUSEHOLD_ID) return process.env.HOUSEHOLD_ID;
  try { return require('./config.json').householdId; } catch (_) { return 'casa'; }
}
const HOUSEHOLD_ID = loadHouseholdId();

// Init Firebase in modo difensivo: un errore qui NON deve mandare in crash il
// modulo (altrimenti Alexa dà un errore generico con output vuoto). Registriamo
// l'errore e lo mostriamo quando serve davvero il database.
let db = null;
let firebaseInitError = null;
try {
  if (!admin.apps.length) {
    const svc = loadServiceAccount();
    if (!svc || !svc.project_id || !svc.private_key) {
      throw new Error('service-account.json assente o incompleto (manca project_id/private_key)');
    }
    admin.initializeApp({ credential: admin.credential.cert(svc) });
    console.log('Firebase inizializzato — progetto:', svc.project_id, '| household:', HOUSEHOLD_ID);
  }
  db = admin.firestore();
} catch (e) {
  firebaseInitError = e.message;
  console.error('INIT FIREBASE FALLITO:', e.message);
}

function getDocRef() {
  if (!db) throw new Error('Firebase non pronto: ' + (firebaseInitError || 'inizializzazione non riuscita'));
  return db.collection('households').doc(HOUSEHOLD_ID);
}

// ── Helper ──────────────────────────────────────────────────────
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function todayRome() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function daysTo(ds) {
  if (!ds) return null;
  const [y, m, d] = ds.split('-').map(Number);
  const exp = Date.UTC(y, m - 1, d);
  const [ny, nm, nd] = todayRome().split('-').map(Number);
  return Math.round((exp - Date.UTC(ny, nm - 1, nd)) / 86400000);
}

function cap(s) {
  s = String(s || '').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function emptyPayload() {
  return { items: [], shopping: [], consumptionLog: [], additionLog: [], monthlyReports: [], priceBook: {}, v: 3 };
}

function slotValue(h, name) {
  try { return Alexa.getSlotValue(h.requestEnvelope, name) || ''; } catch (_) { return ''; }
}

function speak(h, text, keepOpen) {
  const b = h.responseBuilder.speak(text);
  if (keepOpen) b.reprompt('Vuoi altro?');
  return b.withShouldEndSession(!keepOpen).getResponse();
}

/**
 * Legge il documento, applica `mutate(data)` e riscrive, in transazione.
 * `mutate` può ritornare una stringa da far dire ad Alexa.
 */
async function withState(mutate) {
  const docRef = getDocRef();
  let phrase = '';
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(docRef);
    const data = snap.exists ? snap.data() : emptyPayload();
    for (const k of Object.keys(emptyPayload())) {
      if (data[k] === undefined) data[k] = emptyPayload()[k];
    }
    phrase = mutate(data) || '';
    data.at = new Date().toISOString(); // timestamp per il last-writer-wins dell'app
    tx.set(docRef, data);
  });
  return phrase;
}

/** Come withState ma in sola lettura. */
async function readState() {
  const snap = await getDocRef().get();
  return snap.exists ? snap.data() : emptyPayload();
}

// ── Handlers ────────────────────────────────────────────────────
const AddPantryItemHandler = {
  canHandle: (h) => is(h, 'AddPantryItemIntent'),
  async handle(h) {
    const raw = slotValue(h, 'item');
    if (!raw) return speak(h, 'Non ho capito quale prodotto aggiungere.', true);
    const name = cap(raw);
    const cat = detectCat(name);
    const def = qtyDefault(cat);
    const qty = Number(slotValue(h, 'quantity')) || def.qty;
    const unit = slotValue(h, 'unit') || def.unit;

    const phrase = await withState((data) => {
      data.items.push({
        id: uid(), name, quantity: qty, unit, category: cat,
        expiryDate: null, originalExpiry: null, frozen: false, frozenDate: null,
        thawedDate: null, barcode: null, addedDate: todayRome(), source: 'alexa',
      });
      data.additionLog.push({ id: uid(), name, category: cat, qty, unit, price: null, date: todayRome(), source: 'alexa' });
      return `Ho aggiunto ${name} in dispensa.`;
    });
    return speak(h, phrase, true);
  },
};

const AddShoppingItemHandler = {
  canHandle: (h) => is(h, 'AddShoppingItemIntent'),
  async handle(h) {
    const raw = slotValue(h, 'item');
    if (!raw) return speak(h, 'Non ho capito cosa aggiungere alla lista.', true);
    const name = cap(raw);
    const phrase = await withState((data) => {
      const dup = data.shopping.some((s) => !s.checked && (s.name || '').toLowerCase() === name.toLowerCase());
      if (dup) return `${name} è già nella lista della spesa.`;
      data.shopping.push({
        id: uid(), name, category: detectCat(name), checked: false,
        addedDate: todayRome(), hintPrice: null, hintQty: null, hintUnit: null, source: 'alexa',
      });
      return `Ho aggiunto ${name} alla lista della spesa.`;
    });
    return speak(h, phrase, true);
  },
};

const RemovePantryItemHandler = {
  canHandle: (h) => is(h, 'RemovePantryItemIntent'),
  async handle(h) {
    const raw = slotValue(h, 'item');
    if (!raw) return speak(h, 'Non ho capito cosa togliere.', true);
    const lc = cap(raw).toLowerCase();
    const phrase = await withState((data) => {
      const before = data.items.length;
      data.items = data.items.filter((it) => (it.name || '').toLowerCase() !== lc);
      return before === data.items.length
        ? `Non ho trovato ${cap(raw)} in dispensa.`
        : `Ho tolto ${cap(raw)} dalla dispensa.`;
    });
    return speak(h, phrase, true);
  },
};

const RemoveShoppingItemHandler = {
  canHandle: (h) => is(h, 'RemoveShoppingItemIntent'),
  async handle(h) {
    const raw = slotValue(h, 'item');
    if (!raw) return speak(h, 'Non ho capito cosa togliere dalla lista.', true);
    const lc = cap(raw).toLowerCase();
    const phrase = await withState((data) => {
      const before = data.shopping.length;
      data.shopping = data.shopping.filter((s) => !(s.name || '').toLowerCase().includes(lc));
      return before === data.shopping.length
        ? `Non ho trovato ${cap(raw)} nella lista.`
        : `Ho tolto ${cap(raw)} dalla lista della spesa.`;
    });
    return speak(h, phrase, true);
  },
};

const CheckItemHandler = {
  canHandle: (h) => is(h, 'CheckItemIntent'),
  async handle(h) {
    const raw = slotValue(h, 'item');
    if (!raw) return speak(h, 'Non ho capito quale prodotto cercare.', true);
    const lc = cap(raw).toLowerCase();
    const data = await readState();
    const found = data.items.filter((it) => (it.name || '').toLowerCase().includes(lc));
    if (!found.length) return speak(h, `No, non hai ${cap(raw)} in dispensa.`, true);
    const tot = found.reduce((s, it) => s + (Number(it.quantity) || 0), 0);
    return speak(h, `Sì, hai ${tot} ${found[0].unit || ''} di ${cap(raw)} in dispensa.`, true);
  },
};

const ListExpiringHandler = {
  canHandle: (h) => is(h, 'ListExpiringIntent'),
  async handle(h) {
    const data = await readState();
    const soon = data.items
      .filter((it) => !it.frozen)
      .map((it) => ({ name: it.name, days: daysTo(it.expiryDate) }))
      .filter((x) => x.days !== null && x.days >= 0 && x.days <= 7)
      .sort((a, b) => a.days - b.days);
    if (!soon.length) return speak(h, 'Non hai prodotti in scadenza nei prossimi sette giorni.', true);
    const list = soon.map((x) => `${x.name} tra ${x.days} giorni`).join(', ');
    return speak(h, `In scadenza: ${list}.`, true);
  },
};

const ListShoppingHandler = {
  canHandle: (h) => is(h, 'ListShoppingIntent'),
  async handle(h) {
    const data = await readState();
    const names = data.shopping.filter((s) => !s.checked).map((s) => s.name);
    if (!names.length) return speak(h, 'La lista della spesa è vuota.', true);
    return speak(h, `Devi comprare: ${names.join(', ')}.`, true);
  },
};

// ── Sistema ─────────────────────────────────────────────────────
const LaunchRequestHandler = {
  canHandle: (h) => Alexa.getRequestType(h.requestEnvelope) === 'LaunchRequest',
  handle: (h) => speak(h, 'Ciao, sono la tua dispensa. Dimmi di aggiungere o togliere prodotti, o chiedimi cosa sta per scadere.', true),
};
const HelpHandler = {
  canHandle: (h) => is(h, 'AMAZON.HelpIntent'),
  handle: (h) => speak(h, 'Puoi dire: aggiungi latte in dispensa; aggiungi pane alla lista della spesa; oppure, cosa sta per scadere.', true),
};
const StopHandler = {
  canHandle: (h) => is(h, 'AMAZON.StopIntent') || is(h, 'AMAZON.CancelIntent'),
  handle: (h) => speak(h, 'A presto!'),
};
const FallbackHandler = {
  canHandle: (h) => is(h, 'AMAZON.FallbackIntent'),
  handle: (h) => speak(h, 'Non ho capito. Prova a dire: aggiungi latte in dispensa.', true),
};
const SessionEndedHandler = {
  canHandle: (h) => Alexa.getRequestType(h.requestEnvelope) === 'SessionEndedRequest',
  handle: (h) => h.responseBuilder.getResponse(),
};
const ErrorHandler = {
  canHandle: () => true,
  handle(h, error) {
    console.error('Errore skill:', error);
    return speak(h, 'Ops, qualcosa è andato storto. Riprova tra poco.');
  },
};

function is(h, intentName) {
  return Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest' &&
    Alexa.getIntentName(h.requestEnvelope) === intentName;
}

exports.handler = Alexa.SkillBuilders.custom()
  .addRequestHandlers(
    LaunchRequestHandler,
    AddPantryItemHandler,
    AddShoppingItemHandler,
    RemovePantryItemHandler,
    RemoveShoppingItemHandler,
    CheckItemHandler,
    ListExpiringHandler,
    ListShoppingHandler,
    HelpHandler,
    StopHandler,
    FallbackHandler,
    SessionEndedHandler,
  )
  .addErrorHandlers(ErrorHandler)
  .lambda();
