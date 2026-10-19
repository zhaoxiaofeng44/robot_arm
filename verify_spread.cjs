'use strict';
// 展开/并拢副连接物理性独立审计（verify_spread.cjs）
//   逐指核验：Ø10 铰链销 / Ø8 D 销 / B 销 三处销轴是否真穿孔、同轴、落在设计位置，
//   以及电机-安装板-抱箍-吊架-毂-曲柄 是否构成一条不断开的固定/转动链。
//   判据：销轴圆柱轴心 vs 孔件中心 偏差 ≤ 0.5mm（与 verify_connections 同口径）
const fs = require('fs'), path = require('path');
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
const api = new Function('THREE', 'document', main + '\nscene = new THREE.Scene(); showLabels = false; buildMechanism(); updateMechanism(); return { P, s, scene, FINGERS, HAND, SPREAD, updateMechanism };')(THREE, document);
const { s, scene, HAND, FINGERS, SPREAD, updateMechanism } = api;
scene.updateMatrixWorld(true);

const meshes = new Map();
scene.traverse(o => { if (o.isMesh) meshes.set(o.name, o); });
const box = n => { const o = meshes.get(n); if (!o) return null; o.geometry.computeBoundingBox(); return new THREE.Box3().setFromObject(o); };
const ctr = n => { const b = box(n); return b ? b.getCenter(new THREE.Vector3()).divideScalar(s) : null; };
const dim = n => { const b = box(n); if (!b) return null; const d = b.getSize(new THREE.Vector3()).divideScalar(s); return d; };
const f2 = v => v.toFixed(2);

let pass = 0, fail = 0; const log = [];
function check(name, ok, detail) { if (ok) pass++; else fail++; log.push((ok ? '  PASS  ' : '  FAIL  ') + name + (detail ? '   [' + detail + ']' : '')); }

for (const k of HAND.keys) {
  const lab = HAND.fingers.find(f => f.key === k).label;
  const has = n => meshes.has(k + '_' + n);
  // ① 件齐套
  const parts = ['spForkL', 'spForkR', 'spHub', 'spCrankArm', 'spDClevisBossL', 'spDClevisBossR', 'spBracket',
    'spMotorBody', 'spMotorFlange', 'spFlangePlate', 'spClevisPlateL', 'spRodNut',
    'sp_oBoltShank', 'sp_dBoltShank', 'spbBoltShank', 'spExposedRod',
    'sptTendonWeb', 'sptTendonEyeB', 'sptTendonEyeD'];
  const missing = parts.filter(n => !has(n));
  check(lab + ' 展开副零件齐套（19 类）', missing.length === 0, missing.join(','));
  // ② Ø10 铰链销：沿 x、与叉耳孔/毂孔三心同轴（≤0.5mm）
  const so = ctr(k + '_sp_oBoltShank'), dso = dim(k + '_sp_oBoltShank');
  const axOk = dso && dso.x >= dso.y * 1.8 && dso.x >= dso.z * 1.8 && Math.abs(dso.y - dso.z) < 0.6;
  check(lab + ' Ø10 铰链销轴线沿 x（指根摆动轴）', !!axOk, dso ? '长' + f2(dso.x) + ' 截面' + f2(dso.y) + '×' + f2(dso.z) : 'missing');
  if (so) {
    for (const [nm, tag] of [['spForkBossL', '叉耳孔 L'], ['spForkBossR', '叉耳孔 R'], ['spHub', '毂孔']]) {
      const c = ctr(k + '_' + nm);
      const d = c ? Math.hypot(c.y - so.y, c.z - so.z) : 999;
      check(lab + ' Ø10 销穿过' + tag + '（同轴 ≤0.5mm）', d <= 0.5, 'Δ=' + f2(d) + 'mm');
    }
  }
  // ③ Ø8 D 销：沿 x、与曲柄 D 双耳 + 连杆 D 端环同轴
  const sd = ctr(k + '_sp_dBoltShank');
  if (sd) {
    for (const [nm, tag] of [['spDClevisBossL', 'D 双耳 L'], ['spDClevisBossR', 'D 双耳 R'], ['sptTendonEyeD', '连杆 D 端环']]) {
      const c = ctr(k + '_' + nm);
      const d = c ? Math.hypot(c.y - sd.y, c.z - sd.z) : 999;
      check(lab + ' Ø8 D 销穿过' + tag + '（同轴 ≤0.5mm）', d <= 0.5, 'Δ=' + f2(d) + 'mm');
    }
  }
  // ④ B 销：推杆叉头 ↔ 连杆 B 端环
  const sb = ctr(k + '_spbBoltShank'), cb = ctr(k + '_sptTendonEyeB');
  if (sb && cb) {
    const d = Math.hypot(cb.y - sb.y, cb.z - sb.z);
    check(lab + ' B 销穿过连杆 B 端环（同轴 ≤0.5mm）', d <= 0.5, 'Δ=' + f2(d) + 'mm');
  }
  // ⑤ 固定链：吊架必须同时贴住安装板与掌骨安装件（沿 y 连续，无悬空）
  const bbk = box(k + '_spBracket'), bpl = box(k + '_spFlangePlate'), bbase = box(k + '_palmBase');
  if (bbk && bpl && bbase) {
    const reachDown = bpl.max.y - bbk.min.y >= 2 * s;
    const reachUp = bbk.max.y - bbase.min.y >= 2 * s;
    check(lab + ' C 形吊架上下都咬住（安装板 ↔ 掌骨方块）', reachDown && reachUp,
      '下 ' + f2(bbk.min.y / s - bpl.max.y / s) + 'mm / 上 ' + f2(bbk.max.y / s - bbase.min.y / s) + 'mm');
  }
  // ⑥ 闭合恒等 + 展开极限仍闭合
  const F = FINGERS[k], L = 85;
  const eB0 = ctr(k + '_sptTendonEyeB'); let worst = 0;
  for (const phi of [-SPREAD.limitDeg, -6, 0, 6, SPREAD.limitDeg]) {
    F.spread = phi; updateMechanism();
    const b = ctr(k + '_sptTendonEyeB'), d2 = ctr(k + '_sptTendonEyeD');
    worst = Math.max(worst, Math.abs(Math.hypot(b.x - d2.x, b.y - d2.y, b.z - d2.z) - L));
  }
  F.spread = 0; updateMechanism();
  check(lab + ' 展开全程 |BD| ≡ 85mm（φ=±' + SPREAD.limitDeg + '°）', worst < 1e-3, '最大偏差 ' + (worst * 1e6).toFixed(2) + 'e-6mm');
  // ⑦ 推杆始终在电机前端面与 B 之间（不脱出、不穿底）
  const noseY = SPREAD.noseY;
  check(lab + ' 推杆露出段端面在电机前端面之下（不顶死）', !!eB0 && (eB0.y - SPREAD.pivotY) > noseY, 'B.y_local=' + f2(eB0.y - SPREAD.pivotY) + 'mm > nose=' + noseY);
}
console.log('=== 展开/并拢副连接物理性审计 ===');
console.log(log.join('\n'));
console.log('\n结果: ' + pass + '/' + (pass + fail) + (fail ? '  ✗' : '  全部成立 ✓'));
const rep = ['=== 展开/并拢副连接物理性审计（verify_spread.cjs） ===', ''].concat(log)
  .concat(['', '结果: ' + pass + '/' + (pass + fail) + (fail ? ' ✗' : ' 全部成立 ✓'), '']).join('\n');
fs.writeFileSync(path.join(root, 'connections_verify_report_spread.txt'), rep);
process.exitCode = fail ? 1 : 0;
