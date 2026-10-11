'use strict';
// 五指整手模型多视角离屏渲染（正交+Z缓冲+简单光照），输出PNG供目视核对。
// 复用 render_finger_preview.cjs 的软件渲染管线，模型源为 hand_mechanism_3d.html。
const fs=require('fs'),path=require('path'),zlib=require('zlib');
const THREE=require('./.verification/three-r128.cjs');
const root=__dirname;
const html=fs.readFileSync(path.join(root,'hand_mechanism_3d.html'),'utf8');
const script=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes('const P ='))[1];
const nodes=new Map(),document={getElementById(id){if(!nodes.has(id))nodes.set(id,{});return nodes.get(id);}};
const main=script.slice(0,script.lastIndexOf('\ninitScene();'));
const api=new Function('THREE','document',main+'\nscene=new THREE.Scene();showLabels=false;buildMechanism();updateMechanism();return {P,s,scene,HAND,FINGERS,updateMechanism,getJoints};')(THREE,document);
const {P,s,scene,HAND}=api;
const bo=scene.getObjectByName('bodyOutline'); if(bo) bo.visible=false;
const grid=scene.getObjectByName('grid'); if(grid) grid.visible=false;
let crcT=null;
function crc32(buf){if(!crcT){crcT=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;crcT[n]=c>>>0;}}let c=0xFFFFFFFF;for(const b of buf)c=crcT[(c^b)&0xFF]^(c>>>8);return (c^0xFFFFFFFF)>>>0;}
function chunk(type,data){const len=Buffer.alloc(4);len.writeUInt32BE(data.length);const td=Buffer.concat([Buffer.from(type,'ascii'),data]);const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(td));return Buffer.concat([len,td,crc]);}
function writePNG(file,w,h,rgb){const raw=Buffer.alloc((w*3+1)*h);for(let y=0;y<h;y++){raw[y*(w*3+1)]=0;rgb.copy(raw,y*(w*3+1)+1,y*w*3,(y+1)*w*3);}const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=2;fs.writeFileSync(file,Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))]));}
function render(file,W,H,eyeDir,centerMm,halfHeightMm){
  const rgb=Buffer.alloc(W*H*3);for(let i=0;i<W*H;i++){rgb[i*3]=0x1a;rgb[i*3+1]=0x1a;rgb[i*3+2]=0x2e;}
  const zb=new Float32Array(W*H).fill(-Infinity);
  const fwd=new THREE.Vector3(eyeDir[0],eyeDir[1],eyeDir[2]).normalize();
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
    const mw=mesh.matrixWorld; const n=idx?idx.count:pos.count; const V=[];
    for(let i=0;i<pos.count;i++) V.push(new THREE.Vector3().fromBufferAttribute(pos,i).applyMatrix4(mw));
    for(let t=0;t<n;t+=3){
      const i0=idx?idx.getX(t):t, i1=idx?idx.getX(t+1):t+1, i2=idx?idx.getX(t+2):t+2;
      const a=V[i0],b=V[i1],c=V[i2];
      const nrm=new THREE.Vector3().subVectors(b,a).cross(new THREE.Vector3().subVectors(c,a));
      if(nrm.length()<1e-12) continue; nrm.normalize();
      const P3=[a,b,c].map(v=>{const d=new THREE.Vector3().subVectors(v,cen);return {x:d.dot(right)*scale+W/2, y:-(d.dot(camUp))*scale+H/2, z:d.dot(fwd)};});
      const lam=0.35+0.65*Math.abs(nrm.dot(light));
      const r=Math.min(255,col.r*255*lam+18),gg=Math.min(255,col.g*255*lam+18),bb=Math.min(255,col.b*255*lam+18);
      const minx=Math.max(0,Math.floor(Math.min(P3[0].x,P3[1].x,P3[2].x))),maxx=Math.min(W-1,Math.ceil(Math.max(P3[0].x,P3[1].x,P3[2].x)));
      const miny=Math.max(0,Math.floor(Math.min(P3[0].y,P3[1].y,P3[2].y))),maxy=Math.min(H-1,Math.ceil(Math.max(P3[0].y,P3[1].y,P3[2].y)));
      const p0=P3[0],p1=P3[1],p2=P3[2], area=(p1.x-p0.x)*(p2.y-p0.y)-(p2.x-p0.x)*(p1.y-p0.y);
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
  console.log('wrote',path.basename(file),W+'x'+H,'center=('+centerMm.map(x=>x.toFixed(0)).join(',')+') halfH='+halfHeightMm.toFixed(0));
}
const out=path.join(root,'preview'); fs.mkdirSync(out,{recursive:true});
function frameFit(ptsMm, eyeDir, W, H, margin){
  margin=margin===undefined?1.10:margin;
  const fwd=new THREE.Vector3(eyeDir[0],eyeDir[1],eyeDir[2]).normalize();
  const up=new THREE.Vector3(0,0,1); if(Math.abs(fwd.dot(up))>0.95) up.set(0,1,0);
  const right=new THREE.Vector3().crossVectors(up,fwd).normalize();
  const camUp=new THREE.Vector3().crossVectors(fwd,right).normalize();
  let uMin=1e9,uMax=-1e9,vMin=1e9,vMax=-1e9;
  const bbMin=new THREE.Vector3(1e9,1e9,1e9),bbMax=new THREE.Vector3(-1e9,-1e9,-1e9);
  for(const q of ptsMm){
    const v=new THREE.Vector3(q[0],q[1],q[2]);
    bbMin.min(v); bbMax.max(v);
    const u=v.dot(right), w=v.dot(camUp);
    uMin=Math.min(uMin,u);uMax=Math.max(uMax,u);vMin=Math.min(vMin,w);vMax=Math.max(vMax,w);
  }
  const bbMid=bbMin.clone().add(bbMax).multiplyScalar(0.5);
  const u0=bbMid.dot(right), v0=bbMid.dot(camUp);
  const mid=bbMid.clone().addScaledVector(right,(uMin+uMax)/2-u0).addScaledVector(camUp,(vMin+vMax)/2-v0);
  const half=Math.max((vMax-vMin)/2*margin,(uMax-uMin)/2*(H/W)*margin);
  return {cen:[mid.x,mid.y,mid.z], half:half};
}
function partPoints(nameRe, skipHidden){
  const pts=[];scene.updateMatrixWorld(true);
  scene.traverse(o=>{if(!o.isMesh||!o.geometry||!o.geometry.attributes.position)return;
    if(skipHidden && !isVis(o)) return;
    let nm='';for(let q=o;q;q=q.parent)nm+=(q.name||'')+'|';
    if(!nameRe.test(nm))return;
    const q=o.geometry.attributes.position;
    for(let i=0;i<q.count;i++){const v=new THREE.Vector3().fromBufferAttribute(q,i).applyMatrix4(o.matrixWorld);pts.push([v.x/s,v.y/s,v.z/s]);}
  });
  return pts;
}
function isVis(o){ for(let q=o;q;q=q.parent) if(q.visible===false) return false; return true; }
function renderAuto(file,W,H,eyeDir,nameRe,margin){
  const pts=partPoints(nameRe,true);
  if(!pts.length){console.log('WARN no parts for',file);return;}
  const fit=frameFit(pts,eyeDir,W,H,margin||1.06);
  render(file,W,H,eyeDir,fit.cen,fit.half);
}
function nearPoints(centerMm,radiusMm){
  const pts=[];scene.updateMatrixWorld(true);
  const c=new THREE.Vector3(centerMm[0],centerMm[1],centerMm[2]);
  scene.traverse(o=>{if(!o.isMesh||!isVis(o)||!o.geometry||!o.geometry.attributes.position)return;
    const q=o.geometry.attributes.position;
    for(let i=0;i<q.count;i++){const v=new THREE.Vector3().fromBufferAttribute(q,i).applyMatrix4(o.matrixWorld);const w=[v.x/s,v.y/s,v.z/s];
      if(c.distanceTo(new THREE.Vector3(w[0],w[1],w[2]))<=radiusMm)pts.push(w);}
  });
  return pts;
}
function renderNear(file,W,H,eyeDir,centerMm,radiusMm,margin){
  const fwd=new THREE.Vector3(eyeDir[0],eyeDir[1],eyeDir[2]).normalize();
  const up=new THREE.Vector3(0,0,1); if(Math.abs(fwd.dot(up))>0.95) up.set(0,1,0);
  const right=new THREE.Vector3().crossVectors(up,fwd).normalize();
  const camUp=new THREE.Vector3().crossVectors(fwd,right).normalize();
  const c=new THREE.Vector3(centerMm[0],centerMm[1],centerMm[2]);
  const pts=nearPoints(centerMm,radiusMm).filter(q=>{
    const d=new THREE.Vector3(q[0]-c.x,q[1]-c.y,q[2]-c.z);
    const radial=Math.hypot(d.dot(right),d.dot(camUp));
    const axial=Math.abs(d.dot(fwd));
    return radial<=radiusMm*0.95 || axial>radiusMm;
  });
  if(!pts.length){console.log('WARN no parts near',file);return;}
  const fit=frameFit(pts,eyeDir,W,H,margin||1.10);
  render(file,W,H,eyeDir,fit.cen,fit.half);
}
// ---- 姿态工具：u = 各指按自身安全包络的等比抓握比例 ----
function setU(u, thumbU){
  const pose={};
  for(const f of HAND.fingers) pose[f.key]=f.limits.map(l=>l*u*((f.key==='thumb'&&thumbU!==undefined)?thumbU:1));
  api.updateMechanism(pose);
}
const ISO=[0.55,-0.5,0.67], ISO2=[-0.5,-0.55,0.67], PALM=[0.10,0.97,0.22], SIDE=[1,0,0], TOP=[0,0,1];
const ALL=/index_|middle_|ring_|pinky_|thumb_|palmPlate|wrist|thumbBridge/;

// (1) 伸直态（安全零位）整手等轴视图
setU(0);
renderAuto(path.join(out,'hand_01_iso_open.png'),1500,1100,ISO,ALL,1.05);
// (2) 掌面视图（沿 +y 看掌骨板与五指指距 70mm）
renderAuto(path.join(out,'hand_02_palm_face.png'),1500,1000,PALM,ALL,1.05);
// (3) 侧视（沿 +x 看五个平行机构平面）
renderAuto(path.join(out,'hand_03_side_planes.png'),1500,1000,SIDE,ALL,1.05);
// (4) 等比抓握 u=0.6
setU(0.6);
renderAuto(path.join(out,'hand_04_iso_grip.png'),1500,1100,ISO,ALL,1.05);
// (5) 满握 u=1.0（各指安全包络极值）
setU(1.0);
renderAuto(path.join(out,'hand_05_fist_iso.png'),1500,1100,ISO2,ALL,1.05);
// (6) 拇指对掌 + 食指捏合
setU(0);
{ const pose={}; for(const f of HAND.fingers) pose[f.key]=f.limits.map(()=>0);
  pose.thumb=[90,70]; pose.index=[60,70,45]; pose.middle=[25,30,20];
  api.updateMechanism(pose); }
renderAuto(path.join(out,'hand_06_pinch.png'),1400,1100,ISO,ALL,1.05);
// (7) 掌体骨架单独视图（隐藏五指）
setU(0);
const hidden=[];
scene.traverse(o=>{ if(o.isMesh){ let nm='';for(let q=o;q;q=q.parent)nm+=(q.name||'')+'|';
  if(!/palmPlate|palmSpliceTop|wristBlock|wristBoss|thumbBridge/.test(nm)){ hidden.push(o); o.visible=false; } } });
renderAuto(path.join(out,'hand_07_chassis.png'),1400,1000,ISO,/palmPlate|palmSpliceTop|wristBlock|wristBoss|thumbBridge/,1.06);
for(const o of hidden) o.visible=true;
// (8) 掌指关节特写（食指 MCP）
setU(0);
{ const C=api.getJoints({index:[40,40,25]})['index'];
  renderNear(path.join(out,'hand_08_mcp_closeup.png'),1100,1000,[0.42,-0.34,0.86],[C.OW[0].x/s,C.OW[0].y/s,C.OW[0].z/s],110); }
// (9) 指尖抓握垫特写（满握态中指尖）
setU(1.0);
{ const C=api.getJoints({})['middle'];
  renderNear(path.join(out,'hand_09_tips.png'),1100,1000,[0.30,-0.36,0.88],[C.tip.x/s,C.tip.y/s,C.tip.z/s],110); }
// (10) 腕接口/掌骨板特写
setU(0);
renderNear(path.join(out,'hand_10_wrist.png'),1200,900,[0.38,0.42,0.82],[0,352,0],150);
