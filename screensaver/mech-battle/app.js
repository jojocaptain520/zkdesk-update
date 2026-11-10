/* ==========================================================================
   Zhan-chang Chong-feng / Battle Charge -- procedural canvas screensaver.
   A mech charging right-to-left through dust and fire: explosion light,
   missile trails, shockwaves, sparks, flying debris and speed lines.
   Contains no characters, faces or organic forms -- machinery only.

   Contract:
     - pure canvas, no external image / font / network / storage
     - no pointer / key listeners, no self-drawn exit button
     - canvas size = innerWidth/innerHeight * min(devicePixelRatio, 1.5)
     - static layers pre-rendered to offscreen canvases, per frame only blit
       plus a few small transformed sprites
     - the per frame loop uses drawImage / small paths only: no shadow, no
       gradients, no pixel read-back, no text
   ========================================================================== */
(function () {
  'use strict';

  var TAU = Math.PI * 2;
  var MAX_DPR = 1.5;
  var DEG = Math.PI / 180;

  var canvas = document.getElementById('scene');
  if (!canvas) { return; }
  var ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) { return; }

  var W = 1, H = 1, dpr = 1;
  var bg = null;
  var S = {};
  var L = {};                       /* mech placement + transform helpers */
  var flames = [];
  var sparks = [];
  var debris = [];
  var dusts = [];
  var lines = [];
  var waves = [];
  var t = 0, lastTs = 0, rafId = 0, resizeTimer = 0;

  /* palette */
  var ORANGE = '#ff8a3c';
  var GOLD = '#ffd27f';
  var METAL = '#9fb4c8';
  var METAL_D = '#4a5f72';
  var CYAN = '#35c8ff';
  var RGB_CYAN = '53,200,255';
  var RGB_ORANGE = '255,138,60';
  var RGB_GOLD = '255,210,127';

  /* ---------------------------------------------------------------- utils */

  function rand(a, b) { return a + Math.random() * (b - a); }
  function round(v) { return Math.round(v); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  function makeCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, round(w));
    c.height = Math.max(1, round(h));
    return c;
  }

  function makeGlow(rgb, size, core) {
    var c = makeCanvas(size, size);
    var g = c.getContext('2d');
    var r = c.width * 0.5;
    var gr = g.createRadialGradient(r, r, 0, r, r, r);
    gr.addColorStop(0.00, 'rgba(' + rgb + ',1)');
    gr.addColorStop(core || 0.20, 'rgba(' + rgb + ',0.55)');
    gr.addColorStop(0.52, 'rgba(' + rgb + ',0.16)');
    gr.addColorStop(1.00, 'rgba(' + rgb + ',0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, c.width, c.height);
    return c;
  }

  function blitGlow(g, sprite, cx, cy, size, alpha, additive) {
    g.save();
    if (additive) { g.globalCompositeOperation = 'lighter'; }
    g.globalAlpha = alpha;
    g.drawImage(sprite, cx - size * 0.5, cy - size * 0.5, size, size);
    g.restore();
  }

  function poly(g, pts, fill, stroke, lw) {
    var i;
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (i = 1; i < pts.length; i++) { g.lineTo(pts[i][0], pts[i][1]); }
    g.closePath();
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (stroke) {
      g.strokeStyle = stroke;
      g.lineWidth = lw || 0.007;
      g.stroke();
    }
  }

  /* --------------------------------------------------------------- sprites */

  function makeFlame(w, h, c0, c1, c2) {
    var c = makeCanvas(w, h), g = c.getContext('2d');
    var gr = g.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0.00, c0);
    gr.addColorStop(0.35, c1);
    gr.addColorStop(1.00, c2);
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(0, h * 0.30);
    g.bezierCurveTo(w * 0.30, h * 0.02, w * 0.72, h * 0.10, w, h * 0.50);
    g.bezierCurveTo(w * 0.72, h * 0.90, w * 0.30, h * 0.98, 0, h * 0.70);
    g.closePath();
    g.fill();
    return c;
  }

  function makeSpark() {
    var s = 48, c = makeCanvas(s, s), g = c.getContext('2d');
    var gr = g.createRadialGradient(s * 0.5, s * 0.5, 0, s * 0.5, s * 0.5, s * 0.5);
    gr.addColorStop(0.0, 'rgba(255,252,232,1)');
    gr.addColorStop(0.35, 'rgba(255,206,120,0.85)');
    gr.addColorStop(1.0, 'rgba(255,138,60,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, s, s);
    return c;
  }

  function makeChunk(seed) {
    var s = 64, c = makeCanvas(s, s), g = c.getContext('2d');
    var v = seed * 9301 + 49297, i, pts = [], n = 5;
    function rnd() { v = (v * 9301 + 49297) % 233280; return v / 233280; }
    for (i = 0; i < n; i++) {
      var a = i * (TAU / n) + rnd() * 0.4;
      var r = s * (0.26 + rnd() * 0.20);
      pts.push([s * 0.5 + Math.cos(a) * r, s * 0.5 + Math.sin(a) * r]);
    }
    poly(g, pts, 'rgba(122,134,144,0.98)', 'rgba(62,74,88,1)', 2.2);
    /* lit face */
    g.fillStyle = 'rgba(214,228,240,0.55)';
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    g.lineTo(pts[1][0], pts[1][1]);
    g.lineTo(s * 0.5, s * 0.5);
    g.closePath();
    g.fill();
    return c;
  }

  function makeStreak() {
    var w = 384, h = 14, c = makeCanvas(w, h), g = c.getContext('2d');
    var gr = g.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0.00, 'rgba(255,255,255,0)');
    gr.addColorStop(0.55, 'rgba(255,236,206,0.85)');
    gr.addColorStop(0.92, 'rgba(255,255,255,0.95)');
    gr.addColorStop(1.00, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, h * 0.5 - 1.6, w, 3.2);
    return c;
  }

  function makeDust() {
    var s = 256, c = makeCanvas(s, s), g = c.getContext('2d');
    var gr = g.createRadialGradient(s * 0.5, s * 0.5, 0, s * 0.5, s * 0.5, s * 0.5);
    gr.addColorStop(0.00, 'rgba(214,198,176,0.85)');
    gr.addColorStop(0.42, 'rgba(186,172,154,0.50)');
    gr.addColorStop(0.74, 'rgba(150,146,140,0.20)');
    gr.addColorStop(1.00, 'rgba(130,130,130,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, s, s);
    return c;
  }

  function makeCorner() {
    var cw = 380, ch = 340;
    var c = makeCanvas(cw * dpr, ch * dpr), g = c.getContext('2d');
    g.scale(dpr, dpr);
    var gr = g.createRadialGradient(cw - 2, 2, 0, cw - 2, 2, 330);
    gr.addColorStop(0.00, 'rgba(22,28,36,0.94)');
    gr.addColorStop(0.30, 'rgba(26,33,42,0.88)');
    gr.addColorStop(0.56, 'rgba(34,42,52,0.72)');
    gr.addColorStop(0.80, 'rgba(56,68,82,0.38)');
    gr.addColorStop(1.00, 'rgba(90,104,118,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, cw, ch);
    c._cw = cw;
    c._ch = ch;
    return c;
  }

  function buildSprites() {
    S.gWarm = makeGlow('255,176,108', 256, 0.22);
    S.gOrange = makeGlow(RGB_ORANGE, 256, 0.20);
    S.gGold = makeGlow(RGB_GOLD, 256, 0.20);
    S.gCyan = makeGlow(RGB_CYAN, 128, 0.26);
    S.gWhite = makeGlow('255,248,232', 128, 0.24);
    S.gSmoke = makeGlow('96,92,86', 256, 0.30);
    S.flameOut = makeFlame(192, 96, 'rgba(255,180,90,0.95)',
      'rgba(255,138,60,0.75)', 'rgba(255,120,50,0)');
    S.flameIn = makeFlame(150, 60, 'rgba(255,255,240,1)',
      'rgba(255,228,160,0.9)', 'rgba(255,190,110,0)');
    S.spark = makeSpark();
    S.chunk1 = makeChunk(1);
    S.chunk2 = makeChunk(2);
    S.chunk3 = makeChunk(3);
    S.streak = makeStreak();
    S.dust = makeDust();
    S.corner = makeCorner();
  }

  /* ------------------------------------------------------------ background */

  function drawSky(g) {
    var sky = g.createLinearGradient(0, 0, 0, H * 0.86);
    sky.addColorStop(0.00, '#5c6f83');
    sky.addColorStop(0.20, '#6f8296');
    sky.addColorStop(0.44, '#93a0ab');
    sky.addColorStop(0.66, '#c69a76');
    sky.addColorStop(0.84, '#ffb173');
    sky.addColorStop(1.00, '#ffc98f');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);

    /* heavy smoke banks lit from below */
    var i, y, w2;
    for (i = 0; i < 11; i++) {
      y = H * (0.10 + i * 0.062);
      w2 = W * (0.30 + (i % 4) * 0.14);
      g.save();
      g.globalAlpha = 0.10 + (i % 3) * 0.055;
      g.fillStyle = i < 5 ? '#4d5a66' : '#8a8073';
      g.beginPath();
      g.ellipse(W * (0.06 + i * 0.088), y, w2 * 0.5, H * (0.016 + (i % 3) * 0.008), 0, 0, TAU);
      g.fill();
      g.restore();
    }

    /* the big fireball on the right, behind the mech */
    blitGlow(g, S.gOrange, W * 0.800, H * 0.248, H * 1.15, 0.85, true);
    blitGlow(g, S.gWarm, W * 0.800, H * 0.248, H * 0.72, 0.90, true);
    blitGlow(g, S.gGold, W * 0.800, H * 0.248, H * 0.36, 0.82, true);
    blitGlow(g, S.gWhite, W * 0.800, H * 0.246, H * 0.082, 0.78, true);

    /* radiating fire spikes */
    var j, a, len;
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (j = 0; j < 18; j++) {
      a = j * (TAU / 18) + 0.12;
      len = H * (0.18 + ((j * 7) % 5) * 0.045);
      g.globalAlpha = 0.30 + (j % 3) * 0.10;
      g.strokeStyle = j % 4 === 0 ? '#fff0c8' : ORANGE;
      g.lineWidth = H * (0.006 + (j % 3) * 0.004);
      g.beginPath();
      g.moveTo(W * 0.775 + Math.cos(a) * H * 0.05,
        H * 0.300 + Math.sin(a) * H * 0.05);
      g.lineTo(W * 0.775 + Math.cos(a) * len,
        H * 0.300 + Math.sin(a) * len);
      g.stroke();
    }
    g.restore();

    /* secondary blast, left */
    blitGlow(g, S.gOrange, W * 0.150, H * 0.470, H * 0.70, 0.60, true);
    blitGlow(g, S.gGold, W * 0.150, H * 0.470, H * 0.22, 0.80, true);
    blitGlow(g, S.gWhite, W * 0.150, H * 0.470, H * 0.075, 0.95, true);

    /* distant blast, upper left */
    blitGlow(g, S.gWarm, W * 0.055, H * 0.180, H * 0.30, 0.55, true);

    /* missile trails arcing over the field */
    var trails = [
      [[0.24, 0.010], [0.36, 0.120], [0.50, 0.180], [0.66, 0.196], [0.74, 0.230]],
      [[0.92, 0.040], [0.86, 0.140], [0.82, 0.200], [0.80, 0.262]],
      [[0.06, 0.320], [0.14, 0.250], [0.22, 0.220], [0.30, 0.222]]
    ];
    var ti, k, p0, p1;
    for (ti = 0; ti < trails.length; ti++) {
      var tr = trails[ti];
      for (k = 0; k < tr.length - 1; k++) {
        p0 = tr[k]; p1 = tr[k + 1];
        g.strokeStyle = 'rgba(238,228,214,' + (0.34 - k * 0.06).toFixed(2) + ')';
        g.lineWidth = H * (0.010 - k * 0.0022);
        g.beginPath();
        g.moveTo(W * p0[0], H * p0[1]);
        g.lineTo(W * p1[0], H * p1[1]);
        g.stroke();
      }
      p1 = tr[tr.length - 1];
      blitGlow(g, S.gGold, W * p1[0], H * p1[1], H * 0.10, 0.85, true);
    }
  }

  function drawGround(g) {
    var gy = H * 0.735;
    var gr = g.createLinearGradient(0, gy, 0, H);
    gr.addColorStop(0.00, '#8e8578');
    gr.addColorStop(0.30, '#6f7274');
    gr.addColorStop(0.70, '#5a6064');
    gr.addColorStop(1.00, '#4d545a');
    g.fillStyle = gr;
    g.fillRect(0, gy, W, H - gy);

    /* warm rim where the firelight hits the ground */
    var rim = g.createLinearGradient(0, gy, 0, gy + H * 0.06);
    rim.addColorStop(0, 'rgba(255,186,116,0.85)');
    rim.addColorStop(1, 'rgba(255,150,80,0)');
    g.fillStyle = rim;
    g.fillRect(0, gy, W, H * 0.06);
    g.fillStyle = 'rgba(255,224,176,0.9)';
    g.fillRect(0, gy - 2, W, 2.4);

    /* far wreckage silhouettes on the horizon */
    var i, x, w2, h2;
    for (i = 0; i < 16; i++) {
      x = W * (0.02 + i * 0.064);
      w2 = W * (0.016 + ((i * 5) % 3) * 0.012);
      h2 = H * (0.014 + ((i * 7) % 4) * 0.014);
      g.fillStyle = 'rgba(58,62,66,0.9)';
      g.fillRect(x, gy - h2, w2, h2);
      if (i % 3 === 0) {
        g.fillRect(x + w2 * 0.3, gy - h2 - H * 0.02, Math.max(1.6, w2 * 0.22), H * 0.02);
      }
    }

    /* cracked plates */
    var cracks = 9, j, segs;
    for (i = 0; i < cracks; i++) {
      x = W * (0.04 + i * 0.112);
      g.strokeStyle = 'rgba(38,42,46,0.75)';
      g.lineWidth = Math.max(1.6, H * 0.004);
      g.beginPath();
      g.moveTo(x, gy + H * 0.010);
      segs = 5;
      for (j = 0; j < segs; j++) {
        g.lineTo(x + W * (0.010 - ((i + j) % 3) * 0.012) * (j + 1),
          gy + H * (0.010 + (j + 1) * 0.048));
      }
      g.stroke();
      /* molten seam inside the crack */
      g.strokeStyle = 'rgba(255,150,80,0.55)';
      g.lineWidth = Math.max(1, H * 0.0016);
      g.beginPath();
      g.moveTo(x + 1.4, gy + H * 0.012);
      for (j = 0; j < segs; j++) {
        g.lineTo(x + 1.4 + W * (0.010 - ((i + j) % 3) * 0.012) * (j + 1),
          gy + H * (0.012 + (j + 1) * 0.048));
      }
      g.stroke();
    }

    /* rubble */
    for (i = 0; i < 26; i++) {
      var rx = W * ((i * 0.137) % 1.0);
      var ry = gy + H * (0.02 + ((i * 0.073) % 0.20));
      var rs = H * (0.006 + ((i * 3) % 4) * 0.005);
      g.fillStyle = 'rgba(70,76,80,0.95)';
      g.beginPath();
      g.moveTo(rx - rs, ry);
      g.lineTo(rx - rs * 0.2, ry - rs * 0.9);
      g.lineTo(rx + rs * 0.9, ry - rs * 0.2);
      g.lineTo(rx + rs * 0.4, ry + rs * 0.7);
      g.closePath();
      g.fill();
      g.fillStyle = 'rgba(255,196,140,0.55)';
      g.beginPath();
      g.moveTo(rx - rs * 0.2, ry - rs * 0.9);
      g.lineTo(rx + rs * 0.9, ry - rs * 0.2);
      g.lineTo(rx + rs * 0.2, ry - rs * 0.1);
      g.closePath();
      g.fill();
    }

    /* glow pools from the fire */
    blitGlow(g, S.gOrange, W * 0.80, gy + H * 0.02, W * 0.55, 0.55, true);
    blitGlow(g, S.gWarm, W * 0.62, gy + H * 0.05, W * 0.48, 0.40, true);
    blitGlow(g, S.gOrange, W * 0.15, gy + H * 0.02, W * 0.30, 0.40, true);
  }

  /* --------------------------------------------------------------- the mech */

  var HEAD = [[-0.060, 0.012], [0.045, 0.002], [0.080, 0.034], [0.072, 0.086],
    [0.008, 0.104], [-0.052, 0.090], [-0.080, 0.050]];
  var NECK = [[-0.040, 0.094], [0.056, 0.100], [0.050, 0.148], [-0.046, 0.142]];
  var TORSO = [[-0.222, 0.148], [0.200, 0.138], [0.222, 0.232], [0.168, 0.338],
    [0.122, 0.452], [-0.100, 0.462], [-0.164, 0.368], [-0.238, 0.250]];
  var CHEST = [[-0.205, 0.160], [-0.075, 0.155], [-0.035, 0.300], [-0.095, 0.425],
    [-0.155, 0.355], [-0.215, 0.250]];
  var PAUL_L = [[-0.330, 0.115], [-0.195, 0.095], [-0.155, 0.235], [-0.235, 0.285],
    [-0.350, 0.215]];
  var PAUL_R = [[0.155, 0.125], [0.290, 0.155], [0.310, 0.275], [0.205, 0.295],
    [0.145, 0.225]];
  var ARM_L_U = [[-0.312, 0.228], [-0.188, 0.240], [-0.224, 0.348], [-0.350, 0.334]];
  var ARM_L_F = [[-0.350, 0.302], [-0.226, 0.322], [-0.262, 0.404], [-0.378, 0.388]];
  var HAND_L = [[-0.378, 0.300], [-0.296, 0.312], [-0.308, 0.382], [-0.386, 0.370]];
  var ARM_R_U = [[0.140, 0.218], [0.248, 0.230], [0.268, 0.338], [0.160, 0.326]];
  var ARM_R_F = [[0.258, 0.326], [0.322, 0.348], [0.310, 0.436], [0.230, 0.412]];
  var BARREL = [[-0.330, 0.280], [-0.665, 0.205], [-0.660, 0.265], [-0.325, 0.350]];
  var MUZZLE = [[-0.690, 0.190], [-0.645, 0.198], [-0.638, 0.272], [-0.682, 0.264]];
  var SCOPE = [[-0.420, 0.240], [-0.500, 0.222], [-0.495, 0.255], [-0.415, 0.272]];
  var HIP = [[-0.168, 0.428], [0.158, 0.428], [0.168, 0.522], [-0.158, 0.522]];
  var LEG_F_TH = [[-0.178, 0.468], [-0.058, 0.476], [-0.132, 0.628], [-0.258, 0.600]];
  var LEG_F_SH = [[-0.258, 0.596], [-0.132, 0.622], [-0.046, 0.800], [-0.168, 0.826]];
  var LEG_F_FT = [[-0.168, 0.802], [-0.040, 0.796], [-0.056, 0.890], [-0.252, 0.920],
    [-0.288, 0.882]];
  var LEG_R_TH = [[0.000, 0.468], [0.128, 0.460], [0.272, 0.588], [0.176, 0.620]];
  var LEG_R_SH = [[0.176, 0.596], [0.278, 0.576], [0.322, 0.776], [0.206, 0.802]];
  var LEG_R_FT = [[0.206, 0.790], [0.322, 0.772], [0.408, 0.856], [0.384, 0.912],
    [0.216, 0.896]];
  var BACKPACK = [[0.135, 0.175], [0.295, 0.195], [0.305, 0.355], [0.145, 0.345]];
  var NOZZLE1 = [[0.300, 0.210], [0.348, 0.216], [0.348, 0.266], [0.300, 0.260]];
  var NOZZLE2 = [[0.300, 0.290], [0.348, 0.296], [0.348, 0.346], [0.300, 0.340]];

  function buildLayout() {
    L.unit = H * 0.612;
    L.lean = -14 * DEG;
    L.mx = W * 0.618;
    L.my = H * 0.930 - 0.955 * L.unit;
    L.ca = Math.cos(L.lean);
    L.sa = Math.sin(L.lean);
  }

  /* local mech space -> screen */
  function toScreen(lx, ly) {
    return [
      L.mx + (lx * L.ca - ly * L.sa) * L.unit,
      L.my + (lx * L.sa + ly * L.ca) * L.unit
    ];
  }

  function drawMech(g) {
    g.save();
    g.translate(L.mx, L.my);
    g.rotate(L.lean);
    g.scale(L.unit, L.unit);
    g.lineJoin = 'round';

    /* light from the explosion sits behind-right: metal brightens to +x */
    var metal = g.createLinearGradient(0.42, 0.08, -0.34, 0.86);
    metal.addColorStop(0.00, '#c3d6e6');
    metal.addColorStop(0.34, '#8ba1b6');
    metal.addColorStop(0.72, '#5c7388');
    metal.addColorStop(1.00, '#2f4356');
    var metalDark = g.createLinearGradient(0.30, 0.10, -0.30, 0.80);
    metalDark.addColorStop(0.00, '#7e94a9');
    metalDark.addColorStop(0.50, '#4e6579');
    metalDark.addColorStop(1.00, '#27394b');
    var edge = 'rgba(28,40,52,0.85)';
    var warmEdge = 'rgba(255,190,120,0.95)';
    var lw = 0.007;

    /* rear leg */
    poly(g, LEG_R_TH, metalDark, edge, lw);
    poly(g, LEG_R_SH, metalDark, edge, lw);
    poly(g, LEG_R_FT, metalDark, edge, lw);
    /* rear arm */
    poly(g, ARM_R_U, metalDark, edge, lw);
    poly(g, ARM_R_F, metalDark, edge, lw);
    poly(g, PAUL_R, metal, edge, lw);

    /* backpack + nozzles */
    poly(g, BACKPACK, metalDark, edge, lw);
    poly(g, NOZZLE1, '#2e3d4c', 'rgba(20,28,36,0.9)', lw * 0.8);
    poly(g, NOZZLE2, '#2e3d4c', 'rgba(20,28,36,0.9)', lw * 0.8);

    /* torso */
    poly(g, TORSO, metal, edge, lw);
    poly(g, CHEST, '#b6c9db', 'rgba(40,56,72,0.75)', lw * 0.8);
    poly(g, HIP, metalDark, edge, lw);

    /* front leg */
    poly(g, LEG_F_TH, metal, edge, lw);
    poly(g, LEG_F_SH, metal, edge, lw);
    poly(g, LEG_F_FT, metalDark, edge, lw);

    /* shoulder + arm + weapon */
    poly(g, PAUL_L, metal, edge, lw);
    poly(g, ARM_L_U, metal, edge, lw);
    poly(g, ARM_L_F, metal, edge, lw);
    poly(g, HAND_L, '#7d94a8', edge, lw * 0.8);
    poly(g, BARREL, '#8fa6ba', edge, lw);
    poly(g, MUZZLE, '#6c8499', edge, lw * 0.8);
    poly(g, SCOPE, '#5f7689', edge, lw * 0.8);

    /* head + neck */
    poly(g, NECK, '#54697d', edge, lw * 0.8);
    poly(g, HEAD, metal, edge, lw);

    /* warm rim on the edges facing the fire (right / +x) */
    g.strokeStyle = warmEdge;
    g.lineWidth = 0.010;
    g.beginPath();
    g.moveTo(0.205, 0.240);
    g.lineTo(0.155, 0.335);
    g.lineTo(0.115, 0.445);
    g.stroke();
    g.beginPath();
    g.moveTo(0.290, 0.160);
    g.lineTo(0.310, 0.275);
    g.stroke();
    g.lineWidth = 0.008;
    g.beginPath();
    g.moveTo(0.295, 0.198);
    g.lineTo(0.305, 0.352);
    g.stroke();
    g.beginPath();
    g.moveTo(0.080, 0.036);
    g.lineTo(0.072, 0.086);
    g.stroke();
    g.beginPath();
    g.moveTo(0.285, 0.618);
    g.lineTo(0.345, 0.822);
    g.stroke();
    g.beginPath();
    g.moveTo(0.265, 0.632);
    g.lineTo(0.165, 0.500);
    g.stroke();

    /* cyan detail lights */
    g.strokeStyle = CYAN;
    g.lineWidth = 0.009;
    g.beginPath();
    g.moveTo(-0.076, 0.047);
    g.lineTo(-0.016, 0.038);
    g.stroke();
    g.lineWidth = 0.006;
    g.beginPath();
    g.moveTo(-0.190, 0.170);
    g.lineTo(-0.100, 0.168);
    g.stroke();
    g.beginPath();
    g.moveTo(0.020, 0.320);
    g.lineTo(0.090, 0.318);
    g.stroke();
    g.fillStyle = CYAN;
    g.beginPath();
    g.arc(-0.150, 0.470, 0.011, 0, TAU);
    g.fill();
    g.beginPath();
    g.arc(0.160, 0.240, 0.008, 0, TAU);
    g.fill();

    /* panel lines */
    g.strokeStyle = 'rgba(40,54,68,0.45)';
    g.lineWidth = 0.005;
    g.beginPath();
    g.moveTo(-0.150, 0.230);
    g.lineTo(0.150, 0.222);
    g.stroke();
    g.beginPath();
    g.moveTo(-0.100, 0.392);
    g.lineTo(0.100, 0.386);
    g.stroke();
    g.beginPath();
    g.moveTo(-0.180, 0.520);
    g.lineTo(0.140, 0.516);
    g.stroke();

    g.restore();
  }

  /* ---------------------------------------------------------- dynamic bits */

  function initActors() {
    var n1 = toScreen(0.352, 0.238);
    var n2 = toScreen(0.352, 0.318);
    var footF = toScreen(-0.200, 0.945);
    var footR = toScreen(0.350, 0.930);
    L.nozzles = [n1, n2];
    L.footF = footF;
    L.footR = footR;

    flames.length = 0;
    flames.push({ p: n1, s: H * 0.062, ph: 0.0 });
    flames.push({ p: n2, s: H * 0.050, ph: 2.1 });
    flames.push({ p: n1, s: H * 0.036, ph: 1.1, inner: true });

    sparks.length = 0;
    var i;
    for (i = 0; i < 54; i++) { sparks.push(newSpark(true)); }

    debris.length = 0;
    for (i = 0; i < 12; i++) { debris.push(newDebris(true)); }

    dusts.length = 0;
    for (i = 0; i < 10; i++) {
      dusts.push({
        x: footR[0] + rand(-W * 0.05, W * 0.10),
        y: footR[1] + rand(-H * 0.02, H * 0.03),
        s: H * rand(0.18, 0.40),
        vx: rand(W * 0.012, W * 0.050),
        vy: rand(-H * 0.024, -H * 0.004),
        a: rand(0.24, 0.44),
        life: rand(0.4, 1.0)
      });
    }

    lines.length = 0;
    for (i = 0; i < 20; i++) {
      lines.push({
        x: rand(0, W * 1.3), y: rand(H * 0.14, H * 0.95),
        len: rand(W * 0.10, W * 0.34),
        sp: rand(W * 0.9, W * 2.2),
        a: rand(0.10, 0.30)
      });
    }

    waves.length = 0;
    for (i = 0; i < 3; i++) {
      waves.push({ x: W * 0.775, y: H * 0.300, r: (i / 3) * H * 0.9, ph: i * 0.34 });
    }
  }

  function newSpark(spread) {
    var fromFoot = Math.random() < 0.45;
    var ox = fromFoot ? L.footF[0] : (Math.random() < 0.5 ? L.footR[0] : L.nozzles[0][0]);
    var oy = fromFoot ? L.footF[1] : (Math.random() < 0.5 ? L.footR[1] : L.nozzles[0][1]);
    return {
      x: spread ? ox + rand(-W * 0.06, W * 0.06) : ox,
      y: spread ? oy + rand(-H * 0.10, H * 0.02) : oy,
      vx: rand(-W * 0.55, W * 0.15),
      vy: rand(-H * 0.42, H * 0.05),
      s: rand(H * 0.010, H * 0.028),
      life: rand(0.5, 1.4),
      age: rand(0, 1.0),
      hot: Math.random() < 0.3
    };
  }

  function newDebris(spread) {
    return {
      x: spread ? rand(W * 0.02, W * 0.95) : rand(W * 0.45, W * 0.95),
      y: spread ? rand(H * 0.20, H * 0.92) : rand(H * 0.30, H * 0.60),
      vx: rand(-W * 0.16, -W * 0.03),
      vy: rand(-H * 0.10, -H * 0.01),
      s: rand(H * 0.020, H * 0.055),
      rot: rand(0, TAU),
      rotv: rand(-2.4, 2.4),
      spr: ['chunk1', 'chunk2', 'chunk3'][Math.floor(rand(0, 3))],
      life: rand(1.6, 3.2),
      age: rand(0, 2.0)
    };
  }

  /* ------------------------------------------------------------ per frame */

  function drawWaves(g) {
    var i, o, a, r;
    for (i = 0; i < waves.length; i++) {
      o = waves[i];
      r = ((t * 0.42 + o.ph) % 1) * H * 0.95;
      a = 0.34 * (1 - r / (H * 0.95));
      if (a <= 0.002) { continue; }
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = a;
      g.strokeStyle = i === 0 ? '#ffd9a0' : ORANGE;
      g.lineWidth = H * 0.007 * (1 - r / (H * 1.1)) + 1;
      g.beginPath();
      g.ellipse(o.x, o.y, r, r * 0.52, 0, 0, TAU);
      g.stroke();
      g.restore();
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  function drawDust(g, dt) {
    var i, o;
    for (i = 0; i < dusts.length; i++) {
      o = dusts[i];
      o.x += o.vx * dt;
      o.y += o.vy * dt;
      o.life -= dt * 0.22;
      o.s += dt * H * 0.10;
      if (o.life <= 0) {
        o.x = L.footR[0] + rand(-W * 0.05, W * 0.06);
        o.y = L.footR[1] + rand(-H * 0.02, H * 0.03);
        o.s = H * rand(0.16, 0.34);
        o.vx = rand(W * 0.010, W * 0.045);
        o.vy = rand(-H * 0.020, -H * 0.004);
        o.life = rand(0.6, 1.2);
        o.a = rand(0.24, 0.44);
      }
      g.save();
      g.globalAlpha = clamp(o.life, 0, 1) * o.a;
      g.drawImage(S.dust, o.x - o.s * 0.5, o.y - o.s * 0.5, o.s, o.s);
      g.restore();
    }
    g.globalAlpha = 1;
  }

  function drawFlames(g) {
    var i, o, flick, w, h, ang = L.lean;
    for (i = 0; i < flames.length; i++) {
      o = flames[i];
      flick = 0.78 + 0.30 * Math.sin(t * 22 + o.ph) + 0.12 * Math.sin(t * 37 + o.ph * 2);
      w = o.s * 2.1 * flick;
      h = o.s * 0.95;
      g.save();
      g.globalAlpha = o.inner ? 0.95 : 0.85;
      g.translate(o.p[0], o.p[1]);
      g.rotate(ang);
      g.drawImage(o.inner ? S.flameIn : S.flameOut, 0, -h * 0.5, w, h);
      g.restore();
      blitGlow(g, S.gOrange, o.p[0] + Math.cos(ang) * w * 0.30,
        o.p[1] + Math.sin(ang) * w * 0.30, o.s * 2.6,
        (o.inner ? 0.45 : 0.30) * flick, true);
    }
    g.globalAlpha = 1;
  }

  function drawSparks(g, dt) {
    var i, o, life;
    for (i = 0; i < sparks.length; i++) {
      o = sparks[i];
      o.age += dt;
      if (o.age > o.life) {
        var ns = newSpark(false);
        o.x = ns.x; o.y = ns.y; o.vx = ns.vx; o.vy = ns.vy;
        o.s = ns.s; o.life = ns.life; o.age = 0; o.hot = ns.hot;
      }
      o.vy += H * 0.55 * dt;
      o.vx *= (1 - 0.9 * dt);
      o.x += o.vx * dt;
      o.y += o.vy * dt;
      life = 1 - o.age / o.life;
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = clamp(life, 0, 1) * (o.hot ? 0.95 : 0.72);
      g.drawImage(o.hot ? S.gWhite : S.spark, o.x - o.s * 0.5, o.y - o.s * 0.5, o.s, o.s);
      g.restore();
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  function drawDebris(g, dt) {
    var i, o, life;
    for (i = 0; i < debris.length; i++) {
      o = debris[i];
      o.age += dt;
      if (o.age > o.life) {
        var nd = newDebris(false);
        o.x = nd.x; o.y = nd.y; o.vx = nd.vx; o.vy = nd.vy;
        o.s = nd.s; o.rot = nd.rot; o.rotv = nd.rotv;
        o.spr = nd.spr; o.life = nd.life; o.age = 0;
      }
      o.vy += H * 0.30 * dt;
      o.x += o.vx * dt;
      o.y += o.vy * dt;
      o.rot += o.rotv * dt;
      life = clamp(1 - o.age / o.life, 0, 1);
      g.save();
      g.globalAlpha = life;
      g.translate(o.x, o.y);
      g.rotate(o.rot);
      g.drawImage(S[o.spr], -o.s * 0.5, -o.s * 0.5, o.s, o.s);
      g.restore();
    }
    g.globalAlpha = 1;
  }

  function drawLines(g, dt) {
    var i, o;
    for (i = 0; i < lines.length; i++) {
      o = lines[i];
      o.x -= o.sp * dt;
      if (o.x + o.len < 0) {
        o.x = W + rand(0, W * 0.4);
        o.y = rand(H * 0.14, H * 0.95);
        o.len = rand(W * 0.10, W * 0.34);
        o.a = rand(0.10, 0.30);
      }
      g.save();
      g.globalAlpha = o.a;
      g.drawImage(S.streak, o.x, o.y - H * 0.007, o.len, H * 0.014);
      g.restore();
    }
    g.globalAlpha = 1;
  }

  function render(dt) {
    var z = 1 + 0.014 * (0.5 - 0.5 * Math.cos(TAU * t / 30));
    var cx = W * 0.52, cy = H * 0.52;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(z, z);
    ctx.translate(-cx, -cy);

    if (bg) { ctx.drawImage(bg, 0, 0, W, H); }
    drawWaves(ctx);
    drawDust(ctx, dt);
    drawFlames(ctx);
    drawSparks(ctx, dt);
    drawDebris(ctx, dt);
    drawLines(ctx, dt);

    ctx.restore();

    /* host exit button lives top right: keep that corner calm and dark */
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

  function buildStatic() {
    if (bg) { bg.width = 1; bg.height = 1; bg = null; }
    bg = makeCanvas(W * dpr, H * dpr);
    var g = bg.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.lineJoin = 'round';
    g.lineCap = 'round';

    drawSky(g);
    drawGround(g);
    drawMech(g);

    /* warm backlight bleeding over the mech, and a soft cool bounce in front */
    g.save();
    g.globalCompositeOperation = 'lighter';
    blitGlow(g, S.gOrange, W * 0.86, H * 0.52, H * 0.85, 0.20);
    g.restore();
    blitGlow(g, S.gSmoke, W * 0.42, H * 0.80, H * 0.55, 0.30);
    blitGlow(g, S.gCyan, W * 0.46, H * 0.72, H * 0.26, 0.16, true);

    /* dusty haze over everything so nothing is a black hole */
    g.save();
    g.globalAlpha = 0.16;
    g.fillStyle = '#b8a894';
    g.fillRect(0, H * 0.42, W, H * 0.58);
    g.restore();

    /* gentle edge shade */
    var vg = g.createRadialGradient(W * 0.56, H * 0.50, Math.min(W, H) * 0.42,
      W * 0.56, H * 0.50, Math.max(W, H) * 0.88);
    vg.addColorStop(0, 'rgba(20,26,34,0)');
    vg.addColorStop(0.72, 'rgba(20,26,34,0.14)');
    vg.addColorStop(1, 'rgba(16,20,28,0.40)');
    g.fillStyle = vg;
    g.fillRect(0, 0, W, H);
  }

  function build() {
    measure();
    if (!S.spark) { buildSprites(); }
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
