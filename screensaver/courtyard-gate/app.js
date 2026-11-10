/* 庭院月洞门 —— 粉墙瓦檐压顶，正中一轮月洞门框住庭院：远处的院墙、几竿竹、一块太湖石、
   青砖地与一盏暖灯；门内薄雾缓流、竹叶轻摆、灯笼微晃，门外落花与地雾 */
(function () {
  'use strict';

  var canvas = document.getElementById('scene');
  var ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) { return; }

  var MAX_DPR = 2;
  var TAU = Math.PI * 2;

  // 配色（五色）：米白粉墙 / 青灰砖瓦 / 墨竹 / 暖黄灯 / 淡胭脂落花
  var SKY = [224, 227, 221];
  var WALL = [248, 244, 235];
  var STONE = [141, 152, 155];
  var STONE_D = [96, 108, 113];
  var INK = [55, 66, 58];
  var WARM = [232, 163, 74];
  var PETAL = [212, 145, 136];

  var W = 1;
  var H = 1;
  var dpr = 1;
  var t = 0;
  var rafId = 0;
  var last = 0;
  var resizeTimer = 0;

  var bg = null;
  var glowSprite = null;
  var mistA = null;
  var mistB = null;
  var mistOutA = null;
  var mistOutB = null;
  var groundMist = null;
  var leafSprigs = [];

  var CX = 0;
  var CY = 0;
  var R = 0;
  var WALL_BOTTOM = 0;
  var INT_GROUND = 0;
  var LANTERN_X = 0;

  var stalks = [];
  var sprigs = [];
  var petals = [];
  var drips = [];
  var splashes = [];

  var offOutA = 0;
  var offOutB = 0;

  function rand(a, b) { return a + Math.random() * (b - a); }
  function rgb(c) { return 'rgb(' + c[0] + ', ' + c[1] + ', ' + c[2] + ')'; }
  function rgba(c, a) { return 'rgba(' + c[0] + ', ' + c[1] + ', ' + c[2] + ', ' + a + ')'; }
  function mix(c1, c2, k) {
    return [
      Math.round(c1[0] + (c2[0] - c1[0]) * k),
      Math.round(c1[1] + (c2[1] - c1[1]) * k),
      Math.round(c1[2] + (c2[2] - c1[2]) * k)
    ];
  }
  function darker(c, k) { return [Math.round(c[0] * k), Math.round(c[1] * k), Math.round(c[2] * k)]; }

  /* ------------------------------------------------------------------ *
   * 瓦檐曲线：中间略平，两头轻轻起翘
   * ------------------------------------------------------------------ */

  function eaveCurl(x) {
    var mx = Math.abs(x / W - 0.5) * 2;
    return mx > 0.70 ? Math.pow((mx - 0.70) / 0.30, 2.2) : 0;
  }

  function eaveTop(x) {
    var mx = Math.abs(x / W - 0.5) * 2;
    var arch = 1 - mx * mx;
    return H * 0.058 + H * 0.022 * (1 - arch) - H * 0.008 * eaveCurl(x);
  }

  function eaveBot(x) {
    return eaveTop(x) + H * 0.047 - H * 0.028 * eaveCurl(x);
  }

  /* ------------------------------------------------------------------ *
   * 天空
   * ------------------------------------------------------------------ */

  function paintSky(g) {
    var grd = g.createLinearGradient(0, 0, 0, H * 0.14);
    grd.addColorStop(0, rgb(mix(SKY, [248, 248, 242], 0.70)));
    grd.addColorStop(1, rgb(mix(SKY, [206, 210, 202], 0.45)));
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H * 0.16);

    // 檐上一线天光
    var glow = g.createLinearGradient(0, H * 0.012, 0, H * 0.062);
    glow.addColorStop(0, 'rgba(255, 255, 250, 0)');
    glow.addColorStop(0.55, 'rgba(255, 255, 250, 0.45)');
    glow.addColorStop(1, 'rgba(255, 255, 250, 0)');
    g.fillStyle = glow;
    g.fillRect(0, H * 0.010, W, H * 0.056);
  }

  /* ------------------------------------------------------------------ *
   * 瓦檐压顶
   * ------------------------------------------------------------------ */

  function eaveBandPath(g, dy) {
    var d = dy || 0;
    g.beginPath();
    g.moveTo(-6, eaveTop(-6) + d);
    for (var x = -6; x <= W + 6; x += 5) { g.lineTo(x, eaveTop(x) + d); }
    for (var x2 = W + 6; x2 >= -6; x2 -= 5) { g.lineTo(x2, eaveBot(x2) + d); }
    g.closePath();
  }

  function paintEave(g) {
    eaveBandPath(g, 0);
    var grd = g.createLinearGradient(0, H * 0.050, 0, H * 0.112);
    grd.addColorStop(0, rgb(mix(STONE, [255, 255, 255], 0.34)));
    grd.addColorStop(0.30, rgb(mix(STONE, [255, 255, 255], 0.06)));
    grd.addColorStop(0.78, rgb(mix(STONE, [60, 70, 72], 0.18)));
    grd.addColorStop(1, rgb(darker(STONE, 0.66)));
    g.fillStyle = grd;
    g.fill();

    g.save();
    eaveBandPath(g, 0);
    g.clip();

    // 瓦垄：一垄一垄的瓦沟，是这块屋面最要紧的纹理
    var step = Math.max(16, W * 0.0225);
    for (var x = -step; x <= W + step; x += step) {
      var top = eaveTop(x) + H * 0.008;
      var bot = eaveBot(x) - H * 0.008;
      g.strokeStyle = 'rgba(58, 70, 76, 0.30)';
      g.lineWidth = Math.max(1.2, H * 0.0026);
      g.beginPath();
      g.moveTo(x, top);
      g.lineTo(x, bot);
      g.stroke();
      g.strokeStyle = 'rgba(255, 255, 255, 0.26)';
      g.lineWidth = Math.max(1.0, H * 0.0022);
      g.beginPath();
      g.moveTo(x + step * 0.40, top + H * 0.002);
      g.lineTo(x + step * 0.40, bot - H * 0.002);
      g.stroke();
    }

    // 瓦面上一道横的接缝
    g.strokeStyle = 'rgba(66, 78, 83, 0.15)';
    g.lineWidth = 1;
    g.beginPath();
    for (var xa = -6; xa <= W + 6; xa += 5) {
      var yy = eaveTop(xa) + (eaveBot(xa) - eaveTop(xa)) * 0.40;
      if (xa < 0) { g.moveTo(xa, yy); } else { g.lineTo(xa, yy); }
    }
    g.stroke();
    g.restore();

    // 瓦脊：屋顶上沿压一道深色，屋檐才有厚度
    g.save();
    g.beginPath();
    g.moveTo(-6, eaveTop(-6) + H * 0.010);
    for (var xr = -6; xr <= W + 6; xr += 5) { g.lineTo(xr, eaveTop(xr) + H * 0.010); }
    for (var xr2 = W + 6; xr2 >= -6; xr2 -= 5) { g.lineTo(xr2, eaveTop(xr2) - H * 0.008); }
    g.closePath();
    var rg = g.createLinearGradient(0, eaveTop(0) - H * 0.01, 0, eaveTop(0) + H * 0.012);
    rg.addColorStop(0, rgb(darker(STONE, 0.62)));
    rg.addColorStop(0.55, rgb(darker(STONE, 0.78)));
    rg.addColorStop(1, rgb(mix(STONE, [255, 255, 255], 0.22)));
    g.fillStyle = rg;
    g.fill();
    g.restore();

    // 瓦当：和瓦垄共用同一套间距，一排大一点的半圆瓦头垂在檐口下面
    var step2 = step;
    for (var x2 = -step2; x2 <= W + step2; x2 += step2) {
      var by = eaveBot(x2 - step2 * 0.5) - H * 0.0010;
      var rr = Math.max(5.0, H * 0.0105);
      g.fillStyle = rgb(mix(STONE, [62, 72, 76], 0.24));
      g.beginPath();
      g.arc(x2, by, rr, 0, Math.PI);
      g.fill();
      g.strokeStyle = 'rgba(52, 62, 66, 0.30)';
      g.lineWidth = Math.max(0.9, H * 0.0018);
      g.beginPath();
      g.arc(x2, by, rr, 0, Math.PI);
      g.stroke();
      g.fillStyle = 'rgba(255, 255, 255, 0.14)';
      g.beginPath();
      g.arc(x2 - rr * 0.18, by + rr * 0.14, rr * 0.26, 0.2, Math.PI - 0.2);
      g.fill();
    }

    // 檐口压深的一道边
    g.strokeStyle = rgba(darker(STONE, 0.50), 0.80);
    g.lineWidth = Math.max(1.6, H * 0.0030);
    g.beginPath();
    g.moveTo(-6, eaveBot(-6));
    for (var x3 = -6; x3 <= W + 6; x3 += 5) { g.lineTo(x3, eaveBot(x3)); }
    g.stroke();

    // 檐下投影落到墙上
    g.save();
    g.beginPath();
    g.moveTo(-6, eaveBot(-6));
    for (var x4 = -6; x4 <= W + 6; x4 += 5) { g.lineTo(x4, eaveBot(x4)); }
    g.lineTo(W + 6, eaveBot(W + 6) + H * 0.042);
    g.lineTo(-6, eaveBot(-6) + H * 0.042);
    g.closePath();
    var sh = g.createLinearGradient(0, eaveBot(0), 0, eaveBot(0) + H * 0.042);
    sh.addColorStop(0, 'rgba(70, 74, 66, 0.30)');
    sh.addColorStop(1, 'rgba(70, 74, 66, 0)');
    g.fillStyle = sh;
    g.fill();
    g.restore();
  }

  /* ------------------------------------------------------------------ *
   * 白粉墙
   * ------------------------------------------------------------------ */

  function wallPath(g) {
    g.beginPath();
    g.moveTo(-6, WALL_BOTTOM);
    g.lineTo(-6, eaveBot(-6));
    for (var x = -6; x <= W + 6; x += 5) { g.lineTo(x, eaveBot(x)); }
    g.lineTo(W + 6, WALL_BOTTOM);
    g.closePath();
  }

  function paintWall(g) {
    g.save();
    wallPath(g);
    var grd = g.createLinearGradient(0, H * 0.10, 0, WALL_BOTTOM);
    grd.addColorStop(0, rgb(mix(WALL, [255, 255, 255], 0.55)));
    grd.addColorStop(0.50, rgb(WALL));
    grd.addColorStop(1, rgb(mix(WALL, [219, 211, 194], 0.55)));
    g.fillStyle = grd;
    g.fill();
    g.clip();

    // 墙面明暗：左上透光，右下微沉
    var lg = g.createLinearGradient(0, 0, W, H);
    lg.addColorStop(0, 'rgba(255, 255, 252, 0.30)');
    lg.addColorStop(0.52, 'rgba(255, 255, 252, 0.02)');
    lg.addColorStop(1, 'rgba(146, 140, 122, 0.10)');
    g.fillStyle = lg;
    g.fillRect(0, 0, W, H);

    // 粉墙的水痕：极淡的竖条，只做一点旧感
    for (var i = 0; i < 30; i++) {
      var x = Math.random() * W;
      var y0 = eaveBot(x) + rand(H * 0.02, H * 0.16);
      var len = rand(H * 0.05, H * 0.22);
      g.strokeStyle = 'rgba(152, 150, 132, ' + rand(0.008, 0.026).toFixed(3) + ')';
      g.lineWidth = rand(2.0, 7.0);
      g.beginPath();
      g.moveTo(x, y0);
      g.lineTo(x + rand(-4, 4), Math.min(WALL_BOTTOM, y0 + len));
      g.stroke();
    }

    // 细小的石灰斑
    for (var k = 0; k < Math.round(W * H / 10000); k++) {
      g.fillStyle = 'rgba(146, 140, 122, ' + rand(0.012, 0.04).toFixed(3) + ')';
      g.fillRect(Math.random() * W,
        eaveBot(0) + Math.random() * (WALL_BOTTOM - eaveBot(0)), 1.5, 1.5);
    }

    // 墙面的纸纤维感：极淡的短划，凑近才看得见
    for (var f2 = 0; f2 < Math.round(W * H / 7000); f2++) {
      var fx = Math.random() * W;
      var fy = eaveBot(x) + Math.random() * (WALL_BOTTOM - eaveBot(0));
      var fl = rand(5, 24);
      var fa = rand(-0.3, 0.3);
      g.strokeStyle = 'rgba(150, 142, 124, ' + rand(0.010, 0.026).toFixed(3) + ')';
      g.lineWidth = rand(0.5, 1.1);
      g.beginPath();
      g.moveTo(fx, fy);
      g.lineTo(fx + Math.cos(fa) * fl, fy + Math.sin(fa) * fl);
      g.stroke();
    }

    // 几笔极淡的水墨，把白墙的"粉"化开一点
    for (var w3 = 0; w3 < 3; w3++) {
      var wx3 = rand(0.05, 0.95) * W;
      var wy3 = eaveBot(0) + rand(0.05, 0.6) * (WALL_BOTTOM - eaveBot(0));
      var wr3 = rand(0.05, 0.13) * W;
      var wah = g.createRadialGradient(wx3, wy3, 0, wx3, wy3, wr3);
      wah.addColorStop(0, 'rgba(150, 144, 124, 0.022)');
      wah.addColorStop(1, 'rgba(150, 144, 124, 0)');
      g.fillStyle = wah;
      g.beginPath();
      g.ellipse(wx3, wy3, wr3, wr3 * rand(0.5, 0.8), rand(-0.3, 0.3), 0, TAU);
      g.fill();
    }

    // 门外灯火的暖光，落在墙上一点点
    var spill = g.createRadialGradient(CX, CY + R * 0.10, R * 0.30, CX, CY + R * 0.10, R * 1.75);
    spill.addColorStop(0, rgba(WARM, 0.055));
    spill.addColorStop(0.55, rgba(WARM, 0.022));
    spill.addColorStop(1, rgba(WARM, 0));
    g.fillStyle = spill;
    g.fillRect(0, 0, W, H);

    g.restore();

    // 墙裙（勒脚）：墙根一条略沉的石色，白墙才有"落地"的重量
    var dadoTop = WALL_BOTTOM - H * 0.058;
    g.beginPath();
    g.moveTo(-6, dadoTop);
    for (var xd = -6; xd <= W + 6; xd += 8) {
      g.lineTo(xd, dadoTop + Math.sin(xd * 0.0031 + 1.7) * 1.6);
    }
    g.lineTo(W + 6, WALL_BOTTOM);
    g.lineTo(-6, WALL_BOTTOM);
    g.closePath();
    var dg = g.createLinearGradient(0, dadoTop, 0, WALL_BOTTOM);
    dg.addColorStop(0, rgb(mix(WALL, STONE, 0.20)));
    dg.addColorStop(0.35, rgb(mix(WALL, STONE, 0.26)));
    dg.addColorStop(1, rgb(mix(WALL, STONE, 0.42)));
    g.fillStyle = dg;
    g.fill();

    // 墙裙顶面的亮线与下沿的暗影
    g.strokeStyle = 'rgba(255, 255, 252, 0.45)';
    g.lineWidth = Math.max(1.2, H * 0.0022);
    g.beginPath();
    g.moveTo(-6, dadoTop);
    for (var xe = -6; xe <= W + 6; xe += 8) {
      g.lineTo(xe, dadoTop + Math.sin(xe * 0.0031 + 1.7) * 1.6);
    }
    g.stroke();
    g.strokeStyle = 'rgba(96, 104, 100, 0.16)';
    g.lineWidth = Math.max(1.6, H * 0.0032);
    g.beginPath();
    g.moveTo(-6, dadoTop + H * 0.005);
    for (var xf = -6; xf <= W + 6; xf += 8) {
      g.lineTo(xf, dadoTop + H * 0.005 + Math.sin(xf * 0.0031 + 1.7) * 1.6);
    }
    g.stroke();

    // 墙裙的竖缝
    g.strokeStyle = 'rgba(104, 112, 108, 0.16)';
    g.lineWidth = 1.1;
    for (var xg = -20; xg <= W + 20; xg += Math.max(130, W * 0.135)) {
      g.beginPath();
      g.moveTo(xg, dadoTop + 2);
      g.lineTo(xg, WALL_BOTTOM);
      g.stroke();
    }

    // 墙脚石条（阶沿）
    var plinth = H * 0.028;
    g.beginPath();
    g.moveTo(-6, WALL_BOTTOM - plinth);
    for (var x2 = -6; x2 <= W + 6; x2 += 8) {
      g.lineTo(x2, WALL_BOTTOM - plinth + Math.sin(x2 * 0.0037) * 1.4);
    }
    g.lineTo(W + 6, WALL_BOTTOM);
    g.lineTo(-6, WALL_BOTTOM);
    g.closePath();
    var pg = g.createLinearGradient(0, WALL_BOTTOM - plinth, 0, WALL_BOTTOM);
    pg.addColorStop(0, rgb(mix(STONE, [255, 255, 255], 0.34)));
    pg.addColorStop(0.55, rgb(mix(STONE, [255, 255, 255], 0.06)));
    pg.addColorStop(1, rgb(darker(STONE, 0.80)));
    g.fillStyle = pg;
    g.fill();

    // 石条分缝
    g.strokeStyle = 'rgba(84, 94, 96, 0.28)';
    g.lineWidth = 1.1;
    for (var x3 = -20; x3 <= W + 20; x3 += Math.max(96, W * 0.105)) {
      g.beginPath();
      g.moveTo(x3, WALL_BOTTOM - plinth + 1);
      g.lineTo(x3, WALL_BOTTOM);
      g.stroke();
    }
    g.strokeStyle = 'rgba(255, 255, 252, 0.42)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(-6, WALL_BOTTOM - plinth + 1);
    for (var x4 = -6; x4 <= W + 6; x4 += 8) {
      g.lineTo(x4, WALL_BOTTOM - plinth + 1 + Math.sin(x4 * 0.0037) * 1.4);
    }
    g.stroke();

    var contact = g.createLinearGradient(0, WALL_BOTTOM - 2, 0, WALL_BOTTOM + H * 0.012);
    contact.addColorStop(0, 'rgba(54, 58, 52, 0.30)');
    contact.addColorStop(1, 'rgba(54, 58, 52, 0)');
    g.fillStyle = contact;
    g.fillRect(0, WALL_BOTTOM - 2, W, H * 0.016);
  }

  /* ------------------------------------------------------------------ *
   * 月洞门内：庭院
   * ------------------------------------------------------------------ */

  function stalkPoint(s, tt) {
    var x0 = s.x, y0 = s.y0;
    var x1 = s.x + s.lean * R * 0.30, y1 = s.y0 - s.h * 0.55;
    var x2 = s.x + s.lean * R * 0.55, y2 = s.y0 - s.h;
    var u = 1 - tt;
    return {
      x: u * u * x0 + 2 * u * tt * x1 + tt * tt * x2,
      y: u * u * y0 + 2 * u * tt * y1 + tt * tt * y2
    };
  }

  function paintBambooStalks(g) {
    for (var i = 0; i < stalks.length; i++) {
      var s = stalks[i];
      var w = s.w;
      g.strokeStyle = rgba(mix(INK, [255, 255, 255], 0.10), 0.94);
      g.lineWidth = w;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(s.x, s.y0);
      g.quadraticCurveTo(s.x + s.lean * R * 0.30, s.y0 - s.h * 0.55,
        s.x + s.lean * R * 0.55, s.y0 - s.h);
      g.stroke();

      g.strokeStyle = 'rgba(255, 255, 250, 0.16)';
      g.lineWidth = w * 0.30;
      g.beginPath();
      g.moveTo(s.x - w * 0.24, s.y0);
      g.quadraticCurveTo(s.x - w * 0.24 + s.lean * R * 0.30, s.y0 - s.h * 0.55,
        s.x - w * 0.24 + s.lean * R * 0.55, s.y0 - s.h);
      g.stroke();

      for (var k = 1; k <= s.nodes; k++) {
        var p = stalkPoint(s, k / (s.nodes + 1));
        g.strokeStyle = rgba(darker(INK, 0.82), 0.72);
        g.lineWidth = Math.max(1, w * 0.50);
        g.beginPath();
        g.moveTo(p.x - w * 0.82, p.y + 0.8);
        g.lineTo(p.x + w * 0.82, p.y - 0.8);
        g.stroke();
        g.strokeStyle = 'rgba(255, 255, 250, 0.20)';
        g.lineWidth = Math.max(0.7, w * 0.20);
        g.beginPath();
        g.moveTo(p.x - w * 0.78, p.y - 1.8);
        g.lineTo(p.x + w * 0.78, p.y - 3.0);
        g.stroke();
      }
    }
  }

  function paintTaihu(g) {
    var sx = CX + R * 0.42;
    var gy = INT_GROUND + R * 0.05;
    var hh = R * 1.02;
    var ww = R * 0.52;

    var pts = [
      [-0.42, 0.00], [-0.56, -0.10], [-0.44, -0.20], [-0.52, -0.33],
      [-0.32, -0.40], [-0.40, -0.52], [-0.24, -0.58], [-0.30, -0.70],
      [-0.12, -0.74], [-0.18, -0.86], [0.00, -0.90], [0.06, -1.00],
      [0.20, -0.92], [0.16, -0.80], [0.32, -0.76], [0.26, -0.62],
      [0.42, -0.56], [0.32, -0.44], [0.46, -0.36], [0.34, -0.24],
      [0.44, -0.12], [0.38, 0.00]
    ];

    g.beginPath();
    for (var i = 0; i < pts.length; i++) {
      var px = sx + pts[i][0] * ww;
      var py = gy + pts[i][1] * hh;
      if (i === 0) { g.moveTo(px, py); } else { g.lineTo(px, py); }
    }
    g.closePath();

    // 石身：左亮右沉，像个立起来的石头
    var grd = g.createLinearGradient(sx - ww * 0.55, gy - hh, sx + ww * 0.45, gy);
    grd.addColorStop(0, rgb(mix(STONE, [255, 255, 255], 0.18)));
    grd.addColorStop(0.35, rgb(mix(STONE, [80, 92, 94], 0.18)));
    grd.addColorStop(0.75, rgb(darker(STONE, 0.70)));
    grd.addColorStop(1, rgb(darker(STONE, 0.52)));
    g.fillStyle = grd;
    g.fill();
    g.strokeStyle = rgba(darker(STONE, 0.46), 0.62);
    g.lineWidth = Math.max(1.0, R * 0.009);
    g.stroke();

    // 漏、透：几处孔洞，透出院墙的浅色
    var holes = [
      [-0.02, -0.56, 0.17, 0.115], [0.15, -0.31, 0.105, 0.075],
      [-0.25, -0.32, 0.075, 0.055], [0.03, -0.19, 0.055, 0.042],
      [-0.12, -0.86, 0.055, 0.050]
    ];
    for (var k = 0; k < holes.length; k++) {
      var h = holes[k];
      var hx = sx + h[0] * ww;
      var hy = gy + h[1] * hh;
      var hrx = h[2] * ww;
      var hry = h[3] * hh;
      var hg = g.createLinearGradient(hx - hrx, hy - hry, hx + hrx * 0.4, hy + hry);
      hg.addColorStop(0, rgb(mix(WALL, [196, 194, 178], 0.62)));
      hg.addColorStop(1, rgb(mix(WALL, [214, 210, 194], 0.52)));
      g.fillStyle = hg;
      g.beginPath();
      g.ellipse(hx, hy, hrx, hry, rand(-0.2, 0.2), 0, TAU);
      g.fill();
      // 孔洞的暗边：右上方被石头自己挡住一点
      g.strokeStyle = 'rgba(58, 64, 56, 0.22)';
      g.lineWidth = Math.max(1.0, R * 0.008);
      g.beginPath();
      g.ellipse(hx, hy, hrx, hry, 0, Math.PI * 1.1, Math.PI * 1.95);
      g.stroke();
    }

    // 皱：几笔竖的深墨，把石头的褶子写出来
    for (var m = 0; m < 22; m++) {
      var bx = sx + rand(-0.42, 0.40) * ww;
      var by = gy + rand(-0.94, -0.05) * hh;
      g.strokeStyle = rgba(darker(STONE, 0.46), rand(0.10, 0.30).toFixed(3));
      g.lineWidth = rand(0.8, 2.2);
      g.beginPath();
      g.moveTo(bx, by);
      g.quadraticCurveTo(bx + rand(-3, 3), by + rand(8, 26), bx + rand(-5, 5), by + rand(26, 48));
      g.stroke();
    }
    // 受光的一侧提亮两笔
    for (var q = 0; q < 5; q++) {
      g.strokeStyle = 'rgba(255, 255, 252, ' + rand(0.08, 0.20).toFixed(3) + ')';
      g.lineWidth = rand(1.6, 3.4);
      g.beginPath();
      var qx = sx + rand(-0.44, -0.10) * ww;
      var qy = gy + rand(-0.9, -0.2) * hh;
      g.moveTo(qx, qy);
      g.lineTo(qx + rand(-2, 2), qy + rand(10, 26));
      g.stroke();
    }

    // 石根：贴着地的暗影 + 一撮小草
    g.fillStyle = 'rgba(56, 62, 54, 0.20)';
    g.beginPath();
    g.ellipse(sx, gy + R * 0.010, ww * 0.52, R * 0.024, 0, 0, TAU);
    g.fill();
    for (var c2 = 0; c2 < 7; c2++) {
      var gx2 = sx + rand(-0.4, 0.3) * ww;
      g.strokeStyle = 'rgba(58, 72, 58, ' + rand(0.25, 0.45).toFixed(3) + ')';
      g.lineWidth = Math.max(0.8, R * 0.006);
      g.beginPath();
      g.moveTo(gx2, gy + 1);
      g.quadraticCurveTo(gx2 + rand(-4, 4), gy - R * 0.035, gx2 + rand(-8, 8), gy - R * 0.060);
      g.stroke();
    }
  }
  function paintGateInterior(g) {
    g.save();
    g.beginPath();
    g.arc(CX, CY, R, 0, TAU);
    g.clip();

    // 门内的天：比门外略暗一档，像隔着一堵墙看进去
    var sky = g.createLinearGradient(0, CY - R, 0, INT_GROUND);
    sky.addColorStop(0, rgb(mix(WALL, [196, 197, 183], 0.50)));
    sky.addColorStop(0.55, rgb(mix(WALL, [218, 216, 202], 0.34)));
    sky.addColorStop(1, rgb(mix(WALL, [228, 224, 208], 0.28)));
    g.fillStyle = sky;
    g.fillRect(CX - R, CY - R, R * 2, R * 2);

    // 里头一道院墙：淡到几乎化进雾里，只留一个墙头 + 一点竹影
    var bwTop = INT_GROUND - R * 0.54;
    var bwH = R * 0.54;
    var bw = g.createLinearGradient(0, bwTop, 0, INT_GROUND);
    bw.addColorStop(0, rgb(mix(WALL, [232, 228, 212], 0.30)));
    bw.addColorStop(0.55, rgb(mix(WALL, [240, 236, 222], 0.22)));
    bw.addColorStop(1, rgb(mix(WALL, [220, 216, 200], 0.34)));
    g.fillStyle = bw;
    g.fillRect(CX - R, bwTop, R * 2, bwH);

    // 墙头的瓦：柔和的一条，不要做成横杠
    var capH = R * 0.026;
    var capG = g.createLinearGradient(0, bwTop - capH, 0, bwTop + R * 0.012);
    capG.addColorStop(0, rgba(STONE, 0.04));
    capG.addColorStop(0.60, rgba(STONE, 0.24));
    capG.addColorStop(1, rgba(darker(STONE, 0.85), 0.30));
    g.fillStyle = capG;
    g.beginPath();
    g.moveTo(CX - R, bwTop + R * 0.012);
    for (var bx2 = CX - R; bx2 <= CX + R; bx2 += R * 0.05) {
      g.lineTo(bx2, bwTop + Math.sin(bx2 * 0.02) * R * 0.008);
    }
    g.lineTo(CX + R, bwTop - capH);
    g.lineTo(CX - R, bwTop - capH);
    g.closePath();
    g.fill();

    // 院墙上的竹影
    for (var b3 = 0; b3 < 5; b3++) {
      var bxx = CX - R * 0.5 + b3 * R * 0.24;
      g.strokeStyle = 'rgba(70, 88, 72, ' + rand(0.05, 0.11).toFixed(3) + ')';
      g.lineWidth = rand(2.4, 4.6);
      g.beginPath();
      g.moveTo(bxx, INT_GROUND);
      g.quadraticCurveTo(bxx + R * 0.04, bwTop + R * 0.22, bxx + R * 0.10, bwTop + R * 0.02);
      g.stroke();
    }

    // 青砖地
    var gg = g.createLinearGradient(0, INT_GROUND, 0, CY + R);
    gg.addColorStop(0, rgb(mix(STONE, [246, 242, 230], 0.55)));
    gg.addColorStop(0.45, rgb(mix(STONE, [226, 222, 206], 0.42)));
    gg.addColorStop(1, rgb(mix(STONE, [200, 198, 184], 0.46)));
    g.fillStyle = gg;
    g.fillRect(CX - R, INT_GROUND, R * 2, R * 2);

    // 砖缝：近疏远密
    g.strokeStyle = 'rgba(94, 106, 106, 0.24)';
    g.lineWidth = Math.max(0.8, R * 0.006);
    var yy = INT_GROUND;
    var gap = R * 0.045;
    var row = 0;
    while (yy < CY + R) {
      g.beginPath();
      g.moveTo(CX - R, yy);
      g.lineTo(CX + R, yy);
      g.stroke();
      var jg = gap * 2.1;
      for (var jx = CX - R + (row % 2 ? jg * 0.5 : 0); jx < CX + R; jx += jg) {
        g.beginPath();
        g.moveTo(jx, yy);
        g.lineTo(jx, Math.min(CY + R, yy + gap));
        g.stroke();
      }
      yy += gap;
      gap *= 1.20;
      row++;
    }

    paintBambooStalks(g);
    paintTaihu(g);

    // 门里地上零落的花瓣
    for (var p = 0; p < 8; p++) {
      var px = CX + rand(-0.80, 0.74) * R;
      var py = INT_GROUND + rand(0.05, 0.55) * R;
      g.fillStyle = rgba(PETAL, rand(0.30, 0.60).toFixed(3));
      g.beginPath();
      g.ellipse(px, py, R * rand(0.011, 0.019), R * 0.007, rand(-0.6, 0.6), 0, TAU);
      g.fill();
    }

    // 灯笼照下来的暖光
    var warm = g.createRadialGradient(
      LANTERN_X, CY - R * 0.55, 0,
      LANTERN_X, CY - R * 0.55, R * 1.15
    );
    warm.addColorStop(0, rgba(WARM, 0.26));
    warm.addColorStop(0.42, rgba(WARM, 0.12));
    warm.addColorStop(1, rgba(WARM, 0));
    g.fillStyle = warm;
    g.fillRect(CX - R, CY - R, R * 2, R * 2);

    // 洞内壁的暗边，做出"从洞里往外看"的纵深
    var inner = g.createRadialGradient(CX, CY, R * 0.66, CX, CY, R);
    inner.addColorStop(0, 'rgba(42, 46, 40, 0)');
    inner.addColorStop(0.68, 'rgba(42, 46, 40, 0.10)');
    inner.addColorStop(1, 'rgba(42, 46, 40, 0.34)');
    g.fillStyle = inner;
    g.fillRect(CX - R, CY - R, R * 2, R * 2);

    g.restore();
  }

  function paintGateRing(g) {
    var ringW = Math.max(7, H * 0.017);
    g.beginPath();
    g.arc(CX, CY, R + ringW, 0, TAU);
    g.arc(CX, CY, R, 0, TAU, true);
    var grd = g.createLinearGradient(CX - R, CY - R, CX + R, CY + R);
    grd.addColorStop(0, rgb(mix(STONE, [255, 255, 255], 0.42)));
    grd.addColorStop(0.50, rgb(mix(STONE, [255, 255, 255], 0.08)));
    grd.addColorStop(1, rgb(darker(STONE, 0.68)));
    g.fillStyle = grd;
    g.fill();

    g.strokeStyle = 'rgba(255, 255, 252, 0.40)';
    g.lineWidth = Math.max(1.2, H * 0.0022);
    g.beginPath();
    g.arc(CX, CY, R + ringW - 1.2, 0, TAU);
    g.stroke();
    g.strokeStyle = 'rgba(58, 68, 70, 0.50)';
    g.lineWidth = Math.max(1.2, H * 0.0026);
    g.beginPath();
    g.arc(CX, CY, R + 1.2, 0, TAU);
    g.stroke();

    var sh = g.createRadialGradient(CX, CY, R + ringW, CX, CY, R + ringW + H * 0.018);
    sh.addColorStop(0, 'rgba(62, 64, 56, 0.055)');
    sh.addColorStop(1, 'rgba(62, 64, 56, 0)');
    g.fillStyle = sh;
    g.beginPath();
    g.arc(CX, CY, R + ringW + H * 0.020, 0, TAU);
    g.fill();
  }

  /* ------------------------------------------------------------------ *
   * 漏窗：圆窗 + 冰裂纹格心
   * ------------------------------------------------------------------ */

  function paintLatticeWindow(g, wx, wy, rr) {
    var ring = Math.max(4, H * 0.0095);

    // 窗洞：里侧是庭院深处，颜色压暗一档
    g.save();
    g.beginPath();
    g.arc(wx, wy, rr, 0, TAU);
    g.clip();
    var inner = g.createLinearGradient(0, wy - rr, 0, wy + rr);
    inner.addColorStop(0, rgb(mix(WALL, [176, 178, 162], 0.62)));
    inner.addColorStop(1, rgb(mix(WALL, [202, 200, 184], 0.52)));
    g.fillStyle = inner;
    g.fillRect(wx - rr, wy - rr, rr * 2, rr * 2);

    // 冰裂纹：随机点在近邻之间连线，剪在圆里
    // 窗里透出一点竹影
    for (var b2 = 0; b2 < 3; b2++) {
      g.strokeStyle = 'rgba(58, 70, 58, ' + rand(0.10, 0.18).toFixed(3) + ')';
      g.lineWidth = rand(2.0, 3.4);
      g.beginPath();
      g.moveTo(wx - rr * 0.5 + b2 * rr * 0.34, wy + rr * 0.9);
      g.quadraticCurveTo(wx - rr * 0.4 + b2 * rr * 0.34, wy,
        wx - rr * 0.3 + b2 * rr * 0.34, wy - rr * 0.8);
      g.stroke();
    }

    // 冰裂纹：一个歪歪扭扭的方格网，邻点连线，像碎冰拼起来
    var cols = 4, rows = 4;
    var cell = (rr * 2) / cols;
    var grid = [];
    for (var r3 = 0; r3 <= rows; r3++) {
      grid[r3] = [];
      for (var c3 = 0; c3 <= cols; c3++) {
        grid[r3][c3] = {
          x: wx - rr + c3 * cell + (c3 > 0 && c3 < cols ? rand(-cell * 0.26, cell * 0.26) : 0),
          y: wy - rr + r3 * cell + (r3 > 0 && r3 < rows ? rand(-cell * 0.26, cell * 0.26) : 0)
        };
      }
    }
    g.strokeStyle = 'rgba(104, 116, 112, 0.60)';
    g.lineWidth = Math.max(1.2, H * 0.0024);
    for (var r4 = 0; r4 <= rows; r4++) {
      for (var c4 = 0; c4 <= cols; c4++) {
        var pt = grid[r4][c4];
        if (c4 < cols) {
          g.beginPath();
          g.moveTo(pt.x, pt.y);
          g.lineTo(grid[r4][c4 + 1].x, grid[r4][c4 + 1].y);
          g.stroke();
        }
        if (r4 < rows) {
          g.beginPath();
          g.moveTo(pt.x, pt.y);
          g.lineTo(grid[r4 + 1][c4].x, grid[r4 + 1][c4].y);
          g.stroke();
        }
      }
    }
    // 窗心的暗边
    var vig = g.createRadialGradient(wx, wy, rr * 0.5, wx, wy, rr);
    vig.addColorStop(0, 'rgba(50, 54, 46, 0)');
    vig.addColorStop(1, 'rgba(50, 54, 46, 0.30)');
    g.fillStyle = vig;
    g.fillRect(wx - rr, wy - rr, rr * 2, rr * 2);
    g.restore();

    // 石窗框
    g.beginPath();
    g.arc(wx, wy, rr + ring, 0, TAU);
    g.arc(wx, wy, rr, 0, TAU, true);
    var grd = g.createLinearGradient(wx - rr, wy - rr, wx + rr, wy + rr);
    grd.addColorStop(0, rgb(mix(STONE, [255, 255, 255], 0.45)));
    grd.addColorStop(0.5, rgb(mix(STONE, [255, 255, 255], 0.10)));
    grd.addColorStop(1, rgb(darker(STONE, 0.70)));
    g.fillStyle = grd;
    g.fill();
    g.strokeStyle = 'rgba(255, 255, 252, 0.40)';
    g.lineWidth = Math.max(1, H * 0.0018);
    g.beginPath();
    g.arc(wx, wy, rr + ring - 1, 0, TAU);
    g.stroke();
    g.strokeStyle = 'rgba(60, 70, 72, 0.45)';
    g.lineWidth = Math.max(1, H * 0.0020);
    g.beginPath();
    g.arc(wx, wy, rr + 1, 0, TAU);
    g.stroke();
  }

  /* ------------------------------------------------------------------ *
   * 墙外地面
   * ------------------------------------------------------------------ */

  function paintGround(g) {
    var gy = WALL_BOTTOM;
    var grd = g.createLinearGradient(0, gy, 0, H);
    grd.addColorStop(0, rgb(mix(STONE, [238, 234, 222], 0.60)));
    grd.addColorStop(0.42, rgb(mix(STONE, [214, 210, 198], 0.40)));
    grd.addColorStop(1, rgb(mix(STONE, [178, 175, 162], 0.46)));
    g.fillStyle = grd;
    g.fillRect(0, gy, W, H - gy);

    // 阶沿下一级：一条亮边的石台
    g.fillStyle = 'rgba(255, 255, 252, 0.22)';
    g.fillRect(0, gy + H * 0.004, W, H * 0.004);

    // 砖缝：横向 + 错缝
    g.strokeStyle = 'rgba(94, 106, 106, 0.20)';
    g.lineWidth = Math.max(0.8, H * 0.0018);
    var yy = gy + H * 0.016;
    var gap = H * 0.011;
    var row = 0;
    while (yy < H) {
      g.beginPath();
      g.moveTo(0, yy);
      g.lineTo(W, yy);
      g.stroke();
      for (var jx = (row % 2 ? W * 0.034 : 0); jx < W; jx += W * 0.068) {
        g.beginPath();
        g.moveTo(jx, yy);
        g.lineTo(jx, Math.min(H, yy + gap));
        g.stroke();
      }
      yy += gap;
      gap *= 1.22;
      row++;
    }

    // 墙根投影
    var sh = g.createLinearGradient(0, gy, 0, gy + H * 0.030);
    sh.addColorStop(0, 'rgba(48, 52, 46, 0.32)');
    sh.addColorStop(1, 'rgba(48, 52, 46, 0)');
    g.fillStyle = sh;
    g.fillRect(0, gy, W, H * 0.032);

    // 近处一道石阶，把前景垫出一个层次
    var stepY = H * 0.952;
    var stepG = g.createLinearGradient(0, stepY, 0, H);
    stepG.addColorStop(0, 'rgba(255, 255, 250, 0.20)');
    stepG.addColorStop(0.16, 'rgba(255, 255, 250, 0.10)');
    stepG.addColorStop(0.30, 'rgba(78, 82, 72, 0.12)');
    stepG.addColorStop(1, 'rgba(78, 82, 72, 0.22)');
    g.fillStyle = stepG;
    g.fillRect(0, stepY, W, H - stepY);
    g.strokeStyle = 'rgba(255, 255, 250, 0.50)';
    g.lineWidth = Math.max(1.2, H * 0.0022);
    g.beginPath();
    g.moveTo(0, stepY);
    g.lineTo(W, stepY);
    g.stroke();
    // 阶沿的竖缝
    g.strokeStyle = 'rgba(96, 104, 100, 0.18)';
    g.lineWidth = 1.1;
    for (var sx2 = W * 0.03; sx2 < W; sx2 += Math.max(150, W * 0.16)) {
      g.beginPath();
      g.moveTo(sx2, stepY);
      g.lineTo(sx2 + 6, H);
      g.stroke();
    }

    // 苔痕：沿着砖缝和墙根长一簇簇，别铺满
    for (var m = 0; m < 11; m++) {
      var mx = Math.random() * W;
      var my = gy + rand(0.014, 0.13) * H;
      for (var mm = 0; mm < 3; mm++) {
        g.fillStyle = 'rgba(' + mix(STONE, [88, 108, 76], 0.55).join(', ') +
          ', ' + rand(0.03, 0.075).toFixed(3) + ')';
        g.beginPath();
        g.ellipse(mx + rand(-8, 8), my + rand(-3, 3),
          rand(6, 15), rand(2.4, 5), rand(-0.3, 0.3), 0, TAU);
        g.fill();
      }
    }

    // 几块大石板：打破满地小砖的碎
    for (var sl = 0; sl < 4; sl++) {
      var slx = rand(0.04, 0.90) * W;
      var sly = H * 0.888 + rand(-0.006, 0.010) * H;
      var slw = rand(0.10, 0.18) * W;
      var slh = H * rand(0.030, 0.048);
      g.save();
      g.beginPath();
      g.moveTo(slx, sly);
      g.lineTo(slx + slw, sly + rand(-2, 2));
      g.lineTo(slx + slw - rand(1, 4), sly + slh);
      g.lineTo(slx + rand(1, 4), sly + slh);
      g.closePath();
      g.fillStyle = 'rgba(' + mix(STONE, [255, 255, 250], 0.45).join(', ') + ', 0.28)';
      g.fill();
      g.strokeStyle = 'rgba(255, 255, 252, 0.30)';
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(slx, sly);
      g.lineTo(slx + slw, sly + rand(-2, 2));
      g.stroke();
      g.strokeStyle = 'rgba(104, 112, 108, 0.20)';
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(slx + rand(1, 4), sly + slh);
      g.lineTo(slx + slw - rand(1, 4), sly + slh);
      g.stroke();
      g.restore();
    }

    // 水洼：几摊浅浅的积水，映一点天光，别做成白斑
    for (var w2 = 0; w2 < 3; w2++) {
      var wx = rand(0.08, 0.92) * W;
      var wy = gy + rand(0.045, 0.095) * H;
      var wr = rand(0.022, 0.052) * W;
      var wg = g.createLinearGradient(0, wy - wr * 0.22, 0, wy + wr * 0.22);
      wg.addColorStop(0, 'rgba(214, 222, 214, 0.30)');
      wg.addColorStop(0.5, 'rgba(198, 206, 198, 0.24)');
      wg.addColorStop(1, 'rgba(184, 192, 184, 0.18)');
      g.fillStyle = wg;
      g.beginPath();
      g.ellipse(wx, wy, wr, wr * 0.19, 0, 0, TAU);
      g.fill();
      g.strokeStyle = 'rgba(255, 255, 252, 0.26)';
      g.lineWidth = 1;
      g.beginPath();
      g.ellipse(wx - wr * 0.10, wy - wr * 0.035, wr * 0.66, wr * 0.10, 0, Math.PI, TAU);
      g.stroke();
      // 水面上一点点天光
      g.fillStyle = 'rgba(255, 255, 252, 0.14)';
      g.beginPath();
      g.ellipse(wx + wr * 0.22, wy + wr * 0.02, wr * 0.24, wr * 0.045, 0, 0, TAU);
      g.fill();
    }

    // 地上散落的瓣
    for (var i = 0; i < 30; i++) {
      var px = Math.random() * W;
      var py = gy + Math.random() * (H - gy);
      var sz = rand(H * 0.005, H * 0.0105);
      g.fillStyle = rgba(PETAL, rand(0.28, 0.60).toFixed(3));
      g.beginPath();
      g.ellipse(px, py, sz, sz * 0.52, rand(-1.2, 1.2), 0, TAU);
      g.fill();
    }
    // 落地的几片竹叶
    for (var k = 0; k < 8; k++) {
      var lx = rand(0.02, 0.55) * W;
      var ly = gy + rand(0.008, 0.05) * H;
      g.strokeStyle = 'rgba(55, 66, 58, ' + rand(0.16, 0.34).toFixed(3) + ')';
      g.lineWidth = rand(1.0, 1.7);
      g.beginPath();
      g.moveTo(lx, ly);
      g.quadraticCurveTo(lx + 8, ly - 2, lx + 16, ly + 1);
      g.stroke();
    }
  }

  /* ------------------------------------------------------------------ *
   * 墙头探出来的梅枝
   * ------------------------------------------------------------------ */

  function paintPlumBranch(g) {
    var ex = W * 1.03;
    var ey = H * 0.150;

    g.lineCap = 'round';
    g.strokeStyle = rgba(INK, 0.90);
    g.lineWidth = Math.max(2.6, H * 0.0088);
    g.beginPath();
    g.moveTo(ex, ey);
    g.quadraticCurveTo(W * 0.845, H * 0.152, W * 0.795, H * 0.238);
    g.quadraticCurveTo(W * 0.735, H * 0.286, W * 0.665, H * 0.300);
    g.stroke();

    var twigs = [
      [W * 0.905, H * 0.190, W * 0.842, H * 0.128, 0.0048],
      [W * 0.858, H * 0.212, W * 0.918, H * 0.276, 0.0042],
      [W * 0.775, H * 0.256, W * 0.748, H * 0.322, 0.0038],
      [W * 0.716, H * 0.284, W * 0.668, H * 0.248, 0.0034],
      [W * 0.692, H * 0.292, W * 0.648, H * 0.352, 0.0030],
      [W * 0.955, H * 0.166, W * 0.972, H * 0.236, 0.0034]
    ];
    for (var i = 0; i < twigs.length; i++) {
      var w = twigs[i];
      g.lineWidth = Math.max(1.2, H * w[4]);
      g.beginPath();
      g.moveTo(w[0], w[1]);
      g.quadraticCurveTo((w[0] + w[2]) / 2 + H * 0.010, (w[1] + w[3]) / 2, w[2], w[3]);
      g.stroke();
    }

    var blooms = [
      [0.858, 0.198, 0.0105], [0.882, 0.164, 0.0092], [0.840, 0.140, 0.0084],
      [0.890, 0.258, 0.0090], [0.912, 0.236, 0.0080], [0.790, 0.234, 0.0102],
      [0.758, 0.302, 0.0092], [0.738, 0.266, 0.0082], [0.700, 0.262, 0.0094],
      [0.674, 0.318, 0.0084], [0.652, 0.296, 0.0100], [0.930, 0.204, 0.0082],
      [0.936, 0.262, 0.0078], [0.966, 0.222, 0.0080]
    ];
    for (var b = 0; b < blooms.length; b++) {
      paintBlossom(g, W * blooms[b][0], H * blooms[b][1], H * blooms[b][2]);
    }

    for (var k = 0; k < 7; k++) {
      g.fillStyle = rgba(PETAL, rand(0.55, 0.80).toFixed(3));
      g.beginPath();
      g.arc(W * rand(0.66, 0.98), H * rand(0.13, 0.33), H * rand(0.0035, 0.0055), 0, TAU);
      g.fill();
    }
  }

  function paintBlossom(g, x, y, rad) {
    g.save();
    g.translate(x, y);
    g.rotate(rand(0, TAU));
    for (var i = 0; i < 5; i++) {
      var a = (i / 5) * TAU;
      g.fillStyle = rgba(PETAL, 0.82);
      g.beginPath();
      g.ellipse(Math.cos(a) * rad * 0.66, Math.sin(a) * rad * 0.66,
        rad * 0.60, rad * 0.42, a, 0, TAU);
      g.fill();
    }
    g.fillStyle = rgba(darker(PETAL, 0.52), 0.88);
    g.beginPath();
    g.arc(0, 0, rad * 0.28, 0, TAU);
    g.fill();
    for (var s = 0; s < 4; s++) {
      var sa = (s / 4) * TAU + 0.4;
      g.strokeStyle = rgba(darker(PETAL, 0.48), 0.55);
      g.lineWidth = Math.max(0.5, rad * 0.06);
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(Math.cos(sa) * rad * 0.9, Math.sin(sa) * rad * 0.9);
      g.stroke();
    }
    g.restore();
  }

  /* ------------------------------------------------------------------ *
   * 精灵：竹叶 / 光晕 / 雾
   * ------------------------------------------------------------------ */

  function leafFill(g, len, wid, alpha) {
    g.fillStyle = rgba(INK, alpha);
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(len * 0.20, -wid * 1.10, len * 0.64, -wid * 0.90, len, -wid * 0.05);
    g.bezierCurveTo(len * 0.70, wid * 0.46, len * 0.26, wid * 0.30, 0, 0);
    g.closePath();
    g.fill();
  }

  function makeLeafSprig(variant) {
    var scale = 2;
    var lw = R * 0.98;
    var lh = R * 0.80;
    var c = document.createElement('canvas');
    c.width = Math.max(2, Math.ceil(lw * scale));
    c.height = Math.max(2, Math.ceil(lh * scale));
    var g = c.getContext('2d');
    g.setTransform(scale, 0, 0, scale, 0, 0);
    var px = R * 0.05;
    var py = lh * 0.42;
    g.translate(px, py);

    // 一小段枝，叶簇长在枝上，不是从一个点炸开
    var twigLen = R * 0.30;
    var twigDrop = variant ? 0.26 : 0.20;
    g.strokeStyle = rgba(INK, 0.80);
    g.lineWidth = Math.max(1.2, R * 0.008);
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(twigLen * 0.5, twigLen * twigDrop * 0.45, twigLen, twigLen * twigDrop);
    g.stroke();

    // 叶：三四片一簇，细长、朝外斜下垂
    var n = variant ? 5 : 4;
    for (var i = 0; i < n; i++) {
      var tt = 0.25 + (i / (n - 1)) * 0.70;
      var bx = twigLen * tt;
      var by = twigLen * twigDrop * tt * tt;
      var droop = 0.42 + (i % 3) * 0.30 + rand(-0.10, 0.10);
      var len = R * rand(0.26, 0.46) * (1 - 0.15 * tt);
      g.save();
      g.translate(bx, by);
      g.rotate(droop);
      leafFill(g, len, Math.max(1.8, R * 0.0195), rand(0.58, 0.80));
      g.restore();
      if (i === 1) {
        g.save();
        g.translate(bx, by);
        g.rotate(-0.42 + rand(-0.08, 0.08));
        leafFill(g, len * 0.78, Math.max(1.6, R * 0.017), rand(0.48, 0.66));
        g.restore();
      }
    }

    return { c: c, w: lw, h: lh, px: px, py: py };
  }
  function makeGlow(size, color) {
    var c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    var g = c.getContext('2d');
    var grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grd.addColorStop(0, rgba(color, 0.60));
    grd.addColorStop(0.18, rgba(color, 0.34));
    grd.addColorStop(0.48, rgba(color, 0.11));
    grd.addColorStop(1, rgba(color, 0));
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
    return c;
  }

  function makeMist(w, h, alpha) {
    var c = document.createElement('canvas');
    c.width = Math.max(2, Math.ceil(w));
    c.height = Math.max(2, Math.ceil(h));
    var g = c.getContext('2d');
    for (var i = 0; i < 6; i++) {
      var px = rand(0.14, 0.86) * w;
      var py = rand(0.30, 0.70) * h;
      var rx = rand(0.18, 0.36) * w;
      var ry = rand(0.22, 0.42) * h;
      g.save();
      g.translate(px, py);
      g.scale(1, ry / rx);
      var grd = g.createRadialGradient(0, 0, 0, 0, 0, rx);
      grd.addColorStop(0, 'rgba(253, 251, 245, ' + (alpha * rand(0.5, 1)).toFixed(3) + ')');
      grd.addColorStop(0.55, 'rgba(253, 251, 245, ' + (alpha * 0.30).toFixed(3) + ')');
      grd.addColorStop(1, 'rgba(253, 251, 245, 0)');
      g.fillStyle = grd;
      g.beginPath();
      g.arc(0, 0, rx, 0, TAU);
      g.fill();
      g.restore();
    }
    return c;
  }

  /* ------------------------------------------------------------------ *
   * 构建
   * ------------------------------------------------------------------ */

  function buildStatic() {
    WALL_BOTTOM = H * 0.845;
    CX = W * 0.5;
    CY = H * 0.476;
    R = Math.min(H * 0.252, W * 0.142);
    INT_GROUND = CY + R * 0.42;
    LANTERN_X = CX - R * 0.06;

    stalks = [
      { x: CX - R * 0.66, y0: INT_GROUND + R * 0.04, h: R * 1.62, lean: 0.14, w: Math.max(2.4, R * 0.030), nodes: 6 },
      { x: CX - R * 0.45, y0: INT_GROUND + R * 0.02, h: R * 1.48, lean: -0.10, w: Math.max(2.0, R * 0.025), nodes: 5 },
      { x: CX - R * 0.20, y0: INT_GROUND + R * 0.06, h: R * 1.70, lean: 0.20, w: Math.max(1.9, R * 0.022), nodes: 7 },
      { x: CX - R * 0.86, y0: INT_GROUND + R * 0.06, h: R * 1.36, lean: 0.30, w: Math.max(1.6, R * 0.017), nodes: 4 }
    ];

    bg = document.createElement('canvas');
    bg.width = Math.max(1, Math.ceil(W * dpr));
    bg.height = Math.max(1, Math.ceil(H * dpr));
    var g = bg.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.lineCap = 'round';
    g.lineJoin = 'round';

    paintSky(g);
    paintEave(g);
    paintWall(g);
    paintLatticeWindow(g, W * 0.148, H * 0.428, H * 0.058);
    paintLatticeWindow(g, W * 0.852, H * 0.418, H * 0.054);
    paintGateInterior(g);
    paintGateRing(g);
    paintGround(g);
    paintPlumBranch(g);

    // 整体调子：一层极淡的暖色纸光 + 四角压暗，画面才像一张画
    var pw = g.createLinearGradient(0, 0, W, H);
    pw.addColorStop(0, 'rgba(255, 251, 238, 0.05)');
    pw.addColorStop(0.55, 'rgba(255, 251, 238, 0)');
    pw.addColorStop(1, 'rgba(172, 156, 126, 0.05)');
    g.fillStyle = pw;
    g.fillRect(0, 0, W, H);

    var vig = g.createRadialGradient(W * 0.5, H * 0.47, Math.min(W, H) * 0.30,
      W * 0.5, H * 0.50, Math.max(W, H) * 0.80);
    vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vig.addColorStop(1, 'rgba(92, 82, 60, 0.07)');
    g.fillStyle = vig;
    g.fillRect(0, 0, W, H);

    mistA = makeMist(R * 1.9, R * 0.55, 0.24);
    mistB = makeMist(R * 1.5, R * 0.42, 0.18);
    mistOutA = makeMist(W * 1.2, H * 0.10, 0.30);
    mistOutB = makeMist(W * 1.2, H * 0.075, 0.24);
    groundMist = makeMist(W * 1.05, H * 0.06, 0.26);
    glowSprite = makeGlow(96, WARM);
    leafSprigs = [makeLeafSprig(0), makeLeafSprig(1), makeLeafSprig(0), makeLeafSprig(1)];

    buildMotion();
  }

  function buildMotion() {
    sprigs.length = 0;
    // 竹叶成簇挂在几竿竹子的中上部
    var plans = [
      { s: 0, ts: [0.52, 0.68, 0.82, 0.95] },
      { s: 1, ts: [0.62, 0.78, 0.90] },
      { s: 2, ts: [0.72, 0.86, 0.96] },
      { s: 3, ts: [0.50, 0.70, 0.86] }
    ];
    for (var i = 0; i < plans.length; i++) {
      var plan = plans[i];
      var s = stalks[plan.s];
      for (var k = 0; k < plan.ts.length; k++) {
        var p = stalkPoint(s, plan.ts[k]);
        var side = (k % 2 === 0) ? 1 : -1;
        sprigs.push({
          x: p.x,
          y: p.y,
          side: side,
          sprite: (i + k) % leafSprigs.length,
          baseAng: side > 0 ? rand(-0.18, 0.14) : rand(Math.PI - 0.14, Math.PI + 0.18),
          amp: rand(0.045, 0.095),
          sp: rand(0.55, 0.95),
          ph: rand(0, TAU)
        });
      }
    }

    petals.length = 0;
    for (var j = 0; j < 16; j++) { petals.push(newPetal(true)); }

    drips.length = 0;
    var xs = [0.205, 0.325, 0.700, 0.840];
    for (var d = 0; d < xs.length; d++) {
      drips.push({
        x: xs[d] * W,
        y: eaveBot(xs[d] * W) + H * 0.004,
        vy: rand(0.18, 0.30) * H,
        delay: rand(0, 2.0),
        falling: d < 2
      });
    }
    splashes.length = 0;
  }

  function newPetal(anywhere) {
    // 花瓣只从墙头那枝梅上落下来
    return {
      x: rand(0.44, 1.02) * W,
      y: anywhere ? rand(0.12, 0.95) * H : rand(0.13, 0.33) * H,
      vy: rand(0.022, 0.048) * H,
      vx: rand(-0.012, 0.014) * W,
      rot: rand(0, TAU),
      rotV: rand(-1.6, 1.6),
      sz: rand(H * 0.0068, H * 0.0115),
      ph: rand(0, TAU),
      sp: rand(0.6, 1.3),
      alpha: rand(0.55, 0.90)
    };
  }

  /* ------------------------------------------------------------------ *
   * 动态绘制
   * ------------------------------------------------------------------ */

  function drawInterior() {
    ctx.save();
    ctx.beginPath();
    ctx.arc(CX, CY, R - 0.5, 0, TAU);
    ctx.clip();

    if (mistA) {
      var ax = CX - mistA.width * 0.5 + Math.sin(t * 0.13 + 0.4) * R * 0.24;
      var ay = INT_GROUND - R * 0.46 + Math.sin(t * 0.09) * R * 0.05;
      ctx.globalAlpha = 0.55;
      ctx.drawImage(mistA, ax, ay, mistA.width, mistA.height);
    }
    if (mistB) {
      var bx = CX - mistB.width * 0.5 + Math.sin(t * 0.17 + 2.1) * R * 0.30;
      var by = INT_GROUND - R * 0.20 + Math.sin(t * 0.11 + 1.2) * R * 0.04;
      ctx.globalAlpha = 0.42;
      ctx.drawImage(mistB, bx, by, mistB.width, mistB.height);
    }
    ctx.globalAlpha = 1;

    // 竹叶：绕挂点正弦轻摆
    for (var i = 0; i < sprigs.length; i++) {
      var sp = sprigs[i];
      var spr = leafSprigs[sp.sprite];
      var ang = sp.baseAng + Math.sin(t * sp.sp + sp.ph) * sp.amp;
      ctx.save();
      ctx.translate(sp.x, sp.y);
      ctx.rotate(ang);
      if (sp.side < 0) { ctx.scale(1, -1); }
      ctx.drawImage(spr.c, -spr.px, -spr.py, spr.w, spr.h);
      ctx.restore();
    }

    // 灯笼：吊在门洞中上方，轻轻晃，光晕呼吸
    var sway = Math.sin(t * 0.82 + 0.7) * 0.050;
    var anchorX = LANTERN_X;
    var anchorY = CY - R * 0.975;
    ctx.save();
    ctx.translate(anchorX, anchorY);
    ctx.rotate(sway);
    var lineLen = Math.max(6, R * 0.105);

    ctx.strokeStyle = rgba(STONE_D, 0.72);
    ctx.lineWidth = Math.max(1, R * 0.008);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, lineLen);
    ctx.stroke();

    var bodyY = lineLen + R * 0.098;
    var breathe = 0.5 + 0.5 * Math.sin(t * 1.15 + 0.3);
    var gs = R * 0.82;
    if (glowSprite) {
      ctx.globalAlpha = 0.24 + 0.14 * breathe;
      ctx.drawImage(glowSprite, -gs / 2, bodyY - gs / 2, gs, gs);
      ctx.globalAlpha = 1;
    }

    var brx = R * 0.078;
    var bry = R * 0.094;
    var lg = ctx.createRadialGradient(-brx * 0.3, bodyY - bry * 0.35, 0, 0, bodyY, brx * 1.3);
    lg.addColorStop(0, 'rgba(255, 242, 208, 0.99)');
    lg.addColorStop(0.42, rgba(WARM, 0.96));
    lg.addColorStop(1, rgba(darker(WARM, 0.76), 0.96));
    ctx.fillStyle = lg;
    ctx.beginPath();
    ctx.ellipse(0, bodyY, brx, bry, 0, 0, TAU);
    ctx.fill();

    ctx.fillStyle = rgba(darker(WARM, 0.40), 0.92);
    ctx.fillRect(-brx * 0.44, bodyY - bry - R * 0.020, brx * 0.88, R * 0.024);
    ctx.fillRect(-brx * 0.44, bodyY + bry - R * 0.004, brx * 0.88, R * 0.024);

    ctx.strokeStyle = rgba(darker(WARM, 0.48), 0.85);
    ctx.lineWidth = Math.max(0.9, R * 0.007);
    ctx.beginPath();
    ctx.moveTo(0, bodyY + bry + R * 0.018);
    ctx.lineTo(0, bodyY + bry + R * 0.085);
    ctx.stroke();
    for (var f = -1; f <= 1; f++) {
      ctx.beginPath();
      ctx.moveTo(0, bodyY + bry + R * 0.066);
      ctx.lineTo(f * R * 0.019, bodyY + bry + R * 0.108);
      ctx.stroke();
    }
    ctx.restore();

    ctx.restore();
  }

  function drawPetals() {
    for (var i = 0; i < petals.length; i++) {
      var p = petals[i];
      var a = p.alpha;
      if (p.y > WALL_BOTTOM + H * 0.015) {
        a *= Math.max(0, 1 - (p.y - WALL_BOTTOM - H * 0.015) / (H * 0.09));
      }
      if (a <= 0.02) { continue; }
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = rgba(PETAL, a.toFixed(3));
      ctx.beginPath();
      ctx.ellipse(0, 0, p.sz, p.sz * 0.52, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = rgba(mix(PETAL, [255, 255, 255], 0.48), (a * 0.65).toFixed(3));
      ctx.beginPath();
      ctx.ellipse(-p.sz * 0.20, -p.sz * 0.12, p.sz * 0.44, p.sz * 0.20, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawDrips() {
    for (var i = 0; i < drips.length; i++) {
      var d = drips[i];
      if (!d.falling) { continue; }
      ctx.fillStyle = 'rgba(158, 178, 178, 0.60)';
      ctx.beginPath();
      ctx.ellipse(d.x, d.y, Math.max(1.0, H * 0.0018), Math.max(2.6, H * 0.0056), 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(158, 178, 178, 0.26)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(d.x, d.y - H * 0.009);
      ctx.lineTo(d.x, d.y - H * 0.002);
      ctx.stroke();
    }
    for (var k = 0; k < splashes.length; k++) {
      var s = splashes[k];
      ctx.strokeStyle = 'rgba(158, 178, 178, ' + Math.max(0, s.a).toFixed(3) + ')';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, s.r, s.r * 0.28, 0, 0, TAU);
      ctx.stroke();
    }
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (bg) { ctx.drawImage(bg, 0, 0, W, H); }

    drawInterior();

    if (mistOutA) {
      var x1 = -(offOutA % mistOutA.width);
      ctx.globalAlpha = 0.50;
      ctx.drawImage(mistOutA, x1, WALL_BOTTOM - H * 0.085, mistOutA.width, mistOutA.height);
      ctx.drawImage(mistOutA, x1 + mistOutA.width, WALL_BOTTOM - H * 0.085, mistOutA.width, mistOutA.height);
    }
    if (mistOutB) {
      var x2 = -(offOutB % mistOutB.width);
      ctx.globalAlpha = 0.44;
      ctx.drawImage(mistOutB, x2, WALL_BOTTOM - H * 0.026, mistOutB.width, mistOutB.height);
      ctx.drawImage(mistOutB, x2 + mistOutB.width, WALL_BOTTOM - H * 0.026, mistOutB.width, mistOutB.height);
    }
    if (groundMist) {
      var x3 = -((offOutA * 0.6) % groundMist.width);
      ctx.globalAlpha = 0.38;
      ctx.drawImage(groundMist, x3, H - H * 0.070, groundMist.width, groundMist.height);
      ctx.drawImage(groundMist, x3 + groundMist.width, H - H * 0.070, groundMist.width, groundMist.height);
    }
    ctx.globalAlpha = 1;

    drawDrips();
    drawPetals();
  }

  function advance(dt) {
    t += dt;
    offOutA += 3.0 * dt;
    offOutB += 1.8 * dt;

    for (var i = 0; i < petals.length; i++) {
      var p = petals[i];
      p.y += p.vy * dt;
      p.x += (p.vx + Math.sin(t * p.sp + p.ph) * 0.010 * W) * dt;
      p.rot += p.rotV * dt;
      if (p.y > H + H * 0.02) { petals[i] = newPetal(false); }
    }

    for (var d = 0; d < drips.length; d++) {
      var dr = drips[d];
      if (!dr.falling) {
        dr.delay -= dt;
        if (dr.delay <= 0) {
          dr.falling = true;
          dr.y = eaveBot(dr.x) + H * 0.004;
        }
        continue;
      }
      dr.y += dr.vy * dt;
      if (dr.y >= WALL_BOTTOM + H * 0.004) {
        splashes.push({ x: dr.x, y: WALL_BOTTOM + H * 0.004, r: 1, a: 0.45 });
        dr.falling = false;
        dr.delay = rand(1.2, 4.5);
      }
    }

    for (var s = splashes.length - 1; s >= 0; s--) {
      var sp = splashes[s];
      sp.r += 16 * dt;
      sp.a -= dt * 0.9;
      if (sp.a <= 0) { splashes.splice(s, 1); }
    }
  }

  function warmup(frames) {
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
    warmup(110);
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
