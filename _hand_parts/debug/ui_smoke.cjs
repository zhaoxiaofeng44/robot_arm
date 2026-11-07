// UI 全路径冒烟：模拟 setupUI/预设/滑杆/播放，逐姿态走 updateMechanism
const fs=require('fs'),path=require('path');
const G=require('/Users/xf/workspace/myArm/robot_arm/.verification/geom2d.cjs');
const THREE=G.THREE;
const root='/Users/xf/workspace/myArm/robot_arm';
const html=fs.readFileSync(path.join(root,'hand_mechanism_3d.html'),'utf8');
const script=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes('const P ='))[1];
const nodes=new Map();
function mockEl(){ return { style:{},textContent:'',innerHTML:'',value:'0',className:'',checked:true,
  _h:{},
  addEventListener(ev,fn){ this._h[ev]=fn; },
  appendChild(){},
  dispatch(ev,arg){ if(this._h[ev]) this._h[ev](arg||{target:this}); } }; }
const document={ getElementById(id){ if(!nodes.has(id)) nodes.set(id,mockEl()); return nodes.get(id); },
  createElement(){ return mockEl(); },
  getContext(){ return { font:'', fillStyle:'', measureText(){return{width:40};}, fillText(){} }; } };
const main=script.slice(0, script.lastIndexOf('\ninitScene();'));
const tail = [
'',
'scene = new THREE.Scene(); showLabels=false;',
'buildMechanism(); updateMechanism();',
'try { setupUI(); } catch(e) { console.log("setupUI ERROR:", e.message); }',
'for (const id of ["btn-preset-open","btn-preset-half","btn-preset-fist","btn-preset-pinch","btn-preset-index","btn-preset-thumb","btn-spread-open","btn-spread-close"]) {',
'  try { const el=document.getElementById(id); if(el&&el._h&&el._h.click) el._h.click(); } catch(e){ console.log("BTN",id,"ERROR:",e.message); }',
'}',
'let foldOK=true;',
'for (let v=-12; v<=5; v+=0.5) {',
'  FINGERS.thumb.fold = v; updateMechanism();',
'  const cd = lateralCrankPoints(THUMB_FOLD.crankR, v, 1);',
'  const dx = cd.D.x-cd.B.x, dy = cd.D.y-cd.B.y;',
'  if (Math.abs(Math.sqrt(dx*dx+dy*dy) - P.tendonLinkLen) > 1e-6) foldOK=false;',
'}',
'console.log("thumb fold scan |BD|-85 err<=1e-6 :", foldOK);',
'let spreadOK=true;',
'for (const k of HAND.keys) {',
'  const F=FINGERS[k], ZS=(k==="thumb")?-1:1, R=(k==="thumb")?SPREAD.thumbCrankR:SPREAD.crankR;',
'  for (let v=-12; v<=12; v+=0.5) {',
'    F.spread=v; updateMechanism();',
'    const cd=lateralCrankPoints(R,v,ZS);',
'    const dx=cd.D.x-cd.B.x, dy=cd.D.y-cd.B.y;',
'    if (Math.abs(Math.sqrt(dx*dx+dy*dy)-P.tendonLinkLen)>1e-6) spreadOK=false;',
'  }',
'  F.spread=0;',
'}',
'console.log("spread scan |BD|-85 err<=1e-6 :", spreadOK);',
'let curlOK=true;',
'for (const k of HAND.keys) for (let i=0;i<3;i++){',
'  const F=FINGERS[k], save=F.pose.slice();',
'  for (let v=0; v<=F.limits[i]; v+=2.5){ F.pose=save.slice(); F.pose[i]=v; updateMechanism(); }',
'  F.pose=save; updateMechanism();',
'}',
'console.log("curl scan all 15 joints : OK");',
'FINGERS.thumb.fold=-12; setPose({index:[49.5,49.5,38.5], thumb:[54,54,42], middle:[0,0,0], ring:[0,0,0], pinky:[0,0,0]});',
'console.log("pinch pose OK, thumb tip y=", (getJoints({}).thumb.tip.y/s).toFixed(0), "mm");',
'FINGERS.thumb.fold=0; updateMechanism();',
'console.log("UI SMOKE DONE");',
''].join('\n');
const api=new Function('THREE','document','requestAnimationFrame','window',
  main+'\nscene=new THREE.Scene();showLabels=false;buildMechanism();updateMechanism();' +
  tail +
  ';return {P,s,scene,getJoints,FINGERS,HAND,SPREAD,THUMB_FOLD,lateralCrankPoints,setPose,updateMechanism}')(THREE,document,function(){}, {addEventListener:function(){},innerWidth:1200,innerHeight:800});
console.log('boot OK');