// ============================================================================
// parser.ts — Parser locale per scontrini fiscali italiani.
// Puro (nessun DOM, nessuna rete): dato il testo grezzo dell'OCR restituisce
// prodotti, quantità e prezzi + il totale. Degrada con eleganza: righe sporche
// o ambigue vengono saltate, mai eccezioni verso l'esterno.
// ============================================================================

export interface ReceiptProduct {
  name: string;
  qty: number;
  /** Unità rilevata dallo scontrino (kg/g/l/ml/pz/conf) o null se non presente. */
  unit: string | null;
  /** Prezzo pagato in euro, o null se non riconosciuto. */
  price: number | null;
}

export interface ReceiptScanResult {
  products: ReceiptProduct[];
  total: number | null;
}

// Prezzo — TOLLERANTE all'OCR: migliaia con "." o spazio, decimale "," o "."
// (l'OCR scambia spesso la virgola con il punto). Es: 1,29 · 1.29 · 1.234,56 · 1 234,56.
const PRICE = /\d{1,3}(?:[.\s]\d{3})*[.,]\d{2}(?!\d)/g;
// Prezzo a fine riga, eventualmente seguito da classe IVA/€/*/spazi.
const PRICE_AT_END = /(\d{1,3}(?:[.\s]\d{3})*[.,]\d{2})\s*(?:[A-Za-z€*]){0,3}\s*$/;
// Prezzo NEGATIVO a fine riga (sconto/abbuono) → non è un prodotto.
const NEG_AT_END = /[-–]\s*\d{1,3}(?:[.\s]\d{3})*[.,]\d{2}\s*(?:[A-Za-z€*]){0,3}\s*$/;
// Inizio della sezione riepilogo/totali: da qui in poi NON ci sono più prodotti.
const SUMMARY_START = /\b(SUBTOTAL|SUBTOTALE|PARZIALE|RIEPILOGO)\b/;
// Riga quantità: "2 X 1,20", "2x1.20", "N. 2 x 1,20".
const QTY_LINE = /^\s*(?:n[.\s]*)?(\d{1,3})\s*[xX*]\s*(\d{1,3}(?:[.\s]\d{3})*[.,]\d{2})/;
// Unità nella riga: "0,450 kg", "500 g", "1 l"…
const UNIT_IN_LINE = /(\d+(?:[.,]\d+)?)\s*(kg|gr|g|lt|l|ml|pz|pezzi|conf)\b/i;

// Righe di riepilogo/pagamento/intestazione da NON considerare prodotti.
const EXCLUDE = [
  'TOTALE', 'SUBTOTALE', 'PARZIALE', 'IVA', 'RESTO', 'CONTANTE', 'CARTA',
  'ELETTRONICO', 'BANCOMAT', 'PAGAMENTO', 'ARROTONDAMENTO', 'IMPORTO', 'SCONTO',
  'ABBUONO', 'P.IVA', 'PARTITA IVA', 'CODICE', 'SCONTRINO', 'DOCUMENTO', 'FATTURA',
  'CASSA', 'OPERATORE', 'ADDETTO', 'GRAZIE', 'ARRIVEDERCI', 'TEL', 'TELEFONO',
  'C.F', 'COD.', 'MATRICOLA', 'RT ', 'DITTA', 'S.R.L', 'S.P.A', 'PEZZI VENDUTI',
  'NUMERO ARTICOLI', 'ARTICOLI',
];

// L'ultimo separatore ("," o ".") è il decimale; gli altri sono migliaia.
// Robusto sia al formato IT (1.234,56) sia al punto decimale dell'OCR (1.29).
function parsePrice(s: string): number {
  const str = String(s).trim();
  const dec = Math.max(str.lastIndexOf(','), str.lastIndexOf('.'));
  if (dec === -1) return parseFloat(str.replace(/\D/g, '')) || 0;
  const intPart = str.slice(0, dec).replace(/\D/g, '');
  const decPart = str.slice(dec + 1).replace(/\D/g, '');
  return parseFloat((intPart || '0') + '.' + decPart);
}

// Match del token NON circondato da lettere: evita falsi positivi come
// "TEL" dentro "TELEVISORE" o "IVA" dentro "OLIVA".
function tokenPresent(upperLine: string, token: string): boolean {
  const t = token.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('(^|[^A-ZÀ-Ù])' + t + '([^A-ZÀ-Ù]|$)').test(upperLine);
}
function isExcluded(line: string): boolean {
  const u = line.toUpperCase();
  return EXCLUDE.some((k) => tokenPresent(u, k));
}

function normUnit(u: string): string {
  const x = u.toLowerCase();
  if (x === 'g' || x === 'gr') return 'g';
  if (x === 'kg') return 'kg';
  if (x === 'l' || x === 'lt') return 'l';
  if (x === 'ml') return 'ml';
  if (x === 'conf') return 'conf';
  if (x.startsWith('pz') || x.startsWith('pezz')) return 'pz';
  return 'pz';
}

