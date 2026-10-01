'use strict';
// 三节手指模型多视角离屏渲染（正交+Z缓冲+简单光照），输出PNG供目视核对。
// 复用 render_print_preview.cjs 的软件渲染管线，模型源为 finger_mechanism_3d.html。
const fs=require('fs'),path=require('path'),zlib=require('zlib');
const THREE=require('./.verification/three-r128.cjs');
const root=__dirname;
function loadModel(file){
  const html=fs.readFileSync(path.join(root,file),'utf8');
  const script=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes('const P ='))[1];
  const nodes=new Map(),document={getElementById(id){if(!nodes.has(id))nodes.set(id,{});return nodes.get(id);}};
  const main=script.slice(0,script.lastIndexOf('\ninitScene();'));
  return new Function('THREE','document',main+'\nscene=new THREE.Scene();showLabels=false;buildMechanism();updateMechanism(0);return {P,s,scene,updateMechanism,getJoints,angleToStroke};')(THREE,document);
}
const api=loadModel('finger_mechanism_3d.html');
const {P,s,scene}=api;
const bo=scene.getObjectByName('bodyOutline'); if(bo) bo.visible=false;
const grid=scene.getObjectByName('grid'); if(grid) grid.visible=false;

// ---- PNG 编码 ----
let crcT=null;
function crc32(buf){if(!crcT){crcT=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;crcT[n]=c>>>0;}}let c=0xFFFFFFFF;for(const b of buf)c=crcT[(c^b)&0xFF]^(c>>>8);return (c^0xFFFFFFFF)>>>0;}
function chunk(type,data){const len=Buffer.alloc(4);len.writeUInt32BE(data.length);const td=Buffer.concat([Buffer.from(type,'ascii'),data]);const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(td));return Buffer.concat([len,td,crc]);}
function writePNG(file,w,h,rgb){const raw=Buffer.alloc((w*3+1)*h);for(let y=0;y<h;y++){raw[y*(w*3+1)]=0;rgb.copy(raw,y*(w*3+1)+1,y*w*3,(y+1)*w*3);}const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=2;fs.writeFileSync(file,Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))]));}

// ---- 正交渲染 ----
function render(file,W,H,eyeDir,centerMm,halfHeightMm){
  const rgb=Buffer.alloc(W*H*3);for(let i=0;i<W*H;i++){rgb[i*3]=0x1a;rgb[i*3+1]=0x1a;rgb[i*3+2]=0x2e;}
  const zb=new Float32Array(W*H).fill(-Infinity);
  const fwd=new THREE.Vector3(...eyeDir).normalize();
  const up=new THREE.Vector3(0,0,1);
  if(Math.abs(fwd.dot(up))>0.95) up.set(0,1,0);
  const right=new THREE.Vector3().crossVectors(up,fwd).normalize();
  const camUp=new THREE.Vector3().crossVectors(fwd,right).normalize();
  const cen=new THREE.Vector3(centerMm[0]*s,centerMm[1]*s,centerMm[2]*s);
  const halfH=halfHeightMm*s, scale=(H/2)/halfH;
  const light=new THREE.Vector3(0.4,0.5,0.85).normalize();
  const L=[];scene.updateMatrixWorld(true);
  scene.traverse(o=>{if(o.isMesh&&o.visible&&o.material&&o.material.color)L.push(o);});
  for(const mesh of L){
    const col=mesh.material.color, g=mesh.geometry, pos=g.attributes.position, idx=g.index;
    const mw=mesh.matrixWorld;
    const n=idx?idx.count:pos.count;
    const V=[];
    for(let i=0;i<pos.count;i++){const v=new THREE.Vector3().fromBufferAttribute(pos,i).applyMatrix4(mw);V.push(v);}
    for(let t=0;t<n;t+=3){
      const i0=idx?idx.getX(t):t, i1=idx?idx.getX(t+1):t+1, i2=idx?idx.getX(t+2):t+2;
      const a=V[i0],b=V[i1],c=V[i2];
      const nrm=new THREE.Vector3().subVectors(b,a).cross(new THREE.Vector3().subVectors(c,a));
      if(nrm.length()<1e-12) continue;
      nrm.normalize();
      const P3=[a,b,c].map(v=>{const d=new THREE.Vector3().subVectors(v,cen);return {x:d.dot(right)*scale+W/2, y:-(d.dot(camUp))*scale+H/2, z:d.dot(fwd)};});
      const lam=0.35+0.65*Math.abs(nrm.dot(light));
      const r=Math.min(255,col.r*255*lam+18),gg=Math.min(255,col.g*255*lam+18),bb=Math.min(255,col.b*255*lam+18);
      const minx=Math.max(0,Math.floor(Math.min(P3[0].x,P3[1].x,P3[2].x))),maxx=Math.min(W-1,Math.ceil(Math.max(P3[0].x,P3[1].x,P3[2].x)));
      const miny=Math.max(0,Math.floor(Math.min(P3[0].y,P3[1].y,P3[2].y))),maxy=Math.min(H-1,Math.ceil(Math.max(P3[0].y,P3[1].y,P3[2].y)));
      const [p0,p1,p2]=P3, area=(p1.x-p0.x)*(p2.y-p0.y)-(p2.x-p0.x)*(p1.y-p0.y);
      if(Math.abs(area)<1e-9) continue;
      for(let y=miny;y<=maxy;y++)for(let x=minx;x<=maxx;x++){
        const px=x+0.5, py=y+0.5;
        const w0=((p1.x-p0.x)*(py-p0.y)-(px-p0.x)*(p1.y-p0.y))/area;
        const w1=((px-p0.x)*(p2.y-p0.y)-(p2.x-p0.x)*(py-p0.y))/area;
        const w2=1-w0-w1;
        if(w0<-1e-6||w1<-1e-6||w2<-1e-6) continue;
        const z=w2*p0.z+w1*p1.z+w0*p2.z;
        const o=y*W+x; if(z>zb[o]){zb[o]=z;rgb[o*3]=r;rgb[o*3+1]=gg;rgb[o*3+2]=bb;}
      }
    }
  }
  writePNG(file,W,H,rgb);
  console.log('wrote',path.basename(file),W+'x'+H,'center=('+centerMm.join(',')+') halfH='+halfHeightMm);
}
const out=path.join(root,'preview'); fs.mkdirSync(out,{recursive:true});

