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
