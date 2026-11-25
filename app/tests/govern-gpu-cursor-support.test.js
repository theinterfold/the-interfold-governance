import {expect,test} from 'bun:test';
import {packCursorGeometryCells} from '../motion/govern/gpu-cursor-support.js';

const grid={x0:-40,y0:-40,h:4,nx:32,ny:26};
function fixture(holes=33){
  const shapes=new Float32Array(holes*16);
  for(let endpoint=0;endpoint<2;endpoint++)for(let i=0;i<holes;i++){
    const x=i>=31?23:((i*17)%91)-34,y=i>=31?9:((i*23)%79)-31;
    const effective=2+(i%4),reach=6+(i%5);
    shapes.set([x+endpoint*2.25,y-endpoint*.75,effective,reach,.18,(effective+reach+1e-5)**2,0,0],(endpoint*holes+i)*8);
  }
  return shapes;
}
function candidates(cells,x,y,endpoint,holes){
  // Match the shader's f32 cell assignment, including points just either side
  // of a boundary. Off-grid queries must retain the complete original scan.
  const col=Math.floor(Math.fround(Math.fround(Math.fround(x)-grid.x0)/grid.h));
  const row=Math.floor(Math.fround(Math.fround(Math.fround(y)-grid.y0)/grid.h));
  if(col<0||row<0||col>=grid.nx||row>=grid.ny)return Array.from({length:holes},(_,i)=>i);
  const n=grid.nx*grid.ny,k=row*grid.nx+col,ids=[];
  for(let i=0;i<holes;i++)if(cells[n*(1+endpoint*2+(i>>>5))+k]&(1<<(i&31)))ids.push(i);
  return ids;
}
function field(shapes,holes,x,y,endpoint,ids){
  let weight=0,gx=0,gy=0;
  for(const i of ids){
    const k=(endpoint*holes+i)*8,dx=Math.fround(x)-shapes[k],dy=Math.fround(y)-shapes[k+1],radius2=dx*dx+dy*dy;
    if(shapes[k+3]<=1e-9||radius2>=shapes[k+5])continue;
    const radius=Math.max(Math.sqrt(radius2),1e-9),distance=radius-shapes[k+2],reach=shapes[k+3];
    if(distance>=reach)continue;
    let gate=1,derivative=0;
    if(distance>0){const u=distance/reach;gate=1-10*u**3+15*u**4-6*u**5;derivative=(-30*u*u+60*u**3-30*u**4)/reach;}
    const exponential=Math.exp(-distance*shapes[k+4]),gradient=exponential*(derivative-gate*shapes[k+4])/radius;
    weight+=exponential*gate;gx+=gradient*dx;gy+=gradient*dy;
  }
  return [weight-1,gx,gy];
}

test('support masks preserve the full shared field at cell and compact-support boundaries',()=>{
  const holes=33,shapes=fixture(holes),near=new Uint8Array(grid.nx*grid.ny),saved=shapes.slice();
  near[5]=1;near[27]=1;
  const cells=packCursorGeometryCells(near,shapes,holes,grid),all=Array.from({length:holes},(_,i)=>i),queries=[];
  for(let row=0;row<=grid.ny;row++)for(let col=0;col<=grid.nx;col++)for(const epsilon of [-1e-5,1e-5])queries.push([grid.x0+col*grid.h+epsilon,grid.y0+row*grid.h-epsilon]);
  for(let endpoint=0;endpoint<2;endpoint++)for(let i=0;i<holes;i++){
    const k=(endpoint*holes+i)*8,r=Math.sqrt(shapes[k+5]);
    for(let a=0;a<16;a++)for(const epsilon of [-.0001,.0001])queries.push([shapes[k]+Math.cos(a*Math.PI/8)*(r+epsilon),shapes[k+1]+Math.sin(a*Math.PI/8)*(r+epsilon)]);
  }
  let mismatches=0;
  for(const [x,y] of queries)for(let endpoint=0;endpoint<2;endpoint++){
    const full=field(shapes,holes,x,y,endpoint,all),masked=field(shapes,holes,x,y,endpoint,candidates(cells,x,y,endpoint,holes));
    if(full.some((v,i)=>v!==masked[i]))mismatches++;
  }
  expect(mismatches).toBe(0);expect(shapes).toEqual(saved);expect(cells.slice(0,near.length)).toEqual(Uint32Array.from(near));
});

test('mask words retain circles 31 and 32 in order and keep endpoint coverage separate',()=>{
  const holes=33,shapes=fixture(holes),near=new Uint8Array(grid.nx*grid.ny),cells=packCursorGeometryCells(near,shapes,holes,grid);
  const ids=candidates(cells,23,9,0,holes);
  expect(ids).toContain(31);expect(ids).toContain(32);expect(ids).toEqual(ids.slice().sort((a,b)=>a-b));
  expect(candidates(cells,80,60,0,holes).length).toBeLessThan(holes);
  expect(candidates(cells,-100,-100,0,holes)).toHaveLength(holes);
  const n=near.length;expect(cells.slice(n,3*n)).not.toEqual(cells.slice(3*n,5*n));
  expect(()=>packCursorGeometryCells(near,new Float32Array(65*16),65,grid)).toThrow();
});

test('inactive and tiny offscreen circles neither mask valid supports nor expand the field',()=>{
  const holes=33,shapes=fixture(holes),near=new Uint8Array(grid.nx*grid.ny),all=Array.from({length:holes},(_,i)=>i);
  for(let endpoint=0;endpoint<2;endpoint++){
    shapes.set([0,0,20,0,1,400,0,0],(endpoint*holes+31)*8);
    shapes.set([-40.0002,-40.0002,.001,.0015,1000,.00251**2,0,0],(endpoint*holes+32)*8);
  }
  const cells=packCursorGeometryCells(near,shapes,holes,grid);
  expect(candidates(cells,0,0,0,holes)).not.toContain(31);
  expect(candidates(cells,-40,-40,0,holes)).toContain(32);
  for(const [x,y] of [[-40.0002,-40.0002],[-40,-40],[-39.998,-40],[0,0]])for(let endpoint=0;endpoint<2;endpoint++){
    expect(field(shapes,holes,x,y,endpoint,candidates(cells,x,y,endpoint,holes))).toEqual(field(shapes,holes,x,y,endpoint,all));
  }
});
