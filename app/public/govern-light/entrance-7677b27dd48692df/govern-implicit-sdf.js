/** Symmetric 32-vacancy level set. Positive value means white; no paint/masking. */
const SOURCE_PAIRS=[[6,8],[30,31]];
export function metaballMixAt(fusionTime=0,fusionAmount=1){
  const amount=Math.max(0,Math.min(1,Number(fusionAmount)||0)),omega=.2,t=Math.max(0,fusionTime);
  return{mix:amount*(.5-.5*Math.cos(omega*t)),ratePerFusionTime:amount*.5*omega*Math.sin(omega*t)};
}
/** Approved q paths return to their source geometry at q=0.  The mix reaches
 *  its full spatial-contact strength before any new pair can touch. */
export function metaballMixForApprovedPhase(q=0,fusionAmount=1){
  const amount=Math.max(0,Math.min(1,Number(fusionAmount)||0));
  const u=Math.min(1,Math.abs(q)/.025);
  return amount*(u*u*u*(10+u*(-15+6*u)));
}
export function metaballMixRateForApprovedPhase(q=0,qRate=0,fusionAmount=1){
  const u=Math.abs(q)/.025;
  if(u<=0||u>=1)return 0;
  return Math.max(0,Math.min(1,Number(fusionAmount)||0))*30*u*u*(1-u)*(1-u)*Math.sign(q)*qRate/.025;
}
/**
 * `fusionMix=0` is the exact hard union of guide circles (approved source).
 * `fusionMix=1` is the C2 compact metaball sum. Between them, a p-norm gives
 * a continuous, permutation-independent family and supports triple contacts.
 * `signedGap` is a first-order distance near the contour, positive outside.
 */
