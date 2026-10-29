// Exporta el lienzo como imagen (PNG/JPG) o PDF de imprenta con sangrado y marcas de corte.
import { PDFDocument, rgb } from 'pdf-lib';
import { dibujar, maquetar, cargarPluma, cargarFuentes, formato, type LienzoOpts } from './lienzo';

const BLEED_MM = 3;
const MARGEN_MM = 12; // espacio para las marcas de corte
const PX_MM = 300 / 25.4;
const PT_MM = 72 / 25.4;

export async function renderLienzo(o: LienzoOpts, bleedMm = 0): Promise<HTMLCanvasElement> {
  await Promise.all([cargarPluma(), cargarFuentes(o.font)]);
  const f = formato(o.format);
  const bleed = Math.round(bleedMm * PX_MM);
  const canvas = document.createElement('canvas');
  canvas.width = f.w + 2 * bleed;
  canvas.height = f.h + 2 * bleed;
  const ctx = canvas.getContext('2d')!;
  const m = maquetar(ctx, o, canvas.width, canvas.height, bleed);
  dibujar(ctx, o, m);
  return canvas;
}

export async function exportarImagen(o: LienzoOpts, tipo: 'png' | 'jpg'): Promise<Blob> {
  const c = await renderLienzo(o);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('No se pudo crear la imagen'))), tipo === 'png' ? 'image/png' : 'image/jpeg', 0.94));
}

export async function exportarPdfImprenta(o: LienzoOpts): Promise<Blob> {
  const f = formato(o.format);
  const mm = f.mm ?? { w: f.w / PX_MM, h: f.h / PX_MM };
  const canvas = await renderLienzo(o, BLEED_MM);
  const png = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), 'image/png'));
  const pdf = await PDFDocument.create();
  pdf.setTitle(o.title || 'Pluma Plateada');
  pdf.setCreator('Pluma Plateada');
  const pageW = (mm.w + 2 * (BLEED_MM + MARGEN_MM)) * PT_MM;
  const pageH = (mm.h + 2 * (BLEED_MM + MARGEN_MM)) * PT_MM;
  const page = pdf.addPage([pageW, pageH]);
  const img = await pdf.embedPng(await png.arrayBuffer());
  const off = MARGEN_MM * PT_MM;
  page.drawImage(img, { x: off, y: off, width: (mm.w + 2 * BLEED_MM) * PT_MM, height: (mm.h + 2 * BLEED_MM) * PT_MM });
  // Marcas de corte en las esquinas del formato final, fuera del sangrado.
  const x0 = (MARGEN_MM + BLEED_MM) * PT_MM;
  const y0 = x0;
  const x1 = x0 + mm.w * PT_MM;
  const y1 = y0 + mm.h * PT_MM;
  const gap = BLEED_MM * PT_MM + 2;
  const len = (MARGEN_MM - 2) * PT_MM - 2;
  const linea = (ax: number, ay: number, bx: number, by: number) =>
    page.drawLine({ start: { x: ax, y: ay }, end: { x: bx, y: by }, thickness: 0.3, color: rgb(0, 0, 0) });
  for (const [x, dx] of [
    [x0, -1],
    [x1, 1],
  ] as const) {
    for (const [y, dy] of [
      [y0, -1],
      [y1, 1],
    ] as const) {
      linea(x + dx * gap, y, x + dx * (gap + len), y);
      linea(x, y + dy * gap, x, y + dy * (gap + len));
    }
  }
  const bytes = await pdf.save();
  return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}
