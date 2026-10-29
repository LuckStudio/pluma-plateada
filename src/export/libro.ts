// Poemario: PDF listo para imprenta (pdf-lib + Cormorant Garamond incrustada) y ePub 3.
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import JSZip from 'jszip';
import { poemTitle, type Book, type Poem } from '../db/db';

const PAGINAS = {
  a5: [419.53, 595.28],
  '13x20': [368.5, 566.93],
  a4: [595.28, 841.89],
} as const;

const asset = (p: string) => new URL(p, document.baseURI).href;

async function fuente(pdf: PDFDocument, archivo: string) {
  const bytes = await fetch(asset(`fonts/${archivo}`)).then((r) => {
    if (!r.ok) throw new Error('No se pudieron cargar las fuentes del libro');
    return r.arrayBuffer();
  });
  return pdf.embedFont(bytes, { subset: true });
}

interface Entrada {
  titulo: string;
  pagina: number;
  esParte: boolean;
}

const ROMANOS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

// Las sangrías del editor son espacios o espacios eme al principio del verso.
function sangria(verso: string) {
  const m = verso.match(/^[\s ]+/);
  return { texto: verso.replace(/^[\s ]+/, ''), nivel: m ? m[0].replace(/ /g, '  ').length / 2 : 0 };
}

export async function exportarLibroPdf(book: Book, poemas: Map<string, Poem>): Promise<Blob> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(book.title);
  if (book.author) pdf.setAuthor(book.author);
  pdf.setCreator('Pluma Plateada');
  const [regular, italica, negrita] = await Promise.all([
    fuente(pdf, 'CormorantGaramond-Regular.ttf'),
    fuente(pdf, 'CormorantGaramond-Italic.ttf'),
    fuente(pdf, 'CormorantGaramond-SemiBold.ttf'),
  ]);
  const [PW, PH] = PAGINAS[book.layout.page];
  const L = book.layout;
  const factor = L.margins === 'amplio' ? 1.25 : 1;
  const escala = PW / 419.53;
  const mInt = 58 * factor * escala;
  const mExt = 44 * factor * escala;
  const mSup = 62 * factor * escala;
  const mInf = 66 * factor * escala;
  const cuerpo = L.fontSize * escala;
  const interlinea = cuerpo * 1.42;
  const tinta = rgb(0.1, 0.1, 0.12);
  const gris = rgb(0.38, 0.4, 0.45);

  const paginas: PDFPage[] = [];
  const numerar: Set<number> = new Set();
  const nueva = (numerada = true) => {
    const p = pdf.addPage([PW, PH]);
    paginas.push(p);
    if (numerada) numerar.add(paginas.length - 1);
    return p;
  };
  const margenIzq = (i: number) => (i % 2 === 0 ? mInt : mExt); // página impar (índice par) → interior a la izquierda
  const anchoUtil = PW - mInt - mExt;
  const centrado = (p: PDFPage, texto: string, f: PDFFont, size: number, y: number, color = tinta) => {
    const w = f.widthOfTextAtSize(texto, size);
    p.drawText(texto, { x: (PW - w) / 2, y, size, font: f, color });
  };

  // Portadilla.
  const portada = nueva(false);
  centrado(portada, book.title, negrita, 26 * escala, PH * 0.62);
  if (book.subtitle) centrado(portada, book.subtitle, italica, 15 * escala, PH * 0.62 - 30 * escala, gris);
  if (book.author) centrado(portada, book.author, regular, 14 * escala, PH * 0.2);
  nueva(false);

  if (book.dedication.trim()) {
    const p = nueva(false);
    const lineas = book.dedication.trim().split('\n');
    let y = PH * 0.7;
    for (const l of lineas) {
      const w = italica.widthOfTextAtSize(l, cuerpo);
      p.drawText(l, { x: PW - mExt - w, y, size: cuerpo, font: italica, color: tinta });
      y -= interlinea;
    }
    nueva(false);
  }

  // Reservamos las páginas del índice antes de maquetar (para saber los números).
  const entradas: Entrada[] = [];
  const totalEntradas = book.parts.reduce((a, p) => a + p.poemIds.filter((id) => poemas.has(id)).length + (L.partPages ? 1 : 0), 0);
  const porPaginaIndice = Math.floor((PH - mSup - mInf - 40 * escala) / (cuerpo * 1.7));
  const paginasIndice = L.toc ? Math.max(1, Math.ceil(totalEntradas / porPaginaIndice)) : 0;
  const inicioIndice = paginas.length;
  for (let i = 0; i < paginasIndice; i++) nueva(false);
  if (paginasIndice && paginas.length % 2 === 1) nueva(false); // el poemario empieza en página impar

  // Ajusta una línea larga en varias, con sangría francesa.
  const partir = (texto: string, f: PDFFont, size: number, ancho: number) => {
    if (f.widthOfTextAtSize(texto, size) <= ancho) return [texto];
    const out: string[] = [];
    let cur = '';
    for (const w of texto.split(' ')) {
      const prueba = cur ? `${cur} ${w}` : w;
      if (cur && f.widthOfTextAtSize(prueba, size) > ancho) {
        out.push(cur);
        cur = w;
      } else cur = prueba;
    }
    if (cur) out.push(cur);
    return out;
  };

  let pag = paginas[paginas.length - 1];
  let y = 0;
  const empezarPagina = () => {
    pag = nueva(true);
    y = PH - mSup;
  };

  book.parts.forEach((parte, pi) => {
    const ids = parte.poemIds.filter((id) => poemas.has(id));
    if (!ids.length) return;
    if (L.partPages) {
      if (paginas.length % 2 === 1) nueva(false);
      const p = nueva(false);
      centrado(p, `${ROMANOS[pi] ?? pi + 1}`, regular, 13 * escala, PH * 0.6, gris);
      centrado(p, parte.title || `Parte ${ROMANOS[pi] ?? pi + 1}`, negrita, 20 * escala, PH * 0.6 - 30 * escala);
      entradas.push({ titulo: parte.title || `Parte ${pi + 1}`, pagina: paginas.length, esParte: true });
      nueva(false);
      y = 0;
    }
    ids.forEach((id, k) => {
      const poema = poemas.get(id)!;
      const titulo = poemTitle(poema);
      if (L.newPagePerPoem || y === 0 || k === 0) empezarPagina();
      else {
        y -= interlinea * 2;
        if (y < mInf + interlinea * 5) empezarPagina();
      }
      const idx = paginas.length - 1;
      entradas.push({ titulo, pagina: paginas.length, esParte: false });
      const x0 = margenIzq(idx);
      pag.drawText(titulo, { x: x0, y: y - cuerpo * 1.3, size: cuerpo * 1.3, font: negrita, color: tinta });
      y -= cuerpo * 1.3 + interlinea * 1.4;
      const estrofas = poema.text.replace(/\r/g, '').split(/\n\s*\n/);
      estrofas.forEach((estrofa, ei) => {
        const versos = estrofa.split('\n').filter((v) => v.trim());
        // Evita dejar una estrofa corta partida al final de la página.
        if (ei > 0) y -= interlinea * 0.8;
        if (y - Math.min(versos.length, 3) * interlinea < mInf) empezarPagina();
        versos.forEach((v) => {
          const { texto, nivel } = sangria(v);
          const xs = margenIzq(paginas.length - 1) + nivel * cuerpo * 1.2;
          const lineas = partir(texto, regular, cuerpo, anchoUtil - nivel * cuerpo * 1.2);
          lineas.forEach((l, li) => {
            if (y - interlinea < mInf) empezarPagina();
            const x = poema.align === 'center' ? (PW - regular.widthOfTextAtSize(l, cuerpo)) / 2 : xs + (li > 0 ? cuerpo * 1.6 : 0);
            pag.drawText(l, { x, y: y - cuerpo, size: cuerpo, font: regular, color: tinta });
            y -= interlinea;
          });
        });
      });
    });
  });

  // Índice.
  if (L.toc) {
    let pi = inicioIndice;
    let p = paginas[pi];
    let yi = PH - mSup;
    centrado(p, 'Índice', negrita, 18 * escala, yi - 18 * escala);
    yi -= 50 * escala;
    for (const e of entradas) {
      if (yi < mInf) {
        pi++;
        p = paginas[pi];
        yi = PH - mSup;
      }
      const f = e.esParte ? negrita : regular;
      const x = mExt + (e.esParte ? 0 : 12 * escala);
      const num = String(e.pagina);
      const wNum = regular.widthOfTextAtSize(num, cuerpo);
      const maxTitulo = anchoUtil - wNum - 30 * escala;
      let t = e.titulo;
      while (t.length > 3 && f.widthOfTextAtSize(t, cuerpo) > maxTitulo) t = t.slice(0, -2);
      if (t !== e.titulo) t = t.trimEnd() + '…';
      p.drawText(t, { x, y: yi, size: cuerpo, font: f, color: tinta });
      p.drawText(num, { x: PW - mExt - wNum, y: yi, size: cuerpo, font: regular, color: gris });
      yi -= cuerpo * 1.7;
    }
  }

  if (L.pageNumbers) {
    numerar.forEach((i) => {
      const n = String(i + 1);
      const w = regular.widthOfTextAtSize(n, 10 * escala);
      paginas[i].drawText(n, { x: (PW - w) / 2, y: mInf * 0.5, size: 10 * escala, font: regular, color: gris });
    });
  }
  const bytes = await pdf.save();
  return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const xhtml = (titulo: string, cuerpo: string) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="es" lang="es">
