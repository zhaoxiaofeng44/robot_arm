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
    const palmBlock = createPlateWithHoles(24, 22, 20, pr.rootBoltXZ.map(function(h){return [h[0],h[1],1.7];}), MAT.base);
    palmBlock.name = palmPfx+'Base'; palmBlock.rotation.x = Math.PI/2;
    palmBlock.position.y = (P.upperArmLen+10)*s;
    asm.add(palmBlock);
    buildPalmMount(asm, palmPfx);
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
    root.add(chainRoot); F.chainRoot = chainRoot;

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
