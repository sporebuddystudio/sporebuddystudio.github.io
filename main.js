import * as THREE from "https://unpkg.com/three@0.159.0/build/three.module.js";

/* =========================================================
   CONFIG
   ========================================================= */

const CFG = {
  PARTICLES:{
    count:2500,

    depthNear:1.5,   // distanza DAVANTI alla camera
    depthFar:12.0,   // distanza DAVANTI alla camera

    damping:0.98,
    driftXY:0.02,
    driftZ:0.01,

    color:0x3fd0c9,

    size:0.12,
    opacity:1.0,
    blending:THREE.AdditiveBlending,
    depthWrite:false,

    texSizePx:256,
    haloInner:0.42,
    haloMid:0.75,
    haloAlphaMid:0.22,
    haloAlphaInner:0.60,
    coreRadius:0.31,
    coreAlpha:1.0,
    coreSoftness:0.03
  },

  CAMERA:{
    fov:80,
    z:12
  }
};

/* =========================================================
   RENDERER + CAMERA
   ========================================================= */

const canvas=document.getElementById("c");
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setSize(window.innerWidth,window.innerHeight);
renderer.setClearColor(0x000000,0);

const scene=new THREE.Scene();

const camera=new THREE.PerspectiveCamera(
  CFG.CAMERA.fov,
  window.innerWidth/window.innerHeight,
  0.1,
  100
);
camera.position.z=CFG.CAMERA.z;

window.addEventListener("resize",()=>{
  camera.aspect=window.innerWidth/window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth,window.innerHeight);
});

/* =========================================================
   PARTICLE TEXTURE
   ========================================================= */

function makeSoftDotTexture(p){
  const size=p.texSizePx;
  const c=document.createElement("canvas");
  c.width=c.height=size;
  const ctx=c.getContext("2d");

  const cx=size/2, cy=size/2, r=size/2;
  ctx.clearRect(0,0,size,size);

  const g=ctx.createRadialGradient(cx,cy,0,cx,cy,r);
  g.addColorStop(0,`rgba(255,255,255,${p.haloAlphaInner})`);
  g.addColorStop(p.haloInner,`rgba(255,255,255,${p.haloAlphaMid})`);
  g.addColorStop(p.haloMid,`rgba(255,255,255,${p.haloAlphaMid*0.35})`);
  g.addColorStop(1,"rgba(255,255,255,0)");
  ctx.fillStyle=g;
  ctx.fillRect(0,0,size,size);

  const coreR=r*p.coreRadius;
  ctx.beginPath();
  ctx.arc(cx,cy,coreR,0,Math.PI*2);
  ctx.fillStyle=`rgba(255,255,255,${p.coreAlpha})`;
  ctx.fill();

  const g2=ctx.createRadialGradient(cx,cy,coreR,cx,cy,coreR+r*p.coreSoftness);
  g2.addColorStop(0,`rgba(255,255,255,${p.coreAlpha})`);
  g2.addColorStop(1,"rgba(255,255,255,0)");
  ctx.fillStyle=g2;
  ctx.beginPath();
  ctx.arc(cx,cy,coreR+r*p.coreSoftness,0,Math.PI*2);
  ctx.fill();

  const tex=new THREE.CanvasTexture(c);
  tex.minFilter=THREE.LinearMipMapLinearFilter;
  tex.magFilter=THREE.LinearFilter;
  tex.generateMipmaps=true;
  return tex;
}

/* =========================================================
   SPAWN SCREEN-SPACE (ROBUSTO)
   ========================================================= */

const raycaster = new THREE.Raycaster();
const mouseNDC = new THREE.Vector2();
const spawnPos = new THREE.Vector3();

const planeNormal = new THREE.Vector3();
const planePoint  = new THREE.Vector3();
const hitPoint    = new THREE.Vector3();

function screenToWorld(xNDC,yNDC,depth){

  // raggio dalla camera
  mouseNDC.set(xNDC,yNDC);
  raycaster.setFromCamera(mouseNDC,camera);

  // piano parallelo alla camera posto DAVANTI alla camera
  camera.getWorldDirection(planeNormal);

  // la camera guarda -Z, quindi invertiamo
  planeNormal.multiplyScalar(-1);

  // punto del piano = camera + forward * depth
  planePoint.copy(camera.position)
            .add(planeNormal.clone().multiplyScalar(depth));

  // intersezione raggio ↔ piano
  raycaster.ray.intersectPlane(
    new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, planePoint),
    hitPoint
  );

  return hitPoint;
}


