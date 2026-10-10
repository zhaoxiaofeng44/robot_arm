'use strict';
// 单指（食指）模型多视角离屏渲染：软件光栅（正交+Z缓冲+Lambert），输出 PNG 供目视核对。
// 模型源：hand_mechanism_3d.html —— 该文件当前为"只保留食指 + 指根接简化底板"的单指版本。
// 相对 finger 版的重点差异：
//   ① buildMechanism()/updateMechanism(θ1,θ2) 为两参数，且多了指根"简化底板"组件；
//   ② ALL 正则纳入底板/螺栓，保证自动取景把衔接处一起框进画面；
//   ③ 新增指根衔接（简化底板）专视角，用于检查"衔接"是否合理。
const fs=require('fs'),path=require('path'),zlib=require('zlib');
const THREE=require('./.verification/three-r128.cjs');
const root=__dirname;
function loadModel(file){
  const html=fs.readFileSync(path.join(root,file),'utf8');
  const script=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes('const P ='))[1];
  const nodes=new Map(),document={getElementById(id){if(!nodes.has(id))nodes.set(id,{});return nodes.get(id);}};
  const main=script.slice(0,script.lastIndexOf('\ninitScene();'));
  return new Function('THREE','document',main+
    '\nscene=new THREE.Scene();showLabels=false;buildMechanism();updateMechanism(0,0);'+
    'return {P,s,scene,updateMechanism,getJoints,angleToStroke};')(THREE,document);
}
const api=loadModel('hand_mechanism_3d.html');
const {P,s,scene}=api;
const bo=scene.getObjectByName('bodyOutline'); if(bo) bo.visible=false;
const grid=scene.getObjectByName('grid'); if(grid) grid.visible=false;

// ---- PNG 编码 ----
let crcT=null;
function crc32(buf){if(!crcT){crcT=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;crcT[n]=c>>>0;}}let c=0xFFFFFFFF;for(const b of buf)c=crcT[(c^b)&0xFF]^(c>>>8);return (c^0xFFFFFFFF)>>>0;}
function chunk(type,data){const len=Buffer.alloc(4);len.writeUInt32BE(data.length);const td=Buffer.concat([Buffer.from(type,'ascii'),data]);const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(td));return Buffer.concat([len,td,crc]);}
function writePNG(file,w,h,rgb){const raw=Buffer.alloc((w*3+1)*h);for(let y=0;y<h;y++){raw[y*(w*3+1)]=0;rgb.copy(raw,y*(w*3+1)+1,y*w*3,(y+1)*w*3);}const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=2;fs.writeFileSync(file,Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))]));}

