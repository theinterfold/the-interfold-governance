// Build once with the particle asset, never in the pointer or render loop.
export function particleHull(points) {
  const sorted = points.map(p => [p[0], p[1]]).sort((a,b) => a[0]-b[0] || a[1]-b[1]);
  const cross = (a,b,c) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  const chain = list => {
    const edge=[];
    for(const p of list){while(edge.length>1&&cross(edge.at(-2),edge.at(-1),p)<=0)edge.pop();edge.push(p);}
    return edge.slice(0,-1);
  };
  return [...chain(sorted),...chain(sorted.slice().reverse())];
}

export function cursorRegionAmount(x,y,hull) {
  if(!hull?.length)return 0;
  let distance=-Infinity;
  for(let i=0;i<hull.length;i++){
    const a=hull[i],b=hull[(i+1)%hull.length],dx=b[0]-a[0],dy=b[1]-a[1];
    distance=Math.max(distance,(dy*(x-a[0])-dx*(y-a[1]))/Math.hypot(dx,dy));
  }
  // Full-size cursor before its rim reaches even the outermost sparse grains.
  const t=Math.max(0,Math.min(1,(distance-28)/32));
  return 1-t*t*(3-2*t);
}

export const CURSOR_EXIT_MS=400;
// The shared UI easing: cubic-bezier(0.22, 1, 0.36, 1).
function ease(t){
  if(t<=0)return 0;if(t>=1)return 1;
  let lo=0,hi=1,u=t;
  for(let i=0;i<12;i++){
    const v=1-u,x=3*v*v*u*.22+3*v*u*u*.36+u*u*u;
    if(x<t)lo=u;else hi=u;u=(lo+hi)/2;
  }
  return 1-(1-u)**3;
}

export function createCursorPresence(){
  const cursor={x:300,y:225,r:0};
  let value=0,from=0,target=0,started=0;
  function sample(now){
    const t=Math.max(0,Math.min(1,(now-started)/CURSOR_EXIT_MS));
    // Ease the cleared area, not the radius: the opening no longer collapses
    // mostly in the first few frames. This affects exit only, never tracking.
    value=t===1||from===target?target:Math.sqrt(Math.max(0,from*from+(target*target-from*from)*ease(t)));
    cursor.r=20*value;return cursor;
  }
  function setTarget(amount,now){
    sample(now);
    if(amount>=value){value=from=target=amount;started=now;}
    else if(amount!==target){from=value;target=amount;started=now;}
    cursor.r=20*value;
  }
  return {sample,
    move(x,y,amount,now){cursor.x=x;cursor.y=y;setTarget(amount,now);},
    leave(now){setTarget(0,now);},
    reset(){value=from=target=0;cursor.r=0;},
  };
}
