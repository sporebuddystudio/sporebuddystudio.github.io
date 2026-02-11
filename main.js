import * as THREE from "https://unpkg.com/three@0.159.0/build/three.module.js";

/* ---------------- tuning ---------------- */

const CFG = {
  PARTICLES: {
    count: 1800,

    spreadX: 14,
    spreadY: 14,
    spreadZ: 10,

    // simulation
    bounds: 8,
    damping: 0.98,
    driftXY: 0.02,
    driftZ: 0.01,

    // material
    size: 0.12,
    opacity: 1.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,

    // sprite / texture
    texSizePx: 256,        // più grande = più definito/smooth
    haloInner: 0.12,       // 0..1
    haloMid: 0.55,         // 0..1
    haloAlphaMid: 0.22,    // 0..1
    haloAlphaInner: 0.60,  // 0..1
    coreRadius: 0.11,      // 0..1 (relativo al raggio del canvas)
    coreAlpha: 1.0,        // 0..1
    coreSoftness: 0.03,    // 0..1 (bordo morbido del core)
  },

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

// niente clear nero: lascia vedere il background HTML
renderer.setClearColor(0x000000, 0);

/* ---------------- scene & camera ---------------- */

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  60,
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
  const sizePx = p.texSizePx ?? 256;

  const c = document.createElement("canvas");
  c.width = c.height = sizePx;
  const ctx = c.getContext("2d");

  const cx = sizePx / 2;
  const cy = sizePx / 2;
  const r = sizePx / 2;

  ctx.clearRect(0, 0, sizePx, sizePx);

  // 1) HALO: alone morbido grande
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);

  const haloAlphaInner = Math.min(1, Math.max(0, p.haloAlphaInner));
  const haloAlphaMid = Math.min(1, Math.max(0, p.haloAlphaMid));

  g.addColorStop(0.0, `rgba(255,255,255,${haloAlphaInner})`);
  g.addColorStop(Math.min(1, Math.max(0.0001, p.haloInner)), `rgba(255,255,255,${haloAlphaMid})`);
  g.addColorStop(Math.min(1, Math.max(0.0001, p.haloMid)), `rgba(255,255,255,${haloAlphaMid * 0.35})`);
  g.addColorStop(1.0, "rgba(255,255,255,0.00)");

  ctx.fillStyle = g;
  ctx.fillRect(0, 0, sizePx, sizePx);

  // 2) CORE: disco pieno brillante + bordo soft
  const coreAlpha = Math.min(1, Math.max(0, p.coreAlpha));
  const coreR = r * Math.min(1, Math.max(0.001, p.coreRadius));
  const soft = r * Math.min(1, Math.max(0.0, p.coreSoftness));

  // Disco pieno
  ctx.beginPath();
  ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = `rgba(255,255,255,${coreAlpha})`;
  ctx.fill();

  // Bordo morbido (corona sfumata)
  if (soft > 0.0001) {
    const g2 = ctx.createRadialGradient(cx, cy, coreR, cx, cy, coreR + soft);
    g2.addColorStop(0.0, `rgba(255,255,255,${coreAlpha})`);
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

const dotTex = makeSoftDotTexture(CFG.PARTICLES);

/* ---------------- particles ---------------- */

const COUNT = CFG.PARTICLES.count;

const positions = new Float32Array(COUNT * 3);
const colors = new Float32Array(COUNT * 3);
const velocities = new Float32Array(COUNT * 3);

const baseColor = new THREE.Color(0x6fd3ff);

for (let i = 0; i < COUNT; i++) {

  const i3 = i * 3;

  positions[i3+0] = (Math.random() - 0.5) * CFG.PARTICLES.spreadX;
  positions[i3+1] = (Math.random() - 0.5) * CFG.PARTICLES.spreadY;
  positions[i3+2] = (Math.random() - 0.5) * CFG.PARTICLES.spreadZ;

  velocities[i3+0] = (Math.random() - 0.5) * 0.15;
  velocities[i3+1] = (Math.random() - 0.5) * 0.15;
  velocities[i3+2] = (Math.random() - 0.5) * 0.05;

  colors[i3+0] = baseColor.r;
  colors[i3+1] = baseColor.g;
  colors[i3+2] = baseColor.b;
}

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
scene.add(points);

/* ---------------- simulation ---------------- */

let lastTime = performance.now();

function update(dt) {

  const bounds = CFG.PARTICLES.bounds;
  const damping = CFG.PARTICLES.damping;

  for (let i = 0; i < COUNT; i++) {

    const i3 = i * 3;

    let px = positions[i3+0];
    let py = positions[i3+1];
    let pz = positions[i3+2];

    let vx = velocities[i3+0];
    let vy = velocities[i3+1];
    let vz = velocities[i3+2];

    // drift
    vx += (Math.random()-0.5) * CFG.PARTICLES.driftXY * dt;
    vy += (Math.random()-0.5) * CFG.PARTICLES.driftXY * dt;
    vz += (Math.random()-0.5) * CFG.PARTICLES.driftZ  * dt;

    // integrate
    px += vx * dt;
    py += vy * dt;
    pz += vz * dt;

    // bounds bounce
    if (px > bounds || px < -bounds) vx *= -1;
    if (py > bounds || py < -bounds) vy *= -1;
    if (pz > bounds || pz < -bounds) vz *= -1;

    // damping
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

  // slow organic rotation
  points.rotation.y += CFG.ROT.y * dt;
  points.rotation.x += CFG.ROT.x * dt;

  renderer.render(scene, camera);

  dbg.textContent = `loop: OK\nparticles: ${COUNT}`;

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
