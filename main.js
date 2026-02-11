import * as THREE from "https://unpkg.com/three@0.159.0/build/three.module.js";

/* ---------------- tuning ----------------
  Nota pratica:
  - “LIVE”: cambia subito (materiale/simulazione/camera)
  - “REBUILD TEXTURE”: rigenera sprite alone+core
  - “REBUILD ALL”: ricrea anche buffer/COUNT (quando cambi count)
*/

const CFG = {
  PARTICLES: {
    // --- quantità ---
    count: 2500,                 // [REBUILD ALL] numero di particelle

    // legacy (non usato per spawn, lasciato per compatibilità mentale)
    spreadX: 14,
    spreadY: 14,
    spreadZ: 10,

    // --- volume (camera-space) ---
    depthNear: 1.5,              // [LIVE] distanza minima davanti alla camera (più piccolo = più vicino)
    depthFar: 12.0,              // [LIVE] distanza massima davanti alla camera (più grande = più profondo)

    // --- simulazione ---
    damping: 0.98,               // [LIVE] 1=nessuna perdita, <1 smorza velocità nel tempo
    driftXY: 0.02,               // [LIVE] “rumore” random in X/Y (quanto si muovono da sole)
    driftZ: 0.01,                // [LIVE] rumore random in Z

    // --- look base ---
    color: 0x3fd0c9,             // [LIVE*] colore base (qui lo modifichi da codice)
    size: 0.12,                  // [LIVE] dimensione point
    opacity: 1.0,                // [LIVE] opacità
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,

    // --- sprite / texture ---
    texSizePx: 256,              // [REBUILD TEXTURE] risoluzione sprite
    haloInner: 0.42,             // [REBUILD TEXTURE] stop interno alone (0..1)
    haloMid: 0.75,               // [REBUILD TEXTURE] stop medio alone (0..1)
    haloAlphaMid: 0.22,          // [REBUILD TEXTURE] alpha a metà alone
    haloAlphaInner: 0.60,        // [REBUILD TEXTURE] alpha al centro alone
    coreRadius: 0.31,            // [REBUILD TEXTURE] raggio core pieno (0..1 del raggio sprite)
    coreAlpha: 1.0,              // [REBUILD TEXTURE] alpha del core
    coreSoftness: 0.03,          // [REBUILD TEXTURE] morbidezza bordo core (0..1)
  },

  CAMERA: {
    fov: 80,                     // [LIVE] cambia ampiezza “wide” della scena
    z: 12                        // [LIVE] posizione camera (di solito non serve toccarla)
  }
};

/* ---------------- renderer ---------------- */

const canvas = document.getElementById("c");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0);

/* ---------------- scene & camera ---------------- */

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  CFG.CAMERA.fov,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camera.position.z = CFG.CAMERA.z;

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ---------------- texture (core + halo) ---------------- */

function clamp01(v) { return Math.min(1, Math.max(0, v)); }

