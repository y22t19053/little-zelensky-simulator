'use strict';
/* 纪念海报：数据、文案与版面的自动检查（不依赖浏览器）。
 * 二维码是否能被独立解码，由 tests/poster-qr.py 对真实导出的 PNG 检查。 */
const assert = require('assert');
process.argv.push('--quiet');
globalThis.LZS_QR = require('../js/qr.js');
const P = require('../js/poster.js');
const S = require('./campaign-sim.cjs');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '\n    ' + (e && e.message)); }
}

function fakeCanvas() {
  const texts = [], rects = [];
  let fill = '';
  const ctx = {
    set fillStyle(v) { fill = v; }, get fillStyle() { return fill; },
    strokeStyle: '', lineWidth: 1, font: '', textAlign: 'left', textBaseline: 'alphabetic',
    save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {},
    arc() {}, bezierCurveTo() {}, strokeRect() {},
    fillRect(x, y, w, h) { rects.push({ x, y, w, h, fill }); },
    fillText(t, x, y) { texts.push({ t: String(t), x, y }); },
    measureText(t) { return { width: String(t).length * 20 }; }
  };
  return { width: 0, height: 0, getContext() { return ctx; }, texts, rects };
}

function endingOf(plan, opts) { return S.play(plan, opts || {}).state.ending; }
const routes = {
  near_history: endingOf(S.ROUTES.near_history),
  hard: endingOf(S.ROUTES.hard),
  c_E: endingOf(S.ENDING_ROUTES.c_E),
  wrapped: endingOf(S.ROUTES.near_history, { wrap: 'continue' })
};

console.log('纪念海报测试');

test('海报数据只来自结局对象，档位用文字而不是分数', () => {
  Object.keys(routes).forEach((k) => {
    const d = P.buildData(routes[k]);
    assert.ok(d.title && d.code, k + ' 缺标题或结局代号');
    assert.ok(d.dims.length >= 6, k + ' 国家状态不足');
    d.dims.forEach((x) => assert.ok(['稳固', '承压', '吃紧', '濒危'].includes(x.word), k + ' 档位异常 ' + x.word));
    assert.ok(d.keys.length >= 1 && d.keys.length <= 3, k + ' 关键决定应为 1–3 条');
    assert.equal(d.url, 'https://y22t19053.github.io/little-zelensky-simulator/');
  });
});

test('不同路线给出不同的海报内容', () => {
  const titles = new Set(['near_history', 'hard', 'c_E'].map((k) => P.buildData(routes[k]).title));
  assert.ok(titles.size >= 2, '三条路线的海报标题全相同');
});

test('收束后天数在 38 之上，未收束为 38', () => {
  assert.equal(P.buildData(routes.near_history).days, 38);
  const w = P.buildData(routes.wrapped);
  assert.ok(w.days > 38 && w.days <= 52, '收束天数 ' + w.days);
  assert.equal(w.wrapped, true);
});

test('绘制出的文字不含评分、不含“击败”类措辞，并带有免责声明', () => {
  Object.keys(routes).forEach((k) => {
    const c = fakeCanvas();
    P.make(c, routes[k]);
    const all = c.texts.map((x) => x.t).join('\n');
    assert.ok(!/恭喜|击败|胜利者|通关|得分|\d+\s*分(?!钟)/.test(all), k + ' 出现评分或战胜措辞：' + all.match(/恭喜|击败|胜利者|通关|得分|\d+\s*分/));
    assert.ok(/不是历史照片/.test(all) && /没有分数/.test(all), k + ' 缺免责声明');
    assert.ok(/扫码打开游戏/.test(all), k + ' 缺二维码说明');
    assert.ok(!/getAlarms|checkCollapse|undefined|NaN|\[object/.test(all), k + ' 出现开发用语或未定义值');
  });
});

test('版面：画布 1080×1350，正文不压到页脚，页脚在画布内', () => {
  Object.keys(routes).forEach((k) => {
    const c = fakeCanvas();
    const d = P.make(c, routes[k]);
    assert.equal(c.width, 1080); assert.equal(c.height, 1350);
    const L = d.layout;
    assert.ok(L.mapBottom < L.footerTop, k + ' 地图压到页脚');
    assert.ok(L.keysBottom <= L.footerTop, k + ' 关键决定压到页脚 ' + L.keysBottom + '>' + L.footerTop);
    assert.ok(L.footerBottom < 1350, k + ' 页脚越出画布');
  });
});

test('二维码确实被绘制（黑色模块数量与 qr 模块数一致）', () => {
  const c = fakeCanvas();
  P.make(c, routes.near_history);
  const qr = globalThis.LZS_QR.encode(P.LIVE_URL);
  let dark = 0; qr.modules.forEach((r) => r.forEach((v) => { if (v) dark++; }));
  const black = c.rects.filter((r) => r.fill === '#000000').length;
  assert.equal(black, dark, '绘制的黑色模块数与编码结果不一致');
  assert.ok(dark > 200);
});

console.log('海报测试：' + pass + ' 通过，' + fail + ' 失败');
if (fail) process.exit(1);
