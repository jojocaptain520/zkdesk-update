/* Mech Core - a reactor chamber drawn entirely with canvas 2D.
   No external asset, no network, no storage, and no human figure anywhere:
   only machinery, energy and light.

   Static layers (sky, chamber, gantry, core sphere, ring sprites, foreground)
   are pre-rendered once per resize; the per-frame loop only blits those layers
   and moves the rings, the energy motes, the hydraulic rams, the scan band and
   the amber beacons. */
(function () {
  'use strict';

  var canvas = document.getElementById('scene');
  var ctx = canvas && canvas.getContext('2d');
  if (!ctx) { return; }

  var MAX_DPR = 1.5;
  var TAU = Math.PI * 2;
  var DEG = Math.PI / 180;

  /* composition */
  var CORE_NX = 0.44, CORE_NY = 0.455;
  var CORE_RF = 0.155;               /* sphere radius / screen height */
  var FLOOR_NY = 0.705;

  var DEEP0 = '#0a1b2e';
  var DEEP1 = '#12395a';
  var DEEP2 = '#1b4a6b';
  var CYAN = '127,240,255';
  var ICEC = '198,246,255';
  var AMBER = '255,181,69';
  var STEEL_HI = '159,196,221';
  var STEEL_M = '86,124,152';
  var STEEL_D = '36,62,84';
  var STEEL_DD = '18,36,52';

  var W = 1, H = 1, dpr = 1;
  var CX = 1, CY = 1, CR = 1, FLOOR = 1;
  var rafId = 0, last = 0, t = 0, resizeTimer = 0;

  var bgC = null, backC = null, frontC = null;
  var coreC = null, coreSize = 1;
  var rings = [];
  var bandC = null, bandH = 1;
  var shadeC = null, shadeW = 0, shadeH = 0;
  var glow = {};

  var motes = [];
  var embers = [];
  var beacons = [];
  var rams = [];

  function rand(a, b) { return a + Math.random() * (b - a); }

  function makeCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }

  function makeGlow(rgb, core) {
    var s = 128;
    var c = makeCanvas(s, s);
    var g = c.getContext('2d');
    var rg = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    rg.addColorStop(0, 'rgba(' + rgb + ',' + core + ')');
    rg.addColorStop(0.18, 'rgba(' + rgb + ',' + (core * 0.7) + ')');
    rg.addColorStop(0.48, 'rgba(' + rgb + ',' + (core * 0.24) + ')');
    rg.addColorStop(1, 'rgba(' + rgb + ',0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, s, s);
    return c;
  }

  /* ------------------------------------------------------------------ *
   *  helpers
   * ------------------------------------------------------------------ */

  function radial(g, cx, cy, r, rgb, a, mid) {
    var rg = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(1, r));
    rg.addColorStop(0, 'rgba(' + rgb + ',' + a + ')');
    rg.addColorStop(mid || 0.5, 'rgba(' + rgb + ',' + (a * 0.42) + ')');
    rg.addColorStop(0.82, 'rgba(' + rgb + ',' + (a * 0.10) + ')');
    rg.addColorStop(1, 'rgba(' + rgb + ',0)');
    g.fillStyle = rg;
    g.fillRect(cx - r, cy - r, r * 2, r * 2);
  }

  function steel(g, x0, y0, x1, y1, hiA, loA) {
    var lg = g.createLinearGradient(x0, y0, x1, y1);
    lg.addColorStop(0, 'rgba(' + STEEL_HI + ',' + (hiA === undefined ? 0.85 : hiA) + ')');
    lg.addColorStop(0.35, 'rgba(' + STEEL_M + ',0.85)');
    lg.addColorStop(0.72, 'rgba(' + STEEL_D + ',0.95)');
    lg.addColorStop(1, 'rgba(' + STEEL_DD + ',' + (loA === undefined ? 1 : loA) + ')');
    return lg;
  }

  function hexPath(g, cx, cy, r, rot) {
    g.beginPath();
    for (var i = 0; i < 6; i++) {
      var a = rot + i * TAU / 6;
      var px = cx + Math.cos(a) * r;
      var py = cy + Math.sin(a) * r;
      if (i === 0) { g.moveTo(px, py); } else { g.lineTo(px, py); }
    }
    g.closePath();
  }

  function gear(g, cx, cy, r, teeth, rot, dark) {
    var i, a, rr;
    g.save();
    g.translate(cx, cy);
    g.rotate(rot);
    g.beginPath();
    for (i = 0; i < teeth; i++) {
      a = i / teeth * TAU;
      var a2 = (i + 0.5) / teeth * TAU;
      var w = TAU / teeth * 0.30;
      var r1 = r * 0.90, r2 = r * 1.02;
      g.lineTo(Math.cos(a - w) * r1, Math.sin(a - w) * r1);
      g.lineTo(Math.cos(a - w * 0.55) * r2, Math.sin(a - w * 0.55) * r2);
      g.lineTo(Math.cos(a + w * 0.55) * r2, Math.sin(a + w * 0.55) * r2);
      g.lineTo(Math.cos(a + w) * r1, Math.sin(a + w) * r1);
      g.lineTo(Math.cos(a2 - w * 0.2) * r1, Math.sin(a2 - w * 0.2) * r1);
    }
    g.closePath();
    var lg = g.createLinearGradient(-r, -r, r, r);
    lg.addColorStop(0, dark ? 'rgba(84,122,152,0.95)' : 'rgba(140,182,212,0.95)');
    lg.addColorStop(0.5, 'rgba(66,102,132,0.95)');
    lg.addColorStop(1, 'rgba(28,54,76,0.98)');
    g.fillStyle = lg;
    g.fill();
    g.strokeStyle = 'rgba(' + STEEL_HI + ',0.35)';
    g.lineWidth = Math.max(1, r * 0.02);
    g.stroke();
    /* hub + spokes */
    g.beginPath();
    g.arc(0, 0, r * 0.30, 0, TAU);
    g.fillStyle = 'rgba(16,32,46,0.98)';
    g.fill();
    g.strokeStyle = 'rgba(' + STEEL_HI + ',0.55)';
    g.lineWidth = Math.max(1, r * 0.025);
    g.stroke();
    for (i = 0; i < 4; i++) {
      a = i / 4 * TAU + 0.4;
      g.beginPath();
      g.moveTo(Math.cos(a) * r * 0.28, Math.sin(a) * r * 0.28);
      g.lineTo(Math.cos(a) * r * 0.85, Math.sin(a) * r * 0.85);
      g.strokeStyle = 'rgba(90,124,150,0.75)';
      g.lineWidth = Math.max(1, r * 0.06);
      g.stroke();
    }
    g.restore();
  }

  /* ------------------------------------------------------------------ *
   *  background: chamber, light shafts, floor
   * ------------------------------------------------------------------ */

  function renderBg() {
    bgC = makeCanvas(W * dpr, H * dpr);
    var g = bgC.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    var lg = g.createLinearGradient(W * 0.1, 0, W * 0.8, H);
    lg.addColorStop(0, '#0d2338');
    lg.addColorStop(0.40, '#17466a');
    lg.addColorStop(0.76, '#236088');
    lg.addColorStop(1, '#2c76a2');
    g.fillStyle = lg;
    g.fillRect(0, 0, W, H);

    /* chamber light behind everything */
    radial(g, CX, CY, H * 1.05, '84,170,208', 0.78);
    radial(g, CX, CY, H * 0.62, '160,236,255', 0.58);
    radial(g, CX, CY + H * 0.16, H * 0.44, '206,248,255', 0.46);

    drawChamber(g);
    drawShafts(g);
    drawFloor(g);
    drawHaze(g);
  }

  function drawChamber(g) {
    var i, a;
    /* concentric wall ribs behind the core */
    for (i = 0; i < 7; i++) {
      var r = H * (0.26 + i * 0.075);
      g.strokeStyle = 'rgba(146,208,236,' + (0.24 - i * 0.022) + ')';
      g.lineWidth = Math.max(1, H * (0.010 - i * 0.0008));
      g.beginPath();
      g.arc(CX, CY - H * 0.03, r, 0, TAU);
      g.stroke();
    }

    /* vertical ribs / pillars */
    var cols = [0.045, 0.105, 0.168, 0.832, 0.895, 0.958];
    for (i = 0; i < cols.length; i++) {
      var x = cols[i] * W;
      var w = W * (i % 2 === 0 ? 0.016 : 0.010);
      var rg = g.createLinearGradient(x - w, 0, x + w, 0);
      rg.addColorStop(0, 'rgba(16,40,58,0.95)');
      rg.addColorStop(0.32, 'rgba(58,96,126,0.95)');
      rg.addColorStop(0.52, 'rgba(146,192,220,0.92)');
      rg.addColorStop(0.68, 'rgba(64,104,134,0.95)');
      rg.addColorStop(1, 'rgba(14,34,50,0.95)');
      g.fillStyle = rg;
      g.fillRect(x - w, 0, w * 2, FLOOR);
      /* edge light */
      g.strokeStyle = 'rgba(' + CYAN + ',0.30)';
      g.lineWidth = Math.max(1, W * 0.0016);
      g.beginPath();
      g.moveTo(x + w * 0.55, 0);
      g.lineTo(x + w * 0.55, FLOOR);
      g.stroke();
    }

    /* horizontal panel bands on the back wall */
    for (i = 0; i < 8; i++) {
      var y = FLOOR - H * (0.06 + i * 0.075);
      g.strokeStyle = 'rgba(120,180,210,' + (0.05 + (i % 3) * 0.012) + ')';
      g.lineWidth = Math.max(1, H * 0.004);
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(W, y);
      g.stroke();
    }

    /* big arch outline around the core */
    a = H * 0.34;
    g.strokeStyle = 'rgba(150,210,238,0.22)';
    g.lineWidth = Math.max(1.5, H * 0.006);
    g.beginPath();
    g.arc(CX, CY - H * 0.02, a, -1.15, 1.15);
    g.stroke();
    g.strokeStyle = 'rgba(150,210,238,0.14)';
    g.lineWidth = Math.max(1, H * 0.003);
    g.beginPath();
    g.arc(CX, CY - H * 0.02, a * 1.14, -1.20, 1.20);
    g.stroke();

    /* bolts along the arch */
    for (i = 0; i <= 10; i++) {
      var ang = -1.15 + i / 10 * 2.30;
      var bx = CX + Math.cos(ang) * a;
      var by = CY - H * 0.02 + Math.sin(ang) * a;
      g.fillStyle = 'rgba(18,38,54,0.95)';
      g.beginPath();
      g.arc(bx, by, Math.max(1.2, H * 0.006), 0, TAU);
      g.fill();
      g.fillStyle = 'rgba(' + STEEL_HI + ',0.55)';
      g.beginPath();
      g.arc(bx - H * 0.002, by - H * 0.002, Math.max(0.8, H * 0.003), 0, TAU);
      g.fill();
    }
  }

  function drawShafts(g) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    var defs = [
      [-0.05, 0.10, 0.36, 0.52, 0.50, 0.10],
      [0.08, 0.04, 0.46, 0.44, 0.85, 0.075],
      [0.62, 0.02, 0.44, 0.48, 0.35, 0.075],
      [0.80, 0.10, 0.52, 0.55, 0.65, 0.06]
    ];
    for (var i = 0; i < defs.length; i++) {
      var d = defs[i];
      var x0 = d[0] * W, y0 = -H * 0.05, x1 = d[2] * W, y1 = d[3] * H;
      var w0 = W * 0.02, w1 = W * d[4] * 0.32;
      var lg = g.createLinearGradient(x0, y0, x1, y1);
      lg.addColorStop(0, 'rgba(170,235,255,' + d[5] + ')');
      lg.addColorStop(0.55, 'rgba(140,215,245,' + (d[5] * 0.55) + ')');
      lg.addColorStop(1, 'rgba(120,200,235,0)');
      g.fillStyle = lg;
      g.beginPath();
      g.moveTo(x0 - w0, y0);
      g.lineTo(x0 + w0, y0);
      g.lineTo(x1 + w1, y1);
      g.lineTo(x1 - w1, y1);
      g.closePath();
      g.fill();
    }
    g.restore();
  }

  function drawFloor(g) {
    /* floor plate */
    var fg = g.createLinearGradient(0, FLOOR, 0, H);
    fg.addColorStop(0, 'rgba(44,104,140,1)');
    fg.addColorStop(0.30, 'rgba(34,84,116,1)');
    fg.addColorStop(1, 'rgba(24,60,86,1)');
    g.fillStyle = fg;
    g.fillRect(0, FLOOR, W, H - FLOOR);

    /* glow pool under the core */
    g.save();
    g.globalCompositeOperation = 'lighter';
    var pg = g.createRadialGradient(CX, FLOOR + H * 0.02, 0, CX, FLOOR + H * 0.02, W * 0.40);
    pg.addColorStop(0, 'rgba(200,250,255,0.70)');
    pg.addColorStop(0.30, 'rgba(130,222,250,0.40)');
    pg.addColorStop(1, 'rgba(80,180,220,0)');
    g.fillStyle = pg;
    g.save();
    g.translate(CX, FLOOR + H * 0.03);
    g.scale(1, 0.34);
    g.translate(-CX, -(FLOOR + H * 0.03));
    g.fillRect(CX - W * 0.42, FLOOR + H * 0.03 - W * 0.42, W * 0.84, W * 0.84);
    g.restore();
    g.restore();

    /* perspective grid */
    var vx = CX, vy = FLOOR - H * 0.06;
    g.strokeStyle = 'rgba(120,190,220,0.22)';
    g.lineWidth = Math.max(1, H * 0.0018);
    var i, x;
    for (i = -14; i <= 14; i++) {
      x = CX + i * W * 0.085;
      g.beginPath();
      g.moveTo(vx, vy);
      g.lineTo(x, H + 8);
      g.stroke();
    }
    for (i = 1; i <= 7; i++) {
      var yy = FLOOR + Math.pow(i / 7, 1.9) * (H - FLOOR);
      g.strokeStyle = 'rgba(120,190,220,' + (0.06 + 0.14 * (1 - i / 7)) + ')';
      g.beginPath();
      g.moveTo(0, yy);
      g.lineTo(W, yy);
      g.stroke();
    }
  }

  function drawHaze(g) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    /* low haze above the floor */
    var hg = g.createLinearGradient(0, FLOOR - H * 0.18, 0, FLOOR + H * 0.06);
    hg.addColorStop(0, 'rgba(110,190,225,0)');
    hg.addColorStop(0.65, 'rgba(130,210,242,0.20)');
    hg.addColorStop(1, 'rgba(150,222,248,0.28)');
    g.fillStyle = hg;
    g.fillRect(0, FLOOR - H * 0.18, W, H * 0.24);
    /* corner haze so the frame is not dead black */
    radial(g, W * 0.06, H * 0.16, H * 0.60, '52,112,150', 0.42);
    radial(g, W * 0.95, H * 0.20, H * 0.55, '52,112,150', 0.38);
    radial(g, W * 0.50, H * 0.96, W * 0.60, '64,140,180', 0.30);
    g.restore();
  }

  /* ------------------------------------------------------------------ *
   *  mechanical skeleton (behind the core)
   * ------------------------------------------------------------------ */

  function renderBack() {
    backC = makeCanvas(W * dpr, H * dpr);
    var g = backC.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    drawHeatSinks(g);
    drawGears(g);
    drawPylons(g);
    drawGantry(g);
    drawCables(g);
    drawHexRing(g);
    drawDetails(g);
  }

  function drawHeatSinks(g) {
    var sides = [-1, 1];
    for (var s = 0; s < 2; s++) {
      var dir = sides[s];
      var bx = CX + dir * H * 0.44;
      var by = CY - H * 0.02;
      var n = 13;
      for (var i = 0; i < n; i++) {
        var yy = by - H * 0.175 + i * H * 0.0235;
        var hw = H * 0.085 + i * H * 0.001;
        var hh = H * 0.0085;
        /* fin body */
        var lg = g.createLinearGradient(bx - hw, yy, bx + hw, yy + hh);
        lg.addColorStop(0, 'rgba(' + STEEL_DD + ',0.98)');
        lg.addColorStop(0.28, 'rgba(104,146,178,0.92)');
        lg.addColorStop(0.55, 'rgba(186,222,244,0.88)');
        lg.addColorStop(0.8, 'rgba(' + STEEL_D + ',0.95)');
        lg.addColorStop(1, 'rgba(10,24,36,0.98)');
        g.fillStyle = lg;
        g.beginPath();
        g.moveTo(bx - hw, yy);
        g.lineTo(bx + hw * 0.94, yy - hh * 0.4);
        g.lineTo(bx + hw, yy + hh);
        g.lineTo(bx - hw * 0.96, yy + hh * 1.5);
        g.closePath();
        g.fill();
        /* edge highlight */
        g.strokeStyle = 'rgba(' + CYAN + ',0.20)';
        g.lineWidth = Math.max(1, H * 0.0015);
        g.beginPath();
        g.moveTo(bx - hw, yy);
        g.lineTo(bx + hw * 0.94, yy - hh * 0.4);
        g.stroke();
      }
      /* spine */
      var sx = bx + dir * H * 0.10;
      var sg = g.createLinearGradient(sx - H * 0.012, 0, sx + H * 0.012, 0);
      sg.addColorStop(0, 'rgba(' + STEEL_DD + ',1)');
      sg.addColorStop(0.4, 'rgba(' + STEEL_HI + ',0.75)');
      sg.addColorStop(1, 'rgba(' + STEEL_DD + ',1)');
      g.fillStyle = sg;
      g.fillRect(sx - H * 0.012, by - H * 0.20, H * 0.024, H * 0.46);
      /* amber marker */
      g.fillStyle = 'rgba(' + AMBER + ',0.75)';
      g.fillRect(sx - H * 0.006, by - H * 0.06, H * 0.012, H * 0.018);
    }
  }

  function drawGears(g) {
    gear(g, W * 0.135, H * 0.845, H * 0.115, 16, 0.12, true);
    gear(g, W * 0.082, H * 0.780, H * 0.060, 12, 0.55, true);
    gear(g, W * 0.885, H * 0.815, H * 0.135, 18, -0.2, true);
    gear(g, W * 0.938, H * 0.735, H * 0.055, 10, 0.3, true);
  }

  function drawPylons(g) {
    /* four tapered beams tying the gantry to the chamber */
    var defs = [
      [-1, 0.30, 0.90],
      [1, 0.30, 0.90],
      [-1, 0.42, 0.98],
      [1, 0.42, 0.98]
    ];
    for (var i = 0; i < defs.length; i++) {
      var dir = defs[i][0];
      var y0 = CY + dir * H * 0.02;
      var x0 = CX + dir * CR * 0.9;
      var x1 = CX + dir * W * defs[i][1];
      var y1 = CY - H * 0.30;
      var lg = g.createLinearGradient(x0, y0, x1, y1);
      lg.addColorStop(0, 'rgba(' + STEEL_D + ',0.98)');
      lg.addColorStop(0.55, 'rgba(' + STEEL_M + ',0.80)');
      lg.addColorStop(1, 'rgba(14,32,46,0.98)');
      g.fillStyle = lg;
      g.beginPath();
      g.moveTo(x0, y0 - H * 0.035);
      g.lineTo(x1, y1 - H * 0.022);
      g.lineTo(x1, y1 + H * 0.022);
      g.lineTo(x0, y0 + H * 0.035);
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(' + STEEL_HI + ',0.34)';
      g.lineWidth = Math.max(1, H * 0.0022);
      g.beginPath();
      g.moveTo(x0, y0 + H * 0.035);
      g.lineTo(x1, y1 + H * 0.022);
      g.stroke();
    }
  }

  function drawGantry(g) {
    var R = CR * 2.30;
    /* thick segmented ring behind the core */
    for (var pass = 0; pass < 3; pass++) {
      var rr = R + (pass - 1) * CR * 0.16;
      var lw = pass === 1 ? CR * 0.20 : CR * 0.05;
      var col = pass === 1 ? 'rgba(58,92,118,0.98)'
        : (pass === 0 ? 'rgba(' + STEEL_M + ',0.95)' : 'rgba(24,48,66,0.98)');
      g.strokeStyle = col;
      g.lineWidth = lw;
      g.beginPath();
      g.arc(CX, CY, rr, 0, TAU);
      g.stroke();
    }
    /* segment plates */
    var n = 14;
    for (var i = 0; i < n; i++) {
      var a0 = i / n * TAU + 0.03;
      var a1 = (i + 1) / n * TAU - 0.03;
      g.strokeStyle = 'rgba(' + STEEL_HI + ',0.28)';
      g.lineWidth = Math.max(1, CR * 0.05);
      g.beginPath();
      g.arc(CX, CY, R + CR * 0.16, a0, a1);
      g.stroke();
      g.strokeStyle = 'rgba(10,24,36,0.85)';
      g.beginPath();
      g.arc(CX, CY, R - CR * 0.16, a0, a1);
      g.stroke();
      /* radial separators */
      var ax = CX + Math.cos(a0) * (R - CR * 0.18);
      var ay = CY + Math.sin(a0) * (R - CR * 0.18);
      var bx = CX + Math.cos(a0) * (R + CR * 0.18);
      var by = CY + Math.sin(a0) * (R + CR * 0.18);
      g.strokeStyle = 'rgba(14,30,44,0.9)';
      g.lineWidth = Math.max(1.5, CR * 0.05);
      g.beginPath();
      g.moveTo(ax, ay);
      g.lineTo(bx, by);
      g.stroke();
      /* bolts */
      g.fillStyle = 'rgba(' + STEEL_HI + ',0.55)';
      g.beginPath();
      g.arc(CX + Math.cos((a0 + a1) / 2) * R, CY + Math.sin((a0 + a1) / 2) * R,
        Math.max(1.2, CR * 0.028), 0, TAU);
      g.fill();
    }
    /* inner cyan light ring */
    g.strokeStyle = 'rgba(' + CYAN + ',0.35)';
    g.lineWidth = Math.max(1, CR * 0.035);
    g.beginPath();
    g.arc(CX, CY, R - CR * 0.26, 0, TAU);
    g.stroke();

    /* amber warning blocks on the gantry */
    for (var k = 0; k < 6; k++) {
      var aa = k / 6 * TAU + 0.4;
      var wx = CX + Math.cos(aa) * (R - CR * 0.05);
      var wy = CY + Math.sin(aa) * (R - CR * 0.05);
      g.save();
      g.translate(wx, wy);
      g.rotate(aa + Math.PI / 2);
      g.fillStyle = 'rgba(' + AMBER + ',0.80)';
      g.fillRect(-CR * 0.09, -CR * 0.022, CR * 0.18, CR * 0.044);
      g.fillStyle = 'rgba(20,36,50,0.9)';
      g.fillRect(-CR * 0.03, -CR * 0.022, CR * 0.06, CR * 0.044);
      g.restore();
    }
  }

  function drawCables(g) {
    /* thick conduits from the upper frame down to the gantry */
    var defs = [
      [0.240, -0.06, 0.30, 0.26],
      [0.300, -0.08, 0.36, 0.20],
      [0.660, -0.07, 0.60, 0.22],
      [0.715, -0.05, 0.66, 0.30]
    ];
    for (var i = 0; i < defs.length; i++) {
      var x0 = defs[i][0] * W, y0 = defs[i][1] * H;
      var x1 = defs[i][2] * W, y1 = defs[i][3] * H;
      var c1x = x0 + (x1 - x0) * 0.2, c1y = y0 + (y1 - y0) * 0.85;
      g.beginPath();
      g.moveTo(x0, y0);
      g.bezierCurveTo(c1x, c1y, x1 - W * 0.06, y1 - H * 0.10, x1, y1);
      g.strokeStyle = 'rgba(' + STEEL_DD + ',1)';
      g.lineWidth = W * 0.018;
      g.stroke();
      g.strokeStyle = 'rgba(' + STEEL_M + ',0.9)';
      g.lineWidth = W * 0.010;
      g.stroke();
      g.strokeStyle = 'rgba(' + STEEL_HI + ',0.45)';
      g.lineWidth = Math.max(1, W * 0.003);
      g.stroke();
      /* rib clamps */
      for (var k = 1; k <= 5; k++) {
        var tt = k / 6;
        var px = (1 - tt) * (1 - tt) * x0 + 2 * (1 - tt) * tt * c1x + tt * tt * x1;
        var py = (1 - tt) * (1 - tt) * y0 + 2 * (1 - tt) * tt * c1y + tt * tt * y1;
        g.fillStyle = 'rgba(16,34,48,0.95)';
        g.fillRect(px - W * 0.011, py - H * 0.006, W * 0.022, H * 0.012);
        g.fillStyle = 'rgba(' + STEEL_HI + ',0.35)';
        g.fillRect(px - W * 0.011, py - H * 0.006, W * 0.022, H * 0.003);
      }
    }
  }

  function drawHexRing(g) {
    /* ring of floating hex panels around the core */
    var n = 10;
    for (var i = 0; i < n; i++) {
      var a = i / n * TAU + 0.16;
      var rr = CR * 1.62;
      var hx = CX + Math.cos(a) * rr;
      var hy = CY + Math.sin(a) * rr * 0.62;
      var s = CR * (0.20 + 0.05 * Math.cos(a));
      g.save();
      g.translate(hx, hy);
      hexPath(g, 0, 0, s, Math.PI / 6);
      var lg = g.createLinearGradient(-s, -s, s, s);
      lg.addColorStop(0, 'rgba(' + STEEL_M + ',0.35)');
      lg.addColorStop(1, 'rgba(10,26,40,0.55)');
      g.fillStyle = lg;
      g.fill();
      g.strokeStyle = 'rgba(' + CYAN + ',' + (i % 3 === 0 ? 0.55 : 0.28) + ')';
      g.lineWidth = Math.max(1, CR * 0.018);
      g.stroke();
      g.restore();
    }
  }

  function drawDetails(g) {
    /* small panel clusters + rivets on the back wall */
    var i, j;
    for (i = 0; i < 4; i++) {
      var px = (i < 2 ? 0.055 + i * 0.085 : 0.79 + (i - 2) * 0.08) * W;
      var py = H * 0.18;
      g.fillStyle = 'rgba(22,48,68,0.9)';
      g.fillRect(px, py, W * 0.055, H * 0.10);
      g.strokeStyle = 'rgba(' + STEEL_HI + ',0.22)';
      g.lineWidth = 1;
      g.strokeRect(px, py, W * 0.055, H * 0.10);
      for (j = 0; j < 6; j++) {
        g.fillStyle = 'rgba(' + CYAN + ',' + (0.20 + (j % 2) * 0.18) + ')';
        g.fillRect(px + W * 0.008, py + H * 0.012 + j * H * 0.013, W * 0.035, H * 0.004);
      }
    }
    /* red-free amber strip near the floor */
    g.fillStyle = 'rgba(' + AMBER + ',0.5)';
    g.fillRect(W * 0.045, FLOOR + H * 0.02, W * 0.07, H * 0.008);
    g.fillRect(W * 0.885, FLOOR + H * 0.02, W * 0.07, H * 0.008);
  }

  /* ------------------------------------------------------------------ *
   *  foreground machinery
   * ------------------------------------------------------------------ */

  function renderFront() {
    frontC = makeCanvas(W * dpr, H * dpr);
    var g = frontC.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    /* bottom platform edge */
    var ly0 = H * 0.905;
    var lg = g.createLinearGradient(0, ly0, 0, H);
    lg.addColorStop(0, 'rgba(46,90,120,1)');
    lg.addColorStop(0.45, 'rgba(30,66,92,1)');
    lg.addColorStop(1, 'rgba(16,40,58,1)');
    g.fillStyle = lg;
    g.beginPath();
    g.moveTo(0, ly0);
    g.lineTo(W, ly0 - H * 0.05);
    g.lineTo(W, H);
    g.lineTo(0, H);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(' + STEEL_HI + ',0.42)';
    g.lineWidth = Math.max(1.5, H * 0.0035);
    g.beginPath();
    g.moveTo(0, ly0);
    g.lineTo(W, ly0 - H * 0.05);
    g.stroke();
    /* rivets on the platform edge */
    for (var i = 0; i < 18; i++) {
      var x = i / 17 * W;
      var y = ly0 - (x / W) * H * 0.05 + H * 0.018;
      g.fillStyle = 'rgba(10,24,36,0.9)';
      g.beginPath();
      g.arc(x, y, Math.max(1.5, H * 0.006), 0, TAU);
      g.fill();
      g.fillStyle = 'rgba(' + STEEL_HI + ',0.35)';
      g.beginPath();
      g.arc(x - H * 0.002, y - H * 0.002, Math.max(1, H * 0.003), 0, TAU);
      g.fill();
    }

    /* side ducts */
    drawDuct(g, W * 0.035, H * 0.30, H * 0.52, -1);
    drawDuct(g, W * 0.965, H * 0.30, H * 0.52, 1);

    /* warm service lights along the platform edge */
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (var k = 0; k < 7; k++) {
      var lx = (0.12 + k * 0.125) * W;
      var lyy = ly0 - (lx / W) * H * 0.05 + H * 0.03;
      var rg = g.createRadialGradient(lx, lyy, 0, lx, lyy, H * 0.05);
      rg.addColorStop(0, 'rgba(' + AMBER + ',0.55)');
      rg.addColorStop(1, 'rgba(' + AMBER + ',0)');
      g.fillStyle = rg;
      g.fillRect(lx - H * 0.05, lyy - H * 0.05, H * 0.10, H * 0.10);
    }
    g.restore();

    /* corner braces */
    drawBrace(g, 0, 0, W * 0.14, H * 0.12, 1);
    drawBrace(g, W, 0, -W * 0.14, H * 0.12, -1);
  }

  function drawDuct(g, x, y, len, dir) {
    var w = W * 0.026;
    var lg = g.createLinearGradient(x - w, 0, x + w, 0);
    lg.addColorStop(0, 'rgba(12,28,42,0.98)');
    lg.addColorStop(0.35, 'rgba(' + STEEL_M + ',0.70)');
    lg.addColorStop(0.55, 'rgba(' + STEEL_HI + ',0.55)');
    lg.addColorStop(1, 'rgba(10,24,36,0.98)');
    g.fillStyle = lg;
    g.fillRect(x - w, y, w * 2, len);
    for (var i = 0; i < 9; i++) {
      var yy = y + i * len / 9;
      g.fillStyle = 'rgba(8,20,32,0.85)';
      g.fillRect(x - w, yy, w * 2, H * 0.006);
      g.fillStyle = 'rgba(' + STEEL_HI + ',0.22)';
      g.fillRect(x - w, yy + H * 0.006, w * 2, H * 0.002);
    }
    g.strokeStyle = 'rgba(' + CYAN + ',0.22)';
    g.lineWidth = Math.max(1, W * 0.0018);
    g.beginPath();
    g.moveTo(x + w * dir * 0.55, y);
    g.lineTo(x + w * dir * 0.55, y + len);
    g.stroke();
  }

  function drawBrace(g, x0, y0, dx, dy, dir) {
    g.fillStyle = 'rgba(12,30,44,0.98)';
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x0 + dx, y0);
    g.lineTo(x0, y0 + dy);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(' + STEEL_HI + ',0.35)';
    g.lineWidth = Math.max(1.5, H * 0.003);
    g.beginPath();
    g.moveTo(x0 + dx, y0);
    g.lineTo(x0, y0 + dy);
    g.stroke();
  }

  /* ------------------------------------------------------------------ *
   *  core sphere
   * ------------------------------------------------------------------ */

  function renderCore() {
    var s = CR * 2.7;
    coreSize = s;
    var px = Math.max(96, Math.round(s * dpr));
    coreC = makeCanvas(px, px);
    var g = coreC.getContext('2d');
    var k = px / s;
    g.setTransform(k, 0, 0, k, 0, 0);
    var cx = s / 2, cy = s / 2;
    var r = CR;

    /* outer bloom baked into the sprite */
    radial(g, cx, cy, r * 1.30, '120,225,250', 0.55);
    radial(g, cx, cy, r * 1.12, '190,245,255', 0.45);

    /* sphere body */
    var sg = g.createRadialGradient(cx - r * 0.18, cy - r * 0.20, r * 0.05, cx, cy, r);
    sg.addColorStop(0, 'rgba(255,255,255,1)');
    sg.addColorStop(0.26, 'rgba(216,250,255,1)');
    sg.addColorStop(0.55, 'rgba(150,232,252,1)');
    sg.addColorStop(0.78, 'rgba(96,208,240,1)');
    sg.addColorStop(0.93, 'rgba(58,158,198,1)');
    sg.addColorStop(1, 'rgba(40,120,158,1)');
    g.fillStyle = sg;
    g.beginPath();
    g.arc(cx, cy, r, 0, TAU);
    g.fill();

    /* hex energy cells on the surface */
    g.save();
    g.beginPath();
    g.arc(cx, cy, r * 0.995, 0, TAU);
    g.clip();
    var hr = r * 0.155;
    var dx = hr * 1.5, dyy = hr * Math.sqrt(3);
    for (var row = -7; row <= 7; row++) {
      for (var col = -7; col <= 7; col++) {
        var hx = cx + col * dx;
        var hy = cy + row * dyy + (col % 2 ? dyy / 2 : 0);
        var d = Math.sqrt((hx - cx) * (hx - cx) + (hy - cy) * (hy - cy)) / r;
        if (d > 1.02) { continue; }
        hexPath(g, hx, hy, hr * 0.94, Math.PI / 6);
        g.strokeStyle = 'rgba(20,86,122,' + (0.40 + 0.35 * d) + ')';
        g.lineWidth = Math.max(1, r * 0.012);
        g.stroke();
        if (d < 0.45) {
          g.fillStyle = 'rgba(255,255,255,' + (0.30 * (1 - d / 0.45)) + ')';
          g.fill();
        }
      }
    }
    /* curvature shading */
    var cg = g.createRadialGradient(cx - r * 0.2, cy - r * 0.22, r * 0.1, cx, cy, r * 1.02);
    cg.addColorStop(0, 'rgba(255,255,255,0)');
    cg.addColorStop(0.62, 'rgba(30,110,150,0)');
    cg.addColorStop(1, 'rgba(12,60,96,0.55)');
    g.fillStyle = cg;
    g.fillRect(cx - r, cy - r, r * 2, r * 2);
    g.restore();

    /* plasma arcs */
    g.save();
    g.beginPath();
    g.arc(cx, cy, r * 0.995, 0, TAU);
    g.clip();
    g.strokeStyle = 'rgba(255,255,255,0.55)';
    for (var i = 0; i < 3; i++) {
      var rr = r * (0.30 + i * 0.19);
      g.lineWidth = Math.max(1, r * (0.02 - i * 0.004));
      g.beginPath();
      g.arc(cx, cy, rr, -0.4 + i, 1.9 + i);
      g.stroke();
    }
    g.restore();

    /* hot rim */
    g.strokeStyle = 'rgba(236,254,255,0.85)';
    g.lineWidth = Math.max(1.4, r * 0.016);
    g.beginPath();
    g.arc(cx, cy, r * 0.985, 0, TAU);
    g.stroke();

    /* specular */
    g.fillStyle = 'rgba(255,255,255,0.90)';
    g.beginPath();
    g.ellipse(cx - r * 0.36, cy - r * 0.40, r * 0.14, r * 0.09, -0.6, 0, TAU);
    g.fill();
  }

  /* ------------------------------------------------------------------ *
   *  ring sprites
   * ------------------------------------------------------------------ */

  function renderRings() {
    rings.length = 0;
    addRing(1.36, 0.42, -0.10, 7.0, 16, 'heavy', 1);
    addRing(1.75, 0.80, -0.30, -5.0, 24, 'thin', 2);
    addRing(2.10, 0.34, 0.12, 3.5, 40, 'dash', 3);
  }

  function addRing(rf, squash, tilt, speed, segs, kind, layer) {
    var R = CR * rf;
    var pad = 1.14;
    var size = R * 2 * pad;
    var px = Math.max(128, Math.round(size * dpr));
    var c = makeCanvas(px, px);
    var g = c.getContext('2d');
    var k = px / size;
    g.setTransform(k, 0, 0, k, 0, 0);
    var cx = size / 2, cy = size / 2;

    if (kind === 'heavy') {
      /* armored ring: thick band with plates */
      var i;
      g.strokeStyle = 'rgba(16,38,54,0.98)';
      g.lineWidth = R * 0.16;
      g.beginPath();
      g.arc(cx, cy, R, 0, TAU);
      g.stroke();
      g.strokeStyle = 'rgba(' + STEEL_M + ',0.95)';
      g.lineWidth = R * 0.10;
      g.beginPath();
      g.arc(cx, cy, R + R * 0.01, 0, TAU);
      g.stroke();
      g.strokeStyle = 'rgba(' + STEEL_HI + ',0.55)';
      g.lineWidth = R * 0.022;
      g.beginPath();
      g.arc(cx, cy, R + R * 0.075, 0, TAU);
      g.stroke();
      g.strokeStyle = 'rgba(' + CYAN + ',0.60)';
      g.lineWidth = R * 0.020;
      g.beginPath();
      g.arc(cx, cy, R - R * 0.075, 0, TAU);
      g.stroke();
      /* plates */
      for (i = 0; i < segs; i++) {
        var a0 = i / segs * TAU + 0.04;
        var a1 = (i + 1) / segs * TAU - 0.04;
        g.strokeStyle = 'rgba(' + STEEL_HI + ',0.45)';
        g.lineWidth = R * 0.085;
        g.beginPath();
        g.arc(cx, cy, R, a0, a1);
        g.stroke();
        g.strokeStyle = 'rgba(10,26,38,0.85)';
        g.lineWidth = Math.max(1.5, R * 0.012);
        g.beginPath();
        g.moveTo(cx + Math.cos(a0) * R * 0.92, cy + Math.sin(a0) * R * 0.92);
        g.lineTo(cx + Math.cos(a0) * R * 1.08, cy + Math.sin(a0) * R * 1.08);
        g.stroke();
        if (i % 4 === 0) {
          var ax = cx + Math.cos((a0 + a1) / 2) * R;
          var ay = cy + Math.sin((a0 + a1) / 2) * R;
          g.fillStyle = 'rgba(' + AMBER + ',0.9)';
          g.beginPath();
          g.arc(ax, ay, Math.max(1.4, R * 0.025), 0, TAU);
          g.fill();
        }
      }
    } else if (kind === 'thin') {
      g.strokeStyle = 'rgba(' + STEEL_D + ',0.95)';
      g.lineWidth = R * 0.055;
      g.beginPath();
      g.arc(cx, cy, R, 0, TAU);
      g.stroke();
      g.strokeStyle = 'rgba(' + STEEL_HI + ',0.65)';
      g.lineWidth = R * 0.014;
      g.beginPath();
      g.arc(cx, cy, R + R * 0.028, 0, TAU);
      g.stroke();
      for (var j = 0; j < segs; j++) {
        var b0 = j / segs * TAU + 0.02;
        var b1 = (j + 1) / segs * TAU - 0.02;
        g.strokeStyle = 'rgba(' + CYAN + ',' + (j % 3 === 0 ? 0.55 : 0.24) + ')';
        g.lineWidth = R * (j % 3 === 0 ? 0.030 : 0.016);
        g.beginPath();
        g.arc(cx, cy, R - R * 0.03, b0, b1);
        g.stroke();
      }
    } else {
      /* dashed outer ring with tick marks */
      var m;
      g.strokeStyle = 'rgba(' + STEEL_M + ',0.85)';
      g.lineWidth = R * 0.022;
      g.beginPath();
      g.arc(cx, cy, R, 0, TAU);
      g.stroke();
      for (m = 0; m < segs; m++) {
        var c0 = m / segs * TAU;
        var long = m % 5 === 0;
        g.strokeStyle = long ? 'rgba(' + CYAN + ',0.55)' : 'rgba(' + STEEL_HI + ',0.40)';
        g.lineWidth = Math.max(1.2, R * (long ? 0.020 : 0.010));
        g.beginPath();
        g.moveTo(cx + Math.cos(c0) * R * (long ? 0.90 : 0.955), cy + Math.sin(c0) * R * (long ? 0.90 : 0.955));
        g.lineTo(cx + Math.cos(c0) * R * 1.06, cy + Math.sin(c0) * R * 1.06);
        g.stroke();
      }
      g.strokeStyle = 'rgba(' + STEEL_D + ',0.9)';
      g.lineWidth = R * 0.05;
      g.beginPath();
      g.arc(cx, cy, R * 0.955, 0, TAU);
      g.stroke();
    }

    rings.push({ img: c, size: size, half: size / 2, squash: squash, tilt: tilt, speed: speed, layer: layer });
  }

  /* ------------------------------------------------------------------ *
   *  scan band + corner shade
   * ------------------------------------------------------------------ */

  function renderScan() {
    bandH = Math.max(40, H * 0.16);
    bandC = makeCanvas(W * dpr, bandH * dpr);
    var g = bandC.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    var lg = g.createLinearGradient(0, 0, 0, bandH);
    lg.addColorStop(0, 'rgba(120,220,250,0)');
    lg.addColorStop(0.42, 'rgba(150,235,255,0.05)');
    lg.addColorStop(0.5, 'rgba(210,250,255,0.13)');
    lg.addColorStop(0.58, 'rgba(150,235,255,0.05)');
    lg.addColorStop(1, 'rgba(120,220,250,0)');
    g.fillStyle = lg;
    g.fillRect(0, 0, W, bandH);
    g.fillStyle = 'rgba(210,250,255,0.12)';
    g.fillRect(0, bandH * 0.5 - 1, W, 2);
  }

  function renderShade() {
    shadeW = Math.max(320, W * 0.33);
    shadeH = Math.max(130, H * 0.24);
    shadeC = makeCanvas(shadeW * dpr, shadeH * dpr);
    var g = shadeC.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    var vg = g.createLinearGradient(0, 0, 0, shadeH);
    vg.addColorStop(0, 'rgba(5,14,22,0.94)');
    vg.addColorStop(0.55, 'rgba(5,14,22,0.84)');
    vg.addColorStop(1, 'rgba(5,14,22,0)');
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

  /* ------------------------------------------------------------------ *
   *  animated bits
   * ------------------------------------------------------------------ */

  function buildMotes() {
    motes.length = 0;
    var n = 78;
    for (var i = 0; i < n; i++) {
      var li = i % 3;
      motes.push({
        ring: li,
        a: rand(0, TAU),
        sp: rand(0.10, 0.28) * (i % 2 ? 1 : -1),
        r: rand(0.004, 0.011),
        ph: rand(0, TAU),
        tw: rand(1.2, 2.8)
      });
    }
    embers.length = 0;
    for (var j = 0; j < 26; j++) {
      embers.push({
        x: rand(0.05, 0.95),
        y: rand(0.20, 0.95),
        r: rand(0.0016, 0.0042),
        vy: rand(0.006, 0.020),
        ph: rand(0, TAU),
        sp: rand(0.2, 0.7)
      });
    }
    beacons.length = 0;
    var bp = [
      [0.115, 0.300], [0.885, 0.300], [0.075, 0.640], [0.925, 0.640],
      [0.300, 0.905], [0.700, 0.905]
    ];
    for (var k = 0; k < bp.length; k++) {
      beacons.push({ x: bp[k][0], y: bp[k][1], ph: k * 1.3 });
    }
    rams.length = 0;
    rams.push({ x0: 0.085, y0: 0.985, x1: 0.325, y1: 0.660, ph: 0.0, len: 0.17 });
    rams.push({ x0: 0.915, y0: 0.985, x1: 0.675, y1: 0.660, ph: 2.1, len: 0.17 });
  }

  function ringPoint(r, ang) {
    var rx = CR * r;
    var ry = rx * r.squash;
    return {
      x: CX + Math.cos(ang) * rx,
      y: CY + Math.sin(ang) * ry
    };
  }

  function drawRings(half) {
    var order = half === 0 ? [2, 1, 0] : [0, 1, 2];
    for (var i = 0; i < order.length; i++) {
      var r = rings[order[i]];
      var spin = t * r.speed * DEG;
      ctx.save();
      ctx.translate(CX, CY);
      ctx.rotate(r.tilt);
      ctx.scale(1, r.squash);
      ctx.beginPath();
      ctx.rect(-r.half * 1.3, half === 0 ? -r.half * 1.3 : 0, r.half * 2.6, r.half * 1.3);
      ctx.clip();
      ctx.rotate(spin);
      ctx.globalAlpha = 0.96;
      ctx.drawImage(r.img, -r.half, -r.half, r.size, r.size);
      ctx.restore();
    }
  }

  function drawCore() {
    var pulse = 0.5 + 0.5 * Math.sin(t * 0.95);
    var sc = 1 + 0.022 * pulse;
    var sz = coreSize * sc;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.55 + 0.30 * pulse;
    var gs = coreSize * (1.55 + 0.10 * pulse);
    ctx.drawImage(glow.cyan, CX - gs / 2, CY - gs / 2, gs, gs);
    ctx.restore();

    ctx.drawImage(coreC, CX - sz / 2, CY - sz / 2, sz, sz);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.20 + 0.22 * pulse;
    var hs = coreSize * 0.72;
    ctx.drawImage(glow.white, CX - hs / 2, CY - hs / 2, hs, hs);
    ctx.restore();
  }

  function drawMotes(dt) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < motes.length; i++) {
      var m = motes[i];
      var r = rings[m.ring];
      var ang = m.a + t * m.sp;
      var p = ringPoint({ squash: r.squash }, ang);
      var tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * m.tw + m.ph));
      var d = m.r * H * 7 * (0.7 + 0.6 * tw);
      ctx.globalAlpha = 0.35 + 0.55 * tw;
      ctx.drawImage(glow.cyan, p.x - d, p.y - d, d * 2, d * 2);
    }
    for (var j = 0; j < embers.length; j++) {
      var e = embers[j];
      e.y -= e.vy * dt * 8;
      if (e.y < 0.05) { e.y = 0.98; e.x = rand(0.05, 0.95); }
      var ex = (e.x + Math.sin(t * e.sp + e.ph) * 0.006) * W;
      var ey = e.y * H;
      var dd = e.r * H * 6;
      ctx.globalAlpha = 0.5;
      ctx.drawImage(glow.ice, ex - dd, ey - dd, dd * 2, dd * 2);
    }
    ctx.restore();
  }

  function drawRams() {
    for (var i = 0; i < rams.length; i++) {
      var r = rams[i];
      var x0 = r.x0 * W, y0 = r.y0 * H;
      var x1 = r.x1 * W, y1 = r.y1 * H;
      var ang = Math.atan2(y1 - y0, x1 - x0);
      var push = Math.sin(t * 0.55 + r.ph) * 0.006 * W;
      var len = Math.hypot(x1 - x0, y1 - y0) * 0.55;

      ctx.save();
      ctx.translate(x0, y0);
      ctx.rotate(ang);
      var h = H * 0.042;
      /* mount pad */
      ctx.fillStyle = 'rgba(22,46,64,1)';
      ctx.fillRect(-h * 1.2, -h * 2.4, h * 2.4, h * 4.8);
      ctx.strokeStyle = 'rgba(' + CYAN + ',0.30)';
      ctx.lineWidth = Math.max(1, H * 0.0022);
      ctx.strokeRect(-h * 1.2, -h * 2.4, h * 2.4, h * 4.8);
      /* cylinder */
      var lg = ctx.createLinearGradient(0, -h, 0, h);
      lg.addColorStop(0, 'rgba(178,210,232,0.98)');
      lg.addColorStop(0.28, 'rgba(104,144,174,0.98)');
      lg.addColorStop(0.62, 'rgba(54,88,116,0.98)');
      lg.addColorStop(1, 'rgba(18,40,56,1)');
      ctx.fillStyle = lg;
      ctx.fillRect(0, -h, len, h * 2);
      ctx.strokeStyle = 'rgba(' + STEEL_HI + ',0.45)';
      ctx.lineWidth = Math.max(1, H * 0.0024);
      ctx.strokeRect(0, -h, len, h * 2);
      /* barrel bands */
      for (var bnd = 1; bnd <= 3; bnd++) {
        ctx.fillStyle = 'rgba(14,34,50,0.85)';
        ctx.fillRect(len * bnd / 4, -h, H * 0.012, h * 2);
        ctx.fillStyle = 'rgba(' + STEEL_HI + ',0.25)';
        ctx.fillRect(len * bnd / 4, -h, H * 0.012, h * 0.3);
      }
      /* collar */
      ctx.fillStyle = 'rgba(22,46,64,1)';
      ctx.fillRect(len - H * 0.02, -h * 1.22, H * 0.036, h * 2.44);
      ctx.fillStyle = 'rgba(' + STEEL_HI + ',0.30)';
      ctx.fillRect(len - H * 0.02, -h * 1.22, H * 0.036, h * 0.30);
      /* piston rod */
      var rodLen = len * 0.42 + push;
      ctx.fillStyle = 'rgba(150,188,214,0.98)';
      ctx.fillRect(len + H * 0.016, -h * 0.34, rodLen, h * 0.68);
      ctx.fillStyle = 'rgba(240,252,255,0.85)';
      ctx.fillRect(len + H * 0.016, -h * 0.34, rodLen, h * 0.16);
      /* end joint: bright clevis, not a black ball */
      var jx = len + H * 0.016 + rodLen;
      ctx.beginPath();
      ctx.arc(jx, 0, h * 0.85, 0, TAU);
      ctx.fillStyle = 'rgba(82,124,156,1)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(jx - h * 0.22, -h * 0.22, h * 0.46, 0, TAU);
      ctx.fillStyle = 'rgba(186,220,242,0.95)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(' + CYAN + ',0.55)';
      ctx.lineWidth = Math.max(1, H * 0.0028);
      ctx.beginPath();
      ctx.arc(jx, 0, h * 0.85, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(jx, 0, h * 0.30, 0, TAU);
      ctx.fillStyle = 'rgba(' + CYAN + ',0.55)';
      ctx.fill();
      ctx.restore();
    }
  }

  function drawBeacons() {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < beacons.length; i++) {
      var b = beacons[i];
      var on = 0.30 + 0.70 * (0.5 + 0.5 * Math.sin(t * 0.9 + b.ph));
      var d = H * 0.020 * (0.8 + 0.4 * on);
      ctx.globalAlpha = 0.55 * on;
      ctx.drawImage(glow.amber, b.x * W - d, b.y * H - d, d * 2, d * 2);
    }
    ctx.restore();
  }

  function drawScan() {
    var period = 11;
    var ph = (t % period) / period;
    var y = H * 1.02 - ph * (H * 1.15);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.85;
    ctx.drawImage(bandC, 0, y, W, bandH);
    ctx.restore();
  }

  function drawFrame(dt) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    ctx.drawImage(bgC, 0, 0, W, H);
    ctx.drawImage(backC, 0, 0, W, H);

    drawRings(0);
    drawCore();
    drawRings(1);

    ctx.drawImage(frontC, 0, 0, W, H);
    drawRams();
    drawMotes(dt);
    drawBeacons();
    drawScan();

    ctx.drawImage(shadeC, W - shadeW, 0, shadeW, shadeH);
  }

  /* ------------------------------------------------------------------ *
   *  lifecycle
   * ------------------------------------------------------------------ */

  function buildScene() {
    CX = W * CORE_NX;
    CY = H * CORE_NY;
    CR = H * CORE_RF;
    FLOOR = H * FLOOR_NY;

    glow.cyan = makeGlow(CYAN, 0.95);
    glow.white = makeGlow('235,252,255', 0.95);
    glow.ice = makeGlow(ICEC, 0.85);
    glow.amber = makeGlow(AMBER, 0.90);

    renderBg();
    renderBack();
    renderFront();
    renderCore();
    renderRings();
    renderScan();
    renderShade();
    buildMotes();
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
