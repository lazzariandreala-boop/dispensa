// ============================================================================
// layout.ts — Ricostruisce le RIGHE dello scontrino dalle bounding box dell'OCR.
// L'OCR (ML Kit) spesso legge lo scontrino a "colonne": la descrizione e il
// prezzo finiscono su elementi separati e in ordine sparso. Raggruppando gli
// elementi per posizione verticale (Y) e ordinandoli per posizione orizzontale
// (X) ricostruiamo la riga reale "DESCRIZIONE ......... PREZZO", così il parser
// può abbinare nome e prezzo. Puro, nessun DOM.
// ============================================================================

export interface OcrLine {
  text: string;
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** Raggruppa gli elementi OCR in righe (per Y) e le riordina per X. */
export function reconstructRows(lines: OcrLine[]): string {
  const items = lines
    .map((l) => ({ ...l, midY: (l.top + l.bottom) / 2, h: Math.max(1, l.bottom - l.top) }))
    .filter((l) => l.text && l.text.trim().length > 0)
    .sort((a, b) => a.midY - b.midY);
  if (!items.length) return '';

  const rows: (typeof items)[] = [];
  let cur: typeof items = [];
  let curY = 0;
  let curH = 0;
  for (const it of items) {
    // Nuova riga se il centro verticale dista più di ~60% dell'altezza media.
    if (cur.length && Math.abs(it.midY - curY) > curH * 0.6) {
      rows.push(cur);
      cur = [];
    }
    if (!cur.length) { curY = it.midY; curH = it.h; }
    else {
      curY = (curY * cur.length + it.midY) / (cur.length + 1);
      curH = Math.max(curH, it.h);
    }
    cur.push(it);
  }
  if (cur.length) rows.push(cur);

  return rows
    .map((r) =>
      r
        .sort((a, b) => a.left - b.left)
        .map((x) => x.text.trim())
        .filter(Boolean)
        .join('  '),
    )
    .join('\n');
}
