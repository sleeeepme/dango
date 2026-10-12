const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function game(width = 390, height = 844) {
  let now = 0;
  const listeners = {};
  const elements = {};
  const gradient = {addColorStop() {}};
  let capture=false,currentPath=[];
  const filledPaths=[];
  const drawing = new Proxy({}, {
    get: (_, name) => name.startsWith('create') ? () => gradient : (...args) => {
      if(!capture)return;
      if(name==='beginPath')currentPath=[];
      if(['moveTo','lineTo','quadraticCurveTo','closePath'].includes(name))currentPath.push([name,...args]);
      if(name==='fill')filledPaths.push(currentPath.map(part=>[...part]));
    },
    set: () => true,
  });
  for (const id of ['canvas','boost']) {
    elements[id] = {
      style: {setProperty() {}},
      addEventListener(type, handler) {listeners[id + ':' + type] = handler;},
      setPointerCapture() {}, setAttribute() {}, getContext: () => drawing,
    };
  }
  const context = {
    document: {
      querySelector: () => elements.canvas,
      getElementById: id => elements[id],
      addEventListener(type, handler) {listeners['document:' + type] = handler;},
    },
    innerWidth: width, innerHeight: height, devicePixelRatio: 2,
    addEventListener(type, handler) {listeners['window:' + type] = handler;},
    performance: {now: () => now},
    requestAnimationFrame() {}, console,
  };
  vm.createContext(context);
  const source = fs.readFileSync(path.join(__dirname, '../game.js'), 'utf8');
  const hook = '  requestAnimationFrame(frame);\n})();';
  assert.ok(source.endsWith(hook + '\n'), 'Update the test harness for changed entry point');
  vm.runInContext(source.replace(hook,
    '  globalThis.test = {player,camera,rows,loot,update,frame,resize,collision,restY,boost,fauna,pickupPops,drawSlab,palettes,forms,evolution,drawPlayer,WORLD_WIDTH,STEP_MS,' +
    'controls:(l,r)=>{left=l;right=r},charge:v=>charge=v,state:()=>({drag,left,right,charge,score,ticks})};\n})();'), context);
  return {
    ...context.test,
    elements,
    captureSlab(slab,x,y){
      filledPaths.length=0;capture=true;context.test.camera.x=x;context.test.camera.y=y;
      try{context.test.drawSlab(slab,context.test.palettes[0]);}
      finally{capture=false;}
      return filledPaths[0];
    },
    step(n = 1) {for (let i = 0; i < n; i++) {now += 1000/60;context.test.update();}},
    event(id, type, args = {}, time = now) {
      now = time;
      listeners[id + ':' + type]({pointerId: 1,clientX: 195,clientY: 300,preventDefault(){},...args});
    },
    resizeTo(w,h) {context.innerWidth=w;context.innerHeight=h;context.test.resize();},
    settle() {this.step(120);},
  };
}

