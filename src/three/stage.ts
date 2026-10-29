// Escena única de la pluma: vive detrás de la interfaz y cada pantalla le pide un estado.
import * as THREE from 'three';
import { createFeather } from './feather.js';

export type FeatherMode = 'splash' | 'home' | 'hidden';

interface Pose {
  x: number; // centro en px de pantalla
  y: number;
  h: number; // alto en px
  tilt: number; // inclinación (rad)
  opacity: number;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function studioEnvironment(renderer: THREE.WebGLRenderer) {
  const env = new THREE.Scene();
  const dome = new THREE.SphereGeometry(10, 32, 16);
  const cols: number[] = [];
  const pos = dome.attributes.position;
  const low = new THREE.Color('#0a0d16');
  const mid = new THREE.Color('#3a4252');
  const high = new THREE.Color('#9aa3b4');
  for (let i = 0; i < pos.count; i++) {
    const h = pos.getY(i) / 10;
    const c = h < 0 ? low.clone().lerp(mid, h + 1) : mid.clone().lerp(high, h);
    cols.push(c.r, c.g, c.b);
  }
  dome.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  env.add(new THREE.Mesh(dome, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const strip = (w: number, h: number, x: number, y: number, z: number, k: number, tint = '#ffffff') => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(tint).multiplyScalar(k), side: THREE.DoubleSide }),
    );
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    env.add(m);
  };
  strip(1.2, 9, -6, 2, 5, 6);
  strip(0.8, 9, 7, 1, 2, 4, '#e8eefc');
  strip(10, 1.5, 0, 8, -2, 3);
  strip(3, 3, 2, -2, 8, 1.2, '#d6deef');
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(env, 0.02).texture;
  pm.dispose();
  return tex;
}

