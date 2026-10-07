import {createModel} from './model-fixed-step.js';
let model,queue=Promise.resolve();
const recycled=[];
const controls=time=>({vacancyTime:time*1.7,fusionTime:time*1.7,grainTime:time,travel:1.6,whiteSize:1,fusionAmount:1});
self.onmessage=({data})=>{
  if(data.type==='recycle'){if(recycled.length<4)recycled.push(data.buffer);return;}
  queue=queue.then(()=>handle(data)).catch(error=>self.postMessage({type:'error',message:error.message}));
};
async function handle(data){
  if(data.type==='init'){
    const [packed,holes]=await Promise.all([
      fetch(new URL('./points.bin.gz',import.meta.url)).then(r=>{if(!r.ok)throw Error('Point asset unavailable');return r.blob();}),
      fetch(new URL('./holes.json',import.meta.url)).then(r=>{if(!r.ok)throw Error('Hole asset unavailable');return r.json();}),
    ]);
    const bytes=await new Response(packed.stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    const view=new DataView(bytes),points=[];let x=0,y=0;
    for(let k=0;k<view.byteLength;k+=5){x+=view.getInt16(k,true);y+=view.getInt16(k+2,true);points.push([x/64,y/64,view.getUint8(k+4)/400]);}
    model=await createModel(points,holes,null,{profile:'light'});
    const output=new Float32Array(model.count*3);await model.sample(0,output,controls(0));
    self.postMessage({type:'ready',count:model.count,backend:model.base?.fineBackend?.backendType,pressureBackend:model.base?.poissonBackendType,buffer:output.buffer},[output.buffer]);
  }else if(data.type==='sample'&&model){
    // Send exact solver frames; the main thread already interpolates them.
    // Fractional worker frames would otherwise interpolate the path twice
    // and skip its turns at fixed-step boundaries.
    const sampleTime=Math.floor((data.time+1e-9)/model.step)*model.step;
    const output=new Float32Array(data.buffer),started=performance.now();
    await model.sample(sampleTime,output,controls(sampleTime),(points,time)=>{
      let buffer=recycled.pop();if(!buffer||buffer.byteLength!==points.byteLength)buffer=new ArrayBuffer(points.byteLength);
      new Float32Array(buffer).set(points);
      self.postMessage({type:'frame',partial:true,time,buffer},[buffer]);
    });
    self.postMessage({type:'frame',time:sampleTime,sampleMs:performance.now()-started,buffer:output.buffer},[output.buffer]);
  }
}
