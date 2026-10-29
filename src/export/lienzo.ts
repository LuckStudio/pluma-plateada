// Motor del lienzo: maqueta versos sobre un fondo y los dibuja en un canvas,
// estático (imagen/PDF) o animado como si se escribieran a mano (vídeo).
import plumaUrl from '../assets/pluma.png';

export type FormatId = '3:4' | '1:1' | '4:5' | '9:16' | '16:9' | 'postal' | 'marca' | 'a5' | 'a4';
export type StyleId = 'plata' | 'papel' | 'noche' | 'tinta' | 'imagen';
export type FontId = 'cormorant' | 'caveat' | 'dancing' | 'inter';
export type Transicion = 'fundido' | 'tinta' | 'deslizar' | 'ninguna';
export type Velocidad = 'lenta' | 'normal' | 'rapida';

export interface Formato {
  id: FormatId;
  label: string;
  sub: string;
  w: number;
  h: number;
  mm?: { w: number; h: number }; // formatos de imprenta
}

const MM = 300 / 25.4; // px por mm a 300 ppp
const fmtMm = (id: FormatId, label: string, sub: string, w: number, h: number): Formato => ({
  id,
  label,
  sub,
  w: Math.round(w * MM),
  h: Math.round(h * MM),
  mm: { w, h },
});

export const FORMATOS: Formato[] = [
  { id: '3:4', label: '3:4', sub: 'Vertical · 1080×1440', w: 1080, h: 1440 },
  { id: '1:1', label: '1:1', sub: 'Cuadrado · 1080', w: 1080, h: 1080 },
  { id: '4:5', label: '4:5', sub: 'Post · 1080×1350', w: 1080, h: 1350 },
  { id: '9:16', label: '9:16', sub: 'Story, Reel, TikTok', w: 1080, h: 1920 },
  { id: '16:9', label: '16:9', sub: 'Horizontal · 1920×1080', w: 1920, h: 1080 },
  fmtMm('postal', 'Postal', 'A6 · 148×105 mm', 148, 105),
  fmtMm('marca', 'Marcapáginas', '50×200 mm', 50, 200),
  fmtMm('a5', 'Lámina A5', '148×210 mm', 148, 210),
  fmtMm('a4', 'Lámina A4', '210×297 mm', 210, 297),
];

export const FUENTES: Record<FontId, { label: string; family: string; weight: number; style: string; factor: number }> = {
  cormorant: { label: 'Clásica', family: 'Cormorant Garamond', weight: 500, style: 'italic', factor: 1 },
  caveat: { label: 'Manuscrita', family: 'Caveat', weight: 500, style: 'normal', factor: 1.12 },
  dancing: { label: 'Caligráfica', family: 'Dancing Script', weight: 500, style: 'normal', factor: 1.02 },
  inter: { label: 'Moderna', family: 'Inter', weight: 400, style: 'normal', factor: 0.86 },
};

interface Paleta {
  label: string;
  text: string;
  muted: string;
  base: string; // color de entrada/salida
  feather: number; // opacidad de la pluma decorativa
}

export const ESTILOS: Record<StyleId, Paleta> = {
  plata: { label: 'Plata', text: '#101623', muted: '#3b4558', base: '#eef1f6', feather: 0.42 },
  papel: { label: 'Papel', text: '#1d1a15', muted: '#5b5348', base: '#f2eee5', feather: 0.3 },
  noche: { label: 'Noche', text: '#eef1f7', muted: '#a3acbd', base: '#070a12', feather: 0.75 },
  tinta: { label: 'Tinta', text: '#f3f1ff', muted: '#bdb7e6', base: '#0b0a1a', feather: 0.6 },
  imagen: { label: 'Tu imagen', text: '#ffffff', muted: 'rgba(255,255,255,0.8)', base: '#000000', feather: 0.5 },
};

export interface LienzoOpts {
  format: FormatId;
  style: StyleId;
  font: FontId;
  align: 'left' | 'center';
  scale: number;
  lines: string[];
  title: string;
  showTitle: boolean;
  signature: string;
  showFeather: boolean;
  bgImage?: HTMLImageElement | null;
}

export interface VideoOpts {
  entrada: Transicion;
  salida: Transicion;
  velocidad: Velocidad;
  pluma: boolean;
  pausa: number; // segundos con el texto completo antes de salir
}

