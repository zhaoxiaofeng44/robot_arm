'use strict';
// v4一体化打印适配性校验（世界系射线测量，孔心由节点世界矩阵求出，不假设局部原点）
//  - 通孔：沿孔轴(局部Z)从孔心外投射应无命中
//  - 孔径：孔心高度沿径向16方向投射，首个命中距离=孔半径
//  - 孔口45°导入倒角：孔壁外侧0.35mm处竖直投射，首个命中面法线z≈0.707（Lathe成型件）
//  - 壁厚：孔壁外侧沿径向16方向投射的最小实体厚度
//  - 幅面：打印件最小外接正方形（含45°斜排）≤220mm
//  - 一体化：同一打印件内网格三角面连通（重心近邻并查集）
const fs=require('fs'),path=require('path');
const THREE=require('./.verification/three-r128.cjs');
const root=__dirname,html=fs.readFileSync(path.join(root,'arm_mechanism_3d.html'),'utf8');
const script=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes('const P ='))[1];
const nodes=new Map(),document={getElementById(id){if(!nodes.has(id))nodes.set(id,{});return nodes.get(id);}};
const main=script.slice(0,script.lastIndexOf('\ninitScene();'));
const api=new Function('THREE','document',main+'\nscene=new THREE.Scene();showLabels=false;buildMechanism();updateMechanism(0);return {P,s,scene};')(THREE,document);
const {P,s,scene}=api; scene.updateMatrixWorld(true);
const rc=new THREE.Raycaster(); rc.far=1e6;

