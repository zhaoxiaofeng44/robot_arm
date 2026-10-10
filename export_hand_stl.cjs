'use strict';
// 整手（5 指 + 掌体骨架）：从 hand_mechanism_3d.html 提取网格，按"独立打印件"分组导出二进制 STL。
//
// 结构：每根手指 = 与原手指版完全相同的两套肘关节机构（每关节 1 只直线电机 + 1 根 BD 连杆），
//       按 HAND.scale=0.5 缩放后装到掌体骨架上；掌体负责 5 指根座、10 只电机的分层走位、
//       侧梁/横撑/腕法兰。5 指机构件互为同规格备件，此处按指分别导出（便于装配对号）。
//
// 用法: node export_hand_stl.cjs
const fs=require('fs'),path=require('path');
const THREE=require('./.verification/three-r128.cjs');
const root=__dirname,html=fs.readFileSync(path.join(root,'hand_mechanism_3d.html'),'utf8');
const script=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes('const P ='))[1];
const nodes=new Map(),document={getElementById(id){if(!nodes.has(id))nodes.set(id,{});return nodes.get(id);}};
const main=script.slice(0,script.lastIndexOf('\ninitScene();'));
// v7：hand_mechanism_3d.html 现为单指反根验证版（无 buildPalm/DIGITS 五指布局）。
//   本脚本保留给五指目标设计；对当前模型给出明确提示而不是 ReferenceError。
let api;
try{
  api=new Function('THREE','document',main+'\nscene=new THREE.Scene();showLabels=false;buildMechanism();buildPalm();updateMechanism(0,0,0,0,0);return {P,s,scene,DIGITS};')(THREE,document);
}catch(err){
  console.error('export_hand_stl: 当前 hand_mechanism_3d.html 不是五指布局（'+err.message+'）。');
  console.error('  五指布局已下线，stl_hand/ 为五指目标设计的既有输出（保留归档）。');
  console.error('  现行单指反根模型的打印件与手指版逐件相同，请改用: node export_finger_stl.cjs');
  process.exit(2);
}
const {P,s,scene,DIGITS}=api;
scene.updateMatrixWorld(true);