test('wide floors require horizontal exploration between successive exits', () => {
  const t=game();assert.equal(t.WORLD_WIDTH,2240);
  assert.ok(t.rows[0].gapX-t.player.x>390/2);
  for(let i=1;i<t.rows.length;i++){
    const a=t.rows[i-1],b=t.rows[i];
    assert.ok(Math.abs(a.gapX-b.gapX)>400);
    assert.ok(b.gapWidth>t.player.r*4);
  }
  assert.ok(t.rows.every(r=>r.slabs.length===2));
});
test('player rests on flat ground and shallow humps without drift', () => {
  const t=game();t.settle();
  const start={...t.player};t.step(600);
  assert.equal(t.player.x,start.x);assert.equal(t.player.y,start.y);
  assert.equal(t.player.vx,0);assert.equal(t.player.vy,0);
  const s=t.rows.flatMap(r=>r.walls).find(s=>s.top&&s.y!==s.y2);
  assert.ok(s);
  t.player.x=(s.x+s.x2)/2;t.player.y=t.restY(s,t.player.x);t.player.ground=s;
  const x=t.player.x,y=t.player.y;t.step(600);
  assert.equal(t.player.x,x);assert.equal(t.player.y,y);
});
test('keyboard direction input moves and releasing it stops on the floor', () => {
  for(const direction of [-1,1]){
    const t=game();t.settle();const start=t.player.x;
    t.event('window','keydown',{key:direction<0?'ArrowLeft':'ArrowRight'});t.step(25);
    assert.ok((t.player.x-start)*direction>80);
    t.event('window','keyup',{key:direction<0?'ArrowLeft':'ArrowRight'});t.step(120);
    assert.equal(t.player.vx,0);assert.equal(t.player.vy,0);
    assert.ok(t.player.ground);
  }
});
test('holding horizontal drag explores and slow upward drag never lifts', () => {
  const t=game();t.settle();const startX=t.player.x,startY=t.player.y;
  t.event('canvas','pointerdown');
  for(let i=0;i<120;i++){
    t.event('canvas','pointermove',{clientY:300-80*(i+1)/120});t.step();
  }
  assert.equal(t.player.y,startY);
  t.event('canvas','pointermove',{clientX:260,clientY:220});t.step(25);
  assert.ok(t.player.x>startX+80);
  t.event('canvas','pointercancel');assert.equal(t.state().drag,null);
});
test('quick upward flick jumps, slow or stale releases do not', () => {
  for(const [duration,pause,jump] of [[50,1,true],[500,1,false],[50,200,false]]){
    const t=game();t.settle();
    t.event('canvas','pointerdown',{},2000);
    t.event('canvas','pointermove',{clientY:220},2000+duration);
    t.event('canvas','pointerup',{clientY:220},2000+duration+pause);
    if(jump){assert.equal(t.player.vy,-11);assert.equal(t.player.ground,null);}
    else assert.equal(t.player.vy,0);
  }
});
test('ceiling collision bounces and boost still requires 100 percent', () => {
  const t=game();Object.assign(t.player,{x:1100,y:375,vx:0,vy:-15,ground:null});
  t.step(2);assert.ok(t.player.vy>0);
  t.settle();t.charge(99);t.boost();assert.equal(t.state().charge,99);
  t.charge(100);t.boost();assert.equal(t.state().charge,0);assert.equal(t.player.vy,-12.5);
  assert.equal(t.player.ground,null);
});
test('walking to an exit descends and following exits require a turn', () => {
  const t=game();t.settle();t.controls(false,true);
  t.step(110);
  assert.ok(t.player.y>t.rows[0].y+100,'Player should descend through opening');
  t.controls(false,false);t.step(180);
  assert.ok(t.player.ground);
  assert.ok(t.player.y>t.rows[1].y-40);
  assert.ok(t.camera.x>900);assert.ok(t.camera.y>0);
  const floor=t.player.ground, y=t.player.y;t.step(180);
  assert.equal(t.player.ground,floor);assert.equal(t.player.y,y);
  assert.ok(t.rows[1].gapX<t.player.x-390,'Next opening is outside the viewport');
});
test('items and caterpillars preserve collection and movement', () => {
  const t=game();const o=t.loot[0];
  Object.assign(t.player,{x:o.x,y:o.y,vx:0,vy:0,ground:null});t.step();
  assert.equal(o.got,true);assert.equal(t.state().score,1);assert.ok(t.state().charge>=7);
  const bug=t.loot.find(o=>o.bug),x=bug.x;
  t.player.y=bug.y;t.step(20);assert.notEqual(bug.x,x);
});
test('30, 60 and 120 Hz frames run identical elapsed-time physics', () => {
  const states=[];
  for(const hz of [30,60,120]){
    const t=game();t.settle();t.controls(false,true);t.frame(0);
    for(let i=1;i<=hz;i++)t.frame(i*1000/hz);
    states.push([t.player.x,t.player.y,t.player.vx,t.state().ticks]);
  }
  assert.deepEqual(states[0],states[1]);assert.deepEqual(states[1],states[2]);
});
test('resize preserves world and progress; blur releases all inputs', () => {
  const t=game();t.settle();const x=t.player.x,y=t.player.y,gap=t.rows[0].gapX;
  t.resizeTo(844,390);assert.equal(t.player.x,x);assert.equal(t.player.y,y);
  assert.equal(t.rows[0].gapX,gap);assert.equal(t.rows[0].slabs[1].end,2240);
  t.controls(false,true);t.event('canvas','pointerdown');t.event('window','blur');
  assert.equal(t.state().right,false);assert.equal(t.state().drag,null);
  t.frame(0);t.event('document','visibilitychange');t.frame(10000);
  assert.equal(t.state().ticks,120,'Returning from background must not simulate paused time');
});
test('deeper exploration extends the map without a lethal bottom', () => {
  const t=game(),count=t.rows.length;
  Object.assign(t.player,{y:t.rows[count-3].y,ground:null});
  t.step();assert.ok(t.rows.length>count);
});

