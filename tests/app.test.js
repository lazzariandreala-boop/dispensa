'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSandbox } = require('./sandbox.js');

// Un sandbox "pulito" per ogni gruppo, così lo stato non si mescola.
function fresh(opts) { return loadSandbox(opts); }

// ─────────────────────────────────────────────────────────────
// Helper date
// ─────────────────────────────────────────────────────────────
test('today() ritorna formato YYYY-MM-DD in ora locale', () => {
  const s = fresh();
  const t = s.today();
  assert.match(t, /^\d{4}-\d{2}-\d{2}$/);
  const d = new Date();
  const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  assert.equal(t, expected);
});

test('daysTo() calcola i giorni corretti senza sfasamenti UTC', () => {
  const s = fresh();
  assert.equal(s.daysTo(s.today()), 0);
  assert.equal(s.daysTo(s.addDays(s.today(), 5)), 5);
  assert.equal(s.daysTo(s.addDays(s.today(), -3)), -3);
  assert.equal(s.daysTo(null), null);
  assert.equal(s.daysTo(''), null);
});

test('addDays() gestisce cambio mese e anno', () => {
  const s = fresh();
  assert.equal(s.addDays('2025-01-31', 1), '2025-02-01');
  assert.equal(s.addDays('2025-12-31', 1), '2026-01-01');
  assert.equal(s.addDays('2025-03-01', -1), '2025-02-28');
});

test('fmtDate() formatta in italiano e gestisce valori vuoti', () => {
  const s = fresh();
  assert.equal(s.fmtDate(''), '');
  assert.equal(s.fmtDate(null), '');
  assert.match(s.fmtDate('2025-03-15'), /15/);
});

// ─────────────────────────────────────────────────────────────
// Rilevamento categoria
// ─────────────────────────────────────────────────────────────
test('detectCat() riconosce le categorie principali', () => {
  const s = fresh();
  assert.equal(s.detectCat('Pollo'), 'carne');
  assert.equal(s.detectCat('Salmone fresco'), 'pesce');
  assert.equal(s.detectCat('Pomodoro fresco'), 'verdure');
  assert.equal(s.detectCat('Mela golden'), 'frutta');
  assert.equal(s.detectCat('Latte intero'), 'latticini');
  assert.equal(s.detectCat('Spaghetti'), 'pasta_cereali');
  assert.equal(s.detectCat('Guanciale'), 'salumi');
  // categorie aggiunte: uova e frutta secca
  assert.equal(s.detectCat('Uova fresche'), 'uova');
  assert.equal(s.detectCat('Mandorle'), 'frutta_secca');
  assert.equal(s.detectCat('Aperol'), 'alcolici');
  assert.equal(s.detectCat('Aglio'), 'verdure');
});

test('detectCat() ritorna "generico" per nomi sconosciuti', () => {
  const s = fresh();
  assert.equal(s.detectCat('Xyzabc'), 'generico');
  assert.equal(s.detectCat(''), 'generico');
});

test('detectCat() è case-insensitive', () => {
  const s = fresh();
  assert.equal(s.detectCat('POLLO'), s.detectCat('pollo'));
});

// ─────────────────────────────────────────────────────────────
// Freezer / scongelamento
// ─────────────────────────────────────────────────────────────
test('freezeExp() estende la scadenza secondo la categoria', () => {
  const s = fresh();
  assert.equal(s.freezeExp('2025-01-01', 'carne'), s.addDays('2025-01-01', 90));
  assert.equal(s.freezeExp('2025-01-01', 'pesce'), s.addDays('2025-01-01', 60));
  // categoria sconosciuta → fallback 60 giorni
  assert.equal(s.freezeExp('2025-01-01', 'sconosciuta'), s.addDays('2025-01-01', 60));
});

test('thawExp() calcola il limite dopo scongelamento da oggi', () => {
  const s = fresh();
  assert.equal(s.thawExp('pesce'), s.addDays(s.today(), 1));
  assert.equal(s.thawExp('carne'), s.addDays(s.today(), 2));
});

