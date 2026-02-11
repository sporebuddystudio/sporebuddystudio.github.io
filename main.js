import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

const canvas = document.getElementById("c");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.z = 12;

// -------------------- Tuning --------------------
const CONFIG = {
  count: 1600,
  spreadX: 22,
  spreadY: 12,
  spreadZ: 22,

  // center density (smaller = denser center)
  centerSigma: 0.42,

  // base drift
  driftStrength: 0.12,
  damping: 0.92,

  // look
  baseColor: 0x3fd0c9,
  hoverColor: 0xffffff,
  atomColorBoost: 1.35, // how bright captured particles get

  // particle size (world->screen handled by shader)
  sizeMin: 0.22,
  sizeMax: 0.62,

  // mouse influence
  influenceRadius: 2.6,
  repulseStrength: 1.25,
  colorLerpSpeed: 7.0,     // higher = faster smooth color

  // atom mode
  atomPullStrength: 1.8,
  atomOrbitStrength: 0.9,
  atomTargetRadiusMin: 0.55,
  atomTargetRadiusMax: 1.35,
  atomCaptureRadius: 2.8,
  atomCaptureRate: 0.14,   // fraction of nearby particles that can be captured per second-ish
};

// -------------------- Helpers --------------------
const baseCol = new THREE.Color(CONFIG.baseColor);
const hoverCol = new THREE.Color(CONFIG.hoverColor);

function clamp01(x) { return Math.max(0, Math.min(1, x)); }
function smoothstep(a, b, x) {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

// gaussian-ish random (Box-Muller)
function randN() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

// -------------------- Geometry + simulation buffers --------------------
const N = CONFIG.count;

const positions = new Float32Array(N * 3);
const velocities = new Float32Array(N * 3);
const sizes = new Float32Array(N);
const phases = new Float32Array(N);

const colors = new Float32Array(N * 3);       // current color (smooth)
const colorsTarget = new Float32Array(N * 3); // target color
const atomStrength = new Float32Array(N);     // 0..1 (captured / orbiting)
const atomAngle = new Float32Array(N);
const atomRadius = new Float32Array(N);

for (let i = 0; i < N; i++) {
  const i3 = i * 3;

  // Dense center distribution using gaussian
  const gx = randN() * CONFIG.centerSigma;
  const gy = randN() * CONFIG.centerSigma;
  const gz = randN() * CONFIG.centerSigma;

  positions[i3 + 0] = gx * CONFIG.spreadX;
  positions[i3 + 1] = gy * CONFIG.spreadY;
  positions[i3 + 2] = gz * CONFIG.spreadZ;

  velocities[i3 + 0] = (Math.random() - 0.5) * 0.04;
  velocities[i3 + 1] = (Math.random() - 0.5) * 0.04;
  velocities[i3 + 2] = (Math.random() - 0.5) * 0.04;

  sizes[i] = CONFIG.sizeMin + Math.random() * (CONFIG.sizeMax - CONFIG.sizeMin);
  phases[i] = Math.random() * Math.PI * 2;

  // init colors to base
  colors[i3 + 0] = baseCol.r;
  colors[i3 + 1] = baseCol.g;
  colors[i3 + 2] = baseCol.b;

  colorsTarget[i3 + 0] = baseCol.r;
  colorsTarget[i3 + 1] = baseCol.g;
  colorsTarget[i3 + 2] = baseCol.b;

  atomStrength[i] = 0;                         // not captured
  atomAngle[i] = Math.random() * Math.PI * 2;
  atomRadius[i] = CONFIG.atomTargetRadiusMin + Math.random() * (CONFIG.atomTargetRadiusMax - CONFIG.atomTargetRadiusMin);
}

const geo = new THREE.BufferGeometry();
geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
geo.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
geo.computeBoundingSphere();

// -------------------- Soft “spore” shader --------------------
const mat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  vertexColors: true,
  uniforms: {
    uTime: { value: 0 },
    uOpacity: { value: 0.85 },
    uScale: { value: 1.0 },
    uPulseSpeed: { value: 1.1 },
    uPulseAmount: { value: 0.16 },
  },
  vertexShader: `
    attribute float aSize;
    attribute float aPhase;
    attribute vec3 color;

    uniform float uTime;
    uniform float uScale;
    uniform float uPulseSpeed;
    uniform float uPulseAmount;

    varying vec3 vColor;
    varying float vPulse;
    varying float vFade;

    void main() {
      vec3 p = position;

      // very subtle breathing (per particle)
      float s = sin(uTime * uPulseSpeed + aPhase);
      vPulse = 1.0 + s * uPulseAmount;

      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      float dist = -mv.z;

      // size attenuation + pulse
      gl_PointSize = aSize * vPulse * uScale * (260.0 / max(dist, 0.001));
      gl_Position = projectionMatrix * mv;

      // fade far
      vFade = clamp(1.15 - dist * 0.075, 0.12, 1.0);

      vColor = color;
    }
  `,
  fragmentShader: `
    uniform float uOpacity;
    varying vec3 vColor;
    varying float vPulse;
    varying float vFade;

    void main() {
      vec2 uv = gl_PointCoord - vec2(0.5);
      float d = length(uv);

      // Soft spore: bright core + very soft halo
      float core = smoothstep(0.22, 0.0, d);
      float halo = smoothstep(0.55, 0.18, d) * 0.55;

      float a = (core + halo) * uOpacity * vFade;

      // tiny pulse on alpha too
      a *= clamp(vPulse, 0.75, 1.25);

      gl_FragColor = vec4(vColor, a);
    }
  `,
});

