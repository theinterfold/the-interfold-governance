/** Area of the positive part of a linearly interpolated triangle.
 * Continuous in the corner values: no whole-cell toggles at the contour. */
function fraction(a,b,c){
  if(a>=0&&b>=0&&c>=0)return 1;
  if(a<=0&&b<=0&&c<=0)return 0;
  if(a>0&&b<=0&&c<=0)return a/(a-b)*a/(a-c);
  if(b>0&&a<=0&&c<=0)return b/(b-a)*b/(b-c);
  if(c>0&&a<=0&&b<=0)return c/(c-a)*c/(c-b);
  if(a<0)return 1-a/(a-b)*a/(a-c);
  if(b<0)return 1-b/(b-a)*b/(b-c);
  return 1-c/(c-a)*c/(c-b);
}

export function levelSetArea(values,nx,ny,h,threshold=1){
  let sum=0;
  for(let y=0;y<ny-1;y++)for(let x=0;x<nx-1;x++){
    const k=y*nx+x,a=values[k]-threshold,b=values[k+1]-threshold,
      c=values[k+nx]-threshold,d=values[k+nx+1]-threshold;
    // Average the two diagonals to avoid a preferred grid direction.
    sum+=fraction(a,b,d)+fraction(a,c,d)+fraction(a,b,c)+fraction(b,c,d);
  }
  return sum*h*h*.25;
}