// ─────────────────────────────────────────────────────────────
// Ricette
// ─────────────────────────────────────────────────────────────
test('findIng() trova ingrediente con match fuzzy', () => {
  const s = fresh();
  s.__run("items.length = 0; items.push({id:'1',name:'Spaghetti De Cecco',quantity:500,unit:'g',category:'pasta_cereali'})");
  const found = s.findIng('spaghetti', 'pasta');
  assert.ok(found);
  assert.equal(found.name, 'Spaghetti De Cecco');
  assert.equal(s.findIng('caviale', ''), null);
});

test('canMake() vero solo con quantità sufficiente', () => {
  const s = fresh();
  s.__run("items.length = 0; items.push({id:'1',name:'Pasta',quantity:200,unit:'g',category:'pasta_cereali'})");
  const recipe = { ingredients: [{ name: 'Pasta', key: 'pasta', amt: 160 }] };
  assert.equal(s.canMake(recipe), true);
  const recipeBig = { ingredients: [{ name: 'Pasta', key: 'pasta', amt: 400 }] };
  assert.equal(s.canMake(recipeBig), false);
  // canMake1 accetta ≥50%
  assert.equal(s.canMake1(recipeBig), true);
});

test('RECIPES è un array non vuoto e ben formato', () => {
  const s = fresh();
  const info = s.__run("({len: RECIPES.length, first: RECIPES[0], allValid: RECIPES.every(r => r.name && Array.isArray(r.ingredients) && Array.isArray(r.steps))})");
  assert.ok(info.len > 0, 'ci sono ricette');
  assert.ok(info.allValid, 'ogni ricetta ha name, ingredients[], steps[]');
});

// ─────────────────────────────────────────────────────────────
// escHtml (sicurezza XSS di base)
// ─────────────────────────────────────────────────────────────
test('escHtml() neutralizza i caratteri HTML', () => {
  const s = fresh();
  assert.equal(s.escHtml('<script>'), '&lt;script&gt;');
  assert.equal(s.escHtml('a & b "c"'), 'a &amp; b &quot;c&quot;');
});

// ─────────────────────────────────────────────────────────────
// filterLog (reportistica)
// ─────────────────────────────────────────────────────────────
test('filterLog() filtra per intervallo di date', () => {
  const s = fresh();
  const log = [
    { date: '2025-01-01' }, { date: '2025-06-15' },
    { date: '2025-12-31' }, { date: null },
  ];
  assert.equal(s.filterLog(log, '2025-01-01', '2025-12-31').length, 3);
  assert.equal(s.filterLog(log, '2025-06-01', '2025-07-01').length, 1);
  assert.equal(s.filterLog(log, null, null).length, 3); // scarta date null
});

// ─────────────────────────────────────────────────────────────
// AI / JARVIS — azioni strutturate
// ─────────────────────────────────────────────────────────────
test('jarvisBuildContext() include conteggi e data', () => {
  const s = fresh();
  s.__run("items.length = 0; shopping.length = 0; items.push({id:'1',name:'Latte',quantity:1,unit:'l',category:'latticini',expiryDate:null,frozen:false})");
  const ctx = s.jarvisBuildContext();
  assert.match(ctx, /Dispensa: 1 prodotti totali/);
  assert.match(ctx, /Lista spesa/);
});

test('jarvisHandleResponse() azione dispensa_add aggiunge un prodotto', async () => {
  const s = fresh();
  s.__run("items.length = 0; additionLog.length = 0;");
  await s.jarvisHandleResponse({
    speak: 'Aggiunto', display: 'ok',
    action: 'dispensa_add', params: { name: 'pasta', qty: 500, unit: 'g' },
  });
  const state = s.__run("({n: items.length, name: items[0] && items[0].name, cat: items[0] && items[0].category, log: additionLog.length})");
  assert.equal(state.n, 1);
  assert.equal(state.name, 'Pasta'); // capitalizzato
  assert.equal(state.cat, 'pasta_cereali'); // categoria auto-rilevata
  assert.equal(state.log, 1); // registrato nel log aggiunte
});