export function evaluateImplicit(x,y,circles,shrinks=null,whiteSize=1,out={},velocities=null,shrinkRates=null,fusionAmount=1,fusionMix=1,fusionMixRate=0,pairMixes=null,pairMixRates=null,kernelRatio=.75){
  const count=circles.length,blend=Math.max(0,Math.min(1,fusionMix)),amount=Math.max(0,Math.min(1,fusionAmount));
  let scratch=out._scratch;
  if(!scratch||scratch.K.length<count){
    scratch={K:new Float64Array(count),Kx:new Float64Array(count),Ky:new Float64Array(count),Kt:new Float64Array(count),
      G:new Float64Array(count),Gx:new Float64Array(count),Gy:new Float64Array(count),Gt:new Float64Array(count)};
    Object.defineProperty(out,'_scratch',{value:scratch,writable:true,configurable:true});
  }
  const {K,Kx,Ky,Kt}=scratch;
  K.fill(0,0,count);Kx.fill(0,0,count);Ky.fill(0,0,count);Kt.fill(0,0,count);
  let nearest=Infinity,nearNx=0,nearNy=0,maxK=0,maxIndex=-1;
  const candidates=out._candidateIndices;
  for(let ci=0,cn=candidates?candidates.length:count;ci<cn;ci++){
    const i=candidates?candidates[ci]:ci;
    const h=circles[i],dx=x-h.x,dy=y-h.y;
    if(out._support2&&dx*dx+dy*dy>=out._support2[i])continue;
    const rad=Math.sqrt(dx*dx+dy*dy)||1e-9;
    const nominal=h.r*whiteSize,R=nominal-(shrinks?.[i]??0),d=rad-R;
    if(d<nearest){nearest=d;nearNx=dx/rad;nearNy=dy/rad;}
    const reach=1.5*nominal;if(d>=reach)continue;
    const u=d/reach;let G=1,Gp=0;
    if(u>0){const u2=u*u,u3=u2*u,u4=u3*u;
      G=1-10*u3+15*u4-6*u4*u;
      Gp=(-30*u2+60*u3-30*u4)/reach;
    }
    const ratio=.1+(kernelRatio-.1)*amount,kappa=ratio*nominal,E=Math.exp(-d/kappa),value=E*G,derivative=E*(Gp-G/kappa);
    K[i]=value;Kx[i]=derivative*dx/rad;Ky[i]=derivative*dy/rad;
    if(velocities){const v=velocities[i]??{x:0,y:0};Kt[i]=derivative*(-(dx*v.x+dy*v.y)/rad+(shrinkRates?.[i]??0));}
    if(value>maxK){maxK=value;maxIndex=i;}
  }
  let V=K,Vx=Kx,Vy=Ky,Vt=Kt;
  if(pairMixes&&count>31){
    const {G,Gx,Gy,Gt}=scratch;G.set(K);Gx.set(Kx);Gy.set(Ky);Gt.set(Kt);
    for(let z=0;z<2;z++){
      const [a,b]=SOURCE_PAIRS[z],m=Math.max(0,Math.min(1,pairMixes[z]??0)),mr=pairMixRates?.[z]??0;
      const A=K[a],B=K[b];
      if(m<=1e-9){const w=A>=B?a:b;G[a]=K[w];Gx[a]=Kx[w];Gy[a]=Ky[w];Gt[a]=Kt[w];}
      else if(m>=1-1e-9){G[a]=A+B;Gx[a]=Kx[a]+Kx[b];Gy[a]=Ky[a]+Ky[b];Gt[a]=Kt[a]+Kt[b];}
      else if(A<=0||B<=0){const w=A>=B?a:b;G[a]=K[w];Gx[a]=Kx[w];Gy[a]=Ky[w];Gt[a]=Kt[w];}
      else{
        const high=Math.max(A,B),logHigh=Math.log(high),p=1/m;
        const da=Math.log(A)-logHigh,db=Math.log(B)-logHigh;
        const ea=Math.exp(p*da),eb=Math.exp(p*db),zsum=ea+eb;
        const weight=Math.exp(logHigh+m*Math.log(zsum)),scale=weight/zsum;
        G[a]=weight;Gx[a]=scale*(ea*Kx[a]/A+eb*Kx[b]/B);
        Gy[a]=scale*(ea*Ky[a]/A+eb*Ky[b]/B);
        Gt[a]=scale*(ea*Kt[a]/A+eb*Kt[b]/B);
        if(mr)Gt[a]+=weight*(Math.log(zsum)-(ea*da+eb*db)/(zsum*m))*mr;
      }
      G[b]=Gx[b]=Gy[b]=Gt[b]=0;
    }
    V=G;Vx=Gx;Vy=Gy;Vt=Gt;
    maxK=0;maxIndex=-1;
    for(let i=0;i<count;i++)if(V[i]>maxK){maxK=V[i];maxIndex=i;}
  }
  let W=0,gx=0,gy=0,wt=0;
  if(maxIndex<0){W=0;}
  else if(blend<=1e-9){W=maxK;gx=Vx[maxIndex];gy=Vy[maxIndex];wt=Vt[maxIndex];}
  else if(blend>=1-1e-9){
    for(let i=0;i<count;i++){W+=V[i];gx+=Vx[i];gy+=Vy[i];wt+=Vt[i];}
  }else{
    const maxLog=Math.log(maxK),p=1/blend;let Z=0,weightedDelta=0,dx=0,dy=0,dt=0;
    for(let i=0;i<count;i++)if(V[i]>0){
      const diff=Math.log(V[i])-maxLog,e=Math.exp(p*diff);Z+=e;weightedDelta+=e*diff;
      dx+=e*Vx[i]/V[i];dy+=e*Vy[i]/V[i];dt+=e*Vt[i]/V[i];
    }
    W=Math.exp(maxLog+blend*Math.log(Z));
    const factor=W/Z;gx=factor*dx;gy=factor*dy;wt=factor*dt;
    if(fusionMixRate)wt+=W*(Math.log(Z)-weightedDelta/(Z*blend))*fusionMixRate;
  }
  const mag=Math.sqrt(gx*gx+gy*gy);out.value=W-1;out.weight=W;
  out.nx=mag>1e-7?-gx/mag:nearNx;out.ny=mag>1e-7?-gy/mag:nearNy;
  // The sign must follow the implicit surface even at a flat bridge saddle:
  // nearest-circle distance can be positive inside a fused white region.
  out.signedGap=Math.max(-24,Math.min(24,(1-W)/Math.max(mag,0.05)));
  out.gradient=mag;out.surfaceNormalSpeed=mag>1e-7?wt/mag:0;
  out.surfaceVx=out.surfaceNormalSpeed*out.nx;out.surfaceVy=out.surfaceNormalSpeed*out.ny;
  return out;
}
/** State API for particle simulations; velocities are center derivatives per second. */
export function evaluateImplicitState(x,y,state,out={}){
  return evaluateImplicit(x,y,state.circles,state.shrinks??null,state.whiteSize??1,out,state.velocities??null,state.shrinkRates??null,state.fusionAmount??1,state.fusionMix??1,state.fusionMixRate??0,state.pairMixes??null,state.pairMixRates??null,state.kernelRatio??.75);
}
/** Reusable sampler for a particle loop; one output object and four small
 *  scratch vectors are allocated once, then retained across frame states. */
