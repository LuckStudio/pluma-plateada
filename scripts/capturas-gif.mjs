// GIF de la animación de vídeo del lienzo para el README.
//   node scripts/capturas-gif.mjs <carpeta-de-fotogramas>
//   ffmpeg -framerate 15 -i <carpeta>/f%04d.png -vf "scale=360:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse" docs/capturas/rrss-video-noche.gif
import { createRequire } from 'node:module';
import fs from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const D = process.argv[2];
const b = await chromium.launch();
const p = await b.newPage();
await p.goto('http://localhost:5199/');
await p.waitForTimeout(800);
const frames = await p.evaluate(async () => {
  const L = await import('/src/export/lienzo.ts');
  const { EJEMPLO } = await import('/src/db/db.ts');
  const o = { format: '3:4', style: 'noche', font: 'cormorant', align: 'left', scale: 1, lines: EJEMPLO.text.split('\n'), title: EJEMPLO.title, showTitle: true, signature: '@pluma_plateada', showFeather: true };
  await Promise.all([L.cargarPluma(), L.cargarFuentes('cormorant')]);
  const f = L.formato('3:4');
  const c = document.createElement('canvas'); c.width = f.w; c.height = f.h;
  const ctx = c.getContext('2d');
  const m = L.maquetar(ctx, o, c.width, c.height, 0);
  const v = L.DEFAULT_VIDEO;
  const dur = L.duracionVideo(m, v);
  const s = document.createElement('canvas'); s.width = 480; s.height = 640;
  const out = [];
  for (let t = 0; t < dur; t += 1 / 15) {
    L.dibujar(ctx, o, m, { t, v });
    s.getContext('2d').drawImage(c, 0, 0, 480, 640);
    out.push(s.toDataURL('image/png'));
  }
  return out;
});
frames.forEach((u, i) => fs.writeFileSync(`${D}/f${String(i).padStart(4, '0')}.png`, Buffer.from(u.split(',')[1], 'base64')));
console.log(frames.length);
await b.close();
