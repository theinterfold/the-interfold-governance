/**
 * Cache immutable forecast fields and find the next closing interval at each
 * cell. Queries always start from the supplied exact current raster, so a
 * cell which closed and then reopened is eligible for routing again.
 *
 * Times are absolute simulation times. Infinity means no closing sample was
 * observed through lastTime; it is not a prediction beyond that horizon.
 */
export function createTemporalCloseGrid(samples,grid,{margin=.1,threshold=-.002}={}){
  const {X0,Y0,NX,NY,H}=grid;
  if(!Number.isFinite(X0)||!Number.isFinite(Y0)||!Number.isFinite(H)||H<=0||
     !Number.isInteger(NX)||!Number.isInteger(NY)||NX<1||NY<1)
    throw new TypeError('Temporal forecast grid must have finite coordinates, positive spacing and integer dimensions');
  if(!Array.isArray(samples)||samples.length<1)throw new TypeError('Temporal forecast requires at least one sample');
  if(!Number.isFinite(margin)||margin<0||!Number.isFinite(threshold))throw new TypeError('Invalid temporal forecast margin or threshold');
  const count=samples.length,N=NX*NY,times=new Float64Array(count),rasters=new Array(count);
  if(!Number.isSafeInteger(N))throw new RangeError('Temporal forecast grid is too large');
  for(let i=0;i<count;i++){
    const {time,sampler}=samples[i];
    if(!Number.isFinite(time)||(i>0&&time<=times[i-1]))throw new RangeError('Forecast times must be finite and strictly increasing');
    if(!sampler||(!sampler.evaluateGrid&&!sampler.evaluateValue))throw new TypeError('Forecast sample requires a scalar field sampler');
    times[i]=time;
    const raster=new Float32Array(N);
    if(sampler.evaluateGrid)sampler.evaluateGrid(X0,Y0,H,NX,NY,raster);
    else for(let y=0,k=0;y<NY;y++)for(let x=0;x<NX;x++,k++)raster[k]=sampler.evaluateValue(X0+x*H,Y0+y*H);
    for(let k=0;k<N;k++)if(!Number.isFinite(raster[k]))throw new RangeError(`Nonfinite forecast field at sample ${i}, cell ${k}`);
    rasters[i]=raster;
  }
  // A compact successor table makes each query O(cells), regardless of how
  // many closing/reopening intervals occur later in the forecast.
  const Index=count<=255?Uint8Array:count<=65535?Uint16Array:Uint32Array;
  const nextWhite=new Index((count+1)*N);
  nextWhite.fill(count,count*N);
  for(let i=count-1;i>=0;i--){
    const row=i*N,next=(i+1)*N,raster=rasters[i];
    for(let k=0;k<N;k++)nextWhite[row+k]=raster[k]>threshold?i:nextWhite[next+k];
  }
  function closeTimesAt(time,currentRaster,out=new Float64Array(N)){
    if(!Number.isFinite(time)||time<times[0]-1e-9||time>times[count-1]+1e-9)
      throw new RangeError('Current time lies outside the cached forecast horizon');
    if(!currentRaster||currentRaster.length!==N||out.length!==N)throw new RangeError('Temporal raster length mismatch');
    let lo=0,hi=count;
    while(lo<hi){const mid=(lo+hi)>>>1;if(times[mid]<=time+1e-9)lo=mid+1;else hi=mid;}
    const row=lo*N;
    for(let k=0;k<N;k++){
      const current=currentRaster[k];
      if(!Number.isFinite(current))throw new RangeError(`Nonfinite current field at cell ${k}`);
      if(current>threshold){out[k]=time;continue;}
      const closing=nextWhite[row+k];
      if(closing===count){out[k]=Infinity;continue;}
      // The crossing lies before the first white sample. Use the start of
      // that interval with an extra safety margin, never a fabricated linear
      // interpolation of a potentially nonmonotone field.
      const intervalStart=closing>0?times[closing-1]:time;
      out[k]=Math.max(time,intervalStart-margin);
    }
    return out;
  }
  return{closeTimesAt,firstTime:times[0],lastTime:times[count-1],sampleCount:count,cellCount:N};
}
