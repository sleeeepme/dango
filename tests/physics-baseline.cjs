// Current implementation baseline. No browser or production code changes.
// Run: node --test tests/physics-baseline.cjs
const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs=require('fs'),vm=require('vm');
const src=fs.readFileSync(require('node:path').join(__dirname, '../game.js'),'utf8');
function game(w=390,h=844){
let now=0;const listeners={},elements={};
const draw=new Proxy({}, {get:()=>()=>{},set:()=>true});
for(const id of ['canvas','#hud','left','right','boost'])elements[id]={addEventListener:(type,fn)=>listeners[id+':'+type]=fn,setPointerCapture(){},getContext:()=>draw};
const ctx={document:{querySelector:s=>elements[s],getElementById:s=>elements[s]},innerWidth:w,innerHeight:h,devicePixelRatio:2,addEventListener(){},performance:{now:()=>now},requestAnimationFrame(){},console};
vm.createContext(ctx);
assert.ok(src.includes('loop()})();'), 'Update the harness when the game entry point changes');
vm.runInContext(src.replace('loop()})();','globalThis.test={p,walls,loot,update,collision,resize,buttons:(l,r)=>{left=l;right=r},charge:v=>charge=v,state:()=>({cam,charge,score,drag,left,right})};loop()})();'),ctx);
return {...ctx.test,step(n=1){for(let i=0;i<n;i++){now+=1000/60;ctx.test.update()}},event(id,type,x,y,t=now){now=t;listeners[id+':'+type]({clientX:x,clientY:y,pointerId:1,preventDefault(){}})},boost:()=>elements.boost.onclick(),width(v){ctx.innerWidth=v;ctx.test.resize()}}}
const round=p=>Object.fromEntries(Object.entries(p).map(([k,v])=>[k,Math.round(v*1000)/1000]));

test('flat terrain remains stationary for 600 updates', () => {
  const t=game(); t.step(600);
  assert.equal(t.p.x,195); assert.equal(t.p.vx,0);
  assert.ok(Math.abs(t.p.y-193)<0.01);
});
test('right and left controls move in the requested direction', () => {
  for(const direction of [-1,1]){
    const t=game(); t.step(120); t.buttons(direction<0,direction>0); t.step(15);
    assert.ok((t.p.x-195)*direction>40);
    t.buttons(false,false); t.step(180); assert.equal(t.p.vx,0);
  }
});
test('horizontal drag tracks target and cancellation clears drag', () => {
  const t=game(); t.step(120);
  t.event('canvas','pointerdown',195,193);
  t.event('canvas','pointermove',235,193); t.step(60);
  assert.ok(Math.abs(t.p.x-235)<1);
  t.event('canvas','pointercancel',235,193);
  assert.equal(t.state().drag,null);
});
test('fast upward release launches; slow and stale releases do not launch', () => {
  for(const [duration,pause,jump] of [[50,1,true],[500,1,false],[50,200,false]]){
    const t=game(); t.step(120);
    t.event('canvas','pointerdown',195,193,2000);
    t.event('canvas','pointermove',195,113,2000+duration);
    t.event('canvas','pointerup',195,113,2000+duration+pause);
    if(jump){ assert.equal(t.p.vy,-22); t.step(5); assert.ok(t.p.y<100); }
    else assert.ok(Math.abs(t.p.vy)<0.01);
  }
});
test('underside collision reflects upward velocity downwards', () => {
  const t=game(); Object.assign(t.p,{x:180,y:250,vx:0,vy:-15}); t.step(2);
  assert.ok(t.p.vy>0); assert.ok(t.p.y>247);
});
test('boost requires full energy and consumes it', () => {
  const t=game(); t.step(120); t.charge(99); t.boost();
  assert.ok(Math.abs(t.p.vy)<0.01); assert.equal(t.state().charge,99);
  t.charge(100); t.boost();
  assert.equal(t.p.vx,15); assert.equal(t.p.vy,-19); assert.equal(t.state().charge,0);
});
test('collectibles increase score and energy', () => {
  const t=game(); const o=t.loot.find(o=>!o.bug);
  Object.assign(t.p,{x:o.x,y:o.y,vx:0,vy:0}); t.step();
  assert.equal(o.got,true); assert.equal(t.state().score,1); assert.equal(t.state().charge,7);
});
// These diagnostics reproduce open issues; they are deliberately not passing
// assertions for the desired behavior. See docs/VERIFICATION.md.
test('report open physics issues for the existing implementation', context => {
  const slope=game();
  const s=slope.walls.find(s=>s.y===1472&&s.y2===1459);
  const dx=s.x2-s.x,dy=s.y2-s.y,len=Math.hypot(dx,dy);
  Object.assign(slope.p,{x:(s.x+s.x2)/2+dy/len*27,y:(s.y+s.y2)/2-dx/len*27,vx:0,vy:0});
  const startX=slope.p.x; slope.step(600);
  const slow=game(); slow.step(120); const startY=slow.p.y;
  slow.event('canvas','pointerdown',195,193);
  for(let i=0;i<120;i++){slow.event('canvas','pointermove',195,193-80*(i+1)/120);slow.step();}
  const rise=startY-slow.p.y; slow.step(180);
  const rates={};
  for(const hz of [30,60,120]){const t=game();t.step(120);t.buttons(false,true);t.step(Math.floor(hz*0.25));rates[hz]=+(t.p.x-195).toFixed(2);}
  const resized=game(); resized.width(844);
  context.diagnostic(JSON.stringify({
    slopeDriftAfter600Updates:+(slope.p.x-startX).toFixed(2),
    slowDragRiseAfter120Updates:+rise.toFixed(2),
    slowDragYAfterHold180Updates:+slow.p.y.toFixed(2),
    buttonDisplacementAtApproxQuarterSecond:rates,
    terrainMaxXAfterResizeTo844:Math.max(...resized.walls.flatMap(s=>[s.x,s.x2]))
  }));
});
