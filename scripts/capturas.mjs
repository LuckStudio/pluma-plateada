// Capturas del README (docs/capturas). Necesita el servidor de desarrollo en marcha:
//   npx vite --port 5199 --strictPort
//   node scripts/capturas.mjs [bienvenida,movil,pc,lienzo,libro,temas,rrss]
// Los poemas de muestra (salvo «El pasado nunca falla») solo existen en las capturas.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'node:fs';

const BASE = 'http://localhost:5199/';
const OUT = new URL('../docs/capturas', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const solo = process.argv[2];
const quiero = (n) => !solo || solo.split(',').includes(n);

const browser = await chromium.launch();
const espera = (p, ms) => p.waitForTimeout(ms);

async function semilla(page) {
  await page.evaluate(async () => {
    const m = await import('/src/db/db.ts');
    const { db, uid } = m;
    await m.seedIfNeeded();
    await m.saveSettings({ lastBackupAt: Date.now() });
    const dia = 864e5;
    const now = Date.now();
    const ejemplo = await db.poems.toCollection().first();
    await db.poems.update(ejemplo.id, { tags: ['memoria', 'tiempo'], updatedAt: now - 2 * dia, createdAt: now - 40 * dia });
    const extra = [
      ['Noche de agosto', 'La luna cuelga del balcón\ncomo una moneda olvidada,\ny el verano, sin hacer ruido,\nse me queda en la almohada.', 'terminado', ['verano', 'noche'], 12],
      ['Plata', 'Tengo en las manos un poco de plata,\nla que me dejó la tarde al irse;\nno sé si guardarla o devolverla\nal río que la vio nacer.', 'borrador', ['memoria'], 5],
      ['Cuaderno', 'Vuelvo a abrir el cuaderno\ny la tinta todavía respira.', 'borrador', ['escribir'], 1],
    ];
    for (const [title, text, status, tags, hace] of extra)
      await db.poems.add({ id: uid(), title, text, status, align: 'left', tags, createdAt: now - hace * dia - 3e6, updatedAt: now - hace * dia });
    await db.ideas.add({ id: uid(), text: 'Un poema sobre las cartas que nunca envié', createdAt: now - dia });
    const ps = await db.poems.toArray();
    const id = await m.createBook('Lo que vuelve');
    const por = (t) => ps.find((p) => p.title === t).id;
    await m.patchLibro(id, (b) => ({
      subtitle: 'Poemas',
      author: 'Pluma Plateada',
      dedication: 'A quien vuelve a escribir',
      parts: [
        { id: 'p1', title: 'Lo que fue', poemIds: [por('El pasado nunca falla'), por('Plata')] },
        { id: 'p2', title: 'Lo que queda', poemIds: [por('Noche de agosto'), por('Cuaderno')] },
      ],
      cover: { ...b.cover, style: 'noche' },
      back: { ...b.back, blurb: 'Poemas para volver a lo que fuimos y aprender de ello.' },
      extras: { ...b.extras, epigraph: 'El pasado nunca falla. El pasado siempre vuelve.', epigraphAuthor: 'Pluma Plateada' },
    }));
    localStorage.setItem('pluma-libro-demo', id);
  });
}

async function nueva(viewport, opts = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: viewport.width < 600, hasTouch: viewport.width < 600, ...opts });
  const page = await ctx.newPage();
  await page.goto(BASE);
  await espera(page, 800);
  await semilla(page);
  return { ctx, page };
}

const MOVIL = { width: 390, height: 844 };
const PC = { width: 1440, height: 900 };

async function sinIntro(page) {
  await page.evaluate(async () => (await import('/src/db/db.ts')).saveSettings({ showIntro: false }));
  await page.reload();
  await espera(page, 2200);
}

const shot = (page, n) => page.screenshot({ path: `${OUT}/${n}.png` });

// 1. Bienvenida
if (quiero('bienvenida')) {
  const { ctx, page } = await nueva(MOVIL);
  await page.reload();
  await espera(page, 3500);
  await shot(page, '01-bienvenida');
  await ctx.close();
}

// 2-5. Móvil: inicio, filtros, editor
if (quiero('movil')) {
  const { ctx, page } = await nueva(MOVIL);
  await sinIntro(page);
  await shot(page, '02-inicio');
  await page.getByRole('button', { name: /Agrupar|Filtros|Ordenar/ }).first().click().catch(() => {});
  await espera(page, 700);
  await page.getByText('Tema', { exact: true }).click();
  await espera(page, 900);
  await page.mouse.wheel(0, 420);
  await espera(page, 700);
  await shot(page, '03-agrupar-temas');
  await page.mouse.wheel(0, -2000);
  await espera(page, 500);
  await page.getByText('El pasado nunca falla').first().click();
  await espera(page, 1500);
  await page.locator('.poem-line, [contenteditable], textarea').first().click().catch(() => {});
  await espera(page, 300);
  await page.locator('body').click({ position: { x: 5, y: 5 } }).catch(() => {});
  await page.getByRole('tab', { name: /Estudiar/ }).click();
  await espera(page, 900);
  await shot(page, '04-editor-movil');
  await page.getByRole('tab', { name: /Crear/ }).click();
  await espera(page, 600);
  await shot(page, '05-editor-crear');
  await ctx.close();
}

