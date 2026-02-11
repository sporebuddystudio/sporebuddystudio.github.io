import * as THREE from "https://unpkg.com/three@0.159.0/build/three.module.js";

/* =========================================================
   CONFIG
   ========================================================= */

const CFG = {
  PARTICLES:{
    count:2500,

    depthNear:1.5,
    depthFar:12.0,

    damping:0.98,
    driftXY:0.02,
    driftZ:0.01,

    color:0x3fd0c9,

    size:0.12,
    opacity:1.0,
    blending:THREE.AdditiveBlending,
    depthWrite:false,
    sizeAttenuation:true,

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

function clamp01(v){return Math.min(1,Math.max(0,v));}

function makeSoftDotTexture(p){
  const size=p.texSizePx;
  const c=document.createElement("canvas");
  c.width=c.height=size;
  const ctx=c.getContext("2d");

  const cx=size/2, cy=size/2, r=size/2;

  ctx.clearRect(0,0,size,size);

  // halo
  const g=ctx.createRadialGradient(cx,cy,0,cx,cy,r);
  g.addColorStop(0,`rgba(255,255,255,${p.haloAlphaInner})`);
  g.addColorStop(p.haloInner,`rgba(255,255,255,${p.haloAlphaMid})`);
  g.addColorStop(p.haloMid,`rgba(255,255,255,${p.haloAlphaMid*0.35})`);
  g.addColorStop(1,"rgba(255,255,255,0)");

  ctx.fillStyle=g;
  ctx.fillRect(0,0,size,size);

  // core
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

function rebuildTexture(){
  dotTex.dispose();
  dotTex=makeSoftDotTexture(CFG.PARTICLES);
  mat.map=dotTex;
  mat.needsUpdate=true;
}

function reseedParticles(){
  baseColor.set(CFG.PARTICLES.color);

  for(let i=0;i<COUNT;i++){
    const i3=i*3;

    const depth=THREE.MathUtils.lerp(CFG.PARTICLES.depthNear,CFG.PARTICLES.depthFar,Math.random());
    const halfH=Math.tan(THREE.MathUtils.degToRad(camera.fov*0.5))*depth;
    const halfW=halfH*camera.aspect;

    positions[i3]=(Math.random()*2-1)*halfW;
    positions[i3+1]=(Math.random()*2-1)*halfH;
    positions[i3+2]=-depth;

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
   LIVE UPDATE
   ========================================================= */

function applyLive(){

  camera.fov=CFG.CAMERA.fov;
  camera.position.z=CFG.CAMERA.z;
  camera.updateProjectionMatrix();

  mat.size=CFG.PARTICLES.size;
  mat.opacity=CFG.PARTICLES.opacity;
  mat.needsUpdate=true;

  // aggiorna colore realtime
  baseColor.set(CFG.PARTICLES.color);
  for(let i=0;i<COUNT;i++){
    const i3=i*3;
    colors[i3]=baseColor.r;
    colors[i3+1]=baseColor.g;
    colors[i3+2]=baseColor.b;
  }
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
   UI
   ========================================================= */

function addSlider(name,obj,key,min,max,step){

  const grid=document.getElementById("ctlGrid");

  const row=document.createElement("div");
  row.className="row";

  const lab=document.createElement("label");
  lab.textContent=name;

  const rng=document.createElement("input");
  rng.type="range";
  rng.min=min;
  rng.max=max;
  rng.step=step;
  rng.value=obj[key];

  const val=document.createElement("div");
  val.textContent=obj[key].toFixed(3);

  rng.oninput=()=>{
    obj[key]=parseFloat(rng.value);
    val.textContent=obj[key].toFixed(3);
    applyLive();
  };

  row.appendChild(lab);
  row.appendChild(rng);
  row.appendChild(val);
  grid.appendChild(row);
}

function buildUI(){

  addSlider("size",CFG.PARTICLES,"size",0.02,0.4,0.005);
  addSlider("opacity",CFG.PARTICLES,"opacity",0.05,1,0.01);
  addSlider("damping",CFG.PARTICLES,"damping",0.9,0.999,0.001);
  addSlider("driftXY",CFG.PARTICLES,"driftXY",0,0.12,0.002);
  addSlider("driftZ",CFG.PARTICLES,"driftZ",0,0.08,0.002);
  addSlider("depthNear",CFG.PARTICLES,"depthNear",0.3,10,0.05);
  addSlider("depthFar",CFG.PARTICLES,"depthFar",1,30,0.1);
  addSlider("FOV",CFG.CAMERA,"fov",40,110,1);

  addSlider("haloAlphaInner",CFG.PARTICLES,"haloAlphaInner",0,1,0.01);
  addSlider("haloAlphaMid",CFG.PARTICLES,"haloAlphaMid",0,1,0.01);
  addSlider("coreAlpha",CFG.PARTICLES,"coreAlpha",0,1,0.01);

  document.getElementById("btnReseed").onclick=reseedParticles;
  document.getElementById("btnTex").onclick=rebuildTexture;
  document.getElementById("btnAll").onclick=()=>{
    rebuildAll();
    applyLive();
  };
}

/* =========================================================
   LOOP
   ========================================================= */

function loop(now){

  const dt=Math.min(0.033,(now-last)/1000);
  last=now;

  applyLive();
  update(dt);
  renderer.render(scene,camera);

  requestAnimationFrame(loop);
}

/* =========================================================
   START
   ========================================================= */

buildUI();
rebuildAll();
applyLive();
loop();
