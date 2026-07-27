// ============================================================================
// scanner.ts — Orchestrazione scansione scontrino, esposta su window per lo
// script classico dell'app (come charts.js/cloud.js).
//   immagini → OCR on-device → parser locale → { products, total }
// Restituisce lo stesso shape prodotti che il resto dell'app già consuma.
// ============================================================================
import { parseReceipt } from './parser';
import type { ReceiptProduct } from './parser';
import { getOcrEngine, isOcrAvailable } from './ocr';
import type { OcrEngine } from './ocr';

let engineOverride: OcrEngine | null = null;
/** Permette di sostituire il motore OCR (test/futuri backend). */
export function setOcrEngine(e: OcrEngine): void { engineOverride = e; }

export interface ScanOutput {
  products: ReceiptProduct[];
  total: number | null;
}

/** OCR di una o più immagini (anche parti dello stesso scontrino) → prodotti + totale. */
async function scan(images: string[]): Promise<ScanOutput> {
  const engine = engineOverride || getOcrEngine();
  const texts: string[] = [];
  for (const img of images) {
    try {
      texts.push(await engine.recognize(img));
    } catch (e) {
      console.error('OCR error', e);
    }
  }
  return parseReceipt(texts.join('\n'));
}

const ReceiptScanner = { available: isOcrAvailable, scan };
(window as unknown as { ReceiptScanner: typeof ReceiptScanner }).ReceiptScanner = ReceiptScanner;

export default ReceiptScanner;
