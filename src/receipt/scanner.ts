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
import { reconstructRows } from './layout';
import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

/** Scatta una foto con la fotocamera nativa → data URL (o null se annullato). */
async function takePhoto(): Promise<string | null> {
  try {
    const photo = await Camera.getPhoto({ source: CameraSource.Camera, resultType: CameraResultType.DataUrl, quality: 60, width: 1600 });
    return photo?.dataUrl || null;
  } catch { return null; } // annullato dall'utente
}
/** Sceglie una foto dalla galleria nativa → data URL (o null). */
async function pickPhoto(): Promise<string | null> {
  try {
    const photo = await Camera.getPhoto({ source: CameraSource.Photos, resultType: CameraResultType.DataUrl, quality: 60, width: 1600 });
    return photo?.dataUrl || null;
  } catch { return null; }
}

let engineOverride: OcrEngine | null = null;
/** Permette di sostituire il motore OCR (test/futuri backend). */
export function setOcrEngine(e: OcrEngine): void { engineOverride = e; }

export interface ScanOutput {
  products: ReceiptProduct[];
  total: number | null;
  /** Testo grezzo restituito dall'OCR (per diagnosi quando non si riconosce nulla). */
  raw: string;
}

/** OCR di una o più immagini (anche parti dello stesso scontrino) → prodotti + totale + testo grezzo. */
async function scan(images: string[]): Promise<ScanOutput> {
  const engine = engineOverride || getOcrEngine();
  const texts: string[] = [];
  for (const img of images) {
    try {
      const res = await engine.recognize(img);
      // Se abbiamo le bounding box ricostruiamo le righe reali (layout a colonne),
      // altrimenti usiamo il testo grezzo così com'è.
      texts.push(res.lines.length ? reconstructRows(res.lines) : res.text);
    } catch (e) {
      console.error('OCR error', e);
    }
  }
  const raw = texts.join('\n');
  return { ...parseReceipt(raw), raw };
}

const ReceiptScanner = {
  available: isOcrAvailable,
  isNative: () => Capacitor.isNativePlatform(),
  scan,
  takePhoto,
  pickPhoto,
};
(window as unknown as { ReceiptScanner: typeof ReceiptScanner }).ReceiptScanner = ReceiptScanner;

export default ReceiptScanner;
