// Convierte el tesauro de LibreOffice (th_es_ES_v2.dat, ISO-8859-1, LGPL-2.1, Marcelo Garrone)
// en public/data/tesauro.json: { s: { palabra: [[sinónimos], ...] }, v: [vocabulario para rimas] }.
// Uso: node scripts/build-tesauro.mjs ruta/a/th_es_ES_v2.dat
import { readFileSync, writeFileSync } from 'node:fs';

const src = process.argv[2];
if (!src) throw new Error('Falta la ruta a th_es_ES_v2.dat');
const lines = new TextDecoder('latin1').decode(readFileSync(src)).split('\n');
const clean = (w) => w.replace(/\s*\([^)]*\)/g, '').trim();
const syn = {};
const vocab = new Set();
const single = /^[a-záéíóúüñ]+$/;
for (let i = 1; i < lines.length; ) {
  const [head, n] = lines[i].split('|');
  const count = Number(n) || 0;
  const word = clean(head).toLowerCase();
  const groups = [];
  for (let k = 1; k <= count; k++) {
    const g = (lines[i + k] || '').split('|').slice(1).map(clean).filter((w) => w && w.toLowerCase() !== word);
    if (g.length) groups.push([...new Set(g)]);
    g.forEach((w) => single.test(w.toLowerCase()) && vocab.add(w.toLowerCase()));
  }
  if (word && groups.length) syn[word] = groups;
  if (single.test(word)) vocab.add(word);
  i += count + 1;
}
writeFileSync('public/data/tesauro.json', JSON.stringify({ s: syn, v: [...vocab].sort() }));
console.log(`${Object.keys(syn).length} entradas, ${vocab.size} palabras de vocabulario`);
