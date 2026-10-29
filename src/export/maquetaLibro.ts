// Maquetación del poemario: produce páginas con instrucciones de dibujo (en puntos, origen arriba
// a la izquierda). La misma maqueta alimenta la vista previa (canvas) y el PDF (pdf-lib).
import { poemTitle, type LibroCompleto, type Poem } from '../db/db';

export type Fuente = 'r' | 'i' | 'b';
export type Tono = 'tinta' | 'gris';

export interface Medidor {
  ancho(texto: string, fuente: Fuente, size: number): number;
}

export type Op =
  | { t: 'text'; x: number; y: number; text: string; f: Fuente; size: number; tono: Tono; espaciado?: number }
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; tono: Tono };

export interface Pagina {
  tipo: 'cubierta' | 'contracubierta' | 'interior';
  ops: Op[];
  folio: number | null; // número de página impreso (null: sin número)
  nombre: string; // para la vista previa: «Portada», «Índice», el título del poema…
}

export interface Maqueta {
  W: number;
  H: number;
  paginas: Pagina[];
}

export const PAGINAS = {
  a5: [419.53, 595.28],
  '13x20': [368.5, 566.93],
  a4: [595.28, 841.89],
} as const;

const ROMANOS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV'];
export const romano = (n: number) => ROMANOS[n - 1] ?? String(n);

export const LICENCIAS: Record<string, string> = {
  reservados:
    'Todos los derechos reservados. Queda prohibida la reproducción total o parcial de esta obra por cualquier medio o procedimiento sin la autorización previa y por escrito de su autor.',
  'cc-by': 'Esta obra se publica bajo licencia Creative Commons Atribución 4.0 Internacional (CC BY 4.0).',
  'cc-by-sa': 'Esta obra se publica bajo licencia Creative Commons Atribución-CompartirIgual 4.0 Internacional (CC BY-SA 4.0).',
  'cc-by-nc': 'Esta obra se publica bajo licencia Creative Commons Atribución-NoComercial 4.0 Internacional (CC BY-NC 4.0).',
  'cc-by-nc-nd': 'Esta obra se publica bajo licencia Creative Commons Atribución-NoComercial-SinDerivadas 4.0 Internacional (CC BY-NC-ND 4.0).',
};

// Texto de la página de créditos, línea a línea (lo usa también el ePub).
export function textoCreditos(b: LibroCompleto): string[] {
  const L = b.legal;
  const out: string[] = [];
  out.push(`© ${L.year}${b.author ? `, ${b.author}` : ''}`);
  if (L.edition) out.push(`${L.edition}${/\d{4}/.test(L.edition) ? '' : `: ${L.year}`}`);
  out.push(L.publisher ? `Edita: ${L.publisher}` : 'Edición de autor');
  if (L.coverDesign) out.push(`Diseño de cubierta: ${L.coverDesign}`);
  if (L.isbn) out.push(`ISBN: ${L.isbn}`);
  if (L.deposito) out.push(`Depósito legal: ${L.deposito}`);
  if (L.printedIn) out.push(`Impreso en ${L.printedIn}`);
  out.push('');
  out.push(LICENCIAS[L.rights] ?? LICENCIAS.reservados);
  if (L.extra.trim()) {
    out.push('');
    out.push(...L.extra.trim().split('\n'));
  }
  return out;
}

export function textoColofon(b: LibroCompleto) {
  if (b.extras.colophon.trim()) return b.extras.colophon.trim();
  const fecha = new Date().toLocaleDateString('es', { month: 'long', year: 'numeric' });
  return `Este libro se compuso en Cormorant Garamond\ny se terminó de maquetar en ${fecha}\ncon Pluma Plateada.`;
}

// Las sangrías del editor son espacios o espacios eme al principio del verso.
function sangria(verso: string) {
  const m = verso.match(/^[\s ]+/);
  return { texto: verso.replace(/^[\s ]+/, ''), nivel: m ? m[0].replace(/ /g, '  ').length / 2 : 0 };
}

