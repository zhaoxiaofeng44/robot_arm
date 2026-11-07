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
'const mg=scene.getObjectByName("thumbFoldMotorGroup");',
'const body=mg.getObjectByName("thumbFold_m0MotorBody");',
'body.geometry.computeBoundingBox(); let bb=body.geometry.boundingBox.clone().applyMatrix4(body.matrixWorld);',
'console.log("fold motor world: z[%s,%s] y[%s,%s] x[%s,%s]", (bb.min.z/s).toFixed(1),(bb.max.z/s).toFixed(1),(bb.min.y/s).toFixed(1),(bb.max.y/s).toFixed(1),(bb.min.x/s).toFixed(1),(bb.max.x/s).toFixed(1));',

'console.log("palm side (y<331):", (bb.max.y/s) < 331);',
'// 拉动：φ 0 → -12 B 叉头向 +z（法兰方向）',
'HAND && (FINGERS.thumb.fold=0); updateMechanism();',
'const b0=mg.getObjectByName("thumbFold_m0BClevis"); scene.updateWorldMatrix(true,true);',
'const wp0=new THREE.Vector3(); b0.getWorldPosition(wp0);',
'FINGERS.thumb.fold=-12; updateMechanism();',
'const wp1=new THREE.Vector3(); b0.getWorldPosition(wp1);',
'console.log("B clevis: fold0 x=", (wp0.x/s).toFixed(1), " fold-12 x=", (wp1.x/s).toFixed(1), " pullΔx=", ((wp0.x-wp1.x)/s).toFixed(1), "mm (expect >0, pulled toward -x flange)");',
'// 闭合恒长',
'let ok=true;',
'for (let v=-12; v<=0; v+=0.5){ FINGERS.thumb.fold=v; updateMechanism();',
'  const cd=lateralCrankPointsZ(THUMB_FOLD.crankR, -v, TFS.By);',
'  const dx=cd.D.x-cd.B.x, dy=cd.D.y-cd.B.y, dz=cd.D.z-cd.B.z;',
'  if (Math.abs(Math.sqrt(dx*dx+dy*dy+dz*dz)-P.tendonLinkLen)>1e-6) ok=false; }',
'console.log("closure |BD|=85 :", ok);',
'// flap 随动：拇指 tip 移动',
'FINGERS.thumb.fold=0; updateMechanism();',
'const t0=getJoints({}).thumb.tip.clone();',
'FINGERS.thumb.fold=-12; updateMechanism();',
'const t1=getJoints({}).thumb.tip;',
'console.log("thumb tip moved:", t0.distanceTo(t1)>1*s ? "yes" : "NO!");',
'FINGERS.thumb.fold=0; updateMechanism();',
'console.log("FOLD ZCHK DONE");',
''].join('\n');
new Function('THREE','document','requestAnimationFrame','window',
  main+'\nscene=new THREE.Scene();showLabels=false;buildMechanism();updateMechanism();'+tail+
  ';return {}')(THREE,document,function(){},{addEventListener:function(){},innerWidth:1200,innerHeight:800});
console.log('done');