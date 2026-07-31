import test from 'node:test';
import assert from 'node:assert';
import { parseReceipt } from '../src/receipt/parser.ts';

test('scontrino base: estrae prodotti e totale, scarta riepilogo/pagamento', () => {
  const raw = [
    'CONAD',
    'VIA ROMA 12',
    'P.IVA 01234567890',
    '',
    'LATTE INTERO        1,29 A',
    'PANE                0,95 A',
    'PASTA BARILLA       1,10 B',
    'PARMIGIANO          4,50',
    'TOTALE EURO         7,84',
    'CONTANTE           10,00',
    'RESTO               2,16',
    'GRAZIE ARRIVEDERCI',
  ].join('\n');
  const { products, total } = parseReceipt(raw);
  const names = products.map((p) => p.name.toUpperCase());
  assert.deepEqual(names, ['LATTE INTERO', 'PANE', 'PASTA BARILLA', 'PARMIGIANO']);
  assert.equal(products[0].price, 1.29);
  assert.equal(products[3].price, 4.5);
  assert.equal(total, 7.84);
  // niente CONTANTE/RESTO/intestazione tra i prodotti
  assert.ok(!names.some((n) => /CONTANTE|RESTO|CONAD|IVA/.test(n)));
});

test('quantità "2 X 1,20" aggiorna il prodotto precedente', () => {
  const raw = [
    'ESSELUNGA',
    'ACQUA NATURALE      2,40',
    '2 X 1,20',
    'BANANE              1,50',
    'TOTALE COMPLESSIVO  3,90',
  ].join('\n');
  const { products, total } = parseReceipt(raw);
  const acqua = products.find((p) => /ACQUA/i.test(p.name));
  assert.ok(acqua, 'acqua presente');
  assert.equal(acqua!.qty, 2);
  assert.equal(acqua!.price, 2.4);
  assert.ok(products.find((p) => /BANANE/i.test(p.name)));
  assert.equal(total, 3.9);
});

test('OCR sporco: salta righe illeggibili senza crashare', () => {
  const raw = [
    'Scontrino n. 0042',
    '$$$   %%%   ###',
    'MELE GOLDEN         2,30 A',
    '   ',
    'TOTALE              2,30',
  ].join('\n');
  const { products, total } = parseReceipt(raw);
  assert.equal(products.length, 1);
  assert.match(products[0].name, /MELE GOLDEN/i);
  assert.equal(products[0].price, 2.3);
  assert.equal(total, 2.3);
});

test('preferisce TOTALE COMPLESSIVO e ignora SUBTOTALE; prezzi con migliaia', () => {
  const raw = [
    'TELEVISORE          1.299,00 A',
    'SUBTOTALE           1.299,00',
    'TOTALE COMPLESSIVO  1.299,00',
  ].join('\n');
  const { products, total } = parseReceipt(raw);
  assert.equal(products.length, 1);
  assert.equal(products[0].price, 1299);
  assert.equal(total, 1299);
});

test('OCR con punto decimale invece della virgola (Conad)', () => {
  const raw = [
    'CONAD',
    'LATTE INTERO        1.29 A',
    'PANE                0.95 A',
    'PASTA BARILLA       1.10 B',
    'TOTALE EURO         3.34',
  ].join('\n');
  const { products, total } = parseReceipt(raw);
  assert.equal(products.length, 3);
  assert.equal(products[0].price, 1.29);
  assert.equal(products[1].price, 0.95);
  assert.equal(products[2].price, 1.1);
  assert.equal(total, 3.34);
});

test('OCR a colonne: nome e prezzo su righe separate', () => {
  const raw = [
    'CONAD',
    'LATTE INTERO',
    '1,29 A',
    'PANE',
    '0,95 A',
    'PARMIGIANO',
    '4,50',
    'TOTALE              6,74',
  ].join('\n');
  const { products, total } = parseReceipt(raw);
  assert.equal(products.length, 3);
  assert.match(products[0].name, /LATTE INTERO/i);
  assert.equal(products[0].price, 1.29);
  assert.match(products[2].name, /PARMIGIANO/i);
  assert.equal(products[2].price, 4.5);
  assert.equal(total, 6.74);
});

test('unità nella riga viene rilevata', () => {
  const { products } = parseReceipt('PROSCIUTTO 0,200 kg     3,80 A');
  assert.equal(products.length, 1);
  assert.equal(products[0].unit, 'kg');
  assert.equal(products[0].price, 3.8);
});

test('input vuoto o nullo non crasha', () => {
  assert.deepEqual(parseReceipt(''), { products: [], total: null });
  // @ts-expect-error test robustezza con input non valido
  assert.deepEqual(parseReceipt(null), { products: [], total: null });
});
