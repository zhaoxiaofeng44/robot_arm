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
