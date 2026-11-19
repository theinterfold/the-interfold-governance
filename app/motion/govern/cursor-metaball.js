// Geometry travels with each solved frame, including the interactive vacancy.
export function packCursorHoles(state){
  return Float32Array.from(state.circles.flatMap((hole,i)=>[
    hole.x,hole.y,hole.r*(state.whiteSize??1)-(state.shrinks?.[i]??0),
  ]));
}
