/* 月下抚琴 —— 月夜湖心亭：大圆月、飞檐亭台、抚琴剪影、竹影、流萤、水月 */
(function () {
  'use strict';

  var canvas = document.getElementById('scene');
  var ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) { return; }

  var MAX_DPR = 2;

  var W = 1;
  var H = 1;
  var dpr = 1;
  var t = 0;
  var rafId = 0;
  var last = 0;
  var resizeTimer = 0;

  var bg = null;
  var glowSprite = null;   // 流萤 / 灯
  var cloudSprite = null;  // 月面薄云
  var mistSprite = null;   // 水面薄雾
  var moonCol = null;      // 月影光柱（预渲染，逐帧错位叠加）

  var bamboos = [];
  var fireflies = [];
  var clouds = [];
  var mist = [];
  var waveDots = [];

  var moonX = 0, moonY = 0, moonR = 0;
  var HY = 0;

  var INK = '#060a12';

  function rand(a, b) { return a + Math.random() * (b - a); }

  /* 亭子的几何（全部以 W / H 比例计算） */
  function pav() {
    return {
      cx: W * 0.652,
      base: H * 0.598,
      hw: W * 0.116,
      beam: H * 0.462,
      eaveLow: H * 0.448,
      eaveUp: H * 0.398,
      ridge: H * 0.386
    };
  }

  /* 近处水面上几片荷叶：压一压下半幅的空白 */
  function drawLotus(g) {
    var L = [
      { x: 0.205, y: 0.848, r: 0.052 },
      { x: 0.286, y: 0.918, r: 0.060 },
      { x: 0.455, y: 0.884, r: 0.048 },
      { x: 0.865, y: 0.892, r: 0.052 },
      { x: 0.735, y: 0.958, r: 0.040 },
      { x: 0.060, y: 0.938, r: 0.034 }
    ];
    for (var i = 0; i < L.length; i++) {
      var l = L[i];
      var rx = l.r * W;
      var ry = l.r * W * 0.30;
      var cx0 = l.x * W;
      var cy0 = l.y * H;
      // 水下的一点影
      g.fillStyle = 'rgba(4, 8, 14, 0.34)';
      g.beginPath();
      g.ellipse(cx0, cy0 + ry * 0.85, rx * 1.05, ry * 0.55, 0, 0, Math.PI * 2);
      g.fill();
      // 叶面：整体压暗，只有上缘被月光照到
      var lg = g.createLinearGradient(cx0, cy0 - ry, cx0, cy0 + ry);
      lg.addColorStop(0, 'rgba(70, 88, 116, 0.48)');
      lg.addColorStop(0.40, 'rgba(18, 27, 40, 0.92)');
      lg.addColorStop(1, 'rgba(4, 7, 12, 0.98)');
      g.fillStyle = lg;
      g.beginPath();
      g.ellipse(cx0, cy0, rx, ry, 0, 0, Math.PI * 2);
      g.fill();
      // 叶脉（很淡）
      g.strokeStyle = 'rgba(140, 160, 190, 0.10)';
      g.lineWidth = 1;
      for (var v = 0; v < 5; v++) {
        var a = Math.PI * (0.10 + v * 0.20);
        g.beginPath();
        g.moveTo(cx0, cy0);
        g.lineTo(cx0 + Math.cos(a) * rx * 0.85, cy0 - Math.sin(a) * ry * 0.85);
        g.stroke();
      }
      // 叶缘的一道月光
      g.strokeStyle = 'rgba(160, 180, 210, 0.26)';
      g.lineWidth = Math.max(1, H * 0.0015);
      g.beginPath();
      g.ellipse(cx0, cy0, rx, ry, 0, Math.PI * 1.10, Math.PI * 1.90);
      g.stroke();
    }
  }

  function makeLayer() {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.floor(W * dpr));
    c.height = Math.max(1, Math.floor(H * dpr));
    var g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { c: c, g: g };
  }

  /* ---------------- 亭台 ---------------- */

  function drawPavilion(g) {
    var p = pav();
    var cx = p.cx;
    var base = p.base;
    var hw = p.hw;

    // 岛石
    g.fillStyle = 'rgba(7, 12, 21, 0.98)';
    g.beginPath();
    g.moveTo(cx - hw * 1.62, HY + H * 0.012);
    g.quadraticCurveTo(cx - hw * 1.30, base + H * 0.006, cx - hw * 0.95, base + H * 0.004);
    g.lineTo(cx + hw * 1.00, base + H * 0.004);
    g.quadraticCurveTo(cx + hw * 1.34, base + H * 0.006, cx + hw * 1.60, HY + H * 0.010);
    g.closePath();
    g.fill();
    // 岛石顶的一线月光
    g.strokeStyle = 'rgba(180, 196, 220, 0.16)';
    g.lineWidth = Math.max(1, H * 0.0018);
    g.beginPath();
    g.moveTo(cx - hw * 1.05, base - H * 0.001);
    g.lineTo(cx + hw * 1.05, base - H * 0.001);
    g.stroke();

    // 亭板
    g.fillStyle = INK;
    g.fillRect(cx - hw * 1.10, base - H * 0.010, hw * 2.20, H * 0.012);
    g.strokeStyle = 'rgba(186, 200, 224, 0.26)';
    g.lineWidth = Math.max(1, H * 0.0018);
    g.beginPath();
    g.moveTo(cx - hw * 1.10, base - H * 0.010);
    g.lineTo(cx + hw * 1.10, base - H * 0.010);
    g.stroke();

    // 亭内的暖灯：一点点暖，别夺月
    g.save();
    g.beginPath();
    g.rect(cx - hw * 1.05, p.beam, hw * 2.10, base - p.beam);
    g.clip();
    var lampX = cx - hw * 0.06;
    var lampY = base - H * 0.040;
    var glow = g.createRadialGradient(lampX, lampY, 0, lampX, lampY, H * 0.052);
    glow.addColorStop(0, 'rgba(255, 194, 120, 0.54)');
    glow.addColorStop(0.30, 'rgba(248, 170, 98, 0.24)');
    glow.addColorStop(0.64, 'rgba(230, 148, 82, 0.07)');
    glow.addColorStop(1, 'rgba(230, 148, 82, 0)');
    g.fillStyle = glow;
    g.fillRect(cx - hw * 1.1, p.beam, hw * 2.2, base - p.beam);
    g.restore();

    // 柱子
    g.fillStyle = INK;
    var cols = [-0.94, -0.40, 0.40, 0.94];
    for (var i = 0; i < cols.length; i++) {
      var x = cx + hw * cols[i];
      g.fillRect(x - hw * 0.028, p.beam, hw * 0.056, base - p.beam - H * 0.008);
    }
    // 檐下横梁
    g.fillRect(cx - hw * 1.02, p.beam - H * 0.010, hw * 2.04, H * 0.012);
    // 栏杆
    g.fillRect(cx - hw * 0.98, base - H * 0.036, hw * 1.96, H * 0.005);
    g.fillRect(cx - hw * 0.98, base - H * 0.021, hw * 1.96, H * 0.004);
    for (var b = 0; b <= 12; b++) {
      var bx = cx - hw * 0.96 + (hw * 1.92) * (b / 12);
      g.fillRect(bx, base - H * 0.036, Math.max(1, hw * 0.010), H * 0.030);
    }

    // 抚琴的人
    drawPlayer(g, p);

    // 两层檐
    drawEaveLower(g, p);
    drawEaveUpper(g, p);

    // 宝顶
    g.fillStyle = INK;
    g.fillRect(cx - Math.max(0.6, hw * 0.008), p.eaveUp - H * 0.030, Math.max(1.2, hw * 0.016), H * 0.026);
    g.beginPath();
    g.arc(cx, p.eaveUp - H * 0.034, Math.max(1.6, H * 0.0075), 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(196, 208, 230, 0.20)';
    g.lineWidth = 1;
    g.beginPath();
    g.arc(cx, p.eaveUp - H * 0.034, Math.max(1.6, H * 0.0075), Math.PI * 1.1, Math.PI * 1.9);
    g.stroke();

    // 亭角挂着的一盏小灯（暖色的第二个来源，很小）
    var lanternX = cx + hw * 0.72;
    var lanternY = p.eaveLow + H * 0.012;
    g.strokeStyle = 'rgba(10, 16, 26, 0.9)';
    g.lineWidth = Math.max(0.8, H * 0.0018);
    g.beginPath();
    g.moveTo(lanternX, lanternY - H * 0.012);
    g.lineTo(lanternX, lanternY - H * 0.004);
    g.stroke();
    g.fillStyle = '#f0b070';
    g.beginPath();
    g.ellipse(lanternX, lanternY, Math.max(1.6, H * 0.0042), Math.max(2.4, H * 0.0062), 0, 0, Math.PI * 2);
    g.fill();
  }

  function drawEaveLower(g, p) {
    var cx = p.cx;
    var hw = p.hw;
    var y = p.eaveLow;
    g.fillStyle = INK;
    g.beginPath();
    g.moveTo(cx - hw * 1.34, y - H * 0.022);
    g.quadraticCurveTo(cx - hw * 1.02, y + H * 0.004, cx - hw * 0.52, y + H * 0.008);
    g.lineTo(cx + hw * 0.52, y + H * 0.008);
    g.quadraticCurveTo(cx + hw * 1.02, y + H * 0.004, cx + hw * 1.34, y - H * 0.022);
    g.lineTo(cx + hw * 1.30, y + H * 0.002);
    g.quadraticCurveTo(cx + hw * 1.00, y + H * 0.022, cx + hw * 0.52, y + H * 0.025);
    g.lineTo(cx - hw * 0.52, y + H * 0.025);
    g.quadraticCurveTo(cx - hw * 1.00, y + H * 0.022, cx - hw * 1.30, y + H * 0.002);
    g.closePath();
    g.fill();
    // 檐口的一线月光
    g.strokeStyle = 'rgba(198, 210, 232, 0.30)';
    g.lineWidth = Math.max(1, H * 0.0018);
    g.beginPath();
    g.moveTo(cx - hw * 1.34, y - H * 0.022);
    g.quadraticCurveTo(cx - hw * 1.02, y + H * 0.004, cx - hw * 0.52, y + H * 0.008);
    g.lineTo(cx + hw * 0.52, y + H * 0.008);
    g.quadraticCurveTo(cx + hw * 1.02, y + H * 0.004, cx + hw * 1.34, y - H * 0.022);
    g.stroke();

    // 檐口的瓦垄：一排短竖线，别让檐是一块平板
    for (var t2 = 0; t2 <= 20; t2++) {
      var tx = cx - hw * 1.30 + (hw * 2.60) * (t2 / 20);
      var u = Math.abs(tx - cx) / (hw * 1.34);
      var ty = y + H * 0.008 - Math.pow(u, 2) * H * 0.030;
      g.strokeStyle = 'rgba(146, 166, 200, 0.16)';
      g.lineWidth = Math.max(0.8, H * 0.0016);
      g.beginPath();
      g.moveTo(tx, ty + H * 0.002);
      g.lineTo(tx, ty + H * 0.023);
      g.stroke();
    }
  }

  function drawEaveUpper(g, p) {
    var cx = p.cx;
    var hw = p.hw;
    var y = p.eaveUp;
    // 上层屋身（重檐之间的一段暗）
    g.fillStyle = INK;
    g.beginPath();
    g.moveTo(cx - hw * 0.86, y + H * 0.006);
    g.lineTo(cx + hw * 0.86, y + H * 0.006);
    g.lineTo(cx + hw * 0.82, p.eaveLow + H * 0.004);
    g.lineTo(cx - hw * 0.82, p.eaveLow + H * 0.004);
    g.closePath();
    g.fill();
    // 重檐间的窗棂（很淡的竖线）
    g.strokeStyle = 'rgba(206, 216, 236, 0.16)';
    g.lineWidth = Math.max(0.8, H * 0.0016);
    for (var i = 0; i < 5; i++) {
      var x = cx - hw * 0.62 + hw * 0.31 * i;
      g.beginPath();
      g.moveTo(x, y + H * 0.010);
      g.lineTo(x, p.eaveLow - H * 0.004);
      g.stroke();
    }

    // 上层檐
    g.fillStyle = INK;
    g.beginPath();
    g.moveTo(cx - hw * 1.02, y - H * 0.020);
    g.quadraticCurveTo(cx - hw * 0.74, y + H * 0.006, cx - hw * 0.40, y + H * 0.009);
    g.lineTo(cx + hw * 0.40, y + H * 0.009);
    g.quadraticCurveTo(cx + hw * 0.74, y + H * 0.006, cx + hw * 1.02, y - H * 0.020);
    g.lineTo(cx + hw * 0.96, y + H * 0.002);
    g.quadraticCurveTo(cx + hw * 0.70, y + H * 0.026, cx + hw * 0.38, y + H * 0.028);
    g.lineTo(cx - hw * 0.38, y + H * 0.028);
    g.quadraticCurveTo(cx - hw * 0.70, y + H * 0.026, cx - hw * 0.96, y + H * 0.002);
    g.closePath();
    g.fill();

    // 屋脊
    g.beginPath();
    g.moveTo(cx - hw * 0.44, y + H * 0.008);
    g.lineTo(cx - hw * 0.30, p.ridge);
    g.lineTo(cx + hw * 0.30, p.ridge);
    g.lineTo(cx + hw * 0.44, y + H * 0.008);
    g.closePath();
    g.fill();
    // 屋脊上的一线月光
    g.strokeStyle = 'rgba(206, 218, 240, 0.34)';
    g.lineWidth = Math.max(1, H * 0.0018);
    g.beginPath();
    g.moveTo(cx - hw * 0.30, p.ridge);
    g.lineTo(cx + hw * 0.30, p.ridge);
    g.stroke();
    g.beginPath();
    g.moveTo(cx - hw * 1.02, y - H * 0.020);
    g.quadraticCurveTo(cx - hw * 0.74, y + H * 0.006, cx - hw * 0.40, y + H * 0.009);
    g.lineTo(cx + hw * 0.40, y + H * 0.009);
    g.quadraticCurveTo(cx + hw * 0.74, y + H * 0.006, cx + hw * 1.02, y - H * 0.020);
    g.stroke();

    // 上层檐的瓦垄
    for (var t3 = 0; t3 <= 12; t3++) {
      var tx3 = cx - hw * 0.98 + (hw * 1.96) * (t3 / 12);
      var u3 = Math.abs(tx3 - cx) / (hw * 1.02);
      var ty3 = y + H * 0.009 - Math.pow(u3, 2) * H * 0.028;
      g.strokeStyle = 'rgba(146, 166, 200, 0.13)';
      g.lineWidth = Math.max(0.7, H * 0.0014);
      g.beginPath();
      g.moveTo(tx3, ty3);
      g.lineTo(tx3, ty3 + H * 0.017);
      g.stroke();
    }
  }

  /* 抚琴的女子：只有剪影，不画五官 */
  function drawPlayer(g, p) {
    var cx = p.cx;
    var base = p.base;
    var hw = p.hw;
    var headY = base - H * 0.076;
    var headR = H * 0.0105;
    var shY = base - H * 0.059;
    var sway = Math.sin(t * 0.5) * H * 0.0016;

    g.fillStyle = INK;
    // 跪坐的身体 + 垂落的衣袂
    g.beginPath();
    g.moveTo(cx - hw * 0.20, base + H * 0.002);
    g.quadraticCurveTo(cx - hw * 0.16, base - H * 0.030, cx - hw * 0.095, shY + H * 0.004);
    g.quadraticCurveTo(cx - hw * 0.060, shY - H * 0.008, cx - hw * 0.012, shY - H * 0.004);
    g.quadraticCurveTo(cx + hw * 0.040, shY + H * 0.002, cx + hw * 0.056, base - H * 0.030);
    g.quadraticCurveTo(cx + hw * 0.085, base - H * 0.008, cx + hw * 0.120, base + H * 0.002);
    g.quadraticCurveTo(cx + hw * 0.010, base + H * 0.010, cx - hw * 0.20, base + H * 0.002);
    g.closePath();
    g.fill();

    // 头
    g.beginPath();
    g.ellipse(cx - hw * 0.038, headY, headR * 0.86, headR, 0, 0, Math.PI * 2);
    g.fill();
    // 发髻
    g.beginPath();
    g.ellipse(cx - hw * 0.030, headY - headR * 0.92, headR * 0.62, headR * 0.36, 0, 0, Math.PI * 2);
    g.fill();
    // 颈
    g.fillRect(cx - hw * 0.050, headY + headR * 0.7, hw * 0.024, H * 0.010);

    // 手臂伸向左前方的琴
    g.strokeStyle = INK;
    g.lineCap = 'round';
    g.lineWidth = Math.max(1.6, H * 0.0052);
    g.beginPath();
    g.moveTo(cx - hw * 0.085, shY + H * 0.004 + sway);
    g.quadraticCurveTo(cx - hw * 0.215, shY + H * 0.012, cx - hw * 0.300, base - H * 0.030);
    g.stroke();
    g.beginPath();
    g.moveTo(cx - hw * 0.075, shY + H * 0.008 + sway);
    g.quadraticCurveTo(cx - hw * 0.190, shY + H * 0.020, cx - hw * 0.262, base - H * 0.026);
    g.stroke();

    // 琴桌
    g.fillStyle = INK;
    g.fillRect(cx - hw * 0.46, base - H * 0.030, hw * 0.34, H * 0.005);
    g.fillRect(cx - hw * 0.45, base - H * 0.026, hw * 0.008, H * 0.026);
    g.fillRect(cx - hw * 0.19, base - H * 0.026, hw * 0.008, H * 0.026);
    // 古琴：一条细长的琴身
    g.save();
    g.translate(cx - hw * 0.295, base - H * 0.032);
    g.rotate(-0.045 + Math.sin(t * 0.5) * 0.004);
    g.fillStyle = 'rgba(22, 32, 46, 0.98)';
    g.beginPath();
    g.moveTo(-hw * 0.16, 0);
    g.quadraticCurveTo(0, -H * 0.005, hw * 0.14, 0);
    g.quadraticCurveTo(0, H * 0.004, -hw * 0.16, 0);
    g.closePath();
    g.fill();
    // 琴弦的一点反光
    g.strokeStyle = 'rgba(196, 206, 226, 0.20)';
    g.lineWidth = 0.8;
    g.beginPath();
    g.moveTo(-hw * 0.14, -H * 0.0015);
    g.lineTo(hw * 0.12, -H * 0.0015);
    g.stroke();
    g.restore();
  }

  /* ---------------- 静态背景 ---------------- */

  function buildBackground() {
    var layer = makeLayer();
    var g = layer.g;

    // 夜空
    var sky = g.createLinearGradient(0, 0, 0, HY);
    sky.addColorStop(0, '#070b14');
    sky.addColorStop(0.45, '#0b1424');
    sky.addColorStop(1, '#142238');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);

    // 月亮的月色晕开
    var halo = g.createRadialGradient(moonX, moonY, moonR * 0.6, moonX, moonY, moonR * 5.2);
    halo.addColorStop(0, 'rgba(214, 210, 178, 0.22)');
    halo.addColorStop(0.22, 'rgba(178, 182, 168, 0.10)');
    halo.addColorStop(0.55, 'rgba(120, 138, 160, 0.05)');
    halo.addColorStop(1, 'rgba(120, 138, 160, 0)');
    g.fillStyle = halo;
    g.fillRect(0, 0, W, H);

    // 星子（稀疏，靠近月亮更淡）
    var i, x, y, d;
    for (i = 0; i < 70; i++) {
      x = rand(0.02, 0.98) * W;
      y = rand(0.02, 0.52) * H;
      d = Math.sqrt((x - moonX) * (x - moonX) + (y - moonY) * (y - moonY)) / moonR;
      var a = rand(0.12, 0.44) * Math.min(1, d / 2.4);
      g.fillStyle = 'rgba(226, 232, 240, ' + a.toFixed(3) + ')';
      g.fillRect(x, y, rand(0.9, 1.9), rand(0.9, 1.9));
    }

    // 远山
    g.fillStyle = 'rgba(8, 14, 26, 0.95)';
    g.beginPath();
    g.moveTo(0, HY + 2);
    g.lineTo(0, HY - H * 0.028);
    g.quadraticCurveTo(W * 0.08, HY - H * 0.050, W * 0.17, HY - H * 0.030);
    g.quadraticCurveTo(W * 0.26, HY - H * 0.012, W * 0.34, HY - H * 0.024);
    g.lineTo(W * 0.42, HY + 2);
    g.closePath();
    g.fill();
    g.beginPath();
    g.moveTo(W, HY + 2);
    g.lineTo(W, HY - H * 0.024);
    g.quadraticCurveTo(W * 0.94, HY - H * 0.046, W * 0.86, HY - H * 0.026);
    g.quadraticCurveTo(W * 0.78, HY - H * 0.010, W * 0.70, HY + 2);
    g.closePath();
    g.fill();
    // 远山的一线月光
    g.strokeStyle = 'rgba(150, 168, 196, 0.12)';
    g.lineWidth = Math.max(1, H * 0.0016);
    g.beginPath();
    g.moveTo(0, HY - H * 0.028);
    g.quadraticCurveTo(W * 0.08, HY - H * 0.050, W * 0.17, HY - H * 0.030);
    g.quadraticCurveTo(W * 0.26, HY - H * 0.012, W * 0.34, HY - H * 0.024);
    g.stroke();

    // 月亮
    var disc = g.createRadialGradient(moonX - moonR * 0.20, moonY - moonR * 0.24, moonR * 0.10,
      moonX, moonY, moonR * 1.04);
    disc.addColorStop(0, '#fdf7e4');
    disc.addColorStop(0.55, '#f4ecca');
    disc.addColorStop(0.92, '#ecdfb8');
    disc.addColorStop(1, '#e4d6ae');
    g.fillStyle = disc;
    g.beginPath();
    g.arc(moonX, moonY, moonR, 0, Math.PI * 2);
    g.fill();
    // 月面不画陨石坑，保持干净的一轮

    // 水面
    var water = g.createLinearGradient(0, HY, 0, H);
    water.addColorStop(0, '#1a2a42');
    water.addColorStop(0.08, '#142034');
    water.addColorStop(0.45, '#0b1424');
    water.addColorStop(1, '#060a13');
    g.fillStyle = water;
    g.fillRect(0, HY, W, H - HY);

    // 水天线的一层低光
    var hzl = g.createLinearGradient(0, HY - H * 0.006, 0, HY + H * 0.030);
    hzl.addColorStop(0, 'rgba(168, 184, 208, 0.20)');
    hzl.addColorStop(0.45, 'rgba(150, 168, 196, 0.07)');
    hzl.addColorStop(1, 'rgba(150, 168, 196, 0)');
    g.fillStyle = hzl;
    g.fillRect(0, HY - H * 0.006, W, H * 0.036);

    // 亭子 + 倒影
    drawPavilion(g);
    g.save();
    g.beginPath();
    g.rect(0, HY, W, H - HY);
    g.clip();
    g.translate(0, HY * 2);
    g.scale(1, -1);
    g.globalAlpha = 0.13;
    drawPavilion(g);
    g.globalAlpha = 1;
    g.restore();

    // 月影的底光：一团柔和的光，边缘不能出现硬边
    g.save();
    g.beginPath();
    g.rect(0, HY, W, H - HY);
    g.clip();
    g.translate(moonX, HY + H * 0.055);
    g.scale(1, 2.6);
    var gr0 = H * 0.20;
    g.globalAlpha = 0.26;
    g.drawImage(glowSprite, -gr0, -gr0, gr0 * 2, gr0 * 2);
    g.globalAlpha = 1;
    g.restore();

    // 水面静态的细纹
    for (i = 0; i < 90; i++) {
      var wy = HY + Math.pow(Math.random(), 1.5) * (H - HY);
      var wl = rand(10, 90) * (0.4 + (wy - HY) / (H - HY));
      var wx = rand(-20, W + 20);
      var wa = rand(0.02, 0.08) * (1 - (wy - HY) / (H - HY) * 0.4);
      g.fillStyle = 'rgba(176, 194, 218, ' + wa.toFixed(3) + ')';
      g.fillRect(wx, wy, wl, rand(0.8, 1.8));
    }

    // 亭子倒影上的横纹，让倒影虚一点
    for (i = 0; i < 26; i++) {
      var ry = HY + rand(0.004, 0.09) * H;
      g.fillStyle = 'rgba(10, 18, 30, ' + rand(0.10, 0.26).toFixed(3) + ')';
      g.fillRect(pav().cx - W * 0.16, ry, W * 0.32, rand(1.2, 2.6));
    }
    g.restore();

    // 压角
    var vg = g.createRadialGradient(W * 0.42, H * 0.46, Math.min(W, H) * 0.34,
      W * 0.42, H * 0.46, Math.max(W, H) * 0.86);
    vg.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vg.addColorStop(0.65, 'rgba(2, 5, 10, 0.10)');
    vg.addColorStop(1, 'rgba(2, 5, 10, 0.42)');
    g.fillStyle = vg;
    g.fillRect(0, 0, W, H);

    // 诗句：竖排，淡月白
    var poem = '独坐幽篁里';
    var fs = Math.max(12, H * 0.032);
    g.save();
    g.font = fs + 'px "KaiTi","STKaiti","SimSun",serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = 'rgba(222, 228, 222, 0.22)';
    var px = W * 0.878;
    var py = H * 0.108;
    for (i = 0; i < poem.length; i++) {
      g.fillText(poem.charAt(i), px, py + i * fs * 1.62);
    }
    g.restore();

    bg = layer.c;
  }

  /* ---------------- 帖图 ---------------- */

  /* 月影光柱：一次性预渲染成一条上窄下宽、边缘带碎波的竖向光柱，
     逐帧以 ±1.5px 错位叠两三次，柔化成连续的水光，而不是一条条横杠 */
  function makeMoonColumn() {
    var cw = 128;
    var ch = 256;
    var c = document.createElement('canvas');
    c.width = cw;
    c.height = ch;
    var g = c.getContext('2d');
    var seed = 0.7;
    for (var j = 0; j < ch; j++) {
      var f = j / (ch - 1);
      var hw = cw * (0.075 + 0.255 * Math.pow(f, 0.95));
      var wob = (Math.sin(f * 9.0 + seed) * 0.14 + Math.sin(f * 21.0 - seed * 2) * 0.06) * hw;
      var cx = cw * 0.5 + wob;
      var a = 0.80 * (1 - f * 0.52);
      if (f < 0.06) { a *= f / 0.06; }
      if (f > 0.80) { a *= Math.max(0, (1 - f) / 0.20); }
      if (a <= 0) { continue; }
      var gr = g.createLinearGradient(cx - hw, 0, cx + hw, 0);
      gr.addColorStop(0, 'rgba(246, 238, 208, 0)');
      gr.addColorStop(0.30, 'rgba(246, 238, 208, ' + (a * 0.50).toFixed(3) + ')');
      gr.addColorStop(0.50, 'rgba(250, 243, 216, ' + a.toFixed(3) + ')');
      gr.addColorStop(0.70, 'rgba(246, 238, 208, ' + (a * 0.50).toFixed(3) + ')');
      gr.addColorStop(1, 'rgba(246, 238, 208, 0)');
      g.fillStyle = gr;
      g.fillRect(0, j, cw, 1);
    }
    // 柱心里几道更亮的水光，纵向拉丝，让"碎光"有层次
    for (var k = 0; k < 7; k++) {
      var x0 = cw * (0.40 + Math.random() * 0.20);
      var lg = g.createLinearGradient(x0, 0, x0, ch);
      lg.addColorStop(0, 'rgba(255, 250, 226, 0)');
      lg.addColorStop(0.18, 'rgba(255, 250, 226, ' + rand(0.06, 0.15).toFixed(2) + ')');
      lg.addColorStop(0.62, 'rgba(255, 250, 226, 0)');
      g.fillStyle = lg;
      g.fillRect(x0 - 1.2, 0, rand(1.2, 2.8), ch);
    }
    moonCol = c;
  }

  function makeGlowSprite() {    var c = document.createElement('canvas');
    c.width = 96;
    c.height = 96;
    var g = c.getContext('2d');
    var rg = g.createRadialGradient(48, 48, 0, 48, 48, 48);
    rg.addColorStop(0, 'rgba(255, 238, 176, 0.95)');
    rg.addColorStop(0.10, 'rgba(255, 226, 150, 0.62)');
    rg.addColorStop(0.32, 'rgba(216, 210, 120, 0.20)');
    rg.addColorStop(0.66, 'rgba(180, 210, 140, 0.05)');
    rg.addColorStop(1, 'rgba(180, 210, 140, 0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, 96, 96);
    glowSprite = c;
  }

  function makeCloudSprite() {
    var c = document.createElement('canvas');
    c.width = 256;
    c.height = 128;
    var g = c.getContext('2d');
    for (var i = 0; i < 20; i++) {
      var x = rand(0.14, 0.86) * 256;
      var y = rand(0.24, 0.76) * 128;
      var r = rand(0.10, 0.24) * 256;
      var rg = g.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, 'rgba(46, 62, 90, 0.42)');
      rg.addColorStop(0.55, 'rgba(42, 56, 82, 0.18)');
      rg.addColorStop(1, 'rgba(42, 56, 82, 0)');
      g.fillStyle = rg;
      g.fillRect(0, 0, 256, 128);
    }
    cloudSprite = c;
  }

  function makeMistSprite() {
    var c = document.createElement('canvas');
    c.width = 256;
    c.height = 96;
    var g = c.getContext('2d');
    for (var i = 0; i < 10; i++) {
      var x = rand(0.08, 0.92) * 256;
      var y = rand(0.30, 0.70) * 96;
      var r = rand(0.16, 0.34) * 256;
      var rg = g.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, 'rgba(186, 202, 226, 0.13)');
      rg.addColorStop(0.6, 'rgba(186, 202, 226, 0.05)');
      rg.addColorStop(1, 'rgba(186, 202, 226, 0)');
      g.fillStyle = rg;
      g.fillRect(0, 0, 256, 96);
    }
    mistSprite = c;
  }

  /* ---------------- 竹 ---------------- */

  function stalkPt(b, tt) {
    var y = H * 1.03 - (H * 1.03 - b.top) * tt;
    var x = b.x + b.lean * W * Math.pow(1 - tt, 1.7);
    x += Math.sin(tt * 2.4 + b.ph) * W * 0.004;
    return { x: x, y: y };
  }

  function makeBamboo() {
    bamboos = [];
    var specs = [
      { x: 0.062, top: 0.020, lean: 0.032, w: 0.0058, ph: 0.4, nb: 4 },
      { x: 0.112, top: 0.096, lean: -0.024, w: 0.0040, ph: 1.9, nb: 3 },
      { x: 0.028, top: 0.158, lean: 0.050, w: 0.0032, ph: 3.2, nb: 3 },
      { x: 0.966, top: 0.118, lean: -0.030, w: 0.0036, ph: 2.4, nb: 3 }
    ];
    for (var i = 0; i < specs.length; i++) {
      var sp = specs[i];
      var b = {
        x: sp.x * W, top: sp.top * H, lean: sp.lean,
        w: sp.w * W, ph: sp.ph, nodes: [], branches: []
      };
      for (var tt = 0.03; tt < 0.98; tt += 0.062) { b.nodes.push(tt); }
      for (var j = 0; j < sp.nb; j++) {
        var t0 = 0.26 + j * (0.56 / sp.nb) + rand(-0.02, 0.02);
        var dir = (j % 2 === 0) ? -1 : 1;
        var up = rand(0.42, 0.95);
        var br = {
          t: t0,
          ang: dir < 0 ? (Math.PI + up) : (-up),
          len: (0.040 + rand(0, 0.038)) * H,
          phase: rand(0, 6.28),
          leaves: []
        };
        var nl = 9 + ((Math.random() * 3) | 0);
        for (var k = 0; k < nl; k++) {
          var u = 0.10 + 0.90 * (k / (nl - 1));
          var side = (k % 2 === 0) ? 1 : -1;
          br.leaves.push({
            u: u + rand(-0.02, 0.02),
            ang: side * (0.20 + rand(0, 0.46)),
            len: (0.017 + rand(0, 0.016)) * H * (1.06 - 0.36 * (k / nl)),
            ph: rand(0, 6.28)
          });
        }
        b.branches.push(br);
      }
      bamboos.push(b);
    }
  }

  function drawLeaf(x, y, len, ang) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(len * 0.42, -len * 0.15, len, len * 0.02);
    ctx.quadraticCurveTo(len * 0.42, len * 0.09, 0, 0);
    ctx.fillStyle = INK;
    ctx.fill();
    ctx.restore();
  }

  function drawBamboo() {
    for (var i = 0; i < bamboos.length; i++) {
      var b = bamboos[i];
      // 竹竿
      ctx.strokeStyle = INK;
      ctx.lineCap = 'butt';
      ctx.beginPath();
      var steps = 20;
      for (var s = 0; s <= steps; s++) {
        var p = stalkPt(b, s / steps);
        if (s === 0) { ctx.moveTo(p.x, p.y); } else { ctx.lineTo(p.x, p.y); }
      }
      ctx.lineWidth = b.w;
      ctx.stroke();

      // 竹节（极淡的一点横线）
      ctx.strokeStyle = 'rgba(120, 142, 170, 0.16)';
      ctx.lineWidth = Math.max(0.8, b.w * 0.28);
      for (var n = 0; n < b.nodes.length; n++) {
        var pn = stalkPt(b, b.nodes[n]);
        ctx.beginPath();
        ctx.moveTo(pn.x - b.w * 0.55, pn.y);
        ctx.lineTo(pn.x + b.w * 0.55, pn.y);
        ctx.stroke();
      }

      // 枝与叶
      for (var j = 0; j < b.branches.length; j++) {
        var br = b.branches[j];
        var base = stalkPt(b, br.t);
        var sway = Math.sin(t * 0.55 + br.phase) * 0.06;
        var ang = br.ang + sway;
        var tipX = base.x + Math.cos(ang) * br.len;
        var tipY = base.y + Math.sin(ang) * br.len;
        var ctrlX = base.x + Math.cos(ang) * br.len * 0.55;
        var ctrlY = base.y + Math.sin(ang) * br.len * 0.55 - br.len * 0.12;
        ctx.strokeStyle = INK;
        ctx.lineWidth = Math.max(0.9, b.w * 0.40);
        ctx.beginPath();
        ctx.moveTo(base.x, base.y);
        ctx.quadraticCurveTo(ctrlX, ctrlY, tipX, tipY);
        ctx.stroke();

        for (var k = 0; k < br.leaves.length; k++) {
          var lf = br.leaves[k];
          var u = lf.u;
          var px = (1 - u) * (1 - u) * base.x + 2 * u * (1 - u) * ctrlX + u * u * tipX;
          var py = (1 - u) * (1 - u) * base.y + 2 * u * (1 - u) * ctrlY + u * u * tipY;
          var la = ang + lf.ang + Math.sin(t * 0.95 + lf.ph) * 0.16;
          drawLeaf(px, py, lf.len, la);
        }
      }
    }
  }

  /* ---------------- 粒子 ---------------- */

  function makeFireflies() {
    fireflies = [];
    for (var i = 0; i < 13; i++) {
      fireflies.push({
        x: rand(0.04, 0.90) * W,
        y: rand(0.47, 0.60) * H,
        r: rand(0.0035, 0.0075) * H,
        ph: rand(0, 6.28),
        sp: rand(0.15, 0.42),
        ax: rand(0.02, 0.07) * W,
        ay: rand(0.02, 0.05) * H,
        pulse: rand(0.8, 2.2)
      });
    }
  }

  function makeClouds() {
    clouds = [];
    for (var i = 0; i < 2; i++) {
      clouds.push({
        x: rand(-0.2, 1.0),
        y: rand(0.16, 0.32),
        w: rand(0.28, 0.44) * W,
        h: rand(0.20, 0.28) * H,
        a: rand(0.26, 0.42),
        sp: rand(0.005, 0.012)
      });
    }
  }

  function makeMist() {
    mist = [];
    for (var i = 0; i < 4; i++) {
      mist.push({
        x: rand(-0.1, 1.0),
        y: HY + rand(-0.014, 0.028) * H,
        w: rand(0.34, 0.70) * W,
        h: rand(0.030, 0.055) * H,
        a: rand(0.5, 0.95),
        sp: rand(0.004, 0.012)
      });
    }
  }

  function makeWaveDots() {
    waveDots = [];
    for (var i = 0; i < 46; i++) {
      var f = Math.pow(Math.random(), 1.4);
      waveDots.push({
        x: rand(0, 1),
        f: f,
        w: rand(6, 40),
        ph: rand(0, 6.28),
        sp: rand(0.4, 1.3),
        a: rand(0.05, 0.16)
      });
    }
  }

  /* ---------------- 动态 ---------------- */

  function advance(dt) {
    t += dt;
    var i;

    for (i = 0; i < fireflies.length; i++) {
      var f = fireflies[i];
      f.x += Math.sin(t * f.sp + f.ph) * f.ax * dt;
      f.y += Math.cos(t * f.sp * 0.8 + f.ph * 1.3) * f.ay * dt;
      if (f.x < -0.05 * W) { f.x = W * 1.02; }
      if (f.x > 1.05 * W) { f.x = -W * 0.02; }
      if (f.y < H * 0.44) { f.y = H * 0.44; }
      if (f.y > H * 0.63) { f.y = H * 0.63; }
    }

    for (i = 0; i < clouds.length; i++) {
      var c = clouds[i];
      c.x += c.sp * dt;
      if (c.x > 1.25) { c.x = -0.30; c.y = rand(0.19, 0.34); }
    }

    for (i = 0; i < mist.length; i++) {
      var m = mist[i];
      m.x += m.sp * dt;
      if (m.x > 1.3) { m.x = -0.35; }
    }
  }

  /* 水面的月影：随波碎开又合拢 */
  function drawWaterAnim() {
    var i, s;

    // 月影：一条竖向光柱 + 极淡的横向波光，求"碎开又合拢"的连续感
    var colW = moonR * 1.35;
    var colH = H - HY;
    var breathe = 0.78 + 0.22 * (0.5 + 0.5 * Math.sin(t * 0.31));
    var sx = 1 + 0.045 * Math.sin(t * 0.27);
    var dy = Math.sin(t * 0.85) * 1.2;
    var offs = [0, -1.2, 1.2];
    var alphas = [0.85 * breathe, 0.26 * breathe, 0.24 * breathe];
    if (moonCol) {
      for (var q = 0; q < 3; q++) {
        ctx.save();
        ctx.translate(moonX, HY);
        ctx.scale(sx, 1);
        ctx.translate(-moonX, -HY);
        ctx.globalAlpha = alphas[q];
        ctx.drawImage(moonCol, moonX - colW * 0.5 + offs[q], HY + (q === 0 ? 0 : dy), colW, colH);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }

    // 2~3 条很淡的横向正弦亮线，表示水面的波光
    for (var k2 = 0; k2 < 4; k2++) {
      var fy = 0.07 + k2 * 0.20 + 0.015 * Math.sin(t * 0.4 + k2 * 1.7);
      var yy = HY + colH * fy;
      var half = colW * (0.30 + 0.28 * fy);
      ctx.beginPath();
      for (var xx = -1; xx <= 1.001; xx += 0.1) {
        var px2 = moonX + xx * half;
        var py2 = yy + Math.sin(xx * 7.0 + t * 1.7 + k2 * 2.1) * 2.0;
        if (xx <= -1) { ctx.moveTo(px2, py2); } else { ctx.lineTo(px2, py2); }
      }
      ctx.strokeStyle = 'rgba(246, 238, 208, 0.11)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // 水面的碎光
    for (i = 0; i < waveDots.length; i++) {
      var d = waveDots[i];
      var wy = HY + Math.pow(d.f, 1.5) * colH;
      var wob = Math.sin(t * d.sp + d.ph) * (4 + 18 * d.f);
      var wa = d.a * (0.55 + 0.45 * Math.sin(t * d.sp * 1.7 + d.ph * 2.0));
      if (wa <= 0.01) { continue; }
      ctx.fillStyle = 'rgba(190, 208, 232, ' + wa.toFixed(3) + ')';
      ctx.fillRect(d.x * W + wob, wy, d.w * (0.3 + d.f), Math.max(0.8, 1.6 * (0.4 + d.f)));
    }

    // 亭子倒影被水纹打碎
    var p = pav();
    for (i = 0; i < 16; i++) {
      var f2 = i / 16;
      var wy2 = HY + (0.012 + f2 * 0.10) * H;
      var jx = Math.sin(t * 1.1 + f2 * 9) * W * 0.010 * (0.4 + f2);
      var wa2 = 0.10 + 0.10 * Math.sin(t * 1.4 + f2 * 6);
      ctx.fillStyle = 'rgba(8, 14, 24, ' + wa2.toFixed(3) + ')';
      ctx.fillRect(p.cx - W * 0.155 + jx, wy2, W * 0.31, rand(1.2, 2.4));
    }
  }

  function drawMoonClouds() {
    for (var i = 0; i < clouds.length; i++) {
      var c = clouds[i];
      var cx = c.x * W;
      var cy = c.y * H;
      var rw = c.w * 0.5;
      var rh = c.h * 0.5;
      var a = c.a * (0.75 + 0.25 * Math.sin(t * 0.3 + i));
      var blobs = [
        { dx: -0.30, dy: -0.42, s: 0.62 },
        { dx: 0.02, dy: 0.06, s: 0.86 },
        { dx: 0.30, dy: -0.26, s: 0.56 }
      ];
      for (var k = 0; k < blobs.length; k++) {
        var b = blobs[k];
        var bx = cx + b.dx * rw;
        var by = cy + b.dy * rh;
        var rr = rw * b.s;
        var gr = ctx.createRadialGradient(bx, by, 0, bx, by, rr);
        gr.addColorStop(0, 'rgba(58, 72, 104, ' + (a * 0.55 * b.s).toFixed(3) + ')');
        gr.addColorStop(0.45, 'rgba(54, 68, 100, ' + (a * 0.28 * b.s).toFixed(3) + ')');
        gr.addColorStop(1, 'rgba(54, 68, 100, 0)');
        ctx.save();
        ctx.translate(bx, by);
        ctx.scale(1, (rh / rw) * 0.85);
        ctx.translate(-bx, -by);
        ctx.fillStyle = gr;
        ctx.fillRect(bx - rr, by - rr, rr * 2, rr * 2);
        ctx.restore();
      }
    }
  }

  function drawMist() {
    for (var i = 0; i < mist.length; i++) {
      var m = mist[i];
      ctx.globalAlpha = m.a * 0.30;
      ctx.drawImage(mistSprite, m.x * W - m.w * 0.5, m.y - m.h * 0.5, m.w, m.h);
    }
    ctx.globalAlpha = 1;
  }

  function drawFireflies() {
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < fireflies.length; i++) {
      var f = fireflies[i];
      var x = f.x + Math.sin(t * f.sp * 1.3 + f.ph) * f.ax;
      var y = f.y + Math.cos(t * f.sp * 1.1 + f.ph * 1.7) * f.ay;
      var pulse = 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(t * f.pulse + f.ph), 2);
      var rr = f.r * (3.0 + 1.4 * pulse);
      ctx.globalAlpha = 0.50 * pulse;
      ctx.drawImage(glowSprite, x - rr, y - rr, rr * 2, rr * 2);
      ctx.globalAlpha = 0.85 * pulse;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(0.7, f.r * 0.5), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 244, 190, 1)';
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (bg) { ctx.drawImage(bg, 0, 0, W, H); }

    drawWaterAnim();
    drawMist();
    drawLotus(ctx);
    drawMoonClouds();
    drawFireflies();
    drawBamboo();
  }

  function warmup(frames) {
    var dt = 1 / 60;
    for (var i = 0; i < frames; i++) { advance(dt); }
    draw();
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

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    W = Math.max(1, window.innerWidth);
    H = Math.max(1, window.innerHeight);

    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    HY = H * 0.618;
    moonX = W * 0.268;
    moonY = H * 0.262;
    moonR = H * 0.188;

    makeGlowSprite();
    makeCloudSprite();
    makeMistSprite();
    makeMoonColumn();
    makeBamboo();
    makeFireflies();
    makeClouds();
    makeMist();
    makeWaveDots();
    buildBackground();
    t = 0;

    warmup(130);
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

