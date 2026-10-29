import * as THREE from 'three';

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Plata: el material es metálico, así que estos tonos actúan como color del reflejo.
const C = {
  deep: new THREE.Color('#7b8597'),
  mid: new THREE.Color('#bcc3cf'),
  pearl: new THREE.Color('#f6f8fc'),
  ice: new THREE.Color('#cdd8ea'),
};

// Color del vexilo en (x: largo 0..1, u: ancho 0..1 desde el raquis).
function colorAt(x, u, side, out) {
  out.copy(C.deep).lerp(C.mid, smooth(0, 0.55, x) * (1 - 0.35 * u) + 0.15);
  const pearl = (1 - smooth(0, 0.85, u)) * smooth(0.1, 0.45, x) * (1 - smooth(0.78, 1, x) * 0.6);
  out.lerp(C.pearl, pearl * (side < 0 ? 0.72 : 0.5));
  out.lerp(C.deep, smooth(0.7, 1, u) * 0.25);
  out.lerp(C.ice, smooth(0.74, 1, x) * 0.6);
  // Manchas suaves de baja frecuencia: la pluma real nunca es un degradado perfecto.
  const m = Math.sin(x * 7 + u * 3 + side) * 0.5 + Math.sin(x * 17 - u * 5 + side * 2) * 0.3;
  out.lerp(m > 0 ? C.pearl : C.deep, Math.abs(m) * 0.07);
  return out;
}

// Pinta un vexilo en la mitad [x0, x0+w) del canvas. Barbas horizontales (u a lo ancho, y a lo largo).
function paintVane(ctx, x0, w, h, side, rand, p) {
  const barbs = p.textureBarbs;
  const step = h / barbs;
  const col = new THREE.Color();
  const mirror = side > 0; // el raquis está en el borde interior de cada mitad
  const px = (u) => (mirror ? x0 + w - u * w : x0 + u * w);

  // Cortes naturales: la barba se separa del resto y deja un hueco fino.
  const splits = [];
  for (let i = 0; i < p.splits; i++) {
    splits.push({ at: Math.floor((0.2 + rand() * 0.65) * barbs), n: 1 + Math.floor(rand() * 2), from: 0.4 + rand() * 0.35 });
  }

  for (let i = 0; i < barbs; i++) {
    const x = i / barbs;
    const y = i * step;
    let uEnd = 0.96 - rand() * 0.07 - 0.03 * Math.sin(i * 0.4);
    const sp = splits.find((s) => i >= s.at && i < s.at + s.n);
    if (sp) uEnd = sp.from + rand() * 0.22;
    // Cerca de la base las barbas son sueltas: algunas faltan y las demás son finas.
    const loose = 1 - smooth(0, 0.1, x);
    if (loose > 0 && rand() < loose * 0.3) continue;
    const bh = step * (1.7 - loose * 0.4);
    const jitter = 1 + (rand() - 0.5) * 0.12;

    const g = ctx.createLinearGradient(px(0), 0, px(uEnd), 0);
    for (const t of [0, 0.25, 0.55, 0.8, 1]) {
      colorAt(x, t * uEnd, side, col);
      g.addColorStop(t, `rgb(${Math.min(255, Math.round(col.r ** (1 / 2.2) * 255 * jitter))},${Math.min(255, Math.round(col.g ** (1 / 2.2) * 255 * jitter))},${Math.min(255, Math.round(col.b ** (1 / 2.2) * 255 * jitter))})`);
    }
    ctx.fillStyle = g;
    const a = Math.min(px(0), px(uEnd));
    ctx.fillRect(a - 1, y, Math.abs(px(uEnd) - px(0)) + 2, bh);
  }

  // Bárbulas: trazos finísimos, ligeramente oblicuos, que dan el aspecto sedoso.
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, 0, w, h);
  ctx.clip();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.lineWidth = 0.7;
  for (let k = 0; k < p.textureStrokes; k++) {
    const u = rand() * 0.97;
    const y = rand() * h;
    const len = 8 + rand() * 22;
    const ang = (rand() - 0.5) * 0.5;
    const dx = Math.cos(ang) * len * (mirror ? -1 : 1);
    ctx.strokeStyle = rand() < 0.55 ? `rgba(255,255,255,${0.05 + rand() * 0.1})` : `rgba(20,25,60,${0.06 + rand() * 0.12})`;
    ctx.beginPath();
    ctx.moveTo(px(u), y);
    ctx.lineTo(px(u) + dx, y + Math.sin(ang) * len);
    ctx.stroke();
  }
  ctx.restore();
}

// Atlas 2:1: mitad izquierda = vexilo izquierdo (side > 0), mitad derecha = vexilo derecho (side < 0).
export function paintVaneAtlas(canvas, p, rand) {
  const W = p.textureSize;
  const H = p.textureSize;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  paintVane(ctx, 0, W / 2, H, 1, rand, p);
  paintVane(ctx, W / 2, W / 2, H, -1, rand, p);
  return canvas;
}
