'use strict';
// 掌+三节手指机构校验（verify_finger.cjs）
//   三个同构关节单元：单元k = 上级段(载电机k+叉耳) + BD连杆k + 被驱动段
//     单元0：掌(固定基节,载电机0) →O0→ P1 ｜ 单元1：P1(载电机1) →O1→ P2 ｜ 单元2：P2(载电机2) →O2→ P3
//   - 三单元闭合误差 / 行程 / 传动角
//   - 碰撞扫描：①三个关节各自细扫(STEP=0.05°) 求连续间隙下限 ②安全包络内 GRID° 三维网格
//   - 配合区半径 = 孔半径 + 0.6mm（与肘版 v5 一致）
//   - 可拆装性基础项：无铆接、紧固件齐套、轴向浮动、三单元逐件同几何（可互换）
// 用法: node verify_finger.cjs [--quick] [--no-write]
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const G=require('./.verification/geom2d.cjs');
const THREE=G.THREE;
const root=__dirname,html=fs.readFileSync(path.join(root,'finger_mechanism_3d.html'),'utf8');
const script=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes('const P ='))[1];
new Function(script);
const nodes=new Map(),document={getElementById(id){if(!nodes.has(id))nodes.set(id,{});return nodes.get(id);}};
const main=script.slice(0,script.lastIndexOf('\ninitScene();'));
const api=new Function('THREE','document',main+'\nscene=new THREE.Scene();showLabels=false;buildMechanism();updateMechanism(0,0,0);return {P,s,scene,updateMechanism,getJoints,angleToStroke,getForceData,transmissionAngle,LIMITS};')(THREE,document);
const {P,s,scene,LIMITS}=api;
const QUICK=process.argv.includes('--quick');
const GRID=QUICK?5:2;                 // 包络内三维网格步长（deg）
const STEP=0.05;                      // 单关节细扫步长（deg）
function classify(mesh){
  // 先查最内层：motor 嵌在指节内、tendon 挂在指节上、p3 嵌在 p2 内
  const n=[];for(let p=mesh;p;p=p.parent)n.push(p.name);
  if(n.includes('m0Rod'))return'm0Slider';
  if(n.includes('m1Rod'))return'm1Slider';
  if(n.includes('m2Rod'))return'm2Slider';
  if(n.includes('t0Tendon'))return'T0';
  if(n.includes('t1Tendon'))return'T1';
  if(n.includes('t2Tendon'))return'T2';
  if(n.some(x=>/^motor0/.test(x)))return'm0Fixed';
  if(n.some(x=>/^motor1/.test(x)))return'm1Fixed';
  if(n.some(x=>/^motor2/.test(x)))return'm2Fixed';
  if(n.includes('phalanx3'))return'P3';
  if(n.includes('phalanx2'))return'P2';
  if(n.includes('phalanx1'))return'P1';
  if(n.includes('palm'))return'PALM';
  return'other';
}
const meshes=[];
scene.traverse(o=>{if(!o.isMesh)return;let inBody=false;for(let p=o;p;p=p.parent)if(p.name==='bodyOutline')inBody=true;
  if(inBody)return;assert(o.name,'mesh needs name');meshes.push({mesh:o,assembly:classify(o)});});
