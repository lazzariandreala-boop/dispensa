'use strict';
/**
 * Skill Alexa "Dispensa" — versione DIAGNOSTICA + funzionante.
 * Tutto il codice gira dentro un try/catch nel handler: qualunque errore
 * (anche di caricamento) viene catturato e PRONUNCIATO da Alexa, così si vede
 * subito la causa senza dover leggere CloudWatch.
 */

exports.handler = async (event, context) => {
  try {
    return await runSkill(event, context);
  } catch (err) {
    const msg = String((err && (err.stack || err.message)) || err || 'errore sconosciuto')
      .replace(/[\r\n]+/g, ' ').replace(/[<>&"']/g, ' ').slice(0, 350);
    return {
      version: '1.0',
      response: {
        outputSpeech: { type: 'PlainText', text: 'Diagnostica errore: ' + msg },
        shouldEndSession: true,
      },
    };
  }
};

async function runSkill(event, context) {
  const Alexa = require('ask-sdk-core');
  const https = require('https');
  const crypto = require('crypto');

  // ── Config: service account + household id ─────────────────────
  let SA = null;
  let HOUSEHOLD_ID = 'casa';
  if (process.env.FIREBASE_SERVICE_ACCOUNT) SA = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  else { try { SA = require('./service-account.json'); } catch (e) { /* gestito dove serve */ } }
  if (process.env.HOUSEHOLD_ID) HOUSEHOLD_ID = process.env.HOUSEHOLD_ID;
  else { try { HOUSEHOLD_ID = require('./config.json').householdId || 'casa'; } catch (e) { /* default */ } }
  const PROJECT_ID = SA && SA.project_id;
  const FS_BASE = () => `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
  const DOC_URL = () => `${FS_BASE()}/households/${HOUSEHOLD_ID}`;

  // ── Categorie ──────────────────────────────────────────────────
  const CAT_RULES = [
    { c: 'uova', w: ['uova', 'uovo'] },
    { c: 'carne', w: ['pollo', 'manzo', 'vitello', 'maiale', 'agnello', 'tacchino', 'bistecca', 'hamburger', 'macinata', 'macinato', 'salsiccia', 'wurstel', 'arrosto', 'coniglio'] },
    { c: 'pesce', w: ['salmone', 'tonno', 'merluzzo', 'branzino', 'orata', 'gamberi', 'cozze', 'vongole', 'calamari', 'trota', 'acciughe', 'sardine', 'polpo', 'sgombro', 'pesce'] },
    { c: 'verdure', w: ['pomodoro', 'pomodori', 'cipolla', 'cipolle', 'carota', 'carote', 'zucchina', 'zucchine', 'melanzana', 'peperone', 'peperoni', 'spinaci', 'insalata', 'cavolo', 'broccoli', 'funghi', 'piselli', 'lattuga', 'zucca', 'patata', 'patate'] },
    { c: 'frutta', w: ['mela', 'mele', 'pera', 'pere', 'banana', 'banane', 'arancia', 'arance', 'limone', 'limoni', 'fragola', 'fragole', 'uva', 'kiwi', 'ananas', 'pesca', 'mango', 'avocado', 'melone'] },
    { c: 'latticini', w: ['latte', 'yogurt', 'formaggio', 'mozzarella', 'parmigiano', 'ricotta', 'burro', 'panna', 'mascarpone', 'gorgonzola', 'pecorino', 'grana', 'scamorza', 'provolone'] },
    { c: 'pasta_cereali', w: ['pasta', 'spaghetti', 'rigatoni', 'penne', 'fusilli', 'riso', 'orzo', 'farro', 'couscous', 'cracker', 'cereali', 'cornflakes', 'avena', 'lasagne', 'tagliatelle', 'polenta'] },
    { c: 'pane', w: ['pane', 'baguette', 'panino', 'piadina', 'focaccia', 'ciabatta', 'toast', 'brioche', 'cornetto', 'croissant'] },
    { c: 'salumi', w: ['prosciutto', 'salame', 'mortadella', 'bresaola', 'pancetta', 'guanciale', 'speck', 'coppa', 'salumi'] },
    { c: 'condimenti', w: ['olio', 'aceto', 'sale', 'pepe', 'salsa', 'ketchup', 'maionese', 'senape', 'pesto', 'curry', 'basilico', 'origano', 'spezie', 'dado'] },
    { c: 'bevande', w: ['acqua', 'succo', 'birra', 'vino', 'coca', 'tè', 'caffè', 'aranciata', 'brodo'] },
    { c: 'dolci', w: ['cioccolato', 'biscotti', 'torta', 'gelato', 'nutella', 'marmellata', 'miele', 'zucchero', 'cacao', 'lievito', 'confettura'] },
    { c: 'legumi', w: ['fagioli', 'lenticchie', 'ceci', 'fave', 'cannellini', 'borlotti', 'legumi'] },
    { c: 'surgelati', w: ['surgelat', 'congelat'] },
    { c: 'farine', w: ['farina', 'manitoba', 'maizena', 'amido'] },
    { c: 'scatola', w: ['pelati', 'lattina', 'conserva', 'olive', 'capperi', 'mais'] },
  ];
  const CAT_QTY_DEFAULTS = {
    uova: { qty: 6, unit: 'pz' }, carne: { qty: 500, unit: 'g' }, pesce: { qty: 300, unit: 'g' },
    verdure: { qty: 500, unit: 'g' }, frutta: { qty: 1, unit: 'kg' }, latticini: { qty: 1, unit: 'pz' },
    pasta_cereali: { qty: 500, unit: 'g' }, pane: { qty: 1, unit: 'pz' }, salumi: { qty: 150, unit: 'g' },
    condimenti: { qty: 1, unit: 'pz' }, surgelati: { qty: 1, unit: 'pz' }, bevande: { qty: 1, unit: 'l' },
    dolci: { qty: 1, unit: 'pz' }, legumi: { qty: 400, unit: 'g' },
    farine: { qty: 1, unit: 'kg' }, scatola: { qty: 1, unit: 'pz' }, generico: { qty: 1, unit: 'pz' },
  };
  function detectCat(name) { const n = String(name || '').toLowerCase(); for (const r of CAT_RULES) if (r.w.some((w) => n.includes(w))) return r.c; return 'generico'; }
  function qtyDefault(cat) { return CAT_QTY_DEFAULTS[cat] || CAT_QTY_DEFAULTS.generico; }

  // ── Helper ─────────────────────────────────────────────────────
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function todayRome() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
  function daysTo(ds) { if (!ds) return null; const [y, m, d] = ds.split('-').map(Number); const [ny, nm, nd] = todayRome().split('-').map(Number); return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ny, nm - 1, nd)) / 86400000); }
  function cap(s) { s = String(s || '').trim(); return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function emptyPayload() { return { items: [], shopping: [], consumptionLog: [], additionLog: [], monthlyReports: [], priceBook: {}, v: 3 }; }
  function slotValue(h, name) { try { return Alexa.getSlotValue(h.requestEnvelope, name) || ''; } catch (_) { return ''; } }
  function speak(h, text, keepOpen) { const b = h.responseBuilder.speak(text); if (keepOpen) b.reprompt('Vuoi altro?'); return b.withShouldEndSession(!keepOpen).getResponse(); }

  // ── HTTP + OAuth (JWT) ─────────────────────────────────────────
  function httpsRequest(urlStr, { method = 'GET', headers = {}, body = null } = {}) {
    return new Promise((resolve, reject) => {
      const u = new URL(urlStr);
      const req = https.request({ hostname: u.hostname, path: u.pathname + u.search, method, headers }, (res) => {
        let data = ''; res.on('data', (c) => (data += c)); res.on('end', () => resolve({ status: res.statusCode, body: data }));
      });
      req.on('error', reject); if (body) req.write(body); req.end();
    });
  }
  function b64url(input) { return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  async function getAccessToken() {
    if (!SA || !SA.client_email || !SA.private_key) throw new Error('service-account.json assente o incompleto');
    const now = Math.floor(Date.now() / 1000);
    const tokenUri = SA.token_uri || 'https://oauth2.googleapis.com/token';
    const claims = { iss: SA.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: tokenUri, iat: now, exp: now + 3600 };
    const unsigned = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) + '.' + b64url(JSON.stringify(claims));
    const sig = crypto.createSign('RSA-SHA256').update(unsigned).sign(SA.private_key);
    const jwt = unsigned + '.' + b64url(sig);
    const form = 'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=' + encodeURIComponent(jwt);
    const res = await httpsRequest(tokenUri, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(form) }, body: form });
    const json = JSON.parse(res.body);
    if (!json.access_token) throw new Error('Token non ottenuto: ' + res.body.slice(0, 100));
    return json.access_token;
  }

  // ── Conversione JS ↔ Firestore ─────────────────────────────────
  function toValue(v) {
    if (v === null || v === undefined) return { nullValue: null };
    if (typeof v === 'boolean') return { booleanValue: v };
    if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    if (typeof v === 'string') return { stringValue: v };
    if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
    if (typeof v === 'object') return { mapValue: { fields: toFields(v) } };
    return { stringValue: String(v) };
  }
  function toFields(o) { const f = {}; for (const k of Object.keys(o)) f[k] = toValue(o[k]); return f; }
  function fromValue(val) {
    if (!val) return null;
    if ('nullValue' in val) return null;
    if ('booleanValue' in val) return val.booleanValue;
    if ('integerValue' in val) return Number(val.integerValue);
    if ('doubleValue' in val) return val.doubleValue;
    if ('stringValue' in val) return val.stringValue;
    if ('timestampValue' in val) return val.timestampValue;
    if ('arrayValue' in val) return (val.arrayValue.values || []).map(fromValue);
    if ('mapValue' in val) return fromFields(val.mapValue.fields || {});
    return null;
  }
  function fromFields(fields) { const o = {}; for (const k of Object.keys(fields || {})) o[k] = fromValue(fields[k]); return o; }

  async function readState() {
    const token = await getAccessToken();
    const res = await httpsRequest(DOC_URL(), { headers: { Authorization: 'Bearer ' + token } });
    if (res.status === 404) return emptyPayload();
    if (res.status !== 200) throw new Error('Firestore GET ' + res.status + ': ' + res.body.slice(0, 100));
    const doc = JSON.parse(res.body);
    const data = doc.fields ? fromFields(doc.fields) : emptyPayload();
    for (const k of Object.keys(emptyPayload())) if (data[k] === undefined) data[k] = emptyPayload()[k];
    return data;
  }
  async function writeState(data) {
    const token = await getAccessToken();
    data.at = new Date().toISOString();
    const body = JSON.stringify({ fields: toFields(data) });
    const res = await httpsRequest(DOC_URL(), { method: 'PATCH', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, body });
    if (res.status !== 200) throw new Error('Firestore PATCH ' + res.status + ': ' + res.body.slice(0, 100));
  }
  async function withState(mutate) { const data = await readState(); const phrase = mutate(data) || ''; await writeState(data); return phrase; }

  // ── Handlers ───────────────────────────────────────────────────
  const is = (h, name) => Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest' && Alexa.getIntentName(h.requestEnvelope) === name;

  const handlers = [
    { canHandle: (h) => Alexa.getRequestType(h.requestEnvelope) === 'LaunchRequest',
      handle: (h) => speak(h, 'Ciao, sono la tua dispensa. Dimmi di aggiungere o togliere prodotti, o chiedimi cosa sta per scadere.', true) },

    { canHandle: (h) => is(h, 'AddPantryItemIntent'),
      async handle(h) {
        const raw = slotValue(h, 'item'); if (!raw) return speak(h, 'Non ho capito quale prodotto aggiungere.', true);
        const name = cap(raw), cat = detectCat(name), def = qtyDefault(cat);
        const qty = Number(slotValue(h, 'quantity')) || def.qty; const unit = slotValue(h, 'unit') || def.unit;
        const phrase = await withState((data) => {
          data.items.push({ id: uid(), name, quantity: qty, unit, category: cat, expiryDate: null, originalExpiry: null, frozen: false, frozenDate: null, thawedDate: null, barcode: null, addedDate: todayRome(), source: 'alexa' });
          data.additionLog.push({ id: uid(), name, category: cat, qty, unit, price: null, date: todayRome(), source: 'alexa' });
          return `Ho aggiunto ${name} in dispensa.`;
        });
        return speak(h, phrase, true);
      } },

    { canHandle: (h) => is(h, 'AddShoppingItemIntent'),
      async handle(h) {
        const raw = slotValue(h, 'item'); if (!raw) return speak(h, 'Non ho capito cosa aggiungere alla lista.', true);
        const name = cap(raw);
        const phrase = await withState((data) => {
          if (data.shopping.some((s) => !s.checked && (s.name || '').toLowerCase() === name.toLowerCase())) return `${name} è già nella lista della spesa.`;
          data.shopping.push({ id: uid(), name, category: detectCat(name), checked: false, addedDate: todayRome(), hintPrice: null, hintQty: null, hintUnit: null, source: 'alexa' });
          return `Ho aggiunto ${name} alla lista della spesa.`;
        });
        return speak(h, phrase, true);
      } },

    { canHandle: (h) => is(h, 'RemovePantryItemIntent'),
      async handle(h) {
        const raw = slotValue(h, 'item'); if (!raw) return speak(h, 'Non ho capito cosa togliere.', true);
        const lc = cap(raw).toLowerCase();
        const phrase = await withState((data) => { const b = data.items.length; data.items = data.items.filter((it) => (it.name || '').toLowerCase() !== lc); return b === data.items.length ? `Non ho trovato ${cap(raw)} in dispensa.` : `Ho tolto ${cap(raw)} dalla dispensa.`; });
        return speak(h, phrase, true);
      } },

    { canHandle: (h) => is(h, 'RemoveShoppingItemIntent'),
      async handle(h) {
        const raw = slotValue(h, 'item'); if (!raw) return speak(h, 'Non ho capito cosa togliere dalla lista.', true);
        const lc = cap(raw).toLowerCase();
        const phrase = await withState((data) => { const b = data.shopping.length; data.shopping = data.shopping.filter((s) => !(s.name || '').toLowerCase().includes(lc)); return b === data.shopping.length ? `Non ho trovato ${cap(raw)} nella lista.` : `Ho tolto ${cap(raw)} dalla lista della spesa.`; });
        return speak(h, phrase, true);
      } },

    { canHandle: (h) => is(h, 'CheckItemIntent'),
      async handle(h) {
        const raw = slotValue(h, 'item'); if (!raw) return speak(h, 'Non ho capito quale prodotto cercare.', true);
        const lc = cap(raw).toLowerCase(); const data = await readState();
        const found = data.items.filter((it) => (it.name || '').toLowerCase().includes(lc));
        if (!found.length) return speak(h, `No, non hai ${cap(raw)} in dispensa.`, true);
        const tot = found.reduce((s, it) => s + (Number(it.quantity) || 0), 0);
        return speak(h, `Sì, hai ${tot} ${found[0].unit || ''} di ${cap(raw)} in dispensa.`, true);
      } },

    { canHandle: (h) => is(h, 'ListExpiringIntent'),
      async handle(h) {
        const data = await readState();
        const soon = data.items.filter((it) => !it.frozen).map((it) => ({ name: it.name, days: daysTo(it.expiryDate) })).filter((x) => x.days !== null && x.days >= 0 && x.days <= 7).sort((a, b) => a.days - b.days);
        if (!soon.length) return speak(h, 'Non hai prodotti in scadenza nei prossimi sette giorni.', true);
        return speak(h, 'In scadenza: ' + soon.map((x) => `${x.name} tra ${x.days} giorni`).join(', ') + '.', true);
      } },

    { canHandle: (h) => is(h, 'ListShoppingIntent'),
      async handle(h) {
        const data = await readState(); const names = data.shopping.filter((s) => !s.checked).map((s) => s.name);
        if (!names.length) return speak(h, 'La lista della spesa è vuota.', true);
        return speak(h, 'Devi comprare: ' + names.join(', ') + '.', true);
      } },

    { canHandle: (h) => is(h, 'AMAZON.HelpIntent'), handle: (h) => speak(h, 'Puoi dire: aggiungi latte in dispensa; aggiungi pane alla lista della spesa; oppure, cosa sta per scadere.', true) },
    { canHandle: (h) => is(h, 'AMAZON.StopIntent') || is(h, 'AMAZON.CancelIntent'), handle: (h) => speak(h, 'A presto!') },
    { canHandle: (h) => is(h, 'AMAZON.FallbackIntent'), handle: (h) => speak(h, 'Non ho capito. Prova a dire: aggiungi latte in dispensa.', true) },
    { canHandle: (h) => Alexa.getRequestType(h.requestEnvelope) === 'SessionEndedRequest', handle: (h) => h.responseBuilder.getResponse() },
  ];

  const ErrorHandler = {
    canHandle: () => true,
    handle(h, error) {
      const m = String((error && error.message) || error).replace(/[<>&"']/g, ' ').slice(0, 250);
      return speak(h, 'Errore: ' + m);
    },
  };

  const skill = Alexa.SkillBuilders.custom().addRequestHandlers(...handlers).addErrorHandlers(ErrorHandler).create();
  return skill.invoke(event, context);
}
