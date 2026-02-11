import * as THREE from "https://unpkg.com/three@0.159.0/build/three.module.js";

/* ---------------- renderer ---------------- */

const canvas = document.getElementById("c");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

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

/* ---------------- texture (soft dot) ---------------- */

function createSoftTexture() {
  const size = 64;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");

  const g = ctx.createRadialGradient(
    size/2, size/2, 0,
    size/2, size/2, size/2
  );

  g.addColorStop(0.0, "rgba(255,255,255,1)");
  g.addColorStop(0.2, "rgba(255,255,255,0.7)");
  g.addColorStop(0.5, "rgba(255,255,255,0.25)");
  g.addColorStop(1.0, "rgba(255,255,255,0)");

  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  return new THREE.CanvasTexture(c);
}

const softTex = createSoftTexture();

/* ---------------- particles ---------------- */

const COUNT = 1800;
const spread = 14;
const spreadZ = 10;

const positions = new Float32Array(COUNT * 3);
const colors = new Float32Array(COUNT * 3);
const velocities = new Float32Array(COUNT * 3);

const baseColor = new THREE.Color(0x6fd3ff);

for (let i = 0; i < COUNT; i++) {

  const i3 = i * 3;

  positions[i3+0] = (Math.random()-0.5) * spread;
  positions[i3+1] = (Math.random()-0.5) * spread;
  positions[i3+2] = (Math.random()-0.5) * spreadZ;

  velocities[i3+0] = (Math.random()-0.5) * 0.15;
  velocities[i3+1] = (Math.random()-0.5) * 0.15;
  velocities[i3+2] = (Math.random()-0.5) * 0.05;

  colors[i3+0] = baseColor.r;
  colors[i3+1] = baseColor.g;
  colors[i3+2] = baseColor.b;
}

const geo = new THREE.BufferGeometry();
geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

const mat = new THREE.PointsMaterial({
  size: 0.12,
  map: softTex,
  transparent: true,
  depthWrite: false,
  vertexColors: true,
  blending: THREE.AdditiveBlending
});

const points = new THREE.Points(geo, mat);
scene.add(points);

/* ---------------- simulation ---------------- */

let lastTime = performance.now();
const bounds = 8;
const damping = 0.98;

function update(dt) {

  for (let i = 0; i < COUNT; i++) {

    const i3 = i * 3;

    let px = positions[i3+0];
    let py = positions[i3+1];
    let pz = positions[i3+2];

    let vx = velocities[i3+0];
    let vy = velocities[i3+1];
    let vz = velocities[i3+2];

    // drift
    vx += (Math.random()-0.5) * 0.02 * dt;
    vy += (Math.random()-0.5) * 0.02 * dt;
    vz += (Math.random()-0.5) * 0.01 * dt;

    // integrate
    px += vx * dt;
    py += vy * dt;
    pz += vz * dt;

    // bounds
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
  points.rotation.y += 0.03 * dt;
  points.rotation.x += 0.015 * dt;

  renderer.render(scene, camera);

  dbg.textContent = `loop: OK\nparticles: ${COUNT}`;

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