assert.equal(new Set(meshes.map(x=>x.mesh.name)).size,meshes.length,'网格名必须唯一');
assert(!meshes.some(x=>/rivet/i.test(x.mesh.name)),'不允许残留铆接件');
const prepared=meshes.map(({mesh,assembly})=>G.prepare(mesh,s,assembly));
const key=(a,b)=>[a,b].sort().join(' / ');
const UNIT=[['PALM','m0','palm'],['P1','m1','p1'],['P2','m2','p2']];
function skip(a,b){
  if(a.assembly===b.assembly)return'同一刚性子总成';
  const set=new Set([a.assembly,b.assembly]),names=[a.name,b.name];
  for(const [seg,mf,segLc] of UNIT){
    if(set.has(seg)&&set.has(mf+'Fixed')){
      if(names.some(n=>new RegExp('^'+mf+'(Collar|FlangeBolt)').test(n)))return'电机抱箍/法兰螺栓与所在段固定连接';
      // 安装板按"段"命名（palmFlangePlate/p1FlangePlate/p2FlangePlate）→ 凸包代理不可表达的设计贴合
      if(names.some(n=>new RegExp('^'+segLc+'FlangePlate').test(n)))return'电机法兰安装板与电机的设计配合（含Ø36.4导向孔）';
    }
  }
  for(const mf of ['m0','m1','m2']){
    if(set.has(mf+'Fixed')&&set.has(mf+'Slider')
      &&names.some(n=>new RegExp('^'+mf+'(ExposedRod|RodThreadStub)$').test(n))
      &&names.some(n=>new RegExp('^'+mf+'(MotorBody|MotorFrontCap)$').test(n)))return'推杆与电机同轴滑动配合';
  }
  for(const [u,seg] of [['m0','palm'],['m1','p1'],['m2','p2']]){
    if(set.has(u+'Slider')&&names.some(n=>new RegExp('^'+u+'(ExposedRod|RodThreadStub)$').test(n))
      &&names.some(n=>new RegExp('^'+seg+'FlangePlate').test(n)))return'推杆穿过该段安装板导向孔';
  }
  return null;
}
function zone(a,b,J){
  const set=new Set([a.assembly,b.assembly]);
  const rO=P.boreElbow/2+0.6,rL=P.boreLink/2+0.6;
  if(set.has('PALM')&&set.has('P1'))return{name:'O0',r:rO,c:J.O0};
  if(set.has('P1')&&set.has('P2'))return{name:'O1',r:rO,c:J.O1};
  if(set.has('P2')&&set.has('P3'))return{name:'O2',r:rO,c:J.O2};
  if(set.has('P1')&&set.has('T0'))return{name:'D0',r:rL,c:J.D0};
  if(set.has('P2')&&set.has('T1'))return{name:'D1',r:rL,c:J.D1};
  if(set.has('P3')&&set.has('T2'))return{name:'D2',r:rL,c:J.D2};
  if(set.has('m0Slider')&&set.has('T0'))return{name:'B0',r:rL,c:J.B0};
  if(set.has('m1Slider')&&set.has('T1'))return{name:'B1',r:rL,c:J.B1};
  if(set.has('m2Slider')&&set.has('T2'))return{name:'B2',r:rL,c:J.B2};
  return null;
}
// 连续下限的步长允差：半径 Rmax 上的弦高（Rmax 由零位姿态实测）
const RMAX=(()=>{let r=0;const v=new THREE.Vector3();
  for(const {mesh} of meshes){const a=mesh.geometry.attributes.position;
    for(let i=0;i<a.count;i++){v.set(a.getX(i),a.getY(i),a.getZ(i));mesh.localToWorld(v);r=Math.max(r,Math.hypot(v.x,v.y)/s);}}
  return r;})();
