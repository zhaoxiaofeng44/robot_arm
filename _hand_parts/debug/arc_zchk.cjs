const fs=require('fs'),path=require('path');
const G=require('/Users/xf/workspace/myArm/robot_arm/.verification/geom2d.cjs');
const THREE=G.THREE;
const root='/Users/xf/workspace/myArm/robot_arm';
const html=fs.readFileSync(path.join(root,'hand_mechanism_3d.html'),'utf8');
const script=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes('const P ='))[1];
const nodes=new Map();
function mockEl(){ return { style:{},textContent:'',innerHTML:'',value:'0',className:'',checked:true,_h:{},addEventListener(){},appendChild(){} }; }
const document={ getElementById(id){ if(!nodes.has(id)) nodes.set(id,mockEl()); return nodes.get(id); },
  createElement(){ return mockEl(); },
  getContext(){ return { font:'', fillStyle:'', measureText(){return{width:40};}, fillText(){} }; } };
const main=script.slice(0, script.lastIndexOf('\ninitScene();'));
const tail=[
'',
'scene=new THREE.Scene();showLabels=false;buildMechanism();updateMechanism();',
'scene.updateWorldMatrix(true,true);',
'const mg=scene.getObjectByName("palmArcMotorGroup");',
'const body=mg.getObjectByName("palmArc_m0MotorBody");',
'body.geometry.computeBoundingBox(); let bb=body.geometry.boundingBox.clone().applyMatrix4(body.matrixWorld);',
'console.log("motor body world: z[%s,%s] y[%s,%s] x[%s,%s]", (bb.min.z/s).toFixed(1),(bb.max.z/s).toFixed(1),(bb.min.y/s).toFixed(1),(bb.max.y/s).toFixed(1),(bb.min.x/s).toFixed(1),(bb.max.x/s).toFixed(1));',
'console.log("axis along z:", ((bb.max.z-bb.min.z)) > ((bb.max.y-bb.min.y)));',
'console.log("on palm side (y<331*0.35):", (bb.max.y/s) < 331);',
'console.log("on thumb side (z<0):", (bb.max.z/s) < 0);',
'// 与拇指掌fold电机柱净空',
'const tfc=scene.getObjectByName("thumbFoldColumn");',
'if (tfc && tfc.geometry){ tfc.geometry.computeBoundingBox(); const tb=tfc.geometry.boundingBox.clone().applyMatrix4(tfc.matrixWorld);',
'  const dx=Math.max(0, Math.max(bb.min.x-tb.max.x, tb.min.x-bb.max.x)/s);',
'  console.log("x-clearance to thumbFold column mm:", dx.toFixed(1));',
'}',
'// 拉动方向：φ 0 → −8，B 叉头向法兰(−z)收',
'HAND.arcPhi=0; updateMechanism();',
'const b0=mg.getObjectByName("palmArc_m0BClevis"); scene.updateWorldMatrix(true,true);',
'const wp0=new THREE.Vector3(); b0.getWorldPosition(wp0);',
'HAND.arcPhi=-8; updateMechanism();',
'const wp1=new THREE.Vector3(); b0.getWorldPosition(wp1);',
'console.log("B clevis: phi0 z=", (wp0.z/s).toFixed(1), " phi-8 z=", (wp1.z/s).toFixed(1), " pullΔz=", ((wp0.z-wp1.z)/s).toFixed(1), "mm");',
'console.log("ZCHK DONE");',
''].join('\n');
new Function('THREE','document','requestAnimationFrame','window',
  main+'\nscene=new THREE.Scene();showLabels=false;buildMechanism();updateMechanism();'+tail+
  ';return {}')(THREE,document,function(){},{addEventListener:function(){},innerWidth:1200,innerHeight:800});
console.log('done');