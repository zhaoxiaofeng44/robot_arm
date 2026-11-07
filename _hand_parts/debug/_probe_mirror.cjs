'use strict';
const fs = require('fs'), path = require('path');
const G = require('../.verification/geom2d.cjs');
const THREE = G.THREE;
const root = __dirname;
const html = fs.readFileSync(path.join(root, '..', 'hand_mechanism_3d.html'), 'utf8');
const script = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].find(m => m[1].includes('const P ='))[1];
const nodes = new Map();
const mockEl = () => ({ style: {}, textContent: '', innerHTML: '', value: '0', className: '', addEventListener() {}, appendChild() {} });
const document = {
  getElementById(id) { if (!nodes.has(id)) nodes.set(id, mockEl()); return nodes.get(id); },
  createElement() { return { style: {}, className: '', innerHTML: '', appendChild() {}, getContext() { return { font: '', fillStyle: '', measureText() { return { width: 40 }; }, fillText() {} }; } }; },
};
const main = script.slice(0, script.lastIndexOf('\ninitScene();'));
const api = new Function('THREE', 'document', main + '\nscene = new THREE.Scene(); showLabels = false; buildMechanism(); updateMechanism(); return { P, s, scene, FINGERS, HAND, SPREAD, updateMechanism };')(THREE, document);
const { s, scene, HAND, FINGERS, SPREAD, updateMechanism } = api;
scene.updateMatrixWorld(true);
const meshes = new Map();
scene.traverse(o => { if (o.isMesh) meshes.set(o.name, o); });
const box = n => { const o = meshes.get(n); if (!o) return null; o.geometry.computeBoundingBox(); return new THREE.Box3().setFromObject(o); };
const ctr = n => { const b = box(n); return b ? b.getCenter(new THREE.Vector3()).divideScalar(s) : null; };
const f2 = v => v.toFixed(2);
const mm = b => b ? `x[${f2(b.min.x/s)},${f2(b.max.x/s)}] y[${f2(b.min.y/s)},${f2(b.max.y/s)}] z[${f2(b.min.z/s)},${f2(b.max.z/s)}]` : '?';
const k = 'middle';
console.log('== SPREAD =', JSON.stringify(SPREAD));
for (const n of ['middle_spMotorBody','middle_spMotorFlange','middle_spFlangePlate','middle_spExposedRod','middle_spBClevis',
  'middle_spBOutrigBeam','middle_spBBossL','middle_spBBossR','middle_sp_bBoltShank',
  'middle_spDAnchorConn','middle_spDAnchorArm','middle_spDAnchorPendant','middle_spDClevisBossL','middle_spDClevisBossR','middle_sp_dBoltShank',
  'middle_sptTendonWeb','middle_sptTendonEyeB','middle_sptTendonEyeD','middle_spHub']) {
  console.log(n.replace('middle_',''), mm(box(n)));
}
const F = FINGERS[k];
let worst = 0; const strokes = [];
for (const phi of [-12,-6,0,6,12]) {
  F.spread = phi; updateMechanism(); scene.updateMatrixWorld(true);
  const b = ctr('middle_sptTendonEyeB'), d2 = ctr('middle_sptTendonEyeD');
  const L = Math.hypot(b.x-d2.x, b.y-d2.y, b.z-d2.z);
  worst = Math.max(worst, Math.abs(L-85));
  strokes.push(`φ=${phi}: |BD|=${f2(L)} B_eye y_local≈${f2(b.y - SPREAD.pivotY)} z=${f2(b.z)}`);
}
F.spread = 0; updateMechanism(); scene.updateMatrixWorld(true);
console.log(strokes.join('\n'));
console.log('worst |BD| dev =', worst.toExponential(3), 'mm');
function intersect(a, b) {
  const A = meshes.get(a), B = meshes.get(b);
  if (!A || !B) return 'missing(mesh)';
  try { return G.solidsIntersect(G.makeSolid(A, s), G.makeSolid(B, s)) ? 'OVERLAP' : 'clear'; }
  catch (e) { return 'ERR:' + e.message; }
}
const pairs = [
  ['middle_spMotorBody','middle_spDAnchorConn','电机体×锚连接'],
  ['middle_spMotorBody','middle_spDAnchorArm','电机体×锚臂'],
  ['middle_spMotorBody','middle_spDAnchorPendant','电机体×锚吊耳'],
  ['middle_spMotorBody','middle_sptTendonWeb','电机体×连杆web'],
  ['middle_spMotorBody','middle_sptTendonEyeB','电机体×连杆B端环'],
  ['middle_spMotorBody','middle_spDClevisBossL','电机体×掌侧D耳L'],
  ['middle_spMotorBody','middle_spHub','电机体×毂'],
  ['middle_spBOutrigBeam','middle_spDAnchorPendant','外伸臂×锚吊耳'],
  ['middle_spBOutrigBeam','middle_spForkL','外伸臂×叉耳'],
  ['middle_spBOutrigBeam','middle_sptTendonEyeD','外伸臂×连杆D端环'],
  ['middle_sp_dBoltShank','middle_spMotorBody','D销×电机体'],
  ['middle_sp_bBoltShank','middle_spMotorBody','B销×电机体'],
  ['middle_spMotorBody','ring_palmFlangeBase','电机体×邻指法兰'],
  ['middle_spMotorBody','ring_spHub','电机体×邻指毂'],
  ['middle_spBOutrigBeam','ring_spHub','外伸臂×邻指毂'],
];
for (const phi of [0, 12, -12]) {
  F.spread = phi; updateMechanism(); scene.updateMatrixWorld(true);
  console.log(`\nφ=${phi}°:`);
  for (const [a,b,l] of pairs) console.log('  ' + l + ': ' + intersect(a,b));
}
F.spread = 0; updateMechanism(); scene.updateMatrixWorld(true);
