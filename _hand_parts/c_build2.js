  // ============ 掌体骨架（共 16 个网格 / 8 个打印件）：掌骨板A/B + 顶部拼接条 + 腕拼接块(含4凸台) + 拇指桥(含4凸台） ============
  //   坐标 = 掌体系（= 世界系）：五指 MCP 共线于 y=0，掌段沿 +y 伸出，掌骨法兰顶面 y=326
  //   掌骨板 = 66(x)×10(y) 平板，z∈[−253,153]，在 z=−55 处断开为 A/B 两件（198/208mm，均 < 220mm 打印床）
  //   指根接口：每指 4×Ø4.2（掌骨板侧 M5 螺纹底孔）+ 4×Ø9（让开指根法兰顶面的 M4 螺栓头，与 rootBoltXZ 同心）+ Ø9 走线孔
  //   拼接：顶部拼接条（y=336..342）用 4×M5 从下方穿过掌骨板旋入拼接条，把 A/B 直接拉成一体；
  //   腕拼接块（y=342..374）再以 4×M5（z=−135/−135 落在无指根法兰的空档）+4×Ø14×6 支承凸台把腕接口与掌骨板连成一体
  //   拇指桥（y=336..346，z∈[−252,−145]）压在掌骨板A 上：2×M5 旋入板A，4×Ø14×10 凸台落在随 spin 滚转的拇指法兰孔上
  function flatPlateXZ(name, x0,x1, z0,z1, y0,y1, holes, mat) {
    const sh = new THREE.Shape();
    sh.moveTo(x0*s, z0*s); sh.lineTo(x1*s, z0*s); sh.lineTo(x1*s, z1*s); sh.lineTo(x0*s, z1*s); sh.closePath();
    for (const h of holes) { const p=new THREE.Path(); p.absarc(h[0]*s, h[1]*s, h[2]*s, 0, Math.PI*2, true); sh.holes.push(p); }
    const g = new THREE.ExtrudeGeometry(sh, {depth:(y1-y0)*s, bevelEnabled:false, steps:1});
    g.translate(0,0,-(y1-y0)/2*s);
    const m = new THREE.Mesh(g, mat);
    m.name = name; m.castShadow = m.receiveShadow = true;
    m.rotation.x = Math.PI/2;                 // 形面(x,z) → 世界(x,z)，挤出方向 → 世界 y
    m.position.y = (y0+y1)/2*s;
    return m;
  }
  // 指根接口孔组：4×Ø4.2（M5 螺纹底孔）+ 4×Ø9（M4 头让位，与 rootBoltXZ 同心）+ Ø9 走线（随该指 spin 滚转）
  function fingerHoles(f) {
    const th = f.spin*Math.PI/180, zc = f.pos[2], out = [];
    const R = function(x,z){ return [x*Math.cos(th)+z*Math.sin(th), zc - x*Math.sin(th)+z*Math.cos(th)]; };
    for (const hz of [[22,22],[22,-22],[-22,22],[-22,-22]]) { const p=R(hz[0],hz[1]); out.push([p[0], p[1], 2.1]); }
    for (const hz of P.print.rootBoltXZ) { const p=R(hz[0],hz[1]); out.push([p[0], p[1], 4.5]); }
    out.push([0, zc, 4.5]);
    return out;
  }
  function yOf(key){ return HAND.fingers.filter(function(f){ return f.key===key; })[0]; }
  function buildChassis() {
    const y0 = HAND.plateY0, y1 = HAND.plateY0 + HAND.plateT;   // 326..336
    const zS = HAND.plateSplit;                                 // −55 分缝（落在无指根法兰的 z 空档 −62..−48 内）
    const SB = HAND.spliceTop, WB = HAND.wristBlock, TB = HAND.thumbBridge;
    // 掌骨板A：拇指 + 食指（z∈[−253,−55]）+ 顶部拼接条 4×M5 过孔（同为无指根法兰空档）
    const hoA = fingerHoles(yOf('thumb')).concat(fingerHoles(yOf('index')))
      .concat(SB.bolts.map(function(b){ return [b[0], b[1], 2.75]; }))
    // 掌骨板B：中指 + 无名指 + 小指（z∈[−55,153]）
    const hoB = fingerHoles(yOf('middle')).concat(fingerHoles(yOf('ring'))).concat(fingerHoles(yOf('pinky')));
    scene.add(flatPlateXZ('palmPlateA', -33,33, HAND.plateZ0, zS, y0,y1, hoA, MAT.upperArm));
    scene.add(flatPlateXZ('palmPlateB', -33,33, zS, HAND.plateZ1, y0,y1, hoB, MAT.upperArm));
    // 顶部拼接条：6mm 厚，跨在分缝上；4×Ø4.2 攻 M5（自下而上穿板旋入），把 A/B 直接连成一体
    scene.add(flatPlateXZ('palmSpliceTop', -33,33, SB.z0, SB.z1, y1, SB.y1,
      SB.bolts.map(function(b){ return [b[0], b[1], 2.1]; }), MAT.upperArm));
    // 腕拼接块：4×Ø5.5（旋入掌骨板）+ Ø40 走线孔 + 4×Ø9 腕接口（M8 过孔）
    const hoW = [[0,0,20.0]].concat(WB.bolts.map(function(b){ return [b[0], b[1], 2.75]; }))
      .concat([[28,45,4.5],[28,-45,4.5],[-28,45,4.5],[-28,-45,4.5]]);
    scene.add(flatPlateXZ('wristBlock', -40,40, WB.z0, WB.z1, WB.y0, WB.y1, hoW, MAT.upperArm));
    let bi = 0;
    for (const b of WB.bolts) {   // 4×Ø14×6 支承凸台：垫在掌骨板与腕块之间（内含 M5 过孔）
      const bs = createBoredDisc(7, 2.75, 6, MAT.upperArm);
      bs.name = 'wristBoss' + (++bi);
      bs.position.set(b[0]*s, (y1 + 3)*s, b[1]*s);
      scene.add(bs);
    }
    // 拇指桥：2×M5 旋入掌骨板A + 4×Ø4.2（自下而上旋入桥体，锁住拇指法兰）
    const th = yOf('thumb'), th2 = th.spin*Math.PI/180;
    const hoT = TB.bolts.map(function(b){ return [b[0], b[1], 2.75]; });
    const bossPos = [];
    for (const hz of [[22,22],[22,-22],[-22,22],[-22,-22]]) {
      const pz = [hz[0]*Math.cos(th2)+hz[1]*Math.sin(th2), th.pos[2] - hz[0]*Math.sin(th2)+hz[1]*Math.cos(th2)];
      bossPos.push(pz);
      hoT.push([pz[0], pz[1], 2.1]);
    }
    scene.add(flatPlateXZ('thumbBridge', -33,33, TB.z0, TB.z1, y1, TB.y1, hoT, MAT.upperArm));
    let ci = 0;
    for (const pz of bossPos) {   // 4×Ø14×10 支承凸台：垫在拇指法兰与桥体之间（内含 M5 过孔）
      const bs = createBoredDisc(7, 2.75, 10, MAT.upperArm);
      bs.name = 'thumbBridgeBoss' + (++ci);
      bs.position.set(pz[0]*s, (y1 + 5)*s, pz[1]*s);
      scene.add(bs);
    }
  }

  // ============ 装配：骨架 + 五根手指（四指 3 关节 + 拇指 2 关节 = 14 个关节单元） ============
  buildChassis();
  for (const f of HAND.fingers) buildFinger(f);
  updateTrail();
}
