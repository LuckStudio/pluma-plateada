import { writeFile } from 'node:fs/promises';
import { createCanvas } from '@napi-rs/canvas';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { createFeather } from '../src/feather.js';

// GLTFExporter usa FileReader para empaquetar el binario; Node no lo trae.
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((b) => {
      this.result = b;
      this.onloadend?.();
    });
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((b) => {
      this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(b).toString('base64')}`;
      this.onloadend?.();
    });
  }
};

const CanvasElement = Object.getPrototypeOf(createCanvas(1, 1)).constructor;

// El exportador codifica texturas con OffscreenCanvas; lo emulamos sobre @napi-rs/canvas.
globalThis.OffscreenCanvas = class OffscreenCanvas {
  static [Symbol.hasInstance](o) {
    return o instanceof CanvasElement;
  }
  constructor(w, h) {
    return createCanvas(w, h);
  }
};
CanvasElement.prototype.convertToBlob = async function ({ type = 'image/png' } = {}) {
  return new Blob([await this.encode(type.split('/')[1])], { type });
};

// Canvas.data() de napi choca con la comprobación `image.data` (DataTexture) del exportador.
CanvasElement.prototype.data = undefined;

const out = process.argv[2] ?? 'public/pluma.glb';
const glb = await new GLTFExporter().parseAsync(createFeather({ makeCanvas: () => createCanvas(1, 1) }), { binary: true });
await writeFile(out, Buffer.from(glb));
console.log(`Escrito ${out} (${(glb.byteLength / 1024).toFixed(0)} KB)`);
