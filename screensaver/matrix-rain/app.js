/* 浅色海滩 —— 浅蓝天空 / 暖阳 / 海面波浪 / 沙滩，飘落的水花落地化成涟漪 */
(function () {
  'use strict';

  var canvas = document.getElementById('scene');
  var ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) { return; }

  var MAX_DPR = 2;

  var W = 1;
  var H = 1;
  var dpr = 1;
  var rafId = 0;
  var last = 0;
  var t = 0;
  var resizeTimer = 0;

  var bg = null;            // 静态背景：天空 + 太阳 + 沙滩
  var drops = [];           // 飘落的水花
  var ripples = [];         // 水花落地后的涟漪
  var gulls = [];
  var clouds = [];
  var sparkles = [];
  var shells = [];

  function rand(a, b) { return a + Math.random() * (b - a); }

  function horizonY() { return H * 0.505; }
  function sandY() { return H * 0.745; }

  function shoreY(x) {
    return sandY()
      + Math.sin(x * 0.0026 + 1.1) * H * 0.016
      + Math.sin(x * 0.0061 + 3.7) * H * 0.008
      + Math.sin(x * 0.0131 + 0.4) * H * 0.003;
  }

  function waveY(x, base, amp, len, speed) {
    return base
      + Math.sin((x / len) + t * speed) * amp
      + Math.sin((x / (len * 0.43)) - t * speed * 1.7) * amp * 0.42
      + Math.sin((x / (len * 0.21)) + t * speed * 2.9) * amp * 0.16;
  }

  function buildCloud(g, c) {
    // 一朵云 = 几个重叠的柔和椭圆，比单块椭圆自然
    var r = c.r;
    var puffs = [
      { dx: -1.15, dy: 0.10, rx: 0.85, ry: 0.46, a: 0.72 },
      { dx: -0.45, dy: -0.18, rx: 1.02, ry: 0.56, a: 0.95 },
      { dx: 0.35, dy: 0.02, rx: 0.92, ry: 0.50, a: 0.82 },
      { dx: 1.00, dy: 0.16, rx: 0.68, ry: 0.38, a: 0.58 }
    ];
    for (var i = 0; i < puffs.length; i++) {
      var p = puffs[i];
      var cx = c.x + p.dx * r;
      var cy = c.y + p.dy * r * 0.6;
      var rx = r * p.rx;
      var ry = r * p.ry;
      var grad = g.createRadialGradient(cx, cy, 0, cx, cy, rx);
      grad.addColorStop(0, 'rgba(255, 255, 255, ' + (c.a * p.a).toFixed(3) + ')');
      grad.addColorStop(0.62, 'rgba(255, 255, 255, ' + (c.a * p.a * 0.48).toFixed(3) + ')');
      grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      g.fillStyle = grad;
      g.beginPath();
      g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      g.fill();
    }
  }

  function buildBackground() {
    var w = Math.max(1, Math.floor(W * dpr));
    var h = Math.max(1, Math.floor(H * dpr));
    bg = document.createElement('canvas');
    bg.width = w;
    bg.height = h;
    var g = bg.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    // ---- 天空：上浅下稍暖，靠近海面偏淡蓝
    var sky = g.createLinearGradient(0, 0, 0, horizonY() + H * 0.04);
    sky.addColorStop(0, '#f2fbfd');
    sky.addColorStop(0.35, '#e2f5fe');
    sky.addColorStop(0.70, '#cfeefd');
    sky.addColorStop(1, '#c2e9fa');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);

    // ---- 太阳：亮的圆盘 + 大范围暖光
    var sx = W * 0.785;
    var sy = H * 0.175;
    var glow = g.createRadialGradient(sx, sy, 0, sx, sy, Math.max(W, H) * 0.52);
    glow.addColorStop(0, 'rgba(255, 251, 226, 0.95)');
    glow.addColorStop(0.12, 'rgba(255, 246, 198, 0.55)');
    glow.addColorStop(0.38, 'rgba(255, 241, 186, 0.16)');
    glow.addColorStop(1, 'rgba(255, 241, 186, 0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, W, H);

    var disc = g.createRadialGradient(sx, sy, 0, sx, sy, H * 0.062);
    disc.addColorStop(0, 'rgba(255, 255, 252, 1)');
    disc.addColorStop(0.45, 'rgba(255, 252, 226, 0.98)');
    disc.addColorStop(0.78, 'rgba(255, 246, 200, 0.55)');
    disc.addColorStop(1, 'rgba(255, 244, 190, 0)');
    g.fillStyle = disc;
    g.beginPath();
    g.arc(sx, sy, H * 0.062, 0, Math.PI * 2);
    g.fill();

    // ---- 云：几条soft ellipse，横向拉长
    clouds.length = 0;
    for (var i = 0; i < 7; i++) {
      clouds.push({
        x: rand(0.02, 0.96) * W,
        y: rand(0.06, 0.28) * H,
        r: rand(0.050, 0.090) * H,
        a: rand(0.42, 0.74),
        sp: rand(1.2, 4.0),
        ph: rand(0, Math.PI * 2)
      });
    }
    clouds.sort(function (a, b) { return a.a - b.a; });
    for (var c = 0; c < clouds.length; c++) { buildCloud(g, clouds[c]); }

    // ---- 海面（底色，波浪叠在上面）
    var hy = horizonY();
    var sea = g.createLinearGradient(0, hy, 0, sandY() + H * 0.04);
    sea.addColorStop(0, '#a8e4f0');
    sea.addColorStop(0.35, '#79cfe4');
    sea.addColorStop(1, '#4fb3d3');
    g.fillStyle = sea;
    g.fillRect(0, hy, W, H - hy);

    // ---- 沙滩：起伏的海岸线
    g.beginPath();
    g.moveTo(0, H);
    g.lineTo(0, shoreY(0));
    for (var x = 0; x <= W + 12; x += 12) { g.lineTo(x, shoreY(x)); }
    g.lineTo(W, H);
    g.closePath();
    var sand = g.createLinearGradient(0, sandY(), 0, H);
    sand.addColorStop(0, '#fbf0d9');
    sand.addColorStop(0.35, '#f6e4c4');
    sand.addColorStop(1, '#e9d0a6');
    g.fillStyle = sand;
    g.fill();

    // 沙丘明暗：从左上到右下压一点暖影，沙面才有起伏感
    var dune = g.createLinearGradient(0, sandY(), W, H);
    dune.addColorStop(0, 'rgba(255, 248, 230, 0.35)');
    dune.addColorStop(0.45, 'rgba(255, 246, 226, 0.06)');
    dune.addColorStop(0.75, 'rgba(206, 176, 128, 0.14)');
    dune.addColorStop(1, 'rgba(188, 156, 110, 0.24)');
    g.save();
    g.beginPath();
    g.moveTo(0, H);
    g.lineTo(0, shoreY(0));
    for (var xd = 0; xd <= W + 12; xd += 12) { g.lineTo(xd, shoreY(xd)); }
    g.lineTo(W, H);
    g.closePath();
    g.clip();
    g.fillStyle = dune;
    g.fillRect(0, sandY() - H * 0.05, W, H);
    g.restore();

    // 湿沙：贴着水线的一条深色带
    g.beginPath();
    for (var x2 = -10; x2 <= W + 12; x2 += 12) {
      var y2 = shoreY(x2) + H * 0.004;
      if (x2 === -10) { g.moveTo(x2, y2); } else { g.lineTo(x2, y2); }
    }
    for (var x3 = W + 12; x3 >= -10; x3 -= 12) {
      g.lineTo(x3, shoreY(x3) + H * 0.034);
    }
    g.closePath();
    g.fillStyle = 'rgba(196, 168, 124, 0.42)';
    g.fill();

    // 沙粒
    var grains = Math.round(W * H / 5200);
    for (var n = 0; n < grains; n++) {
      var gx = Math.random() * W;
      var gy = shoreY(gx) + Math.random() * (H - shoreY(gx));
      if (gy > H) { continue; }
      var shade = 0.10 + Math.random() * 0.22;
      g.fillStyle = 'rgba(' + (150 + (Math.random() * 60) | 0) + ', ' +
        (122 + (Math.random() * 50) | 0) + ', ' + (86 + (Math.random() * 46) | 0) + ', ' +
        shade.toFixed(2) + ')';
      g.fillRect(gx, gy, 1.6, 1.6);
    }

    // 沙面的风纹：几条很淡的浅色长弧线
    g.save();
    g.beginPath();
    g.moveTo(0, H);
    g.lineTo(0, shoreY(0));
    for (var xr = 0; xr <= W + 12; xr += 12) { g.lineTo(xr, shoreY(xr)); }
    g.lineTo(W, H);
    g.closePath();
    g.clip();
    for (var r2 = 0; r2 < 16; r2++) {
      var ry2 = sandY() + H * 0.02 + r2 * H * 0.026 + Math.random() * H * 0.008;
      if (ry2 > H) { break; }
      g.beginPath();
      g.moveTo(-20, ry2);
      for (var rx2 = -20; rx2 <= W + 20; rx2 += 14) {
        g.lineTo(rx2, ry2 + Math.sin(rx2 * 0.0045 + r2) * H * 0.006);
      }
      g.strokeStyle = 'rgba(255, 251, 240, ' + (0.14 + Math.random() * 0.12).toFixed(2) + ')';
      g.lineWidth = 1.5;
      g.stroke();
    }
    g.restore();

    // 贝壳 / 小石子
    shells.length = 0;
    for (var s = 0; s < 14; s++) {
      var shx = rand(0.02, 0.98) * W;
      var shy = shoreY(shx) + rand(H * 0.02, Math.max(H * 0.03, H - shoreY(shx) - H * 0.02));
      shells.push({ x: shx, y: shy, r: rand(2.4, 6.2), rot: rand(0, Math.PI), kind: Math.random() < 0.6 ? 0 : 1 });
    }
    for (var s2 = 0; s2 < shells.length; s2++) {
      var sh = shells[s2];
      g.save();
      g.translate(sh.x, sh.y);
      g.rotate(sh.rot);
      g.fillStyle = 'rgba(255, 253, 246, 0.92)';
      g.strokeStyle = 'rgba(190, 172, 148, 0.7)';
      g.lineWidth = 0.8;
      if (sh.kind === 0) {
        g.beginPath();
        g.arc(0, 0, sh.r, Math.PI * 1.05, Math.PI * 1.95);
        g.closePath();
        g.fill();
        g.stroke();
        for (var k = -2; k <= 2; k++) {
          g.beginPath();
          g.moveTo(0, sh.r * 0.35);
          g.lineTo(k * sh.r * 0.42, -sh.r * 0.55);
          g.stroke();
        }
      } else {
        g.beginPath();
        g.ellipse(0, 0, sh.r * 1.25, sh.r * 0.72, 0, 0, Math.PI * 2);
        g.fill();
        g.stroke();
      }
      g.restore();
    }
  }

  function rebuildScene() {
    buildBackground();

    drops.length = 0;
    var dropCount = Math.max(46, Math.round(W / 20));
    for (var i = 0; i < dropCount; i++) {
      var d = newDrop();
      d.y = rand(-1.0, 1.0) * H;
      drops.push(d);
    }
    ripples.length = 0;

    gulls.length = 0;
    var gullCount = Math.max(2, Math.round(W / 520));
    for (var g = 0; g < gullCount; g++) { gulls.push(newGull()); }

    sparkles.length = 0;
    var sc = Math.max(60, Math.round(W / 16));
    for (var s = 0; s < sc; s++) {
      sparkles.push({
        x: Math.random() * W,
        y: horizonY() + rand(0.02, 0.98) * (sandY() - horizonY()),
        r: rand(0.6, 1.8),
        ph: rand(0, Math.PI * 2),
        sp: rand(0.5, 1.7)
      });
    }
  }

  function newDrop() {
    return {
      x: rand(-0.02, 1.02) * W,
      y: rand(-1.0, 0) * H,
      r: rand(1.8, 4.6),
      vy: rand(0.030, 0.070) * H,
      sway: rand(0.4, 1.4),
      ph: rand(0, Math.PI * 2),
      a: rand(0.55, 0.92)
    };
  }

  function newGull() {
    return {
      x: rand(-0.15, 1.0) * W,
      y: rand(0.12, 0.40) * H,
      sx: rand(9, 22),
      scale: rand(1.0, 1.9),
      ph: rand(0, Math.PI * 2),
      flap: rand(2.2, 3.4)
    };
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    W = Math.max(1, window.innerWidth);
    H = Math.max(1, window.innerHeight);

    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    rebuildScene();
    warmup(150);
  }

  function advance(dt) {
    t += dt;

    for (var i = 0; i < drops.length; i++) {
      var d = drops[i];
      d.y += d.vy * dt;
      d.x += Math.sin(t * d.sway + d.ph) * 16 * dt;

      var ground = d.y > shoreY(d.x) ? shoreY(d.x) : (d.y > horizonY() ? null : null);
      if (d.y > shoreY(d.x)) {
        if (ripples.length < 90) {
          ripples.push({ x: d.x, y: shoreY(d.x) + 1, r: 1, max: rand(7, 16), a: 0.55 });
        }
        d.y = rand(-0.9, -0.05) * H;
        d.x = rand(-0.02, 1.02) * W;
        d.r = rand(1.8, 4.6);
        d.vy = rand(0.030, 0.070) * H;
        d.a = rand(0.45, 0.85);
      }
    }

    for (var r = ripples.length - 1; r >= 0; r--) {
      var rp = ripples[r];
      rp.r += (rp.max - rp.r) * Math.min(1, dt * 2.4) + 6 * dt;
      rp.a -= dt * 0.55;
      if (rp.a <= 0 || rp.r > rp.max) { ripples.splice(r, 1); }
    }

    for (var g = 0; g < gulls.length; g++) {
      var gl = gulls[g];
      gl.x += gl.sx * dt;
      gl.ph += gl.flap * dt;
      if (gl.x > W + 120) {
        gl.x = -120;
        gl.y = rand(0.12, 0.40) * H;
      }
    }

    for (var s = 0; s < sparkles.length; s++) { sparkles[s].ph += sparkles[s].sp * dt; }
  }

  function drawSea() {
    var hy = horizonY();
    var sy = sandY();
    var span = Math.max(60, sy - hy);
    ctx.save();

    // 远海：贴着海平面的一条淡色带
    var far = ctx.createLinearGradient(0, hy, 0, hy + span * 0.30);
    far.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
    far.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = far;
    ctx.fillRect(0, hy, W, span * 0.30);

    // 一层层浪：靠远的窄、靠近的宽，颜色由浅到深
    var layers = [
      { base: 0.10, amp: 0.050, len: 0.17, sp: 0.55, alpha: 0.40, thick: 0.055 },
      { base: 0.24, amp: 0.062, len: 0.21, sp: 0.48, alpha: 0.36, thick: 0.065 },
      { base: 0.40, amp: 0.074, len: 0.26, sp: 0.42, alpha: 0.34, thick: 0.075 },
      { base: 0.57, amp: 0.082, len: 0.31, sp: 0.36, alpha: 0.40, thick: 0.085 },
      { base: 0.75, amp: 0.070, len: 0.38, sp: 0.30, alpha: 0.52, thick: 0.080 }
    ];

    for (var i = 0; i < layers.length; i++) {
      var L = layers[i];
      var baseY = hy + span * L.base;
      var amp = span * L.amp;
      var len = Math.max(120, W * L.len);
      var grad = ctx.createLinearGradient(0, baseY, 0, baseY + span * L.thick * 2.4);
      grad.addColorStop(0, 'rgba(255, 255, 255, ' + L.alpha + ')');
      grad.addColorStop(0.45, 'rgba(233, 250, 255, ' + (L.alpha * 0.55) + ')');
      grad.addColorStop(1, 'rgba(233, 250, 255, 0)');

      ctx.beginPath();
      ctx.moveTo(-20, baseY + span * L.thick * 2.2);
      for (var x = -20; x <= W + 24; x += 10) {
        ctx.lineTo(x, waveY(x, baseY, amp, len, L.sp));
      }
      for (var x2 = W + 24; x2 >= -20; x2 -= 10) {
        var y2 = waveY(x2, baseY, amp, len, L.sp) + span * L.thick * 2.2;
        ctx.lineTo(x2, y2);
      }
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      // 浪尖的白色高光
      ctx.beginPath();
      for (var x3 = -20; x3 <= W + 24; x3 += 10) {
        var y3 = waveY(x3, baseY, amp, len, L.sp);
        if (x3 === -20) { ctx.moveTo(x3, y3); } else { ctx.lineTo(x3, y3); }
      }
      ctx.strokeStyle = 'rgba(255, 255, 255, ' + (L.alpha * 1.5).toFixed(3) + ')';
      ctx.lineWidth = Math.max(1, span * 0.008);
      ctx.stroke();
    }

    // 阳光在水面的碎光
    for (var s = 0; s < sparkles.length; s++) {
      var sp = sparkles[s];
      var tw = 0.5 + 0.5 * Math.sin(t * sp.sp * 3.1 + sp.ph);
      if (tw < 0.55) { continue; }
      ctx.beginPath();
      ctx.ellipse(sp.x, sp.y, sp.r * (1 + tw), sp.r * 0.6, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 248, ' + (0.10 + tw * 0.45).toFixed(3) + ')';
      ctx.fill();
    }

    // 拍上岸的白色泡沫（海岸线附近）
    var foamY = sy - span * 0.05;
    ctx.beginPath();
    for (var fx = -20; fx <= W + 24; fx += 8) {
      var fy = waveY(fx, foamY, span * 0.03, Math.max(160, W * 0.22), 0.34) + span * 0.02;
      if (fx === -20) { ctx.moveTo(fx, fy); } else { ctx.lineTo(fx, fy); }
    }
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.78)';
    ctx.lineWidth = Math.max(2.2, span * 0.020);
    ctx.lineCap = 'round';
    ctx.stroke();

    // 泡沫点
    for (var i2 = 0; i2 < 90; i2++) {
      var px = ((i2 * 37.7 + t * 14) % (W + 60)) - 30;
      var py = waveY(px, foamY, span * 0.03, Math.max(160, W * 0.22), 0.34) + span * 0.02
        + ((i2 * 13.3) % 9) - 4;
      var pr = 1.1 + ((i2 * 7.1) % 3) * 0.6;
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.66)';
      ctx.fill();
    }
    ctx.restore();
  }

  function drawBoat() {
    // 海平面上一艘慢慢开的小帆船（很小，只是点睛）
    var hy = horizonY();
    var span = Math.max(60, sandY() - hy);
    var x = ((W * 0.25 + t * 7) % (W + 260)) - 130;
    var y = hy + span * 0.055;
    var s = Math.max(0.7, H / 720) * 11;

    ctx.save();
    ctx.translate(x, y);
    // 船体
    ctx.beginPath();
    ctx.moveTo(-s * 0.95, 0);
    ctx.quadraticCurveTo(0, s * 0.55, s * 0.95, 0);
    ctx.closePath();
    ctx.fillStyle = 'rgba(122, 142, 156, 0.85)';
    ctx.fill();
    // 大帆 + 小帆
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.08);
    ctx.lineTo(0, -s * 2.5);
    ctx.lineTo(s * 1.05, -s * 0.14);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-s * 0.10, -s * 0.10);
    ctx.lineTo(-s * 0.10, -s * 1.75);
    ctx.lineTo(-s * 0.86, -s * 0.12);
    ctx.closePath();
    ctx.fillStyle = 'rgba(248, 252, 255, 0.85)';
    ctx.fill();
    // 水面倒影
    ctx.beginPath();
    ctx.moveTo(-s * 0.55, s * 0.25);
    ctx.lineTo(s * 0.55, s * 0.25);
    ctx.lineTo(s * 0.30, s * 0.75);
    ctx.lineTo(-s * 0.30, s * 0.75);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.fill();
    ctx.restore();
  }

  function drawRipples() {
    for (var i = 0; i < ripples.length; i++) {
      var r = ripples[i];
      ctx.beginPath();
      ctx.ellipse(r.x, r.y, r.r, r.r * 0.34, 0, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 255, 255, ' + Math.max(0, r.a).toFixed(3) + ')';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
  }

  function drawDrops() {
    for (var i = 0; i < drops.length; i++) {
      var d = drops[i];
      if (d.y < -d.r * 3) { continue; }
      // 雨丝：竖直拉长的椭圆 + 一点高光，浅色场景下比圆点更像下雨
      var rx = Math.max(0.9, d.r * 0.42);
      var ry = d.r * 3.1;
      var rg = ctx.createLinearGradient(d.x, d.y - ry, d.x, d.y + ry);
      rg.addColorStop(0, 'rgba(255, 255, 255, 0)');
      rg.addColorStop(0.45, 'rgba(255, 255, 255, ' + (d.a * 0.95).toFixed(3) + ')');
      rg.addColorStop(0.7, 'rgba(244, 252, 255, ' + (d.a * 0.55).toFixed(3) + ')');
      rg.addColorStop(1, 'rgba(244, 252, 255, 0)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.ellipse(d.x, d.y, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawGull(gl) {
    var s = gl.scale * (H / 720) * 16;
    var flap = Math.sin(gl.ph);
    ctx.save();
    ctx.translate(gl.x, gl.y);
    ctx.strokeStyle = 'rgba(88, 116, 134, 0.72)';
    ctx.lineWidth = Math.max(1.4, s * 0.12);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-s, -flap * s * 0.50);
    ctx.quadraticCurveTo(-s * 0.45, -s * 0.62 - flap * s * 0.34, 0, 0);
    ctx.quadraticCurveTo(s * 0.45, -s * 0.62 - flap * s * 0.34, s, -flap * s * 0.50);
    ctx.stroke();
    ctx.restore();
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (bg) { ctx.drawImage(bg, 0, 0, W, H); }

    drawSea();
    drawBoat();
    drawRipples();
    drawDrops();

    for (var g = 0; g < gulls.length; g++) { drawGull(gulls[g]); }
  }

  function warmup(frames) {
    var dt = 1 / 60;
    for (var i = 0; i < frames; i++) { advance(dt); }
    draw();
  }

  function frame(ts) {
    rafId = window.requestAnimationFrame(frame);
    if (!last) { last = ts; return; }
    var dt = Math.min(0.05, (ts - last) / 1000);
    last = ts;
    if (dt <= 0) { return; }
    advance(dt);
    draw();
  }

  function start() {
    if (!rafId) { last = 0; rafId = window.requestAnimationFrame(frame); }
  }

  function stop() {
    if (rafId) { window.cancelAnimationFrame(rafId); rafId = 0; }
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
