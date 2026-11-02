/*
 * 小泽模拟器 · v0.4.1 界面层
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
    deskPanel: document.getElementById('desk-panel'),
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
      const windowText = commandWindowLabel(command);
      return '<li class="command-desk-row is-' + escapeHtml(command.status) + '"><div class="command-row-top"><span class="command-status">' + escapeHtml(commandStatusLabel(command.status)) + '</span><span class="command-agency">' + escapeHtml(agencyLabel(command.agency)) + '</span><span class="command-round">R' + command.round + (windowText ? ' · ' + escapeHtml(windowText) : '') + '</span></div><h3>' + escapeHtml(command.title) + '</h3><p>' + escapeHtml(command.blockedReason || command.lastNote || '等待下一步总统动作。') + '</p>' + commandActions(command) + '</li>';
    }).join('') + '</ol>' : '<p class="empty-note">还没有命令。选择一项决策并签发给相应机构后，它会在这里进入生命周期。</p>';
    body.innerHTML = '<p class="ops-lead">签发扣卡面 AP。授权不耗 AP，但夜间才执行；委派不耗 AP，却要交接一夜并消耗协调；总统介入扣 1 AP、越过排队，但会让该机构后续更难执行。什么都不做就是接受延误：占用名额到窗口结束，可能失效。</p>' + stage + '<p class="lifecycle-note">已撤回与已失效不是“完成”：它们不结算效果，只释放机构名额。</p>' + bodyHtml;
    bindCommandActions(body);
  }

  function renderAgencyDesk(body, card) {
    const g = ui.game;
    const cards = L.intel.agencies.map(function (agency) {
      const load = L.getAgencyLoad(g, agency.id);
      const done = !!g.coordinationThisRound[agency.id];
      const standing = g.standing && g.standing[agency.id] && g.standing[agency.id].active;
      const spec = strat().standing || { cost: 1, minCoordination: 45 };
      const loadPct = Math.min(100, Math.round(load.workload / load.capacity * 100));
      return '<article class="agency-card' + (load.overloaded ? ' is-overloaded' : '') + (load.strained ? ' is-strained' : '') + '"><div class="agency-card-head"><span class="agency-code">' + escapeHtml(agency.short) + '</span><div><h3>' + escapeHtml(agency.label) + '</h3><p>' + escapeHtml(agency.focus) + '</p></div></div>' +
        '<div class="agency-meters"><span><small>协调余量</small><strong>' + load.coordination + '</strong></span><span><small>在办 / 容量</small><strong>' + load.workload + ' / ' + load.capacity + '</strong></span></div>' +
        '<div class="agency-load-track" role="img" aria-label="执行能力占用 ' + load.workload + ' / ' + load.capacity + '"><span style="width:' + loadPct + '%"></span></div>' +
        '<p class="agency-constraint">' + (load.overloaded ? '容量已满：新命令只能排队，无法今晚执行。' : load.strained ? '协调余量低于 35：跨部门命令会先阻塞。' : '可自主处理常规命令；跨部门行动仍需总统召集。') + '</p>' +
        '<div class="agency-actions"><button type="button" class="mini-action' + (done ? '' : ' is-primary') + '" data-coordinate="' + escapeHtml(agency.id) + '"' + (done || g.ap < 1 ? ' disabled' : '') + '>' + (done ? '本回合已召集' : '召集协调 · 1 AP') + '</button>' +
        (standing ? '<span class="standing-badge">常设授权 · 自第 ' + g.standing[agency.id].grantedRound + ' 日</span>' : '<button type="button" class="mini-action" data-standing="' + escapeHtml(agency.id) + '"' + (g.ap < spec.cost || load.coordination < spec.minCoordination ? ' disabled' : '') + ' title="此后该机构命令自动授权；每夜协调 -1，总统介入该机构命令额外 -3">常设授权 · ' + spec.cost + ' AP</button>') + '</div></article>';
    }).join('');
    body.innerHTML = '<p class="ops-lead">每个机构只有 3 个在办名额。跨日命令会持续占用名额，直到完成、撤回或失效；容量满时新命令不会执行。召集会恢复协调余量并放行本回合的跨部门阻塞，但会消耗 1 AP。委派不耗注意力的代价是交接延迟一夜与两个机构各 -3 协调余量。</p><div class="agency-grid">' + cards + '</div>';
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
    Array.prototype.forEach.call(body.querySelectorAll('[data-standing]'), function (button) {
      button.addEventListener('click', function () {
        const result = L.grantStanding(g, button.getAttribute('data-standing'));
        if (!result.ok) { toast(result.error || '无法授予常设授权。', true); return; }
        if (A) A.playSfx('issue');
        saveGame(false);
        renderGame();
        renderOpsBody(card);
        toast('常设授权已生效：该机构此后签发的命令自动进入执行。');
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
    if (el.deskPanel) el.deskPanel.innerHTML = deskStateHtml();
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
      '</div>' + dispatchTrayHtml() + echoesHtml();
    bindDispatches(el.eventMain);
  }

  /* ---------- v0.5：日焦点、办公桌状态、前序回响、事务电报 ---------- */
  function strat() { return L.strategyData || window.LZS_STRATEGY || {}; }

  const TIME_KIND_NOTES = {
    urgent: '紧急窗口：今晚不执行就失效，不会顺延。',
    short: '短期窗口：今晚或明晚执行；超过窗口失效。',
    sustained: '可持续推进：有两天余量；失效后会以更贵的形式重新浮现一次。',
    commitment: '长期承诺：执行后继续占用机构席位数夜，换取更长的作用。',
    conditional: '有条件任务：执行条件取决于此前相关命令是否落地。'
  };

  function timeKindLabel(kind) {
    const labels = strat().kindLabels || {};
    return labels[kind] || labels.short || '短期窗口';
  }

  function deskStateHtml() {
    const g = ui.game;
    const event = L.getEvent(g);
    const focus = (strat().dayFocus || {})[g.round] || null;
    const open = L.getDispatches ? L.getDispatches(g).length : 0;
    const counts = L.getCommandCounts(g);
    const alarms = L.getAlarms(g);
    const critical = alarms.some(function (alarm) { return alarm.level === 'critical'; });
    const lamp = critical ? 'critical' : alarms.length ? 'warning' : 'steady';
    const days = Array.from({ length: L.finalRound }, function (_, i) {
      const day = i + 1;
      return '<li class="' + (day < g.round ? 'is-past' : day === g.round ? 'is-today' : '') + '"' + (day === g.round ? ' aria-current="step"' : '') + '><span class="sr-only">第 ' + day + ' 日</span></li>';
    }).join('');
    return '<section class="desk-state lamp-' + lamp + '" aria-label="今日重心与办公桌状态">' +
      '<div class="day-focus tone-' + escapeHtml(focus ? focus.tone : 'arrival') + '"><span class="day-focus-label">第 ' + g.round + ' 日 · ' + escapeHtml(focus ? focus.label : '') + '</span><p>' + escapeHtml(focus ? focus.question : '') + '</p><ol class="day-track" aria-hidden="true">' + days + '</ol></div>' +
      '<ul class="desk-items">' +
        '<li class="desk-item desk-phone' + (open ? ' is-ringing' : '') + '"><span class="desk-glyph" aria-hidden="true">☎</span><span>' + (open ? open + ' 份电报待处理' : '无待处理电报') + '</span></li>' +
        '<li class="desk-item desk-files' + (counts.blocked ? ' is-heavy' : '') + '"><span class="desk-glyph" aria-hidden="true">▤</span><span>' + counts.active + ' 件在办' + (counts.blocked ? ' · ' + counts.blocked + ' 件受阻' : '') + '</span></li>' +
        '<li class="desk-item desk-clock"><span class="desk-glyph" aria-hidden="true">◷</span><span>' + escapeHtml(event ? event.time : '') + '</span></li>' +
      '</ul></section>';
  }

  function echoesHtml() {
    const g = ui.game;
    if (g.round <= 1) return '';
    const prev = g.round - 1;
    const rows = [];
    (g.commands || []).forEach(function (command) {
      if (command.kind === 'communication') return;
      if (command.status === 'expired' && command.expiredRound === prev) rows.push({ cls: 'is-lost', text: '「' + command.title + '」已超过窗口失效，效果没有发生。' });
      else if (command.effectsApplied && command.executedRound === prev) rows.push({ cls: 'is-done', text: '「' + command.title + '」昨夜执行' + (command.executedLate ? '（延迟执行）' : '') + '，今天进入反馈期。' });
      else if (command.status === 'blocked') rows.push({ cls: 'is-blocked', text: '「' + command.title + '」仍受阻：' + (command.blockedReason || '等待处理') });
      else if (command.holdUntilRound && command.holdUntilRound >= g.round && command.effectsApplied) rows.push({ cls: 'is-held', text: '「' + command.title + '」作为长期承诺继续占用' + agencyLabel(command.agency) + '席位至第 ' + command.holdUntilRound + ' 夜。' });
    });
    const links = (strat().links || []);
    (g.commands || []).forEach(function (command) {
      links.forEach(function (link) {
        if (link.from !== command.choiceId) return;
        const event = L.getEvent(g);
        if (!event || !(event.choices || []).some(function (choice) { return choice.id === link.target; })) return;
        const effect = L.getLinkEffect(g, link.target);
        if (effect && effect.sourceCommandId === command.id && effect.when === link.when) rows.push({ cls: effect.coordination === 'relax' ? 'is-done' : 'is-lost', text: effect.note });
      });
    });
    if (!rows.length) return '';
    return '<section class="echoes" aria-label="此前决定的回响"><h2>此前决定的回响</h2><ul>' + rows.slice(0, 5).map(function (row) { return '<li class="' + row.cls + '">' + escapeHtml(row.text) + '</li>'; }).join('') + '</ul><p class="echo-note">只列出由你此前签发、授权或放弃的事务引起的变化。</p></section>';
  }

  function dispatchTrayHtml() {
    const g = ui.game;
    if (!L.getDispatches) return '';
    const items = L.getDispatches(g, true);
    if (!items.length) return '';
    return '<section class="dispatch-tray" aria-label="晨间电报"><div class="dispatch-head"><h2>晨间电报</h2><span>由此前命令与机构状态触发 · 模拟反馈</span></div><ol class="dispatch-list">' + items.map(function (item) {
      const actions = item.resolved ? '<p class="dispatch-outcome">已处理：' + escapeHtml(item.outcome && item.outcome.label ? item.outcome.label : '已阅') + '</p>' :
        '<div class="dispatch-actions">' + (item.options || []).map(function (option) {
          const cost = option.ap ? option.ap + ' AP' : '不耗 AP';
          const isDefault = option.id === item.defaultOption;
          return '<button type="button" class="mini-action' + (option.ap ? ' is-primary' : '') + '" data-dispatch="' + escapeHtml(item.id) + '" data-option="' + escapeHtml(option.id) + '"' + ((option.ap || 0) > g.ap || g.phase !== 'briefing' ? ' disabled' : '') + '>' + escapeHtml(option.label) + (option.label.indexOf('AP') === -1 ? ' · ' + cost : '') + (isDefault && (item.options || []).length > 1 ? ' · 不处理则默认' : '') + '</button>';
        }).join('') + '</div>';
      return '<li class="dispatch-item type-' + escapeHtml(item.type) + (item.resolved ? ' is-resolved' : '') + '"><span class="dispatch-kicker">' + escapeHtml(item.kicker || '模拟反馈') + '</span><strong>' + escapeHtml(item.title) + '</strong><p>' + escapeHtml(item.body) + '</p>' + (item.source ? '<small>' + escapeHtml(item.source) + '</small>' : '') + actions + '</li>';
    }).join('') + '</ol></section>';
  }

  function bindDispatches(scope) {
    Array.prototype.forEach.call(scope.querySelectorAll('[data-dispatch]'), function (button) {
      button.addEventListener('click', function () {
        if (!ui.game || ui.busy) return;
        const result = L.resolveDispatch(ui.game, button.getAttribute('data-dispatch'), button.getAttribute('data-option'));
        if (!result.ok) { if (A) A.playSfx('invalid'); toast(result.error || '无法处理这份电报。', true); return; }
        if (A) A.playSfx('file');
        saveGame(false);
        renderGame();
        toast('电报已处理并归档。');
      });
    });
  }

  function listHtml(items) {    if (!items || !items.length) return '<ul class="epistemic-list"><li>暂无可靠条目。</li></ul>';
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
      const preview = L.getCommandPreview(g, choice.id);
      const coordination = preview ? preview.requiresCoordination : L.requiresCoordination(choice);
      const profile = L.timeProfileFor ? L.timeProfileFor(choice.id) : { kind: 'short' };
      const link = L.getLinkEffect ? L.getLinkEffect(g, choice.id) : null;
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
        (link ? '<p class="choice-link ' + (link.coordination === 'relax' ? 'is-relax' : 'is-require') + '"><strong>' + (link.coordination === 'relax' ? '前序已落地' : '前序已失效') + '：</strong>' + escapeHtml(link.note || '') + '</p>' : '') +
        '<div class="effect-forecast" aria-label="时间属性与签发前定性影响"><span class="choice-time time-' + escapeHtml(profile.kind) + '">' + escapeHtml(timeKindLabel(profile.kind)) + '</span>' + effectForecast(choice.effects) + '</div>' +
        (lockNote) +
        '<div class="choice-detail"' + (expanded ? '' : ' hidden') + '>' +
          '<div class="staff-note"><span>幕僚评估</span><p>' + escapeHtml(choice.staff) + '</p></div>' +
          '<div class="choice-intel">信息基础：本回合情报可信度「' + escapeHtml(event.intel.level) + '」。' + escapeHtml(event.intel.note) + '</div>' +
          (preview ? '<section class="execution-preview"><h4>执行条件 · 签发前可见</h4><div class="execution-meta"><span>执行机构 <strong>' + escapeHtml(preview.agencyLabel) + '</strong></span><span>在办 <strong>' + preview.load.workload + ' / ' + preview.load.capacity + '</strong></span><span>协调余量 <strong>' + preview.load.coordination + '</strong></span><span>执行窗口 <strong>至第 ' + preview.deadlineRound + ' 夜</strong></span><span>优先级 <strong class="' + (preview.slotRequired ? 'is-warning' : 'is-ok') + '">' + (preview.slotRequired ? '占用优先席位' : '机构自行排队') + '</strong></span>' + (preview.requiresIntel ? '<span>情报确认 <strong class="' + (preview.intelSatisfied ? 'is-ok' : 'is-warning') + '">' + (preview.intelSatisfied ? '已追问总参' : '未完成') + '</strong></span>' : '') + '</div>' + (preview.risks.length ? '<ul class="execution-risks">' + preview.risks.map(function (risk) { return '<li>' + escapeHtml(risk) + '</li>'; }).join('') + '</ul>' : '<p class="execution-ok">当前没有容量或协调告警；命令仍可能因夜间压力或后续阻塞延迟。</p>') + '</section>' : '') +
          '<p class="time-note"><strong>' + escapeHtml(timeKindLabel(profile.kind)) + '</strong> · ' + escapeHtml(profile.note || TIME_KIND_NOTES[profile.kind] || TIME_KIND_NOTES.short) + (profile.holdRounds ? ' 执行后占用席位 ' + profile.holdRounds + ' 夜。' : '') + '</p>' +
          '<section class="delay-details"><h4>延迟与副作用</h4>' + delayDetails(choice) + '</section>' +
        '</div>' +
        (executed && record ? '<div class="choice-actual"><span>命令执行反馈 · 实际即时变化</span><div class="effect-row">' + (effectChips(record.deltas, record.pressureDelta) || '<span class="empty-note">状态未发生可测量的变化</span>') + '</div></div>' : '') +
        '<div class="choice-footer"><span>' + (executed ? '已归档 · 不可重复结算' : preview && preview.requiresIntel && !preview.intelSatisfied ? '情报不足 · 需追问总参' : coordination ? '跨部门 · 需召集或委派' : choice.delayed && choice.delayed.length ? '含延迟后果' : '仅即时效果与夜间规则') + '</span><span class="select-label">' + stateText + '</span></div>' +
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
    const followed = (command.followedRounds || []).indexOf(g.round) !== -1;
    const intelRecord = command.intelReportId ? (g.intelState || {})[command.intelReportId] : null;
    if (command.requiresIntel && !(intelRecord && intelRecord.inquired) && ['issued', 'blocked', 'executing'].indexOf(command.status) !== -1) {
      parts.push('<button type="button" class="mini-action is-primary" data-open-intel="military">去追问总参 · 情报桌</button>');
    }
    if (command.status === 'issued') {
      parts.push('<button type="button" class="mini-action is-primary" data-authorize="' + escapeHtml(command.id) + '">授权执行</button>');
    }
    if (!command.effectsApplied && ['issued', 'blocked', 'executing'].indexOf(command.status) !== -1 && (!command.deadlineRound || g.round + 1 <= command.deadlineRound)) {
      parts.push('<button type="button" class="mini-action" data-delegate="' + escapeHtml(command.id) + '">委派 · 不耗 AP</button>');
    }
    if (['executing', 'blocked', 'awaiting_feedback'].indexOf(command.status) !== -1) {
      const label = command.status === 'awaiting_feedback' ? '核验反馈 · 1AP' : '总统介入 · 1AP';
      parts.push('<button type="button" class="mini-action' + (command.status === 'blocked' ? ' is-primary' : '') + '" data-followup="' + escapeHtml(command.id) + '"' + (g.ap < 1 || followed ? ' disabled' : '') + '>' + (followed ? '本回合已跟进' : label) + '</button>');
    }
    if (!command.effectsApplied && ['issued', 'blocked', 'executing'].indexOf(command.status) !== -1) {
      parts.push('<button type="button" class="mini-action is-danger" data-cancel="' + escapeHtml(command.id) + '">撤回</button>');
    }
    if (compact) return '<div class="command-actions">' + parts.join('') + '</div>';
    return '<div class="command-actions">' + parts.join('') + '</div>';
  }

  function commandWindowLabel(command) {
    if (!command.deadlineRound || ['completed', 'cancelled', 'expired'].indexOf(command.status) !== -1) return '';
    if (ui.game.round >= command.deadlineRound) return '最后执行窗口';
    return '窗口至第 ' + command.deadlineRound + ' 夜';
  }

  function commandRowHtml(command) {
    const record = (ui.game.choices || []).filter(function (item) { return item.commandId === command.id; })[0];
    const delta = record && record.deltas ? effectChips(record.deltas, record.pressureDelta) : '';
    const windowText = commandWindowLabel(command);
    let note = '第 ' + command.round + ' 回合签发 · ' + (command.slotRequired === false ? '机构自行排队，不占优先席位' : '占用优先席位');
    if (command.delegated) note += ' · 已委派交接';
    if (command.expedited) note += ' · 总统已介入';
    if (command.executedLate) note += ' · 延迟执行';
    if (command.autoAuthorized) note += ' · 常设授权自动执行';
    if (command.holdUntilRound && command.effectsApplied && command.holdUntilRound >= ui.game.round) note = '长期承诺推进中：继续占用' + agencyLabel(command.agency) + '席位至第 ' + command.holdUntilRound + ' 夜。';
    const intelRecord = command.intelReportId ? (ui.game.intelState || {})[command.intelReportId] : null;
    if (command.requiresIntel && !(intelRecord && intelRecord.inquired) && command.status !== 'completed') note = '情报不足：先到情报桌追问总参，授权才可以执行。';
    if (command.status === 'blocked' && command.blockedReason) note = command.blockedReason;
    else if (command.status === 'expired' && command.blockedReason) note = command.blockedReason;
    const lastWindow = command.deadlineRound && ui.game.round >= command.deadlineRound && !command.effectsApplied && ['issued', 'executing', 'blocked'].indexOf(command.status) !== -1;
    return '<li class="command-row is-' + escapeHtml(command.status) + '">' +
      '<div class="command-row-top"><span class="command-status">' + escapeHtml(commandStatusLabel(command.status)) + '</span><span class="command-agency">' + escapeHtml(agencyLabel(command.agency)) + '</span>' + (command.timeKind && command.timeKind !== 'short' ? '<span class="command-kind time-' + escapeHtml(command.timeKind) + '">' + escapeHtml(timeKindLabel(command.timeKind)) + '</span>' : '') + (windowText ? '<span class="command-window">' + escapeHtml(windowText) + '</span>' : '') + '</div>' +
      '<strong>' + escapeHtml(command.title) + '</strong>' +
      '<p class="command-note">' + escapeHtml(note) + '</p>' +
      (lastWindow ? '<p class="command-wait-note">最后执行窗口：委派已来不及；只能总统介入、接受延误或撤回。</p>' : '') +
      (delta ? '<div class="effect-row command-result">' + delta + '</div>' : '') +
      commandActions(command, true) +
      (['executing', 'blocked'].indexOf(command.status) !== -1 ? '<p class="command-wait-note">不追加 AP = 接受延误：命令仍占机构名额，明夜再试；若超过窗口则失效。</p>' : '') +
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
    Array.prototype.forEach.call(scope.querySelectorAll('[data-cancel]'), function (button) {
      button.addEventListener('click', function () { cancelCommand(button.getAttribute('data-cancel')); });
    });
    Array.prototype.forEach.call(scope.querySelectorAll('[data-open-intel]'), function (button) {
      button.addEventListener('click', function () {
        ui.intelCategory = button.getAttribute('data-open-intel') || 'military';
        openOperations('intel');
      });
    });
  }

  function cancelCommand(commandId) {
    if (!ui.game || ui.busy) return;
    const command = (ui.game.commands || []).filter(function (item) { return item.id === commandId; })[0];
    if (!command) return;
    openConfirm({
      kicker: '撤回 / IRREVERSIBLE',
      title: '撤回“' + command.title + '”？',
      message: '<p>已支付的 ' + command.ap + ' AP 不会退还。命令不会发生任何效果，只会释放机构在办名额；如果这是原本要争取的时间窗口，窗口也会一起失去。</p>',
      confirmLabel: '确认撤回',
      onConfirm: function () {
        const result = L.cancelCommand(ui.game, commandId);
        if (!result.ok) { toast(result.error || '无法撤回。', true); return; }
        if (A) A.playSfx('invalid');
        saveGame(false);
        renderGame();
        toast('命令已撤回，机构名额已释放；AP 没有退还。');
      }
    });
  }

  function renderCommandPanel() {
    const g = ui.game;
    if (!el.commandPanel) return;
    const counts = L.getCommandCounts(g);
    const active = (g.commands || []).filter(function (command) { return ['completed', 'cancelled', 'expired'].indexOf(command.status) === -1; }).slice(-4).reverse();
    const body = active.length ? '<ul class="command-list">' + active.map(commandRowHtml).join('') + '</ul>' :
      '<p class="empty-note">尚未签发命令。阅读免费；只有签发、亲自介入、追问、召集、沟通会消耗 3 AP 注意力。</p>';
    const loads = L.getAgencyLoads(g).slice().sort(function (a, b) { return (b.workload / b.capacity) - (a.workload / a.capacity); });
    const loadText = loads.slice(0, 2).map(function (item) { return item.short + ' ' + item.workload + '/' + item.capacity; }).join(' · ');
    el.commandPanel.innerHTML = '<div class="panel-head"><div><span class="panel-kicker">COMMAND DESK</span><h2 id="command-title">命令中心</h2></div><span>' + counts.active + ' 进行中</span></div>' +
      body + '<div class="command-panel-foot"><span>' + escapeHtml(loadText) + ' · 阻塞 ' + counts.blocked + (counts.expired ? ' · 失效 ' + counts.expired : '') + '</span><button type="button" class="text-btn" id="btn-open-ops">打开幕僚台</button></div>';
    bindCommandActions(el.commandPanel);
    const btn = document.getElementById('btn-open-ops');
    if (btn) btn.addEventListener('click', function () { openOperations('commands'); });
  }

  function authorizeCommand(commandId) {
    if (ui.busy || !ui.game || ui.game.phase !== 'briefing') return;
    const result = L.authorizeCommand(ui.game, commandId);
    if (!result.ok) { if (A) A.playSfx('invalid'); toast(result.error || '无法授权。', true); return; }
    if (A) A.playSfx('receive');
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
      kicker: '委派 / 不额外消耗 AP', title: '把“' + command.title + '”交给谁？',
      body: '<p class="modal-lead">委派不额外消耗总统 AP，但释放原机构名额后会有一个完整夜晚的交接期：今夜不会执行，目标机构也必须在明夜仍有空余名额。改变责任链的代价是时间和直接控制，而不是再扣 1 AP。</p><div class="agency-picker">' + buttons + '</div>',
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
    const untouchedTurn = g.executed.length === 0 && g.ap >= (g.apMax || 3);
    el.issue.disabled = !canIssue;
    el.endRound.disabled = ui.busy || g.phase !== 'briefing' || untouchedTurn || unauthorized.length > 0;
    el.endRound.textContent = g.round >= L.finalRound ? '结算本阶段' : '结束本回合';
    el.endRound.title = untouchedTurn ? '先签发命令，或把注意力用于处理既有事务。' : unauthorized.length ? '先授权或委派所有已签发命令。' : '';
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
    if (!ui.game.executed.length && ui.game.ap >= (ui.game.apMax || 3)) { toast('先签发命令，或把注意力用于处理既有事务。', true); return; }
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
    if (A) A.playSfx(alarms.length ? 'alert' : (data.commandResults || []).some(function (r) { return r.status === 'blocked' || r.status === 'expired'; }) ? 'blocked' : delayed.length ? 'delayed' : 'complete');
    const todayRecords = (ui.game.choices || []).filter(function (record) { return record.round === data.round - 1; });
    const allResults = (data.commandResults || []).filter(function (result) { return !result.archived; });
    const seenCommands = {};
    const commandRows = allResults.map(function (result) {
      seenCommands[result.commandId] = true;
      return { result: result, record: todayRecords.filter(function (record) { return record.commandId === result.commandId; })[0] };
    });
    todayRecords.forEach(function (record) {
      if (seenCommands[record.commandId]) return;
      commandRows.push({ result: null, record: record });
    });
    const dispatches = data.dispatches || [];
    const settled = data.settledDispatches || [];
    const dispatchHtml = (dispatches.length ? '<ul class="settlement-list">' + dispatches.map(function (item) { return '<li><div><strong>' + escapeHtml(item.title) + '</strong><span>' + escapeHtml(item.kicker || '模拟反馈') + '</span></div><p>' + escapeHtml(item.body) + '</p></li>'; }).join('') + '</ul><p class="settlement-archive-note">明早在事件简报下方处理；不处理则当夜按默认方式结算。</p>' : '<p class="all-clear">没有新的事务电报。</p>') +
      (settled.length ? '<p class="settlement-archive-note">按默认方式结算：' + settled.map(function (item) { return escapeHtml(item.title + '（' + (item.outcome && item.outcome.label ? item.outcome.label : '已阅') + '）'); }).join('；') + '</p>' : '');
    const archivedCount = (data.commandResults || []).filter(function (result) { return result.archived; }).length;
    const commandHtml = commandRows.length ? commandRows.map(function (row) {
      const outcome = row.result;
      const record = row.record;
      const status = outcome ? outcome.status : record.status;
      const title = outcome ? outcome.title : record.label;
      const ap = outcome ? outcome.ap : record.ap;
      const deltas = outcome && outcome.deltas ? outcome.deltas : (record.deltas || {});
      const pressureDelta = outcome && outcome.pressureDelta != null ? outcome.pressureDelta : record.pressureDelta;
      const note = outcome && outcome.held ? outcome.note : outcome && outcome.blockedReason ? outcome.blockedReason : status === 'awaiting_feedback' ? '效果已在本夜执行；下一夜核验反馈，或由总统提前核验。' : status === 'expired' ? '超过执行窗口，效果不再发生。' : status === 'executing' ? '仍在执行，明夜继续占用机构名额。' : '';
      return '<li><div><strong>' + escapeHtml(title) + '</strong><span>' + ap + ' AP · ' + escapeHtml(commandStatusLabel(status)) + '</span></div>' + (note ? '<p class="settlement-block-note">' + escapeHtml(note) + '</p>' : '') + '<div class="effect-row">' + (effectChips(deltas, pressureDelta) || '<span class="empty-note">' + (status === 'expired' ? '没有结算效果。' : status === 'blocked' ? '夜间未能执行；组织卡可以选择介入、委派或接受延误。' : '无即时数值变化') + '</span>') + '</div></li>';
    }).join('') : '<li>今天没有签发新命令；注意力已用于追问、召集协调、介入既有命令或其他总统事务。本回合仍会按既有局势结算。</li>';
    const archivedNote = archivedCount ? '<p class="settlement-archive-note">另有 ' + archivedCount + ' 项旧命令的反馈已归档；可在命令追踪中查看完整历史。</p>' : '';
    const delayedHtml = delayed.length ? delayed.map(function (item) {
      return '<li><div><strong>' + escapeHtml(item.label) + '</strong><span>第 ' + item.appliedRound + ' 回合实际触发</span></div><p>' + escapeHtml(item.note || '') + '</p><div class="effect-row">' + (effectChips(item.deltas, item.pressureDelta) || '<span class="empty-note">无数值变化</span>') + '</div></li>';
    }).join('') : '<li><p>没有延迟后果在本夜触发。</p></li>';
    const alarmHtml = alarms.length ? '<ul class="alarm-list">' + alarms.map(function (alarm) { return '<li class="is-' + alarm.level + '"><span>' + escapeHtml(alarm.label) + '</span><strong>' + alarm.value + '</strong></li>'; }).join('') + '</ul>' : '<p class="all-clear">本夜没有触发新的 getAlarms() 告警。</p>';
    openModal({
      kicker: '夜间态势 / NIGHT SETTLEMENT', title: '第 ' + (data.round - 1) + ' 夜', dismissible: false, wide: true, className: 'interlude-modal',
      body: '<div class="interlude-sheet" data-interlude-round="' + data.round + '"><div class="interlude-date"><strong>' + escapeHtml(data.dateLabel || '') + '</strong><span>夜间结算不会重复执行</span></div>' +
        '<ol class="settlement-sequence">' +
          '<li><span class="settlement-index">01</span><section><h3>命令执行与跨日状态</h3><ul class="settlement-list">' + commandHtml + '</ul>' + archivedNote + '</section></li>' +
          '<li><span class="settlement-index">02</span><section><h3>延迟后果 · 实际变化</h3><ul class="settlement-list">' + delayedHtml + '</ul></section></li>' +
          '<li><span class="settlement-index">03</span><section><h3>国家状态侵蚀 · 实际变化</h3><div class="effect-row">' + (effectChips(data.attrition || {}) || '<span class="empty-note">本晚没有可测量侵蚀。</span>') + '</div></section></li>' +
          '<li><span class="settlement-index">04</span><section><h3>战争压力推进 · 实际变化</h3><div class="interlude-pressure"><span>' + pressure.before + '</span><b>→</b><strong>' + pressure.after + '</strong><small>战场 +' + pressure.rise + (pressure.delayed ? ' · 延迟 ' + formatSigned(pressure.delayed) : '') + '</small></div></section></li>' +
          '<li><span class="settlement-index">05</span><section><h3>新风险</h3>' + alarmHtml + '</section></li>' +
          '<li><span class="settlement-index">06</span><section><h3>明早的事务电报</h3>' + dispatchHtml + '</section></li>' +
        '</ol></div>',
      actions: [{ label: '进入 ' + (data.dateLabel || '下一日') + ' · ' + data.ap + ' AP', className: 'btn btn-primary', close: false, onClick: function () {
        if (ui.busy) return;
        ui.busy = true;
        const result = L.continueFromInterlude(ui.game);
        ui.busy = false;
        if (!result.ok) { toast(result.error || '无法进入下一回合。', true); return; }
        closeModal();
        if (A) { A.setTheme('day'); A.playSfx(L.getDispatches(ui.game).length ? 'phone' : 'dayturn'); }
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
    if (A) A.playSfx('archive');
    if (!ui.game) return;
    const historyHtml = window.LZS_REVIEW ? window.LZS_REVIEW.render(ui.game) : '<section class="history-review"><h2>历史复盘</h2><p>复盘资料未能载入。</p></section>';
    openModal({
      kicker: '独立档案 / AFTER ACTION REVIEW', title: '历史复盘与完整参数', wide: true, className: 'history-modal',
      body: '<div class="review-tabs-note">先比较本局参数，再阅读事实、当时认知、后来确认与争议。两部分都不参与游戏规则。</div>' + simulationReviewHtml() + historyHtml,
      actions: [{ label: '返回结局', className: 'btn btn-primary', onClick: function () {} }]
    });
  }

  function governanceHtml(ending) {
    const gov = ending.governance;
    if (!gov) return '';
    const meta = strat().styleMeta || {};
    const c = gov.counts || {};
    const tendencies = (gov.tendencies || []).map(function (item) {
      const m = meta[item.id] || {};
      return '<li><strong>' + escapeHtml(item.label || m.label || item.id) + '</strong><p>' + escapeHtml(item.note || m.note || '') + '</p></li>';
    }).join('');
    const facts = [['签发', c.issued], ['亲自介入', c.interventions], ['介入天数', c.interventionDays], ['委派', c.delegations], ['常设授权', c.standing], ['召集协调', c.coordination], ['追问情报', c.inquiries], ['沟通', c.communications], ['处理电报', c.dispatchesHandled], ['默认结算', c.dispatchesDefaulted]];
    return '<section class="ending-section governance"><span class="section-kicker">HOW ATTENTION WAS SPENT</span><h2>治理方式回顾</h2><p class="stat-hint">只统计本局实际发生的动作，描述注意力花在哪里；不打分，也不评价这种方式好坏。</p><ul class="governance-tendencies">' + tendencies + '</ul>' +
      '<dl class="governance-counts">' + facts.map(function (pair) { return '<div><dt>' + pair[0] + '</dt><dd>' + (pair[1] || 0) + '</dd></div>'; }).join('') + '</dl></section>';
  }

  function trendHtml(ending) {
    const points = (ending.timeline || []).filter(function (item) { return item && item.stats; });
    if (points.length < 2) return '<section class="ending-section"><h2>七项状态轨迹</h2><p class="empty-note">这局来自旧版本存档，只有迁移时的当前状态，不补造逐日轨迹。</p></section>';
    const w = 120, h = 30;
    function line(values) {
      return values.map(function (v, i) { return (i ? 'L' : 'M') + (i / (values.length - 1) * w).toFixed(1) + ' ' + (h - Math.max(0, Math.min(100, v)) / 100 * h).toFixed(1); }).join(' ');
    }
    const thresholds = (L.thresholds && L.thresholds.held) || {};
    const rows = L.statKeys.map(function (key) {
      const values = points.map(function (p) { return p.stats[key] || 0; });
      const first = values[0], last = values[values.length - 1];
      const t = thresholds[key];
      return '<li><span class="trend-label">' + escapeHtml(statFullLabel(key)) + '</span><svg viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="' + escapeHtml(statFullLabel(key)) + ' 从 ' + first + ' 到 ' + last + '">' + (t ? '<line class="trend-threshold" x1="0" x2="' + w + '" y1="' + (h - t / 100 * h).toFixed(1) + '" y2="' + (h - t / 100 * h).toFixed(1) + '"></line>' : '') + '<path d="' + line(values) + '"></path></svg><span class="trend-values">' + first + ' → <strong>' + last + '</strong></span></li>';
    });
    const pressure = points.map(function (p) { return p.pressure || 0; });
    rows.push('<li class="is-pressure"><span class="trend-label">战争压力</span><svg viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="战争压力 从 ' + pressure[0] + ' 到 ' + pressure[pressure.length - 1] + '"><path d="' + line(pressure) + '"></path></svg><span class="trend-values">' + pressure[0] + ' → <strong>' + pressure[pressure.length - 1] + '</strong></span></li>');
    return '<section class="ending-section"><h2>七项状态轨迹</h2><p class="stat-hint">每天开局时的真实快照（共 ' + points.length + ' 点）；虚线为本阶段存续参考线。</p><ul class="trend-list">' + rows.join('') + '</ul></section>';
  }

  function turningPointsHtml(ending) {
    const points = ending.turningPoints || [];
    const labels = { lost: '失去的窗口', timely: '及时完成', shelved: '被搁置的事务', unforeseen: '当时无法预知的后果' };
    if (!points.length) return '';
    return '<section class="ending-section"><h2>关键节点</h2><ol class="turning-points">' + points.map(function (p) {
      return '<li class="tp-' + escapeHtml(p.type) + '"><span>R' + p.round + ' · ' + escapeHtml(labels[p.type] || p.type) + '</span><strong>' + escapeHtml(p.title) + '</strong><p>' + escapeHtml(p.note || '') + '</p></li>';
    }).join('') + '</ol></section>';
  }

  function recordsHtml() {
    const runs = L.getRecords ? L.getRecords().runs.slice(-5).reverse() : [];
    if (!runs.length) return '';
    return '<section class="ending-section run-records"><h2>本机记录</h2><p class="stat-hint">只保存在这台设备上：结局、主要倾向和路线。没有积分或排行。</p><ol>' + runs.map(function (run) {
      return '<li><strong>' + escapeHtml(run.endingTitle || run.endingId) + '</strong><span>' + escapeHtml(run.styleLabel || '') + ' · 第 ' + run.round + ' 回合</span></li>';
    }).join('') + '</ol></section>';
  }

  function showEnding() {    if (!ui.game) return;
    if (!ui.game.ending && ui.game.phase === 'ending') L.evaluateFinal(ui.game);
    const ending = ui.game.ending;
    if (!ending) { toast('结局数据缺失，已返回封面。', true); renderIntro(); return; }
    saveGame(false);
    closeModal();
    clearToasts();
    showScreen('ending');
    if (A) A.playSfx(ending.tone === 'danger' ? 'collapse' : ending.id === 'held' ? 'ending' : 'ending_costly');
    const stats = ending.finalStats || ui.game.stats || {};
    const choices = ending.keyChoices || [];
    const chain = ending.chain || [];
    const timeline = choices.length ? '<ol class="decision-timeline">' + choices.map(function (record) {
      return '<li><span>R' + record.round + ' · ' + escapeHtml(record.dateLabel || '') + ' · ' + record.ap + ' AP</span><strong>' + escapeHtml(record.label) + '</strong><p>' + escapeHtml(L.formatDeltaText(record.deltas || {}, record.pressureDelta || 0)) + '</p>' + (record.scheduled && record.scheduled.length ? '<small>后续：' + escapeHtml(record.scheduled.join('；')) + '</small>' : '') + '</li>';
    }).join('') + '</ol>' : '<p class="empty-note">本局没有签发决策。</p>';
    const chainHtml = chain.length ? '<ul class="chain-list">' + chain.map(function (item) {
      return '<li><span>R' + item.appliedRound + ' · 实际触发</span><strong>' + escapeHtml(item.label) + '</strong><p>' + escapeHtml(item.note || '') + '</p><small>' + escapeHtml(L.formatDeltaText(item.deltas || {}, item.pressureDelta || 0)) + '</small></li>';
    }).join('') + '</ul>' : '<p class="empty-note">本局没有延迟后果在阶段内触发。</p>';
    const commandChains = ending.commandChains || [];
    const commandChainHtml = commandChains.length ? '<ol class="command-chain-list">' + commandChains.map(function (item) {
      return '<li><header><strong>' + escapeHtml(item.title) + '</strong><span>' + escapeHtml(agencyLabel(item.agency)) + ' · ' + escapeHtml(commandStatusLabel(item.status)) + '</span></header><ol class="command-history-list">' + item.history.map(function (entry) {
        return '<li><span>R' + entry.round + '</span><div><strong>' + escapeHtml(entry.title) + '</strong><p>' + escapeHtml(entry.text) + '</p></div></li>';
      }).join('') + '</ol></li>';
    }).join('') + '</ol>' : '<p class="empty-note">本局没有可展开的命令执行链。</p>';
    const toneLabel = ending.tone === 'success' ? '阶段存续' : ending.tone === 'warning' ? '代价存续' : '阶段未守住';
    el.ending.innerHTML = '<header class="ending-masthead"><span>总统办公室 / 阶段档案</span><span>2022.02.24 — 03.02</span></header>' +
      '<div class="ending-hero tone-' + escapeHtml(ending.tone || 'danger') + '"><span class="ending-stamp">' + escapeHtml(toneLabel) + '</span><p class="ending-kicker">' + escapeHtml(ending.kicker) + '</p><h1 class="ending-title">' + escapeHtml(ending.title) + '</h1><p class="ending-verdict">' + escapeHtml(ending.verdict) + '</p><div class="ending-meta"><span>第 ' + (ending.finalRound || ui.game.round) + ' / ' + L.finalRound + ' 回合</span><span>最终压力 ' + (ending.finalPressure != null ? ending.finalPressure : ui.game.pressure) + '</span><span>签发 ' + choices.length + ' 项</span><span>触发 ' + chain.length + ' 项延迟</span></div></div>' +
      '<div class="ending-layout"><div class="ending-column"><section class="ending-section"><span class="section-kicker">AFTER ACTION</span><h2>阶段记录</h2><div class="ending-copy">' + (ending.epilogue || []).map(function (p) { return '<p>' + escapeHtml(p) + '</p>'; }).join('') + '</div></section>' +
      governanceHtml(ending) + turningPointsHtml(ending) +
      '<section class="ending-section"><h2>命令如何走向后果</h2><p class="stat-hint">这里优先展示失效、阻塞、撤回与等待核验的命令：总统注意力、机构容量和窗口如何改变结果。</p>' + commandChainHtml + '</section>' +
      '<section class="ending-section"><h2>完整决策链</h2>' + timeline + '</section><section class="ending-section"><h2>延迟后果链</h2>' + chainHtml + '</section></div>' +
      '<aside class="ending-column"><section class="ending-section"><h2>七项最终状态</h2><div class="ending-stats">' + endingStatsHtml(stats) + '</div><div class="ending-pressure"><span>战争压力</span><strong>' + (ending.finalPressure != null ? ending.finalPressure : ui.game.pressure) + ' / 100</strong></div></section>' +
      '' + trendHtml(ending) + '<section class="ending-section"><h2>判定依据</h2><ul class="ending-reasons">' + (ending.reasons || []).map(function (r) { return '<li>' + escapeHtml(r) + '</li>'; }).join('') + '</ul><p class="stat-hint">结局同时参考多项状态、战争压力与决策链，不是单一分数。</p></section>' + recordsHtml() + '</aside></div>' +
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
