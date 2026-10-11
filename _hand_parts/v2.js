
// ============ 设计贴合/同轴滑动（不计入碰撞与间隙统计） =============
function skipPair(A, B) {
  if (A.assembly === B.assembly) return '同一刚性子总成';
  const set = new Set([A.assembly, B.assembly]);
  const names = [A.name, B.name];
  const has = re => names.some(n => re.test(n));
  if (set.has('CHASSIS')) {
    if (has(/_(palmFlangeBase|palmMountBolt\d+|palmMountBoltHead\d+)$/)) return '掌骨法兰与掌体骨架的螺栓连接面（设计贴合）';
    if (has(/MountBoltHead\d+$/) && has(/_(palmFlangeBase)$/)) return 'M4 螺栓头与掌骨板让位孔的设计配合';
  }
  for (const k of KEYS) {
    const n = FINGERS[k].n;
    for (let j = 0; j < n; j++) {
      const seg = (j === 0 ? k + '_PALM' : k + '_P' + j);
      const fpLc = (j === 0 ? k + '_palm' : k + '_p' + j);
      const mf = k + '_m' + j + 'Fixed';
      if (set.has(seg) && set.has(mf)) {
        if (has(new RegExp('^' + k + '_m' + j + '(Collar|FlangeBolt)'))) return '电机抱箍/法兰螺栓与所在段固定连接';
        if (has(new RegExp('^' + fpLc + 'FlangePlate'))) return '电机法兰安装板与电机的设计配合（含导向孔）';
      }
      if (set.has(mf) && set.has(k + '_m' + j + 'Slider')) {
        if (has(new RegExp('^' + k + '_m' + j + '(ExposedRod|RodThreadStub)$')) && has(new RegExp('^' + k + '_m' + j + '(MotorBody|MotorFrontCap|MotorRearCap)$'))) return '推杆与电机同轴滑动配合';
      }
      if (set.has(k + '_m' + j + 'Slider') && has(new RegExp('^' + k + '_m' + j + '(ExposedRod|RodThreadStub)$')) && has(new RegExp('^' + fpLc + 'FlangePlate'))) return '推杆穿过该段安装板导向孔';
      if (set.has(seg) && has(new RegExp('^' + k + '_m' + j + 'Collar')) && has(new RegExp('^' + fpLc + 'FlangePlate'))) return '电机抱箍与安装板的设计贴合';
    }
  }
  return null;
}

// ============ 配合区（孔半径 + 0.6mm）：区内重叠=销轴设计配合，区外重叠=碰撞 =============
const R_O = P.boreElbow / 2 + 0.6, R_L = P.boreLink / 2 + 0.6;
function zoneOf(A, B, J, spunKey) {
  const set = new Set([A.assembly, B.assembly]);
  const mm = v => { const w = spunKey ? v.clone().applyMatrix4(localFix[spunKey]) : v; return { x: w.x / s, y: w.y / s }; };
  for (const k of KEYS) {
    const n = FINGERS[k].n, C = J[k];
    const segOf = i => (i === 0 ? k + '_PALM' : k + '_P' + i);
    for (let j = 0; j < n; j++) {
      if (set.has(segOf(j)) && set.has(segOf(j + 1))) return { name: k + ':O' + j, r: R_O, c: mm(C.OW[j]) };
      if (set.has(segOf(j + 1)) && set.has(k + '_T' + j)) return { name: k + ':D' + j, r: R_L, c: mm(C.DW[j]) };
      if (set.has(k + '_m' + j + 'Slider') && set.has(k + '_T' + j)) return { name: k + ':B' + j, r: R_L, c: mm(C.BW[j]) };
    }
  }
  return null;
}

