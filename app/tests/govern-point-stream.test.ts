import {expect,test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {gunzipSync,gzipSync} from 'node:zlib';
import {readPointStream} from '../motion/govern/point-stream.js';
const root=new URL('../public/govern-compact/',import.meta.url);
const packed=readFileSync(new URL('points.bin.gz',root));
const meta=JSON.parse(readFileSync(new URL('geometry.json',root),'utf8'));
function response(bytes:Uint8Array,chunkSize=113){
 let offset=0;
 return new Response(new ReadableStream({pull(controller){
  if(offset===bytes.length){controller.close();return;}
  const next=Math.min(bytes.length,offset+chunkSize);controller.enqueue(bytes.slice(offset,next));offset=next;
 }}));
}
test('streamed point decoding preserves every exact Float32 triple across split records',async()=>{
 const raw=gunzipSync(packed),expected=new Float32Array(meta.count*3);let x=0,y=0;
 for(let k=0;k<raw.length;k+=5){x+=raw.readInt16LE(k);y+=raw.readInt16LE(k+2);expected[k/5*3]=x/64;expected[k/5*3+1]=y/64;expected[k/5*3+2]=raw[k+4]/400*meta.radiusScale;}
 let previous=0,batches=0;
 const decoded=await readPointStream(response(packed),meta,(points:Float32Array,count:number)=>{
  expect(count).toBeGreaterThan(previous);expect(count).toBeLessThanOrEqual(meta.count);
  expect(points.subarray(previous*3,count*3)).toEqual(expected.subarray(previous*3,count*3));
  if(count<meta.count)expect(points[count*3+2]).toBe(0);
  previous=count;batches++;
 });
 expect(batches).toBeGreaterThan(1);expect(decoded).toEqual(expected);
});
test('truncated and oversized point streams fail instead of starting an incomplete solver',async()=>{
 const raw=gunzipSync(packed);
 await expect(readPointStream(response(gzipSync(raw.subarray(0,raw.length-3))),meta)).rejects.toThrow('Incomplete point data');
 await expect(readPointStream(response(packed),{...meta,count:meta.count-1})).rejects.toThrow('Excess point data');
});
