import * as THREE from "https://unpkg.com/three@0.159.0/build/three.module.js";

/* ---------------- tuning ---------------- */

const CFG = {
  PARTICLES: {
    count: 2500,

    // (spreadX/Y non servono più per lo spawn; li lasciamo come “legacy”)
    spreadX: 14,
    spreadY: 14,
    spreadZ: 10,

    // profondità (camera-space): più grande = più “volumetrico”
    depthNear: 1.5,   // distanza davanti alla camera
    depthFar: 12.0,   // distanza davanti alla camera

    // simulation
    bounds: 8,       // non usato per il box
    damping: 0.98,
    driftXY: 0.02,
    driftZ: 0.01,

    // 👇 COLORE BASE DELLE PARTICELLE (CAMBIA QUI)
    color: 0x3fd0c9,

    // material
    size: 0.12,
    opacity: 1.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,

    // sprite / texture
    texSizePx: 256,
    haloInner: 0.42,
    haloMid: 0.75,
    haloAlphaMid: 0.22,
    haloAlphaInner: 0.60,
    coreRadius: 0.31,
    coreAlpha: 1.0,
    coreSoftness: 0.03,
  },

  // ROT lasciato nel CFG ma non usato (così se vorrai rimetterla è facile)
  ROT: {
    y: 0.03,
    x: 0.015,
  }
};

/* ---------------- renderer ---------------- */

const canvas = document.getElementById("c");
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true
});

renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0);

/* ---------------- scene & camera ---------------- */

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  80,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camera.position.z = 12;

/* ---------------- resize ---------------- */

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ---------------- texture (core + halo) ---------------- */

function makeSoftDotTexture(p) {

  const sizePx = p.texSizePx;
  const c = document.createElement("canvas");
  c.width = c.height = sizePx;
  const ctx = c.getContext("2d");

  const cx = sizePx / 2;
  const cy = sizePx / 2;
  const r = sizePx / 2;

  ctx.clearRect(0, 0, sizePx, sizePx);

  // HALO
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);

  g.addColorStop(0.0, `rgba(255,255,255,${p.haloAlphaInner})`);
  g.addColorStop(p.haloInner, `rgba(255,255,255,${p.haloAlphaMid})`);
  g.addColorStop(p.haloMid, `rgba(255,255,255,${p.haloAlphaMid * 0.35})`);
  g.addColorStop(1.0, "rgba(255,255,255,0.0)");

  ctx.fillStyle = g;
  ctx.fillRect(0, 0, sizePx, sizePx);

  // CORE
  const coreR = r * p.coreRadius;

  ctx.beginPath();
  ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = `rgba(255,255,255,${p.coreAlpha})`;
  ctx.fill();

  const g2 = ctx.createRadialGradient(cx, cy, coreR, cx, cy, coreR + r * p.coreSoftness);
  g2.addColorStop(0.0, `rgba(255,255,255,${p.coreAlpha})`);
  g2.addColorStop(1.0, "rgba(255,255,255,0.0)");

  ctx.fillStyle = g2;
  ctx.beginPath();
  ctx.arc(cx, cy, coreR + r * p.coreSoftness, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fill();

  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearMipMapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;

  return tex;
}

const dotTex = makeSoftDotTexture(CFG.PARTICLES);

/* ---------------- particles ---------------- */

const COUNT = CFG.PARTICLES.count;

const positions = new Float32Array(COUNT * 3);
const colors = new Float32Array(COUNT * 3);
const velocities = new Float32Array(COUNT * 3);

const baseColor = new THREE.Color(CFG.PARTICLES.color);

const geo = new THREE.BufferGeometry();
geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

const mat = new THREE.PointsMaterial({
  size: CFG.PARTICLES.size,
  sizeAttenuation: CFG.PARTICLES.sizeAttenuation,
  transparent: true,
  opacity: CFG.PARTICLES.opacity,
  vertexColors: true,
  depthWrite: CFG.PARTICLES.depthWrite,
  blending: CFG.PARTICLES.blending,
  map: dotTex,
});

const points = new THREE.Points(geo, mat);
points.rotation.set(0, 0, 0); // ✅ niente rotazione “blocco unico”
scene.add(points);

/* ---------------- screen-fog wrap helpers (camera-space) ---------------- */

const _wPos = new THREE.Vector3();
const _cPos = new THREE.Vector3();
const _lPos = new THREE.Vector3();
const _invPoints = new THREE.Matrix4();

const _halfFovRad = THREE.MathUtils.degToRad(camera.fov * 0.5);

function wrapCameraSpaceLocal(px, py, pz) {
  // local -> world
  _lPos.set(px, py, pz);
  _wPos.copy(_lPos).applyMatrix4(points.matrixWorld);

  // world -> camera
  _cPos.copy(_wPos).applyMatrix4(camera.matrixWorldInverse);

  // davanti = z negativo
  const depth = Math.max(0.25, -_cPos.z);

  const halfH = Math.tan(_halfFovRad) * depth;
  const halfW = halfH * camera.aspect;

  // wrap X/Y
  if (_cPos.x > halfW) _cPos.x = -halfW;
  else if (_cPos.x < -halfW) _cPos.x = halfW;

  if (_cPos.y > halfH) _cPos.y = -halfH;
  else if (_cPos.y < -halfH) _cPos.y = halfH;

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

  const depth = THREE.MathUtils.lerp(
    CFG.PARTICLES.depthNear,
    CFG.PARTICLES.depthFar,
    Math.random()
  );

  const halfH = Math.tan(_halfFovRad) * depth;
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

/* ---------------- simulation ---------------- */

let lastTime = performance.now();

function update(dt) {

  points.updateMatrixWorld(true);

  const damping = CFG.PARTICLES.damping;

  for (let i = 0; i < COUNT; i++) {

    const i3 = i * 3;

    let px = positions[i3+0];
    let py = positions[i3+1];
    let pz = positions[i3+2];

    let vx = velocities[i3+0];
    let vy = velocities[i3+1];
    let vz = velocities[i3+2];

    vx += (Math.random()-0.5) * CFG.PARTICLES.driftXY * dt;
    vy += (Math.random()-0.5) * CFG.PARTICLES.driftXY * dt;
    vz += (Math.random()-0.5) * CFG.PARTICLES.driftZ  * dt;

    px += vx * dt;
    py += vy * dt;
    pz += vz * dt;

    // wrap X/Y in camera-space
    const wrapped = wrapCameraSpaceLocal(px, py, pz);
    px = wrapped.x;
    py = wrapped.y;

    // wrap Z sul range di profondità coerente con lo spawn
    const zNear = -CFG.PARTICLES.depthNear;
    const zFar = -CFG.PARTICLES.depthFar;
    if (pz > zNear) pz = zFar;
    else if (pz < zFar) pz = zNear;

    vx *= damping;
    vy *= damping;
    vz *= damping;

    positions[i3+0] = px;
    positions[i3+1] = py;
    positions[i3+2] = pz;

    velocities[i3+0] = vx;
    velocities[i3+1] = vy;
    velocities[i3+2] = vz;
  }

  geo.getAttribute("position").needsUpdate = true;
}

/* ---------------- animation ---------------- */

const dbg = document.getElementById("dbg");

function loop(now) {

  const dt = Math.min(0.033, (now - lastTime) / 1000);
  lastTime = now;

  update(dt);

  // ✅ NIENTE rotazione del container: muovono solo le singole particelle
  // points.rotation.y += CFG.ROT.y * dt;
  // points.rotation.x += CFG.ROT.x * dt;

  renderer.render(scene, camera);

  dbg.textContent = `loop: OK\nparticles: ${COUNT}`;

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
