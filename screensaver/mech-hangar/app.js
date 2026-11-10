/* Dawn Hangar - a mech waiting in morning light, drawn with canvas 2D only.
   No external asset, no network, no storage, and no human figure anywhere:
   only a hangar, a machine on its stand, and dawn light.

   Static layers (sky, hangar, trusses, floor, mech, foreground) are rendered
   once per resize; the per-frame loop only blits them and moves the dust,
   the maintenance arms, the beacons, the seam pulse and the floor reflection. */
(function () {
  'use strict';

  var canvas = document.getElementById('scene');
  var ctx = canvas && canvas.getContext('2d');
  if (!ctx) { return; }

  var MAX_DPR = 1.5;
  var TAU = Math.PI * 2;
  var DEG = Math.PI / 180;

  /* hangar layout (screen fractions) */
  var DOOR_X0 = 0.585, DOOR_X1 = 0.965;
  var DOOR_Y0 = 0.070, DOOR_Y1 = 0.700;
  var SHUTTER_Y = 0.335;
  var FLOOR_Y = 0.700;
  var MECH_X = 0.335, MECH_Y = 0.805;

  var WARM = '255,180,94';
  var WARM_D = '255,138,61';
  var COOL = '79,168,216';
  var STEEL_L = '159,180,200';
  var STEEL_M = '95,118,136';
  var STEEL_D = '44,62,76';
  var STEEL_DD = '22,34,44';

  var W = 1, H = 1, dpr = 1;
  var rafId = 0, last = 0, t = 0, resizeTimer = 0;

  var bgC = null, mechC = null, seamC = null, frontC = null;
  var shadeC = null, shadeW = 0, shadeH = 0;
  var glow = {};
  var dust = [];
  var beacons = [];
  var arms = [];
  var reflC = null;

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
    rg.addColorStop(0.20, 'rgba(' + rgb + ',' + (core * 0.62) + ')');
    rg.addColorStop(0.52, 'rgba(' + rgb + ',' + (core * 0.20) + ')');
    rg.addColorStop(1, 'rgba(' + rgb + ',0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, s, s);
    return c;
  }

  function radial(g, cx, cy, r, rgb, a, mid) {
    var rg = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(1, r));
    rg.addColorStop(0, 'rgba(' + rgb + ',' + a + ')');
    rg.addColorStop(mid || 0.5, 'rgba(' + rgb + ',' + (a * 0.44) + ')');
    rg.addColorStop(0.82, 'rgba(' + rgb + ',' + (a * 0.11) + ')');
    rg.addColorStop(1, 'rgba(' + rgb + ',0)');
    g.fillStyle = rg;
    g.fillRect(cx - r, cy - r, r * 2, r * 2);
  }

  /* ------------------------------------------------------------------ *
   *  background: sky, hangar shell, trusses, floor, light shafts
   * ------------------------------------------------------------------ */

  function renderBg() {
    bgC = makeCanvas(W * dpr, H * dpr);
    var g = bgC.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    /* interior base */
    var bg0 = g.createLinearGradient(0, 0, W * 0.6, H);
    bg0.addColorStop(0, '#0d1a24');
    bg0.addColorStop(0.45, '#16293a');
    bg0.addColorStop(0.78, '#1d3648');
    bg0.addColorStop(1, '#223d50');
    g.fillStyle = bg0;
    g.fillRect(0, 0, W, H);

    drawSky(g);
    drawHangarShell(g);
    drawTrusses(g);
    drawFloor(g);
    drawShafts(g);
    drawHaze(g);
    drawForegroundWall(g);
  }

  function drawSky(g) {
    var x0 = DOOR_X0 * W, x1 = DOOR_X1 * W;
    var y0 = DOOR_Y0 * H, y1 = DOOR_Y1 * H;

    g.save();
    g.beginPath();
    g.rect(x0, y0, x1 - x0, y1 - y0);
    g.clip();

    var sg = g.createLinearGradient(0, y0, 0, y1);
    sg.addColorStop(0, '#b9d9ee');
    sg.addColorStop(0.30, '#f2dcc0');
    sg.addColorStop(0.58, '#ffc286');
    sg.addColorStop(0.80, '#ffa560');
    sg.addColorStop(1, '#ff8f4c');
    g.fillStyle = sg;
    g.fillRect(x0, y0, x1 - x0, y1 - y0);

    /* low sun glow near the horizon */
    radial(g, x1 - (x1 - x0) * 0.32, y1 - H * 0.10, H * 0.34, '255,236,190', 0.95, 0.3);
    radial(g, x1 - (x1 - x0) * 0.32, y1 - H * 0.10, H * 0.16, '255,250,230', 0.95, 0.35);

    /* distant apron + hangars outside */
    g.fillStyle = 'rgba(96,66,58,0.85)';
    var baseY = y1 - H * 0.075;
    g.fillRect(x0, baseY, x1 - x0, y1 - baseY);
    g.fillStyle = 'rgba(74,52,48,0.95)';
    var sil = [
      [0.02, 0.10, 0.045], [0.16, 0.07, 0.030], [0.27, 0.14, 0.060],
      [0.46, 0.06, 0.022], [0.55, 0.10, 0.040], [0.70, 0.08, 0.026]
    ];
    for (var i = 0; i < sil.length; i++) {
      var bx = x0 + sil[i][0] * (x1 - x0);
      var bw = sil[i][1] * (x1 - x0);
      var bh = sil[i][2] * (x1 - x0);
      g.fillRect(bx, baseY - bh, bw, bh);
    }
    /* a crane silhouette outside */
    g.strokeStyle = 'rgba(74,52,48,0.95)';
    g.lineWidth = Math.max(2, W * 0.004);
    g.beginPath();
    g.moveTo(x0 + (x1 - x0) * 0.36, baseY);
    g.lineTo(x0 + (x1 - x0) * 0.36, baseY - H * 0.16);
    g.lineTo(x0 + (x1 - x0) * 0.62, baseY - H * 0.16);
    g.stroke();

    /* warm ground glow */
    g.globalCompositeOperation = 'lighter';
    radial(g, x1 - (x1 - x0) * 0.30, y1 - H * 0.13, H * 0.30, '255,190,120', 0.55);
    g.globalCompositeOperation = 'source-over';
    g.restore();
  }

  function drawHangarShell(g) {
    var dx0 = DOOR_X0 * W, dx1 = DOOR_X1 * W;
    var dy0 = DOOR_Y0 * H, dy1 = DOOR_Y1 * H;

    /* left wall panels */
    var i;
    for (i = 0; i < 7; i++) {
      var x = i * 0.085 * W;
      var w = 0.085 * W;
      var lg = g.createLinearGradient(x, 0, x + w, 0);
      lg.addColorStop(0, 'rgba(30,50,66,1)');
      lg.addColorStop(0.5, 'rgba(46,72,92,1)');
      lg.addColorStop(1, 'rgba(24,42,56,1)');
      g.fillStyle = lg;
      g.fillRect(x, H * 0.16, w, FLOOR_Y * H - H * 0.16);
      g.strokeStyle = 'rgba(' + STEEL_M + ',0.30)';
      g.lineWidth = Math.max(1, W * 0.0016);
      g.strokeRect(x + 1, H * 0.16, w - 2, FLOOR_Y * H - H * 0.16);
    }
    /* wall pipes */
    var pipes = [0.045, 0.145, 0.255, 0.345, 0.455];
    for (i = 0; i < pipes.length; i++) {
      var px = pipes[i] * W;
      var pw = W * (i % 2 === 0 ? 0.012 : 0.007);
      var pg = g.createLinearGradient(px - pw, 0, px + pw, 0);
      pg.addColorStop(0, 'rgba(28,46,60,1)');
      pg.addColorStop(0.35, 'rgba(' + STEEL_M + ',0.95)');
      pg.addColorStop(0.55, 'rgba(' + STEEL_L + ',0.75)');
      pg.addColorStop(1, 'rgba(20,36,48,1)');
      g.fillStyle = pg;
      g.fillRect(px - pw, H * 0.14, pw * 2, FLOOR_Y * H - H * 0.14);
      for (var k = 0; k < 5; k++) {
        g.fillStyle = 'rgba(20,36,48,0.85)';
        g.fillRect(px - pw * 1.3, H * (0.20 + k * 0.10), pw * 2.6, H * 0.012);
      }
    }

    /* stacked crates against the left wall */
    for (var ci = 0; ci < 3; ci++) {
      var cxx = W * (0.115 + ci * 0.022);
      var cyy = H * (0.640 - ci * 0.052);
      var cww = W * 0.085;
      var chh = H * 0.048;
      var cg3 = g.createLinearGradient(cxx, cyy, cxx, cyy + chh);
      cg3.addColorStop(0, 'rgba(78,102,122,1)');
      cg3.addColorStop(1, 'rgba(40,58,74,1)');
      g.fillStyle = cg3;
      g.fillRect(cxx, cyy, cww, chh);
      g.strokeStyle = 'rgba(' + WARM + ',0.30)';
      g.lineWidth = Math.max(1, H * 0.002);
      g.strokeRect(cxx, cyy, cww, chh);
    }

    /* door frame */
    var fw = W * 0.020;
    var fg = g.createLinearGradient(dx0 - fw * 2, 0, dx0 + fw, 0);
    fg.addColorStop(0, 'rgba(20,34,46,1)');
    fg.addColorStop(0.6, 'rgba(' + STEEL_M + ',1)');
    fg.addColorStop(1, 'rgba(' + STEEL_L + ',0.9)');
    g.fillStyle = fg;
    g.fillRect(dx0 - fw * 2, dy0 - H * 0.02, fw * 3, dy1 - dy0 + H * 0.02);
    g.fillStyle = fg;
    g.fillRect(dx1 - fw, dy0 - H * 0.02, fw * 3, dy1 - dy0 + H * 0.02);
    /* lintel */
    g.fillStyle = 'rgba(38,58,74,1)';
    g.fillRect(dx0 - fw * 2, dy0 - H * 0.035, dx1 - dx0 + fw * 5, H * 0.035);
    g.strokeStyle = 'rgba(' + STEEL_L + ',0.55)';
    g.lineWidth = Math.max(1, H * 0.0025);
    g.beginPath();
    g.moveTo(dx0 - fw * 2, dy0 - H * 0.001);
    g.lineTo(dx1 + fw, dy0 - H * 0.001);
    g.stroke();

    /* roller shutter, half down */
    var shY = SHUTTER_Y * H;
    g.fillStyle = 'rgba(28,44,58,1)';
    g.fillRect(dx0, dy0, dx1 - dx0, shY - dy0);
    var slat = H * 0.020;
    for (var s = 0; s < Math.ceil((shY - dy0) / slat); s++) {
      var yy = dy0 + s * slat;
      var sg2 = g.createLinearGradient(0, yy, 0, yy + slat);
      sg2.addColorStop(0, 'rgba(44,64,82,1)');
      sg2.addColorStop(0.72, 'rgba(58,80,98,1)');
      sg2.addColorStop(0.90, 'rgba(122,128,124,1)');
      sg2.addColorStop(1, 'rgba(36,52,66,1)');
      g.fillStyle = sg2;
      g.fillRect(dx0, yy, dx1 - dx0, slat * 0.96);
    }
    /* shutter bottom rail */
    g.fillStyle = 'rgba(' + STEEL_M + ',0.95)';
    g.fillRect(dx0, shY - H * 0.008, dx1 - dx0, H * 0.012);
    g.strokeStyle = 'rgba(' + WARM + ',0.55)';
    g.lineWidth = Math.max(1, H * 0.0022);
    g.beginPath();
    g.moveTo(dx0, shY + H * 0.004);
    g.lineTo(dx1, shY + H * 0.004);
    g.stroke();
    /* guides */
    g.fillStyle = 'rgba(30,46,60,1)';
    g.fillRect(dx0 - W * 0.004, dy0, W * 0.006, dy1 - dy0);
    g.fillRect(dx1 - W * 0.002, dy0, W * 0.006, dy1 - dy0);
  }

  function drawTrusses(g) {
    var i;
    /* top chord + bottom chord with zig-zag web */
    var topY = H * 0.045, botY = H * 0.135;
    var endX = W * 0.78;
    g.strokeStyle = 'rgba(52,72,88,1)';
    g.lineWidth = Math.max(3, H * 0.010);
    g.beginPath();
    g.moveTo(-W * 0.01, topY);
    g.lineTo(endX, topY + H * 0.012);
    g.stroke();
    g.beginPath();
    g.moveTo(-W * 0.01, botY);
    g.lineTo(endX, botY + H * 0.012);
    g.stroke();
    g.lineWidth = Math.max(2, H * 0.007);
    g.strokeStyle = 'rgba(44,62,78,1)';
    var n = 12;
    for (i = 0; i < n; i++) {
      var xa = -W * 0.01 + i * (endX + W * 0.01) / n;
      var xb = xa + (endX + W * 0.01) / n;
      g.beginPath();
      g.moveTo(xa, botY);
      g.lineTo(xb, topY + H * 0.012);
      g.stroke();
      g.beginPath();
      g.moveTo(xa, topY);
      g.lineTo(xa + H * 0.010, botY + H * 0.004);
      g.stroke();
    }
    /* chord highlight */
    g.strokeStyle = 'rgba(' + STEEL_L + ',0.35)';
    g.lineWidth = Math.max(1, H * 0.0022);
    g.beginPath();
    g.moveTo(-W * 0.01, topY - H * 0.004);
    g.lineTo(endX, topY + H * 0.008);
    g.stroke();

    /* crane beam */
    var cbY = H * 0.175, cbH = H * 0.052;
    var cg = g.createLinearGradient(0, cbY, 0, cbY + cbH);
    cg.addColorStop(0, 'rgba(' + STEEL_M + ',1)');
    cg.addColorStop(0.28, 'rgba(' + STEEL_L + ',0.95)');
    cg.addColorStop(0.62, 'rgba(70,92,110,1)');
    cg.addColorStop(1, 'rgba(32,48,62,1)');
    g.fillStyle = cg;
    g.fillRect(-W * 0.01, cbY, W * 0.74, cbH);
    g.strokeStyle = 'rgba(16,28,38,0.9)';
    g.lineWidth = Math.max(1, H * 0.0026);
    g.strokeRect(-W * 0.01, cbY, W * 0.74, cbH);
    /* rail on the crane beam */
    g.strokeStyle = 'rgba(' + STEEL_L + ',0.55)';
    g.lineWidth = Math.max(1.5, H * 0.004);
    g.beginPath();
    g.moveTo(0, cbY + cbH * 0.16);
    g.lineTo(W * 0.73, cbY + cbH * 0.16);
    g.stroke();

    /* trolley + hook */
    var tx = W * 0.548;
    g.fillStyle = 'rgba(40,58,72,1)';
    g.fillRect(tx - W * 0.035, cbY + cbH - H * 0.006, W * 0.070, H * 0.036);
    g.fillStyle = 'rgba(' + STEEL_L + ',0.65)';
    g.fillRect(tx - W * 0.035, cbY + cbH - H * 0.006, W * 0.070, H * 0.006);
    /* hook cable */
    g.strokeStyle = 'rgba(30,44,56,1)';
    g.lineWidth = Math.max(2, H * 0.006);
    g.beginPath();
    g.moveTo(tx, cbY + cbH + H * 0.030);
    g.lineTo(tx, H * 0.44);
    g.stroke();
    g.strokeStyle = 'rgba(' + COOL + ',0.35)';
    g.lineWidth = Math.max(1, H * 0.002);
    g.beginPath();
    g.moveTo(tx + H * 0.003, cbY + cbH + H * 0.030);
    g.lineTo(tx + H * 0.003, H * 0.44);
    g.stroke();
    /* hook block */
    g.fillStyle = 'rgba(' + STEEL_M + ',1)';
    g.beginPath();
    g.arc(tx, H * 0.455, H * 0.018, 0, TAU);
    g.fill();
    g.strokeStyle = 'rgba(' + WARM + ',0.55)';
    g.lineWidth = Math.max(1, H * 0.0025);
    g.stroke();

    /* columns */
    var cols = [0.068, 0.512];
    for (i = 0; i < cols.length; i++) {
      var cx = cols[i] * W;
      var cw = W * 0.020;
      var cg2 = g.createLinearGradient(cx - cw, 0, cx + cw, 0);
      cg2.addColorStop(0, 'rgba(22,36,48,1)');
      cg2.addColorStop(0.35, 'rgba(' + STEEL_M + ',1)');
      cg2.addColorStop(0.55, 'rgba(' + STEEL_L + ',0.85)');
      cg2.addColorStop(1, 'rgba(20,34,46,1)');
      g.fillStyle = cg2;
      g.fillRect(cx - cw, H * 0.14, cw * 2, FLOOR_Y * H - H * 0.14);
      for (var k = 0; k < 6; k++) {
        g.fillStyle = 'rgba(16,28,38,0.75)';
        g.fillRect(cx - cw * 1.15, H * (0.20 + k * 0.085), cw * 2.3, H * 0.010);
      }
    }

    /* hanging cables */
    var cables = [
      [0.12, 0.56, 0.06], [0.20, 0.66, 0.05], [0.40, 0.60, 0.07],
      [0.50, 0.70, 0.05], [0.57, 0.78, 0.06]
    ];
    for (i = 0; i < cables.length; i++) {
      var x0 = cables[i][0] * W, x1 = cables[i][1] * W, sag = cables[i][2] * H;
      var cy0 = H * 0.19;
      g.strokeStyle = 'rgba(24,38,50,1)';
      g.lineWidth = Math.max(2, H * 0.0055);
      g.beginPath();
      g.moveTo(x0, cy0);
      g.quadraticCurveTo((x0 + x1) / 2, cy0 + sag * 2.1, x1, cy0 + H * 0.02);
      g.stroke();
      g.strokeStyle = 'rgba(' + WARM + ',0.24)';
      g.lineWidth = Math.max(1, H * 0.0018);
      g.beginPath();
      g.moveTo(x0, cy0 + H * 0.003);
      g.quadraticCurveTo((x0 + x1) / 2, cy0 + sag * 2.1 + H * 0.003, x1, cy0 + H * 0.023);
      g.stroke();
    }
  }

  function drawFloor(g) {
    var fy = FLOOR_Y * H;
    var fg = g.createLinearGradient(0, fy, 0, H);
    fg.addColorStop(0, 'rgba(62,84,102,1)');
    fg.addColorStop(0.25, 'rgba(48,68,86,1)');
    fg.addColorStop(1, 'rgba(30,46,60,1)');
    g.fillStyle = fg;
    g.fillRect(0, fy, W, H - fy);

    /* wet sheen from the door */
    g.save();
    g.globalCompositeOperation = 'lighter';
    var vx = DOOR_X0 * W + (DOOR_X1 - DOOR_X0) * W * 0.45;
    var pg = g.createLinearGradient(vx, fy, vx - W * 0.22, H);
    pg.addColorStop(0, 'rgba(255,196,132,0.42)');
    pg.addColorStop(0.45, 'rgba(255,170,100,0.16)');
    pg.addColorStop(1, 'rgba(255,150,90,0)');
    g.fillStyle = pg;
    g.beginPath();
    g.moveTo(vx - W * 0.20, fy);
    g.lineTo(vx + W * 0.20, fy);
    g.lineTo(vx + W * 0.36, H);
    g.lineTo(vx - W * 0.52, H);
    g.closePath();
    g.fill();
    g.restore();

    /* perspective joints */
    var vpx = DOOR_X0 * W + (DOOR_X1 - DOOR_X0) * W * 0.45, vpy = fy - H * 0.03;
    g.strokeStyle = 'rgba(120,150,170,0.20)';
    g.lineWidth = Math.max(1, H * 0.0018);
    var i;
    for (i = -12; i <= 12; i++) {
      var x = vpx + i * W * 0.075;
      g.beginPath();
      g.moveTo(vpx, vpy);
      g.lineTo(x, H + 10);
      g.stroke();
    }
    for (i = 1; i <= 6; i++) {
      var yy = fy + Math.pow(i / 6, 1.8) * (H - fy);
      g.strokeStyle = 'rgba(120,150,170,' + (0.06 + 0.12 * (1 - i / 6)) + ')';
      g.beginPath();
      g.moveTo(0, yy);
      g.lineTo(W, yy);
      g.stroke();
    }

    /* guide rails */
    var rails = [[0.10, 0.42], [0.62, 0.94]];
    for (i = 0; i < rails.length; i++) {
      var rx0 = rails[i][0] * W, rx1 = rails[i][1] * W;
      g.strokeStyle = 'rgba(' + STEEL_M + ',0.85)';
      g.lineWidth = Math.max(3, H * 0.008);
      g.beginPath();
      g.moveTo(rx0, H);
      g.lineTo(rx0 + (rx1 - rx0) * 0.55, fy + H * 0.01);
      g.stroke();
      g.strokeStyle = 'rgba(' + STEEL_L + ',0.55)';
      g.lineWidth = Math.max(1, H * 0.0022);
      g.beginPath();
      g.moveTo(rx0 + H * 0.003, H);
      g.lineTo(rx0 + (rx1 - rx0) * 0.55, fy + H * 0.012);
      g.stroke();
    }

    /* warning stripe band across the door threshold */
    var sw = H * 0.018;
    g.save();
    g.beginPath();
    g.rect(W * 0.02, fy - sw * 0.35, W * 0.61, sw);
    g.clip();
    g.fillStyle = 'rgba(226,168,58,0.95)';
    g.fillRect(W * 0.02, fy - sw * 0.35, W * 0.61, sw);
    g.fillStyle = 'rgba(28,34,40,0.95)';
    for (var s = -W; s < W * 2; s += sw * 1.6) {
      g.beginPath();
      g.moveTo(s, fy - sw * 0.35);
      g.lineTo(s + sw * 0.8, fy - sw * 0.35);
      g.lineTo(s + sw * 0.8 - sw, fy + sw * 0.65);
      g.lineTo(s - sw, fy + sw * 0.65);
      g.closePath();
      g.fill();
    }
    g.restore();
    g.strokeStyle = 'rgba(' + WARM + ',0.5)';
    g.lineWidth = Math.max(1, H * 0.002);
    g.beginPath();
    g.moveTo(W * 0.02, fy - sw * 0.35);
    g.lineTo(W * 0.63, fy - sw * 0.35);
    g.stroke();
  }

  function drawShafts(g) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    var defs = [
      [0.60, 0.36, 0.20, 0.86, 0.10, 0.20],
      [0.68, 0.40, 0.28, 0.98, 0.13, 0.22],
      [0.76, 0.34, 0.38, 0.92, 0.11, 0.18],
      [0.84, 0.42, 0.50, 1.02, 0.14, 0.17],
      [0.90, 0.36, 0.60, 0.90, 0.09, 0.14]
    ];
    for (var i = 0; i < defs.length; i++) {
      var d = defs[i];
      var x0 = d[0] * W, y0 = d[1] * H;
      var x1 = d[2] * W, y1 = d[3] * H;
      var w0 = W * 0.012, w1 = W * d[4];
      var lg = g.createLinearGradient(x0, y0, x1, y1);
      lg.addColorStop(0, 'rgba(' + WARM + ',' + d[5] + ')');
      lg.addColorStop(0.45, 'rgba(' + WARM + ',' + (d[5] * 0.55) + ')');
      lg.addColorStop(1, 'rgba(255,190,140,0)');
      g.fillStyle = lg;
      g.beginPath();
      g.moveTo(x0 - w0, y0);
      g.lineTo(x0 + w0 * 2.4, y0);
      g.lineTo(x1 + w1, y1);
      g.lineTo(x1 - w1, y1);
      g.closePath();
      g.fill();
    }
    g.restore();
  }

  function drawHaze(g) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    radial(g, W * 0.80, H * 0.50, H * 0.95, WARM, 0.30);
    radial(g, W * 0.62, H * 0.44, H * 0.70, '255,214,160', 0.22);
    radial(g, W * 0.20, H * 0.20, H * 0.60, COOL, 0.10);
    radial(g, W * 0.30, H * 0.92, H * 0.55, '255,180,120', 0.14);
    g.restore();
  }

  function drawForegroundWall(g) {
    /* dark left edge column close to camera */
    var lg = g.createLinearGradient(0, 0, W * 0.055, 0);
    lg.addColorStop(0, 'rgba(10,20,28,0.98)');
    lg.addColorStop(0.7, 'rgba(18,32,44,0.9)');
    lg.addColorStop(1, 'rgba(24,40,52,0)');
    g.fillStyle = lg;
    g.fillRect(0, 0, W * 0.055, H);
    g.strokeStyle = 'rgba(' + WARM + ',0.22)';
    g.lineWidth = Math.max(1, H * 0.0025);
    g.beginPath();
    g.moveTo(W * 0.052, 0);
    g.lineTo(W * 0.052, H);
    g.stroke();
  }

  /* ------------------------------------------------------------------ *
   *  the machine: side / back view on a maintenance stand
   * ------------------------------------------------------------------ */

  function renderMech() {
    mechC = makeCanvas(W * dpr, H * dpr);
    var g = mechC.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    seamC = makeCanvas(W * dpr, H * dpr);
    var s = seamC.getContext('2d');
    s.setTransform(dpr, 0, 0, dpr, 0, 0);

    var ox = MECH_X * W, oy = MECH_Y * H;
    var u = function (v) { return ox + v * H; };
    var v = function (n) { return oy - n * H; };

    /* ---- maintenance stand ---- */
    stand(g, ox, oy, u, v);

    g.save();
    g.translate(0, 0);
    drawMechFar(g, u, v);
    drawMechNear(g, u, v);
    drawMechTorso(g, u, v, s);
    drawMechHead(g, u, v, s);
    g.restore();

    /* seam glow layer (drawn per frame with a breathing alpha) */
    drawSeams(s, u, v);
  }

  function stand(g, ox, oy, u, v) {
    /* platform */
    var pw0 = u(-0.155), pw1 = u(0.185);
    var py0 = v(0.0), py1 = v(-0.055);
    var pg = g.createLinearGradient(0, py0, 0, py1);
    pg.addColorStop(0, 'rgba(' + STEEL_M + ',1)');
    pg.addColorStop(0.35, 'rgba(72,96,114,1)');
    pg.addColorStop(1, 'rgba(30,46,60,1)');
    g.fillStyle = pg;
    g.fillRect(pw0, py0, pw1 - pw0, py1 - py0);
    g.strokeStyle = 'rgba(' + STEEL_L + ',0.55)';
    g.lineWidth = Math.max(1.5, H * 0.003);
    g.beginPath();
    g.moveTo(pw0, py0);
    g.lineTo(pw1, py0);
    g.stroke();
    /* hazard stripe on the platform face */
    g.save();
    g.beginPath();
    g.rect(pw0, py0 + (py1 - py0) * 0.55, pw1 - pw0, (py1 - py0) * 0.45);
    g.clip();
    g.fillStyle = 'rgba(226,168,58,0.95)';
    g.fillRect(pw0, py0, pw1 - pw0, py1 - py0);
    g.fillStyle = 'rgba(26,32,38,0.95)';
    for (var s = pw0 - H * 0.1; s < pw1; s += H * 0.045) {
      g.beginPath();
      g.moveTo(s, py0);
      g.lineTo(s + H * 0.022, py0);
      g.lineTo(s + H * 0.022 - H * 0.05, py1);
      g.lineTo(s - H * 0.05, py1);
      g.closePath();
      g.fill();
    }
    g.restore();
    /* support legs */
    var legs = [-0.13, -0.02, 0.10, 0.165];
    for (var i = 0; i < legs.length; i++) {
      var lx = u(legs[i]);
      var lg = g.createLinearGradient(lx - H * 0.012, 0, lx + H * 0.012, 0);
      lg.addColorStop(0, 'rgba(24,38,50,1)');
      lg.addColorStop(0.5, 'rgba(' + STEEL_M + ',1)');
      lg.addColorStop(1, 'rgba(20,34,44,1)');
      g.fillStyle = lg;
      g.fillRect(lx - H * 0.012, py1, H * 0.024, H * 0.055);
      g.fillStyle = 'rgba(20,32,42,1)';
      g.fillRect(lx - H * 0.028, py1 + H * 0.055, H * 0.056, H * 0.012);
    }
    /* small control box on the platform */
    g.fillStyle = 'rgba(58,80,98,1)';
    g.fillRect(pw0 + H * 0.012, py0 - H * 0.030, H * 0.034, H * 0.030);
    g.fillStyle = 'rgba(' + WARM + ',0.85)';
    g.fillRect(pw0 + H * 0.018, py0 - H * 0.024, H * 0.020, H * 0.005);
    g.fillStyle = 'rgba(' + COOL + ',0.75)';
    g.fillRect(pw0 + H * 0.018, py0 - H * 0.016, H * 0.010, H * 0.004);

    /* contact shadow */
    g.save();
    g.globalCompositeOperation = 'multiply';
    var sh = g.createRadialGradient(ox, py1 + H * 0.062, 0, ox, py1 + H * 0.062, H * 0.30);
    sh.addColorStop(0, 'rgba(24,40,54,0.75)');
    sh.addColorStop(1, 'rgba(24,40,54,0)');
    g.fillStyle = sh;
    g.save();
    g.translate(ox, py1 + H * 0.062);
    g.scale(1, 0.22);
    g.translate(-ox, -(py1 + H * 0.062));
    g.fillRect(ox - H * 0.32, py1 + H * 0.062 - H * 0.32, H * 0.64, H * 0.64);
    g.restore();
    g.restore();

    /* warm pool of light on the floor under the stand */
    g.save();
    g.globalCompositeOperation = 'lighter';
    radial(g, ox, py1 + H * 0.075, H * 0.34, '255,190,130', 0.34);
    g.restore();

    /* rear cradle arm that clamps the waist */
    var cx0 = u(0.185), cy0 = py0 + H * 0.010;
    var cx1 = u(0.115), cy1 = v(0.315);
    g.strokeStyle = 'rgba(30,46,60,1)';
    g.lineWidth = Math.max(9, H * 0.030);
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(cx0, cy0);
    g.bezierCurveTo(u(0.175), v(0.140), u(0.145), v(0.260), cx1, cy1);
    g.stroke();
    g.strokeStyle = 'rgba(' + STEEL_M + ',1)';
    g.lineWidth = Math.max(5, H * 0.018);
    g.beginPath();
    g.moveTo(cx0, cy0);
    g.bezierCurveTo(u(0.175), v(0.140), u(0.145), v(0.260), cx1, cy1);
    g.stroke();
    g.strokeStyle = 'rgba(' + WARM + ',0.55)';
    g.lineWidth = Math.max(1.4, H * 0.0032);
    g.beginPath();
    g.moveTo(cx0 + H * 0.006, cy0 - H * 0.006);
    g.bezierCurveTo(u(0.181), v(0.140), u(0.151), v(0.260), cx1 + H * 0.006, cy1 - H * 0.006);
    g.stroke();
    /* waist clamp */
    g.fillStyle = 'rgba(58,80,98,1)';
    g.fillRect(cx1 - H * 0.010, cy1 - H * 0.030, H * 0.040, H * 0.060);
    g.strokeStyle = 'rgba(' + COOL + ',0.55)';
    g.lineWidth = Math.max(1, H * 0.0026);
    g.strokeRect(cx1 - H * 0.010, cy1 - H * 0.030, H * 0.040, H * 0.060);
    /* one front clamp at the knee */
    g.strokeStyle = 'rgba(46,66,84,1)';
    g.lineWidth = Math.max(5, H * 0.018);
    g.beginPath();
    g.moveTo(u(-0.140), py0 + H * 0.006);
    g.lineTo(u(-0.010), v(0.230));
    g.stroke();
    g.strokeStyle = 'rgba(' + STEEL_L + ',0.35)';
    g.lineWidth = Math.max(1, H * 0.003);
    g.beginPath();
    g.moveTo(u(-0.140), py0 + H * 0.001);
    g.lineTo(u(-0.010), v(0.235));
    g.stroke();
    g.fillStyle = 'rgba(66,88,106,1)';
    g.beginPath();
    g.arc(u(-0.010), v(0.230), H * 0.018, 0, TAU);
    g.fill();
  }

  function poly(g, list, fill) {
    g.beginPath();
    g.moveTo(list[0][0], list[0][1]);
    for (var i = 1; i < list.length; i++) { g.lineTo(list[i][0], list[i][1]); }
    g.closePath();
    g.fillStyle = fill;
    g.fill();
  }

  function drawMechFar(g, u, v) {
    /* far leg, kept in shadow */
    poly(g, [
      [u(-0.075), v(0.310)], [u(-0.010), v(0.318)], [u(-0.004), v(0.190)],
      [u(-0.062), v(0.180)]
    ], 'rgba(52,72,90,1)');
    poly(g, [
      [u(-0.070), v(0.190)], [u(-0.006), v(0.196)], [u(-0.012), v(0.030)],
      [u(-0.078), v(0.026)]
    ], 'rgba(44,62,80,1)');
    poly(g, [
      [u(-0.090), v(0.030)], [u(-0.006), v(0.034)], [u(-0.004), v(0.0)],
      [u(-0.092), v(0.0)]
    ], 'rgba(36,52,68,1)');
    g.strokeStyle = 'rgba(' + WARM + ',0.22)';
    g.lineWidth = Math.max(1, H * 0.0022);
    g.beginPath();
    g.moveTo(u(-0.004), v(0.190));
    g.lineTo(u(-0.012), v(0.030));
    g.stroke();
  }

  function drawMechNear(g, u, v) {
    var steel = 'rgba(98,124,146,1)';
    var steelD = 'rgba(62,86,106,1)';
    var steelL = 'rgba(176,198,216,1)';

    /* thigh */
    poly(g, [
      [u(0.000), v(0.320)], [u(0.088), v(0.326)], [u(0.082), v(0.235)],
      [u(0.006), v(0.228)]
    ], steel);
    /* knee cap */
    poly(g, [
      [u(-0.006), v(0.238)], [u(0.090), v(0.244)], [u(0.094), v(0.196)],
      [u(0.000), v(0.190)]
    ], steelL);
    /* shin */
    poly(g, [
      [u(0.004), v(0.200)], [u(0.092), v(0.206)], [u(0.080), v(0.070)],
      [u(0.010), v(0.062)]
    ], steel);
    /* ankle */
    poly(g, [
      [u(0.006), v(0.070)], [u(0.082), v(0.076)], [u(0.080), v(0.034)],
      [u(0.004), v(0.030)]
    ], steelD);
    /* foot */
    poly(g, [
      [u(-0.030), v(0.034)], [u(0.098), v(0.040)], [u(0.100), v(0.004)],
      [u(-0.036), v(0.0)]
    ], steelD);
    g.strokeStyle = 'rgba(' + WARM + ',0.75)';
    g.lineWidth = Math.max(1.5, H * 0.0035);
    g.beginPath();
    g.moveTo(u(0.098), v(0.040));
    g.lineTo(u(0.100), v(0.004));
    g.lineTo(u(-0.036), v(0.0));
    g.stroke();

    /* calf hydraulics */
    g.strokeStyle = 'rgba(' + STEEL_L + ',1)';
    g.lineWidth = Math.max(3, H * 0.010);
    g.beginPath();
    g.moveTo(u(0.088), v(0.060));
    g.lineTo(u(0.080), v(0.180));
    g.stroke();
    g.strokeStyle = 'rgba(' + STEEL_D + ',1)';
    g.lineWidth = Math.max(4, H * 0.016);
    g.beginPath();
    g.moveTo(u(0.096), v(0.055));
    g.lineTo(u(0.090), v(0.130));
    g.stroke();

    /* pelvis / skirt */
    poly(g, [
      [u(-0.020), v(0.362)], [u(0.104), v(0.368)], [u(0.098), v(0.300)],
      [u(-0.012), v(0.292)]
    ], steelD);
    poly(g, [
      [u(0.010), v(0.300)], [u(0.104), v(0.306)], [u(0.092), v(0.238)],
      [u(0.020), v(0.232)]
    ], 'rgba(52,74,92,1)');

    /* arm: pauldron, upper arm, forearm, hand */
    poly(g, [
      [u(0.062), v(0.470)], [u(0.156), v(0.458)], [u(0.170), v(0.392)],
      [u(0.088), v(0.378)]
    ], steelL);
    poly(g, [
      [u(0.070), v(0.470)], [u(0.150), v(0.460)], [u(0.150), v(0.440)],
      [u(0.072), v(0.450)]
    ], 'rgba(206,224,238,0.85)');
    /* pauldron edge light */
    g.strokeStyle = 'rgba(' + WARM + ',0.85)';
    g.lineWidth = Math.max(1.4, H * 0.0032);
    g.beginPath();
    g.moveTo(u(0.156), v(0.458));
    g.lineTo(u(0.170), v(0.392));
    g.stroke();
    poly(g, [
      [u(0.100), v(0.398)], [u(0.150), v(0.394)], [u(0.148), v(0.318)],
      [u(0.102), v(0.320)]
    ], steel);
    g.fillStyle = 'rgba(' + STEEL_DD + ',1)';
    g.beginPath();
    g.arc(u(0.126), v(0.318), H * 0.020, 0, TAU);
    g.fill();
    g.strokeStyle = 'rgba(' + STEEL_L + ',0.55)';
    g.lineWidth = Math.max(1, H * 0.003);
    g.stroke();
    poly(g, [
      [u(0.098), v(0.312)], [u(0.148), v(0.308)], [u(0.142), v(0.232)],
      [u(0.094), v(0.236)]
    ], steel);
    poly(g, [
      [u(0.090), v(0.240)], [u(0.148), v(0.236)], [u(0.142), v(0.194)],
      [u(0.092), v(0.198)]
    ], steelD);
    poly(g, [
      [u(0.096), v(0.236)], [u(0.144), v(0.232)], [u(0.142), v(0.222)],
      [u(0.096), v(0.226)]
    ], 'rgba(198,218,234,0.75)');
    /* fingers */
    g.fillStyle = 'rgba(' + STEEL_L + ',1)';
    g.fillRect(u(0.092), v(0.198), H * 0.018, H * 0.046);
    g.fillRect(u(0.118), v(0.200), H * 0.018, H * 0.042);
    g.fillStyle = 'rgba(' + STEEL_D + ',1)';
    g.fillRect(u(0.092), v(0.152), H * 0.018, H * 0.012);
    g.fillRect(u(0.118), v(0.158), H * 0.018, H * 0.012);

    /* exposed hydraulics */
    g.strokeStyle = 'rgba(214,230,244,0.9)';
    g.lineWidth = Math.max(2.4, H * 0.0065);
    g.beginPath();
    g.moveTo(u(0.104), v(0.052));
    g.lineTo(u(0.088), v(0.150));
    g.stroke();
    g.strokeStyle = 'rgba(' + STEEL_D + ',1)';
    g.lineWidth = Math.max(4, H * 0.011);
    g.beginPath();
    g.moveTo(u(0.112), v(0.048));
    g.lineTo(u(0.100), v(0.096));
    g.stroke();
    g.fillStyle = 'rgba(' + STEEL_L + ',0.85)';
    g.fillRect(u(0.104) - H * 0.008, v(0.150) - H * 0.004, H * 0.020, H * 0.010);

    /* bright hand so it does not read as a dark blob */
    g.fillStyle = 'rgba(148,174,198,1)';
    g.beginPath();
    g.arc(u(0.124), v(0.220), H * 0.014, 0, TAU);
    g.fill();
    g.strokeStyle = 'rgba(' + WARM + ',0.75)';
    g.lineWidth = Math.max(1.2, H * 0.0028);
    g.stroke();

    /* leg panel lines */
    g.strokeStyle = 'rgba(24,38,50,0.65)';
    g.lineWidth = Math.max(1, H * 0.0022);
    g.beginPath();
    g.moveTo(u(0.010), v(0.196));
    g.lineTo(u(0.084), v(0.202));
    g.stroke();
    g.beginPath();
    g.moveTo(u(0.006), v(0.116));
    g.lineTo(u(0.086), v(0.122));
    g.stroke();
    g.beginPath();
    g.moveTo(u(0.004), v(0.060));
    g.lineTo(u(0.082), v(0.066));
    g.stroke();
    g.beginPath();
    g.moveTo(u(0.006), v(0.300));
    g.lineTo(u(0.086), v(0.306));
    g.stroke();

    /* warm rim on the door side */
    g.strokeStyle = 'rgba(' + WARM + ',0.95)';
    g.lineWidth = Math.max(2.0, H * 0.0055);
    g.beginPath();
    g.moveTo(u(0.088), v(0.326));
    g.lineTo(u(0.092), v(0.206));
    g.lineTo(u(0.098), v(0.040));
    g.stroke();
    g.beginPath();
    g.moveTo(u(0.150), v(0.452));
    g.lineTo(u(0.148), v(0.318));
    g.stroke();
    g.beginPath();
    g.moveTo(u(0.144), v(0.232));
    g.lineTo(u(0.140), v(0.196));
    g.stroke();

    /* cool shadow side */
    g.save();
    g.globalCompositeOperation = 'multiply';
    var sg = g.createLinearGradient(u(-0.05), 0, u(0.05), 0);
    sg.addColorStop(0, 'rgba(120,150,180,0.55)');
    sg.addColorStop(1, 'rgba(255,255,255,1)');
    g.fillStyle = sg;
    g.fillRect(u(-0.06), v(0.34), H * 0.11, H * 0.34);
    g.restore();
  }

  function drawMechTorso(g, u, v, s) {
    var steel = 'rgba(104,130,152,1)';
    var steelL = 'rgba(184,206,224,1)';
    var steelD = 'rgba(64,88,108,1)';

    /* chest plate */
    poly(g, [
      [u(-0.058), v(0.468)], [u(0.062), v(0.476)], [u(0.066), v(0.436)],
      [u(-0.064), v(0.428)]
    ], 'rgba(128,154,178,1)');
    poly(g, [
      [u(-0.062), v(0.436)], [u(0.066), v(0.442)], [u(0.062), v(0.404)],
      [u(-0.056), v(0.398)]
    ], 'rgba(84,110,132,1)');

    /* main chest / back block */
    poly(g, [
      [u(-0.060), v(0.382)], [u(-0.072), v(0.452)], [u(-0.020), v(0.478)],
      [u(0.080), v(0.482)], [u(0.112), v(0.452)], [u(0.108), v(0.376)],
      [u(0.060), v(0.360)], [u(-0.020), v(0.358)]
    ], steel);

    /* backpack */
    poly(g, [
      [u(0.090), v(0.372)], [u(0.150), v(0.392)], [u(0.148), v(0.470)],
      [u(0.086), v(0.478)]
    ], steelD);
    poly(g, [
      [u(0.100), v(0.400)], [u(0.144), v(0.414)], [u(0.142), v(0.462)],
      [u(0.098), v(0.466)]
    ], 'rgba(58,80,98,1)');

    /* thruster nozzles */
    var noz = [[0.106, 0.480], [0.136, 0.474]];
    for (var i = 0; i < noz.length; i++) {
      var nx = u(noz[i][0]), ny = v(noz[i][1]);
      poly(g, [
        [nx - H * 0.014, ny], [nx + H * 0.014, ny],
        [nx + H * 0.020, ny - H * 0.030], [nx - H * 0.020, ny - H * 0.030]
      ], 'rgba(58,78,96,1)');
      g.fillStyle = 'rgba(24,34,44,1)';
      g.beginPath();
      g.ellipse(nx, ny - H * 0.028, H * 0.019, H * 0.007, 0, 0, TAU);
      g.fill();
      g.strokeStyle = 'rgba(' + WARM + ',0.65)';
      g.lineWidth = Math.max(1, H * 0.0025);
      g.stroke();
    }

    /* shoulder collar */
    poly(g, [
      [u(-0.036), v(0.478)], [u(0.070), v(0.486)], [u(0.076), v(0.452)],
      [u(-0.030), v(0.444)]
    ], steelL);

    /* neck */
    poly(g, [
      [u(-0.010), v(0.492)], [u(0.044), v(0.496)], [u(0.040), v(0.474)],
      [u(-0.008), v(0.470)]
    ], 'rgba(40,58,74,1)');

    /* back panel lines */
    g.strokeStyle = 'rgba(20,34,46,0.85)';
    g.lineWidth = Math.max(1, H * 0.0022);
    g.beginPath();
    g.moveTo(u(0.010), v(0.372));
    g.lineTo(u(0.014), v(0.470));
    g.stroke();
    g.beginPath();
    g.moveTo(u(-0.050), v(0.414));
    g.lineTo(u(0.096), v(0.420));
    g.stroke();
    /* vents */
    for (var k = 0; k < 4; k++) {
      g.fillStyle = 'rgba(24,38,50,0.9)';
      g.fillRect(u(0.020), v(0.456 - k * 0.016), H * 0.052, H * 0.008);
      g.fillStyle = 'rgba(' + WARM + ',0.30)';
      g.fillRect(u(0.020), v(0.456 - k * 0.016) + H * 0.001, H * 0.052, H * 0.002);
    }

    /* warm rim along the back of the torso and the shoulder */
    g.strokeStyle = 'rgba(' + WARM + ',0.98)';
    g.lineWidth = Math.max(2.2, H * 0.0060);
    g.beginPath();
    g.moveTo(u(0.112), v(0.452));
    g.lineTo(u(0.108), v(0.376));
    g.lineTo(u(0.060), v(0.360));
    g.stroke();
    g.beginPath();
    g.moveTo(u(0.150), v(0.392));
    g.lineTo(u(0.148), v(0.470));
    g.stroke();
    g.beginPath();
    g.moveTo(u(-0.072), v(0.452));
    g.lineTo(u(-0.020), v(0.478));
    g.stroke();

    /* cool fill from the wall side */
    g.save();
    g.globalCompositeOperation = 'lighter';
    radial(g, u(-0.08), v(0.36), H * 0.20, COOL, 0.16);
    g.restore();

    /* front edge highlight (cool fill from the hall) */
    g.strokeStyle = 'rgba(186,214,236,0.75)';
    g.lineWidth = Math.max(1.6, H * 0.0042);
    g.beginPath();
    g.moveTo(u(-0.020), v(0.478));
    g.lineTo(u(-0.072), v(0.452));
    g.lineTo(u(-0.060), v(0.382));
    g.stroke();

    /* cool rim from the left wall light */
    g.strokeStyle = 'rgba(' + COOL + ',0.55)';
    g.lineWidth = Math.max(1.2, H * 0.0028);
    g.beginPath();
    g.moveTo(u(-0.060), v(0.382));
    g.lineTo(u(-0.072), v(0.452));
    g.stroke();

    /* plate edges */
    g.strokeStyle = 'rgba(200,220,236,0.28)';
    g.lineWidth = Math.max(1, H * 0.0022);
    g.beginPath();
    g.moveTo(u(-0.040), v(0.468));
    g.lineTo(u(0.070), v(0.476));
    g.stroke();
    g.beginPath();
    g.moveTo(u(-0.052), v(0.402));
    g.lineTo(u(0.100), v(0.410));
    g.stroke();

    /* shoulder work light */
    g.fillStyle = 'rgba(30,44,58,1)';
    g.fillRect(u(0.086), v(0.482), H * 0.024, H * 0.010);
    g.fillStyle = 'rgba(255,238,206,0.95)';
    g.fillRect(u(0.090), v(0.480), H * 0.016, H * 0.006);

    /* greebles: bolts on the shoulder line */
    for (var bi = 0; bi < 4; bi++) {
      g.fillStyle = 'rgba(24,38,50,0.9)';
      g.beginPath();
      g.arc(u(-0.030 + bi * 0.030), v(0.470), H * 0.005, 0, TAU);
      g.fill();
      g.fillStyle = 'rgba(' + STEEL_L + ',0.45)';
      g.beginPath();
      g.arc(u(-0.030 + bi * 0.030) - H * 0.0015, v(0.470) - H * 0.0015, H * 0.0025, 0, TAU);
      g.fill();
    }

    /* decals */
    g.fillStyle = 'rgba(' + WARM + ',0.75)';
    g.fillRect(u(0.030), v(0.418), H * 0.026, H * 0.006);
    g.fillStyle = 'rgba(226,234,240,0.55)';
    g.fillRect(u(0.030), v(0.404), H * 0.016, H * 0.004);
  }

  function drawMechHead(g, u, v, s) {
    /* angular head, facing away from the camera */
    poly(g, [
      [u(-0.030), v(0.494)], [u(0.048), v(0.500)], [u(0.052), v(0.556)],
      [u(0.006), v(0.566)], [u(-0.034), v(0.548)]
    ], 'rgba(64,86,106,1)');
    /* helmet crest */
    poly(g, [
      [u(-0.012), v(0.560)], [u(0.046), v(0.560)], [u(0.040), v(0.574)],
      [u(-0.006), v(0.576)]
    ], 'rgba(96,120,142,1)');
    /* visor slit on the forward side (left) */
    g.fillStyle = 'rgba(255,196,120,0.95)';
    g.beginPath();
    g.moveTo(u(-0.030), v(0.520));
    g.lineTo(u(-0.006), v(0.524));
    g.lineTo(u(-0.008), v(0.534));
    g.lineTo(u(-0.032), v(0.532));
    g.closePath();
    g.fill();
    /* antenna */
    g.strokeStyle = 'rgba(120,146,168,1)';
    g.lineWidth = Math.max(1.5, H * 0.0035);
    g.beginPath();
    g.moveTo(u(0.034), v(0.572));
    g.lineTo(u(0.050), v(0.648));
    g.stroke();
    g.fillStyle = 'rgba(' + WARM + ',0.85)';
    g.beginPath();
    g.arc(u(0.051), v(0.652), H * 0.006, 0, TAU);
    g.fill();
    /* warm rim on the helmet */
    g.strokeStyle = 'rgba(' + WARM + ',0.85)';
    g.lineWidth = Math.max(1.4, H * 0.0035);
    g.beginPath();
    g.moveTo(u(0.048), v(0.500));
    g.lineTo(u(0.052), v(0.556));
    g.lineTo(u(0.006), v(0.566));
    g.stroke();
    g.strokeStyle = 'rgba(' + COOL + ',0.45)';
    g.lineWidth = Math.max(1, H * 0.0024);
    g.beginPath();
    g.moveTo(u(-0.030), v(0.494));
    g.lineTo(u(-0.034), v(0.548));
    g.stroke();
  }

  function drawSeams(s, u, v) {
    /* glowing energy seams, animated later by a breathing alpha */
    s.save();
    s.lineCap = 'round';
    s.strokeStyle = 'rgba(' + WARM + ',1)';
    s.lineWidth = Math.max(1.6, H * 0.0035);
    s.beginPath();
    s.moveTo(u(0.020), v(0.372));
    s.lineTo(u(0.026), v(0.468));
    s.stroke();
    s.beginPath();
    s.moveTo(u(0.058), v(0.362));
    s.lineTo(u(0.064), v(0.476));
    s.stroke();
    s.lineWidth = Math.max(1.2, H * 0.0026);
    s.beginPath();
    s.moveTo(u(0.012), v(0.300));
    s.lineTo(u(0.016), v(0.228));
    s.stroke();
    s.beginPath();
    s.moveTo(u(0.022), v(0.198));
    s.lineTo(u(0.026), v(0.070));
    s.stroke();
    s.beginPath();
    s.moveTo(u(0.104), v(0.398));
    s.lineTo(u(0.108), v(0.320));
    s.stroke();
    /* shoulder core light */
    s.fillStyle = 'rgba(' + WARM + ',1)';
    s.beginPath();
    s.arc(u(0.130), v(0.430), H * 0.010, 0, TAU);
    s.fill();
    s.fillStyle = 'rgba(255,240,210,1)';
    s.beginPath();
    s.arc(u(0.130), v(0.430), H * 0.005, 0, TAU);
    s.fill();
    s.restore();
  }

  /* ------------------------------------------------------------------ *
   *  foreground
   * ------------------------------------------------------------------ */

  function renderFront() {
    frontC = makeCanvas(W * dpr, H * dpr);
    var g = frontC.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    /* toolbox bottom left */
    var bx = W * 0.015, by = H * 0.845, bw = W * 0.135, bh = H * 0.115;
    var bg3 = g.createLinearGradient(bx, by, bx, by + bh);
    bg3.addColorStop(0, 'rgba(' + STEEL_M + ',1)');
    bg3.addColorStop(0.3, 'rgba(64,86,104,1)');
    bg3.addColorStop(1, 'rgba(26,42,56,1)');
    g.fillStyle = bg3;
    g.fillRect(bx, by, bw, bh);
    g.strokeStyle = 'rgba(' + WARM + ',0.55)';
    g.lineWidth = Math.max(1.4, H * 0.003);
    g.beginPath();
    g.moveTo(bx, by);
    g.lineTo(bx + bw, by);
    g.stroke();
    g.fillStyle = 'rgba(20,32,42,1)';
    g.fillRect(bx, by + bh * 0.45, bw, H * 0.008);
    /* handles */
    g.strokeStyle = 'rgba(' + STEEL_L + ',0.6)';
    g.lineWidth = Math.max(2, H * 0.006);
    g.beginPath();
    g.moveTo(bx + bw * 0.3, by + bh * 0.14);
    g.lineTo(bx + bw * 0.3, by);
    g.stroke();

    /* crate bottom right */
    var cx = W * 0.855, cy = H * 0.870, cw = W * 0.125, ch = H * 0.095;
    g.fillStyle = 'rgba(38,56,70,1)';
    g.fillRect(cx, cy, cw, ch);
    g.strokeStyle = 'rgba(' + WARM + ',0.40)';
    g.lineWidth = Math.max(1.2, H * 0.0026);
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + cw, cy);
    g.stroke();
    g.strokeStyle = 'rgba(90,112,130,0.6)';
    g.lineWidth = Math.max(1, H * 0.0022);
    g.strokeRect(cx + cw * 0.1, cy + ch * 0.15, cw * 0.8, ch * 0.7);

    /* foreground cable, slightly out of focus */
    g.strokeStyle = 'rgba(12,22,30,0.95)';
    g.lineWidth = Math.max(5, H * 0.014);
    g.beginPath();
    g.moveTo(W * 1.01, H * 0.72);
    g.quadraticCurveTo(W * 0.82, H * 0.99, W * 0.60, H * 1.02);
    g.stroke();
    g.strokeStyle = 'rgba(' + WARM + ',0.28)';
    g.lineWidth = Math.max(1.5, H * 0.003);
    g.beginPath();
    g.moveTo(W * 1.01, H * 0.715);
    g.quadraticCurveTo(W * 0.82, H * 0.985, W * 0.60, H * 1.015);
    g.stroke();

    /* hanging chain near the camera, left */
    var chx = W * 0.075;
    g.strokeStyle = 'rgba(26,40,52,1)';
    g.lineWidth = Math.max(3, H * 0.008);
    for (var i = 0; i < 9; i++) {
      g.beginPath();
      g.ellipse(chx, H * (0.10 + i * 0.028), H * 0.008, H * 0.016, 0, 0, TAU);
      g.stroke();
    }
    g.strokeStyle = 'rgba(' + WARM + ',0.30)';
    g.lineWidth = Math.max(1, H * 0.002);
    g.beginPath();
    g.moveTo(chx + H * 0.008, H * 0.10);
    g.lineTo(chx + H * 0.008, H * 0.35);
    g.stroke();
  }

  function renderReflection() {
    reflC = makeCanvas(W * dpr, H * dpr);
    var g = reflC.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.save();
    g.globalCompositeOperation = 'lighter';
    var vx = (DOOR_X0 + (DOOR_X1 - DOOR_X0) * 0.45) * W;
    var fy = FLOOR_Y * H;
    radial(g, vx, fy + H * 0.10, H * 0.42, WARM, 0.34);
    g.fillStyle = 'rgba(255,200,140,0.10)';
    g.beginPath();
    g.moveTo(vx - W * 0.16, fy);
    g.lineTo(vx + W * 0.16, fy);
    g.lineTo(vx + W * 0.30, H);
    g.lineTo(vx - W * 0.42, H);
    g.closePath();
    g.fill();
    g.restore();
  }

  function renderShade() {
    shadeW = Math.max(320, W * 0.33);
    shadeH = Math.max(130, H * 0.24);
    shadeC = makeCanvas(shadeW * dpr, shadeH * dpr);
    var g = shadeC.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    var vg = g.createLinearGradient(0, 0, 0, shadeH);
    vg.addColorStop(0, 'rgba(8,16,24,0.95)');
    vg.addColorStop(0.55, 'rgba(8,16,24,0.86)');
    vg.addColorStop(1, 'rgba(8,16,24,0)');
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

  function buildDust() {
    dust.length = 0;
    var n = 96;
    for (var i = 0; i < n; i++) {
      dust.push({
        x: rand(0.28, 1.02),
        y: rand(0.06, 0.98),
        r: rand(0.0016, 0.0052),
        vy: rand(0.004, 0.014),
        ph: rand(0, TAU),
        sp: rand(0.10, 0.44),
        amp: rand(0.004, 0.020),
        a: rand(0.25, 0.85)
      });
    }
    beacons.length = 0;
    var bp = [
      [0.575, 0.360], [0.575, 0.690], [0.960, 0.360], [0.960, 0.690],
      [0.205, 0.700], [0.480, 0.700]
    ];
    for (var k = 0; k < bp.length; k++) {
      beacons.push({ x: bp[k][0], y: bp[k][1], ph: k * 1.1 });
    }
    arms.length = 0;
    arms.push({
      x: 0.455, y: 0.170, len1: 0.120, len2: 0.095, a1: 2.10, a2: 2.42,
      ph: 0.0, sp: 0.45, amp: 0.026
    });
    arms.push({
      x: 0.235, y: 0.150, len1: 0.135, len2: 0.105, a1: 1.42, a2: 1.62,
      ph: 2.0, sp: 0.33, amp: 0.020
    });
  }

  function drawDust(dt) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < dust.length; i++) {
      var d = dust[i];
      d.y -= d.vy * dt * 0.35;
      if (d.y < 0.02) { d.y = 0.99; d.x = rand(0.28, 1.02); }
      var x = (d.x + Math.sin(t * d.sp + d.ph) * d.amp) * W;
      var y = d.y * H;
      var tw = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 1.7 + d.ph * 2.1));
      /* dust is brightest inside the light shafts */
      var inShaft = Math.max(0, Math.min(1, (x / W - 0.30) / 0.60));
      var s = d.r * H * 9 * (0.7 + 0.5 * inShaft);
      ctx.globalAlpha = d.a * tw * (0.35 + 0.65 * inShaft);
      ctx.drawImage(glow.dust, x - s, y - s, s * 2, s * 2);
    }
    ctx.restore();
  }

  function drawArms() {
    for (var i = 0; i < arms.length; i++) {
      var a = arms[i];
      var ox = a.x * W, oy = a.y * H;
      var a1 = a.a1 + Math.sin(t * a.sp + a.ph) * a.amp;
      var a2 = a.a2 + Math.sin(t * a.sp * 1.3 + a.ph + 1) * a.amp * 1.2;
      var l1 = a.len1 * H, l2 = a.len2 * H;
      var jx = ox + Math.cos(a1) * l1, jy = oy + Math.sin(a1) * l1;
      var ex = jx + Math.cos(a2) * l2, ey = jy + Math.sin(a2) * l2;

      /* mount */
      ctx.fillStyle = 'rgba(40,58,74,1)';
      ctx.fillRect(ox - H * 0.018, oy - H * 0.018, H * 0.036, H * 0.036);
      ctx.strokeStyle = 'rgba(' + STEEL_L + ',0.5)';
      ctx.lineWidth = Math.max(1, H * 0.0022);
      ctx.strokeRect(ox - H * 0.018, oy - H * 0.018, H * 0.036, H * 0.036);

      /* segments */
      var segs = [[ox, oy, jx, jy, 0.026], [jx, jy, ex, ey, 0.020]];
      for (var k = 0; k < 2; k++) {
        var sg = segs[k];
        var ang = Math.atan2(sg[3] - sg[1], sg[2] - sg[0]);
        ctx.save();
        ctx.translate(sg[0], sg[1]);
        ctx.rotate(ang);
        var len = Math.hypot(sg[2] - sg[0], sg[3] - sg[1]);
        var w = H * sg[4];
        ctx.fillStyle = 'rgba(62,84,102,1)';
        ctx.fillRect(0, -w, len, w * 2);
        ctx.fillStyle = 'rgba(' + STEEL_L + ',0.75)';
        ctx.fillRect(0, -w, len, w * 0.35);
        ctx.fillStyle = 'rgba(' + WARM + ',0.55)';
        ctx.fillRect(0, w * 0.55, len, w * 0.35);
        ctx.restore();
        /* joint */
        ctx.fillStyle = 'rgba(' + STEEL_DD + ',1)';
        ctx.beginPath();
        ctx.arc(sg[2], sg[3], H * 0.017, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = 'rgba(' + WARM + ',0.6)';
        ctx.lineWidth = Math.max(1, H * 0.0026);
        ctx.stroke();
      }
      /* tool head: a clamp with a cyan work light */
      ctx.fillStyle = 'rgba(58,80,98,1)';
      ctx.beginPath();
      ctx.arc(ex, ey, H * 0.020, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(' + STEEL_L + ',0.55)';
      ctx.lineWidth = Math.max(1.4, H * 0.0032);
      ctx.stroke();
      ctx.fillStyle = 'rgba(24,38,50,1)';
      ctx.fillRect(ex - H * 0.004, ey + H * 0.014, H * 0.008, H * 0.022);
      ctx.fillRect(ex - H * 0.016, ey + H * 0.030, H * 0.032, H * 0.008);
      ctx.fillStyle = 'rgba(' + COOL + ',0.9)';
      ctx.beginPath();
      ctx.arc(ex, ey, H * 0.008, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(' + COOL + ',0.65)';
      ctx.beginPath();
      ctx.arc(ex, ey, H * 0.007, 0, TAU);
      ctx.fill();
    }
  }

  function drawBeacons() {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < beacons.length; i++) {
      var b = beacons[i];
      var on = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(t * 0.8 + b.ph));
      var d = H * 0.024 * (0.85 + 0.3 * on);
      ctx.globalAlpha = 0.5 * on;
      ctx.drawImage(glow.amber, b.x * W - d, b.y * H - d, d * 2, d * 2);
    }
    ctx.restore();
  }

  function drawFrame(dt) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    ctx.drawImage(bgC, 0, 0, W, H);
    ctx.drawImage(mechC, 0, 0, W, H);

    /* seam breathing */
    var br = 0.5 + 0.5 * Math.sin(t * 0.75);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.35 + 0.55 * br;
    ctx.drawImage(seamC, 0, 0, W, H);
    ctx.restore();

    /* floor reflection shimmer */
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.55 + 0.25 * Math.sin(t * 0.5);
    ctx.drawImage(reflC, 0, 0, W, H);
    ctx.restore();

    drawArms();
    ctx.drawImage(frontC, 0, 0, W, H);
    drawDust(dt);
    drawBeacons();

    ctx.drawImage(shadeC, W - shadeW, 0, shadeW, shadeH);
  }

  /* ------------------------------------------------------------------ *
   *  lifecycle
   * ------------------------------------------------------------------ */

  function buildScene() {
    glow.warm = makeGlow(WARM, 0.95);
    glow.amber = makeGlow('255,186,92', 0.95);
    glow.dust = makeGlow('255,236,206', 0.95);
    glow.cool = makeGlow(COOL, 0.9);

    renderBg();
    renderMech();
    renderFront();
    renderReflection();
    renderShade();
    buildDust();
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