const points = new THREE.Points(geo, mat);
scene.add(points);

// -------------------- Mouse mapping (screen -> world on z=0 plane) --------------------
const mouseNDC = new THREE.Vector2(0, 0);
const raycaster = new THREE.Raycaster();
const planeZ = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0); // z=0
const mouseWorld = new THREE.Vector3(0, 0, 0);

let targetParX = 0, targetParY = 0;
let curParX = 0, curParY = 0;

function updateMouseWorld(nx, ny) {
  mouseNDC.set(nx, ny);
  raycaster.setFromCamera(mouseNDC, camera);
  raycaster.ray.intersectPlane(planeZ, mouseWorld);
}

window.addEventListener("pointermove", (e) => {
  const w = window.innerWidth || 1;
  const h = window.innerHeight || 1;

  const nx = (e.clientX / w) * 2 - 1;
  const ny = (e.clientY / h) * 2 - 1;

  targetParX = nx;
  targetParY = ny;

  updateMouseWorld(nx, -ny);
}, { passive: true });

// -------------------- Atom mode toggle --------------------
let atomMode = false;
window.addEventListener("pointerdown", (e) => {
  // toggle on click (left button)
  if (e.button !== 0) return;
  atomMode = !atomMode;
}, { passive: true });

// -------------------- Resize --------------------
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

// -------------------- Main loop --------------------
const clock = new THREE.Clock();

