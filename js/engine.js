/*
 * 小泽模拟器 · 纯逻辑引擎
 * ------------------------------------------------------------------
 * 这个文件不接触 DOM，负责：AP、国家状态、战争压力、延迟效果、
 * 结局判定与存档。浏览器里挂在 window.LZS；Node 测试里挂在 globalThis.LZS。
 */
(function (root) {
  'use strict';

  const EVENTS = root.LZS_EVENTS || [];
  const META = root.LZS_META || {};
  const VERSION = 1;
  const SAVE_KEY = 'lzs_save_v1';
  const AP_MAX = META.apPerRound || 3;
  const FINAL_ROUND = EVENTS.length;

  const STAT_KEYS = ['gov', 'army', 'kyiv', 'will', 'intl', 'reserve', 'safety'];
  const STAT_META = {
    gov: { label: '政府连续性', short: '政府', hint: '行政链条、命令传递与决策稳定' },
    army: { label: '军队组织度', short: '军队', hint: '部队编制、指挥与持续作战能力' },
    kyiv: { label: '基辅安全', short: '基辅', hint: '首都防御、城市运转与政治中心安全' },
    will: { label: '社会抵抗意志', short: '意志', hint: '动员、民心与承受长期压力的意愿' },
    intl: { label: '国际支持', short: '国际', hint: '外交空间、援助与盟友政治支持' },
    reserve: { label: '战略储备', short: '储备', hint: '燃料、弹药、医疗与后勤余量' },
    safety: { label: '总统个人安全', short: '安全', hint: '人身安全、指挥所暴露与安保余量' }
  };

  const FINAL_THRESHOLDS = {
    held: { gov: 50, kyiv: 36, army: 36, will: 42, intl: 40, reserve: 24, safety: 15 },
    costly: { gov: 32, kyiv: 20, army: 22, will: 28, safety: 1 },
    // “空壳般的存续”不再由单一短板触发：至少两项系统跌破这条线，才说明
    // 国家机器是同时失去余量，而不是某一项指标拖了后腿。
    hollow: { gov: 38, kyiv: 26, army: 28, will: 32, intl: 24, reserve: 18, safety: 12 }
  };

  const COLLAPSE_LINES = {
    president: 10,
    government: 25,
    kyiv: 12,
    military: 15,
    will: 20,
    diplomatic: 10,
    logistics: 8
  };

  function clamp(value, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, Math.round(n)));
  }

  function statLabel(key) {
    return STAT_META[key] ? STAT_META[key].label : key;
  }

  function pressureLabel(value) {
    if (value >= 90) return '临界';
    if (value >= 75) return '极高';
    if (value >= 55) return '高';
    if (value >= 35) return '中';
    return '低';
  }

  function addLog(state, type, title, text) {
    state.log.push({
      round: state.round,
      dateLabel: EVENTS[state.round - 1] ? EVENTS[state.round - 1].dateLabel : '',
      type: type,
      title: title,
      text: text || ''
    });
    if (state.log.length > 160) state.log.shift();
  }

  function getEvent(state) {
    return EVENTS[state.round - 1] || null;
  }

  function getChoice(event, choiceId) {
    if (!event) return null;
    for (let i = 0; i < event.choices.length; i += 1) {
      if (event.choices[i].id === choiceId) return event.choices[i];
    }
    return null;
  }

  function isChoiceExecuted(state, choiceId) {
    return state.executed.indexOf(choiceId) !== -1;
  }

  function canAfford(state, choice) {
    return !!choice && state.ap >= choice.ap && !isChoiceExecuted(state, choice.id);
  }

  /*
   * 冲突命令：同一事件里，同一 exclusiveGroup 的选项只能签发一个。
   * 这不是 UI 限制，而是决策本身的取舍；引擎在扣 AP 之前必须拒绝。
   */
  function getExclusiveConflict(state, choice) {
    if (!state || !choice || !choice.exclusiveGroup) return null;
    const event = getEvent(state);
    if (!event) return null;
    for (let i = 0; i < state.executed.length; i += 1) {
      const executed = getChoice(event, state.executed[i]);
      if (executed && executed.id !== choice.id && executed.exclusiveGroup === choice.exclusiveGroup) {
        return executed;
      }
    }
    return null;
  }

  function getChoiceStatus(state, choiceId) {
    const event = getEvent(state);
    const choice = getChoice(event, choiceId);
    if (!choice) {
      return { canIssue: false, state: 'missing', message: '未找到这项决策。', conflict: null };
    }
    if (isChoiceExecuted(state, choice.id)) {
      return { canIssue: false, state: 'issued', message: '这项命令已经签发。', conflict: null };
    }
    const conflict = getExclusiveConflict(state, choice);
    if (conflict) {
      return {
        canIssue: false,
        state: 'conflict',
        message: '与已签发的「' + conflict.title + '」互斥，不能同时执行。',
        conflict: conflict
      };
    }
    if (state.ap < choice.ap) {
      return {
        canIssue: false,
        state: 'ap',
        message: '注意力不足：这项命令需要 ' + choice.ap + ' AP，当前只剩 ' + state.ap + ' AP。',
        conflict: null
      };
    }
    return { canIssue: true, state: 'available', message: '', conflict: null };
  }

  function getAvailableChoices(state) {
    const event = getEvent(state);
    if (!event) return [];
    return event.choices.filter(function (choice) {
      return getChoiceStatus(state, choice.id).canIssue;
    });
  }

  function createGame() {
    const stats = {};
    STAT_KEYS.forEach(function (key) {
      stats[key] = clamp(META.initialStats[key], 0, 100);
    });
    const state = {
      version: VERSION,
      round: 1,
      ap: AP_MAX,
      apMax: AP_MAX,
      stats: stats,
      pressure: clamp(META.startPressure, 0, 100),
      flags: {},
      executed: [],
      choices: [],
      pending: [],
      resolved: [],
      log: [],
      phase: 'briefing',
      interlude: null,
      ending: null,
      startedAt: new Date().toISOString()
    };
    addLog(state, 'system', '行动开始', '2月24日凌晨，最高统帅部进入战时状态。你有 3 点注意力，用来决定这个国家先处理什么。');
    return state;
  }

  /*
   * 应用一组效果，返回实际发生的增量（会受 0—100 边界影响）。
   * 这是所有状态变化的唯一入口；AP 不在这里扣。
   */
  function applyEffectValues(state, effects) {
    const deltas = {};
    let pressureDelta = 0;
    if (!effects) return { deltas: deltas, pressureDelta: pressureDelta };

    STAT_KEYS.forEach(function (key) {
      if (typeof effects[key] === 'number') {
        const before = state.stats[key];
        const after = clamp(before + effects[key], 0, 100);
        if (after !== before) deltas[key] = after - before;
        state.stats[key] = after;
      }
    });

    if (typeof effects.pressure === 'number') {
      const before = state.pressure;
      const after = clamp(before + effects.pressure, 0, 100);
      pressureDelta = after - before;
      state.pressure = after;
    }

    return { deltas: deltas, pressureDelta: pressureDelta };
  }

  function scheduleDelayed(state, event, choice) {
    if (!choice.delayed || !choice.delayed.length) return [];
    const scheduled = [];
    choice.delayed.forEach(function (item, index) {
      const dueRound = state.round + (item.delay || 1);
      const record = {
        id: event.id + ':' + choice.id + ':' + index,
        sourceEventId: event.id,
        sourceChoiceId: choice.id,
        sourceLabel: choice.title,
        dueRound: dueRound,
        label: item.label,
        note: item.note || '',
        effects: Object.assign({}, item.effects || {})
      };
      state.pending.push(record);
      scheduled.push(record);
    });
    return scheduled;
  }

  function formatDeltaText(deltas, pressureDelta) {
    const parts = [];
    STAT_KEYS.forEach(function (key) {
      if (deltas[key]) {
        parts.push(statLabel(key) + (deltas[key] > 0 ? ' +' : ' ') + deltas[key]);
      }
    });
    if (pressureDelta) {
      parts.push('战争压力' + (pressureDelta > 0 ? ' +' : ' ') + pressureDelta);
    }
    return parts.length ? parts.join('；') : '状态未发生可测量的变化';
  }

  function applyChoice(state, choiceId) {
    if (!state || state.phase !== 'briefing') {
      return { ok: false, error: '当前阶段不能签发决策。', code: 'PHASE' };
    }
    const event = getEvent(state);
    const choice = getChoice(event, choiceId);
    if (!choice) return { ok: false, error: '未找到这项决策。', code: 'NOT_FOUND' };
    if (isChoiceExecuted(state, choiceId)) {
      return { ok: false, error: '这项决策本回合已经签发，不能重复结算。', code: 'DUPLICATE' };
    }
    const conflict = getExclusiveConflict(state, choice);
    if (conflict) {
      return {
        ok: false,
        error: '与已签发的「' + conflict.title + '」互斥，不能同时执行。',
        code: 'CONFLICT',
        conflict: conflict
      };
    }
    if (state.ap < choice.ap) {
      return { ok: false, error: '注意力不足：这项决策需要 ' + choice.ap + ' AP。', code: 'AP' };
    }

    state.ap -= choice.ap;
    state.executed.push(choice.id);

    const result = applyEffectValues(state, choice.effects);
    if (choice.flags && choice.flags.length) {
      choice.flags.forEach(function (flag) { state.flags[flag] = true; });
    }
    const scheduled = scheduleDelayed(state, event, choice);

    const record = {
      round: state.round,
      dateLabel: event.dateLabel,
      eventId: event.id,
      eventTitle: event.title,
      choiceId: choice.id,
      label: choice.title,
      ap: choice.ap,
      deltas: result.deltas,
      pressureDelta: result.pressureDelta,
      scheduled: scheduled.map(function (item) { return item.label; })
    };
    state.choices.push(record);

    addLog(
      state,
      'decision',
      '签发：' + choice.title,
      '消耗 ' + choice.ap + ' AP。' + formatDeltaText(result.deltas, result.pressureDelta)
    );

    let ending = checkCollapse(state);
    if (ending) {
      return { ok: true, choice: choice, deltas: result.deltas, pressureDelta: result.pressureDelta, ending: finalizeEnding(state, ending) };
    }
    return {
      ok: true,
      choice: choice,
      deltas: result.deltas,
      pressureDelta: result.pressureDelta,
      available: getAvailableChoices(state).length,
      ending: null
    };
  }

  function calculateAttrition(pressure, flags) {
    const attrition = {};
    const p = clamp(pressure, 0, 100);
    const f = flags || {};
    attrition.kyiv = -(2 + Math.floor(p / 18));
    attrition.army = -(1 + Math.floor(p / 28));
    attrition.reserve = -(1 + Math.floor(p / 22));
    if (p >= 45) attrition.will = -1;
    if (p >= 70) attrition.will = -2;
    if (p >= 55) attrition.gov = -1;
    if (p >= 80) attrition.gov = -2;
    attrition.safety = 0;
    if (p >= 45) attrition.safety -= 1;
    if (f.stay_kyiv) attrition.safety -= 1;
    if (f.armed_citizens && p >= 55) attrition.safety -= 1;
    return attrition;
  }

  function getPressureForecast(state) {
    if (!state) return null;
    const event = getEvent(state);
    const nextPressure = clamp(state.pressure + (event ? event.pressureRise : 0), 0, 100);
    const attrition = calculateAttrition(nextPressure, state.flags);
    return {
      current: state.pressure,
      rise: event ? event.pressureRise : 0,
      next: nextPressure,
      level: pressureLabel(nextPressure),
      attrition: attrition
    };
  }

  function resolveDueDelayed(state, round) {
    const due = state.pending.filter(function (item) { return item.dueRound <= round; });
    if (!due.length) return [];
    state.pending = state.pending.filter(function (item) { return item.dueRound > round; });

    return due.map(function (item) {
      const result = applyEffectValues(state, item.effects);
      const applied = {
        id: item.id,
        dueRound: item.dueRound,
        appliedRound: round,
        sourceEventId: item.sourceEventId,
        sourceLabel: item.sourceLabel,
        label: item.label,
        note: item.note,
        deltas: result.deltas,
        pressureDelta: result.pressureDelta
      };
      state.resolved.push(applied);
      addLog(
        state,
        'delayed',
        '延迟后果：' + item.label,
        (item.note ? item.note + ' ' : '') + formatDeltaText(result.deltas, result.pressureDelta)
      );
      return applied;
    });
  }

  function getAlarms(state) {
    const alarms = [];
    if (state.stats.gov <= 25) alarms.push({ key: 'gov', label: '政府连续性', value: state.stats.gov, level: 'critical' });
    else if (state.stats.gov <= 35) alarms.push({ key: 'gov', label: '政府连续性', value: state.stats.gov, level: 'warning' });
    if (state.stats.kyiv <= 25) alarms.push({ key: 'kyiv', label: '基辅安全', value: state.stats.kyiv, level: 'critical' });
    else if (state.stats.kyiv <= 35) alarms.push({ key: 'kyiv', label: '基辅安全', value: state.stats.kyiv, level: 'warning' });
    if (state.stats.army <= 25) alarms.push({ key: 'army', label: '军队组织度', value: state.stats.army, level: 'critical' });
    if (state.stats.will <= 25) alarms.push({ key: 'will', label: '社会抵抗意志', value: state.stats.will, level: 'critical' });
    if (state.stats.safety <= 25) alarms.push({ key: 'safety', label: '总统个人安全', value: state.stats.safety, level: 'critical' });
    if (state.stats.intl <= 18) alarms.push({ key: 'intl', label: '国际支持', value: state.stats.intl, level: 'critical' });
    else if (state.stats.intl <= 28) alarms.push({ key: 'intl', label: '国际支持', value: state.stats.intl, level: 'warning' });
    if (state.stats.reserve <= 14) alarms.push({ key: 'reserve', label: '战略储备', value: state.stats.reserve, level: 'critical' });
    else if (state.stats.reserve <= 24) alarms.push({ key: 'reserve', label: '战略储备', value: state.stats.reserve, level: 'warning' });
    if (state.pressure >= 85) alarms.push({ key: 'pressure', label: '战争压力', value: state.pressure, level: 'critical' });
    else if (state.pressure >= 70) alarms.push({ key: 'pressure', label: '战争压力', value: state.pressure, level: 'warning' });
    return alarms;
  }

  function endRound(state) {
    if (!state || state.phase !== 'briefing') {
      return { ok: false, error: '当前阶段不能结束回合。', code: 'PHASE' };
    }
    if (!state.executed.length) {
      return { ok: false, error: '至少签发一项决策，才能结束本回合。', code: 'NO_CHOICE' };
    }
    const event = getEvent(state);
    if (!event) return { ok: false, error: '事件数据缺失。', code: 'EVENT' };

    const pressureBefore = state.pressure;
    const pressureRise = event.pressureRise;
    state.pressure = clamp(state.pressure + pressureRise, 0, 100);
    const attrition = calculateAttrition(state.pressure, state.flags);
    const attritionResult = applyEffectValues(state, attrition);

    addLog(
      state,
      'pressure',
      '战争压力上升',
      '压力 +' + pressureRise + '，达到 ' + state.pressure + '（' + pressureLabel(state.pressure) + '）。'
    );
    if (Object.keys(attritionResult.deltas).length) {
      addLog(state, 'attrition', '压力侵蚀', formatDeltaText(attritionResult.deltas, 0));
    }

    let ending = checkCollapse(state);
    if (!ending && state.round >= FINAL_ROUND) {
      ending = evaluateFinal(state);
    }
    if (ending) {
      finalizeEnding(state, ending);
      return {
        ok: true,
        ending: state.ending,
        pressure: { before: pressureBefore, rise: pressureRise, after: state.pressure },
        attrition: attritionResult.deltas
      };
    }

    state.round += 1;
    state.ap = state.apMax;
    state.executed = [];
    const delayed = resolveDueDelayed(state, state.round);

    ending = checkCollapse(state);
    if (ending) {
      finalizeEnding(state, ending);
      return {
        ok: true,
        ending: state.ending,
        pressure: { before: pressureBefore, rise: pressureRise, after: state.pressure },
        attrition: attritionResult.deltas,
        delayed: delayed
      };
    }

    const delayedPressure = delayed.reduce(function (sum, item) {
      return sum + (item.pressureDelta || 0);
    }, 0);

    state.phase = 'interlude';
    state.interlude = {
      round: state.round,
      dateLabel: EVENTS[state.round - 1].dateLabel,
      pressure: {
        before: pressureBefore,
        rise: pressureRise,
        delayed: delayedPressure,
        after: state.pressure
      },
      attrition: attritionResult.deltas,
      delayed: delayed,
      alarms: getAlarms(state),
      ap: state.ap
    };
    return {
      ok: true,
      ending: null,
      interlude: state.interlude,
      pressure: state.interlude.pressure,
      attrition: attritionResult.deltas,
      delayed: delayed
    };
  }

  function continueFromInterlude(state) {
    if (!state || state.phase !== 'interlude') {
      return { ok: false, error: '当前没有待确认的夜间态势。', code: 'PHASE' };
    }
    state.phase = 'briefing';
    state.interlude = null;
    return { ok: true, event: getEvent(state) };
  }

  function checkCollapse(state) {
    const s = state.stats;
    if (s.safety <= 10) return buildEnding(state, 'president');
    if (s.gov <= 25) return buildEnding(state, 'government');
    if (s.kyiv <= 12) return buildEnding(state, 'kyiv');
    if (s.army <= 15) return buildEnding(state, 'military');
    if (s.will <= 20) return buildEnding(state, 'will');
    if (s.intl <= COLLAPSE_LINES.diplomatic) return buildEnding(state, 'diplomatic');
    if (s.reserve <= COLLAPSE_LINES.logistics) return buildEnding(state, 'logistics');
    if (state.pressure >= 100) return buildEnding(state, 'overload');
    return null;
  }

  function evaluateFinal(state) {
    const s = state.stats;
    const t = FINAL_THRESHOLDS.held;
    const held =
      s.gov >= t.gov &&
      s.kyiv >= t.kyiv &&
      s.army >= t.army &&
      s.will >= t.will &&
      s.intl >= t.intl &&
      s.reserve >= t.reserve &&
      s.safety >= t.safety &&
      state.pressure < 95;
    if (held) return buildEnding(state, 'held');

    const h = FINAL_THRESHOLDS.hollow;
    const severe = STAT_KEYS.filter(function (key) {
      return s[key] < h[key];
    });
    if (severe.length >= 2) {
      const ending = buildEnding(state, 'hollow');
      ending.severeKeys = severe;
      return ending;
    }

    return buildEnding(state, 'costly');
  }

  function finalizeEnding(state, ending) {
    ending.finalStats = Object.assign({}, state.stats);
    ending.finalPressure = state.pressure;
    ending.finalRound = state.round;
    ending.keyChoices = state.choices.slice();
    ending.chain = state.resolved.slice();
    ending.disclaimer = META.disclaimer;
    ending.meta = {
      title: META.title,
      subtitle: META.subtitle,
      tagline: META.tagline,
      version: META.version
    };
    state.phase = 'ending';
    state.ending = ending;
    state.interlude = null;
    addLog(state, 'ending', '阶段判定：' + ending.title, ending.verdict);
    return ending;
  }

  function buildEnding(state, id) {
    const s = state.stats;
    const p = state.pressure;
    const flags = state.flags;
    const base = {
      id: id,
      tone: 'danger',
      kicker: '阶段判定 · 结局',
      title: '',
      verdict: '',
      epilogue: [],
      reasons: [],
      flags: Object.assign({}, flags)
    };

    const stay = !!flags.stay_kyiv;
    const relocated = !!flags.relocated;
    const armed = !!flags.armed_citizens;
    const talks = !!flags.talks;
    base.severeKeys = STAT_KEYS.filter(function (key) {
      return s[key] < FINAL_THRESHOLDS.hollow[key];
    });
    base.severeCount = base.severeKeys.length;

    if (id === 'president') {
      base.title = '总统失联';
      base.kicker = '紧急判定 · 指挥链中断';
      base.verdict = '总统个人安全归零。国家在最需要连续性的时刻失去最高决策者。';
      base.epilogue = [
        stay
          ? '你选择留在班科夫街。公开露面稳住了最初几天的士气，也让安保团队不得不在已知的街区与固定路线之间反复转移。最后一次通讯中断后，警卫与总统办公室失去联系。'
          : '你试图在可见性与安全之间维持平衡。但指挥所的位置、通信链路和转移路线仍然被压缩到极限。最后一次通讯中断后，权力交接程序被迫启动。',
        '继任者会面对一个仍在运转、却突然失去政治中心的政府。前线不会因为权力真空而暂停，盟友也会先观望，再决定是否继续承诺。'
      ];
      base.reasons = [
        '总统个人安全降至 10 或以下。',
        '本局结束时战争压力为 ' + p + '，国家状态为：政府 ' + s.gov + ' / 军队 ' + s.army + ' / 基辅 ' + s.kyiv + '。'
      ];
    } else if (id === 'government') {
      base.title = '政府连续性崩溃';
      base.kicker = '紧急判定 · 行政链条断裂';
      base.verdict = '政府连续性跌破维持运转的最低线。命令还在签发，但已经无法可靠抵达执行者。';
      base.epilogue = [
        relocated
          ? '你把核心班子迁往西部，保住了人身安全，却让基辅与西部之间出现了两套节奏。文件、授权与战场需求在不同城市之间来回，最终没有任何一方能完整掌握局势。'
          : '分散办公、联合内阁与反复调整的指挥关系，曾经避免了单点瘫痪，也把协调成本推到了临界点。各部委开始按自己的优先级行动，中央的签字不再等于执行。',
        '地方机构仍在运转，军队仍在抵抗，但“政府”作为一台能做出并执行决定的机器，已经失去连续性。外部盟友会把这视为比战场失利更难修复的信号。'
      ];
      base.reasons = [
        '政府连续性降至 25 或以下。',
        '本局结束时战争压力为 ' + p + '，战略储备 ' + s.reserve + '，国际支持 ' + s.intl + '。'
      ];
    } else if (id === 'kyiv') {
      base.title = '基辅陷落';
      base.kicker = '紧急判定 · 首都防御失败';
      base.verdict = '基辅安全归零。首都不再能作为政治中心、指挥节点和象征性防线同时运转。';
      base.epilogue = [
        armed
          ? '你向市民发放了武器，城市在最初几天表现出惊人的抵抗意愿。但武器管控、指挥协调与后勤没有跟上，街区防御很快碎片化。基辅的失守不是某一栋楼被攻占，而是整座城市无法再被组织起来。'
          : '你在机场、北郊与城区之间反复调配有限的兵力。防线被拉长，补给线被压缩，最终没有一个方向得到足够的纵深。基辅的失守让政治象征与军事指挥同时失去支点。',
        '政府可以迁往西部继续存在，军队也可以在别的方向继续作战。但首都的陷落会改变盟友的风险判断，也会改变国内对“还能撑多久”的预期。'
      ];
      base.reasons = [
        '基辅安全降至 12 或以下。',
        '本局结束时军队组织度 ' + s.army + '，战略储备 ' + s.reserve + '，战争压力 ' + p + '。'
      ];
    } else if (id === 'military') {
      base.title = '军队失去组织';
      base.kicker = '紧急判定 · 军事组织能力崩溃';
      base.verdict = '军队组织度跌破维持战役协同的最低线。部队仍在抵抗，但已无法形成统一的防御。';
      base.epilogue = [
        '总动员扩大了兵力，也把训练、装备和指挥骨干的缺口一并放大。机场反击、东部死守与多线增援消耗了最宝贵的机动部队。到本阶段后段，许多单位仍在战斗，却不知道邻近阵地由谁负责。',
        '基辅可能还没有被包围，政府也可能仍在运转。但没有组织度的抵抗，会把每一座城市变成孤立的战场。'
      ];
      base.reasons = [
        '军队组织度降至 15 或以下。',
        '本局结束时基辅安全 ' + s.kyiv + '，战略储备 ' + s.reserve + '，战争压力 ' + p + '。'
      ];
    } else if (id === 'will') {
      base.title = '抵抗意志瓦解';
      base.kicker = '紧急判定 · 社会动员失效';
      base.verdict = '社会抵抗意志跌破维持动员的最低线。政府仍在，但社会不再响应它的号召。';
      base.epilogue = [
        '连续的空袭、宵禁、征用与撤离，把最初几天的凝聚力消耗殆尽。地方官员开始优先处理本地的生存问题，志愿者网络失去协调，征召通知得不到响应。',
        talks
          ? '你曾尝试用谈判换取时间。谈判没有带来停火，却让社会相信政府在寻找退出路径。当抵抗的代价继续上升时，这种预期迅速转化为对继续战斗的怀疑。'
          : '你拒绝了很多退让，也守住了公开立场。但意志不是无限的资源，当生活条件、伤亡与不确定感同时累积，坚持本身也会变成一种负担。',
        '军队可能还有弹药，政府可能还有命令，但没有人愿意再为这些命令承担代价。'
      ];
      base.reasons = [
        '社会抵抗意志降至 20 或以下。',
        '本局结束时政府连续性 ' + s.gov + '，国际支持 ' + s.intl + '，战争压力 ' + p + '。'
      ];
    } else if (id === 'overload') {
      base.title = '国家指挥体系过载';
      base.kicker = '紧急判定 · 压力超过上限';
      base.verdict = '战争压力达到 100。不是某一个部门崩溃，而是整个决策系统同时失去余量。';
      base.epilogue = [
        '前线要增援，城市要疏散，盟友要保证，部门要资源。每一件事都紧急，每一件事都需要你签字。当压力超过系统能处理的上限，优先级本身失效了。',
        '命令仍在发出，但没有人能确认它们是否还适用于当下的战场。国家没有在某一刻投降，只是在同一时刻失去了对太多事情的控制。'
      ];
      base.reasons = [
        '战争压力达到 100。',
        '本局结束时政府 ' + s.gov + ' / 军队 ' + s.army + ' / 基辅 ' + s.kyiv + ' / 意志 ' + s.will + '。'
      ];
    } else if (id === 'diplomatic') {
      base.title = '外交空间坍塌';
      base.kicker = '紧急判定 · 国际支持断裂';
      base.verdict = '国际支持跌破维持外部援助的最低线。政府还在，但盟友开始把承诺换成观望。';
      base.epilogue = [
        '你反复要求武器、资金与政治背书，却没有足够的战场结果或内部协调去证明这些承诺可以被兑现。盟友不愿在一个看不清前景的政府身上继续加注，援助开始延迟、缩水，附带更多条件。',
        '外部支持不是慈善。当它退潮时，前线的弹药、财政与外交空间会同时收紧。你仍然可以签发命令，只是越来越少的命令能改变外部世界的行为。'
      ];
      base.reasons = [
        '国际支持降至 ' + COLLAPSE_LINES.diplomatic + ' 或以下。',
        '本局结束时政府 ' + s.gov + ' / 军队 ' + s.army + ' / 基辅 ' + s.kyiv + '，战争压力 ' + p + '。'
      ];
    } else if (id === 'logistics') {
      base.title = '后勤链条断裂';
      base.kicker = '紧急判定 · 战略储备耗尽';
      base.verdict = '战略储备跌破维持运转的最低线。部队仍在阵地上，但燃料、弹药与医疗物资已经无法按优先级送达。';
      base.epilogue = [
        '你曾经用储备换取时间：多守一个机场、多撑一夜宵禁、多维持一条补给线。但储备不是无限的，当它跌到临界点，前线的选择会从“守哪里”变成“放弃哪里”。',
        '政府可以继续发文件，军队可以继续报告，城市也可以继续等待。但没有物资的承诺，很快会变成新的政治问题。'
      ];
      base.reasons = [
        '战略储备降至 ' + COLLAPSE_LINES.logistics + ' 或以下。',
        '本局结束时军队 ' + s.army + ' / 基辅 ' + s.kyiv + ' / 国际 ' + s.intl + '，战争压力 ' + p + '。'
      ];
    } else if (id === 'held') {
      base.tone = 'success';
      base.title = '撑过了第一阶段';
      base.kicker = '阶段结束 · 3月2日';
      base.verdict = '基辅仍在乌克兰控制之下，政府、军队与社会都保留了继续运转的余量。这不是胜利，只是把更艰难的问题推到了明天。';
      base.epilogue = [
        '3月2日，基辅没有陷落。政府还能签发命令，军队还能组织防御，盟友还在提供支持。你撑过了入侵最初的一周。',
        '但这不是一个干净的结局。储备已经消耗，部队需要休整，城市需要疏散，社会需要解释。真实历史中，基辅也没有在本阶段陷落；本局不打算用这一点证明你比任何人更正确。',
        '你只是让这个国家多拥有了一些时间。接下来要面对的问题，不会因为这一局的结束而消失。'
      ];
      base.reasons = [
        '撑过第 7 夜，且七项国家状态与战争压力均高于阶段存续线。',
        '政府 ' + s.gov + ' / 军队 ' + s.army + ' / 基辅 ' + s.kyiv + ' / 意志 ' + s.will + ' / 国际 ' + s.intl + ' / 储备 ' + s.reserve + ' / 安全 ' + s.safety + '；压力 ' + p + '。'
      ];
    } else if (id === 'costly') {
      base.tone = 'warning';
      base.title = '代价高昂的存续';
      base.kicker = '阶段结束 · 3月2日';
      base.verdict = '你撑到了阶段结束，但国家机器已经失去部分余量。基辅还在，代价已经写进每一个系统。';
      base.epilogue = [
        '3月2日，基辅仍在乌方控制之下，政府也没有失去连续性。但储备接近底线，部队疲惫，社会对继续承受代价的耐心正在变薄。',
        '你争取到了时间，却没有争取到从容。下一阶段不会给你重新分配一切的机会；这一周留下的缺口，会在之后以更具体的方式出现。'
      ];
      base.reasons = [
        '撑过第 7 夜，但至少一项关键状态低于“完整存续”标准。',
        '政府 ' + s.gov + ' / 军队 ' + s.army + ' / 基辅 ' + s.kyiv + ' / 意志 ' + s.will + ' / 国际 ' + s.intl + ' / 储备 ' + s.reserve + ' / 安全 ' + s.safety + '；压力 ' + p + '。'
      ];
    } else {
      base.tone = 'danger';
      base.title = '空壳般的存续';
      base.kicker = '阶段结束 · 3月2日';
      base.verdict = '日期走到了 3 月 2 日，但至少两项国家系统同时跌破最低存续线。政府还在，国家能力已经所剩无几。';
      base.epilogue = [
        '从日历上看，你撑过了这一周。从国家能力上看，这更像是一具还在签发命令的空壳：政府缺少协调，军队缺少组织，社会缺少继续动员的理由。',
        '没有哪一项状态单独归零，所以没有触发某一场戏剧性的崩溃。但多项系统同时逼近底线，意味着下一场危机不需要很大，就足以让整个结构倒下。'
      ];
      base.reasons = [
        '撑过第 7 夜，但有 ' + (base.severeCount || 2) + ' 项国家状态低于最低存续线。',
        '政府 ' + s.gov + ' / 军队 ' + s.army + ' / 基辅 ' + s.kyiv + ' / 意志 ' + s.will + ' / 国际 ' + s.intl + ' / 储备 ' + s.reserve + ' / 安全 ' + s.safety + '；压力 ' + p + '。'
      ];
    }

    base.reasons.push('本局共签发 ' + state.choices.length + ' 项决策，触发 ' + state.resolved.length + ' 项延迟后果。');
    base.finalStats = Object.assign({}, s);
    base.finalPressure = p;
    base.finalRound = state.round;
    return base;
  }

  function getSaveSummary() {
    const data = loadSavedGame();
    if (!data) return null;
    const state = data.state;
    const event = EVENTS[state.round - 1];
    return {
      savedAt: data.savedAt,
      round: state.round,
      dateLabel: event ? event.dateLabel : '',
      phase: state.phase,
      ap: state.ap,
      endingTitle: state.ending ? state.ending.title : '',
      stats: state.stats
    };
  }

  function saveGame(state) {
    try {
      if (!root.localStorage) return false;
      const payload = {
        version: VERSION,
        savedAt: new Date().toISOString(),
        state: state
      };
      root.localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
      return true;
    } catch (error) {
      return false;
    }
  }

  function loadSavedGame() {
    try {
      if (!root.localStorage) return null;
      const raw = root.localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || data.version !== VERSION || !data.state) return null;
      const state = normalizeLoadedState(data.state);
      if (!state) return null;
      return { version: data.version, savedAt: data.savedAt, state: state };
    } catch (error) {
      return null;
    }
  }

  function normalizeLoadedState(input) {
    if (!input || typeof input !== 'object') return null;
    if (!Number.isInteger(input.round) || input.round < 1 || input.round > FINAL_ROUND) return null;
    if (!input.stats || typeof input.stats !== 'object') return null;

    const stats = {};
    STAT_KEYS.forEach(function (key) {
      stats[key] = clamp(input.stats[key], 0, 100);
    });
    const phase = ['briefing', 'interlude', 'ending'].indexOf(input.phase) !== -1 ? input.phase : 'briefing';
    const state = {
      version: VERSION,
      round: input.round,
      ap: clamp(input.ap, 0, AP_MAX),
      apMax: AP_MAX,
      stats: stats,
      pressure: clamp(input.pressure, 0, 100),
      flags: input.flags && typeof input.flags === 'object' ? input.flags : {},
      executed: Array.isArray(input.executed) ? input.executed.filter(function (v) { return typeof v === 'string'; }) : [],
      choices: Array.isArray(input.choices) ? input.choices : [],
      pending: Array.isArray(input.pending) ? input.pending : [],
      resolved: Array.isArray(input.resolved) ? input.resolved : [],
      log: Array.isArray(input.log) ? input.log.slice(-160) : [],
      phase: phase,
      interlude: input.interlude || null,
      ending: input.ending || null,
      startedAt: input.startedAt || new Date().toISOString()
    };
    if (state.phase === 'interlude' && !state.interlude) {
      state.phase = 'briefing';
    }
    if (state.phase === 'ending' && !state.ending) {
      return null;
    }
    return state;
  }

  function deleteSave() {
    try {
      if (root.localStorage) root.localStorage.removeItem(SAVE_KEY);
      return true;
    } catch (error) {
      return false;
    }
  }

  function hasSave() {
    return !!getSaveSummary();
  }

  function getDeltaList(deltas, pressureDelta) {
    const list = [];
    STAT_KEYS.forEach(function (key) {
      if (deltas && deltas[key]) {
        list.push({ key: key, label: STAT_META[key].short, value: deltas[key] });
      }
    });
    if (pressureDelta) {
      list.push({ key: 'pressure', label: '压力', value: pressureDelta });
    }
    return list;
  }

  root.LZS = {
    version: VERSION,
    saveKey: SAVE_KEY,
    events: EVENTS,
    meta: META,
    statKeys: STAT_KEYS,
    statMeta: STAT_META,
    apMax: AP_MAX,
    finalRound: FINAL_ROUND,
    thresholds: FINAL_THRESHOLDS,
    collapseLines: COLLAPSE_LINES,
    createGame: createGame,
    getEvent: getEvent,
    getChoice: getChoice,
    getChoiceStatus: getChoiceStatus,
    getExclusiveConflict: getExclusiveConflict,
    getAvailableChoices: getAvailableChoices,
    getPressureForecast: getPressureForecast,
    getAlarms: getAlarms,
    applyChoice: applyChoice,
    endRound: endRound,
    continueFromInterlude: continueFromInterlude,
    calculateAttrition: calculateAttrition,
    checkCollapse: checkCollapse,
    evaluateFinal: evaluateFinal,
    getDeltaList: getDeltaList,
    formatDeltaText: formatDeltaText,
    saveGame: saveGame,
    loadSavedGame: loadSavedGame,
    getSaveSummary: getSaveSummary,
    deleteSave: deleteSave,
    hasSave: hasSave,
    _test: {
      clamp: clamp,
      applyEffectValues: applyEffectValues,
      resolveDueDelayed: resolveDueDelayed,
      normalizeLoadedState: normalizeLoadedState
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
