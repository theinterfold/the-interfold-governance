/** Split only source-connected pairs while preserving each approved group centre. */
export const PAIR_OFFSETS=Object.freeze([{ids:[6,8],amplitude:10},{ids:[30,31],amplitude:12}]);
const smooth5=u=>u<=0?0:u>=1?1:6*u**5-15*u**4+10*u**3;
export function pairSeparation(q){return smooth5(q*q/.49)}
export function pairSeparationDerivative(q){const u=q*q/.49;return u<=0||u>=1?0:30*u*u*(1-u)*(1-u)*(2*q/.49)}
export function applyPairOffsets(circles,sourceHoles,q,out=circles.map(c=>({...c}))){
  for(let i=0;i<circles.length;i++)Object.assign(out[i],circles[i]);
  const f=pairSeparation(q);
  for(const {ids:[i,j],amplitude} of PAIR_OFFSETS){
    const dx=sourceHoles[j].x-sourceHoles[i].x,dy=sourceHoles[j].y-sourceHoles[i].y,L=Math.hypot(dx,dy),ux=dx/L,uy=dy/L,a=amplitude*f;
    out[i].x-=a*ux;out[i].y-=a*uy;out[j].x+=a*ux;out[j].y+=a*uy;
  }
  return out;
}

const PAIR_FREQUENCIES=Object.freeze({ '6-8':.23, '30-31':.18 });
/** Independent metaball phase. fusionTime is already speed-scaled by the gallery UI. */
export function pairSplitFraction(ids,fusionTime=0,fusionAmount=1){
  const key=ids.join('-'),omega=PAIR_FREQUENCIES[key];
  return .5-.5*Math.cos(Math.max(0,fusionTime)*omega);
}
/** The source union and the fully separated state retain their circle contours;
 * the neck is strongest halfway through each independent split/join cycle. */
export function pairMetaballMixesForFusion(fusionTime=0,fusionAmount=1,motionMix=0){
  const amount=Math.max(0,Math.min(1,Number(fusionAmount)||0));
  return PAIR_OFFSETS.map(({ids})=>{
    const f=pairSplitFraction(ids,fusionTime,fusionAmount);
    const a=Math.max(0,Math.min(1,motionMix))*(1-f*f),b=Math.sin(Math.PI*f)**2;
    return amount*(a+b-a*b);
  });
}
/** Time derivative of pairMetaballMixesForFusion.  fusionTimeRate is the
 *  derivative of the already speed-scaled fusionTime in real seconds. */
export function pairMetaballMixRatesForFusion(fusionTime=0,fusionTimeRate=1,fusionAmount=1,motionMix=0,motionMixRate=0){
  const amount=Math.max(0,Math.min(1,Number(fusionAmount)||0)),t=Math.max(0,fusionTime);
  return PAIR_OFFSETS.map(({ids})=>{
    const omega=PAIR_FREQUENCIES[ids.join('-')],f=pairSplitFraction(ids,t,amount);
    const df=.5*omega*Math.sin(omega*t)*fusionTimeRate;
    const a=Math.max(0,Math.min(1,motionMix))*(1-f*f),b=Math.sin(Math.PI*f)**2;
    const da=motionMixRate*(1-f*f)-2*motionMix*f*df;
    const db=Math.PI*Math.sin(2*Math.PI*f)*df;
    return amount*((1-b)*da+(1-a)*db);
  });
}
export function applyPairOffsetsForFusion(circles,sourceHoles,controls={},out=circles.map(c=>({...c}))){
  for(let i=0;i<circles.length;i++)Object.assign(out[i],circles[i]);
  const time=controls.fusionTime??((controls.time??0)*(controls.fusionSpeed??1));
  for(const {ids:[i,j],amplitude} of PAIR_OFFSETS){
    const dx=sourceHoles[j].x-sourceHoles[i].x,dy=sourceHoles[j].y-sourceHoles[i].y,L=Math.hypot(dx,dy),ux=dx/L,uy=dy/L;
    const a=amplitude*pairSplitFraction([i,j],time,controls.fusionAmount??1);
    out[i].x-=a*ux;out[i].y-=a*uy;out[j].x+=a*ux;out[j].y+=a*uy;
  }
  return out;
}
