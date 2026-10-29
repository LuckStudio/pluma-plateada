// Poemario: PDF para imprenta (pdf-lib + Cormorant Garamond incrustada), vista previa y ePub 3.
// La vista previa y el PDF comparten la misma maqueta (maquetaLibro.ts).
import { PDFDocument, rgb, setCharacterSpacing, type PDFFont } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import JSZip from 'jszip';
import { poemTitle, type LibroCompleto, type Poem } from '../db/db';
import { maquetarLibro, romano, textoColofon, textoCreditos, type Fuente, type Maqueta, type Medidor, type Pagina } from './maquetaLibro';
import { cargarPluma } from './lienzo';
import { dibujarCubierta, prepararCubierta, renderCubierta } from './portada';

const asset = (p: string) => new URL(p, document.baseURI).href;
const ARCHIVOS: Record<Fuente, string> = {
  r: 'CormorantGaramond-Regular.ttf',
  i: 'CormorantGaramond-Italic.ttf',
  b: 'CormorantGaramond-SemiBold.ttf',
};

const bytes = new Map<Fuente, Promise<ArrayBuffer>>();
function bytesFuente(f: Fuente) {
  if (!bytes.has(f)) {
    bytes.set(
      f,
      fetch(asset(`fonts/${ARCHIVOS[f]}`)).then((r) => {
        if (!r.ok) throw new Error('No se pudieron cargar las fuentes del libro');
        return r.arrayBuffer();
      }),
    );
  }
  return bytes.get(f)!;
}

async function incrustar(pdf: PDFDocument) {
  pdf.registerFontkit(fontkit);
  // Fuente completa y sin ligaduras: el subconjunto de fontkit pierde letras con esta tipografía
  // y la ligadura «qu» se coloca mal en el PDF.
  const sinLigaduras = { liga: false, clig: false, calt: false, dlig: false, rlig: false };
  const [r, i, b] = await Promise.all((['r', 'i', 'b'] as Fuente[]).map(async (f) => pdf.embedFont(await bytesFuente(f), { subset: false, features: sinLigaduras })));
  return { r, i, b } as Record<Fuente, PDFFont>;
}

const medidorDe = (fuentes: Record<Fuente, PDFFont>): Medidor => ({ ancho: (t, f, size) => fuentes[f].widthOfTextAtSize(t, size) });

// Maqueta para la vista previa: medimos con las mismas fuentes que el PDF.
let medidorPrevia: Promise<Medidor> | null = null;
export async function maquetarParaPrevia(book: LibroCompleto, poemas: Map<string, Poem>): Promise<Maqueta> {
  medidorPrevia ??= PDFDocument.create().then(async (pdf) => medidorDe(await incrustar(pdf)));
  return maquetarLibro(book, poemas, await medidorPrevia);
}

const TONO = { tinta: '#1b1d24', gris: '#5f6470' };

// Dibuja una página de la maqueta en un canvas (escala = px por punto).
export async function dibujarPagina(ctx: CanvasRenderingContext2D, m: Maqueta, p: Pagina, escala: number, book: LibroCompleto) {
  const W = m.W * escala;
  const H = m.H * escala;
  if (p.tipo !== 'interior') {
    const [img, pluma] = await Promise.all([prepararCubierta(book), cargarPluma()]);
    dibujarCubierta(ctx, book, W, H, p.tipo === 'cubierta' ? 'front' : 'back', img, pluma);
    return;
  }
  await Promise.all([document.fonts.load('400 16px "Cormorant Garamond"'), document.fonts.load('italic 400 16px "Cormorant Garamond"'), document.fonts.load('600 16px "Cormorant Garamond"')]);
  ctx.fillStyle = '#fffdf9';
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = 'alphabetic';
  for (const op of p.ops) {
    if (op.t === 'line') {
      ctx.strokeStyle = TONO[op.tono];
      ctx.lineWidth = Math.max(0.5, 0.6 * escala);
      ctx.beginPath();
      ctx.moveTo(op.x1 * escala, op.y1 * escala);
      ctx.lineTo(op.x2 * escala, op.y2 * escala);
      ctx.stroke();
      continue;
    }
    ctx.font = `${op.f === 'i' ? 'italic ' : ''}${op.f === 'b' ? 600 : 400} ${op.size * escala}px "Cormorant Garamond", Georgia, serif`;
    ctx.fillStyle = TONO[op.tono];
    if ('letterSpacing' in ctx) ctx.letterSpacing = op.espaciado ? `${op.espaciado * escala}px` : '0px';
    ctx.fillText(op.text, op.x * escala, op.y * escala);
  }
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
}

