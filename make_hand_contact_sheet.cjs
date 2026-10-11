'use strict';
// 把 preview/ 下的多视角 PNG 拼成一张"整手效果图总览"（纯 JS 解码/编码，无外部依赖）。
// 用法: node make_hand_contact_sheet.cjs
const fs=require('fs'),path=require('path'),zlib=require('zlib');
const root=__dirname, pv=path.join(root,'preview');

// ---------- PNG 解码（8bit RGB/RGBA，无隔行）----------
function decodePNG(file){
  const buf=fs.readFileSync(file);
  let off=8, w=0,h=0,ct=0,bd=0,inter=0; const idat=[], plte=null, trns=null;
  while(off<buf.length){
    const len=buf.readUInt32BE(off), type=buf.toString('ascii',off+4,off+8);
    const data=buf.subarray(off+8,off+8+len);
    if(type==='IHDR'){ w=data.readUInt32BE(0); h=data.readUInt32BE(4); bd=data[8]; ct=data[9]; inter=data[12]; }
    else if(type==='IDAT') idat.push(data);
    else if(type==='PLTE') plte=data;
    else if(type==='tRNS') trns=data;
    else if(type==='IEND') break;
    off+=12+len;
  }
  if(bd!==8) throw new Error('仅支持 8bit: '+file);
  if(inter) throw new Error('不支持隔行: '+file);
  const ch=ct===2?3:ct===6?4:ct===0?1:ct===4?2:ct===3?1:0;
  if(!ch) throw new Error('不支持的颜色类型 '+ct+': '+file);
  const raw=zlib.inflateSync(Buffer.concat(idat));
  const stride=w*ch, out=Buffer.alloc(h*stride);
  let prev=Buffer.alloc(stride);
  for(let y=0;y<h;y++){
    const ft=raw[y*(stride+1)];
    const line=Buffer.from(raw.subarray(y*(stride+1)+1,y*(stride+1)+1+stride));
    for(let i=0;i<stride;i++){
      const a=i>=ch?line[i-ch]:0, b=prev[i], c=i>=ch?prev[i-ch]:0;
      let v=line[i];
      if(ft===1) v=(v+a)&255;
      else if(ft===2) v=(v+b)&255;
      else if(ft===3) v=(v+((a+b)>>1))&255;
      else if(ft===4){ const p=a+b-c, pa=Math.abs(p-a), pb=Math.abs(p-b), pc=Math.abs(p-c);
        v=(v+(pa<=pb&&pa<=pc?a:pb<=pc?b:c))&255; }
      line[i]=v;
    }
    line.copy(out,y*stride); prev=line;
  }
  // 统一成 RGB
  const rgb=Buffer.alloc(w*h*3);
  for(let i=0,j=0,k=0;i<w*h;i++,j+=ch,k+=3){
    if(ct===3){ const pi=out[i]*3; rgb[k]=plte[pi]; rgb[k+1]=plte[pi+1]; rgb[k+2]=plte[pi+2]; }
    else if(ch===1){ rgb[k]=rgb[k+1]=rgb[k+2]=out[i]; }
    else if(ch===2){ rgb[k]=rgb[k+1]=rgb[k+2]=out[i*2]; }
    else { rgb[k]=out[j]; rgb[k+1]=out[j+1]; rgb[k+2]=out[j+2]; }
  }
  return {w,h,rgb};
}
// ---------- PNG 编码 ----------
let crcT=null;
function crc32(b){if(!crcT){crcT=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;crcT[n]=c>>>0;}}let c=0xFFFFFFFF;for(const x of b)c=crcT[(c^x)&0xFF]^(c>>>8);return (c^0xFFFFFFFF)>>>0;}
function chunk(t,d){const l=Buffer.alloc(4);l.writeUInt32BE(d.length);const td=Buffer.concat([Buffer.from(t,'ascii'),d]);const c=Buffer.alloc(4);c.writeUInt32BE(crc32(td));return Buffer.concat([l,td,c]);}
function encodePNG(file,w,h,rgb){
  const raw=Buffer.alloc((w*3+1)*h);
  for(let y=0;y<h;y++){ raw[y*(w*3+1)]=0; rgb.copy(raw,y*(w*3+1)+1,y*w*3,(y+1)*w*3); }
  const ihdr=Buffer.alloc(13); ihdr.writeUInt32BE(w,0); ihdr.writeUInt32BE(h,4); ihdr[8]=8; ihdr[9]=2;
  fs.writeFileSync(file,Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),
    chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw,{level:6})),chunk('IEND',Buffer.alloc(0))]));
}

