/* ===========================================================================
   sakura neon  --  a high-key dusk scene: peach-to-lilac sky, a soft lavender
   skyline, cherry petals drifting, a girl in a pale kimono holding a clear
   umbrella, and a pale wet street holding a soft reflection.

   Pure 2D canvas, fully procedural. No external images / fonts / network /
   storage. No pointer or key listeners, no exit button (the host injects it).
   Static art (sky, skyline, signs, petals, reflection, glows) is pre-rendered
   into offscreen canvases and only blitted per frame. Per-frame code never
   calls shadowBlur / createRadialGradient / getImageData / fillText.
   =========================================================================== */
(function () {
  'use strict';

  var cv = document.getElementById('stage');
  var ctx = cv && cv.getContext ? cv.getContext('2d') : null;
  if (!ctx) { return; }

  var TAU = 6.283185307179586;
  var MAX_DPR = 1.5;
  var HOR = 0.665;                     /* horizon */
  var KARC = 0.5522847498;

  var W = 1, H = 1, dpr = 1, DW = 1, DH = 1, u = 1, HZ = 1;

  /* offscreen layers */
  var bgCan = null, bgc = null;
  var reflCan = null, rc = null;
  var scrimCan = null;
  var branchCan = null;
  var sprWarm = null, sprPink = null, sprCyan = null, sprWhite = null,
    sprGold = null, sprLilac = null, sprShade = null, sprBlush = null;
  var petalSpr = [];
  var bokehSpr = [];

  var G = null;
  var signs = [];
  var petals = [];
  var bokehs = [];

  var t = 0, last = 0, rafId = 0, resizeTimer = 0;

  /* ------------------------------------------------------------------ utils */

  function makeCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }

  function mod(a, n) { return a - Math.floor(a / n) * n; }

  function makeRng(seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  /* soft round sprite: light core fading to nothing */
  function softSprite(size, r, g, b, coreA) {
    var c = makeCanvas(size, size);
    var x = c.getContext('2d');
    var h = size / 2;
    var gr = x.createRadialGradient(h, h, 0, h, h, h);
    gr.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ',' + coreA + ')');
    gr.addColorStop(0.30, 'rgba(' + r + ',' + g + ',' + b + ',' + (coreA * 0.55).toFixed(3) + ')');
    gr.addColorStop(0.62, 'rgba(' + r + ',' + g + ',' + b + ',' + (coreA * 0.18).toFixed(3) + ')');
    gr.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',0)');
    x.fillStyle = gr;
    x.fillRect(0, 0, size, size);
    return c;
  }

  function blit(g2, spr, x, y, w, h, a) {
    if (!spr || a <= 0) { return; }
    g2.globalAlpha = a;
    g2.drawImage(spr, x - w / 2, y - h / 2, w, h);
    g2.globalAlpha = 1;
  }

  function fogBand(g2, yTop, yBot, r, g, b, aTop, aBot) {
    if (yBot <= yTop) { return; }
    var fg = g2.createLinearGradient(0, yTop, 0, yBot);
    fg.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ',' + aTop + ')');
    fg.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',' + aBot + ')');
    g2.fillStyle = fg;
    g2.fillRect(0, yTop, W, yBot - yTop);
  }

  /* --------------------------------------------------------------- sprites */

  function makeScrim() {
    /* a soft dusk shade over the top-right corner, dark enough that the host
       can drop a light-coloured exit button on it, but never black */
    var c = makeCanvas(400, 280);
    var x = c.getContext('2d');
    var gr = x.createRadialGradient(200, 140, 12, 200, 140, 200);
    gr.addColorStop(0, 'rgba(84,64,116,0.46)');
    gr.addColorStop(0.45, 'rgba(96,76,130,0.30)');
    gr.addColorStop(0.75, 'rgba(104,86,132,0.18)');
    gr.addColorStop(1, 'rgba(120,104,148,0)');
    x.fillStyle = gr;
    x.fillRect(0, 0, 400, 280);
    return c;
  }

  function makeBlossom(S) {
    var c = makeCanvas(S, S);
    var x = c.getContext('2d');
    var m = S / 2;
    var r = S * 0.40;
    for (var i = 0; i < 5; i++) {
      var a = (i / 5) * TAU - 1.5707963;
      var px = m + Math.cos(a) * r * 0.62;
      var py = m + Math.sin(a) * r * 0.62;
      var gr = x.createRadialGradient(px - Math.cos(a) * r * 0.2, py - Math.sin(a) * r * 0.2, 1,
        px, py, r * 0.78);
      gr.addColorStop(0, 'rgba(255,244,248,0.98)');
      gr.addColorStop(0.55, 'rgba(255,206,224,0.94)');
      gr.addColorStop(1, 'rgba(255,170,202,0.42)');
      x.fillStyle = gr;
      x.beginPath();
      x.ellipse(px, py, r * 0.58, r * 0.44, a, 0, TAU);
      x.fill();
    }
    var cg = x.createRadialGradient(m, m, 1, m, m, r * 0.46);
    cg.addColorStop(0, 'rgba(255,246,222,0.98)');
    cg.addColorStop(1, 'rgba(255,214,170,0)');
    x.fillStyle = cg;
    x.beginPath();
    x.arc(m, m, r * 0.46, 0, TAU);
    x.fill();
    x.fillStyle = 'rgba(255,206,142,0.90)';
    for (var k = 0; k < 7; k++) {
      var aa = (k / 7) * TAU + 0.3;
      x.beginPath();
      x.arc(m + Math.cos(aa) * r * 0.28, m + Math.sin(aa) * r * 0.28, S * 0.013, 0, TAU);
      x.fill();
    }
    return c;
  }

  function buildBranch() {
    var cw = Math.round(W * 0.46);
    var ch = Math.round(H * 0.30);
    branchCan = makeCanvas(cw * dpr, ch * dpr);
    var g2 = branchCan.getContext('2d');
    if (!g2) { return; }
    g2.setTransform(dpr, 0, 0, dpr, 0, 0);
    g2.clearRect(0, 0, cw, ch);
    var rng = makeRng(31415);
    var bloom = makeBlossom(96);

    function limb(x0, y0, cx0, cy0, x1, y1, w0, w1) {
      var N = 22;
      g2.lineCap = 'round';
      for (var i = 0; i < N; i++) {
        var t0 = i / N;
        var t1 = (i + 1) / N;
        var ax = (1 - t0) * (1 - t0) * x0 + 2 * (1 - t0) * t0 * cx0 + t0 * t0 * x1;
        var ay = (1 - t0) * (1 - t0) * y0 + 2 * (1 - t0) * t0 * cy0 + t0 * t0 * y1;
        var bx = (1 - t1) * (1 - t1) * x0 + 2 * (1 - t1) * t1 * cx0 + t1 * t1 * x1;
        var by = (1 - t1) * (1 - t1) * y0 + 2 * (1 - t1) * t1 * cy0 + t1 * t1 * y1;
        g2.strokeStyle = t0 < 0.5 ? '#8d6049' : '#9a6d53';
        g2.lineWidth = Math.max(1.2, w0 + (w1 - w0) * t0);
        g2.beginPath();
        g2.moveTo(ax, ay);
        g2.lineTo(bx, by);
        g2.stroke();
      }
      return { x: x1, y: y1 };
    }

    /* three branches reaching in from the top-left corner */
    var t1 = limb(-8, ch * 0.06, cw * 0.16, ch * 0.20, cw * 0.46, ch * 0.12, 7 * u, 2.4 * u);
    var t2 = limb(-5, ch * 0.30, cw * 0.20, ch * 0.42, cw * 0.34, ch * 0.66, 5.5 * u, 2.0 * u);
    var t3 = limb(cw * 0.10, ch * 0.02, cw * 0.30, ch * 0.02, cw * 0.44, ch * 0.30, 4.0 * u, 1.6 * u);

    /* small twigs + blossom clusters */
    var tips = [
      { x: cw * 0.46, y: ch * 0.12, n: 7, r: 26 },
      { x: cw * 0.30, y: ch * 0.22, n: 5, r: 22 },
      { x: cw * 0.34, y: ch * 0.66, n: 6, r: 24 },
      { x: cw * 0.16, y: ch * 0.44, n: 5, r: 20 },
      { x: cw * 0.44, y: ch * 0.30, n: 4, r: 18 },
      { x: cw * 0.08, y: ch * 0.62, n: 4, r: 18 }
    ];
    for (var i = 0; i < tips.length; i++) {
      var tp = tips[i];
      for (var k = 0; k < tp.n; k++) {
        var ang = rng() * TAU;
        var rad = rng() * tp.r * u;
        var bx = tp.x + Math.cos(ang) * rad;
        var by = tp.y + Math.sin(ang) * rad * 0.75;
        var sz = (16 + rng() * 18) * u;
        g2.save();
        g2.translate(bx, by);
        g2.rotate(rng() * TAU);
        g2.globalAlpha = 0.82 + rng() * 0.18;
        g2.drawImage(bloom, -sz / 2, -sz / 2, sz, sz);
        g2.restore();
      }
      /* a couple of loose petals near the cluster */
      for (var p2 = 0; p2 < 2; p2++) {
        var sz2 = (10 + rng() * 12) * u;
        g2.save();
        g2.translate(tp.x + (rng() - 0.5) * tp.r * 2 * u, tp.y + (rng() - 0.5) * tp.r * 1.6 * u);
        g2.rotate(rng() * TAU);
        g2.globalAlpha = 0.7;
        g2.drawImage(petalSpr[Math.floor(rng() * 3)], -sz2 / 2, -sz2 / 2, sz2, sz2);
        g2.restore();
      }
    }
    g2.globalAlpha = 1;
  }
  function makePetal(size, r, g, b) {
    var S = size * 1.7;
    var c = makeCanvas(S, S);
    var x = c.getContext('2d');
    var cx = S / 2;
    var cy = S / 2;
    var rx = size * 0.35;
    var ry = size * 0.56;
    x.translate(cx, cy);
    x.rotate(0.32);
    /* soft teardrop petal */
    x.beginPath();
    x.moveTo(0, ry);
    x.bezierCurveTo(rx * 1.10, ry * 0.45, rx * 1.02, -ry * 0.62, 0, -ry);
    x.bezierCurveTo(-rx * 1.02, -ry * 0.62, -rx * 1.10, ry * 0.45, 0, ry);
    x.closePath();
    var gr = x.createRadialGradient(-rx * 0.25, ry * 0.20, 1, 0, 0, ry * 1.15);
    gr.addColorStop(0, 'rgba(' + Math.min(255, r + 24) + ',' + Math.min(255, g + 18) + ',' + Math.min(255, b + 14) + ',0.98)');
    gr.addColorStop(0.50, 'rgba(' + r + ',' + g + ',' + b + ',0.92)');
    gr.addColorStop(1, 'rgba(' + Math.max(0, r - 30) + ',' + Math.max(0, g - 44) + ',' + Math.max(0, b - 24) + ',0.62)');
    x.fillStyle = gr;
    x.fill();
    /* notch at the outer tip, the cherry-blossom giveaway */
    x.globalCompositeOperation = 'destination-out';
    x.beginPath();
    x.ellipse(0, ry * 0.99, rx * 0.44, ry * 0.34, 0, 0, TAU);
    x.fill();
    x.globalCompositeOperation = 'source-over';
    return c;
  }

  function buildSprites() {
    sprWarm = softSprite(160, 255, 232, 198, 0.95);
    sprGold = softSprite(160, 255, 214, 158, 0.95);
    sprPink = softSprite(160, 255, 150, 196, 0.90);
    sprCyan = softSprite(160, 150, 236, 255, 0.85);
    sprWhite = softSprite(160, 255, 255, 255, 0.95);
    sprLilac = softSprite(160, 206, 178, 240, 0.75);
    sprShade = softSprite(160, 146, 108, 138, 0.55);
    sprBlush = softSprite(96, 255, 138, 168, 0.60);

    petalSpr = [
      makePetal(24, 255, 198, 222),
      makePetal(32, 255, 228, 240),
      makePetal(20, 250, 170, 204)
    ];

    scrimCan = makeScrim();
    bokehSpr = [sprGold, sprWarm, sprPink, sprLilac];
  }

  /* ------------------------------------------------------------- geometry */

  function computeGeo() {
    var footY = H * 0.888;
    var headTop = H * 0.205;
    var bodyH = footY - headTop;
    var headH = bodyH / 6.6;            /* a slightly manga-ish head */
    var hcx = W * 0.638;

    var g = {};
    g.headH = headH;
    g.headTop = headTop;
    g.headCy = headTop + headH * 0.50;
    g.hcx = hcx;
    g.footY = footY;
    g.bodyH = bodyH;

    g.headW = headH * 0.74;
    g.neckY = headTop + headH * 0.96;
    g.shoulderY = headTop + headH * 1.58;
    g.chestY = headTop + headH * 2.45;
    g.waistY = headTop + headH * 3.10;
    g.hipY = headTop + headH * 3.70;
    g.hemY = headTop + headH * 5.10;
    g.kneeY = headTop + headH * 5.55;

    g.sho = headH * 0.82;
    g.wai = headH * 0.58;
    g.hip = headH * 0.76;
    g.hem = headH * 1.10;

    g.poleX = hcx + W * 0.030;
    g.handY = headTop + headH * 2.55;

    g.apexY = H * 0.045;
    g.rimY = H * 0.178;
    g.ur = W * 0.125;

    /* a few petals that have settled on the umbrella */
    var brng = makeRng(7311);
    g.stuck = [];
    for (var i = 0; i < 7; i++) {
      var bx = (brng() * 1.62 - 0.81) * g.ur;
      var t01 = (bx / g.ur + 1) / 2;
      var topY = -Math.sqrt(Math.max(0, 1 - t01 * t01 * 0.94)) * (g.rimY - g.apexY);
      g.stuck.push({
        x: bx,
        y: topY * 0.55 + brng() * 0.12 * (g.rimY - g.apexY),
        s: (0.55 + brng() * 0.5) * headH * 0.30,
        rot: brng() * TAU,
        v: Math.floor(brng() * 3)
      });
    }

    G = g;
  }

  /* ---------------------------------------------------------------- petals */

  function spawnPetal(seed) {
    var z = 0.35 + Math.random() * 0.85;         /* depth: size + speed */
    var front = z > 0.95;
    return {
      x: Math.random() * (W + 120 * u) - 60 * u,
      y: seed ? Math.random() * H : -40 * u - Math.random() * H * 0.3,
      z: z,
      s: (16 + z * 26) * u,
      vy: (26 + z * 52) * u,
      vx: (12 + Math.random() * 26) * u,
      sway: 6 + z * 16,
      ph: Math.random() * TAU,
      rot: Math.random() * TAU,
      vrot: (Math.random() - 0.5) * 0.9,
      a: front ? 0.26 + Math.random() * 0.16 : 0.62 + Math.random() * 0.34,
      v: Math.floor(Math.random() * 3),
      front: front
    };
  }

  function initPetals() {
    petals.length = 0;
    var n = 112;
    for (var i = 0; i < n; i++) { petals.push(spawnPetal(true)); }
  }

  function initBokeh() {
    bokehs.length = 0;
    for (var i = 0; i < 13; i++) {
      bokehs.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: (18 + Math.random() * 62) * u,
        a: 0.10 + Math.random() * 0.20,
        vx: (Math.random() - 0.5) * 9 * u,
        vy: -(3 + Math.random() * 9) * u,
        ph: Math.random() * TAU,
        sp: bokehSpr[Math.floor(Math.random() * 4)]
      });
    }
  }

  /* ----------------------------------------------------------------- signs */

  function drawVertText(g2, text, cx, by, bh, size, fill) {
    var step = size * 1.08;
    var total = step * text.length;
    var y0 = by + (bh - total) / 2 + step / 2;
    g2.textAlign = 'center';
    g2.textBaseline = 'middle';
    g2.font = '700 ' + size.toFixed(1) + 'px "Microsoft YaHei","PingFang SC","Noto Sans SC",sans-serif';
    g2.fillStyle = fill;
    for (var i = 0; i < text.length; i++) {
      g2.fillText(text.charAt(i), cx, y0 + step * i);
    }
  }

  function buildSigns(g2, rng) {
    signs.length = 0;
    var defs = [
      { x: 0.030, y: 0.300, w: 0.056, h: 0.240, kind: 'pink', text: '\u591c\u685c', spr: 'pink' },
      { x: 0.104, y: 0.262, w: 0.050, h: 0.205, kind: 'cyan', text: 'SAKURA', spr: 'cyan' },
      { x: 0.166, y: 0.500, w: 0.042, h: 0.138, kind: 'pink', text: '\u82b1', spr: 'pink' }
    ];
    for (var i = 0; i < defs.length; i++) {
      var d = defs[i];
      var bx = d.x * W, by = d.y * H, bw = d.w * W, bh = d.h * H;
      var spr = d.spr === 'pink' ? sprPink : sprCyan;
      var panel = d.kind === 'pink' ? 'rgba(255,168,206,0.80)' : 'rgba(150,232,250,0.80)';
      var edge = d.kind === 'pink' ? 'rgba(255,255,255,0.95)' : 'rgba(245,255,255,0.95)';

      /* soft bloom around the sign, built into the background */
      blit(g2, spr, bx + bw / 2, by + bh * 0.5, bw * 7.5, bh * 2.8, 0.30);
      blit(g2, spr, bx + bw / 2, by + bh * 0.5, bw * 3.0, bh * 1.25, 0.32);

      g2.fillStyle = panel;
      g2.fillRect(bx, by, bw, bh);
      g2.fillStyle = 'rgba(255,255,255,0.35)';
      g2.fillRect(bx, by, bw, bh * 0.30);

      g2.strokeStyle = edge;
      g2.lineWidth = Math.max(1, 1.8 * u);
      g2.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
      g2.strokeStyle = 'rgba(255,255,255,0.45)';
      g2.lineWidth = Math.max(1, 1.0 * u);
      g2.strokeRect(bx + 3.5 * u, by + 3.5 * u, bw - 7 * u, bh - 7 * u);

      var size = Math.min(bw * 0.80, (bh * 0.84) / (d.text.length * 1.08));
      drawVertText(g2, d.text, bx + bw / 2, by + bh * 0.11, bh * 0.78, size, 'rgba(255,255,255,0.97)');

      signs.push({
        x: bx, y: by, w: bw, h: bh,
        spr: spr,
        ph: rng() * TAU,
        sp: 0.55 + rng() * 0.5
      });
    }
  }

  /* ---------------------------------------------------------------- skyline */

  function skyline(g2, rng, cfg) {
    var x = -cfg.pad * W;
    while (x < W * (1 + cfg.pad)) {
      var bw = (cfg.wMin + rng() * (cfg.wMax - cfg.wMin)) * W;
      var bh = (cfg.hMin + rng() * (cfg.hMax - cfg.hMin)) * H;
      if (cfg.hole && x + bw > cfg.hole[0] * W && x < cfg.hole[1] * W) {
        x = cfg.hole[1] * W;
        continue;
      }
      var top = cfg.base - bh;

      g2.fillStyle = cfg.color;
      g2.fillRect(x, top, bw, bh + 3 * u);
      g2.fillStyle = cfg.edge;
      g2.fillRect(x, top, Math.max(1, 1.4 * u), bh);

      if (rng() < 0.45) {
        var ax = x + bw * (0.14 + rng() * 0.7);
        var ah = H * (0.010 + rng() * 0.026);
        g2.fillStyle = cfg.color;
        g2.fillRect(ax, top - ah, Math.max(1, 1.4 * u), ah + 2 * u);
      }

      /* windows: warm little panes */
      var cw = cfg.cellW * W;
      var ch = cfg.cellH * H;
      var cols = Math.max(1, Math.floor((bw * 0.84) / cw));
      var rows = Math.max(1, Math.floor((bh * 0.86) / ch));
      var ox = x + (bw - cols * cw) / 2 + cw * 0.24;
      var oy = top + ch * 0.78;
      for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
          if (rng() > cfg.win) { continue; }
          var wa = cfg.waMin + rng() * (cfg.waMax - cfg.waMin);
          var warm = rng() < 0.42;
          var wx = ox + c * cw;
          var wy = oy + r * ch;
          g2.fillStyle = warm
            ? 'rgba(255,246,224,' + wa.toFixed(3) + ')'
            : 'rgba(255,232,244,' + wa.toFixed(3) + ')';
          g2.fillRect(wx, wy, cw * 0.56, ch * 0.52);
          if (wa > 0.60) {
            blit(g2, warm ? sprGold : sprPink, wx + cw * 0.28, wy + ch * 0.26,
              cw * 2.6, ch * 2.6, (wa - 0.60) * 0.55);
          }
        }
      }

      if (cfg.rim) {
        g2.strokeStyle = cfg.rim;
        g2.lineWidth = Math.max(1, 1.2 * u);
        g2.beginPath();
        g2.moveTo(x, top + 0.5 * u);
        g2.lineTo(x + bw, top + 0.5 * u);
        g2.stroke();
      }

      x += bw + (rng() < 0.20 ? cfg.gap * W : 0);
    }
  }

  /* ------------------------------------------------------------------ scene */

  function buildScene() {
    bgCan = makeCanvas(DW, DH);
    bgc = bgCan.getContext('2d');
    var g2 = bgc;
    g2.setTransform(dpr, 0, 0, dpr, 0, 0);
    g2.clearRect(0, 0, W, H);

    /* dusk sky: lilac at the top, peach at the horizon */
    var sky = g2.createLinearGradient(0, 0, 0, HZ);
    sky.addColorStop(0.00, '#d6c6f6');
    sky.addColorStop(0.24, '#e6d7ff');
    sky.addColorStop(0.50, '#f4d8e8');
    sky.addColorStop(0.76, '#ffd9c2');
    sky.addColorStop(1.00, '#ffe6d0');
    g2.fillStyle = sky;
    g2.fillRect(0, 0, W, HZ + 2);

    /* pale wet street */
    var grd = g2.createLinearGradient(0, HZ, 0, H);
    grd.addColorStop(0.00, '#f7e2e6');
    grd.addColorStop(0.32, '#efd5e0');
    grd.addColorStop(0.70, '#e6cbdb');
    grd.addColorStop(1.00, '#ddc3d7');
    g2.fillStyle = grd;
    g2.fillRect(0, HZ, W, H - HZ + 2);

    /* the low sun, sitting behind the skyline on the right */
    blit(g2, sprGold, W * 0.760, H * 0.545, W * 0.72, H * 0.42, 0.55);
    blit(g2, sprWarm, W * 0.745, H * 0.560, W * 0.34, H * 0.20, 0.72);
    blit(g2, sprWhite, W * 0.742, H * 0.562, W * 0.13, H * 0.085, 0.55);

    /* soft dusk clouds */
    var crng = makeRng(5551);
    for (var c = 0; c < 9; c++) {
      var cx0 = crng() * W;
      var cy0 = H * (0.06 + crng() * 0.34);
      var cw0 = W * (0.16 + crng() * 0.34);
      var ch0 = H * (0.035 + crng() * 0.055);
      blit(g2, crng() < 0.6 ? sprWhite : sprLilac, cx0, cy0, cw0, ch0, 0.16 + crng() * 0.16);
      blit(g2, sprWhite, cx0 + cw0 * 0.12, cy0 + ch0 * 0.22, cw0 * 0.6, ch0 * 0.6, 0.10);
    }

    var rng = makeRng(20261111);

    /* far skyline: pale, hazy */
    skyline(g2, rng, {
      pad: 0.06, base: HZ + 1.5 * u,
      hMin: 0.070, hMax: 0.165, wMin: 0.050, wMax: 0.150, gap: 0.012,
      color: '#c6b2e2', edge: 'rgba(255,255,255,0.42)',
      win: 0.20, cellW: 0.0090, cellH: 0.0100,
      waMin: 0.18, waMax: 0.55, rim: 'rgba(255,255,255,0.35)'
    });
    fogBand(g2, HZ - H * 0.44, HZ, 255, 226, 236, 0.05, 0.42);

    /* mid skyline */
    skyline(g2, rng, {
      pad: 0.05, base: HZ + 3 * u,
      hMin: 0.110, hMax: 0.245, wMin: 0.060, wMax: 0.165, gap: 0.014,
      color: '#b096cc', edge: 'rgba(255,255,255,0.42)',
      win: 0.22, cellW: 0.0108, cellH: 0.0120,
      waMin: 0.24, waMax: 0.72, rim: 'rgba(255,250,255,0.42)'
    });
    fogBand(g2, HZ - H * 0.34, HZ, 255, 220, 232, 0.04, 0.26);

    /* near skyline: still light, but the darkest thing in the scene */
    skyline(g2, rng, {
      pad: 0.04, base: HZ + 6 * u,
      hMin: 0.150, hMax: 0.310, wMin: 0.080, wMax: 0.185, gap: 0.020,
      color: '#9879b4', edge: 'rgba(255,255,255,0.55)',
      win: 0.24, cellW: 0.0130, cellH: 0.0144,
      waMin: 0.30, waMax: 0.85, rim: 'rgba(255,252,255,0.55)',
      hole: [0.545, 0.775]
    });
    fogBand(g2, HZ - H * 0.26, HZ, 255, 224, 236, 0.03, 0.16);

    /* glow spilling out of the cross street behind her */
    blit(g2, sprWarm, W * 0.665, H * 0.585, W * 0.46, H * 0.36, 0.46);
    blit(g2, sprWhite, W * 0.668, H * 0.575, W * 0.20, H * 0.20, 0.34);

    /* a band of distant shop lights along the avenue */
    var avenue = [
      [255, 176, 208], [150, 232, 250], [255, 226, 178], [255, 255, 255]
    ];
    for (var s = 0; s < 30; s++) {
      var sx = W * (0.004 + rng() * 0.99);
      var sw = W * (0.005 + rng() * 0.020);
      var sh = H * (0.0028 + rng() * 0.0042);
      var ac = avenue[Math.floor(rng() * 4)];
      var aspr = ac[0] === 150 ? sprCyan : (ac[0] === 255 && ac[1] === 176 ? sprPink : sprWarm);
      var sy = HZ - sh * (1.0 + rng() * 2.0);
      blit(g2, aspr, sx + sw / 2, sy, sw * 6.0, sh * 10.0, 0.26 + rng() * 0.26);
      g2.fillStyle = 'rgba(' + ac[0] + ',' + ac[1] + ',' + ac[2] + ',' + (0.50 + rng() * 0.42).toFixed(2) + ')';
      g2.fillRect(sx, sy - sh * 0.5, sw, sh);
    }

    /* soft pink / cyan light signs on the left fifth */
    buildSigns(g2, rng);

    /* misty waterline */
    var wl = g2.createLinearGradient(0, HZ - 26 * u, 0, HZ + 18 * u);
    wl.addColorStop(0.00, 'rgba(255,236,232,0)');
    wl.addColorStop(0.34, 'rgba(255,240,234,0.30)');
    wl.addColorStop(0.50, 'rgba(255,248,240,0.52)');
    wl.addColorStop(0.66, 'rgba(255,238,234,0.26)');
    wl.addColorStop(1.00, 'rgba(255,228,230,0)');
    g2.fillStyle = wl;
    g2.fillRect(0, HZ - 26 * u, W, 44 * u);

    /* gentle grain so the wide flat areas are not plastic */
    var noise = makeCanvas(160, 160);
    var nx = noise.getContext('2d');
    if (nx) {
      var img = nx.createImageData(160, 160);
      var data = img.data;
      for (var p = 0; p < data.length; p += 4) {
        var v = 150 + Math.floor(Math.random() * 105);
        data[p] = v;
        data[p + 1] = v;
        data[p + 2] = v;
        data[p + 3] = Math.floor(Math.random() * 26);
      }
      nx.putImageData(img, 0, 0);
      var npat = g2.createPattern(noise, 'repeat');
      g2.globalAlpha = 0.45;
      g2.fillStyle = npat;
      g2.fillRect(0, 0, W, H);
      g2.globalAlpha = 1;
    }

    /* light lens vignette (never black) */
    var vg = g2.createRadialGradient(W * 0.50, H * 0.44, Math.min(W, H) * 0.30,
      W * 0.50, H * 0.44, Math.max(W, H) * 0.82);
    vg.addColorStop(0, 'rgba(255,255,255,0)');
    vg.addColorStop(0.62, 'rgba(186,158,196,0.05)');
    vg.addColorStop(1, 'rgba(146,120,168,0.20)');
    g2.fillStyle = vg;
    g2.fillRect(0, 0, W, H);
  }

  /* ------------------------------------------------------------- reflection */

  function buildReflection() {
    var bandH = H - HZ;
    if (bandH < 4) { return; }
    reflCan = makeCanvas(DW, bandH * dpr);
    rc = reflCan.getContext('2d');
    if (!rc) { return; }
    rc.clearRect(0, 0, DW, bandH * dpr);

    var SQ = 0.52;
    var bands = 24;
    var bh = bandH / bands;
    var srcBand = bh / SQ;

    function mirrorPass(jitAmp, alpha) {
      for (var i = 0; i < bands; i++) {
        var y0 = i * bh;
        var y1 = y0 + bh;
        var srcY = HZ - y1 / SQ;
        if (srcY < 0 || srcY + srcBand > HZ + 1) { continue; }
        var jit = (Math.sin(i * 1.71 + 0.6) * 2.0 + Math.sin(i * 0.52 + 1.9) * 1.4) * u * jitAmp;
        rc.setTransform(dpr, 0, 0, -dpr * SQ, 0, y0 * dpr);
        rc.globalAlpha = alpha;
        rc.drawImage(bgCan, 0, srcY * dpr, DW, srcBand * dpr, jit, -srcBand, W, srcBand);
      }
    }

    mirrorPass(1.0, 0.34);
    mirrorPass(-1.7, 0.14);
    mirrorPass(2.6, 0.10);

    rc.setTransform(dpr, 0, 0, dpr, 0, 0);
    rc.globalAlpha = 1;

    /* fade the reflection out towards the viewer */
    rc.globalCompositeOperation = 'destination-in';
    var mg = rc.createLinearGradient(0, 0, 0, bandH);
    mg.addColorStop(0.00, 'rgba(0,0,0,0.95)');
    mg.addColorStop(0.22, 'rgba(0,0,0,0.86)');
    mg.addColorStop(0.50, 'rgba(0,0,0,0.58)');
    mg.addColorStop(0.78, 'rgba(0,0,0,0.30)');
    mg.addColorStop(1.00, 'rgba(0,0,0,0.10)');
    rc.fillStyle = mg;
    rc.fillRect(0, 0, W, bandH);

    /* wash the mirrored city towards the pale street colour */
    rc.globalCompositeOperation = 'source-atop';
    rc.fillStyle = 'rgba(255,231,236,0.42)';
    rc.fillRect(0, 0, W, bandH);
    rc.globalCompositeOperation = 'source-over';
  }

  /* --------------------------------------------------------------- the girl */

  function drawUmbrella(g2, tsec) {
    var g = G;
    var s = g.headH;
    var ur = g.ur;
    var dh = g.rimY - g.apexY;
    var k = KARC;
    var RIBS = 6;
    var tilt = Math.sin(tsec * 0.42 + 0.8) * 0.012;
    var i, tR, ex;

    g2.save();
    g2.translate(g.poleX, g.rimY);
    g2.rotate(tilt);

    g2.beginPath();
    g2.moveTo(0, -dh);
    g2.bezierCurveTo(-ur * k, -dh, -ur, -dh * (1 - k), -ur, 0);
    for (i = 1; i < RIBS; i++) {
      tR = i / RIBS;
      ex = -ur + 2 * ur * tR;
      g2.quadraticCurveTo(ex - ur / RIBS, dh * 0.11, ex, 0);
    }
    g2.bezierCurveTo(ur, -dh * (1 - k), ur * k, -dh, 0, -dh);
    g2.closePath();

    g2.fillStyle = 'rgba(255,255,255,0.30)';
    g2.fill();

    g2.save();
    g2.clip();
    g2.fillStyle = 'rgba(255,196,222,0.24)';
    g2.fillRect(ur * 0.10, -dh * 1.3, ur * 1.1, dh * 2.2);
    g2.fillStyle = 'rgba(170,238,255,0.20)';
    g2.fillRect(-ur * 1.1, -dh * 1.3, ur * 0.95, dh * 2.2);
    g2.fillStyle = 'rgba(255,255,255,0.34)';
    g2.fillRect(-ur * 1.1, -dh * 1.3, ur * 2.2, dh * 0.30);
    g2.fillStyle = 'rgba(255,236,246,0.16)';
    g2.fillRect(-ur * 1.1, -dh * 0.4, ur * 2.2, dh * 0.55);
    g2.restore();

    /* ribs */
    g2.strokeStyle = 'rgba(255,255,255,0.72)';
    g2.lineWidth = Math.max(1, ur * 0.0075);
    for (i = 1; i < RIBS; i++) {
      tR = i / RIBS;
      ex = -ur + 2 * ur * tR;
      g2.beginPath();
      g2.moveTo(0, -dh + dh * 0.03);
      g2.quadraticCurveTo(ex * 0.50, -dh * 0.56, ex, 0);
      g2.stroke();
    }
    g2.beginPath();
    g2.moveTo(0, -dh + dh * 0.03);
    g2.lineTo(0, 0);
    g2.stroke();

    /* a soft pink halo just outside the canopy edge */
    g2.strokeStyle = 'rgba(255,170,206,0.45)';
    g2.lineWidth = Math.max(3, ur * 0.026);
    g2.beginPath();
    g2.moveTo(-ur, 0);
    g2.bezierCurveTo(-ur, -dh * (1 - k), -ur * k, -dh, 0, -dh);
    g2.bezierCurveTo(ur * k, -dh, ur, -dh * (1 - k), ur, 0);
    g2.stroke();

    /* rim: the bright line that makes the clear canopy read */
    g2.strokeStyle = 'rgba(255,255,255,0.90)';
    g2.lineWidth = Math.max(1.4, ur * 0.0125);
    g2.beginPath();
    g2.moveTo(-ur, 0);
    g2.bezierCurveTo(-ur, -dh * (1 - k), -ur * k, -dh, 0, -dh);
    g2.bezierCurveTo(ur * k, -dh, ur, -dh * (1 - k), ur, 0);
    g2.stroke();

    /* sagging rim between rib tips */
    g2.strokeStyle = 'rgba(232,182,206,0.55)';
    g2.lineWidth = Math.max(1, ur * 0.0055);
    g2.beginPath();
    g2.moveTo(-ur, 0);
    for (i = 1; i < RIBS; i++) {
      tR = i / RIBS;
      ex = -ur + 2 * ur * tR;
      g2.quadraticCurveTo(ex - ur / RIBS, dh * 0.11, ex, 0);
    }
    g2.lineTo(ur, 0);
    g2.stroke();

    /* ferrule */
    g2.strokeStyle = 'rgba(198,158,176,0.95)';
    g2.lineWidth = Math.max(2, ur * 0.014);
    g2.beginPath();
    g2.moveTo(0, -dh - ur * 0.026);
    g2.lineTo(0, -dh + ur * 0.02);
    g2.stroke();

    /* petals resting on the canopy */
    for (var b = 0; b < g.stuck.length; b++) {
      var sd = g.stuck[b];
      g2.save();
      g2.translate(sd.x, sd.y);
      g2.rotate(sd.rot);
      g2.globalAlpha = 0.75;
      g2.drawImage(petalSpr[sd.v], -sd.s / 2, -sd.s / 2, sd.s, sd.s);
      g2.restore();
    }
    g2.globalAlpha = 1;

    g2.restore();
  }

  function drawPole(g2) {
    var g = G;
    var s = g.headH;
    var x = g.poleX;
    var top = g.apexY - s * 0.10;
    var bot = g.handY + s * 0.42;

    g2.strokeStyle = 'rgba(226,190,205,0.95)';
    g2.lineWidth = Math.max(2, s * 0.062);
    g2.beginPath();
    g2.moveTo(x, top);
    g2.lineTo(x, bot);
    g2.stroke();

    g2.strokeStyle = 'rgba(255,255,255,0.92)';
    g2.lineWidth = Math.max(1, s * 0.026);
    g2.beginPath();
    g2.moveTo(x - s * 0.012, top + s * 0.10);
    g2.lineTo(x - s * 0.012, bot);
    g2.stroke();

    /* little J hook under her hand */
    g2.strokeStyle = 'rgba(226,190,205,0.95)';
    g2.lineWidth = Math.max(2, s * 0.058);
    g2.beginPath();
    g2.moveTo(x, bot);
    g2.quadraticCurveTo(x, bot + s * 0.30, x - s * 0.24, bot + s * 0.22);
    g2.stroke();
  }

  function drawGirl(g2, tsec) {
    var g = G;
    if (!g) { return; }
    var s = g.headH;
    var cx = g.hcx;
    var bodySw = Math.sin(tsec * 0.52);
    var hairSw = Math.sin(tsec * 0.44 + 0.7);
    var hemSw = Math.sin(tsec * 0.40 + 2.2);
    var sleeveSw = Math.sin(tsec * 0.46 + 1.3);
    var lean = bodySw * s * 0.030;
    var hx = cx + lean;

    var SKIN = '#ffe0cb';
    var SKIN_D = '#efbba2';
    var HAIR = '#bb7d50';
    var HAIR_L = '#d8a475';
    var KIM = '#fff8fb';
    var KIM_P = '#ffd3e4';
    var OBI = '#ff87b6';
    var LINE = 'rgba(198,146,172,0.62)';
    var BOOT = '#e4afc3';

    var shoL = hx - g.sho;
    var shoR = hx + g.sho;
    var lw = Math.max(1, 1.15 * u);

    /* ---------------- legs and boots (under the skirt) -------------- */
    var legFX = hx - s * 0.20;
    var legBX = hx + s * 0.22;
    g2.fillStyle = SKIN;
    g2.beginPath();
    g2.moveTo(legFX - s * 0.12, g.hemY - s * 0.20);
    g2.lineTo(legFX + s * 0.12, g.hemY - s * 0.20);
    g2.quadraticCurveTo(legFX + s * 0.09, g.footY - s * 0.46, legFX + s * 0.085, g.footY - s * 0.14);
    g2.lineTo(legFX - s * 0.085, g.footY - s * 0.14);
    g2.quadraticCurveTo(legFX - s * 0.09, g.footY - s * 0.46, legFX - s * 0.12, g.hemY - s * 0.20);
    g2.closePath();
    g2.fill();
    g2.beginPath();
    g2.moveTo(legBX - s * 0.12, g.hemY - s * 0.20);
    g2.lineTo(legBX + s * 0.12, g.hemY - s * 0.20);
    g2.quadraticCurveTo(legBX + s * 0.10, g.footY - s * 0.46, legBX + s * 0.095, g.footY - s * 0.14);
    g2.lineTo(legBX - s * 0.095, g.footY - s * 0.14);
    g2.quadraticCurveTo(legBX - s * 0.10, g.footY - s * 0.46, legBX - s * 0.12, g.hemY - s * 0.20);
    g2.closePath();
    g2.fill();
    blit(g2, sprShade, legFX + s * 0.10, g.footY - s * 0.55, s * 0.30, s * 1.2, 0.22);
    blit(g2, sprShade, legBX + s * 0.11, g.footY - s * 0.55, s * 0.30, s * 1.2, 0.22);
    /* boots */
    g2.fillStyle = BOOT;
    g2.beginPath();
    g2.moveTo(legFX - s * 0.11, g.footY - s * 0.28);
    g2.lineTo(legFX + s * 0.10, g.footY - s * 0.28);
    g2.quadraticCurveTo(legFX + s * 0.16, g.footY - s * 0.04, legFX + s * 0.02, g.footY);
    g2.lineTo(legFX - s * 0.17, g.footY);
    g2.quadraticCurveTo(legFX - s * 0.19, g.footY - s * 0.11, legFX - s * 0.11, g.footY - s * 0.28);
    g2.closePath();
    g2.fill();
    g2.beginPath();
    g2.moveTo(legBX - s * 0.10, g.footY - s * 0.28);
    g2.lineTo(legBX + s * 0.11, g.footY - s * 0.28);
    g2.quadraticCurveTo(legBX + s * 0.17, g.footY - s * 0.04, legBX + s * 0.03, g.footY);
    g2.lineTo(legBX - s * 0.16, g.footY);
    g2.quadraticCurveTo(legBX - s * 0.18, g.footY - s * 0.11, legBX - s * 0.10, g.footY - s * 0.28);
    g2.closePath();
    g2.fill();

    /* ---------------- kimono body ---------------- */
    var pBody = new Path2D();
    pBody.moveTo(shoL, g.shoulderY);
    pBody.bezierCurveTo(shoL - s * 0.02, g.shoulderY + s * 0.62,
      hx - g.wai, g.waistY - s * 0.34,
      hx - g.wai, g.waistY);
    pBody.bezierCurveTo(hx - g.wai * 1.16, g.hipY + s * 0.12,
      hx - g.hem + hemSw * s * 0.06, g.hemY - s * 0.50,
      hx - g.hem + hemSw * s * 0.10, g.hemY);
    pBody.quadraticCurveTo(hx - g.hem * 0.46, g.hemY + s * 0.13,
      hx + hemSw * s * 0.04, g.hemY + s * 0.03);
    pBody.quadraticCurveTo(hx + g.hem * 0.46, g.hemY + s * 0.14,
      hx + g.hem + hemSw * s * 0.09, g.hemY - s * 0.02);
    pBody.bezierCurveTo(hx + g.hem - s * 0.02, g.hemY - s * 0.50,
      hx + g.wai * 1.16, g.hipY + s * 0.12,
      hx + g.wai, g.waistY);
    pBody.bezierCurveTo(hx + g.wai, g.waistY - s * 0.34,
      shoR + s * 0.02, g.shoulderY + s * 0.62,
      shoR, g.shoulderY);
    pBody.quadraticCurveTo(hx, g.shoulderY - s * 0.26, shoL, g.shoulderY);
    pBody.closePath();

    g2.fillStyle = KIM;
    g2.fill(pBody);
    g2.save();
    g2.clip(pBody);
    blit(g2, sprWarm, hx - s * 0.58, g.chestY + s * 1.20, s * 2.4, s * 4.6, 0.34);
    blit(g2, sprShade, hx + s * 0.62, g.chestY + s * 1.40, s * 2.2, s * 5.0, 0.18);
    blit(g2, sprWhite, hx - s * 0.20, g.hemY - s * 0.30, s * 2.2, s * 1.2, 0.26);
    blit(g2, sprShade, hx, g.hemY - s * 0.10, s * 2.6, s * 0.5, 0.20);
    g2.restore();
    g2.strokeStyle = LINE;
    g2.lineWidth = lw;
    g2.stroke(pBody);

    /* folds of the skirt */
    g2.strokeStyle = 'rgba(198,146,172,0.30)';
    for (var f = -2; f <= 2; f++) {
      g2.beginPath();
      g2.moveTo(hx + f * s * 0.26, g.hipY + s * 0.30);
      g2.quadraticCurveTo(hx + f * s * 0.34, g.hemY - s * 0.40,
        hx + f * s * 0.40 + hemSw * s * 0.05, g.hemY - s * 0.02);
      g2.stroke();
    }

    /* ---------------- obi ---------------- */
    var obiT = g.waistY - s * 0.02;
    var obiB = g.waistY + s * 0.36;
    g2.fillStyle = OBI;
    g2.beginPath();
    g2.moveTo(hx - g.wai * 1.10, obiT + s * 0.03);
    g2.quadraticCurveTo(hx, obiT - s * 0.06, hx + g.wai * 1.10, obiT + s * 0.03);
    g2.lineTo(hx + g.wai * 1.12, obiB);
    g2.quadraticCurveTo(hx, obiB + s * 0.05, hx - g.wai * 1.12, obiB);
    g2.closePath();
    g2.fill();
    g2.strokeStyle = 'rgba(230,110,158,0.55)';
    g2.lineWidth = lw;
    g2.stroke();
    /* silk highlight */
    g2.fillStyle = 'rgba(255,255,255,0.34)';
    g2.fillRect(hx - g.wai * 1.06, obiT + s * 0.09, g.wai * 2.12, s * 0.055);
    /* a small knot at the back */
    g2.fillStyle = '#ff9cc4';
    g2.beginPath();
    g2.ellipse(hx + s * 0.02, obiB + s * 0.03, s * 0.19, s * 0.11, 0, 0, TAU);
    g2.fill();
    g2.fillStyle = 'rgba(255,255,255,0.55)';
    g2.beginPath();
    g2.ellipse(hx - s * 0.09, obiB + s * 0.05, s * 0.06, s * 0.04, 0.3, 0, TAU);
    g2.fill();

    /* ---------------- long hair, behind the body ---------------- */
    var hairTopY = g.headCy - s * 0.52;
    var hairEndY = g.waistY + s * 0.26;
    var pHair = new Path2D();
    pHair.moveTo(hx - s * 0.24, hairTopY);
    pHair.bezierCurveTo(hx - s * 0.56, g.headCy - s * 0.10,
      hx - s * 0.62, g.chestY,
      hx - s * 0.58 + lean + hairSw * s * 0.05, g.waistY + s * 0.10);
    pHair.bezierCurveTo(hx - s * 0.60, hairEndY - s * 0.06,
      hx - s * 0.50 + hairSw * s * 0.10, hairEndY + s * 0.22,
      hx - s * 0.34 + hairSw * s * 0.16, hairEndY + s * 0.04);
    pHair.bezierCurveTo(hx - s * 0.22 + hairSw * s * 0.15, hairEndY + s * 0.26,
      hx - s * 0.10 + hairSw * s * 0.13, hairEndY + s * 0.22,
      hx + s * 0.02 + hairSw * s * 0.11, hairEndY - s * 0.02);
    pHair.bezierCurveTo(hx + s * 0.16 + hairSw * s * 0.09, hairEndY + s * 0.22,
      hx + s * 0.28 + hairSw * s * 0.06, hairEndY + s * 0.14,
      hx + s * 0.34 + lean, hairEndY - s * 0.20);
    pHair.bezierCurveTo(hx + s * 0.52, g.chestY + s * 0.30,
      hx + s * 0.56, g.chestY - s * 0.40,
      hx + s * 0.48, g.headCy - s * 0.10);
    pHair.bezierCurveTo(hx + s * 0.44, g.headCy - s * 0.66,
      hx + s * 0.10, g.headCy - s * 0.74,
      hx - s * 0.24, hairTopY);
    pHair.closePath();
    g2.fillStyle = HAIR;
    g2.fill(pHair);

    g2.save();
    g2.clip(pHair);
    blit(g2, sprLilac, hx + s * 0.56, g.chestY - s * 0.10, s * 2.2, s * 5.0, 0.26);
    blit(g2, sprShade, hx + s * 0.46, g.chestY + s * 0.60, s * 1.5, s * 3.8, 0.13);
    blit(g2, sprWarm, hx - s * 0.48, g.chestY - s * 0.35, s * 1.4, s * 3.6, 0.44);
    blit(g2, sprLilac, hx + s * 0.10, hairEndY - s * 0.30, s * 1.6, s * 1.0, 0.30);
    g2.strokeStyle = 'rgba(216,164,117,0.60)';
    g2.lineWidth = Math.max(1, s * 0.018);
    for (var st = 0; st < 5; st++) {
      var o = (st - 2) * s * 0.17;
      g2.beginPath();
      g2.moveTo(hx + o * 0.5, g.headCy + s * 0.24);
      g2.bezierCurveTo(hx + o * 1.0, g.chestY,
        hx + o * 1.15 + hairSw * s * 0.04, g.waistY - s * 0.10,
        hx + o * 1.25 + hairSw * s * 0.10, hairEndY - s * 0.06);
      g2.stroke();
    }
    g2.restore();

    /* ---------------- sleeves ---------------- */
    /* left sleeve hangs beside the body */
    var pSleeveL = new Path2D();
    pSleeveL.moveTo(shoL + s * 0.06, g.shoulderY + s * 0.06);
    pSleeveL.bezierCurveTo(shoL - s * 0.34, g.shoulderY + s * 0.70,
      shoL - s * 0.50, g.waistY - s * 0.10,
      shoL - s * 0.52 + sleeveSw * s * 0.03, g.waistY + s * 0.60);
    pSleeveL.quadraticCurveTo(shoL - s * 0.60, g.waistY + s * 0.92,
      shoL - s * 0.30, g.waistY + s * 0.98);
    pSleeveL.quadraticCurveTo(shoL + s * 0.02, g.waistY + s * 0.80,
      shoL + s * 0.14, g.waistY + s * 0.20);
    pSleeveL.closePath();
    g2.fillStyle = KIM;
    g2.fill(pSleeveL);
    g2.save();
    g2.clip(pSleeveL);
    blit(g2, sprShade, shoL - s * 0.55, g.waistY + s * 0.40, s * 1.1, s * 2.2, 0.24);
    blit(g2, sprWhite, shoL - s * 0.10, g.shoulderY + s * 0.40, s * 0.9, s * 1.6, 0.30);
    g2.restore();
    g2.strokeStyle = LINE;
    g2.lineWidth = lw;
    g2.stroke(pSleeveL);
    /* a slim pink band along the sleeve opening */
    g2.strokeStyle = 'rgba(255,190,214,0.85)';
    g2.lineWidth = Math.max(2, s * 0.065);
    g2.lineCap = 'round';
    g2.beginPath();
    g2.moveTo(shoL - s * 0.54, g.waistY + s * 0.68);
    g2.quadraticCurveTo(shoL - s * 0.58, g.waistY + s * 0.92,
      shoL - s * 0.30, g.waistY + s * 0.95);
    g2.stroke();
    g2.lineCap = 'butt';

    /* ---------------- raised arm holding the umbrella ---------------- */
    var shR = { x: hx + g.sho * 0.72, y: g.shoulderY + s * 0.16 };
    var elR = { x: hx + s * 1.02, y: g.chestY + s * 0.42 + bodySw * s * 0.03 };
    var haR = { x: g.poleX, y: g.handY };
    g2.strokeStyle = KIM;
    g2.lineCap = 'round';
    g2.lineJoin = 'round';
    g2.lineWidth = Math.max(2, s * 0.36);
    g2.beginPath();
    g2.moveTo(shR.x, shR.y);
    g2.quadraticCurveTo(elR.x, elR.y, haR.x, haR.y);
    g2.stroke();
    /* sleeve draping from the raised forearm */
    var pSleeveR = new Path2D();
    pSleeveR.moveTo(elR.x - s * 0.14, elR.y - s * 0.16);
    pSleeveR.quadraticCurveTo(elR.x + s * 0.30, elR.y + s * 0.28,
      elR.x + s * 0.26 + sleeveSw * s * 0.03, elR.y + s * 0.96);
    pSleeveR.quadraticCurveTo(elR.x - s * 0.06, elR.y + s * 0.86,
      elR.x - s * 0.22, elR.y + s * 0.24);
    pSleeveR.closePath();
    g2.fillStyle = KIM;
    g2.fill(pSleeveR);
    g2.save();
    g2.clip(pSleeveR);
    blit(g2, sprShade, elR.x + s * 0.26, elR.y + s * 0.55, s * 0.8, s * 1.4, 0.24);
    blit(g2, sprWhite, elR.x - s * 0.04, elR.y + s * 0.16, s * 0.7, s * 0.9, 0.32);
    g2.restore();
    g2.strokeStyle = LINE;
    g2.lineWidth = lw;
    g2.stroke(pSleeveR);
    /* a slim pink band along the sleeve opening */
    g2.strokeStyle = 'rgba(255,190,214,0.85)';
    g2.lineWidth = Math.max(2, s * 0.065);
    g2.lineCap = 'round';
    g2.beginPath();
    g2.moveTo(elR.x - s * 0.02, elR.y + s * 0.66);
    g2.quadraticCurveTo(elR.x + s * 0.02, elR.y + s * 0.86,
      elR.x + s * 0.26, elR.y + s * 0.92);
    g2.stroke();
    g2.lineCap = 'butt';
    /* hand on the shaft */
    g2.fillStyle = SKIN;
    g2.beginPath();
    g2.arc(haR.x, haR.y, s * 0.135, 0, TAU);
    g2.fill();
    g2.strokeStyle = 'rgba(214,158,138,0.55)';
    g2.lineWidth = lw;
    g2.stroke();
    g2.lineCap = 'butt';

    /* ---------------- neck and collar ---------------- */
    g2.fillStyle = SKIN_D;
    g2.beginPath();
    g2.moveTo(hx - s * 0.13, g.neckY - s * 0.30);
    g2.lineTo(hx + s * 0.13, g.neckY - s * 0.30);
    g2.lineTo(hx + s * 0.17, g.shoulderY + s * 0.06);
    g2.lineTo(hx - s * 0.17, g.shoulderY + s * 0.06);
    g2.closePath();
    g2.fill();
    /* kimono collar band across the nape */
    g2.fillStyle = KIM;
    g2.beginPath();
    g2.moveTo(hx - s * 0.46, g.shoulderY - s * 0.06);
    g2.quadraticCurveTo(hx - s * 0.16, g.neckY - s * 0.70, hx, g.neckY - s * 0.70);
    g2.quadraticCurveTo(hx + s * 0.16, g.neckY - s * 0.70, hx + s * 0.46, g.shoulderY - s * 0.06);
    g2.lineTo(hx + s * 0.42, g.shoulderY + s * 0.16);
    g2.quadraticCurveTo(hx, g.neckY - s * 0.22, hx - s * 0.42, g.shoulderY + s * 0.16);
    g2.closePath();
    g2.fill();
    g2.strokeStyle = LINE;
    g2.lineWidth = lw;
    g2.stroke();
    /* a soft pink edge along the inside of the collar */
    g2.strokeStyle = 'rgba(255,178,208,0.80)';
    g2.lineWidth = Math.max(1, s * 0.045);
    g2.beginPath();
    g2.moveTo(hx - s * 0.40, g.shoulderY + s * 0.10);
    g2.quadraticCurveTo(hx - s * 0.10, g.neckY - s * 0.30, hx + s * 0.04, g.neckY - s * 0.30);
    g2.stroke();

    /* ---------------- head ---------------- */
    var hcx2 = hx;
    var hcy = g.headCy;

    /* skull and face, turned three quarters to her left */
    var pFace = new Path2D();
    pFace.moveTo(hcx2 - 0.02 * s, hcy - 0.50 * s);
    pFace.bezierCurveTo(hcx2 - 0.26 * s, hcy - 0.50 * s, hcx2 - 0.40 * s, hcy - 0.34 * s, hcx2 - 0.42 * s, hcy - 0.16 * s);
    pFace.bezierCurveTo(hcx2 - 0.43 * s, hcy - 0.07 * s, hcx2 - 0.465 * s, hcy + 0.01 * s, hcx2 - 0.48 * s, hcy + 0.07 * s);
    pFace.bezierCurveTo(hcx2 - 0.495 * s, hcy + 0.115 * s, hcx2 - 0.475 * s, hcy + 0.145 * s, hcx2 - 0.425 * s, hcy + 0.145 * s);
    pFace.bezierCurveTo(hcx2 - 0.40 * s, hcy + 0.145 * s, hcx2 - 0.40 * s, hcy + 0.17 * s, hcx2 - 0.412 * s, hcy + 0.20 * s);
    pFace.bezierCurveTo(hcx2 - 0.422 * s, hcy + 0.225 * s, hcx2 - 0.412 * s, hcy + 0.24 * s, hcx2 - 0.428 * s, hcy + 0.25 * s);
    pFace.bezierCurveTo(hcx2 - 0.422 * s, hcy + 0.282 * s, hcx2 - 0.412 * s, hcy + 0.30 * s, hcx2 - 0.418 * s, hcy + 0.318 * s);
    pFace.bezierCurveTo(hcx2 - 0.418 * s, hcy + 0.395 * s, hcx2 - 0.355 * s, hcy + 0.455 * s, hcx2 - 0.265 * s, hcy + 0.468 * s);
    pFace.bezierCurveTo(hcx2 - 0.15 * s, hcy + 0.50 * s, hcx2 - 0.02 * s, hcy + 0.455 * s, hcx2 + 0.06 * s, hcy + 0.385 * s);
    pFace.bezierCurveTo(hcx2 + 0.17 * s, hcy + 0.295 * s, hcx2 + 0.23 * s, hcy + 0.14 * s, hcx2 + 0.23 * s, hcy - 0.02 * s);
    pFace.bezierCurveTo(hcx2 + 0.23 * s, hcy - 0.20 * s, hcx2 + 0.16 * s, hcy - 0.40 * s, hcx2 + 0.04 * s, hcy - 0.47 * s);
    pFace.closePath();
    g2.fillStyle = SKIN;
    g2.fill(pFace);

    g2.save();
    g2.clip(pFace);
    blit(g2, sprWarm, hcx2 - 0.26 * s, hcy - 0.04 * s, s * 0.95, s * 1.15, 0.40);
    blit(g2, sprWhite, hcx2 - 0.30 * s, hcy - 0.26 * s, s * 0.5, s * 0.42, 0.26);
    blit(g2, sprShade, hcx2 + 0.18 * s, hcy + 0.04 * s, s * 0.75, s * 1.0, 0.20);
    blit(g2, sprShade, hcx2 - 0.12 * s, hcy + 0.41 * s, s * 0.7, s * 0.28, 0.24);
    g2.restore();

    /* eye */
    var ex = hcx2 - 0.278 * s;
    var ey = hcy - 0.005 * s;
    g2.fillStyle = 'rgba(255,252,250,0.97)';
    g2.beginPath();
    g2.ellipse(ex, ey, 0.092 * s, 0.055 * s, -0.07, 0, TAU);
    g2.fill();
    g2.fillStyle = '#b3754c';
    g2.beginPath();
    g2.ellipse(ex - 0.006 * s, ey + 0.004 * s, 0.048 * s, 0.048 * s, 0, 0, TAU);
    g2.fill();
    g2.fillStyle = '#4c3029';
    g2.beginPath();
    g2.arc(ex - 0.006 * s, ey + 0.004 * s, 0.023 * s, 0, TAU);
    g2.fill();
    g2.fillStyle = 'rgba(255,255,255,0.96)';
    g2.beginPath();
    g2.arc(ex - 0.020 * s, ey - 0.019 * s, 0.015 * s, 0, TAU);
    g2.fill();
    g2.strokeStyle = '#5a3b33';
    g2.lineWidth = Math.max(1, 0.019 * s);
    g2.lineCap = 'round';
    g2.beginPath();
    g2.moveTo(ex - 0.092 * s, ey - 0.016 * s);
    g2.quadraticCurveTo(ex, ey - 0.068 * s, ex + 0.092 * s, ey - 0.006 * s);
    g2.stroke();
    g2.strokeStyle = 'rgba(150,104,74,0.78)';
    g2.lineWidth = Math.max(1, 0.016 * s);
    g2.beginPath();
    g2.moveTo(ex - 0.090 * s, ey - 0.132 * s);
    g2.quadraticCurveTo(ex - 0.005 * s, ey - 0.170 * s, ex + 0.082 * s, ey - 0.122 * s);
    g2.stroke();

    /* nose, blush, lips */
    g2.strokeStyle = 'rgba(206,144,124,0.45)';
    g2.lineWidth = Math.max(1, 0.015 * s);
    g2.beginPath();
    g2.moveTo(hcx2 - 0.468 * s, hcy + 0.082 * s);
    g2.quadraticCurveTo(hcx2 - 0.448 * s, hcy + 0.132 * s, hcx2 - 0.408 * s, hcy + 0.132 * s);
    g2.stroke();
    blit(g2, sprBlush, hcx2 - 0.245 * s, hcy + 0.155 * s, s * 0.40, s * 0.26, 0.60);
    g2.fillStyle = 'rgba(236,142,156,0.92)';
    g2.beginPath();
    g2.ellipse(hcx2 - 0.432 * s, hcy + 0.256 * s, 0.034 * s, 0.017 * s, 0.20, 0, TAU);
    g2.fill();
    g2.strokeStyle = 'rgba(196,112,128,0.55)';
    g2.lineWidth = Math.max(1, 0.011 * s);
    g2.beginPath();
    g2.moveTo(hcx2 - 0.444 * s, hcy + 0.252 * s);
    g2.lineTo(hcx2 - 0.390 * s, hcy + 0.264 * s);
    g2.stroke();

    /* ---------------- hair: cap, fringe, side lock ---------------- */
    var pHat = new Path2D();
    pHat.moveTo(hcx2 - 0.28 * s, hcy - 0.44 * s);
    pHat.bezierCurveTo(hcx2 - 0.10 * s, hcy - 0.62 * s, hcx2 + 0.16 * s, hcy - 0.56 * s, hcx2 + 0.245 * s, hcy - 0.36 * s);
    pHat.bezierCurveTo(hcx2 + 0.275 * s, hcy - 0.18 * s, hcx2 + 0.265 * s, hcy + 0.05 * s, hcx2 + 0.235 * s, hcy + 0.20 * s);
    pHat.bezierCurveTo(hcx2 + 0.215 * s, hcy + 0.33 * s, hcx2 + 0.10 * s, hcy + 0.42 * s, hcx2 - 0.02 * s, hcy + 0.40 * s);
    pHat.bezierCurveTo(hcx2 - 0.06 * s, hcy + 0.24 * s, hcx2 - 0.12 * s, hcy + 0.06 * s, hcx2 - 0.155 * s, hcy - 0.10 * s);
    pHat.bezierCurveTo(hcx2 - 0.20 * s, hcy - 0.24 * s, hcx2 - 0.24 * s, hcy - 0.36 * s, hcx2 - 0.28 * s, hcy - 0.44 * s);
    pHat.closePath();
    g2.fillStyle = HAIR;
    g2.fill(pHat);
    g2.save();
    g2.clip(pHat);
    blit(g2, sprWarm, hcx2 + 0.02 * s, hcy - 0.36 * s, s * 0.9, s * 0.55, 0.50);
    blit(g2, sprWhite, hcx2 - 0.06 * s, hcy - 0.42 * s, s * 0.42, s * 0.26, 0.42);
    blit(g2, sprLilac, hcx2 + 0.24 * s, hcy + 0.02 * s, s * 0.55, s * 1.0, 0.34);
    g2.restore();

    /* fringe: two locks over the forehead, stopping above the eye */
    g2.fillStyle = HAIR;
    g2.beginPath();
    g2.moveTo(hcx2 - 0.295 * s, hcy - 0.40 * s);
    g2.bezierCurveTo(hcx2 - 0.40 * s, hcy - 0.30 * s, hcx2 - 0.42 * s, hcy - 0.18 * s, hcx2 - 0.385 * s, hcy - 0.085 * s);
    g2.bezierCurveTo(hcx2 - 0.34 * s, hcy - 0.14 * s, hcx2 - 0.27 * s, hcy - 0.20 * s, hcx2 - 0.20 * s, hcy - 0.26 * s);
    g2.bezierCurveTo(hcx2 - 0.17 * s, hcy - 0.34 * s, hcx2 - 0.15 * s, hcy - 0.42 * s, hcx2 - 0.155 * s, hcy - 0.48 * s);
    g2.closePath();
    g2.fill();
    blit(g2, sprWarm, hcx2 - 0.30 * s, hcy - 0.30 * s, s * 0.34, s * 0.30, 0.42);

    /* long lock falling in front of the far shoulder, clear of her jaw */
    g2.fillStyle = HAIR;
    g2.beginPath();
    g2.moveTo(hcx2 - 0.20 * s, hcy + 0.40 * s);
    g2.bezierCurveTo(hcx2 - 0.30 * s, g.neckY + s * 0.30,
      hcx2 - 0.34 * s + hairSw * s * 0.04, g.chestY + s * 0.20,
      hcx2 - 0.30 * s + hairSw * s * 0.07, g.waistY + s * 0.05);
    g2.bezierCurveTo(hcx2 - 0.18 * s + hairSw * s * 0.06, g.waistY - s * 0.15,
      hcx2 - 0.12 * s, g.chestY,
      hcx2 - 0.10 * s, hcy + 0.42 * s);
    g2.closePath();
    g2.fill();
    g2.strokeStyle = 'rgba(216,164,117,0.55)';
    g2.lineWidth = Math.max(1, s * 0.013);
    g2.beginPath();
    g2.moveTo(hcx2 - 0.15 * s, hcy + 0.46 * s);
    g2.quadraticCurveTo(hcx2 - 0.22 * s, g.chestY, hcx2 - 0.20 * s, g.waistY);
    g2.stroke();

    /* warm rim light from the low sun behind her */
    blit(g2, sprWarm, hx + g.sho * 1.05, g.chestY + s * 0.35, s * 1.6, s * 3.4, 0.26);
    blit(g2, sprGold, hx + g.sho * 0.95, g.hemY - s * 0.45, s * 1.3, s * 2.0, 0.22);

    /* blossom tucked into her hair */
    g2.fillStyle = 'rgba(255,176,204,0.96)';
    for (var bl = 0; bl < 5; bl++) {
      var ba = (bl / 5) * TAU + 0.4;
      g2.beginPath();
      g2.ellipse(hcx2 + 0.155 * s + Math.cos(ba) * 0.052 * s,
        hcy - 0.24 * s + Math.sin(ba) * 0.052 * s,
        0.042 * s, 0.032 * s, ba, 0, TAU);
      g2.fill();
    }
    g2.fillStyle = 'rgba(255,238,170,0.95)';
    g2.beginPath();
    g2.arc(hcx2 + 0.155 * s, hcy - 0.24 * s, 0.018 * s, 0, TAU);
    g2.fill();

    g2.lineWidth = 1;
  }

  /* ------------------------------------------------------------- per frame */

  function drawPetals(g2, dt, front) {
    for (var i = 0; i < petals.length; i++) {
      var p = petals[i];
      if (p.front !== front) { continue; }
      p.y += p.vy * dt;
      p.x += (p.vx + Math.sin(t * 0.9 + p.ph) * p.sway) * dt;
      p.rot += p.vrot * dt;
      if (p.y > H + 60 * u) {
        p.y = -60 * u;
        p.x = Math.random() * (W + 120 * u) - 60 * u;
      }
      if (p.x > W + 80 * u) { p.x = -60 * u; }
      if (p.x < -80 * u) { p.x = W + 60 * u; }

      var sp = petalSpr[p.v];
      g2.save();
      g2.translate(p.x, p.y);
      g2.rotate(p.rot);
      g2.globalAlpha = p.a;
      g2.drawImage(sp, -p.s / 2, -p.s / 2, p.s, p.s);
      g2.restore();
    }
    g2.globalAlpha = 1;
  }

  function drawBokeh(g2, dt) {
    for (var i = 0; i < bokehs.length; i++) {
      var b = bokehs[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.y < -b.r) { b.y = H + b.r; b.x = Math.random() * W; }
      if (b.x < -b.r) { b.x = W + b.r; }
      if (b.x > W + b.r) { b.x = -b.r; }
      var pulse = 0.72 + 0.28 * Math.sin(t * 0.7 + b.ph);
      blit(g2, b.sp, b.x, b.y, b.r * 2, b.r * 2, b.a * pulse);
    }
  }

  function drawGroundGirl(g2) {
    var g = G;
    if (!g) { return; }
    var bandH = H - g.footY;
    if (bandH <= 4) { return; }

    g2.save();
    g2.beginPath();
    g2.rect(0, g.footY - 2 * u, W, H - g.footY + 2 * u);
    g2.clip();
    g2.translate(0, g.footY * 2);
    g2.scale(1, -1);
    g2.globalAlpha = 0.20;
    drawGirl(g2, t);
    drawPole(g2);
    drawUmbrella(g2, t);
    g2.restore();
    g2.globalAlpha = 1;

    /* pale contact shadow */
    blit(g2, sprShade, g.hcx, g.footY + 2 * u, g.headH * 3.4, g.headH * 0.55, 0.30);
    blit(g2, sprPink, g.hcx - g.headH * 1.0, g.footY + g.headH * 0.10,
      g.headH * 3.6, g.headH * 0.9, 0.22);
  }

  function drawFrame(dt) {
    var g2 = ctx;
    g2.setTransform(dpr, 0, 0, dpr, 0, 0);
    g2.globalAlpha = 1;
    g2.globalCompositeOperation = 'source-over';

    /* 1. static scene */
    g2.drawImage(bgCan, 0, 0, W, H);

    /* 2. breathing light from the signs */
    for (var i = 0; i < signs.length; i++) {
      var s = signs[i];
      var k = 0.72 + 0.28 * Math.sin(t * s.sp + s.ph);
      blit(g2, s.spr, s.x + s.w / 2, s.y + s.h / 2, s.w * 4.6, s.h * 1.9, 0.16 * k);
    }

    /* 3. pale wet street: the reflection, plus a slow shimmer copy */
    if (reflCan) {
      g2.globalAlpha = 0.96;
      g2.drawImage(reflCan, 0, HZ, W, H - HZ);
      g2.globalAlpha = 0.16 + 0.10 * Math.sin(t * 0.55);
      var sy = Math.sin(t * 0.8) * 1.6 * u;
      g2.drawImage(reflCan, 0, HZ + sy, W, H - HZ);
      g2.globalAlpha = 1;
    }

    /* 4. warm light pooling on the street */
    blit(g2, sprWarm, W * 0.70, HZ + (H - HZ) * 0.42, W * 0.44, H * 0.20, 0.26);
    blit(g2, sprPink, W * 0.20, HZ + (H - HZ) * 0.55, W * 0.30, H * 0.16, 0.16);

    /* 5. petals behind her */
    drawPetals(g2, dt, false);

    /* 6. her reflection, then her */
    drawGroundGirl(g2);
    drawGirl(g2, t);
    drawPole(g2);
    drawUmbrella(g2, t);

    /* 7. petals in front (soft, out of focus) */
    drawPetals(g2, dt, true);

    /* 8. foreground cherry branch framing the corner */
    if (branchCan) {
      g2.globalAlpha = 0.96;
      g2.drawImage(branchCan, 0, 0, W * 0.46, H * 0.30);
      g2.globalAlpha = 1;
    }

    /* 9. floating warm bokeh */
    drawBokeh(g2, dt);

    /* 10. keep the top-right corner dim for the host button */
    g2.globalAlpha = 1;
    g2.drawImage(scrimCan, W - 330 * u, -46 * u, 380 * u, 250 * u);
  }

  /* --------------------------------------------------------------- runtime */

  function frame(ts) {
    rafId = window.requestAnimationFrame(frame);
    if (!last) { last = ts; return; }
    var dt = (ts - last) / 1000;
    last = ts;
    if (dt > 0.05) { dt = 0.05; }
    if (dt <= 0) { dt = 0.001; }
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

  function layout() {
    W = Math.max(1, window.innerWidth);
    H = Math.max(1, window.innerHeight);
    dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    DW = Math.max(1, Math.round(W * dpr));
    DH = Math.max(1, Math.round(H * dpr));
    u = Math.min(W / 1280, H / 720);
    HZ = H * HOR;

    cv.width = DW;
    cv.height = DH;
    cv.style.width = W + 'px';
    cv.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';

    buildSprites();
    computeGeo();
    buildScene();
    buildReflection();
    buildBranch();
    initPetals();
    initBokeh();
    last = 0;
  }

  window.addEventListener('resize', function () {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(layout, 120);
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { stop(); } else { start(); }
  });

  layout();
  start();
}());
