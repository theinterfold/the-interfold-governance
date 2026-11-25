import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {gunzipSync,gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {thinInterior} from '../motion/govern/point-selection.js';
import {particleHull} from '../motion/govern/cursor-interaction.js';
import {selectPointProfile} from '../public/govern-light/entrance-moving-439a65ba9b0355bf/point-profile.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2),value=name=>args.find(arg=>arg.startsWith(`--${name}=`))?.slice(name.length+3);
for(const arg of args)if(!/^--(?:point-fraction|out)=/.test(arg))throw Error(`Unknown build option: ${arg}`);
const pointFraction=Number(value('point-fraction')??.8);
if(!Number.isFinite(pointFraction)||pointFraction<=0||pointFraction>1)throw Error('Point fraction must be greater than zero and at most one');
const source=resolve(root,'public/govern-light/entrance-moving-439a65ba9b0355bf'),out=resolve(value('out')??resolve(root,'public/govern-compact'));
await mkdir(out,{recursive:true});
const bytes=gunzipSync(await readFile(resolve(source,'points.bin.gz'))),points=[];let x=0,y=0;
for(let k=0;k<bytes.length;k+=5){x+=bytes.readInt16LE(k);y+=bytes.readInt16LE(k+2);points.push([x/64,y/64,bytes[k+4]/400]);}
const holes=JSON.parse(await readFile(resolve(source,'holes.json'),'utf8'));
const baseline=selectPointProfile(points,'light'),selected=thinInterior(baseline.points,holes,pointFraction);
const profile={...baseline,points:selected,count:selected.length},packed=Buffer.alloc(profile.count*5);x=0;y=0;
profile.points.forEach((p,i)=>{
 const nx=Math.round(p[0]*64),ny=Math.round(p[1]*64),dx=nx-x,dy=ny-y;
 if(dx< -32768||dx>32767||dy< -32768||dy>32767)throw Error('Point delta overflow');
 const radius=Math.round(p[2]/profile.radiusScale*400);
 if(Math.fround(radius/400*profile.radiusScale)!==p[2])throw Error('Point radius mismatch');
 packed.writeInt16LE(dx,i*5);packed.writeInt16LE(dy,i*5+2);packed[i*5+4]=radius;x=nx;y=ny;
});
await writeFile(resolve(out,'points.bin.gz'),gzipSync(packed,{level:9}));
await writeFile(resolve(out,'geometry.json'),JSON.stringify({count:profile.count,radiusScale:profile.radiusScale,holes,cursorHull:particleHull(profile.points)}));
// Bundle the solver and the two tiny kernels into its worker. Their original
// modules stay untouched and remain usable by the Node physics audits.
const inlineKernels={name:'inline-pressure-kernels',setup(bundler){
 bundler.onLoad({filter:/create-(poisson|moving-wall-pcg)-wasm\.js$/},async({path})=>{
  let contents=await readFile(path,'utf8');
  const name=path.endsWith('create-poisson-wasm.js')?'full-cg.wasm':'pcg-ic0-flat.wasm';
  const needle=`new URL('./${name}',import.meta.url)`;
  if(!contents.includes(needle))throw Error('Pressure kernel URL changed');
  const encoded=(await readFile(resolve(source,name))).toString('base64');
  contents=contents.replace(needle,`new URL('data:application/wasm;base64,${encoded}')`);
  return{contents,loader:'js',resolveDir:dirname(path)};
 });
}};
await build({entryPoints:{boot:resolve(root,'motion/govern/boot.js'),worker:resolve(root,'motion/govern/worker.js'),renderer:resolve(root,'motion/govern/renderer.js')},outdir:out,bundle:true,minify:true,format:'esm',platform:'browser',target:'es2022',external:['node:fs/promises'],plugins:[inlineKernels],legalComments:'none'});
const files={};for(const name of ['boot.js','points.bin.gz','geometry.json','worker.js','renderer.js'])files[name]=(await stat(resolve(out,name))).size;
const digest=createHash('sha256');
for(const name of ['boot.js','worker.js','renderer.js'])digest.update(await readFile(resolve(out,name)));
if(pointFraction!==1)digest.update(`point-fraction:${pointFraction}`);
const version=digest.digest('hex').slice(0,16);
await writeFile(resolve(out,'manifest.json'),JSON.stringify({version,count:profile.count,...(pointFraction!==1?{pointFraction}:{}),files,totalBytes:Object.values(files).reduce((a,b)=>a+b,0)},null,2)+'\n');
console.log(JSON.stringify(files));
