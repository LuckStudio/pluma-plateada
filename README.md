# Pluma Plateada

Un editor de poemas dedicado a mi gran amigo, al que le encanta escribir: lo desarrollo para que pueda retomar su arte siempre que él quiera.

App web instalable (PWA), pensada primero para el móvil y con un buen editor en el ordenador. Todo se guarda en el dispositivo, funciona sin conexión y no necesita cuentas.

## Qué hace

- **Escribir.** Editor de versos con guardado automático, historial de versiones, sangrías, estrofas, ideas rápidas y borradores.
- **Métrica en castellano.** Junto a cada verso, sus sílabas métricas y la letra de rima. El análisis incluye:
  - silabeo, sinalefas y ley del acento final;
  - acentos y tipo de verso (heroico, melódico, sáfico…);
  - rima consonante o asonante y esquema (mayúsculas para arte mayor, minúsculas para arte menor);
  - formas: soneto, romance, redondilla, cuarteto, lira, décima, haiku…;
  - palabras repetidas.
- **Rimas y sinónimos** sin conexión, con el tesauro de LibreOffice.
- **Poemarios.** Partes y poemas reordenables, PDF para imprenta (índice, dedicatoria, márgenes de encuadernación, Cormorant Garamond incrustada) y ePub.
- **Lienzo.** Versos en imagen (PNG/JPG), PDF de imprenta con sangrado y marcas de corte, o **vídeo MP4** en el que la pluma escribe los versos a mano, con transiciones de entrada y salida. Formato 3:4 por defecto, además de 1:1, 4:5, 9:16, 16:9, postal, marcapáginas, A5 y A4. Estilos Plata, Papel, Noche, Tinta o una imagen propia.
- **Temas.** Plata (claro, predeterminado), Papel, Noche y Tinta.
- **Copias.** Exporta e importa un archivo `.pluma`, exporta todo como texto y avisa cada semana para hacer copia.
- **La pluma 3D** (`src/three/`), generada por código: gira en la carga, sigue el dedo o el giroscopio en Inicio y celebra al guardar o exportar.

## Desarrollo

```bash
npm install
npm run dev        # servidor de desarrollo
npm test           # tests del motor de métrica
npm run typecheck
npm run build      # versión de producción en dist/ (con service worker)
npm run artifact   # además genera la página para publicarla como artefacto
npm run export     # exporta la pluma a public/pluma.glb
```

## Estructura

```
src/poesia/   motor de métrica y rima (lógica pura, con tests)
src/db/       base de datos local (Dexie/IndexedDB) y copias de seguridad
src/export/   lienzo (imagen, vídeo, PDF) y libro (PDF, ePub)
src/screens/  Inicio, Editor, Libros, Lienzo, Ajustes
src/three/    pluma 3D procedural y su escena
```

## Créditos

- Sinónimos y vocabulario de rimas: tesauro de LibreOffice para español, de Marcelo Garrone (LGPL 2.1), convertido con `scripts/build-tesauro.mjs`.
- Tipografías Cormorant Garamond, Inter, Caveat y Dancing Script (SIL Open Font License).
