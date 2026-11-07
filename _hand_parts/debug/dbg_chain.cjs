const fs=require('fs'),path=require('path');
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
'const F=FINGERS["ring"];',
'console.log("F.arcFlap set:", !!F.arcFlap, "=== AG:", F.arcFlap===AG);',
'console.log("root parent:", F.root.parent && F.root.parent.name);',
'HAND.arcPhi=0; updateMechanism();',
'const w0=fingerChain("ring",[0,0,0]).tip.clone();',
'HAND.arcPhi=-15; updateMechanism();',
'const w1=fingerChain("ring",[0,0,0]).tip;',
'console.log("tip0:", w0.x.toFixed(1), w0.y.toFixed(1), w0.z.toFixed(1));',
'console.log("tip1:", w1.x.toFixed(1), w1.y.toFixed(1), w1.z.toFixed(1));',
'// 手工推导：root 世界位姿前后',
'AG.updateWorldMatrix(true,true); F.root.updateWorldMatrix(true,false);',
'const rp=new THREE.Vector3(); F.root.getWorldPosition(rp);',
'console.log("root world pos:", (rp.x/s).toFixed(1), (rp.y/s).toFixed(1), (rp.z/s).toFixed(1));',
''].join('\n');
new Function('THREE','document','requestAnimationFrame','window',
  main+'\nscene=new THREE.Scene();showLabels=false;buildMechanism();updateMechanism();'+tail+
  ';return {}')(THREE,document,function(){},{addEventListener:function(){},innerWidth:1200,innerHeight:800});
console.log('done');