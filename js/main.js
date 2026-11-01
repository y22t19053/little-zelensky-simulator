/*
 * 小泽模拟器 · 界面层
 * ------------------------------------------------------------------
 * 只负责渲染、输入与存档调用；所有规则在 js/engine.js 里。
 * 无外部依赖，可直接以 file:// 打开。
 */
(function () {
  'use strict';

  const L = window.LZS;

  if (!L) {
    document.body.innerHTML = '<main style="padding:40px;font-family:serif;color:#d8cdb8;background:#0b0e0c;min-height:100vh"><h1>载入失败</h1><p>找不到游戏引擎。请确认 js/events.js 与 js/engine.js 位于正确位置。</p></main>';
    return;
  }

  const el = {
    intro: document.getElementById('screen-intro'),
    game: document.getElementById('screen-game'),
    ending: document.getElementById('screen-ending'),
    start: document.getElementById('btn-start'),
    continue: document.getElementById('btn-continue'),
    clearSave: document.getElementById('btn-clear-save'),
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
    menuBtn: document.getElementById('btn-menu'),
    modalRoot: document.getElementById('modal-root'),
    toastRoot: document.getElementById('toast-root')
  };

  const ui = {
    game: null,
    selectedChoiceId: null,
    busy: false,
    lastDeltas: null,
    lastPressureDelta: 0,
    modalLastFocus: null,
    modalDismissible: true,
    toastCount: 0
  };

  const LOG_TYPE_LABEL = {
    system: '系统',
    decision: '决策',
    pressure: '压力',
    attrition: '侵蚀',
    delayed: '延迟',
    ending: '判定'
  };

  const PRESSURE_NOTES = {
    low: '尚未进入全面战时节奏；但边境报告已经不再乐观。',
    mid: '国家机器开始承压：协调、补给与人员都在被同时消耗。',
    high: '高强度阶段：夜间侵蚀明显加重，任何新增压力都可能压垮某一环。',
    extreme: '极高压力：指挥系统接近处理上限，优先事项正在互相挤压。',
    critical: '临界：再增加一点压力，就可能触发国家指挥体系过载判定。'
  };

  /* ------------------------------------------------------------------------
     工具
     ------------------------------------------------------------------------ */

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

  function pressureBand(value) {
    if (value >= 90) return 'critical';
    if (value >= 75) return 'extreme';
    if (value >= 55) return 'high';
    if (value >= 35) return 'mid';
    return 'low';
  }

  function pressureLabel(value) {
    const band = pressureBand(value);
    return { low: '低', mid: '中', high: '高', extreme: '极高', critical: '临界' }[band];
  }

  function pressureFillClass(value) {
    if (value >= 90) return 'is-critical';
    if (value >= 75) return 'is-high';
    if (value >= 55) return 'is-mid';
    return '';
  }

  function statLevel(value) {
    if (value <= 25) return 'low';
    if (value <= 40) return 'warn';
    if (value >= 70) return 'strong';
    return '';
  }

  function statValueClass(value) {
    if (value <= 25) return 'is-low';
    if (value <= 40) return 'is-warn';
    return '';
  }

  function statFillClass(value) {
    if (value <= 25) return 'is-low';
    if (value <= 40) return 'is-warn';
    if (value >= 70) return 'is-strong';
    return '';
  }

  function statLabel(key) {
    return L.statMeta[key] ? L.statMeta[key].short : key;
  }

  function statFullLabel(key) {
    return L.statMeta[key] ? L.statMeta[key].label : key;
  }

  function delayDueLabel(delay) {
    const due = (ui.game ? ui.game.round : 1) + Number(delay || 0);
    const event = L.events[due - 1];
    return event ? 'D+' + delay + ' · ' + event.dateLabel : 'D+' + delay + ' · 阶段结束后';
  }

  function pendingDueLabel(item) {
    const diff = Math.max(0, Number(item.dueRound || 0) - (ui.game ? ui.game.round : 1));
    const event = L.events[Number(item.dueRound) - 1];
    const date = event ? event.dateLabel : '阶段结束后';
    return { short: 'D+' + diff, full: date };
  }

  function showScreen(name) {
    const map = { intro: el.intro, game: el.game, ending: el.ending };
    Object.keys(map).forEach(function (key) {
      map[key].hidden = key !== name;
    });
    ui.screen = name;
    document.title = name === 'intro'
      ? '小泽模拟器 · 你能顶住几天？'
      : name === 'ending'
        ? '阶段结局 · 小泽模拟器'
        : '总统办公室 · 小泽模拟器';
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function toast(message, isError) {
    if (!el.toastRoot || !message) return;
    const node = document.createElement('div');
    node.className = 'toast' + (isError ? ' is-error' : '');
    node.textContent = message;
    el.toastRoot.appendChild(node);
    ui.toastCount += 1;
    while (el.toastRoot.children.length > 3) {
      el.toastRoot.removeChild(el.toastRoot.firstElementChild);
    }
    window.setTimeout(function () {
      if (node.parentNode) node.parentNode.removeChild(node);
      ui.toastCount = Math.max(0, ui.toastCount - 1);
    }, 2800);
  }

  function saveGame(manual) {
    if (!ui.game) return false;
    const ok = L.saveGame(ui.game);
    if (manual) {
      toast(ok ? '进度已保存到本机浏览器。' : '无法写入本机存储：浏览器可能处于隐私模式或禁用了 LocalStorage。', !ok);
    }
    return ok;
  }

  /* ------------------------------------------------------------------------
     开场
     ------------------------------------------------------------------------ */

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
      const stateText = summary.phase === 'ending'
        ? '已结束 · ' + (summary.endingTitle || '阶段结局')
        : '进行中 · 剩余 ' + summary.ap + ' AP';
      el.saveSummary.innerHTML = '上次进度：<strong>' + escapeHtml(summary.dateLabel) +
        '</strong> · 第 ' + summary.round + ' / ' + L.finalRound + ' 回合 · ' +
        escapeHtml(stateText);
    } else {
      el.saveSummary.textContent = '';
    }
  }

  function requestStart() {
    if (L.hasSave()) {
      const summary = L.getSaveSummary();
      openConfirm({
        kicker: '覆盖确认',
        title: '开始新一局？',
        message: '<p>本机已有一局进度：<strong>' + escapeHtml(summary ? summary.dateLabel : '') +
          '</strong>，第 ' + (summary ? summary.round : '?') + ' 回合。</p><p>开始新一局会覆盖这份存档。</p>',
        confirmLabel: '覆盖并开始',
        onConfirm: function () { startNewGame(true); }
      });
      return;
    }
    startNewGame(true);
  }

  function startNewGame(force) {
    if (!force && L.hasSave()) return;
    L.deleteSave();
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
    if (ui.game.phase === 'ending') {
      showEnding();
    } else {
      enterGame();
    }
  }

  function enterGame() {
    if (!ui.game) return;
    if (ui.game.phase === 'ending') {
      showEnding();
      return;
    }
    showScreen('game');
    renderGame();
    if (ui.game.phase === 'interlude' && ui.game.interlude) {
      openInterlude(ui.game.interlude);
    }
  }

  /* ------------------------------------------------------------------------
     游戏主渲染
     ------------------------------------------------------------------------ */

  function renderGame() {
    if (!ui.game) return;
    if (ui.game.phase === 'ending') {
      showEnding();
      return;
    }
    const event = L.getEvent(ui.game);
    if (!event) {
      toast('事件数据缺失，无法继续。', true);
      return;
    }
    renderTop();
    renderEvent();
    renderStats();
    renderForecast();
    renderPending();
    renderLogPanel();
    renderOrder();
  }

  function renderTop() {
    const g = ui.game;
    const event = L.getEvent(g);
    if (!event) return;

    el.gameDate.textContent = event.dateLabel;
    el.gamePhase.textContent = '第 ' + g.round + ' / ' + L.finalRound + ' 回合 · ' + event.time;

    const p = g.pressure;
    el.pressureValue.textContent = p;
    el.pressureTag.textContent = pressureLabel(p);
    el.pressureTag.className = 'pressure-tag' + (p >= 90 ? ' is-critical' : p >= 75 ? ' is-high' : '');
    el.pressureFill.style.width = Math.max(0, Math.min(100, p)) + '%';
    el.pressureFill.className = 'pressure-fill ' + pressureFillClass(p);
    el.pressureTrack.setAttribute('aria-label', '战争压力 ' + p + ' / 100，' + pressureLabel(p));
    el.pressureNote.textContent = PRESSURE_NOTES[pressureBand(p)];

    el.apValue.textContent = g.ap;
    const pips = [];
    for (let i = 0; i < g.apMax; i += 1) {
      pips.push('<span class="ap-pip' + (i >= g.ap ? ' is-spent' : '') + '"></span>');
    }
    el.apPips.innerHTML = pips.join('');
    el.apPips.setAttribute('aria-label', '剩余注意力 ' + g.ap + ' 点');

    const available = L.getAvailableChoices(g).length;
    if (g.phase !== 'briefing') {
      el.apNote.textContent = '本回合正在结算。';
    } else if (g.ap <= 0) {
      el.apNote.textContent = '注意力已耗尽，请结束本回合。';
    } else if (!available) {
      el.apNote.textContent = '剩余 AP 已不足以签发任何文件。';
    } else {
      el.apNote.textContent = '还可签发 ' + g.ap + ' 点决策；未使用的 AP 不会保留。';
    }
  }

  function renderEvent() {
    const g = ui.game;
    const event = L.getEvent(g);
    if (!event) return;

    const vitalHtml = L.statKeys.map(function (key) {
      const value = g.stats[key];
      return '<div class="vital ' + (value <= 25 ? 'is-low' : value <= 40 ? 'is-warn' : '') + '">' +
        '<span class="vital-name">' + escapeHtml(statLabel(key)) + '</span>' +
        '<span class="vital-value">' + value + '</span>' +
        '</div>';
    }).join('');

    const known = listHtml(event.known);
    const unknown = listHtml(event.unknown);

    const intelClass = event.intel && event.intel.tone === 'low' ? ' is-low' : '';
    const intelLevel = event.intel ? event.intel.level : '未知';
    const intelNote = event.intel ? event.intel.note : '';

    const dossier =
      '<div class="mobile-vitals" aria-label="国家状态快速查看">' + vitalHtml + '</div>' +
      '<article class="dossier">' +
        '<div class="dossier-head">' +
          '<div class="dossier-classification">' +
            '<span class="classification-mark">模拟推演</span>' +
            '<span>非历史记录</span>' +
            '<span>总统办公室 / 收文</span>' +
          '</div>' +
          '<span class="dossier-index">LZS-' + String(g.round).padStart(2, '0') + ' / ' + escapeHtml(event.id.toUpperCase()) + '</span>' +
        '</div>' +
        '<div class="dossier-title-block">' +
          '<p class="dossier-kicker">' + escapeHtml(event.kicker) + '</p>' +
          '<h1 class="dossier-title">' + escapeHtml(event.title) + '</h1>' +
          '<div class="dossier-meta">' +
            '<span>' + escapeHtml(event.dateLabel) + '</span>' +
            '<span class="meta-divider" aria-hidden="true"></span>' +
            '<span>' + escapeHtml(event.time) + '</span>' +
            '<span class="meta-divider" aria-hidden="true"></span>' +
            '<span>第 ' + g.round + ' / ' + L.finalRound + ' 回合</span>' +
            '<span class="meta-divider" aria-hidden="true"></span>' +
            '<span>战争压力 ' + g.pressure + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="intel-band' + intelClass + '">' +
          '<div class="intel-label">情报可信度<span class="intel-level">' + escapeHtml(intelLevel) + '</span></div>' +
          '<p class="intel-text">' + escapeHtml(intelNote) + '</p>' +
        '</div>' +
        '<div class="situation">' +
          (event.situation || []).map(function (text) { return '<p>' + escapeHtml(text) + '</p>'; }).join('') +
        '</div>' +
        '<div class="epistemics">' +
          '<div class="epistemic-block">' +
            '<div class="epistemic-label">当时已知</div>' +
            known +
          '</div>' +
          '<div class="epistemic-block is-unknown">' +
            '<div class="epistemic-label">当时无法确认</div>' +
            unknown +
            '<p class="epistemic-note">这些空白会直接影响判断；不要把它们当作已知事实。</p>' +
          '</div>' +
        '</div>' +
        '<div class="dossier-foot">' +
          '<span>文件参数为模拟设计值，不代表真实统计。</span>' +
          '<span>文电与评估为合成文本</span>' +
        '</div>' +
      '</article>' +
      '<section class="choices-section" aria-labelledby="choices-title">' +
        '<div class="section-heading">' +
          '<h2 id="choices-title">待签决策文件</h2>' +
          '<span class="section-hint">' + choiceHint() + '</span>' +
        '</div>' +
        '<div class="choice-list">' + renderChoices(event) + '</div>' +
      '</section>';

    el.eventMain.innerHTML = dossier;
    bindChoiceCards();
  }

  function listHtml(items) {
    if (!items || !items.length) return '<ul class="epistemic-list"><li>暂无可靠条目。</li></ul>';
    return '<ul class="epistemic-list">' + items.map(function (item) {
      return '<li>' + escapeHtml(item) + '</li>';
    }).join('') + '</ul>';
  }

  function choiceHint() {
    const g = ui.game;
    if (g.phase !== 'briefing') return '本回合正在结算';
    if (g.ap <= 0) return '注意力已耗尽 · 请结束回合';
    const available = L.getAvailableChoices(g).length;
    if (!available) return '剩余 AP 不足 · 请结束回合';
    return '点击选择 · 签发即扣除 AP';
  }

  function renderChoices(event) {
    const g = ui.game;
    return (event.choices || []).map(function (choice, index) {
      const status = L.getChoiceStatus(g, choice.id);
      const executed = status.state === 'issued';
      const conflict = status.state === 'conflict';
      const locked = !executed && !status.canIssue;
      const selected = ui.selectedChoiceId === choice.id;
      const classes = ['choice-card'];
      if (executed) classes.push('is-executed');
      if (locked) classes.push('is-locked');
      if (conflict) classes.push('is-conflict');
      if (selected) classes.push('is-selected');

      const stateText = executed ? '已签发' : conflict ? '互斥锁定' : status.state === 'ap' ? 'AP 不足' : '';
      const lockNote = conflict
        ? '<p class="choice-locked-note is-conflict-note"><strong>命令冲突：</strong>' + escapeHtml(status.message) + ' 本回合只能保留一条指挥路线。</p>'
        : status.state === 'ap'
          ? '<p class="choice-locked-note">注意力不足：需要 ' + choice.ap + ' AP，当前剩余 ' + g.ap + ' AP。</p>'
          : '';

      return '<article class="' + classes.join(' ') + '" data-choice-id="' + escapeHtml(choice.id) + '"' +
        ' role="button" tabindex="' + (locked ? -1 : 0) + '" aria-pressed="' + (selected ? 'true' : 'false') + '"' +
        ' aria-disabled="' + (locked ? 'true' : 'false') + '"' +
        ' aria-label="' + escapeHtml(choice.title + '，' + choice.ap + ' 点注意力' + (stateText ? '，' + stateText : '')) + '">' +
        '<div class="choice-num" aria-hidden="true">' + String(index + 1).padStart(2, '0') + '</div>' +
        '<div class="choice-main">' +
          '<div class="choice-topline">' +
            '<h3 class="choice-title">' + escapeHtml(choice.title) + '</h3>' +
            '<span class="choice-ap">' + choice.ap + ' AP</span>' +
          '</div>' +
          '<p class="choice-summary">' + escapeHtml(choice.summary) + '</p>' +
          '<p class="choice-staff">' + escapeHtml(choice.staff) + '</p>' +
          '<div class="effect-row">' + effectChips(choice.effects) + '</div>' +
          delayLine(choice) + lockNote +
        '</div>' +
        (executed ? '<span class="choice-stamp">已签发</span>' : conflict ? '<span class="choice-stamp is-conflict-stamp">互斥</span>' : '') +
      '</article>';
    }).join('');
  }

  function effectChips(effects) {
    if (!effects) return '';
    const chips = [];
    L.statKeys.forEach(function (key) {
      const value = effects[key];
      if (!value) return;
      chips.push('<span class="effect-chip ' + (value > 0 ? 'is-pos' : 'is-neg') + '">' +
        escapeHtml(statLabel(key)) + ' <span class="effect-val">' + formatSigned(value) + '</span></span>');
    });
    if (effects.pressure) {
      chips.push('<span class="effect-chip is-pressure">压力 <span class="effect-val">' +
        formatSigned(effects.pressure) + '</span></span>');
    }
    return chips.join('');
  }

  function delayLine(choice) {
    if (!choice.delayed || !choice.delayed.length) return '';
    return choice.delayed.map(function (item) {
      return '<p class="choice-delay"><strong>延迟后果</strong> · <span class="delay-due">' +
        escapeHtml(delayDueLabel(item.delay)) + '</span> · ' + escapeHtml(item.label) + '</p>';
    }).join('');
  }

  function bindChoiceCards() {
    const cards = el.eventMain.querySelectorAll('.choice-card');
    Array.prototype.forEach.call(cards, function (card) {
      const choiceId = card.getAttribute('data-choice-id');
      if (!choiceId) return;
      const blocked = card.classList.contains('is-executed') || card.classList.contains('is-locked') || ui.busy;
      if (blocked) return;

      card.addEventListener('click', function () {
        selectChoice(choiceId);
      });
      card.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          selectChoice(choiceId);
        }
      });
    });
  }

  function selectChoice(choiceId) {
    if (!ui.game || ui.game.phase !== 'briefing' || ui.busy) return;
    const event = L.getEvent(ui.game);
    const choice = L.getChoice(event, choiceId);
    if (!choice) return;
    const status = L.getChoiceStatus(ui.game, choiceId);
    if (!status.canIssue) {
      toast(status.message || '这项决策当前不能签发。', true);
      return;
    }

    ui.selectedChoiceId = ui.selectedChoiceId === choiceId ? null : choiceId;
    const cards = el.eventMain.querySelectorAll('.choice-card');
    Array.prototype.forEach.call(cards, function (card) {
      const selected = card.getAttribute('data-choice-id') === ui.selectedChoiceId;
      card.classList.toggle('is-selected', selected);
      card.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
    renderOrder();
  }

  function renderStats() {
    const g = ui.game;
    const rows = L.statKeys.map(function (key) {
      const value = g.stats[key];
      const delta = ui.lastDeltas && ui.lastDeltas[key] ? ui.lastDeltas[key] : 0;
      const level = statLevel(value);
      return '<div class="stat-row" title="' + escapeHtml(statFullLabel(key) + '：' + (L.statMeta[key] ? L.statMeta[key].hint : '')) + '">' +
        '<div class="stat-line">' +
          '<span class="stat-name">' + escapeHtml(statFullLabel(key)) + '</span>' +
          '<span class="stat-value-wrap">' +
            (delta ? '<span class="stat-delta ' + (delta > 0 ? 'is-pos' : 'is-neg') + '">' + formatSigned(delta) + '</span>' : '') +
            '<span class="stat-value ' + statValueClass(value) + '">' + value + '</span>' +
          '</span>' +
        '</div>' +
        '<div class="stat-track" role="img" aria-label="' + escapeHtml(statFullLabel(key) + ' ' + value + ' / 100') + '">' +
          '<div class="stat-fill ' + statFillClass(value) + '" style="width:' + Math.max(0, Math.min(100, value)) + '%"></div>' +
        '</div>' +
      '</div>';
    }).join('');

    el.statsPanel.innerHTML =
      '<div class="panel-head">' +
        '<h2 class="panel-title" id="stats-title">国家状态</h2>' +
        '<span class="panel-note">0—100</span>' +
      '</div>' +
      rows +
      '<p class="stat-hint">数值受决策、夜间侵蚀与延迟后果影响。崩溃线：政府 25、军队 15、基辅 12、意志 20、外交 10、储备 8、个人安全 10。</p>';
  }

  function renderForecast() {
    const g = ui.game;
    const forecast = L.getPressureForecast(g);
    if (!forecast) {
      el.forecastPanel.innerHTML = '';
      return;
    }
    const attritionChips = effectChips(forecast.attrition);
    const warning = forecast.next >= 100
      ? '<p class="forecast-copy" style="color:var(--danger-bright)">今晚压力将达到 100，可能触发“国家指挥体系过载”判定。</p>'
      : forecast.next >= 90
        ? '<p class="forecast-copy" style="color:var(--warning)">今晚压力将进入临界区；任何额外压力都可能触发过载。</p>'
        : '<p class="forecast-copy">压力越高，夜间对国家状态的侵蚀越重。预测不含尚未触发的延迟后果。</p>';

    el.forecastPanel.innerHTML =
      '<div class="panel-head">' +
        '<h2 class="panel-title" id="forecast-title">今晚结算预测</h2>' +
        '<span class="panel-note">若现在结束回合</span>' +
      '</div>' +
      '<div class="forecast-main">' +
        '<span class="forecast-current">' + forecast.current + '</span>' +
        '<span class="forecast-arrow" aria-hidden="true">→</span>' +
        '<span class="forecast-next">' + forecast.next + '</span>' +
        '<span class="forecast-tag">' + pressureLabel(forecast.next) + '</span>' +
      '</div>' +
      '<div class="forecast-attrition">' +
        '<span class="forecast-attrition-label">预计夜间侵蚀</span>' +
        (attritionChips || '<span class="empty-note">本晚没有可测量的状态侵蚀。</span>') +
      '</div>' +
      warning;
  }

  function renderPending() {
    const g = ui.game;
    const pending = (g.pending || []).slice().sort(function (a, b) { return a.dueRound - b.dueRound; });
    let body = '';
    if (!pending.length) {
      body = '<p class="empty-note">暂无待触发的延迟后果。已签发的文件可能在之后几晚改变局面。</p>';
    } else {
      body = '<ul class="pending-list">' + pending.map(function (item) {
        const due = pendingDueLabel(item);
        return '<li class="pending-item">' +
          '<span class="pending-due">' + escapeHtml(due.short) + '</span>' +
          '<span class="pending-body">' +
            '<span class="pending-label">' + escapeHtml(item.label) + '</span>' +
            '<span class="pending-source">' + escapeHtml(item.sourceLabel || '') + ' · ' + escapeHtml(due.full) + '</span>' +
          '</span>' +
        '</li>';
      }).join('') + '</ul>';
    }

    el.pendingPanel.innerHTML =
      '<div class="panel-head">' +
        '<h2 class="panel-title" id="pending-title">延迟后果</h2>' +
        '<span class="panel-note">' + pending.length + ' 项待触发</span>' +
      '</div>' + body;
  }

  function logEntryHtml(entry, full) {
    const typeLabel = LOG_TYPE_LABEL[entry.type] || entry.type;
    return '<div class="log-entry is-' + escapeHtml(entry.type || 'system') + '">' +
      '<div class="log-meta"><span>R' + escapeHtml(entry.round) + '</span>' +
        '<span>' + escapeHtml(entry.dateLabel || '') + '</span>' +
        '<span class="log-type">' + escapeHtml(typeLabel) + '</span>' +
      '</div>' +
      '<div class="log-title">' + escapeHtml(entry.title) + '</div>' +
      (full || entry.text ? '<div class="log-text">' + escapeHtml(entry.text || '') + '</div>' : '') +
    '</div>';
  }

  function renderLogPanel() {
    const g = ui.game;
    const entries = (g.log || []).slice(-6).reverse();
    const body = entries.length
      ? entries.map(function (entry) { return logEntryHtml(entry, false); }).join('')
      : '<p class="empty-note">还没有记录。签发第一项决策后，这里会出现行动链。</p>';

    el.logPanel.innerHTML =
      '<div class="panel-head">' +
        '<h2 class="panel-title" id="log-title">行动记录</h2>' +
        '<span class="panel-note">' + (g.log || []).length + ' 条</span>' +
      '</div>' +
      '<div class="log-list">' + body + '</div>' +
      ((g.log || []).length > 6 ? '<button class="log-more" type="button" id="btn-log-more">查看完整日志</button>' : '');

    const more = document.getElementById('btn-log-more');
    if (more) more.addEventListener('click', openLog);
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
      el.orderMeta.textContent = choice.ap + ' AP · 剩余 ' + g.ap + ' AP' +
        (choice.delayed && choice.delayed.length ? ' · 含延迟后果' : '');
      el.issueLabel.textContent = '签发命令';
      el.issueCost.textContent = choice.ap + ' AP';
    } else {
      el.orderTitle.textContent = g.phase === 'briefing' ? '从上方选择一项决策' : '本回合正在结算';
      el.orderMeta.textContent = g.phase === 'briefing' ? '点击决策文件查看代价' : '请完成夜间结算';
      el.issueLabel.textContent = '签发命令';
      el.issueCost.textContent = '—';
    }

    el.issue.disabled = !canIssue;
    el.endRound.disabled = ui.busy || g.phase !== 'briefing' || g.executed.length === 0;
    el.endRound.textContent = g.round >= L.finalRound ? '结算本阶段' : '结束本回合';
    el.endRound.title = g.executed.length === 0 ? '至少签发一项决策，才能结束本回合。' : '';
  }

  /* ------------------------------------------------------------------------
     操作
     ------------------------------------------------------------------------ */

  function issueSelected() {
    if (ui.busy || !ui.game || ui.game.phase !== 'briefing') return;
    const event = L.getEvent(ui.game);
    const choice = ui.selectedChoiceId && event ? L.getChoice(event, ui.selectedChoiceId) : null;
    if (!choice) {
      toast('请先选择一项决策。', true);
      return;
    }

    ui.busy = true;
    const result = L.applyChoice(ui.game, choice.id);
    ui.busy = false;

    if (!result.ok) {
      toast(result.error || '这项决策无法签发。', true);
      renderGame();
      return;
    }

    ui.selectedChoiceId = null;
    ui.lastDeltas = result.deltas || {};
    ui.lastPressureDelta = result.pressureDelta || 0;
    saveGame(false);

    if (result.ending || ui.game.phase === 'ending') {
      showEnding();
      return;
    }

    renderGame();
    toast('已签发：' + choice.title);
  }

  function endRound() {
    if (ui.busy || !ui.game || ui.game.phase !== 'briefing') return;
    if (!ui.game.executed.length) {
      toast('至少签发一项决策，才能结束本回合。', true);
      return;
    }

    ui.busy = true;
    const result = L.endRound(ui.game);
    ui.busy = false;

    if (!result.ok) {
      toast(result.error || '无法结束回合。', true);
      renderGame();
      return;
    }

    ui.selectedChoiceId = null;
    ui.lastDeltas = result.attrition || {};
    ui.lastPressureDelta = result.pressure ? (result.pressure.after - result.pressure.before) : 0;
    saveGame(false);

    if (result.ending || ui.game.phase === 'ending') {
      showEnding();
      return;
    }

    renderGame();
    if (result.interlude) {
      openInterlude(result.interlude);
    }
  }

  /* ------------------------------------------------------------------------
     模态框
     ------------------------------------------------------------------------ */

  function openModal(options) {
    closeModal();
    const dismissible = options.dismissible !== false;
    ui.modalDismissible = dismissible;
    ui.modalLastFocus = document.activeElement;

    const actions = options.actions || [];
    const actionHtml = actions.length
      ? '<div class="modal-actions">' + actions.map(function (action, index) {
          return '<button type="button" class="' + (action.className || 'btn btn-ghost') + '" data-modal-action="' + index + '">' +
            escapeHtml(action.label) + '</button>';
        }).join('') + '</div>'
      : '';

    el.modalRoot.innerHTML =
      '<div class="modal-backdrop">' +
        '<div class="modal-card' + (options.wide ? ' modal-wide' : '') + '" role="dialog" aria-modal="true" aria-labelledby="modal-title">' +
          '<div class="modal-head">' +
            '<div>' +
              '<p class="modal-kicker">' + escapeHtml(options.kicker || '总统办公室') + '</p>' +
              '<h2 class="modal-title" id="modal-title">' + escapeHtml(options.title || '') + '</h2>' +
            '</div>' +
            (dismissible ? '<button type="button" class="modal-close" data-modal-close aria-label="关闭">×</button>' : '') +
          '</div>' +
          '<div class="modal-body">' + (options.body || '') + '</div>' +
          actionHtml +
        '</div>' +
      '</div>';

    document.body.classList.add('modal-open');

    const backdrop = el.modalRoot.querySelector('.modal-backdrop');
    const card = el.modalRoot.querySelector('.modal-card');
    const closeBtn = el.modalRoot.querySelector('[data-modal-close]');

    if (dismissible) {
      backdrop.addEventListener('click', function (event) {
        if (event.target === backdrop) closeModal();
      });
      if (closeBtn) closeBtn.addEventListener('click', closeModal);
    }

    Array.prototype.forEach.call(el.modalRoot.querySelectorAll('[data-modal-action]'), function (button) {
      button.addEventListener('click', function () {
        const action = actions[Number(button.getAttribute('data-modal-action'))];
        if (!action) return;
        if (action.close !== false) closeModal();
        if (typeof action.onClick === 'function') action.onClick();
      });
    });

    if (typeof options.onMount === 'function') options.onMount(card);

    const focusTarget = card.querySelector('[data-autofocus]') ||
      card.querySelector('.modal-actions .btn-primary') ||
      card.querySelector('.modal-actions .btn') ||
      card;
    window.setTimeout(function () {
      if (focusTarget && typeof focusTarget.focus === 'function') focusTarget.focus();
    }, 20);
  }

  function closeModal() {
    if (!el.modalRoot || !el.modalRoot.firstElementChild) {
      document.body.classList.remove('modal-open');
      return;
    }
    el.modalRoot.innerHTML = '';
    document.body.classList.remove('modal-open');
    const last = ui.modalLastFocus;
    ui.modalLastFocus = null;
    if (last && typeof last.focus === 'function' && document.contains(last)) {
      last.focus();
    }
  }

  function modalIsOpen() {
    return !!(el.modalRoot && el.modalRoot.firstElementChild);
  }

  document.addEventListener('keydown', function (event) {
    if (!modalIsOpen()) return;
    if (event.key === 'Escape' && ui.modalDismissible) {
      event.preventDefault();
      closeModal();
      return;
    }
    if (event.key !== 'Tab') return;
    const card = el.modalRoot.querySelector('.modal-card');
    if (!card) return;
    const focusable = card.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  function openConfirm(options) {
    openModal({
      kicker: options.kicker || '确认',
      title: options.title || '请确认',
      body: '<div class="confirm-copy">' + (options.message || '') + '</div>',
      dismissible: true,
      actions: [
        { label: '取消', className: 'btn btn-ghost', onClick: function () {} },
        {
          label: options.confirmLabel || '确认',
          className: 'btn btn-primary',
          onClick: function () {
            if (typeof options.onConfirm === 'function') options.onConfirm();
          }
        }
      ],
      onMount: function (card) {
        const primary = card.querySelector('.modal-actions .btn-primary');
        if (primary) primary.setAttribute('data-autofocus', '');
      }
    });
  }

  function openInterlude(data) {
    if (!data || !ui.game) return;
    const pressure = data.pressure || { before: 0, rise: 0, after: 0 };
    const attritionChips = effectChips(data.attrition || {});
    const delayed = data.delayed || [];
    const alarms = data.alarms || [];

    const delayedHtml = delayed.length
      ? delayed.map(function (item) {
          return '<div class="consequence">' +
            '<div class="consequence-title">' + escapeHtml(item.label) + '</div>' +
            (item.note ? '<div class="consequence-note">' + escapeHtml(item.note) + '</div>' : '') +
            '<div class="consequence-delta">' + escapeHtml(L.formatDeltaText(item.deltas || {}, item.pressureDelta || 0)) + '</div>' +
          '</div>';
        }).join('')
      : '<p class="empty-note">没有延迟后果在本夜触发。</p>';

    const alarmHtml = alarms.length
      ? '<ul class="alarm-list">' + alarms.map(function (alarm) {
          return '<li class="alarm-item is-' + escapeHtml(alarm.level) + '">' +
            '<span>' + escapeHtml(alarm.label) + '</span>' +
            '<span class="alarm-value">' + alarm.value + '</span>' +
          '</li>';
        }).join('') + '</ul>'
      : '<p class="empty-note">暂无新的临界警报；但压力仍在累积。</p>';

    openModal({
      kicker: '夜间态势 / 结算',
      title: '第 ' + data.round + ' 夜',
      dismissible: false,
      body:
        '<div class="interlude-date">' +
          '<strong>' + escapeHtml(data.dateLabel || '') + '</strong>' +
          '<span>NIGHT ' + String(data.round).padStart(2, '0') + ' / ' + String(L.finalRound).padStart(2, '0') + '</span>' +
        '</div>' +
        '<div class="interlude-pressure">' +
          '<span class="label">战争压力</span>' +
          '<span class="value">' + pressure.before + ' → ' + pressure.after + '</span>' +
          '<span class="rise">战场 +' + pressure.rise +
            (pressure.delayed ? ' · 延迟 ' + formatSigned(pressure.delayed) : '') +
          '</span>' +
        '</div>' +
        '<div class="interlude-section">' +
          '<h4>压力侵蚀</h4>' +
          '<div class="delta-grid">' + (attritionChips || '<span class="empty-note">本晚没有可测量的状态侵蚀。</span>') + '</div>' +
        '</div>' +
        '<div class="interlude-section">' +
          '<h4>延迟后果</h4>' +
          delayedHtml +
        '</div>' +
        '<div class="interlude-section">' +
          '<h4>警报</h4>' +
          alarmHtml +
        '</div>',
      actions: [
        {
          label: '进入 ' + (data.dateLabel || '下一日'),
          className: 'btn btn-primary',
          close: false,
          onClick: function () {
            const result = L.continueFromInterlude(ui.game);
            if (!result.ok) {
              toast(result.error || '无法进入下一回合。', true);
              return;
            }
            closeModal();
            saveGame(false);
            renderGame();
          }
        }
      ],
      onMount: function (card) {
        const primary = card.querySelector('.modal-actions .btn-primary');
        if (primary) primary.setAttribute('data-autofocus', '');
      }
    });
  }

  function openLog() {
    if (!ui.game) return;
    const entries = (ui.game.log || []).slice().reverse();
    const body = entries.length
      ? '<div class="log-modal-list">' + entries.map(function (entry) { return logEntryHtml(entry, true); }).join('') + '</div>'
      : '<p class="empty-note">还没有行动记录。</p>';

    openModal({
      kicker: '行动记录 / DECISION LOG',
      title: '决策日志',
      wide: true,
      body: '<p class="modal-copy" style="margin-bottom:12px">共 ' + (ui.game.log || []).length +
        ' 条记录；已签发 ' + (ui.game.choices || []).length + ' 项决策；已触发 ' +
        (ui.game.resolved || []).length + ' 项延迟后果。</p>' + body,
      actions: [{ label: '关闭', className: 'btn btn-ghost', onClick: function () {} }]
    });
  }

  function openMenu() {
    if (!ui.game) return;
    openModal({
      kicker: '总统办公室 / 菜单',
      title: '暂停',
      body:
        '<div class="confirm-copy">' +
          '<p>进度会在每次签发决策、结束回合和进入下一夜时自动保存到本机浏览器。</p>' +
          '<p>当前：' + escapeHtml((L.getEvent(ui.game) || {}).dateLabel || '') +
          ' · 第 ' + ui.game.round + ' 回合 · 剩余 ' + ui.game.ap + ' AP。</p>' +
        '</div>',
      actions: [
        { label: '继续游戏', className: 'btn btn-ghost', onClick: function () {} },
        {
          label: '保存并回到封面',
          className: 'btn btn-ghost',
          onClick: function () {
            saveGame(true);
            renderIntro();
          }
        },
        {
          label: '重新开始',
          className: 'btn btn-ghost',
          onClick: function () {
            openConfirm({
              kicker: '覆盖确认',
              title: '放弃本局，重新开始？',
              message: '<p>当前进度会被清除。这个动作不能撤销。</p>',
              confirmLabel: '清除并重新开始',
              onConfirm: function () { startNewGame(true); }
            });
          }
        }
      ]
    });
  }

  /* ------------------------------------------------------------------------
     结局
     ------------------------------------------------------------------------ */

  function showEnding() {
    if (!ui.game) return;
    if (!ui.game.ending && ui.game.phase === 'ending') {
      L.evaluateFinal(ui.game);
    }
    const ending = ui.game.ending;
    if (!ending) {
      toast('结局数据缺失，已返回封面。', true);
      renderIntro();
      return;
    }

    saveGame(false);
    closeModal();
    showScreen('ending');

    const stats = ending.finalStats || ui.game.stats || {};
    const statHtml = L.statKeys.map(function (key) {
      const value = stats[key] || 0;
      return '<div class="ending-stat">' +
        '<div class="name">' + escapeHtml(statFullLabel(key)) + '</div>' +
        '<div class="value ' + statValueClass(value) + '">' + value + '</div>' +
        '<div class="bar"><span class="' + statFillClass(value) + '" style="width:' + Math.max(0, Math.min(100, value)) + '%"></span></div>' +
      '</div>';
    }).join('');

    const choices = ending.keyChoices || [];
    const timeline = choices.length
      ? '<ol class="decision-timeline">' + choices.map(function (record) {
          const effectText = L.formatDeltaText(record.deltas || {}, record.pressureDelta || 0);
          const scheduled = record.scheduled && record.scheduled.length
            ? '<div class="decision-effect">后续：' + escapeHtml(record.scheduled.join('；')) + '</div>'
            : '';
          return '<li>' +
            '<div class="decision-round">R' + record.round + ' · ' + escapeHtml(record.dateLabel || '') + ' · ' + record.ap + ' AP</div>' +
            '<div class="decision-label">' + escapeHtml(record.label) + '</div>' +
            '<div class="decision-effect">' + escapeHtml(effectText) + '</div>' +
            scheduled +
          '</li>';
        }).join('') + '</ol>'
      : '<p class="empty-note">本局没有签发决策。</p>';

    const chain = ending.chain || [];
    const chainHtml = chain.length
      ? '<ul class="chain-list">' + chain.map(function (item) {
          return '<li class="chain-item">' +
            '<div class="chain-label">' + escapeHtml(item.label) + '</div>' +
            (item.note ? '<div class="chain-note">' + escapeHtml(item.note) + '</div>' : '') +
            '<div class="chain-delta">R' + item.appliedRound + ' · ' + escapeHtml(L.formatDeltaText(item.deltas || {}, item.pressureDelta || 0)) + '</div>' +
          '</li>';
        }).join('') + '</ul>'
      : '<p class="empty-note">本局没有延迟后果在阶段内触发。</p>';

    const epilogue = (ending.epilogue || []).map(function (paragraph) {
      return '<p>' + escapeHtml(paragraph) + '</p>';
    }).join('');

    const reasons = (ending.reasons || []).map(function (reason) {
      return '<li>' + escapeHtml(reason) + '</li>';
    }).join('');

    const toneLabel = ending.tone === 'success' ? '阶段存续' : ending.tone === 'warning' ? '代价存续' : '阶段未守住';
    const historyHtml = window.LZS_REVIEW
      ? window.LZS_REVIEW.render(ui.game)
      : '<section class="history-review"><h2>历史复盘</h2><p>复盘资料未能载入。</p></section>';

    el.ending.innerHTML =
      '<div class="ending-hero tone-' + escapeHtml(ending.tone || 'danger') + '">' +
        '<span class="ending-stamp">' + escapeHtml(toneLabel) + '</span>' +
        '<p class="ending-kicker">' + escapeHtml(ending.kicker) + '</p>' +
        '<h1 class="ending-title">' + escapeHtml(ending.title) + '</h1>' +
        '<p class="ending-verdict">' + escapeHtml(ending.verdict) + '</p>' +
        '<div class="dossier-meta" style="margin-top:18px">' +
          '<span>阶段：第 ' + (ending.finalRound || ui.game.round) + ' / ' + L.finalRound + ' 回合</span>' +
          '<span class="meta-divider" aria-hidden="true"></span>' +
          '<span>最终压力：' + (ending.finalPressure != null ? ending.finalPressure : ui.game.pressure) + '</span>' +
          '<span class="meta-divider" aria-hidden="true"></span>' +
          '<span>签发 ' + choices.length + ' 项决策</span>' +
          '<span class="meta-divider" aria-hidden="true"></span>' +
          '<span>触发 ' + chain.length + ' 项延迟后果</span>' +
        '</div>' +
      '</div>' +
      '<div class="ending-layout">' +
        '<div class="ending-column">' +
          '<section class="ending-section">' +
            '<h2>阶段记录</h2>' +
            '<div class="ending-copy">' + epilogue + '</div>' +
          '</section>' +
          '<section class="ending-section" style="margin-top:14px">' +
            '<h2>关键决策与连锁后果</h2>' +
            '<p class="modal-copy" style="font-size:11px;color:var(--faint);margin-bottom:10px">这里列出本局签发的全部文件及当时记录的效果；延迟后果在下方单独列出。</p>' +
            timeline +
          '</section>' +
          '<section class="ending-section" style="margin-top:14px">' +
            '<h2>延迟后果链</h2>' +
            chainHtml +
          '</section>' +
        '</div>' +
        '<aside class="ending-column">' +
          '<section class="ending-section">' +
            '<h2>最终国家状态</h2>' +
            '<div class="ending-stats">' + statHtml + '</div>' +
            '<div class="ending-pressure"><span>战争压力</span><strong>' +
              (ending.finalPressure != null ? ending.finalPressure : ui.game.pressure) + ' / 100</strong></div>' +
          '</section>' +
          '<section class="ending-section" style="margin-top:14px">' +
            '<h2>判定依据</h2>' +
            '<ul class="ending-reasons">' + reasons + '</ul>' +
            '<p class="stat-hint" style="margin-top:8px">结局同时参考七项状态、战争压力与决策链，不是单一分数。</p>' +
          '</section>' +
        '</aside>' +
      '</div>' +
      historyHtml +
      '<div class="ending-disclaimer">' +
        '<strong>模拟说明：</strong>' + escapeHtml(ending.disclaimer || L.meta.disclaimer || '') +
        '<br>本结局只描述本局模拟参数下的国家状态，不评价真实历史人物，也不宣称玩家比真实人物更优秀或更糟糕。' +
        '<br>版本 ' + escapeHtml(L.meta.version || '') + ' · 所有数值均为模拟设计参数。' +
      '</div>' +
      '<div class="ending-actions">' +
        '<button type="button" class="btn btn-primary" id="btn-replay">再玩一局</button>' +
        '<button type="button" class="btn btn-ghost" id="btn-back-cover">回到封面</button>' +
        '<button type="button" class="btn btn-ghost" id="btn-print">打印 / 保存本页</button>' +
      '</div>';

    const replay = document.getElementById('btn-replay');
    const cover = document.getElementById('btn-back-cover');
    const print = document.getElementById('btn-print');
    if (replay) replay.addEventListener('click', function () { startNewGame(true); });
    if (cover) cover.addEventListener('click', renderIntro);
    if (print) print.addEventListener('click', function () { window.print(); });
  }

  /* ------------------------------------------------------------------------
     初始化
     ------------------------------------------------------------------------ */

  function init() {
    el.start.addEventListener('click', requestStart);
    el.continue.addEventListener('click', loadGame);
    el.clearSave.addEventListener('click', function () {
      openConfirm({
        kicker: '清除存档',
        title: '删除本机进度？',
        message: '<p>这只会删除本机浏览器里的《小泽模拟器》存档，不会影响其他网站。</p>',
        confirmLabel: '删除存档',
        onConfirm: function () {
          L.deleteSave();
          toast('存档已删除。');
          renderIntro();
        }
      });
    });

    el.saveBtn.addEventListener('click', function () { saveGame(true); });
    el.logBtn.addEventListener('click', openLog);
    el.menuBtn.addEventListener('click', openMenu);
    el.issue.addEventListener('click', issueSelected);
    el.endRound.addEventListener('click', endRound);

    renderIntro();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
