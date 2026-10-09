/** Exact f64 pressure solve in WASM. The active mask and field retain the
 * original 228×178 discretization and 20-step PCG stopping rule. */
export async function createPoissonWasm(options={}){
  if(!options.staggeredPressure||options.dynamicFluidMask)throw Error('WASM pressure requires the fixed staggered active mask');
  const url=new URL('./full-cg.wasm',import.meta.url);
  const bytes=url.protocol==='file:'?await(await import('node:fs/promises')).readFile(url):await fetch(url).then(response=>{
    if(!response.ok)throw Error(`WASM pressure fetch failed: ${response.status}`);
    return response.arrayBuffer();
  });
  const {instance}=await WebAssembly.instantiate(bytes),w=instance.exports;
  const N=228*178,nx=228,ny=178;
  if(w.bytesRequired()>w.memory.buffer.byteLength)w.memory.grow(Math.ceil((w.bytesRequired()-w.memory.buffer.byteLength)/65536));
  const f64=slot=>new Float64Array(w.memory.buffer,w.pointer(slot),N);
  const f32=slot=>new Float32Array(w.memory.buffer,w.pointer(slot),N);
  const u8=slot=>new Uint8Array(w.memory.buffer,w.pointer(slot),N);
  const u32=slot=>new Uint32Array(w.memory.buffer,w.pointer(slot),N);
  const currentView=f64(0),targetView=f64(1),activeView=u8(14),dx=f32(16),dy=f32(17);
  const all=u32(18),interior=u32(19),boundary=u32(20);
  let knownMask=null;
  function prepareActive(mask){
    if(mask===knownMask)return;
    let allN=0,interiorN=0,boundaryN=0;
    for(let k=0;k<N;k++)if(mask[k]){
      all[allN++]=k;
      const x=k%nx,y=(k/nx)|0;
      if(x>0&&x<nx-1&&y>0&&y<ny-1)interior[interiorN++]=k;
      else boundary[boundaryN++]=k;
    }
    w.configure(allN,interiorN,boundaryN);knownMask=mask;
  }
  return{
    backendType:'wasm-f64',
    solve(current,target,activeMask,totalMass,maxIterations=70){
      if(current.length!==N||target.length!==N||activeMask.length!==N)throw Error('WASM pressure grid size mismatch');
      prepareActive(activeMask);
      currentView.set(current);targetView.set(target);activeView.set(activeMask);
      const iterations=w.solve(totalMass,maxIterations);
      return{dx,dy,iterations,residual:w.residual(),initialResidual:w.initialResidual()};
    },
    reset(){w.reset();},
  };
}
