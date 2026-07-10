'use strict';
/**
 * Skill Alexa "Dispensa" — backend Lambda.
 * Legge/scrive su Firestore lo stesso household usato dall'app (vedi
 * ../firestore-model.md). Ogni prodotto è un documento in una subcollection,
 * così l'app riceve l'aggiornamento in tempo reale.
 *
 * Variabili d'ambiente richieste (impostate nella console Lambda):
 *   FIREBASE_SERVICE_ACCOUNT  = JSON del service account Firebase (stringa)
 *   HOUSEHOLD_ID              = id della casa (default "casa")
 */
const Alexa = require('ask-sdk-core');
const admin = require('firebase-admin');
const { detectCat, qtyDefault } = require('./detectCat');

// ── Firebase init (una sola volta per container) ────────────────
if (!admin.apps.length) {
  const svc = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
  admin.initializeApp({ credential: admin.credential.cert(svc) });
}
const db = admin.firestore();
const HOUSEHOLD_ID = process.env.HOUSEHOLD_ID || 'casa';
const householdRef = db.collection('households').doc(HOUSEHOLD_ID);
const pantryRef = householdRef.collection('pantry');
const shoppingRef = householdRef.collection('shopping');
const addLogRef = householdRef.collection('additionLog');

// ── Helper ──────────────────────────────────────────────────────
function todayRome() {
  // YYYY-MM-DD in fuso Europe/Rome
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  return parts; // en-CA => "2026-07-10"
}

function daysTo(ds) {
  if (!ds) return null;
  const [y, m, d] = ds.split('-').map(Number);
  const exp = Date.UTC(y, m - 1, d);
  const [ny, nm, nd] = todayRome().split('-').map(Number);
  const now = Date.UTC(ny, nm - 1, nd);
  return Math.round((exp - now) / 86400000);
}

