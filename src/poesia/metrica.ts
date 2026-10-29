// Medida de versos: sílabas métricas con sinalefa y ley del acento final.
import { analizarPalabra, type Palabra } from './silabas';

export interface SilabaMetrica {
  texto: string; // puede unir varias sílabas por sinalefa ("te‿ho")
  tonica: boolean;
}

export interface Verso {
  texto: string;
  palabras: Palabra[];
  silabasMetricas: SilabaMetrica[];
  fonologicas: number;
  sinalefas: number;
  final: 'aguda' | 'llana' | 'esdrújula' | 'sobresdrújula';
  medida: number; // sílabas métricas
  acentos: number[]; // posiciones (1…medida) de los acentos
  tipo: string; // "endecasílabo", "octosílabo"…
  subtipo?: string; // "heroico", "sáfico"…
  vacio: boolean;
}

export const NOMBRES: Record<number, string> = {
  2: 'bisílabo',
  3: 'trisílabo',
  4: 'tetrasílabo',
  5: 'pentasílabo',
  6: 'hexasílabo',
  7: 'heptasílabo',
  8: 'octosílabo',
  9: 'eneasílabo',
  10: 'decasílabo',
  11: 'endecasílabo',
  12: 'dodecasílabo',
  13: 'tridecasílabo',
  14: 'alejandrino',
  15: 'pentadecasílabo',
  16: 'hexadecasílabo',
};

const PALABRA = /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+/g;
// Pausas fuertes que impiden la sinalefa.
const PAUSA_FUERTE = /[.!?¡¿…]/;

function subtipoEndecasilabo(acentos: number[]) {
  const a = new Set(acentos);
  if (a.has(6) && a.has(2)) return 'heroico';
  if (a.has(6) && a.has(3)) return 'melódico';
  if (a.has(6) && a.has(1)) return 'enfático';
  if (a.has(4) && a.has(8)) return 'sáfico';
  if (a.has(4) && a.has(6)) return 'sáfico';
  if (a.has(4) && a.has(7)) return 'de gaita gallega';
  if (a.has(6)) return 'heroico (6ª)';
  return undefined;
}

export function medirVerso(texto: string): Verso {
  const matches = [...texto.matchAll(PALABRA)];
  const palabras = matches.map((m) => analizarPalabra(m[0]));
  if (!palabras.length) {
    return { texto, palabras, silabasMetricas: [], fonologicas: 0, sinalefas: 0, final: 'llana', medida: 0, acentos: [], tipo: '', vacio: true };
  }

  // Secuencia de sílabas con la palabra a la que pertenecen.
  type S = { texto: string; tonica: boolean; palabra: number };
  const seq: S[][] = []; // cada elemento es un grupo de sílabas fusionadas
  let sinalefas = 0;
  let fonologicas = 0;
  palabras.forEach((p, wi) => {
    fonologicas += p.silabas.length;
    p.silabas.forEach((s, si) => {
      const tonica = si === p.tonica && (!p.atona || wi === palabras.length - 1);
      const silaba: S = { texto: s, tonica, palabra: wi };
      if (si === 0 && wi > 0 && seq.length) {
        const prev = palabras[wi - 1];
        const entre = texto.slice(matches[wi - 1].index! + matches[wi - 1][0].length, matches[wi].index);
        const pausa = PAUSA_FUERTE.test(entre);
        // La conjunción y ante vocal suena consonante ("rosa y azucena" → "sa-ya-zu"): solo se une
        // a la vocal siguiente. Ante consonante es vocal y sí se une a la anterior ("esparce‿y").
        const sig = palabras[wi + 1];
        const yAnteVocal = p.original.toLowerCase() === 'y' && sig?.empiezaVocal;
        if (!pausa && prev.acabaVocal && p.empiezaVocal && !yAnteVocal) {
          seq[seq.length - 1].push(silaba);
          sinalefas++;
          return;
        }
      }
      seq.push([silaba]);
    });
  });

  const ultima = palabras[palabras.length - 1];
  const tras = ultima.silabas.length - 1 - ultima.tonica;
  const final = tras === 0 ? 'aguda' : tras === 1 ? 'llana' : tras === 2 ? 'esdrújula' : 'sobresdrújula';
  const ajuste = final === 'aguda' ? 1 : final === 'llana' ? 0 : final === 'esdrújula' ? -1 : -2;
  const medida = Math.max(1, seq.length + ajuste);

  const silabasMetricas: SilabaMetrica[] = seq.map((g) => ({
    texto: g.map((x) => x.texto).join('‿'),
    tonica: g.some((x) => x.tonica),
  }));
  const acentos = silabasMetricas.map((s, i) => (s.tonica ? i + 1 : 0)).filter((n) => n && n <= medida);
  // La última tónica siempre cae en la penúltima posición métrica.
  if (acentos.length) acentos[acentos.length - 1] = Math.max(1, medida - 1);
  const tipo = NOMBRES[medida] ?? (medida === 1 ? 'monosílabo' : `${medida} sílabas`);
  const subtipo = medida === 11 ? subtipoEndecasilabo(acentos) : undefined;

  return { texto, palabras, silabasMetricas, fonologicas, sinalefas, final, medida, acentos, tipo, subtipo, vacio: false };
}
