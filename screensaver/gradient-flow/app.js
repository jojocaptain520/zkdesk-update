/* 流体渐变 —— 多层色块缓慢流动，用 canvas 2D 叠加出极光/油彩感 */
(function () {
  'use strict';

  var canvas = document.getElementById('scene');
  var ctx = canvas.getContext('2d');
  var grainEl = document.getElementById('grain');
  if (!ctx) { return; }

  var MAX_DPR = 2;
  var RENDER_SCALE = 0.30;   // 先低分辨率画，再放大，天然柔化

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
  var t = 25;               // 从非零相位开始，避免色块叠在一起
  var resizeTimer = 0;

  // 色块参数：颜色、透明度、运动频率、初相、大小、纵向压扁、旋转
  var BLOBS = [
    { c: [28, 64, 220], a: 0.46, fx: 0.047, fy: 0.061, px: 0.8, py: 2.0, r: 0.58, sq: 0.60, sp: 0.05, sd: 1.0 },
    { c: [150, 42, 230], a: 0.42, fx: 0.038, fy: 0.055, px: 2.9, py: 0.7, r: 0.52, sq: 0.50, sp: 0.07, sd: 2.1 },
    { c: [0, 180, 210], a: 0.36, fx: 0.061, fy: 0.043, px: 4.6, py: 3.6, r: 0.44, sq: 0.70, sp: 0.04, sd: 3.2 },
    { c: [235, 60, 170], a: 0.30, fx: 0.033, fy: 0.048, px: 5.8, py: 1.4, r: 0.40, sq: 0.55, sp: 0.06, sd: 4.4 },
    { c: [10, 150, 130], a: 0.34, fx: 0.055, fy: 0.036, px: 1.9, py: 5.4, r: 0.46, sq: 0.80, sp: 0.03, sd: 5.5 },
    { c: [60, 40, 200], a: 0.38, fx: 0.044, fy: 0.064, px: 3.5, py: 4.6, r: 0.62, sq: 0.45, sp: 0.08, sd: 6.6 },
    { c: [255, 170, 70], a: 0.22, fx: 0.036, fy: 0.052, px: 2.2, py: 6.1, r: 0.32, sq: 0.60, sp: 0.09, sd: 7.3 }
  ];

  // 拉长的极光带
  var RIBBONS = [
    { c: [120, 240, 255], a: 0.20, fx: 0.031, fy: 0.044, px: 1.2, py: 2.6, len: 1.15, thick: 0.10, base: -0.50 },
    { c: [255, 90, 200], a: 0.15, fx: 0.025, fy: 0.036, px: 3.6, py: 5.1, len: 1.05, thick: 0.09, base: 0.35 },
    { c: [80, 130, 255], a: 0.17, fx: 0.043, fy: 0.029, px: 5.0, py: 0.8, len: 1.28, thick: 0.12, base: 0.15 }
  ];

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

    var g = baseCtx.createLinearGradient(0, 0, offW * 0.25, offH);
    g.addColorStop(0, '#070b1c');
    g.addColorStop(0.45, '#050714');
    g.addColorStop(1, '#02020a');
    baseCtx.fillStyle = g;
    baseCtx.fillRect(0, 0, offW, offH);

    // 底部一点冷色反光，避免下缘死黑
    var bottom = baseCtx.createLinearGradient(0, offH * 0.55, 0, offH);
    bottom.addColorStop(0, 'rgba(10, 20, 46, 0)');
    bottom.addColorStop(1, 'rgba(16, 34, 74, 0.35)');
    baseCtx.fillStyle = bottom;
    baseCtx.fillRect(0, 0, offW, offH);
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

    offW = Math.max(200, Math.min(720, Math.round(W * RENDER_SCALE)));
    offH = Math.max(120, Math.min(420, Math.round(H * RENDER_SCALE)));
    off = document.createElement('canvas');
    off.width = offW;
    off.height = offH;
    octx = off.getContext('2d');
    renderBase();
    drawFrame();
  }

  function drawFrame() {
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

    // 极光带：大幅拉长的光晕，缓慢摆动
    for (var r = 0; r < RIBBONS.length; r++) {
      var rb = RIBBONS[r];
      var rx = (0.5 + 0.42 * Math.sin(t * rb.fx + rb.px)) * offW;
      var ry = (0.55 + 0.34 * Math.cos(t * rb.fy + rb.py)) * offH;
      var len = rb.len * Math.max(offW, offH) * 0.9;
      var ang = rb.base + 0.28 * Math.sin(t * 0.045 + rb.px);

      var rg2 = octx.createRadialGradient(0, 0, 0, 0, 0, len);
      rg2.addColorStop(0, 'rgba(' + rb.c[0] + ', ' + rb.c[1] + ', ' + rb.c[2] + ', ' + rb.a + ')');
      rg2.addColorStop(0.5, 'rgba(' + rb.c[0] + ', ' + rb.c[1] + ', ' + rb.c[2] + ', ' + (rb.a * 0.5).toFixed(3) + ')');
      rg2.addColorStop(1, 'rgba(' + rb.c[0] + ', ' + rb.c[1] + ', ' + rb.c[2] + ', 0)');

      octx.save();
      octx.translate(rx, ry);
      octx.rotate(ang);
      octx.scale(1, rb.thick + 0.03 * Math.sin(t * 0.05 + rb.py));
      octx.fillStyle = rg2;
      octx.fillRect(-len, -len, len * 2, len * 2);
      octx.restore();
    }

    octx.globalCompositeOperation = 'source-over';

    // 放大到整屏（平滑插值带来的柔化正是想要的效果）
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(off, 0, 0, offW, offH, 0, 0, W, H);
  }

  function frame(ts) {
    rafId = window.requestAnimationFrame(frame);
    if (!last) {
      last = ts;
      return;
    }
    var dt = Math.min(0.05, (ts - last) / 1000);
    last = ts;
    t += dt;
    drawFrame();
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

  makeGrain();
  resize();
  start();
}());
