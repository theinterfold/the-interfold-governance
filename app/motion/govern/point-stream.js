/** Decode exact packed triples incrementally, including split 5-byte records.
 * Zero-radius unused entries stay invisible until their real data arrives.
 * @param {Response} response
 * @param {{count: number, radiusScale: number}} meta
 * @param {(points: Float32Array, count: number) => void} [onBatch]
 */
export async function readPointStream(response,meta,onBatch=()=>{}){
  if(!response.ok)throw Error('Point asset unavailable');
  if(!Number.isInteger(meta.count)||meta.count<10000||meta.count>60000)throw Error('Unexpected point profile');
  if(!(meta.radiusScale>0&&Number.isFinite(meta.radiusScale)))throw Error('Invalid point scale');
  const reader=response.body.pipeThrough(new DecompressionStream('gzip')).getReader();
  const points=new Float32Array(meta.count*3);
  let carry=new Uint8Array(0),count=0,x=0,y=0;
  try{
    while(true){
      const {done,value}=await reader.read();if(done)break;
      const bytes=new Uint8Array(carry.length+value.length);bytes.set(carry);bytes.set(value,carry.length);
      const end=bytes.length-bytes.length%5,view=new DataView(bytes.buffer);
      for(let k=0;k<end;k+=5){
        if(count>=meta.count)throw Error('Excess point data');
        x+=view.getInt16(k,true);y+=view.getInt16(k+2,true);
        points[count*3]=x/64;points[count*3+1]=y/64;
        points[count*3+2]=view.getUint8(k+4)/400*meta.radiusScale;count++;
      }
      carry=bytes.slice(end);
      if(end)onBatch(points,count);
    }
    if(carry.length||count!==meta.count)throw Error('Incomplete point data');
    return points;
  }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
