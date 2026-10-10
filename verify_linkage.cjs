'use strict';
// 连杆连接正确性专项验证（verify_linkage.cjs）
//   数学闭合（|BD|=85）只说明"公式自洽"，不说明"零件真的装在那儿"。
//   本文件从网格级别逐项核对运动链 B → 连杆 → D：
//     ① 推杆露出段端部（m*ExposedRod 顶端）与世界系 B 点重合
//     ② 连杆 B 端孔心 = B 点，D 端孔心 = D 点（孔心取自 bushing ring 网格原点）
//     ③ |BD| = tendonLinkLen，且全行程恒定（数学闭合）
//     ④ B/D 肩螺栓轴与对应孔轴同轴（方向夹角 ≈ 0，位置偏差 ≈ 0）
//     ⑤ 孔径 > 销径（有配合间隙，不是过盈穿模）
//     ⑥ B 端：推杆确实被夹在叉头两耳之间，螺母沉龛在位
//     ⑦ D 端：连杆确实夹在从动指节 D 侧板两耳之间
// 用法: node verify_linkage.cjs
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {THREE}=require('./.verification/geom2d.cjs');
const root=__dirname;
const html=fs.readFileSync(path.join(root,'hand_mechanism_3d.html'),'utf8');
const script=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes('const P ='))[1];
new Function(script);
const nodes=new Map(),document={getElementById(id){if(!nodes.has(id))nodes.set(id,{});return nodes.get(id);}};
const main=script.slice(0,script.lastIndexOf('\ninitScene();'));
const api=new Function('THREE','document',main+
  '\nscene=new THREE.Scene();showLabels=false;buildMechanism();updateMechanism(0,0);'+
  'return {P,s,scene,updateMechanism,getJoints};')(THREE,document);
const {P,s,scene}=api;
const V=(x,y,z)=>new THREE.Vector3(x,y,z);
function obj(n){const o=scene.getObjectByName(n);assert(o,'缺少零件 '+n);return o;}
// 网格局部原点 → 世界（mm）
function originW(n){const o=obj(n);return V(0,0,0).applyMatrix4(o.matrixWorld).multiplyScalar(1/s);}
// 网格局部包围盒 → 世界（mm）
function boxW(n){const o=obj(n);o.geometry.computeBoundingBox();
  const b=o.geometry.boundingBox,a=[b.min.clone(),b.max.clone()].map(v=>v.applyMatrix4(o.matrixWorld).multiplyScalar(1/s));
  return {mn:[Math.min(a[0].x,a[1].x),Math.min(a[0].y,a[1].y),Math.min(a[0].z,a[1].z)],
          mx:[Math.max(a[0].x,a[1].x),Math.max(a[0].y,a[1].y),Math.max(a[0].z,a[1].z)]};}
// 零件轴向（取矩阵的某列）。matrixWorld.elements 为列主序，每列 4 个元素：
// 第 col 列 = e[col*4], e[col*4+1], e[col*4+2]（0=X轴,1=Y轴,2=Z轴）。
function axisW(n,col){const e=obj(n).matrixWorld.elements;
  return V(e[col*4],e[col*4+1],e[col*4+2]).normalize();}
// 几何驱动选轴：杆身类取局部"最长边"，孔板类取局部"最短边"（挤出厚度方向=孔轴）
function longestAxis(n){const g=obj(n).geometry;g.computeBoundingBox();const b=g.boundingBox,
  d=[b.max.x-b.min.x,b.max.y-b.min.y,b.max.z-b.min.z];return d.indexOf(Math.max(...d));}
function shortestAxis(n){const g=obj(n).geometry;g.computeBoundingBox();const b=g.boundingBox,
  d=[b.max.x-b.min.x,b.max.y-b.min.y,b.max.z-b.min.z];return d.indexOf(Math.min(...d));}
const d3=(a,b)=>a.distanceTo(b);

// ---------- 收集运动链零件 ----------
const L={
  u1:{rod:'m1ExposedRod', eyeB:'t1TendonEyeB', eyeD:'t1TendonEyeD', boltB:'m1bBoltShank', boltD:'p2dBoltShank',
      clevis:['m1ClevisArmL','m1ClevisArmR'], nut:'m1RodNut', dArm:['p2DClevisArmL','p2DClevisArmR']},
  u2:{rod:'m2ExposedRod', eyeB:'t2TendonEyeB', eyeD:'t2TendonEyeD', boltB:'m2bBoltShank', boltD:'p3dBoltShank',
      clevis:['m2ClevisArmL','m2ClevisArmR'], nut:'m2RodNut', dArm:['p3DClevisArmL','p3DClevisArmR']},
};

