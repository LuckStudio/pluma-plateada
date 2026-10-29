import * as THREE from 'three';

export const defaultParams = {
  length: 3,
  seed: 7,
  barbs: 150, // barbas por lado
  widthRight: 0.2, // ancho máx. del vexilo derecho (fracción del largo)
  widthLeft: 0.15,
  quillEnd: 0.17, // fin del cálamo (parte sin vexilo)
  droop: 0.55, // cuánto se curvan los vexilos hacia atrás
  sweep: 0.55, // inclinación de las barbas hacia la punta
  downCount: 90, // filamentos de plumón en la base
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

// Raquis: curva suave, base abajo-izquierda, punta arriba a la derecha.
function makeSpine(L) {
  return new THREE.CatmullRomCurve3(
    [
      [-0.1, 0, 0.02],
      [-0.06, 0.2, 0.03],
      [0.0, 0.42, 0.04],
      [0.1, 0.62, 0.035],
      [0.2, 0.8, 0.02],
      [0.27, 0.93, 0.0],
      [0.3, 1.0, -0.02],
    ].map(([x, y, z]) => new THREE.Vector3(x * L * 0.55, y * L, z * L)),
    false,
    'centripetal',
  );
}

// Perfil de ancho del vexilo: nace fino, se ensancha y cierra en punta redondeada.
const _norm = (() => {
  let m = 0;
  for (let i = 0; i <= 200; i++) {
    const x = i / 200;
    m = Math.max(m, Math.pow(x, 0.55) * Math.pow(1 - x, 0.42));
  }
  return m;
})();
const widthProfile = (x) => (Math.pow(x, 0.55) * Math.pow(1 - x, 0.42)) / _norm;

function frameAt(spine, s) {
  const T = spine.getTangentAt(s).normalize();
  const N = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 0, 1), T).normalize(); // hacia la derecha
  const B = new THREE.Vector3().crossVectors(T, N).normalize(); // hacia el frente
  return { T, N, B };
}

const lerpColor = (out, a, b, t) => out.copy(a).lerp(b, t);

