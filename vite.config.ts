import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Rutas relativas: la app funciona servida desde cualquier carpeta (GitHub Pages, artefacto…).
  base: './',
  plugins: [
    react(),
    // Algunas librerías (tablas de codificación de pdf-lib/fontkit) llevan el carácter U+FFFD literal.
    // Lo escapamos para que los archivos sean texto UTF-8 limpio; en cadenas JS es el mismo carácter.
    {
      name: 'escapar-u-fffd',
      enforce: 'post' as const,
      generateBundle(_: unknown, bundle: Record<string, { type: string; code?: string }>) {
        for (const f of Object.values(bundle)) if (f.type === 'chunk' && f.code?.includes('\uFFFD')) f.code = f.code.replaceAll('\uFFFD', '\\uFFFD');
      },
    },
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null, // lo registramos a mano en main.tsx
      includeAssets: ['icons/*.png', 'img/*.png', 'fonts/*.ttf'],
      manifest: {
        name: 'Pluma Plateada',
        short_name: 'Pluma',
        description: 'Editor de poesía: escribe, mide tus versos, crea poemarios y compártelos.',
        lang: 'es',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f3f5f9',
        theme_color: '#f3f5f9',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,woff2,ttf,json,svg}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: 'index.html',
      },
    }),
  ],
  build: {
    chunkSizeWarningLimit: 1200,
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
