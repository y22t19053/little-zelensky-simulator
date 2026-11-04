/* 小泽模拟器 v1.1.1 · 总统工作台
 *
 * 这个文件只做一件事：把「现在到底有什么在等总统」从命令、事务电报、常设授权和
 * 本窗口的决策文件里汇总成一张清单，并说明哪一条现在就该按、哪一条可以延后。
 *
 * 它不产生新规则：不扣 AP、不改条件判断、不触发事件、不写存档。
 * 每一条都直接对应引擎里已有的对象（command / dispatch / choice / standing），
 * 界面按 id 去调用原有的 authorizeCommand / approveDelegated / resolveDispatch 等函数。
 */
(function (root, factory) {
  root.LZS_WORKBENCH = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = root.LZS_WORKBENCH;
}(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var VERSION = '1.1.1';

  /* 待办类别。order 决定先看到什么：先是「不处理就会出事」的，再是「你可以决定」的，
     最后才是「它自己在推进，只需要知道」的。 */
  var KINDS = {
    authorize: { id: 'authorize', tag: '待你授权', order: 10, needsAction: true },
    approval: { id: 'approval', tag: '待你批准', order: 12, needsAction: true },
    blocked: { id: 'blocked', tag: '卡住了', order: 20, needsAction: true },
    feedback: { id: 'feedback', tag: '等你核验', order: 22, needsAction: true },
    decision: { id: 'decision', tag: '待你决定', order: 30, needsAction: true },
    letter: { id: 'letter', tag: '来信等你处理', order: 40, needsAction: true },
    intel: { id: 'intel', tag: '缺少情报', order: 50, needsAction: true },
    running: { id: 'running', tag: '正在办理', order: 60, needsAction: false },
    standing: { id: 'standing', tag: '常设授权', order: 70, needsAction: false },
    optional: { id: 'optional', tag: '可以延后', order: 80, needsAction: false }
  };

  function kindOf(id) { return KINDS[id] || KINDS.optional; }

  function agencyLabel(L, id) {
    var list = (L && L.intel && L.intel.agencies) || [];
    for (var i = 0; i < list.length; i += 1) {
      if (list[i].id === id) return list[i].label;
    }
    return id || '总统办公室';
  }

  function activeCommand(command) {
    return !!command && ['completed', 'cancelled', 'expired'].indexOf(command.status) === -1;
  }

  function windowText(command, round) {
    if (!command.deadlineRound || command.effectsApplied) return '';
    if (round > command.deadlineRound) return '已过执行窗口';
    if (round === command.deadlineRound) return '最后执行窗口就是本窗口';
    return '执行窗口至第 ' + command.deadlineRound + ' 个窗口';
  }

  function push(out, item) {
    var kind = kindOf(item.kind);
    item.order = kind.order;
    item.needsAction = kind.needsAction;
    item.tag = kind.tag;
    if (!item.actions) item.actions = [];
    out.items.push(item);
    if (kind.needsAction) out.needs.push(item);
    else if (item.kind === 'optional') out.soft.push(item);
    else out.watch.push(item);
  }

  /* 命令：待授权 / 待批准是硬门槛——引擎在结束回合时会拒绝还挂着 issued 的命令。 */
  function classifyCommands(state, L, out, ap, briefing) {
    var round = state.round || 1;
    (state.commands || []).filter(activeCommand).forEach(function (command) {
      var atLast = !!(command.deadlineRound && round >= command.deadlineRound && !command.effectsApplied);
      var agency = agencyLabel(L, command.agency);
      var window = windowText(command, round);
      var meta = [agency, window].filter(Boolean).join(' · ');
      if (command.status === 'blocked' && command.blockedCode === 'APPROVAL' && command.delegation) {
        push(out, {
          kind: 'approval', key: 'cmd:' + command.id, ref: { commandId: command.id },
          title: command.title, source: agency,
          body: command.blockedReason || agency + '把办理方案报上来了，等你批准之后才会执行。',
          meta: meta + ' · 批准不耗注意力',
          urgent: atLast,
          actions: [{ type: 'approve', label: '批准办理方案 · 0 AP', commandId: command.id, primary: true, disabled: !briefing }]
        });
        return;
      }
      if (command.status === 'issued') {
        push(out, {
          kind: 'authorize', key: 'cmd:' + command.id, ref: { commandId: command.id },
          title: command.title, source: agency,
          body: '命令已经写好但没有授权，今夜不会执行。授权不耗注意力；也可以改成委派，或者撤回。',
          meta: meta || agency,
          urgent: atLast,
          actions: [
            { type: 'authorize', label: '授权今夜执行 · 0 AP', commandId: command.id, primary: true, disabled: !briefing },
            { type: 'delegate', label: '改为委派办理', commandId: command.id, disabled: !briefing }
          ]
        });
        return;
      }
      if (command.status === 'blocked') {
        push(out, {
          kind: 'blocked', key: 'cmd:' + command.id, ref: { commandId: command.id },
          title: command.title, source: agency,
          body: command.blockedReason || '这项命令卡住了，机构今晚没能推动它。',
          meta: meta + ' · 不追加注意力就按延误处理',
          urgent: atLast,
          actions: [
            { type: 'followup', label: '总统介入推进 · 1 AP', commandId: command.id, primary: true, disabled: !briefing || ap < 1 },
            { type: 'jump', label: '看命令中心', target: 'command-panel' }
          ]
        });
        return;
      }
      if (command.status === 'awaiting_feedback') {
        push(out, {
          kind: 'feedback', key: 'cmd:' + command.id, ref: { commandId: command.id },
          title: command.title, source: agency,
          body: '执行完了，机构在等总统确认结果。不核验也能过，但核验会把实际变化记清楚。',
          meta: meta || agency, urgent: atLast,
          actions: [{ type: 'followup', label: '核验执行反馈 · 1 AP', commandId: command.id, primary: true, disabled: !briefing || ap < 1 }]
        });
        return;
      }
      // executing：不按也不会停，但窗口会关。
      push(out, {
        kind: 'running', key: 'cmd:' + command.id, ref: { commandId: command.id },
        title: command.title, source: agency,
        body: command.effectsApplied ? '已经执行，进入反馈与占用期。' : '机构正在办，不需要你逐日盯。',
        meta: meta, urgent: atLast,
        actions: [{ type: 'jump', label: '看执行进度', target: 'command-panel' }]
      });
    });
  }

  /* 常设授权：只提醒快到期的，不把「已授权」变成新的待办负担。 */
  function classifyStanding(state, L, out) {
    var round = state.round || 1;
    var standing = state.standing || {};
    Object.keys(standing).forEach(function (agencyId) {
      var rec = standing[agencyId];
      if (!rec || !rec.active) return;
      if (typeof rec.expiresRound !== 'number') return;
      if (rec.expiresRound - round > 1) return;
      var left = rec.expiresRound - round;
      push(out, {
        kind: 'standing', key: 'standing:' + agencyId, ref: { agencyId: agencyId },
        title: agencyLabel(L, agencyId) + '的常设授权' + (left <= 0 ? '本窗口到期' : '下个窗口到期'),
        source: '总统授权书',
        body: (rec.scope || '机构职责内的例行事务') + '。到期后这些事务会重新回到你桌上。',
        meta: '已代办 ' + (rec.handled || 0) + ' 项' + (left <= 0 ? ' · 到期不续就自动失效' : ''),
        urgent: left <= 0,
        actions: [{ type: 'ops', label: '去机构协调里续期或撤销', tab: 'agencies' }]
      });
    });
  }

  /* 决策文件：只列现在真的能签的，以及卡在情报上的。AP 不够的不算待办。 */
  function classifyChoices(state, L, out, briefing) {
    if (!L.getEvent || !L.getChoiceStatus) return;
    var event = L.getEvent(state);
    if (!event || !event.choices) return;
    event.choices.forEach(function (choice) {
      var status = L.getChoiceStatus(state, choice.id);
      if (!status || status.state === 'issued') return;
      var preview = L.getCommandPreview ? L.getCommandPreview(state, choice.id) : null;
      var needsIntel = !!(preview && preview.requiresIntel && !preview.intelSatisfied);
      var apLabel = choice.ap ? (choice.ap + ' AP') : '0 AP';
      if (status.canIssue) {
        push(out, {
          kind: 'decision', key: 'choice:' + choice.id, ref: { choiceId: choice.id },
          title: choice.title,
          source: (choice.keyDecision ? '重大决策 · ' : '') + agencyLabel(L, choice.agency),
          body: choice.summary || '',
          meta: choice.ap + ' 点注意力' + (choice.keyDecision && choice.keyDecision.irreversible ? ' · 签发后不可逆' : '') + (choice.delayed && choice.delayed.length ? ' · 含延迟后果' : ''),
          urgent: false,
          ap: choice.ap,
          actions: [{ type: 'choice', label: '打开文件评估 · ' + apLabel, choiceId: choice.id, primary: true, disabled: !briefing }]
        });
        return;
      }
      if (needsIntel) {
        push(out, {
          kind: 'intel', key: 'choice:' + choice.id, ref: { choiceId: choice.id },
          title: choice.title, source: agencyLabel(L, choice.agency),
          body: '这项命令要先把情报问清楚，否则授权了也不会执行。',
          meta: '追问总参不耗注意力',
          urgent: false,
          actions: [{ type: 'intel', label: '去情报桌追问总参', category: 'military', primary: true }]
        });
      }
    });
  }

  /* 事务电报：有实际处置动作的进待办；纯告知的留在「其他来信」里。 */
  function classifyDispatches(state, L, out, ap, briefing) {
    var list = L.getDispatches ? L.getDispatches(state) : [];
    list.forEach(function (item) {
      var options = item.options || [];
      var payable = options.filter(function (option) { return (option.ap || 0) > 0 && (option.ap || 0) <= ap; });
      var free = options.filter(function (option) { return !(option.ap || 0); });
      var actions = deliverActions(item, options, ap, briefing);
      if (!options.length) {
        push(out, {
          kind: 'optional', key: 'dispatch:' + item.id, ref: { dispatchId: item.id },
          title: item.title, source: item.source || item.kicker || '总统办公室',
          body: item.body || '', meta: '只需要过目', urgent: false,
          actions: actions
        });
        return;
      }
      if (payable.length) {
        push(out, {
          kind: 'letter', key: 'dispatch:' + item.id, ref: { dispatchId: item.id },
          title: item.title, source: item.source || item.kicker || '总统办公室',
          body: item.body || '',
          meta: '最多 ' + Math.min.apply(null, payable.map(function (option) { return option.ap; })) + ' 点注意力 · 不处理则按默认处理',
          urgent: !!item.urgent, ap: payable[0].ap,
          actions: actions
        });
        return;
      }
      if (free.length > 1) {
        push(out, {
          kind: 'letter', key: 'dispatch:' + item.id, ref: { dispatchId: item.id },
          title: item.title, source: item.source || item.kicker || '总统办公室',
          body: item.body || '', meta: '不耗注意力，但要你选一句回话', urgent: false,
          actions: actions
        });
        return;
      }
      push(out, {
        kind: 'optional', key: 'dispatch:' + item.id, ref: { dispatchId: item.id },
        title: item.title, source: item.source || item.kicker || '总统办公室',
        body: item.body || '', meta: '可以延后，明早的日报会说明后果', urgent: false,
        actions: actions
      });
    });
  }

  function deliverActions(item, options, ap, briefing) {
    var actions = [];
    options.forEach(function (option, index) {
      var cost = option.ap || 0;
      var disabled = cost > ap || !briefing;
      actions.push({
        type: 'dispatch', label: option.label, dispatchId: item.id, optionId: option.id,
        primary: index === 0 && cost > 0, disabled: disabled,
        note: cost ? cost + ' AP' : '不耗注意力'
      });
    });
    return actions;
  }

  function situationOf(state, L) {
    var event = L.getEvent ? L.getEvent(state) : null;
    var campaign = L.getCampaignStatus ? L.getCampaignStatus(state) : null;
    var alarms = L.getAlarms ? L.getAlarms(state) : [];
    var alarm = alarms.filter(function (item) { return item.level === 'critical'; })[0] || alarms[0] || null;
    return {
      dateLabel: event ? event.dateLabel : '',
      windowText: campaign ? '窗口 ' + state.round + ' / ' + campaign.windows + ' · 第 ' + campaign.day + ' / ' + campaign.totalDays + ' 天' : '第 ' + state.round + ' 回合',
      actTitle: campaign && campaign.act ? String(campaign.act.title).split(' · ')[0] : '',
      line: event && event.situation && event.situation.length ? String(event.situation[0]).split('。')[0] + '。' : '',
      keyStat: alarm ? { label: alarm.label, value: alarm.value, level: alarm.level } : null,
      ap: state.ap,
      apMax: state.apMax
    };
  }

  /* 结束窗口前必须知道的事：引擎会拒绝的情况单独说清楚，别的只是提醒。 */
  function endWindowBlockers(state, L) {
    var round = state.round || 1;
    var blockers = [];
    var unauthorized = (state.commands || []).filter(function (command) {
      return command.round === round && command.status === 'issued';
    });
    if (unauthorized.length) {
      blockers.push({
        code: 'UNAUTHORIZED',
        text: '本轮签下的 ' + unauthorized.length + ' 项命令还没有授权，今晚它们不会执行。先在上面授权或委派。',
        commandIds: unauthorized.map(function (command) { return command.id; })
      });
    }
    if (!(state.executed || []).length && (state.ap || 0) >= (state.apMax || 3)) {
      blockers.push({
        code: 'NO_CHOICE',
        text: '这个窗口还没有做出任何决定。至少签发一份文件，或者把注意力用在处理既有事务上。'
      });
    }
    return blockers;
  }

  /* 计数在任何阶段都要有：结算阶段渲染工作台头部也要读 counts。 */
  function tally(out) {
    out.counts = {
      total: out.items.length,
      needs: out.needs.length,
      watch: out.watch.length,
      soft: out.soft.length,
      urgent: out.items.filter(function (item) { return item.urgent; }).length
    };
    return out;
  }

  function classify(state, L) {
    var out = { items: [], needs: [], watch: [], soft: [], ap: 0, apMax: 0, phase: '', briefing: false, situation: null, blockers: [], counts: { total: 0, needs: 0, watch: 0, soft: 0, urgent: 0 } };
    if (!state || !L) return out;
    out.ap = state.ap || 0;
    out.apMax = state.apMax || 0;
    out.phase = state.phase || '';
    out.briefing = state.phase === 'briefing';
    out.situation = situationOf(state, L);
    if (!out.briefing) return tally(out);
    classifyCommands(state, L, out, out.ap, out.briefing);
    if (L.isCampaign && L.isCampaign(state)) {
      classifyStanding(state, L, out);
    }
    classifyChoices(state, L, out, out.briefing);
    classifyDispatches(state, L, out, out.ap, out.briefing);
    out.blockers = endWindowBlockers(state, L);
    var byOrder = function (a, b) {
      if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
      if (a.order !== b.order) return a.order - b.order;
      return String(a.key).localeCompare(String(b.key));
    };
    out.items.sort(byOrder);
    out.needs.sort(byOrder);
    out.watch.sort(byOrder);
    out.soft.sort(byOrder);
    return tally(out);
  }

  /* 结束窗口时的一句话：说清楚还剩什么，不说教。 */
  function endWindowNote(view) {
    if (!view) return '';
    if (view.blockers.length) return view.blockers[0].text;
    if (!view.counts.needs) return '没有必须由你现在处理的事，可以直接结束这个窗口。';
    var urgent = view.items.filter(function (item) { return item.urgent; });
    if (urgent.length) return '还有 ' + view.counts.needs + ' 项等你处理，其中 ' + urgent.length + ' 项过了本窗口就来不及。';
    return '还有 ' + view.counts.needs + ' 项等你处理；不处理也可以结束窗口，后果会在明早的日报里出现。';
  }

  return {
    version: VERSION,
    kinds: KINDS,
    kindOf: kindOf,
    agencyLabel: agencyLabel,
    classify: classify,
    endWindowBlockers: endWindowBlockers,
    endWindowNote: endWindowNote,
    situationOf: situationOf
  };
}));