function buildVane(spine, p, side, rand) {
  const { length: L, barbs, quillEnd, droop, sweep } = p;
  const wMax = (side > 0 ? p.widthRight : p.widthLeft) * L;
  const ROWS_PER_BARB = 4;
  const rows = barbs * ROWS_PER_BARB;
  const cols = 22;

  // Jitter por barba: ancho y brillo, para bordes irregulares y textura.
  const jitW = Array.from({ length: barbs + 1 }, () => 0.92 + rand() * 0.1);
  const jitB = Array.from({ length: barbs }, () => (rand() - 0.5) * 2);
  const split = Array.from({ length: barbs }, () => (rand() < 0.035 ? 0.5 + rand() * 0.25 : 1));

  const cSlate = new THREE.Color('#46568a');
  const cMid = new THREE.Color('#7683b3');
  const cHi = new THREE.Color('#c4c0dc');
  const cLilac = new THREE.Color('#9a82b4');
  const cTip = new THREE.Color('#b79bc2');
  const col = new THREE.Color();
  const tmp = new THREE.Color();

  const pos = [];
  const colors = [];
  const idx = [];

  for (let r = 0; r <= rows; r++) {
    const x = r / rows; // 0..1 a lo largo del vexilo
    const s = quillEnd + x * (1 - quillEnd);
    const b = Math.min(barbs - 1, Math.floor(x * barbs));
    const phase = (x * barbs) % 1;
    const { T, N, B } = frameAt(spine, Math.min(s, 0.9999));
    const c = spine.getPointAt(Math.min(s, 0.9999));
    const w = wMax * widthProfile(x);
    // Fusión gradual en los extremos del vexilo para que no haya escalones feos.
    const ramp = smooth(0.2, 0.8, phase);
    const edgeJit = (jitW[b] * (1 - ramp) + jitW[b + 1] * ramp) * split[b];

    for (let k = 0; k <= cols; k++) {
      const u = k / cols; // 0 = raquis, 1 = borde
      const edge = smooth(0.35, 1, u);
      const reach = u * w * (1 + (edgeJit - 1) * edge);
      // Barba: sale del raquis y se inclina hacia la punta.
      const along = reach * sweep * (0.6 + 0.4 * u) * (1 - 0.75 * smooth(0.78, 1, x));
      // Caída hacia atrás y corrugación de barbas.
      const ridge = (Math.abs(phase - 0.5) * 2 - 0.5) * 0.0022 * L * Math.min(1, u * 3);
      const down = -droop * reach * reach / (wMax + 1e-6) * 0.9 - 0.02 * L * u * Math.sin(Math.PI * x);
      const vx = c.x + N.x * side * reach + T.x * along + B.x * (down + ridge);
      const vy = c.y + N.y * side * reach + T.y * along + B.y * (down + ridge);
      const vz = c.z + N.z * side * reach + T.z * along + B.z * (down + ridge);
      pos.push(vx, vy, vz);

      // Color: gradiente azul pizarra -> lila claro en el centro; borde más oscuro; punta rosada.
      const blob = Math.sin(x * 5.2 + side * 1.3) * 0.5 + 0.5;
      const highlight = smooth(0.25, 0.7, x) * (1 - smooth(0.7, 1, x)) * (1 - Math.abs(u - 0.45) * 1.2);
      lerpColor(col, cSlate, cMid, 0.35 + 0.5 * blob * (1 - u * 0.5));
      lerpColor(col, col, cHi, Math.max(0, highlight) * (side > 0 ? 0.85 : 0.5));
      lerpColor(col, col, cLilac, smooth(0.78, 1, x) * 0.6);
      lerpColor(col, col, cTip, smooth(0.9, 1, x) * 0.4);
      lerpColor(col, col, tmp.set('#34426f'), smooth(0.75, 1, u) * 0.35 * (1 - smooth(0.6, 1, x) * 0.5));
      const g = 1 + jitB[b] * 0.07 + (phase - 0.5) * 0.05;
      colors.push(Math.min(1, col.r * g), Math.min(1, col.g * g), Math.min(1, col.b * g));
    }
  }

  const stride = cols + 1;
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      const a = r * stride + k;
      const bb = a + 1;
      const c2 = a + stride;
      const d = c2 + 1;
      if (side > 0) idx.push(a, c2, bb, bb, c2, d);
      else idx.push(a, bb, c2, bb, d, c2);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Tubo con radio variable a lo largo de una curva (raquis, filamentos de plumón).
function buildTube(curve, segs, radial, radiusFn, colorFn) {
  const pos = [];
  const colors = [];
  const idx = [];
  const up = new THREE.Vector3(0, 0, 1);
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const c = curve.getPointAt(t);
    const T = curve.getTangentAt(t);
    const N = new THREE.Vector3().crossVectors(up, T);
    if (N.lengthSq() < 1e-6) N.set(1, 0, 0);
    N.normalize();
    const B = new THREE.Vector3().crossVectors(T, N).normalize();
    const rad = radiusFn(t);
    const col = colorFn(t);
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      pos.push(
        c.x + (N.x * Math.cos(a) + B.x * Math.sin(a)) * rad,
        c.y + (N.y * Math.cos(a) + B.y * Math.sin(a)) * rad,
        c.z + (N.z * Math.cos(a) + B.z * Math.sin(a)) * rad,
      );
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
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function buildRachis(spine, p) {
  const L = p.length;
  const pink = new THREE.Color('#d9a9be');
  const pale = new THREE.Color('#e9dce6');
  return buildTube(
    spine,
    120,
    8,
    (t) => L * (0.0075 * (1 - t) + 0.0012) * (t < 0.03 ? 0.7 + t * 10 : 1),
    (t) => new THREE.Color().copy(pink).lerp(pale, smooth(0.15, 0.9, t) * 0.55),
  );
}

// Plumón: filamentos finos y ondulados en la base, tras el inicio del vexilo.
function buildDown(spine, p, rand) {
  const L = p.length;
  const geos = [];
  const base = new THREE.Color('#c9cbe4');
  const tipC = new THREE.Color('#f3f1f8');
  for (let i = 0; i < p.downCount; i++) {
    const s0 = 0.05 + rand() * (p.quillEnd + 0.16 - 0.05);
    const c = spine.getPointAt(s0);
    const { T, N, B } = frameAt(spine, s0);
    const side = rand() < 0.5 ? -1 : 1;
    const len = L * (0.05 + rand() * 0.11) * (1 - (s0 - 0.05) * 1.4);
    const ang = (0.5 + rand() * 0.9) * side;
    const dirv = new THREE.Vector3()
      .addScaledVector(N, Math.sin(ang))
      .addScaledVector(T, -0.25 + rand() * 0.5)
      .addScaledVector(B, (rand() - 0.5) * 0.8)
      .normalize();
    const pts = [];
    const wob = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(0.5);
    for (let k = 0; k <= 6; k++) {
      const t = k / 6;
      pts.push(
        c
          .clone()
          .addScaledVector(dirv, len * t)
          .addScaledVector(T, -len * 0.25 * t * t)
          .addScaledVector(wob, len * Math.sin(t * Math.PI * 1.5) * 0.35),
      );
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    geos.push(
      buildTube(
        curve,
        10,
        3,
        (t) => L * 0.0016 * (1 - t * 0.9),
        (t) => new THREE.Color().copy(base).lerp(tipC, t),
      ),
    );
  }
  return mergeGeometries(geos);
}

function mergeGeometries(geos) {
  let vCount = 0;
  let iCount = 0;
  geos.forEach((g) => {
    vCount += g.attributes.position.count;
    iCount += g.index.count;
  });
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const col = new Float32Array(vCount * 3);
  const idx = new Uint32Array(iCount);
  let vo = 0;
  let io = 0;
  geos.forEach((g) => {
    pos.set(g.attributes.position.array, vo * 3);
    nor.set(g.attributes.normal.array, vo * 3);
    col.set(g.attributes.color.array, vo * 3);
    for (let i = 0; i < g.index.count; i++) idx[io + i] = g.index.array[i] + vo;
    vo += g.attributes.position.count;
    io += g.index.count;
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

export function createFeather(overrides = {}) {
  const p = { ...defaultParams, ...overrides };
  const rand = mulberry32(p.seed);
  const spine = makeSpine(p.length);

  const vaneMat = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.55,
    metalness: 0,
    sheen: 1,
    sheenRoughness: 0.35,
    sheenColor: new THREE.Color('#ffffff'),
    side: THREE.DoubleSide,
  });
  const rachisMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4 });
  const downMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide });

  const group = new THREE.Group();
  group.name = 'Pluma';

  const right = new THREE.Mesh(buildVane(spine, p, 1, rand), vaneMat);
  right.name = 'Vexilo_derecho';
  const left = new THREE.Mesh(buildVane(spine, p, -1, rand), vaneMat);
  left.name = 'Vexilo_izquierdo';
  const rachis = new THREE.Mesh(buildRachis(spine, p), rachisMat);
  rachis.name = 'Raquis';
  const down = new THREE.Mesh(buildDown(spine, p, rand), downMat);
  down.name = 'Plumon';

  group.add(right, left, rachis, down);

  // Centrar verticalmente para que rote alrededor de su centro.
  const box = new THREE.Box3().setFromObject(group);
  const center = box.getCenter(new THREE.Vector3());
  group.children.forEach((m) => m.position.sub(center));
  return group;
}