// ---------- 画布 ----------
class Canvas{
  constructor(w,h,r=0x14,g=0x16,b=0x22){ this.w=w; this.h=h; this.px=Buffer.alloc(w*h*3);
    for(let i=0;i<w*h;i++){ this.px[i*3]=r; this.px[i*3+1]=g; this.px[i*3+2]=b; } }
  blend(x,y,r,g,b,a){
    if(x<0||y<0||x>=this.w||y>=this.h||a<=0) return;
    const o=(y*this.w+x)*3, ia=1-a;
    this.px[o]=this.px[o]*ia+r*a; this.px[o+1]=this.px[o+1]*ia+g*a; this.px[o+2]=this.px[o+2]*ia+b*a;
  }
  // 把 src 缩放到 dw×dh 后贴到 (dx,dy)，带 1px 圆角遮罩
  drawFit(src,cx,cy,cw,ch){   // 等比缩放居中（防止竖幅被拉伸变形）
    const k=Math.min(cw/src.w, ch/src.h);
    const dw=Math.max(1,Math.floor(src.w*k)), dh=Math.max(1,Math.floor(src.h*k));
    this.drawScaled(src, cx+Math.floor((cw-dw)/2), cy+Math.floor((ch-dh)/2), dw, dh, 4);
  }
  drawScaled(src,dx,dy,dw,dh,radius=8){
    const sx=src.w/dw, sy=src.h/dh;
    for(let y=0;y<dh;y++){
      for(let x=0;x<dw;x++){
        // 圆角遮罩
        let a=1;
        const rx=Math.min(x, dw-1-x), ry=Math.min(y, dh-1-y);
        if(rx<radius&&ry<radius){ const d=Math.hypot(radius-rx,radius-ry); a=d<=radius?1:0; if(radius-rx>0&&d>radius) a=Math.max(0,1-(d-radius)); }
        if(a<=0) continue;
        const px=Math.min(src.w-1,Math.floor(x*sx)), py=Math.min(src.h-1,Math.floor(y*sy));
        const o=(py*src.w+px)*3;
        this.blend(dx+x,dy+y,src.rgb[o],src.rgb[o+1],src.rgb[o+2],a);
      }
    }
  }
  rect(x,y,w,h,r,g,b,a=1){
    for(let j=y;j<y+h;j++)for(let i=x;i<x+w;i++) this.blend(i,j,r,g,b,a);
  }
  // 5×7 点阵字体，够写标题与标注
  static FONT={
    '0':'011101000110001100011000101110','1':'001000110000100001000010001110',
    '2':'01110100010000100110010001000011111'.slice(0,35),'3':'11111000010000101110000010000111110'.slice(0,35),
    '4':'00010001100101010010111110001000010'.slice(0,35),'5':'111111000011110000010000111110'.slice(0,35),
    '6':'00110010001000011110100011000101110'.slice(0,35),'7':'11111000010001000100001000010000100'.slice(0,35),
    '8':'01110100011000101110100011000101110','9':'01110100011000101111000010001001100',
    'A':'01110100011000111111100011000110001','B':'11110100011000111110100011000111110',
    'C':'01110100011000010000100001000101110','D':'11110100011000110001100011000111110',
    'E':'11111100001000011110100001000011111','F':'11111100001000011110100001000010000',
    'G':'01110100011000010011100011000101111','H':'10001100011000111111100011000110001',
    'I':'11111001000010000100001000010011111','J':'00111000100001000010100101001001100',
    'K':'10001100101010011000101001001010001','L':'10000100001000010000100001000011111',
    'M':'10001110111010110101100011000110001','N':'10001110011010110011100011000110001',
    'O':'01110100011000110001100011000101110','P':'11110100011000111110100001000010000',
    'Q':'01110100011000110001101011001001101','R':'11110100011000111110101001001010001',
    'S':'01111100001000001110000010000111110','T':'11111001000010000100001000010000100',
    'U':'10001100011000110001100011000101110','V':'10001100011000110001100010101000100',
    'W':'10001100011000110101101011101110001','X':'10001100010101000100010101000110001',
    'Y':'10001100010101000100001000010000100','Z':'11111000010001000100010001000011111',
    '.':'00000000000000000000000000000000100',' ':'00000000000000000000000000000000000',
    '-':'00000000000000011111000000000000000','/':'00001000100001000100010001000010000',
    ':':'00000001000010000000001000010000000','=':'00000000001111100000111110000000000',
    '(':'00010001000100001000010000010000010',')':'01000001000001000010100010001000100',
    '+':'00000001000010011111001000010000000','%':'11001110010001000100010001001110011',
    '#':'01010010100111110101011111010100101','_':'00000000000000000000000000000111111'
  };
  text(x,y,str,scale=2,r=0xd8,g=0xdc,b=0xf0){
    let cx=x;
    for(const chr of str.toUpperCase()){
      const gl=Canvas.FONT[chr]||Canvas.FONT[' '];
      for(let j=0;j<7;j++)for(let i=0;i<5;i++){
        if(gl[j*5+i]==='1'){
          for(let sy=0;sy<scale;sy++)for(let sx=0;sx<scale;sx++) this.blend(cx+i*scale+sx,y+j*scale+sy,r,g,b,1);
        }
      }
      cx+=6*scale;
    }
    return cx;
  }
}

