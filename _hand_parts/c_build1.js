  // ============ 反根后的自由端配件：指尖圆头 + 防滑抓握垫（现装于掌段远端 = 原指根端） ============
  //   正向模型里这组配件在末端段 Pn 的末端；反根后自由端变成掌段远端，整组随之搬家：
  //   组内绕 Z 转 180° 再平移 TY = 掌段长 − 末端长 = 50mm，使圆头/防滑垫落在掌段外侧 +7/+14mm。
  //   经反根镜像（chainRoot）后，它们与正向模型的指尖逐点同位 —— 装配位外形不变，只是归属段对调。
  function buildTipFittings(parent, pfx) {
    const TY = P.upperArmLen - P.forearmLen;                 // = 50mm
    const asm = new THREE.Group(); asm.name = pfx + 'TipAsm';
    parent.add(asm); asm.rotation.z = Math.PI; asm.position.set(0, TY * s, 0);
    const tip = createCylinder(12*s,14*s,MAT.base,32);
    tip.name=pfx+'FingerTip'; tip.position.set(0,(-P.forearmLen-7)*s,0);
    asm.add(tip);
    const pad = createSphere(12*s,MAT.base,24);
    pad.name=pfx+'FingerTipPad'; pad.position.set(0,(-P.forearmLen-14)*s,0);
    asm.add(pad);
    const pc = createBox(22*s, 18*s, 4*s, MAT.base);
    pc.name = pfx+'GripPad'; pc.position.set(0, -262*s, -12*s);
    asm.add(pc);
    for (let k = 0; k < 3; k++) {
      const rib = createBox(22*s, 3*s, 1.6*s, MAT.base);
      rib.name = pfx+'GripRib' + (k + 1);
      rib.position.set(0, (-257 + k * 5) * s, -14.8 * s);
      asm.add(rib);
    }
  }

  // ============ 末端段 Pn（反根后它是“接掌固定段”）：段体/拼接/近端被动接口同正向 ============
  //   区别只有一处：原掌段上的“指根方块 + 掌骨安装法兰(56×56) + 4×M4”整组搬到这里，
  //   组内绕 Z 转 180° 再平移 TY = 50mm → 法兰面落在本段远端外 26mm（与正向掌段的安装面同位）。
  function buildTerminalPhalanx(parent, pfx, palmPfx) {
    const sy3 = -125;
    parent.add(waistShape(pfx+'BodyWaist',-46,5.5));
    parent.add(rectSegment(pfx+'BodyHeel',-46,sy3,7,MAT.forearm));
    parent.add(rectSegment(pfx+'BodyDistal',sy3,-P.forearmLen,7,MAT.forearm,
      [[pr.spliceBoltInset, sy3-pr.spliceBoltOff, pr.spliceBoltDia/2],[-pr.spliceBoltInset, sy3-pr.spliceBoltOff, pr.spliceBoltDia/2]]));
    addIntegralSplice(parent,pfx+'P','lead',sy3,-1,7,6,MAT.forearm);
    addIntegralSplice(parent,pfx+'D','lag',sy3,-1,7,6,MAT.forearm);
    buildDrivenJoint(parent,pfx);
    // —— 掌部安装件（原掌段指根方块 + 掌骨法兰 + 4×M4）：名字沿用掌段前缀（校验/装配图按名索引）——
    const TY = P.upperArmLen - P.forearmLen;                 // = 50mm
    const asm = new THREE.Group(); asm.name = palmPfx + 'MountAsm';
    parent.add(asm); asm.rotation.z = Math.PI; asm.position.set(0, TY * s, 0);
    // 方块厚度 20→17：底面抬到 y=303，让开铰链毂顶面(300)与指根段顶角摆动(≈301.5)
    const palmBlock = createPlateWithHoles(24, 22, 17, pr.rootBoltXZ.map(function(h){return [h[0],h[1],1.7];}), MAT.base);
    palmBlock.name = palmPfx+'Base'; palmBlock.rotation.x = Math.PI/2;
    palmBlock.position.y = (P.upperArmLen+11.5)*s;
    asm.add(palmBlock);
    buildPalmMount(asm, palmPfx);
  }

  // ============ 展开/并拢副（每指 1 台侧挂直线电机）：绕掌骨安装处的 x 轴摆动 ============
  //   枢轴 = 掌骨安装件底面（局部 y = SPREAD.pivotY = 300），铰链销 Ø10 沿 x。
  //   固定侧（随安装件/掌骨板）: 叉耳 2 片 + Ø10 销 + 吊架 + 电机安装板 + Ø36 直线电机 + 后抱箍
  //   转动侧（随指根）        : 毂（Ø10 孔）+ 曲柄臂 R + D 双耳（Ø8 销）
  //   传动：电机推杆沿 y 上行（前端面 y = SPREAD.noseY），经 85mm BD 连杆推曲柄 → 指根绕 x 转 φ
  //   闭合关系（在 (y,z) 平面内，曲柄零位沿 +z）：D(φ) = (−R sinφ, R cosφ)
  //            B = D − (0, √(L² − (R − R cosφ)²))  ⇒ |BD| ≡ L = 85（恒等闭合，无需迭代求解）
  //   φ = ±12° 时推杆只用 ±5.4mm 行程（电机 59mm 全行程的 9%），故侧挂小电机也可直接替换。
  function buildSpreadUnit(rootParent, movingParent, K) {
    const SP = SPREAD;
    const NE = SP.noseY;
    // 拇指指根横向电机镜像到 −z 外侧（背侧）：避开掌fold转动半的扫掠楔形区（z −253→−150，下探 y≥305）
    const ZS = (K === 'thumb') ? -1 : 1;
    const R = (K === 'thumb') ? SP.thumbCrankR : SP.crankR;   // 拇指曲柄加大让开自身 p3
    // ---------- 固定侧 ----------
    const fx = new THREE.Group(); fx.name = K + '_spreadFixed';
    fx.position.set(0, SP.pivotY * s, 0); rootParent.add(fx);
    for (const [tag, xx] of [['L', SP.earX], ['R', -SP.earX]]) {
      const ear = createBox(SP.earT*s, 30*s, 22*s, MAT.base);
      ear.name = K + '_spFork' + tag; ear.position.set(xx*s, 1*s, 0); fx.add(ear);
      const boss = createBoredDisc(pr.earBossRadius, P.boreElbow/2, SP.earT, MAT.base);
      boss.name = K + '_spForkBoss' + tag;
      boss.rotation.y = Math.PI/2; boss.position.set(xx*s, 0, 0); fx.add(boss);
    }
    const oBolt = createShoulderBolt(K + '_sp_o', pr.boltElbow, MAT.fastener);
    oBolt.rotation.y = Math.PI/2; fx.add(oBolt);                       // Ø10 铰链销：轴线沿 x（销体原生沿 z）
    // 吊架：电机安装板顶面(y=−77) → 掌骨法兰底面(y=+31)，落在 x∈[10,18]、z∈[16,28]，
    //   与曲柄(≤x9)、BD连杆(≤x4)、D双耳(≤x9) 在 x 上分离 → 摆动全程无干涉
    // 侧向吊架（L 形）：立柱在 z=bracketZ（曲柄/连杆包络之外）从电机安装板吊到掌骨法兰底面，
    //   横臂沿 z 从法兰边缘伸进来咬合 —— 全程不与曲柄扫掠、BD 连杆相碰
    const brk = createBox(12*s, 32*s, 12*s, MAT.base);
    brk.name = K + '_spBracket'; brk.position.set(0, 1*s, ZS*SP.bracketZ*s); fx.add(brk);
    const foot = createBox(12*s, 11*s, 22*s, MAT.base);
    foot.name = K + '_spBracketFoot'; foot.position.set(0, 36.5*s, ZS*(SP.bracketZ - 5)*s); fx.add(foot);
    // 电机：轴沿 y，轴线落在 (x=0, z=+R)；buildMotorSet 内部 +28mm 偏置用 mg 平移补回
    const mg = new THREE.Group(); mg.name = K + '_spMotorGroup';
    mg.position.set((SP.outX - P.motorMountX)*s, 0, ZS*R*s); fx.add(mg);   // 轴线落在 (x=outX, z=+R)
    buildMotorSet(mg, K + '_sp', NE, NE - 80, NE - 38, [NE - 72, NE - 48]);
    buildFlangePlate(mg, K + '_sp', NE + 4);
    // 推杆 / 推杆叉头 / 桥座 / M6 螺母：由 buildMotorSet 一并生成（<前缀>ExposedRod / BClevis），
    //   交 updateRodUnit 逐帧摆位 —— 此处不再重复建件，避免同名件双份。
    // ---------- 转动侧（随指根绕 x 摆）----------
    const hub = createBoredDisc(11, P.boreElbow/2, 13, MAT.forearm);
    hub.name = K + '_spHub'; hub.rotation.y = Math.PI/2; movingParent.add(hub);
    // 曲柄：毂 → 横向 (x=outX) → 外伸 R，末端 D 双耳（Ø8 销沿 x）
    const arm = createBox(SP.outX*s, 12*s, (R - 4)*s, MAT.forearm);
    arm.name = K + '_spCrankArm'; arm.position.set((SP.outX/2)*s, 0, ZS*(R + 4)/2*s); movingParent.add(arm);
    for (const [tag, xx] of [['L', SP.outX + SP.dBossX], ['R', SP.outX - SP.dBossX]]) {
      const boss = createBoredDisc(pr.dBossOD/2, P.boreLink/2, pr.dBossT, MAT.base);
      boss.name = K + '_spDClevisBoss' + tag;
      boss.rotation.y = Math.PI/2; boss.position.set(xx*s, 0, ZS*R*s); movingParent.add(boss);
    }
    const dBolt = createShoulderBolt(K + '_sp_d', pr.boltD, MAT.fastener);
    dBolt.rotation.y = Math.PI/2; dBolt.position.set(SP.outX*s, 0, ZS*R*s); movingParent.add(dBolt);
    // ---------- BD 连杆（85mm 同型件）：挂在平面转换组里，逐帧按 B/D 摆位 ----------
    const plan = new THREE.Group(); plan.name = K + '_spLinkPlane';
    plan.rotation.y = -Math.PI/2; plan.position.x = SP.outX*s; fx.add(plan);   // plan(x,y) ≡ 实际(z,y)，整体在 x=outX
    const link = buildTendon(plan, K + '_spt');
    return { fixed: fx, motor: mg, link: link, linkPlane: plan };
  }

  // ============ 单指（反根链）：掌段(自由末端·载电机0·带指尖配件) + n 个关节单元 ============
  //   段分组依旧是 groups[0]=掌段 … groups[n]=末端段；但反根后：
  //     · groups[n]（末端段）固定于 chainRoot —— 它就是接掌的根段，掌部安装件挂在它远端；
  //     · groups[n−1] … groups[0] 依次套一层关节组 joints[j]，绕各自远端关节 Oj 转 −θj；
  //     · 电机 k 与连杆 k 都挂在自己所在段上（反根后“电机 k 驱动段 k 自身”），与正向逐件同构。
  //   整链再套一层 chainRoot（绕 Z 转 180° + 平移 2M，M = 反根镜像面）把链条倒到掌面另一侧：
  //   于是接掌端仍是原位置的原安装面，自由端（原指根端）成为指尖。
  function buildFinger(f) {
    const K = f.key, N = f.n;
    const root = new THREE.Group(); root.name = K+'_root';
    root.position.set(f.pos[0]*s, f.pos[1]*s, f.pos[2]*s);
    root.quaternion.copy(new THREE.Quaternion()
      .setFromAxisAngle(new THREE.Vector3(0,0,1), f.fan*Math.PI/180)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), f.spin*Math.PI/180)));
    scene.add(root);
    const F = { key:K, label:f.label, n:N, limits:f.limits.slice(), root:root, fan:f.fan, spin:f.spin,
                pos:f.pos.slice(), groups:[], joints:[], motors:[], tendons:[], pose:new Array(N).fill(0) };
    FINGERS[K] = F;
    // —— 反根镜像层：把“正向坐标（掌段在上）的整链”映到“接掌端在上”的装配位 ——
    const M = (P.upperArmLen - P.phalanx1Len*(N-1) - P.forearmLen) / 2;
    const chainRoot = new THREE.Group(); chainRoot.name = K+'_chainRoot';
    chainRoot.rotation.z = Math.PI; chainRoot.position.set(0, 2*M*s, 0);
    // —— 展开/并拢层：指根绕 x 摆 φ（枢轴 = 安装件底面）；反根镜像层挂在其下 ——
    const spread = new THREE.Group(); spread.name = K+'_spread';
    spread.position.set(0, SPREAD.pivotY*s, 0);   // 289：毂心

    root.add(spread); F.spreadGroup = spread;
    F.spread = 0; F.spreadLimit = SPREAD.limitDeg; F.fold = 0;   // 拇指：fold = 掌fold对掌角
    chainRoot.position.set(0, (2*M - SPREAD.pivotY)*s, 0);
    spread.add(chainRoot); F.chainRoot = chainRoot;

    // —— 掌段（反根后 = 自由末端，载电机0 + 指尖配件）——
    const q = K+'_palm';
    const palmGroup = new THREE.Group(); palmGroup.name = q;
    chainRoot.add(palmGroup); F.groups.push(palmGroup);
    const syU = pr.spliceYUpper;
    const segsP = [
      { name:q+'BodyDistal', pts:[[-3,13],[3,13],[8,22],[8,syU],[-8,syU],[-8,22]], holes:[] },
      { name:q+'BodyProximal', pts:[[-8,syU],[8,syU],[8,P.upperArmLen],[-8,P.upperArmLen]],
        holes: pr.collarBoltY.map(function(y){ return [2, y, pr.collarBolt.shank/2 + 0.2]; })
               .concat([[pr.spliceBoltInset, syU+pr.spliceBoltOff, pr.spliceBoltDia/2],
                        [-pr.spliceBoltInset, syU+pr.spliceBoltOff, pr.spliceBoltDia/2]]) },
    ];
    for (const seg of segsP) {
      const sh = new THREE.Shape();
      seg.pts.forEach(function(p,i){ if(i===0) sh.moveTo(p[0]*s,p[1]*s); else sh.lineTo(p[0]*s,p[1]*s); });
      sh.closePath();
      for (const h of seg.holes) { const pth=new THREE.Path(); pth.absarc(h[0]*s,h[1]*s,h[2]*s,0,Math.PI*2,true); sh.holes.push(pth); }
      const gg = new THREE.ExtrudeGeometry(sh,{depth:14*s,bevelEnabled:false,steps:1});
      gg.translate(0,0,-7*s);
      const mm = new THREE.Mesh(gg,MAT.upperArm);
      mm.name = seg.name; mm.castShadow=mm.receiveShadow=true;
      palmGroup.add(mm);
    }
    addIntegralSplice(palmGroup,q+'D','lead',syU,1,8,7,MAT.upperArm);
    addIntegralSplice(palmGroup,q+'P','lag',syU,1,8,7,MAT.upperArm);
    buildTipFittings(palmGroup,q);          // 指尖圆头/防滑垫落在掌段远端（原指根端）
    buildFlangePlate(palmGroup,q,pr.flangePlateY0);
    buildForkEars(palmGroup,q,0,MAT.base);
    palmGroup.add(createShoulderBolt(K+'_o0',pr.boltElbow,MAT.fastener));
    const m0 = new THREE.Group(); m0.name = K+'_m0Motor'; palmGroup.add(m0);   // 电机0 随掌段运动（反根后驱动本段）
    buildMotorSet(m0,K+'_m0',P.motorFrontY,P.motorMountY+P.motorRearOverhang,pr.collarY1,pr.collarBoltY);
    F.motors.push(m0);
    F.tendons.push(buildTendon(palmGroup,K+'_t0'));

    // —— 被驱动段 P1..P(n−1) 与末端段 Pn：先按正向层级建好（网格坐标一行不改），随后整体反根重挂 ——
    let parent = palmGroup;
    for (let k = 0; k < N; k++) {
      const g = new THREE.Group(); g.name = K+'_phalanx'+(k+1);
      if (k > 0) g.position.set(0,-P.phalanx1Len*s,0);
      parent.add(g); F.groups.push(g);
      const pfx = K+'_p'+(k+1);
      if (k < N-1) {
        const u = buildDrivenPhalanx(g, pfx, P.phalanx1Len, K+'_m'+(k+1), K+'_t'+(k+1));
        F.motors.push(u.motor); F.tendons.push(u.tendon);
      } else {
        buildTerminalPhalanx(g, pfx, q);
      }
      parent = g;
    }

    // —— 横向摆副：五指指根各一套展开/并拢（同款分离电机）；拇指另加掌fold对掌副（见 buildChassis）——
    F.spreadUnit = buildSpreadUnit(root, spread, K);
    if (K === 'thumb') {
      F.foldGroup = scene.getObjectByName('thumbPalmFlapGroup');
      F.foldMotor = scene.getObjectByName('thumbFoldMotorGroup');
      F.foldLink  = scene.getObjectByName('thumbFold_tTendon');
      F.foldBase  = { pos: root.position.clone(), quat: root.quaternion.clone() };
    }
    // —— 掌部安装件（方块+56×56法兰）改为“固定件”：整组搬到 root 下，世界位姿逐点保持不变 ——
    //    原因：方块经 4×M4 锁在法兰上、法兰经 4×M5 锁在掌骨板上，物理上不能随指根摆；
    //    铰链把“方块以上”与“指根段以下”分开，因此安装件必须留在固定侧。
    root.updateWorldMatrix(true, true);
    const mAsm = root.getObjectByName(q + 'MountAsm');
    if (mAsm) {
      const wp = new THREE.Vector3(), wq = new THREE.Quaternion(), ws = new THREE.Vector3();
      mAsm.matrixWorld.decompose(wp, wq, ws);
      const rq = new THREE.Quaternion().setFromRotationMatrix(root.matrixWorld).invert();
      const lp = wp.clone().applyMatrix4(new THREE.Matrix4().copy(root.matrixWorld).invert());
      root.add(mAsm); mAsm.position.copy(lp); mAsm.quaternion.copy(rq.multiply(wq)); mAsm.scale.copy(ws);
      F.mountAsm = mAsm;
    }

    // —— 反根重挂：Pn 固定于 chainRoot；P(n−1)…掌段 各套关节组 joints[j]，绕 Oj 转 −θj ——
    //    段 j 的原点 = 其近端关节 O(j−1)，位于 Oj 上方 300mm（掌段原点即 O0，与其近端关节重合）
    const G = F.groups;
    const term = G[N];
    chainRoot.add(term);
    term.position.set(0, -P.phalanx1Len*(N-1)*s, 0);
    let host = term;
    for (let j = N-1; j >= 0; j--) {
      const W = new THREE.Group(); W.name = K+'_j'+j;
      host.add(W); W.position.set(0,0,0);
      F.joints[j] = W;
      W.add(G[j]);
      G[j].position.set(0, (j === 0 ? 0 : P.phalanx1Len)*s, 0);
      host = G[j];
    }
    return F;
  }
