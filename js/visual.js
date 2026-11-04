/* 小泽模拟器 v1.3.0 · 视觉表现层
   本文件只负责「把真实状态画出来」：战略地图、战役时间线、故事线栏、
   援助流转、关键因果链。所有数值、颜色、阶段都读自传入的 state，
   没有任何写死的示意数值。纯字符串输出，不依赖 DOM，可在 node 里测试。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LZS_VISUAL = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const VERSION = '1.3.0';

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  /* 八条故事线的视觉身份：符号 + 主题 + 纸张类型 + 强调色。
     颜色与 css 里的 [data-line=...] 一致，两处必须同源。 */
  const LINE_META = {
    line_airfield: { theme: '战区地图与空域', accent: '#7d93a8', form: '地图批注' },
    line_gov: { theme: '行政公文与命令流', accent: '#a8895f', form: '公文' },
    line_mobilize: { theme: '登记清单与征用', accent: '#b79a5e', form: '登记表' },
    line_intel: { theme: '情报迷雾与核验', accent: '#8b9088', form: '核验单' },
    line_aid: { theme: '外交电报与货运', accent: '#c9a869', form: '电报纸条' },
    line_reserve: { theme: '资源账目与调动', accent: '#88946f', form: '账目' },
    line_civil: { theme: '道路、撤离与公共服务', accent: '#7f97a3', form: '通行告示' },
    line_withdraw: { theme: '时间线与核验', accent: '#8c8496', form: '核验清单' }
  };

  const EMBLEMS = {
    /* 机场：跑道与进近线 */
    line_airfield: '<path d="M4 20 L14 4"/><path d="M10 20 L20 4"/><circle cx="12" cy="12" r="8.4"/><path d="M12 4v2M12 18v2"/>',
    /* 政府：门与层 */
    line_gov: '<path d="M3 10 L12 4 L21 10"/><path d="M5 10v10M10 10v10M14 10v10M19 10v10"/><path d="M3 20h18"/>',
    /* 动员：名册与勾选 */
    line_mobilize: '<rect x="5" y="3" width="14" height="18"/><path d="M8 8h8M8 12h5M8 16h8"/>',
    /* 情报：两份对照 */
    line_intel: '<rect x="3" y="5" width="8" height="14"/><rect x="13" y="5" width="8" height="14"/><path d="M5 9h4M5 13h4M15 9h4M15 13h2"/>',
    /* 外援：电报与信封 */
    line_aid: '<path d="M3 7h18v11H3z"/><path d="M3 7l9 6 9-6"/><path d="M3 18l6-5M21 18l-6-5"/>',
    /* 预备队：箱子与余量 */
    line_reserve: '<path d="M3 8h18v12H3z"/><path d="M3 8l3-4h12l3 4"/><path d="M10 8v12M14 8v12"/>',
    /* 民生：桥与路 */
    line_civil: '<path d="M2 16c4-6 16-6 20 0"/><path d="M4 16v4M10 13v7M14 13v7M20 16v4"/><path d="M2 12h20"/>',
    /* 撤退：时间与时序 */
    line_withdraw: '<circle cx="12" cy="12" r="8.4"/><path d="M12 7v5l3.4 2.4"/>'
  };

  function lineMeta(lineId) { return LINE_META[lineId] || null; }
  function emblem(lineId) {
    const path = EMBLEMS[lineId];
    if (!path) return '';
    return '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">' + path + '</svg>';
  }

  /* ---- 战略地图 ----------------------------------------------------
     以真实地理关系为基础的示意：第聂伯河自北向南穿城、杰斯纳河自东北
     汇入、伊尔平河在西侧、基辅水库在北。六个态势点沿用战役数据里的
     相对方位（L.campaign.fronts 的 x/y），颜色由 frontStatus 决定。
     不画任何进攻路线或可执行的目标选择。 */
  const FRONT_TONE = { threat: 'danger', pressure: 'warning', contested: 'warning', cut: 'warning', held: 'ok', denied: 'ok', withdrawal: 'ok', reentered: 'ok' };
  const LABEL_PLACEMENT = {
    hostomel: { anchor: 'start', dx: 11, dy: -7 },
    moshchun: { anchor: 'start', dx: 11, dy: 5 },
    bucha_irpin: { anchor: 'end', dx: -11, dy: 4 },
    chernihiv: { anchor: 'end', dx: -9, dy: 4 },
    brovary: { anchor: 'end', dx: -9, dy: 15 },
    kyiv_center: { anchor: 'start', dx: 11, dy: 36 }
  };

  function projectFront(front) {
    const x = Number(front && front.x);
    const y = Number(front && front.y);
    return {
      x: 30 + (Number.isFinite(x) ? x : 50) * 2.55,
      y: 22 + (Number.isFinite(y) ? y : 30) * 2.55
    };
  }

  function mapHtml(state, L) {
    const cs = L && L.getCampaignStatus ? L.getCampaignStatus(state) : null;
    if (!cs) return '';
    const fronts = cs.fronts || [];
    const day = cs.day;
    const markers = fronts.map(function (front) {
      const p = projectFront(front);
      const place = LABEL_PLACEMENT[front.id] || { anchor: 'start', dx: 8, dy: 3 };
      const tone = FRONT_TONE[front.status] || 'warning';
      const label = esc(String(front.label || '').replace(/ · /g, '·'));
      return '<g class="map-pt tone-' + tone + '">' +
        '<circle class="map-halo" cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="8"></circle>' +
        '<circle class="map-core" cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="3.4"></circle>' +
        '<text x="' + (p.x + place.dx).toFixed(1) + '" y="' + (p.y + place.dy).toFixed(1) + '" text-anchor="' + place.anchor + '">' + label + '</text>' +
        '</g>';
    }).join('');
    const legend = fronts.map(function (front) {
      const tone = FRONT_TONE[front.status] || 'warning';
      return '<li class="tone-' + tone + '"><span class="map-dot" aria-hidden="true"></span><strong>' + esc(front.label) + '</strong><span>' + esc(front.statusLabel || front.status || '') + '</span></li>';
    }).join('');
    return '<figure class="map-figure">' +
      '<div class="map-stage">' +
      '<svg viewBox="0 0 300 250" role="img" aria-label="基辅周边态势示意，第 ' + esc(day) + ' 天">' +
      '<defs><pattern id="lzs-city" width="7" height="7" patternUnits="userSpaceOnUse"><path d="M0 0h7v7H0z" fill="none"/><path d="M1 6V3h2v3M5 6V2h1.6v4" stroke="#6a7360" stroke-width=".6" fill="none"/></pattern>' +
      '<linearGradient id="lzs-water" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3d5568" stop-opacity=".75"/><stop offset="1" stop-color="#2b3f4d" stop-opacity=".55"/></linearGradient></defs>' +
      '<rect class="map-plate" x="1" y="1" width="298" height="248"></rect>' +
      /* 基辅水库 */
      '<path class="map-water" d="M196 2 L219 2 C215 26 209 44 199 58 C189 44 190 22 196 2 Z"></path>' +
      /* 第聂伯河 */
      '<path class="map-water is-river" d="M203 54 C195 82 190 108 193 138 C196 168 186 196 193 222 C196 234 200 242 203 249 L212 249 C208 240 205 232 203 221 C199 196 208 168 204 138 C200 106 205 80 212 56 Z"></path>' +
      /* 杰斯纳河 */
      '<path class="map-water is-tributary" d="M288 6 C262 22 236 40 214 56"></path>' +
      /* 伊尔平河 */
      '<path class="map-water is-tributary" d="M92 30 C102 70 114 104 122 140 C129 172 150 196 190 214"></path>' +
      /* 城市街区 */
      '<path class="map-city" d="M150 150 L188 146 L196 178 L172 194 L146 180 Z" fill="url(#lzs-city)"></path>' +
      '<circle class="map-kyiv-ring" cx="169" cy="169" r="18"></circle>' +
      /* 低对比道路示意 */
      '<g class="map-roads">' +
      '<path d="M104 100 L140 130 L166 166"></path>' +
      '<path d="M126 142 L150 156 L168 168"></path>' +
      '<path d="M220 40 L196 90 L172 150"></path>' +
      '<path d="M218 152 L192 162"></path>' +
      '</g>' +
      markers +
      '<text class="map-water-label" x="228" y="120" transform="rotate(90 228 120)">第聂伯河</text>' +
      '<text class="map-water-label" x="252" y="34">杰斯纳河</text>' +
      '<text class="map-water-label" x="40" y="62">伊尔平河</text>' +
      '</svg>' +
      '</div>' +
      '<ol class="map-legend">' + legend + '</ol>' +
      '<figcaption class="map-caption">第 ' + esc(day) + ' / ' + esc(cs.totalDays) + ' 天 · 战略示意，位置来自本局态势数据，不表示真实兵力、精确战线或可行进路线。</figcaption>' +
      '</figure>';
  }

  /* ---- 战役时间线 ------------------------------------------------
     13 个窗口 + 收束段。过去窗口标出是否留下重大决定，当前窗口高亮，
     每窗口旁标注本局触发的条件事件数量。 */
  function timelineHtml(state, L) {
    if (!state || !state.campaign || !L || !L.campaign) return '';
    const events = (L.campaign.events || []).slice();
    if (!events.length) return '';
    const round = state.round || 1;
    const choices = state.choices || [];
    const keyRounds = {};
    choices.forEach(function (entry) {
      const choice = entry && entry.choice;
      if (!choice || !choice.keyDecision) return;
      keyRounds[entry.round] = true;
    });
    const dynRounds = {};
    const fired = (state.campaign.dyn && state.campaign.dyn.fired) || {};
    Object.keys(fired).forEach(function (id) {
      const r = fired[id];
      dynRounds[r] = (dynRounds[r] || 0) + 1;
    });
    const wrap = state.campaign.wrapup || null;
    const items = events.map(function (event, index) {
      const r = index + 1;
      let cls = '';
      if (r === round) cls = ' is-current';
      else if (r < round) cls = keyRounds[r] ? ' is-decision' : ' is-baseline';
      const note = [];
      if (keyRounds[r]) note.push('重大决定');
      if (dynRounds[r]) note.push('条件事件 ' + dynRounds[r]);
      if (r === round) note.push('本窗口');
      return '<li class="tl-item' + cls + '">' +
        '<span class="tl-date">' + esc(shortDate(event.dateLabel) || ('第 ' + r + ' 窗口')) + '</span>' +
        '<span class="tl-body"><strong>' + esc(event.title || '') + '</strong>' + (note.length ? '<span>' + note.join(' · ') + '</span>' : '') + '</span>' +
        '</li>';
    }).join('');
    let tail = '';
    if (wrap && (wrap.active || wrap.finished)) {
      tail = '<li class="tl-item is-late"><span class="tl-date">收束</span><span class="tl-body"><strong>残局处理</strong><span>' + esc(wrap.dateLabel || '最晚到 4 月 16 日') + '</span></span></li>';
    }
    const ending = state.ending || state.finalEnding;
    if (ending && ending.title) {
      tail += '<li class="tl-item is-ending"><span class="tl-date">结局</span><span class="tl-body"><strong>' + esc(ending.title) + '</strong><span>' + esc(ending.id || '') + '</span></span></li>';
    }
    return '<ol class="tl-list">' + items + tail + '</ol>';
  }

  /* 时间线的日期列只有五十来像素，长句会一个字一行。
     这里把「2 月 24 日 · 凌晨」「3 月 10 日 — 3 月 13 日」压成「2.24」
     「3.10—13」这种档案编号式写法，读起来也更快。 */
  function shortDate(label) {
    const text = String(label || '');
    const nums = text.match(/\d+/g);
    if (!nums || !nums.length) return text;
    if (nums.length >= 4) return nums[0] + '.' + nums[1] + '—' + nums[2] + '.' + nums[3];
    if (nums.length === 3) return nums[0] + '.' + nums[1] + '—' + nums[2];
    if (nums.length === 2 && /月/.test(text)) return nums[0] + '.' + nums[1];
    return text;
  }


  function storyRailHtml(state) {
    const api = (typeof window !== 'undefined' ? window : globalThis).LZS_STORYLINES;
    if (!api || !api.summary) return '';
    const sum = api.summary(state);
    if (!sum || !sum.lines || !sum.lines.length) return '';
    const STATE_WORD = { unexplored: '尚未展开', pending: '正在推进', partial: '走到一半', complete: '已有结论' };
    const items = sum.lines.map(function (line) {
      const meta = lineMeta(line.id) || {};
      return '<li class="story-rail-item' + (line.auxiliary ? ' is-aux' : '') + '" data-line="' + esc(line.id) + '">' +
        '<span class="story-rail-mark" aria-hidden="true">' + emblem(line.id) + '</span>' +
        '<span class="story-rail-text"><strong>' + esc(line.title) + '</strong>' +
        '<span>' + (line.primary ? '主线' : '辅线') + ' · ' + esc(meta.theme || '') + ' · 第 ' + esc(line.seen) + '/' + esc(line.total) + ' 步</span>' +
        '<p>' + esc(line.path && line.path.label ? line.path.label : (STATE_WORD[line.state] || '')) + '</p></span>' +
        '</li>';
    }).join('');
    return '<ul class="story-rail">' + items + '</ul>';
  }

  /* ---- 援助流转 --------------------------------------------------
     七个阶段由真实状态驱动：请求 → 考虑 → 承诺 → 运输 → 抵达 → 分配 → 效果。
     只显示本局真实存在的援助线，不补任何示意数值。 */
  const AID_STAGE_ORDER = ['request', 'considering', 'commitment', 'transport', 'arrival', 'allocation', 'effect'];
  const AID_STAGE_LABEL = { request: '请求', considering: '考虑', commitment: '承诺', transport: '运输', arrival: '抵达', allocation: '分配', effect: '见效' };

  function aidFlowHtml(state, L) {
    if (!state || !L || typeof L.getAidStatus !== 'function') return '';
    const lines = L.getAidStatus(state);
    if (!lines || !lines.length) return '';
    const cards = lines.map(function (line) {
      const reached = Math.max(0, Math.min(AID_STAGE_ORDER.length, Number(line.stage) || 0));
      const cells = AID_STAGE_ORDER.map(function (key, i) {
        const cls = i < reached ? ' is-done' : (i === reached && !line.done ? ' is-current' : '');
        return '<li class="aid-stage' + cls + '"><span>' + (i + 1) + '</span><strong>' + AID_STAGE_LABEL[key] + '</strong></li>';
      }).join('');
      return '<div class="aid-line">' +
        '<div class="aid-line-head"><strong>' + esc(line.title) + '</strong><span>' + esc(line.status || '') + '</span></div>' +
        '<ol class="aid-stages">' + cells + '</ol>' +
        (line.next ? '<p class="aid-next">下一步：' + esc(line.next) + (line.etaRounds != null ? ' · 约 ' + Math.max(1, line.etaRounds) + ' 个窗口' : '') + '</p>' : '') +
        '</div>';
    }).join('');
    return '<div class="aid-flow">' + cards + '</div>';
  }

  /* ---- 关键因果链 ------------------------------------------------
     决定 → 执行机构 → 之后发生的条件事件 → 结局。数据全部取自
     ending.keyChoices / ending.commandChains / state.campaign.dyn，缺失时省略整列。 */
  function causalChainHtml(state, ending, L) {
    if (!ending) return '';
    const keys = (ending.keyChoices || []).slice(0, 4);
    if (!keys.length) return '';
    const commandChains = ending.commandChains || [];
    const fired = (state && state.campaign && state.campaign.dyn && state.campaign.dyn.fired) || {};
    const dynTotal = Object.keys(fired).length;
    const rows = keys.map(function (key) {
      const chain = commandChains.filter(function (c) { return c.choiceId === key.choiceId || c.node === key.node; })[0] || null;
      const agency = chain && chain.agencyLabel ? chain.agencyLabel : (key.agencyLabel || '');
      const later = chain && chain.echoTitle ? chain.echoTitle : (fired[key.choiceId] ? '由此产生后续事务' : '');
      return '<li class="causal-row">' +
        '<span class="causal-decide"><strong>' + esc(key.title || key.label || '') + '</strong><span>' + esc(key.dateLabel || '') + '</span></span>' +
        '<span class="causal-agency">' + esc(agency || '按总统授权执行') + '</span>' +
        '<span class="causal-later">' + esc(later || '后续影响并入状态变化') + '</span>' +
        '</li>';
    }).join('');
    return '<section class="causal-chain"><span class="section-kicker">CAUSAL CHAIN</span><h2>决定是怎么走到结局的</h2>' +
      '<ol class="causal-list">' + rows + '</ol>' +
      '<p class="stat-hint">本局共触发 ' + esc(dynTotal) + ' 条条件事件；它们由上表这些决定及其后果决定，不是随机抽取。</p></section>';
  }

  /* ---- 文件类型识别 ----------------------------------------------
     dispatch 项按来源分成 公文 / 情报 / 剪报 / 电报 / 归档 五种。 */
  function docMeta(item) {
    const type = item && item.type;
    if (type === 'dynamic') return { className: 'doc-wire', label: '条件事件' };
    if (type === 'story') return { className: 'doc-order', label: '故事线文件' };
    if (type === 'late_report' || type === 'resurface') return { className: 'doc-brief', label: '战报' };
    if (type === 'intel' || type === 'obstacle') return { className: 'doc-intel', label: '情报' };
    if (type === 'backlog' || type === 'resource_request') return { className: 'doc-wire', label: '请求' };
    if (type === 'settlement' || type === 'archive') return { className: 'doc-archive', label: '归档' };
    return { className: 'doc-wire', label: '电报' };
  }

  function lineOfItem(item) {
    if (!item) return '';
    if (item.lineId) return item.lineId;
    if (item.replay) return 'line_' + String(item.replay);
    return '';
  }

  return {
    version: VERSION,
    lineMeta: lineMeta,
    lines: LINE_META,
    emblems: EMBLEMS,
    emblem: emblem,
    frontTone: FRONT_TONE,
    projectFront: projectFront,
    mapHtml: mapHtml,
    timelineHtml: timelineHtml,
    storyRailHtml: storyRailHtml,
    aidFlowHtml: aidFlowHtml,
    causalChainHtml: causalChainHtml,
    docMeta: docMeta,
    lineOfItem: lineOfItem,
    shortDate: shortDate,
    aidStages: AID_STAGE_ORDER,
    esc: esc
  };
});
