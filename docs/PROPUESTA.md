# Propuesta: estructura de Pluma Plateada Editor

Cómo convertir el brief en una herramienta real, con la pluma 3D ya construida como punto de partida.

---

## 1. Decisiones de base (recomendadas)

| Tema | Recomendación | Por qué |
|---|---|---|
| Plataforma | **Web app instalable (PWA)**, primero escritorio y luego móvil | Un solo código; se instala como app y funciona sin conexión. La pluma ya está en Three.js. Una app nativa se puede valorar más adelante. |
| Framework | **React + TypeScript + Vite** | Vite ya está montado. Es el ecosistema con mejores piezas para editor, arrastrar y soltar, y 3D. |
| 3D | **Three.js** con **react-three-fiber** | Reutiliza `src/feather.js` tal cual y lo integra como componente. |
| Editor de texto | **TipTap** (sobre ProseMirror) | Permite tratar el verso y la estrofa como bloques propios, con sangrías y alineación por verso. |
| Datos | **Local primero** (IndexedDB con Dexie) y **sincronización opcional** más tarde (Supabase) | Guardado instantáneo y offline desde el día 1. La nube se añade sin rehacer nada. |
| Arrastrar y soltar | **dnd-kit** | Para reordenar poemas y secciones dentro de un libro. |
| Lienzo visual | **Konva** (canvas 2D) | Exporta PNG/JPG a resolución exacta (1080×1080, 1080×1920…) y a escala de impresión. |
| PDF y ePub | **pdf-lib** para láminas con marcas de corte; **Paged.js** para maquetar el libro; ePub generado como ZIP (JSZip) | Todo en el navegador, sin servidor. Si la calidad tipográfica del libro no basta, se puede pasar a **Typst** (WASM). |

---

## 2. La pluma como hilo conductor

La pluma no se monta en cada pantalla por separado. Vive en **un único lienzo WebGL fijo detrás de la interfaz**, y cada pantalla le pide un *estado*. Así puede viajar de una pantalla a otra sin cortes, y solo hay una escena 3D cargada (rendimiento).

```
<FeatherStage>   ← lienzo 3D fijo, siempre montado
  estado: splash | idle | follow | transition | celebrate | hidden
<UI de la pantalla actual> ← encima, en HTML
```

| Estado | Dónde | Qué hace |
|---|---|---|
| `splash` | Carga | Gira sobre su eje; un destello recorre la plata y la tinta "respira". |
| `follow` | Dashboard | Se inclina hacia el cursor o según el giroscopio del móvil. |
| `transition` | Cambio de pantalla | Giro rápido y trazo de luz con la tinta holográfica que "pinta" la entrada de la siguiente vista. |
| `celebrate` | Guardar / exportar | Medio giro breve y destello; cae una gota de tinta. |
| `hidden` / `corner` | Editor | Se retira a una esquina o desaparece para no distraer (modo zen). |

Reglas de rendimiento:
- Carga diferida del `.glb` (con la textura comprimida a KTX2).
- El renderizado se pausa cuando la pluma no está visible.
- Si el sistema pide *movimiento reducido* o el dispositivo es débil, se usa una imagen fija de la pluma.

---

## 3. Mapa de pantallas y rutas

```
/                       Dashboard
/escribir/:poemaId      Editor de poema (nuevo o existente)
/libros                 Mis libros / poemarios
/libros/:libroId        Estructura del libro (secciones, orden, maquetación)
/lienzo/:diseñoId       Editor visual (RRSS e impresión)
/ajustes                Tema, tipografías, copia de seguridad, cuenta
```

**Dashboard.** La pluma en el centro, con dos llamadas a la acción: *Escribir poema* y *Continuar «<último>»*. Debajo, tres franjas: *Poemas recientes* (tarjetas con los primeros versos), *Mis libros* (portadas) e *Ideas rápidas* (notas de una línea, capturables con un atajo).

**Editor (El Escritor).**
- Pantalla limpia con el texto centrado y en serifa. La barra de herramientas aparece al seleccionar texto.
- Panel lateral plegable con:
  - **Métrica:** sílabas métricas de cada verso, contadas con sinalefas y con el ajuste de verso agudo o esdrújulo.
  - **Rima:** esquema calculado (ABBA…), asonante o consonante.
  - **Contador** de versos y estrofas.
  - **Rimas y sinónimos** de la palabra seleccionada.
- Acciones: *Asignar a libro*, *Llevar al lienzo* (con la transición de la pluma).
- El guardado es automático y el historial de versiones es ligero.

**Libros.** Cuenta con:
- Secciones o capítulos que contienen poemas, que se reordenan arrastrándolos.
- Ajustes de maquetación: tamaño de página (A5, 13×20, A4), márgenes, tipografía, índice automático y página de dedicatoria.
- Vista previa paginada y exportación a **PDF para imprenta** y **ePub**.

**Lienzo.**
- Se seleccionan versos del poema y aparecen como texto editable sobre un formato elegido: Post, Story, Banner, Postal, Marcapáginas, A4 o A5.
- Estilos predefinidos: papel, degradado plata/azul, noche, o una imagen propia.
- Exportación a PNG/JPG en alta resolución, y a PDF con sangrado y marcas de corte.

