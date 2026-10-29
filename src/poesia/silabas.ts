// Silabeo fonológico de palabras en castellano y posición del acento.

export interface Palabra {
  original: string;
  silabas: string[];
  tonica: number; // índice de la sílaba tónica
  atona: boolean; // palabra átona en la frase (artículos, preposiciones…)
  empiezaVocal: boolean; // a efectos de sinalefa
  acabaVocal: boolean;
}

const FUERTES = 'aeoáéíóú';
const DEBILES = 'iuü';
const CON_TILDE = 'áéíóú';
const VOCALES = FUERTES + DEBILES;

// Grupos de consonantes que no se separan (van juntos al inicio de sílaba).
const INSEPARABLES = new Set(['bl', 'br', 'cl', 'cr', 'dr', 'fl', 'fr', 'gl', 'gr', 'kl', 'kr', 'pl', 'pr', 'tr', 'ch', 'll', 'rr']);

// Palabras átonas: no llevan acento en el verso.
const ATONAS = new Set(
  (
    'el la lo los las un unos al del a ante bajo cabe con contra de desde en entre hacia hasta para por sin so sobre tras ' +
    'y e ni o u que pero mas aunque pues si como cuando donde cuanto mientras porque ' +
    'me te se nos os le les mi mis tu tus su sus'
  ).split(' '),
);

const esVocal = (c: string) => VOCALES.includes(c);

// ¿Dos vocales contiguas forman hiato (sílabas distintas)?
function hiato(a: string, b: string) {
  if (FUERTES.includes(a) && FUERTES.includes(b)) {
    // í/ú tildadas cuentan como fuertes y fuerzan hiato; dos fuertes siempre hiato.
    return true;
  }
  if ('íú'.includes(a) || 'íú'.includes(b)) return true;
  if (a === b) return true; // "chiita", "duunviro"
  return false;
}

// Convierte la palabra en unidades: cada letra, con dígrafos ch/ll/rr y la u muda de qu/gu.
function unidades(w: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < w.length; i++) {
    const c = w[i];
    const d = w.slice(i, i + 2);
    if (d === 'ch' || d === 'll' || d === 'rr') {
      out.push(d);
      i++;
    } else if ((c === 'q' || c === 'g') && w[i + 1] === 'u' && 'eéií'.includes(w[i + 2] ?? '')) {
      out.push(c + 'u'); // la u no suena: forma parte de la consonante
      i++;
    } else {
      out.push(c);
    }
  }
  return out;
}

// La y final o entre consonantes funciona como vocal i.
function esUnidadVocal(u: string[], i: number) {
  const c = u[i];
  if (esVocal(c)) return true;
  if (c === 'y') {
    const sig = u[i + 1];
    return sig === undefined || !esVocal(sig);
  }
  return false;
}

const valorVocal = (c: string) => (c === 'y' ? 'i' : c);