// ---- 正交渲染 ----
// 返回 {rgb,W,H,touch,coverage,cam}，供"不裁切"自校正循环与文字标注使用
function renderRaw(W,H,eyeDir,centerMm,halfHeightMm,upHint){
  const rgb=Buffer.alloc(W*H*3);for(let i=0;i<W*H;i++){rgb[i*3]=0x1a;rgb[i*3+1]=0x1a;rgb[i*3+2]=0x2e;}
  const zb=new Float32Array(W*H).fill(-Infinity);
  const fwd=new THREE.Vector3(...eyeDir).normalize();
  const up=upHint?new THREE.Vector3(...upHint).normalize():new THREE.Vector3(0,0,1);
  if(!upHint&&Math.abs(fwd.dot(up))>0.95) up.set(0,1,0);
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
  // 统计：非背景像素覆盖率 + 是否触边（数值化，替代肉眼判断）
  let n=0,touch=false;
  for(let i=0;i<W*H;i++){
    if(rgb[i*3]!==0x1a||rgb[i*3+1]!==0x1a||rgb[i*3+2]!==0x2e)n++;
  }
  for(let x=0;x<W;x++){
    for(const y of [0,H-1]){const o=(y*W+x)*3;if(rgb[o]!==0x1a||rgb[o+1]!==0x1a||rgb[o+2]!==0x2e)touch=true;}
  }
  for(let y=0;y<H;y++){
    for(const x of [0,W-1]){const o=(y*W+x)*3;if(rgb[o]!==0x1a||rgb[o+1]!==0x1a||rgb[o+2]!==0x2e)touch=true;}
  }
  return {rgb,W,H,touch,coverage:n/(W*H),
    cam:{right,camUp,fwd,cen,half:halfHeightMm*s,scale:(H/2)/(halfHeightMm*s),W,H}};
}
// 5x7 点阵字（仅 ASCII），用于把"指根/指尖"等标注直接烧进图里，避免读图方向歧义
function drawText(px,W,H,x0,y0,str,sc,r,g,b){
  const F={'A':'01110100011000111111100011000110001','B':'11110100011000111110100011000111110',
  'C':'01110100011000010000100001000101110','D':'11110100011000110001100011000111110',
  'E':'11111100001000011110100001000011111','F':'11111100001000011110100001000010000',
  'G':'01110100011000010011100011000101111','H':'10001100011000111111100011000110001',
  'I':'11111001000010000100001000010011111','J':'00111000100001000010100101001001100',
  'K':'10001100101010011000101001001010001','L':'10000100001000010000100001000011111',
  'M':'10001110111010110101100011000110001','N':'10001110011010110011100011000110001',
  'O':'01110100011000110001100011000101110','P':'11110100011000111110100001000010000',
  'R':'11110100011000111110101001001010001','S':'01111100001000001110000010000111110',
  'T':'11111001000010000100001000010000100','U':'10001100011000110001100011000101110',
  'V':'10001100011000110001100010101000100','W':'10001100011000110101101011101110001',
  'X':'10001100010101000100010101000110001','Y':'10001100010101000100001000010000100',
  '0':'01110100011001110101110011000101110','1':'00100011000010000100001000010001110',
  '2':'01110100010000100110010001000011111','3':'01110100010000100110000011000101110',
  '4':'00010001100101010010111110001000010','5':'11111100001111000001000011000101110',
  '6':'00110001000011111000110001000101110','7':'11111000010001000100010001000100010',
  '8':'01110100011000101110100011000101110','9':'01110100011000101111000010001001100',
  '-':'00000000000000011111000000000000000',' ':'00000000000000000000000000000000000',
  '/':'00001000100001000100010001000010000',':':'00000001000010000000001000010000000'};
  let cx=x0;
  for(const ch of str.toUpperCase()){
    const gl=F[ch]||F[' '];
    for(let j=0;j<7;j++)for(let i=0;i<5;i++)
      if(gl[j*5+i]==='1')
        for(let sy=0;sy<sc;sy++)for(let sx=0;sx<sc;sx++){
          const x=cx+i*sc+sx,y=y0+j*sc+sy;
          if(x>=0&&x<W&&y>=0&&y<H){const o=(y*W+x)*3;px[o]=r;px[o+1]=g;px[o+2]=b;}
        }
    cx+=6*sc;
  }
  return cx;
}
// 世界坐标 → 屏幕像素
function projectToScreen(pMm,cam){
  const v=new THREE.Vector3(pMm[0]*s,pMm[1]*s,pMm[2]*s).sub(cam.cen);
  return [v.dot(cam.right)*cam.scale+cam.W/2, -(v.dot(cam.camUp))*cam.scale+cam.H/2];
}
// 带标注渲染：把 ASCII 标签烧在指定世界坐标处
function renderAnnotated(file,W,H,eyeDir,centerMm,halfHeightMm,upHint,annots){
  let half=halfHeightMm,r=null;
  for(let k=0;k<5;k++){
    r=renderRaw(W,H,eyeDir,centerMm,half,upHint);
    if(!r.touch)break;
    half*=1.12;
  }
  for(const [txt,pMm,col] of annots){
    const [sx,sy]=projectToScreen(pMm,r.cam);
    drawText(r.rgb,W,H,Math.round(sx)+6,Math.round(sy)-8,txt,3,col[0],col[1],col[2]);
    // 短引线
    for(let d=0;d<14;d++){const o=(Math.round(sy)*W+Math.round(sx)+d)*3;
      if(Math.round(sx)+d<r.W){r.rgb[o]=col[0];r.rgb[o+1]=col[1];r.rgb[o+2]=col[2];}}
  }
  writePNG(file,W,H,r.rgb);
  console.log('wrote',path.basename(file),W+'x'+H,'halfH='+half.toFixed(1),'标注'+annots.length+'处','覆盖率='+(r.coverage*100).toFixed(1)+'%');
}
function render(file,W,H,eyeDir,centerMm,halfHeightMm,noCrop){
  // noCrop：若实体触边则按 1.12 倍逐次放宽，最多 5 次，保证画面不被裁切
  let half=halfHeightMm, r=null;
  const tries=noCrop?5:1;
  for(let k=0;k<tries;k++){
    r=renderRaw(W,H,eyeDir,centerMm,half);
    if(!r.touch)break;
    half*=1.12;
  }
  writePNG(file,W,H,r.rgb);
  console.log('wrote',path.basename(file),W+'x'+H,'center=('+centerMm.map(v=>v.toFixed(1)).join(',')+')',
    'halfH='+half.toFixed(1),'覆盖率='+(r.coverage*100).toFixed(1)+'%',r.touch?('⚠仍触边×'+tries):'不裁切');
}
const out=path.join(root,'preview'); fs.mkdirSync(out,{recursive:true});

