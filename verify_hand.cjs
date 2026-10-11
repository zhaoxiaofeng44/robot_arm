'use strict';
// 五指整手校验（verify_hand.cjs）—— 1:1 尺度，14 个关节单元（四指×3 + 拇指×2）
//   每单元 = 电机(k) + BD长条连杆(k) + 被驱动段(k+1)，几何与手指版逐件相同
//   核验：
//     ① 逐关节细扫（STEP）→ 连续间隙下限（扣除步长允差 allowance）
//     ② 每指安全包络内三维网格（GRID）→ 单指自干涉 + 与骨架/邻指干涉
//     ③ 整手姿态：五指等比抓握 / 单指极值 / 拇指对掌 / 随机组合
//     ④ 闭合误差·行程一致性·传动角
//     ⑤ 可拆装性：无铆接、14 关节紧固件齐套、同规格件可互换、链条父子关系
//   配合区半径 = 孔半径 + 0.6mm（与肘版 v5 / 手指版一致）
//   用法: node verify_hand.cjs [--quick] [--no-write]
const fs = require('fs'), path = require('path'), assert = require('assert/strict');
const G = require('./.verification/geom2d.cjs');
const THREE = G.THREE;
const root = __dirname;
const html = fs.readFileSync(path.join(root, 'hand_mechanism_3d.html'), 'utf8');
const script = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].find(m => m[1].includes('const P ='))[1];
const nodes = new Map();
const mockEl = () => ({ style: {}, textContent: '', innerHTML: '', value: '0', className: '', addEventListener() {}, appendChild() {} });
const document = {
  getElementById(id) { if (!nodes.has(id)) nodes.set(id, mockEl()); return nodes.get(id); },
  createElement() { return { style: {}, className: '', innerHTML: '', appendChild() {},
    getContext() { return { font: '', fillStyle: '', measureText() { return { width: 40 }; }, fillText() {} }; } }; },
};
const main = script.slice(0, script.lastIndexOf('\ninitScene();'));
const api = new Function('THREE', 'document', main + '\nscene = new THREE.Scene(); showLabels = false; buildMechanism(); updateMechanism(); return { P, s, scene, getJoints, updateMechanism, FINGERS, HAND, angleToStroke, getForceData, transmissionAngle, currentPose };')(THREE, document);
const { P, s, scene, HAND, FINGERS, getJoints, updateMechanism } = api;
const KEYS = HAND.keys;
const QUICK = process.argv.includes('--quick');
const GRID = QUICK ? 10 : 5;      // 包络内三维网格步长（deg）
const STEP = QUICK ? 0.25 : 0.05; // 单关节细扫步长（deg）
const CELL = 45;                  // 三维宽相单元（mm）
const MAXPOSE = 400000;

// ============ 网格清点与分类 =============
const meshes = [];
scene.traverse(o => { if (o.isMesh) meshes.push(o); });
const CHASSIS_RE = /^(palmPlateA|palmPlateB|palmSpliceTop|wristBlock|wristBoss\d+|thumbBridge|thumbBridgeBoss\d+)$/;
function classOf(mesh) {
  const chain = []; for (let o = mesh; o; o = o.parent) chain.push(o.name);
  if (chain.some(n => CHASSIS_RE.test(n))) return 'CHASSIS';
  let key = null;
  for (const k of KEYS) if (chain.indexOf(k + '_root') >= 0) { key = k; break; }
  if (!key) return 'OTHER';
  // 由内向外取第一个命中的骨架组（段号必须取最内层，否则 P3 会被误判成 P1）
  for (const n of chain) {
    if (n.indexOf(key + '_') !== 0) continue;
    const rest = n.slice(key.length + 1);
    let m;
    if ((m = /^m(\d)Rod$/.exec(rest))) return key + '_m' + m[1] + 'Slider';
    if ((m = /^t(\d)Tendon$/.exec(rest))) return key + '_T' + m[1];
    if ((m = /^m(\d)Motor$/.exec(rest))) return key + '_m' + m[1] + 'Fixed';
    if ((m = /^phalanx(\d)$/.exec(rest))) return key + '_P' + m[1];
    if (rest === 'palm') return key + '_PALM';
  }
  return 'OTHER';
}
const assembly = meshes.map(classOf);
const nameSet = new Set(meshes.map(m => m.name));
assert.equal(nameSet.size, meshes.length, '网格名必须唯一');
assert(!meshes.some(m => /rivet/i.test(m.name)), '不允许残留铆接件');
assert.equal(assembly.filter(a => a === 'OTHER').length, 0, '存在未分类网格');
const prepared = meshes.map((m, i) => G.prepare(m, s, assembly[i]));

