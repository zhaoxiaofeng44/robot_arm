
// ============ 闭合 / 行程 / 传动角 =============
const CLOSURE_POSES = [[0,0,0],[0.25,0.25,0.25],[0.5,0.5,0.5],[0.75,0.75,0.75],[1,1,1],[1,0.5,0.5],[0.5,1,1],[1,0.8,0.3],[0.3,0.8,1]];
let closureErr = 0, strokeErr = 0, minTrans = 90, maxTrans = 0;
for (const k of KEYS) {
  const L = FINGERS[k].limits, n = FINGERS[k].n;
  for (const c of CLOSURE_POSES) {
    const a = c.slice(0, n).map((x, i) => L[i] * x);
    const C = getJoints({ [k]: a })[k];
    for (let j = 0; j < n; j++) {
      const b = C.B[j], d = C.D[j];
      closureErr = Math.max(closureErr, Math.abs(Math.hypot(b.x - d.x, b.y - d.y) - P.tendonLinkLen));
      strokeErr = Math.max(strokeErr, Math.abs((P.s_extended - C.s[j]) - P.strokeMax * (a[j] / 120)));
      const ta = api.transmissionAngle(a[j]);
      minTrans = Math.min(minTrans, ta); maxTrans = Math.max(maxTrans, ta);
    }
  }
}

// ============ 可拆装性 / 互换性 =============
const has = n => nameSet.has(n);
const svc = [];
const check = (name, ok, detail) => svc.push({ name: name, pass: !!ok, detail: detail || '' });
check('无铆接/永久连接', !meshes.some(m => /rivet/i.test(m.name)), meshes.length + ' 网格');
const BOLT_PARTS = ['BoltHead','BoltShank','BoltThread','BoltWasher','BoltNut'];
let boltUnits = 0;
for (const k of KEYS) {
  const f = FINGERS[k], n = f.n, lab = f.label;
  for (let j = 0; j < n; j++) {
    const tri = [['O' + j, k + '_o' + j], ['B' + j, k + '_m' + j + 'b'], ['D' + j, k + '_p' + (j + 1) + 'd']];
    for (const t of tri) {
      const ok = BOLT_PARTS.every(x => has(t[1] + x));
      check(lab + ' ' + t[0] + ' 关节肩螺栓（头/光杆/螺纹/平垫/自锁螺母）齐全', ok, t[1]);
      if (ok) boltUnits++;
    }
    check(lab + ' 单元' + j + ' 推杆端自锁螺母在位', has(k + '_m' + j + 'RodNut'), k + '_m' + j + 'RodNut');
    check(lab + ' 单元' + j + ' 电机+连杆+叉头齐套', has(k + '_m' + j + 'MotorBody') && has(k + '_t' + j + 'TendonWeb')
      && has(k + '_t' + j + 'TendonEyeB') && has(k + '_t' + j + 'TendonEyeD'), '');
  }
  check(lab + ' 掌骨法兰 4×M4 齐套', has(k + '_palmFlangeBase') && [1,2,3,4].every(i => has(k + '_palmMountBolt' + i) && has(k + '_palmMountBoltHead' + i)), '');
  // 反根链：P{n}(固定·接掌) → 关节组 n−1 → P{n−1} → … → 关节组 0 → 掌段(自由末端·带指尖配件)
  const okChain = f.groups[f.n].parent === f.chainRoot && f.chainRoot.parent === f.root &&
    f.joints.length === f.n &&
    f.groups.slice(0, f.n).every((g, j) => g.parent === f.joints[j] && f.joints[j].parent === f.groups[j + 1]);
  check(lab + ' 反根链条父子关系正确（P' + f.n + '(固定·接掌)→…→P1→掌段(自由·指尖)）', okChain, '');
}
check('14 个关节单元（四指 3 + 拇指 2）肩螺栓总数 = 42 组', boltUnits === 42, boltUnits + ' 组 O/B/D');
check('轴向浮动 = ' + P.print.axialClearance + 'mm/侧（耳内档−连杆/袖套，与肘版 v5 相同）',
  ((16 - P.print.sleeveThickness) / 2) >= P.print.axialClearance - 1e-9 &&
  ((2 * (P.print.clevisPlateZ - 2)) - P.print.linkThickness) / 2 >= P.print.axialClearance - 1e-9, '');
check('连杆为等宽长条（几何同肘版 v5）', P.print.linkWidth === 15, '');
// 同规格件互换性：剥掉指名前缀后逐件比几何（拇指末端 P2 与四指末端 P3 对位）
function localSig(mesh) {
  const a = mesh.geometry.attributes.position, out = [];
  for (let i = 0; i < a.count; i++) out.push([a.getX(i).toFixed(6), a.getY(i).toFixed(6), a.getZ(i).toFixed(6)].join(','));
  return out.sort().join(';');
}
function normName(n) {
  const i = n.indexOf('_');
  if (i < 0) return n;
  const key = n.slice(0, i), rest = n.slice(i);
  if (key === 'thumb') return rest.replace(/^_p2/, '_p3');
  return rest;
}
const groups = new Map();
for (const m of meshes) {
  if (CHASSIS_RE.test(m.name)) continue;
  const nm = normName(m.name);
  if (!groups.has(nm)) groups.set(nm, []);
  groups.get(nm).push(m);
}
let interCount = 0; const interBad = [];
const seenKeys = new Set();
for (const m of meshes) {
  const key = m.name.slice(0, m.name.indexOf('_'));
  if (CHASSIS_RE.test(m.name) || seenKeys.has(key)) continue;
  seenKeys.add(key);
}
for (const g of groups.values()) {
  if (g.length < 2) continue;
  const sig = localSig(g[0]);
  const bad = g.filter(m => localSig(m) !== sig).map(m => m.name);
  if (bad.length) interBad.push(g[0].name + ' ⇔ ' + bad.slice(0, 2).join(','));
  else interCount += g.length;
}
check('五指同规格件逐件同几何（' + interCount + ' 件可互换，含拇指末端 P2≡四指末端 P3）', interBad.length === 0, interBad.slice(0, 4).join('; '));
const svcPass = svc.filter(c => c.pass).length;

