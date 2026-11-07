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
'var TF=scene.getObjectByName("thumbPalmFlapGroup");',
'var gp=new THREE.Vector3(); TF.getWorldPosition(gp);',
'console.log("FLAP local position mm:", (TF.position.x/s).toFixed(1),(TF.position.y/s).toFixed(1),(TF.position.z/s).toFixed(1));',
'console.log("FLAP world position mm:", (gp.x/s).toFixed(1),(gp.y/s).toFixed(1),(gp.z/s).toFixed(1));',
'var F=FINGERS.thumb, wp=new THREE.Vector3(); F.root.getWorldPosition(wp);',
'console.log("THUMB root local:", (F.root.position.x/s).toFixed(1),(F.root.position.y/s).toFixed(1),(F.root.position.z/s).toFixed(1));',
'console.log("THUMB root world:", (wp.x/s).toFixed(1),(wp.y/s).toFixed(1),(wp.z/s).toFixed(1));',
'console.log("THUMB root parent:", F.root.parent && F.root.parent.name);',
'console.log("ARC_STATE:", JSON.stringify(ARC_STATE));'
].join('\n');
new Function('THREE','document','requestAnimationFrame','window',main+'\nscene=new THREE.Scene();showLabels=false;'+tail+';return {}')(THREE,document,function(){},{addEventListener:function(){},innerWidth:1200,innerHeight:800});
