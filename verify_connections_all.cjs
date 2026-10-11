'use strict';
// 三目标连接物理性审计汇总：arm / finger / hand（hand 内部再逐指跑五条链）
const {spawnSync}=require('child_process');const path=require('path');
let fail=0;
for(const tg of ['arm','finger','hand']){
  const r=spawnSync(process.execPath,[path.join(__dirname,'verify_connections.cjs'),tg],{cwd:__dirname,encoding:'utf8',maxBuffer:1<<28,timeout:20*60*1000});
  const out=(r.stdout||'')+(r.stderr||'');
  const m=out.match(/==== 结论：([^=]+)====/)||out.match(/==== 整手连接物理性：([^=]+)====/);
  console.log((r.status===0?'  PASS  ':'  FAIL  ')+tg.padEnd(8)+(m?m[1].trim():('exit '+r.status)));
  if(r.status!==0){fail++;console.log(out.split('\n').filter(l=>l.indexOf(' - ')===0).join('\n'));}
}
console.log(fail?('连接物理性：'+fail+' 个目标不成立 ✗'):'连接物理性：arm / finger / hand(五指) 全部成立 ✓');
process.exit(fail?1:0);
