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
'const AG=scene.getObjectByName("thumbPalmFlapGroup");',
'AG.traverse(function(o){ const bad=[o.position.x,o.position.y,o.position.z,o.scale.x,o.scale.y,o.scale.z,o.quaternion.w].some(function(v){return !isFinite(v);});',
'  if (bad) console.log("BAD:", o.name || "(anon)", o.type, o.position.x,o.position.y,o.position.z);',
'  if (o.geometry){ o.geometry.computeBoundingBox(); if (!isFinite(o.geometry.boundingBox.min.x)) console.log("BADGEO:", o.name); } });',
'console.log("scan done");',
''].join('\n');
new Function('THREE','document','requestAnimationFrame','window',
  main+'\nscene=new THREE.Scene();showLabels=false;buildMechanism();updateMechanism();'+tail+
  ';return {}')(THREE,document,function(){},{addEventListener:function(){},innerWidth:1200,innerHeight:800});
console.log('done');