function spawnParticle(i3){

  const depth=THREE.MathUtils.lerp(CFG.PARTICLES.depthNear,CFG.PARTICLES.depthFar,Math.random());

  // posizione uniforme sullo schermo
  const xNDC=Math.random()*2-1;
  const yNDC=Math.random()*2-1;

  const w=screenToWorld(xNDC,yNDC,depth);

  positions[i3]=w.x;
  positions[i3+1]=w.y;
  positions[i3+2]=w.z;
}

/* =========================================================
   PARTICLES BUILD
   ========================================================= */

let COUNT=0,positions,colors,velocities,geo,mat,points,dotTex;
const baseColor=new THREE.Color(CFG.PARTICLES.color);

function rebuildAll(){

  if(points)scene.remove(points);
  if(geo)geo.dispose();
  if(mat)mat.dispose();
  if(dotTex)dotTex.dispose();

  COUNT=CFG.PARTICLES.count;

  positions=new Float32Array(COUNT*3);
  colors=new Float32Array(COUNT*3);
  velocities=new Float32Array(COUNT*3);

  geo=new THREE.BufferGeometry();
  geo.setAttribute("position",new THREE.BufferAttribute(positions,3));
  geo.setAttribute("color",new THREE.BufferAttribute(colors,3));

  dotTex=makeSoftDotTexture(CFG.PARTICLES);

  mat=new THREE.PointsMaterial({
    size:CFG.PARTICLES.size,
    transparent:true,
    opacity:CFG.PARTICLES.opacity,
    vertexColors:true,
    depthWrite:CFG.PARTICLES.depthWrite,
    blending:CFG.PARTICLES.blending,
    map:dotTex
  });

  points=new THREE.Points(geo,mat);
  scene.add(points);

  reseedParticles();
}

function reseedParticles(){

  baseColor.set(CFG.PARTICLES.color);

  for(let i=0;i<COUNT;i++){
    const i3=i*3;

    spawnParticle(i3);

    velocities[i3]=(Math.random()-0.5)*0.15;
    velocities[i3+1]=(Math.random()-0.5)*0.15;
    velocities[i3+2]=(Math.random()-0.5)*0.05;

    colors[i3]=baseColor.r;
    colors[i3+1]=baseColor.g;
    colors[i3+2]=baseColor.b;
  }

  geo.getAttribute("position").needsUpdate=true;
  geo.getAttribute("color").needsUpdate=true;
}

/* =========================================================
   SIMULATION
   ========================================================= */

let last=performance.now();

function update(dt){

  for(let i=0;i<COUNT;i++){

    const i3=i*3;

    let px=positions[i3];
    let py=positions[i3+1];
    let pz=positions[i3+2];

    let vx=velocities[i3];
    let vy=velocities[i3+1];
    let vz=velocities[i3+2];

    vx+=(Math.random()-0.5)*CFG.PARTICLES.driftXY*dt;
    vy+=(Math.random()-0.5)*CFG.PARTICLES.driftXY*dt;
    vz+=(Math.random()-0.5)*CFG.PARTICLES.driftZ*dt;

    px+=vx*dt;
    py+=vy*dt;
    pz+=vz*dt;

    vx*=CFG.PARTICLES.damping;
    vy*=CFG.PARTICLES.damping;
    vz*=CFG.PARTICLES.damping;

    positions[i3]=px;
    positions[i3+1]=py;
    positions[i3+2]=pz;

    velocities[i3]=vx;
    velocities[i3+1]=vy;
    velocities[i3+2]=vz;
  }

  geo.getAttribute("position").needsUpdate=true;
}

/* =========================================================
   LOOP
   ========================================================= */

function loop(now){

  const dt=Math.min(0.033,(now-last)/1000);
  last=now;

  update(dt);
  renderer.render(scene,camera);
  requestAnimationFrame(loop);
}

rebuildAll();
loop();
