import * as THREE from 'three';

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Marco local en la base de la pluma: d apunta hacia abajo (fuera de la pluma),
// B hacia el frente (lado convexo del plumín), N hacia un lateral.
export function nibFrame(spine) {
  const T = spine.getTangentAt(0).normalize();
  const N = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 0, 1), T).normalize();
  const B = new THREE.Vector3().crossVectors(T, N).normalize();
  return { o: spine.getPointAt(0), d: T.clone().negate(), N, B };
}

const at = (f, z, x, y) =>
  new THREE.Vector3().copy(f.o).addScaledVector(f.d, z).addScaledVector(f.N, x).addScaledVector(f.B, y);

function grid(pos, rows, cols, flip) {
  const idx = [];
  const stride = cols + 1;
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      const a = r * stride + k;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      if (flip) idx.push(a, b, c, b, d, c);
      else idx.push(a, c, b, b, c, d);
    }
  }
  const uv = [];
  for (let r = 0; r <= rows; r++) for (let k = 0; k <= cols; k++) uv.push(k / cols, r / rows);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Sólido de revolución a lo largo de d. prof = [[z, r], ...].
function revolve(f, prof, radial = 28) {
  const pos = [];
  for (const [z, r] of prof) {
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const p = at(f, z, Math.sin(a) * r, Math.cos(a) * r);
      pos.push(p.x, p.y, p.z);
    }
  }
  return grid(pos, prof.length - 1, radial, true);
}

// Geometría del plumín (dimensiones en fracción del largo de la pluma).
export function nibShape(L) {
  const z0 = 0.04 * L; // empieza dentro de la virola
  const len = 0.1 * L;
  const r0 = 0.0118 * L;
  return {
    z0,
    len,
    r0,
    radius: (t) => r0 * (1 - 0.6 * t),
    // Semiángulo del arco: envuelve casi todo el tubo y se cierra en punta.
    angle: (t) => 2.4 * Math.pow(1 - smooth(0.12, 1, t), 1.6) + 0.012,
    // El plumín se curva un poco hacia el papel.
    bend: (t) => -0.3 * r0 * t * t,
    // Respiradero (agujero) y hendidura hasta la punta.
    gap: (t) => {
      const hole = Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.42) / 0.045, 2))) * 0.3;
      const slit = t > 0.42 ? 0.012 : 0;
      return Math.max(hole, slit);
    },
  };
}

export function buildFerrule(f, L) {
  const z0 = -0.012 * L;
  const z1 = 0.046 * L;
  const r = 0.0142 * L;
  const bead = (z) => [
    [z - 0.0025 * L, r],
    [z - 0.0012 * L, r * 1.07],
    [z + 0.0012 * L, r * 1.07],
    [z + 0.0025 * L, r],
  ];
  return revolve(f, [
    [z0, 0],
    [z0, r * 0.92],
    [z0 + 0.001 * L, r],
    ...bead(z0 + 0.006 * L),
    ...bead(z1 - 0.006 * L),
    [z1 - 0.001 * L, r],
    [z1, r * 0.9],
    [z1, 0],
  ]);
}

export function buildNib(f, L) {
  const s = nibShape(L);
  const rows = 48;
  const cols = 22;
  const halves = [];
  for (const side of [1, -1]) {
    const pos = [];
    for (let r = 0; r <= rows; r++) {
      const t = r / rows;
      const rad = s.radius(t);
      const a1 = s.angle(t);
      const a0 = Math.min(s.gap(t), a1 * 0.9);
      for (let k = 0; k <= cols; k++) {
        const th = side * (a0 + (a1 - a0) * (k / cols));
        const p = at(f, s.z0 + t * s.len, Math.sin(th) * rad, Math.cos(th) * rad + s.bend(t));
        pos.push(p.x, p.y, p.z);
      }
    }
    halves.push(grid(pos, rows, cols, side < 0));
  }
  return halves;
}

// Tinta densa sobre el último tramo del plumín, con borde irregular y gota en la punta.
export function buildInk(f, L, rand) {
  const s = nibShape(L);
  const rows = 26;
  const cols = 40;
  const phase = rand() * 10;
  const pos = [];
  for (let r = 0; r <= rows; r++) {
    const v = r / rows;
    for (let k = 0; k <= cols; k++) {
      const q = k / cols;
      // Línea de tinta ondulada: sube más por el centro (capilaridad de la hendidura).
      const tStart = 0.58 + 0.06 * Math.abs(q - 0.5) * 2 + 0.025 * Math.sin(q * 11 + phase);
      const t = tStart + (1 - tStart) * v;
      const rad = s.radius(t);
      const a1 = s.angle(t) * 1.02;
      const th = (q * 2 - 1) * a1;
      const thick = 0.0005 * L + 0.0016 * L * smooth(0.82, 1, t) + 0.0005 * L * (1 - v) * (1 - v);
      const p = at(f, s.z0 + t * s.len, Math.sin(th) * (rad + thick), Math.cos(th) * (rad + thick) + s.bend(t));
      pos.push(p.x, p.y, p.z);
    }
  }
  const coat = grid(pos, rows, cols, false);

  // Gota: lágrima que nace en punta desde el plumín y se redondea abajo.
  const tip = s.z0 + s.len;
  const yTip = s.radius(1) + s.bend(1);
  const hDrop = 0.04 * L;
  const prof = [];
  const n = 28;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const r = 0.0118 * L * Math.sin(Math.PI * t) * Math.pow(Math.sin((Math.PI * t) / 2), 2.2);
    prof.push([tip - 0.006 * L + t * hDrop, r]);
  }
  const dropFrame = { ...f, o: at(f, 0, 0, yTip) };
  const drop = revolve(dropFrame, prof, 32);
  return [coat, drop];
}