// ---- 自动取景：给定世界坐标点集与相机方向，算出恰好容纳的 center/halfHeight（含余量） ----
function frameFit(ptsMm, eyeDir, W, H, margin,upHint){
  margin=margin===undefined?1.10:margin;
  const fwd=new THREE.Vector3(...eyeDir).normalize();
  const up=upHint?new THREE.Vector3(...upHint).normalize():new THREE.Vector3(0,0,1);
  if(!upHint&&Math.abs(fwd.dot(up))>0.95) up.set(0,1,0);
  const right=new THREE.Vector3().crossVectors(up,fwd).normalize();
  const camUp=new THREE.Vector3().crossVectors(fwd,right).normalize();
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
  const half=Math.max((vMax-vMin)/2*margin,(uMax-uMin)/2*(H/W)*margin);
  return {cen:[mid.x,mid.y,mid.z], half};
}
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
  const fwd=new THREE.Vector3(...eyeDir).normalize();
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
  const {cen,half}=frameFit(pts,eyeDir,W,H,margin||1.10);
  render(file,W,H,eyeDir,cen,half,false);
}
function renderAuto(file,W,H,eyeDir,nameRe,margin,noCrop){
  const pts=partPoints(nameRe);
  if(!pts.length){console.log('WARN no parts for',file);return;}
  const {cen,half}=frameFit(pts,eyeDir,W,H,margin||1.10);
  render(file,W,H,eyeDir,cen,half,noCrop);
}
// 隔离渲染：只显示匹配 nameRe 的零件，避免其余长指节穿过画面导致"看起来被裁切"。
// 用于指根衔接等局部视角——画面只由目标零件决定，构图干净且必定不裁切。
function renderIsolated(file,W,H,eyeDir,nameRe,margin){
  const hidden=[];
  scene.traverse(o=>{
    if(!o.isMesh)return;
    let nm='';for(let q=o;q;q=q.parent)nm+=(q.name||'')+'|';
    if(nameRe.test(nm))return;
    if(o.visible){hidden.push(o);o.visible=false;}
  });
  try{
    const pts=partPoints(nameRe);
    if(!pts.length){console.log('WARN no parts for',file);hidden.forEach(o=>o.visible=true);return;}
    const {cen,half}=frameFit(pts,eyeDir,W,H,margin||1.10);
    render(file,W,H,eyeDir,cen,half,true);
  } finally { hidden.forEach(o=>o.visible=true); }
}

// 视角常量（与 finger 版一致）：eyeDir 为相机方向
const ISO=[0.55,-0.5,0.67], ISO2=[-0.5,-0.55,0.67], TOPZ=[0,0,-1], TOPZ2=[0,0,1];
// 主体：三节指骨 + 两台电机 + 两根连杆；底板/紧固件单独视角查看
const ALL=/phalanx1|phalanx2|phalanx3|motor1|motor2|t1Tendon|t2Tendon/;
const ALLROOT=/phalanx1|p1Palm/;   // 指根衔接：P1 与简化底板/螺栓
const ALLFULL=/phalanx1|phalanx2|phalanx3|motor1|motor2|t1Tendon|t2Tendon|p1Palm/;  // 整体含底板

// ================= 定向证明图：指尖朝上 + 直接标注 =================
// 说明：此前所有 ISO 图的屏幕上方是"指根"、下方是"指尖"（camUp=+0.45Y），
//      按"上=指尖"的直觉去读会误以为首尾反了。本图强制 camUp=−Y，让指尖朝上，
//      并把 指根/电机/关节/指尖 直接烧进图里，彻底消除方向歧义。
{
  api.updateMechanism(0,0);
  const EYE=[0,0,1], UPHINT=[0,1,0];        // 正对屈曲平面；指尖(+Y)朝上
  const pts=partPoints(ALLFULL);
  const {cen,half}=frameFit(pts,EYE,1000,1500,1.06,UPHINT);
  const J=api.getJoints(0,0);
  const OR=[255,136,68],GN=[102,221,170],PK=[255,102,170],YL=[255,221,102];
  renderAnnotated(path.join(out,'hand_00_orientation.png'),1000,1500,EYE,cen,half,UPHINT,[
    ['TIP  (FREE END)',          [-14,312,0],PK],
    ['JOINT-1  DIP',             [J.O1.x,J.O1.y,0],YL],
    ['MOTOR-2  ON P2',           [-123,-123,0],OR],
    ['JOINT-2  PIP',             [J.O2.x,J.O2.y,0],YL],
    ['MOTOR-1  ON P1',           [28,177,0],OR],
    ['ROOT - BASE PLATE 56X56',  [0,-573,0],GN],
  ]);
}

