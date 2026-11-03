/* 用真实的战役结局数据，在真实 Edge 里绘制 1080×1350 海报并导出 PNG。
 * 用法：node tests/poster-export.cjs [route] [输出路径]
 * 结局数据来自 tests/campaign-sim.cjs 的模拟路线（与游戏同一套引擎），不是手写的样例。 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
process.argv.push('--quiet');
const S = require('./campaign-sim.cjs');
const route = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'near_history';
const out = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : path.join(__dirname, 'screenshots', 'poster-' + route + (process.argv.includes('--wrap') ? '-wrap' : '') + '.png');
const EDGE = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9335;

const plan = S.ROUTES[route] || S.ENDING_ROUTES[route]; if (!plan) { console.error('未知路线 ' + route); process.exit(2); } const played = S.play(plan, process.argv.includes('--wrap') ? { wrap: 'continue' } : {});
const ending = played.ending || (played.state && played.state.ending) || played;
if (!ending || !ending.title) { console.error('没有取得结局对象'); process.exit(2); }
const game = played.state || null;

const profile = path.join(__dirname, '.edge-profile-poster');
const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let targets = null;
  for (let i = 0; i < 60 && !targets; i++) {
    try { const r = await fetch('http://127.0.0.1:' + PORT + '/json/list'); const l = await r.json(); targets = l.find((t) => t.type === 'page'); } catch (e) { await sleep(500); }
  }
  if (!targets) throw new Error('Edge 没有启动');
  const ws = new WebSocket(targets.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const pending = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
  const send = (method, params) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: method, params: params || {} })); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: 'file:///' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/') });
  await sleep(2500);
  const expr = '(function(){var e=' + JSON.stringify(ending) + ';var c=document.createElement("canvas");var d=window.LZS_POSTER.make(c,e,null);return JSON.stringify({w:c.width,h:c.height,data:d,png:c.toDataURL("image/png")});})()';
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
  const o = JSON.parse(r.result.result.value);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(o.png.split(',')[1], 'base64'));
  console.log('size', o.w + 'x' + o.h, 'title', o.data.title, 'code', o.data.code, 'dims', o.data.dims.length, 'keys', o.data.keys.length, 'fronts', o.data.fronts.length, 'layout', JSON.stringify(o.data.layout));
  console.log('wrote', out, fs.statSync(out).size, 'bytes');
  ws.close();
})().catch((e) => { console.error('FAIL', e.message); process.exitCode = 1; }).finally(() => { try { edge.kill(); } catch (e) {} setTimeout(() => process.exit(process.exitCode || 0), 500); });
