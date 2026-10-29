import * as THREE from 'three';

export const defaultParams = {
  length: 3.2,
  seed: 7,
  rows: 72, // divisiones a lo largo del vexilo
  cols: 6, // divisiones a lo ancho de cada vexilo
  widthRight: 0.15, // ancho máx. (fracción del largo)
  widthLeft: 0.108,
  quillEnd: 0.16, // fin del cálamo
  droop: 0.5, // caída de los vexilos hacia atrás
  sweep: 0.5, // inclinación de las barbas hacia la punta
  notches: 2, // cortes estilizados en el vexilo derecho
  down: 9, // filamentos de plumón
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

// Silueta ovalada con punta fina: nace estrecha, se ensancha y se cierra en ojiva.
const prof = (x) => Math.pow(x, 0.62) * Math.pow(1 - x, 0.55);
const PROF_MAX = (() => {
  let m = 0;
  for (let i = 0; i <= 200; i++) m = Math.max(m, prof(i / 200));
  return m;
})();
const widthProfile = (x) => prof(x) / PROF_MAX;

function frameAt(spine, s) {
  const T = spine.getTangentAt(s).normalize();
  const N = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 0, 1), T).normalize();
  const B = new THREE.Vector3().crossVectors(T, N).normalize();
  return { T, N, B };
}

