'use strict';
// 三节手指：3D打印适配性 + 可拆装性综合校验
//  1) 打印件STL：孔轴竖直、通孔、孔径、孔壁厚、连通性、幅面（读 stl_finger/*.stl）
//  2) 拆装：三处关节的工具/抽销通道（0/45/90°×三单元）、电机抽出手通道、连杆等宽、无永久连接
//  3) 三单元零件可互换性：同名零件几何签名一致
// 用法: node verify_finger_print.cjs
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const THREE=require('./.verification/three-r128.cjs');
const root=__dirname,html=fs.readFileSync(path.join(root,'finger_mechanism_3d.html'),'utf8');
const script=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes('const P ='))[1];
const nodes=new Map(),document={getElementById(id){if(!nodes.has(id))nodes.set(id,{});return nodes.get(id);}};
const main=script.slice(0,script.lastIndexOf('\ninitScene();'));
const api=new Function('THREE','document',main+'\nscene=new THREE.Scene();showLabels=false;buildMechanism();updateMechanism(0,0,0);return {P,s,scene,updateMechanism,getJoints,angleToStroke};')(THREE,document);
const {P,s,scene}=api;
scene.updateMatrixWorld(true);
const checks=[];
function check(name,ok,detail){checks.push({name,pass:!!ok,detail:detail||''});}
const f1=x=>x.toFixed(2), f2=x=>x.toFixed(3);

// ---------- STL 读取（二进制） ----------
function readSTL(file){
  const buf=fs.readFileSync(file);
  const n=buf.readUInt32LE(80), tris=[];
  for(let i=0;i<n;i++){
    const o=84+i*50+12;
    const v=[];
    for(let k=0;k<3;k++){
      const p=o+k*12;
      v.push([buf.readFloatLE(p),buf.readFloatLE(p+4),buf.readFloatLE(p+8)]);
    }
    tris.push(v);
  }
  return tris;
}
function stlBBox(tris){
  const mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];
  for(const t of tris)for(const v of t)for(let k=0;k<3;k++){mn[k]=Math.min(mn[k],v[k]);mx[k]=Math.max(mx[k],v[k]);}
  return {mn,mx,size:[mx[0]-mn[0],mx[1]-mn[1],mx[2]-mn[2]]};
}
// 点是否在STL实体内（沿+Z射线奇偶，3方向投票；对打印件Z向为"高度"）
function pointInSTL(tris,x,y,z){
  const dirs=[[0.31,-0.77,0.55],[-0.62,0.19,0.76],[0.55,0.61,-0.57]];
  let inside=0;
  for(const d of dirs){
    let hits=0;
    for(const t of tris){
      if(rayTri([x,y,z],d,t))hits++;
    }
    if(hits%2===1)inside++;
  }
  return inside>=2;
}
function rayTri(o,d,t){
  const e1=[t[1][0]-t[0][0],t[1][1]-t[0][1],t[1][2]-t[0][2]];
  const e2=[t[2][0]-t[0][0],t[2][1]-t[0][1],t[2][2]-t[0][2]];
  const p=[d[1]*e2[2]-d[2]*e2[1],d[2]*e2[0]-d[0]*e2[2],d[0]*e2[1]-d[1]*e2[0]];
  const det=e1[0]*p[0]+e1[1]*p[1]+e1[2]*p[2];
  if(Math.abs(det)<1e-12)return false;
  const inv=1/det;
  const tv=[o[0]-t[0][0],o[1]-t[0][1],o[2]-t[0][2]];
  const u=(tv[0]*p[0]+tv[1]*p[1]+tv[2]*p[2])*inv;
  if(u<0||u>1)return false;
  const q=[tv[1]*e1[2]-tv[2]*e1[1],tv[2]*e1[0]-tv[0]*e1[2],tv[0]*e1[1]-tv[1]*e1[0]];
  const v=(d[0]*q[0]+d[1]*q[1]+d[2]*q[2])*inv;
  if(v<0||u+v>1)return false;
  const tt=(e2[0]*q[0]+e2[1]*q[1]+e2[2]*q[2])*inv;
  return tt>1e-6;
}

