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
'function tipOf(k){ const w=fingerChain(k,[0,0,0]).tip; const AG=scene.getObjectByName("palmArcFlapGroup"); const F=FINGERS[k]; if(!F.arcFlap) return w; const t0=F.arcFlap.position; const r0=F.rootWorld0; /* keep fingerChain result */ return w; }',
'HAND.arcPhi=0; updateMechanism();',
'const r0=tipOf("ring"), p0=tipOf("pinky"), m0=tipOf("middle");',
'console.log("phi=0 : ring", r0.x.toFixed(1), r0.z.toFixed(1), "| middle", m0.x.toFixed(1), m0.z.toFixed(1), "| pinky", p0.x.toFixed(1), p0.z.toFixed(1));',
'for (const a of [-10,-20,-25]) { HAND.arcPhi=a; updateMechanism();',
'  const r=tipOf("ring"), p=tipOf("pinky"); console.log("  abs ring x=", r.x.toFixed(1), "y=", r.y.toFixed(1), "z=", r.z.toFixed(1));',
'  const AGx=scene.getObjectByName("palmArcFlapGroup"); console.log("  AG.q.y=", AGx.quaternion.y.toFixed(4), "rot="+(AGx.rotation.y*180/Math.PI).toFixed(1), "phi="+a+": ring dx="+(r.x-r0.x).toFixed(1)+" dz="+(r.z-r0.z).toFixed(1)+" | pinky dx="+(p.x-p0.x).toFixed(1)+" dz="+(p.z-p0.z).toFixed(1)); }',
'HAND.arcPhi=0; updateMechanism();',
''].join('\n');
new Function('THREE','document','requestAnimationFrame','window',
  main+'\nscene=new THREE.Scene();showLabels=false;buildMechanism();updateMechanism();'+tail+
  ';return {}')(THREE,document,function(){},{addEventListener:function(){},innerWidth:1200,innerHeight:800});
console.log('done');