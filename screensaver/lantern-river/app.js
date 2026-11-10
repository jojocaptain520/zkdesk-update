/* 灯影秦淮 —— 夜色河面：粉墙黛瓦的檐角压住画角，中景乌篷画舫，河灯顺流，灯影在波纹里碎成横向光带 */
(function () {
  'use strict';

  var canvas = document.getElementById('scene');
  var ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) { return; }

  var MAX_DPR = 2;
  var TAU = Math.PI * 2;

  var W = 1;
  var H = 1;
  var dpr = 1;
  var U = 1;
  var t = 0;
  var rafId = 0;
  var last = 0;
  var resizeTimer = 0;

  var back = null;      // 静态：夜空 + 远岸 + 石拱桥 + 水面底色
  var fore = null;      // 静态：近景粉墙黛瓦的檐角
  var vig = null;       // 暗角
  var gWarm = null;     // 暖光晕
  var gCool = null;     // 冷雾
  var sWarm = null;     // 水面倒影用的暖色柔光片
  var sCool = null;     // 冷色柔光片

  var drops = [];
  var ripples = [];
  var lamps = [];
  var mists = [];
  var shimmers = [];
  var bridgeLights = [];
  var boat = null;
  var eaveL = null;
  var eaveR = null;
  var hang = null;
  var rippleAcc = 0;

  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function horizonY() { return H * 0.452; }

  function layerScale() {
    return clamp(Math.sqrt(4200000 / (W * H)), 0.5, Math.min(dpr, MAX_DPR));
  }

  function makeGlow(inner, mid) {
    var size = 128;
    var c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    var g = c.getContext('2d');
    var r = size * 0.5;
    var gr = g.createRadialGradient(r, r, 0, r, r, r);
    gr.addColorStop(0, inner);
    gr.addColorStop(0.26, mid);
    gr.addColorStop(0.62, 'rgba(0, 0, 0, 0)');
    gr.addColorStop(1, 'rgba(0, 0, 0, 0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, size, size);
    return c;
  }

  // 横向拉长的柔光片：画水面倒影的碎光带
  function makeStreak(r, gg, b) {
    var w = 128;
    var h = 32;
    var c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    var g = c.getContext('2d');
    g.save();
    g.translate(w * 0.5, h * 0.5);
    g.scale(1, h / w);
    var gr = g.createRadialGradient(0, 0, 0, 0, 0, w * 0.5);
    gr.addColorStop(0, 'rgba(' + r + ', ' + gg + ', ' + b + ', 0.95)');
    gr.addColorStop(0.42, 'rgba(' + r + ', ' + gg + ', ' + b + ', 0.42)');
    gr.addColorStop(1, 'rgba(' + r + ', ' + gg + ', ' + b + ', 0)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(0, 0, w * 0.5, 0, TAU);
    g.fill();
    g.restore();
    return c;
  }

  function drawGlow(x, y, w, h, a) {
    if (a <= 0) { return; }
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = clamp(a, 0, 1);
    ctx.drawImage(gWarm, x - w * 0.5, y - h * 0.5, w, h);
    ctx.restore();
  }

  function drawStreak(x, y, w, h, a, warm) {
    ctx.globalAlpha = clamp(a, 0, 1);
    ctx.drawImage(warm ? sWarm : sCool, x - w * 0.5, y - h * 0.5, w, h);
  }

  // ------------------------------------------------------------------
  // 石拱桥：实心桥体 + 一个半圆拱洞，桥面微微拱起
  // ------------------------------------------------------------------
  function bridgeGeom() {
    var half = Math.min(W * 0.098, H * 0.176);
    var cx = W * 0.664;
    var base = horizonY() + H * 0.004;
    var hump = H * 0.088;
    var archW = half * 1.50;
    var archH = H * 0.060;
    var para = Math.max(3, H * 0.0085);
    return { cx: cx, half: half, base: base, hump: hump, archW: archW, archH: archH, para: para };
  }

  function bridgeDeckY(bg, x) {
    var dx = clamp((x - bg.cx) / bg.half, -1, 1);
    return bg.base - bg.hump * (1 - 0.44 * dx * dx);
  }

  function bridgeOutline(g, bg) {
    var L = bg.cx - bg.half;
    var R = bg.cx + bg.half;
    var i, x;
    g.beginPath();
    g.moveTo(L, bg.base);
    g.lineTo(L, bridgeDeckY(bg, L));
    for (i = 1; i <= 30; i++) {
      x = L + (R - L) * (i / 30);
      g.lineTo(x, bridgeDeckY(bg, x));
    }
    g.lineTo(R, bg.base);
    g.closePath();
    // 拱洞（挖掉）
    g.moveTo(bg.cx - bg.archW * 0.5, bg.base);
    g.quadraticCurveTo(bg.cx, bg.base - bg.archH * 2, bg.cx + bg.archW * 0.5, bg.base);
    g.closePath();
  }

  // ------------------------------------------------------------------
  // 静态层
  // ------------------------------------------------------------------
  function drawFarBank(g) {
    var base = horizonY() + H * 0.004;
    var i;

    // 起伏的树影
    g.beginPath();
    g.moveTo(-4, base + 2);
    var x = -4;
    while (x < W + 4) {
      var w = rand(0.008, 0.028) * W;
      var h = rand(0.004, 0.020) * H;
      g.quadraticCurveTo(x + w * 0.5, base - h, x + w, base);
      x += w;
    }
    g.lineTo(W + 4, base + 2);
    g.closePath();
    g.fillStyle = 'rgba(17, 26, 35, 0.66)';
    g.fill();

    // 远岸的屋脊
    var houses = [
      [0.012, 0.070, 0.030], [0.078, 0.046, 0.020], [0.116, 0.062, 0.032],
      [0.170, 0.044, 0.018], [0.206, 0.084, 0.026], [0.274, 0.052, 0.020],
      [0.316, 0.070, 0.014], [0.376, 0.044, 0.022], [0.414, 0.064, 0.017],
      [0.468, 0.048, 0.025], [0.796, 0.058, 0.018], [0.846, 0.080, 0.028],
      [0.908, 0.050, 0.016], [0.946, 0.062, 0.023]
    ];
    g.fillStyle = 'rgba(14, 22, 30, 0.84)';
    for (i = 0; i < houses.length; i++) {
      var hx = houses[i][0] * W;
      var hw = houses[i][1] * W;
      var hh = houses[i][2] * H;
      g.fillRect(hx, base - hh, hw, hh + 2);
      g.beginPath();
      g.moveTo(hx - hw * 0.08, base - hh);
      g.lineTo(hx + hw * 0.5, base - hh - H * 0.010);
      g.lineTo(hx + hw * 1.08, base - hh);
      g.closePath();
      g.fill();
    }

    // 几户亮着的窗
    g.fillStyle = 'rgba(255, 176, 104, 0.36)';
    var lit = [[0.126, 0.014], [0.214, 0.008], [0.862, 0.010]];
    for (i = 0; i < lit.length; i++) {
      g.fillRect(lit[i][0] * W, base - lit[i][1] * H, Math.max(1.2, W * 0.0022), Math.max(1.2, H * 0.0045));
    }

    var edge = g.createLinearGradient(0, base - H * 0.008, 0, base + H * 0.008);
    edge.addColorStop(0, 'rgba(126, 158, 176, 0)');
    edge.addColorStop(0.55, 'rgba(126, 158, 176, 0.12)');
    edge.addColorStop(1, 'rgba(126, 158, 176, 0)');
    g.fillStyle = edge;
    g.fillRect(0, base - H * 0.008, W, H * 0.016);
  }

  function drawBridge(g) {
    var bg = bridgeGeom();
    var L = bg.cx - bg.half;
    var R = bg.cx + bg.half;
    var i, x, y;

    bridgeOutline(g, bg);
    var stone = g.createLinearGradient(0, bg.base - bg.hump, 0, bg.base);
    stone.addColorStop(0, '#1f2c37');
    stone.addColorStop(0.45, '#182430');
    stone.addColorStop(1, '#0f1923');
    g.fillStyle = stone;
    g.fill('evenodd');

    // 拱洞内壁：一圈石券的亮边
    g.beginPath();
    g.moveTo(bg.cx - bg.archW * 0.5, bg.base);
    g.quadraticCurveTo(bg.cx, bg.base - bg.archH * 2, bg.cx + bg.archW * 0.5, bg.base);
    g.strokeStyle = 'rgba(130, 160, 178, 0.24)';
    g.lineWidth = Math.max(1.2, H * 0.0032);
    g.stroke();

    // 桥身石缝（只画在拱洞两侧，别画进桥洞里）
    for (i = 0; i < 22; i++) {
      x = L + (R - L) * ((i + 0.5) / 22);
      if (Math.abs(x - bg.cx) < bg.archW * 0.52) { continue; }
      var top = bridgeDeckY(bg, x);
      g.beginPath();
      g.moveTo(x, top + 2);
      g.lineTo(x, Math.min(bg.base - 1, top + bg.hump * 0.30));
      g.strokeStyle = 'rgba(114, 146, 164, 0.11)';
      g.lineWidth = Math.max(0.8, H * 0.0018);
      g.stroke();
    }

    // 桥面栏杆
    g.beginPath();
    for (i = 0; i <= 24; i++) {
      x = L + (R - L) * (i / 24);
      y = bridgeDeckY(bg, x) - bg.para;
      if (i === 0) { g.moveTo(x, y); } else { g.lineTo(x, y); }
    }
    for (i = 24; i >= 0; i--) {
      x = L + (R - L) * (i / 24);
      g.lineTo(x, bridgeDeckY(bg, x) + 1);
    }
    g.closePath();
    g.fillStyle = '#1b2833';
    g.fill();

    // 栏杆上沿的一线冷光
    g.beginPath();
    for (i = 0; i <= 24; i++) {
      x = L + (R - L) * (i / 24);
      y = bridgeDeckY(bg, x) - bg.para;
      if (i === 0) { g.moveTo(x, y); } else { g.lineTo(x, y); }
    }
    g.strokeStyle = 'rgba(140, 170, 188, 0.30)';
    g.lineWidth = Math.max(1, H * 0.0028);
    g.stroke();

    // 栏杆短柱
    for (i = 1; i < 9; i++) {
      x = L + (R - L) * (i / 9);
      y = bridgeDeckY(bg, x);
      g.beginPath();
      g.moveTo(x, y - bg.para);
      g.lineTo(x, y);
      g.strokeStyle = 'rgba(126, 156, 174, 0.12)';
      g.lineWidth = Math.max(0.8, H * 0.0020);
      g.stroke();
    }
  }

  function buildBack() {
    var s = layerScale();
    back = document.createElement('canvas');
    back.width = Math.max(1, Math.round(W * s));
    back.height = Math.max(1, Math.round(H * s));
    var g = back.getContext('2d');
    g.setTransform(s, 0, 0, s, 0, 0);

    var hy = horizonY();
    var waterH = H - hy;

    var sky = g.createLinearGradient(0, 0, 0, hy + H * 0.03);
    sky.addColorStop(0, '#050810');
    sky.addColorStop(0.34, '#0a1320');
    sky.addColorStop(0.66, '#13212f');
    sky.addColorStop(0.86, '#1b2c3a');
    sky.addColorStop(1, '#243743');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, hy + H * 0.03);

    var halo = g.createRadialGradient(W * 0.44, H * 0.30, 0, W * 0.44, H * 0.30, Math.max(W, H) * 0.56);
    halo.addColorStop(0, 'rgba(96, 128, 150, 0.10)');
    halo.addColorStop(0.5, 'rgba(76, 104, 126, 0.04)');
    halo.addColorStop(1, 'rgba(60, 84, 104, 0)');
    g.fillStyle = halo;
    g.fillRect(0, 0, W, hy + H * 0.03);

    // ---- 一轮薄月：给夜空一个焦点，也把石桥衬成剪影
    var mx = W * 0.596;
    var my = H * 0.158;
    var mr = Math.max(11, H * 0.029);
    var mglow = g.createRadialGradient(mx, my, 0, mx, my, mr * 7.5);
    mglow.addColorStop(0, 'rgba(212, 224, 220, 0.20)');
    mglow.addColorStop(0.28, 'rgba(190, 208, 208, 0.095)');
    mglow.addColorStop(0.62, 'rgba(158, 182, 190, 0.032)');
    mglow.addColorStop(1, 'rgba(140, 166, 180, 0)');
    g.fillStyle = mglow;
    g.fillRect(0, 0, W, hy + H * 0.03);
    // 月晕：贴着月盘的一圈柔光
    g.save();
    g.globalCompositeOperation = 'lighter';
    var bloom = g.createRadialGradient(mx, my, mr * 0.15, mx, my, mr * 3.0);
    bloom.addColorStop(0, 'rgba(232, 240, 232, 0.24)');
    bloom.addColorStop(0.26, 'rgba(214, 228, 222, 0.105)');
    bloom.addColorStop(0.60, 'rgba(192, 212, 210, 0.038)');
    bloom.addColorStop(1, 'rgba(180, 202, 204, 0)');
    g.fillStyle = bloom;
    g.beginPath();
    g.arc(mx, my, mr * 3.0, 0, TAU);
    g.fill();
    g.restore();
    var disc = g.createRadialGradient(mx - mr * 0.25, my - mr * 0.25, 0, mx, my, mr);
    disc.addColorStop(0, 'rgba(247, 246, 231, 0.96)');
    disc.addColorStop(0.68, 'rgba(231, 233, 219, 0.88)');
    disc.addColorStop(1, 'rgba(212, 219, 209, 0.50)');
    g.fillStyle = disc;
    g.beginPath();
    g.arc(mx, my, mr, 0, TAU);
    g.fill();

    drawFarBank(g);
    drawBridge(g);

    var water = g.createLinearGradient(0, hy - H * 0.006, 0, H);
    water.addColorStop(0, '#243743');
    water.addColorStop(0.022, '#2b424e');
    water.addColorStop(0.09, '#203642');
    water.addColorStop(0.42, '#132531');
    water.addColorStop(1, '#060b12');
    g.fillStyle = water;
    g.fillRect(0, hy, W, waterH);

    // 桥脚在水里的暗调（不做镜像，免得变成一个圆环）
    var foot = g.createRadialGradient(W * 0.664, hy + H * 0.012, 0, W * 0.664, hy + H * 0.012, W * 0.13);
    foot.addColorStop(0, 'rgba(10, 18, 26, 0.42)');
    foot.addColorStop(1, 'rgba(10, 18, 26, 0)');
    g.fillStyle = foot;
    g.fillRect(0, hy, W, H * 0.16);

    // 水面长波
    var i;
    for (i = 0; i < 7; i++) {
      var yy = hy + waterH * (0.04 + i * 0.078);
      var amp = H * 0.005 * (1 + i * 0.30);
      g.beginPath();
      g.moveTo(-10, yy);
      for (var xx = -10; xx <= W + 20; xx += 16) {
        g.lineTo(xx, yy + Math.sin(xx * 0.0042 + i * 1.7) * amp);
      }
      g.strokeStyle = 'rgba(132, 168, 186, ' + (0.046 - i * 0.005).toFixed(3) + ')';
      g.lineWidth = Math.max(1, H * 0.0032);
      g.stroke();
    }

    // 水天交界的雾
    var mist = g.createLinearGradient(0, hy - H * 0.05, 0, hy + H * 0.14);
    mist.addColorStop(0, 'rgba(126, 158, 176, 0)');
    mist.addColorStop(0.32, 'rgba(126, 156, 174, 0.055)');
    mist.addColorStop(0.62, 'rgba(120, 150, 168, 0.075)');
    mist.addColorStop(1, 'rgba(112, 142, 162, 0)');
    g.fillStyle = mist;
    g.fillRect(0, hy - H * 0.05, W, H * 0.19);

    // 桥灯 / 远岸灯火
    var bg = bridgeGeom();
    bridgeLights.length = 0;
    var deckXs = [0.15, 0.50, 0.85];
    for (i = 0; i < deckXs.length; i++) {
      var lx = bg.cx - bg.half + bg.half * 2 * deckXs[i];
      bridgeLights.push({
        x: lx,
        y: bridgeDeckY(bg, lx) - bg.para * 0.5,
        size: Math.max(1.6, H * 0.009),
        str: 0.62,
        near: true
      });
    }
    var farLit = [[0.126, 0.014], [0.214, 0.008], [0.862, 0.010]];
    for (i = 0; i < farLit.length; i++) {
      bridgeLights.push({
        x: farLit[i][0] * W,
        y: hy - H * 0.002,
        size: Math.max(1.4, H * 0.007),
        str: 0.40,
        near: false
      });
    }
  }

  // ------------------------------------------------------------------
  // 近景：粉墙黛瓦的檐角
  // ------------------------------------------------------------------
  function eaveGeom(mirror) {
    if (!mirror) {
      return {
        reach: Math.min(W * 0.300, H * 0.62),
        y0: H * 0.196,
        y1: H * 0.070,
        wallEdge: H * 0.100,
        wallTip: H * 0.022,
        gable: 1
      };
    }
    return {
      reach: Math.min(W * 0.235, H * 0.535),
      y0: H * 0.150,
      y1: H * 0.052,
      wallEdge: H * 0.078,
      wallTip: H * 0.017,
      gable: 0.85
    };
  }

  function eaveY(geo, p) {
    return geo.y0 + (geo.y1 - geo.y0) * Math.pow(p, 1.32) - H * 0.016 * Math.pow(p, 5);
  }

  function drawEaveSide(g, mirror) {
    var geo = eaveGeom(mirror);
    var reach = geo.reach;
    var N = 40;
    var i, p, x, y;

    g.save();
    if (mirror) { g.translate(W, 0); g.scale(-1, 1); }

    // ---- 屋面（近坡）：檐口到屋脊的一条瓦带，屋脊之上留白给夜空
    var roofEdge = H * 0.090;
    var ridgeY = function (pp) {
      return eaveY(geo, pp) - roofEdge * (1 - 0.36 * pp);
    };
    g.beginPath();
    for (i = 0; i <= N; i++) {
      p = i / N;
      x = p * reach;
      y = eaveY(geo, p);
      if (i === 0) { g.moveTo(x, y); } else { g.lineTo(x, y); }
    }
    for (i = N; i >= 0; i--) {
      p = i / N;
      g.lineTo(p * reach, ridgeY(p));
    }
    g.closePath();
    var roof = g.createLinearGradient(0, ridgeY(0.4), 0, eaveY(geo, 0.4));
    roof.addColorStop(0, '#141f29');
    roof.addColorStop(0.45, '#0b141b');
    roof.addColorStop(1, '#070c12');
    g.fillStyle = roof;
    g.fill();

    // ---- 屋脊：瓦带上沿压一道细高光
    g.beginPath();
    for (i = 0; i <= N; i++) {
      p = i / N;
      x = p * reach;
      y = ridgeY(p);
      if (i === 0) { g.moveTo(x, y); } else { g.lineTo(x, y); }
    }
    g.strokeStyle = 'rgba(154, 182, 196, 0.24)';
    g.lineWidth = Math.max(1, H * 0.0028);
    g.stroke();

    // ---- 瓦沟：两三道顺檐口的长弧
    var row, off;
    for (row = 1; row <= 3; row++) {
      off = roofEdge * 0.30 * row;
      g.beginPath();
      for (i = 0; i <= N; i++) {
        p = i / N;
        x = p * reach;
        y = eaveY(geo, p) - off * (1 - 0.28 * p);
        if (i === 0) { g.moveTo(x, y); } else { g.lineTo(x, y); }
      }
      g.strokeStyle = 'rgba(126, 152, 168, ' + (0.075 - row * 0.014).toFixed(3) + ')';
      g.lineWidth = Math.max(1, H * 0.0022);
      g.stroke();
    }

    // ---- 瓦垄：沿檐口排一列，亮暗成对、向上渐隐，才像瓦不是像梳子
    var count = Math.max(18, Math.round(reach / (H * 0.0112)));
    for (i = 0; i < count; i++) {
      p = (i + 0.5) / count;
      x = p * reach;
      y = eaveY(geo, p);
      var m = (eaveY(geo, Math.min(1, p + 0.02)) - eaveY(geo, Math.max(0, p - 0.02))) / (reach * 0.04);
      var nl = Math.sqrt(m * m + 1);
      var nx = m / nl;
      var ny = -1 / nl;
      var len = H * (0.040 + 0.022 * (1 - p));
      var xg = x + nx * len;
      var yg = y + ny * len;

      var darkGrad = g.createLinearGradient(x, y, xg, yg);
      darkGrad.addColorStop(0, 'rgba(0, 0, 0, 0.52)');
      darkGrad.addColorStop(0.55, 'rgba(0, 0, 0, 0.22)');
      darkGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      g.beginPath();
      g.moveTo(x, y - H * 0.004);
      g.lineTo(xg, yg);
      g.strokeStyle = darkGrad;
      g.lineWidth = Math.max(1.2, H * 0.0042);
      g.stroke();

      var lightGrad = g.createLinearGradient(x, y, xg, yg);
      lightGrad.addColorStop(0, 'rgba(134, 162, 178, 0.20)');
      lightGrad.addColorStop(0.5, 'rgba(134, 162, 178, 0.075)');
      lightGrad.addColorStop(1, 'rgba(134, 162, 178, 0)');
      g.beginPath();
      g.moveTo(x + H * 0.0034, y - H * 0.004);
      g.lineTo(xg + H * 0.0034, yg);
      g.strokeStyle = lightGrad;
      g.lineWidth = Math.max(0.9, H * 0.0026);
      g.stroke();
    }

    // ---- 檐口：厚重的檐板
    g.beginPath();
    for (i = 0; i <= N; i++) {
      p = i / N;
      x = p * reach;
      y = eaveY(geo, p);
      if (i === 0) { g.moveTo(x, y); } else { g.lineTo(x, y); }
    }
    g.strokeStyle = '#04070b';
    g.lineWidth = H * 0.024;
    g.stroke();

    // ---- 瓦当：檐口上一排小圆（小而疏，别变成串珠）
    var dab = Math.max(12, Math.round(count * 0.55));
    for (i = 0; i < dab; i++) {
      p = (i + 0.5) / dab;
      x = p * reach;
      y = eaveY(geo, p);
      g.beginPath();
      g.arc(x, y - H * 0.0025, Math.max(1, H * 0.0032), 0, TAU);
      g.fillStyle = 'rgba(150, 176, 190, 0.15)';
      g.fill();
    }
    // 檐口上沿的一点冷光
    g.beginPath();
    for (i = 0; i <= N; i++) {
      p = i / N;
      x = p * reach;
      y = eaveY(geo, p) - H * 0.014;
      if (i === 0) { g.moveTo(x, y); } else { g.lineTo(x, y); }
    }
    g.strokeStyle = 'rgba(150, 178, 192, 0.13)';
    g.lineWidth = Math.max(1, H * 0.0024);
    g.stroke();

    // ---- 飞檐尖：向内挑出去的一小撮瓦，末梢上翘
    g.beginPath();
    g.moveTo(reach - W * 0.004, eaveY(geo, 1) + H * 0.008);
    g.quadraticCurveTo(reach + W * 0.014, eaveY(geo, 1) + H * 0.004, reach + W * 0.026, eaveY(geo, 1) - H * 0.024);
    g.lineTo(reach + W * 0.020, eaveY(geo, 1) - H * 0.026);
    g.quadraticCurveTo(reach + W * 0.010, eaveY(geo, 1) - H * 0.010, reach - W * 0.004, eaveY(geo, 1) + H * 0.002);
    g.closePath();
    g.fillStyle = '#05090d';
    g.fill();
    // 瓦尖上的一线光
    g.beginPath();
    g.moveTo(reach + W * 0.002, eaveY(geo, 1) - H * 0.002);
    g.quadraticCurveTo(reach + W * 0.014, eaveY(geo, 1) - H * 0.006, reach + W * 0.025, eaveY(geo, 1) - H * 0.023);
    g.strokeStyle = 'rgba(160, 188, 202, 0.20)';
    g.lineWidth = Math.max(1, H * 0.0026);
    g.stroke();

    // ---- 粉墙：檐下一段白墙，靠画面边缘实、靠内端渐隐
    var slices = 32;
    for (i = 0; i < slices; i++) {
      var p0 = i / slices;
      var p1 = (i + 1) / slices;
      var xa = p0 * reach;
      var xb = p1 * reach;
      var ya = eaveY(geo, p0) + H * 0.010;
      var yb = eaveY(geo, p1) + H * 0.010;
      var ha = geo.wallTip + (geo.wallEdge - geo.wallTip) * Math.pow(1 - p0, 1.1);
      var hb = geo.wallTip + (geo.wallEdge - geo.wallTip) * Math.pow(1 - p1, 1.1);
      var fade = clamp(1 - Math.pow(p0, 1.7) * 1.10, 0, 1);
      if (fade <= 0.01) { continue; }
      g.beginPath();
      g.moveTo(xa, ya);
      g.lineTo(xb, yb);
      g.lineTo(xb, yb + hb);
      g.lineTo(xa, ya + ha);
      g.closePath();
      var wg = g.createLinearGradient(0, ya, 0, ya + ha);
      wg.addColorStop(0, 'rgba(96, 112, 122, ' + (0.97 * fade).toFixed(3) + ')');
      wg.addColorStop(0.40, 'rgba(68, 82, 92, ' + (0.94 * fade).toFixed(3) + ')');
      wg.addColorStop(0.78, 'rgba(42, 52, 61, ' + (0.80 * fade).toFixed(3) + ')');
      wg.addColorStop(1, 'rgba(24, 31, 38, ' + (0.55 * fade).toFixed(3) + ')');
      g.fillStyle = wg;
      g.fill();
    }

    // 墙上的一扇小窗（只做左边这一角）
    if (!mirror) {
      var wx = W * 0.030;
      var wy = eaveY(geo, wx / reach) + H * 0.021;
      var ww = W * 0.043;
      var wh = H * 0.036;
      g.fillStyle = 'rgba(6, 10, 14, 0.94)';
      g.fillRect(wx, wy, ww, wh);
      var wgl = g.createLinearGradient(wx, wy, wx, wy + wh);
      wgl.addColorStop(0, 'rgba(104, 124, 136, 0.16)');
      wgl.addColorStop(1, 'rgba(6, 10, 14, 0.20)');
      g.fillStyle = wgl;
      g.fillRect(wx, wy, ww, wh);
      g.strokeStyle = 'rgba(150, 176, 190, 0.13)';
      g.lineWidth = Math.max(0.8, H * 0.0016);
      for (i = 1; i < 3; i++) {
        g.beginPath();
        g.moveTo(wx + ww * i / 3, wy);
        g.lineTo(wx + ww * i / 3, wy + wh);
        g.stroke();
      }
      g.beginPath();
      g.moveTo(wx, wy + wh * 0.5);
      g.lineTo(wx + ww, wy + wh * 0.5);
      g.stroke();
      g.strokeStyle = 'rgba(176, 200, 212, 0.17)';
      g.lineWidth = Math.max(1, H * 0.0018);
      g.strokeRect(wx, wy, ww, wh);
    }

    // 檐下投影（压在墙头上）
    for (i = 0; i < slices; i++) {
      p = i / slices;
      x = p * reach;
      var eY = eaveY(geo, p) + H * 0.010;
      var fade2 = clamp(1 - Math.pow(p, 1.4) * 1.05, 0, 1);
      if (fade2 <= 0.02) { continue; }
      g.beginPath();
      g.moveTo(x, eY);
      g.lineTo(x + reach / slices + 1, eY);
      g.lineTo(x + reach / slices + 1, eY + H * 0.026);
      g.lineTo(x, eY + H * 0.030);
      g.closePath();
      var shg = g.createLinearGradient(0, eY, 0, eY + H * 0.030);
      shg.addColorStop(0, 'rgba(4, 8, 12, ' + (0.55 * fade2).toFixed(3) + ')');
      shg.addColorStop(1, 'rgba(4, 8, 12, 0)');
      g.fillStyle = shg;
      g.fill();
    }

    // 墙上的竖向水痕 + 椽头
    g.save();
    g.beginPath();
    for (i = 0; i <= 30; i++) {
      p = i / 30;
      x = p * reach;
      y = eaveY(geo, p) + H * 0.010;
      if (i === 0) { g.moveTo(x, y); } else { g.lineTo(x, y); }
    }
    for (i = 30; i >= 0; i--) {
      p = i / 30;
      x = p * reach;
      y = eaveY(geo, p) + H * 0.010 + geo.wallEdge;
      g.lineTo(x, y);
    }
    g.closePath();
    g.clip();
    for (i = 0; i < 10; i++) {
      p = rand(0.02, 0.62);
      x = p * reach;
      y = eaveY(geo, p) + H * 0.014;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x - H * 0.004, y + H * rand(0.018, 0.055));
      g.strokeStyle = 'rgba(8, 14, 19, ' + rand(0.10, 0.22).toFixed(2) + ')';
      g.lineWidth = Math.max(0.8, H * 0.0018);
      g.stroke();
    }
    g.restore();

    // 椽头：沿檐口一列很小的暗点，让檐下不透空
    for (i = 0; i < count; i += 2) {
      p = (i + 0.5) / count;
      x = p * reach;
      y = eaveY(geo, p) - H * 0.006;
      g.beginPath();
      g.arc(x, y, Math.max(0.8, H * 0.0026), 0, TAU);
      g.fillStyle = 'rgba(4, 8, 12, 0.85)';
      g.fill();
    }

    // ---- 马头墙：屋脊之上层层跌落的粉墙，黛瓦压顶（贴着画框，被切掉一角）
    var gw = geo.reach * 0.40;
    var stepW = gw / 3;
    var gableBase = ridgeY(0) + H * 0.006;
    for (i = 0; i < 3; i++) {
      var tx = stepW * i;
      var rise = H * 0.017 * (3 - i) * geo.gable;
      var topY = gableBase - rise - H * 0.012 * geo.gable;
      var edgeX = Math.min(reach, tx + stepW);
      g.beginPath();
      g.moveTo(tx - 2, gableBase + H * 0.030);
      g.lineTo(tx - 2, topY);
      g.lineTo(edgeX, topY);
      g.lineTo(edgeX, ridgeY(edgeX / reach) + H * 0.012);
      g.closePath();
      var gg = g.createLinearGradient(0, topY, 0, gableBase + H * 0.03);
      gg.addColorStop(0, 'rgba(80, 94, 104, 0.95)');
      gg.addColorStop(0.45, 'rgba(52, 64, 73, 0.95)');
      gg.addColorStop(1, 'rgba(22, 29, 35, 0.90)');
      g.fillStyle = gg;
      g.fill();

      // 黛瓦压顶 + 尽端翘起的马头
      var capT = H * 0.012;
      g.beginPath();
      g.moveTo(tx - H * 0.007, topY - capT);
      g.lineTo(edgeX + H * 0.012, topY - capT - H * 0.004);
      g.lineTo(edgeX + H * 0.012, topY + H * 0.002);
      g.lineTo(tx - H * 0.007, topY + H * 0.003);
      g.closePath();
      g.fillStyle = '#070c12';
      g.fill();
      g.beginPath();
      g.moveTo(edgeX + H * 0.012, topY - capT - H * 0.004);
      g.quadraticCurveTo(edgeX + H * 0.028, topY - capT - H * 0.018,
        edgeX + H * 0.023, topY - capT - H * 0.026);
      g.lineTo(edgeX + H * 0.009, topY - capT - H * 0.013);
      g.closePath();
      g.fillStyle = '#060a10';
      g.fill();
      g.beginPath();
      g.moveTo(tx - H * 0.007, topY - capT);
      g.lineTo(edgeX + H * 0.012, topY - capT - H * 0.004);
      g.strokeStyle = 'rgba(160, 186, 200, 0.22)';
      g.lineWidth = Math.max(0.9, H * 0.0024);
      g.stroke();
    }

    g.restore();
  }

  function buildFore() {
    var s = layerScale();
    fore = document.createElement('canvas');
    fore.width = Math.max(1, Math.round(W * s));
    fore.height = Math.max(1, Math.round(H * s));
    var g = fore.getContext('2d');
    g.setTransform(s, 0, 0, s, 0, 0);
    drawEaveSide(g, false);
    drawEaveSide(g, true);
  }

  function buildVig() {
    var w = 320;
    var h = 180;
    vig = document.createElement('canvas');
    vig.width = w;
    vig.height = h;
    var g = vig.getContext('2d');
    var rg = g.createRadialGradient(w * 0.5, h * 0.46, h * 0.18, w * 0.5, h * 0.46, w * 0.70);
    rg.addColorStop(0, 'rgba(0, 0, 0, 0)');
    rg.addColorStop(0.55, 'rgba(0, 0, 0, 0.16)');
    rg.addColorStop(1, 'rgba(0, 0, 0, 0.72)');
    g.fillStyle = rg;
    g.fillRect(0, 0, w, h);
  }

  // ------------------------------------------------------------------
  // 动态元素
  // ------------------------------------------------------------------
  function newDrop(spread) {
    return {
      x: rand(-0.02, 1.02) * W,
      y: spread ? rand(-0.9, 1) * H : rand(-0.5, -0.02) * H,
      len: rand(0.022, 0.055) * H,
      spd: rand(0.55, 1.05) * H
    };
  }

  function newLamp(spread) {
    var depth = Math.random();
    var wy = horizonY();
    var span = H - wy;
    return {
      x: spread ? rand(-0.02, 1.05) * W : -rand(0.02, 0.10) * W,
      y: wy + span * (0.12 + 0.84 * depth),
      depth: depth,
      spd: W * (0.004 + 0.016 * depth),
      ph: rand(0, TAU)
    };
  }

  function rebuild() {
    gWarm = makeGlow('rgba(255, 232, 184, 0.95)', 'rgba(255, 156, 74, 0.32)');
    gCool = makeGlow('rgba(170, 198, 216, 0.55)', 'rgba(88, 120, 144, 0.16)');
    sWarm = makeStreak(255, 186, 106);
    sCool = makeStreak(126, 166, 188);

    buildVig();
    buildBack();
    buildFore();

    eaveL = eaveGeom(false);
    eaveR = eaveGeom(true);

    boat = {
      x: W * 0.322,
      y: H * 0.608,
      L: Math.min(W * 0.228, H * 0.435),
      ph: rand(0, TAU)
    };

    // 檐下挂灯：吊在左檐中段
    var hp = 0.50;
    hang = {
      x: hp * eaveL.reach,
      y: eaveY(eaveL, hp) + H * 0.014,
      len: H * 0.055,
      ph: rand(0, TAU)
    };

    drops.length = 0;
    var dn = Math.round(clamp(W * H / 7200, 100, 260));
    for (var i = 0; i < dn; i++) { drops.push(newDrop(true)); }

    lamps.length = 0;
    var ln = Math.round(clamp(W / 92, 10, 20));
    for (var j = 0; j < ln; j++) { lamps.push(newLamp(true)); }

    mists.length = 0;
    for (var k = 0; k < 6; k++) {
      mists.push({
        x: rand(-0.1, 0.9) * W,
        y: horizonY() + rand(0.03, 0.40) * (H - horizonY()),
        w: rand(0.40, 0.90) * W,
        h: rand(0.030, 0.075) * H,
        spd: rand(0.004, 0.012) * W,
        a: rand(0.24, 0.50)
      });
    }

    shimmers.length = 0;
    var sn = Math.round(clamp(W / 30, 30, 80));
    for (var s2 = 0; s2 < sn; s2++) {
      shimmers.push({
        x: rand(0, W),
        y: horizonY() + Math.pow(Math.random(), 0.7) * (H - horizonY()) * 0.74,
        w: rand(0.004, 0.026) * W,
        ph: rand(0, TAU),
        sp: rand(0.6, 1.9)
      });
    }

    ripples.length = 0;
    rippleAcc = 0;
  }

  function advance(dt) {
    t += dt;
    var wy = horizonY();
    var i;

    for (i = 0; i < drops.length; i++) {
      var d = drops[i];
      d.y += d.spd * dt;
      d.x -= d.spd * 0.15 * dt;
      if (d.y > H + d.len) {
        d.x = rand(-0.02, 1.02) * W;
        d.y = rand(-0.35, -0.02) * H;
        d.len = rand(0.022, 0.055) * H;
        d.spd = rand(0.55, 1.05) * H;
      }
    }

    rippleAcc += dt;
    if (rippleAcc > 0.075) {
      rippleAcc = 0;
      if (ripples.length < 52) {
        var ry = wy + Math.pow(Math.random(), 0.8) * (H - wy);
        var dep = (ry - wy) / Math.max(1, H - wy);
        ripples.push({
          x: rand(0, W),
          y: ry,
          r: 0.5,
          max: (5 + 13 * dep) * U,
          a: 0.09 + 0.15 * dep
        });
      }
    }
    for (i = ripples.length - 1; i >= 0; i--) {
      var rp = ripples[i];
      rp.r += ((rp.max - rp.r) * 2.0 + 8 * U) * dt;
      rp.a -= dt * 0.30;
      if (rp.a <= 0 || rp.r > rp.max) { ripples.splice(i, 1); }
    }

    for (i = 0; i < lamps.length; i++) {
      var lm = lamps[i];
      lm.x += lm.spd * dt;
      if (lm.x > W + 0.10 * W) {
        var nl = newLamp(false);
        lm.x = nl.x;
        lm.y = nl.y;
        lm.depth = nl.depth;
        lm.spd = nl.spd;
        lm.ph = nl.ph;
      }
    }

    for (i = 0; i < mists.length; i++) {
      var m = mists[i];
      m.x += m.spd * dt;
      if (m.x - m.w * 0.5 > W) { m.x = -m.w * 0.5; }
    }
  }

  // 水面倒影：一条柔光柱 + 一串横向碎光
  function reflect(x, yTop, w, len, seed, strength, warm) {
    var i, n, f, yy, wob, wob2, ww, a;
    var gw = w * 5.5;
    var gh = len * 1.25;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (warm) {
      ctx.globalAlpha = clamp(0.10 * strength, 0, 1);
      ctx.drawImage(gWarm, x - gw * 0.5, yTop - gh * 0.10, gw, gh);
    }
    n = 16;
    for (i = 0; i < n; i++) {
      f = i / (n - 1);
      yy = yTop + len * f * f * 0.94 + len * 0.008;
      wob = Math.sin(t * 1.7 + seed * 2.3 + i * 0.7);
      wob2 = Math.sin(t * 0.85 + seed + i * 1.4);
      ww = w * (0.50 + f * 1.7) * (0.62 + 0.38 * (0.5 + 0.5 * wob));
      a = strength * (1 - f) * (0.32 + 0.68 * (0.5 + 0.5 * wob2));
      drawStreak(x + wob * w * 0.50, yy, ww, Math.max(2, H * 0.012 * (0.6 + f * 0.8)),
        clamp(a * 0.42, 0, 1), warm);
    }
    ctx.restore();
  }

  function drawShimmer() {
    var i, s, a;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (i = 0; i < shimmers.length; i++) {
      s = shimmers[i];
      a = 0.5 + 0.5 * Math.sin(t * s.sp + s.ph);
      if (a < 0.55) { continue; }
      ctx.globalAlpha = (a - 0.55) * 0.40;
      ctx.fillStyle = 'rgb(116, 154, 174)';
      ctx.fillRect(s.x + Math.sin(t * 0.5 + s.ph) * W * 0.008, s.y, s.w, Math.max(1, U * 0.9));
    }
    ctx.restore();
  }

  function drawMist() {
    if (!gCool) { return; }
    var i, m;
    for (i = 0; i < mists.length; i++) {
      m = mists[i];
      ctx.globalAlpha = m.a * 0.48;
      ctx.drawImage(gCool, m.x - m.w * 0.5, m.y - m.h * 0.5, m.w, m.h);
    }
    ctx.globalAlpha = 1;
  }

  function drawBridgeLights() {
    var i, w;
    for (i = 0; i < bridgeLights.length; i++) {
      w = bridgeLights[i];
      var breathe = 0.72 + 0.28 * Math.sin(t * 1.1 + i * 2.1);
      drawGlow(w.x, w.y, w.size * 8, w.size * 8, w.str * breathe * 0.5);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = 'rgb(255, 216, 158)';
      ctx.beginPath();
      ctx.arc(w.x, w.y, Math.max(0.9, w.size * 0.22), 0, TAU);
      ctx.fill();
      ctx.restore();
      if (w.near) {
        reflect(w.x, horizonY() + H * 0.008, w.size * 0.50, (H - horizonY()) * 0.145, i * 1.7, w.str * 0.52, true);
      }
    }
  }

  // 月光在水面上的一条碎银
  function drawMoonPath() {
    var mx = W * 0.596;
    var wy = horizonY();
    var len = (H - wy) * 0.66;
    var i, f, yy, ww, a;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (i = 0; i < 11; i++) {
      f = i / 10;
      yy = wy + len * f * f + H * 0.006;
      ww = W * 0.010 * (0.55 + f * 1.7);
      a = 0.30 * (1 - f) * (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 1.3 + i * 1.15)));
      drawStreak(mx + Math.sin(t * 0.7 + i * 0.8) * W * 0.006, yy, ww * 2.2,
        Math.max(2, H * 0.009), clamp(a, 0, 1), false);
    }
    ctx.restore();
  }

  // ------------------------------------------------------------------
  // 乌篷画舫
  // ------------------------------------------------------------------
  function hullPath(g, L) {
    g.moveTo(-L * 0.500, -L * 0.038);
    g.quadraticCurveTo(-L * 0.524, -L * 0.012, -L * 0.452, L * 0.006);
    g.quadraticCurveTo(-L * 0.300, L * 0.032, -L * 0.060, L * 0.030);
    g.quadraticCurveTo(L * 0.220, L * 0.028, L * 0.402, -L * 0.004);
    g.lineTo(L * 0.512, -L * 0.078);
    g.quadraticCurveTo(L * 0.436, -L * 0.050, L * 0.300, -L * 0.045);
    g.lineTo(-L * 0.250, -L * 0.043);
    g.quadraticCurveTo(-L * 0.442, -L * 0.043, -L * 0.500, -L * 0.038);
    g.closePath();
  }

  function drawBoat() {
    if (!boat) { return; }
    var L = boat.L;
    var x = boat.x + Math.sin(t * 0.055) * W * 0.028;
    var y = boat.y + Math.sin(t * 0.55 + boat.ph) * L * 0.006;
    var i;

    // 水里的暗影
    ctx.save();
    ctx.globalAlpha = 0.36;
    ctx.fillStyle = '#04080d';
    ctx.beginPath();
    ctx.ellipse(x - L * 0.02, y + L * 0.044, L * 0.33, L * 0.020, 0, 0, TAU);
    ctx.fill();
    ctx.restore();

    // 船身倒影
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, y + L * 0.030, W, H - (y + L * 0.030));
    ctx.clip();
    ctx.translate(x, y + L * 0.038);
    ctx.scale(1, -0.58);
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#050b10';
    ctx.beginPath();
    hullPath(ctx, L);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(x, y);

    // 船身
    ctx.beginPath();
    hullPath(ctx, L);
    var hull = ctx.createLinearGradient(0, -L * 0.05, 0, L * 0.034);
    hull.addColorStop(0, '#15202a');
    hull.addColorStop(0.45, '#0b131a');
    hull.addColorStop(1, '#04080c');
    ctx.fillStyle = hull;
    ctx.fill();

    // 船头外沿的冷高光
    ctx.beginPath();
    ctx.moveTo(L * 0.100, L * 0.022);
    ctx.quadraticCurveTo(L * 0.400, L * 0.020, L * 0.508, -L * 0.070);
    ctx.strokeStyle = 'rgba(126, 158, 176, 0.20)';
    ctx.lineWidth = Math.max(1, L * 0.005);
    ctx.stroke();

    // 甲板边的一道暖轮廓光（船头的灯照过来）
    ctx.beginPath();
    ctx.moveTo(-L * 0.452, -L * 0.036);
    ctx.quadraticCurveTo(-L * 0.10, -L * 0.040, L * 0.286, -L * 0.042);
    ctx.strokeStyle = 'rgba(255, 176, 104, 0.26)';
    ctx.lineWidth = Math.max(1, L * 0.006);
    ctx.stroke();

    // 乌篷：三段拱形竹席篷，段与段之间留一道缝
    var cabBaseY = -L * 0.030;
    var cabPeakY = -L * 0.104;
    var segs = [[-0.300, -0.168], [-0.168, -0.020], [-0.020, 0.140]];
    for (i = 0; i < segs.length; i++) {
      var a = segs[i][0] * L + L * 0.005;
      var b = segs[i][1] * L - L * 0.005;
      var mid = (a + b) * 0.5;
      var peak = cabPeakY + (i === 1 ? -L * 0.006 : (i === 2 ? L * 0.012 : 0));
      ctx.beginPath();
      ctx.moveTo(a, cabBaseY);
      ctx.quadraticCurveTo(a + (mid - a) * 0.20, peak, mid, peak);
      ctx.quadraticCurveTo(b - (b - mid) * 0.20, peak, b, cabBaseY);
      ctx.closePath();
      var cg = ctx.createLinearGradient(0, peak, 0, cabBaseY);
      cg.addColorStop(0, '#1b2833');
      cg.addColorStop(0.44, '#0b131a');
      cg.addColorStop(1, '#04080d');
      ctx.fillStyle = cg;
      ctx.fill();
      // 篷顶的冷高光
      ctx.beginPath();
      ctx.moveTo(a + (mid - a) * 0.34, peak + L * 0.022);
      ctx.quadraticCurveTo(a + (mid - a) * 0.20, peak + L * 0.003, mid, peak + L * 0.003);
      ctx.quadraticCurveTo(b - (b - mid) * 0.20, peak + L * 0.003, b - (b - mid) * 0.34, peak + L * 0.022);
      ctx.strokeStyle = 'rgba(146, 174, 190, 0.15)';
      ctx.lineWidth = Math.max(0.8, L * 0.004);
      ctx.stroke();
    }

    // 篷下透出来的暖光（灯在舱里）
    var spill = ctx.createLinearGradient(0, cabBaseY - L * 0.020, 0, cabBaseY + L * 0.004);
    spill.addColorStop(0, 'rgba(255, 194, 116, 0.58)');
    spill.addColorStop(1, 'rgba(255, 176, 96, 0)');
    ctx.fillStyle = spill;
    ctx.fillRect(-L * 0.300, cabBaseY - L * 0.022, L * 0.442, L * 0.028);

    // 两扇船窗：开在篷面上
    var wins = [[-L * 0.216, -L * 0.062], [L * 0.048, -L * 0.062]];
    for (i = 0; i < wins.length; i++) {
      var wx = wins[i][0];
      var wy = wins[i][1];
      ctx.beginPath();
      ctx.moveTo(wx - L * 0.026, wy - L * 0.014);
      ctx.lineTo(wx + L * 0.026, wy - L * 0.013);
      ctx.lineTo(wx + L * 0.026, wy + L * 0.016);
      ctx.lineTo(wx - L * 0.026, wy + L * 0.017);
      ctx.closePath();
      var wg = ctx.createLinearGradient(0, wy - L * 0.018, 0, wy + L * 0.018);
      wg.addColorStop(0, 'rgba(255, 220, 164, 0.95)');
      wg.addColorStop(1, 'rgba(238, 142, 66, 0.85)');
      ctx.fillStyle = wg;
      ctx.fill();
    }
    var cabB = L * 0.150;

    // 船头的栏杆
    var railY = -L * 0.044;
    ctx.beginPath();
    ctx.moveTo(cabB + L * 0.030, railY);
    ctx.lineTo(L * 0.420, railY - L * 0.002);
    ctx.strokeStyle = 'rgba(6, 10, 14, 0.85)';
    ctx.lineWidth = Math.max(1, L * 0.005);
    ctx.stroke();
    for (i = 0; i < 5; i++) {
      var rx = cabB + L * 0.040 + i * L * 0.066;
      ctx.beginPath();
      ctx.moveTo(rx, railY);
      ctx.lineTo(rx, -L * 0.030);
      ctx.strokeStyle = 'rgba(6, 10, 14, 0.80)';
      ctx.lineWidth = Math.max(0.8, L * 0.004);
      ctx.stroke();
    }
    // 栏杆上的冷光
    ctx.beginPath();
    ctx.moveTo(cabB + L * 0.030, railY);
    ctx.lineTo(L * 0.420, railY - L * 0.002);
    ctx.strokeStyle = 'rgba(132, 162, 180, 0.14)';
    ctx.lineWidth = Math.max(0.7, L * 0.0025);
    ctx.stroke();

    // 船尾的橹 / 撑杆
    ctx.beginPath();
    ctx.moveTo(-L * 0.420, -L * 0.026);
    ctx.lineTo(-L * 0.560, -L * 0.090);
    ctx.strokeStyle = 'rgba(6, 10, 14, 0.9)';
    ctx.lineWidth = Math.max(1, L * 0.007);
    ctx.stroke();

    // 船头灯杆
    var poleBX = L * 0.330;
    var poleBY = -L * 0.034;
    var poleTX = L * 0.446;
    var poleTY = -L * 0.168;
    ctx.beginPath();
    ctx.moveTo(poleBX, poleBY);
    ctx.lineTo(poleTX, poleTY);
    ctx.strokeStyle = 'rgba(7, 11, 16, 0.95)';
    ctx.lineWidth = Math.max(1.2, L * 0.008);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(poleBX + L * 0.028, poleBY - L * 0.014);
    ctx.lineTo(poleTX, poleTY + L * 0.005);
    ctx.strokeStyle = 'rgba(255, 176, 104, 0.22)';
    ctx.lineWidth = Math.max(0.8, L * 0.004);
    ctx.stroke();

    // 船头挂灯
    var swing = Math.sin(t * 1.10 + boat.ph) * 0.15;
    var lw = L * 0.038;
    var lh = L * 0.048;
    ctx.save();
    ctx.translate(poleTX, poleTY);
    ctx.rotate(swing);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, L * 0.036);
    ctx.strokeStyle = 'rgba(8, 12, 16, 0.9)';
    ctx.lineWidth = Math.max(1, L * 0.005);
    ctx.stroke();
    var lcy = L * 0.036 + lh;
    ctx.beginPath();
    ctx.ellipse(0, lcy, lw, lh, 0, 0, TAU);
    var lg = ctx.createRadialGradient(0, lcy - lh * 0.2, 0, 0, lcy, lw * 1.6);
    lg.addColorStop(0, 'rgba(255, 248, 222, 0.99)');
    lg.addColorStop(0.40, 'rgba(255, 178, 92, 0.97)');
    lg.addColorStop(1, 'rgba(214, 88, 44, 0.84)');
    ctx.fillStyle = lg;
    ctx.fill();
    ctx.strokeStyle = 'rgba(176, 78, 38, 0.26)';
    ctx.lineWidth = Math.max(0.6, L * 0.0035);
    for (i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.ellipse(0, lcy, lw * (0.34 + 0.33 * (i + 1)), lh, 0, 0, TAU);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(34, 21, 16, 0.92)';
    ctx.fillRect(-lw * 0.44, lcy - lh * 1.10, lw * 0.88, lh * 0.20);
    ctx.fillRect(-lw * 0.32, lcy + lh * 0.88, lw * 0.64, lh * 0.16);
    ctx.beginPath();
    ctx.moveTo(0, lcy + lh * 1.04);
    ctx.lineTo(0, lcy + lh * 1.45);
    ctx.strokeStyle = 'rgba(226, 124, 62, 0.60)';
    ctx.lineWidth = Math.max(0.8, L * 0.005);
    ctx.stroke();
    ctx.restore();

    ctx.restore();

    // 灯与舷窗的光晕（世界坐标）
    var gx = x + poleTX + Math.sin(swing) * (L * 0.036 + L * 0.096);
    var gy = y + poleTY + Math.cos(swing) * (L * 0.036 + L * 0.096);
    drawGlow(gx, gy, L * 0.55, L * 0.55, 0.60);
    drawGlow(gx, gy, L * 1.9, L * 1.9, 0.15);
    for (i = 0; i < wins.length; i++) {
      drawGlow(x + wins[i][0], y + wins[i][1], L * 0.28, L * 0.24, 0.26);
    }

    // 倒影
    reflect(gx, y + L * 0.020, L * 0.060, L * 1.10, 3.7, 1.0, true);
    reflect(x + wins[0][0], y + L * 0.020, L * 0.036, L * 0.62, 8.1, 0.42, true);
    reflect(x + wins[1][0], y + L * 0.020, L * 0.036, L * 0.62, 5.3, 0.42, true);

    // 船边的水纹
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = 'rgb(138, 174, 192)';
    ctx.lineWidth = Math.max(0.8, U * 1.0);
    for (i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.ellipse(x - L * 0.05, y + L * (0.032 + i * 0.013), L * (0.32 + i * 0.05), L * 0.014, 0, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawLamps() {
    var i, p, ang;
    for (i = 0; i < lamps.length; i++) {
      var l = lamps[i];
      var bob = Math.sin(t * 1.35 + l.ph) * (0.5 + l.depth * 1.5);
      var x = l.x;
      var y = l.y + bob;
      var s = (0.7 + 4.3 * l.depth) * U;

      drawGlow(x, y, s * 14, s * 14, 0.22 + 0.30 * l.depth);
      drawGlow(x, y, s * 4.6, s * 4.6, 0.46);

      ctx.save();
      ctx.translate(x, y);
      // 灯座
      ctx.beginPath();
      ctx.ellipse(0, s * 0.66, s * 1.65, s * 0.44, 0, 0, TAU);
      ctx.fillStyle = 'rgba(12, 18, 24, 0.90)';
      ctx.fill();
      // 莲花瓣
      ctx.fillStyle = 'rgba(255, 198, 122, 0.40)';
      for (p = 0; p < 4; p++) {
        ang = (p / 4) * TAU + l.ph;
        ctx.beginPath();
        ctx.ellipse(Math.cos(ang) * s * 0.80, Math.sin(ang) * s * 0.40 + s * 0.10,
          s * 0.76, s * 0.30, ang * 0.2, 0, TAU);
        ctx.fill();
      }
      // 纸灯
      var lg = ctx.createRadialGradient(0, -s * 0.1, 0, 0, 0, s * 1.9);
      lg.addColorStop(0, 'rgba(255, 248, 222, 0.99)');
      lg.addColorStop(0.44, 'rgba(255, 186, 104, 0.95)');
      lg.addColorStop(1, 'rgba(228, 104, 50, 0.52)');
      ctx.beginPath();
      ctx.ellipse(0, 0, s * 1.02, s * 0.84, 0, 0, TAU);
      ctx.fillStyle = lg;
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(0, -s * 0.08, s * 0.32, s * 0.28, 0, 0, TAU);
      ctx.fillStyle = 'rgba(255, 252, 238, 0.96)';
      ctx.fill();
      ctx.restore();

      reflect(x, y + s * 1.0, s * 2.1, s * 7.5, l.ph, 0.55 + 0.55 * l.depth, true);
    }
  }

  function drawRipples() {
    var i;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgb(124, 166, 186)';
    ctx.lineWidth = Math.max(0.8, U * 1.0);
    for (i = 0; i < ripples.length; i++) {
      var r = ripples[i];
      ctx.globalAlpha = clamp(r.a, 0, 1);
      ctx.beginPath();
      ctx.ellipse(r.x, r.y, r.r, r.r * 0.32, 0, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawRain() {
    var i, k, bucket, d, any;
    for (k = 0; k < 3; k++) {
      ctx.beginPath();
      any = false;
      for (i = k; i < drops.length; i += 3) {
        d = drops[i];
        if (d.y < -d.len) { continue; }
        any = true;
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - d.len * 0.20, d.y + d.len);
      }
      if (!any) { continue; }
      bucket = [0.070, 0.095, 0.120][k];
      ctx.strokeStyle = 'rgba(172, 200, 218, ' + bucket + ')';
      ctx.lineWidth = Math.max(0.7, U * 1.0);
      ctx.stroke();
    }
  }

  function drawHang() {
    if (!hang) { return; }
    var sway = Math.sin(t * 0.92 + hang.ph) * H * 0.006;
    var tilt = Math.sin(t * 0.74 + hang.ph) * 0.06;
    var ex = hang.x + sway;
    var ey = hang.y + hang.len;

    ctx.beginPath();
    ctx.moveTo(hang.x, hang.y);
    ctx.lineTo(ex, ey);
    ctx.strokeStyle = 'rgba(6, 10, 14, 0.94)';
    ctx.lineWidth = Math.max(1, U * 1.3);
    ctx.stroke();

    var lw = U * 10;
    var lh = U * 14;

    // 灯光染在墙上的暖
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.14;
    ctx.drawImage(gWarm, ex - lw * 6.0, ey - lh * 6.0, lw * 12, lh * 12);
    ctx.restore();

    ctx.save();
    ctx.translate(ex, ey + lh * 0.85);
    ctx.rotate(tilt);
    var lg = ctx.createRadialGradient(0, -lh * 0.1, 0, 0, 0, lw * 1.8);
    lg.addColorStop(0, 'rgba(255, 248, 224, 0.99)');
    lg.addColorStop(0.42, 'rgba(255, 182, 96, 0.97)');
    lg.addColorStop(1, 'rgba(214, 88, 44, 0.88)');
    ctx.beginPath();
    ctx.ellipse(0, 0, lw, lh, 0, 0, TAU);
    ctx.fillStyle = lg;
    ctx.fill();
    ctx.strokeStyle = 'rgba(176, 78, 38, 0.26)';
    ctx.lineWidth = Math.max(0.7, U * 1.0);
    for (var b = -1; b <= 1; b++) {
      ctx.beginPath();
      ctx.ellipse(0, 0, lw * (0.30 + 0.34 * (b + 1)), lh, 0, 0, TAU);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(34, 21, 16, 0.92)';
    ctx.fillRect(-lw * 0.46, -lh * 1.06, lw * 0.92, lh * 0.20);
    ctx.fillRect(-lw * 0.36, lh * 0.86, lw * 0.72, lh * 0.16);
    ctx.beginPath();
    ctx.moveTo(0, lh * 1.02);
    ctx.lineTo(0, lh * 1.42);
    ctx.strokeStyle = 'rgba(226, 128, 64, 0.62)';
    ctx.lineWidth = Math.max(1, U * 1.2);
    ctx.stroke();
    ctx.restore();

    drawGlow(ex, ey + lh * 0.85, lw * 6.2, lh * 6.2, 0.40);
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    if (back) { ctx.drawImage(back, 0, 0, W, H); }

    drawShimmer();
    drawMoonPath();
    drawMist();
    drawBridgeLights();
    drawBoat();
    drawLamps();
    drawRipples();

    if (fore) { ctx.drawImage(fore, 0, 0, W, H); }
    drawHang();

    drawRain();

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    if (vig) { ctx.drawImage(vig, 0, 0, W, H); }
  }

  function warmup(frames) {
    var dt = 1 / 30;
    for (var i = 0; i < frames; i++) { advance(dt); }
    draw();
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    W = Math.max(1, window.innerWidth);
    H = Math.max(1, window.innerHeight);
    U = Math.min(W / 1280, H / 720);

    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = 'round';

    rebuild();
    warmup(200);
  }

  function frame(ts) {
    rafId = window.requestAnimationFrame(frame);
    if (!last) { last = ts; return; }
    var dt = Math.min(0.05, (ts - last) / 1000);
    last = ts;
    if (dt <= 0) { return; }
    advance(dt);
    draw();
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