// ============ 投影缓存（同一姿态下静止件直接复用；单关节细扫提速关键） =============
const cache = new Array(meshes.length).fill(null);
const lastE = new Array(meshes.length).fill(null);
function projectAll() {
  const out = new Array(meshes.length);
  for (let i = 0; i < meshes.length; i++) {
    const e = meshes[i].matrixWorld.elements;
    let same = cache[i] !== null;
    if (same) { const lm = lastE[i]; for (let t = 0; t < 16; t++) if (lm[t] !== e[t]) { same = false; break; } }
    if (same) { out[i] = cache[i]; continue; }
    const sh = G.project(prepared[i]);
    out[i] = sh; cache[i] = sh;
    const cp = new Array(16); for (let t = 0; t < 16; t++) cp[t] = e[t];
    lastE[i] = cp;
  }
  return out;
}
// 三维宽相：三层单元桶（x,y,z）—— 重叠必共享单元，因而对碰撞判定无漏检
function broadPairs3(shapes, cell) {
  const grid = new Map();
  const bb = shapes.map(sh => {
    let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
    for (const q of sh.xy) { a = Math.min(a, q[0]); b = Math.max(b, q[0]); c = Math.min(c, q[1]); d = Math.max(d, q[1]); }
    return { a, b, c, d, z0: sh.zmin, z1: sh.zmax };
  });
  for (let i = 0; i < shapes.length; i++) {
    const g = bb[i];
    if (!isFinite(g.a)) continue;
    for (let gx = Math.floor(g.a / cell); gx <= Math.floor(g.b / cell); gx++)
      for (let gy = Math.floor(g.c / cell); gy <= Math.floor(g.d / cell); gy++)
        for (let gz = Math.floor(g.z0 / cell); gz <= Math.floor(g.z1 / cell); gz++) {
          const k = gx + ',' + gy + ',' + gz; let arr = grid.get(k); if (!arr) { arr = []; grid.set(k, arr); } arr.push(i);
        }
  }
  const seen = new Set(), out = [];
  for (const arr of grid.values())
    for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
      const a = arr[i], b = arr[j], k = a < b ? a * 100000 + b : b * 100000 + a;
      if (seen.has(k)) continue; seen.add(k); out.push([a, b]);
    }
  return out;
}
// ============ 自转手指（spin≠0，本设计为拇指 −30° 对掌）的局部系投影 =============
//   2.5D（XY投影 + z 区间）判据只在“机构平面 = XY 平面”时精确；拇指绕自身长轴滚转后，
//   其零件在世界系的 z 区间被 x/z 混合撑大 → 会产生假接触。故对拇指零件再算一套“反向滚转”投影，
//   同指配对一律在局部系内判；跨指/骨架配对仍用世界系，并对 2.5D 报出的接触用 3D 实体求交复核。
const keyOf = meshes.map((m, i) => { const a = assembly[i]; return a === 'CHASSIS' ? null : a.slice(0, a.indexOf('_')); });
const SPUN = KEYS.filter(k => Math.abs(FINGERS[k].spin) > 1e-9);
const spunSet = new Set(SPUN);
const localFix = {};
for (const k of SPUN) {
  const rt = FINGERS[k].root;
  const p = rt.position.clone();
  localFix[k] = new THREE.Matrix4().makeTranslation(-p.x, -p.y, -p.z)
    .premultiply(new THREE.Matrix4().makeRotationFromQuaternion(rt.quaternion.clone().invert()))
    .premultiply(new THREE.Matrix4().makeTranslation(p.x, p.y, p.z));
}
function projectLocal() {
  const out = new Array(meshes.length).fill(null);
  for (const k of SPUN) {
    for (let i = 0; i < meshes.length; i++) {
      if (keyOf[i] !== k) continue;
      const m = meshes[i], save = m.matrixWorld.clone();
      m.matrixWorld.premultiply(localFix[k]);
      out[i] = G.project(prepared[i]);
      m.matrixWorld.copy(save);
    }
  }
  return out;
}
const solidCache = new Map();
function exactIntersect(i, j) {
  let sa = solidCache.get(i); if (!sa) { sa = G.makeSolid(meshes[i], s); solidCache.set(i, sa); }
  let sb = solidCache.get(j); if (!sb) { sb = G.makeSolid(meshes[j], s); solidCache.set(j, sb); }
  return !!G.solidsIntersect(sa, sb);
}

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
  check(lab + ' 链条父子关系正确（掌段→P1→…→P' + f.n + '）',
    f.groups[0].parent === f.root && f.groups.slice(1).every((g, i) => g.parent === f.groups[i]), '');
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