function toGeometry(pos, colors, idx) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function buildVane(spine, p, side) {
  const { length: L, rows, cols, quillEnd, droop, sweep } = p;
  // side < 0 es el lado derecho visto de frente (N apunta a la izquierda).
  const wMax = (side < 0 ? p.widthRight : p.widthLeft) * L;

  // Cortes estilizados: pequeñas hendiduras en el borde (solo lado derecho, inclinadas como las barbas).
  const notchAt = side < 0 ? [0.36, 0.6, 0.8].slice(0, p.notches) : [];
  const notchDip = (x, u) => {
    let d = 0;
    for (const n of notchAt) d = Math.max(d, Math.exp(-Math.pow((x - n - 0.05 * u) / 0.02, 2)));
    return 1 - 0.42 * d * smooth(0.3, 1, u);
  };

  const C = {
    deep: new THREE.Color('#2f3f78'),
    mid: new THREE.Color('#6677b4'),
    pearl: new THREE.Color('#dcd8ee'),
    rose: new THREE.Color('#c79bbd'),
  };
  const col = new THREE.Color();
  const pos = [];
  const colors = [];
  const idx = [];

  for (let r = 0; r <= rows; r++) {
    const x = r / rows;
    const s = quillEnd + x * (1 - quillEnd);
    const { T, N, B } = frameAt(spine, Math.min(s, 0.9999));
    const c = spine.getPointAt(Math.min(s, 0.9999));
    const w = wMax * widthProfile(x);

    for (let k = 0; k <= cols; k++) {
      const u = k / cols;
      const reach = u * w * notchDip(x, u);
      const along = reach * sweep * (1 - 0.7 * smooth(0.75, 1, x));
      const down = -droop * (reach * reach) / (wMax + 1e-6) - 0.015 * L * u * Math.sin(Math.PI * x);
      pos.push(
        c.x + N.x * side * reach + T.x * along + B.x * down,
        c.y + N.y * side * reach + T.y * along + B.y * down,
        c.z + N.z * side * reach + T.z * along + B.z * down,
      );

      // Degradado: índigo en la base -> periwinkle -> brillo perlado junto al raquis -> rosa en la punta.
      col.copy(C.deep).lerp(C.mid, smooth(0.0, 0.55, x) * (1 - 0.35 * u) + 0.15);
      const pearl = (1 - smooth(0, 0.85, u)) * smooth(0.12, 0.45, x) * (1 - smooth(0.78, 1, x) * 0.6);
      col.lerp(C.pearl, pearl * (side < 0 ? 0.8 : 0.55));
      col.lerp(C.deep, smooth(0.7, 1, u) * 0.3);
      col.lerp(C.rose, smooth(0.74, 1, x) * 0.7);
      // Rayado fino que sugiere las barbas sin añadir geometría.
      const g = 1 + (r % 2 ? 0.035 : -0.035) * smooth(0.1, 0.5, u);
      colors.push(Math.min(1, col.r * g), Math.min(1, col.g * g), Math.min(1, col.b * g));
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
  return toGeometry(pos, colors, idx);
}

// Raquis: tubo fino de 5 lados que se afina hacia la punta.
function buildRachis(spine, p) {
  const L = p.length;
  const segs = 40;
  const radial = 5;
  const pink = new THREE.Color('#e3a7c0');
  const pale = new THREE.Color('#efe2ec');
  const pos = [];
  const colors = [];
  const idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const c = spine.getPointAt(t);
    const { N, B } = frameAt(spine, Math.min(t, 0.9999));
    const rad = L * (0.0068 * (1 - t) + 0.0012);
    const col = pink.clone().lerp(pale, smooth(0.15, 0.9, t) * 0.6);
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
  return toGeometry(pos, colors, idx);
}

// Plumón: pocas cintas curvas y afiladas, en lugar de cientos de filamentos.
function buildDown(spine, p, rand) {
  const L = p.length;
  const segs = 4;
  const pos = [];
  const colors = [];
  const idx = [];
  const base = new THREE.Color('#cfd0ea');
  const tip = new THREE.Color('#f6f3fb');
  for (let i = 0; i < p.down; i++) {
    const s0 = 0.06 + rand() * (p.quillEnd + 0.1 - 0.06);
    const c = spine.getPointAt(s0);
    const { T, N, B } = frameAt(spine, s0);
    const side = i % 2 ? 1 : -1;
    const len = L * (0.07 + rand() * 0.07);
    const dir = new THREE.Vector3()
      .addScaledVector(N, side * (0.7 + rand() * 0.5))
      .addScaledVector(T, -0.15 + rand() * 0.5)
      .addScaledVector(B, (rand() - 0.5) * 0.4)
      .normalize();
    const curl = new THREE.Vector3().addScaledVector(T, 0.9).addScaledVector(B, (rand() - 0.5) * 0.5);
    const start = pos.length / 3;
    for (let k = 0; k <= segs; k++) {
      const t = k / segs;
      const q = c.clone().addScaledVector(dir, len * t).addScaledVector(curl, len * 0.5 * t * t);
      const hw = L * 0.0075 * (1 - t);
      const col = base.clone().lerp(tip, t);
      pos.push(q.x + B.x * hw, q.y + B.y * hw, q.z + B.z * hw, q.x - B.x * hw, q.y - B.y * hw, q.z - B.z * hw);
      colors.push(col.r, col.g, col.b, col.r, col.g, col.b);
    }
    for (let k = 0; k < segs; k++) {
      const a = start + k * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  return toGeometry(pos, colors, idx);
}

export function createFeather(overrides = {}) {
  const p = { ...defaultParams, ...overrides };
  const rand = mulberry32(p.seed);
  const spine = makeSpine(p.length);

  const vaneMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.38,
    metalness: 0.12,
    side: THREE.DoubleSide,
  });
  const rachisMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35 });
  const downMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide });

  const group = new THREE.Group();
  group.name = 'Pluma';
  const parts = [
    ['Vexilo_derecho', buildVane(spine, p, 1), vaneMat],
    ['Vexilo_izquierdo', buildVane(spine, p, -1), vaneMat],
    ['Raquis', buildRachis(spine, p), rachisMat],
    ['Plumon', buildDown(spine, p, rand), downMat],
  ];
  for (const [name, geo, mat] of parts) {
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    group.add(m);
  }

  // Centrar para que rote sobre su centro.
  const center = new THREE.Box3().setFromObject(group).getCenter(new THREE.Vector3());
  group.children.forEach((m) => m.position.sub(center));
  return group;
}
