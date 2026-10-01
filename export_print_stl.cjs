'use strict';
// 从HTML中提取每个零件的Three.js网格，导出为二进制STL（单位mm，各零件按打印姿态摆放并落到Z=0基面）。
// v5：紧固件全部外购（不导出STL，写入BOM）；抱箍以“孔轴竖直”姿态导出。
// 用法: node export_print_stl.cjs
const fs=require('fs'),path=require('path');
const THREE=require('./.verification/three-r128.cjs');
const root=__dirname,html=fs.readFileSync(path.join(root,'arm_mechanism_3d.html'),'utf8');
const script=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes('const P ='))[1];
const nodes=new Map(),document={getElementById(id){if(!nodes.has(id))nodes.set(id,{});return nodes.get(id);}};
const main=script.slice(0,script.lastIndexOf('\ninitScene();'));
const api=new Function('THREE','document',main+'\nscene=new THREE.Scene();showLabels=false;buildMechanism();updateMechanism(0);return {P,s,scene,updateMechanism};')(THREE,document);
const {P,s,scene}=api;
scene.updateMatrixWorld(true);

// v5打印分组：7个打印件；紧固件/标准件为外购（BOM）
const PRINTS={
  upperArmProximal:{note:'含电机法兰安装板（一体）',meshes:['upperArmBodyProximal','shoulder','motorFlangePlateNeck','motorFlangePlate','upperArmPSplicePadTop','upperArmPSplicePadBottom','upperArmPSplicePadTopFoot','upperArmPSplicePadBottomFoot']},
  upperArmDistal:{note:'含一体化肘叉耳',meshes:['upperArmBodyDistal','elbowEarBaseLeft','elbowYokeWebLeft','elbowEarBaseRight','elbowYokeWebRight','elbowForkLeft','elbowForkLeftRib','elbowForkRight','elbowForkRightRib','upperArmDSplicePadTop','upperArmDSplicePadBottom']},
  forearmProximal:{note:'含肘轴套/毂与D侧板叉耳；建议绕X翻转180°打印（D侧板朝下落床）',meshes:['forearmBodyProximal','forearmBodyProximalHeel','elbowSleeveBody','elbowSleeveHub','dClevisArmLeft','dClevisArmRight','dClevisBossLeft','dClevisBossRight','forearmPSplicePadTop','forearmPSplicePadBottom']},
  forearmDistal:{note:'含末端法兰',meshes:['forearmBodyDistal','endFlange','forearmDSplicePadTop','forearmDSplicePadBottom','forearmDSplicePadTopFoot','forearmDSplicePadBottomFoot']},
  motorCollar:{note:'电机后开口抱箍；已绕X转90°导出（内孔轴竖直，直接打印）',pose:'rotX90',meshes:['collarRing','collarTabLeft','collarTabRight']},
  rodClevis:{note:'B推杆叉头（双耳+螺母沉龛夹持桥）',meshes:['bClevisBridgeFloor','bClevisBridgeWallZP','bClevisBridgeWallZN','bClevisBridgeWallXP','bClevisBridgeWallXN','bClevisBridgeRibL','bClevisBridgeRibR','bClevisArmLeft','bClevisArmRight','bClevisPlateLeft','bClevisPlateRight']},
  linkBD:{note:'等宽长条连杆 100×15×8',meshes:['tendonWeb','tendonEyeB','tendonEyeD']},
};
// 外购标准件BOM（不出STL）
const PURCHASED_BOM=[
  {part:'shoulderBoltO',spec:'肩螺栓（塞打螺丝）Ø10 h9×26，端部螺纹M8',qty:1,used:'O肘关节销轴'},
  {part:'shoulderBoltB',spec:'肩螺栓 Ø8 h9×18，端部螺纹M6',qty:1,used:'B推杆叉头销轴'},
  {part:'shoulderBoltD',spec:'肩螺栓 Ø8 h9×20，端部螺纹M6',qty:1,used:'D连杆销轴（含两侧1mm定位凸台堆叠）'},
  {part:'rodNutM6',spec:'M6六角螺母',qty:1,used:'沉入B叉头沉龛，夹持电机推杆端部螺纹'},
  {part:'washerO',spec:'平垫 Ø10.5/Ø16×1.6',qty:1,used:'O肩螺栓螺母侧'},
  {part:'washerBD',spec:'平垫 Ø8.4/Ø12×1.6',qty:2,used:'B/D肩螺栓螺母侧'},
  {part:'nylocNutM8',spec:'M8尼龙自锁螺母（AF13）',qty:1,used:'O肩螺栓'},
  {part:'nylocNutM6',spec:'M6尼龙自锁螺母（AF10）',qty:2,used:'B/D肩螺栓'},
  {part:'boltM4x22',spec:'M4×22 内六角 + 平垫 + M4尼龙自锁螺母',qty:2,used:'电机后抱箍贯穿上臂'},
  {part:'boltM4x16',spec:'M4×16 内六角',qty:4,used:'电机前法兰旋入安装板（建议安装板用M4热熔螺母）'},
  {part:'boltM4x36',spec:'M4×36 + 平垫 + M4尼龙自锁螺母',qty:6,used:'上臂/前臂一体化拼接凸台贯穿'},
];

