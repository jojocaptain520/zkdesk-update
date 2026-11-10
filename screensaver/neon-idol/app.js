/* Neon Idol - procedural cyber-girl bust: rim light, holo ring, circuit pulse, glitch.
   Everything is drawn with canvas 2D; there is no external asset at all.
   Static layers (city, fog, character, ring) are pre-rendered once per resize;
   the per-frame loop only blits, plus particles / light sweep / rare glitch. */
(function () {
  'use strict';

  var canvas = document.getElementById('scene');
  var ctx = canvas && canvas.getContext('2d');
  if (!ctx) { return; }

  var MAX_DPR = 1.5;
  var TAU = Math.PI * 2;
  var DEG = Math.PI / 180;

  /* composition anchors (screen fractions) */
  var HEAD_U = 0.34;                 /* head height = 34% of screen height */
  var FACE_NX = 0.43, FACE_NY = 0.44;
  var RING_NX = 0.76, RING_NY = 0.60, RING_RF = 0.40;

  var CYAN = '53,230,255';
  var MAG = '255,62,165';
  var AMBER = '255,181,69';

  var W = 1, H = 1, dpr = 1, U = 1, FX = 1, FY = 1;
  var rafId = 0, last = 0, t = 0, resizeTimer = 0;

  var bgC = null;                    /* city + fog + rain + bokeh */
  var chC = null;                    /* character, drawn once */
  var ringC = null, ringSize = 1;
  var shadeC = null, shadeW = 0, shadeH = 0;
  var sweepC = null;
  var glow = {};

  var paths = {};                    /* Path2D cache */
  var bangs = [];                    /* fringe locks, drawn over the crown */
  var loose = [];                    /* strands that sway every frame */
  var circuits = [];                 /* cyber lines (world points) */
  var dust = [];
  var collar = { x: 0, y: 0, rx: 0, ry: 0, rot: 0 };

  var glitch = { next: 5.5, on: false, age: 0, dur: 0.12, slices: [], rgb: CYAN };

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
   *  glow sprites: one soft radial blob per colour, blitted everywhere
   * ------------------------------------------------------------------ */

  function makeGlow(rgb) {
    var s = 128;
    var c = makeCanvas(s, s);
    var g = c.getContext('2d');
    var rg = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    rg.addColorStop(0, 'rgba(' + rgb + ',1)');
    rg.addColorStop(0.16, 'rgba(' + rgb + ',0.66)');
    rg.addColorStop(0.40, 'rgba(' + rgb + ',0.24)');
    rg.addColorStop(0.72, 'rgba(' + rgb + ',0.06)');
    rg.addColorStop(1, 'rgba(' + rgb + ',0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, s, s);
    return c;
  }

  /* ------------------------------------------------------------------ *
   *  holographic tick ring (pre-rendered, rotated per frame)
   * ------------------------------------------------------------------ */

  function renderRing() {
    var R = RING_RF * H;
    var pad = R * 0.16;
    ringSize = (R + pad) * 2;
    var px = Math.max(96, Math.round(ringSize * dpr));
    ringC = makeCanvas(px, px);
    var g = ringC.getContext('2d');
    var k = px / ringSize;
    g.setTransform(k, 0, 0, k, 0, 0);
    g.globalCompositeOperation = 'lighter';
    var cx = ringSize / 2, cy = ringSize / 2;

    /* faint base circle so the ring reads even in the dark */
    [ [CYAN, -2.2, 0.045], [MAG, 2.2, 0.038], ['236,250,255', 0, 0.04] ].forEach(function (v) {
      g.strokeStyle = 'rgba(' + v[0] + ',' + v[2] + ')';
      g.lineWidth = R * 0.05;
      g.beginPath();
      g.arc(cx + v[1], cy, R, 0, TAU);
      g.stroke();
    });

    drawTicks(g, cx, cy, R, CYAN, -2.2, 0, 0.52);
    drawTicks(g, cx, cy, R, MAG, 2.2, 0, 0.44);
    drawTicks(g, cx, cy, R, '236,250,255', 0, -0.8, 0.56);

    /* little data dashes outside the ring */
    g.strokeStyle = 'rgba(' + CYAN + ',0.18)';
    g.lineWidth = Math.max(1, R * 0.0035);
    for (var i = 0; i < 9; i++) {
      var a = -0.55 + i * 0.12;
      var r0 = R * 1.08, r1 = R * (1.08 + (i % 3 === 0 ? 0.085 : 0.04));
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      g.stroke();
    }
  }

  function drawTicks(g, cx, cy, R, rgb, ox, oy, alpha) {
    var n = 64;
    var i, a, len, w, ca, sa, x0, y0, x1, y1;

    for (i = 0; i < n; i++) {
      var f = i / n;
      if (f > 0.575 && f < 0.695) { continue; }   /* visible break: rotation reads */
      a = f * TAU;
      len = (i % 8 === 0) ? R * 0.070 : (i % 4 === 0 ? R * 0.042 : R * 0.022);
      w = (i % 8 === 0) ? R * 0.0068 : R * 0.0034;
      ca = Math.cos(a); sa = Math.sin(a);
      x0 = cx + ox + ca * (R - len); y0 = cy + oy + sa * (R - len);
      x1 = cx + ox + ca * R; y1 = cy + oy + sa * R;
      g.strokeStyle = 'rgba(' + rgb + ',' + (alpha * 0.14) + ')';
      g.lineWidth = w * 5.0;
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      g.strokeStyle = 'rgba(' + rgb + ',' + (alpha * 0.42) + ')';
      g.lineWidth = w * 1.9;
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      g.strokeStyle = 'rgba(' + rgb + ',' + alpha + ')';
      g.lineWidth = w;
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    }

    /* inner broken arcs */
    g.strokeStyle = 'rgba(' + rgb + ',' + (alpha * 0.5) + ')';
    g.lineWidth = Math.max(1, R * 0.0038);
    for (var s = 0; s < 3; s++) {
      g.beginPath();
      g.arc(cx + ox, cy + oy, R * (0.79 + s * 0.052), 0.35 + s * 2.0, 1.45 + s * 2.0);
      g.stroke();
    }
  }

  /* top-right corner stays dark for the host's exit button */
  function renderShade() {
    shadeW = Math.max(300, W * 0.32);
    shadeH = Math.max(120, H * 0.23);
    shadeC = makeCanvas(shadeW * dpr, shadeH * dpr);
    var g = shadeC.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    var vg = g.createLinearGradient(0, 0, 0, shadeH);
    vg.addColorStop(0, 'rgba(3,1,7,0.96)');
    vg.addColorStop(0.55, 'rgba(3,1,7,0.88)');
    vg.addColorStop(1, 'rgba(3,1,7,0)');
    g.fillStyle = vg;
    g.fillRect(0, 0, shadeW, shadeH);

    g.globalCompositeOperation = 'destination-out';
    var hg = g.createLinearGradient(0, 0, shadeW, 0);
    hg.addColorStop(0, 'rgba(0,0,0,1)');
    hg.addColorStop(0.30, 'rgba(0,0,0,0.95)');
    hg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = hg;
    g.fillRect(0, 0, shadeW, shadeH);
  }

  /* soft diagonal light band that sweeps across every ~13s */
  function renderSweep() {
    var s = 256;
    sweepC = makeCanvas(s, s);
    var g = sweepC.getContext('2d');
    var lg = g.createLinearGradient(0, s, s, 0);
    lg.addColorStop(0, 'rgba(120,230,255,0)');
    lg.addColorStop(0.44, 'rgba(140,235,255,0.05)');
    lg.addColorStop(0.50, 'rgba(235,252,255,0.10)');
    lg.addColorStop(0.56, 'rgba(255,120,200,0.05)');
    lg.addColorStop(1, 'rgba(255,120,200,0)');
    g.fillStyle = lg;
    g.fillRect(0, 0, s, s);
  }

  /* ------------------------------------------------------------------ *
   *  background: purple-black night, distant city, neon fog, rain, bokeh
   * ------------------------------------------------------------------ */

  function radial(g, cx, cy, r, rgb, a) {
    var rg = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(1, r));
    rg.addColorStop(0, 'rgba(' + rgb + ',' + a + ')');
    rg.addColorStop(0.42, 'rgba(' + rgb + ',' + (a * 0.48) + ')');
    rg.addColorStop(0.75, 'rgba(' + rgb + ',' + (a * 0.13) + ')');
    rg.addColorStop(1, 'rgba(' + rgb + ',0)');
    g.fillStyle = rg;
    g.fillRect(cx - r, cy - r, r * 2, r * 2);
  }

  function renderBg() {
    bgC = makeCanvas(W * dpr, H * dpr);
    var g = bgC.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    var lg = g.createLinearGradient(W * 0.12, 0, W * 0.55, H);
    lg.addColorStop(0, '#0d0718');
    lg.addColorStop(0.36, '#07040e');
    lg.addColorStop(0.72, '#12071a');
    lg.addColorStop(1, '#1e0c2a');
    g.fillStyle = lg;
    g.fillRect(0, 0, W, H);

    drawCity(g);

    g.globalCompositeOperation = 'lighter';
    radial(g, W * 0.17, H * 0.40, H * 0.72, '150,32,146', 0.34);
    radial(g, W * 0.28, H * 0.33, H * 0.46, '255,62,165', 0.19);
    radial(g, W * 0.71, H * 0.29, H * 0.64, CYAN, 0.15);
    radial(g, W * 0.50, H * 0.90, W * 0.50, '124,36,146', 0.26);
    radial(g, W * 0.87, H * 0.66, H * 0.38, AMBER, 0.09);
    radial(g, W * 0.06, H * 0.72, H * 0.34, CYAN, 0.08);

    /* halo right behind the head so the silhouette pops */
    radial(g, FX + U * 0.10, FY + U * 0.22, U * 1.85, '255,96,186', 0.36);
    radial(g, FX + U * 0.05, FY + U * 0.18, U * 1.00, '255,158,220', 0.20);
    radial(g, FX - U * 0.28, FY - U * 0.10, U * 1.30, CYAN, 0.18);

    /* vertical hologram column on the right */
    var colX = W * 0.79;
    var cw = Math.max(3, W * 0.013);
    var cg = g.createLinearGradient(colX - cw, 0, colX + cw, 0);
    cg.addColorStop(0, 'rgba(' + CYAN + ',0)');
    cg.addColorStop(0.36, 'rgba(' + CYAN + ',0.07)');
    cg.addColorStop(0.5, 'rgba(210,250,255,0.13)');
    cg.addColorStop(0.64, 'rgba(' + MAG + ',0.07)');
    cg.addColorStop(1, 'rgba(' + MAG + ',0)');
    g.fillStyle = cg;
    g.fillRect(colX - cw, 0, cw * 2, H);

    drawRain(g);
    drawBokeh(g);
    g.globalCompositeOperation = 'source-over';

    /* bottom haze so the body melts into the frame instead of a hard cut */
    var bh = g.createLinearGradient(0, H * 0.74, 0, H);
    bh.addColorStop(0, 'rgba(26,10,36,0)');
    bh.addColorStop(0.6, 'rgba(48,16,66,0.20)');
    bh.addColorStop(1, 'rgba(70,22,90,0.34)');
    g.fillStyle = bh;
    g.fillRect(0, H * 0.74, W, H * 0.26);

    drawNoise(g);
  }

  function drawCity(g) {
    var i, x, w, top, wy, wx;

    var far = [
      [0.00, 0.10, 0.46], [0.09, 0.13, 0.38], [0.20, 0.09, 0.52],
      [0.30, 0.12, 0.44], [0.63, 0.11, 0.48], [0.72, 0.14, 0.40],
      [0.84, 0.10, 0.50], [0.93, 0.12, 0.42]
    ];
    g.fillStyle = 'rgba(13,7,24,0.96)';
    for (i = 0; i < far.length; i++) {
      x = far[i][0] * W;
      w = far[i][1] * W;
      top = H * (0.92 - far[i][2] * 0.36);
      g.fillRect(x, top, w, H - top);
    }

    for (i = 0; i < far.length; i++) {
      x = far[i][0] * W;
      w = far[i][1] * W;
      top = H * (0.92 - far[i][2] * 0.36);
      var cols = Math.max(2, Math.floor(w / (W * 0.012)));
      var rows = Math.max(2, Math.floor((H - top) / (H * 0.030)));
      for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
          if (Math.random() > 0.22) { continue; }
          wy = top + H * 0.018 + r * H * 0.030;
          wx = x + W * 0.006 + c * (w / cols);
          var pick = Math.random();
          g.fillStyle = pick < 0.44 ? 'rgba(' + CYAN + ',0.34)'
            : (pick < 0.78 ? 'rgba(' + MAG + ',0.30)' : 'rgba(' + AMBER + ',0.32)');
          g.fillRect(wx, wy, Math.max(1, W * 0.0018), Math.max(1, H * 0.007));
        }
      }
    }

    var near = [
      [0.00, 0.16, 0.55], [0.14, 0.09, 0.38], [0.79, 0.13, 0.46], [0.90, 0.12, 0.58]
    ];
    g.fillStyle = 'rgba(7,4,13,0.98)';
    for (i = 0; i < near.length; i++) {
      x = near[i][0] * W;
      w = near[i][1] * W;
      top = H * (0.955 - near[i][2] * 0.30);
      g.fillRect(x, top, w, H - top);
      g.fillRect(x + w * 0.5, top - H * 0.055, Math.max(1, W * 0.0012), H * 0.055);
    }

    g.globalCompositeOperation = 'lighter';
    var hg = g.createLinearGradient(0, H * 0.72, 0, H);
    hg.addColorStop(0, 'rgba(' + MAG + ',0)');
    hg.addColorStop(0.35, 'rgba(' + MAG + ',0.20)');
    hg.addColorStop(0.72, 'rgba(' + MAG + ',0.13)');
    hg.addColorStop(1, 'rgba(' + CYAN + ',0.10)');
    g.fillStyle = hg;
    g.fillRect(0, H * 0.72, W, H * 0.28);
    g.globalCompositeOperation = 'source-over';
  }

  function drawRain(g) {
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'butt';
    var n = Math.round(Math.min(150, 60 + W * H / 12000));
    for (var i = 0; i < n; i++) {
      var x = Math.random() * W;
      var y = Math.random() * H;
      var len = rand(0.012, 0.048) * H;
      var a = rand(0.020, 0.075);
      g.strokeStyle = 'rgba(150,220,255,' + a.toFixed(3) + ')';
      g.lineWidth = rand(0.7, 1.6);
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x - W * 0.0015, y + len);
      g.stroke();
    }
    g.globalCompositeOperation = 'source-over';
  }

  function drawBokeh(g) {
    g.globalCompositeOperation = 'lighter';
    var spots = [
      [0.13, 0.16, 0.055, CYAN, 0.11], [0.22, 0.30, 0.030, MAG, 0.14],
      [0.34, 0.13, 0.042, MAG, 0.10], [0.52, 0.09, 0.022, AMBER, 0.11],
      [0.60, 0.24, 0.034, CYAN, 0.09], [0.68, 0.12, 0.026, MAG, 0.11],
      [0.80, 0.22, 0.038, CYAN, 0.10], [0.90, 0.33, 0.048, MAG, 0.09],
      [0.83, 0.48, 0.030, AMBER, 0.10], [0.95, 0.62, 0.040, CYAN, 0.08],
      [0.07, 0.52, 0.045, MAG, 0.09], [0.18, 0.64, 0.028, AMBER, 0.08],
      [0.42, 0.12, 0.018, '255,255,255', 0.11], [0.74, 0.42, 0.034, MAG, 0.08],
      [0.27, 0.46, 0.020, CYAN, 0.10], [0.88, 0.90, 0.055, MAG, 0.08]
    ];
    for (var i = 0; i < spots.length; i++) {
      var s = spots[i];
      radial(g, s[0] * W, s[1] * H, s[2] * H, s[3], s[4]);
    }
    g.globalCompositeOperation = 'source-over';
  }

  function drawNoise(g) {
    var s = 180;
    var n = makeCanvas(s, s);
    var ng = n.getContext('2d');
    var img = ng.createImageData(s, s);
    var d = img.data;
    for (var i = 0; i < d.length; i += 4) {
      var v = 90 + ((Math.random() * 150) | 0);
      d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 18;
    }
    ng.putImageData(img, 0, 0);
    g.save();
    g.globalAlpha = 0.55;
    var pat = g.createPattern(n, 'repeat');
    if (pat) {
      g.fillStyle = pat;
      g.fillRect(0, 0, W, H);
    }
    g.restore();
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

    /* back hair: full volume over the crown, long straight mass below */
    p = new Path2D();
    p.moveTo(lx(-0.480), ly(0.14));
    p.bezierCurveTo(lx(-0.600), ly(-0.20), lx(-0.415), ly(-0.650), lx(0.02), ly(-0.735));
    p.bezierCurveTo(lx(0.440), ly(-0.650), lx(0.610), ly(-0.20), lx(0.495), ly(0.14));
    p.bezierCurveTo(lx(0.615), ly(0.52), lx(0.770), ly(1.04), lx(1.02), ly(1.98));
    p.lineTo(lx(-1.04), ly(1.98));
    p.bezierCurveTo(lx(-0.790), ly(1.04), lx(-0.625), ly(0.52), lx(-0.480), ly(0.14));
    p.closePath();
    paths.hair = p;

    /* crown: hair over the top of the skull, wavy side-swept hairline */
    p = new Path2D();
    p.moveTo(lx(-0.460), ly(0.09));
    p.bezierCurveTo(lx(-0.545), ly(-0.21), lx(-0.395), ly(-0.655), lx(0.02), ly(-0.735));
    p.bezierCurveTo(lx(0.415), ly(-0.655), lx(0.580), ly(-0.21), lx(0.470), ly(0.07));
    /* hairline: high at the part on the right, one smooth sweep to the left */
    p.bezierCurveTo(lx(0.472), ly(-0.120), lx(0.440), ly(-0.290), lx(0.330), ly(-0.330));
    p.bezierCurveTo(lx(0.200), ly(-0.265), lx(0.060), ly(-0.205), lx(-0.090), ly(-0.190));
    p.bezierCurveTo(lx(-0.240), ly(-0.175), lx(-0.380), ly(-0.110), lx(-0.460), ly(0.090));
    p.closePath();
    paths.cap = p;

    /* fringe locks: overlapping strands that make the visible fringe edge */
    bangs.length = 0;
    addBang(0.315, -0.330, 0.200, -0.180, 0.250, -0.015, 0.100, 0.030, 0);
    addBang(0.225, -0.420, 0.110, -0.205, 0.140, -0.055, 0.098, 0.030, 1);
    addBang(0.130, -0.480, 0.010, -0.215, 0.030, 0.015, 0.096, 0.030, 0);
    addBang(0.030, -0.515, -0.095, -0.225, -0.075, -0.030, 0.094, 0.029, 1);
    addBang(-0.075, -0.535, -0.205, -0.215, -0.215, 0.020, 0.090, 0.028, 0);
    addBang(-0.190, -0.540, -0.310, -0.195, -0.350, -0.045, 0.086, 0.027, 1);

    /* torso: bust that runs off the bottom edge, shoulders wider than the neck */
    p = new Path2D();
    p.moveTo(lx(-0.180), ly(0.42));
    p.lineTo(lx(-0.200), ly(0.700));
    p.bezierCurveTo(lx(-0.360), ly(0.745), lx(-0.560), ly(0.780), lx(-0.700), ly(0.845));
    p.bezierCurveTo(lx(-0.855), ly(0.915), lx(-0.995), ly(1.060), lx(-1.075), ly(1.240));
    p.bezierCurveTo(lx(-1.155), ly(1.420), lx(-1.215), ly(1.680), lx(-1.265), ly(1.980));
    p.lineTo(lx(2.260), ly(1.980));
    p.bezierCurveTo(lx(1.240), ly(1.700), lx(1.140), ly(1.420), lx(1.060), ly(1.230));
    p.bezierCurveTo(lx(0.985), ly(1.065), lx(0.865), ly(0.930), lx(0.730), ly(0.860));
    p.bezierCurveTo(lx(0.560), ly(0.785), lx(0.350), ly(0.748), lx(0.200), ly(0.700));
    p.lineTo(lx(0.180), ly(0.42));
    p.closePath();
    paths.torso = p;

    /* high collar standing behind the neck */
    p = new Path2D();
    p.moveTo(lx(-0.300), ly(0.735));
    p.bezierCurveTo(lx(-0.280), ly(0.620), lx(-0.170), ly(0.545), lx(0.000), ly(0.535));
    p.bezierCurveTo(lx(0.175), ly(0.545), lx(0.290), ly(0.625), lx(0.310), ly(0.745));
    p.bezierCurveTo(lx(0.150), ly(0.700), lx(-0.140), ly(0.700), lx(-0.300), ly(0.735));
    p.closePath();
    paths.collar = p;

    /* neck */
    p = new Path2D();
    p.moveTo(lx(-0.136), ly(0.25));
    p.bezierCurveTo(lx(-0.143), ly(0.43), lx(-0.150), ly(0.59), lx(-0.100), ly(0.715));
    p.lineTo(lx(0.100), ly(0.715));
    p.bezierCurveTo(lx(0.150), ly(0.59), lx(0.143), ly(0.43), lx(0.136), ly(0.25));
    p.closePath();
    paths.neck = p;

    /* chest opening (skin between the suit lapels) */
    p = new Path2D();
    p.moveTo(lx(-0.120), ly(0.680));
    p.lineTo(lx(-0.285), ly(1.045));
    p.bezierCurveTo(lx(-0.165), ly(1.190), lx(0.110), ly(1.190), lx(0.275), ly(1.045));
    p.lineTo(lx(0.120), ly(0.680));
    p.closePath();
    paths.chest = p;

    /* face: 3/4 view, near side (screen right) a touch fuller */
    p = new Path2D();
    p.moveTo(lx(-0.340), ly(0.020));
    p.bezierCurveTo(lx(-0.354), ly(-0.190), lx(-0.270), ly(-0.445), lx(-0.060), ly(-0.502));
    p.bezierCurveTo(lx(0.112), ly(-0.546), lx(0.282), ly(-0.440), lx(0.344), ly(-0.226));
    p.bezierCurveTo(lx(0.382), ly(-0.052), lx(0.366), ly(0.140), lx(0.296), ly(0.268));
    p.bezierCurveTo(lx(0.212), ly(0.396), lx(0.100), ly(0.464), lx(0.020), ly(0.472));
    p.bezierCurveTo(lx(-0.090), ly(0.474), lx(-0.225), ly(0.345), lx(-0.298), ly(0.212));
    p.bezierCurveTo(lx(-0.331), ly(0.136), lx(-0.340), ly(0.080), lx(-0.340), ly(0.020));
    p.closePath();
    paths.face = p;

    /* face framing comes from the back hair mass itself; a couple of short
       wisps are drawn per frame (see drawLoose) so nothing reads as a wire */

    /* rim light contours */
    p = new Path2D();
    p.moveTo(lx(0.02), ly(-0.735));
    p.bezierCurveTo(lx(-0.415), ly(-0.650), lx(-0.600), ly(-0.20), lx(-0.480), ly(0.14));
    p.bezierCurveTo(lx(-0.625), ly(0.52), lx(-0.790), ly(1.04), lx(-1.04), ly(1.94));
    paths.rimHairL = p;

    p = new Path2D();
    p.moveTo(lx(0.04), ly(-0.735));
    p.bezierCurveTo(lx(0.440), ly(-0.650), lx(0.610), ly(-0.20), lx(0.495), ly(0.14));
    p.bezierCurveTo(lx(0.615), ly(0.52), lx(0.770), ly(1.04), lx(1.02), ly(1.94));
    paths.rimHairR = p;

    p = new Path2D();
    p.moveTo(lx(-0.605), ly(-0.320));
    p.quadraticCurveTo(lx(-0.655), ly(0.32), lx(-0.575), ly(0.90));
    paths.wispL = p;

    p = new Path2D();
    p.moveTo(lx(0.600), ly(-0.300));
    p.quadraticCurveTo(lx(0.662), ly(0.34), lx(0.580), ly(0.98));
    paths.wispR = p;

    p = new Path2D();
    p.moveTo(lx(0.352), ly(-0.060));
    p.bezierCurveTo(lx(0.366), ly(0.140), lx(0.296), ly(0.268), lx(0.212), ly(0.396));
    p.bezierCurveTo(lx(0.142), ly(0.452), lx(0.074), ly(0.472), lx(0.020), ly(0.472));
    paths.rimFaceR = p;

    p = new Path2D();
    p.moveTo(lx(-0.338), ly(0.000));
    p.bezierCurveTo(lx(-0.331), ly(0.150), lx(-0.297), ly(0.212), lx(-0.230), ly(0.330));
    p.bezierCurveTo(lx(-0.152), ly(0.432), lx(-0.062), ly(0.472), lx(0.020), ly(0.472));
    paths.rimFaceL = p;

    p = new Path2D();
    p.moveTo(lx(-0.205), ly(0.742));
    p.bezierCurveTo(lx(-0.360), ly(0.786), lx(-0.560), ly(0.822), lx(-0.700), ly(0.887));
    p.bezierCurveTo(lx(-0.855), ly(0.957), lx(-0.995), ly(1.100), lx(-1.075), ly(1.280));
    p.bezierCurveTo(lx(-1.155), ly(1.460), lx(-1.215), ly(1.700), lx(-1.265), ly(1.960));
    paths.rimBodyL = p;

    p = new Path2D();
    p.moveTo(lx(0.205), ly(0.742));
    p.bezierCurveTo(lx(0.360), ly(0.786), lx(0.560), ly(0.822), lx(0.700), ly(0.887));
    p.bezierCurveTo(lx(0.865), ly(0.953), lx(0.985), ly(1.100), lx(1.060), ly(1.270));
    p.bezierCurveTo(lx(1.140), ly(1.460), lx(1.240), ly(1.720), lx(1.300), ly(1.960));
    paths.rimBodyR = p;

    /* collar ring on the collarbone */
    collar.x = lx(0.100);
    collar.y = ly(0.985);
    collar.rx = U * 0.058;
    collar.ry = U * 0.022;
    collar.rot = -0.20;
  }

  function addBang(x0, y0, cx, cy, x1, y1, w0, w1, tone) {
    bangs.push({
      p: strandPath(lx(x0), ly(y0), lx(cx), ly(cy), lx(x1), ly(y1), U * w0, U * w1),
      tone: tone, baseY: ly(y0), tipY: ly(y1)
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
    drawCollar(g);
    drawNeckChest(g);
    drawFaceBase(g);
    drawFeatures(g);
    drawCap(g);
    drawCircuits(g);
    drawChoker(g);
    drawFrontHair(g);
    drawRim(g);
    drawCollarRing(g);
  }

  function drawBackHair(g) {
    var hg = g.createLinearGradient(lx(-0.6), ly(-0.70), lx(0.4), ly(1.9));
    hg.addColorStop(0, '#301a42');
    hg.addColorStop(0.18, '#22122f');
    hg.addColorStop(0.45, '#170d21');
    hg.addColorStop(0.78, '#100817');
    hg.addColorStop(1, '#0b0612');
    g.fillStyle = hg;
    g.fill(paths.hair);

    g.save();
    g.clip(paths.hair);
    /* long strand shading inside the hair mass */
    for (var i = 0; i < 15; i++) {
      var b = -0.95 + i * 0.136;
      g.beginPath();
      g.moveTo(lx(b * 0.50), ly(-0.40));
      g.bezierCurveTo(lx(b * 0.80), ly(0.30), lx(b * 1.02), ly(1.02), lx(b * 1.12), ly(1.98));
      g.strokeStyle = (i % 3 === 0) ? 'rgba(138,74,170,0.17)' : 'rgba(4,2,7,0.30)';
      g.lineWidth = U * (i % 3 === 0 ? 0.011 : 0.017);
      g.stroke();
    }
    /* anime "angel ring" sheen across the crown */
    var sheen = g.createRadialGradient(lx(-0.02), ly(-0.30), U * 0.05,
      lx(-0.02), ly(-0.30), U * 0.46);
    sheen.addColorStop(0, 'rgba(186,214,255,0.15)');
    sheen.addColorStop(0.55, 'rgba(166,120,220,0.07)');
    sheen.addColorStop(1, 'rgba(166,120,220,0)');
    g.fillStyle = sheen;
    g.fillRect(lx(-0.55), ly(-0.75), U * 1.1, U * 0.75);

    /* magenta bounce on the near side */
    var mg = g.createLinearGradient(lx(0.20), 0, lx(0.98), 0);
    mg.addColorStop(0, 'rgba(' + MAG + ',0)');
    mg.addColorStop(0.72, 'rgba(' + MAG + ',0.08)');
    mg.addColorStop(1, 'rgba(' + MAG + ',0.20)');
    g.fillStyle = mg;
    g.fillRect(lx(0.15), ly(-0.72), U * 1.5, U * 2.8);
    g.restore();
  }

  function drawBody(g) {
    var bg2 = g.createLinearGradient(lx(-1.0), ly(0.72), lx(0.9), ly(1.9));
    bg2.addColorStop(0, '#372144');
    bg2.addColorStop(0.42, '#241733');
    bg2.addColorStop(1, '#130d1e');
    g.fillStyle = bg2;
    g.fill(paths.torso);

    g.save();
    g.clip(paths.torso);

    /* rim-coloured light falling on the shoulders */
    g.globalCompositeOperation = 'lighter';
    var lgl = g.createRadialGradient(lx(-0.85), ly(1.00), 0, lx(-0.85), ly(1.00), U * 0.70);
    lgl.addColorStop(0, 'rgba(' + CYAN + ',0.16)');
    lgl.addColorStop(1, 'rgba(' + CYAN + ',0)');
    g.fillStyle = lgl;
    g.fillRect(lx(-1.5), ly(0.70), U * 1.4, U * 1.3);

    var rgl = g.createRadialGradient(lx(0.90), ly(1.02), 0, lx(0.90), ly(1.02), U * 0.72);
    rgl.addColorStop(0, 'rgba(' + MAG + ',0.20)');
    rgl.addColorStop(1, 'rgba(' + MAG + ',0)');
    g.fillStyle = rgl;
    g.fillRect(lx(-0.3), ly(0.70), U * 1.5, U * 1.3);
    g.globalCompositeOperation = 'source-over';

    /* shoulder seams */
    g.strokeStyle = 'rgba(' + CYAN + ',0.20)';
    g.lineWidth = U * 0.007;
    g.beginPath();
    g.moveTo(lx(-0.20), ly(0.795));
    g.bezierCurveTo(lx(-0.49), ly(0.845), lx(-0.755), ly(0.935), lx(-0.915), ly(1.060));
    g.stroke();

    g.strokeStyle = 'rgba(' + AMBER + ',0.22)';
    g.beginPath();
    g.moveTo(lx(0.20), ly(0.795));
    g.bezierCurveTo(lx(0.50), ly(0.845), lx(0.790), ly(0.945), lx(0.950), ly(1.075));
    g.stroke();

    /* suit panels */
    g.strokeStyle = 'rgba(8,4,14,0.55)';
    g.lineWidth = U * 0.020;
    g.beginPath();
    g.moveTo(lx(-0.34), ly(1.06));
    g.bezierCurveTo(lx(-0.50), ly(1.24), lx(-0.58), ly(1.52), lx(-0.60), ly(1.98));
    g.stroke();
    g.beginPath();
    g.moveTo(lx(0.33), ly(1.07));
    g.bezierCurveTo(lx(0.50), ly(1.25), lx(0.58), ly(1.53), lx(0.60), ly(1.98));
    g.stroke();

    /* chest plate shading */
    var pg = g.createLinearGradient(0, ly(0.80), 0, ly(1.65));
    pg.addColorStop(0, 'rgba(0,0,0,0.30)');
    pg.addColorStop(1, 'rgba(0,0,0,0.03)');
    g.fillStyle = pg;
    g.fillRect(lx(-1.3), ly(0.80), U * 2.6, U * 1.2);
    g.restore();
  }

  function drawCollar(g) {
    var cg = g.createLinearGradient(0, ly(0.52), 0, ly(0.76));
    cg.addColorStop(0, '#301c40');
    cg.addColorStop(1, '#150d20');
    g.fillStyle = cg;
    g.fill(paths.collar);

    g.save();
    g.clip(paths.collar);
    var rg = g.createLinearGradient(lx(-0.32), 0, lx(0.32), 0);
    rg.addColorStop(0, 'rgba(53,230,255,0.16)');
    rg.addColorStop(0.5, 'rgba(0,0,0,0.25)');
    rg.addColorStop(1, 'rgba(255,62,165,0.20)');
    g.fillStyle = rg;
    g.fillRect(lx(-0.35), ly(0.52), U * 0.7, U * 0.26);
    g.restore();

    g.save();
    g.globalCompositeOperation = 'lighter';
    g.strokeStyle = 'rgba(' + CYAN + ',0.45)';
    g.lineWidth = Math.max(1, U * 0.007);
    g.beginPath();
    g.moveTo(lx(-0.300), ly(0.735));
    g.bezierCurveTo(lx(-0.280), ly(0.620), lx(-0.170), ly(0.545), lx(0.000), ly(0.535));
    g.stroke();
    g.strokeStyle = 'rgba(' + MAG + ',0.48)';
    g.beginPath();
    g.moveTo(lx(0.310), ly(0.745));
    g.bezierCurveTo(lx(0.290), ly(0.625), lx(0.175), ly(0.545), lx(0.000), ly(0.535));
    g.stroke();
    g.strokeStyle = 'rgba(' + AMBER + ',0.35)';
    g.lineWidth = Math.max(1, U * 0.004);
    g.beginPath();
    g.moveTo(lx(-0.235), ly(0.700));
    g.lineTo(lx(-0.215), ly(0.580));
    g.stroke();
    g.restore();
  }

  function drawNeckChest(g) {
    var ng = g.createLinearGradient(lx(-0.16), 0, lx(0.16), 0);
    ng.addColorStop(0, '#2d1b30');
    ng.addColorStop(0.40, '#412837');
    ng.addColorStop(1, '#4f2f41');
    g.fillStyle = ng;
    g.fill(paths.neck);

    var cg = g.createLinearGradient(0, ly(0.68), 0, ly(1.25));
    cg.addColorStop(0, '#452a39');
    cg.addColorStop(0.42, '#382131');
    cg.addColorStop(1, '#24162a');
    g.fillStyle = cg;
    g.fill(paths.chest);

    /* shadow cast by the jaw onto the neck */
    g.save();
    g.clip(paths.neck);
    var jg = g.createLinearGradient(0, ly(0.28), 0, ly(0.55));
    jg.addColorStop(0, 'rgba(16,7,22,0.80)');
    jg.addColorStop(1, 'rgba(16,7,22,0)');
    g.fillStyle = jg;
    g.fillRect(lx(-0.2), ly(0.25), U * 0.4, U * 0.34);

    /* magenta kiss from the near side */
    g.globalCompositeOperation = 'lighter';
    var mg2 = g.createLinearGradient(lx(0.04), 0, lx(0.17), 0);
    mg2.addColorStop(0, 'rgba(' + MAG + ',0)');
    mg2.addColorStop(1, 'rgba(' + MAG + ',0.20)');
    g.fillStyle = mg2;
    g.fillRect(lx(0.0), ly(0.20), U * 0.2, U * 0.56);
    g.restore();

    g.save();
    g.clip(paths.chest);
    g.globalCompositeOperation = 'lighter';
    var mg3 = g.createLinearGradient(lx(0.02), 0, lx(0.32), 0);
    mg3.addColorStop(0, 'rgba(' + MAG + ',0)');
    mg3.addColorStop(1, 'rgba(' + MAG + ',0.17)');
    g.fillStyle = mg3;
    g.fillRect(lx(-0.02), ly(0.70), U * 0.40, U * 0.58);

    var cg3 = g.createLinearGradient(lx(-0.34), 0, lx(-0.10), 0);
    cg3.addColorStop(0, 'rgba(' + CYAN + ',0.14)');
    cg3.addColorStop(1, 'rgba(' + CYAN + ',0)');
    g.fillStyle = cg3;
    g.fillRect(lx(-0.36), ly(0.70), U * 0.30, U * 0.58);
    g.restore();

    /* suit lapel edges around the chest V */
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.strokeStyle = 'rgba(' + CYAN + ',0.40)';
    g.lineWidth = Math.max(1, U * 0.006);
    g.beginPath();
    g.moveTo(lx(-0.120), ly(0.680));
    g.lineTo(lx(-0.285), ly(1.045));
    g.stroke();
    g.strokeStyle = 'rgba(' + MAG + ',0.44)';
    g.beginPath();
    g.moveTo(lx(0.120), ly(0.680));
    g.lineTo(lx(0.275), ly(1.045));
    g.stroke();
    g.restore();
  }

  function drawFaceBase(g) {
    var fg = g.createLinearGradient(lx(-0.12), ly(-0.50), lx(0.12), ly(0.50));
    fg.addColorStop(0, '#8a5c70');
    fg.addColorStop(0.30, '#7c5165');
    fg.addColorStop(0.66, '#694355');
    fg.addColorStop(1, '#4a2f43');
    g.fillStyle = fg;
    g.fill(paths.face);

    g.save();
    g.clip(paths.face);

    /* 3/4 form: far (left) side falls into shade */
    var sg = g.createLinearGradient(lx(-0.36), 0, lx(0.08), 0);
    sg.addColorStop(0, 'rgba(18,8,24,0.48)');
    sg.addColorStop(0.55, 'rgba(18,8,24,0.12)');
    sg.addColorStop(1, 'rgba(18,8,24,0)');
    g.fillStyle = sg;
    g.fillRect(lx(-0.36), ly(-0.52), U * 0.50, U * 1.05);

    /* shadow under the fringe on the forehead */
    var bh2 = g.createLinearGradient(0, ly(-0.52), 0, ly(-0.02));
    bh2.addColorStop(0, 'rgba(14,6,20,0.66)');
    bh2.addColorStop(0.72, 'rgba(14,6,20,0.18)');
    bh2.addColorStop(1, 'rgba(14,6,20,0)');
    g.fillStyle = bh2;
    g.fillRect(lx(-0.36), ly(-0.52), U * 0.72, U * 0.50);

    /* cheek blush */
    radial(g, lx(-0.235), ly(0.250), U * 0.115, '255,86,150', 0.15);
    radial(g, lx(0.245), ly(0.258), U * 0.125, '255,86,150', 0.13);

    /* key light from the near side keeps the face readable */
    var kg = g.createRadialGradient(lx(0.16), ly(0.02), U * 0.05, lx(0.16), ly(0.02), U * 0.52);
    kg.addColorStop(0, 'rgba(255,214,230,0.14)');
    kg.addColorStop(1, 'rgba(255,214,230,0)');
    g.fillStyle = kg;
    g.fillRect(lx(-0.34), ly(-0.52), U * 0.72, U * 1.05);

    /* nose bridge light */
    var nb = g.createLinearGradient(lx(-0.075), 0, lx(0.045), 0);
    nb.addColorStop(0, 'rgba(255,232,242,0)');
    nb.addColorStop(0.55, 'rgba(255,232,242,0.18)');
    nb.addColorStop(1, 'rgba(255,232,242,0)');
    g.fillStyle = nb;
    g.fillRect(lx(-0.075), ly(-0.10), U * 0.12, U * 0.34);

    /* lit cheekbone on the near side */
    radial(g, lx(0.205), ly(0.150), U * 0.125, '255,214,228', 0.17);
    /* forehead sheen */
    radial(g, lx(0.010), ly(-0.120), U * 0.19, '255,220,236', 0.10);
    /* chin light */
    radial(g, lx(0.030), ly(0.405), U * 0.075, '255,222,238', 0.18);

    /* jaw / chin shade */
    var cg2 = g.createLinearGradient(0, ly(0.210), 0, ly(0.472));
    cg2.addColorStop(0, 'rgba(20,8,24,0)');
    cg2.addColorStop(0.55, 'rgba(20,8,24,0.22)');
    cg2.addColorStop(1, 'rgba(20,8,24,0.42)');
    g.fillStyle = cg2;
    g.fillRect(lx(-0.32), ly(0.210), U * 0.64, U * 0.27);

    /* far-side cheek stays in shadow */
    var fg2 = g.createLinearGradient(lx(-0.36), ly(0.10), lx(-0.10), ly(0.10));
    fg2.addColorStop(0, 'rgba(14,6,20,0.34)');
    fg2.addColorStop(1, 'rgba(14,6,20,0)');
    g.fillStyle = fg2;
    g.fillRect(lx(-0.36), ly(0.02), U * 0.28, U * 0.36);
    g.restore();
  }

  function drawCap(g) {
    /* fringe locks first: their bases are then covered by the crown, so the
       locks read as strands hanging from the hairline (no seams, no needles) */
    for (var k = 0; k < bangs.length; k++) {
      var b0 = bangs[k].baseY - U * 0.10;
      var b1 = bangs[k].tipY + U * 0.06;
      var bg = g.createLinearGradient(0, b0, 0, b1);
      bg.addColorStop(0.00, '#33204a');
      bg.addColorStop(0.34, '#221533');
      bg.addColorStop(1.00, '#0e0817');
      g.fillStyle = bg;
      g.fill(bangs[k].p);
    }

    var hg = g.createLinearGradient(lx(-0.35), ly(-0.74), lx(0.25), ly(0.05));
    hg.addColorStop(0, '#3e2250');
    hg.addColorStop(0.30, '#29163a');
    hg.addColorStop(0.70, '#1b1028');
    hg.addColorStop(1, '#130b1d');
    g.fillStyle = hg;
    g.fill(paths.cap);

    g.save();
    g.clip(paths.cap);
    /* highlight strands over the crown */
    for (var i = 0; i < 9; i++) {
      var b = -0.46 + i * 0.115;
      g.beginPath();
      g.moveTo(lx(b * 0.55), ly(-0.73));
      g.quadraticCurveTo(lx(b * 1.00), ly(-0.36), lx(b * 1.08), ly(0.02));
      g.strokeStyle = (i === 5) ? 'rgba(176,126,214,0.28)' : 'rgba(9,4,15,0.30)';
      g.lineWidth = U * 0.011;
      g.stroke();
    }
    /* sheen following the fringe direction */
    g.globalCompositeOperation = 'lighter';
    var sg = g.createLinearGradient(lx(-0.30), ly(-0.50), lx(0.42), ly(-0.05));
    sg.addColorStop(0, 'rgba(150,190,255,0.05)');
    sg.addColorStop(0.55, 'rgba(206,166,255,0.06)');
    sg.addColorStop(1, 'rgba(255,120,200,0.12)');
    g.fillStyle = sg;
    g.fillRect(lx(-0.47), ly(-0.74), U * 1.02, U * 0.80);
    g.restore();

    /* one soft hair shine following the crown, not a stray line */
    g.save();
    g.globalCompositeOperation = 'lighter';
    var hs = g.createRadialGradient(lx(-0.05), ly(-0.42), U * 0.04,
      lx(-0.05), ly(-0.42), U * 0.40);
    hs.addColorStop(0, 'rgba(186,206,255,0.10)');
    hs.addColorStop(1, 'rgba(186,206,255,0)');
    g.fillStyle = hs;
    g.fillRect(lx(-0.50), ly(-0.80), U * 1.0, U * 0.55);
    g.restore();
  }

  function drawFeatures(g) {
    /* fringe covers the brows; keep a faint brow shadow for depth */
    g.strokeStyle = 'rgba(44,20,46,0.30)';
    g.lineWidth = U * 0.012;
    g.beginPath();
    g.moveTo(lx(0.078), ly(-0.120));
    g.quadraticCurveTo(lx(0.170), ly(-0.170), lx(0.258), ly(-0.112));
    g.stroke();

    drawEye(g, lx(-0.152), ly(0.078), U * 0.088, U * 0.058, -1);
    drawEye(g, lx(0.152), ly(0.080), U * 0.096, U * 0.062, 1);

    /* nose: one pin light and a whisper of a shadow */
    g.strokeStyle = 'rgba(24,10,28,0.45)';
    g.lineWidth = U * 0.005;
    g.beginPath();
    g.moveTo(lx(-0.042), ly(0.164));
    g.quadraticCurveTo(lx(-0.060), ly(0.196), lx(-0.024), ly(0.202));
    g.stroke();
    g.fillStyle = 'rgba(255,240,247,0.72)';
    g.beginPath();
    g.arc(lx(-0.010), ly(0.194), Math.max(1.1, U * 0.0058), 0, TAU);
    g.fill();

    /* mouth: short pink line with a soft lower lip */
    g.strokeStyle = 'rgba(255,107,157,0.88)';
    g.lineWidth = U * 0.0062;
    g.beginPath();
    g.moveTo(lx(-0.048), ly(0.320));
    g.quadraticCurveTo(lx(-0.010), ly(0.331), lx(0.030), ly(0.315));
    g.stroke();
    g.strokeStyle = 'rgba(255,168,200,0.26)';
    g.lineWidth = U * 0.0055;
    g.beginPath();
    g.moveTo(lx(-0.034), ly(0.336));
    g.quadraticCurveTo(lx(-0.006), ly(0.347), lx(0.018), ly(0.330));
    g.stroke();
    /* tiny corner shadow so the mouth is not a floating line */
    g.strokeStyle = 'rgba(60,24,44,0.50)';
    g.lineWidth = U * 0.0035;
    g.beginPath();
    g.moveTo(lx(-0.054), ly(0.316));
    g.lineTo(lx(-0.046), ly(0.327));
    g.stroke();

    radial(g, lx(0.020), ly(0.418), U * 0.060, '255,216,234', 0.16);

    radial(g, lx(0.0), ly(0.450), U * 0.055, '255,216,234', 0.14);
  }

  function drawEye(g, cx, cy, hw, hh, out) {
    var p = new Path2D();
    p.moveTo(cx - hw, cy + hh * 0.24);
    p.bezierCurveTo(cx - hw * 0.99, cy - hh * 0.60, cx - hw * 0.44, cy - hh * 1.06,
      cx + hw * 0.06, cy - hh * 1.04);
    p.bezierCurveTo(cx + hw * 0.60, cy - hh * 1.02, cx + hw * 0.94, cy - hh * 0.64,
      cx + hw * 1.02, cy - hh * 0.06);
    p.bezierCurveTo(cx + hw * 0.96, cy + hh * 0.56, cx + hw * 0.50, cy + hh * 0.96,
      cx - hw * 0.10, cy + hh * 0.92);
    p.bezierCurveTo(cx - hw * 0.62, cy + hh * 0.88, cx - hw * 0.95, cy + hh * 0.58,
      cx - hw, cy + hh * 0.24);
    p.closePath();

    var sg = g.createLinearGradient(0, cy - hh, 0, cy + hh);
    sg.addColorStop(0, '#6f5c80');
    sg.addColorStop(0.25, '#b9a9c8');
    sg.addColorStop(0.65, '#e9e0ef');
    sg.addColorStop(1, '#c2b2ce');
    g.fillStyle = sg;
    g.fill(p);

    g.save();
    g.clip(p);

    var ir = hw * 0.90;
    var ix = cx + hw * 0.01, iy = cy + hh * 0.10;
    var ig = g.createRadialGradient(ix, iy + ir * 0.52, ir * 0.05, ix, iy, ir * 1.02);
    ig.addColorStop(0, 'rgba(200,255,255,1)');
    ig.addColorStop(0.22, 'rgba(80,238,255,0.98)');
    ig.addColorStop(0.48, 'rgba(46,160,230,0.96)');
    ig.addColorStop(0.74, 'rgba(118,60,180,0.96)');
    ig.addColorStop(0.92, 'rgba(240,60,170,0.98)');
    ig.addColorStop(1, 'rgba(255,120,200,1)');
    g.fillStyle = ig;
    g.beginPath();
    g.arc(ix, iy, ir, 0, TAU);
    g.fill();

    /* iris rim */
    g.strokeStyle = 'rgba(16,6,26,0.75)';
    g.lineWidth = U * 0.008;
    g.beginPath();
    g.arc(ix, iy, ir * 0.99, 0, TAU);
    g.stroke();

    /* pupil */
    g.fillStyle = 'rgba(9,4,16,0.94)';
    g.beginPath();
    g.ellipse(ix, iy + ir * 0.14, ir * 0.38, ir * 0.55, 0, 0, TAU);
    g.fill();

    /* cyan glow at the bottom of the iris */
    var cgl = g.createRadialGradient(ix, iy + ir * 0.62, 0, ix, iy + ir * 0.62, ir * 0.62);
    cgl.addColorStop(0, 'rgba(170,255,255,0.55)');
    cgl.addColorStop(1, 'rgba(80,220,255,0)');
    g.fillStyle = cgl;
    g.fillRect(ix - ir, iy - ir, ir * 2, ir * 2);

    /* lid shadow over the top of the iris */
    var sh = g.createLinearGradient(0, cy - hh * 1.15, 0, cy + hh * 0.30);
    sh.addColorStop(0, 'rgba(14,6,22,0.94)');
    sh.addColorStop(0.62, 'rgba(14,6,22,0.30)');
    sh.addColorStop(1, 'rgba(14,6,22,0)');
    g.fillStyle = sh;
    g.fillRect(cx - hw * 1.3, cy - hh * 1.4, hw * 2.6, hh * 1.75);

    /* catch lights */
    g.fillStyle = 'rgba(255,255,255,0.97)';
    g.beginPath();
    g.arc(ix - ir * 0.36, iy - ir * 0.44, ir * 0.31, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(255,200,238,0.85)';
    g.beginPath();
    g.arc(ix + ir * 0.38, iy + ir * 0.40, ir * 0.14, 0, TAU);
    g.fill();
    g.restore();

    /* upper lash: inner half thin, outer half thick */
    var outerX = cx + out * hw * 1.02;
    var lw = U * 0.022;
    g.strokeStyle = 'rgba(20,9,26,0.96)';
    g.lineWidth = lw;
    g.beginPath();
    g.moveTo(cx - out * hw * 0.92, cy - hh * 0.30);
    g.bezierCurveTo(cx - out * hw * 0.30, cy - hh * 1.10,
      cx + out * hw * 0.62, cy - hh * 1.06, outerX, cy - hh * 0.06);
    g.stroke();

    /* lash wing at the outer corner */
    g.fillStyle = 'rgba(20,9,26,0.94)';
    g.beginPath();
    g.moveTo(outerX - out * hw * 0.05, cy - hh * 0.10);
    g.quadraticCurveTo(cx + out * hw * 1.22, cy - hh * 0.20,
      cx + out * hw * 1.30, cy - hh * 0.56);
    g.quadraticCurveTo(cx + out * hw * 1.08, cy - hh * 0.30, outerX, cy + hh * 0.02);
    g.closePath();
    g.fill();

    /* lower lid line + tiny lower lashes */
    g.strokeStyle = 'rgba(56,28,52,0.55)';
    g.lineWidth = U * 0.006;
    g.beginPath();
    g.moveTo(cx - out * hw * 0.30, cy + hh * 0.86);
    g.quadraticCurveTo(cx + out * hw * 0.55, cy + hh * 0.92, cx + out * hw * 0.92, cy + hh * 0.42);
    g.stroke();

    g.strokeStyle = 'rgba(22,10,28,0.75)';
    g.lineWidth = U * 0.0075;
    g.beginPath();
    g.moveTo(cx + out * hw * 0.86, cy + hh * 0.60);
    g.lineTo(cx + out * hw * 1.02, cy + hh * 0.84);
    g.stroke();
    g.beginPath();
    g.moveTo(cx + out * hw * 0.60, cy + hh * 0.84);
    g.lineTo(cx + out * hw * 0.70, cy + hh * 1.04);
    g.stroke();

    /* eyelid crease */
    g.strokeStyle = 'rgba(40,18,42,0.26)';
    g.lineWidth = U * 0.0045;
    g.beginPath();
    g.moveTo(cx - out * hw * 0.70, cy - hh * 1.28);
    g.quadraticCurveTo(cx + out * hw * 0.12, cy - hh * 1.58, cx + out * hw * 0.92, cy - hh * 1.02);
    g.stroke();
  }

  function drawCircuits(g) {
    circuits.length = 0;
    /* one tidy PCB trace down the jaw line, right-angle bends, two nodes */
    addCircuit([[0.312, 0.140], [0.312, 0.228], [0.258, 0.228], [0.258, 0.318],
      [0.202, 0.318], [0.202, 0.408], [0.158, 0.408], [0.158, 0.548],
      [0.136, 0.548], [0.136, 0.678]], 0.12);
    /* small collarbone trace */
    addCircuit([[0.238, 0.780], [0.238, 0.858], [0.178, 0.858], [0.178, 0.938],
      [0.128, 0.938]], 0.58);

    for (var i = 0; i < circuits.length; i++) {
      var c = circuits[i];
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.lineCap = 'round';
      g.lineJoin = 'miter';
      g.strokeStyle = 'rgba(' + CYAN + ',0.10)';
      g.lineWidth = U * 0.016;
      g.beginPath();
      g.moveTo(c.pts[0].x, c.pts[0].y);
      for (var k = 1; k < c.pts.length; k++) { g.lineTo(c.pts[k].x, c.pts[k].y); }
      g.stroke();
      g.strokeStyle = 'rgba(' + CYAN + ',0.55)';
      g.lineWidth = Math.max(1.4, U * 0.0072);
      g.stroke();
      g.strokeStyle = 'rgba(224,255,255,0.34)';
      g.lineWidth = Math.max(1, U * 0.0026);
      g.stroke();
      /* node rings */
      for (var n = 1; n < c.pts.length - 1; n += 4) {
        var pp = c.pts[n];
        g.strokeStyle = 'rgba(' + CYAN + ',0.66)';
        g.lineWidth = Math.max(1.2, U * 0.006);
        g.beginPath();
        g.arc(pp.x, pp.y, U * 0.0125, 0, TAU);
        g.stroke();
        g.fillStyle = 'rgba(' + CYAN + ',0.30)';
        g.beginPath();
        g.arc(pp.x, pp.y, U * 0.008, 0, TAU);
        g.fill();
      }
      g.restore();
    }
  }

  function addCircuit(local, off) {
    var pts = [], i, len = 0;
    for (i = 0; i < local.length; i++) {
      pts.push({ x: lx(local[i][0]), y: ly(local[i][1]) });
    }
    for (i = 1; i < pts.length; i++) {
      len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    }
    circuits.push({ pts: pts, len: len, off: off, speed: 0.30 });
  }

  function drawChoker(g) {
    var p = new Path2D();
    p.moveTo(lx(-0.152), ly(0.716));
    p.quadraticCurveTo(lx(0.0), ly(0.758), lx(0.152), ly(0.716));
    p.lineTo(lx(0.152), ly(0.780));
    p.quadraticCurveTo(lx(0.0), ly(0.822), lx(-0.152), ly(0.780));
    p.closePath();
    g.fillStyle = '#100a1a';
    g.fill(p);

    g.save();
    g.globalCompositeOperation = 'lighter';
    g.strokeStyle = 'rgba(' + CYAN + ',0.34)';
    g.lineWidth = Math.max(1, U * 0.006);
    g.beginPath();
    g.moveTo(lx(-0.152), ly(0.716));
    g.quadraticCurveTo(lx(0.0), ly(0.758), lx(0.152), ly(0.716));
    g.stroke();
    g.fillStyle = 'rgba(' + AMBER + ',0.60)';
    g.beginPath();
    g.moveTo(lx(0.0), ly(0.770));
    g.lineTo(lx(0.030), ly(0.783));
    g.lineTo(lx(0.0), ly(0.796));
    g.lineTo(lx(-0.030), ly(0.783));
    g.closePath();
    g.fill();
    g.restore();
  }

  function drawFrontHair(g) {
    /* no long framing locks: they read as neon wires, the hair mass frames the
       face instead. Only a soft tinted edge on the hair silhouette is kept. */
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.strokeStyle = 'rgba(255,110,195,0.10)';
    g.lineWidth = U * 0.014;
    g.stroke(paths.wispR);
    g.strokeStyle = 'rgba(90,220,255,0.09)';
    g.stroke(paths.wispL);
    g.restore();
  }

  function neonStroke(g, p, rgb, w, a) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(' + rgb + ',' + (a * 0.10) + ')';
    g.lineWidth = w * 5.0;
    g.stroke(p);
    g.strokeStyle = 'rgba(' + rgb + ',' + (a * 0.24) + ')';
    g.lineWidth = w * 2.3;
    g.stroke(p);
    g.strokeStyle = 'rgba(' + rgb + ',' + (a * 0.62) + ')';
    g.lineWidth = w * 1.05;
    g.stroke(p);
    g.strokeStyle = 'rgba(255,255,255,' + (a * 0.34) + ')';
    g.lineWidth = Math.max(1, w * 0.34);
    g.stroke(p);
    g.restore();
  }

  function drawRim(g) {
    neonStroke(g, paths.rimHairL, CYAN, U * 0.013, 0.60);
    neonStroke(g, paths.rimHairR, MAG, U * 0.015, 0.70);
    neonStroke(g, paths.rimBodyL, CYAN, U * 0.012, 0.55);
    neonStroke(g, paths.rimBodyR, MAG, U * 0.014, 0.62);
    neonStroke(g, paths.rimFaceL, CYAN, U * 0.0075, 0.55);
    neonStroke(g, paths.rimFaceR, MAG, U * 0.009, 0.62);

    /* light spill into the face and hair (soft radial, no rectangle edges) */
    g.save();
    g.globalCompositeOperation = 'lighter';
    var gl = g.createRadialGradient(lx(-0.40), ly(0.10), 0, lx(-0.40), ly(0.10), U * 0.60);
    gl.addColorStop(0, 'rgba(' + CYAN + ',0.13)');
    gl.addColorStop(1, 'rgba(' + CYAN + ',0)');
    g.fillStyle = gl;
    g.fillRect(lx(-1.0), ly(-0.5), U * 1.2, U * 1.3);

    var gr = g.createRadialGradient(lx(0.44), ly(0.16), 0, lx(0.44), ly(0.16), U * 0.62);
    gr.addColorStop(0, 'rgba(' + MAG + ',0.20)');
    gr.addColorStop(1, 'rgba(' + MAG + ',0)');
    g.fillStyle = gr;
    g.fillRect(lx(-0.2), ly(-0.5), U * 1.2, U * 1.3);
    g.restore();
  }

  function drawCollarRing(g) {
    var p = new Path2D();
    p.ellipse(collar.x, collar.y, collar.rx, collar.ry, collar.rot, 0, TAU);
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.strokeStyle = 'rgba(' + CYAN + ',0.80)';
    g.lineWidth = Math.max(1, U * 0.007);
    g.stroke(p);
    g.strokeStyle = 'rgba(224,255,255,0.60)';
    g.lineWidth = Math.max(1, U * 0.0026);
    g.stroke(p);
    g.restore();
  }

  /* ------------------------------------------------------------------ *
   *  animated bits
   * ------------------------------------------------------------------ */

  function buildLoose() {
    loose.length = 0;
    var defs = [
      [-0.470, 0.20, -0.545, 0.62, -0.492, 1.00, 0.014, 0.26, 1.6, 0.4, 0],
      [-0.505, 0.52, -0.565, 0.86, -0.520, 1.24, 0.011, 0.30, 2.2, 1.3, 0],
      [0.478, 0.18, 0.552, 0.66, 0.505, 1.08, 0.015, 0.28, 1.9, 2.1, 1],
      [0.512, 0.54, 0.572, 0.90, 0.532, 1.30, 0.011, 0.32, 2.5, 3.4, 1]
    ];
    for (var i = 0; i < defs.length; i++) {
      var d = defs[i];
      loose.push({
        x0: lx(d[0]), y0: ly(d[1]),
        cx: lx(d[2]), cy: ly(d[3]),
        x1: lx(d[4]), y1: ly(d[5]),
        w: U * d[6], amp: U * d[7], sp: d[8], ph: d[9],
        side: d[10]
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

      ctx.strokeStyle = 'rgba(16,8,22,0.95)';
      ctx.lineWidth = s.w;
      ctx.beginPath();
      ctx.moveTo(s.x0, s.y0);
      ctx.quadraticCurveTo(mx, my, ex, ey);
      ctx.stroke();

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = s.side ? 'rgba(' + MAG + ',0.16)' : 'rgba(' + CYAN + ',0.14)';
      ctx.lineWidth = Math.max(1, s.w * 0.34);
      ctx.beginPath();
      ctx.moveTo(s.x0 + (s.side ? s.w * 0.6 : -s.w * 0.6), s.y0);
      ctx.quadraticCurveTo(mx + (s.side ? s.w * 0.6 : -s.w * 0.6), my, ex, ey);
      ctx.stroke();
      ctx.restore();
    }
  }

  function pointOn(c, d) {
    var pts = c.pts, i;
    var acc = 0;
    for (i = 1; i < pts.length; i++) {
      var seg = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      if (acc + seg >= d) {
        var k = seg > 0 ? (d - acc) / seg : 0;
        return {
          x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * k,
          y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * k
        };
      }
      acc += seg;
    }
    return pts[pts.length - 1];
  }

  function drawPulse() {
    var breath = 0.5 + 0.5 * Math.sin(t * 0.85);
    var breath2 = 0.5 + 0.5 * Math.sin(t * 0.85 + 0.9);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (var i = 0; i < circuits.length; i++) {
      var c = circuits[i];
      ctx.strokeStyle = 'rgba(' + CYAN + ',' + (0.05 + 0.11 * breath).toFixed(3) + ')';
      ctx.lineWidth = U * 0.010;
      ctx.beginPath();
      ctx.moveTo(c.pts[0].x, c.pts[0].y);
      for (var k = 1; k < c.pts.length; k++) { ctx.lineTo(c.pts[k].x, c.pts[k].y); }
      ctx.stroke();

      var d = ((t * 0.34 + c.off) % 1) * c.len;
      var pp = pointOn(c, d);
      var gr = U * (0.040 + 0.012 * breath2);
      ctx.globalAlpha = 0.45 + 0.40 * breath2;
      ctx.drawImage(glow.cyan, pp.x - gr, pp.y - gr, gr * 2, gr * 2);
      ctx.globalAlpha = 1;
    }

    var cr = U * 0.080 * (1.0 + 0.12 * breath);
    ctx.globalAlpha = 0.30 + 0.34 * breath;
    ctx.drawImage(glow.cyan, collar.x - cr, collar.y - cr, cr * 2, cr * 2);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function buildDust() {
    dust.length = 0;
    var n = Math.round(Math.min(58, Math.max(40, W * H / 26000)));
    for (var i = 0; i < n; i++) {
      dust.push({
        x: Math.random(),
        y: rand(-0.05, 1.02),
        r: rand(0.008, 0.030),
        vy: rand(0.008, 0.028),
        sp: rand(0.15, 0.65),
        ph: rand(0, TAU),
        amp: rand(0.004, 0.020),
        a: rand(0.22, 0.75),
        c: i % 5 === 0 ? 2 : (i % 3 === 0 ? 1 : 0)
      });
    }
  }

  function drawDust(dt) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < dust.length; i++) {
      var p = dust[i];
      p.y -= p.vy * dt;
      if (p.y < -0.03) {
        p.y = 1.03;
        p.x = Math.random();
      }
      var x = (p.x + Math.sin(t * p.sp + p.ph) * p.amp) * W;
      var y = p.y * H;
      if (x > W * 0.735 && y < H * 0.165) { continue; }
      var tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 2.1 + p.ph * 2.3));
      var d = p.r * H;
      ctx.globalAlpha = p.a * tw * 0.9;
      var spr = p.c === 0 ? glow.cyan : (p.c === 1 ? glow.mag : glow.amber);
      ctx.drawImage(spr, x - d, y - d, d * 2, d * 2);
    }
    ctx.restore();
  }

  function drawSweep() {
    var period = 13;
    var ph = (t % period) / period;
    var x = -0.35 * W + ph * 1.7 * W;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.55;
    ctx.translate(x, H * 0.5);
    ctx.rotate(-0.20);
    ctx.drawImage(sweepC, -W * 0.28, -H * 0.95, W * 0.56, H * 1.9);
    ctx.restore();
  }

  function drawGlitch(dt) {
    if (glitch.on) {
      glitch.age += dt;
      if (glitch.age >= glitch.dur) {
        glitch.on = false;
        glitch.next = rand(5.0, 9.0);
        return;
      }
    } else {
      glitch.next -= dt;
      if (glitch.next > 0) { return; }
      glitch.on = true;
      glitch.age = 0;
      glitch.dur = rand(0.10, 0.14);
      glitch.rgb = Math.random() < 0.5 ? CYAN : MAG;
      glitch.slices = [];
      var n = 8 + Math.floor(Math.random() * 7);
      for (var i = 0; i < n; i++) {
        glitch.slices.push({
          y: Math.random() * H,
          h: rand(0.004, 0.022) * H,
          dx: rand(-6, 6)
        });
      }
    }

    var cw = canvas.width;
    var chh = canvas.height;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (var s = 0; s < glitch.slices.length; s++) {
      var sl = glitch.slices[s];
      var sy = Math.round(sl.y * dpr);
      var sh = Math.round(sl.h * dpr);
      if (sy < 0) { sy = 0; }
      if (sy >= chh) { continue; }
      if (sy + sh > chh) { sh = chh - sy; }
      if (sh < 1) { continue; }
      var dx = Math.round(sl.dx * dpr);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.drawImage(canvas, 0, sy, cw, sh, dx, sy, cw, sh);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.30;
      ctx.drawImage(canvas, 0, sy, cw, sh, dx * 2, sy, cw, sh);
    }
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.16 + Math.random() * 0.10;
    ctx.fillStyle = 'rgba(' + glitch.rgb + ',1)';
    ctx.fillRect(0, Math.round(Math.random() * chh), cw, Math.max(1, Math.round(2 * dpr)));
    ctx.restore();
  }

  function drawFrame(dt) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.drawImage(bgC, 0, 0, W, H);

    /* hologram ring: one rotated blit, already RGB-split in the sprite */
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(RING_NX * W, RING_NY * H);
    ctx.rotate(t * 8 * DEG);
    ctx.globalAlpha = 0.80;
    ctx.drawImage(ringC, -ringSize / 2, -ringSize / 2, ringSize, ringSize);
    ctx.restore();

    /* character */
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.drawImage(chC, 0, 0, W, H);

    drawLoose();
    drawPulse();
    drawDust(dt);
    drawSweep();
    drawGlitch(dt);

    /* keep the exit-button corner dark */
    ctx.drawImage(shadeC, W - shadeW, 0, shadeW, shadeH);
  }

  /* ------------------------------------------------------------------ *
   *  lifecycle
   * ------------------------------------------------------------------ */

  function buildScene() {
    U = H * HEAD_U;
    FX = W * FACE_NX;
    FY = H * FACE_NY;

    glow.cyan = makeGlow(CYAN);
    glow.mag = makeGlow(MAG);
    glow.amber = makeGlow(AMBER);

    buildPaths();
    renderBg();
    renderRing();
    renderShade();
    renderSweep();
    renderChar();
    buildLoose();
    buildDust();

    glitch.on = false;
    glitch.next = 4.0;
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
