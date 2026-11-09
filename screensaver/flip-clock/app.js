/* 翻页时钟 —— 数字翻页动画、日期星期、微弱浮尘 */
(function () {
  'use strict';

  var clock = document.getElementById('clock');
  var digits = clock.querySelectorAll('.digit');
  var dateEl = document.getElementById('date');
  var weekEl = document.getElementById('weekday');
  var secbar = document.getElementById('secbar');
  var dust = document.getElementById('dust');
  var dctx = dust.getContext('2d');
  if (!dctx) { return; }

  var WEEK = '日一二三四五六';
  var FLIP_MS = 300;
  var MAX_DPR = 2;

  var W = 1;
  var H = 1;
  var dpr = 1;
  var dots = [];
  var rafId = 0;
  var last = 0;
  var t = 0;
  var resizeTimer = 0;

  function rand(a, b) {
    return a + Math.random() * (b - a);
  }

  function pad2(n) {
    return (n < 10 ? '0' : '') + n;
  }

  /* ---------- 布局 ---------- */

  function layout() {
    var vw = Math.max(1, window.innerWidth);
    var vh = Math.max(1, window.innerHeight);
    var h = Math.min(vh * 0.40, vw * 0.16);
    h = Math.max(84, Math.min(420, h));
    var w = h * 0.72;

    var root = document.documentElement;
    root.style.setProperty('--card-h', h.toFixed(1) + 'px');
    root.style.setProperty('--card-w', w.toFixed(1) + 'px');
    root.style.setProperty('--digit-fs', (h * 0.86).toFixed(1) + 'px');

    initDust();
  }

  /* ---------- 背景浮尘 ---------- */

  function initDust() {
    dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    W = Math.max(1, window.innerWidth);
    H = Math.max(1, window.innerHeight);
    dust.width = Math.floor(W * dpr);
    dust.height = Math.floor(H * dpr);
    dust.style.width = W + 'px';
    dust.style.height = H + 'px';
    dctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var n = Math.round(Math.min(110, Math.max(36, W * H / 11000)));
    dots.length = 0;
    for (var i = 0; i < n; i++) {
      dots.push({
        x: rand(0, W),
        y: rand(0, H),
        r: rand(0.5, 2.0),
        vy: rand(-9, -3),
        a: rand(0.05, 0.18),
        tw: rand(0.2, 0.7),
        ph: rand(0, 6.2832)
      });
    }
  }

  function drawDust(dt) {
    dctx.clearRect(0, 0, W, H);
    dctx.fillStyle = '#f2e8cf';
    for (var i = 0; i < dots.length; i++) {
      var p = dots[i];
      p.y += p.vy * dt;
      p.x += Math.sin(t * 0.25 + p.ph) * 1.6 * dt;
      if (p.y < -12) {
        p.y = H + 12;
        p.x = rand(0, W);
      }
      if (p.x < -12) { p.x = W + 12; }
      if (p.x > W + 12) { p.x = -12; }
      dctx.globalAlpha = p.a * (0.55 + 0.45 * Math.sin(t * p.tw * 2 + p.ph));
      dctx.beginPath();
      dctx.arc(p.x, p.y, p.r, 0, 6.2832);
      dctx.fill();
    }
    dctx.globalAlpha = 1;
  }

  /* ---------- 翻页数字 ---------- */

  function setDigit(el, ch) {
    var old = el.dataset.cur;
    if (old === ch) { return; }
    el.dataset.cur = ch;

    var top = el.querySelector('.half.top span');
    var bottom = el.querySelector('.half.bottom span');
    var front = el.querySelector('.leaf.front span');
    var back = el.querySelector('.leaf.back span');

    // 首次赋值不做动画
    if (typeof old === 'undefined') {
      top.textContent = ch;
      bottom.textContent = ch;
      front.textContent = ch;
      back.textContent = ch;
      return;
    }

    top.textContent = ch;       // 上半部：新数字（被翻页片遮住）
    bottom.textContent = old;   // 下半部：旧数字（翻到一半后换成新数字）
    front.textContent = old;    // 翻页片正面：旧数字上半部
    back.textContent = ch;      // 翻页片背面：新数字下半部

    el.classList.remove('flipping');
    void el.offsetWidth;        // 强制重排，让动画重新开始
    el.classList.add('flipping');

    window.clearTimeout(el._flipTimer);
    el._flipTimer = window.setTimeout(function () {
      bottom.textContent = el.dataset.cur;
    }, FLIP_MS);
  }

  function updateTime() {
    var now = new Date();
    var hh = pad2(now.getHours());
    var mm = pad2(now.getMinutes());

    setDigit(digits[0], hh.charAt(0));
    setDigit(digits[1], hh.charAt(1));
    setDigit(digits[2], mm.charAt(0));
    setDigit(digits[3], mm.charAt(1));

    dateEl.textContent = now.getFullYear() + '年' + (now.getMonth() + 1) + '月' + now.getDate() + '日';
    weekEl.textContent = '星期' + WEEK.charAt(now.getDay());
  }

  /* ---------- 主循环 ---------- */

  function frame(ts) {
    rafId = window.requestAnimationFrame(frame);
    if (!last) {
      last = ts;
      return;
    }
    var dt = Math.min(0.05, (ts - last) / 1000);
    last = ts;
    t += dt;

    drawDust(dt);

    var now = new Date();
    var frac = (now.getSeconds() + now.getMilliseconds() / 1000) / 60;
    secbar.style.transform = 'scaleX(' + frac.toFixed(4) + ')';
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
    resizeTimer = window.setTimeout(layout, 120);
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { stop(); } else { start(); }
  });

  layout();
  updateTime();
  window.setInterval(updateTime, 200);
  start();
}());