export function maquetarLibro(book: LibroCompleto, poemas: Map<string, Poem>, med: Medidor): Maqueta {
  const L = book.layout;
  const [W, H] = PAGINAS[L.page];
  const escala = W / 419.53;
  const factor = L.margins === 'amplio' ? 1.22 : 1;
  const mInt = 60 * factor * escala;
  const mExt = 44 * factor * escala;
  const mSup = 64 * factor * escala;
  const mInf = 70 * factor * escala;
  const cuerpo = L.fontSize * escala;
  const lh = cuerpo * 1.42;
  const util = W - mInt - mExt;
  const pequeno = cuerpo * 0.78;

  const paginas: Pagina[] = [];
  let interiores = 0; // páginas interiores (las cubiertas no cuentan)
  const nueva = (nombre: string, numerada = true): Pagina => {
    interiores++;
    const p: Pagina = { tipo: 'interior', ops: [], folio: numerada ? interiores : null, nombre };
    paginas.push(p);
    return p;
  };
  const esRecto = () => interiores % 2 === 1; // la última creada es impar
  // Asegura que la siguiente página sea impar (derecha), añadiendo una en blanco si hace falta.
  const aRecto = () => {
    if (interiores % 2 === 1) nueva('', false);
  };
  const izq = () => (interiores % 2 === 1 ? mInt : mExt); // margen izquierdo de la página actual
  const texto = (p: Pagina, x: number, y: number, t: string, f: Fuente, size: number, tono: Tono = 'tinta', espaciado?: number) =>
    p.ops.push({ t: 'text', x, y, text: t, f, size, tono, espaciado });
  const centrado = (p: Pagina, y: number, t: string, f: Fuente, size: number, tono: Tono = 'tinta', espaciado = 0) =>
    texto(p, (W - (med.ancho(t, f, size) + espaciado * Math.max(0, t.length - 1))) / 2, y, t, f, size, tono, espaciado || undefined);
  const partir = (t: string, f: Fuente, size: number, ancho: number) => {
    if (med.ancho(t, f, size) <= ancho) return [t];
    const out: string[] = [];
    let cur = '';
    for (const w of t.split(' ')) {
      const prueba = cur ? `${cur} ${w}` : w;
      if (cur && med.ancho(prueba, f, size) > ancho) {
        out.push(cur);
        cur = w;
      } else cur = prueba;
    }
    if (cur) out.push(cur);
    return out;
  };
  // Prosa (prólogo, agradecimientos…): párrafos justificados a la izquierda con sangría de primera línea.
  const prosa = (titulo: string, cuerpoTexto: string) => {
    aRecto();
    let p = nueva(titulo);
    centrado(p, mSup + cuerpo * 3, titulo, 'b', cuerpo * 1.35);
    let y = mSup + cuerpo * 7;
    cuerpoTexto
      .trim()
      .split(/\n\s*\n|\n/)
      .filter((x) => x.trim())
      .forEach((par) => {
        partir(par.trim(), 'r', cuerpo, util - cuerpo * 1.4).forEach((l, i) => {
          if (y > H - mInf) {
            p = nueva(titulo);
            y = mSup + cuerpo;
          }
          texto(p, izq() + (i === 0 ? cuerpo * 1.4 : 0), y, l, 'r', cuerpo);
          y += lh;
        });
      });
  };

  // ── Cubierta ──
  if (L.includeCover) paginas.push({ tipo: 'cubierta', ops: [], folio: null, nombre: 'Cubierta' });

  // ── Portadilla, portada y créditos ──
  const portadilla = nueva('Portadilla', false);
  centrado(portadilla, H * 0.36, book.title, 'r', cuerpo * 1.4);
  nueva('', false);
  const portada = nueva('Portada', false);
  let yT = H * 0.3;
  partir(book.title, 'b', cuerpo * 2.3, util).forEach((l) => {
    centrado(portada, yT, l, 'b', cuerpo * 2.3);
    yT += cuerpo * 2.6;
  });
  if (book.subtitle) centrado(portada, yT + cuerpo * 0.6, book.subtitle, 'i', cuerpo * 1.2, 'gris');
  if (book.author) centrado(portada, H * 0.62, book.author, 'r', cuerpo * 1.25);
  const sello = book.legal.publisher || '';
  if (sello) centrado(portada, H - mInf, sello.toUpperCase(), 'r', pequeno, 'gris', pequeno * 0.18);

  const creditos = nueva('Créditos', false);
  const lineasCred = textoCreditos(book).flatMap((l) => (l ? partir(l, 'r', pequeno, util) : ['']));
  let yC = H - mInf - lineasCred.length * pequeno * 1.45;
  lineasCred.forEach((l) => {
    if (l) texto(creditos, mExt, yC, l, 'r', pequeno, 'gris');
    yC += pequeno * 1.45;
  });

  // ── Dedicatoria y epígrafe ──
  if (book.dedication.trim()) {
    const p = nueva('Dedicatoria', false);
    let y = H * 0.32;
    book.dedication
      .trim()
      .split('\n')
      .forEach((l) => {
        partir(l, 'i', cuerpo * 1.05, util * 0.7).forEach((x) => {
          texto(p, W - mExt - med.ancho(x, 'i', cuerpo * 1.05), y, x, 'i', cuerpo * 1.05);
          y += lh;
        });
      });
    nueva('', false);
  }
  if (book.extras.epigraph.trim()) {
    const p = nueva('Epígrafe', false);
    let y = H * 0.3;
    const ancho = util * 0.72;
    const x0 = W - mExt - ancho;
    book.extras.epigraph
      .trim()
      .split('\n')
      .forEach((l) =>
        partir(l, 'i', cuerpo, ancho).forEach((x) => {
          texto(p, x0, y, x, 'i', cuerpo);
          y += lh;
        }),
      );
    if (book.extras.epigraphAuthor.trim()) {
      const a = `— ${book.extras.epigraphAuthor.trim()}`;
      texto(p, W - mExt - med.ancho(a, 'r', pequeno), y + lh * 0.4, a, 'r', pequeno, 'gris');
    }
    nueva('', false);
  }

  // ── Índice (reservado; se rellena al final) ──
  type Entrada = { titulo: string; pagina: number; parte: boolean };
  const entradas: Entrada[] = [];
  const partesConPoemas = book.parts.filter((pt) => pt.poemIds.some((id) => poemas.has(id)));
  const nEntradas = partesConPoemas.reduce((a, pt) => a + pt.poemIds.filter((id) => poemas.has(id)).length + (L.partPages || partesConPoemas.length > 1 ? 1 : 0), 0);
  const filaIndice = cuerpo * 1.75;
  const porPagina = Math.max(4, Math.floor((H - mSup - mInf - cuerpo * 6) / filaIndice));
  const paginasIndice: Pagina[] = [];
  if (L.toc && nEntradas) {
    aRecto();
    const n = Math.ceil(nEntradas / porPagina);
    for (let i = 0; i < n; i++) paginasIndice.push(nueva('Índice', false));
  }

  if (book.extras.prologue.trim()) prosa('Prólogo', book.extras.prologue);

  // ── Poemas ──
  let pag: Pagina | null = null;
  let y = 0;
  let cabecera = book.title;
  const empezar = (nombre: string) => {
    pag = nueva(nombre);
    y = mSup;
    if (L.runningHeads) {
      const t = esRecto() ? cabecera : book.title;
      if (t) centrado(pag, mSup * 0.55, t, 'i', pequeno, 'gris');
    }
  };
  partesConPoemas.forEach((parte, pi) => {
    const ids = parte.poemIds.filter((id) => poemas.has(id));
    cabecera = partesConPoemas.length > 1 || L.partPages ? parte.title || book.title : book.author || book.title;
    if (L.partPages) {
      aRecto();
      const p = nueva(parte.title || `Parte ${romano(pi + 1)}`, false);
      centrado(p, H * 0.4, romano(pi + 1), 'r', cuerpo * 1.1, 'gris', cuerpo * 0.2);
      const titulo = parte.title || `Parte ${romano(pi + 1)}`;
      partir(titulo, 'b', cuerpo * 1.7, util).forEach((l, i) => centrado(p, H * 0.4 + cuerpo * 3 + i * cuerpo * 2, l, 'b', cuerpo * 1.7));
      entradas.push({ titulo, pagina: p.folio ?? interiores, parte: true });
      nueva('', false);
      pag = null;
    } else if (partesConPoemas.length > 1) {
      entradas.push({ titulo: parte.title || `Parte ${romano(pi + 1)}`, pagina: interiores + 1, parte: true });
    }
    ids.forEach((id, k) => {
      const poema = poemas.get(id)!;
      const titulo = poemTitle(poema);
      if (L.newPagePerPoem || !pag || (k === 0 && L.partPages)) empezar(titulo);
      else {
        y += lh * 2.2;
        if (y > H - mInf - lh * 6) empezar(titulo);
      }
      entradas.push({ titulo, pagina: interiores, parte: false });

      // Versos ya partidos, para conocer la anchura del bloque.
      const estrofas = poema.text
        .replace(/\r/g, '')
        .split(/\n\s*\n/)
        .map((e) =>
          e
            .split('\n')
            .filter((v) => v.trim())
            .map((v) => {
              const { texto: t, nivel } = sangria(v);
              const ind = nivel * cuerpo * 1.2;
              return { lineas: partir(t, 'r', cuerpo, util - ind - cuerpo * 1.6), ind };
            }),
        )
        .filter((e) => e.length);
      const anchoBloque = Math.min(
        util,
        Math.max(cuerpo * 8, ...estrofas.flat().flatMap((v) => v.lineas.map((l, i) => v.ind + (i ? cuerpo * 1.6 : 0) + med.ancho(l, 'r', cuerpo)))),
      );
      const x0 = () => (L.poemAlign === 'bloque' && poema.align !== 'center' ? izq() + (util - anchoBloque) / 2 : izq());

      // Título del poema.
      const tSize = L.titleCase === 'versalitas' ? cuerpo * 1.02 : cuerpo * 1.3;
      const tTexto = L.titleCase === 'versalitas' ? titulo.toUpperCase() : titulo;
      const tEsp = L.titleCase === 'versalitas' ? tSize * 0.14 : 0;
      const centrarTitulo = poema.align === 'center';
      partir(tTexto, 'b', tSize, util).forEach((l) => {
        y += tSize * 1.25;
        if (centrarTitulo) centrado(pag!, y, l, 'b', tSize, 'tinta', tEsp);
        else texto(pag!, x0(), y, l, 'b', tSize, 'tinta', tEsp || undefined);
      });
      if (L.ornament) {
        y += cuerpo * 0.9;
        const largo = cuerpo * 2.2;
        const xi = centrarTitulo ? (W - largo) / 2 : x0();
        pag!.ops.push({ t: 'line', x1: xi, y1: y, x2: xi + largo, y2: y, tono: 'gris' });
      }
      y += lh * 1.5;

      estrofas.forEach((estrofa, ei) => {
        if (ei > 0) y += lh * 0.75;
        // No deja al final de la página el arranque suelto de una estrofa.
        const necesita = Math.min(estrofa.reduce((a, v) => a + v.lineas.length, 0), 3) * lh;
        if (y + necesita > H - mInf) {
          empezar(titulo);
          y += lh * 0.5;
        }
        estrofa.forEach((v) => {
          v.lineas.forEach((l, li) => {
            if (y + lh > H - mInf + lh * 0.3) {
              empezar(titulo);
              y += lh * 0.5;
            }
            const x =
              poema.align === 'center' ? (W - med.ancho(l, 'r', cuerpo)) / 2 : x0() + v.ind + (li > 0 ? cuerpo * 1.6 : 0);
            texto(pag!, x, y + cuerpo, l, 'r', cuerpo);
            y += lh;
          });
        });
      });
    });
  });

  // ── Páginas finales ──
  if (book.extras.acknowledgements.trim()) prosa('Agradecimientos', book.extras.acknowledgements);
  if (book.extras.aboutAuthor.trim()) prosa(book.author ? `Sobre ${book.author}` : 'Sobre el autor', book.extras.aboutAuthor);
  const colofon = nueva('Colofón', false);
  const lineasCol = textoColofon(book).split('\n');
  let yCol = H * 0.62;
  colofon.ops.push({ t: 'line', x1: W / 2 - cuerpo, y1: yCol - lh * 1.6, x2: W / 2 + cuerpo, y2: yCol - lh * 1.6, tono: 'gris' });
  lineasCol.forEach((l) => {
    partir(l, 'i', pequeno * 1.05, util).forEach((x) => {
      centrado(colofon, yCol, x, 'i', pequeno * 1.05, 'gris');
      yCol += pequeno * 1.6;
    });
  });

  // ── Índice ──
  if (paginasIndice.length) {
    let pi = 0;
    let p = paginasIndice[0];
    let yi = mSup + cuerpo * 3;
    centrado(p, yi, 'Índice', 'b', cuerpo * 1.35);
    yi += cuerpo * 3;
    for (const e of entradas) {
      if (yi > H - mInf) {
        p = paginasIndice[++pi] ?? p;
        yi = mSup + cuerpo;
      }
      const f: Fuente = e.parte ? 'b' : 'r';
      const x = mInt + (e.parte ? 0 : cuerpo);
      const num = String(e.pagina);
      const wNum = med.ancho(num, 'r', cuerpo);
      const maxT = util - wNum - cuerpo * 3 - (e.parte ? 0 : cuerpo);
      let t = e.titulo;
      while (t.length > 3 && med.ancho(t, f, cuerpo) > maxT) t = t.slice(0, -2);
      if (t !== e.titulo) t = t.trimEnd() + '…';
      if (e.parte && yi > mSup + cuerpo * 7) yi += cuerpo * 0.6;
      texto(p, x, yi, t, f, cuerpo);
      // Puntos guía hasta el número.
      const desde = x + med.ancho(t, f, cuerpo) + cuerpo * 0.6;
      const hasta = W - mExt - wNum - cuerpo * 0.6;
      // Cada punto en su sitio exacto: así la vista previa y el PDF coinciden.
      const punto = med.ancho('.', 'r', cuerpo) + cuerpo * 0.35;
      const n = Math.max(0, Math.floor((hasta - desde) / punto));
      for (let k = 0; k < n; k++) texto(p, hasta - (n - k) * punto, yi, '.', 'r', cuerpo, 'gris');
      texto(p, W - mExt - wNum, yi, num, 'r', cuerpo, 'gris');
      yi += filaIndice;
    }
  }

  // ── Folios ──
  if (L.pageNumbers) {
    paginas.forEach((p) => {
      if (p.folio == null || !p.ops.length) return;
      const n = String(p.folio);
      const w = med.ancho(n, 'r', pequeno);
      const recto = p.folio % 2 === 1;
      const x = L.folio === 'exterior' ? (recto ? W - mExt - w : mExt) : (W - w) / 2;
      p.ops.push({ t: 'text', x, y: H - mInf * 0.45, text: n, f: 'r', size: pequeno, tono: 'gris' });
    });
  }

  if (L.includeCover) paginas.push({ tipo: 'contracubierta', ops: [], folio: null, nombre: 'Contracubierta' });
  return { W, H, paginas };
}
