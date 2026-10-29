import { writeFile } from 'node:fs/promises';
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

const out = process.argv[2] ?? 'public/pluma.glb';
const glb = await new GLTFExporter().parseAsync(createFeather(), { binary: true });
await writeFile(out, Buffer.from(glb));
console.log(`Escrito ${out} (${(glb.byteLength / 1024).toFixed(0)} KB)`);
