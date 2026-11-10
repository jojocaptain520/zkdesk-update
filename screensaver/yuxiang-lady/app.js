/* 雨巷佳人 —— 江南雨巷：粉墙黛瓦、青石板、薄雾、檐雨，油纸伞下的背影 */
(function () {
  'use strict';

  var canvas = document.getElementById('scene');
  var ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) { return; }

  var MAX_DPR = 2;

  var W = 1;
  var H = 1;
  var dpr = 1;
  var t = 0;
  var rafId = 0;
  var last = 0;
  var resizeTimer = 0;

  var bg = null;          // 静态层：天、墙、瓦、石板、台阶、门、灯
  var fogSprite = null;   // 雾团
  var glowSprite = null;  // 暖光（灯笼）

  var rainBands = [];     // 细雨（按远近分带，整带一次描边）
  var ripples = [];       // 地面涟漪
  var eaveDrips = [];     // 檐口滴水
  var rimDrips = [];      // 伞沿滴水
  var fogLayers = [];     // 横向漂移的雾
  var fogPuffs = [];      // 从纵深涌出来的雾团

  var vpX = 0;
  var vpY = 0;

  /* 透视参数：巷宽 / 地面高 / 墙头高 都以 W、H 为基准，任何长宽比都不变形 */
  var LW = 0.60;
  var GYF = 0.575;
  var TYF = 0.355;

  var INK = 'rgb(48, 58, 52)';
  var LADY_X = 0.612;
  var LADY_FOOT = 0.736;
  var LADY_H = 0.250;

  function rand(a, b) { return a + Math.random() * (b - a); }

  function hw(zw) { return LW * W / zw; }
  function gyAt(zw) { return vpY + H * GYF / zw; }
  function tyAt(zw) { return vpY - H * TYF / zw; }
  function xAt(side, zw) { return vpX + side * hw(zw); }
  function capT(zw) { return H * 0.040 / zw; }
  function zwAt(y) { return H * GYF / Math.max(0.5, y - vpY); }

  /* ---------------- 离屏层 ---------------- */

  function makeLayer() {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.floor(W * dpr));
    c.height = Math.max(1, Math.floor(H * dpr));
    var g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { c: c, g: g };
  }

  /* 墙的立面：顶边（瓦檐线）→ 底边（墙脚线） */
  function wallPath(g, side) {
    var zA = 1.16;
    var zB = 26;
    var n = 26;
    var i, k, zw;
    g.beginPath();
    for (i = 0; i <= n; i++) {
      k = i / n;
      zw = zA * Math.pow(zB / zA, k);
      if (i === 0) { g.moveTo(xAt(side, zw), tyAt(zw)); }
      else { g.lineTo(xAt(side, zw), tyAt(zw)); }
    }
    for (i = n; i >= 0; i--) {
      k = i / n;
      zw = zA * Math.pow(zB / zA, k);
      g.lineTo(xAt(side, zw), gyAt(zw));
    }
    g.closePath();
  }

  /* 瓦檐：墙头上的一条深灰带 */
  function capPath(g, side) {
    var zA = 1.16;
    var zB = 26;
    var n = 26;
    var i, k, zw;
    g.beginPath();
    for (i = 0; i <= n; i++) {
      k = i / n;
      zw = zA * Math.pow(zB / zA, k);
      if (i === 0) { g.moveTo(xAt(side, zw), tyAt(zw)); }
      else { g.lineTo(xAt(side, zw), tyAt(zw)); }
    }
    for (i = n; i >= 0; i--) {
      k = i / n;
      zw = zA * Math.pow(zB / zA, k);
      g.lineTo(xAt(side, zw), tyAt(zw) + capT(zw));
    }
    g.closePath();
  }

  /* 远处墙头的马头墙：白墙 + 一道道薄瓦檐，阶梯状往巷子里退 */
  function drawGables(g) {
    var sides = [-1, 1];
    for (var s = 0; s < 2; s++) {
      var side = sides[s];
      var dir = side < 0 ? 1 : -1;
      var x0 = side < 0 ? 0 : W;
      var steps = side < 0 ? 5 : 4;
      var sw = W * (side < 0 ? 0.030 : 0.034);
      var rise = H * 0.021;
      var yTop = tyAt(1.16) - H * (side < 0 ? 0.056 : 0.044);

      var stepsArr = [];
      var xx = x0, yy = yTop, i, nx, ny;
      for (i = 0; i < steps; i++) {
        nx = xx + dir * sw;
        ny = yy + rise * (0.9 + i * 0.22);
        stepsArr.push({ xa: xx, xb: nx, y: yy, yn: ny });
        xx = nx; yy = ny;
      }

      // 山墙主体：白粉墙色，只在下沿露在墙头之上
      g.beginPath();
      g.moveTo(x0, yTop);
      for (i = 0; i < stepsArr.length; i++) {
        g.lineTo(stepsArr[i].xb, stepsArr[i].y);
        g.lineTo(stepsArr[i].xb, stepsArr[i].yn);
      }
      g.lineTo(xx, yy + H);
      g.lineTo(x0, yy + H);
      g.closePath();
      g.fillStyle = '#e7e3d1';
      g.fill();

      // 阶梯的瓦檐：每一级顶上一道薄薄的深瓦，两头略出挑
      for (i = 0; i < stepsArr.length; i++) {
        var st = stepsArr[i];
        var l = Math.min(st.xa, st.xb);
        var r = Math.max(st.xa, st.xb);
        var over = W * 0.005;
        var th = Math.max(2, H * 0.0075);
        g.fillStyle = '#4a554d';
        g.fillRect(l - over, st.y - th, (r - l) + over * 2, th);
        g.fillStyle = 'rgba(214, 220, 206, 0.5)';
        g.fillRect(l - over, st.y - th, (r - l) + over * 2, Math.max(1, th * 0.28));
      }

      // 最外侧一道深色勾边
      g.strokeStyle = 'rgba(96, 108, 95, 0.85)';
      g.lineWidth = Math.max(1.6, H * 0.0032);
      g.beginPath();
      g.moveTo(x0, yTop);
      for (i = 0; i < stepsArr.length; i++) {
        g.lineTo(stepsArr[i].xb, stepsArr[i].y);
        g.lineTo(stepsArr[i].xb, stepsArr[i].yn);
      }
      g.stroke();
    }
  }

  function drawWalls(g) {
    var sides = [-1, 1];
    for (var s = 0; s < 2; s++) {
      var side = sides[s];
      var x0 = side < 0 ? 0 : W;
      var grad = g.createLinearGradient(x0, 0, vpX, 0);
      grad.addColorStop(0, '#c8c3ae');
      grad.addColorStop(0.30, '#d7d2be');
      grad.addColorStop(0.62, '#e4dfcc');
      grad.addColorStop(1, '#f0ecdd');
      wallPath(g, side);
      g.fillStyle = grad;
      g.fill();

      // 墙面细节（全部裁在墙里）
      wallPath(g, side);
      g.save();
      g.clip();

      // 檐下的投影：贴着瓦口的一道暗，墙才有厚度
      var shA = 1.16, shB = 9, shN = 24;
      g.beginPath();
      for (var qa = 0; qa <= shN; qa++) {
        var zwa = shA * Math.pow(shB / shA, qa / shN);
        var yTopSh = tyAt(zwa) + capT(zwa);
        if (qa === 0) { g.moveTo(xAt(side, zwa), yTopSh); } else { g.lineTo(xAt(side, zwa), yTopSh); }
      }
      for (var qb = shN; qb >= 0; qb--) {
        var zwb = shA * Math.pow(shB / shA, qb / shN);
        g.lineTo(xAt(side, zwb), tyAt(zwb) + capT(zwb) + H * 0.075 / zwb);
      }
      g.closePath();
      var eaveShadow = g.createLinearGradient(0, tyAt(1.16), 0, tyAt(1.16) + H * 0.09);
      eaveShadow.addColorStop(0, 'rgba(64, 76, 64, 0.22)');
      eaveShadow.addColorStop(0.45, 'rgba(64, 76, 64, 0.09)');
      eaveShadow.addColorStop(1, 'rgba(64, 76, 64, 0)');
      g.fillStyle = eaveShadow;
      g.fill();

      // 上暗下脏的竖向明暗
      var vg = g.createLinearGradient(0, tyAt(1.16), 0, gyAt(1.16));
      vg.addColorStop(0, 'rgba(100, 112, 96, 0.24)');
      vg.addColorStop(0.28, 'rgba(100, 112, 96, 0.02)');
      vg.addColorStop(0.62, 'rgba(112, 124, 105, 0.10)');
      vg.addColorStop(1, 'rgba(92, 106, 88, 0.42)');
      g.fillStyle = vg;
      g.fillRect(0, 0, W, H);

      var i, zw, x, y0, hgt, streak;
      // 从瓦檐垂下来的雨痕
      for (i = 0; i < 42; i++) {
        zw = rand(1.16, 8.0);
        x = xAt(side, zw) + rand(-0.22, 0.22) * hw(zw);
        y0 = tyAt(zw) + capT(zw);
        hgt = rand(0.06, 0.42) * (gyAt(zw) - y0);
        streak = g.createLinearGradient(x, y0, x, y0 + hgt);
        streak.addColorStop(0, 'rgba(112, 122, 106, 0.34)');
        streak.addColorStop(0.45, 'rgba(112, 122, 106, 0.13)');
        streak.addColorStop(1, 'rgba(112, 122, 106, 0)');
        g.strokeStyle = streak;
        g.lineWidth = Math.max(0.8, H * 0.005 / Math.sqrt(zw));
        g.beginPath();
        g.moveTo(x, y0);
        g.lineTo(x + rand(-2.5, 2.5), y0 + hgt);
        g.stroke();
      }
      // 墙脚返潮的深色
      for (i = 0; i < 3; i++) {
        g.beginPath();
        var zwA = 1.16, zwB = 8;
        var nn = 20;
        for (var q = 0; q <= nn; q++) {
          zw = zwA * Math.pow(zwB / zwA, q / nn);
          var px = xAt(side, zw);
          var py = gyAt(zw) - (0.030 + i * 0.055) * (gyAt(zw) - tyAt(zw));
          if (q === 0) { g.moveTo(px, py); } else { g.lineTo(px, py); }
        }
        for (var q2 = nn; q2 >= 0; q2--) {
          zw = zwA * Math.pow(zwB / zwA, q2 / nn);
          g.lineTo(xAt(side, zw), gyAt(zw));
        }
        g.closePath();
        g.fillStyle = 'rgba(132, 142, 124, ' + (0.13 + i * 0.07) + ')';
        g.fill();
      }
      // 斑驳墙皮
      for (i = 0; i < 22; i++) {
        zw = rand(1.2, 10);
        x = xAt(side, zw);
        y0 = rand(0.14, 0.94);
        var hx = x + rand(-0.35, 0.35) * hw(zw);
        var hy = tyAt(zw) + (gyAt(zw) - tyAt(zw)) * y0;
        var sc = 1.6 / zw + 0.42;
        g.fillStyle = 'rgba(138, 147, 130, ' + rand(0.05, 0.14).toFixed(3) + ')';
        g.beginPath();
        g.ellipse(hx, hy, rand(2, 9) * sc, rand(1.4, 4) * sc, rand(0, 3), 0, Math.PI * 2);
        g.fill();
      }
      // 墙粉颗粒
      for (i = 0; i < 300; i++) {
        zw = rand(1.16, 10);
        x = xAt(side, zw) + rand(-0.5, 0.5) * hw(zw);
        y0 = tyAt(zw) + (gyAt(zw) - tyAt(zw)) * rand(0.02, 0.98);
        g.fillStyle = (i & 1) ? 'rgba(255, 255, 248, 0.30)' : 'rgba(128, 138, 121, 0.18)';
        g.fillRect(x, y0, 1.2, 1.2);
      }
      g.restore();

      // 瓦檐
      capPath(g, side);
      var cg = g.createLinearGradient(x0, 0, vpX, 0);
      cg.addColorStop(0, '#3d4841');
      cg.addColorStop(0.45, '#4f5b53');
      cg.addColorStop(0.78, '#6d7b70');
      cg.addColorStop(1, '#a8b3a6');
      g.fillStyle = cg;
      g.fill();

      g.save();
      capPath(g, side);
      g.clip();
      for (i = 0; i <= 34; i++) {
        var k2 = i / 34;
        zw = 1.16 * Math.pow(26 / 1.16, k2);
        x = xAt(side, zw);
        var yt = tyAt(zw);
        var hcap = capT(zw);
        g.strokeStyle = 'rgba(28, 36, 31, 0.42)';
        g.lineWidth = Math.max(0.7, 1.8 / Math.sqrt(zw));
        g.beginPath();
        g.moveTo(x, yt);
        g.lineTo(x, yt + hcap);
        g.stroke();
        g.strokeStyle = 'rgba(206, 214, 200, 0.26)';
        g.beginPath();
        g.moveTo(x + 1.2, yt + hcap * 0.28);
        g.lineTo(x + 1.2, yt + hcap * 0.82);
        g.stroke();
      }
      g.restore();

      // 檐口（湿的一线高光）
      g.beginPath();
      var n2 = 26;
      for (i = 0; i <= n2; i++) {
        var k3 = i / n2;
        zw = 1.16 * Math.pow(26 / 1.16, k3);
        var eyt = tyAt(zw) + capT(zw);
        if (i === 0) { g.moveTo(xAt(side, zw), eyt); } else { g.lineTo(xAt(side, zw), eyt); }
      }
      g.strokeStyle = 'rgba(232, 236, 222, 0.55)';
      g.lineWidth = Math.max(1, H * 0.0026);
      g.stroke();

      // 墙脚暗线
      g.beginPath();
      for (i = 0; i <= n2; i++) {
        var k4 = i / n2;
        zw = 1.16 * Math.pow(26 / 1.16, k4);
        if (i === 0) { g.moveTo(xAt(side, zw), gyAt(zw)); } else { g.lineTo(xAt(side, zw), gyAt(zw)); }
      }
      g.strokeStyle = 'rgba(62, 74, 64, 0.5)';
      g.lineWidth = 2.2;
      g.stroke();
    }
  }

  /* 青石板路：透视里收窄的板缝 + 湿地反光 */
  function pavementPath(g) {

    var i, x, zw, y;
    g.beginPath();
    for (i = 0; i <= 64; i++) {
      x = -6 + (W + 12) * (i / 64);
      zw = Math.min(90, LW * W / Math.max(0.6, Math.abs(x - vpX)));
      y = gyAt(zw);
      if (i === 0) { g.moveTo(x, y); } else { g.lineTo(x, y); }
    }
    g.lineTo(W + 6, H + 6);
    g.lineTo(-6, H + 6);
    g.closePath();
  }

  function drawPavement(g) {
    pavementPath(g);
    var pg = g.createLinearGradient(0, vpY, 0, H);
    pg.addColorStop(0, '#b9c0ae');
    pg.addColorStop(0.10, '#98a496');
    pg.addColorStop(0.34, '#7e8d82');
    pg.addColorStop(0.68, '#66756c');
    pg.addColorStop(1, '#515f57');
    g.fillStyle = pg;
    g.fill();

    g.save();
    pavementPath(g);
    g.clip();

    // 一行行青石板：越近越高，缝朝灭点收
    var rows = [];
    var y = gyAt(9.6);
    while (y < H + 40) {
      rows.push(y);
      var rel = (y - vpY) / (H - vpY);
      y += 2.0 + 34 * rel * rel;
    }
    var tints = [
      'rgba(42, 56, 47, ', 'rgba(232, 234, 220, ',
      'rgba(58, 72, 61, ', 'rgba(198, 204, 188, '
    ];
    var i, j, c, v, xl, xr, zw, yy;
    for (i = 0; i < rows.length; i++) {
      yy = rows[i];
      zw = zwAt(yy);
      if (zw > 44) { continue; }
      xl = Math.max(-40, vpX - hw(zw));
      xr = Math.min(W + 40, vpX + hw(zw));
      var nextY = (i + 1 < rows.length) ? rows[i + 1] : yy + (i > 0 ? yy - rows[i - 1] : 10);
      var k = (nextY - vpY) / (yy - vpY);

      // 这一行的竖缝位置
      var joints = [xl];
      var nJoint = 3 + ((Math.random() * 3) | 0);
      for (j = 0; j < nJoint; j++) {
        joints.push(xl + (xr - xl) * (0.08 + 0.84 * Math.random()));
      }
      joints.push(xr);
      joints.sort(function (a, b) { return a - b; });

      // 每块石板给一点深浅：湿的更暗，干的更亮
      for (c = 0; c < joints.length - 1; c++) {
        var xa = joints[c], xb = joints[c + 1];
        if (xb - xa < 1.2) { continue; }
        var xa2 = vpX + (xa - vpX) * k;
        var xb2 = vpX + (xb - vpX) * k;
        var pick = tints[(Math.random() * tints.length) | 0];
        g.fillStyle = pick + rand(0.07, 0.18).toFixed(3) + ')';
        g.beginPath();
        g.moveTo(xa, yy);
        g.lineTo(xb, yy);
        g.lineTo(xb2, nextY + 0.5);
        g.lineTo(xa2, nextY + 0.5);
        g.closePath();
        g.fill();
      }

      // 横缝：上沿一道暗（石板压出来的缝）
      g.strokeStyle = 'rgba(44, 56, 47, ' + Math.max(0.10, 0.42 - i * 0.008).toFixed(3) + ')';
      g.lineWidth = Math.max(1, 2.8 - i * 0.13);
      g.beginPath();
      g.moveTo(xl, yy + rand(-1, 1));
      g.lineTo(xr, yy + rand(-1, 1));
      g.stroke();

      // 竖缝
      g.strokeStyle = 'rgba(44, 56, 47, ' + Math.max(0.06, 0.26 - i * 0.006).toFixed(3) + ')';
      g.lineWidth = Math.max(0.7, 2.0 - i * 0.08);
      for (v = 1; v < joints.length - 1; v++) {
        g.beginPath();
        g.moveTo(joints[v], yy);
        g.lineTo(vpX + (joints[v] - vpX) * k, nextY);
        g.stroke();
      }
    }

    // 湿光：只在巷心留一线很淡的反光
    for (i = 0; i < 30; i++) {
      var f = i / 30;
      var yTop = vpY + (H * 0.90 - vpY) * f;
      var zw2 = zwAt(yTop);
      var half = Math.min(0.14, 0.20 / Math.max(1, zw2 * 0.12)) * hw(zw2);
      if (half < 2) { half = 2; }
      var a = 0.065 * (1 - f) * (1 - f) + 0.006;
      g.fillStyle = 'rgba(244, 244, 230, ' + a.toFixed(3) + ')';
      g.fillRect(vpX - half + rand(-2, 2), yTop, half * 2, (H * 0.90 - vpY) / 30 + 2);
    }

    // 竖直的倒影亮条（很少，别把石板照成水面）
    for (i = 0; i < 8; i++) {
      zw = rand(1.8, 6);
      var xx = vpX + rand(-0.8, 0.8) * hw(zw);
      var yTop2 = gyAt(zw) + rand(0, 6);
      var yLen = rand(0.02, 0.06) * H;
      var lg = g.createLinearGradient(xx, yTop2, xx, yTop2 + yLen);
      lg.addColorStop(0, 'rgba(248, 247, 234, ' + rand(0.08, 0.16).toFixed(2) + ')');
      lg.addColorStop(1, 'rgba(248, 247, 234, 0)');
      g.strokeStyle = lg;
      g.lineWidth = Math.max(1, rand(1.2, 2.6) * (1.7 / zw + 0.35));
      g.beginPath();
      g.moveTo(xx, yTop2);
      g.lineTo(xx + rand(-2, 2), yTop2 + yLen);
      g.stroke();
    }

    // 水洼：很浅的暗底，靠边一圈亮
    for (i = 0; i < 5; i++) {
      zw = rand(1.6, 4.2);
      var cxw = vpX + rand(-0.60, 0.60) * hw(zw);
      var cyw = gyAt(zw);
      var rw = rand(0.05, 0.11) * hw(zw);
      g.fillStyle = 'rgba(58, 72, 62, 0.26)';
      g.beginPath();
      g.ellipse(cxw, cyw, rw, rw * 0.24, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(246, 246, 232, 0.28)';
      g.lineWidth = 1.1;
      g.beginPath();
      g.ellipse(cxw, cyw, rw, rw * 0.24, 0, Math.PI * 1.10, Math.PI * 1.90);
      g.stroke();
    }

    // 墙脚的一线青苔（江南的墙根总是湿的）
    for (i = 0; i < 26; i++) {
      zw = rand(1.6, 7.0);
      var sideM = Math.random() < 0.5 ? -1 : 1;
      var mx = vpX + sideM * hw(zw) * rand(0.80, 0.99);
      var my = gyAt(zw) + rand(0.5, 4);
      var mr = rand(2, 9) * (1.4 / zw + 0.35);
      g.fillStyle = 'rgba(64, 82, 64, ' + rand(0.10, 0.26).toFixed(3) + ')';
      g.beginPath();
      g.ellipse(mx, my, mr, mr * 0.42, 0, 0, Math.PI * 2);
      g.fill();
    }

    // 近景石板上的小石子和水痕
    for (i = 0; i < 40; i++) {
      zw = rand(1.5, 4.0);
      var pxp = vpX + rand(-0.9, 0.9) * hw(zw);
      var pyp = gyAt(zw) + rand(1, 10) / zw;
      var pr = rand(0.8, 2.6) * (1.5 / zw + 0.4);
      g.fillStyle = 'rgba(44, 58, 49, ' + rand(0.10, 0.28).toFixed(3) + ')';
      g.beginPath();
      g.ellipse(pxp, pyp, pr, pr * 0.5, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }

  /* 近景石阶：两级，湿而暗，把画面下沿压住 */
  function drawSteps(g) {
    var levels = [0.872, 0.936];
    for (var i = levels.length - 1; i >= 0; i--) {
      var yEdge = levels[i] * H;
      var yNext = (i + 1 < levels.length ? levels[i + 1] : 1.012) * H;
      var bow = H * 0.010;

      function topY(x) { return yEdge - Math.sin((x / W) * Math.PI) * bow; }

      // 踏面
      g.beginPath();
      for (var x = -10; x <= W + 10; x += 12) {
        if (x === -10) { g.moveTo(x, topY(x)); } else { g.lineTo(x, topY(x)); }
      }
      for (var x2 = W + 10; x2 >= -10; x2 -= 12) { g.lineTo(x2, topY(x2) + H * 0.030); }
      g.closePath();
      var tg = g.createLinearGradient(0, yEdge - bow, 0, yEdge + H * 0.030);
      tg.addColorStop(0, '#88958a');
      tg.addColorStop(0.30, '#6e7c72');
      tg.addColorStop(1, '#4f5c55');
      g.fillStyle = tg;
      g.fill();

      // 立面
      g.beginPath();
      for (var x3 = -10; x3 <= W + 10; x3 += 12) {
        if (x3 === -10) { g.moveTo(x3, topY(x3) + H * 0.030); } else { g.lineTo(x3, topY(x3) + H * 0.030); }
      }
      var yBot = Math.min(H + 20, yNext - H * 0.002);
      for (var x4 = W + 10; x4 >= -10; x4 -= 12) { g.lineTo(x4, yBot - Math.sin((x4 / W) * Math.PI) * bow); }
      g.closePath();
      var rg = g.createLinearGradient(0, yEdge, 0, yBot);
      rg.addColorStop(0, '#3f4c45');
      rg.addColorStop(0.5, '#323e39');
      rg.addColorStop(1, '#29332f');
      g.fillStyle = rg;
      g.fill();

      // 阶沿的湿亮线
      g.beginPath();
      for (var x5 = -10; x5 <= W + 10; x5 += 10) {
        var yy = topY(x5) + H * 0.030;
        if (x5 === -10) { g.moveTo(x5, yy); } else { g.lineTo(x5, yy); }
      }
      g.strokeStyle = 'rgba(238, 242, 228, 0.55)';
      g.lineWidth = Math.max(1.6, H * 0.0032);
      g.stroke();

      // 踏面上的积水反光
      for (var k = 0; k < 10; k++) {
        var rx = rand(0.04, 0.96) * W;
        var ry = topY(rx) - rand(1, H * 0.007);
        var rl = rand(20, 90);
        var wg = g.createLinearGradient(rx - rl, ry, rx + rl, ry);
        wg.addColorStop(0, 'rgba(246, 247, 234, 0)');
        wg.addColorStop(0.5, 'rgba(246, 247, 234, 0.42)');
        wg.addColorStop(1, 'rgba(246, 247, 234, 0)');
        g.strokeStyle = wg;
        g.lineWidth = rand(1.2, 3.4);
        g.beginPath();
        g.moveTo(rx - rl, ry);
        g.lineTo(rx + rl, ry);
        g.stroke();
      }
    }
  }

  /* 左侧粉墙上的木门 + 门头灯笼 */
  function doorGeom() {
    var side = -1;
    var z1 = 2.42;
    var z2 = 3.02;
    var g1 = gyAt(z1), g2 = gyAt(z2);
    var t1 = tyAt(z1), t2 = tyAt(z2);
    var hf = 0.54;
    return {
      p1: { x: xAt(side, z1), y: g1 },
      p2: { x: xAt(side, z2), y: g2 },
      p3: { x: xAt(side, z2), y: g2 + (t2 - g2) * hf },
      p4: { x: xAt(side, z1), y: g1 + (t1 - g1) * hf },
      w: xAt(side, z2) - xAt(side, z1)
    };
  }

  /* 右侧粉墙上的漏窗：给对墙一点江南的味道 */
  function drawLatticeWindow(g) {
    var side = 1;
    var z1 = 2.50;
    var z2 = 3.08;
    var hfA = 0.68;
    var hfB = 0.83;
    var g1 = gyAt(z1), g2 = gyAt(z2);
    var t1 = tyAt(z1), t2 = tyAt(z2);
    var p1 = { x: xAt(side, z1), y: g1 + (t1 - g1) * hfA };
    var p2 = { x: xAt(side, z2), y: g2 + (t2 - g2) * hfA };
    var p3 = { x: xAt(side, z2), y: g2 + (t2 - g2) * hfB };
    var p4 = { x: xAt(side, z1), y: g1 + (t1 - g1) * hfB };

    function qp(u, v) {
      var bx = p1.x + (p2.x - p1.x) * u;
      var by = p1.y + (p2.y - p1.y) * u;
      var tx = p4.x + (p3.x - p4.x) * u;
      var ty = p4.y + (p3.y - p4.y) * u;
      return { x: bx + (tx - bx) * v, y: by + (ty - by) * v };
    }

    // 窗洞（暗）
    g.beginPath();
    g.moveTo(p1.x, p1.y);
    g.lineTo(p2.x, p2.y);
    g.lineTo(p3.x, p3.y);
    g.lineTo(p4.x, p4.y);
    g.closePath();
    g.fillStyle = 'rgba(74, 88, 74, 0.55)';
    g.fill();

    // 窗棂：横竖各三道，用双线性插值让格子跟着透视走
    g.save();
    g.beginPath();
    g.moveTo(p1.x, p1.y);
    g.lineTo(p2.x, p2.y);
    g.lineTo(p3.x, p3.y);
    g.lineTo(p4.x, p4.y);
    g.closePath();
    g.clip();
    g.strokeStyle = 'rgba(228, 230, 216, 0.40)';
    g.lineWidth = Math.max(1, H * 0.0028);
    var i, a, b;
    for (i = 1; i <= 3; i++) {
      a = qp(i / 4, 0);
      b = qp(i / 4, 1);
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.stroke();
      a = qp(0, i / 4);
      b = qp(1, i / 4);
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.stroke();
    }
    g.restore();

    // 窗框
    g.strokeStyle = 'rgba(56, 68, 56, 0.70)';
    g.lineWidth = Math.max(1.6, H * 0.0045);
    g.beginPath();
    g.moveTo(p1.x, p1.y);
    g.lineTo(p2.x, p2.y);
    g.lineTo(p3.x, p3.y);
    g.lineTo(p4.x, p4.y);
    g.closePath();
    g.stroke();

    // 窗台
    g.beginPath();
    g.moveTo(p1.x, p1.y);
    g.lineTo(p2.x, p2.y);
    g.lineTo(p2.x, p2.y + H * 0.008);
    g.lineTo(p1.x, p1.y + H * 0.008);
    g.closePath();
    g.fillStyle = 'rgba(168, 172, 156, 0.85)';
    g.fill();
  }

  function drawDoor(g) {
    var d = doorGeom();
    var p1 = d.p1, p2 = d.p2, p3 = d.p3, p4 = d.p4;
    var fw = d.w * 0.12;

    // 石门套：比白墙深，带一条亮边
    g.fillStyle = 'rgb(192, 192, 175)';
    g.beginPath();
    g.moveTo(p4.x - fw, p4.y - H * 0.030);
    g.lineTo(p3.x + fw * 0.6, p3.y - H * 0.028);
    g.lineTo(p3.x + fw * 0.6, p3.y);
    g.lineTo(p3.x, p3.y);
    g.lineTo(p2.x, p2.y);
    g.lineTo(p1.x, p1.y);
    g.lineTo(p4.x, p4.y);
    g.lineTo(p4.x - fw, p4.y);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(206, 204, 186, 0.55)';
    g.lineWidth = Math.max(1, H * 0.002);
    g.beginPath();
    g.moveTo(p4.x - fw, p4.y - H * 0.030);
    g.lineTo(p3.x + fw * 0.6, p3.y - H * 0.028);
    g.stroke();

    // 门扇（凹进去，所以上沿带投影）
    g.beginPath();
    g.moveTo(p4.x, p4.y - H * 0.004);
    g.lineTo(p3.x, p3.y - H * 0.004);
    g.lineTo(p2.x, p2.y);
    g.lineTo(p1.x, p1.y);
    g.closePath();
    var dg = g.createLinearGradient(p4.x, p4.y, p1.x, p1.y);
    dg.addColorStop(0, '#7b8171');
    dg.addColorStop(0.42, '#6a7163');
    dg.addColorStop(1, '#818776');
    g.fillStyle = dg;
    g.fill();
    // 门内的阴影（上沿最深）
    g.save();
    g.beginPath();
    g.moveTo(p4.x, p4.y - H * 0.004);
    g.lineTo(p3.x, p3.y - H * 0.004);
    g.lineTo(p2.x, p2.y);
    g.lineTo(p1.x, p1.y);
    g.closePath();
    g.clip();
    var ds = g.createLinearGradient(0, p4.y, 0, p1.y);
    ds.addColorStop(0, 'rgba(30, 38, 32, 0.42)');
    ds.addColorStop(0.30, 'rgba(30, 38, 32, 0.14)');
    ds.addColorStop(1, 'rgba(30, 38, 32, 0)');
    g.fillStyle = ds;
    g.fillRect(p1.x - fw, p4.y - H * 0.01, d.w * 2, (p1.y - p4.y) + H * 0.02);
    g.restore();

    // 门板竖缝
    for (var i = 1; i < 4; i++) {
      var t2 = i / 4;
      var ax = p1.x + (p2.x - p1.x) * t2;
      var ay = p1.y + (p2.y - p1.y) * t2;
      var bx = p4.x + (p3.x - p4.x) * t2;
      var by = p4.y + (p3.y - p4.y) * t2;
      g.strokeStyle = 'rgba(44, 52, 46, 0.42)';
      g.lineWidth = Math.max(1, d.w * 0.016);
      g.beginPath();
      g.moveTo(ax, ay);
      g.lineTo(bx, by);
      g.stroke();
    }
    // 中缝（双扇门）
    g.strokeStyle = 'rgba(40, 48, 42, 0.5)';
    g.lineWidth = Math.max(1.2, d.w * 0.022);
    g.beginPath();
    g.moveTo((p1.x + p2.x) * 0.5, (p1.y + p2.y) * 0.5);
    g.lineTo((p4.x + p3.x) * 0.5, (p4.y + p3.y) * 0.5);
    g.stroke();

    // 门环
    g.strokeStyle = 'rgba(46, 54, 48, 0.6)';
    g.lineWidth = Math.max(1.4, d.w * 0.024);
    var hx = p1.x + (p2.x - p1.x) * 0.30;
    var hy = p1.y + (p4.y - p1.y) * 0.34;
    g.beginPath();
    g.arc(hx, hy, d.w * 0.085, 0, Math.PI * 2);
    g.stroke();

    // 门槛石
    g.fillStyle = 'rgba(122, 132, 119, 0.6)';
    g.beginPath();
    g.ellipse((p1.x + p2.x) * 0.5, (p1.y + p2.y) * 0.5 + H * 0.006, d.w * 0.72, H * 0.012, 0, 0, Math.PI * 2);
    g.fill();

    // 灯笼在湿地上的一点暖反光
    var lgr = doorLampGeom();
    var baseY = (p1.y + p2.y) * 0.5;
    g.save();
    g.beginPath();
    g.ellipse(lgr.x, baseY + H * 0.03, d.w * 0.42, H * 0.035, 0, 0, Math.PI * 2);
    g.clip();
    var wr = g.createLinearGradient(lgr.x, baseY, lgr.x, baseY + H * 0.10);
    wr.addColorStop(0, 'rgba(214, 146, 80, 0.26)');
    wr.addColorStop(0.5, 'rgba(206, 138, 74, 0.08)');
    wr.addColorStop(1, 'rgba(206, 138, 74, 0)');
    g.fillStyle = wr;
    g.fillRect(lgr.x - d.w * 0.5, baseY, d.w, H * 0.10);
    g.restore();

    // 门头挑出的小檐（砖细）
    g.fillStyle = 'rgb(74, 84, 74)';
    g.beginPath();
    g.moveTo(p4.x - fw * 1.5, p4.y - H * 0.030);
    g.lineTo(p3.x + fw * 0.9, p3.y - H * 0.028);
    g.lineTo(p3.x + fw * 0.9, p3.y - H * 0.021);
    g.lineTo(p4.x - fw * 1.5, p4.y - H * 0.023);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(216, 222, 208, 0.35)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(p4.x - fw * 1.5, p4.y - H * 0.023);
    g.lineTo(p3.x + fw * 0.9, p3.y - H * 0.021);
    g.stroke();

    // 灯笼（暖色的唯一来源，很小）
    var lg = doorLampGeom();
    g.strokeStyle = 'rgba(44, 52, 46, 0.6)';
    g.lineWidth = 1.1;
    g.beginPath();
    g.moveTo(lg.x, lg.y - lg.h * 0.62);
    g.lineTo(lg.x, p4.y - H * 0.026);
    g.stroke();
    // 灯身
    g.fillStyle = 'rgb(186, 112, 60)';
    g.beginPath();
    g.ellipse(lg.x, lg.y, lg.w * 0.60, lg.h * 0.48, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(228, 178, 110, 0.95)';
    g.beginPath();
    g.ellipse(lg.x - lg.w * 0.08, lg.y - lg.h * 0.05, lg.w * 0.34, lg.h * 0.34, 0, 0, Math.PI * 2);
    g.fill();
    // 上下箍
    g.fillStyle = 'rgb(62, 56, 46)';
    g.fillRect(lg.x - lg.w * 0.28, lg.y - lg.h * 0.50, lg.w * 0.56, Math.max(1.2, H * 0.0026));
    g.fillRect(lg.x - lg.w * 0.28, lg.y + lg.h * 0.48, lg.w * 0.56, Math.max(1.2, H * 0.0026));
    // 流苏
    g.strokeStyle = 'rgba(176, 96, 56, 0.8)';
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(lg.x, lg.y + lg.h * 0.51);
    g.lineTo(lg.x, lg.y + lg.h * 0.82);
    g.stroke();

    // 墙上的暖反光
    var warm = g.createRadialGradient(lg.x, lg.y, 0, lg.x, lg.y, H * 0.10);
    warm.addColorStop(0, 'rgba(228, 162, 92, 0.20)');
    warm.addColorStop(0.42, 'rgba(214, 148, 84, 0.07)');
    warm.addColorStop(1, 'rgba(214, 148, 84, 0)');
    g.fillStyle = warm;
    g.fillRect(lg.x - H * 0.12, lg.y - H * 0.12, H * 0.24, H * 0.24);
  }

  function doorLampGeom() {
    var d = doorGeom();
    var x = (d.p4.x + d.p3.x) * 0.5;
    var y = (d.p4.y + d.p3.y) * 0.5 - H * 0.036;
    var w = Math.max(6, H * 0.021);
    return { x: x, y: y, w: w, h: w * 1.5 };
  }

  /* 巷口：纵深处的亮与雾 */
  function drawFarHaze(g) {
    // 巷口的横墙：巷子在这里拐出去
    g.fillStyle = 'rgba(236, 235, 220, 0.80)';
    g.beginPath();
    g.moveTo(vpX - W * 0.062, vpY - H * 0.008);
    g.lineTo(vpX + W * 0.070, vpY - H * 0.014);
    g.lineTo(vpX + W * 0.074, vpY + H * 0.070);
    g.lineTo(vpX - W * 0.058, vpY + H * 0.074);
    g.closePath();
    g.fill();
    // 横墙的瓦线
    g.strokeStyle = 'rgba(92, 104, 90, 0.55)';
    g.lineWidth = Math.max(1.4, H * 0.0035);
    g.beginPath();
    g.moveTo(vpX - W * 0.066, vpY - H * 0.008);
    g.lineTo(vpX + W * 0.074, vpY - H * 0.014);
    g.stroke();
    // 巷口的一个暗门洞
    g.fillStyle = 'rgba(86, 98, 84, 0.40)';
    g.beginPath();
    g.moveTo(vpX - W * 0.020, vpY + H * 0.010);
    g.lineTo(vpX + W * 0.006, vpY + H * 0.008);
    g.lineTo(vpX + W * 0.008, vpY + H * 0.052);
    g.lineTo(vpX - W * 0.018, vpY + H * 0.054);
    g.closePath();
    g.fill();

    // 雾：只在巷口附近化开，别把整幅画面冲淡
    var hz = g.createRadialGradient(vpX, vpY, 0, vpX, vpY, Math.min(W, H) * 0.44);
    hz.addColorStop(0, 'rgba(243, 243, 232, 0.74)');
    hz.addColorStop(0.30, 'rgba(242, 242, 231, 0.32)');
    hz.addColorStop(0.62, 'rgba(240, 240, 229, 0.09)');
    hz.addColorStop(1, 'rgba(240, 240, 229, 0)');
    g.fillStyle = hz;
    g.fillRect(0, 0, W, H);

    // 贴地的一层薄雾
    var gh = g.createLinearGradient(0, vpY + H * 0.005, 0, vpY + H * 0.15);
    gh.addColorStop(0, 'rgba(242, 242, 231, 0.50)');
    gh.addColorStop(0.55, 'rgba(242, 242, 231, 0.13)');
    gh.addColorStop(1, 'rgba(242, 242, 231, 0)');
    g.fillStyle = gh;
    g.fillRect(0, vpY, W, H * 0.17);
  }

  function drawVignette(g) {
    var v = g.createRadialGradient(W * 0.5, H * 0.44, Math.min(W, H) * 0.30,
      W * 0.5, H * 0.44, Math.max(W, H) * 0.82);
    v.addColorStop(0, 'rgba(52, 62, 54, 0)');
    v.addColorStop(0.62, 'rgba(52, 62, 54, 0.08)');
    v.addColorStop(1, 'rgba(42, 52, 45, 0.38)');
    g.fillStyle = v;
    g.fillRect(0, 0, W, H);

    // 下沿压暗（近景最深）
    var b = g.createLinearGradient(0, H * 0.84, 0, H);
    b.addColorStop(0, 'rgba(40, 50, 44, 0)');
    b.addColorStop(1, 'rgba(38, 48, 42, 0.34)');
    g.fillStyle = b;
    g.fillRect(0, H * 0.84, W, H * 0.16);

    // 诗句：竖排，淡墨，留在留白里
    var poem = '深巷明朝卖杏花';
    var fs = Math.max(11, H * 0.029);
    g.save();
    g.font = fs + 'px "KaiTi","STKaiti","SimSun",serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = 'rgba(72, 82, 73, 0.26)';
    var px = W * 0.398;
    var py = H * 0.052;
    for (var i = 0; i < poem.length; i++) {
      g.fillText(poem.charAt(i), px, py + i * fs * 1.5);
    }
    g.restore();
  }

  function buildBackground() {
    var layer = makeLayer();
    var g = layer.g;

    // 天空：冷灰绿，靠巷口更亮
    var sky = g.createLinearGradient(0, 0, 0, vpY + H * 0.10);
    sky.addColorStop(0, '#c2cabc');
    sky.addColorStop(0.5, '#d3d8c9');
    sky.addColorStop(1, '#e6e4d3');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);

    var lift = g.createRadialGradient(vpX, vpY - H * 0.18, 0, vpX, vpY - H * 0.18, Math.max(W, H) * 0.50);
    lift.addColorStop(0, 'rgba(248, 247, 234, 0.55)');
    lift.addColorStop(0.45, 'rgba(244, 243, 229, 0.16)');
    lift.addColorStop(1, 'rgba(244, 243, 229, 0)');
    g.fillStyle = lift;
    g.fillRect(0, 0, W, H);

    drawGables(g);
    drawWalls(g);
    drawLatticeWindow(g);
    drawPavement(g);
    drawDoor(g);
    drawSteps(g);
    drawFarHaze(g);
    drawVignette(g);

    bg = layer.c;
  }

  /* ---------------- 雾 / 光 贴图 ---------------- */

  function makeFogSprite() {
    var c = document.createElement('canvas');
    c.width = 256;
    c.height = 160;
    var g = c.getContext('2d');
    for (var i = 0; i < 12; i++) {
      var x = rand(0.10, 0.90) * 256;
      var y = rand(0.26, 0.76) * 160;
      var r = rand(0.16, 0.34) * 256;
      var rg = g.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, 'rgba(243, 244, 233, 0.14)');
      rg.addColorStop(0.55, 'rgba(243, 244, 233, 0.055)');
      rg.addColorStop(1, 'rgba(243, 244, 233, 0)');
      g.fillStyle = rg;
      g.fillRect(0, 0, 256, 160);
    }
    fogSprite = c;
  }

  function makeGlowSprite() {
    var c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    var g = c.getContext('2d');
    var rg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    rg.addColorStop(0, 'rgba(255, 198, 124, 0.52)');
    rg.addColorStop(0.30, 'rgba(250, 174, 98, 0.20)');
    rg.addColorStop(0.65, 'rgba(240, 152, 80, 0.05)');
    rg.addColorStop(1, 'rgba(240, 152, 80, 0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, 128, 128);
    glowSprite = c;
  }

  /* ---------------- 粒子 ---------------- */

  function makeRain() {
    rainBands.length = 0;
    var defs = [
      { n: Math.round(W / 11), len: H * 0.020, sp: H * 0.55, a: 0.12, w: 0.9 },
      { n: Math.round(W / 8), len: H * 0.034, sp: H * 0.90, a: 0.17, w: 1.2 },
      { n: Math.round(W / 9), len: H * 0.055, sp: H * 1.35, a: 0.24, w: 1.7 }
    ];
    for (var b = 0; b < defs.length; b++) {
      var d = defs[b];
      var drops = [];
      for (var i = 0; i < d.n; i++) {
        drops.push({ x: rand(-0.15, 1.15) * W, y: rand(-1, 1) * H });
      }
      rainBands.push({ len: d.len, sp: d.sp, alpha: d.a, width: d.w, drops: drops });
    }
  }

  function makeEaveDrips() {
    eaveDrips.length = 0;
    var sides = [-1, 1];
    for (var s = 0; s < 2; s++) {
      var zs = [1.30, 1.58, 1.98, 2.5, 3.3];
      for (var i = 0; i < zs.length; i++) {
        var zw = zs[i];
        var side = sides[s];
        eaveDrips.push({
          x: xAt(side, zw) + (side < 0 ? 0.16 : -0.16) * hw(zw),
          y0: tyAt(zw) + capT(zw),
          y1: gyAt(zw),
          y: 0,
          v: 0,
          wait: rand(0, 1.6),
          scale: 1.2 / zw + 0.35
        });
      }
    }
    for (var k = 0; k < eaveDrips.length; k++) {
      var dp = eaveDrips[k];
      dp.y = dp.y0 + rand(0, dp.y1 - dp.y0);
      dp.v = rand(0.7, 1.3);
    }
  }

  function makeRimDrips() {
    rimDrips.length = 0;
    for (var i = 0; i < 5; i++) {
      rimDrips.push({ y: 0, v: 0, wait: rand(0, 2), off: rand(-0.85, 0.85) });
    }
  }

  function makeFog() {
    fogLayers = [
      { x: 0.50, y: 0.46, s: 1.30, a: 0.38, sp: 0.021, ph: 0.4 },
      { x: 0.38, y: 0.60, s: 1.00, a: 0.28, sp: 0.030, ph: 2.1 },
      { x: 0.64, y: 0.55, s: 0.95, a: 0.24, sp: 0.026, ph: 4.2 },
      { x: 0.50, y: 0.88, s: 1.55, a: 0.15, sp: 0.017, ph: 1.3 }
    ];
    fogPuffs = [];
    for (var i = 0; i < 3; i++) {
      fogPuffs.push({ p: Math.random(), seed: rand(0, 6.28), dur: rand(15, 24) });
    }
  }

  /* ---------------- 逻辑 ---------------- */

  function spawnRipple(x, y, scale, force) {
    if (!force && ripples.length > 64) { return; }
    ripples.push({
      x: x, y: y, r: rand(0.6, 1.6) * scale, max: rand(8, 22) * scale,
      a: rand(0.40, 0.66), flat: 0.22 + 0.14 * Math.min(1, (y - vpY) / (H - vpY))
    });
  }

  function advance(dt) {
    t += dt;
    var i, j;

    // 细雨
    for (i = 0; i < rainBands.length; i++) {
      var band = rainBands[i];
      var dr = band.drops;
      for (j = 0; j < dr.length; j++) {
        var d = dr[j];
        d.y += band.sp * dt;
        d.x += band.sp * 0.20 * dt;
        if (d.y > H + band.len) {
          d.y = -band.len - rand(0, H * 0.12);
          d.x = rand(-0.15, 1.15) * W;
        }
        if (d.x > W + 60) { d.x -= W + 120; }
      }
    }

    // 地面涟漪
    for (i = ripples.length - 1; i >= 0; i--) {
      var rp = ripples[i];
      rp.r += (rp.max - rp.r) * Math.min(1, dt * 2.2) + 16 * dt;
      rp.a -= dt * 0.52;
      if (rp.a <= 0.01) { ripples.splice(i, 1); }
    }
    if (ripples.length < 46 && Math.random() < dt * 34) {
      var z = rand(1.5, 6.5);
      var zz = Math.pow(z / 1.5, 1.6) * 1.5;
      var rrY = gyAt(Math.min(zz, 8));
      if (rrY < H * 0.82) {
        spawnRipple(vpX + rand(-0.94, 0.94) * hw(Math.min(zz, 8)), rrY, 1.6 / Math.min(zz, 8) + 0.30, false);
      }
    }

    // 檐口滴水
    for (i = 0; i < eaveDrips.length; i++) {
      var ep = eaveDrips[i];
      if (ep.wait > 0) { ep.wait -= dt; continue; }
      ep.v += 0.52 * dt * 10;
      ep.y += ep.v * H * 0.10 * dt;
      if (ep.y >= ep.y1) {
        spawnRipple(ep.x, ep.y1, ep.scale * 1.1, true);
        ep.y = ep.y0;
        ep.v = 0;
        ep.wait = rand(0.5, 2.6);
      }
    }

    // 伞沿滴水
    var rim = rimGeom();
    for (i = 0; i < rimDrips.length; i++) {
      var rd = rimDrips[i];
      if (rd.wait > 0) { rd.wait -= dt; continue; }
      rd.v += 0.44 * dt * 10;
      rd.y += rd.v * H * 0.11 * dt;
      if (rd.y >= rim.fy - rim.uy) {
        spawnRipple(rim.fx + rd.off * rim.R, rim.fy, 1.0, true);
        rd.y = 0;
        rd.v = 0;
        rd.wait = rand(0.4, 2.2);
        rd.off = rand(-0.9, 0.9);
      }
    }

    // 雾
    for (i = 0; i < fogLayers.length; i++) {
      var fl = fogLayers[i];
      fl.x = 0.5 + Math.sin(t * fl.sp * 3 + fl.ph) * 0.10;
    }
    for (i = 0; i < fogPuffs.length; i++) {
      var fp = fogPuffs[i];
      fp.p += dt / fp.dur;
      if (fp.p > 1) { fp.p = 0; fp.seed = rand(0, 6.28); fp.dur = rand(15, 24); }
    }
  }

  /* 伞的几何（advance 与 draw 共用） */
  function rimGeom() {
    var bodyH = H * LADY_H;
    var hh = bodyH / 7;
    var fx = W * LADY_X;
    var fy = H * LADY_FOOT;
    var R = bodyH * 0.36;
    var rimY = -bodyH - hh * 0.62;
    var ucy = rimY - R * 0.12;
    return { bodyH: bodyH, hh: hh, fx: fx, fy: fy, R: R, ucy: ucy, uy: rimY };
  }

  /* ---------------- 绘制 ---------------- */

  function drawFog() {
    var i;
    for (i = 0; i < fogLayers.length; i++) {
      var fl = fogLayers[i];
      var w = Math.min(W, H) * fl.s * 1.5;
      var h = w * 0.62;
      var x = fl.x * W - w * 0.5;
      var y = fl.y * H - h * 0.5;
      ctx.globalAlpha = fl.a * (0.82 + 0.18 * Math.sin(t * 0.5 + fl.ph));
      ctx.drawImage(fogSprite, x, y, w, h);
    }
    for (i = 0; i < fogPuffs.length; i++) {
      var p = fogPuffs[i];
      var k = p.p;
      var scale = 0.35 + k * 1.5;
      var cx = vpX + Math.sin(p.seed + k * 2.4) * W * 0.10 * k;
      var cy = vpY + (H * 0.48 - vpY) * k;
      var w2 = Math.min(W, H) * scale * 0.75;
      var h2 = w2 * 0.55;
      var fade = Math.sin(Math.PI * Math.min(1, k * 1.15));
      ctx.globalAlpha = 0.34 * fade;
      ctx.drawImage(fogSprite, cx - w2 * 0.5, cy - h2 * 0.5, w2, h2);
    }
    ctx.globalAlpha = 1;
  }

  function drawRain() {
    ctx.lineCap = 'round';
    for (var b = 0; b < rainBands.length; b++) {
      var band = rainBands[b];
      ctx.beginPath();
      for (var i = 0; i < band.drops.length; i++) {
        var d = band.drops[i];
        ctx.moveTo(d.x - band.len * 0.20, d.y - band.len);
        ctx.lineTo(d.x, d.y);
      }
      ctx.strokeStyle = 'rgba(240, 244, 234, ' + band.alpha + ')';
      ctx.lineWidth = band.width;
      ctx.stroke();
    }
  }

  function drawRiples(front) {
    for (var i = 0; i < ripples.length; i++) {
      var r = ripples[i];
      var isFront = r.y >= H * 0.735;
      if (front !== isFront) { continue; }
      ctx.beginPath();
      ctx.ellipse(r.x, r.y, r.r, r.r * r.flat, 0, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(248, 248, 236, ' + Math.max(0, r.a).toFixed(3) + ')';
      ctx.lineWidth = Math.max(0.8, r.r * 0.075);
      ctx.stroke();
      if (r.r < 4) {
        ctx.beginPath();
        ctx.arc(r.x, r.y, Math.max(0.8, r.r * 0.32), 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(252, 252, 242, ' + Math.max(0, r.a * 1.1).toFixed(3) + ')';
        ctx.fill();
      }
    }
  }

  function drawEaveDrips() {
    for (var i = 0; i < eaveDrips.length; i++) {
      var p = eaveDrips[i];
      if (p.wait > 0) { continue; }
      var lw = Math.max(0.9, 2.4 * p.scale);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + 1.2 * p.scale, p.y + Math.min(H * 0.03, p.v * 3 + 3));
      ctx.strokeStyle = 'rgba(240, 245, 234, 0.6)';
      ctx.lineWidth = lw;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(p.x, p.y, lw * 0.85, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(250, 252, 244, 0.8)';
      ctx.fill();
    }
  }

  /* 撑油纸伞的背影：只有剪影，不画五官 */
  function drawLady() {
    var geo = rimGeom();
    var bodyH = geo.bodyH;
    var hh = geo.hh;
    var R = geo.R;

    var bob = Math.sin(t * 0.66) * bodyH * 0.005;
    var sway = Math.sin(t * 0.23 + 0.7) * 0.009;
    var rot = -0.05 + Math.sin(t * 0.5) * 0.014;

    // 湿地上的一团影 + 倒影
    ctx.save();
    ctx.translate(geo.fx, geo.fy);
    ctx.rotate(sway * 0.3);
    var sg = ctx.createLinearGradient(0, 0, 0, -hh * 2.6);
    sg.addColorStop(0, 'rgba(48, 60, 52, 0.30)');
    sg.addColorStop(1, 'rgba(48, 60, 52, 0)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.ellipse(0, -hh * 0.2, hh * 1.15, hh * 1.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(48, 60, 52, 0.22)';
    ctx.beginPath();
    ctx.ellipse(0, 0, hh * 1.9, hh * 0.30, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(geo.fx, geo.fy + bob);
    ctx.rotate(sway);
    drawUmbrella(R, geo.ucy, rot);
    drawFigure(hh, bodyH);
    ctx.restore();
  }

  function drawUmbrella(R, ucy, rot) {
    var r = R;
    ctx.save();
    ctx.translate(0, ucy);
    ctx.rotate(rot);

    var N = 8;
    var rimY = r * 0.12;
    var sag = r * 0.10;

    ctx.beginPath();
    ctx.moveTo(-r, rimY);
    ctx.quadraticCurveTo(-r * 0.82, -r * 0.56, 0, -r * 0.62);
    ctx.quadraticCurveTo(r * 0.82, -r * 0.56, r, rimY);
    for (var i = N - 1; i >= 0; i--) {
      var ax = -r + 2 * r * (i / N);
      var bx = -r + 2 * r * ((i + 1) / N);
      var ay = rimY + sag * Math.sin(Math.PI * (i / N));
      var by = rimY + sag * Math.sin(Math.PI * ((i + 1) / N));
      ctx.quadraticCurveTo((ax + bx) * 0.5, (ay + by) * 0.5 + sag * 0.55, ax, ay);
    }
    ctx.closePath();
    var ug = ctx.createLinearGradient(0, -r * 0.62, 0, rimY + sag);
    ug.addColorStop(0, '#f1ead3');
    ug.addColorStop(0.55, '#e6e1c8');
    ug.addColorStop(1, '#c8d9cd');
    ctx.fillStyle = ug;
    ctx.fill();

    // 竹骨
    ctx.strokeStyle = 'rgba(96, 110, 100, 0.30)';
    ctx.lineWidth = Math.max(0.7, r * 0.012);
    for (var j = 0; j <= N; j++) {
      var px = -r + 2 * r * (j / N);
      var py = rimY + sag * Math.sin(Math.PI * (j / N));
      ctx.beginPath();
      ctx.moveTo(px * 0.06, -r * 0.50);
      ctx.quadraticCurveTo(px * 0.62, -r * 0.30, px, py);
      ctx.stroke();
    }
    // 伞沿湿边
    ctx.strokeStyle = 'rgba(66, 80, 72, 0.45)';
    ctx.lineWidth = Math.max(1, r * 0.024);
    ctx.beginPath();
    ctx.moveTo(-r, rimY);
    for (var q = 0; q < N; q++) {
      var ax2 = -r + 2 * r * (q / N);
      var bx2 = -r + 2 * r * ((q + 1) / N);
      var ay2 = rimY + sag * Math.sin(Math.PI * (q / N));
      var by2 = rimY + sag * Math.sin(Math.PI * ((q + 1) / N));
      ctx.quadraticCurveTo((ax2 + bx2) * 0.5, (ay2 + by2) * 0.5 + sag * 0.55, ax2, ay2);
    }
    ctx.stroke();

    // 小伞头
    ctx.strokeStyle = 'rgba(70, 82, 74, 0.8)';
    ctx.lineWidth = Math.max(1, r * 0.020);
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.62);
    ctx.lineTo(0, -r * 0.80);
    ctx.stroke();
    ctx.fillStyle = 'rgba(92, 104, 94, 0.9)';
    ctx.beginPath();
    ctx.arc(0, -r * 0.82, Math.max(1.4, r * 0.034), 0, Math.PI * 2);
    ctx.fill();

    // 左上轮廓的一点天光
    ctx.strokeStyle = 'rgba(252, 250, 238, 0.6)';
    ctx.lineWidth = Math.max(1.2, r * 0.026);
    ctx.beginPath();
    ctx.moveTo(-r * 0.97, rimY - r * 0.02);
    ctx.quadraticCurveTo(-r * 0.80, -r * 0.50, -r * 0.08, -r * 0.61);
    ctx.stroke();

    ctx.restore();
  }

  function drawFigure(hh, bodyH) {
    var u = hh;
    var headC = -6.54 * u;
    var hr = 0.40 * u;
    var waist = -4.18 * u;
    var hem = -0.03 * u;
    var swL = Math.sin(t * 0.85) * u * 0.10;
    var swR = Math.sin(t * 0.72 + 1.9) * u * 0.09;

    ctx.fillStyle = INK;

    // 裙 + 上衣，一整块剪影：削肩、细腰、A 字裙摆
    ctx.beginPath();
    ctx.moveTo(-1.14 * u, hem);
    ctx.bezierCurveTo(-1.02 * u, -1.20 * u, -0.62 * u, -2.92 * u, -0.40 * u, -3.64 * u);
    ctx.bezierCurveTo(-0.33 * u, -3.96 * u, -0.28 * u, -4.08 * u, -0.27 * u, waist);
    ctx.bezierCurveTo(-0.36 * u, -4.52 * u, -0.46 * u, -5.16 * u, -0.48 * u, -5.58 * u);
    ctx.quadraticCurveTo(-0.31 * u, -5.80 * u, -0.13 * u, -5.94 * u);
    ctx.lineTo(0.13 * u, -5.94 * u);
    ctx.quadraticCurveTo(0.31 * u, -5.80 * u, 0.48 * u, -5.58 * u);
    ctx.bezierCurveTo(0.46 * u, -5.16 * u, 0.36 * u, -4.52 * u, 0.27 * u, waist);
    ctx.bezierCurveTo(0.28 * u, -4.08 * u, 0.33 * u, -3.96 * u, 0.40 * u, -3.64 * u);
    ctx.bezierCurveTo(0.62 * u, -2.92 * u, 1.02 * u, -1.20 * u, 1.14 * u, hem);
    ctx.quadraticCurveTo(0.58 * u, hem - 0.13 * u, 0, hem + 0.01 * u);
    ctx.quadraticCurveTo(-0.58 * u, hem - 0.13 * u, -1.14 * u, hem);
    ctx.closePath();
    ctx.fill();

    // 广袖：自肩下垂落，袖口垂到膝上
    ctx.beginPath();
    ctx.moveTo(-0.45 * u, -5.58 * u);
    ctx.quadraticCurveTo(-0.64 * u + swL * 0.35, -4.60 * u, -0.72 * u + swL, -2.78 * u);
    ctx.quadraticCurveTo(-0.75 * u + swL, -2.52 * u, -0.55 * u + swL, -2.58 * u);
    ctx.quadraticCurveTo(-0.44 * u, -3.60 * u, -0.27 * u, -4.28 * u);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(0.45 * u, -5.58 * u);
    ctx.quadraticCurveTo(0.62 * u + swR * 0.35, -4.62 * u, 0.70 * u + swR, -2.82 * u);
    ctx.quadraticCurveTo(0.73 * u + swR, -2.56 * u, 0.53 * u + swR, -2.62 * u);
    ctx.quadraticCurveTo(0.42 * u, -3.64 * u, 0.27 * u, -4.30 * u);
    ctx.closePath();
    ctx.fill();

    // 脖子（细，肩线从颈根斜下去，背影才挺拔）
    ctx.beginPath();
    ctx.moveTo(-0.13 * u, -5.92 * u);
    ctx.lineTo(-0.12 * u, headC + hr * 0.88);
    ctx.lineTo(0.12 * u, headC + hr * 0.88);
    ctx.lineTo(0.13 * u, -5.92 * u);
    ctx.closePath();
    ctx.fill();

    // 头（背影）
    ctx.beginPath();
    ctx.ellipse(0, headC, hr * 0.87, hr, 0, 0, Math.PI * 2);
    ctx.fill();

    // 发髻：脑后盘发，头顶再挽一颗小圆髻
    ctx.beginPath();
    ctx.ellipse(0.02 * u, headC - hr * 0.92, hr * 0.80, hr * 0.46, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0.03 * u, headC - hr * 1.34, hr * 0.46, 0, Math.PI * 2);
    ctx.fill();
    // 簪：一根细线横插在圆髻上
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(1, u * 0.042);
    ctx.beginPath();
    ctx.moveTo(-0.28 * u, headC - hr * 1.28);
    ctx.lineTo(0.34 * u, headC - hr * 1.18);
    ctx.stroke();
    // 散落的发丝
    ctx.lineWidth = Math.max(0.7, u * 0.035);
    ctx.beginPath();
    ctx.moveTo(-0.30 * u, headC - hr * 0.72);
    ctx.quadraticCurveTo(-0.40 * u, headC - hr * 0.10, -0.30 * u, headC + hr * 0.80);
    ctx.stroke();

    // 衣带：自腰侧垂下，贴着裙边打了个弯，末端微微飘起
    ctx.beginPath();
    ctx.moveTo(-0.30 * u, -4.34 * u);
    ctx.bezierCurveTo(-0.64 * u, -3.34 * u, -0.78 * u - swL * 0.5, -2.20 * u, -0.96 * u - swL, -1.20 * u);
    ctx.quadraticCurveTo(-1.06 * u - swL * 1.3, -0.68 * u, -1.20 * u - swL * 1.6, -0.80 * u);
    ctx.bezierCurveTo(-1.10 * u - swL * 1.2, -1.32 * u, -0.98 * u - swL * 0.9, -1.94 * u, -0.88 * u - swL * 0.6, -2.40 * u);
    ctx.bezierCurveTo(-0.76 * u, -3.36 * u, -0.50 * u, -4.10 * u, -0.30 * u, -4.34 * u);
    ctx.closePath();
    ctx.fill();

    // 右侧一条细衣带，垂到膝下，随风轻摆
    ctx.strokeStyle = INK;
    ctx.lineCap = 'round';
    ctx.lineWidth = u * 0.075;
    ctx.beginPath();
    ctx.moveTo(0.24 * u, waist + 0.12 * u);
    ctx.bezierCurveTo(0.54 * u + swR * 0.7, -3.42 * u, 0.74 * u + swR, -2.62 * u,
      0.62 * u + swR * 1.3, -2.14 * u);
    ctx.stroke();

    // 剪影内部的淡色衣纹（只给层次，不破坏剪影）
    ctx.strokeStyle = 'rgba(220, 228, 214, 0.12)';
    ctx.lineWidth = Math.max(0.8, u * 0.036);
    var folds = [-1, -0.52, 0.52, 1];
    for (var i = 0; i < folds.length; i++) {
      ctx.beginPath();
      ctx.moveTo(folds[i] * 0.14 * u, waist - 0.12 * u);
      ctx.quadraticCurveTo(folds[i] * 0.30 * u + 0.05 * u, -2.30 * u, folds[i] * 0.50 * u + 0.03 * u, hem + 0.08 * u);
      ctx.stroke();
    }
    // 袖口的一道折线
    ctx.strokeStyle = 'rgba(216, 224, 210, 0.12)';
    ctx.beginPath();
    ctx.moveTo(-0.78 * u + swL, -3.40 * u);
    ctx.quadraticCurveTo(-0.66 * u + swL, -3.32 * u, -0.56 * u + swL, -3.34 * u);
    ctx.stroke();

    // 轮廓光（伞下透下来的一点天光）
    ctx.strokeStyle = 'rgba(246, 248, 236, 0.30)';
    ctx.lineWidth = Math.max(0.8, u * 0.045);
    ctx.beginPath();
    ctx.moveTo(0.10 * u, headC - hr * 1.18);
    ctx.quadraticCurveTo(0.30 * u, headC - hr * 0.92, 0.30 * u, headC - hr * 0.30);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0.34 * u, -5.72 * u);
    ctx.quadraticCurveTo(0.50 * u, -5.40 * u, 0.46 * u, -4.90 * u);
    ctx.stroke();
  }

  function drawLampGlow() {
    var lg = doorLampGeom();
    var puls = 0.86 + 0.14 * Math.sin(t * 1.1 + 0.4);
    var gr = H * 0.115;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.38 * puls;
    ctx.drawImage(glowSprite, lg.x - gr, lg.y - gr, gr * 2, gr * 2);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (bg) { ctx.drawImage(bg, 0, 0, W, H); }

    drawFog();
    drawLampGlow();
    drawRiples(false);
    drawLady();
    drawRiples(true);
    drawRain();
    drawEaveDrips();
  }

  function warmup(frames) {
    var dt = 1 / 60;
    for (var i = 0; i < frames; i++) { advance(dt); }
    draw();
  }

  function frame(ts) {
    rafId = window.requestAnimationFrame(frame);
    if (!last) {
      last = ts;
      return;
    }
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

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    W = Math.max(1, window.innerWidth);
    H = Math.max(1, window.innerHeight);

    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    vpX = W * 0.50;
    vpY = H * 0.425;

    makeFogSprite();
    makeGlowSprite();
    buildBackground();
    makeRain();
    makeEaveDrips();
    makeRimDrips();
    makeFog();
    ripples.length = 0;
    t = 0;

    warmup(170);
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
