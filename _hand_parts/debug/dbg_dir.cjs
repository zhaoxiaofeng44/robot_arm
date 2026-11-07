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
'HAND.arcPhi=0; updateMechanism();',
'const r0=fingerChain("ring",[0,0,0]).tip.clone(), p0=fingerChain("pinky",[0,0,0]).tip.clone();',
'console.log("ring tip0:", r0.x.toFixed(1), r0.y.toFixed(1), r0.z.toFixed(1));',
'console.log("pinky tip0:", p0.x.toFixed(1), p0.y.toFixed(1), p0.z.toFixed(1));',
'HAND.arcPhi=-20; updateMechanism();',
'const r1=fingerChain("ring",[0,0,0]).tip, p1=fingerChain("pinky",[0,0,0]).tip;',
'console.log("ring tip-20:", r1.x.toFixed(1), r1.y.toFixed(1), r1.z.toFixed(1), " Δx=", (r1.x-r0.x).toFixed(1));',
'console.log("pinky tip-20:", p1.x.toFixed(1), p1.y.toFixed(1), p1.z.toFixed(1), " Δx=", (p1.x-p0.x).toFixed(1));',
'console.log("direction (expect Δx<0 toward thumb/palm):", (r1.x-r0.x)<0 && (p1.x-p0.x)<0 ? "OK inward" : "WRONG");',
'// 全程闭合',
'let ok=true;',
'for (let v=-25; v<=0; v+=0.5){ HAND.arcPhi=v; updateMechanism();',
'  const cd=lateralCrankPointsY(HAND.arc.crankR, -v);',
'  if (Math.abs(Math.sqrt(cd.B.x*cd.B.x+cd.D.z*cd.D.z+(cd.D.x-cd.B.x)*(cd.D.x-cd.B.x))-P.tendonLinkLen)>1e-6) {}',
'  const dx=cd.D.x-cd.B.x, dz=cd.D.z-cd.B.z;',
'  if (Math.abs(Math.sqrt(dx*dx+dz*dz)-P.tendonLinkLen)>1e-6) ok=false; }',
'console.log("closure |BD|=85 (0..-25):", ok);',
'HAND.arcPhi=0; updateMechanism();',
'console.log("DIR DONE");',
''].join('\n');
new Function('THREE','document','requestAnimationFrame','window',
  main+'\nscene=new THREE.Scene();showLabels=false;buildMechanism();updateMechanism();'+tail+
  ';return {}')(THREE,document,function(){},{addEventListener:function(){},innerWidth:1200,innerHeight:800});
console.log('done');