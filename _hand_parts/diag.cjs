const fs=require('fs'),path=require('path');
const G=require('/Users/xf/workspace/myArm/robot_arm/.verification/geom2d.cjs');const THREE=G.THREE;
const root='/Users/xf/workspace/myArm/robot_arm';
const html=fs.readFileSync(path.join(root,'hand_mechanism_3d.html'),'utf8');
const script=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes('const P ='))[1];
const nodes=new Map(),document={getElementById(id){if(!nodes.has(id))nodes.set(id,{});return nodes.get(id);}};
const main=script.slice(0,script.lastIndexOf('\ninitScene();'));
const api=new Function('THREE','document',main+'\nscene=new THREE.Scene();showLabels=false;buildMechanism();updateMechanism();return {scene,HAND};')(THREE,document);
const KEYS=api.HAND.keys;
const meshes=[];api.scene.traverse(o=>{if(o.isMesh)meshes.push(o);});
const CH=/^(palmPlateA|palmPlateB|wristBlock|wristBoss\d+|thumbBridge|thumbBridgeBoss\d+)$/;
function cls(m){const ch=[];for(let o=m;o;o=o.parent)ch.push(o.name);
 if(ch.some(n=>CH.test(n)))return 'CHASSIS';let k=null;for(const q of KEYS)if(ch.indexOf(q+'_root')>=0){k=q;break;}
 if(!k)return 'OTHER';const has=n=>ch.indexOf(n)>=0;
 for(let j=0;j<3;j++)if(has(k+'_m'+j+'Rod'))return k+'_m'+j+'Slider';
 for(let j=0;j<3;j++)if(has(k+'_t'+j+'Tendon'))return k+'_T'+j;
 for(let j=0;j<3;j++)if(has(k+'_m'+j+'Motor'))return k+'_m'+j+'Fixed';
 for(let j=1;j<=3;j++)if(has(k+'_phalanx'+j))return k+'_P'+j;
 if(has(k+'_palm'))return k+'_PALM';return 'OTHER';}
const bad=meshes.filter(m=>cls(m)==='OTHER');
for(const m of bad){const ch=[];for(let o=m;o;o=o.parent)ch.push(o.name);console.log('OTHER:',m.name,'| chain:',ch.join(' < '));}
const counts={};for(const m of meshes){const c=cls(m);counts[c]=(counts[c]||0)+1;}
console.log('classes:',Object.keys(counts).length);console.log('m0Motor group exists:',!!api.scene.getObjectByName('index_m0Motor'), !!api.scene.getObjectByName('index_m1Motor'));
