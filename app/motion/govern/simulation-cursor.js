export const CURSOR_RADIUS = 20;

// A prescribed moving wall for the same pressure/implicit solver as every
// other vacancy. Sampling and forecasting are pure; only input retargets it.
// Reach a nearby pointer in one solved frame; the old 160-unit cap took many
// slow solver frames and compounded lag. Swept geometry still handles contact.
export function createSimulationCursor(enabled=false){
  let start={x:-1000,y:-1000,r:0,time:0},target={x:-1000,y:-1000,r:0};
  function sample(time){
    const dt=Math.max(0,time-start.time),blend=1-Math.exp(-36*dt);
    const dx=target.x-start.x,dy=target.y-start.y,distance=Math.hypot(dx,dy);
    const travel=Math.min(distance*blend,1200*dt),move=distance>0?travel/distance:0;
    let r=start.r+(target.r-start.r)*blend;
    if(Math.abs(r-target.r)<.01)r=target.r;
    return {x:start.x+dx*move,y:start.y+dy*move,r};
  }
  return {
    setTarget(x,y,strength,time){
      if(!enabled||!Number.isFinite(x+y+strength+time))return;
      const current=sample(time),r=CURSOR_RADIUS*Math.max(0,Math.min(1,strength));
      if(current.r<.01&&r>0){current.x=x;current.y=y;}
      start={...current,time};target={x:r>0?x:current.x,y:r>0?y:current.y,r};
    },
    circle(time,size=1){
      if(!enabled)return null;
      const c=sample(time);
      return {x:c.x,y:c.y,r:Math.max(.001,c.r)/size};
    },
    // Cursor transport linearly subdivides its endpoints. Rebase on the
    // accepted wall, rather than resampling the old exponential trajectory.
    rebase(circle,time,size=1){start={x:circle.x,y:circle.y,r:circle.r*size,time};},
    reset(){start={x:-1000,y:-1000,r:0,time:0};target={x:-1000,y:-1000,r:0};},
  };
}
