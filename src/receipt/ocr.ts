// ============================================================================
// ocr.ts — Motore OCR dietro un'interfaccia semplice, così il motore si può
// sostituire in un solo punto.
//  - Nativo (Android/iOS): ML Kit / Vision via plugin Capacitor (offline).
//  - Web (desktop): fallback Tesseract.js (caricato on-demand), così anche da
//    browser si può caricare l'immagine di uno scontrino.
// ============================================================================
import { Capacitor } from '@capacitor/core';
import { CapacitorPluginMlKitTextRecognition } from '@pantrist/capacitor-plugin-ml-kit-text-recognition';

export interface OcrEngine {
  /** Riconosce il testo da un'immagine (data URL o base64) e lo restituisce grezzo. */
  recognize(image: string): Promise<string>;
}

/** Rimuove il prefisso "data:image/...;base64," lasciando il solo base64. */
function toBase64(image: string): string {
  const i = image.indexOf(',');
  return i >= 0 && image.slice(0, i).includes('base64') ? image.slice(i + 1) : image;
}

/** Motore OCR nativo (ML Kit / Vision). */
export const mlkitOcr: OcrEngine = {
  async recognize(image: string): Promise<string> {
    const res = await CapacitorPluginMlKitTextRecognition.detectText({ base64Image: toBase64(image) });
    return res?.text || '';
  },
};

/** Motore OCR per browser: Tesseract.js (caricato dinamicamente). */
export const tesseractOcr: OcrEngine = {
  async recognize(image: string): Promise<string> {
    const { default: Tesseract } = await import('tesseract.js');
    const { data } = await Tesseract.recognize(image, 'ita');
    return data?.text || '';
  },
};

/** Sceglie il motore in base alla piattaforma. */
export function getOcrEngine(): OcrEngine {
  return Capacitor.isNativePlatform() ? mlkitOcr : tesseractOcr;
}

/** La scansione è disponibile ovunque: nativo (ML Kit) o web (Tesseract). */
export function isOcrAvailable(): boolean {
  return true;
}
