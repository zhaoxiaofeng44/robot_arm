const fs=require('fs'),path=require('path'),zlib=require('zlib');
const dir=path.join(__dirname,'..','preview');
for(const f of fs.readdirSync(dir).filter(x=>/^hand_.*\.png$/.test(x)).sort()){
  const b=fs.readFileSync(path.join(dir,f));
  let off=8,w=0,h=0,idat=[];
  while(off<b.length){const len=b.readUInt32BE(off);const type=b.toString('ascii',off+4,off+8);
    const data=b.slice(off+8,off+8+len);
    if(type==='IHDR'){w=data.readUInt32BE(0);h=data.readUInt32BE(4);}
    if(type==='IDAT')idat.push(data);
    off+=12+len; if(type==='IEND')break;}
  const raw=zlib.inflateSync(Buffer.concat(idat));
  const stride=w*3+1; let nonbg=0,tot=0;
  for(let y=0;y<h;y++){const base=y*stride+1;
    for(let x=0;x<w;x++){const o=base+x*3;tot++;
      if(!(raw[o]===0x1a&&raw[o+1]===0x1a&&raw[o+2]===0x2e))nonbg++;}}
  console.log(f.padEnd(28), w+'x'+h, 'model pixels', (100*nonbg/tot).toFixed(1)+'%');
}
