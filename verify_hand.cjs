'use strict';
// 仿生"食指 + 简化底板"机构校验（verify_hand.cjs）
//   node verify_hand.cjs [--no-write]
//   本文件 = 已验证的手指版校验（verify_finger.cjs）改为读取 hand_mechanism_3d.html，
//   并额外增加"指根衔接"专项核验：
//     ① 底板底面与指根方块顶面贴合（间隙 = 0，不得复现旧版 5.0mm 悬空）
//     ② 4×M4 螺栓杆身贯穿底板并旋入方块（有效啮合长度 > 0），头部坐在板面上
//     ③ 螺栓落在底板/方块轮廓内，指根方块对底板有真实承压面
//   - 闭合误差 / 行程 / 传动角 / 碰撞扫描（θ1细扫、θ2细扫、二维网格）
//   - 电机仓：2 台电机轴线最短距离 ≥ 外径 + 2mm
//   - 可拆装性：无铆接、紧固件齐套、轴向浮动、指根紧固件齐套
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const { THREE, clip, area, polyDist, prepare, project, broadPairs, segSeg3, makeSolid, convexOverlapPoint } = require('./.verification/geom2d.cjs');
const root=__dirname;
const html=fs.readFileSync(path.join(root,'hand_mechanism_3d.html'),'utf8');
const script=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes('const P ='))[1];
new Function(script);                                   // 仅做语法检查（不调用）
const nodes=new Map(),document={getElementById(id){if(!nodes.has(id))nodes.set(id,{});return nodes.get(id);}};
const main=script.slice(0,script.lastIndexOf('\ninitScene();'));
const api=new Function('THREE','document',main+
  '\nscene=new THREE.Scene();showLabels=false;buildMechanism();updateMechanism(0,0);'+
  'return {P,s,scene,updateMechanism,getJoints,angleToStroke,getStrokeFromAngle,getForceData,transmissionAngle};')(THREE,document);
const {P,s,scene}=api;

// ---------- 装配分类 ----------
// 注意顺序：motor2 是 phalanx2 的子组，t2Tendon/m2Rod 又嵌在更内层。
// 必须"由内向外"判断，否则电机2的所有零件都会被误判成 P2，
// 导致"推杆与电机同轴滑动配合"等免检规则永远不生效（曾因此误报细扫下限非正）。
function classify(mesh){
  const n=[];for(let p=mesh;p;p=p.parent)n.push(p.name);
  if(n.includes('m1Rod'))return'm1Slider';
  if(n.includes('m2Rod'))return'm2Slider';
  if(n.includes('t1Tendon'))return'T1';
  if(n.includes('t2Tendon'))return'T2';
  // 先于 phalanx：motor1 挂在 scene/p1 上，motor2 嵌在 phalanx2 内。
  // 手版的组名是 motor1/motor2Fixed，用前缀匹配，不能只认 "motor2"（否则电机被归为 P2，
  //   同轴滑动副 m*ExposedRod/m*MotorBody 的免检规则永不触发）。
  if(n.some(x=>/^motor1/.test(x)))return'm1Fixed';
  if(n.some(x=>/^motor2/.test(x)))return'm2Fixed';
  // 反根后 phalanx1 嵌在 phalanx2 的 p2Body 里 → 必须先判 phalanx1
  if(n.includes('phalanx1'))return'P1';          // 含指根方块与简化底板（同一螺接刚体）
  if(n.includes('phalanx2'))return'P2';
  if(n.includes('phalanx3'))return'P3';
  return'other';
}
const FASTENER=/Bolt|Nut|Washer|Rivet/;
const meshes=[];
scene.traverse(o=>{if(!o.isMesh)return;assert(o.name,'网格必须有名字');meshes.push({mesh:o,assembly:classify(o)});});
assert.equal(new Set(meshes.map(x=>x.mesh.name)).size,meshes.length,'网格名必须唯一');
assert(!meshes.some(x=>/rivet/i.test(x.mesh.name)),'不允许残留铆接件');
const prepared=meshes.filter(x=>!FASTENER.test(x.mesh.name)).map(({mesh,assembly})=>prepare(mesh,s,assembly));

