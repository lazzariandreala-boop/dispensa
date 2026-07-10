'use strict';
// Port compatto della logica di categoria dell'app (index.html).
// Mantieni allineato con CAT_RULES / CAT_QTY_DEFAULTS dell'app.

const CAT_RULES = [
  { c: 'uova',          w: ['uova', 'uovo'] },
  { c: 'carne',         w: ['pollo', 'manzo', 'vitello', 'maiale', 'agnello', 'tacchino', 'bistecca', 'hamburger', 'macinata', 'macinato', 'cotoletta', 'braciola', 'salsiccia', 'wurstel', 'spiedino', 'arrosto', 'coniglio', 'anatra', 'cinghiale'] },
  { c: 'pesce',         w: ['salmone', 'tonno', 'merluzzo', 'branzino', 'orata', 'gamberi', 'cozze', 'vongole', 'calamari', 'trota', 'baccalà', 'acciughe', 'sardine', 'polpo', 'sgombro', 'pesce'] },
  { c: 'verdure',       w: ['pomodoro', 'pomodori', 'cipolla', 'cipolle', 'carota', 'carote', 'zucchina', 'zucchine', 'melanzana', 'melanzane', 'peperone', 'peperoni', 'spinaci', 'insalata', 'cavolo', 'broccoli', 'funghi', 'piselli', 'fagiolini', 'carciofo', 'asparagi', 'lattuga', 'rucola', 'radicchio', 'cetriolo', 'finocchio', 'porro', 'zucca', 'cavolfiore', 'sedano', 'patata', 'patate'] },
  { c: 'frutta',        w: ['mela', 'mele', 'pera', 'pere', 'banana', 'banane', 'arancia', 'arance', 'limone', 'limoni', 'fragola', 'fragole', 'uva', 'kiwi', 'ananas', 'pesca', 'albicocca', 'ciliegia', 'mango', 'avocado', 'melograno', 'pompelmo', 'mandarino', 'anguria', 'melone'] },
  { c: 'latticini',     w: ['latte', 'yogurt', 'formaggio', 'mozzarella', 'parmigiano', 'ricotta', 'burro', 'panna', 'mascarpone', 'gorgonzola', 'pecorino', 'grana', 'brie', 'fontina', 'scamorza', 'provolone', 'stracchino'] },
  { c: 'pasta_cereali', w: ['pasta', 'spaghetti', 'rigatoni', 'penne', 'fusilli', 'riso', 'orzo', 'farro', 'couscous', 'quinoa', 'cracker', 'cereali', 'cornflakes', 'avena', 'gallette', 'lasagne', 'tagliatelle', 'linguine', 'orecchiette', 'farfalle', 'polenta', 'semola'] },
  { c: 'pane',          w: ['pane', 'baguette', 'panino', 'piadina', 'focaccia', 'ciabatta', 'tramezzino', 'toast', 'brioche', 'cornetto', 'croissant'] },
  { c: 'salumi',        w: ['prosciutto', 'salame', 'mortadella', 'bresaola', 'pancetta', 'guanciale', 'speck', 'coppa', 'lardo', 'nduja', 'salumi'] },
  { c: 'condimenti',    w: ['olio', 'aceto', 'sale', 'pepe', 'salsa', 'ketchup', 'maionese', 'senape', 'soia', 'pesto', 'curry', 'paprika', 'zafferano', 'cannella', 'curcuma', 'cumino', 'timo', 'rosmarino', 'salvia', 'basilico', 'origano', 'spezie', 'dado'] },
  { c: 'bevande',       w: ['acqua', 'succo', 'birra', 'vino', 'coca', 'tè', 'caffè', 'aranciata', 'limonata', 'brodo', 'smoothie'] },
  { c: 'dolci',         w: ['cioccolato', 'biscotti', 'torta', 'gelato', 'nutella', 'marmellata', 'miele', 'zucchero', 'caramella', 'wafer', 'cacao', 'vaniglia', 'lievito', 'savoiardi', 'confettura'] },
  { c: 'legumi',        w: ['fagioli', 'lenticchie', 'ceci', 'fave', 'lupini', 'cannellini', 'borlotti', 'edamame', 'legumi'] },
  { c: 'surgelati',     w: ['surgelat', 'congelat'] },
  { c: 'farine',        w: ['farina', 'manitoba', 'maizena', 'amido', 'frumento'] },
  { c: 'scatola',       w: ['pelati', 'lattina', 'conserva', 'olive', 'capperi', 'mais'] },
];

const CAT_QTY_DEFAULTS = {
  uova: { qty: 6, unit: 'pz' }, carne: { qty: 500, unit: 'g' }, pesce: { qty: 300, unit: 'g' },
  verdure: { qty: 500, unit: 'g' }, frutta: { qty: 1, unit: 'kg' }, latticini: { qty: 1, unit: 'pz' },
  pasta_cereali: { qty: 500, unit: 'g' }, pane: { qty: 1, unit: 'pz' }, salumi: { qty: 150, unit: 'g' },
  condimenti: { qty: 1, unit: 'pz' }, surgelati: { qty: 1, unit: 'pz' }, bevande: { qty: 1, unit: 'l' },
  dolci: { qty: 1, unit: 'pz' }, legumi: { qty: 400, unit: 'g' },
  farine: { qty: 1, unit: 'kg' }, scatola: { qty: 1, unit: 'pz' }, generico: { qty: 1, unit: 'pz' },
};

function detectCat(name) {
  const n = String(name || '').toLowerCase();
  for (const rule of CAT_RULES) {
    if (rule.w.some((w) => n.includes(w))) return rule.c;
  }
  return 'generico';
}

function qtyDefault(cat) {
  return CAT_QTY_DEFAULTS[cat] || CAT_QTY_DEFAULTS.generico;
}

module.exports = { detectCat, qtyDefault };