export function silabear(palabra: string): string[] {
  const w = palabra.toLowerCase();
  const u = unidades(w);
  // Núcleos: tramos de vocales (la h entre vocales no rompe el tramo).
  type Nucleo = { ini: number; fin: number };
  const nucleos: Nucleo[] = [];
  let i = 0;
  while (i < u.length) {
    if (esUnidadVocal(u, i)) {
      let ini = i;
      let fin = i;
      while (true) {
        let j = fin + 1;
        if (u[j] === 'h' && j + 1 < u.length && esUnidadVocal(u, j + 1)) j++;
        if (j < u.length && esUnidadVocal(u, j) && !hiato(valorVocal(u[fin]), valorVocal(u[j]))) fin = j;
        else break;
      }
      // Triptongos y diptongos ya agrupados; los hiatos abren núcleo nuevo.
      nucleos.push({ ini, fin });
      i = fin + 1;
    } else i++;
  }
  if (nucleos.length <= 1) return [palabra];

  // Reparte las consonantes entre núcleos.
  const cortes: number[] = [];
  for (let k = 0; k < nucleos.length - 1; k++) {
    const a = nucleos[k].fin + 1;
    const b = nucleos[k + 1].ini; // consonantes en [a, b)
    const n = b - a;
    let corte: number;
    if (n === 0) corte = a;
    else if (n === 1) corte = a;
    else if (n === 2) corte = INSEPARABLES.has(u[a] + u[a + 1]) ? a : a + 1;
    else if (n === 3) corte = INSEPARABLES.has(u[a + 1] + u[a + 2]) ? a + 1 : a + 2;
    else corte = INSEPARABLES.has(u[b - 2] + u[b - 1]) ? b - 2 : b - 1;
    cortes.push(corte);
  }
  const silabas: string[] = [];
  let desde = 0;
  // Las unidades pueden ocupar 2 letras: traducimos índices de unidad a índices de texto.
  const pos: number[] = [];
  let acc = 0;
  for (const x of u) {
    pos.push(acc);
    acc += x.length;
  }
  pos.push(acc);
  for (const c of cortes) {
    silabas.push(palabra.slice(pos[desde], pos[c]));
    desde = c;
  }
  silabas.push(palabra.slice(pos[desde]));
  return silabas;
}

export function tonica(palabra: string, silabas: string[]): number {
  const w = palabra.toLowerCase();
  for (let i = 0; i < silabas.length; i++) {
    if ([...silabas[i].toLowerCase()].some((c) => CON_TILDE.includes(c))) return i;
  }
  if (silabas.length === 1) return 0;
  const ult = w[w.length - 1];
  // Llana si acaba en vocal, n o s; aguda en el resto (incluida la y: "estoy", "virrey").
  if ('aeiouns'.includes(ult)) return silabas.length - 2;
  return silabas.length - 1;
}

export function analizarPalabra(original: string): Palabra {
  const limpia = original.replace(/[^a-záéíóúüñA-ZÁÉÍÓÚÜÑ]/g, '');
  const silabas = silabear(limpia);
  const low = limpia.toLowerCase();
  // hie-/hue-/hia-… iniciales suenan consonánticas ("hierba", "huevo"): no hacen sinalefa.
  const consonantica = /^(hi|hu|y)[aeiouáéíóú]/.test(low) || (low !== 'y' && /^[^aeiouáéíóúhü]/.test(low));
  const vocalInicial = !consonantica && (/^h?[aeiouáéíóúü]/.test(low) || low === 'y');
  // La y final ("muy", "rey") se vuelve consonante ante vocal: no hace sinalefa.
  const vocalFinal = /[aeiouáéíóúü]$/.test(low) || low === 'y';
  return {
    original,
    silabas,
    tonica: tonica(limpia, silabas),
    atona: ATONAS.has(low),
    empiezaVocal: vocalInicial,
    acabaVocal: vocalFinal,
  };
}

// Vocal tónica (la fuerte del núcleo) dentro de la sílaba tónica: índice dentro de la palabra.
export function indiceVocalTonica(p: Palabra): number {
  let offset = 0;
  for (let i = 0; i < p.tonica; i++) offset += p.silabas[i].length;
  const s = p.silabas[p.tonica].toLowerCase();
  const tilde = [...s].findIndex((c) => CON_TILDE.includes(c));
  if (tilde >= 0) return offset + tilde;
  // En un diptongo manda la vocal fuerte; entre dos débiles ("ui", "iu"), la segunda.
  let ultDebil = -1;
  for (let k = 0; k < s.length; k++) {
    const c = s[k];
    if ('aeo'.includes(c)) return offset + k;
    if ('iuy'.includes(c) && !(c === 'u' && 'qg'.includes(s[k - 1] ?? ''))) {
      if (c === 'y' && k < s.length - 1) continue;
      ultDebil = k;
    }
  }
  return offset + Math.max(0, ultDebil);
}
