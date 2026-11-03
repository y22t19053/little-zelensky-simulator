/* 小泽模拟器 · 纪念海报（v1.0）
 * 在浏览器里用 canvas 绘制 1080×1350 PNG，数据全部来自本局存档里的结局对象。
 * 不上传、不评分；二维码指向公开站点，由 js/qr.js 在本地生成。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.LZS_POSTER = factory(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var W = 1080, H = 1350;
  var LIVE_URL = 'https://y22t19053.github.io/little-zelensky-simulator/';
  var FONT = '"Noto Serif SC","Source Han Serif SC","Songti SC","SimSun","Microsoft YaHei",serif';
  var SANS = '"Microsoft YaHei","PingFang SC","Noto Sans SC",sans-serif';
  var C = { bg: '#151a13', panel: '#1d2419', paper: '#c8bc99', ink: '#e8e0c8', mute: '#9a9378', amber: '#c9a563', blue: '#4a78b0', yellow: '#d6b84a', red: '#a8553d', line: '#3a4332' };

  function wordFor(value) {
    if (typeof value !== 'number') return '未知';
    if (value >= 66) return '稳固';
    if (value >= 45) return '承压';
    if (value >= 25) return '吃紧';
    return '濒危';
  }

  function textOf(v) {
    if (v == null) return '';
    if (typeof v === 'string') return v;
    return String(v.note || v.title || v.label || v.text || '');
  }

  /* 把结局对象整理成海报需要的字段；只读存档里已有的内容，缺失就省略 */
  function buildData(ending, game) {
    ending = ending || {};
    var stats = ending.finalStats || (game && game.stats) || {};
    var dims = (ending.dims || []).map(function (d) {
      var v = d.value != null ? d.value : stats[d.id];
      return { label: d.label || d.id, word: wordFor(v) };
    });
    var keys = (ending.keyDecisions || []).filter(function (k) { return k && k.title; }).slice(0, 3).map(function (k) {
      return { date: k.dateLabel || ('第 ' + k.round + ' 窗口'), title: k.title, status: k.status || '' };
    });
    var fronts = (ending.fronts || []).map(function (f) {
      return { label: f.label || f.id, x: Number(f.x), y: Number(f.y), status: f.status || '', statusLabel: f.statusLabel || '' };
    }).filter(function (f) { return isFinite(f.x) && isFinite(f.y); });
    var after = ending.aftermath || null;
    var divergence = textOf(ending.firstDivergence);
    return {
      code: ending.code || '',
      title: ending.title || '基辅战役',
      kicker: ending.kicker || '',
      verdict: ending.verdict || '',
      tone: ending.tone || 'warning',
      endLabel: after && after.endLabel ? after.endLabel : '04.02',
      days: 38 + (after && after.days ? after.days : 0),
      wrapped: !!(after && after.days),
      mood: after && after.mood ? textOf(after.mood) : '',
      dims: dims,
      keys: keys,
      fronts: fronts,
      divergence: divergence,
      url: LIVE_URL
    };
  }

  function wrap(ctx, text, maxW) {
    var lines = [], line = '';
    String(text || '').split('').forEach(function (ch) {
      var t = line + ch;
      if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = ch; } else line = t;
    });
    if (line) lines.push(line);
    return lines;
  }

  function drawText(ctx, text, x, y, maxW, lineH, maxLines) {
    var lines = wrap(ctx, text, maxW);
    if (maxLines && lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      lines[maxLines - 1] = lines[maxLines - 1].replace(/.$/, '…');
    }
    lines.forEach(function (l, i) { ctx.fillText(l, x, y + i * lineH); });
    return y + lines.length * lineH;
  }

  function drawQr(ctx, qr, x, y, size) {
    var quiet = 2, cells = qr.size + quiet * 2, cell = Math.floor(size / cells);
    var full = cell * cells;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, full, full);
    ctx.fillStyle = '#000000';
    for (var r = 0; r < qr.size; r++) {
      for (var c = 0; c < qr.size; c++) {
        if (qr.modules[r][c]) ctx.fillRect(x + (c + quiet) * cell, y + (r + quiet) * cell, cell, cell);
      }
    }
    return full;
  }

  function drawMap(ctx, data, x, y, w, h) {
    ctx.save();
    ctx.fillStyle = '#121710';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(74,120,176,.55)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.52, y + 8);
    ctx.bezierCurveTo(x + w * 0.46, y + h * 0.3, x + w * 0.58, y + h * 0.55, x + w * 0.5, y + h - 8);
    ctx.stroke();
    var kx = x + w * 0.5, ky = y + h * 0.5;
    ctx.strokeStyle = C.amber;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(kx, ky, 26, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = C.amber;
    ctx.beginPath(); ctx.arc(kx, ky, 7, 0, Math.PI * 2); ctx.fill();
    ctx.font = '600 20px ' + SANS;
    ctx.textAlign = 'center';
    ctx.fillText('基辅', kx, ky + 50);
    data.fronts.forEach(function (f) {
      var px = x + Math.max(0.08, Math.min(0.92, f.x / 100)) * w;
      var py = y + Math.max(0.1, Math.min(0.9, f.y / 74)) * h;
      var bad = /lost|fall|cut|broken|critical|danger/i.test(f.status);
      var ok = /held|hold|stable|secure|open|good/i.test(f.status);
      ctx.fillStyle = bad ? C.red : ok ? C.yellow : C.blue;
      ctx.beginPath(); ctx.arc(px, py, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = C.ink;
      ctx.font = '500 20px ' + SANS;
      ctx.textAlign = px > x + w * 0.62 ? 'right' : 'left';
      ctx.fillText(f.label, px + (ctx.textAlign === 'right' ? -16 : 16), py + 7);
    });
    ctx.restore();
  }

  function render(canvas, data, qr) {
    canvas.width = W; canvas.height = H;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = C.blue; ctx.fillRect(0, 0, W, 14);
    ctx.fillStyle = C.yellow; ctx.fillRect(0, 14, W, 8);
    ctx.fillStyle = C.panel; ctx.fillRect(40, 56, W - 80, H - 100);
    ctx.strokeStyle = C.amber; ctx.lineWidth = 3; ctx.strokeRect(40, 56, W - 80, H - 100);
    ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.strokeRect(52, 68, W - 104, H - 124);

    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = C.mute; ctx.font = '500 24px ' + SANS;
    ctx.fillText('小泽模拟器 · 基辅战役 纪念档案', 84, 124);
    ctx.textAlign = 'right';
    ctx.fillText('2022.02.24 — ' + data.endLabel, W - 84, 124);
    ctx.textAlign = 'left';

    var L = {};
    ctx.fillStyle = C.amber; ctx.font = '600 30px ' + SANS;
    ctx.fillText(data.code ? '结局 ' + data.code : '战役结局', 84, 190);
    ctx.fillStyle = C.ink; ctx.font = '700 72px ' + FONT;
    var y = drawText(ctx, data.title, 84, 268, W - 168, 84, 2);
    if (data.kicker) {
      ctx.fillStyle = C.mute; ctx.font = '400 26px ' + FONT;
      y = drawText(ctx, data.kicker, 84, y + 2, W - 168, 38, 1);
    }
    ctx.fillStyle = C.paper; ctx.font = '400 28px ' + FONT;
    y = drawText(ctx, data.verdict, 84, y + 18, W - 168, 42, 3);
    L.headBottom = y;

    // 页脚位置先定，正文都要在它上面
    var qrSize = 160;
    var fy = H - 236;
    L.footerTop = fy - 18;

    // 地图 + 国家状态
    var top = y + 14;
    var mapH = 312;
    drawMap(ctx, data, 84, top, 470, mapH);
    ctx.fillStyle = C.amber; ctx.font = '600 24px ' + SANS; ctx.textAlign = 'left';
    ctx.fillText('国家状态（描述，不计分）', 590, top + 28);
    data.dims.slice(0, 8).forEach(function (d, i) {
      var yy = top + 70 + i * 32;
      ctx.fillStyle = C.ink; ctx.font = '400 24px ' + FONT; ctx.fillText(d.label, 590, yy);
      ctx.textAlign = 'right';
      ctx.fillStyle = d.word === '稳固' ? C.yellow : d.word === '承压' ? C.paper : d.word === '吃紧' ? C.amber : C.red;
      ctx.fillText(d.word, W - 84, yy);
      ctx.textAlign = 'left';
    });
    L.mapTop = top; L.mapBottom = top + mapH;

    // 关键决定：放不下就少画，不压到页脚
    var limit = L.footerTop - 16;
    var ky = L.mapBottom + 44;
    ctx.fillStyle = C.amber; ctx.font = '600 24px ' + SANS;
    ctx.fillText('这一局的关键决定', 84, ky);
    ctx.font = '400 26px ' + FONT;
    var yy2 = ky + 40;
    var drawn = 0;
    if (!data.keys.length) {
      ctx.fillStyle = C.mute; ctx.fillText('本局没有签发关键决定。', 84, yy2); yy2 += 38;
    }
    data.keys.forEach(function (k) {
      if (yy2 > limit) return;
      ctx.fillStyle = C.mute; ctx.fillText(k.date, 84, yy2);
      ctx.fillStyle = C.ink;
      yy2 = drawText(ctx, k.title, 270, yy2, W - 270 - 84, 36, 1) + 4;
      drawn++;
    });
    if (data.divergence && yy2 + 8 <= limit) {
      yy2 += 6;
      ctx.fillStyle = C.mute; ctx.font = '400 22px ' + FONT;
      var room = Math.max(1, Math.min(2, Math.floor((limit - yy2) / 30) + 1));
      if (yy2 <= limit) yy2 = drawText(ctx, '与史实第一次分岔：' + data.divergence, 84, yy2, W - 168, 30, room);
    }
    L.keysDrawn = drawn; L.keysBottom = yy2;

    // 页脚：二维码与说明
    ctx.strokeStyle = C.line; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(84, fy - 18); ctx.lineTo(W - 84, fy - 18); ctx.stroke();
    if (qr) drawQr(ctx, qr, W - 84 - qrSize, fy, qrSize);
    ctx.fillStyle = C.ink; ctx.font = '500 26px ' + SANS;
    ctx.fillText('战役 ' + data.days + ' 天' + (data.wrapped ? '（含收束）' : ''), 84, fy + 30);
    ctx.fillStyle = C.mute; ctx.font = '400 20px ' + SANS;
    drawText(ctx, '原创模拟推演，不是历史照片，不评价真实人物，也没有分数。所有数值均为设计参数。', 84, fy + 66, W - 168 - qrSize - 20, 28, 3);
    ctx.fillStyle = C.amber; ctx.font = '500 19px ' + SANS;
    ctx.fillText('扫码打开游戏：y22t19053.github.io/little-zelensky-simulator', 84, fy + qrSize - 6);
    L.footerBottom = fy + qrSize;
    canvas.__layout = L;
    return canvas;
  }

  function make(canvas, ending, game) {
    var data = buildData(ending, game);
    var qr = root.LZS_QR ? root.LZS_QR.encode(LIVE_URL) : null;
    render(canvas, data, qr);
    data.layout = canvas.__layout || null;
    return data;
  }

  function toBlob(canvas, cb) {
    if (canvas.toBlob) canvas.toBlob(cb, 'image/png');
    else cb(null);
  }

  return { W: W, H: H, LIVE_URL: LIVE_URL, wordFor: wordFor, buildData: buildData, render: render, make: make, toBlob: toBlob };
});