// 世界系探针：复制世界矩阵，双面临时网格保证从实体内部也能检出出射面
function probe(meshName){
  const m=scene.getObjectByName(meshName);
  if(!m) throw new Error('missing mesh '+meshName);
  const t=new THREE.Mesh(m.geometry, new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
  t.matrixWorld.copy(m.matrixWorld);
  t.matrixAutoUpdate=false;
  return t;
}
// 零件局部原点（=孔心）的世界坐标，单位mm
function centerMM(t){ const v=new THREE.Vector3(0,0,0).applyMatrix4(t.matrixWorld); return [v.x/s, v.y/s, v.z/s]; }
function cast(t, oxMM, oyMM, ozMM, dx, dy, dz){
  rc.set(new THREE.Vector3(oxMM*s,oyMM*s,ozMM*s), new THREE.Vector3(dx,dy,dz).normalize());
  return rc.intersectObject(t,false);
}
// 通孔：沿孔轴±从孔心上方/下方远处投射，都应无命中（真通孔）
function throughHole(meshName){
  const t=probe(meshName), [cx,cy,cz]=centerMM(t);
  return cast(t,cx,cy,cz+200,0,0,-1).length + cast(t,cx,cy,cz-200,0,0,1).length;
}
// 孔半径：从孔心沿径向16方向投射（孔心高度），首个命中=孔壁，取最小值
function boreRadius(meshName){
  const t=probe(meshName), [cx,cy,cz]=centerMM(t);
  let r=Infinity;
  for(let k=0;k<16;k++){
    const a=2*Math.PI*k/16;
    const h=cast(t,cx,cy,cz,Math.cos(a),Math.sin(a),0);
    if(h.length) r=Math.min(r,h[0].distance/s);
  }
  return r;
}
// 孔口45°导入倒角：在孔壁外0.35mm处从零件上方竖直投射，命中斜面与孔轴夹角应为45°
// （返回|法线z分量|：Lathe绕向决定符号，45°锥面的|n.z|=cos45°≈0.707）
function chamferNormalZ(meshName){
  const t=probe(meshName), [cx,cy,cz]=centerMM(t);
  const boreR=boreRadius(meshName);
  const h=cast(t,cx+(boreR+0.35),cy,cz+40,0,0,-1);
  if(!h.length) return NaN;
  const n=h[0].face.normal.clone().transformDirection(t.matrixWorld);
  return Math.abs(n.z);
}
// 壁厚：孔壁外0.02mm沿径向16方向投射，命中零件外表面的最小距离
function wallThickness(meshName){
  const t=probe(meshName), [cx,cy,cz]=centerMM(t);
  const boreR=boreRadius(meshName), eps=0.02;
  let worst=Infinity;
  for(let k=0;k<16;k++){
    const a=2*Math.PI*k/16, dx=Math.cos(a), dy=Math.sin(a);
    const h=cast(t,cx+(boreR+eps)*dx,cy+(boreR+eps)*dy,cz,dx,dy,0);
    if(h.length) worst=Math.min(worst,h[0].distance/s+eps);
  }
  return worst;
}
const checks=[];
function check(name, ok, detail){ checks.push({name, pass:!!ok, detail}); }
const f1=x=>x.toFixed(2), f2=x=>x.toFixed(3);

// ============ 1. O肘：一体化叉耳凸台打印直孔（无衬套） ============
const boreRO=P.boreElbow/2, boreRL=P.boreLink/2;
check('O耳凸台Ø'+P.boreElbow.toFixed(1)+'通孔（无衬套）', throughHole('elbowForkLeft')===0, '射线沿孔轴穿孔心无阻挡');
check('O耳凸台孔径实测', Math.abs(2*boreRadius('elbowForkLeft')-P.boreElbow)<0.2,
  '实测Ø'+f1(2*boreRadius('elbowForkLeft'))+'，期望Ø'+P.boreElbow.toFixed(1));
check('O耳孔壁厚≥'+P.print.wallMin+'mm', wallThickness('elbowForkLeft')>=P.print.wallMin-0.05,
  '实测'+f1(wallThickness('elbowForkLeft'))+'mm（凸台r10-孔r'+f1(boreRO)+'）');

// ============ 2. 前臂一体化肘轴套（整体更换件，Lathe成型带倒角） ============
check('肘轴套Ø'+P.boreElbow.toFixed(1)+'通孔', throughHole('elbowSleeveBody')===0, '');
check('肘轴套孔径实测', Math.abs(2*boreRadius('elbowSleeveBody')-P.boreElbow)<0.2, '实测Ø'+f1(2*boreRadius('elbowSleeveBody')));
check('肘轴套孔口45°导入倒角', Math.abs(chamferNormalZ('elbowSleeveBody')-0.707)<0.09,
  '命中斜面|n.z|='+f2(chamferNormalZ('elbowSleeveBody'))+'（理想0.707=45°锥面）');
check('肘轴套壁厚≥'+P.print.wallMin+'mm', wallThickness('elbowSleeveBody')>=P.print.wallMin-0.05,
  '实测'+f1(wallThickness('elbowSleeveBody'))+'mm（r11-r'+f1(boreRO)+'）');

// ============ 3. B/D一体化叉耳 + 连杆环形眼 ============
check('B叉耳Ø'+P.boreLink.toFixed(1)+'通孔', throughHole('bClevisEarLeft')===0, '');
check('D叉耳凸台Ø'+P.boreLink.toFixed(1)+'通孔', throughHole('dClevisEarLeftBoss')===0, '');
check('连杆B眼通孔', throughHole('tendonEyeB')===0, '');
check('连杆D眼通孔', throughHole('tendonEyeD')===0, '');
for(const m of ['tendonEyeB','tendonEyeD']){
  check(m+' 孔口45°导入倒角', Math.abs(chamferNormalZ(m)-0.707)<0.09, '斜面|n.z|='+f2(chamferNormalZ(m)));
}
check('B/D孔径单边间隙', Math.abs(boreRL-P.linkPinRadius-P.print.radialClearance)<1e-6,
  'Ø'+P.boreLink.toFixed(1)+'孔配Ø'+(2*P.linkPinRadius)+'铆钉 → 单边'+P.print.radialClearance+'mm');
for(const lbl of ['B叉耳','D叉耳凸台','连杆B眼','连杆D眼']){
  const mesh={'B叉耳':'bClevisEarLeft','D叉耳凸台':'dClevisEarLeftBoss','连杆B眼':'tendonEyeB','连杆D眼':'tendonEyeD'}[lbl];
  check(lbl+'孔壁厚≥'+P.print.wallMin+'mm', wallThickness(mesh)>=P.print.wallMin-0.05, '实测'+f1(wallThickness(mesh))+'mm');
}

// ============ 4. 一体化连通性：同一打印件内实体相连 ============
// 判据：体积重叠 或 面接触（表面最小距离≈0）——切片器对二者都会熔合为单一实体。
// 表面距离用空间栅格加速的三角形最近点测试，阈值 contactTol=0.05mm。
function worldTris(meshName){
  const m=scene.getObjectByName(meshName); if(!m) throw new Error('missing '+meshName);
  const pos=m.geometry.attributes.position, idx=m.geometry.index, mw=m.matrixWorld;
  const n=idx?idx.count:pos.count, tris=[];
  for(let t=0;t<n;t+=3){
    const v=[];
    for(const i of [idx?idx.getX(t):t, idx?idx.getX(t+1):t+1, idx?idx.getX(t+2):t+2]){
      const p=new THREE.Vector3(pos.getX(i),pos.getY(i),pos.getZ(i)).applyMatrix4(mw);
      v.push([p.x/s,p.y/s,p.z/s]);
    }
    tris.push(v);
  }
  return tris;
}
// 点到三角形最近距离（世界系，mm）
function pointTriDist(p, tri){
  const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
  const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  const A=tri[0],B=tri[1],C=tri[2];
  const ab=sub(B,A),ac=sub(C,A),ap=sub(p,A);
  const d1=dot(ab,ap),d2=dot(ac,ap);
  if(d1<=0&&d2<=0) return Math.hypot(...sub(p,A));
  const bp=sub(p,B),d3=dot(ab,bp),d4=dot(ac,bp);
  if(d3>=0&&d4<=d3) return Math.hypot(...sub(p,B));
  const vc=d1*d4-d3*d2;
  if(vc<=0&&d1>=0&&d3<=0){ const v=d1/(d1-d3); return Math.hypot(p[0]-A[0]-ab[0]*v,p[1]-A[1]-ab[1]*v,p[2]-A[2]-ab[2]*v); }
  const cp=sub(p,C),d5=dot(ab,cp),d6=dot(ac,cp);
  if(d6>=0&&d5<=d6) return Math.hypot(...sub(p,C));
  const vb=d5*d2-d1*d6;
  if(vb<=0&&d2>=0&&d6<=0){ const w=d2/(d2-d6); return Math.hypot(p[0]-A[0]-ac[0]*w,p[1]-A[1]-ac[1]*w,p[2]-A[2]-ac[2]*w); }
  const va=d3*d6-d5*d4;
  if(va<=0&&(d4-d3)>=0&&(d5-d6)>=0){ const w=(d4-d3)/((d4-d3)+(d5-d6)); return Math.hypot(p[0]-B[0]-(C[0]-B[0])*w,p[1]-B[1]-(C[1]-B[1])*w,p[2]-B[2]-(C[2]-B[2])*w); }
  const denom=1/(va+vb+vc), v=vb*denom, w=vc*denom;
  const cx=A[0]+ab[0]*v+ac[0]*w, cy=A[1]+ab[1]*v+ac[1]*w, cz=A[2]+ab[2]*v+ac[2]*w;
  return Math.hypot(p[0]-cx,p[1]-cy,p[2]-cz);
}
// 两个网格的表面最小距离（栅格剪枝：只查目标三角形AABB邻域）
const triGridCache=new Map();
function buildGrid(tris, cell){
  const grid=new Map();
  tris.forEach((tri,i)=>{
    const xs=tri.flatMap(v=>[v[0]]), ys=tri.flatMap(v=>[v[1]]), zs=tri.flatMap(v=>[v[2]]);
    const b=[Math.min(...xs),Math.max(...xs),Math.min(...ys),Math.max(...ys),Math.min(...zs),Math.max(...zs)];
    for(let x=Math.floor(b[0]/cell);x<=Math.floor(b[1]/cell);x++)
    for(let y=Math.floor(b[2]/cell);y<=Math.floor(b[3]/cell);y++)
    for(let z=Math.floor(b[4]/cell);z<=Math.floor(b[5]/cell);z++){
      const k=x+','+y+','+z;
      if(!grid.has(k))grid.set(k,[]); grid.get(k).push(i);
    }
  });
  return grid;
}
function surfaceDist(trisA, nameB){
  // 目标：判定"面接触"。逐三角形在邻域格找 <0.05mm 的接触，命中立即返回；
  // 全部未命中 → 一次全量暴力扫描求真实最小距离（仅无接触时走到，代价可接受）
  const trisB=worldTrisCache(nameB);
  const cell=6, grid=buildGrid(trisB,cell);
  for(const tri of trisA){
    const xs=tri.flatMap(v=>[v[0]]), ys=tri.flatMap(v=>[v[1]]), zs=tri.flatMap(v=>[v[2]]);
    const b=[Math.min(...xs),Math.max(...xs),Math.min(...ys),Math.max(...ys),Math.min(...zs),Math.max(...zs)];
    for(let rad=0; rad<=3; rad++){
      let localBest=Infinity;
      const seen=new Set();
      for(let x=Math.floor(b[0]/cell)-rad;x<=Math.floor(b[1]/cell)+rad;x++)
      for(let y=Math.floor(b[2]/cell)-rad;y<=Math.floor(b[3]/cell)+rad;y++)
      for(let z=Math.floor(b[4]/cell)-rad;z<=Math.floor(b[5]/cell)+rad;z++){
        const arr=grid.get(x+','+y+','+z); if(!arr)continue;
        for(const j of arr){ if(seen.has(j))continue; seen.add(j);
          for(const p of tri){ const d=pointTriDist(p,trisB[j]); if(isFinite(d)&&d<localBest) localBest=d; }
        }
      }
      if(isFinite(localBest)){
        if(localBest<0.05) return localBest;   // 找到接触
        break;                                  // 邻域已有确定界（非接触），换下一个源三角形
      }
    }
  }
  // 兜底：全量暴力扫描
  let best=Infinity;
  for(const tri of trisA) for(const tb of trisB) for(const p of tri){
    const d=pointTriDist(p,tb); if(isFinite(d)&&d<best) best=d;
  }
  return best;
}
const _wtCache=new Map();
function worldTrisCache(n){ if(!_wtCache.has(n)) _wtCache.set(n, worldTris(n)); return _wtCache.get(n); }
function pointInMesh(t, xMM, yMM, zMM){
  // 双面材质下：内部点出射仅命中出射面（奇数次），外部穿过命中进+出（偶数次）
  // 3方向投票，≥2票为内部
  const dirs=[[0.31,-0.77,0.55],[-0.62,0.19,0.76],[0.55,0.61,-0.57]];
  let inCount=0;
  for(const d of dirs){
    rc.set(new THREE.Vector3(xMM*s,yMM*s,zMM*s), new THREE.Vector3(...d));
    const hits=rc.intersectObject(t,false).filter(h=>h.distance>1e-4);
    if(hits.length%2===1) inCount++;
  }
  return inCount>=2;
}
function volOverlapDir(nameA, nameB){
  const tB=probe(nameB);
  const mA=scene.getObjectByName(nameA);
  const pos=mA.geometry.attributes.position, idx=mA.geometry.index, mw=mA.matrixWorld;
  const n=idx?idx.count:pos.count, e=mw.elements;
  const step=Math.max(1,Math.floor(n/3/150));
  for(let t=0;t<n;t+=3*step){
    const ids=[idx?idx.getX(t):t, idx?idx.getX(t+1):t+1, idx?idx.getX(t+2):t+2];
    let ax=0,ay=0,az=0;
    for(const i of ids){ ax+=pos.getX(i); ay+=pos.getY(i); az+=pos.getZ(i); }
    ax/=3; ay/=3; az/=3;
    const wx=(e[0]*ax+e[4]*ay+e[8]*az+e[12])/s, wy=(e[1]*ax+e[5]*ay+e[9]*az+e[13])/s, wz=(e[2]*ax+e[6]*ay+e[10]*az+e[14])/s;
    if(pointInMesh(tB,wx,wy,wz)) return true;
  }
  return false;
}
function partsConnected(nameA, nameB){
  // 快路径：体积重叠（双向射线奇偶采样）；慢路径：表面距离≈0（面接触）
  if(volOverlapDir(nameA,nameB) || volOverlapDir(nameB,nameA)) return true;
  const d1=surfaceDist(worldTrisCache(nameA), nameB);
  if(d1<0.05) return true;
  const d2=surfaceDist(worldTrisCache(nameB), nameA);
  return d2<0.05;
}
function componentCount(meshNames){
  const parent=meshNames.map((_,i)=>i);
  const find=x=>parent[x]===x?x:(parent[x]=find(parent[x]));
  for(let i=0;i<meshNames.length;i++)for(let j=i+1;j<meshNames.length;j++){
    if(partsConnected(meshNames[i],meshNames[j])) parent[find(i)]=find(j);
  }
  return new Set(meshNames.map((_,i)=>find(i))).size;
}
const integChecks=[
  ['upperArmDistal 一体化（耳片+叉桥+臂身连通）',['upperArmBodyDistal','elbowEarBaseLeft','elbowYokeWebLeft','elbowEarBaseRight','elbowYokeWebRight','elbowForkLeft','elbowForkLeftRib','elbowForkRight','elbowForkRightRib','upperArmDSplicePadTop','upperArmDSplicePadBottom']],
  ['forearmProximal 一体化（臂身+肘轴套+D叉耳连通）',['forearmBodyProximal','elbowSleeveBody','dClevisBridge','dClevisEarLeft','dClevisEarLeftBoss','dClevisEarRight','dClevisEarRightBoss','forearmPSplicePadTop','forearmPSplicePadBottom']],
  ['motorSaddle 一体化（双环+脊板连通）',['saddleRingUpper','saddleRingLower','saddleSpine','saddleSpineRib']],
  ['upperArmProximal 一体化（臂身+肩座+拼接凸台连通）',['upperArmBodyProximal','shoulder','upperArmPSplicePadTop','upperArmPSplicePadBottom','upperArmPSplicePadTopFoot','upperArmPSplicePadBottomFoot']],
  ['forearmDistal 一体化（臂身+末端法兰+拼接凸台连通）',['forearmBodyDistal','endFlange','forearmDSplicePadTop','forearmDSplicePadBottom','forearmDSplicePadTopFoot','forearmDSplicePadBottomFoot']],
];
for(const [lbl,names] of integChecks){
  const comp=componentCount(names);
  check(lbl, comp===1, '实体连通分量='+comp+'（应为1）');
}

// ============ 5. STL 幅面：最小外接正方形（含45°斜排） ============
const stlDir=path.join(root,'stl');
if(fs.existsSync(path.join(stlDir,'index.json'))){
  const idx=JSON.parse(fs.readFileSync(path.join(stlDir,'index.json'),'utf8'));
  const BED=220;
  let worst=null, worstSz=0;
  for(const p of idx.parts){
    if(p.kind!=='printed') continue;
    const [w,l]=p.bounding_box_mm;
    const diag=(w+l)/Math.SQRT2;      // 45°斜排时占地
    const fit=Math.min(Math.max(w,l), diag);
    if(fit>worstSz){ worstSz=fit; worst=p; }
  }
  check('打印件45°斜排最小外接正方形≤'+BED+'mm', worstSz<=BED,
    '最差 '+worst.part+' '+worstSz.toFixed(1)+'mm（直排'+Math.max(...worst.bounding_box_mm.slice(0,2)).toFixed(0)+'mm）');
}

const pass=checks.filter(c=>c.pass).length;
console.log('=== 3D打印适配性校验 v4一体化 ===');
for(const c of checks) console.log((c.pass?'  PASS  ':'  FAIL  ')+c.name+(c.detail?('  ('+c.detail+')'):''));
console.log('\n通过 '+pass+'/'+checks.length);
if(pass!==checks.length){ process.exitCode=1; }