// 6. Editor en ordenador
if (quiero('pc')) {
  const { ctx, page } = await nueva(PC);
  await sinIntro(page);
  await page.getByText('El pasado nunca falla').first().click();
  await espera(page, 1800);
  await shot(page, '06-editor-escritorio');
  await ctx.close();
}

// 7. Lienzo móvil
if (quiero('lienzo')) {
  const { ctx, page } = await nueva(MOVIL);
  await sinIntro(page);
  const id = await page.evaluate(async () => (await (await import('/src/db/db.ts')).db.poems.toArray()).find((p) => p.title === 'El pasado nunca falla').id);
  await page.evaluate((id) => (location.hash = `#/lienzo/${id}`), id);
  await espera(page, 2200);
  await shot(page, '07-lienzo');
  await page.mouse.wheel(0, 600);
  await espera(page, 900);
  await shot(page, '08-lienzo-ajustes');
  await ctx.close();
}

// 9-11. Libros
if (quiero('libro')) {
  const { ctx, page } = await nueva(MOVIL);
  await sinIntro(page);
  const id = await page.evaluate(() => localStorage.getItem('pluma-libro-demo'));
  await page.evaluate(() => (location.hash = '#/libros'));
  await espera(page, 1500);
  await shot(page, '09-libros');
  await page.evaluate((id) => (location.hash = `#/libros/${id}`), id);
  await espera(page, 1500);
  await page.getByRole('tab', { name: 'Cubierta' }).click();
  await espera(page, 1500);
  await shot(page, '10-libro-cubierta');
  await page.getByRole('tab', { name: 'Créditos' }).click();
  await espera(page, 900);
  await page.mouse.wheel(0, 500);
  await espera(page, 600);
  await shot(page, '11-libro-creditos');
  await ctx.close();
  const pc = await nueva(PC);
  await sinIntro(pc.page);
  const idPc = await pc.page.evaluate(() => localStorage.getItem('pluma-libro-demo'));
  await pc.page.evaluate((id) => (location.hash = `#/libros/${id}/vista`), idPc);
  await espera(pc.page, 3000);
  await pc.page.keyboard.press('ArrowRight');
  await espera(pc.page, 900);
  await pc.page.keyboard.press('ArrowRight');
  await espera(pc.page, 1800);
  await shot(pc.page, '12-vista-libro');
  for (let i = 0; i < 6; i++) {
    await pc.page.keyboard.press('ArrowRight');
    await espera(pc.page, 500);
  }
  await espera(pc.page, 1500);
  await shot(pc.page, '13-vista-libro-poema');
  await pc.ctx.close();
}

// 14. Temas
if (quiero('temas')) {
  for (const t of ['papel', 'noche', 'tinta']) {
    const { ctx, page } = await nueva(MOVIL);
    await page.evaluate(async (t) => (await import('/src/db/db.ts')).saveSettings({ showIntro: false, theme: t }), t);
    await page.reload();
    await espera(page, 2200);
    await shot(page, `14-tema-${t}`);
    await ctx.close();
  }
}

// RRSS: imágenes exportadas
if (quiero('rrss')) {
  const { ctx, page } = await nueva(MOVIL);
  const piezas = [
    ['rrss-plata-3x4', '3:4', 'plata', 'cormorant'],
    ['rrss-papel-3x4', '3:4', 'papel', 'cormorant'],
    ['rrss-noche-3x4', '3:4', 'noche', 'cormorant'],
    ['rrss-tinta-3x4', '3:4', 'tinta', 'caveat'],
    ['rrss-noche-9x16', '9:16', 'noche', 'cormorant'],
    ['rrss-plata-1x1', '1:1', 'plata', 'dancing'],
  ];
  for (const [n, format, style, font] of piezas) {
    const url = await page.evaluate(
      async ({ format, style, font }) => {
        const { renderLienzo } = await import('/src/export/imagen.ts');
        const { EJEMPLO } = await import('/src/db/db.ts');
        const c = await renderLienzo({
          format, style, font, align: 'left', scale: 1, lines: EJEMPLO.text.split('\n'), title: EJEMPLO.title, showTitle: true, signature: '@pluma_plateada', showFeather: true,
        });
        const s = document.createElement('canvas');
        const k = 720 / c.width;
        s.width = 720;
        s.height = Math.round(c.height * k);
        s.getContext('2d').drawImage(c, 0, 0, s.width, s.height);
        return s.toDataURL('image/jpeg', 0.88);
      },
      { format, style, font },
    );
    fs.writeFileSync(`${OUT}/${n}.jpg`, Buffer.from(url.split(',')[1], 'base64'));
  }
  await ctx.close();
}

await browser.close();