export const DEFAULT_VIDEO: VideoOpts = { entrada: 'tinta', salida: 'fundido', velocidad: 'normal', pluma: true, pausa: 2.5 };

// ───────── Recursos ─────────

let plumaImg: HTMLImageElement | null = null;
export function cargarPluma(): Promise<HTMLImageElement> {
  if (plumaImg?.complete) return Promise.resolve(plumaImg);
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res((plumaImg = img));
    img.onerror = rej;
    img.src = plumaUrl;
  });
}

export async function cargarFuentes(font: FontId) {
  const f = FUENTES[font];
  try {
    await Promise.all([
      document.fonts.load(`${f.style} ${f.weight} 40px "${f.family}"`),
      document.fonts.load(`500 20px "Inter"`),
      document.fonts.load(`italic 500 20px "Cormorant Garamond"`),
    ]);
  } catch {
    /* se usará la fuente de reserva */
  }
}

let grano: HTMLCanvasElement | null = null;
function texturaPapel() {
  if (grano) return grano;
  grano = document.createElement('canvas');
  grano.width = grano.height = 256;
  const g = grano.getContext('2d')!;
  const img = g.createImageData(256, 256);
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 120 + rnd() * 60;
    img.data[i] = v;
    img.data[i + 1] = v * 0.97;
    img.data[i + 2] = v * 0.9;
    img.data[i + 3] = rnd() * 22;
  }
  g.putImageData(img, 0, 0);
  return grano;
}

// ───────── Maquetación ─────────

interface LineaMaq {
  text: string;
  x: number; // borde izquierdo
  y: number; // línea base
  w: number;
  cum: number[]; // anchura acumulada por carácter
  t0: number; // tiempos de escritura (s, relativos al inicio de la escritura)
  t1: number;
  times: number[]; // fin de cada carácter
}

export interface Maqueta {
  W: number;
  H: number;
  font: string;
  size: number;
  lineH: number;
  lineas: LineaMaq[];
  title?: { text: string; x: number; y: number; font: string };
  sign?: { text: string; x: number; y: number; font: string };
  paleta: Paleta;
  escritura: number; // duración total de la escritura (s)
}

const VELOCIDAD: Record<Velocidad, number> = { lenta: 9, normal: 15, rapida: 24 };

function fuenteCss(font: FontId, size: number) {
  const f = FUENTES[font];
  return `${f.style} ${f.weight} ${size}px "${f.family}", Georgia, serif`;
}

function partir(ctx: CanvasRenderingContext2D, texto: string, maxW: number): string[] {
  if (ctx.measureText(texto).width <= maxW) return [texto];
  const palabras = texto.split(/(\s+)/);
  const out: string[] = [];
  let cur = '';
  for (const p of palabras) {
    const prueba = cur + p;
    if (cur.trim() && ctx.measureText(prueba).width > maxW) {
      out.push(cur.trimEnd());
      cur = p.trimStart();
    } else cur = prueba;
  }
  if (cur.trim()) out.push(cur.trimEnd());
  return out;
}

