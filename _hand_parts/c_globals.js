let scene, camera, renderer, controls;
const FINGERS = {};            // key -> {key,label,n,limits,root,groups[],motors[],tendons[],pose[]}
let trailLines = [], labels = [], bodyOutline;
let isPlaying = false, animDir = 1, animSpeed = 1.0, animU = 0;
let showGrid = true, showLabels = true, showTrail = true, showBody = true;

function fingerDef(key){ for(const f of HAND.fingers) if(f.key===key) return f; return null; }
function clampPose(key, arr){
  const def=fingerDef(key), L=def?def.limits:[0], out=[];
  for(let i=0;i<L.length;i++){
    const v=(arr&&arr[i]!==undefined)?Number(arr[i]):0;
    out.push(Math.max(0, Math.min(L[i], isNaN(v)?0:v)));
  }
  return out;
}
function currentPose(){ const p={}; for(const k of HAND.keys){ const F=FINGERS[k]; if(F) p[k]=F.pose.slice(); } return p; }
// 完整姿态：pose = {指key:[角度...]}；同步全部滑杆
function setPose(pose){
  for(const k of HAND.keys){
    const F=FINGERS[k]; if(!F) continue;
    F.pose = clampPose(k, (pose&&pose[k]!==undefined)?pose[k]:F.pose);
  }
  updateMechanism();
  updateSliderLabels();
}
// 抓握比例 u∈[0,1]：各指按自身安全包络等比联动
function gripPose(u, thumbScale){
  const p={};
  for(const f of HAND.fingers){
    const k=(f.key==='thumb')?(thumbScale===undefined?1:thumbScale):1;
    p[f.key]=f.limits.map(function(l){return l*u*k;});
  }
  return p;
}
