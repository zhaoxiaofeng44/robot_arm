function buildBodyOutline() { bodyOutline = null; }  // 整手模式无人形轮廓

function createTextSprite(text, color) {
  color = color || '#7c8aff';
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 36px Arial';
  const w = ctx.measureText(text).width + 20;
  canvas.width = w; canvas.height = 50;
  ctx.font = 'bold 36px Arial';
  ctx.fillStyle = color;
  ctx.fillText(text, 10, 38);
  const texture = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(w * 0.15, 50 * 0.15, 1);
  return sprite;
}

// --- 反根单指链：局部关节坐标（根局部系）+ 世界坐标（场景单位 mm×s） ---
//   反根后固定端 = 末端段 Pn（接掌），自由端 = 掌段（原指根端，现为指尖）。
//   段 j 的原点 = 其近端关节 O(j−1)；段 j+1 的原点即关节 Oj。只有段 n 固定（θn = 0）。
//   相对转角与正向完全相同（段 j+1 相对段 j 转 +tj），只是累加方向相反：θj = θ(j+1) − tj。
//   网格原始坐标（“正向坐标”，掌段在上）经 chainRoot 绕 Z 镜像后即装配位；
//   Ol/Bl/Dl 是段局部系值（与正向逐项一致，供电机/连杆就地摆位），O/B/D 是镜像后的根局部系值。
function fingerChain(key, angles) {
  const F = FINGERS[key];
  const n = angles.length;
  const t = angles.map(function(a){ return a*Math.PI/180; });
  const st = angles.map(function(a){ return angleToStroke(a); });
  const rot = function(x,y,th){ return {x:x*Math.cos(th)-y*Math.sin(th), y:x*Math.sin(th)+y*Math.cos(th)}; };
  const Dloc = function(th){ return {x:P.forearmAttachOffset*Math.cos(th)+P.forearmAttachDist*Math.sin(th),
                                   y:P.forearmAttachOffset*Math.sin(th)-P.forearmAttachDist*Math.cos(th)}; };
  const M = (P.upperArmLen - P.phalanx1Len*(n-1) - P.forearmLen)/2;   // 反根镜像面 y=M
  const mir = function(p){ return {x:-p.x, y:2*M - p.y}; };
  const th = new Array(n+1); th[n] = 0;
  for (let k = n-1; k >= 0; k--) th[k] = th[k+1] - t[k];
  const pos = new Array(n+1);
  pos[n] = {x:0, y:-P.phalanx1Len*(n-1)};                             // 段 n 原点 = O(n−1)：固定
  for (let k = n-1; k >= 1; k--) { const o = rot(0, P.phalanx1Len, th[k]); pos[k] = {x:pos[k+1].x+o.x, y:pos[k+1].y+o.y}; }
  pos[0] = {x:pos[1].x, y:pos[1].y};                                  // 掌段原点 = O0
  const world = function(p){
    const v = new THREE.Vector3(p.x*s, p.y*s, 0);
    v.applyQuaternion(F.chainRoot.quaternion); v.add(F.chainRoot.position);
    v.applyQuaternion(F.root.quaternion); v.add(F.root.position);
    return v;
  };
  const Ol=[], Bl=[], Dl=[], O=[], B=[], D=[], OW=[], BW=[], DW=[];
  for (let k = 0; k < n; k++) {
    const off = (k === 0 ? 0 : -P.phalanx1Len);
    const bl = {x:P.motorMountX, y:off + P.motorMountY - st[k]};      // 段 k 局部系（与正向逐项一致）
    const d0 = Dloc(t[k]); const dl = {x:d0.x, y:d0.y + off};
    const ol = {x:0, y:off};
    const o = pos[k+1];                                               // 正向坐标下的关节 Oj
    const bq = rot(bl.x, bl.y, th[k]);
    const b = {x:pos[k].x + bq.x, y:pos[k].y + bq.y};                 // B 在段 k 上，随之转 θk
    const dq = rot(P.forearmAttachOffset, -P.forearmAttachDist, th[k+1]);
    const d = {x:o.x + dq.x, y:o.y + dq.y};                           // D 在段 k+1 上，随之转 θ(k+1)
    Ol.push(ol); Bl.push(bl); Dl.push(dl);
    O.push(mir(o)); B.push(mir(b)); D.push(mir(d));
    OW.push(world(o)); BW.push(world(b)); DW.push(world(d));
  }
  const tipL = {x:0, y:P.upperArmLen + 14};                           // 指尖防滑垫中心（掌段局部系）
  const tq = rot(tipL.x, tipL.y, th[0]);
  const tip = world({x:pos[0].x + tq.x, y:pos[0].y + tq.y});
  return { key:key, n:n, angles:angles.slice(), Ol:Ol, Bl:Bl, Dl:Dl, O:O, B:B, D:D,
           OW:OW, BW:BW, DW:DW, tipL:tipL, tip:tip, s:st, th:th, pos:pos };
}
function getJoints(pose) {
  const src = pose || currentPose(), out = {};
  for (const f of HAND.fingers) {
    const a = clampPose(f.key, (src[f.key] !== undefined ? src[f.key] : (FINGERS[f.key] ? FINGERS[f.key].pose : null)));
    out[f.key] = fingerChain(f.key, a);
  }
  return out;
}

