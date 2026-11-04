/*
 * v1.3.0 资源测试
 *
 * 视觉重制引入了字体子集、纸纹贴图和矢量插画。这里检查的是「文件真的在、
 * 真的能被加载、没有失控的体积、也没有引用到不存在的路径」——不检查画面好不好看
 * （那部分只能靠真实截图和人眼，见 docs/ASSET_MANIFEST.md 与最终报告）。
 */
'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
let failures = 0;

function test(name, body) {
  try {
    body();
    console.log('  ok   ' + name);
  } catch (error) {
    failures += 1;
    console.log('  FAIL ' + name);
    console.log('       ' + (error && error.message ? error.message : error));
  }
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel));
}

function text(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

const CSS = text('css/style.css');
const INDEX = text('index.html');

console.log('\n[1] 字体');
test('字体子集存在且是真正的 woff2', function () {
  const buf = read('assets/fonts/archive-serif.woff2');
  assert.ok(buf.length > 50000, 'woff2 太小，可能没裁成功：' + buf.length);
  assert.ok(buf.length < 900000, 'woff2 太大，子集没生效：' + buf.length);
  assert.equal(buf.slice(0, 4).toString('ascii'), 'wOF2', '前四个字节不是 wOF2');
});
test('@font-face 指向该文件并声明 font-display', function () {
  assert.ok(/@font-face\s*\{[^}]*archive-serif\.woff2/.test(CSS), 'CSS 里没有引用 archive-serif.woff2');
  assert.ok(/font-display\s*:\s*swap/.test(CSS), '缺少 font-display: swap');
});
test('index.html 预加载字体', function () {
  const tag = INDEX.match(/<link[^>]*archive-serif\.woff2[^>]*>/);
  assert.ok(tag, 'index.html 里没有 preload 字体');
  assert.ok(/rel="preload"/.test(tag[0]), 'preload 缺少 rel');
  assert.ok(/as="font"/.test(tag[0]), 'preload 缺少 as="font"');
  assert.ok(/type="font\/woff2"/.test(tag[0]), 'preload 没有声明 font/woff2');
  assert.ok(!/crossorigin/.test(tag[0]), '同源字体预加载不该带 crossorigin，否则浏览器会报 credentials mode 不一致');
});
test('正文仍然有系统字体回退（不把中文全压进一个字体文件）', function () {
  assert.ok(/--serif:[^;]*serif/.test(CSS), '--serif 没有 serif 回退');
  assert.ok(/--sans:[^;]*sans-serif/.test(CSS), '--sans 没有 sans-serif 回退');
  assert.ok(/--sans:[^;]*Microsoft YaHei|--sans:[^;]*PingFang/.test(CSS), '--sans 缺少系统中文字体');
});

console.log('\n[2] 纹理与插画');
test('纸纹与墙面颗粒贴图存在、体积克制', function () {
  ['assets/visual/paper-fiber.webp', 'assets/visual/wall-grain.webp'].forEach(function (rel) {
    assert.ok(exists(rel), '缺少 ' + rel);
    const buf = read(rel);
    assert.ok(buf.length < 300 * 1024, rel + ' 太大：' + buf.length);
    assert.equal(buf.slice(8, 12).toString('ascii'), 'WEBP', rel + ' 不是 webp');
  });
});
test('封面插画是 SVG 且带原始尺寸与替代文本', function () {
  const file = 'assets/visual/v13/cover-desk.svg';
  assert.ok(exists(file), '缺少封面插画');
  const svg = read(file).toString('utf8');
  assert.ok(/viewBox="0 0 1600 640"/.test(svg), '封面插画 viewBox 变了，alt 尺寸需要同步');
  const img = INDEX.match(/<img[^>]*cover-desk\.svg[^>]*>/);
  assert.ok(img, 'index.html 没有引用封面插画');
  assert.ok(/width="1600"/.test(img[0]) && /height="640"/.test(img[0]), '封面 img 缺少宽高，会引起布局跳动');
  assert.ok(/alt="[^"]{10,}"/.test(img[0]), '封面 img 的 alt 太短或为空');
  assert.ok(/不是历史照片/.test(INDEX), '封面附近缺少「不是历史照片」的说明');
});
test('CSS 里引用的本地资源都存在', function () {
  const refs = [];
  CSS.replace(/url\((['"]?)(\.\.\/[^)'"]+)\1\)/g, function (all, q, rel) {
    refs.push(rel);
    return all;
  });
  assert.ok(refs.length >= 2, 'CSS 里没有引用任何本地资源');
  refs.forEach(function (rel) {
    const abs = path.resolve(path.join(ROOT, 'css'), rel);
    assert.ok(fs.existsSync(abs), 'CSS 引用了不存在的文件：' + rel);
  });
});

console.log('\n[3] 脚本装载顺序');
test('visual.js 在 archive.js 之后、workbench.js 之前加载', function () {
  const order = ['js/archive.js', 'js/visual.js', 'js/workbench.js', 'js/engine.js', 'js/main.js'];
  const positions = order.map(function (rel) {
    const at = INDEX.indexOf(rel);
    assert.ok(at > 0, 'index.html 没有加载 ' + rel);
    return at;
  });
  for (let i = 1; i < positions.length; i += 1) {
    assert.ok(positions[i - 1] < positions[i], order[i - 1] + ' 应在 ' + order[i] + ' 之前加载');
  }
});
test('visual.js 暴露 LZS_VISUAL，且不依赖 DOM', function () {
  const src = text('js/visual.js');
  assert.ok(/LZS_VISUAL\s*=/.test(src), 'visual.js 没有挂 LZS_VISUAL');
  assert.ok(!/document\.|window\.addEventListener|querySelector/.test(src), 'visual.js 里出现了 DOM 调用，应该在 main.js 里渲染');
});

console.log('\n[4] 没有失控的大图');
test('仓库里的图片资源都在合理体积内', function () {
  const dirs = ['assets/events', 'assets/visual', 'assets/visual/events', 'assets/visual/maps', 'assets/visual/v13'];
  const big = [];
  dirs.forEach(function (dir) {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) return;
    fs.readdirSync(abs).forEach(function (name) {
      const file = path.join(abs, name);
      const stat = fs.statSync(file);
      if (stat.isFile() && stat.size > 400 * 1024) big.push(dir + '/' + name + ' = ' + Math.round(stat.size / 1024) + 'KB');
    });
  });
  assert.deepEqual(big, [], '这些图片超过 400KB，需要压缩或换格式：' + big.join(', '));
});

console.log('\n[5] 视觉层读真实状态');
test('地图与时间线都从引擎状态取值，不写死数字', function () {
  const src = text('js/visual.js');
  assert.ok(/L\.getCampaignStatus|fronts/.test(src), '地图没有读战役状态');
  assert.ok(/state\.campaign|state\.choices/.test(src), '时间线没有读本局状态');
  assert.ok(!/主战\s*线|兵力\s*\d{3}/.test(src), 'visual.js 里疑似写死了示意数值');
});

if (failures) {
  console.log('\n资源测试失败 ' + failures + ' 项');
  process.exit(1);
}
console.log('\n资源测试全部通过');
