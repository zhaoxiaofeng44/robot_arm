const fs=require('fs'),path=require('path');
const G=require('/Users/xf/workspace/myArm/robot_arm/.verification/geom2d.cjs'), THREE=G.THREE;
const html=fs.readFileSync('/Users/xf/workspace/myArm/robot_arm/hand_mechanism_3d.html','utf8');
const sc=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes('const P ='))[1];
const nodes=new Map();
function mol(){return{style:{},textContent:'',innerHTML:'',value:'0',className:'',checked:true,_h:{},addEventListener(){},appendChild(){},querySelector(){return null}};}
const document={getElementById(id){if(!nodes.has(id))nodes.set(id,mol());return nodes.get(id);},createElement(){return mol();},getContext(){return{font:'',fillStyle:'',measureText(){return{width:40}},fillText(){}};}};
const main=sc.slice(0,sc.lastIndexOf('\ninitScene();'));
const tail=[
'','scene=new THREE.Scene();showLabels=false;buildMechanism();updateMechanism();','scene.updateMatrixWorld(true);',
'// 拇指 MountAsm 世界位置',
'var asm=scene.getObjectByName("thumbMountAsm") || scene.getObjectByName("thumb_MountAsm");',
'if(!asm){ scene.traverse(function(o){ if(o.name.indexOf("MountAsm")>=0 && o.name.indexOf("thumb")>=0 && !asm) asm=o; }); }',
'if(asm){ var wp=new THREE.Vector3(); asm.getWorldPosition(wp); console.log("thumb MountAsm world mm:", (wp.x/s).toFixed(1),(wp.y/s).toFixed(1),(wp.z/s).toFixed(1)); }',
'else console.log("thumb MountAsm NOT FOUND");',
'// 拇指 root 与其所有子件名',
'var F=FINGERS.thumb; console.log("thumb root children:", F.root.children.map(function(c){return c.name;}).join(","));',
'// 拇指半掌板覆盖：thumbPalmFlap 下所有 mesh 的包围盒',
'var TF=scene.getObjectByName("thumbPalmFlapGroup"); TF.updateMatrixWorld(true);',
'var box=new THREE.Box3(); TF.children.forEach(function(c){ if(c.geometry){ c.geometry.computeBoundingBox(); var b=c.geometry.boundingBox.clone(); if(c.geometry.boundingBox) b.applyMatrix4(c.matrixWorld); box.union(b);} });',
'console.log("thumbFlap bbox mm: x["+(box.min.x/s).toFixed(0)+","+(box.max.x/s).toFixed(0)+"] z["+(box.min.z/s).toFixed(0)+","+(box.max.z/s).toFixed(0)+"]");',
'// 四指半 bbox',
'var FF=scene.getObjectByName("palmArcFlapGroup"); FF.updateMatrixWorld(true);',
'var box2=new THREE.Box3(); FF.children.forEach(function(c){ if(c.geometry){ c.geometry.computeBoundingBox(); var b=c.geometry.boundingBox.clone(); b.applyMatrix4(c.matrixWorld); box2.union(b);} });',
'console.log("fourFlap bbox mm: x["+(box2.min.x/s).toFixed(0)+","+(box2.max.x/s).toFixed(0)+"] z["+(box2.min.z/s).toFixed(0)+","+(box2.max.z/s).toFixed(0)+"]");',
'// 四指 root 世界位置（食指应该贴在四指半上）',
'var FI=FINGERS.index, wpi=new THREE.Vector3(); FI.root.getWorldPosition(wpi);',
'console.log("index root world mm:", (wpi.x/s).toFixed(1),(wpi.y/s).toFixed(1),(wpi.z/s).toFixed(1));',
'// 耳板与销',
'var ears=[],pins=[]; scene.traverse(function(o){ if(o.name.indexOf("palmHingeEar")===0) ears.push(o.name); if(o.name.indexOf("palmHingePin")===0&&o.name.indexOf("Head")<0&&o.name.indexOf("Nut")<0) pins.push(o.name); });',
'console.log("ears:", ears.join(",")); console.log("pins:", pins.join(","));'
].join('\n');
new Function('THREE','document','requestAnimationFrame','window',main+'\nscene=new THREE.Scene();showLabels=false;'+tail+';return {}')(THREE,document,function(){},{addEventListener:function(){},innerWidth:1200,innerHeight:800});
