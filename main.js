import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

const canvas = document.getElementById("c");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.z = 12;

// ---------------- Tuning ----------------
const CFG = {
  count: 800,

  spreadX: 15,
  spreadY: 12,
  spreadZ: 15,

  // densità centro: più basso = più denso
  centerSigma: 0.25,

  // dinamica
  damping: 0.92,
  drift: 0.012,

  // mouse influence (repulsione + colore)
  influenceRadius: 2.8,
  repulseStrength: 1.45,
  colorSmooth: 9.0, // smoothing colore (più alto = più rapido)

  // atom mode (click)
  atomCaptureRadius: 3.0,
  atomCaptureSpeed: 0.9, // velocità con cui “cattura” (0..1 per sec circa)
  atomPullStrength: 2.0,
  atomOrbitStrength: 1.1,
  atomReleaseSpeed: 0.25, // se atom mode OFF, quanto rilascia
  atomBoostMax: 1.45, // quanto diventa “acceso” il colore base quando catturato

  // look
  baseColor: new THREE.Color(0x3fd0c9),
  hoverColor: new THREE.Color(0xffffff),
  size: 0.5, // dimensione base spore
  opacity: 0.85,
};

// ------------- Helpers -------------
function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}
function smoothstep(a, b, x) {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

// gaussian-ish random (Box-Muller)
function randN() {
  let u = 0,
    v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// --- soft spore sprite (canvas texture) ---
function makeSoftDotTexture(sizePx = 128) {
  const c = document.createElement("canvas");
  c.width = c.height = sizePx;
  const ctx = c.getContext("2d");

  const cx = sizePx / 2;
  const cy = sizePx / 2;
  const r = sizePx / 2;

  // Radial gradient: core + halo morbido
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0.0, "rgba(255,255,255,1.00)");
  g.addColorStop(0.12, "rgba(255,255,255,0.95)");
  g.addColorStop(0.3, "rgba(255,255,255,0.35)");
  g.addColorStop(0.55, "rgba(255,255,255,0.10)");
  g.addColorStop(1.0, "rgba(255,255,255,0.00)");

  ctx.fillStyle = g;
  ctx.fillRect(0, 0, sizePx, sizePx);

  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

const dotTex = makeSoftDotTexture(128);

// ------------- Buffers -------------
const N = CFG.count;

const positions = new Float32Array(N * 3);
const velocities = new Float32Array(N * 3);
const colors = new Float32Array(N * 3);

// atom state: 0..1
const atom = new Float32Array(N);
const atomRadius = new Float32Array(N);

for (let i = 0; i < N; i++) {
  const i3 = i * 3;

  // densità al centro
  const gx = randN() * CFG.centerSigma;
  const gy = randN() * CFG.centerSigma;
  const gz = randN() * CFG.centerSigma;

  positions[i3 + 0] = gx * CFG.spreadX;
  positions[i3 + 1] = gy * CFG.spreadY;
  positions[i3 + 2] = gz * CFG.spreadZ;

  velocities[i3 + 0] = (Math.random() - 0.5) * 0.04;
  velocities[i3 + 1] = (Math.random() - 0.5) * 0.04;
  velocities[i3 + 2] = (Math.random() - 0.5) * 0.04;

  colors[i3 + 0] = CFG.baseColor.r;
  colors[i3 + 1] = CFG.baseColor.g;
  colors[i3 + 2] = CFG.baseColor.b;

  atom[i] = 0;
  atomRadius[i] = 0.55 + Math.random() * 1.0;
}

const geo = new THREE.BufferGeometry();
geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

const mat = new THREE.PointsMaterial({
  size: CFG.size,
  sizeAttenuation: true,
  transparent: true,
  opacity: CFG.opacity,
  vertexColors: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  map: dotTex,
});

const points = new THREE.Points(geo, mat);
scene.add(points);

// ------------- Mouse world on z=0 plane (NO raycaster, NO NaN) -------------
const mouseWorld = new THREE.Vector3(0, 0, 0);
const ndc3 = new THREE.Vector3(0, 0, 0);

let targetParX = 0,
  targetParY = 0;
let curParX = 0,
  curParY = 0;

function updateMouseWorld(nx, ny) {
  // NDC -> World on plane z=0
  ndc3.set(nx, ny, 0.5);
  ndc3.unproject(camera);

  const dir = ndc3.sub(camera.position).normalize();

  // if dir.z is ~0, avoid division by zero
  const dz = dir.z;
  if (Math.abs(dz) < 1e-6) return;

  const distance = -camera.position.z / dz;
  mouseWorld.copy(camera.position).add(dir.multiplyScalar(distance));
}

window.addEventListener(
  "pointermove",
  (e) => {
    const w = window.innerWidth || 1;
    const h = window.innerHeight || 1;

    const nx = (e.clientX / w) * 2 - 1;
    const ny = (e.clientY / h) * 2 - 1;

    targetParX = nx;
    targetParY = ny;

    // IMPORTANT: no invert here
    updateMouseWorld(nx, -ny);
  },
  { passive: true }
);

// ------------- Atom mode toggle -------------
let atomMode = false;
window.addEventListener(
  "pointerdown",
  (e) => {
    if (e.button !== 0) return;
    atomMode = !atomMode;
  },
  { passive: true }
);

// ------------- Resize -------------
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

// ------------- Loop -------------
const clock = new THREE.Clock();

function tick() {
  const t = clock.getElapsedTime();
  const dt = Math.min(clock.getDelta(), 0.033);

  // parallax leggerissimo
  curParX += (targetParX - curParX) * 0.04;
  curParY += (targetParY - curParY) * 0.04;

  points.rotation.y = curParX * 0.18;
  points.rotation.x = -curParY * 0.12;
  points.rotation.z += 0.00035;

  const r = CFG.influenceRadius;
  const r2 = r * r;

  const capR = CFG.atomCaptureRadius;
  const capR2 = capR * capR;

  for (let i = 0; i < N; i++) {
    const i3 = i * 3;

    let px = positions[i3 + 0];
    let py = positions[i3 + 1];
    let pz = positions[i3 + 2];

    let vx = velocities[i3 + 0];
    let vy = velocities[i3 + 1];
    let vz = velocities[i3 + 2];

    // drift base
    vx += Math.sin(t * 0.35 + px * 0.16) * CFG.drift * dt * 60;
    vy += Math.cos(t * 0.33 + py * 0.19) * CFG.drift * dt * 60;
    vz += Math.sin(t * 0.27 + pz * 0.14) * (CFG.drift * 0.7) * dt * 60;

    // distanza mouse (nel piano)
    const dx = px - mouseWorld.x;
    const dy = py - mouseWorld.y;
    const d2 = dx * dx + dy * dy;

    // --- atom capture/release ---
    if (atomMode) {
      if (d2 < capR2) {
        const d = Math.sqrt(d2);
        const w = 1.0 - smoothstep(0.0, capR, d);
        atom[i] = Math.min(1, atom[i] + w * CFG.atomCaptureSpeed * dt);
      } else {
        atom[i] = Math.max(0, atom[i] - CFG.atomReleaseSpeed * 0.2 * dt);
      }
    } else {
      atom[i] = Math.max(0, atom[i] - CFG.atomReleaseSpeed * dt);
    }

    // --- repulsione + hover color ---
    let influence = 0;
    if (d2 < r2) {
      const d = Math.sqrt(d2);
      influence = 1.0 - smoothstep(0.0, r, d);

      const inv = 1.0 / (d + 0.0001);
      const repel = influence * CFG.repulseStrength;

      vx += dx * inv * repel * dt;
      vy += dy * inv * repel * dt;
    }

    // --- atom dynamics: pull verso ring + orbit ---
    const a = atom[i];
    if (a > 0.001) {
      const d = Math.sqrt(d2);
      const inv = 1.0 / (d + 0.0001);

      // pull verso il raggio target
      const err = d - atomRadius[i];
      const pull = -err * CFG.atomPullStrength * a;
      vx += dx * inv * pull * dt;
      vy += dy * inv * pull * dt;

      // orbit (tangente)
      const tx = -dy * inv;
      const ty = dx * inv;
      const orbit = CFG.atomOrbitStrength * a;
      vx += tx * orbit * dt;
      vy += ty * orbit * dt;
    }

    // damping
    vx *= CFG.damping;
    vy *= CFG.damping;
    vz *= CFG.damping;

    // integrate
    px += vx;
    py += vy;
    pz += vz;

    // soft bounds
    if (px > CFG.spreadX) vx -= 0.02;
    if (px < -CFG.spreadX) vx += 0.02;
    if (py > CFG.spreadY) vy -= 0.02;
    if (py < -CFG.spreadY) vy += 0.02;
    if (pz > CFG.spreadZ) vz -= 0.02;
    if (pz < -CFG.spreadZ) vz += 0.02;

    positions[i3 + 0] = px;
    positions[i3 + 1] = py;
    positions[i3 + 2] = pz;

    velocities[i3 + 0] = vx;
    velocities[i3 + 1] = vy;
    velocities[i3 + 2] = vz;

    // --- smooth color ---
    const boost = 1.0 + a * (CFG.atomBoostMax - 1.0);
    const br = Math.min(1.0, CFG.baseColor.r * boost);
    const bg = Math.min(1.0, CFG.baseColor.g * boost);
    const bb = Math.min(1.0, CFG.baseColor.b * boost);

    const tr = br + (CFG.hoverColor.r - br) * influence;
    const tg = bg + (CFG.hoverColor.g - bg) * influence;
    const tb = bb + (CFG.hoverColor.b - bb) * influence;

    const lerp = 1.0 - Math.exp(-CFG.colorSmooth * dt);
    colors[i3 + 0] += (tr - colors[i3 + 0]) * lerp;
    colors[i3 + 1] += (tg - colors[i3 + 1]) * lerp;
    colors[i3 + 2] += (tb - colors[i3 + 2]) * lerp;
  }

  geo.getAttribute("position").needsUpdate = true;
  geo.getAttribute("color").needsUpdate = true;

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

tick();