// ============ 姿态扫描 =============
const pairStats = new Map(), collisions = [];
const skipCache = new Map();
let poseCount = 0, pairTested = 0, rejected2p5d = 0;
function sweep(pose) {
  updateMechanism(pose);
  scene.updateMatrixWorld(true);
  poseCount++;
  const J = getJoints(pose);
  const shapes = projectAll();
  const localShapes = SPUN.length ? projectLocal() : null;
  for (const pr of broadPairs3(shapes, CELL)) {
    const i = pr[0], j = pr[1];
    const kA = keyOf[i], kB = keyOf[j];
    const spunPair = !!(kA && kA === kB && spunSet.has(kA));
    const A = spunPair ? localShapes[i] : shapes[i], B = spunPair ? localShapes[j] : shapes[j];
    const pk = pr[0] < pr[1] ? pr[0] * 100000 + pr[1] : pr[1] * 100000 + pr[0];
    let sk = skipCache.get(pk);
    if (sk === undefined) { sk = skipPair(A, B) || ''; skipCache.set(pk, sk); }
    if (sk) continue;
    pairTested++;
    const kk = A.name + ' | ' + B.name;
    let st = pairStats.get(kk);
    if (!st) { st = { pair: kk, assemblies: [A.assembly, B.assembly], min_clearance_mm: Infinity, mating_zone: null }; pairStats.set(kk, st); }
    const z = zoneOf(A, B, J, spunPair ? kA : null);
    if (z) st.mating_zone = z.name;
    const zover = Math.min(A.zmax, B.zmax) - Math.max(A.zmin, B.zmin);
    const inter = G.clip(A.xy, B.xy);
    const contact = inter.length > 0 && G.area(inter) > 1e-8;
    if (contact && zover > 1e-7) {
      const r = z ? Math.max.apply(null, inter.map(q => Math.hypot(q[0] - z.c.x, q[1] - z.c.y))) : Infinity;
      if (!(z && r <= z.r)) {
        const needExact = !spunPair && (spunSet.has(kA) || spunSet.has(kB));
        if (needExact && !exactIntersect(i, j)) { rejected2p5d++; }
        else if (collisions.length < 300) collisions.push({ pose: pose, pair: kk, assemblies: st.assemblies,
          zone: z ? z.name : null, exact3d: needExact, max_r_mm: isFinite(r) ? +r.toFixed(2) : null,
          overlap_mm2: +G.area(inter).toExponential(2) });
      }
    }
    if (!z) {
      const gz = Math.max(0, A.zmin - B.zmax, B.zmin - A.zmax);
      let d;
      if (contact || gz >= 20) d = gz;                       // 接触→z 向重叠量；远件→用 z 间隙作保守下界（省去多边形距离）
      else d = Math.hypot(G.polyDist(A.xy, B.xy), gz);
      if (isFinite(d) && d < st.min_clearance_mm) st.min_clearance_mm = d;
    }
  }
  return J;
}
function zeroPose() { const p = {}; for (const k of KEYS) p[k] = FINGERS[k].limits.map(() => 0); return p; }
function scalePose(u, thumbU) {
  const p = {};
  for (const k of KEYS) p[k] = FINGERS[k].limits.map(l => l * u * (k === 'thumb' && thumbU !== undefined ? thumbU : 1));
  return p;
}

// ---- 步长允差：细扫相邻两姿态之间，运动件上最远点走过的弦长（保守上界） ----
updateMechanism(zeroPose());
scene.updateMatrixWorld(true);
const J0 = getJoints(zeroPose());
let allowanceMaxR = 0;
const allowancePerJoint = [];
const _v = new THREE.Vector3();
for (const k of KEYS) {
  const F = FINGERS[k], n = F.n;
  for (let j = 0; j < n; j++) {
    const o = J0[k].OW[j], ox = o.x / s, oy = o.y / s;
    let rmax = 0;
    F.groups[j + 1].traverse(function (m) {
      if (!m.isMesh) return;
      const a = m.geometry.attributes.position;
      for (let i = 0; i < a.count; i++) {
        _v.set(a.getX(i), a.getY(i), a.getZ(i));
        m.localToWorld(_v);
        rmax = Math.max(rmax, Math.hypot(_v.x / s - ox, _v.y / s - oy));
      }
    });
    allowancePerJoint.push({ finger: k, joint: j, r_max_mm: +rmax.toFixed(1), allowance_mm: +(rmax * STEP * Math.PI / 180).toFixed(3) });
    allowanceMaxR = Math.max(allowanceMaxR, rmax);
  }
}
const allowance = allowanceMaxR * STEP * Math.PI / 180;
// ---- ① 逐关节细扫（其余关节归零）：求连续间隙下限 ----
for (const k of KEYS) {
  const L = FINGERS[k].limits, n = FINGERS[k].n;
  for (let j = 0; j < n; j++) {
    const steps = Math.max(1, Math.round(L[j] / STEP));
    for (let i = 0; i <= steps; i++) {
      const pose = zeroPose();
      pose[k][j] = L[j] * i / steps;
      sweep(pose);
    }
  }
}
// ---- ② 每指安全包络内三维网格（其余指归零）：自干涉 + 与骨架/邻指干涉 ----
function gridPoses(L, n, cb) {
  const cnt = L.map(l => Math.max(1, Math.round(l / GRID)));
  const cur = new Array(n).fill(0);
  (function rec(d) {
    if (d === n) { cb(cur.slice()); return; }
    for (let i = 0; i <= cnt[d]; i++) { cur[d] = L[d] * i / cnt[d]; rec(d + 1); }
  })(0);
}
for (const k of KEYS) {
  const L = FINGERS[k].limits;
  gridPoses(L, FINGERS[k].n, arr => { const pose = zeroPose(); pose[k] = arr; sweep(pose); });
}
// ---- ③ 整手姿态：等比抓握 / 单指极值 / 拇指对掌 / 随机组合 ----
const wholePoses = [];
for (let i = 0; i <= 10; i++) wholePoses.push(scalePose(i / 10));
for (const k of KEYS) { const p = zeroPose(); p[k] = FINGERS[k].limits.slice(); wholePoses.push(p); }
for (const a of [0, 0.5, 1]) for (const b of [0, 0.5, 1]) {
  const p = zeroPose();
  p.thumb = FINGERS.thumb.limits.map(l => l * a);
  p.index = FINGERS.index.limits.map(l => l * b);
  wholePoses.push(p);
}
let seed = 20240921;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const NRAND = QUICK ? 80 : 400;
for (let i = 0; i < NRAND; i++) {
  const p = zeroPose();
  for (const k of KEYS) p[k] = FINGERS[k].limits.map(l => l * rnd());
  wholePoses.push(p);
}
for (const p of wholePoses) sweep(p);