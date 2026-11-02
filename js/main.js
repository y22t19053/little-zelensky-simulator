/*
 * 小泽模拟器 · v0.3.0 界面层
 * 只负责渲染、输入与存档调用；所有规则仍在 js/engine.js。
 */
(function () {
  'use strict';

  const L = window.LZS;
  if (!L) {
    document.body.innerHTML = '<main class="fatal"><h1>载入失败</h1><p>找不到游戏引擎。请确认 js/events.js 与 js/engine.js 位于正确位置。</p></main>';
    return;
  }

  const A = window.LZS_AUDIO || null;
  const el = {
    intro: document.getElementById('screen-intro'),
    game: document.getElementById('screen-game'),
    ending: document.getElementById('screen-ending'),
    start: document.getElementById('btn-start'),
    continue: document.getElementById('btn-continue'),
    clearSave: document.getElementById('btn-clear-save'),
    how: document.getElementById('btn-how'),
    disclaimer: document.getElementById('btn-disclaimer'),
    saveSummary: document.getElementById('save-summary'),
    gameDate: document.getElementById('game-date'),
    gamePhase: document.getElementById('game-phase'),
    pressureValue: document.getElementById('pressure-value'),
    pressureTag: document.getElementById('pressure-tag'),
    pressureFill: document.getElementById('pressure-fill'),
    pressureTrack: document.getElementById('pressure-track'),
    pressureNote: document.getElementById('pressure-note'),
    apValue: document.getElementById('ap-value'),
    apPips: document.getElementById('ap-pips'),
    apNote: document.getElementById('ap-note'),
    eventMain: document.getElementById('event-main'),
    choicesPanel: document.getElementById('choices-panel'),
    commandPanel: document.getElementById('command-panel'),
    opsBtn: document.getElementById('btn-ops'),
    statsPanel: document.getElementById('stats-panel'),
    forecastPanel: document.getElementById('forecast-panel'),
    pendingPanel: document.getElementById('pending-panel'),
    logPanel: document.getElementById('log-panel'),
    orderTitle: document.getElementById('order-title'),
    orderMeta: document.getElementById('order-meta'),
    issue: document.getElementById('btn-issue'),
    issueLabel: document.getElementById('issue-label'),
    issueCost: document.getElementById('issue-cost'),
    endRound: document.getElementById('btn-end-round'),
    saveBtn: document.getElementById('btn-save'),
    logBtn: document.getElementById('btn-log'),
    helpBtn: document.getElementById('btn-help'),
    audioBtn: document.getElementById('btn-audio'),
    audioIntroBtn: document.getElementById('btn-audio-intro'),
    menuBtn: document.getElementById('btn-menu'),
    modalRoot: document.getElementById('modal-root'),
    toastRoot: document.getElementById('toast-root')
  };

  const ui = {
    game: null,
    screen: 'intro',
    selectedChoiceId: null,
    busy: false,
    lastDeltas: null,
    lastPressureDelta: 0,
    modalLastFocus: null,
    modalDismissible: true,
    toastTimer: null,
    statesOpen: !window.matchMedia('(max-width: 700px)').matches,
    intelCategory: 'military',
    opsTab: 'intel'
  };

  const LOG_TYPE_LABEL = {
    system: '系统', decision: '决策', pressure: '压力', attrition: '侵蚀', delayed: '延迟', ending: '判定',
    command: '命令', execution: '执行', intel: '情报', coordination: '协调', communication: '沟通'
  };
  const EVENT_ART = {
    e1: { id: 'invasion', alt: '总统办公室、危机简报与多方向入侵模拟示意', caption: '总统办公室 · 危机简报 · 国土示意' },
    e2: { id: 'location', alt: '总统办公室、城市空间与指挥连续性处境的编辑拼贴', caption: '总统所在地 · 政治可见性与指挥连续性' },
    e3: { id: 'hostomel', alt: '霍斯托梅尔机场空间与周边态势模拟示意', caption: '霍斯托梅尔机场 · 空间与态势模拟示意' },
    e4: { id: 'capital-night', alt: '夜间基辅、街区宵禁与检查站的档案式场景', caption: '首都之夜 · 宵禁、街区与检查站' },
    e5: { id: 'two-fronts', alt: '南部与东部压力以及有限资源分配的政治编辑插画', caption: '两条战线 · 资源分配模拟示意' },
    e6: { id: 'diplomacy', alt: '外交文件、电话与援助请求组成的战时档案拼贴', caption: '外交档案 · 援助请求与谈判时间差' },
    e7: { id: 'seventh-night', alt: '铁路、燃料、后勤和人道撤离组成的夜间场景', caption: '第七夜 · 铁路、燃料与人道撤离' }
  };

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function formatSigned(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n === 0) return '0';
    return n > 0 ? '+' + n : String(n);
  }

  function statLabel(key) { return L.statMeta[key] ? L.statMeta[key].short : key; }
  function statFullLabel(key) { return L.statMeta[key] ? L.statMeta[key].label : key; }
  function pressureLabel(value) { return L.pressureLabel ? L.pressureLabel(value) : String(value); }

  function effectMagnitude(value) {
    const n = Math.abs(Number(value) || 0);
    if (!n) return '';
    if (n <= 3) return '轻微';
    if (n <= 6) return '明显';
    return '显著';
  }

  function alarmMap(alarms) {
    const map = {};
    (alarms || []).forEach(function (alarm) { map[alarm.key] = alarm; });
    return map;
  }

  function showScreen(name) {
    const map = { intro: el.intro, game: el.game, ending: el.ending };
    Object.keys(map).forEach(function (key) { map[key].hidden = key !== name; });
    ui.screen = name;
    document.body.classList.toggle('is-playing', name === 'game');
    document.title = name === 'intro' ? '小泽模拟器 · 你能顶住几天？' : name === 'ending' ? '阶段结局 · 小泽模拟器' : '总统办公室 · 小泽模拟器';
    if (A) A.setTheme(name === 'intro' ? 'menu' : name === 'ending' ? 'ending' : (ui.game && ui.game.phase === 'interlude' ? 'night' : 'day'));
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function toast(message, isError) {
    if (!el.toastRoot || !message) return;
    window.clearTimeout(ui.toastTimer);
    el.toastRoot.replaceChildren();
    const node = document.createElement('div');
    node.className = 'toast' + (isError ? ' is-error' : '');
    node.textContent = message;
    el.toastRoot.appendChild(node);
    ui.toastTimer = window.setTimeout(function () { el.toastRoot.replaceChildren(); }, 3200);
  }

  function clearToasts() {
    if (!el.toastRoot) return;
    window.clearTimeout(ui.toastTimer);
    el.toastRoot.replaceChildren();
  }

  function saveGame(manual) {
    if (!ui.game) return false;
    const ok = L.saveGame(ui.game);
    if (manual) toast(ok ? '进度已保存到本机浏览器。' : '无法写入本机存储：浏览器可能处于隐私模式或禁用了 LocalStorage。', !ok);
    return ok;
  }

  /* 开场与资料 */
  function renderIntro() {
    closeModal();
    ui.selectedChoiceId = null;
    ui.lastDeltas = null;
    ui.game = null;
    showScreen('intro');
    const summary = L.getSaveSummary();
    const hasSave = !!summary;
    el.continue.hidden = !hasSave;
    el.clearSave.hidden = !hasSave;
    el.saveSummary.hidden = !hasSave;
    const startLabel = el.start.querySelector('span');
    if (startLabel) startLabel.textContent = hasSave ? '开始新一局' : '进入总统办公室';
    if (hasSave) {
      el.continue.textContent = summary.phase === 'ending' ? '查看上次结局' : '继续上一局';
      const stateText = summary.phase === 'ending' ? '已结束 · ' + (summary.endingTitle || '阶段结局') : '进行中 · 剩余 ' + summary.ap + ' AP';
      el.saveSummary.innerHTML = '本机存档：<strong>' + escapeHtml(summary.dateLabel) + '</strong> · 第 ' + summary.round + ' / ' + L.finalRound + ' 回合 · ' + escapeHtml(stateText);
    } else {
      el.saveSummary.textContent = '';
    }
  }

  function requestStart() {
    if (L.hasSave()) {
      const summary = L.getSaveSummary();
      openConfirm({
        kicker: '覆盖确认', title: '开始新一局？',
        message: '<p>本机已有一局进度：<strong>' + escapeHtml(summary ? summary.dateLabel : '') + '</strong>，第 ' + (summary ? summary.round : '?') + ' 回合。</p><p>开始新一局会覆盖这份存档。</p>',
        confirmLabel: '覆盖并开始', onConfirm: function () { startNewGame(true); }
      });
      return;
    }
    startNewGame(true);
  }

  function startNewGame(force) {
    if (!force && L.hasSave()) return;
    L.deleteSave();
    if (A) A.playSfx('menu');
    ui.game = L.createGame();
    ui.selectedChoiceId = null;
    ui.lastDeltas = null;
    ui.lastPressureDelta = 0;
    saveGame(false);
    enterGame();
  }

  function loadGame() {
    const data = L.loadSavedGame();
    if (!data || !data.state) {
      toast('没有找到可读取的存档。', true);
      renderIntro();
      return;
    }
    ui.game = data.state;
    ui.selectedChoiceId = null;
    ui.lastDeltas = null;
    ui.lastPressureDelta = 0;
    if (ui.game.phase === 'ending') showEnding(); else enterGame();
  }

  function enterGame() {
    if (!ui.game) return;
    if (ui.game.phase === 'ending') { showEnding(); return; }
    showScreen('game');
    renderGame();
    if (ui.game.phase === 'interlude' && ui.game.interlude) openInterlude(ui.game.interlude);
  }

  function openHowToPlay() {
    openModal({
      kicker: '总统办公室 / 新手指引', title: '你要管理的是注意力',
      body: '<div class="help-grid">' +
        '<section><span>01</span><h3>读局势</h3><p>每回合先看事件视觉、情报摘要与国家状态。情报可信度描述信息边界，不代表成功率。</p></section>' +
        '<section><span>02</span><h3>分配 3 AP</h3><p>选择文件查看收益、代价、定性量级与延迟回合。可以签发多项，也可以保留未用 AP，但它不会结转。</p></section>' +
        '<section><span>03</span><h3>签发并归档</h3><p>固定底栏是签发前确认。签发后显示引擎结算的实际数值；互斥命令不能同时执行。</p></section>' +
        '<section><span>04</span><h3>承担夜晚</h3><p>结束回合后，命令归档、延迟后果、状态侵蚀和战争压力依次结算。撑过七回合，或在途中面对崩溃判定。</p></section>' +
        '</div><p class="modal-note">键盘：Tab 移动焦点，Enter 或空格选择文件，Escape 关闭可关闭的窗口。手机可展开“国家状态”查看全部七项。</p>',
      actions: [{ label: '明白', className: 'btn btn-primary', onClick: function () {} }]
    });
  }

  function openDisclaimer() {
    openModal({
      kicker: '资料边界 / DISCLAIMER', title: '历史情景，不是历史复原',
      body: '<div class="confirm-copy"><p>背景为 2022 年 2 月 24 日至 3 月 2 日。事件顺序参考公开资料；文电、幕僚评估和情境叙述为合成文本，不冒充真实档案，不虚构真实人物引语。</p><p><strong>所有 AP、状态、战争压力、效果和阈值都是模拟设计参数，不是历史统计。</strong>游戏不会用后见之明给玩家提示，也不评价真实人物的能力。</p><p>完整事实、当时认知、后来确认、争议与来源在结局后的独立历史复盘中开放。复盘正文离线可读；外部来源链接只有主动点击时才访问网络。</p></div>',
      actions: [{ label: '关闭', className: 'btn btn-ghost', onClick: function () {} }]
    });
  }

  function openOperations(tab) {
    if (!ui.game) return;
    ui.opsTab = tab || 'intel';
    openModal({
      kicker: '总统幕僚台 / ATTENTION IS THE SCARCE RESOURCE',
      title: '情报、命令与协调',
      wide: true,
      className: 'ops-modal',
      body: '<div class="ops-tabs" role="tablist" aria-label="幕僚台栏目">' +
        '<button type="button" role="tab" data-ops-tab="intel">情报桌</button>' +
        '<button type="button" role="tab" data-ops-tab="commands">命令追踪</button>' +
        '<button type="button" role="tab" data-ops-tab="agencies">机构协调</button>' +
        '<button type="button" role="tab" data-ops-tab="comms">沟通渠道</button>' +
        '</div><div id="ops-body" class="ops-body"></div>',
      actions: [{ label: '关闭幕僚台', className: 'btn btn-ghost', onClick: function () {} }],
      onMount: function (card) {
        function bindTabs() {
          Array.prototype.forEach.call(card.querySelectorAll('[data-ops-tab]'), function (button) {
            button.addEventListener('click', function () {
              ui.opsTab = button.getAttribute('data-ops-tab');
              renderOpsBody(card);
            });
          });
        }
        bindTabs();
        renderOpsBody(card);
      }
    });
  }

  function rerenderOps(card) {
    if (!card || !document.contains(card)) return;
    renderOpsBody(card);
  }

  function renderOpsBody(card) {
    const body = card.querySelector('#ops-body');
    if (!body) return;
    Array.prototype.forEach.call(card.querySelectorAll('[data-ops-tab]'), function (button) {
      const active = button.getAttribute('data-ops-tab') === ui.opsTab;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    if (ui.opsTab === 'intel') renderIntelDesk(body, card);
    else if (ui.opsTab === 'commands') renderCommandDesk(body, card);
    else if (ui.opsTab === 'agencies') renderAgencyDesk(body, card);
    else renderCommsDesk(body, card);
  }

  function renderIntelDesk(body, card) {
    const g = ui.game;
    const reports = L.getIntelReports(g);
    if (!reports.length) { body.innerHTML = '<p class="empty-note">当前没有可读情报。</p>'; return; }
    let report = reports.filter(function (item) { return item.category === ui.intelCategory; })[0] || reports[0];
    ui.intelCategory = report.category;
    if (!report.read) {
      L.markIntelRead(g, report.id);
      saveGame(false);
      report = L.getIntelReport(g, report.id) || report;
    }
    const tabs = reports.map(function (item) {
      return '<button type="button" class="intel-tab' + (item.category === report.category ? ' is-active' : '') + '" data-intel-category="' + escapeHtml(item.category) + '"><span>' + escapeHtml(item.label) + '</span><small>' + escapeHtml(item.status) + (item.pinned ? ' · 收藏' : '') + '</small></button>';
    }).join('');
    const related = report.relatedChoiceIds.map(function (id) {
      const event = L.getEvent(g);
      const choice = L.getChoice(event, id);
      if (!choice) return '';
      const status = L.getChoiceStatus(g, id);
      return '<button type="button" class="intel-related" data-related-choice="' + escapeHtml(id) + '"' + (!status.canIssue ? ' disabled' : '') + '><strong>' + escapeHtml(choice.title) + '</strong><span>' + choice.ap + ' AP · ' + (status.canIssue ? '可签发' : status.message) + '</span></button>';
    }).join('');
    const rows = report.values.map(function (item) { return '<span class="intel-reading"><small>' + escapeHtml(statFullLabel(item.key)) + '</small><strong>' + item.value + '</strong></span>'; }).join('');
    body.innerHTML = '<div class="intel-layout"><nav class="intel-nav" aria-label="六类情报桌">' + tabs + '</nav><article class="intel-report">' +
      '<div class="intel-report-head"><div><span class="intel-kicker">' + escapeHtml(report.kicker) + ' / ' + escapeHtml(report.status) + '</span><h3>' + escapeHtml(report.label) + '</h3></div><button type="button" class="mini-action" data-pin="' + escapeHtml(report.id) + '">' + (report.pinned ? '取消收藏' : '收藏') + '</button></div>' +
      '<div class="intel-meta"><span>' + escapeHtml(report.source) + '</span><span>' + escapeHtml(report.time) + '</span><span>可信度 <strong>' + escapeHtml(report.confidence) + '</strong></span></div>' +
      '<p class="intel-focus">' + escapeHtml(report.focus) + '<span class="intel-readings">' + rows + '</span></p>' +
      '<div class="intel-columns"><section><h4>已确认</h4><ul>' + report.confirmed.map(function (text) { return '<li>' + escapeHtml(text) + '</li>'; }).join('') + '</ul></section>' +
      '<section class="is-unknown"><h4>无法确认</h4><ul>' + report.unconfirmed.map(function (text) { return '<li>' + escapeHtml(text) + '</li>'; }).join('') + '</ul></section></div>' +
      '<div class="intel-inquiry"><span>追问 / INQUIRY</span><p>' + escapeHtml(report.inquiry) + '</p><button type="button" class="mini-action is-primary" data-inquire="' + escapeHtml(report.id) + '"' + (report.inquired || g.ap < 1 ? ' disabled' : '') + '>' + (report.inquired ? '已追问 · 不重复消耗' : '追问补充 · 1 AP') + '</button></div>' +
      '<p class="intel-boundary">' + escapeHtml(report.confidenceNote) + ' ' + escapeHtml(report.disclaimer) + '</p>' +
      '<div class="intel-related-wrap"><span>关联决策</span><div class="intel-related-list">' + (related || '<span class="empty-note">当前没有关联命令。</span>') + '</div></div>' +
      '</article></div>';
    Array.prototype.forEach.call(body.querySelectorAll('[data-intel-category]'), function (button) {
      button.addEventListener('click', function () { ui.intelCategory = button.getAttribute('data-intel-category'); renderOpsBody(card); });
    });
    const pin = body.querySelector('[data-pin]');
    if (pin) pin.addEventListener('click', function () {
      L.toggleIntelPin(g, pin.getAttribute('data-pin'));
      saveGame(false);
      renderOpsBody(card);
    });
    const inquire = body.querySelector('[data-inquire]');
    if (inquire) inquire.addEventListener('click', function () {
      const result = L.inquireIntel(g, report.id);
      if (!result.ok) { toast(result.error || '无法追问。', true); return; }
      if (A) A.playSfx('select');
      saveGame(false);
      renderGame();
      renderOpsBody(card);
      toast('补充说明已放入情报桌。追问只改变信息，不直接改国家数值。');
    });
    Array.prototype.forEach.call(body.querySelectorAll('[data-related-choice]'), function (button) {
      button.addEventListener('click', function () {
        closeModal();
        selectChoice(button.getAttribute('data-related-choice'));
        el.choicesPanel.scrollIntoView({ block: 'start', behavior: 'smooth' });
      });
    });
  }

  function renderCommandDesk(body, card) {
    const g = ui.game;
    const commands = (g.commands || []).slice().reverse();
    const stage = '<div class="lifecycle" aria-label="命令生命周期"><span>已签发</span><span>已接收</span><span>执行中</span><span>等待反馈</span><span>已完成</span></div>';
    const bodyHtml = commands.length ? '<ol class="command-desk-list">' + commands.map(function (command) {
      return '<li class="command-desk-row"><div class="command-row-top"><span class="command-status">' + escapeHtml(commandStatusLabel(command.status)) + '</span><span class="command-agency">' + escapeHtml(agencyLabel(command.agency)) + '</span><span class="command-round">R' + command.round + '</span></div><h3>' + escapeHtml(command.title) + '</h3><p>' + escapeHtml(command.blockedReason || command.lastNote || '等待下一步总统动作。') + '</p>' + commandActions(command) + '</li>';
    }).join('') + '</ol>' : '<p class="empty-note">还没有命令。选择一项决策并签发给相应机构后，它会在这里进入生命周期。</p>';
    body.innerHTML = '<p class="ops-lead">阅读情报不耗 AP；签发命令按卡面扣 AP；授权不额外消耗，但夜间才会执行。跨部门命令需要召集或委派，否则会阻塞。跟进消耗 1 AP，每个命令每回合最多一次。</p>' + stage + bodyHtml;
    bindCommandActions(body);
  }

  function renderAgencyDesk(body, card) {
    const g = ui.game;
    const cards = L.intel.agencies.map(function (agency) {
      const state = g.agencies[agency.id] || { coordination: 50, workload: 0 };
      const active = (g.commands || []).filter(function (command) { return command.agency === agency.id && command.status !== 'completed'; }).length;
      const done = !!g.coordinationThisRound[agency.id];
      return '<article class="agency-card"><div class="agency-card-head"><span class="agency-code">' + escapeHtml(agency.short) + '</span><div><h3>' + escapeHtml(agency.label) + '</h3><p>' + escapeHtml(agency.focus) + '</p></div></div>' +
        '<div class="agency-meters"><span><small>协调余量</small><strong>' + state.coordination + '</strong></span><span><small>在办命令</small><strong>' + active + '</strong></span></div>' +
        '<button type="button" class="mini-action' + (done ? '' : ' is-primary') + '" data-coordinate="' + escapeHtml(agency.id) + '"' + (done || g.ap < 1 ? ' disabled' : '') + '>' + (done ? '本回合已召集' : '召集协调 · 1 AP') + '</button></article>';
    }).join('');
    body.innerHTML = '<p class="ops-lead">机构不是数值装饰：命令会进入具体执行机构。跨部门行动若没有总统召集，夜间会被阻塞；委派可以换一个执行者，但不能消除代价。</p><div class="agency-grid">' + cards + '</div>';
    Array.prototype.forEach.call(body.querySelectorAll('[data-coordinate]'), function (button) {
      button.addEventListener('click', function () {
        const result = L.coordinateAgency(g, button.getAttribute('data-coordinate'));
        if (!result.ok) { toast(result.error || '无法召集。', true); return; }
        if (A) A.playSfx('issue');
        saveGame(false);
        renderGame();
        renderOpsBody(card);
        toast('协调会已召集；相关命令本回合不再因跨部门条件阻塞。');
      });
    });
  }

  function renderCommsDesk(body, card) {
    const g = ui.game;
    const cards = L.intel.communications.map(function (channel) {
      const used = !!g.communicationsThisRound[channel.id];
      return '<article class="comm-card"><div><span class="panel-kicker">' + escapeHtml(agencyLabel(channel.agency)) + '</span><h3>' + escapeHtml(channel.label) + '</h3><p>' + escapeHtml(channel.note) + '</p><div class="effect-row">' + effectChips(channel.effects) + '</div></div>' +
        '<button type="button" class="mini-action' + (used ? '' : ' is-primary') + '" data-communicate="' + escapeHtml(channel.id) + '"' + (used || g.ap < 1 ? ' disabled' : '') + '>' + (used ? '本回合已使用' : '沟通 · 1 AP · 明夜反馈') + '</button></article>';
    }).join('');
    body.innerHTML = '<p class="ops-lead">沟通会占用 1 AP，并建立一个跨日反馈。它不是免费增益：效果在下一夜才进入台账，期间局势会继续变化。</p><div class="comm-grid">' + cards + '</div>';
    Array.prototype.forEach.call(body.querySelectorAll('[data-communicate]'), function (button) {
      button.addEventListener('click', function () {
        const result = L.communicate(g, button.getAttribute('data-communicate'));
        if (!result.ok) { toast(result.error || '无法沟通。', true); return; }
        if (A) A.playSfx('issue');
        saveGame(false);
        renderGame();
        renderOpsBody(card);
        toast('沟通渠道已建立；反馈将在下一夜结算。');
      });
    });
  }

  /* 核心渲染 */
  function renderGame() {
    if (!ui.game) return;
    if (ui.game.phase === 'ending') { showEnding(); return; }
    const event = L.getEvent(ui.game);
    if (!event) { toast('事件数据缺失，无法继续。', true); return; }
    renderTop();
    renderEvent();
    renderCommandPanel();
    renderStats();
    renderForecast();
    renderPending();
    renderLogPanel();
    renderChoices(event);
    renderOrder();
  }

  function renderTop() {
    const g = ui.game;
    const event = L.getEvent(g);
    if (!event) return;
    const alarms = alarmMap(L.getAlarms(g));
    el.gameDate.textContent = event.dateLabel;
    el.gamePhase.textContent = '第 ' + g.round + ' / ' + L.finalRound + ' 回合 · ' + event.time;
    el.pressureValue.textContent = g.pressure;
    el.pressureTag.textContent = pressureLabel(g.pressure);
    el.pressureTag.className = 'pressure-tag' + (alarms.pressure ? ' is-' + alarms.pressure.level : '');
    el.pressureFill.style.width = Math.max(0, Math.min(100, g.pressure)) + '%';
    el.pressureFill.className = 'pressure-fill' + (alarms.pressure ? ' is-' + alarms.pressure.level : '');
    el.pressureTrack.setAttribute('aria-label', '战争压力 ' + g.pressure + ' / 100，' + pressureLabel(g.pressure));
    el.pressureNote.textContent = alarms.pressure ? '现有告警：战争压力' + (alarms.pressure.level === 'critical' ? '危急' : '升高') + '。夜间侵蚀仍按原规则结算。' : '当前未触发战争压力告警；夜间侵蚀仍会发生。';
    el.apValue.textContent = g.ap;
    el.apPips.innerHTML = Array.from({ length: g.apMax }, function (_, i) { return '<span class="ap-pip' + (i >= g.ap ? ' is-spent' : '') + '"></span>'; }).join('');
    el.apPips.setAttribute('aria-label', '剩余注意力 ' + g.ap + ' 点');
    const available = L.getAvailableChoices(g).length;
    if (g.phase !== 'briefing') el.apNote.textContent = '本回合正在结算。';
    else if (g.ap <= 0) el.apNote.textContent = '注意力已耗尽，请结束本回合。';
    else if (!available) el.apNote.textContent = '剩余 AP 已不足以签发任何文件。';
    else el.apNote.textContent = '还可分配 ' + g.ap + ' 点注意力；未使用的 AP 不会保留。';
  }

  function renderEvent() {
    const g = ui.game;
    const event = L.getEvent(g);
    const art = EVENT_ART[event.id] || EVENT_ART.e1;
    const intel = event.intel || { level: '未知', note: '' };
    const situation = event.situation || [];
    el.eventMain.innerHTML =
      '<div class="event-stage">' +
        '<figure class="scene scene-' + escapeHtml(event.id) + '">' +
          '<div class="scene-index"><span>事件视觉 / ' + String(g.round).padStart(2, '0') + '</span><span>模拟示意</span></div>' +
          '<picture class="scene-picture"><source srcset="assets/visual/events/' + art.id + '.webp" type="image/webp"><img data-event-art="' + art.id + '" src="assets/events/' + art.id + '.svg" alt="' + escapeHtml(art.alt) + '" width="1152" height="640"></picture>' +
          '<img class="scene-map" src="assets/visual/maps/' + art.id + '.svg" alt="抽象态势示意，不表示实时前线或兵力" width="640" height="360" loading="lazy">' +
          '<figcaption><span>' + escapeHtml(art.caption) + '</span><span>本地生成视觉 · 非历史照片</span></figcaption>' +
        '</figure>' +
        '<article class="briefing-paper dossier">' +
          '<div class="paper-classification"><span>总统办公室 / 收文</span><span>LZS-' + String(g.round).padStart(2, '0') + '</span></div>' +
          '<p class="dossier-kicker">' + escapeHtml(event.kicker) + '</p>' +
          '<h1 class="dossier-title">' + escapeHtml(event.title) + '</h1>' +
          '<div class="intel-band"><span>情报可信度 <strong>' + escapeHtml(intel.level) + '</strong></span><p>' + escapeHtml(intel.note) + '</p></div>' +
          '<div class="situation"><p>' + escapeHtml(situation[0] || '') + '</p></div>' +
          '<details class="intel-details epistemics"><summary>展开完整简报与信息边界</summary><div class="intel-details-body">' +
            situation.slice(1).map(function (text) { return '<p>' + escapeHtml(text) + '</p>'; }).join('') +
            '<div class="epistemic-grid"><section class="epistemic-block"><h2>当时已知</h2>' + listHtml(event.known) + '</section>' +
            '<section class="epistemic-block is-unknown"><h2>当时无法确认</h2>' + listHtml(event.unknown) + '</section></div>' +
            '<p class="epistemic-note">信息空白来自总统视角；游戏不会暗中改变规则或添加随机效果。</p>' +
          '</div></details>' +
          '<div class="dossier-foot"><span>文电为合成文本</span><span>参数为模拟设计值</span></div>' +
        '</article>' +
      '</div>';
  }

  function listHtml(items) {
    if (!items || !items.length) return '<ul class="epistemic-list"><li>暂无可靠条目。</li></ul>';
    return '<ul class="epistemic-list">' + items.map(function (item) { return '<li>' + escapeHtml(item) + '</li>'; }).join('') + '</ul>';
  }

  function choiceHint() {
    const g = ui.game;
    if (g.phase !== 'briefing') return '本回合正在结算';
    if (g.ap <= 0) return '注意力已耗尽 · 请结束回合';
    if (!L.getAvailableChoices(g).length) return '剩余 AP 不足 · 请结束回合';
    return '选择文件展开评估 · 底栏确认签发';
  }

  function effectChips(effects, pressureDelta) {
    const chips = [];
    L.statKeys.forEach(function (key) {
      const value = effects && effects[key];
      if (!value) return;
      chips.push('<span class="effect-chip ' + (value > 0 ? 'is-pos' : 'is-neg') + '">' + escapeHtml(statFullLabel(key)) + ' <strong>' + formatSigned(value) + '</strong></span>');
    });
    const pressure = pressureDelta != null ? pressureDelta : effects && effects.pressure;
    if (pressure) chips.push('<span class="effect-chip is-pressure">战争压力 <strong>' + formatSigned(pressure) + '</strong></span>');
    return chips.join('');
  }

  function effectForecast(effects) {
    const parts = [];
    L.statKeys.forEach(function (key) {
      const value = effects && effects[key];
      if (!value) return;
      parts.push('<span class="forecast-effect ' + (value > 0 ? 'is-pos' : 'is-neg') + '">' + escapeHtml(statFullLabel(key)) + ' ' + (value > 0 ? '↑' : '↓') + ' ' + effectMagnitude(value) + '</span>');
    });
    if (effects && effects.pressure) parts.push('<span class="forecast-effect ' + (effects.pressure > 0 ? 'is-neg' : 'is-pos') + '">战争压力 ' + (effects.pressure > 0 ? '↑' : '↓') + ' ' + effectMagnitude(effects.pressure) + '</span>');
    return parts.length ? parts.join('') : '<span class="forecast-effect">无可测量的即时状态变化</span>';
  }

  function delayDueLabel(delay) {
    const due = (ui.game ? ui.game.round : 1) + Number(delay || 0);
    const event = L.events[due - 1];
    return '第 ' + due + ' 回合 · ' + (event ? event.dateLabel : '阶段结束后');
  }

  function delayDetails(choice) {
    if (!choice.delayed || !choice.delayed.length) return '<p class="choice-delay">无额外延迟效果；夜间压力与侵蚀仍会结算。</p>';
    return choice.delayed.map(function (item) {
      return '<div class="choice-delay"><div><strong>' + escapeHtml(item.label) + '</strong><span>' + escapeHtml(delayDueLabel(item.delay)) + '</span></div><p>' + escapeHtml(item.note || '') + '</p><div class="effect-forecast">' + effectForecast(item.effects) + '</div></div>';
    }).join('');
  }

  function renderChoices(event) {
    const g = ui.game;
    const cards = (event.choices || []).map(function (choice, index) {
      const status = L.getChoiceStatus(g, choice.id);
      const executed = status.state === 'issued';
      const conflict = status.state === 'conflict';
      const locked = !executed && !status.canIssue;
      const selected = ui.selectedChoiceId === choice.id;
      const record = (g.choices || []).find(function (item) { return item.round === g.round && item.choiceId === choice.id; });
      const coordination = L.requiresCoordination(choice);
      const classes = ['choice-card'];
      if (executed) classes.push('is-executed');
      if (locked) classes.push('is-locked');
      if (conflict) classes.push('is-conflict');
      if (selected) classes.push('is-selected');
      const stateText = executed ? '已签发' : conflict ? '互斥锁定' : status.state === 'ap' ? 'AP 不足' : selected ? '已选择' : '选择';
      const lockNote = locked && !executed ? '<p class="choice-locked-note' + (conflict ? ' is-conflict-note' : '') + '"><strong>' + (conflict ? '命令冲突' : '注意力不足') + '：</strong>' + escapeHtml(status.message) + '</p>' : '';
      const expanded = selected || executed;
      return '<article class="' + classes.join(' ') + '" data-choice-id="' + escapeHtml(choice.id) + '" role="button" tabindex="0" aria-pressed="' + (selected ? 'true' : 'false') + '" aria-disabled="' + (locked ? 'true' : 'false') + '" aria-label="' + escapeHtml(choice.title + '，' + choice.ap + ' AP，' + stateText) + '">' +
        '<span class="choice-num" aria-hidden="true">' + String(index + 1).padStart(2, '0') + '</span>' +
        '<div class="choice-topline"><h3 class="choice-title">' + escapeHtml(choice.title) + '</h3><span class="choice-ap">' + choice.ap + ' AP</span></div>' +
        '<p class="choice-summary">' + escapeHtml(choice.summary) + '</p>' +
        '<div class="effect-forecast" aria-label="签发前定性影响">' + effectForecast(choice.effects) + '</div>' +
        (lockNote) +
        '<div class="choice-detail"' + (expanded ? '' : ' hidden') + '>' +
          '<div class="staff-note"><span>幕僚评估</span><p>' + escapeHtml(choice.staff) + '</p></div>' +
          '<div class="choice-intel">信息基础：本回合情报可信度「' + escapeHtml(event.intel.level) + '」。' + escapeHtml(event.intel.note) + '</div>' +
          '<section class="delay-details"><h4>延迟与副作用</h4>' + delayDetails(choice) + '</section>' +
        '</div>' +
        (executed && record ? '<div class="choice-actual"><span>命令执行反馈 · 实际即时变化</span><div class="effect-row">' + (effectChips(record.deltas, record.pressureDelta) || '<span class="empty-note">状态未发生可测量的变化</span>') + '</div></div>' : '') +
        '<div class="choice-footer"><span>' + (executed ? '已归档 · 不可重复结算' : coordination ? '跨部门 · 需召集或委派' : choice.delayed && choice.delayed.length ? '含延迟后果' : '仅即时效果与夜间规则') + '</span><span class="select-label">' + stateText + '</span></div>' +
        (executed ? '<span class="choice-stamp">已签发</span>' : conflict ? '<span class="choice-stamp is-conflict-stamp">互斥</span>' : '') +
      '</article>';
    }).join('');
    el.choicesPanel.innerHTML = '<div class="section-heading"><div><span class="section-kicker">DECISION FILES</span><h2 id="choices-title">待签决策文件</h2></div><span class="section-hint">' + choiceHint() + '</span></div><div class="choice-grid">' + cards + '</div>';
    bindChoiceCards();
  }

  function bindChoiceCards() {
    Array.prototype.forEach.call(el.choicesPanel.querySelectorAll('.choice-card'), function (card) {
      const choiceId = card.getAttribute('data-choice-id');
      function activate(event) {
        if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
        if (event.type === 'keydown') event.preventDefault();
        selectChoice(choiceId);
      }
      card.addEventListener('click', activate);
      card.addEventListener('keydown', activate);
    });
  }

  function selectChoice(choiceId) {
    if (!ui.game || ui.game.phase !== 'briefing' || ui.busy) return;
    const event = L.getEvent(ui.game);
    const choice = L.getChoice(event, choiceId);
    if (!choice) return;
    const status = L.getChoiceStatus(ui.game, choiceId);
    if (!status.canIssue) { if (A) A.playSfx('invalid'); toast(status.message || '这项决策当前不能签发。', true); return; }
    if (A) A.playSfx('select');
    ui.selectedChoiceId = ui.selectedChoiceId === choiceId ? null : choiceId;
    renderChoices(event);
    renderOrder();
    const selectedCard = el.choicesPanel.querySelector('[data-choice-id="' + choiceId + '"]');
    if (selectedCard && ui.selectedChoiceId) selectedCard.focus({ preventScroll: true });
  }

  function renderStats() {
    const g = ui.game;
    const alarms = L.getAlarms(g);
    const levels = alarmMap(alarms);
    const rows = L.statKeys.map(function (key) {
      const value = g.stats[key];
      const delta = ui.lastDeltas && ui.lastDeltas[key] ? ui.lastDeltas[key] : 0;
      const alarm = levels[key];
      return '<div class="stat-row' + (alarm ? ' is-' + alarm.level : '') + '">' +
        '<div class="stat-line"><span class="stat-name">' + escapeHtml(statFullLabel(key)) + '</span><span class="stat-value-wrap">' +
          (delta ? '<span class="stat-delta ' + (delta > 0 ? 'is-pos' : 'is-neg') + '">' + formatSigned(delta) + '</span>' : '') +
          '<strong class="stat-value">' + value + '</strong>' + (alarm ? '<span class="stat-risk">' + (alarm.level === 'critical' ? '危急' : '注意') + '</span>' : '') +
        '</span></div><div class="stat-track" role="img" aria-label="' + escapeHtml(statFullLabel(key) + ' ' + value + ' / 100') + '"><span class="stat-fill" style="width:' + Math.max(0, Math.min(100, value)) + '%"></span></div></div>';
    }).join('');
    const vitals = L.statKeys.slice(0, 3).map(function (key) { return '<span class="vital"><span>' + escapeHtml(statLabel(key)) + '</span><strong>' + g.stats[key] + '</strong></span>'; }).join('');
    const alarmHtml = alarms.length ? '<ul class="alarm-list">' + alarms.map(function (alarm) { return '<li class="is-' + alarm.level + '"><span>' + escapeHtml(alarm.label) + '</span><strong>' + alarm.value + '</strong></li>'; }).join('') + '</ul>' : '<p class="all-clear">当前没有触发 getAlarms() 告警。</p>';
    const notes = L.statKeys.map(function (key) {
      const delta = ui.lastDeltas && ui.lastDeltas[key] ? '；最近实际变化 ' + formatSigned(ui.lastDeltas[key]) : '';
      return '<li><strong>' + escapeHtml(statFullLabel(key)) + '</strong>：' + escapeHtml(L.statMeta[key].hint + delta) + '</li>';
    }).join('');
    el.statsPanel.innerHTML = '<details class="state-details"' + (ui.statesOpen || window.innerWidth > 700 ? ' open' : '') + '><summary><span class="state-heading"><span class="panel-kicker">NATIONAL CONDITION</span><strong id="stats-title">国家状态</strong></span><span class="mobile-vitals">' + vitals + '<span class="state-more">七项</span></span><span class="state-toggle">展开 / 收起</span></summary><div class="state-body">' + rows +
      '<section class="alarm-panel"><h3>当前告警</h3>' + alarmHtml + '</section>' +
      '<details class="state-notes"><summary>状态含义与最近变化</summary><ul>' + notes + '</ul></details>' +
      '<p class="stat-hint">风险样式只来自引擎 getAlarms()；崩溃判定仍由 checkCollapse() 独立执行。</p></div></details>';
    const details = el.statsPanel.querySelector('.state-details');
    details.addEventListener('toggle', function () { ui.statesOpen = details.open; });
  }

  function renderForecast() {
    const g = ui.game;
    const forecast = L.getPressureForecast(g);
    if (!forecast) { el.forecastPanel.innerHTML = ''; return; }
    const predicted = Object.assign({}, g, { pressure: forecast.next });
    const pressureAlarm = alarmMap(L.getAlarms(predicted)).pressure;
    const warning = forecast.next >= 100 ? '今晚将达到过载判定线。' : pressureAlarm ? '预计触发' + (pressureAlarm.level === 'critical' ? '危急' : '注意') + '告警。' : '预计不会新增压力告警。';
    el.forecastPanel.innerHTML = '<div class="panel-head"><div><span class="panel-kicker">NIGHT FORECAST</span><h2 id="forecast-title">今晚预测</h2></div><span>若现在结束</span></div>' +
      '<div class="forecast-main"><span>' + forecast.current + '</span><b aria-hidden="true">→</b><strong>' + forecast.next + '</strong><small>战争压力 +' + forecast.rise + '</small></div>' +
      '<p class="forecast-copy">' + warning + ' 预测不含尚未触发的延迟后果。</p>' +
      '<div class="forecast-attrition"><span>预计状态侵蚀</span><div class="effect-row">' + (effectChips(forecast.attrition) || '<span class="empty-note">无可测量侵蚀</span>') + '</div></div>';
  }

  function pendingDueLabel(item) {
    const diff = Math.max(0, Number(item.dueRound || 0) - (ui.game ? ui.game.round : 1));
    const event = L.events[Number(item.dueRound) - 1];
    return { short: diff ? 'D+' + diff : '今晚', full: event ? event.dateLabel : '阶段结束后' };
  }

  function renderPending() {
    const pending = (ui.game.pending || []).slice().sort(function (a, b) { return a.dueRound - b.dueRound; });
    const body = pending.length ? '<ul class="pending-list">' + pending.map(function (item) {
      const due = pendingDueLabel(item);
      return '<li><span class="pending-due">' + due.short + '</span><span><strong>' + escapeHtml(item.label) + '</strong><small>' + escapeHtml(item.sourceLabel || '') + ' · ' + escapeHtml(due.full) + '</small></span></li>';
    }).join('') + '</ul>' : '<p class="empty-note">暂无待触发的延迟后果。</p>';
    el.pendingPanel.innerHTML = '<div class="panel-head"><div><span class="panel-kicker">PENDING</span><h2 id="pending-title">延迟后果</h2></div><span>' + pending.length + ' 项</span></div>' + body;
  }

  function agencyLabel(id) {
    const agency = L.intel && L.intel.agencies ? L.intel.agencies.filter(function (item) { return item.id === id; })[0] : null;
    return agency ? agency.label : id;
  }

  function commandStatusLabel(status) {
    return L.commandLabels && L.commandLabels[status] ? L.commandLabels[status] : status;
  }

  function commandActions(command, compact) {
    const g = ui.game;
    if (!g || g.phase !== 'briefing') return '';
    const parts = [];
    if (command.status === 'issued') {
      parts.push('<button type="button" class="mini-action is-primary" data-authorize="' + escapeHtml(command.id) + '">授权执行</button>');
    }
    if (command.status === 'issued' || command.status === 'blocked' || command.status === 'executing') {
      parts.push('<button type="button" class="mini-action" data-delegate="' + escapeHtml(command.id) + '"' + (g.ap < 1 ? ' disabled' : '') + '>委派 · 1AP</button>');
    }
    if (command.status === 'executing' || command.status === 'blocked' || command.status === 'awaiting_feedback') {
      parts.push('<button type="button" class="mini-action" data-followup="' + escapeHtml(command.id) + '"' + (g.ap < 1 ? ' disabled' : '') + '>跟进 · 1AP</button>');
    }
    if (compact) return '<div class="command-actions">' + parts.join('') + '</div>';
    return '<div class="command-actions">' + parts.join('') + '</div>';
  }

  function commandRowHtml(command) {
    const record = (ui.game.choices || []).filter(function (item) { return item.commandId === command.id; })[0];
    const delta = record && record.deltas ? effectChips(record.deltas, record.pressureDelta) : '';
    return '<li class="command-row is-' + escapeHtml(command.status) + '">' +
      '<div class="command-row-top"><span class="command-status">' + escapeHtml(commandStatusLabel(command.status)) + '</span><span class="command-agency">' + escapeHtml(agencyLabel(command.agency)) + '</span></div>' +
      '<strong>' + escapeHtml(command.title) + '</strong>' +
      '<p class="command-note">' + escapeHtml(command.status === 'blocked' ? command.blockedReason : '第 ' + command.round + ' 回合签发 · ' + (command.requiredCoordination ? '跨部门授权' : '单项执行') + (command.delegated ? ' · 已委派' : '')) + '</p>' +
      (delta ? '<div class="effect-row command-result">' + delta + '</div>' : '') +
      commandActions(command, true) +
    '</li>';
  }

  function bindCommandActions(scope) {
    Array.prototype.forEach.call(scope.querySelectorAll('[data-authorize]'), function (button) {
      button.addEventListener('click', function () { authorizeCommand(button.getAttribute('data-authorize')); });
    });
    Array.prototype.forEach.call(scope.querySelectorAll('[data-delegate]'), function (button) {
      button.addEventListener('click', function () { openDelegateModal(button.getAttribute('data-delegate')); });
    });
    Array.prototype.forEach.call(scope.querySelectorAll('[data-followup]'), function (button) {
      button.addEventListener('click', function () { followUp(button.getAttribute('data-followup')); });
    });
  }

  function renderCommandPanel() {
    const g = ui.game;
    if (!el.commandPanel) return;
    const counts = L.getCommandCounts(g);
    const active = (g.commands || []).filter(function (command) { return command.status !== 'completed'; }).slice(-4).reverse();
    const body = active.length ? '<ul class="command-list">' + active.map(commandRowHtml).join('') + '</ul>' :
      '<p class="empty-note">尚未签发命令。情报阅读免费，但签发、追问、召集与委派都消耗总统注意力。</p>';
    el.commandPanel.innerHTML = '<div class="panel-head"><div><span class="panel-kicker">COMMAND DESK</span><h2 id="command-title">命令中心</h2></div><span>' + counts.active + ' 进行中</span></div>' +
      body + '<div class="command-panel-foot"><span>已签发 ' + counts.total + ' · 待授权 ' + (g.commands || []).filter(function (command) { return command.status === 'issued'; }).length + ' · 阻塞 ' + counts.blocked + '</span><button type="button" class="text-btn" id="btn-open-ops">打开幕僚台</button></div>';
    bindCommandActions(el.commandPanel);
    const btn = document.getElementById('btn-open-ops');
    if (btn) btn.addEventListener('click', function () { openOperations('commands'); });
  }

  function authorizeCommand(commandId) {
    if (ui.busy || !ui.game || ui.game.phase !== 'briefing') return;
    const result = L.authorizeCommand(ui.game, commandId);
    if (!result.ok) { if (A) A.playSfx('invalid'); toast(result.error || '无法授权。', true); return; }
    if (A) A.playSfx('issue');
    saveGame(false);
    renderGame();
    toast('已授权：' + result.command.title + '。本夜将结算执行情况。');
  }

  function followUp(commandId) {
    if (ui.busy || !ui.game) return;
    const result = L.followUpCommand(ui.game, commandId);
    if (!result.ok) { if (A) A.playSfx('invalid'); toast(result.error || '无法跟进。', true); return; }
    if (A) A.playSfx('issue');
    ui.lastDeltas = result.deltas || {};
    ui.lastPressureDelta = result.pressureDelta || 0;
    saveGame(false);
    if (result.ending) { showEnding(); return; }
    renderGame();
    toast(result.deltas && Object.keys(result.deltas).length ? '已跟进并放行执行，实际变化已记录。' : '已跟进：执行反馈核验完毕。');
  }

  function openDelegateModal(commandId) {
    const command = (ui.game.commands || []).filter(function (item) { return item.id === commandId; })[0];
    if (!command) return;
    const buttons = L.intel.agencies.map(function (agency) {
      return '<button type="button" class="agency-choice" data-delegate-agency="' + escapeHtml(agency.id) + '"><strong>' + escapeHtml(agency.label) + '</strong><span>' + escapeHtml(agency.focus) + '</span></button>';
    }).join('');
    openModal({
      kicker: '委派 / 1 AP', title: '把“' + command.title + '”交给谁？',
      body: '<p class="modal-lead">委派会改变执行机构，绕过原部门的协调阻塞；但仍需总统在夜间承担结果。此操作消耗 1 AP。</p><div class="agency-picker">' + buttons + '</div>',
      actions: [{ label: '取消', className: 'btn btn-ghost', onClick: function () {} }],
      onMount: function (card) {
        Array.prototype.forEach.call(card.querySelectorAll('[data-delegate-agency]'), function (button) {
          button.addEventListener('click', function () {
            const result = L.delegateCommand(ui.game, commandId, button.getAttribute('data-delegate-agency'));
            if (!result.ok) { toast(result.error || '无法委派。', true); return; }
            if (A) A.playSfx('issue');
            closeModal();
            saveGame(false);
            renderGame();
            toast('已委派给' + agencyLabel(button.getAttribute('data-delegate-agency')) + '。');
          });
        });
      }
    });
  }

  function logEntryHtml(entry, full) {
    return '<div class="log-entry is-' + escapeHtml(entry.type || 'system') + '"><div class="log-meta"><span>R' + escapeHtml(entry.round) + '</span><span>' + escapeHtml(LOG_TYPE_LABEL[entry.type] || entry.type) + '</span></div><strong>' + escapeHtml(entry.title) + '</strong>' + (full || entry.text ? '<p>' + escapeHtml(entry.text || '') + '</p>' : '') + '</div>';
  }

  function renderLogPanel() {
    const entries = (ui.game.log || []).slice(-3).reverse();
    el.logPanel.innerHTML = '<div class="panel-head"><div><span class="panel-kicker">ARCHIVE</span><h2 id="log-title">最近记录</h2></div><span>' + (ui.game.log || []).length + ' 条</span></div><div class="log-list">' + (entries.length ? entries.map(function (entry) { return logEntryHtml(entry, false); }).join('') : '<p class="empty-note">还没有行动记录。</p>') + '</div><button class="log-more text-btn" type="button" id="btn-log-more">查看完整日志</button>';
    document.getElementById('btn-log-more').addEventListener('click', openLog);
  }

  function renderOrder() {
    const g = ui.game;
    if (!g) return;
    const event = L.getEvent(g);
    const choice = ui.selectedChoiceId && event ? L.getChoice(event, ui.selectedChoiceId) : null;
    const status = choice ? L.getChoiceStatus(g, choice.id) : null;
    const canIssue = !!status && status.canIssue && g.phase === 'briefing' && !ui.busy;
    if (choice) {
      el.orderTitle.textContent = choice.title;
      el.orderMeta.textContent = '成本 ' + choice.ap + ' AP · 当前剩余 ' + g.ap + ' AP · 签发后剩余 ' + (g.ap - choice.ap) + ' AP';
      el.issueCost.textContent = choice.ap + ' AP';
    } else {
      el.orderTitle.textContent = g.phase === 'briefing' ? '选择一项决策' : '本回合正在结算';
      el.orderMeta.textContent = g.phase === 'briefing' ? '先比较收益、代价与延迟后果' : '请完成夜间结算';
      el.issueCost.textContent = '—';
    }
    const unauthorized = (g.commands || []).filter(function (command) { return command.round === g.round && command.status === 'issued'; });
    el.issue.disabled = !canIssue;
    el.endRound.disabled = ui.busy || g.phase !== 'briefing' || g.executed.length === 0 || unauthorized.length > 0;
    el.endRound.textContent = g.round >= L.finalRound ? '结算本阶段' : '结束本回合';
    el.endRound.title = g.executed.length === 0 ? '至少签发一项命令，才能结束本回合。' : unauthorized.length ? '先授权或委派所有已签发命令。' : '';
  }

  /* 游戏操作：每次只调用一次引擎 */
  function issueSelected() {
    if (ui.busy || !ui.game || ui.game.phase !== 'briefing') return;
    const event = L.getEvent(ui.game);
    const choice = ui.selectedChoiceId && event ? L.getChoice(event, ui.selectedChoiceId) : null;
    if (!choice) { toast('请先选择一项决策。', true); return; }
    ui.busy = true;
    const result = L.issueCommand(ui.game, choice.id);
    ui.busy = false;
    if (!result.ok) { if (A) A.playSfx('invalid'); toast(result.error || '这项命令无法签发。', true); renderGame(); return; }
    if (A) A.playSfx('issue');
    ui.selectedChoiceId = null;
    ui.lastDeltas = null;
    ui.lastPressureDelta = 0;
    saveGame(false);
    renderGame();
    toast('已签发：' + choice.title + '。现在请授权执行，或把它委派出去。');
  }

  function endRound() {
    if (ui.busy || !ui.game || ui.game.phase !== 'briefing') return;
    if (!ui.game.executed.length) { toast('至少签发一项命令，才能结束本回合。', true); return; }
    ui.busy = true;
    const result = L.endRound(ui.game);
    ui.busy = false;
    if (!result.ok) { if (A) A.playSfx('invalid'); toast(result.error || '无法结束回合。', true); renderGame(); return; }
    if (A) A.playSfx('round');
    ui.selectedChoiceId = null;
    ui.lastDeltas = result.attrition || {};
    ui.lastPressureDelta = result.pressure ? result.pressure.after - result.pressure.before : 0;
    saveGame(false);
    if (result.ending || ui.game.phase === 'ending') { showEnding(); return; }
    renderGame();
    if (result.interlude) openInterlude(result.interlude);
  }

  /* 模态、焦点与菜单 */
  function openModal(options) {
    closeModal();
    if (A && options.className !== 'interlude-modal') A.playSfx('modal');
    const dismissible = options.dismissible !== false;
    ui.modalDismissible = dismissible;
    ui.modalLastFocus = document.activeElement;
    const actions = options.actions || [];
    const actionHtml = actions.length ? '<div class="modal-actions">' + actions.map(function (action, index) {
      return '<button type="button" class="' + (action.className || 'btn btn-ghost') + '" data-modal-action="' + index + '">' + escapeHtml(action.label) + '</button>';
    }).join('') + '</div>' : '';
    el.modalRoot.innerHTML = '<div class="modal-backdrop"><div class="modal-card' + (options.wide ? ' modal-wide' : '') + (options.className ? ' ' + escapeHtml(options.className) : '') + '" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabindex="-1">' +
      '<header class="modal-head"><div><p class="modal-kicker">' + escapeHtml(options.kicker || '总统办公室') + '</p><h2 id="modal-title" class="modal-title">' + escapeHtml(options.title || '') + '</h2></div>' + (dismissible ? '<button type="button" class="modal-close" data-modal-close aria-label="关闭">×</button>' : '') + '</header>' +
      '<div class="modal-body">' + (options.body || '') + '</div>' + actionHtml + '</div></div>';
    document.body.classList.add('modal-open');
    const backdrop = el.modalRoot.querySelector('.modal-backdrop');
    const card = el.modalRoot.querySelector('.modal-card');
    const closeBtn = el.modalRoot.querySelector('[data-modal-close]');
    if (dismissible) {
      backdrop.addEventListener('click', function (event) { if (event.target === backdrop) closeModal(); });
      if (closeBtn) closeBtn.addEventListener('click', closeModal);
    }
    Array.prototype.forEach.call(el.modalRoot.querySelectorAll('[data-modal-action]'), function (button) {
      button.addEventListener('click', function () {
        const action = actions[Number(button.getAttribute('data-modal-action'))];
        if (!action || ui.busy) return;
        if (action.close !== false) closeModal();
        if (typeof action.onClick === 'function') action.onClick();
      });
    });
    if (typeof options.onMount === 'function') options.onMount(card);
    const focusTarget = card.querySelector('[data-autofocus]') || card.querySelector('.modal-actions .btn-primary') || card.querySelector('.modal-actions .btn') || card;
    window.setTimeout(function () { if (focusTarget && typeof focusTarget.focus === 'function') focusTarget.focus(); }, 20);
  }

  function closeModal() {
    if (!el.modalRoot || !el.modalRoot.firstElementChild) { document.body.classList.remove('modal-open'); return; }
    el.modalRoot.innerHTML = '';
    document.body.classList.remove('modal-open');
    const last = ui.modalLastFocus;
    ui.modalLastFocus = null;
    if (last && typeof last.focus === 'function' && document.contains(last)) last.focus();
  }

  function modalIsOpen() { return !!(el.modalRoot && el.modalRoot.firstElementChild); }

  document.addEventListener('keydown', function (event) {
    if (!modalIsOpen()) return;
    if (event.key === 'Escape' && ui.modalDismissible) { event.preventDefault(); closeModal(); return; }
    if (event.key !== 'Tab') return;
    const card = el.modalRoot.querySelector('.modal-card');
    if (!card) return;
    const focusable = Array.prototype.filter.call(card.querySelectorAll('button:not(:disabled), [href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])'), function (node) { return node.getClientRects().length > 0; });
    if (!focusable.length) { event.preventDefault(); card.focus(); return; }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === card)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });

  function openConfirm(options) {
    openModal({
      kicker: options.kicker || '确认', title: options.title || '请确认', body: '<div class="confirm-copy">' + (options.message || '') + '</div>', dismissible: true,
      actions: [{ label: '取消', className: 'btn btn-ghost', onClick: function () {} }, { label: options.confirmLabel || '确认', className: 'btn btn-primary', onClick: function () { if (typeof options.onConfirm === 'function') options.onConfirm(); } }],
      onMount: function (card) { const primary = card.querySelector('.modal-actions .btn-primary'); if (primary) primary.setAttribute('data-autofocus', ''); }
    });
  }

  function openInterlude(data) {
    if (!data || !ui.game) return;
    if (modalIsOpen() && el.modalRoot.querySelector('[data-interlude-round="' + data.round + '"]')) return;
    clearToasts();
    if (A) A.setTheme('night');
    const pressure = data.pressure || { before: 0, rise: 0, delayed: 0, after: 0 };
    const delayed = data.delayed || [];
    const alarms = data.alarms || [];
    if (A) A.playSfx(alarms.length ? 'alert' : delayed.length ? 'delayed' : 'round');
    const commands = (ui.game.choices || []).filter(function (record) { return record.round === data.round - 1; });
    const resultByCommand = {};
    (data.commandResults || []).forEach(function (result) { resultByCommand[result.commandId] = result; });
    const commandHtml = commands.length ? commands.map(function (record) {
      const outcome = resultByCommand[record.commandId];
      const status = outcome ? outcome.status : record.status;
      const blockedNote = outcome && outcome.blockedReason ? '<p class="settlement-block-note">' + escapeHtml(outcome.blockedReason) + '</p>' : '';
      return '<li><div><strong>' + escapeHtml(record.label) + '</strong><span>' + record.ap + ' AP · ' + escapeHtml(commandStatusLabel(status)) + '</span></div>' + blockedNote + '<div class="effect-row">' + (effectChips(record.deltas, record.pressureDelta) || '<span class="empty-note">' + (status === 'blocked' ? '夜间未能执行，等待次日总统跟进或委派。' : '无即时数值变化') + '</span>') + '</div></li>';
    }).join('') : '<li>本回合没有命令记录。</li>';
    const delayedHtml = delayed.length ? delayed.map(function (item) {
      return '<li><div><strong>' + escapeHtml(item.label) + '</strong><span>第 ' + item.appliedRound + ' 回合实际触发</span></div><p>' + escapeHtml(item.note || '') + '</p><div class="effect-row">' + (effectChips(item.deltas, item.pressureDelta) || '<span class="empty-note">无数值变化</span>') + '</div></li>';
    }).join('') : '<li><p>没有延迟后果在本夜触发。</p></li>';
    const alarmHtml = alarms.length ? '<ul class="alarm-list">' + alarms.map(function (alarm) { return '<li class="is-' + alarm.level + '"><span>' + escapeHtml(alarm.label) + '</span><strong>' + alarm.value + '</strong></li>'; }).join('') + '</ul>' : '<p class="all-clear">本夜没有触发新的 getAlarms() 告警。</p>';
    openModal({
      kicker: '夜间态势 / NIGHT SETTLEMENT', title: '第 ' + (data.round - 1) + ' 夜', dismissible: false, wide: true, className: 'interlude-modal',
      body: '<div class="interlude-sheet" data-interlude-round="' + data.round + '"><div class="interlude-date"><strong>' + escapeHtml(data.dateLabel || '') + '</strong><span>夜间结算不会重复执行</span></div>' +
        '<ol class="settlement-sequence">' +
          '<li><span class="settlement-index">01</span><section><h3>今日命令归档</h3><ul class="settlement-list">' + commandHtml + '</ul></section></li>' +
          '<li><span class="settlement-index">02</span><section><h3>延迟后果 · 实际变化</h3><ul class="settlement-list">' + delayedHtml + '</ul></section></li>' +
          '<li><span class="settlement-index">03</span><section><h3>国家状态侵蚀 · 实际变化</h3><div class="effect-row">' + (effectChips(data.attrition || {}) || '<span class="empty-note">本晚没有可测量侵蚀。</span>') + '</div></section></li>' +
          '<li><span class="settlement-index">04</span><section><h3>战争压力推进 · 实际变化</h3><div class="interlude-pressure"><span>' + pressure.before + '</span><b>→</b><strong>' + pressure.after + '</strong><small>战场 +' + pressure.rise + (pressure.delayed ? ' · 延迟 ' + formatSigned(pressure.delayed) : '') + '</small></div></section></li>' +
          '<li><span class="settlement-index">05</span><section><h3>新风险</h3>' + alarmHtml + '</section></li>' +
        '</ol></div>',
      actions: [{ label: '进入 ' + (data.dateLabel || '下一日') + ' · ' + data.ap + ' AP', className: 'btn btn-primary', close: false, onClick: function () {
        if (ui.busy) return;
        ui.busy = true;
        const result = L.continueFromInterlude(ui.game);
        ui.busy = false;
        if (!result.ok) { toast(result.error || '无法进入下一回合。', true); return; }
        closeModal();
        if (A) { A.setTheme('day'); A.playSfx('round'); }
        saveGame(false);
        renderGame();
      } }],
      onMount: function (card) { const primary = card.querySelector('.modal-actions .btn-primary'); if (primary) primary.setAttribute('data-autofocus', ''); }
    });
  }

  function openAudioSettings() {
    if (!A) { toast('音频组件未能载入。', true); return; }
    const settings = A.getSettings();
    openModal({
      kicker: '本地音频 / SOUND ARCHIVE', title: '声音设置',
      body: '<div class="audio-settings"><p class="modal-note">默认关闭。只有主动开启后才会加载音频；设置独立于游戏存档，保存在本机。</p>' +
        '<section class="audio-group"><div class="audio-group-head"><div><h3>主题音乐</h3><p>菜单、日间、夜间与结局的同一主题变奏</p></div><label class="switch-control"><input id="audio-music" type="checkbox"' + (settings.music ? ' checked' : '') + '><span>音乐</span></label></div>' +
        '<label class="volume-control" for="audio-music-volume"><span>音乐音量</span><output id="audio-music-output">' + Math.round(settings.musicVolume * 100) + '%</output></label><input id="audio-music-volume" class="volume-slider" type="range" min="0" max="100" step="1" value="' + Math.round(settings.musicVolume * 100) + '"></section>' +
        '<section class="audio-group"><div class="audio-group-head"><div><h3>操作音效</h3><p>选择、签发、警告与结算反馈</p></div><label class="switch-control"><input id="audio-sfx" type="checkbox"' + (settings.sfx ? ' checked' : '') + '><span>音效</span></label></div>' +
        '<label class="volume-control" for="audio-sfx-volume"><span>音效音量</span><output id="audio-sfx-output">' + Math.round(settings.sfxVolume * 100) + '%</output></label><input id="audio-sfx-volume" class="volume-slider" type="range" min="0" max="100" step="1" value="' + Math.round(settings.sfxVolume * 100) + '"></section>' +
        '<p class="audio-license">原创程序化音频 · Ogg Vorbis · 无外部请求 · 无强制自动播放</p></div>',
      actions: [{ label: '完成', className: 'btn btn-primary', onClick: function () {} }],
      onMount: function (card) {
        const music = card.querySelector('#audio-music');
        const sfx = card.querySelector('#audio-sfx');
        const musicVolume = card.querySelector('#audio-music-volume');
        const sfxVolume = card.querySelector('#audio-sfx-volume');
        music.addEventListener('change', function () { A.setMusicEnabled(music.checked); });
        sfx.addEventListener('change', function () { A.setSfxEnabled(sfx.checked); if (sfx.checked) A.playSfx('select'); });
        musicVolume.addEventListener('input', function () { A.setMusicVolume(Number(musicVolume.value) / 100); card.querySelector('#audio-music-output').textContent = musicVolume.value + '%'; });
        sfxVolume.addEventListener('input', function () { A.setSfxVolume(Number(sfxVolume.value) / 100); card.querySelector('#audio-sfx-output').textContent = sfxVolume.value + '%'; });
        musicVolume.addEventListener('change', function () { if (A.getSettings().sfx) A.playSfx('select'); });
        sfxVolume.addEventListener('change', function () { A.playSfx('select'); });
      }
    });
  }

  function openLog() {
    if (!ui.game) return;
    const entries = (ui.game.log || []).slice().reverse();
    openModal({
      kicker: '行动记录 / DECISION LOG', title: '决策日志', wide: true,
      body: '<p class="modal-note">共 ' + (ui.game.log || []).length + ' 条记录；已签发 ' + (ui.game.choices || []).length + ' 项决策；已触发 ' + (ui.game.resolved || []).length + ' 项延迟后果。</p><div class="log-modal-list">' + (entries.length ? entries.map(function (entry) { return logEntryHtml(entry, true); }).join('') : '<p class="empty-note">还没有行动记录。</p>') + '</div>',
      actions: [{ label: '关闭', className: 'btn btn-ghost', onClick: function () {} }]
    });
  }

  function openMenu() {
    if (!ui.game) return;
    openModal({
      kicker: '总统办公室 / 菜单', title: '暂停',
      body: '<div class="confirm-copy"><p>进度会在签发、结束回合和进入下一日时自动保存到本机浏览器。</p><p>当前：' + escapeHtml((L.getEvent(ui.game) || {}).dateLabel || '') + ' · 第 ' + ui.game.round + ' 回合 · 剩余 ' + ui.game.ap + ' AP。</p></div>',
      actions: [
        { label: '继续游戏', className: 'btn btn-ghost', onClick: function () {} },
        { label: '保存并回到封面', className: 'btn btn-ghost', onClick: function () { saveGame(true); renderIntro(); } },
        { label: '重新开始', className: 'btn btn-ghost', onClick: function () { openConfirm({ kicker: '覆盖确认', title: '放弃本局，重新开始？', message: '<p>当前进度会被清除。这个动作不能撤销。</p>', confirmLabel: '清除并重新开始', onConfirm: function () { startNewGame(true); } }); } }
      ]
    });
  }

  /* 结局与独立复盘 */
  function endingStatsHtml(stats) {
    const levels = alarmMap(L.getAlarms(ui.game));
    return L.statKeys.map(function (key) {
      const value = stats[key] || 0;
      const alarm = levels[key];
      return '<div class="ending-stat' + (alarm ? ' is-' + alarm.level : '') + '"><div><span>' + escapeHtml(statFullLabel(key)) + '</span><strong>' + value + '</strong></div><div class="stat-track"><span style="width:' + Math.max(0, Math.min(100, value)) + '%"></span></div></div>';
    }).join('');
  }

  function simulationReviewHtml() {
    const records = ui.game.choices || [];
    if (!records.length) return '<p class="empty-note">本局没有签发决策。</p>';
    return '<section class="simulation-review"><h3>本局完整模拟参数</h3><p>这里披露原始精确效果；实际即时变化可能受到 0—100 边界限制。它们都是模拟设计值。</p><ol>' + records.map(function (record) {
      const event = L.events.find(function (item) { return item.id === record.eventId; });
      const choice = event ? L.getChoice(event, record.choiceId) : null;
      const delayed = choice && choice.delayed && choice.delayed.length ? '<div class="review-delay"><strong>完整延迟参数</strong>' + choice.delayed.map(function (item) { return '<div><span>' + escapeHtml(item.label) + ' · 第 ' + (record.round + item.delay) + ' 回合</span><div class="effect-row">' + effectChips(item.effects) + '</div></div>'; }).join('') + '</div>' : '';
      return '<li><h4>R' + record.round + ' · ' + escapeHtml(record.label) + '</h4><p>' + record.ap + ' AP · 实际即时：' + escapeHtml(L.formatDeltaText(record.deltas, record.pressureDelta)) + '</p><div class="effect-row"><span class="parameter-label">原始即时参数</span>' + effectChips(choice ? choice.effects : {}) + '</div>' + delayed + '</li>';
    }).join('') + '</ol></section>';
  }

  function openHistoryReview() {
    if (!ui.game) return;
    const historyHtml = window.LZS_REVIEW ? window.LZS_REVIEW.render(ui.game) : '<section class="history-review"><h2>历史复盘</h2><p>复盘资料未能载入。</p></section>';
    openModal({
      kicker: '独立档案 / AFTER ACTION REVIEW', title: '历史复盘与完整参数', wide: true, className: 'history-modal',
      body: '<div class="review-tabs-note">先比较本局参数，再阅读事实、当时认知、后来确认与争议。两部分都不参与游戏规则。</div>' + simulationReviewHtml() + historyHtml,
      actions: [{ label: '返回结局', className: 'btn btn-primary', onClick: function () {} }]
    });
  }

  function showEnding() {
    if (!ui.game) return;
    if (!ui.game.ending && ui.game.phase === 'ending') L.evaluateFinal(ui.game);
    const ending = ui.game.ending;
    if (!ending) { toast('结局数据缺失，已返回封面。', true); renderIntro(); return; }
    saveGame(false);
    closeModal();
    clearToasts();
    showScreen('ending');
    if (A) A.playSfx(ending.tone === 'danger' ? 'collapse' : 'ending');
    const stats = ending.finalStats || ui.game.stats || {};
    const choices = ending.keyChoices || [];
    const chain = ending.chain || [];
    const timeline = choices.length ? '<ol class="decision-timeline">' + choices.map(function (record) {
      return '<li><span>R' + record.round + ' · ' + escapeHtml(record.dateLabel || '') + ' · ' + record.ap + ' AP</span><strong>' + escapeHtml(record.label) + '</strong><p>' + escapeHtml(L.formatDeltaText(record.deltas || {}, record.pressureDelta || 0)) + '</p>' + (record.scheduled && record.scheduled.length ? '<small>后续：' + escapeHtml(record.scheduled.join('；')) + '</small>' : '') + '</li>';
    }).join('') + '</ol>' : '<p class="empty-note">本局没有签发决策。</p>';
    const chainHtml = chain.length ? '<ul class="chain-list">' + chain.map(function (item) {
      return '<li><span>R' + item.appliedRound + ' · 实际触发</span><strong>' + escapeHtml(item.label) + '</strong><p>' + escapeHtml(item.note || '') + '</p><small>' + escapeHtml(L.formatDeltaText(item.deltas || {}, item.pressureDelta || 0)) + '</small></li>';
    }).join('') + '</ul>' : '<p class="empty-note">本局没有延迟后果在阶段内触发。</p>';
    const toneLabel = ending.tone === 'success' ? '阶段存续' : ending.tone === 'warning' ? '代价存续' : '阶段未守住';
    el.ending.innerHTML = '<header class="ending-masthead"><span>总统办公室 / 阶段档案</span><span>2022.02.24 — 03.02</span></header>' +
      '<div class="ending-hero tone-' + escapeHtml(ending.tone || 'danger') + '"><span class="ending-stamp">' + escapeHtml(toneLabel) + '</span><p class="ending-kicker">' + escapeHtml(ending.kicker) + '</p><h1 class="ending-title">' + escapeHtml(ending.title) + '</h1><p class="ending-verdict">' + escapeHtml(ending.verdict) + '</p><div class="ending-meta"><span>第 ' + (ending.finalRound || ui.game.round) + ' / ' + L.finalRound + ' 回合</span><span>最终压力 ' + (ending.finalPressure != null ? ending.finalPressure : ui.game.pressure) + '</span><span>签发 ' + choices.length + ' 项</span><span>触发 ' + chain.length + ' 项延迟</span></div></div>' +
      '<div class="ending-layout"><div class="ending-column"><section class="ending-section"><span class="section-kicker">AFTER ACTION</span><h2>阶段记录</h2><div class="ending-copy">' + (ending.epilogue || []).map(function (p) { return '<p>' + escapeHtml(p) + '</p>'; }).join('') + '</div></section>' +
      '<section class="ending-section"><h2>完整决策链</h2>' + timeline + '</section><section class="ending-section"><h2>延迟后果链</h2>' + chainHtml + '</section></div>' +
      '<aside class="ending-column"><section class="ending-section"><h2>七项最终状态</h2><div class="ending-stats">' + endingStatsHtml(stats) + '</div><div class="ending-pressure"><span>战争压力</span><strong>' + (ending.finalPressure != null ? ending.finalPressure : ui.game.pressure) + ' / 100</strong></div></section>' +
      '<section class="ending-section"><h2>判定依据</h2><ul class="ending-reasons">' + (ending.reasons || []).map(function (r) { return '<li>' + escapeHtml(r) + '</li>'; }).join('') + '</ul><p class="stat-hint">结局同时参考多项状态、战争压力与决策链，不是单一分数。</p></section></aside></div>' +
      '<section class="ending-review-invite"><span class="section-kicker">SEALED UNTIL THE END</span><h2>现在，打开事后才能看见的资料。</h2><p>完整模拟参数、逐日事实、当时认知、后来确认、争议与资料来源已独立归档，不再接在结局正文之后。</p><button type="button" class="btn btn-primary" id="btn-history">进入历史复盘</button></section>' +
      '<div class="ending-disclaimer"><strong>模拟说明：</strong>' + escapeHtml(ending.disclaimer || L.meta.disclaimer || '') + '<br>本结局只描述本局模拟参数下的国家状态，不评价真实历史人物。<br>版本 ' + escapeHtml(L.meta.version || '') + ' · 所有数值均为模拟设计参数。</div>' +
      '<div class="ending-actions"><button type="button" class="btn btn-primary" id="btn-replay">再玩一局</button><button type="button" class="btn btn-ghost" id="btn-back-cover">回到封面</button><button type="button" class="btn btn-ghost" id="btn-print">打印 / 保存本页</button></div>';
    document.getElementById('btn-history').addEventListener('click', openHistoryReview);
    document.getElementById('btn-replay').addEventListener('click', function () { startNewGame(true); });
    document.getElementById('btn-back-cover').addEventListener('click', renderIntro);
    document.getElementById('btn-print').addEventListener('click', function () { window.print(); });
  }

  function init() {
    el.start.addEventListener('click', requestStart);
    el.continue.addEventListener('click', loadGame);
    el.how.addEventListener('click', openHowToPlay);
    el.disclaimer.addEventListener('click', openDisclaimer);
    el.helpBtn.addEventListener('click', openHowToPlay);
    el.audioBtn.addEventListener('click', openAudioSettings);
    el.audioIntroBtn.addEventListener('click', openAudioSettings);
    el.clearSave.addEventListener('click', function () {
      openConfirm({ kicker: '清除存档', title: '删除本机进度？', message: '<p>这只会删除本机浏览器里的《小泽模拟器》存档，不会影响其他网站。</p>', confirmLabel: '删除存档', onConfirm: function () { L.deleteSave(); toast('存档已删除。'); renderIntro(); } });
    });
    el.saveBtn.addEventListener('click', function () { saveGame(true); });
    el.logBtn.addEventListener('click', openLog);
    el.menuBtn.addEventListener('click', openMenu);
    el.issue.addEventListener('click', issueSelected);
    el.endRound.addEventListener('click', endRound);
    if (el.opsBtn) el.opsBtn.addEventListener('click', function () { openOperations('intel'); });
    renderIntro();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
