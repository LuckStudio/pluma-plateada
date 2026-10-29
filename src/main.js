import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createFeather } from './feather.js';

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.appendChild(renderer.domElement);

// Entorno de estudio nocturno: cúpula azul noche + tiras de luz que dibujan los reflejos en la plata.
function studioEnvironment() {
  const env = new THREE.Scene();
  const dome = new THREE.SphereGeometry(10, 32, 16);
  const cols = [];
  const pos = dome.attributes.position;
  const low = new THREE.Color('#05070e');
  const mid = new THREE.Color('#252c3a');
  const high = new THREE.Color('#7c8494');
  for (let i = 0; i < pos.count; i++) {
    const h = pos.getY(i) / 10;
    const c = h < 0 ? low.clone().lerp(mid, h + 1) : mid.clone().lerp(high, h);
    cols.push(c.r, c.g, c.b);
  }
  dome.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  env.add(new THREE.Mesh(dome, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));

  const strip = (w, h, x, y, z, intensity, tint = '#ffffff') => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(tint).multiplyScalar(intensity), side: THREE.DoubleSide }),
    );
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    env.add(m);
  };
  strip(1.2, 9, -6, 2, 5, 6); // tira alta a la izquierda
  strip(0.8, 9, 7, 1, 2, 4, '#e8eefc'); // contraluz frío
  strip(10, 1.5, 0, 8, -2, 3); // cenital
  strip(3, 3, 2, -2, 8, 1.2, '#d6deef'); // relleno frío
  return new THREE.PMREMGenerator(renderer).fromScene(env, 0.02).texture;
}

const scene = new THREE.Scene();
scene.environment = studioEnvironment();

const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.05, 100);
camera.position.set(0, 0, 9);

const key = new THREE.DirectionalLight('#ffffff', 1.4);
key.position.set(-3, 4, 5);
const rim = new THREE.DirectionalLight('#dbe5ff', 2.0);
rim.position.set(4, 1, -4);
scene.add(key, rim);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;
controls.autoRotateSpeed = 0.8;

const feather = createFeather();
scene.add(feather);
const ink = feather.getObjectByName('Tinta').material;

// Útiles para depurar desde la consola.
Object.assign(window, { feather, camera, controls });

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

renderer.setAnimationLoop((time) => {
  const still = window.__still;
  if (!still) feather.position.y = Math.sin(time / 1400) * 0.06; // flotación suave
  // La película de la tinta "respira": los colores holográficos se desplazan lentamente.
  const k = still ? 0 : Math.sin(time / 900);
  ink.iridescenceThicknessRange = [150 + 60 * k, 1300 + 150 * k];
  if (!still) ink.iridescenceThicknessMap.offset.set(time / 9000, time / 13000);
  controls.autoRotate = !still;
  controls.update();
  renderer.render(scene, camera);
});