/** Ripulisce la riga dal prezzo, dal codice articolo e dai residui per ricavare il nome. */
function cleanName(line: string): string {
  let s = line.replace(PRICE, ' ').replace(/€/g, ' ');
  s = s.replace(/\s+[A-Za-z]\s*$/, '');          // classe IVA finale (singola lettera)
  s = s.replace(/^\s*\d{3,}\s+/, '');             // codice articolo iniziale (>= 3 cifre)
  s = s.replace(/\b\d{1,3}\s*[xX]\s*$/, '');      // residuo "2 x"
  s = s.replace(/[*_]+/g, ' ').replace(/\s{2,}/g, ' ').replace(/[.\-_ ]+$/, '').trim();
  return s;
}

/** Costruisce un prodotto ricavando qty/unità dalla riga sorgente. */
function makeProduct(name: string, sourceLine: string, price: number | null): ReceiptProduct {
  let qty = 1;
  let unit: string | null = null;
  const um = sourceLine.match(UNIT_IN_LINE);
  if (um) {
    const n = parseFloat(um[1].replace(',', '.'));
    if (n > 0) qty = n;
    unit = normUnit(um[2]);
  }
  return { name, qty, unit, price };
}

/** Estrae prodotti e totale dal testo grezzo dell'OCR di uno scontrino italiano. */
export function parseReceipt(raw: string): ReceiptScanResult {
  const products: ReceiptProduct[] = [];
  let total: number | null = null;
  // Nome di prodotto letto senza prezzo: l'OCR a colonne mette spesso la
  // descrizione e il prezzo su righe separate → lo abbiniamo al prezzo seguente.
  let pendingName: string | null = null;
  // Da quando inizia la sezione riepilogo/totali (SUBTOTALE, TOTALE, RIEPILOGO…)
  // non ci sono più prodotti: solo sconti, IVA, pagamenti e footer da ignorare.
  let summaryReached = false;

  const lines = String(raw || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  for (const line of lines) {
    try {
      const upper = line.toUpperCase();

      // ── Totale ────────────────────────────────────────────────
      // Riga con "TOTALE" (ma non SUBTOTALE/PARZIALE/TOTALE IVA).
      if (/\bTOTALE\b/.test(upper) && !upper.includes('SUBTOTALE')
          && !upper.includes('PARZIALE') && !upper.includes('IVA')) {
        pendingName = null;
        summaryReached = true;
        const m = line.match(PRICE_AT_END);
        const val = m ? parsePrice(m[1]) : null;
        if (val != null) {
          // Preferisci "TOTALE COMPLESSIVO"/"TOTALE EURO"; altrimenti il primo trovato.
          if (upper.includes('COMPLESSIVO') || upper.includes('EURO') || total === null) total = val;
        }
        continue;
      }

      // Inizio riepilogo (SUBTOTALE/PARZIALE/RIEPILOGO) → stop ai prodotti.
      if (!summaryReached && SUMMARY_START.test(upper)) summaryReached = true;
      // Nella sezione riepilogo/footer non si estraggono prodotti.
      if (summaryReached) { pendingName = null; continue; }

      // ── Riga quantità "2 x 1,20" → aggiorna il prodotto precedente ──
      const q = line.match(QTY_LINE);
      if (q && products.length) {
        pendingName = null;
        const qty = parseInt(q[1], 10);
        const unitPrice = parsePrice(q[2]);
        const prev = products[products.length - 1];
        if (qty > 0) prev.qty = qty;
        // Se il prezzo prodotto coincide col prezzo unitario (o manca), calcola il totale riga.
        if (prev.price == null || Math.abs(prev.price - unitPrice) < 0.001) {
          prev.price = Math.round(qty * unitPrice * 100) / 100;
        }
        continue;
      }

      if (isExcluded(line)) { pendingName = null; continue; }

      // Prezzo negativo (sconto/abbuono fedeltà) → non è un prodotto.
      if (NEG_AT_END.test(line)) { pendingName = null; continue; }

      // ── Riga con prezzo a fine riga ─────────────────────────────
      const priceMatch = line.match(PRICE_AT_END);
      if (priceMatch) {
        const price = parsePrice(priceMatch[1]);
        const name = cleanName(line);
        if (name.length < 2 || /^\d+$/.test(name)) {
          // Solo prezzo (colonna prezzi separata): abbinalo al nome in sospeso.
          if (pendingName) { products.push(makeProduct(pendingName, line, price)); }
          pendingName = null;
          continue;
        }
        products.push(makeProduct(name, line, price));
        pendingName = null;
        continue;
      }

      // ── Riga senza prezzo: forse è un nome in attesa del prezzo (riga dopo) ──
      const cand = cleanName(line);
      pendingName = (cand.length >= 2 && /[A-Za-zÀ-ù]/.test(cand)) ? cand : null;
    } catch {
      // riga problematica → salta, non far crashare il parse
      pendingName = null;
    }
  }

  return { products, total };
}