function tick() {
  const t = clock.getElapsedTime();
  const dt = Math.min(clock.getDelta(), 0.033); // clamp dt

  mat.uniforms.uTime.value = t;

  // Parallax (very subtle)
  curParX += (targetParX - curParX) * 0.035;
  curParY += (targetParY - curParY) * 0.035;
  points.rotation.y = curParX * 0.18;
  points.rotation.x = -curParY * 0.12;
  points.rotation.z += 0.00045;

  const r = CONFIG.influenceRadius;
  const r2 = r * r;

  const captureR = CONFIG.atomCaptureRadius;
  const captureR2 = captureR * captureR;

  // Simulation
  for (let i = 0; i < N; i++) {
    const i3 = i * 3;

    const px = positions[i3 + 0];
    const py = positions[i3 + 1];
    const pz = positions[i3 + 2];

    let vx = velocities[i3 + 0];
    let vy = velocities[i3 + 1];
    let vz = velocities[i3 + 2];

    // Base drift (small)
    vx += (Math.sin(t * 0.35 + px * 0.18) * 0.004) * CONFIG.driftStrength;
    vy += (Math.cos(t * 0.33 + py * 0.22) * 0.004) * CONFIG.driftStrength;
    vz += (Math.sin(t * 0.25 + pz * 0.20) * 0.003) * CONFIG.driftStrength;

    // Mouse influence in world XY (plane z=0)
    const dx = px - mouseWorld.x;
    const dy = py - mouseWorld.y;
    const d2 = dx * dx + dy * dy;

    // --- Color target based on distance & atom state ---
    // Default target: base color (maybe boosted if captured)
    const boost = 1.0 + atomStrength[i] * (CONFIG.atomColorBoost - 1.0);

    // base boosted color (computed per particle)
    // (we keep it super cheap: just scale rgb and clamp)
    const baseR = Math.min(1.0, baseCol.r * boost);
    const baseG = Math.min(1.0, baseCol.g * boost);
    const baseB = Math.min(1.0, baseCol.b * boost);

    let tr = baseR, tg = baseG, tb = baseB;

    // if inside mouse influence, blend towards hover color
    if (d2 < r2) {
      const d = Math.sqrt(d2);
      const w = 1.0 - smoothstep(0.0, r, d); // 1 at center, 0 at edge
      tr = baseR + (hoverCol.r - baseR) * w;
      tg = baseG + (hoverCol.g - baseG) * w;
      tb = baseB + (hoverCol.b - baseB) * w;

      // Repulsion (smooth)
      const repel = w * CONFIG.repulseStrength;
      const inv = 1.0 / (d + 0.0001);
      vx += dx * inv * repel * dt;
      vy += dy * inv * repel * dt;
    }

    // ---------------- Atom mode behavior ----------------
    if (atomMode) {
      // Capture near mouse gradually
      if (d2 < captureR2) {
        // probabilistic-ish capture rate, smooth & light
        const d = Math.sqrt(d2);
        const w = 1.0 - smoothstep(0.0, captureR, d);
        const add = w * CONFIG.atomCaptureRate * 60.0 * dt; // scaled to feel “frame rate independent”
        atomStrength[i] = Math.min(1.0, atomStrength[i] + add);
      } else {
        // slowly release if far (optional: keep them captured forever if you want)
        atomStrength[i] = Math.max(0.0, atomStrength[i] - 0.05 * dt);
      }

      const a = atomStrength[i];

      if (a > 0.001) {
        // Pull towards orbit ring around mouse + tangential velocity (electrons)
        const d = Math.sqrt(d2);
        const inv = 1.0 / (d + 0.0001);

        // Radial pull to a target radius
        const targetR = atomRadius[i];
        const radialErr = (d - targetR);

        // Pull back towards ring
        const pull = -radialErr * CONFIG.atomPullStrength * a;
        vx += dx * inv * pull * dt;
        vy += dy * inv * pull * dt;

        // Tangential orbit
        // tangent = perpendicular to (dx,dy)
        const tx = -dy * inv;
        const ty = dx * inv;
        const orbit = CONFIG.atomOrbitStrength * a;
        vx += tx * orbit * dt;
        vy += ty * orbit * dt;

        // A tiny “spin up” over time
        atomAngle[i] += (0.25 + a * 0.35) * dt;
      }
    } else {
      // if atom mode off, slowly release capture
      atomStrength[i] = Math.max(0.0, atomStrength[i] - 0.18 * dt);
    }

    // Damping
    vx *= CONFIG.damping;
    vy *= CONFIG.damping;
    vz *= CONFIG.damping;

    // Integrate
    positions[i3 + 0] = px + vx;
    positions[i3 + 1] = py + vy;
    positions[i3 + 2] = pz + vz;

    velocities[i3 + 0] = vx;
    velocities[i3 + 1] = vy;
    velocities[i3 + 2] = vz;

    // Soft bounds (keep cloud centered)
    if (positions[i3 + 0] > CONFIG.spreadX) velocities[i3 + 0] -= 0.02;
    if (positions[i3 + 0] < -CONFIG.spreadX) velocities[i3 + 0] += 0.02;
    if (positions[i3 + 1] > CONFIG.spreadY) velocities[i3 + 1] -= 0.02;
    if (positions[i3 + 1] < -CONFIG.spreadY) velocities[i3 + 1] += 0.02;
    if (positions[i3 + 2] > CONFIG.spreadZ) velocities[i3 + 2] -= 0.02;
    if (positions[i3 + 2] < -CONFIG.spreadZ) velocities[i3 + 2] += 0.02;

    // Write target color into target array
    colorsTarget[i3 + 0] = tr;
    colorsTarget[i3 + 1] = tg;
    colorsTarget[i3 + 2] = tb;

    // Smooth color towards target
    const lerp = 1.0 - Math.exp(-CONFIG.colorLerpSpeed * dt);
    colors[i3 + 0] += (colorsTarget[i3 + 0] - colors[i3 + 0]) * lerp;
    colors[i3 + 1] += (colorsTarget[i3 + 1] - colors[i3 + 1]) * lerp;
    colors[i3 + 2] += (colorsTarget[i3 + 2] - colors[i3 + 2]) * lerp;
  }

  geo.getAttribute("position").needsUpdate = true;
  geo.getAttribute("color").needsUpdate = true;

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

tick();
