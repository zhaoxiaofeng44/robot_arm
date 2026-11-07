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
'HAND.arcPhi=-20; updateMechanism();',
'console.log("AG.rotation.y(deg):", (AG.rotation.y*180/Math.PI).toFixed(1));',
'console.log("AG.position:", AG.position.x.toFixed(1), AG.position.y.toFixed(1), AG.position.z.toFixed(1), "(scene units /s: x)", (AG.position.x/s).toFixed(1), (AG.position.z/s).toFixed(1));',
'const F=FINGERS["ring"]; F.root.updateWorldMatrix(true,true); AG.updateWorldMatrix(true,true);',
'const rp=new THREE.Vector3(); F.root.getWorldPosition(rp);',
'console.log("root world:", (rp.x/s).toFixed(1), (rp.y/s).toFixed(1), (rp.z/s).toFixed(1));',
'const w=fingerChain("ring",[0,0,0]).tip; console.log("tip:", (w.x/s).toFixed(1), (w.y/s).toFixed(1), (w.z/s).toFixed(1));',
''].join('\n');
new Function('THREE','document','requestAnimationFrame','window',
  main+'\nscene=new THREE.Scene();showLabels=false;buildMechanism();updateMechanism();'+tail+
  ';return {}')(THREE,document,function(){},{addEventListener:function(){},innerWidth:1200,innerHeight:800});
console.log('done');