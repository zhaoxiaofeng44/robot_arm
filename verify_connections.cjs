'use strict';
// verify_connections.cjs - 连接物理性审计（独立于既有校验器）
//   用法: node verify_connections.cjs [finger|arm|hand]   （每个目标各出一份报告 + 审计日志）
const fs=require('fs'),path=require('path');
const THREE=require('./.verification/three-r128.cjs');
const root=__dirname;
const target=(process.argv[2]||'finger');
const FILE={finger:'finger_mechanism_3d.html',arm:'arm_mechanism_3d.html',hand:'hand_mechanism_3d.html'}[target];
const html=fs.readFileSync(path.join(root,FILE),'utf8');
const script=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes('const P ='))[1];
const nodes=new Map(),document={getElementById(id){if(!nodes.has(id))nodes.set(id,{});return nodes.get(id);}};
const main=script.slice(0,script.lastIndexOf('\ninitScene();'));
const api=new Function('THREE','document',main+
  '\nscene=new THREE.Scene();showLabels=false;buildMechanism();updateMechanism(0);'+
  'return {P,s,scene,updateMechanism,angleToStroke,getStrokeFromAngle,transmissionAngle,getForceData,LIMITS:(typeof LIMITS!=="undefined"?LIMITS:null),'+
  'getJoints:(typeof getJoints!=="undefined"?getJoints:null)};')(THREE,document);
