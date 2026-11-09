/* 数字雨 —— 绿色字符下落 + 拖尾 + 随机亮度 */
(function () {
  'use strict';

  var canvas = document.getElementById('scene');
  var ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) { return; }

  var FONT = "'Segoe UI', 'Microsoft YaHei UI', system-ui, sans-serif";
  var GLYPHS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  var MAX_DPR = 2;

  var W = 1;
  var H = 1;
  var dpr = 1;
  var cell = 18;
  var cols = 0;
  var drops = [];
  var rafId = 0;
  var last = 0;
  var resizeTimer = 0;

  function rand(a, b) {
    return a + Math.random() * (b - a);
  }

  function pickChar() {
    return GLYPHS.charAt((Math.random() * GLYPHS.length) | 0);
  }

  function newDrop() {
    return {
      y: -rand(0, 18),          // 以字符格为单位
      row: -9999,               // 上一帧所在行，行未变化时不重复绘制
      speed: rand(7, 27),       // 格/秒
      bright: rand(0.45, 1),    // 随机亮度
      char: pickChar()
    };
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
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    cell = Math.round(Math.max(14, Math.min(30, H / 46)));
    cols = Math.ceil(W / cell) + 1;
    drops.length = 0;
    for (var i = 0; i < cols; i++) {
      var d = newDrop();
      d.y = -rand(0, H / cell);
      drops.push(d);
    }

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);
    // 预热若干帧，页面一出现就是成型的雨幕，也用于截图
    warmup(150);
  }

  function advance(dt) {
    for (var i = 0; i < cols; i++) {
      var d = drops[i];
      d.y += d.speed * dt;
      if (d.y * cell > H + cell * 3) {
        d.y = -rand(0, 14);
        d.row = -9999;
        d.speed = rand(7, 27);
        d.bright = rand(0.45, 1);
      }
    }
  }

  function draw(dt) {
    // 每帧只做轻微压暗，字符自然留下拖尾
    var fade = 1 - Math.pow(0.955, dt * 60);
    ctx.fillStyle = 'rgba(0, 0, 0, ' + fade.toFixed(3) + ')';
    ctx.fillRect(0, 0, W, H);
    ctx.font = cell + 'px ' + FONT;

    for (var i = 0; i < cols; i++) {
      var d = drops[i];
      var row = Math.floor(d.y);
      if (row === d.row) { continue; }
      d.row = row;
      d.char = pickChar();       // 每一行都是新字符，雨幕才不呆板
      var y = row * cell + cell * 0.5;
      if (y < -cell * 2 || y > H + cell * 2) { continue; }
      var x = i * cell + cell * 0.5;
      // 亮度和色相都带一点随机，避免整屏一个颜色
      var r = Math.round(56 + d.bright * 84);
      var g = Math.round(226 + d.bright * 29);
      var b = Math.round(120 + d.bright * 70);
      var a = 0.55 + d.bright * 0.45;
      ctx.fillStyle = 'rgba(' + r + ', ' + g + ', ' + b + ', ' + a.toFixed(3) + ')';
      ctx.fillText(d.char, x, y);
    }
  }

  function warmup(frames) {
    var dt = 1 / 60;
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
