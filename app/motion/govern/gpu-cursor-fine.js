export const fineWgsl=`
struct FineCell { reference:f32,desiredDensity:f32,error:f32,temp:f32,vx:f32,vy:f32 };
@group(0) @binding(6) var<storage,read_write> fineGrid:array<FineCell>;
@group(0) @binding(7) var<storage,read_write> deposited:array<atomic<u32>>;
@compute @workgroup_size(128) fn fineTarget(@builtin(global_invocation_id) id:vec3<u32>){
 let k=id.x;if(k>=p.fnx*p.fny){return;}let pos=vec2<f32>(p.fx0+f32(k%p.fnx),p.fy0+f32(k/p.fnx));
 let baseReference=referenceAt(pos);let hit=evaluateAt(pos,1u);let u=clamp(.5+hit.gap,0.,1.);
 fineGrid[k].reference=baseReference;fineGrid[k].desiredDensity=baseReference*u*u*(3.-2.*u)*p.massScale;
}
@compute @workgroup_size(128) fn fineDeposit(@builtin(global_invocation_id) id:vec3<u32>){
 let i=id.x;if(i>=p.count){return;}let a=i*3u;
 let pos=clamp(vec2<f32>(particles[a],particles[a+1u]),vec2<f32>(p.cx0,p.cy0),vec2<f32>(p.cx0+(f32(p.cnx)-1.)*p.ch-0.001,p.cy0+(f32(p.cny)-1.)*p.ch-0.001));
 let f=pos-vec2<f32>(p.fx0,p.fy0);if(f.x<0.||f.y<0.||f.x>=f32(p.fnx)-1.||f.y>=f32(p.fny)-1.){return;}
 let ij=vec2<u32>(f);let uv=fract(f);let k=ij.y*p.fnx+ij.x;let mass=particles[a+2u]*particles[a+2u]*1048576.;
 atomicAdd(&deposited[k],u32(round(mass*(1.-uv.x)*(1.-uv.y))));atomicAdd(&deposited[k+1u],u32(round(mass*uv.x*(1.-uv.y))));
 atomicAdd(&deposited[k+p.fnx],u32(round(mass*(1.-uv.x)*uv.y)));atomicAdd(&deposited[k+p.fnx+1u],u32(round(mass*uv.x*uv.y)));
}
@compute @workgroup_size(128) fn fineError(@builtin(global_invocation_id) id:vec3<u32>){let k=id.x;if(k>=p.fnx*p.fny){return;}fineGrid[k].error=f32(atomicLoad(&deposited[k]))/1048576.-fineGrid[k].desiredDensity;}
@compute @workgroup_size(128) fn fineBlurX(@builtin(global_invocation_id) id:vec3<u32>){
 let k=id.x;if(k>=p.fnx*p.fny){return;}let x=k%p.fnx;let y=k/p.fnx;var v=fineGrid[k].error;
 if(x>0u&&x<p.fnx-1u&&y>0u&&y<p.fny-1u){v=(fineGrid[k-1u].error+2.*v+fineGrid[k+1u].error)*.25;}fineGrid[k].temp=v;
}
@compute @workgroup_size(128) fn fineBlurY(@builtin(global_invocation_id) id:vec3<u32>){
 let k=id.x;if(k>=p.fnx*p.fny){return;}let x=k%p.fnx;let y=k/p.fnx;var v=fineGrid[k].temp;
 if(x>0u&&x<p.fnx-1u&&y>0u&&y<p.fny-1u){v=(fineGrid[k-p.fnx].temp+2.*v+fineGrid[k+p.fnx].temp)*.25;}fineGrid[k].error=v;
}
@compute @workgroup_size(128) fn fineGradient(@builtin(global_invocation_id) id:vec3<u32>){
 let k=id.x;if(k>=p.fnx*p.fny){return;}fineGrid[k].vx=0.;fineGrid[k].vy=0.;if(k%p.fnx<p.fnx-1u&&k/p.fnx<p.fny-1u){fineGrid[k].vx=fineGrid[k].error-fineGrid[k+1u].error;fineGrid[k].vy=fineGrid[k].error-fineGrid[k+p.fnx].error;}
}
fn fineValue(k:u32,ch:u32)->f32{if(ch==0u){return fineGrid[k].reference;}if(ch==1u){return fineGrid[k].vx;}return fineGrid[k].vy;}
fn fineSample(pos:vec2<f32>,ch:u32)->f32{
 let f=clamp(pos-vec2<f32>(p.fx0,p.fy0),vec2<f32>(0.),vec2<f32>(f32(p.fnx)-1.001,f32(p.fny)-1.001));let ij=vec2<u32>(f);let uv=fract(f);let k=ij.y*p.fnx+ij.x;
 return mix(mix(fineValue(k,ch),fineValue(k+1u,ch),uv.x),mix(fineValue(k+p.fnx,ch),fineValue(k+p.fnx+1u,ch),uv.x),uv.y);
}
@compute @workgroup_size(128) fn fineGather(@builtin(global_invocation_id) id:vec3<u32>){
 let i=id.x;if(i>=p.count){return;}let k=i*3u;let pos=vec2<f32>(particles[k],particles[k+1u]);if(pos.x<p.frx0||pos.x>p.frx1||pos.y<p.fry0||pos.y>p.fry1){return;}
 let gain=p.fineStrength/max(.04,fineSample(pos,0u)*p.massScale);var delta=gain*vec2<f32>(fineSample(pos-vec2<f32>(.5,0.),1u),fineSample(pos-vec2<f32>(0.,.5),2u));
 let distance=length(delta);if(distance>p.maxCorrection){delta*=p.maxCorrection/distance;}if(distance<=1e-6){return;}
 let next=afterMove(pos,delta);particles[k]=next.x;particles[k+1u]=next.y;
}
`;
