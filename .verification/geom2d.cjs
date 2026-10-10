'use strict';
// 机构校验公共几何库（verify_finger.cjs / verify_hand.cjs / render_* 共用）
//   2D 凸包 + 凸多边形裁剪(SAT/半平面) + 投影 + 宽相位网格 + 3D 线段间距
const THREE = require('./three-r128.cjs');

const cross = (a,b,c) => (b[0]-a[0])*(c[1]-a[1]) - (b[1]-a[1])*(c[0]-a[0]);
function hull(points){
  const p=[...new Map(points.map(v=>[v.map(x=>(+x).toFixed(9)).join(','),v])).values()]
    .sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  if(p.length<3)return p;
  const lo=[],hi=[];
  for(const v of p){ while(lo.length>1&&cross(lo.at(-2),lo.at(-1),v)<=1e-10)lo.pop(); lo.push(v); }
  for(const v of p.slice().reverse()){ while(hi.length>1&&cross(hi.at(-2),hi.at(-1),v)<=1e-10)hi.pop(); hi.push(v); }
  return lo.slice(0,-1).concat(hi.slice(0,-1));
}
function clip(a,b){
  let out=a;
  for(let j=0;j<b.length&&out.length;j++){
    const q=b[j], r=b[(j+1)%b.length], input=out; out=[];
    for(let i=0;i<input.length;i++){
      const u=input[i], v=input[(i+1)%input.length];
      const cu=cross(q,r,u), cv=cross(q,r,v), iu=cu>=-1e-8, iv=cv>=-1e-8;
      if(iu)out.push(u);
      if(iu!==iv){ const t=cu/(cu-cv); out.push([u[0]+t*(v[0]-u[0]), u[1]+t*(v[1]-u[1])]); }
    }
  }
  return out;
}
const area = p => Math.abs(p.reduce((a,v,i)=>{const w=p[(i+1)%p.length];return a+v[0]*w[1]-v[1]*w[0];},0))/2;
function pointSeg(p,a,b){
  const dx=b[0]-a[0], dy=b[1]-a[1], d=dx*dx+dy*dy;
  const t = d ? Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/d)) : 0;
  return Math.hypot(p[0]-a[0]-t*dx, p[1]-a[1]-t*dy);
}
function polyDist(a,b){
  let d=Infinity;
  for(const [p,q] of [[a,b],[b,a]]) for(const v of p) for(let i=0;i<q.length;i++) d=Math.min(d,pointSeg(v,q[i],q[(i+1)%q.length]));
  return d;
}
// 网格 → 可重复投影的预计算结构（局部顶点、XY 凸包、圆形近似）
function prepare(mesh, scale, assembly){
  const g=mesh.geometry, a=g.attributes.position;
  const local=[...new Map(Array.from({length:a.count},(_,i)=>[a.getX(i),a.getY(i),a.getZ(i)])
    .map(p=>[p.join(','),p])).values()];
  const hull2=hull(local.map(p=>[p[0],p[1]]));
  let circle=null;
  if(g.type==='SphereGeometry'||g.type==='CylinderGeometry'){
    const r=(g.parameters.radius!==undefined?g.parameters.radius:g.parameters.radiusTop||0)/scale;
    if(r>0) circle={ r:r/Math.cos(Math.PI/32) };
  }
  return { mesh, assembly, scale, local, hull2, circle };
}
// 世界系投影：XY 凸包（mm）+ z 范围
function project(pr){
  const s=pr.scale, e=pr.mesh.matrixWorld.elements;
  const cx=e[12]/s, cy=e[13]/s;
  let xy;
  if(pr.circle && Math.abs(e[6])>0.9){
    const r=pr.circle.r;
    xy=Array.from({length:24},(_,i)=>[cx+r*Math.cos(2*Math.PI*i/24), cy+r*Math.sin(2*Math.PI*i/24)]);
  } else {
    const mapped=pr.hull2.map(p=>[
      (e[0]*p[0]+e[4]*p[1]+e[8]*(p[2]||0)+e[12])/s,
      (e[1]*p[0]+e[5]*p[1]+e[9]*(p[2]||0)+e[13])/s,
    ]);
    xy=hull(mapped);
  }
  let zmin=Infinity, zmax=-Infinity;
  for(const p of pr.local){
    const z=(e[2]*p[0]+e[6]*p[1]+e[10]*p[2]+e[14])/s;
    zmin=Math.min(zmin,z); zmax=Math.max(zmax,z);
  }
  return { name:pr.mesh.name, assembly:pr.assembly, xy, zmin, zmax };
}
// 宽相位：投影包围盒落在同一网格单元内的零件对
function broadPairs(shapes, cell){
  cell=cell||40;
  const grid=new Map();
  const bb=shapes.map(sh=>{
    let mnx=Infinity,mxx=-Infinity,mny=Infinity,mxy=-Infinity;
    for(const p of sh.xy){ mnx=Math.min(mnx,p[0]);mxx=Math.max(mxx,p[0]);mny=Math.min(mny,p[1]);mxy=Math.max(mxy,p[1]); }
    return {mnx,mxx,mny,mxy};
  });
  for(let i=0;i<shapes.length;i++){
    const g=bb[i];
    if(!isFinite(g.mnx))continue;
    for(let gx=Math.floor(g.mnx/cell);gx<=Math.floor(g.mxx/cell);gx++)
      for(let gy=Math.floor(g.mny/cell);gy<=Math.floor(g.mxy/cell);gy++){
        const k=gx+','+gy; let a=grid.get(k); if(!a){a=[];grid.set(k,a);} a.push(i);
      }
  }
  const seen=new Set(), out=[];
  for(const arr of grid.values()){
    for(let i=0;i<arr.length;i++)for(let j=i+1;j<arr.length;j++){
      const a=arr[i], b=arr[j];
      const k=a<b?(a*1000000+b):(b*1000000+a);
      if(seen.has(k))continue; seen.add(k); out.push([a,b]);
    }
  }
  return out;
}
// 3D 两线段最短距离（用于电机轴线间距）
function segSeg3(p1,q1,p2,q2){
  const d1=[q1[0]-p1[0],q1[1]-p1[1],q1[2]-p1[2]], d2=[q2[0]-p2[0],q2[1]-p2[1],q2[2]-p2[2]];
  const r=[p1[0]-p2[0],p1[1]-p2[1],p1[2]-p2[2]];
  const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  const a=dot(d1,d1), b=dot(d1,d2), c=dot(d2,d2), d=dot(d1,r), e=dot(d2,r), D=a*c-b*b;
  let sc,tc;
  if(D<1e-9){ sc=0; tc=(b>c?d/b:e/c); } else { sc=(b*e-c*d)/D; tc=(a*e-b*d)/D; }
  sc=Math.max(0,Math.min(1,sc)); tc=Math.max(0,Math.min(1,tc));
  return Math.hypot(p1[0]+d1[0]*sc-(p2[0]+d2[0]*tc), p1[1]+d1[1]*sc-(p2[1]+d2[1]*tc), p1[2]+d1[2]*sc-(p2[2]+d2[2]*tc));
}