function makeSoftDotTexture(p) {
  const sizePx = Math.max(16, Math.floor(p.texSizePx));
  const c = document.createElement("canvas");
  c.width = c.height = sizePx;
  const ctx = c.getContext("2d");

  const cx = sizePx / 2;
  const cy = sizePx / 2;
  const r = sizePx / 2;

  ctx.clearRect(0, 0, sizePx, sizePx);

  // HALO
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  const haloInner = clamp01(p.haloInner);
  const haloMid   = clamp01(p.haloMid);

  const aInner = clamp01(p.haloAlphaInner);
  const aMid   = clamp01(p.haloAlphaMid);

  g.addColorStop(0.0, `rgba(255,255,255,${aInner})`);
  g.addColorStop(Math.max(0.0001, haloInner), `rgba(255,255,255,${aMid})`);
  g.addColorStop(Math.max(0.0001, haloMid), `rgba(255,255,255,${aMid * 0.35})`);
  g.addColorStop(1.0, "rgba(255,255,255,0.0)");

  ctx.fillStyle = g;
  ctx.fillRect(0, 0, sizePx, sizePx);

  // CORE
  const coreR = r * clamp01(p.coreRadius);
  const coreA = clamp01(p.coreAlpha);
  const soft  = r * clamp01(p.coreSoftness);

  ctx.beginPath();
  ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = `rgba(255,255,255,${coreA})`;
  ctx.fill();

  if (soft > 0.0001) {
    const g2 = ctx.createRadialGradient(cx, cy, coreR, cx, cy, coreR + soft);
    g2.addColorStop(0.0, `rgba(255,255,255,${coreA})`);
    g2.addColorStop(1.0, "rgba(255,255,255,0.0)");
    ctx.fillStyle = g2;
    ctx.beginPath();
    ctx.arc(cx, cy, coreR + soft, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearMipMapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/* ---------------- state (rebuildable) ---------------- */

let COUNT = 0;
let positions = null;
let colors = null;
let velocities = null;

let geo = null;
let mat = null;
let points = null;

let dotTex = null;

const baseColor = new THREE.Color(CFG.PARTICLES.color);

/* ---------------- wrap helpers (camera-space) ---------------- */

const _wPos = new THREE.Vector3();
const _cPos = new THREE.Vector3();
const _lPos = new THREE.Vector3();
const _invPoints = new THREE.Matrix4();

function halfFovRad() { return THREE.MathUtils.degToRad(camera.fov * 0.5); }

function wrapCameraSpaceLocal(px, py, pz) {
  // local -> world
  _lPos.set(px, py, pz);
  _wPos.copy(_lPos).applyMatrix4(points.matrixWorld);

  // world -> camera
  _cPos.copy(_wPos).applyMatrix4(camera.matrixWorldInverse);

  // Z wrap camera-space (modulare)
  const zNear = -CFG.PARTICLES.depthNear;
  const zFar  = -CFG.PARTICLES.depthFar;
  const zSpan = (zNear - zFar); // positivo

  if (_cPos.z > zNear) _cPos.z -= zSpan;
  else if (_cPos.z < zFar) _cPos.z += zSpan;

  // bounds visibili a questa profondità
  const depth = Math.max(0.25, -_cPos.z);
  const halfH = Math.tan(halfFovRad()) * depth;
  const halfW = halfH * camera.aspect;

  const spanW = halfW * 2;
  const spanH = halfH * 2;

  // X wrap modulare
  if (_cPos.x > halfW) _cPos.x -= spanW;
  else if (_cPos.x < -halfW) _cPos.x += spanW;

  // Y wrap modulare
  if (_cPos.y > halfH) _cPos.y -= spanH;
  else if (_cPos.y < -halfH) _cPos.y += spanH;

  // camera -> world
  _wPos.copy(_cPos).applyMatrix4(camera.matrixWorld);

  // world -> local
  _invPoints.copy(points.matrixWorld).invert();
  _lPos.copy(_wPos).applyMatrix4(_invPoints);

  return _lPos;
}

/* ---------------- spawn (camera-frustum) ---------------- */

const _spawnCam = new THREE.Vector3();
const _spawnWorld = new THREE.Vector3();
const _spawnLocal = new THREE.Vector3();

function spawnInCameraFrustumLocal() {
  points.updateMatrixWorld(true);

  const depth = THREE.MathUtils.lerp(CFG.PARTICLES.depthNear, CFG.PARTICLES.depthFar, Math.random());

  const hf = halfFovRad();
  const halfH = Math.tan(hf) * depth;
  const halfW = halfH * camera.aspect;

  _spawnCam.set(
    (Math.random() * 2 - 1) * halfW,
    (Math.random() * 2 - 1) * halfH,
    -depth
  );

  _spawnWorld.copy(_spawnCam).applyMatrix4(camera.matrixWorld);

  _invPoints.copy(points.matrixWorld).invert();
  _spawnLocal.copy(_spawnWorld).applyMatrix4(_invPoints);

  return _spawnLocal;
}

function reseedParticles() {
  points.updateMatrixWorld(true);
  baseColor.set(CFG.PARTICLES.color);

  for (let i = 0; i < COUNT; i++) {
    const i3 = i * 3;

    const p = spawnInCameraFrustumLocal();
    positions[i3 + 0] = p.x;
    positions[i3 + 1] = p.y;
    positions[i3 + 2] = p.z;

    velocities[i3 + 0] = (Math.random() - 0.5) * 0.15;
    velocities[i3 + 1] = (Math.random() - 0.5) * 0.15;
    velocities[i3 + 2] = (Math.random() - 0.5) * 0.05;

    colors[i3 + 0] = baseColor.r;
    colors[i3 + 1] = baseColor.g;
    colors[i3 + 2] = baseColor.b;
  }

  geo.getAttribute("position").needsUpdate = true;
  geo.getAttribute("color").needsUpdate = true;
}

function rebuildTexture() {
  if (dotTex) dotTex.dispose();
  dotTex = makeSoftDotTexture(CFG.PARTICLES);
  mat.map = dotTex;
  mat.needsUpdate = true;
}

function rebuildAll() {
  // cleanup vecchio
  if (points) scene.remove(points);
  if (geo) geo.dispose();
  if (mat) mat.dispose();
  if (dotTex) dotTex.dispose();

  COUNT = Math.max(1, Math.floor(CFG.PARTICLES.count));

  positions = new Float32Array(COUNT * 3);
  colors    = new Float32Array(COUNT * 3);
  velocities= new Float32Array(COUNT * 3);

  geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  dotTex = makeSoftDotTexture(CFG.PARTICLES);

  mat = new THREE.PointsMaterial({
    size: CFG.PARTICLES.size,
    sizeAttenuation: CFG.PARTICLES.sizeAttenuation,
    transparent: true,
    opacity: CFG.PARTICLES.opacity,
    vertexColors: true,
    depthWrite: CFG.PARTICLES.depthWrite,
    blending: CFG.PARTICLES.blending,
    map: dotTex,
  });

  points = new THREE.Points(geo, mat);
  points.rotation.set(0, 0, 0);
  scene.add(points);

  reseedParticles();
}

/* ---------------- live apply (slider updates) ---------------- */

function applyLive() {
  // camera
  if (camera.fov !== CFG.CAMERA.fov) {
    camera.fov = CFG.CAMERA.fov;
    camera.updateProjectionMatrix();
  }
  camera.position.z = CFG.CAMERA.z;

  // material
  if (mat) {
    mat.size = CFG.PARTICLES.size;
    mat.opacity = CFG.PARTICLES.opacity;
    mat.sizeAttenuation = CFG.PARTICLES.sizeAttenuation;
    mat.depthWrite = CFG.PARTICLES.depthWrite;
    mat.blending = CFG.PARTICLES.blending;
    mat.needsUpdate = true;
  }
}

/* ---------------- simulation ---------------- */

let lastTime = performance.now();

function update(dt) {
  points.updateMatrixWorld(true);

  const damping = CFG.PARTICLES.damping;
  const driftXY = CFG.PARTICLES.driftXY;
  const driftZ  = CFG.PARTICLES.driftZ;

  for (let i = 0; i < COUNT; i++) {
    const i3 = i * 3;

    let px = positions[i3 + 0];
    let py = positions[i3 + 1];
    let pz = positions[i3 + 2];

    let vx = velocities[i3 + 0];
    let vy = velocities[i3 + 1];
    let vz = velocities[i3 + 2];

    vx += (Math.random() - 0.5) * driftXY * dt;
    vy += (Math.random() - 0.5) * driftXY * dt;
    vz += (Math.random() - 0.5) * driftZ  * dt;

    px += vx * dt;
    py += vy * dt;
    pz += vz * dt;

    const wrapped = wrapCameraSpaceLocal(px, py, pz);
    px = wrapped.x;
    py = wrapped.y;
    pz = wrapped.z;

    vx *= damping;
    vy *= damping;
    vz *= damping;

    positions[i3 + 0] = px;
    positions[i3 + 1] = py;
    positions[i3 + 2] = pz;

    velocities[i3 + 0] = vx;
    velocities[i3 + 1] = vy;
    velocities[i3 + 2] = vz;
  }

  geo.getAttribute("position").needsUpdate = true;
}

/* ---------------- UI (sliders) ---------------- */

const dbg = document.getElementById("dbg");
const ctlGrid = document.getElementById("ctlGrid");

function fmt(v, digits = 3) {
  if (typeof v === "number") return (Math.round(v * 10 ** digits) / 10 ** digits).toString();
  return String(v);
}

function addSlider({ label, get, set, min, max, step, digits = 3, rebuild = "live" }) {
  const row = document.createElement("div");
  row.className = "row";

  const lab = document.createElement("label");
  lab.textContent = label;

  const rng = document.createElement("input");
  rng.type = "range";
  rng.min = min;
  rng.max = max;
  rng.step = step;

  const val = document.createElement("div");
  val.className = "v";

  function syncFromState() {
    const v = get();
    rng.value = v;
    val.textContent = fmt(v, digits);
  }

  rng.addEventListener("input", () => {
    const v = parseFloat(rng.value);
    set(v);
    val.textContent = fmt(v, digits);

    if (rebuild === "live") {
      applyLive();
    } else if (rebuild === "tex") {
      // non facciamo rebuild texture ad ogni tick (pesante), lo fai col bottone
    } else if (rebuild === "all") {
      // idem (lo fai col bottone)
    }
  });

  row.appendChild(lab);
  row.appendChild(rng);
  row.appendChild(val);
  ctlGrid.appendChild(row);

  syncFromState();
}

function buildUI() {
  ctlGrid.innerHTML = "";

  addSlider({
    label: "count",
    get: () => CFG.PARTICLES.count,
    set: v => CFG.PARTICLES.count = Math.floor(v),
    min: 200, max: 6000, step: 50, digits: 0, rebuild: "all"
  });

  addSlider({
    label: "size",
    get: () => CFG.PARTICLES.size,
    set: v => CFG.PARTICLES.size = v,
    min: 0.02, max: 0.35, step: 0.005, digits: 3, rebuild: "live"
  });

  addSlider({
    label: "opacity",
    get: () => CFG.PARTICLES.opacity,
    set: v => CFG.PARTICLES.opacity = v,
    min: 0.05, max: 1.0, step: 0.01, digits: 2, rebuild: "live"
  });

  addSlider({
    label: "damping",
    get: () => CFG.PARTICLES.damping,
    set: v => CFG.PARTICLES.damping = v,
    min: 0.90, max: 0.999, step: 0.001, digits: 3, rebuild: "live"
  });

  addSlider({
    label: "driftXY",
    get: () => CFG.PARTICLES.driftXY,
    set: v => CFG.PARTICLES.driftXY = v,
    min: 0.0, max: 0.12, step: 0.002, digits: 3, rebuild: "live"
  });

  addSlider({
    label: "driftZ",
    get: () => CFG.PARTICLES.driftZ,
    set: v => CFG.PARTICLES.driftZ = v,
    min: 0.0, max: 0.08, step: 0.002, digits: 3, rebuild: "live"
  });

  addSlider({
    label: "depthNear",
    get: () => CFG.PARTICLES.depthNear,
    set: v => CFG.PARTICLES.depthNear = Math.min(v, CFG.PARTICLES.depthFar - 0.2),
    min: 0.3, max: 10.0, step: 0.05, digits: 2, rebuild: "live"
  });

  addSlider({
    label: "depthFar",
    get: () => CFG.PARTICLES.depthFar,
    set: v => CFG.PARTICLES.depthFar = Math.max(v, CFG.PARTICLES.depthNear + 0.2),
    min: 1.0, max: 30.0, step: 0.1, digits: 2, rebuild: "live"
  });

  addSlider({
    label: "FOV",
    get: () => CFG.CAMERA.fov,
    set: v => CFG.CAMERA.fov = v,
    min: 40, max: 110, step: 1, digits: 0, rebuild: "live"
  });

  // texture tuning (slider “sposta i valori”, poi premi Rebuild Texture)
  addSlider({
    label: "coreRad",
    get: () => CFG.PARTICLES.coreRadius,
    set: v => CFG.PARTICLES.coreRadius = v,
    min: 0.02, max: 0.9, step: 0.01, digits: 2, rebuild: "tex"
  });
  addSlider({
    label: "coreSoft",
    get: () => CFG.PARTICLES.coreSoftness,
    set: v => CFG.PARTICLES.coreSoftness = v,
    min: 0.0, max: 0.5, step: 0.01, digits: 2, rebuild: "tex"
  });
  addSlider({
    label: "haloIn",
    get: () => CFG.PARTICLES.haloInner,
    set: v => CFG.PARTICLES.haloInner = v,
    min: 0.0, max: 1.0, step: 0.01, digits: 2, rebuild: "tex"
  });
  addSlider({
    label: "haloMid",
    get: () => CFG.PARTICLES.haloMid,
    set: v => CFG.PARTICLES.haloMid = v,
    min: 0.0, max: 1.0, step: 0.01, digits: 2, rebuild: "tex"
  });
}

document.getElementById("btnReseed").addEventListener("click", () => reseedParticles());
document.getElementById("btnTex").addEventListener("click", () => rebuildTexture());
document.getElementById("btnAll").addEventListener("click", () => {
  rebuildAll();
  applyLive();
});

/* ---------------- animation ---------------- */

function loop(now) {
  const dt = Math.min(0.033, (now - lastTime) / 1000);
  lastTime = now;

  applyLive();
  update(dt);

  renderer.render(scene, camera);

  dbg.textContent =
`loop: OK
particles: ${COUNT}
depth: ${CFG.PARTICLES.depthNear.toFixed(2)} .. ${CFG.PARTICLES.depthFar.toFixed(2)}
size: ${CFG.PARTICLES.size.toFixed(3)}
driftXY: ${CFG.PARTICLES.driftXY.toFixed(3)}
damping: ${CFG.PARTICLES.damping.toFixed(3)}
fov: ${camera.fov.toFixed(0)}`;

  requestAnimationFrame(loop);
}

/* ---------------- start ---------------- */

buildUI();
rebuildAll();
applyLive();
requestAnimationFrame(loop);
