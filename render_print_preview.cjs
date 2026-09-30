'use strict';
// 从HTML实际网格离屏渲染PNG（正交投影+Z缓冲+简单光照），用于目视核对3D打印细节。
const fs=require('fs'),path=require('path'),zlib=require('zlib');
const THREE=require('./.verification/three-r128.cjs');
const root=__dirname,html=fs.readFileSync(path.join(root,'arm_mechanism_3d.html'),'utf8');
const script=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes('const P ='))[1];
const nodes=new Map(),document={getElementById(id){if(!nodes.has(id))nodes.set(id,{});return nodes.get(id);}};
const main=script.slice(0,script.lastIndexOf('\ninitScene();'));
const api=new Function('THREE','document',main+'\nscene=new THREE.Scene();showLabels=false;buildMechanism();updateMechanism(0);return {P,s,scene,updateMechanism};')(THREE,document);
const {P,s,scene}=api;
api.scene.getObjectByName('bodyOutline').visible=false;
const grid=scene.getObjectByName('grid'); if(grid) grid.visible=false;

// ---- PNG 编码 ----
let crcT=null;
function crc32(buf){if(!crcT){crcT=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;crcT[n]=c>>>0;}}let c=0xFFFFFFFF;for(const b of buf)c=crcT[(c^b)&0xFF]^(c>>>8);return (c^0xFFFFFFFF)>>>0;}
function chunk(type,data){const len=Buffer.alloc(4);len.writeUInt32BE(data.length);const td=Buffer.concat([Buffer.from(type,'ascii'),data]);const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(td));return Buffer.concat([len,td,crc]);}
function writePNG(file,w,h,rgb){const raw=Buffer.alloc((w*3+1)*h);for(let y=0;y<h;y++){raw[y*(w*3+1)]=0;rgb.copy(raw,y*(w*3+1)+1,y*w*3,(y+1)*w*3);}const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=2;fs.writeFileSync(file,Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))]));}

// ---- 正交渲染 ----
function render(file,W,H,eyeDir,centerMm,halfHeightMm){
  const rgb=Buffer.alloc(W*H*3);for(let i=0;i<W*H;i++){rgb[i*3]=0x1a;rgb[i*3+1]=0x1a;rgb[i*3+2]=0x2e;}
  const zb=new Float32Array(W*H).fill(-Infinity);
  // 相机基（模型单位）
  const fwd=new THREE.Vector3(...eyeDir).normalize();
  const up=new THREE.Vector3(0,0,1);
  if(Math.abs(fwd.dot(up))>0.95) up.set(0,1,0);
  const right=new THREE.Vector3().crossVectors(up,fwd).normalize();
  const camUp=new THREE.Vector3().crossVectors(fwd,right).normalize();
  const cen=new THREE.Vector3(centerMm[0]*s,centerMm[1]*s,centerMm[2]*s);
  const halfH=halfHeightMm*s, scale=(H/2)/halfH;
  const light=new THREE.Vector3(0.4,0.5,0.85).normalize();
  const L=[];scene.updateMatrixWorld(true);
  scene.traverse(o=>{if(o.isMesh&&o.visible&&o.material&&o.material.color)L.push(o);});
  for(const mesh of L){
    const col=mesh.material.color, g=mesh.geometry, pos=g.attributes.position, idx=g.index;
    const mw=mesh.matrixWorld, nm=new THREE.Matrix3().getNormalMatrix(mw);
    const n=idx?idx.count:pos.count;
    const V=[];
    for(let i=0;i<pos.count;i++){const v=new THREE.Vector3().fromBufferAttribute(pos,i).applyMatrix4(mw);V.push(v);}
    for(let t=0;t<n;t+=3){
      const i0=idx?idx.getX(t):t, i1=idx?idx.getX(t+1):t+1, i2=idx?idx.getX(t+2):t+2;
      const a=V[i0],b=V[i1],c=V[i2];
      const nrm=new THREE.Vector3().subVectors(b,a).cross(new THREE.Vector3().subVectors(c,a));
      if(nrm.length()<1e-12) continue;
      nrm.normalize();
      const P3=[a,b,c].map(v=>{const d=new THREE.Vector3().subVectors(v,cen);return {x:d.dot(right)*scale+W/2, y:-(d.dot(camUp))*scale+H/2, z:d.dot(fwd)};});
      const lam=0.35+0.65*Math.abs(nrm.dot(light));
      const r=Math.min(255,col.r*255*lam+18),gg=Math.min(255,col.g*255*lam+18),bb=Math.min(255,col.b*255*lam+18);
      const minx=Math.max(0,Math.floor(Math.min(P3[0].x,P3[1].x,P3[2].x))),maxx=Math.min(W-1,Math.ceil(Math.max(P3[0].x,P3[1].x,P3[2].x)));
      const miny=Math.max(0,Math.floor(Math.min(P3[0].y,P3[1].y,P3[2].y))),maxy=Math.min(H-1,Math.ceil(Math.max(P3[0].y,P3[1].y,P3[2].y)));
      const [p0,p1,p2]=P3, area=(p1.x-p0.x)*(p2.y-p0.y)-(p2.x-p0.x)*(p1.y-p0.y);
      if(Math.abs(area)<1e-9) continue;
      for(let y=miny;y<=maxy;y++)for(let x=minx;x<=maxx;x++){
        const px=x+0.5, py=y+0.5;
        const w0=((p1.x-p0.x)*(py-p0.y)-(px-p0.x)*(p1.y-p0.y))/area;
        const w1=((px-p0.x)*(p2.y-p0.y)-(p2.x-p0.x)*(py-p0.y))/area;
        const w2=1-w0-w1;
        if(w0<-1e-6||w1<-1e-6||w2<-1e-6) continue;
        const z=w2*p0.z+w1*p1.z+w0*p2.z;
        const o=y*W+x; if(z>zb[o]){zb[o]=z;rgb[o*3]=r;rgb[o*3+1]=gg;rgb[o*3+2]=bb;}
      }
    }
  }
  writePNG(file,W,H,rgb);
  console.log('wrote',file,W+'x'+H);
}
const out=path.join(root,'preview');
fs.mkdirSync(out,{recursive:true});
api.updateMechanism(60);
// 沿Z看：所有销孔轴线正对观察者，直接看孔径/倒角/衬套
render(path.join(out,'print_joints_alongZ.png'),900,1200,[0,0,-1],[-8,70,0],180);
// 等轴：看叉耳厚度、连杆、抱箍
render(path.join(out,'print_assembly_iso.png'),1100,1000,[0.75,-0.42,0.51],[20,60,0],200);
// 肘部特写
render(path.join(out,'print_elbow_closeup.png'),900,900,[0.55,-0.35,0.75],[6,4,0],55);
// B/D关节特写
render(path.join(out,'print_linkB_closeup.png'),900,900,[0.5,-0.3,0.81],[28,70,0],40);
