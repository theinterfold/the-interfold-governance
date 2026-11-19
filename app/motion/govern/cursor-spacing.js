// Symmetric short-range pressure restores spacing after a cursor sweep.
// All IDs and radii retained. No random offsets or geometry rendering changes.
export function createLocalRelaxation(count, grid, reference){
 const ids=new Int32Array(count),next=new Int32Array(count),radii=new Float32Array(count),weight=new Float32Array(count),
  dx=new Float32Array(count),dy=new Float32Array(count);let head=new Int32Array(0);
 function density(x,y){
  const gx=Math.max(0,Math.min(grid.nx-1.001,(x-grid.x0)/grid.h)),gy=Math.max(0,Math.min(grid.ny-1.001,(y-grid.y0)/grid.h));
  const ix=gx|0,iy=gy|0,u=gx-ix,v=gy-iy,k=iy*grid.nx+ix;
  return ((reference[k]*(1-u)+reference[k+1]*u)*(1-v)+(reference[k+grid.nx]*(1-u)+reference[k+grid.nx+1]*u)*v)/(grid.h*grid.h);
 }
 function apply(points, move, roi, weightAt, {passes=6, gain=1, cap=.45, radiusScale=.45,maxRadius=.6}={}){
  const start=performance.now(),cell=maxRadius*2,cols=Math.ceil((roi.x1-roi.x0)/cell)+2,rows=Math.ceil((roi.y1-roi.y0)/cell)+2;
  if(head.length<cols*rows)head=new Int32Array(cols*rows);
  let totalPairs=0,totalMoves=0,maxMove=0,active=0;
  for(let pass=0;pass<passes;pass++){
   head.fill(-1,0,cols*rows);active=0;
   for(let i=0,k=0;i<count;i++,k+=3){
    const x=points[k],y=points[k+1];if(x<roi.x0||x>roi.x1||y<roi.y0||y>roi.y1)continue;
    const w=weightAt(x,y);if(w<=0)continue;
    ids[active++]=i;dx[i]=dy[i]=0;weight[i]=w;
    radii[i]=Math.min(maxRadius,radiusScale*points[k+2]/Math.sqrt(Math.max(.001,density(x,y))));
    const cx=Math.floor((x-roi.x0)/cell)+1,cy=Math.floor((y-roi.y0)/cell)+1,key=cy*cols+cx;
    next[i]=head[key];head[key]=i;
   }
   for(let a=0;a<active;a++){
    const i=ids[a],k=i*3,x=points[k],y=points[k+1],cx=Math.floor((x-roi.x0)/cell)+1,cy=Math.floor((y-roi.y0)/cell)+1;
    for(let yy=cy-1;yy<=Math.min(rows-1,cy+1);yy++)for(let xx=cx-1;xx<=Math.min(cols-1,cx+1);xx++)for(let j=head[yy*cols+xx];j>=0;j=next[j]){
     if(j<=i)continue;let vx=x-points[j*3],vy=y-points[j*3+1],d2=vx*vx+vy*vy;const reach=radii[i]+radii[j];
     if(d2>=reach*reach)continue;
     // Degenerate pairs use their immutable source ordering, never per-frame noise.
     if(d2<1e-12){vx=((i+j)&1)?1e-6:0;vy=vx?0:1e-6;d2=1e-12;}
     const d=Math.sqrt(d2),f=.5*gain*(reach-d)/d*Math.min(weight[i],weight[j]);
     dx[i]+=vx*f;dy[i]+=vy*f;dx[j]-=vx*f;dy[j]-=vy*f;totalPairs++;
    }
   }
   for(let a=0;a<active;a++){const i=ids[a],d=Math.hypot(dx[i],dy[i]);if(d<1e-6)continue;const s=Math.min(1,cap/d);move(i*3,dx[i]*s,dy[i]*s);totalMoves++;maxMove=Math.max(maxMove,d*s);}
  }
  return {ms:performance.now()-start,pairs:totalPairs,moves:totalMoves,maxMove,active,passes};
 }
 return {apply};
}
