import * as THREE from 'three';
import { paintVaneAtlas } from './featherTexture.js';
import { nibFrame, buildFerrule, buildNib, buildInk } from './nib.js';

export const defaultParams = {
  length: 3.2,
  seed: 11,
  rows: 90, // divisiones a lo largo del vexilo
  cols: 8, // divisiones a lo ancho de cada vexilo
  widthRight: 0.15, // ancho máx. (fracción del largo)
  widthLeft: 0.108,
  quillEnd: 0.14, // fin del cálamo
  droop: 0.5, // caída de los vexilos hacia atrás
  sweep: 1.0, // inclinación de las barbas hacia la punta
  splits: 4, // separaciones naturales de barbas
  textureSize: 1024,
  textureBarbs: 300, // barbas dibujadas por vexilo
  textureStrokes: 7000, // bárbulas (trazos finos)
  makeCanvas: () => document.createElement('canvas'),
};

function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Raquis: una S suave y esbelta, base abajo-izquierda, punta arriba a la derecha.
function makeSpine(L) {
  return new THREE.CatmullRomCurve3(
    [
      [-0.1, 0, 0.0],
      [-0.07, 0.22, 0.02],
      [0.0, 0.45, 0.035],
      [0.11, 0.67, 0.03],
      [0.22, 0.86, 0.01],
      [0.3, 1.0, -0.03],
    ].map(([x, y, z]) => new THREE.Vector3(x * L * 0.5, y * L, z * L)),
    false,
    'centripetal',
  );
}

// Silueta: ovalada, con punta redondeada. Cerca de la base conserva algo de ancho
// (ahí las barbas son sueltas y la textura las deja sueltas/con huecos).
const prof = (x) => Math.pow(x, 0.62) * Math.pow(1 - x, 0.5);
const PROF_MAX = (() => {
  let m = 0;
  for (let i = 0; i <= 200; i++) m = Math.max(m, prof(i / 200));
  return m;
})();
const widthProfile = (x) => prof(x) / PROF_MAX + 0.07 * (1 - smooth(0, 0.12, x));

function frameAt(spine, s) {
  const T = spine.getTangentAt(s).normalize();
  const N = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 0, 1), T).normalize();
  const B = new THREE.Vector3().crossVectors(T, N).normalize();
  return { T, N, B };
}