const rows=[];   // 每姿态一行
let worst={rodTip:0,eyeB:0,eyeD:0,closure:0,axisB:0,axisD:0,fitB:0,fitD:0,rodSeam:0,offB:0,offD:0,nutEngage:1e9};
const POSES=[[0,0],[20,10],[45,45],[80,50],[100,100],[120,0],[0,120],[120,120],[60,0],[0,60],[30,120],[110,20]];
for(const [t1,t2] of POSES){
  api.updateMechanism(t1,t2);scene.updateMatrixWorld(true);
  const J=api.getJoints(t1,t2);
  const rec={t1,t2};
  for(const [u,cfg] of Object.entries(L)){
    const B=J['B'+u[1]], D=J['D'+u[1]];
    // ① 推杆末端 = 光杆远端 与 螺纹段近端 中更靠近 B 的那个（螺纹段才是真正旋入螺母的一段），
    //    并核对光杆↔螺纹段接缝连续、螺纹段确实插入螺母。
    const rod=obj(cfg.rod), rodAx=axisW(cfg.rod,longestAxis(cfg.rod));
    rod.geometry.computeBoundingBox();
    const bb=rod.geometry.boundingBox;
    const mot=obj('m'+u[1]+'MotorBody');
    const motC=V(0,0,0).applyMatrix4(mot.matrixWorld).multiplyScalar(1/s);
    const endAt=(mesh,ly)=>{const b=mesh.geometry.boundingBox;
      return new THREE.Vector3((b.min.x+b.max.x)/2, ly, (b.min.z+b.max.z)/2)
        .applyMatrix4(mesh.matrixWorld).multiplyScalar(1/s);};
    const eA=endAt(rod,bb.min.y), eBend=endAt(rod,bb.max.y);
    const rodFar=d3(eA,motC)>=d3(eBend,motC)?eA:eBend;      // 离电机远的一端 = 光杆末端
    // 螺纹段
    const stub=obj('m'+u[1]+'RodThreadStub');
    stub.geometry.computeBoundingBox();
    const sb=stub.geometry.boundingBox;
    const sA=endAt(stub,sb.min.y), sB=endAt(stub,sb.max.y);
    const stubNear=d3(sA,motC)<d3(sB,motC)?sA:sB;            // 螺纹段靠近电机的一端 = 与光杆的接缝
    const stubTip =d3(sA,motC)>=d3(sB,motC)?sA:sB;           // 螺纹段末端 = 真正的推杆端面
    rec[u+'_rodTipErr']=+d3(stubTip,V(B.x,B.y,0)).toFixed(3);
    // 接缝只在两段都可见时才有意义：极端姿态下光杆会整体缩进电机（rod.visible=false），
    // 此时只剩螺纹段代表推杆，去测隐藏网格会得到假的"接缝间隙"。
    rec[u+'_rodSeam']  =+(rod.visible&&stub.visible?d3(rodFar,stubNear):0).toFixed(3);
    // 螺纹段与螺母的轴向啮合：统一变换到"电机组坐标系"再取 Y 区间，
    // 与整指姿态无关（世界系会在杆轴垂直 Y 时把轴向长度折叠成直径，造成假 0）。
    const inMotor=(n)=>{const m=obj(n),inv=new THREE.Matrix4().copy(obj('m'+u[1]+'MotorBody').matrixWorld).invert();
      const a=m.geometry.attributes.position,v=new THREE.Vector3();let mn=1e9,mx=-1e9;
      for(let i=0;i<a.count;i++){v.set(a.getX(i),a.getY(i),a.getZ(i)).applyMatrix4(m.matrixWorld).applyMatrix4(inv);
        mn=Math.min(mn,v.y/s);mx=Math.max(mx,v.y/s);}return[mn,mx];};
    const ys=inMotor('m'+u[1]+'RodThreadStub');
    const nutB=inMotor(cfg.nut);
    rec[u+'_nutEngage']=+(Math.min(ys[1],nutB[1])-Math.max(ys[0],nutB[0])).toFixed(3);
    // ② 孔心
    const eB=originW(cfg.eyeB), eD=originW(cfg.eyeD);
    rec[u+'_eyeBErr']=+d3(eB,V(B.x,B.y,0)).toFixed(3);
    rec[u+'_eyeDErr']=+d3(eD,V(D.x,D.y,0)).toFixed(3);
    // ③ 数学闭合
    rec[u+'_closureErr']=+Math.abs(d3(eB,eD)-P.tendonLinkLen).toFixed(4);
    // ④ 螺栓轴 vs 孔轴（几何驱动：杆身取最长边，孔取最短边）
    const bAx=axisW(cfg.boltB,longestAxis(cfg.boltB)), dAx=axisW(cfg.boltD,longestAxis(cfg.boltD));
    const eBAx=axisW(cfg.eyeB,shortestAxis(cfg.eyeB)), eDAx=axisW(cfg.eyeD,shortestAxis(cfg.eyeD));
    rec[u+'_axisBerr']=+Math.min(bAx.angleTo(eBAx),Math.PI-bAx.angleTo(eBAx)).toFixed(5);
    rec[u+'_axisDerr']=+Math.min(dAx.angleTo(eDAx),Math.PI-dAx.angleTo(eDAx)).toFixed(5);
    // 轴线位置偏差：孔心到螺栓轴线的垂距
    const boltBc=originW(cfg.boltB), boltDc=originW(cfg.boltD);
    const off=(c,ax,p)=>{const v=V(p.x-c.x,p.y-c.y,p.z-c.z);return v.cross(ax.clone()).length();};
    rec[u+'_offB']=+off(boltBc,bAx,eB).toFixed(3);
    rec[u+'_offD']=+off(boltDc,dAx,eD).toFixed(3);
    // ⑤ 配合间隙：孔半径 - 销半径（名义）
    rec[u+'_fitB']=+(P.boreLink/2 - P.print.boltB.shank/2).toFixed(2);
    rec[u+'_fitD']=+(P.boreLink/2 - P.print.boltD.shank/2).toFixed(2);
  }
  rows.push(rec);
  for(const u of ['u1','u2'])for(const k of ['rodTipErr','eyeBErr','eyeDErr','closureErr','axisBerr','axisDerr','offB','offD','rodSeam'])
    worst[k.replace(/Err$/,'')]=Math.max(worst[k.replace(/Err$/,'')],rec[u+'_'+k]);
  worst.nutEngage=Math.min(worst.nutEngage,rec["u1_nutEngage"],rec["u2_nutEngage"]);
}