export function maquetar(ctx: CanvasRenderingContext2D, o: LienzoOpts, W: number, H: number, bleed = 0, velocidad: Velocidad = 'normal'): Maqueta {
  const paleta = ESTILOS[o.style];
  const pad = Math.round(Math.min(W - 2 * bleed, H - 2 * bleed) * 0.1) + bleed;
  const maxW = W - 2 * pad;
  const f = FUENTES[o.font];
  // Recorta líneas en blanco al principio y al final.
  const versos = [...o.lines];
  while (versos.length && !versos[0].trim()) versos.shift();
  while (versos.length && !versos[versos.length - 1].trim()) versos.pop();

  let size = Math.min(W, H) * 0.062 * o.scale * f.factor;
  const longest = Math.max(1, ...versos.map((v) => v.length));
  // Arranque razonable según la longitud del verso más largo.
  size = Math.min(size, (maxW / (longest * 0.42)) * f.factor);

  for (let intento = 0; intento < 40; intento++) {
    ctx.font = fuenteCss(o.font, size);
    const lineH = size * (o.font === 'inter' ? 1.5 : 1.38);
    const gap = lineH * 0.55;
    const filas: { text: string; gapBefore: number; indent: number }[] = [];
    let pendienteGap = 0;
    versos.forEach((v) => {
      if (!v.trim()) {
        pendienteGap = gap;
        return;
      }
      const sangria = (v.match(/^[\s ]+/)?.[0].length ?? 0) * size * 0.5;
      const partes = partir(ctx, v.trim(), maxW - sangria);
      partes.forEach((p, i) => {
        filas.push({ text: p, gapBefore: i === 0 ? pendienteGap : 0, indent: sangria + (i > 0 && o.align === 'left' ? size * 0.9 : 0) });
        pendienteGap = 0;
      });
    });

    const titleSize = Math.max(14, size * 0.42);
    const signSize = Math.max(14, size * 0.55);
    const titleH = o.showTitle && o.title ? titleSize * 3.2 : 0;
    const signH = o.signature ? signSize * 2.6 : 0;
    const textoH = filas.reduce((a, r) => a + r.gapBefore + lineH, 0);
    const total = titleH + textoH + signH;
    if (total > H - 2 * pad && size > 10) {
      size *= 0.94;
      continue;
    }

    let y = (H - total) / 2 - H * 0.015;
    const res: Maqueta = { W, H, font: ctx.font, size, lineH, lineas: [], paleta, escritura: 0 };
    if (titleH) {
      const font = `600 ${titleSize}px Inter, sans-serif`;
      res.title = { text: o.title.toUpperCase(), x: o.align === 'center' ? W / 2 : pad, y: y + titleSize, font };
      y += titleH;
    }
    // Tiempos de escritura: cada carácter tarda según su anchura; pausas al final de verso y estrofa.
    const cps = VELOCIDAD[velocidad];
    const media = size * 0.42;
    let t = 0;
    ctx.font = fuenteCss(o.font, size);
    filas.forEach((r) => {
      y += r.gapBefore;
      if (r.gapBefore) t += 0.45;
      const w = ctx.measureText(r.text).width;
      const x = o.align === 'center' ? (W - w) / 2 : pad + r.indent;
      const cum: number[] = [0];
      const times: number[] = [];
      const t0 = t;
      for (let i = 1; i <= r.text.length; i++) {
        cum.push(ctx.measureText(r.text.slice(0, i)).width);
        const cw = cum[i] - cum[i - 1];
        const ch = r.text[i - 1];
        t += ch === ' ' ? 0.6 / cps : Math.max(0.35, cw / media) / cps;
        times.push(t);
      }
      res.lineas.push({ text: r.text, x, y: y + size, w, cum, t0, t1: t, times });
      y += lineH;
      t += 0.3;
    });
    res.escritura = t;
    if (signH) {
      const font = `italic 500 ${signSize}px "Cormorant Garamond", Georgia, serif`;
      res.sign = { text: `— ${o.signature}`, x: o.align === 'center' ? W / 2 : pad, y: y + signSize * 1.6, font };
    }
    return res;
  }
  // Inalcanzable en la práctica: devuelve una maqueta vacía.
  return { W, H, font: ctx.font, size, lineH: size, lineas: [], paleta, escritura: 0 };
}

// ───────── Dibujo ─────────

