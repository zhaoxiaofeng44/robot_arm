const fs=require('fs'),path=require('path');
const G=require('/Users/xf/workspace/myArm/robot_arm/.verification/geom2d.cjs');
const THREE=G.THREE;
const root='/Users/xf/workspace/myArm/robot_arm';
const html=fs.readFileSync(path.join(root,'hand_mechanism_3d.html'),'utf8');
const script=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes('const P ='))[1];
const nodes=new Map(),document={getElementById(id){if(!nodes.has(id))nodes.set(id,{});return nodes.get(id);}};
const main=script.slice(0,script.lastIndexOf('\ninitScene();'));
const api=new Function('THREE','document',main+'\nscene=new THREE.Scene();showLabels=false;buildMechanism();updateMechanism();return {P,s,scene,getJoints,updateMechanism,FINGERS,HAND};')(THREE,document);
const {P,s,scene,FINGERS,HAND,getJoints,updateMechanism}=api;
scene.updateMatrixWorld(true);
const V=new THREE.Vector3();
const U=1/s;
let worst=0, worstWhat='';
function chk(name, obj, target){
  if(!obj){ console.log('MISSING', name); return; }
  obj.getWorldPosition(V);
  const d=V.distanceTo(target)*U;
  if(d>worst){ worst=d; worstWhat=name; }
  return d;
}
function poseAll(u){ const p={}; for(const f of HAND.fingers) p[f.key]=f.limits.map(l=>l*u); updateMechanism(p); scene.updateMatrixWorld(true); return getJoints(p); }
for (const u of [0, 0.5, 1.0]) {
  const J=poseAll(u);
  for (const f of HAND.fingers) {
    const k=f.key, c=J[k], F=FINGERS[k];
    chk(k+'_o0', scene.getObjectByName(k+'_o0BoltAssembly'), c.OW[0]);
    for (let j=0;j<f.n;j++) {
      const b=scene.getObjectByName(k+'_m'+j+'BClevis');
      const t=scene.getObjectByName(k+'_t'+j+'Tendon');
      const d1=chk(k+' B'+j+' @u='+u, b, c.BW[j]);
      if(t){ t.getWorldPosition(V); const mid=new THREE.Vector3().addVectors(c.BW[j],c.DW[j]).multiplyScalar(0.5); const d2=V.distanceTo(mid)*U; if(d2>worst){worst=d2;worstWhat=k+' T'+j+' @u='+u;} }
    }
  }
}
console.log('worst mismatch mm', worst.toFixed(3), worstWhat);