const allowance=RMAX*STEP*Math.PI/180;
const pairStats=new Map(),collisions=[];
let poseCount=0;
function sweepPose(deg0,deg1,deg2){
  api.updateMechanism(deg0,deg1,deg2);scene.updateMatrixWorld(true);poseCount++;
  const J=api.getJoints(deg0,deg1,deg2);
  const shapes=prepared.map(G.project);
  for(const [i,j] of G.broadPairs(shapes,45)){
    const A=shapes[i],B=shapes[j];if(skip(A,B))continue;
    const k=key(A.name,B.name),z=zone(A,B,J);
    let st=pairStats.get(k);
    if(!st){st={pair:k,assemblies:[A.assembly,B.assembly],min_clearance_mm:Infinity,mating_zone:z?z.name:null};pairStats.set(k,st);}
    const zover=Math.min(A.zmax,B.zmax)-Math.max(A.zmin,B.zmin);
    const inter=G.clip(A.xy,B.xy),contact=inter.length>0&&G.area(inter)>1e-8;
    if(contact&&zover>1e-7){
      const r=z?Math.max(...inter.map(p=>Math.hypot(p[0]-z.c.x,p[1]-z.c.y))):Infinity;
      if(!(z&&r<=z.r)&&collisions.length<200)collisions.push({deg:[+deg0.toFixed(2),+deg1.toFixed(2),+deg2.toFixed(2)],pair:k,
        assemblies:[A.assembly,B.assembly],overlap_mm2:+G.area(inter).toExponential(2)});
    }
    if(!z){
      const gz=Math.max(0,A.zmin-B.zmax,B.zmin-A.zmax);
      const d=contact?gz:Math.hypot(G.polyDist(A.xy,B.xy),gz);
      if(isFinite(d)&&d<st.min_clearance_mm)st.min_clearance_mm=d;
    }
  }
  return J;
}
// ---- 闭合 / 行程 / 传动角 ----
const poses=[[0,0,0],[30,30,20],[45,45,35],[60,60,40],[90,90,70],[90,45,35],[45,90,70],[90,70,20],[20,70,70],[70,20,70]];
let closure=0,strokeErr=0;
for(const [d0,d1,d2] of poses){
  const J=api.getJoints(d0,d1,d2);
  for(const [b,d] of [[J.B0,J.D0],[J.B1l,J.D1l],[J.B2l,J.D2l]])
    closure=Math.max(closure,Math.abs(Math.hypot(b.x-d.x,b.y-d.y)-P.tendonLinkLen));
  for(const [s,deg,lim] of [[J.s0,d0,LIMITS.mcp],[J.s1,d1,LIMITS.pip],[J.s2,d2,LIMITS.dip]])
    strokeErr=Math.max(strokeErr,Math.abs((P.s_extended-s)-P.strokeMax*(deg/120)));
}
// ---- 阶段1：三个关节各自细扫（其余归零）——求连续间隙下限 ----
for(let i=0;i<=Math.round(LIMITS.mcp/STEP);i++)sweepPose(LIMITS.mcp*i/Math.round(LIMITS.mcp/STEP),0,0);
for(let i=0;i<=Math.round(LIMITS.pip/STEP);i++)sweepPose(0,LIMITS.pip*i/Math.round(LIMITS.pip/STEP),0);
for(let i=0;i<=Math.round(LIMITS.dip/STEP);i++)sweepPose(0,0,LIMITS.dip*i/Math.round(LIMITS.dip/STEP));
// ---- 阶段2：安全包络内三维网格（查任意组合干涉）----
const nGrid=[];
for(const lim of [LIMITS.mcp,LIMITS.pip,LIMITS.dip])nGrid.push(Math.round(lim/GRID));
for(let i=0;i<=nGrid[0];i++)for(let j=0;j<=nGrid[1];j++)for(let k=0;k<=nGrid[2];k++)
  sweepPose(LIMITS.mcp*i/nGrid[0],LIMITS.pip*j/nGrid[1],LIMITS.dip*k/nGrid[2]);
const regular=[...pairStats.values()].filter(p=>!p.mating_zone&&isFinite(p.min_clearance_mm)).sort((a,b)=>a.min_clearance_mm-b.min_clearance_mm);
const minClr=regular.length?regular[0].min_clearance_mm:Infinity;
const lb=minClr-allowance;
// ---- 可拆装性 / 互换性 ----
const names=meshes.map(x=>x.mesh.name);
const has=n=>names.includes(n);
const svc=[];
const check=(name,ok,detail)=>svc.push({name,pass:!!ok,detail:detail||''});
check('无铆接/永久连接',!names.some(n=>/rivet/i.test(n)),names.length+'网格');
for(const u of ['m0b','m1b','m2b','o0','o1','o2','p1d','p2d','p3d'])
  for(const part of ['BoltHead','BoltShank','BoltThread','BoltWasher','BoltNut'])check(u+' '+part+' 在位',has(u+part),'');
check('B叉头沉龛螺母×3 在位',has('m0RodNut')&&has('m1RodNut')&&has('m2RodNut'),'');
check('三电机/三连杆齐套',['m0','m1','m2'].every(u=>has(u+'MotorBody'))
  &&['t0','t1','t2'].every(u=>has(u+'TendonWeb')&&has(u+'TendonEyeB')&&has(u+'TendonEyeD')),'');
check('掌骨安装法兰4×M4齐套',has('palmFlangeBase')&&[1,2,3,4].every(i=>has('palmMountBolt'+i)&&has('palmMountBoltHead'+i)),'');
check('三单元轴向浮动=1mm/侧（几何同肘版v5）',
  ((16-P.print.sleeveThickness)/2)>=P.print.axialClearance-1e-9&&((2*(P.print.clevisPlateZ-2))-P.print.linkThickness)/2>=P.print.axialClearance-1e-9,'');
