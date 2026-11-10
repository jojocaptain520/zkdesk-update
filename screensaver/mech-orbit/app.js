/* Orbit Cruise screensaver
 * Near Earth orbit: a huge Earth limb with atmosphere and clouds, a star sea
 * with a pale nebula band, one mecha cruising with a soft thruster glow, a
 * space station and drifting debris for scale. No people, no humanoids.
 *
 * Everything is pre-rendered into offscreen canvases on layout()/resize.
 * The frame loop only does drawImage / clip / globalAlpha, so no shadowBlur,
 * createRadialGradient, createLinearGradient, getImageData or fillText happen
 * there.
 */
(function () {
  'use strict';

  var canvas = document.getElementById('scene');
  var ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) { return; }

  var MAX_DPR = 1.5;
  var DARK1 = '#0a0f22';
  var DARK2 = '#182046';
  var EARTH_LIT = '#5aa8ee';
  var EARTH_MID = '#2f7fd0';
  var EARTH_DEEP = '#1b4a8c';
  var ATMO = '#bfeaff';
  var NEB_P = '#b7a8e8';
  var NEB_C = '#9fe0ff';
  var MECH_L = '#cfe0ee';
  var MECH_D = '#6f8fa8';
  var SUN = '#ffd9a8';

  var W = 1;
  var H = 1;
  var dpr = 1;
  var rafId = 0;
  var last = 0;
  var t = 0;
  var resizeTimer = 0;
  var lastDt = 1 / 60;

  /* geometry */
  var earthApex = 0.545;      /* fraction of H where the limb peaks */
  var earthR = 1.55;          /* Earth radius in W units */
  var skyH = 0.70;            /* sky layer height fraction */
  var nebW = 0.20;            /* nebula drift margin, fraction of W */
  var cloudW = 0.55;          /* cloud layer extra width, fraction of W */

  var pageCv = null;
  var skyCv = null;
  var earthCv = null;
  var cloudCv = null;
  var grainCv = null;
  var skyW = 1;
  var skyHpx = 1;
  var earthY = 0;
  var earthHpx = 1;
  var earthCy = 0;
  var earthRpx = 1;
  var cloudPx = 1;

  var twinkles = [];
  var debris = [];
  var stationSpr = null;
  var ringSpr = null;
  var mechaSpr = null;
  var glowCyan = null;
  var glowWarm = null;
  var trailSpr = null;
  var stationPos = { x: 0, y: 0, s: 1, rot: 0 };
  var mechaPos = { x: 0, y: 0, s: 1, rot: 0 };

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

  function makeSparkle(px, core, halo) {
    var c = mkCanvas(px, px);
    var g = ctxOf(c);
    var r = px * 0.5;
    var rg = g.createRadialGradient(r, r, 0, r, r, r);
    rg.addColorStop(0, halo);
    rg.addColorStop(0.32, halo.replace(/[\d.]+\)$/, '0.16)'));
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, px, px);
    var w = px * 0.055;
    g.fillStyle = core;
    g.beginPath();
    g.moveTo(r, 0);
    g.quadraticCurveTo(r + w, r - w, px, r);
    g.quadraticCurveTo(r + w, r + w, r, px);
    g.quadraticCurveTo(r - w, r + w, 0, r);
    g.quadraticCurveTo(r - w, r - w, r, 0);
    g.fill();
    g.beginPath();
    g.arc(r, r, px * 0.055, 0, 6.2832);
    g.fillStyle = '#ffffff';
    g.fill();
    return c;
  }

  function makeGlow(px, cr, cg, cb) {
    var c = mkCanvas(px, px);
    var g = ctxOf(c);
    var rad = px * 0.5;
    var rg = g.createRadialGradient(rad, rad, 0, rad, rad, rad);
    rg.addColorStop(0, 'rgba(' + cr + ',' + cg + ',' + cb + ',0.95)');
    rg.addColorStop(0.20, 'rgba(' + cr + ',' + cg + ',' + cb + ',0.58)');
    rg.addColorStop(0.52, 'rgba(' + cr + ',' + cg + ',' + cb + ',0.17)');
    rg.addColorStop(1, 'rgba(' + cr + ',' + cg + ',' + cb + ',0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, px, px);
    return c;
  }

  /* =============================================================== SPRITES */

  /* space station: truss, solar wings, module, dish */
  function makeStation(w) {
    var h = Math.round(w * 0.46);
    var c = mkCanvas(w, h);
    var g = ctxOf(c);
    var u = w / 6.4;
    g.save();
    g.translate(w * 0.5, h * 0.5);
    g.scale(u, u);

    function poly(pts, fill, stroke, lw) {
      g.beginPath();
      for (var i = 0; i < pts.length; i++) {
        if (i === 0) { g.moveTo(pts[i][0], pts[i][1]); } else { g.lineTo(pts[i][0], pts[i][1]); }
      }
      g.closePath();
      if (fill) { g.fillStyle = fill; g.fill(); }
      if (stroke) { g.strokeStyle = stroke; g.lineWidth = (lw || 1) / u; g.stroke(); }
    }
    function line(x1, y1, x2, y2, col, lw) {
      g.beginPath();
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
      g.strokeStyle = col;
      g.lineWidth = lw / u;
      g.stroke();
    }

    /* solar wings (dark blue cell arrays) */
    var wing = [
      [[-3.05, -0.62], [-1.02, -0.40], [-1.02, 0.26], [-3.05, 0.16]],
      [[3.05, -0.62], [1.02, -0.40], [1.02, 0.26], [3.05, 0.16]]
    ];
    var wi;
    for (wi = 0; wi < wing.length; wi++) {
      poly(wing[wi], '#183a6b', '#2c5f9e', 1.2);
      /* cell grid */
      var k;
      for (k = 1; k < 8; k++) {
        var f = k / 8;
        var xa = wing[wi][0][0] + (wing[wi][1][0] - wing[wi][0][0]) * f;
        var ya = wing[wi][0][1] + (wing[wi][1][1] - wing[wi][0][1]) * f;
        var xb = wing[wi][3][0] + (wing[wi][2][0] - wing[wi][3][0]) * f;
        var yb = wing[wi][3][1] + (wing[wi][2][1] - wing[wi][3][1]) * f;
        line(xa, ya, xb, yb, 'rgba(120,190,240,0.30)', 0.8);
      }
      for (k = 1; k < 4; k++) {
        var f2 = k / 4;
        var px1 = wing[wi][0][0] + (wing[wi][3][0] - wing[wi][0][0]) * f2;
        var py1 = wing[wi][0][1] + (wing[wi][3][1] - wing[wi][0][1]) * f2;
        var px2 = wing[wi][1][0] + (wing[wi][2][0] - wing[wi][1][0]) * f2;
        var py2 = wing[wi][1][1] + (wing[wi][2][1] - wing[wi][1][1]) * f2;
        line(px1, py1, px2, py2, 'rgba(120,190,240,0.26)', 0.8);
      }
      /* cyan glint along the sun side */
      line(wing[wi][0][0], wing[wi][0][1], wing[wi][1][0], wing[wi][1][1], 'rgba(191,234,255,0.85)', 1.4);
    }

    /* truss */
    poly([[-1.08, -0.17], [1.08, -0.17], [1.08, 0.17], [-1.08, 0.17]], '#9fb6cc', '#5c7f9e', 1.4);
    var seg;
    for (seg = 0; seg < 7; seg++) {
      var sx = -1.08 + seg * 0.309;
      line(sx, -0.17, sx + 0.309, 0.17, 'rgba(92,127,158,0.75)', 0.9);
    }
    line(-1.08, -0.17, 1.08, -0.17, 'rgba(255,225,190,0.75)', 1.2);

    /* central module */
    poly([[-0.50, -0.40], [0.50, -0.40], [0.50, 0.40], [-0.50, 0.40]], '#cfe0ee', '#5c7f9e', 1.5);
    poly([[-0.50, -0.40], [0.50, -0.40], [0.42, -0.20], [-0.42, -0.20]], '#eaf3fb', null, 0);
    line(-0.50, 0.0, 0.50, 0.0, 'rgba(111,143,168,0.7)', 1.0);
    line(-0.28, -0.40, -0.28, 0.40, 'rgba(111,143,168,0.55)', 0.9);
    line(0.28, -0.40, 0.28, 0.40, 'rgba(111,143,168,0.55)', 0.9);
    /* warm sun side highlight */
    line(-0.50, -0.40, 0.50, -0.40, 'rgba(255,217,168,0.95)', 1.6);

    /* dish */
    g.beginPath();
    g.ellipse(0.70, -0.44, 0.20, 0.10, -0.34, 0, 6.2832);
    g.fillStyle = '#dfe8f3';
    g.fill();
    g.strokeStyle = '#5c7f9e';
    g.lineWidth = 1.2 / u;
    g.stroke();
    line(0.70, -0.44, 0.62, -0.16, 'rgba(92,127,158,0.9)', 1.4);
    /* antenna */
    line(-0.86, -0.17, -0.86, -0.62, 'rgba(207,224,238,0.9)', 1.2);
    g.beginPath();
    g.arc(-0.86, -0.64, 0.05, 0, 6.2832);
    g.fillStyle = 'rgba(255,140,90,0.9)';
    g.fill();

    g.restore();
    return c;
  }

  /* rotating ring for the station */
  function makeRing(px) {
    var c = mkCanvas(px, px);
    var g = ctxOf(c);
    var r = px * 0.5;
    var i;
    g.save();
    g.translate(r, r);
    g.lineCap = 'round';
    for (i = 0; i < 18; i++) {
      var a0 = (i / 18) * 6.2832;
      var a1 = a0 + 0.24;
      g.beginPath();
      g.arc(0, 0, r * 0.80, a0, a1);
      g.strokeStyle = i % 3 === 0 ? 'rgba(191,234,255,0.92)' : 'rgba(159,182,204,0.80)';
      g.lineWidth = Math.max(1.6, px * 0.045);
      g.stroke();
    }
    g.beginPath();
    g.arc(0, 0, r * 0.80, 0, 6.2832);
    g.strokeStyle = 'rgba(191,234,255,0.20)';
    g.lineWidth = Math.max(1, px * 0.012);
    g.stroke();
    g.restore();
    return c;
  }

  /* the cruising mecha: a sleek armoured flight frame, no humanoid shape */
  function makeMecha(w) {
    var h = Math.round(w * 0.56);
    var c = mkCanvas(w, h);
    var g = ctxOf(c);
    var u = w * 0.28;
    g.save();
    g.translate(w * 0.5, h * 0.5);
    g.scale(u, u);

    function P(pts, fill, stroke, lw) {
      g.beginPath();
      for (var i = 0; i < pts.length; i++) {
        if (i === 0) { g.moveTo(pts[i][0], pts[i][1]); } else { g.lineTo(pts[i][0], pts[i][1]); }
      }
      g.closePath();
      if (fill) { g.fillStyle = fill; g.fill(); }
      if (stroke) { g.strokeStyle = stroke; g.lineWidth = (lw || 1) / u; g.stroke(); }
    }

    /* rear thruster block */
    P([[0.92, -0.18], [1.46, -0.24], [1.46, 0.22], [0.92, 0.18]], MECH_D, '#4d6d86', 1.4);
    P([[1.36, -0.15], [1.52, -0.17], [1.52, 0.15], [1.36, 0.17]], '#3d5a72', null, 0);
    /* main hull */
    P([[1.02, -0.02], [0.46, -0.30], [-0.20, -0.34], [-0.78, -0.22],
      [-1.04, 0.02], [-0.70, 0.26], [-0.06, 0.32], [0.52, 0.24]], MECH_L, '#5c7f9e', 1.6);
    /* top deck plate */
    P([[0.86, -0.06], [0.40, -0.24], [-0.16, -0.27], [-0.66, -0.17],
      [-0.56, -0.06], [-0.04, -0.14], [0.42, -0.12]], '#eaf3fb', null, 0);
    /* lower fin */
    P([[-0.18, 0.30], [0.08, 0.31], [-0.20, 0.62], [-0.42, 0.56]], '#b8cde0', '#5c7f9e', 1.1);
    /* swept fin */
    P([[-0.30, -0.30], [-0.02, -0.34], [-0.44, -0.72], [-0.62, -0.66]], '#b8cde0', '#5c7f9e', 1.2);
    /* side pod */
    P([[-0.10, 0.10], [0.26, 0.06], [0.30, 0.22], [0.02, 0.28]], MECH_D, '#4d6d86', 1.2);
    /* nose sensor block with a cyan eye line */
    P([[-1.02, -0.06], [-1.24, -0.02], [-1.24, 0.08], [-1.02, 0.10]], '#3d5a72', '#2f4a60', 1.0);
    g.beginPath();
    g.moveTo([-1.20][0], 0.0);
    g.lineTo(-1.06, -0.02);
    g.lineTo(-1.06, 0.05);
    g.lineTo(-1.20, 0.06);
    g.closePath();
    g.fillStyle = 'rgba(159,224,255,0.95)';
    g.fill();
    /* cyan coolant strip */
    g.fillStyle = 'rgba(159,224,255,0.85)';
    g.beginPath();
    g.moveTo(0.30, 0.20);
    g.lineTo(-0.52, 0.22);
    g.lineTo(-0.52, 0.27);
    g.lineTo(0.30, 0.25);
    g.closePath();
    g.fill();
    /* warm sun rim on the upper left edges */
    g.beginPath();
    g.moveTo(-0.78, -0.22);
    g.lineTo(-0.20, -0.34);
    g.lineTo(0.46, -0.30);
    g.strokeStyle = 'rgba(255,217,168,0.95)';
    g.lineWidth = 1.8 / u;
    g.stroke();
    /* panel lines */
    g.strokeStyle = 'rgba(77,109,134,0.72)';
    g.lineWidth = 0.9 / u;
    g.beginPath();
    g.moveTo(0.30, -0.20);
    g.lineTo(-0.10, -0.10);
    g.lineTo(0.26, 0.06);
    g.stroke();
    g.beginPath();
    g.moveTo(-0.86, 0.06);
    g.lineTo(-0.30, 0.12);
    g.stroke();

    g.restore();
    return c;
  }

  function makeTrail(w, h) {
    var c = mkCanvas(w, h);
    var g = ctxOf(c);
    var lg = g.createLinearGradient(0, 0, w, 0);
    lg.addColorStop(0, 'rgba(159,224,255,0)');
    lg.addColorStop(0.55, 'rgba(159,224,255,0.12)');
    lg.addColorStop(0.88, 'rgba(200,240,255,0.38)');
    lg.addColorStop(1, 'rgba(230,248,255,0.55)');
    g.fillStyle = lg;
    g.beginPath();
    g.moveTo(0, h * 0.5);
    g.quadraticCurveTo(w * 0.6, h * 0.10, w, h * 0.26);
    g.lineTo(w, h * 0.74);
    g.quadraticCurveTo(w * 0.6, h * 0.90, 0, h * 0.5);
    g.closePath();
    g.fill();
    return c;
  }

  function makeShard(px, seed) {
    var c = mkCanvas(px, px);
    var g = ctxOf(c);
    var rnd = rngOf(seed);
    var r = px * 0.32;
    var n = 4 + Math.floor(rnd() * 2);
    var i;
    g.save();
    g.translate(px * 0.5, px * 0.5);
    g.beginPath();
    for (i = 0; i < n; i++) {
      var a = (i / n) * 6.2832 + rnd() * 0.5;
      var rr = r * (0.62 + rnd() * 0.6);
      if (i === 0) { g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      else { g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    }
    g.closePath();
    g.fillStyle = '#9fb6cc';
    g.fill();
    g.strokeStyle = 'rgba(207,224,238,0.85)';
    g.lineWidth = Math.max(0.8, px * 0.03);
    g.stroke();
    /* warm lit edge */
    g.beginPath();
    g.moveTo(-r * 0.5, -r * 0.5);
    g.lineTo(r * 0.3, -r * 0.35);
    g.strokeStyle = 'rgba(255,217,168,0.75)';
    g.stroke();
    g.restore();
    return c;
  }

  /* ================================================================ SCENE */

  function buildPage() {
    pageCv = mkCanvas(W, H);
    var g = ctxOf(pageCv);

    var bg = g.createLinearGradient(0, 0, W * 0.35, H);
    bg.addColorStop(0, '#070b1c');
    bg.addColorStop(0.42, '#0e1530');
    bg.addColorStop(0.72, '#141c3e');
    bg.addColorStop(1, '#1a2348');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);

    /* sun glow, upper left */
    var sx = W * 0.045;
    var sy = H * 0.055;
    var sr = Math.max(W, H) * 0.62;
    var sg = g.createRadialGradient(sx, sy, 0, sx, sy, sr);
    sg.addColorStop(0, 'rgba(255,231,196,0.92)');
    sg.addColorStop(0.08, 'rgba(255,222,180,0.55)');
    sg.addColorStop(0.22, 'rgba(255,205,160,0.20)');
    sg.addColorStop(0.52, 'rgba(190,205,255,0.06)');
    sg.addColorStop(1, 'rgba(120,150,255,0)');
    g.fillStyle = sg;
    g.fillRect(0, 0, W, H);

    /* sun core */
    g.beginPath();
    g.arc(sx, sy, Math.min(W, H) * 0.035, 0, 6.2832);
    g.fillStyle = 'rgba(255,248,232,0.95)';
    g.fill();
    g.beginPath();
    g.arc(sx, sy, Math.min(W, H) * 0.018, 0, 6.2832);
    g.fillStyle = '#ffffff';
    g.fill();

    /* faint horizontal lens streak */
    var ls = g.createLinearGradient(W * 0.0, 0, W * 0.62, 0);
    ls.addColorStop(0, 'rgba(255,226,190,0.20)');
    ls.addColorStop(0.5, 'rgba(255,226,190,0.05)');
    ls.addColorStop(1, 'rgba(255,226,190,0)');
    g.fillStyle = ls;
    g.fillRect(0, H * 0.048, W * 0.62, Math.max(2, H * 0.004));
  }

  function buildSky() {
    skY = W * nebW;
    skyW = W + skY;
    skyHpx = Math.round(H * skyH);
    skyCv = mkCanvas(skyW, skyHpx);
    var g = ctxOf(skyCv);
    var rnd = rngOf(0x7b31);
    var i;

    /* nebula clouds: pale violet and pale cyan, kept off the very top right */
    var blobs = [
      { x: 0.30, y: 0.30, r: 0.50, c: NEB_P, a: 0.30 },
      { x: 0.44, y: 0.46, r: 0.38, c: NEB_C, a: 0.26 },
      { x: 0.18, y: 0.58, r: 0.34, c: NEB_P, a: 0.22 },
      { x: 0.56, y: 0.26, r: 0.30, c: NEB_C, a: 0.20 },
      { x: 0.36, y: 0.70, r: 0.40, c: NEB_C, a: 0.18 },
      { x: 0.68, y: 0.56, r: 0.26, c: NEB_P, a: 0.14 }
    ];
    for (i = 0; i < blobs.length; i++) {
      var b = blobs[i];
      var bx = skyW * b.x;
      var by = skyHpx * b.y;
      var br = Math.max(skyW, skyHpx) * b.r;
      var rg = g.createRadialGradient(bx, by, 0, bx, by, br);
      rg.addColorStop(0, b.c + '');
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.save();
      g.globalAlpha = b.a;
      g.fillStyle = rg;
      g.beginPath();
      g.arc(bx, by, br, 0, 6.2832);
      g.fill();
      g.restore();
    }

    /* milky way band: soft elongated glow, no hard edges */
    g.save();
    g.translate(skyW * 0.36, skyHpx * 0.32);
    g.rotate(0.40);
    g.scale(1, 0.20);
    var bandR = Math.max(skyW, skyHpx) * 0.70;
    var bg2 = g.createRadialGradient(0, 0, 0, 0, 0, bandR);
    bg2.addColorStop(0, 'rgba(226,220,252,0.34)');
    bg2.addColorStop(0.34, 'rgba(183,168,232,0.20)');
    bg2.addColorStop(0.66, 'rgba(159,224,255,0.10)');
    bg2.addColorStop(1, 'rgba(159,224,255,0)');
    g.fillStyle = bg2;
    g.beginPath();
    g.arc(0, 0, bandR, 0, 6.2832);
    g.fill();
    g.restore();

    /* star layers */
    var layers = [
      { n: 300, r: 0.55, a: [0.18, 0.45], col: '200,215,255' },
      { n: 170, r: 1.05, a: [0.30, 0.70], col: '235,244,255' },
      { n: 60, r: 1.75, a: [0.45, 0.90], col: '255,246,230' }
    ];
    var li, k, px, py, pr, pa;
    g.save();
    for (li = 0; li < layers.length; li++) {
      var L = layers[li];
      for (k = 0; k < L.n; k++) {
        px = rnd() * skyW;
        py = rnd() * skyHpx;
        pr = L.r * (0.7 + rnd() * 0.8) * (Math.min(W, H) / 720);
        pa = L.a[0] + rnd() * (L.a[1] - L.a[0]);
        g.fillStyle = 'rgba(' + L.col + ',' + pa.toFixed(2) + ')';
        g.beginPath();
        g.arc(px, py, pr, 0, 6.2832);
        g.fill();
      }
    }
    g.restore();

    /* a few bright flares */
    for (i = 0; i < 8; i++) {
      var fx = rnd() * skyW;
      var fy = rnd() * skyHpx;
      var fs = Math.min(W, H) * (0.013 + rnd() * 0.016);
      g.globalAlpha = 0.75;
      g.drawImage(sparkWarm, fx - fs * 0.5, fy - fs * 0.5, fs, fs);
    }
    g.globalAlpha = 1;
  }

  function buildEarth() {
    earthRpx = earthR * W;
    var apex = earthApex * H;
    earthY = Math.max(0, apex - H * 0.185);
    earthHpx = H - earthY;
    earthCy = apex + earthRpx;

    earthCv = mkCanvas(W, earthHpx);
    var g = ctxOf(earthCv);
    var cy = earthCy - earthY;
    var cx = W * 0.5;
    var R = earthRpx;

    /* atmosphere halo outside the limb: many soft passes */
    var i;
    var haloPass = [0.030, 0.022, 0.016, 0.0115, 0.0080, 0.0055, 0.0038];
    var haloAlpha = [0.018, 0.026, 0.036, 0.050, 0.070, 0.100, 0.150];
    g.save();
    g.strokeStyle = ATMO;
    for (i = 0; i < haloPass.length; i++) {
      g.globalAlpha = haloAlpha[i];
      g.lineWidth = R * haloPass[i];
      g.beginPath();
      g.arc(cx, cy, R + R * haloPass[i] * 0.30, 0, 6.2832);
      g.stroke();
    }
    g.restore();

    /* earth disk */
    g.save();
    g.beginPath();
    g.arc(cx, cy, R, 0, 6.2832);
    g.clip();

    var ocean = g.createLinearGradient(0, 0, W * 0.9, earthHpx);
    ocean.addColorStop(0, '#6fbcf2');
    ocean.addColorStop(0.30, '#2f7fd0');
    ocean.addColorStop(0.62, '#1d5fae');
    ocean.addColorStop(1, '#123f7c');
    g.fillStyle = ocean;
    g.fillRect(0, 0, W, earthHpx);

    /* sun glint on the ocean, upper left */
    g.save();
    g.translate(W * 0.14, earthHpx * 0.30);
    g.scale(1, 0.16);
    var glint = g.createRadialGradient(0, 0, 0, 0, 0, W * 0.34);
    glint.addColorStop(0, 'rgba(255,244,220,0.55)');
    glint.addColorStop(0.4, 'rgba(255,236,200,0.22)');
    glint.addColorStop(1, 'rgba(255,236,200,0)');
    g.fillStyle = glint;
    g.beginPath();
    g.arc(0, 0, W * 0.34, 0, 6.2832);
    g.fill();
    g.restore();

    /* landmass hints */
    var rnd = rngOf(0x51f3);
    var lm;
    for (lm = 0; lm < 9; lm++) {
      var lx = rnd() * W;
      var ly = earthHpx * (0.10 + rnd() * 0.9);
      var lr = W * (0.05 + rnd() * 0.13);
      var lg = g.createRadialGradient(lx, ly, 0, lx, ly, lr);
      lg.addColorStop(0, 'rgba(96,168,150,0.34)');
      lg.addColorStop(0.6, 'rgba(88,150,140,0.18)');
      lg.addColorStop(1, 'rgba(88,150,140,0)');
      g.fillStyle = lg;
      g.beginPath();
      g.arc(lx, ly, lr, 0, 6.2832);
      g.fill();
    }

    /* terminator: sun from upper left, the right/bottom falls into night */
    var sunYr = H * 0.055 - earthY;
    var term = g.createRadialGradient(W * 0.02, sunYr, R * 0.55, W * 0.02, sunYr, R * 1.85);
    term.addColorStop(0, 'rgba(4,8,20,0)');
    term.addColorStop(0.50, 'rgba(4,8,20,0.08)');
    term.addColorStop(0.72, 'rgba(4,8,20,0.40)');
    term.addColorStop(0.88, 'rgba(3,6,16,0.72)');
    term.addColorStop(1, 'rgba(2,5,14,0.88)');
    g.fillStyle = term;
    g.fillRect(0, 0, W, earthHpx);

    /* city lights on the night side */
    var rnd3 = rngOf(0x6c2f);
    var li2;
    for (li2 = 0; li2 < 220; li2++) {
      var lx2 = W * (0.30 + rnd3() * 0.70);
      var ly2 = earthHpx * (0.02 + rnd3() * 0.96);
      var lfade = clamp((lx2 / W - 0.30) / 0.40, 0, 1) * 0.60;
      if (lfade <= 0.02) { continue; }
      g.fillStyle = 'rgba(255,212,150,' + (0.18 + rnd3() * 0.45 * lfade).toFixed(2) + ')';
      g.beginPath();
      g.arc(lx2, ly2, 0.7 + rnd3() * 1.7, 0, 6.2832);
      g.fill();
    }

    /* inner atmosphere brightening near the limb */
    var rim = g.createLinearGradient(0, 0, 0, earthHpx * 0.42);
    rim.addColorStop(0, 'rgba(191,234,255,0.50)');
    rim.addColorStop(0.55, 'rgba(159,224,255,0.16)');
    rim.addColorStop(1, 'rgba(159,224,255,0)');
    g.fillStyle = rim;
    g.fillRect(0, 0, W, earthHpx * 0.42);

    /* warm sunlight on the upper left limb */
    var warm = g.createRadialGradient(W * 0.10, 0, 0, W * 0.10, 0, W * 0.70);
    warm.addColorStop(0, 'rgba(255,217,168,0.42)');
    warm.addColorStop(0.45, 'rgba(255,200,150,0.14)');
    warm.addColorStop(1, 'rgba(255,200,150,0)');
    g.fillStyle = warm;
    g.fillRect(0, 0, W, earthHpx * 0.72);

    /* base cloud haze baked into the planet */
    var rnd2 = rngOf(0x2c81);
    var ci;
    for (ci = 0; ci < 55; ci++) {
      var cx2 = rnd2() * W;
      var cy2 = rnd2() * earthHpx;
      var rx2 = W * (0.030 + rnd2() * 0.085);
      var ry2 = rx2 * (0.20 + rnd2() * 0.75);
      g.save();
      g.translate(cx2, cy2);
      g.rotate(-Math.PI + rnd2() * 6.2832);
      g.scale(1, ry2 / rx2);
      var cg = g.createRadialGradient(0, 0, 0, 0, 0, rx2);
      cg.addColorStop(0, 'rgba(255,255,255,' + (0.07 + rnd2() * 0.16).toFixed(2) + ')');
      cg.addColorStop(0.6, 'rgba(240,248,255,' + (0.05 + rnd2() * 0.12).toFixed(2) + ')');
      cg.addColorStop(1, 'rgba(230,242,255,0)');
      g.fillStyle = cg;
      g.beginPath();
      g.arc(0, 0, rx2, 0, 6.2832);
      g.fill();
      g.restore();
    }
    /* a few large weather systems */
    for (ci = 0; ci < 6; ci++) {
      var sx2 = rnd2() * W;
      var sy2 = earthHpx * (0.05 + rnd2() * 0.9);
      var sr2 = W * (0.06 + rnd2() * 0.10);
      g.save();
      g.translate(sx2, sy2);
      g.rotate(rnd2() * 6.2832);
      g.scale(1, 0.24 + rnd2() * 0.5);
      var wg = g.createRadialGradient(0, 0, 0, 0, 0, sr2);
      wg.addColorStop(0, 'rgba(255,255,255,0.20)');
      wg.addColorStop(0.5, 'rgba(245,250,255,0.12)');
      wg.addColorStop(1, 'rgba(235,246,255,0)');
      g.fillStyle = wg;
      g.beginPath();
      g.arc(0, 0, sr2, 0, 6.2832);
      g.fill();
      g.restore();
    }
    /* crisp small puffs so the cloud deck keeps some structure */
    for (ci = 0; ci < 42; ci++) {
      var px3 = rnd2() * W;
      var py3 = earthHpx * (0.02 + rnd2() * 0.96);
      var pr3 = W * (0.010 + rnd2() * 0.026);
      g.save();
      g.translate(px3, py3);
      g.rotate(rnd2() * 6.2832);
      g.scale(1, 0.22 + rnd2() * 0.55);
      var pg = g.createRadialGradient(0, 0, 0, 0, 0, pr3);
      pg.addColorStop(0, 'rgba(255,255,255,' + (0.12 + rnd2() * 0.20).toFixed(2) + ')');
      pg.addColorStop(0.7, 'rgba(244,250,255,' + (0.12 + rnd2() * 0.14).toFixed(2) + ')');
      pg.addColorStop(1, 'rgba(236,246,255,0)');
      g.fillStyle = pg;
      g.beginPath();
      g.arc(0, 0, pr3, 0, 6.2832);
      g.fill();
      g.restore();
    }
    g.restore();

    /* crisp bright limb line */
    g.save();
    g.strokeStyle = 'rgba(226,246,255,0.95)';
    g.lineWidth = Math.max(1.4, R * 0.0014);
    g.beginPath();
    g.arc(cx, cy, R - Math.max(1, R * 0.001), 0, 6.2832);
    g.stroke();
    g.strokeStyle = 'rgba(191,234,255,0.45)';
    g.lineWidth = Math.max(2, R * 0.0032);
    g.beginPath();
    g.arc(cx, cy, R, 0, 6.2832);
    g.stroke();
    /* warm sun side of the limb */
    g.strokeStyle = 'rgba(255,225,190,0.85)';
    g.lineWidth = Math.max(1.6, R * 0.0016);
    g.beginPath();
    g.arc(cx, cy, R - Math.max(1, R * 0.001), Math.PI * 1.06, Math.PI * 1.62);
    g.stroke();
    g.restore();
  }

  function buildClouds() {
    cloudPx = Math.round(W * cloudW);
    cloudCv = mkCanvas(W + cloudPx, earthHpx);
    var g = ctxOf(cloudCv);
    var rnd = rngOf(0x8d17);
    var i;
    for (i = 0; i < 80; i++) {
      var cx = rnd() * (W + cloudPx);
      var cy = rnd() * earthHpx;
      var rx = (W + cloudPx) * (0.008 + rnd() * 0.038);
      var ry = rx * (0.20 + rnd() * 0.75);
      var alpha = 0.06 + rnd() * 0.18;
      g.save();
      g.translate(cx, cy);
      g.rotate(rnd() * 6.2832);
      g.scale(1, ry / rx);
      var cg = g.createRadialGradient(0, 0, 0, 0, 0, rx);
      cg.addColorStop(0, 'rgba(255,255,255,' + alpha.toFixed(2) + ')');
      cg.addColorStop(0.55, 'rgba(238,248,255,' + (alpha * 0.45).toFixed(2) + ')');
      cg.addColorStop(1, 'rgba(230,244,255,0)');
      g.fillStyle = cg;
      g.beginPath();
      g.arc(0, 0, rx, 0, 6.2832);
      g.fill();
      g.restore();
    }
    /* a couple of long swirls */
    for (i = 0; i < 8; i++) {
      var sx = rnd() * (W + cloudPx);
      var sy = rnd() * earthHpx;
      var len = (W + cloudPx) * (0.10 + rnd() * 0.22);
      g.strokeStyle = 'rgba(255,255,255,' + (0.06 + rnd() * 0.10).toFixed(2) + ')';
      g.lineWidth = Math.max(2, earthHpx * (0.004 + rnd() * 0.008));
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(sx, sy);
      g.quadraticCurveTo(sx + len * 0.5, sy - earthHpx * 0.05, sx + len, sy + earthHpx * 0.01);
      g.stroke();
    }
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
      d[i] = 120; d[i + 1] = 132; d[i + 2] = 165;
      d[i + 3] = v < 0.62 ? 0 : Math.round(24 + v * 90);
    }
    ng.putImageData(img, 0, 0);
    var np = g.createPattern(noise, 'repeat');
    if (np && np.setTransform && typeof DOMMatrix === 'function') {
      try { np.setTransform(new DOMMatrix([1 / dpr, 0, 0, 1 / dpr, 0, 0])); } catch (e) { /* ignore */ }
    }
    g.globalAlpha = 0.035;
    g.fillStyle = np;
    g.fillRect(0, 0, W, H);
    g.globalAlpha = 1;

    /* gentle edge shading */
    var rg = g.createRadialGradient(W * 0.5, H * 0.46, Math.min(W, H) * 0.46, W * 0.5, H * 0.5, Math.max(W, H) * 0.84);
    rg.addColorStop(0, 'rgba(4,7,18,0)');
    rg.addColorStop(1, 'rgba(4,7,18,0.30)');
    g.fillStyle = rg;
    g.fillRect(0, 0, W, H);
  }

  function buildActors() {
    var m = Math.min(W, H);
    stationPos.s = W * 0.255;
    stationPos.x = W * 0.245;
    stationPos.y = H * 0.235;
    stationPos.rot = -0.16;
    stationSpr = makeStation(stationPos.s);
    ringSpr = makeRing(Math.round(W * 0.115));
    mechaPos.s = W * 0.126;
    mechaPos.x = W * 0.645;
    mechaPos.y = H * 0.325;
    mechaPos.rot = 0.06;
    mechaSpr = makeMecha(mechaPos.s);
    glowCyan = makeGlow(Math.max(24, Math.round(W * 0.052)), 159, 224, 255);
    glowWarm = makeGlow(Math.max(20, Math.round(W * 0.030)), 255, 217, 168);
    trailSpr = makeTrail(Math.max(40, Math.round(W * 0.090)), Math.max(10, Math.round(W * 0.015)));

    /* twinkling stars in the sky band */
    var rnd = rngOf(0x4411);
    var i;
    for (i = 0; i < 62; i++) {
      var x = 0;
      var y = 0;
      for (var gt = 0; gt < 30; gt++) {
        x = W * (0.02 + rnd() * 0.96);
        y = H * (0.03 + rnd() * (skyH - 0.10));
        /* keep the host exit button corner (top right) free of bright sparkles */
        if (!(x > W * 0.755 && y < H * 0.175)) { break; }
      }
      twinkles.push({
        x: x, y: y,
        s: m * (0.008 + rnd() * 0.017),
        spr: rnd() < 0.3 ? sparkWarm : sparkCool,
        ph: rnd() * 6.2832,
        spd: 0.5 + rnd() * 1.7,
        lo: 0.10 + rnd() * 0.30
      });
    }

    /* drifting debris */
    var rd = rngOf(0x2f77);
    for (i = 0; i < 9; i++) {
      debris.push({
        spr: makeShard(Math.max(10, Math.round(m * (0.020 + rd() * 0.020))), 0x100 + i * 37),
        x: W * (0.05 + rd() * 0.90),
        y: H * (0.06 + rd() * 0.42),
        vx: (rd() - 0.5) * W * 0.004,
        vy: (rd() - 0.5) * H * 0.004,
        rot: rd() * 6.2832,
        spin: (rd() - 0.5) * 0.10,
        s: m * (0.020 + rd() * 0.020)
      });
    }
  }

  /* ================================================================ DRAW = */

  var skyWpx = 1;
  var skY;
  var sparkWarm = null;
  var sparkCool = null;

  function layout() {
    dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    W = Math.max(320, Math.floor(window.innerWidth));
    H = Math.max(240, Math.floor(window.innerHeight));
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    twinkles.length = 0;
    debris.length = 0;

    /* sprites used by the sky builder must exist first */
    var mm = Math.min(W, H);
    sparkWarm = makeSparkle(Math.max(16, Math.round(mm * 0.055)), 'rgba(255,250,236,0.98)', 'rgba(255,226,190,0.80)');
    sparkCool = makeSparkle(Math.max(12, Math.round(mm * 0.036)), 'rgba(236,248,255,0.95)', 'rgba(159,224,255,0.75)');

    buildPage();
    buildSky();
    buildEarth();
    buildClouds();
    buildGrain();
    buildActors();

    t = 0;
    last = 0;
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = DARK1;
    ctx.fillRect(0, 0, W, H);

    /* deep space + sun glow */
    ctx.drawImage(pageCv, 0, 0, W, H);

    /* nebula + star field, very slow drift */
    var skyOff = (t * 3.2) % skY;
    ctx.drawImage(skyCv, -skyOff, 0, skyW, skyHpx);

    /* Earth limb */
    ctx.drawImage(earthCv, 0, earthY, W, earthHpx);

    /* cloud deck, clipped just inside the limb and slowly moving */
    var cOff = (t * 2.4) % cloudPx;
    ctx.save();
    ctx.beginPath();
    ctx.arc(W * 0.5, earthCy, earthRpx * 0.9985, 0, 6.2832);
    ctx.clip();
    ctx.drawImage(cloudCv, -cOff, earthY, W + cloudPx, earthHpx);
    ctx.restore();

    /* twinkling stars */
    var i;
    for (i = 0; i < twinkles.length; i++) {
      var tw = twinkles[i];
      var a = tw.lo + (1 - tw.lo) * (0.5 + 0.5 * Math.sin(t * tw.spd + tw.ph));
      ctx.globalAlpha = a;
      ctx.drawImage(tw.spr, tw.x - tw.s * 0.5, tw.y - tw.s * 0.5, tw.s, tw.s);
    }
    ctx.globalAlpha = 1;

    /* drifting debris */
    for (i = 0; i < debris.length; i++) {
      var db = debris[i];
      db.x += db.vx * lastDt;
      db.y += db.vy * lastDt;
      db.rot += db.spin * lastDt;
      if (db.x < -W * 0.08) { db.x = W * 1.04; }
      if (db.x > W * 1.08) { db.x = -W * 0.04; }
      if (db.y < -H * 0.08) { db.y = H * 0.54; }
      if (db.y > H * 0.56) { db.y = -H * 0.04; }
      ctx.save();
      ctx.translate(db.x, db.y);
      ctx.rotate(db.rot);
      ctx.globalAlpha = 0.90;
      ctx.drawImage(db.spr, -db.s * 0.5, -db.s * 0.5, db.s, db.s);
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    /* space station: slow sway + rotating ring */
    var swayA = 0.012 * Math.sin(t * 0.23);
    ctx.save();
    ctx.translate(stationPos.x, stationPos.y);
    ctx.rotate(stationPos.rot + swayA);
    var sw = stationPos.s;
    var sh = stationSpr.height / dpr;
    ctx.drawImage(stationSpr, -sw * 0.5, -sh * 0.5, sw, sh);
    /* ring: fake rotation by squashing a rotating ring sprite */
    var ringR = ringSpr.width / dpr;
    var squash = 0.30 + 0.70 * Math.abs(Math.cos(t * 0.18));
    ctx.save();
    ctx.rotate(0.10);
    ctx.scale(squash, 1);
    ctx.rotate(t * 0.18);
    ctx.drawImage(ringSpr, -ringR * 0.5, -ringR * 0.5, ringR, ringR);
    ctx.restore();
    ctx.restore();

    /* the cruising mecha */
    var bob = Math.sin(t * 0.42) * H * 0.006;
    ctx.save();
    ctx.translate(mechaPos.x, mechaPos.y + bob);
    ctx.rotate(mechaPos.rot + Math.sin(t * 0.30) * 0.02);
    var mw = mechaPos.s;
    var mh = mechaSpr.height / dpr;
    /* thruster glow behind the hull */
    var pulse = 0.62 + 0.20 * Math.sin(t * 5.1) + 0.10 * Math.sin(t * 11.7);
    var gr = glowCyan.width / dpr;
    ctx.globalAlpha = 0.26 + 0.06 * Math.sin(t * 3.7);
    var tw2 = trailSpr.width / dpr;
    var th2 = trailSpr.height / dpr;
    ctx.drawImage(trailSpr, mw * 0.52, -th2 * 0.5, tw2, th2);
    ctx.globalAlpha = pulse * 0.85;
    ctx.drawImage(glowCyan, mw * 0.52 - gr * 0.34, -gr * 0.5, gr, gr);
    ctx.globalAlpha = 1;
    ctx.drawImage(mechaSpr, -mw * 0.5, -mh * 0.5, mw, mh);
    /* small warm reflection of the sun on the hull front */
    ctx.globalAlpha = 0.32;
    var wr = glowWarm.width / dpr;
    ctx.drawImage(glowWarm, -mw * 0.62 - wr * 0.5, -wr * 0.5, wr, wr);
    ctx.globalAlpha = 1;
    ctx.restore();

    /* film grain + edge shading */
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