// ---- 自动取景：给定世界坐标点集与相机方向，算出恰好容纳的 center/halfHeight（含余量） ----
function frameFit(ptsMm, eyeDir, W, H, margin){
  margin=margin===undefined?1.10:margin;
  const fwd=new THREE.Vector3(...eyeDir).normalize();
  const up=new THREE.Vector3(0,0,1); if(Math.abs(fwd.dot(up))>0.95) up.set(0,1,0);
  const right=new THREE.Vector3().crossVectors(up,fwd).normalize();
  const camUp=new THREE.Vector3().crossVectors(fwd,right).normalize();
  // 全部在"mm"空间计算：方向为单位向量，点乘mm向量即得mm
  let uMin=1e9,uMax=-1e9,vMin=1e9,vMax=-1e9;
  const bbMin=new THREE.Vector3(1e9,1e9,1e9),bbMax=new THREE.Vector3(-1e9,-1e9,-1e9);
  for(const p of ptsMm){
    const v=new THREE.Vector3(p[0],p[1],p[2]);
    bbMin.min(v); bbMax.max(v);
    const u=v.dot(right), w=v.dot(camUp);
    uMin=Math.min(uMin,u);uMax=Math.max(uMax,u);
    vMin=Math.min(vMin,w);vMax=Math.max(vMax,w);
  }
  const bbMid=bbMin.clone().add(bbMax).multiplyScalar(0.5);
  const u0=bbMid.dot(right), v0=bbMid.dot(camUp);
  const mid=bbMid.clone().addScaledVector(right,(uMin+uMax)/2-u0).addScaledVector(camUp,(vMin+vMax)/2-v0);
  // 正交视锥：画面高度=2*half，宽度=2*half*(W/H) → 水平方向需求为 (uSpan/2)*(H/W)
  const half=Math.max((vMax-vMin)/2*margin,(uMax-uMin)/2*(H/W)*margin);
  return {cen:[mid.x,mid.y,mid.z], half};
}
// 收集匹配部件的世界顶点（mm），每3个顶点取1个以提速
function partPoints(nameRe){
  const pts=[];scene.updateMatrixWorld(true);
  scene.traverse(o=>{if(!o.isMesh||!o.visible||!o.geometry||!o.geometry.attributes.position)return;
    let nm='';for(let q=o;q;q=q.parent)nm+=(q.name||'')+'|';
    if(!nameRe.test(nm))return;
    const p=o.geometry.attributes.position;
    for(let i=0;i<p.count;i++){const v=new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld);pts.push([v.x/s,v.y/s,v.z/s]);}
  });
  return pts;
}
// 以 center 为中心、radius(mm) 邻域内的全部可见顶点（用于关节特写，避免远处部件撑大画面）
function nearPoints(centerMm,radiusMm){
  const pts=[];scene.updateMatrixWorld(true);
  const c=new THREE.Vector3(centerMm[0],centerMm[1],centerMm[2]);
  scene.traverse(o=>{if(!o.isMesh||!o.visible||!o.geometry||!o.geometry.attributes.position)return;
    const p=o.geometry.attributes.position;
    for(let i=0;i<p.count;i++){const v=new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld);const q=[v.x/s,v.y/s,v.z/s];
      if(c.distanceTo(new THREE.Vector3(q[0],q[1],q[2]))<=radiusMm)pts.push(q);}
  });
  return pts;
}
function renderNear(file,W,H,eyeDir,centerMm,radiusMm,margin){
  // 先取球形邻域，再剔除"投影到视锥外"的远端点：用与视轴垂直的切向距离二次收紧，
  // 使关节特写的取景只由关节附近实体决定（长的指节只会穿过画面而不会撑大构图）。
  const fwd=new THREE.Vector3(...eyeDir).normalize();
  const up=new THREE.Vector3(0,0,1); if(Math.abs(fwd.dot(up))>0.95) up.set(0,1,0);
  const right=new THREE.Vector3().crossVectors(up,fwd).normalize();
  const camUp=new THREE.Vector3().crossVectors(fwd,right).normalize();
  const c=new THREE.Vector3(centerMm[0],centerMm[1],centerMm[2]);
  const pts=nearPoints(centerMm,radiusMm).filter(q=>{
    const d=new THREE.Vector3(q[0]-c.x,q[1]-c.y,q[2]-c.z);
    const radial=Math.hypot(d.dot(right),d.dot(camUp));   // 到视轴的垂距
    const axial=Math.abs(d.dot(fwd));
    return radial<=radiusMm*0.95 || axial>radiusMm;         // 保留关节附近的横向实体
  });
  if(!pts.length){console.log('WARN no parts near',file);return;}
  const {cen,half}=frameFit(pts,eyeDir,W,H,margin||1.10);
  render(file,W,H,eyeDir,cen,half);
}
function renderAuto(file,W,H,eyeDir,nameRe,margin){
  const pts=partPoints(nameRe);
  if(!pts.length){console.log('WARN no parts for',file);return;}
  const {cen,half}=frameFit(pts,eyeDir,W,H,margin||1.10);
  render(file,W,H,eyeDir,cen,half);
}

