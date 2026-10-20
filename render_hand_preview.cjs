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
// 相机基：本模型长轴 = y（掌骨板/腕在 +y，五指指尖朝 -y）。以 +y 为画面“上”，
// 画面即恒为“指根在上、指尖在下”，与在浏览器里看单指版一致（避免再出现指尖/指根颠倒的取景）。
function camBasis(fwdVec){
  const fwd=fwdVec.clone().normalize();
  const up=new THREE.Vector3(0,1,0);
  if(Math.abs(fwd.dot(up))>0.95) up.set(0,0,1);   // 正对 ±y（俯视指根）时退化，改用 +z
  const right=new THREE.Vector3().crossVectors(up,fwd).normalize();
  const camUp=new THREE.Vector3().crossVectors(fwd,right).normalize();
  return {fwd,right,camUp};
}
// 某世界点(mm)在画面上的纵坐标（与 render 内部同一映射，用于朝向自检）
function screenY(eyeDir,centerMm,halfMm,H,pMm){
  const b=camBasis(new THREE.Vector3(eyeDir[0],eyeDir[1],eyeDir[2]));
  const scale=(H/2)/(halfMm*s), cen=new THREE.Vector3(centerMm[0]*s,centerMm[1]*s,centerMm[2]*s);
  const d=new THREE.Vector3(pMm[0]*s,pMm[1]*s,pMm[2]*s).sub(cen);
  return -(d.dot(b.camUp))*scale+H/2;
}
function render(file,W,H,eyeDir,centerMm,halfHeightMm){
  const rgb=Buffer.alloc(W*H*3);for(let i=0;i<W*H;i++){rgb[i*3]=0x1a;rgb[i*3+1]=0x1a;rgb[i*3+2]=0x2e;}
  const zb=new Float32Array(W*H).fill(-Infinity);
  const fwd=new THREE.Vector3(eyeDir[0],eyeDir[1],eyeDir[2]).normalize();
  const _B=camBasis(fwd), right=_B.right, camUp=_B.camUp;
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
  const _B=camBasis(fwd), right=_B.right, camUp=_B.camUp;
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
  return fit;
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
  const _B=camBasis(fwd), right=_B.right, camUp=_B.camUp;
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
// 取景方向：模型长轴 = y（掌骨板/腕在 +y，指尖朝 -y），画面用 +y 作“上”，
// 所以每张图都是“指根在上、指尖在下”，与浏览器里看单指版一致。
const ISO =[0.62, 0.46, 0.64];   // 3/4 等轴（从掌侧上方看）
const ISO2=[-0.55,0.40, 0.73];   // 另一侧 3/4
const FACE=[0.04, 0.06, 1.00];   // 沿 +z：手指机构平面正视（电机/BD 连杆/叉耳同平面）
const SIDE=[1.00, 0.05, 0.07];   // 沿 +x 看机构剖面（五平面互相平行、指根法兰共面）
const ALL=/index_|middle_|ring_|pinky_|thumb_|palmPlate|wrist|thumbBridge/;
const PLATE=/^palmPlate/;

// 朝向自检：断言“掌骨板在画面里比指尖高”（screenY 越小越靠上），把“指尖/指根颠倒”变成可测项。
function bboxCenterOf(pts){
  const mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];
  for(const q of pts) for(let k=0;k<3;k++){mn[k]=Math.min(mn[k],q[k]);mx[k]=Math.max(mx[k],q[k]);}
  return [0,1,2].map(k=>(mn[k]+mx[k])/2);
}
let orientFail=0;
function orientCheck(tag,eyeDir,fit,W,H,expectTucked){
  // expectTucked：抓握/满握态指尖本来就卷到掌侧（可高于掌骨板中线），不算取景颠倒
  //   反根后“指尖”= 自由端（原指根端，带圆头/防滑垫），掌骨板侧是固定的接掌末端段
  const plate=bboxCenterOf(partPoints(PLATE,true));
  const tip=api.getJoints({})['middle'].tip; const tipMM=[tip.x/s,tip.y/s,tip.z/s];
  const yP=screenY(eyeDir,fit.cen,fit.half,H,plate), yT=screenY(eyeDir,fit.cen,fit.half,H,tipMM);
  const ok=expectTucked?true:(yP<yT-10);
  if(!ok)orientFail++;
  console.log('   [朝向] '+tag.padEnd(22)+' 掌骨板 screenY='+yP.toFixed(0).padStart(5)+'   中指尖 screenY='+yT.toFixed(0).padStart(5)+'   '+(expectTucked?'抓握态：自由端（指尖）已卷向掌侧（预期）':(ok?'接掌端在上/指尖在下 OK':'上下颠倒 !!')));
}