<head><meta charset="UTF-8"/><title>${esc(titulo)}</title><link rel="stylesheet" type="text/css" href="estilo.css"/></head>
<body>
${cuerpo}
</body>
</html>`;

export async function exportarEpub(book: Book, poemas: Map<string, Poem>): Promise<Blob> {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`,
  );
  const o = zip.folder('OEBPS')!;
  o.file(
    'estilo.css',
    `body{font-family:serif;line-height:1.45;margin:0 1em}h1,h2{font-weight:600;text-align:center}
.portada{text-align:center;margin-top:30%}.autor{margin-top:3em}.dedicatoria{text-align:right;font-style:italic;margin-top:30%}
.parte{text-align:center;margin-top:35%}.estrofa{margin:0 0 1em}.verso{margin:0;padding-left:1.5em;text-indent:-1.5em}
.centrado .verso{text-align:center;padding-left:0;text-indent:0}`,
  );
  const items: { id: string; href: string; titulo: string; nav: boolean; parte?: boolean }[] = [];
  o.file(
    'portada.xhtml',
    xhtml(
      book.title,
      `<section class="portada" epub:type="titlepage"><h1>${esc(book.title)}</h1>${book.subtitle ? `<p><em>${esc(book.subtitle)}</em></p>` : ''}${
        book.author ? `<p class="autor">${esc(book.author)}</p>` : ''
      }</section>`,
    ),
  );
  items.push({ id: 'portada', href: 'portada.xhtml', titulo: book.title, nav: false });
  if (book.dedication.trim()) {
    o.file('dedicatoria.xhtml', xhtml('Dedicatoria', `<p class="dedicatoria">${esc(book.dedication.trim()).replace(/\n/g, '<br/>')}</p>`));
    items.push({ id: 'dedicatoria', href: 'dedicatoria.xhtml', titulo: 'Dedicatoria', nav: false });
  }
  let n = 0;
  book.parts.forEach((parte, pi) => {
    const ids = parte.poemIds.filter((id) => poemas.has(id));
    if (!ids.length) return;
    if (book.layout.partPages) {
      const href = `parte-${pi + 1}.xhtml`;
      o.file(href, xhtml(parte.title, `<section class="parte"><p>${ROMANOS[pi] ?? pi + 1}</p><h2>${esc(parte.title)}</h2></section>`));
      items.push({ id: `parte${pi + 1}`, href, titulo: parte.title, nav: true, parte: true });
    }
    ids.forEach((id) => {
      const p = poemas.get(id)!;
      const titulo = poemTitle(p);
      const estrofas = p.text
        .replace(/\r/g, '')
        .split(/\n\s*\n/)
        .map(
          (e) =>
            `<div class="estrofa">${e
              .split('\n')
              .filter((v) => v.trim())
              .map((v) => `<p class="verso">${esc(v.replace(/ /g, '  '))}</p>`)
              .join('')}</div>`,
        )
        .join('\n');
      const href = `poema-${++n}.xhtml`;
      o.file(href, xhtml(titulo, `<section class="${p.align === 'center' ? 'centrado' : ''}"><h2>${esc(titulo)}</h2>${estrofas}</section>`));
      items.push({ id: `poema${n}`, href, titulo, nav: true });
    });
  });
  const navItems = items
    .filter((i) => i.nav)
    .map((i) => `<li><a href="${i.href}">${i.parte ? `<strong>${esc(i.titulo)}</strong>` : esc(i.titulo)}</a></li>`)
    .join('\n');
  o.file('nav.xhtml', xhtml('Índice', `<nav epub:type="toc" id="toc"><h1>Índice</h1><ol>${navItems}</ol></nav>`));
  const uid = `urn:uuid:${book.id}`;
  o.file(
    'content.opf',
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="es">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">${uid}</dc:identifier>
    <dc:title>${esc(book.title)}</dc:title>
    <dc:language>es</dc:language>
    ${book.author ? `<dc:creator>${esc(book.author)}</dc:creator>` : ''}
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="css" href="estilo.css" media-type="text/css"/>
    ${items.map((i) => `<item id="${i.id}" href="${i.href}" media-type="application/xhtml+xml"/>`).join('\n    ')}
  </manifest>
  <spine>
    ${items.map((i) => `<itemref idref="${i.id}"/>`).join('\n    ')}
  </spine>
</package>`,
  );
  return zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' });
}
