// Keep exact shared-geometry queries small: each grid cell lists every compact
// circle support that intersects it. The shader still applies the original
// distance test and sums active circles in their original order.
export function packCursorGeometryCells(nearWall,shapes,holes,{x0,y0,h,nx,ny}){
  if(!Number.isInteger(holes)||holes<1||holes>64)throw new RangeError('Cursor support masks require 1–64 circles');
  const n=nx*ny;
  if(nearWall.length!==n||shapes.length!==holes*16)throw new RangeError('Cursor support mask dimensions do not match');
  const cells=new Uint32Array(n*5);
  cells.set(nearWall);
  for(let endpoint=0;endpoint<2;endpoint++)for(let i=0;i<holes;i++){
    const k=(endpoint*holes+i)*8;
    if(shapes[k+3]<=1e-9)continue;
    const x=shapes[k],y=shapes[k+1];
    // Inputs are already packed f32, as consumed by WGSL. This conservative
    // margin also covers its cell-coordinate rounding at a grid boundary.
    const radius=Math.sqrt(shapes[k+5])+.001;
    const left=Math.max(0,Math.floor((x-radius-x0)/h));
    const right=Math.min(nx-1,Math.floor((x+radius-x0)/h));
    const top=Math.max(0,Math.floor((y-radius-y0)/h));
    const bottom=Math.min(ny-1,Math.floor((y+radius-y0)/h));
    const plane=n*(1+endpoint*2+(i>>>5)),bit=1<<(i&31);
    for(let row=top;row<=bottom;row++)for(let col=left;col<=right;col++){
      const dx=Math.max(x0+col*h-x,0,x-(x0+(col+1)*h));
      const dy=Math.max(y0+row*h-y,0,y-(y0+(row+1)*h));
      if(dx*dx+dy*dy<=radius*radius)cells[plane+row*nx+col]|=bit;
    }
  }
  return cells;
}
