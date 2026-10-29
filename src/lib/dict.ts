// Diccionario (tesauro de LibreOffice, LGPL): sinónimos y vocabulario para buscar rimas.
// Se descarga solo la primera vez que se necesita.
import { riman, analizarPalabra } from '../poesia';

interface Tesauro {
  s: Record<string, string[][]>;
  v: string[];
}

let cargando: Promise<Tesauro> | null = null;

export function cargarDiccionario() {
  cargando ??= fetch(new URL('data/tesauro.json', document.baseURI).href).then((r) => {
    if (!r.ok) throw new Error('No se pudo cargar el diccionario');
    return r.json();
  });
  cargando.catch(() => (cargando = null));
  return cargando;
}

const SIN_TILDE: Record<string, string> = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u' };

export async function sinonimos(palabra: string): Promise<string[][]> {
  const vistos = new Set<string>();
  // Cada palabra aparece una sola vez, en el primer sentido en que sale.
  return (await gruposSinonimos(palabra))
    .map((g) => g.filter((w) => !vistos.has(w) && vistos.add(w)))
    .filter((g) => g.length);
}

async function gruposSinonimos(palabra: string): Promise<string[][]> {
  const t = await cargarDiccionario();
  const w = palabra.toLowerCase();
  if (t.s[w]) return t.s[w];
  // Formas simples: plural y femenino, para dar algo útil aunque no sea la entrada exacta.
  const candidatos = [w.replace(/es$/, ''), w.replace(/s$/, ''), w.replace(/a$/, 'o'), w.replace(/as$/, 'o'), w.replace(/[áéíóú]/g, (c) => SIN_TILDE[c])];
  for (const c of candidatos) if (t.s[c]) return t.s[c];
  return [];
}

export function silabasDe(palabra: string) {
  return analizarPalabra(palabra).silabas.length;
}

// Busca rimas en el vocabulario del diccionario y en las palabras del propio usuario.
export async function buscarRimas(palabra: string, modo: 'consonante' | 'asonante', extra: string[] = [], max = 80) {
  const t = await cargarDiccionario();
  const vistas = new Set<string>();
  const out: string[] = [];
  const pool = [...new Set([...extra.map((w) => w.toLowerCase()), ...t.v])];
  for (const w of pool) {
    if (out.length >= max) break;
    if (w.length < 2 || vistas.has(w)) continue;
    vistas.add(w);
    if (riman(palabra, w, modo)) out.push(w);
  }
  // Primero las palabras más cortas (más fáciles de encajar en el verso).
  return out.sort((a, b) => silabasDe(a) - silabasDe(b) || a.localeCompare(b, 'es'));
}
