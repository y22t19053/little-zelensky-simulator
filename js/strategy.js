/*
 * v0.5 策略与叙事层数据（模拟设计值，不是历史命令或统计）。
 * - DAY_FOCUS：七天各自的体验重心，只描述游戏里的工作重点。
 * - TIME_PROFILES：命令的时间属性与错过后的处理方式。
 * - LINKS：前一项命令的结果如何改变后续命令的执行条件（路径依赖）。
 * - DISPATCHES：由真实游戏状态触发的小型模拟事务文本模板。
 * 所有文字都是游戏内的模拟反馈，不冒充真实人物言论或真实文件。
 */
(function (root) {
  'use strict';

  const DAY_FOCUS = {
    1: { label: '危机抵达', question: '先弄清什么是确定的，什么还不确定，再决定第一批授权。', tone: 'arrival' },
    2: { label: '命令落地', question: '昨天签出的文件有多少真正被执行？今天要维持的是哪一条指挥链？', tone: 'continuity' },
    3: { label: '执行与资源', question: '机构能力已经开始吃紧。哪些事必须今晚完成，哪些可以排队？', tone: 'execution' },
    4: { label: '城市与内部', question: '首都、地方和社会之间需要一致的口径和秩序。谁来协调？', tone: 'city' },
    5: { label: '注意力冲突', question: '多个方向同时要求总统关注。你无法亲自处理每一件事。', tone: 'conflict' },
    6: { label: '外部支持', question: '援助、制裁和谈判渠道各有时间表。承诺和交付不是一回事。', tone: 'external' },
    7: { label: '累积后果', question: '前六天留下的结果正在汇总。系统还能承受多少？', tone: 'reckoning' }
  };

  // kind: urgent 当夜必须执行，不能委派到明天；short 默认一日窗口；
  // sustained 两日窗口，错过后以更紧的形式重新浮现；commitment 执行后继续占用机构一段时间。
  const TIME_PROFILES = {
    counterattack: { kind: 'urgent', windowRounds: 0, note: '机场方向的窗口以小时计，今晚不执行就失去意义。' },
    block_runway: { kind: 'urgent', windowRounds: 0, note: '跑道拒止只在敌方增援前有价值。' },
    air_defense: { kind: 'urgent', windowRounds: 0, note: '防空调整必须当夜完成。' },
    east: { kind: 'urgent', windowRounds: 0, note: '东线预备队调动有严格时窗。' },
    curfew: { kind: 'sustained', windowRounds: 2, resurface: true, note: '宵禁可以分区逐步落实，错过会以更紧的形式回到桌面。' },
    unity_gov: { kind: 'sustained', windowRounds: 2, resurface: true, note: '政治协调可以分两天推进。' },
    requisition: { kind: 'sustained', windowRounds: 2, resurface: true, note: '征用涉及多个地方，可以持续推进。' },
    evacuate: { kind: 'sustained', windowRounds: 2, resurface: true, note: '撤离需要地方配合，可分批完成。' },
    eu: { kind: 'commitment', windowRounds: 1, holdRounds: 2, note: '入盟申请是一项长期承诺，执行后外交机构仍需持续投入。' },
    weapons: { kind: 'commitment', windowRounds: 1, holdRounds: 1, note: '武器清单需要后续跟单，外交席位会被占用一夜。' },
    talks: { kind: 'commitment', windowRounds: 1, holdRounds: 1, note: '谈判渠道开启后需要持续维护。' },
    security_rule: { kind: 'commitment', windowRounds: 1, holdRounds: 2, note: '安全管控需要内务机构长期执行。' },
    arm_citizens: { kind: 'conditional', windowRounds: 1, note: '分发武器需要先有登记和组织基础。' },
    firepower: { kind: 'conditional', windowRounds: 1, note: '火力调配依赖后勤链条是否通畅。' }
  };

  const KIND_LABELS = {
    urgent: '紧急窗口',
    short: '短期窗口',
    sustained: '可持续推进',
    commitment: '长期承诺',
    conditional: '有条件任务'
  };

  // 路径依赖：when 'completed'（命令已执行）或 'expired'（命令失效）；
  // target 选项的协调需求或时间窗口会因此改变。数值是模拟设计值。
  const LINKS = [
    { from: 'mobilize', when: 'completed', target: 'arm_citizens', coordination: 'relax', note: '前期动员登记已落地，分发武器可以直接交给地方执行。' },
    { from: 'mobilize', when: 'expired', target: 'arm_citizens', coordination: 'require', note: '动员登记没有完成，分发武器需要额外的跨部门协调。' },
    { from: 'aid_call', when: 'completed', target: 'weapons', coordination: 'relax', note: '第一天的援助请求已经建立联络渠道，武器清单可以由外交部直接推进。' },
    { from: 'aid_call', when: 'expired', target: 'weapons', coordination: 'require', note: '援助联络渠道没有建立，武器清单需要先协调。' },
    { from: 'curfew', when: 'completed', target: 'evacuate', coordination: 'relax', note: '宵禁秩序已建立，撤离通道更容易组织。' },
    { from: 'curfew', when: 'expired', target: 'evacuate', coordination: 'require', note: '宵禁没有落实，撤离需要额外协调地方。' },
    { from: 'unity_gov', when: 'completed', target: 'speech', coordination: 'relax', note: '政治协调已完成，公开讲话不再需要额外对口径。' },
    { from: 'logistics', when: 'completed', target: 'firepower', coordination: 'relax', note: '后勤链条已整理，火力调配可以直接执行。' },
    { from: 'disperse', when: 'completed', target: 'split', coordination: 'relax', note: '前期分散部署已完成，分设指挥更容易衔接。' },
    { from: 'city_defense', when: 'completed', target: 'curfew', coordination: 'relax', note: '城市防御已组织，宵禁执行更顺。' }
  ];

  // 连续总统介入的阈值：最近 N 天中有 M 天亲自介入，就会产生办公室积压。
  const INTERVENTION_BACKLOG = { windowDays: 3, minDays: 3 };

  // 机构常设授权：每个机构每局最多一次，1AP；之后该机构的命令签发即自动授权，
  // 但总统亲自介入该机构命令的代价更高，机构每夜协调 -1（自主运行的磨损）。
  // v0.7.0（战役模式）：常设授权有范围、有期限、可撤销。范围内的例行事项（1 AP 以内、非关键决策、
  // 不需要跨部门协调）由机构自行接收，总统不再支付注意力；每处理一项，机构协调磨损 wearPerItem。
  // 机构在办已满或协调低于 suspendBelow 时授权自动中止，新事项回到总统桌面。
  const STANDING = {
    cost: 1, minCoordination: 45, nightlyDrift: -1, interventionExtra: 3,
    durationWindows: 4, revokeCost: 1, revokeCoordination: 3, wearPerItem: 1, suspendBelow: 40,
    scopes: {
      office: { label: '办公厅例行事务', allow: '总统办公室内部的文件流转、轮休安排和例行协调', deny: '不能代替总统决定人事、指挥地点或对外表态' },
      general_staff: { label: '已批准部署的调整', allow: '在已批准的防御方案内调整部队位置、轮换和补充', deny: '不能发起新的作战行动，也不能动用预备队主力' },
      foreign: { label: '已批准范围内的援助磋商', allow: '继续推进已批准的援助谈判、材料交换和日常外交联络', deny: '不能做出新的政治承诺，也不能谈领土问题' },
      interior: { label: '地方应急安排', allow: '协调地方政府处理疏散、治安和公共服务的日常问题', deny: '不能宣布新的限制措施，也不能下发武器' },
      communications: { label: '日常信息发布', allow: '按既定口径发布日常通报并回应常见询问', deny: '不能改变口径，也不能公布未经核实的消息' },
      logistics: { label: '常规运输与补给优先级', allow: '按既定优先级调整常规运输、仓储和维修排期', deny: '不能动用国家储备，也不能改变补给方向' }
    }
  };

  // v0.7.0（战役模式）：把一项具体事务交给一个机构。总统不付注意力，但要先向机构交代任务，
  // 机构按协调余量决定完成质量；选择「办完回报总统批准」则多等一个窗口，换来完整质量。
  const DELEGATION = { minCoordination: 45, briefingCoordination: 2, perWindowCap: 3, fullQualityAt: 60, reducedQuality: 0.7 };

  const DISPATCH_TEXT = {
    late_report: {
      kicker: '迟到的报告',
      title: '核实结果送达：{choice}',
      body: '昨夜因情报不足暂停的命令，相关核实报告今早才送到。报告补齐了执行所需的确认，但耽误的一夜无法追回。',
      source: '{agency} · 模拟反馈'
    },
    resurface: {
      kicker: '事务重新浮现',
      title: '{choice} 仍未完成',
      body: '这项可分批推进的工作已错过原定时间。它没有消失，而是以更紧的期限回到桌面；继续搁置会持续占用机构席位。',
      source: '{agency} · 模拟反馈'
    },
    resource_request: {
      kicker: '机构资源请求',
      title: '{agency}请求增援人手',
      body: '该机构在办事务已达容量上限。批准可以在今晚多处理一项命令，但会动用战略储备；不批准则机构协调下降。',
      source: '{agency} · 模拟反馈'
    },
    backlog: {
      kicker: '办公室积压',
      title: '连续亲自介入后的积压',
      body: '过去几天总统多次亲自介入具体执行，办公室的例行事务开始排队。处理积压需要占用注意力；搁置会在明晚影响政府连续性。',
      source: '总统办公室行政组 · 模拟反馈'
    },
    obstacle: {
      kicker: '承诺遇到阻力',
      title: '{choice}：外部回应放缓',
      body: '国际支持处在低位，这项长期承诺的推进速度放缓。追加协调可以维持进度；接受放缓则机构占用延长一夜。',
      source: '外交部危机中心 · 模拟反馈'
    },
    groundwork: {
      kicker: '前期准备落地',
      title: '{choice} 的准备工作已经生效',
      body: '{note}',
      source: '{agency} · 模拟反馈'
    },
    setback: {
      kicker: '前期事务失效的后果',
      title: '{choice} 失效影响后续工作',
      body: '{note}',
      source: '{agency} · 模拟反馈'
    }
  };

  // 治理风格倾向（不是职业或道德评分）。
  const STYLE_META = {
    hands_on: { label: '倾向亲自介入', note: '你多次亲自推动受阻命令，换来更快的执行，也消耗了机构协调和其他事务的注意力。' },
    delegating: { label: '倾向机构委派', note: '你更多把执行交给机构，节省了总统注意力，但承担了交接延迟与协调磨损。' },
    coordinating: { label: '倾向跨部门协调', note: '你把注意力用于召集机构、维持协调余量，让命令更少因协调不足而停下。' },
    verifying: { label: '倾向先核实情报', note: '你常在签发前追问和核实，减少了在不可靠信息上行动，也放慢了节奏。' },
    military: { label: '军事事务优先', note: '你的命令主要投向军队、首都防御与前线方向。' },
    continuity: { label: '政府连续性优先', note: '你的命令主要投向政府运转、指挥链和总统安全。' },
    external: { label: '外交与外部协调优先', note: '你把较多资源投向援助请求、外交承诺与国际沟通。' },
    society: { label: '社会与城市优先', note: '你的命令主要投向城市秩序、社会动员与公共沟通。' },
    balanced: { label: '灵活平衡', note: '你的命令分散在多个领域，没有单一方向明显压过其他方向。' }
  };

  root.LZS_STRATEGY = {
    dayFocus: DAY_FOCUS,
    timeProfiles: TIME_PROFILES,
    kindLabels: KIND_LABELS,
    links: LINKS,
    interventionBacklog: INTERVENTION_BACKLOG,
    standing: STANDING,
    delegation: DELEGATION,
    dispatchText: DISPATCH_TEXT,
    styleMeta: STYLE_META,
    recordsKey: 'lzs_records_v1'
  };
})(typeof window !== 'undefined' ? window : globalThis);