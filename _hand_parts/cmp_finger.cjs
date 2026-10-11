const fs=require('fs'),path=require('path');
const G=require('/Users/xf/workspace/myArm/robot_arm/.verification/geom2d.cjs');const THREE=G.THREE;
const root='/Users/xf/workspace/myArm/robot_arm';
function load(file){
  const html=fs.readFileSync(path.join(root,file),'utf8');
  const script=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes('const P ='))[1];
  const nodes=new Map(),document={getElementById(id){if(!nodes.has(id))nodes.set(id,{});return nodes.get(id);}};
  const main=script.slice(0,script.lastIndexOf('\ninitScene();'));
  const api=new Function('THREE','document',main+'\nscene=new THREE.Scene();showLabels=false;buildMechanism();updateMechanism();return {P,s,scene};')(THREE,document);
  api.scene.updateMatrixWorld(true);
  api.byName=new Map(); api.scene.traverse(o=>{if(o.isMesh&&!api.byName.has(o.name))api.byName.set(o.name,o);});
  return api;
}
const F=load('finger_mechanism_3d.html'), H=load('hand_mechanism_3d.html');
function bboxOf(api,o){const g=o.geometry,pos=g.attributes.position,v=new THREE.Vector3();
  let mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];
  for(let i=0;i<pos.count;i++){v.set(pos.getX(i),pos.getY(i),pos.getZ(i)).applyMatrix4(o.matrixWorld).multiplyScalar(1/api.s);
    const a=[v.x,v.y,v.z];for(let k=0;k<3;k++){mn[k]=Math.min(mn[k],a[k]);mx[k]=Math.max(mx[k],a[k]);}}
  return {mn,mx,c:mn.map((x,k)=>(x+mx[k])/2)};}
function allRange(api,filter){let mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9],n=0;api.scene.traverse(o=>{if(!o.isMesh)return;if(filter&&!filter.test(o.name))return;const b=bboxOf(api,o);n++;for(let k=0;k<3;k++){mn[k]=Math.min(mn[k],b.mn[k]);mx[k]=Math.max(mx[k],b.mx[k]);}});return {mn,mx,n};}
const fmt=a=>a.map(x=>(+x).toFixed(1)).join(', ');
const rf=allRange(F), rh=allRange(H,/^index_/);
console.log('FINGER 全部件 y',fmt([rf.mn[1],rf.mx[1]]),' z',fmt([rf.mn[2],rf.mx[2]]),' mesh',rf.n);
console.log('HAND   食指 y',fmt([rh.mn[1],rh.mx[1]]),' z',fmt([rh.mn[2],rh.mx[2]]),' mesh',rh.n);
const BF=F.byName, BH=H.byName;
const o0F=BF.get('o0BoltShank'), o0H=BH.get('index_o0BoltShank');
const y0F=bboxOf(F,o0F).c[1], y0H=bboxOf(H,o0H).c[1];
console.log('MCP销轴(o0BoltShank) y： finger',y0F.toFixed(1),' hand(index)',y0H.toFixed(1));
const names=['palmBase','palmFlangeBase','m0MotorBody','m1MotorBody','m2MotorBody','m0FlangePlate','p1FlangePlate','p2FlangePlate','palmForkL','p1ForkL','p2ForkL','p1SleeveBody','p2SleeveBody','p3SleeveBody','m0ClevisPlateL','m1ClevisPlateL','gripPad','p3BodyProximal','p3BodyDistal'];
console.log('');
console.log('件名'.padEnd(20),'finger 相对MCP y / 绝对z'.padEnd(28),'hand(index) 相对MCP y / 绝对z');
for(const n of names){const a=BF.get(n), b=BH.get('index_'+n);
  if(!a&&!b){console.log(n.padEnd(20),'(都缺)');continue;}
  const f1=a?[(bboxOf(F,a).c[1]-y0F).toFixed(1),bboxOf(F,a).c[2].toFixed(1)].join(' / '):'(缺)';
  const h1=b?[(bboxOf(H,b).c[1]-y0H).toFixed(1),bboxOf(H,b).c[2].toFixed(1)].join(' / '):'(缺)';
  console.log(n.padEnd(20),f1.padEnd(28),h1);}