function buildVane(spine, p, side) {
  const { length: L, rows, cols, quillEnd, droop, sweep } = p;
  // side < 0 es el lado derecho visto de frente (N apunta a la izquierda).
  const wMax = (side < 0 ? p.widthRight : p.widthLeft) * L;
  const pos = [];
  const uv = [];
  const idx = [];

  for (let r = 0; r <= rows; r++) {
    const x = r / rows;
    const s = quillEnd + x * (1 - quillEnd);
    const { T, N, B } = frameAt(spine, Math.min(s, 0.9999));
    const c = spine.getPointAt(Math.min(s, 0.9999));
    // Ligera ondulación del borde, para que no sea una forma perfecta.
    const w = wMax * widthProfile(x) * (1 + 0.025 * Math.sin(x * 9 + side * 1.7));

    for (let k = 0; k <= cols; k++) {
      const u = k / cols;
      const reach = u * w;
      const along = reach * sweep * (1 - 0.8 * smooth(0.7, 1, x));
      const down = -droop * (reach * reach) / (wMax + 1e-6) - 0.015 * L * u * Math.sin(Math.PI * x);
      pos.push(
        c.x + N.x * side * reach + T.x * along + B.x * down,
        c.y + N.y * side * reach + T.y * along + B.y * down,
        c.z + N.z * side * reach + T.z * along + B.z * down,
      );
      uv.push(side < 0 ? 0.5 + 0.5 * u : 0.5 - 0.5 * u, x);
    }
  }

  const stride = cols + 1;
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      const a = r * stride + k;
      const b = a + 1;
      const c2 = a + stride;
      const d = c2 + 1;
      if (side > 0) idx.push(a, c2, b, b, c2, d);
      else idx.push(a, b, c2, b, d, c2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Cálamo + raquis: tubo que pasa de cálamo grueso y claro a raquis fino y rosado.
function buildRachis(spine, p) {
  const L = p.length;
  const segs = 48;
  const radial = 8;
  const calamus = new THREE.Color('#e4e8ef');
  const pink = new THREE.Color('#c3cad6');
  const pale = new THREE.Color('#f1f4f9');
  const pos = [];
  const colors = [];
  const idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const c = spine.getPointAt(t);
    const { N, B } = frameAt(spine, Math.min(t, 0.9999));
    const rad = L * (0.0042 * (1 - t) + 0.0011 + 0.0036 * (1 - smooth(0.1, 0.22, t)));
    const col = pink.clone().lerp(pale, smooth(0.3, 1, t) * 0.4).lerp(calamus, 1 - smooth(0.1, 0.24, t));
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const ca = Math.cos(a) * rad;
      const sa = Math.sin(a) * rad;
      pos.push(c.x + N.x * ca + B.x * sa, c.y + N.y * ca + B.y * sa, c.z + N.z * ca + B.z * sa);
      colors.push(col.r, col.g, col.b);
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j;
      const b = i * radial + ((j + 1) % radial);
      idx.push(a, a + radial, b, b, a + radial, b + radial);
    }
  }
  // Tapa del extremo inferior del cálamo.
  const c0 = spine.getPointAt(0);
  const cap = pos.length / 3;
  pos.push(c0.x, c0.y, c0.z);
  colors.push(calamus.r, calamus.g, calamus.b);
  for (let j = 0; j < radial; j++) idx.push(cap, (j + 1) % radial, j);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function createFeather(overrides = {}) {
  const p = { ...defaultParams, ...overrides };
  const rand = mulberry32(p.seed);
  const spine = makeSpine(p.length);

  const tex = new THREE.CanvasTexture(paintVaneAtlas(p.makeCanvas(), p, rand));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false; // convención glTF: v = 0 arriba
  tex.anisotropy = 8;
  tex.needsUpdate = true;

  // Plata con reflejo cepillado a lo largo de las barbas (anisotropía en dirección u).
  const vaneMat = new THREE.MeshPhysicalMaterial({
    map: tex,
    alphaTest: 0.5,
    alphaToCoverage: true,
    metalness: 1,
    roughness: 0.3,
    anisotropy: 0.6,
    side: THREE.DoubleSide,
  });
  const rachisMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 1, roughness: 0.22 });
  const silver = new THREE.MeshStandardMaterial({
    color: '#e9edf3',
    metalness: 1,
    roughness: 0.16,
    side: THREE.DoubleSide,
  });
  // Tinta densa y holográfica: base azul tinta oscura con película iridiscente y barniz.
  const inkMat = new THREE.MeshPhysicalMaterial({
    name: 'Tinta_holografica',
    color: '#6b74a8',
    metalness: 1,
    roughness: 0.28,
    iridescence: 1,
    iridescenceIOR: 1.4,
    iridescenceThicknessRange: [150, 1300],
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    side: THREE.DoubleSide,
  });

  // Mapa de grosor de la película: ruido suave que reparte los colores holográficos.
  const film = p.makeCanvas();
  film.width = film.height = 128;
  const fc = film.getContext('2d');
  fc.fillStyle = '#808080';
  fc.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 40; i++) {
    const x = rand() * 128;
    const y = rand() * 128;
    const r = 12 + rand() * 40;
    const v = Math.floor(rand() * 255);
    const g = fc.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${v},${v},${v},0.8)`);
    g.addColorStop(1, `rgba(${v},${v},${v},0)`);
    fc.fillStyle = g;
    fc.fillRect(0, 0, 128, 128);
  }
  const filmTex = new THREE.CanvasTexture(film);
  filmTex.wrapS = filmTex.wrapT = THREE.RepeatWrapping;
  filmTex.flipY = false;
  inkMat.iridescenceThicknessMap = filmTex;

  const f = nibFrame(spine);
  const [nibA, nibB] = buildNib(f, p.length);
  const [inkCoat, inkDrop] = buildInk(f, p.length, rand);

  const group = new THREE.Group();
  group.name = 'Pluma';
  const parts = [
    ['Vexilo_derecho', buildVane(spine, p, -1), vaneMat],
    ['Vexilo_izquierdo', buildVane(spine, p, 1), vaneMat],
    ['Raquis', buildRachis(spine, p), rachisMat],
    ['Virola', buildFerrule(f, p.length), silver],
    ['Plumin_a', nibA, silver],
    ['Plumin_b', nibB, silver],
    ['Tinta', inkCoat, inkMat],
    ['Gota_tinta', inkDrop, inkMat],
  ];
  for (const [name, geo, mat] of parts) {
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    group.add(m);
  }

  const center = new THREE.Box3().setFromObject(group).getCenter(new THREE.Vector3());
  group.children.forEach((m) => m.position.sub(center));
  return group;
}
