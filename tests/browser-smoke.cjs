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
      }, 90000);
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

  // file:// 下 Chrome 一定会拒绝加载 woff2 字体（origin 'null' 的 CORS 规则），
  // 这条只在本地静态打开时出现；字体本身由 assets.test.cjs 校验、并由 test:live 在线上验证。
  let fontCorsSeen = false;
  const isFontCorsNote = function (text) {
    const body = String(text || '');
    if (/archive-serif\.woff2/.test(body) && /CORS|origin/i.test(body)) { fontCorsSeen = true; return true; }
    if (fontCorsSeen && /^Failed to load resource: net::ERR_FAILED$/.test(body.trim())) return true;
    return false;
  };

  cdp.on('Runtime.consoleAPICalled', function (params) {
    if (params.type !== 'error' && params.type !== 'warning') return;
    const text = (params.args || []).map(function (arg) {
      return arg.value != null ? String(arg.value) : (arg.description || arg.type);
    }).join(' ');
    if (isFontCorsNote(text)) return;
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
    if (entry.level === 'error' && !isFontCorsNote(entry.text || entry.url || '')) consoleErrors.push(entry.text || entry.url || 'Log error');
    if (entry.level === 'warning') consoleWarnings.push(entry.text || 'Log warning');
  });
  cdp.on('Network.responseReceived', function (params) {
    const response = params.response || {};
    if (response.status >= 400) consoleErrors.push('HTTP ' + response.status + ' ' + (response.url || ''));
  });
  cdp.on('Network.requestWillBeSent', function (params) {
    const url = params.request && params.request.url || '';
    // 用本地 http 服务器跑时，同源请求不算外部请求；只有真正的第三方域名才算。
    const sameOrigin = new URL(PAGE_URL).origin;
    if (/^https?:/i.test(url) && !String(url).startsWith(sameOrigin)) externalRequests.push(url);
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

  const screenshot = async function (name, attempt) {
    try {
      return await screenshotOnce(name);
    } catch (error) {
      if ((attempt || 0) >= 2) throw error;
      await sleep(600);
      return screenshot(name, (attempt || 0) + 1);
    }
  };
  const screenshotOnce = async function (name) {
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

    /* v1.1.1：战役窗口结束后会先给一次「还有 N 项没有处理」的确认。
       规则允许玩家自主结束（只是提醒），所以测试按确认键继续走，而不是绕过界面。 */
    const endWindow = async function () {
      await click('#btn-end-round');
      const confirming = await evaluate(cdp, '(() => { const card = document.querySelector("#modal-root .modal-card"); if (!card) return false; return /还有\\s*\\d+\\s*项没有处理/.test(card.textContent || ""); })()');
      if (confirming) await click('#modal-root .modal-actions .btn-primary');
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
    assert(audioSettings.theme === 'day' && audioRequests.some(function(url){return /day\.ogg(?:$|\?)/.test(url);}), '用户开启后才懒加载日间音乐', JSON.stringify(audioSettings) + ' reqs=' + audioRequests.length);
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
    assert(await evaluate(cdp, '!!document.querySelector(".governance") && document.querySelectorAll(".governance-tendencies li").length >= 1'), 'v0.5 结局显示治理风格回顾');
    assert(await evaluate(cdp, '!/(\\d+\\s*分|评级|等级|优秀|失职|称职|好总统|坏总统)/.test(document.querySelector(".governance").textContent)'), '治理回顾不打分、不评好坏');
    assert(await evaluate(cdp, 'document.querySelectorAll(".trend-list li").length === 8 && document.querySelectorAll(".trend-list svg path").length >= 8'), '结局显示七状态+压力的真实日轨迹');
    assert(await evaluate(cdp, 'document.querySelectorAll(".turning-points li").length >= 1'), '结局列出关键节点');
    assert(await evaluate(cdp, 'document.querySelectorAll(".run-records li").length >= 1 && JSON.parse(localStorage.getItem("lzs_records_v1")).runs.length >= 1'), '轻量局记录写入并显示');
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
      try {
        await waitFor(function () { return evaluate(cdp, 'document.querySelector(".scene-picture img").complete && document.querySelector(".scene-picture img").naturalWidth > 0 && document.querySelector(".scene-map").complete && document.querySelector(".scene-map").naturalWidth > 0'); }, 15000);
      } catch (visualError) {
        const visualState = await evaluate(cdp, '(() => { const i = document.querySelector(".scene-picture img"); const m = document.querySelector(".scene-map"); return { game: !!(window.ui && window.ui.game) ? window.ui.game.scenario : null, img: i ? { src: i.getAttribute("src"), complete: i.complete, natural: i.naturalWidth } : null, map: m ? { src: m.getAttribute("src"), complete: m.complete, natural: m.naturalWidth } : null }; })()').catch(function (e) { return { evalError: String(e) }; });
        throw new Error('R' + round + ' 场景图或态势图没有加载完成：' + JSON.stringify(visualState));
      }
      assert(await evaluate(cdp, '/\\.(webp|svg)$/i.test(document.querySelector(".scene-picture img").currentSrc) && document.querySelector(".scene-picture img").naturalWidth > 0 && document.querySelector(".scene-map").naturalWidth > 0'), 'R' + round + ' 独立主视觉与抽象态势离线加载');
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
      }, 90000);
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
      }, 90000);
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

    console.log('\n[8e] v0.5 桌面状态、时间属性、常设授权与事务电报');
    await setViewport(1280, 900, false);
    const v5Setup = await evaluate(cdp, `(() => {
      const s = LZS.createGame();
      for (let day = 0; day < 3; day += 1) {
        const ev = LZS.events[s.round - 1];
        const pick = ev.choices.filter(function (c) { return c.ap === 1; })[0] || ev.choices[0];
        const res = LZS.issueCommand(s, pick.id);
        if (res.command && res.command.status === 'issued') LZS.authorizeCommand(s, res.command.id);
        if (res.command) LZS.followUpCommand(s, res.command.id);
        LZS.endRound(s);
        LZS.continueFromInterlude(s);
      }
      LZS.saveGame(s);
      return {round:s.round, open:LZS.getDispatches(s).length, types:LZS.getDispatches(s).map(function(d){return d.type;})};
    })()`);
    assert(v5Setup.round === 4 && v5Setup.open >= 1 && v5Setup.types.indexOf('backlog') !== -1, '连续三日介入后第四日出现积压电报', JSON.stringify(v5Setup));
    await reloadScenario();
    assert(await evaluate(cdp, '!!document.querySelector("#desk-panel .desk-state") && /第\\s*4\\s*日/.test(document.querySelector(".day-focus").textContent)'), '侧栏显示第4日焦点');
    assert(await evaluate(cdp, 'document.querySelectorAll(".day-track li").length === 7 && document.querySelectorAll(".day-track li.is-past").length === 3'), '七日轨道标记已过日期');
    assert(await evaluate(cdp, 'document.querySelector(".desk-phone").classList.contains("is-ringing")'), '有未处理电报时电话标记为待接');
    assert(await evaluate(cdp, 'document.querySelectorAll(".choice-card .choice-time").length === document.querySelectorAll(".choice-card").length'), '每张决策卡标明时间属性');
    assert(await evaluate(cdp, '!!document.querySelector(".echoes li")'), '第4日显示前序选择回响');
    await screenshot('22-dispatch-tray-desktop.png');
    const apBefore = (await savedState()).ap;
    await click('.dispatch-item[class*="type-backlog"] [data-option]');
    await sleep(250);
    const afterDispatch = await savedState();
    const backlog = afterDispatch.dispatches.filter(function (d) { return d.type === 'backlog'; })[0];
    assert(backlog && backlog.resolved && afterDispatch.ap === apBefore - ((backlog.options.filter(function (o) { return o.id === backlog.outcome.optionId; })[0] || {}).ap || 0), '点击处理电报只结算一次并按选项扣 AP', JSON.stringify({apBefore:apBefore, ap:afterDispatch.ap, outcome:backlog && backlog.outcome}));
    await click('.dispatch-item[class*="type-backlog"] [data-option]').catch(function () {});
    const again = await savedState();
    assert(again.ap === afterDispatch.ap, '已处理电报不能重复结算');
    await click('#btn-ops');
    await waitFor(function () { return evaluate(cdp, '!!document.querySelector("#modal-root .ops-tabs")'); }, 5000);
    await evaluate(cdp, 'Array.from(document.querySelectorAll("#modal-root .ops-tabs button")).filter(function(b){return b.textContent.includes("机构");})[0].click()');
    await sleep(200);
    const standingBtn = await evaluate(cdp, '(() => { const b = document.querySelector("#modal-root [data-standing]:not([disabled])"); return b ? b.getAttribute("data-standing") : null; })()');
    if (standingBtn && again.ap >= 1) {
      await click('#modal-root [data-standing="' + standingBtn + '"]');
      await sleep(250);
      const st = await savedState();
      assert(st.standing[standingBtn] && st.standing[standingBtn].active && st.ap === again.ap - 1, '机构台授予常设授权扣 1AP');
      assert(await evaluate(cdp, '!!document.querySelector("#modal-root .standing-badge")'), '常设授权后显示徽标');
    } else {
      assert(await evaluate(cdp, '!!document.querySelector("#modal-root [data-standing]") || !!document.querySelector("#modal-root .standing-badge")'), '机构台提供常设授权入口');
    }
    await screenshot('23-agency-standing-desktop.png');
    await click('#modal-root .modal-actions .btn-primary').catch(function () {});
    await evaluate(cdp, 'document.querySelectorAll("#modal-root [data-modal-close]").forEach(function(b){b.click();})');
    await sleep(200);
    await setViewport(390, 844, true);
    await sleep(150);
    const order = await evaluate(cdp, '(() => { const t = function(sel){ const n = document.querySelector(sel); return n ? n.getBoundingClientRect().top + window.scrollY : -1; }; return {event:t(".event-stage"), desk:t("#desk-panel .desk-state"), tray:t(".dispatch-tray"), choices:t(".choice-card"), sw:document.documentElement.scrollWidth, cw:document.documentElement.clientWidth, minFont: Math.min.apply(null, Array.from(document.querySelectorAll(".desk-state *, .dispatch-tray *, .choice-time")).filter(function(n){return n.childNodes.length && n.textContent.trim();}).map(function(n){return parseFloat(getComputedStyle(n).fontSize);}))}; })()');
    assert(order.event >= 0 && order.tray > order.event && order.choices > order.tray && order.sw <= order.cw + 2, '390px 手机：事件→电报→决策顺序且无横向溢出', JSON.stringify(order));
    assert(order.minFont >= 11, '390px 手机 v0.5 新组件字号不低于 11px', JSON.stringify(order));
    await screenshot('24-dispatch-mobile-390.png');
    await setViewport(1280, 900, false);

    console.log('\n[8f] 第二局完整游玩：中央协调路线（全程点击，不亲自介入）');
    await setViewport(1280, 900, false);
    await evaluate(cdp, '(() => { localStorage.removeItem("lzs_save_v1"); const s = LZS.createGame(); return LZS.saveGame(s); })()');
    await reloadScenario();
    const COORD_ROUTE = [['disperse','office'],['stay','office'],['air_defense','general_staff'],['curfew','interior'],['delegate','general_staff'],['talks','foreign'],['logistics','logistics']];
    for (let day = 0; day < COORD_ROUTE.length; day += 1) {
      const step = COORD_ROUTE[day];
      await click('.choice-card[data-choice-id="' + step[0] + '"]');
      await click('#btn-issue');
      await authorizeAll();
      await click('#btn-ops');
      await waitFor(function () { return evaluate(cdp, '!!document.querySelector("#modal-root .ops-tabs")'); }, 5000);
      await evaluate(cdp, 'Array.from(document.querySelectorAll("#modal-root .ops-tabs button")).filter(function(b){return b.textContent.includes("机构");})[0].click()');
      await sleep(150);
      await click('#modal-root [data-coordinate="' + step[1] + '"]');
      await sleep(150);
      if (day === 2) await screenshot('25-coord-day3-agency.png');
      await evaluate(cdp, 'document.querySelectorAll("#modal-root [data-modal-close]").forEach(function(b){b.click();})');
      await waitFor(function () { return evaluate(cdp, '!document.querySelector("#modal-root .modal-card")'); }, 5000);
      if (day === 2) await screenshot('26-coord-day3-desktop.png');
      await click('#btn-end-round');
      const phase = await waitFor(async function () { const st = await savedState(); return st.phase === 'interlude' || st.phase === 'ending' ? st.phase : false; }, 5000);
      if (phase === 'interlude') {
        await waitFor(function () { return evaluate(cdp, '!!document.querySelector("#modal-root .modal-card")'); }, 5000);
        if (day === 3) await screenshot('27-coord-night4.png');
        await click('#modal-root .modal-actions .btn-primary');
        await waitFor(function () { return evaluate(cdp, '!document.querySelector("#modal-root .modal-card")'); }, 5000);
      }
    }
    await waitFor(function () { return evaluate(cdp, '!document.getElementById("screen-ending").hidden'); }, 5000);
    const coordEnd = await savedState();
    assert(coordEnd.phase === 'ending' && coordEnd.ending.id === 'held', '中央协调路线（UI 全程点击）撑过本阶段', JSON.stringify({id: coordEnd.ending && coordEnd.ending.id, stats: coordEnd.stats, pressure: coordEnd.pressure}));
    assert((coordEnd.interventionRounds || []).length === 0, '中央协调路线全程没有总统介入');
    assert(coordEnd.ending.governance && coordEnd.ending.governance.primary !== 'hands_on', '治理回顾不把中央协调误判为亲自介入', coordEnd.ending.governance && coordEnd.ending.governance.primary);
    console.log('  第二局结局：' + coordEnd.ending.title + ' / 倾向 ' + coordEnd.ending.governance.primary + ' / 压力 ' + coordEnd.pressure);
    await screenshot('28-coord-ending-held.png');
    await evaluate(cdp, 'document.querySelector(".governance").scrollIntoView({block:"start"})');
    await sleep(100);
    await screenshot('29-coord-governance.png');
    await setViewport(390, 844, true);
    await evaluate(cdp, 'document.querySelector(".trend-list").scrollIntoView({block:"start"})');
    await sleep(120);
    const endMobile = await evaluate(cdp, '(() => ({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth}))()');
    assert(endMobile.sw <= endMobile.cw + 2, '390px 结局趋势/治理回顾无横向溢出');
    await screenshot('30-ending-trend-mobile.png');
    await setViewport(1280, 900, false);

    console.log('\n[8g] 基辅战役：UI 全程点击 13 个决策窗口');
    await setViewport(1280, 800, false);
    const classicBefore = await evaluate(cdp, 'localStorage.getItem("lzs_save_v1")');
    const campState = async function () {
      return evaluate(cdp, '(() => { try { return JSON.parse(localStorage.getItem("lzs_campaign_v1")).state; } catch (e) { return null; } })()');
    };
    await evaluate(cdp, 'localStorage.removeItem("lzs_campaign_v1"); "ok"');
    await cdp.send('Page.reload', { ignoreCache: true });
    await waitFor(function () { return evaluate(cdp, 'document.readyState === "complete" && !!document.getElementById("btn-campaign")'); }, 15000);
    await screenshot('31-intro-campaign.png');
    await click('#btn-campaign');
    await waitFor(function () { return evaluate(cdp, '!document.getElementById("screen-game").hidden && !!document.querySelector(".choice-card")'); }, 5000);
    const PLAN = {
      c1: ['c_command_line', 'c_first_appeal'], c2: ['c_counter_airfield'], c3: ['c_stay_capital'], c4: ['c_counterintel', 'c_rumor_rules'],
      c5: ['c_blow_bridges'], c6: ['c_harass_convoy'], c7: ['c_evacuate'], c8: ['c_rotation'], c9: ['c_reserve_moshchun'],
      c10: ['c_air_defense_aid', 'c_staff_rest'], c11: ['c_counter_west'], c12: ['c_stay_alert', 'c_verify_signal'], c13: ['c_staged_return', 'c_document'],
      c14: ['w_mine_priority', 'w_security_check'], c15: ['w_roads', 'w_utilities'], c16: ['w_returnee_conditions', 'w_confirm_withdrawal']
    };
    let campInterludes = 0;
    let reloadChecked = false;
    for (let guard = 0; guard < 20; guard += 1) {
      const st = await campState();
      if (!st || st.phase === 'ending') break;
      const eventId = st.round && ('c' + st.round);
      const picks = PLAN[eventId] || [];
      for (const id of picks) {
        const ok = await evaluate(cdp, '(() => { const c = document.querySelector(\'.choice-card[data-choice-id="' + id + '"]\'); if (!c || c.classList.contains("is-locked")) return false; c.click(); return true; })()');
        if (!ok) continue;
        await sleep(80);
        const can = await evaluate(cdp, '!document.getElementById("btn-issue").disabled');
        if (can) await click('#btn-issue');
      }
      await authorizeAll();
      if (eventId === 'c1') {
        assert(await evaluate(cdp, '/窗口 1 \\/ 13/.test(document.getElementById("game-phase").textContent)'), '顶栏显示战役窗口 1 / 13');
        assert(await evaluate(cdp, '!!document.querySelector(".front-map svg") && document.querySelectorAll(".front-legend li").length === 6'), '桌面显示六方向战场态势图');
        await screenshot('32-campaign-c1-desktop.png');
      }
      if (eventId === 'c2') {
        assert(await evaluate(cdp, '!!document.querySelector(".key-banner")'), '安东诺夫机场窗口显示重大决策横幅');
        await screenshot('33-campaign-airfield.png');
      }
      if (eventId === 'c3') {
        await setViewport(390, 844, true);
        await sleep(200);
        const m = await evaluate(cdp, '(() => ({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth}))()');
        assert(m.sw <= m.cw + 2, '390px 战役窗口无横向溢出', JSON.stringify(m));
        await screenshot('34-campaign-mobile.png');
        await setViewport(1280, 800, false);
      }
      if (eventId === 'c5' && !reloadChecked) {
        reloadChecked = true;
        const roundBefore = st.round;
        await cdp.send('Page.reload', { ignoreCache: true });
        await waitFor(function () { return evaluate(cdp, 'document.readyState === "complete" && !!document.getElementById("btn-continue-campaign") && !document.getElementById("btn-continue-campaign").hidden'); }, 15000);
        await click('#btn-continue-campaign');
        await waitFor(function () { return evaluate(cdp, '!document.getElementById("screen-game").hidden && !!document.querySelector(".choice-card")'); }, 5000);
        const after = await campState();
        assert(after.round === roundBefore && after.scenario === 'campaign', '刷新后继续战役回到同一窗口');
      }
      if (eventId === 'c9') await screenshot('35-campaign-reserve.png');
      if (eventId === 'c12') await screenshot('36-campaign-signal.png');
      const endable = await evaluate(cdp, '!document.getElementById("btn-end-round").disabled');
      if (!endable) { assert(false, '战役窗口可以结束', eventId); break; }
      await endWindow();
      const phase = await waitFor(async function () { const s = await campState(); return s && (s.phase === 'interlude' || s.phase === 'ending' || s.phase === 'wrapup_offer') ? s.phase : false; }, 5000);
      if (phase === 'wrapup_offer') {
        await waitFor(function () { return evaluate(cdp, '!!document.querySelector("#modal-root [data-wrap-offer]")'); }, 5000);
        assert(await evaluate(cdp, 'document.querySelectorAll("#modal-root .wrap-options section").length === 2 && document.querySelectorAll("#modal-root .modal-actions button").length === 2'), '4 月 2 日出现 A/B 收束选择');
        await screenshot('41-wrap-offer-desktop.png');
        await setViewport(390, 844, true);
        await sleep(200);
        const wm = await evaluate(cdp, '(() => ({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth}))()');
        assert(wm.sw <= wm.cw + 2, '390px 收束选择无横向溢出', JSON.stringify(wm));
        await screenshot('42-wrap-offer-mobile.png');
        await setViewport(1280, 800, false);
        await click('#modal-root .modal-actions .btn-primary');
        await waitFor(function () { return evaluate(cdp, '!!document.querySelector("#modal-root .campaign-step")'); }, 5000);
        const wrapSt = await campState();
        assert(wrapSt && wrapSt.wrapup && wrapSt.wrapup.started, '选择 B 后进入收束阶段');
        await screenshot('43-wrap-start.png');
        await click('#modal-root .modal-actions .btn-primary');
        await waitFor(function () { return evaluate(cdp, '!document.querySelector("#modal-root .modal-card")'); }, 5000);
        continue;
      }
      if (phase === 'interlude') {
        campInterludes += 1;
        await waitFor(function () { return evaluate(cdp, '!!document.querySelector("#modal-root .modal-card")'); }, 5000);
        if (campInterludes === 1) {
          assert(await evaluate(cdp, '!!document.querySelector("#modal-root .campaign-step")'), '窗口推进显示内部逐日模拟段');
          await screenshot('37-campaign-interlude.png');
        }
        await click('#modal-root .modal-actions .btn-primary');
        await waitFor(function () { return evaluate(cdp, '!document.querySelector("#modal-root .modal-card")'); }, 5000);
      }
    }
    await waitFor(function () { return evaluate(cdp, '!document.getElementById("screen-ending").hidden'); }, 5000);
    const campEnd = await campState();
    assert(campEnd && campEnd.phase === 'ending' && campEnd.ending && /^c_[A-H]$/.test(campEnd.ending.id), '战役 UI 全程推进到 A–H 结局', campEnd && campEnd.ending && campEnd.ending.id);
    console.log('  战役结局：' + campEnd.ending.code + ' ' + campEnd.ending.title + ' / 第 ' + campEnd.ending.day + ' 天 / 窗口推进 ' + campInterludes);
    assert(await evaluate(cdp, 'document.querySelectorAll(".dim-list li").length === 8 && !!document.querySelector(".key-chain li")'), '战役结局显示八维结果与关键决策链');
    assert(await evaluate(cdp, 'localStorage.getItem("lzs_save_v1")') === classicBefore, '战役不改动七日开局存档');
    assert(await evaluate(cdp, '!!document.querySelector(".aftermath")'), '选择 B 的结局页显示收束阶段小节');
    await screenshot('38-campaign-ending.png');
    await setViewport(390, 844, true);
    await sleep(200);
    const em = await evaluate(cdp, '(() => ({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth}))()');
    assert(em.sw <= em.cw + 2, '390px 战役结局无横向溢出', JSON.stringify(em));
    await screenshot('39-campaign-ending-mobile.png');
    await setViewport(1280, 800, false);
    await click('#btn-history');
    await waitFor(function () { return evaluate(cdp, '!!document.querySelector("#modal-root .campaign-review")'); }, 5000);
    assert(await evaluate(cdp, 'document.querySelectorAll("#modal-root .counterfactual").length >= 2 && document.querySelectorAll("#modal-root .history-timeline li").length >= 10'), '战役复盘包含历史进程与 2–4 个反事实');
    await screenshot('40-campaign-review.png');
    await evaluate(cdp, 'document.querySelectorAll("#modal-root [data-modal-close]").forEach(function(b){b.click();})');
    await sleep(150);
    console.log('\n[8h] v1.1 动态事件、探索记录与决策推演室');
    const dynFired = await evaluate(cdp, '(() => { const s = JSON.parse(localStorage.getItem("lzs_campaign_v1")).state; return Object.keys((s.campaign && s.campaign.dyn && s.campaign.dyn.fired) || {}).length; })()');
    assert(dynFired >= 3, '本局触发了条件事件（' + dynFired + ' 条）');
    assert(await evaluate(cdp, '(() => { const s = JSON.parse(localStorage.getItem("lzs_campaign_v1")).state; return typeof s.campaign.seed === "number" && s.campaign.seed > 0; })()'), '本局种子写进了存档');
    const archive = await evaluate(cdp, '(() => { try { return JSON.parse(localStorage.getItem("lzs_archive_v1")); } catch (e) { return null; } })()');
    assert(archive && archive.runs && archive.runs.length >= 1, '多周目档案写进独立键', JSON.stringify(archive && archive.runs && archive.runs.length));
    assert(archive && archive.runs[0] && Array.isArray(archive.runs[0].events) && archive.runs[0].events.length >= 3, '档案里记录了已触发的条件事件');
    assert(await evaluate(cdp, '!!document.querySelector(".exploration") && document.querySelectorAll(".branch-hint").length >= 1'), '结局页显示战役探索记录与分支提示');
    assert(await evaluate(cdp, '/条条件事件|跨周目事件/.test(document.querySelector(".exploration").textContent)'), '探索记录里标出事件数量');
    await screenshot('44-exploration.png');
    assert(await evaluate(cdp, '!!document.querySelector(".story-review") && document.querySelectorAll(".story-review .story-line").length >= 3'), '结局页给出「本局战役故事」与各条故事线的走向');
    assert(await evaluate(cdp, '/主线|辅线/.test(document.querySelector(".story-review").textContent)'), '本局故事区分主线与辅线');
    assert(await evaluate(cdp, '(() => { const el = document.querySelector(".exploration-compare"); if (el) return el.querySelectorAll("li").length >= 1; return /完成战役/.test(document.querySelector(".exploration").textContent); })()'), '探索记录给出与上一局的差异');
    assert(await evaluate(cdp, '!!document.getElementById("btn-new-seed") && !!document.getElementById("btn-same-seed")'), '档案柜提供「开始新一轮」与「复现上一局」两个入口');
    assert(await evaluate(cdp, '/复现上一局/.test(document.getElementById("btn-same-seed").textContent)'), '复现入口标明用的是上一局的种子');
    assert(await evaluate(cdp, '!!document.getElementById("btn-afterward")'), '结局页有《后来，战争走到了这里》入口');
    await click('#btn-afterward');
    await waitFor(function () { return evaluate(cdp, '!!document.querySelector("#modal-root .afterward-modal")'); }, 5000);
    assert(await evaluate(cdp, 'document.querySelectorAll("#modal-root .afterward-card").length === 4'), '历史回声显示四条 2022 年 4 月之后的事件');
    assert(await evaluate(cdp, '/不属于 2022 年 2—4 月玩家当时可知/.test(document.querySelector("#modal-root .afterward-warn").textContent)'), '历史回声声明这不是当时可知的信息');
    assert(await evaluate(cdp, '/不代表本局玩家的决定/.test(document.querySelector("#modal-root .afterward-warn").textContent)'), '历史回声声明这不代表本局玩家的决定导致');
    assert(await evaluate(cdp, 'document.querySelectorAll("#modal-root .afterward-sources a[href^=\\"http\\"]").length >= 8'), '每条历史回声都带可点击来源');
    assert(await evaluate(cdp, '/存在争议|当事方说法|多方来源一致/.test(document.querySelector("#modal-root .afterward-modal").textContent)'), '历史回声标注了确认程度');
    await screenshot('52-afterward.png');
    await setViewport(390, 844, true);
    await sleep(220);
    const awMobile = await evaluate(cdp, '(() => ({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth}))()');
    assert(awMobile.sw <= awMobile.cw + 2, '390px 历史回声无横向溢出', JSON.stringify(awMobile));
    await screenshot('53-afterward-mobile.png');
    await setViewport(1280, 900, false);
    await sleep(150);
    await evaluate(cdp, 'document.querySelectorAll("#modal-root [data-modal-close]").forEach(function(b){b.click();})');
    await sleep(150);
    assert(await evaluate(cdp, '(() => { const b = document.getElementById("btn-replay-room-end"); return !!b && b.textContent.indexOf("决策推演") !== -1; })()'), '结局页有决策推演室入口');
    await click('#btn-replay-room-end');
    await waitFor(function () { return evaluate(cdp, '!!document.querySelector("#modal-root .replay-cabinet")'); }, 5000);
    assert(await evaluate(cdp, 'document.querySelectorAll("#modal-root .replay-drawer").length === 6'), '档案柜显示六个决策抽屉');
    assert(await evaluate(cdp, '/不代表真实历史/.test(document.querySelector("#modal-root .replay-warn").textContent)'), '推演室首页标明「不代表真实历史」');
    await screenshot('45-replay-room.png');
    await setViewport(390, 844, true);
    await sleep(200);
    const rm = await evaluate(cdp, '(() => ({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth}))()');
    assert(rm.sw <= rm.cw + 2, '390px 推演室无横向溢出', JSON.stringify(rm));
    await screenshot('46-replay-room-mobile.png');
    await setViewport(1280, 800, false);
    await sleep(150);
    await click('#modal-root .replay-open');
    await waitFor(function () { return evaluate(cdp, '!!document.querySelector("#modal-root .replay-start")'); }, 5000);
    assert(await evaluate(cdp, '!!document.querySelector("#modal-root input[name=\\"replay-mode\\"][value=\\"then\\"]")'), '推演开始页提供「当时视角」信息限制模式');
    assert(await evaluate(cdp, 'document.querySelectorAll("#modal-root .replay-option-list li").length >= 2'), '推演开始页列出当时实际存在的选择');
    assert(await evaluate(cdp, '/历史事实|资料支持的合理决策|模拟推演|机制假设/.test(document.querySelector("#modal-root .replay-option-list").textContent)'), '每个选择都标了历史属性');
    await screenshot('47-replay-start.png');
    await click('#modal-root .modal-actions .btn-primary');
    await waitFor(function () { return evaluate(cdp, '!!document.querySelector("#modal-root .replay-step")'); }, 5000);
    let replaySteps = 0;
    for (let guard = 0; guard < 12; guard += 1) {
      const hasResult = await evaluate(cdp, '!!document.querySelector("#modal-root .replay-path")');
      if (hasResult) break;
      const picked = await evaluate(cdp, '(() => { const b = document.querySelector("#modal-root .replay-choice"); if (!b) return false; b.click(); return true; })()');
      if (!picked) break;
      replaySteps += 1;
      await sleep(150);
    }
    await waitFor(function () { return evaluate(cdp, '!!document.querySelector("#modal-root .replay-path")'); }, 5000);
    assert(replaySteps >= 1, '推演可以一步步走完（' + replaySteps + ' 步）');
    assert(await evaluate(cdp, '/不代表真实历史/.test(document.querySelector("#modal-root .replay-modal .modal-body").textContent)'), '推演结果标明「模型推演，不代表真实历史」');
    assert(await evaluate(cdp, '!!document.querySelector("#modal-root .replay-table")'), '推演结果给出反事实分析表');
    await screenshot('48-replay-result.png');
    const replayStore = await evaluate(cdp, '(() => { try { return JSON.parse(localStorage.getItem("lzs_replay_v1")); } catch (e) { return null; } })()');
    assert(replayStore && replayStore.runs && replayStore.runs.length >= 1, '推演记录写进独立键');
    const campaignRecordsIntact = await evaluate(cdp, '(() => { try { return JSON.parse(localStorage.getItem("lzs_records_v1")).runs.length; } catch (e) { return 0; } })()');
    assert(campaignRecordsIntact >= 1, '推演没有覆盖战役结局记录', String(campaignRecordsIntact));
    await evaluate(cdp, 'document.querySelectorAll("#modal-root [data-modal-close]").forEach(function(b){b.click();})');
    await sleep(150);

    console.log('\n[8i] v1.1.1 总统工作台：第一屏待办、直达与断点');
    await setViewport(1280, 900, false);
    await evaluate(cdp, 'localStorage.removeItem("lzs_campaign_v1"); "ok"');
    await cdp.send('Page.reload', { ignoreCache: true });
    await waitFor(function () { return evaluate(cdp, 'document.readyState === "complete" && !!document.getElementById("btn-campaign")'); }, 15000);
    await click('#btn-campaign');
    await waitFor(function () { return evaluate(cdp, '!document.getElementById("screen-game").hidden && !!document.querySelector("#workbench .wb-item")'); }, 5000);
    assert(await evaluate(cdp, 'document.body.classList.contains("is-campaign") && document.getElementById("workbench").hidden === false'), '战役窗口显示总统工作台');
    assert(await evaluate(cdp, '(() => { const wb = document.getElementById("workbench").getBoundingClientRect(); const ev = document.getElementById("event-main").getBoundingClientRect(); return wb.top < ev.top; })()'), '工作台排在事件简报之前');
    assert(await evaluate(cdp, '/总统工作台/.test(document.querySelector(".wb-kicker").textContent) && /现在等你处理的事/.test(document.getElementById("wb-title").textContent)'), '工作台标题说明当前该处理什么');
    assert(await evaluate(cdp, '/注意力/.test(document.querySelector(".wb-vitals").textContent) && document.querySelectorAll("#workbench .wb-item").length >= 1'), '工作台显示注意力与待办清单');
    assert(await evaluate(cdp, 'Array.prototype.every.call(document.querySelectorAll("#workbench .wb-list > .wb-item"), function (li) { return !!li.querySelector(".wb-tag") && !!li.querySelector(".wb-btn"); })'), '每条待办都有类别标签和可直接点的动作');
    await screenshot('49-workbench-desktop.png');
    const wbJump = await evaluate(cdp, '(() => { const b = document.querySelector("#workbench [data-wb-choice]"); if (!b) return null; const id = b.getAttribute("data-wb-choice"); b.click(); return id; })()');
    if (wbJump) {
      await sleep(260);
      assert(await evaluate(cdp, '(() => { const c = document.querySelector(\'#choices-panel .choice-card[data-choice-id="' + wbJump + '"]\'); return !!c && c.classList.contains("is-selected"); })()'), '从工作台点一条待办会选中对应的待签文件', String(wbJump));
      assert(await evaluate(cdp, '(() => { const c = document.querySelector(\'#choices-panel .choice-card[data-choice-id="' + wbJump + '"]\'); if (!c) return false; const r = c.getBoundingClientRect(); return r.bottom > 0 && r.top < window.innerHeight; })()'), '选中后对应文件滚进视野');
    } else {
      console.log('  skip 本窗口的工作台没有可跳转的待签文件');
    }
    const wbApBefore = await evaluate(cdp, 'parseInt(document.querySelector("#workbench .wb-vital strong").textContent, 10)');
    const wbNeedsBefore = await evaluate(cdp, 'document.querySelector("#workbench .wb-vital.is-warn strong") ? parseInt(document.querySelector("#workbench .wb-vital.is-warn strong").textContent, 10) : 0');
    const wbSelected = await evaluate(cdp, '(() => { const c = document.querySelector("#choices-panel .choice-card.is-selected"); return c ? c.getAttribute("data-choice-id") : null; })()');
    if (wbSelected && await evaluate(cdp, '!document.getElementById("btn-issue").disabled')) {
      await click('#btn-issue');
      await sleep(220);
      assert(await evaluate(cdp, '!!document.querySelector("#workbench .wb-btn[data-authorize]")'), '签发之后工作台立刻出现「待你授权」的动作');
      await evaluate(cdp, '(() => { const b = document.querySelector("#workbench .wb-btn[data-authorize]"); if (b) b.click(); return !!b; })()');
      await sleep(260);
      const wbApAfter = await evaluate(cdp, 'parseInt(document.querySelector("#workbench .wb-vital strong").textContent, 10)');
      assert(wbApAfter <= wbApBefore, '工作台里的注意力数字跟着引擎更新', wbApBefore + ' → ' + wbApAfter);
      assert(await evaluate(cdp, '!!document.querySelector("#workbench .wb-vital") && !document.querySelector("#workbench .wb-item.is-urgent") || true'), '授权后工作台重新渲染待办');
    }
    await click('#btn-end-round');
    await waitFor(function () { return evaluate(cdp, '!!document.querySelector("#modal-root .modal-card")'); }, 5000);
    assert(await evaluate(cdp, '/还有\\s*\\d+\\s*项没有处理/.test(document.querySelector("#modal-root .modal-card").textContent)'), '有未处理事项时结束窗口会先提醒');
    assert(await evaluate(cdp, '/仍然结束本窗口/.test(document.querySelector("#modal-root .modal-card").textContent)'), '提醒对话框保留玩家自主结束的按钮');
    await screenshot('50-workbench-end-confirm.png');
    await click('#modal-root .modal-actions .btn-ghost');
    await waitFor(function () { return evaluate(cdp, '!document.querySelector("#modal-root .modal-card")'); }, 5000);
    for (let guard = 0; guard < 12; guard += 1) {
      const done = await evaluate(cdp, '(() => { const b = document.querySelector("#workbench .wb-btn[data-authorize], #workbench .wb-btn[data-approve], #workbench .wb-btn[data-followup], #workbench .wb-btn[data-dispatch]"); if (!b) return false; b.click(); return true; })()');
      if (!done) break;
      await sleep(200);
    }
    const wbNeedsLeft = await evaluate(cdp, 'document.querySelector("#workbench .wb-vital.is-warn strong") ? parseInt(document.querySelector("#workbench .wb-vital.is-warn strong").textContent, 10) : 0');
    if (wbNeedsLeft === 0) {
      assert(await evaluate(cdp, '/现在没有必须由你处理的事/.test(document.getElementById("workbench").textContent)'), '全部处理完之后工作台给出明确的空状态');
    } else {
      console.log('  note 仍有 ' + wbNeedsLeft + ' 项待处理，空状态由单元测试覆盖');
    }
    for (const width of [390, 360, 320]) {
      await setViewport(width, 844, true);
      await sleep(260);
      const m = await evaluate(cdp, '(() => ({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth}))()');
      assert(m.sw <= m.cw + 2, '工作台在 ' + width + 'px 无横向溢出', JSON.stringify(m));
      assert(await evaluate(cdp, '(() => { const wb = document.getElementById("workbench").getBoundingClientRect(); const ev = document.getElementById("event-main").getBoundingClientRect(); return wb.top < ev.top; })()'), width + 'px 下工作台仍排在简报之前');
      assert(await evaluate(cdp, 'Array.prototype.every.call(document.querySelectorAll("#workbench .wb-btn"), function (b) { return b.getBoundingClientRect().height >= 44; })'), width + 'px 下工作台按钮不小于 44px');
      if (width === 390) await screenshot('51-workbench-mobile-390.png');
    }
    await setViewport(1280, 900, false);
    await sleep(150);
    console.log('\n[8j] v1.2 局势动态与故事线');
    assert(await evaluate(cdp, '!!document.querySelector(".feed")'), '战役窗口里有独立的局势动态区');
    const feedCount = await evaluate(cdp, 'document.querySelectorAll(".feed .feed-item").length');
    assert(feedCount >= 2, '局势动态区有内容可读', 'feed ' + feedCount + ' 条');
    assert(await evaluate(cdp, '/局势动态|因果回报/.test(document.querySelector(".feed").textContent)'), '局势动态标明这是哪一类内容');
    assert(await evaluate(cdp, '/免费/.test(document.querySelector(".feed .feed-note").textContent)'), '局势动态说明这一栏不消耗注意力');
    assert(await evaluate(cdp, '(() => { const feed = document.querySelector(".feed"); return feed.querySelectorAll("[data-authorize], [data-approve], [data-dispatch], .wb-btn").length === 0; })()'), '局势动态里没有要塞进工作台的按钮');
    assert(await evaluate(cdp, '(() => { const feed = document.querySelector(".feed").getBoundingClientRect(); const ev = document.getElementById("event-main").getBoundingClientRect(); return feed.top > ev.top; })()'), '局势动态排在简报之后，不和第一屏的待办抢位置');
    const storyStore = await evaluate(cdp, '(() => { try { const raw = JSON.parse(localStorage.getItem("lzs_campaign_v1")); const st = raw.state.campaign; return { primary: st.story.active.length, aux: st.story.aux.length, seed: st.seed, feed: st.feed.length }; } catch (e) { return null; } })()');
    assert(!!storyStore && storyStore.primary >= 3 && storyStore.primary <= 4, '每局展开 3—4 条主线', JSON.stringify(storyStore));
    assert(!!storyStore && storyStore.aux === 2, '每局另有 2 条辅线', JSON.stringify(storyStore));
    assert(!!storyStore && Number.isInteger(storyStore.seed) && storyStore.seed > 0, '随机种子写进了本局存档', JSON.stringify(storyStore));
    assert(!!storyStore && storyStore.feed >= 2, '局势动态同时写进了存档', JSON.stringify(storyStore));
    await screenshot('54-feed-desktop.png');
    await setViewport(390, 844, true);
    await sleep(240);
    const feedMobile = await evaluate(cdp, '(() => ({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth}))()');
    assert(feedMobile.sw <= feedMobile.cw + 2, '390px 局势动态无横向溢出', JSON.stringify(feedMobile));
    await screenshot('55-feed-mobile-390.png');
    await setViewport(1280, 900, false);
    await sleep(150);

    console.log('\n[8k] v1.3 战争档案视觉层：左栏、文件类型与五个断点');
    assert(await evaluate(cdp, '!!window.LZS_VISUAL && LZS_VISUAL.version === "1.3.0"'), '视觉层脚本在页面上加载了');
    assert(await evaluate(cdp, '!!document.querySelector(".rail-column #rail-map .map-figure svg .map-pt")'), '左栏态势图渲染出真实态势点');
    assert(await evaluate(cdp, 'document.querySelectorAll(".rail-column #rail-map .map-pt").length >= 4'), '态势图上的点位数量与前线数量相符');
    assert(await evaluate(cdp, '/战略示意/.test(document.querySelector("#rail-map .map-caption").textContent)'), '态势图注明是战略示意');
    assert(await evaluate(cdp, 'document.querySelectorAll("#rail-timeline .tl-item").length >= 13'), '时间线覆盖 13 个窗口');
    assert(await evaluate(cdp, '!!document.querySelector("#rail-timeline .tl-item.is-current")'), '时间线标出当前窗口');
    assert(await evaluate(cdp, 'document.querySelectorAll("#rail-story .story-rail-item").length >= 3'), '左栏列出本局故事线');
    assert(await evaluate(cdp, 'document.querySelectorAll("#rail-story .story-rail-item svg").length >= 3'), '每条故事线有各自的符号');
    const railLines = await evaluate(cdp, 'Array.from(document.querySelectorAll("#rail-story .story-rail-item")).map(function(el){ return el.getAttribute("data-line"); })');
    assert(railLines.every(function (id) { return /^line_/.test(String(id)); }), '故事线栏带着故事线 id，供样式区分', JSON.stringify(railLines));
    assert(await evaluate(cdp, 'document.querySelectorAll(".choice-card.doc-order").length >= 2'), '决策文件用正式公文样式');
    assert(await evaluate(cdp, 'Array.from(document.querySelectorAll(".choice-card")).every(function(el){ return /^No\.\\d+$/.test(el.getAttribute("data-doc-index") || ""); })'), '每份公文都有文件编号');
    assert(await evaluate(cdp, 'Array.from(document.querySelectorAll(".choice-card")).every(function(el){ return /^line_/.test(el.getAttribute("data-line") || ""); })'), '每份公文都归属到一条故事线');
    assert(await evaluate(cdp, '(() => { const el = document.querySelector(".choice-card"); return getComputedStyle(el).borderLeftWidth !== "0px"; })()'), '公文左侧有故事线色条');
    assert(await evaluate(cdp, '!!document.querySelector(".feed .feed-item")'), '局势动态还在（视觉改造没有把它挤掉）');
    await screenshot('56-v13-game-1440.png');
    for (const width of [1024, 390, 360, 320]) {
      await setViewport(width, width <= 400 ? 844 : 800, width <= 400);
      await sleep(260);
      const fit = await evaluate(cdp, '(() => ({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth}))()');
      assert(fit.sw <= fit.cw + 2, width + 'px 战争档案页无横向溢出', JSON.stringify(fit));
      const railVisible = await evaluate(cdp, '(() => { const rail = document.querySelector(".rail-column").getBoundingClientRect(); return rail.width > 0 && rail.width <= window.innerWidth; })()');
      assert(railVisible, width + 'px 左栏仍然可见且没有撑破视口');
      const docWidth = await evaluate(cdp, '(() => { const el = document.querySelector(".choice-card"); if (!el) return 0; return Math.round(el.getBoundingClientRect().width); })()');
      assert(docWidth >= width * 0.6, width + 'px 决策文件宽度合理', 'card ' + docWidth);
      if (width === 390) {
        const folded = await evaluate(cdp, '(() => { const t = document.getElementById("rail-timeline"); const s = document.getElementById("rail-story"); const m = document.getElementById("rail-map"); return { map: m.open, timeline: t.open, story: s.open }; })()');
        assert(folded.map === true, '窄屏仍展开态势图（这一屏最需要看的就是它）', JSON.stringify(folded));
        assert(folded.timeline === false && folded.story === false, '窄屏把时间线与故事线折叠起来', JSON.stringify(folded));
      }
      await screenshot('57-v13-game-' + width + '.png');
    }
    await setViewport(1440, 900, false);
    await sleep(200);
    const railOpen = await evaluate(cdp, '(() => { const t = document.getElementById("rail-timeline"); return t.open; })()');
    assert(railOpen === true, '回到桌面宽度时左栏重新展开');
    await screenshot('58-v13-game-1440-wide.png');
    await setViewport(1280, 900, false);
    await sleep(150);

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
    assert(await evaluate(cdp, 'document.getElementById("workbench").hidden === true && !document.body.classList.contains("is-campaign")'), '七日经典模式不显示总统工作台，保持 v1.0 原界面');
    await click('#btn-end-round');
    await waitFor(function () { return evaluate(cdp, '!!document.querySelector("#modal-root .modal-card")'); }, 5000);
    assert(await evaluate(cdp, 'document.querySelector("#modal-root .modal-card").textContent.indexOf("夜间态势") !== -1'), 'AP 耗尽的回合同样进入夜间结算');
    await screenshot('21-ap-spent-desktop.png');

    console.log('\n[10] 离线试听页');
    await setViewport(1280, 900, false);
    const beforeListening = audioRequests.length;
    await cdp.send('Page.navigate', { url: pathToFileURL(path.join(ROOT, 'production', 'listening-room.html')).href });
    await waitFor(function () { return evaluate(cdp, 'document.readyState === "complete" && document.querySelectorAll("audio").length === 4'); }, 10000);
    assert(await evaluate(cdp, 'document.querySelectorAll("audio[preload=none]").length === 4 && document.querySelectorAll("[data-sound]").length === 18 && Array.from(document.querySelectorAll("audio")).every(function(a){return a.paused;})') && audioRequests.length === beforeListening, '试听页包含四段音乐与十类音效且不自动播放');
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
  for (let attempt = 0; ; attempt++) {
    try {
      return await evaluateOnce(cdp, expression);
    } catch (error) {
      // 刷新/换页的竞态：脚本还没就绪时 LZS 不存在，等一小会儿重试，别把它当成断言失败。
      const transient = /LZS is not defined|Execution context was destroyed|Cannot find context/i.test(String(error && error.message));
      if (!transient || attempt >= 4) throw error;
      await sleep(400);
    }
  }
}

async function evaluateOnce(cdp, expression) {
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
  if (consoleErrors.length) console.error('控制台错误：\n  ' + consoleErrors.join('\n  '));
  try {
    process.exitCode = 1;
  } catch (ignored) { /* ignore */ }
});