---

## 4. Modelo de datos

```ts
Poema   { id, titulo, cuerpo /* doc TipTap: estrofas > versos */, estado: 'borrador'|'terminado',
          libroId?, etiquetas[], creado, editado, versiones[] }
Libro   { id, titulo, subtitulo, autor, dedicatoria, portada,
          secciones: [{ id, titulo, poemaIds[] }], maquetacion: { pagina, margenes, fuente, ... } }
Idea    { id, texto, creada }
Diseño  { id, poemaId, versos: [inicio, fin], formato, estilo, capas[] /* posición, tipo, color */ }
Ajustes { tema, fuenteEditor, animaciones: 'completas'|'reducidas', sync? }
```

Todo se guarda en IndexedDB. Una copia de seguridad (exportar/importar JSON) está disponible desde la fase 1. La sincronización en la nube vuelve a enviar estos mismos objetos.

---

## 5. Estructura del proyecto

```
src/
  app/            rutas, layout, tema (tokens de color/tipografía)
  three/          feather.js, featherTexture.js, nib.js  ← lo que ya existe
    FeatherStage.tsx   lienzo fijo + máquina de estados de la pluma
    animations/        splash, follow, transition, celebrate
  features/
    dashboard/
    editor/       extensiones TipTap (Estrofa, Verso), panel de métrica
    libros/       lista, estructura con dnd-kit, maquetación
    lienzo/       Konva: formatos, plantillas, exportadores
  poesia/         lógica pura y testeada: silabeo, sinalefa, rima, esquema métrico
  datos/          Dexie (tablas, migraciones), copia de seguridad, sync
  export/         pdf (libro / lámina con marcas de corte), epub, imagen
  ui/             botones, tarjetas, paneles en estilo plateado
```

`poesia/` es el corazón diferencial. Es lógica pura, sin interfaz, y lleva sus propios tests (contar sílabas en castellano tiene muchos casos límite). Para rimas y sinónimos sin depender de servicios externos, la idea es:
- **Rimas:** se calculan sobre una lista de palabras en castellano, a partir de la terminación desde la vocal tónica.
- **Sinónimos:** se usa el tesauro libre de LibreOffice (es_ES, licencia LGPL), incluido en la app.

---

## 6. Identidad visual (tokens)

| Token | Valor | Uso |
|---|---|---|
| `--noche` | `#05070d` | fondo profundo |
| `--azul-noche` | `#0b1120` → `#1d2a47` | degradados de fondo (los del visor actual) |
| `--acero` | `#7b8597` | texto secundario, bordes |
| `--plata` | `#bcc3cf` | iconos, separadores |
| `--perla` | `#f6f8fc` | texto principal sobre oscuro |
| `--hielo` | `#cdd8ea` | acentos fríos, foco |
| `--tinta` | degradado iridiscente cian ↔ violeta | **solo** para momentos especiales (guardar, exportar, CTA principal) |

Tipografía: una serifa elegante para los poemas (p. ej. Cormorant Garamond o EB Garamond), una sans neutra para la interfaz (Inter) y una manuscrita opcional para el lienzo. Habrá modo noche (por defecto) y modo papel (claro), para escribir de día.

---

## 7. Fases ajustadas

| Fase | Entrega | Resultado visible |
|---|---|---|
| **0. Base** | Migrar a React+TS, tokens de tema, `FeatherStage` con `splash` y `follow`, rutas vacías | La app abre con la pluma y se puede navegar. |
| **1. Escribir** | Editor TipTap de versos y estrofas, guardado local automático, dashboard con recientes e ideas, copia de seguridad | Tu amigo ya puede escribir y guardar a diario. |
| **2. Poesía** | Métrica, esquema de rima, contador, rimas y sinónimos | El editor se vuelve un aliado del poeta. |
| **3. Libros** | Libros y secciones, arrastrar y soltar, maquetación, PDF de imprenta y ePub | Un poemario listo para imprimir. |
| **4. Lienzo** | Formatos de RRSS e impresión, estilos, exportación PNG/JPG/PDF con marcas de corte | Versos listos para Instagram/TikTok o para imprimir. |
| **5. Pulido** | Transiciones `transition` y `celebrate`, sync en la nube, app instalable en móvil | El "efecto wow" completo. |

Cambio respecto al brief: separo **Escribir** (fase 1) de **Poesía** (fase 2). Así hay algo útil para tu amigo cuanto antes, y la parte más delicada (la métrica) se puede hacer con calma y con tests.

---

## 8. Preguntas abiertas

1. **¿Para quién es la primera versión?** ¿Solo para tu amigo, o se publicará para más poetas? Si es solo para él, se puede saltar cuentas y nube al principio.
2. **¿Dónde escribe más?** ¿Ordenador, tablet o móvil? Eso decide si el giroscopio y el diseño móvil van antes.
3. **¿Necesita sincronizar entre dispositivos** desde el principio, o basta con trabajar en local y hacer copias de seguridad?
4. **¿Métrica clásica?** ¿Escribe en verso medido (sonetos, endecasílabos) o sobre todo en verso libre? Eso cambia la prioridad de la fase 2.
