# pluma-plateada
Un editor de poemas dedicado a mi gran amigo, al que le encanta escribir, desarrollo para que pueda retomar su arte siempre que el quiera

## Modelo 3D de la pluma

La pluma se genera por código (`src/feather.js`), con parámetros editables (largo, ancho de cada vexilo, caída, inclinación y número de barbas, cortes…). El detalle fino (barbas, bordes irregulares) va en una textura pintada por código, no en geometría.

Acabado plateado con reflejo cepillado (anisotropía), y en la base una virola y un plumín de escritura (`src/nib.js`) con tinta holográfica: película iridiscente animada y una gota en la punta.

```bash
npm install
npm run dev      # visor interactivo (rota sola; arrastra para girarla)
npm run export   # escribe public/pluma.glb
```
