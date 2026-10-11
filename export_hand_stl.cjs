'use strict';
// 五指整手：从 hand_mechanism_3d.html 提取网格，按“打印件类型”导出二进制STL（mm，按打印姿态落地）。
//   整手 = 四指×19 + 拇指×14 + 掌体骨架 5 = 95 个打印件；同规格件几何完全相同（verify_hand.cjs 逐件核验），
//   因此按类型导出 16 个 STL，每个文件附打印数量与用处（见 index.json）。
// 用法: node export_hand_stl.cjs
const fs=require('fs'),path=require('path');
const THREE=require('./.verification/three-r128.cjs');
const root=__dirname,html=fs.readFileSync(path.join(root,'hand_mechanism_3d.html'),'utf8');
const script=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes('const P ='))[1];
const nodes=new Map(),document={getElementById(id){if(!nodes.has(id))nodes.set(id,{});return nodes.get(id);}};
const main=script.slice(0,script.lastIndexOf('\ninitScene();'));
const api=new Function('THREE','document',main+'\nscene=new THREE.Scene();showLabels=false;buildMechanism();updateMechanism();return {P,s,scene,HAND};')(THREE,document);
const {P,s,scene,HAND}=api;
scene.updateMatrixWorld(true);
const allNames=[]; scene.traverse(o=>{ if(o.isMesh) allNames.push(o.name); });