// ---------- 版面（整手 v9：五指 = 四指×3 关节 + 拇指×2 关节，共 14 个同构单元）----------
// 画面统一“指根在上、指尖在下”（与 render_hand_preview.cjs 的 +y 为上一致）。
const SHEET=[['hand_01_iso_open','伸直·等轴（五指 / 指距 70mm）'],
             ['hand_02_palm_face','指距视图（沿 +x：五指并列 70mm、指根法兰共面）'],
             ['hand_03_mechanism_plane','单指机构平面（沿 +z：电机—推杆—BD 连杆共面）'],
             ['hand_07_chassis','掌体骨架（板A/板B/拼接条/腕块/拇指桥）'],
             ['hand_04_iso_grip','抓握 u=0.6'],
             ['hand_05_fist_iso','满握 u=1.0（安全包络极值）'],
             ['hand_06_pinch','拇指对掌位 + 食指捏合'],
             ['hand_08_mcp_closeup','掌指关节 MCP 特写'],
             ['hand_09_tips','指尖抓握垫特写（满握）'],
             ['hand_10_wrist','腕接口 / 掌骨板 / 拇指桥特写']];

const COLS=4, CELL_W=460, CELL_H=440, GAP=16, PAD=26, TITLE_H=104, CAP_H=34;
const rows=Math.ceil(SHEET.length/COLS);
const W=PAD*2+COLS*CELL_W+(COLS-1)*GAP;
const H=TITLE_H+PAD+rows*(CELL_H+CAP_H)+(rows-1)*GAP+PAD;
const cv=new Canvas(W,H);

// 标题区
cv.rect(0,0,W,TITLE_H,0x1b,0x1e,0x33);
cv.rect(0,TITLE_H-3,W,3,0x5a,0x6c,0xff);
cv.text(PAD,22,'MYARM   FIVE-FINGER HAND   -   14 JOINT UNITS (4 FINGERS x 3 + THUMB x 2)   -   RENDER SHEET',3,0xe6,0xea,0xff);
cv.text(PAD,58,'EACH UNIT: 1 LINEAR ACTUATOR + 1 BD LINK ROD   -   ALL ROOTS BOLTED TO A 66x10 PALM PLATE',2,0x8e,0x9c,0xd8);
cv.text(PAD,80,'45584 POSES / 12012 PAIRS SCANNED   -   COLLISION 0   -   MIN GAP 1.000MM   -   CLOSURE 8.5e-14MM',2,0x6e,0x7c,0xb0);

let i=0;
for(let r=0;r<rows;r++){
  for(let c=0;c<COLS;c++){
    if(i>=SHEET.length) break;
    const [name,cap]=SHEET[i++];
    const x=PAD+c*(CELL_W+GAP), y=TITLE_H+PAD+r*(CELL_H+CAP_H+GAP);
    // 单元格底 + 边框
    cv.rect(x-2,y-2,CELL_W+4,CELL_H+4,0x3a,0x44,0x78);
    cv.rect(x,y,CELL_W,CELL_H,0x10,0x12,0x1c);
    const src=decodePNG(path.join(pv,name+'.png'));
    cv.drawFit(src,x,y,CELL_W,CELL_H);
    cv.text(x, y+CELL_H+9, cap, 2, 0xa8,0xb4,0xe8);
  }
}
const out=path.join(pv,'HAND_FINAL_RENDER_SHEET.png');
encodePNG(out,W,H,cv.px);
console.log('已生成',out,W+'x'+H,'('+(fs.statSync(out).size/1048576).toFixed(2)+' MB)');