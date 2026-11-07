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
'const AG=scene.getObjectByName("palmArcFlapGroup"), TG=scene.getObjectByName("thumbPalmFlapGroup");',
'console.log("motors total:", scene.children.length ? undefined : 0);',
'let cnt=0; scene.traverse(function(o){ if(/MotorBody$/.test(o.name)) cnt++; });',
'console.log("motor bodies in scene:", cnt, "(1 flex/pair = 14 for 4x3+1x2 fingers, +5 spread, +1 palm arc = 20?)");',
'for (const a of [0,-10,-20,-30]) { HAND.arcPhi=a; updateMechanism();',
'  console.log("arcPhi="+a+" -> palmB flap "+(AG.rotation.y*180/Math.PI).toFixed(1)+"° thumb flap "+(TG.rotation.y*180/Math.PI).toFixed(1)+"°"); }',
'// 联动连杆长度校验',
'let ok=true; for (let a=0;a>=-30.001;a-=1){ HAND.arcPhi=a; updateMechanism();',
'  const phi1=a*Math.PI/180; const D1={x:HAND.arc.hingeX+HAND.arc.crankR*Math.cos(phi1), z:HAND.arc.hingeZ-HAND.arc.crankR*Math.sin(phi1)};',
'  const phi2=arcCouplePhi2(phi1); if(phi2===null){ok=false;continue;}',
'  const th2=THUMB_FOLD.crankZeroDeg*Math.PI/180+phi2;',
'  const D2={x:THUMB_FOLD.hingeX+THUMB_FOLD.crankR*Math.cos(th2), z:THUMB_FOLD.hingeZ+THUMB_FOLD.crankR*Math.sin(th2)};',
'  const d=Math.hypot(D1.x-D2.x, D1.z-D2.z); if(Math.abs(d-85)>0.05){ok=false;console.log("  len err", a, d.toFixed(2));} }',
'console.log("coupler |D1D2|=85 over 0..-30:", ok);',
'HAND.arcPhi=0; updateMechanism();',
'console.log("COUPLE CHK DONE");',
''].join('\n');
new Function('THREE','document','requestAnimationFrame','window',
  main+'\nscene=new THREE.Scene();showLabels=false;buildMechanism();updateMechanism();'+tail+
  ';return {}')(THREE,document,function(){},{addEventListener:function(){},innerWidth:1200,innerHeight:800});
console.log('done');