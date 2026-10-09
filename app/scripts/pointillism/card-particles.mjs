// Adapted from the existing Pontilhismo/card-particles.js.
// Only addition: optional core detection, disabled for these continuous-tone illustrations.
// A reference is used only to seed independent points, never as a rendered or
// deforming image. All randomness is stable; no particles are replaced at runtime.
export const FIELD_WIDTH = 600;
export const FIELD_HEIGHT = 450;
export const clamp01 = n => Math.max(0, Math.min(1, n));
export function smoothstep(a, b, n) { const t = clamp01((n-a)/(b-a)); return t*t*(3-2*t); }
export function hash(x, y, seed = 0) {
  let n = Math.imul(x + 8191, 0x1f123bb5) ^ Math.imul(y + 131071, 0x5f356495) ^ Math.imul(seed + 524287, 0x6c8e9cf5);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
export function sample(field, x, y) {
  x = Math.max(0, Math.min(FIELD_WIDTH-1.001, x)); y = Math.max(0, Math.min(FIELD_HEIGHT-1.001, y));
  const xx = Math.floor(x), yy = Math.floor(y), tx=x-xx, ty=y-yy, i=yy*FIELD_WIDTH+xx;
  return (field[i]*(1-tx)+field[i+1]*tx)*(1-ty)+(field[i+FIELD_WIDTH]*(1-tx)+field[i+FIELD_WIDTH+1]*tx)*ty;
}
export function blurField(field) {
  let src = field, dst = new Float32Array(field.length);
  for (let pass=0;pass<3;pass++) {
    for(let y=0;y<FIELD_HEIGHT;y++) for(let x=0;x<FIELD_WIDTH;x++) {
      let sum=0, weight=0;
      for(let oy=-1;oy<=1;oy++) for(let ox=-1;ox<=1;ox++) {
        const xx=x+ox, yy=y+oy;
        if(xx<0||xx>=FIELD_WIDTH||yy<0||yy>=FIELD_HEIGHT) continue;
        const w=(ox===0?2:1)*(oy===0?2:1); sum+=src[yy*FIELD_WIDTH+xx]*w; weight+=w;
      }
      dst[y*FIELD_WIDTH+x]=sum/weight;
    }
    src=dst; dst=new Float32Array(field.length);
  }
  return src;
}
function findCores(field, seed) {
  const seen=new Uint8Array(field.length),cores=[];
  for(let i=0;i<field.length;i++) {
    if(seen[i]||field[i]<.54)continue;
    const queue=[i];seen[i]=1;let sx=0,sy=0;
    for(let j=0;j<queue.length;j++) {
      const at=queue[j],x=at%FIELD_WIDTH,y=Math.floor(at/FIELD_WIDTH);sx+=x;sy+=y;
      for(const next of [at-1,at+1,at-FIELD_WIDTH,at+FIELD_WIDTH]) {
        if(next<0||next>=field.length||seen[next]||field[next]<.54)continue;
        if(Math.abs(next%FIELD_WIDTH-x)>1)continue;
        seen[next]=1;queue.push(next);
      }
    }
    if(queue.length<5)continue;
    const x=sx/queue.length,y=sy/queue.length;
    // The market's centre is a cloud, whereas its six outer nodes are circles.
    if(seed===71&&Math.hypot(x-300,y-205)<65)continue;
    cores.push({x,y,size:2*Math.sqrt(queue.length/Math.PI)*1.02,ink:1,rank:.5,core:true});
  }
  return cores;
}
export function buildParticles(field, seed, { detectCores = true } = {}) {
  const cores=detectCores ? findCores(field,seed) : [];
  const candidates=[];
  for(let y=4;y<FIELD_HEIGHT-4;y+=2) for(let x=4;x<FIELD_WIDTH-4;x+=2) {
    const px=x+(hash(x,y,seed)-.5)*2, py=y+(hash(x,y,seed+1)-.5)*2;
    const ink=sample(field,px,py), rank=hash(x,y,seed+2);
    if(ink<.006||rank>Math.min(1,Math.pow(ink,.6)*2.4)) continue;
    const size=(.58+4.3*Math.pow(ink,.40))*(.92+hash(x,y,seed+3)*.16);
    // Keep the rim particles in contact with each solid node. Only discard
    // points buried well inside it, where they would never be visible.
    if(cores.some(core=>Math.hypot(px-core.x,py-core.y)+size*.5<core.size*.41))continue;
    candidates.push({x:px,y:py,size,ink,rank,priority:hash(x,y,seed+4)});
  }
  candidates.sort((a,b)=>a.priority-b.priority);
  const cell=8, columns=Math.ceil(FIELD_WIDTH/cell), buckets=new Map(), dots=[];
  for(const p of candidates) {
    const gx=Math.floor(p.x/cell),gy=Math.floor(p.y/cell);
    let clear=true;
    for(let y=gy-1;y<=gy+1&&clear;y++) for(let x=gx-1;x<=gx+1&&clear;x++) {
      for(const other of buckets.get(y*columns+x)||[]) {
        // Halos and fine links retain their spacing. Towards a bright centre,
        // the same family of dots packs together and can overlap into a mass.
        const solid=smoothstep(.055,.42,Math.min(p.ink,other.ink));
        const gap=(p.size+other.size)*.5*(1-solid*.48)+1.12*(1-solid);
        if((p.x-other.x)**2+(p.y-other.y)**2<gap*gap) {clear=false;break;}
      }
    }
    if(!clear) continue;
    const key=gy*columns+gx; if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(p);dots.push(p);
  }
  dots.push(...cores);
  const count=dots.length, home=new Float32Array(count*2), sizes=new Float32Array(count), ranks=new Float32Array(count), phases=new Float32Array(count), mobility=new Float32Array(count), directions=new Float32Array(count*2);
  dots.forEach((p,i)=>{
    home[i*2]=p.x;home[i*2+1]=p.y;sizes[i]=p.size;ranks[i]=p.rank;phases[i]=hash(i,seed,12)*Math.PI*2;
    // Cores travel with their neighbourhood; loose dots also float individually.
    mobility[i]=p.core?.03:.2+.8*(1-smoothstep(.12,.7,p.ink));
    const dx=sample(field,p.x+3,p.y)-sample(field,p.x-3,p.y),dy=sample(field,p.x,p.y+3)-sample(field,p.x,p.y-3);
    const length=Math.hypot(dx,dy);
    const angle=length>.002?Math.atan2(dx,-dy):phases[i];
    directions[i*2]=Math.cos(angle);directions[i*2+1]=Math.sin(angle);
  });
  return {count,coreCount:cores.length,driftPhase:hash(seed,17,8)*Math.PI*2,home,sizes,ranks,phases,mobility,directions,offsets:new Float32Array(count*2),velocities:new Float32Array(count*2)};
}
