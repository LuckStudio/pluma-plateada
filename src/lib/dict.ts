// Diccionario (tesauro de LibreOffice, LGPL): sinónimos y vocabulario para buscar rimas.
// Se descarga solo la primera vez que se necesita.
import { terminacion, analizarPalabra } from '../poesia';

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

// Índice de terminaciones del vocabulario: se calcula una vez y las búsquedas son inmediatas.
let indice: { w: string; cons: string; ason: string }[] | null = null;
async function indiceRimas() {
  if (indice) return indice;
  const t = await cargarDiccionario();
  indice = t.v.flatMap((w) => {
    const r = terminacion(w);
    return r ? [{ w, cons: r.consonante, ason: r.asonante }] : [];
  });
  return indice;
}

// Busca rimas en el vocabulario del diccionario y en las palabras del propio usuario.
export async function buscarRimas(palabra: string, modo: 'consonante' | 'asonante', extra: string[] = [], max = 80) {
  const base = terminacion(palabra);
  if (!base) return [];
  const clave = modo === 'consonante' ? base.consonante : base.asonante;
  const propia = palabra.toLowerCase();
  const vistas = new Set<string>([propia]);
  const out: string[] = [];
  const delUsuario = extra.flatMap((w) => {
    const r = terminacion(w);
    return r ? [{ w: w.toLowerCase(), cons: r.consonante, ason: r.asonante }] : [];
  });
  for (const e of [...delUsuario, ...(await indiceRimas())]) {
    if (out.length >= max) break;
    if (e.w.length < 2 || vistas.has(e.w)) continue;
    vistas.add(e.w);
    if ((modo === 'consonante' ? e.cons : e.ason) === clave) out.push(e.w);
  }
  // Primero las palabras más cortas (más fáciles de encajar en el verso).
  return out.sort((a, b) => silabasDe(a) - silabasDe(b) || a.localeCompare(b, 'es'));
}
