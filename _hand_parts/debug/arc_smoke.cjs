// 掌弓聚拢副冒烟：|BD|≡85、ring/pinky 随 flap 刚体折叠、零位世界坐标不变
const fs=require('fs'),path=require('path');
const G=require('/Users/xf/workspace/myArm/robot_arm/.verification/geom2d.cjs');
const THREE=G.THREE;
const root='/Users/xf/workspace/myArm/robot_arm';
const html=fs.readFileSync(path.join(root,'hand_mechanism_3d.html'),'utf8');
const script=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes('const P ='))[1];
const nodes=new Map();
function mockEl(){ return { style:{},textContent:'',innerHTML:'',value:'0',className:'',checked:true,_h:{},
  addEventListener(ev,fn){ this._h[ev]=fn; }, appendChild(){},
  dispatch(ev,arg){ if(this._h[ev]) this._h[ev](arg||{target:this}); } }; }
const document={ getElementById(id){ if(!nodes.has(id)) nodes.set(id,mockEl()); return nodes.get(id); },
  createElement(){ return mockEl(); },
  getContext(){ return { font:'', fillStyle:'', measureText(){return{width:40};}, fillText(){} }; } };
const main=script.slice(0, script.lastIndexOf('\ninitScene();'));
const tail=[ '',
'scene=new THREE.Scene();showLabels=false;buildMechanism();updateMechanism();',
'try { setupUI(); } catch(e){ console.log("setupUI ERROR:", e.message); }',
'const AG=scene.getObjectByName("palmArcFlapGroup");',
'console.log("arcFlap found:", !!AG, "children:", AG?AG.children.length:0);',
'const AM=scene.getObjectByName("palmArcMotorGroup");',
'console.log("arcMotor found:", !!AM, "rod:", !!scene.getObjectByName("palmArc_m0ExposedRod"), "link:", !!scene.getObjectByName("palmArc_tTendon"));',
'// 零位基准：ring/pinky tip 世界坐标',
'const t0r=getJoints({}).ring.tip.clone(), t0p=getJoints({}).pinky.tip.clone();',
'console.log("ring tip0 mm:", (t0r.x/s).toFixed(1),(t0r.y/s).toFixed(1),(t0r.z/s).toFixed(1));',
'console.log("pinky tip0 mm:", (t0p.x/s).toFixed(1),(t0p.y/s).toFixed(1),(t0p.z/s).toFixed(1));',
'// 全行程扫描：|BD|恒长 + flap 旋转生效 + 无名指/小指随之移动',
'let closure=true, moved=false, flapMoved=false;',
'const R=HAND.arc.crankR, L=P.tendonLinkLen;',
'for (let v=-15; v<=0; v+=0.5){',
'  HAND.arcPhi=v; updateMechanism();',
'  const cd=lateralCrankPoints(R,v,1);',
'  const dx=cd.D.x-cd.B.x, dy=cd.D.y-cd.B.y;',
'  if (Math.abs(Math.sqrt(dx*dx+dy*dy)-L)>1e-6) closure=false;',
'}',
'HAND.arcPhi=-15; updateMechanism();',
'AG.updateWorldMatrix(true,true);',
'const t1r=getJoints({}).ring.tip, t1p=getJoints({}).pinky.tip;',
'console.log("ring tip@-15deg:", (t1r.x/s).toFixed(1),(t1r.y/s).toFixed(1),(t1r.z/s).toFixed(1));',
'console.log("pinky tip@-15deg:", (t1p.x/s).toFixed(1),(t1p.y/s).toFixed(1),(t1p.z/s).toFixed(1));',
'if (t1p.distanceTo(t0p) > 1*s) moved=true;',
'console.log("closure |BD|-85 <=1e-6 :", closure);',
'console.log("ring/pinky tips moved with flap :", moved);',
'console.log("flap rotation applied :", Math.abs(AG.rotation.y) > 0, "rot.y(deg)=", (AG.rotation.y*180/Math.PI).toFixed(1));',
'// 零位还原一致性',
'HAND.arcPhi=0; updateMechanism();',
'const t2p=getJoints({}).pinky.tip;',
'console.log("zero-restore pinky tip err mm:", (t2p.distanceTo(t0p)/s).toFixed(4));',
'console.log("ARC SMOKE DONE");',
''].join('\n');
const api=new Function('THREE','document','requestAnimationFrame','window',
  main+'\nscene=new THREE.Scene();showLabels=false;buildMechanism();updateMechanism();'+tail+
  ';return {P,s,scene,getJoints,FINGERS,HAND}')(THREE,document,function(){},{addEventListener:function(){},innerWidth:1200,innerHeight:800});
console.log('boot OK');