(() => {
  'use strict';

  const canvas = document.querySelector('canvas');
  const g = canvas.getContext('2d');
  const boostButton = document.getElementById('boost');
  const WORLD_WIDTH = 2240;
  const ROW_HEIGHT = 330;
  const FIRST_FLOOR = 320;
  const STEP_MS = 1000 / 60;
  const GRAVITY = 0.55;
  const JUMP_MIN = 8;
  const JUMP_MAX = 11;
  const BOOST_JUMP = 12.5;
  const palettes = [
    { name: 'こけの おにわ', back: '#afcfb7', far: '#dce7bb', soil: '#bc895e', dark: '#92654e', edge: '#d3e897', moss: '#86b452', glow: '#fff0ae' },
    { name: 'ねっこの もり', back: '#cfc4a5', far: '#eee2b7', soil: '#c19369', dark: '#a07056', edge: '#dde9a2', moss: '#9ab460', glow: '#fff0b3' },
    { name: 'あおい どうくつ', back: '#b2d0db', far: '#d8e9e5', soil: '#a6a5c0', dark: '#8585a5', edge: '#b5dde0', moss: '#86b9b0', glow: '#fff1c0' },
    { name: 'ひかる ちていこ', back: '#9ecbbb', far: '#cde6cd', soil: '#a2b8a0', dark: '#7a9585', edge: '#cbeca9', moss: '#78bc9c', glow: '#e6ffd0' },
    { name: 'こはくの おにわ', back: '#dabfae', far: '#f1d9bc', soil: '#bc8b80', dark: '#a4726d', edge: '#edda9e', moss: '#b3be73', glow: '#fff0b5' },
  ];
  const player = { x: 1060, y: 180, vx: 0, vy: 0, r: 20, ground: null };
  const camera = { x: 0, y: 0 };
  const rows = [];
  const loot = [];
  const motes = [];
  const fauna = [];
  const pickupPops = [];
  const species = ['beetle','stag','mantis','ladybug','frog','snail','butterfly'];
  let W = 390, H = 844, ticks = 0, spin = 0, charge = 0, score = 0;
  let left = false, right = false, drag = null, facing = 1;
  let lastTime = null, accumulator = 0, uiTick = -1, groundedTick = -Infinity;

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const noise = (a, b = 0) => {
    const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return n - Math.floor(n);
  };
  const paletteAt = y => palettes[Math.floor(Math.max(0, y) / 1800) % palettes.length];
  const floorY = i => FIRST_FLOOR + i * ROW_HEIGHT;
  const surfaceY = (s, x) => s.y + (x - s.x) * (s.y2 - s.y) / (s.x2 - s.x);
  const restY = (s, x) => surfaceY(s, x) - player.r * Math.hypot(1, (s.y2 - s.y) / (s.x2 - s.x));

  function resize() {
    W = innerWidth;
    H = innerHeight;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    camera.x = clamp(player.x - W / 2, 0, Math.max(0, WORLD_WIDTH - W));
    camera.y = Math.max(0, player.y - H * 0.4);
  }

  function makeSlab(row, start, end) {
    if (end - start < 60) return;
    const points = [{ x: start, y: row.y }];
    // Long resting areas interrupted by a few low, traversable humps.
    for (let x = start + 120; x < end - 140; x += 280) {
      const height = row.index === 0 ? 0 : (noise(x, row.index) > 0.54 ? -8 : 0);
      points.push({ x, y: row.y }, { x: x + 35, y: row.y + height },
        { x: x + 85, y: row.y + height }, { x: x + 120, y: row.y });
    }
    points.push({ x: end, y: row.y });
    const slab = { start, end, y: row.y, points, index: row.index };
    row.slabs.push(slab);
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      row.walls.push({ x: a.x, y: a.y, x2: b.x, y2: b.y, top: true });
    }
    row.walls.push(
      { x: start, y: row.y + 52, x2: end, y2: row.y + 52, top: false },
      { x: start, y: row.y, x2: start, y2: row.y + 52, top: false },
      { x: end, y: row.y, x2: end, y2: row.y + 52, top: false },
    );
  }

  function addRows(count) {
    const route = [1480, 520, 1740, 900, 1900, 650, 1320, 380];
    for (let n = 0; n < count; n++) {
      const index = rows.length, y = floorY(index);
      const gapX = route[index % route.length] + (index < 8 ? 0 : (noise(index, 6) - 0.5) * 100);
      const gapWidth = 166 + noise(index, 3) * 30;
      const row = { index, y, gapX, gapWidth, slabs: [], walls: [], discovered: false };
      makeSlab(row, 0, gapX);
      makeSlab(row, gapX + gapWidth, WORLD_WIDTH);
      rows.push(row);
      for (let x = 90; x < WORLD_WIDTH - 60; x += 155 + Math.round(noise(index, x) * 55)) {
        if (x > gapX - 30 && x < gapX + gapWidth + 30) continue;
        const s = row.walls.find(s => s.top && x >= s.x && x <= s.x2);
        if (s) loot.push({ x, y: surfaceY(s, x) - 43, got: false, kind: index % 3, row: index, phase: noise(x, index) * 6 });
      }
      // Friendly visitors are independent of collectible caterpillars.
      const positions = index === 0 ? [930, 1190, 1370] : [770, 1130, 1550];
      for (let j = 0; j < positions.length; j++) {
        let x = positions[j];
        if (x > gapX - 85 && x < gapX + gapWidth + 85) x = gapX > WORLD_WIDTH / 2 ? gapX - 125 - j * 110 : gapX + gapWidth + 130 + j * 110;
        const itemXs = loot.filter(o => o.row === index && !o.bug).map(o => o.x);
        const spaces = itemXs.slice(1).map((itemX, k) => (itemXs[k] + itemX) / 2)
          .filter(pos => (pos < gapX - 65 || pos > gapX + gapWidth + 65) &&
            fauna.every(a => a.row !== index || Math.abs(a.baseX - pos) > 100));
        if (spaces.length) x = spaces.reduce((best, pos) => Math.abs(pos - x) < Math.abs(best - x) ? pos : best);
        const surface = row.walls.find(w => w.top && x >= w.x && x <= w.x2);
        fauna.push({kind:species[(index * 3 + j) % species.length],x,baseX:x,y:surfaceY(surface,x),row:index,phase:noise(x,index)*6,hello:0});
      }
      if (index % 2 === 1) {
        const baseX = gapX > WORLD_WIDTH / 2 ? 700 : 1600;
        loot.push({ x: baseX, baseX, y: y - 17, got: false, bug: true, row: index, phase: index * 1.7 });
      }
    }
  }

  function nearbyRows(y = player.y) {
    const index = Math.floor((y - FIRST_FLOOR) / ROW_HEIGHT);
    return rows.slice(Math.max(0, index - 1), Math.max(2, index + 3));
  }

  function collision(s) {
    const dx = s.x2 - s.x, dy = s.y2 - s.y;
    const t = clamp(((player.x - s.x) * dx + (player.y - s.y) * dy) / (dx * dx + dy * dy), 0, 1);
    const nx = player.x - (s.x + t * dx), ny = player.y - (s.y + t * dy);
    const distance = Math.hypot(nx, ny);
    if (distance >= player.r) return;
    // A meaningful normal also handles an exactly coincident point.
    const ux = distance > 0.0001 ? nx / distance : 0;
    const uy = distance > 0.0001 ? ny / distance : -1;
    player.x += ux * (player.r - distance);
    player.y += uy * (player.r - distance);
    const normalVelocity = player.vx * ux + player.vy * uy;
    if (normalVelocity < 0) {
      const bounce = uy > 0.4 ? 0.72 : 0;
      player.vx -= (1 + bounce) * normalVelocity * ux;
      player.vy -= (1 + bounce) * normalVelocity * uy;
    }
    if (s.top && uy < -0.65 && player.x >= s.x && player.x <= s.x2 && player.vy > -1) {
      player.ground = s;
      player.y = restY(s, player.x);
      player.vy = 0;
    }
  }

  function groundAt(x, y) {
    for (const row of nearbyRows(y)) {
      for (const s of row.walls) {
        if (s.top && x >= s.x && x <= s.x2 && Math.abs(restY(s, x) - y) < 15) return s;
      }
    }
    return null;
  }

  function burst(x, y, color) {
    for (let i = 0; i < 7; i++) {
      const angle = i * Math.PI * 2 / 7;
      motes.push({ x, y, vx: Math.cos(angle) * 1.7, vy: Math.sin(angle) * 1.7 - 1, life: 34, color });
    }
  }

  function update() {
    ticks++;
    const direction = drag ? clamp((drag.x - drag.startX) / 65, -1, 1) : Number(right) - Number(left);
    const active = Math.abs(direction) > 0.08;
    if (active) {
      player.vx += direction * 0.48;
      player.vx *= 0.965;
      facing = direction < 0 ? -1 : 1;
    } else {
      player.vx *= player.ground ? 0.81 : 0.98;
      if (Math.abs(player.vx) < 0.08) player.vx = 0;
    }
    const horizontalLimit = !player.ground && !active ? 14 : 8.5;
    player.vx = clamp(player.vx, -horizontalLimit, horizontalLimit);
    player.vy = Math.min(18, player.vy + GRAVITY);

    const oldX = player.x;
    for (let step = 0; step < 5; step++) {
      player.x += player.vx / 5;
      if (player.ground && player.vy >= 0) {
        const support = groundAt(player.x, player.y);
        if (support) {
          player.ground = support;
          player.y = restY(support, player.x);
          player.vy = 0;
        } else player.ground = null;
      }
      if (!player.ground) player.y += player.vy / 5;
      for (const row of nearbyRows()) {
        if (player.y < row.y - 45 || player.y > row.y + 95) continue;
        for (const s of row.walls) collision(s);
      }
      if (player.x < player.r + 4) { player.x = player.r + 4; player.vx = Math.abs(player.vx) * 0.35; }
      if (player.x > WORLD_WIDTH - player.r - 4) { player.x = WORLD_WIDTH - player.r - 4; player.vx = -Math.abs(player.vx) * 0.35; }
      if (player.y < player.r + 4) { player.y = player.r + 4; player.vy = Math.abs(player.vy) * 0.72; }
    }
    if (player.ground) groundedTick = ticks;
    spin += (player.x - oldX) / player.r;
    charge = Math.min(100, charge + Math.abs(player.x - oldX) * 0.045);
    if (player.y > floorY(rows.length - 5)) addRows(20);
    const rowIndex = Math.max(0, Math.floor((player.y - FIRST_FLOOR + 55) / ROW_HEIGHT));
    for (const o of loot) {
      if (o.got || Math.abs(o.row - rowIndex) > 2) continue;
      if (o.bug) o.x = o.baseX + Math.sin(ticks * 0.025 + o.phase) * 45;
      if (Math.hypot(o.x - player.x, o.y - player.y) < (o.bug ? 34 : 44)) {
        o.got = true;
        score++;
        if (!o.bug) pickupPops.push({x:player.x,y:player.y-35,kind:o.kind,phase:o.phase,life:48});
        charge = Math.min(100, charge + 7);
        burst(o.x, o.y, paletteAt(o.y).glow);
      }
    }
    for (const animal of fauna) {
      if (Math.abs(animal.row - rowIndex) > 2) continue;
      animal.x = animal.baseX + Math.sin(ticks * 0.012 + animal.phase) * 18;
      const surface = rows[animal.row].walls.find(w => w.top && animal.x >= w.x && animal.x <= w.x2);
      animal.y = surfaceY(surface, animal.x);
      animal.hello += ((Math.hypot(animal.x - player.x, animal.y - 20 - player.y) < 80 ? 1 : 0) - animal.hello) * 0.08;
    }
    for (let i=pickupPops.length-1;i>=0;i--) {
      const pop=pickupPops[i];pop.y-=0.8;
      if(--pop.life<=0)pickupPops.splice(i,1);
    }
    for (let i = motes.length - 1; i >= 0; i--) {
      const m = motes[i]; m.x += m.vx; m.y += m.vy; m.vy += 0.03;
      if (--m.life <= 0) motes.splice(i, 1);
    }
    camera.x += (clamp(player.x - W / 2 + player.vx * 7, 0, Math.max(0, WORLD_WIDTH - W)) - camera.x) * 0.085;
    camera.y += (Math.max(0, player.y - H * 0.4) - camera.y) * 0.085;
    for (const row of nearbyRows()) {
      if (Math.abs(player.x - row.gapX - row.gapWidth / 2) < W * 0.5 && Math.abs(player.y - row.y) < 180) row.discovered = true;
    }
    if (ticks - uiTick >= 6) updateBoostUI();
  }

  function updateBoostUI() {
    uiTick = ticks;
    boostButton.disabled = charge < 100;
    boostButton.style.setProperty('--charge', charge + '%');
    boostButton.setAttribute('aria-label', charge >= 100 ? 'ぐるぐる発動' : 'ぐるぐる充電中');
  }

  function pathLine(points) {
    g.beginPath();
    g.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) g.lineTo(points[i].x, points[i].y);
  }

  function glow(x, y, radius, color, opacity = 0.16) {
    const gradient = g.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, color + '00');
    g.globalAlpha = opacity;
    g.fillStyle = gradient;
    g.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    g.globalAlpha = 1;
  }

  function mushroom(x, y, scale, color, lit = false) {
    if (lit) glow(x, y - 17 * scale, 76 * scale, '#fff4af', 0.55);
    g.save(); g.translate(x, y); g.scale(scale, scale);
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = '#a77854'; g.lineWidth = 6;
    g.beginPath(); g.moveTo(0, -1); g.quadraticCurveTo(-2, -10, 0, -18); g.stroke();
    g.strokeStyle = '#fff0cb'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(0, -2); g.quadraticCurveTo(-2, -10, 0, -18); g.stroke();
    g.fillStyle = '#ffe9b8';
    g.beginPath(); g.ellipse(0, -14, 14, 4, 0, 0, Math.PI * 2); g.fill();
    const cap = g.createLinearGradient(0, -30, 0, -13);
    cap.addColorStop(0, lit ? '#ffeab0' : color);
    cap.addColorStop(1, lit ? '#e9bb63' : '#d47e65');
    g.fillStyle = cap; g.strokeStyle = lit ? '#b79451' : '#b66e55'; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(-14, -15);
    g.bezierCurveTo(-12, -34, 12, -34, 14, -15);
    g.quadraticCurveTo(0, -10, -14, -15); g.fill(); g.stroke();
    g.fillStyle = '#fff4d9';
    for (const [a, b, r] of [[-6,-21,2.6],[2,-25,3],[8,-18,1.8]]) {
      g.beginPath(); g.arc(a,b,r,0,Math.PI*2); g.fill();
    }
    g.strokeStyle = '#fff7e5'; g.lineWidth = 1.7;
    g.beginPath(); g.moveTo(-9,-21); g.quadraticCurveTo(-7,-27,-3,-28); g.stroke();
    if (lit) {
      g.fillStyle = '#886b43';
      for (const ex of [-4,4]) { g.beginPath(); g.arc(ex,-17,1.2,0,7); g.fill(); }
      g.strokeStyle = '#886b43'; g.lineWidth = 1;
      g.beginPath(); g.arc(0,-15,2,0.2,Math.PI-0.2); g.stroke();
    }
    g.restore();
  }

  function fern(x, y, scale, color, seed) {
    g.save(); g.translate(x, y); g.scale(scale, scale);
    const lean = Math.sin(ticks * 0.018 + seed * 10) * 1.8;
    g.strokeStyle = '#70964c'; g.lineWidth = 2.5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(0,0); g.quadraticCurveTo(-3+lean,-17,5+lean,-36); g.stroke();
    for (let i=0;i<4;i++) {
      const yy=-7-i*7.5,xx=i+lean;
      for (const side of [-1,1]) {
        g.fillStyle = i%2 ? '#a4c968' : color;
        g.beginPath(); g.moveTo(xx,yy);
        g.bezierCurveTo(xx+side*6,yy-9,xx+side*(16-i*2),yy-9,xx+side*(14-i*2),yy-3);
        g.quadraticCurveTo(xx+side*7,yy+3,xx,yy);g.fill();
        g.strokeStyle='#e0eca2';g.lineWidth=.9;
        g.beginPath();g.moveTo(xx+side*2,yy-1);g.lineTo(xx+side*9,yy-4);g.stroke();
      }
    }
    if (seed > .9) {
      const fx=5+lean,fy=-38;
      for(let i=0;i<5;i++) {
        const angle=i*Math.PI*2/5;
        g.fillStyle='#fff0a5';g.beginPath();g.ellipse(fx+Math.cos(angle)*5,fy+Math.sin(angle)*5,4,3,angle,0,7);g.fill();
      }
      g.fillStyle='#e3a15b';g.beginPath();g.arc(fx,fy,3,0,7);g.fill();
    }
    g.restore();
  }

  function background(palette) {
    const base=g.createLinearGradient(0,0,W*.4,H);
    base.addColorStop(0,palette.far);base.addColorStop(.75,palette.back);
    g.fillStyle=base;g.fillRect(0,0,W,H);
    // Rounded, painted stones and leaf silhouettes keep the cave gentle.
    const px=camera.x*.3,py=camera.y*.3;
    for(let row=Math.floor(py/190)-1;row<Math.ceil((py+H)/190)+1;row++) {
      for(let col=Math.floor(px/190)-1;col<Math.ceil((px+W)/190)+1;col++) {
        const n=noise(col,row),x=col*190-px+n*55,y=row*190-py+noise(row,col)*65;
        g.fillStyle=palette.moss;g.globalAlpha=.08+n*.08;
        g.beginPath();g.ellipse(x,y,65+n*35,40+n*30,n,0,7);g.fill();
        g.strokeStyle='#f7f5d7';g.globalAlpha=.24;g.lineWidth=3;g.lineCap='round';
        g.beginPath();g.ellipse(x-5,y-5,48+n*25,25+n*18,n,Math.PI*1.05,Math.PI*1.65);g.stroke();
        if(n>.65) {
          g.fillStyle=palette.moss;g.globalAlpha=.12;
          for(let k=0;k<3;k++){g.beginPath();g.ellipse(x+k*14,y+58-k*5,9,22,-.6+k*.4,0,7);g.fill();}
        }
      }
    }
    g.globalAlpha=1;
    for(let row=Math.floor(camera.y/65);row<Math.ceil((camera.y+H)/65);row++) {
      for(let col=Math.floor(camera.x/65);col<Math.ceil((camera.x+W)/65);col++) {
        const n=noise(col+4,row+8),x=col*65-camera.x+n*38,y=row*65-camera.y+noise(row+2,col)*45;
        g.fillStyle='#f8f7dd';g.globalAlpha=.22+n*.12;
        g.beginPath();g.ellipse(x,y,1+n*2,1+n,n,0,7);g.fill();
      }
    }
    g.globalAlpha=1;
    // Warm roots with round leaves, anchored to each cave ceiling.
    const firstRow=Math.max(0,Math.floor((camera.y-80)/ROW_HEIGHT));
    const lastRow=Math.ceil((camera.y+H)/ROW_HEIGHT);
    for(let row=firstRow;row<=lastRow;row++) {
      for(let col=Math.floor(camera.x/300)-1;col<Math.ceil((camera.x+W)/300)+1;col++) {
        const x=col*300+noise(col,row)*80-camera.x,y=floorY(row)-ROW_HEIGHT+68-camera.y;
        const length=54+noise(col+5,row)*65;
        g.globalAlpha=.3;g.strokeStyle='#998b62';g.lineWidth=3.5;g.lineCap='round';
        g.beginPath();g.moveTo(x,y);g.bezierCurveTo(x-20,y+25,x+12,y+length*.7,x-7,y+length);g.stroke();
        g.strokeStyle='#e8dfb1';g.lineWidth=1.2;g.beginPath();g.moveTo(x-1,y);g.quadraticCurveTo(x-14,y+30,x,y+length*.6);g.stroke();
        g.globalAlpha=.42;g.fillStyle=palette.moss;
        for(let k=0;k<3;k++){
          const yy=y+length*(.35+k*.2),side=k%2?1:-1;
          g.beginPath();g.ellipse(x+side*8,yy,11,5,side*.5,0,7);g.fill();
        }
      }
    }
    g.globalAlpha=1;
  }

  function drawSlab(slab,palette) {
    const points=slab.points.map(p=>({x:p.x-camera.x,y:p.y-camera.y}));
    const x1=slab.start-camera.x,x2=slab.end-camera.x,y=slab.y-camera.y;
    if(x2<-50||x1>W+50)return;
    g.lineJoin='round';g.lineCap='round';
    const gradient=g.createLinearGradient(0,y,0,y+58);
    gradient.addColorStop(0,palette.soil);gradient.addColorStop(1,palette.dark);
    pathLine(points);g.lineTo(x2,y+43);
    for(let x=x2-24;x>x1;x-=45)g.lineTo(x,y+47+noise(x,slab.index)*6);
    g.quadraticCurveTo(x1,y+51,x1,y+43);g.closePath();g.fillStyle=gradient;g.fill();
    // Soft sediment layers, pebbles and occasional tiny spiral shells.
    g.save();g.clip();
    g.strokeStyle='#f6d2a0';g.globalAlpha=.28;g.lineWidth=2;
    g.beginPath();g.moveTo(x1,y+19);
    for(let x=x1+25;x<x2+25;x+=40)g.lineTo(x,y+19+Math.sin(x*.03)*2);g.stroke();
    for(let x=Math.max(slab.start+10,Math.floor(camera.x/65)*65);x<Math.min(slab.end,camera.x+W+30);x+=65) {
      const n=noise(x,slab.index),sx=x-camera.x;
      g.globalAlpha=.65;g.fillStyle=n>.5?'#e8be8b':'#b17e59';
      g.beginPath();g.ellipse(sx+12,y+34,5+n*6,3+n*3,n*.6,0,7);g.fill();
      g.strokeStyle='#f5d7b0';g.lineWidth=1;g.globalAlpha=.65;
      g.beginPath();g.ellipse(sx+11,y+33,4+n*3,2+n,0,Math.PI,Math.PI*1.7);g.stroke();
      if(n>.86){
        g.strokeStyle='#f5d9b3';g.lineWidth=1.5;g.beginPath();
        for(let i=0;i<=25;i++){const a=i*.35,r=i*.18;i?g.lineTo(sx+28+Math.cos(a)*r,y+32+Math.sin(a)*r):g.moveTo(sx+28,y+32);}g.stroke();
      }
    }
    g.restore();
    // A plush moss rim; the surface coordinates remain the physics surface.
    pathLine(points);g.strokeStyle='#7f9454';g.lineWidth=9;g.stroke();
    pathLine(points);g.strokeStyle=palette.moss;g.lineWidth=6;g.stroke();
    pathLine(points.map(p=>({x:p.x,y:p.y-2})));g.strokeStyle=palette.edge;g.lineWidth=2;g.stroke();
    for(let x=Math.max(slab.start+16,Math.floor(camera.x/45)*45);x<Math.min(slab.end-10,camera.x+W+30);x+=45) {
      const n=noise(x,slab.index),sx=x-camera.x;
      const s=rows[slab.index].walls.find(s=>s.top&&x>=s.x&&x<=s.x2),sy=surfaceY(s,x)-camera.y;
      if(n>.68)fern(sx,sy-3,.65+n*.35,palette.moss,n);
      else if(n<.2)mushroom(sx,sy-2,.46+n,'#efa585');
      else {
        g.strokeStyle=palette.moss;g.lineWidth=2;g.lineCap='round';
        g.beginPath();g.moveTo(sx,sy);g.quadraticCurveTo(sx-5,sy-5,sx-4,sy-9);
        g.moveTo(sx+4,sy);g.quadraticCurveTo(sx+9,sy-5,sx+8,sy-12);g.stroke();
        if(n>.5){g.fillStyle='#dce799';g.beginPath();g.ellipse(sx+10,sy-10,4,2,-.5,0,7);g.fill();}
      }
    }
  }

  function drawRow(row) {
    const y=row.y-camera.y,palette=paletteAt(row.y);
    for(const slab of row.slabs)drawSlab(slab,palette);
    const edge=row.gapX-camera.x;
    if(edge>-180&&edge<W+180) {
      glow(edge+row.gapWidth/2,y+90,100,'#fff2ba',0.25);
      mushroom(edge-20,y-5,0.85,palette.glow,true);
      mushroom(edge+row.gapWidth+21,y-5,0.62,palette.glow,true);
      // Small vine and arrow appear at the actual opening.
      g.strokeStyle=palette.moss;g.lineWidth=2;
      g.beginPath();g.moveTo(edge-7,y+3);g.bezierCurveTo(edge+12,y+25,edge-5,y+41,edge+9,y+58);g.stroke();
      g.globalAlpha=0.9;g.strokeStyle='#749b55';g.lineWidth=3;g.lineCap='round';
      const arrowY=y+39+Math.sin(ticks*.045)*3;
      g.beginPath();g.moveTo(edge+row.gapWidth/2,arrowY-8);g.lineTo(edge+row.gapWidth/2,arrowY+4);
      g.moveTo(edge+row.gapWidth/2-5,arrowY);g.lineTo(edge+row.gapWidth/2,arrowY+5);g.lineTo(edge+row.gapWidth/2+5,arrowY);g.stroke();
      g.globalAlpha=1;
    }
  }

  function drawLoot(o, collectionPop = false) {
    const x=o.x-camera.x,y=o.y-camera.y;
    if(x<-30||x>W+30||y<-35||y>H+35)return;
    g.save();g.translate(x,y+Math.sin(ticks*.035+o.phase)*2);
    if (!o.bug) g.scale(collectionPop ? 2 : 1.75, collectionPop ? 2 : 1.75);
    if(o.bug) {
      g.strokeStyle='#6b9151';g.lineWidth=2;g.lineCap='round';
      for(let i=-2;i<=2;i++){g.beginPath();g.moveTo(i*5,4);g.lineTo(i*5+Math.sin(ticks*.15+i)*2,9);g.stroke();}
      for(let i=3;i>=-2;i--){
        g.fillStyle=i%2?'#a4ca67':'#c9df84';g.strokeStyle='#82a95c';g.lineWidth=1;
        g.beginPath();g.arc(i*4,-Math.sin(ticks*.1+i)*1.5,6,0,7);g.fill();g.stroke();
      }
      g.fillStyle='#fbf8e5';g.beginPath();g.arc(-10,-3,3,0,7);g.fill();
      g.fillStyle='#49634e';g.beginPath();g.arc(-11,-3,1.6,0,7);g.fill();
      g.fillStyle='#eda88f';g.beginPath();g.ellipse(-11,2,2,1.5,0,0,7);g.fill();
      g.strokeStyle='#729855';g.lineWidth=1;g.beginPath();g.moveTo(-9,-7);g.quadraticCurveTo(-14,-14,-15,-10);g.stroke();
    } else {
      // A cream halo and slow sparkle distinguish treasure from planted scenery.
      glow(0,0,28,'#fff2b4',.45);
      if(collectionPop)g.globalAlpha=Math.min(1,o.life/15);
      g.strokeStyle='#fff9e0';g.lineWidth=1.8;
      g.beginPath();g.arc(0,0,16,0,Math.PI*2);g.stroke();
      const a=ticks*.015+o.phase,sx=Math.cos(a)*17,sy=Math.sin(a)*12;
      g.strokeStyle='#fff9db';g.lineWidth=1.5;g.lineCap='round';
      g.beginPath();g.moveTo(sx-2,sy);g.lineTo(sx+2,sy);g.moveTo(sx,sy-2);g.lineTo(sx,sy+2);g.stroke();
      if(o.kind===0){
        g.rotate(-.4);g.fillStyle='#f0c76b';g.strokeStyle='#b38b45';g.lineWidth=1.2;
        g.beginPath();g.moveTo(0,-12);g.bezierCurveTo(15,-5,13,11,0,12);g.bezierCurveTo(-12,6,-9,-5,0,-12);g.fill();g.stroke();
        g.strokeStyle='#bd974e';g.beginPath();g.moveTo(0,-8);g.lineTo(0,14);g.moveTo(0,1);g.lineTo(6,-3);g.moveTo(0,6);g.lineTo(-5,1);g.stroke();
        g.strokeStyle='#fff0b3';g.beginPath();g.moveTo(-4,-5);g.quadraticCurveTo(-8,0,-5,5);g.stroke();
      }else if(o.kind===1){
        mushroom(0,9,.72,'#f4a590');
      }else{
        g.fillStyle='#77bfd5';g.strokeStyle='#639eb6';g.lineWidth=1.3;
        g.beginPath();g.moveTo(0,-14);g.lineTo(10,-4);g.lineTo(7,10);g.quadraticCurveTo(0,14,-6,10);g.lineTo(-9,-3);g.closePath();g.fill();g.stroke();
        g.fillStyle='#ccefe6';g.beginPath();g.moveTo(0,-14);g.lineTo(1,3);g.lineTo(-6,10);g.lineTo(-9,-3);g.closePath();g.fill();
        g.strokeStyle='#f5fff3';g.lineWidth=1.8;g.beginPath();g.moveTo(1,-10);g.lineTo(6,-4);g.stroke();
      }
    }
    g.restore();
  }

  function friendFace(x, y, spacing, eyeSize = 3.3) {
    for (const side of [-1,1]) {
      const ex = x + side * spacing;
      g.fillStyle = '#fffbed';
      g.beginPath();g.arc(ex,y,eyeSize,0,Math.PI*2);g.fill();
      g.fillStyle = '#45544b';
      g.beginPath();g.arc(ex-.4,y+.3,eyeSize*.48,0,Math.PI*2);g.fill();
      g.fillStyle = '#edb2a0';
      g.beginPath();g.ellipse(ex+side*2,y+5,2.2,1.3,0,0,7);g.fill();
    }
    g.strokeStyle='#59725a';g.lineWidth=1.2;g.lineCap='round';
    g.beginPath();g.moveTo(x-2,y+5);g.quadraticCurveTo(x,y+8,x+2,y+5);g.stroke();
  }

  function drawFriend(animal) {
    const x=animal.x-camera.x,y=animal.y-camera.y;
    if(x<-65||x>W+65||y<-75||y>H+75)return;
    g.save();g.translate(x,y);
    const wiggle=Math.sin(ticks*.08+animal.phase),wave=Math.sin(ticks*.13)*animal.hello;
    g.globalAlpha=.12;g.fillStyle='#72855b';
    g.beginPath();g.ellipse(0,1,23,4,0,0,7);g.fill();g.globalAlpha=1;
    g.lineCap='round';g.lineJoin='round';
    if(animal.kind==='beetle'||animal.kind==='stag'||animal.kind==='ladybug') {
      const beetle=animal.kind!=='ladybug';
      g.strokeStyle=beetle?'#8f684e':'#78665e';g.lineWidth=2.3;
      for(let i=0;i<3;i++)for(const side of [-1,1]) {
        g.beginPath();g.moveTo(side*9,-22+i*8);g.lineTo(side*(20+wiggle),-24+i*10);
        g.lineTo(side*(23+wiggle),-18+i*10);g.stroke();
      }
      const shell=g.createLinearGradient(-15,-30,15,-5);
      shell.addColorStop(0,beetle?'#c2a178':'#ffb396');shell.addColorStop(1,beetle?'#986b54':'#e8856c');
      g.fillStyle=shell;g.strokeStyle=beetle?'#86654d':'#c27360';g.lineWidth=1.8;
      g.beginPath();g.ellipse(0,-17,15,17,0,0,7);g.fill();g.stroke();
      g.strokeStyle=beetle?'#795e48':'#af695a';g.lineWidth=1.4;
      g.beginPath();g.moveTo(0,-31);g.lineTo(0,-1);g.stroke();
      g.strokeStyle='#f4d6a9';g.lineWidth=2;
      g.beginPath();g.ellipse(-3,-18,9,12,0,Math.PI,Math.PI*1.55);g.stroke();
      if(!beetle) {
        g.fillStyle='#917062';
        for(const [sx,sy] of [[-7,-21],[7,-21],[-8,-11],[8,-11]]){g.beginPath();g.arc(sx,sy,3,0,7);g.fill();}
      }
      g.fillStyle=beetle?'#ac8660':'#a68f6c';
      g.beginPath();g.ellipse(0,-34,11,9,0,0,7);g.fill();
      if(animal.kind==='beetle') {
        g.strokeStyle='#997355';g.lineWidth=5;
        g.beginPath();g.moveTo(0,-39);g.quadraticCurveTo(2,-46,0,-55);
        g.moveTo(0,-54);g.lineTo(-5,-58);g.moveTo(0,-54);g.lineTo(5,-58);g.stroke();
        g.strokeStyle='#d0b38a';g.lineWidth=1.5;
        g.beginPath();g.moveTo(-1,-43);g.lineTo(-1,-52);g.stroke();
      } else if(animal.kind==='stag') {
        g.strokeStyle='#94714f';g.lineWidth=4;
        for(const side of [-1,1]) {
          g.beginPath();g.moveTo(side*7,-40);
          g.bezierCurveTo(side*22,-43,side*23,-56,side*12,-60);
          g.moveTo(side*20,-51);g.lineTo(side*13,-51);g.stroke();
        }
      }else {
        g.strokeStyle='#967c60';g.lineWidth=1.4;
        for(const side of [-1,1]){g.beginPath();g.moveTo(side*5,-40);g.lineTo(side*10,-48);g.stroke();}
      }
      friendFace(0,-35,5,3);
    } else if(animal.kind==='mantis') {
      g.strokeStyle='#729c55';g.lineWidth=3;
      for(const side of [-1,1]) {
        g.beginPath();g.moveTo(side*4,-14);g.lineTo(side*17,-7);g.lineTo(side*21,0);g.stroke();
        g.beginPath();g.moveTo(side*4,-25);g.lineTo(side*17,-28+wave*4);
        g.lineTo(side*12,-37+wave*4);g.stroke();
      }
      g.fillStyle='#b9d87e';g.strokeStyle='#83ae61';g.lineWidth=1.5;
      g.beginPath();g.ellipse(0,-17,7,16,.15,0,7);g.fill();g.stroke();
      g.fillStyle='#cae394';
      g.beginPath();g.moveTo(-14,-39);g.quadraticCurveTo(0,-46,14,-39);
      g.quadraticCurveTo(6,-30,0,-30);g.quadraticCurveTo(-6,-30,-14,-39);g.fill();g.stroke();
      g.strokeStyle='#82a360';g.lineWidth=1.3;
      for(const side of [-1,1]){g.beginPath();g.moveTo(side*6,-42);g.quadraticCurveTo(side*14,-56,side*20,-51);g.stroke();}
      friendFace(0,-38,8,4);
    } else if(animal.kind==='frog') {
      g.fillStyle='#a0c77a';g.strokeStyle='#7b9f5f';g.lineWidth=1.5;
      for(const side of [-1,1]){g.beginPath();g.ellipse(side*17,-4,9,5,side*.25,0,7);g.fill();g.stroke();}
      g.beginPath();g.ellipse(0,-16,20,17,0,0,7);g.fill();g.stroke();
      g.fillStyle='#e1e8ae';g.beginPath();g.ellipse(0,-10,12,9,0,0,7);g.fill();
      g.fillStyle='#a0c77a';
      for(const side of [-1,1]){g.beginPath();g.arc(side*11,-29,8,0,7);g.fill();g.stroke();}
      friendFace(0,-29,11,5);
      g.strokeStyle='#719457';g.lineWidth=1.5;g.beginPath();g.moveTo(-7,-20);g.quadraticCurveTo(0,-14,7,-20);g.stroke();
    } else if(animal.kind==='snail') {
      g.fillStyle='#e7c58e';g.strokeStyle='#bc9b70';g.lineWidth=1.5;
      g.beginPath();g.ellipse(0,-5,25,5,0,0,7);g.fill();g.stroke();
      const shell=g.createLinearGradient(-22,-36,2,-8);
      shell.addColorStop(0,'#f2c084');shell.addColorStop(1,'#d8996c');
      g.fillStyle=shell;g.beginPath();g.arc(-7,-21,16,0,7);g.fill();g.stroke();
      g.strokeStyle='#b88862';g.lineWidth=2;g.beginPath();
      for(let i=0;i<=38;i++){const angle=i*.24,r=i*.29;i?g.lineTo(-7+Math.cos(angle)*r,-21+Math.sin(angle)*r):g.moveTo(-7,-21);}g.stroke();
      g.fillStyle='#e7c58e';g.beginPath();g.ellipse(18,-13,7,10,.3,0,7);g.fill();
      g.strokeStyle='#bc9b70';g.lineWidth=2;
      g.beginPath();g.moveTo(15,-18);g.lineTo(13,-30);g.moveTo(22,-19);g.lineTo(25,-31);g.stroke();
      friendFace(19,-30,6,3);
    } else {
      const flutter=.85+Math.sin(ticks*.09+animal.phase)*.15;
      g.translate(0,-10-Math.sin(ticks*.025+animal.phase)*4);
      for(const side of [-1,1]){
        g.fillStyle=side<0?'#d1b8e8':'#bbafe0';g.strokeStyle='#ad95ca';g.lineWidth=1.5;
        g.beginPath();g.ellipse(side*12*flutter,-21,13*flutter,17,side*.4,0,7);g.fill();g.stroke();
        g.fillStyle='#ecc8dc';g.beginPath();g.ellipse(side*10*flutter,-5,10*flutter,10,side*.4,0,7);g.fill();g.stroke();
        g.fillStyle='#fff0b4';g.beginPath();g.arc(side*16*flutter,-23,4,0,7);g.fill();
      }
      g.fillStyle='#9c9c75';g.beginPath();g.ellipse(0,-15,4,16,0,0,7);g.fill();
      g.strokeStyle='#9c9c75';g.lineWidth=1.4;g.beginPath();g.moveTo(-2,-29);g.lineTo(-7,-39);g.moveTo(2,-29);g.lineTo(7,-39);g.stroke();
      friendFace(0,-27,3,2.5);
    }
    if(animal.hello>.15){
      // A small wordless greeting, never an enemy or a blocking obstacle.
      g.globalAlpha=animal.hello*.75;g.fillStyle='#efb7a5';
      const hx=24,hy=-53+Math.sin(ticks*.035)*2;
      g.beginPath();g.moveTo(hx,hy+7);g.bezierCurveTo(hx-13,hy,hx-7,hy-8,hx,hy-3);
      g.bezierCurveTo(hx+7,hy-8,hx+13,hy,hx,hy+7);g.fill();g.globalAlpha=1;
    }
    g.restore();
  }

  function drawPlayer() {
    const x=player.x-camera.x,y=player.y-camera.y;
    if(player.ground){
      g.globalAlpha=.18;g.fillStyle='#6d854e';g.beginPath();g.ellipse(x,y+22,24,4,0,0,7);g.fill();g.globalAlpha=1;
    }
    const rolling=Math.abs(player.vx)>1.8||!player.ground;
    const angle=rolling?spin:Math.sin(ticks*.035)*.025;
    const wiggle=Math.sin(ticks*.24)*Math.min(1,Math.abs(player.vx)/3+.12);
    g.save();g.translate(x,y);
    g.rotate(angle);
    g.strokeStyle='#546d91';g.lineWidth=2.8;g.lineCap='round';
    for(let i=-2;i<=2;i++)for(const side of [-1,1]){
      g.beginPath();g.moveTo(i*6,side*13);g.lineTo(i*6+wiggle*(i%2?3:-3),side*21);g.lineTo(i*6+4,side*22);g.stroke();
    }
    const shell=g.createLinearGradient(-15,-18,14,20);
    shell.addColorStop(0,'#c6d8ef');shell.addColorStop(.4,'#93b4dc');shell.addColorStop(1,'#708db9');
    g.fillStyle=shell;g.strokeStyle='#506e99';g.lineWidth=2.4;
    g.beginPath();g.arc(0,0,20,0,Math.PI*2);g.fill();g.stroke();
    for(let i=-2;i<=2;i++){
      const yy=i*6.3,half=Math.sqrt(20*20-yy*yy)-1;
      g.strokeStyle='#698bb6';g.lineWidth=1.3;
      g.beginPath();g.moveTo(-half,yy);g.quadraticCurveTo(0,yy+5,half,yy);g.stroke();
      g.strokeStyle='#d9e6f6';g.lineWidth=.9;
      g.beginPath();g.moveTo(-half+2,yy-1.5);g.quadraticCurveTo(0,yy+2,half-2,yy-1.5);g.stroke();
    }
    g.strokeStyle='#f0f4fb';g.lineWidth=2.3;
    g.beginPath();g.arc(-1,-1,16,Math.PI*1.05,Math.PI*1.5);g.stroke();
    // The shell rolls, while the friendly face remains readable.
    g.rotate(-angle);
    g.strokeStyle='#6282a6';g.lineWidth=2;
    g.beginPath();g.moveTo(-8,-15);g.quadraticCurveTo(-13,-29+wiggle*2,-20,-25);
    g.moveTo(8,-15);g.quadraticCurveTo(14,-29-wiggle*2,20,-25);g.stroke();
    g.fillStyle='#f3cd7a';
    for(const ax of [-20,20]){g.beginPath();g.arc(ax,-25,2.3,0,7);g.fill();}
    g.fillStyle='#d6e7ed';g.beginPath();g.ellipse(0,-6,16,11,0,0,7);g.fill();
    const blinking=ticks%260>251;
    for(const ex of [-7,7]){
      if(blinking){
        g.strokeStyle='#415575';g.lineWidth=2;g.beginPath();g.moveTo(ex-3,-8);g.quadraticCurveTo(ex,-5,ex+3,-8);g.stroke();
      }else{
        g.fillStyle='#fffcf0';g.beginPath();g.ellipse(ex,-8,5.5,6,0,0,7);g.fill();
        g.fillStyle='#3e5578';g.beginPath();g.ellipse(ex+facing*.6,-7.5,3.2,3.8,0,0,7);g.fill();
        g.fillStyle='white';g.beginPath();g.arc(ex-1,-9,1.3,0,7);g.fill();
      }
    }
    g.fillStyle='#eca6a1';
    for(const cx of [-12,12]){g.beginPath();g.ellipse(cx,0,3.3,2.1,0,0,7);g.fill();}
    g.strokeStyle='#638199';g.lineWidth=1.4;
    g.beginPath();g.moveTo(-3,0);g.quadraticCurveTo(0,4,3,0);g.stroke();
    g.restore();
  }

  function draw() {
    background(paletteAt(camera.y+H*.35));
    const start=Math.max(0,Math.floor((camera.y-FIRST_FLOOR-70)/ROW_HEIGHT));
    const end=Math.min(rows.length,Math.ceil((camera.y+H-FIRST_FLOOR+70)/ROW_HEIGHT)+1);
    for(let i=start;i<end;i++)drawRow(rows[i]);
    for(const animal of fauna)if(animal.row>=start&&animal.row<end)drawFriend(animal);
    for(const o of loot)if(!o.got&&o.row>=start&&o.row<end)drawLoot(o);
    // Drifting fireflies give depth without obscuring collision surfaces.
    for(let i=0;i<9;i++){
      const x=(noise(i,7)*WORLD_WIDTH-camera.x*.75+Math.sin(ticks*.008+i)*15)% (W+100);
      const y=(noise(i,9)*H+ticks*.07+i*37)%(H+40)-20;
      g.globalAlpha=.2+Math.sin(ticks*.025+i)*.15;g.fillStyle='#fffbe0';g.beginPath();g.arc(x,y,1.5,0,7);g.fill();
    }
    g.globalAlpha=1;
    for(const m of motes){g.globalAlpha=m.life/34;g.fillStyle=m.color;g.beginPath();g.arc(m.x-camera.x,m.y-camera.y,2,0,7);g.fill();}
    g.globalAlpha=1;drawPlayer();
    for(const pop of pickupPops){g.save();g.globalAlpha=Math.min(1,pop.life/15);drawLoot(pop,true);g.restore();}
    const vignette=g.createRadialGradient(W*.5,H*.45,Math.min(W,H)*.2,W*.5,H*.45,Math.max(W,H)*.8);
    vignette.addColorStop(0,'transparent');vignette.addColorStop(1,'#5f896318');g.fillStyle=vignette;g.fillRect(0,0,W,H);
  }

  function resetInput() {left=false;right=false;drag=null;}
  function jump(speed = 9.5, force = false) {
    // A small grace period allows a flick just after leaving an edge.
    if (!force && !player.ground && ticks - groundedTick > 7) return false;
    player.ground = null;
    groundedTick = -Infinity;
    player.vy = -speed;
    return true;
  }
  function pointerDown(e) {
    if(drag)return;
    e.preventDefault();
    drag={id:e.pointerId,startX:e.clientX,x:e.clientX,startY:e.clientY,lastY:e.clientY,lastX:e.clientX,lastT:performance.now(),vy:0,vx:0};
    canvas.setPointerCapture(e.pointerId);
  }
  function pointerMove(e) {
    if(!drag||drag.id!==e.pointerId)return;
    const now=performance.now(),dt=Math.max(8,now-drag.lastT);
    drag.vy=drag.vy*.25+(e.clientY-drag.lastY)/dt*16.67*.75;
    drag.vx=drag.vx*.25+(e.clientX-drag.lastX)/dt*16.67*.75;
    drag.x=e.clientX;drag.lastY=e.clientY;drag.lastX=e.clientX;drag.lastT=now;
  }
  function pointerUp(e) {
    if(!drag||drag.id!==e.pointerId)return;
    const fresh = performance.now() - drag.lastT < 150;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (fresh && dy < -35 && drag.vy < -4) {
      if (jump(clamp(-drag.vy * 0.6, JUMP_MIN, JUMP_MAX))) {
        player.vx=clamp(player.vx+drag.vx*.35,-8.5,8.5);
      }
    } else if (fresh && Math.abs(dx) > 35 && Math.abs(drag.vx) > 4) {
      // A sideways flick is a short, low launch, not just a held drag.
      // Mid-air steering retains its vertical velocity: no repeated lift.
      jump(7);
      const direction = Math.sign(drag.vx);
      player.vx = direction * clamp(Math.abs(drag.vx) * 0.85, 10, 14);
      facing = direction;
    }
    drag=null;
  }
  function boost() {
    if(charge<100)return;
    charge=0;drag=null;jump(BOOST_JUMP,true);player.vx=facing*8.5;
    burst(player.x,player.y,'#f6dfa2');updateBoostUI();
  }

  function frame(time) {
    if(lastTime===null)lastTime=time;
    accumulator+=Math.min(100,Math.max(0,time-lastTime));
    lastTime=time;
    while(accumulator+0.000001>=STEP_MS){update();accumulator-=STEP_MS;}
    draw();
    requestAnimationFrame(frame);
  }

  resize();
  addRows(32);
  camera.x=clamp(player.x-W/2,0,Math.max(0,WORLD_WIDTH-W));
  canvas.addEventListener('pointerdown',pointerDown);
  canvas.addEventListener('pointermove',pointerMove);
  canvas.addEventListener('pointerup',pointerUp);
  for(const type of ['pointercancel','lostpointercapture'])canvas.addEventListener(type,e=>{if(drag&&drag.id===e.pointerId)drag=null;});
  boostButton.addEventListener('click',boost);
  addEventListener('resize',resize);
  addEventListener('blur',resetInput);
  document.addEventListener('visibilitychange',()=>{resetInput();lastTime=null;accumulator=0;});
  addEventListener('keydown',e=>{
    if(['ArrowLeft','ArrowRight','ArrowUp',' '].includes(e.key))e.preventDefault();
    if(e.key==='ArrowLeft'||e.key==='a')left=true;
    if(e.key==='ArrowRight'||e.key==='d')right=true;
    if((e.key==='ArrowUp'||e.key===' ')&&!e.repeat&&player.ground)jump();
  });
  addEventListener('keyup',e=>{
    if(e.key==='ArrowLeft'||e.key==='a')left=false;
    if(e.key==='ArrowRight'||e.key==='d')right=false;
  });
  updateBoostUI();
  requestAnimationFrame(frame);
})();
