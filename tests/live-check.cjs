/*
 * 线上验证：打开 GitHub Pages 上的正式站点，检查脚本是否加载、版本号是否可见、
 * 推演室入口与未通关时的锁定提示、以及控制台有没有错误。需要联网。
 * 运行：npm run test:live（或 node tests/live-check.cjs）
 */
'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const PROFILE = path.join(__dirname, '.edge-profile-live');
const EDGE = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9337;
const URL_LIVE = 'https://y22t19053.github.io/little-zelensky-simulator/';

const errors = [];
const failures = [];

function assert(ok, label, detail) {
  if (ok) console.log('  ok  ' + label);
  else { failures.push(label + (detail ? ' — ' + detail : '')); console.error('  FAIL ' + label + (detail ? ' — ' + detail : '')); }
}

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

async function waitFor(fn, timeout) {
  const limit = Date.now() + (timeout || 15000);
  let last = null;
  while (Date.now() < limit) {
    try { const v = await fn(); if (v) return v; } catch (e) { last = e; }
    await sleep(200);
  }
  throw last || new Error('等待超时');
}

class Cdp {
  constructor(ws) {
    this.ws = ws; this.nextId = 1; this.pending = new Map(); this.listeners = new Map();
    const self = this;
    ws.addEventListener('message', function (event) {
      let m;
      try { m = JSON.parse(typeof event.data === 'string' ? event.data : event.data.toString()); } catch (e) { return; }
      if (m.id && self.pending.has(m.id)) {
        const p = self.pending.get(m.id); self.pending.delete(m.id);
        if (m.error) p.reject(new Error(m.error.message || 'CDP error')); else p.resolve(m.result);
        return;
      }
      (self.listeners.get(m.method) || []).forEach(function (h) { try { h(m.params || {}); } catch (e) {} });
    });
  }
  on(method, handler) { if (!this.listeners.has(method)) this.listeners.set(method, []); this.listeners.get(method).push(handler); }
  send(method, params) {
    const self = this; const id = this.nextId++;
    return new Promise(function (resolve, reject) {
      self.pending.set(id, { resolve: resolve, reject: reject });
      self.ws.send(JSON.stringify({ id: id, method: method, params: params || {} }));
      setTimeout(function () { if (self.pending.has(id)) { self.pending.delete(id); reject(new Error('CDP timeout: ' + method)); } }, 20000);
    });
  }
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', { expression: expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) {
    const details = result.exceptionDetails;
    throw new Error((details.exception && details.exception.description) || details.text);
  }
  return result.result ? result.result.value : undefined;
}

async function openPage() {
  const response = await fetch('http://127.0.0.1:' + PORT + '/json/list');
  const targets = await response.json();
  const page = targets.find(function (t) { return t.type === 'page'; }) || targets[0];
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(function (resolve, reject) {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', function () { reject(new Error('WebSocket 连接失败')); }, { once: true });
  });
  const cdp = new Cdp(ws);
  cdp.on('Runtime.consoleAPICalled', function (params) {
    if (params.type !== 'error') return;
    const text = (params.args || []).map(function (a) { return a.value != null ? String(a.value) : (a.description || a.type); }).join(' ');
    errors.push(text);
  });
  cdp.on('Runtime.exceptionThrown', function (params) {
    const d = params.exceptionDetails || {};
    errors.push(d.exception && d.exception.description ? d.exception.description.split('\n')[0] : (d.text || '异常'));
  });
  cdp.on('Log.entryAdded', function (params) {
    const e = params.entry || {};
    if (e.level === 'error') errors.push(e.text || e.url || 'log error');
  });
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  return cdp;
}

