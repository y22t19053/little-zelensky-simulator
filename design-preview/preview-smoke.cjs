/* Optional local verification. Run: node design-preview/preview-smoke.cjs */
'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const EDGE = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = Number(process.env.EDGE_PORT || 9334);
const SHOTS = path.join(__dirname, 'screenshots');
const PROFILE = path.join(__dirname, '.edge-profile');
const URL = pathToFileURL(path.join(__dirname, 'index.html')).href;
const failures = [], errors = [], warnings = [], externalRequests = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function assert(value, label, detail) {
  if (value) console.log('  ok  ' + label);
  else { failures.push(label + (detail ? ' — ' + detail : '')); console.error('  FAIL ' + label + (detail ? ' — ' + detail : '')); }
}
async function waitFor(fn, timeout = 12000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { try { const value = await fn(); if (value) return value; } catch {} await sleep(100); }
  throw new Error('等待超时');
}
class Cdp {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.listeners = new Map();
    ws.addEventListener('message', event => {
      const msg = JSON.parse(typeof event.data === 'string' ? event.data : event.data.toString());
      if (msg.id && this.pending.has(msg.id)) {
        const item = this.pending.get(msg.id); this.pending.delete(msg.id);
        msg.error ? item.reject(new Error(msg.error.message)) : item.resolve(msg.result); return;
      }
      (this.listeners.get(msg.method) || []).forEach(fn => fn(msg.params || {}));
    });
  }
  on(method, fn) { if (!this.listeners.has(method)) this.listeners.set(method, []); this.listeners.get(method).push(fn); }
  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.id; this.pending.set(id, { resolve, reject }); this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('CDP timeout: ' + method)); } }, 15000);
    });
  }
}
async function connect() {
  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = targets.find(target => target.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  const cdp = new Cdp(ws);
  cdp.on('Runtime.exceptionThrown', p => errors.push(p.exceptionDetails?.exception?.description || p.exceptionDetails?.text || 'exception'));
  cdp.on('Runtime.consoleAPICalled', p => {
    if (!['error', 'warning'].includes(p.type)) return;
    const text = (p.args || []).map(a => a.value ?? a.description ?? a.type).join(' ');
    (p.type === 'error' ? errors : warnings).push(text);
  });
  cdp.on('Log.entryAdded', p => { if (p.entry?.level === 'error') errors.push(p.entry.text); if (p.entry?.level === 'warning') warnings.push(p.entry.text); });
  cdp.on('Network.requestWillBeSent', p => { if (/^https?:/i.test(p.request?.url || '')) externalRequests.push(p.request.url); });
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Log.enable'); await cdp.send('Network.enable');
  return cdp;
}
async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
async function shot(cdp, name) {
  const result = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(path.join(SHOTS, name), Buffer.from(result.data, 'base64'));
}
async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  if (fs.existsSync(PROFILE)) fs.rmSync(PROFILE, { recursive: true, force: true });
  const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, 'about:blank'], { stdio: 'ignore' });
  let cdp;
  try {
    await waitFor(async () => (await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok);
    cdp = await connect();
    const cases = [
      { name: 'desktop-1280', width: 1280, height: 800, mobile: false },
      { name: 'desktop-1440', width: 1440, height: 900, mobile: false },
      { name: 'mobile-320', width: 320, height: 740, mobile: true },
      { name: 'mobile-390', width: 390, height: 844, mobile: true }
    ];
    for (const item of cases) {
      console.log('\n[' + item.name + ']');
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: item.width, height: item.height, deviceScaleFactor: 1, mobile: item.mobile });
      await cdp.send('Page.navigate', { url: URL });
      await waitFor(() => evaluate(cdp, 'document.readyState === "complete" && !!document.querySelector(".choice-card")'));
      await sleep(150);
      const initial = await evaluate(cdp, `(() => {
        const values=[...document.querySelectorAll('.state-row strong')].map(n=>Number(n.textContent));
        const cards=[...document.querySelectorAll('.choice-card')].map(n=>{const r=n.getBoundingClientRect();const title=n.querySelector('.choice-title').getBoundingClientRect();const summary=n.querySelector('.choice-summary').getBoundingClientRect();return {top:r.top,bottom:r.bottom,titleTop:title.top,summaryBottom:summary.bottom}});
        const targets=[...document.querySelectorAll('button,summary')].filter(n=>{const r=n.getBoundingClientRect();return r.width>0&&r.height>0}).map(n=>({name:n.id||n.className||n.tagName,width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height}));
        return {values,overflow:document.documentElement.scrollWidth>innerWidth,cards,targets,selected:document.querySelectorAll('.choice-card.is-selected').length,detailsOpen:document.querySelector('.state-details').open,storage:localStorage.length};
      })()`);
      assert(JSON.stringify(initial.values) === JSON.stringify([54,48,52,60,42,52,58]), '七项状态名称顺序对应真实初始读数');
      assert(!initial.overflow, '无横向溢出');
      assert(initial.selected === 1, '初始只有一项选中');
      assert(initial.storage === 0, '未写入 LocalStorage');
      assert(initial.targets.every(t => t.height >= 44), '所有可见主要交互目标至少 44px', JSON.stringify(initial.targets.filter(t => t.height < 44)));
      if (!item.mobile) {
        assert(initial.cards.slice(0,2).every(c => c.titleTop < item.height - 78 && c.summaryBottom < item.height - 78), '首屏显示两项决策标题与摘要', JSON.stringify(initial.cards.slice(0,2)));
        assert(initial.detailsOpen, '桌面展开七项状态');
      } else {
        assert(initial.cards[0].titleTop < item.height - 72, '首屏可见第一项决策入口', String(initial.cards[0].titleTop));
        assert(!initial.detailsOpen, '手机默认紧凑状态且有展开入口');
        await evaluate(cdp, 'document.querySelector(".state-details summary").click()');
        assert(await evaluate(cdp, 'document.querySelector(".state-details").open && document.querySelectorAll(".state-row").length === 7'), '手机可展开全部七项状态');
        await evaluate(cdp, 'document.querySelector(".state-details summary").click()');
      }
      await evaluate(cdp, 'document.querySelector("[data-choice=mobilize]").click()');
      const selected = await evaluate(cdp, `({pressed:document.querySelector('[data-choice=mobilize]').getAttribute('aria-pressed'),cost:document.getElementById('selection-cost').textContent,remaining:document.getElementById('remaining-ap').textContent})`);
      assert(selected.pressed === 'true' && selected.cost === '成本 2 AP' && selected.remaining === '签发后剩余 1 AP', '选择反馈与签发栏同步');
      await evaluate(cdp, 'document.getElementById("issue-button").click()');
      assert(await evaluate(cdp, 'document.getElementById("issue-button").disabled && document.querySelector("[data-choice=mobilize]").classList.contains("is-issued")'), '签发后显示预览反馈且按钮禁用');
      assert(await evaluate(cdp, 'localStorage.length===0 && [...document.querySelectorAll(".state-row strong")].map(n=>Number(n.textContent)).join(",")==="54,48,52,60,42,52,58"'), '签发预览不结算状态、不写存档');
      await evaluate(cdp, 'document.querySelector("[data-choice=address]").click()');
      await cdp.send('Runtime.evaluate', { expression: 'scrollTo(0,0)' });
      await shot(cdp, item.name + '.png');
    }
    assert(errors.length === 0, '控制台 0 错误', errors.join(' | '));
    assert(warnings.length === 0, '控制台 0 警告', warnings.join(' | '));
    assert(externalRequests.length === 0, '0 外部网络请求', externalRequests.join(' | '));
  } finally {
    if (cdp) await cdp.send('Browser.close').catch(() => {});
    edge.kill();
  }
  if (failures.length) { console.error('\n失败：\n' + failures.join('\n')); process.exitCode = 1; }
  else console.log('\n全部视觉样板浏览器检查通过。');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
