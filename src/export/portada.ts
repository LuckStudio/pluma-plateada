// Cubierta y contracubierta del poemario, dibujadas en canvas (vista previa, PDF, PNG y ePub).
import type { LibroCompleto } from '../db/db';
import { ESTILOS, FUENTES, cargarFuentes, cargarPluma, fondo, type StyleId } from './lienzo';

export type Cara = 'front' | 'back';

const imagenes = new Map<string, Promise<HTMLImageElement>>();
export function cargarImagen(src: string) {
  if (!src) return Promise.resolve(null);
  if (!imagenes.has(src)) {
    imagenes.set(
      src,
      new Promise((res, rej) => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = rej;
        img.src = src;
      }),
    );
  }
  return imagenes.get(src)!;
}

// Luminancia relativa para decidir texto claro u oscuro sobre un color libre.
function esClaro(hex: string) {
  const n = parseInt(hex.replace('#', ''), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4;
}

export function paletaCubierta(b: LibroCompleto) {
  const c = b.cover;
  if (c.style === 'color') {
    const claro = esClaro(c.color);
    return { text: claro ? '#151a24' : '#f6f7fb', muted: claro ? 'rgba(21,26,36,0.7)' : 'rgba(246,247,251,0.78)', feather: claro ? 0.4 : 0.7 };
  }
  const p = ESTILOS[c.style as StyleId];
  return { text: p.text, muted: p.muted, feather: p.feather };
}

function partir(ctx: CanvasRenderingContext2D, texto: string, maxW: number) {
  const out: string[] = [];
  texto.split('\n').forEach((par) => {
    let cur = '';
    par.split(/\s+/).forEach((w) => {
      const prueba = cur ? `${cur} ${w}` : w;
      if (cur && ctx.measureText(prueba).width > maxW) {
        out.push(cur);
        cur = w;
      } else cur = prueba;
    });
    out.push(cur);
  });
  return out;
}

export async function prepararCubierta(b: LibroCompleto) {
  await Promise.all([cargarPluma(), cargarFuentes(b.cover.font), document.fonts.load('500 20px "Inter"'), document.fonts.load('italic 400 20px "Cormorant Garamond"')]);
  return b.cover.style === 'imagen' && b.cover.image ? await cargarImagen(b.cover.image).catch(() => null) : null;
}

export function dibujarCubierta(ctx: CanvasRenderingContext2D, b: LibroCompleto, W: number, H: number, cara: Cara, img: HTMLImageElement | null, pluma: HTMLImageElement | null) {
  const c = b.cover;
  const pal = paletaCubierta(b);
  ctx.save();
  // Fondo.
  if (c.style === 'color') {
    ctx.fillStyle = c.color;
    ctx.fillRect(0, 0, W, H);
    const v = ctx.createRadialGradient(W * 0.7, H * 0.2, 0, W * 0.7, H * 0.2, Math.max(W, H));
    v.addColorStop(0, 'rgba(255,255,255,0.10)');
    v.addColorStop(1, 'rgba(0,0,0,0.12)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
  } else {
    fondo(ctx, { style: c.style as StyleId, bgImage: img }, W, H);
  }
  const pad = W * 0.11;

  // Pluma decorativa: en la cubierta cruza en diagonal; en la contracubierta asoma discreta.
  if (c.feather && pluma) {
    const h = cara === 'front' ? H * 0.78 : H * 0.42;
    const w = (pluma.naturalWidth / pluma.naturalHeight) * h;
    ctx.save();
    ctx.globalAlpha = pal.feather * (cara === 'front' ? 1 : 0.5);
    if (cara === 'front') {
      ctx.translate(W * 0.72, H * (c.layout === 'arriba' ? 0.3 : 0.08));
      ctx.rotate((24 * Math.PI) / 180);
    } else {
      ctx.translate(W * 0.1, H * 0.62);
      ctx.rotate((-20 * Math.PI) / 180);
    }
    ctx.drawImage(pluma, -w / 2, 0, w, h);
    ctx.restore();
  }

  ctx.textBaseline = 'alphabetic';
  if (cara === 'front') {
    const f = FUENTES[c.font];
    let size = W * 0.12 * f.factor;
    let lineas: string[] = [];
    for (let i = 0; i < 30; i++) {
      ctx.font = `${f.style === 'italic' ? 'normal' : f.style} ${c.font === 'inter' ? 600 : 500} ${size}px "${f.family}", Georgia, serif`;
      lineas = partir(ctx, b.title || 'Sin título', W - pad * 2);
      if (lineas.length <= 4 && lineas.every((l) => ctx.measureText(l).width <= W - pad * 2)) break;
      size *= 0.92;
    }
    const lh = size * 1.08;
    const subSize = W * 0.046;
    const bloque = lineas.length * lh + (b.subtitle ? subSize * 2.2 : 0);
    const y0 = c.layout === 'arriba' ? H * 0.16 : c.layout === 'abajo' ? H * 0.82 - bloque : (H - bloque) / 2 - H * 0.03;
    ctx.fillStyle = pal.text;
    ctx.textAlign = 'left';
    lineas.forEach((l, i) => ctx.fillText(l, pad, y0 + size + i * lh));
    if (b.subtitle) {
      ctx.font = `italic 400 ${subSize}px "Cormorant Garamond", Georgia, serif`;
      ctx.fillStyle = pal.muted;
      ctx.fillText(b.subtitle, pad, y0 + lineas.length * lh + subSize * 1.5);
    }
    // Autor arriba si el título va abajo; si no, al pie.
    const autorY = c.layout === 'abajo' ? H * 0.1 : H - pad * 0.95;
    ctx.font = `500 ${W * 0.034}px Inter, sans-serif`;
    ctx.fillStyle = pal.text;
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${(W * 0.006).toFixed(1)}px`;
    if (b.author) ctx.fillText(b.author.toUpperCase(), pad, autorY);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  } else {
    // Contracubierta: sinopsis, biografía, editorial y hueco para el código de barras.
    let y = pad * 1.3;
    const ancho = W - pad * 2;
    if (b.back.blurb.trim()) {
      const s = W * 0.044;
      ctx.font = `italic 400 ${s}px "Cormorant Garamond", Georgia, serif`;
      ctx.fillStyle = pal.text;
      partir(ctx, b.back.blurb.trim(), ancho).forEach((l) => {
        y += s * 1.4;
        ctx.fillText(l, pad, y);
      });
      y += s * 1.2;
    }
    if (b.back.bio.trim()) {
      ctx.strokeStyle = pal.muted;
      ctx.lineWidth = Math.max(1, W * 0.002);
      ctx.beginPath();
      ctx.moveTo(pad, y);
      ctx.lineTo(pad + W * 0.12, y);
      ctx.stroke();
      const s = W * 0.032;
      ctx.font = `400 ${s}px Inter, sans-serif`;
      ctx.fillStyle = pal.muted;
      partir(ctx, b.back.bio.trim(), ancho).forEach((l) => {
        y += s * 1.55;
        ctx.fillText(l, pad, y);
      });
    }
    const pie = H - pad * 0.95;
    ctx.font = `500 ${W * 0.03}px Inter, sans-serif`;
    ctx.fillStyle = pal.muted;
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${(W * 0.004).toFixed(1)}px`;
    ctx.fillText((b.legal.publisher || b.author || '').toUpperCase(), pad, pie);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    if (b.back.barcode) {
      const bw = W * 0.34;
      const bh = W * 0.19;
      const bx = W - pad - bw;
      const by = H - pad * 0.6 - bh;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = '#5b6070';
      ctx.font = `500 ${W * 0.022}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(b.legal.isbn ? `ISBN ${b.legal.isbn}` : 'Código de barras', bx + bw / 2, by + bh / 2 + W * 0.008);
    }
  }
  ctx.restore();
}

// Cubierta como imagen (PNG o JPEG) a la resolución pedida.
export async function renderCubierta(b: LibroCompleto, cara: Cara, W: number, H: number, tipo: 'image/png' | 'image/jpeg' = 'image/png') {
  const img = await prepararCubierta(b);
  const pluma = await cargarPluma();
  const c = document.createElement('canvas');
  c.width = Math.round(W);
  c.height = Math.round(H);
  dibujarCubierta(c.getContext('2d')!, b, c.width, c.height, cara, img, pluma);
  return new Promise<Blob>((res, rej) => c.toBlob((x) => (x ? res(x) : rej(new Error('No se pudo crear la cubierta'))), tipo, 0.9));
}
