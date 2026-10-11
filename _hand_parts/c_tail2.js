function updateLiveData() {
  const C = getJoints(currentPose());
  let out = "", tot = 0, maxF = 0;
  for (const f of HAND.fingers) {
    const c = C[f.key]; if (!c) continue;
    const parts = [], ta = [];
    for (let i = 0; i < f.n; i++) {
      const stk = P.s_extended - c.s[i];
      const fd = getForceData(c.angles[i]);
      tot += stk; if (fd.forceN > maxF) maxF = fd.forceN;
      parts.push(stk.toFixed(1));
      ta.push(transmissionAngle(c.angles[i]).toFixed(0));
    }
    out += '<b>' + f.label + '</b> ' + c.angles.map(function(a){ return a.toFixed(1); }).join(' / ') + '°';
    out += ' · 行程 ' + parts.join('/') + ' mm<br>';
    out += '<span class=hl>传动角</span> ' + ta.join('/') + '° · 指尖 y ' + (c.tip.y/s).toFixed(0) + ' mm<br>';
  }
  out += '<b>合计</b> 14 关节总行程 <span class=highlight>' + tot.toFixed(1) + ' mm</span> · 峰值理想静载力 ' + maxF.toFixed(1) + ' N<br>';
  out += '<b>关节</b>: 14 个可拆肩螺栓单元（四指 3 + 拇指 2，几何逐件相同）';
  document.getElementById('live-data').innerHTML = out;
}
function updateBioInfo() {
  document.getElementById('bio-info').innerHTML =
    '<span class=biological>掌段（固定基节）×5</span> = 掌骨类比（300mm，各载电机0；顶端 4×M5 掌骨法兰固定在掌骨板上）<br>' +
    '<span class=biological>近节/中节 ×4 指</span> = 两个被驱动段（各 300mm，各载电机1/2）<br>' +
    '<span class=biological>远节 ×4 指</span> = 指尖段（250mm，只含被动接口）<br>' +
    '<span class=biological>拇指</span> = 掌段 + 近节 + 指尖段（2 关节：MCP + IP）<br>' +
    '<span class=biological>14 台圆柱直线电机</span> = 指深/指浅屈肌 + 骨间肌 + 大鱼际肌群类比（每关节 1 只，全独立驱动）<br>' +
    '<span class=biological>掌骨板/腕拼接块/拇指连接肋</span> = 掌骨 + 腕骨类比（全部螺栓可拆，指根法兰 4×M5 接口通用）<br>' +
    '<span class=biological>拇指 z=−220 基节位</span> = 拇指对掌侧布置（五个机构平面平行、间距 70mm；拇指基节移到掌骨板另一端）';
}

