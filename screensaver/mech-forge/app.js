/* ==========================================================================
   Rong-lu Zhuang-pei / Forge Assembly -- procedural canvas screensaver.
   Interior of an assembly hall: an armoured mech hull hangs tilted from the
   overhead crane, three torch arms and a hanging welder work on it, sparks
   fly, a furnace glows on the right and the line keeps feeding parts in.
   No people, no faces, no humanoid silhouette: the hanging object is an
   asymmetric, partly built machine hull -- no head, no legs, just a hull
   slung from a master link with an empty leg socket underneath.

   Contract:
     - pure canvas, no external image / font / network / storage
     - no pointer / key listeners, no self-drawn exit button
     - canvas size = innerWidth/innerHeight * min(devicePixelRatio, 1.5)
     - static hall (walls, windows, crane, floor, line, pedestals) is
       pre-rendered to one offscreen canvas; the hull is its own sprite so it
       can swing as one piece. Per frame: blit + a handful of sprites only.
     - the per-frame loop uses no shadowBlur, no gradients, no pixel read-back,
       no text: glows are pre-rendered sprites drawn with drawImage.
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
  var bg = null, mechSpr = null;
  var L = {};                 /* layout, all relative to W/H */
  var S = {};                 /* pre-rendered sprites */
  var arms = [];
  var sparks = [];
  var embers = [];
  var dusts = [];
  var parts = [];
  var welder = null;
  var mechX = 0, mechSway = 0;
  var t = 0, lastTs = 0, rafId = 0, resizeTimer = 0;

  /* ------------------------------------------------------------- palette */
  var C_ORANGE = '255,138,60';   /* #ff8a3c furnace                   */
  var C_AMBER = '255,196,107';   /* #ffc46b furnace highlight         */
  var C_CYAN = '53,200,255';     /* #35c8ff accent                    */

  /* --------------------------------------------------------------- utils */

  function rand(a, b) { return a + Math.random() * (b - a); }
  function round(v) { return Math.round(v); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  function makeCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, round(w));
    c.height = Math.max(1, round(h));
    return c;
  }

  function rrect(g, x, y, w, h, r) {
    var rr = Math.min(r, Math.abs(w) * 0.5, Math.abs(h) * 0.5);
    g.beginPath();
    g.moveTo(x + rr, y);
    g.lineTo(x + w - rr, y);
    g.quadraticCurveTo(x + w, y, x + w, y + rr);
    g.lineTo(x + w, y + h - rr);
    g.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    g.lineTo(x + rr, y + h);
    g.quadraticCurveTo(x, y + h, x, y + h - rr);
    g.lineTo(x, y + rr);
    g.quadraticCurveTo(x, y, x + rr, y);
    g.closePath();
  }

  function poly(g, pts) {
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) { g.lineTo(pts[i][0], pts[i][1]); }
    g.closePath();
  }

  /* radial glow sprite (built once, blitted forever) */
  function glow(rgb, size, coreAt) {
    var c = makeCanvas(size, size);
    var g = c.getContext('2d');
    var r = c.width * 0.5;
    var gr = g.createRadialGradient(r, r, 0, r, r, r);
    gr.addColorStop(0.00, 'rgba(' + rgb + ',1)');
    gr.addColorStop(coreAt || 0.14, 'rgba(' + rgb + ',0.55)');
    gr.addColorStop(0.42, 'rgba(' + rgb + ',0.17)');
    gr.addColorStop(0.72, 'rgba(' + rgb + ',0.05)');
    gr.addColorStop(1.00, 'rgba(' + rgb + ',0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, c.width, c.height);
    return c;
  }

  function blitGlow(g, sprite, cx, cy, size, alpha) {
    g.globalAlpha = alpha;
    g.drawImage(sprite, cx - size * 0.5, cy - size * 0.5, size, size);
  }

  /* brushed steel plate gradient (static layer only) */
  function metal(g, y0, y1, a, b, c) {
    var grd = g.createLinearGradient(0, y0, 0, y1);
    grd.addColorStop(0.00, a || '#c9dae6');
    grd.addColorStop(0.46, b || '#8399a9');
    grd.addColorStop(1.00, c || '#3f5264');
    return grd;
  }

  /* diagonal hazard stripe band */
  function hazard(g, x, y, w, h, pitch, dark, light) {
    g.save();
    g.beginPath();
    g.rect(x, y, w, h);
    g.clip();
    g.fillStyle = dark;
    g.fillRect(x, y, w, h);
    g.fillStyle = light;
    var p = Math.max(4, pitch);
    for (var i = -2; (i * p) < w + h * 1.2; i++) {
      var x0 = x + i * p;
      g.beginPath();
      g.moveTo(x0, y + h);
      g.lineTo(x0 + p * 0.52, y + h);
      g.lineTo(x0 + p * 0.52 + h * 0.62, y);
      g.lineTo(x0 + h * 0.62, y);
      g.closePath();
      g.fill();
    }
    g.restore();
  }

  /* ----------------------------------------------------------- layout */

  function layout() {
    L.ceilH = H * 0.116;
    L.floorY = H * 0.618;
    L.beamY = H * 0.136;
    L.beamH = H * 0.054;
    L.legLx = W * 0.048;
    L.legRx = W * 0.952;
    L.furnX = W * 0.866;
    L.furnW = W * 0.142;
    L.furnH = H * 0.358;
    L.convTop = H * 0.742;
    L.convBot = H * 0.802;
    L.mechH = H * 0.484;
    L.mechW = L.mechH * 1.28;
    L.mechTop = H * 0.236;
    L.tilt = -0.062;
  }

  /* --------------------------------------------------------- sprites */

  function makeCorner() {
    /* Soft shade pinned to the top-right corner. The host drops its exit
       button into the 260x90 box there, so that box has to read calmer and
       darker than the hall -- roughly a third darker at most, and with no
       edge at all: a radial falloff from the corner, nothing opaque, so it
       can never look like a missing rectangle. */
    var w = 540, h = 260;
    var c = makeCanvas(w, h);
    var g = c.getContext('2d');
    var R = Math.max(w, h) * 0.98;
    var gr = g.createRadialGradient(w, 0, 0, w, 0, R);
    gr.addColorStop(0.00, 'rgba(10,18,26,0.33)');
    gr.addColorStop(0.28, 'rgba(10,18,26,0.31)');
    gr.addColorStop(0.52, 'rgba(10,18,26,0.25)');
    gr.addColorStop(0.74, 'rgba(10,18,26,0.14)');
    gr.addColorStop(0.89, 'rgba(10,18,26,0.05)');
    gr.addColorStop(1.00, 'rgba(10,18,26,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    return c;
  }

  function makeLinkSprite(len, thick) {
    var c = makeCanvas(len * dpr, thick * dpr);
    var g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    var grd = g.createLinearGradient(0, 0, 0, thick);
    grd.addColorStop(0.00, '#cfdfe9');
    grd.addColorStop(0.20, '#9db2c1');
    grd.addColorStop(0.56, '#68808f');
    grd.addColorStop(1.00, '#31454f');
    rrect(g, 0, 0, len, thick, thick * 0.36);
    g.fillStyle = grd;
    g.fill();
    g.lineWidth = Math.max(1, thick * 0.055);
    g.strokeStyle = 'rgba(18,30,40,0.70)';
    g.stroke();

    /* hydraulic ram along the link */
    g.save();
    rrect(g, 0, 0, len, thick, thick * 0.36);
    g.clip();
    var ry = thick * 0.52, rh = thick * 0.18;
    g.fillStyle = 'rgba(40,56,68,0.60)';
    g.fillRect(thick * 0.5, ry, len - thick, rh);
    g.fillStyle = '#c8dce9';
    g.fillRect(thick * 0.9, ry + rh * 0.16, len * 0.50, rh * 0.68);
    g.fillStyle = 'rgba(24,38,48,0.60)';
    g.fillRect(thick * 0.9 + len * 0.50, ry + rh * 0.06, thick * 0.6, rh * 0.88);
    g.fillStyle = 'rgba(255,196,107,0.92)';
    g.fillRect(thick * 0.9 + len * 0.485, ry - rh * 0.40, thick * 0.26, rh * 1.8);
    g.restore();

    /* top catch light + underside shade */
    g.fillStyle = 'rgba(246,253,255,0.65)';
    g.fillRect(thick * 0.45, thick * 0.09, len - thick * 0.9, Math.max(1, thick * 0.075));
    g.fillStyle = 'rgba(16,28,38,0.45)';
    g.fillRect(thick * 0.45, thick * 0.87, len - thick * 0.9, Math.max(1, thick * 0.11));

    /* joint bosses */
    var r = thick * 0.19;
    var ends = [thick * 0.55, len - thick * 0.55];
    for (var i = 0; i < 2; i++) {
      g.beginPath();
      g.arc(ends[i], thick * 0.5, r, 0, TAU);
      g.fillStyle = 'rgba(40,58,72,0.92)';
      g.fill();
      g.beginPath();
      g.arc(ends[i] - r * 0.22, thick * 0.42, r * 0.46, 0, TAU);
      g.fillStyle = 'rgba(224,240,250,0.72)';
      g.fill();
    }
    /* cyan indicator on the underside */
    g.fillStyle = 'rgba(53,200,255,0.60)';
    g.fillRect(thick * 0.9, thick * 0.94, len - thick * 1.8, Math.max(1, thick * 0.04));
    return c;
  }

  function makeTorchSprite(w, h) {
    var c = makeCanvas(w * dpr, h * dpr);
    var g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    rrect(g, w * 0.08, h * 0.04, w * 0.84, h * 0.58, h * 0.18);
    g.fillStyle = metal(g, h * 0.04, h * 0.62, '#cddfe9', '#7f96a6', '#374b5c');
    g.fill();
    g.strokeStyle = 'rgba(18,30,40,0.75)';
    g.lineWidth = Math.max(1, w * 0.020);
    g.stroke();
    /* hose fitting */
    g.fillStyle = '#4b6072';
    g.fillRect(w * 0.30, 0, w * 0.40, h * 0.09);
    /* copper collar */
    g.fillStyle = '#a87b52';
    g.fillRect(w * 0.27, h * 0.58, w * 0.46, h * 0.14);
    g.fillStyle = 'rgba(255,224,186,0.60)';
    g.fillRect(w * 0.27, h * 0.58, w * 0.46, h * 0.035);
    /* nozzle */
    poly(g, [[w * 0.35, h * 0.72], [w * 0.65, h * 0.72],
             [w * 0.57, h * 0.99], [w * 0.43, h * 0.99]]);
    g.fillStyle = metal(g, h * 0.72, h, '#b3c7d5', '#6f8697', '#2c3f50');
    g.fill();
    g.strokeStyle = 'rgba(18,30,40,0.65)';
    g.stroke();
    /* cyan sensor bar (a bar, not an eye) */
    g.fillStyle = 'rgba(53,200,255,0.95)';
    g.fillRect(w * 0.26, h * 0.28, w * 0.48, h * 0.07);
    g.fillStyle = 'rgba(53,200,255,0.26)';
    g.fillRect(w * 0.20, h * 0.24, w * 0.60, h * 0.15);
    /* amber warning tag */
    g.fillStyle = 'rgba(255,196,107,0.95)';
    g.fillRect(w * 0.10, h * 0.09, w * 0.11, h * 0.22);
    return c;
  }

  function makePedestalSprite(w, h) {
    var c = makeCanvas(w * dpr, h * dpr);
    var g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    /* ground shadow */
    var sh = g.createRadialGradient(w * 0.5, h * 0.968, 0, w * 0.5, h * 0.968, w * 0.74);
    sh.addColorStop(0, 'rgba(26,40,54,0.60)');
    sh.addColorStop(0.6, 'rgba(26,40,54,0.24)');
    sh.addColorStop(1, 'rgba(26,40,54,0)');
    g.fillStyle = sh;
    g.fillRect(0, h * 0.88, w, h * 0.12);

    /* base plate */
    rrect(g, w * 0.02, h * 0.878, w * 0.96, h * 0.098, w * 0.03);
    g.fillStyle = metal(g, h * 0.878, h * 0.976, '#b6c9d6', '#6f8797', '#2f4453');
    g.fill();
    g.strokeStyle = 'rgba(16,28,38,0.70)';
    g.lineWidth = Math.max(1, w * 0.014);
    g.stroke();

    /* column */
    poly(g, [[w * 0.22, h * 0.895], [w * 0.78, h * 0.895],
             [w * 0.66, h * 0.230], [w * 0.34, h * 0.230]]);
    g.fillStyle = metal(g, h * 0.23, h * 0.90, '#c3d6e3', '#7d94a5', '#394e60');
    g.fill();
    g.strokeStyle = 'rgba(16,28,38,0.70)';
    g.stroke();
    /* vertical highlight */
    g.fillStyle = 'rgba(226,242,252,0.28)';
    g.fillRect(w * 0.36, h * 0.250, w * 0.05, h * 0.640);

    /* hazard collar */
    hazard(g, w * 0.20, h * 0.636, w * 0.60, h * 0.112, w * 0.085,
      '#2d3c49', 'rgba(255,196,107,0.95)');

    /* turret */
    g.beginPath();
    g.arc(w * 0.5, h * 0.178, w * 0.27, Math.PI, TAU);
    g.fillStyle = metal(g, h * 0.02, h * 0.24, '#d3e4ef', '#8fa6b6', '#405569');
    g.fill();
    g.strokeStyle = 'rgba(16,28,38,0.75)';
    g.lineWidth = Math.max(1, w * 0.016);
    g.stroke();
    g.beginPath();
    g.arc(w * 0.5, h * 0.168, w * 0.215, Math.PI * 1.10, TAU - Math.PI * 0.10);
    g.strokeStyle = 'rgba(53,200,255,0.85)';
    g.lineWidth = Math.max(1.5, w * 0.045);
    g.stroke();
    return c;
  }

  function makeTrolleySprite(w, h) {
    var c = makeCanvas(w * dpr, h * dpr);
    var g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    rrect(g, 0, h * 0.14, w, h * 0.64, h * 0.16);
    g.fillStyle = metal(g, h * 0.14, h * 0.78, '#c9dbe7', '#7f96a6', '#36495a');
    g.fill();
    g.strokeStyle = 'rgba(14,26,36,0.80)';
    g.lineWidth = Math.max(1.5, h * 0.035);
    g.stroke();
    g.fillStyle = 'rgba(30,44,56,0.95)';
    g.beginPath();
    g.arc(w * 0.24, h * 0.14, h * 0.13, 0, TAU);
    g.fill();
    g.beginPath();
    g.arc(w * 0.76, h * 0.14, h * 0.13, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(255,196,107,0.95)';
    g.fillRect(w * 0.34, h * 0.32, w * 0.32, h * 0.13);
    g.fillStyle = 'rgba(53,200,255,0.90)';
    g.fillRect(w * 0.08, h * 0.60, w * 0.84, Math.max(1, h * 0.07));
    g.fillStyle = metal(g, h * 0.78, h, '#b6c9d6', '#72899a', '#33485a');
    g.fillRect(w * 0.34, h * 0.76, w * 0.32, h * 0.24);
    return c;
  }

  /* line cargo: an armour plate, a loose limb segment, a parts crate */
  function makePartSprite(w, h, kind) {
    var c = makeCanvas(w * dpr, h * dpr);
    var g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (kind === 1) {
      /* limb segment: a bar with a joint boss at each end */
      var th = h * 0.52, y0 = h * 0.24;
      rrect(g, 0, y0, w, th, th * 0.42);
      g.fillStyle = metal(g, y0, y0 + th, '#c4d7e4', '#7c93a4', '#364b5d');
      g.fill();
      g.strokeStyle = 'rgba(16,28,38,0.70)';
      g.lineWidth = Math.max(1, w * 0.016);
      g.stroke();
      g.beginPath();
      g.arc(w * 0.085, y0 + th * 0.5, th * 0.46, 0, TAU);
      g.fillStyle = '#6b8292';
      g.fill();
      g.beginPath();
      g.arc(w * 0.085, y0 + th * 0.5, th * 0.20, 0, TAU);
      g.fillStyle = 'rgba(22,36,48,0.85)';
      g.fill();
      g.beginPath();
      g.arc(w * 0.915, y0 + th * 0.5, th * 0.40, 0, TAU);
      g.fillStyle = '#6b8292';
      g.fill();
      g.fillStyle = 'rgba(246,253,255,0.55)';
      g.fillRect(w * 0.10, y0 + th * 0.08, w * 0.76, Math.max(1, th * 0.10));
      g.fillStyle = 'rgba(255,196,107,0.85)';
      g.fillRect(w * 0.44, y0 + th * 0.30, w * 0.12, th * 0.26);
      g.fillStyle = 'rgba(53,200,255,0.55)';
      g.fillRect(w * 0.12, y0 + th * 0.86, w * 0.72, Math.max(1, th * 0.07));
    } else if (kind === 2) {
      /* crate */
      rrect(g, 0, h * 0.10, w, h * 0.86, Math.min(w, h) * 0.06);
      g.fillStyle = metal(g, h * 0.10, h * 0.96, '#cfe0eb', '#8199aa', '#394e60');
      g.fill();
      g.strokeStyle = 'rgba(16,28,38,0.72)';
      g.lineWidth = Math.max(1, w * 0.020);
      g.stroke();
      g.fillStyle = 'rgba(30,46,58,0.45)';
      g.fillRect(w * 0.44, h * 0.10, w * 0.12, h * 0.86);
      g.fillStyle = 'rgba(246,253,255,0.50)';
      g.fillRect(w * 0.05, h * 0.16, w * 0.90, Math.max(1, h * 0.055));
      g.fillStyle = 'rgba(255,196,107,0.85)';
      g.fillRect(w * 0.60, h * 0.66, w * 0.26, h * 0.16);
    } else {
      /* armour plate, lying flat */
      poly(g, [[0, h * 0.62], [w * 0.10, h * 0.24], [w * 0.88, h * 0.16],
               [w, h * 0.54], [w * 0.94, h * 0.94], [w * 0.06, h * 0.98]]);
      g.fillStyle = metal(g, h * 0.16, h, '#cbdde9', '#7e95a6', '#35495b');
      g.fill();
      g.strokeStyle = 'rgba(16,28,38,0.72)';
      g.lineWidth = Math.max(1, w * 0.018);
      g.stroke();
      g.fillStyle = 'rgba(246,253,255,0.50)';
      poly(g, [[w * 0.10, h * 0.30], [w * 0.86, h * 0.22], [w * 0.86, h * 0.30], [w * 0.10, h * 0.38]]);
      g.fill();
      g.fillStyle = 'rgba(255,196,107,0.80)';
      g.fillRect(w * 0.20, h * 0.66, w * 0.30, h * 0.10);
      g.fillStyle = 'rgba(53,200,255,0.45)';
      g.fillRect(w * 0.60, h * 0.62, w * 0.26, h * 0.06);
    }
    return c;
  }

  function buildSprites() {
    S.spark = glow('255,206,140', 28, 0.12);
    S.sparkHot = glow('255,250,232', 22, 0.10);
    S.ember = glow('255,158,74', 24, 0.14);
    S.dust = glow('224,242,255', 24, 0.06);
    S.lampGlow = glow('206,232,252', 320, 0.16);
    S.torch = glow(C_ORANGE, 180, 0.16);
    S.torchHot = glow('255,244,218', 100, 0.12);
    S.furnGlow = glow(C_ORANGE, 440, 0.10);
    S.furnCore = glow('255,214,150', 260, 0.14);
    S.coreGlow = glow(C_CYAN, 230, 0.10);
    S.corner = makeCorner();

    S.th1 = Math.max(13, H * 0.050);
    S.th2 = Math.max(11, H * 0.043);
    S.linkA = makeLinkSprite(H * 0.235, S.th1);
    S.linkB = makeLinkSprite(H * 0.215, S.th2);
    S.linkC = makeLinkSprite(H * 0.120, Math.max(7, H * 0.022));
    S.linkD = makeLinkSprite(H * 0.105, Math.max(6, H * 0.019));

    S.ped = makePedestalSprite(Math.max(58, W * 0.054), Math.max(88, H * 0.168));
    S.trolley = makeTrolleySprite(Math.max(44, W * 0.040), Math.max(28, H * 0.050));
    S.torchHead = makeTorchSprite(Math.max(30, H * 0.076), Math.max(34, H * 0.086));
    S.torchHeadS = makeTorchSprite(Math.max(18, H * 0.044), Math.max(20, H * 0.050));

    S.parts = [];
    for (var i = 0; i < 3; i++) {
      S.parts.push(makePartSprite(Math.max(34, W * 0.046), Math.max(26, H * 0.062), i));
    }
  }

  /* ------------------------------------------------------- static hall */

  function drawCeiling(g) {
    var cy = L.ceilH;
    var grd = g.createLinearGradient(0, 0, 0, cy);
    grd.addColorStop(0.00, '#e4f1f9');
    grd.addColorStop(0.46, '#c4daE8'.toLowerCase());
    grd.addColorStop(1.00, '#9dbbcf');
    g.fillStyle = grd;
    g.fillRect(0, 0, W, cy);

    /* lamp array: two rows of short strips, the way a real hall is lit */
    var i, r, c;
    var lampW = W * 0.050, lampH = H * 0.016;
    g.globalCompositeOperation = 'lighter';
    for (r = 0; r < 2; r++) {
      for (c = 0; c < 7; c++) {
        var lx = W * (0.052 + c * 0.140);
        var ly = H * (0.018 + r * 0.040);
        g.globalAlpha = 0.05;
        g.fillStyle = '#cfe6f6';
        g.fillRect(lx - W * 0.050, ly - H * 0.026, lampW + W * 0.100, lampH + H * 0.052);
        g.globalAlpha = 1;
      }
    }
    g.globalCompositeOperation = 'source-over';

    for (r = 0; r < 2; r++) {
      for (c = 0; c < 7; c++) {
        var bx = W * (0.052 + c * 0.140);
        var by = H * (0.018 + r * 0.040);
        /* dark bezel so each lamp reads as a separate fitting */
        rrect(g, bx - Math.max(1, W * 0.002), by - Math.max(1, H * 0.004),
          lampW + Math.max(2, W * 0.004), lampH + Math.max(2, H * 0.008), lampH * 0.4);
        g.fillStyle = 'rgba(70,96,116,0.55)';
        g.fill();
        rrect(g, bx, by, lampW, lampH, lampH * 0.32);
        var lg = g.createLinearGradient(0, by, 0, by + lampH);
        lg.addColorStop(0.00, '#ffffff');
        lg.addColorStop(0.42, '#f3fbff');
        lg.addColorStop(1.00, '#bedcf1');
        g.fillStyle = lg;
        g.fill();
        g.fillStyle = 'rgba(96,132,160,0.40)';
        g.fillRect(bx + lampW * 0.485, by, Math.max(1, lampW * 0.03), lampH);
      }
    }
    /* baked bloom around the array */
    g.globalCompositeOperation = 'lighter';
    for (r = 0; r < 2; r++) {
      for (c = 0; c < 7; c++) {
        var gx = W * (0.052 + c * 0.140) + lampW * 0.5;
        var gy = H * (0.018 + r * 0.040) + lampH * 0.5;
        blitGlow(g, S.lampGlow, gx, gy, W * 0.115, 0.22);
      }
    }
    /* shafts of light falling from the front row */
    for (c = 0; c < 7; c++) {
      var sx = W * (0.052 + c * 0.140) + lampW * 0.5;
      var cone = g.createLinearGradient(0, L.ceilH, 0, L.floorY);
      cone.addColorStop(0.00, 'rgba(214,238,255,0.10)');
      cone.addColorStop(0.55, 'rgba(206,232,252,0.04)');
      cone.addColorStop(1.00, 'rgba(200,228,250,0)');
      g.fillStyle = cone;
      g.beginPath();
      g.moveTo(sx - W * 0.028, L.ceilH);
      g.lineTo(sx + W * 0.028, L.ceilH);
      g.lineTo(sx + W * 0.110, L.floorY);
      g.lineTo(sx - W * 0.110, L.floorY);
      g.closePath();
      g.fill();
    }
    g.globalCompositeOperation = 'source-over';

    /* heavy truss girder: dark, to give the top of the frame weight */
    var ty = cy - H * 0.040, th = H * 0.040;
    var tg = g.createLinearGradient(0, ty, 0, ty + th);
    tg.addColorStop(0.00, '#6c8494');
    tg.addColorStop(0.34, '#4b6271');
    tg.addColorStop(1.00, '#2b3b45');
    g.fillStyle = tg;
    g.fillRect(0, ty, W, th);
    g.fillStyle = 'rgba(236,248,255,0.32)';
    g.fillRect(0, ty, W, Math.max(1, H * 0.0035));
    g.strokeStyle = 'rgba(22,34,42,0.60)';
    g.lineWidth = Math.max(2, H * 0.0045);
    for (i = 0; i < 18; i++) {
      var ax = W * i / 18;
      g.beginPath();
      g.moveTo(ax, ty + th);
      g.lineTo(ax + W * 0.028, ty);
      g.stroke();
      g.beginPath();
      g.moveTo(ax + W * 0.028, ty);
      g.lineTo(ax + W * 0.056, ty + th);
      g.stroke();
    }
    /* two pipe runs just under the truss */
    for (i = 0; i < 2; i++) {
      var py = ty + th * (0.30 + i * 0.34);
      var pg = g.createLinearGradient(0, py - H * 0.006, 0, py + H * 0.006);
      pg.addColorStop(0, '#54707f');
      pg.addColorStop(0.32, '#c6d9e4');
      pg.addColorStop(1, '#2c3f4b');
      g.fillStyle = pg;
      g.fillRect(0, py - H * 0.006, W, H * 0.012);
    }
  }

  function drawWindows(g) {
    var y0 = H * 0.128, y1 = H * 0.298;
    var n = 5, gap = W * 0.022;
    var ww = (W * 0.660 - gap * (n - 1)) / n;
    var x0 = W * 0.170;
    for (var i = 0; i < n; i++) {
      var wx = x0 + i * (ww + gap);
      var wg = g.createLinearGradient(0, y0, 0, y1);
      wg.addColorStop(0.00, '#fcfdff');
      wg.addColorStop(0.46, '#e8f5fc');
      wg.addColorStop(1.00, '#b3d2e6');
      rrect(g, wx, y0, ww, y1 - y0, Math.max(2, W * 0.003));
      g.fillStyle = wg;
      g.fill();
      g.strokeStyle = 'rgba(56,80,98,0.70)';
      g.lineWidth = Math.max(3, W * 0.005);
      g.stroke();
      g.fillStyle = 'rgba(56,80,98,0.55)';
      g.fillRect(wx + ww * 0.5 - Math.max(1, W * 0.0018), y0, Math.max(1, W * 0.0036), y1 - y0);
      g.fillRect(wx, y0 + (y1 - y0) * 0.46, ww, Math.max(1, W * 0.0036));
      g.globalCompositeOperation = 'lighter';
      blitGlow(g, S.lampGlow, wx + ww * 0.5, y0 + (y1 - y0) * 0.38, ww * 2.1, 0.20);
      g.globalCompositeOperation = 'source-over';
    }
    /* sill */
    g.fillStyle = metal(g, y1, y1 + H * 0.018, '#bccfdc', '#7a91a2', '#41566a');
    g.fillRect(x0 - W * 0.010, y1, W * 0.680 + W * 0.020, H * 0.018);
    g.fillStyle = 'rgba(248,254,255,0.42)';
    g.fillRect(x0 - W * 0.010, y1, W * 0.680 + W * 0.020, Math.max(1, H * 0.003));
  }

  function drawRack(g) {
    /* parts rack against the left wall */
    var x0 = W * 0.014, w = W * 0.112;
    var y0 = H * 0.286, y1 = L.floorY;
    var i, k;
    var hg = g.createLinearGradient(x0, 0, x0 + w, 0);
    hg.addColorStop(0, 'rgba(96,120,138,0.62)');
    hg.addColorStop(1, 'rgba(58,78,94,0.62)');
    g.fillStyle = hg;
    g.fillRect(x0, y0, w, y1 - y0);
    g.fillStyle = 'rgba(28,42,54,0.65)';
    g.fillRect(x0, y0, w, H * 0.011);
    g.fillRect(x0, y0, Math.max(2, W * 0.005), y1 - y0);
    g.fillRect(x0 + w - Math.max(2, W * 0.005), y0, Math.max(2, W * 0.005), y1 - y0);
    /* uprights */
    for (i = 0; i < 3; i++) {
      g.fillStyle = 'rgba(44,62,78,0.75)';
      g.fillRect(x0 + w * (0.06 + i * 0.45), y0, Math.max(2, W * 0.006), y1 - y0);
    }
    for (i = 0; i < 3; i++) {
      var sy = y0 + (y1 - y0) * (0.28 + i * 0.245);
      g.fillStyle = metal(g, sy, sy + H * 0.016, '#c3d6e3', '#7d94a5', '#394e60');
      g.fillRect(x0, sy, w, H * 0.016);
      for (k = 0; k < 3; k++) {
        var bxp = x0 + w * (0.10 + k * 0.30), bw = w * 0.22;
        var bh = H * (0.032 + (k % 2) * 0.018);
        g.fillStyle = k % 2 ? 'rgba(150,172,190,0.96)' : 'rgba(180,202,218,0.96)';
        g.fillRect(bxp, sy - bh, bw, bh);
        g.fillStyle = 'rgba(38,54,68,0.40)';
        g.fillRect(bxp + bw * 0.40, sy - bh, Math.max(1, bw * 0.20), bh);
        g.fillStyle = 'rgba(53,200,255,' + (0.28 + k * 0.16) + ')';
        g.fillRect(bxp, sy - bh, bw, Math.max(1, H * 0.004));
      }
    }
    /* a finished limb segment leaning on the rack */
    var lx = x0 + w * 0.30, ly = y1 - H * 0.010;
    g.save();
    g.translate(lx, ly);
    g.rotate(-0.42);
    rrect(g, 0, -H * 0.016, W * 0.088, H * 0.032, H * 0.014);
    g.fillStyle = metal(g, -H * 0.016, H * 0.016, '#c8dbe7', '#7d94a5', '#394e60');
    g.fill();
    g.strokeStyle = 'rgba(16,28,38,0.70)';
    g.lineWidth = Math.max(1.5, W * 0.002);
    g.stroke();
    g.beginPath();
    g.arc(W * 0.010, 0, H * 0.020, 0, TAU);
    g.fillStyle = '#647b8c';
    g.fill();
    g.fillStyle = 'rgba(246,253,255,0.50)';
    g.fillRect(W * 0.020, -H * 0.010, W * 0.058, Math.max(1, H * 0.005));
    g.restore();
  }

  function drawBackWall(g) {
    var y0 = L.ceilH, y1 = L.floorY;
    var grd = g.createLinearGradient(0, y0, 0, y1);
    grd.addColorStop(0.00, '#cddee9');
    grd.addColorStop(0.38, '#b4cbd9');
    grd.addColorStop(1.00, '#95b0c3');
    g.fillStyle = grd;
    g.fillRect(0, y0, W, y1 - y0);

    /* vertical panel ribs */
    var i, n = 20;
    for (i = 0; i <= n; i++) {
      var x = W * i / n;
      g.strokeStyle = 'rgba(80,104,122,0.36)';
      g.lineWidth = Math.max(1, W * 0.0017);
      g.beginPath();
      g.moveTo(x, y0);
      g.lineTo(x, y1);
      g.stroke();
      g.strokeStyle = 'rgba(238,250,255,0.26)';
      g.beginPath();
      g.moveTo(x + Math.max(1, W * 0.0017), y0);
      g.lineTo(x + Math.max(1, W * 0.0017), y1);
      g.stroke();
    }
    g.fillStyle = 'rgba(88,112,130,0.28)';
    g.fillRect(0, H * 0.352, W, Math.max(2, H * 0.004));

    drawWindows(g);
    drawRack(g);

    /* wall pipes */
    var pipes = [0.243, 0.258, 0.735];
    for (i = 0; i < pipes.length; i++) {
      var px = W * pipes[i];
      var pg = g.createLinearGradient(px - W * 0.007, 0, px + W * 0.007, 0);
      pg.addColorStop(0.00, '#4c6574');
      pg.addColorStop(0.30, '#c8dae5');
      pg.addColorStop(0.60, '#7f96a6');
      pg.addColorStop(1.00, '#31485a');
      g.fillStyle = pg;
      g.fillRect(px - W * 0.007, y0, W * 0.014, y1 - y0);
      for (var k = 0; k < 5; k++) {
        g.fillStyle = 'rgba(44,62,78,0.65)';
        g.fillRect(px - W * 0.010, y0 + (y1 - y0) * (0.10 + k * 0.19), W * 0.020, H * 0.011);
      }
    }

    /* walkway beam with railing */
    var wy = H * 0.436, wh = H * 0.026;
    g.fillStyle = metal(g, wy, wy + wh, '#c2d5e2', '#7f96a7', '#3f5466');
    g.fillRect(0, wy, W, wh);
    g.fillStyle = 'rgba(242,252,255,0.40)';
    g.fillRect(0, wy, W, Math.max(1, H * 0.0035));
    g.strokeStyle = 'rgba(74,98,116,0.65)';
    g.lineWidth = Math.max(2, H * 0.0045);
    for (i = 0; i < 12; i++) {
      var bxx = W * (0.02 + i * 0.087);
      g.beginPath();
      g.moveTo(bxx, wy);
      g.lineTo(bxx, wy - H * 0.042);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(0, wy - H * 0.042);
    g.lineTo(W, wy - H * 0.042);
    g.stroke();

    /* shadow the crane casts on the wall below the beam */
    var sg = g.createLinearGradient(0, L.beamY + L.beamH, 0, L.beamY + L.beamH + H * 0.075);
    sg.addColorStop(0, 'rgba(40,58,72,0.30)');
    sg.addColorStop(1, 'rgba(40,58,72,0)');
    g.fillStyle = sg;
    g.fillRect(0, L.beamY + L.beamH, W, H * 0.075);

    /* floor-wall junction shadow */
    var jg = g.createLinearGradient(0, y1 - H * 0.055, 0, y1);
    jg.addColorStop(0, 'rgba(38,55,70,0)');
    jg.addColorStop(1, 'rgba(38,55,70,0.44)');
    g.fillStyle = jg;
    g.fillRect(0, y1 - H * 0.055, W, H * 0.055);
  }

  function drawFurnace(g) {
    var fw = L.furnW, fh = L.furnH;
    var x0 = L.furnX - fw * 0.5, y0 = L.floorY - fh;
    var i, k;

    /* dark housing so the mouth reads as an opening, not a sun */
    rrect(g, x0 - fw * 0.13, y0 - fh * 0.05, fw * 1.26, fh * 1.05, W * 0.006);
    g.fillStyle = metal(g, y0 - fh * 0.05, L.floorY, '#9db2c1', '#5f7585', '#26363f');
    g.fill();
    g.strokeStyle = 'rgba(14,24,32,0.85)';
    g.lineWidth = Math.max(2.5, W * 0.0026);
    g.stroke();

    /* panel seams + rivets */
    g.strokeStyle = 'rgba(16,28,38,0.55)';
    g.lineWidth = Math.max(1, W * 0.0015);
    for (i = 1; i < 4; i++) {
      g.beginPath();
      g.moveTo(x0 - fw * 0.13, y0 + fh * (i / 4));
      g.lineTo(x0 + fw * 1.13, y0 + fh * (i / 4));
      g.stroke();
    }
    for (i = 0; i < 2; i++) {
      for (k = 0; k < 8; k++) {
        g.beginPath();
        g.arc(x0 + fw * (0.02 + k * 0.145), y0 + fh * (0.075 + i * 0.80), W * 0.0034, 0, TAU);
        g.fillStyle = 'rgba(30,44,56,0.85)';
        g.fill();
      }
    }

    /* arched mouth */
    var mx = x0 + fw * 0.14, mw = fw * 0.72;
    var my = y0 + fh * 0.20, mh = fh * 0.50;
    var archR = mw * 0.5;
    g.save();
    g.beginPath();
    g.moveTo(mx, my + mh);
    g.lineTo(mx, my + archR);
    g.arc(mx + archR, my + archR, archR, Math.PI, TAU);
    g.lineTo(mx + mw, my + mh);
    g.closePath();
    var mg = g.createRadialGradient(mx + mw * 0.5, my + mh * 0.86, mh * 0.05,
      mx + mw * 0.5, my + mh * 0.74, mw * 0.95);
    mg.addColorStop(0.00, '#fff8e8');
    mg.addColorStop(0.14, '#ffd99f');
    mg.addColorStop(0.34, '#ff9d4c');
    mg.addColorStop(0.60, '#d4551a');
    mg.addColorStop(0.84, '#77260a');
    mg.addColorStop(1.00, '#3b1203');
    g.fillStyle = mg;
    g.fill();
    g.clip();
    var pool = g.createLinearGradient(0, my + mh * 0.60, 0, my + mh);
    pool.addColorStop(0, 'rgba(255,240,200,0.98)');
    pool.addColorStop(0.42, 'rgba(255,164,76,0.60)');
    pool.addColorStop(1, 'rgba(158,48,6,0.12)');
    g.fillStyle = pool;
    g.fillRect(mx, my + mh * 0.54, mw, mh * 0.46);
    g.strokeStyle = 'rgba(255,246,220,0.55)';
    g.lineWidth = Math.max(1.5, H * 0.0026);
    for (i = 0; i < 3; i++) {
      var ry = my + mh * (0.70 + i * 0.090);
      g.beginPath();
      g.moveTo(mx + mw * 0.08, ry);
      g.quadraticCurveTo(mx + mw * 0.5, ry - mh * 0.026, mx + mw * 0.92, ry);
      g.stroke();
    }
    g.restore();

    /* grate bars */
    g.strokeStyle = 'rgba(32,44,54,0.92)';
    g.lineWidth = Math.max(3, W * 0.006);
    for (i = 1; i < 5; i++) {
      var gx = mx + mw * (i / 5);
      g.beginPath();
      g.moveTo(gx, my + archR * 0.50);
      g.lineTo(gx, my + mh * 0.98);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(mx + mw * 0.02, my + archR * 1.04);
    g.lineTo(mx + mw * 0.98, my + archR * 1.04);
    g.stroke();

    /* mouth rim highlight */
    g.strokeStyle = 'rgba(206,228,242,0.45)';
    g.lineWidth = Math.max(2, W * 0.0032);
    g.beginPath();
    g.moveTo(mx, my + mh);
    g.lineTo(mx, my + archR);
    g.arc(mx + archR, my + archR, archR, Math.PI, TAU);
    g.lineTo(mx + mw, my + mh);
    g.stroke();

    /* hood + duct up through the ceiling */
    poly(g, [[x0 - fw * 0.13, y0 - fh * 0.05],
             [x0 + fw * 1.13, y0 - fh * 0.05],
             [x0 + fw * 0.96, y0 - fh * 0.32],
             [x0 + fw * 0.04, y0 - fh * 0.32]]);
    g.fillStyle = metal(g, y0 - fh * 0.32, y0 - fh * 0.05, '#a9bfcd', '#6f8697', '#2f4453');
    g.fill();
    g.strokeStyle = 'rgba(14,24,32,0.75)';
    g.lineWidth = Math.max(2, W * 0.0022);
    g.stroke();

    /* ladder + gauges + pipework so the housing is not one flat slab */
    var ldx = x0 - fw * 0.055;
    g.strokeStyle = 'rgba(196,220,238,0.65)';
    g.lineWidth = Math.max(2, W * 0.0024);
    g.beginPath();
    g.moveTo(ldx, y0 + fh * 0.18);
    g.lineTo(ldx, y0 + fh * 0.96);
    g.moveTo(ldx + fw * 0.085, y0 + fh * 0.18);
    g.lineTo(ldx + fw * 0.085, y0 + fh * 0.96);
    g.stroke();
    g.lineWidth = Math.max(1.5, W * 0.0018);
    for (i = 0; i < 6; i++) {
      var lyy = y0 + fh * (0.24 + i * 0.125);
      g.beginPath();
      g.moveTo(ldx, lyy);
      g.lineTo(ldx + fw * 0.085, lyy);
      g.stroke();
    }
    /* gauge cluster */
    for (i = 0; i < 3; i++) {
      var ggx = x0 + fw * (0.03 + i * 0.075), ggy = y0 + fh * 0.135;
      g.beginPath();
      g.arc(ggx, ggy, fw * 0.026, 0, TAU);
      g.fillStyle = 'rgba(226,240,250,0.92)';
      g.fill();
      g.strokeStyle = 'rgba(20,34,44,0.85)';
      g.lineWidth = Math.max(1.5, W * 0.0018);
      g.stroke();
      g.beginPath();
      g.moveTo(ggx, ggy);
      g.lineTo(ggx + fw * 0.014, ggy - fh * 0.014);
      g.strokeStyle = 'rgba(196,74,26,0.95)';
      g.stroke();
    }
    /* vertical standpipe on the right edge of the housing */
    var spw = fw * 0.055;
    var spg = g.createLinearGradient(x0 + fw * 1.13 - spw, 0, x0 + fw * 1.13, 0);
    spg.addColorStop(0.00, '#2b3e4c');
    spg.addColorStop(0.34, '#c4d7e4');
    spg.addColorStop(1.00, '#33485a');
    g.fillStyle = spg;
    g.fillRect(x0 + fw * 1.13 - spw, y0 - fh * 0.05, spw, fh * 1.01);
    for (i = 0; i < 4; i++) {
      g.fillStyle = 'rgba(26,40,50,0.70)';
      g.fillRect(x0 + fw * 1.13 - spw * 1.2, y0 + fh * (0.10 + i * 0.24), spw * 1.4, H * 0.010);
    }
    /* amber warning placard on the housing */
    g.fillStyle = 'rgba(255,196,107,0.85)';
    g.fillRect(x0 + fw * 0.06, y0 + fh * 0.44, fw * 0.075, fh * 0.075);
    g.fillStyle = 'rgba(26,40,50,0.75)';
    g.fillRect(x0 + fw * 0.078, y0 + fh * 0.462, fw * 0.016, fh * 0.040);

    g.fillStyle = metal(g, 0, y0 - fh * 0.32, '#9db2c1', '#6b8293', '#2b3f4d');
    g.fillRect(x0 + fw * 0.24, L.ceilH, fw * 0.52, y0 - fh * 0.32 - L.ceilH);
    g.fillStyle = 'rgba(255,196,107,0.45)';
    g.fillRect(x0 + fw * 0.24, y0 - fh * 0.46, fw * 0.52, Math.max(1.5, H * 0.004));
    for (i = 0; i < 3; i++) {
      g.fillStyle = 'rgba(38,54,66,0.65)';
      g.fillRect(x0 + fw * 0.22, L.ceilH + (y0 - fh * 0.32 - L.ceilH) * (0.18 + i * 0.28), fw * 0.56, H * 0.010);
    }

    /* pour spout on the left flank, molten stream running down */
    var spx = x0 - fw * 0.12, spy = y0 + fh * 0.50;
    poly(g, [[spx, spy], [spx - fw * 0.14, spy - fh * 0.015],
             [spx - fw * 0.14, spy + fh * 0.055], [spx, spy + fh * 0.085]]);
    g.fillStyle = metal(g, spy - fh * 0.015, spy + fh * 0.085, '#b6c9d6', '#6b8293', '#2d4050');
    g.fill();
    g.strokeStyle = 'rgba(14,24,32,0.70)';
    g.stroke();
    g.fillStyle = 'rgba(255,206,140,0.92)';
    g.fillRect(spx - fw * 0.155, spy + fh * 0.03, fw * 0.033, fh * 0.28);
    g.fillStyle = 'rgba(255,248,226,0.88)';
    g.fillRect(spx - fw * 0.150, spy + fh * 0.03, fw * 0.011, fh * 0.28);

    /* baked light spill: warm wash on wall / floor around the mouth */
    g.globalCompositeOperation = 'lighter';
    blitGlow(g, S.furnGlow, L.furnX, y0 + fh * 0.42, fw * 3.0, 0.42);
    blitGlow(g, S.furnCore, L.furnX, y0 + fh * 0.44, fw * 1.15, 0.38);
    /* broad warm wash running left off the furnace, so the hot side of the
       hall reads warm against the cool lamp side */
    var warm = g.createLinearGradient(L.furnX - fw * 2.10, 0, L.furnX + fw * 0.55, 0);
    warm.addColorStop(0.00, 'rgba(255,140,64,0)');
    warm.addColorStop(0.42, 'rgba(255,146,70,0.10)');
    warm.addColorStop(0.78, 'rgba(255,158,80,0.17)');
    warm.addColorStop(1.00, 'rgba(255,176,96,0.24)');
    g.fillStyle = warm;
    g.fillRect(L.furnX - fw * 2.10, 0, W - (L.furnX - fw * 2.10), H);
    g.globalCompositeOperation = 'source-over';
  }

  function drawGantry(g) {
    var i;
    var legs = [L.legLx, L.legRx];
    var lw = Math.max(16, W * 0.020);
    for (i = 0; i < 2; i++) {
      var lx = legs[i];
      rrect(g, lx - lw * 0.5, L.beamY + L.beamH * 0.62, lw, L.floorY - L.beamY - L.beamH * 0.62, W * 0.004);
      g.fillStyle = metal(g, L.beamY, L.floorY, '#bccfdc', '#6f8797', '#2f4453');
      g.fill();
      g.strokeStyle = 'rgba(14,24,32,0.85)';
      g.lineWidth = Math.max(2, W * 0.0024);
      g.stroke();
      g.strokeStyle = 'rgba(238,250,255,0.34)';
      g.lineWidth = Math.max(1.5, W * 0.002);
      g.beginPath();
      g.moveTo(lx - lw * 0.28, L.beamY + L.beamH);
      g.lineTo(lx - lw * 0.28, L.floorY - H * 0.02);
      g.stroke();
      hazard(g, lx - lw * 0.64, L.floorY - H * 0.092, lw * 1.28, H * 0.036, W * 0.014,
        '#2a3844', 'rgba(255,196,107,0.95)');
      rrect(g, lx - lw * 0.92, L.floorY - H * 0.016, lw * 1.84, H * 0.028, W * 0.004);
      g.fillStyle = metal(g, L.floorY - H * 0.016, L.floorY + H * 0.012, '#aec3d1', '#6b8293', '#2c4050');
      g.fill();
      g.strokeStyle = 'rgba(14,24,32,0.70)';
      g.stroke();
    }

    /* main beam */
    var by = L.beamY, bh = L.beamH;
    var bx0 = L.legLx - W * 0.030, bw = (L.legRx + W * 0.030) - bx0;
    rrect(g, bx0, by, bw, bh, bh * 0.12);
    g.fillStyle = metal(g, by, by + bh, '#c8dae6', '#758c9d', '#2d4251');
    g.fill();
    g.strokeStyle = 'rgba(14,24,32,0.85)';
    g.lineWidth = Math.max(2.5, W * 0.0024);
    g.stroke();
    /* rail on top */
    g.fillStyle = 'rgba(46,64,80,0.90)';
    g.fillRect(bx0 + W * 0.004, by - Math.max(3, H * 0.010), bw - W * 0.008, Math.max(3, H * 0.011));
    /* catch light + web shadow */
    g.fillStyle = 'rgba(244,253,255,0.65)';
    g.fillRect(bx0 + W * 0.010, by + Math.max(1, bh * 0.06), bw - W * 0.020, Math.max(1, bh * 0.075));
    g.fillStyle = 'rgba(14,26,36,0.42)';
    g.fillRect(bx0 + W * 0.010, by + bh * 0.78, bw - W * 0.020, Math.max(1, bh * 0.14));
    g.strokeStyle = 'rgba(30,46,58,0.32)';
    g.lineWidth = Math.max(1, W * 0.0017);
    for (i = 1; i < 18; i++) {
      var rx = bx0 + bw * (i / 18);
      g.beginPath();
      g.moveTo(rx, by + bh * 0.14);
      g.lineTo(rx, by + bh * 0.82);
      g.stroke();
    }
    g.fillStyle = 'rgba(53,200,255,0.72)';
    g.fillRect(bx0 + W * 0.012, by + bh * 0.90, bw - W * 0.024, Math.max(1.5, bh * 0.06));
    for (i = 0; i < 6; i++) {
      g.fillStyle = 'rgba(255,196,107,0.85)';
      g.fillRect(bx0 + bw * (0.12 + i * 0.150), by + bh * 0.28, W * 0.014, bh * 0.16);
    }
    /* end trucks */
    for (i = 0; i < 2; i++) {
      var ex = legs[i] - lw * 0.90;
      rrect(g, ex, by - H * 0.012, lw * 1.80, bh + H * 0.030, W * 0.004);
      g.fillStyle = metal(g, by - H * 0.012, by + bh + H * 0.018, '#bccfdc', '#6f8797', '#2c4050');
      g.fill();
      g.strokeStyle = 'rgba(14,24,32,0.80)';
      g.stroke();
    }
  }

  function drawFloor(g) {
    var i;
    var fy = L.floorY;
    var grd = g.createLinearGradient(0, fy, 0, H);
    grd.addColorStop(0.00, '#b8cdda');
    grd.addColorStop(0.22, '#a9c0cf');
    grd.addColorStop(0.62, '#98afc1');
    grd.addColorStop(1.00, '#8399ab');
    g.fillStyle = grd;
    g.fillRect(0, fy, W, H - fy);

    /* polished sheen at the horizon */
    var hz = g.createLinearGradient(0, fy, 0, fy + H * 0.036);
    hz.addColorStop(0, 'rgba(246,253,255,0.92)');
    hz.addColorStop(1, 'rgba(246,253,255,0)');
    g.fillStyle = hz;
    g.fillRect(0, fy, W, H * 0.036);

    /* slab joints */
    var vpx = W * 0.5, vpy = fy - H * 0.012;
    g.strokeStyle = 'rgba(84,106,124,0.30)';
    g.lineWidth = Math.max(1, W * 0.0015);
    for (i = -9; i <= 9; i++) {
      var xb = W * 0.5 + i * W * 0.155;
      g.beginPath();
      g.moveTo(xb, H);
      g.lineTo(vpx + (xb - vpx) * 0.10, vpy);
      g.stroke();
    }
    for (i = 1; i <= 5; i++) {
      var yy = fy + (H - fy) * Math.pow(i / 5, 1.7);
      g.strokeStyle = 'rgba(84,106,124,' + (0.10 + i * 0.032) + ')';
      g.beginPath();
      g.moveTo(0, yy);
      g.lineTo(W, yy);
      g.stroke();
    }

    /* baked reflections off the polished floor */
    g.globalCompositeOperation = 'lighter';
    for (i = 0; i < 7; i++) {
      var bx = W * (0.052 + i * 0.140) + W * 0.025;
      g.globalAlpha = 0.17;
      g.drawImage(S.lampGlow, bx - W * 0.075, fy - H * 0.020, W * 0.150, H * 0.190);
      g.globalAlpha = 0.10;
      g.drawImage(S.lampGlow, bx - W * 0.048, fy + H * 0.036, W * 0.096, H * 0.150);
    }
    g.globalAlpha = 0.44;
    g.drawImage(S.furnGlow, L.furnX - W * 0.140, fy - H * 0.036, W * 0.280, H * 0.340);
    g.globalAlpha = 0.30;
    g.drawImage(S.furnCore, L.furnX - W * 0.082, fy - H * 0.014, W * 0.164, H * 0.240);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';

    /* hazard paint on the floor: one restrained band, nothing shouty */
    g.fillStyle = 'rgba(52,70,86,0.55)';
    g.fillRect(0, H * 0.858, W, H * 0.030);
    hazard(g, 0, H * 0.860, W, H * 0.020, W * 0.024, '#3d4d5c', 'rgba(255,186,102,0.72)');
    hazard(g, 0, H * 0.907, W, H * 0.009, W * 0.024, '#3d4d5c', 'rgba(255,186,102,0.55)');
    g.fillStyle = 'rgba(53,200,255,0.26)';
    g.fillRect(0, H * 0.836, W, Math.max(1.5, H * 0.0035));

    /* painted floor markings on the walkway behind the line */
    g.strokeStyle = 'rgba(53,200,255,0.30)';
    g.lineWidth = Math.max(1.5, H * 0.0035);
    for (i = 0; i < 22; i++) {
      var dsx = W * (0.03 + i * 0.045);
      if (i === 5 || i === 15) { continue; }
      g.beginPath();
      g.moveTo(dsx, H * 0.818);
      g.lineTo(dsx + W * 0.022, H * 0.818);
      g.stroke();
    }
    /* the floor falls away into shadow at the bottom of frame */
    var bot = g.createLinearGradient(0, H * 0.900, 0, H);
    bot.addColorStop(0, 'rgba(38,55,70,0)');
    bot.addColorStop(1, 'rgba(38,55,70,0.34)');
    g.fillStyle = bot;
    g.fillRect(0, H * 0.900, W, H * 0.100);

    /* drawLine, then the soft shadow the hanging hull drops on the line */
    drawLine(g);
    var hs = g.createRadialGradient(W * 0.5, L.convTop + H * 0.006, 0,
      W * 0.5, L.convTop + H * 0.006, W * 0.185);
    hs.addColorStop(0.00, 'rgba(24,38,52,0.52)');
    hs.addColorStop(0.55, 'rgba(24,38,52,0.24)');
    hs.addColorStop(1.00, 'rgba(24,38,52,0)');
    g.fillStyle = hs;
    g.fillRect(W * 0.30, L.convTop - H * 0.030, W * 0.40, H * 0.070);

    drawPedestals(g);
  }

  function drawLine(g) {
    var i;
    var x0 = W * 0.014, x1 = W * 0.986, w = x1 - x0;
    var top = L.convTop, bot = L.convBot, h = bot - top;

    var shg = g.createLinearGradient(0, bot, 0, bot + H * 0.044);
    shg.addColorStop(0, 'rgba(28,44,58,0.50)');
    shg.addColorStop(1, 'rgba(28,44,58,0)');
    g.fillStyle = shg;
    g.fillRect(x0 - W * 0.01, bot, w + W * 0.02, H * 0.044);

    for (i = 0; i <= 7; i++) {
      var lx = x0 + w * (i / 7);
      g.fillStyle = metal(g, bot, H * 0.822, '#96adbd', '#677e8f', '#2f4353');
      g.fillRect(lx - W * 0.007, bot, W * 0.014, H * 0.028);
      g.fillStyle = 'rgba(30,46,58,0.70)';
      g.fillRect(lx - W * 0.012, H * 0.818, W * 0.024, H * 0.007);
    }

    /* belt: flat top deck, dark skirt, no soft cylinder read */
    rrect(g, x0, top, w, h, Math.min(h * 0.10, W * 0.004));
    var body = g.createLinearGradient(0, top, 0, bot);
    body.addColorStop(0.00, '#8ea6b6');
    body.addColorStop(0.26, '#54697b');
    body.addColorStop(0.70, '#33475a');
    body.addColorStop(1.00, '#1f2f3c');
    g.fillStyle = body;
    g.fill();
    g.strokeStyle = 'rgba(12,22,30,0.90)';
    g.lineWidth = Math.max(2.5, W * 0.0026);
    g.stroke();

    /* running surface */
    var surf = top + h * 0.10, surfH = h * 0.34;
    var sg = g.createLinearGradient(0, surf, 0, surf + surfH);
    sg.addColorStop(0, '#f2faff');
    sg.addColorStop(0.42, '#cfe0eb');
    sg.addColorStop(1, '#93aabc');
    g.fillStyle = sg;
    g.fillRect(x0 + w * 0.004, surf, w - w * 0.008, surfH);
    g.strokeStyle = 'rgba(78,100,118,0.38)';
    g.lineWidth = Math.max(1, W * 0.0014);
    for (i = 0; i < 80; i++) {
      var sx = x0 + w * (i / 80) + W * 0.004;
      g.beginPath();
      g.moveTo(sx, surf);
      g.lineTo(sx + w * 0.007, surf + surfH);
      g.stroke();
    }
    /* bright lip along the belt edge */
    g.fillStyle = 'rgba(53,200,255,0.55)';
    g.fillRect(x0 + w * 0.004, surf - Math.max(1.5, h * 0.030), w - w * 0.008, Math.max(1.5, h * 0.030));

    /* dark skirt under the deck, with a single warning placard */
    g.fillStyle = 'rgba(16,28,38,0.55)';
    g.fillRect(x0 + w * 0.010, surf + surfH + h * 0.06, w - w * 0.020, h * 0.46);
    for (i = 0; i < 12; i++) {
      var vx = x0 + w * (0.03 + i * 0.080);
      g.fillStyle = 'rgba(126,150,168,0.26)';
      g.fillRect(vx, surf + surfH + h * 0.11, W * 0.020, h * 0.34);
    }
    g.fillStyle = 'rgba(255,186,102,0.72)';
    g.fillRect(x0 + w * 0.452, surf + surfH + h * 0.16, W * 0.070, h * 0.22);
    g.fillStyle = 'rgba(26,40,50,0.80)';
    g.fillRect(x0 + w * 0.482, surf + surfH + h * 0.20, W * 0.012, h * 0.14);

    /* side rails + end caps */
    g.fillStyle = metal(g, surf, surf + surfH, '#c2d6e3', '#7a91a2', '#2f4453');
    g.fillRect(x0 - W * 0.004, top + h * 0.02, W * 0.016, h * 0.96);
    g.fillRect(x1 - W * 0.012, top + h * 0.02, W * 0.016, h * 0.96);
    g.fillStyle = 'rgba(255,196,107,0.92)';
    g.fillRect(x0 - W * 0.004, top + h * 0.02, W * 0.016, Math.max(2.5, h * 0.14));
    g.fillRect(x1 - W * 0.012, top + h * 0.02, W * 0.016, Math.max(2.5, h * 0.14));
    g.fillStyle = 'rgba(232,248,255,0.45)';
    g.fillRect(x0 + w * 0.004, top + h * 0.02, w - w * 0.008, Math.max(1, h * 0.035));
  }

  function drawPedestals(g) {
    var i;
    var pw = S.ped.width / dpr, ph = S.ped.height / dpr;
    for (i = 0; i < arms.length; i++) {
      var a = arms[i];
      var dw = pw * (a.big ? 1 : 0.56), dh = ph * (a.big ? 1 : 0.56);
      g.drawImage(S.ped, a.bx - dw * 0.5, a.by - dh * 0.18, dw, dh);
    }
  }

  /* -------------------------------------------------------- mech hull */

  function makeMech() {
    var mw = L.mechW, mh = L.mechH;
    var c = makeCanvas(mw * dpr, mh * dpr);
    var g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.lineJoin = 'round';
    g.lineCap = 'round';

    var cx = mw * 0.5;
    var i, k;
    var lw = Math.max(1, mw * 0.005);
    var edge = 'rgba(14,26,36,0.80)';

    function plate(pts, a, b, cc) {
      var ys = [], j;
      for (j = 0; j < pts.length; j++) { ys.push(pts[j][1]); }
      var y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
      poly(g, pts);
      g.fillStyle = metal(g, y0, y1, a, b, cc);
      g.fill();
      g.strokeStyle = edge;
      g.lineWidth = lw;
      g.stroke();
      g.save();
      poly(g, pts);
      g.clip();
      g.fillStyle = 'rgba(244,253,255,0.34)';
      g.fillRect(0, y0, mw, Math.max(1, mh * 0.008));
      g.fillStyle = 'rgba(10,20,30,0.26)';
      g.fillRect(0, y1 - mh * 0.010, mw, Math.max(1, mh * 0.010));
      g.restore();
    }

    function bolt(x, y, r) {
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.fillStyle = 'rgba(26,40,52,0.92)';
      g.fill();
      g.beginPath();
      g.arc(x - r * 0.26, y - r * 0.26, r * 0.48, 0, TAU);
      g.fillStyle = 'rgba(214,234,246,0.70)';
      g.fill();
    }

    /* ================= 1. suspension: master link + sling straps ========= */
    /* spine mast behind the hull */
    plate([[cx - mw * 0.048, mh * 0.070], [cx + mw * 0.048, mh * 0.070],
           [cx + mw * 0.040, mh * 0.330], [cx - mw * 0.040, mh * 0.330]],
      '#93a9b8', '#5c7282', '#2c3f4d');
    /* master link plate */
    plate([[cx - mw * 0.030, mh * 0.008], [cx + mw * 0.030, mh * 0.008],
           [cx + mw * 0.026, mh * 0.082], [cx - mw * 0.026, mh * 0.082]],
      '#d2e4ef', '#8399a9', '#3b4f60');
    g.beginPath();
    g.arc(cx, mh * 0.030, mw * 0.017, 0, TAU);
    g.fillStyle = 'rgba(16,28,38,0.90)';
    g.fill();
    g.lineWidth = Math.max(2, mw * 0.007);
    g.strokeStyle = 'rgba(206,228,242,0.75)';
    g.stroke();
    /* two sling straps down to the hull shoulders */
    for (i = 0; i < 2; i++) {
      var dir = i === 0 ? -1 : 1;
      poly(g, [[cx + dir * mw * 0.010, mh * 0.070],
               [cx + dir * mw * 0.038, mh * 0.070],
               [cx + dir * mw * 0.196, mh * 0.196],
               [cx + dir * mw * 0.160, mh * 0.208]]);
      g.fillStyle = metal(g, mh * 0.070, mh * 0.208, '#c6d9e6', '#7c93a3', '#34485a');
      g.fill();
      g.strokeStyle = edge;
      g.lineWidth = lw;
      g.stroke();
      g.beginPath();
      g.arc(cx + dir * mw * 0.180, mh * 0.202, mw * 0.019, 0, TAU);
      g.fillStyle = '#4b6273';
      g.fill();
      g.strokeStyle = edge;
      g.stroke();
    }

    /* ================= 2. main hull ====================================== */
    plate([[cx - mw * 0.184, mh * 0.208], [cx + mw * 0.184, mh * 0.208],
           [cx + mw * 0.224, mh * 0.296], [cx + mw * 0.244, mh * 0.404],
           [cx + mw * 0.228, mh * 0.556], [cx + mw * 0.198, mh * 0.700],
           [cx + mw * 0.128, mh * 0.762], [cx - mw * 0.128, mh * 0.762],
           [cx - mw * 0.198, mh * 0.700], [cx - mw * 0.228, mh * 0.556],
           [cx - mw * 0.244, mh * 0.404], [cx - mw * 0.224, mh * 0.296]],
      '#b6cad8', '#6f8797', '#2b3e4e');

    /* top deck lip, wider than the shoulders so it reads as rigging */
    plate([[cx - mw * 0.208, mh * 0.196], [cx + mw * 0.208, mh * 0.196],
           [cx + mw * 0.196, mh * 0.234], [cx - mw * 0.196, mh * 0.234]],
      '#d8e9f3', '#93a9b9', '#3f5465');
    g.fillStyle = 'rgba(255,196,107,0.92)';
    g.fillRect(cx - mw * 0.150, mh * 0.205, mw * 0.058, mh * 0.012);
    g.fillRect(cx + mw * 0.045, mh * 0.205, mw * 0.058, mh * 0.012);

    /* ---- shoulder sockets: big open rings where arms will bolt on ---- */
    for (i = 0; i < 2; i++) {
      var sgn = i === 0 ? -1 : 1;
      var sx = cx + sgn * mw * 0.226, sy = mh * 0.400;
      /* mounting boss */
      g.beginPath();
      g.arc(sx, sy, mw * 0.062, 0, TAU);
      g.fillStyle = metal(g, sy - mw * 0.062, sy + mw * 0.062, '#b9cddb', '#6d8495', '#2c4050');
      g.fill();
      g.strokeStyle = edge;
      g.lineWidth = lw;
      g.stroke();
      /* socket hole */
      g.beginPath();
      g.arc(sx, sy, mw * 0.036, 0, TAU);
      g.fillStyle = '#141f29';
      g.fill();
      g.strokeStyle = 'rgba(196,222,238,0.60)';
      g.lineWidth = Math.max(1.5, mw * 0.007);
      g.stroke();
      /* cyan status ring */
      g.beginPath();
      g.arc(sx, sy, mw * 0.049, Math.PI * 1.12, TAU - Math.PI * 0.12);
      g.strokeStyle = 'rgba(53,200,255,0.80)';
      g.lineWidth = Math.max(1.5, mw * 0.008);
      g.stroke();
      /* bolts around the boss */
      for (k = 0; k < 6; k++) {
        var ba = TAU * k / 6 + 0.4;
        bolt(sx + Math.cos(ba) * mw * 0.056, sy + Math.sin(ba) * mw * 0.056, mw * 0.008);
      }
    }
    /* left socket still has two bare rods sticking out of it */
    g.fillStyle = '#d3e5f0';
    g.fillRect(cx - mw * 0.300, mh * 0.396, mw * 0.070, mh * 0.013);
    g.fillRect(cx - mw * 0.306, mh * 0.418, mw * 0.062, mh * 0.011);
    g.fillStyle = 'rgba(255,196,107,0.85)';
    g.fillRect(cx - mw * 0.306, mh * 0.410, mw * 0.026, mh * 0.008);

    /* ---- chest cavity: an open, braced bay with pipework in it. It must
       never read as a screen or a face, so the glow is dim and broken up by
       pipes, a diagonal brace and a heavy rim. ---- */
    var qx = cx - mw * 0.150, qw = mw * 0.210;
    var qy = mh * 0.302, qh = mh * 0.256;
    rrect(g, qx, qy, qw, qh, mw * 0.010);
    g.fillStyle = '#16222c';
    g.fill();
    g.strokeStyle = 'rgba(8,16,24,0.92)';
    g.lineWidth = lw;
    g.stroke();
    g.save();
    rrect(g, qx, qy, qw, qh, mw * 0.010);
    g.clip();
    /* internal ribs */
    for (i = 0; i < 4; i++) {
      g.fillStyle = 'rgba(104,132,150,' + (0.58 - i * 0.10) + ')';
      g.fillRect(qx, qy + qh * (0.06 + i * 0.245), qw, Math.max(1, qh * 0.042));
    }
    /* big pipes crossing the bay: the strongest shape in there */
    for (i = 0; i < 2; i++) {
      var ppx = qx + qw * (0.14 + i * 0.56);
      var ppw = Math.max(3, qw * 0.115);
      var pg2 = g.createLinearGradient(ppx, 0, ppx + ppw, 0);
      pg2.addColorStop(0.00, '#2b3d4b');
      pg2.addColorStop(0.35, '#b3c8d6');
      pg2.addColorStop(0.70, '#6d8495');
      pg2.addColorStop(1.00, '#22323f');
      g.fillStyle = pg2;
      g.fillRect(ppx, qy, ppw, qh);
      /* swaged collars */
      g.fillStyle = 'rgba(24,38,48,0.75)';
      g.fillRect(ppx - ppw * 0.16, qy + qh * 0.30, ppw * 1.32, Math.max(2, qh * 0.030));
      g.fillRect(ppx - ppw * 0.16, qy + qh * 0.64, ppw * 1.32, Math.max(2, qh * 0.030));
    }
    /* diagonal brace across the bay */
    g.strokeStyle = 'rgba(178,202,218,0.55)';
    g.lineWidth = Math.max(2.5, mw * 0.013);
    g.beginPath();
    g.moveTo(qx, qy + qh * 0.10);
    g.lineTo(qx + qw, qy + qh * 0.88);
    g.stroke();
    /* dim working light deep inside, tucked behind the pipes */
    g.globalCompositeOperation = 'lighter';
    blitGlow(g, S.coreGlow, qx + qw * 0.34, qy + qh * 0.52, qw * 1.15, 0.36);
    g.globalCompositeOperation = 'source-over';
    /* two short glow strips, low and off to one side */
    for (i = 0; i < 2; i++) {
      var sy2 = qy + qh * (0.60 + i * 0.170);
      g.fillStyle = 'rgba(126,222,250,0.72)';
      g.fillRect(qx + qw * 0.60, sy2, qw * 0.30, Math.max(2, qh * 0.048));
      g.fillStyle = 'rgba(232,251,255,0.80)';
      g.fillRect(qx + qw * 0.64, sy2 + qh * 0.012, qw * 0.18, Math.max(1, qh * 0.016));
    }
    g.restore();
    /* heavy cavity rim with corner plates */
    g.strokeStyle = 'rgba(196,222,236,0.42)';
    g.lineWidth = Math.max(2, mw * 0.012);
    rrect(g, qx - mw * 0.008, qy - mh * 0.006, qw + mw * 0.016, qh + mh * 0.012, mw * 0.014);
    g.stroke();
    g.fillStyle = 'rgba(150,176,194,0.65)';
    for (i = 0; i < 4; i++) {
      var ccx = qx + (i % 2) * qw;
      var ccy = qy + ((i >> 1) ? qh : 0);
      g.fillRect(ccx - mw * 0.012, ccy - mh * 0.006, mw * 0.024, mh * 0.012);
    }

    /* ---- right flank armour + warning panel (asymmetry) ---- */
    plate([[cx + mw * 0.070, mh * 0.300], [cx + mw * 0.226, mh * 0.306],
           [cx + mw * 0.232, mh * 0.470], [cx + mw * 0.070, mh * 0.478]],
      '#c4d8e5', '#7e95a6', '#33485a');
    g.fillStyle = 'rgba(255,196,107,0.92)';
    for (i = 0; i < 3; i++) {
      poly(g, [[cx + mw * 0.086, mh * (0.336 + i * 0.036)],
               [cx + mw * 0.150, mh * (0.336 + i * 0.036)],
               [cx + mw * 0.134, mh * (0.356 + i * 0.036)],
               [cx + mw * 0.070, mh * (0.356 + i * 0.036)]]);
      g.fill();
    }
    bolt(cx + mw * 0.196, mh * 0.326, mw * 0.010);
    bolt(cx + mw * 0.200, mh * 0.452, mw * 0.010);
    /* heat discolouration near the welds */
    g.globalCompositeOperation = 'lighter';
    blitGlow(g, S.torch, cx + mw * 0.150, mh * 0.520, mw * 0.190, 0.40);
    blitGlow(g, S.torch, cx - mw * 0.196, mh * 0.620, mw * 0.150, 0.34);
    g.globalCompositeOperation = 'source-over';

    /* ---- left flank: exposed frame, pipes, cable run ---- */
    g.strokeStyle = 'rgba(190,214,230,0.65)';
    g.lineWidth = Math.max(2.5, mw * 0.011);
    for (i = 0; i < 2; i++) {
      g.beginPath();
      g.moveTo(cx - mw * 0.150, mh * (0.470 + i * 0.024));
      g.lineTo(cx - mw * 0.236, mh * (0.430 + i * 0.024));
      g.stroke();
    }
    g.strokeStyle = 'rgba(30,46,58,0.85)';
    g.lineWidth = Math.max(2, mw * 0.010);
    g.beginPath();
    g.moveTo(cx - mw * 0.070, mh * 0.236);
    g.quadraticCurveTo(cx - mw * 0.230, mh * 0.270, cx - mw * 0.238, mh * 0.372);
    g.stroke();
    g.strokeStyle = 'rgba(53,200,255,0.28)';
    g.lineWidth = Math.max(1, mw * 0.004);
    g.beginPath();
    g.moveTo(cx - mw * 0.074, mh * 0.240);
    g.quadraticCurveTo(cx - mw * 0.234, mh * 0.274, cx - mw * 0.242, mh * 0.370);
    g.stroke();

    /* ---- hull panel seams + rivet rows ---- */
    g.strokeStyle = 'rgba(14,26,36,0.40)';
    g.lineWidth = Math.max(1, mw * 0.0035);
    for (i = 0; i < 2; i++) {
      var py = mh * (0.286 + i * 0.320);
      g.beginPath();
      g.moveTo(cx - mw * 0.230, py);
      g.lineTo(cx + mw * 0.228, py);
      g.stroke();
    }
    for (i = 0; i < 5; i++) {
      bolt(cx - mw * 0.232 + i * mw * 0.116, mh * 0.286, mw * 0.0075);
    }

    /* ---- hull greebles: hatches, vents, clamp rows, rim light ---- */
    /* access hatch low on the left flank */
    plate([[cx - mw * 0.196, mh * 0.560], [cx - mw * 0.196, mh * 0.690],
           [cx - mw * 0.070, mh * 0.690], [cx - mw * 0.070, mh * 0.560]],
      '#a8bfce', '#66808f', '#2b3e4e');
    g.fillStyle = 'rgba(24,38,48,0.35)';
    g.fillRect(cx - mw * 0.182, mh * 0.578, mw * 0.098, Math.max(1, mh * 0.006));
    g.fillRect(cx - mw * 0.182, mh * 0.620, mw * 0.098, Math.max(1, mh * 0.006));
    bolt(cx - mw * 0.186, mh * 0.572, mw * 0.007);
    bolt(cx - mw * 0.080, mh * 0.572, mw * 0.007);
    bolt(cx - mw * 0.186, mh * 0.680, mw * 0.007);
    bolt(cx - mw * 0.080, mh * 0.680, mw * 0.007);
    g.fillStyle = 'rgba(255,196,107,0.70)';
    g.fillRect(cx - mw * 0.182, mh * 0.646, mw * 0.044, mh * 0.010);

    /* louvre block on the lower right */
    for (i = 0; i < 4; i++) {
      g.fillStyle = 'rgba(22,36,46,0.55)';
      g.fillRect(cx + mw * 0.078, mh * (0.548 + i * 0.030), mw * 0.104, Math.max(2, mh * 0.016));
      g.fillStyle = 'rgba(168,192,208,0.45)';
      g.fillRect(cx + mw * 0.078, mh * (0.548 + i * 0.030), mw * 0.104, Math.max(1, mh * 0.005));
    }
    /* cable clamps along the spine */
    for (i = 0; i < 3; i++) {
      g.fillStyle = 'rgba(34,50,62,0.85)';
      g.fillRect(cx - mw * 0.058, mh * (0.330 + i * 0.052), mw * 0.116, mh * 0.014);
    }
    /* small service tags */
    g.fillStyle = 'rgba(53,200,255,0.55)';
    g.fillRect(cx + mw * 0.086, mh * 0.744, mw * 0.070, Math.max(1, mh * 0.007));
    g.fillStyle = 'rgba(255,196,107,0.80)';
    g.fillRect(cx - mw * 0.196, mh * 0.516, mw * 0.030, mh * 0.010);

    /* rim light down the left edge (lamps are above and to the left) */
    g.strokeStyle = 'rgba(240,251,255,0.40)';
    g.lineWidth = Math.max(2, mw * 0.009);
    g.beginPath();
    g.moveTo(cx - mw * 0.222, mh * 0.300);
    g.lineTo(cx - mw * 0.244, mh * 0.404);
    g.lineTo(cx - mw * 0.226, mh * 0.552);
    g.stroke();
    /* warm rim from the furnace on the right edge */
    g.strokeStyle = 'rgba(255,178,104,0.42)';
    g.lineWidth = Math.max(2, mw * 0.011);
    g.beginPath();
    g.moveTo(cx + mw * 0.222, mh * 0.298);
    g.lineTo(cx + mw * 0.242, mh * 0.404);
    g.lineTo(cx + mw * 0.226, mh * 0.554);
    g.stroke();
    /* large stencil panels break up the belly */
    poly(g, [[cx - mw * 0.090, mh * 0.600], [cx + mw * 0.030, mh * 0.600],
             [cx + mw * 0.030, mh * 0.646], [cx - mw * 0.090, mh * 0.646]]);
    g.fillStyle = 'rgba(30,46,58,0.35)';
    g.fill();
    g.strokeStyle = 'rgba(206,230,244,0.35)';
    g.lineWidth = Math.max(1.5, mw * 0.005);
    g.stroke();
    g.fillStyle = 'rgba(255,196,107,0.75)';
    g.fillRect(cx - mw * 0.084, mh * 0.614, mw * 0.040, mh * 0.010);
    g.fillRect(cx - mw * 0.036, mh * 0.614, mw * 0.018, mh * 0.010);

    /* ================= 3. waist ring + empty leg socket ================== */
    plate([[cx - mw * 0.132, mh * 0.762], [cx + mw * 0.132, mh * 0.762],
           [cx + mw * 0.118, mh * 0.836], [cx - mw * 0.118, mh * 0.836]],
      '#b3c8d6', '#6b8292', '#2a3d4c');
    /* side rams on the waist */
    for (i = 0; i < 2; i++) {
      var px = cx + (i === 0 ? -1 : 1) * mw * 0.166;
      g.fillStyle = '#33485a';
      g.fillRect(px - mw * 0.014, mh * 0.744, mw * 0.028, mh * 0.100);
      g.fillStyle = '#c8dce9';
      g.fillRect(px - mw * 0.007, mh * 0.756, mw * 0.014, mh * 0.078);
      g.fillStyle = 'rgba(53,200,255,0.65)';
      g.fillRect(px - mw * 0.014, mh * 0.812, mw * 0.028, Math.max(1, mh * 0.006));
    }
    /* leg socket: an open ring pointing down, waiting for a leg */
    var ringY = mh * 0.884, ringR = mw * 0.086;
    g.beginPath();
    g.arc(cx, ringY, ringR, 0, TAU);
    g.fillStyle = metal(g, ringY - ringR, ringY + ringR, '#bcd0dd', '#6f8697', '#293c4b');
    g.fill();
    g.strokeStyle = edge;
    g.lineWidth = Math.max(1.5, mw * 0.007);
    g.stroke();
    g.beginPath();
    g.arc(cx, ringY, ringR * 0.58, 0, TAU);
    g.fillStyle = '#121d26';
    g.fill();
    g.strokeStyle = 'rgba(190,218,236,0.55)';
    g.lineWidth = Math.max(1, mw * 0.005);
    g.stroke();
    for (k = 0; k < 8; k++) {
      var aa = TAU * k / 8 + 0.2;
      bolt(cx + Math.cos(aa) * ringR * 0.80, ringY + Math.sin(aa) * ringR * 0.80, mw * 0.0075);
    }
    /* two hydraulic hoses dangling out of the socket */
    g.strokeStyle = 'rgba(34,50,62,0.90)';
    g.lineWidth = Math.max(3, mw * 0.012);
    g.beginPath();
    g.moveTo(cx - mw * 0.040, ringY + ringR * 0.55);
    g.quadraticCurveTo(cx - mw * 0.062, mh * 0.960, cx - mw * 0.020, mh * 0.994);
    g.stroke();
    g.beginPath();
    g.moveTo(cx + mw * 0.046, ringY + ringR * 0.60);
    g.quadraticCurveTo(cx + mw * 0.080, mh * 0.952, cx + mw * 0.052, mh * 0.996);
    g.stroke();
    g.strokeStyle = 'rgba(53,200,255,0.30)';
    g.lineWidth = Math.max(1, mw * 0.004);
    g.beginPath();
    g.moveTo(cx - mw * 0.040, ringY + ringR * 0.60);
    g.quadraticCurveTo(cx - mw * 0.058, mh * 0.958, cx - mw * 0.022, mh * 0.990);
    g.stroke();

    /* bottom stencil band */
    g.fillStyle = 'rgba(255,196,107,0.80)';
    g.fillRect(cx - mw * 0.104, mh * 0.792, mw * 0.030, mh * 0.012);
    g.fillRect(cx - mw * 0.052, mh * 0.792, mw * 0.016, mh * 0.012);
    g.fillStyle = 'rgba(53,200,255,0.55)';
    g.fillRect(cx + mw * 0.052, mh * 0.792, mw * 0.052, Math.max(1, mh * 0.006));

    return c;
  }

  /* ---------------------------------------------------------- actors */

  function makeArms() {
    arms = [];

    /* left torch arm, working the left flank */
    arms.push({
      bx: W * 0.204, by: H * 0.828,
      L1: H * 0.235, L2: H * 0.215,
      linkA: 'linkA', linkB: 'linkB', head: 'torchHead',
      th1: S.th1, th2: S.th2,
      bend: 1, big: true,
      tgtX: W * 0.392, tgtY: H * 0.618,
      ampX: W * 0.016, ampY: H * 0.026,
      ph: 0.0, spd: 0.52, rate: 100,
      a1: 0, a2: 0, tipX: 0, tipY: 0, acc: 0
    });
    /* right torch arm, working the right flank */
    arms.push({
      bx: W * 0.796, by: H * 0.828,
      L1: H * 0.235, L2: H * 0.215,
      linkA: 'linkA', linkB: 'linkB', head: 'torchHead',
      th1: S.th1, th2: S.th2,
      bend: -1, big: true,
      tgtX: W * 0.612, tgtY: H * 0.608,
      ampX: W * 0.016, ampY: H * 0.028,
      ph: 2.1, spd: 0.58, rate: 104,
      a1: 0, a2: 0, tipX: 0, tipY: 0, acc: 0
    });
    /* small service arm on the back wall */
    arms.push({
      bx: W * 0.302, by: H * 0.608,
      L1: H * 0.120, L2: H * 0.105,
      linkA: 'linkC', linkB: 'linkD', head: 'torchHeadS',
      th1: Math.max(7, H * 0.022), th2: Math.max(6, H * 0.019),
      bend: -1, big: false,
      tgtX: W * 0.402, tgtY: H * 0.540,
      ampX: W * 0.008, ampY: H * 0.014,
      ph: 4.0, spd: 0.78, rate: 44,
      a1: 0, a2: 0, tipX: 0, tipY: 0, acc: 0
    });

    /* welder hanging from the crane beam above the hull's deck */
    welder = {
      x: W * 0.556, topY: L.beamY + L.beamH,
      len: H * 0.128, phase: 1.2, rate: 66, acc: 0,
      tipX: 0, tipY: 0
    };
  }

  function initParticles() {
    var i;
    parts = [];
    for (i = 0; i < 8; i++) {
      parts.push({
        x: W * (0.01 + rand(0, 1.0)),
        kind: i % 3,
        s: rand(0.80, 1.20),
        v: W * rand(0.014, 0.030)
      });
    }
    dusts = [];
    for (i = 0; i < 70; i++) {
      dusts.push({
        x: rand(0, W), y: rand(H * 0.06, H * 0.99),
        s: rand(H * 0.008, H * 0.030),
        a: rand(0.05, 0.16),
        vx: rand(-8, 12) * (W / 1280),
        vy: rand(-16, -4) * (H / 720),
        ph: rand(0, TAU), sp: rand(0.4, 1.3)
      });
    }
    sparks = [];
    embers = [];
    mechX = W * 0.5;
    mechSway = L.tilt;
  }

  /* ------------------------------------------------------- static build */

  function buildStatic() {
    if (bg) { bg.width = 1; bg.height = 1; bg = null; }
    if (mechSpr) { mechSpr.width = 1; mechSpr.height = 1; mechSpr = null; }

    bg = makeCanvas(W * dpr, H * dpr);
    var g = bg.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.lineJoin = 'round';
    g.lineCap = 'round';

    drawCeiling(g);
    drawBackWall(g);
    drawFurnace(g);
    drawGantry(g);
    drawFloor(g);

    /* lift the deepest shadows a touch so nothing goes flat black, then
       sink the extreme left/right edges so the hall has a frame */
    var veil = g.createLinearGradient(0, 0, 0, H);
    veil.addColorStop(0.00, 'rgba(232,246,255,0.06)');
    veil.addColorStop(0.45, 'rgba(224,240,252,0.03)');
    veil.addColorStop(0.80, 'rgba(214,234,248,0.00)');
    veil.addColorStop(1.00, 'rgba(198,220,238,0.06)');
    g.fillStyle = veil;
    g.fillRect(0, 0, W, H);

    var edgeL = g.createLinearGradient(0, 0, W * 0.15, 0);
    edgeL.addColorStop(0, 'rgba(22,38,52,0.17)');
    edgeL.addColorStop(0.55, 'rgba(22,38,52,0.06)');
    edgeL.addColorStop(1, 'rgba(22,38,52,0)');
    g.fillStyle = edgeL;
    g.fillRect(0, 0, W * 0.15, H);
    var edgeR = g.createLinearGradient(W, 0, W * 0.85, 0);
    edgeR.addColorStop(0, 'rgba(22,38,52,0.15)');
    edgeR.addColorStop(0.55, 'rgba(22,38,52,0.05)');
    edgeR.addColorStop(1, 'rgba(22,38,52,0)');
    g.fillStyle = edgeR;
    g.fillRect(W * 0.85, 0, W * 0.15, H);

    mechSpr = makeMech();
  }

  /* ------------------------------------------------------------ update */

  function solveArm(a) {
    var tx = a.tgtX + Math.sin(t * a.spd + a.ph) * a.ampX;
    var ty = a.tgtY + Math.cos(t * a.spd * 0.83 + a.ph * 1.7) * a.ampY;

    var dx = tx - a.bx, dy = ty - a.by;
    var d = Math.sqrt(dx * dx + dy * dy);
    var L1 = a.L1, L2 = a.L2;
    var dmax = L1 + L2 - 1, dmin = Math.abs(L1 - L2) + 1;
    if (d > dmax) { d = dmax; }
    if (d < dmin) { d = dmin; }

    var ang = Math.atan2(dy, dx);
    var alpha = Math.acos(clamp((d * d + L1 * L1 - L2 * L2) / (2 * d * L1), -1, 1));
    var phi = Math.acos(clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1));

    a.a1 = ang - a.bend * alpha;
    a.a2 = a.bend * (Math.PI - phi);
    a.tipX = a.bx + L1 * Math.cos(a.a1) + L2 * Math.cos(a.a1 + a.a2);
    a.tipY = a.by + L1 * Math.sin(a.a1) + L2 * Math.sin(a.a1 + a.a2);
  }

  function spawnSpark(x, y, spread) {
    if (sparks.length > 420) { return; }
    var ang = rand(-Math.PI, Math.PI);
    var sp = rand(50, 420) * (H / 720) * spread;
    sparks.push({
      x: x, y: y,
      vx: Math.cos(ang) * sp,
      vy: Math.sin(ang) * sp + rand(-40, 60),
      life: rand(0.28, 0.95),
      max: 1,
      g: rand(760, 1580)
    });
    sparks[sparks.length - 1].max = sparks[sparks.length - 1].life;
  }

  function updateParticles(dt) {
    var i, p;
    for (i = sparks.length - 1; i >= 0; i--) {
      p = sparks[i];
      p.life -= dt;
      if (p.life <= 0) { sparks.splice(i, 1); continue; }
      p.vy += p.g * dt * (H / 720) * 0.60;
      p.vx *= (1 - 1.15 * dt);
      p.vy *= (1 - 0.55 * dt);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.y > L.convTop) { p.life = Math.min(p.life, 0.06); }
    }

    if (embers.length < 36 && Math.random() < dt * 24) {
      embers.push({
        x: L.furnX + rand(-L.furnW * 0.26, L.furnW * 0.26),
        y: L.floorY - L.furnH * 0.40,
        vx: rand(-12, 20) * (W / 1280),
        vy: -rand(30, 84) * (H / 720),
        life: rand(1.0, 2.4), max: 1,
        s: rand(H * 0.006, H * 0.016)
      });
      embers[embers.length - 1].max = embers[embers.length - 1].life;
    }
    for (i = embers.length - 1; i >= 0; i--) {
      p = embers[i];
      p.life -= dt;
      if (p.life <= 0) { embers.splice(i, 1); continue; }
      p.x += (p.vx + Math.sin(t * 1.7 + i) * 10) * dt;
      p.y += p.vy * dt;
      p.vy *= (1 - 0.22 * dt);
    }

    for (i = 0; i < dusts.length; i++) {
      p = dusts[i];
      p.x += (p.vx + Math.sin(t * p.sp + p.ph) * 6) * dt;
      p.y += p.vy * dt;
      if (p.y < -H * 0.03) { p.y = H * 1.02; p.x = rand(0, W); }
      if (p.x < -W * 0.03) { p.x = W * 1.02; }
      if (p.x > W * 1.03) { p.x = -W * 0.02; }
    }

    for (i = 0; i < parts.length; i++) {
      p = parts[i];
      p.x += p.v * dt;
      if (p.x > W * 1.08) { p.x = -W * 0.10; p.kind = (Math.random() * 3) | 0; }
    }
  }

  /* ------------------------------------------------------------ render */

  function drawArms(g) {
    var i;
    for (i = 0; i < arms.length; i++) {
      var a = arms[i];
      g.save();
      g.translate(a.bx, a.by);
      g.rotate(a.a1);
      g.drawImage(S[a.linkA], 0, -a.th1 * 0.5, a.L1, a.th1);
      g.beginPath();
      g.arc(a.L1, 0, a.th1 * 0.48, 0, TAU);
      g.fillStyle = '#60798a';
      g.fill();
      g.beginPath();
      g.arc(a.L1, 0, a.th1 * 0.26, 0, TAU);
      g.fillStyle = '#c6dae7';
      g.fill();
      g.translate(a.L1, 0);
      g.rotate(a.a2);
      g.drawImage(S[a.linkB], 0, -a.th2 * 0.5, a.L2, a.th2);
      var hw = S[a.head].width / dpr, hh = S[a.head].height / dpr;
      g.translate(a.L2, 0);
      g.drawImage(S[a.head], -hw * 0.34, -hh * 0.44, hw, hh);
      g.restore();
    }
  }

  function drawWelder(g) {
    var w = welder;
    var bob = Math.sin(t * 0.78 + w.phase);
    var len = w.len + bob * H * 0.022;
    var x = w.x;
    w.tipX = x;
    w.tipY = w.topY + len;

    var rw = Math.max(8, W * 0.010);
    g.fillStyle = '#7f96a6';
    g.fillRect(x - rw * 0.5, w.topY, rw, len);
    g.fillStyle = 'rgba(242,252,255,0.60)';
    g.fillRect(x - rw * 0.5 + rw * 0.16, w.topY, Math.max(1, rw * 0.22), len);
    g.fillStyle = 'rgba(16,28,38,0.65)';
    g.fillRect(x + rw * 0.28, w.topY, Math.max(1, rw * 0.20), len);

    var i;
    for (i = 0; i < 3; i++) {
      g.fillStyle = '#4a6172';
      g.fillRect(x - rw * 0.85, w.topY + len * (0.18 + i * 0.25), rw * 1.7, Math.max(3, H * 0.010));
    }
    var hw = (S.torchHead.width / dpr) * 0.92, hh = (S.torchHead.height / dpr) * 0.92;
    g.drawImage(S.torchHead, x - hw * 0.5, w.tipY - hh * 0.52, hw, hh);
    g.fillStyle = metal(g, w.topY - H * 0.030, w.topY, '#bccfdc', '#6f8797', '#2c4050');
    g.fillRect(x - rw * 1.5, w.topY - H * 0.026, rw * 3.0, H * 0.026);
  }

  function drawParts(g) {
    var i;
    var top = L.convTop + (L.convBot - L.convTop) * 0.12;
    for (i = 0; i < parts.length; i++) {
      var c = parts[i];
      var spr = S.parts[c.kind];
      var cw = (spr.width / dpr) * c.s, chh = (spr.height / dpr) * c.s;
      g.drawImage(spr, c.x, top - chh, cw, chh);
    }
  }

  function drawSparks(g) {
    var i;
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round';
    for (i = 0; i < sparks.length; i++) {
      var p = sparks[i];
      var k = p.life / p.max;
      if (k < 0) { continue; }
      g.globalAlpha = Math.min(1, k * 1.7) * 0.95;
      g.strokeStyle = k > 0.76 ? '#fff8e6' : (k > 0.42 ? '#ffc46b' : '#ff8a3c');
      g.lineWidth = 1.2 + k * 2.0;
      g.beginPath();
      g.moveTo(p.x, p.y);
      g.lineTo(p.x - p.vx * 0.014, p.y - p.vy * 0.014);
      g.stroke();
    }
    for (i = 0; i < arms.length; i++) {
      var a = arms[i];
      var big = a.big ? 1 : 0.55;
      blitGlow(g, S.torch, a.tipX, a.tipY, H * 0.20 * big, 0.28 + 0.15 * Math.sin(t * 18.0 + i * 2.1));
      blitGlow(g, S.torchHot, a.tipX, a.tipY, H * 0.066 * big, 0.62 + 0.28 * Math.sin(t * 26.0 + i * 1.3));
      blitGlow(g, S.sparkHot, a.tipX, a.tipY, H * 0.030 * big, 0.82);
    }
    blitGlow(g, S.torch, welder.tipX, welder.tipY, H * 0.16, 0.26 + 0.14 * Math.sin(t * 17.0 + 4.4));
    blitGlow(g, S.torchHot, welder.tipX, welder.tipY, H * 0.056, 0.58 + 0.26 * Math.sin(t * 23.0 + 2.2));
    g.globalAlpha = 1;
    g.restore();
  }

  function drawEmbers(g) {
    var i;
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (i = 0; i < embers.length; i++) {
      var p = embers[i];
      var k = p.life / p.max;
      g.globalAlpha = Math.min(1, k) * 0.85;
      var s = p.s * (0.6 + k * 0.7);
      g.drawImage(S.ember, p.x - s * 0.5, p.y - s * 0.5, s, s);
    }
    g.globalAlpha = 1;
    g.restore();
  }

  function drawDust(g) {
    var i;
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (i = 0; i < dusts.length; i++) {
      var p = dusts[i];
      g.globalAlpha = p.a * (0.7 + 0.3 * Math.sin(t * p.sp * 1.7 + p.ph));
      g.drawImage(S.dust, p.x - p.s * 0.5, p.y - p.s * 0.5, p.s, p.s);
    }
    g.globalAlpha = 1;
    g.restore();
  }

  function render(dt) {
    var g = ctx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;

    g.drawImage(bg, 0, 0, W, H);

    /* furnace breathing */
    var pulse = 0.5 + 0.5 * Math.sin(t * 1.05);
    g.globalCompositeOperation = 'lighter';
    blitGlow(g, S.furnGlow, L.furnX, L.floorY - L.furnH * 0.44, L.furnW * 2.8, 0.22 + 0.12 * pulse);
    blitGlow(g, S.furnCore, L.furnX, L.floorY - L.furnH * 0.44, L.furnW * 1.10, 0.24 + 0.16 * pulse);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;

    /* trolley + hanging hull */
    var targetX = W * (0.5 + 0.072 * Math.sin(t * 0.072));
    mechX += (targetX - mechX) * Math.min(1, dt * 1.35);
    var targetSway = L.tilt + clamp((targetX - mechX) * 0.00038, -0.011, 0.011) +
      Math.sin(t * 0.62) * 0.0055;
    mechSway += (targetSway - mechSway) * Math.min(1, dt * 2.2);

    var beamBot = L.beamY + L.beamH;
    g.save();
    g.strokeStyle = 'rgba(38,54,68,0.92)';
    g.lineWidth = Math.max(2.5, W * 0.0024);
    g.beginPath();
    g.moveTo(mechX - W * 0.030, beamBot);
    g.lineTo(mechX - W * 0.004, L.mechTop + H * 0.006);
    g.moveTo(mechX + W * 0.030, beamBot);
    g.lineTo(mechX + W * 0.004, L.mechTop + H * 0.006);
    g.stroke();
    g.strokeStyle = 'rgba(238,250,255,0.50)';
    g.lineWidth = Math.max(1, W * 0.0009);
    g.beginPath();
    g.moveTo(mechX - W * 0.028, beamBot);
    g.lineTo(mechX - W * 0.003, L.mechTop + H * 0.006);
    g.stroke();
    g.restore();

    var tw = S.trolley.width / dpr, th = S.trolley.height / dpr;
    g.drawImage(S.trolley, targetX - tw * 0.5, L.beamY - th * 0.24, tw, th);

    g.save();
    g.translate(mechX, L.mechTop);
    g.rotate(mechSway);
    g.drawImage(mechSpr, -L.mechW * 0.5, 0, L.mechW, L.mechH);
    g.restore();

    drawParts(g);
    drawArms(g);
    drawWelder(g);
    drawSparks(g);
    drawEmbers(g);
    drawDust(g);

    /* calm, feathered corner for the host's exit button */
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.drawImage(S.corner, W - 540, 0, 540, 260);
  }

  /* --------------------------------------------------------------- loop */

  function emit(dt) {
    var i;
    for (i = 0; i < arms.length; i++) {
      var a = arms[i];
      a.acc += a.rate * dt;
      while (a.acc >= 1) {
        a.acc -= 1;
        spawnSpark(a.tipX + rand(-3, 3), a.tipY + rand(-3, 3), a.big ? 1 : 0.6);
      }
    }
    welder.acc += welder.rate * dt;
    while (welder.acc >= 1) {
      welder.acc -= 1;
      spawnSpark(welder.tipX + rand(-3, 3), welder.tipY + rand(-3, 3), 0.8);
    }
  }

  function frame(ts) {
    rafId = window.requestAnimationFrame(frame);
    if (!lastTs) { lastTs = ts; return; }
    var dt = (ts - lastTs) / 1000;
    lastTs = ts;
    if (dt > 0.05) { dt = 0.05; }
    if (dt <= 0) { return; }
    t += dt;

    var i;
    for (i = 0; i < arms.length; i++) { solveArm(arms[i]); }
    emit(dt);
    updateParticles(dt);
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

  /* --------------------------------------------------------------- boot */

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
    layout();
    buildSprites();
    makeArms();
    buildStatic();
    initParticles();
    var i;
    for (i = 0; i < arms.length; i++) { solveArm(arms[i]); }
    render(0.016);
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
