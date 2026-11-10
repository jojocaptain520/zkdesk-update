/* 竹林听雨 —— 雨雾竹林：几竿墨竹压住前景，石板小径与苔石上有水光，檐角滴水成串 */
(function () {
  'use strict';

  var canvas = document.getElementById('scene');
  var ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) { return; }

  var MAX_DPR = 2;
  var TAU = Math.PI * 2;

  var W = 1;
  var H = 1;
  var dpr = 1;
  var U = 1;
  var t = 0;
  var rafId = 0;
  var last = 0;
  var resizeTimer = 0;

  var back = null;    // 静态：雾天 + 远处的竹影与屋脊
  var ground = null;  // 静态：坡地 / 石板小径 / 苔石 / 草
  var eave = null;    // 静态：右上角的亭檐
  var vig = null;

  var gCool = null;
  var gWarm = null;
  var leafSprites = [];

  var culms = [];
  var rain = [];
  var fogs = [];
  var drips = [];
  var splashes = [];
  var ripples = [];
  var puddles = [];
  var dripPoints = [];
  var warmLights = [];
  var dripAcc = 0;
  var rippleAcc = 0;

  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function groundY() { return H * 0.640; }

  function layerScale() {
    return clamp(Math.sqrt(4200000 / (W * H)), 0.5, Math.min(dpr, MAX_DPR));
  }

  function makeGlow(inner, mid, edge) {
    var size = 128;
    var c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    var g = c.getContext('2d');
    var r = size * 0.5;
    var gr = g.createRadialGradient(r, r, 0, r, r, r);
    gr.addColorStop(0, inner);
    gr.addColorStop(0.26, mid);
    gr.addColorStop(0.62, edge || 'rgba(255, 255, 255, 0)');
    gr.addColorStop(1, 'rgba(255, 255, 255, 0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, size, size);
    return c;
  }

  // 一簇竹叶：细枝从竿上分出，枝梢挂 3~5 片细长叶，整簇朝一边斜向下垂
  function makeLeafCluster(dir) {
    var s = 256;
    var c = document.createElement('canvas');
    c.width = s;
    c.height = s;
    var g = c.getContext('2d');

    // 挂点（画到竿上时，这个点对齐到枝根）
    var ax = s * 0.50;
    var ay = s * 0.10;
    // 很短的一根细枝，几乎斜着挑出去
    var tx = ax + dir * s * 0.11;
    var ty = ay + s * 0.075;
    g.strokeStyle = 'rgba(14, 26, 18, 0.95)';
    g.lineWidth = s * 0.009;
    g.beginPath();
    g.moveTo(ax, ay);
    g.quadraticCurveTo(ax + dir * s * 0.07, ay + s * 0.008, tx, ty);
    g.stroke();

    var n = 4 + ((Math.random() * 3) | 0);   // 4~6 片
    for (var i = 0; i < n; i++) {
      var t = n > 1 ? i / (n - 1) : 0.6;
      // 叶根沿细枝往下排，越靠枝梢越偏外
      var rx = ax + (tx - ax) * (0.35 + 0.65 * t);
      var ry = ay + (ty - ay) * (0.35 + 0.65 * t);
      var baseA = dir > 0 ? 0.72 : (Math.PI - 0.72);
      var ang = baseA + rand(-0.14, 0.14) + dir * (0.06 + 0.10 * t);
      var len = s * (0.22 + Math.random() * 0.16) * (1 - 0.13 * t);
      var wd = len / 5.6;
      var dx = Math.cos(ang) * len;
      var dy = Math.sin(ang) * len + len * 0.06;
      var px = -Math.sin(ang) * wd;
      var py = Math.cos(ang) * wd;
      g.beginPath();
      g.moveTo(rx, ry);
      // 上缘：先微拱，末端收成尖
      g.quadraticCurveTo(rx + dx * 0.45 + px * 0.80, ry + dy * 0.45 + py * 0.80,
        rx + dx, ry + dy);
      // 下缘
      g.quadraticCurveTo(rx + dx * 0.42 - px * 0.18, ry + dy * 0.42 - py * 0.18, rx, ry);
      g.closePath();
      g.fillStyle = 'rgba(17, 31, 21, ' + (0.84 + Math.random() * 0.16).toFixed(2) + ')';
      g.fill();
    }
    return c;
  }

  // ------------------------------------------------------------------
  // 静态层：雾天 + 远处竹影 / 屋脊
  // ------------------------------------------------------------------
  function buildBack() {
    var s = layerScale();
    back = document.createElement('canvas');
    back.width = Math.max(1, Math.round(W * s));
    back.height = Math.max(1, Math.round(H * s));
    var g = back.getContext('2d');
    g.setTransform(s, 0, 0, s, 0, 0);

    var sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#eef2ea');
    sky.addColorStop(0.26, '#e3eade');
    sky.addColorStop(0.48, '#d3ddcf');
    sky.addColorStop(0.66, '#becbbd');
    sky.addColorStop(0.84, '#a3b3a0');
    sky.addColorStop(1, '#8d9d8b');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);

    var halo = g.createRadialGradient(W * 0.64, H * 0.16, 0, W * 0.64, H * 0.16, Math.max(W, H) * 0.52);
    halo.addColorStop(0, 'rgba(252, 253, 247, 0.34)');
    halo.addColorStop(0.5, 'rgba(252, 253, 247, 0.10)');
    halo.addColorStop(1, 'rgba(252, 253, 247, 0)');
    g.fillStyle = halo;
    g.fillRect(0, 0, W, H);

    // 远处的竹林：一团团软影浮在雾里，下面拖着淡淡的竿影
    var i;
    for (i = 0; i < 16; i++) {
      var bx = rand(-0.02, 1.02) * W;
      var by = rand(-0.06, 0.20) * H;
      var br = rand(0.07, 0.19) * W;
      var bgr = g.createRadialGradient(bx, by, 0, bx, by, br);
      bgr.addColorStop(0, 'rgba(98, 118, 100, ' + rand(0.10, 0.20).toFixed(2) + ')');
      bgr.addColorStop(1, 'rgba(98, 118, 100, 0)');
      g.fillStyle = bgr;
      g.beginPath();
      g.arc(bx, by, br, 0, TAU);
      g.fill();
    }

    // 远处一层极淡的竹影（竖线，融在雾里）
    for (i = 0; i < 26; i++) {
      var x = rand(-0.02, 1.02) * W;
      var top = rand(0.02, 0.30) * H;
      var bw = rand(0.8, 2.0) * U;
      g.beginPath();
      g.moveTo(x, H * 0.66);
      g.quadraticCurveTo(x + rand(-0.006, 0.006) * W, H * 0.36, x + rand(-0.012, 0.012) * W, top);
      g.strokeStyle = 'rgba(150, 168, 148, ' + rand(0.05, 0.10).toFixed(3) + ')';
      g.lineWidth = bw;
      g.stroke();
    }

    // 远处一片朦胧的屋脊：墙 + 平缓的瓦顶 + 一线湿光（两头化进雾里）
    var ry = H * 0.470;
    var wallFade = g.createLinearGradient(W * 0.19, 0, W * 0.82, 0);
    wallFade.addColorStop(0, 'rgba(152, 164, 148, 0)');
    wallFade.addColorStop(0.22, 'rgba(152, 164, 148, 0.22)');
    wallFade.addColorStop(0.66, 'rgba(152, 164, 148, 0.20)');
    wallFade.addColorStop(1, 'rgba(152, 164, 148, 0)');
    g.fillStyle = wallFade;
    g.fillRect(W * 0.19, ry, W * 0.63, H * 0.032);
    var roofFade = g.createLinearGradient(W * 0.19, 0, W * 0.82, 0);
    roofFade.addColorStop(0, 'rgba(116, 130, 114, 0)');
    roofFade.addColorStop(0.24, 'rgba(116, 130, 114, 0.46)');
    roofFade.addColorStop(0.62, 'rgba(116, 130, 114, 0.44)');
    roofFade.addColorStop(1, 'rgba(116, 130, 114, 0)');
    g.fillStyle = roofFade;
    g.beginPath();
    g.moveTo(W * 0.245, ry + H * 0.006);
    g.lineTo(W * 0.268, ry - H * 0.012);
    g.lineTo(W * 0.34, ry - H * 0.015);
    g.lineTo(W * 0.44, ry - H * 0.017);
    g.lineTo(W * 0.54, ry - H * 0.019);
    g.lineTo(W * 0.63, ry - H * 0.016);
    g.lineTo(W * 0.70, ry - H * 0.014);
    g.lineTo(W * 0.735, ry - H * 0.006);
    g.lineTo(W * 0.742, ry + H * 0.006);
    g.closePath();
    g.fill();
    for (i = 0; i < 9; i++) {
      var rx2 = W * (0.28 + i * 0.05);
      g.beginPath();
      g.moveTo(rx2, ry - H * 0.014);
      g.lineTo(rx2 + W * 0.002, ry + H * 0.004);
      g.strokeStyle = 'rgba(150, 164, 148, 0.30)';
      g.lineWidth = Math.max(1, H * 0.0016);
      g.stroke();
    }

    // 屋脊下的一点暖光
    warmLights.length = 0;
    warmLights.push({ x: W * 0.588, y: ry - H * 0.019, r: H * 0.020, a: 0.55 });
    warmLights.push({ x: W * 0.512, y: ry - H * 0.017, r: H * 0.013, a: 0.36 });
    g.fillStyle = 'rgba(238, 202, 140, 0.40)';
    for (i = 0; i < warmLights.length; i++) {
      g.fillRect(warmLights[i].x - H * 0.005, warmLights[i].y - H * 0.008, H * 0.012, H * 0.015);
    }

    // 坡地之上的一层雾，把地缝糊住
    var fade = g.createLinearGradient(0, ry + H * 0.02, 0, groundY() + H * 0.03);
    fade.addColorStop(0, 'rgba(196, 208, 194, 0)');
    fade.addColorStop(0.65, 'rgba(186, 200, 184, 0.55)');
    fade.addColorStop(1, 'rgba(168, 184, 166, 0.85)');
    g.fillStyle = fade;
    g.fillRect(0, ry + H * 0.02, W, groundY() + H * 0.03 - ry);
  }

  // ------------------------------------------------------------------
  // 静态层：坡地 / 石板小径 / 苔石 / 草
  // ------------------------------------------------------------------
  function drawRock(g, cx, cy, rx, ry) {
    var i, a, x, y;
    g.beginPath();
    for (i = 0; i <= 12; i++) {
      a = Math.PI * (i / 12);
      var k = 1 + Math.sin(i * 2.3) * 0.08;
      x = cx - rx * Math.cos(a) * k;
      y = cy - ry * Math.sin(a) * k;
      if (i === 0) { g.moveTo(x, y); } else { g.lineTo(x, y); }
    }
    g.lineTo(cx + rx, cy + ry * 0.32);
    g.quadraticCurveTo(cx, cy + ry * 0.58, cx - rx, cy + ry * 0.32);
    g.closePath();
    var rg = g.createLinearGradient(cx, cy - ry, cx, cy + ry * 0.5);
    rg.addColorStop(0, '#6b7a69');
    rg.addColorStop(0.45, '#4b5a4c');
    rg.addColorStop(1, '#1e2922');
    g.fillStyle = rg;
    g.fill();
    // 石上的苔
    var mg = g.createRadialGradient(cx - rx * 0.05, cy - ry * 0.66, 0, cx - rx * 0.05, cy - ry * 0.66, rx * 0.9);
    mg.addColorStop(0, 'rgba(102, 132, 88, 0.55)');
    mg.addColorStop(1, 'rgba(102, 132, 88, 0)');
    g.fillStyle = mg;
    g.beginPath();
    g.ellipse(cx - rx * 0.05, cy - ry * 0.58, rx * 0.82, ry * 0.52, 0, 0, TAU);
    g.fill();
    // 石头下沿的暗
    g.beginPath();
    g.moveTo(cx - rx, cy + ry * 0.30);
    g.quadraticCurveTo(cx, cy + ry * 0.60, cx + rx, cy + ry * 0.30);
    g.strokeStyle = 'rgba(10, 16, 12, 0.55)';
    g.lineWidth = Math.max(1.4, ry * 0.09);
    g.stroke();
  }

  function buildGround() {
    var s = layerScale();
    ground = document.createElement('canvas');
    ground.width = Math.max(1, Math.round(W * s));
    ground.height = Math.max(1, Math.round(H * s));
    var g = ground.getContext('2d');
    g.setTransform(s, 0, 0, s, 0, 0);
    var gy = groundY();
    var i, x, k;

    // 坡地：从雾色一路暗到墨绿
    var base = g.createLinearGradient(0, gy - H * 0.10, 0, H);
    base.addColorStop(0, 'rgba(169, 184, 168, 0)');
    base.addColorStop(0.20, 'rgba(150, 168, 148, 0.45)');
    base.addColorStop(0.42, 'rgba(106, 126, 104, 0.90)');
    base.addColorStop(0.62, '#4e6250');
    base.addColorStop(0.80, '#2e4034');
    base.addColorStop(1, '#0f1712');
    g.fillStyle = base;
    g.fillRect(0, gy - H * 0.10, W, H - gy + H * 0.10);

    // 坡地起伏的暗部
    g.beginPath();
    g.moveTo(-10, H);
    g.lineTo(-10, gy + H * 0.03);
    for (x = -10; x <= W + 10; x += 20) {
      g.lineTo(x, gy + H * 0.03 + Math.sin(x * 0.003 + 1.2) * H * 0.008 + Math.sin(x * 0.008) * H * 0.004);
    }
    g.lineTo(W + 10, H);
    g.closePath();
    g.fillStyle = 'rgba(24, 34, 26, 0.28)';
    g.fill();

    // ---- 汀步：几块青石板从左下慢慢通向雾里
    var stones = [
      [0.070, 0.968, 0.090, 0.024], [0.150, 0.932, 0.082, 0.022],
      [0.235, 0.894, 0.073, 0.020], [0.320, 0.860, 0.064, 0.018],
      [0.400, 0.830, 0.056, 0.016], [0.472, 0.804, 0.049, 0.014],
      [0.536, 0.782, 0.042, 0.012], [0.592, 0.764, 0.036, 0.011]
    ];
    for (i = stones.length - 1; i >= 0; i--) {
      var sx = stones[i][0] * W;
      var sy = stones[i][1] * H;
      var srx = stones[i][2] * W;
      var sry = stones[i][3] * H;
      g.beginPath();
      var pts = 10;
      for (k = 0; k <= pts; k++) {
        var a = (k / pts) * TAU;
        var kk = 1 + Math.sin(a * 3 + i) * 0.10;
        var px = sx + Math.cos(a) * srx * kk;
        var py = sy + Math.sin(a) * sry * kk;
        if (k === 0) { g.moveTo(px, py); } else { g.lineTo(px, py); }
      }
      g.closePath();
      var sg = g.createLinearGradient(0, sy - sry, 0, sy + sry);
      sg.addColorStop(0, '#a0ab99');
      sg.addColorStop(0.32, '#727f6b');
      sg.addColorStop(1, '#2c3a2e');
      g.fillStyle = sg;
      g.fill();
      // 湿亮的上沿
      g.beginPath();
      g.moveTo(sx - srx * 0.78, sy - sry * 0.30);
      g.quadraticCurveTo(sx, sy - sry * 1.06, sx + srx * 0.78, sy - sry * 0.30);
      g.strokeStyle = 'rgba(218, 230, 214, ' + (0.20 - i * 0.018).toFixed(2) + ')';
      g.lineWidth = Math.max(1, H * 0.0028);
      g.stroke();
      // 石头下沿的暗影
      g.beginPath();
      g.moveTo(sx - srx * 0.82, sy + sry * 0.34);
      g.quadraticCurveTo(sx, sy + sry * 1.14, sx + srx * 0.82, sy + sry * 0.34);
      g.strokeStyle = 'rgba(8, 14, 10, 0.45)';
      g.lineWidth = Math.max(1.2, H * 0.0036);
      g.stroke();
      // 石边的苔
      for (k = 0; k < 2; k++) {
        var mx = sx + rand(-0.9, 0.9) * srx;
        var my = sy + rand(-0.5, 0.9) * sry;
        var mr = rand(0.008, 0.024) * W;
        var mg = g.createRadialGradient(mx, my, 0, mx, my, mr);
        mg.addColorStop(0, 'rgba(98, 126, 84, 0.42)');
        mg.addColorStop(1, 'rgba(98, 126, 84, 0)');
        g.fillStyle = mg;
        g.beginPath();
        g.ellipse(mx, my, mr, mr * 0.32, 0, 0, TAU);
        g.fill();
      }
    }

    // ---- 苔石
    drawRock(g, W * 0.015, H * 0.905, W * 0.135, H * 0.075);
    drawRock(g, W * 0.845, H * 0.930, W * 0.175, H * 0.095);
    drawRock(g, W * 0.330, H * 1.010, W * 0.110, H * 0.055);
    drawRock(g, W * 0.700, H * 0.860, W * 0.070, H * 0.038);

    // ---- 草：贴着石头和汀步边
    for (k = 0; k < 3; k++) {
      g.beginPath();
      for (i = 0; i < 52; i++) {
        var gx = rand(0, 1) * W;
        var gyy = rand(0.70, 1.02) * H;
        var gl = rand(0.014, 0.046) * H;
        var lean = rand(-0.45, 0.45);
        g.moveTo(gx, gyy);
        g.quadraticCurveTo(gx + lean * gl * 0.5, gyy - gl * 0.6,
          gx + lean * gl, gyy - gl);
      }
      g.strokeStyle = ['rgba(58, 82, 58, 0.55)', 'rgba(88, 112, 80, 0.40)', 'rgba(30, 46, 32, 0.55)'][k];
      g.lineWidth = Math.max(0.8, U * 1.1);
      g.stroke();
    }

    // ---- 水洼
    puddles.length = 0;
    puddles.push({ x: W * 0.150, y: H * 0.932, rx: W * 0.058, ry: H * 0.010 });
    puddles.push({ x: W * 0.320, y: H * 0.860, rx: W * 0.042, ry: H * 0.008 });
    puddles.push({ x: W * 0.400, y: H * 0.830, rx: W * 0.034, ry: H * 0.006 });
    for (i = 0; i < puddles.length; i++) {
      var pu = puddles[i];
      g.save();
      g.translate(pu.x, pu.y);
      g.scale(1, pu.ry / pu.rx);
      var pg = g.createRadialGradient(0, 0, 0, 0, 0, pu.rx);
      pg.addColorStop(0, 'rgba(216, 226, 216, 0.50)');
      pg.addColorStop(0.60, 'rgba(150, 168, 154, 0.30)');
      pg.addColorStop(1, 'rgba(120, 138, 124, 0)');
      g.fillStyle = pg;
      g.beginPath();
      g.arc(0, 0, pu.rx, 0, TAU);
      g.fill();
      g.restore();
    }
  }

  // ------------------------------------------------------------------
  // 静态层：右上角的亭檐
  // ------------------------------------------------------------------
  function buildEave() {
    var s = layerScale();
    eave = document.createElement('canvas');
    eave.width = Math.max(1, Math.round(W * s));
    eave.height = Math.max(1, Math.round(H * s));
    var g = eave.getContext('2d');
    g.setTransform(s, 0, 0, s, 0, 0);

    var reach = Math.min(W * 0.175, H * 0.340);
    var N = 30;
    var i, p, x, y;
    var y0 = H * 0.098;
    var tipX = W - reach;
    var tipY = H * 0.028;

    function ey(pp) {
      return y0 + (tipY - y0) * Math.pow(pp, 1.30) - H * 0.008 * Math.pow(pp, 5);
    }
    function ex(pp) { return W - reach * pp; }

    var roofEdge = H * 0.070;
    function ridgeY(pp) { return ey(pp) - roofEdge * (1 - 0.32 * pp); }

    // 瓦带
    g.beginPath();
    for (i = 0; i <= N; i++) { p = i / N; x = ex(p); y = ey(p); if (i === 0) { g.moveTo(x, y); } else { g.lineTo(x, y); } }
    for (i = N; i >= 0; i--) { g.lineTo(ex(i / N), ridgeY(i / N)); }
    g.closePath();
    var roof = g.createLinearGradient(0, ridgeY(0.5), 0, ey(0.5));
    roof.addColorStop(0, '#22302a');
    roof.addColorStop(0.5, '#141f1a');
    roof.addColorStop(1, '#0a1210');
    g.fillStyle = roof;
    g.fill();

    // 屋脊湿亮边
    g.beginPath();
    for (i = 0; i <= N; i++) { p = i / N; x = ex(p); y = ridgeY(p); if (i === 0) { g.moveTo(x, y); } else { g.lineTo(x, y); } }
    g.strokeStyle = 'rgba(212, 226, 214, 0.30)';
    g.lineWidth = Math.max(1, H * 0.0024);
    g.stroke();

    // 瓦垄
    var count = Math.max(12, Math.round(reach / (H * 0.014)));
    for (i = 0; i < count; i++) {
      p = (i + 0.5) / count;
      x = ex(p);
      y = ey(p);
      var len = roofEdge * (0.86 - 0.22 * p);
      var dg = g.createLinearGradient(x, y, x, y - len);
      dg.addColorStop(0, 'rgba(0, 0, 0, 0.45)');
      dg.addColorStop(0.6, 'rgba(0, 0, 0, 0.16)');
      dg.addColorStop(1, 'rgba(0, 0, 0, 0)');
      g.beginPath();
      g.moveTo(x, y - H * 0.003);
      g.lineTo(x + H * 0.002, y - len);
      g.strokeStyle = dg;
      g.lineWidth = Math.max(1.2, H * 0.0034);
      g.stroke();
      var lg2 = g.createLinearGradient(x, y, x, y - len);
      lg2.addColorStop(0, 'rgba(204, 220, 206, 0.18)');
      lg2.addColorStop(0.5, 'rgba(204, 220, 206, 0.06)');
      lg2.addColorStop(1, 'rgba(204, 220, 206, 0)');
      g.beginPath();
      g.moveTo(x + H * 0.0028, y - H * 0.003);
      g.lineTo(x + H * 0.0048, y - len);
      g.strokeStyle = lg2;
      g.lineWidth = Math.max(0.9, H * 0.0022);
      g.stroke();
    }

    // 檐口
    g.beginPath();
    for (i = 0; i <= N; i++) { p = i / N; x = ex(p); y = ey(p); if (i === 0) { g.moveTo(x, y); } else { g.lineTo(x, y); } }
    g.strokeStyle = '#060c09';
    g.lineWidth = H * 0.018;
    g.stroke();

    // 瓦头：檐口下沿排一列小圆，剪出瓦当的轮廓
    var tabN = Math.max(18, Math.round(reach / (H * 0.012)));
    for (i = 0; i < tabN; i++) {
      p = (i + 0.5) / tabN;
      g.beginPath();
      g.arc(ex(p), ey(p) + H * 0.004, Math.max(1.4, H * 0.0048), 0, TAU);
      g.fillStyle = '#060c09';
      g.fill();
    }

    // 瓦当
    var dab = Math.round(count * 0.6);
    for (i = 0; i < dab; i++) {
      p = (i + 0.5) / dab;
      g.beginPath();
      g.arc(ex(p), ey(p) - H * 0.002, Math.max(1, H * 0.0028), 0, TAU);
      g.fillStyle = 'rgba(208, 222, 210, 0.22)';
      g.fill();
    }

    // 檐口内侧的一线冷光
    g.beginPath();
    for (i = 0; i <= N; i++) { p = i / N; x = ex(p); y = ey(p) - H * 0.010; if (i === 0) { g.moveTo(x, y); } else { g.lineTo(x, y); } }
    g.strokeStyle = 'rgba(220, 234, 222, 0.18)';
    g.lineWidth = Math.max(1, H * 0.0020);
    g.stroke();

    // 飞檐尖
    g.beginPath();
    g.moveTo(tipX + W * 0.003, ey(1) + H * 0.006);
    g.quadraticCurveTo(tipX - W * 0.013, ey(1) + H * 0.001, tipX - W * 0.022, ey(1) - H * 0.017);
    g.lineTo(tipX - W * 0.015, ey(1) - H * 0.019);
    g.quadraticCurveTo(tipX - W * 0.007, ey(1) - H * 0.006, tipX + W * 0.003, ey(1) + H * 0.001);
    g.closePath();
    g.fillStyle = '#060c09';
    g.fill();
    g.beginPath();
    g.moveTo(tipX - W * 0.001, ey(1) - H * 0.002);
    g.quadraticCurveTo(tipX - W * 0.013, ey(1) - H * 0.005, tipX - W * 0.021, ey(1) - H * 0.016);
    g.strokeStyle = 'rgba(220, 234, 222, 0.26)';
    g.lineWidth = Math.max(1, H * 0.0022);
    g.stroke();

    // 檐下的一根木撑
    g.beginPath();
    g.moveTo(ex(0.90), ey(0.90) + H * 0.006);
    g.lineTo(ex(0.58), ey(0.58) + H * 0.040);
    g.lineTo(ex(0.545), ey(0.545) + H * 0.038);
    g.lineTo(ex(0.86), ey(0.86) + H * 0.003);
    g.closePath();
    g.fillStyle = 'rgba(22, 33, 26, 0.92)';
    g.fill();

    // 滴水点
    dripPoints.length = 0;
    var dp = [0.16, 0.40, 0.64, 0.86];
    for (i = 0; i < dp.length; i++) {
      dripPoints.push({
        x: ex(dp[i]) + (i % 2 === 0 ? W * 0.003 : -W * 0.002),
        y: ey(dp[i]) + H * 0.010,
        ph: rand(0, TAU)
      });
    }
  }

  function buildVig() {
    var w = 320;
    var h = 180;
    vig = document.createElement('canvas');
    vig.width = w;
    vig.height = h;
    var g = vig.getContext('2d');
    var rg = g.createRadialGradient(w * 0.5, h * 0.44, h * 0.22, w * 0.5, h * 0.44, w * 0.72);
    rg.addColorStop(0, 'rgba(0, 0, 0, 0)');
    rg.addColorStop(0.58, 'rgba(0, 0, 0, 0.10)');
    rg.addColorStop(1, 'rgba(0, 0, 0, 0.46)');
    g.fillStyle = rg;
    g.fillRect(0, 0, w, h);
    var bot = g.createLinearGradient(0, h * 0.70, 0, h);
    bot.addColorStop(0, 'rgba(0, 0, 0, 0)');
    bot.addColorStop(1, 'rgba(0, 0, 0, 0.34)');
    g.fillStyle = bot;
    g.fillRect(0, h * 0.70, w, h * 0.30);
  }

  // ------------------------------------------------------------------
  // 竹子
  // ------------------------------------------------------------------
  var LAYERS = [
    { n: 9, w: [2.4, 3.6], h: [0.34, 0.60], a: 0.16, fill: '#7d9280', nodes: 0, leafA: 0.18, leafS: 0.095, leaves: 1 },
    { n: 10, w: [4.5, 7.0], h: [0.46, 0.76], a: 0.34, fill: '#4a6a52', nodes: 3, leafA: 0.34, leafS: 0.090, leaves: 3 },
    { n: 5, w: [9.0, 13.0], h: [0.60, 0.94], a: 0.62, fill: '#2b4836', nodes: 4, leafA: 0.56, leafS: 0.105, leaves: 4 },
    { n: 3, w: [21, 30], h: [1.16, 1.46], a: 0.97, fill: '#0a140f', nodes: 8, leafA: 0.95, leafS: 0.125, leaves: 6 }
  ];

  function culmX(c, p) {
    return c.x + c.lean * Math.pow(p, 1.7) +
      Math.sin(t * c.sp + c.ph + p * 1.1) * c.sway * Math.pow(p, 1.7);
  }

  function culmY(c, p) {
    return c.baseY + (c.topY - c.baseY) * p;
  }

  function makeCulms() {
    culms.length = 0;
    var gy = groundY();
    var L = LAYERS.length;
    var foreX = [0.030, 0.118, 0.952];
    for (var li = 0; li < L; li++) {
      var cfg = LAYERS[li];
      for (var i = 0; i < cfg.n; i++) {
        var x;
        if (li === L - 1) {
          x = foreX[i % foreX.length] * W + rand(-0.012, 0.012) * W;
        } else {
          var anchors = [0.035, 0.115, 0.205, 0.300, 0.395, 0.490, 0.575, 0.660, 0.750, 0.840, 0.930];
          var ai = (i * 3 + li * 5) % anchors.length;
          x = (anchors[ai] + rand(-0.028, 0.028)) * W;
        }
        var hgt = rand(cfg.h[0], cfg.h[1]) * H;
        var c = {
          layer: li,
          x: x,
          baseY: li === L - 1 ? H * 1.03 : gy + rand(0.00, 0.02) * H,
          topY: 0,
          w: rand(cfg.w[0], cfg.w[1]) * U,
          lean: rand(-0.03, 0.03) * H * (li === L - 1 ? 1.5 : 1),
          sp: rand(0.5, 1.2),
          ph: rand(0, TAU),
          sway: rand(0.006, 0.024) * H * (li === L - 1 ? 1.6 : 1),
          rot: rand(-0.5, 0.5)
        };
        c.topY = c.baseY - hgt;
        culms.push(c);
      }
    }
    culms.sort(function (a, b) { return a.layer - b.layer; });
  }

  function drawBambooLayer(li) {
    var cfg = LAYERS[li];
    var seg = 8;
    var i, j, p, x, y, ww, c;

    // ---- 竹竿：同层合批，一次 fill
    ctx.beginPath();
    for (i = 0; i < culms.length; i++) {
      c = culms[i];
      if (c.layer !== li) { continue; }
      for (j = 0; j <= seg; j++) {
        p = j / seg;
        x = culmX(c, p);
        y = culmY(c, p);
        ww = c.w * (1 - 0.40 * p) * 0.5;
        if (j === 0) { ctx.moveTo(x - ww, y); } else { ctx.lineTo(x - ww, y); }
      }
      for (j = seg; j >= 0; j--) {
        p = j / seg;
        x = culmX(c, p);
        y = culmY(c, p);
        ww = c.w * (1 - 0.40 * p) * 0.5;
        ctx.lineTo(x + ww, y);
      }
      ctx.closePath();
    }
    ctx.globalAlpha = cfg.a;
    ctx.fillStyle = cfg.fill;
    ctx.fill();

    // ---- 竹节
    if (cfg.nodes) {
      var isFore = li === 3;
      ctx.beginPath();
      for (i = 0; i < culms.length; i++) {
        c = culms[i];
        if (c.layer !== li) { continue; }
        for (j = 1; j <= cfg.nodes; j++) {
          p = j / (cfg.nodes + 1);
          x = culmX(c, p);
          y = culmY(c, p);
          ww = c.w * (1 - 0.40 * p) * 0.5;
          ctx.moveTo(x - ww - (isFore ? 1 : 0), y);
          ctx.lineTo(x + ww + (isFore ? 1 : 0), y);
        }
      }
      ctx.globalAlpha = clamp(cfg.a * 1.1, 0, 1);
      ctx.strokeStyle = isFore ? 'rgba(5, 10, 8, 0.95)' : 'rgba(34, 50, 40, 0.75)';
      ctx.lineWidth = Math.max(1.2, U * (isFore ? 3.4 : 1.2));
      ctx.stroke();

      if (isFore) {
        // 竹节下的一线反光
        ctx.beginPath();
        for (i = 0; i < culms.length; i++) {
          c = culms[i];
          if (c.layer !== li) { continue; }
          for (j = 1; j <= cfg.nodes; j++) {
            p = j / (cfg.nodes + 1) + 0.006;
            x = culmX(c, p);
            y = culmY(c, p);
            ww = c.w * (1 - 0.40 * p) * 0.5;
            ctx.moveTo(x - ww, y);
            ctx.lineTo(x + ww, y);
          }
        }
        ctx.globalAlpha = 0.14;
        ctx.strokeStyle = '#cfe0cf';
        ctx.lineWidth = Math.max(1, U * 1.4);
        ctx.stroke();
      }
    }

    // ---- 竹竿左侧的一道冷高光（只给近景）
    if (li === 3) {
      ctx.beginPath();
      for (i = 0; i < culms.length; i++) {
        c = culms[i];
        if (c.layer !== li) { continue; }
        for (j = 0; j <= seg; j++) {
          p = j / seg;
          x = culmX(c, p);
          y = culmY(c, p);
          ww = c.w * (1 - 0.40 * p) * 0.5;
          if (j === 0) { ctx.moveTo(x - ww * 0.58, y); } else { ctx.lineTo(x - ww * 0.58, y); }
        }
      }
      ctx.globalAlpha = 0.22;
      ctx.strokeStyle = '#d2e2d2';
      ctx.lineWidth = Math.max(1, U * 2.0);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;

    // ---- 竹叶：沿竹竿上半段抽出细枝，枝头挂一簇叶
    if (cfg.leaves > 0 && leafSprites.length) {
      var isF = li === 3;
      for (i = 0; i < culms.length; i++) {
        c = culms[i];
        if (c.layer !== li) { continue; }
        for (j = 0; j < cfg.leaves; j++) {
          var pp = 0.40 + (j / Math.max(1, cfg.leaves - 1)) * 0.56 + rand(-0.02, 0.02);
          if (pp > 0.99) { pp = 0.99; }
          if (pp < 0.10) { pp = 0.10; }
          var lx = culmX(c, pp);
          var ly = culmY(c, pp);
          var side = (j % 2 === 0 ? 1 : -1);
          var swayR = Math.sin(t * c.sp * 1.3 + c.ph + j * 1.7) * 0.06;
          var s2 = cfg.leafS * W * (0.88 + 0.28 * ((i + j) % 3));
          var bx = lx + side * s2 * 0.10;
          var by = ly + s2 * 0.02;
          // 竿上分出的短枝
          ctx.beginPath();
          ctx.moveTo(lx, ly);
          ctx.quadraticCurveTo(lx + side * s2 * 0.05, ly + s2 * 0.005, bx, by);
          ctx.strokeStyle = isF ? 'rgba(5, 10, 8, 0.92)' : 'rgba(40, 60, 46, 0.65)';
          ctx.lineWidth = Math.max(0.8, U * (isF ? 2.0 : 1.1));
          ctx.stroke();
          // 叶簇（朝同一侧下垂）
          ctx.save();
          ctx.globalAlpha = cfg.leafA;
          ctx.translate(bx, by);
          ctx.rotate(c.rot * 0.6 + swayR + side * 0.08);
          ctx.drawImage(leafSprites[side > 0 ? ((i + j) % 2) : (2 + (i + j) % 2)],
            -s2 * 0.5, -s2 * 0.10, s2, s2);
          ctx.restore();
        }
      }
      ctx.globalAlpha = 1;
    }
  }

  // ------------------------------------------------------------------
  // 动态：雨 / 雾 / 滴水 / 涟漪
  // ------------------------------------------------------------------
  function newRainDrop(spread) {
    return {
      x: rand(-0.06, 1.06) * W,
      y: spread ? rand(-1, 1) * H : rand(-0.4, -0.02) * H,
      len: rand(0.022, 0.052) * H,
      spd: rand(0.80, 1.40) * H
    };
  }

  function rebuild() {
    gCool = makeGlow('rgba(246, 250, 244, 0.80)', 'rgba(216, 228, 218, 0.28)');
    gWarm = makeGlow('rgba(255, 226, 172, 0.90)', 'rgba(226, 166, 96, 0.32)');
    leafSprites = [
      makeLeafCluster(1), makeLeafCluster(1),
      makeLeafCluster(-1), makeLeafCluster(-1)
    ];

    buildVig();
    buildBack();
    buildGround();
    buildEave();
    makeCulms();

    rain.length = 0;
    var rn = Math.round(clamp(W * H / 3200, 190, 450));
    for (var i = 0; i < rn; i++) { rain.push(newRainDrop(true)); }

    fogs.length = 0;
    for (var k = 0; k < 6; k++) {
      fogs.push({
        x: rand(-0.2, 0.9) * W,
        y: rand(0.18, 0.68) * H,
        w: rand(0.35, 0.85) * W,
        h: rand(0.030, 0.070) * H,
        spd: rand(0.006, 0.016) * W,
        a: rand(0.28, 0.58),
        ph: rand(0, TAU)
      });
    }

    drips.length = 0;
    splashes.length = 0;
    ripples.length = 0;
    dripAcc = 0;
    rippleAcc = 0;
  }

  function advance(dt) {
    t += dt;
    var i, d;

    for (i = 0; i < rain.length; i++) {
      d = rain[i];
      d.y += d.spd * dt;
      d.x += d.spd * 0.20 * dt;
      if (d.y > H + d.len) {
        d.x = rand(-0.10, 1.02) * W;
        d.y = rand(-0.4, -0.02) * H;
        d.len = rand(0.022, 0.052) * H;
        d.spd = rand(0.80, 1.40) * H;
      }
    }

    for (i = 0; i < fogs.length; i++) {
      var f = fogs[i];
      f.x += f.spd * dt;
      if (f.x - f.w * 0.5 > W) { f.x = -f.w * 0.5; }
    }

    // 檐口滴水
    dripAcc += dt;
    if (dripAcc > 0.26) {
      dripAcc = 0;
      if (dripPoints.length && drips.length < 30) {
        var dp = dripPoints[(Math.random() * dripPoints.length) | 0];
        drips.push({
          x: dp.x + rand(-W * 0.005, W * 0.005),
          y: dp.y,
          vy: rand(0.08, 0.20) * H,
          r: rand(1.0, 2.4) * U
        });
      }
    }
    for (i = drips.length - 1; i >= 0; i--) {
      d = drips[i];
      d.vy += H * 0.55 * dt;
      d.y += d.vy * dt;
      var floorY = groundY() + H * rand(0.02, 0.14);
      if (d.y > floorY) {
        for (var s = 0; s < 5; s++) {
          splashes.push({
            x: d.x,
            y: floorY,
            vx: rand(-0.05, 0.05) * W,
            vy: rand(-0.14, -0.04) * H,
            life: 1
          });
        }
        if (ripples.length < 60) {
          ripples.push({ x: d.x, y: floorY, r: 1, max: rand(6, 16) * U, a: rand(0.22, 0.40) });
        }
        drips.splice(i, 1);
      }
    }

    // 雨点落在石板 / 水洼上的小圈
    rippleAcc += dt;
    if (rippleAcc > 0.10) {
      rippleAcc = 0;
      if (ripples.length < 76) {
        var rx = Math.random() * W;
        var ry = groundY() + Math.pow(Math.random(), 0.7) * (H - groundY()) * 0.96;
        var dep = (ry - groundY()) / Math.max(1, H - groundY());
        ripples.push({
          x: rx,
          y: ry,
          r: 0.6,
          max: (2.5 + 9 * dep) * U,
          a: 0.10 + 0.17 * dep
        });
      }
    }
    for (i = ripples.length - 1; i >= 0; i--) {
      var rp = ripples[i];
      rp.r += ((rp.max - rp.r) * 2.2 + 7 * U) * dt;
      rp.a -= dt * 0.55;
      if (rp.a <= 0 || rp.r > rp.max) { ripples.splice(i, 1); }
    }

    for (i = splashes.length - 1; i >= 0; i--) {
      var sp = splashes[i];
      sp.vy += H * 0.9 * dt;
      sp.x += sp.vx * dt;
      sp.y += sp.vy * dt;
      sp.life -= dt * 2.6;
      if (sp.life <= 0) { splashes.splice(i, 1); }
    }
  }

  function drawWarmLights() {
    var i, w;
    for (i = 0; i < warmLights.length; i++) {
      w = warmLights[i];
      var breathe = 0.75 + 0.25 * Math.sin(t * 1.05 + i * 2.0);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = w.a * breathe * 0.5;
      ctx.drawImage(gWarm, w.x - w.r * 3.2, w.y - w.r * 3.2, w.r * 6.4, w.r * 6.4);
      ctx.restore();
    }
  }

  function drawFog() {
    var i, f;
    for (i = 0; i < fogs.length; i++) {
      f = fogs[i];
      ctx.globalAlpha = f.a * (0.55 + 0.12 * Math.sin(t * 0.25 + f.ph));
      ctx.drawImage(gCool, f.x - f.w * 0.5, f.y - f.h * 0.5, f.w, f.h);
    }
    ctx.globalAlpha = 1;
  }

  function drawRain() {
    var i, k, d, any;
    for (k = 0; k < 3; k++) {
      ctx.beginPath();
      any = false;
      for (i = k; i < rain.length; i += 3) {
        d = rain[i];
        if (d.y < -d.len) { continue; }
        any = true;
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - d.len * 0.20, d.y + d.len);
      }
      if (!any) { continue; }
      ctx.strokeStyle = 'rgba(240, 248, 240, ' + [0.13, 0.17, 0.21][k] + ')';
      ctx.lineWidth = Math.max(0.7, U * 1.0);
      ctx.stroke();
    }
  }

  function drawDrips() {
    var i, d;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (i = 0; i < drips.length; i++) {
      d = drips[i];
      var len = Math.min(H * 0.040, d.vy * 0.040);
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = 'rgb(234, 244, 236)';
      ctx.beginPath();
      ctx.ellipse(d.x, d.y, d.r * 0.80, Math.max(1.5, len), 0, 0, TAU);
      ctx.fill();
    }
    for (i = 0; i < splashes.length; i++) {
      var sp = splashes[i];
      ctx.globalAlpha = clamp(sp.life, 0, 1) * 0.5;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, Math.max(0.8, U * 1.1), 0, TAU);
      ctx.fillStyle = 'rgb(230, 242, 232)';
      ctx.fill();
    }
    ctx.restore();
  }

  function drawRipples() {
    var i, r;
    ctx.save();
    for (i = 0; i < ripples.length; i++) {
      r = ripples[i];
      ctx.globalAlpha = clamp(r.a, 0, 1);
      ctx.strokeStyle = 'rgba(228, 240, 230, 0.9)';
      ctx.lineWidth = Math.max(0.8, U * 1.0);
      ctx.beginPath();
      ctx.ellipse(r.x, r.y, r.r, r.r * 0.30, 0, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    if (back) { ctx.drawImage(back, 0, 0, W, H); }
    drawWarmLights();
    if (ground) { ctx.drawImage(ground, 0, 0, W, H); }

    drawBambooLayer(0);
    drawBambooLayer(1);
    drawBambooLayer(2);
    drawRipples();
    drawBambooLayer(3);

    if (eave) { ctx.drawImage(eave, 0, 0, W, H); }
    drawDrips();
    drawRain();
    drawFog();

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    if (vig) { ctx.drawImage(vig, 0, 0, W, H); }
  }

  function warmup(frames) {
    var dt = 1 / 30;
    for (var i = 0; i < frames; i++) { advance(dt); }
    draw();
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    W = Math.max(1, window.innerWidth);
    H = Math.max(1, window.innerHeight);
    U = Math.min(W / 1280, H / 720);

    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = 'round';

    rebuild();
    warmup(170);
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
