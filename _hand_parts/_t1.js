function updateLiveData() {
  const C = getJoints(currentPose());
  let out = "", tot = 0, maxF = 0;
  document.getElementById('live-data').innerHTML = out;
}