function updateParamInfo() {
  const pr = P.print;
  document.getElementById('param-info').innerHTML =
    '<b>构型</b>: <span class=highlight>五指整手 · 14 个（圆柱电机+BD长条连杆）同构关节单元</span>（四指 3 关节 + 拇指 2 关节）<br>' +
    '<b>段长</b>: 掌段 ' + P.upperArmLen + ' / 近节 ' + P.phalanx1Len + ' / 中节 ' + P.phalanx2Len + ' / 远节 ' + P.forearmLen + ' mm（与手指版 1:1 同尺寸）<br>' +
    '<b>整手尺度</b>: 指尖 y=' + (-(P.upperArmLen + P.phalanx1Len + P.phalanx2Len + P.forearmLen + 14)) + ' mm → 腕板顶 y=' + HAND.wristY1 + ' mm；指距 ' + HAND.spacing + ' mm<br>' +
    '<b>电机</b>: 14× Ø' + (2*P.motorBodyRadius) + ' × ' + P.motorBodyLen + ' mm 直线电机（每关节 1 只，全部随各自上一级段运动）<br>' +
    '<b>行程基准</b>: 每单元 A=(28,213) 相对自身关节；BD 中心距 ' + P.tendonLinkLen + ' mm；D=(14,-31)；单关节行程 ' + P.strokeMax.toFixed(2) + ' mm<br>' +
    '<b>掌体骨架</b>: 掌骨板A/B（66×10 平板，z∈[−117,0] / [0,140]）+ 腕拼接块（4×Ø9 腕接口 + Ø40 走线孔）+ 拇指连接肋<br>' +
    '<b>指根接口</b>: 每根手指 4×M5（法兰外圈 Ø5.5，孔距 44×44）+ Ø9 走线孔，五指共用一块掌骨板<br>' +
    '<b>指尖</b>: Ø24 圆柱 + 半球垫 + 3 条防滑抓握棱（每指相同）<br>' +
    '<b>关节衔接</b>: 14 个关节同为 耳内档16−袖套14、耳内档10−连杆8 → 轴向浮动 ' + pr.axialClearance + ' mm/侧<br>' +
    '<b>安全包络</b>: 四指 90°/90°/70°、拇指 90°/70°（由 verify_hand.cjs 三维姿态扫描确定；五面平行是扫描结论，见 hand_design_spec.md）';
}
function updatePrintInfo() {
  const pr = P.print;
  document.getElementById('print-info').innerHTML =
    '<b>工艺</b>: FDM 0.4mm 喷嘴 · 层高 ' + pr.layerHeight + ' mm · 全部孔轴沿 Z 竖直免支撑<br>' +
    '<b>打印件</b>: 每指 19 件（掌近/远段、近节近/远段、中节近/远段、远节近/远段、抱箍×3、B叉头×3、连杆×3、掌骨法兰、指尖垫）<br>' +
    '<b>拇指</b>: 14 件（少一套中节与电机2）；<b>掌体骨架</b> 9 件（掌骨板A/B、腕拼接块+4 凸台、拇指连接肋）<br>' +
    '<b>合计</b>: 4×19 + 14 + 9 = <span class=highlight>99 件</span>（同指零件完全互换，可整指更换）<br>' +
    '<b>拼接</b>: 掌段 y=' + pr.spliceYUpper + '、近/中节 y=-170、远节 y=-125；掌骨板 A/B 由腕拼接块 4×M5 夹紧<br>' +
    '<b>拆装</b>: 任一关节旋下自锁螺母→抽肩螺栓→连杆/指节沿 Z 滑出；电机卸 4×M4 上抽；整指可 4×M5 从掌骨板整体取下<br>' +
    '<b>材料</b>: 指节/叉头/抱箍 PETG 或 PLA+；连杆 PETG/PA-CF；指尖垫/掌骨板 TPU95A/PETG；紧固件外购 304 不锈钢<br>' +
    '<b>注意</b>: 机构为名义刚性概念设计（1:1，无人体尺度缩放），实物需按指节载荷重新校核。';
}

function animate() {
  requestAnimationFrame(animate);
  if (isPlaying) {
    animU += animDir * animSpeed * 0.004;
    if (animU >= 1) { animU = 1; animDir = -1; }
    if (animU <= 0) { animU = 0; animDir = 1; }
    setPose(gripPose(animU, 1.0));
  }
  controls.update();
  renderer.render(scene, camera);
}

function updateSliderLabels() {
  for (const f of HAND.fingers) {
    const F = FINGERS[f.key]; if (!F) continue;
    for (let i = 0; i < f.n; i++) {
      const v = document.getElementById(f.key+'_a'+i+'-val');
      if (v) v.textContent = F.pose[i].toFixed(1) + '°';
      const sl = document.getElementById(f.key+'_a'+i+'-slider');
      if (sl && Math.abs(parseFloat(sl.value) - F.pose[i]) > 1e-6) sl.value = F.pose[i];
    }
  }
  const sv = document.getElementById('speed-val');
  if (sv) sv.textContent = animSpeed.toFixed(1) + 'x';
}