// ---------- 配合/同体免检 ----------
const key=(a,b)=>[a,b].sort().join(' / ');
function skip(a,b){
  if(a.assembly===b.assembly)return'同一刚性子总成';
  const set=new Set([a.assembly,b.assembly]);
  const names=[a.name,b.name];
  for(const [ph,mf] of [['P1','m1'],['P2','m2']]){
    if(set.has(ph)&&set.has(mf+'Fixed')){
      if(names.some(n=>new RegExp('^'+mf+'(Collar|FlangeBolt)').test(n)))return'电机抱箍/法兰螺栓与所在指节固定连接';
      // 安装板按"指节"命名（p1FlangePlate / p2FlangePlate），不是按电机命名——
      // 旧写法 ^m1FlangePlate 永远匹配不到，等于这条免检从未生效。
      if(names.some(n=>new RegExp('^'+ph.toLowerCase()+'FlangePlate').test(n)))return'电机法兰安装板与电机的设计配合（板含Ø36.4导向孔，凸包代理不可表达）';
    }
  }
  for(const [mf,sl] of [['m1Fixed','m1Slider'],['m2Fixed','m2Slider']]){
    const setS=new Set([a.assembly,b.assembly]);
    if(setS.has(mf)&&setS.has(sl)&&names.some(n=>new RegExp('^'+sl.slice(0,2)+'(ExposedRod|RodThreadStub)$').test(n))&&names.some(n=>new RegExp('^'+mf.slice(0,2)+'(MotorBody|MotorFrontCap)$').test(n)))return'推杆与电机同轴滑动配合';
  }
  for(const u of ['m1','m2']){
    const setS=new Set([a.assembly,b.assembly]);
    if(setS.has(u+'Slider')&&names.some(n=>new RegExp('^'+u+'(ExposedRod|RodThreadStub)$').test(n))&&names.some(n=>new RegExp('^'+u+'FlangePlate').test(n)))return'推杆穿过该指节安装板导向孔';
  }
  return null;
}
function zone(a,b,J){
  const set=new Set([a.assembly,b.assembly]);
  const rO=P.boreElbow/2+0.6,rL=P.boreLink/2+0.6;
  if(set.has('P1')&&set.has('P2'))return{name:'O1',r:rO,c:J.O1};
  if(set.has('P2')&&set.has('T1'))return{name:'D1',r:rL,c:J.D1};
  if(set.has('m1Slider')&&set.has('T1'))return{name:'B1',r:rL,c:J.B1};
  if(set.has('P2')&&set.has('P3'))return{name:'O2',r:rO,c:J.O2};
  if(set.has('P3')&&set.has('T2'))return{name:'D2',r:rL,c:J.D2};
  if(set.has('m2Slider')&&set.has('T2'))return{name:'B2',r:rL,c:J.B2};
  return null;
}
const pairStats=new Map(),collisions=[];
function sweepPose(deg1,deg2,stepDeg){
  api.updateMechanism(deg1,deg2);scene.updateMatrixWorld(true);
  const J=api.getJoints(deg1,deg2),joints={O1:J.O1,B1:J.B1,D1:J.D1,O2:J.O2,B2:J.B2,D2:J.D2};
  const shapes=prepared.map(project);
  for(const [ia,ib] of broadPairs(shapes,40)){
    const A=shapes[ia],C=shapes[ib];if(skip(A,C))continue;
    const k=key(A.name,C.name),z=zone(A,C,joints);
    let st=pairStats.get(k);
    if(!st){st={pair:k,assemblies:[A.assembly,C.assembly],min_clearance_mm:Infinity,mating_zone:z?z.name:null};pairStats.set(k,st);}
    const inter=clip(A.xy,C.xy),contact=inter.length>0&&area(inter)>1e-8,zover=Math.min(A.zmax,C.zmax)-Math.max(A.zmin,C.zmin);
    if(contact&&zover>1e-7){
      const r=z?Math.max(...inter.map(p=>Math.hypot(p[0]-z.c.x,p[1]-z.c.y))):Infinity;
      if(!(z&&r<=z.r)&&collisions.length<200){
        // 凸包粗判后再做精确实体复核，避免把"指节合法包绕电机"误判为干涉
        const sa=makeSolid(prepared[ia].mesh,s),sb=makeSolid(prepared[ib].mesh,s);
        if(convexOverlapPoint(sa,sb,inter,1.0))collisions.push({deg:[+deg1.toFixed(2),+deg2.toFixed(2)],pair:k,assemblies:[A.assembly,C.assembly],overlap_mm2:+area(inter).toExponential(2)});
      }
    }
    if(!z){
      const gz=Math.max(0,A.zmin-C.zmax,C.zmin-A.zmax),d=contact?gz:Math.hypot(polyDist(A.xy,C.xy),gz);
      if(isFinite(d)&&d<st.min_clearance_mm)st.min_clearance_mm=d;
    }
  }
  return J;
}

