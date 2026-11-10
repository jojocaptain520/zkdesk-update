/* Mecha Manga screensaver
 * High key comic page, machines only: a mecha head close up with a glowing
 * mono eye, a mecha unit launching with speed lines and thruster flame, and a
 * gear / joint close up with sparks. No people, no faces, no humanoid figures.
 *
 * Everything is pre-rendered into offscreen canvases on layout()/resize.
 * The frame loop only does drawImage / clip / globalAlpha / short strokes, so
 * no shadowBlur, createRadialGradient, getImageData or fillText happen there.
 */
(function () {
  'use strict';

  var canvas = document.getElementById('scene');
  var ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) { return; }

  var MAX_DPR = 1.5;
  var PAPER = '#fdfaf3';
  var LINE = '#33405a';
  var BLUE = '#cfe0f4';
  var CYAN = '#35c8ff';
  var ORANGE = '#ff9a3c';
  var STEEL = '#dfe8f3';
  var STEEL2 = '#c6d4e7';
  var STEEL3 = '#a9bcd6';
  var FONT = '"Microsoft YaHei UI","Microsoft YaHei","PingFang SC","Segoe UI",sans-serif';

  var W = 1;
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
  var toneTile = null;
  var pageDotTile = null;
  var sparkCyan = null;
  var sparkOrange = null;
  var starBig = null;

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

  function makeSparkle(px, core, halo) {
    var c = mkCanvas(px, px);
    var g = ctxOf(c);
    var r = px * 0.5;
    var rg = g.createRadialGradient(r, r, 0, r, r, r);
    rg.addColorStop(0, halo);
    rg.addColorStop(0.35, halo.replace(/[\d.]+\)$/, '0.14)'));
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

  /* soft neon stroke from stacked translucent passes */
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

  /* unit space polygon helper */
  function uPoly(g, pts) {
    var p2 = new Path2D();
    for (var i = 0; i < pts.length; i++) {
      if (i === 0) { p2.moveTo(pts[i][0], pts[i][1]); } else { p2.lineTo(pts[i][0], pts[i][1]); }
    }
    p2.closePath();
    return p2;
  }

  /* ============================================================= SPRITES = */

  function makeLens(px) {
    var c = mkCanvas(px, px);
    var g = ctxOf(c);
    var r = px * 0.5;
    var rg = g.createRadialGradient(r, r, 0, r, r, r);
    rg.addColorStop(0, 'rgba(53,200,255,0.90)');
    rg.addColorStop(0.30, 'rgba(53,200,255,0.50)');
    rg.addColorStop(0.52, 'rgba(53,200,255,0.15)');
    rg.addColorStop(1, 'rgba(53,200,255,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, px, px);
    g.beginPath();
    g.arc(r, r, px * 0.205, 0, 6.2832);
    g.fillStyle = '#223050';
    g.fill();
    g.strokeStyle = 'rgba(51,64,90,0.9)';
    g.lineWidth = Math.max(1, px * 0.014);
    g.stroke();
    g.beginPath();
    g.arc(r, r, px * 0.165, 0, 6.2832);
    g.fillStyle = CYAN;
    g.fill();
    g.beginPath();
    g.arc(r, r, px * 0.100, 0, 6.2832);
    g.fillStyle = '#b6f0ff';
    g.fill();
    g.beginPath();
    g.arc(r - px * 0.045, r - px * 0.045, px * 0.046, 0, 6.2832);
    g.fillStyle = '#ffffff';
    g.fill();
    return c;
  }

  function makeFlame(w, h) {
    var c = mkCanvas(w, h);
    var g = ctxOf(c);
    var lg = g.createLinearGradient(w, 0, 0, 0);
    lg.addColorStop(0, 'rgba(255,255,255,0.96)');
    lg.addColorStop(0.16, 'rgba(255,232,170,0.95)');
    lg.addColorStop(0.44, 'rgba(255,154,60,0.88)');
    lg.addColorStop(0.76, 'rgba(255,140,52,0.35)');
    lg.addColorStop(1, 'rgba(255,150,60,0)');
    g.fillStyle = lg;
    g.beginPath();
    g.moveTo(w, h * 0.50);
    g.quadraticCurveTo(w * 0.52, h * 0.04, w * 0.10, h * 0.34);
    g.quadraticCurveTo(w * 0.00, h * 0.50, w * 0.10, h * 0.66);
    g.quadraticCurveTo(w * 0.52, h * 0.96, w, h * 0.50);
    g.fill();
    var rg = g.createRadialGradient(w * 0.90, h * 0.5, 0, w * 0.90, h * 0.5, h * 0.55);
    rg.addColorStop(0, 'rgba(255,255,255,0.95)');
    rg.addColorStop(0.45, 'rgba(255,224,160,0.55)');
    rg.addColorStop(1, 'rgba(255,200,120,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, w, h);
    return c;
  }

  function makeGear(px, teeth, fill, shade) {
    var c = mkCanvas(px, px);
    var g = ctxOf(c);
    var r = px * 0.5;
    var rOut = r * 0.95;
    var rBase = r * 0.74;
    var rHub = r * 0.30;
    g.save();
    g.translate(r, r);
    g.fillStyle = fill;
    g.beginPath();
    g.arc(0, 0, rBase, 0, 6.2832);
    g.fill();
    var i, a;
    for (i = 0; i < teeth; i++) {
      a = (i / teeth) * 6.2832;
      g.save();
      g.rotate(a);
      g.beginPath();
      g.moveTo(rBase - 1, -r * 0.105);
      g.lineTo(rOut, -r * 0.068);
      g.lineTo(rOut, r * 0.068);
      g.lineTo(rBase - 1, r * 0.105);
      g.closePath();
      g.fill();
      g.restore();
    }
    g.beginPath();
    g.arc(0, 0, rBase, 0, 6.2832);
    g.strokeStyle = LINE;
    g.lineWidth = Math.max(1.4, px * 0.012);
    g.stroke();
    /* inner ring shading */
    g.beginPath();
    g.arc(0, 0, rBase * 0.80, 0.2, 3.4);
    g.strokeStyle = 'rgba(51,64,90,0.22)';
    g.lineWidth = Math.max(2, px * 0.022);
    g.stroke();
    /* hub */
    g.beginPath();
    g.arc(0, 0, rHub * 1.45, 0, 6.2832);
    g.fillStyle = shade;
    g.fill();
    g.beginPath();
    g.arc(0, 0, rHub, 0, 6.2832);
    g.fillStyle = PAPER;
    g.fill();
    g.strokeStyle = LINE;
    g.lineWidth = Math.max(1.4, px * 0.012);
    g.stroke();
    /* bolts on the hub */
    var b;
    for (b = 0; b < 5; b++) {
      g.save();
      g.rotate((b / 5) * 6.2832 + 0.4);
      g.beginPath();
      g.arc(0, -rHub * 1.28, Math.max(1.6, px * 0.016), 0, 6.2832);
      g.fillStyle = 'rgba(51,64,90,0.55)';
      g.fill();
      g.restore();
    }
    g.restore();
    return c;
  }

  /* =========================================================== GEOMETRY = */

  var PANEL_DEF = [
    /* main panel: mecha head close up, top left, about 62% x 70% */
    { tl: [0.030, 0.196], u: [0.614, -0.044], v: [-0.016, 0.652] },
    /* small panel: mecha launching, top right */
    { tl: [0.676, 0.190], u: [0.308, -0.020], v: [-0.014, 0.272] },
    /* small panel: gears and sparks, bottom right */
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
      var minX = Math.min(tl.x, tr.x, bl.x, br.x);
      var minY = Math.min(tl.y, tr.y, bl.y, br.y);

      var p = {
        index: i,
        tl: tl, u: u, v: v, bw: bw, bh: bh,
        mtx: [u.x / bw, u.y / bw, v.x / bh, v.y / bh, tl.x, tl.y],
        bbox: {
          x: minX, y: minY,
          w: Math.max(tl.x, tr.x, bl.x, br.x) - minX,
          h: Math.max(tl.y, tr.y, bl.y, br.y) - minY
        },
        eye: null, streak: null, streakOff: 0, flames: [], gears: [], sparks: []
      };
      p.path = new Path2D();
      p.path.moveTo(tl.x, tl.y);
      p.path.lineTo(tr.x, tr.y);
      p.path.lineTo(br.x, br.y);
      p.path.lineTo(bl.x, bl.y);
      p.path.closePath();

      p.content = mkCanvas(bw, bh);
      var g = ctxOf(p.content);
      if (i === 0) { paintMechaHead(p, g, bw, bh, m); }
      else if (i === 1) { paintLaunch(p, g, bw, bh, m); }
      else { paintGears(p, g, bw, bh, m); }

      buildChrome(p, m);
      panels.push(p);
    }
  }

  /* ================================================== PANEL 0: MECHA HEAD */

  var MECHA = {
    out: [
      [-0.98, 0.06], [-0.96, -0.34], [-0.78, -0.72], [-0.44, -0.94],
      [-0.06, -0.98], [0.26, -0.96], [0.50, -0.82], [0.62, -0.60],
      [0.80, -0.50], [0.86, -0.14], [0.84, 0.08], [0.62, 0.30],
      [0.52, 0.46], [0.26, 0.60], [0.00, 0.64], [-0.28, 0.56],
      [-0.58, 0.42], [-0.82, 0.24]
    ],
    cap: [
      [-0.92, -0.42], [-0.76, -0.74], [-0.42, -0.94], [-0.06, -0.98],
      [0.24, -0.96], [0.46, -0.84], [0.30, -0.64], [-0.10, -0.72],
      [-0.50, -0.64]
    ],
    side: [
      [-0.94, -0.30], [-0.92, 0.08], [-0.78, 0.28], [-0.52, 0.44],
      [-0.26, 0.54], [-0.34, 0.20], [-0.56, -0.10], [-0.74, -0.34]
    ],
    facePl: [
      [0.26, -0.60], [0.60, -0.56], [0.82, -0.42], [0.86, -0.14],
      [0.84, 0.08], [0.62, 0.30], [0.34, 0.18], [0.20, -0.26]
    ],
    brow: [[-0.14, -0.46], [0.80, -0.54], [0.84, -0.36], [-0.10, -0.28]],
    cheek: [[0.60, 0.28], [0.52, 0.46], [0.26, 0.60], [0.08, 0.38], [0.30, 0.22]],
    sock: [[-0.10, -0.30], [0.74, -0.38], [0.78, -0.10], [-0.06, -0.02]],
    ant1: [[0.02, -0.94], [0.12, -1.00], [-0.86, -1.06], [-0.92, -0.98]],
    ant2: [[-0.34, -0.88], [-0.30, -0.96], [-1.02, -0.80], [-1.04, -0.72]],
    neck1: [[-0.40, 0.62], [0.26, 0.62], [0.30, 0.80], [-0.44, 0.80]],
    neck2: [[-0.44, 0.84], [0.30, 0.84], [0.34, 1.04], [-0.48, 1.04]],
    sh: [[-1.12, 1.12], [-0.20, 1.02], [0.60, 1.22], [0.74, 1.72], [-1.06, 1.72]],
    podAt: [-0.72, -0.02],
    podR: 0.215
  };

  function paintMechaHead(p, g, bw, bh, m) {
    var s = bh * 0.540;
    var ox = bw * 0.470;
    var oy = bh * 0.600;
    var rot = -0.06;
    var cs = Math.cos(rot);
    var sn = Math.sin(rot);
    var lw = clamp(m * 0.0038, 1.9, 3.8);
    var ink = lw / s;
    var mtx = [s * cs, s * sn, -s * sn, s * cs, ox, oy];
    var i;

    function faceXf() {
      g.translate(ox, oy);
      g.rotate(rot);
      g.scale(s, s);
    }
    function fill(pts, color) {
      g.fillStyle = color;
      g.fill(uPoly(g, pts));
    }
    function shape(pts, color, width) {
      var p2 = uPoly(g, pts);
      if (color) { g.fillStyle = color; g.fill(p2); }
      g.strokeStyle = LINE;
      g.lineWidth = width || ink;
      g.lineJoin = 'miter';
      g.stroke(p2);
      return p2;
    }
    function line(x1, y1, x2, y2, w) {
      g.beginPath();
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
      g.strokeStyle = LINE;
      g.lineWidth = w || ink * 0.7;
      g.stroke();
    }
    function bolt(x, y, r) {
      g.beginPath();
      g.arc(x, y, r, 0, 6.2832);
      g.fillStyle = STEEL3;
      g.fill();
      g.strokeStyle = LINE;
      g.lineWidth = ink * 0.55;
      g.stroke();
    }

    /* ---- background: sky + halftone + speed rays behind the head */
    var sky = g.createLinearGradient(0, 0, 0, bh);
    sky.addColorStop(0, '#e8f1fb');
    sky.addColorStop(0.55, '#f6faff');
    sky.addColorStop(1, '#fdfaf3');
    g.fillStyle = sky;
    g.fillRect(0, 0, bw, bh);
    g.save();
    g.globalAlpha = 0.34;
    g.fillStyle = tilePattern(g, toneTile);
    g.fillRect(0, 0, bw, bh);
    g.restore();

    var cx = bw * 0.47;
    var cy = bh * 0.46;
    var R = Math.sqrt(bw * bw + bh * bh) * 0.6;
    var rnd = rngOf(0x3ac7);
    var k, a, r0, len;
    g.save();
    g.lineCap = 'butt';
    for (k = 0; k < 120; k++) {
      a = rnd() * 6.2832;
      r0 = R * (0.16 + rnd() * 0.30);
      len = R * (0.30 + rnd() * 0.9);
      g.strokeStyle = 'rgba(51,64,90,' + (0.04 + rnd() * 0.10).toFixed(3) + ')';
      g.lineWidth = (0.7 + rnd() * 1.9) * (m / 900);
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      g.lineTo(cx + Math.cos(a) * (r0 + len), cy + Math.sin(a) * (r0 + len));
      g.stroke();
    }
    g.restore();

    /* ---- head assembly */
    g.save();
    faceXf();

    /* antennas: steel blades with warm tips */
    shape(MECHA.ant2, STEEL2, ink);
    shape(MECHA.ant1, STEEL, ink);
    fill([[0.04, -0.955], [0.10, -0.995], [-0.10, -1.00], [-0.12, -0.965]], ORANGE);
    fill([[-0.83, -0.845], [-0.86, -0.885], [-1.01, -0.805], [-1.015, -0.775]], ORANGE);

    /* shoulder plate under the head */
    shape(MECHA.sh, STEEL2, ink);
    fill([[-0.62, 1.16], [-0.06, 1.10], [0.30, 1.24], [0.33, 1.44], [-0.58, 1.50]], STEEL);
    fill([[-0.90, 1.56], [-0.10, 1.44], [0.40, 1.58], [0.42, 1.68], [-0.94, 1.70]], CYAN);
    line(-0.70, 1.20, -0.10, 1.32, ink * 0.6);
    line(0.02, 1.26, 0.18, 1.62, ink * 0.6);
    bolt(-0.52, 1.30, 0.045);
    bolt(0.10, 1.36, 0.045);

    /* neck rings */
    var neckShade = [[-0.44, 0.62], [0.26, 0.62], [0.30, 0.80], [-0.44, 0.80]];
    shape(MECHA.neck1, STEEL3, ink);
    shape(MECHA.neck2, STEEL2, ink);
    for (k = 0; k < 6; k++) {
      line(-0.36 + k * 0.12, 0.64, -0.38 + k * 0.12, 0.78, ink * 0.5);
    }
    line(-0.34, 0.86, -0.32, 1.02, ink * 0.5);
    line(-0.16, 0.86, -0.14, 1.02, ink * 0.5);
    line(0.02, 0.86, 0.04, 1.02, ink * 0.5);
    g.fillStyle = 'rgba(51,64,90,0.18)';
    g.fill(uPoly(g, neckShade));

    /* crest fin on the crown */
    shape([[0.10, -0.94], [0.20, -0.98], [-0.06, -1.34], [-0.16, -1.30]], '#eef4fb', ink);
    fill([[-0.02, -0.97], [0.06, -1.00], [-0.10, -1.28], [-0.15, -1.25]], ORANGE);

    /* head base plate */
    shape(MECHA.out, STEEL, ink * 1.2);

    /* crown cap plate, paper highlight on the leading edges */
    shape(MECHA.cap, '#eef4fb', ink);
    fill([[-0.68, -0.72], [-0.44, -0.90], [-0.10, -0.94], [-0.16, -0.84], [-0.56, -0.78]], PAPER);
    fill([[0.24, -0.90], [0.42, -0.82], [0.34, -0.74], [0.16, -0.80]], PAPER);

    /* back side plate */
    shape(MECHA.side, STEEL2, ink);
    line(-0.86, -0.12, -0.54, 0.02, ink * 0.55);
    line(-0.60, -0.30, -0.38, 0.30, ink * 0.55);
    bolt(-0.80, -0.20, 0.034);

    /* face / visor housing */
    shape(MECHA.facePl, '#e7eff9', ink);
    fill([[0.30, -0.54], [0.58, -0.50], [0.78, -0.40], [0.74, -0.34], [0.34, -0.40]], 'rgba(51,64,90,0.10)');

    /* brow armour plate above the sensor slot */
    shape(MECHA.brow, STEEL2, ink);
    fill([[-0.13, -0.30], [0.81, -0.37], [0.81, -0.32], [-0.11, -0.25]], 'rgba(51,64,90,0.16)');

    /* side pod (sensor pod on the ear) */
    var podAt = MECHA.podAt;
    var podR = MECHA.podR;
    var hex = [];
    for (k = 0; k < 6; k++) {
      a = -Math.PI / 2 + k * Math.PI / 3;
      hex.push([podAt[0] + Math.cos(a) * podR, podAt[1] + Math.sin(a) * podR]);
    }
    shape(hex, STEEL2, ink);
    g.beginPath();
    g.arc(podAt[0], podAt[1], podR * 0.58, 0, 6.2832);
    g.fillStyle = STEEL3;
    g.fill();
    g.strokeStyle = LINE;
    g.lineWidth = ink * 0.8;
    g.stroke();
    g.beginPath();
    g.arc(podAt[0], podAt[1], podR * 0.30, 0, 6.2832);
    g.fillStyle = '#223050';
    g.fill();
    g.beginPath();
    g.arc(podAt[0], podAt[1], podR * 0.14, 0, 6.2832);
    g.fillStyle = CYAN;
    g.fill();

    /* sensor slot: dark visor band, the moving lens is drawn every frame */
    shape(MECHA.sock, '#2b3a5c', ink * 0.9);
    fill([[-0.12, -0.335], [0.76, -0.415], [0.76, -0.355], [-0.11, -0.275]], CYAN);
    fill([[-0.10, -0.03], [0.77, -0.11], [0.77, -0.06], [-0.09, 0.02]], 'rgba(53,200,255,0.50)');
    line(-0.09, -0.005, 0.77, -0.085, ink * 0.55);

    /* cheek armour with vents and warning chevrons */
    shape(MECHA.cheek, STEEL3, ink);
    var v;
    for (v = 0; v < 3; v++) {
      fill([[0.26 + v * 0.012, 0.30 + v * 0.062], [0.48, 0.24 + v * 0.062],
        [0.47, 0.285 + v * 0.062], [0.26, 0.345 + v * 0.062]], '#223050');
    }
    fill([[0.42, 0.44], [0.54, 0.38], [0.53, 0.425], [0.42, 0.485]], ORANGE);
    fill([[0.36, 0.50], [0.48, 0.44], [0.47, 0.485], [0.36, 0.545]], ORANGE);

    /* chin grill */
    for (v = 0; v < 3; v++) {
      line(-0.24 + v * 0.02, 0.44 + v * 0.055, 0.16, 0.40 + v * 0.055, ink * 0.7);
    }
    line(-0.30, 0.38, -0.02, 0.34, ink * 0.6);

    /* panel seams */
    line(-0.84, -0.36, -0.30, -0.46, ink * 0.55);
    line(-0.44, -0.90, -0.38, -0.66, ink * 0.55);
    line(0.62, -0.56, 0.30, -0.50, ink * 0.55);
    line(0.20, -0.26, 0.16, 0.34, ink * 0.55);
    line(-0.56, 0.10, -0.18, 0.24, ink * 0.55);

    /* rivets */
    bolt(-0.62, -0.62, 0.034);
    bolt(-0.16, -0.86, 0.034);
    bolt(0.34, -0.66, 0.030);
    bolt(-0.48, 0.30, 0.034);
    bolt(0.36, 0.02, 0.030);

    /* halftone shading on the lower armour */
    g.save();
    g.globalAlpha = 0.34;
    g.fillStyle = tilePattern(g, toneTile);
    g.fill(uPoly(g, [[0.86, -0.10], [0.84, 0.08], [0.62, 0.30], [0.52, 0.46],
      [0.26, 0.60], [0.00, 0.64], [0.10, 0.44], [0.40, 0.26], [0.70, 0.06]]));
    g.fill(uPoly(g, [[-0.44, 0.62], [0.30, 0.62], [0.34, 1.04], [-0.48, 1.06]]));
    g.restore();

    /* cyan inner light bounce along the jaw */
    g.strokeStyle = 'rgba(53,200,255,0.45)';
    g.lineWidth = ink * 1.6;
    g.beginPath();
    g.moveTo(0.78, -0.06);
    g.lineTo(0.62, 0.30);
    g.stroke();

    /* cables from the pod to the shoulder */
    g.strokeStyle = 'rgba(51,64,90,0.55)';
    g.lineWidth = ink * 1.1;
    g.beginPath();
    g.moveTo(-0.80, 0.20);
    g.bezierCurveTo(-0.86, 0.62, -0.72, 0.90, -0.66, 1.16);
    g.stroke();
    g.beginPath();
    g.moveTo(-0.68, 0.18);
    g.bezierCurveTo(-0.62, 0.60, -0.56, 0.88, -0.52, 1.12);
    g.stroke();

    g.restore();

    /* eye data for the frame loop (local coordinates) */
    var ex = 0.06;
    var ey = -0.200;
    var vl = 0.56;
    var lens = 0.56 * s;
    p.eye = {
      x0: ox + s * (ex * cs - ey * sn),
      y0: oy + s * (ex * sn + ey * cs),
      ax: s * (vl * cs),
      ay: s * (vl * sn),
      r: lens,
      lens: makeLens(Math.max(18, Math.round(lens)))
    };
  }

  /* ================================================= PANEL 1: MECHA FLIGHT */

  function paintLaunch(p, g, bw, bh, m) {
    var sky = g.createLinearGradient(0, 0, bw * 0.2, bh);
    sky.addColorStop(0, '#cfe2f8');
    sky.addColorStop(0.5, '#e6f0fc');
    sky.addColorStop(1, '#fdfaf3');
    g.fillStyle = sky;
    g.fillRect(0, 0, bw, bh);

    g.save();
    g.globalAlpha = 0.36;
    g.fillStyle = tilePattern(g, toneTile);
    g.fillRect(0, 0, bw, bh);
    g.restore();

    /* cyan glow low left, warm thrust glow at the tail */
    var rg = g.createRadialGradient(bw * 0.20, bh * 0.86, 0, bw * 0.20, bh * 0.86, bw * 0.62);
    rg.addColorStop(0, 'rgba(53,200,255,0.30)');
    rg.addColorStop(1, 'rgba(53,200,255,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, bw, bh);
    var rg2 = g.createRadialGradient(bw * 0.30, bh * 0.52, 0, bw * 0.30, bh * 0.52, bw * 0.5);
    rg2.addColorStop(0, 'rgba(255,154,60,0.34)');
    rg2.addColorStop(1, 'rgba(255,154,60,0)');
    g.fillStyle = rg2;
    g.fillRect(0, 0, bw, bh);

    /* static launch rails / motion streaks (the animated band is separate) */
    var rnd = rngOf(0x6d21);
    var k, yy, x0, x1;
    g.save();
    g.lineCap = 'round';
    for (k = 0; k < 46; k++) {
      yy = bh * (rnd() * 1.05 - 0.02);
      x0 = bw * (rnd() * 0.8);
      x1 = x0 + bw * (0.06 + rnd() * 0.26);
      g.strokeStyle = rnd() < 0.3
        ? 'rgba(53,200,255,' + (0.10 + rnd() * 0.16).toFixed(2) + ')'
        : 'rgba(51,64,90,' + (0.06 + rnd() * 0.12).toFixed(2) + ')';
      g.lineWidth = (0.8 + rnd() * 1.8) * (m / 900);
      g.beginPath();
      g.moveTo(x0, yy);
      g.lineTo(x1, yy);
      g.stroke();
    }
    g.restore();

    /* ---- the mecha unit: armoured flight frame, no humanoid silhouette */
    var u = bh * 0.60;
    var cx = bw * 0.58;
    var cy = bh * 0.50;
    var rot = -0.06;
    var cs = Math.cos(rot);
    var sn = Math.sin(rot);
    var ink = clamp(m * 0.0036, 1.7, 3.4) / u;

    g.save();
    g.translate(cx, cy);
    g.rotate(rot);
    g.scale(u, u);

    function P(pts, color, w) {
      var p2 = uPoly(g, pts);
      if (color) { g.fillStyle = color; g.fill(p2); }
      g.strokeStyle = LINE;
      g.lineWidth = w || ink;
      g.lineJoin = 'miter';
      g.stroke(p2);
      return p2;
    }

    /* thruster frame behind the hull */
    P([[-0.86, -0.20], [-1.28, -0.30], [-1.34, -0.12], [-0.90, 0.02]], STEEL3, ink);
    P([[-0.88, 0.06], [-1.34, 0.10], [-1.36, 0.26], [-0.86, 0.24]], STEEL3, ink);
    /* nozzles */
    P([[-1.30, -0.24], [-1.46, -0.20], [-1.46, 0.00], [-1.30, 0.02]], '#33405a', ink);
    P([[-1.30, 0.08], [-1.46, 0.12], [-1.46, 0.26], [-1.30, 0.26]], '#33405a', ink);

    /* main hull */
    P([[1.42, 0.02], [0.62, -0.26], [-0.10, -0.34], [-0.86, -0.22],
      [-1.04, 0.02], [-0.92, 0.26], [-0.20, 0.34], [0.56, 0.28]], STEEL, ink * 1.2);
    /* swept winglets */
    P([[0.10, -0.30], [0.52, -0.24], [0.16, -0.62], [-0.06, -0.58]], STEEL2, ink);
    P([[-0.30, 0.30], [-0.70, 0.24], [-0.52, 0.54], [-0.20, 0.50]], STEEL2, ink);
    g.fillStyle = 'rgba(53,200,255,0.55)';
    g.beginPath();
    g.moveTo(0.16, -0.56);
    g.lineTo(0.44, -0.28);
    g.lineTo(0.20, -0.30);
    g.lineTo(0.06, -0.50);
    g.closePath();
    g.fill();
    /* rear booster block */
    P([[-0.86, -0.26], [-1.14, -0.30], [-1.16, 0.26], [-0.90, 0.30]], STEEL3, ink);
    /* top deck plate */
    P([[1.16, -0.02], [0.58, -0.22], [-0.04, -0.30], [-0.78, -0.19],
      [-0.66, -0.08], [0.00, -0.16], [0.60, -0.10]], '#eef4fb', ink);
    /* side pods */
    P([[-0.28, -0.16], [0.10, -0.20], [0.22, -0.02], [0.06, 0.12], [-0.26, 0.10]], STEEL2, ink);
    P([[-0.62, 0.04], [-0.34, 0.00], [-0.26, 0.16], [-0.44, 0.26], [-0.66, 0.20]], STEEL2, ink);
    /* sensor head block at the nose with a cyan eye line */
    P([[0.66, -0.16], [1.06, -0.08], [1.16, -0.01], [0.66, 0.02]], '#223050', ink);
    g.fillStyle = CYAN;
    g.beginPath();
    g.moveTo(0.72, -0.11);
    g.lineTo(1.10, -0.05);
    g.lineTo(1.10, -0.02);
    g.lineTo(0.72, -0.06);
    g.closePath();
    g.fill();
    /* hull panel lines and rivets */
    lineHelper([[0.66, -0.06], [0.10, -0.14], [-0.40, -0.08]]);
    lineHelper([[-0.06, 0.24], [0.30, 0.16], [0.60, 0.06]]);
    lineHelper([[-0.90, 0.00], [-0.40, 0.08], [0.10, 0.06]]);
    g.beginPath();
    g.arc(-0.10, 0.02, 0.022, 0, 6.2832);
    g.fillStyle = 'rgba(51,64,90,0.6)';
    g.fill();
    g.beginPath();
    g.arc(0.34, -0.04, 0.020, 0, 6.2832);
    g.fill();
    /* cyan strip along the hull */
    g.fillStyle = 'rgba(53,200,255,0.9)';
    g.beginPath();
    g.moveTo(0.50, 0.18);
    g.lineTo(-0.30, 0.24);
    g.lineTo(-0.30, 0.29);
    g.lineTo(0.50, 0.23);
    g.closePath();
    g.fill();
    /* halftone shading under the hull */
    g.save();
    g.globalAlpha = 0.32;
    g.fillStyle = tilePattern(g, toneTile);
    g.fill(uPoly(g, [[-0.90, 0.10], [0.50, 0.22], [0.56, 0.30], [-0.86, 0.30]]));
    g.restore();
    g.restore();

    function lineHelper(pts) {
      g.beginPath();
      g.moveTo(pts[0][0], pts[0][1]);
      for (var n = 1; n < pts.length; n++) { g.lineTo(pts[n][0], pts[n][1]); }
      g.strokeStyle = 'rgba(51,64,90,0.6)';
      g.lineWidth = ink * 0.55;
      g.stroke();
    }

    /* thruster flames (animated) */
    var fw = u * 1.40;
    var fh1 = u * 0.42;
    var fx = cx + Math.cos(rot) * (-1.46 * u) - Math.sin(rot) * (-0.11 * u);
    var fy = cy + Math.sin(rot) * (-1.46 * u) + Math.cos(rot) * (-0.11 * u);
    p.flames.push({
      x: fx, y: fy - fh1 * 0.22, w: fw, h: fh1, ph: 0.0,
      spr: makeFlame(Math.max(28, Math.round(fw)), Math.max(16, Math.round(fh1)))
    });
    p.flames.push({
      x: fx, y: fy + fh1 * 0.42, w: fw * 0.82, h: fh1 * 0.82, ph: 1.7,
      spr: makeFlame(Math.max(24, Math.round(fw * 0.82)), Math.max(14, Math.round(fh1 * 0.82)))
    });

    /* spark emitter at the nozzles */
    p.sparkAt = { x: fx, y: fy + fh1 * 0.1, w: u * 0.9, h: u * 0.55 };
    makeSparks(p, 14, 0x21ad);

    /* base speed band (animated horizontally) */
    var bandW = Math.round(bw * 0.34) + 8;
    var band = mkCanvas(bw + bandW, bh);
    var bg = ctxOf(band);
    var rr = rngOf(0x1f75);
    var i, y2, xa, xb;
    bg.save();
    bg.lineCap = 'round';
    for (i = 0; i < 34; i++) {
      y2 = rr() * bh;
      xa = rr() * (bw + bandW);
      xb = xa + bandW * (0.25 + rr() * 0.7);
      bg.strokeStyle = rr() < 0.36
        ? 'rgba(53,200,255,' + (0.16 + rr() * 0.22).toFixed(2) + ')'
        : 'rgba(51,64,90,' + (0.10 + rr() * 0.14).toFixed(2) + ')';
      bg.lineWidth = (0.9 + rr() * 1.9) * (m / 900);
      bg.beginPath();
      bg.moveTo(xa, y2);
      bg.lineTo(xb, y2);
      bg.stroke();
    }
    bg.restore();
    p.streak = band;
    p.streakW = bandW;
  }

  /* =================================================== PANEL 2: GEARS */

  function paintGears(p, g, bw, bh, m) {
    var sky = g.createLinearGradient(0, 0, bw, bh);
    sky.addColorStop(0, '#e9f1fb');
    sky.addColorStop(0.5, '#f6faff');
    sky.addColorStop(1, '#fdfaf3');
    g.fillStyle = sky;
    g.fillRect(0, 0, bw, bh);

    g.save();
    g.globalAlpha = 0.34;
    g.fillStyle = tilePattern(g, toneTile);
    g.fillRect(0, 0, bw, bh);
    g.restore();

    var mn = Math.min(bw, bh);

    /* machinery frame behind the gears */
    g.save();
    g.strokeStyle = 'rgba(51,64,90,0.30)';
    g.lineWidth = Math.max(2, mn * 0.016);
    g.beginPath();
    g.moveTo(bw * 0.02, bh * 0.16);
    g.lineTo(bw * 0.98, bh * 0.10);
    g.stroke();
    g.beginPath();
    g.moveTo(bw * 0.04, bh * 0.88);
    g.lineTo(bw * 0.96, bh * 0.94);
    g.stroke();
    g.restore();

    /* hydraulic piston, top right */
    g.save();
    g.translate(bw * 0.80, bh * 0.20);
    g.rotate(-0.22);
    g.fillStyle = STEEL2;
    g.strokeStyle = LINE;
    g.lineWidth = Math.max(1.6, mn * 0.010);
    g.beginPath();
    g.rect(-mn * 0.20, -mn * 0.055, mn * 0.34, mn * 0.11);
    g.fill();
    g.stroke();
    g.fillStyle = STEEL3;
    g.beginPath();
    g.rect(-mn * 0.02, -mn * 0.030, mn * 0.24, mn * 0.06);
    g.fill();
    g.stroke();
    g.fillStyle = ORANGE;
    g.beginPath();
    g.rect(-mn * 0.19, -mn * 0.055, mn * 0.035, mn * 0.11);
    g.fill();
    g.restore();

    /* cable bundle, bottom left */
    g.save();
    g.strokeStyle = 'rgba(51,64,90,0.45)';
    g.lineWidth = Math.max(2, mn * 0.016);
    g.beginPath();
    g.moveTo(-mn * 0.05, bh * 0.78);
    g.bezierCurveTo(bw * 0.20, bh * 0.66, bw * 0.24, bh * 0.96, bw * 0.48, bh * 0.90);
    g.stroke();
    g.beginPath();
    g.moveTo(-mn * 0.05, bh * 0.86);
    g.bezierCurveTo(bw * 0.22, bh * 0.76, bw * 0.26, bh * 1.02, bw * 0.50, bh * 0.96);
    g.stroke();
    g.restore();

    /* warm glow at the meshing point */
    var gx = bw * 0.60;
    var gy = bh * 0.52;
    var rg = g.createRadialGradient(gx, gy, 0, gx, gy, mn * 0.42);
    rg.addColorStop(0, 'rgba(255,154,60,0.42)');
    rg.addColorStop(0.5, 'rgba(255,154,60,0.14)');
    rg.addColorStop(1, 'rgba(255,154,60,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, bw, bh);
    var rg2 = g.createRadialGradient(gx, gy, 0, gx, gy, mn * 0.30);
    rg2.addColorStop(0, 'rgba(53,200,255,0.30)');
    rg2.addColorStop(1, 'rgba(53,200,255,0)');
    g.fillStyle = rg2;
    g.fillRect(0, 0, bw, bh);

    /* gear sprites drawn (rotating) every frame */
    var r1 = mn * 0.40;
    var r2 = mn * 0.24;
    p.gears.push({
      spr: makeGear(Math.max(40, Math.round(r1 * 2)), 16, STEEL2, STEEL3),
      x: bw * 0.36, y: bh * 0.44, r: r1, ang: 0.0, spd: 0.28
    });
    p.gears.push({
      spr: makeGear(Math.max(30, Math.round(r2 * 2)), 12, '#eef4fb', STEEL2),
      x: bw * 0.71, y: bh * 0.66, r: r2, ang: 0.3, spd: -0.46
    });

    p.sparkAt = { x: bw * 0.60, y: bh * 0.52, w: mn * 0.5, h: mn * 0.42 };
    /* baked impact sparks around the meshing point */
    var ir = rngOf(0x9c31);
    var ii;
    for (ii = 0; ii < 16; ii++) {
      var ia = ir() * 6.2832;
      var id = mn * (0.06 + ir() * 0.26);
      var ix = p.sparkAt.x + Math.cos(ia) * id;
      var iy = p.sparkAt.y + Math.sin(ia) * id;
      g.strokeStyle = ii % 2 === 0 ? 'rgba(255,154,60,0.85)' : 'rgba(53,200,255,0.7)';
      g.lineWidth = Math.max(1.2, mn * 0.006);
      g.beginPath();
      g.moveTo(ix, iy);
      g.lineTo(ix + Math.cos(ia) * mn * 0.035, iy + Math.sin(ia) * mn * 0.035);
      g.stroke();
    }
    makeSparks(p, 26, 0x3f1d);
  }

  /* spark particles: pre-rendered sprites, updated in the frame loop */
  function makeSparks(p, n, seed) {
    var rnd = rngOf(seed);
    var at = p.sparkAt;
    var i;
    for (i = 0; i < n; i++) {
      var life = 0.9 + rnd() * 1.6;
      p.sparks.push({
        x: at.x + (rnd() - 0.5) * at.w,
        y: at.y + (rnd() - 0.5) * at.h,
        vx: (rnd() - 0.55) * at.w * 0.55,
        vy: (rnd() - 0.55) * at.h * 0.55,
        life: life, age: rnd() * life,
        size: at.w * (0.075 + rnd() * 0.075),
        spr: rnd() < 0.62 ? sparkOrange : sparkCyan
      });
    }
  }

  /* ============================================================= CHROME = */

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

    g.save();
    g.shadowColor = 'rgba(90,124,170,0.46)';
    g.shadowBlur = m * 0.030;
    g.shadowOffsetY = m * 0.009;
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.lineWidth = border * 2.2;
    g.stroke(p.path);
    g.restore();

    g.strokeStyle = '#fffdf8';
    g.lineWidth = border;
    g.stroke(p.path);
    g.strokeStyle = 'rgba(51,64,90,0.30)';
    g.lineWidth = Math.max(1, border * 0.13);
    g.stroke(p.path);

    p.glow = mkCanvas(p.fw, p.fh);
    var g2 = ctxOf(p.glow);
    g2.translate(-p.fx, -p.fy);
    neonStroke(g2, p.path, Math.max(1.5, border * 0.30), 'rgba(53,200,255,0.95)', 0.55);
    var top = new Path2D();
    top.moveTo(p.tl.x, p.tl.y);
    top.lineTo(p.tl.x + p.u.x, p.tl.y + p.u.y);
    neonStroke(g2, top, Math.max(1.4, border * 0.26), 'rgba(255,154,60,0.95)', 0.55);
  }

  /* ================================================================ PAGE = */

  function buildPage() {
    pageCv = mkCanvas(W, H);
    var g = ctxOf(pageCv);
    g.fillStyle = PAPER;
    g.fillRect(0, 0, W, H);

    g.save();
    g.globalAlpha = 0.78;
    g.fillStyle = tilePattern(g, pageDotTile);
    g.fillRect(0, 0, W, H);
    g.restore();

    var lg = g.createRadialGradient(W * 0.68, H * 0.12, 0, W * 0.68, H * 0.12, Math.max(W, H) * 0.85);
    lg.addColorStop(0, 'rgba(255,255,255,0.50)');
    lg.addColorStop(0.5, 'rgba(255,252,242,0.16)');
    lg.addColorStop(1, 'rgba(255,250,236,0)');
    g.fillStyle = lg;
    g.fillRect(0, 0, W, H);

    /* night tech band: keeps the host exit button area dark */
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

    /* thin tech grid inside the band, left side only */
    g.save();
    g.strokeStyle = 'rgba(53,200,255,0.16)';
    g.lineWidth = Math.max(1, H * 0.0012);
    var gh, i;
    for (gh = 0; gh < 9; gh++) {
      g.beginPath();
      g.moveTo(W * 0.02, H * (0.014 + gh * 0.015));
      g.lineTo(W * 0.50, H * (0.014 + gh * 0.015));
      g.stroke();
    }
    for (i = 0; i < 12; i++) {
      g.beginPath();
      g.moveTo(W * (0.02 + i * 0.042), H * 0.012);
      g.lineTo(W * (0.02 + i * 0.042), H * 0.142);
      g.stroke();
    }
    g.restore();

    /* small stars / rivet dots in the band */
    var brnd = rngOf(0x4b17);
    var bi, bx, by, bs;
    for (bi = 0; bi < 40; bi++) {
      bx = brnd() * W * 0.70;
      by = brnd() * H * 0.130;
      bs = 0.7 + brnd() * 1.3;
      g.fillStyle = 'rgba(253,250,243,' + (0.20 + brnd() * 0.45).toFixed(2) + ')';
      g.beginPath();
      g.arc(bx, by, bs, 0, 6.2832);
      g.fill();
    }

    /* divider lines following the slanted band edge */
    g.fillStyle = 'rgba(255,154,60,0.92)';
    g.beginPath();
    g.moveTo(0, H * 0.146);
    g.lineTo(W, H * 0.156);
    g.lineTo(W, H * 0.156 + Math.max(1, H * 0.0034));
    g.lineTo(0, H * 0.146 + Math.max(1, H * 0.0034));
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(53,200,255,0.90)';
    g.beginPath();
    g.moveTo(0, H * 0.146 + Math.max(2, H * 0.0056));
    g.lineTo(W * 0.42, H * 0.150 + Math.max(2, H * 0.0056));
    g.lineTo(W * 0.42, H * 0.150 + Math.max(2, H * 0.0056) + Math.max(1, H * 0.0018));
    g.lineTo(0, H * 0.146 + Math.max(2, H * 0.0056) + Math.max(1, H * 0.0018));
    g.closePath();
    g.fill();

    var fs = Math.min(H * 0.056, W * 0.029);
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    g.fillStyle = PAPER;
    g.font = '700 ' + fs.toFixed(1) + 'px ' + FONT;
    g.fillText('MECHA MANGA', W * 0.034, H * 0.070);
    var tw = g.measureText('MECHA MANGA').width;
    g.fillStyle = 'rgba(53,200,255,0.95)';
    g.font = '700 ' + (fs * 0.52).toFixed(1) + 'px ' + FONT;
    g.fillText('NO.03', W * 0.034 + tw + fs * 0.62, H * 0.074);
    g.fillStyle = 'rgba(253,250,243,0.62)';
    g.font = '400 ' + (fs * 0.52).toFixed(1) + 'px ' + FONT;
    g.fillText('\u673a\u7532\u6f2b\u5267', W * 0.034 + tw + fs * 2.45, H * 0.074);

    g.fillStyle = 'rgba(51,64,90,0.18)';
    g.fillRect(0, H * 0.988, W, Math.max(1, H * 0.0025));
    g.fillStyle = 'rgba(53,200,255,0.85)';
    g.fillRect(0, H * 0.984, W * 0.13, Math.max(1, H * 0.0022));

    var bw2 = W * 0.112;
    var bh2 = H * 0.038;
    var bx2 = W * 0.984 - bw2;
    var by2 = H * 0.988 - bh2 - H * 0.010;
    g.fillStyle = 'rgba(255,253,248,0.92)';
    g.fillRect(bx2, by2, bw2, bh2);
    g.strokeStyle = 'rgba(51,64,90,0.34)';
    g.lineWidth = Math.max(1.2, H * 0.0022);
    g.strokeRect(bx2, by2, bw2, bh2);
    g.fillStyle = 'rgba(255,154,60,0.95)';
    g.fillRect(bx2, by2, Math.max(2, W * 0.004), bh2);
    g.fillStyle = 'rgba(51,64,90,0.85)';
    g.font = '700 ' + (bh2 * 0.52).toFixed(1) + 'px ' + FONT;
    g.textAlign = 'center';
    g.fillText('SYS ONLINE', bx2 + bw2 * 0.52, by2 + bh2 * 0.54);
  }

  function buildDots() {
    dotW = W + 12;
    dotH = H + 12;
    dotCv = mkCanvas(dotW, dotH);
    var g = ctxOf(dotCv);
    g.fillStyle = tilePattern(g, pageDotTile);
    var y0 = H * 0.153 + 14;
    g.fillRect(0, y0, dotW, dotH - y0);
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

    var rg = g.createRadialGradient(W * 0.5, H * 0.48, Math.min(W, H) * 0.44, W * 0.5, H * 0.5, Math.max(W, H) * 0.82);
    rg.addColorStop(0, 'rgba(110,135,170,0)');
    rg.addColorStop(1, 'rgba(110,135,170,0.14)');
    g.fillStyle = rg;
    g.fillRect(0, 0, W, H);

    buildBubbles(g);
  }

  /* ============================================================= BUBBLES = */

  function drawBubble(g, cx, cy, rx, ry, tip, text, fs, lw) {
    var ang = Math.atan2((tip.y - cy) / ry, (tip.x - cx) / rx);
    var d = 0.26;
    g.beginPath();
    g.ellipse(cx, cy, rx, ry, 0, ang + d, ang - d + 6.283185307, false);
    g.lineTo(tip.x, tip.y);
    g.closePath();
    g.save();
    g.shadowColor = 'rgba(90,124,170,0.38)';
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

    /* system boot */
    drawBubble(g, W * 0.520, H * 0.198, W * 0.104, H * 0.056,
      { x: W * 0.318, y: H * 0.430 },
      '\u7cfb\u7edf\u542f\u52a8', Math.min(H * 0.056 * 0.78, W * 0.0215), lw);

    /* target locked */
    drawBubble(g, W * 0.206, H * 0.884, W * 0.072, H * 0.046,
      { x: W * 0.176, y: H * 0.806 },
      '\u76ee\u6807\u9501\u5b9a', Math.min(H * 0.046 * 0.80, W * 0.0165), lw * 0.82);
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
    starBig = makeSparkle(Math.max(24, Math.round(Math.min(W, H) * 0.070)), 'rgba(255,255,255,0.98)', 'rgba(255,238,220,0.75)');
    sparkCyan = makeSparkle(Math.max(10, Math.round(Math.min(W, H) * 0.016)), 'rgba(220,250,255,0.98)', 'rgba(53,200,255,0.72)');
    sparkOrange = makeSparkle(Math.max(10, Math.round(Math.min(W, H) * 0.017)), 'rgba(255,244,214,0.98)', 'rgba(255,154,60,0.80)');

    buildPage();
    buildDots();
    buildGrain();
    buildPanels();

    focusEase[0] = 1; focusEase[1] = 0; focusEase[2] = 0;
    t = 0;
    last = 0;
  }

  function drawMotion(p, dt) {
    var i;

    /* mono eye scan + flicker (panel 0) */
    if (p.eye) {
      var e = p.eye;
      var sp = 0.5 + 0.5 * Math.sin(t * 0.85);
      var ease = sp * sp * (3 - 2 * sp);
      var lx = e.x0 + e.ax * ease;
      var ly = e.y0 + e.ay * ease;
      var pulse = 0.80 + 0.20 * Math.sin(t * 3.1);
      var flick = 1;
      var cyc = t % 7.4;
      if (cyc > 6.9 && cyc < 7.16) { flick = 0.25 + 0.75 * Math.abs(Math.sin(cyc * 42)); }
      if (cyc > 7.16 && cyc < 7.30) { flick = 0.55; }
      ctx.globalAlpha = pulse * flick;
      ctx.drawImage(e.lens, lx - e.r * 0.5, ly - e.r * 0.5, e.r, e.r);
      ctx.globalAlpha = 1;
    }

    /* launching speed streaks (panel 1) */
    if (p.streak) {
      p.streakOff = (p.streakOff + dt * 170) % p.streakW;
      ctx.drawImage(p.streak, -p.streakOff, 0, p.streak.width / dpr, p.streak.height / dpr);
    }

    /* thruster flames (panel 1) */
    for (i = 0; i < p.flames.length; i++) {
      var fl = p.flames[i];
      var fr = 0.86 + 0.14 * Math.sin(t * 26 + fl.ph) + 0.06 * Math.sin(t * 61 + fl.ph * 2);
      var fw = fl.w * (0.92 + 0.08 * Math.sin(t * 19 + fl.ph));
      var fh = fl.h * fr;
      ctx.globalAlpha = 0.88;
      ctx.drawImage(fl.spr, fl.x - fw, fl.y - fh * 0.5, fw, fh);
      ctx.globalAlpha = 1;
    }

    /* rotating gears (panel 2) */
    for (i = 0; i < p.gears.length; i++) {
      var gr = p.gears[i];
      gr.ang += gr.spd * dt;
      ctx.save();
      ctx.translate(gr.x, gr.y);
      ctx.rotate(gr.ang);
      ctx.drawImage(gr.spr, -gr.r, -gr.r, gr.r * 2, gr.r * 2);
      ctx.restore();
    }

    /* spark particles */
    if (p.sparks.length) {
      for (i = 0; i < p.sparks.length; i++) {
        var sp2 = p.sparks[i];
        sp2.age += dt;
        if (sp2.age > sp2.life) { sp2.age = 0; }
        var u = sp2.age / sp2.life;
        var px = sp2.x + sp2.vx * sp2.age;
        var py = sp2.y + sp2.vy * sp2.age + 42 * sp2.age * sp2.age;
        var fade = Math.sin(Math.PI * u);
        var sz = sp2.size * (0.7 + 0.6 * fade);
        ctx.globalAlpha = fade * 0.95;
        ctx.drawImage(sp2.spr, px - sz * 0.5, py - sz * 0.5, sz, sz);
      }
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

      var veil = 0.28 * (1 - f);
      if (veil > 0.004) {
        ctx.fillStyle = 'rgba(253,250,243,' + veil.toFixed(3) + ')';
        ctx.fillRect(p.bbox.x - 6, p.bbox.y - 6, p.bbox.w + 12, p.bbox.h + 12);
      }
      ctx.restore();

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
