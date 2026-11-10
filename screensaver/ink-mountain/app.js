/* 水墨远山 —— 宣纸底，三层墨山由远及近渐浓，云海漫过山腰，江上一叶孤舟，几只飞鸟，右侧淡墨题诗 */
(function () {
  'use strict';

  var canvas = document.getElementById('scene');
  var ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) { return; }

  var MAX_DPR = 2;

  // 墨分五色：纸白 / 淡墨 / 中墨 / 焦墨，朱砂只做一点点印章
  var PAPER = [242, 237, 227];
  var FAR = [185, 180, 168];    // #B9B4A8
  var MID = [140, 136, 120];    // #8C8878
  var NEAR = [58, 58, 52];      // #3A3A34
  var CINNABAR = [168, 64, 47];
  var LAMP = [206, 108, 64];

  var W = 1;
  var H = 1;
  var dpr = 1;
  var t = 0;
  var rafId = 0;
  var last = 0;
  var resizeTimer = 0;

  var bg = null;          // 纸 + 远山 + 中山 + 江水 + 倒影 + 题诗 + 前景岸
  var nearL = null;       // 左近山精灵（压在云海前面，墨色才不会被雾冲淡）
  var nearR = null;       // 右近山精灵
  var shoreMist = null;   // 江面薄雾
  var cloudA = null;      // 云精灵
  var cloudB = null;
  var cloudC = null;
  var lampSprite = null;  // 船头灯预渲染光晕

  var peaksFar = [];
  var peaksMid = [];
  var peaksLeft = [];
  var peaksRight = [];
  var glints = [];
  var birds = [];

  var offA = 0;
  var offB = 0;
  var offC = 0;
  var boatRun = 0;

  var WATER_Y = 0;
  var NEAR_BASE = 0;
  var BOAT_Y = 0;

  function rand(a, b) { return a + Math.random() * (b - a); }
  function rgb(c) { return 'rgb(' + c[0] + ', ' + c[1] + ', ' + c[2] + ')'; }
  function rgba(c, a) { return 'rgba(' + c[0] + ', ' + c[1] + ', ' + c[2] + ', ' + a + ')'; }
  function darker(c, k) {
    return [Math.round(c[0] * k), Math.round(c[1] * k), Math.round(c[2] * k)];
  }

  /* ------------------------------------------------------------------ *
   * 墨山轮廓：左右不对称的圆润峰形
   * ------------------------------------------------------------------ */

  function peaksOf(defs, k) {
    var out = [];
    for (var i = 0; i < defs.length; i++) {
      var d = defs[i];
      out.push({
        c: d[0] * W + rand(-0.006, 0.006) * W,
        h: d[1] * H * rand(0.90, 1.10),
        wl: d[2] * W * rand(0.90, 1.10),
        wr: d[3] * W * rand(0.90, 1.10),
        k: (d[4] || k || 0.62)
      });
    }
    return out;
  }

  function ridgeY(x, peaks, baseY, rough) {
    var mass = 0;
    for (var i = 0; i < peaks.length; i++) {
      var p = peaks[i];
      var dx = x - p.c;
      var w = dx < 0 ? p.wl : p.wr;
      var tt = (dx < 0 ? -dx : dx) / w;
      if (tt < 1) {
        var k = 1 - tt * tt;
        mass += p.h * Math.pow(k, p.k);
      }
    }
    if (rough && mass > 0) {
      mass += (Math.sin(x * 0.031 + 0.7) * 0.50 + Math.sin(x * 0.085 + 2.1) * 0.32 +
        Math.sin(x * 0.204 + 4.3) * 0.18) * rough * Math.min(1, mass / (H * 0.06));
      if (mass < 0) { mass = 0; }
    }
    return baseY - mass;
  }

  function massifPath(g, peaks, baseY, bottomY, x0, x1, rough) {
    g.beginPath();
    g.moveTo(x0, bottomY);
    for (var x = x0; x <= x1 + 2; x += 3) {
      var y = ridgeY(x, peaks, baseY, rough);
      if (y > bottomY) { y = bottomY; }
      g.lineTo(x, y);
    }
    g.lineTo(x1, bottomY);
    g.closePath();
  }

  // 积墨：在山体内部再叠一层窄一圈的深墨，山才有阴阳向背
  function paintInnerWash(g, peaks, baseY, bottomY, x0, x1, color, alpha, shrink) {
    var k = shrink || 0.62;
    g.save();
    massifPath(g, peaks, baseY, bottomY, x0, x1, 0);
    g.clip();
    g.beginPath();
    g.moveTo(x0 - 4, bottomY);
    for (var x = x0 - 4; x <= x1 + 4; x += 4) {
      var y = baseY - (baseY - ridgeY(x, peaks, baseY, 0)) * k;
      g.lineTo(x, y);
    }
    g.lineTo(x1 + 4, bottomY);
    g.closePath();
    g.fillStyle = rgba(color, alpha);
    g.fill();
    g.restore();
  }

  // 一层山：墨色由脊向脚渐淡，底部用纸色化进雾里，脊线再用深一档的墨收边
  function paintLayer(g, peaks, baseY, bottomY, x0, x1, color, aRidge, aFoot, rough, fadeFrom, fadeTo) {
    var top = baseY;
    for (var i = 0; i < peaks.length; i++) {
      if (baseY - peaks[i].h < top) { top = baseY - peaks[i].h; }
    }
    var grd = g.createLinearGradient(0, top, 0, fadeTo);
    grd.addColorStop(0, rgba(color, aRidge));
    grd.addColorStop(0.26, rgba(color, Math.min(1, aRidge * 1.10).toFixed(3)));
    grd.addColorStop(0.62, rgba(color, aFoot * 1.6));
    grd.addColorStop(1, rgba(color, aFoot));

    massifPath(g, peaks, baseY, bottomY, x0, x1, rough);
    g.fillStyle = grd;
    g.fill();

    // 山脚留白：只化山体本身，不糊到别处
    g.save();
    massifPath(g, peaks, baseY, bottomY, x0, x1, rough);
    g.clip();
    var fade = g.createLinearGradient(0, fadeFrom, 0, fadeTo);
    fade.addColorStop(0, rgba(PAPER, 0));
    fade.addColorStop(0.55, rgba(PAPER, 0.52));
    fade.addColorStop(1, rgba(PAPER, 0.95));
    g.fillStyle = fade;
    g.fillRect(x0 - 4, fadeFrom, x1 - x0 + 8, fadeTo - fadeFrom + 4);
    g.restore();

    // 脊线：深一档的墨压住轮廓，像毛笔扫过的边
    var dark = darker(color, 0.78);
    g.strokeStyle = rgba(dark, 0.34);
    g.lineWidth = Math.max(1.0, H * 0.0018);
    g.beginPath();
    for (var x = x0 + 2; x <= x1 - 2; x += 4) {
      var y = ridgeY(x, peaks, baseY, rough);
      if (x <= x0 + 3) { g.moveTo(x, y); } else { g.lineTo(x, y); }
    }
    g.stroke();
  }

  /* ------------------------------------------------------------------ *
   * 山石质感：皴笔、破墨、苔点
   * ------------------------------------------------------------------ */

  function paintRock(g, peaks, baseY, bottomY, x0, x1, density) {
    g.save();
    massifPath(g, peaks, baseY, bottomY, x0, x1, 0);
    g.clip();

    var count = Math.round((x1 - x0) * density / 10);
    var dark = darker(NEAR, 0.55);

    // 皴笔：顺着山势往下扫的短墨线
    for (var i = 0; i < count; i++) {
      var x = rand(x0, x1);
      var ry = ridgeY(x, peaks, baseY, 0);
      var y = ry + rand(0.004, 0.105) * H;
      var dir = x < (x0 + x1) / 2 ? -1 : 1;
      var len = rand(7, 34);
      g.strokeStyle = rgba(dark, rand(0.10, 0.34).toFixed(3));
      g.lineWidth = rand(0.9, 2.4);
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + dir * len * 0.30, y + len * 0.52, x + dir * len * 0.55, y + len * 0.98);
      g.stroke();
    }

    // 破墨：用纸色在山体里留几道空，山才透气
    for (var k = 0; k < Math.round(count * 0.34); k++) {
      var x2 = rand(x0, x1);
      var ry2 = ridgeY(x2, peaks, baseY, 0);
      var y2 = ry2 + rand(0.006, 0.075) * H;
      g.strokeStyle = rgba(PAPER, rand(0.05, 0.12).toFixed(3));
      g.lineWidth = rand(2.4, 6.5);
      g.beginPath();
      g.moveTo(x2, y2);
      g.lineTo(x2 + rand(-6, 6), y2 + rand(8, 28));
      g.stroke();
    }

    g.restore();
  }

  function paintMossDots(g, peaks, baseY, x0, x1, n) {
    var dark = darker(NEAR, 0.45);
    for (var i = 0; i < n; i++) {
      var mx = rand(x0, x1);
      var my = ridgeY(mx, peaks, baseY, 0) + rand(0, 0.006) * H;
      g.fillStyle = rgba(dark, rand(0.30, 0.75).toFixed(3));
      g.beginPath();
      g.arc(mx, my, rand(1.0, 3.2), 0, 6.2832);
      g.fill();
    }
  }

  /* ------------------------------------------------------------------ *
   * 宣纸
   * ------------------------------------------------------------------ */

  function paintPaper(g) {
    g.fillStyle = rgb(PAPER);
    g.fillRect(0, 0, W, H);

    var l = g.createLinearGradient(0, 0, W, H);
    l.addColorStop(0, 'rgba(255, 253, 246, 0.62)');
    l.addColorStop(0.45, 'rgba(255, 253, 246, 0.10)');
    l.addColorStop(1, 'rgba(220, 209, 188, 0.24)');
    g.fillStyle = l;
    g.fillRect(0, 0, W, H);

    g.lineCap = 'round';
    var fibers = Math.round(W * H / 5200);
    for (var i = 0; i < fibers; i++) {
      var x = Math.random() * W;
      var y = Math.random() * H;
      var len = rand(5, 26);
      var ang = rand(-0.35, 0.35) + (Math.random() < 0.12 ? 1.45 : 0);
      g.strokeStyle = 'rgba(124, 112, 92, ' + rand(0.012, 0.038).toFixed(3) + ')';
      g.lineWidth = rand(0.5, 1.1);
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
      g.stroke();
    }

    var dots = Math.round(W * H / 2600);
    for (var d = 0; d < dots; d++) {
      g.fillStyle = 'rgba(108, 98, 82, ' + rand(0.015, 0.045).toFixed(3) + ')';
      g.fillRect(Math.random() * W, Math.random() * H, 1.2, 1.2);
    }

    var v = g.createRadialGradient(W * 0.5, H * 0.47, H * 0.26, W * 0.5, H * 0.5, Math.max(W, H) * 0.82);
    v.addColorStop(0, 'rgba(0, 0, 0, 0)');
    v.addColorStop(1, 'rgba(150, 136, 112, 0.09)');
    g.fillStyle = v;
    g.fillRect(0, 0, W, H);
  }

  function paintMistBand(g, y0, y1, alpha) {
    var grd = g.createLinearGradient(0, y0, 0, y1);
    grd.addColorStop(0, rgba(PAPER, 0));
    grd.addColorStop(0.5, rgba([250, 247, 239], alpha));
    grd.addColorStop(1, rgba(PAPER, 0));
    g.fillStyle = grd;
    g.fillRect(0, y0, W, y1 - y0);
  }

  /* ------------------------------------------------------------------ *
   * 江水 / 倒影 / 水纹
   * ------------------------------------------------------------------ */

  function paintWater(g) {
    var grd = g.createLinearGradient(0, WATER_Y, 0, H);
    grd.addColorStop(0, 'rgba(247, 243, 233, 0.96)');
    grd.addColorStop(0.45, 'rgba(239, 233, 221, 0.96)');
    grd.addColorStop(1, 'rgba(230, 223, 208, 0.96)');
    g.fillStyle = grd;
    g.fillRect(0, WATER_Y - 2, W, H - WATER_Y + 2);
  }

  function paintReflections(g) {
    g.save();
    g.beginPath();
    g.rect(0, WATER_Y, W, H - WATER_Y);
    g.clip();

    var sets = [
      { p: peaksLeft, x0: -0.06 * W, x1: 0.415 * W },
      { p: peaksRight, x0: 0.605 * W, x1: 1.06 * W }
    ];
    for (var s = 0; s < sets.length; s++) {
      var set = sets[s];
      var maxH = 0;
      for (var i = 0; i < set.p.length; i++) {
        if (set.p[i].h > maxH) { maxH = set.p[i].h; }
      }
      var grd = g.createLinearGradient(0, WATER_Y + 1, 0, WATER_Y + maxH * 0.26 + 1);
      grd.addColorStop(0, rgba(NEAR, 0.16));
      grd.addColorStop(0.45, rgba(NEAR, 0.07));
      grd.addColorStop(1, rgba(NEAR, 0));
      g.fillStyle = grd;
      for (var x = set.x0; x <= set.x1; x += 6) {
        var ry = ridgeY(x, set.p, NEAR_BASE, 0);
        var hgt = (NEAR_BASE - ry) * 0.22;
        if (hgt < 1) { continue; }
        g.fillRect(x, WATER_Y + 1, 6.2, hgt);
      }
    }

    for (var k = 0; k < 18; k++) {
      g.fillStyle = rgba(PAPER, rand(0.25, 0.62).toFixed(3));
      g.fillRect(rand(-0.05, 1) * W, WATER_Y + rand(0.004, 0.095) * H, rand(0.03, 0.15) * W, rand(1, 2.4));
    }
    g.restore();
  }

  function paintWaterStrokes(g) {
    var span = H - WATER_Y;
    for (var i = 0; i < 46; i++) {
      var y = WATER_Y + rand(0.05, 0.96) * span;
      var x = rand(-0.06, 1) * W;
      var len = rand(0.03, 0.13) * W;
      g.strokeStyle = rgba(NEAR, rand(0.02, 0.08).toFixed(3));
      g.lineWidth = rand(0.8, 2.0);
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + len * 0.5, y + rand(-2, 2), x + len, y + rand(-1.5, 1.5));
      g.stroke();
    }
    for (var j = 0; j < 32; j++) {
      var y2 = WATER_Y + rand(0.03, 0.96) * span;
      var x2 = rand(-0.06, 1) * W;
      var len2 = rand(0.02, 0.10) * W;
      g.strokeStyle = 'rgba(255, 253, 247, ' + rand(0.10, 0.28).toFixed(3) + ')';
      g.lineWidth = rand(1, 2.6);
      g.beginPath();
      g.moveTo(x2, y2);
      g.lineTo(x2 + len2, y2 + rand(-1.5, 1.5));
      g.stroke();
    }
    // 江面几块小石：墨点，点出水面的空
    for (var r = 0; r < 5; r++) {
      var sx = rand(0.26, 0.62) * W;
      var sy = WATER_Y + rand(0.10, 0.45) * span;
      g.fillStyle = rgba(NEAR, rand(0.35, 0.6).toFixed(3));
      g.beginPath();
      g.ellipse(sx, sy, rand(2.5, 6), rand(1.2, 2.2), 0, 0, 6.2832);
      g.fill();
    }
  }

  /* ------------------------------------------------------------------ *
   * 前景：左下角一块墨石岸 + 几竿芦苇
   * ------------------------------------------------------------------ */

  function paintBank(g) {
    var x0 = -0.06 * W;
    var x1 = 0.255 * W;
    var baseY = H + 4;
    var topY = H - 0.085 * H;

    g.beginPath();
    g.moveTo(x0, baseY);
    g.lineTo(x0, H - 0.040 * H);
    g.quadraticCurveTo(0.020 * W, topY - H * 0.020, 0.050 * W, topY);
    g.quadraticCurveTo(0.085 * W, topY - H * 0.008, 0.115 * W, topY + H * 0.026);
    g.quadraticCurveTo(0.160 * W, topY + H * 0.040, 0.196 * W, H - 0.048 * H);
    g.quadraticCurveTo(0.225 * W, H - 0.026 * H, x1, baseY);
    g.closePath();
    var grd = g.createLinearGradient(0, topY, 0, H);
    grd.addColorStop(0, rgba(NEAR, 0.86));
    grd.addColorStop(0.50, rgba(NEAR, 0.96));
    grd.addColorStop(1, rgba(NEAR, 0.99));
    g.fillStyle = grd;
    g.fill();

    // 岸石皴笔
    g.save();
    g.clip();
    var dark = darker(NEAR, 0.5);
    for (var i = 0; i < 30; i++) {
      var sx = rand(x0, x1);
      var sy = rand(topY + H * 0.004, H);
      g.strokeStyle = rgba(dark, rand(0.14, 0.34).toFixed(3));
      g.lineWidth = rand(1.0, 2.6);
      g.beginPath();
      g.moveTo(sx, sy);
      g.lineTo(sx + rand(10, 26), sy + rand(2, 12));
      g.stroke();
    }
    for (var k = 0; k < 9; k++) {
      g.strokeStyle = rgba(PAPER, rand(0.04, 0.10).toFixed(3));
      g.lineWidth = rand(1.8, 4.5);
      g.beginPath();
      g.moveTo(rand(x0, x1), rand(topY, H));
      g.lineTo(rand(x0, x1) + 8, rand(topY, H) + 14);
      g.stroke();
    }
    g.restore();

    // 岸线苔点
    for (var m = 0; m < 18; m++) {
      var mx = rand(-0.02 * W, 0.235 * W);
      var my = H - 0.078 * H + rand(-2, 8);
      g.fillStyle = rgba(dark, rand(0.35, 0.75).toFixed(3));
      g.beginPath();
      g.arc(mx, my, rand(1.0, 2.8), 0, 6.2832);
      g.fill();
    }

    // 芦苇：几竿细笔，梢头往右斜，穗做两笔短撇
    g.lineCap = 'round';
    for (var r = 0; r < 7; r++) {
      var bx = 0.012 * W + r * 0.026 * W + rand(-3, 3);
      var hh = H * rand(0.048, 0.098);
      var lean = rand(0.18, 0.42);
      var tipX = bx + lean * hh;
      var tipY = H - 0.070 * H - hh;
      g.strokeStyle = rgba(NEAR, rand(0.60, 0.88).toFixed(3));
      g.lineWidth = rand(0.9, 1.7);
      g.beginPath();
      g.moveTo(bx, H - 0.062 * H);
      g.quadraticCurveTo(bx + lean * hh * 0.35, H - 0.062 * H - hh * 0.62, tipX, tipY);
      g.stroke();
      // 穗
      g.lineWidth = rand(0.8, 1.3);
      g.beginPath();
      g.moveTo(tipX, tipY);
      g.quadraticCurveTo(tipX + 4, tipY + 5, tipX + 1, tipY + 11);
      g.stroke();
      g.beginPath();
      g.moveTo(tipX, tipY);
      g.quadraticCurveTo(tipX - 4, tipY + 6, tipX - 2, tipY + 12);
      g.stroke();
    }
  }

  /* ------------------------------------------------------------------ *
   * 题诗 + 印章（竖排淡墨）
   * ------------------------------------------------------------------ */

  function roundedRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.lineTo(x + w - r, y);
    g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r);
    g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    g.lineTo(x + r, y + h);
    g.quadraticCurveTo(x, y + h, x, y + h - r);
    g.lineTo(x, y + r);
    g.quadraticCurveTo(x, y, x + r, y);
    g.closePath();
  }

  function paintPoem(g) {
    var fs = Math.max(12, Math.min(27, H * 0.0215));
    var cols = ['远看山有色', '近听水无声'];
    var rightX = W - Math.max(H * 0.085, fs * 2.3);
    var colGap = fs * 1.85;
    var lineH = fs * 1.30;
    var topY = H * 0.100;

    g.save();
    g.font = fs + 'px "KaiTi", "STKaiti", "SimSun", serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';

    for (var c = 0; c < cols.length; c++) {
      var x = rightX - c * colGap;
      var s = cols[c];
      for (var i = 0; i < s.length; i++) {
        g.fillStyle = rgba(NEAR, (0.46 + i * 0.012).toFixed(3));
        g.fillText(s[i], x, topY + i * lineH);
      }
    }

    // 朱砂小印
    var sealW = Math.max(10, fs * 1.02);
    var sealX = rightX - (cols.length - 1) * colGap;
    var sealY = topY + 4 * lineH + fs * 0.62;
    g.fillStyle = rgba(CINNABAR, 0.86);
    roundedRect(g, sealX - sealW / 2, sealY, sealW, sealW, sealW * 0.16);
    g.fill();
    g.fillStyle = rgba(PAPER, 0.62);
    g.fillRect(sealX - sealW * 0.20, sealY + sealW * 0.26, sealW * 0.40, sealW * 0.09);
    g.fillRect(sealX - sealW * 0.05, sealY + sealW * 0.20, sealW * 0.10, sealW * 0.58);
    g.restore();
  }

  /* ------------------------------------------------------------------ *
   * 烘焙
   * ------------------------------------------------------------------ */

  function buildStatic() {
    WATER_Y = H * 0.735;
    NEAR_BASE = H * 0.768;
    BOAT_Y = H * 0.858;

    // 远山：淡墨，横贯全幅，左侧起一座高的，别做成一条灰带
    peaksFar = peaksOf([
      [0.00, 0.044, 0.070, 0.105], [0.17, 0.052, 0.105, 0.085], [0.315, 0.082, 0.120, 0.095],
      [0.47, 0.030, 0.075, 0.090], [0.63, 0.062, 0.100, 0.115], [0.795, 0.038, 0.090, 0.100],
      [0.94, 0.056, 0.110, 0.090]
    ], 1.10);

    // 中山：中墨，中间留一段低的缺口当江口
    peaksMid = peaksOf([
      [0.055, 0.062, 0.090, 0.110], [0.205, 0.088, 0.095, 0.115], [0.355, 0.040, 0.080, 0.090],
      [0.475, 0.022, 0.070, 0.075], [0.635, 0.098, 0.105, 0.125], [0.795, 0.050, 0.090, 0.100],
      [0.955, 0.070, 0.105, 0.095]
    ], 0.92);

    // 近山：左右两块，中间留出江面
    peaksLeft = peaksOf([
      [-0.03, 0.060, 0.070, 0.095], [0.095, 0.188, 0.115, 0.145],
      [0.255, 0.062, 0.075, 0.090], [0.365, 0.030, 0.070, 0.070]
    ], 0.62);
    peaksRight = peaksOf([
      [0.655, 0.030, 0.060, 0.080], [0.788, 0.140, 0.085, 0.105],
      [0.915, 0.078, 0.090, 0.075], [1.015, 0.046, 0.075, 0.065]
    ], 0.62);

    bg = document.createElement('canvas');
    bg.width = Math.max(1, Math.ceil(W * dpr));
    bg.height = Math.max(1, Math.ceil(H * dpr));
    var g = bg.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.lineCap = 'round';
    g.lineJoin = 'round';

    paintPaper(g);

    // 远山
    paintLayer(g, peaksFar, H * 0.420, H * 0.700, -0.06 * W, 1.06 * W, FAR,
      0.58, 0.20, H * 0.0030, H * 0.556, H * 0.664);

    // 中山：内部再积一层墨，山脚化进江雾
    paintLayer(g, peaksMid, H * 0.558, WATER_Y + 2, -0.06 * W, 1.06 * W, MID,
      0.74, 0.26, H * 0.0035, H * 0.646, WATER_Y + 2);
    paintInnerWash(g, peaksMid, H * 0.558, WATER_Y + 2, -0.06 * W, 1.06 * W,
      darker(MID, 0.82), 0.20, 0.58);

    paintWater(g);
    paintReflections(g);
    paintWaterStrokes(g);
    paintBank(g);
    paintPoem(g);

    // 近山单独烘焙，每帧压在云海之上
    nearL = makeNearSprite(peaksLeft, -0.06 * W, 0.415 * W);
    nearR = makeNearSprite(peaksRight, 0.605 * W, 1.06 * W);
    shoreMist = makeMistSprite(H * 0.095, 0.30);
  }
  function makeNearSprite(peaks, x0, x1) {
    var y0 = H * 0.46;
    var y1 = WATER_Y + H * 0.004;
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil((x1 - x0) * dpr));
    c.height = Math.max(1, Math.ceil((y1 - y0) * dpr));
    var g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.translate(-x0, -y0);
    g.lineCap = 'round';
    g.lineJoin = 'round';

    // 整块焦墨：脊上略实、山脚略虚
    var top = NEAR_BASE;
    for (var i = 0; i < peaks.length; i++) {
      if (NEAR_BASE - peaks[i].h < top) { top = NEAR_BASE - peaks[i].h; }
    }
    var ng = g.createLinearGradient(0, top, 0, WATER_Y + 2);
    ng.addColorStop(0, rgba(NEAR, 1));
    ng.addColorStop(0.55, rgba(NEAR, 0.99));
    ng.addColorStop(1, rgba(NEAR, 0.90));
    massifPath(g, peaks, NEAR_BASE, WATER_Y + 2, x0, x1, H * 0.005);
    g.fillStyle = ng;
    g.fill();

    // 脊线收边
    g.strokeStyle = rgba(darker(NEAR, 0.55), 0.5);
    g.lineWidth = Math.max(1.2, H * 0.0022);
    g.beginPath();
    for (var x = x0 + 2; x <= x1 - 2; x += 4) {
      var y = ridgeY(x, peaks, NEAR_BASE, H * 0.005);
      if (x <= x0 + 3) { g.moveTo(x, y); } else { g.lineTo(x, y); }
    }
    g.stroke();

    paintRock(g, peaks, NEAR_BASE, WATER_Y + 2, x0, x1, 1);
    paintMossDots(g, peaks, NEAR_BASE, x0, x1, Math.round((x1 - x0) / 12));

    // 山脚化进江雾（只化山体本身，别糊到水面上）
    g.save();
    massifPath(g, peaks, NEAR_BASE, WATER_Y + 2, x0, x1, 0);
    g.clip();
    var fade = g.createLinearGradient(0, WATER_Y - H * 0.024, 0, WATER_Y + 2);
    fade.addColorStop(0, rgba(PAPER, 0));
    fade.addColorStop(1, rgba(PAPER, 0.58));
    g.fillStyle = fade;
    g.fillRect(x0 - 4, WATER_Y - H * 0.024, x1 - x0 + 8, H * 0.032);
    g.restore();

    return { c: c, x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  function makeMistSprite(h, alpha) {
    var c = document.createElement('canvas');
    c.width = Math.max(2, Math.ceil(W));
    c.height = Math.max(2, Math.ceil(h));
    var g = c.getContext('2d');
    var grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, rgba([250, 247, 239], 0));
    grd.addColorStop(0.5, rgba([250, 247, 239], alpha));
    grd.addColorStop(1, rgba([250, 247, 239], 0));
    g.fillStyle = grd;
    g.fillRect(0, 0, W, h);
    return c;
  }

  /* ------------------------------------------------------------------ *
   * 云：预渲染柔光长条，每帧只 drawImage 平移
   * ------------------------------------------------------------------ */

  function makeCloud(w, h, alpha) {
    var c = document.createElement('canvas');
    c.width = Math.max(2, Math.ceil(w));
    c.height = Math.max(2, Math.ceil(h));
    var g = c.getContext('2d');
    for (var i = 0; i < 12; i++) {
      var px = rand(0.10, 0.90) * w;
      var py = rand(0.30, 0.70) * h;
      var rx = rand(0.11, 0.24) * w;
      var ry = rand(0.16, 0.34) * h;
      g.save();
      g.translate(px, py);
      g.scale(1, ry / rx);
      var grd = g.createRadialGradient(0, 0, 0, 0, 0, rx);
      grd.addColorStop(0, 'rgba(255, 253, 248, ' + (alpha * rand(0.55, 1.0)).toFixed(3) + ')');
      grd.addColorStop(0.55, 'rgba(255, 253, 248, ' + (alpha * 0.28).toFixed(3) + ')');
      grd.addColorStop(1, 'rgba(255, 253, 248, 0)');
      g.fillStyle = grd;
      g.beginPath();
      g.arc(0, 0, rx, 0, 6.2832);
      g.fill();
      g.restore();
    }
    return c;
  }

  function makeGlow(size, color) {
    var c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    var g = c.getContext('2d');
    var grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grd.addColorStop(0, rgba(color, 0.62));
    grd.addColorStop(0.22, rgba(color, 0.28));
    grd.addColorStop(0.55, rgba(color, 0.08));
    grd.addColorStop(1, rgba(color, 0));
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
    return c;
  }

  /* ------------------------------------------------------------------ *
   * 动态
   * ------------------------------------------------------------------ */

  function buildGlints() {
    glints.length = 0;
    var n = Math.max(46, Math.round(W / 20));
    for (var i = 0; i < n; i++) {
      var x = rand(-0.04, 1.0) * W;
      var y = WATER_Y + rand(0.012, 0.94) * (H - WATER_Y);
      if (x < 0.27 * W && y > H - 0.10 * H) { continue; }
      var warm = Math.random() < 0.68;
      glints.push({
        x: x, y: y,
        len: rand(5, 0.070 * W),
        dy: rand(-1.4, 1.4),
        lw: rand(0.8, 2.0),
        ph: rand(0, Math.PI * 2),
        sp: rand(0.35, 1.30),
        a: warm ? rand(0.10, 0.30) : rand(0.04, 0.10),
        warm: warm
      });
    }
  }

  function buildBirds() {
    birds.length = 0;
    var ax = 0.335 * W;
    var ay = 0.170 * H;
    var offs = [[0, 0, 1.0], [0.060, -0.036, 0.86], [0.104, 0.022, 0.78],
      [0.034, 0.048, 0.70], [0.155, -0.010, 0.64]];
    for (var i = 0; i < offs.length; i++) {
      var o = offs[i];
      birds.push({
        x: ax + o[0] * W + rand(-6, 6),
        y: ay + o[1] * H + rand(-4, 4),
        span: Math.max(7, H * 0.018 * o[2] * rand(0.92, 1.08)),
        wl: rand(0.86, 1.14),
        wr: rand(0.86, 1.14),
        speed: rand(5, 10),
        ph: rand(0, Math.PI * 2),
        flap: rand(1.3, 2.0),
        alpha: rand(0.55, 0.80)
      });
    }
  }

  function drawBand(spr, off, centerY, alpha) {
    if (!spr) { return; }
    var sw = spr.width;
    var sh = spr.height;
    var top = centerY - sh / 2;
    var x = -(off % sw);
    ctx.globalAlpha = alpha;
    ctx.drawImage(spr, x, top, sw, sh);
    ctx.drawImage(spr, x + sw, top, sw, sh);
    ctx.globalAlpha = 1;
  }

  function drawGlints() {
    for (var i = 0; i < glints.length; i++) {
      var s = glints[i];
      var tw = Math.sin(t * s.sp + s.ph);
      if (tw < -0.45) { continue; }
      var a = s.a * (0.30 + 0.70 * (tw * 0.5 + 0.5));
      if (a < 0.006) { continue; }
      ctx.strokeStyle = s.warm ? 'rgba(255, 253, 244, ' + a.toFixed(3) + ')' : rgba(NEAR, a.toFixed(3));
      ctx.lineWidth = s.lw;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x + s.len, s.y + s.dy);
      ctx.stroke();
    }
  }

  function drawBoat() {
    var s = Math.max(18, H * 0.060);
    var bx = W * 0.325 + (boatRun % (W * 1.30));
    var by = BOAT_Y + Math.sin(t * 0.55) * s * 0.030;

    ctx.save();
    ctx.translate(bx, by);

    // 倒影
    ctx.fillStyle = rgba(NEAR, 0.12);
    ctx.beginPath();
    ctx.ellipse(0, s * 0.24, s * 0.98, s * 0.14, 0, 0, 6.2832);
    ctx.fill();

    // 船体
    ctx.fillStyle = rgba(NEAR, 0.95);
    ctx.beginPath();
    ctx.moveTo(-s, -s * 0.04);
    ctx.quadraticCurveTo(-s * 0.60, s * 0.32, 0, s * 0.33);
    ctx.quadraticCurveTo(s * 0.60, s * 0.32, s, -s * 0.12);
    ctx.quadraticCurveTo(s * 0.50, -s * 0.18, 0, -s * 0.18);
    ctx.quadraticCurveTo(-s * 0.50, -s * 0.18, -s, -s * 0.04);
    ctx.closePath();
    ctx.fill();

    // 篷
    ctx.beginPath();
    ctx.moveTo(-s * 0.56, -s * 0.17);
    ctx.quadraticCurveTo(-s * 0.18, -s * 0.86, s * 0.14, -s * 0.17);
    ctx.closePath();
    ctx.fillStyle = rgba(NEAR, 0.92);
    ctx.fill();
    ctx.strokeStyle = rgba(PAPER, 0.32);
    ctx.lineWidth = Math.max(0.9, s * 0.038);
    ctx.beginPath();
    ctx.moveTo(-s * 0.34, -s * 0.22);
    ctx.quadraticCurveTo(-s * 0.20, -s * 0.56, s * 0.02, -s * 0.22);
    ctx.stroke();

    // 船尾渔翁
    ctx.fillStyle = rgba(NEAR, 0.95);
    ctx.beginPath();
    ctx.moveTo(s * 0.44, -s * 0.02);
    ctx.lineTo(s * 0.64, -s * 0.02);
    ctx.lineTo(s * 0.59, -s * 0.22);
    ctx.lineTo(s * 0.49, -s * 0.22);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(s * 0.40, -s * 0.22);
    ctx.lineTo(s * 0.68, -s * 0.22);
    ctx.lineTo(s * 0.54, -s * 0.35);
    ctx.closePath();
    ctx.fill();

    // 竹竿
    ctx.strokeStyle = rgba(NEAR, 0.55);
    ctx.lineWidth = Math.max(0.8, s * 0.026);
    ctx.beginPath();
    ctx.moveTo(s * 0.60, -s * 0.28);
    ctx.lineTo(s * 1.66, -s * 0.74);
    ctx.stroke();

    // 船头灯：朱砂一点 + 极淡光晕
    var lx = -s * 0.86;
    var ly = -s * 0.13;
    var breathe = 0.70 + 0.22 * Math.sin(t * 1.05);
    if (lampSprite) {
      var gs = s * 1.15;
      ctx.globalAlpha = 0.36 * breathe;
      ctx.drawImage(lampSprite, lx - gs / 2, ly - gs / 2, gs, gs);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = rgba(CINNABAR, 0.90);
    ctx.beginPath();
    ctx.arc(lx, ly, Math.max(1.2, s * 0.055), 0, 6.2832);
    ctx.fill();

    // 船边涟漪
    ctx.strokeStyle = rgba(NEAR, 0.13);
    ctx.lineWidth = 1;
    for (var i = 0; i < 2; i++) {
      var rr = s * (0.92 + 0.20 * i) + Math.sin(t * 0.8 + i * 1.7) * s * 0.05;
      ctx.beginPath();
      ctx.ellipse(0, s * 0.24, rr, rr * 0.09, 0, 0, 6.2832);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawBirds() {
    for (var i = 0; i < birds.length; i++) {
      var b = birds[i];
      var span = b.span;
      var flap = Math.sin(t * b.flap + b.ph);
      var lift = 0.60 + 0.16 * flap;              // 0.44 ~ 0.76
      var cy = b.y + Math.sin(t * 0.42 + b.ph) * H * 0.003;
      var homeY = cy - span * lift * 0.40;

      ctx.strokeStyle = rgba(NEAR, b.alpha.toFixed(3));
      ctx.lineWidth = Math.max(1.2, span * 0.15);
      ctx.lineCap = 'round';
      // 「人」字：两翅一笔长一笔短，像毛笔随手扫出来的
      var lw = span * b.wl;
      var rw = span * b.wr;
      ctx.beginPath();
      ctx.moveTo(b.x - lw, cy - span * lift * b.wl);
      ctx.quadraticCurveTo(b.x - lw * 0.42, homeY, b.x, cy + span * 0.10);
      ctx.quadraticCurveTo(b.x + rw * 0.42, homeY, b.x + rw, cy - span * lift * b.wr);
      ctx.stroke();
    }
  }

  /* ------------------------------------------------------------------ *
   * 循环
   * ------------------------------------------------------------------ */

  function advance(dt) {
    t += dt;
    offA += 4.4 * dt;
    offB += 2.9 * dt;
    offC += 1.6 * dt;
    boatRun += 4.0 * dt;

    for (var i = 0; i < birds.length; i++) {
      var b = birds[i];
      b.x += b.speed * dt;
      if (b.x > W + W * 0.10) {
        b.x = -W * 0.10;
        b.y = 0.170 * H + rand(-0.045, 0.045) * H;
        b.span = Math.max(7, H * 0.018 * rand(0.64, 1.0));
        b.speed = rand(5, 10);
      }
    }
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (bg) { ctx.drawImage(bg, 0, 0, W, H); }

    // 云海：在远山/中山之间飘，再被近山压住
    drawBand(cloudA, offA, H * 0.505, 0.62);
    drawBand(cloudB, offB, H * 0.610, 0.50);

    if (nearL) { ctx.drawImage(nearL.c, nearL.x, nearL.y, nearL.w, nearL.h); }
    if (nearR) { ctx.drawImage(nearR.c, nearR.x, nearR.y, nearR.w, nearR.h); }
    if (shoreMist) { ctx.drawImage(shoreMist, 0, H * 0.700, W, H * 0.095); }

    drawBand(cloudC, offC, H * 0.742, 0.38);

    drawGlints();
    drawBoat();
    drawBirds();
  }

  function warmup(frames) {
    // 预演若干帧，保证截图时飞鸟、孤舟都已经在构图里
    var dt = 1 / 30;
    for (var i = 0; i < frames; i++) {
      advance(dt);
      draw();
    }
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

    buildStatic();

    cloudA = makeCloud(W * 1.15, H * 0.14, 0.50);
    cloudB = makeCloud(W * 1.10, H * 0.12, 0.42);
    cloudC = makeCloud(W * 1.05, H * 0.10, 0.34);
    lampSprite = makeGlow(64, LAMP);

    buildGlints();
    buildBirds();

    warmup(120);
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
