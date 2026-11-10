/* 汉服 · 惊鸿 —— 半写实游戏风角色立绘（侧逆光 3/4 半身像）
 *
 * 画法（纯 Canvas 2D，无贴图、无外部资源）：
 *   · 半写实靠"软"：所有明暗关系都用 ctx.filter = blur() 画成柔边色块，
 *     再叠轮廓光、色调分级、镜头微移与胶片颗粒，避免矢量平涂的塑料感；
 *   · 视角：3/4 侧脸半身像（游戏角色立绘最常见的构图）。月光从左前方勾出侧脸、
 *     发丝与肩线的冷轮廓光，右后方一盏暖灯补暖轮廓光，脸的大部分落在柔和阴影里——
 *     这种打光最出效果，也最不容易在程序绘制下崩；
 *   · 静态部分（夜空/月/远亭/人物/前景枝叶）烘焙进离屏画布；逐帧只画：
 *     呼吸、眨眼、飘落花瓣、焦外光斑呼吸、飞散发丝、镜头微移、颗粒。
 */
(function () {
  'use strict';

  var canvas = document.getElementById('scene');
  var ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) { return; }

  var MAX_DPR = 2;
  var W = 1, H = 1, dpr = 1, U = 1;

  // 人物几何（设计像素，随 U = H/720 缩放）
  var cx = 0;          // 头中心 x（前后方向）
  var headTop = 0;     // 额顶 y
  var faceW = 0;       // 头宽（额→后脑）
  var faceH = 0;       // 额顶 → 下巴
  var chinY = 0;
  var neckY = 0;       // 脖子中段
  var shY = 0;         // 肩线
  var shHalf = 0;
  var waistY = 0;      // 腰带位置

  var far = null, hero = null, fore = null, grain = null;
  var bokehSprite = null, warmSprite = null;
  var eyes = [];
  var bokeh = [], petals = [], flyaway = [];

  var t = 0, rafId = 0, last = 0, resizeTimer = 0;
  var blink = { wait: 2.6, phase: 0, amount: 0 };

  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, k) { return a + (b - a) * k; }

  var P = {
    night1: '#050b10', night2: '#0a1820', night3: '#142b34',
    moon: '#eaf5f9',
    skin: '#f8dac2', skinShade: '#cf9679', skinDeep: '#9a5f4a',
    hair: '#100d14', hairLit: '#463a48',
    robe: '#5b1520', robeLit: '#a33844', robeDark: '#2a0810',
    gold: '#d7a659', jade: '#a9d0c1', white: '#efe9dd'
  };

  // ---------------------------------------------------------------------------
  function mkCanvas(w, h) {
    var cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(w * dpr));
    cv.height = Math.max(1, Math.round(h * dpr));
    var c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { cv: cv, c: c };
  }

  function soft(c, blurPx, fn) {
    c.save();
    if (blurPx > 0) { c.filter = 'blur(' + blurPx + 'px)'; }
    fn(c);
    c.restore();
  }

  function lg(c, x0, y0, x1, y1, stops) {
    var g = c.createLinearGradient(x0, y0, x1, y1);
    for (var i = 0; i < stops.length; i++) { g.addColorStop(stops[i][0], stops[i][1]); }
    return g;
  }

  function rg(c, x, y, r0, r1, stops) {
    var g = c.createRadialGradient(x, y, r0, x, y, r1);
    for (var i = 0; i < stops.length; i++) { g.addColorStop(stops[i][0], stops[i][1]); }
    return g;
  }

  function makeSprites() {
    var s1 = mkCanvas(128, 128);
    s1.c.fillStyle = rg(s1.c, 64, 64, 0, 64, [
      [0, 'rgba(255,255,255,0.9)'], [0.35, 'rgba(255,255,255,0.40)'],
      [0.7, 'rgba(255,255,255,0.10)'], [1, 'rgba(255,255,255,0)']
    ]);
    s1.c.fillRect(0, 0, 128, 128);
    bokehSprite = s1.cv;

    var s2 = mkCanvas(160, 160);
    s2.c.fillStyle = rg(s2.c, 80, 80, 0, 80, [
      [0, 'rgba(255,216,152,0.95)'], [0.24, 'rgba(248,164,88,0.5)'],
      [0.6, 'rgba(224,116,56,0.14)'], [1, 'rgba(224,116,56,0)']
    ]);
    s2.c.fillRect(0, 0, 160, 160);
    warmSprite = s2.cv;

    var size = 160;
    var s3 = mkCanvas(size, size);
    var img = s3.c.createImageData(size, size);
    for (var i = 0; i < img.data.length; i += 4) {
      var v = 128 + (Math.random() - 0.5) * 120;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 24;
    }
    s3.c.putImageData(img, 0, 0);
    grain = s3.cv;
  }

  // ---------------------------------------------------------------------------
  // 远景
  // ---------------------------------------------------------------------------
  function buildFar() {
    var o = mkCanvas(W, H), c = o.c;

    c.fillStyle = lg(c, W * 0.15, 0, W * 0.95, H, [
      [0, P.night1], [0.40, P.night2], [1, '#07131a']
    ]);
    c.fillRect(0, 0, W, H);

    var moonX = W * 0.155, moonY = H * 0.235, moonR = H * 0.085;

    soft(c, 80 * U, function (g) {
      g.fillStyle = rg(g, moonX, moonY, moonR * 0.5, H * 0.66, [
        [0, 'rgba(202,232,242,0.42)'], [0.32, 'rgba(146,194,212,0.13)'], [1, 'rgba(110,160,182,0)']
      ]);
      g.fillRect(0, 0, W, H);
    });
    soft(c, 2.6 * U, function (g) {
      g.fillStyle = rg(g, moonX - moonR * 0.3, moonY - moonR * 0.3, 0, moonR * 1.1, [
        [0, '#ffffff'], [0.6, P.moon], [1, '#c6dee8']
      ]);
      g.beginPath(); g.arc(moonX, moonY, moonR, 0, 6.2832); g.fill();
    });
    soft(c, 4.5 * U, function (g) {
      g.fillStyle = 'rgba(166,196,208,0.28)';
      g.beginPath(); g.ellipse(moonX - moonR * 0.22, moonY - moonR * 0.10, moonR * 0.30, moonR * 0.22, 0.4, 0, 6.28); g.fill();
      g.beginPath(); g.ellipse(moonX + moonR * 0.26, moonY + moonR * 0.26, moonR * 0.18, moonR * 0.14, -0.3, 0, 6.28); g.fill();
    });

    function hills(baseY, amp, color, alpha) {
      c.save(); c.globalAlpha = alpha; c.fillStyle = color;
      c.beginPath();
      c.moveTo(-W * 0.05, H);
      for (var i = 0; i <= 8; i++) {
        var k = i / 8;
        var x = lerp(-W * 0.05, W * 1.05, k);
        var y = baseY - Math.sin(k * Math.PI * 1.6 + 0.5) * amp - Math.sin(k * Math.PI * 4.1) * amp * 0.2;
        c.lineTo(x, y);
      }
      c.lineTo(W * 1.05, H); c.closePath(); c.fill(); c.restore();
    }
    hills(H * 0.66, H * 0.05, '#152c33', 0.5);
    hills(H * 0.72, H * 0.032, '#0d1e22', 0.75);

    // 右侧楼阁剪影（模糊、低对比）
    soft(c, 9 * U, function (g) {
      g.fillStyle = 'rgba(7, 16, 20, 0.78)';
      var px = W * 0.74, py = H * 0.74, pw = W * 0.16, ph = H * 0.11;
      g.fillRect(px - pw * 0.14, py, pw * 1.3, ph * 0.2);
      for (var i = 0; i < 4; i++) g.fillRect(px + pw * (0.08 + i * 0.27), py - ph * 0.55, pw * 0.05, ph * 0.57);
      g.beginPath();
      g.moveTo(px - pw * 0.32, py - ph * 0.55);
      g.quadraticCurveTo(px + pw * 0.5, py - ph * 0.95, px + pw * 1.32, py - ph * 0.55);
      g.quadraticCurveTo(px + pw * 0.5, py - ph * 0.70, px - pw * 0.32, py - ph * 0.55);
      g.closePath(); g.fill();
      g.fillStyle = 'rgba(242, 174, 100, 0.5)';
      g.fillRect(px + pw * 0.40, py - ph * 0.34, pw * 0.10, ph * 0.12);
      g.fillRect(px + pw * 0.78, py - ph * 0.34, pw * 0.10, ph * 0.12);
    });

    for (var i = 0; i < 3; i++) {
      (function (idx) {
        var my = H * (0.62 + idx * 0.09);
        soft(c, 30 * U, function (g) {
          g.fillStyle = lg(g, 0, my - H * 0.06, 0, my + H * 0.06, [
            [0, 'rgba(188,218,230,0)'], [0.5, 'rgba(188,218,230,0.16)'], [1, 'rgba(188,218,230,0)']
          ]);
          g.fillRect(0, my - H * 0.06, W, H * 0.12);
        });
      }(i));
    }

    var groundY = H * 0.80;
    soft(c, 3 * U, function (g) {
      g.fillStyle = lg(g, 0, groundY, 0, H, [[0, 'rgba(16, 32, 38, 0.9)'], [1, 'rgba(3, 8, 12, 0.98)']]);
      g.beginPath();
      g.moveTo(-W * 0.05, H);
      g.lineTo(-W * 0.05, groundY + H * 0.02);
      g.quadraticCurveTo(W * 0.5, groundY - H * 0.02, W * 1.05, groundY + H * 0.02);
      g.lineTo(W * 1.05, H); g.closePath(); g.fill();
    });
    soft(c, 36 * U, function (g) {
      g.fillStyle = rg(g, W * 0.38, H * 0.92, 0, W * 0.42, [
        [0, 'rgba(170,208,222,0.18)'], [1, 'rgba(170,208,222,0)']
      ]);
      g.fillRect(0, groundY, W, H - groundY);
    });

    return o.cv;
  }

  // ---------------------------------------------------------------------------
  // 侧脸轮廓（面朝画面左侧）
  // ---------------------------------------------------------------------------
  function profilePath(c, fx, fy, fw, fh) {
    c.beginPath();
    c.moveTo(fx - fw * 0.13, fy + fh * 0.012);
    // 额
    c.bezierCurveTo(fx - fw * 0.27, fy + fh * 0.05, fx - fw * 0.335, fy + fh * 0.16, fx - fw * 0.315, fy + fh * 0.275);
    // 眉骨 → 鼻根
    c.bezierCurveTo(fx - fw * 0.305, fy + fh * 0.335, fx - fw * 0.275, fy + fh * 0.375, fx - fw * 0.295, fy + fh * 0.415);
    // 鼻梁
    c.bezierCurveTo(fx - fw * 0.355, fy + fh * 0.465, fx - fw * 0.435, fy + fh * 0.512, fx - fw * 0.428, fy + fh * 0.545);
    // 鼻头下缘
    c.bezierCurveTo(fx - fw * 0.408, fy + fh * 0.560, fx - fw * 0.383, fy + fh * 0.563, fx - fw * 0.372, fy + fh * 0.580);
    // 上唇
    c.bezierCurveTo(fx - fw * 0.400, fy + fh * 0.600, fx - fw * 0.410, fy + fh * 0.620, fx - fw * 0.378, fy + fh * 0.634);
    // 下唇
    c.bezierCurveTo(fx - fw * 0.408, fy + fh * 0.650, fx - fw * 0.408, fy + fh * 0.676, fx - fw * 0.368, fy + fh * 0.690);
    // 下巴
    c.bezierCurveTo(fx - fw * 0.358, fy + fh * 0.756, fx - fw * 0.300, fy + fh * 0.812, fx - fw * 0.200, fy + fh * 0.836);
    // 下颌 → 耳根
    c.bezierCurveTo(fx - fw * 0.020, fy + fh * 0.866, fx + fw * 0.175, fy + fh * 0.826, fx + fw * 0.290, fy + fh * 0.690);
    // 后脑
    c.bezierCurveTo(fx + fw * 0.430, fy + fh * 0.510, fx + fw * 0.410, fy + fh * 0.165, fx + fw * 0.185, fy + fh * 0.030);
    // 头顶
    c.bezierCurveTo(fx + fw * 0.050, fy - fh * 0.036, fx - fw * 0.040, fy - fh * 0.012, fx - fw * 0.130, fy + fh * 0.012);
    c.closePath();
  }

  function profileEdge(c, fx, fy, fw, fh) {
    c.beginPath();
    c.moveTo(fx - fw * 0.190, fy + fh * 0.020);
    c.bezierCurveTo(fx - fw * 0.270, fy + fh * 0.050, fx - fw * 0.335, fy + fh * 0.160, fx - fw * 0.315, fy + fh * 0.275);
    c.bezierCurveTo(fx - fw * 0.305, fy + fh * 0.335, fx - fw * 0.275, fy + fh * 0.375, fx - fw * 0.295, fy + fh * 0.415);
    c.bezierCurveTo(fx - fw * 0.355, fy + fh * 0.465, fx - fw * 0.435, fy + fh * 0.512, fx - fw * 0.428, fy + fh * 0.545);
    c.bezierCurveTo(fx - fw * 0.408, fy + fh * 0.560, fx - fw * 0.383, fy + fh * 0.563, fx - fw * 0.372, fy + fh * 0.580);
    c.bezierCurveTo(fx - fw * 0.400, fy + fh * 0.600, fx - fw * 0.410, fy + fh * 0.620, fx - fw * 0.378, fy + fh * 0.634);
    c.bezierCurveTo(fx - fw * 0.408, fy + fh * 0.650, fx - fw * 0.408, fy + fh * 0.676, fx - fw * 0.368, fy + fh * 0.690);
    c.bezierCurveTo(fx - fw * 0.358, fy + fh * 0.756, fx - fw * 0.300, fy + fh * 0.812, fx - fw * 0.200, fy + fh * 0.836);
  }

  // ---------------------------------------------------------------------------
  // 人物：湖边的汉服背影（按"头高"为单位量的全身比例 + 轮廓光）
  //   头 = 1 头高；肩宽 ≈ 1.5；腰 ≈ 0.9；裙摆 ≈ 2.0；全身 ≈ 7 头高。
  // ---------------------------------------------------------------------------
  function buildHero() {
    var o = mkCanvas(W, H), c = o.c;
    eyes.length = 0;

    var W_ = W, H_ = H;
    var hh = H_ * 0.105;              // 头高（设计单位）
    var hx = W_ * 0.615;              // 身体中轴
    var top = H_ * 0.150;             // 头顶
    var headCY = top + hh * 0.52;
    var hw = hh * 0.40;               // 头半宽
    var neckY = top + hh * 1.02;
    var shY = top + hh * 1.34;
    var shHalf = hh * 0.76;
    var waistY = top + hh * 2.72;
    var waistHalf = hh * 0.50;
    var hipY = top + hh * 3.45;
    var hemY = top + hh * 6.55;
    var hemHalf = hh * 1.16;

    // ---- 1. 长发（头顶 + 发髻 + 垂到腰）----
    soft(c, 5 * U, function (g) {
      g.fillStyle = lg(g, hx - hh * 0.5, top, hx + hh * 0.6, waistY, [
        [0, '#2b2432'], [0.30, '#151020'], [0.72, '#0a0710'], [1, '#050308']
      ]);
      g.beginPath();
      g.moveTo(hx - hw * 0.95, headCY + hh * 0.10);
      g.bezierCurveTo(hx - hw * 1.10, headCY - hh * 0.62, hx + hw * 1.05, headCY - hh * 0.66, hx + hw * 0.95, headCY + hh * 0.16);
      g.bezierCurveTo(hx + hw * 1.16, headCY + hh * 0.95, hx + hw * 1.30, hipY - hh * 0.20, hx + hw * 1.14, hemY - hh * 1.30);
      g.lineTo(hx - hw * 1.20, hemY - hh * 1.30);
      g.bezierCurveTo(hx - hw * 1.30, hipY - hh * 0.20, hx - hw * 1.14, headCY + hh * 0.90, hx - hw * 0.95, headCY + hh * 0.10);
      g.closePath(); g.fill();
      // 发髻
      g.beginPath(); g.ellipse(hx + hw * 0.06, top + hh * 0.10, hw * 0.66, hh * 0.20, -0.05, 0, 6.28); g.fill();
    });
    // 发丝
    c.save(); c.lineCap = 'round';
    for (var s = 0; s < 90; s++) {
      var ax = hx + hw * rand(-1.15, 1.10);
      var ay = headCY + hh * rand(-0.55, 0.55);
      var al = hh * rand(1.0, 3.0);
      c.strokeStyle = 'rgba(' + (s % 5 === 0 ? '170,144,162' : '9,7,13') + ',' + rand(0.05, 0.16).toFixed(3) + ')';
      c.lineWidth = rand(U * 0.8, U * 2.0);
      c.beginPath();
      c.moveTo(ax, ay);
      c.quadraticCurveTo(ax + rand(-hw * 0.2, hw * 0.2), ay + al * 0.55, ax + rand(-hw * 0.3, hw * 0.3), ay + al);
      c.stroke();
    }
    c.restore();
    // 发丝高光
    soft(c, 8 * U, function (g) {
      g.fillStyle = 'rgba(198, 168, 186, 0.26)';
      g.beginPath(); g.ellipse(hx - hw * 0.30, headCY - hh * 0.30, hw * 0.34, hh * 0.10, -0.30, 0, 6.28); g.fill();
      g.fillStyle = 'rgba(214, 186, 202, 0.14)';
      g.beginPath(); g.ellipse(hx + hw * 0.60, waistY - hh * 0.6, hw * 0.12, hh * 1.1, 0.05, 0, 6.28); g.fill();
    });

    // ---- 2. 身体（交领上襦 + 齐胸/高腰裙，整体剪影）----
    soft(c, 3 * U, function (g) {
      g.fillStyle = lg(g, hx - shHalf, shY, hx + shHalf * 1.4, hemY, [
        [0, '#a33844'], [0.18, '#7a2029'], [0.52, P.robe], [0.82, '#360d15'], [1, '#1e050b']
      ]);
      g.beginPath();
      // 左肩 → 左袖根 → 左腰 → 左裙摆
      g.moveTo(hx - hw * 0.62, neckY - hh * 0.05);
      g.bezierCurveTo(hx - shHalf * 0.92, shY - hh * 0.06, hx - shHalf, shY + hh * 0.10, hx - shHalf * 0.96, shY + hh * 0.42);
      g.bezierCurveTo(hx - shHalf * 0.86, waistY - hh * 0.30, hx - waistHalf * 1.10, waistY, hx - waistHalf, waistY + hh * 0.05);
      g.bezierCurveTo(hx - waistHalf * 1.30, hipY, hx - hemHalf * 0.86, hemY - hh * 0.60, hx - hemHalf, hemY);
      g.lineTo(hx + hemHalf, hemY);
      g.bezierCurveTo(hx + hemHalf * 0.86, hemY - hh * 0.60, hx + waistHalf * 1.30, hipY, hx + waistHalf, waistY + hh * 0.05);
      g.bezierCurveTo(hx + waistHalf * 1.10, waistY, hx + shHalf * 0.86, waistY - hh * 0.30, hx + shHalf * 0.96, shY + hh * 0.42);
      g.bezierCurveTo(hx + shHalf, shY + hh * 0.10, hx + shHalf * 0.92, shY - hh * 0.06, hx + hw * 0.62, neckY - hh * 0.05);
      g.closePath();
      g.fill();
    });
    // 衣褶：暗部
    soft(c, 10 * U, function (g) {
      g.fillStyle = 'rgba(24, 5, 9, 0.40)';
      g.beginPath();
      g.moveTo(hx + hw * 0.10, shY + hh * 0.30);
      g.bezierCurveTo(hx + waistHalf * 0.90, waistY, hx + hemHalf * 0.50, hemY - hh * 0.50, hx + hemHalf * 0.62, hemY);
      g.lineTo(hx + hemHalf * 1.10, hemY);
      g.bezierCurveTo(hx + hemHalf * 0.86, hemY - hh * 0.60, hx + waistHalf * 1.20, waistY, hx + hw * 0.52, shY + hh * 0.30);
      g.closePath(); g.fill();
    });
    // 衣褶：亮部（月光侧）
    soft(c, 12 * U, function (g) {
      g.fillStyle = 'rgba(238, 152, 138, 0.22)';
      g.beginPath();
      g.moveTo(hx - hw * 0.60, shY + hh * 0.20);
      g.bezierCurveTo(hx - waistHalf * 1.00, waistY, hx - hemHalf * 0.62, hemY - hh * 0.40, hx - hemHalf * 0.78, hemY);
      g.lineTo(hx - hemHalf * 0.30, hemY);
      g.bezierCurveTo(hx - waistHalf * 0.60, waistY, hx - hw * 0.20, shY + hh * 0.30, hx - hw * 0.30, shY + hh * 0.20);
      g.closePath(); g.fill();
    });
    // 裙褶线
    c.save(); c.lineCap = 'round';
    for (var i = 0; i < 9; i++) {
      var k = i / 8;
      var x0 = lerp(hx - waistHalf * 0.90, hx + waistHalf * 0.90, k);
      var x1 = lerp(hx - hemHalf * 0.92, hx + hemHalf * 0.92, k);
      c.strokeStyle = 'rgba(20, 4, 8, ' + (0.26 - Math.abs(k - 0.5) * 0.12).toFixed(2) + ')';
      c.lineWidth = U * (2.0 - Math.abs(k - 0.5) * 1.2);
      c.beginPath();
      c.moveTo(x0, waistY + hh * 0.10);
      c.quadraticCurveTo((x0 + x1) / 2, (waistY + hemY) / 2, x1, hemY - hh * 0.05);
      c.stroke();
    }
    c.restore();

    // ---- 3. 腰带（高腰襦裙的系带）----
    soft(c, 2.5 * U, function (g) {
      g.fillStyle = lg(g, hx - waistHalf, waistY - hh * 0.16, hx + waistHalf, waistY + hh * 0.16, [
        [0, '#3c0e16'], [0.45, '#5a1620'], [1, '#25070d']
      ]);
      g.beginPath();
      g.moveTo(hx - waistHalf * 1.02, waistY - hh * 0.14);
      g.quadraticCurveTo(hx, waistY - hh * 0.06, hx + waistHalf * 1.02, waistY - hh * 0.14);
      g.lineTo(hx + waistHalf * 1.04, waistY + hh * 0.10);
      g.quadraticCurveTo(hx, waistY + hh * 0.18, hx - waistHalf * 1.04, waistY + hh * 0.10);
      g.closePath(); g.fill();
    });
    // 垂下来的系带
    c.save();
    c.strokeStyle = 'rgba(160, 48, 54, 0.85)';
    c.lineWidth = U * 4.4;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(hx + waistHalf * 0.20, waistY + hh * 0.10);
    c.quadraticCurveTo(hx + waistHalf * 0.34, waistY + hh * 0.70, hx + waistHalf * 0.16, waistY + hh * 1.30);
    c.stroke();
    c.beginPath();
    c.moveTo(hx + waistHalf * 0.02, waistY + hh * 0.12);
    c.quadraticCurveTo(hx - waistHalf * 0.10, waistY + hh * 0.80, hx - waistHalf * 0.24, waistY + hh * 1.40);
    c.stroke();
    c.restore();

    // ---- 4. 交领（领口一横一斜，交代"汉服"）----
    soft(c, 2 * U, function (g) {
      g.fillStyle = 'rgba(244, 238, 224, 0.92)';
      g.beginPath();
      g.moveTo(hx - hw * 0.52, neckY - hh * 0.02);
      g.quadraticCurveTo(hx, neckY + hh * 0.22, hx + hw * 0.52, neckY - hh * 0.02);
      g.lineTo(hx + hw * 0.40, neckY + hh * 0.06);
      g.quadraticCurveTo(hx, neckY + hh * 0.30, hx - hw * 0.40, neckY + hh * 0.06);
      g.closePath(); g.fill();
      // 深色领缘
      g.strokeStyle = 'rgba(60, 14, 20, 0.9)';
      g.lineWidth = U * 5;
      g.beginPath();
      g.moveTo(hx - hw * 0.56, neckY - hh * 0.04);
      g.quadraticCurveTo(hx, neckY + hh * 0.26, hx + hw * 0.56, neckY - hh * 0.04);
      g.stroke();
    });

    // ---- 5. 广袖（两侧垂坠，袖口在腰下）----
    function sleeve(g, side) {
      var sx = hx + side * shHalf * 0.94;
      g.beginPath();
      g.moveTo(sx - side * hw * 0.30, shY - hh * 0.10);
      g.bezierCurveTo(sx + side * shHalf * 0.44, shY + hh * 0.30,
        sx + side * shHalf * 0.52, waistY + hh * 0.30,
        sx + side * shHalf * 0.40, hipY + hh * 0.40);
      g.bezierCurveTo(sx + side * shHalf * 0.18, hipY + hh * 0.10,
        sx - side * shHalf * 0.02, waistY, sx - side * hw * 0.34, shY + hh * 0.10);
      g.closePath();
      g.fillStyle = side < 0
        ? lg(g, sx - shHalf * 0.4, shY, sx + shHalf * 0.5, hipY, [
          [0, '#a83a44'], [0.5, '#6c1b25'], [1, '#2a0810']
        ])
        : lg(g, sx - shHalf * 0.5, shY, sx + shHalf * 0.4, hipY, [
          [0, '#5c1622'], [0.6, '#370c14'], [1, '#1c050a']
        ]);
      g.fill();
    }
    soft(c, 3 * U, function (g) { sleeve(g, -1); });
    soft(c, 3 * U, function (g) { sleeve(g, 1); });

    // ---- 6. 团扇（右手侧，垂在袖边）----
    var fanX = hx + shHalf * 1.78, fanY = hipY + hh * 1.05, fanR = hh * 0.70;
    c.save();
    c.translate(fanX, fanY);
    c.rotate(0.26);
    c.strokeStyle = '#3f2c1c';
    c.lineWidth = U * 4;
    c.lineCap = 'round';
    c.beginPath(); c.moveTo(0, fanR * 0.88); c.lineTo(0, fanR * 1.50); c.stroke();
    soft(c, 2 * U, function (g) {
      g.fillStyle = rg(g, -fanR * 0.3, -fanR * 0.35, 0, fanR * 1.15, [
        [0, 'rgba(252, 250, 244, 0.98)'], [0.62, 'rgba(230, 224, 208, 0.96)'], [1, 'rgba(186, 180, 162, 0.94)']
      ]);
      g.beginPath(); g.arc(0, 0, fanR, 0, 6.28); g.fill();
      g.strokeStyle = 'rgba(84, 68, 54, 0.5)';
      g.lineWidth = U * 2;
      g.beginPath();
      g.moveTo(-fanR * 0.60, fanR * 0.30);
      g.quadraticCurveTo(-fanR * 0.05, fanR * 0.02, fanR * 0.55, -fanR * 0.34);
      g.stroke();
      g.fillStyle = 'rgba(198, 84, 96, 0.7)';
      for (var f = 0; f < 8; f++) {
        var fa = rand(0, 6.28), fr = rand(fanR * 0.14, fanR * 0.60);
        g.beginPath(); g.arc(Math.cos(fa) * fr, Math.sin(fa) * fr * 0.78, U * rand(2.0, 3.6), 0, 6.28); g.fill();
      }
      g.strokeStyle = 'rgba(214, 166, 96, 0.9)';
      g.lineWidth = U * 2.2;
      g.beginPath(); g.arc(0, 0, fanR - U * 1.4, 0, 6.28); g.stroke();
    });
    c.strokeStyle = 'rgba(178, 52, 58, 0.85)';
    c.lineWidth = U * 1.8;
    for (var ts = 0; ts < 6; ts++) {
      c.beginPath();
      c.moveTo(-U * 5 + ts * U * 2.0, fanR * 1.46);
      c.quadraticCurveTo(-U * 7 + ts * U * 2.4, fanR * 1.66, -U * 9 + ts * U * 2.8, fanR * 1.82);
      c.stroke();
    }
    c.restore();

    // ---- 7. 轮廓光（月光在左，暖灯在右）----
    soft(c, 3 * U, function (g) {
      g.lineCap = 'round';
      g.strokeStyle = 'rgba(214, 242, 252, 0.60)';
      g.lineWidth = U * 2.6;
      // 头发左缘
      g.beginPath();
      g.moveTo(hx - hw * 0.62, headCY - hh * 0.58);
      g.bezierCurveTo(hx - hw * 1.14, headCY - hh * 0.30, hx - hw * 1.20, headCY + hh * 0.60, hx - hw * 1.10, hipY);
      g.stroke();
      // 左肩 → 左袖
      g.beginPath();
      g.moveTo(hx - hw * 0.66, neckY - hh * 0.10);
      g.bezierCurveTo(hx - shHalf * 0.94, shY - hh * 0.06, hx - shHalf, shY + hh * 0.20, hx - shHalf * 1.34, hipY + hh * 0.40);
      g.stroke();
      // 裙摆左缘
      g.strokeStyle = 'rgba(206, 236, 248, 0.42)';
      g.beginPath();
      g.moveTo(hx - waistHalf * 1.06, waistY);
      g.bezierCurveTo(hx - hemHalf * 0.86, hemY - hh * 0.60, hx - hemHalf * 0.98, hemY - hh * 0.20, hx - hemHalf, hemY);
      g.stroke();
      // 右缘暖光
      g.strokeStyle = 'rgba(246, 188, 122, 0.50)';
      g.lineWidth = U * 2.2;
      g.beginPath();
      g.moveTo(hx + hw * 0.66, neckY - hh * 0.10);
      g.bezierCurveTo(hx + shHalf * 0.96, shY - hh * 0.04, hx + shHalf * 1.02, shY + hh * 0.22, hx + shHalf * 1.34, hipY + hh * 0.40);
      g.stroke();
      g.beginPath();
      g.moveTo(hx + waistHalf * 1.06, waistY);
      g.bezierCurveTo(hx + hemHalf * 0.86, hemY - hh * 0.60, hx + hemHalf * 0.98, hemY - hh * 0.20, hx + hemHalf, hemY);
      g.stroke();
    });

    // ---- 8. 发带与步摇（背影的细节）----
    soft(c, 2 * U, function (g) {
      g.strokeStyle = 'rgba(178, 50, 56, 0.9)';
      g.lineWidth = U * 5;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(hx + hw * 0.10, top + hh * 0.06);
      g.quadraticCurveTo(hx + hw * 0.80, top - hh * 0.02, hx + hw * 1.10, top + hh * 0.30);
      g.stroke();
      g.lineWidth = U * 3.4;
      g.beginPath();
      g.moveTo(hx + hw * 0.92, top + hh * 0.18);
      g.bezierCurveTo(hx + hw * 1.50, top + hh * 0.34, hx + hw * 1.80, top + hh * 0.70, hx + hw * 2.10, top + hh * 0.58);
      g.stroke();
      // 步摇
      g.fillStyle = 'rgba(240, 206, 138, 0.95)';
      g.beginPath(); g.ellipse(hx + hw * 0.62, top + hh * 0.02, U * 9, U * 3.6, 0.36, 0, 6.28); g.fill();
      g.strokeStyle = 'rgba(232, 188, 114, 0.9)';
      g.lineWidth = U * 1.6;
      g.beginPath(); g.moveTo(hx + hw * 0.62, top + hh * 0.02); g.lineTo(hx + hw * 0.72, top + hh * 0.34); g.stroke();
      for (var i2 = 0; i2 < 3; i2++) {
        g.fillStyle = 'rgba(246, 222, 170, 0.9)';
        g.beginPath(); g.arc(hx + hw * 0.72 + i2 * U * 2.6, top + hh * (0.38 + i2 * 0.10), U * 2.6, 0, 6.28); g.fill();
      }
    });

    // 脚下接触阴影（别让她像浮在空中）
    soft(c, 8 * U, function (g) {
      g.fillStyle = 'rgba(4, 8, 10, 0.55)';
      g.beginPath();
      g.ellipse(hx, hemY - hh * 0.05, hemHalf * 1.15, hh * 0.22, 0, 0, 6.28);
      g.fill();
    });

    return o.cv;
  }
  // ---------------------------------------------------------------------------
  // 前景虚化
  // ---------------------------------------------------------------------------
  function buildFore() {
    var o = mkCanvas(W, H), c = o.c;
    soft(c, 22 * U, function (g) {
      g.strokeStyle = 'rgba(12, 10, 14, 0.9)';
      g.lineWidth = U * 20;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(-W * 0.08, H * 1.04);
      g.bezierCurveTo(W * 0.06, H * 0.92, W * 0.10, H * 0.84, W * 0.17, H * 0.78);
      g.stroke();
      g.fillStyle = 'rgba(218, 132, 140, 0.65)';
      for (var i = 0; i < 10; i++) {
        g.beginPath();
        g.arc(W * rand(0.00, 0.19), H * rand(0.78, 1.0), U * rand(6, 14), 0, 6.28);
        g.fill();
      }
    });
    soft(c, 30 * U, function (g) {
      g.strokeStyle = 'rgba(8, 14, 18, 0.45)';
      g.lineWidth = U * 15;
      g.beginPath();
      g.moveTo(W * 1.06, -H * 0.05);
      g.bezierCurveTo(W * 0.95, H * 0.05, W * 0.92, H * 0.12, W * 0.86, H * 0.18);
      g.stroke();
    });
    return o.cv;
  }

  // ---------------------------------------------------------------------------
  function layout() {
    U = H / 720;
    cx = W * 0.525;
    headTop = H * 0.100;
    faceH = H * 0.200;        // 头高（背影里作为头发体积的基准）
    faceW = H * 0.145;
    chinY = headTop + faceH;
    neckY = chinY + faceH * 0.10;
    shY = H * 0.330;
    shHalf = W * 0.105;
    waistY = H * 0.560;

    bokeh.length = 0;
    for (var i = 0; i < 24; i++) {
      bokeh.push({
        x: rand(-W * 0.05, W * 1.05), y: rand(H * 0.04, H * 0.86),
        r: rand(H * 0.010, H * 0.050), a: rand(0.07, 0.34),
        warm: Math.random() < 0.5, ph: rand(0, 6.28)
      });
    }
    bokeh.push({ x: W * 0.90, y: H * 0.42, r: H * 0.085, a: 0.5, warm: true, ph: 1.2 });

    petals.length = 0;
    for (var j = 0; j < 18; j++) {
      petals.push({
        x: rand(-W * 0.1, W * 1.1), y: rand(-H * 0.2, H),
        r: rand(U * 3, U * 7), vy: rand(H * 0.018, H * 0.048), vx: rand(-W * 0.012, W * 0.02),
        rot: rand(0, 6.28), vr: rand(-1.5, 1.5), a: rand(0.20, 0.5)
      });
    }
    flyaway.length = 0;
    for (var k = 0; k < 8; k++) {
      // 只落在头发区域（脸的右侧/上方），别飘到脸上
      flyaway.push({
        x: cx + faceW * rand(0.16, 0.62),
        y: headTop + faceH * rand(-0.24, 0.10),
        len: faceH * rand(0.18, 0.42),
        ph: rand(0, 6.28), dir: rand(-1, 1)
      });
    }
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    W = Math.max(320, window.innerWidth);
    H = Math.max(240, window.innerHeight);
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = 'round';

    makeSprites();
    layout();
    far = buildFar();
    hero = buildHero();
    fore = buildFore();
    warmup(24);
  }

  // ---------------------------------------------------------------------------
  function drawBokeh() {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < bokeh.length; i++) {
      var b = bokeh[i];
      var x = b.x + Math.sin(t * 0.11 + b.ph) * W * 0.005;
      var y = b.y + Math.cos(t * 0.08 + b.ph) * H * 0.004;
      ctx.globalAlpha = b.a * (0.80 + 0.20 * Math.sin(t * 0.6 + b.ph));
      ctx.drawImage(b.warm ? warmSprite : bokehSprite, x - b.r, y - b.r, b.r * 2, b.r * 2);
    }
    ctx.restore();
  }

  function drawPetals() {
    ctx.save();
    for (var i = 0; i < petals.length; i++) {
      var p = petals[i];
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = p.a;
      var g = ctx.createLinearGradient(-p.r, -p.r, p.r, p.r);
      g.addColorStop(0, 'rgba(248, 212, 214, 0.95)');
      g.addColorStop(1, 'rgba(204, 128, 138, 0.8)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, 0, p.r, p.r * 0.52, 0, 0, 6.2832);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  function drawBlink() {
    if (blink.amount <= 0.02) { return; }
    var k = blink.amount;
    ctx.save();
    for (var i = 0; i < eyes.length; i++) {
      var e = eyes[i];
      ctx.fillStyle = 'rgba(228, 178, 154, 1)';
      ctx.beginPath();
      ctx.ellipse(e.x, e.y, e.w * 1.12, e.h * 1.35 * k, -0.06, 0, 6.2832);
      ctx.fill();
      ctx.strokeStyle = 'rgba(22, 15, 15, ' + (0.9 * k).toFixed(2) + ')';
      ctx.lineWidth = U * 3.0;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(e.x - e.w * 1.02, e.y + e.h * 0.05);
      ctx.quadraticCurveTo(e.x, e.y + e.h * 0.9 * k, e.x + e.w * 1.02, e.y - e.h * 0.05);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawFlyaway() {
    ctx.save();
    ctx.lineCap = 'round';
    for (var i = 0; i < flyaway.length; i++) {
      var f = flyaway[i];
      var sw = Math.sin(t * 0.85 + f.ph) * U * 8;
      ctx.strokeStyle = 'rgba(16, 12, 20, 0.45)';
      ctx.lineWidth = U * 1.2;
      ctx.beginPath();
      ctx.moveTo(f.x, f.y);
      ctx.quadraticCurveTo(f.x + f.dir * U * 14 + sw * 0.5, f.y + f.len * 0.5,
        f.x + f.dir * U * 30 + sw, f.y + f.len);
      ctx.stroke();
    }
    ctx.restore();
  }

  function draw() {
    var camX = Math.sin(t * 0.10) * W * 0.0022;
    var camY = Math.cos(t * 0.08) * H * 0.0016;

    ctx.save();
    ctx.translate(camX, camY);

    ctx.drawImage(far, 0, 0, W, H);
    drawBokeh();

    // 呼吸（极小的位移与缩放，避免立绘"死板"）
    var breath = Math.sin(t * 0.80) * U * 1.8;
    var scale = 1 + Math.sin(t * 0.80) * 0.0016;
    ctx.save();
    ctx.translate(cx, shY);
    ctx.scale(scale, scale);
    ctx.translate(-cx, -shY + breath);
    ctx.drawImage(hero, 0, 0, W, H);
    drawFlyaway();
    drawBlink();
    ctx.restore();

    drawPetals();
    ctx.drawImage(fore, 0, 0, W, H);
    ctx.restore();

    // 色调分级（暗部偏青、亮部偏暖）
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = rg(ctx, W * 0.42, H * 0.40, 0, Math.max(W, H) * 0.80, [
      [0, 'rgba(118, 188, 208, 0.16)'], [1, 'rgba(8, 16, 26, 0.32)']
    ]);
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    // 暗角
    ctx.save();
    ctx.fillStyle = rg(ctx, W * 0.46, H * 0.42, Math.min(W, H) * 0.30, Math.max(W, H) * 0.86, [
      [0, 'rgba(0,0,0,0)'], [1, 'rgba(2, 6, 10, 0.62)']
    ]);
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    // 胶片颗粒
    if (grain) {
      ctx.save();
      ctx.globalAlpha = 0.42;
      ctx.globalCompositeOperation = 'overlay';
      ctx.fillStyle = ctx.createPattern(grain, 'repeat');
      ctx.translate((t * 31) % 160, (t * 47) % 160);
      ctx.fillRect(-160, -160, W + 320, H + 320);
      ctx.restore();
    }
  }

  function advance(dt) {
    t += dt;
    for (var i = 0; i < petals.length; i++) {
      var p = petals[i];
      p.y += p.vy * dt;
      p.x += (p.vx + Math.sin(t * 0.55 + i) * W * 0.005) * dt;
      p.rot += p.vr * dt;
      if (p.y > H * 1.08) { p.y = -H * 0.08; p.x = rand(-W * 0.1, W * 1.1); }
      if (p.x < -W * 0.15) { p.x = W * 1.12; }
      if (p.x > W * 1.15) { p.x = -W * 0.12; }
    }
    blink.wait -= dt;
    if (blink.wait <= 0) { blink.phase = 0.20; blink.wait = rand(2.8, 6.2); }
    if (blink.phase > 0) {
      blink.phase -= dt;
      blink.amount = clamp(1 - Math.abs(blink.phase - 0.10) / 0.10, 0, 1);
    } else { blink.amount = 0; }
  }

  function warmup(frames) {
    var dt = 1 / 30;
    for (var i = 0; i < frames; i++) { advance(dt); draw(); }
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

  function start() { if (!rafId) { last = 0; rafId = window.requestAnimationFrame(frame); } }
  function stop() { if (rafId) { window.cancelAnimationFrame(rafId); rafId = 0; } }

  window.addEventListener('resize', function () {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(resize, 200);
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { stop(); } else { start(); }
  });

  resize();
  start();
}());