function updateLabels() {
  labels.forEach(function(l){ scene.remove(l); if (l.material.map) l.material.map.dispose(); l.material.dispose(); });
  labels = [];
  if (!showLabels) return;
  const C = getJoints(currentPose());
  const put = function(txt, color, v){ const l = createTextSprite(txt, color); l.position.copy(v); scene.add(l); labels.push(l); };
  for (const f of HAND.fingers) {
    const c = C[f.key], F = FINGERS[f.key]; if (!c) continue;
    const p = c.tip.clone(); p.x += 40*s; p.y += 40*s;
    put(f.label + ' ' + c.angles.map(function(a){ return a.toFixed(0); }).join('/') + '°', '#66ddaa', p);
    const p0 = c.OW[0].clone(); p0.x -= 130*s; p0.y += 20*s;
    if (f.key === 'index' || f.key === 'middle' || f.key === 'ring' || f.key === 'pinky' || f.key === 'thumb')
      put('关节0 ' + (f.key === 'thumb' ? 'MCP' : 'MCP'), '#ffaa44', p0);
  }
  put('掌骨板 + 腕拼接块（14 台电机全部随各自段运动）', '#7c8aff', new THREE.Vector3(-140*s, (P.upperArmLen+70)*s, 0));
}

function updateTrail() {
  trailLines.forEach(function(l){ scene.remove(l); if (l.geometry) l.geometry.dispose(); });
  trailLines = [];
  if (!showTrail) return;
  for (const f of HAND.fingers) {
    if (!FINGERS[f.key]) continue;
    const pts = [];
    for (let i = 0; i <= 50; i++) {
      const u = i / 50;
      pts.push(fingerChain(f.key, f.limits.map(function(l){ return l*u; })).tip);
    }
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), MAT.trail);
    line.name = f.key + '_trail';
    scene.add(line); trailLines.push(line);
  }
}

function updateRodUnit(motorGroup,pfx,noseY,Bx,By){
  const pr=P.print;
  const rod=motorGroup.getObjectByName(pfx+'ExposedRod');
  const rt=motorGroup.getObjectByName(pfx+'RodThreadStub');
  const bC=motorGroup.getObjectByName(pfx+'BClevis');
  if(rod){
    const len=noseY-(By+pr.rodTipAboveB+pr.rodThreadLen);
    rod.visible=len>0.5;
    rod.scale.y=Math.max(0.001,len)/100;
    rod.position.set(Bx*s,(noseY+By+pr.rodTipAboveB+pr.rodThreadLen)/2*s,0);
  }
  if(rt){
    const sl=Math.min(pr.rodThreadLen,noseY-(By+pr.rodTipAboveB));
    rt.visible=sl>0.2;
    rt.scale.y=Math.max(0.001,sl)/pr.rodThreadLen;
    rt.position.set(Bx*s,(By+pr.rodTipAboveB+sl/2)*s,0);
  }
  if(bC) bC.position.set(Bx*s,By*s,0);
}
function updateTendon(group,B,D){
  group.position.set((B.x+D.x)/2*s,(B.y+D.y)/2*s,0);
  group.rotation.z=Math.atan2(D.x-B.x,-(D.y-B.y));
  group.scale.set(1,1,1);
}

// 更新全部 5 指：pose = {指key:[角度...]}（缺省 = 保持当前）
function updateMechanism(pose){
  if (pose) for (const k in pose) if (FINGERS[k]) FINGERS[k].pose = clampPose(k, pose[k]);
  for (const f of HAND.fingers) {
    const F = FINGERS[f.key]; if (!F) continue;
    const A = F.pose, n = F.n;
    // 反根链：段 j 绕自身远端关节 Oj 转 −θj（相对转角与正向完全相同，只是父段换成远端段）
    for (let k = 0; k < n; k++) F.joints[k].rotation.z = -A[k]*Math.PI/180;
    const C = fingerChain(f.key, A);
    // 单元0：电机0/连杆0 挂在根（掌段固定，局部系即根系）
    updateRodUnit(F.motors[0], f.key+'_m0', P.motorFrontY, P.motorMountX, C.Bl[0].y);
    updateTendon(F.tendons[0], C.Bl[0], C.Dl[0]);
    // 单元 k≥1：电机 k/连杆 k 挂在段 k（局部原点 = 关节 k−1）
    for (let k = 1; k < n; k++) {
      updateRodUnit(F.motors[k], f.key+'_m'+k, -P.phalanx1Len+P.motorFrontY, C.Bl[k].x, C.Bl[k].y);
      updateTendon(F.tendons[k], C.Bl[k], C.Dl[k]);
    }
    // 展开/并拢：指根绕 x 转 φ，推杆 + BD 连杆按闭合关系逐帧摆位（|BD| ≡ L = 85 恒等）
    const phi = (F.spread || 0) * Math.PI/180;
    if (F.spreadGroup) F.spreadGroup.rotation.x = phi;
    if (F.spreadUnit) {
      const R = SPREAD.crankR, L = P.tendonLinkLen;
      const Dy = -R*Math.sin(phi), Dz = R*Math.cos(phi);
      const By = Dy - Math.sqrt(L*L - (R - Dz)*(R - Dz));
      updateRodUnit(F.spreadUnit.motor, f.key+'_sp', SPREAD.noseY, P.motorMountX, By);
      updateTendon(F.spreadUnit.link, {x:R, y:By}, {x:Dz, y:Dy});
    }
  }
  updateLabels();
  updateLiveData();
}
