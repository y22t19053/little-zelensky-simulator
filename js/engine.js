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
  const INTEL = root.LZS_INTEL || { categories: [], agencies: [], communications: [] };
  const VERSION = 2;
  const SAVE_KEY = 'lzs_save_v1';
  const BACKUP_KEY = 'lzs_save_v1_legacy_backup';
  const AP_MAX = META.apPerRound || 3;
  const FINAL_ROUND = EVENTS.length;
  const COMMAND_STATUSES = ['issued', 'executing', 'blocked', 'awaiting_feedback', 'completed', 'cancelled', 'expired'];
  const COMMAND_LABELS = {
    issued: '已签发', executing: '已接收 · 执行中', blocked: '遇到阻塞',
    awaiting_feedback: '等待反馈', completed: '已完成', cancelled: '已撤回', expired: '已失效 · 错过窗口'
  };
  const STRATEGY = {
    windowRounds: 1,
    agencyCoordinationFloor: 35,
    interventionCoordinationCost: 5,
    handoffCoordinationCost: 3
  };
  const CHOICE_AGENCY = {
    address: 'communications', mobilize: 'general_staff', aid_call: 'foreign', disperse: 'office',
    stay: 'office', relocate: 'office', split: 'office', record: 'communications',
    counterattack: 'general_staff', block_runway: 'general_staff', air_defense: 'general_staff',
    city_defense: 'general_staff', curfew: 'interior', arm_citizens: 'interior', bunker: 'office',
    unity_gov: 'office', security_rule: 'interior', south: 'general_staff', east: 'general_staff',
    delegate: 'general_staff', firepower: 'general_staff', eu: 'foreign', weapons: 'foreign',
    talks: 'foreign', refuse: 'foreign', logistics: 'logistics', evacuate: 'interior',
    requisition: 'logistics', speech: 'communications'
  };

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

  function defaultAgencies() {
    const agencies = {};
    INTEL.agencies.forEach(function (agency) {
      agencies[agency.id] = { coordination: 50, workload: 0, lastActionRound: null };
    });
    return agencies;
  }

  function getAgency(id) {
    return INTEL.getAgency ? INTEL.getAgency(id) : null;
  }

  function agencyForChoice(choice) {
    return CHOICE_AGENCY[choice.id] || 'office';
  }

  function getAgencyLoad(state, agencyId) {
    const spec = getAgency(agencyId);
    const record = state && state.agencies ? state.agencies[agencyId] : null;
    const capacity = spec ? spec.capacity : 3;
    const agency = record || { coordination: 50, workload: 0, lastActionRound: null };
    return {
      id: agencyId,
      label: spec ? spec.label : agencyId,
      short: spec ? spec.short : agencyId,
      capacity: capacity,
      workload: Number(agency.workload) || 0,
      available: Math.max(0, capacity - (Number(agency.workload) || 0)),
      coordination: Number(agency.coordination) == null ? 50 : Number(agency.coordination),
      overloaded: (Number(agency.workload) || 0) >= capacity,
      strained: (Number(agency.coordination) == null ? 50 : Number(agency.coordination)) < STRATEGY.agencyCoordinationFloor
    };
  }

  function getAgencyLoads(state) {
    return (INTEL.agencies || []).map(function (agency) { return getAgencyLoad(state, agency.id); });
  }

  /*
   * 协调要求不仅来自命令本身，也来自国家机器的当前状态：
   * 政府连续性告警会让办公/内务/沟通命令必须由总统亲自协调；
   * 外交或储备告警会提高相关承诺的协调门槛。全部是可见状态，不是暗改规则。
   */
  function needsCoordination(stateOrChoice, maybeChoice, agencyId) {
    const state = maybeChoice ? stateOrChoice : null;
    const choice = maybeChoice || stateOrChoice;
    if (!choice) return false;
    const agency = agencyId || agencyForChoice(choice);
    const affected = STAT_KEYS.filter(function (key) { return !!choice.effects && !!choice.effects[key]; }).length;
    let required = choice.ap >= 2 || affected >= 5;
    if (!state) return required;
    if (state.stats.gov <= 35 && ['office', 'interior', 'communications'].indexOf(agency) !== -1) required = true;
    if (state.stats.intl <= 28 && agency === 'foreign' && (choice.effects.intl || 0) > 0) required = true;
    if (state.stats.reserve <= 24 && (choice.effects.reserve || 0) <= -4) required = true;
    return required;
  }

  function requiresIntelClarification(state, event, choice) {
    if (!event || !event.intel || event.intel.level !== '低') return false;
    return choice.ap >= 2 && (Math.abs(choice.effects.army || 0) + Math.abs(choice.effects.kyiv || 0) >= 5);
  }

  function isIntelSatisfied(state, command) {
    if (!command || !command.requiresIntel) return true;
    const record = state.intelState && state.intelState[command.intelReportId];
    return !!(record && record.inquired);
  }

  function getExecutionRisks(state, choice) {
    const agencyId = agencyForChoice(choice);
    const load = getAgencyLoad(state, agencyId);
    const event = getEvent(state);
    const risks = [];
    const usesPrioritySlot = needsCoordination(state, choice, agencyId) || choice.ap >= 2;
    if (usesPrioritySlot && load.overloaded) risks.push('执行机构优先席位已满（' + load.workload + '/' + load.capacity + '），今晚只能阻塞等待容量。');
    if (usesPrioritySlot && load.strained) risks.push('机构协调余量低于 ' + STRATEGY.agencyCoordinationFloor + '，需先召集协调会。');
    if (needsCoordination(state, choice, agencyId)) risks.push('跨部门或高负荷行动：需要总统召集协调，或改由其他机构接手。');
    if (requiresIntelClarification(state, event, choice) && !isIntelSatisfied(state, { requiresIntel: true, intelReportId: event.id + ':military' })) {
      risks.push('情报可信度低：先追问总参（1 AP），确认方向后才能授权这项高投入行动。');
    }
    return risks;
  }

  function getCommandPreview(state, choiceId) {
    const event = getEvent(state);
    const choice = getChoice(event, choiceId);
    if (!choice) return null;
    const agency = agencyForChoice(choice);
    return {
      agency: agency,
      agencyLabel: getAgency(agency) ? getAgency(agency).label : agency,
      load: getAgencyLoad(state, agency),
      requiresCoordination: needsCoordination(state, choice, agency),
      slotRequired: needsCoordination(state, choice, agency) || choice.ap >= 2,
      requiresIntel: requiresIntelClarification(state, event, choice),
      intelSatisfied: isIntelSatisfied(state, { requiresIntel: requiresIntelClarification(state, event, choice), intelReportId: event.id + ':military' }),
      deadlineRound: Math.min(FINAL_ROUND, state.round + STRATEGY.windowRounds),
      risks: getExecutionRisks(state, choice)
    };
  }

  function isTerminalCommand(command) {
    return ['completed', 'cancelled', 'expired'].indexOf(command.status) !== -1;
  }

  function activeCommands(state) {
    return (state.commands || []).filter(function (command) {
      return !isTerminalCommand(command);
    });
  }

  function findCommand(state, id) {
    return (state.commands || []).filter(function (command) { return command.id === id; })[0] || null;
  }

  function addCommandLog(state, command, title, text) {
    addLog(state, 'command', title, text);
    if (command) {
      command.lastNote = title;
      if (!command.history) command.history = [];
      command.history.push({ round: state.round, dateLabel: getEvent(state) ? getEvent(state).dateLabel : '', title: title, text: text });
      if (command.history.length > 12) command.history.shift();
    }
  }

  function setCommandBlocked(state, command, code, reason) {
    command.status = 'blocked';
    command.blockedCode = code;
    command.blockedReason = reason;
    if (command.record) command.record.status = command.status;
    addCommandLog(state, command, '阻塞：' + command.title, reason);
  }

  function clearCommandBlock(command) {
    command.blockedCode = null;
    command.blockedReason = null;
  }

  function reserveAgencySlot(state, command, options) {
    const load = getAgencyLoad(state, command.executorId);
    if (command.slotRequired === false) return { ok: true, load: load, routine: true };
    if (command.accepted) return { ok: true, load: load };
    if (load.overloaded && !(options && options.force)) {
      setCommandBlocked(state, command, 'CAPACITY', '执行机构在办已满（' + load.workload + '/' + load.capacity + '）：任务已排队，今晚无法接收；可改由其他机构接手、撤回，或接受延误。');
      return { ok: false, load: load };
    }
    state.agencies[command.executorId].workload = load.workload + 1;
    state.agencies[command.executorId].lastActionRound = state.round;
    command.accepted = true;
    command.overCapacity = load.overloaded;
    return { ok: true, load: load };
  }

  function releaseAgencySlot(state, command) {
    if (!command.accepted) return;
    const agency = state.agencies[command.executorId];
    if (agency && agency.workload > 0) agency.workload -= 1;
    command.accepted = false;
  }

  function getIntelReports(state) {
    const event = getEvent(state);
    if (!event) return [];
    const alarms = alarmMapLocal(getAlarms(state));
    const baseTime = event.dateLabel + ' · ' + event.time;
    return INTEL.categories.map(function (category, index) {
      const id = event.id + ':' + category.id;
      const saved = (state.intelState && state.intelState[id]) || {};
      const values = category.stats.map(function (key) { return { key: key, value: state.stats[key] }; });
      const flagged = category.stats.filter(function (key) { return !!alarms[key]; });
      const min = Math.min.apply(null, values.map(function (item) { return item.value; }));
      const status = flagged.length ? (flagged.some(function (key) { return alarms[key].level === 'critical'; }) ? '危急' : '承压') : min >= 60 ? '可用' : '受限';
      const known = event.known[index % event.known.length];
      const secondary = event.known[(index + 1) % event.known.length];
      const unknown = event.unknown[index % event.unknown.length];
      const unknown2 = event.unknown[(index + 1) % event.unknown.length];
      const inquiryKnown = event.known[(index + 2) % event.known.length];
      return {
        id: id,
        eventId: event.id,
        category: category.id,
        label: category.label,
        kicker: category.kicker,
        source: category.source,
        time: baseTime,
        status: status,
        values: values,
        confidence: event.intel.level,
        confidenceNote: category.confidenceNote,
        focus: category.focus,
        confirmed: [known, secondary],
        unconfirmed: [unknown, unknown2],
        relatedChoiceIds: event.choices.map(function (choice) { return choice.id; }),
        read: !!saved.read,
        pinned: !!saved.pinned,
        inquired: !!saved.inquired,
        inquiry: saved.inquired ? '已追问：' + category.inquiry + ' 模拟回报：' + inquiryKnown + '；仍未确认：' + unknown2 : category.inquiry,
        disclaimer: '来源角色与文电均为游戏模拟抽象，不是真实机构文件。'
      };
    });
  }

  function alarmMapLocal(alarms) {
    const map = {};
    (alarms || []).forEach(function (alarm) { map[alarm.key] = alarm; });
    return map;
  }

  function getIntelReport(state, id) {
    return getIntelReports(state).filter(function (report) { return report.id === id; })[0] || null;
  }

  function createGame() {
    const stats = {};
    STAT_KEYS.forEach(function (key) {
      stats[key] = clamp(META.initialStats[key], 0, 100);
    });
    const state = {
      version: VERSION,
      schemaVersion: 2,
      round: 1,
      ap: AP_MAX,
      apMax: AP_MAX,
      stats: stats,
      pressure: clamp(META.startPressure, 0, 100),
      flags: {},
      executed: [],
      choices: [],
      commands: [],
      effects: [],
      agencies: defaultAgencies(),
      intelState: {},
      coordinationThisRound: {},
      communicationsThisRound: {},
      pending: [],
      resolved: [],
      lastSettledRound: 0,
      log: [],
      phase: 'briefing',
      interlude: null,
      ending: null,
      startedAt: new Date().toISOString()
    };
    addLog(state, 'system', '行动开始', '2月24日凌晨，最高统帅部进入战时状态。你有 3 点注意力，用来决定这个国家先处理什么。信息可以免费阅读，追问与协调会占用注意力。');
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

  function scheduleDelayed(state, event, choice, commandId) {
    if (!choice.delayed || !choice.delayed.length) return [];
    const scheduled = [];
    choice.delayed.forEach(function (item, index) {
      const dueRound = state.round + (item.delay || 1);
      const record = {
        id: event.id + ':' + choice.id + ':' + index,
        sourceEventId: event.id,
        sourceChoiceId: choice.id,
        sourceCommandId: commandId || null,
        sourceLabel: choice.title,
        dueRound: dueRound,
        label: item.label,
        note: item.note || '',
        effects: Object.assign({}, item.effects || {})
      };
      state.pending.push(record);
      state.effects.push({
        id: 'delayed:' + record.id + ':r' + dueRound,
        commandId: commandId || null,
        kind: 'delayed',
        status: 'pending',
        dueRound: dueRound,
        issuedRound: state.round,
        label: item.label
      });
      scheduled.push(record);
    });
    return scheduled;
  }

  function applyImmediateRecord(state, command, choice) {
    const effectId = command.id + ':immediate';
    const existing = state.effects.filter(function (item) { return item.id === effectId; })[0];
    if (existing && existing.status === 'applied') {
      return { deltas: existing.deltas || {}, pressureDelta: existing.pressureDelta || 0 };
    }
    const result = applyEffectValues(state, choice.effects);
    if (choice.flags && choice.flags.length) {
      choice.flags.forEach(function (flag) { state.flags[flag] = true; });
    }
    state.effects.push({
      id: effectId,
      commandId: command.id,
      kind: 'immediate',
      status: 'applied',
      appliedRound: state.round,
      effects: Object.assign({}, choice.effects),
      deltas: result.deltas,
      pressureDelta: result.pressureDelta
    });
    return result;
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

  function issueCommand(state, choiceId, options) {
    if (!state || state.phase !== 'briefing') {
      return { ok: false, error: '当前阶段不能签发命令。', code: 'PHASE' };
    }
    const event = getEvent(state);
    const choice = getChoice(event, choiceId);
    if (!choice) return { ok: false, error: '未找到这项命令。', code: 'NOT_FOUND' };
    const status = getChoiceStatus(state, choiceId);
    if (!status.canIssue) {
      const code = status.state === 'issued' ? 'DUPLICATE' : status.state === 'conflict' ? 'CONFLICT' : status.state === 'ap' ? 'AP' : 'UNAVAILABLE';
      return { ok: false, error: status.message, code: code, conflict: status.conflict };
    }
    const id = 'r' + state.round + ':' + event.id + ':' + choice.id;
    if (findCommand(state, id)) return { ok: false, error: '这项命令已经建档。', code: 'DUPLICATE' };
    const agency = agencyForChoice(choice);
    const command = {
      id: id,
      kind: 'authorization',
      round: state.round,
      dateLabel: event.dateLabel,
      eventId: event.id,
      choiceId: choice.id,
      title: choice.title,
      ap: choice.ap,
      agency: agency,
      executorId: agency,
      status: 'issued',
      authorizedAt: null,
      requiredCoordination: needsCoordination(state, choice, agency),
      /* 只有高投入或跨部门命令占用总统优先席位；1 AP 单项工作由机构在授权内自行排队。 */
      slotRequired: needsCoordination(state, choice, agency) || choice.ap >= 2,
      coordinated: !!state.coordinationThisRound[agency],
      requiresIntel: requiresIntelClarification(state, event, choice),
      intelReportId: event.id + ':military',
      infoCode: null,
      delegated: false,
      delegatedRound: null,
      handoffRound: null,
      accepted: false,
      effectsApplied: false,
      blockedReason: null,
      blockedCode: null,
      deadlineRound: Math.min(FINAL_ROUND, state.round + STRATEGY.windowRounds),
      windowRounds: STRATEGY.windowRounds,
      expedited: false,
      cancelledRound: null,
      expiredRound: null,
      followedRounds: [],
      history: [],
      createdAt: new Date().toISOString()
    };
    state.ap -= choice.ap;
    state.executed.push(choice.id);
    state.commands.push(command);
    state.choices.push({
      round: state.round,
      dateLabel: event.dateLabel,
      eventId: event.id,
      eventTitle: event.title,
      choiceId: choice.id,
      commandId: command.id,
      label: choice.title,
      ap: choice.ap,
      agency: agency,
      status: 'issued',
      deltas: {},
      pressureDelta: 0,
      scheduled: []
    });
    addCommandLog(state, command, '签发：' + choice.title, '命令已建档并交给' + (getAgency(agency) ? getAgency(agency).label : '总统办公室') + '。尚未授权执行。');
    return { ok: true, command: command, choice: choice };
  }

  function authorizeCommand(state, commandId, executorId) {
    if (!state || state.phase !== 'briefing') return { ok: false, error: '当前阶段不能授权。', code: 'PHASE' };
    const command = findCommand(state, commandId);
    if (!command) return { ok: false, error: '未找到这项命令。', code: 'NOT_FOUND' };
    if (command.status !== 'issued') return { ok: false, error: '这项命令不在待授权状态。', code: 'STATUS' };
    if (command.deadlineRound && state.round > command.deadlineRound) {
      return { ok: false, error: '这项命令已经超过第 ' + command.deadlineRound + ' 夜的执行窗口，不能再授权。', code: 'EXPIRED' };
    }
    const executor = executorId && getAgency(executorId) ? executorId : command.agency;
    command.executorId = executor;
    command.agency = executor;
    command.authorizedAt = new Date().toISOString();
    command.status = 'executing';
    if (command.requiresIntel && !isIntelSatisfied(state, command)) {
      setCommandBlocked(state, command, 'INFO', '情报可信度低，方向尚未确认：先在情报桌追问总参（1 AP），再授权这项高投入命令。');
      return { ok: true, command: command, blocked: true };
    }
    const slot = reserveAgencySlot(state, command);
    if (!slot.ok) {
      return { ok: true, command: command, blocked: true };
    }
    if (command.requiredCoordination && !command.coordinated && !state.coordinationThisRound[executor] && getAgencyLoad(state, executor).coordination < STRATEGY.agencyCoordinationFloor) {
      setCommandBlocked(state, command, 'COORDINATION', '机构协调余量低于 ' + STRATEGY.agencyCoordinationFloor + '：需要总统先召集协调会，或改派其他机构。');
      return { ok: true, command: command, blocked: true };
    }
    addCommandLog(state, command, '授权：' + command.title, '总统授权由' + (getAgency(executor) ? getAgency(executor).label : executor) + '执行，占用该机构 1 个在办名额。本夜将回报接收与执行情况。');
    return { ok: true, command: command };
  }

  function completeCommand(command, state) {
    if (!command || command.status === 'completed') return;
    command.status = 'completed';
    command.completedRound = state.round;
    releaseAgencySlot(state, command);
    clearCommandBlock(command);
    if (command.record) command.record.status = command.status;
  }

  function executeCommandNow(state, command, source) {
    if (!command || command.effectsApplied) return { ok: true, command: command, deltas: {}, pressureDelta: 0 };
    if (isTerminalCommand(command)) return { ok: false, error: '这项命令已经结束。', code: 'STATUS' };
    const slot = reserveAgencySlot(state, command);
    if (!slot.ok) return { ok: true, command: command, blocked: true, deltas: {}, pressureDelta: 0 };
    const agencyLoad = getAgencyLoad(state, command.agency);
    if (agencyLoad.coordination < STRATEGY.agencyCoordinationFloor) {
      setCommandBlocked(state, command, 'COORDINATION', '机构协调余量仅 ' + agencyLoad.coordination + '，低于 ' + STRATEGY.agencyCoordinationFloor + '：命令无法安全跨部门执行。');
      return { ok: true, command: command, blocked: true, deltas: {}, pressureDelta: 0 };
    }
    if (command.requiredCoordination && !command.coordinated && !state.coordinationThisRound[command.agency]) {
      setCommandBlocked(state, command, 'COORDINATION', '跨部门执行条件未满足：需要总统召集' + (getAgency(command.agency) ? getAgency(command.agency).label : command.agency) + '，或把任务委派出去。');
      return { ok: true, command: command, blocked: true, deltas: {}, pressureDelta: 0 };
    }
    const event = EVENTS.filter(function (item) { return item.id === command.eventId; })[0];
    const choice = event ? getChoice(event, command.choiceId) : null;
    if (!choice) return { ok: false, error: '命令来源数据缺失。', code: 'EVENT' };
    const result = applyImmediateRecord(state, command, choice);
    const scheduled = scheduleDelayed(state, event, choice, command.id);
    command.effectsApplied = true;
    command.status = 'awaiting_feedback';
    command.executedRound = state.round;
    command.executedLate = state.round > command.round;
    command.result = { deltas: result.deltas, pressureDelta: result.pressureDelta, scheduled: scheduled.map(function (item) { return item.label; }) };
    clearCommandBlock(command);
    const record = state.choices.filter(function (item) { return item.commandId === command.id; })[0];
    if (record) {
      command.record = record;
      record.deltas = result.deltas;
      record.pressureDelta = result.pressureDelta;
      record.scheduled = command.result.scheduled;
      record.status = command.status;
    }
    addCommandLog(state, command, (command.expedited ? '介入执行：' : '执行回报：') + command.title,
      '执行机构：' + (getAgency(command.agency) ? getAgency(command.agency).label : command.agency) + '。' + formatDeltaText(result.deltas, result.pressureDelta) + (command.executedLate ? ' 已超过原定执行窗口，但仍保留了本次效果。' : ''));
    return Object.assign({ ok: true, command: command }, result);
  }

  function followUpCommand(state, commandId) {
    if (!state || state.phase !== 'briefing') return { ok: false, error: '当前阶段不能跟进。', code: 'PHASE' };
    if (state.ap < 1) return { ok: false, error: '跟进需要 1 AP。', code: 'AP' };
    const command = findCommand(state, commandId);
    if (!command) return { ok: false, error: '未找到这项命令。', code: 'NOT_FOUND' };
    if (command.status === 'completed') return { ok: false, error: '这项命令已经完成。', code: 'STATUS' };
    if (command.followedRounds.indexOf(state.round) !== -1) return { ok: false, error: '这项命令本回合已经跟进过。', code: 'DUPLICATE' };
    if (command.status === 'issued') return { ok: false, error: '命令尚未授权或委派，无法检查执行。', code: 'STATUS' };
    if (command.requiresIntel && !isIntelSatisfied(state, command)) {
      return { ok: false, error: '这项命令缺的是一条已确认的情报，不是总统催办。先追问总参，再决定是否投入推进。', code: 'INFO' };
    }
    state.ap -= 1;
    command.followedRounds.push(state.round);
    let result = { deltas: {}, pressureDelta: 0 };
    if (command.status === 'blocked' || command.status === 'executing') {
      const previousAgency = command.agency;
      command.status = 'executing';
      command.coordinated = true;
      command.expedited = true;
      const forced = reserveAgencySlot(state, command, { force: true });
      if (!forced.ok) return { ok: false, error: '介入失败：无法占用执行机构。', code: 'AGENCY' };
      if (state.agencies[previousAgency]) {
        state.agencies[previousAgency].coordination = clamp(state.agencies[previousAgency].coordination - STRATEGY.interventionCoordinationCost, 0, 100);
      }
      result = executeCommandNow(state, command, 'followup');
      if (result.ok && !result.blocked) {
        addCommandLog(state, command, '总统介入：' + command.title, '总统亲自催办并越过排队，命令立即执行；这占用了本可用于另一项事务的注意力，并向执行机构透支了 ' + STRATEGY.interventionCoordinationCost + ' 点协调余量。');
      } else if (!result.ok) {
        return result;
      }
    } else if (command.status === 'awaiting_feedback') {
      completeCommand(command, state);
      addCommandLog(state, command, '跟进完成：' + command.title, '执行反馈已核验，命令归档为已完成并释放机构在办名额；不会重复结算原效果。');
    }
    const collapse = checkCollapse(state);
    return { ok: true, command: command, deltas: result.deltas || {}, pressureDelta: result.pressureDelta || 0, ending: collapse ? finalizeEnding(state, collapse) : null };
  }

  function delegateCommand(state, commandId, agencyId) {
    if (!state || state.phase !== 'briefing') return { ok: false, error: '当前阶段不能委派。', code: 'PHASE' };
    const command = findCommand(state, commandId);
    if (!command) return { ok: false, error: '未找到这项命令。', code: 'NOT_FOUND' };
    if (['issued', 'blocked', 'executing'].indexOf(command.status) === -1) return { ok: false, error: '这项命令当前不能委派。', code: 'STATUS' };
    if (!agencyId || !getAgency(agencyId)) return { ok: false, error: '没有选择接收机构。', code: 'AGENCY' };
    if (command.effectsApplied) return { ok: false, error: '命令已经执行，不能再改变执行责任。', code: 'STATUS' };
    if (command.requiresIntel && !isIntelSatisfied(state, command)) {
      return { ok: false, error: '这项命令缺的是敌情确认，换执行机构不能替代追问总参。', code: 'INFO' };
    }
    if (command.deadlineRound && state.round + 1 > command.deadlineRound) {
      return { ok: false, error: '委派需要一整个夜晚交接，已经超过这项命令的执行窗口；请总统介入、接受延误，或撤回。', code: 'WINDOW' };
    }
    if (agencyId === command.executorId && command.accepted) return { ok: false, error: '这项任务已在该机构执行。', code: 'DUPLICATE' };
    const targetLoad = getAgencyLoad(state, agencyId);
    if (targetLoad.overloaded) return { ok: false, error: '目标机构在办已满（' + targetLoad.workload + '/' + targetLoad.capacity + '），无法接手。', code: 'CAPACITY' };
    const previousAgency = command.executorId;
    releaseAgencySlot(state, command);
    if (state.agencies[previousAgency]) state.agencies[previousAgency].coordination = clamp(state.agencies[previousAgency].coordination - STRATEGY.handoffCoordinationCost, 0, 100);
    if (state.agencies[agencyId]) state.agencies[agencyId].coordination = clamp(state.agencies[agencyId].coordination - STRATEGY.handoffCoordinationCost, 0, 100);
    command.delegated = true;
    command.delegatedRound = state.round;
    command.handoffRound = state.round + 1;
    command.coordinated = true;
    command.executorId = agencyId;
    command.agency = agencyId;
    command.status = 'executing';
    clearCommandBlock(command);
    addCommandLog(state, command, '委派交接：' + command.title,
      '任务改由' + (getAgency(agencyId) ? getAgency(agencyId).label : agencyId) + '接手。总统不支付额外注意力，但交接需要一整个夜晚：本夜不会执行，次夜才可能开始；双方机构各损失 ' + STRATEGY.handoffCoordinationCost + ' 点协调余量。');
    return { ok: true, command: command };
  }

  function cancelCommand(state, commandId) {
    if (!state || state.phase !== 'briefing') return { ok: false, error: '当前阶段不能撤回命令。', code: 'PHASE' };
    const command = findCommand(state, commandId);
    if (!command) return { ok: false, error: '未找到这项命令。', code: 'NOT_FOUND' };
    if (isTerminalCommand(command)) return { ok: false, error: '这项命令已经结束。', code: 'STATUS' };
    if (command.effectsApplied) return { ok: false, error: '命令效果已经发生，不能撤回。', code: 'STATUS' };
    releaseAgencySlot(state, command);
    command.status = 'cancelled';
    command.cancelledRound = state.round;
    command.records = null;
    clearCommandBlock(command);
    const record = state.choices.filter(function (item) { return item.commandId === command.id; })[0];
    if (record) record.status = 'cancelled';
    addCommandLog(state, command, '撤回命令：' + command.title, '总统撤回尚未执行的命令，释放机构在办名额；已支付的 ' + command.ap + ' AP 不会退还，原定效果与本可争取的时间窗口一并放弃。');
    return { ok: true, command: command };
  }

  function coordinateAgency(state, agencyId) {
    if (!state || state.phase !== 'briefing') return { ok: false, error: '当前阶段不能召集。', code: 'PHASE' };
    if (state.ap < 1) return { ok: false, error: '召集协调会需要 1 AP。', code: 'AP' };
    if (!getAgency(agencyId) || !state.agencies[agencyId]) return { ok: false, error: '未找到这个机构。', code: 'AGENCY' };
    if (state.coordinationThisRound[agencyId]) return { ok: false, error: '本回合已经召集过这个机构。', code: 'DUPLICATE' };
    state.ap -= 1;
    state.coordinationThisRound[agencyId] = true;
    state.agencies[agencyId].coordination = clamp(state.agencies[agencyId].coordination + 8, 0, 100);
    state.agencies[agencyId].lastActionRound = state.round;
    state.commands.forEach(function (command) {
      if (command.round !== state.round || command.agency !== agencyId || command.effectsApplied) return;
      if (['issued', 'executing'].indexOf(command.status) !== -1) command.coordinated = true;
      if (command.status === 'blocked' && command.blockedCode === 'COORDINATION') {
        command.coordinated = true;
        command.status = command.accepted ? 'executing' : 'issued';
        clearCommandBlock(command);
        addCommandLog(state, command, '协调已恢复：' + command.title, '总统召集后，跨部门协调条件已满足；命令可继续授权或等待夜间执行。');
      }
    });
    addLog(state, 'coordination', '召集协调：' + getAgency(agencyId).label, '总统亲自主持跨部门协调，相关命令本回合不再因协调条件阻塞；机构协调余量 +8。');
    return { ok: true, agencyId: agencyId };
  }

  function communicate(state, channelId) {
    if (!state || state.phase !== 'briefing') return { ok: false, error: '当前阶段不能沟通。', code: 'PHASE' };
    if (state.ap < 1) return { ok: false, error: '这次沟通需要 1 AP。', code: 'AP' };
    const channel = (INTEL.communications || []).filter(function (item) { return item.id === channelId; })[0];
    if (!channel) return { ok: false, error: '未找到这个沟通渠道。', code: 'CHANNEL' };
    if (state.communicationsThisRound[channelId]) return { ok: false, error: '本回合已经使用过这个渠道。', code: 'DUPLICATE' };
    state.ap -= 1;
    state.communicationsThisRound[channelId] = true;
    const id = 'comm:r' + state.round + ':' + channelId;
    const dueRound = Math.min(FINAL_ROUND, state.round + 1);
    const command = {
      id: id, kind: 'communication', round: state.round, title: channel.label,
      agency: channel.agency, executorId: channel.agency, status: 'awaiting_feedback',
      ap: 1, effectsApplied: true, requiredCoordination: false, coordinated: true,
      followedRounds: [], result: { deltas: {}, pressureDelta: 0, scheduled: [channel.note] }
    };
    state.commands.push(command);
    state.pending.push({
      id: id, sourceEventId: 'communication', sourceChoiceId: channelId,
      sourceCommandId: id, sourceLabel: channel.label, dueRound: dueRound,
      label: channel.label + ' · 反馈', note: channel.note, effects: Object.assign({}, channel.effects)
    });
    state.effects.push({
      id: 'delayed:' + id + ':r' + dueRound, commandId: id, kind: 'communication',
      status: 'pending', dueRound: dueRound, issuedRound: state.round, label: channel.label
    });
    addLog(state, 'communication', '沟通：' + channel.label, channel.note + ' 实际状态变化将在下一夜结算。');
    return { ok: true, command: command };
  }

  function markIntelRead(state, reportId) {
    if (!state || !reportId) return { ok: false };
    if (!state.intelState[reportId]) state.intelState[reportId] = { read: false, pinned: false, inquired: false };
    state.intelState[reportId].read = true;
    return { ok: true, report: getIntelReport(state, reportId) };
  }

  function toggleIntelPin(state, reportId) {
    if (!state || !reportId) return { ok: false };
    if (!state.intelState[reportId]) state.intelState[reportId] = { read: false, pinned: false, inquired: false };
    state.intelState[reportId].pinned = !state.intelState[reportId].pinned;
    return { ok: true, pinned: state.intelState[reportId].pinned };
  }

  function inquireIntel(state, reportId) {
    if (!state || state.phase !== 'briefing') return { ok: false, error: '当前阶段不能追问。', code: 'PHASE' };
    if (state.ap < 1) return { ok: false, error: '追问需要 1 AP。', code: 'AP' };
    const report = getIntelReport(state, reportId);
    if (!report) return { ok: false, error: '未找到这份情报。', code: 'NOT_FOUND' };
    if (!state.intelState[reportId]) state.intelState[reportId] = { read: true, pinned: false, inquired: false };
    if (state.intelState[reportId].inquired) return { ok: false, error: '这份情报已经追问过。', code: 'DUPLICATE' };
    state.ap -= 1;
    state.intelState[reportId].inquired = true;
    state.intelState[reportId].read = true;
    (state.commands || []).forEach(function (command) {
      if (command.intelReportId !== reportId || command.effectsApplied || command.blockedCode !== 'INFO') return;
      command.status = 'issued';
      clearCommandBlock(command);
      addCommandLog(state, command, '情报已确认：' + command.title, '总统追问总参后，敌军方向的确认已补入情报桌；这项命令可以重新授权，但仍占用签发时支付的 AP。');
    });
    addLog(state, 'intel', '追问：' + report.label, report.source + '提交补充说明；额外信息进入情报桌，未直接改变国家数值。');
    return { ok: true, report: getIntelReport(state, reportId) };
  }

  function getCommandCounts(state) {
    const counts = { total: 0, active: 0, blocked: 0, awaiting: 0, completed: 0, cancelled: 0, expired: 0 };
    (state.commands || []).forEach(function (command) {
      counts.total += 1;
      if (isTerminalCommand(command)) {
        if (command.status === 'completed') counts.completed += 1;
        if (command.status === 'cancelled') counts.cancelled += 1;
        if (command.status === 'expired') counts.expired += 1;
      } else {
        counts.active += 1;
      }
      if (command.status === 'blocked') counts.blocked += 1;
      if (command.status === 'awaiting_feedback') counts.awaiting += 1;
    });
    return counts;
  }

  function getCommandChains(state, limit) {
    const commands = (state.commands || []).filter(function (command) {
      return command.kind !== 'communication' && command.history && command.history.length;
    });
    const priority = { expired: 0, blocked: 1, cancelled: 2, awaiting_feedback: 3, executing: 4, completed: 5, issued: 6 };
    commands.sort(function (a, b) {
      const pa = priority[a.status] == null ? 9 : priority[a.status];
      const pb = priority[b.status] == null ? 9 : priority[b.status];
      if (pa !== pb) return pa - pb;
      return b.round - a.round;
    });
    return commands.slice(0, limit || 3).map(function (command) {
      return {
        commandId: command.id,
        title: command.title,
        agency: command.agency,
        status: command.status,
        deadlineRound: command.deadlineRound,
        delegated: !!command.delegated,
        expedited: !!command.expedited,
        history: command.history.slice()
      };
    });
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

    const issued = issueCommand(state, choiceId);
    if (!issued.ok) return issued;
    issued.command.coordinated = true;
    issued.command.requiresIntel = false;
    const authorized = authorizeCommand(state, issued.command.id);
    if (!authorized.ok) return authorized;
    const result = executeCommandNow(state, issued.command, 'legacy');
    let ending = checkCollapse(state);
    if (ending) ending = finalizeEnding(state, ending);
    return {
      ok: true,
      choice: choice,
      command: issued.command,
      deltas: result.deltas || {},
      pressureDelta: result.pressureDelta || 0,
      available: getAvailableChoices(state).length,
      ending: ending || null
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
    const seen = {};
    (state.resolved || []).forEach(function (item) { seen[item.id] = true; });
    const due = state.pending.filter(function (item) { return item.dueRound <= round && !seen[item.id]; });
    if (!due.length) return [];
    state.pending = state.pending.filter(function (item) { return item.dueRound > round; });

    return due.map(function (item) {
      const result = applyEffectValues(state, item.effects);
      const effect = (state.effects || []).filter(function (entry) { return entry.id === 'delayed:' + item.id + ':r' + item.dueRound; })[0];
      if (effect) {
        effect.status = 'applied';
        effect.appliedRound = round;
        effect.deltas = result.deltas;
        effect.pressureDelta = result.pressureDelta;
      }
      const applied = {
        id: item.id,
        dueRound: item.dueRound,
        appliedRound: round,
        sourceEventId: item.sourceEventId,
        sourceCommandId: item.sourceCommandId || null,
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

  function commandResult(command, extra) {
    return Object.assign({
      commandId: command.id,
      title: command.title,
      agency: command.agency,
      ap: command.ap,
      status: command.status,
      blockedReason: command.blockedReason || null,
      blockedCode: command.blockedCode || null,
      deadlineRound: command.deadlineRound,
      delegated: !!command.delegated,
      expedited: !!command.expedited,
      deltas: {},
      pressureDelta: 0
    }, extra || {});
  }

  function expireCommand(state, command) {
    releaseAgencySlot(state, command);
    command.status = 'expired';
    command.expiredRound = state.round;
    command.blockedReason = '超过第 ' + command.deadlineRound + ' 日的执行窗口：任务已失去执行机会，原定效果不会结算。';
    const record = state.choices.filter(function (item) { return item.commandId === command.id; })[0];
    if (record) record.status = 'expired';
    addCommandLog(state, command, '失效：' + command.title, command.blockedReason + ' 已占用的注意力与机构排队时间无法追回。');
  }

  function processNightCommand(state, command) {
    if (command.kind === 'communication') {
      if (command.status === 'awaiting_feedback' && command.round < state.round) completeCommand(command, state);
      return null;
    }
    if (command.effectsApplied || isTerminalCommand(command)) return null;
    const atDeadline = command.deadlineRound && state.round >= command.deadlineRound;
    if (command.requiresIntel && !isIntelSatisfied(state, command)) {
      setCommandBlocked(state, command, 'INFO', '情报可信度低：缺少总参对敌军方向的确认，命令不能在夜间安全执行。');
      const blockedInfo = commandResult(command, { blocked: true, note: '等待情报确认' });
      if (atDeadline) {
        expireCommand(state, command);
        blockedInfo.status = 'expired';
        blockedInfo.note = '情报未确认，错过执行窗口';
      }
      return blockedInfo;
    }
    if (command.deadlineRound && state.round > command.deadlineRound) {
      expireCommand(state, command);
      return commandResult(command, { status: 'expired', blocked: true, note: '错过执行窗口' });
    }
    if (command.handoffRound && state.round < command.handoffRound) {
      command.status = 'blocked';
      command.blockedCode = 'HANDOFF';
      command.blockedReason = '委派交接需要一整个夜晚：第 ' + command.handoffRound + ' 夜才会开始执行；今晚不占用目标机构名额。';
      return commandResult(command, { blocked: true, note: '委派交接中' });
    }
    if (command.status === 'blocked' && command.blockedCode === 'COORDINATION' && !command.coordinated && !state.coordinationThisRound[command.agency]) {
      const blockedCoord = commandResult(command, { blocked: true, note: '协调条件仍未满足' });
      if (atDeadline) {
        expireCommand(state, command);
        blockedCoord.status = 'expired';
        blockedCoord.note = '协调未完成，错过执行窗口';
      }
      return blockedCoord;
    }
    if (command.status === 'issued') {
      const blockedIssued = commandResult(command, { blocked: true, note: '尚未授权' });
      if (atDeadline) {
        expireCommand(state, command);
        blockedIssued.status = 'expired';
        blockedIssued.note = '未完成授权，错过执行窗口';
      }
      return blockedIssued;
    }
    const outcome = executeCommandNow(state, command, command.round < state.round ? 'late-night' : 'night');
    if (!outcome.ok || outcome.blocked || command.status === 'blocked') {
      const blockedOutcome = commandResult(command, { blocked: true, note: outcome.error || command.blockedReason || '夜间无法执行' });
      if (atDeadline) {
        expireCommand(state, command);
        blockedOutcome.status = 'expired';
        blockedOutcome.note = '执行条件不足，错过最后窗口';
      }
      return blockedOutcome;
    }
    return commandResult(command, {
      blocked: command.status === 'blocked',
      deltas: outcome.deltas || {},
      pressureDelta: outcome.pressureDelta || 0,
      executedLate: !!command.executedLate
    });
  }

  function endRound(state) {
    if (!state || state.phase !== 'briefing') {
      return { ok: false, error: '当前阶段不能结束回合。', code: 'PHASE' };
    }
    if (!state.executed.length && state.ap >= AP_MAX) {
      return { ok: false, error: '至少签发一项命令，或把本轮注意力全部用于处理既有命令，才能结束本回合。', code: 'NO_CHOICE' };
    }
    if (state.lastSettledRound >= state.round) {
      return { ok: false, error: '本回合已经结算过，不能重复。', code: 'DUPLICATE' };
    }
    const event = getEvent(state);
    if (!event) return { ok: false, error: '事件数据缺失。', code: 'EVENT' };
    const unauthorized = (state.commands || []).filter(function (command) {
      return command.round === state.round && command.status === 'issued';
    });
    if (unauthorized.length) {
      return {
        ok: false,
        error: '还有 ' + unauthorized.length + ' 项命令没有授权或委派。请先处理，避免命令空转。',
        code: 'UNAUTHORIZED',
        commands: unauthorized
      };
    }

    const commandResults = [];
    /* 旧一日已执行、等待反馈的命令先归档并释放机构名额；跨日占用不会无限延续。 */
    (state.commands || []).forEach(function (command) {
      if (command.kind !== 'communication' && command.status === 'awaiting_feedback' && command.round < state.round) {
        completeCommand(command, state);
        commandResults.push(commandResult(command, { archived: true, note: '旧命令反馈核验，释放机构名额' }));
      }
    });
    const currentCommands = (state.commands || []).filter(function (command) {
      return command.kind !== 'communication' && ['issued', 'executing', 'blocked'].indexOf(command.status) !== -1 && !command.effectsApplied;
    });
    for (let i = 0; i < currentCommands.length; i += 1) {
      const result = processNightCommand(state, currentCommands[i]);
      if (result) commandResults.push(result);
    }
    state.lastSettledRound = state.round;
    const pressureBefore = state.pressure;
    const pressureRise = event.pressureRise;
    state.pressure = clamp(state.pressure + pressureRise, 0, 100);

    let earlyEnding = checkCollapse(state);
    if (earlyEnding) {
      finalizeEnding(state, earlyEnding);
      return { ok: true, ending: state.ending, commandResults: commandResults, delayed: [], attrition: {}, pressure: { before: pressureBefore, rise: pressureRise, after: state.pressure } };
    }

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
        commandResults: commandResults,
        pressure: { before: pressureBefore, rise: pressureRise, after: state.pressure },
        attrition: attritionResult.deltas
      };
    }

    state.round += 1;
    state.ap = state.apMax;
    state.executed = [];
    state.coordinationThisRound = {};
    state.communicationsThisRound = {};
    const delayed = resolveDueDelayed(state, state.round);

    ending = checkCollapse(state);
    if (ending) {
      finalizeEnding(state, ending);
      return {
        ok: true,
        ending: state.ending,
        commandResults: commandResults,
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
      commandResults: commandResults,
      blocked: commandResults.filter(function (item) { return item.status === 'blocked'; }),
      alarms: getAlarms(state),
      ap: state.ap
    };
    return {
      ok: true,
      ending: null,
      interlude: state.interlude,
      pressure: state.interlude.pressure,
      attrition: attritionResult.deltas,
      delayed: delayed,
      commandResults: commandResults
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
    ending.commands = (state.commands || []).map(function (command) { return Object.assign({}, command); });
    ending.commandSummary = getCommandCounts(state);
    ending.agencies = JSON.parse(JSON.stringify(state.agencies || {}));
    ending.commandChains = getCommandChains(state, 3);
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
      const existing = root.localStorage.getItem(SAVE_KEY);
      if (existing) {
        try {
          const old = JSON.parse(existing);
          if (old && old.version === 1 && !root.localStorage.getItem(BACKUP_KEY)) {
            root.localStorage.setItem(BACKUP_KEY, existing);
          }
        } catch (ignore) {}
      }
      state.schemaVersion = 2;
      state.version = VERSION;
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
      if (!data || !data.state || (data.version !== 1 && data.version !== 2)) return null;
      const state = normalizeLoadedState(data.state, data.version);
      if (!state) return null;
      return { version: data.version, migratedFrom: data.version === 1 ? 1 : null, savedAt: data.savedAt, state: state };
    } catch (error) {
      return null;
    }
  }

  function normalizeLoadedState(input, sourceVersion) {
    if (!input || typeof input !== 'object') return null;
    if (!Number.isInteger(input.round) || input.round < 1 || input.round > FINAL_ROUND) return null;
    if (!input.stats || typeof input.stats !== 'object') return null;

    const stats = {};
    STAT_KEYS.forEach(function (key) {
      stats[key] = clamp(input.stats[key], 0, 100);
    });
    const phase = ['briefing', 'interlude', 'ending'].indexOf(input.phase) !== -1 ? input.phase : 'briefing';
    const choices = Array.isArray(input.choices) ? input.choices : [];
    const commands = Array.isArray(input.commands) ? input.commands.filter(function (command) {
      return command && typeof command.id === 'string';
    }).map(function (command) {
      const copy = Object.assign({}, command);
      if (COMMAND_STATUSES.indexOf(copy.status) === -1) copy.status = copy.effectsApplied ? 'awaiting_feedback' : 'issued';
      if (!Array.isArray(copy.followedRounds)) copy.followedRounds = [];
      if (copy.requiredCoordination === undefined) copy.requiredCoordination = false;
      if (copy.accepted === undefined) copy.accepted = ['executing', 'blocked', 'awaiting_feedback'].indexOf(copy.status) !== -1 && copy.kind !== 'communication';
      if (copy.deadlineRound === undefined) copy.deadlineRound = Math.min(FINAL_ROUND, copy.round + STRATEGY.windowRounds);
      if (copy.windowRounds === undefined) copy.windowRounds = STRATEGY.windowRounds;
      if (copy.blockedCode === undefined) copy.blockedCode = null;
      if (copy.delegatedRound === undefined) copy.delegatedRound = null;
      if (copy.handoffRound === undefined) copy.handoffRound = null;
      if (!Array.isArray(copy.history)) copy.history = [];
      if (copy.slotRequired === undefined) copy.slotRequired = !!copy.requiredCoordination || Number(copy.ap) >= 2;
      return copy;
    }) : choices.map(function (record, index) {
      const id = record.commandId || ('legacy:' + record.round + ':' + record.choiceId + ':' + index);
      return {
        id: id, kind: 'authorization', round: record.round, eventId: record.eventId,
        choiceId: record.choiceId, title: record.label, ap: record.ap, agency: record.agency || 'office',
        executorId: record.agency || 'office', status: 'completed', authorizedAt: null,
        requiredCoordination: false, coordinated: true, delegated: false, delegateRound: null, effectsApplied: true,
        accepted: false, deadlineRound: Math.min(FINAL_ROUND, record.round + STRATEGY.windowRounds),
        windowRounds: STRATEGY.windowRounds, blockedCode: null, history: [],
        blockedReason: null, followedRounds: [], completedRound: record.round,
        result: { deltas: record.deltas || {}, pressureDelta: record.pressureDelta || 0 }
      };
    });
    const seenCommands = {};
    const uniqueCommands = commands.filter(function (command) {
      if (seenCommands[command.id]) return false;
      seenCommands[command.id] = true;
      return true;
    });
    const agencies = defaultAgencies();
    if (input.agencies && typeof input.agencies === 'object') {
      Object.keys(input.agencies).forEach(function (id) {
        if (agencies[id]) agencies[id] = Object.assign(agencies[id], input.agencies[id]);
      });
    }
    Object.keys(agencies).forEach(function (id) { agencies[id].workload = 0; });
    uniqueCommands.forEach(function (command) {
      if (command.accepted && !isTerminalCommand(command) && agencies[command.executorId]) {
        agencies[command.executorId].workload += 1;
      }
    });
    const state = {
      version: VERSION,
      schemaVersion: 2,
      migratedFrom: sourceVersion === 1 ? 1 : (input.migratedFrom || null),
      round: input.round,
      ap: clamp(input.ap, 0, AP_MAX),
      apMax: AP_MAX,
      stats: stats,
      pressure: clamp(input.pressure, 0, 100),
      flags: input.flags && typeof input.flags === 'object' ? input.flags : {},
      executed: Array.isArray(input.executed) ? input.executed.filter(function (v) { return typeof v === 'string'; }) : [],
      choices: choices,
      commands: uniqueCommands,
      effects: Array.isArray(input.effects) ? input.effects : [],
      agencies: agencies,
      intelState: input.intelState && typeof input.intelState === 'object' ? input.intelState : {},
      coordinationThisRound: input.coordinationThisRound && typeof input.coordinationThisRound === 'object' ? input.coordinationThisRound : {},
      communicationsThisRound: input.communicationsThisRound && typeof input.communicationsThisRound === 'object' ? input.communicationsThisRound : {},
      pending: Array.isArray(input.pending) ? input.pending : [],
      resolved: Array.isArray(input.resolved) ? input.resolved : [],
      lastSettledRound: Number.isInteger(input.lastSettledRound) ? input.lastSettledRound : Math.max(0, input.round - 1),
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
    backupKey: BACKUP_KEY,
    events: EVENTS,
    meta: META,
    statKeys: STAT_KEYS,
    statMeta: STAT_META,
    apMax: AP_MAX,
    finalRound: FINAL_ROUND,
    thresholds: FINAL_THRESHOLDS,
    collapseLines: COLLAPSE_LINES,
    intel: INTEL,
    commandStatuses: COMMAND_STATUSES,
    commandLabels: COMMAND_LABELS,
    createGame: createGame,
    getEvent: getEvent,
    getChoice: getChoice,
    getChoiceStatus: getChoiceStatus,
    getExclusiveConflict: getExclusiveConflict,
    requiresCoordination: needsCoordination,
    getAvailableChoices: getAvailableChoices,
    getPressureForecast: getPressureForecast,
    getAlarms: getAlarms,
    getIntelReports: getIntelReports,
    getIntelReport: getIntelReport,
    markIntelRead: markIntelRead,
    toggleIntelPin: toggleIntelPin,
    inquireIntel: inquireIntel,
    getCommandCounts: getCommandCounts,
    getCommandChains: getCommandChains,
    getAgencyLoad: getAgencyLoad,
    getAgencyLoads: getAgencyLoads,
    getCommandPreview: getCommandPreview,
    getExecutionRisks: getExecutionRisks,
    strategy: STRATEGY,
    issueCommand: issueCommand,
    authorizeCommand: authorizeCommand,
    followUpCommand: followUpCommand,
    delegateCommand: delegateCommand,
    cancelCommand: cancelCommand,
    coordinateAgency: coordinateAgency,
    communicate: communicate,
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