// ---------- 精确实体相交（区分"真实碰撞"与"包绕/嵌套"）----------
// 仅靠 2D 投影凸包会把"指节包住电机"这类合法嵌套判成干涉；
// 这里对候选对做真正的 3D 点内测试（+X 射线奇偶），只有存在"同时在两实体内"的采样点才判干涉。
function makeSolid(mesh, scale){
  const g=mesh.geometry, a=g.attributes.position, idx=g.index;
  const n=idx?idx.count:a.count;
  const verts=new Float64Array(a.count*3);
  const v=new THREE.Vector3();
  for(let i=0;i<a.count;i++){
    v.set(a.getX(i),a.getY(i),a.getZ(i)).applyMatrix4(mesh.matrixWorld).multiplyScalar(1/scale);
    verts[i*3]=v.x; verts[i*3+1]=v.y; verts[i*3+2]=v.z;
  }
  const tris=new Int32Array(n);
  for(let t=0;t<n;t++) tris[t]=idx?idx.getX(t):t;
  let mnx=Infinity,mny=Infinity,mnz=Infinity,mxx=-Infinity,mxy=-Infinity,mxz=-Infinity;
  for(let i=0;i<a.count;i++){
    const x=verts[i*3],y=verts[i*3+1],z=verts[i*3+2];
    if(x<mnx)mnx=x; if(x>mxx)mxx=x; if(y<mny)mny=y; if(y>mxy)mxy=y; if(z<mnz)mnz=z; if(z>mxz)mxz=z;
  }
  return { name:mesh.name, verts, tris, n:verts.length/3, mnx,mny,mnz,mxx,mxy,mxz };
}
function pointInSolid(px,py,pz,s){
  const V=s.verts, T=s.tris, N=s.n;
  let hits=0;
  for(let t=0;t<T.length;t+=3){
    const i0=T[t]*3,i1=T[t+1]*3,i2=T[t+2]*3;
    const ax=V[i0],ay=V[i0+1],az=V[i0+2];
    const bx=V[i1],by=V[i1+1],bz=V[i1+2];
    const cx=V[i2],cy=V[i2+1],cz=V[i2+2];
    const y0=by-ay, z0=bz-az, y1=cy-ay, z1=cz-az;
    const ny=y0*z1-z0*y1; if(ny>-1e-12&&ny<1e-12) continue;
    const sy=py-ay, sz=pz-az;
    const st=sy*z1-sz*y1, tt=sz*y0-sy*z0;
    const uu=ny-(st+tt);
    if(ny>0){ if(st<0||tt<0||uu<0) continue; } else { if(st>0||tt>0||uu>0) continue; }
    const x=ax+(st*(bx-ax)+tt*(cx-ax))/ny;
    if(x>px+1e-9) hits++;
  }
  return (hits&1)===1;
}
// 判断某点是否落在网格 z 范围内（用于 2D 接触点的 z 复核）
function zRangeAt(s, x, y){
  const V=s.verts, T=s.tris, N=s.n;
  let lo=Infinity, hi=-Infinity;
  for(let t=0;t<T.length;t+=3){
    const i0=T[t]*3,i1=T[t+1]*3,i2=T[t+2]*3;
    const ax=V[i0],ay=V[i0+1],az=V[i0+2];
    const bx=V[i1],by=V[i1+1],bz=V[i1+2];
    const cx=V[i2],cy=V[i2+1],cz=V[i2+2];
    const d=(by-ay)*(cx-ax)-(bx-ax)*(cy-ay);
    if(Math.abs(d)<1e-12) continue;
    const w1=((bx-x)*(cy-y)-(cx-x)*(by-y))/d;
    const w2=((cx-x)*(ay-y)-(ax-x)*(cy-y))/d;
    const w0=1-w1-w2;
    if(w0<-1e-9||w1<-1e-9||w2<-1e-9) continue;
    const z=w0*az+w1*bz+w2*cz;
    if(z<lo)lo=z; if(z>hi)hi=z;
  }
  return lo<=hi?[lo,hi]:null;
}
// 在 A 的包围盒内取点（含 A 的顶点），寻找同时位于 A、B 内部的采样点
function solidsIntersect(sa, sb){
  const lo=[sa.mnx,sb.mnx], hi=[sa.mxx,sb.mxx];
  if(lo[0]>hi[1]||lo[1]>hi[0]) return null;
  // 1) A 的顶点中落在 B 包围盒内的
  for(let i=0;i<sa.n;i++){
    const x=sa.verts[i*3],y=sa.verts[i*3+1],z=sa.verts[i*3+2];
    if(x<sb.mnx||x>sb.mxx||y<sb.mny||y>sb.mxy||z<sb.mnz||z>sb.mxz) continue;
    if(pointInSolid(x,y,z,sb)) return [x,y,z];
  }
  // 2) A 包围盒内的规则网格采样
  const NX=4,NY=4,NZ=3;
  for(let i=1;i<NX;i++)for(let j=1;j<NY;j++)for(let k=1;k<NZ;k++){
    const x=sa.mnx+(sa.mxx-sa.mnx)*i/NX, y=sa.mny+(sa.mxy-sa.mny)*j/NY, z=sa.mnz+(sa.mxz-sa.mnz)*k/NZ;
    if(x<sb.mnx||x>sb.mxx||y<sb.mny||y>sb.mxy||z<sb.mnz||z>sb.mxz) continue;
    if(pointInSolid(x,y,z,sa)&&pointInSolid(x,y,z,sb)) return [x,y,z];
  }
  // 3) B 的顶点中落在 A 包围盒内的
  for(let i=0;i<sb.n;i++){
    const x=sb.verts[i*3],y=sb.verts[i*3+1],z=sb.verts[i*3+2];
    if(x<sa.mnx||x>sa.mxx||y<sa.mny||y>sa.mxy||z<sa.mnz||z>sa.mxz) continue;
    if(pointInSolid(x,y,z,sa)) return [x,y,z];
  }
  return null;
}
function bboxOf(s){ return { mnx:s.mnx,mny:s.mny,mnz:s.mnz,mxx:s.mxx,mxy:s.mxy,mxz:s.mxz }; }

