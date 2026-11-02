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
const PAGE_URL = process.env.PAGE_URL || pathToFileURL(path.join(ROOT, 'index.html')).href;

const SEQUENCE = {
  1: ['aid_call', 'address'],
  2: ['stay', 'record'],
  3: ['block_runway'],
  4: ['curfew', 'arm_citizens'],
  5: ['delegate'],
  6: ['talks'],
  7: ['logistics', 'evacuate']
};

const failures = [];
const consoleErrors = [];
const consoleWarnings = [];
const externalRequests = [];

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
  cdp.on('Network.requestWillBeSent', function (params) {
    const url = params.request && params.request.url || '';
    if (/^https?:/i.test(url)) externalRequests.push(url);
  });

  await cdp.send('Network.enable');
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
    const audioRequests = [];
    cdp.on('Network.requestWillBeSent', function (event) {
      if (/\.ogg(?:$|\?)/.test(event.request.url)) audioRequests.push(event.request.url);
    });
    await cdp.send('Network.enable');
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
      await sleep(380);
      const result = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(path.join(SHOTS, name), Buffer.from(result.data, 'base64'));
      console.log('  shot ' + name);
    };

    const click = async function (selector) {
      const result = await evaluate(cdp, '(() => { const el = document.querySelector(' + JSON.stringify(selector) + '); if (!el) return "MISSING"; el.click(); return "OK"; })()');
      if (result !== 'OK') throw new Error('点击失败，元素不存在：' + selector);
      await sleep(80);
    };

    const authorizeAll = async function () {
      for (let index = 0; index < 5; index += 1) {
        const hasIssued = await evaluate(cdp, '!!document.querySelector("#command-panel [data-authorize]")');
        if (!hasIssued) return;
        await click('#command-panel [data-authorize]');
      }
    };

    const keyPress = async function (key, code, virtualKey) {
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: key, code: code, windowsVirtualKeyCode: virtualKey });
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: key, code: code, windowsVirtualKeyCode: virtualKey });
      await sleep(80);
    };

    const touchClick = async function (selector) {
      const found = await evaluate(cdp, '(() => { const el = document.querySelector(' + JSON.stringify(selector) + '); if (!el) return false; el.scrollIntoView({block:"center",behavior:"instant"}); return true; })()');
      if (!found) throw new Error('触摸失败，元素不存在：' + selector);
      await sleep(180);
      const point = await evaluate(cdp, '(() => { const r = document.querySelector(' + JSON.stringify(selector) + ').getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2}; })()');
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: point.x, y: point.y }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await sleep(220);
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
    assert(await evaluate(cdp, 'document.querySelectorAll("#screen-game .epistemic-grid > .epistemic-block").length === 2'), '游玩期只有当时已知与无法确认两栏');
    assert(await evaluate(cdp, '!document.getElementById("screen-game").textContent.includes("事后记录") && !document.getElementById("screen-game").textContent.includes("后来才确认")'), '游玩期没有历史结果泄漏');
    assert(await evaluate(cdp, 'document.querySelectorAll(".intro-portrait img").length === 2 && Array.from(document.querySelectorAll(".intro-portrait img")).every(function(img){ return img.complete && img.naturalWidth > 0; })'), '两幅原创 SVG 肖像离线加载成功');
    await screenshot('02-game-desktop.png');

    console.log('\n[2b] 桌面首屏与七事件视觉');
    for (const size of [[1280, 800], [1440, 900]]) {
      await setViewport(size[0], size[1], false);
      await evaluate(cdp, 'window.scrollTo(0,0)');
      await sleep(80);
      const firstScreen = await evaluate(cdp, `(() => {
        const barTop = document.querySelector('.order-bar').getBoundingClientRect().top;
        const cards = Array.from(document.querySelectorAll('.choice-card')).slice(0,2).map(function(card){
          const title = card.querySelector('.choice-title').getBoundingClientRect();
          const summary = card.querySelector('.choice-summary').getBoundingClientRect();
          return {titleBottom:title.bottom,summaryBottom:summary.bottom};
        });
        const scene = document.querySelector('.scene img');
        return {barTop:barTop,cards:cards,sceneLoaded:scene.complete && scene.naturalWidth > 0,eventVisible:document.querySelector('.dossier-title').getBoundingClientRect().top >= 0,headerBottom:document.querySelector('.game-top').getBoundingClientRect().bottom,sceneBottom:document.querySelector('.scene').getBoundingClientRect().bottom,briefingBottom:document.querySelector('.briefing-paper').getBoundingClientRect().bottom,choicesTop:document.getElementById('choices-panel').getBoundingClientRect().top};
      })()`);
      assert(firstScreen.sceneLoaded && firstScreen.eventVisible, size[0] + '×' + size[1] + ' 事件主体可见且本地 SVG 加载');
      assert(firstScreen.cards.length === 2 && firstScreen.cards.every(function(card){return card.summaryBottom <= firstScreen.barTop - 4;}), size[0] + '×' + size[1] + ' 首屏显示两项决策标题与摘要', JSON.stringify(firstScreen));
      if (size[0] === 1280) await screenshot('02b-game-1280x800.png');
    }
    await setViewport(1280, 900, false);

    console.log('\n[2c] 键盘与模态焦点');
    await evaluate(cdp, 'document.querySelector(\'[data-choice-id="address"]\').focus()');
    await keyPress('Enter', 'Enter', 13);
    assert(await evaluate(cdp, 'document.querySelector(\'[data-choice-id="address"]\').classList.contains("is-selected") && document.activeElement.dataset.choiceId === "address"'), 'Enter 选择决策并保留焦点');
    await keyPress(' ', 'Space', 32);
    assert(await evaluate(cdp, '!document.querySelector(\'[data-choice-id="address"]\').classList.contains("is-selected")'), 'Space 取消选择');
    await evaluate(cdp, 'document.getElementById("btn-help").focus()');
    await click('#btn-help');
    await waitFor(function () { return evaluate(cdp, '!!document.querySelector("#modal-root .modal-card")'); }, 5000);
    assert(await evaluate(cdp, 'document.querySelector("#modal-root").contains(document.activeElement)'), '模态打开后焦点进入弹窗');
    await keyPress('Escape', 'Escape', 27);
    await waitFor(function () { return evaluate(cdp, '!document.querySelector("#modal-root .modal-card")'); }, 5000);
    assert(await evaluate(cdp, 'document.activeElement.id === "btn-help"'), 'Escape 关闭弹窗并恢复焦点');

    console.log('\n[2d] 本地音频、持久化与懒加载');
    assert(await evaluate(cdp, '(() => { const s=LZS_AUDIO.getSettings(); return !s.music && !s.sfx; })()') && audioRequests.length === 0, '默认音乐与音效关闭，开局不加载音频');
    await click('#btn-audio');
    await waitFor(function () { return evaluate(cdp, '!!document.querySelector("#audio-music")'); }, 5000);
    assert(await evaluate(cdp, 'Array.from(document.querySelectorAll(".switch-control,.volume-slider")).every(function(el){return el.getBoundingClientRect().height >= 44;})'), '声音开关与音量滑块至少 44px');
    await click('#audio-music');
    await click('#audio-sfx');
    await evaluate(cdp, '(() => { const m=document.querySelector("#audio-music-volume"); m.value=37; m.dispatchEvent(new Event("input",{bubbles:true})); const s=document.querySelector("#audio-sfx-volume"); s.value=42; s.dispatchEvent(new Event("input",{bubbles:true})); })()');
    await sleep(250);
    const audioSettings = await evaluate(cdp, '({live:LZS_AUDIO.getSettings(),stored:JSON.parse(localStorage.getItem("lzs_audio_v1")),theme:LZS_AUDIO.getTheme()})');
    assert(audioSettings.live.music && audioSettings.live.sfx && audioSettings.live.musicVolume === 0.37 && audioSettings.live.sfxVolume === 0.42, '音乐、音效与独立音量设置生效');
    assert(audioSettings.stored.music && audioSettings.stored.sfx && audioSettings.stored.musicVolume === 0.37 && audioSettings.stored.sfxVolume === 0.42, '音频设置写入独立 lzs_audio_v1');
    assert(audioSettings.theme === 'day' && audioRequests.some(function(url){return /day\.ogg(?:$|\?)/.test(url);}), '用户开启后才懒加载日间音乐');
    await screenshot('09-audio-settings.png');
    await click('#modal-root .modal-actions .btn-primary');

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
    await click('#btn-save'); await click('#btn-save'); await click('#btn-save');
    assert(await evaluate(cdp, 'document.querySelectorAll("#toast-root .toast").length === 1'), '连续通知只保留一条 Toast，不叠加遮挡');
    await screenshot('03-game-issued.png');

    console.log('\n[4] 第一夜结算与延迟后果');
    const beforeEnd = await savedState();
    const event1 = await evaluate(cdp, 'window.LZS.getEvent(JSON.parse(localStorage.getItem("lzs_save_v1")).state)');
    const firstChoiceDef = await evaluate(cdp, 'window.LZS.getChoice(window.LZS.getEvent(JSON.parse(localStorage.getItem("lzs_save_v1")).state), ' + JSON.stringify(firstChoice) + ')');
    await authorizeAll();
    await waitFor(function () { return evaluate(cdp, '!document.getElementById("btn-end-round").disabled'); }, 5000);
    await click('#btn-end-round');
    await waitFor(function () {
      return evaluate(cdp, '!!document.querySelector("#modal-root .modal-card")');
    }, 5000);
    state = await savedState();
    assert(state.pressure === beforeEnd.pressure + event1.pressureRise + (firstChoiceDef.effects.pressure || 0), '战争压力按事件与命令成本上升');
    assert(state.phase === 'interlude', '结算后进入夜间态势');
    await sleep(1000);
    assert(await evaluate(cdp, 'LZS_AUDIO.getTheme() === "night"') && audioRequests.some(function(url){return /night\.ogg(?:$|\?)/.test(url);}), '夜间平滑切换并加载夜间主题');
    assert(state.pending.length >= 1, '已产生延迟后果');
    assert(await evaluate(cdp, 'document.querySelector("#modal-root .modal-title").textContent.includes("夜")'), '夜间结算模态可见');
    await screenshot('04-interlude-desktop.png');
    await click('#modal-root .modal-actions .btn-primary');
    await waitFor(function () {
      return evaluate(cdp, '!document.querySelector("#modal-root .modal-card") && document.getElementById("btn-end-round")');
    }, 5000);
    state = await savedState();
    assert(state.phase === 'briefing' && state.round === 2 && state.ap === 3, '进入第 2 回合并重置 AP');
    assert(await evaluate(cdp, 'LZS_AUDIO.getTheme() === "day"'), '夜间确认后恢复日间主题');
    assert(await evaluate(cdp, 'document.getElementById("game-date").textContent.includes("2月25日")'), '日期推进到 2 月 25 日');

    console.log('\n[5] 互斥命令与完整一局（固定策略）');
    await click('.choice-card[data-choice-id="stay"]');
    await click('#btn-issue');
    await authorizeAll();
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
    let sawDelayedEffect = false;
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
      await authorizeAll();
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
            delayedCount: (s.interlude.delayed || []).length,
            text: document.querySelector('.interlude-pressure').textContent
          };
        })()`);
        if (pressureView.delayedCount) sawDelayedEffect = true;
        assert(pressureView.pressure.after - pressureView.pressure.before === pressureView.pressure.rise + pressureView.pressure.delayed,
          '第 ' + round + ' 夜压力摘要满足 before + rise + delayed = after');
        assert(pressureView.text.includes('战场 +' + pressureView.pressure.rise), '第 ' + round + ' 夜显示战场压力上升');
        if (pressureView.pressure.delayed) {
          const delayedText = pressureView.pressure.delayed > 0 ? '+' + pressureView.pressure.delayed : String(pressureView.pressure.delayed);
          assert(pressureView.text.includes('延迟 ' + delayedText), '第 ' + round + ' 夜显示延迟压力');
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

    assert(sawDelayedEffect, '至少一夜展示来自命令或决策的延迟后果');

    console.log('\n[6] 结局页');
    await waitFor(function () {
      return evaluate(cdp, '!document.getElementById("screen-ending").hidden');
    }, 5000);
    state = await savedState();
    assert(state.phase === 'ending', '第 7 回合后进入结局');
    assert(!!state.ending && !!state.ending.title, '结局数据存在');
    assert(await evaluate(cdp, 'LZS_AUDIO.getTheme() === "ending"'), '结局切换结局主题变奏');
    assert(await evaluate(cdp, 'document.querySelector(".ending-title") !== null'), '结局标题可见');
    assert(await evaluate(cdp, 'document.querySelectorAll(".decision-timeline li").length') > 0, '关键决策时间线可见');
    assert(await evaluate(cdp, 'document.querySelectorAll(".ending-stat").length') === 7, '结局展示 7 项最终状态');
    assert(await evaluate(cdp, 'document.querySelector(".ending-reasons li") !== null'), '判定依据可见');
    assert(await evaluate(cdp, '!document.querySelector("#screen-ending > .history-review") && !!document.getElementById("btn-history")'), '历史复盘不再直接接在结局正文后');
    console.log('  结局：' + await evaluate(cdp, 'document.querySelector(".ending-title").textContent') + ' / ' + await evaluate(cdp, 'document.querySelector(".ending-kicker").textContent'));
    await screenshot('06-ending-desktop.png');
    await click('#btn-history');
    await waitFor(function () { return evaluate(cdp, '!!document.querySelector("#modal-root .history-review")'); }, 5000);
    assert(await evaluate(cdp, '!!document.querySelector("#modal-root .simulation-review")'), '独立复盘披露完整模拟参数');
    assert(await evaluate(cdp, 'document.querySelectorAll(".history-day").length === 7'), '复盘覆盖 2 月 24 日至 3 月 2 日');
    assert(await evaluate(cdp, 'document.querySelectorAll(".history-table tbody tr").length === 6'), '玩家路线与历史按 6 个维度对照');
    assert(await evaluate(cdp, 'document.querySelectorAll(".history-sources a").length >= 6 && Array.from(document.querySelectorAll(".history-sources a")).every(function(a){return a.href.startsWith("https://");})'), '至少 6 条可点击可靠来源');
    assert(await evaluate(cdp, 'document.querySelector(".history-reflection").textContent.includes("不等于")'), '复盘包含克制的历史反思');
    await screenshot('06b-history-desktop.png');
    await click('#modal-root .modal-actions .btn-primary');
    await waitFor(function () { return evaluate(cdp, '!document.querySelector("#modal-root .modal-card")'); }, 5000);

    console.log('\n[6b] 四种手机视口的结局与复盘');
    const endingViewports = [[320, 700], [360, 800], [390, 844], [430, 932]];
    for (const size of endingViewports) {
      await setViewport(size[0], size[1], true);
      await evaluate(cdp, 'window.scrollTo(0,0)');
      await sleep(100);
      const layout = await evaluate(cdp, '(() => ({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth}))()');
      assert(layout.sw <= layout.cw + 2, size[0] + 'px 结局无横向溢出', JSON.stringify(layout));
      if (size[0] === 320) await screenshot('09-ending-320.png');
      await click('#btn-history');
      await waitFor(function () { return evaluate(cdp, '!!document.querySelector("#modal-root .history-review")'); }, 5000);
      const reviewLayout = await evaluate(cdp, '(() => ({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth,days:document.querySelectorAll(".history-day").length,links:document.querySelectorAll(".history-sources a").length}))()');
      assert(reviewLayout.sw <= reviewLayout.cw + 2 && reviewLayout.days === 7 && reviewLayout.links >= 6, size[0] + 'px 独立复盘完整且无页面横向溢出', JSON.stringify(reviewLayout));
      await click('#modal-root .modal-actions .btn-primary');
      await waitFor(function () { return evaluate(cdp, '!document.querySelector("#modal-root .modal-card")'); }, 5000);
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

    console.log('\n[8b] 七事件视觉与 29 项决策显示 / 选择');
    let displayedChoices = 0;
    for (let round = 1; round <= 7; round++) {
      await evaluate(cdp, '(() => {const g=LZS.createGame();g.round=' + round + ';return LZS.saveGame(g);})()');
      await cdp.send('Page.reload', { ignoreCache: true });
      await sleep(220);
      await waitFor(function () { return evaluate(cdp, 'document.readyState === "complete" && !!document.getElementById("btn-continue")'); }, 15000);
      await click('#btn-continue');
      await waitFor(function () { return evaluate(cdp, '!document.getElementById("screen-game").hidden'); }, 5000);
      await waitFor(function () { return evaluate(cdp, 'document.querySelector(".scene-picture img").complete && document.querySelector(".scene-picture img").naturalWidth > 0 && document.querySelector(".scene-map").complete && document.querySelector(".scene-map").naturalWidth > 0'); }, 5000);
      assert(await evaluate(cdp, 'document.querySelector(".scene-picture img").currentSrc.endsWith(".webp")'), 'R' + round + ' 独立 WebP 主视觉与抽象态势离线加载');
      const ids = await evaluate(cdp, 'Array.from(document.querySelectorAll(".choice-card")).map(function(card){return card.dataset.choiceId;})');
      for (const id of ids) {
        const selected = await evaluate(cdp, `(() => {const card=document.querySelector('[data-choice-id="${id}"]');card.click();const next=document.querySelector('[data-choice-id="${id}"]');return {selected:next.classList.contains('is-selected'),detail:!next.querySelector('.choice-detail').hidden,issue:!document.getElementById('btn-issue').disabled,forecast:next.querySelectorAll('.forecast-effect').length>0};})()`);
        assert(selected.selected && selected.detail && selected.issue && selected.forecast, 'R' + round + ' ' + id + ' 可选择并展开披露');
        await evaluate(cdp, 'document.querySelector(\'[data-choice-id="' + id + '"]\').click()');
        displayedChoices++;
      }
      if (round === 4) {
        await evaluate(cdp, 'window.scrollTo(0,0)');
        await screenshot('05b-event4-desktop.png');
      }
    }
    assert(displayedChoices === 29, '全部 29 项决策均显示并可选择', String(displayedChoices));
    await evaluate(cdp, 'LZS.saveGame(' + JSON.stringify(mid) + ')');

    console.log('\n[8c] 情报桌、命令生命周期与跨日阻塞');
    await setViewport(1280, 900, false);
    await evaluate(cdp, 'localStorage.removeItem("lzs_save_v1")');
    await cdp.send('Page.reload', { ignoreCache: true });
    await sleep(300);
    await waitFor(function () { return evaluate(cdp, 'document.readyState === "complete" && !!document.getElementById("btn-start")'); }, 15000);
    await click('#btn-start');
    await waitFor(function () { return evaluate(cdp, '!document.getElementById("screen-game").hidden && !!document.querySelector(".choice-card")'); }, 5000);
    const apBeforeIntel = (await savedState()).ap;
    await click('#btn-ops');
    await waitFor(function () { return evaluate(cdp, '!!document.querySelector("#modal-root #ops-body [data-intel-category]")'); }, 5000);
    assert((await evaluate(cdp, 'document.querySelectorAll("[data-ops-tab]").length')) === 4, '幕僚台有情报/命令/机构/沟通四个栏目');
    assert((await evaluate(cdp, 'document.querySelectorAll("[data-intel-category]").length')) === 6, '情报桌覆盖六个来源类别');
    const readState = await savedState();
    assert(readState.ap === apBeforeIntel, '阅读情报不扣 AP');
    assert(readState.intelState && Object.keys(readState.intelState).some(function (id) { return readState.intelState[id].read; }), '打开报告即记录已读');
    await click('[data-pin]');
    const pinned = await savedState();
    assert(Object.keys(pinned.intelState).some(function (id) { return pinned.intelState[id].pinned; }), '情报可以收藏且写入存档');
    await screenshot('11-ops-intel-desktop.png');
    await click('#modal-root .modal-actions .btn');

    await click('.choice-card[data-choice-id="mobilize"]');
    await click('#btn-issue');
    let controlled = await savedState();
    assert(controlled.ap === 1 && controlled.commands.some(function (command) { return command.choiceId === 'mobilize' && command.status === 'issued'; }), '2 AP 命令签发后进入待授权');
    await click('#command-panel [data-authorize]');
    controlled = await savedState();
    assert(controlled.commands.some(function (command) { return command.choiceId === 'mobilize' && command.status === 'executing'; }), '授权后命令进入执行机构');
    await cdp.send('Page.reload', { ignoreCache: true });
    await sleep(300);
    await waitFor(function () { return evaluate(cdp, 'document.readyState === "complete" && !!document.getElementById("btn-continue")'); }, 15000);
    await click('#btn-continue');
    await waitFor(function () { return evaluate(cdp, '!document.getElementById("screen-game").hidden'); }, 5000);
    controlled = await savedState();
    assert(controlled.commands.some(function (command) { return command.choiceId === 'mobilize' && command.status === 'executing'; }), '刷新后执行中命令与生命周期保持');
    await click('#btn-ops');
    await waitFor(function () { return evaluate(cdp, '!!document.querySelector("#modal-root [data-ops-tab=\\"commands\\"]")'); }, 5000);
    await click('[data-ops-tab="commands"]');
    assert(await evaluate(cdp, 'document.querySelector(".lifecycle") && document.querySelectorAll(".lifecycle span").length === 5 && document.body.textContent.includes("签署全国总动员令")'), '命令追踪展示五阶段与跨日命令');
    await screenshot('12-ops-command-desktop.png');
    await click('#modal-root .modal-actions .btn');
    await click('#btn-end-round');
    await waitFor(function () { return evaluate(cdp, '!!document.querySelector("#modal-root .modal-card")'); }, 5000);
    assert(await evaluate(cdp, 'document.querySelector("#modal-root .modal-card").textContent.includes("阻塞")'), '跨部门命令夜间因未召集而阻塞');
    await click('#modal-root .modal-actions .btn-primary');
    await waitFor(function () { return evaluate(cdp, '!document.querySelector("#modal-root .modal-card")'); }, 5000);
    const blocked = await savedState();
    assert(blocked.phase === 'briefing' && blocked.round === 2 && blocked.commands.some(function (command) { return command.choiceId === 'mobilize' && command.status === 'blocked'; }), '阻塞状态跨日保留');
    await click('#btn-ops');
    await waitFor(function () { return evaluate(cdp, '!!document.querySelector("#modal-root [data-ops-tab=\\"commands\\"]")'); }, 5000);
    await click('[data-ops-tab="commands"]');
    await screenshot('13-command-blocked-desktop.png');
    await click('#modal-root .modal-actions .btn');
    const pendingBeforeFollow = blocked.pending.length;
    const statsBeforeFollow = Object.assign({}, blocked.stats);
    assert(!(await evaluate(cdp, 'document.querySelector("#command-panel [data-followup]") ? document.querySelector("#command-panel [data-followup]").disabled : true')), '次日可对阻塞命令跟进');
    await click('#command-panel [data-followup]');
    const followed = await savedState();
    const followedCommand = followed.commands.filter(function (command) { return command.choiceId === 'mobilize'; })[0];
    assert(followed.ap === blocked.ap - 1 && followedCommand.status === 'awaiting_feedback', '跟进消耗 1 AP 并解除阻塞、开始结算');
    assert(followedCommand.effectsApplied && followed.pending.length > pendingBeforeFollow, '跟进只结算一次并登记延迟后果');
    assert(!Object.keys(statsBeforeFollow).every(function (key) { return followed.stats[key] === statsBeforeFollow[key]; }), '命令结算产生实际国家状态变化');
    await sleep(3800);
    await screenshot('14-command-intervened-desktop.png');

    await click('#btn-ops');
    await waitFor(function () { return evaluate(cdp, '!!document.querySelector("#modal-root [data-ops-tab=\\"intel\\"]")'); }, 5000);
    const beforeInquiry = (await savedState()).ap;
    const statsBeforeInquiry = Object.assign({}, (await savedState()).stats);
    const inquiryId = await evaluate(cdp, 'document.querySelector("[data-inquire]").getAttribute("data-inquire")');
    await click('[data-inquire]');
    const inquired = await savedState();
    assert(inquired.ap === beforeInquiry - 1, '追问情报消耗 1 AP');
    assert(inquired.intelState[inquiryId].inquired, '追问结果记录在情报台账');
    assert(Object.keys(statsBeforeInquiry).every(function (key) { return inquired.stats[key] === statsBeforeInquiry[key]; }), '追问不直接修改国家状态');
    await click('#modal-root .modal-actions .btn');
    assert(await evaluate(cdp, 'document.querySelectorAll("#toast-root .toast").length === 1'), '情报与命令操作不叠加通知');
    await evaluate(cdp, 'window.scrollTo(0,0)');
    await sleep(3800);
    await screenshot('15-day2-legacy-desktop.png');
    await evaluate(cdp, 'LZS.saveGame(' + JSON.stringify(mid) + ')');

    console.log('\n[8d] 三种处理方式的跨日差异');
    const reloadScenario = async function () {
      await cdp.send('Page.reload', { ignoreCache: true });
      await sleep(320);
      await waitFor(function () {
        return evaluate(cdp, 'document.readyState === "complete" && !!document.getElementById("btn-continue")');
      }, 15000);
      await click('#btn-continue');
      await waitFor(function () { return evaluate(cdp, '!document.getElementById("screen-game").hidden && !!document.querySelector(".choice-card")'); }, 5000);
    };

    const delaySetup = await evaluate(cdp, `(() => {
      const s = LZS.createGame();
      s.agencies.general_staff.workload = 3;
      const first = LZS.issueCommand(s, 'mobilize').command;
      LZS.authorizeCommand(s, first.id);
      LZS.endRound(s);
      LZS.continueFromInterlude(s);
      const second = LZS.issueCommand(s, 'stay').command;
      LZS.authorizeCommand(s, second.id);
      LZS.saveGame(s);
      return {round:s.round, first:first.status, second:second.status, ap:s.ap, deadline:first.deadlineRound};
    })()`);
    assert(delaySetup.round === 2 && delaySetup.first === 'blocked' && delaySetup.deadline === 2, '延误场景：第一夜阻塞并留下次日窗口');
    await reloadScenario();
    await screenshot('16-delay-day2-blocked.png');
    await click('#btn-end-round');
    await waitFor(function () { return evaluate(cdp, '!!document.querySelector("#modal-root .modal-card")'); }, 5000);
    assert(await evaluate(cdp, 'document.querySelector("#modal-root .modal-card").textContent.includes("失效")'), '接受延误在最后窗口后显示命令失效');
    await screenshot('17-delay-night-expired.png');
    await click('#modal-root .modal-actions .btn-primary');
    await waitFor(function () { return evaluate(cdp, '!document.querySelector("#modal-root .modal-card")'); }, 5000);
    const expired = await savedState();
    const expiredCommand = expired.commands.filter(function (command) { return command.choiceId === 'mobilize'; })[0];
    assert(expired.round === 3 && expiredCommand.status === 'expired' && !expiredCommand.effectsApplied, '延误路线：命令失效且不结算原效果');
    await screenshot('18-day3-accepted-delay.png');

    const delegateSetup = await evaluate(cdp, `(() => {
      const s = LZS.createGame();
      const first = LZS.issueCommand(s, 'mobilize').command;
      LZS.authorizeCommand(s, first.id);
      LZS.delegateCommand(s, first.id, 'office');
      LZS.endRound(s);
      LZS.continueFromInterlude(s);
      const second = LZS.issueCommand(s, 'record').command;
      LZS.authorizeCommand(s, second.id);
      LZS.saveGame(s);
      return {round:s.round, first:first.status, blocked:first.blockedCode, ap:s.ap, handoff:first.handoffRound};
    })()`);
    assert(delegateSetup.round === 2 && delegateSetup.first === 'blocked' && delegateSetup.blocked === 'HANDOFF', '委派场景：首日交接，次夜才可能执行');
    await reloadScenario();
    await screenshot('19-delegation-day2-handoff.png');
    await click('#btn-end-round');
    await waitFor(function () { return evaluate(cdp, '!!document.querySelector("#modal-root .modal-card")'); }, 5000);
    assert(await evaluate(cdp, 'document.querySelector("#modal-root .modal-card").textContent.includes("执行")'), '委派路线第二夜执行并产生反馈');
    await click('#modal-root .modal-actions .btn-primary');
    await waitFor(function () { return evaluate(cdp, '!document.querySelector("#modal-root .modal-card")'); }, 5000);
    const delegated = await savedState();
    const delegatedCommand = delegated.commands.filter(function (command) { return command.choiceId === 'mobilize'; })[0];
    assert(delegated.round === 3 && delegatedCommand.status === 'awaiting_feedback' && delegatedCommand.effectsApplied, '委派路线延后一夜但保留执行效果');
    await screenshot('20-day3-delegation-executed.png');

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
      if (size[0] === 390) {
        assert(await evaluate(cdp, 'LZS_AUDIO.getSettings().music && performance.getEntriesByType("resource").every(function(r){return !/\\.ogg(?:$|\\?)/.test(r.name);})'), '持久化开启音乐也不会在刷新后强制自动播放');
        await evaluate(cdp, 'window.scrollTo(0,0)');
        await screenshot('07-intro-mobile.png');
      }
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
      assert(mobile.vitals === 3 && mobile.display === 'grid', size[0] + 'px 紧凑状态与七项入口可见');
      const smallTargets = await evaluate(cdp, `Array.from(document.querySelectorAll('button,a[href],summary,[role="button"]')).filter(function(el){const r=el.getBoundingClientRect();const s=getComputedStyle(el);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'&&(r.width<44||r.height<44);}).map(function(el){const r=el.getBoundingClientRect();return {label:el.id||el.className||el.textContent.trim().slice(0,20),width:r.width,height:r.height};})`);
      assert(smallTargets.length === 0, size[0] + 'px 所有主要触控目标不小于 44px', JSON.stringify(smallTargets));
      await evaluate(cdp, 'document.querySelector(".state-details").open = true');
      assert(await evaluate(cdp, 'document.querySelector(".state-details").open && document.querySelectorAll(".stat-row").length === 7'), size[0] + 'px 可展开查看全部七项状态');
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

    console.log('\n[9b] AP 全部用于既有事务时仍可结束回合');
    await setViewport(1280, 900, false);
    await evaluate(cdp, '(() => { const state = LZS.createGame(); state.ap = 0; return LZS.saveGame(state); })()');
    await cdp.send('Page.reload', { ignoreCache: true });
    await waitFor(function () {
      return evaluate(cdp, 'document.readyState === "complete" && !!document.getElementById("btn-continue")');
    }, 15000);
    await click('#btn-continue');
    await waitFor(function () { return evaluate(cdp, '!document.getElementById("screen-game").hidden && !!document.querySelector(".choice-card")'); }, 5000);
    assert(await evaluate(cdp, 'document.getElementById("btn-end-round").disabled === false'), '未签发新命令但 AP 已耗尽时结束按钮可用');
    await click('#btn-end-round');
    await waitFor(function () { return evaluate(cdp, '!!document.querySelector("#modal-root .modal-card")'); }, 5000);
    assert(await evaluate(cdp, 'document.querySelector("#modal-root .modal-card").textContent.indexOf("夜间态势") !== -1'), 'AP 耗尽的回合同样进入夜间结算');
    await screenshot('21-ap-spent-desktop.png');

    console.log('\n[10] 离线试听页');
    await setViewport(1280, 900, false);
    const beforeListening = audioRequests.length;
    await cdp.send('Page.navigate', { url: pathToFileURL(path.join(ROOT, 'production', 'listening-room.html')).href });
    await waitFor(function () { return evaluate(cdp, 'document.readyState === "complete" && document.querySelectorAll("audio").length === 4'); }, 10000);
    assert(await evaluate(cdp, 'document.querySelectorAll("audio[preload=none]").length === 4 && document.querySelectorAll("[data-sound]").length === 10 && Array.from(document.querySelectorAll("audio")).every(function(a){return a.paused;})') && audioRequests.length === beforeListening, '试听页包含四段音乐与十类音效且不自动播放');
    await click('[data-sound="select"]');
    await waitFor(async function () { return audioRequests.length > beforeListening; }, 5000);
    assert(audioRequests.some(function(url){return /select\.ogg(?:$|\?)/.test(url);}), '试听页按需加载并播放本地 SFX');
    await screenshot('10-listening-room.png');

    console.log('\n[11] 汇总');
    console.log('  控制台错误：' + consoleErrors.length);
    if (consoleErrors.length) console.log('  ' + consoleErrors.join('\n  '));
    console.log('  控制台警告：' + consoleWarnings.length);
    if (consoleWarnings.length) console.log('  ' + consoleWarnings.join('\n  '));
    assert(consoleErrors.length === 0, '无控制台错误');
    assert(consoleWarnings.length === 0, '无控制台警告');
    assert(externalRequests.length === 0, '无不必要的外部网络请求', externalRequests.join('\n'));
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
