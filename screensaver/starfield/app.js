/* 星空穿越 —— 3D 星点向观察者飞来，远近决定大小与拖尾 */
(function () {
  'use strict';

  var canvas = document.getElementById('scene');
  var ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) { return; }

  var MAX_DPR = 2;
  var COLORS = [
    '223, 233, 255',   // 冷白
    '169, 200, 255',   // 偏蓝
    '255, 233, 201',   // 暖白
    '201, 181, 255'    // 淡紫
  ];

  var W = 1;
  var H = 1;
  var dpr = 1;
  var cx = 0.5;
  var cy = 0.5;
  var stars = [];
  var bg = null;
  var rafId = 0;
  var last = 0;
  var resizeTimer = 0;

  function rand(a, b) {
    return a + Math.random() * (b - a);
  }

  function spawn(s, keepZ) {
    // 远平面覆盖整屏，z 越小越靠近观察者
    s.x = rand(-1, 1) * W * 0.55;
    s.y = rand(-1, 1) * H * 0.55;
    s.z = keepZ ? rand(0.04, 1) : 1;
    s.speed = rand(0.34, 0.68);
    s.bright = rand(0.60, 1);
    s.color = COLORS[(Math.random() * COLORS.length) | 0];
    return s;
  }

  function makeStars() {
    var count = Math.round(Math.min(1800, Math.max(420, W * H / 1200)));
    stars.length = 0;
    for (var i = 0; i < count; i++) {
      stars.push(spawn({}, true));
    }
  }

  function makeBackground() {
    var bw = Math.max(160, Math.ceil(W / 4));
    var bh = Math.max(90, Math.ceil(H / 4));
    bg = document.createElement('canvas');
    bg.width = bw;
    bg.height = bh;
    var g = bg.getContext('2d');

    var base = g.createLinearGradient(0, 0, bw * 0.3, bh);
    base.addColorStop(0, '#04060f');
    base.addColorStop(0.5, '#060a17');
    base.addColorStop(1, '#02030a');
    g.fillStyle = base;
    g.fillRect(0, 0, bw, bh);

    // 星云团：几块低饱和的冷色光雾
    var clouds = [
      { x: 0.24, y: 0.32, r: 0.62, c: 'rgba(52, 92, 190, 0.62)' },
      { x: 0.76, y: 0.24, r: 0.55, c: 'rgba(118, 64, 176, 0.48)' },
      { x: 0.58, y: 0.74, r: 0.66, c: 'rgba(26, 122, 148, 0.38)' },
      { x: 0.12, y: 0.86, r: 0.48, c: 'rgba(88, 40, 136, 0.40)' },
      { x: 0.92, y: 0.78, r: 0.42, c: 'rgba(46, 82, 164, 0.34)' }
    ];
    for (var i = 0; i < clouds.length; i++) {
      var c = clouds[i];
      var px = c.x * bw;
      var py = c.y * bh;
      var r = c.r * Math.max(bw, bh);
      var rg = g.createRadialGradient(px, py, 0, px, py, r);
      rg.addColorStop(0, c.c);
      rg.addColorStop(0.55, c.c.replace(/[\d.]+\)$/, '0.16)'));
      rg.addColorStop(1, 'rgba(0, 0, 0, 0)');
      g.fillStyle = rg;
      g.fillRect(0, 0, bw, bh);
    }

    // 斜向银河薄雾
    var band = g.createLinearGradient(0, bh, bw, 0);
    band.addColorStop(0.30, 'rgba(0, 0, 0, 0)');
    band.addColorStop(0.48, 'rgba(120, 150, 220, 0.10)');
    band.addColorStop(0.55, 'rgba(170, 190, 240, 0.06)');
    band.addColorStop(0.72, 'rgba(0, 0, 0, 0)');
    g.fillStyle = band;
    g.fillRect(0, 0, bw, bh);

    // 边缘压暗
    var vig = g.createRadialGradient(bw / 2, bh / 2, 0, bw / 2, bh / 2, Math.max(bw, bh) * 0.62);
    vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vig.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
    g.fillStyle = vig;
    g.fillRect(0, 0, bw, bh);
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
    ctx.lineCap = 'round';

    cx = W / 2;
    cy = H / 2;
    makeBackground();
    makeStars();
    warmup(90);
  }

  function advance(dt) {
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      s.z -= s.speed * dt;
      if (s.z <= 0.018) {
        spawn(s, false);
      }
    }
  }

  function draw(dt) {
    ctx.drawImage(bg, 0, 0, W, H);

    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      var inv = 1 / s.z;
      var sx = cx + s.x * inv;
      var sy = cy + s.y * inv;
      var margin = 90;

      if (sx < -margin || sx > W + margin || sy < -margin || sy > H + margin) {
        spawn(s, false);
        continue;
      }

      var depth = 1 - Math.min(1, s.z);
      var a = (0.15 + depth * 0.85) * s.bright;
      var lw = 0.5 + depth * 2.6;

      // 用固定时间差取拖尾起点，帧率变化时速度线也保持同样的长度
      var trail = s.z + s.speed * 0.045;
      if (trail > 1) { trail = 1; }
      var tx = cx + s.x / trail;
      var ty = cy + s.y / trail;

      ctx.globalAlpha = Math.min(1, a);
      ctx.strokeStyle = 'rgb(' + s.color + ')';
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(sx, sy);
      ctx.stroke();

      if (s.z < 0.5) {
        ctx.globalAlpha = Math.min(1, a + 0.08);
        ctx.fillStyle = 'rgb(' + s.color + ')';
        ctx.beginPath();
        ctx.arc(sx, sy, 0.6 + depth * 2.0, 0, 6.2832);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function warmup(frames) {
    // 用较大的步长预演，既能快速铺满星空，也能让拖尾更明显
    var dt = 1 / 30;
    for (var i = 0; i < frames; i++) {
      advance(dt);
      draw(dt);
    }
  }

  function frame(ts) {
    rafId = window.requestAnimationFrame(frame);
    if (!last) {
      last = ts;
      return;
    }
    var dt = Math.min(0.05, (ts - last) / 1000);
    last = ts;
    if (dt <= 0) { return; }
    advance(dt);
    draw(dt);
  }

  function start() {
    if (!rafId) {
      last = 0;
      rafId = window.requestAnimationFrame(frame);
    }
  }

  function stop() {
    if (rafId) {
      window.cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }

  window.addEventListener('resize', function () {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(resize, 120);
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { stop(); } else { start(); }
  });

  resize();
  start();
}());
