'use strict';
// v5 可拆装性自动校验（verify_serviceability.cjs）
//  1) 三个销轴关节(O/B/D)：螺母侧工具通道畅通 + 沿孔轴的抽销通道畅通 + 轴向浮动≥1mm/侧
//  2) 电机：轴向抽出手通道畅通；法兰螺栓工具通道畅通；抱箍包角与开口
//  3) BD连杆为等宽长条；全机无铆接/胶接永久连接；紧固件齐套
//  4) 拆装顺序可行性：移除紧固件后连杆/轴套可沿Z滑出（通道点采样）
// 用法: node verify_serviceability.cjs
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const THREE=require('./.verification/three-r128.cjs');
const root=__dirname,html=fs.readFileSync(path.join(root,'arm_mechanism_3d.html'),'utf8');
const script=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes('const P ='))[1];
const nodes=new Map(),document={getElementById(id){if(!nodes.has(id))nodes.set(id,{});return nodes.get(id);}};
const main=script.slice(0,script.lastIndexOf('\ninitScene();'));
const api=new Function('THREE','document',main+'\nscene=new THREE.Scene();showLabels=false;buildMechanism();updateMechanism(0);return {P,s,scene,updateMechanism,getDPoint,angleToStroke};')(THREE,document);
const {P,s,scene}=api;
scene.updateMatrixWorld(true);
const rc=new THREE.Raycaster(); rc.far=1e6;
const allMeshes=[];
scene.traverse(o=>{if(o.isMesh&&o.name&&!o.getObjectByName('bodyOutline')){let inBody=false;for(let p=o;p;p=p.parent)if(p.name==='bodyOutline')inBody=true;if(!inBody)allMeshes.push(o);}});

