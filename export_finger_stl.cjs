'use strict';
// 三节手指：从 finger_mechanism_3d.html 提取网格，按打印件分组导出二进制STL（mm，按打印姿态落地）。
// 用法: node export_finger_stl.cjs
const fs=require('fs'),path=require('path');
const THREE=require('./.verification/three-r128.cjs');
const root=__dirname,html=fs.readFileSync(path.join(root,'finger_mechanism_3d.html'),'utf8');
const script=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes('const P ='))[1];
const nodes=new Map(),document={getElementById(id){if(!nodes.has(id))nodes.set(id,{});return nodes.get(id);}};
const main=script.slice(0,script.lastIndexOf('\ninitScene();'));
const api=new Function('THREE','document',main+'\nscene=new THREE.Scene();showLabels=false;buildMechanism();updateMechanism(0);return {P,s,scene,updateMechanism};')(THREE,document);
const {P,s,scene}=api;
scene.updateMatrixWorld(true);

// 打印件分组：同一刚性子总成内属于同一打印件的网格合并；标准件外购不入档
// 两单元几何完全相同 → 同名零件各出一份STL（可互换，也便于分别打印）
const PRINTS={
  p1_proximal:{note:'近节·掌端段（含肩座+电机1法兰安装板）',pose:'flipX',meshes:['p1BodyProximal','p1PalmBase','p1FlangePlateNeck','p1FlangePlate','p1PSplicePadTop','p1PSplicePadBottom','p1PSplicePadTopFoot','p1PSplicePadBottomFoot']},
  p1_distal:{note:'近节·关节1段（含一体化叉耳）',pose:null,meshes:['p1BodyDistal','p1EarBaseL','p1YokeWebL','p1EarBaseR','p1YokeWebR','p1ForkL','p1ForkLRib','p1ForkR','p1ForkRRib','p1DSplicePadTop','p1DSplicePadBottom']},
  p2_proximal:{note:'中节·关节1端段（含袖套/毂+D侧板叉耳，拼接y=-170）',pose:'flipX',meshes:['p2BodyWaist','p2BodyHeel','p2SleeveBody','p2SleeveHub','p2DClevisArmL','p2DClevisArmR','p2DClevisBossL','p2DClevisBossR','p2PSplicePadTop','p2PSplicePadBottom']},
  p2_distal:{note:'中节·关节2端段（含一体化叉耳+电机2法兰安装板）',pose:null,meshes:['p2BodyDistal','p2EarBaseL','p2YokeWebL','p2EarBaseR','p2YokeWebR','p2ForkL','p2ForkLRib','p2ForkR','p2ForkRRib','p2FlangePlateNeck','p2FlangePlate','p2DSplicePadTop','p2DSplicePadBottom','p2DSplicePadTopFoot','p2DSplicePadBottomFoot']},
  p3_proximal:{note:'远节·关节2端段（含袖套/毂+D侧板叉耳，拼接y=-125）',pose:'flipX',meshes:['p3BodyWaist','p3BodyHeel','p3SleeveBody','p3SleeveHub','p3DClevisArmL','p3DClevisArmR','p3DClevisBossL','p3DClevisBossR','p3PSplicePadTop','p3PSplicePadBottom']},
  p3_distal:{note:'远节·指尖段（含末端法兰与指尖圆头）',pose:null,meshes:['p3BodyDistal','p3FingerTip','p3FingerTipPad','p3DSplicePadTop','p3DSplicePadBottom','p3DSplicePadTopFoot','p3DSplicePadBottomFoot']},
  motor1_collar:{note:'电机1后抱箍（开口300°，双侧耳板±z，已绕X转90°导出）',pose:'rotX90',meshes:['m1CollarRing','m1CollarTabA','m1CollarTabAN','m1CollarTabB','m1CollarTabBN']},
  motor2_collar:{note:'电机2后抱箍（开口300°，双侧耳板±z，已绕X转90°导出）',pose:'rotX90',meshes:['m2CollarRing','m2CollarTabA','m2CollarTabAN','m2CollarTabB','m2CollarTabBN']},
  b_clevis_1:{note:'B推杆叉头1（双耳+M6螺母沉龛夹持桥）',pose:null,meshes:['m1BridgeFloor','m1BridgeWallZP','m1BridgeWallZN','m1BridgeWallXP','m1BridgeWallXN','m1BridgeRibL','m1BridgeRibR','m1ClevisArmL','m1ClevisArmR','m1ClevisPlateL','m1ClevisPlateR']},
  b_clevis_2:{note:'B推杆叉头2（与1同规格，可互换）',pose:null,meshes:['m2BridgeFloor','m2BridgeWallZP','m2BridgeWallZN','m2BridgeWallXP','m2BridgeWallXN','m2BridgeRibL','m2BridgeRibR','m2ClevisArmL','m2ClevisArmR','m2ClevisPlateL','m2ClevisPlateR']},
  link_1:{note:'BD等宽长条连杆1 100×15×8（长轴已摆正）',pose:null,unrotateGroup:'t1Tendon',meshes:['t1TendonWeb','t1TendonEyeB','t1TendonEyeD']},
  link_2:{note:'BD等宽长条连杆2（与1同规格，可互换备件，腹板3×Ø6减重孔，长轴已摆正）',pose:null,unrotateGroup:'t2Tendon',meshes:['t2TendonWeb','t2TendonEyeB','t2TendonEyeD']},
  palm_mount:{note:'掌骨安装法兰（56×56 R8圆角方板，板底坐在指根方块顶面 y=320；内圈4×M4接方块、外圈4×Ø5.5接手掌、Ø9穿线孔）',pose:'rotX90',meshes:['p1PalmFlangeBase']},
  grip_pad:{note:'指尖防滑抓握垫（22×18垫板+3条横向防滑棱，TPU95A柔性更佳）',pose:'flipX',meshes:['p3GripPad','p3GripRib1','p3GripRib2','p3GripRib3']},
};
// 外购件BOM（两单元合计）
const PURCHASED_BOM=[
  {part:'shoulderBoltO10x26',spec:'肩螺栓（塞打螺丝）Ø10 h9×26，端部螺纹M8',qty:2,used:'关节1/关节2 转动副（O1/O2）'},
  {part:'shoulderBoltB8x18',spec:'肩螺栓 Ø8 h9×18，端部螺纹M6',qty:2,used:'两单元 B 推杆叉头销轴'},
  {part:'shoulderBoltD8x20',spec:'肩螺栓 Ø8 h9×20，端部螺纹M6',qty:2,used:'两单元 D 连杆销轴'},
  {part:'rodNutM6',spec:'M6六角螺母（沉入B叉头沉龛）',qty:2,used:'推杆端部夹持'},
  {part:'washerO',spec:'平垫 Ø10.5/Ø16×1.6',qty:2,used:'O1/O2 螺母侧'},
  {part:'washerBD',spec:'平垫 Ø8.4/Ø12×1.6',qty:4,used:'B/D 螺母侧'},
  {part:'nylocNutM8',spec:'M8尼龙自锁螺母（AF13）',qty:2,used:'O1/O2 肩螺栓'},
  {part:'nylocNutM6',spec:'M6尼龙自锁螺母（AF10）',qty:4,used:'B/D 肩螺栓'},
  {part:'boltM4x22',spec:'M4×22 内六角 + 平垫 + M4尼龙自锁螺母',qty:4,used:'两电机后抱箍贯穿指节'},
  {part:'boltM4x16',spec:'M4×16 内六角',qty:12,used:'两电机前法兰旋入安装板 ×8 + 掌骨法兰板旋入指根方块 ×4（建议配M4热熔螺母）'},
  {part:'boltM4x36',spec:'M4×36 + 平垫 + M4尼龙自锁螺母',qty:12,used:'P1/P2/P3 三段拼接凸台贯穿'},
  {part:'boltM5x16',spec:'M5×16 内六角（沉头）',qty:4,used:'掌骨安装法兰外圈 Ø5.5 → 手掌球窝（对侧零件未建模）'},
];

