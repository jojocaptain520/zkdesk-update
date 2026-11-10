/* ===========================================================================
   rainy rooftop vigil  --  a mech stands at the parapet of a skyscraper and
   looks down over a neon city in the rain: searchlights, car light trails,
   beacon lamps, drifting cloud, wet platform.

   Pure 2D canvas, fully procedural. No external images / fonts / network /
   storage. No pointer or key listeners, no exit button (the host injects it).
   Nothing human is drawn: the subject is a machine.

   Static art (sky, city, parapet, platform, mech, reflection, rain tile,
   beam, cloud puffs) is baked into offscreen canvases and blitted per frame.
   Per-frame code never calls shadowBlur / createRadialGradient / getImageData
   / fillText.
   =========================================================================== */
(function () {
  'use strict';

  var cv = document.getElementById('stage');
  var ctx = cv && cv.getContext ? cv.getContext('2d') : null;
  if (!ctx) { return; }

  var TAU = 6.283185307179586;
  var MAX_DPR = 1.5;
  var SKY_Y = 0.355;                   /* skyline of the city below */
  var ROOF_Y = 0.722;                  /* parapet top */
  var RAIN_DEG = 12;
  var SIN_A = Math.sin(RAIN_DEG * Math.PI / 180);
  var COS_A = Math.cos(RAIN_DEG * Math.PI / 180);
  var TILE = 512;

  var W = 1, H = 1, dpr = 1, DW = 1, DH = 1, u = 1;

  var bgCan = null, bgc = null;
  var mechCan = null, mxc = null;
  var mechRefl = null;
  var scrimCan = null;
  var patRain = null;
  var beamCan = null;
  var cloudSpr = [];

  var sprCyan = null, sprMag = null, sprOrange = null, sprWhite = null,
    sprIce = null, sprWarm = null, sprCool = null;

  var G = {};
  var clouds = [];
  var cars = [];
  var t = 0, last = 0, rafId = 0, resizeTimer = 0;

  /* ------------------------------------------------------------------ utils */

  function makeCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }

  function mod(a, n) { return a - Math.floor(a / n) * n; }

  function makeRng(seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function softSprite(size, r, g, b, coreA) {
    var c = makeCanvas(size, size);
    var x = c.getContext('2d');
    var h = size / 2;
    var gr = x.createRadialGradient(h, h, 0, h, h, h);
    gr.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ',' + coreA + ')');
    gr.addColorStop(0.26, 'rgba(' + r + ',' + g + ',' + b + ',' + (coreA * 0.58).toFixed(3) + ')');
    gr.addColorStop(0.60, 'rgba(' + r + ',' + g + ',' + b + ',' + (coreA * 0.18).toFixed(3) + ')');
    gr.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',0)');
    x.fillStyle = gr;
    x.fillRect(0, 0, size, size);
    return c;
  }

  function blit(g2, spr, x, y, w, h, a) {
    if (!spr || a <= 0) { return; }
    g2.globalAlpha = a;
    g2.drawImage(spr, x - w / 2, y - h / 2, w, h);
    g2.globalAlpha = 1;
  }

  function fogBand(g2, yTop, yBot, r, g, b, aTop, aBot) {
    if (yBot <= yTop) { return; }
    var fg = g2.createLinearGradient(0, yTop, 0, yBot);
    fg.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ',' + aTop + ')');
    fg.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',' + aBot + ')');
    g2.fillStyle = fg;
    g2.fillRect(0, yTop, W, yBot - yTop);
  }

  /* --------------------------------------------------------------- sprites */

  function buildSprites() {
    sprCyan = softSprite(160, 53, 216, 255, 0.95);
    sprMag = softSprite(160, 255, 95, 174, 0.92);
    sprOrange = softSprite(160, 255, 154, 60, 0.95);
    sprWhite = softSprite(160, 255, 255, 255, 0.95);
    sprIce = softSprite(160, 180, 240, 255, 0.92);
    sprWarm = softSprite(160, 255, 214, 152, 0.90);
    sprCool = softSprite(160, 110, 170, 230, 0.78);

    /* scrim for the host button corner */
    scrimCan = makeCanvas(400, 280);
    var sx = scrimCan.getContext('2d');
    var sg = sx.createRadialGradient(200, 140, 12, 200, 140, 200);
    sg.addColorStop(0, 'rgba(6,14,24,0.80)');
    sg.addColorStop(0.45, 'rgba(8,18,30,0.56)');
    sg.addColorStop(0.76, 'rgba(10,22,36,0.22)');
    sg.addColorStop(1, 'rgba(12,26,40,0)');
    sx.fillStyle = sg;
    sx.fillRect(0, 0, 400, 280);

    /* a searchlight cone, origin at the bottom centre, pointing up */
    beamCan = makeCanvas(320, 640);
    var bx = beamCan.getContext('2d');
    var ox = 160, oy = 636;
    var L = 620;
    var gr = bx.createRadialGradient(ox, oy, 4, ox, oy, L);
    gr.addColorStop(0, 'rgba(210,245,255,0.55)');
    gr.addColorStop(0.18, 'rgba(150,225,255,0.24)');
    gr.addColorStop(0.55, 'rgba(110,200,255,0.10)');
    gr.addColorStop(1, 'rgba(90,180,240,0)');
    bx.fillStyle = gr;
    bx.beginPath();
    bx.moveTo(ox - 5, oy);
    bx.lineTo(ox - 74, oy - L);
    bx.lineTo(ox + 74, oy - L);
    bx.lineTo(ox + 5, oy);
    bx.closePath();
    bx.fill();
    /* a brighter core */
    var gr2 = bx.createRadialGradient(ox, oy, 2, ox, oy, L * 0.92);
    gr2.addColorStop(0, 'rgba(240,252,255,0.42)');
    gr2.addColorStop(0.35, 'rgba(190,240,255,0.12)');
    gr2.addColorStop(1, 'rgba(170,230,255,0)');
    bx.fillStyle = gr2;
    bx.beginPath();
    bx.moveTo(ox - 2, oy);
    bx.lineTo(ox - 26, oy - L * 0.94);
    bx.lineTo(ox + 26, oy - L * 0.94);
    bx.lineTo(ox + 2, oy);
    bx.closePath();
    bx.fill();

    /* soft cloud puffs */
    cloudSpr = [
      softSprite(256, 196, 224, 246, 0.55),
      softSprite(256, 150, 190, 224, 0.55),
      softSprite(256, 120, 165, 205, 0.50)
    ];
  }

  /* ------------------------------------------------------------- geometry */

  function computeGeo() {
    var g = {};
    g.skyY = H * SKY_Y;
    g.roofY = H * ROOF_Y;

    g.mw = W * 0.30;
    g.mh = H * 0.64;
    g.mx = W * 0.175;
    g.my = H * 0.235;
    g.baseY = g.my + g.mh;
    g.cx = g.mx + g.mw * 0.5;

    function P(fx, fy) {
      return { x: g.mx + fx * g.mw, y: g.my + fy * g.mh };
    }
    g.P = P;

    /* animated anchors in screen space */
    g.seams = [
      { x: g.mx + 0.44 * g.mw, y: g.my + 0.27 * g.mh, r: 0.24 },
      { x: g.mx + 0.56 * g.mw, y: g.my + 0.27 * g.mh, r: 0.24 },
      { x: g.mx + 0.50 * g.mw, y: g.my + 0.40 * g.mh, r: 0.20 },
      { x: g.mx + 0.50 * g.mw, y: g.my + 0.50 * g.mh, r: 0.16 },
      { x: g.mx + 0.31 * g.mw, y: g.my + 0.36 * g.mh, r: 0.14 },
      { x: g.mx + 0.69 * g.mw, y: g.my + 0.36 * g.mh, r: 0.14 }
    ];
    g.nozzleL = P(0.412, 0.404);
    g.nozzleR = P(0.588, 0.404);
    g.headLight = P(0.412, 0.078);

    /* roof beacons: parapet posts + a mast on the right */
    g.beacons = [
      { x: W * 0.075, y: H * ROOF_Y - H * 0.055, ph: 0.0, c: 'mag' },
      { x: W * 0.60, y: H * ROOF_Y - H * 0.012, ph: 1.7, c: 'cyan' },
      { x: W * 0.935, y: H * 0.60, ph: 3.1, c: 'mag' },
      { x: W * 0.505, y: H * 0.47, ph: 4.4, c: 'warm' }
    ];

    /* searchlights rising out of the city */
    g.beams = [
      { x: W * 0.63, y: H * 0.665, a0: -0.55, amp: 0.30, sp: 0.19, ph: 0.0, sc: 1.0 },
      { x: W * 0.80, y: H * 0.700, a0: -0.42, amp: 0.26, sp: 0.15, ph: 2.1, sc: 0.85 },
      { x: W * 0.46, y: H * 0.685, a0: -0.62, amp: 0.22, sp: 0.12, ph: 4.0, sc: 0.7 }
    ];

    /* car trail lanes in the city below */
    g.lanes = [
      { y: H * 0.505, x0: W * 0.30, x1: W * 1.02, sp: 46, c: 'warm' },
      { y: H * 0.560, x0: W * 0.02, x1: W * 0.86, sp: -38, c: 'cyan' },
      { y: H * 0.622, x0: W * 0.24, x1: W * 1.02, sp: 54, c: 'warm' },
      { y: H * 0.672, x0: W * 0.00, x1: W * 0.90, sp: -30, c: 'mag' }
    ];

    G = g;
  }

  /* -------------------------------------------------------- sky + city */

  function buildCity() {
    bgCan = makeCanvas(DW, DH);
    bgc = bgCan.getContext('2d');
    var g2 = bgc;
    g2.setTransform(dpr, 0, 0, dpr, 0, 0);
    g2.clearRect(0, 0, W, H);

    var skyY = H * SKY_Y;
    var roofY = H * ROOF_Y;

    /* night sky: bright cyan-blue near the city, deep at the top */
    var sky = g2.createLinearGradient(0, 0, 0, skyY);
    sky.addColorStop(0.00, '#14324d');
    sky.addColorStop(0.34, '#1e4a6b');
    sky.addColorStop(0.68, '#356f9b');
    sky.addColorStop(1.00, '#4f8fc0');
    g2.fillStyle = sky;
    g2.fillRect(0, 0, W, skyY + 2);

    /* moon glow, upper right */
    blit(g2, sprCool, W * 0.735, H * 0.115, W * 0.50, H * 0.42, 0.55);
    blit(g2, sprIce, W * 0.735, H * 0.112, W * 0.13, H * 0.16, 0.55);
    blit(g2, sprWhite, W * 0.735, H * 0.110, W * 0.045, H * 0.055, 0.75);

    /* baked cloud banks in the sky */
    var rng = makeRng(77123);
    for (var c = 0; c < 16; c++) {
      var cx0 = rng() * W;
      var cy0 = H * (0.02 + rng() * 0.30);
      var cw0 = W * (0.18 + rng() * 0.40);
      var ch0 = H * (0.030 + rng() * 0.060);
      blit(g2, cloudSpr[Math.floor(rng() * 3)], cx0, cy0, cw0, ch0, 0.16 + rng() * 0.20);
    }

    /* city haze glow above the skyline */
    blit(g2, sprCool, W * 0.50, skyY + H * 0.02, W * 1.10, H * 0.24, 0.42);
    blit(g2, sprMag, W * 0.80, skyY + H * 0.06, W * 0.60, H * 0.20, 0.30);
    blit(g2, sprCyan, W * 0.24, skyY + H * 0.09, W * 0.66, H * 0.22, 0.28);

    /* --- the city below: three depth bands --- */
    function band(cfg) {
      var x = -cfg.pad * W;
      while (x < W * (1 + cfg.pad)) {
        var bw = (cfg.wMin + rng() * (cfg.wMax - cfg.wMin)) * W;
        var bh = (cfg.hMin + rng() * (cfg.hMax - cfg.hMin)) * H;
        var top = cfg.base - bh;
        g2.fillStyle = cfg.color;
        g2.fillRect(x, top, bw, bh + 2 * u);

        /* neon edge strips on some towers */
        if (rng() < cfg.strip) {
          g2.fillStyle = rng() < 0.5 ? 'rgba(53,216,255,0.85)' : 'rgba(255,95,174,0.85)';
          g2.fillRect(x + (rng() < 0.5 ? 0 : bw - 2 * u), top, Math.max(1.2, 2.2 * u), bh * (0.35 + rng() * 0.65));
        }
        if (cfg.rim) {
          g2.strokeStyle = cfg.rim;
          g2.lineWidth = Math.max(1, 1.1 * u);
          g2.beginPath();
          g2.moveTo(x, top);
          g2.lineTo(x + bw, top);
          g2.stroke();
        }

        /* windows */
        var cw = cfg.cellW * W;
        var ch = cfg.cellH * H;
        var cols = Math.max(1, Math.floor((bw * 0.84) / cw));
        var rows = Math.max(1, Math.floor((bh * 0.86) / ch));
        var ox = x + (bw - cols * cw) / 2 + cw * 0.22;
        var oy = top + ch * 0.76;
        for (var r = 0; r < rows; r++) {
          for (var q = 0; q < cols; q++) {
            if (rng() > cfg.win) { continue; }
            var wa = cfg.waMin + rng() * (cfg.waMax - cfg.waMin);
            var kind = rng();
            var col = kind < 0.36 ? '255,206,150' : (kind < 0.70 ? '150,240,255' : '255,150,210');
            var wx = ox + q * cw;
            var wy = oy + r * ch;
            g2.fillStyle = 'rgba(' + col + ',' + wa.toFixed(3) + ')';
            g2.fillRect(wx, wy, cw * 0.52, ch * 0.50);
          }
        }
        x += bw + (rng() < 0.18 ? cfg.gap * W : 0);
      }
    }

    band({
      pad: 0.04, base: skyY + H * 0.075,
      hMin: 0.020, hMax: 0.055, wMin: 0.030, wMax: 0.075, gap: 0.006,
      color: '#2d5b80', rim: 'rgba(150,215,255,0.35)', strip: 0.10,
      win: 0.22, cellW: 0.0056, cellH: 0.0062, waMin: 0.20, waMax: 0.62
    });
    fogBand(g2, skyY + H * 0.02, skyY + H * 0.14, 120, 175, 220, 0.10, 0.42);

    band({
      pad: 0.03, base: skyY + H * 0.175,
      hMin: 0.045, hMax: 0.115, wMin: 0.045, wMax: 0.115, gap: 0.010,
      color: '#20455f', rim: 'rgba(170,230,255,0.42)', strip: 0.22,
      win: 0.24, cellW: 0.0080, cellH: 0.0088, waMin: 0.24, waMax: 0.78
    });
    fogBand(g2, skyY + H * 0.10, skyY + H * 0.26, 96, 156, 202, 0.08, 0.30);

    band({
      pad: 0.02, base: roofY - H * 0.005,
      hMin: 0.110, hMax: 0.260, wMin: 0.075, wMax: 0.185, gap: 0.016,
      color: '#142c42', rim: 'rgba(190,240,255,0.50)', strip: 0.30,
      win: 0.26, cellW: 0.0104, cellH: 0.0114, waMin: 0.30, waMax: 0.92
    });
    fogBand(g2, skyY + H * 0.20, roofY, 70, 126, 174, 0.06, 0.16);

    /* neon signs scattered through the city */
    var signs = [
      [0.055, 0.470, 0.030, 0.070, 'cyan'], [0.115, 0.520, 0.024, 0.055, 'mag'],
      [0.190, 0.580, 0.034, 0.080, 'orange'], [0.268, 0.545, 0.022, 0.048, 'cyan'],
      [0.340, 0.610, 0.030, 0.062, 'mag'], [0.415, 0.575, 0.020, 0.045, 'cyan'],
      [0.520, 0.600, 0.026, 0.058, 'orange'], [0.600, 0.640, 0.034, 0.070, 'mag'],
      [0.690, 0.590, 0.022, 0.050, 'cyan'], [0.760, 0.635, 0.030, 0.065, 'orange'],
      [0.845, 0.600, 0.024, 0.055, 'mag'], [0.910, 0.650, 0.028, 0.060, 'cyan']
    ];
    for (var s = 0; s < signs.length; s++) {
      var sd = signs[s];
      var sx = sd[0] * W, sy = sd[1] * H, sw = sd[2] * W, sh = sd[3] * H;
      var spr = sd[4] === 'cyan' ? sprCyan : (sd[4] === 'mag' ? sprMag : sprOrange);
      var col = sd[4] === 'cyan' ? '53,216,255' : (sd[4] === 'mag' ? '255,95,174' : '255,154,60');
      blit(g2, spr, sx + sw / 2, sy + sh / 2, sw * 7.5, sh * 2.2, 0.42);
      g2.fillStyle = 'rgba(' + col + ',0.95)';
      g2.fillRect(sx, sy, sw, sh);
      g2.fillStyle = 'rgba(255,255,255,0.72)';
      g2.fillRect(sx + sw * 0.26, sy + sh * 0.08, sw * 0.48, sh * 0.84);
    }

    /* car light trails baked as long streaks */
    var lanes = G ? G.lanes : [];
    for (var li = 0; li < lanes.length; li++) {
      var ln = lanes[li];
      var spr2 = ln.c === 'cyan' ? sprCyan : (ln.c === 'mag' ? sprMag : sprWarm);
      blit(g2, spr2, (ln.x0 + ln.x1) / 2, ln.y, Math.abs(ln.x1 - ln.x0), 9 * u, 0.16);
      g2.strokeStyle = ln.c === 'cyan' ? 'rgba(120,235,255,0.30)'
        : (ln.c === 'mag' ? 'rgba(255,140,200,0.26)' : 'rgba(255,214,150,0.30)');
      g2.lineWidth = Math.max(1, 1.3 * u);
      g2.beginPath();
      g2.moveTo(ln.x0, ln.y);
      g2.lineTo(ln.x1, ln.y);
      g2.stroke();
    }

    /* ---- parapet + rooftop platform ---- */
    var pg = g2.createLinearGradient(0, roofY - H * 0.02, 0, roofY + H * 0.05);
    pg.addColorStop(0.00, '#7ea8c6');
    pg.addColorStop(0.30, '#3c6383');
    pg.addColorStop(1.00, '#1b3245');
    g2.fillStyle = pg;
    g2.fillRect(0, roofY - H * 0.018, W, H * 0.075);

    /* bright wet cap on the parapet */
    var cap = g2.createLinearGradient(0, roofY - H * 0.020, 0, roofY + H * 0.004);
    cap.addColorStop(0, 'rgba(226,248,255,0.95)');
    cap.addColorStop(1, 'rgba(110,190,235,0.55)');
    g2.fillStyle = cap;
    g2.fillRect(0, roofY - H * 0.020, W, H * 0.022);

    /* platform surface, receding towards the parapet */
    var pf = g2.createLinearGradient(0, roofY + H * 0.05, 0, H);
    pf.addColorStop(0.00, '#396487');
    pf.addColorStop(0.42, '#2d5170');
    pf.addColorStop(1.00, '#1b3549');
    g2.fillStyle = pf;
    g2.fillRect(0, roofY + H * 0.05, W, H - roofY);

    /* wet sheen + tile joints */
    blit(g2, sprCool, W * 0.50, roofY + H * 0.15, W * 1.05, H * 0.34, 0.44);
    blit(g2, sprCyan, W * 0.30, roofY + H * 0.22, W * 0.55, H * 0.18, 0.16);
    blit(g2, sprMag, W * 0.80, roofY + H * 0.20, W * 0.45, H * 0.16, 0.14);
    g2.strokeStyle = 'rgba(175,225,250,0.34)';
    g2.lineWidth = Math.max(1, 1.1 * u);
    var jy;
    for (jy = 1; jy <= 5; jy++) {
      var yy = roofY + H * 0.05 + (H - roofY - H * 0.05) * Math.pow(jy / 5, 1.7);
      g2.beginPath();
      g2.moveTo(0, yy);
      g2.lineTo(W, yy);
      g2.stroke();
    }
    for (var jx = -6; jx <= 16; jx++) {
      g2.beginPath();
      g2.moveTo(W * 0.5 + jx * W * 0.075, roofY + H * 0.05);
      g2.lineTo(W * 0.5 + jx * W * 0.20, H);
      g2.stroke();
    }

    /* neon colour bleeding across the wet platform */
    g2.globalCompositeOperation = 'lighter';
    blit(g2, sprCyan, W * 0.18, H * 0.985, W * 0.18, H * 0.12, 0.32);
    blit(g2, sprMag, W * 0.62, H * 0.985, W * 0.16, H * 0.11, 0.30);
    blit(g2, sprWarm, W * 0.88, H * 0.985, W * 0.12, H * 0.08, 0.18);
    g2.globalCompositeOperation = 'source-over';

    /* parapet posts and a mast on the right edge */
    g2.fillStyle = '#16293a';
    g2.fillRect(W * 0.055, roofY - H * 0.075, Math.max(2, 3 * u), H * 0.075);
    g2.fillRect(W * 0.585, roofY - H * 0.045, Math.max(2, 2.5 * u), H * 0.045);
    g2.fillRect(W * 0.930, roofY - H * 0.155, Math.max(3, 4.5 * u), H * 0.155);
    g2.fillRect(W * 0.905, roofY - H * 0.155, W * 0.055, Math.max(2, 2.5 * u));

    /* distant rooftop antennae poking above the skyline for depth */
    g2.strokeStyle = 'rgba(160,215,245,0.42)';
    g2.lineWidth = Math.max(1, 1.2 * u);
    for (var an = 0; an < 7; an++) {
      var axx = W * (0.06 + an * 0.135 + rng() * 0.05);
      var ayy = skyY + H * (0.05 + rng() * 0.10);
      g2.beginPath();
      g2.moveTo(axx, ayy);
      g2.lineTo(axx, ayy - H * (0.02 + rng() * 0.035));
      g2.stroke();
    }

    /* haze wash to keep the whole frame luminous */
    g2.fillStyle = 'rgba(132,190,230,0.15)';
    g2.fillRect(0, 0, W, H);

    /* gentle vignette */
    var vg = g2.createRadialGradient(W * 0.50, H * 0.44, Math.min(W, H) * 0.34,
      W * 0.50, H * 0.44, Math.max(W, H) * 0.84);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(0.62, 'rgba(6,16,28,0.10)');
    vg.addColorStop(1, 'rgba(4,12,22,0.34)');
    g2.fillStyle = vg;
    g2.fillRect(0, 0, W, H);

    /* grain */
    var noise = makeCanvas(160, 160);
    var nx = noise.getContext('2d');
    if (nx) {
      var img = nx.createImageData(160, 160);
      var data = img.data;
      for (var p = 0; p < data.length; p += 4) {
        var v = 140 + Math.floor(Math.random() * 115);
        data[p] = v; data[p + 1] = v; data[p + 2] = v;
        data[p + 3] = Math.floor(Math.random() * 22);
      }
      nx.putImageData(img, 0, 0);
      var npat = g2.createPattern(noise, 'repeat');
      g2.globalAlpha = 0.45;
      g2.fillStyle = npat;
      g2.fillRect(0, 0, W, H);
      g2.globalAlpha = 1;
    }
  }

  /* ------------------------------------------------------------------ mech */

  function buildMech() {
    var g = G;
    mechCan = makeCanvas(g.mw * dpr, g.mh * dpr);
    mxc = mechCan.getContext('2d');
    if (!mxc) { return; }
    var g2 = mxc;
    var MW = g.mw, MH = g.mh;
    g2.setTransform(dpr, 0, 0, dpr, 0, 0);
    g2.clearRect(0, 0, MW, MH);
    g2.lineJoin = 'miter';
    g2.lineCap = 'butt';

    function X(f) { return f * MW; }
    function Y(f) { return f * MH; }

    var GLOW = '53,216,255';
    var MAG = '255,95,174';
    var ORANGE = '255,154,60';
    var LINE = 'rgba(20,34,48,0.88)';

    function plate(p, y0, y1, top, mid, bot) {
      var gr = g2.createLinearGradient(0, y0, MW * 0.40, y1);
      gr.addColorStop(0, top);
      gr.addColorStop(0.55, mid);
      gr.addColorStop(1, bot);
      g2.fillStyle = gr;
      g2.fill(p);
      g2.save();
      g2.clip(p);
      var bev = g2.createLinearGradient(0, y0, 0, y1);
      bev.addColorStop(0, 'rgba(255,255,255,0.62)');
      bev.addColorStop(0.16, 'rgba(255,255,255,0.06)');
      bev.addColorStop(0.72, 'rgba(8,20,32,0)');
      bev.addColorStop(1, 'rgba(8,20,32,0.50)');
      g2.fillStyle = bev;
      g2.fillRect(-MW, y0 - MH, MW * 3, (y1 - y0) + MH * 2);
      g2.restore();
      g2.strokeStyle = LINE;
      g2.lineWidth = Math.max(1, 1.5 * u);
      g2.stroke(p);
    }

    function seam(x1, y1, x2, y2, w, col) {
      g2.save();
      g2.shadowColor = 'rgba(' + col + ',0.95)';
      g2.shadowBlur = 13 * u;
      g2.strokeStyle = 'rgba(' + col + ',0.95)';
      g2.lineWidth = w;
      g2.beginPath();
      g2.moveTo(x1, y1);
      g2.lineTo(x2, y2);
      g2.stroke();
      g2.restore();
    }

    /* ---------- dark inner frame ---------- */
    g2.fillStyle = '#101d2a';
    g2.beginPath();
    g2.moveTo(X(0.28), Y(0.20));
    g2.lineTo(X(0.72), Y(0.20));
    g2.lineTo(X(0.68), Y(0.60));
    g2.lineTo(X(0.32), Y(0.60));
    g2.closePath();
    g2.fill();
    g2.fillRect(X(0.30), Y(0.58), MW * 0.40, MH * 0.42);

    /* ---------- backpack (behind the shoulders) ---------- */
    var pPack = new Path2D();
    pPack.moveTo(X(0.352), Y(0.190));
    pPack.lineTo(X(0.648), Y(0.190));
    pPack.lineTo(X(0.664), Y(0.330));
    pPack.lineTo(X(0.636), Y(0.404));
    pPack.lineTo(X(0.364), Y(0.404));
    pPack.lineTo(X(0.336), Y(0.330));
    pPack.closePath();
    plate(pPack, Y(0.18), Y(0.41), '#e6f1f9', '#b9cee0', '#6d89a2');
    /* pack vents */
    for (var pv = 0; pv < 3; pv++) {
      g2.fillStyle = 'rgba(16,30,44,0.92)';
      g2.fillRect(X(0.402), Y(0.238 + pv * 0.038), MW * 0.196, MH * 0.016);
      g2.fillStyle = 'rgba(' + GLOW + ',0.45)';
      g2.fillRect(X(0.402), Y(0.238 + pv * 0.038), MW * 0.196, MH * 0.004);
    }
    /* nozzles */
    function nozzle(px, py) {
      g2.fillStyle = '#16283a';
      g2.beginPath();
      g2.ellipse(px, py, MW * 0.038, MH * 0.020, 0, 0, TAU);
      g2.fill();
      g2.save();
      g2.shadowColor = 'rgba(' + ORANGE + ',1)';
      g2.shadowBlur = 20 * u;
      g2.fillStyle = 'rgba(' + ORANGE + ',0.95)';
      g2.beginPath();
      g2.ellipse(px, py + MH * 0.004, MW * 0.024, MH * 0.012, 0, 0, TAU);
      g2.fill();
      g2.shadowBlur = 0;
      g2.fillStyle = 'rgba(255,246,220,0.95)';
      g2.beginPath();
      g2.ellipse(px, py + MH * 0.004, MW * 0.011, MH * 0.005, 0, 0, TAU);
      g2.fill();
      g2.restore();
    }
    nozzle(X(0.412), Y(0.404));
    nozzle(X(0.588), Y(0.404));

    /* ---------- shoulders ---------- */
    var pShL = new Path2D();
    pShL.moveTo(X(0.234), Y(0.196));
    pShL.lineTo(X(0.150), Y(0.208));
    pShL.lineTo(X(0.100), Y(0.256));
    pShL.lineTo(X(0.092), Y(0.322));
    pShL.lineTo(X(0.138), Y(0.360));
    pShL.lineTo(X(0.212), Y(0.348));
    pShL.lineTo(X(0.252), Y(0.300));
    pShL.closePath();
    plate(pShL, Y(0.19), Y(0.37), '#f4fafd', '#caddec', '#7b93aa');

    var pShL2 = new Path2D();
    pShL2.moveTo(X(0.112), Y(0.290));
    pShL2.lineTo(X(0.098), Y(0.330));
    pShL2.lineTo(X(0.142), Y(0.364));
    pShL2.lineTo(X(0.208), Y(0.352));
    pShL2.lineTo(X(0.236), Y(0.322));
    pShL2.lineTo(X(0.168), Y(0.330));
    pShL2.closePath();
    plate(pShL2, Y(0.28), Y(0.37), '#2b4964', '#1f364c', '#152838');
    seam(X(0.120), Y(0.336), X(0.222), Y(0.350), Math.max(1, 1.5 * u), GLOW);

    var pShR = new Path2D();
    pShR.moveTo(X(0.766), Y(0.196));
    pShR.lineTo(X(0.850), Y(0.208));
    pShR.lineTo(X(0.900), Y(0.256));
    pShR.lineTo(X(0.908), Y(0.322));
    pShR.lineTo(X(0.862), Y(0.360));
    pShR.lineTo(X(0.788), Y(0.348));
    pShR.lineTo(X(0.748), Y(0.300));
    pShR.closePath();
    plate(pShR, Y(0.19), Y(0.37), '#f7fbfe', '#d2e2ee', '#7f97ae');

    var pShR2 = new Path2D();
    pShR2.moveTo(X(0.888), Y(0.290));
    pShR2.lineTo(X(0.902), Y(0.330));
    pShR2.lineTo(X(0.858), Y(0.364));
    pShR2.lineTo(X(0.792), Y(0.352));
    pShR2.lineTo(X(0.764), Y(0.322));
    pShR2.lineTo(X(0.832), Y(0.330));
    pShR2.closePath();
    plate(pShR2, Y(0.28), Y(0.37), '#2b4964', '#1f364c', '#152838');
    seam(X(0.780), Y(0.330), X(0.880), Y(0.346), Math.max(1, 1.5 * u), MAG);

    /* ---------- torso back ---------- */
    var pTorso = new Path2D();
    pTorso.moveTo(X(0.286), Y(0.212));
    pTorso.lineTo(X(0.714), Y(0.212));
    pTorso.lineTo(X(0.742), Y(0.320));
    pTorso.lineTo(X(0.706), Y(0.470));
    pTorso.lineTo(X(0.664), Y(0.566));
    pTorso.lineTo(X(0.336), Y(0.566));
    pTorso.lineTo(X(0.294), Y(0.470));
    pTorso.lineTo(X(0.258), Y(0.320));
    pTorso.closePath();
    plate(pTorso, Y(0.20), Y(0.58), '#f2f9fd', '#c8dbea', '#7d95ab');

    /* spine plate */
    var pSpine = new Path2D();
    pSpine.moveTo(X(0.444), Y(0.222));
    pSpine.lineTo(X(0.556), Y(0.222));
    pSpine.lineTo(X(0.566), Y(0.360));
    pSpine.lineTo(X(0.540), Y(0.548));
    pSpine.lineTo(X(0.460), Y(0.548));
    pSpine.lineTo(X(0.434), Y(0.360));
    pSpine.closePath();
    plate(pSpine, Y(0.21), Y(0.56), '#ffffff', '#dbe9f4', '#94aec2');
    seam(X(0.444), Y(0.240), X(0.444), Y(0.540), Math.max(1, 1.7 * u), GLOW);
    seam(X(0.556), Y(0.240), X(0.556), Y(0.540), Math.max(1, 1.7 * u), GLOW);

    /* shoulder blade plates */
    var pBlL = new Path2D();
    pBlL.moveTo(X(0.300), Y(0.230));
    pBlL.lineTo(X(0.428), Y(0.230));
    pBlL.lineTo(X(0.420), Y(0.404));
    pBlL.lineTo(X(0.320), Y(0.418));
    pBlL.lineTo(X(0.288), Y(0.330));
    pBlL.closePath();
    plate(pBlL, Y(0.22), Y(0.43), '#eaf4fb', '#bdd2e3', '#7791a9');

    var pBlR = new Path2D();
    pBlR.moveTo(X(0.700), Y(0.230));
    pBlR.lineTo(X(0.572), Y(0.230));
    pBlR.lineTo(X(0.580), Y(0.404));
    pBlR.lineTo(X(0.680), Y(0.418));
    pBlR.lineTo(X(0.712), Y(0.330));
    pBlR.closePath();
    plate(pBlR, Y(0.22), Y(0.43), '#eef7fc', '#c3d7e7', '#7b94ab');

    /* lower back vents */
    for (var bv = 0; bv < 3; bv++) {
      g2.fillStyle = 'rgba(16,30,44,0.92)';
      g2.fillRect(X(0.352), Y(0.462 + bv * 0.030), MW * 0.072, MH * 0.014);
      g2.fillRect(X(0.576), Y(0.462 + bv * 0.030), MW * 0.072, MH * 0.014);
      g2.fillStyle = 'rgba(' + GLOW + ',0.40)';
      g2.fillRect(X(0.352), Y(0.462 + bv * 0.030), MW * 0.072, MH * 0.0035);
      g2.fillRect(X(0.576), Y(0.462 + bv * 0.030), MW * 0.072, MH * 0.0035);
    }

    /* ---------- arms ---------- */
    var pArmL = new Path2D();
    pArmL.moveTo(X(0.130), Y(0.250));
    pArmL.lineTo(X(0.226), Y(0.244));
    pArmL.lineTo(X(0.242), Y(0.420));
    pArmL.lineTo(X(0.226), Y(0.610));
    pArmL.lineTo(X(0.146), Y(0.610));
    pArmL.lineTo(X(0.122), Y(0.424));
    pArmL.closePath();
    plate(pArmL, Y(0.24), Y(0.62), '#e9f3fa', '#b9cfe0', '#768fa6');

    var pArmR = new Path2D();
    pArmR.moveTo(X(0.870), Y(0.250));
    pArmR.lineTo(X(0.774), Y(0.244));
    pArmR.lineTo(X(0.758), Y(0.420));
    pArmR.lineTo(X(0.774), Y(0.610));
    pArmR.lineTo(X(0.854), Y(0.610));
    pArmR.lineTo(X(0.878), Y(0.424));
    pArmR.closePath();
    plate(pArmR, Y(0.24), Y(0.62), '#f4fafd', '#c6d9e9', '#7b93aa');

    var bands = [
      [0.124, 0.238, 0.470], [0.762, 0.876, 0.470],
      [0.128, 0.232, 0.556], [0.768, 0.872, 0.556]
    ];
    for (var ab = 0; ab < bands.length; ab++) {
      var b = bands[ab];
      g2.fillStyle = 'rgba(20,36,52,0.92)';
      g2.fillRect(X(b[0]), Y(b[2]), (b[1] - b[0]) * MW, MH * 0.013);
      g2.fillStyle = 'rgba(190,235,255,0.40)';
      g2.fillRect(X(b[0]), Y(b[2]), (b[1] - b[0]) * MW, MH * 0.0035);
    }

    /* ---------- hips + legs ---------- */
    var pHip = new Path2D();
    pHip.moveTo(X(0.322), Y(0.552));
    pHip.lineTo(X(0.678), Y(0.552));
    pHip.lineTo(X(0.700), Y(0.622));
    pHip.lineTo(X(0.300), Y(0.622));
    pHip.closePath();
    plate(pHip, Y(0.54), Y(0.63), '#e7f2f9', '#b6cbdd', '#748da4');

    function leg(x0, x1, kx) {
      var pLeg = new Path2D();
      pLeg.moveTo(X(x0), Y(0.606));
      pLeg.lineTo(X(x1), Y(0.606));
      pLeg.lineTo(X(x1 - 0.006), Y(0.780));
      pLeg.lineTo(X(kx + 0.052), Y(0.940));
      pLeg.lineTo(X(kx + 0.058), Y(0.988));
      pLeg.lineTo(X(kx - 0.058), Y(0.988));
      pLeg.lineTo(X(kx - 0.052), Y(0.940));
      pLeg.lineTo(X(x0 + 0.006), Y(0.780));
      pLeg.closePath();
      plate(pLeg, Y(0.60), Y(0.99), '#eaf4fb', '#bdd2e3', '#7891a8');
      /* knee plate */
      g2.fillStyle = 'rgba(24,42,58,0.90)';
      g2.fillRect(X(kx - 0.062), Y(0.782), MW * 0.124, MH * 0.016);
      g2.fillStyle = 'rgba(' + GLOW + ',0.42)';
      g2.fillRect(X(kx - 0.062), Y(0.782), MW * 0.124, MH * 0.004);
      /* foot */
      var pFoot = new Path2D();
      pFoot.moveTo(X(kx - 0.070), Y(0.960));
      pFoot.lineTo(X(kx + 0.070), Y(0.960));
      pFoot.lineTo(X(kx + 0.082), Y(0.998));
      pFoot.lineTo(X(kx - 0.086), Y(0.998));
      pFoot.closePath();
      plate(pFoot, Y(0.95), Y(1.0), '#dcebf5', '#a9c2d5', '#6b8298');
    }
    leg(0.320, 0.474, 0.402);
    leg(0.526, 0.680, 0.600);

    /* ---------- neck ---------- */
    g2.fillStyle = '#1b2b3a';
    g2.beginPath();
    g2.moveTo(X(0.442), Y(0.132));
    g2.lineTo(X(0.558), Y(0.132));
    g2.lineTo(X(0.566), Y(0.216));
    g2.lineTo(X(0.434), Y(0.216));
    g2.closePath();
    g2.fill();
    g2.strokeStyle = 'rgba(150,210,240,0.40)';
    g2.lineWidth = Math.max(1, 1.3 * u);
    g2.beginPath();
    g2.moveTo(X(0.440), Y(0.158));
    g2.lineTo(X(0.560), Y(0.158));
    g2.moveTo(X(0.438), Y(0.182));
    g2.lineTo(X(0.562), Y(0.182));
    g2.stroke();

    /* ---------- head (seen from behind, turned slightly left) ---------- */
    var pHead = new Path2D();
    pHead.moveTo(X(0.412), Y(0.106));
    pHead.lineTo(X(0.416), Y(0.048));
    pHead.lineTo(X(0.448), Y(0.012));
    pHead.lineTo(X(0.552), Y(0.010));
    pHead.lineTo(X(0.586), Y(0.044));
    pHead.lineTo(X(0.592), Y(0.104));
    pHead.lineTo(X(0.576), Y(0.144));
    pHead.lineTo(X(0.500), Y(0.156));
    pHead.lineTo(X(0.428), Y(0.144));
    pHead.closePath();
    plate(pHead, Y(0.0), Y(0.17), '#ffffff', '#d3e3ef', '#88a1b7');
    /* rear vent */
    for (var hv = 0; hv < 3; hv++) {
      g2.fillStyle = 'rgba(16,30,44,0.92)';
      g2.fillRect(X(0.462), Y(0.096 + hv * 0.017), MW * 0.076, MH * 0.008);
    }
    /* sensor slit peeking round the left side */
    g2.save();
    g2.shadowColor = 'rgba(' + GLOW + ',1)';
    g2.shadowBlur = 18 * u;
    g2.strokeStyle = 'rgba(' + GLOW + ',1)';
    g2.lineWidth = Math.max(2, 3 * u);
    g2.beginPath();
    g2.moveTo(X(0.414), Y(0.062));
    g2.lineTo(X(0.416), Y(0.104));
    g2.stroke();
    g2.restore();
    /* antenna */
    g2.strokeStyle = 'rgba(180,220,245,0.85)';
    g2.lineWidth = Math.max(1, 1.6 * u);
    g2.beginPath();
    g2.moveTo(X(0.578), Y(0.020));
    g2.lineTo(X(0.602), Y(-0.052));
    g2.stroke();

    /* ---------- rim light: cyan left, magenta right ---------- */
    g2.save();
    g2.shadowColor = 'rgba(' + GLOW + ',0.9)';
    g2.shadowBlur = 10 * u;
    g2.strokeStyle = 'rgba(' + GLOW + ',0.50)';
    g2.lineWidth = Math.max(1.4, 2.2 * u);
    g2.beginPath();
    g2.moveTo(X(0.412), Y(0.104));
    g2.lineTo(X(0.414), Y(0.048));
    g2.lineTo(X(0.446), Y(0.014));
    g2.stroke();
    g2.beginPath();
    g2.moveTo(X(0.290), Y(0.216));
    g2.lineTo(X(0.262), Y(0.320));
    g2.lineTo(X(0.296), Y(0.470));
    g2.lineTo(X(0.336), Y(0.564));
    g2.stroke();
    g2.beginPath();
    g2.moveTo(X(0.152), Y(0.210));
    g2.lineTo(X(0.102), Y(0.258));
    g2.lineTo(X(0.094), Y(0.320));
    g2.stroke();
    g2.restore();
    g2.save();
    g2.shadowColor = 'rgba(' + MAG + ',0.9)';
    g2.shadowBlur = 10 * u;
    g2.strokeStyle = 'rgba(' + MAG + ',0.46)';
    g2.lineWidth = Math.max(1.4, 2.2 * u);
    g2.beginPath();
    g2.moveTo(X(0.710), Y(0.216));
    g2.lineTo(X(0.738), Y(0.320));
    g2.lineTo(X(0.704), Y(0.470));
    g2.lineTo(X(0.664), Y(0.564));
    g2.stroke();
    g2.beginPath();
    g2.moveTo(X(0.848), Y(0.210));
    g2.lineTo(X(0.898), Y(0.258));
    g2.lineTo(X(0.906), Y(0.320));
    g2.stroke();
    g2.restore();

    /* ---------- panel lines + rivets ---------- */
    g2.strokeStyle = 'rgba(34,52,70,0.55)';
    g2.lineWidth = Math.max(1, 1.2 * u);
    var lines = [
      [0.320, 0.404, 0.430, 0.404], [0.680, 0.404, 0.570, 0.404],
      [0.330, 0.440, 0.430, 0.440], [0.670, 0.440, 0.570, 0.440],
      [0.344, 0.640, 0.470, 0.640], [0.656, 0.640, 0.530, 0.640],
      [0.352, 0.720, 0.470, 0.720], [0.648, 0.720, 0.530, 0.720]
    ];
    for (var li = 0; li < lines.length; li++) {
      g2.beginPath();
      g2.moveTo(X(lines[li][0]), Y(lines[li][1]));
      g2.lineTo(X(lines[li][2]), Y(lines[li][3]));
      g2.stroke();
    }
    g2.fillStyle = 'rgba(70,98,124,0.78)';
    for (var rv = 0; rv < 22; rv++) {
      var rvx = 0.300 + (rv % 6) * 0.080;
      var rvy = 0.250 + Math.floor(rv / 6) * 0.150;
      g2.beginPath();
      g2.arc(X(rvx), Y(rvy), Math.max(1, 1.5 * u), 0, TAU);
      g2.fill();
    }

    /* ---------- fade the feet into the wet platform ---------- */
    var fade = g2.createLinearGradient(0, Y(0.94), 0, MH);
    fade.addColorStop(0, 'rgba(30,60,90,0)');
    fade.addColorStop(1, 'rgba(34,66,98,0.55)');
    g2.fillStyle = fade;
    g2.fillRect(0, Y(0.94), MW, MH - Y(0.94));

    g2.globalAlpha = 1;
  }

  function buildMechReflection() {
    var g = G;
    var bandH = H - g.baseY;
    if (bandH < 6) { return; }
    mechRefl = makeCanvas(DW, bandH * dpr);
    var x = mechRefl.getContext('2d');
    if (!x) { return; }
    var SQ = 0.40;
    var srcH = g.mh * 0.34;
    x.save();
    x.setTransform(dpr, 0, 0, -dpr * SQ, 0, 0);
    x.globalAlpha = 0.40;
    x.drawImage(mechCan, 0, (g.mh - srcH) * dpr, g.mw * dpr, srcH * dpr,
      0, -srcH, g.mw, srcH);
    x.restore();
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.globalAlpha = 1;
    x.globalCompositeOperation = 'destination-in';
    var mg = x.createLinearGradient(0, 0, 0, bandH);
    mg.addColorStop(0, 'rgba(0,0,0,0.85)');
    mg.addColorStop(0.55, 'rgba(0,0,0,0.30)');
    mg.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = mg;
    x.fillRect(0, 0, g.mw, bandH);
    x.globalCompositeOperation = 'source-over';
  }

  /* ------------------------------------------------------------------ rain */

  function makeRainTile(rng, count, minLen, maxLen, width, alpha) {
    var c = makeCanvas(TILE, TILE);
    var x = c.getContext('2d');
    x.lineCap = 'round';
    for (var i = 0; i < count; i++) {
      var bx = rng() * TILE, by = rng() * TILE;
      var len = minLen + rng() * (maxLen - minLen);
      var a = alpha * (0.25 + rng() * 0.75);
      x.strokeStyle = 'rgba(186,224,255,' + a.toFixed(3) + ')';
      x.lineWidth = width * (0.7 + rng() * 0.6);
      var dx = len * SIN_A, dy = len * COS_A;
      for (var oy = -1; oy <= 1; oy++) {
        for (var ox = -1; ox <= 1; ox++) {
          x.beginPath();
          x.moveTo(bx + ox * TILE, by + oy * TILE);
          x.lineTo(bx + ox * TILE + dx, by + oy * TILE + dy);
          x.stroke();
        }
      }
    }
    return c;
  }

  function buildRain() {
    var rng = makeRng(31337);
    patRain = ctx.createPattern(makeRainTile(rng, 150, 30, 70, 1.0, 0.30), 'repeat');
  }

  function drawRain(ay, ax, alpha) {
    if (!patRain) { return; }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = patRain;
    ctx.translate(ax, ay);
    ctx.fillRect(-ax, -ay, DW, DH);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
  }

  /* ------------------------------------------------------------- animation */

  function initClouds() {
    clouds.length = 0;
    var rng = makeRng(4242);
    for (var i = 0; i < 9; i++) {
      clouds.push({
        x: rng() * W,
        y: H * (0.02 + rng() * 0.30),
        w: W * (0.20 + rng() * 0.42),
        h: H * (0.030 + rng() * 0.070),
        sp: (2.5 + rng() * 6.0) * u,
        a: 0.10 + rng() * 0.16,
        s: Math.floor(rng() * 3)
      });
    }
  }

  function initCars() {
    cars.length = 0;
    var rng = makeRng(8080);
    for (var i = 0; i < 34; i++) {
      var lane = i % G.lanes.length;
      cars.push({
        lane: lane,
        p: rng(),
        sp: 0.55 + rng() * 0.9,
        len: 0.020 + rng() * 0.045,
        a: 0.35 + rng() * 0.55
      });
    }
  }

  function drawClouds(g2) {
    g2.save();
    g2.beginPath();
    g2.rect(0, 0, W, G.skyY + H * 0.02);
    g2.clip();
    for (var i = 0; i < clouds.length; i++) {
      var c = clouds[i];
      c.x += c.sp * 0.016;
      if (c.x - c.w > W) { c.x = -c.w; }
      blit(g2, cloudSpr[c.s], c.x, c.y, c.w, c.h, c.a);
    }
    g2.restore();
  }

  function drawBeams(g2) {
    if (!beamCan) { return; }
    g2.save();
    g2.globalCompositeOperation = 'lighter';
    for (var i = 0; i < G.beams.length; i++) {
      var b = G.beams[i];
      var ang = b.a0 + Math.sin(t * b.sp + b.ph) * b.amp;
      g2.save();
      g2.translate(b.x, b.y);
      g2.rotate(ang);
      g2.globalAlpha = 0.30 + 0.14 * Math.sin(t * b.sp * 1.7 + b.ph);
      var bw = 250 * b.sc * u;
      var bh = 560 * b.sc * u;
      g2.drawImage(beamCan, -bw / 2, -bh + 4 * u, bw, bh);
      g2.restore();
    }
    g2.restore();
    g2.globalAlpha = 1;
  }

  function drawCars(g2) {
    for (var i = 0; i < cars.length; i++) {
      var c = cars[i];
      var ln = G.lanes[c.lane];
      c.p += c.sp * 0.00035 * (ln.sp > 0 ? 1 : 1) * (Math.abs(ln.sp) / 46);
      if (c.p > 1.15) { c.p = -0.15; }
      var x = ln.x0 + (ln.x1 - ln.x0) * c.p;
      var y = ln.y;
      var spr = ln.c === 'cyan' ? sprCyan : (ln.c === 'mag' ? sprMag : sprWarm);
      blit(g2, spr, x, y, Math.abs(ln.x1 - ln.x0) * c.len, 7 * u, c.a * 0.5);
      g2.fillStyle = ln.c === 'cyan' ? 'rgba(190,248,255,' + c.a.toFixed(2) + ')'
        : (ln.c === 'mag' ? 'rgba(255,190,225,' + c.a.toFixed(2) + ')'
          : 'rgba(255,236,200,' + c.a.toFixed(2) + ')');
      g2.fillRect(x - Math.abs(ln.x1 - ln.x0) * c.len * 0.5, y - 1.2 * u,
        Math.abs(ln.x1 - ln.x0) * c.len, 2.4 * u);
    }
  }

  function drawBeacons(g2) {
    for (var i = 0; i < G.beacons.length; i++) {
      var b = G.beacons[i];
      var k = Math.sin(t * 1.35 + b.ph);
      var on = k > 0.15 ? 1 : (k > -0.1 ? 0.35 : 0.06);
      var spr = b.c === 'mag' ? sprMag : (b.c === 'cyan' ? sprCyan : sprWarm);
      blit(g2, spr, b.x, b.y, 54 * u, 54 * u, 0.42 * on);
      g2.globalAlpha = on;
      g2.fillStyle = b.c === 'mag' ? 'rgba(255,150,205,1)'
        : (b.c === 'cyan' ? 'rgba(190,248,255,1)' : 'rgba(255,240,200,1)');
      g2.beginPath();
      g2.arc(b.x, b.y, Math.max(1.5, 2.4 * u), 0, TAU);
      g2.fill();
      g2.globalAlpha = 1;
    }
  }

  /* -------------------------------------------------------------- per frame */

  function drawFrame(dt) {
    var g2 = ctx;
    var g = G;
    g2.setTransform(dpr, 0, 0, dpr, 0, 0);
    g2.globalAlpha = 1;
    g2.globalCompositeOperation = 'source-over';

    /* 1. sky, city, parapet, platform */
    g2.drawImage(bgCan, 0, 0, W, H);

    /* 2. drifting cloud */
    drawClouds(g2);

    /* 3. searchlights sweeping over the city */
    drawBeams(g2);

    /* 4. car light trails */
    drawCars(g2);

    /* 5. the mech, then its wet reflection below its feet */
    if (mechCan) {
      g2.drawImage(mechCan, g.mx, g.my, g.mw, g.mh);
    }
    if (mechRefl) {
      g2.globalAlpha = 0.85;
      g2.drawImage(mechRefl, g.mx, g.baseY, g.mw, H - g.baseY);
      g2.globalAlpha = 1;
    }

    /* 6. armour seams breathing */
    for (var i = 0; i < g.seams.length; i++) {
      var s = g.seams[i];
      var k = 0.55 + 0.45 * Math.sin(t * 1.45 + i * 1.6);
      blit(g2, sprCyan, s.x, s.y, g.mw * s.r * 2.2, g.mh * s.r * 1.1, 0.10 + 0.14 * k);
    }
    /* 7. thruster glow below the pack */
    var th = 0.6 + 0.4 * Math.sin(t * 2.6);
    blit(g2, sprOrange, g.nozzleL.x, g.nozzleL.y + g.mh * 0.012, g.mw * 0.16, g.mh * 0.06, 0.30 + 0.18 * th);
    blit(g2, sprOrange, g.nozzleR.x, g.nozzleR.y + g.mh * 0.012, g.mw * 0.16, g.mh * 0.06, 0.30 + 0.18 * th);
    /* head sensor bloom */
    blit(g2, sprCyan, g.headLight.x, g.headLight.y, g.mw * 0.10, g.mh * 0.045, 0.34);

    /* 8. roof beacons */
    drawBeacons(g2);

    /* 9. rain: far then near */
    drawRain(mod(t * 300 * COS_A, TILE), mod(t * 300 * SIN_A, TILE), 0.28);
    drawRain(mod(t * 520 * COS_A, TILE), mod(t * 520 * SIN_A, TILE), 0.40);

    /* 10. keep the top-right corner dark for the host button */
    g2.globalAlpha = 1;
    g2.drawImage(scrimCan, W - 300 * u, -40 * u, 348 * u, 226 * u);
  }

  /* --------------------------------------------------------------- runtime */

  function frame(ts) {
    rafId = window.requestAnimationFrame(frame);
    if (!last) { last = ts; return; }
    var dt = (ts - last) / 1000;
    last = ts;
    if (dt > 0.05) { dt = 0.05; }
    if (dt <= 0) { dt = 0.001; }
    t += dt;
    drawFrame(dt);
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

  function layout() {
    W = Math.max(1, window.innerWidth);
    H = Math.max(1, window.innerHeight);
    dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    DW = Math.max(1, Math.round(W * dpr));
    DH = Math.max(1, Math.round(H * dpr));
    u = Math.min(W / 1280, H / 720);

    cv.width = DW;
    cv.height = DH;
    cv.style.width = W + 'px';
    cv.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;

    buildSprites();
    computeGeo();
    buildCity();
    buildMech();
    buildMechReflection();
    buildRain();
    initClouds();
    initCars();
    last = 0;
  }

  window.addEventListener('resize', function () {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(layout, 120);
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { stop(); } else { start(); }
  });

  layout();
  start();
}());