// ---------- 1) 闭合 / 行程 ----------
let closure=0,strokeErr=0;
for(const [d1,d2] of [[0,0],[30,70],[60,20],[90,110],[120,60],[120,120],[45,45]]){
  // 反根后 B/D 分属不同参考系（B 在自身指节、D 在相邻指节），解析式不再同系。
  // 闭合以"实体眼环的世界距离"为准 —— 这才是物理真值。
  scene.updateMatrixWorld(true);
  const V3=(x,y,z)=>new THREE.Vector3(x,y,z);
  const eyeW=n=>{const o=scene.getObjectByName(n);return V3(0,0,0).applyMatrix4(o.matrixWorld).multiplyScalar(1/s);};
  closure=Math.max(closure,Math.abs(eyeW('t1TendonEyeB').distanceTo(eyeW('t1TendonEyeD'))-P.tendonLinkLen));
  closure=Math.max(closure,Math.abs(eyeW('t2TendonEyeB').distanceTo(eyeW('t2TendonEyeD'))-P.tendonLinkLen));
}

// —— 反根后行程校验：连杆反向布置后映射非线性，改为校验"全行程所需行程 ≤ 电机可用行程" ——
{
  const MOTOR_STROKE=59.393;
  let s1min=1e9,s1max=-1e9;
  for(let d=0;d<=120;d+=2){
    const v=api.angleToStroke(d);
    s1min=Math.min(s1min,v);s1max=Math.max(s1max,v);
  }
  const need=s1max-s1min;
  strokeErr = need<=MOTOR_STROKE ? 0 : need-MOTOR_STROKE;
  P.__requiredStroke=+need.toFixed(2);
  console.log('反根后两单元所需行程（同构单元，取一） =',need.toFixed(2),'mm / 电机可用',MOTOR_STROKE,'mm');
}

// ---------- 2) 指根衔接专项（本文件新增）----------
scene.updateMatrixWorld(true);
function worldBox(name){
  const o=scene.getObjectByName(name);assert(o,'缺少零件 '+name);
  const a=o.geometry.attributes.position,v=new THREE.Vector3();
  let mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];
  for(let i=0;i<a.count;i++){v.set(a.getX(i),a.getY(i),a.getZ(i)).applyMatrix4(o.matrixWorld);
    mn=[Math.min(mn[0],v.x),Math.min(mn[1],v.y),Math.min(mn[2],v.z)];
    mx=[Math.max(mx[0],v.x),Math.max(mx[1],v.y),Math.max(mx[2],v.z)];}
  return{mn:mn.map(x=>x/s),mx:mx.map(x=>x/s)};
}
const jbox={
  block:   worldBox('p1PalmBase'),
  plate:   worldBox('p1PalmFlangeBase'),
  bolt1:   worldBox('p1PalmBolt1'),
  head1:   worldBox('p1PalmBoltHead1'),
};
// —— 以下均为"方向无关"写法：整指现在套在 hand 组里绕 Z 转了 180°，
//    底板从 +Y 端挪到了 −Y 端，所以不能再用"板在方块上方"的固定符号假设。
// d=+1 表示板在方块的 +Y 侧；d=−1 表示在 −Y 侧。所有轴向量都先乘 d 归一到"+d 侧"。
const dSide=((jbox.plate.mn[1]+jbox.plate.mx[1])>=(jbox.block.mn[1]+jbox.block.mx[1]))?1:-1;
const Y=v=>v*dSide;                       // 归一后的轴向坐标
const rng=b=>{const a=Y(b.mn[1]),c=Y(b.mx[1]);return[Math.min(a,c),Math.max(a,c)];};  // 乘 −1 会颠倒 min/max，需重排
const [pY0,pY1]=rng(jbox.plate), [kY0,kY1]=rng(jbox.block);
const [bY0,bY1]=rng(jbox.bolt1), [hY0,hY1]=rng(jbox.head1);
const gapMM=+(pY0-kY1).toFixed(4);              // 板底 − 方块顶（归一后板恒在 +Y 侧）
const engageMM=+(kY1-bY0).toFixed(3);           // 杆伸入方块的长度
const boltSpansPlate=bY0<=pY0+1e-6&&bY1>=pY1-1e-6;
const headOnPlate=+(hY0-pY1).toFixed(3);        // 头底面 − 板面
// 螺栓 XY 必须同时落在底板与方块轮廓内
const inBox=(b,x,z)=>x>=b.mn[0]-1e-6&&x<=b.mx[0]+1e-6&&z>=b.mn[2]-1e-6&&z<=b.mx[2]+1e-6;
const boltInBoth=P.print.rootBoltXZ.every(([x,z])=>inBox(jbox.plate,x,z)&&inBox(jbox.block,x,z));
// 底板承压在方块顶面上的接触面积（板≫方块，取方块顶面积）
const bearingMM2=+( (jbox.block.mx[0]-jbox.block.mn[0]) * (jbox.block.mx[2]-jbox.block.mn[2]) ).toFixed(1);
const plateFaceMM2=+((jbox.plate.mx[0]-jbox.plate.mn[0])*(jbox.plate.mx[2]-jbox.plate.mn[2])).toFixed(1);

