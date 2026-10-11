function setupUI() {
  document.getElementById('loading').style.display = 'none';
  document.getElementById('control-panel').style.display = 'block';
  updateBioInfo(); updateParamInfo(); updatePrintInfo();
  // —— 逐关节滑杆：按手指分组，上限 = 该关节安全包络 ——
  const host = document.getElementById('joint-sliders');
  const jointNames = ['关节0 MCP 掌指', '关节1 PIP 近指', '关节2 DIP 远指'];
  for (const f of HAND.fingers) {
    const blk = document.createElement('div');
    blk.className = 'finger-block';
    blk.innerHTML = '<h4>' + f.label + ' · ' + f.n + ' 关节 · 安全包络 ' + f.limits.join('° / ') + '°</h4>';
    for (let i = 0; i < f.n; i++) {
      const row = document.createElement('div');
      row.className = 'slider-group';
      const nm = (f.n === 2 && i === 1) ? '关节1 IP 指间' : jointNames[i];
      row.innerHTML = '<label>' + nm + ' <span class=value id=' + f.key + '_a' + i + '-val>0.0°</span></label>'
        + '<input type=range id=' + f.key + '_a' + i + '-slider min=0 max=' + f.limits[i] + ' value=0 step=0.5>';
      blk.appendChild(row);
    }
    host.appendChild(blk);
  }
  const onSlide = function(key, i) {
    return function(e) {
      isPlaying = false;
      const pb = document.getElementById('btn-play'); if (pb) pb.textContent = '▶ 播放';
      FINGERS[key].pose[i] = parseFloat(e.target.value);
      updateMechanism(); updateSliderLabels();
    };
  };
  for (const f of HAND.fingers) for (let i = 0; i < f.n; i++)
    document.getElementById(f.key + '_a' + i + '-slider').addEventListener('input', onSlide(f.key, i));
  const speedSlider = document.getElementById('speed-slider');
  speedSlider.addEventListener('input', function(e) { animSpeed = parseFloat(e.target.value); updateSliderLabels(); });
  document.getElementById('btn-play').addEventListener('click', function() {
    isPlaying = !isPlaying;
    this.textContent = isPlaying ? '⏸ 暂停' : '▶ 播放';
  });
  const stopPlay = function(){ isPlaying = false; const pb = document.getElementById('btn-play'); if (pb) pb.textContent = '▶ 播放'; };
  document.getElementById('btn-reset').addEventListener('click', function() {
    stopPlay(); animU = 0;
    for (const k of HAND.keys) FINGERS[k].pose = fingerDef(k).limits.map(function(){ return 0; });
    updateMechanism(); updateSliderLabels();
  });
  const pOpen = function(){ const p = {}; for (const k of HAND.keys) p[k] = fingerDef(k).limits.map(function(){ return 0; }); return p; };
  const pScale = function(map, def) {
    const p = {};
    for (const k of HAND.keys) {
      const u = (map[k] === undefined ? (def === undefined ? 0 : def) : map[k]);
      p[k] = fingerDef(k).limits.map(function(l){ return l * u; });
    }
    return p;
  };
  const preset = function(fn) { return function(){ stopPlay(); animU = 0; setPose(fn()); }; };
  document.getElementById('btn-preset-open').addEventListener('click', preset(pOpen));
  document.getElementById('btn-preset-half').addEventListener('click', preset(function(){ return pScale({}, 0.5); }));
  document.getElementById('btn-preset-fist').addEventListener('click', preset(function(){ return pScale({}, 1.0); }));
  document.getElementById('btn-preset-pinch').addEventListener('click', preset(function(){ return pScale({index:0.55, thumb:0.6}, 0.12); }));
  document.getElementById('btn-preset-index').addEventListener('click', preset(function(){ return pScale({index:1.0}, 0.0); }));
  document.getElementById('btn-preset-thumb').addEventListener('click', preset(function(){ return pScale({thumb:1.0}, 0.0); }));
  document.getElementById('show-grid').addEventListener('change', function(e) {
    showGrid = e.target.checked;
    const g = scene.getObjectByName('grid');
    if (g) g.visible = showGrid;
  });
  document.getElementById('show-labels').addEventListener('change', function(e) { showLabels = e.target.checked; updateLabels(); });
  document.getElementById('show-trail').addEventListener('change', function(e) { showTrail = e.target.checked; updateTrail(); });
  document.getElementById('show-body').addEventListener('change', function(e) { showBody = e.target.checked; if (bodyOutline) bodyOutline.visible = showBody; });
  document.getElementById('btn-view-iso').addEventListener('click', function() { animateCamera(430, 120, 760); });
  document.getElementById('btn-view-front').addEventListener('click', function() { animateCamera(0, -60, 900); });
  document.getElementById('btn-view-side').addEventListener('click', function() { animateCamera(880, -40, 0.1); });
  document.getElementById('btn-view-top').addEventListener('click', function() { animateCamera(0, 820, 120); });
  updateSliderLabels();
}

function animateCamera(tx, ty, tz) {
  const start = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
  const end = { x: tx, y: ty, z: tz };
  const duration = 800, startTime = Date.now();
  function step() {
    const t = Math.min((Date.now() - startTime) / duration, 1);
    const ease = t * (2 - t);
    camera.position.x = start.x + (end.x - start.x) * ease;
    camera.position.y = start.y + (end.y - start.y) * ease;
    camera.position.z = start.z + (end.z - start.z) * ease;
    camera.lookAt(0, -150 * s, 0);
    if (t < 1) requestAnimationFrame(step);
  }
  step();
}

initScene();
buildMechanism();
updateMechanism();
setupUI();
animate();
