
const fs=require('fs'),path=require('path');
const dir=path.join(__dirname,'stl');
let files=fs.readdirSync(dir).filter(f=>f.endsWith('.stl'));
let bad=[];
for(const f of files){
  const b=fs.readFileSync(path.join(dir,f));
  const n=b.readUInt32LE(80);
  const expect=84+n*50;
  let degen=0, minz=1e9, maxz=-1e9;
  for(let i=0;i<n;i++){
    const o=84+i*50+12;
    const v=[0,1,2].map(k=>[b.readFloatLE(o+k*12),b.readFloatLE(o+k*12+4),b.readFloatLE(o+k*12+8)]);
    const area=Math.hypot((v[1][1]-v[0][1])*(v[2][2]-v[0][2])-(v[1][2]-v[0][2])*(v[2][1]-v[0][1]),(v[1][2]-v[0][2])*(v[2][0]-v[0][0])-(v[1][0]-v[0][0])*(v[2][2]-v[0][2]),(v[1][0]-v[0][0])*(v[2][1]-v[0][1])-(v[1][1]-v[0][1])*(v[2][0]-v[0][0]));
    if(area<1e-9) degen++;
    for(const p of v){minz=Math.min(minz,p[2]);maxz=Math.max(maxz,p[2]);}
  }
  const sized = b.length===expect;
  if(!sized||degen>0) bad.push({f,size_ok:sized,header_tris:n,file_len:b.length,expect,degenerate:degen});
  console.log(f.padEnd(26), 'tris', String(n).padStart(6), 'z', minz.toFixed(2),'..',maxz.toFixed(2), sized?'OK':'SIZE-MISMATCH', degen?('DEGEN '+degen):'');
}
console.log('\n问题文件:', bad.length);
