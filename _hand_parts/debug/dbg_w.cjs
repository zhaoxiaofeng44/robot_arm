const fs=require('fs');
const G=require('/Users/xf/workspace/myArm/robot_arm/.verification/geom2d.cjs');
const THREE=G.THREE;
const html=fs.readFileSync('/Users/xf/workspace/myArm/robot_arm/hand_mechanism_3d.html','utf8');
const script=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes('const P ='))[1];
const nodes=new Map();
function mockEl(){ return { style:{},textContent:'',innerHTML:'',value:'0',className:'',checked:true,_h:{},addEventListener(){},appendChild(){} }; }
const document={ getElementById(id){ if(!nodes.has(id)) nodes.set(id,mockEl()); return nodes.get(id); },
  createElement(){ return mockEl(); }, getContext(){ return { font:'', fillStyle:'', measureText(){return{width:40};}, fillText(){} }; } };
const main=script.slice(0, script.lastIndexOf('\ninitScene();'));
const tail=['',
'scene=new THREE.Scene();showLabels=false;buildMechanism();updateMechanism();',
'const AG=scene.getObjectByName("palmArcFlapGroup");',
'HAND.arcPhi=0; updateMechanism();',
'console.log("rot(deg):", (AG.rotation.y*180/Math.PI).toFixed(2), "pos(mm):", (AG.position.x/s).toFixed(1), (AG.position.y/s).toFixed(1), (AG.position.z/s).toFixed(1));',
'HAND.arcPhi=-20; updateMechanism();',
'console.log("rot(deg):", (AG.rotation.y*180/Math.PI).toFixed(2));',
'const F=FINGERS["ring"];',
'console.log("root local:", (F.root.position.x/s).toFixed(1), (F.root.position.y/s).toFixed(1), (F.root.position.z/s).toFixed(1));',
'const w=fingerChain("ring",[0,0,0]).tip;',
'console.log("tip:", (w.x/s).toFixed(1), (w.y/s).toFixed(1), (w.z/s).toFixed(1));',
'// 手动按公式算 tip：v=旧世界(0,−864,50) → rel=v−t0 → Qy(−20) → +t0',
'const t0=AG.position, v=new THREE.Vector3(0,-864*s,50*s);',
'const r=v.clone().sub(t0).applyQuaternion(AG.quaternion).add(t0);',
'console.log("manual:", (r.x/s).toFixed(1), (r.y/s).toFixed(1), (r.z/s).toFixed(1));',
''].join('\n');
new Function('THREE','document','requestAnimationFrame','window',
  main+'\nscene=new THREE.Scene();showLabels=false;buildMechanism();updateMechanism();'+tail+
  ';return {}')(THREE,document,function(){},{addEventListener:function(){},innerWidth:1200,innerHeight:800});
console.log('done');