import {expect,test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {particleHull,cursorRegionAmount,createCursorPresence,CURSOR_EXIT_MS} from '../motion/govern/cursor-interaction.js';

test('full cursor covers every real grain, including those outside the former ellipse',()=>{
  const bytes=gunzipSync(readFileSync(new URL('../public/govern-compact/points.bin.gz',import.meta.url)));
  const points=[];let x=0,y=0;
  for(let i=0;i<bytes.length;i+=5){x+=bytes.readInt16LE(i);y+=bytes.readInt16LE(i+2);points.push([x/64,y/64]);}
  const hull=particleHull(points);let formerlyMissed=0,lowerRight=0;
  for(const [x,y] of points){
    expect(cursorRegionAmount(x,y,hull)).toBe(1);
    if((x-300)**2/235**2+(y-225)**2/190**2>=1){formerlyMissed++;if(x>300&&y>225)lowerRight++;}
  }
  expect(formerlyMissed).toBeGreaterThan(0);expect(lowerRight).toBeGreaterThan(0);
  expect(cursorRegionAmount(1000,1000,hull)).toBe(0);
});

test('activation includes a full-radius margin and a continuous outer band',()=>{
  const hull=particleHull([[0,0],[100,0],[100,100],[0,100],[50,50]]);
  expect(cursorRegionAmount(120,50,hull)).toBe(1);
  expect(cursorRegionAmount(128,50,hull)).toBe(1);
  expect(cursorRegionAmount(144,50,hull)).toBeCloseTo(.5);
  expect(cursorRegionAmount(160,50,hull)).toBe(0);
});

test('exit follows elapsed time identically at 30/60/120 Hz, without delaying pointer position',()=>{
  for(const hz of [30,60,120]){
    const presence=createCursorPresence();presence.move(300,225,1,0);presence.leave(0);
    expect(presence.sample(80).r).toBeGreaterThan(10);
    for(let t=1000/hz;t<CURSOR_EXIT_MS;t+=1000/hz){
      const cursor=presence.sample(t);expect(cursor.r).toBeGreaterThanOrEqual(0);expect(cursor.r).toBeLessThan(20);
    }
    expect(presence.sample(CURSOR_EXIT_MS).r).toBe(0);
    presence.move(450,350,1,401);expect(presence.sample(401)).toEqual({x:450,y:350,r:20});
    presence.leave(402);presence.reset();expect(presence.sample(403).r).toBe(0);
  }
});
