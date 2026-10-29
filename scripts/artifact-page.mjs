// Genera dist/pluma-plateada.html: la app compilada como página de artefacto de claude.ai
// (sin <html>/<head>/<body>: el publicador añade el esqueleto) y lista los archivos a adjuntar.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const html = readFileSync('dist/index.html', 'utf8');
const js = html.match(/<script type="module" crossorigin src="([^"]+)"/)[1];
const css = html.match(/<link rel="stylesheet" crossorigin href="([^"]+)"/)[1];
const pre = [...html.matchAll(/<link rel="modulepreload" crossorigin href="([^"]+)"/g)].map((m) => m[1]);
writeFileSync(
  'dist/pluma-plateada.html',
  `<title>Pluma Plateada</title>
<meta name="description" content="Editor de poesía: escribe, mide tus versos, crea poemarios y compártelos en imagen o vídeo.">
<link rel="stylesheet" href="${css}">
${pre.map((p) => `<link rel="modulepreload" href="${p}">`).join('')}
<div id="root"></div>
<script type="module" src="${js}"></script>
`,
);
const fuera = new Set(['index.html', 'pluma-plateada.html', 'sw.js', 'manifest.webmanifest', 'registerSW.js', 'pluma.glb']);
const files = {};
const walk = (d) =>
  readdirSync(d).forEach((f) => {
    const p = join(d, f);
    if (statSync(p).isDirectory()) return walk(p);
    const rel = relative('dist', p);
    if (!fuera.has(rel) && !rel.startsWith('workbox')) files[rel] = rel;
  });
walk('dist');
writeFileSync('dist/artifact-files.json', JSON.stringify(files, null, 1));
console.log(`dist/pluma-plateada.html + ${Object.keys(files).length} archivos (dist/artifact-files.json)`);
