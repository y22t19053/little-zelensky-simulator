/*
 * 无头 Edge 冒烟测试：真实浏览器、file://、localStorage、完整一局。
 * 运行：node tests/browser-smoke.cjs
 */
'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(__dirname, 'screenshots');
const PROFILE = path.join(__dirname, '.edge-profile');
const EDGE = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = Number(process.env.EDGE_PORT || 9333);
const PAGE_URL = pathToFileURL(path.join(ROOT, 'index.html')).href;

const SEQUENCE = {
  1: ['aid_call', 'address'],
  2: ['stay', 'record'],
  3: ['air_defense'],
  4: ['curfew', 'arm_citizens'],
  5: ['delegate'],
  6: ['talks'],
  7: ['logistics', 'evacuate']
};

const failures = [];
const consoleErrors = [];
const consoleWarnings = [];

function assert(condition, label, detail) {
  if (condition) {
    console.log('  ok  ' + label);
  } else {
    failures.push(label + (detail ? ' — ' + detail : ''));
    console.error('  FAIL ' + label + (detail ? ' — ' + detail : ''));
  }
}

function sleep(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

async function waitFor(fn, timeout, interval) {
  const limit = Date.now() + (timeout || 12000);
  const step = interval || 100;
  let lastError = null;
  while (Date.now() < limit) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await sleep(step);
  }
  if (lastError) throw lastError;
  throw new Error('等待超时');
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    const self = this;
    ws.addEventListener('message', function (event) {
      let message;
      try {
        message = JSON.parse(typeof event.data === 'string' ? event.data : event.data.toString());
      } catch (error) {
        return;
      }
      if (message.id && self.pending.has(message.id)) {
        const pending = self.pending.get(message.id);
        self.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message || 'CDP error'));
        else pending.resolve(message.result);
        return;
      }
      const handlers = self.listeners.get(message.method) || [];
      handlers.forEach(function (handler) {
        try { handler(message.params || {}); } catch (error) { /* ignore */ }
      });
    });
  }

  on(method, handler) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(handler);
  }

  send(method, params) {
    const self = this;
    const id = this.nextId++;
    return new Promise(function (resolve, reject) {
      self.pending.set(id, { resolve: resolve, reject: reject });
      self.ws.send(JSON.stringify({ id: id, method: method, params: params || {} }));
      setTimeout(function () {
        if (self.pending.has(id)) {
          self.pending.delete(id);
          reject(new Error('CDP timeout: ' + method));
        }
      }, 15000);
    });
  }
}

