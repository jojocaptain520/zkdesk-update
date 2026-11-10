/* Star Sea Manga screensaver
 * High key comic page: paper white base, pale blue halftone, three skewed
 * panels with light frames, a girl profile gazing at the stars (line art in
 * deep blue grey, light blue-grey hair), twinkling stars and meteors.
 *
 * Everything is pre-rendered into offscreen canvases on layout()/resize.
 * The frame loop only does drawImage / clip / globalAlpha, so no shadowBlur,
 * createRadialGradient, getImageData or fillText happen per frame.
 */
(function () {
  'use strict';

  var canvas = document.getElementById('scene');
  var ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) { return; }

  var MAX_DPR = 1.5;
  var PAPER = '#fdfaf3';
  var LINE = '#33405a';
  var PALE = '#cfe0f4';        /* pale blue tone dots on the page */
  var CYAN = '#8ee6f2';
  var PINK = '#ffb8d2';
  var FONT = '"Microsoft YaHei UI","Microsoft YaHei","PingFang SC","Segoe UI",sans-serif';

  var W = 1;                   /* css px */
  var H = 1;
  var dpr = 1;
  var rafId = 0;
  var last = 0;
  var t = 0;
  var resizeTimer = 0;
  var focusEase = [1, 0, 0];
  var FOCUS_SEC = 6.5;
  var lastDt = 1 / 60;

  var pageCv = null;
  var dotCv = null;
  var dotW = 1;
  var dotH = 1;
  var grainCv = null;
  var panels = [];
  var toneTile = null;         /* 4px halftone, blue grey */
  var pageDotTile = null;      /* 8px halftone, pale blue */
  var sparkBig = null;
  var sparkMid = null;
  var sparkPink = null;

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

  function rngOf(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function makeTile(spacing, radius, color, ratio) {
    var d = Math.max(2, Math.round(spacing * dpr));
    var c = document.createElement('canvas');
    c.width = d;
    c.height = d;
    var g = c.getContext('2d');
    g.fillStyle = color;
    var r = Math.max(0.4, radius * dpr);
    g.beginPath();
    g.arc(d * 0.25, d * 0.25, r, 0, 6.2832);
    g.fill();
    g.beginPath();
    g.arc(d * 0.75, d * 0.75, r * (ratio || 1), 0, 6.2832);
    g.fill();
    return c;
  }

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

  /* transform a unit-space path description into panel-space Path2D */
  function xfPath(segs, mtx, out) {
    var p2 = out || new Path2D();
    function P(x, y) {
      return [mtx[0] * x + mtx[2] * y + mtx[4], mtx[1] * x + mtx[3] * y + mtx[5]];
    }
    var a, b, c, i;
    for (i = 0; i < segs.length; i++) {
      var s = segs[i];
      if (s[0] === 'M') { a = P(s[1], s[2]); p2.moveTo(a[0], a[1]); }
      else if (s[0] === 'L') { a = P(s[1], s[2]); p2.lineTo(a[0], a[1]); }
      else if (s[0] === 'C') {
        a = P(s[1], s[2]); b = P(s[3], s[4]); c = P(s[5], s[6]);
        p2.bezierCurveTo(a[0], a[1], b[0], b[1], c[0], c[1]);
      } else if (s[0] === 'Q') {
        a = P(s[1], s[2]); b = P(s[3], s[4]);
        p2.quadraticCurveTo(a[0], a[1], b[0], b[1]);
      } else { p2.closePath(); }
    }
    return p2;
  }

  /* soft neon stroke using stacked translucent passes (no shadowBlur needed) */
  function neonStroke(g, p2, width, color, alphaCore) {
    g.save();
    g.lineJoin = 'miter';
    g.lineCap = 'butt';
    g.strokeStyle = color;
    g.globalAlpha = 0.07;
    g.lineWidth = width * 7.0;
    g.stroke(p2);
    g.globalAlpha = 0.13;
    g.lineWidth = width * 3.6;
    g.stroke(p2);
    g.globalAlpha = 0.26;
    g.lineWidth = width * 1.9;
    g.stroke(p2);
    g.globalAlpha = alphaCore;
    g.lineWidth = width;
    g.stroke(p2);
    g.restore();
  }

  function makeSparkle(px, core, halo) {
    var c = mkCanvas(px, px);
    var g = ctxOf(c);
    var r = px * 0.5;
    var rg = g.createRadialGradient(r, r, 0, r, r, r);
    rg.addColorStop(0, halo);
    rg.addColorStop(0.35, halo.replace(/[\d.]+\)$/, '0.16)'));
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, px, px);
    var w = px * 0.05;
    g.fillStyle = core;
    g.beginPath();
    g.moveTo(r, 0);
    g.quadraticCurveTo(r + w, r - w, px, r);
    g.quadraticCurveTo(r + w, r + w, r, px);
    g.quadraticCurveTo(r - w, r + w, 0, r);
    g.quadraticCurveTo(r - w, r - w, r, 0);
    g.fill();
    g.beginPath();
    g.arc(r, r, px * 0.05, 0, 6.2832);
    g.fillStyle = '#ffffff';
    g.fill();
    return c;
  }

  function makeMeteor(len, thick, tint) {
    var c = mkCanvas(len, thick);
    var g = ctxOf(c);
    var lg = g.createLinearGradient(0, 0, len, 0);
    lg.addColorStop(0, 'rgba(255,255,255,0)');
    lg.addColorStop(0.5, tint);
    lg.addColorStop(0.94, 'rgba(255,255,255,0.92)');
    lg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = lg;
    g.beginPath();
    g.moveTo(0, thick * 0.5);
    g.lineTo(len, thick * 0.18);
    g.lineTo(len, thick * 0.82);
    g.closePath();
    g.fill();
    var rg = g.createRadialGradient(len * 0.96, thick * 0.5, 0, len * 0.96, thick * 0.5, thick * 0.62);
    rg.addColorStop(0, 'rgba(255,255,255,1)');
    rg.addColorStop(0.42, 'rgba(220,242,255,0.8)');
    rg.addColorStop(1, 'rgba(200,235,255,0)');
    g.fillStyle = rg;
    g.fillRect(len * 0.58, 0, len * 0.42, thick);
    return c;
  }

  /* =========================================================== GEOMETRY == */

  var PANEL_DEF = [
    /* main panel: girl gazing at the stars, top left, about 62% x 70% */
    { tl: [0.030, 0.196], u: [0.614, -0.044], v: [-0.016, 0.652] },
    /* small panel: starry night sky with meteors, top right */
    { tl: [0.676, 0.190], u: [0.308, -0.020], v: [-0.014, 0.272] },
    /* small panel: light trails, bottom right */
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
        tw: [],
        meteors: [],
        bbox: null
      };
      var minX = Math.min(tl.x, tr.x, bl.x, br.x);
      var minY = Math.min(tl.y, tr.y, bl.y, br.y);
      p.bbox = {
        x: minX,
        y: minY,
        w: Math.max(tl.x, tr.x, bl.x, br.x) - minX,
        h: Math.max(tl.y, tr.y, bl.y, br.y) - minY
      };

      p.path = new Path2D();
      p.path.moveTo(tl.x, tl.y);
      p.path.lineTo(tr.x, tr.y);
      p.path.lineTo(br.x, br.y);
      p.path.lineTo(bl.x, bl.y);
      p.path.closePath();

      p.content = mkCanvas(bw, bh);
      var g = ctxOf(p.content);
      if (i === 0) { paintMain(g, bw, bh, m); }
      else if (i === 1) { paintNightSky(g, bw, bh, m); }
      else { paintTrails(g, bw, bh, m); }

      buildMotion(p, i);
      buildChrome(p, m);
      panels.push(p);
    }
  }

  /* ==================================================== ANIMATED PIECES = */

  function buildMotion(p, i) {
    var rnd = rngOf(0x51a7 + i * 977);
    var bw = p.bw;
    var bh = p.bh;
    var k, x, y, dx, dy, d, n;

    n = (i === 0) ? 16 : 22;
    for (k = 0; k < n; k++) {
      /* keep the main panel sparkles in its sky half, never on her face */
      for (var tries = 0; tries < 40; tries++) {
        x = bw * (0.06 + rnd() * 0.88);
        y = bh * (0.05 + rnd() * 0.90);
        if (i !== 0) { break; }
        dx = (x - bw * 0.30) / (bw * 0.32);
        dy = (y - bh * 0.34) / (bh * 0.44);
        if (dx * dx + dy * dy > 1.0) { break; }
      }
      var size = Math.min(bw, bh) * (0.030 + rnd() * 0.045);
      p.tw.push({
        x: x, y: y, s: size,
        spr: rnd() < 0.24 ? sparkPink : (rnd() < 0.55 ? sparkBig : sparkMid),
        ph: rnd() * 6.2832,
        spd: 0.7 + rnd() * 1.9,
        lo: 0.20 + rnd() * 0.35
      });
    }

    /* meteors: panel 1 gets two, panel 2 two */
    var mm = (i === 0) ? 0 : 2;
    for (k = 0; k < mm; k++) {
      var ang = 2.42 + rnd() * 0.30;                   /* down-left sweep */
      var len = Math.min(bw, bh) * (0.28 + rnd() * 0.18);
      var thick = len * 0.075;
      var sx = bw * (0.56 + rnd() * 0.42);
      var sy = bh * (0.02 + rnd() * 0.28);
      var dist = len * 3.6;
      p.meteors.push({
        x0: sx, y0: sy,
        x1: sx + Math.cos(ang) * dist,
        y1: sy + Math.sin(ang) * dist,
        ang: ang,
        len: len, thick: thick,
        spr: makeMeteor(len, thick, 'rgba(214,238,255,0.72)'),
        period: 4.5 + rnd() * 3.0,
        off: rnd(),
        dur: 0.10 + rnd() * 0.06
      });
    }
  }

  /* ======================================================= MAIN PANEL ART */

  function paintMain(g, bw, bh, m) {
    var sky = g.createLinearGradient(0, 0, 0, bh);
    sky.addColorStop(0, '#cfe0f6');
    sky.addColorStop(0.34, '#e4eefb');
    sky.addColorStop(0.68, '#f4f8fd');
    sky.addColorStop(1, '#fdfaf3');
    g.fillStyle = sky;
    g.fillRect(0, 0, bw, bh);

    /* pale blue screen tone over the upper sky */
    g.save();
    g.globalAlpha = 0.30;
    g.fillStyle = tilePattern(g, toneTile);
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(bw, 0);
    g.lineTo(bw, bh * 0.42);
    g.bezierCurveTo(bw * 0.66, bh * 0.52, bw * 0.34, bh * 0.36, 0, bh * 0.56);
    g.closePath();
    g.fill();
    g.restore();

    /* moon with a soft halo */
    var mx = bw * 0.805;
    var my = bh * 0.170;
    var mr = Math.min(bw, bh) * 0.098;
    var halo = g.createRadialGradient(mx, my, mr * 0.6, mx, my, mr * 4.2);
    halo.addColorStop(0, 'rgba(255,251,232,0.85)');
    halo.addColorStop(0.30, 'rgba(255,250,226,0.34)');
    halo.addColorStop(1, 'rgba(255,250,226,0)');
    g.fillStyle = halo;
    g.beginPath();
    g.arc(mx, my, mr * 4.2, 0, 6.2832);
    g.fill();

    /* light rays from the moon */
    g.save();
    g.translate(mx, my);
    var ra, rl;
    for (var i = 0; i < 14; i++) {
      ra = (i / 14) * 6.2832 + 0.11;
      rl = mr * (4.6 + (i % 3) * 1.4);
      g.fillStyle = (i % 2 === 0) ? 'rgba(255,255,255,0.16)' : 'rgba(214,236,255,0.13)';
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(Math.cos(ra - 0.055) * rl, Math.sin(ra - 0.055) * rl);
      g.lineTo(Math.cos(ra + 0.055) * rl, Math.sin(ra + 0.055) * rl);
      g.closePath();
      g.fill();
    }
    g.restore();

    g.fillStyle = '#fff7e2';
    g.beginPath();
    g.arc(mx, my, mr, 0, 6.2832);
    g.fill();
    g.strokeStyle = 'rgba(51,64,90,0.22)';
    g.lineWidth = Math.max(1, mr * 0.040);
    g.stroke();
    /* a couple of craters, very soft */
    g.fillStyle = 'rgba(214,224,238,0.55)';
    g.beginPath();
    g.arc(mx - mr * 0.30, my + mr * 0.24, mr * 0.20, 0, 6.2832);
    g.fill();
    g.beginPath();
    g.arc(mx + mr * 0.34, my - mr * 0.30, mr * 0.13, 0, 6.2832);
    g.fill();

    /* static star field */
    var rnd = rngOf(0x2ea1);
    var k, sx, sy, sz, sa;
    for (k = 0; k < 150; k++) {
      sx = rnd() * bw;
      sy = rnd() * bh * 0.86;
      sz = 0.6 + rnd() * 1.9;
      sa = 0.25 + rnd() * 0.55;
      g.fillStyle = 'rgba(255,255,255,' + sa.toFixed(2) + ')';
      g.beginPath();
      g.arc(sx, sy, sz, 0, 6.2832);
      g.fill();
      if (sz > 1.9) {
        g.fillStyle = 'rgba(51,64,90,' + (sa * 0.22).toFixed(2) + ')';
        g.beginPath();
        g.arc(sx, sy, sz * 2.1, 0, 6.2832);
        g.fill();
      }
    }
    /* a few larger sparkles, baked */
    var bigs = [[0.62, 0.10, 26], [0.92, 0.44, 20], [0.70, 0.62, 16], [0.48, 0.07, 14]];
    for (k = 0; k < bigs.length; k++) {
      g.globalAlpha = 0.85;
      g.drawImage(sparkMid, bigs[k][0] * bw - bigs[k][2] * 0.5, bigs[k][1] * bh - bigs[k][2] * 0.5, bigs[k][2], bigs[k][2]);
    }
    g.globalAlpha = 1;

    /* soft cloud bands near the bottom */
    g.save();
    g.globalAlpha = 0.85;
    g.fillStyle = 'rgba(255,255,255,0.78)';
    for (k = 0; k < 3; k++) {
      var cy = bh * (0.80 + k * 0.075);
      g.beginPath();
      g.moveTo(0, cy);
      g.bezierCurveTo(bw * 0.28, cy - bh * 0.05, bw * 0.62, cy + bh * 0.045, bw, cy - bh * 0.015);
      g.lineTo(bw, bh);
      g.lineTo(0, bh);
      g.closePath();
      g.fill();
    }
    g.restore();

    paintGirl(g, bw, bh, m);
  }

  /* the girl: high key line art, gazing up, soft smile, star-lit eyes */
  function paintGirl(g, bw, bh, m) {
    var s = bh * 0.460;
    var ox = bw * 0.318;
    var oy = bh * 0.489;
    var rot = -0.30;
    var cs = Math.cos(rot);
    var sn = Math.sin(rot);
    var lw = clamp(m * 0.0039, 1.9, 3.9);
    var mtx = [s * cs, s * sn, -s * sn, s * cs, ox, oy];
    var ink = lw / s;

    function faceXf() {
      g.translate(ox, oy);
      g.rotate(rot);
      g.scale(s, s);
    }

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

    /* hair outlines, needed early so the drop shadow can include them */
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
    var hairBack = runPath(new Path2D(), HAIR_SEGS);
    var bang = runPath(new Path2D(), BANG_SEGS);
    bang.closePath();

    /* soft blue shadow under her so the pale face reads against the sky */
    var silFace = xfPath(FRONT, mtx);
    xfPath(BACK, mtx, silFace);
    silFace.closePath();
    var silHair = xfPath(HAIR_SEGS, mtx);
    var silBang = xfPath(BANG_SEGS, mtx);
    silBang.closePath();
    g.save();
    g.shadowColor = 'rgba(96,128,172,0.44)';
    g.shadowBlur = s * 0.055;
    g.shadowOffsetX = s * 0.016;
    g.shadowOffsetY = s * 0.030;
    g.fillStyle = 'rgba(255,255,255,0.97)';
    g.fill(silFace);
    g.fill(silHair);
    g.fill(silBang);
    g.restore();

    /* glow behind the head so the light hair separates from the sky */
    var gl = g.createRadialGradient(
      ox - s * 0.10, oy - s * 0.55, s * 0.20,
      ox - s * 0.10, oy - s * 0.55, s * 1.45);
    gl.addColorStop(0, 'rgba(255,255,255,0.36)');
    gl.addColorStop(0.55, 'rgba(255,255,255,0.14)');
    gl.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gl;
    g.fillRect(0, 0, bw, bh);

    /* ---- skin */
    g.save();
    faceXf();
    g.fillStyle = '#fdf8f0';
    g.fill(facePath);
    g.strokeStyle = LINE;
    g.lineWidth = ink;
    g.lineJoin = 'round';
    g.stroke(facePath);
    g.restore();

    /* ---- blue-grey halftone shadows: cheek, under jaw, neck */
    var pat = tilePattern(g, toneTile);
    g.save();
    g.fillStyle = pat;
    g.globalAlpha = 0.42;
    g.fill(facePoly(mtx, [
      [0.470, 0.240], [0.446, 0.330], [0.410, 0.430], [0.372, 0.512],
      [0.316, 0.566], [0.252, 0.606], [0.228, 0.540], [0.292, 0.492],
      [0.348, 0.408], [0.396, 0.310], [0.430, 0.216]
    ]));
    g.globalAlpha = 0.36;
    g.fill(facePoly(mtx, [
      [0.116, 0.742], [0.262, 0.712], [0.294, 0.772], [0.286, 0.880],
      [0.186, 0.900], [0.128, 0.812]
    ]));
    g.globalAlpha = 0.30;
    g.fill(facePoly(mtx, [
      [0.238, 0.880], [0.272, 0.876], [0.266, 1.060], [0.248, 1.060]
    ]));
    g.restore();

    /* ---- pale pink blush on the cheek */
    g.save();
    g.globalAlpha = 0.42;
    g.fillStyle = 'rgba(255,170,196,0.55)';
    g.beginPath();
    var bl = facePoly(mtx, [
      [0.404, 0.176], [0.372, 0.238], [0.318, 0.276], [0.268, 0.268],
      [0.276, 0.196], [0.330, 0.156]
    ]);
    g.fill(bl);
    g.restore();

    /* ---- features */
    g.save();
    faceXf();
    g.lineJoin = 'round';
    g.lineCap = 'round';

    /* brow */
    var brow = new Path2D();
    brow.moveTo(0.150, -0.272);
    brow.bezierCurveTo(0.228, -0.322, 0.330, -0.320, 0.420, -0.258);
    g.strokeStyle = 'rgba(51,64,90,0.85)';
    g.lineWidth = 0.019;
    g.stroke(brow);

    /* eye group: slightly enlarged for the soft manga look */
    g.save();
    g.translate(0.300, -0.100);
    g.scale(1.15, 1.15);
    g.translate(-0.300, 0.100);

    /* sclera */
    var sclera = new Path2D();
    sclera.moveTo(0.412, -0.058);
    sclera.bezierCurveTo(0.354, -0.130, 0.278, -0.158, 0.208, -0.154);
    sclera.bezierCurveTo(0.164, -0.150, 0.132, -0.126, 0.114, -0.098);
    sclera.bezierCurveTo(0.158, -0.036, 0.250, -0.018, 0.318, -0.032);
    sclera.bezierCurveTo(0.368, -0.042, 0.394, -0.050, 0.412, -0.058);
    sclera.closePath();
    g.fillStyle = '#fffdf9';
    g.fill(sclera);

    /* iris: clear blue with a star glint */
    g.save();
    g.clip(sclera);
    g.beginPath();
    g.arc(0.312, -0.098, 0.060, 0, 6.2832);
    g.fillStyle = '#7fa2cf';
    g.fill();
    g.beginPath();
    g.arc(0.312, -0.098, 0.060, 0, 6.2832);
    g.strokeStyle = 'rgba(51,64,90,0.75)';
    g.lineWidth = 0.008;
    g.stroke();
    g.beginPath();
    g.arc(0.312, -0.098, 0.026, 0, 6.2832);
    g.fillStyle = '#33405a';
    g.fill();
    /* pale cyan lower rim */
    g.beginPath();
    g.arc(0.312, -0.098, 0.048, 0.5, 2.6);
    g.strokeStyle = 'rgba(142,230,242,0.85)';
    g.lineWidth = 0.012;
    g.stroke();
    /* 4 point star glint */
    g.fillStyle = '#ffffff';
    var gx = 0.292;
    var gy = -0.120;
    var gw = 0.014;
    g.beginPath();
    g.moveTo(gx, gy - 0.045);
    g.quadraticCurveTo(gx + gw, gy - gw, gx + 0.038, gy);
    g.quadraticCurveTo(gx + gw, gy + gw, gx, gy + 0.045);
    g.quadraticCurveTo(gx - gw, gy + gw, gx - 0.038, gy);
    g.quadraticCurveTo(gx - gw, gy - gw, gx, gy - 0.045);
    g.fill();
    /* tiny pink dot */
    g.beginPath();
    g.arc(0.334, -0.084, 0.011, 0, 6.2832);
    g.fillStyle = 'rgba(255,184,210,0.95)';
    g.fill();
    g.restore();

    /* upper lid */
    var lid = new Path2D();
    lid.moveTo(0.416, -0.054);
    lid.bezierCurveTo(0.358, -0.136, 0.280, -0.170, 0.208, -0.166);
    lid.bezierCurveTo(0.160, -0.162, 0.124, -0.134, 0.108, -0.102);
    g.strokeStyle = LINE;
    g.lineWidth = 0.030;
    g.stroke(lid);

    /* three soft lashes */
    var lash1 = new Path2D();
    lash1.moveTo(0.136, -0.126);
    lash1.bezierCurveTo(0.118, -0.160, 0.106, -0.186, 0.098, -0.208);
    lash1.bezierCurveTo(0.114, -0.184, 0.126, -0.154, 0.144, -0.110);
    lash1.closePath();
    g.fillStyle = LINE;
    g.fill(lash1);
    var lash2 = new Path2D();
    lash2.moveTo(0.180, -0.156);
    lash2.bezierCurveTo(0.168, -0.186, 0.160, -0.208, 0.155, -0.226);
    lash2.bezierCurveTo(0.168, -0.204, 0.176, -0.180, 0.188, -0.146);
    lash2.closePath();
    g.fill(lash2);
    var lash3 = new Path2D();
    lash3.moveTo(0.226, -0.170);
    lash3.bezierCurveTo(0.218, -0.194, 0.212, -0.212, 0.208, -0.226);
    lash3.bezierCurveTo(0.218, -0.208, 0.224, -0.190, 0.234, -0.162);
    lash3.closePath();
    g.fill(lash3);

    /* lower lid */
    var low = new Path2D();
    low.moveTo(0.408, -0.052);
    low.bezierCurveTo(0.330, -0.012, 0.212, -0.010, 0.152, -0.068);
    g.strokeStyle = 'rgba(51,64,90,0.55)';
    g.lineWidth = 0.010;
    g.stroke(low);
    g.restore();

    /* nose */
    g.strokeStyle = 'rgba(51,64,90,0.75)';
    var n1 = new Path2D();
    n1.moveTo(0.472, 0.180);
    n1.bezierCurveTo(0.502, 0.192, 0.526, 0.186, 0.542, 0.172);
    g.lineWidth = 0.011;
    g.stroke(n1);
    var n2 = new Path2D();
    n2.moveTo(0.462, 0.146);
    n2.lineTo(0.470, 0.180);
    g.lineWidth = 0.009;
    g.stroke(n2);
    var n3 = new Path2D();
    n3.moveTo(0.436, -0.054);
    n3.bezierCurveTo(0.442, 0.012, 0.452, 0.072, 0.470, 0.120);
    g.strokeStyle = 'rgba(51,64,90,0.22)';
    g.lineWidth = 0.009;
    g.stroke(n3);

    /* soft smile: mouth line lifting at the corner, pale pink lip */
    var lip = new Path2D();
    lip.moveTo(0.466, 0.320);
    lip.bezierCurveTo(0.480, 0.336, 0.492, 0.344, 0.492, 0.358);
    lip.bezierCurveTo(0.490, 0.376, 0.476, 0.386, 0.464, 0.382);
    lip.bezierCurveTo(0.458, 0.366, 0.460, 0.338, 0.466, 0.320);
    lip.closePath();
    g.fillStyle = 'rgba(255,170,196,0.78)';
    g.fill(lip);
    var smile = new Path2D();
    smile.moveTo(0.442, 0.310);
    smile.bezierCurveTo(0.468, 0.324, 0.492, 0.322, 0.506, 0.304);
    g.strokeStyle = 'rgba(51,64,90,0.85)';
    g.lineWidth = 0.012;
    g.stroke(smile);
    /* smile corner tick */
    var dimple = new Path2D();
    dimple.moveTo(0.508, 0.300);
    dimple.lineTo(0.516, 0.288);
    g.lineWidth = 0.009;
    g.stroke(dimple);

    /* jaw line, very light */
    var jaw = new Path2D();
    jaw.moveTo(0.412, 0.582);
    jaw.bezierCurveTo(0.336, 0.652, 0.236, 0.704, 0.124, 0.730);
    jaw.bezierCurveTo(0.024, 0.754, -0.082, 0.748, -0.160, 0.704);
    g.strokeStyle = 'rgba(51,64,90,0.55)';
    g.lineWidth = 0.012;
    g.stroke(jaw);
    g.restore();

    /* ---- hair: pale blue grey mass */
    g.save();
    faceXf();

    /* hair body */
    g.fillStyle = '#cfdcee';
    g.fill(hairBack);
    g.strokeStyle = LINE;
    g.lineWidth = ink * 0.85;
    g.stroke(hairBack);

    /* inner shadow along the hair root */
    g.save();
    g.clip(hairBack);
    var hs = g.createLinearGradient(-0.10, -0.10, -1.05, 0.55);
    hs.addColorStop(0, 'rgba(150,175,208,0.34)');
    hs.addColorStop(0.55, 'rgba(168,190,219,0.18)');
    hs.addColorStop(1, 'rgba(207,220,238,0.06)');
    g.fillStyle = hs;
    g.fillRect(-1.5, -1.2, 3.2, 3.6);
    g.restore();

    /* bang over the forehead, same light tone, defined by its outline */
    g.fillStyle = '#cbd9ec';
    g.fill(bang);
    g.strokeStyle = LINE;
    g.lineWidth = ink * 0.85;
    g.stroke(bang);

    /* a few strand lines for texture */
    g.strokeStyle = 'rgba(90,116,150,0.42)';
    g.lineWidth = ink * 0.5;
    var strands = [
      ['M', 0.200, -0.930, 0.060, -0.560, -0.080, 0.100],
      ['M', -0.060, -0.960, -0.300, -0.700, -0.520, 0.260],
      ['M', -0.380, -0.960, -0.640, -0.640, -0.780, 0.500],
      ['M', -0.700, -0.860, -0.900, -0.420, -0.960, 0.740],
      ['M', 0.330, -0.820, 0.230, -0.500, 0.150, -0.180]
    ];
    for (var sm = 0; sm < strands.length; sm++) {
      var st = strands[sm];
      var sp = new Path2D();
      sp.moveTo(st[1], st[2]);
      sp.quadraticCurveTo(st[3], st[4], st[5], st[6]);
      g.stroke(sp);
    }

    /* thin side lock in front of the ear */
    var lock = new Path2D();
    lock.moveTo(0.112, -0.740);
    lock.bezierCurveTo(0.060, -0.430, 0.038, -0.120, 0.030, 0.130);
    lock.bezierCurveTo(0.026, 0.240, 0.014, 0.310, -0.008, 0.372);
    lock.bezierCurveTo(-0.012, 0.290, -0.012, 0.210, -0.010, 0.120);
    lock.bezierCurveTo(-0.014, -0.140, 0.006, -0.440, 0.048, -0.744);
    lock.closePath();
    g.fillStyle = '#c2d2e8';
    g.fill(lock);
    g.strokeStyle = LINE;
    g.lineWidth = ink * 0.7;
    g.stroke(lock);
    g.restore();

    /* ---- paper white highlight crescent, clipped to the hair */
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
      th = (0.112 + 0.036 * sv) * Math.sqrt(Math.max(0, sv));
      rad2 = ro - th;
      cres.lineTo(hcx + Math.cos(aa) * rad2, hcy + Math.sin(aa) * rad2);
    }
    cres.closePath();
    g.save();
    faceXf();
    g.clip(hairClip);
    g.fillStyle = 'rgba(255,253,246,0.96)';
    g.fill(cres);
    g.restore();

    /* small highlight sliver on the bang */
    g.save();
    g.fillStyle = 'rgba(255,253,246,0.9)';
    g.fill(facePoly(mtx, [
      [0.352, -0.876], [0.404, -0.802], [0.372, -0.786], [0.330, -0.842]
    ]));
    g.restore();

    /* ---- soft glow rim along the profile edge */
    g.save();
    faceXf();
    g.lineJoin = 'round';
    g.strokeStyle = 'rgba(255,255,255,0.55)';
    g.lineWidth = ink * 2.6;
    g.stroke(rimPath);
    g.strokeStyle = 'rgba(255,232,242,0.55)';
    g.lineWidth = ink * 0.8;
    g.stroke(rimPath);
    g.restore();
  }

  /* ======================================================= NIGHT SKY PANEL */

  function paintNightSky(g, bw, bh, m) {
    var sky = g.createLinearGradient(0, 0, bw * 0.3, bh);
    sky.addColorStop(0, '#a3bde6');
    sky.addColorStop(0.45, '#c2d6f0');
    sky.addColorStop(1, '#e2ecf9');
    g.fillStyle = sky;
    g.fillRect(0, 0, bw, bh);

    g.save();
    g.globalAlpha = 0.40;
    g.fillStyle = tilePattern(g, toneTile);
    g.fillRect(0, 0, bw, bh);
    g.restore();

    /* soft magenta / cyan glow at the corners */
    var rg = g.createRadialGradient(bw * 0.82, bh * 0.14, 0, bw * 0.82, bh * 0.14, bw * 0.75);
    rg.addColorStop(0, 'rgba(255,184,210,0.32)');
    rg.addColorStop(1, 'rgba(255,184,210,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, bw, bh);
    var rg2 = g.createRadialGradient(bw * 0.12, bh * 0.86, 0, bw * 0.12, bh * 0.86, bw * 0.7);
    rg2.addColorStop(0, 'rgba(142,230,242,0.30)');
    rg2.addColorStop(1, 'rgba(142,230,242,0)');
    g.fillStyle = rg2;
    g.fillRect(0, 0, bw, bh);

    /* static stars */
    var rnd = rngOf(0x77c1);
    var k, sx, sy, sz, sa;
    for (k = 0; k < 170; k++) {
      sx = rnd() * bw;
      sy = rnd() * bh;
      sz = 0.6 + rnd() * 1.9;
      sa = 0.4 + rnd() * 0.6;
      g.fillStyle = 'rgba(255,255,255,' + sa.toFixed(2) + ')';
      g.beginPath();
      g.arc(sx, sy, sz, 0, 6.2832);
      g.fill();
      if (sz > 1.8) {
        g.fillStyle = 'rgba(255,255,255,0.22)';
        g.beginPath();
        g.arc(sx, sy, sz * 2.6, 0, 6.2832);
        g.fill();
      }
    }
    /* baked sparkles */
    var bigs = [[0.24, 0.30, bw * 0.095], [0.62, 0.14, bw * 0.068], [0.86, 0.52, bw * 0.052], [0.42, 0.78, bw * 0.045]];
    for (k = 0; k < bigs.length; k++) {
      g.globalAlpha = 0.92;
      g.drawImage(sparkBig, bigs[k][0] * bw - bigs[k][2] * 0.5, bigs[k][1] * bh - bigs[k][2] * 0.5, bigs[k][2], bigs[k][2]);
    }
    g.globalAlpha = 1;

    /* static pale light trails, each with its own bend */
    g.save();
    g.lineCap = 'round';
    var tr = [
      [[0.02, 0.98], [0.44, 0.56], [0.98, 0.08], 0.62],
      [[0.24, 1.04], [0.54, 0.54], [0.88, 0.02], 0.50],
      [[0.62, 1.06], [0.80, 0.62], [1.04, 0.24], 0.44],
      [[0.00, 0.62], [0.30, 0.40], [0.66, 0.06], 0.34]
    ];
    for (k = 0; k < tr.length; k++) {
      g.strokeStyle = k % 2 === 0
        ? 'rgba(255,255,255,' + tr[k][3].toFixed(2) + ')'
        : 'rgba(255,214,230,' + tr[k][3].toFixed(2) + ')';
      g.lineWidth = Math.max(1.3, bh * (0.013 - k * 0.0022));
      g.beginPath();
      g.moveTo(bw * tr[k][0][0], bh * tr[k][0][1]);
      g.quadraticCurveTo(bw * tr[k][1][0], bh * tr[k][1][1], bw * tr[k][2][0], bh * tr[k][2][1]);
      g.stroke();
    }
    g.restore();

    /* drift of clouds at the bottom */
    g.fillStyle = 'rgba(255,255,255,0.72)';
    g.beginPath();
    g.moveTo(0, bh * 0.90);
    g.bezierCurveTo(bw * 0.3, bh * 0.82, bw * 0.6, bh * 0.96, bw, bh * 0.86);
    g.lineTo(bw, bh);
    g.lineTo(0, bh);
    g.closePath();
    g.fill();
  }

  /* ========================================================= TRAILS PANEL */

  function paintTrails(g, bw, bh, m) {
    var sky = g.createLinearGradient(0, 0, bw, bh);
    sky.addColorStop(0, '#dae6f8');
    sky.addColorStop(0.42, '#c8d8f0');
    sky.addColorStop(0.72, '#e6dcf2');
    sky.addColorStop(1, '#fdeef5');
    g.fillStyle = sky;
    g.fillRect(0, 0, bw, bh);

    g.save();
    g.globalAlpha = 0.30;
    g.fillStyle = tilePattern(g, toneTile);
    g.fillRect(0, 0, bw, bh);
    g.restore();

    var rg = g.createRadialGradient(bw * 0.30, bh * 0.34, 0, bw * 0.30, bh * 0.34, bw * 0.85);
    rg.addColorStop(0, 'rgba(255,255,255,0.65)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, bw, bh);

    /* big soft star with rings of light trail */
    var cx = bw * 0.33;
    var cy = bh * 0.33;
    var rr = Math.min(bw, bh) * 0.058;
    var halo = g.createRadialGradient(cx, cy, 0, cx, cy, rr * 7);
    halo.addColorStop(0, 'rgba(255,255,255,0.55)');
    halo.addColorStop(0.28, 'rgba(255,240,248,0.20)');
    halo.addColorStop(1, 'rgba(255,240,248,0)');
    g.fillStyle = halo;
    g.beginPath();
    g.arc(cx, cy, rr * 7, 0, 6.2832);
    g.fill();
    g.drawImage(sparkBig, cx - rr * 1.95, cy - rr * 1.95, rr * 3.9, rr * 3.9);
    /* a smaller companion sparkle */
    g.globalAlpha = 0.9;
    g.drawImage(sparkPink, bw * 0.74, bh * 0.20, rr * 2.6, rr * 2.6);
    g.globalAlpha = 1;

    /* light trail rings around the star */
    g.save();
    g.lineCap = 'round';
    var k;
    for (k = 0; k < 4; k++) {
      var rad = rr * (1.9 + k * 0.62);
      g.strokeStyle = k % 2 === 0
        ? 'rgba(142,230,242,' + (0.62 - k * 0.10).toFixed(2) + ')'
        : 'rgba(255,184,210,' + (0.58 - k * 0.10).toFixed(2) + ')';
      g.lineWidth = Math.max(1.5, rr * (0.30 - k * 0.045));
      g.beginPath();
      g.ellipse(cx, cy, rad * 1.34, rad * 0.72, -0.34 + k * 0.05, 0.35, 5.6);
      g.stroke();
    }
    g.restore();

    /* long light streaks, gently curved */
    g.save();
    g.lineCap = 'round';
    var st2 = [
      [[0.00, 0.94], [0.34, 0.72], [0.74, 0.10], 0.66],
      [[0.16, 1.04], [0.52, 0.78], [1.02, 0.30], 0.52],
      [[0.44, 1.06], [0.72, 0.66], [1.04, 0.54], 0.42]
    ];
    for (k = 0; k < st2.length; k++) {
      g.strokeStyle = k % 2 === 0
        ? 'rgba(255,255,255,' + st2[k][3].toFixed(2) + ')'
        : 'rgba(255,220,235,' + st2[k][3].toFixed(2) + ')';
      g.lineWidth = Math.max(1.5, bh * (0.017 - k * 0.0035));
      g.beginPath();
      g.moveTo(bw * st2[k][0][0], bh * st2[k][0][1]);
      g.quadraticCurveTo(bw * st2[k][1][0], bh * st2[k][1][1], bw * st2[k][2][0], bh * st2[k][2][1]);
      g.stroke();
    }
    g.restore();

    /* small stars */
    var rnd = rngOf(0x1c3d);
    var sx, sy, sz, sa;
    for (k = 0; k < 90; k++) {
      sx = rnd() * bw;
      sy = rnd() * bh;
      sz = 0.6 + rnd() * 1.7;
      sa = 0.30 + rnd() * 0.55;
      g.fillStyle = 'rgba(255,255,255,' + sa.toFixed(2) + ')';
      g.beginPath();
      g.arc(sx, sy, sz, 0, 6.2832);
      g.fill();
    }
    for (k = 0; k < 3; k++) {
      var px = bw * (0.68 + k * 0.11);
      var py = bh * (0.18 + k * 0.26);
      var ps = Math.min(bw, bh) * 0.10;
      g.globalAlpha = 0.8;
      g.drawImage(k === 1 ? sparkPink : sparkMid, px, py, ps, ps);
    }
    g.globalAlpha = 1;
  }

  /* ============================================================= CHROME == */

  function buildChrome(p, m) {
    var M = Math.max(26, m * 0.034);
    p.fx = p.bbox.x - M;
    p.fy = p.bbox.y - M;
    p.fw = p.bbox.w + M * 2;
    p.fh = p.bbox.h + M * 2;

    var border = clamp(m * 0.0115, 5, 20);

    p.chrome = mkCanvas(p.fw, p.fh);
    var g = ctxOf(p.chrome);
    g.translate(-p.fx, -p.fy);
    g.lineJoin = 'miter';
    g.lineCap = 'butt';

    /* soft drop shadow cast by the frame edge only */
    g.save();
    g.shadowColor = 'rgba(112,142,186,0.42)';
    g.shadowBlur = m * 0.030;
    g.shadowOffsetY = m * 0.009;
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.lineWidth = border * 2.2;
    g.stroke(p.path);
    g.restore();

    /* white comic frame */
    g.strokeStyle = '#fffdf8';
    g.lineWidth = border;
    g.stroke(p.path);

    /* thin blue grey inner line */
    g.strokeStyle = 'rgba(51,64,90,0.26)';
    g.lineWidth = Math.max(1, border * 0.13);
    g.stroke(p.path);

    /* pale neon: cyan sides + pink top edge */
    p.glow = mkCanvas(p.fw, p.fh);
    var g2 = ctxOf(p.glow);
    g2.translate(-p.fx, -p.fy);
    neonStroke(g2, p.path, Math.max(1.5, border * 0.30), 'rgba(142,230,242,0.95)', 0.55);
    var top = new Path2D();
    top.moveTo(p.tl.x, p.tl.y);
    top.lineTo(p.tl.x + p.u.x, p.tl.y + p.u.y);
    neonStroke(g2, top, Math.max(1.4, border * 0.26), 'rgba(255,168,200,0.95)', 0.55);
  }

  /* ================================================================ PAGE = */

  function buildPage() {
    pageCv = mkCanvas(W, H);
    var g = ctxOf(pageCv);
    g.fillStyle = PAPER;
    g.fillRect(0, 0, W, H);

    /* pale blue tone wash over the whole page */
    g.save();
    g.globalAlpha = 0.75;
    g.fillStyle = tilePattern(g, pageDotTile);
    g.fillRect(0, 0, W, H);
    g.restore();

    /* soft light from the top right */
    var lg = g.createRadialGradient(W * 0.72, H * 0.10, 0, W * 0.72, H * 0.10, Math.max(W, H) * 0.85);
    lg.addColorStop(0, 'rgba(255,255,255,0.55)');
    lg.addColorStop(0.5, 'rgba(255,252,242,0.18)');
    lg.addColorStop(1, 'rgba(255,250,236,0)');
    g.fillStyle = lg;
    g.fillRect(0, 0, W, H);

    /* night sky header band: keeps the host exit button area dark */
    var band = g.createLinearGradient(0, 0, W * 0.4, H * 0.18);
    band.addColorStop(0, '#16203a');
    band.addColorStop(0.55, '#1d2947');
    band.addColorStop(1, '#253253');
    g.fillStyle = band;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(W, 0);
    g.lineTo(W, H * 0.156);
    g.lineTo(0, H * 0.146);
    g.closePath();
    g.fill();

    /* stars inside the band */
    var brnd = rngOf(0x4b17);
    var bi, bx, by, bs, ba;
    for (bi = 0; bi < 80; bi++) {
      bx = brnd() * W * 0.70;
      by = brnd() * H * 0.132;
      bs = 0.7 + brnd() * 1.4;
      ba = 0.22 + brnd() * 0.5;
      g.fillStyle = 'rgba(253,250,243,' + ba.toFixed(2) + ')';
      g.beginPath();
      g.arc(bx, by, bs, 0, 6.2832);
      g.fill();
    }
    for (bi = 0; bi < 4; bi++) {
      var spr = bi % 2 === 0 ? sparkMid : sparkPink;
      var ssize = H * (0.028 + brnd() * 0.018);
      g.globalAlpha = 0.6;
      g.drawImage(spr, W * (0.06 + brnd() * 0.52) - ssize * 0.5, H * (0.03 + brnd() * 0.08) - ssize * 0.5, ssize, ssize);
    }
    g.globalAlpha = 1;

    /* pale divider lines following the slanted band edge */
    g.fillStyle = 'rgba(255,168,200,0.88)';
    g.beginPath();
    g.moveTo(0, H * 0.146);
    g.lineTo(W, H * 0.156);
    g.lineTo(W, H * 0.156 + Math.max(1, H * 0.0032));
    g.lineTo(0, H * 0.146 + Math.max(1, H * 0.0032));
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(142,230,242,0.88)';
    g.beginPath();
    g.moveTo(0, H * 0.146 + Math.max(2, H * 0.0055));
    g.lineTo(W * 0.40, H * 0.150 + Math.max(2, H * 0.0055));
    g.lineTo(W * 0.40, H * 0.150 + Math.max(2, H * 0.0055) + Math.max(1, H * 0.0018));
    g.lineTo(0, H * 0.146 + Math.max(2, H * 0.0055) + Math.max(1, H * 0.0018));
    g.closePath();
    g.fill();

    /* title */
    var fs = Math.min(H * 0.056, W * 0.029);
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    g.fillStyle = PAPER;
    g.font = '700 ' + fs.toFixed(1) + 'px ' + FONT;
    g.fillText('STAR SEA', W * 0.034, H * 0.070);
    var tw = g.measureText('STAR SEA').width;
    g.fillStyle = 'rgba(142,230,242,0.95)';
    g.font = '700 ' + (fs * 0.52).toFixed(1) + 'px ' + FONT;
    g.fillText('NO.02', W * 0.034 + tw + fs * 0.62, H * 0.074);
    g.fillStyle = 'rgba(253,250,243,0.62)';
    g.font = '400 ' + (fs * 0.52).toFixed(1) + 'px ' + FONT;
    g.fillText('\u661f\u6d77\u6f2b\u5267', W * 0.034 + tw + fs * 2.45, H * 0.074);

    /* bottom hairlines */
    g.fillStyle = 'rgba(51,64,90,0.18)';
    g.fillRect(0, H * 0.988, W, Math.max(1, H * 0.0025));
    g.fillStyle = 'rgba(142,230,242,0.85)';
    g.fillRect(0, H * 0.984, W * 0.13, Math.max(1, H * 0.0022));

    /* caption box, bottom right */
    var bw2 = W * 0.112;
    var bh2 = H * 0.038;
    var bx2 = W * 0.984 - bw2;
    var by2 = H * 0.988 - bh2 - H * 0.010;
    g.fillStyle = 'rgba(255,253,248,0.92)';
    g.fillRect(bx2, by2, bw2, bh2);
    g.strokeStyle = 'rgba(51,64,90,0.34)';
    g.lineWidth = Math.max(1.2, H * 0.0022);
    g.strokeRect(bx2, by2, bw2, bh2);
    g.fillStyle = 'rgba(51,64,90,0.82)';
    g.font = '700 ' + (bh2 * 0.54).toFixed(1) + 'px ' + FONT;
    g.textAlign = 'center';
    g.fillText('STARLIGHT 100%', bx2 + bw2 * 0.5, by2 + bh2 * 0.54);
  }

  function buildDots() {
    dotW = W + 12;
    dotH = H + 12;
    dotCv = mkCanvas(dotW, dotH);
    var g = ctxOf(dotCv);
    g.fillStyle = tilePattern(g, pageDotTile);
    /* tone starts below the night sky band so the dark header stays clean */
    var y0 = H * 0.153 + 14;
    g.fillRect(0, y0, dotW, dotH - y0);
  }

  function buildGrain() {
    grainCv = mkCanvas(W, H);
    var g = ctxOf(grainCv);

    /* paper fibre noise, very light */
    var nw = 128;
    var noise = document.createElement('canvas');
    noise.width = Math.round(nw * dpr);
    noise.height = Math.round(nw * dpr);
    var ng = noise.getContext('2d');
    var img = ng.createImageData(noise.width, noise.height);
    var d = img.data;
    var i;
    for (i = 0; i < d.length; i += 4) {
      var v = Math.random();
      d[i] = 120; d[i + 1] = 128; d[i + 2] = 150;
      d[i + 3] = v < 0.6 ? 0 : Math.round(30 + v * 110);
    }
    ng.putImageData(img, 0, 0);
    var np = g.createPattern(noise, 'repeat');
    if (np && np.setTransform && typeof DOMMatrix === 'function') {
      try { np.setTransform(new DOMMatrix([1 / dpr, 0, 0, 1 / dpr, 0, 0])); } catch (e) { /* ignore */ }
    }
    g.globalAlpha = 0.045;
    g.fillStyle = np;
    g.fillRect(0, 0, W, H);
    g.globalAlpha = 1;

    /* very soft warm edge shading (no heavy vignette on a high key page) */
    var rg = g.createRadialGradient(W * 0.5, H * 0.48, Math.min(W, H) * 0.42, W * 0.5, H * 0.5, Math.max(W, H) * 0.82);
    rg.addColorStop(0, 'rgba(120,140,170,0)');
    rg.addColorStop(1, 'rgba(120,140,170,0.16)');
    g.fillStyle = rg;
    g.fillRect(0, 0, W, H);

    /* speech bubbles ride on this static layer (bubbles stay above the grain) */
    buildBubbles(g);
  }

  /* ============================================================= BUBBLES = */

  function drawBubble(g, cx, cy, rx, ry, tip, text, fs, lw) {
    var ang = Math.atan2((tip.y - cy) / ry, (tip.x - cx) / rx);
    var d = 0.28;
    g.beginPath();
    g.ellipse(cx, cy, rx, ry, 0, ang + d, ang - d + 6.283185307, false);
    g.lineTo(tip.x, tip.y);
    g.closePath();
    g.save();
    g.shadowColor = 'rgba(112,142,186,0.35)';
    g.shadowBlur = Math.min(W, H) * 0.012;
    g.shadowOffsetY = Math.min(W, H) * 0.004;
    g.fillStyle = '#fffefb';
    g.fill();
    g.restore();
    g.lineJoin = 'round';
    g.strokeStyle = 'rgba(51,64,90,0.62)';
    g.lineWidth = lw;
    g.stroke();

    g.fillStyle = LINE;
    g.font = '700 ' + fs.toFixed(1) + 'px ' + FONT;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, cx, cy + fs * 0.04);
  }

  function buildBubbles(g) {
    var m = Math.min(W, H);
    var lw = clamp(m * 0.0038, 1.6, 4.6);

    /* bubble 1: tonight let's watch the stars together */
    drawBubble(g, W * 0.508, H * 0.196, W * 0.116, H * 0.058,
      { x: W * 0.312, y: H * 0.470 },
      '\u4eca\u665a\u4e5f\u4e00\u8d77\u770b\u661f\u661f',
      Math.min(H * 0.058 * 0.62, W * 0.0172), lw);

    /* bubble 2: starlight connected */
    drawBubble(g, W * 0.206, H * 0.884, W * 0.074, H * 0.047,
      { x: W * 0.172, y: H * 0.806 },
      '\u661f\u5149\u5df2\u8fde\u63a5',
      Math.min(H * 0.047 * 0.70, W * 0.0150), lw * 0.8);
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

    toneTile = makeTile(4, 0.95, 'rgba(96,124,162,0.85)', 1);
    pageDotTile = makeTile(8, 1.28, 'rgba(176,203,235,0.90)', 1);
    sparkBig = makeSparkle(Math.max(24, Math.round(Math.min(W, H) * 0.075)), 'rgba(255,255,255,0.98)', 'rgba(255,244,250,0.75)');
    sparkMid = makeSparkle(Math.max(14, Math.round(Math.min(W, H) * 0.040)), 'rgba(255,255,255,0.95)', 'rgba(226,242,255,0.70)');
    sparkPink = makeSparkle(Math.max(14, Math.round(Math.min(W, H) * 0.042)), 'rgba(255,226,238,0.98)', 'rgba(255,196,220,0.72)');

    buildPage();
    buildDots();
    buildGrain();
    buildPanels();

    focusEase[0] = 1; focusEase[1] = 0; focusEase[2] = 0;
    t = 0;
    last = 0;
  }

  function drawMotion(p, dt) {
    var i, tw;
    if (p.tw.length) {
      for (i = 0; i < p.tw.length; i++) {
        tw = p.tw[i];
        var a = tw.lo + (1 - tw.lo) * (0.5 + 0.5 * Math.sin(t * tw.spd + tw.ph));
        ctx.globalAlpha = a;
        ctx.drawImage(tw.spr, tw.x - tw.s * 0.5, tw.y - tw.s * 0.5, tw.s, tw.s);
      }
      ctx.globalAlpha = 1;
    }
    for (i = 0; i < p.meteors.length; i++) {
      var mm = p.meteors[i];
      var ph = ((t / mm.period) + mm.off) % 1;
      if (ph >= mm.dur) { continue; }
      var u = ph / mm.dur;
      var e = u * u * 0.35 + u * 0.65;
      var x = mm.x0 + (mm.x1 - mm.x0) * e;
      var y = mm.y0 + (mm.y1 - mm.y0) * e;
      var fade = Math.sin(Math.PI * Math.min(1, u * 1.05));
      ctx.globalAlpha = clamp(fade * 1.1, 0, 1);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(mm.ang);
      ctx.drawImage(mm.spr, -mm.len, -mm.thick * 0.5, mm.len, mm.thick);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }

  function drawPanels(dt) {
    var m = Math.min(W, H);
    var off = m * 0.0030;

    var cycle = t % (FOCUS_SEC * 3);
    var fi = Math.floor(cycle / FOCUS_SEC);
    for (var i = 0; i < 3; i++) {
      var target = (i === fi) ? 1 : 0;
      var k = focusEase[i];
      k += (target - k) * Math.min(1, dt * 5.5);
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

      ctx.save();
      ctx.transform(p.mtx[0], p.mtx[1], p.mtx[2], p.mtx[3], p.mtx[4], p.mtx[5]);
      ctx.drawImage(p.content, 0, 0, p.bw, p.bh);
      drawMotion(p, dt);
      ctx.restore();

      /* unfocused panels fade back into the paper: soft focus switch */
      var veil = 0.30 * (1 - f);
      if (veil > 0.004) {
        ctx.fillStyle = 'rgba(253,250,243,' + veil.toFixed(3) + ')';
        ctx.fillRect(p.bbox.x - 6, p.bbox.y - 6, p.bbox.w + 12, p.bbox.h + 12);
      }
      ctx.restore();

      /* light frame + pale neon */
      ctx.save();
      ctx.translate(dx, dy);
      ctx.drawImage(p.chrome, p.fx, p.fy, p.fw, p.fh);
      ctx.globalAlpha = 0.30 + 0.70 * f;
      ctx.drawImage(p.glow, p.fx, p.fy, p.fw, p.fh);
      ctx.restore();
    }
  }

  function draw() {
    var dotOff = (t * 0.5) % 8;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, W, H);

    ctx.drawImage(pageCv, 0, 0, W, H);
    ctx.drawImage(dotCv, -dotOff, -dotOff, dotW, dotH);
    drawPanels(lastDt);
    ctx.drawImage(grainCv, 0, 0, W, H);
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
