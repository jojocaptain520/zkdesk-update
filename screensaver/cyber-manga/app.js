/* Cyber Manga screensaver
 * Comic panel page: skewed panels + halftone tone + speed lines + speech
 * bubbles, main panel is a girl's profile line drawing, ink/paper base with
 * cyan + magenta neon clash.
 *
 * Everything is pre-rendered into offscreen canvases on layout()/resize.
 * The frame loop only does drawImage / alpha / clip / one fillRect flash, so
 * no shadowBlur, createRadialGradient, getImageData or fillText per frame.
 */
(function () {
  'use strict';

  var canvas = document.getElementById('scene');
  var ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) { return; }

  var MAX_DPR = 1.5;
  var PAPER = '#f2eee6';
  var INK = '#0a0a0c';
  var CYAN = '#35e6ff';
  var MAGENTA = '#ff3ea5';
  var GREY = '#d8d2c6';
  var FONT = '"Microsoft YaHei UI","Microsoft YaHei","PingFang SC","Segoe UI",sans-serif';

  var W = 1;              /* css px */
  var H = 1;
  var dpr = 1;
  var rafId = 0;
  var last = 0;
  var t = 0;
  var resizeTimer = 0;
  var focusEase = [1, 0, 0];
  var FOCUS_SEC = 6;
  var lastDt = 1 / 60;

  var pageCv = null;
  var dotCv = null;
  var dotW = 1;
  var dotH = 1;
  var grainCv = null;
  var panels = [];
  var toneTile = null;    /* 4px halftone tile, ink */
  var skyTile = null;     /* 6px halftone tile, cyan */

  /* ---------------------------------------------------------------- utils */

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  function mkCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * dpr));
    c.height = Math.max(1, Math.round(h * dpr));
    return c;
  }

  function ctxOf(c) {
    var g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return g;
  }

  /* deterministic prng so the city does not shuffle on every resize */
  function rngOf(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  /* halftone tile: staggered dots => 45 degree lattice, drawn in device px */
  function makeTile(spacing, radius, color, ratio) {
    var d = Math.max(2, Math.round(spacing * dpr));
    var c = document.createElement('canvas');
    c.width = d;
    c.height = d;
    var g = c.getContext('2d');
    g.fillStyle = color;
    var r = Math.max(0.5, radius * dpr);
    g.beginPath();
    g.arc(d * 0.25, d * 0.25, r, 0, 6.2832);
    g.fill();
    g.beginPath();
    g.arc(d * 0.75, d * 0.75, r * (ratio || 1), 0, 6.2832);
    g.fill();
    return c;
  }

  /* pattern that keeps the tile pixel exact under the dpr transform */
  function tilePattern(g, tile) {
    var p = g.createPattern(tile, 'repeat');
    if (p && p.setTransform && typeof DOMMatrix === 'function') {
      try { p.setTransform(new DOMMatrix([1 / dpr, 0, 0, 1 / dpr, 0, 0])); } catch (e) { /* ignore */ }
    }
    return p;
  }

  function runPath(p2, segs) {
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i];
      if (s[0] === 'M') { p2.moveTo(s[1], s[2]); }
      else if (s[0] === 'L') { p2.lineTo(s[1], s[2]); }
      else if (s[0] === 'C') { p2.bezierCurveTo(s[1], s[2], s[3], s[4], s[5], s[6]); }
      else if (s[0] === 'Q') { p2.quadraticCurveTo(s[1], s[2], s[3], s[4]); }
      else { p2.closePath(); }
    }
    return p2;
  }

  /* polygon (in the face unit space) -> page of the panel canvas */
  function facePoly(mtx, pts) {
    var p2 = new Path2D();
    for (var i = 0; i < pts.length; i++) {
      var x = mtx[0] * pts[i][0] + mtx[2] * pts[i][1] + mtx[4];
      var y = mtx[1] * pts[i][0] + mtx[3] * pts[i][1] + mtx[5];
      if (i === 0) { p2.moveTo(x, y); } else { p2.lineTo(x, y); }
    }
    p2.closePath();
    return p2;
  }

  /* soft neon stroke without relying on shadowBlur support */
  function neonStroke(g, p2, width, color, alphaCore) {
    g.save();
    g.lineJoin = 'miter';
    g.lineCap = 'butt';
    g.strokeStyle = color;
    g.globalAlpha = 0.09;
    g.lineWidth = width * 6.0;
    g.stroke(p2);
    g.globalAlpha = 0.15;
    g.lineWidth = width * 3.2;
    g.stroke(p2);
    g.globalAlpha = 0.33;
    g.lineWidth = width * 1.7;
    g.stroke(p2);
    g.globalAlpha = alphaCore;
    g.lineWidth = width;
    g.stroke(p2);
    g.restore();
  }

  /* =========================================================== GEOMETRY == */

  /* panels as parallelograms: corner + U (top edge) + V (left edge), all in
   * fractions of the viewport, so the layout scales with any window. */
  var PANEL_DEF = [
    /* main panel: girl profile, top left, about 62% x 70% */
    { tl: [0.030, 0.196], u: [0.614, -0.044], v: [-0.016, 0.652] },
    /* small panel: neon city, top right */
    { tl: [0.676, 0.190], u: [0.308, -0.020], v: [-0.014, 0.272] },
    /* small panel: eye / hair close up, bottom right */
    { tl: [0.670, 0.502], u: [0.310, -0.020], v: [-0.016, 0.402] }
  ];

  function buildPanels() {
    panels = [];
    var m = Math.min(W, H);
    for (var i = 0; i < PANEL_DEF.length; i++) {
      var d = PANEL_DEF[i];
      var tl = { x: d.tl[0] * W, y: d.tl[1] * H };
      var u = { x: d.u[0] * W, y: d.u[1] * H };
      var v = { x: d.v[0] * W, y: d.v[1] * H };
      var tr = { x: tl.x + u.x, y: tl.y + u.y };
      var bl = { x: tl.x + v.x, y: tl.y + v.y };
      var br = { x: tr.x + v.x, y: tr.y + v.y };
      var bw = Math.sqrt(u.x * u.x + u.y * u.y);
      var bh = Math.sqrt(v.x * v.x + v.y * v.y);

      var p = {
        index: i,
        tl: tl, u: u, v: v, bw: bw, bh: bh,
        mtx: [u.x / bw, u.y / bw, v.x / bh, v.y / bh, tl.x, tl.y],
        bbox: {
          x: Math.min(tl.x, tr.x, bl.x, br.x),
          y: Math.min(tl.y, tr.y, bl.y, br.y),
          w: Math.max(tl.x, tr.x, bl.x, br.x) - Math.min(tl.x, tr.x, bl.x, br.x),
          h: Math.max(tl.y, tr.y, bl.y, br.y) - Math.min(tl.y, tr.y, bl.y, br.y)
        }
      };
      p.path = new Path2D();
      p.path.moveTo(tl.x, tl.y);
      p.path.lineTo(tr.x, tr.y);
      p.path.lineTo(br.x, br.y);
      p.path.lineTo(bl.x, bl.y);
      p.path.closePath();

      p.content = mkCanvas(bw, bh);
      var g = ctxOf(p.content);
      if (i === 0) {
        paintFaceBase(g, bw, bh);
        p.base = p.content;
        p.content = mkCanvas(bw, bh);
        paintGirl(ctxOf(p.content), bw, bh, m);
        p.hasBase = true;
      } else {
        if (i === 1) { paintCity(g, bw, bh); } else { paintEye(g, bw, bh); }
        p.hasBase = false;
      }
      buildChrome(p, m);
      panels.push(p);
    }
  }

  /* ===================================================== MAIN PANEL ART = */

  /* paper + halftone tone + radial speed lines behind the head */
  function paintFaceBase(g, bw, bh) {
    var m = Math.min(W, H);
    g.fillStyle = PAPER;
    g.fillRect(0, 0, bw, bh);

    /* tone wedge at the left edge */
    g.save();
    g.globalAlpha = 0.55;
    g.fillStyle = tilePattern(g, toneTile);
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(bw * 0.24, 0);
    g.bezierCurveTo(bw * 0.17, bh * 0.3, bw * 0.19, bh * 0.7, bw * 0.29, bh);
    g.lineTo(0, bh);
    g.closePath();
    g.fill();
    g.restore();

    /* radial speed lines */
    var cx = bw * 0.50;
    var cy = bh * 0.50;
    var R = Math.sqrt(bw * bw + bh * bh) * 0.62;
    var rnd = rngOf(0x9e37);
    var i, a, r0, w0, len;
    g.save();
    g.lineCap = 'butt';
    for (i = 0; i < 150; i++) {
      a = rnd() * 6.2832;
      r0 = R * (0.12 + rnd() * 0.32);
      len = R * (0.35 + rnd() * 0.9);
      w0 = (0.7 + rnd() * 2.0) * (m / 900);
      g.strokeStyle = 'rgba(10,10,12,' + (0.05 + rnd() * 0.16).toFixed(3) + ')';
      g.lineWidth = w0;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0 * 0.94);
      g.lineTo(cx + Math.cos(a) * (r0 + len), cy + Math.sin(a) * (r0 + len) * 0.94);
      g.stroke();
    }
    for (i = 0; i < 14; i++) {
      a = rnd() * 6.2832;
      r0 = R * (0.16 + rnd() * 0.26);
      len = R * (0.5 + rnd() * 0.8);
      g.strokeStyle = (i % 2 === 0) ? 'rgba(53,230,255,0.20)' : 'rgba(255,62,165,0.18)';
      g.lineWidth = (1.2 + rnd() * 1.8) * (m / 900);
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0 * 0.94);
      g.lineTo(cx + Math.cos(a) * (r0 + len), cy + Math.sin(a) * (r0 + len) * 0.94);
      g.stroke();
    }
    g.restore();
  }

  /* the girl: ink line profile, big black hair mass, paper highlight band.
   * local unit space: eye level = y 0, facing +x, head radius about 1.0 */
  function paintGirl(g, bw, bh, m) {
    var s = bh * 0.520;
    var ox = bw * 0.690 - 0.602 * s;
    var oy = bh * 0.500;
    var rot = -0.045;
    var cs = Math.cos(rot);
    var sn = Math.sin(rot);
    var lw = clamp(m * 0.0040, 2, 4);
    var mtx = [s * cs, s * sn, -s * sn, s * cs, ox, oy];
    var inkW = lw / s;

    function faceXf() {
      g.translate(ox, oy);
      g.rotate(rot);
      g.scale(s, s);
    }

    /* ---- silhouette: forehead -> nose -> lips -> chin -> throat -> nape */
    var FRONT = [
      ['M', 0.262, -0.878],
      ['C', 0.372, -0.796, 0.434, -0.664, 0.442, -0.520],
      ['C', 0.448, -0.436, 0.430, -0.376, 0.426, -0.316],
      ['C', 0.422, -0.262, 0.410, -0.222, 0.414, -0.176],
      ['C', 0.420, -0.110, 0.450, -0.048, 0.496, 0.020],
      ['C', 0.540, 0.088, 0.582, 0.122, 0.606, 0.142],
      ['L', 0.612, 0.158],
      ['C', 0.586, 0.174, 0.522, 0.182, 0.494, 0.180],
      ['C', 0.468, 0.179, 0.456, 0.192, 0.460, 0.214],
      ['C', 0.466, 0.240, 0.490, 0.252, 0.498, 0.270],
      ['C', 0.504, 0.288, 0.486, 0.300, 0.478, 0.312],
      ['C', 0.470, 0.330, 0.492, 0.344, 0.494, 0.362],
      ['C', 0.496, 0.384, 0.470, 0.398, 0.460, 0.416],
      ['C', 0.452, 0.440, 0.462, 0.470, 0.462, 0.492],
      ['C', 0.462, 0.526, 0.428, 0.566, 0.408, 0.590],
      ['C', 0.376, 0.644, 0.324, 0.702, 0.298, 0.766],
      ['C', 0.280, 0.810, 0.270, 0.882, 0.266, 0.964],
      ['L', 0.260, 1.900]
    ];
    var BACK = [
      ['L', -0.170, 1.900],
      ['L', -0.172, 0.980],
      ['C', -0.174, 0.860, -0.150, 0.790, -0.116, 0.742],
      ['C', -0.076, 0.688, -0.140, 0.642, -0.232, 0.612],
      ['C', -0.470, 0.598, -0.760, 0.522, -0.930, 0.374],
      ['C', -1.034, 0.140, -1.030, -0.402, -0.894, -0.742],
      ['C', -0.754, -1.012, -0.402, -1.064, -0.128, -1.012],
      ['C', 0.028, -0.980, 0.164, -0.932, 0.262, -0.878]
    ];

    var facePath = new Path2D();
    runPath(facePath, FRONT);
    runPath(facePath, BACK);
    facePath.closePath();

    var rimPath = new Path2D();
    runPath(rimPath, FRONT);

    /* ---- skin */
    g.save();
    faceXf();
    g.fillStyle = '#f9f5ee';
    g.fill(facePath);
    g.strokeStyle = INK;
    g.lineWidth = inkW;
    g.lineJoin = 'round';
    g.stroke(facePath);
    g.restore();

    /* ---- halftone shadow: cheek harm, under jaw, neck */
    var pat = tilePattern(g, toneTile);
    g.save();
    g.fillStyle = pat;
    g.globalAlpha = 0.60;
    g.fill(facePoly(mtx, [
      [0.470, 0.240], [0.446, 0.330], [0.410, 0.430], [0.372, 0.512],
      [0.316, 0.566], [0.252, 0.606], [0.228, 0.540], [0.292, 0.492],
      [0.348, 0.408], [0.396, 0.310], [0.430, 0.216]
    ]));
    g.fill(facePoly(mtx, [
      [0.116, 0.742], [0.262, 0.712], [0.294, 0.772], [0.286, 0.880],
      [0.186, 0.900], [0.128, 0.812]
    ]));
    g.fill(facePoly(mtx, [
      [0.238, 0.880], [0.272, 0.876], [0.266, 1.060], [0.248, 1.060]
    ]));
    g.restore();

    /* ---- features */
    g.save();
    faceXf();
    g.lineJoin = 'round';
    g.lineCap = 'round';

    /* brow */
    var brow = new Path2D();
    brow.moveTo(0.118, -0.252);
    brow.bezierCurveTo(0.206, -0.306, 0.322, -0.302, 0.420, -0.234);
    brow.bezierCurveTo(0.324, -0.274, 0.208, -0.274, 0.124, -0.226);
    brow.closePath();
    g.fillStyle = INK;
    g.fill(brow);

    /* sclera */
    var sclera = new Path2D();
    sclera.moveTo(0.412, -0.058);
    sclera.bezierCurveTo(0.354, -0.130, 0.278, -0.158, 0.208, -0.154);
    sclera.bezierCurveTo(0.164, -0.150, 0.132, -0.126, 0.114, -0.098);
    sclera.bezierCurveTo(0.158, -0.036, 0.250, -0.018, 0.318, -0.032);
    sclera.bezierCurveTo(0.368, -0.042, 0.394, -0.050, 0.412, -0.058);
    sclera.closePath();
    g.fillStyle = '#fffdf7';
    g.fill(sclera);

    /* iris, clipped inside the sclera */
    g.save();
    g.clip(sclera);
    g.beginPath();
    g.arc(0.312, -0.088, 0.060, 0, 6.2832);
    g.fillStyle = INK;
    g.fill();
    g.strokeStyle = 'rgba(53,230,255,0.90)';
    g.lineWidth = 0.013;
    g.stroke();
    g.beginPath();
    g.arc(0.312, -0.088, 0.034, 0, 6.2832);
    g.strokeStyle = 'rgba(255,62,165,0.60)';
    g.lineWidth = 0.010;
    g.stroke();
    g.beginPath();
    g.arc(0.294, -0.106, 0.017, 0, 6.2832);
    g.fillStyle = '#ffffff';
    g.fill();
    g.restore();

    /* upper lid: thick manga lash line */
    var lid = new Path2D();
    lid.moveTo(0.416, -0.054);
    lid.bezierCurveTo(0.358, -0.136, 0.280, -0.170, 0.208, -0.166);
    lid.bezierCurveTo(0.160, -0.162, 0.124, -0.134, 0.108, -0.102);
    g.strokeStyle = INK;
    g.lineWidth = 0.040;
    g.stroke(lid);

    /* three upper lashes */
    var lash1 = new Path2D();
    lash1.moveTo(0.134, -0.128);
    lash1.bezierCurveTo(0.112, -0.170, 0.098, -0.200, 0.088, -0.228);
    lash1.bezierCurveTo(0.108, -0.198, 0.122, -0.162, 0.142, -0.109);
    lash1.closePath();
    g.fill(lash1);
    var lash2 = new Path2D();
    lash2.moveTo(0.178, -0.158);
    lash2.bezierCurveTo(0.164, -0.196, 0.154, -0.226, 0.147, -0.250);
    lash2.bezierCurveTo(0.163, -0.220, 0.172, -0.186, 0.186, -0.144);
    lash2.closePath();
    g.fill(lash2);
    var lash3 = new Path2D();
    lash3.moveTo(0.222, -0.174);
    lash3.bezierCurveTo(0.212, -0.206, 0.204, -0.230, 0.198, -0.250);
    lash3.bezierCurveTo(0.212, -0.224, 0.220, -0.196, 0.232, -0.160);
    lash3.closePath();
    g.fill(lash3);

    /* lower lid */
    var low = new Path2D();
    low.moveTo(0.408, -0.052);
    low.bezierCurveTo(0.330, -0.012, 0.212, -0.010, 0.152, -0.068);
    g.strokeStyle = 'rgba(10,10,12,0.88)';
    g.lineWidth = 0.010;
    g.stroke(low);

    /* nose interior */
    g.strokeStyle = INK;
    var n1 = new Path2D();
    n1.moveTo(0.472, 0.180);
    n1.bezierCurveTo(0.502, 0.192, 0.526, 0.186, 0.542, 0.172);
    g.lineWidth = 0.013;
    g.stroke(n1);
    var n2 = new Path2D();
    n2.moveTo(0.462, 0.146);
    n2.lineTo(0.470, 0.180);
    g.lineWidth = 0.011;
    g.stroke(n2);
    var n3 = new Path2D();
    n3.moveTo(0.436, -0.054);
    n3.bezierCurveTo(0.442, 0.012, 0.452, 0.072, 0.470, 0.120);
    g.strokeStyle = 'rgba(10,10,12,0.34)';
    g.lineWidth = 0.010;
    g.stroke(n3);

    /* lip: magenta accent + short shadow under the lower lip */
    var lipLo = new Path2D();
    lipLo.moveTo(0.468, 0.334);
    lipLo.bezierCurveTo(0.484, 0.346, 0.492, 0.354, 0.490, 0.366);
    lipLo.bezierCurveTo(0.486, 0.386, 0.472, 0.396, 0.460, 0.390);
    lipLo.bezierCurveTo(0.454, 0.374, 0.456, 0.350, 0.468, 0.334);
    lipLo.closePath();
    g.fillStyle = 'rgba(255,62,165,0.82)';
    g.fill(lipLo);
    var lipLine = new Path2D();
    lipLine.moveTo(0.450, 0.310);
    lipLine.bezierCurveTo(0.470, 0.320, 0.484, 0.320, 0.494, 0.312);
    g.strokeStyle = 'rgba(150,16,84,0.95)';
    g.lineWidth = 0.014;
    g.stroke(lipLine);
    var lipShade = new Path2D();
    lipShade.moveTo(0.454, 0.400);
    lipShade.bezierCurveTo(0.470, 0.408, 0.482, 0.402, 0.487, 0.390);
    g.strokeStyle = 'rgba(10,10,12,0.50)';
    g.lineWidth = 0.011;
    g.stroke(lipShade);

    /* jaw line inside */
    var jaw = new Path2D();
    jaw.moveTo(0.412, 0.582);
    jaw.bezierCurveTo(0.336, 0.652, 0.236, 0.704, 0.124, 0.730);
    jaw.bezierCurveTo(0.024, 0.754, -0.082, 0.748, -0.160, 0.704);
    g.strokeStyle = 'rgba(10,10,12,0.92)';
    g.lineWidth = 0.014;
    g.stroke(jaw);

    /* neck tendon */
    var neck = new Path2D();
    neck.moveTo(0.310, 0.740);
    neck.bezierCurveTo(0.300, 0.840, 0.292, 0.940, 0.288, 1.040);
    g.strokeStyle = 'rgba(10,10,12,0.38)';
    g.lineWidth = 0.011;
    g.stroke(neck);

    /* cyber choker */
    var choker = new Path2D();
    choker.moveTo(-0.196, 0.782);
    choker.lineTo(0.304, 0.762);
    choker.lineTo(0.310, 0.858);
    choker.lineTo(-0.190, 0.878);
    choker.closePath();
    g.fillStyle = INK;
    g.fill(choker);
    var chokerLine = new Path2D();
    chokerLine.moveTo(-0.192, 0.796);
    chokerLine.lineTo(0.302, 0.776);
    g.strokeStyle = CYAN;
    g.lineWidth = 0.016;
    g.stroke(chokerLine);
    g.restore();

    /* ---- hair: back mass */
    var HAIR_SEGS = [
      ['M', 0.310, -0.890],
      ['C', 0.180, -0.946, 0.010, -0.962, -0.150, -0.946],
      ['C', -0.430, -0.988, -0.762, -0.930, -0.932, -0.760],
      ['C', -1.092, -0.600, -1.150, -0.300, -1.160, 0.040],
      ['C', -1.176, 0.400, -1.246, 0.760, -1.362, 1.060],
      ['C', -1.180, 1.020, -1.010, 0.882, -0.930, 0.700],
      ['C', -0.900, 1.020, -0.878, 1.360, -0.930, 1.900],
      ['L', -0.300, 1.900],
      ['C', -0.262, 1.460, -0.226, 1.040, -0.180, 0.740],
      ['C', -0.140, 0.500, -0.100, 0.300, -0.062, 0.140],
      ['C', -0.030, -0.060, 0.010, -0.300, 0.060, -0.500],
      ['C', 0.100, -0.662, 0.180, -0.800, 0.310, -0.890]
    ];
    var hairBack = runPath(new Path2D(), HAIR_SEGS);
    g.save();
    faceXf();
    g.fillStyle = INK;
    g.fill(hairBack);
    g.strokeStyle = INK;
    g.lineWidth = inkW * 0.6;
    g.stroke(hairBack);

    /* ---- bang: slender pointed locks over the forehead */
    var BANG_SEGS = [
      ['M', 0.474, -0.548],
      ['C', 0.456, -0.716, 0.402, -0.846, 0.300, -0.902],
      ['C', 0.170, -0.962, 0.010, -0.976, -0.072, -0.932],
      ['C', -0.078, -0.880, -0.050, -0.826, -0.016, -0.790],
      ['Q', -0.010, -0.560, 0.040, -0.430],
      ['Q', 0.070, -0.620, 0.120, -0.700],
      ['Q', 0.160, -0.500, 0.190, -0.380],
      ['Q', 0.226, -0.560, 0.268, -0.680],
      ['Q', 0.310, -0.520, 0.344, -0.420],
      ['Q', 0.386, -0.472, 0.430, -0.470],
      ['Q', 0.464, -0.514, 0.474, -0.548]
    ];
    var bang = runPath(new Path2D(), BANG_SEGS);
    bang.closePath();
    g.fill(bang);
    g.stroke(bang);

    /* thin side lock hanging in front of the ear */
    var lock = new Path2D();
    lock.moveTo(0.112, -0.740);
    lock.bezierCurveTo(0.060, -0.430, 0.038, -0.120, 0.030, 0.130);
    lock.bezierCurveTo(0.026, 0.240, 0.014, 0.310, -0.008, 0.372);
    lock.bezierCurveTo(-0.012, 0.290, -0.012, 0.210, -0.010, 0.120);
    lock.bezierCurveTo(-0.014, -0.140, 0.006, -0.440, 0.048, -0.744);
    lock.closePath();
    g.fill(lock);
    g.stroke(lock);
    g.restore();

    /* ---- paper highlight: one crescent band that follows the skull,
     *      clipped to the hair so it can never spill on the skin */
    var hairClip = new Path2D();
    runPath(hairClip, HAIR_SEGS);
    runPath(hairClip, BANG_SEGS);
    hairClip.closePath();

    var hcx = -0.055;
    var hcy = -0.070;
    var A0 = 198 * Math.PI / 180;
    var A1 = 292 * Math.PI / 180;
    var HN = 26;
    var cres = new Path2D();
    var i2, u2, aa, sv, ro, th, rad2, px, py;
    for (i2 = 0; i2 <= HN; i2++) {
      u2 = i2 / HN;
      aa = A0 + (A1 - A0) * u2;
      sv = Math.sin(Math.PI * u2);
      ro = 0.792 + 0.052 * sv;
      px = hcx + Math.cos(aa) * ro;
      py = hcy + Math.sin(aa) * ro;
      if (i2 === 0) { cres.moveTo(px, py); } else { cres.lineTo(px, py); }
    }
    for (i2 = HN; i2 >= 0; i2--) {
      u2 = i2 / HN;
      aa = A0 + (A1 - A0) * u2;
      sv = Math.sin(Math.PI * u2);
      ro = 0.792 + 0.052 * sv;
      th = (0.132 + 0.042 * sv) * Math.sqrt(Math.max(0, sv));
      rad2 = ro - th;
      cres.lineTo(hcx + Math.cos(aa) * rad2, hcy + Math.sin(aa) * rad2);
    }
    cres.closePath();
    g.save();
    faceXf();
    g.clip(hairClip);
    g.fillStyle = 'rgba(242,238,230,0.94)';
    g.fill(cres);
    g.restore();

    /* small highlight sliver on the bang */
    g.save();
    g.fillStyle = 'rgba(242,238,230,0.85)';
    g.fill(facePoly(mtx, [
      [0.352, -0.876], [0.404, -0.802], [0.372, -0.786], [0.330, -0.842]
    ]));
    g.restore();

    /* ---- cyan rim light along the profile edge */
    g.save();
    faceXf();
    g.lineJoin = 'round';
    g.strokeStyle = 'rgba(53,230,255,0.18)';
    g.lineWidth = inkW * 3.6;
    g.stroke(rimPath);
    g.strokeStyle = 'rgba(53,230,255,0.56)';
    g.lineWidth = inkW * 1.0;
    g.stroke(rimPath);
    g.restore();
  }

  /* ========================================================= CITY PANEL = */

  function paintCity(g, bw, bh) {
    var horizon = bh * 0.665;
    var sky = g.createLinearGradient(0, 0, 0, bh);
    sky.addColorStop(0, '#07070e');
    sky.addColorStop(0.52, '#0f0c18');
    sky.addColorStop(0.86, '#1b1330');
    sky.addColorStop(1, '#241838');
    g.fillStyle = sky;
    g.fillRect(0, 0, bw, bh);

    /* screen tone in the sky */
    g.save();
    g.globalAlpha = 0.20;
    g.fillStyle = tilePattern(g, skyTile);
    g.fillRect(0, 0, bw, horizon * 1.02);
    g.restore();

    /* magenta glow behind the skyline */
    var gl = g.createLinearGradient(0, horizon - bh * 0.34, 0, horizon + bh * 0.06);
    gl.addColorStop(0, 'rgba(255,62,165,0)');
    gl.addColorStop(0.62, 'rgba(255,62,165,0.20)');
    gl.addColorStop(1, 'rgba(255,62,165,0.05)');
    g.fillStyle = gl;
    g.fillRect(0, horizon - bh * 0.34, bw, bh * 0.40);

    var cg = g.createLinearGradient(0, horizon - bh * 0.2, 0, horizon + bh * 0.02);
    cg.addColorStop(0, 'rgba(53,230,255,0)');
    cg.addColorStop(1, 'rgba(53,230,255,0.30)');
    g.fillStyle = cg;
    g.fillRect(0, horizon - bh * 0.2, bw, bh * 0.22);

    /* buildings */
    var rnd = rngOf(0x51ce51);
    var x = -bw * 0.06;
    var winScale = Math.min(bw, bh) * 0.055;
    while (x < bw * 1.08) {
      var w0 = bw * (0.048 + rnd() * 0.105);
      var h0 = bh * (0.16 + rnd() * 0.44);
      var top = horizon - h0;
      g.fillStyle = '#06060b';
      g.fillRect(x, top, w0 + 1, bh - top);
      if (rnd() < 0.34) {
        g.fillRect(x + w0 * 0.45, top - bh * 0.06, Math.max(1, bw * 0.004), bh * 0.06);
        g.fillStyle = 'rgba(255,62,165,0.9)';
        g.fillRect(x + w0 * 0.45 - bw * 0.004, top - bh * 0.065, Math.max(2, bw * 0.012), Math.max(2, bh * 0.012));
      }
      var cols = Math.max(1, Math.floor(w0 / winScale));
      var rows = Math.max(1, Math.floor(h0 / winScale));
      var cw = (w0 * 0.62) / cols;
      var ch = (h0 * 0.72) / rows;
      for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
          if (rnd() < 0.46) { continue; }
          var k = rnd();
          g.fillStyle = k < 0.52 ? 'rgba(53,230,255,0.85)'
            : (k < 0.82 ? 'rgba(255,62,165,0.80)' : 'rgba(242,238,230,0.72)');
          g.fillRect(x + w0 * 0.19 + c * cw, top + h0 * 0.14 + r * ch, Math.max(1.2, cw * 0.52), Math.max(1.2, ch * 0.44));
        }
      }
      x += w0 + bw * 0.008;
    }

    /* neon signs */
    var signs = [
      { x: 0.10, y: 0.26, w: 0.030, h: 0.30, c: CYAN },
      { x: 0.42, y: 0.34, w: 0.024, h: 0.24, c: MAGENTA },
      { x: 0.66, y: 0.20, w: 0.032, h: 0.36, c: CYAN },
      { x: 0.86, y: 0.38, w: 0.022, h: 0.20, c: MAGENTA }
    ];
    for (var si = 0; si < signs.length; si++) {
      var sg = signs[si];
      var sx = sg.x * bw;
      var sy = sg.y * bh;
      var sw = Math.max(2, sg.w * bw);
      var sh = Math.max(6, sg.h * bh);
      g.save();
      g.shadowColor = sg.c;
      g.shadowBlur = Math.max(10, Math.min(bw, bh) * 0.10);
      g.fillStyle = sg.c;
      g.globalAlpha = 0.55;
      g.fillRect(sx, sy, sw, sh);
      g.restore();
      g.fillStyle = 'rgba(255,255,255,0.85)';
      g.fillRect(sx + sw * 0.34, sy + sh * 0.05, Math.max(1, sw * 0.32), sh * 0.9);
      g.fillStyle = 'rgba(10,10,12,0.9)';
      g.fillRect(sx - sw * 0.16, sy, Math.max(1, sw * 0.12), sh);
    }

    /* rain */
    var rr = rngOf(0x7a17);
    g.save();
    g.lineCap = 'butt';
    for (var i = 0; i < 90; i++) {
      var rx = rr() * bw;
      var ry = rr() * bh;
      var len = bh * (0.03 + rr() * 0.08);
      g.strokeStyle = rr() < 0.3 ? 'rgba(53,230,255,0.22)' : 'rgba(242,238,230,0.13)';
      g.lineWidth = Math.max(0.7, bw * 0.0022);
      g.beginPath();
      g.moveTo(rx, ry);
      g.lineTo(rx - len * 0.16, ry + len);
      g.stroke();
    }
    g.restore();

    /* wet street */
    g.fillStyle = '#04040a';
    g.fillRect(0, bh * 0.945, bw, bh * 0.055);
    var refl = g.createLinearGradient(0, bh * 0.86, 0, bh);
    refl.addColorStop(0, 'rgba(53,230,255,0.00)');
    refl.addColorStop(0.7, 'rgba(53,230,255,0.18)');
    refl.addColorStop(1, 'rgba(53,230,255,0.04)');
    g.fillStyle = refl;
    g.fillRect(0, bh * 0.86, bw, bh * 0.14);
  }

  /* ========================================================== EYE PANEL = */

  function paintEye(g, bw, bh) {
    var m = Math.min(bw, bh);
    g.fillStyle = '#08070d';
    g.fillRect(0, 0, bw, bh);

    g.save();
    g.globalAlpha = 0.26;
    g.fillStyle = tilePattern(g, skyTile);
    g.fillRect(0, 0, bw, bh);
    g.restore();

    var cg = g.createRadialGradient(bw * 0.52, bh * 0.44, 0, bw * 0.52, bh * 0.44, m * 0.95);
    cg.addColorStop(0, 'rgba(255,62,165,0.30)');
    cg.addColorStop(0.55, 'rgba(120,30,90,0.12)');
    cg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = cg;
    g.fillRect(0, 0, bw, bh);

    var ex = bw * 0.50;
    var ey = bh * 0.50;
    var ew = bw * 0.60;
    var eh = bh * 0.30;

    /* sclera */
    var sc = new Path2D();
    sc.moveTo(ex - ew * 0.5, ey + eh * 0.02);
    sc.bezierCurveTo(ex - ew * 0.34, ey - eh * 1.02, ex + ew * 0.30, ey - eh * 1.06, ex + ew * 0.5, ey - eh * 0.12);
    sc.bezierCurveTo(ex + ew * 0.34, ey + eh * 0.86, ex - ew * 0.30, ey + eh * 0.80, ex - ew * 0.5, ey + eh * 0.02);
    sc.closePath();
    g.fillStyle = '#f7f2e9';
    g.fill(sc);

    /* iris */
    var ir = m * 0.285;
    var icx = ex + ew * 0.04;
    var icy = ey + eh * 0.02;
    var ig = g.createLinearGradient(icx, icy - ir, icx, icy + ir);
    ig.addColorStop(0, '#0b1a22');
    ig.addColorStop(0.45, '#0a0a10');
    ig.addColorStop(1, '#2a1030');
    g.save();
    g.beginPath();
    g.arc(icx, icy, ir, 0, 6.2832);
    g.fillStyle = ig;
    g.fill();
    g.clip();
    g.globalAlpha = 0.30;
    g.fillStyle = tilePattern(g, skyTile);
    g.fillRect(icx - ir, icy - ir, ir * 2, ir * 2);
    g.restore();

    g.save();
    g.strokeStyle = 'rgba(53,230,255,0.92)';
    g.lineWidth = Math.max(2, m * 0.020);
    g.beginPath();
    g.arc(icx, icy, ir * 0.98, 0, 6.2832);
    g.stroke();
    g.strokeStyle = 'rgba(255,62,165,0.75)';
    g.lineWidth = Math.max(1.5, m * 0.013);
    g.beginPath();
    g.arc(icx, icy, ir * 0.70, 0.6, 3.4);
    g.stroke();
    g.restore();

    g.fillStyle = '#000000';
    g.beginPath();
    g.arc(icx, icy + ir * 0.05, ir * 0.38, 0, 6.2832);
    g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(icx - ir * 0.34, icy - ir * 0.38, ir * 0.16, 0, 6.2832);
    g.fill();
    g.globalAlpha = 0.70;
    g.beginPath();
    g.arc(icx + ir * 0.30, icy + ir * 0.42, ir * 0.08, 0, 6.2832);
    g.fill();
    g.globalAlpha = 1;

    /* upper lash mass */
    var lash = new Path2D();
    lash.moveTo(ex - ew * 0.56, ey - eh * 0.10);
    lash.bezierCurveTo(ex - ew * 0.40, ey - eh * 1.30, ex + ew * 0.34, ey - eh * 1.34, ex + ew * 0.58, ey - eh * 0.26);
    lash.bezierCurveTo(ex + ew * 0.36, ey - eh * 1.06, ex - ew * 0.34, ey - eh * 1.04, ex - ew * 0.44, ey - eh * 0.16);
    lash.closePath();
    g.fillStyle = INK;
    g.fill(lash);

    /* corner spikes */
    var spikes = [
      { x: ex - ew * 0.50, y: ey - eh * 0.16, dx: -0.26, dy: -0.34 },
      { x: ex - ew * 0.43, y: ey - eh * 0.36, dx: -0.20, dy: -0.44 },
      { x: ex - ew * 0.32, y: ey - eh * 0.54, dx: -0.12, dy: -0.46 }
    ];
    for (var i = 0; i < spikes.length; i++) {
      var sp = spikes[i];
      g.beginPath();
      g.moveTo(sp.x - ew * 0.09, sp.y + eh * 0.10);
      g.lineTo(sp.x + sp.dx * ew, sp.y + sp.dy * eh);
      g.lineTo(sp.x + ew * 0.09, sp.y - eh * 0.06);
      g.closePath();
      g.fill();
    }

    /* lower lash line */
    g.strokeStyle = INK;
    g.lineWidth = Math.max(2, m * 0.020);
    g.beginPath();
    g.moveTo(ex - ew * 0.52, ey + eh * 0.02);
    g.bezierCurveTo(ex - ew * 0.24, ey + eh * 0.86, ex + ew * 0.28, ey + eh * 0.82, ex + ew * 0.50, ey - eh * 0.10);
    g.stroke();

    /* foreground hair strands, tapered, ink with paper slivers */
    var rnd = rngOf(0x2c0f);
    for (var k = 0; k < 5; k++) {
      var y0 = bh * (0.04 + k * 0.215);
      var thick = bh * (0.048 + rnd() * 0.062);
      var bend = bh * (0.10 + rnd() * 0.20);
      var str = new Path2D();
      str.moveTo(-bw * 0.04, y0);
      str.bezierCurveTo(bw * 0.30, y0 - bend, bw * 0.55, y0 + bend * 0.6, bw * 1.04, y0 + bend * 0.22);
      str.lineTo(bw * 1.04, y0 + bend * 0.22 + thick * 0.55);
      str.bezierCurveTo(bw * 0.55, y0 + bend * 0.6 + thick, bw * 0.30, y0 - bend + thick, -bw * 0.04, y0 + thick);
      str.closePath();
      g.fillStyle = INK;
      g.fill(str);
      g.save();
      g.clip(str);
      g.strokeStyle = 'rgba(242,238,230,0.85)';
      g.lineWidth = Math.max(1.2, thick * 0.16);
      g.beginPath();
      g.moveTo(-bw * 0.04, y0 + thick * 0.34);
      g.bezierCurveTo(bw * 0.30, y0 - bend + thick * 0.34, bw * 0.55, y0 + bend * 0.6 + thick * 0.34, bw * 1.04, y0 + bend * 0.22 + thick * 0.32);
      g.stroke();
      g.restore();
    }

    var rim = g.createLinearGradient(0, bh * 0.84, 0, bh);
    rim.addColorStop(0, 'rgba(53,230,255,0)');
    rim.addColorStop(1, 'rgba(53,230,255,0.20)');
    g.fillStyle = rim;
    g.fillRect(0, bh * 0.84, bw, bh * 0.16);
  }

  /* ============================================================= CHROME == */

  function buildChrome(p, m) {
    var M = Math.max(24, m * 0.030);
    p.fx = p.bbox.x - M;
    p.fy = p.bbox.y - M;
    p.fw = p.bbox.w + M * 2;
    p.fh = p.bbox.h + M * 2;

    var border = clamp(m * 0.0115, 5, 20);
    var neon = Math.max(1.6, border * 0.34);

    p.chrome = mkCanvas(p.fw, p.fh);
    var g = ctxOf(p.chrome);
    g.translate(-p.fx, -p.fy);
    g.lineJoin = 'miter';
    g.lineCap = 'butt';
    g.strokeStyle = INK;
    g.lineWidth = border;
    g.stroke(p.path);
    g.strokeStyle = 'rgba(242,238,230,0.10)';
    g.lineWidth = border * 0.24;
    g.stroke(p.path);

    p.glow = mkCanvas(p.fw, p.fh);
    var g2 = ctxOf(p.glow);
    g2.translate(-p.fx, -p.fy);
    neonStroke(g2, p.path, neon, CYAN, 0.85);
    var top = new Path2D();
    top.moveTo(p.tl.x, p.tl.y);
    top.lineTo(p.tl.x + p.u.x, p.tl.y + p.u.y);
    neonStroke(g2, top, neon * 0.9, MAGENTA, 0.9);
  }

  /* ================================================================ PAGE = */

  function buildPage() {
    pageCv = mkCanvas(W, H);
    var g = ctxOf(pageCv);
    g.fillStyle = PAPER;
    g.fillRect(0, 0, W, H);

    /* ink header band: keeps the host exit button area (top right) dark */
    g.fillStyle = INK;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(W, 0);
    g.lineTo(W, H * 0.136);
    g.lineTo(0, H * 0.150);
    g.closePath();
    g.fill();
    g.fillStyle = MAGENTA;
    g.fillRect(0, H * 0.1495, W, Math.max(1, H * 0.0035));
    g.fillStyle = CYAN;
    g.fillRect(0, H * 0.1575, W * 0.42, Math.max(1, H * 0.0018));

    var fs = Math.min(H * 0.058, W * 0.030);
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    g.fillStyle = PAPER;
    g.font = '700 ' + fs.toFixed(1) + 'px ' + FONT;
    g.fillText('CYBER MANGA', W * 0.034, H * 0.070);
    var tw = g.measureText('CYBER MANGA').width;
    g.fillStyle = 'rgba(53,230,255,0.85)';
    g.font = '700 ' + (fs * 0.52).toFixed(1) + 'px ' + FONT;
    g.fillText('NO.01', W * 0.034 + tw + fs * 0.7, H * 0.074);
    g.fillStyle = 'rgba(242,238,230,0.55)';
    g.font = '400 ' + (fs * 0.52).toFixed(1) + 'px ' + FONT;
    g.fillText('\u5948\u7c73\u5c11\u5973', W * 0.034 + tw + fs * 2.55, H * 0.074);

    /* bottom ink hairline */
    g.fillStyle = 'rgba(10,10,12,0.92)';
    g.fillRect(0, H * 0.988, W, H * 0.012);
    g.fillStyle = CYAN;
    g.fillRect(0, H * 0.9855, W * 0.14, Math.max(1, H * 0.002));

    /* caption box, bottom right */
    var bw2 = W * 0.112;
    var bh2 = H * 0.038;
    var bx = W * 0.984 - bw2;
    var by = H * 0.988 - bh2 - H * 0.010;
    g.fillStyle = INK;
    g.fillRect(bx, by, bw2, bh2);
    g.strokeStyle = CYAN;
    g.lineWidth = Math.max(1.2, H * 0.0022);
    g.strokeRect(bx, by, bw2, bh2);
    g.fillStyle = CYAN;
    g.font = '700 ' + (bh2 * 0.56).toFixed(1) + 'px ' + FONT;
    g.textAlign = 'center';
    g.fillText('SIGNAL 98%', bx + bw2 * 0.5, by + bh2 * 0.54);
  }

  function buildDots() {
    dotW = W + 12;
    dotH = H + 12;
    dotCv = mkCanvas(dotW, dotH);
    var g = ctxOf(dotCv);
    g.fillStyle = tilePattern(g, toneTile);
    g.fillRect(0, 0, dotW, dotH);
  }

  function buildGrain() {
    grainCv = mkCanvas(W, H);
    var g = ctxOf(grainCv);

    var nw = 128;
    var noise = document.createElement('canvas');
    noise.width = Math.round(nw * dpr);
    noise.height = Math.round(nw * dpr);
    var ng = noise.getContext('2d');
    var img = ng.createImageData(noise.width, noise.height);
    var d = img.data;
    for (var i = 0; i < d.length; i += 4) {
      var v = Math.random();
      d[i] = 10; d[i + 1] = 10; d[i + 2] = 12;
      d[i + 3] = v < 0.55 ? 0 : Math.round(40 + v * 150);
    }
    ng.putImageData(img, 0, 0);
    var np = g.createPattern(noise, 'repeat');
    if (np && np.setTransform && typeof DOMMatrix === 'function') {
      try { np.setTransform(new DOMMatrix([1 / dpr, 0, 0, 1 / dpr, 0, 0])); } catch (e) { /* ignore */ }
    }
    g.globalAlpha = 0.05;
    g.fillStyle = np;
    g.fillRect(0, 0, W, H);
    g.globalAlpha = 1;

    var rg = g.createRadialGradient(W * 0.46, H * 0.46, Math.min(W, H) * 0.20, W * 0.5, H * 0.5, Math.max(W, H) * 0.80);
    rg.addColorStop(0, 'rgba(10,10,12,0)');
    rg.addColorStop(0.52, 'rgba(10,10,12,0.09)');
    rg.addColorStop(1, 'rgba(10,10,12,0.44)');
    g.fillStyle = rg;
    g.fillRect(0, 0, W, H);

    /* speech bubbles ride on the same static layer (grain first, bubbles on
     * top => identical z-order to two separate passes, one blit less) */
    buildBubbles(g);
  }

  /* ============================================================= BUBBLES = */

  function drawBubble(g, cx, cy, rx, ry, tip, text, fs, lw) {
    var ang = Math.atan2((tip.y - cy) / ry, (tip.x - cx) / rx);
    var d = 0.30;
    g.beginPath();
    g.ellipse(cx, cy, rx, ry, 0, ang + d, ang - d + 6.283185307, false);
    g.lineTo(tip.x, tip.y);
    g.closePath();
    g.fillStyle = '#fbf8f2';
    g.fill();
    g.lineJoin = 'round';
    g.strokeStyle = INK;
    g.lineWidth = lw;
    g.stroke();
    g.lineWidth = lw * 0.55;
    g.stroke();

    g.fillStyle = INK;
    g.font = '700 ' + fs.toFixed(1) + 'px ' + FONT;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, cx, cy + fs * 0.04);
  }

  function buildBubbles(g) {
    var m = Math.min(W, H);
    var lw = clamp(m * 0.0046, 2, 6);

    /* bubble 1: connection established, tail down to her forehead */
    drawBubble(g, W * 0.497, H * 0.184, W * 0.103, H * 0.055,
      { x: W * 0.430, y: H * 0.320 },
      '\u8fde\u63a5\u5df2\u5efa\u7acb', Math.min(H * 0.055 * 0.80, W * 0.0225), lw);

    /* bubble 2: heart rate synced, tail up to her shoulder */
    drawBubble(g, W * 0.208, H * 0.884, W * 0.070, H * 0.046,
      { x: W * 0.170, y: H * 0.808 },
      '\u5fc3\u8df3\u540c\u6b65', Math.min(H * 0.046 * 0.82, W * 0.0165), lw * 0.85);
  }

  /* ================================================================ DRAW = */

  function layout() {
    dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    W = Math.max(320, Math.floor(window.innerWidth));
    H = Math.max(240, Math.floor(window.innerHeight));
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    toneTile = makeTile(4, 0.95, 'rgba(10,10,12,0.92)', 1);
    skyTile = makeTile(6, 1.15, 'rgba(53,230,255,0.75)', 0.85);

    buildPage();
    buildDots();
    buildGrain();
    buildPanels();

    focusEase[0] = 1; focusEase[1] = 0; focusEase[2] = 0;
    t = 0;
    last = 0;
  }

  function drawPanels(dt) {
    var m = Math.min(W, H);
    var off = m * 0.0035;
    var speedScale = 1 + 0.018 * Math.sin(t * 0.5);

    var cycle = t % (FOCUS_SEC * 3);
    var fi = Math.floor(cycle / FOCUS_SEC);
    for (var i = 0; i < 3; i++) {
      var target = (i === fi) ? 1 : 0;
      var k = focusEase[i];
      k += (target - k) * Math.min(1, dt * 9);
      if (k < 0.001) { k = 0; }
      focusEase[i] = k;
    }

    for (var pi = 0; pi < panels.length; pi++) {
      var p = panels[pi];
      var f = focusEase[pi];
      var dx = off * f * (pi === 0 ? -1 : (pi === 1 ? 1 : 0.85));
      var dy = off * f * (pi === 0 ? -1 : (pi === 1 ? -0.6 : 0.85));

      ctx.save();
      ctx.translate(dx, dy);
      ctx.beginPath();
      ctx.clip(p.path);

      if (p.hasBase) {
        ctx.fillStyle = PAPER;
        ctx.fillRect(p.bbox.x - 2, p.bbox.y - 2, p.bbox.w + 4, p.bbox.h + 4);
      }
      ctx.save();
      ctx.transform(p.mtx[0], p.mtx[1], p.mtx[2], p.mtx[3], p.mtx[4], p.mtx[5]);
      if (p.hasBase) {
        var bx = p.bw * 0.50;
        var by = p.bh * 0.50;
        ctx.drawImage(p.base, bx - bx * speedScale, by - by * speedScale, p.bw * speedScale, p.bh * speedScale);
      }
      ctx.drawImage(p.content, 0, 0, p.bw, p.bh);
      ctx.restore();

      var veil = 0.18 * (1 - f);
      if (veil > 0.004) {
        ctx.fillStyle = 'rgba(10,10,12,' + veil.toFixed(3) + ')';
        ctx.fillRect(p.bbox.x - 4, p.bbox.y - 4, p.bbox.w + 8, p.bbox.h + 8);
      }
      ctx.restore();

      /* ink border + neon glow */
      ctx.save();
      ctx.translate(dx, dy);
      ctx.drawImage(p.chrome, p.fx, p.fy, p.fw, p.fh);
      ctx.globalAlpha = 0.34 + 0.66 * f;
      ctx.drawImage(p.glow, p.fx, p.fy, p.fw, p.fh);
      if (f > 0.02) {
        ctx.globalAlpha = 0.55 * f;
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(p.glow, p.fx, p.fy, p.fw, p.fh);
      }
      ctx.restore();
    }
  }

  function draw() {
    var jk = clamp(Math.min(W, H) / 900, 0.6, 1.8);
    var jx = (Math.sin(t * 29.3) * 0.75 + Math.sin(t * 7.1) * 0.35) * jk;
    var jy = (Math.cos(t * 23.7) * 0.65 + Math.sin(t * 11.3) * 0.30) * jk;

    var dotOff = (t * 0.5) % 8;

    var fc = t % 12;
    var flash = fc < 0.06 ? 0.12 * Math.sin(Math.PI * fc / 0.06) : 0;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.translate(jx, jy);
    ctx.drawImage(pageCv, 0, 0, W, H);
    ctx.drawImage(dotCv, -dotOff, -dotOff, dotW, dotH);

    drawPanels(lastDt);

    ctx.drawImage(grainCv, 0, 0, W, H);

    if (flash > 0.001) {
      ctx.fillStyle = 'rgba(255,255,255,' + flash.toFixed(3) + ')';
      ctx.fillRect(-6, -6, W + 12, H + 12);
    }
    ctx.restore();
  }

  /* ============================================================== LOOP == */

  function frame(ts) {
    rafId = window.requestAnimationFrame(frame);
    if (!last) { last = ts; return; }
    var dt = (ts - last) / 1000;
    last = ts;
    if (dt <= 0) { return; }
    if (dt > 0.1) { dt = 0.1; }
    lastDt = dt;
    t += dt;
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
      layout();
      draw();
    }, 120);
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { stop(); } else { start(); }
  });

  layout();
  draw();
  start();
}());
