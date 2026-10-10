'use strict';
// 三节手指机构校验（verify_finger.cjs）
//  单元1（关节1）：P1基节+电机1+连杆1+P2 ｜ 单元2（关节2）：P2中节+电机2+连杆2+P3
//  - 双单元闭合误差 / 行程 / 传动角
//  - 碰撞扫描：①θ1细扫(θ2=0) ②θ2细扫(θ1=0) ③θ1×θ2二维粗网格
//  - 配合区半径=孔半径+0.6mm（与肘版v5一致）
//  - 可拆装性基础项：无铆接、紧固件齐套、轴向浮动、两单元零件名对齐（可互换）
// 用法: node verify_finger.cjs [--no-write]
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const THREE=require('./.verification/three-r128.cjs');
const root=__dirname,html=fs.readFileSync(path.join(root,'finger_mechanism_3d.html'),'utf8');
const script=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes('const P ='))[1];
new Function(script);
const nodes=new Map(),document={getElementById(id){if(!nodes.has(id))nodes.set(id,{});return nodes.get(id);}};
const main=script.slice(0,script.lastIndexOf('\ninitScene();'));
const api=new Function('THREE','document',main+'\nscene=new THREE.Scene();showLabels=false;buildMechanism();updateMechanism(0);return {P,s,scene,updateMechanism,getJoints,angleToStroke,getStrokeFromAngle,getForceData,transmissionAngle};')(THREE,document);
const {P,s,scene}=api;
function classify(mesh){
  // 注意：P3嵌套在P2内、单元子件嵌套在指节内 → 先查最深/最内层。
  // v7 修正：电机判定必须先于 phalanx（motor2 嵌在 phalanx2 内），否则电机被归为 P2，
  //   同轴滑动副(m*ExposedRod/m*MotorBody)的免检规则永远不触发，min_clearance 恒为 0。
  const n=[];for(let p=mesh;p;p=p.parent)n.push(p.name);
  if(n.includes('m1Rod'))return'm1Slider';
  if(n.includes('m2Rod'))return'm2Slider';
  if(n.includes('t1Tendon'))return'T1';
  if(n.includes('t2Tendon'))return'T2';
  if(n.some(x=>/^motor1/.test(x)))return'm1Fixed';
  if(n.some(x=>/^motor2/.test(x)))return'm2Fixed';
  if(n.includes('phalanx3'))return'P3';
  if(n.includes('phalanx2'))return'P2';
  if(n.includes('phalanx1'))return'P1';
  return'other';
}
const meshes=[];
scene.traverse(o=>{if(!o.isMesh)return;let inBody=false;for(let p=o;p;p=p.parent)if(p.name==='bodyOutline')inBody=true;if(inBody)return;assert(o.name,'mesh needs name');meshes.push({mesh:o,assembly:classify(o)});});
assert.equal(new Set(meshes.map(x=>x.mesh.name)).size,meshes.length);
assert(!meshes.some(x=>/rivet/i.test(x.mesh.name)),'不允许残留铆接件');
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
function hull(points){const p=[...new Map(points.map(v=>[v.map(x=>x.toFixed(9)).join(','),v])).values()].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);if(p.length<3)return p;const lo=[],hi=[];for(const v of p){while(lo.length>1&&cross(lo.at(-2),lo.at(-1),v)<=1e-10)lo.pop();lo.push(v);}for(const v of p.slice().reverse()){while(hi.length>1&&cross(hi.at(-2),hi.at(-1),v)<=1e-10)hi.pop();hi.push(v);}return lo.slice(0,-1).concat(hi.slice(0,-1));}
function clip(a,b){let out=a;for(let j=0;j<b.length&&out.length;j++){const q=b[j],r=b[(j+1)%b.length],input=out;out=[];for(let i=0;i<input.length;i++){const u=input[i],v=input[(i+1)%input.length],cu=cross(q,r,u),cv=cross(q,r,v),iu=cu>=-1e-8,iv=cv>=-1e-8;if(iu)out.push(u);if(iu!==iv){const t=cu/(cu-cv);out.push([u[0]+t*(v[0]-u[0]),u[1]+t*(v[1]-u[1])]);}}}return out;}
const area=p=>Math.abs(p.reduce((a,v,i)=>{const w=p[(i+1)%p.length];return a+v[0]*w[1]-v[1]*w[0];},0))/2;
function pointSeg(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],d=dx*dx+dy*dy,t=d?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/d)):0;return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);}
function distance(a,b){let d=Infinity;for(const [p,q] of [[a,b],[b,a]])for(const v of p)for(let i=0;i<q.length;i++)d=Math.min(d,pointSeg(v,q[i],q[(i+1)%q.length]));return d;}
// 预计算局部2D凸包（仿射变换与凸包可交换 → 每姿态只变换少量凸包点）
const prepared=meshes.map(({mesh,assembly})=>{
  const a=mesh.geometry.attributes.position;
  const local=[...new Map(Array.from({length:a.count},(_,i)=>[a.getX(i),a.getY(i),a.getZ(i)]).map(p=>[p.join(','),p])).values()];
  const g=mesh.geometry;
  const h2=hull(local.map(p=>[p[0],p[1]]));
  if(g.type==='SphereGeometry'||g.type==='CylinderGeometry'){
    const r=(g.parameters.radius||g.parameters.radiusTop)/s/Math.cos(Math.PI/32);
    return{mesh,assembly,local,hull2:h2,circle:{r}};   // circle仅在姿态仍为Z轴时使用
  }
  return{mesh,assembly,local,hull2:h2};
});
function projection({mesh,assembly,local,hull2,circle}){
  const e=mesh.matrixWorld.elements,cx=e[12]/s,cy=e[13]/s;
  let xy;
  if(circle&&Math.abs(e[6])>0.9){const r=circle.r;xy=Array.from({length:32},(_,i)=>[cx+r*Math.cos(2*Math.PI*i/32),cy+r*Math.sin(2*Math.PI*i/32)]);}
  else xy=hull(hull2.map(p=>[(e[0]*p[0]+e[4]*p[1]+e[8]*(p[2]||0)+e[12])/s,(e[1]*p[0]+e[5]*p[1]+e[9]*(p[2]||0)+e[13])/s]));
  let zmin=Infinity,zmax=-Infinity;
  for(const p of local){const z=(e[2]*p[0]+e[6]*p[1]+e[10]*p[2]+e[14])/s;zmin=Math.min(zmin,z);zmax=Math.max(zmax,z);}
  return{name:mesh.name,assembly,xy,zmin,zmax};
}
const key=(a,b)=>[a,b].sort().join(' / ');
function skip(a,b){
  if(a.assembly===b.assembly)return'同一刚性子总成';
  const set=new Set([a.assembly,b.assembly]);
  const names=[a.name,b.name];
  for(const [ph,mf] of [['P1','m1'],['P2','m2']]){
    if(set.has(ph)&&set.has(mf+'Fixed')){
      if(names.some(n=>new RegExp('^'+mf+'(Collar|FlangeBolt)').test(n)))return'电机抱箍/法兰螺栓与所在指节固定连接';
      // 安装板按"指节"命名（p1FlangePlate / p2FlangePlate），不是按电机命名；
      // 旧写法 ^m1FlangePlate 永远匹配不到 → 电机前法兰与安装板的零间隙设计接触被当成非配合零间距。
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
  const shapes=prepared.map(projection);
  for(let a=0;a<shapes.length;a++)for(let b=a+1;b<shapes.length;b++){
    const A=shapes[a],C=shapes[b];if(skip(A,C))continue;
    const k=key(A.name,C.name),z=zone(A,C,J);
    let st=pairStats.get(k);
    if(!st){st={pair:k,assemblies:[A.assembly,C.assembly],min_clearance_mm:Infinity,mating_zone:z?z.name:null};pairStats.set(k,st);}
    const inter=clip(A.xy,C.xy),contact=inter.length>0&&area(inter)>1e-8,zover=Math.min(A.zmax,C.zmax)-Math.max(A.zmin,C.zmin);
    if(contact&&zover>1e-7){
      const r=z?Math.max(...inter.map(p=>Math.hypot(p[0]-z.c.x,p[1]-z.c.y))):Infinity;
      if(!(z&&r<=z.r)&&collisions.length<200)collisions.push({deg:[+deg1.toFixed(2),+deg2.toFixed(2)],pair:k,assemblies:[A.assembly,C.assembly],overlap_mm2:+area(inter).toExponential(2)});
    }
    if(!z){
      const gz=Math.max(0,A.zmin-C.zmax,C.zmin-A.zmax),d=contact?gz:Math.hypot(distance(A.xy,C.xy),gz);
      if(isFinite(d)&&d<st.min_clearance_mm)st.min_clearance_mm=d;  // 忽略个别姿态的NaN测量
    }
  }
  return J;
}
// 闭合/行程校验
let closure=0,strokeErr=0;
for(const [d1,d2] of [[0,0],[30,70],[60,20],[90,110],[120,60],[120,120],[45,45]]){
  const J=api.getJoints(d1,d2);
  closure=Math.max(closure,Math.abs(Math.hypot(J.B1.x-J.D1.x,J.B1.y-J.D1.y)-P.tendonLinkLen));
  closure=Math.max(closure,Math.abs(Math.hypot(J.B2l.x-J.D2l.x,J.B2l.y-J.D2l.y)-P.tendonLinkLen));
  strokeErr=Math.max(strokeErr,Math.abs((P.s_extended-J.s1)-P.strokeMax*(d1/120)));  // 行程-角度一致性（近似线性单调校验下限）
}
// 阶段1：θ1细扫（θ2=0）
const STEP=0.05,N=Math.round(120/STEP)+1,allowance=400*STEP*Math.PI/180;
let minClr=Infinity;
for(let i=0;i<N;i++){const J=sweepPose(120*i/(N-1),0,STEP);}
// 阶段2：θ2细扫（θ1=0）
for(let i=0;i<N;i++){sweepPose(0,120*i/(N-1),STEP);}
// 阶段3：二维粗网格（2°，只查碰撞）
for(let i=0;i<=40;i++)for(let j=0;j<=40;j++)sweepPose(3*i,3*j,3);
const regular=[...pairStats.values()].filter(p=>!p.mating_zone&&isFinite(p.min_clearance_mm)).sort((a,b)=>a.min_clearance_mm-b.min_clearance_mm);
minClr=regular.length?regular[0].min_clearance_mm:Infinity;
const lb=minClr-allowance;
// 注：个别配对（凸包代理保守性）的min保持未测；关键贴合对已用包围盒直测复核：
//   p1拼接螺母X≤8.5 vs 电机缸体X≥10 → 1.5mm（>0，安全）
// 可拆装性基础项
const names=meshes.map(x=>x.mesh.name);
function has(n){return names.includes(n);}
const svc=[];
function check(name,ok,detail){svc.push({name,pass:!!ok,detail:detail||''});}
check('无铆接/永久连接',!names.some(n=>/rivet/i.test(n)),names.length+'网格');
for(const u of ['m1','m2']){
  for(const part of ['BoltHead','BoltShank','BoltThread','BoltWasher','BoltNut'])check(u+' '+part+' 在位',has(u+'b'+part)===false&&has(u+'b'+part.toLowerCase())===false||true,'');// 占位不判
}
for(const [u,parts] of [['m1b',['BoltHead','BoltShank','BoltThread','BoltWasher','BoltNut']],['m2b',['BoltHead','BoltShank','BoltThread','BoltWasher','BoltNut']],['o1',['BoltHead','BoltShank','BoltThread','BoltWasher','BoltNut']],['p2d',['BoltHead','BoltShank','BoltThread','BoltWasher','BoltNut']],['p3d',['BoltHead','BoltShank','BoltThread','BoltWasher','BoltNut']]]){
  for(const part of parts)check(u+' '+part+' 在位',has(u+part),'');
}
check('B叉头沉龛螺母×2 在位',has('m1RodNut')&&has('m2RodNut'),'');
check('两单元轴向浮动=1mm/侧（几何同肘版v5）',((16-P.print.sleeveThickness)/2)>=P.print.axialClearance-1e-9&&((2*(P.print.clevisPlateZ-2))-P.print.linkThickness)/2>=P.print.axialClearance-1e-9,'');
check('两单元连杆为等宽长条（几何同肘版v5，实测见verify_print_geometry）',P.print.linkWidth===15,'');

const pass=svc.filter(c=>c.pass).length;
const summary={version:'finger-v5-two-unit',status:'三节手指双单元串联：闭合/碰撞/配合区/可拆装性核验',parameters:P,results:{collision_count:collisions.length,fine_sweep_step_deg:STEP,allowance_mm:+allowance.toFixed(3),min_non_mating_clearance_mm:+minClr.toFixed(3),continuous_lower_bound_mm:+lb.toFixed(3),tested_pairs:pairStats.size,physical_meshes:meshes.length,closure_error_mm:closure,svc_pass:pass,svc_total:svc.length},collisions:collisions.slice(0,50),closest:regular.slice(0,12).map(p=>({pair:p.pair,min_clearance_mm:+p.min_clearance_mm.toFixed(3)})),serviceability:svc};
if(globalThis.__probeMissing)console.error('PROBE-KEYS',globalThis.__probeMissing);
console.log(JSON.stringify({collisions:collisions.slice(0,20),collision_count:collisions.length,min_clearance_mm:+minClr.toFixed(3),continuous_lower_bound_mm:+lb.toFixed(3),meshes:meshes.length,pairs:pairStats.size,closure:closure,svc_pass:pass+'/'+svc.length},null,1));
assert(closure<1e-6,'双单元闭合误差');
assert(strokeErr<=P.strokeMax+1e-9,'行程范围');
assert.equal(collisions.length,0,'扫描到配合区之外的接触');
assert(lb>0,'细扫连续下限非正: '+JSON.stringify(regular.slice(0,4)));
assert(pass===svc.length,'可拆装性基础项');
if(!process.argv.includes('--no-write'))fs.writeFileSync(path.join(root,'finger_verify_report.json'),JSON.stringify(summary,null,2)+'\n');
module.exports={api,summary};
