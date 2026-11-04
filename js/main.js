/*
 * 小泽模拟器 · v0.4.1 界面层
 * 只负责渲染、输入与存档调用；所有规则仍在 js/engine.js。
 */
(function () {
  'use strict';

  const L = window.LZS;
  if (!L) {
    document.body.innerHTML = '<main class="fatal"><h1>载入失败</h1><p>游戏没能载入。请刷新页面；若仍然失败，请确认网络没有拦截本站的脚本文件。</p></main>';
    return;
  }

  const A = window.LZS_AUDIO || null;
  const el = {
    intro: document.getElementById('screen-intro'),
    game: document.getElementById('screen-game'),
    ending: document.getElementById('screen-ending'),
    start: document.getElementById('btn-start'),
    continue: document.getElementById('btn-continue'),
    campaign: document.getElementById('btn-campaign'),
    continueCampaign: document.getElementById('btn-continue-campaign'),
    clearSave: document.getElementById('btn-clear-save'),
    how: document.getElementById('btn-how'),
    replayRoom: document.getElementById('btn-replay-room'),
    afterwardIntro: document.getElementById('btn-afterward-intro'),
    disclaimer: document.getElementById('btn-disclaimer'),
    saveSummary: document.getElementById('save-summary'),
    introVersion: document.getElementById('intro-version'),
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
    workbench: document.getElementById('workbench'),
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
    issueDelegate: document.getElementById('btn-issue-delegate'),
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
    opsTab: 'intel',
    replaySession: null,
    replayInfoMode: 'then',
    wbReturn: false
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
    if (name !== 'game') document.body.classList.remove('is-campaign');
    document.title = name === 'intro' ? '小泽模拟器 · 你能顶住几天？' : name === 'ending' ? '阶段结局 · 小泽模拟器' : '总统办公室 · 小泽模拟器';
    if (A) A.setTheme(name === 'intro' ? 'menu' : name === 'ending' ? 'ending' : (ui.game && ui.game.phase === 'interlude' ? 'night' : dayTheme()));
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
  function saveStateText(summary) {
    return summary.phase === 'ending' ? '已结束 · ' + (summary.endingTitle || '阶段结局') : '进行中 · 剩余 ' + summary.ap + ' AP';
  }

  function renderIntro() {
    closeModal();
    ui.selectedChoiceId = null;
    ui.lastDeltas = null;
    ui.game = null;
    showScreen('intro');
    const classic = L.getSaveSummary('classic');
    const campaign = L.getSaveSummary('campaign');
    el.continue.hidden = !classic;
    if (el.continueCampaign) el.continueCampaign.hidden = !campaign;
    el.clearSave.hidden = !classic && !campaign;
    el.saveSummary.hidden = !classic && !campaign;
    const startLabel = el.start.querySelector('span');
    if (startLabel) startLabel.textContent = classic ? '重新开始七日开局' : '七日开局 · 进入总统办公室';
    const campaignLabel = el.campaign ? el.campaign.querySelector('span') : null;
    if (campaignLabel) campaignLabel.textContent = campaign ? '重新开始基辅战役' : '基辅战役 · 38 天';
    const lines = [];
    if (classic) {
      el.continue.textContent = classic.phase === 'ending' ? '查看上次结局' : '继续七日开局';
      lines.push('七日开局：<strong>' + escapeHtml(classic.dateLabel) + '</strong> · 第 ' + classic.round + ' / ' + (classic.finalRound || L.finalRound) + ' 回合 · ' + escapeHtml(saveStateText(classic)));
    }
    if (campaign && el.continueCampaign) {
      el.continueCampaign.textContent = campaign.phase === 'ending' ? '查看战役结局' : '继续基辅战役';
      lines.push('基辅战役：<strong>' + escapeHtml(campaign.dateLabel) + '</strong> · 窗口 ' + campaign.round + ' / ' + campaign.finalRound + ' · 第 ' + (campaign.day || 1) + ' / 38 天 · ' + escapeHtml(saveStateText(campaign)));
    }
    el.saveSummary.innerHTML = lines.length ? '本机存档：' + lines.join('<br>') : '';
    if (el.replayRoom) {
      const R = replayApi();
      const unlocked = R ? R.summary().unlocked : false;
      el.replayRoom.textContent = unlocked ? '决策推演室' : '决策推演室（通关后解锁）';
      el.replayRoom.classList.toggle('is-muted', !unlocked);
    }
    if (el.introVersion && L.meta && L.meta.version) {
      el.introVersion.textContent = 'v' + L.meta.version;
    }
  }

  function scenarioArg(value) { return value === 'campaign' ? 'campaign' : 'classic'; }

  function requestStart(arg) {
    const scenario = scenarioArg(arg);
    if (L.hasSave(scenario)) {
      const summary = L.getSaveSummary(scenario);
      const isC = scenario === 'campaign';
      openConfirm({
        kicker: '覆盖确认', title: isC ? '重新开始基辅战役？' : '开始新一局？',
        message: '<p>本机已有一局' + (isC ? '基辅战役' : '七日开局') + '进度：<strong>' + escapeHtml(summary ? summary.dateLabel : '') + '</strong>，第 ' + (summary ? summary.round : '?') + (isC ? ' 个决策窗口' : ' 回合') + '。</p><p>开始新一局会覆盖这份存档；另一种模式的存档不受影响。</p>',
        confirmLabel: '覆盖并开始', onConfirm: function () { startNewGame(true, scenario); }
      });
      return;
    }
    startNewGame(true, scenario);
  }

  function startNewGame(force, arg, seed) {
    const scenario = scenarioArg(arg);
    if (!force && L.hasSave(scenario)) return;
    L.deleteSave(scenario);
    if (A) A.playSfx('menu');
    const options = { scenario: 'campaign' };
    if (scenario === 'campaign' && Number.isInteger(seed) && seed > 0) options.seed = seed;
    ui.game = scenario === 'campaign' ? L.createGame(options) : L.createGame();
    ui.selectedChoiceId = null;
    ui.lastDeltas = null;
    ui.lastPressureDelta = 0;
    saveGame(false);
    enterGame();
  }

  function loadGame(arg) {
    const data = L.loadSavedGame(scenarioArg(arg));
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
    else if (ui.game.phase === 'wrapup_offer') openWrapOffer();
  }

  function openHowToPlay() {
    openModal({
      kicker: '总统办公室 / 新手指引', title: '你要管理的是注意力',
      body: '<div class="help-grid">' +
        '<section><span>01</span><h3>读局势</h3><p>每回合先看事件视觉、情报摘要与国家状态。情报可信度描述信息边界，不代表成功率。</p></section>' +
        '<section><span>02</span><h3>分配 3 AP</h3><p>选择文件查看收益、代价、定性量级与延迟回合。可以签发多项，也可以保留未用 AP，但它不会结转。</p></section>' +
        '<section><span>03</span><h3>签发并归档</h3><p>固定底栏是签发前确认。签发后显示实际发生的变化；互斥命令不能同时执行。</p></section>' +
        '<section><span>04</span><h3>承担夜晚</h3><p>结束回合后，命令归档、延迟后果、状态侵蚀和战争压力依次结算。七日开局共七回合；基辅战役共 13 个决策窗口，结束窗口后系统按天模拟到下一窗口，危险线被新越过时会提前中断。</p></section>' +
        '<section><span>05</span><h3>重大决策</h3><p>战役中标为“重大决策”的文件由总统直接签署，不需召集协调，但低可信情报仍需先追问。它们多数不可逆，会在之后的窗口以“前序回响”回来。</p></section>' +
        '</div><p class="modal-note">键盘：Tab 移动焦点，Enter 或空格选择文件，Escape 关闭可关闭的窗口。手机可展开“国家状态”查看全部七项。</p>',
      actions: [{ label: '明白', className: 'btn btn-primary', onClick: function () {} }]
    });
  }

  function openDisclaimer() {
    openModal({
      kicker: '资料边界 / DISCLAIMER', title: '历史情景，不是历史复原',
      body: '<div class="confirm-copy"><p>七日开局的背景为 2022 年 2 月 24 日至 3 月 2 日，基辅战役为 2 月 24 日至 4 月 2 日。事件顺序参考公开资料；文电、幕僚评估和情境叙述为合成文本，不冒充真实档案，不虚构真实人物引语。</p><p><strong>所有 AP、状态、战争压力、效果和阈值都是模拟设计参数，不是历史统计。</strong>游戏不会用后见之明给玩家提示，也不评价真实人物的能力。</p><p>完整事实、当时认知、后来确认、争议与来源在结局后的独立历史复盘中开放。复盘正文离线可读；外部来源链接只有主动点击时才访问网络。</p></div>',
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
    const campaign = g.scenario === 'campaign';
    const board = campaign && L.getOfficeBoard ? L.getOfficeBoard(g) : [];
    const spec = strat().standing || { cost: 1, minCoordination: 45 };
    const cards = L.intel.agencies.map(function (agency) {
      const load = L.getAgencyLoad(g, agency.id);
      const done = !!g.coordinationThisRound[agency.id];
      const rec = g.standing && g.standing[agency.id];
      const standing = !!(rec && rec.active);
      const row = board.filter(function (r) { return r.id === agency.id; })[0];
      const loadPct = Math.min(100, Math.round(load.workload / load.capacity * 100));
      const constraint = campaign && row ? row.text : (load.overloaded ? '容量已满：新命令只能排队，无法今晚执行。' : load.strained ? '协调余量低于 35：跨部门命令会先阻塞。' : '可自主处理常规命令；跨部门行动仍需总统召集。');
      let standingHtml;
      if (standing && campaign) {
        const left = Math.max(0, (rec.expiresRound || g.round) - g.round);
        standingHtml = '<div class="standing-box"><span class="standing-badge">常设授权 · 还剩 ' + left + ' 个窗口' + (rec.suspended ? ' · 暂停中' : '') + '</span>' +
          '<p class="standing-scope">' + escapeHtml(rec.scope || '') + '</p>' +
          '<p class="standing-result">已自行办理 ' + (rec.handled || 0) + ' 项' + ((rec.items && rec.items.length) ? '：' + rec.items.slice(-2).map(function (i) { return escapeHtml(i.title); }).join('、') : '') + '</p>' +
          '<button type="button" class="mini-action" data-revoke="' + escapeHtml(agency.id) + '"' + (g.ap < (spec.revokeCost || 1) ? ' disabled' : '') + ' title="收回授权要花 ' + (spec.revokeCost || 1) + ' 点注意力，该机构协调余量 -' + (spec.revokeCoordination || 3) + '">收回授权 · ' + (spec.revokeCost || 1) + ' AP</button></div>';
      } else if (standing) {
        standingHtml = '<span class="standing-badge">常设授权 · 自第 ' + rec.grantedRound + ' 日</span>';
      } else {
        const scopeText = campaign && spec.scopes ? (spec.scopes[agency.id] || '') : '';
        const title = campaign
          ? '授权范围：' + scopeText + ' 只办一点注意力以内的常规事务，重大决定、新的政治表态与跨部门召集仍由总统决定；每办一项协调余量 -' + (spec.wearPerItem || 1) + '，' + (spec.durationWindows || 4) + ' 个窗口后自动失效。'
          : '此后该机构命令自动授权；每夜协调 -1，总统介入该机构命令额外 -3';
        standingHtml = '<button type="button" class="mini-action" data-standing="' + escapeHtml(agency.id) + '"' + (g.ap < spec.cost || load.coordination < spec.minCoordination ? ' disabled' : '') + ' title="' + escapeHtml(title) + '">常设授权 · ' + spec.cost + ' AP</button>' + (campaign && scopeText ? '<p class="standing-scope">' + escapeHtml(scopeText) + '</p>' : '');
      }
      return '<article class="agency-card' + (load.overloaded ? ' is-overloaded' : '') + (load.strained ? ' is-strained' : '') + (row ? ' is-' + row.state : '') + '"><div class="agency-card-head"><span class="agency-code">' + escapeHtml(agency.short) + '</span><div><h3>' + escapeHtml(agency.label) + '</h3><p>' + escapeHtml(agency.focus) + '</p></div>' + (row ? '<span class="office-state is-' + row.state + '">' + escapeHtml(row.stateLabel) + '</span>' : '') + '</div>' +
        '<div class="agency-meters"><span><small>协调余量</small><strong>' + load.coordination + '</strong></span><span><small>在办 / 容量</small><strong>' + load.workload + ' / ' + load.capacity + '</strong></span></div>' +
        '<div class="agency-load-track" role="img" aria-label="执行能力占用 ' + load.workload + ' / ' + load.capacity + '"><span style="width:' + loadPct + '%"></span></div>' +
        '<p class="agency-constraint">' + escapeHtml(constraint) + '</p>' +
        '<div class="agency-actions"><button type="button" class="mini-action' + (done ? '' : ' is-primary') + '" data-coordinate="' + escapeHtml(agency.id) + '"' + (done || g.ap < 1 ? ' disabled' : '') + '>' + (done ? '本回合已召集' : '召集协调 · 1 AP') + '</button>' + standingHtml + '</div></article>';
    }).join('');
    const lead = campaign
      ? '例行公文由各部门按授权自行办理，只有超出授权、资源不够、被卡住或要总统担责的事才会送到你面前。委派一项事务不花注意力，但接手的部门要有 45 以上的协调余量，每个窗口最多交出 3 项；余量低时办得不到位。常设授权在范围内自动办理例行事务，到期自动失效，也可以提前收回。'
      : '每个机构只有 3 个在办名额。跨日命令会持续占用名额，直到完成、撤回或失效；容量满时新命令不会执行。召集会恢复协调余量并放行本回合的跨部门阻塞，但会消耗 1 AP。委派不耗注意力的代价是交接延迟一夜与两个机构各 -3 协调余量。';
    body.innerHTML = '<p class="ops-lead">' + escapeHtml(lead) + '</p><div class="agency-grid">' + cards + '</div>';
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
        toast(campaign ? '常设授权已生效：该机构会在范围内自行办理例行事务。' : '常设授权已生效：该机构此后签发的命令自动进入执行。');
      });
    });
    Array.prototype.forEach.call(body.querySelectorAll('[data-revoke]'), function (button) {
      button.addEventListener('click', function () {
        const result = L.revokeStanding(g, button.getAttribute('data-revoke'));
        if (!result.ok) { toast(result.error || '无法收回授权。', true); return; }
        if (A) A.playSfx('issue');
        saveGame(false);
        renderGame();
        renderOpsBody(card);
        toast('授权已收回；之后这个部门的事务重新由总统签发。');
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
    renderWorkbench();
    renderEvent();
    renderCommandPanel();
    renderStats();
    renderForecast();
    renderPending();
    renderLogPanel();
    renderChoices(event);
    renderOrder();
    bindWorkbenchJumps();
    if (ui.wbReturn) { ui.wbReturn = false; returnToWorkbench(); }
  }

  function renderTop() {
    const g = ui.game;
    const event = L.getEvent(g);
    if (!event) return;
    const alarms = alarmMap(L.getAlarms(g));
    el.gameDate.textContent = event.dateLabel;
    const cs = campaignStatus();
    el.gamePhase.textContent = cs ? '窗口 ' + g.round + ' / ' + cs.windows + ' · ' + (cs.act ? String(cs.act.title).split(' · ')[0] : '') + ' · 第 ' + cs.day + ' / ' + cs.totalDays + ' 天' : '第 ' + g.round + ' / ' + L.finalRound + ' 回合 · ' + event.time;
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
    else el.apNote.textContent = '还可分配 ' + g.ap + ' 点注意力；' + (isCampaignGame() ? '注意力按决策窗口刷新，未用完的不会带入下一窗口。' : '未使用的 AP 不会保留。');
  }

  function renderEvent() {
    const g = ui.game;
    const event = L.getEvent(g);
    const art = artFor(event);
    const intel = event.intel || { level: '未知', note: '' };
    const situation = event.situation || [];
    if (el.deskPanel) el.deskPanel.innerHTML = deskStateHtml();
    el.eventMain.innerHTML = 
      '<div class="event-stage">' +
        '<figure class="scene scene-' + escapeHtml(event.id) + '">' +
          '<div class="scene-index"><span>事件视觉 / ' + String(g.round).padStart(2, '0') + '</span><span>模拟示意</span></div>' +
          (art.plain
            ? '<picture class="scene-picture"><img data-event-art="' + art.id + '" src="assets/events/' + art.id + '.svg" alt="' + escapeHtml(art.alt) + '" width="1152" height="640"></picture>' +
              (art.extra ? '<img class="scene-map" src="assets/events/' + art.extra + '.svg" alt="同一窗口的另一处示意" width="640" height="360" loading="lazy">' : '')
            : '<picture class="scene-picture"><source srcset="assets/visual/events/' + art.id + '.webp" type="image/webp"><img data-event-art="' + art.id + '" src="assets/events/' + art.id + '.svg" alt="' + escapeHtml(art.alt) + '" width="1152" height="640"></picture>' +
              '<img class="scene-map" src="assets/visual/maps/' + art.id + '.svg" alt="抽象态势示意，不表示实时前线或兵力" width="640" height="360" loading="lazy">') +
          '<figcaption><span>' + escapeHtml(art.caption) + '</span><span>原创模拟插画 · 非历史照片</span></figcaption>' +
        '</figure>' +
        '<article class="briefing-paper dossier">' +
          '<div class="paper-classification"><span>总统办公室 / 收文</span><span>LZS-' + String(g.round).padStart(2, '0') + '</span></div>' +
          '<p class="dossier-kicker">' + escapeHtml(event.kicker) + '</p>' +
          '<h1 class="dossier-title">' + escapeHtml(event.title) + '</h1>' +
          '<div class="intel-band"><span>情报可信度 <strong>' + escapeHtml(intel.level) + '</strong></span><p>' + escapeHtml(intel.note) + '</p></div>' +
          '<div class="situation"><p>' + escapeHtml(situation[0] || '') + '</p></div>' + windowBriefHtml(event) +
          '<details class="intel-details epistemics"><summary>展开完整简报与信息边界</summary><div class="intel-details-body">' +
            situation.slice(1).map(function (text) { return '<p>' + escapeHtml(text) + '</p>'; }).join('') +
            '<div class="epistemic-grid"><section class="epistemic-block"><h2>当时已知</h2>' + listHtml(event.known) + '</section>' +
            '<section class="epistemic-block is-unknown"><h2>当时无法确认</h2>' + listHtml(event.unknown) + '</section></div>' +
            '<p class="epistemic-note">信息空白来自总统视角；游戏不会暗中改变规则或添加随机效果。</p>' +
          '</div></details>' +
          '<div class="dossier-foot"><span>文电为合成文本</span><span>参数为模拟设计值</span></div>' +
        '</article>' +
      /* 战役窗口的来信进工作台；七日模式仍然按原样挂在简报下方。 */
      '</div>' + (isCampaignGame() ? feedHtml() : dispatchTrayHtml()) + echoesHtml();
    bindDispatches(el.eventMain);
  }

  /* ---------- v1.2：局势动态与因果回报（免费内容，不占注意力、不进工作台） ---------- */
  const FEED_KIND_LABEL = { brief: '局势动态', echo: '因果回报' };
  function feedApi() { return L.getFeed ? L.getFeed : null; }

  function feedItemHtml(item) {
    const label = FEED_KIND_LABEL[item.kind] || '局势动态';
    const lineName = item.lineTitle ? '<span class="feed-line">' + escapeHtml(item.lineTitle) + '</span>' : '';
    return '<li class="feed-item type-' + escapeHtml(item.kind || 'brief') + '">' +
      '<div class="feed-head"><span class="feed-kind">' + escapeHtml(label) + '</span>' + lineName + '</div>' +
      '<strong>' + escapeHtml(item.title) + '</strong>' +
      '<p>' + escapeHtml(item.body) + '</p>' +
      '<small class="feed-source">' + escapeHtml(item.source || '总统办公室 · 值班记录') + '</small>' +
      (item.historyLabel ? '<small class="dispatch-history"><span class="history-kind">' + escapeHtml(item.historyLabel) + '</span></small>' : '') +
    '</li>';
  }

  function feedHtml() {
    if (!isCampaignGame()) return '';
    const items = (feedApi() && feedApi()(ui.game)) || [];
    if (!items.length) return '';
    const echoes = items.filter(function (item) { return item.kind === 'echo'; }).length;
    const head = '<div class="tray-head"><h2>这几天里发生的事</h2><span>' + items.length + ' 条 · ' +
      (echoes ? echoes + ' 条与此前的决定有关' : '形势与各部门的进展') + '</span></div>';
    return '<section class="feed" aria-label="局势动态与因果回报">' + head +
      '<ol class="feed-list">' + items.map(feedItemHtml).join('') + '</ol>' +
      '<p class="feed-note">这一栏是免费内容：读不读都不影响注意力，也不会有事因为没读而必然出问题。</p>' +
    '</section>';
  }

  /* ---------- v0.5：日焦点、办公桌状态、前序回响、事务电报 ---------- */
  function strat() { return L.strategyData || window.LZS_STRATEGY || {}; }

  /* ---------- v0.6：基辅战役 ---------- */
  function isCampaignGame(g) { g = g || ui.game; return !!(g && (L.isCampaign ? L.isCampaign(g) : g.scenario === 'campaign')); }
  function scenarioOf() { return isCampaignGame() ? 'campaign' : 'classic'; }
  function finalRoundOf(g) { g = g || ui.game; return g && L.finalRoundFor ? L.finalRoundFor(g) : L.finalRound; }
  function eventsOf(g) { g = g || ui.game; return g && L.eventsFor ? L.eventsFor(g) : L.events; }
  function campaignStatus() { return isCampaignGame() && L.getCampaignStatus ? L.getCampaignStatus(ui.game) : null; }
  function dayTheme() { const cs = campaignStatus(); return cs && cs.act && cs.act.music ? cs.act.music : 'day'; }
  function spanText(days) { const d = Number(days || 0); return d < 1 ? '数小时' : (Math.round(d * 10) / 10) + ' 天'; }
  const CAMPAIGN_ART = { c1: 'e1', c2: 'e3', c3: 'e2', c4: 'e4', c5: 'e5', c6: 'e5', c7: 'e7', c8: 'e7', c9: 'e5', c10: 'e6', c11: 'e1', c12: 'e6', c13: 'e4' };
  // v1.0：战役窗口使用专门绘制的抽象矢量场景；main 为主图，extra 为右下角小图。
  const CAMPAIGN_SCENES = {
    c2: { main: 'antonov-assault', extra: 'runway-denial', alt: '安东诺夫机场的空降突击与跑道封堵示意', caption: '安东诺夫机场 · 突击与跑道封堵' },
    c3: { main: 'location', extra: 'vasylkiv', alt: '总统所在地与瓦西里科夫防空示意', caption: '首都连续性 · 空域与防空' },
    c5: { main: 'irpin-bridge', alt: '伊尔平河与桥梁的抽象示意', caption: '伊尔平河 · 桥梁与阻滞' },
    c6: { main: 'chernihiv', alt: '切尔尼戈夫北面压力与补给线的抽象示意', caption: '切尔尼戈夫 · 北面压力与补给线' },
    c7: { main: 'bucha-irpin-evac', alt: '布恰与伊尔平之间撤离路线的抽象示意', caption: '布恰—伊尔平 · 撤离路线' },
    c8: { main: 'office-waiting', alt: '总统办公室里等待汇报的桌面场景', caption: '总统办公室 · 等待汇报' },
    c9: { main: 'moshchun', extra: 'brovary', alt: '莫什春防线与布罗瓦雷东面道路的抽象示意', caption: '莫什春与布罗瓦雷 · 预备队去向' },
    c10: { main: 'aid-arrival', alt: '援助从请求到见效各环节的抽象示意', caption: '援助 · 从请求到真正用上' },
    c13: { main: 'reentry', alt: '撤退之后重新进入与安全确认的抽象示意', caption: '重新进入 · 先排查再通行' },
    c14: { main: 'wrap-repair', alt: '战后修桥、通电与居民返回的抽象示意', caption: '残局 · 修复与返回' },
    c15: { main: 'wrap-repair', alt: '战后修桥、通电与居民返回的抽象示意', caption: '残局 · 修复与返回' },
    c16: { main: 'wrap-repair', alt: '战后修桥、通电与居民返回的抽象示意', caption: '残局 · 修复与返回' }
  };
  function artFor(event) {
    if (isCampaignGame()) {
      const scene = CAMPAIGN_SCENES[event.id];
      if (scene) return { id: scene.main, extra: scene.extra || '', plain: true, alt: scene.alt, caption: scene.caption };
    }
    const base = EVENT_ART[CAMPAIGN_ART[event.id] || event.id] || EVENT_ART.e1;
    return isCampaignGame() ? Object.assign({}, base, { caption: event.title + ' · 原创抽象示意' }) : base;
  }
  const FRONT_TONE = { threat: 'danger', pressure: 'warning', contested: 'warning', cut: 'warning', held: 'ok', denied: 'ok', withdrawal: 'ok', reentered: 'ok' };
  function frontsMapHtml(fronts, title) {
    if (!fronts || !fronts.length) return '';
    const pts = fronts.map(function (f, i) {
      const x = Number(f.x), y = Number(f.y) * 0.7 + 2;
      return '<g class="front-pt tone-' + (FRONT_TONE[f.status] || 'warning') + '"><circle cx="' + x + '" cy="' + y + '" r="3.4"></circle><text x="' + x + '" y="' + (y + 1.4) + '" text-anchor="middle">' + (i + 1) + '</text></g>';
    }).join('');
    const legend = fronts.map(function (f, i) {
      return '<li class="tone-' + (FRONT_TONE[f.status] || 'warning') + '"><span class="front-num">' + (i + 1) + '</span><div><strong>' + escapeHtml(f.label) + '</strong><span class="front-status">' + escapeHtml(f.statusLabel || f.status) + '</span>' + (f.note ? '<p>' + escapeHtml(f.note) + '</p>' : '') + '</div></li>';
    }).join('');
    return '<figure class="front-map"><figcaption><strong>' + escapeHtml(title) + '</strong><span>抽象示意，不表示实际兵力或精确战线</span></figcaption>' +
      '<svg viewBox="0 0 100 74" role="img" aria-label="基辅周边六个方向的态势示意"><path class="river" d="M58 0 C60 16 55 30 57 42 S62 60 66 74"></path><path class="river is-minor" d="M22 44 C32 46 40 36 46 26"></path><circle class="kyiv-ring" cx="54" cy="42.6" r="9"></circle>' + pts + '</svg>' +
      '<ol class="front-legend">' + legend + '</ol></figure>';
  }
  function campaignDeskHtml(event, lamp, open, counts) {
    const cs = campaignStatus();
    const acts = (L.campaign && L.campaign.acts) || [];
    const actIdx = cs && cs.act ? acts.map(function (a) { return a.id; }).indexOf(cs.act.id) : 0;
    const actHtml = acts.map(function (act, i) {
      return '<li class="' + (i < actIdx ? 'is-past' : i === actIdx ? 'is-current' : '') + '"' + (i === actIdx ? ' aria-current="step"' : '') + '><strong>' + escapeHtml(String(act.title).split(' · ')[0]) + '</strong><span>' + escapeHtml(act.range || '') + '</span></li>';
    }).join('');
    const day = cs ? cs.day : 1, total = cs ? cs.totalDays : 38;
    const pct = Math.round(Math.min(100, Math.max(0, (day - 1) / total * 100)));
    return '<section class="desk-state campaign-desk lamp-' + lamp + '" aria-label="战役时间线与战场态势">' +
      '<div class="campaign-clock"><span class="day-focus-label">' + escapeHtml(cs && cs.act ? cs.act.title : '') + '</span>' + (cs && cs.act && cs.act.note ? '<p>' + escapeHtml(cs.act.note) + '</p>' : '') +
      '<div class="campaign-progress" role="img" aria-label="战役第 ' + day + ' / ' + total + ' 天"><span style="width:' + pct + '%"></span></div>' +
      '<p class="campaign-day">' + escapeHtml(cs ? cs.dateLabel : '') + ' · 第 ' + day + ' / ' + total + ' 天 · 窗口 ' + ui.game.round + ' / ' + (cs ? cs.windows : '') + '</p>' +
      '<ol class="act-track">' + actHtml + '</ol></div>' +
      frontsMapHtml(cs ? cs.fronts : [], '战场态势示意') +
      '<ul class="desk-items"><li class="desk-item desk-phone' + (open ? ' is-ringing' : '') + '"><span class="desk-glyph" aria-hidden="true">☎</span><span>' + (open ? open + ' 份电报待处理' : '无待处理电报') + '</span></li>' +
      '<li class="desk-item desk-files' + (counts.blocked ? ' is-heavy' : '') + '"><span class="desk-glyph" aria-hidden="true">▤</span><span>' + counts.active + ' 件在办' + (counts.blocked ? ' · ' + counts.blocked + ' 件受阻' : '') + '</span></li></ul></section>';
  }
  function windowBriefHtml(event) {
    if (!isCampaignGame()) return '';
    const cs = campaignStatus();
    const carry = cs && cs.carryDays ? cs.carryDays : 0;
    const hasKey = (event.choices || []).some(function (c) { return c.keyDecision; });
    return '<div class="window-span"><span>' + escapeHtml(event.span || event.dateLabel || '') + '</span><p>本窗口结束后，时间会推进约 ' + escapeHtml(spanText(Number(event.days || 0) + carry)) + (carry ? '（含上一窗口中断后结转的 ' + escapeHtml(spanText(carry)) + '）' : '') + '。' + (event.interruptible === false ? '这段时间不会被中断。' : '越过危险线时可能提前中断，并发出紧急简报。') + '</p></div>' +
      (hasKey ? '<div class="key-banner" role="note"><strong>重大决策</strong><p>本窗口包含高代价、多数不可逆的总统决定。同组方案互斥，签署后锁定。总统授权方向和资源，具体战斗由军事指挥链执行。</p></div>' : '');
  }
  function keyDetailHtml(choice) {
    const k = choice.keyDecision;
    if (!k) return '';
    return '<section class="key-detail"><h4>总统授权文件 · 重大决策</h4><dl><div><dt>战略目的</dt><dd>' + escapeHtml(k.purpose || '') + '</dd></div><div><dt>已知代价</dt><dd>' + escapeHtml(k.cost || '') + '</dd></div><div><dt>无法确认</dt><dd>' + escapeHtml(k.unknown || '') + '</dd></div></dl><p>' + (k.irreversible ? '签发后不可撤回；执行、反馈与后续影响会记入战役档案。' : '后续影响会记入战役档案。') + '</p></section>';
  }
  function campaignInterludeHtml(data) {
    return (data.wrapStart ? wrapStartHtml(data) : campaignClockHtml(data)) + wrapStatusHtml(data) + aidHtml(data) + officeHtml(data);
  }
  function wrapStartHtml(data) {
    return '<li class="campaign-step"><span class="settlement-index">00</span><section><h3>战役收束 · 从 4 月 3 日起</h3><p>前线不再有新的攻势。接下来要处理的是雷区和未爆弹药、道路桥梁、失踪和受伤人员、平民返回的条件，以及部队恢复。这些工作按天慢慢推进，不会因为多下几道命令就一下子完成。</p></section></li>';
  }
  function wrapStatusHtml(data) {
    const g = ui.game;
    if (!g || !g.wrapup || !g.wrapup.started || data.wrapOffer || !L.getWrapStatus) return '';
    const st = L.getWrapStatus(g);
    if (!st || !st.tracks.length) return '';
    return '<li class="campaign-step"><span class="settlement-index">收</span><section><h3>残局处理进度</h3><ul class="wrap-tracks">' + st.tracks.map(function (tr) { return '<li><span>' + escapeHtml(tr.label) + '</span><strong>' + escapeHtml(tr.word) + '</strong></li>'; }).join('') + '</ul><p class="stat-hint">收束阶段最晚到 4 月 16 日。进入城区的速度不要超过排查的速度。</p><button type="button" class="btn btn-ghost" data-wrap-finish>现在结束收束，查看结局</button></section></li>';
  }
  function aidHtml(data) {
    const events = data.aid || [];
    const status = (ui.game && L.getAidStatus) ? L.getAidStatus(ui.game).filter(function (s) { return !s.done; }) : [];
    if (!events.length && !status.length) return '';
    const evHtml = events.map(function (ev) { return '<li><div><strong>' + escapeHtml((ev.title ? ev.title + '：' : '') + ev.label) + '</strong><span>' + (ev.slipped ? '推迟' : ev.stalled ? '停滞' : '进展') + '</span></div><p>' + escapeHtml(ev.note || '') + '</p><div class="effect-row">' + (effectChips(ev.deltas || {}, 0) || '') + '</div></li>'; }).join('');
    const stHtml = status.map(function (s) { return '<li class="aid-state"><strong>' + escapeHtml(s.title) + '</strong><span>' + escapeHtml(s.status) + (s.stage > 0 ? ' · 第 ' + s.stage + '/' + s.total + ' 步' : '') + (s.next ? ' · 下一步：' + escapeHtml(s.next) + (s.etaRounds != null ? '，约 ' + Math.max(1, s.etaRounds) + ' 个窗口后' : '') : '') + '</span></li>'; }).join('');
    return '<li class="campaign-step"><span class="settlement-index">援</span><section><h3>外部援助 · 进展</h3>' + (evHtml ? '<ul class="settlement-list">' + evHtml + '</ul>' : '') + (stHtml ? '<ul class="aid-states">' + stHtml + '</ul>' : '') + '</section></li>';
  }
  function officeHtml(data) {
    const o = data.office;
    if (!o) return '';
    const groups = [['handled', '已办理'], ['delayed', '办理延后'], ['escalated', '上报总统']];
    const rows = [];
    groups.forEach(function (gr) { (o[gr[0]] || []).forEach(function (item) { rows.push('<li class="office-row is-' + gr[0] + '"><div><strong>' + escapeHtml(item.label || '') + '</strong><span>' + gr[1] + '</span></div><p>' + escapeHtml(item.note || '') + '</p></li>'); }); });
    if (!rows.length) return '';
    return '<li class="campaign-step"><span class="settlement-index">办</span><section><h3>办公室日报</h3><p>例行公文由各部门按授权办理，这里只列出需要你知道的。</p><ul class="settlement-list">' + rows.join('') + '</ul></section></li>';
  }
  function openWrapOffer() {
    if (!ui.game || ui.game.phase !== 'wrapup_offer') return;
    if (modalIsOpen() && el.modalRoot.querySelector('[data-wrap-offer]')) return;
    clearToasts();
    openModal({
      kicker: '4 月 2 日 / 战役告一段落', title: '基辅战役可以在这里收束', dismissible: false, wide: true, className: 'interlude-modal',
      body: '<div class="wrap-offer" data-wrap-offer><p>俄军已经撤离基辅方向。主战役到此为止，你可以选择怎么结束这一局。</p><div class="wrap-options"><section><h3>A · 现在结束</h3><p>直接进入结局和历史复盘。不扣分，也不会改变已经确定的结局。</p></section><section><h3>B · 继续处理残局</h3><p>最多再用 14 天，最晚到 4 月 16 日。要处理的是雷区和未爆弹药、道路桥梁、失踪和受伤人员、平民返回的条件、部队恢复，以及撤退情报的进一步确认。随时可以提前结束。</p><p class="stat-hint">这一阶段没有新的攻势。进城太快而排查没有跟上，会出现伤亡事故。</p></section></div></div>',
      actions: [
        { label: '现在结束，查看结局', className: 'btn btn-ghost', close: false, onClick: function () {
          const r = L.declineWrapUp(ui.game);
          if (!r.ok) { toast(r.error || '无法结束战役。', true); return; }
          closeModal(); saveGame(false); showEnding();
        } },
        { label: '继续处理残局', className: 'btn btn-primary', close: false, onClick: function () {
          const r = L.startWrapUp(ui.game);
          if (!r.ok) { toast(r.error || '无法开始收束。', true); return; }
          closeModal(); saveGame(false); renderGame(); openInterlude(ui.game.interlude);
        } }
      ]
    });
  }
  function aftermathHtml(ending) {
    const a = ending.aftermath;
    if (!a) return '';
    return '<section class="ending-section aftermath"><span class="section-kicker">AFTERMATH</span><h2>收束阶段 · 到 ' + escapeHtml(a.endLabel || '') + '</h2><p>' + escapeHtml(a.mood || '') + '</p><ul class="wrap-tracks">' + (a.tracks || []).map(function (tr) { return '<li><span>' + escapeHtml(tr.label) + '</span><strong>' + escapeHtml(tr.word) + '</strong></li>'; }).join('') + '</ul>' + (a.incident ? '<p class="stat-hint">进入速度超过了排查速度，这一阶段出现过伤亡事故。</p>' : '') + '<p class="stat-hint">' + escapeHtml(a.note || '') + '</p></section>';
  }
  function campaignClockHtml(data) {
    const c = data.campaign;
    if (!c) return '';
    const it = c.interruption;
    const echoes = data.echoes || [];
    return '<li class="campaign-step"><span class="settlement-index">00</span><section><h3>这几天里 · ' + escapeHtml(spanText(c.days)) + '</h3><p>' + escapeHtml((c.fromLabel || '') + ' 至 ' + (c.toLabel || '')) + '：命令照常执行，部队和物资持续消耗，前线压力与此前留下的后果一并推进。下面只列出值得你知道的变化。</p>' +
      (it ? '<div class="interrupt-note" role="alert"><strong>紧急简报 · 时间推进提前中断</strong><p>' + escapeHtml(it.dateLabel + '，' + it.title + '。剩余 ' + it.carried + ' 天并入下一个决策窗口。') + '</p></div>' : '') +
      (echoes.length ? '<ul class="settlement-list">' + echoes.map(function (item) { return '<li><div><strong>' + escapeHtml(item.title) + '</strong><span>此前决定的后果</span></div><p>' + escapeHtml(item.text || '') + '</p><div class="effect-row">' + (effectChips(item.deltas || {}, item.pressureDelta || 0) || '') + '</div></li>'; }).join('') + '</ul>' : '') +
      '</section></li>';
  }
  const NODE_LABELS = { airfield: '安东诺夫机场', capital: '政府连续性', bridges: '伊尔平河与桥梁', reserve: '莫什春 / 布罗瓦雷预备队', signal: '3 月 29 日撤退信号', return: '重新进入失地' };
  const DIVERGE_LABELS = { near: '接近历史基线', diverged: '偏离历史基线', missed: '未作出或命令失效', abstract: '历史基线是抽象的，不逐项对比', none: '—' };
  const DIM_LEVEL = { good: '尚可', strained: '吃紧', severe: '严重受损' };
  /* ---------- v1.2：本局故事线与关键因果链 ---------- */
  const STORY_STATE_LABEL = { unexplored: '本局没有展开', pending: '刚开场', partial: '进行到中途', complete: '走完了' };
  function storySectionHtml() {
    if (!L.getStorySummary) return '';
    const sum = L.getStorySummary(ui.game);
    if (!sum) return '';
    const narrative = L.getStoryNarrative ? L.getStoryNarrative(ui.game) : '';
    const active = (sum.lines || []).filter(function (line) { return line.primary || line.auxiliary; });
    if (!active.length) return '';
    const chain = active.map(function (line) {
      const path = line.path ? '<p class="story-path">本局走向：' + escapeHtml(line.path.label) + (line.path.note ? '——' + escapeHtml(line.path.note) : '') + '</p>' : '<p class="story-path is-open">这条线本局没有形成明确决定，事情按各部门现有安排继续。</p>';
      return '<li class="story-line is-' + escapeHtml(line.state) + (line.primary ? '' : ' is-aux') + '">' +
        '<div class="story-line-head"><span class="story-line-kind">' + (line.primary ? '主线' : '辅线') + '</span><strong>' + escapeHtml(line.title) + '</strong>' +
        '<span class="story-line-state">' + escapeHtml(STORY_STATE_LABEL[line.state] || line.state) + '</span></div>' +
        '<p class="stat-hint">' + escapeHtml(line.theme) + ' · 看到第 ' + line.seen + '/' + line.total + ' 步</p>' + path + '</li>';
    }).join('');
    return '<section class="ending-section story-review"><span class="section-kicker">THIS RUN</span><h2>本局战役故事</h2>' +
      '<p>' + escapeHtml(narrative) + '</p><ol class="story-chain">' + chain + '</ol>' +
      '<p class="stat-hint">故事线由本局种子与你的决定共同决定。换一个种子，展开的主线会不同；同种子同决定可以得到同样的走向。</p></section>';
  }

  function campaignEndingMainHtml(ending) {
    const keys = ending.keyDecisions || [];
    const keyHtml = keys.length ? '<ol class="key-chain">' + keys.map(function (k) {
      return '<li><span>' + escapeHtml((NODE_LABELS[k.node] || k.node) + ' · 窗口 ' + k.round + ' · ' + (k.dateLabel || '')) + '</span><strong>' + escapeHtml(k.title) + '</strong><p>目的：' + escapeHtml(k.purpose || '') + '</p><p>代价：' + escapeHtml(k.cost || '') + '</p><small>执行状态：' + escapeHtml(commandStatusLabel(k.status)) + (k.irreversible ? ' · 不可逆' : '') + '</small></li>';
    }).join('') + '</ol>' : '<p class="empty-note">本局没有签发重大决策。</p>';
    const divHtml = '<ul class="divergence-list">' + (ending.divergence || []).map(function (d) {
      return '<li class="is-' + escapeHtml(d.kind) + '"><strong>' + escapeHtml(NODE_LABELS[d.node] || d.node) + '</strong><span>' + escapeHtml(DIVERGE_LABELS[d.kind] || d.kind) + '</span>' + (d.picks && d.picks.length ? '<p>你的选择：' + escapeHtml(d.picks.join('；')) + '</p>' : '') + (d.note ? '<p class="stat-hint">历史参照：' + escapeHtml(d.note) + '</p>' : '') + '</li>';
    }).join('') + '</ul>';
    const first = ending.firstDivergence;
    const windows = ending.windows || [];
    const winHtml = windows.length ? '<ol class="window-track">' + windows.map(function (w) {
      const ev = eventsOf().filter(function (item) { return item.id === w.eventId; })[0];
      return '<li' + (w.interrupted ? ' class="is-interrupted"' : '') + '><span>' + escapeHtml(L.campaignDateLabel(Math.floor(w.fromDay)) + ' → ' + L.campaignDateLabel(Math.floor(w.toDay))) + '</span><strong>' + escapeHtml(ev ? ev.title : w.eventId) + '</strong><small>' + escapeHtml('内部模拟 ' + spanText(w.simulated) + (w.interrupted ? ' · 紧急中断' : '')) + '</small></li>';
    }).join('') + '</ol>' : '';
    return '<section class="ending-section"><span class="section-kicker">KEY ORDERS</span><h2>重大决策如何走向战役结果</h2>' + keyHtml + '</section>' + storySectionHtml() +
      '<section class="ending-section"><h2>你的时间线与历史基线</h2><p class="stat-hint">' + escapeHtml(first ? '最早的偏离：' + (NODE_LABELS[first.node] || first.node) + (first.round ? '（窗口 ' + first.round + '）' : '') + '。偏离之后的差异包含模型内部推演，不等于历史事实。' : '本局关键节点与历史基线大体一致；差异来自数值与执行过程，也属于模型推演。') + '</p>' + divHtml + '</section>' +
      (winHtml ? '<section class="ending-section"><h2>38 天的时间推进</h2>' + winHtml + '</section>' : '');
  }
  function campaignEndingSideHtml(ending) {
    return '<section class="ending-section"><h2>八维战役结果</h2><p class="stat-hint">结局 ' + escapeHtml(ending.code || '') + ' · 合理性「' + escapeHtml(ending.plausibility || '') + '」。合理性指历史条件与现实机制的支持程度，不是评分。</p><ul class="dim-list">' + (ending.dims || []).map(function (d) {
      return '<li class="is-' + escapeHtml(d.level) + '"><span>' + escapeHtml(d.label) + '</span><strong>' + escapeHtml(DIM_LEVEL[d.level] || d.level) + '</strong><small>' + d.value + '</small></li>';
    }).join('') + '</ul></section>' +
      (ending.fronts && ending.fronts.length ? '<section class="ending-section"><h2>4 月 2 日的方向状态</h2>' + frontsMapHtml(ending.fronts, '战役收束时的态势示意') + '</section>' : '');
  }
  const HIST_STATUS = { confirmed: '已确认', reported: '当时报道', disputed: '有争议', analysis: '战后分析' };
  function campaignHistoryHtml() {
    const C = L.campaign || {};
    const srcMap = {};
    (C.sources || []).forEach(function (s) { srcMap[s.id] = s; });
    const ending = (ui.game && ui.game.ending) || {};
    const hist = '<ol class="history-timeline">' + (C.history || []).map(function (item) {
      return '<li class="is-' + escapeHtml(item.status) + '"><span>' + escapeHtml(item.date + ' · ' + (HIST_STATUS[item.status] || item.status)) + '</span><strong>' + escapeHtml(item.event) + '</strong><p>信息何时可得：' + escapeHtml(item.known || '') + '</p><small>来源：' + (item.sources || []).map(function (id) { return escapeHtml(srcMap[id] ? String(srcMap[id].title).split('：')[0] : id); }).join('、') + '</small></li>';
    }).join('') + '</ol>';
    const cf = (ending.counterfactuals || []).map(function (c) {
      return '<article class="counterfactual"><h3>' + escapeHtml(c.title) + '</h3><dl><div><dt>当时已知</dt><dd>' + escapeHtml(c.known || '') + '</dd></div><div><dt>仍不确定</dt><dd>' + escapeHtml(c.uncertain || '') + '</dd></div><div><dt>可以支持的推论</dt><dd>' + escapeHtml(c.inference || '') + '</dd></div><div><dt>不能确定的地方</dt><dd>' + escapeHtml(c.cannot || '') + '</dd></div><div><dt>不同研究视角</dt><dd>' + escapeHtml(c.perspectives || '') + '</dd></div></dl></article>';
    }).join('');
    const research = '<ul class="research-list">' + (C.research || []).map(function (r) { return '<li><strong>' + escapeHtml(r.title) + '</strong><p>' + escapeHtml(r.text) + '</p><small>' + escapeHtml(srcMap[r.source] ? srcMap[r.source].title : r.source) + '</small></li>'; }).join('') + '</ul>';
    const sources = '<ol class="source-list">' + (C.sources || []).map(function (s) { return '<li><a href="' + escapeHtml(s.url) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(s.title) + '</a></li>'; }).join('') + '</ol>';
    return '<section class="history-review campaign-review"><h2>基辅方向的历史进程（2 月 24 日—4 月 2 日）</h2><p class="stat-hint">以下资料只在战役结束后开放。标签区分已确认事实、当时报道、争议与战后分析；游戏内数值不是历史统计。</p>' + hist +
      (cf ? '<h2>反事实分析</h2><p class="stat-hint">根据本局偏离历史基线的节点选出。反事实推演没有唯一正确答案。</p>' + cf : '') +
      '<h2>研究者的分析框架</h2><p class="stat-hint">以下是对公开研究的概括与归属，不是原文引语；它们都是战后研究，不是战争当时的预测。</p>' + research +
      '<h2>资料来源</h2>' + sources + '</section>';
  }

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
    if (isCampaignGame()) return campaignDeskHtml(event, lamp, open, counts);
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
    if (isCampaignGame()) {
      const cs = campaignStatus();
      (cs ? cs.echoes : []).forEach(function (item) { rows.unshift({ cls: 'is-echo', text: item.title + '：' + item.text }); });
    }
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

  /* 动态事件与故事线文件：显示这条报告 / 这份文件的属性（历史事实 / 资料支持的合理决策 /
     模拟推演 / 机制假设），不显示内部编号，也不假装它是确凿事实。 */
  function historyTagHtml(item) {
    if (!item || (item.type !== 'dynamic' && item.type !== 'story') || !item.historyLabel) return '';
    return '<small class="dispatch-history"><span class="history-kind">' + escapeHtml(item.historyLabel) + '</span>' + (item.historyNote ? ' · ' + escapeHtml(item.historyNote) : '') + '</small>';
  }

  function dispatchRowHtml(item) {
    const g = ui.game;
    const isStory = item.type === 'story';
    const actions = item.resolved ? '<p class="dispatch-outcome">已处理：' + escapeHtml(item.outcome && item.outcome.label ? item.outcome.label : '已阅') + '</p>' :
      '<div class="dispatch-actions">' + (item.options || []).map(function (option) {
        const cost = option.ap ? option.ap + ' AP' : '不耗 AP';
        const isDefault = option.id === item.defaultOption;
        return '<button type="button" class="mini-action' + (option.ap ? ' is-primary' : '') + '" data-dispatch="' + escapeHtml(item.id) + '" data-option="' + escapeHtml(option.id) + '"' + ((option.ap || 0) > g.ap || g.phase !== 'briefing' ? ' disabled' : '') + '>' + escapeHtml(option.label) + (option.label.indexOf('AP') === -1 ? ' · ' + cost : '') + (isDefault && (item.options || []).length > 1 ? ' · 不处理则默认' : '') + '</button>';
      }).join('') + '</div>';
    return '<li class="dispatch-item type-' + escapeHtml(item.type) + (item.resolved ? ' is-resolved' : '') + '">' +
      '<span class="dispatch-kicker">' + escapeHtml(item.kicker || '模拟反馈') + '</span>' +
      (isStory ? '<span class="story-line-badge">' + escapeHtml(item.storyTitle || '') + '</span>' : '') +
      '<strong>' + escapeHtml(item.title) + '</strong><p>' + escapeHtml(item.body) + '</p>' +
      (item.source ? '<small>' + escapeHtml(item.source) + '</small>' : '') + historyTagHtml(item) + actions + '</li>';
  }

  /* 七日模式（以及战役里还没进工作台的旧渲染路径）仍然用这个托盘。 */
  function dispatchTrayHtml() {
    const items = L.getDispatches(ui.game, true) || [];
    if (!items.length) return '';
    const open = items.filter(function (item) { return !item.resolved; }).length;
    return '<section class="dispatch-tray" aria-label="事务电报">' +
      '<div class="tray-head"><h2>事务电报</h2><span>' + (open ? open + ' 份待处理' : '今日已处理完') + '</span></div>' +
      '<ol class="dispatch-list">' + items.map(dispatchRowHtml).join('') + '</ol>' +
    '</section>';
  }

  function bindDispatches(scope) {
    Array.prototype.forEach.call(scope.querySelectorAll('[data-dispatch]'), function (button) {
      button.addEventListener('click', function () {
        if (!ui.game || ui.busy) return;
        const inWorkbench = !!(button.closest && button.closest('#workbench'));
        const result = L.resolveDispatch(ui.game, button.getAttribute('data-dispatch'), button.getAttribute('data-option'));
        if (!result.ok) { if (A) A.playSfx('invalid'); toast(result.error || '无法处理这份电报。', true); return; }
        if (A) A.playSfx('file');
        saveGame(false);
        renderGame();
        if (inWorkbench) returnToWorkbench();
        toast('电报已处理并归档。');
      });
    });
  }

  /* ---------- v1.1.1：总统工作台 ----------
     把「现在有什么在等我」集中到进入窗口后的第一屏。清单由 js/workbench.js 从真实状态算出来，
     这里的按钮全部调用引擎里原有的函数：授权、批准、介入、处理电报、签发文件。 */
  function wbApi() { return window.LZS_WORKBENCH || null; }

  function wbScrollTo(node, offset) {
    if (!node) return;
    const top = node.getBoundingClientRect().top + window.scrollY - (offset == null ? 10 : offset);
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: Math.max(0, top), behavior: reduce ? 'auto' : 'smooth' });
  }

  function returnToWorkbench() {
    if (!el.workbench) return;
    wbScrollTo(el.workbench, 8);
    el.workbench.classList.add('is-updated');
    window.setTimeout(function () { if (el.workbench) el.workbench.classList.remove('is-updated'); }, 1400);
  }

  function wbActionHtml(action) {
    const cls = 'wb-btn' + (action.primary ? ' is-primary' : '') + (action.type === 'jump' ? ' is-quiet' : '');
    const disabled = action.disabled ? ' disabled' : '';
    const label = escapeHtml(action.label) + (action.note ? ' <span class="wb-btn-note">' + escapeHtml(action.note) + '</span>' : '');
    if (action.type === 'approve') return '<button type="button" class="' + cls + '" data-approve="' + escapeHtml(action.commandId) + '"' + disabled + '>' + label + '</button>';
    if (action.type === 'authorize') return '<button type="button" class="' + cls + '" data-authorize="' + escapeHtml(action.commandId) + '"' + disabled + '>' + label + '</button>';
    if (action.type === 'delegate') return '<button type="button" class="' + cls + '" data-delegate="' + escapeHtml(action.commandId) + '"' + disabled + '>' + label + '</button>';
    if (action.type === 'followup') return '<button type="button" class="' + cls + '" data-followup="' + escapeHtml(action.commandId) + '"' + disabled + '>' + label + '</button>';
    if (action.type === 'choice') return '<button type="button" class="' + cls + '" data-wb-choice="' + escapeHtml(action.choiceId) + '"' + disabled + '>' + label + '</button>';
    if (action.type === 'dispatch') return '<button type="button" class="' + cls + '" data-dispatch="' + escapeHtml(action.dispatchId) + '" data-option="' + escapeHtml(action.optionId) + '"' + disabled + '>' + label + '</button>';
    if (action.type === 'intel') return '<button type="button" class="' + cls + '" data-open-intel="' + escapeHtml(action.category || 'military') + '"' + disabled + '>' + label + '</button>';
    if (action.type === 'ops') return '<button type="button" class="' + cls + '" data-wb-ops="' + escapeHtml(action.tab || 'agencies') + '"' + disabled + '>' + label + '</button>';
    if (action.type === 'jump') return '<button type="button" class="' + cls + '" data-wb-jump="' + escapeHtml(action.target || 'command-panel') + '"' + disabled + '>' + label + '</button>';
    return '';
  }

  function wbItemHtml(item) {
    const actions = (item.actions || []).map(wbActionHtml).join('');
    const foot = [item.source, item.meta].filter(function (part) { return !!part; }).join(' · ');
    return '<li class="wb-item is-' + escapeHtml(item.kind) + (item.urgent ? ' is-urgent' : '') + '">' +
      '<div class="wb-item-grid"><div class="wb-item-text">' +
        '<h3 class="wb-item-title"><span class="wb-tag tag-' + escapeHtml(item.kind) + '">' + escapeHtml(item.tag) + '</span>' + escapeHtml(item.title) + '</h3>' +
        (item.body ? '<p class="wb-item-body">' + escapeHtml(item.body) + '</p>' : '') +
        (foot ? '<p class="wb-item-meta">' + escapeHtml(foot) + '</p>' : '') +
      '</div>' + (actions ? '<div class="wb-actions">' + actions + '</div>' : '') + '</div>' +
    '</li>';
  }

  function workbenchHtml() {
    const WB = wbApi();
    if (!WB || !ui.game) return '';
    const view = WB.classify(ui.game, L);
    const s = view.situation || {};
    const head = '<header class="wb-head"><div class="wb-head-main">' +
        '<span class="wb-kicker">总统工作台' + (s.windowText ? ' · ' + escapeHtml(s.windowText) : '') + '</span>' +
        '<h2 id="wb-title">现在等你处理的事</h2>' +
        '<p class="wb-situation">' + escapeHtml((s.dateLabel || '') + (s.actTitle ? ' · ' + s.actTitle : '')) + (s.line ? '　' + escapeHtml(s.line) : '') + '</p>' +
      '</div><div class="wb-vitals">' +
        '<span class="wb-vital"><span>注意力</span><strong>' + view.ap + '</strong><em>/ ' + view.apMax + '</em></span>' +
        (s.keyStat ? '<span class="wb-vital is-' + escapeHtml(s.keyStat.level) + '"><span>' + escapeHtml(s.keyStat.label) + '</span><strong>' + s.keyStat.value + '</strong></span>' : '') +
        '<span class="wb-vital' + (view.counts.needs ? ' is-warn' : '') + '"><span>等你处理</span><strong>' + view.counts.needs + '</strong></span>' +
      '</div></header>';

    if (!view.briefing) {
      return head + '<div class="wb-empty"><strong>本窗口正在结算。</strong><p>时间在往前走：命令照常执行或延误，机构继续办手上的事。等结算结束，下一个窗口的待办会出现在这里。</p></div>';
    }

    const needList = view.needs.length
      ? '<ol class="wb-list">' + view.needs.map(wbItemHtml).join('') + '</ol>'
      : '<div class="wb-empty"><strong>现在没有必须由你处理的事。</strong><p>你可以读晨间电报、检查在办的命令，或者直接结束这个窗口。想主动出手，就往下看本窗口的待签文件。</p>' +
        '<div class="wb-empty-actions"><button type="button" class="wb-btn" data-wb-jump="choices-panel">看本窗口的待签文件</button>' +
        '<button type="button" class="wb-btn is-quiet" data-wb-jump="event-main">读完整简报</button></div></div>';

    const watch = view.watch.length
      ? '<details class="wb-group wb-watch"' + (view.watch.some(function (item) { return item.urgent; }) ? ' open' : '') + '><summary>' + view.watch.length + ' 项在推进，不需要你逐项操作</summary><ul class="wb-list is-soft">' + view.watch.map(wbItemHtml).join('') + '</ul></details>'
      : '';

    const softRows = view.soft.map(wbItemHtml).join('');
    const resolved = (L.getDispatches ? L.getDispatches(ui.game, true) : []).filter(function (item) { return item.resolved; });
    const softTotal = view.soft.length + resolved.length;
    const soft = softTotal
      ? '<details class="wb-group wb-soft"><summary>其他来信 · ' + softTotal + ' 份（可以延后或已经处理）</summary>' +
        (softRows ? '<ul class="wb-list is-soft">' + softRows + '</ul>' : '') +
        (resolved.length ? '<ol class="dispatch-list">' + resolved.map(dispatchRowHtml).join('') + '</ol>' : '') +
        '</details>'
      : '';

    const blockers = view.blockers.length
      ? '<ul class="wb-blockers">' + view.blockers.map(function (item) { return '<li>' + escapeHtml(item.text) + '</li>'; }).join('') + '</ul>'
      : '';
    const foot = '<footer class="wb-foot"><p>' + escapeHtml(WB.endWindowNote(view)) + '</p>' +
      '<div class="wb-foot-actions">' +
        '<button type="button" class="wb-btn is-primary" data-wb-end' + (view.blockers.length ? ' disabled' : '') + '>结束本窗口</button>' +
        '<button type="button" class="wb-btn is-quiet" data-wb-jump="choices-panel">待签文件</button>' +
        '<button type="button" class="wb-btn is-quiet" data-wb-jump="stats-panel">国家状态</button>' +
      '</div></footer>';
    return head + needList + blockers + watch + soft + foot;
  }

  function renderWorkbench() {
    if (!el.workbench) return;
    /* 只有战役窗口需要工作台：十三窗口、多机构、跨窗口命令才有「这一窗还有什么在等我」的问题。
       七日经典模式维持原来的单文件界面，不额外加一层。 */
    const show = !!(ui.game && isCampaignGame());
    document.body.classList.toggle('is-campaign', show);
    el.workbench.hidden = !show;
    if (!show) { el.workbench.innerHTML = ''; return; }
    el.workbench.innerHTML = workbenchHtml();
    bindCommandActions(el.workbench);
    bindDispatches(el.workbench);
    Array.prototype.forEach.call(el.workbench.querySelectorAll('[data-wb-choice]'), function (button) {
      button.addEventListener('click', function () { jumpToChoice(button.getAttribute('data-wb-choice')); });
    });
    Array.prototype.forEach.call(el.workbench.querySelectorAll('[data-wb-ops]'), function (button) {
      button.addEventListener('click', function () { openOperations(button.getAttribute('data-wb-ops') || 'agencies'); });
    });
    Array.prototype.forEach.call(el.workbench.querySelectorAll('[data-wb-end]'), function (button) {
      button.addEventListener('click', requestEndRound);
    });
    // 在工作台里按下授权/批准/介入之后，回到工作台看更新过的清单（只在本区生效，别处维持原位）。
    if (!el.workbench.getAttribute('data-wb-click')) {
      el.workbench.setAttribute('data-wb-click', '1');
      el.workbench.addEventListener('click', function (event) {
        const hit = event.target && event.target.closest ? event.target.closest('[data-approve],[data-authorize],[data-followup]') : null;
        if (hit) ui.wbReturn = true;
      }, true);
    }
  }

  function jumpToChoice(choiceId) {
    if (!ui.game) return;
    const status = L.getChoiceStatus(ui.game, choiceId);
    if (!status.canIssue) { if (A) A.playSfx('invalid'); toast(status.message || '这项文件现在不能签发。', true); return; }
    if (ui.selectedChoiceId !== choiceId) selectChoice(choiceId);
    const card = el.choicesPanel.querySelector('[data-choice-id="' + choiceId + '"]');
    if (!card) return;
    card.classList.add('is-flash');
    window.setTimeout(function () { card.classList.remove('is-flash'); }, 1600);
    wbScrollTo(card, 70);
    card.focus({ preventScroll: true });
  }

  function bindWorkbenchJumps() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-wb-jump]'), function (button) {
      if (button.getAttribute('data-wb-bound')) return;
      button.setAttribute('data-wb-bound', '1');
      button.addEventListener('click', function () {
        const target = button.getAttribute('data-wb-jump');
        if (target === 'workbench') { returnToWorkbench(); return; }
        const node = document.getElementById(target) || el.workbench;
        wbScrollTo(node, 70);
      });
    });
  }

  /* 结束窗口：先把「引擎一定会拒绝」和「只是提醒」分开，再按玩家自己的决定推进。 */
  function requestEndRound() {
    if (ui.busy || !ui.game || ui.game.phase !== 'briefing') return;
    /* 七日经典模式维持原样：没有工作台，也不额外弹确认。 */
    if (!isCampaignGame()) { endRound(); return; }
    const WB = wbApi();
    const view = WB ? WB.classify(ui.game, L) : null;
    if (view && view.blockers.length) {
      if (A) A.playSfx('invalid');
      toast(view.blockers[0].text, true);
      returnToWorkbench();
      return;
    }
    if (view && view.counts.needs) {
      const rows = view.needs.slice(0, 6).map(function (item) {
        return '<li><strong>' + escapeHtml(item.tag) + ' · ' + escapeHtml(item.title) + '</strong>' + (item.urgent ? '<span>过了本窗口就来不及</span>' : '') + '</li>';
      }).join('');
      openConfirm({
        kicker: '结束窗口 / END WINDOW',
        title: '还有 ' + view.counts.needs + ' 项没有处理',
        message: '<p>结束之后时间会往前走：命令照常执行或延误，没人处理的来信按默认方式结算，机构继续消耗。这些是还没处理的：</p><ul class="confirm-list">' + rows + '</ul><p>你可以现在结束，也可以回去处理。游戏不会替你判断哪一项更重要。</p>',
        confirmLabel: '仍然结束本窗口',
        onConfirm: function () { endRound(); }
      });
      return;
    }
    endRound();
  }

  function listHtml(items) {    if (!items || !items.length) return '<ul class="epistemic-list"><li>暂无可靠条目。</li></ul>';
    return '<ul class="epistemic-list">' + items.map(function (item) { return '<li>' + escapeHtml(item) + '</li>'; }).join('') + '</ul>';
  }

  function choiceHint() {
    const g = ui.game;
    if (g.phase !== 'briefing') return '本回合正在结算';
    if (g.ap <= 0) return '注意力已用完 · 可以结束本窗口了';
    if (!L.getAvailableChoices(g).length) return '剩下的注意力不够签发任何文件';
    return '点开一份文件看代价与延迟后果，再到底栏签发';
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
    const event = eventsOf()[due - 1];
    return (isCampaignGame() ? '第 ' + due + ' 窗口 · ' : '第 ' + due + ' 回合 · ') + (event ? event.dateLabel : (isCampaignGame() ? '战役结束后' : '阶段结束后'));
  }

  function delayDetails(choice) {
    if (!choice.delayed || !choice.delayed.length) return '<p class="choice-delay">无额外延迟效果；夜间压力与侵蚀仍会结算。</p>';
    return choice.delayed.map(function (item) {
      return '<div class="choice-delay"><div><strong>' + escapeHtml(item.label) + '</strong><span>' + escapeHtml(delayDueLabel(item.delay)) + '</span></div><p>' + escapeHtml(item.note || '') + '</p>' + (item.when ? '<p class="delay-when">有条件：到期时视当时局势而定，可能不兑现。</p>' : '') + '<div class="effect-forecast">' + effectForecast(item.effects) + '</div></div>';
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
      const stateText = executed ? '已签发' : conflict ? '互斥锁定' : status.state === 'locked' ? '条件未满足' : status.state === 'ap' ? 'AP 不足' : selected ? '已选择' : '选择';
      const lockNote = locked && !executed ? '<p class="choice-locked-note' + (conflict ? ' is-conflict-note' : '') + '"><strong>' + (conflict ? '命令冲突' : status.state === 'locked' ? '前序条件未满足' : '注意力不足') + '：</strong>' + escapeHtml(status.message) + '</p>' : '';
      const expanded = selected || executed;
      return '<article class="' + classes.join(' ') + '" data-choice-id="' + escapeHtml(choice.id) + '" role="button" tabindex="0" aria-pressed="' + (selected ? 'true' : 'false') + '" aria-disabled="' + (locked ? 'true' : 'false') + '" aria-label="' + escapeHtml(choice.title + '，' + choice.ap + ' AP，' + stateText) + '">' +
        '<span class="choice-num" aria-hidden="true">' + String(index + 1).padStart(2, '0') + '</span>' +
        '<div class="choice-topline"><h3 class="choice-title">' + escapeHtml(choice.title) + '</h3><span class="choice-ap">' + choice.ap + ' AP</span></div>' +
        (choice.keyDecision ? '<p class="choice-key"><strong>重大决策</strong>' + (choice.keyDecision.irreversible ? ' · 签发后不可逆' : '') + '</p>' : '') +
        '<p class="choice-summary">' + escapeHtml(choice.summary) + '</p>' +
        (link ? '<p class="choice-link ' + (link.coordination === 'relax' ? 'is-relax' : 'is-require') + '"><strong>' + (link.coordination === 'relax' ? '前序已落地' : '前序已失效') + '：</strong>' + escapeHtml(link.note || '') + '</p>' : '') +
        '<div class="effect-forecast" aria-label="时间属性与签发前定性影响"><span class="choice-time time-' + escapeHtml(profile.kind) + '">' + escapeHtml(timeKindLabel(profile.kind)) + '</span>' + effectForecast(choice.effects) + '</div>' +
        (lockNote) +
        '<div class="choice-detail"' + (expanded ? '' : ' hidden') + '>' + keyDetailHtml(choice) +
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
    /* 战役窗口里，文件列表上方给一个回到工作台的落脚点；七日模式没有工作台，不加这一行。 */
    const headingRight = isCampaignGame()
      ? '<div class="section-heading-side"><span class="section-hint">' + choiceHint() + '</span><button type="button" class="text-btn section-jump" data-wb-jump="workbench">↑ 回到工作台</button></div>'
      : '<span class="section-hint">' + choiceHint() + '</span>';
    const headingTitle = isCampaignGame() ? '本窗口的待签文件' : '决策文件';
    el.choicesPanel.innerHTML = '<div class="section-heading"><div><span class="section-kicker">DECISION FILES</span><h2 id="choices-title">' + headingTitle + '</h2></div>' + headingRight + '</div><div class="choice-grid">' + cards + '</div>';
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
    const alarmHtml = alarms.length ? '<ul class="alarm-list">' + alarms.map(function (alarm) { return '<li class="is-' + alarm.level + '"><span>' + escapeHtml(alarm.label) + '</span><strong>' + alarm.value + '</strong></li>'; }).join('') + '</ul>' : '<p class="all-clear">目前没有需要特别留意的风险。</p>';
    const notes = L.statKeys.map(function (key) {
      const delta = ui.lastDeltas && ui.lastDeltas[key] ? '；最近实际变化 ' + formatSigned(ui.lastDeltas[key]) : '';
      return '<li><strong>' + escapeHtml(statFullLabel(key)) + '</strong>：' + escapeHtml(L.statMeta[key].hint + delta) + '</li>';
    }).join('');
    el.statsPanel.innerHTML = '<details class="state-details"' + (ui.statesOpen || window.innerWidth > 700 ? ' open' : '') + '><summary><span class="state-heading"><span class="panel-kicker">NATIONAL CONDITION</span><strong id="stats-title">国家状态</strong></span><span class="mobile-vitals">' + vitals + '<span class="state-more">七项</span></span><span class="state-toggle">展开 / 收起</span></summary><div class="state-body">' + rows +
      '<section class="alarm-panel"><h3>需要留意的风险</h3>' + alarmHtml + '</section>' +
      '<details class="state-notes"><summary>状态含义与最近变化</summary><ul>' + notes + '</ul></details>' +
      '<p class="stat-hint">风险提示只反映当前数值；国家是否失守，由另外的底线条件判定。</p></div></details>';
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
    const event = eventsOf()[Number(item.dueRound) - 1];
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
    if (command.status === 'blocked' && command.blockedCode === 'APPROVAL' && command.delegation) {
      parts.push('<button type="button" class="mini-action is-primary" data-approve="' + escapeHtml(command.id) + '">批准办理方案 · 0 AP</button>');
    }
    if (command.status === 'issued') {
      parts.push('<button type="button" class="mini-action is-primary" data-authorize="' + escapeHtml(command.id) + '">授权执行</button>');
    }
    if (!command.delegation && !command.effectsApplied && ['issued', 'blocked', 'executing'].indexOf(command.status) !== -1 && (!command.deadlineRound || g.round + 1 <= command.deadlineRound)) {
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
    if (command.delegation) note += command.delegation.mode === 'approval' ? ' · 机构拟案，待总统批准' : ' · 授权范围内自行办理';
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
    Array.prototype.forEach.call(scope.querySelectorAll('[data-approve]'), function (button) {
      button.addEventListener('click', function () { approveCommand(button.getAttribute('data-approve')); });
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
    renderDelegateButton(g, choice, canIssue);
    el.endRound.disabled = ui.busy || g.phase !== 'briefing' || untouchedTurn || unauthorized.length > 0;
    el.endRound.textContent = g.round >= finalRoundOf(g) ? (isCampaignGame() ? '结算战役' : '结算本阶段') : (isCampaignGame() ? '结束本窗口 · 推进时间' : '结束本回合');
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

  /* 战役：签发时直接委派给机构（0 AP）。两种方式：授权范围内自行办理 / 拟案后报总统批准。 */
  function renderDelegateButton(g, choice, canIssue) {
    const btn = el.issueDelegate;
    if (!btn) return;
    if (!isCampaignGame(g)) { btn.hidden = true; return; }
    btn.hidden = false;
    if (!choice) { btn.disabled = true; btn.title = '先选一项事务；只有日常办理事项可以委派。'; return; }
    const check = L.checkDelegation(g, choice.id, {});
    const ok = !!check.ok && canIssue;
    btn.disabled = !ok;
    btn.title = ok ? '交给' + agencyLabel(check.agency) + '办理，不耗总统注意力。' : (check.error || '这项事务现在不能委派。');
  }

  function issueDelegated(returnForApproval) {
    if (ui.busy || !ui.game || ui.game.phase !== 'briefing') return;
    const event = L.getEvent(ui.game);
    const choice = ui.selectedChoiceId && event ? L.getChoice(event, ui.selectedChoiceId) : null;
    if (!choice) return;
    ui.busy = true;
    const result = L.issueCommand(ui.game, choice.id, { delegate: true, returnForApproval: !!returnForApproval });
    ui.busy = false;
    if (!result.ok) { if (A) A.playSfx('invalid'); toast(result.error || '无法委派这项事务。', true); renderGame(); return; }
    if (A) A.playSfx('issue');
    ui.selectedChoiceId = null;
    saveGame(false);
    closeModal();
    renderGame();
    toast(returnForApproval ? '已交办：机构拟好方案后会报请批准。' : '已交办：机构在授权范围内自行办理。');
  }

  function openIssueDelegateModal() {
    if (!ui.game || ui.game.phase !== 'briefing') return;
    const event = L.getEvent(ui.game);
    const choice = ui.selectedChoiceId && event ? L.getChoice(event, ui.selectedChoiceId) : null;
    if (!choice) return;
    const g = ui.game;
    const check = L.checkDelegation(g, choice.id, {});
    if (!check.ok) { toast(check.error || '这项事务现在不能委派。', true); return; }
    const withApproval = L.checkDelegation(g, choice.id, { returnForApproval: true });
    const agencyName = agencyLabel(check.agency);
    const load = L.getAgencyLoad ? L.getAgencyLoad(g, check.agency) : null;
    const full = load && load.coordination >= ((window.LZS_STRATEGY && window.LZS_STRATEGY.delegation && window.LZS_STRATEGY.delegation.fullQualityAt) || 60);
    const qualityNote = load ? (full ? agencyName + '协调余量 ' + load.coordination + '，能把事办足。' : agencyName + '协调余量 ' + load.coordination + '，自行办理的成效会打折。') : '';
    openModal({
      kicker: '委派 / 不耗注意力', title: '把“' + choice.title + '”交给' + agencyName,
      body: '<p class="modal-lead">日常事务可以交给机构办理，总统不再为它占用注意力。代价是机构协调余量少一点（交代事情要占用他们的人手）。重大决策、跨部门事务和情报未确认的事务不能委派。' + (qualityNote ? ' ' + escapeHtml(qualityNote) : '') + '</p>' +
        '<div class="agency-picker">' +
          '<button type="button" class="agency-choice" data-issue-delegate="auto"><strong>授权范围内自行办理</strong><span>机构今夜按既有授权办完，结果在夜间日报里告知。</span></button>' +
          '<button type="button" class="agency-choice" data-issue-delegate="approval"' + (withApproval.ok ? '' : ' disabled') + '><strong>拟好方案，报请批准</strong><span>' + escapeHtml(withApproval.ok ? '机构先拟方案，下一份简报由总统批准，成效不打折；批准不耗注意力。' : withApproval.error) + '</span></button>' +
        '</div>',
      actions: [{ label: '取消', className: 'btn btn-ghost', onClick: function () {} }],
      onMount: function (card) {
        Array.prototype.forEach.call(card.querySelectorAll('[data-issue-delegate]'), function (button) {
          button.addEventListener('click', function () { issueDelegated(button.getAttribute('data-issue-delegate') === 'approval'); });
        });
      }
    });
  }

  function approveCommand(commandId) {
    if (!ui.game || ui.busy) return;
    const result = L.approveDelegated(ui.game, commandId);
    if (!result.ok) { if (A) A.playSfx('invalid'); toast(result.error || '现在不能批准。', true); return; }
    if (A) A.playSfx('issue');
    saveGame(false);
    renderGame();
    toast(result.blocked ? '已批准，但机构今夜接不下，仍在排队。' : '已批准：今夜执行，不另耗注意力。');
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
    if (data.wrapOffer) { openWrapOffer(); return; }
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
    const alarmHtml = alarms.length ? '<ul class="alarm-list">' + alarms.map(function (alarm) { return '<li class="is-' + alarm.level + '"><span>' + escapeHtml(alarm.label) + '</span><strong>' + alarm.value + '</strong></li>'; }).join('') + '</ul>' : '<p class="all-clear">本夜没有出现新的风险。</p>';
    openModal({
      kicker: data.campaign ? '战役推进 / CAMPAIGN CLOCK' : '夜间态势 / NIGHT SETTLEMENT', title: data.campaign ? '时间推进 · ' + (data.campaign.fromLabel || '') + ' → ' + (data.campaign.toLabel || '') : '第 ' + (data.round - 1) + ' 夜', dismissible: false, wide: true, className: 'interlude-modal',
      body: '<div class="interlude-sheet" data-interlude-round="' + data.round + '"><div class="interlude-date"><strong>' + escapeHtml(data.dateLabel || '') + '</strong><span>夜间结算不会重复执行</span></div>' +
        '<ol class="settlement-sequence">' + campaignInterludeHtml(data) +
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
        if (A) { A.setTheme(dayTheme()); A.playSfx(L.getDispatches(ui.game).length ? 'phone' : 'dayturn'); }
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
        { label: '重新开始', className: 'btn btn-ghost', onClick: function () { openConfirm({ kicker: '覆盖确认', title: '放弃本局，重新开始？', message: '<p>当前进度会被清除。这个动作不能撤销。</p>', confirmLabel: '清除并重新开始', onConfirm: function () { startNewGame(true, scenarioOf()); } }); } }
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
      const event = eventsOf().find(function (item) { return item.id === record.eventId; });
      const choice = event ? L.getChoice(event, record.choiceId) : null;
      const delayed = choice && choice.delayed && choice.delayed.length ? '<div class="review-delay"><strong>完整延迟参数</strong>' + choice.delayed.map(function (item) { return '<div><span>' + escapeHtml(item.label) + ' · 第 ' + (record.round + item.delay) + ' 回合</span><div class="effect-row">' + effectChips(item.effects) + '</div></div>'; }).join('') + '</div>' : '';
      return '<li><h4>R' + record.round + ' · ' + escapeHtml(record.label) + '</h4><p>' + record.ap + ' AP · 实际即时：' + escapeHtml(L.formatDeltaText(record.deltas, record.pressureDelta)) + '</p><div class="effect-row"><span class="parameter-label">原始即时参数</span>' + effectChips(choice ? choice.effects : {}) + '</div>' + delayed + '</li>';
    }).join('') + '</ol></section>';
  }

  function openHistoryReview() {
    if (A) A.playSfx('archive');
    if (!ui.game) return;
    const historyHtml = isCampaignGame() ? campaignHistoryHtml() : window.LZS_REVIEW ? window.LZS_REVIEW.render(ui.game) : '<section class="history-review"><h2>历史复盘</h2><p>复盘资料未能载入。</p></section>';
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

  /* ---------- v1.2：《后来，战争走到了这里》 ----------
     战役结束后的独立历史档案。内容与玩家本局的决定无关，也不属于 2022 年 2—4 月当时可知的信息。 */
  function afterwardApi() { return window.LZS_AFTERWARD || null; }

  function afterwardRecordHtml(record) {
    const A = afterwardApi();
    const statusLabel = (A && A.status && A.status[record.status]) || record.status;
    const sources = (record.sources || []).map(function (s) {
      return '<li><a href="' + escapeHtml(s.url) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(s.name) + '</a>' + (s.date ? ' <span class="src-date">' + escapeHtml(s.date) + '</span>' : '') + '</li>';
    }).join('');
    return '<article class="afterward-card" id="' + escapeHtml(record.id) + '">' +
      '<header><span class="afterward-era">' + escapeHtml(record.era || '') + '</span><span class="afterward-date">' + escapeHtml(record.dateLabel) + '</span>' +
      '<span class="history-kind">' + escapeHtml(statusLabel) + '</span></header>' +
      '<h3>' + escapeHtml(record.title) + '</h3><p class="afterward-lead">' + escapeHtml(record.lead || '') + '</p>' +
      '<dl class="afterward-body">' +
        '<div><dt>当时发生了什么</dt><dd>' + escapeHtml(record.happened) + '</dd></div>' +
        '<div><dt>后来可以确认的</dt><dd>' + escapeHtml(record.confirmed) + '</dd></div>' +
        '<div><dt>仍有争议或无法确认</dt><dd>' + escapeHtml(record.disputed) + '</dd></div>' +
        '<div><dt>为什么值得重新理解战争</dt><dd>' + escapeHtml(record.why) + '</dd></div>' +
      '</dl>' +
      '<div class="afterward-sources"><strong>来源</strong><ol>' + sources + '</ol></div>' +
    '</article>';
  }

  function openAfterward() {
    const AW = afterwardApi();
    if (!AW) { toast('历史档案没有载入。', true); return; }
    const st = AW.unlockState ? AW.unlockState() : { unlocked: true };
    if (!st.unlocked) { toast(st.reason || '先完整打完一次战役。', true); return; }
    if (A) A.playSfx('archive');
    const records = AW.list();
    openModal({
      kicker: '独立档案 / AFTER THE CAMPAIGN',
      title: AW.title || '后来，战争走到了这里',
      wide: true,
      className: 'afterward-modal',
      body: '<p class="afterward-warn">' + escapeHtml(AW.disclaimer) + '</p>' +
        '<p class="modal-note">共 ' + records.length + ' 条。每条都分开写「当时发生」「后来确认」「仍有争议」，并且标注来源与报道日期。这些是战役结束后的历史，不是 2022 年 2—4 月总统能知道的东西。</p>' +
        '<ol class="afterward-timeline">' + records.map(function (record) {
          return '<li><span class="afterward-node">' + escapeHtml(record.dateLabel) + '</span>' + afterwardRecordHtml(record) + '</li>';
        }).join('') + '</ol>',
      actions: [{ label: '合上档案', className: 'btn btn-primary', onClick: function () {} }]
    });
  }

  function afterwardTeaserHtml() {
    const A = afterwardApi();
    if (!A) return '';
    let unlocked = false;
    try { unlocked = !!(A.unlockState && A.unlockState().unlocked); } catch (error) { unlocked = false; }
    if (!unlocked) return '';
    return '<section class="ending-review-invite afterward-invite"><span class="section-kicker">A LATER WAR</span><h2>后来，战争走到了这里。</h2>' +
      '<p>这是战役结束后的历史：2023 年的莫斯科与别尔哥罗德、瓦格纳的三十六小时、2024 年的库尔斯克。它们不属于 2022 年 2—4 月你能知道的信息，也不是你在本局做出的决定造成的。</p>' +
      '<button type="button" class="btn btn-primary" id="btn-afterward">打开历史档案</button></section>';
  }

  function recordsHtml() {
    const runs = L.getRecords ? L.getRecords().runs.slice(-5).reverse() : [];
    if (!runs.length) return '';
    return '<section class="ending-section run-records"><h2>本机记录</h2><p class="stat-hint">只保存在这台设备上：结局、主要倾向和路线。没有积分或排行。</p><ol>' + runs.map(function (run) {
      return '<li><strong>' + escapeHtml(run.endingTitle || run.endingId) + '</strong><span>' + escapeHtml((run.scenario === 'campaign' ? '基辅战役 · ' : '七日开局 · ') + (run.styleLabel || '')) + ' · 第 ' + run.round + (run.scenario === 'campaign' ? ' 窗口' : ' 回合') + '</span></li>';
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
    if (A) A.playSfx(ending.tone === 'danger' ? 'collapse' : (ending.id === 'held' || ending.id === 'c_A' || ending.id === 'c_D') ? 'ending' : 'ending_costly');
    const stats = ending.finalStats || ui.game.stats || {};
    const campaignEnd = ending.scenario === 'campaign' || isCampaignGame();
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
    el.ending.innerHTML = '<header class="ending-masthead"><span>总统办公室 / ' + (campaignEnd ? '战役档案' : '阶段档案') + '</span><span>' + (campaignEnd ? '2022.02.24 — ' + (ending.aftermath ? ending.aftermath.endLabel : '04.02') : '2022.02.24 — 03.02') + '</span></header>' +
      '<div class="ending-hero tone-' + escapeHtml(ending.tone || 'danger') + '"><span class="ending-stamp">' + escapeHtml(campaignEnd ? '结局 ' + (ending.code || '') : toneLabel) + '</span><p class="ending-kicker">' + escapeHtml(ending.kicker) + '</p><h1 class="ending-title">' + escapeHtml(ending.title) + '</h1><p class="ending-verdict">' + escapeHtml(ending.verdict) + '</p><div class="ending-meta">' + (campaignEnd ? (ending.aftermath ? '<span>基辅战役 38 天，加收束 ' + ending.aftermath.days + ' 天 · ' : '<span>第 ' + (ending.day || '?') + ' / 38 天 · ') + (ending.finalRound || ui.game.round) + ' 个决策窗口</span>' : '<span>第 ' + (ending.finalRound || ui.game.round) + ' / ' + L.finalRound + ' 回合</span>') + '<span>最终压力 ' + (ending.finalPressure != null ? ending.finalPressure : ui.game.pressure) + '</span><span>签发 ' + choices.length + ' 项</span><span>触发 ' + chain.length + ' 项延迟</span></div></div>' +
      '<div class="ending-layout"><div class="ending-column"><section class="ending-section"><span class="section-kicker">AFTER ACTION</span><h2>阶段记录</h2><div class="ending-copy">' + (ending.epilogue || []).map(function (p) { return '<p>' + escapeHtml(p) + '</p>'; }).join('') + '</div></section>' +
      (campaignEnd ? campaignEndingMainHtml(ending) : '') + aftermathHtml(ending) + governanceHtml(ending) + turningPointsHtml(ending) + (campaignEnd ? explorationHtml() : '') +
      '<section class="ending-section"><h2>命令如何走向后果</h2><p class="stat-hint">这里优先展示失效、阻塞、撤回与等待核验的命令：总统注意力、机构容量和窗口如何改变结果。</p>' + commandChainHtml + '</section>' +
      '<section class="ending-section"><h2>完整决策链</h2>' + timeline + '</section><section class="ending-section"><h2>延迟后果链</h2>' + chainHtml + '</section></div>' +
      '<aside class="ending-column"><section class="ending-section"><h2>七项最终状态</h2><div class="ending-stats">' + endingStatsHtml(stats) + '</div><div class="ending-pressure"><span>战争压力</span><strong>' + (ending.finalPressure != null ? ending.finalPressure : ui.game.pressure) + ' / 100</strong></div></section>' +
      (campaignEnd ? campaignEndingSideHtml(ending) : '') + trendHtml(ending) + '<section class="ending-section"><h2>判定依据</h2><ul class="ending-reasons">' + (ending.reasons || []).map(function (r) { return '<li>' + escapeHtml(r) + '</li>'; }).join('') + '</ul><p class="stat-hint">结局同时参考多项状态、战争压力与决策链，不是单一分数。</p></section>' + recordsHtml() + '</aside></div>' +
      (campaignEnd ? afterwardTeaserHtml() : '') +
      '<section class="ending-review-invite"><span class="section-kicker">SEALED UNTIL THE END</span><h2>现在，打开事后才能看见的资料。</h2><p>完整模拟参数、逐日事实、当时认知、后来确认、争议与资料来源已独立归档，不再接在结局正文之后。</p><button type="button" class="btn btn-primary" id="btn-history">进入历史复盘</button></section>' +
      '<div class="ending-disclaimer"><strong>模拟说明：</strong>' + escapeHtml(ending.disclaimer || L.meta.disclaimer || '') + '<br>本结局只描述本局模拟参数下的国家状态，不评价真实历史人物。<br>版本 ' + escapeHtml(L.meta.version || '') + ' · 所有数值均为模拟设计参数。</div>' +
      '<div class="ending-actions"><button type="button" class="btn btn-primary" id="btn-replay">再玩一局</button><button type="button" class="btn btn-ghost" id="btn-replay-room-end">决策推演室</button><button type="button" class="btn btn-ghost" id="btn-back-cover">回到封面</button><button type="button" class="btn btn-ghost" id="btn-poster">生成纪念海报</button><button type="button" class="btn btn-ghost" id="btn-print">打印 / 保存本页</button></div>';
    document.getElementById('btn-history').addEventListener('click', openHistoryReview);
    const afterBtn = document.getElementById('btn-afterward');
    if (afterBtn) afterBtn.addEventListener('click', openAfterward);
    const roomEnd = document.getElementById('btn-replay-room-end');
    if (roomEnd) roomEnd.addEventListener('click', openReplayRoom);
    document.getElementById('btn-replay').addEventListener('click', function () { startNewGame(true, scenarioOf()); });
    const newSeedBtn = document.getElementById('btn-new-seed');
    if (newSeedBtn) newSeedBtn.addEventListener('click', startNewSeedCampaign);
    const sameSeedBtn = document.getElementById('btn-same-seed');
    if (sameSeedBtn) sameSeedBtn.addEventListener('click', replayLastSeed);
    const roomArchive = document.getElementById('btn-replay-room-archive');
    if (roomArchive) roomArchive.addEventListener('click', openReplayRoom);
    document.getElementById('btn-back-cover').addEventListener('click', renderIntro);
    document.getElementById('btn-print').addEventListener('click', function () { window.print(); });
    document.getElementById('btn-poster').addEventListener('click', function () { openPosterModal(ending); });
  }

  /* 纪念海报：canvas 本地绘制，不上传 */
  function openPosterModal(ending) {
    const P = window.LZS_POSTER;
    if (!P) { openModal({ kicker: '纪念海报', title: '海报暂时不可用', body: '<p>海报模块没有载入，请刷新页面后再试。</p>', actions: [{ label: '知道了', className: 'btn btn-primary' }] }); return; }
    let canvas = null;
    const note = function (text) { const n = document.getElementById('poster-note'); if (n) n.textContent = text; };
    const download = function () {
      if (!canvas) return;
      P.toBlob(canvas, function (blob) {
        if (!blob) { note('这个浏览器不能直接导出图片，请长按预览图保存。'); return; }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = '小泽模拟器-基辅战役纪念-' + (ending.code || 'X') + '.png';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        window.setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
        note('已保存为图片。');
      });
    };
    const share = function () {
      if (!canvas) return;
      P.toBlob(canvas, function (blob) {
        if (!blob) { download(); return; }
        const file = typeof File === 'function' ? new File([blob], 'zelensky-simulator-poster.png', { type: 'image/png' }) : null;
        const data = { title: '小泽模拟器 · 基辅战役纪念', text: '我在《小泽模拟器》里走完了基辅战役：' + (ending.title || '') + '。', url: P.LIVE_URL };
        if (file && navigator.canShare && navigator.canShare({ files: [file] })) data.files = [file];
        if (navigator.share) {
          navigator.share(data).then(function () { note('已打开系统分享。'); }).catch(function (err) { if (!err || err.name !== 'AbortError') note('分享没有成功，可以改用保存图片或复制链接。'); });
        } else {
          download();
          note('这个浏览器没有系统分享，已改为保存图片；也可以复制链接。');
        }
      });
    };
    const copyLink = function () {
      const done = function () { note('链接已复制：' + P.LIVE_URL); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(P.LIVE_URL).then(done).catch(function () { note('复制失败，请手动复制：' + P.LIVE_URL); });
      } else {
        const t = document.createElement('textarea');
        t.value = P.LIVE_URL; document.body.appendChild(t); t.select();
        try { document.execCommand('copy'); done(); } catch (e) { note('复制失败，请手动复制：' + P.LIVE_URL); }
        document.body.removeChild(t);
      }
    };
    openModal({
      kicker: '纪念海报', title: '基辅战役 · 本局纪念', wide: true, className: 'poster-modal',
      body: '<div class="poster-preview"><canvas id="poster-canvas" width="1080" height="1350" aria-label="本局纪念海报预览"></canvas></div><p class="stat-hint">海报只用本局结局里的内容在本机绘制，不会上传；右下角二维码指向游戏网址。图片是原创模拟推演，不是历史照片，也不含分数。</p><p class="stat-hint" id="poster-note" role="status"></p>',
      actions: [
        { label: '保存图片', className: 'btn btn-primary', close: false, onClick: download },
        { label: '分享', className: 'btn btn-ghost', close: false, onClick: share },
        { label: '复制链接', className: 'btn btn-ghost', close: false, onClick: copyLink },
        { label: '关闭', className: 'btn btn-ghost' }
      ],
      onMount: function (card) {
        canvas = card.querySelector('#poster-canvas');
        try { P.make(canvas, ending, ui.game); } catch (err) { note('海报绘制失败：' + (err && err.message ? err.message : '未知原因')); }
      }
    });
  }

  /* ---------------------------------------------------------------- 决策推演室
     视觉是总统办公室里的历史决策档案柜：抽屉、标签、日期，不是关卡大厅。
     所有推演内容都带「决策推演」标识与「模型推演，不代表真实历史」。 */

  function replayApi() { return window.LZS_REPLAY || null; }

  function replayRoomHtml() {
    const R = replayApi();
    if (!R) return '<p class="empty-note">推演档案暂时不可用，请刷新页面。</p>';
    const sum = R.summary();
    if (!sum.unlocked) {
      return '<div class="replay-locked"><p class="replay-locked-title">档案柜还没有解锁。</p><p>先在「2022 · 基辅防御战役」里完整走完一次战役，抽屉才会打开。推演不是另一条由你选择的架空历史，而是回到真实决策点，重新看当时的条件。</p>' +
        '<p class="stat-hint">已完成的战役：' + sum.completedCampaigns + ' 次。</p>' +
        '<div class="replay-locked-list"><span>' + R.modules.map(function (m) { return escapeHtml(m.dateLabel.split(' — ')[0] + ' · ' + m.title.split('：')[0]); }).join('</span><span>') + '</span></div></div>';
    }
    return '<div class="replay-room">' +
      '<p class="replay-lead">这里保存的是这场战役里真实存在过的决策点。每个抽屉只模拟与该决策直接相关的后续，并且区分历史事实、资料支持的决策、模拟推演与机制假设。</p>' +
      '<p class="replay-warn">所有推演内容都标注「决策推演」。结论是模型推演，不代表真实历史。</p>' +
      '<div class="replay-cabinet">' + sum.modules.map(function (m) {
        const used = m.attempts ? '已推演 ' + m.attempts + ' 次' : '尚未推演';
        return '<article class="replay-drawer" data-replay-drawer="' + escapeHtml(m.id) + '">' +
          '<header><span class="replay-date">' + escapeHtml(m.dateLabel) + '</span><span class="replay-badge">决策推演</span></header>' +
          '<h3>' + escapeHtml(m.title) + '</h3><p>' + escapeHtml(m.subtitle) + '</p>' +
          '<dl class="replay-meta"><dt>模拟范围</dt><dd>' + escapeHtml(m.durationLabel) + '</dd><dt>长度</dt><dd>' + escapeHtml(m.lengthLabel) + '</dd><dt>记录</dt><dd>' + escapeHtml(used) + '</dd></dl>' +
          '<button type="button" class="btn btn-ghost replay-open" data-replay-open="' + escapeHtml(m.id) + '">打开抽屉</button></article>';
      }).join('') + '</div>' +
      '<p class="stat-hint">推演记录与真实战役记录分开保存，不会覆盖你的战役存档与结局记录。</p></div>';
  }

  function bindReplayRoom(card) {
    Array.prototype.forEach.call(card.querySelectorAll('[data-replay-open]'), function (button) {
      button.addEventListener('click', function () { openReplayModule(button.getAttribute('data-replay-open')); });
    });
  }

  function openReplayRoom() {
    const R = replayApi();
    if (!R) { toast('推演档案暂时不可用。', true); return; }
    openModal({
      kicker: '总统办公室 / 历史决策档案柜',
      title: '决策推演室',
      wide: true,
      className: 'replay-modal',
      body: replayRoomHtml(),
      actions: [{ label: '合上档案柜', className: 'btn btn-ghost' }],
      onMount: bindReplayRoom
    });
  }

  function replayStartHtml(module, infoMode) {
    const R = replayApi();
    return '<div class="replay-start">' +
      '<p class="replay-warn">决策推演 · 模型推演，不代表真实历史</p>' +
      '<dl class="replay-meta replay-meta-wide">' +
      '<dt>时间</dt><dd>' + escapeHtml(module.dateLabel) + '</dd>' +
      '<dt>模拟范围</dt><dd>' + escapeHtml(module.durationLabel) + '（' + escapeHtml(R.lengthLabel(module)) + '）</dd></dl>' +
      '<h3>真实历史背景</h3><p>' + escapeHtml(module.background) + '</p>' +
      '<h3>当时决策者能得到的信息</h3>' + listHtml(module.knownThen) +
      '<h3>当时实际存在的选择</h3><ul class="replay-option-list">' + module.optionsThen.map(function (option) {
        return '<li><strong>' + escapeHtml(option.label) + '</strong><span class="history-kind kind-' + escapeHtml(option.kind) + '">' + escapeHtml(R.kinds[option.kind] || R.kinds.simulated) + '</span><p>' + escapeHtml(option.note) + '</p></li>';
      }).join('') + '</ul>' +
      '<h3>信息限制说明</h3><p>' + escapeHtml(module.infoLimitNote) + '</p>' +
      '<fieldset class="replay-mode"><legend>选择推演视角</legend>' +
      '<label><input type="radio" name="replay-mode" value="then"' + (infoMode === 'then' ? ' checked' : '') + '><span><strong>当时视角</strong>：只显示当时合理可得的信息，隐藏后来才确认的内容。这是信息限制，不代表你真的不知道。</span></label>' +
      '<label><input type="radio" name="replay-mode" value="all"' + (infoMode === 'all' ? ' checked' : '') + '><span><strong>完整视角</strong>：同时显示事后确认的信息，方便对照。</span></label></fieldset>' +
      '<p class="stat-hint">推演只模拟与这个决策直接相关的后续，不会重放整场战役；任何一条结论都不是已经发生过的事。</p></div>';
  }

  function openReplayModule(moduleId) {
    const R = replayApi();
    const module = R && R.moduleOf(moduleId);
    if (!module) { toast('没有找到这份档案。', true); return; }
    ui.replaySession = null;
    openModal({
      kicker: '决策推演 · 档案封面',
      title: module.title,
      wide: true,
      className: 'replay-modal',
      body: replayStartHtml(module, 'then'),
      actions: [
        { label: '开始推演', className: 'btn btn-primary', close: false, onClick: function () { startReplaySession(moduleId); } },
        { label: '放回档案柜', className: 'btn btn-ghost', close: true, onClick: openReplayRoom }
      ],
      onMount: function (card) {
        Array.prototype.forEach.call(card.querySelectorAll('input[name="replay-mode"]'), function (input) {
          input.addEventListener('change', function () { ui.replayInfoMode = input.value; });
        });
        ui.replayInfoMode = (card.querySelector('input[name="replay-mode"]:checked') || {}).value || 'then';
      }
    });
  }

  function startReplaySession(moduleId) {
    const R = replayApi();
    if (!R) return;
    const session = R.createSession(moduleId, { infoMode: ui.replayInfoMode || 'then' });
    if (!session) { toast('这份档案没有可用的推演内容。', true); return; }
    ui.replaySession = session;
    renderReplayStep();
  }

  function replayStepHtml(session) {
    const R = replayApi();
    const module = R.moduleOf(session.moduleId);
    const step = session.visibleStep;
    if (!step) return '<p class="empty-note">推演内容缺失。</p>';
    const progress = session.path.length + 1;
    return '<div class="replay-step"><p class="replay-warn">决策推演 · ' + escapeHtml(session.infoModeLabel || (session.infoMode === 'then' ? '当时视角' : '完整视角')) + '</p>' +
      '<header class="replay-step-head"><span>' + escapeHtml(step.date) + ' · 第 ' + progress + ' / ' + session.stepCount + ' 个决策点</span><h3>' + escapeHtml(step.title) + '</h3></header>' +
      '<p>' + escapeHtml(step.situation) + '</p>' +
      '<h4>你现在能得到的</h4>' + listHtml(step.intel.map(function (item) { return item.text; })) +
      (step.hiddenCount ? '<p class="stat-hint">按当时视角，另有 ' + step.hiddenCount + ' 条事后才确认的信息不显示。</p>' : '') +
      '<h4>可选行动</h4><div class="replay-actions">' + step.choices.map(function (choice) {
        return '<button type="button" class="replay-choice" data-replay-choice="' + escapeHtml(choice.id) + '"><strong>' + escapeHtml(choice.label) + '</strong><span class="history-kind kind-' + escapeHtml(choice.kind) + '">' + escapeHtml(choice.kindLabel) + '</span>' + (choice.note ? '<small>' + escapeHtml(choice.note) + '</small>' : '') + '</button>';
      }).join('') + '</div>' +
      '<p class="stat-hint">这些选项里，有的与公开资料一致，有的只是为了让条件可比较而设的对照。开始后不能退回上一个决策点。</p></div>';
  }

  function renderReplayStep() {
    const R = replayApi();
    const session = ui.replaySession;
    if (!R || !session) { openReplayRoom(); return; }
    const module = R.moduleOf(session.moduleId);
    openModal({
      kicker: '决策推演 · 进行中',
      title: module.title,
      wide: true,
      className: 'replay-modal',
      body: replayStepHtml(session),
      actions: [{ label: '中止推演', className: 'btn btn-ghost', close: true, onClick: openReplayRoom }],
      onMount: function (card) {
        Array.prototype.forEach.call(card.querySelectorAll('[data-replay-choice]'), function (button) {
          button.addEventListener('click', function () { chooseReplay(button.getAttribute('data-replay-choice')); });
        });
      }
    });
  }

  function chooseReplay(choiceId) {
    const R = replayApi();
    const session = ui.replaySession;
    if (!R || !session) { openReplayRoom(); return; }
    const result = R.choose(session, choiceId);
    if (!result.ok) { toast(result.reason || '这一步无法继续。', true); return; }
    if (A) A.playSfx('file');
    if (result.finished) {
      R.recordRun(session);
      renderReplayResult(session);
      return;
    }
    renderReplayStep();
  }

  function renderReplayResult(session) {
    const R = replayApi();
    const module = R.moduleOf(session.moduleId);
    const result = session.result;
    const diverge = result.divergences.length ? result.divergences.map(function (item) {
      return '<li><span>' + escapeHtml(item.step) + '</span><strong>你的选择：' + escapeHtml(item.player) + '</strong><p>历史基准线：' + escapeHtml(item.baseline) + ' · ' + (item.same ? '与历史进程方向一致' : '与历史进程不同') + '</p></li>';
    }).join('') : '<li><span>—</span><strong>这一步没有可对照的历史基准线</strong></li>';
    const lines = result.lines.map(function (line) {
      return '<tr><td>' + escapeHtml(line.date) + '<br><small>' + escapeHtml(line.choice) + '</small></td><td>' + escapeHtml(line.gain) + '</td><td>' + escapeHtml(line.risk) + '</td><td>' + escapeHtml(line.need) + '</td><td>' + escapeHtml(line.enemy) + '</td><td>' + escapeHtml(line.later) + '</td><td>' + escapeHtml(line.uncertainty) + '</td></tr>';
    }).join('');
    openModal({
      kicker: '决策推演 · 结束',
      title: module.title + ' · 推演记录',
      wide: true,
      className: 'replay-modal',
      body: '<div class="replay-result"><p class="replay-warn">' + escapeHtml(result.disclaimer) + ' · ' + escapeHtml(result.infoModeLabel) + '</p>' +
        '<h3>你的推演路径</h3><ol class="replay-path">' + result.path.map(function (label) { return '<li>' + escapeHtml(label) + '</li>'; }).join('') + '</ol>' +
        '<h3>与历史基准线的差异</h3><ul class="replay-diff">' + diverge + '</ul><p class="stat-hint">' + escapeHtml(result.baselineNote) + '</p>' +
        '<h3>反事实分析</h3><div class="replay-table-wrap"><table class="replay-table"><thead><tr><th>决策点</th><th>可能收益</th><th>潜在风险</th><th>资源要求</th><th>敌方应对</th><th>对后续决策的影响</th><th>模型不确定性</th></tr></thead><tbody>' + lines + '</tbody></table></div>' +
        '<p class="stat-hint">以上每一格都是模型推演，不是确定事件，也不代表真实历史中的选择。</p>' +
        '<h3>哪些无法用现有资料确认</h3>' + listHtml(result.uncertainty) +
        '<h3>这个决策点最终留下了什么</h3><p>' + escapeHtml(result.ending.text) + '</p>' +
        '<p class="stat-hint">推演记录已单独保存，不会改写你的战役存档与结局记录。</p></div>',
      actions: [
        { label: '再推演一次', className: 'btn btn-primary', close: false, onClick: function () { openReplayModule(module.id); } },
        { label: '回到档案柜', className: 'btn btn-ghost', close: true, onClick: openReplayRoom }
      ]
    });
  }

  /* 战役探索记录：完成次数、关键路线、已触发的条件事件、分支探索情况、已完成的推演、尚未经历的路线。
     数据来自独立的多周目档案（lzs_archive_v1），没有经验值、等级或胜利积分。 */
  function archiveApi() { return window.LZS_ARCHIVE || null; }

  function explorationHtml() {
    const R = replayApi();
    const A = archiveApi();
    const records = L.getRecords ? (L.getRecords().runs || []).filter(function (r) { return r.scenario === 'campaign'; }) : [];
    if (!records.length) return '';
    const game = ui.game;
    const dyn = (game && game.campaign && game.campaign.dyn) ? game.campaign.dyn : { fired: {}, log: [] };
    const firedIds = Object.keys(dyn.fired || {});
    const dynApi = window.LZS_DYNAMIC || null;
    const summary = (dynApi && dynApi.summary) ? dynApi.summary(game) : null;
    const hints = (dynApi && dynApi.branchHints) ? dynApi.branchHints(game) : [];
    const replaySum = R ? R.summary() : null;
    const archive = (A && A.summary) ? A.summary() : null;
    const completed = archive ? archive.completed : records.length;
    const routeLines = (archive && archive.runs.length ? archive.runs : records.slice(-6).reverse()).map(function (run) {
      const decisions = (run.route || []).length;
      const events = (run.events || []).length;
      return '<li><strong>' + escapeHtml(run.endingTitle || run.endingId) + '</strong><span>' +
        (run.styleLabel ? escapeHtml(run.styleLabel) + ' · ' : '') +
        (run.days ? escapeHtml(String(run.days)) + ' 天 · ' : (run.round ? '窗口 ' + run.round + ' · ' : '')) +
        (decisions ? decisions + ' 项决定' : '') +
        (events ? ' · ' + events + ' 条条件事件' : '') + '</span></li>';
    }).join('');
    const hintLines = hints.map(function (hint) {
      const stateText = hint.state === 'explored' ? '已走过' : hint.state === 'partial' ? '走过一部分' : '尚未探索';
      return '<li class="branch-hint is-' + escapeHtml(hint.state) + '"><span>' + escapeHtml(hint.label) + '</span><strong>' + escapeHtml(stateText) + '</strong><small>' + hint.seen + ' / ' + hint.total + ' 条相关事件</small></li>';
    }).join('');
    const replayLines = replaySum ? replaySum.modules.map(function (m) {
      return '<li class="' + (m.attempts ? 'is-done' : 'is-todo') + '"><span>' + escapeHtml(m.title.split('：')[0]) + '</span><strong>' + (m.attempts ? '已完成 ' + m.attempts + ' 次' : (replaySum.unlocked ? '可以开始' : '通关后解锁')) + '</strong></li>';
    }).join('') : '';
    const unexploredLines = (archive && archive.unexplored && archive.unexplored.length) ? archive.unexplored.map(function (item) {
      return '<li class="branch-hint is-unexplored"><span>' + escapeHtml(item.label) + '</span><strong>尚未探索</strong><small>不提前说明内容</small></li>';
    }).join('') : '';
    const seenEvents = (archive && archive.eventsSeen && archive.eventsSeen.length ? archive.eventsSeen : firedIds).map(function (id) {
      const template = (dynApi && dynApi.byId) ? dynApi.byId(id) : null;
      return template ? template.title : id;
    });
    /* v1.2：故事线探索。只说「经历过 / 没经历过」和走到第几步，不剧透没经历过的内容。 */
    const STORY_STATE = { unexplored: '尚未经历', partial: '经历过一部分', explored: '走过完整' };
    const lineLines = (archive && archive.lines && archive.lines.length) ? archive.lines.map(function (line) {
      return '<li class="branch-hint is-' + (line.state === 'unexplored' ? 'unexplored' : (line.state === 'explored' ? 'explored' : 'partial')) + '">' +
        '<span>' + escapeHtml(line.title) + '</span><strong>' + escapeHtml(STORY_STATE[line.state] || line.state) + '</strong>' +
        '<small>' + (line.times ? '出现过 ' + line.times + ' 次 · 最长走到第 ' + line.seenMax + '/' + line.steps + ' 步' : escapeHtml(line.hint || '') + ' · 还没在本机出现过') + '</small></li>';
    }).join('') : '';
    /* v1.2：相邻两局到底哪里不一样——只陈述差异，不评价好坏。 */
    const compareLines = (archive && archive.compare && archive.compare.length) ? archive.compare.map(function (pair) {
      const lineName = function (id) { return (window.LZS_STORYLINES && window.LZS_STORYLINES.byId(id)) ? window.LZS_STORYLINES.byId(id).title : id; };
      const bits = [];
      if (pair.onlyA.length) bits.push('上一局展开、这一局没有：' + pair.onlyA.map(lineName).join('、'));
      if (pair.onlyB.length) bits.push('这一局新展开：' + pair.onlyB.map(lineName).join('、'));
      if (pair.newEvents.length) bits.push('新出现的条件事件 ' + pair.newEvents.length + ' 条');
      if (pair.sameSeed) bits.push('用的是同一个种子，差异全部来自你的决定');
      if (!bits.length) bits.push('两局的主线组合相同，差异体现在具体分支与选择');
      return '<li><span>' + escapeHtml((pair.endings[0] || '?') + ' → ' + (pair.endings[1] || '?')) + '</span><p>' + escapeHtml(bits.join('；')) + '。</p></li>';
    }).join('') : '';
    return '<section class="ending-section exploration"><h2>战役探索记录</h2><p class="stat-hint">记录你在这台设备上走过的路线、展开过的故事线、出现过的条件事件与做过的推演。没有经验值、等级或胜利积分。</p>' +
      '<dl class="exploration-facts"><dt>完成战役</dt><dd>' + completed + ' 次</dd><dt>本局条件事件</dt><dd>' + firedIds.length + ' / ' + (summary ? summary.total : firedIds.length) + '</dd><dt>故事线已历</dt><dd>' + ((archive && archive.linesExplored) || 0) + ' / ' + ((archive && archive.lines && archive.lines.length) || 8) + '</dd><dt>跨周目事件</dt><dd>' + ((archive && archive.eventsSeenCount) || 0) + ' 条</dd><dt>已完成推演</dt><dd>' + (replaySum ? replaySum.totalRuns : 0) + ' 次</dd></dl>' +
      (lineLines ? '<h3>故事线</h3><ul class="branch-hints story-line-list">' + lineLines + '</ul><p class="stat-hint">同一场战役每局只会展开 3—4 条主轴与 2 条辅线；换一个种子，展开的会是另外几条。</p>' : '') +
      (compareLines ? '<h3>这几局之间最大的区别</h3><ul class="exploration-compare">' + compareLines + '</ul>' : '') +
      '<h3>已经过的路线</h3><ol class="exploration-routes">' + routeLines + '</ol>' +
      (hintLines ? '<h3>重大决策分支</h3><ul class="branch-hints">' + hintLines + '</ul><p class="stat-hint">这里只说「走过 / 没走过」，不提前告诉你没走过的内容。</p>' : '') +
      (unexploredLines ? '<h3>还没经历的路线</h3><ul class="branch-hints">' + unexploredLines + '</ul>' : '') +
      (replayLines ? '<h3>决策推演</h3><ul class="exploration-replay">' + replayLines + '</ul>' : '') +
      '<div class="exploration-actions"><button type="button" class="btn btn-primary" id="btn-new-seed">开始新一轮战役（新种子）</button>' +
      ((archive && Number.isInteger(archive.lastSeed)) ? '<button type="button" class="btn btn-ghost" id="btn-same-seed">复现上一局（种子 ' + archive.lastSeed + '）</button>' : '') +
      '<button type="button" class="btn btn-ghost" id="btn-replay-room-archive">继续决策推演</button></div>' +
      '<p class="stat-hint">触发过的条件事件：' + (seenEvents.length ? escapeHtml(seenEvents.slice(0, 10).join('；')) + (seenEvents.length > 10 ? ' 等' : '') : '还没有触发条件事件。') + '</p>' +
      (archive && archive.broken ? '<p class="stat-hint">上次的探索记录无法解析，原文已经另存一份备份，现有记录没有被覆盖。</p>' : '') + '</section>';
  }

  /* 档案柜里的两个重开入口：同一个历史起点，不同的种子。 */
  function startNewSeedCampaign() {
    openConfirm({
      kicker: '新的一轮',
      title: '用新的种子重新开始？',
      message: '<p>仍然是 2022 年 2 月 24 日、同一场基辅防御战役。新的种子会让另外几条故事线成为主轴。</p><p>当前战役进度会被清除。</p>',
      confirmLabel: '开始新一轮',
      onConfirm: function () { startNewGame(true, 'campaign'); }
    });
  }

  function replayLastSeed() {
    const A = archiveApi();
    const seed = A && A.summary ? A.summary().lastSeed : null;
    if (!Number.isInteger(seed)) { toast('还没有可复现的上一局。', true); return; }
    openConfirm({
      kicker: '复现上一局',
      title: '用种子 ' + seed + ' 再来一次？',
      message: '<p>同一个种子、同一场战役。如果你做出不同的决定，故事线会走向不同的分支；相同的决定会得到相同的结果。</p>',
      confirmLabel: '用这个种子开始',
      onConfirm: function () { startNewGame(true, 'campaign', seed); }
    });
  }

  function init() {
    document.addEventListener('click', function (ev) {
      const b = ev.target && ev.target.closest ? ev.target.closest('[data-wrap-finish]') : null;
      if (!b || !ui.game) return;
      const r = L.finishWrapUp(ui.game);
      if (!r.ok) { toast(r.error || '现在不能结束收束。', true); return; }
      closeModal(); saveGame(false); showEnding();
    });
    el.start.addEventListener('click', function () { requestStart('classic'); });
    el.continue.addEventListener('click', function () { loadGame('classic'); });
    if (el.campaign) el.campaign.addEventListener('click', function () { requestStart('campaign'); });
    if (el.continueCampaign) el.continueCampaign.addEventListener('click', function () { loadGame('campaign'); });
    el.how.addEventListener('click', openHowToPlay);
    if (el.replayRoom) el.replayRoom.addEventListener('click', openReplayRoom);
    if (el.afterwardIntro) el.afterwardIntro.addEventListener('click', openAfterward);
    el.disclaimer.addEventListener('click', openDisclaimer);
    el.helpBtn.addEventListener('click', openHowToPlay);
    el.audioBtn.addEventListener('click', openAudioSettings);
    el.audioIntroBtn.addEventListener('click', openAudioSettings);
    el.clearSave.addEventListener('click', function () {
      openConfirm({ kicker: '清除存档', title: '删除本机进度？', message: '<p>这会删除本机浏览器里《小泽模拟器》的七日开局与基辅战役存档；本机结局记录保留，不会影响其他网站。</p>', confirmLabel: '删除存档', onConfirm: function () { L.deleteSave('classic'); L.deleteSave('campaign'); toast('存档已删除。'); renderIntro(); } });
    });
    el.saveBtn.addEventListener('click', function () { saveGame(true); });
    el.logBtn.addEventListener('click', openLog);
    el.menuBtn.addEventListener('click', openMenu);
    el.issue.addEventListener('click', issueSelected);
    if (el.issueDelegate) el.issueDelegate.addEventListener('click', openIssueDelegateModal);
    el.endRound.addEventListener('click', requestEndRound);
    if (el.opsBtn) el.opsBtn.addEventListener('click', function () { openOperations('intel'); });
    renderIntro();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