async function openPage() {
  const response = await fetch('http://127.0.0.1:' + PORT + '/json/list');
  const targets = await response.json();
  const page = targets.find(function (target) { return target.type === 'page'; }) || targets[0];
  if (!page) throw new Error('没有找到可调试的页面目标');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(function (resolve, reject) {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', function () { reject(new Error('WebSocket 连接失败')); }, { once: true });
  });
  const cdp = new Cdp(ws);

  cdp.on('Runtime.consoleAPICalled', function (params) {
    if (params.type !== 'error' && params.type !== 'warning') return;
    const text = (params.args || []).map(function (arg) {
      return arg.value != null ? String(arg.value) : (arg.description || arg.type);
    }).join(' ');
    if (params.type === 'error') consoleErrors.push(text);
    else consoleWarnings.push(text);
  });
  cdp.on('Runtime.exceptionThrown', function (params) {
    const details = params.exceptionDetails || {};
    const text = details.exception && details.exception.description
      ? details.exception.description
      : (details.text || '未知异常');
    consoleErrors.push(text.split('\n')[0]);
  });
  cdp.on('Log.entryAdded', function (params) {
    const entry = params.entry || {};
    if (entry.level === 'error') consoleErrors.push(entry.text || entry.url || 'Log error');
    if (entry.level === 'warning') consoleWarnings.push(entry.text || 'Log warning');
  });

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  return cdp;
}

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  if (fs.existsSync(PROFILE)) {
    fs.rmSync(PROFILE, { recursive: true, force: true });
  }

  const edge = spawn(EDGE, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--allow-file-access-from-files',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + PROFILE,
    '--window-size=1280,900',
    'about:blank'
  ], { stdio: 'ignore' });

  let cdp = null;

  try {
    await waitFor(async function () {
      const response = await fetch('http://127.0.0.1:' + PORT + '/json/version');
      return response.ok;
    }, 15000, 200);

    cdp = await openPage();
    await cdp.send('Page.navigate', { url: PAGE_URL });
    await waitFor(function () {
      return evaluate(cdp, 'document.readyState === "complete" && !!window.LZS && !!document.getElementById("btn-start")');
    }, 15000);

    const setViewport = async function (width, height, mobile) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: width,
        height: height,
        deviceScaleFactor: mobile ? 2 : 1,
        mobile: !!mobile
      });
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: !!mobile });
    };

    const screenshot = async function (name) {
      const result = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(path.join(SHOTS, name), Buffer.from(result.data, 'base64'));
      console.log('  shot ' + name);
    };

    const click = async function (selector) {
      const result = await evaluate(cdp, '(() => { const el = document.querySelector(' + JSON.stringify(selector) + '); if (!el) return "MISSING"; el.click(); return "OK"; })()');
      if (result !== 'OK') throw new Error('点击失败，元素不存在：' + selector);
      await sleep(80);
    };

    const touchClick = async function (selector) {
      const point = await evaluate(cdp, '(() => { const el = document.querySelector(' + JSON.stringify(selector) + '); if (!el) return null; el.scrollIntoView({block:"center",behavior:"instant"}); const r = el.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2}; })()');
      if (!point) throw new Error('触摸失败，元素不存在：' + selector);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: point.x, y: point.y }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await sleep(100);
    };

    const savedState = async function () {
      return evaluate(cdp, '(() => { try { return JSON.parse(localStorage.getItem("lzs_save_v1")).state; } catch (e) { return null; } })()');
    };

    await setViewport(1280, 900, false);
    await cdp.send('Page.reload', { ignoreCache: true });
    await waitFor(function () {
      return evaluate(cdp, 'document.readyState === "complete" && !!document.getElementById("btn-start")');
    }, 15000);
    await evaluate(cdp, 'localStorage.clear(); location.reload(); "reloading"');
    await sleep(500);
    await waitFor(function () {
      return evaluate(cdp, 'document.readyState === "complete" && !!document.getElementById("btn-start")');
    }, 15000);

    console.log('\n[1] 开场与视觉');
    assert(await evaluate(cdp, '!document.getElementById("screen-intro").hidden'), '开场页可见');
    assert(await evaluate(cdp, 'document.getElementById("btn-continue").hidden'), '无存档时继续按钮隐藏');
    assert((await evaluate(cdp, 'document.querySelector(".game-title").textContent')).trim() === '小泽模拟器', '标题正确');
    await screenshot('01-intro-desktop.png');

    console.log('\n[2] 开局与 AP');
    await click('#btn-start');
    await waitFor(function () {
      return evaluate(cdp, '!document.getElementById("screen-game").hidden && !!document.querySelector(".choice-card")');
    }, 8000);
    let state = await savedState();
    assert(state && state.round === 1, '开局第 1 回合');
    assert(state && state.ap === 3, '开局 3 AP');
    assert(state && state.stats.gov === 54 && state.stats.safety === 58, '初始国家状态正确');
    assert((await evaluate(cdp, 'document.getElementById("ap-value").textContent')) === '3', 'AP 显示为 3');
    assert((await evaluate(cdp, 'document.querySelectorAll(".choice-card").length')) === 4, '事件有 4 个选项');
    assert(await evaluate(cdp, 'document.querySelectorAll("#screen-game .epistemics > .epistemic-block").length === 2'), '游玩期只有当时已知与无法确认两栏');
    assert(await evaluate(cdp, '!document.getElementById("screen-game").textContent.includes("事后记录") && !document.getElementById("screen-game").textContent.includes("后来才确认")'), '游玩期没有历史结果泄漏');
    assert(await evaluate(cdp, 'document.querySelectorAll(".intro-portrait img").length === 2 && Array.from(document.querySelectorAll(".intro-portrait img")).every(function(img){ return img.complete && img.naturalWidth > 0; })'), '两幅原创 SVG 肖像离线加载成功');
    await screenshot('02-game-desktop.png');

    console.log('\n[3] 签发、AP 扣除与防重复');
    const beforeIssue = await savedState();
    const firstChoice = await evaluate(cdp, '(() => { const c = document.querySelector(".choice-card:not(.is-executed):not(.is-locked)"); return c ? c.getAttribute("data-choice-id") : null; })()');
    const firstChoiceAp = await evaluate(cdp, '(() => { const c = document.querySelector(".choice-card[data-choice-id=\\"' + firstChoice + '\\"] .choice-ap"); return parseInt(c.textContent, 10); })()');
    await click('.choice-card[data-choice-id="' + firstChoice + '"]');
    assert(await evaluate(cdp, 'document.querySelector(".choice-card.is-selected") !== null'), '点击后决策被选中');
    assert(!(await evaluate(cdp, 'document.getElementById("btn-issue").disabled')), '选中后可签发');
    await click('#btn-issue');
    state = await savedState();
    assert(state.ap === beforeIssue.ap - firstChoiceAp, 'AP 按选项成本扣除', 'before=' + beforeIssue.ap + ' cost=' + firstChoiceAp + ' after=' + state.ap);
    assert(state.executed.length === 1 && state.executed[0] === firstChoice, '已签发列表记录正确');
    assert(await evaluate(cdp, 'document.querySelector(".choice-card.is-executed .choice-stamp") !== null'), '已签发卡显示印章');
    assert((await evaluate(cdp, 'document.querySelectorAll(".log-entry").length')) > 0, '行动日志出现记录');
    const duplicate = await evaluate(cdp, '(() => { const s = JSON.parse(localStorage.getItem("lzs_save_v1")).state; return window.LZS.applyChoice(s, ' + JSON.stringify(firstChoice) + '); })()');
    assert(duplicate && duplicate.ok === false && duplicate.code === 'DUPLICATE', '重复签发被拒绝（DUPLICATE）');
    await screenshot('03-game-issued.png');

    console.log('\n[4] 第一夜结算与延迟后果');
    const beforeEnd = await savedState();
    const event1 = await evaluate(cdp, 'window.LZS.getEvent(JSON.parse(localStorage.getItem("lzs_save_v1")).state)');
    await click('#btn-end-round');
    await waitFor(function () {
      return evaluate(cdp, '!!document.querySelector("#modal-root .modal-card")');
    }, 5000);
    state = await savedState();
    assert(state.pressure === beforeEnd.pressure + event1.pressureRise, '战争压力按事件上升');
    assert(state.phase === 'interlude', '结算后进入夜间态势');
    assert(state.pending.length >= 1, '已产生延迟后果');
    assert(await evaluate(cdp, 'document.querySelector("#modal-root .modal-title").textContent.includes("夜")'), '夜间结算模态可见');
    await screenshot('04-interlude-desktop.png');
    await click('#modal-root .modal-actions .btn-primary');
    await waitFor(function () {
      return evaluate(cdp, '!document.querySelector("#modal-root .modal-card") && document.getElementById("btn-end-round")');
    }, 5000);
    state = await savedState();
    assert(state.phase === 'briefing' && state.round === 2 && state.ap === 3, '进入第 2 回合并重置 AP');
    assert(await evaluate(cdp, 'document.getElementById("game-date").textContent.includes("2月25日")'), '日期推进到 2 月 25 日');

    console.log('\n[5] 互斥命令与完整一局（固定策略）');
    await click('.choice-card[data-choice-id="stay"]');
    await click('#btn-issue');
    const conflictBefore = await savedState();
    assert(await evaluate(cdp, 'document.querySelector(".choice-card[data-choice-id=\\"relocate\\"]").classList.contains("is-conflict")'), 'UI 将转移命令标为互斥');
    assert(await evaluate(cdp, 'document.querySelector(".choice-card[data-choice-id=\\"relocate\\"] .is-conflict-note").textContent.includes("留在班科夫街")'), '互斥说明指出冲突命令与原因');
    const conflictResult = await evaluate(cdp, 'window.LZS.applyChoice(JSON.parse(localStorage.getItem("lzs_save_v1")).state, "relocate")');
    const conflictAfter = await savedState();
    assert(conflictResult.code === 'CONFLICT' && conflictAfter.ap === conflictBefore.ap && conflictAfter.choices.length === conflictBefore.choices.length, '互斥命令不扣 AP、不重复写日志');
    await cdp.send('Page.reload', { ignoreCache: true });
    await sleep(350);
    await waitFor(function () { return evaluate(cdp, 'document.readyState === "complete" && !!document.getElementById("btn-continue")'); }, 10000);
    await click('#btn-continue');
    await waitFor(function () { return evaluate(cdp, '!!document.querySelector(".choice-card[data-choice-id=\\"relocate\\"]")'); }, 5000);
    assert(await evaluate(cdp, 'document.querySelector(".choice-card[data-choice-id=\\"relocate\\"]").classList.contains("is-conflict")'), '刷新恢复后互斥状态保持');
    let sawDelayedPressureSummary = false;
    for (let round = 2; round <= 7; round += 1) {
      state = await savedState();
      if (state.phase === 'ending') break;
      const desired = SEQUENCE[round] || [];
      for (const choiceId of desired) {
        const can = await evaluate(cdp, '(() => { const c = document.querySelector(".choice-card[data-choice-id=\\"' + choiceId + '\\"]"); return !!c && !c.classList.contains("is-executed") && !c.classList.contains("is-locked"); })()');
        if (!can) {
          console.log('  skip ' + choiceId + '（当前 AP 或状态不可用）');
          continue;
        }
        await click('.choice-card[data-choice-id="' + choiceId + '"]');
        await click('#btn-issue');
        state = await savedState();
        if (state.phase === 'ending') break;
      }
      if (state.phase === 'ending') break;
      assert(await evaluate(cdp, '!document.getElementById("btn-end-round").disabled'), '第 ' + round + ' 回合可结束');
      await click('#btn-end-round');
      const ended = await waitFor(async function () {
        const s = await savedState();
        if (s.phase === 'ending') return 'ending';
        if (s.phase === 'interlude') return 'interlude';
        return false;
      }, 5000);
      if (ended === 'interlude') {
        await waitFor(function () {
          return evaluate(cdp, '!!document.querySelector("#modal-root .modal-card")');
        }, 5000);
        const pressureView = await evaluate(cdp, `(() => {
          const s = JSON.parse(localStorage.getItem('lzs_save_v1')).state;
          return {
            pressure: s.interlude.pressure,
            text: document.querySelector('.interlude-pressure').textContent
          };
        })()`);
        assert(pressureView.pressure.after - pressureView.pressure.before === pressureView.pressure.rise + pressureView.pressure.delayed,
          '第 ' + round + ' 夜压力摘要满足 before + rise + delayed = after');
        assert(pressureView.text.includes('战场 +' + pressureView.pressure.rise), '第 ' + round + ' 夜显示战场压力上升');
        if (pressureView.pressure.delayed) {
          const delayedText = pressureView.pressure.delayed > 0 ? '+' + pressureView.pressure.delayed : String(pressureView.pressure.delayed);
          assert(pressureView.text.includes('延迟 ' + delayedText), '第 ' + round + ' 夜显示延迟压力');
          sawDelayedPressureSummary = true;
        }
        if (round === 2) await screenshot('05-interlude-round2.png');
        await click('#modal-root .modal-actions .btn-primary');
        await waitFor(function () {
          return evaluate(cdp, '!document.querySelector("#modal-root .modal-card")');
        }, 5000);
      }
      state = await savedState();
      if (round < 7) {
        assert(state.round === round + 1, '第 ' + round + ' 回合推进到第 ' + (round + 1) + ' 回合');
        assert(state.ap === 3, '第 ' + round + ' 回合后 AP 重置');
      }
    }

    assert(sawDelayedPressureSummary, '至少一夜展示延迟压力，且与总压力变化一致');

    console.log('\n[6] 结局页');
    await waitFor(function () {
      return evaluate(cdp, '!document.getElementById("screen-ending").hidden');
    }, 5000);
    state = await savedState();
    assert(state.phase === 'ending', '第 7 回合后进入结局');
    assert(!!state.ending && !!state.ending.title, '结局数据存在');
    assert(await evaluate(cdp, 'document.querySelector(".ending-title") !== null'), '结局标题可见');
    assert(await evaluate(cdp, 'document.querySelectorAll(".decision-timeline li").length') > 0, '关键决策时间线可见');
    assert(await evaluate(cdp, 'document.querySelectorAll(".ending-stat").length') === 7, '结局展示 7 项最终状态');
    assert(await evaluate(cdp, 'document.querySelector(".ending-reasons li") !== null'), '判定依据可见');
    assert(await evaluate(cdp, '!!document.querySelector(".history-review")'), '结局后出现独立历史复盘');
    assert(await evaluate(cdp, 'document.querySelectorAll(".history-day").length === 7'), '复盘覆盖 2 月 24 日至 3 月 2 日');
    assert(await evaluate(cdp, 'document.querySelectorAll(".history-table tbody tr").length === 6'), '玩家路线与历史按 6 个维度对照');
    assert(await evaluate(cdp, 'document.querySelectorAll(".history-sources a").length >= 6 && Array.from(document.querySelectorAll(".history-sources a")).every(function(a){return a.href.startsWith("https://");})'), '至少 6 条可点击可靠来源');
    assert(await evaluate(cdp, 'document.querySelector(".history-reflection").textContent.includes("不等于")'), '复盘包含克制的历史反思');
    console.log('  结局：' + await evaluate(cdp, 'document.querySelector(".ending-title").textContent') + ' / ' + await evaluate(cdp, 'document.querySelector(".ending-kicker").textContent'));
    await screenshot('06-ending-desktop.png');

    console.log('\n[6b] 四种手机视口的结局与复盘');
    const endingViewports = [[320, 700], [360, 800], [390, 844], [430, 932]];
    for (const size of endingViewports) {
      await setViewport(size[0], size[1], true);
      await evaluate(cdp, 'window.scrollTo(0,0)');
      await sleep(100);
      const layout = await evaluate(cdp, '(() => ({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth,days:document.querySelectorAll(".history-day").length,links:document.querySelectorAll(".history-sources a").length}))()');
      assert(layout.sw <= layout.cw + 2 && layout.days === 7 && layout.links >= 6, size[0] + 'px 结局与复盘无横向溢出', JSON.stringify(layout));
      if (size[0] === 320) await screenshot('09-ending-320.png');
    }
    await setViewport(1280, 900, false);

    console.log('\n[7] 存档与结局恢复');
    await click('#btn-back-cover');
    await waitFor(function () {
      return evaluate(cdp, '!document.getElementById("screen-intro").hidden');
    }, 5000);
    assert(!(await evaluate(cdp, 'document.getElementById("btn-continue").hidden')), '封面显示继续按钮');
    assert((await evaluate(cdp, 'document.getElementById("btn-continue").textContent')).includes('结局'), '继续按钮提示查看结局');
    await click('#btn-continue');
    await waitFor(function () {
      return evaluate(cdp, '!document.getElementById("screen-ending").hidden');
    }, 5000);
    assert((await evaluate(cdp, 'document.querySelector(".ending-title").textContent')).length > 0, '刷新后结局恢复');

    console.log('\n[8] 新局中途存档与刷新恢复');
    await click('#btn-back-cover');
    await click('#btn-start');
    await waitFor(function () {
      return evaluate(cdp, '!!document.querySelector("#modal-root .modal-card")');
    }, 5000);
    await click('#modal-root .modal-actions .btn-primary');
    await waitFor(function () {
      return evaluate(cdp, '!document.getElementById("screen-game").hidden && !!document.querySelector(".choice-card")');
    }, 5000);
    const choiceId = await evaluate(cdp, 'document.querySelector(".choice-card:not(.is-locked)").getAttribute("data-choice-id")');
    await click('.choice-card[data-choice-id="' + choiceId + '"]');
    await click('#btn-issue');
    const mid = await savedState();
    assert(mid.round === 1 && mid.ap < 3, '新局已签发决策');
    await cdp.send('Page.reload', { ignoreCache: true });
    await sleep(400);
    await waitFor(function () {
      return evaluate(cdp, 'document.readyState === "complete" && !!document.getElementById("btn-start")');
    }, 15000);
    assert(!(await evaluate(cdp, 'document.getElementById("btn-continue").hidden')), '刷新后封面显示继续');
    await click('#btn-continue');
    await waitFor(function () {
      return evaluate(cdp, '!document.getElementById("screen-game").hidden');
    }, 5000);
    const restored = await savedState();
    assert(restored.round === mid.round && restored.ap === mid.ap && restored.executed.length === mid.executed.length, '刷新后进度恢复（回合/AP/决策）');
    assert((await evaluate(cdp, 'document.querySelectorAll(".choice-card.is-executed").length')) === mid.executed.length, '刷新后已签发卡恢复');

    console.log('\n[9] 320 / 360 / 390 / 430 手机端与真实触摸事件');
    const mobileViewports = [[320, 700], [360, 800], [390, 844], [430, 932]];
    for (const size of mobileViewports) {
      await setViewport(size[0], size[1], true);
      await cdp.send('Page.reload', { ignoreCache: true });
      await sleep(350);
      await waitFor(function () {
        return evaluate(cdp, 'document.readyState === "complete" && !!document.getElementById("btn-start")');
      }, 15000);
      const introLayout = await evaluate(cdp, '({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth})');
      assert(introLayout.sw <= introLayout.cw + 2, size[0] + 'px 开场无横向溢出', JSON.stringify(introLayout));
      if (size[0] === 390) await screenshot('07-intro-mobile.png');
      await touchClick('#btn-continue');
      await waitFor(function () { return evaluate(cdp, '!document.getElementById("screen-game").hidden'); }, 5000);
      const mobile = await evaluate(cdp, `(() => {
        const bar = document.querySelector('.order-bar').getBoundingClientRect();
        const cards = Array.from(document.querySelectorAll('.choice-card')).map(function(el){const r=el.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width};});
        return {
          sw: document.documentElement.scrollWidth,
          cw: document.documentElement.clientWidth,
          vitals: document.querySelectorAll('.mobile-vitals .vital').length,
          display: getComputedStyle(document.querySelector('.mobile-vitals')).display,
          cardsFit: cards.every(function(r){return r.left >= -1 && r.right <= innerWidth + 1 && r.width > 0;}),
          barVisible: bar.width <= innerWidth + 1 && bar.bottom <= innerHeight + 1,
          bar: {top:bar.top,bottom:bar.bottom,width:bar.width,height:bar.height,innerHeight:innerHeight,visualHeight:visualViewport.height}
        };
      })()`);
      assert(mobile.sw <= mobile.cw + 2 && mobile.cardsFit && mobile.barVisible, size[0] + 'px 游戏、选项和底栏无横向溢出', JSON.stringify(mobile));
      assert(mobile.vitals === 7 && mobile.display === 'grid', size[0] + 'px 七项状态以网格完整显示');
      await evaluate(cdp, 'window.scrollTo(0,document.documentElement.scrollHeight)');
      await sleep(100);
      const clearance = await evaluate(cdp, `(() => {
        const cards = document.querySelectorAll('.choice-card');
        const last = cards[cards.length - 1].getBoundingClientRect();
        const bar = document.querySelector('.order-bar').getBoundingClientRect();
        return {lastBottom:last.bottom,barTop:bar.top,height:innerHeight};
      })()`);
      assert(clearance.lastBottom <= clearance.barTop + 2, size[0] + 'px 固定底栏不遮挡最后一个选项', JSON.stringify(clearance));
      await touchClick('#btn-log');
      await waitFor(function () { return evaluate(cdp, '!!document.querySelector("#modal-root .modal-card")'); }, 5000);
      const modal = await evaluate(cdp, '(() => {const r=document.querySelector("#modal-root .modal-card").getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,w:innerWidth,h:innerHeight};})()');
      assert(modal.left >= -1 && modal.right <= modal.w + 1 && modal.top >= -1 && modal.bottom <= modal.h + 1, size[0] + 'px 日志弹窗完整可见', JSON.stringify(modal));
      await touchClick('#modal-root .modal-actions .btn');
      await waitFor(function () { return evaluate(cdp, '!document.querySelector("#modal-root .modal-card")'); }, 5000);
      if (size[0] === 390) {
        await evaluate(cdp, 'window.scrollTo(0,0)');
        await screenshot('08-game-mobile.png');
      }
    }
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    assert(await evaluate(cdp, 'window.matchMedia("(prefers-reduced-motion: reduce)").matches && getComputedStyle(document.querySelector(".btn")).animationDuration === "1e-05s"'), '减少动态效果模式生效');

    console.log('\n[10] 汇总');
    console.log('  控制台错误：' + consoleErrors.length);
    if (consoleErrors.length) console.log('  ' + consoleErrors.join('\n  '));
    console.log('  控制台警告：' + consoleWarnings.length);
    if (consoleWarnings.length) console.log('  ' + consoleWarnings.join('\n  '));
    assert(consoleErrors.length === 0, '无控制台错误');
    assert(failures.length === 0, '全部断言通过');
  } finally {
    if (cdp) {
      try { cdp.ws.close(); } catch (error) { /* ignore */ }
    }
    try { edge.kill(); } catch (error) { /* ignore */ }
  }

  if (failures.length) {
    console.error('\n失败项：\n- ' + failures.join('\n- '));
    process.exitCode = 1;
  } else {
    console.log('\n浏览器冒烟测试通过。');
  }
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression: expression,
    returnByValue: true,
    awaitPromise: true,
    userGesture: true
  });
  if (result.exceptionDetails) {
    const details = result.exceptionDetails;
    throw new Error(details.exception && details.exception.description ? details.exception.description : details.text);
  }
  return result.result.value;
}

main().catch(function (error) {
  console.error(error);
  try {
    process.exitCode = 1;
  } catch (ignored) { /* ignore */ }
});
