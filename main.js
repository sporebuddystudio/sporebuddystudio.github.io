import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

const canvas = document.getElementById("c");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

const scene = new THREE.Scene();

// Camera
const camera = new THREE.PerspectiveCamera(55, 2, 0.1, 100);
camera.position.z = 10;

// ---------- Particles ----------
const COUNT = 1200;

const positions = new Float32Array(COUNT * 3);
const sizes = new Float32Array(COUNT);
const phases = new Float32Array(COUNT);          // per-particle pulse phase
const colors = new Float32Array(COUNT * 3);      // per-particle color

const baseColor = new THREE.Color(0x3fd0c9);     // teal
const hoverColor = new THREE.Color(0xffffff);    // highlight (puoi cambiarlo)
const tmpColor = new THREE.Color();

for (let i = 0; i < COUNT; i++) {
  const i3 = i * 3;

  positions[i3 + 0] = (Math.random() - 0.5) * 24;
  positions[i3 + 1] = (Math.random() - 0.5) * 14;
  positions[i3 + 2] = (Math.random() - 0.5) * 24;

  // Size base (se vuoi più piccole, abbassa questi numeri)
  sizes[i] = 0.25 + Math.random() * 0.25;

  // Phase random per pulsazione
  phases[i] = Math.random() * Math.PI * 2;

  // Color base
  colors[i3 + 0] = baseColor.r;
  colors[i3 + 1] = baseColor.g;
  colors[i3 + 2] = baseColor.b;
}

const geo = new THREE.BufferGeometry();
geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
geo.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
geo.computeBoundingSphere();

const mat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  vertexColors: true,
  uniforms: {
    uTime: { value: 0 },
    uOpacity: { value: 0.85 },
    uScale: { value: 1.0 },
    uPulseSpeed: { value: 1.6 },    // velocità pulsazione
    uPulseAmount: { value: 0.18 },  // intensità pulsazione
  },
  vertexShader: `
    attribute float aSize;
    attribute float aPhase;
    attribute vec3 color;

    uniform float uTime;
    uniform float uScale;
    uniform float uPulseSpeed;
    uniform float uPulseAmount;

    varying float vFade;
    varying float vPulse;
    varying vec3 vColor;

    void main() {
      vec3 p = position;

      // slow drift
      p.x += sin(uTime * 0.25 + position.z * 0.35) * 0.08;
      p.y += cos(uTime * 0.22 + position.x * 0.30) * 0.08;

      // pulse (0..1)
      float s = sin(uTime * uPulseSpeed + aPhase);
      vPulse = 1.0 + (s * uPulseAmount);

      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      float dist = -mv.z;

      // size with distance + pulse
      gl_PointSize = (aSize * vPulse) * uScale * (260.0 / max(dist, 0.001));
      gl_Position = projectionMatrix * mv;

      // fade far points a bit
      vFade = clamp(1.2 - dist * 0.08, 0.15, 1.0);

      vColor = color;
    }
  `,
  fragmentShader: `
    uniform float uOpacity;
    varying float vFade;
    varying float vPulse;
    varying vec3 vColor;

    void main() {
      vec2 uv = gl_PointCoord - vec2(0.5);
      float d = length(uv);

      // soft circular sprite
      float a = smoothstep(0.5, 0.0, d);

      // pulse anche sull'alpha (molto leggero)
      float alpha = a * uOpacity * vFade * clamp(vPulse, 0.7, 1.3);

      gl_FragColor = vec4(vColor, alpha);
    }
  `,
});

const points = new THREE.Points(geo, mat);
scene.add(points);

// ---------- Interaction (parallax + hover) ----------
let targetX = 0, targetY = 0;
let curX = 0, curY = 0;

// Raycaster per hover su Points
const raycaster = new THREE.Raycaster();
raycaster.params.Points.threshold = 0.18; // se fatica a prendere l’hover, alza a 0.25

const mouseNDC = new THREE.Vector2();
let hoveredIndex = -1;

function setColorAt(index, color) {
  const attr = geo.getAttribute("color");
  const i3 = index * 3;
  attr.array[i3 + 0] = color.r;
  attr.array[i3 + 1] = color.g;
  attr.array[i3 + 2] = color.b;
  attr.needsUpdate = true;
}

function onPointerMove(e) {
  const w = window.innerWidth || 1;
  const h = window.innerHeight || 1;

  const nx = (e.clientX / w) * 2 - 1;
  const ny = (e.clientY / h) * 2 - 1;

  targetX = nx;
  targetY = ny;

  mouseNDC.set(nx, -ny);

  // Hover test
  raycaster.setFromCamera(mouseNDC, camera);
  const hits = raycaster.intersectObject(points, false);

  const newIndex = (hits.length > 0 && hits[0].index != null) ? hits[0].index : -1;

  if (newIndex !== hoveredIndex) {
    // restore previous
    if (hoveredIndex !== -1) setColorAt(hoveredIndex, baseColor);

    hoveredIndex = newIndex;

    // set new
    if (hoveredIndex !== -1) setColorAt(hoveredIndex, hoverColor);
  }
}

window.addEventListener("pointermove", onPointerMove, { passive: true });

function resize() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

const clock = new THREE.Clock();

function tick() {
  const t = clock.getElapsedTime();
  mat.uniforms.uTime.value = t;

  // smooth parallax
  curX += (targetX - curX) * 0.04;
  curY += (targetY - curY) * 0.04;

  points.rotation.y = curX * 0.25;
  points.rotation.x = -curY * 0.18;

  // slow spin
  points.rotation.z += 0.0008;

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();
