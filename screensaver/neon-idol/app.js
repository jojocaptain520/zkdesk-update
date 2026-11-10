/* Holo Girl - a bright pastel hologram portrait drawn entirely with canvas 2D.
   No external asset, no network, no storage.

   Static layers (sky, grid, bokeh, character, holo rings, corner shade) are
   pre-rendered once per resize; the per-frame loop only blits those layers and
   moves the light ribbons, the loose strands and the floating motes. */
(function () {
  'use strict';

  var canvas = document.getElementById('scene');
  var ctx = canvas && canvas.getContext('2d');
  if (!ctx) { return; }

  var MAX_DPR = 1.5;
  var TAU = Math.PI * 2;
  var DEG = Math.PI / 180;

  /* composition anchors (screen fractions) */
  var HEAD_U = 0.35;                 /* head height = 35% of screen height */
  var FACE_NX = 0.47, FACE_NY = 0.385;
  var HALO_RF = 0.340;
  var TILT_NX = 0.50, TILT_NY = 0.635, TILT_RX = 0.42, TILT_RY = 0.112;

  /* pale palette */
  var SKY0 = '#f8ecff';
  var SKY1 = '#eef2ff';
  var SKY2 = '#dff3ff';
  var HAIR_HI = '#ffffff';
  var HAIR_L = '#f7f1ff';
  var HAIR_M = '#c9b4e8';
  var HAIR_D = '#a487c9';
  var HAIR_DD = '#7f63a8';
  var SKIN_HI = '#fff6f2';
  var SKIN_L = '#ffe9e2';
  var SKIN_M = '#fbd7d0';
  var SKIN_D = '#f0bdb9';
  var TOP_L = '#ffffff';
  var TOP_M = '#f6f1ff';
  var TOP_D = '#e4daf5';
  var INK = '#5a4a74';
  var CYAN_A = '111,214,240';
  var CYAN_B = '126,232,247';
  var VIOLET = '172,140,246';
  var PINKL = '255,170,200';

  var W = 1, H = 1, dpr = 1, U = 1, FX = 1, FY = 1;
  var rafId = 0, last = 0, t = 0, resizeTimer = 0;

  var bgC = null, chC = null;
  var haloC = null, haloSize = 1;
  var halo2C = null, halo2Size = 1;
  var tiltC = null, tiltSize = 256;
  var shadeC = null, shadeW = 0, shadeH = 0;
  var glow = {};

  var paths = {};
  var bangs = [];
  var loose = [];
  var dots = [];
  var bands = [];

  function rand(a, b) { return a + Math.random() * (b - a); }
  function lx(u) { return FX + u * U; }
  function ly(u) { return FY + u * U; }

  function makeCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }

  /* ------------------------------------------------------------------ *
   *  soft glow sprites (pre-rendered once, blitted everywhere)
   * ------------------------------------------------------------------ */

  function makeGlow(rgb, core) {
    var s = 128;
    var c = makeCanvas(s, s);
    var g = c.getContext('2d');
    var rg = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    rg.addColorStop(0, 'rgba(' + rgb + ',' + core + ')');
    rg.addColorStop(0.22, 'rgba(' + rgb + ',' + (core * 0.62) + ')');
    rg.addColorStop(0.55, 'rgba(' + rgb + ',' + (core * 0.20) + ')');
    rg.addColorStop(1, 'rgba(' + rgb + ',0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, s, s);
    return c;
  }

  /* ------------------------------------------------------------------ *
   *  holographic rings
   * ------------------------------------------------------------------ */

  function renderHalo() {
    var R = HALO_RF * H;
    var pad = 1.16;
    haloSize = R * 2 * pad;
    var px = Math.max(96, Math.round(haloSize * dpr));
    haloC = makeCanvas(px, px);
    var g = haloC.getContext('2d');
    var k = px / haloSize;
    g.setTransform(k, 0, 0, k, 0, 0);
    var cx = haloSize / 2, cy = haloSize / 2;

    /* main dashed ring */
    ringTicks(g, cx, cy, R, 96, 0.028, 0.012, '52,196,228', 0.72, 1.6);
    ringTicks(g, cx, cy, R, 96, 0.028, 0.012, '255,255,255', 0.80, 0.55);
    ringTicks(g, cx, cy, R * 1.035, 96, 0.028, 0.006, '120,150,235', 0.40, 0.55);

    /* inner thin orbit + a couple of long arcs */
    g.strokeStyle = 'rgba(52,196,228,0.55)';
    g.lineWidth = Math.max(1, R * 0.006);
    g.beginPath();
    g.arc(cx, cy, R * 0.86, 0, TAU);
    g.stroke();

    g.strokeStyle = 'rgba(150,112,232,0.48)';
    g.lineWidth = Math.max(1, R * 0.009);
    for (var i = 0; i < 3; i++) {
      g.beginPath();
      g.arc(cx, cy, R * (0.93 + i * 0.02), 0.4 + i * 1.9, 1.5 + i * 1.9);
      g.stroke();
    }

    /* little orbiting beads */
    for (var b = 0; b < 6; b++) {
      var a = b / 6 * TAU + 0.6;
      var bx = cx + Math.cos(a) * R * 0.945;
      var by = cy + Math.sin(a) * R * 0.945;
      g.fillStyle = 'rgba(255,255,255,0.85)';
      g.beginPath();
      g.arc(bx, by, Math.max(1.2, R * 0.011), 0, TAU);
      g.fill();
      g.fillStyle = 'rgba(126,232,247,0.45)';
      g.beginPath();
      g.arc(bx, by, Math.max(2, R * 0.026), 0, TAU);
      g.fill();
    }
  }

  function ringTicks(g, cx, cy, R, n, len, w, rgb, a, grow) {
    g.lineCap = 'round';
    for (var i = 0; i < n; i++) {
      var f = i / n;
      if (f > 0.60 && f < 0.70) { continue; }      /* gap so rotation reads */
      var ang = f * TAU;
      var l = len * (i % 8 === 0 ? 2.2 : (i % 4 === 0 ? 1.5 : 1.0));
      var ww = w * (i % 8 === 0 ? 1.8 : 1.0);
      var ca = Math.cos(ang), sa = Math.sin(ang);
      g.strokeStyle = 'rgba(' + rgb + ',' + (a * 0.55) + ')';
      g.lineWidth = ww * grow;
      g.beginPath();
      g.moveTo(cx + ca * (R - l), cy + sa * (R - l));
      g.lineTo(cx + ca * R, cy + sa * R);
      g.stroke();
      g.strokeStyle = 'rgba(' + rgb + ',' + a + ')';
      g.lineWidth = ww;
      g.beginPath();
      g.moveTo(cx + ca * (R - l), cy + sa * (R - l));
      g.lineTo(cx + ca * R, cy + sa * R);
      g.stroke();
    }
  }

  function renderHalo2() {
    var R = HALO_RF * H * 1.20;
    var pad = 1.08;
    halo2Size = R * 2 * pad;
    var px = Math.max(96, Math.round(halo2Size * dpr));
    halo2C = makeCanvas(px, px);
    var g = halo2C.getContext('2d');
    var k = px / halo2Size;
    g.setTransform(k, 0, 0, k, 0, 0);
    var cx = halo2Size / 2, cy = halo2Size / 2;
    /* long thin dashes only */
    g.lineCap = 'butt';
    var n = 18;
    for (var i = 0; i < n; i++) {
      var a0 = i / n * TAU;
      var a1 = a0 + 0.10;
      g.strokeStyle = 'rgba(' + (i % 3 === 0 ? VIOLET : '80,190,230') + ',0.40)';
      g.lineWidth = Math.max(1, R * 0.006);
      g.beginPath();
      g.arc(cx, cy, R, a0, a1);
      g.stroke();
    }
    g.strokeStyle = 'rgba(255,255,255,0.55)';
    g.lineWidth = Math.max(1, R * 0.0035);
    g.beginPath();
    g.arc(cx, cy, R, 0, TAU);
    g.stroke();
  }

  function renderTilt() {
    var s = 512;
    tiltSize = 512;
    tiltC = makeCanvas(s * dpr, s * dpr);
    var g = tiltC.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    var c = s / 2;
    var R = s * 0.46;

    /* wide soft band */
    g.strokeStyle = 'rgba(' + CYAN_B + ',0.18)';
    g.lineWidth = R * 0.13;
    g.beginPath();
    g.arc(c, c, R, 0, TAU);
    g.stroke();
    g.strokeStyle = 'rgba(' + VIOLET + ',0.18)';
    g.lineWidth = R * 0.07;
    g.beginPath();
    g.arc(c, c, R * 0.955, 0, TAU);
    g.stroke();

    /* segmented ring */
    g.lineCap = 'round';
    var n = 72;
    for (var i = 0; i < n; i++) {
      var f = i / n;
      if (f > 0.30 && f < 0.38) { continue; }
      var ang = f * TAU;
      var l = i % 6 === 0 ? 0.10 : 0.045;
      var w = i % 6 === 0 ? 0.012 : 0.006;
      var ca = Math.cos(ang), sa = Math.sin(ang);
      g.strokeStyle = 'rgba(' + (i % 6 === 0 ? VIOLET : '60,198,232') + ',' + (i % 6 === 0 ? 0.62 : 0.50) + ')';
      g.lineWidth = Math.max(1, R * w);
      g.beginPath();
      g.moveTo(c + ca * R * (1 - l), c + sa * R * (1 - l));
      g.lineTo(c + ca * R, c + sa * R);
      g.stroke();
    }
    g.strokeStyle = 'rgba(255,255,255,0.75)';
    g.lineWidth = Math.max(1.2, R * 0.006);
    g.beginPath();
    g.arc(c, c, R * 0.975, 0, TAU);
    g.stroke();
  }

  /* ------------------------------------------------------------------ *
   *  background: lavender to ice blue, soft bokeh, hairline grid
   * ------------------------------------------------------------------ */

  function radial(g, cx, cy, r, rgb, a) {
    var rg = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(1, r));
    rg.addColorStop(0, 'rgba(' + rgb + ',' + a + ')');
    rg.addColorStop(0.45, 'rgba(' + rgb + ',' + (a * 0.52) + ')');
    rg.addColorStop(0.75, 'rgba(' + rgb + ',' + (a * 0.16) + ')');
    rg.addColorStop(1, 'rgba(' + rgb + ',0)');
    g.fillStyle = rg;
    g.fillRect(cx - r, cy - r, r * 2, r * 2);
  }

  function renderBg() {
    bgC = makeCanvas(W * dpr, H * dpr);
    var g = bgC.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    var lg = g.createLinearGradient(W * 0.10, 0, W * 0.86, H);
    lg.addColorStop(0, SKY0);
    lg.addColorStop(0.46, SKY1);
    lg.addColorStop(1, SKY2);
    g.fillStyle = lg;
    g.fillRect(0, 0, W, H);

    /* pastel colour fields */
    radial(g, W * 0.18, H * 0.16, H * 0.85, '255,214,236', 0.52);
    radial(g, W * 0.84, H * 0.14, H * 0.80, '190,236,255', 0.50);
    radial(g, W * 0.50, H * 0.94, H * 0.75, '214,196,252', 0.40);
    radial(g, W * 0.30, H * 0.62, H * 0.60, '255,232,246', 0.30);
    radial(g, W * 0.74, H * 0.58, H * 0.66, '206,244,255', 0.28);
    radial(g, FX, FY + U * 0.10, U * 2.2, '255,255,255', 0.45);

    drawSubjectShadow(g);
    drawGrid(g);
    drawBokeh(g);
    drawStreaks(g);
    drawEdge(g);

    var bgd = g.createLinearGradient(0, H * 0.60, 0, H);
    bgd.addColorStop(0, 'rgba(118,104,176,0)');
    bgd.addColorStop(1, 'rgba(98,82,156,0.40)');
    g.fillStyle = bgd;
    g.fillRect(0, H * 0.60, W, H * 0.40);
  }

  function drawEdge(g) {
    var vg = g.createRadialGradient(FX, FY + H * 0.06, H * 0.34, FX, FY + H * 0.06, Math.max(W, H) * 0.80);
    vg.addColorStop(0, 'rgba(116,104,178,0)');
    vg.addColorStop(0.55, 'rgba(112,98,172,0.22)');
    vg.addColorStop(1, 'rgba(94,80,156,0.52)');
    g.fillStyle = vg;
    g.fillRect(0, 0, W, H);
  }

  function drawSubjectShadow(g) {
    var cx = FX, cy = FY + H * 0.34;
    g.save();
    g.translate(cx, cy);
    g.scale(1, 0.82);
    radial(g, 0, 0, H * 0.52, '104,92,164', 0.26);
    g.restore();
  }

  function drawGrid(g) {
    var step = Math.max(22, Math.min(W, H) * 0.045);
    var gc = makeCanvas(W, H);
    var gg = gc.getContext('2d');
    gg.strokeStyle = 'rgba(104,134,200,0.34)';
    gg.lineWidth = 1;
    var x, y;
    for (x = 0; x <= W + step; x += step) {
      gg.beginPath();
      gg.moveTo(Math.round(x) + 0.5, 0);
      gg.lineTo(Math.round(x) + 0.5, H);
      gg.stroke();
    }
    for (y = 0; y <= H + step; y += step) {
      gg.beginPath();
      gg.moveTo(0, Math.round(y) + 0.5);
      gg.lineTo(W, Math.round(y) + 0.5);
      gg.stroke();
    }
    /* every fourth line a touch stronger */
    gg.strokeStyle = 'rgba(104,134,200,0.26)';
    for (x = 0; x <= W + step; x += step * 4) {
      gg.beginPath();
      gg.moveTo(Math.round(x) + 0.5, 0);
      gg.lineTo(Math.round(x) + 0.5, H);
      gg.stroke();
    }
    /* fade the grid out towards the edges so it never fights the subject */
    gg.globalCompositeOperation = 'destination-out';
    var rg = gg.createRadialGradient(FX, FY + H * 0.10, H * 0.10, FX, FY + H * 0.10, Math.max(W, H) * 0.78);
    rg.addColorStop(0, 'rgba(0,0,0,0)');
    rg.addColorStop(0.55, 'rgba(0,0,0,0.45)');
    rg.addColorStop(1, 'rgba(0,0,0,0.92)');
    gg.fillStyle = rg;
    gg.fillRect(0, 0, W, H);

    g.save();
    g.globalAlpha = 0.55;
    g.drawImage(gc, 0, 0, W, H);
    g.restore();
  }

  function drawBokeh(g) {
    var spots = [
      [0.08, 0.22, 0.055, '255,255,255', 0.55], [0.16, 0.44, 0.030, '255,214,236', 0.50],
      [0.24, 0.12, 0.042, '255,255,255', 0.45], [0.34, 0.24, 0.022, '206,244,255', 0.55],
      [0.62, 0.10, 0.036, '255,255,255', 0.50], [0.70, 0.26, 0.026, '255,214,240', 0.42],
      [0.84, 0.40, 0.050, '206,244,255', 0.45], [0.92, 0.20, 0.030, '255,255,255', 0.42],
      [0.06, 0.68, 0.046, '222,208,252', 0.42], [0.94, 0.66, 0.040, '206,244,255', 0.38],
      [0.76, 0.86, 0.056, '255,255,255', 0.40], [0.20, 0.88, 0.048, '222,208,252', 0.38],
      [0.44, 0.06, 0.020, '255,255,255', 0.55], [0.56, 0.92, 0.030, '255,214,236', 0.40]
    ];
    for (var i = 0; i < spots.length; i++) {
      var s = spots[i];
      radial(g, s[0] * W, s[1] * H, s[2] * H, s[3], s[4]);
    }
  }

  function drawStreaks(g) {
    /* a few very soft diagonal light streaks */
    g.save();
    g.globalCompositeOperation = 'lighter';
    var defs = [
      [0.06, 0.16, 0.52, 0.88, 0.05, 0.055],
      [0.30, 0.02, 0.74, 0.60, 0.03, 0.040],
      [0.58, 0.94, 0.96, 0.36, 0.04, 0.035]
    ];
    for (var i = 0; i < defs.length; i++) {
      var d = defs[i];
      var x0 = d[0] * W, y0 = d[1] * H, x1 = d[2] * W, y1 = d[3] * H;
      var nx = -(y1 - y0), ny = (x1 - x0);
      var len = Math.sqrt(nx * nx + ny * ny);
      if (len < 1) { continue; }
      nx = nx / len * d[4] * H;
      ny = ny / len * d[4] * H;
      var lg = g.createLinearGradient(x0, y0, x1, y1);
      lg.addColorStop(0, 'rgba(255,255,255,0)');
      lg.addColorStop(0.45, 'rgba(255,255,255,' + d[5] + ')');
      lg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = lg;
      g.beginPath();
      g.moveTo(x0 + nx, y0 + ny);
      g.lineTo(x1 + nx * 0.35, y1 + ny * 0.35);
      g.lineTo(x1 - nx * 0.35, y1 - ny * 0.35);
      g.lineTo(x0 - nx, y0 - ny);
      g.closePath();
      g.fill();
    }
    g.restore();
  }

  /* top-right corner: dimmed a little for the host's exit button */
  function renderShade() {
    shadeW = Math.max(340, W * 0.34);
    shadeH = Math.max(130, H * 0.25);
    shadeC = makeCanvas(shadeW * dpr, shadeH * dpr);
    var g = shadeC.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    var vg = g.createLinearGradient(0, 0, 0, shadeH);
    vg.addColorStop(0, 'rgba(72,62,116,0.74)');
    vg.addColorStop(0.55, 'rgba(72,62,116,0.56)');
    vg.addColorStop(1, 'rgba(96,86,140,0)');
    g.fillStyle = vg;
    g.fillRect(0, 0, shadeW, shadeH);

    g.globalCompositeOperation = 'destination-out';
    var hg = g.createLinearGradient(0, 0, shadeW, 0);
    hg.addColorStop(0, 'rgba(0,0,0,1)');
    hg.addColorStop(0.32, 'rgba(0,0,0,0.94)');
    hg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = hg;
    g.fillRect(0, 0, shadeW, shadeH);
  }

  /* ------------------------------------------------------------------ *
   *  character geometry
   * ------------------------------------------------------------------ */

  function strandPath(ax, ay, bx, by, tx, ty, w0, w1) {
    var p = new Path2D();
    p.moveTo(ax - w0, ay);
    p.quadraticCurveTo(bx - w1, by, tx, ty);
    p.quadraticCurveTo(bx + w1, by, ax + w0, ay);
    p.closePath();
    return p;
  }

  function buildPaths() {
    var p;

    /* back hair: silver lavender mass, long and straight past the shoulders */
    p = new Path2D();
    p.moveTo(lx(-0.495), ly(0.12));
    p.bezierCurveTo(lx(-0.610), ly(-0.20), lx(-0.420), ly(-0.610), lx(0.000), ly(-0.705));
    p.bezierCurveTo(lx(0.420), ly(-0.610), lx(0.610), ly(-0.20), lx(0.495), ly(0.12));
    p.bezierCurveTo(lx(0.615), ly(0.55), lx(0.800), ly(1.10), lx(1.120), ly(1.94));
    p.lineTo(lx(-1.120), ly(1.94));
    p.bezierCurveTo(lx(-0.800), ly(1.10), lx(-0.615), ly(0.55), lx(-0.495), ly(0.12));
    p.closePath();
    paths.hair = p;

    /* crown cap: hair over the skull, soft off-centre parted hairline */
    p = new Path2D();
    p.moveTo(lx(-0.480), ly(0.08));
    p.bezierCurveTo(lx(-0.580), ly(-0.20), lx(-0.415), ly(-0.625), lx(0.000), ly(-0.720));
    p.bezierCurveTo(lx(0.425), ly(-0.625), lx(0.590), ly(-0.20), lx(0.490), ly(0.06));
    p.bezierCurveTo(lx(0.492), ly(-0.090), lx(0.455), ly(-0.240), lx(0.360), ly(-0.300));
    p.bezierCurveTo(lx(0.240), ly(-0.250), lx(0.090), ly(-0.215), lx(-0.040), ly(-0.230));
    p.bezierCurveTo(lx(-0.170), ly(-0.245), lx(-0.300), ly(-0.190), lx(-0.390), ly(-0.110));
    p.bezierCurveTo(lx(-0.435), ly(-0.060), lx(-0.470), ly(-0.010), lx(-0.480), ly(0.08));
    p.closePath();
    paths.cap = p;

    /* torso: white future top, shoulders wide, runs off the bottom */
    p = new Path2D();
    p.moveTo(lx(-0.170), ly(0.760));
    p.bezierCurveTo(lx(-0.350), ly(0.800), lx(-0.560), ly(0.868), lx(-0.715), ly(0.952));
    p.bezierCurveTo(lx(-0.775), ly(1.030), lx(-0.815), ly(1.160), lx(-0.830), ly(1.330));
    p.bezierCurveTo(lx(-0.845), ly(1.510), lx(-0.852), ly(1.720), lx(-0.855), ly(2.000));
    p.lineTo(lx(0.855), ly(2.000));
    p.bezierCurveTo(lx(0.852), ly(1.720), lx(0.845), ly(1.510), lx(0.830), ly(1.330));
    p.bezierCurveTo(lx(0.815), ly(1.160), lx(0.775), ly(1.030), lx(0.715), ly(0.952));
    p.bezierCurveTo(lx(0.560), ly(0.868), lx(0.350), ly(0.800), lx(0.170), ly(0.760));
    p.closePath();
    paths.torso = p;

    /* arms hanging at the sides: bare skin, so the bust silhouette reads */
    p = new Path2D();
    p.moveTo(lx(-0.715), ly(0.952));
    p.bezierCurveTo(lx(-0.850), ly(0.966), lx(-0.965), ly(1.020), lx(-1.010), ly(1.120));
    p.bezierCurveTo(lx(-1.055), ly(1.220), lx(-1.075), ly(1.520), lx(-1.080), ly(2.000));
    p.lineTo(lx(-0.855), ly(2.000));
    p.bezierCurveTo(lx(-0.852), ly(1.720), lx(-0.845), ly(1.510), lx(-0.830), ly(1.330));
    p.bezierCurveTo(lx(-0.815), ly(1.160), lx(-0.775), ly(1.030), lx(-0.715), ly(0.952));
    p.closePath();
    paths.armL = p;

    p = new Path2D();
    p.moveTo(lx(0.715), ly(0.952));
    p.bezierCurveTo(lx(0.850), ly(0.966), lx(0.965), ly(1.020), lx(1.010), ly(1.120));
    p.bezierCurveTo(lx(1.055), ly(1.220), lx(1.075), ly(1.520), lx(1.080), ly(2.000));
    p.lineTo(lx(0.855), ly(2.000));
    p.bezierCurveTo(lx(0.852), ly(1.720), lx(0.845), ly(1.510), lx(0.830), ly(1.330));
    p.bezierCurveTo(lx(0.815), ly(1.160), lx(0.775), ly(1.030), lx(0.715), ly(0.952));
    p.closePath();
    paths.armR = p;

    /* neck */
    p = new Path2D();
    p.moveTo(lx(-0.128), ly(0.24));
    p.bezierCurveTo(lx(-0.134), ly(0.44), lx(-0.146), ly(0.62), lx(-0.152), ly(0.790));
    p.lineTo(lx(0.152), ly(0.790));
    p.bezierCurveTo(lx(0.146), ly(0.62), lx(0.134), ly(0.44), lx(0.128), ly(0.24));
    p.closePath();
    paths.neck = p;

    /* high futuristic collar wrapped round the neck */
    p = new Path2D();
    p.moveTo(lx(-0.180), ly(0.790));
    p.quadraticCurveTo(lx(-0.178), ly(0.690), lx(-0.126), ly(0.648));
    p.quadraticCurveTo(lx(0.000), ly(0.612), lx(0.126), ly(0.648));
    p.quadraticCurveTo(lx(0.178), ly(0.690), lx(0.180), ly(0.790));
    p.quadraticCurveTo(lx(0.000), ly(0.834), lx(-0.180), ly(0.790));
    p.closePath();
    paths.collar = p;

    /* face: front view, soft jaw */
    p = new Path2D();
    p.moveTo(lx(-0.345), ly(0.020));
    p.bezierCurveTo(lx(-0.356), ly(-0.192), lx(-0.275), ly(-0.448), lx(-0.058), ly(-0.508));
    p.bezierCurveTo(lx(0.112), ly(-0.548), lx(0.286), ly(-0.444), lx(0.346), ly(-0.226));
    p.bezierCurveTo(lx(0.380), ly(-0.058), lx(0.374), ly(0.140), lx(0.300), ly(0.276));
    p.bezierCurveTo(lx(0.216), ly(0.406), lx(0.100), ly(0.478), lx(0.000), ly(0.480));
    p.bezierCurveTo(lx(-0.100), ly(0.478), lx(-0.216), ly(0.406), lx(-0.300), ly(0.276));
    p.bezierCurveTo(lx(-0.374), ly(0.140), lx(-0.380), ly(-0.058), lx(-0.345), ly(0.020));
    p.closePath();
    paths.face = p;

    /* fringe locks, both sides sweeping out from a soft part */
    bangs.length = 0;
    addBang(0.070, -0.290, -0.130, -0.190, -0.300, 0.030, 0.110, 0.030);
    addBang(0.060, -0.360, -0.120, -0.260, -0.215, -0.070, 0.104, 0.028);
    addBang(0.080, -0.420, 0.230, -0.250, 0.335, 0.018, 0.100, 0.028);
    addBang(0.070, -0.480, 0.190, -0.300, 0.245, -0.090, 0.096, 0.026);
    addBang(-0.090, -0.500, -0.250, -0.310, -0.400, -0.055, 0.090, 0.024);
    addBang(0.210, -0.470, 0.330, -0.290, 0.430, -0.040, 0.088, 0.024);

    /* side locks in front of the shoulders */
    bangs.push({
      p: strandPath(lx(-0.455), ly(-0.170), lx(-0.565), ly(0.360), lx(-0.525), ly(0.900),
        U * 0.140, U * 0.075),
      baseY: ly(-0.17), tipY: ly(1.02), side: 1, dir: -1
    });
    bangs.push({
      p: strandPath(lx(0.470), ly(-0.160), lx(0.580), ly(0.370), lx(0.540), ly(0.930),
        U * 0.135, U * 0.072),
      baseY: ly(-0.16), tipY: ly(1.06), side: 1, dir: 1
    });

    /* rim light contours */
    p = new Path2D();
    p.moveTo(lx(0.000), ly(-0.715));
    p.bezierCurveTo(lx(-0.420), ly(-0.610), lx(-0.610), ly(-0.200), lx(-0.495), ly(0.120));
    p.bezierCurveTo(lx(-0.615), ly(0.550), lx(-0.800), ly(1.100), lx(-1.120), ly(1.940));
    paths.rimL = p;

    p = new Path2D();
    p.moveTo(lx(0.000), ly(-0.715));
    p.bezierCurveTo(lx(0.420), ly(-0.610), lx(0.610), ly(-0.200), lx(0.495), ly(0.120));
    p.bezierCurveTo(lx(0.615), ly(0.550), lx(0.800), ly(1.100), lx(1.120), ly(1.940));
    paths.rimR = p;

    p = new Path2D();
    p.moveTo(lx(-0.715), ly(0.952));
    p.bezierCurveTo(lx(-0.850), ly(0.968), lx(-0.965), ly(1.022), lx(-1.010), ly(1.122));
    p.bezierCurveTo(lx(-1.055), ly(1.222), lx(-1.075), ly(1.520), lx(-1.078), ly(1.960));
    paths.rimBodyL = p;

    p = new Path2D();
    p.moveTo(lx(0.715), ly(0.952));
    p.bezierCurveTo(lx(0.850), ly(0.968), lx(0.965), ly(1.022), lx(1.010), ly(1.122));
    p.bezierCurveTo(lx(1.055), ly(1.222), lx(1.075), ly(1.520), lx(1.078), ly(1.960));
    paths.rimBodyR = p;

    /* hair ornament */
    paths.clip = new Path2D();
    paths.clip.moveTo(lx(0.318), ly(-0.238));
    paths.clip.lineTo(lx(0.352), ly(-0.196));
    paths.clip.lineTo(lx(0.318), ly(-0.154));
    paths.clip.lineTo(lx(0.284), ly(-0.196));
    paths.clip.closePath();
  }

  function addBang(x0, y0, cx, cy, x1, y1, w0, w1) {
    bangs.push({
      p: strandPath(lx(x0), ly(y0), lx(cx), ly(cy), lx(x1), ly(y1), U * w0, U * w1),
      baseY: ly(y0), tipY: ly(y1), side: 0
    });
  }

  /* ------------------------------------------------------------------ *
   *  character rendering (once per resize)
   * ------------------------------------------------------------------ */

  function renderChar() {
    chC = makeCanvas(W * dpr, H * dpr);
    var g = chC.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.lineJoin = 'round';
    g.lineCap = 'round';

    drawBackHair(g);
    drawBody(g);
    drawNeckChest(g);
    drawFaceBase(g);
    drawFeatures(g);
    drawCap(g);
    drawFrontLocks(g);
    drawRim(g);
    drawCollar(g);
  }

  function drawBackHair(g) {
    var hg = g.createLinearGradient(lx(-0.5), ly(-0.72), lx(0.3), ly(1.9));
    hg.addColorStop(0, '#f2e9fd');
    hg.addColorStop(0.18, '#d6c1f0');
    hg.addColorStop(0.40, '#bba0e0');
    hg.addColorStop(0.66, '#9a7cc4');
    hg.addColorStop(1, '#785fa0');
    g.fillStyle = hg;
    g.fill(paths.hair);

    g.save();
    g.clip(paths.hair);
    /* long strand shading */
    for (var i = 0; i < 17; i++) {
      var b = -1.02 + i * 0.128;
      g.beginPath();
      g.moveTo(lx(b * 0.48), ly(-0.36));
      g.bezierCurveTo(lx(b * 0.80), ly(0.30), lx(b * 1.02), ly(1.05), lx(b * 1.14), ly(1.95));
      g.strokeStyle = (i % 3 === 0) ? 'rgba(255,255,255,0.72)' : 'rgba(112,84,160,0.40)';
      g.lineWidth = U * (i % 3 === 0 ? 0.020 : 0.014);
      g.stroke();
    }
    /* glossy band across the crown */
    var sh = g.createRadialGradient(lx(-0.02), ly(-0.28), U * 0.04, lx(-0.02), ly(-0.28), U * 0.60);
    sh.addColorStop(0, 'rgba(255,255,255,0.85)');
    sh.addColorStop(0.55, 'rgba(255,255,255,0.28)');
    sh.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = sh;
    g.fillRect(lx(-0.62), ly(-0.74), U * 1.24, U * 0.86);
    /* cool shadow where the hair falls behind the shoulders */
    var dg = g.createLinearGradient(0, ly(0.90), 0, ly(1.95));
    dg.addColorStop(0, 'rgba(150,126,198,0)');
    dg.addColorStop(1, 'rgba(96,72,142,0.55)');
    g.fillStyle = dg;
    g.fillRect(lx(-1.2), ly(0.90), U * 2.4, U * 1.10);
    g.restore();
  }

  function drawBody(g) {
    /* ---- bare arms hanging at the sides ---- */
    drawArm(g, paths.armL, -1);
    drawArm(g, paths.armR, 1);

    /* ---- sleeveless top ---- */
    var bg = g.createLinearGradient(0, ly(0.74), 0, ly(2.0));
    bg.addColorStop(0, '#fbffff');
    bg.addColorStop(0.20, '#eef8ff');
    bg.addColorStop(0.48, '#d8e9fa');
    bg.addColorStop(0.74, '#bccfec');
    bg.addColorStop(1, '#a0b5d8');
    g.fillStyle = bg;
    g.fill(paths.torso);

    g.save();
    g.clip(paths.torso);

    /* light from the upper right across the garment */
    var cl = g.createLinearGradient(lx(-0.90), ly(1.40), lx(0.55), ly(0.86));
    cl.addColorStop(0, 'rgba(92,116,166,0.34)');
    cl.addColorStop(0.45, 'rgba(118,138,188,0.10)');
    cl.addColorStop(1, 'rgba(255,255,255,0.55)');
    g.fillStyle = cl;
    g.fillRect(lx(-1.0), ly(0.74), U * 2.0, U * 1.30);

    /* armhole shadows */
    var al = g.createLinearGradient(lx(-0.86), 0, lx(-0.55), 0);
    al.addColorStop(0, 'rgba(78,96,146,0.50)');
    al.addColorStop(1, 'rgba(78,96,146,0)');
    g.fillStyle = al;
    g.fillRect(lx(-0.88), ly(0.94), U * 0.36, U * 1.10);
    var ar = g.createLinearGradient(lx(0.86), 0, lx(0.55), 0);
    ar.addColorStop(0, 'rgba(78,96,146,0.44)');
    ar.addColorStop(1, 'rgba(78,96,146,0)');
    g.fillStyle = ar;
    g.fillRect(lx(0.52), ly(0.94), U * 0.36, U * 1.10);

    /* shadow under the collar */
    var yg = g.createLinearGradient(0, ly(0.78), 0, ly(1.16));
    yg.addColorStop(0, 'rgba(88,108,158,0.50)');
    yg.addColorStop(1, 'rgba(88,108,158,0)');
    g.fillStyle = yg;
    g.fillRect(lx(-0.9), ly(0.78), U * 1.8, U * 0.40);

    /* key light upper right */
    var kl = g.createRadialGradient(lx(0.20), ly(1.02), U * 0.05, lx(0.20), ly(1.02), U * 0.40);
    kl.addColorStop(0, 'rgba(255,255,255,0.55)');
    kl.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = kl;
    g.fillRect(lx(-0.24), ly(0.82), U * 0.94, U * 0.52);

    /* soft bust shading */
    var ub = g.createLinearGradient(0, ly(1.18), 0, ly(1.66));
    ub.addColorStop(0, 'rgba(96,116,164,0)');
    ub.addColorStop(0.45, 'rgba(92,110,158,0.32)');
    ub.addColorStop(1, 'rgba(84,102,150,0.10)');
    g.fillStyle = ub;
    g.fillRect(lx(-1.1), ly(1.18), U * 2.2, U * 0.50);

    /* shoulder seams: neck to shoulder tip */
    g.strokeStyle = 'rgba(96,124,176,0.60)';
    g.lineWidth = Math.max(1, U * 0.008);
    g.beginPath();
    g.moveTo(lx(-0.175), ly(0.775));
    g.bezierCurveTo(lx(-0.360), ly(0.818), lx(-0.575), ly(0.888), lx(-0.715), ly(0.972));
    g.stroke();
    g.beginPath();
    g.moveTo(lx(0.175), ly(0.775));
    g.bezierCurveTo(lx(0.360), ly(0.818), lx(0.575), ly(0.888), lx(0.715), ly(0.972));
    g.stroke();

    /* armhole trim: pale cyan line where the top meets the arm */
    g.strokeStyle = 'rgba(62,190,230,0.65)';
    g.lineWidth = Math.max(1, U * 0.007);
    g.beginPath();
    g.moveTo(lx(-0.715), ly(0.952));
    g.bezierCurveTo(lx(-0.775), ly(1.030), lx(-0.815), ly(1.160), lx(-0.830), ly(1.330));
    g.stroke();
    g.beginPath();
    g.moveTo(lx(0.715), ly(0.952));
    g.bezierCurveTo(lx(0.775), ly(1.030), lx(0.815), ly(1.160), lx(0.830), ly(1.330));
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.lineWidth = Math.max(1, U * 0.003);
    g.beginPath();
    g.moveTo(lx(-0.715), ly(0.952));
    g.bezierCurveTo(lx(-0.775), ly(1.030), lx(-0.815), ly(1.160), lx(-0.830), ly(1.330));
    g.stroke();
    g.beginPath();
    g.moveTo(lx(0.715), ly(0.952));
    g.bezierCurveTo(lx(0.775), ly(1.030), lx(0.815), ly(1.160), lx(0.830), ly(1.330));
    g.stroke();

    /* centre seam + chest line */
    g.strokeStyle = 'rgba(96,124,176,0.30)';
    g.lineWidth = Math.max(1, U * 0.005);
    g.beginPath();
    g.moveTo(lx(0.0), ly(1.16));
    g.lineTo(lx(0.0), ly(2.0));
    g.stroke();
    g.strokeStyle = 'rgba(62,190,230,0.40)';
    g.lineWidth = Math.max(1, U * 0.004);
    g.beginPath();
    g.moveTo(lx(0.0), ly(1.16));
    g.lineTo(lx(0.0), ly(1.52));
    g.stroke();
    g.restore();

    /* glowing chest emblem */
    g.save();
    g.strokeStyle = 'rgba(58,190,228,0.72)';
    g.lineWidth = Math.max(1, U * 0.007);
    g.beginPath();
    g.ellipse(lx(0), ly(1.10), U * 0.052, U * 0.020, 0, 0, TAU);
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.95)';
    g.lineWidth = Math.max(1, U * 0.0032);
    g.stroke();
    g.restore();
  }

  function drawArm(g, path, dir) {
    var ag = g.createLinearGradient(lx(dir * 0.72), 0, lx(dir * 1.08), 0);
    if (dir < 0) {
      ag.addColorStop(0, '#f2c6c0');
      ag.addColorStop(0.45, '#f8d8d2');
      ag.addColorStop(1, '#ffe8e2');
    } else {
      ag.addColorStop(0, '#ffe9e3');
      ag.addColorStop(0.55, '#ffded7');
      ag.addColorStop(1, '#f4c8c2');
    }
    g.fillStyle = ag;
    g.fill(path);

    g.save();
    g.clip(path);
    /* the arm rounds away from the body */
    var sh = g.createLinearGradient(lx(dir * 0.74), 0, lx(dir * 1.06), 0);
    sh.addColorStop(0, 'rgba(196,138,148,0.42)');
    sh.addColorStop(0.35, 'rgba(196,138,148,0.10)');
    sh.addColorStop(1, 'rgba(226,168,168,0)');
    g.fillStyle = sh;
    g.fillRect(lx(dir * 0.7 - 0.1), ly(0.9), U * 0.5, U * 1.1);
    /* soft highlight along the outer edge */
    var hi = g.createLinearGradient(lx(dir * 1.06), 0, lx(dir * 0.94), 0);
    hi.addColorStop(0, 'rgba(255,255,255,0.55)');
    hi.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = hi;
    g.fillRect(lx(dir * 1.05 - 0.05), ly(0.92), U * 0.14, U * 1.08);
    g.restore();

    /* thin outline so the arm reads against the sky */
    g.strokeStyle = 'rgba(198,158,190,0.55)';
    g.lineWidth = Math.max(1, U * 0.005);
    g.stroke(path);
  }

  function drawNeckChest(g) {
    var ng = g.createLinearGradient(lx(-0.16), 0, lx(0.16), 0);
    ng.addColorStop(0, SKIN_D);
    ng.addColorStop(0.42, SKIN_L);
    ng.addColorStop(1, SKIN_M);
    g.fillStyle = ng;
    g.fill(paths.neck);

    g.save();
    g.clip(paths.neck);
    /* shadow cast by the jaw */
    var jg = g.createLinearGradient(0, ly(0.28), 0, ly(0.60));
    jg.addColorStop(0, 'rgba(188,132,148,0.72)');
    jg.addColorStop(1, 'rgba(188,132,148,0)');
    g.fillStyle = jg;
    g.fillRect(lx(-0.20), ly(0.28), U * 0.40, U * 0.34);
    g.restore();
  }

  function drawFaceBase(g) {
    var fg = g.createLinearGradient(0, ly(-0.52), 0, ly(0.50));
    fg.addColorStop(0, '#fff4ef');
    fg.addColorStop(0.30, '#ffebe4');
    fg.addColorStop(0.66, '#fcdcd5');
    fg.addColorStop(1, '#f4c9c4');
    g.fillStyle = fg;
    g.fill(paths.face);

    g.save();
    g.clip(paths.face);

    /* temple shading keeps the face from looking flat */
    var sg = g.createLinearGradient(lx(-0.36), 0, lx(-0.08), 0);
    sg.addColorStop(0, 'rgba(224,160,168,0.40)');
    sg.addColorStop(0.6, 'rgba(224,160,168,0.10)');
    sg.addColorStop(1, 'rgba(224,160,168,0)');
    g.fillStyle = sg;
    g.fillRect(lx(-0.36), ly(-0.54), U * 0.30, U * 1.06);

    var sg2 = g.createLinearGradient(lx(0.36), 0, lx(0.08), 0);
    sg2.addColorStop(0, 'rgba(224,160,168,0.36)');
    sg2.addColorStop(0.6, 'rgba(224,160,168,0.09)');
    sg2.addColorStop(1, 'rgba(224,160,168,0)');
    g.fillStyle = sg2;
    g.fillRect(lx(0.06), ly(-0.54), U * 0.30, U * 1.06);

    /* shadow under the fringe */
    var bh = g.createLinearGradient(0, ly(-0.54), 0, ly(-0.10));
    bh.addColorStop(0, 'rgba(206,150,168,0.40)');
    bh.addColorStop(0.7, 'rgba(206,150,168,0.10)');
    bh.addColorStop(1, 'rgba(206,150,168,0)');
    g.fillStyle = bh;
    g.fillRect(lx(-0.36), ly(-0.54), U * 0.72, U * 0.46);

    /* forehead / cheeks / chin light */
    radial(g, lx(0.000), ly(-0.150), U * 0.20, '255,255,255', 0.55);
    radial(g, lx(0.190), ly(0.140), U * 0.14, '255,255,255', 0.45);
    radial(g, lx(-0.190), ly(0.140), U * 0.14, '255,255,255', 0.40);
    radial(g, lx(0.000), ly(0.420), U * 0.10, '255,255,255', 0.45);

    /* blush */
    radial(g, lx(-0.238), ly(0.238), U * 0.115, '255,150,180', 0.46);
    radial(g, lx(0.238), ly(0.238), U * 0.115, '255,150,180', 0.46);

    /* gentle shading along the jaw */
    var jg = g.createLinearGradient(0, ly(0.24), 0, ly(0.48));
    jg.addColorStop(0, 'rgba(228,168,172,0)');
    jg.addColorStop(1, 'rgba(228,168,172,0.34)');
    g.fillStyle = jg;
    g.fillRect(lx(-0.32), ly(0.24), U * 0.64, U * 0.26);
    g.restore();
  }

  function drawFeatures(g) {
    /* brows: soft lavender taupe */
    g.strokeStyle = 'rgba(158,126,196,0.95)';
    g.lineWidth = U * 0.012;
    g.beginPath();
    g.moveTo(lx(-0.252), ly(-0.104));
    g.quadraticCurveTo(lx(-0.152), ly(-0.162), lx(-0.056), ly(-0.108));
    g.stroke();
    g.beginPath();
    g.moveTo(lx(0.056), ly(-0.108));
    g.quadraticCurveTo(lx(0.152), ly(-0.162), lx(0.252), ly(-0.104));
    g.stroke();

    drawEye(g, lx(-0.152), ly(0.076), U * 0.098, U * 0.062, -1);
    drawEye(g, lx(0.152), ly(0.076), U * 0.098, U * 0.062, 1);

    /* nose: tiny soft shadow + a highlight */
    g.strokeStyle = 'rgba(226,158,158,0.55)';
    g.lineWidth = U * 0.006;
    g.beginPath();
    g.moveTo(lx(0.028), ly(0.182));
    g.quadraticCurveTo(lx(0.044), ly(0.204), lx(0.014), ly(0.208));
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.92)';
    g.beginPath();
    g.arc(lx(-0.004), ly(0.176), Math.max(1.2, U * 0.008), 0, TAU);
    g.fill();

    /* mouth: soft smile line, pink lower lip */
    g.strokeStyle = 'rgba(232,120,150,0.95)';
    g.lineWidth = U * 0.0075;
    g.beginPath();
    g.moveTo(lx(-0.062), ly(0.312));
    g.quadraticCurveTo(lx(0.000), ly(0.352), lx(0.062), ly(0.312));
    g.stroke();

    g.fillStyle = 'rgba(255,168,190,0.55)';
    g.beginPath();
    g.moveTo(lx(-0.052), ly(0.322));
    g.quadraticCurveTo(lx(0.000), ly(0.368), lx(0.052), ly(0.322));
    g.quadraticCurveTo(lx(0.000), ly(0.344), lx(-0.052), ly(0.322));
    g.closePath();
    g.fill();

    g.strokeStyle = 'rgba(255,255,255,0.75)';
    g.lineWidth = U * 0.005;
    g.beginPath();
    g.moveTo(lx(-0.032), ly(0.340));
    g.quadraticCurveTo(lx(0.000), ly(0.358), lx(0.030), ly(0.340));
    g.stroke();

    /* tiny shadow under the lower lip */
    g.strokeStyle = 'rgba(224,160,164,0.40)';
    g.lineWidth = U * 0.005;
    g.beginPath();
    g.moveTo(lx(-0.038), ly(0.380));
    g.quadraticCurveTo(lx(0.000), ly(0.394), lx(0.038), ly(0.380));
    g.stroke();
  }

  function drawEye(g, cx, cy, hw, hh, out) {
    /* eye opening */
    var p = new Path2D();
    p.moveTo(cx - hw, cy + hh * 0.10);
    p.bezierCurveTo(cx - hw * 0.97, cy - hh * 0.60, cx - hw * 0.42, cy - hh * 1.06,
      cx + hw * 0.05, cy - hh * 1.04);
    p.bezierCurveTo(cx + hw * 0.58, cy - hh * 1.02, cx + hw * 0.92, cy - hh * 0.62,
      cx + hw * 1.02, cy - hh * 0.04);
    p.bezierCurveTo(cx + hw * 0.96, cy + hh * 0.64, cx + hw * 0.48, cy + hh * 1.00,
      cx - hw * 0.10, cy + hh * 0.96);
    p.bezierCurveTo(cx - hw * 0.62, cy + hh * 0.92, cx - hw * 0.94, cy + hh * 0.54,
      cx - hw, cy + hh * 0.10);
    p.closePath();

    var sg = g.createLinearGradient(0, cy - hh, 0, cy + hh);
    sg.addColorStop(0, '#f0e6f6');
    sg.addColorStop(0.30, '#fdf8ff');
    sg.addColorStop(0.75, '#ffffff');
    sg.addColorStop(1, '#f6ecf8');
    g.fillStyle = sg;
    g.fill(p);

    g.save();
    g.clip(p);

    /* iris: cyan at the bottom, violet at the top */
    var ir = hw * 0.90;
    var ix = cx + hw * 0.01, iy = cy + hh * 0.10;
    var ig = g.createRadialGradient(ix, iy + ir * 0.50, ir * 0.06, ix, iy, ir * 1.02);
    ig.addColorStop(0, 'rgba(226,255,255,1)');
    ig.addColorStop(0.20, 'rgba(150,244,255,1)');
    ig.addColorStop(0.42, 'rgba(96,214,244,1)');
    ig.addColorStop(0.62, 'rgba(122,168,244,1)');
    ig.addColorStop(0.80, 'rgba(160,124,238,1)');
    ig.addColorStop(1, 'rgba(196,166,252,1)');
    g.fillStyle = ig;
    g.beginPath();
    g.arc(ix, iy, ir, 0, TAU);
    g.fill();

    /* iris rim */
    g.strokeStyle = 'rgba(96,74,150,0.55)';
    g.lineWidth = U * 0.007;
    g.beginPath();
    g.arc(ix, iy, ir * 0.99, 0, TAU);
    g.stroke();

    /* pupil */
    g.fillStyle = 'rgba(48,36,86,0.92)';
    g.beginPath();
    g.ellipse(ix, iy + ir * 0.10, ir * 0.34, ir * 0.50, 0, 0, TAU);
    g.fill();

    /* bright bottom glow inside the iris */
    var cgl = g.createRadialGradient(ix, iy + ir * 0.66, 0, ix, iy + ir * 0.66, ir * 0.66);
    cgl.addColorStop(0, 'rgba(255,255,255,0.75)');
    cgl.addColorStop(1, 'rgba(190,250,255,0)');
    g.fillStyle = cgl;
    g.fillRect(ix - ir, iy - ir, ir * 2, ir * 2);

    /* lid shadow */
    var ls = g.createLinearGradient(0, cy - hh * 1.16, 0, cy + hh * 0.26);
    ls.addColorStop(0, 'rgba(120,96,152,0.52)');
    ls.addColorStop(0.55, 'rgba(120,96,152,0.16)');
    ls.addColorStop(1, 'rgba(120,96,152,0)');
    g.fillStyle = ls;
    g.fillRect(cx - hw * 1.3, cy - hh * 1.4, hw * 2.6, hh * 1.7);

    /* highlights */
    g.fillStyle = 'rgba(255,255,255,0.98)';
    g.beginPath();
    g.arc(ix - ir * 0.34, iy - ir * 0.42, ir * 0.30, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.beginPath();
    g.arc(ix + ir * 0.36, iy + ir * 0.40, ir * 0.14, 0, TAU);
    g.fill();
    g.restore();

    /* upper lash: soft deep plum, thicker outside */
    var outerX = cx + out * hw * 1.03;
    g.strokeStyle = 'rgba(74,56,104,0.98)';
    g.lineWidth = U * 0.021;
    g.beginPath();
    g.moveTo(cx - out * hw * 0.95, cy - hh * 0.24);
    g.bezierCurveTo(cx - out * hw * 0.30, cy - hh * 1.12,
      cx + out * hw * 0.60, cy - hh * 1.08, outerX, cy - hh * 0.06);
    g.stroke();

    /* lash flick */
    g.strokeStyle = 'rgba(74,56,104,0.94)';
    g.lineWidth = U * 0.012;
    g.beginPath();
    g.moveTo(outerX, cy - hh * 0.06);
    g.quadraticCurveTo(cx + out * hw * 1.22, cy - hh * 0.20,
      cx + out * hw * 1.30, cy - hh * 0.52);
    g.stroke();

    /* lower lid line + tiny lower lashes */
    g.strokeStyle = 'rgba(178,132,178,0.55)';
    g.lineWidth = U * 0.006;
    g.beginPath();
    g.moveTo(cx - out * hw * 0.30, cy + hh * 0.90);
    g.quadraticCurveTo(cx + out * hw * 0.52, cy + hh * 0.96, cx + out * hw * 0.94, cy + hh * 0.44);
    g.stroke();

    g.strokeStyle = 'rgba(146,110,160,0.55)';
    g.lineWidth = U * 0.006;
    g.beginPath();
    g.moveTo(cx + out * hw * 0.88, cy + hh * 0.62);
    g.lineTo(cx + out * hw * 1.04, cy + hh * 0.86);
    g.stroke();
    g.beginPath();
    g.moveTo(cx + out * hw * 0.62, cy + hh * 0.88);
    g.lineTo(cx + out * hw * 0.72, cy + hh * 1.06);
    g.stroke();

    /* lid crease */
    g.strokeStyle = 'rgba(198,158,196,0.42)';
    g.lineWidth = U * 0.005;
    g.beginPath();
    g.moveTo(cx - out * hw * 0.70, cy - hh * 1.30);
    g.quadraticCurveTo(cx + out * hw * 0.10, cy - hh * 1.60, cx + out * hw * 0.92, cy - hh * 1.06);
    g.stroke();
  }

  function drawCap(g) {
    /* fringe locks first, crown over them hides the roots */
    for (var k = 0; k < bangs.length; k++) {
      if (bangs[k].side) { continue; }
      var b0 = bangs[k].baseY - U * 0.08;
      var b1 = bangs[k].tipY + U * 0.10;
      var bg = g.createLinearGradient(0, b0, 0, b1);
      bg.addColorStop(0.00, '#ded0f4');
      bg.addColorStop(0.26, '#c4abE6');
      bg.addColorStop(0.58, '#a98cce');
      bg.addColorStop(1.00, '#8a6cb4');
      g.fillStyle = bg;
      g.fill(bangs[k].p);
    }

    var hg = g.createLinearGradient(lx(-0.40), ly(-0.72), lx(0.30), ly(0.08));
    hg.addColorStop(0, '#f6efff');
    hg.addColorStop(0.30, '#e2d3f6');
    hg.addColorStop(0.66, '#c6b0e6');
    hg.addColorStop(1, '#a88bd0');
    g.fillStyle = hg;
    g.fill(paths.cap);

    g.save();
    g.clip(paths.cap);
    /* highlight strands */
    for (var i = 0; i < 11; i++) {
      var b = -0.44 + i * 0.088;
      g.beginPath();
      g.moveTo(lx(b * 0.55), ly(-0.72));
      g.quadraticCurveTo(lx(b * 1.05), ly(-0.36), lx(b * 1.12), ly(0.02));
      g.strokeStyle = (i % 2 === 0) ? 'rgba(255,255,255,0.78)' : 'rgba(150,122,196,0.34)';
      g.lineWidth = U * (i % 2 === 0 ? 0.016 : 0.010);
      g.stroke();
    }
    /* glossy sheen */
    var sh = g.createRadialGradient(lx(-0.06), ly(-0.40), U * 0.05, lx(-0.06), ly(-0.40), U * 0.52);
    sh.addColorStop(0, 'rgba(255,255,255,0.92)');
    sh.addColorStop(0.5, 'rgba(255,255,255,0.30)');
    sh.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = sh;
    g.fillRect(lx(-0.52), ly(-0.76), U * 1.04, U * 0.70);
    g.restore();

    /* a few fine flyaway strands over the crown */
    g.strokeStyle = 'rgba(255,255,255,0.60)';
    g.lineWidth = Math.max(1, U * 0.004);
    g.beginPath();
    g.moveTo(lx(-0.10), ly(-0.70));
    g.quadraticCurveTo(lx(-0.30), ly(-0.44), lx(-0.44), ly(-0.06));
    g.stroke();
    g.beginPath();
    g.moveTo(lx(0.10), ly(-0.71));
    g.quadraticCurveTo(lx(0.32), ly(-0.44), lx(0.46), ly(-0.04));
    g.stroke();
  }

  function drawFrontLocks(g) {
    for (var k = 0; k < bangs.length; k++) {
      if (!bangs[k].side) { continue; }
      var b = bangs[k];
      var pg = g.createLinearGradient(0, b.baseY - U * 0.02, 0, b.tipY);
      pg.addColorStop(0.00, 'rgba(214,193,244,0)');
      pg.addColorStop(0.16, 'rgba(200,174,234,0.95)');
      pg.addColorStop(0.52, 'rgba(162,130,208,1)');
      pg.addColorStop(0.82, 'rgba(122,96,164,1)');
      pg.addColorStop(1.00, 'rgba(96,74,132,1)');
      g.fillStyle = pg;
      g.fill(b.p);

      g.save();
      g.clip(b.p);
      var d = b.dir || 1;
      g.strokeStyle = 'rgba(255,255,255,0.55)';
      g.lineWidth = U * 0.012;
      g.beginPath();
      g.moveTo(lx(d * 0.455), ly(-0.14));
      g.quadraticCurveTo(lx(d * 0.520), ly(0.16), lx(d * 0.505), ly(0.46));
      g.stroke();
      g.strokeStyle = 'rgba(120,92,166,0.30)';
      g.lineWidth = U * 0.010;
      g.beginPath();
      g.moveTo(lx(d * 0.385), ly(-0.10));
      g.quadraticCurveTo(lx(d * 0.450), ly(0.24), lx(d * 0.440), ly(0.62));
      g.stroke();
      g.beginPath();
      g.moveTo(lx(d * 0.492), ly(0.56));
      g.quadraticCurveTo(lx(d * 0.520), ly(0.82), lx(d * 0.500), ly(1.04));
      g.stroke();
      g.restore();
    }

    /* hair ornament: a little cyan crystal */
    g.save();
    g.fillStyle = 'rgba(' + CYAN_B + ',0.55)';
    g.fill(paths.clip);
    g.strokeStyle = 'rgba(255,255,255,0.95)';
    g.lineWidth = Math.max(1, U * 0.005);
    g.stroke(paths.clip);
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.beginPath();
    g.arc(lx(0.318), ly(-0.196), Math.max(1.4, U * 0.010), 0, TAU);
    g.fill();
    g.restore();
  }

  function drawRim(g) {
    /* bright edge on the silver hair: white core, cyan / pink tint */
    var edges = [
      [paths.rimL, '255,255,255', 0.85, U * 0.010],
      [paths.rimR, '255,255,255', 0.80, U * 0.010],
      [paths.rimL, CYAN_B, 0.45, U * 0.016],
      [paths.rimR, PINKL, 0.40, U * 0.016],
      [paths.rimBodyL, '255,255,255', 0.70, U * 0.009],
      [paths.rimBodyR, '255,255,255', 0.70, U * 0.009],
      [paths.rimBodyL, CYAN_B, 0.40, U * 0.015],
      [paths.rimBodyR, PINKL, 0.36, U * 0.015]
    ];
    for (var i = 0; i < edges.length; i++) {
      var e = edges[i];
      g.strokeStyle = 'rgba(' + e[1] + ',' + e[2] + ')';
      g.lineWidth = e[3];
      g.stroke(e[0]);
    }
  }

  function drawCollar(g) {
    var cg = g.createLinearGradient(0, ly(0.60), 0, ly(0.84));
    cg.addColorStop(0, '#ffffff');
    cg.addColorStop(0.48, '#f2fbff');
    cg.addColorStop(1, '#cfe2f6');
    g.fillStyle = cg;
    g.fill(paths.collar);

    g.save();
    g.clip(paths.collar);
    var sh = g.createLinearGradient(0, ly(0.60), 0, ly(0.84));
    sh.addColorStop(0, 'rgba(96,74,150,0)');
    sh.addColorStop(1, 'rgba(96,74,150,0.34)');
    g.fillStyle = sh;
    g.fillRect(lx(-0.2), ly(0.60), U * 0.4, U * 0.25);
    g.restore();

    g.save();
    g.strokeStyle = 'rgba(46,182,222,0.80)';
    g.lineWidth = Math.max(1, U * 0.009);
    g.beginPath();
    g.moveTo(lx(-0.180), ly(0.790));
    g.quadraticCurveTo(lx(-0.178), ly(0.690), lx(-0.126), ly(0.648));
    g.quadraticCurveTo(lx(0.000), ly(0.612), lx(0.126), ly(0.648));
    g.quadraticCurveTo(lx(0.178), ly(0.690), lx(0.180), ly(0.790));
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.95)';
    g.lineWidth = Math.max(1, U * 0.0036);
    g.stroke();

    /* clasp */
    g.fillStyle = 'rgba(110,224,246,0.90)';
    g.beginPath();
    g.moveTo(lx(0.000), ly(0.712));
    g.lineTo(lx(0.020), ly(0.736));
    g.lineTo(lx(0.000), ly(0.760));
    g.lineTo(lx(-0.020), ly(0.736));
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.95)';
    g.lineWidth = Math.max(1, U * 0.003);
    g.stroke();
    g.restore();
  }

  /* ------------------------------------------------------------------ *
   *  animated bits
   * ------------------------------------------------------------------ */

  function buildLoose() {
    loose.length = 0;
    var defs = [
      [-0.500, 0.18, -0.575, 0.52, -0.545, 0.86, 0.010, 0.18, 1.5, 0.3, 0],
      [-0.540, 0.40, -0.615, 0.70, -0.580, 0.96, 0.008, 0.22, 2.1, 1.4, 0],
      [0.520, 0.16, 0.595, 0.54, 0.562, 0.88, 0.010, 0.20, 1.8, 2.2, 1],
      [0.558, 0.38, 0.632, 0.72, 0.594, 0.98, 0.008, 0.24, 2.4, 3.6, 1],
      [-0.310, -0.330, -0.405, -0.170, -0.462, -0.045, 0.007, 0.12, 1.2, 0.8, 0]
    ];
    for (var i = 0; i < defs.length; i++) {
      var d = defs[i];
      loose.push({
        x0: lx(d[0]), y0: ly(d[1]),
        cx: lx(d[2]), cy: ly(d[3]),
        x1: lx(d[4]), y1: ly(d[5]),
        w: U * d[6], amp: U * d[7], sp: d[8], ph: d[9], side: d[10]
      });
    }
  }

  function drawLoose() {
    for (var i = 0; i < loose.length; i++) {
      var s = loose[i];
      var sway = Math.sin(t * s.sp + s.ph) * s.amp;
      var sway2 = Math.sin(t * s.sp * 0.7 + s.ph + 1.1) * s.amp * 0.55;
      var mx = s.cx + sway * 0.45;
      var my = s.cy + sway2 * 0.3;
      var ex = s.x1 + sway;
      var ey = s.y1 + sway2;
      ctx.strokeStyle = 'rgba(214,198,240,0.90)';
      ctx.lineWidth = s.w;
      ctx.beginPath();
      ctx.moveTo(s.x0, s.y0);
      ctx.quadraticCurveTo(mx, my, ex, ey);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = Math.max(1, s.w * 0.5);
      ctx.beginPath();
      ctx.moveTo(s.x0 - s.w * 0.5, s.y0);
      ctx.quadraticCurveTo(mx - s.w * 0.5, my, ex, ey);
      ctx.stroke();
    }
  }

  function buildDots() {
    dots.length = 0;
    var n = Math.round(Math.min(72, Math.max(48, W * H / 20000)));
    for (var i = 0; i < n; i++) {
      dots.push({
        x: Math.random(),
        y: rand(-0.05, 1.05),
        r: rand(0.004, 0.011),
        vy: rand(0.006, 0.020),
        sp: rand(0.15, 0.6),
        ph: rand(0, TAU),
        amp: rand(0.004, 0.018),
        a: rand(0.45, 0.95),
        c: i % 4
      });
    }
  }

  function drawDots(dt) {
    for (var i = 0; i < dots.length; i++) {
      var p = dots[i];
      p.y -= p.vy * dt;
      if (p.y < -0.04) {
        p.y = 1.04;
        p.x = Math.random();
      }
      var x = (p.x + Math.sin(t * p.sp + p.ph) * p.amp) * W;
      var y = p.y * H;
      if (x > W * 0.74 && y < H * 0.16) { continue; }
      var tw = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * 1.6 + p.ph * 2.0));
      var d = p.r * H * 3.0;
      var spr = p.c === 0 ? glow.cyan : (p.c === 1 ? glow.white : (p.c === 2 ? glow.pink : glow.violet));
      ctx.globalAlpha = p.a * tw;
      ctx.drawImage(spr, x - d, y - d, d * 2, d * 2);
      ctx.globalAlpha = p.a * tw * 0.9;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, Math.max(0.8, p.r * H * 0.30), 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function buildBands() {
    bands = [
      { front: 0, y0: 0.64, y1: 0.20, cx0: 0.28, cy0: 0.40, cx1: 0.72, cy1: 0.34, w: 0.055, sp: 0.10, ph: 0.0, a: 1.0 },
      { front: 1, y0: -0.06, y1: 0.44, cx0: 0.82, cy0: -0.02, cx1: 1.02, cy1: 0.18, w: 0.036, sp: 0.12, ph: 1.7, a: 0.80 },
      { front: 1, y0: 0.94, y1: 0.64, cx0: 0.30, cy0: 1.02, cx1: 0.72, cy1: 0.84, w: 0.042, sp: 0.09, ph: 3.1, a: 0.85 }
    ];
  }

  function drawBands(front) {
    for (var i = 0; i < bands.length; i++) {
      var b = bands[i];
      if (b.front !== front) { continue; }
      var dr = Math.sin(t * b.sp + b.ph) * 0.035;
      var dr2 = Math.cos(t * b.sp * 0.8 + b.ph) * 0.030;
      var x0 = -0.08 * W, x1 = 1.08 * W;
      var y0 = (b.y0 + dr) * H, y1 = (b.y1 + dr2) * H;
      var c0x = b.cx0 * W, c0y = (b.cy0 + dr * 0.6) * H;
      var c1x = b.cx1 * W, c1y = (b.cy1 - dr2 * 0.6) * H;
      var w0 = b.w * H * 0.55, w1 = b.w * H;

      var lg = ctx.createLinearGradient(x0, y0, x1, y1);
      lg.addColorStop(0, 'rgba(' + VIOLET + ',0)');
      lg.addColorStop(0.22, 'rgba(' + VIOLET + ',' + (0.30 * b.a) + ')');
      lg.addColorStop(0.50, 'rgba(255,255,255,' + (0.42 * b.a) + ')');
      lg.addColorStop(0.78, 'rgba(60,198,232,' + (0.30 * b.a) + ')');
      lg.addColorStop(1, 'rgba(' + CYAN_B + ',0)');

      ctx.fillStyle = lg;
      ctx.beginPath();
      ctx.moveTo(x0, y0 - w0);
      ctx.bezierCurveTo(c0x, c0y - w1, c1x, c1y - w1, x1, y1 - w0);
      ctx.lineTo(x1, y1 + w0);
      ctx.bezierCurveTo(c1x, c1y + w1, c0x, c0y + w1, x0, y0 + w0);
      ctx.closePath();
      ctx.fill();

      /* bright core */
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.55 * b.a) + ')';
      ctx.lineWidth = Math.max(1, H * 0.0022);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.bezierCurveTo(c0x, c0y - w1 * 0.1, c1x, c1y - w1 * 0.1, x1, y1);
      ctx.stroke();
    }
  }

  function drawTilt() {
    var rx = W * TILT_RX;
    var ry = H * TILT_RY;
    var half = tiltSize / 2;
    ctx.save();
    ctx.globalAlpha = 0.72;
    ctx.translate(W * TILT_NX, H * TILT_NY);
    ctx.rotate(-0.10);
    ctx.scale(rx / half, ry / half);
    ctx.rotate(t * 5 * DEG);
    ctx.drawImage(tiltC, -half, -half, tiltSize, tiltSize);
    ctx.restore();
  }

  function drawHalo() {
    ctx.save();
    ctx.globalAlpha = 0.86;
    ctx.translate(FX, FY + U * 0.06);
    ctx.rotate(t * 6 * DEG);
    ctx.drawImage(haloC, -haloSize / 2, -haloSize / 2, haloSize, haloSize);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.42;
    ctx.translate(FX, FY + H * 0.10);
    ctx.rotate(-t * 3.2 * DEG);
    ctx.drawImage(halo2C, -halo2Size / 2, -halo2Size / 2, halo2Size, halo2Size);
    ctx.restore();
  }

  function drawFrame(dt) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(bgC, 0, 0, W, H);

    /* breathing soft light behind the head */
    var br = 0.5 + 0.5 * Math.sin(t * 0.55);
    var gs = U * 2.6 * (1 + 0.025 * br);
    ctx.globalAlpha = 0.20 + 0.10 * br;
    ctx.drawImage(glow.white, FX - gs / 2, FY - gs / 2 + U * 0.10, gs, gs);
    ctx.globalAlpha = 1;

    drawHalo();
    drawTilt();
    drawBands(0);

    ctx.drawImage(chC, 0, 0, W, H);

    drawBands(1);
    drawLoose();
    drawDots(dt);

    /* dim the exit-button corner */
    ctx.drawImage(shadeC, W - shadeW, 0, shadeW, shadeH);
  }

  /* ------------------------------------------------------------------ *
   *  lifecycle
   * ------------------------------------------------------------------ */

  function buildScene() {
    U = H * HEAD_U;
    FX = W * FACE_NX;
    FY = H * FACE_NY;

    glow.white = makeGlow('255,255,255', 0.95);
    glow.cyan = makeGlow('110,225,246', 0.95);
    glow.pink = makeGlow('255,164,198', 0.85);
    glow.violet = makeGlow('176,150,248', 0.80);

    buildPaths();
    renderBg();
    renderHalo();
    renderHalo2();
    renderTilt();
    renderShade();
    renderChar();
    buildLoose();
    buildDots();
    buildBands();
  }

  function resize() {
    W = Math.max(1, window.innerWidth);
    H = Math.max(1, window.innerHeight);
    dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);

    canvas.width = Math.max(1, Math.round(W * dpr));
    canvas.height = Math.max(1, Math.round(H * dpr));
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    if ('imageSmoothingQuality' in ctx) { ctx.imageSmoothingQuality = 'high'; }

    buildScene();
    drawFrame(0);
  }

  function frame(ts) {
    rafId = window.requestAnimationFrame(frame);
    if (!last) { last = ts; return; }
    var dt = Math.min(0.05, (ts - last) / 1000);
    last = ts;
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