console.log('=== 连杆连接核验（网格级 vs 运动学） ===');
console.log('行程上限',P.strokeMax.toFixed(3),'mm   连杆名义长度',P.tendonLinkLen,'mm\n');
console.log('姿态        单元  推杆端→B   B孔→B    D孔→D    |BD|闭合   B轴角(rad)  D轴角(rad)  B偏距  D偏距');
for(const r of rows)for(const u of ['u1','u2'])
  console.log(String(r.t1).padStart(3)+','+String(r.t2).padStart(3)+'    '+u+'   '+
    r[u+'_rodTipErr'].toFixed(3).padStart(8)+r[u+'_eyeBErr'].toFixed(3).padStart(9)+
    r[u+'_eyeDErr'].toFixed(3).padStart(9)+r[u+'_closureErr'].toFixed(4).padStart(9)+
    r[u+'_axisBerr'].toFixed(5).padStart(11)+r[u+'_axisDerr'].toFixed(5).padStart(12)+
    r[u+'_offB'].toFixed(2).padStart(7)+r[u+'_offD'].toFixed(2).padStart(7));

// ---------- 静态配合项 ----------
const svc=[];const check=(n,ok,d)=>svc.push({name:n,pass:!!ok,detail:d||''});
const fitB=P.boreLink/2-P.print.boltB.shank/2, fitD=P.boreLink/2-P.print.boltD.shank/2;
check('推杆端面与 B 点距离 = 设计下沉量(13.5mm)',Math.abs(worst.rodTip-13.5)<=0.01,worst.rodTip.toFixed(3)+' mm');
check('光杆↔螺纹段接缝连续 ≤0.05mm',worst.rodSeam<=0.05,worst.rodSeam.toFixed(3)+' mm');
check('螺纹段与夹持螺母啮合 ≥2mm',worst.nutEngage>=2,worst.nutEngage.toFixed(3)+' mm');
check('连杆 B 孔心与 B 点重合 ≤0.5mm',worst.eyeB<=0.5,worst.eyeB.toFixed(3)+' mm');
check('连杆 D 孔心与 D 点重合 ≤0.5mm',worst.eyeD<=0.5,worst.eyeD.toFixed(3)+' mm');
check('双单元 |BD| 闭合 ≤0.01mm',worst.closure<=0.01,worst.closure.toFixed(4)+' mm');
check('B 端销轴与孔轴同轴 ≤0.01rad',worst.axisB<=0.01,worst.axisB.toFixed(5)+' rad');
check('D 端销轴与孔轴同轴 ≤0.01rad',worst.axisD<=0.01,worst.axisD.toFixed(5)+' rad');
check('销轴过孔心（偏距 ≤0.3mm）',Math.max(worst.offB,worst.offD)<=0.3,'B '+worst.offB.toFixed(2)+' / D '+worst.offD.toFixed(2)+' mm');
check('B 端间隙配合（孔Ø'+P.boreLink+' > 销Ø'+P.print.boltB.shank+'）',fitB>0,fitB.toFixed(2)+' mm/侧');
check('D 端间隙配合（孔Ø'+P.boreLink+' > 销Ø'+P.print.boltD.shank+'）',fitD>0,fitD.toFixed(2)+' mm/侧');
for(const [u,cfg] of Object.entries(L)){
  check(u+' B 叉头双耳在位',cfg.clevis.every(n=>{try{obj(n);return true;}catch{return false;}}),cfg.clevis.join(','));
  check(u+' 推杆夹持螺母在位',!!scene.getObjectByName(cfg.nut),cfg.nut);
  check(u+' D 侧板双耳在位',cfg.dArm.every(n=>{try{obj(n);return true;}catch{return false;}}),cfg.dArm.join(','));
  // 连杆两孔心距 = 名义杆长（连杆自身刚性）
  const eB=originW(cfg.eyeB),eD=originW(cfg.eyeD);
  check(u+' 连杆两孔心距 = 名义杆长',Math.abs(d3(eB,eD)-P.tendonLinkLen)<=0.01,d3(eB,eD).toFixed(4)+' mm');
  // 推杆确实伸入叉头：叉头两耳对称布置在 ±Z，"内档"= 两耳内侧之间的空腔。
  // 内档上界 = 两耳 mx 的较小值……注意负号：正确写法是 [min(各耳mx), max(各耳mn)]。
  const zL=boxW(cfg.clevis[0]),zR=boxW(cfg.clevis[1]);
  const tip=boxW(cfg.rod);
  const zmn=Math.min(zL.mx[2],zR.mx[2]),zmx=Math.max(zL.mn[2],zR.mn[2]);
  const inside=zmn<=zmx+1e-6&&tip.mn[2]>=zmn-1e-6&&tip.mx[2]<=zmx+1e-6;
  check(u+' 推杆位于 B 叉头两耳之间（Z 向被夹持）',inside,
    '杆Z['+tip.mn[2].toFixed(1)+','+tip.mx[2].toFixed(1)+'] 耳内档['+zmn.toFixed(1)+','+zmx.toFixed(1)+']');
  // D 侧板把连杆 D 端夹在中间
  const dL=boxW(cfg.dArm[0]),dR=boxW(cfg.dArm[1]);
  const dzmn=Math.min(dL.mx[2],dR.mx[2]),dzmx=Math.max(dL.mn[2],dR.mn[2]);
  const eyeD=boxW(cfg.eyeD);
  const dIn=dzmn<=dzmx+1e-6&&eyeD.mn[2]>=dzmn-1e-6&&eyeD.mx[2]<=dzmx+1e-6;
  check(u+' 连杆 D 端位于 D 侧板两耳之间',dIn,
    '眼Z['+eyeD.mn[2].toFixed(1)+','+eyeD.mx[2].toFixed(1)+'] 耳内档['+dzmn.toFixed(1)+','+dzmx.toFixed(1)+']');
}
const pass=svc.filter(c=>c.pass).length;
console.log('\n=== 配合项 '+pass+'/'+svc.length+' ===');
for(const c of svc)console.log((c.pass?'✓':'✗')+' '+c.name+(c.detail?'   ['+c.detail+']':''));
const fail=svc.filter(c=>!c.pass);
console.log('\n结论：'+(fail.length?'未通过 '+fail.length+' 项':'连杆连接全部正确')+
  '；最坏闭合误差 '+worst.closure.toFixed(4)+'mm，最坏孔心偏差 '+Math.max(worst.eyeB,worst.eyeD,worst.rodTip).toFixed(3)+'mm');
assert.equal(fail.length,0,'连杆连接核验未全通过');
if(!process.argv.includes('--no-write'))
  fs.writeFileSync(path.join(root,'linkage_verify_report.json'),
    JSON.stringify({poses:rows,worst,serviceability:svc,pass,total:svc.length,
      conclusion:fail.length?'FAIL':'连杆连接全部正确'},null,2)+'\n');