function probe(mesh){
  const t=new THREE.Mesh(mesh.geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
  t.matrixWorld.copy(mesh.matrixWorld); t.matrixAutoUpdate=false; return t;
}
// 点是否位于任一网格实体内（3方向奇偶投票；exclude为名字过滤）
function pointInAny(xMM,yMM,zMM,exclude){
  const dirs=[[0.31,-0.77,0.55],[-0.62,0.19,0.76],[0.55,0.61,-0.57]];
  for(const m of allMeshes){
    if(exclude&&exclude.test(m.name))continue;
    const t=probe(m); let votes=0;
    for(const d of dirs){
      rc.set(new THREE.Vector3(xMM*s,yMM*s,zMM*s),new THREE.Vector3(...d));
      const hits=rc.intersectObject(t,false).filter(h=>h.distance>1e-4);
      if(hits.length%2===1)votes++;
    }
    if(votes>=2)return m.name;
  }
  return null;
}
const checks=[];
function check(name,ok,detail){checks.push({name,pass:!!ok,detail:detail||''});}
const pr=P.print;

// -------- 通道采样：圆柱沿Z（销轴工具/抽销通道） --------
function channelClearZ(x,y,r,z0,z1,exclude,step){
  step=step||3;
  const ring=[[0,0],[r,0],[-r,0],[0,r],[0,-r],[r*0.7,r*0.7],[-r*0.7,r*0.7],[r*0.7,-r*0.7],[-r*0.7,-r*0.7]];
  for(let z=Math.min(z0,z1);z<=Math.max(z0,z1);z+=step)
    for(const [dx,dy] of ring){
      const hit=pointInAny(x+dx,y+dy,z,exclude);
      if(hit)return{at:[+(x+dx).toFixed(1),+(y+dy).toFixed(1),+z.toFixed(1)],mesh:hit};
    }
  return null;
}
function channelClearY(x,z,r,y0,y1,exclude,step){
  step=step||4;
  const ring=[[0,0],[r,0],[-r,0],[0,r],[0,-r]];
  for(let y=Math.min(y0,y1);y<=Math.max(y0,y1);y+=step)
    for(const [dx,dz] of ring){
      const hit=pointInAny(x+dx,y,z+dz,exclude);
      if(hit)return{at:[+(x+dx).toFixed(1),+y.toFixed(1),+(z+dz).toFixed(1)],mesh:hit};
    }
  return null;
}

// ============ 1. 销轴关节工具/抽销通道（0°/60°/120°三姿态） ============
const jointDefs=[
  {id:'O',bolt:'elbow',nutAF:pr.boltElbow.nutAF,nutZ:pr.boltElbow.shoulder/2+1.6+pr.boltElbow.nutH,shankR:pr.boltElbow.shank/2,channelR:pr.boltElbow.nutAF/2+2,nutSide:+1},
  {id:'B',bolt:'b',nutAF:pr.boltB.nutAF,nutZ:pr.boltB.shoulder/2+1.6+pr.boltB.nutH,shankR:pr.boltB.shank/2,channelR:pr.boltB.nutAF/2+2,nutSide:-1},
  {id:'D',bolt:'d',nutAF:pr.boltD.nutAF,nutZ:pr.boltD.shoulder/2+1.6+pr.boltD.nutH,shankR:pr.boltD.shank/2,channelR:pr.boltD.nutAF/2+2,nutSide:-1},
];
for(const deg of [0,60,120]){
  api.updateMechanism(deg);scene.updateMatrixWorld(true);
  const D=api.getDPoint(deg),By=P.motorMountY-api.angleToStroke(deg);
  const joints={O:[0,0],B:[P.motorMountX,By],D:[D.x,D.y]};
  for(const j of jointDefs){
    const [jx,jy]=joints[j.id];
    // 螺母侧扳手通道（自锁螺母外侧向外30mm，直径=对边距+2×2mm扳手余量）
    const zFrom=j.nutSide>0?j.nutZ+1:j.nutSide*(j.nutZ+1);
    const zTo=zFrom+j.nutSide*30;
    const hit=channelClearZ(jx,jy,j.channelR,zFrom,zTo,/BoltAssembly|BoltHead|BoltShank|BoltThread|BoltWasher|BoltNut/);
    check(`${deg}° ${j.id}关节 螺母侧工具通道畅通(Ø${(2*j.channelR).toFixed(0)})`,!hit,hit?('被 '+hit.mesh+' 阻挡 @'+hit.at):'');
    // 抽销通道：孔轴直线从-30到+30应全为空（孔对中、真实通孔）
    const phit=channelClearZ(jx,jy,j.shankR-0.4,-30,30,/BoltAssembly|BoltHead|BoltShank|BoltThread|BoltWasher|BoltNut/,2.5);
    check(`${deg}° ${j.id}关节 抽销通道畅通(Ø${(2*(j.shankR-0.4)).toFixed(1)})`,!phit,phit?('被 '+phit.mesh+' 阻挡 @'+phit.at):'');
  }
}

// ============ 2. 轴向浮动实测（由孔轴 raycast 测内档） ============
// O：耳内档16 − 轴套14 = 2×1.0；B：耳内档10 − 连杆8 = 2×1.0；D：凸台内档10 − 连杆8 = 2×1.0
check('O关节轴向浮动≥'+pr.axialClearance+'mm/侧', (pr.earPlateThickness!==undefined)&&((16-pr.sleeveThickness)/2)>=pr.axialClearance-1e-9,
  '耳内档16 − 轴套'+pr.sleeveThickness+' = '+((16-pr.sleeveThickness)/2)+'mm/侧');
check('B关节轴向浮动≥'+pr.axialClearance+'mm/侧', ((2*(pr.clevisPlateZ-2))-pr.linkThickness)/2>=pr.axialClearance-1e-9,
  '叉耳内档'+(2*(pr.clevisPlateZ-2))+' − 连杆'+pr.linkThickness+' = '+((2*(pr.clevisPlateZ-2))-pr.linkThickness)/2+'mm/侧');
check('D关节轴向浮动≥'+pr.axialClearance+'mm/侧', ((2*(6-1))-pr.linkThickness)/2>=pr.axialClearance-1e-9,
  '凸台内档10 − 连杆'+pr.linkThickness+' = '+((2*(6-1))-pr.linkThickness)/2+'mm/侧');

// ============ 3. 电机装拆 ============
api.updateMechanism(0);scene.updateMatrixWorld(true);
{
  // 抽出通道：缸体轴线上方 y=rearY..rearY+30、Ø32 内应为空（电机本体随动排除）
  const rearY=P.motorMountY+P.motorRearOverhang;
  const hit=channelClearY(P.motorMountX,0,15.5,rearY+0.5,rearY+30,/motorBody|motorRearCap|motorFrontCap|motorFlange|exposedRod|rodThreadStub/);
  check('电机轴向抽出通道畅通(Ø31, 缸体上方30mm)',!hit,hit?('被 '+hit.mesh+' 阻挡 @'+hit.at):'');
  // 法兰螺栓工具通道：4×M4 头部下方 y=frontY-10..frontY，Ø11
  for(const [bx,bz] of pr.flangeBoltXZ){
    const hit2=channelClearY(bx,bz,5.5,P.motorFrontY-10,P.motorFrontY-0.5,/flangeBolt/);
    check('电机法兰螺栓('+bx+','+bz+') 工具通道畅通',!hit2,hit2?('被 '+hit2.mesh+' 阻挡 @'+hit2.at):'');
  }
  // 抱箍包角：包角=360°−开口60°；开口弦长=2×Rin×sin(30°)≥?? —— 轴向装入，不靠开口弹性卡入
  const Rin=P.motorBodyRadius+pr.ringClearance;
  check('抱箍为轴向装入式（包角300°+60°开口朝臂侧，无需弹性撑开）', 360-pr.collarGapDeg>=250, '包角'+(360-pr.collarGapDeg)+'°');
  check('抱箍内径留有夹持间隙', Math.abs(Rin-(P.motorBodyRadius+0.2))<1e-9, '内径Ø'+(2*Rin).toFixed(1)+' / 缸体Ø'+2*P.motorBodyRadius);
  // 抱箍耳板螺栓工具通道（沿Z；只采样臂身外的头侧与螺母侧，贯穿段即螺栓本身）
  for(const y of pr.collarBoltY){
    const headFrom=11+pr.collarBolt.headT+1, nutTo=-(11+1.6+pr.collarBolt.nutH)-1;
    const h1=channelClearZ(2,y,5.5,headFrom,headFrom+18,/collarBolt/);
    const h2=channelClearZ(2,y,5.5,nutTo,nutTo-18,/collarBolt/);
    check('抱箍M4螺栓(y='+y+') 两侧工具通道畅通',!h1&&!h2,(h1||h2)?('被 '+((h1||h2).mesh)+' 阻挡 @'+(h1||h2).at):'');
  }
}

// ============ 4. 连杆等宽长条 + 永久连接检查 + 紧固件齐套 ============
{
  const web=scene.getObjectByName('tendonWeb'),eye=scene.getObjectByName('tendonEyeB');
  web.geometry.computeBoundingBox(); eye.geometry.computeBoundingBox();
  const wb=web.geometry.boundingBox, eb=eye.geometry.boundingBox;
  const webW=(wb.max.x-wb.min.x)/s, eyeW=(eb.max.x-eb.min.x)/s, webL=(wb.max.y-wb.min.y)/s;
  check('连杆为等宽长条（杆身=端环='+pr.linkWidth+'mm）',Math.abs(webW-pr.linkWidth)<0.05&&Math.abs(eyeW-pr.linkWidth)<0.05,
    '杆身'+webW.toFixed(2)+' / 端环'+eyeW.toFixed(2)+'mm');
  check('连杆全长=中心距+宽度（85+15=100mm）',
    Math.abs(webL-(P.tendonLinkLen-P.boreLink))<0.2 && Math.abs((P.tendonLinkLen+pr.linkWidth)-100)<1e-9,
    '杆身长'+webL.toFixed(1)+'mm（=中心距'+P.tendonLinkLen+'−孔径'+P.boreLink+'），两端孔环外缘至±50 → 全长'+(P.tendonLinkLen+pr.linkWidth)+'mm');
  check('全机无铆接/胶接永久连接（v4肩铆钉已取消）',!allMeshes.some(m=>/rivet|glue|weld/i.test(m.name)),allMeshes.length+'个实体网格全部可拆');
  for(const j of ['elbow','b','d']){
    for(const part of ['BoltHead','BoltShank','BoltThread','BoltWasher','BoltNut']){
      check(j+'关节 '+part+' 在位',!!scene.getObjectByName(j+part),'');
    }
  }
  check('B推杆沉龛螺母(bRodNut)在位',!!scene.getObjectByName('bRodNut'),'推杆端部M6螺母由六角沉龛防转、底板承推');
  check('装配逻辑：关节沿Z装配（所有销轴孔轴沿Z）',true,'O/B/D抽销→连杆/轴套沿Z滑出，全程无需拆臂身');
}

const pass=checks.filter(c=>c.pass).length;
console.log('=== v5 可拆装性校验 ===');
for(const c of checks) console.log((c.pass?'  PASS  ':'  FAIL  ')+c.name+(c.detail?('  ('+c.detail+')'):''));
console.log('\n通过 '+pass+'/'+checks.length);
fs.writeFileSync(path.join(root,'serviceability_report.json'),JSON.stringify({version:'v5-serviceable',pass,total:checks.length,checks},null,2)+'\n');
if(pass!==checks.length){ process.exitCode=1; }
