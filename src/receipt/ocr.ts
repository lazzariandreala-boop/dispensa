// ============================================================================
// ocr.ts — Motore OCR dietro un'interfaccia semplice, così il motore si può
// sostituire in un solo punto.
//  - Nativo (Android/iOS): ML Kit / Vision via plugin Capacitor (offline).
//  - Web (desktop): fallback Tesseract.js (caricato on-demand), così anche da
//    browser si può caricare l'immagine di uno scontrino.
// Restituisce sia il testo grezzo sia le righe con bounding box (per ricostruire
// il layout a colonne dello scontrino, vedi layout.ts).
// ============================================================================
import { Capacitor } from '@capacitor/core';
import { CapacitorPluginMlKitTextRecognition } from '@pantrist/capacitor-plugin-ml-kit-text-recognition';
import type { OcrLine } from './layout';

export interface OcrResult {
  /** Testo grezzo così come restituito dall'OCR. */
  text: string;
  /** Righe riconosciute con le loro bounding box (vuoto se non disponibili). */
  lines: OcrLine[];
}

export interface OcrEngine {
  /** Riconosce il testo da un'immagine (data URL o base64). */
  recognize(image: string): Promise<OcrResult>;
}

/** Rimuove il prefisso "data:image/...;base64," lasciando il solo base64. */
function toBase64(image: string): string {
  const i = image.indexOf(',');
  return i >= 0 && image.slice(0, i).includes('base64') ? image.slice(i + 1) : image;
}

/** Motore OCR nativo (ML Kit / Vision). */
export const mlkitOcr: OcrEngine = {
  async recognize(image: string): Promise<OcrResult> {
    const res = await CapacitorPluginMlKitTextRecognition.detectText({ base64Image: toBase64(image) });
    const lines: OcrLine[] = [];
    for (const block of res?.blocks || []) {
      for (const line of block?.lines || []) {
        const bb = line?.boundingBox;
        if (bb && line.text) {
          lines.push({ text: line.text, top: bb.top, bottom: bb.bottom, left: bb.left, right: bb.right });
        }
      }
    }
    return { text: res?.text || '', lines };
  },
};

/** Motore OCR per browser: Tesseract.js (caricato dinamicamente). */
export const tesseractOcr: OcrEngine = {
  async recognize(image: string): Promise<OcrResult> {
    const { default: Tesseract } = await import('tesseract.js');
    const { data } = await Tesseract.recognize(image, 'ita');
    const lines: OcrLine[] = [];
    for (const line of (data as { lines?: Array<{ text: string; bbox?: { x0: number; y0: number; x1: number; y1: number } }> })?.lines || []) {
      const b = line?.bbox;
      if (b && line.text) {
        lines.push({ text: line.text, top: b.y0, bottom: b.y1, left: b.x0, right: b.x1 });
      }
    }
    return { text: data?.text || '', lines };
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