function stlBinary(tris){
  const buf=Buffer.alloc(84+tris.length*50);
  buf.write('binary STL print-ready robot arm',0,32,'ascii');
  buf.writeUInt32LE(tris.length,80);
  let off=84;
  for(const t of tris){
    const [a,b,c]=t;
    const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];
    let nx=uy*vz-uz*vy, ny=uz*vx-ux*vz, nz=ux*vy-uy*vx;
    const L=Math.hypot(nx,ny,nz)||1; nx/=L; ny/=L; nz/=L;
    buf.writeFloatLE(nx,off); buf.writeFloatLE(ny,off+4); buf.writeFloatLE(nz,off+8);
    let p=off+12;
    for(const v of [a,b,c]){ buf.writeFloatLE(v[0],p); buf.writeFloatLE(v[1],p+4); buf.writeFloatLE(v[2],p+8); p+=12; }
    buf.writeUInt16LE(0,off+48);
    off+=50;
  }
  return buf;
}
function meshTriangles(mesh){
  const g=mesh.geometry, pos=g.attributes.position, idx=g.index, mw=mesh.matrixWorld;
  const V=[];
  for(let i=0;i<pos.count;i++) V.push(new THREE.Vector3().fromBufferAttribute(pos,i).applyMatrix4(mw).toArray());
  const tris=[];
  const n=idx?idx.count:pos.count;
  for(let t=0;t<n;t+=3){
    const i0=idx?idx.getX(t):t, i1=idx?idx.getX(t+1):t+1, i2=idx?idx.getX(t+2):t+2;
    const a=V[i0],b=V[i1],c=V[i2];
    if(Math.hypot(b[0]-a[0],b[1]-a[1],b[2]-a[2])<1e-9) continue;
    if(Math.hypot(c[0]-a[0],c[1]-a[1],c[2]-a[2])<1e-9) continue;
    const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];
    const nx=uy*vz-uz*vy, ny=uz*vx-ux*vz, nz=ux*vy-uy*vx;
    if(Math.hypot(nx,ny,nz)*0.5<1e-10) continue;
    tris.push([a,b,c]);
  }
  return tris;
}
// 世界坐标 -> 打印mm：除以s → 可选打印姿态旋转 → 平移到x/y居中、z=0基面
function toPrintMM(tris,pose){
  let out=tris.map(t=>t.map(v=>[v[0]/s, v[1]/s, v[2]/s]));
  if(pose==='rotX90'){ out=out.map(t=>t.map(v=>[v[0], -v[2], v[1]])); }   // 绕X +90°：孔轴(Y) → Z
  let mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];
  for(const t of out)for(const v of t)for(let k=0;k<3;k++){mn[k]=Math.min(mn[k],v[k]);mx[k]=Math.max(mx[k],v[k]);}
  const cx=(mn[0]+mx[0])/2, cy=(mn[1]+mx[1])/2;
  return out.map(t=>t.map(v=>[+(v[0]-cx).toFixed(4), +(v[1]-cy).toFixed(4), +(v[2]-mn[2]).toFixed(4)]));
}

const outDir=path.join(root,'stl'); fs.mkdirSync(outDir,{recursive:true});
const index=[];
for(const [part,def] of Object.entries(PRINTS)){
  let tris=[];
  for(const nm of def.meshes){
    const m=scene.getObjectByName(nm);
    if(!m){ console.log('MISSING', nm); continue; }
    tris=tris.concat(meshTriangles(m));
  }
  if(!tris.length) continue;
  const mm=toPrintMM(tris,def.pose);
  let mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];
  for(const t of mm)for(const v of t)for(let k=0;k<3;k++){mn[k]=Math.min(mn[k],v[k]);mx[k]=Math.max(mx[k],v[k]);}
  const size=[mx[0]-mn[0],mx[1]-mn[1],mx[2]-mn[2]];
  fs.writeFileSync(path.join(outDir,part+'.stl'), stlBinary(mm));
  index.push({part,kind:'printed',note:def.note,triangles:mm.length,bounding_box_mm:size.map(x=>+x.toFixed(2)),source_meshes:def.meshes});
}
fs.writeFileSync(path.join(outDir,'index.json'),JSON.stringify({unit:'mm',model:'robot_arm print-ready v5-serviceable',generated_from:'arm_mechanism_3d.html',
note:'每个STL为一个独立打印零件，单位mm，已按打印姿态摆放（销轴孔轴=Z竖直，落地z=0）。紧固件全部外购，见purchased_parts_bom。',
purchased_parts_bom:PURCHASED_BOM,parts:index},null,2)+'\n');
console.log('导出打印零件数:',index.length,'；外购标准件:',PURCHASED_BOM.length,'项');
for(const p of index) console.log(' ',p.part.padEnd(20), p.bounding_box_mm.join(' x '), 'mm');
