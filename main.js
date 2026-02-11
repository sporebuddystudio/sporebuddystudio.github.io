import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

const canvas = document.getElementById("c");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

// IMPORTANT: evita canvas 0x0 al primo frame
renderer.setSize(window.innerWidth, window.innerHeight, false);

const scene = new THREE.Scene();

// Camera
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.z = 10;

// ---------- Particles ----------
const COUNT = 1400;

const positions = new Float32Array(COUNT * 3);
const colors = new Float32Array(COUNT * 3);

const baseColor = new THREE.Color(0x3fd0c9); // teal
const hoverColor = new THREE.Color(0xffffff); // hover highlight

for (let i = 0; i < COUNT; i++) {
  const i3 = i * 3;
  positions[i3 + 0] = (Math.random() - 0.5) * 24;
  positions[i3 + 1] = (Math.random() - 0.5) * 14;
  positions[i3 + 2] = (Math.random() - 0.5) * 24;

  colors[i3 + 0] = baseColor.r;
  colors[i3 + 1] = baseColor.g;
  colors[i3 + 2] = baseColor.b;
}

const geo = new THREE.BufferGeometry();
geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

const mat = new THREE.PointsMaterial({
  size: 0.06,
  sizeAttenuation: true,
  transparent: true,
  opacity: 0.85,
  vertexColors: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});

const points = new THREE.Points(geo, mat);
scene.add(points);

// ---------- Interaction (parallax + hover) ----------
let targetX = 0, targetY = 0;
let curX = 0, curY = 0;

// Raycaster per hover
const raycaster = new THREE.Raycaster();
raycaster.params.Points.threshold = 0.12; // aumenta se vuoi hover più facile
const mouse = new THREE.Vector2();
let hoveredIndex = -1;

function setColorAt(index, color) {
  const attr = geo.getAttribute("color");
  const a = attr.array;
  const i3 = index * 3;
  a[i3 + 0] = color.r;
  a[i3 + 1] = color.g;
  a[i3 + 2] = color.b;
  attr.needsUpdate = true;
}

window.addEventListener(
  "pointermove",
  (e) => {
    const w = window.innerWidth || 1;
    const h = window.innerHeight || 1;

    const nx = (e.clientX / w) * 2 - 1;
    const ny = (e.clientY / h) * 2 - 1;

    targetX = nx;
    targetY = ny;

    mouse.set(nx, -ny);

    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObject(points, false);
    const newIndex = hits.length && hits[0].index != null ? hits[0].index : -1;

    if (newIndex !== hoveredIndex) {
      if (hoveredIndex !== -1) setColorAt(hoveredIndex, baseColor);
      hoveredIndex = newIndex;
      if (hoveredIndex !== -1) setColorAt(hoveredIndex, hoverColor);
    }
  },
  { passive: true }
);

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;

  renderer.setSize(w, h, false);

  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);

// First resize to guarantee correct sizing
resize();

const clock = new THREE.Clock();

function tick() {
  const t = clock.getElapsedTime();

  // pulse leggero (globale) su size + opacity
  mat.size = 0.06 + Math.sin(t * 1.7) * 0.008;
  mat.opacity = 0.78 + Math.sin(t * 1.2) * 0.06;

  // parallax + drift
  curX += (targetX - curX) * 0.04;
  curY += (targetY - curY) * 0.04;

  points.rotation.y = curX * 0.22;
  points.rotation.x = -curY * 0.16;
  points.rotation.z += 0.0007;

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

tick();
