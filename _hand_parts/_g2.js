function updateBioInfo() {
  document.getElementById('bio-info').innerHTML =
    '<span class=biological>掌段（固定基节）×5</span> = 掌骨类比（300mm，各载电机0；顶端 4×M5 掌骨法兰固定在掌骨板上）<br>' +
    '<span class=biological>近节/中节 ×5 指</span> = 两个被驱动段（各 300mm，各载电机1/2）<br>' +
    '<span class=biological>远节 ×5 指</span> = 指尖段（250mm，只含被动接口）<br>' +
    '<span class=biological>拇指</span> = 掌段 + 近节 + 中节 + 指尖段（3 关节：MCP + PIP + DIP，与其他手指同构）<br>' +
    '<span class=biological>15 台圆柱直线电机</span> = 指深/指浅屈肌 + 骨间肌 + 大鱼际肌群类比（每关节 1 只，全独立驱动）<br>' +
    '<span class=biological>掌骨板/腕拼接块/拇指连接肋</span> = 掌骨 + 腕骨类比（全部螺栓可拆，指根法兰 4×M5 接口通用）<br>' +
    '<span class=biological>拇指 z=−220 基节位</span> = 拇指对掌侧布置（五个机构平面平行、间距 70mm；拇指基节移到掌骨板另一端）';
}

function updateParamInfo() {
  const pr = P.print;
  document.getElementById('param-info').innerHTML =
    '<b>构型</b>: <span class=highlight>五指整手 · 15 个（圆柱电机+BD长条连杆）同构关节单元</span>（五指各 3 关节）<br>' +
    '<b>段长</b>: 掌段 ' + P.upperArmLen + ' / 近节 ' + P.phalanx1Len + ' / 中节 ' + P.phalanx2Len + ' / 远节 ' + P.forearmLen + ' mm（与手指版 1:1 同尺寸）<br>' +
    '<b>整手尺度</b>: 指尖 y=' + (-(P.upperArmLen + P.phalanx1Len + P.phalanx2Len + P.forearmLen + 14)) + ' mm → 腕板顶 y=' + HAND.wristY1 + ' mm；指距 ' + HAND.spacing + ' mm<br>' +
    '<b>电机</b>: 15× Ø' + (2*P.motorBodyRadius) + ' × ' + P.motorBodyLen + ' mm 直线电机（每关节 1 只，全部随各自上一级段运动）<br>' +
    '<b>行程基准</b>: 每单元 A=(28,213) 相对自身关节；BD 中心距 ' + P.tendonLinkLen + ' mm；D=(14,-31)；单关节行程 ' + P.strokeMax.toFixed(2) + ' mm<br>' +
    '<b>掌体骨架</b>: 掌骨板A/B（66×10 平板，z∈[−117,0] / [0,140]）+ 腕拼接块（4×Ø9 腕接口 + Ø40 走线孔）+ 拇指连接肋<br>' +
    '<b>指根接口</b>: 每根手指 4×M5（法兰外圈 Ø5.5，孔距 44×44）+ Ø9 走线孔，五指共用一块掌骨板<br>' +
    '<b>指尖</b>: Ø24 圆柱 + 半球垫 + 3 条防滑抓握棱（每指相同）<br>' +
    '<b>关节衔接</b>: 15 个关节同为 耳内档16−袖套14、耳内档10−连杆8 → 轴向浮动 ' + pr.axialClearance + ' mm/侧<br>' +
    '<b>安全包络</b>: 五指 90°/90°/70°（由 verify_hand.cjs 三维姿态扫描确定，见 hand_design_spec.md）';
}
