// Reuse the grid workspace across pressure solves. Each correction depends on
// its own vector and neighboring gradients, never a distant singular cell.
export function createPressureVelocityLimiter({nx,ny,h}) {
  const count=nx*ny,scales=new Float32Array(count);

  function apply(field,activeMask,gradientLimit=0,maxDisplacement=.35) {
    if(!(gradientLimit>0))return {velocityScale:1,maxVelocityGradient:0,maxRawDisplacement:0,limitedCells:0};
    let maxVelocityGradient=0,maxRawDisplacement=0,velocityScale=1,limitedCells=0;

    // A large constant field has no gradient. Bound every vector, including
    // boundary samples that can contribute to staggered interpolation.
    for(let k=0;k<count;k++) {
      const length=Math.hypot(field.dx[k],field.dy[k]);
      maxRawDisplacement=Math.max(maxRawDisplacement,length);
      scales[k]=Math.min(1,maxDisplacement/Math.max(1e-9,length));
    }
    // Read the complete original field before applying scales so the result
    // does not depend on traversal order or partially modified neighbors.
    for(let y=2;y<ny-2;y++)for(let x=2;x<nx-2;x++) {
      const k=y*nx+x;
      if(!activeMask[k])continue;
      const ux=(field.dx[k+1]-field.dx[k-1])/(2*h),uy=(field.dx[k+nx]-field.dx[k-nx])/(2*h);
      const vx=(field.dy[k+1]-field.dy[k-1])/(2*h),vy=(field.dy[k+nx]-field.dy[k-nx])/(2*h);
      const gradient=Math.hypot(ux,uy,vx,vy);
      maxVelocityGradient=Math.max(maxVelocityGradient,gradient);
      scales[k]=Math.min(scales[k],gradientLimit/Math.max(1e-9,gradient));
    }
    for(let k=0;k<count;k++) {
      const scale=scales[k];
      if(scale>=1)continue;
      field.dx[k]*=scale;field.dy[k]*=scale;
      velocityScale=Math.min(velocityScale,scale);limitedCells++;
    }
    return {velocityScale,maxVelocityGradient,maxRawDisplacement,limitedCells};
  }
  return {apply};
}
