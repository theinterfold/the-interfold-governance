/** Conservative coarse-cell upper bounds for the raster white field.
 * A cell is certified empty only when the sum of each circle's maximum
 * contribution over the whole cell is below the white threshold.
 */
export function createWhiteBounds(grid,{threshold=.99999}={}){
  const {x0,y0,h,nx,ny}=grid, cx=nx-1,cy=ny-1;
  const upper=new Float64Array(cx*cy),empty=new Uint8Array(cx*cy);
  let builtFor=null,buildStats={components:0,cells:0};
  function setState(state){
    upper.fill(0);builtFor=state;
    const fusionAmount=state.fusionAmount??1;
    const kr=.1+((state.kernelRatio??.75)-.1)*fusionAmount;
    const sized=state.sized||[],shrinks=state.shrinks||[];
    let components=0;
    for(let i=0;i<sized.length;i++){
      const c=sized[i],nominal=c.r,R=nominal-(shrinks[i]||0),L=1.5*nominal,kappa=Math.max(1e-9,kr*nominal),reach=R+L;
      if(!(nominal>0&&Number.isFinite(c.x)&&Number.isFinite(c.y)))continue;
      // Cells whose boxes intersect the compact support, with one-cell padding
      // against floating point boundary rounding.
      const ix0=Math.max(0,Math.floor((c.x-reach-x0)/h)-1),ix1=Math.min(cx-1,Math.floor((c.x+reach-x0)/h)+1);
      const iy0=Math.max(0,Math.floor((c.y-reach-y0)/h)-1),iy1=Math.min(cy-1,Math.floor((c.y+reach-y0)/h)+1);
      for(let iy=iy0;iy<=iy1;iy++){
        const top=y0+iy*h,bottom=top+h;
        const dy=Math.max(top-c.y,0,c.y-bottom),row=iy*cx;
        for(let ix=ix0;ix<=ix1;ix++){
          const left=x0+ix*h,right=left+h;
          const dx=Math.max(left-c.x,0,c.x-right);
          // Round distance down so the component remains an upper bound.
          const d=Math.sqrt(dx*dx+dy*dy)-R-1e-12;
          if(d>=L)continue;
          let G=1;
          if(d>0){const u=d/L,u2=u*u,u3=u2*u;G=1-10*u3+15*u3*u-6*u3*u2;}
          upper[row+ix]+=Math.exp(-d/kappa)*G;
          components++;
        }
      }
    }
    // Tiny upward rounding guard for accumulated Float64 contributions.
    for(let i=0;i<upper.length;i++){upper[i]+=1e-12;empty[i]=upper[i]<threshold?1:0;}
    buildStats={components,cells:upper.length};
    return buildStats;
  }
  function segmentOutside(x,y,toX,toY){
    const pad=1e-3,minX=Math.min(x,toX)-pad,maxX=Math.max(x,toX)+pad,minY=Math.min(y,toY)-pad,maxY=Math.max(y,toY)+pad;
    if(minX<x0||minY<y0||maxX>x0+cx*h||maxY>y0+cy*h)return false;
    const ix0=Math.floor((minX-x0-1e-10)/h),ix1=Math.floor((maxX-x0+1e-10)/h),iy0=Math.floor((minY-y0-1e-10)/h),iy1=Math.floor((maxY-y0+1e-10)/h);
    if(ix1>=cx||iy1>=cy)return false;
    for(let iy=iy0;iy<=iy1;iy++){const row=iy*cx;for(let ix=ix0;ix<=ix1;ix++){if(!empty[row+ix])return false;}}
    return true;
  }
  function pointOutside(x,y){return segmentOutside(x,y,x,y);}
  return{setState,pointOutside,segmentOutside,get buildStats(){return buildStats;},get state(){return builtFor;}};
}
