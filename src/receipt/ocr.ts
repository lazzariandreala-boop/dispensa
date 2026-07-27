// ============================================================================
// ocr.ts — Motore OCR dietro un'interfaccia semplice, così il motore si può
// sostituire in un solo punto. Implementazione on-device via ML Kit (Android) /
// Vision (iOS) attraverso il plugin Capacitor: offline, nessuna chiave API.
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

/** L'OCR on-device è disponibile solo nell'app nativa (non nel browser). */
export function isOcrAvailable(): boolean {
  return Capacitor.isNativePlatform();
}
