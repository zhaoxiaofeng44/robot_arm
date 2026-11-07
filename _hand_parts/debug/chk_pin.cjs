const fs=require('fs'), path=require('path');
const G=require('/Users/xf/workspace/myArm/robot_arm/.verification/geom2d.cjs'), THREE=G.THREE;
const root='/Users/xf/workspace/myArm/robot_arm';
const html=fs.readFileSync(path.join(root,'hand_mechanism_3d.html'),'utf8');
const sc=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes('const P ='))[1];
const nodes=new Map();
function mol(){return{style:{},textContent:'',innerHTML:'',value:'0',className:'',checked:true,_h:{},addEventListener(){},appendChild(){},querySelector(){return null}};}
const document={getElementById(id){if(!nodes.has(id))nodes.set(id,mol());return nodes.get(id);},createElement(){return mol();},getContext(){return{font:'',fillStyle:'',measureText(){return{width:40}},fillText(){}};}};
const main=sc.slice(0,sc.lastIndexOf('\ninitScene();'));
const tail=[
'','scene=new THREE.Scene();showLabels=false;buildMechanism();updateMechanism();','scene.updateWorldMatrix(true,true);',
'var pins=[]; scene.traverse(function(o){ if(o.name.indexOf("palmHingePin")===0) pins.push(o.name+" x="+(o.position.x/s).toFixed(1)+" z="+(o.position.z/s).toFixed(1)); });',
'console.log("PINS:", pins.join(" | "));',
'var F=FINGERS.thumb; var wp=new THREE.Vector3(); F.root.getWorldPosition(wp);',
'console.log("THUMB ROOT WORLD mm:", (wp.x/s).toFixed(1), (wp.y/s).toFixed(1), (wp.z/s).toFixed(1));',
'var TF=scene.getObjectByName("thumbPalmFlapGroup"); console.log("thumbFlap children:", TF.children.length);',
'var FF=scene.getObjectByName("palmArcFlapGroup"); console.log("fourFlap children:", FF.children.length);'
].join('\n');
new Function('THREE','document','requestAnimationFrame','window',main+'\nscene=new THREE.Scene();showLabels=false;buildMechanism();updateMechanism();'+tail+';return {}')(THREE,document,function(){},{addEventListener:function(){},innerWidth:1200,innerHeight:800});