function stlBinary(tris){
  const buf=Buffer.alloc(84+tris.length*50);
  buf.write('binary STL finger print-ready',0,32,'ascii');
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
// 世界(mm) -> 打印姿态：/s → 姿态旋转 → 居中、落到 z=0
function toPrintMM(tris,pose,thetaZ){
  let out=tris.map(t=>t.map(v=>[v[0]/s,v[1]/s,v[2]/s]));
  if(thetaZ){ // 连杆等带装配转角的零件：绕Z反向旋转使长轴对齐Y（平躺正交打印）
    const c=Math.cos(-thetaZ), si=Math.sin(-thetaZ);
    out=out.map(t=>t.map(v=>[v[0]*c-v[1]*si, v[0]*si+v[1]*c, v[2]]));
  }
  if(pose==='rotX90') out=out.map(t=>t.map(v=>[v[0],-v[2],v[1]]));        // 孔轴(Y)→Z
  else if(pose==='flipX') out=out.map(t=>t.map(v=>[v[0],-v[1],-v[2]]));  // 绕X翻180°（原本朝上的耳片落床）
  let mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];
  for(const t of out)for(const v of t)for(let k=0;k<3;k++){mn[k]=Math.min(mn[k],v[k]);mx[k]=Math.max(mx[k],v[k]);}
  const cx=(mn[0]+mx[0])/2, cy=(mn[1]+mx[1])/2;
  return out.map(t=>t.map(v=>[+(v[0]-cx).toFixed(4),+(v[1]-cy).toFixed(4),+(v[2]-mn[2]).toFixed(4)]));
}
const outDir=path.join(root,'stl_finger'); fs.mkdirSync(outDir,{recursive:true});
const index=[];
for(const [part,def] of Object.entries(PRINTS)){
  let tris=[];
  for(const nm of def.meshes){
    const m=scene.getObjectByName(nm);
    if(!m){ console.log('MISSING',nm); continue; }
    tris=tris.concat(meshTriangles(m));
  }
  if(!tris.length){ console.log('EMPTY',part); continue; }
  const thetaZ=def.unrotateGroup?scene.getObjectByName(def.unrotateGroup).rotation.z:0;
  const mm=toPrintMM(tris,def.pose,thetaZ);
  let mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];
  for(const t of mm)for(const v of t)for(let k=0;k<3;k++){mn[k]=Math.min(mn[k],v[k]);mx[k]=Math.max(mx[k],v[k]);}
  const size=[mx[0]-mn[0],mx[1]-mn[1],mx[2]-mn[2]];
  fs.writeFileSync(path.join(outDir,part+'.stl'), stlBinary(mm));
  index.push({part,kind:'printed',note:def.note,pose:(def.pose||'as-modeled')+(thetaZ?('+alignLink('+(thetaZ*180/Math.PI).toFixed(2)+'deg)'):''),triangles:mm.length,
    bounding_box_mm:size.map(x=>+x.toFixed(2)),source_meshes:def.meshes});
}
fs.writeFileSync(path.join(outDir,'index.json'),JSON.stringify({
  unit:'mm',model:'finger print-ready v5-two-unit',
  generated_from:'finger_mechanism_3d.html',
  note:'三节手指=两套肘关节机构拼接。每个STL为一个独立打印件，已按打印姿态摆放（销轴孔轴=Z竖直，落地z=0）。两单元通用件可互换。',
  purchased_parts_bom:PURCHASED_BOM,parts:index},null,2)+'\n');
console.log('导出打印零件数:',index.length,'；外购标准件:',PURCHASED_BOM.length,'项');
for(const p of index) console.log('  '+p.part.padEnd(16),p.bounding_box_mm.join(' x '),'mm','['+p.pose+']');