export class FeatherStage {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private feather: THREE.Group;
  private baseHeight: number;
  private ink: THREE.MeshPhysicalMaterial | null;
  private raf = 0;
  private last = 0;
  private spin = 0;
  private spinBoost = 0;
  private mode: FeatherMode = 'hidden';
  private anchor: DOMRect | null = null;
  private cur: Pose = { x: 0, y: 0, h: 0, tilt: 0.3, opacity: 0 };
  private pointer = { x: 0, y: 0 };
  private celebrateUntil = 0;
  private hiddenSince = 0;
  reduced = false;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.scene.environment = studioEnvironment(this.renderer);
    const key = new THREE.DirectionalLight('#ffffff', 1.4);
    key.position.set(-3, 4, 5);
    const rim = new THREE.DirectionalLight('#dbe5ff', 2.0);
    rim.position.set(4, 1, -4);
    this.scene.add(key, rim);
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.05, 100);
    this.camera.position.set(0, 0, 10);
    this.feather = createFeather({ seed: 11 });
    this.scene.add(this.feather);
    const box = new THREE.Box3().setFromObject(this.feather);
    this.baseHeight = box.max.y - box.min.y;
    const tinta = this.feather.getObjectByName('Tinta') as THREE.Mesh | undefined;
    this.ink = (tinta?.material as THREE.MeshPhysicalMaterial) ?? null;
    this.resize();
    addEventListener('resize', this.resize);
    addEventListener('pointermove', this.onPointer, { passive: true });
    addEventListener('deviceorientation', this.onTilt, { passive: true });
    this.cur = { ...this.targetPose(), opacity: 0 };
  }

  private resize = () => {
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.wake();
  };

  private onPointer = (e: PointerEvent) => {
    this.pointer.x = (e.clientX / innerWidth) * 2 - 1;
    this.pointer.y = (e.clientY / innerHeight) * 2 - 1;
    if (this.mode === 'home') this.wake();
  };

  private onTilt = (e: DeviceOrientationEvent) => {
    if (e.gamma == null || e.beta == null) return;
    this.pointer.x = Math.max(-1, Math.min(1, e.gamma / 35));
    this.pointer.y = Math.max(-1, Math.min(1, (e.beta - 45) / 35));
    if (this.mode === 'home') this.wake();
  };

  setMode(mode: FeatherMode, anchor?: DOMRect | null) {
    this.mode = mode;
    if (anchor !== undefined) this.anchor = anchor;
    this.wake();
  }

  setAnchor(anchor: DOMRect | null) {
    this.anchor = anchor;
    this.wake();
  }

  // Giro rápido al cambiar de pantalla.
  transition() {
    this.spinBoost = 9;
    this.wake();
  }

  // Medio giro y destello al guardar o exportar.
  celebrate() {
    this.celebrateUntil = performance.now() + 1500;
    this.spinBoost = 7;
    this.wake();
  }

  private targetPose(): Pose {
    const W = innerWidth;
    const H = innerHeight;
    const now = performance.now();
    if (now < this.celebrateUntil) {
      const h = Math.min(170, H * 0.22);
      const desktop = W >= 1024;
      return { x: W - (desktop ? 120 : 70), y: H - h / 2 - (desktop ? 40 : 110), h, tilt: 0.45, opacity: 1 };
    }
    if (this.mode === 'splash') {
      const h = Math.min(H * 0.56, 560);
      return { x: W / 2, y: H * 0.4, h, tilt: 0.25, opacity: 1 };
    }
    if (this.mode === 'home' && this.anchor) {
      const r = this.anchor;
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, h: r.height, tilt: 0.32, opacity: 1 };
    }
    return { ...this.cur, opacity: 0 };
  }

  wake() {
    if (this.raf) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number) => {
    this.raf = 0;
    const dt = Math.max(0, Math.min(0.05, (now - this.last) / 1000));
    this.last = now;
    const target = this.targetPose();
    const k = 1 - Math.exp(-dt * (this.reduced ? 20 : 7));
    this.cur.x = lerp(this.cur.x, target.x, k);
    this.cur.y = lerp(this.cur.y, target.y, k);
    this.cur.h = lerp(this.cur.h, target.h, k);
    this.cur.tilt = lerp(this.cur.tilt, target.tilt, k);
    this.cur.opacity = lerp(this.cur.opacity, target.opacity, 1 - Math.exp(-dt * 9));

    const baseSpin = this.reduced ? 0 : this.mode === 'splash' ? 0.9 : 0.22;
    this.spinBoost *= Math.exp(-dt * 2.2);
    this.spin += dt * (baseSpin + this.spinBoost);

    // Pantalla → mundo (plano z = 0).
    const viewH = 2 * this.camera.position.z * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const px = viewH / innerHeight;
    const g = this.feather;
    g.position.set((this.cur.x - innerWidth / 2) * px, -(this.cur.y - innerHeight / 2) * px, 0);
    g.scale.setScalar(Math.max(0.0001, (this.cur.h * px) / this.baseHeight));
    const follow = this.mode === 'home' && !this.reduced ? 1 : 0;
    g.rotation.z = -this.cur.tilt + this.pointer.x * 0.12 * follow;
    g.rotation.x = this.pointer.y * 0.25 * follow;
    g.rotation.y = this.spin + this.pointer.x * 0.5 * follow;
    if (!this.reduced) g.position.y += Math.sin(now / 1400) * 0.04 * (this.cur.h * px);

    if (this.ink) {
      const s = Math.sin(now / 900);
      this.ink.iridescenceThicknessRange = [150 + 60 * s, 1300 + 150 * s];
      this.ink.iridescenceThicknessMap?.offset.set(now / 9000, now / 13000);
    }

    this.canvas.style.opacity = this.cur.opacity.toFixed(3);
    if (this.cur.opacity > 0.005) this.renderer.render(this.scene, this.camera);

    // Duerme cuando no hay nada que mover.
    const idle = target.opacity === 0 && this.cur.opacity < 0.01;
    if (idle) {
      this.hiddenSince ||= now;
      if (now - this.hiddenSince > 300) return;
    } else this.hiddenSince = 0;
    if (this.reduced && !idle && Math.abs(this.cur.h - target.h) < 0.5 && Math.abs(this.cur.opacity - target.opacity) < 0.01 && now > this.celebrateUntil) {
      this.renderer.render(this.scene, this.camera);
      return; // en modo reducido no hay animación continua
    }
    this.raf = requestAnimationFrame(this.frame);
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    removeEventListener('resize', this.resize);
    removeEventListener('pointermove', this.onPointer);
    removeEventListener('deviceorientation', this.onTilt);
    this.renderer.dispose();
  }
}
