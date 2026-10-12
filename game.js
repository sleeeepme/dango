(() => {
  'use strict';

  const canvas = document.querySelector('canvas');
  const g = canvas.getContext('2d');
  const depthLabel = document.getElementById('depth');
  const scoreLabel = document.getElementById('score');
  const biomeLabel = document.getElementById('biome');
  const boostButton = document.getElementById('boost');
  const tip = document.getElementById('tip');
  const mapTrack = document.getElementById('map-track');
  const WORLD_WIDTH = 2240;
  const ROW_HEIGHT = 330;
  const FIRST_FLOOR = 320;
  const STEP_MS = 1000 / 60;
  const palettes = [
    { name: '苔むす入口', back: '#233a35', far: '#345048', soil: '#645042', dark: '#382e2a', edge: '#a0b378', moss: '#769c67', glow: '#c4e9a0' },
    { name: '根っこの森', back: '#302e31', far: '#494044', soil: '#735345', dark: '#3c2f2b', edge: '#c0a476', moss: '#94a66a', glow: '#f0d58b' },
    { name: '青い石の洞窟', back: '#202f40', far: '#304958', soil: '#546373', dark: '#2a3946', edge: '#88c0c5', moss: '#68a4a7', glow: '#a0e9eb' },
    { name: 'ひかりの地底湖', back: '#193b3f', far: '#2c5659', soil: '#52645f', dark: '#293d3c', edge: '#8bc4ad', moss: '#63b29e', glow: '#a1eed0' },
    { name: '琥珀の奥庭', back: '#402d33', far: '#62434a', soil: '#815b50', dark: '#493138', edge: '#d9ab82', moss: '#ba966e', glow: '#ffcea0' },
  ];
  const player = { x: 1060, y: 180, vx: 0, vy: 0, r: 20, ground: null };
  const camera = { x: 0, y: 0 };
  const rows = [];
  const loot = [];
  const motes = [];
  let W = 390, H = 844, ticks = 0, spin = 0, charge = 0, score = 0;
  let left = false, right = false, drag = null, facing = 1;
  let lastTime = null, accumulator = 0, hudTick = -1, maxDepth = 0;
  let exploredMin = player.x, exploredMax = player.x;

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
        if (s) loot.push({ x, y: surfaceY(s, x) - 34, got: false, kind: index % 3, row: index, phase: noise(x, index) * 6 });
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
    player.vx = clamp(player.vx, -8.5, 8.5);
    player.vy = Math.min(18, player.vy + 0.35);

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
    spin += (player.x - oldX) / player.r;
    charge = Math.min(100, charge + Math.abs(player.x - oldX) * 0.045);
    maxDepth = Math.max(maxDepth, Math.floor(Math.max(0, player.y - FIRST_FLOOR + player.r) / 100));
    exploredMin = Math.min(exploredMin, player.x - W * 0.45);
    exploredMax = Math.max(exploredMax, player.x + W * 0.45);
    if (player.y > floorY(rows.length - 5)) addRows(20);
    const rowIndex = Math.max(0, Math.floor((player.y - FIRST_FLOOR + 55) / ROW_HEIGHT));
    for (const o of loot) {
      if (o.got || Math.abs(o.row - rowIndex) > 2) continue;
      if (o.bug) o.x = o.baseX + Math.sin(ticks * 0.025 + o.phase) * 45;
      if (Math.hypot(o.x - player.x, o.y - player.y) < 34) {
        o.got = true;
        score++;
        charge = Math.min(100, charge + 7);
        burst(o.x, o.y, paletteAt(o.y).glow);
      }
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
    if (ticks - hudTick >= 6) updateHUD();
  }

  function updateHUD() {
    hudTick = ticks;
    depthLabel.textContent = maxDepth + ' m';
    scoreLabel.textContent = String(score);
    biomeLabel.textContent = paletteAt(player.y).name;
    boostButton.disabled = charge < 100;
    boostButton.style.setProperty('--charge', charge + '%');
    boostButton.setAttribute('aria-label', charge >= 100 ? 'ぐるぐる発動' : 'ぐるぐる充電 ' + Math.floor(charge) + '%');
    document.getElementById('energy').textContent = charge >= 100 ? 'ぐるぐる！' : Math.floor(charge) + '%';
    mapTrack.style.setProperty('--from', clamp(exploredMin / WORLD_WIDTH * 100, 0, 100) + '%');
    mapTrack.style.setProperty('--span', clamp((exploredMax - exploredMin) / WORLD_WIDTH * 100, 0, 100) + '%');
    mapTrack.style.setProperty('--player', player.x / WORLD_WIDTH * 100 + '%');
    const row = rows[Math.max(0, Math.floor((player.y - FIRST_FLOOR + 55) / ROW_HEIGHT))];
    tip.textContent = row && Math.abs(player.x - row.gapX - row.gapWidth / 2) < 230 && Math.abs(player.y - row.y) < 95
      ? '光るキノコの先に、下への道。'
      : maxDepth < 3 ? '左右にひっぱって探検。上にサッと払うとジャンプ。' : '次の降り口は、どこだろう。';
  }

  function pathLine(points) {
    g.beginPath();
    g.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) g.lineTo(points[i].x, points[i].y);
  }

  function glow(x, y, radius, color, opacity = 0.16) {
    const gradient = g.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, 'transparent');
    g.globalAlpha = opacity;
    g.fillStyle = gradient;
    g.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    g.globalAlpha = 1;
  }

  function mushroom(x, y, scale, color, lit = false) {
    if (lit) glow(x, y - 12 * scale, 62 * scale, color, 0.18);
    g.save(); g.translate(x, y); g.scale(scale, scale);
    g.strokeStyle = '#d6cba4'; g.lineWidth = 3; g.lineCap = 'round';
    g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(-3, -9, 0, -17); g.stroke();
    g.fillStyle = color;
    g.beginPath(); g.moveTo(-12, -15); g.bezierCurveTo(-10, -32, 10, -31, 13, -15); g.quadraticCurveTo(0, -11, -12, -15); g.fill();
    g.fillStyle = '#f4efd0'; g.globalAlpha = 0.65;
    for (const [a,b,r] of [[-5,-20,2],[3,-24,2.4],[7,-18,1.4]]) { g.beginPath(); g.arc(a,b,r,0,Math.PI*2);g.fill(); }
    g.globalAlpha = 1; g.restore();
  }

  function fern(x, y, scale, color, seed) {
    g.save(); g.translate(x, y); g.scale(scale, scale);
    g.strokeStyle = color; g.lineWidth = 1.4; g.lineCap = 'round';
    g.beginPath(); g.moveTo(0,0); g.quadraticCurveTo(-4,-20,8,-37); g.stroke();
    g.fillStyle = color;
    for(let i=0;i<5;i++) {
      const yy=-6-i*5.8, xx=i*0.9;
      for(const side of [-1,1]) {
        g.beginPath(); g.moveTo(xx,yy); g.quadraticCurveTo(xx+side*(12-i),yy-8,xx+side*(16-i*2),yy-2);
        g.quadraticCurveTo(xx+side*7,yy+3,xx,yy);g.fill();
      }
    }
    g.restore();
  }

  function background(palette) {
    const base = g.createLinearGradient(0, 0, W, H);
    base.addColorStop(0, palette.far); base.addColorStop(0.6, palette.back); base.addColorStop(1, palette.back);
    g.fillStyle = base; g.fillRect(0,0,W,H);
    // Far cave silhouettes move more slowly than the playable terrain.
    const px = camera.x * 0.3, py = camera.y * 0.3;
    for(let row=Math.floor(py/180)-1;row<Math.ceil((py+H)/180)+1;row++) {
      for(let col=Math.floor(px/180)-1;col<Math.ceil((px+W)/180)+1;col++) {
        const n=noise(col,row), x=col*180-px+n*55, y=row*180-py+noise(row,col)*70;
        g.fillStyle=palette.dark;g.globalAlpha=0.13+n*0.12;
        g.beginPath();g.ellipse(x,y,55+n*38,28+n*45,n*2,0,Math.PI*2);g.fill();
        g.globalAlpha=0.12;g.strokeStyle=palette.edge;g.lineWidth=1;
        g.beginPath();g.moveTo(x-28,y-8);g.lineTo(x-7,y-20);g.lineTo(x+20,y-12);g.stroke();
      }
    }
    g.globalAlpha=1;
    // Fine, deterministic sediment. Only visible cells are drawn.
    for(let row=Math.floor(camera.y/65);row<Math.ceil((camera.y+H)/65);row++) {
      for(let col=Math.floor(camera.x/65);col<Math.ceil((camera.x+W)/65);col++) {
        const n=noise(col+4,row+8),x=col*65-camera.x+n*38,y=row*65-camera.y+noise(row+2,col)*45;
        g.fillStyle=palette.edge;g.globalAlpha=0.07+n*0.08;
        g.beginPath();g.ellipse(x,y,1+n*2,1+n,n,0,7);g.fill();
      }
    }
    g.globalAlpha=1;
    // Hanging roots frame the passage, leaving the playable floor legible.
    for(let col=Math.floor(camera.x/270)-1;col<Math.ceil((camera.x+W)/270)+1;col++) {
      const row=Math.max(0,Math.floor(camera.y/ROW_HEIGHT));
      const x=col*270+noise(col,row)*95-camera.x;
      const y=floorY(row)-ROW_HEIGHT+60-camera.y;
      const length=38+noise(col+5,row)*70;
      g.strokeStyle='#ae9970';g.globalAlpha=0.36;g.lineWidth=2.4;g.lineCap='round';
      g.beginPath();g.moveTo(x,y);g.bezierCurveTo(x-25,y+20,x+18,y+length*.65,x-8,y+length);g.stroke();
      g.lineWidth=1;g.beginPath();g.moveTo(x-3,y+length*.55);g.lineTo(x-21,y+length*.78);g.moveTo(x-3,y+length*.72);g.lineTo(x+14,y+length*.9);g.stroke();
    }
    g.globalAlpha=1;
  }

  function drawSlab(slab, palette) {
    const points=slab.points.map(p=>({x:p.x-camera.x,y:p.y-camera.y}));
    const x1=slab.start-camera.x,x2=slab.end-camera.x,y=slab.y-camera.y;
    if(x2 < -50 || x1 > W+50) return;
    const gradient=g.createLinearGradient(0,y-8,0,y+65);
    gradient.addColorStop(0,palette.soil);gradient.addColorStop(1,palette.dark);
    pathLine(points);g.lineTo(x2,y+48);
    for(let x=x2-28;x>x1;x-=50)g.lineTo(x,y+48+noise(x,slab.index)*10);
    g.lineTo(x1,y+48);g.closePath();g.fillStyle=gradient;g.fill();
    // The rim is exactly the surface used by collision, not a floating stroke.
    pathLine(points);g.strokeStyle=palette.dark;g.lineWidth=9;g.lineJoin='round';g.stroke();
    pathLine(points);g.strokeStyle=palette.edge;g.lineWidth=4;g.stroke();
    pathLine(points.map(p=>({x:p.x,y:p.y-2})));g.strokeStyle=palette.moss;g.lineWidth=3;g.stroke();
    const start=Math.max(slab.start+16,Math.floor(camera.x/45)*45);
    for(let x=start;x<Math.min(slab.end-10,camera.x+W+30);x+=45) {
      const n=noise(x,slab.index),sx=x-camera.x;
      g.strokeStyle=palette.edge;g.globalAlpha=0.2;g.lineWidth=1;
      g.beginPath();g.moveTo(sx,y+15+n*7);g.lineTo(sx+16,y+17+n*6);g.stroke();
      g.globalAlpha=0.33;g.fillStyle=palette.dark;
      g.beginPath();g.ellipse(sx+12,y+30,4+n*7,2+n*3,n,0,7);g.fill();
      g.globalAlpha=1;
      const s=rows[slab.index].walls.find(s=>s.top&&x>=s.x&&x<=s.x2);
      const sy=surfaceY(s,x)-camera.y;
      if(n>0.68)fern(sx,sy-4,0.5+n*0.4,palette.moss,n);
      else if(n<0.2)mushroom(sx,sy-2,0.36+n,palette.edge);
      else {
        g.strokeStyle=palette.moss;g.lineWidth=1.4;
        g.beginPath();g.moveTo(sx,sy);g.lineTo(sx-3,sy-6);g.moveTo(sx+4,sy);g.lineTo(sx+7,sy-9);g.stroke();
      }
    }
  }

  function drawRow(row) {
    const y=row.y-camera.y,palette=paletteAt(row.y);
    for(const slab of row.slabs)drawSlab(slab,palette);
    const edge=row.gapX-camera.x;
    if(edge>-180&&edge<W+180) {
      glow(edge+row.gapWidth/2,y+110,110,palette.glow,0.085);
      mushroom(edge-20,y-5,0.85,palette.glow,true);
      mushroom(edge+row.gapWidth+21,y-5,0.62,palette.glow,true);
      // Small vine and arrow appear at the actual opening.
      g.strokeStyle=palette.moss;g.lineWidth=2;
      g.beginPath();g.moveTo(edge-7,y+3);g.bezierCurveTo(edge+12,y+25,edge-5,y+41,edge+9,y+58);g.stroke();
      g.globalAlpha=0.65;g.strokeStyle=palette.glow;g.lineWidth=2;g.lineCap='round';
      const arrowY=y+39+Math.sin(ticks*.045)*3;
      g.beginPath();g.moveTo(edge+row.gapWidth/2,arrowY-8);g.lineTo(edge+row.gapWidth/2,arrowY+4);
      g.moveTo(edge+row.gapWidth/2-5,arrowY);g.lineTo(edge+row.gapWidth/2,arrowY+5);g.lineTo(edge+row.gapWidth/2+5,arrowY);g.stroke();
      g.globalAlpha=1;
    }
  }

  function drawLoot(o) {
    const x=o.x-camera.x,y=o.y-camera.y;
    if(x<-30||x>W+30||y<-35||y>H+35)return;
    g.save();g.translate(x,y+Math.sin(ticks*.035+o.phase)*2);
    if(o.bug) {
      g.strokeStyle='#253b2b';g.lineWidth=1.4;
      for(let i=-2;i<=2;i++){g.beginPath();g.moveTo(i*5,4);g.lineTo(i*5+Math.sin(ticks*.15+i)*2,9);g.stroke();}
      for(let i=3;i>=-2;i--){g.fillStyle=i%2?'#91b972':'#b9cc87';g.beginPath();g.arc(i*4,-Math.sin(ticks*.1+i)*1.5,5.5,0,7);g.fill();}
      g.fillStyle='#223b32';g.beginPath();g.arc(-9,-2,1.5,0,7);g.fill();
    } else if(o.kind===0) {
      g.rotate(-.4);g.fillStyle='#e3ba76';g.beginPath();g.moveTo(0,-11);g.bezierCurveTo(17,-5,12,12,0,11);g.bezierCurveTo(-12,6,-8,-6,0,-11);g.fill();
      g.strokeStyle='#9c6c4d';g.lineWidth=1.3;g.beginPath();g.moveTo(0,-7);g.lineTo(0,13);g.moveTo(0,1);g.lineTo(6,-3);g.moveTo(0,6);g.lineTo(-5,1);g.stroke();
    } else if(o.kind===1) {
      mushroom(0,9,.65,'#dfa588');
    } else {
      glow(0,0,26,'#a4e4df',.13);
      g.fillStyle='#7fc4c6';g.beginPath();g.moveTo(0,-12);g.lineTo(9,-3);g.lineTo(5,10);g.lineTo(-5,10);g.lineTo(-8,-3);g.closePath();g.fill();
      g.fillStyle='#c6eee2';g.beginPath();g.moveTo(0,-12);g.lineTo(2,4);g.lineTo(-5,10);g.lineTo(-8,-3);g.closePath();g.fill();
      g.strokeStyle='#e3f5e5';g.lineWidth=1;g.beginPath();g.moveTo(0,-9);g.lineTo(6,-3);g.stroke();
    }
    g.restore();
  }

  function drawPlayer() {
    const x=player.x-camera.x,y=player.y-camera.y;
    // Contact shadow anchors the character to the terrain.
    if(player.ground){g.globalAlpha=.3;g.fillStyle='#152a26';g.beginPath();g.ellipse(x,y+22,25,4,0,0,7);g.fill();g.globalAlpha=1;}
    g.save();g.translate(x,y);
    const rolling=Math.abs(player.vx)>1.8||!player.ground;
    g.rotate(rolling?spin:Math.sin(ticks*.035)*.025);
    const wiggle=Math.sin(ticks*.24)*Math.min(1,Math.abs(player.vx)/3+.12);
    g.strokeStyle='#293c38';g.lineWidth=2.8;g.lineCap='round';
    for(let i=-2;i<=2;i++)for(const side of [-1,1]){
      g.beginPath();g.moveTo(i*6,side*13);g.lineTo(i*6+wiggle*(i%2?3:-3),side*21);g.lineTo(i*6+4,side*23);g.stroke();
    }
    g.strokeStyle='#bfd1bb';g.lineWidth=1.8;
    g.beginPath();g.moveTo(-7,-15);g.quadraticCurveTo(-10,-29+wiggle*2,-18,-26);g.moveTo(7,-15);g.quadraticCurveTo(12,-29-wiggle*2,19,-26);g.stroke();
    const shell=g.createLinearGradient(-15,-18,15,18);
    shell.addColorStop(0,'#d2debc');shell.addColorStop(.35,'#99b4a4');shell.addColorStop(1,'#506f69');
    g.fillStyle=shell;g.strokeStyle='#2b4943';g.lineWidth=2.5;
    g.beginPath();g.ellipse(0,0,20,21,0,0,7);g.fill();g.stroke();
    for(let i=-3;i<=3;i++){
      g.strokeStyle='#3f635a';g.lineWidth=1.3;g.beginPath();g.ellipse(i*4.2,1,3.3,17-Math.abs(i)*2.5,0,0,7);g.stroke();
      g.strokeStyle='#e6e7c8';g.globalAlpha=.4;g.beginPath();g.ellipse(i*4.2-.8,-3,1.2,11-Math.abs(i)*1.6,0,Math.PI,Math.PI*2);g.stroke();g.globalAlpha=1;
    }
    g.fillStyle='#d4debe';g.beginPath();g.ellipse(0,-10,12,8,0,0,7);g.fill();
    for(const ex of [-6,6]){
      g.fillStyle='#f9f4dc';g.beginPath();g.arc(ex,-12,4,0,7);g.fill();
      g.fillStyle='#203c34';g.beginPath();g.arc(ex+facing*.8,-11,2.1,0,7);g.fill();
      g.fillStyle='white';g.beginPath();g.arc(ex+facing*.8-.5,-12,0.8,0,7);g.fill();
    }
    g.strokeStyle='#54766a';g.lineWidth=1.2;g.beginPath();g.arc(0,-6,2.5,.15,Math.PI-.15);g.stroke();
    g.restore();
  }

  function draw() {
    background(paletteAt(camera.y+H*.35));
    const start=Math.max(0,Math.floor((camera.y-FIRST_FLOOR-70)/ROW_HEIGHT));
    const end=Math.min(rows.length,Math.ceil((camera.y+H-FIRST_FLOOR+70)/ROW_HEIGHT)+1);
    for(let i=start;i<end;i++)drawRow(rows[i]);
    for(const o of loot)if(!o.got&&o.row>=start&&o.row<end)drawLoot(o);
    // Drifting fireflies give depth without obscuring collision surfaces.
    for(let i=0;i<9;i++){
      const x=(noise(i,7)*WORLD_WIDTH-camera.x*.75+Math.sin(ticks*.008+i)*15)% (W+100);
      const y=(noise(i,9)*H+ticks*.07+i*37)%(H+40)-20;
      g.globalAlpha=.2+Math.sin(ticks*.025+i)*.15;g.fillStyle='#d8eaba';g.beginPath();g.arc(x,y,1.5,0,7);g.fill();
    }
    g.globalAlpha=1;
    for(const m of motes){g.globalAlpha=m.life/34;g.fillStyle=m.color;g.beginPath();g.arc(m.x-camera.x,m.y-camera.y,2,0,7);g.fill();}
    g.globalAlpha=1;drawPlayer();
    const vignette=g.createRadialGradient(W*.5,H*.45,Math.min(W,H)*.2,W*.5,H*.45,Math.max(W,H)*.8);
    vignette.addColorStop(0,'transparent');vignette.addColorStop(1,'#10251e88');g.fillStyle=vignette;g.fillRect(0,0,W,H);
  }

  function resetInput() {left=false;right=false;drag=null;}
  function jump(speed=12) {player.ground=null;player.vy=-speed;}
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
    if(e.clientY-drag.startY < -35 && performance.now()-drag.lastT < 150 && drag.vy < -4){
      jump(Math.min(22,Math.max(12,-drag.vy*1.5)));
      player.vx=clamp(player.vx+drag.vx*.35,-8.5,8.5);
    }
    drag=null;
  }
  function bindButton(id,set) {
    const el=document.getElementById(id);
    el.addEventListener('pointerdown',e=>{e.preventDefault();el.setPointerCapture(e.pointerId);set(true);});
    for(const type of ['pointerup','pointercancel','lostpointercapture'])el.addEventListener(type,()=>set(false));
  }
  function boost() {
    if(charge<100)return;
    charge=0;drag=null;jump(19);player.vx=facing*8.5;
    burst(player.x,player.y,'#f6dfa2');updateHUD();
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
  bindButton('left',v=>left=v);
  bindButton('right',v=>right=v);
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
  updateHUD();
  requestAnimationFrame(frame);
})();