// ---------- 打印件分组 ----------
// 每根手指各自的件（suffix 拼在指前缀之后）
const FINGER_PRINTS={
  p1_proximal:{note:'近节·掌端段（含叉颊式掌端 + 电机1法兰安装板）',pose:'flipX',
    m:['p1BodyProximal','p1PalmBase','p1FlangePlateNeck','p1FlangePlate','p1PSplicePadTop','p1PSplicePadBottom','p1PSplicePadTopFoot','p1PSplicePadBottomFoot']},
  p1_fork:{note:'近节·掌端夹持叉（两颊板夹住电机1，与掌体指根座共用 4×M3）',pose:'flipX',
    m:['p1ForkCheekL','p1ForkCheekLWeb','p1ForkCheekR','p1ForkCheekRWeb']},
  p1_distal:{note:'近节·关节1段（含一体化叉耳）',pose:null,
    m:['p1BodyDistal','p1EarBaseL','p1YokeWebL','p1EarBaseR','p1YokeWebR','p1ForkL','p1ForkLRib','p1ForkR','p1ForkRRib','p1DSplicePadTop','p1DSplicePadBottom']},
  p2_proximal:{note:'中节·关节1端段（含袖套/毂 + D 侧板叉耳）',pose:'flipX',
    m:['p2BodyWaist','p2BodyHeel','p2SleeveBody','p2SleeveHub','p2DClevisArmL','p2DClevisArmR','p2DClevisBossL','p2DClevisBossR','p2PSplicePadTop','p2PSplicePadBottom']},
  p2_distal:{note:'中节·关节2端段（含叉耳 + 电机2法兰安装板）',pose:null,
    m:['p2BodyDistal','p2EarBaseL','p2YokeWebL','p2EarBaseR','p2YokeWebR','p2ForkL','p2ForkLRib','p2ForkR','p2ForkRRib','p2FlangePlateNeck','p2FlangePlate','p2DSplicePadTop','p2DSplicePadBottom','p2DSplicePadTopFoot','p2DSplicePadBottomFoot']},
  p3_proximal:{note:'远节·关节2端段（含袖套/毂 + D 侧板叉耳）',pose:'flipX',
    m:['p3BodyWaist','p3BodyHeel','p3SleeveBody','p3SleeveHub','p3DClevisArmL','p3DClevisArmR','p3DClevisBossL','p3DClevisBossR','p3PSplicePadTop','p3PSplicePadBottom']},
  p3_distal:{note:'远节·指尖段（含末端法兰与指尖圆头）',pose:null,
    m:['p3BodyDistal','p3FingerTip','p3FingerTipPad','p3DSplicePadTop','p3DSplicePadBottom','p3DSplicePadTopFoot','p3DSplicePadBottomFoot']},
  motor1_collar:{note:'电机1后抱箍（开口 300°）',pose:'rotX90',m:['m1CollarRing','m1CollarTabA','m1CollarTabB']},
  motor2_collar:{note:'电机2后抱箍（开口 300°）',pose:'rotX90',m:['m2CollarRing','m2CollarTabA','m2CollarTabB']},
  b_clevis_1:{note:'B 推杆叉头1（双耳 + M6 螺母沉龛夹持桥）',pose:null,
    m:['m1BridgeFloor','m1BridgeWallZP','m1BridgeWallZN','m1BridgeWallXP','m1BridgeWallXN','m1BridgeRibL','m1BridgeRibR','m1ClevisArmL','m1ClevisArmR','m1ClevisPlateL','m1ClevisPlateR']},
  b_clevis_2:{note:'B 推杆叉头2（与 1 同规格，可互换）',pose:null,
    m:['m2BridgeFloor','m2BridgeWallZP','m2BridgeWallZN','m2BridgeWallXP','m2BridgeWallXN','m2BridgeRibL','m2BridgeRibR','m2ClevisArmL','m2ClevisArmR','m2ClevisPlateL','m2ClevisPlateR']},
  link_1:{note:'BD 等宽长条连杆1（长轴已摆正）',pose:null,unrotateGroup:'t1Tendon',m:['t1TendonWeb','t1TendonEyeB','t1TendonEyeD']},
  link_2:{note:'BD 等宽长条连杆2（与 1 同规格，可互换备件）',pose:null,unrotateGroup:'t2Tendon',m:['t2TendonWeb','t2TendonEyeB','t2TendonEyeD']},
  grip_pad:{note:'指尖防滑抓握垫（TPU95A 柔性更佳）',pose:'flipX',m:['p3GripPad','p3GripRib1','p3GripRib2','p3GripRib3']},
};

// 掌体件：五指共享同一套骨架（每指一段指根座 + 两条主梁 + 连接肋）
const PALM_PRINTS={
  knuckle_seat:{note:'掌体指根座（与指根叉颊共用 4×M3，卡在两颊之间）',pose:'rotX90',m:['KnuckleSeat']},
  rail:{note:'掌体主梁（外侧 + 内侧，沿电机侧面直伸到腕法兰）',pose:'rotX90',m:['RailMain','RailInner']},
  rail_tie:{note:'掌体横向连接肋 ×2',pose:'rotX90',m:['RailTie197','RailTie225']},
  palm_cross:{note:'掌体横撑板（3 道 × 4 层，把 4 指框架连成整体）',pose:'rotX90',
    m:['palmCross182_-40','palmCross182_-13p3','palmCross182_13p3','palmCross182_40',
       'palmCross210_-40','palmCross210_-13p3','palmCross210_13p3','palmCross210_40',
       'palmCross238_-40','palmCross238_-13p3','palmCross238_13p3','palmCross238_40']},
  wrist_flange:{note:'腕部法兰 Ø108×7 + 腕毂（Ø36 走线孔 + 4×M10 安装孔）',pose:'rotX90',m:['wristFlange','wristHub']},
  palm_pad:{note:'掌心软垫（TPU95A）+ 3 条防滑棱',pose:'flipX',m:['palmPad','palmPadRib1','palmPadRib2','palmPadRib3']},
};

