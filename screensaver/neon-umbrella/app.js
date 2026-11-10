/* ===========================================================================
   neon-umbrella  --  Rain-night neon street, a girl holding a clear umbrella,
   her silhouette, wet-asphalt reflections, vertical neon signs, parallax rain
   and slow camera droplets.

   Pure 2D canvas, fully procedural. No external images / fonts / network /
   storage. No pointer or key listeners, no exit button (the host injects it).
   All static art (skyline, windows, signs, ground reflection, rain tiles,
   glow sprites) is pre-rendered into offscreen canvases and only blitted per
   frame. Per-frame code never calls shadowBlur / createRadialGradient /
   getImageData / fillText.
   =========================================================================== */
(function () {
  'use strict';

  var cv = document.getElementById('stage');
  var ctx = cv && cv.getContext ? cv.getContext('2d') : null;
  if (!ctx) { return; }

  var TAU = 6.283185307179586;
  var MAX_DPR = 1.5;
  var HOR = 0.70;                        /* horizon at 70% of the height */
  var RAIN_DEG = 18;                     /* rain slant, degrees from vertical */
  var SIN_A = Math.sin(RAIN_DEG * Math.PI / 180);
  var COS_A = Math.cos(RAIN_DEG * Math.PI / 180);
  var TILE = 512;                        /* rain tile size, device px */
  var KARC = 0.5522847498;               /* bezier magic for a quarter ellipse */

  var W = 1, H = 1, dpr = 1, DW = 1, DH = 1, u = 1, HZ = 1;

  /* offscreen layers */
  var bgCan = null, bgc = null;          /* sky + skyline + signs (static) */
  var reflCan = null, rc = null;         /* squashed mirror of bg, for the ground */
  var patA = null, patB = null;          /* rain patterns */
  var scrimCan = null, dropCan = null;
  var sprCyan = null, sprPink = null, sprOrange = null, sprWarm = null, sprIce = null;

  /* figure geometry */
  var G = null;

  /* live state */
  var signs = [];
  var drops = [];
  var ripples = [];
  var rippleAcc = 0;
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

  /* soft round glow sprite, built once per resize */
  function glowSprite(size, r, g, b) {
    var c = makeCanvas(size, size);
    var x = c.getContext('2d');
    var h = size / 2;
    var gr = x.createRadialGradient(h, h, 0, h, h, h);
    gr.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ',1)');
    gr.addColorStop(0.22, 'rgba(' + r + ',' + g + ',' + b + ',0.62)');
    gr.addColorStop(0.50, 'rgba(' + r + ',' + g + ',' + b + ',0.22)');
    gr.addColorStop(0.78, 'rgba(' + r + ',' + g + ',' + b + ',0.055)');
    gr.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',0)');
    x.fillStyle = gr;
    x.fillRect(0, 0, size, size);
    return c;
  }

  /* blit a glow sprite centred on (x,y) */
  function putGlow(g2, spr, x, y, w, h, a) {
    if (!spr) { return; }
    g2.globalAlpha = a;
    g2.drawImage(spr, x - w / 2, y - h / 2, w, h);
    g2.globalAlpha = 1;
  }

  /* horizontal fog wash, used to layer the skyline */
  function fogBand(g2, yTop, yBot, r, g, b, aTop, aBot) {
    if (yBot <= yTop) { return; }
    var fg = g2.createLinearGradient(0, yTop, 0, yBot);
    fg.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ',' + aTop + ')');
    fg.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',' + aBot + ')');
    g2.fillStyle = fg;
    g2.fillRect(0, yTop, W, yBot - yTop);
  }

  /* ------------------------------------------------------------- sprites */

  function makeScrim() {
    var c = makeCanvas(360, 240);
    var x = c.getContext('2d');
    var gr = x.createRadialGradient(180, 120, 10, 180, 120, 180);
    gr.addColorStop(0, 'rgba(3,4,10,0.94)');
    gr.addColorStop(0.45, 'rgba(3,4,10,0.70)');
    gr.addColorStop(0.75, 'rgba(3,4,10,0.26)');
    gr.addColorStop(1, 'rgba(3,4,10,0)');
    x.fillStyle = gr;
    x.fillRect(0, 0, 360, 240);
    return c;
  }

  function makeDrop() {
    var S = 160;
    var c = makeCanvas(S, S);
    var x = c.getContext('2d');
    var m = S / 2;
    var gr = x.createRadialGradient(m, m, 2, m, m, m);
    gr.addColorStop(0, 'rgba(214,244,255,0.50)');
    gr.addColorStop(0.34, 'rgba(158,214,255,0.18)');
    gr.addColorStop(0.70, 'rgba(108,176,238,0.065)');
    gr.addColorStop(1, 'rgba(90,150,220,0)');
    x.fillStyle = gr;
    x.beginPath();
    x.arc(m, m, m, 0, TAU);
    x.fill();
    x.strokeStyle = 'rgba(216,246,255,0.24)';
    x.lineWidth = 2.2;
    x.beginPath();
    x.arc(m, m, S * 0.33, 0, TAU);
    x.stroke();
    var gr2 = x.createRadialGradient(m - 9, m - 12, 0, m - 9, m - 12, 17);
    gr2.addColorStop(0, 'rgba(255,255,255,0.95)');
    gr2.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr2;
    x.beginPath();
    x.arc(m - 9, m - 12, 17, 0, TAU);
    x.fill();
    return c;
  }

  function buildSprites() {
    sprCyan = glowSprite(256, 46, 230, 255);
    sprPink = glowSprite(256, 255, 47, 142);
    sprOrange = glowSprite(256, 255, 138, 61);
    sprWarm = glowSprite(128, 255, 208, 158);
    sprIce = glowSprite(128, 196, 232, 255);
    scrimCan = makeScrim();
    dropCan = makeDrop();
  }

  /* ------------------------------------------------------- figure geometry */

  function computeGeo() {
    var footY = H * 0.885;
    var headTop = H * 0.225;
    var bodyH = footY - headTop;
    var hh = bodyH / 7.2;
    var px = W * 0.645;

    var g = {};
    g.hh = hh;
    g.px = px;
    g.footY = footY;
    g.headTop = headTop;
    g.bodyH = bodyH;

    g.headRx = hh * 0.275;
    g.headRy = hh * 0.400;
    g.headCx = px + W * 0.002;
    g.headCy = headTop + g.headRy;

    g.neckY = headTop + hh * 1.05;
    g.shoulderY = headTop + hh * 1.55;
    g.chestY = headTop + hh * 2.55;
    g.waistY = headTop + hh * 3.30;
    g.hipY = headTop + hh * 4.00;
    g.coatHemY = headTop + hh * 5.60;

    g.sho = hh * 0.68;                /* shoulder half width */
    g.wai = hh * 0.465;
    g.hip = hh * 0.65;
    g.coatHem = hh * 0.92;

    g.poleX = px + W * 0.042;
    g.handY = headTop + hh * 2.70;

    g.apexY = H * 0.046;
    g.rimY = H * 0.192;
    g.ur = W * 0.13;                  /* umbrella half width */

    /* rain beads clinging to the canopy (fixed, chosen once) */
    var brng = makeRng(4242);
    g.beads = [];
    for (var i = 0; i < 9; i++) {
      var bx = (brng() * 1.72 - 0.86) * g.ur;
      var t01 = (bx / g.ur + 1) / 2;
      var topY = -Math.sqrt(Math.max(0, 1 - t01 * t01 * 0.92)) * (g.rimY - g.apexY);
      var by = topY + (brng() * 0.55) * (g.rimY - g.apexY) * (0.35 + 0.5 * Math.abs(t01));
      g.beads.push({ x: bx, y: by, r: (0.9 + brng() * 1.9) * u });
    }

    G = g;
  }

  /* ------------------------------------------------------------ the ground */

  function buildReflection() {
    var bandH = H - HZ;
    if (bandH < 4) { return; }
    reflCan = makeCanvas(DW, bandH * dpr);
    rc = reflCan.getContext('2d');
    if (!rc) { return; }
    rc.clearRect(0, 0, DW, bandH * dpr);

    /* mirror the scene above the horizon, squashed hard so the neon signs and
       lit windows smear into long vertical streaks; banded offsets add the
       horizontal wobble of moving water */
    var SQ = 0.46;
    var bands = 26;
    var bh = bandH / bands;
    var srcBand = bh / SQ;

    function mirrorPass(jitAmp, alpha, comp) {
      rc.globalCompositeOperation = comp || 'source-over';
      for (var i = 0; i < bands; i++) {
        var y0 = i * bh;
        var y1 = y0 + bh;
        var srcY = HZ - y1 / SQ;
        if (srcY < 0 || srcY + srcBand > HZ + 1) { continue; }
        var jit = (Math.sin(i * 1.83 + 0.4) * 1.9 + Math.sin(i * 0.47 + 2.2) * 1.3) * u * jitAmp;
        rc.setTransform(dpr, 0, 0, -dpr * SQ, 0, y0 * dpr);
        rc.globalAlpha = alpha;
        rc.drawImage(bgCan, 0, srcY * dpr, DW, srcBand * dpr, jit, -srcBand, W, srcBand);
      }
    }

    mirrorPass(1.0, 0.19);                       /* main body */
    mirrorPass(-1.5, 0.14);                      /* soft blur copy */
    mirrorPass(2.3, 0.11);                       /* soft blur copy */
    mirrorPass(-2.8, 0.08);                      /* soft blur copy */
    mirrorPass(3.4, 0.090, 'lighter');           /* neon punch */
    mirrorPass(-4.1, 0.065, 'lighter');          /* neon punch */

    rc.setTransform(dpr, 0, 0, dpr, 0, 0);
    rc.globalAlpha = 1;
    rc.globalCompositeOperation = 'source-over';

    /* fade towards the viewer, then tint everything into the wet palette */
    rc.globalCompositeOperation = 'destination-in';
    var mg = rc.createLinearGradient(0, 0, 0, bandH);
    mg.addColorStop(0, 'rgba(0,0,0,0.98)');
    mg.addColorStop(0.18, 'rgba(0,0,0,0.92)');
    mg.addColorStop(0.42, 'rgba(0,0,0,0.66)');
    mg.addColorStop(0.72, 'rgba(0,0,0,0.34)');
    mg.addColorStop(1, 'rgba(0,0,0,0.12)');
    rc.fillStyle = mg;
    rc.fillRect(0, 0, W, bandH);

    rc.globalCompositeOperation = 'source-atop';
    rc.fillStyle = 'rgba(8,11,24,0.26)';
    rc.fillRect(0, 0, W, bandH);
    rc.globalCompositeOperation = 'source-over';
  }

  /* -------------------------------------------------------------- skyline */

  function skyline(g2, rng, cfg) {
    var x = -cfg.pad * W;
    while (x < W * (1 + cfg.pad)) {
      var bw = (cfg.wMin + rng() * (cfg.wMax - cfg.wMin)) * W;
      var bh = (cfg.hMin + rng() * (cfg.hMax - cfg.hMin)) * H;
      /* a cross street: skip this stretch so the haze behind her stays open */
      if (cfg.hole && x + bw > cfg.hole[0] * W && x < cfg.hole[1] * W) {
        x = cfg.hole[1] * W;
        continue;
      }
      var top = cfg.base - bh;

      g2.fillStyle = cfg.color;
      g2.fillRect(x, top, bw, bh + 3 * u);
      g2.fillStyle = cfg.edge;
      g2.fillRect(x, top, Math.max(1, 1.3 * u), bh);

      /* rooftop antenna + red beacon */
      if (rng() < 0.5) {
        var ax = x + bw * (0.12 + rng() * 0.72);
        var ah = H * (0.012 + rng() * 0.032);
        g2.fillStyle = cfg.color;
        g2.fillRect(ax, top - ah, Math.max(1, 1.3 * u), ah + 2 * u);
        if (rng() < 0.6) {
          g2.fillStyle = 'rgba(255,72,72,' + (cfg.beacon).toFixed(2) + ')';
          g2.fillRect(ax - 1.1 * u, top - ah - 2 * u, 2.6 * u, 2 * u);
        }
      }

      /* lit windows */
      var cw = cfg.cellW * W;
      var ch = cfg.cellH * H;
      var cols = Math.max(1, Math.floor((bw * 0.84) / cw));
      var rows = Math.max(1, Math.floor((bh * 0.86) / ch));
      var ox = x + (bw - cols * cw) / 2 + cw * 0.24;
      var oy = top + ch * 0.80;
      for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
          if (rng() > cfg.win) { continue; }
          var wa = cfg.waMin + rng() * (cfg.waMax - cfg.waMin);
          var warm = rng() < cfg.warm;
          var col = warm ? '255,222,176' : '206,238,255';
          var wx = ox + c * cw;
          var wy = oy + r * ch;
          g2.fillStyle = 'rgba(' + col + ',' + wa.toFixed(3) + ')';
          g2.fillRect(wx, wy, cw * 0.55, ch * 0.54);
          /* the brightest panes bloom a little */
          if (wa > 0.68) {
            putGlow(g2, warm ? sprWarm : sprIce,
              wx + cw * 0.28, wy + ch * 0.27,
              cw * 2.3, ch * 2.3, (wa - 0.68) * 0.55);
          }
        }
      }

      /* crisp roofline against the haze */
      if (cfg.rim) {
        g2.strokeStyle = cfg.rim;
        g2.lineWidth = Math.max(1, 1.1 * u);
        g2.beginPath();
        g2.moveTo(x, top + 0.5 * u);
        g2.lineTo(x + bw, top + 0.5 * u);
        g2.stroke();
      }

      x += bw + (rng() < 0.22 ? cfg.gap * W : 0);
    }
  }

  /* --------------------------------------------------------- vertical sign */

  function drawVertText(g2, text, cx, by, bh, size, fill) {
    var step = size * 1.10;
    var total = step * text.length;
    var y0 = by + (bh - total) / 2 + step / 2;
    g2.textAlign = 'center';
    g2.textBaseline = 'middle';
    g2.font = '700 ' + size.toFixed(1) + 'px "Microsoft YaHei","PingFang SC","Noto Sans SC",sans-serif';
    g2.fillStyle = fill;
    for (var i = 0; i < text.length; i++) {
      g2.fillText(text.charAt(i), cx, y0 + step * i);
    }
  }

  function buildSigns(g2, rng) {
    signs.length = 0;
    var defs = [
      { x: 0.026, y: 0.300, w: 0.058, h: 0.268, col: [46, 230, 255], text: '\u672a\u6765', spr: 'cyan' },
      { x: 0.104, y: 0.176, w: 0.054, h: 0.230, col: [255, 47, 142], text: 'NEON', spr: 'pink' },
      { x: 0.170, y: 0.440, w: 0.046, h: 0.192, col: [255, 138, 61], text: 'CYBER', spr: 'orange' }
    ];

    for (var i = 0; i < defs.length; i++) {
      var d = defs[i];
      var bx = d.x * W, by = d.y * H, bw = d.w * W, bh = d.h * H;
      var cc = d.col[0] + ',' + d.col[1] + ',' + d.col[2];

      var spr = d.spr === 'cyan' ? sprCyan : (d.spr === 'pink' ? sprPink : sprOrange);
      putGlow(g2, spr, bx + bw / 2, by + bh * 0.50, bw * 9.0, bh * 3.2, 0.34);
      putGlow(g2, spr, bx + bw / 2, by + bh * 0.52, bw * 3.6, bh * 1.45, 0.40);

      g2.fillStyle = 'rgba(7,10,20,0.92)';
      g2.fillRect(bx, by, bw, bh);

      g2.shadowColor = 'rgba(' + cc + ',0.95)';
      g2.shadowBlur = Math.max(6, 16 * u);
      g2.strokeStyle = 'rgba(' + cc + ',0.92)';
      g2.lineWidth = Math.max(1, 1.8 * u);
      g2.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
      g2.shadowBlur = 0;

      g2.strokeStyle = 'rgba(' + cc + ',0.30)';
      g2.lineWidth = Math.max(1, 1.0 * u);
      g2.strokeRect(bx + 3 * u, by + 3 * u, bw - 6 * u, bh - 6 * u);

      var size = Math.min(bw * 0.80, (bh * 0.84) / (d.text.length * 1.10));
      g2.shadowColor = 'rgba(' + cc + ',1)';
      g2.shadowBlur = Math.max(8, 24 * u);
      drawVertText(g2, d.text, bx + bw / 2, by + bh * 0.05, bh * 0.90, size, 'rgba(232,250,255,0.97)');
      g2.shadowBlur = 0;

      g2.strokeStyle = 'rgba(120,150,180,0.35)';
      g2.lineWidth = Math.max(1, 1.2 * u);
      g2.beginPath();
      g2.moveTo(bx + bw * 0.5, by - H * 0.012);
      g2.lineTo(bx + bw * 0.5, by);
      g2.stroke();

      signs.push({
        x: bx, y: by, w: bw, h: bh,
        lit: true,
        nextOff: 2.4 + rng() * 6.5,
        offUntil: 0
      });
    }
  }

  /* -------------------------------------------------------------- the city */

  function buildBg() {
    bgCan = makeCanvas(DW, DH);
    bgc = bgCan.getContext('2d');
    var g2 = bgc;
    g2.setTransform(dpr, 0, 0, dpr, 0, 0);
    g2.clearRect(0, 0, W, H);

    /* night sky */
    var sky = g2.createLinearGradient(0, 0, 0, HZ);
    sky.addColorStop(0, '#05060f');
    sky.addColorStop(0.38, '#070a17');
    sky.addColorStop(0.70, '#0b1226');
    sky.addColorStop(1, '#18233d');
    g2.fillStyle = sky;
    g2.fillRect(0, 0, W, HZ + 2);

    /* wet asphalt base (the reflection layer is composited on top later) */
    var grd = g2.createLinearGradient(0, HZ, 0, H);
    grd.addColorStop(0, '#101a2c');
    grd.addColorStop(0.28, '#080d1a');
    grd.addColorStop(1, '#04050d');
    g2.fillStyle = grd;
    g2.fillRect(0, HZ, W, H - HZ + 2);

    /* ambient neon haze in the sky */
    putGlow(g2, sprPink, W * 0.760, H * 0.215, W * 0.78, H * 0.62, 0.34);
    putGlow(g2, sprPink, W * 0.735, H * 0.330, W * 0.40, H * 0.34, 0.26);
    putGlow(g2, sprCyan, W * 0.150, H * 0.430, W * 0.56, H * 0.46, 0.28);
    putGlow(g2, sprOrange, W * 0.960, H * 0.590, W * 0.44, H * 0.30, 0.24);
    putGlow(g2, sprIce, W * 0.680, H * 0.590, W * 0.60, H * 0.60, 0.16);

    var rng = makeRng(20261110);

    /* far layer: hazy, dim, small */
    skyline(g2, rng, {
      pad: 0.06, base: HZ + 1.5 * u,
      hMin: 0.060, hMax: 0.155, wMin: 0.050, wMax: 0.150, gap: 0.010,
      color: '#101a2f', edge: 'rgba(36,54,90,0.5)',
      win: 0.18, warm: 0.30, cellW: 0.0088, cellH: 0.0098,
      waMin: 0.05, waMax: 0.22, beacon: 0.25, rim: null
    });
    fogBand(g2, HZ - H * 0.42, HZ, 44, 62, 104, 0.00, 0.34);

    /* mid layer */
    skyline(g2, rng, {
      pad: 0.05, base: HZ + 3 * u,
      hMin: 0.100, hMax: 0.240, wMin: 0.062, wMax: 0.170, gap: 0.012,
      color: '#0a1120', edge: 'rgba(44,64,102,0.55)',
      win: 0.24, warm: 0.26, cellW: 0.0106, cellH: 0.0118,
      waMin: 0.09, waMax: 0.48, beacon: 0.35, rim: 'rgba(74,110,164,0.35)'
    });
    fogBand(g2, HZ - H * 0.34, HZ, 40, 58, 98, 0.00, 0.24);

    /* near layer: almost black, crisp bright windows; a cross street is left
       open behind the figure so she reads against the haze */
    skyline(g2, rng, {
      pad: 0.04, base: HZ + 6 * u,
      hMin: 0.130, hMax: 0.300, wMin: 0.075, wMax: 0.165, gap: 0.018,
      color: '#05080f', edge: 'rgba(60,90,140,0.45)',
      win: 0.30, warm: 0.22, cellW: 0.0128, cellH: 0.0140,
      waMin: 0.14, waMax: 1.0, beacon: 0.55, rim: 'rgba(96,146,210,0.55)',
      hole: [0.555, 0.765]
    });
    fogBand(g2, HZ - H * 0.26, HZ, 34, 50, 86, 0.00, 0.13);

    /* glow spilling out of the cross street behind her */
    putGlow(g2, sprWarm, W * 0.662, H * 0.600, W * 0.42, H * 0.36, 0.42);
    putGlow(g2, sprPink, W * 0.705, H * 0.520, W * 0.56, H * 0.44, 0.34);
    putGlow(g2, sprIce, W * 0.660, H * 0.585, W * 0.32, H * 0.26, 0.28);

    /* street lights along the horizon */
    for (var i = 0; i < 11; i++) {
      var lx = W * (0.02 + rng() * 0.96);
      var ly = HZ - H * (0.004 + rng() * 0.026);
      putGlow(g2, rng() < 0.6 ? sprWarm : sprIce,
        lx, ly, W * (0.028 + rng() * 0.050), H * (0.028 + rng() * 0.032),
        0.42 + rng() * 0.34);
    }

    /* distant avenue: a thin band of shop signs and tail lights */
    var pickCol = [
      [46, 230, 255], [255, 47, 142], [255, 138, 61], [255, 214, 170]
    ];
    for (var s = 0; s < 22; s++) {
      var sx = W * (0.005 + rng() * 0.99);
      var sw = W * (0.005 + rng() * 0.018);
      var sh = H * (0.0030 + rng() * 0.0045);
      var cc = pickCol[Math.floor(rng() * 4)];
      var spr2 = cc[0] === 46 ? sprCyan : (cc[1] === 47 ? sprPink : (cc[1] === 138 ? sprOrange : sprWarm));
      var sy2 = HZ - sh * (1.0 + rng() * 1.8);
      putGlow(g2, spr2, sx + sw / 2, sy2, sw * 5.2, sh * 9.0, 0.22 + rng() * 0.26);
      g2.fillStyle = 'rgba(' + cc[0] + ',' + cc[1] + ',' + cc[2] + ',' + (0.42 + rng() * 0.40).toFixed(2) + ')';
      g2.fillRect(sx, sy2 - sh * 0.5, sw, sh);
    }

    /* neon signs on the left fifth */
    buildSigns(g2, rng);

    /* soft foggy waterline: a wide gradient band, never a hard rule */
    var wl = g2.createLinearGradient(0, HZ - 15 * u, 0, HZ + 13 * u);
    wl.addColorStop(0, 'rgba(104,162,236,0)');
    wl.addColorStop(0.30, 'rgba(108,168,238,0.055)');
    wl.addColorStop(0.47, 'rgba(146,202,255,0.135)');
    wl.addColorStop(0.54, 'rgba(158,210,255,0.145)');
    wl.addColorStop(0.68, 'rgba(120,176,238,0.075)');
    wl.addColorStop(1, 'rgba(80,140,210,0)');
    g2.fillStyle = wl;
    g2.fillRect(0, HZ - 15 * u, W, 28 * u);

    /* film grain (baked, so it costs nothing per frame) */
    var noise = makeCanvas(192, 192);
    var nx = noise.getContext('2d');
    if (nx) {
      var img = nx.createImageData(192, 192);
      var data = img.data;
      for (var p = 0; p < data.length; p += 4) {
        var v = 140 + Math.floor(Math.random() * 115);
        data[p] = v;
        data[p + 1] = v;
        data[p + 2] = v;
        data[p + 3] = Math.floor(Math.random() * 30);
      }
      nx.putImageData(img, 0, 0);
      var npat = g2.createPattern(noise, 'repeat');
      g2.globalAlpha = 0.6;
      g2.fillStyle = npat;
      g2.fillRect(0, 0, W, H);
      g2.globalAlpha = 1;
    }

    /* vignette + keep the top-right corner dark for the host button */
    var vg = g2.createRadialGradient(W * 0.50, H * 0.46, Math.min(W, H) * 0.22,
      W * 0.50, H * 0.46, Math.max(W, H) * 0.80);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(0.60, 'rgba(1,2,6,0.16)');
    vg.addColorStop(1, 'rgba(1,2,6,0.74)');
    g2.fillStyle = vg;
    g2.fillRect(0, 0, W, H);

    var cg = g2.createRadialGradient(W - 96 * u, 40 * u, 8 * u, W - 96 * u, 40 * u, 230 * u);
    cg.addColorStop(0, 'rgba(4,5,12,0.66)');
    cg.addColorStop(1, 'rgba(4,5,12,0)');
    g2.fillStyle = cg;
    g2.fillRect(W - 340 * u, 0, 340 * u, 220 * u);
  }

  /* ------------------------------------------------------------------ rain */

  function makeRainTile(rng, count, minLen, maxLen, width, alpha) {
    var c = makeCanvas(TILE, TILE);
    var x = c.getContext('2d');
    x.clearRect(0, 0, TILE, TILE);
    x.lineCap = 'round';
    for (var i = 0; i < count; i++) {
      var bx = rng() * TILE;
      var by = rng() * TILE;
      var len = minLen + rng() * (maxLen - minLen);
      var a = alpha * (0.28 + rng() * 0.72);
      x.strokeStyle = 'rgba(186,222,255,' + a.toFixed(3) + ')';
      x.lineWidth = width * (0.7 + rng() * 0.6);
      var dx = len * SIN_A;
      var dy = len * COS_A;
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
    var rng = makeRng(90210);
    var ta = makeRainTile(rng, 150, 30, 62, 0.95, 0.30);
    var tb = makeRainTile(rng, 70, 56, 104, 1.60, 0.46);
    patA = ctx.createPattern(ta, 'repeat');
    patB = ctx.createPattern(tb, 'repeat');
  }

  function drawRain(pat, ay, ax, alpha) {
    if (!pat) { return; }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = pat;
    ctx.translate(ax, ay);
    ctx.fillRect(-ax, -ay, DW, DH);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
  }

  /* --------------------------------------------------------------- droplets */

  function initDrops() {
    drops.length = 0;
    var limitX = Math.max(W * 0.35, W - 330 * u);
    for (var i = 0; i < 5; i++) {
      drops.push({
        x: Math.random() * limitX,
        y: Math.random() * H,
        r: (0.018 + Math.random() * 0.030) * Math.min(W, H),
        a: 0.09 + Math.random() * 0.12,
        vy: 4 + Math.random() * 10,
        ph: Math.random() * TAU
      });
    }
  }

  /* ---------------------------------------------------------------- ripples */

  function spawnRipple(seed) {
    var bandH = H - HZ;
    var y = HZ + bandH * (0.05 + Math.random() * 0.82);
    var depth = (y - HZ) / bandH;
    ripples.push({
      x: W * (0.03 + Math.random() * 0.94),
      y: y,
      age: seed ? Math.random() * 1.0 : 0,
      life: 1.2,
      r0: (4 + depth * 10) * u,
      r1: (22 + depth * 60) * u
    });
  }

  function initRipples() {
    ripples.length = 0;
    rippleAcc = 0.25;
    for (var i = 0; i < 4; i++) { spawnRipple(true); }
  }

  /* ------------------------------------------------------------ the figure */

  function drawCanopy(g2, tsec) {
    var g = G;
    var ur = g.ur;
    var dh = g.rimY - g.apexY;
    var tilt = Math.sin(tsec * 0.50 + 1.10) * 0.010;
    var k = KARC;
    var RIBS = 6;                     /* 6 gores -> 6 ribs */
    var i, tR, ex;

    g2.save();
    g2.translate(g.poleX, g.rimY);
    g2.rotate(tilt);

    /* dome outline: quarter ellipse each side; rim sags between the rib tips */
    g2.beginPath();
    g2.moveTo(0, -dh);
    g2.bezierCurveTo(-ur * k, -dh, -ur, -dh * (1 - k), -ur, 0);
    for (i = 1; i < RIBS; i++) {
      tR = i / RIBS;
      ex = -ur + 2 * ur * tR;
      g2.quadraticCurveTo(ex - ur / RIBS, dh * 0.115, ex, 0);
    }
    g2.bezierCurveTo(ur, -dh * (1 - k), ur * k, -dh, 0, -dh);
    g2.closePath();

    /* translucent canopy, alpha .16 */
    g2.fillStyle = 'rgba(200,234,255,0.115)';
    g2.fill();

    g2.save();
    g2.clip();
    /* light coming through: cool on the left, neon pink on the right */
    g2.fillStyle = 'rgba(60,232,255,0.125)';
    g2.fillRect(-ur * 1.1, -dh * 1.3, ur * 0.95, dh * 2.0);
    g2.fillStyle = 'rgba(255,47,142,0.095)';
    g2.fillRect(ur * 0.15, -dh * 1.3, ur * 1.0, dh * 2.0);
    /* a soft sheen across the top, layered so the edge does not read as a rule */
    g2.fillStyle = 'rgba(255,255,255,0.050)';
    g2.fillRect(-ur * 1.1, -dh * 1.3, ur * 2.2, dh * 0.52);
    g2.fillStyle = 'rgba(255,255,255,0.045)';
    g2.fillRect(-ur * 1.1, -dh * 1.3, ur * 2.2, dh * 0.30);
    /* darker underside near the rim, gives the dome some volume */
    g2.fillStyle = 'rgba(8,14,30,0.26)';
    g2.fillRect(-ur * 1.1, -dh * 0.34, ur * 2.2, dh * 0.50);
    g2.restore();

    /* ribs radiating from the tip down to the rim */
    g2.strokeStyle = 'rgba(198,238,255,0.42)';
    g2.lineWidth = Math.max(1, ur * 0.0088);
    for (i = 1; i < RIBS; i++) {
      tR = i / RIBS;
      ex = -ur + 2 * ur * tR;
      g2.beginPath();
      g2.moveTo(0, -dh + dh * 0.03);
      g2.quadraticCurveTo(ex * 0.50, -dh * 0.58, ex, 0);
      g2.stroke();
    }
    /* the centre rib runs straight down the front */
    g2.beginPath();
    g2.moveTo(0, -dh + dh * 0.03);
    g2.lineTo(0, 0);
    g2.stroke();

    /* rim + dome outline: the cyan rim light that makes the clear canopy read */
    g2.strokeStyle = 'rgba(150,240,255,0.80)';
    g2.lineWidth = Math.max(1.2, ur * 0.0130);
    g2.beginPath();
    g2.moveTo(-ur, 0);
    g2.bezierCurveTo(-ur, -dh * (1 - k), -ur * k, -dh, 0, -dh);
    g2.bezierCurveTo(ur * k, -dh, ur, -dh * (1 - k), ur, 0);
    g2.stroke();

    /* bright thin arc catching the key light on the upper left */
    g2.strokeStyle = 'rgba(255,255,255,0.90)';
    g2.lineWidth = Math.max(1, ur * 0.0080);
    g2.beginPath();
    g2.moveTo(-ur * 0.06, -dh * 0.985);
    g2.bezierCurveTo(-ur * 0.42, -dh * 0.99, -ur * 0.78, -dh * 0.66, -ur * 0.93, -dh * 0.26);
    g2.stroke();

    /* sagging rim: a thin dark line only, plus a soft inner band */
    g2.strokeStyle = 'rgba(8,12,22,0.50)';
    g2.lineWidth = Math.max(1, ur * 0.0055);
    g2.beginPath();
    g2.moveTo(-ur, 0);
    for (i = 1; i < RIBS; i++) {
      tR = i / RIBS;
      ex = -ur + 2 * ur * tR;
      g2.quadraticCurveTo(ex - ur / RIBS, dh * 0.115, ex, 0);
    }
    g2.lineTo(ur, 0);
    g2.stroke();

    /* tip ferrule above the canopy */
    g2.strokeStyle = 'rgba(22,30,46,0.96)';
    g2.lineWidth = Math.max(2, ur * 0.016);
    g2.beginPath();
    g2.moveTo(0, -dh - ur * 0.030);
    g2.lineTo(0, -dh + ur * 0.02);
    g2.stroke();
    g2.strokeStyle = 'rgba(200,238,255,0.75)';
    g2.lineWidth = Math.max(1, ur * 0.006);
    g2.beginPath();
    g2.moveTo(-ur * 0.004, -dh - ur * 0.028);
    g2.lineTo(-ur * 0.004, -dh + ur * 0.01);
    g2.stroke();

    /* rain beads on the transparent canopy */
    g2.fillStyle = 'rgba(226,248,255,0.30)';
    for (var b = 0; b < g.beads.length; b++) {
      var bd = g.beads[b];
      g2.beginPath();
      g2.ellipse(bd.x, bd.y, bd.r, bd.r * 1.25, 0, 0, TAU);
      g2.fill();
    }
    g2.fillStyle = 'rgba(255,255,255,0.50)';
    for (var b2 = 0; b2 < g.beads.length; b2++) {
      var bd2 = g.beads[b2];
      g2.beginPath();
      g2.arc(bd2.x - bd2.r * 0.3, bd2.y - bd2.r * 0.4, bd2.r * 0.36, 0, TAU);
      g2.fill();
    }

    g2.restore();
  }

  function drawPole(g2) {
    var g = G;
    var hh = g.hh;
    var x = g.poleX;
    var top = g.apexY - hh * 0.14;
    var bot = g.handY + hh * 0.36;

    g2.strokeStyle = 'rgba(20,28,44,0.96)';
    g2.lineWidth = Math.max(2, hh * 0.072);
    g2.beginPath();
    g2.moveTo(x, top);
    g2.lineTo(x, bot);
    g2.stroke();

    g2.strokeStyle = 'rgba(198,230,250,0.60)';
    g2.lineWidth = Math.max(1, hh * 0.030);
    g2.beginPath();
    g2.moveTo(x - hh * 0.012, top + hh * 0.06);
    g2.lineTo(x - hh * 0.012, bot);
    g2.stroke();

    /* J hook under the hand */
    g2.strokeStyle = 'rgba(20,28,44,0.96)';
    g2.lineWidth = Math.max(2, hh * 0.068);
    g2.beginPath();
    g2.moveTo(x, bot);
    g2.quadraticCurveTo(x, bot + hh * 0.30, x - hh * 0.26, bot + hh * 0.22);
    g2.stroke();
  }

  function drawFigure(g2, tsec) {
    var g = G;
    if (!g) { return; }
    var hh = g.hh;
    var COAT = '#05060c';
    var HAIR = '#0c1122';

    var sw = Math.sin(tsec * 0.55);
    var sw2 = Math.sin(tsec * 0.55 + 2.1);
    var hairSw = Math.sin(tsec * 0.47 + 0.80);
    var coatSw = Math.sin(tsec * 0.41 + 1.50);
    var lean = sw * hh * 0.045;
    var hcx = g.headCx + lean;

    /* ---------------- hair falling behind the shoulders ---------------- */
    var crownY = g.headCy - g.headRy * 1.04;
    var hairEnd = g.waistY + hh * 0.80;
    g2.fillStyle = HAIR;
    g2.beginPath();
    g2.moveTo(hcx - g.headRx * 0.90, g.headCy + g.headRy * 0.55);
    g2.bezierCurveTo(hcx - g.headRx * 1.30, g.neckY - hh * 0.10,
      hcx - hh * 0.30, g.neckY + hh * 0.10,
      hcx - hh * 0.33 + lean, g.shoulderY + hh * 0.25);
    g2.bezierCurveTo(hcx - hh * 0.41 + lean, g.chestY + hh * 0.20,
      hcx - hh * 0.42 + lean * 1.6 + hairSw * hh * 0.06, hairEnd - hh * 0.55,
      hcx - hh * 0.35 + lean * 1.6 + hairSw * hh * 0.16, hairEnd);
    g2.quadraticCurveTo(hcx - hh * 0.09 + hairSw * hh * 0.09, hairEnd + hh * 0.22,
      hcx + hh * 0.12, hairEnd - hh * 0.03);
    g2.quadraticCurveTo(hcx + hh * 0.29, hairEnd - hh * 0.20,
      hcx + hh * 0.31 + hairSw * hh * 0.05, hairEnd - hh * 0.60);
    g2.bezierCurveTo(hcx + hh * 0.40, g.chestY,
      hcx + hh * 0.35, g.shoulderY,
      hcx + hh * 0.31, g.neckY + hh * 0.05);
    g2.bezierCurveTo(hcx + g.headRx * 1.24, g.neckY - hh * 0.12,
      hcx + g.headRx * 1.02, g.headCy + g.headRy * 0.55,
      hcx + g.headRx * 0.55, crownY + g.headRy * 0.20);
    g2.lineTo(hcx - g.headRx * 0.40, crownY + g.headRy * 0.20);
    g2.closePath();
    g2.fill();

    /* the ends of the hair split into separate locks */
    for (var k = 0; k < 4; k++) {
      var tx = hcx + (k - 1.5) * hh * 0.18 + hairSw * hh * 0.12;
      var ty = hairEnd + hh * 0.03;
      g2.beginPath();
      g2.moveTo(tx - hh * 0.085, ty - hh * 0.34);
      g2.quadraticCurveTo(tx - hh * 0.02, ty + hh * 0.10, tx + hh * 0.01,
        ty + hh * (0.24 + (k % 2) * 0.11));
      g2.quadraticCurveTo(tx + hh * 0.07, ty + hh * 0.06, tx + hh * 0.085, ty - hh * 0.34);
      g2.closePath();
      g2.fill();
    }

    /* hair-covered head: one round mass so it reads as a head, not a hood */
    g2.fillStyle = HAIR;
    g2.beginPath();
    g2.ellipse(hcx + g.headRx * 0.03, g.headCy, g.headRx * 1.05, g.headRy * 1.05, 0, 0, TAU);
    g2.fill();
    /* a sliver of the face, turned away from us */
    g2.fillStyle = COAT;
    g2.beginPath();
    g2.ellipse(hcx - g.headRx * 0.52, g.headCy + g.headRy * 0.14,
      g.headRx * 0.50, g.headRy * 0.84, 0, 0, TAU);
    g2.fill();

    /* neck */
    g2.fillStyle = COAT;
    g2.beginPath();
    g2.moveTo(hcx - hh * 0.115, g.neckY - hh * 0.34);
    g2.lineTo(hcx + hh * 0.115, g.neckY - hh * 0.34);
    g2.lineTo(hcx + hh * 0.17, g.shoulderY + hh * 0.08);
    g2.lineTo(hcx - hh * 0.17, g.shoulderY + hh * 0.08);
    g2.closePath();
    g2.fill();

    /* wet hair highlight: a couple of soft strands catching the neon */
    g2.strokeStyle = 'rgba(126,178,232,0.10)';
    g2.lineWidth = Math.max(1, hh * 0.018);
    for (var s = 0; s < 2; s++) {
      var off = (s - 0.5) * hh * 0.24;
      g2.beginPath();
      g2.moveTo(hcx + off * 0.7, g.neckY + hh * 0.20);
      g2.bezierCurveTo(hcx + off + hh * 0.04, g.chestY,
        hcx + off + hairSw * hh * 0.04, g.waistY,
        hcx + off * 1.2 + hairSw * hh * 0.09, hairEnd - hh * 0.35);
      g2.stroke();
    }

    /* ---------------- coat ---------------- */
    g2.fillStyle = COAT;
    g2.beginPath();
    g2.moveTo(hcx - g.sho * 0.97, g.shoulderY);
    g2.bezierCurveTo(hcx - g.sho * 1.06, g.shoulderY + hh * 0.85,
      hcx - g.wai * 1.14, g.waistY - hh * 0.30,
      hcx - g.wai, g.waistY);
    g2.bezierCurveTo(hcx - g.wai * 1.10, g.hipY + hh * 0.30,
      hcx - g.coatHem - hh * 0.05 + coatSw * hh * 0.03,
      g.coatHemY - hh * 0.40,
      hcx - g.coatHem + coatSw * hh * 0.06, g.coatHemY);
    g2.quadraticCurveTo(hcx - g.coatHem * 0.48, g.coatHemY + hh * 0.13,
      hcx + coatSw * hh * 0.03, g.coatHemY + hh * 0.02);
    g2.quadraticCurveTo(hcx + g.coatHem * 0.48, g.coatHemY + hh * 0.15,
      hcx + g.coatHem + coatSw * hh * 0.05, g.coatHemY - hh * 0.02);
    g2.bezierCurveTo(hcx + g.coatHem - hh * 0.02, g.coatHemY - hh * 0.42,
      hcx + g.wai * 1.10, g.hipY + hh * 0.30,
      hcx + g.wai, g.waistY);
    g2.bezierCurveTo(hcx + g.wai * 1.14, g.waistY - hh * 0.30,
      hcx + g.sho * 1.06, g.shoulderY + hh * 0.85,
      hcx + g.sho * 0.97, g.shoulderY);
    g2.quadraticCurveTo(hcx, g.shoulderY - hh * 0.30, hcx - g.sho * 0.97, g.shoulderY);
    g2.closePath();
    g2.fill();

    /* a breath of atmosphere on her lit side, so the mass is not dead flat */
    putGlow(g2, sprIce, hcx - g.wai * 1.45, g.chestY + hh * 0.7,
      hh * 3.0, hh * 6.4, 0.055);

    /* ---------------- legs + boots ---------------- */
    var legFX = hcx - hh * 0.17;
    var legBX = hcx + hh * 0.18;
    g2.fillStyle = COAT;
    function leg(xk, xa) {
      g2.beginPath();
      g2.moveTo(xk - hh * 0.15, g.coatHemY - hh * 0.35);
      g2.lineTo(xk + hh * 0.15, g.coatHemY - hh * 0.35);
      g2.quadraticCurveTo(xa + hh * 0.13, g.footY - hh * 0.55, xa + hh * 0.125, g.footY - hh * 0.12);
      g2.lineTo(xa - hh * 0.125, g.footY - hh * 0.12);
      g2.quadraticCurveTo(xa - hh * 0.13, g.footY - hh * 0.55, xk - hh * 0.15, g.coatHemY - hh * 0.35);
      g2.closePath();
      g2.fill();
      /* boot */
      g2.beginPath();
      g2.moveTo(xa - hh * 0.14, g.footY - hh * 0.22);
      g2.lineTo(xa + hh * 0.14, g.footY - hh * 0.22);
      g2.quadraticCurveTo(xa + hh * 0.21, g.footY - hh * 0.03, xa + hh * 0.06, g.footY);
      g2.lineTo(xa - hh * 0.20, g.footY);
      g2.quadraticCurveTo(xa - hh * 0.24, g.footY - hh * 0.10, xa - hh * 0.14, g.footY - hh * 0.22);
      g2.closePath();
      g2.fill();
    }
    leg(legFX, legFX - hh * 0.05);
    leg(legBX, legBX + hh * 0.06);

    /* ---------------- arms ---------------- */
    g2.lineCap = 'round';
    g2.lineJoin = 'round';
    g2.strokeStyle = COAT;

    var shR = { x: hcx + g.sho * 0.86, y: g.shoulderY + hh * 0.12 };
    var elR = { x: hcx + hh * 1.24, y: g.shoulderY + hh * 0.80 + sw2 * hh * 0.025 };
    var haR = { x: g.poleX, y: g.handY };
    g2.lineWidth = Math.max(2, hh * 0.210);
    g2.beginPath();
    g2.moveTo(shR.x, shR.y);
    g2.quadraticCurveTo(elR.x, elR.y, haR.x, haR.y);
    g2.stroke();

    var shL = { x: hcx - g.sho * 0.86, y: g.shoulderY + hh * 0.14 };
    var elL = { x: hcx - hh * 0.82, y: g.headTop + hh * 3.00 };
    var haL = { x: hcx - hh * 0.75, y: g.headTop + hh * 4.10 };
    g2.lineWidth = Math.max(2, hh * 0.200);
    g2.beginPath();
    g2.moveTo(shL.x, shL.y);
    g2.quadraticCurveTo(elL.x, elL.y, haL.x, haL.y);
    g2.stroke();

    /* hand gripping the shaft */
    g2.fillStyle = COAT;
    g2.beginPath();
    g2.arc(haR.x, haR.y, hh * 0.125, 0, TAU);
    g2.fill();

    g2.lineCap = 'butt';
    g2.lineWidth = 1;

    /* ---------------- rim light ---------------- */
    /* cyan from the neon signs, tracing the left silhouette */
    g2.strokeStyle = 'rgba(46,230,255,0.30)';
    g2.lineWidth = Math.max(1, hh * 0.024);
    g2.beginPath();
    g2.moveTo(hcx - g.sho * 0.96, g.shoulderY + hh * 0.04);
    g2.quadraticCurveTo(shL.x - hh * 0.04, shL.y - hh * 0.10,
      elL.x - hh * 0.10, elL.y - hh * 0.05);
    g2.stroke();

    /* thin cool edge along the hair down the back */
    g2.strokeStyle = 'rgba(46,230,255,0.26)';
    g2.lineWidth = Math.max(1, hh * 0.020);
    g2.beginPath();
    g2.moveTo(hcx - hh * 0.38 + lean, g.chestY + hh * 0.10);
    g2.bezierCurveTo(hcx - hh * 0.48 + lean, g.hipY - hh * 0.30,
      hcx - hh * 0.48 + lean * 1.6, hairEnd - hh * 0.62,
      hcx - hh * 0.42 + lean * 1.6 + hairSw * hh * 0.14, hairEnd - hh * 0.04);
    g2.stroke();

    /* wet highlight on the crown, lit through the canopy */
    g2.strokeStyle = 'rgba(170,240,255,0.34)';
    g2.lineWidth = Math.max(1, hh * 0.024);
    g2.beginPath();
    g2.moveTo(hcx - g.headRx * 0.86, g.headCy - g.headRy * 0.48);
    g2.quadraticCurveTo(hcx - g.headRx * 0.10, crownY - hh * 0.02,
      hcx + g.headRx * 0.70, g.headCy - g.headRy * 0.58);
    g2.stroke();

    /* magenta bounce on the right edge of the coat */
    g2.strokeStyle = 'rgba(255,47,142,0.26)';
    g2.lineWidth = Math.max(1, hh * 0.026);
    g2.beginPath();
    g2.moveTo(hcx + g.sho * 0.98, g.shoulderY + hh * 0.16);
    g2.bezierCurveTo(hcx + g.sho * 1.04, g.shoulderY + hh * 0.95,
      hcx + g.wai * 1.10, g.waistY - hh * 0.20,
      hcx + g.wai * 1.02, g.waistY + hh * 0.10);
    g2.stroke();

    g2.strokeStyle = 'rgba(255,47,142,0.20)';
    g2.lineWidth = Math.max(1, hh * 0.022);
    g2.beginPath();
    g2.moveTo(hcx + g.coatHem + coatSw * hh * 0.05, g.coatHemY - hh * 0.10);
    g2.quadraticCurveTo(hcx + g.coatHem * 0.45, g.coatHemY + hh * 0.16,
      hcx + coatSw * hh * 0.03, g.coatHemY + hh * 0.02);
    g2.stroke();

    g2.lineWidth = 1;
  }

  function drawFigureFull(g2, tsec) {
    drawFigure(g2, tsec);
    drawPole(g2);
    drawCanopy(g2, tsec);
  }

  /* -------------------------------------------------------------- per frame */

  function updateSigns(tsec) {
    for (var i = 0; i < signs.length; i++) {
      var s = signs[i];
      if (!s.lit) {
        if (tsec >= s.offUntil) {
          s.lit = true;
          s.nextOff = tsec + 2.0 + Math.random() * 7.0;
        }
      } else if (tsec >= s.nextOff) {
        s.lit = false;
        s.offUntil = tsec + 0.05 + Math.random() * 0.10;
      }
    }
  }

  function drawSignBlanks() {
    for (var i = 0; i < signs.length; i++) {
      var s = signs[i];
      if (s.lit) { continue; }
      var cx = s.x + s.w / 2;
      var cy = s.y + s.h / 2;
      ctx.fillStyle = 'rgba(5,6,16,0.40)';
      ctx.beginPath();
      ctx.ellipse(cx, cy, s.w * 2.2, s.h * 0.80, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(4,5,12,0.93)';
      ctx.fillRect(s.x - u, s.y - u, s.w + 2 * u, s.h + 2 * u);
    }
  }

  function drawRipples(dt) {
    var bandH = H - HZ;
    for (var i = ripples.length - 1; i >= 0; i--) {
      var r = ripples[i];
      r.age += dt;
      if (r.age >= r.life) {
        ripples.splice(i, 1);
        continue;
      }
      var p = r.age / r.life;
      var ez = 1 - Math.pow(1 - p, 2.2);
      var rx = r.r0 + (r.r1 - r.r0) * ez;
      var ry = rx * 0.24;
      var a = Math.pow(1 - p, 1.7);
      var depth = (r.y - HZ) / bandH;

      ctx.strokeStyle = 'rgba(150,208,255,' + (0.22 * a).toFixed(3) + ')';
      ctx.lineWidth = Math.max(1, (1.5 - depth * 0.7) * u);
      ctx.beginPath();
      ctx.ellipse(r.x, r.y, rx, ry, 0, 0, TAU);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(120,190,245,' + (0.13 * a).toFixed(3) + ')';
      ctx.beginPath();
      ctx.ellipse(r.x, r.y, rx * 0.58, ry * 0.58, 0, 0, TAU);
      ctx.stroke();

      var ga = 0.16 * a * (1 - p);
      if (ga > 0.01) {
        putGlow(ctx, sprIce, r.x, r.y, rx * 1.5, rx * 0.50, ga);
      }
    }
  }

  function drawGroundFigure(dt) {
    var g = G;
    if (!g) { return; }
    var bandH = H - g.footY;
    if (bandH <= 4) { return; }

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, g.footY - 2 * u, W, H - g.footY + 2 * u);
    ctx.clip();
    ctx.translate(0, g.footY * 2);
    ctx.scale(1, -1);
    ctx.globalAlpha = 0.20;
    drawFigureFull(ctx, t);
    ctx.globalAlpha = 0.09;
    ctx.translate(Math.sin(t * 1.7) * 3 * u, 0);
    drawFigureFull(ctx, t);
    ctx.restore();
    ctx.globalAlpha = 1;

    /* wet contact shadow, keeps her planted on the asphalt */
    ctx.fillStyle = 'rgba(2,3,8,0.50)';
    ctx.beginPath();
    ctx.ellipse(g.px, g.footY + 2 * u, g.hh * 1.7, g.hh * 0.24, 0, 0, TAU);
    ctx.fill();

    putGlow(ctx, sprCyan, g.px - g.hh * 1.05, g.footY + g.hh * 0.10,
      g.hh * 3.6, g.hh * 0.85, 0.16);

    /* magenta neon pooling on the wet street around her right side */
    putGlow(ctx, sprPink, g.px + g.hh * 2.6, g.footY + g.hh * 0.35,
      g.hh * 7.0, g.hh * 2.4, 0.13);
    putGlow(ctx, sprWarm, g.px + g.hh * 0.4, g.footY + g.hh * 0.55,
      g.hh * 6.0, g.hh * 1.6, 0.10);
  }

  function drawDrops(dt) {
    for (var i = 0; i < drops.length; i++) {
      var d = drops[i];
      d.y += d.vy * dt;
      d.x += Math.sin(t * 0.7 + d.ph) * 2.4 * u * dt;
      if (d.y - d.r * 2 > H) {
        d.y = -d.r * 1.8;
        d.x = Math.random() * Math.max(W * 0.35, W - 330 * u);
      }
      var r = d.r;
      ctx.globalAlpha = d.a * 0.40;
      ctx.drawImage(dropCan, d.x - r * 0.75, d.y - r * 3.0, r * 1.5, r * 3.4);
      ctx.globalAlpha = d.a;
      ctx.drawImage(dropCan, d.x - r, d.y - r, r * 2, r * 2.1);
    }
    ctx.globalAlpha = 1;
  }

  function drawFrame(dt) {
    var g2 = ctx;
    g2.setTransform(dpr, 0, 0, dpr, 0, 0);
    g2.globalAlpha = 1;
    g2.globalCompositeOperation = 'source-over';

    /* 1. static city + ground base */
    g2.drawImage(bgCan, 0, 0, W, H);

    /* 2. a sign that just went dark */
    drawSignBlanks();

    /* 3. wet ground: wobbly squashed mirror of the city */
    if (reflCan) {
      g2.drawImage(reflCan, 0, HZ, W, H - HZ);
    }

    /* 4. far rain, behind the figure */
    drawRain(patA, mod(t * 380 * COS_A, TILE), mod(t * 380 * SIN_A, TILE), 0.42);

    /* 5. the girl and her reflection */
    drawGroundFigure(dt);
    drawFigureFull(g2, t);

    /* 6. ripples on the wet street */
    drawRipples(dt);

    /* 7. near rain, in front of everything */
    drawRain(patB, mod(t * 620 * COS_A, TILE), mod(t * 620 * SIN_A, TILE), 0.60);

    /* 8. drops on the lens */
    drawDrops(dt);

    /* 9. keep the top-right corner dark for the host button */
    g2.globalAlpha = 1;
    g2.drawImage(scrimCan, W - 300 * u, -34 * u, 344 * u, 230 * u);
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

    updateSigns(t);

    rippleAcc += dt;
    while (rippleAcc >= 0.40) {
      rippleAcc -= 0.40;
      if (ripples.length < 14) { spawnRipple(false); }
      if (Math.random() < 0.45 && ripples.length < 14) { spawnRipple(false); }
    }

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
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';

    buildSprites();
    computeGeo();
    buildBg();
    buildReflection();
    buildRain();
    initDrops();
    initRipples();
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