test('fastest jump has a short gravity arc, lands, and cannot reset mid-air', () => {
  const t=game();t.settle();const startY=t.player.y;
  t.event('canvas','pointerdown',{},2000);
  t.event('canvas','pointermove',{clientY:220},2050);
  t.event('canvas','pointerup',{clientY:220},2051);
  t.step(8);const vy=t.player.vy;
  t.event('canvas','pointerdown',{},2200);
  t.event('canvas','pointermove',{clientY:220},2250);
  t.event('canvas','pointerup',{clientY:220},2251);
  assert.equal(t.player.vy,vy,'Repeated airborne flick must not provide another jump');
  let minY=t.player.y;
  for(let i=0;i<90;i++){t.step();minY=Math.min(minY,t.player.y);}
  assert.ok(startY-minY>=85&&startY-minY<=110,'The jump should rise about 100px');
  assert.equal(t.player.y,startY);assert.ok(t.player.ground);assert.equal(t.player.vy,0);
});

test('larger treasure is reachable from the floor and displays a pickup picture', () => {
  const t=game();const o=t.loot.find(o=>!o.bug);
  const surface=t.rows[o.row].walls.find(s=>s.top&&o.x>=s.x&&o.x<=s.x2);
  Object.assign(t.player,{x:o.x+28,y:t.restY(surface,o.x+28),ground:surface,vx:0,vy:0});
  t.step();
  assert.equal(o.got,true);assert.equal(t.state().score,1);
  assert.equal(t.pickupPops.length,1);
  assert.equal(t.pickupPops[0].kind,o.kind);
  t.step(60);assert.equal(t.pickupPops.length,0);
});

test('friendly beetles, mantises and animals move safely on solid floors', () => {
  const t=game();
  const kinds=new Set(t.fauna.map(o=>o.kind));
  for(const kind of ['beetle','stag','mantis','ladybug','frog','snail','butterfly'])assert.ok(kinds.has(kind));
  assert.deepEqual(Array.from(t.fauna.filter(o=>o.row===0).map(o=>o.kind)),['beetle','stag','mantis']);
  for(const item of t.loot)item.got=true; // Isolate greeting from nearby treasure.
  const animal=t.fauna.find(o=>o.kind==='beetle'),oldX=animal.x;
  Object.assign(t.player,{x:animal.x,y:animal.y-20,vx:0,vy:0,ground:null});
  t.step(30);
  assert.notEqual(animal.x,oldX);assert.ok(animal.hello>0.5);
  assert.ok(t.player.ground);assert.equal(t.state().score,0,'Friends should not disappear as collectibles');
  for(const o of t.fauna){
    const row=t.rows[o.row];
    assert.ok(o.baseX+18<row.gapX||o.baseX-18>row.gapX+row.gapWidth);
  }
  // Exercise every drawing at its own depth using the actual frame function.
  for(const kind of kinds){
    const o=t.fauna.find(o=>o.kind===kind);
    t.player.y=o.y-20;t.player.x=o.x;t.player.ground=null;t.resizeTo(390,844);t.frame(0);
  }
});

test('quick sideways flicks launch in both directions and naturally settle', () => {
  for(const direction of [-1,1]){
    const t=game();t.settle();const startX=t.player.x,startY=t.player.y;
    t.event('canvas','pointerdown',{},2000);
    t.event('canvas','pointermove',{clientX:195+direction*90},2050);
    t.event('canvas','pointerup',{clientX:195+direction*90},2051);
    assert.equal(t.player.vx,14*direction);assert.equal(t.player.vy,-7);
    assert.equal(t.player.ground,null);
    t.step(10);
    assert.ok((t.player.x-startX)*direction>100,'Release momentum must persist');
    assert.ok(startY-t.player.y>30&&startY-t.player.y<50,'Sideways launch must stay low');
    t.step(150);
    assert.equal(t.player.vx,0);assert.equal(t.player.vy,0);assert.ok(t.player.ground);
    assert.equal(t.player.y,startY);
  }
});
test('slow, stale or cancelled sideways gestures do not launch', () => {
  for(const [duration,pause,type] of [[500,1,'pointerup'],[50,200,'pointerup'],[50,1,'pointercancel']]){
    const t=game();t.settle();
    t.event('canvas','pointerdown',{},2000);
    t.event('canvas','pointermove',{clientX:285},2000+duration);
    t.event('canvas',type,{clientX:285},2000+duration+pause);
    assert.equal(t.player.vy,0);assert.equal(t.player.vx,0);
    assert.ok(t.player.ground);assert.equal(t.state().drag,null);
  }
});
test('sideways flick can steer in the air without adding upward force', () => {
  const t=game();t.settle();
  t.event('canvas','pointerdown',{},2000);
  t.event('canvas','pointermove',{clientY:220},2050);
  t.event('canvas','pointerup',{clientY:220},2051);
  t.step(8);const vy=t.player.vy;
  t.event('canvas','pointerdown',{},2200);
  t.event('canvas','pointermove',{clientX:105},2250);
  t.event('canvas','pointerup',{clientX:105},2251);
  assert.equal(t.player.vy,vy);assert.equal(t.player.vx,-14);
  assert.equal(t.player.ground,null);
});

