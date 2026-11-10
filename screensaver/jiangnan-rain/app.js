/* 江南烟雨 —— 白墙黛瓦的临水民居、石拱桥、乌篷船、垂柳与细雨
 *
 * 构图（正面望向对岸的水乡街景）：
 *   天空（淡墨远山、几点飞鸟、薄雾）
 *   → 后排屋脊（小、淡）
 *   → 前排白墙黛瓦民居（主体，沿河岸排开，带马头墙与檐下灯笼）
 *   → 河岸石埠头与石阶
 *   → 右侧一座石拱桥跨在水口
 *   → 下半部水面：整幅镜像倒影（快速衰减）+ 波纹 + 雨点涟漪 + 灯影光带 + 漂叶
 *   → 近景乌篷船缓缓划过，左上垂柳，右上淡墨诗句
 *
 * 动效：细雨斜落、水面涟漪、薄雾横向漂移、垂柳轻摆、船缓慢移动、灯笼呼吸、飞鸟掠过。
 * 性能：静态场景（天/山/屋/桥/岸）只画一次进离屏缓存；每帧只做倒影切片、雨、雾、柳、船。
 */
(function () {
  'use strict';

  var canvas = document.getElementById('scene');
  var ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) { return; }

  var MAX_DPR = 2;

  // 配色：冷灰绿 + 白墙米白 + 深墨瓦；暖色只有灯笼与印章
  var C = {
    skyTop: '#F7F9F5',
    skyMid: '#ECF1EA',
    skyLow: '#DFE8E1',
    hill: '#C4D0C7',
    hillFar: '#D7DFD8',
    wall: '#EFEBDE',
    wallShade: '#DBD6C7',
    tile: '#4E5551',
    tileDark: '#333A36',
    stone: '#C3BFB2',
    stoneDark: '#8B887C',
    quay: '#B9B5A7',
    ink: '#2A312D',
    waterTop: '#B7C5BD',
    waterBottom: '#6E827A',
    lantern: '#E08A46',
    seal: '#B5442F'
  };

  var W = 1, H = 1, dpr = 1;
  var waterY = 0;      // 河岸石沿（民居墙脚线）
  var quayH = 0;       // 河岸石台高度
  var waterStart = 0;  // 水面起点

  var upper = null;   // 静态上半场景
  var refl = null;    // 已镜像好的倒影层
  var glow = null;    // 预渲染光晕 sprite

  var rain = [];
  var ripples = [];
  var mists = [];
  var lanterns = [];
  var willows = [];
  var leaves = [];
  var birds = [];
  var boat = { x: 0, y: 0, w: 0, phase: 0, speed: 0 };

  var t = 0;
  var rafId = 0;
  var last = 0;
  var resizeTimer = 0;

  // 稳定随机：场景只建一次，但每次启动构图一致
  var seed = 20251110;
  function srand() {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  }
  function srange(a, b) { return a + srand() * (b - a); }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, k) { return a + (b - a) * k; }

  // ---------------------------------------------------------------------------
  // 光晕 sprite（灯笼用；比每帧 shadowBlur 快得多）
  // ---------------------------------------------------------------------------
  function makeGlow() {
    var size = 128;
    var cv = document.createElement('canvas');
    cv.width = size; cv.height = size;
    var g = cv.getContext('2d');
    var rg = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    rg.addColorStop(0, 'rgba(255, 240, 208, 0.95)');
    rg.addColorStop(0.22, 'rgba(255, 214, 150, 0.48)');
    rg.addColorStop(0.55, 'rgba(238, 168, 108, 0.14)');
    rg.addColorStop(1, 'rgba(238, 168, 108, 0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, size, size);
    return cv;
  }

  function drawGlow(x, y, r, alpha) {
    if (!glow) { return; }
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha;
    ctx.drawImage(glow, x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // ---------------------------------------------------------------------------
  // 一栋临水民居（正面看：坡瓦顶 + 白墙 + 暗门窗，可选马头墙与檐下灯笼）
  // pal: 0=前排（浓） 1=后排（淡）
  // ---------------------------------------------------------------------------
  function drawHouse(c, x, baseY, w, h, pal, opts) {
    opts = opts || {};
    var wallTop = baseY - h;
    var ridgeH = h * 0.19;
    var ov = w * 0.065;                // 檐口出挑

    // 墙体
    var wg = c.createLinearGradient(0, wallTop, 0, baseY);
    if (pal > 0.5) {
      wg.addColorStop(0, 'rgba(247, 244, 234, 0.90)');
      wg.addColorStop(1, 'rgba(230, 226, 213, 0.90)');
    } else {
      wg.addColorStop(0, C.wall);
      wg.addColorStop(1, C.wallShade);
    }
    c.fillStyle = wg;
    c.fillRect(x, wallTop, w, h);

    // 左右墙界：一条很淡的竖线，让并排的房子不糊成一整面墙
    var edgeW = Math.max(1, w * 0.014);
    c.fillStyle = 'rgba(86, 92, 82, 0.16)';
    c.fillRect(x, wallTop, edgeW, h);
    c.fillRect(x + w - edgeW, wallTop, edgeW, h);

    // 墙上的雨痕（几道很淡的竖向水渍）
    if (w > 40 && pal < 0.5) {
      c.strokeStyle = 'rgba(120, 124, 112, 0.10)';
      c.lineWidth = Math.max(1, w * 0.012);
      var stains = 2;
      for (var st = 0; st < stains; st++) {
        var sx = x + w * (0.28 + st * 0.34);
        c.beginPath();
        c.moveTo(sx, wallTop + h * 0.06);
        c.lineTo(sx, baseY - h * 0.10);
        c.stroke();
      }
    }

    // 石砌墙裙（江南民居墙脚一道青石，雨后更深）
    var skirtH = h * 0.105;
    c.fillStyle = pal > 0.5 ? 'rgba(168, 168, 156, 0.34)' : 'rgba(150, 150, 138, 0.46)';
    c.fillRect(x, baseY - skirtH, w, skirtH);
    c.fillStyle = 'rgba(74, 84, 76, ' + (pal > 0.5 ? 0.08 : 0.14) + ')';
    c.fillRect(x, baseY - skirtH * 0.26, w, skirtH * 0.26);
    if (w > 40) {
      c.strokeStyle = 'rgba(96, 100, 90, 0.16)';
      c.lineWidth = 1;
      for (var sk = 1; sk <= 2; sk++) {
        var sy2 = baseY - skirtH * (sk / 3);
        c.beginPath();
        c.moveTo(x, sy2);
        c.lineTo(x + w, sy2);
        c.stroke();
      }
    }

    // 马头墙（阶梯状封火墙，画在瓦顶之前，瓦顶会压住它的根部）
    if (opts.gable && w > 44) {
      var gw = w * 0.17, gh = h * 0.115;
      var gL = x - gw * 0.62, gR = x + w - gw * 0.38;
      c.fillStyle = pal > 0.5 ? 'rgba(243, 240, 230, 0.92)' : C.wall;
      c.fillRect(gL, wallTop - gh * 0.92, gw, gh * 0.92);
      c.fillRect(gR, wallTop - gh * 0.92, gw, gh * 0.92);
      c.fillStyle = pal > 0.5 ? 'rgba(80, 87, 83, 0.60)' : C.tileDark;
      c.fillRect(gL - gw * 0.10, wallTop - gh * 1.04, gw * 1.20, gh * 0.14);
      c.fillRect(gR - gw * 0.10, wallTop - gh * 1.04, gw * 1.20, gh * 0.14);
    }

    // 坡瓦顶
    c.beginPath();
    c.moveTo(x - ov, wallTop + h * 0.015);
    c.lineTo(x + w * 0.16, wallTop - ridgeH);
    c.lineTo(x + w * 0.84, wallTop - ridgeH);
    c.lineTo(x + w + ov, wallTop + h * 0.015);
    c.closePath();
    c.fillStyle = pal > 0.5 ? 'rgba(80, 87, 83, 0.66)' : C.tile;
    c.fill();

    // 屋脊
    c.strokeStyle = pal > 0.5 ? 'rgba(44, 51, 47, 0.50)' : C.tileDark;
    c.lineWidth = Math.max(1.2, h * 0.024);
    c.beginPath();
    c.moveTo(x + w * 0.13, wallTop - ridgeH);
    c.lineTo(x + w * 0.87, wallTop - ridgeH);
    c.stroke();

    // 瓦垄
    if (w > 24) {
      c.strokeStyle = 'rgba(30, 36, 32, ' + (pal > 0.5 ? 0.12 : 0.24) + ')';
      c.lineWidth = Math.max(0.6, w * 0.004);
      var n = Math.max(3, Math.round(w / 20));
      for (var i = 1; i < n; i++) {
        var k = i / n;
        var bx = lerp(x + w * 0.16, x + w * 0.84, k);
        c.beginPath();
        c.moveTo(lerp(x - ov * 0.5, bx, 0.6), wallTop - ridgeH * 0.42);
        c.lineTo(lerp(x + ov * 0.15, bx, 0.03), wallTop + h * 0.012);
        c.stroke();
      }
    }

    // 檐口阴影
    c.fillStyle = 'rgba(34, 40, 36, ' + (pal > 0.5 ? 0.14 : 0.28) + ')';
    c.fillRect(x - ov * 0.8, wallTop + h * 0.008, w + ov * 1.6, Math.max(1.2, h * 0.018));

    // 檐角上翘（中式屋檐的关键特征）
    if (w > 30) {
      var curl = h * 0.055;
      c.strokeStyle = pal > 0.5 ? 'rgba(52, 60, 55, 0.55)' : C.tileDark;
      c.lineWidth = Math.max(1.2, h * 0.020);
      c.beginPath();
      c.moveTo(x - ov * 0.95, wallTop + h * 0.020);
      c.quadraticCurveTo(x - ov * 1.45, wallTop - curl * 0.2, x - ov * 1.55, wallTop - curl);
      c.moveTo(x + w + ov * 0.95, wallTop + h * 0.020);
      c.quadraticCurveTo(x + w + ov * 1.45, wallTop - curl * 0.2, x + w + ov * 1.55, wallTop - curl);
      c.stroke();
      // 屋脊两端的翘角
      c.beginPath();
      c.moveTo(x + w * 0.13, wallTop - ridgeH);
      c.quadraticCurveTo(x + w * 0.06, wallTop - ridgeH - h * 0.012, x + w * 0.045, wallTop - ridgeH - h * 0.045);
      c.moveTo(x + w * 0.87, wallTop - ridgeH);
      c.quadraticCurveTo(x + w * 0.94, wallTop - ridgeH - h * 0.012, x + w * 0.955, wallTop - ridgeH - h * 0.045);
      c.stroke();
    }

    // 檐下投影：瓦顶压在墙上的一道柔影，避免大面白墙发空
    if (w > 24) {
      var shH = h * 0.13;
      var sh = c.createLinearGradient(0, wallTop, 0, wallTop + shH);
      sh.addColorStop(0, 'rgba(46, 54, 48, ' + (pal > 0.5 ? 0.10 : 0.20) + ')');
      sh.addColorStop(1, 'rgba(46, 54, 48, 0)');
      c.fillStyle = sh;
      c.fillRect(x, wallTop, w, shH);
    }

    // 门窗：高一点的房子排两排窗，矮的只排一排
    if (w > 26) {
      var winW = w * 0.140, winH = h * 0.112;
      var twoRows = h > H * 0.255;
      var rowY = twoRows ? [0.155, 0.395] : [0.235];
      for (var ri = 0; ri < rowY.length; ri++) {
        var winY = wallTop + h * rowY[ri];
        var wins = w > 86 ? 2 : 1;
        for (var wi = 0; wi < wins; wi++) {
          var wx = x + w * (wins === 1 ? 0.44 : (0.19 + wi * 0.36));
          // 窗套
          c.fillStyle = pal > 0.5 ? 'rgba(214, 208, 190, 0.30)' : 'rgba(226, 220, 202, 0.45)';
          c.fillRect(wx - winW * 0.12, winY - winH * 0.12, winW * 1.24, winH * 1.24);
          c.fillStyle = 'rgba(28, 34, 30, ' + (pal > 0.5 ? 0.46 : 0.84) + ')';
          c.fillRect(wx, winY, winW, winH);
          // 窗台
          c.fillStyle = 'rgba(214, 208, 190, ' + (pal > 0.5 ? 0.26 : 0.44) + ')';
          c.fillRect(wx - winW * 0.10, winY + winH, winW * 1.20, Math.max(1, winH * 0.10));
          if (w > 52) {
            c.strokeStyle = 'rgba(228, 222, 204, ' + (pal > 0.5 ? 0.24 : 0.46) + ')';
            c.lineWidth = Math.max(0.6, w * 0.004);
            c.beginPath();
            c.moveTo(wx + winW / 2, winY);
            c.lineTo(wx + winW / 2, winY + winH);
            c.moveTo(wx, winY + winH * 0.42);
            c.lineTo(wx + winW, winY + winH * 0.42);
            c.moveTo(wx, winY + winH * 0.72);
            c.lineTo(wx + winW, winY + winH * 0.72);
            c.stroke();
          }
        }
      }

      // 门：门套 + 木门 + 门槛（只给部分房子，免得一排水边全是黑门洞）
      if (opts.door) {
        var dw = w * 0.115, dh = h * 0.200;
        var dx = x + w * 0.33;
        c.fillStyle = pal > 0.5 ? 'rgba(206, 200, 182, 0.24)' : 'rgba(220, 214, 196, 0.38)';
        c.fillRect(dx - dw * 0.16, baseY - dh - dh * 0.10, dw * 1.32, dh * 1.10);
        c.fillStyle = pal > 0.5 ? 'rgba(70, 60, 48, 0.30)' : 'rgba(74, 62, 50, 0.52)';
        c.fillRect(dx, baseY - dh, dw, dh);
        // 门槛石
        c.fillStyle = 'rgba(120, 122, 110, ' + (pal > 0.5 ? 0.26 : 0.46) + ')';
        c.fillRect(dx - dw * 0.10, baseY - h * 0.014, dw * 1.20, Math.max(1.2, h * 0.014));
      }
    }

    // 檐下灯笼
    if (opts.lantern) {
      var lx = x + w * 0.74, ly = wallTop + h * 0.15;
      var lr = Math.max(2.6, w * 0.028);
      c.strokeStyle = 'rgba(40, 46, 42, 0.50)';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(lx, wallTop + h * 0.015);
      c.lineTo(lx, ly - lr * 1.3);
      c.stroke();
      c.fillStyle = C.lantern;
      c.beginPath();
      c.ellipse(lx, ly, lr, lr * 1.22, 0, 0, 6.2832);
      c.fill();
      lanterns.push({ x: lx, y: ly, r: lr, phase: rand(0, 6.28) });
    }
  }

  // ---------------------------------------------------------------------------
  // 石拱桥
  // ---------------------------------------------------------------------------
  function drawBridge(c, cx, baseY, span, hump, th) {
    var x0 = cx - span / 2, x1 = cx + span / 2;
    var deckY = baseY - hump * 0.06;

    // 桥台（没入水中）
    c.fillStyle = C.stoneDark;
    c.fillRect(x0 - span * 0.055, deckY - th * 0.1, span * 0.11, hump + th * 1.2);
    c.fillRect(x1 - span * 0.055, deckY - th * 0.1, span * 0.11, hump + th * 1.2);

    // 拱带
    c.beginPath();
    c.moveTo(x0, deckY);
    c.quadraticCurveTo(cx, deckY - hump * 2, x1, deckY);
    c.lineTo(x1, deckY + th);
    c.quadraticCurveTo(cx, deckY - hump * 2 + th, x0, deckY + th);
    c.closePath();
    var sg = c.createLinearGradient(0, deckY - hump * 2, 0, deckY + th);
    sg.addColorStop(0, '#D2CEC1');
    sg.addColorStop(0.55, C.stone);
    sg.addColorStop(1, C.stoneDark);
    c.fillStyle = sg;
    c.fill();

    // 桥面石板
    c.beginPath();
    c.moveTo(x0, deckY);
    c.quadraticCurveTo(cx, deckY - hump * 2, x1, deckY);
    c.lineWidth = Math.max(2, th * 0.30);
    c.strokeStyle = '#7E7B6E';
    c.stroke();

    // 栏杆立柱
    var posts = 13;
    for (var i = 0; i <= posts; i++) {
      var k = i / posts;
      var px = lerp(x0, x1, k);
      var py = deckY - hump * 2 * 2 * k * (1 - k);
      c.fillStyle = 'rgba(62, 66, 60, 0.82)';
      c.fillRect(px - Math.max(1, span * 0.0035), py - th * 0.60, Math.max(1.4, span * 0.007), th * 0.60);
    }
    // 栏板
    c.beginPath();
    for (var j = 0; j <= 26; j++) {
      var kk = j / 26;
      var qx = lerp(x0, x1, kk);
      var qy = deckY - hump * 2 * 2 * kk * (1 - kk) - th * 0.52;
      if (j === 0) { c.moveTo(qx, qy); } else { c.lineTo(qx, qy); }
    }
    c.lineWidth = Math.max(1.2, th * 0.16);
    c.strokeStyle = 'rgba(66, 70, 64, 0.55)';
    c.stroke();

    // 拱洞阴影（进深）
    c.beginPath();
    c.moveTo(x0, deckY + th * 0.15);
    c.quadraticCurveTo(cx, deckY - hump * 2 + th * 0.15, x1, deckY + th * 0.15);
    c.quadraticCurveTo(cx, deckY - hump * 2 + th * 1.75, x0, deckY + th * 0.15);
    c.closePath();
    c.fillStyle = 'rgba(22, 28, 25, 0.26)';
    c.fill();
  }

  // ---------------------------------------------------------------------------
  // 静态上半场景
  // ---------------------------------------------------------------------------
  function buildUpper() {
    seed = 20251110;
    lanterns.length = 0;

    var cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.floor(W * dpr));
    cv.height = Math.max(1, Math.floor(H * dpr));
    var c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 天空
    var sky = c.createLinearGradient(0, 0, 0, waterY);
    sky.addColorStop(0, C.skyTop);
    sky.addColorStop(0.55, C.skyMid);
    sky.addColorStop(1, C.skyLow);
    c.fillStyle = sky;
    c.fillRect(0, 0, W, H);

    // 天光
    var sun = c.createRadialGradient(W * 0.72, H * 0.04, 0, W * 0.72, H * 0.04, W * 0.40);
    sun.addColorStop(0, 'rgba(255, 254, 247, 0.62)');
    sun.addColorStop(1, 'rgba(255, 254, 247, 0)');
    c.fillStyle = sun;
    c.fillRect(0, 0, W, waterY);

    // 远山（两重淡墨，山尖露在屋脊之上）
    var hills = [
      { h: 0.40, col: C.hillFar, a: 0.50, f: 2.0, ph: 0.7 },
      { h: 0.31, col: C.hill, a: 0.55, f: 3.0, ph: 2.1 }
    ];
    for (var hi = 0; hi < hills.length; hi++) {
      var hl = hills[hi];
      c.save();
      c.globalAlpha = hl.a;
      c.fillStyle = hl.col;
      c.beginPath();
      c.moveTo(-W * 0.05, waterY);
      var seg = 7;
      for (var s = 0; s <= seg; s++) {
        var k = s / seg;
        var px = lerp(-W * 0.05, W * 1.05, k);
        var wave = 0.5 + 0.5 * Math.sin(k * Math.PI * hl.f + hl.ph);
        var py = waterY - H * hl.h * (0.35 + 0.65 * wave);
        c.lineTo(px, py);
      }
      c.lineTo(W * 1.05, waterY);
      c.closePath();
      c.fill();
      c.restore();
    }

    // 后排屋脊（更小更淡，填空隙）
    var backY = waterY - H * 0.006;
    var bx = -W * 0.02;
    while (bx < W * 1.02) {
      var bwPx = srange(W * 0.045, W * 0.075);
      var bhPx = bwPx * srange(0.85, 1.35);
      drawHouse(c, bx, backY, bwPx, bhPx, 1, { gable: srand() < 0.5 });
      bx += bwPx * srange(0.96, 1.06);
    }

    // 前排民居：宽高联动（江南民居大致"宽:高 ≈ 1 : 1~1.5"），高矮错落 + 偶尔留巷口
    var fx = -W * 0.03;
    var idx = 0;
    while (fx < W * 1.03) {
      var fwPx = srange(W * 0.075, W * 0.125);
      var fhPx = fwPx * srange(0.85, 1.45);
      drawHouse(c, fx, waterY, fwPx, fhPx, 0, {
        gable: idx % 2 === 0,
        lantern: srand() < 0.30,
        door: srand() < 0.55
      });
      fx += fwPx * srange(1.00, 1.09);
      if (srand() < 0.22) { fx += W * srange(0.008, 0.022); }

      // 12% 概率留一条巷口：画一道矮围墙，让视线透到后面去
      if (srand() < 0.12 && fx < W * 0.96) {
        var gapW = srange(W * 0.018, W * 0.038);
        var wallH = H * srange(0.042, 0.062);
        c.fillStyle = 'rgba(232, 228, 214, 0.92)';
        c.fillRect(fx, waterY - wallH, gapW, wallH);
        c.fillStyle = 'rgba(60, 66, 60, 0.55)';
        c.fillRect(fx - gapW * 0.06, waterY - wallH - H * 0.010, gapW * 1.12, H * 0.010);
        fx += gapW;
      }
      idx++;
    }

    // 石拱桥（右侧水口）
    drawBridge(c, W * 0.745, waterY, W * 0.27, H * 0.130, H * 0.032);

    // 空气透视：屋脊一带压一层薄雾
    var haze = c.createLinearGradient(0, waterY - H * 0.30, 0, waterY);
    haze.addColorStop(0, 'rgba(247, 250, 245, 0.04)');
    haze.addColorStop(0.55, 'rgba(247, 250, 245, 0.18)');
    haze.addColorStop(1, 'rgba(247, 250, 245, 0.34)');
    c.fillStyle = haze;
    c.fillRect(0, waterY - H * 0.30, W, H * 0.30);

    // 河岸石台（民居墙脚到水线之间的一条石沿）
    c.fillStyle = C.quay;
    c.fillRect(0, waterY, W, quayH);
    c.fillStyle = 'rgba(60, 66, 60, 0.35)';
    c.fillRect(0, waterY, W, Math.max(1.5, quayH * 0.18));
    c.fillStyle = 'rgba(40, 46, 42, 0.30)';
    c.fillRect(0, waterY + quayH - Math.max(1.5, quayH * 0.22), W, Math.max(1.5, quayH * 0.22));
    // 石缝
    c.strokeStyle = 'rgba(70, 74, 66, 0.20)';
    c.lineWidth = 1;
    for (var qx = 0; qx < W; qx += W * 0.035) {
      c.beginPath();
      c.moveTo(qx, waterY + quayH * 0.25);
      c.lineTo(qx + W * 0.004, waterY + quayH * 0.92);
      c.stroke();
    }

    // 河埠头石阶（左侧一段，走下水面）
    var stepX = W * 0.145, stepW = W * 0.085;
    var steps = 4;
    for (var si = 0; si < steps; si++) {
      var sh = quayH * 0.30;
      var sy = waterY + si * sh;
      var sw = stepW * (1 - si * 0.10);
      c.fillStyle = si % 2 ? '#B4B0A2' : '#C0BCAE';
      c.fillRect(stepX + (stepW - sw) / 2, sy, sw, sh + 0.6);
      c.fillStyle = 'rgba(60, 66, 60, 0.22)';
      c.fillRect(stepX + (stepW - sw) / 2, sy, sw, Math.max(1, sh * 0.22));
    }

    return cv;
  }

  // 倒影层：把水线以上的民居/桥镜像一份，并把"越深越淡"直接烘进去（每个 resize 重建一次）
  function buildRefl() {
    var cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.floor(W * dpr));
    cv.height = Math.max(1, Math.floor(H * dpr));
    var c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    var srcH = Math.min(H * 0.26, waterStart);
    c.save();
    c.translate(0, waterStart * 2);
    c.scale(1, -1);
    c.drawImage(upper,
      0, (waterStart - srcH) * dpr, W * dpr, srcH * dpr,
      0, waterStart - srcH, W, srcH);
    c.restore();

    // 竖向衰减：水越深，倒影越淡（烘进 alpha，绘制时一次 drawImage 即可）
    c.globalCompositeOperation = 'destination-in';
    var fade = c.createLinearGradient(0, waterStart, 0, waterStart + srcH);
    fade.addColorStop(0, 'rgba(0, 0, 0, 1)');
    fade.addColorStop(0.45, 'rgba(0, 0, 0, 0.55)');
    fade.addColorStop(1, 'rgba(0, 0, 0, 0)');
    c.fillStyle = fade;
    c.fillRect(0, waterStart, W, srcH);
    return cv;
  }

  // ---------------------------------------------------------------------------
  // 水面
  // ---------------------------------------------------------------------------
  function drawWater() {
    var wg = ctx.createLinearGradient(0, waterStart, 0, H);
    wg.addColorStop(0, C.waterTop);
    wg.addColorStop(0.35, '#9FAFA7');
    wg.addColorStop(1, C.waterBottom);
    ctx.fillStyle = wg;
    ctx.fillRect(0, waterStart, W, H - waterStart);

    // 倒影：整幅画一次 + 两片轻微错位的重影（模拟水面柔化），再叠横向波纹
    if (refl) {
      ctx.globalAlpha = 0.62;
      ctx.drawImage(refl, 0, 0, W, H);
      ctx.globalAlpha = 0.16;
      ctx.drawImage(refl, 0, 2.0, W, H);
      ctx.drawImage(refl, 0, -2.0, W, H);
      ctx.globalAlpha = 1;
    }

    // 水色压一层，让倒影化在水里
    ctx.fillStyle = 'rgba(146, 164, 156, 0.18)';
    ctx.fillRect(0, waterStart, W, H - waterStart);

    // 横向波纹
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.13)';
    ctx.lineWidth = 1;
    var lines = 34;
    for (var i = 0; i < lines; i++) {
      var kk = (i + 0.5) / lines;
      var yy = waterStart + (H - waterStart) * kk;
      var amp = 0.4 + kk * 2.4;
      ctx.beginPath();
      for (var x = -24; x < W + 24; x += 14) {
        var sy = yy + Math.sin(x * 0.011 + t * 0.8 + i * 0.7) * amp;
        if (x <= -24) { ctx.moveTo(x, sy); } else { ctx.lineTo(x, sy); }
      }
      ctx.stroke();
    }

    // 灯笼在水面的暖色光带
    for (var li = 0; li < lanterns.length; li++) {
      var L = lanterns[li];
      var ry = waterStart;
      var band = ctx.createLinearGradient(0, ry, 0, ry + H * 0.13);
      band.addColorStop(0, 'rgba(224, 138, 70, 0.32)');
      band.addColorStop(1, 'rgba(224, 138, 70, 0)');
      ctx.fillStyle = band;
      ctx.fillRect(L.x - L.r * 1.7, ry, L.r * 3.4, H * 0.13);
    }

    // 雨点涟漪
    for (var ri = 0; ri < ripples.length; ri++) {
      var rp = ripples[ri];
      ctx.strokeStyle = 'rgba(255, 255, 255, ' + rp.a.toFixed(3) + ')';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(rp.x, rp.y, rp.r, rp.r * 0.30, 0, 0, 6.2832);
      ctx.stroke();
    }

    // 漂在水面的落叶
    for (var fi = 0; fi < leaves.length; fi++) {
      var lf = leaves[fi];
      ctx.save();
      ctx.translate(lf.x, lf.y);
      ctx.rotate(lf.rot);
      ctx.fillStyle = 'rgba(98, 86, 62, ' + lf.a.toFixed(2) + ')';
      ctx.beginPath();
      ctx.ellipse(0, 0, lf.r * 1.9, lf.r * 0.72, 0, 0, 6.2832);
      ctx.fill();
      ctx.restore();
    }
  }

  // ---------------------------------------------------------------------------
  // 乌篷船
  // ---------------------------------------------------------------------------
  function drawBoat() {
    var x = boat.x, y = boat.y, w = boat.w;
    var h = w * 0.30;
    var bob = Math.sin(t * 1.25 + boat.phase) * h * 0.05;

    ctx.save();
    ctx.translate(x, y + bob);

    // 倒影
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.translate(0, h * 1.30);
    ctx.scale(1, -1);
    ctx.beginPath();
    ctx.moveTo(-w * 0.5, 0);
    ctx.quadraticCurveTo(0, h * 0.55, w * 0.5, 0);
    ctx.quadraticCurveTo(0, h * 0.30, -w * 0.5, 0);
    ctx.closePath();
    ctx.fillStyle = C.ink;
    ctx.fill();
    ctx.restore();

    // 船身
    ctx.beginPath();
    ctx.moveTo(-w * 0.5, 0);
    ctx.quadraticCurveTo(0, h * 0.60, w * 0.5, 0);
    ctx.quadraticCurveTo(0, h * 0.32, -w * 0.5, 0);
    ctx.closePath();
    ctx.fillStyle = '#2E3632';
    ctx.fill();

    // 船舷高光
    ctx.strokeStyle = 'rgba(236, 232, 216, 0.30)';
    ctx.lineWidth = Math.max(0.8, w * 0.006);
    ctx.beginPath();
    ctx.moveTo(-w * 0.46, h * 0.05);
    ctx.quadraticCurveTo(0, h * 0.38, w * 0.46, h * 0.05);
    ctx.stroke();

    // 乌篷
    var cw = w * 0.38, ch = h * 1.05;
    ctx.beginPath();
    ctx.moveTo(-cw * 0.5, 0);
    ctx.quadraticCurveTo(-cw * 0.5, -ch, 0, -ch);
    ctx.quadraticCurveTo(cw * 0.5, -ch, cw * 0.5, 0);
    ctx.closePath();
    ctx.fillStyle = '#38403B';
    ctx.fill();

    // 篷上竹篾纹
    ctx.strokeStyle = 'rgba(198, 194, 174, 0.18)';
    ctx.lineWidth = Math.max(0.6, w * 0.004);
    for (var i = 1; i <= 3; i++) {
      var kk = i / 4;
      ctx.beginPath();
      ctx.moveTo(-cw * 0.5 * (1 - kk), 0);
      ctx.quadraticCurveTo(0, -ch * (1 - kk * 0.12), cw * 0.5 * (1 - kk), 0);
      ctx.stroke();
    }

    // 船夫：斗笠 + 立姿 + 竹篙
    var mx = w * 0.32, my = -h * 0.04;
    ctx.fillStyle = '#222925';
    ctx.beginPath();
    ctx.moveTo(mx - w * 0.038, my);
    ctx.lineTo(mx - w * 0.022, my - h * 0.70);
    ctx.lineTo(mx + w * 0.022, my - h * 0.70);
    ctx.lineTo(mx + w * 0.038, my);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(mx, my - h * 0.82, w * 0.022, 0, 6.2832);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(mx - w * 0.066, my - h * 0.84);
    ctx.quadraticCurveTo(mx, my - h * 1.03, mx + w * 0.066, my - h * 0.84);
    ctx.closePath();
    ctx.fillStyle = '#3A413B';
    ctx.fill();
    ctx.strokeStyle = 'rgba(64, 68, 58, 0.85)';
    ctx.lineWidth = Math.max(0.7, w * 0.005);
    ctx.beginPath();
    ctx.moveTo(mx + w * 0.02, my - h * 1.45);
    ctx.lineTo(mx - w * 0.14, my + h * 0.45);
    ctx.stroke();

    // 船头灯笼
    var lx = -w * 0.38, ly = -h * 0.26;
    ctx.fillStyle = C.lantern;
    ctx.beginPath();
    ctx.ellipse(lx, ly, w * 0.028, w * 0.038, 0, 0, 6.2832);
    ctx.fill();
    drawGlow(lx + x, ly + y + bob, w * 0.32, 0.48 + 0.12 * Math.sin(t * 1.6));

    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // 垂柳（左上角垂下的柳丝）
  // ---------------------------------------------------------------------------
  function buildWillows() {
    willows.length = 0;
    seed = 7717;
    for (var i = 0; i < 15; i++) {
      willows.push({
        ax: srange(-W * 0.05, W * 0.20),
        ay: -H * 0.02,
        len: srange(H * 0.24, H * 0.48),
        bend: srange(-W * 0.055, W * 0.085),
        phase: srange(0, 6.2832),
        thick: srange(0.9, 2.0)
      });
    }
  }

  function drawWillows() {
    ctx.save();
    for (var i = 0; i < willows.length; i++) {
      var wl = willows[i];
      var sway = Math.sin(t * 0.60 + wl.phase) * W * 0.006;

      ctx.strokeStyle = 'rgba(58, 74, 60, 0.72)';
      ctx.lineWidth = wl.thick;
      ctx.beginPath();
      ctx.moveTo(wl.ax, wl.ay);
      ctx.quadraticCurveTo(
        wl.ax + wl.bend * 0.5 + sway * 0.5, wl.ay + wl.len * 0.60,
        wl.ax + wl.bend + sway, wl.ay + wl.len);
      ctx.stroke();

      // 柳叶
      var leaves2 = 15;
      for (var k = 1; k <= leaves2; k++) {
        var u = k / (leaves2 + 1);
        var px = wl.ax + wl.bend * u * u + sway * u * u;
        var py = wl.ay + wl.len * u;
        var side = (k % 2 === 0) ? 1 : -1;
        var ang = Math.sin(t * 1.0 + wl.phase + u * 2.4) * 0.28 + side * 0.62;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(ang);
        ctx.fillStyle = 'rgba(70, 92, 72, ' + (0.66 - u * 0.32).toFixed(2) + ')';
        ctx.beginPath();
        ctx.ellipse(side * 2.4, 0, 5.6, 1.9, 0, 0, 6.2832);
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // 雨 / 雾 / 飞鸟
  // ---------------------------------------------------------------------------
  function buildRain() {
    rain.length = 0;
    var count = Math.round(clamp(W * H / 2200, 320, 1050));
    for (var i = 0; i < count; i++) {
      rain.push({
        x: rand(-W * 0.12, W * 1.1),
        y: rand(-H * 0.3, H),
        len: rand(9, 26),
        sp: rand(600, 1080),
        a: rand(0.10, 0.34),
        w: rand(0.6, 1.3)
      });
    }
  }

  function buildMists() {
    mists.length = 0;
    var bands = [
      { y: 0.34, h: 0.09, a: 0.22, sp: 0.014 },
      { y: 0.44, h: 0.10, a: 0.26, sp: 0.011 },
      { y: 0.58, h: 0.07, a: 0.22, sp: 0.018 },
      { y: 0.68, h: 0.06, a: 0.16, sp: 0.022 },
      { y: 0.88, h: 0.09, a: 0.10, sp: 0.028 }
    ];
    for (var i = 0; i < bands.length; i++) {
      mists.push({
        y: bands[i].y * H,
        h: bands[i].h * H,
        a: bands[i].a,
        sp: bands[i].sp,
        phase: rand(0, 6.2832)
      });
    }
  }

  function buildBirds() {
    birds.length = 0;
    for (var i = 0; i < 3; i++) {
      birds.push({
        x: rand(W * 0.55, W * 0.95),
        y: rand(H * 0.10, H * 0.26),
        sp: rand(8, 16),
        phase: rand(0, 6.2832),
        size: rand(0.8, 1.4)
      });
    }
  }

  function buildLeaves() {
    leaves.length = 0;
    for (var i = 0; i < 7; i++) {
      leaves.push({
        x: rand(W * 0.08, W * 0.92),
        y: rand(waterStart + H * 0.04, H * 0.97),
        r: rand(1.5, 3.2),
        rot: rand(0, 6.2832),
        sp: rand(2, 7),
        a: rand(0.18, 0.40)
      });
    }
  }

  function updateRain(dt) {
    for (var i = 0; i < rain.length; i++) {
      var r = rain[i];
      r.y += r.sp * dt;
      r.x -= r.sp * dt * 0.15;
      if (r.y > H + r.len) {
        r.y = -r.len;
        r.x = rand(-W * 0.12, W * 1.1);
      }
      if (r.x < -W * 0.14) { r.x = W * 1.1; }
    }

    while (ripples.length < 44) {
      ripples.push({
        x: rand(0, W),
        y: rand(waterStart + H * 0.008, H * 1.01),
        r: rand(1, 3),
        a: rand(0.16, 0.40)
      });
    }
    for (var j = ripples.length - 1; j >= 0; j--) {
      var rp = ripples[j];
      rp.r += (8 + rp.r * 2.6) * dt;
      rp.a -= dt * 0.55;
      if (rp.a <= 0.01) { ripples.splice(j, 1); }
    }

    for (var k = 0; k < leaves.length; k++) {
      var lf = leaves[k];
      lf.x += lf.sp * dt;
      lf.rot += dt * 0.25;
      if (lf.x > W * 1.04) { lf.x = -W * 0.04; lf.y = rand(waterStart + H * 0.04, H * 0.97); }
    }

    for (var b = 0; b < birds.length; b++) {
      var bd = birds[b];
      bd.x -= bd.sp * dt;
      if (bd.x < -W * 0.05) { bd.x = W * 1.05; bd.y = rand(H * 0.10, H * 0.26); }
    }
  }

  function drawRain() {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.62)';
    ctx.lineCap = 'round';
    for (var i = 0; i < rain.length; i++) {
      var r = rain[i];
      ctx.globalAlpha = r.a;
      ctx.lineWidth = r.w;
      ctx.beginPath();
      ctx.moveTo(r.x, r.y);
      ctx.lineTo(r.x + r.len * 0.15, r.y - r.len);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawMists() {
    ctx.save();
    for (var i = 0; i < mists.length; i++) {
      var m = mists[i];
      var off = Math.sin(t * m.sp + m.phase) * W * 0.07;
      var g = ctx.createLinearGradient(0, m.y - m.h, 0, m.y + m.h);
      g.addColorStop(0, 'rgba(255, 255, 255, 0)');
      g.addColorStop(0.5, 'rgba(255, 255, 255, ' + m.a.toFixed(3) + ')');
      g.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(off - W * 0.12, m.y - m.h, W * 1.24, m.h * 2);
    }
    ctx.restore();
  }

  function drawBirds() {
    ctx.save();
    ctx.strokeStyle = 'rgba(60, 70, 62, 0.42)';
    ctx.lineWidth = Math.max(1, W * 0.0012);
    ctx.lineCap = 'round';
    for (var i = 0; i < birds.length; i++) {
      var bd = birds[i];
      var flap = Math.sin(t * 6 + bd.phase) * 0.5 + 0.5;
      var s = W * 0.006 * bd.size;
      ctx.beginPath();
      ctx.moveTo(bd.x - s, bd.y + s * flap * 0.5);
      ctx.quadraticCurveTo(bd.x - s * 0.4, bd.y - s * 0.4 * flap, bd.x, bd.y);
      ctx.quadraticCurveTo(bd.x + s * 0.4, bd.y - s * 0.4 * flap, bd.x + s, bd.y + s * flap * 0.5);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // 诗句 + 印章
  // ---------------------------------------------------------------------------
  function drawPoem() {
    var text = '一蓑烟雨任平生';
    var fs = Math.max(12, Math.round(H * 0.025));
    var x = W * 0.935;
    var y = H * 0.10;
    ctx.save();
    ctx.font = fs + 'px "KaiTi", "STKaiti", "SimSun", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(48, 58, 51, 0.38)';
    for (var i = 0; i < text.length; i++) {
      ctx.fillText(text.charAt(i), x, y + i * fs * 1.26);
    }
    var sy = y + text.length * fs * 1.26 + fs * 0.35;
    var sw = fs * 0.90;
    ctx.fillStyle = 'rgba(181, 68, 47, 0.48)';
    ctx.fillRect(x - sw / 2, sy, sw, sw);
    ctx.fillStyle = 'rgba(247, 250, 245, 0.85)';
    ctx.font = Math.round(fs * 0.52) + 'px "KaiTi", "SimSun", serif';
    ctx.textBaseline = 'middle';
    ctx.fillText('雨', x, sy + sw / 2);
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // 初始化
  // ---------------------------------------------------------------------------
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

    waterY = Math.round(H * 0.705);
    quayH = Math.round(H * 0.020);
    waterStart = waterY + quayH;

    if (!glow) { glow = makeGlow(); }
    upper = buildUpper();
    refl = buildRefl();

    buildWillows();
    buildRain();
    buildMists();
    buildBirds();
    buildLeaves();

    boat.w = W * 0.125;
    boat.y = H * 0.895;
    boat.phase = 1.7;
    boat.speed = W * 0.0058;
    if (!boat.x) { boat.x = W * 0.52; }

    warmup(90);
  }

  function advance(dt) {
    t += dt;
    updateRain(dt);
    boat.x += boat.speed * dt;
    if (boat.x > W * 1.10) { boat.x = -W * 0.10; }
  }

  function draw() {
    if (upper) { ctx.drawImage(upper, 0, 0, W, H); }

    drawBirds();
    drawWater();
    drawBoat();
    drawMists();
    drawWillows();
    drawRain();

    for (var i = 0; i < lanterns.length; i++) {
      var L = lanterns[i];
      var pulse = 0.52 + 0.10 * Math.sin(t * 1.4 + L.phase);
      drawGlow(L.x, L.y, L.r * 5.2, pulse * 0.40);
    }

    drawPoem();

    var vig = ctx.createRadialGradient(W / 2, H * 0.44, Math.min(W, H) * 0.36, W / 2, H * 0.44, Math.max(W, H) * 0.82);
    vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vig.addColorStop(1, 'rgba(18, 24, 20, 0.24)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);
  }

  function warmup(frames) {
    var dt = 1 / 30;
    for (var i = 0; i < frames; i++) {
      advance(dt);
      draw();
    }
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
    resizeTimer = window.setTimeout(function () {
      var k = boat.x / Math.max(1, W);
      resize();
      boat.x = k * W;
    }, 150);
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { stop(); } else { start(); }
  });

  resize();
  start();
}());
