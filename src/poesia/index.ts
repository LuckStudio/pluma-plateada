// Análisis completo de un poema: versos, estrofas, rima, formas y estadísticas.
import { medirVerso, type Verso } from './metrica';
import { esquemaRima, type RimaVerso } from './rima';

export { medirVerso, NOMBRES } from './metrica';
export { terminacion, riman, ultimaPalabra } from './rima';
export { silabear, analizarPalabra } from './silabas';
export type { Verso } from './metrica';
export type { RimaVerso } from './rima';

export interface LineaAnalizada {
  linea: number; // índice en el texto
  verso: Verso;
  rima: RimaVerso;
}

export interface Estrofa {
  lineas: LineaAnalizada[];
  esquema: string; // "ABBA"
  nombre?: string; // "cuarteto", "redondilla"…
}

export interface Analisis {
  lineas: (LineaAnalizada | null)[]; // null = línea en blanco
  estrofas: Estrofa[];
  esquema: string; // "ABBA ABBA CDE CDE"
  tipoRima: 'consonante' | 'asonante' | 'mixta' | 'libre';
  medidaDominante: number | null;
  isosilabico: boolean;
  forma: string; // "Soneto", "Romance", "Verso libre"…
  formaDetalle?: string;
  stats: {
    versos: number;
    estrofas: number;
    palabras: number;
    caracteres: number;
    lecturaSeg: number;
    repetidas: { palabra: string; veces: number }[];
  };
}

const VACIAS = new Set(
  'el la los las un una unos unas al del a ante bajo con contra de desde en entre hacia hasta para por sin sobre tras y e ni o u que pero mas aunque pues si no me te se nos os le les lo mi mis tu tus su sus es son fue ser era ya como cuando donde muy más todo todos toda todas este esta esto ese esa eso aquel aquella aquello'.split(
    ' ',
  ),
);

function nombreEstrofa(esq: string, medidas: number[]): string | undefined {
  const n = medidas.length;
  const mayor = medidas.every((m) => m > 8);
  const menor = medidas.every((m) => m > 0 && m <= 8);
  const todas = (m: number) => medidas.every((x) => x === m);
  const e = esq.toLowerCase();
  if (n === 2 && e[0] === e[1] && e[0] !== '-') return 'pareado';
  if (n === 3) {
    if (todas(5) || (medidas[0] === 5 && medidas[1] === 7 && medidas[2] === 5)) return 'haiku';
    if (e === 'a-a' || e === 'aba') return mayor ? 'terceto' : menor ? 'tercerillo' : 'terceto';
  }
  if (n === 4) {
    if (e === 'abba') return mayor ? 'cuarteto' : menor ? 'redondilla' : undefined;
    if (e === 'abab') return mayor ? 'serventesio' : menor ? 'cuarteta' : undefined;
    if (e === '-a-a') return menor ? 'copla' : 'cuarteta asonantada';
    if (e === 'aaaa' && todas(14)) return 'cuaderna vía';
  }
  if (n === 5) {
    if (medidas.join() === '7,11,7,7,11' && e === 'ababb') return 'lira';
    const rimas = new Set(e.replace(/-/g, ''));
    if (menor && rimas.size === 2 && !e.includes('-')) return 'quintilla';
    if (mayor && rimas.size === 2 && !e.includes('-')) return 'quinteto';
  }
  if (n === 6 && menor && e === 'aabccb') return 'sextilla';
  if (n === 8 && todas(11) && e === 'abababcc') return 'octava real';
  if (n === 10 && menor && e === 'abbaaccddc') return 'décima espinela';
  return undefined;
}