function cap(s) {
  s = String(s || '').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function slotValue(handlerInput, name) {
  try {
    return Alexa.getSlotValue(handlerInput.requestEnvelope, name) || '';
  } catch (_) { return ''; }
}

function speak(handlerInput, text, keepOpen) {
  const b = handlerInput.responseBuilder.speak(text);
  if (keepOpen) b.reprompt('Vuoi altro? Puoi aggiungere o togliere prodotti.');
  return b.withShouldEndSession(!keepOpen).getResponse();
}

// ── Intent: aggiungi in dispensa ────────────────────────────────
const AddPantryItemHandler = {
  canHandle(h) {
    return Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(h.requestEnvelope) === 'AddPantryItemIntent';
  },
  async handle(h) {
    const raw = slotValue(h, 'item');
    if (!raw) return speak(h, "Non ho capito quale prodotto aggiungere. Riprova dicendo, ad esempio, aggiungi latte in dispensa.", true);
    const name = cap(raw);
    const cat = detectCat(name);
    const def = qtyDefault(cat);
    const qty = Number(slotValue(h, 'quantity')) || def.qty;
    const unit = slotValue(h, 'unit') || def.unit;
    const now = Date.now();

    await pantryRef.add({
      name, name_lc: name.toLowerCase(), quantity: qty, unit, category: cat,
      expiryDate: null, originalExpiry: null, frozen: false, frozenDate: null,
      thawedDate: null, barcode: null, addedDate: todayRome(),
      source: 'alexa', createdAt: now,
    });
    await addLogRef.add({ name, category: cat, qty, unit, price: null, date: todayRome(), source: 'alexa' });

    return speak(h, `Ho aggiunto ${name} in dispensa.`, true);
  },
};

// ── Intent: aggiungi alla spesa (con deduplica) ─────────────────
const AddShoppingItemHandler = {
  canHandle(h) {
    return Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(h.requestEnvelope) === 'AddShoppingItemIntent';
  },
  async handle(h) {
    const raw = slotValue(h, 'item');
    if (!raw) return speak(h, "Non ho capito cosa aggiungere alla lista della spesa.", true);
    const name = cap(raw);
    const lc = name.toLowerCase();

    const dup = await shoppingRef.where('name_lc', '==', lc).where('checked', '==', false).limit(1).get();
    if (!dup.empty) return speak(h, `${name} è già nella lista della spesa.`, true);

    await shoppingRef.add({
      name, name_lc: lc, category: detectCat(name), checked: false,
      addedDate: todayRome(), hintPrice: null, hintQty: null, hintUnit: null,
      source: 'alexa', createdAt: Date.now(),
    });
    return speak(h, `Ho aggiunto ${name} alla lista della spesa.`, true);
  },
};

// ── Intent: rimuovi dalla dispensa ──────────────────────────────
const RemovePantryItemHandler = {
  canHandle(h) {
    return Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(h.requestEnvelope) === 'RemovePantryItemIntent';
  },
  async handle(h) {
    const raw = slotValue(h, 'item');
    if (!raw) return speak(h, "Non ho capito cosa togliere dalla dispensa.", true);
    const lc = cap(raw).toLowerCase();
    const snap = await pantryRef.where('name_lc', '==', lc).get();
    if (snap.empty) return speak(h, `Non ho trovato ${cap(raw)} in dispensa.`, true);
    const batch = db.batch();
    snap.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    return speak(h, `Ho tolto ${cap(raw)} dalla dispensa.`, true);
  },
};

// ── Intent: rimuovi dalla spesa ─────────────────────────────────
const RemoveShoppingItemHandler = {
  canHandle(h) {
    return Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(h.requestEnvelope) === 'RemoveShoppingItemIntent';
  },
  async handle(h) {
    const raw = slotValue(h, 'item');
    if (!raw) return speak(h, "Non ho capito cosa togliere dalla lista della spesa.", true);
    const lc = cap(raw).toLowerCase();
    const snap = await shoppingRef.where('name_lc', '==', lc).get();
    if (snap.empty) return speak(h, `Non ho trovato ${cap(raw)} nella lista della spesa.`, true);
    const batch = db.batch();
    snap.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    return speak(h, `Ho tolto ${cap(raw)} dalla lista della spesa.`, true);
  },
};

// ── Intent: controlla presenza in dispensa ──────────────────────
const CheckItemHandler = {
  canHandle(h) {
    return Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(h.requestEnvelope) === 'CheckItemIntent';
  },
  async handle(h) {
    const raw = slotValue(h, 'item');
    if (!raw) return speak(h, "Non ho capito quale prodotto cercare.", true);
    const lc = cap(raw).toLowerCase();
    const snap = await pantryRef.where('name_lc', '==', lc).get();
    if (snap.empty) return speak(h, `No, non hai ${cap(raw)} in dispensa.`, true);
    let tot = 0; let unit = '';
    snap.forEach((doc) => { const d = doc.data(); tot += Number(d.quantity) || 0; unit = d.unit || unit; });
    return speak(h, `Sì, hai ${tot} ${unit} di ${cap(raw)} in dispensa.`, true);
  },
};

// ── Intent: cosa scade ──────────────────────────────────────────
const ListExpiringHandler = {
  canHandle(h) {
    return Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(h.requestEnvelope) === 'ListExpiringIntent';
  },
  async handle(h) {
    const snap = await pantryRef.get();
    const soon = [];
    snap.forEach((doc) => {
      const d = doc.data();
      if (d.frozen) return;
      const days = daysTo(d.expiryDate);
      if (days !== null && days >= 0 && days <= 7) soon.push({ name: d.name, days });
    });
    if (!soon.length) return speak(h, 'Non hai prodotti in scadenza nei prossimi sette giorni.', true);
    soon.sort((a, b) => a.days - b.days);
    const list = soon.map((x) => `${x.name} tra ${x.days} giorni`).join(', ');
    return speak(h, `In scadenza: ${list}.`, true);
  },
};

// ── Intent: leggi lista spesa ───────────────────────────────────
const ListShoppingHandler = {
  canHandle(h) {
    return Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(h.requestEnvelope) === 'ListShoppingIntent';
  },
  async handle(h) {
    const snap = await shoppingRef.where('checked', '==', false).get();
    if (snap.empty) return speak(h, 'La lista della spesa è vuota.', true);
    const names = [];
    snap.forEach((doc) => names.push(doc.data().name));
    return speak(h, `Devi comprare: ${names.join(', ')}.`, true);
  },
};

// ── Handler di sistema ──────────────────────────────────────────
const LaunchRequestHandler = {
  canHandle(h) { return Alexa.getRequestType(h.requestEnvelope) === 'LaunchRequest'; },
  handle(h) {
    return speak(h, 'Ciao, sono la tua dispensa. Puoi dirmi di aggiungere o togliere prodotti, o chiedermi cosa sta per scadere.', true);
  },
};

const HelpHandler = {
  canHandle(h) {
    return Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(h.requestEnvelope) === 'AMAZON.HelpIntent';
  },
  handle(h) {
    return speak(h, 'Puoi dire: aggiungi latte in dispensa; aggiungi pane alla lista della spesa; togli il tonno dalla dispensa; oppure, cosa sta per scadere.', true);
  },
};

const StopHandler = {
  canHandle(h) {
    return Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest' &&
      ['AMAZON.StopIntent', 'AMAZON.CancelIntent'].includes(Alexa.getIntentName(h.requestEnvelope));
  },
  handle(h) { return speak(h, 'A presto!'); },
};

const FallbackHandler = {
  canHandle(h) {
    return Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(h.requestEnvelope) === 'AMAZON.FallbackIntent';
  },
  handle(h) {
    return speak(h, "Non ho capito. Prova a dire: aggiungi latte in dispensa, oppure, cosa sta per scadere.", true);
  },
};

const SessionEndedHandler = {
  canHandle(h) { return Alexa.getRequestType(h.requestEnvelope) === 'SessionEndedRequest'; },
  handle(h) { return h.responseBuilder.getResponse(); },
};

const ErrorHandler = {
  canHandle() { return true; },
  handle(h, error) {
    console.error('Errore skill:', error);
    return speak(h, 'Ops, qualcosa è andato storto. Riprova tra poco.');
  },
};

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
