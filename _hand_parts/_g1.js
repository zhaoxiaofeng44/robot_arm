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