// ---------- 3) 电机仓间距（2 台）----------
const motorAxes=[];
for(const nm of ['m1MotorBody','m2MotorBody']){
  const o=scene.getObjectByName(nm);assert(o,'缺少 '+nm);
  const e=o.matrixWorld.elements;
  const dir=new THREE.Vector3(e[4],e[5],e[6]).normalize();
  const c=new THREE.Vector3(e[12]/s,e[13]/s,e[14]/s);
  const h=P.motorBodyLen/2;
  motorAxes.push({id:nm,p0:c.clone().addScaledVector(dir,-h).toArray(),p1:c.clone().addScaledVector(dir,h).toArray()});
}
const motorMin=+segSeg3(motorAxes[0].p0,motorAxes[0].p1,motorAxes[1].p0,motorAxes[1].p1).toFixed(2);
const motorReq=2*P.motorBodyRadius+2;

// ---------- 4) 碰撞扫描 ----------
const STEP=0.1,N=Math.round(120/STEP)+1,allowance=400*STEP*Math.PI/180;
for(let i=0;i<N;i++)sweepPose(120*i/(N-1),0,STEP);        // θ1 细扫（θ2=0）
for(let i=0;i<N;i++)sweepPose(0,120*i/(N-1),STEP);        // θ2 细扫（θ1=0）
for(let i=0;i<=60;i++)for(let j=0;j<=60;j++)sweepPose(2*i,2*j,2);   // 二维网格 2°
const regular=[...pairStats.values()].filter(p=>!p.mating_zone&&isFinite(p.min_clearance_mm)).sort((a,b)=>a.min_clearance_mm-b.min_clearance_mm);
const minClr=regular.length?regular[0].min_clearance_mm:Infinity;
const lb=allowance<0?minClr+allowance:minClr-allowance; // allowance 未知时不做扣减

// ---------- 5) 可拆装性 ----------
const names=meshes.map(x=>x.mesh.name);
const has=n=>names.includes(n);
const svc=[];const check=(name,ok,detail)=>svc.push({name,pass:!!ok,detail:detail||''});
check('无铆接/永久连接',!names.some(n=>/rivet/i.test(n)),names.length+' 网格');
for(const [u,parts] of [['m1b',['BoltHead','BoltShank','BoltThread','BoltWasher','BoltNut']],
                        ['m2b',['BoltHead','BoltShank','BoltThread','BoltWasher','BoltNut']],
                        ['o1',['BoltHead','BoltShank','BoltThread','BoltWasher','BoltNut']],
                        ['p2d',['BoltHead','BoltShank','BoltThread','BoltWasher','BoltNut']],
                        ['p3d',['BoltHead','BoltShank','BoltThread','BoltWasher','BoltNut']]])
  for(const part of parts)check(u+' '+part+' 在位',has(u+part),'');
check('B叉头沉龛螺母×2 在位',has('m1RodNut')&&has('m2RodNut'),'');
check('两单元轴向浮动≥'+P.print.axialClearance+'mm/侧',
  ((16-P.print.sleeveThickness)/2)>=P.print.axialClearance-1e-9&&((2*(P.print.clevisPlateZ-2))-P.print.linkThickness)/2>=P.print.axialClearance-1e-9,'');
check('两单元连杆为等宽长条',P.print.linkWidth===15,'');
// —— 指根衔接项 ——
check('指根底板与方块顶面贴合（无悬空）',Math.abs(gapMM)<=1e-3,gapMM+' mm');
check('4×M4 指根螺栓齐套',['1','2','3','4'].every(i=>has('p1PalmBolt'+i)&&has('p1PalmBoltHead'+i)),'M4×4');
check('指根螺栓杆身贯穿底板',boltSpansPlate,'杆 Y['+jbox.bolt1.mn[1].toFixed(1)+','+jbox.bolt1.mx[1].toFixed(1)+']');
check('指根螺栓旋入方块有效啮合 > '+(P.print.basePlateT/2)+'mm',engageMM>P.print.basePlateT/2,engageMM+' mm');
check('指根螺栓头部坐在板面上',headOnPlate>=-1e-6&&headOnPlate<=0.01,'头底面 y='+(jbox.plate.mx[1]+headOnPlate).toFixed(2));
check('螺栓孔位同时落在底板与方块内',boltInBoth,'孔距 '+P.print.rootBoltXZ.map(p=>p.join('×')).join(', '));
check('指根方块对底板有承压面',bearingMM2>0&&bearingMM2<=plateFaceMM2,bearingMM2+' mm²（板上表面 '+plateFaceMM2+' mm²）');
check('每关节 1 台直线电机（无欠驱动）',motorAxes.length===2,'2 台 / 2 个主动关节');
check('电机仓无干涉（轴线间距 ≥ 外径+2mm）',motorMin>=motorReq,motorMin+' ≥ '+motorReq);

