'use strict';
// 一键全量校验：肘关节机构(v5) + 三节手指机构，顺序执行全部校验器并输出总表。
// 用法: node verify_all.cjs [--quick]
//   --quick: 肘版碰撞扫描用 0.5° 步进（快速自查）；默认 0.05° 完整校验（数分钟）。
const {spawnSync}=require('child_process');
const path=require('path');const root=__dirname;
const quick=process.argv.includes('--quick');
const jobs=[
  {name:'肘·运动学与全行程碰撞',file:'verify_near_joint.cjs',
   args:quick?['--step=0.5','--no-write']:['--step=0.05'],
   // 完整模式看退出码；quick 模式步长余量大，改为只看"碰撞=0"
   okOverride:quick?(out=>{
     // quick 模式：断言可能因步长余量失败，这里只认"碰撞列空"
     return /"collisions":\s*\[\s*\]/.test(out);
   }):null,
   extract:out=>{
    const col=/"collisions":\s*\[\s*\]/.test(out)?'碰撞 0':(out.match(/"collisions":\s*\[([^\]]*)/)?'有碰撞':'');
    const lb=out.match(/"continuous_lower_bound_mm":\s*(-?[\d.]+)/);
    const ms=out.match(/"physical_meshes":\s*(\d+)/), tp=out.match(/"tested_pairs":\s*(\d+)/);
    const lbTxt=lb?(quick?('下限 '+lb[1]+'mm（quick步长余量大，仅供参考；请跑完整模式）'):('下限 '+lb[1]+'mm')):'';
    return [col,ms?('网格 '+ms[1]):'',tp?('配对 '+tp[1]):'',lbTxt].filter(Boolean).join(' / ');
  }},
  {name:'肘·可拆装性',file:'verify_serviceability.cjs',extract:out=>(out.match(/通过 (\d+\/\d+)/)||[])[1]||''},
  {name:'肘·3D打印适配性',file:'verify_print_geometry.cjs',extract:out=>(out.match(/通过 (\d+\/\d+)/)||[])[1]||''},
  {name:'肘·STL完整性',file:'check_stl.cjs',extract:out=>(out.match(/问题文件:\s*(\d+)/)||[])[0]||''},
  {name:'手指·双单元碰撞与闭合',file:'verify_finger.cjs',extract:out=>{
    const c=out.match(/"collision_count":\s*(\d+)/),lb=out.match(/"continuous_lower_bound_mm":\s*(-?[\d.]+)/),cl=out.match(/"closure":\s*([\d.eE+-]+)/);
    return (c?('碰撞 '+c[1]):'')+(lb?(' / 下限 '+lb[1]+'mm'):'')+(cl?(' / 闭合 '+Number(cl[1]).toExponential(1)):'');
  }},
  {name:'手指·打印与拆装',file:'verify_finger_print.cjs',extract:out=>(out.match(/通过 (\d+\/\d+)/)||[])[1]||''},
];
const rows=[];let allOk=true;
for(const j of jobs){
  let ok=true,info='',err='';
  const r=spawnSync('node',[path.join(root,j.file),...(j.args||[])],{cwd:root,encoding:'utf8',maxBuffer:1<<28,timeout:30*60*1000});
  const out=(r.stdout||'')+(r.stderr||'');
  info=j.extract?j.extract(r.stdout||''):'';
  if(j.okOverride){ ok=j.okOverride(out); }
  else {
    ok = r.status===0;
    const m=info.match(/(\d+)\/(\d+)/);
    if(m&&m[1]!==m[2])ok=false;
  }
  if(!ok){
    const m=String(out).match(/AssertionError[^\n]*/);
    err=m?m[0].slice(0,60):('exit '+(r.status===null?'timeout':r.status));
  }
  if(!ok)allOk=false;
  rows.push({name:j.name,pass:ok,info,err});
}
const w=Math.max(...rows.map(r=>r.name.length));
console.log('=== 全量校验总表 ===');
for(const r of rows)console.log((r.pass?'  PASS  ':'  FAIL  ')+r.name.padEnd(w)+'  '+r.info+(r.err?('  ['+r.err+']'):''));
console.log('\n'+(allOk?'全部通过 ✓':(rows.filter(r=>!r.pass).length+' 项失败 ✗')));
process.exitCode=allOk?0:1;
