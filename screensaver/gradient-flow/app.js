/* 热带雨林 —— 深绿流体光影 + 藤叶摇曳 + 飞过的鹦鹉 + 栖在枝头的巨嘴鸟 + 萤火 */
(function () {
  'use strict';

  var canvas = document.getElementById('scene');
  var ctx = canvas.getContext('2d');
  var grainEl = document.getElementById('grain');
  if (!ctx) { return; }

  var MAX_DPR = 2;
  var RENDER_SCALE = 0.32;   // 背景先低分辨率画再放大，天然柔和

  var W = 1;
  var H = 1;
  var dpr = 1;
  var off = null;
  var octx = null;
  var offW = 1;
  var offH = 1;
  var base = null;
  var baseCtx = null;

  var rafId = 0;
  var last = 0;
  var t = 18;
  var resizeTimer = 0;

  // 雨林的色块：墨绿 / 青绿 / 苔藓 / 一缕暖金光
  var BLOBS = [
    { c: [18, 96, 74], a: 0.50, fx: 0.047, fy: 0.061, px: 0.8, py: 2.0, r: 0.58, sq: 0.60, sp: 0.05, sd: 1.0 },
    { c: [12, 132, 118], a: 0.44, fx: 0.038, fy: 0.055, px: 2.9, py: 0.7, r: 0.52, sq: 0.50, sp: 0.07, sd: 2.1 },
    { c: [74, 150, 62], a: 0.34, fx: 0.061, fy: 0.043, px: 4.6, py: 3.6, r: 0.44, sq: 0.70, sp: 0.04, sd: 3.2 },
    { c: [206, 158, 62], a: 0.20, fx: 0.033, fy: 0.048, px: 5.8, py: 1.4, r: 0.40, sq: 0.55, sp: 0.06, sd: 4.4 },
    { c: [10, 74, 96], a: 0.34, fx: 0.055, fy: 0.036, px: 1.9, py: 5.4, r: 0.46, sq: 0.80, sp: 0.03, sd: 5.5 },
    { c: [26, 60, 46], a: 0.40, fx: 0.044, fy: 0.064, px: 3.5, py: 4.6, r: 0.62, sq: 0.45, sp: 0.08, sd: 6.6 }
  ];

  // 从树冠漏下来的光柱
  var SHAFTS = [
    { x: 0.24, w: 0.10, a: 0.10, sp: 0.02, ph: 0.0 },
    { x: 0.58, w: 0.075, a: 0.075, sp: 0.016, ph: 1.7 },
    { x: 0.82, w: 0.13, a: 0.055, sp: 0.013, ph: 3.1 }
  ];

  var leaves = [];     // 藤叶
  var parrots = [];    // 鹦鹉
  var fireflies = [];  // 萤火
  var trunkSeed = [];

  function rand(a, b) { return a + Math.random() * (b - a); }

  function makeGrain() {
    var size = 64;
    var c = document.createElement('canvas');
    c.width = c.height = size;
    var g = c.getContext('2d');
    var img = g.createImageData(size, size);
    var data = img.data;
    for (var i = 0; i < data.length; i += 4) {
      var v = (Math.random() * 255) | 0;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    grainEl.style.backgroundImage = 'url(' + c.toDataURL('image/png') + ')';
  }

  function renderBase() {
    base = document.createElement('canvas');
    base.width = offW;
    base.height = offH;
    baseCtx = base.getContext('2d');

    var g = baseCtx.createLinearGradient(0, 0, offW * 0.2, offH);
    g.addColorStop(0, '#0a241d');
    g.addColorStop(0.45, '#08201a');
    g.addColorStop(1, '#04120e');
    baseCtx.fillStyle = g;
    baseCtx.fillRect(0, 0, offW, offH);

    // 底部一层深绿反光，别让下缘死黑
    var bottom = baseCtx.createLinearGradient(0, offH * 0.5, 0, offH);
    bottom.addColorStop(0, 'rgba(8, 40, 30, 0)');
    bottom.addColorStop(1, 'rgba(14, 58, 40, 0.45)');
    baseCtx.fillStyle = bottom;
    baseCtx.fillRect(0, 0, offW, offH);
  }

  function drawShafts(g) {
    var useFilter = typeof g.filter === 'string';
    if (useFilter) { g.filter = 'blur(' + Math.max(3, offW * 0.012).toFixed(1) + 'px)'; }
    for (var i = 0; i < SHAFTS.length; i++) {
      var s = SHAFTS[i];
      var sway = Math.sin(t * s.sp + s.ph) * offW * 0.02;
      var x = offW * s.x + sway;
      var top = -offH * 0.05;
      var bottom = offH * (0.62 + 0.08 * Math.sin(t * s.sp * 1.7 + s.ph));
      var grad = g.createLinearGradient(x, top, x + offW * 0.18, bottom);
      grad.addColorStop(0, 'rgba(226, 238, 176, ' + (s.a * 1.2).toFixed(3) + ')');
      grad.addColorStop(0.55, 'rgba(206, 228, 150, ' + (s.a * 0.6).toFixed(3) + ')');
      grad.addColorStop(1, 'rgba(206, 228, 150, 0)');
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(x - offW * s.w * 0.20, top);
      g.lineTo(x + offW * s.w * 0.24, top);
      g.lineTo(x + offW * s.w * 1.05, bottom);
      g.lineTo(x - offW * s.w * 0.55, bottom);
      g.closePath();
      g.fill();
    }
    if (useFilter) { g.filter = 'none'; }
  }

  function drawFluid() {
    octx.globalCompositeOperation = 'source-over';
    octx.drawImage(base, 0, 0);
    octx.globalCompositeOperation = 'lighter';

    var radiusBase = Math.max(offW, offH);
    for (var i = 0; i < BLOBS.length; i++) {
      var b = BLOBS[i];
      var x = (0.5 + 0.40 * Math.sin(t * b.fx + b.px) + 0.08 * Math.sin(t * b.fx * 2.7 + b.px * 1.7)) * offW;
      var y = (0.5 + 0.34 * Math.cos(t * b.fy + b.py) + 0.07 * Math.cos(t * b.fy * 2.1 + b.py * 0.7)) * offH;
      var rad = (b.r + 0.10 * Math.sin(t * 0.09 + b.sd)) * radiusBase;
      var rot = b.sp * Math.sin(t * 0.05 + b.sd) + b.sd;

      var rg = octx.createRadialGradient(0, 0, 0, 0, 0, rad);
      rg.addColorStop(0, 'rgba(' + b.c[0] + ', ' + b.c[1] + ', ' + b.c[2] + ', ' + b.a + ')');
      rg.addColorStop(0.55, 'rgba(' + b.c[0] + ', ' + b.c[1] + ', ' + b.c[2] + ', ' + (b.a * 0.42).toFixed(3) + ')');
      rg.addColorStop(1, 'rgba(' + b.c[0] + ', ' + b.c[1] + ', ' + b.c[2] + ', 0)');

      octx.save();
      octx.translate(x, y);
      octx.rotate(rot);
      octx.scale(1, b.sq + 0.10 * Math.sin(t * 0.06 + b.px));
      octx.fillStyle = rg;
      octx.fillRect(-rad, -rad, rad * 2, rad * 2);
      octx.restore();
    }

    octx.globalCompositeOperation = 'source-over';
    drawShafts(octx);
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    W = Math.max(1, window.innerWidth);
    H = Math.max(1, window.innerHeight);

    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;

    offW = Math.max(200, Math.min(760, Math.round(W * RENDER_SCALE)));
    offH = Math.max(120, Math.min(440, Math.round(H * RENDER_SCALE)));
    off = document.createElement('canvas');
    off.width = offW;
    off.height = offH;
    octx = off.getContext('2d');
    renderBase();

    buildScene();
    drawFrame();
  }

  function buildScene() {
    leaves.length = 0;

    // 前景大叶：从角落探出来，框住画面
    leaves.push(newLeaf(-0.02, 1.02, 0.95, -0.55, 0.85, 0.9, true));
    leaves.push(newLeaf(0.06, 0.96, 0.72, -0.95, 0.65, 0.8, true));
    leaves.push(newLeaf(1.02, 1.05, 0.85, 2.55, 0.55, 0.95, true));
    leaves.push(newLeaf(0.97, -0.03, 0.62, 2.35, 0.75, 0.85, true));
    // 中景：左右两侧各一丛，别挡中间
    leaves.push(newLeaf(0.02, 0.66, 0.42, -0.30, 0.55, 0.75, false));
    leaves.push(newLeaf(0.96, 0.44, 0.40, 2.85, 0.45, 0.7, false));
    leaves.push(newLeaf(0.10, 0.30, 0.26, -1.15, 0.9, 0.55, false));
    leaves.push(newLeaf(0.88, 0.22, 0.24, 2.0, 0.8, 0.5, false));
    // 顶部垂下来的两根藤
    leaves.push(newLeaf(0.35, -0.02, 0.22, 1.35, 0.6, 0.6, false));
    leaves.push(newLeaf(0.62, -0.03, 0.20, 1.75, 0.5, 0.6, false));

    parrots.length = 0;
    parrots.push(newParrot(0.20, 0.30, 0.16, 62, 1, 0.055, 0.9));
    parrots.push(newParrot(0.64, 0.15, 0.13, 46, 1, 0.041, 2.6));
    parrots.push(newParrot(0.80, 0.42, 0.10, 34, -1, 0.033, 4.1));

    fireflies.length = 0;
    for (var i = 0; i < 34; i++) {
      fireflies.push({
        x: rand(0.02, 0.98),
        y: rand(0.25, 0.95),
        r: rand(0.9, 2.2),
        ph: rand(0, Math.PI * 2),
        sp: rand(0.25, 0.8),
        amp: rand(0.01, 0.05)
      });
    }
  }

  function newLeaf(nx, ny, scale, rot, swayAmp, alpha, front) {
    return {
      nx: nx, ny: ny,
      scale: scale,
      rot: rot,
      swayAmp: swayAmp,
      ph: rand(0, Math.PI * 2),
      sp: rand(0.20, 0.55),
      alpha: alpha,
      front: front
    };
  }

  function newParrot(nx, ny, scale, size, dir, speed, ph) {
    return {
      nx: nx, ny: ny,
      scale: scale,
      size: size,
      dir: dir,
      speed: speed,
      ph: ph,
      flap: rand(7.5, 10.5),
      gold: Math.random() < 0.5
    };
  }

  // 一片叶子：尖叶 + 中脉 + 侧脉 + 边缘亮线（雨林里叶子靠轮廓认）
  function drawLeaf(x, y, size, rot, alpha, front) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.globalAlpha = alpha;

    var body = front
      ? 'rgba(13, 46, 32, 0.94)'
      : 'rgba(18, 62, 42, 0.78)';
    var rimLight = front ? 'rgba(170, 240, 190, 0.60)' : 'rgba(120, 200, 155, 0.40)';

    // 叶柄
    ctx.strokeStyle = 'rgba(16, 52, 34, ' + (front ? 0.95 : 0.7) + ')';
    ctx.lineWidth = Math.max(1.2, size * 0.035);
    ctx.beginPath();
    ctx.moveTo(0, size * 0.10);
    ctx.lineTo(0, size * 1.02);
    ctx.stroke();

    // 叶身：上宽下窄的尖叶（带一点点厚度感）
    var leafPath = function () {
      ctx.beginPath();
      ctx.moveTo(0, -size * 1.02);
      ctx.bezierCurveTo(size * 0.56, -size * 0.50, size * 0.66, size * 0.10, 0, size * 0.36);
      ctx.bezierCurveTo(-size * 0.66, size * 0.10, -size * 0.56, -size * 0.50, 0, -size * 1.02);
      ctx.closePath();
    };
    leafPath();
    var lg = ctx.createLinearGradient(0, -size, 0, size * 0.4);
    if (front) {
      lg.addColorStop(0, 'rgba(78, 176, 116, 0.66)');
      lg.addColorStop(0.42, 'rgba(40, 128, 84, 0.64)');
      lg.addColorStop(1, 'rgba(16, 72, 48, 0.78)');
    } else {
      lg.addColorStop(0, 'rgba(96, 186, 128, 0.34)');
      lg.addColorStop(0.5, 'rgba(48, 132, 88, 0.30)');
      lg.addColorStop(1, 'rgba(20, 76, 50, 0.36)');
    }
    ctx.fillStyle = lg;
    ctx.fill();

    // 边缘亮线：让剪影从背景里浮出来
    leafPath();
    ctx.strokeStyle = rimLight;
    ctx.lineWidth = Math.max(1.2, size * (front ? 0.034 : 0.024));
    ctx.stroke();

    // 中脉
    ctx.strokeStyle = rimLight;
    ctx.lineWidth = Math.max(1, size * 0.022);
    ctx.beginPath();
    ctx.moveTo(0, size * 0.30);
    ctx.lineTo(0, -size * 0.95);
    ctx.stroke();

    // 侧脉
    ctx.strokeStyle = front ? 'rgba(140, 210, 168, 0.28)' : 'rgba(100, 176, 136, 0.16)';
    var veins = front ? 7 : 5;
    for (var i = 1; i <= veins; i++) {
      var yy = size * 0.24 - (size * 1.12) * (i / (veins + 1));
      var spread = size * 0.52 * (1 - Math.abs(i / (veins + 1) - 0.45));
      ctx.beginPath();
      ctx.moveTo(0, yy);
      ctx.quadraticCurveTo(spread * 0.5, yy - size * 0.10, spread, yy - size * 0.20);
      ctx.moveTo(0, yy);
      ctx.quadraticCurveTo(-spread * 0.5, yy - size * 0.10, -spread, yy - size * 0.20);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawParrot(p) {
    var s = p.size;
    var x = p.nx * W + Math.sin(t * 0.12 + p.ph) * W * 0.05;
    var y = p.ny * H + Math.sin(t * 0.30 + p.ph) * H * 0.028;
    var flap = Math.sin(t * p.flap + p.ph);
    var lift = (flap + 1) * 0.5;          // 0..1
    var down = Math.max(0, -flap);        // 下扑的量

    var bodyCol = p.gold ? 'rgba(238, 186, 60, 0.97)' : 'rgba(206, 66, 50, 0.97)';
    var wingCol = p.gold ? 'rgba(248, 212, 108, 0.96)' : 'rgba(48, 92, 198, 0.95)';
    var tailCol = p.gold ? 'rgba(206, 158, 40, 0.95)' : 'rgba(158, 44, 40, 0.95)';
    var beakCol = p.gold ? 'rgba(78, 62, 44, 0.95)' : 'rgba(46, 40, 34, 0.95)';

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(p.dir, 1);
    ctx.rotate(Math.sin(t * 0.6 + p.ph) * 0.05);

    // 长尾：三根羽
    ctx.fillStyle = tailCol;
    for (var k2 = -1; k2 <= 1; k2++) {
      ctx.beginPath();
      ctx.moveTo(-s * 0.30, k2 * s * 0.03);
      ctx.quadraticCurveTo(-s * 1.05, k2 * s * 0.12 - s * 0.04, -s * 1.55, k2 * s * 0.22 + s * 0.02);
      ctx.quadraticCurveTo(-s * 1.00, k2 * s * 0.12 + s * 0.07, -s * 0.30, k2 * s * 0.03 + s * 0.07);
      ctx.closePath();
      ctx.fill();
    }

    // 远侧翅膀（先画，稍微暗一点）
    ctx.fillStyle = 'rgba(20, 44, 90, 0.75)';
    ctx.beginPath();
    ctx.moveTo(s * 0.05, -s * 0.02);
    ctx.quadraticCurveTo(-s * 0.30, -s * (0.55 + 0.55 * lift), -s * 0.85, -s * (0.30 + 0.75 * lift));
    ctx.quadraticCurveTo(-s * 0.35, -s * (0.10 + 0.25 * lift), s * 0.05, -s * 0.02);
    ctx.closePath();
    ctx.fill();

    // 身体：流线的纺锤形
    ctx.fillStyle = bodyCol;
    ctx.beginPath();
    ctx.moveTo(s * 0.62, -s * 0.06);
    ctx.quadraticCurveTo(s * 0.30, -s * 0.30, -s * 0.20, -s * 0.22);
    ctx.quadraticCurveTo(-s * 0.55, -s * 0.14, -s * 0.52, s * 0.04);
    ctx.quadraticCurveTo(-s * 0.42, s * 0.24, s * 0.05, s * 0.22);
    ctx.quadraticCurveTo(s * 0.45, s * 0.18, s * 0.62, -s * 0.06);
    ctx.closePath();
    ctx.fill();

    // 头
    ctx.beginPath();
    ctx.arc(s * 0.66, -s * 0.16, s * 0.22, 0, Math.PI * 2);
    ctx.fill();

    // 钩喙：上喙往下勾，下喙短
    ctx.fillStyle = beakCol;
    ctx.beginPath();
    ctx.moveTo(s * 0.82, -s * 0.22);
    ctx.quadraticCurveTo(s * 1.10, -s * 0.16, s * 1.06, -s * 0.02);
    ctx.quadraticCurveTo(s * 0.98, -s * 0.08, s * 0.84, -s * 0.10);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(s * 0.84, -s * 0.10);
    ctx.quadraticCurveTo(s * 0.96, -s * 0.06, s * 0.90, s * 0.00);
    ctx.quadraticCurveTo(s * 0.82, -s * 0.04, s * 0.84, -s * 0.10);
    ctx.closePath();
    ctx.fill();

    // 眼
    ctx.beginPath();
    ctx.arc(s * 0.70, -s * 0.20, Math.max(1, s * 0.045), 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(250, 250, 238, 0.95)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(s * 0.715, -s * 0.20, Math.max(0.6, s * 0.022), 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(16, 18, 20, 0.95)';
    ctx.fill();

    // 近侧翅膀：扇动时上下扫
    ctx.fillStyle = wingCol;
    ctx.beginPath();
    ctx.moveTo(s * 0.12, s * 0.02);
    ctx.quadraticCurveTo(-s * 0.30, -s * (0.95 * lift + 0.14) - s * 0.06,
      -s * 1.20, -s * (1.25 * lift + 0.06) + s * 0.30 * down);
    ctx.quadraticCurveTo(-s * 0.55, -s * (0.28 * lift) + s * 0.34,
      s * 0.00, s * 0.22);
    ctx.quadraticCurveTo(s * 0.10, s * 0.14, s * 0.12, s * 0.02);
    ctx.closePath();
    ctx.fill();
    // 翼尖再压一层稍深的色，层次更清楚
    ctx.beginPath();
    ctx.moveTo(-s * 0.52, -s * (0.34 * lift) + s * 0.10);
    ctx.quadraticCurveTo(-s * 0.85, -s * (0.95 * lift) + s * 0.02,
      -s * 1.20, -s * (1.25 * lift + 0.06) + s * 0.30 * down);
    ctx.quadraticCurveTo(-s * 0.95, -s * 0.10 + s * 0.12, -s * 0.52, -s * (0.34 * lift) + s * 0.10);
    ctx.closePath();
    ctx.fillStyle = p.gold ? 'rgba(206, 158, 44, 0.85)' : 'rgba(34, 66, 150, 0.85)';
    ctx.fill();

    // 翅膀上的一道浅色翼带
    ctx.strokeStyle = 'rgba(255, 250, 220, 0.35)';
    ctx.lineWidth = Math.max(1, s * 0.035);
    ctx.beginPath();
    ctx.moveTo(-s * 0.10, -s * 0.02);
    ctx.quadraticCurveTo(-s * 0.40, -s * (0.28 * lift + 0.06), -s * 0.78, -s * (0.55 * lift) + s * 0.12);
    ctx.stroke();

    ctx.restore();
  }

  // 栖在枝头的巨嘴鸟
  function drawToucan() {
    var s = Math.max(0.8, H / 720) * 58;
    var x = W * 0.865;
    var y = H * 0.585 + Math.sin(t * 0.7) * s * 0.02;
    var bob = Math.sin(t * 0.9) * 0.03;

    ctx.save();
    ctx.translate(x, y);

    // 树枝（从右边伸进来）
    ctx.strokeStyle = 'rgba(8, 26, 18, 0.95)';
    ctx.lineWidth = s * 0.16;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(s * 0.9, s * 0.42);
    ctx.quadraticCurveTo(s * 0.30, s * 0.34, -s * 0.9, s * 0.52);
    ctx.stroke();

    // 尾羽
    ctx.fillStyle = 'rgba(12, 20, 22, 0.95)';
    ctx.beginPath();
    ctx.moveTo(-s * 0.05, s * 0.05);
    ctx.lineTo(-s * 0.62, s * 0.16);
    ctx.lineTo(-s * 0.10, s * 0.26);
    ctx.closePath();
    ctx.fill();

    // 身体
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.34, s * 0.44, -0.10, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(18, 26, 30, 0.97)';
    ctx.fill();

    // 白胸 + 红尾根
    ctx.beginPath();
    ctx.ellipse(s * 0.05, s * 0.10, s * 0.20, s * 0.24, -0.10, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(238, 240, 232, 0.92)';
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-s * 0.12, s * 0.24, s * 0.14, s * 0.12, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(196, 52, 44, 0.85)';
    ctx.fill();

    // 头
    ctx.rotate(bob);
    ctx.beginPath();
    ctx.arc(s * 0.10, -s * 0.44, s * 0.27, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(20, 28, 32, 0.98)';
    ctx.fill();

    // 大嘴：上喙 + 下喙
    ctx.beginPath();
    ctx.moveTo(s * 0.30, -s * 0.52);
    ctx.quadraticCurveTo(s * 0.92, -s * 0.48, s * 0.98, -s * 0.30);
    ctx.quadraticCurveTo(s * 0.62, -s * 0.24, s * 0.30, -s * 0.34);
    ctx.closePath();
    ctx.fillStyle = 'rgba(240, 172, 44, 0.97)';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(s * 0.30, -s * 0.34);
    ctx.quadraticCurveTo(s * 0.66, -s * 0.26, s * 0.90, -s * 0.28);
    ctx.quadraticCurveTo(s * 0.60, -s * 0.16, s * 0.30, -s * 0.22);
    ctx.closePath();
    ctx.fillStyle = 'rgba(196, 74, 30, 0.95)';
    ctx.fill();
    // 嘴尖的暗色
    ctx.beginPath();
    ctx.moveTo(s * 0.82, -s * 0.34);
    ctx.quadraticCurveTo(s * 0.98, -s * 0.32, s * 0.98, -s * 0.28);
    ctx.quadraticCurveTo(s * 0.88, -s * 0.26, s * 0.82, -s * 0.30);
    ctx.closePath();
    ctx.fillStyle = 'rgba(40, 34, 30, 0.9)';
    ctx.fill();

    // 眼周 + 眼睛
    ctx.beginPath();
    ctx.arc(s * 0.20, -s * 0.50, s * 0.085, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(90, 150, 190, 0.85)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(s * 0.20, -s * 0.50, Math.max(1, s * 0.035), 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(12, 14, 16, 0.98)';
    ctx.fill();

    ctx.restore();
  }

  function drawTrunks() {
    var list = [
      { x: 0.045, w: 0.075, a: 0.92 },
      { x: 0.965, w: 0.065, a: 0.88 }
    ];
    for (var i = 0; i < list.length; i++) {
      var tr = list[i];
      var x = tr.x * W;
      var w = tr.w * W;
      var g = ctx.createLinearGradient(x - w, 0, x + w, 0);
      g.addColorStop(0, 'rgba(4, 18, 12, 0)');
      g.addColorStop(0.35, 'rgba(6, 24, 16, ' + tr.a + ')');
      g.addColorStop(0.6, 'rgba(10, 34, 22, ' + tr.a + ')');
      g.addColorStop(1, 'rgba(4, 18, 12, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x - w, 0);
      ctx.lineTo(x + w, 0);
      ctx.quadraticCurveTo(x + w * 0.72, H * 0.55, x + w * 0.55, H);
      ctx.lineTo(x - w * 0.70, H);
      ctx.quadraticCurveTo(x - w * 0.95, H * 0.5, x - w, 0);
      ctx.closePath();
      ctx.fill();

      // 树皮上的亮边
      ctx.strokeStyle = 'rgba(120, 200, 150, 0.10)';
      ctx.lineWidth = Math.max(1, W * 0.0015);
      ctx.beginPath();
      ctx.moveTo(x + w * 0.55, 0);
      ctx.quadraticCurveTo(x + w * 0.40, H * 0.55, x + w * 0.28, H);
      ctx.stroke();
    }
  }

  function drawVines() {
    // 从树冠垂下来的藤条，随风轻摆
    for (var i = 0; i < 5; i++) {
      var x0 = (0.06 + i * 0.22) * W;
      var sway = Math.sin(t * 0.35 + i * 1.7) * W * 0.012;
      var len = H * (0.28 + 0.20 * ((i * 7) % 5) / 5);
      ctx.beginPath();
      ctx.moveTo(x0, -10);
      ctx.bezierCurveTo(x0 + W * 0.03 + sway, len * 0.35, x0 - W * 0.02 + sway,
        len * 0.75, x0 + sway * 1.4, len);
      ctx.strokeStyle = 'rgba(10, 40, 28, 0.85)';
      ctx.lineWidth = Math.max(1.2, H * 0.0035);
      ctx.stroke();

      // 藤上的小叶子
      for (var k = 1; k <= 4; k++) {
        var p = k / 5;
        var vx = x0 + W * 0.03 * Math.sin(p * 3.1) + sway * p;
        var vy = len * p;
        var rr = H * 0.016 * (1 - p * 0.4);
        ctx.beginPath();
        ctx.ellipse(vx + rr * 0.9, vy, rr * 1.5, rr * 0.7,
          (k % 2 ? 0.5 : -0.5) + Math.sin(t * 0.6 + i + k) * 0.12, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(22, 70, 46, 0.85)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(120, 196, 150, 0.16)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  }

  function drawMist() {
    var g = ctx.createLinearGradient(0, H * 0.72, 0, H);
    g.addColorStop(0, 'rgba(120, 190, 150, 0)');
    g.addColorStop(1, 'rgba(120, 190, 150, 0.10)');
    ctx.fillStyle = g;
    ctx.fillRect(0, H * 0.72, W, H * 0.28);
  }

  function drawButterflies() {
    for (var i = 0; i < 2; i++) {
      var ph = i * 2.6;
      var cx = (0.30 + 0.20 * Math.sin(t * 0.13 + ph) + i * 0.34) * W;
      var cy = (0.58 + 0.10 * Math.sin(t * 0.31 + ph * 1.4)) * H;
      var flap = Math.sin(t * 9.0 + ph);
      var sc = Math.max(0.8, H / 720) * (24 + i * 6);
      var wing = 0.35 + 0.65 * Math.abs(flap);

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(Math.sin(t * 0.5 + ph) * 0.25);

      // 一对翅膀：上大下小，扇动时横向缩放
      for (var k = -1; k <= 1; k += 2) {
        ctx.save();
        ctx.scale(k * wing, 1);
        ctx.beginPath();
        ctx.ellipse(sc * 0.55, -sc * 0.18, sc * 0.62, sc * 0.46, -0.35, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(64, 116, 226, 0.80)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(180, 216, 255, 0.55)';
        ctx.lineWidth = Math.max(1, sc * 0.06);
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(sc * 0.38, sc * 0.34, sc * 0.40, sc * 0.28, 0.25, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(48, 92, 196, 0.76)';
        ctx.fill();
        ctx.stroke();
        // 翅膀白斑
        ctx.beginPath();
        ctx.arc(sc * 0.62, -sc * 0.22, sc * 0.12, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(226, 240, 255, 0.75)';
        ctx.fill();
        ctx.restore();
      }
      // 身体
      ctx.beginPath();
      ctx.ellipse(0, 0, sc * 0.10, sc * 0.42, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(16, 24, 30, 0.95)';
      ctx.fill();
      ctx.restore();
    }
  }

  function drawFireflies() {
    for (var i = 0; i < fireflies.length; i++) {
      var f = fireflies[i];
      var x = (f.x + Math.sin(t * f.sp + f.ph) * f.amp) * W;
      var y = (f.y + Math.cos(t * f.sp * 0.8 + f.ph * 1.3) * f.amp * 0.7) * H;
      var tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 2.2 + f.ph * 2.0));
      var r = f.r * (0.7 + tw * 0.9);
      var rg = ctx.createRadialGradient(x, y, 0, x, y, r * 6);
      rg.addColorStop(0, 'rgba(246, 250, 176, ' + (0.55 * tw).toFixed(3) + ')');
      rg.addColorStop(0.4, 'rgba(210, 236, 130, ' + (0.18 * tw).toFixed(3) + ')');
      rg.addColorStop(1, 'rgba(210, 236, 130, 0)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(x, y, r * 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(x, y, r * 0.7, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(252, 254, 210, ' + (0.7 * tw).toFixed(3) + ')';
      ctx.fill();
    }
  }

  function drawLeaves(front) {
    for (var i = 0; i < leaves.length; i++) {
      var lf = leaves[i];
      if (lf.front !== front) { continue; }
      var sway = Math.sin(t * lf.sp + lf.ph) * lf.swayAmp;
      drawLeaf(lf.nx * W, lf.ny * H, lf.scale * Math.max(W, H) * 0.30, lf.rot + sway, lf.alpha, front);
    }
  }

  function drawFrame() {
    drawFluid();

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(off, 0, 0, offW, offH, 0, 0, W, H);

    // 树干 → 藤条 → 后景叶子 → 动物 → 前景叶子 → 萤火
    drawTrunks();
    drawVines();
    drawMist();
    drawLeaves(false);
    for (var i = 0; i < parrots.length; i++) { drawParrot(parrots[i]); }
    drawToucan();
    drawButterflies();
    drawFireflies();
    drawLeaves(true);
  }

  function frame(ts) {
    rafId = window.requestAnimationFrame(frame);
    if (!last) { last = ts; return; }
    var dt = Math.min(0.05, (ts - last) / 1000);
    last = ts;
    t += dt;
    drawFrame();
  }

  function start() {
    if (!rafId) { last = 0; rafId = window.requestAnimationFrame(frame); }
  }

  function stop() {
    if (rafId) { window.cancelAnimationFrame(rafId); rafId = 0; }
  }

  window.addEventListener('resize', function () {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(resize, 120);
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { stop(); } else { start(); }
  });

  makeGrain();
  resize();
  start();
}());