// ================= 伸直态 θ1=θ2=0 =================
api.updateMechanism(0,0);
renderAuto(path.join(out,'hand_01_straight_iso.png'),1000,1400,ISO,ALL,1.05);
renderAuto(path.join(out,'hand_02_straight_main.png'),1000,1400,TOPZ,ALL,1.05);
// 整体（含指根简化底板）——确认衔接不孤立
renderAuto(path.join(out,'hand_03_straight_full_iso.png'),1000,1500,ISO,ALLFULL,1.05,true);
// 指根衔接（伸直态）——本次重点。隔离渲染：只画"指根方块+简化底板+4×M4"，
// 否则细长的指节会横穿画面，使局部视角看起来像被裁切。
const ROOTONLY=/p1Palm/;   // 匹配 p1PalmBase / p1PalmFlangeBase / p1PalmBolt* / p1PalmBoltHead*
renderIsolated(path.join(out,'hand_04_root_iso.png'),1200,900,ISO,ROOTONLY,1.15);
renderIsolated(path.join(out,'hand_05_root_side.png'),1200,900,[1,0,0.15],ROOTONLY,1.15);
renderIsolated(path.join(out,'hand_06_root_iso2.png'),1200,900,ISO2,ROOTONLY,1.15);

// ================= 卷曲态 θ1=80° θ2=50° =================
api.updateMechanism(80,50);
renderAuto(path.join(out,'hand_07_curl_iso.png'),1400,1000,ISO,ALL,1.06);
renderAuto(path.join(out,'hand_08_curl_main.png'),1400,900,TOPZ,ALL,1.06);
renderAuto(path.join(out,'hand_09_curl_iso2.png'),1400,1000,ISO2,ALL,1.06);
// 关节1 特写（O1 随姿态移动，取实时关节坐标）
{
  const J=api.getJoints(80,50);
  renderNear(path.join(out,'hand_10_joint1.png'),1000,1000,[0.4,-0.35,0.85],[J.O1.x,J.O1.y,0],95);
}
// 关节2 + 指尖
{
  const J=api.getJoints(80,50);
  renderNear(path.join(out,'hand_11_joint2_tip.png'),1000,1000,[0.45,-0.3,0.84],[J.O2.x,J.O2.y,0],105);
}
// 连杆1 + B/D 叉头
{
  const J=api.getJoints(80,50);
  const mx=(J.B1.x+J.D1.x)/2, my=(J.B1.y+J.D1.y)/2;
  renderNear(path.join(out,'hand_12_link1.png'),1000,900,[0.3,-0.25,0.92],[mx,my,0],60);
}
// B 叉头螺母沉龛特写（推杆端面→螺纹段→螺母→桥板，本次修正的重点部位）
renderIsolated(path.join(out,'hand_12b_bnut_pocket.png'),1000,900,[0.4,-0.3,0.86],
  /m1Rod|m1bBolt|m1Bridge|m1Clevis/,1.25);
// 电机安装特写：直接取抱箍环的世界中心（整指翻转后不再依赖手算坐标）
function worldCenterOf(name){
  const o=scene.getObjectByName(name); if(!o) return null;
  o.geometry.computeBoundingBox();
  const c=o.geometry.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(o.matrixWorld);
  return [c.x/s,c.y/s,c.z/s];
}
{
  const c=worldCenterOf('m1CollarRing');
  if(c) renderNear(path.join(out,'hand_13_motor1_mount.png'),1000,900,[0.35,-0.4,0.85],c,60);
  else console.log('WARN m1CollarRing 缺失，跳过 hand_13');
}
{
  const c=worldCenterOf('m2CollarRing');
  if(c) renderNear(path.join(out,'hand_14_motor2_mount.png'),1000,900,[0.35,-0.4,0.85],c,70);
  else console.log('WARN m2CollarRing 缺失，跳过 hand_14');
}
// 指尖抓握垫
{
  const pad=scene.getObjectByName('p3GripPad');
  pad.geometry.computeBoundingBox();
  const cLocal=pad.geometry.boundingBox.getCenter(new THREE.Vector3());
  const cw=cLocal.applyMatrix4(pad.matrixWorld);
  renderNear(path.join(out,'hand_15_grip_tip.png'),1000,900,[0.3,-0.35,0.89],[cw.x/s,cw.y/s,cw.z/s],90);
}

// ================= 全屈极限 θ1=θ2=120° =================
api.updateMechanism(120,120);
renderAuto(path.join(out,'hand_16_fullflex_iso.png'),1300,1000,ISO,ALL,1.06);
renderAuto(path.join(out,'hand_17_fullflex_full_iso.png'),1300,1100,ISO,ALLFULL,1.06,true);

console.log('\n单指渲染完成 →',out);