async function main() {
  if (fs.existsSync(PROFILE)) fs.rmSync(PROFILE, { recursive: true, force: true });
  const edge = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--no-default-browser-check', '--disable-extensions',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + PROFILE,
    '--window-size=1280,900', 'about:blank'
  ], { stdio: 'ignore' });

  let cdp = null;
  try {
    await waitFor(async function () {
      const r = await fetch('http://127.0.0.1:' + PORT + '/json/version');
      return r.ok;
    }, 20000);

    cdp = await openPage();
    await cdp.send('Page.navigate', { url: URL_LIVE });
    await waitFor(function () {
      return evaluate(cdp, 'document.readyState === "complete" && !!window.LZS && !!document.getElementById("btn-start")');
    }, 30000);

    const info = await evaluate(cdp, 'JSON.stringify({ver: (window.EVENTS_DATA && window.EVENTS_DATA.ui && window.EVENTS_DATA.ui.version) || (window.LZS && window.LZS.META && window.LZS.META.version) || null, dyn: !!window.LZS_DYNAMIC, rep: !!window.LZS_REPLAY, arc: !!window.LZS_ARCHIVE, wb: !!window.LZS_WORKBENCH, story: !!window.LZS_STORYLINES, aw: !!window.LZS_AFTERWARD, dynCount: window.LZS_DYNAMIC ? window.LZS_DYNAMIC.count : null, repCount: window.LZS_REPLAY ? window.LZS_REPLAY.count : null, storyCount: window.LZS_STORYLINES ? window.LZS_STORYLINES.count : null, awCount: window.LZS_AFTERWARD ? window.LZS_AFTERWARD.count : null, btn: (document.getElementById("btn-replay-room")||{}).textContent, awBtn: (document.getElementById("btn-afterward-intro")||{}).textContent, wbNote: (document.getElementById("intro-version")||{}).textContent, fatal: !!document.querySelector(".fatal")})');
    const parsed = JSON.parse(info);
    console.log('  live: ' + info);
    assert(!parsed.fatal, '线上页面没有载入失败');
    assert(parsed.dyn && parsed.rep && parsed.arc, '三个 v1.1 脚本都在线上加载');
    assert(parsed.wb, 'v1.1.1 的总统工作台脚本在线上加载');
    assert(parsed.story && parsed.aw, 'v1.2 的故事线与历史回声脚本都在线上加载');
    assert(parsed.dynCount === 37 && parsed.repCount === 6, '线上事件模板 37 条、推演模块 6 个', info);
    assert(parsed.storyCount === 8 && parsed.awCount === 4, '线上故事线 8 条、历史回声 4 条', info);
    assert(/决策推演室/.test(parsed.btn || ''), '封面有推演室入口', parsed.btn);
    assert(/通关后解锁/.test(parsed.btn || ''), '没有战役记录时显示解锁条件', parsed.btn);
    assert(/后来，战争走到了这里/.test(parsed.awBtn || ''), '封面有历史回声入口', parsed.awBtn);
    const hasVer = await evaluate(cdp, 'document.body.innerText.indexOf("1.2.0") !== -1');
    assert(hasVer, '页面文案里能读到 1.2.0');

    await evaluate(cdp, 'document.getElementById("btn-replay-room").click()');
    await sleep(800);
    const modal = await evaluate(cdp, 'JSON.stringify({open: document.getElementById("modal-root").children.length > 0, text: document.getElementById("modal-root").innerText.slice(0, 400), foot: document.querySelector(".intro-version, .version, footer") ? document.querySelector(".intro-version, .version, footer").innerText.slice(0,80) : ""})');
    const m = JSON.parse(modal);
    console.log('  modal: ' + JSON.stringify({ open: m.open, head: m.text.slice(0, 60) }));
    assert(m.open, '点击后打开推演室弹窗');
    assert(/档案柜还没有解锁/.test(m.text), '未通关时说明解锁条件', m.text.slice(0, 80));
    assert(/决策推演/.test(m.text), '弹窗标出「决策推演」');

    await evaluate(cdp, 'document.querySelectorAll(".modal-close, [data-close]")[0] && document.querySelectorAll(".modal-close, [data-close]")[0].click()');
    await sleep(300);
    assert(errors.length === 0, '控制台没有错误', errors.join(' | '));
  } finally {
    if (cdp) { try { await cdp.send('Browser.close'); } catch (e) {} }
    edge.kill();
    await sleep(500);
    if (fs.existsSync(PROFILE)) fs.rmSync(PROFILE, { recursive: true, force: true });
  }

  console.log('');
  if (failures.length) {
    console.error('线上验证失败 ' + failures.length + ' 项：');
    failures.forEach(function (f) { console.error(' - ' + f); });
    process.exit(1);
  }
  console.log('线上验证通过。');
}

main().catch(function (error) {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