// ---------- 外购件 BOM（整手合计） ----------
const PURCHASED_BOM=[
  {part:'linearActuator20x40',spec:'微型直线电机（推杆式）Ø20×40，行程 ≥30 mm，内置位置反馈',qty:10,used:'每关节 1 只：5 指 × 2 关节'},
  {part:'shoulderBoltO5x13',spec:'肩螺栓（塞打螺丝）Ø5 h9×13，端部螺纹 M4',qty:5,used:'每指关节1 转动副 O1'},
  {part:'shoulderBoltO5x13b',spec:'肩螺栓 Ø5 h9×13，端部螺纹 M4',qty:5,used:'每指关节2 转动副 O2'},
  {part:'shoulderBoltB4x9',spec:'肩螺栓 Ø4 h9×9，端部螺纹 M3',qty:10,used:'两关节 B 推杆叉头销轴'},
  {part:'shoulderBoltD4x10',spec:'肩螺栓 Ø4 h9×10，端部螺纹 M3',qty:10,used:'两关节 D 连杆销轴'},
  {part:'rodNutM3',spec:'M3 六角螺母（沉入 B 叉头沉龛）',qty:10,used:'电机推杆端部夹持'},
  {part:'washerO',spec:'平垫 Ø5.3/Ø9×1.0',qty:10,used:'O1/O2 螺母侧'},
  {part:'washerBD',spec:'平垫 Ø4.3/Ø8×1.0',qty:20,used:'B/D 螺母侧'},
  {part:'nylocNutM4',spec:'M4 尼龙自锁螺母（AF7）',qty:10,used:'O1/O2 肩螺栓'},
  {part:'nylocNutM3',spec:'M3 尼龙自锁螺母（AF5.5）',qty:20,used:'B/D 肩螺栓'},
  {part:'boltM3x16',spec:'M3×16 内六角',qty:20,used:'电机后抱箍贯穿指节'},
  {part:'boltM3x10',spec:'M3×10 内六角',qty:40,used:'电机前法兰旋入安装板（建议配 M3 热熔螺母）'},
  {part:'boltM3x22',spec:'M3×22 + 平垫 + M3 尼龙自锁螺母',qty:30,used:'P1/P2/P3 三段拼接凸台贯穿'},
  {part:'boltM3x26',spec:'M3×26 + 平垫 + M3 尼龙自锁螺母',qty:20,used:'掌体指根座 ↔ 指根叉颊（每指 4 只）'},
  {part:'boltM3x18',spec:'M3×18 内六角',qty:24,used:'掌体横撑板与主梁连接'},
  {part:'boltM6x20',spec:'M6×20 内六角（沉头）',qty:4,used:'腕法兰固定于手腕/前臂接口'},
];

function stlBinary(tris){
  const buf=Buffer.alloc(84+tris.length*50);
  buf.write('binary STL hand print-ready',0,32,'ascii');
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
  if(thetaZ){
    const c=Math.cos(-thetaZ), si=Math.sin(-thetaZ);
    out=out.map(t=>t.map(v=>[v[0]*c-v[1]*si, v[0]*si+v[1]*c, v[2]]));
  }
  if(pose==='rotX90') out=out.map(t=>t.map(v=>[v[0],-v[2],v[1]]));
  else if(pose==='flipX') out=out.map(t=>t.map(v=>[v[0],-v[1],-v[2]]));
  let mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];
  for(const t of out)for(const v of t)for(let k=0;k<3;k++){mn[k]=Math.min(mn[k],v[k]);mx[k]=Math.max(mx[k],v[k]);}
  const cx=(mn[0]+mx[0])/2, cy=(mn[1]+mx[1])/2;
  return out.map(t=>t.map(v=>[+(v[0]-cx).toFixed(4),+(v[1]-cy).toFixed(4),+(v[2]-mn[2]).toFixed(4)]));
}

