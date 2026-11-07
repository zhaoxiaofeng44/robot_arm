const fs=require('fs'),path=require('path');
const G=require('/Users/xf/workspace/myArm/robot_arm/.verification/geom2d.cjs'), THREE=G.THREE;
const html=fs.readFileSync('/Users/xf/workspace/myArm/robot_arm/hand_mechanism_3d.html','utf8');
const sc=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes('const P ='))[1];
const nodes=new Map();
function mol(){return{style:{},textContent:'',innerHTML:'',value:'0',className:'',checked:true,_h:{},addEventListener(){},appendChild(){},querySelector(){return null}};}
const document={getElementById(id){if(!nodes.has(id))nodes.set(id,mol());return nodes.get(id);},createElement(){return mol();},getContext(){return{font:'',fillStyle:'',measureText(){return{width:40}},fillText(){}};}};
const main=sc.slice(0,sc.lastIndexOf('\ninitScene();'));
const tail=[
'','scene=new THREE.Scene();showLabels=false;',
'// 手动执行 buildChassis + buildFinger，逐步观察 thumb root',
'buildChassis();',
'for (const f of HAND.fingers) buildFinger(f);',
'scene.updateMatrixWorld(true);',
'var F=FINGERS.thumb, wp=new THREE.Vector3(); F.root.getWorldPosition(wp);',
'console.log("AFTER buildFinger: thumb root world mm:", (wp.x/s).toFixed(1),(wp.y/s).toFixed(1),(wp.z/s).toFixed(1));',
'var TF=scene.getObjectByName("thumbPalmFlapGroup");',
'console.log("flap pos mm:", (TF.position.x/s).toFixed(1),(TF.position.y/s).toFixed(1),(TF.position.z/s).toFixed(1));',
'console.log("thumb fingerDef pos z:", yOf("thumb").pos[2]);',
'var FF=scene.getObjectByName("palmArcFlapGroup");',
'var f2=FINGERS.index, wp2=new THREE.Vector3(); f2.root.getWorldPosition(wp2);',
'console.log("index root world mm:", (wp2.x/s).toFixed(1),(wp2.y/s).toFixed(1),(wp2.z/s).toFixed(1));'
].join('\n');
new Function('THREE','document','requestAnimationFrame','window',main+'\nscene=new THREE.Scene();showLabels=false;'+'\n'+tail+';return {}')(THREE,document,function(){},{addEventListener:function(){},innerWidth:1200,innerHeight:800});
