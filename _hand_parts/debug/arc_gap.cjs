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
const tail=[ '',
'scene=new THREE.Scene();showLabels=false;buildMechanism();updateMechanism();',
'// 各指中轴采样：指尖/关节世界坐标（掌弓角 0..-15 + 各指抓握比例）',
'function sample(k, u){ const F=FINGERS[k]; return fingerChain(k, F.limits.map(function(l){return l*u;})).tip; }',
'let worst=1e9, worstAt=null;',
'for (let u=0; u<=1.0001; u+=0.1) for (let a=0; a>=-8.0001; a-=0.5){',
'  HAND.arcPhi=a; updateMechanism();',
'  const mt=sample("middle",u), rt=sample("ring",u), it=sample("index",u);',
'  const d1=mt.distanceTo(rt)/s, d2=it.distanceTo(rt)/s;',
'  if (u<0.3 && a<-4.001) continue; if (d1<worst){worst=d1;worstAt="mid-ring u="+u.toFixed(1)+" a="+a;}',
'  if (d2<worst){worst=d2;worstAt="idx-ring u="+u.toFixed(1)+" a="+a;}',
'}',
'HAND.arcPhi=0; updateMechanism();',
'console.log("worst tip gap mm:", worst.toFixed(1), "at", worstAt);',
''].join('\n');
new Function('THREE','document','requestAnimationFrame','window',
  main+'\nscene=new THREE.Scene();showLabels=false;buildMechanism();updateMechanism();'+tail+
  ';return {}')(THREE,document,function(){},{addEventListener:function(){},innerWidth:1200,innerHeight:800});
console.log('done');