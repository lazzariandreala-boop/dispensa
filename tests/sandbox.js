'use strict';
/**
 * Carica lo <script> inline di index.html in un contesto isolato (vm),
 * fornendo stub minimi delle API del browser (DOM, localStorage, fetch,
 * SpeechRecognition, ecc.) in modo da poter testare le funzioni "pure"
 * dell'app senza un vero browser.
 *
 * Ritorna l'oggetto `sandbox`: contiene tutte le funzioni/variabili globali
 * dichiarate nello script (items, detectCat, daysTo, jarvisHandleResponse, ...).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function noop() { return undefined; }

// Element DOM fittizio: risponde a qualsiasi metodo/proprietà senza lanciare.
function makeEl() {
  const store = {
    value: '', textContent: '', innerText: '', innerHTML: '', className: '',
    id: '', placeholder: '', checked: false, disabled: false, scrollTop: 0,
    scrollHeight: 0, offsetHeight: 0, clientHeight: 0,
    style: new Proxy({}, { get: () => '', set: () => true }),
    dataset: {},
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    children: [], childNodes: [], files: [],
    parentNode: null, firstChild: null, nextElementSibling: null,
  };
  const methods = {
    addEventListener: noop, removeEventListener: noop, dispatchEvent: noop,
    appendChild: (c) => c, removeChild: (c) => c, prepend: noop, append: noop,
    insertBefore: noop, insertAdjacentHTML: noop, replaceChildren: noop,
    setAttribute: noop, getAttribute: () => null, removeAttribute: noop,
    hasAttribute: () => false, remove: noop, click: noop, focus: noop,
    blur: noop, scrollIntoView: noop, scrollTo: noop, getBoundingClientRect:
      () => ({ top: 0, left: 0, width: 0, height: 0, bottom: 0, right: 0 }),
    closest: () => null, matches: () => false,
  };
  const el = { ...store, ...methods };
  el.querySelector = () => makeEl();
  el.querySelectorAll = () => [];
  return new Proxy(el, {
    get(t, p) {
      if (p in t) return t[p];
      if (typeof p === 'symbol') return t[p];
      // proprietà sconosciuta: funzione no-op che ritorna l'elemento stesso
      const fn = () => proxyRef;
      return fn;
    },
    set(t, p, v) { t[p] = v; return true; },
  });
}
let proxyRef; // riferimento condiviso per get sconosciute

function makeLocalStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    clear: () => m.clear(),
    key: (i) => Array.from(m.keys())[i] ?? null,
    get length() { return m.size; },
    _map: m,
  };
}

function loadSandbox(opts = {}) {
  const htmlPath = path.join(__dirname, '..', 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  // Estrae il grande <script> inline (l'ultimo blocco, senza src)
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
  if (!scripts.length) throw new Error('Nessuno <script> inline trovato in index.html');
  const code = scripts[scripts.length - 1][1];

  proxyRef = makeEl();
  const doc = {
    getElementById: () => makeEl(),
    querySelector: () => makeEl(),
    querySelectorAll: () => [],
    createElement: () => makeEl(),
    createDocumentFragment: () => makeEl(),
    addEventListener: noop,
    removeEventListener: noop,
    body: makeEl(),
    documentElement: makeEl(),
    head: makeEl(),
    cookie: '',
    readyState: 'complete',
    hidden: false,
    visibilityState: 'visible',
  };

  const fetchMock = opts.fetch || (async () => ({
    ok: true, status: 200,
    json: async () => ({}),
    text: async () => '',
  }));

  const sandbox = {
    console,
    document: doc,
    localStorage: makeLocalStorage(),
    sessionStorage: makeLocalStorage(),
    navigator: {
      geolocation: { getCurrentPosition: (_ok, err) => err && err({ code: 2 }) },
      userAgent: 'node-test', language: 'it-IT', onLine: true,
      clipboard: { writeText: async () => {} },
      serviceWorker: { register: async () => ({}) },
    },
    location: { href: 'http://localhost/', reload: noop, protocol: 'http:', hostname: 'localhost' },
    speechSynthesis: { getVoices: () => [], cancel: noop, speak: noop, onvoiceschanged: null },
    SpeechSynthesisUtterance: function () { return {}; },
    SpeechRecognition: function () { return makeEl(); },
    webkitSpeechRecognition: function () { return makeEl(); },
    Html5Qrcode: function () { return { start: async () => {}, stop: async () => {}, clear: noop }; },
    Html5QrcodeScanner: function () { return { render: noop, clear: noop }; },
    fetch: fetchMock,
    setTimeout: (fn) => { if (opts.runTimers) { try { fn(); } catch (_) {} } return 0; },
    clearTimeout: noop,
    setInterval: () => 0,
    clearInterval: noop,
    requestAnimationFrame: (fn) => { try { fn(0); } catch (_) {} return 0; },
    cancelAnimationFrame: noop,
    alert: noop, confirm: () => true, prompt: () => null,
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    crypto: require('crypto').webcrypto,
    URL, URLSearchParams, TextEncoder, TextDecoder,
    Date, Math, JSON, Object, Array, String, Number, Boolean, RegExp, Error,
    Promise, Map, Set, Intl, parseInt, parseFloat, isNaN, isFinite,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;

  vm.createContext(sandbox);
  // `var`/`function` a top-level diventano proprietà del contesto sandbox.
  vm.runInContext(code, sandbox, { filename: 'index.inline.js' });
  // Helper per leggere/mutare le variabili `let`/`const` (non esposte su sandbox).
  sandbox.__run = (c) => vm.runInContext(c, sandbox);
  return sandbox;
}

module.exports = { loadSandbox, makeEl };
