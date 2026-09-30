'use strict';
// 从HTML中提取每个零件的Three.js网格，导出为二进制STL（单位mm，各零件按打印姿态摆放）。
// 用法: node export_print_stl.cjs [--all|--part=name]
const fs=require('fs'),path=require('path');
const THREE=require('./.verification/three-r128.cjs');
const root=__dirname,html=fs.readFileSync(path.join(root,'arm_mechanism_3d.html'),'utf8');
const script=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes('const P ='))[1];
const nodes=new Map(),document={getElementById(id){if(!nodes.has(id))nodes.set(id,{});return nodes.get(id);}};
const main=script.slice(0,script.lastIndexOf('\ninitScene();'));
const api=new Function('THREE','document',main+'\nscene=new THREE.Scene();showLabels=false;buildMechanism();updateMechanism(0);return {P,s,scene,updateMechanism};')(THREE,document);
const {P,s,scene}=api;
scene.updateMatrixWorld(true);

// v4一体化打印分组（24打印件 → 10打印件 + 3标准肩铆钉）
// 同一刚性子总成里属于同一打印件的网格合并；铆钉为外购标准件单独成档
const PRINTS={
  upperArmProximal:['upperArmBodyProximal','shoulder','upperArmPSplicePadTop','upperArmPSplicePadBottom','upperArmPSplicePadTopFoot','upperArmPSplicePadBottomFoot'],
  upperArmDistal:['upperArmBodyDistal','elbowEarBaseLeft','elbowYokeWebLeft','elbowEarBaseRight','elbowYokeWebRight','elbowForkLeft','elbowForkLeftRib','elbowForkRight','elbowForkRightRib','upperArmDSplicePadTop','upperArmDSplicePadBottom'],
  forearmProximal:['forearmBodyProximal','elbowSleeveBody','dClevisBridge','dClevisEarLeft','dClevisEarLeftBoss','dClevisEarRight','dClevisEarRightBoss','forearmPSplicePadTop','forearmPSplicePadBottom'],
  forearmDistal:['forearmBodyDistal','endFlange','forearmDSplicePadTop','forearmDSplicePadBottom','forearmDSplicePadTopFoot','forearmDSplicePadBottomFoot'],
  motorSaddle:['saddleRingUpper','saddleRingLower','saddleSpine','saddleSpineRib'],
  rodClevis:['bClevisBridge','bClevisEarLeft','bClevisEarRight'],
  linkBD:['tendonWeb','tendonEyeB','tendonEyeD'],
  rivetElbow:['elbowRivetHead','elbowRivetShank','elbowRivetTail'],
  rivetB:['bRivetHead','bRivetShank','bRivetTail'],
  rivetD:['dRivetHead','dRivetShank','dRivetTail'],
};
// 外购/标准件分类（写入index.json，与打印件区分）
const PURCHASED=new Set(['rivetElbow','rivetB','rivetD']);
const fasteners=[];
scene.traverse(o=>{if(o.isMesh)fasteners.push(o.name);});
const skipRe=/SpliceBolt|SpliceBoltHead|SpliceBoltNut|saddleBolt/;

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
    // 过滤零面积（退化）三角形，避免切片器报警
    const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];
    const nx=uy*vz-uz*vy, ny=uz*vx-ux*vz, nz=ux*vy-uy*vx;
    if(Math.hypot(nx,ny,nz)*0.5<1e-10) continue;
    tris.push([a,b,c]);
  }
  return tris;
}
// 世界坐标 -> mm（场景中乘了s），并平移到以包围盒中心为原点、置于Z=0基面
function toPrintMM(tris){
  let minv=[1e9,1e9,1e9],maxv=[-1e9,-1e9,-1e9];
  for(const t of tris)for(const v of t)for(let k=0;k<3;k++){minv[k]=Math.min(minv[k],v[k]);maxv[k]=Math.max(maxv[k],v[k]);}
  const out=[];
  for(const t of tris) out.push(t.map(v=>[(v[0]/s), (v[1]/s), (v[2]/s)]));
  return out;
}

const outDir=path.join(root,'stl'); fs.mkdirSync(outDir,{recursive:true});
const index=[];
for(const [part,names] of Object.entries(PRINTS)){
  let tris=[];
  for(const nm of names){
    const m=scene.getObjectByName(nm);
    if(!m){ console.log('MISSING', nm); continue; }
    tris=tris.concat(meshTriangles(m));
  }
  if(!tris.length) continue;
  const mm=toPrintMM(tris);
  // 统计打印姿态包围盒
  let mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];
  for(const t of mm)for(const v of t)for(let k=0;k<3;k++){mn[k]=Math.min(mn[k],v[k]);mx[k]=Math.max(mx[k],v[k]);}
  const size=[mx[0]-mn[0],mx[1]-mn[1],mx[2]-mn[2]];
  fs.writeFileSync(path.join(outDir,part+'.stl'), stlBinary(mm));
  index.push({part,kind:PURCHASED.has(part)?'purchased_rivet':'printed',triangles:mm.length/1,bounding_box_mm:size.map(x=>+x.toFixed(2)),source_meshes:names});
}
fs.writeFileSync(path.join(outDir,'index.json'),JSON.stringify({unit:'mm',model:'robot_arm print-ready v4-integrated',generated_from:'arm_mechanism_3d.html',note:'每个STL为一个独立零件（kind=printed为打印件，purchased_rivet为外购标准肩铆钉），单位mm，坐标为模型空间（铆钉孔轴=Z）。打印时保持Z为竖直方向。',parts:index},null,2)+'\n');
console.log('导出零件数:',index.length,'（打印件',index.filter(p=>p.kind==='printed').length,'+ 外购肩铆钉',index.filter(p=>p.kind==='purchased_rivet').length+'）');
for(const p of index) console.log(' ',p.part.padEnd(20), '['+p.kind+']', p.bounding_box_mm.join(' x '), 'mm');
console.log('合计三角面:', index.length);
