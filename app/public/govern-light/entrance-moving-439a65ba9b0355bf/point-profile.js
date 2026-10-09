/** Deterministic source selection used once when a model is created. */
export const POINT_PROFILES=Object.freeze({original:120906,balanced:80000,light:60000});
const CELL=9,cache=new WeakMap();

function morton(x,y){
  let a=Math.max(0,Math.min(255,Math.floor(x/CELL*256))),b=Math.max(0,Math.min(255,Math.floor(y/CELL*256))),code=0;
  for(let bit=0;bit<8;bit++){code|=((a>>>bit)&1)<<(bit*2);code|=((b>>>bit)&1)<<(bit*2+1);}
  return code>>>0;
}
function cellHash(k){let h=k|0;h=Math.imul(h^h>>>16,0x7feb352d);h=Math.imul(h^h>>>15,0x846ca68b);return(h^h>>>16)>>>0;}
function profileCount(profile,sourceCount){
  const requested=typeof profile==='string'?POINT_PROFILES[profile]:profile;
  if(!Number.isSafeInteger(requested)||requested<1)throw new RangeError(`Unknown point profile: ${profile}`);
  return Math.min(sourceCount,requested);
}
export function selectPointProfile(source,profile='original'){
  if(!Array.isArray(source))throw new TypeError('source points must be an array');
  const target=profileCount(profile,source.length);let byCount=cache.get(source);
  if(!byCount){byCount=new Map();cache.set(source,byCount);}
  const cached=byCount.get(target);if(cached)return cached;
  if(target===source.length){
    const copy=source.map(point=>Object.freeze([point[0],point[1],point[2]]));
    const result=Object.freeze({name:target===POINT_PROFILES.original?'original':'custom',count:target,radiusScale:1,sourceMass:massOf(source),selectedMass:massOf(source),points:Object.freeze(copy)});
    byCount.set(target,result);return result;
  }
  let minX=Infinity,minY=Infinity,sourceMass=0;
  for(const point of source){minX=Math.min(minX,point[0]);minY=Math.min(minY,point[1]);sourceMass+=point[2]*point[2];}
  const ratio=target/source.length,groups=new Map();
  for(let index=0;index<source.length;index++){
    const point=source[index],cx=Math.floor((point[0]-minX)/CELL),cy=Math.floor((point[1]-minY)/CELL),key=`${cx},${cy}`;
    let group=groups.get(key);if(!group){group={cx,cy,points:[]};groups.set(key,group);}
    group.points.push({point,index,key:morton(point[0]-minX-cx*CELL,point[1]-minY-cy*CELL)});
  }
  const cells=[...groups.values()];let assigned=0;
  for(const cell of cells){const quota=ratio*cell.points.length;cell.take=Math.floor(quota);cell.remainder=quota-cell.take;assigned+=cell.take;}
  cells.sort((a,b)=>b.remainder-a.remainder||cellHash(a.cy*65537+a.cx)-cellHash(b.cy*65537+b.cx));
  for(let i=0;i<target-assigned;i++)cells[i].take++;
  const selected=[];
  for(const cell of cells){
    if(!cell.take)continue;
    cell.points.sort((a,b)=>a.key-b.key||a.index-b.index);
    for(let j=0;j<cell.take;j++)selected.push(cell.points[Math.floor((j+.5)*cell.points.length/cell.take)]);
  }
  if(selected.length!==target)throw new Error(`point profile count mismatch: wanted ${target}, got ${selected.length}`);
  let selectedMass=0;for(const entry of selected)selectedMass+=entry.point[2]*entry.point[2];
  const radiusScale=Math.sqrt(sourceMass/selectedMass),points=selected.map(({point})=>Object.freeze([point[0],point[1],Math.fround(point[2]*radiusScale)]));
  const result=Object.freeze({name:target===POINT_PROFILES.balanced?'balanced':target===POINT_PROFILES.light?'light':'custom',count:target,radiusScale,sourceMass,selectedMass,points:Object.freeze(points)});
  byCount.set(target,result);return result;
}
function massOf(points){let mass=0;for(const point of points)mass+=point[2]*point[2];return mass;}
