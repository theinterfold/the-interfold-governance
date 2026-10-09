/** The exact zero of a prescribed density target is unavailable to later
 * material moves. Only its boundary is constrained; tangential slip is free.
 */
export function createEmptyPocketBoundary(particles){
  let active=[];const threshold=1-1e-7;
  function setPockets(pockets,time){active=pockets.filter(p=>time>=p.fadeStart-1e-9&&time<=p.expiresAt);}
  function near(x,y,radius=0){
    for(const p of active){const b=p.supportBounds;if(x>=b.x0-radius&&x<=b.x1+radius&&y>=b.y0-radius&&y<=b.y1+radius)return true;}
    return false;
  }
  function at(x,y){
    for(const p of active){const b=p.supportBounds;if(x<b.x0||x>b.x1||y<b.y0||y>b.y1)continue;if(p.membershipAt(x,y)>=threshold)return p;}
    return null;
  }
  function segmentBlocked(x,y,toX,toY){
    const dx=toX-x,dy=toY-y,len=Math.hypot(dx,dy);if(!near(x,y,len))return false;
    const count=Math.max(1,Math.ceil(len/.0625));
    for(let i=1;i<=count;i++)if(at(x+dx*i/count,y+dy*i/count))return true;
    return false;
  }
  function move(k,dx,dy,physical=null){
    const count=Math.max(1,Math.ceil(Math.hypot(dx,dy)/.0625));dx/=count;dy/=count;
    let respectTarget=!at(particles[k],particles[k+1]);
    function allowed(x,y){
      x=Math.fround(x);y=Math.fround(y);
      return (!physical||physical.value(x,y)<=0)&&(!respectTarget||!at(x,y));
    }
    function prefix(x,y,ux,uy){
      let hi=0;
      if(!allowed(x+ux*.5,y+uy*.5))hi=.5;
      else if(!allowed(x+ux,y+uy))hi=1;
      else return 1;
      let lo=0;
      for(let i=0;i<14;i++){const t=(lo+hi)*.5;if(allowed(x+ux*t,y+uy*t))lo=t;else hi=t;}
      return lo;
    }
    for(let step=0;step<count;step++){
      const x=particles[k],y=particles[k+1];if(!respectTarget&&!at(x,y))respectTarget=true;
      const fraction=prefix(x,y,dx,dy);
      if(fraction===1){particles[k]=x+dx;particles[k+1]=y+dy;continue;}
      const bx=x+dx*fraction,by=y+dy*fraction;
      const badX=x+dx*Math.min(1,fraction+1e-4),badY=y+dy*Math.min(1,fraction+1e-4);
      let nx,ny;
      if(physical&&physical.value(badX,badY)>0){const normal=physical.normal(bx,by);nx=normal.nx;ny=normal.ny;}
      else{
        const pocket=at(badX,badY)||at(x+dx,y+dy)||active.find(p=>{const b=p.supportBounds;return bx>=b.x0&&bx<=b.x1&&by>=b.y0&&by<=b.y1;});
        if(!pocket){nx=-dx;ny=-dy;}
        else{const e=pocket.grid.h*.25;nx=pocket.membershipAt(bx-e,by)-pocket.membershipAt(bx+e,by);ny=pocket.membershipAt(bx,by-e)-pocket.membershipAt(bx,by+e);}
        const mag=Math.hypot(nx,ny);if(mag>1e-12){nx/=mag;ny/=mag;}else{const len=Math.hypot(dx,dy)||1;nx=-dx/len;ny=-dy/len;}
      }
      particles[k]=bx;particles[k+1]=by;
      const inward=Math.min(0,dx*nx+dy*ny),tx=(dx-inward*nx)*(1-fraction),ty=(dy-inward*ny)*(1-fraction);
      const slide=prefix(particles[k],particles[k+1],tx,ty);
      particles[k]+=tx*slide;particles[k+1]+=ty*slide;
    }
  }
  return {setPockets,near,at,segmentBlocked,move,get count(){return active.length;}};
}