test('jarvisHandleResponse() azione spesa_add aggiunge (e deduplica)', async () => {
  const s = fresh();
  s.__run("shopping.length = 0;");
  await s.jarvisHandleResponse({ speak: '', action: 'spesa_add', params: { items: ['Pane', 'Latte'] } });
  await s.jarvisHandleResponse({ speak: '', action: 'spesa_add', params: { items: ['pane'] } }); // duplicato
  const names = s.__run("shopping.map(x => x.name)");
  assert.equal(names.length, 2);
  assert.ok(names.includes('Pane'));
  assert.ok(names.includes('Latte'));
});

test('jarvisHandleResponse() azione spesa_remove rimuove per nome', async () => {
  const s = fresh();
  s.__run("shopping.length = 0; shopping.push({id:'1',name:'Pane',checked:false},{id:'2',name:'Latte',checked:false})");
  await s.jarvisHandleResponse({ speak: '', action: 'spesa_remove', params: { name: 'pane' } });
  const names = JSON.parse(s.__run("JSON.stringify(shopping.map(x => x.name))"));
  assert.deepEqual(names, ['Latte']);
});

test('jarvisHandleResponse() senza action non modifica lo stato', async () => {
  const s = fresh();
  s.__run("items.length = 0; shopping.length = 0;");
  await s.jarvisHandleResponse({ speak: 'ciao', display: 'ciao', action: null, params: {} });
  const state = s.__run("({i: items.length, sh: shopping.length})");
  assert.equal(state.i, 0);
  assert.equal(state.sh, 0);
});

// ─────────────────────────────────────────────────────────────
// AI / JARVIS — chiamata API (fetch mockato)
// ─────────────────────────────────────────────────────────────
test('jarvisAskClaude() senza API key ritorna messaggio di errore, niente fetch', async () => {
  let called = false;
  const s = fresh({ fetch: async () => { called = true; return { ok: true, json: async () => ({}) }; } });
  s.__run("groqApiKey = ''");
  const res = await s.jarvisAskClaude('ciao');
  assert.equal(called, false, 'non deve chiamare la rete senza key');
  assert.equal(res.action, null);
  assert.match(res.display, /API key/);
});

test('jarvisAskClaude() invia la richiesta corretta e parsa il JSON', async () => {
  let captured = null;
  const s = fresh({
    fetch: async (url, init) => {
      captured = { url, init };
      return {
        ok: true, status: 200,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify({ speak: 'Fatto', display: 'ok', action: 'spesa_add', params: { items: ['Riso'] } }) } }],
        }),
      };
    },
  });
  s.__run("groqApiKey = 'gsk_test123'; jarvisHistory.length = 0;");
  const res = await s.jarvisAskClaude('aggiungi riso alla spesa');

  // Verifica endpoint e header
  assert.match(captured.url, /api\.groq\.com/);
  assert.equal(captured.init.headers['Authorization'], 'Bearer gsk_test123');
  const body = JSON.parse(captured.init.body);
  assert.equal(body.model, 'llama-3.3-70b-versatile');
  assert.equal(body.messages[0].role, 'system');
  assert.match(body.messages[0].content, /Jarvis/);
  // L'ultimo messaggio utente deve essere incluso
  assert.equal(body.messages[body.messages.length - 1].content, 'aggiungi riso alla spesa');

  // Verifica parsing risposta
  assert.equal(res.action, 'spesa_add');
  assert.deepEqual(res.params.items, ['Riso']);
});

test('jarvisAskClaude() gestisce risposta non-JSON come testo vocale', async () => {
  const s = fresh({
    fetch: async () => ({
      ok: true, status: 200,
      json: async () => ({ choices: [{ message: { content: 'Ciao Andrea, come stai?' } }] }),
    }),
  });
  s.__run("groqApiKey = 'gsk_x'; jarvisHistory.length = 0;");
  const res = await s.jarvisAskClaude('ciao');
  assert.match(res.speak, /Ciao Andrea/);
  assert.equal(res.action, null);
});

test('jarvisAskClaude() gestisce errore HTTP senza lanciare', async () => {
  const s = fresh({
    fetch: async () => ({
      ok: false, status: 401,
      json: async () => ({ error: { message: 'Invalid API Key' } }),
    }),
  });
  s.__run("groqApiKey = 'gsk_bad'; jarvisHistory.length = 0;");
  const res = await s.jarvisAskClaude('ciao');
  assert.equal(res.action, null);
  assert.match(res.display, /Invalid API Key/);
});
