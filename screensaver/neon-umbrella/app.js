/* ===========================================================================
   mecha sortie  --  a 3/4 bust of a blue-white armoured mech standing in a
   neon rain street: single glowing eye sensor, layered armour, glowing seams,
   thrusters, wet-ground reflection and a thin HUD frame.

   Pure 2D canvas, fully procedural. No external images / fonts / network /
   storage. No pointer or key listeners, no exit button (the host injects it).
   Nothing human is drawn anywhere: the subject is a machine.

   Static art (city, mech body, reflection, rain tile, HUD ticks) is baked into
   offscreen canvases and only blitted per frame. Per-frame code never calls
   shadowBlur / createRadialGradient / getImageData / fillText.
   =========================================================================== */
(function () {
  'use strict';

  var cv = document.getElementById('stage');
  var ctx = cv && cv.getContext ? cv.getContext('2d') : null;
  if (!ctx) { return; }

  var TAU = 6.283185307179586;
  var MAX_DPR = 1.5;
  var HOR = 0.655;                      /* city base line */
  var RAIN_DEG = 14;
  var SIN_A = Math.sin(RAIN_DEG * Math.PI / 180);
  var COS_A = Math.cos(RAIN_DEG * Math.PI / 180);
  var TILE = 512;

  var W = 1, H = 1, dpr = 1, DW = 1, DH = 1, u = 1, HZ = 1;

  var bgCan = null, bgc = null;
  var reflCan = null, rc = null;
  var mechCan = null, mxc = null;
  var mechRefl = null;
  var scrimCan = null;
  var patRain = null;

  var sprCyan = null, sprIce = null, sprOrange = null, sprPink = null,
    sprWhite = null, sprWarm = null, sprCool = null;

  var G = {};
  var particles = [];
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
    gr.addColorStop(0.26, 'rgba(' + r + ',' + g + ',' + b + ',' + (coreA * 0.60).toFixed(3) + ')');
    gr.addColorStop(0.58, 'rgba(' + r + ',' + g + ',' + b + ',' + (coreA * 0.20).toFixed(3) + ')');
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

  function buildSprites() {
    sprCyan = softSprite(160, 90, 226, 255, 0.95);
    sprIce = softSprite(160, 168, 236, 255, 0.90);
    sprOrange = softSprite(160, 255, 154, 60, 0.95);
    sprPink = softSprite(160, 255, 96, 186, 0.90);
    sprWhite = softSprite(160, 255, 255, 255, 0.95);
    sprWarm = softSprite(160, 255, 214, 150, 0.90);
    sprCool = softSprite(160, 120, 170, 240, 0.75);

    scrimCan = makeCanvas(400, 280);
    var x = scrimCan.getContext('2d');
    var gr = x.createRadialGradient(200, 140, 12, 200, 140, 200);
    gr.addColorStop(0, 'rgba(10,16,28,0.72)');
    gr.addColorStop(0.45, 'rgba(12,20,34,0.50)');
    gr.addColorStop(0.75, 'rgba(14,24,40,0.20)');
    gr.addColorStop(1, 'rgba(12,18,30,0)');
    x.fillStyle = gr;
    x.fillRect(0, 0, 400, 280);
  }

  /* ------------------------------------------------------------- geometry */

  function computeGeo() {
    var g = {};
    g.mw = W * 0.56;
    g.mh = H * 0.66;
    g.mx = W * 0.50 - g.mw * 0.5;
    g.my = H * 0.075;
    g.baseY = g.my + g.mh;
    g.cx = g.mx + g.mw * 0.5;

    function P(fx, fy) {
      return { x: g.mx + fx * g.mw, y: g.my + fy * g.mh };
    }
    g.P = P;

    /* animated anchors, in screen space */
    g.eye = { x0: g.mx + 0.418 * g.mw, x1: g.mx + 0.622 * g.mw, y: g.my + 0.133 * g.mh };
    g.eye.h = g.mh * 0.024;
    g.core = P(0.50, 0.497);
    g.thrustL = P(0.292, 0.268);
    g.thrustR = P(0.706, 0.258);
    g.seams = [
      { x: g.mx + 0.50 * g.mw, y: g.my + 0.30 * g.mh, r: 0.030 },
      { x: g.mx + 0.40 * g.mw, y: g.my + 0.44 * g.mh, r: 0.024 },
      { x: g.mx + 0.60 * g.mw, y: g.my + 0.44 * g.mh, r: 0.024 },
      { x: g.mx + 0.34 * g.mw, y: g.my + 0.40 * g.mh, r: 0.020 },
      { x: g.mx + 0.66 * g.mw, y: g.my + 0.40 * g.mh, r: 0.020 },
      { x: g.mx + 0.45 * g.mw, y: g.my + 0.66 * g.mh, r: 0.018 },
      { x: g.mx + 0.55 * g.mw, y: g.my + 0.66 * g.mh, r: 0.018 }
    ];
    G = g;
  }

  /* ------------------------------------------------------------ the city */

  function buildCity() {
    bgCan = makeCanvas(DW, DH);
    bgc = bgCan.getContext('2d');
    var g2 = bgc;
    g2.setTransform(dpr, 0, 0, dpr, 0, 0);
    g2.clearRect(0, 0, W, H);

    /* night sky, lifted by the city's own light pollution */
    var sky = g2.createLinearGradient(0, 0, 0, HZ);
    sky.addColorStop(0.00, '#31506f');
    sky.addColorStop(0.35, '#456c93');
    sky.addColorStop(0.70, '#5c90b9');
    sky.addColorStop(1.00, '#7cb3d8');
    g2.fillStyle = sky;
    g2.fillRect(0, 0, W, HZ + 2);

    /* wet street */
    var grd = g2.createLinearGradient(0, HZ, 0, H);
    grd.addColorStop(0.00, '#6394ba');
    grd.addColorStop(0.30, '#4577a2');
    grd.addColorStop(0.70, '#2e5a7d');
    grd.addColorStop(1.00, '#20405c');
    g2.fillStyle = grd;
    g2.fillRect(0, HZ, W, H - HZ + 2);

    /* big neon light pools */
    blit(g2, sprCyan, W * 0.16, H * 0.46, W * 0.62, H * 0.50, 0.55);
    blit(g2, sprPink, W * 0.86, H * 0.40, W * 0.50, H * 0.44, 0.46);
    blit(g2, sprOrange, W * 0.72, H * 0.58, W * 0.46, H * 0.30, 0.50);
    blit(g2, sprCool, W * 0.50, H * 0.60, W * 0.90, H * 0.26, 0.34);

    var rng = makeRng(90211);

    /* skyline: three hazy layers */
    function skyline(cfg) {
      var x = -cfg.pad * W;
      while (x < W * (1 + cfg.pad)) {
        var bw = (cfg.wMin + rng() * (cfg.wMax - cfg.wMin)) * W;
        var bh = (cfg.hMin + rng() * (cfg.hMax - cfg.hMin)) * H;
        if (cfg.hole && x + bw > cfg.hole[0] * W && x < cfg.hole[1] * W) {
          x = cfg.hole[1] * W;
          continue;
        }
        var top = HZ - bh;
        g2.fillStyle = cfg.color;
        g2.fillRect(x, top, bw, bh + 3 * u);

        /* a neon strip on one edge of the tower */
        if (rng() < cfg.strip) {
          g2.fillStyle = rng() < 0.5 ? 'rgba(127,240,255,0.85)' : 'rgba(255,154,60,0.85)';
          g2.fillRect(x + (rng() < 0.5 ? 0 : bw - 2 * u), top, Math.max(1.2, 2 * u), bh * (0.4 + rng() * 0.6));
        }
        if (cfg.rim) {
          g2.strokeStyle = cfg.rim;
          g2.lineWidth = Math.max(1, 1.1 * u);
          g2.beginPath();
          g2.moveTo(x, top + 0.5 * u);
          g2.lineTo(x + bw, top + 0.5 * u);
          g2.stroke();
        }

        /* windows */
        var cw = cfg.cellW * W;
        var ch = cfg.cellH * H;
        var cols = Math.max(1, Math.floor((bw * 0.84) / cw));
        var rows = Math.max(1, Math.floor((bh * 0.86) / ch));
        var ox = x + (bw - cols * cw) / 2 + cw * 0.24;
        var oy = top + ch * 0.78;
        for (var r = 0; r < rows; r++) {
          for (var c = 0; c < cols; c++) {
            if (rng() > cfg.win) { continue; }
            var wa = cfg.waMin + rng() * (cfg.waMax - cfg.waMin);
            var kind = rng();
            var col = kind < 0.34 ? '255,190,110' : (kind < 0.62 ? '150,240,255' : '255,150,205');
            var wx = ox + c * cw;
            var wy = oy + r * ch;
            g2.fillStyle = 'rgba(' + col + ',' + wa.toFixed(3) + ')';
            g2.fillRect(wx, wy, cw * 0.55, ch * 0.52);
            if (wa > 0.55) {
              blit(g2, kind < 0.34 ? sprWarm : sprIce, wx + cw * 0.28, wy + ch * 0.26,
                cw * 3.0, ch * 3.0, (wa - 0.55) * 0.55);
            }
          }
        }
        x += bw + (rng() < 0.2 ? cfg.gap * W : 0);
      }
    }

    skyline({
      pad: 0.05, wMin: 0.045, wMax: 0.135, hMin: 0.075, hMax: 0.20, gap: 0.010,
      color: '#1a3450', rim: 'rgba(120,180,230,0.35)', strip: 0.12,
      win: 0.20, cellW: 0.0086, cellH: 0.0096, waMin: 0.18, waMax: 0.55
    });
    fogBand(g2, HZ - H * 0.40, HZ, 70, 120, 170, 0.06, 0.42);

    skyline({
      pad: 0.04, wMin: 0.060, wMax: 0.165, hMin: 0.11, hMax: 0.28, gap: 0.013,
      color: '#14293f', rim: 'rgba(150,220,255,0.45)', strip: 0.22,
      win: 0.22, cellW: 0.0106, cellH: 0.0116, waMin: 0.24, waMax: 0.75,
      hole: [0.30, 0.72]
    });
    fogBand(g2, HZ - H * 0.26, HZ, 56, 104, 154, 0.05, 0.26);

    skyline({
      pad: 0.03, wMin: 0.070, wMax: 0.175, hMin: 0.13, hMax: 0.30, gap: 0.016,
      color: '#0f2135', rim: 'rgba(176,236,255,0.55)', strip: 0.30,
      win: 0.24, cellW: 0.0124, cellH: 0.0134, waMin: 0.30, waMax: 0.90,
      hole: [0.36, 0.66]
    });
    fogBand(g2, HZ - H * 0.18, HZ, 46, 86, 132, 0.04, 0.14);

    /* hanging neon signs */
    var signs = [
      { x: 0.045, y: 0.30, w: 0.018, h: 0.13, c: '255,154,60', v: 0.9 },
      { x: 0.088, y: 0.20, w: 0.015, h: 0.10, c: '127,240,255', v: 0.85 },
      { x: 0.135, y: 0.38, w: 0.020, h: 0.15, c: '255,96,186', v: 0.8 },
      { x: 0.86, y: 0.26, w: 0.018, h: 0.12, c: '127,240,255', v: 0.85 },
      { x: 0.905, y: 0.40, w: 0.015, h: 0.09, c: '255,154,60', v: 0.8 }
    ];
    for (var i = 0; i < signs.length; i++) {
      var s = signs[i];
      var sx = s.x * W, sy = s.y * H, sw = s.w * W, sh = s.h * H;
      blit(g2, s.c === '255,154,60' ? sprOrange : (s.c === '255,96,186' ? sprPink : sprCyan),
        sx + sw / 2, sy + sh / 2, sw * 9, sh * 2.4, 0.34);
      g2.fillStyle = 'rgba(' + s.c + ',0.88)';
      g2.fillRect(sx, sy, sw, sh);
      g2.fillStyle = 'rgba(255,255,255,0.72)';
      g2.fillRect(sx + sw * 0.28, sy + sh * 0.06, sw * 0.44, sh * 0.88);
    }

    /* a light haze band right on the horizon line */
    var wl = g2.createLinearGradient(0, HZ - 30 * u, 0, HZ + 16 * u);
    wl.addColorStop(0.00, 'rgba(90,160,220,0)');
    wl.addColorStop(0.42, 'rgba(110,190,240,0.24)');
    wl.addColorStop(0.54, 'rgba(150,225,255,0.34)');
    wl.addColorStop(0.70, 'rgba(110,190,240,0.16)');
    wl.addColorStop(1.00, 'rgba(80,150,210,0)');
    g2.fillStyle = wl;
    g2.fillRect(0, HZ - 30 * u, W, 46 * u);

    /* HUD ticks and corner brackets, baked once */
    g2.strokeStyle = 'rgba(140,230,255,0.34)';
    g2.lineWidth = Math.max(1, 1.1 * u);
    var m = 26 * u;
    var bl = 46 * u;
    /* corners */
    g2.beginPath();
    g2.moveTo(m, m + bl); g2.lineTo(m, m); g2.lineTo(m + bl, m);
    g2.moveTo(W - m - bl, m); g2.lineTo(W - m, m); g2.lineTo(W - m, m + bl);
    g2.moveTo(m, H - m - bl); g2.lineTo(m, H - m); g2.lineTo(m + bl, H - m);
    g2.moveTo(W - m - bl, H - m); g2.lineTo(W - m, H - m); g2.lineTo(W - m, H - m - bl);
    g2.stroke();
    /* tick rulers */
    var tk;
    for (tk = 0; tk < 22; tk++) {
      var ty = m + bl + 24 * u + tk * 14 * u;
      if (ty > H * 0.42) { break; }
      var len = (tk % 5 === 0) ? 16 * u : 8 * u;
      g2.beginPath();
      g2.moveTo(m, ty); g2.lineTo(m + len, ty);
      g2.stroke();
    }
    for (tk = 0; tk < 26; tk++) {
      var tx = W - m - bl - 24 * u - tk * 14 * u;
      if (tx < W * 0.62) { break; }
      var len2 = (tk % 5 === 0) ? 16 * u : 8 * u;
      g2.beginPath();
      g2.moveTo(W - m, H - m - bl - 24 * u - tk * 14 * u);
      g2.lineTo(W - m - len2, H - m - bl - 24 * u - tk * 14 * u);
      g2.stroke();
    }
    /* a couple of static readout blocks */
    g2.fillStyle = 'rgba(140,230,255,0.30)';
    g2.fillRect(W - m - 118 * u, m + 16 * u, 46 * u, 4 * u);
    g2.fillRect(W - m - 118 * u, m + 26 * u, 78 * u, 4 * u);
    g2.fillRect(W - m - 118 * u, m + 36 * u, 30 * u, 4 * u);

    /* fine grain */
    var noise = makeCanvas(160, 160);
    var nx = noise.getContext('2d');
    if (nx) {
      var img = nx.createImageData(160, 160);
      var data = img.data;
      for (var p = 0; p < data.length; p += 4) {
        var v = 140 + Math.floor(Math.random() * 115);
        data[p] = v; data[p + 1] = v; data[p + 2] = v;
        data[p + 3] = Math.floor(Math.random() * 24);
      }
      nx.putImageData(img, 0, 0);
      var npat = g2.createPattern(noise, 'repeat');
      g2.globalAlpha = 0.50;
      g2.fillStyle = npat;
      g2.fillRect(0, 0, W, H);
      g2.globalAlpha = 1;
    }

    /* an atmospheric wash that keeps the whole frame high-key */
    g2.fillStyle = 'rgba(146,196,232,0.13)';
    g2.fillRect(0, 0, W, H);

    /* vignette */
    var vg = g2.createRadialGradient(W * 0.50, H * 0.46, Math.min(W, H) * 0.30,
      W * 0.50, H * 0.46, Math.max(W, H) * 0.82);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(0.60, 'rgba(120,170,210,0.03)');
    vg.addColorStop(1, 'rgba(14,32,52,0.30)');
    g2.fillStyle = vg;
    g2.fillRect(0, 0, W, H);
  }

  /* -------------------------------------------------------- ground mirror */

  function buildReflection() {
    var bandH = H - HZ;
    if (bandH < 4) { return; }
    reflCan = makeCanvas(DW, bandH * dpr);
    rc = reflCan.getContext('2d');
    if (!rc) { return; }
    rc.clearRect(0, 0, DW, bandH * dpr);

    var SQ = 0.54;
    var bands = 22;
    var bh = bandH / bands;
    var srcBand = bh / SQ;

    function pass(jit, alpha) {
      for (var i = 0; i < bands; i++) {
        var y0 = i * bh;
        var y1 = y0 + bh;
        var srcY = HZ - y1 / SQ;
        if (srcY < 0 || srcY + srcBand > HZ + 1) { continue; }
        var jx = (Math.sin(i * 1.63 + 0.5) * 2.2 + Math.sin(i * 0.47 + 2.1) * 1.5) * u * jit;
        rc.setTransform(dpr, 0, 0, -dpr * SQ, 0, y0 * dpr);
        rc.globalAlpha = alpha;
        rc.drawImage(bgCan, 0, srcY * dpr, DW, srcBand * dpr, jx, -srcBand, W, srcBand);
      }
    }

    pass(1.0, 0.40);
    pass(-1.8, 0.16);
    pass(2.8, 0.10);

    rc.setTransform(dpr, 0, 0, dpr, 0, 0);
    rc.globalAlpha = 1;
    rc.globalCompositeOperation = 'destination-in';
    var mg = rc.createLinearGradient(0, 0, 0, bandH);
    mg.addColorStop(0.00, 'rgba(0,0,0,0.95)');
    mg.addColorStop(0.24, 'rgba(0,0,0,0.82)');
    mg.addColorStop(0.55, 'rgba(0,0,0,0.52)');
    mg.addColorStop(1.00, 'rgba(0,0,0,0.16)');
    rc.fillStyle = mg;
    rc.fillRect(0, 0, W, bandH);
    rc.globalCompositeOperation = 'source-atop';
    rc.fillStyle = 'rgba(16,32,52,0.34)';
    rc.fillRect(0, 0, W, bandH);
    rc.globalCompositeOperation = 'source-over';
  }

  /* ---------------------------------------------------------------- the mech */

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

    var GLOW = '127,240,255';
    var ORANGE = '255,154,60';
    var LINE = 'rgba(24,36,50,0.85)';

    function plate(p, y0, y1, top, mid, bot) {
      var gr = g2.createLinearGradient(0, y0, MW * 0.42, y1);
      gr.addColorStop(0, top);
      gr.addColorStop(0.55, mid);
      gr.addColorStop(1, bot);
      g2.fillStyle = gr;
      g2.fill(p);
      g2.save();
      g2.clip(p);
      var bev = g2.createLinearGradient(0, y0, 0, y1);
      bev.addColorStop(0, 'rgba(255,255,255,0.72)');
      bev.addColorStop(0.14, 'rgba(255,255,255,0.05)');
      bev.addColorStop(0.74, 'rgba(8,18,30,0)');
      bev.addColorStop(1, 'rgba(8,18,30,0.58)');
      g2.fillStyle = bev;
      g2.fillRect(-MW, y0 - MH, MW * 3, (y1 - y0) + MH * 2);
      g2.restore();
      g2.strokeStyle = LINE;
      g2.lineWidth = Math.max(1, 1.6 * u);
      g2.stroke(p);
    }

    function seamGlow(x1, y1, x2, y2, w, col) {
      g2.save();
      g2.shadowColor = 'rgba(' + col + ',0.95)';
      g2.shadowBlur = 16 * u;
      g2.strokeStyle = 'rgba(' + col + ',0.95)';
      g2.lineWidth = w;
      g2.beginPath();
      g2.moveTo(x1, y1);
      g2.lineTo(x2, y2);
      g2.stroke();
      g2.restore();
    }

    /* ---------------- 1. dark inner body ---------------- */
    g2.fillStyle = '#16222f';
    g2.beginPath();
    g2.moveTo(X(0.330), Y(0.300));
    g2.lineTo(X(0.670), Y(0.300));
    g2.lineTo(X(0.700), Y(0.560));
    g2.lineTo(X(0.660), Y(0.760));
    g2.lineTo(X(0.340), Y(0.760));
    g2.lineTo(X(0.300), Y(0.560));
    g2.closePath();
    g2.fill();

    /* ---------------- 2. back thrusters ---------------- */
    function thruster(px, py, sc) {
      g2.save();
      g2.translate(px, py);
      g2.scale(sc, sc);
      var pH = new Path2D();
      pH.moveTo(-0.034 * MW, 0.028 * MH);
      pH.lineTo(0.034 * MW, 0.028 * MH);
      pH.lineTo(0.040 * MW, -0.012 * MH);
      pH.lineTo(-0.040 * MW, -0.012 * MH);
      pH.closePath();
      plate(pH, py - 0.04 * MH, py + 0.04 * MH, '#48596c', '#2b3948', '#17212c');
      g2.shadowColor = 'rgba(' + ORANGE + ',1)';
      g2.shadowBlur = 26 * u;
      g2.fillStyle = 'rgba(' + ORANGE + ',0.95)';
      g2.beginPath();
      g2.ellipse(0, -0.013 * MH, 0.028 * MW, 0.010 * MH, 0, 0, TAU);
      g2.fill();
      g2.shadowBlur = 0;
      g2.fillStyle = 'rgba(255,244,214,1)';
      g2.beginPath();
      g2.ellipse(0, -0.013 * MH, 0.014 * MW, 0.005 * MH, 0, 0, TAU);
      g2.fill();
      g2.restore();
    }
    thruster(X(0.286), Y(0.262), 1.0);
    thruster(X(0.714), Y(0.252), 0.92);

    /* ---------------- 3. pauldrons (angular, layered) ---------------- */
    var pShL1 = new Path2D();
    pShL1.moveTo(X(0.322), Y(0.308));
    pShL1.lineTo(X(0.236), Y(0.320));
    pShL1.lineTo(X(0.162), Y(0.368));
    pShL1.lineTo(X(0.118), Y(0.462));
    pShL1.lineTo(X(0.142), Y(0.556));
    pShL1.lineTo(X(0.212), Y(0.602));
    pShL1.lineTo(X(0.302), Y(0.580));
    pShL1.lineTo(X(0.346), Y(0.502));
    pShL1.closePath();
    plate(pShL1, Y(0.30), Y(0.61), '#f4fafd', '#cfdfec', '#7d97ae');

    var pShL2 = new Path2D();
    pShL2.moveTo(X(0.150), Y(0.478));
    pShL2.lineTo(X(0.168), Y(0.556));
    pShL2.lineTo(X(0.216), Y(0.596));
    pShL2.lineTo(X(0.298), Y(0.574));
    pShL2.lineTo(X(0.326), Y(0.516));
    pShL2.lineTo(X(0.246), Y(0.532));
    pShL2.closePath();
    plate(pShL2, Y(0.46), Y(0.60), '#2f4a63', '#22374c', '#16232f');

    var pShL3 = new Path2D();
    pShL3.moveTo(X(0.306), Y(0.316));
    pShL3.lineTo(X(0.238), Y(0.326));
    pShL3.lineTo(X(0.192), Y(0.360));
    pShL3.lineTo(X(0.222), Y(0.410));
    pShL3.lineTo(X(0.296), Y(0.392));
    pShL3.lineTo(X(0.330), Y(0.352));
    pShL3.closePath();
    plate(pShL3, Y(0.31), Y(0.42), '#ffffff', '#e0edf6', '#a6bfd2');
    seamGlow(X(0.238), Y(0.418), X(0.322), Y(0.398), Math.max(1, 1.4 * u), GLOW);

    /* right pauldron: larger, closer to camera */
    var pShR1 = new Path2D();
    pShR1.moveTo(X(0.678), Y(0.300));
    pShR1.lineTo(X(0.768), Y(0.310));
    pShR1.lineTo(X(0.850), Y(0.358));
    pShR1.lineTo(X(0.902), Y(0.452));
    pShR1.lineTo(X(0.884), Y(0.566));
    pShR1.lineTo(X(0.806), Y(0.618));
    pShR1.lineTo(X(0.712), Y(0.594));
    pShR1.lineTo(X(0.660), Y(0.506));
    pShR1.closePath();
    plate(pShR1, Y(0.29), Y(0.62), '#f7fbfe', '#d3e2ee', '#7f99b0');

    var pShR2 = new Path2D();
    pShR2.moveTo(X(0.874), Y(0.470));
    pShR2.lineTo(X(0.858), Y(0.562));
    pShR2.lineTo(X(0.804), Y(0.612));
    pShR2.lineTo(X(0.716), Y(0.588));
    pShR2.lineTo(X(0.688), Y(0.530));
    pShR2.lineTo(X(0.776), Y(0.548));
    pShR2.closePath();
    plate(pShR2, Y(0.45), Y(0.62), '#314d67', '#233949', '#16232f');

    var pShR3 = new Path2D();
    pShR3.moveTo(X(0.692), Y(0.308));
    pShR3.lineTo(X(0.764), Y(0.316));
    pShR3.lineTo(X(0.812), Y(0.350));
    pShR3.lineTo(X(0.782), Y(0.402));
    pShR3.lineTo(X(0.704), Y(0.384));
    pShR3.lineTo(X(0.668), Y(0.346));
    pShR3.closePath();
    plate(pShR3, Y(0.30), Y(0.41), '#ffffff', '#e2eef7', '#a8c1d4');
    seamGlow(X(0.706), Y(0.406), X(0.784), Y(0.386), Math.max(1, 1.4 * u), GLOW);

    /* shoulder cannon */
    var pGun = new Path2D();
    pGun.moveTo(X(0.812), Y(0.432));
    pGun.lineTo(X(0.868), Y(0.404));
    pGun.lineTo(X(0.916), Y(0.182));
    pGun.lineTo(X(0.868), Y(0.164));
    pGun.closePath();
    plate(pGun, Y(0.16), Y(0.44), '#e8f2f9', '#a9c2d6', '#6f8fa8');
    g2.fillStyle = 'rgba(10,18,28,0.95)';
    g2.beginPath();
    g2.ellipse(X(0.892), Y(0.174), 0.028 * MW, 0.011 * MH, -0.30, 0, TAU);
    g2.fill();
    g2.strokeStyle = 'rgba(' + GLOW + ',0.95)';
    g2.lineWidth = Math.max(1, 2.2 * u);
    g2.shadowColor = 'rgba(' + GLOW + ',0.9)';
    g2.shadowBlur = 12 * u;
    g2.beginPath();
    g2.ellipse(X(0.892), Y(0.174), 0.028 * MW, 0.011 * MH, -0.30, 0, TAU);
    g2.stroke();
    g2.shadowBlur = 0;
    for (var rb = 0; rb < 4; rb++) {
      var f = 0.24 + rb * 0.13;
      g2.strokeStyle = 'rgba(36,54,72,0.6)';
      g2.lineWidth = Math.max(1, 1.3 * u);
      g2.beginPath();
      g2.moveTo(X(0.816 + f * 0.10), Y(0.424 - f * 0.30));
      g2.lineTo(X(0.862 + f * 0.10), Y(0.406 - f * 0.30));
      g2.stroke();
    }

    /* ---------------- 4. arms ---------------- */
    var pArmL = new Path2D();
    pArmL.moveTo(X(0.220), Y(0.566));
    pArmL.lineTo(X(0.316), Y(0.556));
    pArmL.lineTo(X(0.322), Y(0.760));
    pArmL.lineTo(X(0.300), Y(0.876));
    pArmL.lineTo(X(0.212), Y(0.876));
    pArmL.lineTo(X(0.196), Y(0.746));
    pArmL.closePath();
    plate(pArmL, Y(0.55), Y(0.88), '#eaf3fa', '#bcd1e1', '#7892a9');

    var pArmR = new Path2D();
    pArmR.moveTo(X(0.684), Y(0.556));
    pArmR.lineTo(X(0.780), Y(0.566));
    pArmR.lineTo(X(0.804), Y(0.746));
    pArmR.lineTo(X(0.788), Y(0.876));
    pArmR.lineTo(X(0.700), Y(0.876));
    pArmR.lineTo(X(0.678), Y(0.760));
    pArmR.closePath();
    plate(pArmR, Y(0.55), Y(0.88), '#f2f9fd', '#c6dbeb', '#7d97ae');

    var armBands = [
      [0.204, 0.316, 0.700], [0.686, 0.798, 0.700],
      [0.198, 0.306, 0.800], [0.694, 0.802, 0.800]
    ];
    for (var ab = 0; ab < armBands.length; ab++) {
      var b = armBands[ab];
      g2.fillStyle = 'rgba(24,40,56,0.9)';
      g2.fillRect(X(b[0]), Y(b[2]), (b[1] - b[0]) * MW, 0.015 * MH);
      g2.fillStyle = 'rgba(190,238,255,0.45)';
      g2.fillRect(X(b[0]), Y(b[2]), (b[1] - b[0]) * MW, 0.004 * MH);
    }

    /* ---------------- 5. chest ---------------- */
    var pChest = new Path2D();
    pChest.moveTo(X(0.398), Y(0.300));
    pChest.lineTo(X(0.316), Y(0.396));
    pChest.lineTo(X(0.298), Y(0.520));
    pChest.lineTo(X(0.330), Y(0.636));
    pChest.lineTo(X(0.388), Y(0.742));
    pChest.lineTo(X(0.464), Y(0.804));
    pChest.lineTo(X(0.536), Y(0.804));
    pChest.lineTo(X(0.612), Y(0.742));
    pChest.lineTo(X(0.670), Y(0.636));
    pChest.lineTo(X(0.702), Y(0.520));
    pChest.lineTo(X(0.684), Y(0.396));
    pChest.lineTo(X(0.602), Y(0.300));
    pChest.closePath();
    plate(pChest, Y(0.29), Y(0.81), '#f8fcff', '#d2e3f0', '#7e98af');

    /* upper chest V plate */
    var pChestUp = new Path2D();
    pChestUp.moveTo(X(0.404), Y(0.306));
    pChestUp.lineTo(X(0.340), Y(0.392));
    pChestUp.lineTo(X(0.330), Y(0.474));
    pChestUp.lineTo(X(0.500), Y(0.560));
    pChestUp.lineTo(X(0.670), Y(0.474));
    pChestUp.lineTo(X(0.660), Y(0.392));
    pChestUp.lineTo(X(0.596), Y(0.306));
    pChestUp.closePath();
    plate(pChestUp, Y(0.30), Y(0.57), '#ffffff', '#e4f0f8', '#a8c0d3');
    g2.strokeStyle = 'rgba(' + GLOW + ',0.55)';
    g2.lineWidth = Math.max(1, 1.6 * u);
    g2.stroke(pChestUp);

    /* central core housing (hexagon) */
    var pCore = new Path2D();
    pCore.moveTo(X(0.500), Y(0.436));
    pCore.lineTo(X(0.556), Y(0.472));
    pCore.lineTo(X(0.556), Y(0.540));
    pCore.lineTo(X(0.500), Y(0.578));
    pCore.lineTo(X(0.444), Y(0.540));
    pCore.lineTo(X(0.444), Y(0.472));
    pCore.closePath();
    g2.fillStyle = 'rgba(11,20,32,0.97)';
    g2.fill(pCore);
    g2.strokeStyle = 'rgba(' + GLOW + ',1)';
    g2.lineWidth = Math.max(1.6, 2.4 * u);
    g2.shadowColor = 'rgba(' + GLOW + ',1)';
    g2.shadowBlur = 20 * u;
    g2.stroke(pCore);
    g2.shadowBlur = 0;
    g2.fillStyle = 'rgba(' + GLOW + ',0.60)';
    g2.beginPath();
    g2.ellipse(X(0.500), Y(0.508), 0.026 * MW, 0.028 * MH, 0, 0, TAU);
    g2.fill();
    g2.fillStyle = 'rgba(255,255,255,0.95)';
    g2.beginPath();
    g2.ellipse(X(0.500), Y(0.508), 0.011 * MW, 0.012 * MH, 0, 0, TAU);
    g2.fill();

    /* chest vents, one bank per side, mirrored low and wide */
    for (var v = 0; v < 3; v++) {
      var vy = 0.646 + v * 0.050;
      g2.fillStyle = 'rgba(22,36,52,0.92)';
      g2.fillRect(X(0.372), Y(vy), 0.070 * MW, 0.018 * MH);
      g2.fillRect(X(0.558), Y(vy), 0.070 * MW, 0.018 * MH);
      g2.fillStyle = 'rgba(' + GLOW + ',0.50)';
      g2.fillRect(X(0.372), Y(vy + 0.001), 0.070 * MW, 0.0035 * MH);
      g2.fillRect(X(0.558), Y(vy + 0.001), 0.070 * MW, 0.0035 * MH);
    }

    /* orange hazard marks kept off the face axis */
    g2.fillStyle = 'rgba(' + ORANGE + ',0.95)';
    g2.beginPath();
    g2.moveTo(X(0.322), Y(0.548));
    g2.lineTo(X(0.348), Y(0.548));
    g2.lineTo(X(0.342), Y(0.606));
    g2.lineTo(X(0.316), Y(0.606));
    g2.closePath();
    g2.fill();
    g2.beginPath();
    g2.moveTo(X(0.678), Y(0.548));
    g2.lineTo(X(0.652), Y(0.548));
    g2.lineTo(X(0.658), Y(0.606));
    g2.lineTo(X(0.684), Y(0.606));
    g2.closePath();
    g2.fill();

    /* chest seams */
    seamGlow(X(0.500), Y(0.582), X(0.500), Y(0.790), Math.max(1, 1.8 * u), GLOW);
    seamGlow(X(0.432), Y(0.596), X(0.418), Y(0.760), Math.max(1, 1.2 * u), GLOW);
    seamGlow(X(0.568), Y(0.596), X(0.582), Y(0.760), Math.max(1, 1.2 * u), GLOW);

    /* ---------------- 6. neck + collar ---------------- */
    g2.fillStyle = '#1b2836';
    g2.beginPath();
    g2.moveTo(X(0.448), Y(0.196));
    g2.lineTo(X(0.556), Y(0.196));
    g2.lineTo(X(0.560), Y(0.318));
    g2.lineTo(X(0.444), Y(0.318));
    g2.closePath();
    g2.fill();
    for (var nr = 0; nr < 3; nr++) {
      g2.strokeStyle = 'rgba(150,205,235,0.42)';
      g2.lineWidth = Math.max(1, 1.3 * u);
      g2.beginPath();
      g2.moveTo(X(0.448 + nr * 0.006), Y(0.236 + nr * 0.026));
      g2.lineTo(X(0.556 - nr * 0.006), Y(0.236 + nr * 0.026));
      g2.stroke();
    }
    var pCollar = new Path2D();
    pCollar.moveTo(X(0.384), Y(0.284));
    pCollar.lineTo(X(0.448), Y(0.252));
    pCollar.lineTo(X(0.556), Y(0.252));
    pCollar.lineTo(X(0.620), Y(0.284));
    pCollar.lineTo(X(0.606), Y(0.334));
    pCollar.lineTo(X(0.398), Y(0.334));
    pCollar.closePath();
    plate(pCollar, Y(0.25), Y(0.34), '#eef7fc', '#bfd4e4', '#839bb0');
    seamGlow(X(0.402), Y(0.312), X(0.598), Y(0.312), Math.max(1, 1.4 * u), GLOW);

    /* ---------------- 7. head ---------------- */
    g2.fillStyle = '#0b121b';
    g2.beginPath();
    g2.moveTo(X(0.386), Y(0.100));
    g2.lineTo(X(0.470), Y(0.020));
    g2.lineTo(X(0.560), Y(0.018));
    g2.lineTo(X(0.640), Y(0.090));
    g2.lineTo(X(0.640), Y(0.200));
    g2.lineTo(X(0.500), Y(0.192));
    g2.lineTo(X(0.386), Y(0.180));
    g2.closePath();
    g2.fill();

    var pHead = new Path2D();
    pHead.moveTo(X(0.386), Y(0.148));
    pHead.lineTo(X(0.380), Y(0.104));
    pHead.lineTo(X(0.404), Y(0.056));
    pHead.lineTo(X(0.472), Y(0.014));
    pHead.lineTo(X(0.562), Y(0.012));
    pHead.lineTo(X(0.634), Y(0.052));
    pHead.lineTo(X(0.650), Y(0.112));
    pHead.lineTo(X(0.654), Y(0.176));
    pHead.lineTo(X(0.612), Y(0.212));
    pHead.lineTo(X(0.548), Y(0.232));
    pHead.lineTo(X(0.470), Y(0.230));
    pHead.lineTo(X(0.416), Y(0.202));
    pHead.lineTo(X(0.392), Y(0.176));
    pHead.closePath();
    plate(pHead, Y(0.0), Y(0.25), '#ffffff', '#d8e7f2', '#93abbf');

    /* brow shelf */
    var pBrow = new Path2D();
    pBrow.moveTo(X(0.386), Y(0.130));
    pBrow.lineTo(X(0.386), Y(0.104));
    pBrow.lineTo(X(0.406), Y(0.058));
    pBrow.lineTo(X(0.474), Y(0.020));
    pBrow.lineTo(X(0.560), Y(0.018));
    pBrow.lineTo(X(0.630), Y(0.056));
    pBrow.lineTo(X(0.646), Y(0.114));
    pBrow.lineTo(X(0.520), Y(0.116));
    pBrow.closePath();
    plate(pBrow, Y(0.00), Y(0.14), '#ffffff', '#e6f1f8', '#aac2d4');

    /* visor recess */
    var pVisor = new Path2D();
    pVisor.moveTo(X(0.394), Y(0.128));
    pVisor.lineTo(X(0.648), Y(0.114));
    pVisor.lineTo(X(0.646), Y(0.176));
    pVisor.lineTo(X(0.400), Y(0.190));
    pVisor.closePath();
    g2.fillStyle = '#070e17';
    g2.fill(pVisor);
    g2.strokeStyle = 'rgba(30,50,70,0.95)';
    g2.lineWidth = Math.max(1, 1.8 * u);
    g2.stroke(pVisor);

    /* single eye sensor */
    g2.save();
    g2.beginPath();
    g2.rect(X(0.394), Y(0.116), 0.256 * MW, 0.080 * MH);
    g2.clip();
    g2.shadowColor = 'rgba(' + GLOW + ',1)';
    g2.shadowBlur = 30 * u;
    g2.fillStyle = 'rgba(' + GLOW + ',1)';
    g2.beginPath();
    g2.ellipse(X(0.516), Y(0.152), 0.090 * MW, 0.014 * MH, -0.07, 0, TAU);
    g2.fill();
    g2.shadowBlur = 0;
    g2.fillStyle = 'rgba(255,255,255,1)';
    g2.beginPath();
    g2.ellipse(X(0.516), Y(0.152), 0.054 * MW, 0.0070 * MH, -0.07, 0, TAU);
    g2.fill();
    g2.restore();

    /* chin plate with vents */
    var pJaw = new Path2D();
    pJaw.moveTo(X(0.400), Y(0.190));
    pJaw.lineTo(X(0.646), Y(0.176));
    pJaw.lineTo(X(0.652), Y(0.180));
    pJaw.lineTo(X(0.612), Y(0.214));
    pJaw.lineTo(X(0.548), Y(0.234));
    pJaw.lineTo(X(0.470), Y(0.232));
    pJaw.lineTo(X(0.416), Y(0.204));
    pJaw.closePath();
    plate(pJaw, Y(0.18), Y(0.24), '#e3eef7', '#b6cbdb', '#7d96ac');
    for (var jv = 0; jv < 3; jv++) {
      g2.fillStyle = 'rgba(16,28,42,0.92)';
      g2.fillRect(X(0.470 + jv * 0.042), Y(0.202), 0.026 * MW, 0.012 * MH);
    }

    /* ear pod + fin */
    var pEar = new Path2D();
    pEar.moveTo(X(0.632), Y(0.092));
    pEar.lineTo(X(0.688), Y(0.104));
    pEar.lineTo(X(0.692), Y(0.180));
    pEar.lineTo(X(0.640), Y(0.190));
    pEar.closePath();
    plate(pEar, Y(0.09), Y(0.20), '#edf6fb', '#bdd2e2', '#7f97ac');
    g2.fillStyle = 'rgba(' + GLOW + ',0.9)';
    g2.fillRect(X(0.650), Y(0.114), 0.022 * MW, 0.050 * MH);

    var pFin = new Path2D();
    pFin.moveTo(X(0.626), Y(0.058));
    pFin.lineTo(X(0.706), Y(-0.026));
    pFin.lineTo(X(0.714), Y(0.000));
    pFin.lineTo(X(0.646), Y(0.072));
    pFin.closePath();
    plate(pFin, Y(-0.04), Y(0.09), '#e2eef7', '#a4bed2', '#6f8fa8');

    /* head rim lights */
    g2.save();
    g2.strokeStyle = 'rgba(' + GLOW + ',0.9)';
    g2.lineWidth = Math.max(1.6, 2.6 * u);
    g2.shadowColor = 'rgba(' + GLOW + ',0.95)';
    g2.shadowBlur = 14 * u;
    g2.beginPath();
    g2.moveTo(X(0.386), Y(0.150));
    g2.lineTo(X(0.382), Y(0.104));
    g2.lineTo(X(0.406), Y(0.056));
    g2.lineTo(X(0.472), Y(0.014));
    g2.stroke();
    g2.restore();
    g2.strokeStyle = 'rgba(' + ORANGE + ',0.8)';
    g2.lineWidth = Math.max(1.2, 2.2 * u);
    g2.beginPath();
    g2.moveTo(X(0.652), Y(0.070));
    g2.lineTo(X(0.656), Y(0.178));
    g2.stroke();

    /* ---------------- 8. panel lines + rivets ---------------- */
    g2.strokeStyle = 'rgba(36,54,72,0.6)';
    g2.lineWidth = Math.max(1, 1.2 * u);
    var lines = [
      [0.340, 0.470, 0.318, 0.520],
      [0.318, 0.520, 0.344, 0.612],
      [0.660, 0.470, 0.682, 0.520],
      [0.682, 0.520, 0.656, 0.612],
      [0.352, 0.690, 0.392, 0.690],
      [0.648, 0.690, 0.608, 0.690],
      [0.470, 0.724, 0.530, 0.724],
      [0.474, 0.780, 0.526, 0.780]
    ];
    for (var li = 0; li < lines.length; li++) {
      g2.beginPath();
      g2.moveTo(X(lines[li][0]), Y(lines[li][1]));
      g2.lineTo(X(lines[li][2]), Y(lines[li][3]));
      g2.stroke();
    }
    g2.fillStyle = 'rgba(74,102,126,0.8)';
    for (var rv = 0; rv < 24; rv++) {
      var rvx = 0.33 + (rv % 8) * 0.048;
      var rvy = 0.352 + Math.floor(rv / 8) * 0.146;
      g2.beginPath();
      g2.arc(X(rvx), Y(rvy), Math.max(1, 1.6 * u), 0, TAU);
      g2.fill();
    }

    /* ---------------- 8b. rim light: cyan left, orange right ---------------- */
    g2.save();
    g2.shadowColor = 'rgba(' + GLOW + ',0.9)';
    g2.shadowBlur = 10 * u;
    g2.strokeStyle = 'rgba(' + GLOW + ',0.55)';
    g2.lineWidth = Math.max(1.6, 2.6 * u);
    g2.stroke(pHead);
    g2.stroke(pShL1);
    g2.stroke(pChest);
    g2.stroke(pArmL);
    g2.restore();
    g2.save();
    g2.shadowColor = 'rgba(' + ORANGE + ',0.85)';
    g2.shadowBlur = 9 * u;
    g2.strokeStyle = 'rgba(' + ORANGE + ',0.42)';
    g2.lineWidth = Math.max(1.4, 2.2 * u);
    g2.stroke(pShR1);
    g2.stroke(pArmR);
    g2.stroke(pGun);
    g2.restore();
    /* ---------------- 9. bottom fade into the street ---------------- */
    var fade = g2.createLinearGradient(0, Y(0.73), 0, MH);
    fade.addColorStop(0, 'rgba(60,110,150,0)');
    fade.addColorStop(1, 'rgba(66,118,158,0.55)');
    g2.fillStyle = fade;
    g2.fillRect(0, Y(0.73), MW, MH - Y(0.73));

    g2.globalAlpha = 1;
  }

  function buildMechReflection() {
    var g = G;
    var bandH = H - g.baseY;
    if (bandH < 6) { return; }
    mechRefl = makeCanvas(DW, bandH * dpr);
    var x = mechRefl.getContext('2d');
    if (!x) { return; }
    var SQ = 0.42;
    var srcH = g.mh * 0.42;
    x.save();
    x.setTransform(dpr, 0, 0, -dpr * SQ, 0, 0);
    x.globalAlpha = 0.42;
    x.drawImage(mechCan, 0, (g.mh - srcH) * dpr, g.mw * dpr, srcH * dpr,
      0, -srcH, g.mw, srcH);
    x.restore();
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.globalAlpha = 1;
    x.globalCompositeOperation = 'destination-in';
    var mg = x.createLinearGradient(0, 0, 0, bandH);
    mg.addColorStop(0, 'rgba(0,0,0,0.85)');
    mg.addColorStop(0.5, 'rgba(0,0,0,0.34)');
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
      x.strokeStyle = 'rgba(170,220,255,' + a.toFixed(3) + ')';
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
    var rng = makeRng(4242);
    patRain = ctx.createPattern(makeRainTile(rng, 150, 34, 78, 1.0, 0.32), 'repeat');
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

  /* ------------------------------------------------------------- particles */

  function initParticles() {
    particles.length = 0;
    for (var i = 0; i < 46; i++) {
      particles.push(newParticle(true));
    }
  }

  function newParticle(seed) {
    var left = Math.random() < 0.5;
    var o = left ? G.thrustL : G.thrustR;
    var life = 0.9 + Math.random() * 1.6;
    return {
      x: o.x + (Math.random() - 0.5) * G.mw * 0.05,
      y: o.y + (Math.random() - 0.5) * G.mh * 0.02 - (seed ? Math.random() * G.mh * 0.30 : 0),
      vy: -(G.mh * (0.05 + Math.random() * 0.10)),
      vx: (Math.random() - 0.5) * G.mw * 0.012,
      r: (1.4 + Math.random() * 3.4) * u,
      a: 0.25 + Math.random() * 0.45,
      life: life,
      age: seed ? Math.random() * life : 0,
      warm: Math.random() < 0.62
    };
  }

  function updateParticles(dt) {
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      p.age += dt;
      p.y += p.vy * dt;
      p.x += p.vx * dt;
      if (p.age >= p.life) {
        particles[i] = newParticle(false);
        continue;
      }
    }
  }

  function drawParticles(g2) {
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      var k = 1 - p.age / p.life;
      var a = p.a * k * k;
      if (a <= 0.01) { continue; }
      blit(g2, p.warm ? sprOrange : sprCyan, p.x, p.y, p.r * 4.2, p.r * 4.2, a * 0.55);
      g2.globalAlpha = a;
      g2.fillStyle = p.warm ? 'rgba(255,214,160,0.95)' : 'rgba(190,246,255,0.95)';
      g2.beginPath();
      g2.arc(p.x, p.y, p.r * 0.55, 0, TAU);
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

    /* 1. city */
    g2.drawImage(bgCan, 0, 0, W, H);

    /* 2. far rain */
    drawRain(mod(t * 300 * COS_A, TILE), mod(t * 300 * SIN_A, TILE), 0.30);

    /* 3. wet street: city reflection with a slow shimmer */
    if (reflCan) {
      g2.globalAlpha = 0.94;
      g2.drawImage(reflCan, 0, HZ, W, H - HZ);
      g2.globalAlpha = 0.10 + 0.06 * Math.sin(t * 0.7);
      g2.drawImage(reflCan, 0, HZ + Math.sin(t * 0.9) * 1.8 * u, W, H - HZ);
      g2.globalAlpha = 1;
    }

    /* 3b. backlight halo behind the armour */
    blit(g2, sprCool, g.cx, g.my + g.mh * 0.46, g.mw * 1.55, g.mh * 1.15, 0.30);

    /* 4. the mech */
    if (mechCan) {
      g2.drawImage(mechCan, g.mx, g.my, g.mw, g.mh);
    }

    /* 5. its reflection below the base line */
    if (mechRefl) {
      g2.globalAlpha = 0.9;
      g2.drawImage(mechRefl, g.mx, g.baseY, g.mw, H - g.baseY);
      g2.globalAlpha = 1;
    }

    /* 6. sensor scan bar */
    var eyeW = g.eye.x1 - g.eye.x0;
    var scan = (Math.sin(t * 0.85) * 0.5 + 0.5);
    var sx = g.eye.x0 + eyeW * scan;
    g2.save();
    g2.beginPath();
    g2.rect(g.eye.x0, g.eye.y - g.eye.h * 1.6, eyeW, g.eye.h * 3.2);
    g2.clip();
    blit(g2, sprWhite, sx, g.eye.y, g.eye.h * 14, g.eye.h * 3.4, 0.55);
    g2.fillStyle = 'rgba(255,255,255,0.85)';
    g2.fillRect(sx - g.eye.h * 0.18, g.eye.y - g.eye.h * 1.1, g.eye.h * 0.36, g.eye.h * 2.2);
    g2.restore();
    /* constant eye bloom */
    var eyePulse = 0.55 + 0.20 * Math.sin(t * 2.1);
    blit(g2, sprCyan, (g.eye.x0 + g.eye.x1) / 2, g.eye.y, eyeW * 1.15, g.eye.h * 7.5, eyePulse);
    blit(g2, sprWhite, (g.eye.x0 + g.eye.x1) / 2, g.eye.y, eyeW * 0.55, g.eye.h * 3.0, eyePulse * 0.7);

    /* 7. glowing seams breathing */
    for (var i = 0; i < g.seams.length; i++) {
      var s = g.seams[i];
      var k = 0.55 + 0.45 * Math.sin(t * 1.5 + i * 1.7);
      blit(g2, sprCyan, s.x, s.y, g.mw * s.r * 3.4, g.mh * s.r * 2.2, 0.16 + 0.16 * k);
    }
    /* core pulse */
    var cp = 0.5 + 0.5 * Math.sin(t * 1.25);
    blit(g2, sprIce, g.core.x, g.core.y, g.mw * 0.20, g.mh * 0.15, 0.30 + 0.26 * cp);
    blit(g2, sprWhite, g.core.x, g.core.y, g.mw * 0.09, g.mh * 0.07, 0.42 + 0.30 * cp);

    /* 8. thruster heat + particles */
    var th = 0.6 + 0.4 * Math.sin(t * 3.3);
    blit(g2, sprOrange, g.thrustL.x, g.thrustL.y - g.mh * 0.06, g.mw * 0.26, g.mh * 0.14, 0.34 + 0.20 * th);
    blit(g2, sprOrange, g.thrustR.x, g.thrustR.y - g.mh * 0.06, g.mw * 0.24, g.mh * 0.13, 0.32 + 0.20 * th);
    updateParticles(dt);
    drawParticles(g2);

    /* 9. near rain, in front of everything */
    drawRain(mod(t * 520 * COS_A, TILE), mod(t * 520 * SIN_A, TILE), 0.42);

    /* 10. slow HUD scan line */
    var ly = mod(t * 0.16, 1) * H;
    var lg = g2.createLinearGradient(0, ly - 40 * u, 0, ly + 40 * u);
    lg.addColorStop(0, 'rgba(127,240,255,0)');
    lg.addColorStop(0.5, 'rgba(127,240,255,0.10)');
    lg.addColorStop(1, 'rgba(127,240,255,0)');
    g2.fillStyle = lg;
    g2.fillRect(0, ly - 40 * u, W, 80 * u);
    g2.fillStyle = 'rgba(150,240,255,0.18)';
    g2.fillRect(0, ly, W, Math.max(1, 1.2 * u));

    /* 11. keep the top-right corner dark for the host button */
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
    HZ = H * HOR;

    cv.width = DW;
    cv.height = DH;
    cv.style.width = W + 'px';
    cv.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;

    buildSprites();
    computeGeo();
    buildCity();
    buildReflection();
    buildMech();
    buildMechReflection();
    buildRain();
    initParticles();
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