// 严格干涉判定：凸包相交只是粗判。在"2D 交集多边形"内取点，用 3D 点内测试
// 判断是否存在"同时在两个实体内"的点 —— 这才是真实的体积重叠。
// 对"整块凸包相交但实际是包绕/嵌套"的零件对返回 null（合法嵌套）。
function convexOverlapPoint(upper, lower, inter, step){
  step=step||1.2;
  let mnx=Infinity,mxx=-Infinity,mny=Infinity,mxy=-Infinity;
  for(const p of inter){ if(p[0]<mnx)mnx=p[0]; if(p[0]>mxx)mxx=p[0]; if(p[1]<mny)mny=p[1]; if(p[1]>mxy)mxy=p[1]; }
  const nx=Math.max(2,Math.min(26,Math.ceil((mxx-mnx)/step)));
  const ny=Math.max(2,Math.min(26,Math.ceil((mxy-mny)/step)));
  const cand=[];
  for(let i=0;i<=nx;i++)for(let j=0;j<=ny;j++){
    const x=mnx+(mxx-mnx)*i/nx, y=mny+(mxy-mny)*j/ny;
    if(pointInPoly(x,y,inter)) cand.push([x,y]);
  }
  for(const p of inter) cand.push(p);
  if(!cand.length) return null;
  const zlo=Math.min(lower.mnz,...cand.map(()=>lower.mnz));
  const zhi=Math.max(lower.mxz,...cand.map(()=>lower.mxz));
  const NZ=Math.max(2,Math.min(20,Math.ceil((zhi-zlo)/step)));
  for(let k=0;k<=NZ;k++){
    const z=zlo+(zhi-zlo)*k/NZ;
    for(let c=0;c<cand.length;c+=1){
      const [x,y]=cand[c];
      if(x<lower.mnx-1e-9||x>lower.mxx+1e-9||y<lower.mny-1e-9||y>lower.mxy+1e-9) continue;
      if(!pointInSolid(x,y,z,lower)) continue;
      if(x<upper.mnx-1e-9||x>upper.mxx+1e-9||y<upper.mny-1e-9||y>upper.mxy+1e-9) continue;
      if(pointInSolid(x,y,z,upper)) return [x,y,z];
    }
  }
  return null;
}
function pointInPoly(x,y,poly){
  let inside=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const xi=poly[i][0], yi=poly[i][1], xj=poly[j][0], yj=poly[j][1];
    if(((yi>y)!==(yj>y)) && (x < (xj-xi)*(y-yi)/(yj-yi)+xi)) inside=!inside;
  }
  return inside;
}

module.exports = { THREE, pointInPoly, convexOverlapPoint, hull, clip, area, pointSeg, polyDist, prepare, project, broadPairs, segSeg3, cross, makeSolid, pointInSolid, solidsIntersect, bboxOf, zRangeAt };