function fondo(ctx: CanvasRenderingContext2D, o: LienzoOpts, W: number, H: number) {
  const d = Math.max(W, H);
  if (o.style === 'noche') {
    const g = ctx.createRadialGradient(W * 0.7, H * 0.25, 0, W * 0.7, H * 0.25, d);
    g.addColorStop(0, '#1d2a47');
    g.addColorStop(0.55, '#0b1120');
    g.addColorStop(1, '#05070d');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  } else if (o.style === 'plata') {
    const g = ctx.createLinearGradient(0, 0, W * 0.6, H);
    g.addColorStop(0, '#f6f8fb');
    g.addColorStop(0.6, '#d3d9e3');
    g.addColorStop(1, '#a9b2c2');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  } else if (o.style === 'papel') {
    ctx.fillStyle = '#f2eee5';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = ctx.createPattern(texturaPapel(), 'repeat')!;
    ctx.fillRect(0, 0, W, H);
    const v = ctx.createRadialGradient(W / 2, H / 2, d * 0.3, W / 2, H / 2, d * 0.8);
    v.addColorStop(0, 'rgba(120,90,50,0)');
    v.addColorStop(1, 'rgba(120,90,50,0.12)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
  } else if (o.style === 'tinta') {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#0b1020');
    g.addColorStop(0.55, '#1b1640');
    g.addColorStop(1, '#0c2a33');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const blob = (x: number, y: number, r: number, c: string) => {
      const b = ctx.createRadialGradient(x, y, 0, x, y, r);
      b.addColorStop(0, c);
      b.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = b;
      ctx.fillRect(0, 0, W, H);
    };
    blob(W * 0.15, H * 0.85, d * 0.45, 'rgba(99,230,226,0.16)');
    blob(W * 0.85, H * 0.15, d * 0.5, 'rgba(212,140,242,0.16)');
    blob(W * 0.6, H * 0.6, d * 0.35, 'rgba(143,134,255,0.12)');
  } else {
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, W, H);
    const img = o.bgImage;
    if (img && img.naturalWidth) {
      const s = Math.max(W / img.naturalWidth, H / img.naturalHeight);
      const iw = img.naturalWidth * s;
      const ih = img.naturalHeight * s;
      ctx.drawImage(img, (W - iw) / 2, (H - ih) / 2, iw, ih);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.fillRect(0, 0, W, H);
  }
}

// Pluma decorativa: asoma desde la esquina superior derecha, fuera de la zona de texto.
function plumaDecorativa(ctx: CanvasRenderingContext2D, o: LienzoOpts, W: number, H: number, alpha = 1) {
  if (!o.showFeather || !plumaImg) return;
  const h = Math.min(W, H) * 0.62;
  const w = (plumaImg.naturalWidth / plumaImg.naturalHeight) * h;
  ctx.save();
  ctx.globalAlpha = ESTILOS[o.style].feather * alpha;
  ctx.translate(W + w * 0.15, -h * 0.12);
  ctx.rotate((40 * Math.PI) / 180);
  ctx.drawImage(plumaImg, -w / 2, 0, w, h);
  ctx.restore();
}

// Pluma que escribe: la punta (gota de tinta) va en (x, y).
function plumaEscribiendo(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  if (!plumaImg) return;
  const h = size * 5;
  const w = (plumaImg.naturalWidth / plumaImg.naturalHeight) * h;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((22 * Math.PI) / 180);
  // En la imagen, la punta está abajo, ligeramente a la izquierda del centro.
  ctx.drawImage(plumaImg, -w * 0.09, -h * 0.985, w, h);
  ctx.restore();
}

export interface FrameState {
  t: number; // segundos desde el inicio (Infinity = estático)
  v?: VideoOpts;
}

export function duracionVideo(m: Maqueta, v: VideoOpts) {
  const entrada = v.entrada === 'ninguna' ? 0.2 : 0.9;
  const salida = v.salida === 'ninguna' ? 0.2 : 0.9;
  return entrada + 0.3 + m.escritura + 0.6 + v.pausa + salida;
}

const ease = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

export function dibujar(ctx: CanvasRenderingContext2D, o: LienzoOpts, m: Maqueta, s: FrameState = { t: Infinity }) {
  const { W, H, paleta } = m;
  const v = s.v;
  const estatico = !isFinite(s.t) || !v;
  const entrada = v && v.entrada !== 'ninguna' ? 0.9 : 0.2;
  const total = v ? duracionVideo(m, v) : 0;
  const salidaDur = v && v.salida !== 'ninguna' ? 0.9 : 0.2;
  const tEscritura = estatico ? Infinity : s.t - entrada - 0.3;
  const pIn = estatico ? 1 : ease(Math.min(1, s.t / entrada));
  const pOut = estatico ? 0 : ease(Math.max(0, Math.min(1, (s.t - (total - salidaDur)) / salidaDur)));

  ctx.save();
  fondo(ctx, o, W, H);
  plumaDecorativa(ctx, o, W, H, !estatico && v?.pluma ? 0.5 : 1);

  // Contenido (título, versos, firma) con el desplazamiento de las transiciones.
  ctx.save();
  let alphaContenido = 1;
  if (!estatico && v) {
    if (v.entrada === 'deslizar' && pIn < 1) {
      ctx.translate(0, (1 - pIn) * H * 0.06);
      alphaContenido *= pIn;
    }
    if (v.salida === 'deslizar' && pOut > 0) {
      ctx.translate(0, -pOut * H * 0.06);
      alphaContenido *= 1 - pOut;
    }
  }
  ctx.globalAlpha = alphaContenido;
  ctx.textBaseline = 'alphabetic';
  if (m.title) {
    ctx.font = m.title.font;
    ctx.fillStyle = paleta.muted;
    ctx.textAlign = o.align === 'center' ? 'center' : 'left';
    ctx.letterSpacing = `${Math.round(m.size * 0.08)}px`;
    ctx.fillText(m.title.text, m.title.x, m.title.y);
    ctx.letterSpacing = '0px';
  }
  ctx.font = m.font;
  ctx.fillStyle = paleta.text;
  ctx.textAlign = 'left';
  let pen: { x: number; y: number } | null = null;
  for (const l of m.lineas) {
    if (tEscritura >= l.t1) {
      ctx.fillText(l.text, l.x, l.y);
      continue;
    }
    if (tEscritura <= l.t0) break;
    // Línea a medias: recorta hasta el punto que va escribiendo la pluma.
    let k = 0;
    while (k < l.times.length && l.times[k] <= tEscritura) k++;
    const prevT = k === 0 ? l.t0 : l.times[k - 1];
    const frac = k < l.times.length ? (tEscritura - prevT) / (l.times[k] - prevT) : 1;
    const revealW = l.cum[k] + (l.cum[Math.min(k + 1, l.cum.length - 1)] - l.cum[k]) * Math.max(0, Math.min(1, frac));
    ctx.save();
    ctx.beginPath();
    ctx.rect(l.x - m.size, l.y - m.size * 1.3, revealW + m.size, m.size * 2);
    ctx.clip();
    ctx.fillText(l.text, l.x, l.y);
    ctx.restore();
    pen = { x: l.x + revealW, y: l.y - m.size * 0.18 };
  }
  if (m.sign) {
    const signAlpha = estatico ? 1 : Math.max(0, Math.min(1, (tEscritura - m.escritura) / 0.6));
    if (signAlpha > 0) {
      ctx.globalAlpha = alphaContenido * signAlpha;
      ctx.font = m.sign.font;
      ctx.fillStyle = paleta.muted;
      ctx.textAlign = o.align === 'center' ? 'center' : 'left';
      ctx.fillText(m.sign.text, m.sign.x, m.sign.y);
    }
  }
  ctx.restore();
  if (pen && v?.pluma) plumaEscribiendo(ctx, pen.x, pen.y, m.size);

  // Transiciones que cubren todo el cuadro.
  if (!estatico && v) {
    transicion(ctx, W, H, paleta.base, v.entrada, 1 - pIn, 'in');
    transicion(ctx, W, H, paleta.base, v.salida, pOut, 'out');
  }
  ctx.restore();
}

function transicion(ctx: CanvasRenderingContext2D, W: number, H: number, base: string, tipo: Transicion, cubierto: number, fase: 'in' | 'out') {
  if (cubierto <= 0.001 || tipo === 'ninguna' || tipo === 'deslizar') {
    if (tipo === 'deslizar' && cubierto > 0) {
      ctx.save();
      ctx.globalAlpha = cubierto * 0.85;
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    return;
  }
  ctx.save();
  if (tipo === 'fundido') {
    ctx.globalAlpha = cubierto;
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, W, H);
  } else {
    // Tinta: un círculo que se abre (entrada) o se cierra (salida) con borde holográfico.
    const R = Math.hypot(W, H) / 2;
    const r = R * (1 - cubierto);
    const cx = W / 2;
    const cy = fase === 'in' ? H * 0.55 : H * 0.45;
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.arc(cx, cy, Math.max(0, r), 0, Math.PI * 2, true);
    ctx.fillStyle = base;
    ctx.fill('evenodd');
    if (r > 1) {
      const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
      g.addColorStop(0, '#63e6e2');
      g.addColorStop(0.5, '#8f86ff');
      g.addColorStop(1, '#d48cf2');
      ctx.strokeStyle = g;
      ctx.lineWidth = Math.max(4, Math.min(W, H) * 0.012);
      ctx.globalAlpha = Math.min(1, cubierto * 3);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
}

export function formato(id: FormatId) {
  return FORMATOS.find((f) => f.id === id)!;
}
