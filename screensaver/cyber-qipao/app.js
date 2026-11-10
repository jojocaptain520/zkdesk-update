/* ==========================================================================
   Guang-zhi Shao-nu / Light-woven Maiden -- procedural canvas screensaver.
   Bright, clean "product render" style: cyan-white gradient, soft white light
   shafts, a silver-haired girl in a light-woven gown, thin HUD rings, flowing
   data streaks, floating translucent solids.

   Contract:
     - pure canvas, no external image / font / network / storage
     - no pointer / key listeners, no self-drawn exit button
     - canvas size = innerWidth/innerHeight * min(devicePixelRatio, 1.5)
     - static layers pre-rendered to offscreen canvases, per frame only blit
       plus a few small transformed sprites
     - the per frame loop uses drawImage only: no shadow, no gradients, no
       pixel read-back, no text
   ========================================================================== */
(function () {
  'use strict';

  var TAU = Math.PI * 2;
  var MAX_DPR = 1.5;

  var canvas = document.getElementById('scene');
  if (!canvas) { return; }
  var ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) { return; }

  var W = 1, H = 1, dpr = 1;
  var L = { ox: 0, oy: 0, unit: 1 };
  var bg = null;
  var S = {};
  var hudRings = [];
  var floats = [];
  var streaks = [];
  var glows = [];
  var sparks = [];
  var t = 0, lastTs = 0, rafId = 0, resizeTimer = 0;

  /* ---------------------------------------------------------------- utils */

  function rand(a, b) { return a + Math.random() * (b - a); }
  function round(v) { return Math.round(v); }

  function makeCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, round(w));
    c.height = Math.max(1, round(h));
    return c;
  }

  function makeGlow(rgb, size, core) {
    var c = makeCanvas(size, size);
    var g = c.getContext('2d');
    var r = c.width * 0.5;
    var gr = g.createRadialGradient(r, r, 0, r, r, r);
    gr.addColorStop(0.00, 'rgba(' + rgb + ',1)');
    gr.addColorStop(core || 0.30, 'rgba(' + rgb + ',0.42)');
    gr.addColorStop(0.62, 'rgba(' + rgb + ',0.10)');
    gr.addColorStop(1.00, 'rgba(' + rgb + ',0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, c.width, c.height);
    return c;
  }

  function blitGlow(g, sprite, cx, cy, size, alpha) {
    g.save();
    g.globalAlpha = alpha;
    g.drawImage(sprite, cx - size * 0.5, cy - size * 0.5, size, size);
    g.restore();
  }

  function blitGlowUnit(g, sprite, u, v, size, alpha) {
    g.save();
    g.globalAlpha = alpha;
    g.drawImage(sprite, u - size * 0.5, v - size * 0.5, size, size);
    g.restore();
  }

  function crPath(g, pts, closed) {
    var n = pts.length, i, p0, p1, p2, p3;
    if (n < 2) { return; }
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    if (closed) {
      for (i = 0; i < n; i++) {
        p0 = pts[(i - 1 + n) % n];
        p1 = pts[i];
        p2 = pts[(i + 1) % n];
        p3 = pts[(i + 2) % n];
        g.bezierCurveTo(
          p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6,
          p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6,
          p2[0], p2[1]);
      }
      g.closePath();
    } else {
      for (i = 0; i < n - 1; i++) {
        p0 = pts[i > 0 ? i - 1 : 0];
        p1 = pts[i];
        p2 = pts[i + 1];
        p3 = pts[i + 2 < n ? i + 2 : n - 1];
        g.bezierCurveTo(
          p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6,
          p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6,
          p2[0], p2[1]);
      }
    }
  }

  function fillCR(g, pts, style) {
    crPath(g, pts, true);
    if (style) { g.fillStyle = style; }
    g.fill();
  }

  function lineCR(g, pts, style, lw, alpha) {
    crPath(g, pts, false);
    g.strokeStyle = style;
    g.lineWidth = lw;
    g.globalAlpha = alpha === undefined ? 1 : alpha;
    g.stroke();
    g.globalAlpha = 1;
  }

  /* tapered limb: soft outline first, then the bright fill */
  function limb(g, x0, y0, x1, y1, w, edge, fill) {
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.strokeStyle = edge;
    g.lineWidth = w + 0.008;
    g.stroke();
    g.strokeStyle = fill;
    g.lineWidth = w;
    g.stroke();
  }

  /* ------------------------------------------------------- figure geometry
     y = 0 top of head, y = 1 sole; head is 0.162u tall = 12% of screen height.
     ---------------------------------------------------------------------- */

  var DRESS = [
    [-0.086, 0.226], [-0.098, 0.248], [-0.094, 0.286], [-0.080, 0.318],
    [-0.060, 0.356], [-0.049, 0.392], [-0.058, 0.432], [-0.076, 0.470],
    [-0.082, 0.512], [-0.088, 0.566], [-0.094, 0.644], [-0.100, 0.728],
    [-0.104, 0.812], [-0.106, 0.876], [-0.100, 0.914], [-0.070, 0.938],
    [-0.028, 0.948], [0.014, 0.950], [0.056, 0.942], [0.096, 0.924],
    [0.110, 0.888], [0.112, 0.818], [0.108, 0.736], [0.102, 0.652],
    [0.096, 0.572], [0.090, 0.512], [0.082, 0.470], [0.070, 0.432],
    [0.056, 0.392], [0.058, 0.356], [0.076, 0.318], [0.092, 0.286],
    [0.098, 0.248], [0.086, 0.226], [0.040, 0.214], [0.000, 0.210], [-0.040, 0.214]
  ];

  var FACE = [
    [0.000, 0.004], [0.030, 0.006], [0.050, 0.022], [0.058, 0.048],
    [0.060, 0.080], [0.056, 0.108], [0.046, 0.132], [0.030, 0.150],
    [0.014, 0.160], [0.000, 0.163], [-0.014, 0.160], [-0.030, 0.150],
    [-0.046, 0.132], [-0.056, 0.108], [-0.060, 0.080], [-0.058, 0.048],
    [-0.050, 0.022], [-0.030, 0.006]
  ];

  var HAIR_BACK = [
    [0.000, -0.020], [0.048, -0.006], [0.072, 0.026], [0.082, 0.074],
    [0.086, 0.140], [0.098, 0.216], [0.108, 0.300], [0.112, 0.380],
    [0.104, 0.446], [0.078, 0.470], [0.040, 0.452], [0.000, 0.466],
    [-0.040, 0.452], [-0.078, 0.470], [-0.104, 0.446], [-0.112, 0.380],
    [-0.108, 0.300], [-0.098, 0.216], [-0.086, 0.140], [-0.082, 0.074],
    [-0.072, 0.026], [-0.048, -0.006]
  ];

  var BANGS = [
    [0.000, -0.018], [0.042, -0.006], [0.062, 0.020], [0.066, 0.052],
    [0.050, 0.044], [0.036, 0.062], [0.018, 0.044], [0.002, 0.066],
    [-0.016, 0.044], [-0.034, 0.062], [-0.050, 0.044], [-0.066, 0.052],
    [-0.062, 0.020], [-0.042, -0.006]
  ];

  var LOCK_L = [
    [-0.052, 0.026], [-0.072, 0.120], [-0.086, 0.230], [-0.090, 0.330],
    [-0.082, 0.404], [-0.070, 0.436], [-0.066, 0.360], [-0.062, 0.262],
    [-0.052, 0.166], [-0.040, 0.086]
  ];
  var LOCK_R = [
    [0.052, 0.026], [0.074, 0.120], [0.090, 0.230], [0.096, 0.326],
    [0.090, 0.396], [0.080, 0.428], [0.074, 0.356], [0.068, 0.260],
    [0.054, 0.164], [0.040, 0.084]
  ];

  /* ------------------------------------------------------------ sprites */

  function makeCube() {
    var s = 256, c = makeCanvas(s, s), g = c.getContext('2d');
    var cx = s * 0.5, cy = s * 0.5, r = s * 0.36;
    var top = [[0, -r], [r * 0.86, -r * 0.5], [0, 0], [-r * 0.86, -r * 0.5]];
    var left = [[-r * 0.86, -r * 0.5], [0, 0], [0, r], [-r * 0.86, r * 0.5]];
    var right = [[0, 0], [r * 0.86, -r * 0.5], [r * 0.86, r * 0.5], [0, r]];
    function poly(p, fill) {
      g.beginPath();
      g.moveTo(cx + p[0][0], cy + p[0][1]);
      for (var i = 1; i < p.length; i++) { g.lineTo(cx + p[i][0], cy + p[i][1]); }
      g.closePath();
      g.fillStyle = fill;
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.95)';
      g.lineWidth = 2.6;
      g.stroke();
    }
    poly(top, 'rgba(255,255,255,0.62)');
    poly(left, 'rgba(126,206,244,0.62)');
    poly(right, 'rgba(190,234,255,0.58)');
    g.strokeStyle = 'rgba(255,92,150,0.75)';
    g.lineWidth = 2.2;
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx - r * 0.86, cy - r * 0.5);
    g.stroke();
    return c;
  }

  function makeCubeMag() {
    var s = 256, c = makeCanvas(s, s), g = c.getContext('2d');
    var cx = s * 0.5, cy = s * 0.5, r = s * 0.36;
    function poly(p, fill) {
      g.beginPath();
      g.moveTo(cx + p[0][0], cy + p[0][1]);
      for (var i = 1; i < p.length; i++) { g.lineTo(cx + p[i][0], cy + p[i][1]); }
      g.closePath();
      g.fillStyle = fill;
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.95)';
      g.lineWidth = 2.6;
      g.stroke();
    }
    poly([[0, -r], [r * 0.86, -r * 0.5], [0, 0], [-r * 0.86, -r * 0.5]], 'rgba(255,196,220,0.62)');
    poly([[-r * 0.86, -r * 0.5], [0, 0], [0, r], [-r * 0.86, r * 0.5]], 'rgba(255,118,166,0.60)');
    poly([[0, 0], [r * 0.86, -r * 0.5], [r * 0.86, r * 0.5], [0, r]], 'rgba(255,150,190,0.52)');
    return c;
  }

  function makeSphere() {
    var s = 256, c = makeCanvas(s, s), g = c.getContext('2d');
    var cx = s * 0.5, cy = s * 0.5, r = s * 0.40;
    var gr = g.createRadialGradient(cx - r * 0.32, cy - r * 0.36, r * 0.08, cx, cy, r);
    gr.addColorStop(0.00, 'rgba(255,255,255,0.95)');
    gr.addColorStop(0.38, 'rgba(224,246,255,0.62)');
    gr.addColorStop(0.74, 'rgba(110,200,240,0.55)');
    gr.addColorStop(1.00, 'rgba(120,196,232,0.16)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(cx, cy, r, 0, TAU);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.92)';
    g.lineWidth = 2.4;
    g.beginPath();
    g.arc(cx, cy, r, 0, TAU);
    g.stroke();
    g.strokeStyle = 'rgba(120,206,240,0.28)';
    g.lineWidth = 1.6;
    g.beginPath();
    g.ellipse(cx, cy, r * 0.94, r * 0.38, 0, 0, TAU);
    g.stroke();
    return c;
  }

  function makeFlatRing() {
    var s = 256, c = makeCanvas(s, s), g = c.getContext('2d');
    var cx = s * 0.5, cy = s * 0.5;
    g.strokeStyle = 'rgba(255,255,255,0.95)';
    g.lineWidth = 3.0;
    g.beginPath();
    g.ellipse(cx, cy, s * 0.42, s * 0.20, 0, 0, TAU);
    g.stroke();
    g.strokeStyle = 'rgba(150,222,246,0.55)';
    g.lineWidth = 7.0;
    g.beginPath();
    g.ellipse(cx, cy, s * 0.42, s * 0.20, 0, 0, TAU);
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.95)';
    g.lineWidth = 2.0;
    g.beginPath();
    g.ellipse(cx, cy, s * 0.28, s * 0.132, 0, 0, TAU);
    g.stroke();
    return c;
  }

  /* HUD ring: thin arcs, tick marks, node dots; rotation is visible */
  function makeHud() {
    var s = 512, c = makeCanvas(s, s), g = c.getContext('2d');
    var m = s * 0.5, R = s * 0.44;
    g.translate(m, m);
    g.lineCap = 'round';

    g.strokeStyle = 'rgba(79,216,255,0.80)';
    g.lineWidth = 2.4;
    g.beginPath();
    g.arc(0, 0, R, 0.30, 2.60);
    g.stroke();
    g.strokeStyle = 'rgba(79,216,255,0.58)';
    g.beginPath();
    g.arc(0, 0, R, 3.30, 5.10);
    g.stroke();

    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.lineWidth = 3.0;
    g.beginPath();
    g.arc(0, 0, R * 0.995, 0.34, 1.62);
    g.stroke();

    g.strokeStyle = 'rgba(79,216,255,0.55)';
    g.lineWidth = 1.8;
    g.beginPath();
    g.arc(0, 0, R * 0.90, 0, TAU);
    g.stroke();

    var i, a;
    for (i = 0; i < 24; i++) {
      a = i * (TAU / 24);
      var r0 = R * (i % 4 === 0 ? 0.855 : 0.90);
      g.strokeStyle = i % 4 === 0
        ? 'rgba(60,196,236,0.90)' : 'rgba(79,216,255,0.60)';
      g.lineWidth = i % 4 === 0 ? 2.6 : 1.5;
      g.beginPath();
      g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
      g.lineTo(Math.cos(a) * R * 0.975, Math.sin(a) * R * 0.975);
      g.stroke();
    }

    g.fillStyle = 'rgba(255,255,255,0.95)';
    var dots = [0.30, 2.60, 3.30, 5.10];
    for (i = 0; i < dots.length; i++) {
      g.beginPath();
      g.arc(Math.cos(dots[i]) * R, Math.sin(dots[i]) * R, 4.6, 0, TAU);
      g.fill();
    }
    g.fillStyle = 'rgba(255,92,150,0.85)';
    g.beginPath();
    g.arc(Math.cos(4.20) * R, Math.sin(4.20) * R, 4.0, 0, TAU);
    g.fill();
    return c;
  }

  function makeStreak() {
    var w = 320, h = 18, c = makeCanvas(w, h), g = c.getContext('2d');
    var gr = g.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0.00, 'rgba(255,255,255,0)');
    gr.addColorStop(0.35, 'rgba(126,216,240,0.55)');
    gr.addColorStop(0.70, 'rgba(220,246,255,0.95)');
    gr.addColorStop(1.00, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, h * 0.5 - 1.4, w, 2.8);
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.fillRect(w * 0.62, h * 0.5 - 2.4, 12, 4.8);
    return c;
  }

  function makeCorner() {
    var cw = 420, ch = 230;
    var c = makeCanvas(cw * dpr, ch * dpr), g = c.getContext('2d');
    g.scale(dpr, dpr);
    var gr = g.createRadialGradient(cw - 2, 2, 0, cw - 2, 2, 392);
    gr.addColorStop(0.00, 'rgba(44,70,94,0.90)');
    gr.addColorStop(0.26, 'rgba(48,76,102,0.84)');
    gr.addColorStop(0.52, 'rgba(70,102,130,0.52)');
    gr.addColorStop(0.78, 'rgba(104,140,170,0.20)');
    gr.addColorStop(1.00, 'rgba(150,190,214,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, cw, ch);
    c._cw = cw;
    c._ch = ch;
    return c;
  }

  function buildSprites() {
    S.gWhite = makeGlow('255,255,255', 256, 0.26);
    S.gCyan = makeGlow('142,226,248', 256, 0.26);
    S.gMag = makeGlow('255,116,164', 128, 0.30);
    S.gBlue = makeGlow('104,178,220', 256, 0.34);
    S.cube = makeCube();
    S.cubeMag = makeCubeMag();
    S.sphere = makeSphere();
    S.ring = makeFlatRing();
    S.hud = makeHud();
    S.streak = makeStreak();
    S.corner = makeCorner();
  }

  /* --------------------------------------------------------- static layer */

  function buildLayout() {
    L.unit = H * 0.74;
    L.ox = W * 0.42;
    L.oy = H * 0.205;
  }

  function buildStatic() {
    if (bg) { bg.width = 1; bg.height = 1; bg = null; }
    bg = makeCanvas(W * dpr, H * dpr);
    var g = bg.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.lineJoin = 'round';
    g.lineCap = 'round';

    /* 1. cyan-white base */
    var base = g.createLinearGradient(0, 0, 0, H);
    base.addColorStop(0.00, '#7fc9ea');
    base.addColorStop(0.16, '#98d6f2');
    base.addColorStop(0.34, '#cfeafb');
    base.addColorStop(0.56, '#bcd9f0');
    base.addColorStop(0.78, '#a1c2dc');
    base.addColorStop(1.00, '#84abc8');
    g.fillStyle = base;
    g.fillRect(0, 0, W, H);

    /* 2. soft white light shafts */
    var i, x;
    for (i = 0; i < 4; i++) {
      x = W * (0.10 + i * 0.245);
      var wd = W * (0.040 + (i % 2) * 0.026);
      var sg = g.createLinearGradient(x - wd, 0, x + wd, 0);
      sg.addColorStop(0.00, 'rgba(255,255,255,0)');
      sg.addColorStop(0.42, 'rgba(255,255,255,0.26)');
      sg.addColorStop(0.58, 'rgba(255,255,255,0.26)');
      sg.addColorStop(1.00, 'rgba(255,255,255,0)');
      g.fillStyle = sg;
      g.fillRect(x - wd, 0, wd * 2, H);
    }

    /* 3. wide soft bloom, keeps the upper half airy */
    blitGlow(g, S.gWhite, W * 0.46, H * 0.24, H * 1.10, 0.16);
    blitGlow(g, S.gCyan, W * 0.74, H * 0.16, H * 0.8, 0.20);
    blitGlow(g, S.gMag, W * 0.86, H * 0.62, H * 0.34, 0.16);

    /* 4. floor plane: soft shadow gradient so the light reads as a floor */
    var fl = g.createLinearGradient(0, H * 0.55, 0, H);
    fl.addColorStop(0.00, 'rgba(104,152,186,0)');
    fl.addColorStop(0.26, 'rgba(100,148,182,0.40)');
    fl.addColorStop(0.62, 'rgba(78,126,162,0.62)');
    fl.addColorStop(0.62, 'rgba(66,112,148,0.66)');
    fl.addColorStop(1.00, 'rgba(38,80,114,0.86)');
    g.fillStyle = fl;
    g.fillRect(0, H * 0.60, W, H * 0.40);

    /* faint perspective grid on the floor */
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 1.2;
    var gy, yy;
    for (i = 0; i < 7; i++) {
      yy = H * (0.700 + i * 0.048);
      g.beginPath();
      g.moveTo(0, yy);
      g.lineTo(W, yy);
      g.stroke();
    }
    for (i = -7; i <= 7; i++) {
      g.beginPath();
      g.moveTo(W * 0.46 + i * W * 0.075, H * 0.700);
      g.lineTo(W * 0.46 + i * W * 0.24, H);
      g.stroke();
    }

    /* 5. contact shadow under the girl */
    g.save();
    g.globalAlpha = 0.55;
    var shg = g.createRadialGradient(
      L.ox + L.unit * 0.01, H * 0.947, 0,
      L.ox + L.unit * 0.01, H * 0.947, L.unit * 0.36);
    shg.addColorStop(0.00, 'rgba(78,124,156,0.55)');
    shg.addColorStop(0.55, 'rgba(96,146,178,0.26)');
    shg.addColorStop(1.00, 'rgba(120,170,200,0)');
    g.fillStyle = shg;
    g.beginPath();
    g.ellipse(L.ox + L.unit * 0.01, H * 0.947,
      L.unit * 0.36, L.unit * 0.055, 0, 0, TAU);
    g.fill();
    g.restore();

    /* 6. baked HUD furniture in the corners */
    drawHudFurniture(g);

    /* 7. the girl */
    drawGirl(g);

    /* 8. a soft cast shadow lifts her off the background */
    blitGlow(g, S.gBlue, L.ox - L.unit * 0.02, L.oy + L.unit * 0.40, L.unit * 0.92, 0.22);
    blitGlow(g, S.gCyan, L.ox + L.unit * 0.16, L.oy + L.unit * 0.46, L.unit * 0.30, 0.26);

    /* 9. very light edge veil */
    var vg = g.createRadialGradient(W * 0.44, H * 0.46, Math.min(W, H) * 0.42,
      W * 0.44, H * 0.46, Math.max(W, H) * 0.86);
    vg.addColorStop(0, 'rgba(255,255,255,0)');
    vg.addColorStop(0.72, 'rgba(196,226,246,0.16)');
    vg.addColorStop(1, 'rgba(168,206,232,0.42)');
    g.fillStyle = vg;
    g.fillRect(0, 0, W, H);
  }

  function drawHudFurniture(g) {
    var i, a;
    /* corner arcs */
    g.strokeStyle = 'rgba(126,214,240,0.55)';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(W * 0.02, H * 0.06, H * 0.16, 0.1, 1.5);
    g.stroke();
    g.beginPath();
    g.arc(W * 0.98, H * 0.94, H * 0.20, 3.2, 4.6);
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.75)';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(W * 0.02, H * 0.06, H * 0.175, 0.24, 1.1);
    g.stroke();

    /* tick marks along the lower left */
    for (i = 0; i < 9; i++) {
      a = 0.28 + i * 0.055;
      g.strokeStyle = 'rgba(120,206,234,' + (0.5 - i * 0.03).toFixed(2) + ')';
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(W * 0.03 + Math.cos(a) * H * 0.20, H * 0.06 + Math.sin(a) * H * 0.20);
      g.lineTo(W * 0.03 + Math.cos(a) * H * 0.23, H * 0.06 + Math.sin(a) * H * 0.23);
      g.stroke();
    }
    /* horizontal rules top left / bottom right */
    g.strokeStyle = 'rgba(255,255,255,0.8)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(W * 0.055, H * 0.115);
    g.lineTo(W * 0.20, H * 0.115);
    g.stroke();
    g.strokeStyle = 'rgba(120,206,234,0.55)';
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(W * 0.055, H * 0.132);
    g.lineTo(W * 0.155, H * 0.132);
    g.stroke();
    g.beginPath();
    g.moveTo(W * 0.80, H * 0.905);
    g.lineTo(W * 0.945, H * 0.905);
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.8)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(W * 0.855, H * 0.888);
    g.lineTo(W * 0.945, H * 0.888);
    g.stroke();
  }

  /* ------------------------------------------------------------- the girl */

  function drawGirl(g) {
    g.save();
    g.translate(L.ox, L.oy);
    g.scale(L.unit, L.unit);

    var skin = g.createLinearGradient(0, 0.02, 0, 0.22);
    skin.addColorStop(0.00, '#fff8f4');
    skin.addColorStop(0.55, '#fff0e8');
    skin.addColorStop(1.00, '#f8ddd2');

    /* hair behind everything, a soft silver mass */
    var hairBack = g.createLinearGradient(-0.11, 0.02, 0.11, 0.46);
    hairBack.addColorStop(0.00, '#dfeefb');
    hairBack.addColorStop(0.35, '#aecbdf');
    hairBack.addColorStop(0.70, '#84a8c4');
    hairBack.addColorStop(1.00, '#6689a8');
    fillCR(g, HAIR_BACK, hairBack);
    lineCR(g, HAIR_BACK, 'rgba(255,255,255,0.85)', 0.006, 1);

    /* neck */
    g.fillStyle = skin;
    g.beginPath();
    g.moveTo(-0.020, 0.150);
    g.bezierCurveTo(-0.024, 0.180, -0.028, 0.200, -0.034, 0.216);
    g.lineTo(0.034, 0.216);
    g.bezierCurveTo(0.028, 0.200, 0.024, 0.180, 0.020, 0.150);
    g.closePath();
    g.fill();

    /* neck shading + collarbone shadow */
    g.fillStyle = 'rgba(196,158,158,0.30)';
    g.beginPath();
    g.ellipse(0.000, 0.168, 0.030, 0.012, 0, 0, TAU);
    g.fill();
    g.strokeStyle = 'rgba(170,196,216,0.55)';
    g.lineWidth = 0.0028;
    g.beginPath();
    g.moveTo(-0.034, 0.230);
    g.bezierCurveTo(-0.018, 0.238, 0.018, 0.238, 0.034, 0.230);
    g.stroke();

    /* gown */
    var dressFill = g.createLinearGradient(-0.10, 0.22, 0.10, 0.94);
    dressFill.addColorStop(0.00, '#eaf7ff');
    dressFill.addColorStop(0.30, '#bcd9f2');
    dressFill.addColorStop(0.62, '#93bddc');
    dressFill.addColorStop(1.00, '#6fa2c7');
    fillCR(g, DRESS, dressFill);

    /* volume: shaded side on the left, glow on the right */
    g.save();
    crPath(g, DRESS, true);
    g.clip();
    var sideShadow = g.createLinearGradient(-0.11, 0, 0.03, 0);
    sideShadow.addColorStop(0.00, 'rgba(92,142,178,0.72)');
    sideShadow.addColorStop(0.45, 'rgba(120,166,198,0.40)');
    sideShadow.addColorStop(1.00, 'rgba(170,204,226,0)');
    g.fillStyle = sideShadow;
    g.fillRect(-0.14, 0.20, 0.16, 0.76);

    blitGlowUnit(g, S.gWhite, 0.045, 0.330, 0.30, 0.28);
    blitGlowUnit(g, S.gCyan, 0.070, 0.640, 0.40, 0.30);
    blitGlowUnit(g, S.gWhite, -0.010, 0.900, 0.36, 0.22);

    /* bodice form: bust swell, under-bust shadow, hip light */
    blitGlowUnit(g, S.gWhite, -0.030, 0.300, 0.14, 0.55);
    blitGlowUnit(g, S.gWhite, 0.034, 0.300, 0.13, 0.60);
    g.save();
    crPath(g, DRESS, true);
    g.clip();
    var ub = g.createLinearGradient(0, 0.316, 0, 0.352);
    ub.addColorStop(0, 'rgba(120,162,194,0)');
    ub.addColorStop(1, 'rgba(112,156,190,0.60)');
    g.fillStyle = ub;
    g.fillRect(-0.10, 0.316, 0.20, 0.040);
    blitGlowUnit(g, S.gWhite, -0.052, 0.470, 0.16, 0.50);
    blitGlowUnit(g, S.gWhite, 0.056, 0.470, 0.16, 0.45);
    /* waist sash */
    g.strokeStyle = 'rgba(255,255,255,0.95)';
    g.lineWidth = 0.011;
    g.beginPath();
    g.moveTo(-0.050, 0.390);
    g.bezierCurveTo(-0.018, 0.400, 0.018, 0.400, 0.052, 0.390);
    g.stroke();
    g.strokeStyle = 'rgba(126,206,236,0.75)';
    g.lineWidth = 0.0040;
    g.beginPath();
    g.moveTo(-0.050, 0.394);
    g.bezierCurveTo(-0.018, 0.404, 0.018, 0.404, 0.052, 0.394);
    g.stroke();
    g.restore();

    /* fabric folds */
    var k, fx;
    for (k = 0; k < 5; k++) {
      fx = -0.078 + k * 0.040;
      g.strokeStyle = k % 2 === 0
        ? 'rgba(255,255,255,0.85)' : 'rgba(140,182,210,0.42)';
      g.lineWidth = k % 2 === 0 ? 0.0060 : 0.0042;
      g.beginPath();
      g.moveTo(fx * 0.55, 0.400);
      g.bezierCurveTo(fx * 0.80, 0.560, fx * 1.05, 0.760, fx * 1.30, 0.936);
      g.stroke();
    }
    /* vertical light bands on the silk + bright hem edge */
    var bi, bx;
    for (bi = 0; bi < 3; bi++) {
      bx = [-0.052, 0.004, 0.062][bi];
      var bg2 = g.createLinearGradient(bx - 0.018, 0, bx + 0.018, 0);
      bg2.addColorStop(0.00, 'rgba(255,255,255,0)');
      bg2.addColorStop(0.50, 'rgba(255,255,255,' + [0.52, 0.62, 0.44][bi] + ')');
      bg2.addColorStop(1.00, 'rgba(255,255,255,0)');
      g.fillStyle = bg2;
      g.beginPath();
      g.moveTo(bx * 0.62, 0.404);
      g.bezierCurveTo(bx * 0.86, 0.600, bx * 1.06, 0.780, bx * 1.22, 0.936);
      g.lineTo(bx * 1.22 + 0.030, 0.936);
      g.bezierCurveTo(bx * 1.06 + 0.034, 0.780, bx * 0.86 + 0.030, 0.600, bx * 0.62 + 0.026, 0.404);
      g.closePath();
      g.fill();
    }
    g.strokeStyle = 'rgba(255,255,255,1)';
    g.lineWidth = 0.016;
    g.beginPath();
    g.moveTo(-0.104, 0.922);
    g.bezierCurveTo(-0.035, 0.940, 0.035, 0.940, 0.104, 0.922);
    g.stroke();
    g.strokeStyle = 'rgba(79,216,255,0.85)';
    g.lineWidth = 0.0070;
    g.beginPath();
    g.moveTo(-0.104, 0.919);
    g.bezierCurveTo(-0.035, 0.937, 0.035, 0.937, 0.104, 0.919);
    g.stroke();
    /* waist seam + hem band */
    g.strokeStyle = 'rgba(255,255,255,0.95)';
    g.lineWidth = 0.0070;
    g.beginPath();
    g.moveTo(-0.060, 0.396);
    g.bezierCurveTo(-0.020, 0.408, 0.020, 0.408, 0.060, 0.396);
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 0.010;
    g.beginPath();
    g.moveTo(-0.104, 0.922);
    g.bezierCurveTo(-0.035, 0.940, 0.035, 0.940, 0.104, 0.922);
    g.stroke();
    g.restore();

    /* crisp rim on the gown */
    lineCR(g, DRESS, 'rgba(126,216,240,0.55)', 0.016, 1);
    lineCR(g, DRESS, 'rgba(255,255,255,0.98)', 0.0050, 1);

    /* arms: upper arm + forearm + hand, with a shoulder line */
    var armOut = '#eef6fc', armIn = '#d7e6f2';
    var armEdge = 'rgba(120,166,196,0.72)';
    var armSkin = g.createLinearGradient(0, 0.24, 0, 0.50);
    armSkin.addColorStop(0, '#fffaf6');
    armSkin.addColorStop(1, '#f8e2d8');

    /* viewer-left arm hanging */
    g.beginPath();
    g.moveTo(-0.098, 0.244);
    g.bezierCurveTo(-0.114, 0.310, -0.122, 0.344, -0.120, 0.376);
    g.bezierCurveTo(-0.116, 0.428, -0.112, 0.458, -0.110, 0.480);
    g.lineTo(-0.085, 0.480);
    g.bezierCurveTo(-0.086, 0.452, -0.088, 0.424, -0.088, 0.376);
    g.bezierCurveTo(-0.084, 0.340, -0.076, 0.306, -0.072, 0.244);
    g.closePath();
    g.fillStyle = armSkin;
    g.fill();
    g.strokeStyle = armEdge;
    g.lineWidth = 0.0034;
    g.stroke();
    /* elbow crease */
    g.strokeStyle = 'rgba(196,178,180,0.55)';
    g.lineWidth = 0.0030;
    g.beginPath();
    g.moveTo(-0.118, 0.372);
    g.bezierCurveTo(-0.106, 0.382, -0.096, 0.382, -0.088, 0.374);
    g.stroke();
    /* hand */
    g.fillStyle = armSkin;
    g.beginPath();
    g.ellipse(-0.098, 0.496, 0.0145, 0.0215, 0.06, 0, TAU);
    g.fill();
    g.strokeStyle = armEdge;
    g.lineWidth = 0.0030;
    g.stroke();
    g.strokeStyle = 'rgba(198,168,166,0.55)';
    g.lineWidth = 0.0018;
    var fi;
    for (fi = 0; fi < 3; fi++) {
      g.beginPath();
      g.moveTo(-0.106 + fi * 0.0072, 0.492);
      g.lineTo(-0.107 + fi * 0.0072, 0.510);
      g.stroke();
    }

    /* viewer-right arm reaching to the orb */
    g.beginPath();
    g.moveTo(0.072, 0.244);
    g.bezierCurveTo(0.086, 0.300, 0.104, 0.330, 0.116, 0.362);
    g.bezierCurveTo(0.128, 0.404, 0.136, 0.434, 0.142, 0.454);
    g.lineTo(0.120, 0.460);
    g.bezierCurveTo(0.114, 0.438, 0.106, 0.408, 0.096, 0.366);
    g.bezierCurveTo(0.084, 0.334, 0.064, 0.304, 0.052, 0.246);
    g.closePath();
    g.fillStyle = armSkin;
    g.fill();
    g.strokeStyle = armEdge;
    g.lineWidth = 0.0034;
    g.stroke();
    g.strokeStyle = 'rgba(196,178,180,0.55)';
    g.lineWidth = 0.0030;
    g.beginPath();
    g.moveTo(0.116, 0.360);
    g.bezierCurveTo(0.106, 0.372, 0.096, 0.370, 0.090, 0.360);
    g.stroke();
    /* open palm */
    g.fillStyle = armSkin;
    g.beginPath();
    g.ellipse(0.136, 0.472, 0.0175, 0.0135, 0.32, 0, TAU);
    g.fill();
    g.strokeStyle = armEdge;
    g.lineWidth = 0.0030;
    g.stroke();
    g.strokeStyle = 'rgba(198,168,166,0.55)';
    g.lineWidth = 0.0018;
    for (fi = 0; fi < 3; fi++) {
      g.beginPath();
      g.moveTo(0.128 + fi * 0.0055, 0.470 + fi * 0.0022);
      g.lineTo(0.140 + fi * 0.0055, 0.466 + fi * 0.0022);
      g.stroke();
    }

    /* shoulder lines */
    g.strokeStyle = 'rgba(255,255,255,0.95)';
    g.lineWidth = 0.0055;
    g.beginPath();
    g.moveTo(-0.110, 0.252);
    g.bezierCurveTo(-0.098, 0.240, -0.082, 0.238, -0.068, 0.246);
    g.stroke();
    g.beginPath();
    g.moveTo(0.068, 0.246);
    g.bezierCurveTo(0.082, 0.238, 0.098, 0.240, 0.110, 0.252);
    g.stroke();
    /* head, face, hair front */
    drawHead(g, skin);

    /* floating orb above her open palm */
    drawOrb(g, 0.150, 0.418, 0.028);

    g.restore();
  }

  function drawHead(g, skin) {
    var i;

    /* face */
    fillCR(g, FACE, skin);
    /* cheek warmth */
    blitGlowUnit(g, S.gMag, -0.038, 0.114, 0.075, 0.24);
    blitGlowUnit(g, S.gMag, 0.038, 0.114, 0.075, 0.24);
    /* forehead + nose bridge highlight */
    blitGlowUnit(g, S.gWhite, 0.000, 0.048, 0.075, 0.55);
    /* shadow under the jaw */
    g.save();
    crPath(g, FACE, true);
    g.clip();
    var jaw = g.createLinearGradient(0, 0.128, 0, 0.170);
    jaw.addColorStop(0, 'rgba(226,182,170,0)');
    jaw.addColorStop(1, 'rgba(214,164,152,0.55)');
    g.fillStyle = jaw;
    g.fillRect(-0.07, 0.126, 0.14, 0.05);
    g.restore();

    /* brows */
    g.lineCap = 'round';
    for (i = -1; i <= 1; i += 2) {
      g.strokeStyle = 'rgba(150,176,196,0.72)';
      g.lineWidth = 0.0042;
      g.beginPath();
      g.moveTo(i * 0.012, 0.0745);
      g.bezierCurveTo(i * 0.024, 0.0695, i * 0.036, 0.0705, i * 0.044, 0.0755);
      g.stroke();
    }

    /* eyes */
    for (i = -1; i <= 1; i += 2) {
      var ex = i * 0.0265, ey = 0.0912;
      /* lid shadow */
      g.fillStyle = 'rgba(214,196,198,0.30)';
      g.beginPath();
      g.ellipse(ex, ey - 0.0035, 0.0165, 0.0105, 0, 0, TAU);
      g.fill();
      /* sclera */
      g.fillStyle = '#fdfeff';
      g.beginPath();
      g.moveTo(ex - 0.0150, ey + 0.0008);
      g.bezierCurveTo(ex - 0.0080, ey - 0.0092, ex + 0.0080, ey - 0.0092, ex + 0.0150, ey + 0.0008);
      g.bezierCurveTo(ex + 0.0080, ey + 0.0078, ex - 0.0080, ey + 0.0078, ex - 0.0150, ey + 0.0008);
      g.closePath();
      g.fill();
      /* iris */
      g.fillStyle = '#63c3e7';
      g.beginPath();
      g.arc(ex, ey + 0.0004, 0.0074, 0, TAU);
      g.fill();
      g.fillStyle = 'rgba(46,124,160,0.55)';
      g.beginPath();
      g.arc(ex, ey + 0.0004, 0.0074, 0, TAU);
      g.lineWidth = 0.0018;
      g.strokeStyle = 'rgba(46,124,160,0.6)';
      g.stroke();
      g.fillStyle = '#2b7091';
      g.beginPath();
      g.arc(ex, ey + 0.0006, 0.0034, 0, TAU);
      g.fill();
      /* highlight */
      g.fillStyle = 'rgba(255,255,255,0.98)';
      g.beginPath();
      g.arc(ex - 0.0026, ey - 0.0028, 0.0030, 0, TAU);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.75)';
      g.beginPath();
      g.arc(ex + 0.0030, ey + 0.0026, 0.0016, 0, TAU);
      g.fill();
      /* upper lash line */
      g.strokeStyle = 'rgba(92,132,158,0.92)';
      g.lineWidth = 0.0030;
      g.beginPath();
      g.moveTo(ex - 0.0152, ey + 0.0008);
      g.bezierCurveTo(ex - 0.0080, ey - 0.0098, ex + 0.0080, ey - 0.0098, ex + 0.0156, ey - 0.0006);
      g.stroke();
      /* outer corner lash */
      g.lineWidth = 0.0022;
      g.beginPath();
      g.moveTo(ex + i * 0.0140, ey - 0.0018);
      g.lineTo(ex + i * 0.0182, ey - 0.0048);
      g.stroke();
    }

    /* nose */
    g.strokeStyle = 'rgba(226,186,176,0.55)';
    g.lineWidth = 0.0026;
    g.beginPath();
    g.moveTo(0.0040, 0.1035);
    g.bezierCurveTo(0.0060, 0.1090, 0.0040, 0.1115, -0.0010, 0.1122);
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.lineWidth = 0.0030;
    g.beginPath();
    g.moveTo(-0.0016, 0.0980);
    g.bezierCurveTo(-0.0022, 0.1040, -0.0020, 0.1080, -0.0006, 0.1104);
    g.stroke();

    /* lips */
    var lipY = 0.1268;
    g.fillStyle = '#fb9cb2';
    g.beginPath();
    g.moveTo(-0.0125, lipY);
    g.bezierCurveTo(-0.0070, lipY + 0.0058, 0.0070, lipY + 0.0058, 0.0125, lipY);
    g.bezierCurveTo(0.0070, lipY + 0.0008, -0.0070, lipY + 0.0008, -0.0125, lipY);
    g.closePath();
    g.fill();
    g.fillStyle = '#e87c98';
    g.beginPath();
    g.moveTo(-0.0118, lipY + 0.0006);
    g.bezierCurveTo(-0.0060, lipY - 0.0040, 0.0060, lipY - 0.0040, 0.0118, lipY + 0.0006);
    g.bezierCurveTo(0.0060, lipY + 0.0016, -0.0060, lipY + 0.0016, -0.0118, lipY + 0.0006);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.beginPath();
    g.ellipse(-0.0020, lipY + 0.0034, 0.0042, 0.0016, 0, 0, TAU);
    g.fill();

    /* hair: bangs + side locks in front */
    var hairFront = g.createLinearGradient(-0.08, 0, 0.08, 0.44);
    hairFront.addColorStop(0.00, '#fbfeff');
    hairFront.addColorStop(0.28, '#d6e6f4');
    hairFront.addColorStop(0.62, '#a6c4db');
    hairFront.addColorStop(1.00, '#7fa2bd');
    fillCR(g, BANGS, hairFront);
    lineCR(g, BANGS, 'rgba(255,255,255,0.98)', 0.0055, 1);
    fillCR(g, LOCK_L, hairFront);
    fillCR(g, LOCK_R, hairFront);
    lineCR(g, LOCK_L, 'rgba(255,255,255,0.95)', 0.0050, 1);
    lineCR(g, LOCK_R, 'rgba(255,255,255,0.95)', 0.0050, 1);

    /* strand sheen */
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.lineWidth = 0.0038;
    g.beginPath();
    g.moveTo(-0.014, 0.010);
    g.bezierCurveTo(-0.034, 0.052, -0.030, 0.110, -0.024, 0.150);
    g.stroke();
    g.beginPath();
    g.moveTo(0.016, 0.012);
    g.bezierCurveTo(0.036, 0.054, 0.032, 0.112, 0.026, 0.152);
    g.stroke();
    g.strokeStyle = 'rgba(150,186,212,0.55)';
    g.lineWidth = 0.0026;
    g.beginPath();
    g.moveTo(-0.040, 0.020);
    g.bezierCurveTo(-0.060, 0.090, -0.070, 0.200, -0.076, 0.320);
    g.stroke();
    g.beginPath();
    g.moveTo(0.040, 0.020);
    g.bezierCurveTo(0.062, 0.090, 0.074, 0.200, 0.080, 0.310);
    g.stroke();

    /* crown shading + a swept lock that breaks the dome silhouette */
    g.save();
    crPath(g, BANGS, true);
    g.clip();
    var cr8 = g.createLinearGradient(0, -0.02, 0, 0.05);
    cr8.addColorStop(0, 'rgba(150,186,214,0)');
    cr8.addColorStop(1, 'rgba(126,164,196,0.45)');
    g.fillStyle = cr8;
    g.fillRect(-0.08, -0.02, 0.16, 0.07);
    g.restore();
    var swoosh = [
      [-0.062, 0.020], [-0.030, -0.006], [0.010, -0.010], [0.046, 0.008],
      [0.062, 0.036], [0.040, 0.030], [0.006, 0.016], [-0.028, 0.022],
      [-0.052, 0.038]
    ];
    var swFill = g.createLinearGradient(-0.06, 0, 0.06, 0.04);
    swFill.addColorStop(0, 'rgba(255,255,255,0.95)');
    swFill.addColorStop(0.6, 'rgba(214,232,246,0.95)');
    swFill.addColorStop(1, 'rgba(168,198,222,0.95)');
    fillCR(g, swoosh, swFill);
    lineCR(g, swoosh, 'rgba(255,255,255,0.9)', 0.0034, 1);
    /* warmer cheeks */
    blitGlowUnit(g, S.gMag, -0.034, 0.113, 0.048, 0.20);
    blitGlowUnit(g, S.gMag, 0.034, 0.113, 0.048, 0.20);
    /* neck shadow under the jaw */
    g.fillStyle = 'rgba(196,152,150,0.42)';
    g.beginPath();
    g.ellipse(0.000, 0.170, 0.026, 0.010, 0, 0, TAU);
    g.fill();
    /* crown highlight band + strand separation */
    g.save();
    crPath(g, HAIR_BACK, true);
    g.clip();
    var crown = g.createLinearGradient(0, -0.02, 0, 0.10);
    crown.addColorStop(0.00, 'rgba(255,255,255,1)');
    crown.addColorStop(0.45, 'rgba(255,255,255,0.55)');
    crown.addColorStop(1.00, 'rgba(255,255,255,0)');
    g.fillStyle = crown;
    g.fillRect(-0.10, -0.02, 0.20, 0.13);
    var hi, hx;
    for (hi = 0; hi < 6; hi++) {
      hx = -0.062 + hi * 0.025;
      g.strokeStyle = hi % 2 === 0
        ? 'rgba(255,255,255,0.55)' : 'rgba(126,164,196,0.38)';
      g.lineWidth = hi % 2 === 0 ? 0.0032 : 0.0024;
      g.beginPath();
      g.moveTo(hx * 0.55, -0.004);
      g.bezierCurveTo(hx * 0.95, 0.070, hx * 1.05, 0.170, hx * 1.10, 0.290);
      g.stroke();
    }
    g.restore();
    /* hair light crown */
    blitGlowUnit(g, S.gWhite, -0.020, 0.004, 0.13, 0.60);
    blitGlowUnit(g, S.gCyan, -0.074, 0.130, 0.10, 0.26);
  }

  function drawOrb(g, ux, uy, r) {
    blitGlowUnit(g, S.gWhite, ux, uy, r * 7.0, 0.55);
    blitGlowUnit(g, S.gCyan, ux, uy, r * 4.0, 0.60);
    var gr = g.createRadialGradient(ux - r * 0.3, uy - r * 0.3, r * 0.05, ux, uy, r);
    gr.addColorStop(0.00, 'rgba(255,255,255,1)');
    gr.addColorStop(0.55, 'rgba(206,242,255,0.85)');
    gr.addColorStop(1.00, 'rgba(126,214,244,0.30)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(ux, uy, r, 0, TAU);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.98)';
    g.lineWidth = 0.0040;
    g.beginPath();
    g.arc(ux, uy, r, 0, TAU);
    g.stroke();
    /* two thin orbit rings */
    g.strokeStyle = 'rgba(126,216,240,0.75)';
    g.lineWidth = 0.0024;
    g.beginPath();
    g.ellipse(ux, uy, r * 1.55, r * 0.45, -0.35, 0, TAU);
    g.stroke();
    g.beginPath();
    g.ellipse(ux, uy, r * 1.35, r * 0.40, 1.15, 0, TAU);
    g.stroke();
  }

  /* ---------------------------------------------------------- dynamic bits */

  function initActors() {
    hudRings.length = 0;
    hudRings.push({
      x: L.ox + L.unit * 0.01, y: L.oy + L.unit * 0.42,
      r: L.unit * 0.33, spin: 0.10, a: 0.55
    });
    hudRings.push({
      x: L.ox + L.unit * 0.09, y: L.oy + L.unit * 0.70,
      r: L.unit * 0.19, spin: -0.16, a: 0.42
    });

    floats.length = 0;
    var defs = [
      { x: 0.115, y: 0.240, s: 0.075, k: 'cube', sp: 0.20 },
      { x: 0.845, y: 0.290, s: 0.105, k: 'sphere', sp: 0.14 },
      { x: 0.760, y: 0.640, s: 0.130, k: 'ring', sp: -0.18 },
      { x: 0.180, y: 0.700, s: 0.090, k: 'cube', sp: 0.24 },
      { x: 0.560, y: 0.155, s: 0.070, k: 'sphere', sp: 0.20 },
      { x: 0.905, y: 0.520, s: 0.080, k: 'cubeMag', sp: -0.22 },
      { x: 0.300, y: 0.845, s: 0.100, k: 'sphere', sp: 0.16 },
      { x: 0.070, y: 0.470, s: 0.062, k: 'ring', sp: 0.26 },
      { x: 0.660, y: 0.830, s: 0.075, k: 'cube', sp: -0.20 },
      { x: 0.930, y: 0.760, s: 0.088, k: 'sphere', sp: 0.18 },
      { x: 0.245, y: 0.130, s: 0.058, k: 'ring', sp: -0.24 },
      { x: 0.505, y: 0.905, s: 0.070, k: 'sphere', sp: 0.22 }
    ];
    var i, d;
    for (i = 0; i < defs.length; i++) {
      d = defs[i];
      floats.push({
        bx: W * d.x, by: H * d.y, s: d.s * H,
        spr: d.k, rot: rand(0, TAU), spin: d.sp,
        bob: rand(H * 0.006, H * 0.020), ph: rand(0, TAU),
        pace: rand(0.16, 0.40), a: rand(0.50, 0.70)
      });
    }

    streaks.length = 0;
    var n = 14;
    for (i = 0; i < n; i++) {
      streaks.push({
        x: rand(-W * 0.2, W),
        y: H * rand(0.60, 0.965),
        len: rand(W * 0.10, W * 0.30),
        sp: rand(W * 0.05, W * 0.16),
        a: rand(0.22, 0.52)
      });
    }

    glows.length = 0;
    glows.push({ x: W * 0.42, y: H * 0.30, s: H * 0.55, a: 0.30, ph: 0.0, pace: 0.5 });
    glows.push({ x: W * 0.70, y: H * 0.20, s: H * 0.42, a: 0.24, ph: 1.9, pace: 0.7 });
    glows.push({ x: W * 0.20, y: H * 0.62, s: H * 0.40, a: 0.20, ph: 3.4, pace: 0.45 });

    sparks.length = 0;
    for (i = 0; i < 5; i++) {
      sparks.push({
        x: W * rand(0.10, 0.92), y: H * rand(0.12, 0.88),
        s: rand(H * 0.010, H * 0.022), ph: rand(0, TAU), pace: rand(0.6, 1.2)
      });
    }
  }

  /* ------------------------------------------------------------ per frame */

  function drawHudRings(g) {
    var i, o, d;
    for (i = 0; i < hudRings.length; i++) {
      o = hudRings[i];
      d = o.r * 2;
      g.save();
      g.globalAlpha = o.a;
      g.translate(o.x, o.y);
      g.rotate(t * o.spin);
      g.drawImage(S.hud, -d * 0.5, -d * 0.5, d, d);
      g.restore();
    }
    g.globalAlpha = 1;
  }

  function drawFloats(g) {
    var i, o, s;
    for (i = 0; i < floats.length; i++) {
      o = floats[i];
      s = o.s;
      g.save();
      g.globalAlpha = o.a * (0.82 + 0.18 * Math.sin(t * o.pace + o.ph));
      g.translate(o.bx, o.by + Math.sin(t * o.pace * 1.3 + o.ph) * o.bob);
      g.rotate(o.rot + t * o.spin);
      g.drawImage(S[o.spr], -s * 0.5, -s * 0.5, s, s);
      g.restore();
    }
    g.globalAlpha = 1;
  }

  function drawStreaks(g, dt) {
    var i, o, h;
    for (i = 0; i < streaks.length; i++) {
      o = streaks[i];
      o.x += o.sp * dt;
      if (o.x > W + o.len) {
        o.x = -o.len - rand(0, W * 0.4);
        o.y = H * rand(0.60, 0.965);
      }
      h = H * 0.016;
      g.save();
      g.globalAlpha = o.a;
      g.drawImage(S.streak, o.x, o.y - h * 0.5, o.len, h);
      g.restore();
    }
    g.globalAlpha = 1;
  }

  function drawGlows(g) {
    var i, o;
    for (i = 0; i < glows.length; i++) {
      o = glows[i];
      blitGlow(g, S.gWhite, o.x, o.y, o.s,
        o.a * (0.55 + 0.45 * Math.sin(t * o.pace + o.ph)));
    }
    for (i = 0; i < sparks.length; i++) {
      o = sparks[i];
      blitGlow(g, S.gMag, o.x, o.y, o.s * 3.4,
        0.24 + 0.30 * (0.5 + 0.5 * Math.sin(t * o.pace + o.ph)));
    }
  }

  function render(dt) {
    var z = 1 + 0.02 * (0.5 - 0.5 * Math.cos(TAU * t / 30));
    var cx = W * 0.44, cy = H * 0.52;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(z, z);
    ctx.translate(-cx, -cy);

    if (bg) { ctx.drawImage(bg, 0, 0, W, H); }
    drawGlows(ctx);
    drawHudRings(ctx);
    drawStreaks(ctx, dt);
    drawFloats(ctx);

    ctx.restore();

    /* host exit button lives top right: keep that corner calm and dark */
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(S.corner, W - S.corner._cw, 0, S.corner._cw, S.corner._ch);
  }

  function frame(ts) {
    rafId = window.requestAnimationFrame(frame);
    if (!lastTs) { lastTs = ts; return; }
    var dt = (ts - lastTs) / 1000;
    lastTs = ts;
    if (dt > 0.05) { dt = 0.05; }
    t += dt;
    render(dt);
  }

  function start() {
    if (!rafId) {
      lastTs = 0;
      rafId = window.requestAnimationFrame(frame);
    }
  }

  function stop() {
    if (rafId) {
      window.cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }

  /* ---------------------------------------------------------------- boot */

  function measure() {
    W = Math.max(1, window.innerWidth || 1);
    H = Math.max(1, window.innerHeight || 1);
    dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    canvas.width = Math.max(1, round(W * dpr));
    canvas.height = Math.max(1, round(H * dpr));
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
  }

  function build() {
    measure();
    if (!S.hud) { buildSprites(); }
    S.corner = makeCorner();
    buildLayout();
    buildStatic();
    initActors();
  }

  window.addEventListener('resize', function () {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(build, 120);
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { stop(); } else { start(); }
  });

  build();
  start();
}());
