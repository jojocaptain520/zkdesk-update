/* ==========================================================================
   Cyber Qipao -- procedural canvas screensaver.
   Cyber-guochao poster: cheongsam (qipao) girl in a three-quarter pose,
   mechanical joint rings, a folded fan, neon lanterns, drifting petals.

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
  var L = { ox: 0, oy: 0, unit: 1 };       /* figure origin + scale (css px) */
  var bg = null;                            /* full static layer            */
  var S = {};                               /* pre-rendered sprite cache    */
  var lanterns = [];
  var joints = [];
  var petals = [];
  var motes = [];
  var glints = [];
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

  /* soft radial glow sprite, one per hue; drawn with alpha, never regenerated */
  function makeGlow(rgb, size) {
    var c = makeCanvas(size, size);
    var g = c.getContext('2d');
    var r = c.width * 0.5;
    var gr = g.createRadialGradient(r, r, 0, r, r, r);
    gr.addColorStop(0.00, 'rgba(' + rgb + ',1)');
    gr.addColorStop(0.16, 'rgba(' + rgb + ',0.66)');
    gr.addColorStop(0.38, 'rgba(' + rgb + ',0.26)');
    gr.addColorStop(0.66, 'rgba(' + rgb + ',0.08)');
    gr.addColorStop(1.00, 'rgba(' + rgb + ',0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, c.width, c.height);
    return c;
  }

  function blitGlow(g, sprite, cx, cy, size, alpha) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = alpha;
    g.drawImage(sprite, cx - size * 0.5, cy - size * 0.5, size, size);
    g.restore();
  }

  /* Catmull-Rom -> bezier: keeps the hand placed point lists editable */
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

  /* capsule limb: bright outline stroke, then the dark core on top */
  function limb(g, x0, y0, x1, y1, w, rim, fill) {
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.strokeStyle = rim;
    g.lineWidth = w + 0.007;
    g.stroke();
    g.strokeStyle = fill;
    g.lineWidth = w;
    g.stroke();
  }

  /* ------------------------------------------------------- figure geometry
     Three-quarter standing pose, facing the lanterns (+x).
     Unit space: y = 0 top of head, y = 1 heel, one unit = figure height.
     Head is 0.166u tall = 12.3% of screen height; shoulders 1.84 head widths.
     ---------------------------------------------------------------------- */

  /* near contour: collar base -> shoulder -> bust -> waist -> hip -> hem
     head width is 0.108u, so shoulders = 2.0, waist = 1.2, hip = 1.7 heads */
  var FRONT = [
    [0.020, 0.170], [0.058, 0.190], [0.100, 0.212], [0.120, 0.236],
    [0.118, 0.270], [0.104, 0.310], [0.082, 0.346], [0.062, 0.398],
    [0.072, 0.434], [0.098, 0.472], [0.104, 0.502], [0.100, 0.550],
    [0.095, 0.606], [0.090, 0.664], [0.085, 0.712], [0.079, 0.760],
    [0.074, 0.820], [0.071, 0.876], [0.069, 0.892]
  ];
  var HEM = [[0.050, 0.904], [0.014, 0.912], [-0.024, 0.910], [-0.058, 0.898]];
  var BACK = [
    [-0.062, 0.848], [-0.068, 0.786], [-0.074, 0.720], [-0.082, 0.652],
    [-0.088, 0.586], [-0.094, 0.518], [-0.084, 0.474], [-0.068, 0.434],
    [-0.056, 0.400], [-0.064, 0.358], [-0.076, 0.320], [-0.088, 0.276],
    [-0.100, 0.242], [-0.086, 0.204], [-0.052, 0.182], [-0.024, 0.170]
  ];

  /* the thigh window: bare skin seen through the high side slit */
  var SLIT_WIN = [
    [0.104, 0.502], [0.100, 0.550], [0.095, 0.606], [0.090, 0.664],
    [0.085, 0.712], [0.079, 0.758], [0.046, 0.746], [0.018, 0.688],
    [0.030, 0.630], [0.052, 0.572]
  ];
  var SLIT_EDGE = [
    [0.102, 0.504], [0.052, 0.572], [0.030, 0.630], [0.018, 0.688],
    [0.046, 0.746], [0.079, 0.758]
  ];
  /* bound edge (rolling trim) inside the hem */
  var HEM_TRIM = [
    [0.072, 0.880], [0.052, 0.892], [0.014, 0.900], [-0.024, 0.898],
    [-0.058, 0.886]
  ];

  /* mandarin collar: high band wrapping the neck, sits under the jaw */
  var COLLAR = [
    [0.042, 0.178], [0.028, 0.168], [0.004, 0.163], [-0.020, 0.165],
    [-0.034, 0.174], [-0.040, 0.194], [-0.038, 0.216], [-0.010, 0.226],
    [0.018, 0.224], [0.036, 0.214], [0.046, 0.196]
  ];
  var COLLAR_TOP = [
    [0.042, 0.172], [0.020, 0.166], [0.000, 0.164], [-0.022, 0.166],
    [-0.042, 0.174]
  ];

  /* diagonal front closure (xie-jin) with frog buttons */
  var PLACKET = [
    [0.032, 0.208], [0.048, 0.226], [0.068, 0.248], [0.088, 0.272],
    [0.102, 0.298]
  ];
  var BUTTONS = [[0.048, 0.228], [0.070, 0.254], [0.094, 0.284]];

  var HAIR = [
    [0.048, 0.030], [0.034, 0.010], [0.012, -0.004], [-0.014, 0.000],
    [-0.034, 0.014], [-0.046, 0.042], [-0.050, 0.074], [-0.046, 0.108],
    [-0.038, 0.136], [-0.046, 0.162], [-0.058, 0.190], [-0.052, 0.214],
    [-0.040, 0.202], [-0.032, 0.178], [-0.026, 0.154], [-0.020, 0.132],
    [-0.002, 0.108], [0.018, 0.082], [0.036, 0.052]
  ];
  /* skull-only outline: the hair rim must not run across the neck */
  var HAIR_RIM = [
    [0.048, 0.030], [0.034, 0.008], [0.010, -0.004], [-0.016, 0.002],
    [-0.036, 0.018], [-0.048, 0.044], [-0.052, 0.074]
  ];
  var BANG = [
    [0.050, 0.026], [0.038, 0.006], [0.018, 0.006], [0.022, 0.026],
    [0.036, 0.044], [0.048, 0.040]
  ];
  /* two loose strands falling from the nape */
  var STRANDS = [
    [[-0.046, 0.150], [-0.060, 0.176], [-0.072, 0.202], [-0.078, 0.220]],
    [[-0.036, 0.156], [-0.050, 0.182], [-0.062, 0.208], [-0.068, 0.226]]
  ];

  var SHOE_NEAR = [
    [0.070, 0.868], [0.086, 0.900], [0.108, 0.932], [0.128, 0.954],
    [0.134, 0.970], [0.118, 0.982], [0.088, 0.980], [0.060, 0.972],
    [0.048, 0.980], [0.040, 1.000], [0.028, 0.994], [0.032, 0.966],
    [0.044, 0.926], [0.054, 0.882]
  ];
  var SHOE_FAR = [
    [-0.058, 0.866], [-0.046, 0.902], [-0.030, 0.934], [-0.012, 0.956],
    [-0.004, 0.972], [-0.020, 0.982], [-0.048, 0.980], [-0.072, 0.972],
    [-0.084, 0.980], [-0.092, 1.000], [-0.104, 0.994], [-0.098, 0.966],
    [-0.086, 0.926], [-0.076, 0.880]
  ];

  /* mechanical joint rings on the real joints */
  var JOINT_DEF = [
    { u: 0.114, v: 0.248, r: 0.027, spin: 0.36, ph: 0.0 },   /* shoulder */
    { u: 0.138, v: 0.402, r: 0.025, spin: -0.30, ph: 1.7 },  /* elbow    */
    { u: 0.162, v: 0.240, r: 0.019, spin: 0.46, ph: 3.1 },   /* wrist    */
    { u: 0.096, v: 0.508, r: 0.028, spin: -0.22, ph: 0.7 },  /* hip      */
    { u: 0.080, v: 0.700, r: 0.025, spin: 0.31, ph: 2.4 },   /* knee     */
    { u: 0.074, v: 0.874, r: 0.017, spin: -0.40, ph: 4.2 }   /* ankle    */
  ];

  /* ------------------------------------------------------------ sprites */

  function buildSprites() {
    S.glowCyan = makeGlow('56,232,255', 256);
    S.glowMag = makeGlow('255,61,110', 256);
    S.glowWarm = makeGlow('255,154,60', 256);
    S.glowRed = makeGlow('170,26,54', 256);
    S.glowPink = makeGlow('255,127,168', 128);
    S.glowWhite = makeGlow('255,240,220', 128);
    S.petal = makePetal();
    S.ring = makeRing(256);
    S.lantern = makeLantern();
    S.noise = makeNoise(128);
    S.corner = makeCorner();
  }

  function makePetal() {
    var w = 96, h = 128;
    var c = makeCanvas(w, h), g = c.getContext('2d');
    var gr = g.createLinearGradient(w * 0.2, h * 0.1, w * 0.8, h * 0.95);
    gr.addColorStop(0, '#ffd2e0');
    gr.addColorStop(0.45, '#ff8fb2');
    gr.addColorStop(1, '#d92a63');
    g.beginPath();
    g.moveTo(w * 0.5, h * 0.04);
    g.bezierCurveTo(w * 0.94, h * 0.24, w * 0.88, h * 0.66, w * 0.5, h * 0.97);
    g.bezierCurveTo(w * 0.12, h * 0.66, w * 0.06, h * 0.24, w * 0.5, h * 0.04);
    g.closePath();
    g.fillStyle = gr;
    g.fill();
    g.globalCompositeOperation = 'source-atop';
    g.strokeStyle = 'rgba(255,232,242,0.6)';
    g.lineWidth = 2.4;
    g.beginPath();
    g.moveTo(w * 0.5, h * 0.10);
    g.bezierCurveTo(w * 0.40, h * 0.42, w * 0.42, h * 0.68, w * 0.5, h * 0.90);
    g.stroke();
    g.strokeStyle = 'rgba(140,14,52,0.4)';
    g.lineWidth = 1.8;
    g.beginPath();
    g.moveTo(w * 0.5, h * 0.14);
    g.bezierCurveTo(w * 0.68, h * 0.40, w * 0.66, h * 0.68, w * 0.5, h * 0.92);
    g.stroke();
    return c;
  }

  /* mechanical joint ring: cyan arc with a gap, tick marks, inner ring */
  function makeRing(size) {
    var c = makeCanvas(size, size), g = c.getContext('2d');
    var m = size * 0.5, R = size * 0.40;
    g.translate(m, m);
    g.lineCap = 'round';

    g.strokeStyle = 'rgba(56,232,255,0.26)';
    g.lineWidth = size * 0.062;
    g.beginPath();
    g.arc(0, 0, R, 0.42, 5.72);
    g.stroke();

    g.strokeStyle = 'rgba(168,250,255,0.98)';
    g.lineWidth = size * 0.026;
    g.beginPath();
    g.arc(0, 0, R, 0.42, 5.72);
    g.stroke();

    g.strokeStyle = 'rgba(255,61,110,0.66)';
    g.lineWidth = size * 0.014;
    g.beginPath();
    g.arc(0, 0, R * 0.70, 2.10, 5.62);
    g.stroke();

    var a0 = 0.42, a1 = 5.72;
    g.strokeStyle = 'rgba(214,254,255,0.98)';
    g.lineWidth = size * 0.064;
    g.beginPath();
    g.arc(0, 0, R, a0 - 0.034, a0 + 0.034);
    g.stroke();
    g.beginPath();
    g.arc(0, 0, R, a1 - 0.034, a1 + 0.034);
    g.stroke();

    g.strokeStyle = 'rgba(56,232,255,0.6)';
    g.lineWidth = size * 0.013;
    var i, a;
    for (i = 0; i < 6; i++) {
      a = 1.05 + i * 0.62;
      g.beginPath();
      g.moveTo(Math.cos(a) * R * 0.84, Math.sin(a) * R * 0.84);
      g.lineTo(Math.cos(a) * R * 0.99, Math.sin(a) * R * 0.99);
      g.stroke();
    }
    return c;
  }

  /* neon lantern sprite: cord, caps, ribbed body, filament, tassel */
  function makeLantern() {
    var RC = 64;
    var sw = 152, sh = 306;
    var c = makeCanvas(sw, sh), g = c.getContext('2d');
    var cx = sw * 0.5;
    var cordTop = 6;
    var capTop = cordTop + RC * 1.10;
    var capH = RC * 0.17;
    var bodyCy = capTop + capH + RC * 0.80;
    var bottomCap = bodyCy + RC * 0.80;
    var tasselTop = bottomCap + RC * 0.12;

    g.strokeStyle = 'rgba(226,178,112,0.6)';
    g.lineWidth = 2.6;
    g.beginPath();
    g.moveTo(cx, cordTop);
    g.lineTo(cx, capTop);
    g.stroke();

    g.fillStyle = '#2e0d18';
    g.beginPath();
    g.moveTo(cx - RC * 0.34, capTop);
    g.lineTo(cx + RC * 0.34, capTop);
    g.lineTo(cx + RC * 0.28, capTop + capH);
    g.lineTo(cx - RC * 0.28, capTop + capH);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(255,200,120,0.85)';
    g.lineWidth = 2.2;
    g.beginPath();
    g.moveTo(cx - RC * 0.37, capTop + 1);
    g.lineTo(cx + RC * 0.37, capTop + 1);
    g.stroke();

    var gr = g.createRadialGradient(
      cx - RC * 0.18, bodyCy - RC * 0.24, RC * 0.05,
      cx, bodyCy, RC * 1.06);
    gr.addColorStop(0, '#fff2c8');
    gr.addColorStop(0.20, '#ffc169');
    gr.addColorStop(0.52, '#ff8f2f');
    gr.addColorStop(0.80, '#d44617');
    gr.addColorStop(1, '#74170a');
    g.fillStyle = gr;
    g.beginPath();
    g.ellipse(cx, bodyCy, RC, RC * 0.80, 0, 0, TAU);
    g.fill();

    g.strokeStyle = 'rgba(255,222,150,0.46)';
    g.lineWidth = 2.4;
    g.beginPath();
    g.ellipse(cx, bodyCy - RC * 0.34, RC * 0.87, RC * 0.26, 0, 0, TAU);
    g.stroke();
    g.beginPath();
    g.ellipse(cx, bodyCy + RC * 0.34, RC * 0.87, RC * 0.26, 0, 0, TAU);
    g.stroke();

    var i, k;
    for (i = -2; i <= 2; i++) {
      k = i / 2.4;
      g.strokeStyle = 'rgba(120,28,10,0.28)';
      g.lineWidth = 2.4;
      g.beginPath();
      g.ellipse(cx + k * RC * 0.74, bodyCy, RC * (0.36 - Math.abs(k) * 0.10),
        RC * 0.80, 0, 0, TAU);
      g.stroke();
    }

    g.strokeStyle = 'rgba(255,250,220,0.98)';
    g.lineWidth = 3.6;
    g.beginPath();
    g.moveTo(cx, bodyCy - RC * 0.52);
    g.bezierCurveTo(cx - RC * 0.11, bodyCy - RC * 0.20,
      cx + RC * 0.11, bodyCy + RC * 0.10,
      cx, bodyCy + RC * 0.50);
    g.stroke();
    g.fillStyle = 'rgba(255,253,238,1)';
    g.beginPath();
    g.arc(cx, bodyCy + RC * 0.02, RC * 0.08, 0, TAU);
    g.fill();

    g.fillStyle = '#2e0d18';
    g.beginPath();
    g.moveTo(cx - RC * 0.26, bottomCap);
    g.lineTo(cx + RC * 0.26, bottomCap);
    g.lineTo(cx + RC * 0.32, bottomCap + capH);
    g.lineTo(cx - RC * 0.32, bottomCap + capH);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(255,200,120,0.7)';
    g.lineWidth = 1.8;
    g.beginPath();
    g.moveTo(cx - RC * 0.32, bottomCap + capH);
    g.lineTo(cx + RC * 0.32, bottomCap + capH);
    g.stroke();

    for (i = -3; i <= 3; i++) {
      g.strokeStyle = i % 2 === 0 ? 'rgba(255,178,92,0.78)' : 'rgba(220,102,44,0.66)';
      g.lineWidth = 2.8;
      g.beginPath();
      g.moveTo(cx + i * RC * 0.055, tasselTop);
      g.quadraticCurveTo(
        cx + i * RC * 0.13, tasselTop + RC * 0.62,
        cx + i * RC * 0.19, tasselTop + RC * 1.22);
      g.stroke();
    }
    g.fillStyle = 'rgba(255,214,146,0.95)';
    g.beginPath();
    g.ellipse(cx, tasselTop + RC * 0.06, RC * 0.13, RC * 0.07, 0, 0, TAU);
    g.fill();

    c._RC = RC;
    c._pivotX = cx;
    c._pivotY = cordTop;
    c._bodyDy = bodyCy - cordTop;
    return c;
  }

  /* soft dark patch that guarantees the host exit button stays readable */
  function makeCorner() {
    var cw = 400, ch = 220;
    var c = makeCanvas(cw * dpr, ch * dpr), g = c.getContext('2d');
    g.scale(dpr, dpr);
    var gr = g.createRadialGradient(cw - 2, 2, 0, cw - 2, 2, 372);
    gr.addColorStop(0.00, 'rgba(7,3,10,0.95)');
    gr.addColorStop(0.40, 'rgba(7,3,10,0.82)');
    gr.addColorStop(0.72, 'rgba(7,3,10,0.38)');
    gr.addColorStop(1.00, 'rgba(7,3,10,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, cw, ch);
    c._cw = cw;
    c._ch = ch;
    return c;
  }

  function makeNoise(size) {
    var c = makeCanvas(size, size), g = c.getContext('2d');
    var img = g.createImageData(c.width, c.height);
    var d = img.data, i, v;
    for (i = 0; i < d.length; i += 4) {
      v = 128 + (Math.random() * 2 - 1) * 46;
      d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  /* --------------------------------------------------------- static layer */

  function buildLayout() {
    L.unit = H * 0.74;
    L.ox = W * 0.40;
    L.oy = H * 0.235;
  }

  /* distant chinese roof: shallow curved eaves on a solid wall mass */
  function roofShape(g, cx, baseY, w, h) {
    g.beginPath();
    g.moveTo(cx - w * 0.5, baseY);
    g.bezierCurveTo(cx - w * 0.42, baseY - h * 0.10,
      cx - w * 0.34, baseY - h * 0.44, cx - w * 0.24, baseY - h * 0.62);
    g.bezierCurveTo(cx - w * 0.14, baseY - h * 0.82,
      cx - w * 0.05, baseY - h * 1.00, cx, baseY - h);
    g.bezierCurveTo(cx + w * 0.05, baseY - h * 1.00,
      cx + w * 0.14, baseY - h * 0.82, cx + w * 0.24, baseY - h * 0.62);
    g.bezierCurveTo(cx + w * 0.34, baseY - h * 0.44,
      cx + w * 0.42, baseY - h * 0.10, cx + w * 0.5, baseY);
    g.lineTo(cx + w * 0.40, baseY);
    g.lineTo(cx + w * 0.40, baseY + h * 1.5);
    g.lineTo(cx - w * 0.40, baseY + h * 1.5);
    g.lineTo(cx - w * 0.40, baseY);
    g.closePath();
    g.fill();
  }

  function eaveRim(g, cx, baseY, w, h) {
    g.beginPath();
    g.moveTo(cx - w * 0.5, baseY);
    g.bezierCurveTo(cx - w * 0.42, baseY - h * 0.10,
      cx - w * 0.34, baseY - h * 0.44, cx - w * 0.24, baseY - h * 0.62);
    g.bezierCurveTo(cx - w * 0.14, baseY - h * 0.82,
      cx - w * 0.05, baseY - h * 1.00, cx, baseY - h);
    g.bezierCurveTo(cx + w * 0.05, baseY - h * 1.00,
      cx + w * 0.14, baseY - h * 0.82, cx + w * 0.24, baseY - h * 0.62);
    g.bezierCurveTo(cx + w * 0.34, baseY - h * 0.44,
      cx + w * 0.42, baseY - h * 0.10, cx + w * 0.5, baseY);
    g.stroke();
  }

  function drawRoofs(g) {
    var i, cx, baseY, rw, rh;
    g.fillStyle = '#0e0814';
    for (i = 0; i < 7; i++) {
      cx = W * (-0.04 + i * 0.175);
      baseY = H * (0.170 + ((i * 7) % 3) * 0.014);
      rw = W * (0.115 + ((i * 5) % 3) * 0.030);
      rh = H * (0.030 + ((i * 3) % 2) * 0.012);
      roofShape(g, cx, baseY, rw, rh);
    }
    g.fillStyle = '#0a0610';
    roofShape(g, W * 0.045, H * 0.250, W * 0.34, H * 0.062);
    g.strokeStyle = 'rgba(255,150,100,0.22)';
    g.lineWidth = 1.8;
    eaveRim(g, W * 0.045, H * 0.250, W * 0.34, H * 0.062);
    g.strokeStyle = 'rgba(120,220,255,0.10)';
    eaveRim(g, W * 0.62, H * 0.196, W * 0.24, H * 0.040);
  }

  function lattice(g, x, y, w, h, cols, rows) {
    var i, cw = w / cols, ch = h / rows;
    g.lineWidth = 2.4;
    g.strokeRect(x, y, w, h);
    for (i = 1; i < cols; i++) {
      g.beginPath();
      g.moveTo(x + cw * i, y);
      g.lineTo(x + cw * i, y + h);
      g.stroke();
    }
    for (i = 1; i < rows; i++) {
      g.beginPath();
      g.moveTo(x, y + ch * i);
      g.lineTo(x + w, y + ch * i);
      g.stroke();
    }
    g.lineWidth = 1.3;
    for (i = 0; i < cols; i++) {
      g.beginPath();
      g.moveTo(x + cw * i + cw * 0.5, y);
      g.lineTo(x + cw * i + cw * 0.5, y + h);
      g.stroke();
    }
  }

  function buildStatic() {
    if (bg) { bg.width = 1; bg.height = 1; bg = null; }
    bg = makeCanvas(W * dpr, H * dpr);
    var g = bg.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.lineJoin = 'round';
    g.lineCap = 'round';

    /* 1. base gradient: dark red -> deep purple black */
    var base = g.createLinearGradient(0, 0, W * 0.25, H);
    base.addColorStop(0.00, '#210709');
    base.addColorStop(0.28, '#1b0611');
    base.addColorStop(0.60, '#110615');
    base.addColorStop(1.00, '#0a0610');
    g.fillStyle = base;
    g.fillRect(0, 0, W, H);

    /* 2. haze; key light sits on the lantern side, fills from the left */
    blitGlow(g, S.glowRed, W * 0.62, H * 0.34, H * 1.60, 0.38);
    blitGlow(g, S.glowWarm, W * 0.80, H * 0.255, H * 0.90, 0.76);
    blitGlow(g, S.glowWarm, W * 0.70, H * 0.400, H * 0.60, 0.58);
    blitGlow(g, S.glowMag, W * 0.31, H * 0.52, H * 1.00, 0.22);
    blitGlow(g, S.glowRed, W * 0.12, H * 0.80, H * 0.86, 0.26);
    blitGlow(g, S.glowCyan, W * 0.44, H * 0.50, H * 0.82, 0.12);
    blitGlow(g, S.glowMag, W * 0.40, H * 0.80, H * 0.96, 0.24);

    /* 2b. backlit paper window: the screens glow behind the lanterns */
    blitGlow(g, S.glowWarm, W * 0.815, H * 0.300, W * 0.62, 0.50);
    blitGlow(g, S.glowRed, W * 0.790, H * 0.330, W * 0.44, 0.34);
    blitGlow(g, S.glowCyan, W * 0.135, H * 0.300, W * 0.44, 0.20);

    /* 3. architecture silhouettes, darker than the haze behind them */
    g.fillStyle = 'rgba(14,8,20,0.96)';
    g.strokeStyle = 'rgba(14,8,20,0.96)';
    lattice(g, W * 0.615, H * 0.070, W * 0.42, H * 0.52, 8, 10);
    g.fillStyle = 'rgba(11,6,16,0.96)';
    g.strokeStyle = 'rgba(11,6,16,0.96)';
    lattice(g, -W * 0.05, H * 0.135, W * 0.28, H * 0.40, 5, 7);
    drawRoofs(g);

    /* 4. floor: reflection band + contact shadow */
    var floor = g.createLinearGradient(0, H * 0.885, 0, H);
    floor.addColorStop(0, 'rgba(70,10,26,0)');
    floor.addColorStop(0.55, 'rgba(140,30,50,0.34)');
    floor.addColorStop(1, 'rgba(20,6,16,0)');
    g.fillStyle = floor;
    g.fillRect(0, H * 0.885, W, H * 0.115);

    var gl = H * 0.975;
    /* warm pool of lantern light spilling on the floor */
    blitGlow(g, S.glowWarm, W * 0.76, H * 0.955, H * 0.56, 0.46);
    blitGlow(g, S.glowWarm, W * 0.70, H * 0.985, H * 0.36, 0.34);
    var sheen = g.createLinearGradient(0, gl - 2, 0, gl + 30);
    sheen.addColorStop(0, 'rgba(160,240,255,0.00)');
    sheen.addColorStop(0.10, 'rgba(160,240,255,0.42)');
    sheen.addColorStop(0.42, 'rgba(120,150,220,0.12)');
    sheen.addColorStop(1, 'rgba(80,40,90,0)');
    g.fillStyle = sheen;
    g.fillRect(0, gl - 2, W, 32);

    var haloX = g.createLinearGradient(0, 0, W, 0);
    haloX.addColorStop(0.00, 'rgba(200,250,255,0)');
    haloX.addColorStop(0.26, 'rgba(180,245,255,0.42)');
    haloX.addColorStop(0.50, 'rgba(255,180,200,0.34)');
    haloX.addColorStop(0.82, 'rgba(255,190,120,0.40)');
    haloX.addColorStop(1.00, 'rgba(255,190,120,0)');
    g.fillStyle = haloX;
    g.fillRect(0, gl - 1, W, 2);

    g.save();
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.beginPath();
    g.ellipse(L.ox + L.unit * 0.02, gl, L.unit * 0.30, H * 0.020, 0, 0, TAU);
    g.fill();
    g.restore();

    /* 5. the figure */
    drawFigure(g);

    /* 6. atmosphere: scanlines + grain */
    g.save();
    g.globalAlpha = 0.05;
    g.fillStyle = '#000000';
    var y;
    for (y = 0; y < H; y += 3) { g.fillRect(0, y, W, 1); }
    g.restore();

    g.save();
    g.globalCompositeOperation = 'overlay';
    g.globalAlpha = 0.11;
    var pat = g.createPattern(S.noise, 'repeat');
    if (pat) {
      g.fillStyle = pat;
      g.fillRect(0, 0, W, H);
    }
    g.restore();

    /* 7. baked vignette (colour matched to the palette) */
    var vg = g.createRadialGradient(W * 0.44, H * 0.52, Math.min(W, H) * 0.28,
      W * 0.44, H * 0.52, Math.max(W, H) * 0.76);
    vg.addColorStop(0, 'rgba(6,2,10,0)');
    vg.addColorStop(0.58, 'rgba(6,2,10,0.40)');
    vg.addColorStop(1, 'rgba(4,1,7,0.90)');
    g.fillStyle = vg;
    g.fillRect(0, 0, W, H);
  }

  /* ------------------------------------------------------------- figure */

  /* hand-authored head: smooth profile, no spline overshoot */
  function headPath(g) {
    g.beginPath();
    g.moveTo(0.008, 0.000);
    g.bezierCurveTo(0.032, 0.002, 0.048, 0.018, 0.051, 0.040);
    g.bezierCurveTo(0.055, 0.056, 0.049, 0.062, 0.055, 0.069);
    g.bezierCurveTo(0.063, 0.075, 0.064, 0.083, 0.055, 0.088);
    g.bezierCurveTo(0.051, 0.091, 0.050, 0.096, 0.056, 0.102);
    g.bezierCurveTo(0.060, 0.107, 0.055, 0.114, 0.047, 0.120);
    g.bezierCurveTo(0.039, 0.128, 0.030, 0.140, 0.024, 0.152);
    g.lineTo(0.024, 0.174);
    g.lineTo(-0.026, 0.174);
    g.bezierCurveTo(-0.032, 0.148, -0.040, 0.136, -0.041, 0.116);
    g.bezierCurveTo(-0.049, 0.090, -0.051, 0.058, -0.044, 0.036);
    g.bezierCurveTo(-0.036, 0.012, -0.014, -0.004, 0.008, 0.000);
    g.closePath();
  }

  function facePath(g) {
    g.beginPath();
    g.moveTo(0.020, 0.006);
    g.bezierCurveTo(0.038, 0.012, 0.049, 0.024, 0.051, 0.040);
    g.bezierCurveTo(0.055, 0.056, 0.049, 0.062, 0.055, 0.069);
    g.bezierCurveTo(0.063, 0.075, 0.064, 0.083, 0.055, 0.088);
    g.bezierCurveTo(0.051, 0.091, 0.050, 0.096, 0.056, 0.102);
    g.bezierCurveTo(0.060, 0.107, 0.055, 0.114, 0.047, 0.120);
    g.bezierCurveTo(0.039, 0.128, 0.030, 0.140, 0.024, 0.152);
  }

  function drawFan(g) {
    /* folded fan, held up beside the head; pivot at the near wrist */
    var px = 0.164, py = 0.230, r = 0.118;
    var a0 = -1.80, a1 = -0.42;     /* radians, y grows downward */
    var i, a;

    g.save();
    g.translate(px, py);

    var fg = g.createRadialGradient(0, 0, r * 0.18, 0, 0, r);
    fg.addColorStop(0.00, 'rgba(120,215,240,0.12)');
    fg.addColorStop(0.55, 'rgba(160,235,255,0.22)');
    fg.addColorStop(0.88, 'rgba(215,248,255,0.38)');
    fg.addColorStop(1.00, 'rgba(242,253,255,0.54)');
    g.beginPath();
    g.moveTo(0, 0);
    g.arc(0, 0, r, a0, a1);
    g.closePath();
    g.fillStyle = fg;
    g.fill();

    for (i = 0; i <= 6; i++) {
      a = a0 + (a1 - a0) * (i / 6);
      g.strokeStyle = (i === 0 || i === 6)
        ? 'rgba(210,251,255,0.9)' : 'rgba(150,226,246,0.58)';
      g.lineWidth = (i === 0 || i === 6) ? 0.0040 : 0.0026;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      g.stroke();
    }

    g.strokeStyle = 'rgba(56,232,255,0.38)';
    g.lineWidth = 0.013;
    g.beginPath();
    g.arc(0, 0, r, a0, a1);
    g.stroke();
    g.strokeStyle = 'rgba(230,253,255,0.95)';
    g.lineWidth = 0.0044;
    g.beginPath();
    g.arc(0, 0, r, a0, a1);
    g.stroke();

    g.fillStyle = 'rgba(255,61,110,0.6)';
    g.beginPath();
    g.arc(Math.cos(-1.18) * r * 0.62, Math.sin(-1.18) * r * 0.62, r * 0.085, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(255,160,190,0.5)';
    g.beginPath();
    g.arc(Math.cos(-0.80) * r * 0.44, Math.sin(-0.80) * r * 0.44, r * 0.052, 0, TAU);
    g.fill();

    g.fillStyle = 'rgba(255,246,222,0.98)';
    g.beginPath();
    g.arc(0, 0, 0.0074, 0, TAU);
    g.fill();
    g.restore();
  }

  function drawFigure(g) {
    g.save();
    g.translate(L.ox, L.oy);
    g.scale(L.unit, L.unit);

    var closed = FRONT.concat(HEM, BACK);
    var dressFill = g.createLinearGradient(-0.10, 0.16, 0.10, 0.92);
    dressFill.addColorStop(0.00, '#241530');
    dressFill.addColorStop(0.32, '#1a1022');
    dressFill.addColorStop(0.68, '#110a17');
    dressFill.addColorStop(1.00, '#0a0510');
    var skinFill = g.createLinearGradient(0.00, 0.52, 0.10, 0.78);
    skinFill.addColorStop(0.00, '#67404f');
    skinFill.addColorStop(0.45, '#4c2b3a');
    skinFill.addColorStop(1.00, '#331d2b');

    /* halo so the dark silhouette separates from the red haze behind it */
    blitGlowUnit(g, S.glowMag, 0.006, 0.380, 0.42, 0.34);
    blitGlowUnit(g, S.glowCyan, 0.026, 0.700, 0.38, 0.16);

    /* --- far arm: hangs clear of the body, leaving a silhouette gap --- */
    limb(g, -0.094, 0.246, -0.110, 0.352, 0.036, 'rgba(255,61,110,0.45)', '#0c0612');
    limb(g, -0.110, 0.350, -0.104, 0.458, 0.029, 'rgba(255,61,110,0.45)', '#0c0612');
    g.fillStyle = '#0e0714';
    g.beginPath();
    g.ellipse(-0.102, 0.474, 0.014, 0.018, 0.15, 0, TAU);
    g.fill();
    g.strokeStyle = 'rgba(255,90,130,0.45)';
    g.lineWidth = 0.0020;
    g.beginPath();
    g.ellipse(-0.102, 0.474, 0.014, 0.018, 0.15, 0.2, 3.4);
    g.stroke();

    /* --- far shoe, staggered back --- */
    fillCR(g, SHOE_FAR, '#0b0510');
    lineCR(g, SHOE_FAR.slice(0, 5), 'rgba(255,61,110,0.5)', 0.0022, 1);

    /* --- dress --- */
    fillCR(g, closed, dressFill);

    /* head volume, a touch lighter than the silk */
    headPath(g);
    g.fillStyle = '#150d1c';
    g.fill();

    /* --- side slit: bare thigh through the opening --- */
    fillCR(g, SLIT_WIN, skinFill);
    g.save();
    crPath(g, SLIT_WIN, true);
    g.clip();
    blitGlowUnit(g, S.glowWarm, 0.066, 0.620, 0.26, 0.30);
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.26;
    g.strokeStyle = 'rgba(255,214,224,0.95)';
    g.lineWidth = 0.018;
    g.beginPath();
    g.moveTo(0.080, 0.556);
    g.bezierCurveTo(0.070, 0.616, 0.064, 0.670, 0.062, 0.722);
    g.stroke();
    /* shadow along the inner edge of the opening */
    g.globalAlpha = 0.55;
    g.globalCompositeOperation = 'source-over';
    g.strokeStyle = 'rgba(6,2,8,0.9)';
    g.lineWidth = 0.014;
    g.beginPath();
    g.moveTo(0.050, 0.572);
    g.bezierCurveTo(0.030, 0.628, 0.020, 0.686, 0.026, 0.724);
    g.stroke();
    g.restore();
    /* knee cap arc inside the window */
    g.strokeStyle = 'rgba(255,61,110,0.6)';
    g.lineWidth = 0.0032;
    g.beginPath();
    g.moveTo(0.088, 0.680);
    g.bezierCurveTo(0.076, 0.696, 0.060, 0.704, 0.046, 0.708);
    g.stroke();
    /* the lit slit fold: cyan, hip -> below the knee */
    lineCR(g, SLIT_EDGE, 'rgba(56,232,255,0.30)', 0.018, 1);
    lineCR(g, SLIT_EDGE, 'rgba(186,250,255,0.98)', 0.0042, 1);

    /* --- near shoe, forward --- */
    fillCR(g, SHOE_NEAR, skinFill);
    lineCR(g, SHOE_NEAR.slice(0, 5), 'rgba(210,252,255,0.9)', 0.0030, 1);
    g.strokeStyle = 'rgba(56,232,255,0.65)';
    g.lineWidth = 0.0028;
    g.beginPath();
    g.moveTo(0.034, 0.962);
    g.bezierCurveTo(0.068, 0.978, 0.106, 0.982, 0.132, 0.970);
    g.stroke();
    g.strokeStyle = 'rgba(255,61,110,0.75)';
    g.lineWidth = 0.0028;
    g.beginPath();
    g.moveTo(0.038, 0.958);
    g.lineTo(0.040, 1.000);
    g.stroke();

    /* --- far rim: magenta secondary light --- */
    lineCR(g, BACK, 'rgba(255,61,110,0.26)', 0.018, 1);
    lineCR(g, BACK, 'rgba(255,120,158,0.9)', 0.0034, 1);

    /* --- near rim: cyan key light --- */
    lineCR(g, FRONT, 'rgba(56,232,255,0.28)', 0.020, 1);
    lineCR(g, FRONT, 'rgba(190,250,255,0.96)', 0.0038, 1);
    lineCR(g, HEM, 'rgba(56,232,255,0.36)', 0.0055, 1);
    lineCR(g, HEM, 'rgba(190,250,255,0.86)', 0.0022, 1);
    lineCR(g, HEM_TRIM, 'rgba(255,190,150,0.42)', 0.0024, 1);

    /* --- face profile rim --- */
    facePath(g);
    g.strokeStyle = 'rgba(56,232,255,0.22)';
    g.lineWidth = 0.016;
    g.stroke();
    g.strokeStyle = 'rgba(212,252,255,0.95)';
    g.lineWidth = 0.0030;
    g.stroke();
    /* throat + jaw accent */
    g.strokeStyle = 'rgba(255,61,110,0.55)';
    g.lineWidth = 0.0022;
    g.beginPath();
    g.moveTo(0.044, 0.124);
    g.bezierCurveTo(0.034, 0.138, 0.026, 0.152, 0.022, 0.170);
    g.stroke();

    /* --- mandarin collar: the clearest qipao read --- */
    fillCR(g, COLLAR, '#40254f');
    lineCR(g, COLLAR_TOP, 'rgba(56,232,255,0.38)', 0.016, 1);
    lineCR(g, COLLAR_TOP, 'rgba(222,254,255,1)', 0.0046, 1);

    /* collar front notch */
    g.strokeStyle = 'rgba(222,254,255,0.9)';
    g.lineWidth = 0.0026;
    g.beginPath();
    g.moveTo(0.036, 0.174);
    g.lineTo(0.038, 0.200);
    g.stroke();

    /* --- diagonal closure + frog buttons --- */
    blitGlowUnit(g, S.glowCyan, 0.068, 0.252, 0.22, 0.34);
    lineCR(g, PLACKET, 'rgba(56,232,255,0.30)', 0.010, 1);
    lineCR(g, PLACKET, 'rgba(222,254,255,0.95)', 0.0030, 1);
    var i, b;
    for (i = 0; i < BUTTONS.length; i++) {
      b = BUTTONS[i];
      g.fillStyle = 'rgba(16,8,20,0.95)';
      g.beginPath();
      g.arc(b[0], b[1], 0.0088, 0, TAU);
      g.fill();
      g.strokeStyle = 'rgba(232,254,255,1)';
      g.lineWidth = 0.0026;
      g.stroke();
      g.fillStyle = 'rgba(232,254,255,0.9)';
      g.beginPath();
      g.arc(b[0], b[1], 0.0028, 0, TAU);
      g.fill();
    }

    /* under-bust and waist seams give the bodice some form */
    g.strokeStyle = 'rgba(255,61,110,0.42)';
    g.lineWidth = 0.0028;
    g.beginPath();
    g.moveTo(0.100, 0.326);
    g.bezierCurveTo(0.076, 0.342, 0.056, 0.348, 0.038, 0.346);
    g.stroke();
    g.strokeStyle = 'rgba(56,232,255,0.30)';
    g.lineWidth = 0.0030;
    g.beginPath();
    g.moveTo(0.062, 0.398);
    g.bezierCurveTo(0.020, 0.408, -0.020, 0.406, -0.056, 0.398);
    g.stroke();

    /* fabric sheen: lantern light falling across the silk */
    g.save();
    crPath(g, closed, true);
    g.clip();
    blitGlowUnit(g, S.glowWarm, 0.090, 0.330, 0.46, 0.26);
    blitGlowUnit(g, S.glowMag, 0.000, 0.530, 0.46, 0.16);
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.055;
    g.strokeStyle = 'rgba(255,150,180,0.9)';
    g.lineWidth = 0.006;
    var k;
    for (k = 0; k < 3; k++) {
      g.beginPath();
      g.moveTo(0.114 - k * 0.032, 0.320);
      g.lineTo(0.048 - k * 0.032, 0.876);
      g.stroke();
    }
    g.restore();

    /* --- near arm: hangs then lifts to hold the fan --- */
    limb(g, 0.106, 0.246, 0.136, 0.400, 0.038, 'rgba(56,232,255,0.30)', '#0e0715');
    limb(g, 0.136, 0.398, 0.162, 0.238, 0.031, 'rgba(56,232,255,0.62)', '#130b1a');
    g.strokeStyle = 'rgba(56,232,255,0.44)';
    g.lineWidth = 0.0028;
    for (k = 0; k < 6; k++) {
      var vv = 0.268 + k * 0.024;
      g.beginPath();
      g.moveTo(0.090 + k * 0.0026, vv);
      g.lineTo(0.126 + k * 0.0026, vv + 0.006);
      g.stroke();
    }
    /* hand */
    g.fillStyle = '#160d1d';
    g.beginPath();
    g.ellipse(0.162, 0.230, 0.015, 0.019, -0.3, 0, TAU);
    g.fill();

    /* --- fan --- */
    drawFan(g);

    /* --- hair: bun, strands, hairpin, earring --- */
    var hairFill = g.createLinearGradient(-0.08, 0, 0.06, 0.22);
    hairFill.addColorStop(0, '#050208');
    hairFill.addColorStop(0.55, '#0b0412');
    hairFill.addColorStop(1, '#08030d');
    fillCR(g, HAIR, hairFill);
    fillCR(g, BANG, hairFill);

    /* bun behind the head */
    g.fillStyle = '#07030c';
    g.beginPath();
    g.ellipse(-0.058, 0.082, 0.033, 0.028, -0.30, 0, TAU);
    g.fill();
    g.beginPath();
    g.ellipse(-0.038, 0.044, 0.021, 0.016, -0.5, 0, TAU);
    g.fill();
    g.strokeStyle = 'rgba(255,61,110,0.8)';
    g.lineWidth = 0.0036;
    g.beginPath();
    g.ellipse(-0.058, 0.082, 0.033, 0.028, -0.30, 0.5, 4.6);
    g.stroke();
    g.strokeStyle = 'rgba(255,120,160,0.32)';
    g.lineWidth = 0.0018;
    g.beginPath();
    g.ellipse(-0.058, 0.082, 0.019, 0.015, -0.30, 0.4, 4.9);
    g.stroke();
    lineCR(g, HAIR_RIM, 'rgba(255,61,110,0.26)', 0.018, 1);
    lineCR(g, HAIR_RIM, 'rgba(255,128,165,0.72)', 0.0034, 1);
    g.strokeStyle = 'rgba(160,240,255,0.45)';
    g.lineWidth = 0.0030;
    g.beginPath();
    g.moveTo(0.030, 0.016);
    g.bezierCurveTo(0.006, 0.000, -0.020, 0.000, -0.034, 0.016);
    g.stroke();

    /* two loose strands */
    var si;
    for (si = 0; si < STRANDS.length; si++) {
      lineCR(g, STRANDS[si], 'rgba(255,90,140,0.34)', 0.0045, 1);
      lineCR(g, STRANDS[si], 'rgba(255,170,200,0.22)', 0.0016, 1);
    }

    /* hairpin through the bun */
    blitGlowUnit(g, S.glowPink, -0.106, 0.046, 0.16, 0.75);
    g.strokeStyle = 'rgba(255,222,172,0.95)';
    g.lineWidth = 0.0046;
    g.beginPath();
    g.moveTo(-0.024, 0.126);
    g.lineTo(-0.104, 0.048);
    g.stroke();
    g.fillStyle = 'rgba(255,248,224,1)';
    g.beginPath();
    g.arc(-0.106, 0.046, 0.0080, 0, TAU);
    g.fill();

    /* earring */
    blitGlowUnit(g, S.glowCyan, 0.032, 0.152, 0.075, 0.65);
    g.strokeStyle = 'rgba(232,254,255,0.9)';
    g.lineWidth = 0.0024;
    g.beginPath();
    g.moveTo(0.030, 0.140);
    g.lineTo(0.032, 0.154);
    g.stroke();

    g.restore();
  }

  function blitGlowUnit(g, sprite, u, v, size, alpha) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = alpha;
    g.drawImage(sprite, u - size * 0.5, v - size * 0.5, size, size);
    g.restore();
  }

  /* ---------------------------------------------------------- dynamic bits */

  function initActors() {
    var defs = [
      { x: 0.778, y: 0.238, r: 0.058, ph: 0.0, pace: 0.44 },
      { x: 0.700, y: 0.402, r: 0.044, ph: 2.1, pace: 0.58 }
    ];
    lanterns.length = 0;
    var i, d, spr = S.lantern, kr;
    for (i = 0; i < defs.length; i++) {
      d = defs[i];
      kr = (d.r * H) / spr._RC;
      lanterns.push({
        bx: W * d.x,
        by: H * d.y,
        r: d.r * H,
        k: kr,
        pivotY: H * d.y - spr._bodyDy * kr,
        ph: d.ph,
        pace: d.pace,
        glow: 0.6
      });
    }

    joints.length = 0;
    var jd;
    for (i = 0; i < JOINT_DEF.length; i++) {
      jd = JOINT_DEF[i];
      joints.push({
        x: L.ox + jd.u * L.unit,
        y: L.oy + jd.v * L.unit,
        r: jd.r * L.unit,
        spin: jd.spin,
        ph: jd.ph
      });
    }

    glints.length = 0;
    glints.push({ x: L.ox - 0.106 * L.unit, y: L.oy + 0.046 * L.unit,
      s: 0.12 * L.unit, ph: 0.0, sp: 1.6, spr: 'glowPink', a: 0.66 });
    glints.push({ x: L.ox + 0.032 * L.unit, y: L.oy + 0.152 * L.unit,
      s: 0.08 * L.unit, ph: 2.2, sp: 1.1, spr: 'glowCyan', a: 0.56 });

    initPetals();
    initMotes();
  }

  function newPetal(spread) {
    return {
      x: rand(W * 0.02, W * 0.99),
      y: spread ? rand(-H * 0.05, H * 1.0) : rand(-H * 0.12, -H * 0.02),
      vy: rand(H * 0.020, H * 0.058),
      sway: rand(W * 0.008, W * 0.032),
      freq: rand(0.30, 0.80),
      ph: rand(0, TAU),
      rot: rand(0, TAU),
      rotv: rand(-1.2, 1.2),
      s: rand(0.55, 1.30),
      a: rand(0.5, 0.8)
    };
  }

  function initPetals() {
    petals.length = 0;
    var n = Math.round(Math.min(30, Math.max(20, W * H / 90000)));
    var i;
    for (i = 0; i < n; i++) { petals.push(newPetal(true)); }
  }

  function initMotes() {
    motes.length = 0;
    var n = 16, i;
    for (i = 0; i < n; i++) {
      motes.push({
        x: rand(0, W),
        y: rand(H * 0.20, H * 1.02),
        vy: rand(-H * 0.010, -H * 0.030),
        s: rand(H * 0.012, H * 0.032),
        a: rand(0.06, 0.18),
        ph: rand(0, TAU),
        f: rand(0.25, 0.9),
        warm: Math.random() < 0.42
      });
    }
  }

  /* ------------------------------------------------------------ per frame */

  function drawLanterns(g) {
    var i, o, ang, k, sw, sh, spr = S.lantern, gx, gy, dy;
    for (i = 0; i < lanterns.length; i++) {
      o = lanterns[i];
      ang = Math.sin(t * o.pace + o.ph) * 3 * (Math.PI / 180);
      o.glow = 0.62 + 0.30 * (0.5 + 0.5 * Math.sin(t * 1.25 + o.ph));

      dy = o.by - o.pivotY;
      gx = o.bx + Math.sin(ang) * dy;
      gy = o.pivotY + Math.cos(ang) * dy;

      blitGlow(g, S.glowWarm, gx, gy, o.r * 6.0, 0.44 * o.glow);
      blitGlow(g, S.glowRed, gx, gy, o.r * 3.0, 0.30 * o.glow);

      k = o.k;
      sw = spr.width * k;
      sh = spr.height * k;
      g.save();
      g.translate(o.bx, o.pivotY);
      g.rotate(ang);
      g.drawImage(spr, -spr._pivotX * k, -spr._pivotY * k, sw, sh);
      g.restore();
    }
  }

  function drawJoints(g) {
    var i, o, ang, d, s = S.ring;
    for (i = 0; i < joints.length; i++) {
      o = joints[i];
      ang = t * o.spin + o.ph;
      d = o.r * 2.5;
      blitGlow(g, S.glowCyan, o.x, o.y, o.r * 4.6,
        0.18 + 0.10 * (0.5 + 0.5 * Math.sin(t * 1.7 + o.ph)));
      g.save();
      g.translate(o.x, o.y);
      g.rotate(ang);
      g.drawImage(s, -d * 0.5, -d * 0.5, d, d);
      g.restore();
    }
  }

  function drawPetals(g, dt) {
    var i, o, w, h, sway;
    for (i = 0; i < petals.length; i++) {
      o = petals[i];
      o.y += o.vy * dt;
      o.rot += o.rotv * dt;
      if (o.y > H * 1.06) {
        o.y = rand(-H * 0.10, -H * 0.02);
        o.x = rand(W * 0.02, W * 0.99);
        o.s = rand(0.55, 1.30);
        o.a = rand(0.5, 0.8);
      }
      sway = Math.sin(t * o.freq + o.ph) * o.sway;
      h = H * 0.040 * o.s;
      w = h * 0.75;
      g.save();
      g.globalAlpha = o.a * (0.82 + 0.18 * Math.sin(t * o.freq * 1.7 + o.ph));
      g.translate(o.x + sway, o.y);
      g.rotate(o.rot);
      g.drawImage(S.petal, -w * 0.5, -h * 0.5, w, h);
      g.restore();
    }
    g.globalAlpha = 1;
  }

  function drawMotes(g, dt) {
    var i, o;
    for (i = 0; i < motes.length; i++) {
      o = motes[i];
      o.y += o.vy * dt;
      o.x += Math.sin(t * o.f * 0.8 + o.ph) * 6 * dt;
      if (o.y < -H * 0.05) {
        o.y = H * 1.05;
        o.x = rand(0, W);
      }
      blitGlow(g, o.warm ? S.glowWarm : S.glowCyan, o.x, o.y, o.s,
        o.a * (0.5 + 0.5 * Math.sin(t * o.f + o.ph)));
    }
  }

  function drawGlints(g) {
    var i, o;
    for (i = 0; i < glints.length; i++) {
      o = glints[i];
      blitGlow(g, S[o.spr], o.x, o.y, o.s,
        o.a * (0.45 + 0.55 * Math.abs(Math.sin(t * o.sp + o.ph))));
    }
  }

  function render(dt) {
    var z = 1 + 0.02 * (0.5 - 0.5 * Math.cos(TAU * t / 30));
    var cx = W * 0.46, cy = H * 0.54;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(z, z);
    ctx.translate(-cx, -cy);

    if (bg) { ctx.drawImage(bg, 0, 0, W, H); }
    drawLanterns(ctx);
    drawJoints(ctx);
    drawMotes(ctx, dt);
    drawPetals(ctx, dt);
    drawGlints(ctx);

    ctx.restore();

    /* host exit button lives in the top right: keep that corner dark */
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
    if (!S.ring) { buildSprites(); }
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