// ============ 汇总 =============
const regular = [...pairStats.values()].filter(p => !p.mating_zone && isFinite(p.min_clearance_mm)).sort((a, b) => a.min_clearance_mm - b.min_clearance_mm);
const minClr = regular.length ? regular[0].min_clearance_mm : Infinity;
const lb = minClr - allowance;
const zonePairs = [...pairStats.values()].filter(p => p.mating_zone).length;
const tips = {};
for (const k of KEYS) tips[k] = +(getJoints(zeroPose())[k].tip.y / s).toFixed(1);
const summary = {
  version: 'hand-v1-five-finger-14-unit',
  status: '五指整手（四指×3 + 拇指×2 = 14 个同构关节单元）闭合/行程/配合区/安全包络碰撞/可拆装性核验',
  scale_note: '1:1 与手指版同尺寸（非人体尺度）：掌段300 + 300/300/250，整手 z 展宽 ' + (HAND.plateZ1 - HAND.plateZ0) + 'mm',
  fingers: FINGERS_PUBLIC(),
  limits_deg: LIMITS_PUBLIC(),
  grid_step_deg: GRID, fine_step_deg: STEP, broadphase_cell_mm: CELL,
  parameters: { motorMountX: P.motorMountX, motorMountY: P.motorMountY, tendonLinkLen: P.tendonLinkLen,
    strokeMax: +P.strokeMax.toFixed(3), s_extended: +P.s_extended.toFixed(3), phalanxLen: P.phalanx1Len, tipLen: P.forearmLen },
  results: { collision_count: collisions.length, mating_zone_pairs: zonePairs, rejected_2p5d_by_exact3d: rejected2p5d,
    allowance_mm: +allowance.toFixed(3), radius_max_mm: +allowanceMaxR.toFixed(1),
    allowance_worst_joint: allowancePerJoint.slice().sort((a, b) => b.allowance_mm - a.allowance_mm)[0],
    min_non_mating_clearance_mm: +minClr.toFixed(3), continuous_lower_bound_mm: +lb.toFixed(3),
    tested_pairs: pairStats.size, physical_meshes: meshes.length, poses_scanned: poseCount,
    closure_error_mm: closureErr, stroke_error_mm: +strokeErr.toFixed(6),
    transmission_angle_deg: [+minTrans.toFixed(1), +maxTrans.toFixed(1)],
    tip_y_mm: tips, svc_pass: svcPass, svc_total: svc.length },
  collisions: collisions.slice(0, 60),
  closest: regular.slice(0, 20).map(p => ({ pair: p.pair, assemblies: p.assemblies, min_clearance_mm: +p.min_clearance_mm.toFixed(3) })),
  serviceability: svc };
function FINGERS_PUBLIC() { const o = {}; for (const k of KEYS) o[k] = { label: FINGERS[k].label, n: FINGERS[k].n, limits: FINGERS[k].limits, pos_z: FINGERS[k].pos[2], spin: FINGERS[k].spin }; return o; }
function LIMITS_PUBLIC() { const o = {}; for (const k of KEYS) o[k] = FINGERS[k].limits; return o; }
console.log(JSON.stringify({ collisions: collisions.slice(0, 12), collision_count: collisions.length,
  mating_zone_pairs: zonePairs, min_clearance_mm: +minClr.toFixed(3), continuous_lower_bound_mm: +lb.toFixed(3),
  allowance_mm: +allowance.toFixed(3), allowance_radius_mm: +allowanceMaxR.toFixed(1),
  meshes: meshes.length, pairs: pairStats.size, poses: poseCount, closure_mm: closureErr,
  stroke_err: +strokeErr.toFixed(6), trans_deg: [+minTrans.toFixed(1), +maxTrans.toFixed(1)],
  svc: svcPass + '/' + svc.length, svc_fail: svc.filter(c => !c.pass).map(c => c.name + ' | ' + c.detail) }, null, 1));
if (!process.argv.includes('--no-write')) fs.writeFileSync(path.join(root, 'hand_verify_report.json'), JSON.stringify(summary, null, 2) + '\n');
assert(closureErr < 1e-6, '关节闭合误差（B–D 中心距 ≠ 连杆长）');
assert(strokeErr <= P.strokeMax + 1e-9, '行程越界');
assert.equal(collisions.length, 0, '安全包络内扫描到配合区之外的接触');
if (QUICK) {
  // quick 模式步长 0.25°→ 允差被放大 ~5 倍（本例 Rmax≈876mm → 3.82mm），连续下限断言只在完整模式生效
  const fullAllow = allowanceMaxR * 0.05 * Math.PI / 180;
  console.log('（quick：步长允差 ' + allowance.toFixed(3) + 'mm；完整模式 STEP=0.05° → 允差 ' + fullAllow.toFixed(3) +
    'mm，届时连续下限 = ' + (minClr - fullAllow).toFixed(3) + 'mm）');
} else {
  assert(lb > 0, '细扫连续间隙下限非正：' + JSON.stringify(regular.slice(0, 4)));
}
assert(svcPass === svc.length, '可拆装性/互换性检查未全通过');
module.exports = { api: api, summary: summary };