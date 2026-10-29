// Motor del lienzo: maqueta versos sobre un fondo y los dibuja en un canvas,
// estático (imagen/PDF) o animado como si se escribieran a mano (vídeo).
import plumaUrl from '../assets/pluma.png';

export type FormatId = '3:4' | '1:1' | '4:5' | '9:16' | '16:9' | 'postal' | 'marca' | 'a5' | 'a4';
export type StyleId = 'plata' | 'papel' | 'noche' | 'tinta' | 'imagen';
export type FontId = 'cormorant' | 'caveat' | 'dancing' | 'inter';
export type Animacion = 'fundido' | 'ascenso' | 'palabras';
export type Ritmo = 'tranquilo' | 'normal' | 'rapido';

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
  noche: { label: 'Noche', text: '#f3f5fa', muted: '#b9c3d8', base: '#070a12', feather: 0.8 },
  tinta: { label: 'Tinta', text: '#f8f6ff', muted: '#d2ccf5', base: '#0b0a1a', feather: 0.7 },
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
  animacion: Animacion; // cómo aparece cada verso
  ritmo: Ritmo;
  salida: 'fundido' | 'ninguna';
  pausa: number; // segundos con el poema completo antes de salir
}

export const DEFAULT_VIDEO: VideoOpts = { animacion: 'ascenso', ritmo: 'normal', salida: 'fundido', pausa: 2.5 };

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
  palabras: { text: string; x: number }[]; // para la animación palabra a palabra
  estrofa: number;
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
}

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