const {P,s,scene}=api;
scene.updateMatrixWorld(true);
const out=[],FAIL=[];
const say=(...a)=>{const l=a.join(' ');out.push(l);fs.appendFileSync(path.join(root,'connections_audit_'+target+'.log'),l+'\n');};
const bad=(...a)=>{FAIL.push(a.join(' '));say('   !! '+a.join(' '));};
const f=(x,n)=>(x===undefined||x===null)?String(x):(+x).toFixed(n===undefined?3:n);
const rc=new THREE.Raycaster();
const mesh=n=>scene.getObjectByName(n);
function bboxMM(name){
  const m=mesh(name); if(!m)return null;
  m.updateMatrixWorld(true);
  const a=m.geometry.attributes.position,v=new THREE.Vector3();
  const mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];
  for(let i=0;i<a.count;i++){v.set(a.getX(i),a.getY(i),a.getZ(i)).applyMatrix4(m.matrixWorld);
    const c=[v.x/s,v.y/s,v.z/s];
    for(let k=0;k<3;k++){mn[k]=Math.min(mn[k],c[k]);mx[k]=Math.max(mx[k],c[k]);}}
  return {mn,mx,size:[mx[0]-mn[0],mx[1]-mn[1],mx[2]-mn[2]],c:[(mn[0]+mx[0])/2,(mn[1]+mx[1])/2,(mn[2]+mx[2])/2]};
}
function zHits(name,x,y){
  const m=mesh(name); if(!m)return null;
  const t=new THREE.Mesh(m.geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
  t.matrixWorld.copy(m.matrixWorld); t.matrixAutoUpdate=false;
  let n=0;
  for(const z0 of [-400,400]){
    rc.set(new THREE.Vector3(x*s,y*s,z0*s),new THREE.Vector3(0,0,z0<0?1:-1));
    n+=rc.intersectObject(t,false).filter(h=>h.distance>1e-4).length;
  }
  return n;
}
function materialSpan(name,x,y){
  const m=mesh(name); if(!m)return null;
  const t=new THREE.Mesh(m.geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
  t.matrixWorld.copy(m.matrixWorld); t.matrixAutoUpdate=false;
  rc.set(new THREE.Vector3(x*s,y*s,-400*s),new THREE.Vector3(0,0,1));
  return rc.intersectObject(t,false).filter(h=>h.distance>1e-4).map(h=>h.point.z/s).sort((a,b)=>a-b);
}
function yHits(name,x,z){                     // 沿 ±Y 射线命中次数（判断孔轴沿 Y 的孔是否存在）
  const m=mesh(name); if(!m)return null;
  const t=new THREE.Mesh(m.geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
  t.matrixWorld.copy(m.matrixWorld); t.matrixAutoUpdate=false;
  let n=0;
  for(const y0 of [-400,400]){
    rc.set(new THREE.Vector3(x*s,y0*s,z*s),new THREE.Vector3(0,y0<0?1:-1,0));
    n+=rc.intersectObject(t,false).filter(h=>h.distance>1e-4).length;
  }
  return n;
}
function inSolid(name,x,y,z){
  const m=mesh(name); if(!m)return false;
  const t=new THREE.Mesh(m.geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
  t.matrixWorld.copy(m.matrixWorld); t.matrixAutoUpdate=false;
  let votes=0;
  for(const d of [[0.31,-0.77,0.55],[-0.62,0.19,0.76],[0.55,0.61,-0.57]]){
    rc.set(new THREE.Vector3(x*s,y*s,z*s),new THREE.Vector3(d[0],d[1],d[2]));
    const h=rc.intersectObject(t,false).filter(q=>q.distance>1e-4);
    if(h.length%2===1)votes++;
  }
  return votes>=2;
}
let nm=0;scene.traverse(o=>{if(o.isMesh)nm++;});
say('######################################################################');
say('# 连接物理性审计  target='+target+'  ('+FILE+')   网格数='+nm);
say('######################################################################');
say('');
say('== 0. 基准参数 ==');
say('   电机 Ø'+(2*P.motorBodyRadius)+'x'+P.motorBodyLen+'  A=('+P.motorMountX+','+P.motorMountY+')  前端面 y='+P.motorFrontY+'  后端面 y='+(P.motorMountY+P.motorRearOverhang));
say('   连杆 BD='+P.tendonLinkLen+'  D0=('+P.forearmAttachOffset+','+(-P.forearmAttachDist)+')  O销Ø'+(2*P.elbowPinRadius)+'  B/D销Ø'+(2*P.linkPinRadius));
say('   安装板 y0='+P.print.flangePlateY0+' 厚'+P.print.flangePlateT+'  抱箍 y='+P.print.collarY0+'..'+P.print.collarY1+'  拼接孔Ø'+P.print.spliceBoltDia+'@x=±'+P.print.spliceBoltInset+'  y偏移'+P.print.spliceBoltOff);

say('');
say('== 1. 电机安装：前法兰 <-> 安装板（承推面）==');
const TEN=(target==='arm')?[['motor','upperArm']]
        :(target==='finger')?[['m0','palm'],['m1','p1'],['m2','p2']]
        :[['m1','p1'],['m2','p2']];
const BODIES=(target==='arm')?[['','upperArmBodyProximal']]
        :(target==='finger')?[['m0','palmBodyProximal'],['m1','p1BodyHeel'],['m2','p2BodyHeel']]
        :[['m1','p1BodyProximal'],['m2','p2BodyHeel']];
const MOTORS=(target==='arm')?['']:((target==='finger')?['m0','m1','m2']:['m1','m2']);
const JOINTS=(target==='arm')
  ?[['O','elbowForkLeft','elbowSleeveBody','elbowBoltShank'],
    ['D','dClevisBossLeft','dClevisBossRight','dBoltShank'],
    ['B','bClevisPlateLeft','bClevisPlateRight','bBoltShank']]
  :(target==='finger')
    ?[['O0','palmForkL','p1SleeveBody','o0BoltShank'],
      ['D0','p1DClevisBossL','p1DClevisBossR','p1dBoltShank'],
      ['B0','m0ClevisPlateL','m0ClevisPlateR','m0bBoltShank'],
      ['O1','p1ForkL','p2SleeveBody','o1BoltShank'],
      ['D1','p2DClevisBossL','p2DClevisBossR','p2dBoltShank'],
      ['B1','m1ClevisPlateL','m1ClevisPlateR','m1bBoltShank'],
      ['O2','p2ForkL','p3SleeveBody','o2BoltShank'],
      ['D2','p3DClevisBossL','p3DClevisBossR','p3dBoltShank'],
      ['B2','m2ClevisPlateL','m2ClevisPlateR','m2bBoltShank']]
    :[['O1','p1ForkL','p2SleeveBody','o1BoltShank'],
      ['D1','p2DClevisBossL','p2DClevisBossR','p2dBoltShank'],
      ['B1','m1ClevisPlateL','m1ClevisPlateR','m1bBoltShank'],
      ['O2','p2ForkL','p3SleeveBody',null],
      ['D2','p3DClevisBossL','p3DClevisBossR','p3dBoltShank'],
      ['B2','m2ClevisPlateL','m2ClevisPlateR','m2bBoltShank']];
const ANCH=(target==='arm')?[['bClevis','dBoltAssembly']]
  :(target==='finger')?[['m0BClevis','p1dBoltAssembly'],['m1BClevis','p2dBoltAssembly'],['m2BClevis','p3dBoltAssembly']]
  :[['m1BClevis','p2dBoltAssembly'],['m2BClevis','p3dBoltAssembly']];
const motes=TEN;
for(const mp of motes){
  const M=mp[0],PFX=mp[1];
  const FL=(target==='arm')?'motorFlange':M+'MotorFlange', PL=(target==='arm')?'motorFlangePlate':PFX+'FlangePlate';
  const a=bboxMM(FL),b=bboxMM(PL); if(!a||!b){bad('缺少 '+FL+' / '+PL);continue;}
  say('   '+FL+'  y=['+f(a.mn[1])+','+f(a.mx[1])+']  外径Ø'+f(a.size[0]));
  say('   '+PL+'  y=['+f(b.mn[1])+','+f(b.mx[1])+']');
  const gap=b.mn[1]-a.mx[1];
  if(Math.abs(gap)<0.05)say('   -> 法兰顶面与安装板底面共面：接触 OK');
  else if(gap>0)bad('法兰顶面 y='+f(a.mx[1])+' 与安装板底面 y='+f(b.mn[1])+' 悬空 '+f(gap)+'mm - 轴向力传不到安装板');
  else bad('法兰与安装板实体重叠 '+f(-gap)+'mm');
  const HD=(target==='arm')?'flangeBoltHead1':M+'FlangeBolt1Head', hd=bboxMM(HD);
  if(hd){const g2=a.mn[1]-hd.mx[1];
    if(Math.abs(g2)<0.05)say('   '+HD+' 顶面 y='+f(hd.mx[1])+' 顶住法兰底面 OK');
    else if(g2>0)bad('螺钉头与法兰底面之间 '+f(g2)+'mm 间隙 - 夹不住法兰');
    else bad('螺钉头与法兰重叠 '+f(-g2)+'mm');}
  const hs=zHits(PL,P.motorMountX,0);
  say('   安装板导出孔(x='+P.motorMountX+',z=0) 射线命中 '+hs+(hs===0?'  -> 通孔 OK':'  -> 有实体 !!'));
  for(const bx of [12,44]){
    const h=zHits(PL,bx,13);
    say('   安装板 M4 孔(x='+bx+',z=13) 射线命中 '+h+(h===0?'  -> 通孔 OK':'  -> 有实体 !!'));
  }
}
say('');
say('== 2. 后抱箍 <-> 段身（2xM4 贯穿 + 双侧耳板）==');
{
  const bodies=BODIES;
  const tabs=[];
  scene.traverse(o=>{if(o.isMesh&&/ollarTab/i.test(o.name))tabs.push(o.name);});
  say('   抱箍耳板网格 ('+tabs.length+' 片): '+tabs.join(', '));
  const tabTags=(target==='arm')?['Left','Right']:['A','B'];
  tabTags.forEach((tag,i)=>{
    const names=tabs.filter(n=>target==='arm'? n.indexOf('collarTab'+tag)===0 : n.indexOf('CollarTab'+tag)>=0);
    const zs=names.map(n=>{const b=bboxMM(n);return b?b.c[2]:null;}).filter(z=>z!==null);
    const hasP=zs.some(z=>z>0),hasN=zs.some(z=>z<0);
    say('   螺栓'+tag+'：耳板 '+names.length+' 片  z>0:'+hasP+'  z<0:'+hasN+(hasP&&hasN?'  -> 双侧夹持 OK':'  -> 单侧 !!'));
    if(!(hasP&&hasN))bad('抱箍螺栓'+tag+' 只有单侧耳板：另一侧螺母/垫圈悬空，M4 锁不紧（设计为 z=±7..11 双耳板）');
  });
  for(const [M,BODY] of bodies){
    const body=bboxMM(BODY); if(!body){bad('缺少 '+BODY);continue;}
    const boltName=(target==='arm')?'collarBoltShankA':M+'CollarBoltShankA';
    const bo=bboxMM(boltName);
    say('   '+BODY+' z=['+f(body.mn[2])+','+f(body.mx[2])+']  抱箍螺栓孔位 y='+P.print.collarBoltY.join('/'));
    if(bo)say('   '+boltName+' 光杆 z=['+f(bo.mn[2])+','+f(bo.mx[2])+'] 长 '+f(bo.size[2])+'mm；双侧夹持所需 = 段身'+f(body.size[2])+'+2x4 = '+f(body.size[2]+8)+'mm');
  }
}

say('');
say('== 3. 分段拼接：M4 竖向贯穿（垫板有孔；本体也必须开孔）==');
{
  const bolts=[];
  scene.traverse(o=>{if(o.isMesh&&/SpliceBolt[LR]$/.test(o.name)){
    const p=new THREE.Vector3(0,0,0).applyMatrix4(o.matrixWorld);
    bolts.push({name:o.name,x:p.x/s,y:p.y/s});}});
  const seen=new Set();
  for(const b of bolts){
    const bodies=[];
    scene.traverse(o=>{if(o.isMesh&&/Body/.test(o.name)){const bb=bboxMM(o.name);
      if(bb&&b.x>=bb.mn[0]-0.01&&b.x<=bb.mx[0]+0.01&&b.y>=bb.mn[1]-0.01&&b.y<=bb.mx[1]+0.01&&bodies.indexOf(o.name)<0)bodies.push(o.name);}});
    if(!bodies.length)continue;
    const owner=bodies.join('+');
    const key=b.name+':'+owner; if(seen.has(key))continue; seen.add(key);
    const span=materialSpan(bodies[0],b.x,b.y);
    const pass=span&&span.length===0;
    say('   '+b.name+' @(x='+f(b.x)+',y='+f(b.y)+') 穿过本体 '+owner+'  z向实体命中 '+span.length+'  '+(pass?'-> 有通孔 OK':'-> 螺栓穿实体 !!'));
    if(!pass)bad(b.name+' 穿过的本体 '+owner+' 在 (x='+f(b.x)+',y='+f(b.y)+') 无通孔 - 螺栓装不进去');
    if(!pass){const pr2=[-0.4,-0.2,0,0.2,0.4].map(d=>f(b.x+d,2)+':'+(materialSpan(bodies[0],b.x+d,b.y)||[]).length).join('  ');say('      探针(x偏移:命中数) '+pr2);}
  }
  if(!bolts.length)say('   （未找到 SpliceBolt 网格）');
}
say('');
say('== 4. B 推杆叉头：底板通孔 / 螺母落位 ==');
for(const M of MOTORS){
  const nutN=(M?M:'b')+'RodNut';
  const floorN=(target==='arm')?'bClevisBridgeFloor':(M?M:'b')+'BridgeFloor';
  const stubN=(target==='arm')?'rodThreadStub':(M?M:'b')+'RodThreadStub';
  const nut=bboxMM(nutN),fl=bboxMM(floorN),stub=bboxMM(stubN);
  if(!nut||!fl){bad('缺少 '+nutN+' / '+floorN);continue;}
  say('   ['+(M||'arm')+'] '+floorN+' y=['+f(fl.mn[1])+','+f(fl.mx[1])+'] （底板 18x2x18）');
  say('        '+nutN+' y=['+f(nut.mn[1])+','+f(nut.mx[1])+'] 高'+f(nut.size[1])+' 对边10');
  const ov=Math.min(nut.mx[1],fl.mx[1])-Math.max(nut.mn[1],fl.mn[1]);
  say('        螺母<->底板 y 重叠 = '+f(ov)+'mm '+(ov>0.05?'-> 螺母陷在底板内部 !!':'-> 螺母坐在底板顶面 OK'));
  if(ov>0.05)bad(nutN+' 与底板重叠 '+f(ov)+'mm（应坐在底板顶面 y='+f(fl.mx[1])+'）');
  const span=materialSpan(floorN,P.motorMountX,fl.c[1]);
  const rodAbove=stub? (stub.mn[1]-fl.mx[1]) : 0;         // 杆端面相对底板顶面（>0=杆端在底板上方）
  const holeOK=span.length===0;
  say('        底板中心 实体命中 '+span.length+(holeOK?' -> 有通孔':' -> 实心'));
  if(!holeOK&&rodAbove>-0.01) say('        杆端面高于底板顶面 '+f(rodAbove)+'mm、螺母坐在底板顶面 → 底板无需开孔 ✓');
  else if(!holeOK) bad(floorN+' 中心实心但推杆端已伸进底板 '+f(-rodAbove)+'mm → 装配不成立');
  if(stub){
    const eng=Math.min(stub.mx[1],nut.mx[1])-Math.max(stub.mn[1],nut.mn[1]);
    say('        杆端螺纹段 y=['+f(stub.mn[1])+','+f(stub.mx[1])+']  与螺母啮合长度 = '+f(eng)+'mm（≥2mm 可用）');
    if(eng<2)bad(nutN+' 与推杆螺纹啮合仅 '+f(eng)+'mm，偏少');
  }
  // 围壁是否完整包住螺母（防转前提）
  const wall=(M?M:'b')+'BridgeWallZP'; const wb=bboxMM(wall);
  if(wb){
    const covers=wb.mn[1]<=nut.mn[1]+0.01&&wb.mx[1]>=nut.mx[1]-0.01;
    say('        防转围壁 y=['+f(wb.mn[1])+','+f(wb.mx[1])+'] 相对螺母[ '+f(nut.mn[1])+','+f(nut.mx[1])+'] '+(covers?'完整包住 OK（拉力靠螺纹副+防转传递）':'未包住螺母 !!'));
  }
}

if(target==='finger'){
  say('');
  say('== 5. 手掌侧接口：palm_mount <-> 掌段指根方块 ==');
  const blk=bboxMM('palmBase'),base=bboxMM('palmFlangeBase');
  say('   palmBase(指根方块)     y=['+f(blk.mn[1])+','+f(blk.mx[1])+']  x±'+f(blk.size[0]/2)+' z±'+f(blk.size[2]/2));
  say('   palmFlangeBase(法兰板) y=['+f(base.mn[1])+','+f(base.mx[1])+']  x±'+f(base.size[0]/2)+' z±'+f(base.size[2]/2));
  const g=base.mn[1]-blk.mx[1];
  say('   法兰板底面 vs 方块顶面 间隙 = '+f(g)+'mm '+(Math.abs(g)<0.05?'-> 面接触 OK':'-> 悬空/干涉 !!'));
  if(Math.abs(g)>0.05)bad('palm_mount 与指根方块未贴合（间隙 '+f(g)+'mm）');
  for(const [bx,bz] of P.print.rootBoltXZ){
    const ph=yHits('palmFlangeBase',bx,bz), bh=yHits('palmBase',bx,bz);
    const ok=(ph===0&&bh===0);
    say('   内圈 M4 @(x='+bx+',z='+bz+')：法兰过孔命中'+ph+(ph===0?' 通孔OK':' 实心!!')+'；方块底孔命中'+bh+(bh===0?' 通孔OK':' 实心!!'));
    if(!ok)bad('palm_mount 内圈 M4 接口 (x='+bx+',z='+bz+') 孔不成立');
  }
  const pb=bboxMM('palmMountBolt1');
  if(pb)say('   M4×16 螺栓杆 y=['+f(pb.mn[1])+','+f(pb.mx[1])+']（穿法兰板6 + 旋入方块10）');
  const outer=[[22,22],[22,-22],[-22,22],[-22,-22]];
  say('   外圈 Ø5.5 掌侧孔: '+outer.map(([a,b])=>'('+a+','+b+')').join(' ')+'  命中='+outer.map(([a,b])=>yHits('palmFlangeBase',a,b)).join('/')+'（手掌球窝侧零件未建模）');
}

say('');
say('== 6. 销轴副堆叠（孔 / 浮动 / 销杆）==');
{
  const joints=JOINTS;
  for(const j of joints){
    const id=j[0],aN=j[1],bN=j[2],boltName=j[3];
    const a=bboxMM(aN),b=bboxMM(bN);
    if(!a||!b){say('   '+id+': 缺件 '+(a?'':aN)+' '+(b?'':bN));continue;}
    say('   '+id+'  '+aN+' z=['+f(a.mn[2])+','+f(a.mx[2])+']   '+bN+' z=['+f(b.mn[2])+','+f(b.mx[2])+']');
    if(boltName&&mesh(boltName)){
      const bo=bboxMM(boltName);
      const lo=Math.min(a.mn[2],b.mn[2]),hi=Math.max(a.mx[2],b.mx[2]);
      const ok=bo.mn[2]<=lo+1e-6&&bo.mx[2]>=hi-1e-6;
      say('      '+boltName+' z=['+f(bo.mn[2])+','+f(bo.mx[2])+'] 长'+f(bo.size[2])+' 需覆盖['+f(lo)+','+f(hi)+'] '+(ok?'OK':'!! 未贯穿'));
      if(!ok)bad(id+' 销杆未贯穿全部被连接件');
    }
  }
}

say('');
say('== 7. 运动学 / 连杆错位 ==');
if(!api.getJoints){say('   （该模型无 getJoints，跳过）');}
else{
  const step=0.5;let worstClosure=0,worstOff=0,worstAnchor=0,minT=1e9,maxT=-1e9,mono=true,rodMin=1e9,rodMax=-1e9;
  const prevS=[null,null,null];
  const anchPairs=ANCH;
  const isF=(target==='finger'), L=(isF&&api.LIMITS)?api.LIMITS:{mcp:120,pip:120,dip:120};
  for(let i=0;i<=120/step;i++){
    const u=step*i/120, d0=L.mcp*u, d1=(L.pip||120)*u, d2=(L.dip||120)*u;
    const call=isF?[d0,d1,d2]:[d1,d2];
    api.updateMechanism(...call);scene.updateMatrixWorld(true);
    const J=api.getJoints(...call);
    const units=isF?[[0,'t0Tendon',J.B0,J.D0,d0],[1,'t1Tendon',J.B1,J.D1,d1],[2,'t2Tendon',J.B2,J.D2,d2]]
                   :[[1,'t1Tendon',J.B1,J.D1,d1],[2,'t2Tendon',J.B2,J.D2,d2]];
    for(const [idx,tn,Bc,Dc,ang] of units){
      if(!Bc||!Dc)continue;
      const td=mesh(tn);
      if(td){td.updateMatrixWorld(true);
        const B=new THREE.Vector3(0,P.tendonLinkLen/2*s,0).applyMatrix4(td.matrixWorld);
        const D=new THREE.Vector3(0,-P.tendonLinkLen/2*s,0).applyMatrix4(td.matrixWorld);
        worstOff=Math.max(worstOff,Math.hypot(B.x/s-Bc.x,B.y/s-Bc.y),Math.hypot(D.x/s-Dc.x,D.y/s-Dc.y));}
      worstClosure=Math.max(worstClosure,Math.abs(Math.hypot(Bc.x-Dc.x,Bc.y-Dc.y)-P.tendonLinkLen));
      const ta=api.transmissionAngle(ang);minT=Math.min(minT,ta);maxT=Math.max(maxT,ta);
      const sv=api.angleToStroke(ang);if(prevS[idx]!==null&&sv>=prevS[idx])mono=false;prevS[idx]=sv;
    }
    // 连杆两端锚点（B 叉头 / D 销）实际距离：刚性连杆必须恒 = BD（防 placeLink 拉伸假闭合）
    for(const anch of anchPairs){
      const A=new THREE.Vector3(),Bv=new THREE.Vector3();
      const oa=mesh(anch[0]),ob=mesh(anch[1]);
      if(!oa||!ob)continue;
      oa.getWorldPosition(A);ob.getWorldPosition(Bv);
      const dd=Math.hypot(A.x-Bv.x,A.y-Bv.y)/s;
      worstAnchor=Math.max(worstAnchor,Math.abs(dd-P.tendonLinkLen));
    }
    // 单元1局部系（关节在局部 y=-phalanx1Len）：推杆外露 = 电机前端面 -> 叉头桥顶
    if(isF&&J.B1l){
      const rod=(P.motorFrontY-((J.B1l.y+P.phalanx1Len)+P.print.bridgeY1));
      rodMin=Math.min(rodMin,rod);rodMax=Math.max(rodMax,rod);
    }
  }
  say('   连杆孔心<->销心 最大偏差 = '+worstOff.toExponential(2)+' mm  (应 0)');
  say('   闭环 |BD|-85 最大误差 = '+worstClosure.toExponential(2)+' mm');
  say('   连杆两端锚点(B叉头<->D销)距 最大偏差 = '+f(worstAnchor)+' mm  (刚杆应恒 0)');
  say('   传动角范围 = '+f(minT,2)+' .. '+f(maxT,2)+' deg');
  if(isF)say('   推杆外露(前端面->叉头桥顶) = '+f(rodMin,2)+' .. '+f(rodMax,2)+' mm ；行程需求 '+f(api.getStrokeFromAngle(L.mcp),2)+' mm');
  say('   s(theta) 单调（无死点）：'+(mono?'是 OK':'否 !!'));
  if(worstOff>1e-6)bad('连杆孔心与销心不重合 -> 销轴插不进/连杆错位');
  if(worstAnchor>0.05)bad('连杆两端锚点距偏离 85mm 达 '+f(worstAnchor)+'mm（连杆被拉伸/两端错位）');
  if(!mono)bad('s(theta) 非单调 -> 有奇异/死点');
  if(minT<25)bad('最小传动角 '+f(minT,2)+' deg 偏小');
  const g=api.getForceData(60);
  say('   [参考] theta=60 理想静载杆力 '+f(g.forceN,1)+' N（5kg@250mm）');
}
fs.appendFileSync(path.join(root,'connections_audit_'+target+'.log'),'ALL-DONE fails='+FAIL.length+'\n');
fs.writeFileSync(path.join(root,'connections_verify_report_'+target+'.txt'),out.join('\n')+'\n');
console.log(out.join('\n'));
console.log('\n==== 结论：'+(FAIL.length?FAIL.length+' 项连接物理上不成立':'全部连接物理上成立')+' ====');
FAIL.forEach(t=>console.log(' - '+t));
if(FAIL.length)process.exitCode=1;