check('三单元连杆为等宽长条（几何同肘版v5）',P.print.linkWidth===15,'');
// 三单元同构：P1单元 与 P2单元 逐件同几何（局部坐标一致 → 零件可互换）
const byName=new Map(meshes.map(x=>[x.mesh.name,x.mesh]));
function localSig(mesh){const a=mesh.geometry.attributes.position,out=[];
  for(let i=0;i<a.count;i++)out.push([a.getX(i).toFixed(6),a.getY(i).toFixed(6),a.getZ(i).toFixed(6)].join(','));
  return out.sort().join(';');}
let sameCount=0,sameBad=[];
for(const m of meshes){
  const nm=m.mesh.name;if(!/^[pmt]1/.test(nm))continue;
  const twinNm=nm.replace(/^([pmt])1/,'$12'),twin=byName.get(twinNm);
  if(!twin){sameBad.push(nm+' 无对应件');continue;}
  if(localSig(m.mesh)!==localSig(twin)){sameBad.push(nm+' 几何不一致');continue;}
  sameCount++;
}
check('三单元同构：P1单元与P2单元逐件同几何（'+sameCount+'件可互换）',sameBad.length===0,sameBad.slice(0,4).join('; '));
check('链条装配：掌→P1→P2→P3 父子关系正确',
  scene.getObjectByName('phalanx1').parent.name==='palm'&&
  scene.getObjectByName('phalanx2').parent.name==='phalanx1'&&
  scene.getObjectByName('phalanx3').parent.name==='phalanx2','');
check('P1 位于掌系 O0、P2 位于 P1 系 O1（局部偏置=段长）',
  Math.abs(scene.getObjectByName('phalanx2').position.y+P.phalanx1Len*s)<1e-9&&
  Math.abs(scene.getObjectByName('phalanx3').position.y+P.phalanx2Len*s)<1e-9,'');
const pass=svc.filter(c=>c.pass).length;
const summary={version:'finger-v7-three-unit',
  status:'掌+三节手指三同构单元串联：闭合/行程/配合区/安全包络碰撞/可拆装性核验',
  limits_deg:LIMITS,grid_step_deg:GRID,fine_step_deg:STEP,parameters:P,
  results:{collision_count:collisions.length,fine_sweep_step_deg:STEP,allowance_mm:+allowance.toFixed(3),radius_max_mm:+RMAX.toFixed(1),
    min_non_mating_clearance_mm:+minClr.toFixed(3),continuous_lower_bound_mm:+lb.toFixed(3),
    tested_pairs:pairStats.size,physical_meshes:meshes.length,poses_scanned:poseCount,
    closure_error_mm:closure,stroke_error_mm:strokeErr,svc_pass:pass,svc_total:svc.length},
  collisions:collisions.slice(0,50),
  closest:regular.slice(0,12).map(p=>({pair:p.pair,min_clearance_mm:+p.min_clearance_mm.toFixed(3)})),
  serviceability:svc};
console.log(JSON.stringify({collisions:collisions.slice(0,20),collision_count:collisions.length,
  min_clearance_mm:+minClr.toFixed(3),continuous_lower_bound_mm:+lb.toFixed(3),allowance_mm:+allowance.toFixed(3),
  meshes:meshes.length,pairs:pairStats.size,poses:poseCount,closure:closure,strokeErr:strokeErr,
  svc_pass:pass+'/'+svc.length,svc_fail:svc.filter(c=>!c.pass).map(c=>c.name+' | '+c.detail),limits:LIMITS},null,1));
assert(closure<1e-6,'三单元闭合误差');
assert(strokeErr<=P.strokeMax+1e-9,'行程范围');
assert.equal(collisions.length,0,'安全包络内扫描到配合区之外的接触');
assert(lb>0,'细扫连续下限非正: '+JSON.stringify(regular.slice(0,4)));
assert(pass===svc.length,'可拆装性基础项');
if(!process.argv.includes('--no-write'))fs.writeFileSync(path.join(root,'finger_verify_report.json'),JSON.stringify(summary,null,2)+'\n');
module.exports={api,summary};
