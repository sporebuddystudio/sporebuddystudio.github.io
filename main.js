import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

const canvas = document.getElementById("c");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

const scene = new THREE.Scene();

// Camera
const camera = new THREE.PerspectiveCamera(55, 2, 0.1, 100);
camera.position.z = 10;

// Particles
const COUNT = 1200;
const positions = new Float32Array(COUNT * 3);
const sizes = new Float32Array(COUNT);

for (let i = 0; i < COUNT; i++) {
  const i3 = i * 3;
  positions[i3 + 0] = (Math.random() - 0.5) * 24; // x
  positions[i3 + 1] = (Math.random() - 0.5) * 14; // y
  positions[i3 + 2] = (Math.random() - 0.5) * 24; // z
  sizes[i] = 0.6 + Math.random() * 0.1;
}

const geo = new THREE.BufferGeometry();
geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));

const mat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  uniforms: {
    uTime: { value: 0 },
    uColor: { value: new THREE.Color(0x3fd0c9) }, // teal
    uOpacity: { value: 0.85 },
    uScale: { value: 1.0 },
  },
  vertexShader: `
    attribute float aSize;
    uniform float uTime;
    uniform float uScale;
    varying float vFade;

    void main() {
      vec3 p = position;

      // slow drift
      p.x += sin(uTime * 0.25 + position.z * 0.35) * 0.08;
      p.y += cos(uTime * 0.22 + position.x * 0.30) * 0.08;

      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      float dist = -mv.z;

      // size with distance
      gl_PointSize = aSize * uScale * (260.0 / max(dist, 0.001));
      gl_Position = projectionMatrix * mv;

      // fade far points a bit
      vFade = clamp(1.2 - dist * 0.08, 0.15, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 uColor;
    uniform float uOpacity;
    varying float vFade;

    void main() {
      // soft circular sprite
      vec2 uv = gl_PointCoord - vec2(0.5);
      float d = length(uv);
      float a = smoothstep(0.5, 0.0, d);

      gl_FragColor = vec4(uColor, a * uOpacity * vFade);
    }
  `,
});

const points = new THREE.Points(geo, mat);
scene.add(points);

// Subtle vignette plane (optional, gives depth)
const vignetteGeo = new THREE.PlaneGeometry(2, 2);
const vignetteMat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  uniforms: { uStrength: { value: 0.55 } },
  vertexShader: `void main(){gl_Position=vec4(position,1.0);}`,
  fragmentShader: `
    uniform float uStrength;
    void main() {
      vec2 uv = gl_FragCoord.xy / vec2( max(1.0, float(${Math.max(1, 1)})) ); // placeholder, ignored by browsers
      // We'll compute vignette in CSS-like way using gl_FragCoord requires resolution; keep it simple:
      gl_FragColor = vec4(0.0,0.0,0.0,0.0);
    }
  `,
});
vignetteMat.visible = false; // leave off by default

// Interaction (parallax)
let targetX = 0, targetY = 0;
let curX = 0, curY = 0;

function onPointerMove(e) {
  const w = window.innerWidth || 1;
  const h = window.innerHeight || 1;
  const nx = (e.clientX / w) * 2 - 1;
  const ny = (e.clientY / h) * 2 - 1;
  targetX = nx;
  targetY = ny;
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
