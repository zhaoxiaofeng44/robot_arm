
  // ============ 末端指尖段（250mm + 指尖圆头/抓握垫）：只含近端被动接口（关节 n−1 的 D 侧板） ============
  function buildTerminalPhalanx(parent, pfx) {
    const sy3 = -125;
    parent.add(waistShape(pfx+'BodyWaist',-46,5.5));
    parent.add(rectSegment(pfx+'BodyHeel',-46,sy3,7,MAT.forearm));
    parent.add(rectSegment(pfx+'BodyDistal',sy3,-P.forearmLen,7,MAT.forearm,
      [[pr.spliceBoltInset, sy3-pr.spliceBoltOff, pr.spliceBoltDia/2],[-pr.spliceBoltInset, sy3-pr.spliceBoltOff, pr.spliceBoltDia/2]]));
    addIntegralSplice(parent,pfx+'P','lead',sy3,-1,7,6,MAT.forearm);
    addIntegralSplice(parent,pfx+'D','lag',sy3,-1,7,6,MAT.forearm);
    buildDrivenJoint(parent,pfx);
    const tip = createCylinder(12*s,14*s,MAT.base,32);
    tip.name=pfx+'FingerTip'; tip.position.set(0,(-P.forearmLen-7)*s,0);
    parent.add(tip);
    const pad = createSphere(12*s,MAT.base,24);
    pad.name=pfx+'FingerTipPad'; pad.position.set(0,(-P.forearmLen-14)*s,0);
    parent.add(pad);
    const pc = createBox(22*s, 18*s, 4*s, MAT.base);
    pc.name = pfx+'GripPad'; pc.position.set(0, -262*s, -12*s);
    parent.add(pc);
    for (let k = 0; k < 3; k++) {
      const rib = createBox(22*s, 3*s, 1.6*s, MAT.base);
      rib.name = pfx+'GripRib' + (k + 1);
      rib.position.set(0, (-257 + k * 5) * s, -14.8 * s);
      parent.add(rib);
    }
  }

  // ============ 单指：掌段（固定基节，载电机0） + n 个关节单元 ============
  //   groups[0]=掌段（固定）；groups[k]=第 k 节被驱动段（载电机 k）；groups[n]=末端指尖段
  //   单元 k：电机 k 装在段 k 上随之运动，经 BD 长条连杆 k 驱动段 k+1 绕 Ok 转动（与手指版逐项一致）
  function buildFinger(f) {
    const K = f.key, N = f.n;
    const root = new THREE.Group(); root.name = K+'_root';
    root.position.set(f.pos[0]*s, f.pos[1]*s, f.pos[2]*s);
    root.quaternion.copy(new THREE.Quaternion()
      .setFromAxisAngle(new THREE.Vector3(0,0,1), f.fan*Math.PI/180)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), f.spin*Math.PI/180)));
    scene.add(root);
    const F = { key:K, label:f.label, n:N, limits:f.limits.slice(), root:root, fan:f.fan, spin:f.spin,
                pos:f.pos.slice(), groups:[], motors:[], tendons:[], pose:new Array(N).fill(0) };
    FINGERS[K] = F;

    // —— 掌段（= 手指版掌节，逐件同构；远端 = 关节0 的叉耳） ——
    const q = K+'_palm';
    const palmGroup = new THREE.Group(); palmGroup.name = q;
    root.add(palmGroup); F.groups.push(palmGroup);
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
    const palmBlock = createPlateWithHoles(24, 22, 20, pr.rootBoltXZ.map(function(h){return [h[0],h[1],1.7];}), MAT.base);
    palmBlock.name=q+'Base'; palmBlock.rotation.x = Math.PI/2;
    palmBlock.position.y=(P.upperArmLen+10)*s;
    palmGroup.add(palmBlock);
    buildPalmMount(palmGroup,q);            // 掌骨安装法兰 56×56：外圈 4×Ø5.5 与掌体骨架对接
    buildFlangePlate(palmGroup,q,pr.flangePlateY0);
    buildForkEars(palmGroup,q,0,MAT.base);
    palmGroup.add(createShoulderBolt(K+'_o0',pr.boltElbow,MAT.fastener));
    const m0 = new THREE.Group(); m0.name = K+'_m0Motor'; root.add(m0);
    buildMotorSet(m0,K+'_m0',P.motorFrontY,P.motorMountY+P.motorRearOverhang,pr.collarY1,pr.collarBoltY);
    F.motors.push(m0);
    F.tendons.push(buildTendon(root,K+'_t0'));

    // —— 被驱动段 P1..P(n−1) 与末端指尖段 Pn ——
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
        buildTerminalPhalanx(g, pfx);
      }
      parent = g;
    }
    return F;
  }