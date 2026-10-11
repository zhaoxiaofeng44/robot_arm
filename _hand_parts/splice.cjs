const fs = require('fs');
const base = '/Users/xf/workspace/myArm/robot_arm/';
const src = fs.readFileSync(base + 'finger_mechanism_3d.html', 'utf8').split('\n');
const part = function(n){ return fs.readFileSync(base + '_hand_parts/' + n, 'utf8').replace(/\n$/, '').split('\n'); };
const seg = function(a, b){ return src.slice(a - 1, b); };
const out = [];
out.push(...seg(1, 5));
out.push('  <title>仿生五指整手 — 14 台直线电机驱动 4×3 + 拇指 2 关节（同一可拆肘关节单元）</title>');
out.push(...seg(7, 37));
out.push(...part('c_panel.html'));
out.push(...seg(66, 68));
out.push(...part('c_header.txt'));
out.push(...seg(82, 159));
out.push(...part('c_const.js'));
out.push(...seg(160, 222));
out.push(...part('c_globals.js'));
out.push(...seg(241, 712));
out.push(...part('c_build1.js'));
out.push(...part('c_build2.js'));
out.push(...seg(799, 799));
out.push(...part('c_tail1.js'));
out.push(...part('c_tail2.js'));
out.push(...part('c_ui.js'));
out.push('</script>', '</body>', '</html>');
const patches = [
  ['  scene.fog = new THREE.Fog(0x1a1a2e, 400, 1000);', '  scene.fog = new THREE.Fog(0x1a1a2e, 1400, 3600);'],
  ['window.innerHeight, 0.1, 2000)', 'window.innerHeight, 0.1, 6000)'],
  ['  camera.position.set(150, 55, 310);', '  camera.position.set(430, 120, 760);'],
  ['  controls.target.set(0, 20, 0);', '  controls.target.set(0, -150 * s, 0);'],
  ['  dirLight.position.set(100, 200, 150);', '  dirLight.position.set(300, 520, 380);'],
  ['  dirLight.shadow.camera.left = -200; dirLight.shadow.camera.right = 200;', '  dirLight.shadow.camera.left = -420; dirLight.shadow.camera.right = 420;'],
  ['  dirLight.shadow.camera.top = 300; dirLight.shadow.camera.bottom = -200;', '  dirLight.shadow.camera.top = 420; dirLight.shadow.camera.bottom = -420;'],
  ['GridHelper(500, 50, 0x3a3a5a, 0x2a2a4a)', 'GridHelper(1400, 70, 0x3a3a5a, 0x2a2a4a)'],
  ['  gridHelper.position.y = -280 * s;', '  gridHelper.position.y = -900 * s;'],
  ['new THREE.PlaneGeometry(500, 500)', 'new THREE.PlaneGeometry(1400, 1400)'],
  ['  shadowPlane.position.y = -279.9 * s;', '  shadowPlane.position.y = -899.9 * s;'],
  ['PointLight(0x6060ff, 0.3, 500)', 'PointLight(0x6060ff, 0.3, 1200)'],
  ["mg.name = 'motor'+mPfx.slice(1);", "mg.name = mPfx + 'Motor';"],
  ["'o'+pfx.slice(1)", "pfx.replace(/_p/, '_o')"],
];
let text = out.join('\n');
for (const pr of patches) {
  if (text.indexOf(pr[0]) < 0) throw new Error('patch not found: ' + pr[0]);
  text = text.split(pr[0]).join(pr[1]);
}
fs.writeFileSync(base + 'hand_mechanism_3d.html', text + '\n');
console.log('hand_mechanism_3d.html lines:', text.split('\n').length);