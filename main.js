const canvas = document.getElementById("c");
const engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: false, stencil: false });

const createScene = () => {
  const scene = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color4(0.06, 0.07, 0.09, 1.0);

  // Camera orbit (drag)
  const camera = new BABYLON.ArcRotateCamera("cam",
    -Math.PI / 2, Math.PI / 2.2, 6,
    new BABYLON.Vector3(0, 0, 0),
    scene
  );
  camera.attachControl(canvas, true);
  camera.lowerRadiusLimit = 3.5;
  camera.upperRadiusLimit = 9;
  camera.panningSensibility = 0;
  camera.wheelPrecision = 60;

  // Lights
  const hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0, 1, 0), scene);
  hemi.intensity = 0.6;

  const key = new BABYLON.DirectionalLight("key", new BABYLON.Vector3(-1, -2, -1), scene);
  key.position = new BABYLON.Vector3(6, 10, 6);
  key.intensity = 1.2;

  // “Carino ma semplice”: torus knot (procedurale)
  const knot = BABYLON.MeshBuilder.CreateTorusKnot("knot",
    { radius: 1.2, tube: 0.35, radialSegments: 180, tubularSegments: 64 },
    scene
  );

  const mat = new BABYLON.PBRMetallicRoughnessMaterial("mat", scene);
  mat.baseColor = new BABYLON.Color3(0.25, 0.82, 0.78); // teal
  mat.metallic = 0.45;
  mat.roughness = 0.2;
  knot.material = mat;

  // Ground “soft” invisibile per luce
  const ground = BABYLON.MeshBuilder.CreateGround("g", { width: 20, height: 20 }, scene);
  ground.isVisible = false;

  // Subtle particles / stars (leggero)
  const sps = new BABYLON.SolidParticleSystem("sps", scene, { updatable: false });
  const dot = BABYLON.MeshBuilder.CreateSphere("dot", { diameter: 0.03 }, scene);
  for (let i = 0; i < 900; i++) sps.addShape(dot, 1);
  dot.dispose();
  const stars = sps.buildMesh();
  stars.alwaysSelectAsActiveMesh = true;

  sps.initParticles = () => {
    for (let i = 0; i < sps.nbParticles; i++) {
      const p = sps.particles[i];
      p.position.x = (Math.random() - 0.5) * 18;
      p.position.y = (Math.random() - 0.5) * 10;
      p.position.z = (Math.random() - 0.5) * 18;
    }
  };
  sps.initParticles();
  sps.setParticles();

  // Animate
  scene.onBeforeRenderObservable.add(() => {
    const t = performance.now() * 0.001;
    knot.rotation.y = t * 0.25;
    knot.rotation.x = Math.sin(t * 0.35) * 0.12;
  });

  return scene;
};

const scene = createScene();

engine.runRenderLoop(() => scene.render());

window.addEventListener("resize", () => engine.resize());