const stlDir=path.join(root,'stl_finger');
const idx=JSON.parse(fs.readFileSync(path.join(stlDir,'index.json'),'utf8'));
const stls={};
for(const p of idx.parts){ if(p.kind==='printed') stls[p.part]=readSTL(path.join(stlDir,p.part+'.stl')); }

// ---------- 1. 幅面与姿态（所有打印件落地、Z=孔轴/主方向） ----------
const BED=220;
let worst=null,worstFit=0;
for(const p of idx.parts){
  if(p.kind!=='printed')continue;
  const [w,l,h]=p.bounding_box_mm;
  const fit=Math.min(Math.max(w,l),(w+l)/Math.SQRT2);   // 45°斜排占地
  if(fit>worstFit){worstFit=fit;worst=p;}
}
check('打印件45°斜排最小外接正方形≤'+BED+'mm',worstFit<=BED,
  '最差 '+worst.part+' '+worstFit.toFixed(1)+'mm（直排'+Math.max(worst.bounding_box_mm[0],worst.bounding_box_mm[1]).toFixed(0)+'mm）');
for(const p of idx.parts){
  if(p.kind!=='printed')continue;
  const tris=stls[p.part], bb=stlBBox(tris);
  check(p.part+' 已落地(z_min=0)',Math.abs(bb.mn[2])<1e-3,'z_min='+f2(bb.mn[2]));
}