export function createImplicitEvaluator(initialState){
  let state=initialState;const out={};
  const x0=-64,y0=-64,cell=24,nx=32,ny=24,bins=Array.from({length:nx*ny},()=>[]);
  const circleCount=initialState.circles.length;
  const support2=new Float64Array(circleCount),effectiveR=new Float64Array(circleCount),
    centerX=new Float64Array(circleCount),centerY=new Float64Array(circleCount),
    reach=new Float64Array(circleCount),reachInv=new Float64Array(circleCount),kappaInv=new Float64Array(circleCount);
  let useFastSum=false;
  out._support2=support2;
  function rebuild(){
    for(const bin of bins)bin.length=0;
    const whiteSize=state.whiteSize??1,ratio=.1+((state.kernelRatio??.75)-.1)*(state.fusionAmount??1);
    useFastSum=(state.fusionMix??1)>=1-1e-9&&!state.pairMixes?.some(m=>m<1-1e-9)&&!state.velocities&&!state.fusionMixRate&&!state.pairMixRates;
    for(let i=0;i<state.circles.length;i++){
      const c=state.circles[i],nominal=c.r*whiteSize,
        support=nominal-(state.shrinks?.[i]??0)+1.5*nominal+1e-5;
      centerX[i]=c.x;centerY[i]=c.y;reach[i]=1.5*nominal;
      reachInv[i]=1/reach[i];kappaInv[i]=1/(ratio*nominal);
      effectiveR[i]=nominal-(state.shrinks?.[i]??0);
      support2[i]=support*support;
      const ax=Math.max(0,Math.floor((c.x-support-x0)/cell)),bx=Math.min(nx-1,Math.floor((c.x+support-x0)/cell));
      const ay=Math.max(0,Math.floor((c.y-support-y0)/cell)),by=Math.min(ny-1,Math.floor((c.y+support-y0)/cell));
      for(let cy=ay;cy<=by;cy++)for(let cx=ax;cx<=bx;cx++)bins[cy*nx+cx].push(i);
    }
  }
  function sampleCurrent(x,y,valueOnly=false){
    // With unit inner/outer mixes the entire symmetric field is a plain sum.
    // Keep the generic p-norm path for startup, controls and derivative callers.
    if(!useFastSum)
      {const c=evaluateImplicitState(x,y,state,out);return valueOnly?c.value:c;}
    const ids=out._candidateIndices;
    let W=0,gx=0,gy=0,nearest=Infinity,nearNx=0,nearNy=0;
    for(let ci=0,n=ids?ids.length:state.circles.length;ci<n;ci++){
      const i=ids?ids[ci]:ci,dx=x-centerX[i],dy=y-centerY[i],rad2=dx*dx+dy*dy;
      if(rad2>=support2[i])continue;
      const rad=Math.sqrt(rad2)||1e-9,d=rad-effectiveR[i];
      if(!valueOnly&&d<nearest){nearest=d;nearNx=dx/rad;nearNy=dy/rad;}
      if(d>=reach[i])continue;
      let G=1,Gp=0;
      if(d>0){const u=d*reachInv[i],u2=u*u,u3=u2*u,u4=u3*u;G=1-10*u3+15*u4-6*u4*u;if(!valueOnly)Gp=(-30*u2+60*u3-30*u4)*reachInv[i];}
      const E=Math.exp(-d*kappaInv[i]);W+=E*G;
      if(!valueOnly){const derivative=E*(Gp-G*kappaInv[i])/rad;gx+=derivative*dx;gy+=derivative*dy;}
    }
    if(valueOnly)return W-1;
    const mag=Math.sqrt(gx*gx+gy*gy);out.value=W-1;out.weight=W;
    out.nx=mag>1e-7?-gx/mag:nearNx;out.ny=mag>1e-7?-gy/mag:nearNy;
    out.signedGap=Math.max(-24,Math.min(24,(1-W)/Math.max(mag,.05)));
    out.gradient=mag;out.surfaceNormalSpeed=0;out.surfaceVx=0;out.surfaceVy=0;
    return out;
  }
  rebuild();
  return{
    setState(nextState){state=nextState;rebuild();},
    evaluateValue(x,y){
      const cx=Math.floor((x-x0)/cell),cy=Math.floor((y-y0)/cell);
      out._candidateIndices=cx>=0&&cx<nx&&cy>=0&&cy<ny?bins[cy*nx+cx]:null;
      return out._candidateIndices?.length===0?-1:sampleCurrent(x,y,true);
    },
    /** Rasterizes values in row-major order. The summed kernel path walks
     *  circles in the same ascending order as evaluateValue at each pixel;
     *  the other field modes retain the reference point sampler. */
    evaluateGrid(X0,Y0,H,NX,NY,gridOut){
      const width=Math.max(0,Math.trunc(NX)),height=Math.max(0,Math.trunc(NY)),length=width*height;
      if(!gridOut)gridOut=new Float32Array(length);
      if(gridOut.length<length)throw new RangeError('evaluateGrid output is too small');
      if(!useFastSum||!(H>0)||!Number.isFinite(H)){
        for(let j=0,k=0;j<height;j++)for(let i=0;i<width;i++,k++)
          gridOut[k]=this.evaluateValue(X0+i*H,Y0+j*H);
        return gridOut;
      }
      for(let j=0,k=0;j<height;j++){
        const y=Y0+j*H,cyBin=Math.floor((y-y0)/cell);
        for(let i=0;i<width;i++,k++){
          const x=X0+i*H,cxBin=Math.floor((x-x0)/cell);
          const ids=cxBin>=0&&cxBin<nx&&cyBin>=0&&cyBin<ny?bins[cyBin*nx+cxBin]:null;
          let W=0;
          for(let ci=0,n=ids?ids.length:state.circles.length;ci<n;ci++){
            const circle=ids?ids[ci]:ci,dx=x-centerX[circle],dy=y-centerY[circle],rad2=dx*dx+dy*dy;
            if(rad2>=support2[circle])continue;
            const rad=Math.sqrt(rad2)||1e-9,d=rad-effectiveR[circle];
            if(d>=reach[circle])continue;
            let G=1;
            if(d>0){const u=d*reachInv[circle],u2=u*u,u3=u2*u,u4=u3*u;G=1-10*u3+15*u4-6*u4*u;}
            W+=Math.exp(-d*kappaInv[circle])*G;
          }
          gridOut[k]=W-1;
        }
      }
      return gridOut;
    },
    evaluate(x,y){
      const cx=Math.floor((x-x0)/cell),cy=Math.floor((y-y0)/cell);
      out._candidateIndices=cx>=0&&cx<nx&&cy>=0&&cy<ny?bins[cy*nx+cx]:null;
      if(out._candidateIndices?.length===0){
        out.value=-1;out.weight=0;out.nx=0;out.ny=0;out.signedGap=24;
        out.gradient=0;out.surfaceNormalSpeed=0;out.surfaceVx=0;out.surfaceVy=0;
        return out;
      }
      return sampleCurrent(x,y);
    },
    /** Returns null away from every guide by maxGap.  Bridges up to 13px
     *  nominal separation remain within a 7px guide gap, so 12px is ample. */
    evaluateNearWall(x,y,maxGap=12){
      const cx=Math.floor((x-x0)/cell),cy=Math.floor((y-y0)/cell);
      if(cx<0||cx>=nx||cy<0||cy>=ny)return null;
      const candidates=bins[cy*nx+cx];
      for(let k=0;k<candidates.length;k++){
        const i=candidates[k],dx=x-centerX[i],dy=y-centerY[i],limit=effectiveR[i]+maxGap;
        if(dx*dx+dy*dy<limit*limit){
          out._candidateIndices=candidates;
          return sampleCurrent(x,y);
        }
      }
      return null;
    },
    output:out,
  };
}