// (1) 伸直态（安全零位）整手等轴
setU(0);
{const f=renderAuto(path.join(out,'hand_01_iso_open.png'),1100,1500,ISO,ALL,1.04); orientCheck('hand_01_iso_open',ISO,f,1100,1500);}
// (2) 指距视图：沿 +x 看，五指并列、指距 70mm、指根法兰共面（画面：指根在上、指尖在下）
{const f=renderAuto(path.join(out,'hand_02_palm_face.png'),1000,1400,SIDE,ALL,1.04); orientCheck('hand_02_palm_face',SIDE,f,1000,1400);}
// (3) 单指机构平面正视：只留食指，沿 +z 看每个单元的「电机—推杆—BD 连杆—销轴」共面关系
{ scene.traverse(o=>{ if(o.isMesh && !/^index_/.test(o.name)) o.visible=false; });
  const f=renderAuto(path.join(out,'hand_03_mechanism_plane.png'),460,1400,FACE,ALL,1.04);
  orientCheck('hand_03_mechanism_plane',FACE,f,460,1400);
  scene.traverse(o=>{ if(o.isMesh) o.visible=true; }); }
// (4) 等比抓握 u=0.6（自由端已明显卷向掌侧，故按“抓握态”判定）
setU(0.6);
{const f=renderAuto(path.join(out,'hand_04_iso_grip.png'),1200,1400,ISO,ALL,1.05); orientCheck('hand_04_iso_grip',ISO,f,1200,1400,true);}
// (5) 满握 u=1.0（各指安全包络极值）
setU(1.0);
{const f=renderAuto(path.join(out,'hand_05_fist_iso.png'),1200,1300,ISO2,ALL,1.05); orientCheck('hand_05_fist_iso',ISO2,f,1200,1300,true);}
// (6) 拇指对掌位 + 食指捏合
setU(0);
{ const pose={}; for(const f of HAND.fingers) pose[f.key]=f.limits.map(()=>0);
  pose.thumb=[90,70]; pose.index=[60,70,45]; pose.middle=[25,30,20];
  api.updateMechanism(pose); }
{const f=renderAuto(path.join(out,'hand_06_pinch.png'),1200,1400,ISO,ALL,1.05); orientCheck('hand_06_pinch',ISO,f,1200,1400);}
// (7) 掌体骨架单独（隐藏五指）
setU(0);
const hidden=[];
scene.traverse(o=>{ if(o.isMesh){ let nm='';for(let q=o;q;q=q.parent)nm+=(q.name||'')+'|';
  if(!/palmPlate|palmSpliceTop|wristBlock|wristBoss|thumbBridge/.test(nm)){ hidden.push(o); o.visible=false; } } });
renderAuto(path.join(out,'hand_07_chassis.png'),1400,1000,ISO,/palmPlate|palmSpliceTop|wristBlock|wristBoss|thumbBridge/,1.06);
for(const o of hidden) o.visible=true;
// (8) 掌指关节特写（食指 MCP，含电机 0 / 叉耳 / 袖套 / 肩螺栓）
//     反根后 O0 随自由端运动，必须先把姿态真正下发到场景再取景，否则解析关节与网格错位
setU(0);
{ // 取景用零位姿态：关节解析位置与网格矩阵一致（先前下发屈曲姿态后矩阵未刷新 → nearPoints 取空）
  const pose={}; for(const f of HAND.fingers) pose[f.key]=f.limits.map(()=>0);
  api.updateMechanism(pose);
  renderNear(path.join(out,'hand_08_mcp_closeup.png'),1100,1000,[0.40,0.42,0.82],[0,0,-20],200); }
// (8b) 展开/并拢副特写（中指：叉耳+Ø10 铰链+毂+曲柄+D 双耳+85mm 连杆+侧挂电机+C 形吊架）
setU(0);
{ const pose={}; for(const f of HAND.fingers) pose[f.key]=f.limits.map(()=>0);
  api.updateMechanism(pose);
  const F=api.FINGERS['middle'];
  renderNear(path.join(out,'hand_11_spread_hinge.png'),1200,1000,[0.55,0.22,0.80],[0,F.spreadGroup.position.y/s+18,F.pos[2]],190); }
// (9) 指尖抓握垫特写（满握态中指尖）
setU(1.0);
{ const C=api.getJoints({})['middle'];
  renderNear(path.join(out,'hand_09_tips.png'),1100,1000,[0.30,0.34,0.89],[C.tip.x/s,C.tip.y/s,C.tip.z/s],110); }
// (10) 腕接口 / 掌骨板 / 拇指桥特写
setU(0);
renderNear(path.join(out,'hand_10_wrist.png'),1200,900,[0.36,0.44,0.82],[0,352,0],150);
console.log(orientFail? ('取景朝向自检：'+orientFail+' 张图上下颠倒 ✗') : '取景朝向自检：全部主视图“接掌固定端在上、指尖在下” ✓');
if(orientFail)process.exitCode=1;