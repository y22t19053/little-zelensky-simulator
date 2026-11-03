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
  const STRAT = root.LZS_STRATEGY || { dayFocus: {}, timeProfiles: {}, kindLabels: {}, links: [], interventionBacklog: { windowDays: 3, minDays: 3 }, standing: { cost: 1, minCoordination: 45, nightlyDrift: -1, interventionExtra: 3 }, dispatchText: {}, styleMeta: {}, recordsKey: 'lzs_records_v1' };
  const VERSION = 3;
  const SAVE_KEY = 'lzs_save_v1';
  const BACKUP_KEY = 'lzs_save_v1_legacy_backup';
  const AP_MAX = META.apPerRound || 3;
  const FINAL_ROUND = EVENTS.length;
  /* v0.6：基辅战役（2/24—4/2）。classic 七日模式保持原常量与存档键不变。 */
  const CAMPAIGN = root.LZS_CAMPAIGN || null;
  const CAMPAIGN_EVENTS = CAMPAIGN ? CAMPAIGN.events : [];
  const WRAP_EVENTS = CAMPAIGN && CAMPAIGN.wrapupEvents ? CAMPAIGN.wrapupEvents : [];
  const CAMPAIGN_VERSION = 4;

  function isCampaign(state) { return !!(state && state.scenario === 'campaign' && CAMPAIGN); }
  function eventsFor(state) { return isCampaign(state) ? (state.wrapup && state.wrapup.started ? CAMPAIGN_EVENTS.concat(WRAP_EVENTS) : CAMPAIGN_EVENTS) : EVENTS; }
  function totalDaysFor(state) { return state && state.wrapup && state.wrapup.started ? 52 : (CAMPAIGN.totalDays || 38); }
  function finalRoundFor(state) { return eventsFor(state).length; }
  function apMaxFor(state, round) {
    if (!isCampaign(state)) return AP_MAX;
    const event = eventsFor(state)[(round || state.round) - 1];
    return event && event.ap ? event.ap : AP_MAX;
  }
  function findEventById(id) {
    return EVENTS.filter(function (item) { return item.id === id; })[0] || CAMPAIGN_EVENTS.filter(function (item) { return item.id === id; })[0] || WRAP_EVENTS.filter(function (item) { return item.id === id; })[0] || null;
  }
  function flagsMatch(flags, when) {
    if (!when) return true;
    const f = flags || {};
    if (when.all && !when.all.every(function (id) { return !!f[id]; })) return false;
    if (when.any && !when.any.some(function (id) { return !!f[id]; })) return false;
    if (when.none && when.none.some(function (id) { return !!f[id]; })) return false;
    return true;
  }
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
      dateLabel: eventsFor(state)[state.round - 1] ? eventsFor(state)[state.round - 1].dateLabel : '',
      type: type,
      title: title,
      text: text || ''
    });
    if (state.log.length > 160) state.log.shift();
  }

  function getEvent(state) {
    return eventsFor(state)[state.round - 1] || null;
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

  function getChoiceStatus(state, choiceId, opts) {
    const event = getEvent(state);
    const choice = getChoice(event, choiceId);
    if (!choice) {
      return { canIssue: false, state: 'missing', message: '未找到这项决策。', conflict: null };
    }
    if (isChoiceExecuted(state, choice.id)) {
      return { canIssue: false, state: 'issued', message: '这项命令已经签发。', conflict: null };
    }
    if (choice.requires && !flagsMatch(state.flags, choice.requires)) {
      return { canIssue: false, state: 'locked', message: choice.requireNote || '前置条件没有形成，这项命令目前不可执行。', conflict: null };
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
    const needAp = apCostFor(state, choice, opts && opts.delegate);
    if (state.ap < needAp) {
      return {
        canIssue: false,
        state: 'ap',
        message: '注意力不足：这项命令需要 ' + needAp + ' AP，当前只剩 ' + state.ap + ' AP。',
        conflict: null
      };
    }
    return { canIssue: true, state: 'available', message: '', conflict: null };
  }

  /* ---------- v0.7.0 战役：常设授权范围与委派 ---------- */

  function standingRecord(state, agencyId) {
    const rec = state && state.standing ? state.standing[agencyId] : null;
    return rec && rec.active ? rec : null;
  }

  /* 持有授权但机构在办已满或协调过低时，授权暂停：新事项回到总统桌面。 */
  function standingSuspension(state, agencyId) {
    if (!standingRecord(state, agencyId)) return null;
    const load = getAgencyLoad(state, agencyId);
    const floor = (STRAT.standing || {}).suspendBelow || 40;
    if (load.overloaded) return '机构在办已满（' + load.workload + '/' + load.capacity + '）';
    if (load.coordination < floor) return '协调余量只有 ' + load.coordination;
    return null;
  }

  /* 例行事项：1 AP 以内、不是关键决策、不需要跨部门召集、不需要先确认情报。 */
  function isRoutineChoice(state, choice, agencyId) {
    if (!choice || choice.keyDecision || choice.ap > 1) return false;
    if (choice.noStanding) return false;
    if (needsCoordination(state, choice, agencyId)) return false;
    return true;
  }

  function standingCovers(state, choice, agencyId) {
    if (!isCampaign(state) || !standingRecord(state, agencyId)) return false;
    if (standingSuspension(state, agencyId)) return false;
    return isRoutineChoice(state, choice, agencyId);
  }

  function apCostFor(state, choice, delegate) {
    if (!isCampaign(state)) return choice.ap;
    if (delegate) return 0;
    if (standingCovers(state, choice, agencyForChoice(choice))) return 0;
    return choice.ap;
  }

  function delegatedThisRound(state) {
    return (state.commands || []).filter(function (command) {
      return command.delegation && command.round === state.round && command.status !== 'cancelled';
    }).length;
  }

  /* 委派检查：不修改状态，供界面和签发共用。 */
  function checkDelegation(state, choiceId, options) {
    if (!isCampaign(state)) return { ok: false, error: '七日模式沿用交接式委派。', code: 'MODE' };
    const event = getEvent(state);
    const choice = getChoice(event, choiceId);
    if (!choice) return { ok: false, error: '未找到这项命令。', code: 'NOT_FOUND' };
    const D = STRAT.delegation || {};
    const agency = agencyForChoice(choice);
    if (choice.keyDecision || choice.ap > 1) return { ok: false, error: '重大决策需要总统本人签署，不能委派。', code: 'MAJOR' };
    if (choice.noStanding) return { ok: false, error: '这项事务涉及新的政治表态，需要总统本人决定。', code: 'MAJOR' };
    if (needsCoordination(state, choice, agency)) return { ok: false, error: '这项事务需要跨部门召集，由总统牵头，不能整体委派。', code: 'COORDINATION' };
    if (requiresIntelClarification(state, event, choice)) return { ok: false, error: '这项事务缺少已确认的情报，不能交给机构自行处理。', code: 'INFO' };
    const load = getAgencyLoad(state, agency);
    if (load.overloaded) return { ok: false, error: load.label + '在办已满（' + load.workload + '/' + load.capacity + '），接不下新任务。', code: 'CAPACITY' };
    if (load.coordination < (D.minCoordination || 45)) return { ok: false, error: load.label + '协调余量只有 ' + load.coordination + '，低于 ' + (D.minCoordination || 45) + '，不适合自行办理。', code: 'COORDINATION' };
    if (delegatedThisRound(state) >= (D.perWindowCap || 3)) return { ok: false, error: '本窗口已经委派了 ' + (D.perWindowCap || 3) + ' 项事务，机构无法同时接下更多。', code: 'CAP' };
    if (options && options.returnForApproval && state.round >= finalRoundFor(state)) {
      return { ok: false, error: '这是最后一个窗口，没有下一份简报可供批准；请选择授权范围内自行办理。', code: 'FINAL' };
    }
    return { ok: true, agency: agency, choice: choice };
  }

  /* 委派所得的完成质量：协调余量决定。只折扣收益，代价照付。 */
  function delegationQuality(state, command) {
    const D = STRAT.delegation || {};
    if (!command.delegation || command.delegation.mode === 'approval') return 1;
    const coordination = getAgencyLoad(state, command.agency).coordination;
    return coordination >= (D.fullQualityAt || 60) ? 1 : (D.reducedQuality || 0.7);
  }

  function scaleEffects(effects, scale) {
    const out = {};
    Object.keys(effects || {}).forEach(function (key) {
      const value = effects[key];
      const beneficial = key === 'pressure' ? value < 0 : value > 0;
      if (!value || !beneficial || scale >= 1) { out[key] = value; return; }
      const scaled = Math.max(1, Math.round(Math.abs(value) * scale));
      out[key] = value < 0 ? -scaled : scaled;
    });
    return out;
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
    return choice.agency || CHOICE_AGENCY[choice.id] || 'office';
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
    /* v0.6 战役关键决策由总统直接签署授权：代价体现在 AP、不可逆性和后续回响，不再叠加跨部门召集。 */
    if (choice.keyDecision) return false;
    const agency = agencyId || agencyForChoice(choice);
    const affected = STAT_KEYS.filter(function (key) { return !!choice.effects && !!choice.effects[key]; }).length;
    let required = choice.ap >= 2 || affected >= 5;
    if (!state) return required;
    if (state.stats.gov <= 35 && ['office', 'interior', 'communications'].indexOf(agency) !== -1) required = true;
    if (state.stats.intl <= 28 && agency === 'foreign' && (choice.effects.intl || 0) > 0) required = true;
    if (state.stats.reserve <= 24 && (choice.effects.reserve || 0) <= -4) required = true;
    const link = getLinkEffect(state, choice.id);
    if (link && link.coordination === 'require') required = true;
    if (link && link.coordination === 'relax' && required && state.stats.gov > 35) required = false;
    return required;
  }

  /* v0.5 时间属性：未列出的选项保持 v0.4 的一日短期窗口。 */
  function timeProfileFor(choiceId) {
    const profile = (STRAT.timeProfiles || {})[choiceId];
    const base = { kind: 'short', windowRounds: STRATEGY.windowRounds, holdRounds: 0, resurface: false, note: '' };
    if (!profile && /^c_/.test(choiceId)) {
      const campaignChoice = findChoiceAnywhere(choiceId);
      if (campaignChoice && campaignChoice.keyDecision) return Object.assign(base, { kind: 'urgent', windowRounds: 0, note: '关键决策：只能在本窗口执行。' });
    }
    return profile ? Object.assign(base, profile) : base;
  }

  /* 路径依赖：已结束的前序命令（completed / awaiting_feedback 或 expired）决定后续命令的协调条件。 */
  function getLinkEffect(state, choiceId) {
    if (!state || !state.commands) return null;
    const links = (STRAT.links || []).filter(function (link) { return link.target === choiceId; });
    let found = null;
    links.forEach(function (link) {
      const source = state.commands.filter(function (command) {
        return command.choiceId === link.from && command.kind !== 'communication';
      })[0];
      if (!source) return;
      const done = source.effectsApplied && ['awaiting_feedback', 'completed'].indexOf(source.status) !== -1;
      const lost = source.status === 'expired';
      if ((link.when === 'completed' && done) || (link.when === 'expired' && lost)) {
        found = Object.assign({ sourceCommandId: source.id }, link);
      }
    });
    return found;
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
      slotRequired: needsCoordination(state, choice, agency) || choice.ap >= 2 || timeProfileFor(choice.id).kind === 'commitment',
      requiresIntel: requiresIntelClarification(state, event, choice),
      intelSatisfied: isIntelSatisfied(state, { requiresIntel: requiresIntelClarification(state, event, choice), intelReportId: event.id + ':military' }),
      deadlineRound: Math.min(finalRoundFor(state), state.round + timeProfileFor(choice.id).windowRounds),
      timeKind: timeProfileFor(choice.id).kind,
      kindLabel: (STRAT.kindLabels || {})[timeProfileFor(choice.id).kind] || '短期窗口',
      timeNote: timeProfileFor(choice.id).note || '',
      holdRounds: timeProfileFor(choice.id).holdRounds || 0,
      link: getLinkEffect(state, choice.id),
      standing: !!(state.standing && state.standing[agency] && state.standing[agency].active),
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

  function createGame(options) {
    const campaignMode = !!(options && options.scenario === 'campaign' && CAMPAIGN);
    const stats = {};
    STAT_KEYS.forEach(function (key) {
      stats[key] = clamp(META.initialStats[key], 0, 100);
    });
    const state = {
      version: VERSION,
      schemaVersion: campaignMode ? CAMPAIGN_VERSION : 3,
      scenario: campaignMode ? 'campaign' : 'classic',
      round: 1,
      ap: campaignMode ? (CAMPAIGN_EVENTS[0].ap || AP_MAX) : AP_MAX,
      apMax: campaignMode ? (CAMPAIGN_EVENTS[0].ap || AP_MAX) : AP_MAX,
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
      standing: {},
      aid: { lines: [] },
      wrapup: null,
      dispatches: [],
      interventionRounds: [],
      timeline: [],
      startedAt: new Date().toISOString(),
      runId: Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)
    };
    if (campaignMode) {
      state.version = CAMPAIGN_VERSION;
      state.campaign = { day: 1, carryDays: 0, interruptions: [], entered: [], echoes: [], attritionCarry: {}, windows: [] };
    }
    recordTimeline(state);
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

  /*
   * 援助生命周期：choice.aid 指向 CAMPAIGN.aidLines 中的一条线，签发后逐窗口推进。
   * 效果只在对应阶段到达时生效；gate 不满足则顺延，顺延过多则停滞。
   */
  function aidSpec(id) { return ((CAMPAIGN && CAMPAIGN.aidLines) || {})[id] || null; }

  function startAidLine(state, choice, command) {
    if (!isCampaign(state) || !choice || !choice.aid) return null;
    const spec = aidSpec(choice.aid);
    if (!spec) return null;
    state.aid = state.aid || { lines: [] };
    if (state.aid.lines.some(function (line) { return line.id === choice.aid; })) return null;
    const warm = (spec.warm || []).some(function (flag) { return state.flags[flag]; });
    const first = spec.stages[0];
    const delay = Math.max(1, (first.delay || 1) - (warm && (first.delay || 1) > 1 ? 1 : 0));
    const line = { id: choice.aid, choiceId: choice.id, title: spec.label, startedRound: state.round, stage: -1, nextRound: state.round + delay, slips: 0, stalled: false, done: false, warm: warm, log: [] };
    state.aid.lines.push(line);
    return line;
  }

  function aidGateMet(state, gate) {
    if (!gate) return true;
    const stats = gate.minStat || {};
    const low = Object.keys(stats).some(function (key) { return state.stats[key] < stats[key]; });
    if (low) return false;
    return !(gate.none || []).some(function (flag) { return state.flags[flag]; });
  }

  function advanceAidLines(state) {
    const events = [];
    if (!isCampaign(state) || !state.aid) return events;
    state.aid.lines.forEach(function (line) {
      if (line.done || line.stalled || state.round < line.nextRound) return;
      const spec = aidSpec(line.id);
      if (!spec) return;
      const stage = spec.stages[line.stage + 1];
      if (!stage) { line.done = true; return; }
      if (!aidGateMet(state, stage.gate)) {
        line.slips += 1;
        if (line.slips > (spec.maxSlips || 2)) {
          line.stalled = true;
          const entry = { round: state.round, stage: stage.key, label: spec.label + '停滞', note: '条件一直没有满足，' + stage.label + '无法推进，需要重新协调。', stalled: true };
          line.log.push(entry); events.push(Object.assign({ lineId: line.id }, entry));
          addLog(state, 'aid', entry.label, entry.note);
        } else {
          line.nextRound = state.round + 1;
          const entry = { round: state.round, stage: stage.key, label: spec.label + '推迟', note: stage.label + '的条件尚未具备，顺延一个窗口。', slipped: true };
          line.log.push(entry); events.push(Object.assign({ lineId: line.id }, entry));
          addLog(state, 'aid', entry.label, entry.note);
        }
        return;
      }
      const res = applyEffectValues(state, stage.effects);
      line.stage += 1;
      const following = spec.stages[line.stage + 1];
      if (following) line.nextRound = state.round + Math.max(1, following.delay || 1); else line.done = true;
      const entry = { round: state.round, stage: stage.key, label: stage.label, note: stage.note, deltas: res.deltas, final: !following };
      line.log.push(entry); events.push(Object.assign({ lineId: line.id, title: spec.label }, entry));
      addLog(state, 'aid', spec.label + '：' + stage.label, stage.note + (Object.keys(res.deltas).length ? '（' + formatDeltaText(res.deltas, 0) + '）' : ''));
    });
    return events;
  }

  /* 供界面显示：每条援助线当前走到哪里、下一步预计何时。 */
  function getAidStatus(state) {
    const lines = (state.aid && state.aid.lines) || [];
    return lines.map(function (line) {
      const spec = aidSpec(line.id);
      const total = spec ? spec.stages.length : 0;
      const current = spec && line.stage >= 0 ? spec.stages[line.stage] : null;
      const next = spec ? spec.stages[line.stage + 1] : null;
      let status = '请求已提交';
      if (line.done) status = '已全部落实'; else if (line.stalled) status = '停滞，需要重新协调'; else if (current) status = current.label;
      return { id: line.id, title: line.title, status: status, stage: line.stage + 1, total: total, next: next && !line.done && !line.stalled ? next.label : null, etaRounds: next && !line.done && !line.stalled ? Math.max(0, line.nextRound - state.round) : null, stalled: line.stalled, done: line.done, log: line.log.slice() };
    });
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
        when: item.when || null,
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
    const quality = isCampaign(state) ? delegationQuality(state, command) : 1;
    if (command.delegation) command.delegation.quality = quality;
    const appliedEffects = quality < 1 ? scaleEffects(choice.effects, quality) : choice.effects;
    const result = applyEffectValues(state, appliedEffects);
    const modifierNotes = [];
    (choice.modifiers || []).forEach(function (modifier) {
      if (!flagsMatch(state.flags, modifier.when)) return;
      const extra = applyEffectValues(state, modifier.effects);
      Object.keys(extra.deltas).forEach(function (key) { result.deltas[key] = (result.deltas[key] || 0) + extra.deltas[key]; });
      result.pressureDelta += extra.pressureDelta;
      if (modifier.note) modifierNotes.push(modifier.note);
    });
    if (modifierNotes.length) {
      result.modifierNotes = modifierNotes;
      addLog(state, 'echo', '前序命令改变了执行结果：' + choice.title, modifierNotes.join(' '));
    }
    if (choice.flags && choice.flags.length) {
      choice.flags.forEach(function (flag) { state.flags[flag] = true; });
      if (choice.wrap) applyWrapTracks(state, choice.wrap);
    }
    state.effects.push({
      id: effectId,
      commandId: command.id,
      kind: 'immediate',
      status: 'applied',
      appliedRound: state.round,
      effects: Object.assign({}, appliedEffects),
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
    const delegateMode = options && options.delegate ? (options.returnForApproval ? 'approval' : 'autonomous') : null;
    if (delegateMode) {
      const check = checkDelegation(state, choiceId, { returnForApproval: delegateMode === 'approval' });
      if (!check.ok) return check;
    }
    const status = getChoiceStatus(state, choiceId, { delegate: !!delegateMode });
    if (!status.canIssue) {
      const code = status.state === 'issued' ? 'DUPLICATE' : status.state === 'conflict' ? 'CONFLICT' : status.state === 'ap' ? 'AP' : 'UNAVAILABLE';
      return { ok: false, error: status.message, code: code, conflict: status.conflict };
    }
    const id = 'r' + state.round + ':' + event.id + ':' + choice.id;
    if (findCommand(state, id)) return { ok: false, error: '这项命令已经建档。', code: 'DUPLICATE' };
    const agency = agencyForChoice(choice);
    const viaStanding = !delegateMode && standingCovers(state, choice, agency);
    const paidAp = apCostFor(state, choice, !!delegateMode);
    const profile = timeProfileFor(choice.id);
    const link = getLinkEffect(state, choice.id);
    const command = {
      id: id,
      kind: 'authorization',
      timeKind: profile.kind,
      holdRounds: profile.holdRounds || 0,
      holdUntilRound: null,
      resurface: !!profile.resurface,
      resurfaced: false,
      linkNote: link ? link.note : null,
      linkCoordination: link ? link.coordination : null,
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
      slotRequired: needsCoordination(state, choice, agency) || choice.ap >= 2 || profile.kind === 'commitment',
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
      deadlineRound: Math.min(finalRoundFor(state), state.round + profile.windowRounds),
      windowRounds: profile.windowRounds,
      expedited: false,
      cancelledRound: null,
      expiredRound: null,
      followedRounds: [],
      history: [],
      createdAt: new Date().toISOString()
    };
    state.ap -= paidAp;
    command.paidAp = paidAp;
    if (delegateMode) {
      const D = STRAT.delegation || {};
      const deadline = Math.min(finalRoundFor(state), state.round + (profile.windowRounds || 1) + (delegateMode === 'approval' ? 0 : 0));
      command.delegated = true;
      command.delegatedRound = state.round;
      command.coordinated = true;
      command.deadlineRound = Math.max(command.deadlineRound, deadline);
      command.delegation = {
        mode: delegateMode,
        returnForApproval: delegateMode === 'approval',
        agencyId: agency,
        issuedRound: state.round,
        deadlineRound: command.deadlineRound,
        quality: null,
        approvedRound: null
      };
      if (state.agencies[agency]) state.agencies[agency].coordination = clamp(state.agencies[agency].coordination - (D.briefingCoordination || 2), 0, 100);
    }
    if (viaStanding) command.viaStanding = true;
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
      ap: paidAp,
      agency: agency,
      status: 'issued',
      deltas: {},
      pressureDelta: 0,
      scheduled: []
    });
    const agencyLabel = getAgency(agency) ? getAgency(agency).label : '总统办公室';
    if (delegateMode) {
      const deadlineDay = command.deadlineRound;
      addCommandLog(state, command, '委派：' + choice.title,
        '任务交给' + agencyLabel + '，授权范围限于本事项，期限为第 ' + deadlineDay + ' 个窗口；' +
        (delegateMode === 'approval' ? '办理方案送回总统批准后才会执行，完成质量不打折。' : '机构在授权内自行办理，办完回报，不再占用总统注意力。'));
      if (link) addCommandLog(state, command, (link.coordination === 'relax' ? '前期准备生效：' : '前期事务失效的后果：') + choice.title, link.note);
      if (delegateMode === 'approval') {
        command.status = 'blocked';
        command.blockedCode = 'APPROVAL';
        command.blockedReason = agencyLabel + '已拟好办理方案，等待总统批准（下一份简报起可批）。';
        if (command.record) command.record.status = 'blocked';
        const rec = state.choices[state.choices.length - 1];
        if (rec) rec.status = 'blocked';
        return { ok: true, command: command, choice: choice, delegated: true, awaitingApproval: true };
      }
      const delegatedAuth = authorizeCommand(state, command.id);
      return { ok: true, command: command, choice: choice, delegated: true, blocked: !!delegatedAuth.blocked };
    }
    addCommandLog(state, command, '签发：' + choice.title, '命令已建档并交给' + agencyLabel + '。尚未授权执行。');
    if (link) {
      addCommandLog(state, command, (link.coordination === 'relax' ? '前期准备生效：' : '前期事务失效的后果：') + choice.title, link.note);
    }
    if (viaStanding || (!isCampaign(state) && state.standing && state.standing[agency] && state.standing[agency].active)) {
      const auto = authorizeCommand(state, command.id);
      if (auto.ok) {
        command.autoAuthorized = true;
        if (viaStanding) {
          const rec = standingRecord(state, agency);
          if (rec) rec.handled = (rec.handled || 0) + 1; (rec.items = rec.items || []).push({ round: state.round, choiceId: choice.id, title: choice.title });
          if (state.agencies[agency]) state.agencies[agency].coordination = clamp(state.agencies[agency].coordination - ((STRAT.standing || {}).wearPerItem || 1), 0, 100);
          addCommandLog(state, command, '常设授权内办理：' + choice.title, '属于' + agencyLabel + '的常设授权范围，机构直接接收，不占用总统注意力；机构为此多承担了一份例行工作。');
        } else {
          addCommandLog(state, command, '常设授权自动接收：' + choice.title, '该机构持有总统常设授权，签发即进入执行队列，无需逐项授权。');
        }
      }
      return { ok: true, command: command, choice: choice, autoAuthorized: !!auto.ok, blocked: !!auto.blocked, viaStanding: viaStanding };
    }
    return { ok: true, command: command, choice: choice };
  }

  /* 批准委派机构拟好的办理方案：不耗 AP，下一份简报起可批，当晚执行，质量满额。 */
  function approveDelegated(state, commandId) {
    if (!state || state.phase !== 'briefing') return { ok: false, error: '当前阶段不能批准。', code: 'PHASE' };
    const command = findCommand(state, commandId);
    if (!command || !command.delegation || command.blockedCode !== 'APPROVAL') return { ok: false, error: '这项事务没有待批准的办理方案。', code: 'STATUS' };
    if (state.round <= command.delegation.issuedRound) return { ok: false, error: '机构还在拟定方案，下一份简报才能批准。', code: 'EARLY' };
    if (command.deadlineRound && state.round > command.deadlineRound) return { ok: false, error: '已经超过办理期限。', code: 'EXPIRED' };
    clearCommandBlock(command);
    command.status = 'executing';
    command.delegation.approvedRound = state.round;
    command.slotRequired = false;
    const slot = reserveAgencySlot(state, command);
    if (!slot.ok) return { ok: true, command: command, blocked: true };
    if (command.record) command.record.status = command.status;
    const rec = state.choices.filter(function (item) { return item.commandId === command.id; })[0];
    if (rec) rec.status = 'executing';
    addCommandLog(state, command, '批准办理方案：' + command.title, '总统批准了机构拟定的方案，今夜执行，不另耗注意力。');
    return { ok: true, command: command };
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
    const event = findEventById(command.eventId);
    const choice = event ? getChoice(event, command.choiceId) : null;
    if (!choice) return { ok: false, error: '命令来源数据缺失。', code: 'EVENT' };
    const result = applyImmediateRecord(state, command, choice);
    const scheduled = scheduleDelayed(state, event, choice, command.id);
    startAidLine(state, choice, command);
    command.effectsApplied = true;
    command.status = 'awaiting_feedback';
    command.executedRound = state.round;
    command.executedLate = state.round > command.round;
    if (command.timeKind === 'commitment' && command.holdRounds > 0) {
      command.holdUntilRound = Math.min(finalRoundFor(state), state.round + command.holdRounds);
    }
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
        const standingExtra = state.standing && state.standing[previousAgency] && state.standing[previousAgency].active ? (STRAT.standing.interventionExtra || 0) : 0;
        state.agencies[previousAgency].coordination = clamp(state.agencies[previousAgency].coordination - STRATEGY.interventionCoordinationCost - standingExtra, 0, 100);
      }
      if (!Array.isArray(state.interventionRounds)) state.interventionRounds = [];
      if (state.interventionRounds.indexOf(state.round) === -1) state.interventionRounds.push(state.round);
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

  /*
   * 常设授权：总统一次性把例行执行权交给一个机构（1 AP，需协调 >= 45）。
   * 此后该机构的新命令签发即自动授权；代价是每夜协调 -1，且总统介入该机构命令时多付协调。
   */
  function grantStanding(state, agencyId) {
    if (!state || state.phase !== 'briefing') return { ok: false, error: '当前阶段不能授予常设授权。', code: 'PHASE' };
    const spec = STRAT.standing || {};
    const cost = spec.cost || 1;
    if (!getAgency(agencyId) || !state.agencies[agencyId]) return { ok: false, error: '未找到这个机构。', code: 'AGENCY' };
    if (!state.standing) state.standing = {};
    if (state.standing[agencyId] && state.standing[agencyId].active) return { ok: false, error: '这个机构已经持有常设授权。', code: 'DUPLICATE' };
    if (state.ap < cost) return { ok: false, error: '授予常设授权需要 ' + cost + ' AP。', code: 'AP' };
    const load = getAgencyLoad(state, agencyId);
    if (load.coordination < (spec.minCoordination || 45)) {
      return { ok: false, error: '机构协调余量 ' + load.coordination + '，低于 ' + (spec.minCoordination || 45) + '：协调不足的机构不能自主运转。', code: 'COORDINATION' };
    }
    state.ap -= cost;
    const campaignMode = isCampaign(state);
    const scopes = spec.scopes || {};
    state.standing[agencyId] = {
      active: true,
      grantedRound: state.round,
      expiresRound: campaignMode ? state.round + (spec.durationWindows || 4) : null,
      scope: campaignMode ? (scopes[agencyId] || '本机构职责内的例行事务') : null,
      handled: 0,
      items: [],
      suspendedRounds: 0,
      endedRound: null,
      endReason: null
    };
    if (campaignMode) {
      addLog(state, 'coordination', '常设授权：' + getAgency(agencyId).label,
        '授权范围：' + state.standing[agencyId].scope + '。有效期到第 ' + state.standing[agencyId].expiresRound + ' 个窗口之前；范围内的例行事务由机构自行办理，不再占用总统注意力。' +
        '重大军事行动、新的政治表态和需要跨部门召集的事项仍然上报总统。机构每办一件事协调余量下降 ' + (spec.wearPerItem || 1) + '，协调不足或在办已满时授权暂停。');
    } else {
      addLog(state, 'coordination', '常设授权：' + getAgency(agencyId).label,
        '此后该机构签发的命令自动进入执行，不再逐项授权。代价：机构每夜协调 ' + (spec.nightlyDrift || -1) + '；总统亲自介入该机构命令时额外消耗 ' + (spec.interventionExtra || 0) + ' 点协调。');
    }
    return { ok: true, agencyId: agencyId };
  }

  /* 撤销常设授权：战役模式付 revokeCost AP 并损失协调；七日模式免费。 */
  function revokeStanding(state, agencyId) {
    if (!state || state.phase !== 'briefing') return { ok: false, error: '当前阶段不能撤销授权。', code: 'PHASE' };
    const rec = standingRecord(state, agencyId);
    if (!rec) return { ok: false, error: '这个机构没有有效的常设授权。', code: 'NONE' };
    const spec = STRAT.standing || {};
    const campaignMode = isCampaign(state);
    const cost = campaignMode ? (spec.revokeCost == null ? 1 : spec.revokeCost) : 0;
    if (state.ap < cost) return { ok: false, error: '撤销授权需要 ' + cost + ' AP。', code: 'AP' };
    state.ap -= cost;
    rec.active = false;
    rec.endedRound = state.round;
    rec.endReason = 'revoked';
    if (campaignMode && state.agencies[agencyId]) {
      state.agencies[agencyId].coordination = clamp(state.agencies[agencyId].coordination - (spec.revokeCoordination == null ? 3 : spec.revokeCoordination), 0, 100);
    }
    addLog(state, 'coordination', '撤销常设授权：' + getAgency(agencyId).label,
      '期间机构自行办理了 ' + (rec.handled || 0) + ' 件事。' + (campaignMode ? '收回授权要重新交接，机构协调余量下降 ' + (spec.revokeCoordination == null ? 3 : spec.revokeCoordination) + '。' : '此后命令恢复逐项授权。'));
    return { ok: true, agencyId: agencyId, handled: rec.handled || 0 };
  }

  /* 窗口交替时：常设授权到期失效；暂停中的授权记一笔，供待办与复盘使用。 */
  function expireStanding(state) {
    if (!isCampaign(state)) return;
    Object.keys(state.standing || {}).forEach(function (agencyId) {
      const rec = state.standing[agencyId];
      if (!rec || !rec.active) return;
      if (rec.expiresRound != null && state.round >= rec.expiresRound) {
        rec.active = false;
        rec.endedRound = state.round;
        rec.endReason = 'expired';
        addLog(state, 'coordination', '常设授权到期：' + getAgency(agencyId).label,
          '有效期已满，期间自行办理了 ' + (rec.handled || 0) + ' 件事。需要继续放手，请重新授予。');
        return;
      }
      const reason = standingSuspension(state, agencyId);
      rec.suspended = reason || null;
      if (reason) {
        rec.suspendedRounds = (rec.suspendedRounds || 0) + 1;
        addLog(state, 'coordination', '常设授权暂停：' + getAgency(agencyId).label, reason + '，授权暂停，新的事项回到总统桌面，直到机构恢复。');
      }
    });
  }

  function getDispatches(state, includeResolved) {
    return (state && state.dispatches || []).filter(function (item) {
      return item.round === state.round && (includeResolved || !item.resolved);
    });
  }

  function dispatchTemplate(type, vars) {
    const tpl = (STRAT.dispatchText || {})[type] || { kicker: '模拟反馈', title: '', body: '', source: '' };
    function fill(text) {
      return String(text || '').replace(/\{(\w+)\}/g, function (all, key) { return vars[key] != null ? vars[key] : ''; });
    }
    return { kicker: tpl.kicker, title: fill(tpl.title), body: fill(tpl.body), source: fill(tpl.source) };
  }

  function addDispatch(state, type, data) {
    if (!Array.isArray(state.dispatches)) state.dispatches = [];
    const id = 'd' + state.round + ':' + type + ':' + (data.key || data.commandId || data.agencyId || 'x');
    if (state.dispatches.some(function (item) { return item.id === id; })) return null;
    const agency = data.agencyId ? getAgency(data.agencyId) : null;
    const text = dispatchTemplate(type, { choice: data.choiceTitle || '', agency: agency ? agency.label : '', note: data.note || '' });
    const item = Object.assign({ id: id, type: type, round: state.round, resolved: false, outcome: null, options: [] }, text, data);
    state.dispatches.push(item);
    addLog(state, 'dispatch', item.kicker + '：' + item.title, item.body);
    return item;
  }

  /* 处理一条事务。option 来自 dispatch.options；未处理的事务在当夜按 defaultOption 结算。 */
  function resolveDispatch(state, dispatchId, optionId) {
    if (!state || state.phase !== 'briefing') return { ok: false, error: '当前阶段不能处理事务。', code: 'PHASE' };
    const item = (state.dispatches || []).filter(function (entry) { return entry.id === dispatchId; })[0];
    if (!item) return { ok: false, error: '未找到这条事务。', code: 'NOT_FOUND' };
    if (item.resolved) return { ok: false, error: '这条事务已经处理。', code: 'DUPLICATE' };
    const option = (item.options || []).filter(function (entry) { return entry.id === optionId; })[0];
    if (!option) return { ok: false, error: '没有这个处理方式。', code: 'OPTION' };
    if ((option.ap || 0) > state.ap) return { ok: false, error: '这个处理方式需要 ' + option.ap + ' AP。', code: 'AP' };
    return applyDispatchOption(state, item, option, false);
  }

  function applyDispatchOption(state, item, option, automatic) {
    state.ap -= automatic ? 0 : (option.ap || 0);
    const result = applyEffectValues(state, option.effects || {});
    if (option.agencyId && state.agencies[option.agencyId] && option.coordination) {
      state.agencies[option.agencyId].coordination = clamp(state.agencies[option.agencyId].coordination + option.coordination, 0, 100);
    }
    if (option.unblockIntel && item.commandId) {
      const command = findCommand(state, item.commandId);
      if (command) {
        if (!state.intelState) state.intelState = {};
        const record = state.intelState[command.intelReportId] || {};
        record.inquired = true;
        record.viaDispatch = true;
        state.intelState[command.intelReportId] = record;
        if (command.status === 'blocked' && command.blockedCode === 'INFO') {
          command.status = 'executing';
          command.blockedCode = null;
          command.blockedReason = null;
        }
      }
    }
    if (option.reissue) {
      const reissued = reissueFromDispatch(state, item);
      item.reissuedCommandId = reissued ? reissued.id : null;
    }
    if (option.extendHold && item.commandId) {
      const command = findCommand(state, item.commandId);
      if (command && command.holdUntilRound) command.holdUntilRound = Math.min(finalRoundFor(state), command.holdUntilRound + 1);
    }
    if (option.extraSlot && option.agencyId && state.agencies[option.agencyId]) {
      state.agencies[option.agencyId].workload = Math.max(0, state.agencies[option.agencyId].workload - 1);
      item.extraSlotUsed = true;
    }
    item.resolved = true;
    item.outcome = { optionId: option.id, label: option.label, automatic: !!automatic, deltas: result.deltas, coordination: option.coordination || 0 };
    addLog(state, 'dispatch', (automatic ? '默认处理：' : '处理事务：') + item.title,
      option.label + '。' + (formatDeltaText(result.deltas, 0) || '') + (option.coordination ? ' 机构协调 ' + (option.coordination > 0 ? '+' : '') + option.coordination + '。' : ''));
    return { ok: true, dispatch: item, deltas: result.deltas };
  }

  function settleOpenDispatches(state) {
    const settled = [];
    (state.dispatches || []).forEach(function (item) {
      if (item.resolved || item.round !== state.round) return;
      const option = (item.options || []).filter(function (entry) { return entry.id === item.defaultOption; })[0];
      if (option) {
        applyDispatchOption(state, item, option, true);
      } else {
        item.resolved = true;
        item.outcome = { optionId: null, label: '已阅', automatic: true, deltas: {} };
      }
      settled.push(item);
    });
    return settled;
  }

  /*
   * 夜间生成第二天早上的事务。全部来自真实状态：
   * 情报阻塞、失效的可持续任务、机构满载、连续介入、外交承诺遭遇低支持、前序命令落地/失效。
   */
  function generateDispatches(state, nightResults) {
    const made = [];
    const round = state.round;
    (state.commands || []).forEach(function (command) {
      if (command.kind === 'communication') return;
      // 迟到的报告：前一夜因情报未确认而阻塞、仍在窗口内的命令
      if (command.status === 'blocked' && command.blockedCode === 'INFO' && !command.effectsApplied) {
        const d = addDispatch(state, 'late_report', {
          commandId: command.id, choiceTitle: command.title, agencyId: 'general_staff',
          options: [
            { id: 'accept', label: '采纳核实报告，解除情报阻塞', ap: 0, unblockIntel: true },
            { id: 'hold', label: '暂不采纳，继续等待', ap: 0 }
          ],
          defaultOption: 'hold'
        });
        if (d) made.push(d);
      }
      // 事务重新浮现：可持续任务失效后，以当日紧急窗口重新出现一次
      if (command.status === 'expired' && command.resurface && !command.resurfaced && command.expiredRound === round - 1) {
        command.resurfaced = true;
        const d = addDispatch(state, 'resurface', {
          commandId: command.id, choiceTitle: command.title, agencyId: command.executorId,
          options: [
            { id: 'reissue', label: '重新签发（2 AP，紧急窗口，今晚必须执行）', ap: 2, reissue: true },
            { id: 'drop', label: '放弃这项工作，机构协调 -2', ap: 0, coordination: -2, agencyId: command.executorId }
          ],
          defaultOption: 'drop'
        });
        if (d) made.push(d);
      }
      // 前期准备落地 / 失效后果：链接关系在夜里第一次成立时提示
      (STRAT.links || []).forEach(function (link) {
        if (link.from !== command.choiceId) return;
        const done = command.effectsApplied && command.executedRound === round - 1;
        const lost = command.status === 'expired' && command.expiredRound === round - 1;
        if ((link.when === 'completed' && done) || (link.when === 'expired' && lost)) {
          const target = findChoiceAnywhere(link.target);
          const d = addDispatch(state, link.when === 'completed' ? 'groundwork' : 'setback', {
            key: link.from + '>' + link.target, commandId: command.id,
            choiceTitle: target ? target.title : link.target, agencyId: command.executorId,
            note: link.note, targetChoiceId: link.target, info: true,
            options: [{ id: 'ack', label: '已阅', ap: 0 }], defaultOption: 'ack'
          });
          if (d) made.push(d);
        }
      });
      // 承诺遭遇阻力：长期承诺占用期间，国际支持处于低位
      if (command.timeKind === 'commitment' && command.holdUntilRound && command.holdUntilRound >= round && state.stats.intl <= 32 && command.agency === 'foreign') {
        const d = addDispatch(state, 'obstacle', {
          commandId: command.id, choiceTitle: command.title, agencyId: 'foreign',
          options: [
            { id: 'push', label: '追加协调，维持进度（1 AP，外交部协调 +4）', ap: 1, coordination: 4, agencyId: 'foreign' },
            { id: 'slow', label: '接受放缓，承诺多占用外交席位一夜', ap: 0, extendHold: true }
          ],
          defaultOption: 'slow'
        });
        if (d) made.push(d);
      }
    });
    // 机构资源请求：在办已满
    getAgencyLoads(state).forEach(function (load) {
      if (!load.overloaded) return;
      const d = addDispatch(state, 'resource_request', {
        agencyId: load.id,
        options: [
          { id: 'approve', label: '批准增援（1 AP，战略储备 -3，今晚多一个在办名额）', ap: 1, effects: { reserve: -3 }, extraSlot: true, agencyId: load.id },
          { id: 'decline', label: '不批准，机构协调 -3', ap: 0, coordination: -3, agencyId: load.id }
        ],
        defaultOption: 'decline'
      });
      if (d) made.push(d);
    });
    // 办公室积压：最近 N 天中每天都亲自介入
    const spec = STRAT.interventionBacklog || { windowDays: 3, minDays: 3 };
    const recent = (state.interventionRounds || []).filter(function (r) { return r >= round - spec.windowDays && r < round; });
    const lastBacklog = (state.dispatches || []).filter(function (item) { return item.type === 'backlog'; }).map(function (item) { return item.round; });
    const cooled = !lastBacklog.length || round - Math.max.apply(null, lastBacklog) >= 2;
    if (recent.length >= spec.minDays && cooled) {
      const d = addDispatch(state, 'backlog', {
        key: 'r' + round, agencyId: 'office',
        options: [
          { id: 'clear', label: '花时间清理积压（1 AP，办公室协调 +3）', ap: 1, coordination: 3, agencyId: 'office' },
          { id: 'defer', label: '继续搁置，政府连续性 -3', ap: 0, effects: { gov: -3 } }
        ],
        defaultOption: 'defer'
      });
      if (d) made.push(d);
    }
    return made;
  }

  function findChoiceAnywhere(choiceId) {
    const all = EVENTS.concat(CAMPAIGN_EVENTS, WRAP_EVENTS);
    for (let i = 0; i < all.length; i += 1) {
      const found = getChoice(all[i], choiceId);
      if (found) return found;
    }
    return null;
  }

  /* 重新签发一项已失效的可持续任务：紧急窗口、2 AP、当夜执行，不能委派。 */
  function reissueFromDispatch(state, item) {
    const source = findCommand(state, item.commandId);
    if (!source) return null;
    const event = findEventById(source.eventId);
    const choice = event ? getChoice(event, source.choiceId) : null;
    if (!choice) return null;
    const id = 'r' + state.round + ':resurface:' + choice.id;
    if (findCommand(state, id)) return null;
    const command = Object.assign({}, source, {
      id: id, round: state.round, dateLabel: getEvent(state).dateLabel, status: 'executing', ap: 2,
      timeKind: 'urgent', windowRounds: 0, deadlineRound: state.round, resurface: false, resurfaced: true,
      reissuedFrom: source.id, accepted: false, effectsApplied: false, blockedCode: null, blockedReason: null,
      coordinated: true, delegated: false, handoffRound: null, followedRounds: [], history: [], expiredRound: null,
      slotRequired: true, authorizedAt: new Date().toISOString(), result: null, record: null
    });
    state.commands.push(command);
    state.choices.push({
      round: state.round, dateLabel: command.dateLabel, eventId: source.eventId, eventTitle: event.title,
      choiceId: choice.id, commandId: id, label: choice.title + '（重新签发）', ap: 2, agency: command.agency,
      status: 'executing', deltas: {}, pressureDelta: 0, scheduled: []
    });
    const slot = reserveAgencySlot(state, command);
    addCommandLog(state, command, '重新签发：' + choice.title, '这项工作在错过原窗口后重新回到桌面。这一次代价更高（2 AP），且必须今晚执行。' + (slot.ok ? '' : ' 但执行机构仍然满载。'));
    return command;
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
    const dueRound = Math.min(finalRoundFor(state), state.round + 1);
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
      /* v0.6：带条件的延迟后果只在条件仍成立时兑现；条件被后来的命令改变时记为未兑现。 */
      const skipped = !!(item.when && !flagsMatch(state.flags, item.when));
      const result = skipped ? { deltas: {}, pressureDelta: 0 } : applyEffectValues(state, item.effects);
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
        pressureDelta: result.pressureDelta,
        skipped: skipped
      };
      state.resolved.push(applied);
      addLog(
        state,
        'delayed',
        (skipped ? '延迟后果未兑现：' : '延迟后果：') + item.label,
        (item.note ? item.note + ' ' : '') + formatDeltaText(result.deltas, result.pressureDelta)
      );
      return applied;
    });
  }

  /*
   * 4 月 2 日之后的可选战役收束。
   * A：直接结束（沿用 4 月 2 日已判定的结局，无任何惩罚）。
   * B：继续最多 14 天（c14—c16），只处理残局；可以随时提前结束。
   */
  const WRAP_TRACKS = {
    mines: { label: '雷区与未爆物', words: ['大片区域尚未排查', '只清出了主要通道', '重点地段陆续排查', '主要区域基本排查完', '大部分区域已确认安全'] },
    roads: { label: '道路与桥梁', words: ['多处断路无法通行', '勉强通行，车队很慢', '主干道基本畅通', '主要通道已恢复', '通行基本稳定'] },
    reentry: { label: '重新进入与安全', words: ['几乎没有组织进入', '少量人员在护送下进入', '分区有序进入', '大部分地区可有序进入', '进入已成常态'] },
    infra: { label: '水电通信', words: ['多数地方仍然中断', '医院和少数地点有供应', '部分城镇恢复供应', '多数城镇恢复供应', '大体恢复'] },
    missing: { label: '搜救与失踪人员', words: ['登记刚刚开始', '登记和搜救在推进', '多数线索已核对', '大部分信息已登记核对', '登记渠道稳定运转'] },
    returnees: { label: '平民返回', words: ['几乎无人返回', '少数人回家查看', '部分居民获准返回', '较多居民已经返回', '大部分居民已回家'] },
    recovery: { label: '部队恢复', words: ['部队仍在连续作战状态', '开始轮换', '部分单位完成休整', '多数单位完成休整', '主要单位已恢复'] },
    intel: { label: '撤退情报确认', words: ['说法不一，未能确认', '有零散证据', '多个来源相互印证', '基本确认对方已离开', '已确认，仍保持警戒'] }
  };
  function wrapWord(key, value) {
    const spec = WRAP_TRACKS[key];
    const idx = value < 20 ? 0 : value < 40 ? 1 : value < 60 ? 2 : value < 80 ? 3 : 4;
    return spec.words[idx];
  }
  function initialWrapTracks(state) {
    const f = state.flags || {};
    return {
      mines: f.c_staged_return ? 30 : f.c_fast_return ? 12 : 18,
      roads: 25,
      reentry: f.c_fast_return ? 35 : f.c_staged_return ? 22 : 25,
      infra: f.c_restore_services ? 38 : 30,
      missing: f.c_documented ? 22 : 15,
      returnees: 8,
      recovery: clamp(Math.round((state.stats.army || 40) * 0.5), 10, 50),
      intel: f.c_verify_signal ? 55 : 40
    };
  }
  function applyWrapTracks(state, wrap) {
    if (!state.wrapup || !state.wrapup.tracks || !wrap) return;
    Object.keys(wrap).forEach(function (key) {
      if (typeof state.wrapup.tracks[key] === 'number') state.wrapup.tracks[key] = clamp(state.wrapup.tracks[key] + wrap[key], 0, 100);
    });
  }
  function wrapUpAvailable(state) {
    return isCampaign(state) && !(state.wrapup && (state.wrapup.started || state.wrapup.declined)) && !state.ending;
  }
  function offerWrapUp(state, commandResults, summary, totals, pressureBefore, pressureTotal) {
    const pending = buildCampaignEnding(state, null);
    state.wrapup = { offered: true, started: false, declined: false, pending: pending, tracks: null, incident: false, windows: 0 };
    state.phase = 'wrapup_offer';
    state.apMax = 0;
    state.ap = 0;
    addLog(state, 'campaign', '4 月 2 日：战役告一段落', '可以现在结束，也可以再用最多 14 天处理战争留下的残局。');
    state.interlude = {
      round: state.round, dateLabel: '4 月 2 日', campaign: summary, echoes: [], aid: [],
      pressure: { before: pressureBefore, rise: pressureTotal, delayed: 0, after: state.pressure },
      attrition: totals, delayed: [], commandResults: commandResults, blocked: [], settledDispatches: [], dispatches: [], alarms: [], ap: 0, wrapOffer: true
    };
    return { ok: true, ending: null, wrapOffer: true, interlude: state.interlude, pressure: state.interlude.pressure, attrition: totals, delayed: [], commandResults: commandResults, campaign: summary };
  }
  function declineWrapUp(state) {
    if (!state.wrapup || state.phase !== 'wrapup_offer') return { ok: false, error: '现在没有可结束的收束选择。' };
    state.wrapup.declined = true;
    finalizeEnding(state, state.wrapup.pending);
    return { ok: true, ending: state.ending };
  }
  function startWrapUp(state) {
    if (!state.wrapup || state.phase !== 'wrapup_offer') return { ok: false, error: '现在不能开始战役收束。' };
    const c = state.campaign;
    state.wrapup.started = true;
    state.wrapup.tracks = initialWrapTracks(state);
    state.wrapup.startRound = state.round + 1;
    state.round += 1;
    const next = getEvent(state);
    state.apMax = next.ap;
    state.ap = next.ap;
    state.executed = [];
    state.coordinationThisRound = {};
    state.communicationsThisRound = {};
    c.carryDays = 0;
    c.day = next.day;
    const delayed = resolveDueDelayed(state, state.round);
    const aidEvents = advanceAidLines(state);
    recordTimeline(state);
    addLog(state, 'campaign', '战役收束开始', '时间继续推进，最晚到 4 月 16 日。随时可以结束。');
    state.phase = 'interlude';
    state.interlude = {
      round: state.round, dateLabel: next.dateLabel,
      campaign: { fromLabel: campaignDateLabel(c.day), toLabel: campaignDateLabel(c.day), days: 0, interruption: null },
      echoes: [], aid: aidEvents, pressure: { before: state.pressure, rise: 0, delayed: 0, after: state.pressure },
      attrition: {}, delayed: delayed, commandResults: [], blocked: [], settledDispatches: [], dispatches: [], alarms: [], ap: state.ap, wrapStart: true
    };
    return { ok: true, ending: null, interlude: state.interlude };
  }
  /* 每个收束窗口结束时的自然推进：很慢，且依赖已有资源和安全条件；贸然进入会留下后果。 */
  function advanceWrapUp(state) {
    const w = state.wrapup;
    if (!w || !w.started || !w.tracks) return;
    w.windows = (w.windows || 0) + 1;
    const t = w.tracks;
    const step = function (key, amount) { t[key] = clamp(t[key] + amount, 0, 100); };
    step('mines', state.stats.reserve >= 25 ? 3 : 1);
    step('roads', state.stats.reserve >= 25 ? 3 : 1);
    step('infra', 2);
    step('missing', 2);
    step('recovery', state.stats.reserve >= 20 ? 3 : 1);
    step('intel', 2);
    step('reentry', 2);
    step('returnees', t.mines >= 40 && t.reentry >= 40 ? 4 : 1);
    if (!w.incident && t.reentry - t.mines > 22) {
      w.incident = true;
      applyEffectValues(state, { will: -3, safety: -3 });
      addLog(state, 'wrapup', '进入过快，出现伤亡报告', '清理没有跟上进入的速度，有人员在未排查区域受伤。事故已记录在收束阶段的复盘里。');
    }
  }
  function wrapAftermath(state) {
    const w = state.wrapup || {};
    const t = w.tracks || {};
    const days = Math.max(0, Math.min(52, Math.floor(state.campaign.day || 38)) - 38);
    const tracks = Object.keys(WRAP_TRACKS).map(function (key) {
      return { key: key, label: WRAP_TRACKS[key].label, value: t[key], word: wrapWord(key, t[key]) };
    });
    const avg = tracks.reduce(function (sum, item) { return sum + item.value; }, 0) / (tracks.length || 1);
    const mood = w.incident ? '进入速度超过了清理速度，收束阶段留下了一次本可避免的事故。'
      : avg >= 55 ? '残局在有序推进，但雷区、失踪人员和受损设施的工作还要持续很久。'
      : '残局刚刚进入处理阶段，大部分工作还在前面。';
    return { days: days, endLabel: campaignDateLabel(38 + days), tracks: tracks, incident: !!w.incident, mood: mood, note: '这些描述是模拟推演，不代表真实的清理进度或数量。' };
  }
  function wrapUpEnding(state) {
    const base = state.wrapup && state.wrapup.pending ? JSON.parse(JSON.stringify(state.wrapup.pending)) : buildCampaignEnding(state, null);
    base.aftermath = wrapAftermath(state);
    return base;
  }
  /* 收束阶段中随时结束（只在简报阶段，且已经开始收束）。 */
  function finishWrapUp(state) {
    if (!state.wrapup || !state.wrapup.started || state.phase === 'ending' || state.ending) return { ok: false, error: '现在不能提前结束收束。' };
    finalizeEnding(state, wrapUpEnding(state));
    return { ok: true, ending: state.ending };
  }
  function getWrapStatus(state) {
    const w = state.wrapup;
    if (!w) return null;
    const out = { offered: !!w.offered, started: !!w.started, tracks: [] };
    if (w.tracks) out.tracks = Object.keys(WRAP_TRACKS).map(function (key) { return { key: key, label: WRAP_TRACKS[key].label, word: wrapWord(key, w.tracks[key]), value: w.tracks[key] }; });
    return out;
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
    if (command.status === 'blocked' && command.blockedCode === 'APPROVAL') {
      const waiting = commandResult(command, { blocked: true, note: '办理方案等待总统批准' });
      if (atDeadline) {
        expireCommand(state, command);
        waiting.status = 'expired';
        waiting.note = '方案没有等到批准，错过办理期限';
      }
      return waiting;
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
    if (!state.executed.length && state.ap >= (state.apMax || AP_MAX)) {
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
    /* v0.5：当天没有处理的事务，按默认方式结算（默认方式即“不投入注意力”的代价）。 */
    const settledDispatches = settleOpenDispatches(state);
    /* 旧一日已执行、等待反馈的命令先归档并释放机构名额；长期承诺在占用期内继续占席。 */
    (state.commands || []).forEach(function (command) {
      if (command.kind !== 'communication' && command.status === 'awaiting_feedback' && command.round < state.round) {
        if (command.holdUntilRound && command.holdUntilRound >= state.round) {
          commandResults.push(commandResult(command, { held: true, note: '长期承诺仍在推进，继续占用机构席位至第 ' + command.holdUntilRound + ' 夜' }));
          return;
        }
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
    if (isCampaign(state)) return endCampaignWindow(state, event, commandResults, settledDispatches);
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
    if (!ending && state.round >= finalRoundFor(state)) {
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
    /* 常设授权的机构自主运转，每夜协调余量缓慢消耗。 */
    Object.keys(state.standing || {}).forEach(function (agencyId) {
      if (state.standing[agencyId].active && state.agencies[agencyId]) {
        state.agencies[agencyId].coordination = clamp(state.agencies[agencyId].coordination + ((STRAT.standing || {}).nightlyDrift || -1), 0, 100);
      }
    });
    recordTimeline(state);

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
      dateLabel: getEvent(state).dateLabel,
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
      settledDispatches: settledDispatches.map(function (item) { return { id: item.id, title: item.title, outcome: item.outcome }; }),
      dispatches: generateDispatches(state, commandResults),
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

  /* ===== v0.6 基辅战役：双层时间 ===== */
  function campaignDateLabel(day) {
    const d = new Date(Date.UTC(2022, 1, 24 + Math.max(0, Math.floor(day) - 1)));
    return (d.getUTCMonth() + 1) + ' 月 ' + d.getUTCDate() + ' 日';
  }

  function campaignActFor(event) {
    const acts = ((CAMPAIGN && CAMPAIGN.acts) || []).concat(CAMPAIGN && CAMPAIGN.wrapAct ? [CAMPAIGN.wrapAct] : []);
    return acts.filter(function (act) { return act.id === (event && event.act); })[0] || acts[0] || { id: 1, weight: 0.5, music: 'day', title: '' };
  }

  function getCampaignStatus(state) {
    if (!isCampaign(state)) return null;
    const event = getEvent(state);
    const day = Math.min(totalDaysFor(state), Math.floor(state.campaign.day || 1));
    const act = campaignActFor(event);
    return {
      day: day,
      totalDays: totalDaysFor(state),
      dateLabel: campaignDateLabel(day),
      act: act,
      window: state.round,
      windows: CAMPAIGN_EVENTS.length,
      span: event ? event.days : 0,
      carryDays: state.campaign.carryDays || 0,
      fronts: CAMPAIGN.frontStatus(state, day),
      interruptions: state.campaign.interruptions.slice(),
      echoes: state.campaign.echoes.filter(function (item) { return item.round === state.round; })
    };
  }

  /* 内部逐日模拟中出现新的越线才中断；窗口开始时已经越线的项目不会每个窗口反复中断。 */
  function campaignBreaches(state) {
    const t = CAMPAIGN.interrupt || {};
    const list = [];
    if (state.stats.kyiv <= t.kyiv) list.push('kyiv');
    if (state.stats.gov <= t.gov) list.push('gov');
    if (state.stats.safety <= t.safety) list.push('safety');
    if (state.pressure >= t.pressure) list.push('pressure');
    return list;
  }
  const BREACH_TEXT = { kyiv: '首都防御告急', gov: '政府运转告急', safety: '总统安全告急', pressure: '战争压力逼近极限' };

  function applyCampaignOnEnter(state, event) {
    const rules = (CAMPAIGN.onEnter || []).filter(function (rule) { return rule.window === event.id && flagsMatch(state.flags, rule.when); });
    return rules.map(function (rule) {
      const key = rule.id + ':' + state.round;
      if (state.campaign.entered.indexOf(key) !== -1) return null;
      state.campaign.entered.push(key);
      const result = applyEffectValues(state, rule.effects || {});
      const echo = { id: rule.id, round: state.round, eventId: event.id, title: rule.title, text: rule.text, deltas: result.deltas, pressureDelta: result.pressureDelta };
      state.campaign.echoes.push(echo);
      addLog(state, 'echo', '前序命令的回响：' + rule.title, rule.text + ' ' + formatDeltaText(result.deltas, result.pressureDelta));
      return echo;
    }).filter(Boolean);
  }

  function endCampaignWindow(state, event, commandResults, settledDispatches) {
    const c = state.campaign;
    const act = campaignActFor(event);
    const weight = typeof act.weight === 'number' ? act.weight : 0.5;
    const span = Math.max(0.5, (event.days || 1) + (c.carryDays || 0));
    const steps = Math.max(1, Math.ceil(span));
    const startDay = c.day;
    const pressureBefore = state.pressure;
    const breachedAtStart = campaignBreaches(state);
    const totals = {};
    let pressureTotal = 0;
    let simulated = 0;
    let interruption = null;
    let ending = null;

    for (let i = 0; i < steps; i += 1) {
      const portion = Math.min(1, span - simulated);
      /* 压力：窗口事件带来的压力按天分摊。 */
      const rise = (event.pressureRise || 0) * portion / span;
      /* 模拟设计值：敌方攻势随时间耗散（act.relief），但只有防线仍然成立（基辅≥30 且军队≥30）时才生效。 */
      const holding = state.stats.kyiv >= 30 && state.stats.army >= 30;
      const relief = holding ? (act.relief || 0) * portion : 0;
      c.attritionCarry.pressure = (c.attritionCarry.pressure || 0) - relief;
      c.attritionCarry.pressure = (c.attritionCarry.pressure || 0) + rise;
      const wholeRise = c.attritionCarry.pressure >= 0 ? Math.floor(c.attritionCarry.pressure) : Math.ceil(c.attritionCarry.pressure);
      c.attritionCarry.pressure -= wholeRise;
      if (wholeRise) {
        const pr = applyEffectValues(state, { pressure: wholeRise });
        pressureTotal += pr.pressureDelta;
      }
      /* 侵蚀：沿用七日模型的压力侵蚀公式，按幕的强度和天数缩放；小数部分结转到之后的日子。 */
      const raw = calculateAttrition(state.pressure, state.flags);
      const daily = {};
      Object.keys(raw).forEach(function (key) {
        c.attritionCarry[key] = (c.attritionCarry[key] || 0) + raw[key] * weight * portion;
        const whole = c.attritionCarry[key] >= 0 ? Math.floor(c.attritionCarry[key]) : Math.ceil(c.attritionCarry[key]);
        if (whole) {
          daily[key] = whole;
          c.attritionCarry[key] -= whole;
        }
      });
      const res = applyEffectValues(state, daily);
      Object.keys(res.deltas).forEach(function (key) { totals[key] = (totals[key] || 0) + res.deltas[key]; });
      simulated += portion;
      c.day = startDay + simulated;
      ending = checkCollapse(state);
      if (ending) break;
      const fresh = campaignBreaches(state).filter(function (key) { return breachedAtStart.indexOf(key) === -1; });
      if (fresh.length && event.interruptible !== false && span - simulated >= 1 && state.round < finalRoundFor(state)) {
        interruption = {
          round: state.round,
          day: Math.floor(c.day),
          dateLabel: campaignDateLabel(c.day),
          keys: fresh,
          title: fresh.map(function (key) { return BREACH_TEXT[key]; }).join('、'),
          carried: Math.round((span - simulated) * 2) / 2
        };
        break;
      }
    }

    c.carryDays = interruption ? interruption.carried : 0;
    if (interruption) {
      c.interruptions.push(interruption);
      addLog(state, 'interrupt', '紧急简报：时间推进提前中断', interruption.dateLabel + '，' + interruption.title + '。剩余 ' + interruption.carried + ' 天并入下一个决策窗口。');
    }
    c.windows.push({ round: state.round, eventId: event.id, fromDay: Math.floor(startDay), toDay: Math.floor(c.day), simulated: simulated, interrupted: !!interruption });
    addLog(state, 'pressure', '内部逐日推进 ' + simulated + ' 天', '压力 ' + pressureBefore + ' → ' + state.pressure + '。' + (Object.keys(totals).length ? ' 累计侵蚀：' + formatDeltaText(totals, 0) : ''));

    let wrapOffer = false;
    if (!ending && state.round >= finalRoundFor(state)) {
      if (wrapUpAvailable(state)) wrapOffer = true;
      else ending = state.wrapup && state.wrapup.started ? wrapUpEnding(state) : buildCampaignEnding(state, null);
    }
    const summary = {
      fromLabel: campaignDateLabel(startDay),
      toLabel: campaignDateLabel(Math.max(startDay, c.day - 0.01)),
      days: simulated,
      interruption: interruption
    };
    if (ending) {
      finalizeEnding(state, ending);
      return { ok: true, ending: state.ending, commandResults: commandResults, pressure: { before: pressureBefore, rise: pressureTotal, after: state.pressure }, attrition: totals, campaign: summary };
    }

    if (wrapOffer) return offerWrapUp(state, commandResults, summary, totals, pressureBefore, pressureTotal);
    state.round += 1;
    const next = getEvent(state);
    state.apMax = next && next.ap ? next.ap : AP_MAX;
    state.ap = state.apMax;
    state.executed = [];
    state.coordinationThisRound = {};
    state.communicationsThisRound = {};
    if (Math.floor(c.day) < next.day && !c.carryDays) c.day = next.day;
    const delayed = resolveDueDelayed(state, state.round);
    Object.keys(state.standing || {}).forEach(function (agencyId) {
      if (state.standing[agencyId].active && state.agencies[agencyId]) {
        state.agencies[agencyId].coordination = clamp(state.agencies[agencyId].coordination + ((STRAT.standing || {}).nightlyDrift || -1), 0, 100);
      }
    });
    expireStanding(state);
    const aidEvents = advanceAidLines(state);
    advanceWrapUp(state);
    const echoes = applyCampaignOnEnter(state, next);
    recordTimeline(state);
    ending = checkCollapse(state);
    if (ending) {
      finalizeEnding(state, ending);
      return { ok: true, ending: state.ending, commandResults: commandResults, pressure: { before: pressureBefore, rise: pressureTotal, after: state.pressure }, attrition: totals, delayed: delayed, campaign: summary };
    }
    const delayedPressure = delayed.reduce(function (sum, item) { return sum + (item.pressureDelta || 0); }, 0);
    state.phase = 'interlude';
    state.interlude = {
      round: state.round,
      dateLabel: interruption ? campaignDateLabel(c.day) + '（提前）' : next.dateLabel,
      campaign: summary,
      echoes: echoes,
      aid: aidEvents,
      pressure: { before: pressureBefore, rise: pressureTotal, delayed: delayedPressure, after: state.pressure },
      attrition: totals,
      delayed: delayed,
      commandResults: commandResults,
      blocked: commandResults.filter(function (item) { return item.status === 'blocked'; }),
      settledDispatches: settledDispatches.map(function (item) { return { id: item.id, title: item.title, outcome: item.outcome }; }),
      dispatches: generateDispatches(state, commandResults),
      alarms: getAlarms(state),
      ap: state.ap
    };
    return { ok: true, ending: null, interlude: state.interlude, pressure: state.interlude.pressure, attrition: totals, delayed: delayed, commandResults: commandResults, campaign: summary };
  }

  /* 战役结局：多维判定（campaign.evaluate），再附上关键决策链、与历史基准的偏离和反事实分析。 */
  function buildCampaignEnding(state, collapseId) {
    if (collapseId) state.collapseId = collapseId;
    const result = CAMPAIGN.evaluate(state);
    const meta = CAMPAIGN.endings[result.id] || { code: '?', title: '战役结束', plausibility: '中', tone: 'costly', summary: '' };
    const toneMap = { held: 'success', costly: 'warning', hollow: 'warning', collapse: 'danger' };
    const day = Math.min(totalDaysFor(state), Math.floor(state.campaign.day || 1));
    const keyDecisions = (state.choices || []).map(function (record) {
      const choice = findChoiceAnywhere(record.choiceId);
      if (!choice || !choice.keyDecision) return null;
      const command = findCommand(state, record.commandId);
      return {
        node: choice.keyDecision.node, choiceId: choice.id, title: choice.title, round: record.round,
        dateLabel: record.dateLabel, purpose: choice.keyDecision.purpose, cost: choice.keyDecision.cost,
        unknown: choice.keyDecision.unknown, irreversible: !!choice.keyDecision.irreversible,
        status: command ? command.status : 'unknown'
      };
    }).filter(Boolean);
    const baseline = CAMPAIGN.baseline || {};
    const divergence = Object.keys(baseline).map(function (node) {
      const picks = keyDecisions.filter(function (item) { return item.node === node && ['expired', 'cancelled'].indexOf(item.status) === -1; });
      const base = baseline[node];
      let kind = 'none';
      if (!base.choices.length) kind = 'abstract';
      else if (!picks.length) kind = 'missed';
      else kind = picks.some(function (item) { return base.choices.indexOf(item.choiceId) !== -1; }) ? 'near' : 'diverged';
      return { node: node, kind: kind, picks: picks.map(function (item) { return item.title; }), round: picks[0] ? picks[0].round : null, note: base.note };
    });
    const firstDiverge = divergence.filter(function (item) { return item.kind === 'diverged' || item.kind === 'missed'; }).sort(function (a, b) { return (a.round || 99) - (b.round || 99); })[0] || null;
    const cfNodes = divergence.filter(function (item) { return item.kind === 'diverged' || item.kind === 'missed'; }).map(function (item) { return item.node; });
    ['airfield', 'reserve', 'signal', 'capital', 'bridges', 'return'].forEach(function (node) { if (cfNodes.length < 2 && cfNodes.indexOf(node) === -1) cfNodes.push(node); });
    const counterfactuals = cfNodes.slice(0, 4).map(function (node) { return Object.assign({ node: node }, CAMPAIGN.counterfactuals[node] || {}); }).filter(function (item) { return item.title; });
    const s = state.stats;
    return {
      id: result.id,
      scenario: 'campaign',
      code: meta.code,
      plausibility: meta.plausibility,
      tone: toneMap[meta.tone] || 'warning',
      kicker: '战役判定 · 结局 ' + meta.code + ' · 合理性 ' + meta.plausibility,
      title: meta.title,
      verdict: meta.summary,
      reasons: result.reasons.slice(),
      dims: result.dims,
      epilogue: [
        '战役在 ' + campaignDateLabel(day) + ' 收束（第 ' + day + ' / ' + totalDaysFor(state) + ' 天，' + state.round + ' 个决策窗口）。',
        '结局由多项条件共同判定：政府连续性、首都、军队、行政运转、后勤、平民承受、国际支持和未来主动权。没有单一胜负分。',
        '所有数值是游戏模拟值，不代表真实伤亡、装备或兵力统计。'
      ],
      flags: Object.assign({}, state.flags),
      severeKeys: STAT_KEYS.filter(function (key) { return s[key] < FINAL_THRESHOLDS.hollow[key]; }),
      severeCount: result.dims.filter(function (d) { return d.level === 'severe'; }).length,
      collapseId: collapseId || null,
      fronts: CAMPAIGN.frontStatus(state, day),
      keyDecisions: keyDecisions,
      divergence: divergence,
      firstDivergence: firstDiverge,
      counterfactuals: counterfactuals,
      echoes: state.campaign.echoes.slice(),
      interruptions: state.campaign.interruptions.slice(),
      windows: state.campaign.windows.slice(),
      day: day
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
    if (state.wrapup && state.wrapup.started) return null;
    const id = collapseIdFor(state);
    if (!id) return null;
    if (isCampaign(state)) return buildCampaignEnding(state, id);
    return buildEnding(state, id);
  }

  function collapseIdFor(state) {
    const s = state.stats;
    if (s.safety <= 10) return 'president';
    if (s.gov <= 25) return 'government';
    if (s.kyiv <= 12) return 'kyiv';
    if (s.army <= 15) return 'military';
    if (s.will <= 20) return 'will';
    if (s.intl <= COLLAPSE_LINES.diplomatic) return 'diplomatic';
    if (s.reserve <= COLLAPSE_LINES.logistics) return 'logistics';
    if (state.pressure >= 100) return 'overload';
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

  /* v0.5：逐日状态快照。每个日期只记一次，供趋势图和复盘使用，不参与任何判定。 */
  function recordTimeline(state) {
    if (!Array.isArray(state.timeline)) state.timeline = [];
    const snapshot = { round: state.round, stats: Object.assign({}, state.stats), pressure: state.pressure };
    const index = state.timeline.findIndex(function (item) { return item.round === state.round && !item.final; });
    if (index === -1) state.timeline.push(snapshot);
    else state.timeline[index] = snapshot;
    return snapshot;
  }

  /*
   * 治理风格回顾：只统计这一局实际发生的动作，不打分，不评价好坏。
   * 风格是“注意力花在哪里”的描述，同一局可以有多个明显倾向。
   */
  function getGovernanceProfile(state) {
    const commands = (state.commands || []).filter(function (command) { return command.kind !== 'communication'; });
    const counts = {
      issued: commands.length,
      interventions: commands.reduce(function (sum, command) { return sum + ((command.followedRounds || []).length); }, 0),
      interventionDays: (state.interventionRounds || []).filter(function (round, index, list) { return list.indexOf(round) === index; }).length,
      delegations: commands.filter(function (command) { return command.delegated; }).length,
      standing: Object.keys(state.standing || {}).filter(function (id) { return state.standing[id].active; }).length,
      coordination: (state.log || []).filter(function (entry) { return entry.type === 'coordination'; }).length,
      inquiries: Object.keys(state.intelState || {}).filter(function (id) { return state.intelState[id] && state.intelState[id].inquired; }).length,
      communications: (state.commands || []).filter(function (command) { return command.kind === 'communication'; }).length,
      completed: commands.filter(function (command) { return command.effectsApplied; }).length,
      expired: commands.filter(function (command) { return command.status === 'expired'; }).length,
      dispatchesHandled: (state.dispatches || []).filter(function (item) { return item.resolved && !item.automatic; }).length,
      dispatchesDefaulted: (state.dispatches || []).filter(function (item) { return item.resolved && item.automatic; }).length
    };
    const domains = { military: 0, continuity: 0, external: 0, society: 0 };
    const domainOf = { army: 'military', kyiv: 'military', gov: 'continuity', safety: 'continuity', intl: 'external', will: 'society', reserve: 'society' };
    (state.choices || []).forEach(function (record) {
      Object.keys(record.deltas || {}).forEach(function (key) {
        if (record.deltas[key] > 0 && domainOf[key]) domains[domainOf[key]] += record.deltas[key];
      });
    });
    const tendencies = [];
    if (counts.interventionDays >= 4) tendencies.push('hands_on');
    if (counts.delegations + counts.standing * 2 >= 3) tendencies.push('delegating');
    if (counts.coordination >= 3) tendencies.push('coordinating');
    if (counts.inquiries >= 3) tendencies.push('verifying');
    const domainRank = Object.keys(domains).sort(function (a, b) { return domains[b] - domains[a]; });
    const totalDomain = domainRank.reduce(function (sum, key) { return sum + domains[key]; }, 0);
    if (totalDomain > 0 && domains[domainRank[0]] >= totalDomain * 0.38) tendencies.push(domainRank[0]);
    if (!tendencies.length) tendencies.push('balanced');
    const meta = STRAT.styleMeta || {};
    return {
      primary: tendencies[0],
      tendencies: tendencies.map(function (id) {
        return { id: id, label: (meta[id] && meta[id].label) || id, note: (meta[id] && meta[id].note) || '' };
      }),
      counts: counts,
      domains: domains
    };
  }

  /* 复盘关键节点：及时完成、被搁置、失去的机会、当时无法预知的后果。全部来自本局记录。 */
  function getTurningPoints(state) {
    const points = [];
    (state.commands || []).forEach(function (command) {
      if (command.kind === 'communication') return;
      if (command.status === 'expired') {
        points.push({ type: 'lost', round: command.expiredRound || command.round, title: command.title, note: command.blockedReason || '执行窗口关闭' });
      } else if (command.effectsApplied && command.timeKind === 'urgent') {
        points.push({ type: 'timely', round: command.executedRound || command.round, title: command.title, note: '紧急窗口内完成' });
      } else if (command.effectsApplied && (command.followedRounds || []).length) {
        points.push({ type: 'timely', round: command.executedRound || command.round, title: command.title, note: '经总统介入后推进' });
      }
    });
    (state.dispatches || []).forEach(function (item) {
      if (item.resolved && item.outcome && item.outcome.automatic && item.options && item.options.length > 1) {
        points.push({ type: 'shelved', round: item.round, title: item.title, note: '当日未处理，按默认方式结算：' + (item.outcome.label || '默认处理') });
      }
    });
    (state.resolved || []).forEach(function (item) {
      const size = Object.keys(item.deltas || {}).reduce(function (sum, key) { return sum + Math.abs(item.deltas[key]); }, 0) + Math.abs(item.pressureDelta || 0);
      if (size >= 6) {
        const sourceRound = eventsFor(state).findIndex(function (event) { return event.id === item.sourceEventId; }) + 1;
        points.push({ type: 'unforeseen', round: item.appliedRound, title: item.label, note: (sourceRound > 0 ? '源自第 ' + sourceRound + ' 日「' + (item.sourceLabel || '') + '」' : '源自此前决定') + '；签发时只能看到方向，看不到具体幅度' });
      }
    });
    points.sort(function (a, b) { return a.round - b.round; });
    return points.slice(0, 10);
  }

  /* 轻量重玩记录：结局、倾向、路线。每局按 startedAt 只记一次，不做积分或成就。 */
  function getRecords() {
    try {
      if (!root.localStorage) return { version: 1, runs: [] };
      const raw = root.localStorage.getItem(STRAT.recordsKey || 'lzs_records_v1');
      const data = raw ? JSON.parse(raw) : null;
      if (!data || !Array.isArray(data.runs)) return { version: 1, runs: [] };
      return data;
    } catch (error) {
      return { version: 1, runs: [] };
    }
  }

  function recordRun(state, ending, profile) {
    try {
      if (!root.localStorage) return null;
      const records = getRecords();
      const key = state.runId || state.startedAt || '';
      if (records.runs.some(function (run) { return run.key === key; })) return null;
      const run = {
        key: key,
        endedAt: new Date().toISOString(),
        endingId: ending.id,
        endingTitle: ending.title,
        round: state.round,
        scenario: state.scenario || 'classic',
        style: profile.primary,
        styleLabel: profile.tendencies[0] ? profile.tendencies[0].label : '',
        route: (state.choices || []).map(function (record) { return record.choiceId; }).slice(0, 21)
      };
      records.runs.push(run);
      records.runs = records.runs.slice(-30);
      root.localStorage.setItem(STRAT.recordsKey || 'lzs_records_v1', JSON.stringify(records));
      return run;
    } catch (error) {
      return null;
    }
  }

  function finalizeEnding(state, ending) {
    recordTimeline(state);
    if (state.timeline.length) state.timeline[state.timeline.length - 1].final = true;
    ending.timeline = state.timeline.map(function (item) { return { round: item.round, stats: Object.assign({}, item.stats), pressure: item.pressure, partial: !!item.partial }; });
    ending.governance = getGovernanceProfile(state);
    ending.turningPoints = getTurningPoints(state);
    ending.record = recordRun(state, ending, ending.governance);
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

  function saveKeyFor(scenario) { return scenario === 'campaign' && CAMPAIGN ? CAMPAIGN.saveKey : SAVE_KEY; }

  function getSaveSummary(scenario) {
    const data = loadSavedGame(scenario);
    if (!data) return null;
    const state = data.state;
    const event = eventsFor(state)[state.round - 1];
    return {
      savedAt: data.savedAt,
      round: state.round,
      dateLabel: event ? event.dateLabel : '',
      phase: state.phase,
      ap: state.ap,
      endingTitle: state.ending ? state.ending.title : '',
      scenario: state.scenario || 'classic',
      finalRound: finalRoundFor(state),
      day: state.campaign ? Math.min(totalDaysFor(state), Math.floor(state.campaign.day)) : null,
      stats: state.stats
    };
  }

  function saveGame(state) {
    try {
      if (!root.localStorage) return false;
      const key = saveKeyFor(state.scenario);
      const existing = key === SAVE_KEY ? root.localStorage.getItem(SAVE_KEY) : null;
      if (existing) {
        try {
          const old = JSON.parse(existing);
          if (old && old.version === 1 && !root.localStorage.getItem(BACKUP_KEY)) {
            root.localStorage.setItem(BACKUP_KEY, existing);
          }
        } catch (ignore) {}
      }
      const version = isCampaign(state) ? CAMPAIGN_VERSION : VERSION;
      state.schemaVersion = isCampaign(state) ? CAMPAIGN_VERSION : 3;
      state.version = version;
      const payload = {
        version: version,
        savedAt: new Date().toISOString(),
        state: state
      };
      root.localStorage.setItem(key, JSON.stringify(payload));
      return true;
    } catch (error) {
      return false;
    }
  }

  function loadSavedGame(scenario) {
    try {
      if (!root.localStorage) return null;
      const campaignKey = scenario === 'campaign';
      if (campaignKey && !CAMPAIGN) return null;
      const raw = root.localStorage.getItem(saveKeyFor(scenario));
      if (!raw) return null;
      const data = JSON.parse(raw);
      /* 七日存档与战役存档分键保存：旧七日存档不会被当作 38 天战役读入。 */
      if (!data || !data.state || (campaignKey ? [CAMPAIGN_VERSION] : [1, 2, 3]).indexOf(data.version) === -1) return null;
      if (campaignKey && data.state.scenario !== 'campaign') return null;
      if (!campaignKey && data.state.scenario === 'campaign') return null;
      const state = normalizeLoadedState(data.state, data.version);
      if (!state) return null;
      return { version: data.version, migratedFrom: !campaignKey && data.version < VERSION ? data.version : null, savedAt: data.savedAt, state: state };
    } catch (error) {
      return null;
    }
  }

  function normalizeLoadedState(input, sourceVersion) {
    if (!input || typeof input !== 'object') return null;
    const loadedCampaign = input.scenario === 'campaign' && !!CAMPAIGN;
    if (input.scenario === 'campaign' && !CAMPAIGN) return null;
    const scenarioProbe = { scenario: loadedCampaign ? 'campaign' : 'classic', round: input.round };
    const FINAL_FOR_INPUT = finalRoundFor(scenarioProbe);
    if (!Number.isInteger(input.round) || input.round < 1 || input.round > FINAL_FOR_INPUT) return null;
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
      if (copy.deadlineRound === undefined) copy.deadlineRound = Math.min(FINAL_FOR_INPUT, copy.round + STRATEGY.windowRounds);
      if (copy.windowRounds === undefined) copy.windowRounds = STRATEGY.windowRounds;
      if (copy.blockedCode === undefined) copy.blockedCode = null;
      if (copy.delegatedRound === undefined) copy.delegatedRound = null;
      if (copy.handoffRound === undefined) copy.handoffRound = null;
      if (!Array.isArray(copy.history)) copy.history = [];
      if (copy.slotRequired === undefined) copy.slotRequired = !!copy.requiredCoordination || Number(copy.ap) >= 2;
      /* v0.5 字段：旧命令一律按 v0.4 的短期窗口处理，不追溯改变已发生的结果。 */
      if (copy.timeKind === undefined) copy.timeKind = 'short';
      if (copy.holdRounds === undefined) copy.holdRounds = 0;
      if (copy.holdUntilRound === undefined) copy.holdUntilRound = null;
      if (copy.resurface === undefined) copy.resurface = false;
      if (copy.resurfaced === undefined) copy.resurfaced = false;
      return copy;
    }) : choices.map(function (record, index) {
      const id = record.commandId || ('legacy:' + record.round + ':' + record.choiceId + ':' + index);
      return {
        id: id, kind: 'authorization', round: record.round, eventId: record.eventId,
        choiceId: record.choiceId, title: record.label, ap: record.ap, agency: record.agency || 'office',
        executorId: record.agency || 'office', status: 'completed', authorizedAt: null,
        requiredCoordination: false, coordinated: true, delegated: false, delegateRound: null, effectsApplied: true,
        accepted: false, deadlineRound: Math.min(FINAL_FOR_INPUT, record.round + STRATEGY.windowRounds),
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
      version: loadedCampaign ? CAMPAIGN_VERSION : VERSION,
      schemaVersion: loadedCampaign ? CAMPAIGN_VERSION : 3,
      scenario: loadedCampaign ? 'campaign' : 'classic',
      migratedFrom: sourceVersion && sourceVersion < VERSION ? sourceVersion : (input.migratedFrom || null),
      round: input.round,
      ap: clamp(input.ap, 0, apMaxFor(scenarioProbe, input.round)),
      apMax: apMaxFor(scenarioProbe, input.round),
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
      standing: input.standing && typeof input.standing === 'object' ? input.standing : {},
      dispatches: Array.isArray(input.dispatches) ? input.dispatches.filter(function (item) { return item && typeof item.id === 'string'; }) : [],
      interventionRounds: Array.isArray(input.interventionRounds) ? input.interventionRounds.filter(Number.isInteger) : [],
      /* 旧存档没有逐日轨迹；只补当前时点，不伪造过去的数值。 */
      timeline: Array.isArray(input.timeline) && input.timeline.length ? input.timeline : [{ round: input.round, stats: Object.assign({}, stats), pressure: clamp(input.pressure, 0, 100), partial: true }],
      startedAt: input.startedAt || new Date().toISOString(),
      runId: typeof input.runId === 'string' ? input.runId : (input.startedAt || '')
    };
    if (loadedCampaign) {
      const c = input.campaign && typeof input.campaign === 'object' ? input.campaign : {};
      state.campaign = {
        day: typeof c.day === 'number' && c.day >= 1 ? c.day : (CAMPAIGN_EVENTS[input.round - 1] || {}).day || 1,
        carryDays: typeof c.carryDays === 'number' && c.carryDays > 0 ? c.carryDays : 0,
        interruptions: Array.isArray(c.interruptions) ? c.interruptions : [],
        entered: Array.isArray(c.entered) ? c.entered : [],
        echoes: Array.isArray(c.echoes) ? c.echoes : [],
        attritionCarry: c.attritionCarry && typeof c.attritionCarry === 'object' ? c.attritionCarry : {},
        windows: Array.isArray(c.windows) ? c.windows : []
      };
      if (typeof input.collapseId === 'string') state.collapseId = input.collapseId;
    }
    if (state.phase === 'interlude' && !state.interlude) {
      state.phase = 'briefing';
    }
    if (state.phase === 'ending' && !state.ending) {
      return null;
    }
    return state;
  }

  function deleteSave(scenario) {
    try {
      if (root.localStorage) root.localStorage.removeItem(saveKeyFor(scenario));
      return true;
    } catch (error) {
      return false;
    }
  }

  function hasSave(scenario) {
    return !!getSaveSummary(scenario);
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
    campaign: CAMPAIGN,
    campaignSaveKey: CAMPAIGN ? CAMPAIGN.saveKey : null,
    isCampaign: isCampaign,
    eventsFor: eventsFor,
    finalRoundFor: finalRoundFor,
    campaignDateLabel: campaignDateLabel,
    getCampaignStatus: getCampaignStatus,
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
    strategyData: STRAT,
    thresholds: FINAL_THRESHOLDS,
    timeProfileFor: timeProfileFor,
    getLinkEffect: getLinkEffect,
    grantStanding: grantStanding,
    revokeStanding: revokeStanding,
    getAidStatus: getAidStatus,
    startWrapUp: startWrapUp,
    declineWrapUp: declineWrapUp,
    finishWrapUp: finishWrapUp,
    getWrapStatus: getWrapStatus,
    advanceAidLines: advanceAidLines,
    getDispatches: getDispatches,
    resolveDispatch: resolveDispatch,
    getGovernanceProfile: getGovernanceProfile,
    getTurningPoints: getTurningPoints,
    getRecords: getRecords,
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
