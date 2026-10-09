/**
 * Build a local correction from particles that are actually present now.
 * Mass is radius squared, matching Govern's reference and particle density.
 * No particle is moved here, and no virtual obstacle is introduced.
 *
 * rho0At/rho1At return mass per fluid pixel squared. sourceAt returns signed
 * mass per grid cell per correction (not a rate): positive means export.
 * At cell centres these callbacks reproduce the returned cell arrays exactly.
 */
export function prepareMeasuredPocketDensity({particles,source,roi,h=.5,sampler,
  referenceAt=()=>1,massScale=1,pockets=[],time=0,grid:providedGrid=null,
  smoothingPasses=2,smoothingRate=.2,residualTolerance=1e-9}={}){
  const started=performance.now();
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const volumeEpsilon=1e-10,faceEpsilon=1e-12;
  if(!particles||!source||!roi||!(h>0))throw new Error('Measured pocket density requires particles, source, ROI and positive spacing');
  const x0=Math.floor(roi.x0/h)*h,y0=Math.floor(roi.y0/h)*h;
  const nx=Math.max(4,Math.ceil((roi.x1-x0)/h)),ny=Math.max(4,Math.ceil((roi.y1-y0)/h)),n=nx*ny,cellArea=h*h;
  let theta,rightAperture,downAperture;
  if(providedGrid){
    const g=providedGrid;
    if(g.x0!==x0||g.y0!==y0||g.h!==h||g.nx!==nx||g.ny!==ny||g.theta?.length!==n||g.rightAperture?.length!==n||g.downAperture?.length!==n)
      throw new Error('Measured density precomputed grid must match the moving-wall cell grid exactly');
    ({theta,rightAperture,downAperture}=g);
  }else{
    if(!sampler?.evaluateGrid)throw new Error('Measured density requires a physical sampler or precomputed cut-cell grid');
    const fnx=2*nx+1,field=sampler.evaluateGrid(x0,y0,h*.5,fnx,2*ny+1);
    theta=new Float64Array(n);rightAperture=new Float64Array(n);downAperture=new Float64Array(n);
    const segment=(a,b)=>a<=0?(b<=0?1:-a/(b-a)):(b<=0?-b/(a-b):0);
    function triangle(a,b,c){
      if(a<=0){if(b<=0)return c<=0?1:1-c*c/((c-a)*(c-b));return c<=0?1-b*b/((b-a)*(b-c)):a*a/((a-b)*(a-c));}
      if(b>0)return c>0?0:c*c/((c-a)*(c-b));
      return c>0?b*b/((b-a)*(b-c)):1-a*a/((a-b)*(a-c));
    }
    function aperture(a,stride){return .5*(segment(field[a],field[a+stride])+segment(field[a+stride],field[a+2*stride]));}
    for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){
      const k=j*nx+i,a=2*j*fnx+2*i,b=a+2,c=a+2*fnx,d=c+2,m=a+fnx+1;
      theta[k]=clamp(.25*(triangle(field[a],field[b],field[m])+triangle(field[b],field[d],field[m])+triangle(field[d],field[c],field[m])+triangle(field[c],field[a],field[m])),0,1);
      if(i<nx-1)rightAperture[k]=aperture(2*j*fnx+2*(i+1),fnx);
      if(j<ny-1)downAperture[k]=aperture(2*(j+1)*fnx+2*i,1);
    }
  }
  const rasterEnd=performance.now();
  const activePockets=pockets.filter(p=>p&&time>=(p.fadeStart??-Infinity)&&time<=(p.expiresAt??Infinity));
  function membershipAt(x,y){let value=0;for(const p of activePockets)value=Math.max(value,p.membershipAt(x,y));return clamp(value,0,1);}
  function retainedAt(x,y){let value=1;for(const p of activePockets)value=Math.min(value,p.retainedFractionAt(x,y,time));return clamp(value,0,1);}
  const totalMass=new Float64Array(n),selectedMass=new Float64Array(n),desiredMass=new Float64Array(n);
  let inputMass=0,inputSelectedMass=0,particleCount=0,selectedParticles=0,unassignedMass=0,unassignedSelectedMass=0,fallbackParticles=0;
  const cells=new Int32Array(4),weights=new Float64Array(4),connected=new Uint8Array(4);
  function edge(a,b){
    if(b===a+1&&a%nx<nx-1)return rightAperture[a];
    if(a===b+1&&b%nx<nx-1)return rightAperture[b];
    if(b===a+nx)return downAperture[a];
    if(a===b+nx)return downAperture[b];
    return 0;
  }
  for(let k=0;k<particles.length;k+=3){
    const x=particles[k],y=particles[k+1];
    if(x<x0||y<y0||x>=x0+nx*h||y>=y0+ny*h)continue;
    const radius=source[k+2],mass=radius*radius;
    if(!(mass>0)||!Number.isFinite(mass))continue;
    const selected=mass*membershipAt(x,y);
    inputMass+=mass;inputSelectedMass+=selected;particleCount++;if(selected>0)selectedParticles++;
    const fx=(x-x0)/h-.5,fy=(y-y0)/h-.5,i=Math.floor(fx),j=Math.floor(fy),u=fx-i,v=fy-j;
    const containing=Math.floor((y-y0)/h)*nx+Math.floor((x-x0)/h);
    let seed=-1,bestWeight=-1;
    for(let c=0;c<4;c++){
      const ix=i+(c&1),iy=j+(c>>1),index=ix>=0&&iy>=0&&ix<nx&&iy<ny?iy*nx+ix:-1;
      cells[c]=index;connected[c]=0;
      weights[c]=index>=0&&theta[index]>volumeEpsilon?(c&1?u:1-u)*(c&2?v:1-v)*theta[index]:0;
      if(weights[c]>bestWeight&&weights[c]>0){bestWeight=weights[c];seed=c;}
    }
    // Keep the deposit on the same connected physical-fluid side of thin walls.
    for(let c=0;c<4;c++)if(cells[c]===containing&&weights[c]>0)seed=c;
    if(seed>=0){
      connected[seed]=1;
      for(let pass=0;pass<3;pass++)for(let a=0;a<4;a++)if(connected[a])for(let b=0;b<4;b++)
        if(!connected[b]&&weights[b]>0&&edge(cells[a],cells[b])>faceEpsilon)connected[b]=1;
      let sum=0;for(let c=0;c<4;c++)if(connected[c])sum+=weights[c];
      for(let c=0;c<4;c++)if(connected[c]){const weight=weights[c]/sum;totalMass[cells[c]]+=mass*weight;selectedMass[cells[c]]+=selected*weight;}
    }else{
      // A sub-grid sliver can miss all four cut cells. Preserve its deposited
      // mass in the nearest represented fluid cell and report that exception.
      let nearest=-1,distance=Infinity;
      const ci=containing%nx,cj=(containing/nx)|0;
      for(let r=1;r<=4&&nearest<0;r++)for(let jj=Math.max(0,cj-r);jj<=Math.min(ny-1,cj+r);jj++)for(let ii=Math.max(0,ci-r);ii<=Math.min(nx-1,ci+r);ii++){
        const index=jj*nx+ii;if(theta[index]<=volumeEpsilon)continue;
        const d=(x0+(ii+.5)*h-x)**2+(y0+(jj+.5)*h-y)**2;
        if(d<distance){distance=d;nearest=index;}
      }
      if(nearest>=0){totalMass[nearest]+=mass;selectedMass[nearest]+=selected;fallbackParticles++;}
      else{unassignedMass+=mass;unassignedSelectedMass+=selected;}
    }
  }
  let desiredRawMass=0,fluidArea=0;
  for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){
    const k=j*nx+i,x=x0+(i+.5)*h,y=y0+(j+.5)*h;
    fluidArea+=theta[k]*cellArea;
    desiredMass[k]=Math.max(0,referenceAt(x,y)*massScale)*theta[k]*cellArea*membershipAt(x,y)*retainedAt(x,y);
    desiredRawMass+=desiredMass[k];
  }
  const depositEnd=performance.now();
  // The same positive, conservative linear smoother acts on all three fields.
  // Symmetric face exchange conserves mass, respects physical walls, preserves
  // constant fluid density, and keeps selectedMass <= totalMass. Limiting each
  // edge by min(thetaA,thetaB) makes a rate <= 1/4 positive even in tiny cut cells.
  const rate=clamp(smoothingRate,0,.25),passes=Math.max(0,Math.floor(smoothingPasses));
  const deltaTotal=new Float64Array(n),deltaSelected=new Float64Array(n),deltaDesired=new Float64Array(n);
  function exchange(a,b,aperture){
    if(aperture<=faceEpsilon||theta[a]<=volumeEpsilon||theta[b]<=volumeEpsilon)return;
    const scale=rate*aperture*Math.min(theta[a],theta[b]),ia=1/theta[a],ib=1/theta[b];
    let flow=scale*(totalMass[a]*ia-totalMass[b]*ib);deltaTotal[a]-=flow;deltaTotal[b]+=flow;
    flow=scale*(selectedMass[a]*ia-selectedMass[b]*ib);deltaSelected[a]-=flow;deltaSelected[b]+=flow;
    flow=scale*(desiredMass[a]*ia-desiredMass[b]*ib);deltaDesired[a]-=flow;deltaDesired[b]+=flow;
  }
  for(let pass=0;pass<passes;pass++){
    deltaTotal.fill(0);deltaSelected.fill(0);deltaDesired.fill(0);
    for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){
      const k=j*nx+i;if(i<nx-1)exchange(k,k+1,rightAperture[k]);if(j<ny-1)exchange(k,k+nx,downAperture[k]);
    }
    for(let k=0;k<n;k++){totalMass[k]+=deltaTotal[k];selectedMass[k]+=deltaSelected[k];desiredMass[k]+=deltaDesired[k];}
  }
  const goalMass=new Float64Array(n),sourceMass=new Float64Array(n),rho0=new Float64Array(n),rho1=new Float64Array(n);
  let observedTotal=0,observedSelected=0,desiredTotal=0,totalResidual=0,positiveResidual=0,negativeResidual=0,minGoalMass=Infinity,maxRho0=0,maxRho1=0;
  for(let k=0;k<n;k++){
    const residual=selectedMass[k]-desiredMass[k];sourceMass[k]=residual;
    goalMass[k]=totalMass[k]-selectedMass[k]+desiredMass[k];
    observedTotal+=totalMass[k];observedSelected+=selectedMass[k];desiredTotal+=desiredMass[k];
    totalResidual+=residual;positiveResidual+=Math.max(0,residual);negativeResidual+=Math.min(0,residual);
    minGoalMass=Math.min(minGoalMass,goalMass[k]);
    if(theta[k]>volumeEpsilon){rho0[k]=totalMass[k]/(theta[k]*cellArea);rho1[k]=goalMass[k]/(theta[k]*cellArea);maxRho0=Math.max(maxRho0,rho0[k]);maxRho1=Math.max(maxRho1,rho1[k]);}
  }
  function sampleMass(field,x,y,normalizeFluid){
    if(x<x0||y<y0||x>=x0+nx*h||y>=y0+ny*h)return normalizeFluid?Math.max(0,referenceAt(x,y)*massScale):0;
    const fx=clamp((x-x0)/h-.5,0,nx-1),fy=clamp((y-y0)/h-.5,0,ny-1),i=Math.floor(fx),j=Math.floor(fy),u=fx-i,v=fy-j;
    const i1=Math.min(nx-1,i+1),j1=Math.min(ny-1,j+1),a=j*nx+i,b=j*nx+i1,c=j1*nx+i,d=j1*nx+i1;
    const wa=(1-u)*(1-v),wb=u*(1-v),wc=(1-u)*v,wd=u*v;
    const value=wa*field[a]+wb*field[b]+wc*field[c]+wd*field[d];
    if(!normalizeFluid)return value;
    const volume=cellArea*(wa*theta[a]+wb*theta[b]+wc*theta[c]+wd*theta[d]);
    return volume>volumeEpsilon*cellArea?Math.max(0,value/volume):0;
  }
  const stats={particleCount,selectedParticles,inputMass,inputSelectedMass,observedTotal,observedSelected,desiredRawMass,desiredTotal,
    totalResidual,positiveResidual,negativeResidual,unassignedMass,unassignedSelectedMass,fallbackParticles,fluidArea,minGoalMass,maxRho0,maxRho1,
    totalConservationError:observedTotal+unassignedMass-inputMass,selectedConservationError:observedSelected+unassignedSelectedMass-inputSelectedMass,
    desiredConservationError:desiredTotal-desiredRawMass,smoothingPasses:passes,smoothingRate:rate,gridCells:n,activePockets:activePockets.length,
    stageMs:{raster:rasterEnd-started,deposit:depositEnd-rasterEnd,smoothAndFinalize:performance.now()-depositEnd}};
  return {rho0At:(x,y)=>sampleMass(totalMass,x,y,true),rho1At:(x,y)=>sampleMass(goalMass,x,y,true),sourceAt:(x,y)=>sampleMass(sourceMass,x,y,false),
    totalResidual,shouldApply:totalResidual>Math.max(residualTolerance,inputSelectedMass*1e-10),stats,
    grid:{x0,y0,h,nx,ny,theta,rightAperture,downAperture},totalMass,selectedMass,desiredMass,goalMass,sourceMass,massDelta:sourceMass,rho0,rho1};
}