// 视角：eyeDir 为相机方向；自动取景按"由正则选出的部件集合"框住画面
const ISO=[0.55,-0.5,0.67], ISO2=[-0.5,-0.55,0.67], TOPZ=[0,0,-1];
const ALL=/phalanx1|phalanx2|phalanx3|motor1|motor2|t1Tendon|t2Tendon/;

// ---- (1)(2)(3) 卷曲态 θ1=80° θ2=50°：整体 ----
api.updateMechanism(80,50);
renderAuto(path.join(out,'finger_01_iso_curl.png'),1400,1000,ISO,ALL,1.06);
renderAuto(path.join(out,'finger_02_main_curl.png'),1400,900,TOPZ,ALL,1.06);
renderAuto(path.join(out,'finger_03_iso2_curl.png'),1400,1000,ISO2,ALL,1.06);
// ---- (4) 关节1 特写：世界(0,0) 邻域 150mm ----
renderNear(path.join(out,'finger_04_joint1.png'),1000,1000,[0.4,-0.35,0.85],[0,0,0],95);
// ---- (5) 关节2 + 指尖 特写：O2(80°,50°)≈(295,-52) 邻域 170mm ----
{
  const J=api.getJoints(80,50);
  renderNear(path.join(out,'finger_05_joint2_tip.png'),1000,1000,[0.45,-0.3,0.84],[J.O2.x,J.O2.y,0],105);
}
// ---- (6) 连杆1 + B/D 叉头特写：连杆中点 邻域 70mm ----
{
  const J=api.getJoints(80,50);
  const mx=(J.B1.x+J.D1.x)/2, my=(J.B1.y+J.D1.y)/2;
  renderNear(path.join(out,'finger_06_link.png'),1000,900,[0.3,-0.25,0.92],[mx,my,0],60);
}
// ---- (7) 电机1 安装特写：抱箍中心(28,196) 邻域 75mm ----
renderNear(path.join(out,'finger_07_motor_mount.png'),1000,900,[0.35,-0.4,0.85],[28,196,0],60);
// ---- (8) 电机2 安装特写：P2局部(28,-170)→世界 邻域 90mm ----
{
  const t=80*Math.PI/180;
  const rot=(x,y)=>[x*Math.cos(t)-y*Math.sin(t), x*Math.sin(t)+y*Math.cos(t)];
  const c=rot(28,-170);
  renderNear(path.join(out,'finger_08_motor2_mount.png'),1000,900,[0.35,-0.4,0.85],[c[0],c[1],0],70);
}
// ---- (9) 伸直态 θ1=θ2=0 ----
api.updateMechanism(0,0);
renderAuto(path.join(out,'finger_09_straight_iso.png'),1000,1300,ISO,ALL,1.05);
// ---- (10) 全屈极限 θ1=θ2=120° ----
api.updateMechanism(120,120);
renderAuto(path.join(out,'finger_10_fullflex_iso.png'),1300,1000,ISO,ALL,1.06);