const outDir=path.join(root,'stl_hand'); fs.mkdirSync(outDir,{recursive:true});
const index=[]; const missing=[];
function emit(partName,def,meshes,digit){
  let tris=[];
  for(const nm of meshes){
    const m=scene.getObjectByName(nm);
    if(!m){ missing.push(nm); continue; }
    tris=tris.concat(meshTriangles(m));
  }
  if(!tris.length) return;
  const thetaZ=def.unrotateGroup?scene.getObjectByName(digit+def.unrotateGroup).rotation.z:0;
  const mm=toPrintMM(tris,def.pose,thetaZ);
  let mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];
  for(const t of mm)for(const v of t)for(let k=0;k<3;k++){mn[k]=Math.min(mn[k],v[k]);mx[k]=Math.max(mx[k],v[k]);}
  const size=[mx[0]-mn[0],mx[1]-mn[1],mx[2]-mn[2]];
  fs.writeFileSync(path.join(outDir,partName+'.stl'), stlBinary(mm));
  index.push({part:partName,digit:digit||null,kind:'printed',note:def.note,
    pose:(def.pose||'as-modeled')+(thetaZ?('+alignLink('+(thetaZ*180/Math.PI).toFixed(2)+'deg)'):''),
    triangles:mm.length, bounding_box_mm:size.map(x=>+x.toFixed(2)),
    source_meshes:meshes});
}
for(const f of DIGITS){
  for(const [key,def] of Object.entries(FINGER_PRINTS)){
    emit(f.id+'_'+key, def, def.m.map(n=>f.id+n), f.id);
  }
}
for(const [key,def] of Object.entries(PALM_PRINTS)){
  // 指根座/主梁/连接肋每指一段
  if(key==='knuckle_seat'||key==='rail'||key==='rail_tie'){
    for(const f of DIGITS) emit(f.id+'_'+key, def, def.m.map(n=>f.id+n), f.id);
  } else {
    emit(key, def, def.m, null);
  }
}
fs.writeFileSync(path.join(outDir,'index.json'),JSON.stringify({
  unit:'mm',
  model:'hand print-ready v1 (5 digits x 2 joint-units + palm chassis)',
  generated_from:'hand_mechanism_3d.html',
  scale_note:'整手按 HAND.scale=0.5 缩放；机构拓扑与已验证的 1:1 手指版完全一致，仅尺度不同。',
  mechanism_note:'每根手指 = 2 套肘关节机构串联；每个关节 = 1 只 Ø20×40 直线电机 + 1 根 BD 连杆，'+
    '电机伸长推动 B 点，经 BD 连杆带动 D 点绕转动副 O 转动。整手共 10 个驱动关节。',
  safe_travel_deg:{index:120,middle:120,ring:70,pinky:120,thumb:45},
  safe_travel_note:'由 verify_hand.cjs 以 2° 步长扫掠全部单指/双指/三指/预设姿态验证：配合区之外零接触。'+
    '无名指上限 70°（再大时 t2 连杆扫到掌体指根座）、拇指上限 45°（再大时 p3 扫入中指/无名指近节区）。',
  print_note:'每个 STL 为一个独立打印件，已按打印姿态摆放（销轴孔轴 = Z 竖直，落地 z=0）。'+
    '5 指机构件互为同规格备件；掌体件按指分段，可单独更换。',
  purchased_parts_bom:PURCHASED_BOM,
  parts:index},null,2)+'\n');
if(missing.length) console.log('缺失网格:',[...new Set(missing)].join(', '));
console.log('导出打印零件数:',index.length,'；外购标准件:',PURCHASED_BOM.length,'项');
const byDigit={};
for(const p of index){ const k=p.digit||'palm'; byDigit[k]=(byDigit[k]||0)+1; }
console.log('按指统计:',JSON.stringify(byDigit));