export function maquetar(ctx: CanvasRenderingContext2D, o: LienzoOpts, W: number, H: number, bleed = 0): Maqueta {
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
    const filas: { text: string; gapBefore: number; indent: number; estrofa: number }[] = [];
    let pendienteGap = 0;
    let estrofa = 0;
    versos.forEach((v) => {
      if (!v.trim()) {
        if (!pendienteGap) estrofa++;
        pendienteGap = gap;
        return;
      }
      const sangria = (v.match(/^[\s\u2003]+/)?.[0].length ?? 0) * size * 0.5;
      const partes = partir(ctx, v.trim(), maxW - sangria);
      partes.forEach((p, i) => {
        filas.push({ text: p, gapBefore: i === 0 ? pendienteGap : 0, indent: sangria + (i > 0 && o.align === 'left' ? size * 0.9 : 0), estrofa });
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
    const res: Maqueta = { W, H, font: ctx.font, size, lineH, lineas: [], paleta };
    if (titleH) {
      const font = `600 ${titleSize}px Inter, sans-serif`;
      res.title = { text: o.title.toUpperCase(), x: o.align === 'center' ? W / 2 : pad, y: y + titleSize, font };
      y += titleH;
    }
    ctx.font = fuenteCss(o.font, size);
    filas.forEach((r) => {
      y += r.gapBefore;
      const w = ctx.measureText(r.text).width;
      const x = o.align === 'center' ? (W - w) / 2 : pad + r.indent;
      const palabras: { text: string; x: number }[] = [];
      const re = /\S+/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(r.text))) palabras.push({ text: m[0], x: x + ctx.measureText(r.text.slice(0, m.index)).width });
      res.lineas.push({ text: r.text, x, y: y + size, w, palabras, estrofa: r.estrofa });
      y += lineH;
    });
    if (signH) {
      const font = `italic 500 ${signSize}px "Cormorant Garamond", Georgia, serif`;
      res.sign = { text: o.signature, x: o.align === 'center' ? W / 2 : pad, y: y + signSize * 1.6, font };
    }
    return res;
  }
  // Inalcanzable en la práctica: devuelve una maqueta vacía.
  return { W, H, font: ctx.font, size, lineH: size, lineas: [], paleta };
}

// ───────── Dibujo ─────────

export function fondo(ctx: CanvasRenderingContext2D, o: Pick<LienzoOpts, "style" | "bgImage">, W: number, H: number) {
  const d = Math.max(W, H);
  if (o.style === 'noche') {
    const g = ctx.createRadialGradient(W * 0.72, H * 0.18, 0, W * 0.72, H * 0.18, d * 1.05);
    g.addColorStop(0, '#2f4677');
    g.addColorStop(0.45, '#14203d');
    g.addColorStop(1, '#070b16');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // Un velo plateado en diagonal, como la luz de la luna sobre el papel.
    const luz = ctx.createLinearGradient(0, 0, W, H);
    luz.addColorStop(0, 'rgba(205,216,234,0.10)');
    luz.addColorStop(0.5, 'rgba(205,216,234,0)');
    luz.addColorStop(1, 'rgba(205,216,234,0.06)');
    ctx.fillStyle = luz;
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
    g.addColorStop(0, '#151236');
    g.addColorStop(0.55, '#26195a');
    g.addColorStop(1, '#0e3140');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const blob = (x: number, y: number, r: number, c: string) => {
      const b = ctx.createRadialGradient(x, y, 0, x, y, r);
      b.addColorStop(0, c);
      b.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = b;
      ctx.fillRect(0, 0, W, H);
    };
    blob(W * 0.12, H * 0.88, d * 0.55, 'rgba(99,230,226,0.30)');
    blob(W * 0.9, H * 0.12, d * 0.55, 'rgba(212,140,242,0.30)');
    blob(W * 0.55, H * 0.55, d * 0.4, 'rgba(143,134,255,0.20)');
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

export interface FrameState {
  t: number; // segundos desde el inicio (Infinity = estático)
  v?: VideoOpts;
}

const PASO: Record<Ritmo, number> = { tranquilo: 1.05, normal: 0.62, rapido: 0.38 };
const ENTRADA = 0.55; // el fondo, el título y la pluma decorativa aparecen primero

// Momento en que empieza a aparecer cada verso.
function tiempos(m: Maqueta, v: VideoOpts) {
  const paso = PASO[v.ritmo];
  const dur = Math.min(1.1, Math.max(0.45, paso * 1.5));
  let t = ENTRADA;
  const inicios = m.lineas.map((l, i) => {
    if (i > 0 && l.estrofa !== m.lineas[i - 1].estrofa) t += paso * 0.7;
    const inicio = t;
    // Palabra a palabra: el verso dura según sus palabras.
    t += v.animacion === 'palabras' ? Math.max(paso, l.palabras.length * paso * 0.28) : paso;
    return inicio;
  });
  const ultimo = m.lineas.length ? inicios[inicios.length - 1] + (v.animacion === 'palabras' ? m.lineas[m.lineas.length - 1].palabras.length * paso * 0.28 : 0) + dur : ENTRADA;
  return { inicios, dur, fin: ultimo };
}

export function duracionVideo(m: Maqueta, v: VideoOpts) {
  const { fin } = tiempos(m, v);
  return fin + (m.sign ? 0.5 : 0) + v.pausa + (v.salida === 'fundido' ? 0.9 : 0.15);
}

const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function dibujar(ctx: CanvasRenderingContext2D, o: LienzoOpts, m: Maqueta, s: FrameState = { t: Infinity }) {
  const { W, H, paleta } = m;
  const v = s.v;
  const estatico = !isFinite(s.t) || !v;
  const tl = v ? tiempos(m, v) : null;
  const total = v ? duracionVideo(m, v) : 0;
  // Salida: el texto se funde sobre el fondo, que permanece.
  const salida = !estatico && v!.salida === 'fundido' ? clamp01((s.t - (total - 0.9)) / 0.9) : 0;
  const general = 1 - easeOut(salida);
  const intro = estatico ? 1 : easeOut(clamp01(s.t / ENTRADA));

  ctx.save();
  fondo(ctx, o, W, H);
  plumaDecorativa(ctx, o, W, H, intro);

  ctx.textBaseline = 'alphabetic';
  if (m.title) {
    ctx.globalAlpha = intro * general;
    ctx.font = m.title.font;
    ctx.fillStyle = paleta.muted;
    ctx.textAlign = o.align === 'center' ? 'center' : 'left';
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${Math.round(m.size * 0.08)}px`;
    ctx.fillText(m.title.text, m.title.x, m.title.y + (1 - intro) * m.size * 0.3);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  }
  ctx.font = m.font;
  ctx.fillStyle = paleta.text;
  ctx.textAlign = 'left';
  m.lineas.forEach((l, i) => {
    if (estatico) {
      ctx.globalAlpha = 1;
      ctx.fillText(l.text, l.x, l.y);
      return;
    }
    const inicio = tl!.inicios[i];
    if (s.t <= inicio) return;
    if (v!.animacion === 'palabras') {
      const paso = PASO[v!.ritmo] * 0.28;
      l.palabras.forEach((p, k) => {
        const q = easeOut(clamp01((s.t - inicio - k * paso) / (tl!.dur * 0.8)));
        if (q <= 0) return;
        ctx.globalAlpha = q * general;
        ctx.fillText(p.text, p.x, l.y + (1 - q) * m.size * 0.35);
      });
      return;
    }
    const q = easeOut(clamp01((s.t - inicio) / tl!.dur));
    ctx.globalAlpha = q * general;
    const dy = v!.animacion === 'ascenso' ? (1 - q) * m.size * 0.7 : (1 - q) * m.size * 0.12;
    const dx = v!.animacion === 'ascenso' ? 0 : (1 - q) * -m.size * 0.25;
    ctx.fillText(l.text, l.x + dx, l.y + dy);
  });
  if (m.sign) {
    const q = estatico ? 1 : easeOut(clamp01((s.t - tl!.fin) / 0.6));
    if (q > 0) {
      ctx.globalAlpha = q * general;
      ctx.font = m.sign.font;
      ctx.fillStyle = paleta.muted;
      ctx.textAlign = o.align === 'center' ? 'center' : 'left';
      ctx.fillText(m.sign.text, m.sign.x, m.sign.y);
    }
  }
  ctx.restore();
}

export function formato(id: FormatId) {
  return FORMATOS.find((f) => f.id === id)!;
}