// ---------- 2. 关键孔：通孔 + 孔径 + 孔壁厚（在世界模型中沿孔轴Z测量） ----------
const rc=new THREE.Raycaster(); rc.far=1e6;
function probe(meshName){
  const m=scene.getObjectByName(meshName);
  if(!m)throw new Error('missing '+meshName);
  const t=new THREE.Mesh(m.geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
  t.matrixWorld.copy(m.matrixWorld); t.matrixAutoUpdate=false; return t;
}
function centerMM(t){const v=new THREE.Vector3(0,0,0).applyMatrix4(t.matrixWorld);return [v.x/s,v.y/s,v.z/s];}
function cast(t,ox,oy,oz,dx,dy,dz){rc.set(new THREE.Vector3(ox*s,oy*s,oz*s),new THREE.Vector3(dx,dy,dz).normalize());return rc.intersectObject(t,false);}
function throughHole(meshName){const t=probe(meshName),[cx,cy,cz]=centerMM(t);return cast(t,cx,cy,cz+200,0,0,-1).length+cast(t,cx,cy,cz-200,0,0,1).length;}
function boreRadius(meshName){const t=probe(meshName),[cx,cy,cz]=centerMM(t);let r=Infinity;
  for(let k=0;k<16;k++){const a=2*Math.PI*k/16;const h=cast(t,cx,cy,cz,Math.cos(a),Math.sin(a),0);if(h.length)r=Math.min(r,h[0].distance/s);}return r;}
function wallThickness(meshName){const t=probe(meshName),[cx,cy,cz]=centerMM(t);const bore=boreRadius(meshName),eps=0.02;let w=Infinity;
  for(let k=0;k<16;k++){const a=2*Math.PI*k/16,dx=Math.cos(a),dy=Math.sin(a);const h=cast(t,cx+ (bore+eps)*dx,cy+(bore+eps)*dy,cz,dx,dy,0);if(h.length)w=Math.min(w,h[0].distance/s+eps);}return w;}
function chamferNormalZ(meshName){const t=probe(meshName),[cx,cy,cz]=centerMM(t);const bore=boreRadius(meshName);
  const h=cast(t,cx+(bore+0.35),cy,cz+40,0,0,-1);if(!h.length)return NaN;
  const n=h[0].face.normal.clone().transformDirection(t.matrixWorld);return Math.abs(n.z);}

// 关节0/1/2 转动副（三个同构单元：局部坐标相同）
for(const [u,label] of [['palm','关节0'],['p1','关节1'],['p2','关节2']]){
  const fork=u+'ForkL';
  check(label+' 叉耳Ø'+P.boreElbow.toFixed(1)+'通孔',throughHole(fork)===0,'');
  check(label+' 叉耳孔径实测',Math.abs(2*boreRadius(fork)-P.boreElbow)<0.2,'实测Ø'+f1(2*boreRadius(fork)));
  check(label+' 叉耳孔壁厚≥'+P.print.wallMin+'mm',wallThickness(fork)>=P.print.wallMin-0.05,'实测'+f1(wallThickness(fork))+'mm');
}
for(const [u,label] of [['p1','关节0'],['p2','关节1'],['p3','关节2']]){
  const sleeve=u+'SleeveBody';
  check(label+' 轴套Ø'+P.boreElbow.toFixed(1)+'通孔',throughHole(sleeve)===0,'');
  check(label+' 轴套孔径实测',Math.abs(2*boreRadius(sleeve)-P.boreElbow)<0.2,'实测Ø'+f1(2*boreRadius(sleeve)));
  check(label+' 轴套孔口45°倒角',Math.abs(chamferNormalZ(sleeve)-0.707)<0.09,'|n.z|='+f2(chamferNormalZ(sleeve)));
  check(label+' 轴套壁厚≥'+P.print.wallMin+'mm',wallThickness(sleeve)>=P.print.wallMin-0.05,'实测'+f1(wallThickness(sleeve))+'mm');
}
// B/D 连杆副（三个单元）
for(const [u,label] of [['p1','D0'],['p2','D1'],['p3','D2']]){
  const boss=u+'DClevisBossL';
  check(label+' 侧板凸台Ø'+P.boreLink.toFixed(1)+'通孔',throughHole(boss)===0,'');
  check(label+' 侧板凸台壁厚≥'+P.print.wallMin+'mm',wallThickness(boss)>=P.print.wallMin-0.05,'实测'+f1(wallThickness(boss))+'mm');
}
for(const [u,label] of [['m0','B0'],['m1','B1'],['m2','B2']]){
  const plate=u+'ClevisPlateL';
  check(label+' 叉耳板Ø'+P.boreLink.toFixed(1)+'通孔',throughHole(plate)===0,'');
  check(label+' 叉耳板壁厚≥'+P.print.wallMin+'mm',wallThickness(plate)>=P.print.wallMin-0.05,'实测'+f1(wallThickness(plate))+'mm');
}
for(const u of ['t0','t1','t2']){
  for(const e of ['B','D']){
    const eye=u+'TendonEye'+e;
    check(u+' 连杆'+e+'端通孔',throughHole(eye)===0,'');
    check(u+' 连杆'+e+'端孔口45°倒角',Math.abs(chamferNormalZ(eye)-0.707)<0.09,'|n.z|='+f2(chamferNormalZ(eye)));
    check(u+' 连杆'+e+'端孔壁厚≥'+P.print.wallMin+'mm',wallThickness(eye)>=P.print.wallMin-0.05,'实测'+f1(wallThickness(eye))+'mm');
  }
}
check('B/D孔径单边间隙',Math.abs(P.boreLink-2*P.linkPinRadius-2*P.print.radialClearance)<1e-6,
  'Ø'+P.boreLink.toFixed(1)+'配Ø'+(2*P.linkPinRadius)+' → 单边'+P.print.radialClearance+'mm');

// ---------- 3. 连杆等宽长条 + 三单元可互换 ----------
for(const u of ['t0','t1','t2']){
  const web=scene.getObjectByName(u+'TendonWeb'), eye=scene.getObjectByName(u+'TendonEyeB');
  web.geometry.computeBoundingBox(); eye.geometry.computeBoundingBox();
  const wW=(web.geometry.boundingBox.max.x-web.geometry.boundingBox.min.x)/s;
  const eW=(eye.geometry.boundingBox.max.x-eye.geometry.boundingBox.min.x)/s;
  check(u+' 连杆等宽长条（杆身=端环='+P.print.linkWidth+'）',Math.abs(wW-P.print.linkWidth)<0.05&&Math.abs(eW-P.print.linkWidth)<0.05,
    '杆身'+f1(wW)+' / 端环'+f1(eW)+'mm');
}
// 几何签名：顶点数+包围盒，用于判定三单元零件可互换
function sig(name){const m=scene.getObjectByName(name);if(!m)return 'MISSING';
  m.geometry.computeBoundingBox();const b=m.geometry.boundingBox;
  return m.geometry.attributes.position.count+'|'+[b.max.x-b.min.x,b.max.y-b.min.y,b.max.z-b.min.z].map(x=>x.toFixed(4)).join(',');}
const pairs=[['p1SleeveBody','p2SleeveBody'],['m1ClevisPlateL','m2ClevisPlateL'],['t1TendonWeb','t2TendonWeb'],
  ['m1CollarRing','m2CollarRing'],['p1EarBaseL','palmEarBaseL'],['p1DClevisArmL','p2DClevisArmL'],
  ['p1BodyWaist','p2BodyWaist'],['p1BodyHeel','p2BodyHeel'],['p1BodyDistal','p2BodyDistal'],
  ['p1SleeveHub','p2SleeveHub'],['p1FlangePlate','p2FlangePlate'],['t1TendonEyeB','t2TendonEyeB']];
for(const [a,b] of pairs){
  check('可互换：'+a+' ≡ '+b,sig(a)===sig(b),sig(a)===sig(b)?'几何签名一致':'签名不同 '+sig(a)+' vs '+sig(b));
}

// ---------- 4. 拆装通道（0/45/90° × 三单元，用世界网格做点内测试） ----------
const allMeshes=[];
scene.traverse(o=>{if(o.isMesh&&o.name){let inBody=false;for(let p=o;p;p=p.parent)if(p.name==='bodyOutline')inBody=true;if(!inBody)allMeshes.push(o);}});
function probeMesh(m){const t=new THREE.Mesh(m.geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));t.matrixWorld.copy(m.matrixWorld);t.matrixAutoUpdate=false;return t;}
function inAnySolid(x,y,z,exclude){
  const dirs=[[0.31,-0.77,0.55],[-0.62,0.19,0.76],[0.55,0.61,-0.57]];
  for(const m of allMeshes){
    if(exclude&&exclude.test(m.name))continue;
    const t=probeMesh(m);let votes=0;
    for(const d of dirs){rc.set(new THREE.Vector3(x*s,y*s,z*s),new THREE.Vector3(...d));
      const hits=rc.intersectObject(t,false).filter(h=>h.distance>1e-4);
      if(hits.length%2===1)votes++;}
    if(votes>=2)return m.name;
  }
  return null;
}
function channelZ(x,y,r,z0,z1,exclude,step){
  step=step||3;
  const ring=[[0,0],[r,0],[-r,0],[0,r],[0,-r],[r*0.7,r*0.7],[-r*0.7,r*0.7],[r*0.7,-r*0.7],[-r*0.7,-r*0.7]];
  for(let z=Math.min(z0,z1);z<=Math.max(z0,z1);z+=step)
    for(const [dx,dy] of ring){const hit=inAnySolid(x+dx,y+dy,z,exclude);if(hit)return{at:[+(x+dx).toFixed(1),+(y+dy).toFixed(1),+z.toFixed(1)],mesh:hit};}
  return null;
}
function channelY(x,z,r,y0,y1,exclude,step){
  step=step||4;
  const ring=[[0,0],[r,0],[-r,0],[0,r],[0,-r]];
  for(let y=Math.min(y0,y1);y<=Math.max(y0,y1);y+=step)
    for(const [dx,dz] of ring){const hit=inAnySolid(x+dx,y,      z+dz,exclude);if(hit)return{at:[+(x+dx).toFixed(1),+y.toFixed(1),+(z+dz).toFixed(1)],mesh:hit};}
  return null;
}
const pr=P.print;
for(const deg of [0,45,90]){
  const d2=Math.min(deg,70);
  // 三个单元：单元k 的 Ok/Bk/Dk（世界坐标全部由 getJoints 给出）
  api.updateMechanism(deg,deg,d2);scene.updateMatrixWorld(true);
  const J=api.getJoints(deg,deg,d2);
  const sets=[
    {tag:'单元0 O0',c:J.O0,bolt:pr.boltElbow,side:+1,ex:/o0Bolt/},
    {tag:'单元0 B0',c:J.B0,bolt:pr.boltB,side:-1,ex:/m0bBolt/},
    {tag:'单元0 D0',c:J.D0,bolt:pr.boltD,side:-1,ex:/p1dBolt/},
    {tag:'单元1 O1',c:J.O1,bolt:pr.boltElbow,side:+1,ex:/o1Bolt/},
    {tag:'单元1 B1',c:J.B1,bolt:pr.boltB,side:-1,ex:/m1bBolt/},
    {tag:'单元1 D1',c:J.D1,bolt:pr.boltD,side:-1,ex:/p2dBolt/},
    {tag:'单元2 O2',c:J.O2,bolt:pr.boltElbow,side:+1,ex:/o2Bolt/},
    {tag:'单元2 B2',c:J.B2,bolt:pr.boltB,side:-1,ex:/m2bBolt/},
    {tag:'单元2 D2',c:J.D2,bolt:pr.boltD,side:-1,ex:/p3dBolt/},
  ];
  for(const s of sets){
    const nutZ=s.bolt.shoulder/2+1.6+s.bolt.nutH;
    const from=s.side>0?(nutZ+1):-(nutZ+1), to=s.side>0?(nutZ+1+30):-(nutZ+1+30);
    const h=channelZ(s.c.x,s.c.y,s.bolt.nutAF/2+2,from,to,s.ex);
    check(deg+'° '+s.tag+' 螺母侧工具通道',!h,h?('被'+h.mesh+'阻挡@'+h.at):'');
  }
}
// 电机抽出手通道（两电机，沿各自指节的局部-y方向，用世界射线近似：竖直向上/沿指节轴）
api.updateMechanism(0,0,0);scene.updateMatrixWorld(true);
{
  // 零位姿态下三个电机的局部 +y 均与世界上方一致（各段未旋转），基址=各段原点世界 y
  const bases=[[0,'m0'],[ -P.phalanx1Len,'m1'],[-(P.phalanx1Len+P.phalanx2Len),'m2']];
  bases.forEach(([base,u],i)=>{
    const y0=base+P.motorMountY+P.motorRearOverhang+0.5;
    const h=channelY(P.motorMountX,0,15.5,y0,y0+30,new RegExp('^'+u+'Motor'));
    check('电机'+i+' 轴向抽出通道(Ø31)',!h,h?('被'+h.mesh+'阻挡@'+h.at):'');
  });
}
// 永久连接检查
check('全机无铆接/胶接永久连接',!allMeshes.some(m=>/rivet|glue|weld/i.test(m.name)),allMeshes.length+'个实体网格');
// 三单元紧固件齐套
for(const u of ['m0','m1','m2']){for(const p of ['bBoltHead','bBoltShank','bBoltNut','RodNut'])check(u+' '+p+' 在位',!!scene.getObjectByName(u+p),'');}
for(const u of ['o0','o1','o2','p1d','p2d','p3d']){for(const p of ['BoltHead','BoltShank','BoltNut'])check(u+' '+p+' 在位',!!scene.getObjectByName(u+p),'');}

const pass=checks.filter(c=>c.pass).length;
console.log('=== 三节手指 打印适配性 + 可拆装性校验 ===');
for(const c of checks) console.log((c.pass?'  PASS  ':'  FAIL  ')+c.name+(c.detail?('  ('+c.detail+')'):''));
console.log('\n通过 '+pass+'/'+checks.length);
fs.writeFileSync(path.join(root,'finger_print_report.json'),JSON.stringify({
  version:'finger-v7-three-unit-print',pass,total:checks.length,checks},null,2)+'\n');
if(pass!==checks.length)process.exitCode=1;
