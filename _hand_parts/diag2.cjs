const fs=require('fs'),path=require('path');
const G=require('/Users/xf/workspace/myArm/robot_arm/.verification/geom2d.cjs');const THREE=G.THREE;
const root='/Users/xf/workspace/myArm/robot_arm';
const html=fs.readFileSync(path.join(root,'hand_mechanism_3d.html'),'utf8');
const script=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes('const P ='))[1];
const nodes=new Map(),document={getElementById(id){if(!nodes.has(id))nodes.set(id,{});return nodes.get(id);}};
const main=script.slice(0,script.lastIndexOf('\ninitScene();'));
const api=new Function('THREE','document',main+'\nscene=new THREE.Scene();showLabels=false;buildMechanism();updateMechanism();return {P,s,scene,updateMechanism,getJoints};')(THREE,document);
const {s,scene}=api;
api.updateMechanism({index:[36,36,28],middle:[36,36,28],ring:[36,36,28],pinky:[36,36,28],thumb:[36,28]});
scene.updateMatrixWorld(true);
function bbox(nm){const m=scene.getObjectByName(nm);const g=m.geometry,pos=g.attributes.position;const v=new THREE.Vector3();
 let mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];
 for(let i=0;i<pos.count;i++){v.set(pos.getX(i),pos.getY(i),pos.getZ(i)).applyMatrix4(m.matrixWorld).multiplyScalar(1/s);
  const a=[v.x,v.y,v.z];for(let k=0;k<3;k++){mn[k]=Math.min(mn[k],a[k]);mx[k]=Math.max(mx[k],a[k]);}}
 return {nm,mn:mn.map(x=>+x.toFixed(1)),mx:mx.map(x=>+x.toFixed(1))};}
const names=['index_p1ForkL','thumb_p2dBoltThread','thumb_p2dBoltWasher','middle_p2BodyHeel','thumb_p2PSplicePadTop','thumb_t1TendonWeb','index_p1EarBaseL'];
for(const n of names){const b=bbox(n);console.log(b.nm.padEnd(26),'x',b.mn[0],b.mx[0],' y',b.mn[1],b.mx[1],' z',b.mn[2],b.mx[2]);}
const sa=G.makeSolid(scene.getObjectByName('index_p1ForkL'),s);
const sb=G.makeSolid(scene.getObjectByName('thumb_p2dBoltThread'),s);
console.log('A bbox',[sa.mnx,sa.mny,sa.mnz].map(x=>+x.toFixed(1)),[sa.mxx,sa.mxy,sa.mxz].map(x=>+x.toFixed(1)));
console.log('B bbox',[sb.mnx,sb.mny,sb.mnz].map(x=>+x.toFixed(1)),[sb.mxx,sb.mxy,sb.mxz].map(x=>+x.toFixed(1)));
console.log('solidsIntersect ->', G.solidsIntersect(sa,sb));
