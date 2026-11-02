/* 结局后历史复盘渲染；不参与游玩，不读取或修改游戏规则。 */
(function (root) {
  'use strict';

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function routeText(game, ids) {
    const records = (game.choices || []).filter(function (item) { return ids.indexOf(item.choiceId) !== -1; });
    if (!records.length) return '本局未签发直接相关文件';
    return records.map(function (item) { return 'R' + item.round + '「' + item.label + '」'; }).join('；');
  }

  function comparisonHtml(game) {
    const rows = [
      ['政府连续性', ['stay', 'relocate', 'split', 'record', 'disperse'], '本阶段核心政府留在基辅并继续运作。其他路线是模拟分支，不是对真实选择的补全。'],
      ['基辅防御', ['counterattack', 'block_runway', 'city_defense', 'air_defense', 'curfew', 'bunker'], '霍斯托梅尔机场反复争夺，基辅周边战斗持续；截至3月2日，基辅仍由乌方控制。'],
      ['外交与谈判', ['aid_call', 'eu', 'weapons', 'talks', 'refuse'], '2月28日举行首轮谈判并签署入盟申请；这不是入盟承诺，禁飞区也未建立。'],
      ['军事压力', ['south', 'east', 'delegate', 'firepower'], '多方向进攻没有因单项命令停止。抵抗、地形、后勤和指挥共同影响推进速度。'],
      ['社会动员', ['address', 'mobilize', 'record', 'arm_citizens', 'unity_gov', 'security_rule'], '总动员和领土防御扩大。动员能增强抵抗，也带来武装平民安全、训练与协调成本。'],
      ['资源与后勤', ['mobilize', 'disperse', 'split', 'south', 'east', 'logistics', 'evacuate', 'requisition'], '燃料、铁路、医疗、弹药和跨境人流压力同时上升；没有单项政策解决整体短缺。']
    ];
    return '<div class="history-table-wrap"><table class="history-table"><caption>本局路线与真实历史的有限对照</caption><thead><tr><th scope="col">维度</th><th scope="col">你的路线</th><th scope="col">历史事实与比较边界</th></tr></thead><tbody>' +
      rows.map(function (row) {
        return '<tr><th scope="row">' + esc(row[0]) + '</th><td>' + esc(routeText(game, row[1])) + '</td><td>' + esc(row[2]) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function timelineHtml(history) {
    return '<ol class="history-timeline">' + history.timeline.map(function (day) {
      return '<li class="history-day">' +
        '<div class="history-day-head"><time datetime="' + esc(day.date) + '">' + esc(day.label) + '</time><h3>' + esc(day.title) + '</h3></div>' +
        '<dl class="history-facts">' +
          '<div class="is-fact"><dt>事实</dt><dd>' + esc(day.fact) + '</dd></div>' +
          '<div class="is-known"><dt>当时已确认</dt><dd>' + esc(day.knownThen) + '</dd></div>' +
          '<div class="is-later"><dt>后来才确认</dt><dd>' + esc(day.confirmedLater) + '</dd></div>' +
          '<div class="is-disputed"><dt>争议 / 不确定性</dt><dd>' + esc(day.disputed) + '</dd></div>' +
          '<div class="is-analysis"><dt>局势意义 · 分析</dt><dd>' + esc(day.significance) + '</dd></div>' +
        '</dl></li>';
    }).join('') + '</ol>';
  }

  function sourcesHtml(sources) {
    return '<ol class="history-sources">' + sources.map(function (source) {
      return '<li><a href="' + esc(source.url) + '" target="_blank" rel="noopener noreferrer">' + esc(source.institution + ' · ' + source.title) + '</a>' +
        '<span class="source-date">发布：' + esc(source.date) + ' · 访问：' + esc(source.accessed) + '</span>' +
        '<p>' + esc(source.supports) + '</p></li>';
    }).join('') + '</ol>';
  }

  function render(game) {
    const history = root.LZS_HISTORY;
    if (!history) return '<section class="history-review"><h2>历史复盘</h2><p>复盘资料未能载入；本局结局和决策记录不受影响。</p></section>';
    return '<section class="history-review" aria-labelledby="history-review-title">' +
      '<header class="history-review-head"><p class="ending-kicker">结局后开放 · AFTER ACTION REVIEW</p>' +
        '<h2 id="history-review-title">' + esc(history.title) + '</h2><p>' + esc(history.intro) + '</p></header>' +
      '<nav class="history-nav" aria-label="复盘章节"><a href="#history-daily">逐日时间线</a><a href="#history-compare">路线对照</a><a href="#history-reflect">历史反思</a><a href="#history-sources">资料来源</a></nav>' +
      '<section id="history-daily" class="history-chapter"><h3>一、逐日时间线 <span>2月24日—3月2日</span></h3>' + timelineHtml(history) + '</section>' +
      '<section id="history-compare" class="history-chapter"><h3>二、玩家路线与真实历史</h3>' + comparisonHtml(game) + '</section>' +
      '<section id="history-reflect" class="history-chapter history-reflection"><h3>三、如何阅读这次模拟</h3>' + history.reflections.map(function (text) { return '<p>' + esc(text) + '</p>'; }).join('') + '</section>' +
      '<section id="history-sources" class="history-chapter"><h3>四、资料来源 <span>' + history.sources.length + ' 条</span></h3><p class="history-source-note">链接指向外部机构网站；断网不影响游戏与已载入的复盘正文。</p>' + sourcesHtml(history.sources) + '</section>' +
    '</section>';
  }

  root.LZS_REVIEW = { render: render };
})(typeof window !== 'undefined' ? window : globalThis);