const PT_POR_PX_300 = 300 / 72;

export async function exportarLibroPdf(book: LibroCompleto, poemas: Map<string, Poem>): Promise<Blob> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(book.title);
  if (book.author) pdf.setAuthor(book.author);
  pdf.setCreator('Pluma Plateada');
  pdf.setLanguage('es-ES');
  const fuentes = await incrustar(pdf);
  const m = maquetarLibro(book, poemas, medidorDe(fuentes));
  const tono = { tinta: rgb(0.105, 0.115, 0.14), gris: rgb(0.37, 0.39, 0.44) };
  for (const p of m.paginas) {
    const page = pdf.addPage([m.W, m.H]);
    if (p.tipo !== 'interior') {
      const blob = await renderCubierta(book, p.tipo === 'cubierta' ? 'front' : 'back', m.W * PT_POR_PX_300, m.H * PT_POR_PX_300, 'image/jpeg');
      const img = await pdf.embedJpg(await blob.arrayBuffer());
      page.drawImage(img, { x: 0, y: 0, width: m.W, height: m.H });
      continue;
    }
    for (const op of p.ops) {
      if (op.t === 'line') {
        page.drawLine({ start: { x: op.x1, y: m.H - op.y1 }, end: { x: op.x2, y: m.H - op.y2 }, thickness: 0.6, color: tono[op.tono] });
        continue;
      }
      if (op.espaciado) page.pushOperators(setCharacterSpacing(op.espaciado));
      page.drawText(op.text, { x: op.x, y: m.H - op.y, size: op.size, font: fuentes[op.f], color: tono[op.tono] });
      if (op.espaciado) page.pushOperators(setCharacterSpacing(0));
    }
  }
  const out = await pdf.save();
  return new Blob([out as BlobPart], { type: 'application/pdf' });
}

export async function exportarCubiertaPng(book: LibroCompleto, cara: 'front' | 'back') {
  const { PAGINAS } = await import('./maquetaLibro');
  const [w, h] = PAGINAS[book.layout.page];
  return renderCubierta(book, cara, w * PT_POR_PX_300, h * PT_POR_PX_300, 'image/png');
}

// ───────── ePub ─────────

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const parrafos = (t: string) =>
  t
    .trim()
    .split(/\n\s*\n|\n/)
    .filter((x) => x.trim())
    .map((x) => `<p>${esc(x.trim())}</p>`)
    .join('\n');