test('platform underside keeps the same world shape while the camera moves', () => {
  const t=game(),slab=t.rows[0].slabs[0];
  const shapeAt=(x,y)=>{
    const shape=t.captureSlab(slab,x,y);
    return shape.map(([op,...coords])=>[op,...coords.map((v,i)=>v+(i%2?y:x))]);
  };
  const baseline=shapeAt(0,0);
  for(const [x,y] of [[0.0001,0.0002],[0.03,0.07],[5,11],[37.7,48.3]]){
    const actual=shapeAt(x,y);
    assert.equal(actual.length,baseline.length);
    for(let i=0;i<baseline.length;i++){
      assert.equal(actual[i][0],baseline[i][0]);
      for(let j=1;j<baseline[i].length;j++)
        assert.ok(Math.abs(actual[i][j]-baseline[i][j])<1e-7,'Camera motion must only translate the platform');
    }
  }
  t.step(120);
  assert.deepEqual(shapeAt(0,0),baseline,'Animation ticks must not reshape terrain');
});

test('only crystals evolve the player at every five pickups, with no duplicate counting', () => {
  const t=game();t.settle();for(const item of t.loot)item.got=true;
  const collect=kind=>{
    const item={x:t.player.x,y:t.player.y,got:false,kind,row:0,phase:0};
    t.loot.push(item);t.step();return item;
  };
  collect(0);collect(1);assert.equal(t.evolution.crystals,0);assert.equal(t.evolution.stage,0);
  for(let count=1;count<=30;count++){
    const item=collect(2);
    assert.equal(item.got,true);assert.equal(t.evolution.crystals,count);
    assert.equal(t.evolution.stage,Math.min(5,Math.floor(count/5)));
    t.step(2);assert.equal(t.evolution.crystals,count,'Already collected crystal must not count again');
    if(count%5===0)assert.ok(t.evolution.pulse>0);
  }
  assert.equal(t.forms[t.evolution.stage].id,'ultra');
  t.step(130);assert.equal(t.evolution.pulse,0);assert.equal(t.evolution.stage,5);
});

test('all evolution forms render and retain jump, flick and collision behavior', () => {
  const t=game();t.settle();
  const ids=['normal','robot','super','dragon','rider','ultra'];
  assert.deepEqual(Array.from(t.forms.map(f=>f.id)),ids);
  for(let stage=0;stage<ids.length;stage++){
    t.evolution.stage=stage;t.evolution.crystals=stage*5;t.evolution.pulse=70;
    t.drawPlayer();
    assert.equal(t.player.r,20);
    t.event('canvas','pointerdown',{},2000);
    t.event('canvas','pointermove',{clientY:220},2050);
    t.event('canvas','pointerup',{clientY:220},2051);
    assert.equal(t.player.vy,-11);assert.equal(t.player.ground,null);
    t.step(100);assert.equal(t.player.vy,0);assert.ok(t.player.ground);
    t.event('canvas','pointerdown',{},4000);
    t.event('canvas','pointermove',{clientX:285},4050);
    t.event('canvas','pointerup',{clientX:285},4051);
    assert.equal(t.player.vx,14);assert.equal(t.player.vy,-7);
    t.step(160);
    // Return to the same solid surface for the next form's input checks.
    const s=t.rows[0].walls.find(s=>s.top&&1060>=s.x&&1060<=s.x2);
    Object.assign(t.player,{x:1060,y:t.restY(s,1060),vx:0,vy:0,ground:s});
    t.step();
  }
});

test('crystals appear on the first floor and throughout extended maps', () => {
  const t=game();
  for(const row of t.rows){
    const crystals=t.loot.filter(o=>o.row===row.index&&!o.bug&&o.kind===2);
    assert.ok(crystals.length>=3,'Every floor needs enough visible collectible crystals');
    for(const item of crystals)
      assert.ok(row.walls.some(s=>s.top&&item.x>=s.x&&item.x<=s.x2));
  }
});
