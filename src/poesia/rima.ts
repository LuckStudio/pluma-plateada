// Rima: terminación consonante y asonante de una palabra, y esquema de un poema.
import { analizarPalabra, indiceVocalTonica } from './silabas';

const SIN_TILDE: Record<string, string> = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u' };
const quitarTildes = (s: string) => s.replace(/[áéíóúü]/g, (c) => SIN_TILDE[c]);

// Normalización fonética suave para comparar terminaciones.
function fonetica(s: string) {
  return quitarTildes(s.toLowerCase())
    .replace(/h/g, '')
    .replace(/v/g, 'b')
    .replace(/qu(?=[ei])/g, 'k')
    .replace(/c(?=[ei])/g, 'z')
    .replace(/c/g, 'k')
    .replace(/g(?=[ei])/g, 'j')
    .replace(/gu(?=[ei])/g, 'g')
    .replace(/ll/g, 'y')
    .replace(/y$/, 'i');
}

export interface Terminacion {
  palabra: string;
  consonante: string; // desde la vocal tónica
  asonante: string; // solo vocales relevantes ("e-a")
}

export function terminacion(palabra: string): Terminacion | null {
  const limpia = palabra.replace(/[^a-záéíóúüñA-ZÁÉÍÓÚÜÑ]/g, '');
  if (!limpia) return null;
  const p = analizarPalabra(limpia);
  const idx = indiceVocalTonica(p);
  const cola = limpia.slice(idx).toLowerCase();
  const consonante = fonetica(cola);
  // Asonante: vocal tónica + última vocal, ignorando débiles de diptongos y la penúltima de esdrújulas.
  const tonicaV = quitarTildes(cola[0] === 'y' ? 'i' : cola[0]);
  const resto = p.silabas.slice(p.tonica + 1);
  let finalV = '';
  if (resto.length) {
    const ultima = quitarTildes(resto[resto.length - 1].toLowerCase()).replace(/y$/, 'i');
    const vocales = ultima.replace(/[^aeiou]/g, '').replace(/^(qu|gu)/, '');
    const fuertes = vocales.replace(/[iu]/g, '');
    finalV = fuertes ? fuertes[fuertes.length - 1] : vocales[vocales.length - 1] ?? '';
    if (finalV === 'i') finalV = 'e';
    if (finalV === 'u') finalV = 'o';
  }
  return { palabra: limpia, consonante, asonante: finalV ? `${tonicaV}-${finalV}` : tonicaV };
}

export function ultimaPalabra(verso: string) {
  const m = verso.match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+(?=[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]*$)/);
  return m ? m[0] : '';
}

export interface RimaVerso {
  letra: string; // "A", "b"… o "-" si no rima
  tipo: 'consonante' | 'asonante' | 'libre';
  terminacion: Terminacion | null;
}

// medidas: sílabas de cada verso (para mayúscula en arte mayor, minúscula en arte menor).
export function esquemaRima(versos: string[], medidas: number[]): RimaVerso[] {
  const t = versos.map((v) => terminacion(ultimaPalabra(v)));
  const letras: string[] = [];
  const grupos: { cons: string; ason: string; letra: string }[] = [];
  const out: RimaVerso[] = [];
  const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  // Primero averiguamos qué versos riman con algún otro.
  const rimaCon = (i: number, j: number): 'consonante' | 'asonante' | null => {
    const a = t[i];
    const b = t[j];
    if (!a || !b) return null;
    if (a.consonante === b.consonante && a.consonante.length > 0) return 'consonante';
    if (a.asonante === b.asonante) return 'asonante';
    return null;
  };
  versos.forEach((_, i) => {
    const ti = t[i];
    let tipo: RimaVerso['tipo'] = 'libre';
    for (let j = 0; j < versos.length; j++) {
      if (j === i) continue;
      const r = rimaCon(i, j);
      if (r === 'consonante') {
        tipo = 'consonante';
        break;
      }
      if (r === 'asonante') tipo = 'asonante';
    }
    if (!ti || tipo === 'libre') {
      out.push({ letra: '-', tipo: 'libre', terminacion: ti });
      return;
    }
    let g = grupos.find((x) => (tipo === 'consonante' ? x.cons === ti.consonante : x.ason === ti.asonante));
    if (!g) {
      g = { cons: ti.consonante, ason: ti.asonante, letra: ABC[grupos.length % 26] };
      grupos.push(g);
    }
    letras.push(g.letra);
    const mayor = (medidas[i] ?? 0) > 8;
    out.push({ letra: mayor ? g.letra : g.letra.toLowerCase(), tipo, terminacion: ti });
  });
  return out;
}

// ¿Riman dos palabras? Útil para el buscador de rimas.
export function riman(a: string, b: string, modo: 'consonante' | 'asonante') {
  const ta = terminacion(a);
  const tb = terminacion(b);
  if (!ta || !tb || ta.palabra.toLowerCase() === tb.palabra.toLowerCase()) return false;
  return modo === 'consonante' ? ta.consonante === tb.consonante : ta.asonante === tb.asonante;
}