const xhtml = (titulo: string, cuerpo: string, tipo = '') => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="es" lang="es">
<head><meta charset="UTF-8"/><title>${esc(titulo)}</title><link rel="stylesheet" type="text/css" href="estilo.css"/></head>
<body${tipo ? ` epub:type="${tipo}"` : ''}>
${cuerpo}
</body>
</html>`;

const CSS = `@font-face{font-family:"Cormorant Garamond";font-weight:400;font-style:normal;src:url(fonts/CormorantGaramond-Regular.ttf)}
@font-face{font-family:"Cormorant Garamond";font-weight:400;font-style:italic;src:url(fonts/CormorantGaramond-Italic.ttf)}
@font-face{font-family:"Cormorant Garamond";font-weight:600;font-style:normal;src:url(fonts/CormorantGaramond-SemiBold.ttf)}
body{font-family:"Cormorant Garamond",Georgia,serif;font-size:1.08em;line-height:1.45;margin:0 1.2em;color:#1b1d24}
h1,h2{font-weight:600;text-align:center;page-break-after:avoid;line-height:1.15}
h1{font-size:1.9em;margin:30% 0 .4em}
h2{font-size:1.35em;margin:2.2em 0 .4em}
.subtitulo{text-align:center;font-style:italic;color:#5f6470;margin:0}
.autor{text-align:center;margin-top:4em;font-size:1.1em}
.sello{text-align:center;margin-top:6em;letter-spacing:.18em;text-transform:uppercase;font-size:.75em;color:#5f6470}
.cubierta{margin:0;padding:0;text-align:center}.cubierta img{max-width:100%;max-height:100vh}
.creditos{margin-top:40%;font-size:.8em;color:#5f6470}.creditos p{margin:0 0 .2em}
.dedicatoria,.epigrafe{margin:30% 0 0 30%;font-style:italic;text-align:right}
.epigrafe .firma{font-style:normal;font-size:.85em;color:#5f6470;margin-top:.6em}
.parte{text-align:center;margin-top:35%}.parte .num{letter-spacing:.2em;color:#5f6470}
.filete{width:2.2em;border:0;border-top:1px solid #9aa0ab;margin:.6em auto 1.4em}
.bloque{display:inline-block;text-align:left}.poema{text-align:center}
.izquierda .bloque{display:block}
.estrofa{margin:0 0 1em}
.verso{margin:0;padding-left:1.6em;text-indent:-1.6em}
.centrado .verso{text-align:center;padding-left:0;text-indent:0}
.prosa p{text-indent:1.4em;margin:0}
.colofon{margin-top:50%;text-align:center;font-style:italic;color:#5f6470;font-size:.9em}`;

export async function exportarEpub(book: LibroCompleto, poemas: Map<string, Poem>): Promise<Blob> {
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
  o.file('estilo.css', CSS);
  for (const f of Object.values(ARCHIVOS)) o.file(`fonts/${f}`, await bytesFuente(f === ARCHIVOS.r ? 'r' : f === ARCHIVOS.i ? 'i' : 'b'));
  const manifiesto: string[] = [];
  const spine: string[] = [];
  const nav: string[] = [];
  const add = (id: string, href: string, titulo: string, html: string, opts: { nav?: boolean; parte?: boolean; tipo?: string } = {}) => {
    o.file(href, xhtml(titulo, html, opts.tipo));
    manifiesto.push(`<item id="${id}" href="${href}" media-type="application/xhtml+xml"/>`);
    spine.push(`<itemref idref="${id}"/>`);
    if (opts.nav) nav.push(`<li><a href="${href}">${opts.parte ? `<strong>${esc(titulo)}</strong>` : esc(titulo)}</a></li>`);
  };

  // Cubierta.
  const cubierta = await renderCubierta(book, 'front', 1200, 1200 * (595.28 / 419.53), 'image/jpeg');
  o.file('cubierta.jpg', await cubierta.arrayBuffer());
  manifiesto.push('<item id="img-cubierta" href="cubierta.jpg" media-type="image/jpeg" properties="cover-image"/>');
  add('cubierta', 'cubierta.xhtml', 'Cubierta', `<div class="cubierta"><img src="cubierta.jpg" alt="${esc(book.title)}"/></div>`, { tipo: 'cover' });

  add(
    'portada',
    'portada.xhtml',
    book.title,
    `<section epub:type="titlepage"><h1>${esc(book.title)}</h1>${book.subtitle ? `<p class="subtitulo">${esc(book.subtitle)}</p>` : ''}${
      book.author ? `<p class="autor">${esc(book.author)}</p>` : ''
    }${book.legal.publisher ? `<p class="sello">${esc(book.legal.publisher)}</p>` : ''}</section>`,
  );
  add('creditos', 'creditos.xhtml', 'Créditos', `<section class="creditos" epub:type="copyright-page">${textoCreditos(book).map((l) => (l ? `<p>${esc(l)}</p>` : '<p>&#160;</p>')).join('')}</section>`);
  if (book.dedication.trim())
    add('dedicatoria', 'dedicatoria.xhtml', 'Dedicatoria', `<p class="dedicatoria" epub:type="dedication">${esc(book.dedication.trim()).replace(/\n/g, '<br/>')}</p>`);
  if (book.extras.epigraph.trim())
    add(
      'epigrafe',
      'epigrafe.xhtml',
      'Epígrafe',
      `<div class="epigrafe" epub:type="epigraph"><p>${esc(book.extras.epigraph.trim()).replace(/\n/g, '<br/>')}</p>${
        book.extras.epigraphAuthor ? `<p class="firma">— ${esc(book.extras.epigraphAuthor)}</p>` : ''
      }</div>`,
    );
  if (book.extras.prologue.trim()) add('prologo', 'prologo.xhtml', 'Prólogo', `<section class="prosa" epub:type="foreword"><h2>Prólogo</h2>${parrafos(book.extras.prologue)}</section>`, { nav: true });

  let n = 0;
  const partes = book.parts.filter((pt) => pt.poemIds.some((id) => poemas.has(id)));
  partes.forEach((parte, pi) => {
    if (book.layout.partPages) {
      add(`parte${pi + 1}`, `parte-${pi + 1}.xhtml`, parte.title, `<section class="parte" epub:type="part"><p class="num">${romano(pi + 1)}</p><h2>${esc(parte.title)}</h2></section>`, {
        nav: true,
        parte: true,
      });
    }
    parte.poemIds
      .filter((id) => poemas.has(id))
      .forEach((id) => {
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
                .map((v) => `<p class="verso">${esc(v.replace(/ /g, '   '))}</p>`)
                .join('')}</div>`,
          )
          .join('\n');
        const clase = p.align === 'center' ? 'centrado' : book.layout.poemAlign === 'bloque' ? 'poema' : 'izquierda';
        add(
          `poema${++n}`,
          `poema-${n}.xhtml`,
          titulo,
          `<section class="${clase}" epub:type="chapter"><h2>${esc(titulo)}</h2>${book.layout.ornament ? '<hr class="filete"/>' : ''}<div class="bloque">${estrofas}</div></section>`,
          { nav: true },
        );
      });
  });
  if (book.extras.acknowledgements.trim())
    add('agradecimientos', 'agradecimientos.xhtml', 'Agradecimientos', `<section class="prosa" epub:type="acknowledgments"><h2>Agradecimientos</h2>${parrafos(book.extras.acknowledgements)}</section>`, { nav: true });
  if (book.extras.aboutAuthor.trim()) {
    const t = book.author ? `Sobre ${book.author}` : 'Sobre el autor';
    add('autor', 'autor.xhtml', t, `<section class="prosa"><h2>${esc(t)}</h2>${parrafos(book.extras.aboutAuthor)}</section>`, { nav: true });
  }
  add('colofon', 'colofon.xhtml', 'Colofón', `<p class="colofon" epub:type="colophon">${esc(textoColofon(book)).replace(/\n/g, '<br/>')}</p>`);

  o.file('nav.xhtml', xhtml('Índice', `<nav epub:type="toc" id="toc"><h2>Índice</h2><ol>${nav.join('\n')}</ol></nav>`));
  const fuentesManifiesto = Object.values(ARCHIVOS)
    .map((f, k) => `<item id="fuente${k}" href="fonts/${f}" media-type="font/ttf"/>`)
    .join('\n    ');
  o.file(
    'content.opf',
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="es">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">${book.legal.isbn ? `urn:isbn:${esc(book.legal.isbn.replace(/[^0-9Xx]/g, ''))}` : `urn:uuid:${book.id}`}</dc:identifier>
    <dc:title>${esc(book.title)}</dc:title>
    <dc:language>es</dc:language>
    ${book.author ? `<dc:creator>${esc(book.author)}</dc:creator>` : ''}
    ${book.legal.publisher ? `<dc:publisher>${esc(book.legal.publisher)}</dc:publisher>` : ''}
    ${book.back.blurb ? `<dc:description>${esc(book.back.blurb)}</dc:description>` : ''}
    <dc:rights>${esc(textoCreditos(book).filter(Boolean).slice(-1)[0] ?? '')}</dc:rights>
    <meta name="cover" content="img-cubierta"/>
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="css" href="estilo.css" media-type="text/css"/>
    ${fuentesManifiesto}
    ${manifiesto.join('\n    ')}
  </manifest>
  <spine>
    ${spine.join('\n    ')}
  </spine>
</package>`,
  );
  return zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' });
}
