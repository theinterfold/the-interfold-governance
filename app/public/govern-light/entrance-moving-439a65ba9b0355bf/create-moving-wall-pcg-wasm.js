/** Same f64 cut-cell operator and IC(0)+PCG convergence as the JS predictor. */
export async function createMovingWallPcgWasm(options={}){
 const url=options.url??new URL('./pcg-ic0-flat.wasm',import.meta.url);
 const bytes=options.bytes??(url.protocol==='file:'?await(await import('node:fs/promises')).readFile(url):await fetch(url).then(r=>{
  if(!r.ok)throw new Error('Moving-wall PCG fetch failed: '+r.status);
  return r.arrayBuffer();
 }));
 const {instance}=await WebAssembly.instantiate(bytes),w=instance.exports;
 return {
  backendType:'wasm-f64-ic0',
  solve({nx,active,ids,right,down,diag,rhs,phi,warmAvailable=false,warmScale=1,maxIterations=120,tolerance=.005,preconditioner='ic0'}){
   const start=performance.now(),n=rhs.length;
   if(nx<3||n%nx||active.length!==n||right.length!==n||down.length!==n||diag.length!==n||phi.length!==n)throw new Error('Moving-wall PCG grid mismatch');
   w.configure(n,nx,ids.length);
   const needed=w.bytesRequired();if(needed>w.memory.buffer.byteLength)w.memory.grow(Math.ceil((needed-w.memory.buffer.byteLength)/65536));
   const f64=slot=>new Float64Array(w.memory.buffer,w.pointer(slot),n);
   f64(0).set(right);f64(1).set(down);f64(2).set(diag);f64(3).set(rhs);
   if(warmAvailable)f64(4).set(phi);
   new Int32Array(w.memory.buffer,w.pointer(13),ids.length).set(ids);
   new Uint8Array(w.memory.buffer,w.pointer(14),n).set(active);
   const copied=performance.now(),iterations=w.solve(maxIterations,tolerance,warmAvailable,warmScale,preconditioner==='jacobi'),solved=performance.now();
   phi.set(f64(4));
   const residual=w.residual(),norm2=w.norm2();
   return {phi,iterations,residual,norm2,relativeResidual:residual/Math.max(1e-12,Math.sqrt(norm2)),
    factorClamped:w.factorClamped(),warmAccepted:!!w.warmAccepted(),warmInitialRelativeResidual:w.warmResidual(),finitePotential:!!w.finitePotential(),
    stageMs:{copy:copied-start,kernel:solved-copied,readback:performance.now()-solved},ms:performance.now()-start};
  }
 };
}