// 打印件类型表：src = 取几何的基准指；sfx = 该件包含的网格名后缀（不带 <指>_ 前缀）
const P_PALM_P=['palmBodyProximal','palmBase','palmFlangePlateNeck','palmFlangePlate','palmPSplicePadTop','palmPSplicePadBottom','palmPSplicePadTopFoot','palmPSplicePadBottomFoot'];
const P_PALM_D=['palmBodyDistal','palmEarBaseL','palmYokeWebL','palmEarBaseR','palmYokeWebR','palmForkL','palmForkLRib','palmForkR','palmForkRRib','palmDSplicePadTop','palmDSplicePadBottom'];
const P_PHAL_P=['p1BodyWaist','p1BodyHeel','p1SleeveBody','p1SleeveHub','p1DClevisArmL','p1DClevisArmR','p1DClevisBossL','p1DClevisBossR','p1PSplicePadTop','p1PSplicePadBottom'];
const P_PHAL_D=['p1BodyDistal','p1EarBaseL','p1YokeWebL','p1EarBaseR','p1YokeWebR','p1ForkL','p1ForkLRib','p1ForkR','p1ForkRRib','p1FlangePlateNeck','p1FlangePlate','p1DSplicePadTop','p1DSplicePadBottom','p1DSplicePadTopFoot','p1DSplicePadBottomFoot'];
const P_TERM_P=['p3BodyWaist','p3BodyHeel','p3SleeveBody','p3SleeveHub','p3DClevisArmL','p3DClevisArmR','p3DClevisBossL','p3DClevisBossR','p3PSplicePadTop','p3PSplicePadBottom'];
const P_TERM_D=['p3BodyDistal','p3FingerTip','p3FingerTipPad','p3DSplicePadTop','p3DSplicePadBottom','p3DSplicePadTopFoot','p3DSplicePadBottomFoot'];
const P_COLLAR=['m0CollarRing','m0CollarTabA','m0CollarTabAN','m0CollarTabB','m0CollarTabBN'];
const P_CLEVIS=['m0BridgeFloor','m0BridgeWallZP','m0BridgeWallZN','m0BridgeWallXP','m0BridgeWallXN','m0BridgeRibL','m0BridgeRibR','m0ClevisArmL','m0ClevisArmR','m0ClevisPlateL','m0ClevisPlateR'];
const P_LINK=['t0TendonWeb','t0TendonEyeB','t0TendonEyeD'];
const P_MOUNT=['palmFlangeBase'];
const P_GRIP=['p3GripPad','p3GripRib1','p3GripRib2','p3GripRib3'];
const PRINTS=[
  {file:'finger_palm_proximal', src:'index', sfx:P_PALM_P, pose:'flipX', qty:/^[a-z]+_palmBodyProximal$/, note:'掌段·法兰端段（含指根方块+电机0法兰安装板，与掌段本体在 y=140 拼接）' },
  {file:'finger_palm_distal', src:'index', sfx:P_PALM_D, pose:null, qty:/^[a-z]+_palmBodyDistal$/, note:'掌段·关节0端段（含一体化叉耳，接 P1）' },
  {file:'finger_phalanx_proximal', src:'index', sfx:P_PHAL_P, pose:'flipX', qty:[/^[a-z]+_p1BodyWaist$/,/^(index|middle|ring|pinky)_p2BodyWaist$/], note:'近节/中节·关节端段（含袖套/毂+D侧板叉耳，拼接 y=-170）；四指 P1≡P2 同件，拇指 P1 亦同件（9 件）' },
  {file:'finger_phalanx_distal', src:'index', sfx:P_PHAL_D, pose:null, qty:[/^[a-z]+_p1BodyDistal$/,/^(index|middle|ring|pinky)_p2BodyDistal$/], note:'近节/中节·远端段（含一体化叉耳+电机法兰安装板）；四指 P1≡P2 同件，拇指 P1 亦同件（9 件）' },
  {file:'finger_terminal_proximal', src:'index', sfx:P_TERM_P, pose:'flipX', qty:[/^[a-z]+_p3BodyWaist$/,/^thumb_p2BodyWaist$/], note:'末节·关节端段（拼接 y=-125）；四指 P3 ≡ 拇指 P2，同件' },
  {file:'finger_terminal_distal', src:'index', sfx:P_TERM_D, pose:null, qty:[/^[a-z]+_p3BodyDistal$/,/^thumb_p2BodyDistal$/], note:'末节·指尖段（Ø24 圆头 + 半球垫，无电机）' },
  {file:'finger_motor_collar', src:'index', sfx:P_COLLAR, pose:'rotX90', qty:/^[a-z]+_m[0-2]CollarRing$/, note:'电机后抱箍（开口300°，2×M4 贯穿所在段）；14 台电机通用' },
  {file:'finger_b_clevis', src:'index', sfx:P_CLEVIS, pose:null, qty:/^[a-z]+_m[0-2]BridgeFloor$/, note:'B 推杆叉头（双耳+M6 螺母沉龛夹持桥）；14 个单元通用' },
  {file:'finger_bd_link', src:'index', sfx:P_LINK, pose:null, unrotateGroup:'index_t0Tendon', qty:/^[a-z]+_t[0-2]TendonWeb$/, note:'BD 等宽长条连杆 100×15×8（长轴已摆正）；14 个单元通用' },
  {file:'finger_palm_mount', src:'index', sfx:P_MOUNT, pose:'rotX90', qty:/^[a-z]+_palmFlangeBase$/, note:'掌骨安装法兰 56×56 R8（内圈4×Ø4.4 接指根方块、外圈4×Ø5.5 接掌骨板、Ø9 走线）' },
  {file:'finger_grip_pad', src:'index', sfx:P_GRIP, pose:'flipX', qty:[/^[a-z]+_p3GripPad$/,/^thumb_p2GripPad$/], note:'指尖防滑抓握垫（TPU95A 柔性更佳）' },
  {file:'chassis_palmPlateA', src:null, sfx:null, abs:['palmPlateA'], pose:null, qty:/^palmPlateA$/, note:'掌骨板A（66×10 平板，z∈[-253,-55]）：拇指+食指指根接口 + 顶部拼接条 4×M5' },
  {file:'chassis_palmPlateB', src:null, sfx:null, abs:['palmPlateB'], pose:null, qty:/^palmPlateB$/, note:'掌骨板B（66×10 平板，z∈[-55,153]）：中指+无名指+小指指根接口' },
  {file:'chassis_palmSpliceTop', src:null, sfx:null, abs:['palmSpliceTop'], pose:null, qty:/^palmSpliceTop$/, note:'顶部拼接条（6mm，z∈[-80,-30]）：4×M5 自下而上把板A/板B 拉成一体' },
  {file:'chassis_wristBlock', src:null, sfx:null, abs:['wristBlock','wristBoss1','wristBoss2','wristBoss3','wristBoss4'], pose:null, qty:/^wristBlock$/, note:'腕拼接块（含 4×Ø14×6 支承凸台一体打印）：4×M5 旋入掌骨板 + Ø40 走线 + 4×Ø9 腕接口' },
  {file:'chassis_thumbBridge', src:null, sfx:null, abs:['thumbBridge','thumbBridgeBoss1','thumbBridgeBoss2','thumbBridgeBoss3','thumbBridgeBoss4'], pose:null, qty:/^thumbBridge$/, note:'拇指桥（含 4×Ø14×10 支承凸台一体打印）：2×M5 旋入板A + 4×M5 锁拇指法兰' },
];