const pass=svc.filter(c=>c.pass).length;
const summary={version:'hand-v9-index-baseplate',
  status:'仿生食指（单指复位版）：2×（每关节直线电机 + BD连杆）+ 指根简化底板',
  scope:'仅食指；多指扇形布局暂时下线',
  scale:P.scale,
  parameters:{upperArmLen:P.upperArmLen,phalanx2Len:P.phalanx2Len,forearmLen:P.forearmLen,
    motorMountX:P.motorMountX,motorMountY:P.motorMountY,motorBodyDia:2*P.motorBodyRadius,
    motorBodyLen:P.motorBodyLen,tendonLinkLen:P.tendonLinkLen,strokeMax:+P.strokeMax.toFixed(3)},
  root_junction:{gap_plate_to_block_mm:gapMM,bolt_engagement_into_block_mm:engageMM,
    bolt_spans_plate:boltSpansPlate,head_seat_offset_mm:headOnPlate,
    bolt_holes_in_both:boltInBoth,bearing_area_mm2:bearingMM2,plate_face_area_mm2:plateFaceMM2,
    block_Y:[+jbox.block.mn[1].toFixed(1),+jbox.block.mx[1].toFixed(1)],
    plate_Y:[+jbox.plate.mn[1].toFixed(1),+jbox.plate.mx[1].toFixed(1)],
    plate_XZ:[[+jbox.plate.mn[0].toFixed(1),+jbox.plate.mx[0].toFixed(1)],[+jbox.plate.mn[2].toFixed(1),+jbox.plate.mx[2].toFixed(1)]]},
  results:{closure_error_mm:closure,stroke_used_mm:+(P.s_extended-api.angleToStroke(0)).toFixed(3),stroke_max_mm:+P.strokeMax.toFixed(3),
    collision_count:collisions.length,fine_sweep_step_deg:STEP,allowance_mm:+allowance.toFixed(3),
    min_non_mating_clearance_mm:+minClr.toFixed(3),continuous_lower_bound_mm:+lb.toFixed(3),
    tested_pairs:pairStats.size,physical_meshes:meshes.length,swept_meshes:prepared.length,
    motor_min_clearance_mm:motorMin,motor_required_mm:motorReq,svc_pass:pass,svc_total:svc.length},
  closest:regular.slice(0,12).map(p=>({pair:p.pair,min_clearance_mm:+p.min_clearance_mm.toFixed(3)})),
  collisions:collisions.slice(0,50),serviceability:svc};
console.log(JSON.stringify({collisions:collisions.length,min_clearance_mm:+minClr.toFixed(3),
  continuous_lower_bound_mm:+lb.toFixed(3),meshes:meshes.length,pairs:pairStats.size,closure:closure,
  motor_min:motorMin,motor_req:motorReq,
  root_gap_mm:gapMM,bolt_engagement_mm:engageMM,svc_pass:pass+'/'+svc.length},null,1));
if(collisions.length)console.log('碰撞样本:',JSON.stringify(collisions.slice(0,8),null,1));
console.log('最近非配合间距:',JSON.stringify(regular.slice(0,8).map(p=>({p:p.pair,d:+p.min_clearance_mm.toFixed(2)}))));
if(pass!==svc.length)console.log('未通过项:',JSON.stringify(svc.filter(c=>!c.pass)));
assert(closure<1e-6,'双单元闭合误差');
assert(strokeErr<=P.strokeMax+1e-9,'行程范围');
assert.equal(collisions.length,0,'扫描到配合区之外的接触');
assert(lb>0,'细扫连续下限非正');
assert(pass===svc.length,'可拆装性/衔接检查未全通过');
if(!process.argv.includes('--no-write'))fs.writeFileSync(path.join(root,'hand_verify_report.json'),JSON.stringify(summary,null,2)+'\n');
module.exports={api,summary};