export function analizarPoema(texto: string): Analisis {
  const lineasTxt = texto.replace(/\r/g, '').split('\n');
  const versosIdx: number[] = [];
  const versos: Verso[] = [];
  lineasTxt.forEach((l, i) => {
    if (l.trim()) {
      versosIdx.push(i);
      versos.push(medirVerso(l));
    }
  });
  const rimas = esquemaRima(
    versos.map((v) => v.texto),
    versos.map((v) => v.medida),
  );
  const lineas: (LineaAnalizada | null)[] = lineasTxt.map(() => null);
  versos.forEach((v, k) => {
    lineas[versosIdx[k]] = { linea: versosIdx[k], verso: v, rima: rimas[k] };
  });

  const estrofas: Estrofa[] = [];
  let actual: LineaAnalizada[] = [];
  lineas.forEach((l) => {
    if (l) actual.push(l);
    else if (actual.length) {
      estrofas.push({ lineas: actual, esquema: '' });
      actual = [];
    }
  });
  if (actual.length) estrofas.push({ lineas: actual, esquema: '' });

  // Esquema de cada estrofa relativo a sí misma (para nombrarla) y global (para mostrarlo).
  estrofas.forEach((e) => {
    e.esquema = e.lineas.map((l) => l.rima.letra).join('');
    const local = esquemaRima(
      e.lineas.map((l) => l.verso.texto),
      e.lineas.map((l) => l.verso.medida),
    )
      .map((r) => r.letra)
      .join('');
    e.nombre = nombreEstrofa(local, e.lineas.map((l) => l.verso.medida));
  });

  const medidas = versos.map((v) => v.medida);
  const cuenta = new Map<number, number>();
  medidas.forEach((m) => cuenta.set(m, (cuenta.get(m) ?? 0) + 1));
  let medidaDominante: number | null = null;
  let max = 0;
  cuenta.forEach((c, m) => {
    if (c > max) {
      max = c;
      medidaDominante = m;
    }
  });
  const isosilabico = versos.length > 1 && cuenta.size === 1;
  const tipos = new Set(rimas.filter((r) => r.tipo !== 'libre').map((r) => r.tipo));
  const libres = rimas.filter((r) => r.tipo === 'libre').length;
  const tipoRima: Analisis['tipoRima'] =
    tipos.size === 0 ? 'libre' : tipos.size === 2 ? 'mixta' : tipos.has('consonante') ? 'consonante' : 'asonante';

  // Forma global.
  const n = versos.length;
  const esquema = estrofas.map((e) => e.esquema).join(' ');
  const plano = rimas.map((r) => r.letra.toUpperCase()).join('');
  let forma = 'Verso libre';
  let formaDetalle: string | undefined;
  const casi = (m: number) => medidas.filter((x) => x === m).length >= n * 0.8;
  if (n === 14 && casi(11) && /^ABBAABBA/.test(plano)) {
    forma = 'Soneto';
  } else if (n > 0 && n < 14 && casi(11) && /^ABBA(ABBA)?/.test(plano) && estrofas.every((e) => e.lineas.length === 4 || e.lineas.length === 3)) {
    forma = 'Soneto (en curso)';
    formaDetalle = `${n} de 14 versos`;
  } else if (n >= 6 && casi(8) && rimas.every((r, i) => (i % 2 === 1 ? r.tipo !== 'libre' : true))) {
    const pares = rimas.filter((_, i) => i % 2 === 1);
    if (pares.every((r) => r.letra.toLowerCase() === pares[0].letra.toLowerCase())) forma = 'Romance';
  } else if (n === 3 && medidas.join() === '5,7,5') {
    forma = 'Haiku';
  } else if (estrofas.length && estrofas.every((e) => e.nombre && e.nombre === estrofas[0].nombre)) {
    forma = estrofas.length > 1 ? `Poema en ${estrofas[0].nombre}s` : estrofas[0].nombre!;
    forma = forma[0].toUpperCase() + forma.slice(1);
  } else if (libres === n) {
    forma = 'Verso libre';
    formaDetalle = isosilabico ? 'medida regular, sin rima' : 'sin rima ni medida fija';
  } else {
    forma = 'Verso libre con rimas';
  }
  if (!formaDetalle && forma !== 'Verso libre' && !isosilabico && medidaDominante) formaDetalle = 'polimétrico';

  // Estadísticas.
  const palabras = (texto.match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+/g) ?? []).map((w) => w.toLowerCase());
  const freq = new Map<string, number>();
  palabras.forEach((w) => {
    if (w.length > 2 && !VACIAS.has(w)) freq.set(w, (freq.get(w) ?? 0) + 1);
  });
  const repetidas = [...freq.entries()]
    .filter(([, c]) => c > 1)
    .sort((a, b) => b[1] - a[1])
    .map(([palabra, veces]) => ({ palabra, veces }));

  return {
    lineas,
    estrofas,
    esquema,
    tipoRima,
    medidaDominante,
    isosilabico,
    forma,
    formaDetalle,
    stats: {
      versos: n,
      estrofas: estrofas.length,
      palabras: palabras.length,
      caracteres: texto.replace(/\s/g, '').length,
      lecturaSeg: Math.max(5, Math.round((palabras.length / 130) * 60)),
      repetidas,
    },
  };
}