const PURCHASED_BOM=[
  {part:'shoulderBoltO10x26',spec:'肩螺栓（塞打螺丝）Ø10 h9×26，端部螺纹 M8',qty:14,used:'14 个关节单元的 O 转动副（每指 3/2 个）'},
  {part:'shoulderBoltB8x18',spec:'肩螺栓 Ø8 h9×18，端部螺纹 M6',qty:14,used:'14 个单元 B 推杆叉头销轴'},
  {part:'shoulderBoltD8x20',spec:'肩螺栓 Ø8 h9×20，端部螺纹 M6',qty:14,used:'14 个单元 D 连杆销轴'},
  {part:'rodNutM6',spec:'M6 六角螺母（沉入 B 叉头沉龛）',qty:14,used:'推杆端部夹持'},
  {part:'washerO',spec:'平垫 Ø10.5/Ø16×1.6',qty:14,used:'O 关节螺母侧'},
  {part:'washerBD',spec:'平垫 Ø8.4/Ø12×1.6',qty:28,used:'B/D 关节螺母侧'},
  {part:'nylocNutM8',spec:'M8 尼龙自锁螺母（AF13）',qty:14,used:'O 肩螺栓'},
  {part:'nylocNutM6',spec:'M6 尼龙自锁螺母（AF10）',qty:28,used:'B/D 肩螺栓'},
  {part:'boltM4x22',spec:'M4×22 内六角 + 平垫 + M4 尼龙自锁螺母',qty:28,used:'14 台电机后抱箍贯穿所在段（每台 2 组）'},
  {part:'boltM4x16',spec:'M4×16 内六角（建议配 M4 热熔螺母）',qty:56,used:'14 台电机前法兰旋入安装板（每台 4 根）'},
  {part:'boltM4x36',spec:'M4×36 + 平垫 + M4 尼龙自锁螺母',qty:36,used:'各段一体化拼接凸台贯穿（每处 2 根，共 18 处）'},
  {part:'boltM5x20',spec:'M5×20 内六角',qty:20,used:'5 根手指的掌骨法兰外圈 4×Ø5.5 → 掌骨板 M5 螺孔（每指 4 根）'},
  {part:'boltM5x16',spec:'M5×16 内六角',qty:10,used:'顶部拼接条 4（自下而上旋入条体）+ 拇指桥 2（旋入板A）+ 腕块 4（旋入掌骨板）'},
];

