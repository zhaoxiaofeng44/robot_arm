const fs=require('fs'),path=require('path');
const G=require('/Users/xf/workspace/myArm/robot_arm/.verification/geom2d.cjs');
const THREE=G.THREE;
const root='/Users/xf/workspace/myArm/robot_arm';
const html=fs.readFileSync(path.join(root,'hand_mechanism_3d.html'),'utf8');
const script=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes('const P ='))[1];
const nodes=new Map(),document={getElementById(id){if(!nodes.has(id))nodes.set(id,{});return nodes.get(id);}};
const main=script.slice(0,script.lastIndexOf('\ninitScene();'));
const api=new Function('THREE','document',main+'\nscene=new THREE.Scene();showLabels=false;buildMechanism();updateMechanism();return {P,s,scene,getJoints,FINGERS,HAND,MAT};')(THREE,document);
const {P,s,scene,FINGERS,HAND,getJoints}=api;
let meshes=[];
scene.traverse(o=>{ if(!o.isMesh) return; meshes.push(o); });
const names=meshes.map(m=>m.name);
const dup=names.filter((n,i)=>names.indexOf(n)!==i);
console.log('meshes', meshes.length, 'unique', new Set(names).size, 'dup', JSON.stringify(dup.slice(0,5)));
const bb=new THREE.Box3(); scene.updateMatrixWorld(true);
let bad=0;
for(const m of meshes){ m.geometry.computeBoundingBox(); const b=m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld); if(!isFinite(b.min.x)||!isFinite(b.max.x)||!isFinite(b.min.y)||!isFinite(b.min.z)) {bad++; if(bad<4) console.log('NaN bbox', m.name);} bb.union(b); }
console.log('bad boxes', bad);
const U=1/s;
console.log('bbox mm  x[%s,%s] y[%s,%s] z[%s,%s]', (bb.min.x*U).toFixed(1),(bb.max.x*U).toFixed(1),(bb.min.y*U).toFixed(1),(bb.max.y*U).toFixed(1),(bb.min.z*U).toFixed(1),(bb.max.z*U).toFixed(1));
const J=getJoints();
for(const k of HAND.keys){ const F=FINGERS[k], c=J[k];
  const o0=scene.getObjectByName(k+'_o0');
  console.log(k, 'n',F.n, 'groups',F.groups.length, 'motors',F.motors.length, 'tendons',F.tendons.length, 'limits',JSON.stringify(F.limits));
  console.log('   O0 world mm', c.OW[0].x*U, c.OW[0].y*U, c.OW[0].z*U, '| tip', c.tip.x*U, c.tip.y*U, c.tip.z*U);
}
