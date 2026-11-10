/* ==========================================================================
   Ji-xie Du-shi / Mechanical Metropolis -- procedural canvas screensaver.
   Dusk sky over a future city: layered skylines, glowing facade strips,
   a huge orbital ring, floating platforms, a gantry crane, neon signage
   and drone formations. No characters of any kind.

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

  var canvas = document.getElementById('scene');
  if (!canvas) { return; }
  var ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) { return; }

  var W = 1, H = 1, dpr = 1;
  var bg = null;
  var S = {};
  var drones = [];
  var platforms = [];
  var ringDots = [];
  var hazes = [];
  var strips = [];
  var beacons = [];
  var t = 0, lastTs = 0, rafId = 0, resizeTimer = 0;

  var CYAN = '79,216,255';
  var ORANGE = '255,154,60';
  var PINK = '255,127,176';

  /* ---------------------------------------------------------------- utils */

  function rand(a, b) { return a + Math.random() * (b - a); }
  function round(v) { return Math.round(v); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  function mkRnd(seed) {
    var v = seed >>> 0;
    return function () {
      v = (v * 1664525 + 1013904223) >>> 0;
      return v / 4294967296;
    };
  }

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
    gr.addColorStop(core || 0.22, 'rgba(' + rgb + ',0.52)');
    gr.addColorStop(0.55, 'rgba(' + rgb + ',0.14)');
    gr.addColorStop(1.00, 'rgba(' + rgb + ',0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, c.width, c.height);
    return c;
  }

  function blitGlow(g, sprite, cx, cy, size, alpha) {
    g.save();
    g.globalAlpha = alpha;
    g.drawImage(sprite, cx - size * 0.5, cy - size * 0.5, size, size);
    g.restore();
  }

  /* --------------------------------------------------------------- sprites */

  function makeDrone() {
    var w = 64, h = 40, c = makeCanvas(w, h), g = c.getContext('2d');
    g.fillStyle = 'rgba(56,78,100,0.95)';
    g.beginPath();
    g.ellipse(w * 0.5, h * 0.55, w * 0.30, h * 0.16, 0, 0, TAU);
    g.fill();
    g.strokeStyle = 'rgba(230,244,252,0.85)';
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(w * 0.10, h * 0.52);
    g.lineTo(w * 0.90, h * 0.52);
    g.stroke();
    g.fillStyle = 'rgba(' + CYAN + ',1)';
    g.beginPath();
    g.arc(w * 0.24, h * 0.50, 3.2, 0, TAU);
    g.fill();
    g.beginPath();
    g.arc(w * 0.76, h * 0.50, 3.2, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(' + ORANGE + ',1)';
    g.beginPath();
    g.arc(w * 0.50, h * 0.62, 2.6, 0, TAU);
    g.fill();
    return c;
  }

  function makePlatform() {
    var s = 256, c = makeCanvas(s, s), g = c.getContext('2d');
    var cx = s * 0.5, cy = s * 0.5, rx = s * 0.44, ry = s * 0.18;
    /* underside glow */
    var ug = g.createLinearGradient(0, cy, 0, cy + s * 0.34);
    ug.addColorStop(0, 'rgba(' + CYAN + ',0.55)');
    ug.addColorStop(1, 'rgba(' + CYAN + ',0)');
    g.fillStyle = ug;
    g.beginPath();
    g.ellipse(cx, cy + s * 0.04, rx * 0.86, ry * 1.5, 0, 0, TAU);
    g.fill();
    /* body */
    g.fillStyle = 'rgba(214,230,242,0.95)';
    g.beginPath();
    g.ellipse(cx, cy, rx, ry, 0, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(126,152,176,0.95)';
    g.beginPath();
    g.ellipse(cx, cy + ry * 0.55, rx * 0.94, ry * 0.72, 0, 0, TAU);
    g.fill();
    /* deck rings */
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 2.4;
    g.beginPath();
    g.ellipse(cx, cy, rx, ry, 0, 0, TAU);
    g.stroke();
    g.strokeStyle = 'rgba(' + CYAN + ',0.85)';
    g.lineWidth = 1.8;
    g.beginPath();
    g.ellipse(cx, cy - ry * 0.24, rx * 0.62, ry * 0.62, 0, 0, TAU);
    g.stroke();
    /* edge lights */
    var i, a;
    for (i = 0; i < 8; i++) {
      a = i * (TAU / 8);
      g.fillStyle = i % 3 === 0 ? 'rgba(' + ORANGE + ',1)' : 'rgba(' + CYAN + ',1)';
      g.beginPath();
      g.arc(cx + Math.cos(a) * rx * 0.97, cy + Math.sin(a) * ry * 0.97, 2.6, 0, TAU);
      g.fill();
    }
    return c;
  }

  function makeCorner() {
    var cw = 420, ch = 230;
    var c = makeCanvas(cw * dpr, ch * dpr), g = c.getContext('2d');
    g.scale(dpr, dpr);
    var gr = g.createRadialGradient(cw - 2, 2, 0, cw - 2, 2, 392);
    gr.addColorStop(0.00, 'rgba(38,62,86,0.88)');
    gr.addColorStop(0.26, 'rgba(44,70,96,0.80)');
    gr.addColorStop(0.52, 'rgba(62,94,124,0.50)');
    gr.addColorStop(0.78, 'rgba(104,140,170,0.18)');
    gr.addColorStop(1.00, 'rgba(150,190,214,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, cw, ch);
    c._cw = cw;
    c._ch = ch;
    return c;
  }

  function buildSprites() {
    S.gWarm = makeGlow('255,206,150', 256, 0.26);
    S.gCyan = makeGlow(CYAN, 256, 0.26);
    S.gPink = makeGlow(PINK, 128, 0.30);
    S.gOrange = makeGlow(ORANGE, 128, 0.30);
    S.gHaze = makeGlow('255,232,206', 256, 0.34);
    S.gCool = makeGlow('196,228,248', 256, 0.34);
    S.drone = makeDrone();
    S.platform = makePlatform();
    S.corner = makeCorner();
  }

  /* ------------------------------------------------------------ the scene */

  function drawSky(g) {
    var sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0.00, '#7fc3e8');
    sky.addColorStop(0.24, '#93cdec');
    sky.addColorStop(0.46, '#bcd9ea');
    sky.addColorStop(0.62, '#efdcc4');
    sky.addColorStop(0.74, '#ffd9a8');
    sky.addColorStop(1.00, '#ffcf9c');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);

    /* low sun behind the skyline */
    blitGlow(g, S.gWarm, W * 0.635, H * 0.60, H * 1.15, 0.72);
    blitGlow(g, S.gWarm, W * 0.635, H * 0.595, H * 0.46, 0.55);
    blitGlow(g, S.gOrange, W * 0.635, H * 0.592, H * 0.18, 0.40);

    /* cloud bands, soft and horizontal */
    var i, y, w, a;
    for (i = 0; i < 9; i++) {
      y = H * (0.26 + i * 0.040);
      w = W * (0.24 + (i % 4) * 0.13);
      a = 0.10 + (i % 3) * 0.05;
      g.save();
      g.globalAlpha = a;
      g.fillStyle = i > 5 ? '#fff0d8' : '#ffffff';
      g.beginPath();
      g.ellipse(W * (0.10 + i * 0.093), y, w * 0.5, H * (0.008 + (i % 3) * 0.005), 0, 0, TAU);
      g.fill();
      g.restore();
    }
    /* thin contrails for depth */
    g.strokeStyle = 'rgba(255,244,228,0.30)';
    g.lineWidth = 1.6;
    for (i = 0; i < 4; i++) {
      g.beginPath();
      g.moveTo(W * (0.05 + i * 0.24), H * (0.16 + i * 0.055));
      g.lineTo(W * (0.30 + i * 0.24), H * (0.15 + i * 0.055));
      g.stroke();
    }
  }

  /* one tower: body, form shading, window grid, roof detail */
  function tower(g, rnd, x, w, top, base, col, opts) {
    var h = base - top;
    if (h <= 0 || w <= 0) { return; }
    g.fillStyle = col;
    g.fillRect(x, top, w, h);

    var sh = g.createLinearGradient(x, 0, x + w, 0);
    sh.addColorStop(0.00, 'rgba(255,255,255,0.20)');
    sh.addColorStop(0.42, 'rgba(255,255,255,0.03)');
    sh.addColorStop(1.00, 'rgba(26,46,68,0.26)');
    g.fillStyle = sh;
    g.fillRect(x, top, w, h);

    g.fillStyle = 'rgba(255,255,255,0.34)';
    g.fillRect(x, top, w, Math.max(1, h * 0.010));

    /* window grid */
    if (opts.win > 0) {
      var cols = clamp(round(w / (H * 0.021)), 2, 7);
      var rows = clamp(round(h / (H * 0.030)), 2, 26);
      var cw = w / cols, ch = h / rows;
      var i, j, wx, wy;
      for (j = 0; j < rows; j++) {
        for (i = 0; i < cols; i++) {
          if (rnd() > opts.win) { continue; }
          wx = x + cw * (i + 0.22);
          wy = top + ch * (j + 0.24);
          g.fillStyle = rnd() < 0.62
            ? 'rgba(255,232,187,' + (0.45 + rnd() * 0.5).toFixed(2) + ')'
            : 'rgba(205,242,255,' + (0.40 + rnd() * 0.5).toFixed(2) + ')';
          g.fillRect(wx, wy, cw * 0.56, ch * 0.46);
        }
      }
    }

    /* facade light strips */
    if (opts.strips > 0) {
      var k = opts.strips, sy;
      for (k = 0; k < opts.strips; k++) {
        sy = top + h * (0.14 + k * 0.30);
        if (sy > base - 2) { break; }
        g.fillStyle = opts.stripCol || 'rgba(' + CYAN + ',0.85)';
        g.fillRect(x + w * 0.06, sy, w * 0.88, Math.max(1.4, h * 0.008));
      }
    }

    /* roof detail: mast + edge lights */
    if (opts.roof) {
      var mx = x + w * 0.5;
      g.fillStyle = col;
      g.fillRect(mx - Math.max(1, w * 0.045), top - h * 0.12, Math.max(2, w * 0.09), h * 0.12);
      g.fillStyle = 'rgba(' + ORANGE + ',0.9)';
      g.fillRect(mx - 1.2, top - h * 0.12 - 3, 2.4, 3);
    }
  }

  function neonSign(g, x, y, w, h, rgb, vertical) {
    g.fillStyle = 'rgba(' + rgb + ',0.92)';
    g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(255,255,255,0.75)';
    if (vertical) {
      var i, n = Math.max(2, round(h / (H * 0.030)));
      for (i = 0; i < n; i++) {
        g.fillRect(x + w * 0.28, y + h * (0.08 + i * (0.84 / n)), w * 0.44, h * 0.022);
      }
    } else {
      g.fillRect(x + w * 0.06, y + h * 0.34, w * 0.88, h * 0.14);
      g.fillRect(x + w * 0.06, y + h * 0.56, w * 0.56, h * 0.12);
    }
  }

  function gantry(g, x, y, s, col) {
    /* a container-crane style gantry on a rooftop: frame + trolley + cable */
    g.strokeStyle = col;
    g.lineWidth = Math.max(2, s * 0.055);
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x - s * 1.05, y);
    g.lineTo(x + s * 1.05, y);
    g.stroke();
    g.beginPath();
    g.moveTo(x - s * 0.62, y);
    g.lineTo(x - s * 0.62, y + s * 0.95);
    g.moveTo(x + s * 0.62, y);
    g.lineTo(x + s * 0.62, y + s * 0.95);
    g.stroke();
    g.lineWidth = Math.max(1.4, s * 0.030);
    g.beginPath();
    g.moveTo(x - s * 0.62, y + s * 0.30);
    g.lineTo(x - s * 0.05, y);
    g.moveTo(x + s * 0.62, y + s * 0.30);
    g.lineTo(x + s * 0.05, y);
    g.stroke();
    /* trolley + cable + hook */
    g.fillStyle = col;
    g.fillRect(x + s * 0.24, y - s * 0.10, s * 0.26, s * 0.20);
    g.strokeStyle = 'rgba(230,244,252,0.9)';
    g.lineWidth = Math.max(1, s * 0.020);
    g.beginPath();
    g.moveTo(x + s * 0.37, y);
    g.lineTo(x + s * 0.37, y + s * 0.72);
    g.stroke();
    g.fillStyle = 'rgba(' + ORANGE + ',0.95)';
    g.beginPath();
    g.arc(x + s * 0.37, y + s * 0.76, Math.max(2, s * 0.055), 0, TAU);
    g.fill();
  }

  function drawLayerSet(g, layers) {
    var li, x, w, hgt, top, rnd, ly;
    for (li = 0; li < layers.length; li++) {
      ly = layers[li];
      rnd = mkRnd(ly.seed);
      x = -W * 0.02;
      while (x < W * 1.02) {
        w = W * (ly.wmin + rnd() * (ly.wmax - ly.wmin));
        hgt = H * (ly.hmin + rnd() * (ly.hmax - ly.hmin));
        top = H * ly.base - hgt;
        tower(g, rnd, x, w, top, H * ly.bot, ly.col, {
          win: ly.win,
          strips: rnd() < ly.strips * 0.5 ? ly.strips : 0,
          stripCol: li === 1 ? 'rgba(' + CYAN + ',0.9)' : 'rgba(255,236,206,0.75)',
          roof: rnd() < ly.roof
        });
        if (li >= 1 && rnd() < 0.42) {
          var signW = w * 0.30, signH = hgt * 0.42;
          var px = x + w * (rnd() < 0.5 ? 0.08 : 0.70);
          var py = top + hgt * 0.16;
          var pick = rnd();
          var rgb = pick < 0.45 ? CYAN : (pick < 0.75 ? ORANGE : PINK);
          neonSign(g, px, py, signW, signH, rgb, rnd() < 0.55);
          blitGlow(g, pick < 0.45 ? S.gCyan : (pick < 0.75 ? S.gOrange : S.gPink),
            px + signW * 0.5, py + signH * 0.5, signW * 8, 0.44);
        }
        x += w + W * ly.gap;
      }
    }
  }

  function drawViaduct(g) {
    g.fillStyle = 'rgba(150,176,200,0.94)';
    g.fillRect(0, H * 0.726, W, H * 0.016);
    g.fillStyle = 'rgba(104,132,160,0.96)';
    g.fillRect(0, H * 0.742, W, H * 0.009);
    var i, px2;
    for (i = 0; i < 13; i++) {
      px2 = W * (0.02 + i * 0.079);
      g.fillStyle = 'rgba(120,148,174,0.9)';
      g.fillRect(px2, H * 0.726, W * 0.007, H * 0.062);
    }
    g.fillStyle = 'rgba(' + CYAN + ',0.9)';
    g.fillRect(0, H * 0.724, W, 2.4);
    g.fillStyle = 'rgba(' + ORANGE + ',0.6)';
    g.fillRect(0, H * 0.750, W, 1.6);
    /* a capsule train running on the viaduct */
    var tx = W * 0.16;
    g.fillStyle = 'rgba(240,250,255,0.95)';
    g.beginPath();
    g.moveTo(tx, H * 0.700);
    g.lineTo(tx + W * 0.085, H * 0.700);
    g.lineTo(tx + W * 0.094, H * 0.712);
    g.lineTo(tx - W * 0.008, H * 0.712);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(' + CYAN + ',0.9)';
    for (i = 0; i < 6; i++) {
      g.fillRect(tx + W * (0.004 + i * 0.013), H * 0.7035, W * 0.007, H * 0.005);
    }
    blitGlow(g, S.gCyan, tx + W * 0.043, H * 0.706, W * 0.13, 0.22);
  }

  function drawStreetGlow(g) {
    var i, sy, sx, lg;
    for (i = 0; i < 11; i++) {
      sy = H * (0.845 + (i % 4) * 0.032);
      sx = W * ((i * 0.13) % 0.88);
      lg = g.createLinearGradient(sx, 0, sx + W * 0.14, 0);
      lg.addColorStop(0, 'rgba(255,226,180,0)');
      lg.addColorStop(0.5, 'rgba(255,226,180,0.60)');
      lg.addColorStop(1, 'rgba(255,226,180,0)');
      g.fillStyle = lg;
      g.fillRect(sx, sy, W * 0.14, Math.max(1.6, H * 0.0032));
    }
    /* warm ground spill */
    blitGlow(g, S.gWarm, W * 0.44, H * 0.960, W * 0.82, 0.50);
    blitGlow(g, S.gWarm, W * 0.74, H * 0.920, W * 0.42, 0.30);
    blitGlow(g, S.gCyan, W * 0.26, H * 0.930, W * 0.30, 0.16);
  }

  function drawCity(g) {
    drawLayerSet(g, [
      { base: 0.628, bot: 0.760, hmin: 0.014, hmax: 0.038, wmin: 0.014, wmax: 0.034,
        col: '#dfeaf3', win: 0.04, gap: 0.003, seed: 1103, strips: 0, roof: 0.12 },
      { base: 0.652, bot: 0.860, hmin: 0.024, hmax: 0.060, wmin: 0.018, wmax: 0.046,
        col: '#bdd2e2', win: 0.11, gap: 0.004, seed: 2207, strips: 0, roof: 0.22 }
    ]);

    drawViaduct(g);

    drawLayerSet(g, [
      { base: 0.694, bot: 0.980, hmin: 0.038, hmax: 0.086, wmin: 0.024, wmax: 0.062,
        col: '#8eaac2', win: 0.24, gap: 0.006, seed: 3313, strips: 1, roof: 0.32 },
      { base: 0.758, bot: 1.060, hmin: 0.028, hmax: 0.072, wmin: 0.040, wmax: 0.104,
        col: '#5f7d9a', win: 0.44, gap: 0.009, seed: 4409, strips: 2, roof: 0.42 }
    ]);

    drawStreetGlow(g);

    /* the gantry crane on a mid rooftop */
    gantry(g, W * 0.285, H * 0.520, H * 0.052, 'rgba(126,152,178,0.95)');
    blitGlow(g, S.gOrange, W * 0.285 + H * 0.019, H * 0.520 + H * 0.040, H * 0.09, 0.30);

    /* foreground framing towers (nearest, darkest) */
    foregroundTower(g, -W * 0.015, W * 0.130, H * 0.250, 1.04 * H, 5501);
    foregroundTower(g, W * 0.885, W * 0.132, H * 0.320, 1.04 * H, 6607);
  }
  function foregroundTower(g, x, w, top, base, seed) {
    var rnd = mkRnd(seed);
    /* three stacked setbacks, each narrower */
    var segs = [
      { x: x, w: w, t: top },
      { x: x + w * 0.16, w: w * 0.68, t: top - H * 0.045 },
      { x: x + w * 0.30, w: w * 0.40, t: top - H * 0.085 }
    ];
    var i, sg;
    for (i = segs.length - 1; i >= 0; i--) {
      sg = segs[i];
      tower(g, rnd, sg.x, sg.w, sg.t, base, '#4a6480', {
        win: 0.55, strips: 3, stripCol: 'rgba(' + CYAN + ',0.9)', roof: false
      });
    }
    /* sunlit edge */
    var eg = g.createLinearGradient(x, 0, x + w, 0);
    eg.addColorStop(0.00, 'rgba(255,236,206,0.00)');
    eg.addColorStop(1.00, 'rgba(255,226,178,0.20)');
    g.fillStyle = eg;
    g.fillRect(x, top - H * 0.085, w, base - top + H * 0.085);
    g.strokeStyle = 'rgba(216,238,252,0.55)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x + 1, top - H * 0.085);
    g.lineTo(x + 1, base);
    g.stroke();
    /* balcony ledges */
    var j, y;
    for (j = 0; j < 8; j++) {
      y = top + (base - top) * (0.10 + j * 0.105);
      g.fillStyle = 'rgba(196,218,236,0.42)';
      g.fillRect(x + w * 0.08, y, w * 0.84, Math.max(1.4, H * 0.0035));
    }
    /* mast + beacon */
    g.fillStyle = '#425972';
    g.fillRect(x + w * 0.48, top - H * 0.130, Math.max(2, w * 0.045), H * 0.048);
    blitGlow(g, S.gOrange, x + w * 0.50, top - H * 0.132, H * 0.05, 0.55);
  }
  function drawOrbitalRing(g) {
    var cx = W * 0.565, cy = H * 0.250;
    var rx = W * 0.300, ry = H * 0.080;
    var i;

    /* glow under the structure */
    blitGlow(g, S.gCool, cx, cy, W * 0.62, 0.22);

    /* main band: several concentric ellipse strokes */
    g.save();
    g.lineCap = 'round';
    var bands = [
      { w: H * 0.020, a: 0.30, c: 'rgba(' + CYAN + ',0.55)' },
      { w: H * 0.011, a: 0.95, c: 'rgba(226,242,252,0.95)' },
      { w: H * 0.026, a: 0.14, c: 'rgba(255,255,255,0.85)' }
    ];
    var b;
    for (b = 0; b < bands.length; b++) {
      g.strokeStyle = bands[b].c;
      g.lineWidth = bands[b].w;
      g.globalAlpha = bands[b].a;
      g.beginPath();
      g.ellipse(cx, cy, rx, ry, 0, 0, TAU);
      g.stroke();
    }
    g.globalAlpha = 1;

    /* structural spokes: 8 fixed cross ties */
    g.strokeStyle = 'rgba(198,222,240,0.75)';
    g.lineWidth = Math.max(1.4, H * 0.004);
    for (i = 0; i < 8; i++) {
      var a = i * (TAU / 8) + 0.16;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * rx * 0.94, cy + Math.sin(a) * ry * 0.94);
      g.lineTo(cx + Math.cos(a) * rx * 1.06, cy + Math.sin(a) * ry * 1.06);
      g.stroke();
    }
    /* inner secondary arc, offset for a mechanical feel */
    g.strokeStyle = 'rgba(255,205,150,0.55)';
    g.lineWidth = Math.max(1.2, H * 0.0032);
    g.beginPath();
    g.ellipse(cx, cy + H * 0.005, rx * 0.86, ry * 0.80, 0, 0.5, 3.1);
    g.stroke();

    /* station blocks on the ring */
    var blocks = [0.35, 1.55, 2.75, 3.95, 5.15];
    for (i = 0; i < blocks.length; i++) {
      var bx = cx + Math.cos(blocks[i]) * rx;
      var by = cy + Math.sin(blocks[i]) * ry;
      g.save();
      g.translate(bx, by);
      g.fillStyle = 'rgba(232,244,252,0.96)';
      g.beginPath();
      g.ellipse(0, 0, H * 0.016, H * 0.011, 0, 0, TAU);
      g.fill();
      g.fillStyle = 'rgba(' + (i % 2 ? ORANGE : CYAN) + ',0.95)';
      g.fillRect(-H * 0.006, -H * 0.003, H * 0.012, H * 0.006);
      g.restore();
      blitGlow(g, i % 2 ? S.gOrange : S.gCyan, bx, by, H * 0.070, 0.34);
    }
    g.restore();
  }

  /* ---------------------------------------------------------- dynamic bits */

  function initActors() {
    /* rotating dots along the orbital ring */
    ringDots.length = 0;
    var i;
    for (i = 0; i < 22; i++) {
      ringDots.push({ ph: i * (TAU / 22), big: i % 5 === 0 });
    }

    /* floating platforms */
    platforms.length = 0;
    var pdefs = [
      { x: 0.235, y: 0.335, s: 0.155, ph: 0.0 },
      { x: 0.780, y: 0.430, s: 0.120, ph: 1.7 },
      { x: 0.470, y: 0.130, s: 0.100, ph: 3.2 },
      { x: 0.880, y: 0.235, s: 0.086, ph: 4.6 },
      { x: 0.120, y: 0.475, s: 0.074, ph: 2.4 }
    ];
    for (i = 0; i < pdefs.length; i++) {
      platforms.push({
        bx: W * pdefs[i].x, by: H * pdefs[i].y, s: H * pdefs[i].s,
        ph: pdefs[i].ph, amp: H * rand(0.008, 0.018), pace: rand(0.28, 0.5)
      });
    }

    /* drone formations */
    drones.length = 0;
    var f, k, n;
    /* a long column crossing the frame */
    n = 11;
    for (k = 0; k < n; k++) {
      drones.push({
        mode: 'column', i0: k / (n - 1),
        x0: -0.15 + (k / (n - 1)) * 0.55, y0: 0.360 + (k % 3) * 0.030,
        sp: 0.020, s: 0.055, ph: rand(0, TAU)
      });
    }
    /* a V formation high on the right */
    for (k = 0; k < 9; k++) {
      var side = k === 0 ? 0 : (k % 2 === 0 ? 1 : -1);
      drones.push({
        mode: 'vee', i0: k / 9,
        x0: 0.700 + side * 0.028 * Math.ceil(k / 2),
        y0: 0.150 + 0.018 * Math.ceil(k / 2),
        sp: -0.012, s: 0.048, ph: rand(0, TAU)
      });
    }
    /* a low line over the viaduct */
    for (k = 0; k < 8; k++) {
      drones.push({
        mode: 'line', i0: k / 8,
        x0: 0.30 + (k / 8) * 0.42, y0: 0.660,
        sp: 0.016, s: 0.042, ph: rand(0, TAU)
      });
    }

    /* floating haze banks */
    hazes.length = 0;
    for (i = 0; i < 4; i++) {
      hazes.push({
        x: W * (0.1 + i * 0.26), y: H * (0.60 + (i % 2) * 0.055),
        w: W * (0.34 + (i % 3) * 0.10), h: H * (0.05 + (i % 2) * 0.02),
        sp: W * (0.004 + i * 0.002), a: 0.16 + (i % 3) * 0.05
      });
    }

    /* facade strips that breathe */
    strips.length = 0;
    for (i = 0; i < 12; i++) {
      strips.push({
        x: W * (0.03 + i * 0.083), y: H * (0.70 + ((i * 7) % 5) * 0.035),
        s: H * 0.09, ph: rand(0, TAU), pace: rand(0.4, 0.9),
        warm: i % 3 === 0
      });
    }

    /* antenna beacons */
    beacons.length = 0;
    var bdefs = [[0.098, 0.246], [0.905, 0.322], [0.285, 0.462], [0.660, 0.402]];
    for (i = 0; i < bdefs.length; i++) {
      beacons.push({ x: W * bdefs[i][0], y: H * bdefs[i][1], ph: rand(0, TAU) });
    }
  }

  /* ------------------------------------------------------------ per frame */

  function drawHaze(g, dt) {
    var i, o;
    for (i = 0; i < hazes.length; i++) {
      o = hazes[i];
      o.x += o.sp * dt;
      if (o.x > W * 1.2) { o.x = -o.w * 0.6; }
      g.save();
      g.globalAlpha = o.a;
      g.fillStyle = i % 2 ? '#fff3e0' : '#e8f4ff';
      g.beginPath();
      g.ellipse(o.x, o.y, o.w * 0.5, o.h * 0.5, 0, 0, TAU);
      g.fill();
      g.restore();
    }
    g.globalAlpha = 1;
  }

  function drawStrips(g) {
    var i, o;
    for (i = 0; i < strips.length; i++) {
      o = strips[i];
      blitGlow(g, o.warm ? S.gOrange : S.gCyan, o.x, o.y, o.s,
        0.16 + 0.22 * (0.5 + 0.5 * Math.sin(t * o.pace + o.ph)));
    }
  }

  function drawRingDots(g) {
    var cx = W * 0.565, cy = H * 0.250;
    var rx = W * 0.300, ry = H * 0.080;
    var i, o, a, dx, dy, r;
    for (i = 0; i < ringDots.length; i++) {
      o = ringDots[i];
      a = o.ph + t * 0.10;
      dx = cx + Math.cos(a) * rx;
      dy = cy + Math.sin(a) * ry;
      r = o.big ? H * 0.0075 : H * 0.0045;
      g.fillStyle = o.big ? 'rgba(255,214,160,1)' : 'rgba(214,248,255,0.95)';
      g.beginPath();
      g.arc(dx, dy, r, 0, TAU);
      g.fill();
      if (o.big) {
        blitGlow(g, S.gOrange, dx, dy, H * 0.060, 0.45);
      }
    }
  }

  function drawPlatforms(g) {
    var i, o, s, dy;
    for (i = 0; i < platforms.length; i++) {
      o = platforms[i];
      dy = Math.sin(t * o.pace + o.ph) * o.amp;
      s = o.s;
      g.save();
      g.globalAlpha = 0.94;
      g.drawImage(S.platform, o.bx - s * 0.5, o.by - s * 0.25 + dy, s, s * 0.5);
      g.restore();
      blitGlow(g, S.gCyan, o.bx, o.by + s * 0.10 + dy, s * 0.55, 0.20);
    }
  }

  function drawDrones(g) {
    var i, o, x, y, s, bob;
    for (i = 0; i < drones.length; i++) {
      o = drones[i];
      if (o.mode === 'column') {
        x = ((o.x0 + t * o.sp) % 1.32) * W - W * 0.12;
        y = H * o.y0;
      } else if (o.mode === 'vee') {
        x = W * (o.x0 + t * o.sp * 0.4);
        y = H * o.y0;
      } else {
        x = ((o.x0 + t * o.sp) % 1.24) * W - W * 0.08;
        y = H * o.y0;
      }
      bob = Math.sin(t * 0.7 + o.ph) * H * 0.004;
      s = H * o.s;
      g.save();
      g.globalAlpha = 0.92;
      g.drawImage(S.drone, x - s * 0.5, y - s * 0.25 + bob, s, s * 0.62);
      g.restore();
    }
    g.globalAlpha = 1;
  }

  function drawBeacons(g) {
    var i, o, a;
    for (i = 0; i < beacons.length; i++) {
      o = beacons[i];
      a = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(t * 1.1 + o.ph));
      blitGlow(g, S.gOrange, o.x, o.y, H * 0.05, a);
      g.fillStyle = 'rgba(255,170,90,' + a.toFixed(2) + ')';
      g.beginPath();
      g.arc(o.x, o.y, H * 0.0042, 0, TAU);
      g.fill();
    }
  }

  function render(dt) {
    var z = 1 + 0.015 * (0.5 - 0.5 * Math.cos(TAU * t / 40));
    var cx = W * 0.52, cy = H * 0.50;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(z, z);
    ctx.translate(-cx, -cy);

    if (bg) { ctx.drawImage(bg, 0, 0, W, H); }
    drawHaze(ctx, dt);
    drawStrips(ctx);
    drawRingDots(ctx);
    drawPlatforms(ctx);
    drawDrones(ctx);
    drawBeacons(ctx);

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
    drawOrbitalRing(g);
    drawCity(g);

    /* atmosphere pass: warm haze over the distance */
    g.save();
    g.globalAlpha = 0.20;
    var at = g.createLinearGradient(0, H * 0.50, 0, H * 0.78);
    at.addColorStop(0, 'rgba(255,226,190,0)');
    at.addColorStop(0.55, 'rgba(255,222,182,0.55)');
    at.addColorStop(1, 'rgba(255,214,168,0)');
    g.fillStyle = at;
    g.fillRect(0, H * 0.50, W, H * 0.30);
    g.restore();

    /* gentle overall veil so nothing reads as a black hole */
    var vg = g.createRadialGradient(W * 0.52, H * 0.50, Math.min(W, H) * 0.44,
      W * 0.52, H * 0.50, Math.max(W, H) * 0.90);
    vg.addColorStop(0, 'rgba(255,255,255,0)');
    vg.addColorStop(0.74, 'rgba(206,226,242,0.10)');
    vg.addColorStop(1, 'rgba(168,200,224,0.26)');
    g.fillStyle = vg;
    g.fillRect(0, 0, W, H);
  }

  function build() {
    measure();
    if (!S.drone) { buildSprites(); }
    S.corner = makeCorner();
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