function stlBinary(tris){
  const buf=Buffer.alloc(84+tris.length*50);
  buf.write('binary STL hand print-ready',0,32,'ascii');
  buf.writeUInt32LE(tris.length,80);
  let off=84;
  for(const t of tris){
    const a=t[0],b=t[1],c=t[2];
    const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];
    let nx=uy*vz-uz*vy, ny=uz*vx-ux*vz, nz=ux*vy-uy*vx;
    const L=Math.hypot(nx,ny,nz)||1; nx/=L; ny/=L; nz/=L;
    buf.writeFloatLE(nx,off); buf.writeFloatLE(ny,off+4); buf.writeFloatLE(nz,off+8);
    let q=off+12;
    for(const v of [a,b,c]){ buf.writeFloatLE(v[0],q); buf.writeFloatLE(v[1],q+4); buf.writeFloatLE(v[2],q+8); q+=12; }
    buf.writeUInt16LE(0,off+48); off+=50;
  }
  return buf;
}
function meshTriangles(mesh){
  const g=mesh.geometry, pos=g.attributes.position, idx=g.index, mw=mesh.matrixWorld;
  const V=[];
  for(let i=0;i<pos.count;i++) V.push(new THREE.Vector3().fromBufferAttribute(pos,i).applyMatrix4(mw).toArray());
  const tris=[]; const n=idx?idx.count:pos.count;
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
function countOf(pat){
  const list=Array.isArray(pat)?pat:[pat];
  return allNames.filter(n=>list.some(r=>r.test(n))).length;
}
const outDir=path.join(root,'stl_hand'); fs.rmSync(outDir,{recursive:true,force:true}); fs.mkdirSync(outDir,{recursive:true});
const index=[]; let total=0;
for(const def of PRINTS){
  const names = def.abs ? def.abs.slice() : def.sfx.map(x=>def.src+'_'+x);
  let tris=[], missing=[];
  for(const nm of names){
    const m=scene.getObjectByName(nm);
    if(!m){ missing.push(nm); continue; }
    tris=tris.concat(meshTriangles(m));
  }
  if(missing.length) throw new Error('缺件 '+def.file+': '+missing.join(','));
  const thetaZ=def.unrotateGroup?scene.getObjectByName(def.unrotateGroup).rotation.z:0;
  const mm=toPrintMM(tris,def.pose,thetaZ);
  let mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];
  for(const t of mm)for(const v of t)for(let k=0;k<3;k++){mn[k]=Math.min(mn[k],v[k]);mx[k]=Math.max(mx[k],v[k]);}
  const size=[mx[0]-mn[0],mx[1]-mn[1],mx[2]-mn[2]].map(x=>+x.toFixed(2));
  const qty=countOf(def.qty);
  if(!qty) throw new Error('数量为0: '+def.file);
  total+=qty;
  fs.writeFileSync(path.join(outDir,def.file+'.stl'), stlBinary(mm));
  index.push({part:def.file,kind:'printed',qty:qty,note:def.note,pose:(def.pose||'as-modeled')+(thetaZ?('+alignLink('+(thetaZ*180/Math.PI).toFixed(2)+'deg)'):''),triangles:mm.length,bounding_box_mm:size,fits_220mm_bed:Math.max(size[0],size[1],size[2])<=220});
}
fs.writeFileSync(path.join(outDir,'index.json'),JSON.stringify({
  unit:'mm', model:'hand print-ready v1 (five fingers / 14 units, 1:1)',
  generated_from:'hand_mechanism_3d.html',
  note:'整手 95 个打印件 = 四指×19 + 拇指×14 + 掌体骨架 5；同规格件几何完全相同（见 hand_verify_report.json 的互换性检查），故按类型出 16 个 STL，每个文件附打印数量。销轴孔轴=Z 竖直落地，免支撑打印。',
  printed_part_total: total, stl_file_total: index.length,
  purchased_parts_bom: PURCHASED_BOM, parts: index},null,2)+'\n');
console.log('打印件总数', total, '；STL 文件', index.length, '；外购标准件', PURCHASED_BOM.length, '项');
for(const q of index) console.log('  '+q.part.padEnd(28), 'x'+String(q.qty).padStart(2), q.bounding_box_mm.join(' x '), 'mm', q.fits_220mm_bed?'':'(超床!)');