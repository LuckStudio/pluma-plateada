# pluma-plateada
Un editor de poemas dedicado a mi gran amigo, al que le encanta escribir, desarrollo para que pueda retomar su arte siempre que el quiera

## Modelo 3D de la pluma

La pluma se genera por código (`src/feather.js`), con parámetros editables (largo, ancho de cada vexilo, número de barbas, caída, plumón…).

```bash
npm install
npm run dev      # visor interactivo (rota sola; arrastra para girarla)
npm run export   # escribe public/pluma.glb
```
