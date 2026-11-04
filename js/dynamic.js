/* 小泽模拟器 v1.1.0 · 动态战役事件池
   设计原则（见 docs/DYNAMIC_EVENTS.md）：
   - 事件不是随机抽卡，而是由「此前决策 + 当前状态 + 时间窗口 + 已发生事件」共同决定。
   - 每局只有一个随机种子，写入存档；同种子 + 同决策序列 → 同样的事件集合（可复现）。
   - 四个层次：历史骨架（js/campaign.js 的 13 个窗口，不受随机影响）、条件事件、状态事件、低概率摩擦。
   - 所有文字只写当时可以合理获得的东西；历史属性逐条标注，不把推演写成史实。
   - 数值均为模拟设计值，不是历史统计。 */
(function (root) {
  'use strict';

  const VERSION = '1.1.0';

  /* 历史属性：每个事件模板必须选择其中一项。 */
  const HISTORY_KINDS = {
    fact: '历史事实',
    supported: '历史资料支持的合理决策',
    simulated: '基于真实条件的模拟推演',
    assumption: '为游戏机制设计的假设'
  };

  const LAYERS = {
    condition: '条件事件 · 由此前决策触发',
    state: '状态事件 · 由当前处境触发',
    friction: '摩擦事件 · 有限随机扰动'
  };

  /* 六个重大决策节点与推演模块的对应关系（推演属性）。 */
  const REPLAY_NODES = {
    airfield: '安东诺夫机场决策',
    capital: '政府连续性',
    bridges: '伊尔平河与西北方向',
    reserve: '预备队配置（莫什春 / 布罗瓦雷）',
    aid: '外援协调',
    signal: '撤退信号判断',
    return: '重新进入失地'
  };

  /*
   * 事件模板字段：
   *   id            唯一标识（写入存档的触发记录）
   *   layer         condition / state / friction
   *   window        [起, 止] 可触发的决策窗口序号（1—13）
   *   when          触发条件（choices / flags / minStat / minCoord / aid / after / before）
   *   source        事件来源（哪个机构、什么形式）
   *   title/info    玩家能获得的信息（只写当时可得）
   *   needAction    true = 需要总统处理；false = 仅通报
   *   options       可选行动（ap / effects / cooperation / setFlags / delayed）
   *   follow        本事件之后可以解锁的后续事件 id
   *   history       历史属性键（HISTORY_KINDS）
   *   historyNote   为什么这么标注（写清史实与推演的边界）
   *   replay        归属的推演节点（REPLAY_NODES 的键）
   */
  const TEMPLATES = [
    /* ===== 安东诺夫机场 ===== */
    {
      id: 'dyn_runway_transport',
      layer: 'condition', window: [3, 9],
      when: { choices: ['c_deny_runway', 'c_late_deny'], before: ['dyn_runway_transport'] },
      source: '总参谋部 · 机场方向评估', agency: 'general_staff',
      title: '跑道被破坏之后的运输安排',
      info: '机场方向的报告说，跑道已经不能按原来的条件使用。对方改用车队沿公路推进，但它的运输组织明显比原计划慢。问题是自己这边也同样失去了空运条件，后面的补给要全部走地面。',
      needAction: true,
      options: [
        { id: 'road_priority', label: '把地面运输优先级交给机场方向（1 AP，储备 −2）', ap: 1, effects: { reserve: -2, army: 2 }, coordination: 2, agency: 'logistics', setFlags: ['dyn_road_priority'] },
        { id: 'keep_plan', label: '维持原运输计划，各方向均摊', ap: 0, effects: { army: -1 }, setFlags: ['dyn_transport_flat'] }
      ],
      follow: 'dyn_airfield_ground_push',
      history: 'supported',
      historyNote: '「跑道被破坏、机场没能成为空中运输通道」这一判断来自战后研究；具体的地面运输调度是模型推演，不是当时的命令记录。',
      replay: 'airfield'
    },
    {
      id: 'dyn_airfield_ground_push',
      layer: 'condition', window: [5, 10],
      when: { after: ['dyn_runway_transport'] },
      source: '总参谋部 · 西北方向', agency: 'general_staff',
      title: '机场方向转为地面推进',
      info: '对方放弃从空中进入，把力量集中在机场外围的公路方向。侦察报告说，它们的车队在夜间移动更频繁。这说明封锁机场本身并没有让对方停下来，只是换了路线。',
      needAction: true,
      options: [
        { id: 'block_roads', label: '优先封锁通往首都的公路节点（2 AP，军队 −2、基辅 +2）', ap: 2, effects: { army: -2, kyiv: 2, pressure: -2 }, coordination: 1, agency: 'general_staff' },
        { id: 'watch', label: '只加强观察，不动用兵力', ap: 0, effects: { pressure: 1 } }
      ],
      history: 'simulated',
      historyNote: '「空中通道受阻后转向地面推进」符合当时的作战逻辑，但具体的兵力与时间点属于模型推演。',
      replay: 'airfield'
    },
    {
      id: 'dyn_airfield_kept_pressure',
      layer: 'condition', window: [4, 10],
      when: { choices: ['c_keep_airfield'] },
      source: '内务与地方系统 · 霍斯托梅尔方向', agency: 'interior',
      title: '机场还在自己手里，周边却越来越危险',
      info: '机场设施完整，理论上还能起降。但周边居民点和道路周边的交火一天比一天近，地方报告说，救护车已经不敢走主路。保留机场的价值和它带来的风险正在同时上升。',
      needAction: true,
      options: [
        { id: 'secure_flanks', label: '抽调力量清理机场外围（2 AP，基辅 +3、储备 −3）', ap: 2, effects: { kyiv: 3, reserve: -3, army: -1 }, setFlags: ['dyn_airfield_flanks'] },
        { id: 'let_local', label: '交给地方与领土防卫自行处置（0 AP，协调 −2）', ap: 0, effects: { kyiv: -2 }, coordination: -2, agency: 'interior' }
      ],
      follow: 'dyn_airfield_late_damage',
      history: 'simulated',
      historyNote: '「保留机场需要付出外围控制代价」是从当时的战场条件推出的推演结论，不是史料记载的决定。',
      replay: 'airfield'
    },
    {
      id: 'dyn_airfield_late_damage',
      layer: 'condition', window: [6, 12],
      when: { after: ['dyn_airfield_kept_pressure'], choices: ['c_keep_airfield'] },
      source: '总参谋部 · 工程与工兵', agency: 'general_staff',
      title: '现在破坏跑道已经晚了一步',
      info: '工程分队报告，如果要破坏跑道，需要的时间和器材都比最初更多，而且对方的观察与火力已经覆盖了施工区。晚做一次，代价比早做更高。',
      needAction: true,
      options: [
        { id: 'do_late', label: '下令补做破坏，接受更高风险（2 AP，军队 −3、储备 −4、压力 −3）', ap: 2, effects: { army: -3, reserve: -4, pressure: -3 }, setFlags: ['c_runway_denied', 'dyn_late_damage'] },
        { id: 'skip_late', label: '放弃破坏，集中力量守外围', ap: 0, effects: { pressure: 2 }, setFlags: ['dyn_airfield_unusable_none'] }
      ],
      history: 'assumption',
      historyNote: '「同一决策做得越晚代价越高」是本作为决策研究设置的机制假设，用来观察时机成本，不是史实。',
      replay: 'airfield'
    },
    {
      id: 'dyn_airfield_counter_cost',
      layer: 'condition', window: [4, 8],
      when: { choices: ['c_counter_airfield'] },
      source: '总参谋部 · 伤亡与补充', agency: 'general_staff',
      title: '反击之后的补充问题',
      info: '参与反击的分队报告人员和弹药消耗都比预期大。它们夺回了一部分区域，但没有力量长期守住。现在的问题是：把这些分队补满，还是让它们撤下来整编。',
      needAction: true,
      options: [
        { id: 'refill', label: '优先补充这些分队（1 AP，储备 −4、军队 +2）', ap: 1, effects: { reserve: -4, army: 2 }, coordination: 2, agency: 'general_staff' },
        { id: 'withdraw_unit', label: '撤下来整编，接受区域反复易手（0 AP，基辅 −2、军队 +1）', ap: 0, effects: { kyiv: -2, army: 1 } }
      ],
      history: 'supported',
      historyNote: '「反击后需要补充与整编」是当时战斗的普遍条件；具体分队与数量为模拟设计，不是史料数字。',
      replay: 'airfield'
    },
    {
      id: 'dyn_airfield_interdict_result',
      layer: 'condition', window: [6, 11],
      when: { choices: ['c_interdict'] },
      source: '总参谋部 · 防空与火力', agency: 'general_staff',
      title: '拦截之后，机场区成了不确定地带',
      info: '自己这边没有长期守机场，把力量用在拦截后续运输上。结果是机场区变成了一片双方都不完全控制的地带：对方的集结点难以确认，自己的防空也说不清哪些目标最该打。',
      needAction: true,
      options: [
        { id: 'more_recon', label: '要求补充侦察，先弄清再打（1 AP，协调 +3）', ap: 1, effects: { army: 1 }, coordination: 3, agency: 'general_staff', setFlags: ['dyn_recon_first'] },
        { id: 'blind_fire', label: '按现有情报继续压制（0 AP，储备 −2、压力 −1）', ap: 0, effects: { reserve: -2, pressure: -1 } }
      ],
      history: 'simulated',
      historyNote: '史料确认机场争夺激烈、控制权说法不一；「不确定地带」的判断属于对当时条件的推演描述。',
      replay: 'airfield'
    },

    /* ===== 政府连续性 ===== */
    {
      id: 'dyn_capital_crowding',
      layer: 'condition', window: [4, 9],
      when: { choices: ['c_stay_capital'] },
      source: '总统办公室 · 办公厅', agency: 'office',
      title: '所有人都在同一栋楼里',
      info: '核心团队都留在首都，指挥连续性是保住了，但办公厅报告说，同一栋楼里同时处理军事简报、地方请求和对外沟通，文件在楼道里排队。安全风险与行政效率变成同一个问题。',
      needAction: true,
      options: [
        { id: 'split_floors', label: '按职能分层办公，晚上集中通报（1 AP，政府 +2、安全 +2）', ap: 1, effects: { gov: 2, safety: 2 }, coordination: 2, agency: 'office' },
        { id: 'keep_dense', label: '维持集中办公，靠加班解决（0 AP，政府 −1）', ap: 0, effects: { gov: -1 }, coordination: -1, agency: 'office' }
      ],
      follow: 'dyn_capital_single_point',
      history: 'supported',
      historyNote: '战时首都的行政集中与人身风险是当时的真实张力；具体办公安排为模拟设计。',
      replay: 'capital'
    },
    {
      id: 'dyn_capital_single_point',
      layer: 'condition', window: [6, 12],
      when: { after: ['dyn_capital_crowding'] },
      source: '安保部门 · 风险评估', agency: 'interior',
      title: '指挥点只有一个的代价',
      info: '安保部门提出，如果指挥能力集中在一处，那么对方不需要打到首都，只要打准这一处就够了。它们要求至少让一部分职能可以在别处继续。',
      needAction: true,
      options: [
        { id: 'make_backup', label: '连夜建立一个备用指挥点（2 AP，政府 +3、安全 +3、储备 −3）', ap: 2, effects: { gov: 3, safety: 3, reserve: -3 }, coordination: 2, agency: 'office', setFlags: ['c_split_succession'] },
        { id: 'accept_risk', label: '接受风险，把资源留给前线（0 AP，安全 −2）', ap: 0, effects: { safety: -2 } }
      ],
      history: 'supported',
      historyNote: '「指挥连续性需要分散」是战时政府的通行判断，也是 v1.0 已有的决策条件；这不是对某一具体真实安排的断言。',
      replay: 'capital'
    },
    {
      id: 'dyn_capital_relocate_gap',
      layer: 'condition', window: [4, 9],
      when: { choices: ['c_relocate'] },
      source: '总统办公室 · 信息汇总', agency: 'office',
      title: '两座城市之间的时差',
      info: '核心班子已经迁到西部。文件要走的路更长了：前线的请求先到首都，再转到西部，批复再回到首都执行。每一次往返都让当天能做的决定少一件。',
      needAction: true,
      options: [
        { id: 'direct_line', label: '为前线开一条直达西部的报告线（1 AP，政府 +3、协调 +3）', ap: 1, effects: { gov: 3 }, coordination: 3, agency: 'office' },
        { id: 'accept_gap', label: '接受这个节奏，避免命令互相冲突（0 AP，军队 −1）', ap: 0, effects: { army: -1 } }
      ],
      history: 'simulated',
      historyNote: '迁址带来的信息时差是模型推演；本作不声称真实政府当时采取过哪种具体流程。',
      replay: 'capital'
    },
    {
      id: 'dyn_capital_split_conflict',
      layer: 'condition', window: [5, 11],
      when: { choices: ['c_split_succession'] },
      source: '总统办公室 · 权限', agency: 'office',
      title: '两套指挥说自己都能作主',
      info: '备用指挥体系开始运转之后，出现了权限冲突：同一个请求，一处批了，另一处也批了，执行方收到两份不完全一样的指令。没有人是恶意的，但结果需要有人来定。',
      needAction: true,
      options: [
        { id: 'define_limits', label: '明确两条指挥线的边界并书面下发（1 AP，政府 +3、协调 +2）', ap: 1, effects: { gov: 3 }, coordination: 2, agency: 'office', setFlags: ['dyn_limits_clear'] },
        { id: 'let_them', label: '让两边自行协调，只看结果（0 AP，协调 −3）', ap: 0, effects: { gov: -1 }, coordination: -3, agency: 'office' }
      ],
      follow: 'dyn_capital_authority_drift',
      history: 'simulated',
      historyNote: '双轨指挥的授权冲突是从「建立备用指挥」这一选择推出的合理后果，属模型推演。',
      replay: 'capital'
    },
    {
      id: 'dyn_capital_authority_drift',
      layer: 'condition', window: [7, 12],
      when: { choices: ['c_decentralize'] },
      source: '内务与地方系统 · 地方主官', agency: 'interior',
      title: '地方开始自己做决定',
      info: '授权地方在框架内自主处理后，几个州的处置明显更快，但也有地方在没有通报的情况下改变了撤离安排。它们不是不听指挥，而是判断本地情况等不起。',
      needAction: true,
      options: [
        { id: 'set_frame', label: '只补一条底线规则：撤离变更必须通报（1 AP，政府 +2、基辅 +2）', ap: 1, effects: { gov: 2, kyiv: 2 }, coordination: 2, agency: 'interior' },
        { id: 'recentralize', label: '收回部分授权，恢复统一审批（0 AP，协调 −3、政府 +1）', ap: 0, effects: { gov: 1 }, coordination: -3, agency: 'office' }
      ],
      history: 'supported',
      historyNote: '战时地方自主与中央统一之间的张力有大量公开讨论；具体事件为模拟设计。',
      replay: 'capital'
    },

    /* ===== 伊尔平河与西北 ===== */
    {
      id: 'dyn_bridge_evacuation',
      layer: 'condition', window: [4, 9],
      when: { choices: ['c_blow_bridges'] },
      source: '内务与地方系统 · 撤离通道', agency: 'interior',
      title: '桥断了，撤离的车队堵在河边',
      info: '桥被破坏之后，对方的渡河难度确实增加了。但撤离的车队也被挤到了剩下的少数通道上，伊尔平与布恰方向的报告说，车队在河边排了很长，队伍里有老人和孩子。',
      needAction: true,
      options: [
        { id: 'open_corridor', label: '开辟并公布一条撤离走廊（2 AP，基辅 +9、意志 +2、储备 −2）', ap: 2, effects: { kyiv: 9, will: 2, reserve: -2 }, coordination: 2, agency: 'interior', setFlags: ['dyn_corridor'] },
        { id: 'hold_security', label: '优先保证通道不被对方利用（0 AP，意志 −2、协调 +1）', ap: 0, effects: { will: -2 }, coordination: 1, agency: 'general_staff' }
      ],
      follow: 'dyn_bridge_engineer',
      history: 'fact',
      historyNote: '伊尔平河桥梁被破坏有公开影像与战后研究支持；撤离受阻的具体规模与时间在资料中并不一致，本事件只写到「通道减少」这一层。',
      replay: 'bridges'
    },
    {
      id: 'dyn_bridge_engineer',
      layer: 'condition', window: [6, 12],
      when: { after: ['dyn_bridge_evacuation'] },
      source: '后勤与资源系统 · 工程器材', agency: 'logistics',
      title: '架桥器材不够用',
      info: '工程分队请求补充架桥和渡河器材。它们说得很直接：如果现在不准备，等需要过河的时候，就只能用船和临时便桥，一天能过的人和车都会少很多。',
      needAction: true,
      options: [
        { id: 'send_kit', label: '优先调拨架桥器材（1 AP，储备 −5、军队 +2）', ap: 1, effects: { reserve: -5, army: 2 }, coordination: 2, agency: 'logistics', setFlags: ['dyn_bridge_kit'] },
        { id: 'later', label: '等确定要过河再准备（0 AP，储备 +0）', ap: 0, effects: {} }
      ],
      history: 'simulated',
      historyNote: '架桥器材的紧缺与优先级排序是从工程保障常识推出的推演，不是史料记载的具体调拨。',
      replay: 'bridges'
    },
    {
      id: 'dyn_bridge_flood_cost',
      layer: 'condition', window: [4, 10],
      when: { choices: ['c_flood_valley'] },
      source: '内务与地方系统 · 河谷居民', agency: 'interior',
      title: '水挡住了对方，也挡住了自己',
      info: '河谷被淹之后，渡河确实困难了。但附近几个居民点的出入也受影响，有的地方只能靠船。地方主官问：这些人的补给和撤离，谁来负责？',
      needAction: true,
      options: [
        { id: 'local_supply', label: '组织水路补给与转移（1 AP，储备 −4、意志 +3）', ap: 1, effects: { reserve: -4, will: 3 }, coordination: 2, agency: 'interior' },
        { id: 'ignore', label: '暂不处理，先看军事效果（0 AP，意志 −3）', ap: 0, effects: { will: -3 } }
      ],
      history: 'supported',
      historyNote: '伊尔平河谷部分区域被淹有报道，确切时间与范围各来源不同；居民影响的具体处置为模拟设计。',
      replay: 'bridges'
    },
    {
      id: 'dyn_bridge_keep_risk',
      layer: 'condition', window: [5, 10],
      when: { choices: ['c_keep_bridges'] },
      source: '总参谋部 · 渡口', agency: 'general_staff',
      title: '桥还在，两边都在用它',
      info: '保留桥梁让撤离和补给都方便，也让对方多了一条可能的路。渡口附近的观察哨报告，对岸的车辆活动变多了，但还不能确定是准备渡河，还是在做别的安排。',
      needAction: true,
      options: [
        { id: 'prepare_demo', label: '预置爆破，只等命令（2 AP，军队 +2、储备 −2）', ap: 2, effects: { army: 2, reserve: -2 }, coordination: 2, agency: 'general_staff', setFlags: ['dyn_bridge_prepped'] },
        { id: 'watch_only', label: '只加观察哨，不预置炸药（0 AP，压力 +1）', ap: 0, effects: { pressure: 1 } }
      ],
      history: 'simulated',
      historyNote: '桥梁的军事价值与民用价值冲突是真实存在的两难；预置爆破这一具体做法属于模型推演。',
      replay: 'bridges'
    },

    /* ===== 预备队（莫什春 / 布罗瓦雷） ===== */
    {
      id: 'dyn_reserve_moshchun_attrition',
      layer: 'condition', window: [5, 11],
      when: { choices: ['c_reserve_moshchun'] },
      source: '总参谋部 · 河线', agency: 'general_staff',
      title: '莫什春方向的消耗比预计更大',
      info: '预备队投入西北河线后，对方几次试图越过伊尔平河都没有成功，但自己这边的消耗也很大。分队报告说，如果维持现在的强度，两周之内就需要轮换。',
      needAction: true,
      options: [
        { id: 'rotate_in', label: '从其他方向抽调轮换兵力（2 AP，军队 +2、基辅 −2）', ap: 2, effects: { army: 2, kyiv: -2 }, coordination: 1, agency: 'general_staff', setFlags: ['dyn_rotation_needed'] },
        { id: 'hold_line', label: '要求继续坚守，暂不轮换（0 AP，军队 −2、意志 +1）', ap: 0, effects: { army: -2, will: 1 } }
      ],
      history: 'supported',
      historyNote: '莫什春方向发生激烈战斗、俄军试图越过伊尔平河未形成突破，有乌方官方编年记载；消耗与轮换的具体数字为模拟设计。',
      replay: 'reserve'
    },
    {
      id: 'dyn_reserve_brovary_follow',
      layer: 'condition', window: [5, 11],
      when: { choices: ['c_reserve_brovary', 'c_brovary_ambush'] },
      source: '总参谋部 · 东侧', agency: 'general_staff',
      title: '东侧纵队被打散之后',
      info: '东侧的装甲纵队在接近城区前被伏击打散，几段道路被车辆残骸堵住。现在有两个问题同时出现：怎么清理这些残骸，以及被打散的对方分队分散到了哪里。',
      needAction: true,
      options: [
        { id: 'clear_road', label: '先清障，恢复东侧补给（1 AP，储备 −2、基辅 +2）', ap: 1, effects: { reserve: -2, kyiv: 2 }, coordination: 2, agency: 'logistics' },
        { id: 'hunt_groups', label: '先搜剿分散分队（1 AP，军队 +1、储备 −2）', ap: 1, effects: { army: 1, reserve: -2 }, coordination: 1, agency: 'general_staff' }
      ],
      history: 'supported',
      historyNote: '布罗瓦雷方向俄军装甲纵队遭伏击有当时的公开影像；后续清障与搜剿的具体安排属于模拟推演。',
      replay: 'reserve'
    },
    {
      id: 'dyn_reserve_split_dispute',
      layer: 'condition', window: [5, 10],
      when: { choices: ['c_reserve_split'] },
      source: '总参谋部 · 参谋意见', agency: 'general_staff',
      title: '参谋对「两边都加强」有意见',
      info: '预备队分成两部分之后，两个方向都得到了一些加强，也都不够。参谋部内部出现两种意见：一派认为应该立刻集中到一个方向，另一派认为现在改会更乱。总统需要决定要不要在这种争论里下一个明确的结论。',
      needAction: true,
      options: [
        { id: 'pick_one', label: '明确以一个方向为主，另一个方向转防御（1 AP，军队 +2、协调 −2）', ap: 1, effects: { army: 2 }, coordination: -2, agency: 'general_staff' },
        { id: 'keep_split', label: '维持当前分配，要求参谋部统一对外口径（0 AP，协调 +2）', ap: 0, effects: {}, coordination: 2, agency: 'general_staff' }
      ],
      history: 'simulated',
      historyNote: '「兵力分散导致两边都不够」是常见的军事判断，但具体争论内容为模型推演，不代表真实参谋部记录。',
      replay: 'reserve'
    },
    {
      id: 'dyn_reserve_hold_risk',
      layer: 'condition', window: [6, 11],
      when: { choices: ['c_reserve_hold'] },
      source: '总参谋部 · 预备队', agency: 'general_staff',
      title: '预备队还完整，但两个方向都在要人',
      info: '预备队一直没投入，这是目前手上唯一还算完整的机动力量。西北和东侧的报告都在要求增援。总参谋部提醒：现在保留意味着后面还有选择，但也意味着这段时间要自己顶住。',
      needAction: true,
      options: [
        { id: 'commit_now', label: '现在就把预备队投向最危险的方向（2 AP，按当前形势自动判定方向）', ap: 2, effects: { kyiv: 6, army: 2, reserve: -2 }, coordination: 1, agency: 'general_staff', setFlags: ['dyn_reserve_committed'] },
        { id: 'keep_hold', label: '继续保留，不动用（0 AP，压力 +2）', ap: 0, effects: { pressure: 2 } }
      ],
      history: 'assumption',
      historyNote: '「保留预备队」的收益与风险，是本作为研究指挥取舍设置的机制假设之一。',
      replay: 'reserve'
    },

    /* ===== 外援 ===== */
    {
      id: 'dyn_aid_silence',
      layer: 'condition', window: [5, 12],
      when: { aidStalled: true },
      source: '外交系统 · 请求进展', agency: 'foreign',
      title: '请求送出去很久，没有明确答复',
      info: '外交系统报告，几项最要紧的请求已经递出去，但对方一直停留在「正在研究」。没有人说不给，也没有人给出时间。这种沉默本身就需要处理。',
      needAction: true,
      options: [
        { id: 'renew_push', label: '重新排列请求优先级，只盯最急的（1 AP，国际 +3、协调 +2）', ap: 1, effects: { intl: 3 }, coordination: 2, agency: 'foreign', setFlags: ['dyn_aid_focus'] },
        { id: 'public_pressure', label: '公开说明需求，用舆论施压（0 AP，国际 +1、意志 +2、外交协调 −2）', ap: 0, effects: { intl: 1, will: 2 }, coordination: -2, agency: 'foreign' }
      ],
      history: 'supported',
      historyNote: '援助请求过程缓慢、答复不明确是当时的普遍情况（公开讨论很多）；本条不含具体国家承诺。',
      replay: 'aid'
    },
    {
      id: 'dyn_aid_conditions',
      layer: 'condition', window: [6, 12],
      when: { aidAtLeast: 1 },
      source: '外交系统 · 承诺条件', agency: 'foreign',
      title: '承诺附带了条件',
      info: '伙伴的答复来了，但附带条件：交付要分批、使用范围要说明、还要附加一些程序要求。这些条件不算 unreasonable，可它们会让东西到得更晚。',
      needAction: true,
      options: [
        { id: 'accept_terms', label: '接受条件，换取确定的交付时间（1 AP，国际 +4）', ap: 1, effects: { intl: 4 }, coordination: 2, agency: 'foreign', setFlags: ['dyn_aid_terms'] },
        { id: 'negotiate', label: '要求简化程序，可能推迟（0 AP，国际 +1、储备 −0）', ap: 0, effects: { intl: 1 } }
      ],
      history: 'supported',
      historyNote: '援助附带程序与使用条件是公开报道中反复出现的主题；本事件不指名任何国家，也不写具体装备数量。',
      replay: 'aid'
    },
    {
      id: 'dyn_aid_transport_delay',
      layer: 'condition', window: [7, 13],
      when: { aidAtLeast: 2 },
      source: '后勤与资源系统 · 运输', agency: 'logistics',
      title: '东西在路上，但路不好走',
      info: '已经确定交付的物资进入运输阶段，但边境与铁路枢纽都积压。后勤系统说，可以优先保障其中一部分，代价是其他方向的补给延后。',
      needAction: true,
      options: [
        { id: 'priority_aid', label: '优先保障援助物资转运（1 AP，储备 −2、军队 +2）', ap: 1, effects: { reserve: -2, army: 2 }, coordination: 2, agency: 'logistics' },
        { id: 'keep_civil', label: '保持民用优先，援助按正常序位（0 AP，意志 +2、军队 −1）', ap: 0, effects: { will: 2, army: -1 } }
      ],
      history: 'simulated',
      historyNote: '运输积压是从当时铁路与公路条件推出的推演；具体路线、时间与规模不属于可核实记录。',
      replay: 'aid'
    },
    {
      id: 'dyn_aid_allocation',
      layer: 'condition', window: [8, 13],
      when: { aidDone: true },
      source: '总参谋部 · 分配', agency: 'general_staff',
      title: '东西到了，怎么分还没定',
      info: '部分援助物资已经抵达。现在的争论不是要不要用，而是先给谁：首都防空、西北河线，还是东侧机动分队。三个方向都能说出自己的理由。',
      needAction: true,
      options: [
        { id: 'to_capital', label: '优先首都防空（1 AP，基辅 +4、安全 +2）', ap: 1, effects: { kyiv: 4, safety: 2 }, coordination: 1, agency: 'general_staff' },
        { id: 'to_northwest', label: '优先西北河线（1 AP，军队 +3、基辅 +1）', ap: 1, effects: { army: 3, kyiv: 1 }, coordination: 1, agency: 'general_staff' },
        { id: 'to_east', label: '优先东侧机动分队（1 AP，军队 +2、意志 +2）', ap: 1, effects: { army: 2, will: 2 }, coordination: 1, agency: 'general_staff' }
      ],
      history: 'assumption',
      historyNote: '「同一批物资先给谁」是本作设置的分配机制，用来观察优先级如何改变后续局面；真实分配过程无法用公开资料逐项还原。',
      replay: 'aid'
    },

    /* ===== 撤退信号与重新进入 ===== */
    {
      id: 'dyn_signal_contradiction',
      layer: 'condition', window: [10, 13],
      when: { choices: ['c_trust_redeploy', 'c_verify_signal', 'c_stay_alert'] },
      source: '情报系统 · 交叉核对', agency: 'general_staff',
      title: '一个说在撤，一个说在重新部署',
      info: '对方宣布减少首都方向的活动，同时有情报判断认为这更像重新部署而不是撤退。两种说法都能找到依据。此刻最能说明问题的，是道路上的实际车辆、弹药消耗和俘虏口供，而不是声明本身。',
      needAction: true,
      options: [
        { id: 'field_verify', label: '用侦察与俘虏口供交叉核实（2 AP，军队 +2、协调 +3）', ap: 2, effects: { army: 2 }, coordination: 3, agency: 'general_staff', setFlags: ['dyn_signal_verified'] },
        { id: 'act_on_signal', label: '按「正在撤退」调整部署（0 AP，军队 −1、压力 −2）', ap: 0, effects: { army: -1, pressure: -2 }, setFlags: ['c_trusted_signal'] }
      ],
      history: 'fact',
      historyNote: '3 月 29 日俄方宣布减少基辅与切尔尼戈夫方向军事活动、美方官员表示不认为是撤退而是重新部署，这两点均有公开记录。本事件不引用任何人的话。',
      replay: 'signal'
    },
    {
      id: 'dyn_signal_public_expectation',
      layer: 'condition', window: [11, 13],
      when: { choices: ['c_cautious_message'] },
      source: '公共沟通系统 · 舆情', agency: 'communications',
      title: '谨慎的表态，和等不及的情绪',
      info: '公开表态保持谨慎，没有宣布胜利。但一部分民众和志愿者已经自己往回走，他们不想等官方的话。沟通系统担心，如果局势再变，这些人会处在最危险的位置。',
      needAction: true,
      options: [
        { id: 'warn_public', label: '明确公布「现在回去仍然危险」（1 AP，意志 +2、安全 +1）', ap: 1, effects: { will: 2, safety: 1 }, coordination: 2, agency: 'communications' },
        { id: 'let_return', label: '不劝阻，避免与民意对立（0 AP，意志 +1、基辅 −2）', ap: 0, effects: { will: 1, kyiv: -2 } }
      ],
      history: 'supported',
      historyNote: '撤离区重新进入的安全警告在当时确实是公开议题；具体舆情与人数为模拟设计。',
      replay: 'signal'
    },
    {
      id: 'dyn_signal_pursue_cost',
      layer: 'condition', window: [11, 13],
      when: { choices: ['c_pursue'] },
      source: '总参谋部 · 跟进部队', agency: 'general_staff',
      title: '跟进太快，先碰到了地雷',
      info: '跟进部队推进很快，但在几条道路上遇到了地雷和未爆物，出现人员和车辆损失。工程分队说，需要先扫雷再前进，否则每一次推进都要用伤亡换距离。',
      needAction: true,
      options: [
        { id: 'slow_sweep', label: '放慢速度，先扫雷（1 AP，军队 +2、协调 +2）', ap: 1, effects: { army: 2 }, coordination: 2, agency: 'general_staff', setFlags: ['dyn_sweep_first'] },
        { id: 'push_fast', label: '继续快速推进，接受风险（0 AP，军队 −3、基辅 +2）', ap: 0, effects: { army: -3, kyiv: 2 } }
      ],
      history: 'supported',
      historyNote: '撤离区遍布地雷与未爆物、重新进入需要排雷，是 4 月初公开报道与后续排雷工作的基本事实；伤亡数字不写。',
      replay: 'return'
    },
    {
      id: 'dyn_return_fast_risk',
      layer: 'condition', window: [12, 13],
      when: { choices: ['c_fast_return'] },
      source: '内务与地方系统 · 重新进入', agency: 'interior',
      title: '人已经回去了，安全确认还没做完',
      info: '城镇重新升起旗帜的画面已经公开。但地方报告说，有些街区还没有完成排雷与建筑安全检查，回去的人正在自己清理院子。这个顺序问题现在必须处理。',
      needAction: true,
      options: [
        { id: 'rush_clear', label: '紧急抽调工程力量做安全清查（2 AP，储备 −3、意志 +3）', ap: 2, effects: { reserve: -3, will: 3 }, coordination: 2, agency: 'interior' },
        { id: 'let_people', label: '让居民自行注意，先恢复秩序（0 AP，意志 −2、基辅 −1）', ap: 0, effects: { will: -2, kyiv: -1 } }
      ],
      history: 'supported',
      historyNote: '「先宣布恢复、后完成安全清查」造成的风险在 4 月初的公开报道中有对应；具体街区与事件为模拟设计。',
      replay: 'return'
    },
    {
      id: 'dyn_return_staged_slow',
      layer: 'condition', window: [12, 13],
      when: { choices: ['c_staged_return'] },
      source: '公共沟通系统 · 期待', agency: 'communications',
      title: '分阶段进入，被说成「太慢」',
      info: '按先排雷、再进入的顺序推进，安全上更稳，但公开舆论开始不耐烦：别的地方已经升旗，这里还在等。沟通系统问，要不要解释这个顺序。',
      needAction: true,
      options: [
        { id: 'explain', label: '公开解释排雷与安全流程（1 AP，意志 +3、协调 +2）', ap: 1, effects: { will: 3 }, coordination: 2, agency: 'communications' },
        { id: 'speed_up', label: '压缩流程，加快进入（0 AP，基辅 +2、军队 −1）', ap: 0, effects: { kyiv: 2, army: -1 } }
      ],
      history: 'simulated',
      historyNote: '「安全优先」与「尽快恢复存在」之间的公众压力是合理推演；具体舆论反应为模型设计。',
      replay: 'return'
    },

    /* ===== 状态事件 ===== */
    {
      id: 'dyn_state_logistics_jam',
      layer: 'state', window: [4, 12],
      when: { maxCoord: { logistics: 42 } },
      source: '后勤与资源系统 · 积压', agency: 'logistics',
      title: '运输积压已经堆到枢纽外面',
      info: '后勤系统的协调能力跟不上现在的运输量，铁路与公路枢纽外面排队等卸货的车越来越多。这不是缺物资，而是送不到该到的地方。',
      needAction: true,
      options: [
        { id: 'clear_jam', label: '抽调人手清一次积压（1 AP，储备 +3、协调 +4）', ap: 1, effects: { reserve: 3 }, coordination: 4, agency: 'logistics' },
        { id: 'ration', label: '改为按日配给，减少同时运输量（0 AP，储备 +1、军队 −1）', ap: 0, effects: { reserve: 1, army: -1 } }
      ],
      history: 'simulated',
      historyNote: '后勤堵塞是战争模拟的常态现象，本条的触发完全取决于游戏内协调值，不含史实断言。',
      replay: 'aid'
    },
    {
      id: 'dyn_state_staff_clash',
      layer: 'state', window: [4, 12],
      when: { maxCoord: { general_staff: 40 } },
      source: '总参谋部 · 内部意见', agency: 'general_staff',
      title: '参谋部内部吵起来了',
      info: '军事协调降得太低，参谋部在两个方向之间反复改主意，前线下达的命令出现了互相矛盾的情况。执行部队不知道该先听哪一条。',
      needAction: true,
      options: [
        { id: 'force_priority', label: '由总统直接定一个优先级（2 AP，军队 +3、协调 +3）', ap: 2, effects: { army: 3 }, coordination: 3, agency: 'general_staff' },
        { id: 'let_staff', label: '让参谋部自己解决（0 AP，协调 −2、军队 −1）', ap: 0, effects: { army: -1 }, coordination: -2, agency: 'general_staff' }
      ],
      history: 'simulated',
      historyNote: '指挥体系的内部摩擦是战时组织问题，本条为状态触发的模拟事件。',
      replay: 'reserve'
    },
    {
      id: 'dyn_state_office_backlog',
      layer: 'state', window: [4, 12],
      when: { minInterventions: 3 },
      source: '总统办公室 · 待批文件', agency: 'office',
      title: '桌上是这几天攒下来的文件',
      info: '连续几天亲自处理每一件事之后，办公桌上积压了一批需要签字的文件。办公厅说，其中一部分其实早就可以由部门按授权办理。',
      needAction: true,
      options: [
        { id: 'delegate_batch', label: '把这批文件按现有授权交给部门（1 AP，协调 +4）', ap: 1, effects: {}, coordination: 4, agency: 'office', setFlags: ['dyn_batch_delegated'] },
        { id: 'sign_all', label: '全部亲自签，今天不休息（0 AP，协调 −2、安全 −2）', ap: 0, effects: { safety: -2 }, coordination: -2, agency: 'office' }
      ],
      history: 'assumption',
      historyNote: '「总统注意力是稀缺资源」是本作的核心机制假设，本事件用于把这一假设变成可见的事务。',
      replay: 'capital'
    },
    {
      id: 'dyn_state_local_order',
      layer: 'state', window: [5, 12],
      when: { maxStat: { safety: 34 } },
      source: '内务与地方系统 · 城市秩序', agency: 'interior',
      title: '首都的秩序需要有人负责',
      info: '总统安全状况不佳，安保资源被优先用在了总统身上。内务系统提醒，首都的街区秩序、检查站和夜间管控不能因此出现空档。',
      needAction: true,
      options: [
        { id: 'shift_guards', label: '把部分安保力量转给城市管控（1 AP，基辅 +2、安全 −2）', ap: 1, effects: { kyiv: 2, safety: -2 }, coordination: 2, agency: 'interior' },
        { id: 'keep_close', label: '维持现状，优先保证指挥安全（0 AP，基辅 −2、协调 −1）', ap: 0, effects: { kyiv: -2 }, coordination: -1, agency: 'interior' }
      ],
      history: 'simulated',
      historyNote: '安保资源与城市秩序此消彼长，属于模型推演。',
      replay: 'capital'
    },
    {
      id: 'dyn_state_aid_pending',
      layer: 'state', window: [7, 13],
      when: { aidAtLeast: 2, maxCoord: { logistics: 50 } },
      source: '外交系统 · 催办', agency: 'foreign',
      title: '东西到了仓库，还没分下去',
      info: '援助物资已经进入本地仓库，但分配环节很慢。外交系统接到催问：东西到底有没有用上？它们需要一份能对外说明的进度。',
      needAction: true,
      options: [
        { id: 'force_alloc', label: '下令三天内完成分配（1 AP，军队 +2、国际 +2）', ap: 1, effects: { army: 2, intl: 2 }, coordination: 1, agency: 'logistics' },
        { id: 'explain_delay', label: '如实说明分配需要时间（0 AP，国际 −1、协调 +2）', ap: 0, effects: { intl: -1 }, coordination: 2, agency: 'foreign' }
      ],
      history: 'simulated',
      historyNote: '援助抵达后分配缓慢是常见问题，本条为状态触发。',
      replay: 'aid'
    },

    /* ===== 低概率摩擦 ===== */
    {
      id: 'dyn_friction_report_delay',
      layer: 'friction', window: [3, 13],
      when: { chance: 0.5 },
      source: '情报系统 · 报告延误', agency: 'general_staff',
      title: '一份重要的报告晚到了半天',
      info: '一份关于道路与车辆的报告在传递中延误，等到总统看到时，里面的信息已经过了时效。没有人失职，只是通讯和加密流程在高峰期卡住了。',
      needAction: false,
      options: [{ id: 'ack', label: '已阅，要求次日补一份最新情况', ap: 0, effects: {} }],
      history: 'assumption',
      historyNote: '报告延误属于本作的低概率摩擦机制，用于增加每局的不确定性；不代表任何特定的真实事件。',
      replay: null
    },
    {
      id: 'dyn_friction_road_blocked',
      layer: 'friction', window: [4, 13],
      when: { chance: 0.45 },
      source: '后勤与资源系统 · 道路', agency: 'logistics',
      title: '一条主要公路临时不能用了',
      info: '一条往返首都的主要公路因为积水与临时管制不能通行，运输队需要绕行。后勤系统估计，这会影响到今天的部分补给，但还在可调整范围内。',
      needAction: false,
      options: [{ id: 'ack', label: '已阅，按绕行安排', ap: 0, effects: { reserve: -1 } }],
      history: 'assumption',
      historyNote: '道路临时受阻是本作设置的低概率摩擦，不指称具体路段或事件。',
      replay: null
    },
    {
      id: 'dyn_friction_stock_mismatch',
      layer: 'friction', window: [5, 13],
      when: { chance: 0.4 },
      source: '后勤与资源系统 · 清点', agency: 'logistics',
      title: '清点结果和账面对不上',
      info: '仓库清点发现一批物资的账面数字与实际数量有差异。可能是记录问题，也可能是运输途中损失。现在还没有结论。',
      needAction: false,
      options: [
        { id: 'ack', label: '已阅，要求重新清点', ap: 0, effects: { reserve: -1 } },
        { id: 'audit', label: '追查差异来源（1 AP，协调 +3）', ap: 1, effects: {}, coordination: 3, agency: 'logistics' }
      ],
      history: 'assumption',
      historyNote: '清点差异是本作的低概率摩擦机制。',
      replay: null
    },
    {
      id: 'dyn_friction_comms',
      layer: 'friction', window: [4, 13],
      when: { chance: 0.4 },
      source: '公共沟通系统 · 信息', agency: 'communications',
      title: '一条地方消息提前出现在公开渠道',
      info: '一条本应统一发布的地方消息被提前发到了公开渠道，内容与中央的说法略有出入。它不严重，但需要有人在今天之内统一口径。',
      needAction: true,
      options: [
        { id: 'unify', label: '当天统一说明（1 AP，协调 +3、意志 +1）', ap: 1, effects: { will: 1 }, coordination: 3, agency: 'communications' },
        { id: 'ignore', label: '不处理，等它自己过去（0 AP，协调 −2）', ap: 0, effects: {}, coordination: -2, agency: 'communications' }
      ],
      history: 'assumption',
      historyNote: '信息口径不一致属于本作设置的低概率摩擦，不冒充真实报道。',
      replay: null
    }
  ];

  /* ===== 随机种子与可复现性 ===== */

  /* 32 位字符串散列，用于让「种子 + 窗口 + 事件 id」得到稳定分数。 */
  function hashString(text) {
    let h = 2166136261 >>> 0;
    const str = String(text || '');
    for (let i = 0; i < str.length; i += 1) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  /* mulberry32：同一个种子得到同一串数，便于复盘与测试。 */
  function rng(seed) {
    let a = (Number(seed) >>> 0) || 1;
    return function next() {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeSeed() {
    const base = Date.now() >>> 0;
    return (base ^ hashString(String(Math.random()))) >>> 0;
  }

  /* ===== 条件判定 ===== */

  function appliedChoices(state) {
    return (state && state.choices ? state.choices : []).map(function (record) { return record && record.choiceId; }).filter(Boolean);
  }

  function aidStateFor(state) {
    const lines = (state && state.aid && state.aid.lines) || [];
    return {
      count: lines.length,
      maxStage: lines.reduce(function (max, line) { return Math.max(max, typeof line.stage === 'number' ? line.stage : -1); }, -1),
      anyStalled: lines.some(function (line) { return line.stalled; }),
      anyDone: lines.some(function (line) { return line.done; })
    };
  }

  function firedIds(state) {
    const dyn = state && state.campaign && state.campaign.dyn;
    return dyn && dyn.fired ? Object.keys(dyn.fired) : [];
  }

  function conditionMet(state, when) {
    if (!when) return true;
    if (when.chance && typeof when.chance === 'number') {
      /* 低概率摩擦：用「种子 + 窗口 + 事件 id」决定，不在判定阶段消耗随机数 */
      const score = hashString((state.campaign.seed || 0) + ':' + state.round + ':' + (when.__id || '')) % 1000 / 1000;
      if (score > when.chance) return false;
    }
    const choices = appliedChoices(state);
    if (when.choices && when.choices.length && !when.choices.some(function (id) { return choices.indexOf(id) !== -1; })) return false;
    if (when.noneChoices && when.noneChoices.length && when.noneChoices.some(function (id) { return choices.indexOf(id) !== -1; })) return false;
    if (when.flags && when.flags.length && !when.flags.every(function (flag) { return !!state.flags[flag]; })) return false;
    if (when.noneFlags && when.noneFlags.length && when.noneFlags.some(function (flag) { return !!state.flags[flag]; })) return false;
    if (when.minStat) {
      const bad = Object.keys(when.minStat).some(function (key) { return (state.stats[key] || 0) < when.minStat[key]; });
      if (bad) return false;
    }
    if (when.maxStat) {
      const bad = Object.keys(when.maxStat).some(function (key) { return (state.stats[key] || 0) > when.maxStat[key]; });
      if (bad) return false;
    }
    if (when.minCoord) {
      const bad = Object.keys(when.minCoord).some(function (id) {
        const rec = state.agencies && state.agencies[id];
        return !rec || rec.coordination < when.minCoord[id];
      });
      if (bad) return false;
    }
    if (when.maxCoord) {
      const bad = Object.keys(when.maxCoord).some(function (id) {
        const rec = state.agencies && state.agencies[id];
        return !rec || rec.coordination > when.maxCoord[id];
      });
      if (bad) return false;
    }
    const aid = aidStateFor(state);
    if (typeof when.aidAtLeast === 'number' && aid.count < when.aidAtLeast) return false;
    if (when.aidStalled && !aid.anyStalled) return false;
    if (when.aidDone && !aid.anyDone) return false;
    const fired = firedIds(state);
    if (when.after && when.after.length && !when.after.every(function (id) { return fired.indexOf(id) !== -1; })) return false;
    if (when.before && when.before.length && when.before.some(function (id) { return fired.indexOf(id) !== -1; })) return false;
    if (typeof when.minInterventions === 'number') {
      const count = (state.interventionRounds || []).length;
      if (count < when.minInterventions) return false;
    }
    return true;
  }

  /* 给每个模板附上 id，供 chance 判定使用（不改变模板本身）。 */
  TEMPLATES.forEach(function (template) {
    if (template.when) template.when.__id = template.id;
  });

  const byIdMap = {};
  TEMPLATES.forEach(function (template) { byIdMap[template.id] = template; });

  /*
   * 延迟后果表：格式与决策的 delayed 一致（delay 以窗口计，effects 用同一套状态键）。
   * 单独列出是为了让「哪条处理方式在几个窗口后留下什么」一眼可查，不必翻进模板正文。
   */
  const DELAYS = {
    'dyn_runway_transport:road_priority': [
      { delay: 2, label: '道路优先的代价', note: '道路和桥梁连续两个窗口占用工程力量，前沿单位的轮换与补给一直被压后。', effects: { army: -1, reserve: -1 } }
    ],
    'dyn_runway_transport:keep_plan': [
      { delay: 3, label: '监视任务占住的轮换名额', note: '跑道监视分队一直没有撤下来，轮换表上少了一个位置。', effects: { army: -1 } }
    ],
    'dyn_airfield_ground_push:block_roads': [
      { delay: 2, label: '路障吃掉的工程器材', note: '为了封锁接近路，工程器材被提前用掉，后面几处障碍只能简化。', effects: { reserve: -1 } }
    ],
    'dyn_capital_crowding:split_floors': [
      { delay: 2, label: '分散办公的通信成本', note: '楼层分开之后，一件普通公文要多走两道转交，批复变慢。', effects: { gov: -1 } }
    ],
    'dyn_capital_crowding:keep_dense': [
      { delay: 3, label: '集中办公的单点风险', note: '核心人员仍然集中在一处，安保部门第二次提出同一个问题。', effects: { safety: -2 } }
    ],
    'dyn_bridge_evacuation:open_corridor': [
      { delay: 2, label: '保持通道的代价', note: '通道一直开着，检查被压缩到最低限度，进出人员的管理开始出现漏洞。', effects: { safety: -1, will: 1 } }
    ],
    'dyn_bridge_engineer:send_kit': [
      { delay: 3, label: '工程分队的轮换请求', note: '派出去的工程分队连续作业，提出轮换，但一时没有可替的人。', effects: { reserve: -1 } }
    ],
    'dyn_reserve_moshchun_attrition:rotate_in': [
      { delay: 2, label: '轮换带走的火力', note: '把一线单位换下来整补，阵地上短时间内少了一部分火力。', effects: { kyiv: -1 } }
    ],
    'dyn_reserve_brovary_follow:clear_road': [
      { delay: 2, label: '清障进度落后', note: '清障分队沿路推进得比计划慢，后续车队只能排队等。', effects: { army: 1, reserve: -1 } }
    ],
    'dyn_aid_transport_delay:priority_aid': [
      { delay: 2, label: '优先放行的连带影响', note: '为援助车队优先放行，民用物资又往后排了一批，地方开始抱怨。', effects: { will: -1 } }
    ],
    'dyn_aid_allocation:to_capital': [
      { delay: 3, label: '分配之后的清点差异', note: '装备下发到首都方向之后，库存账目与实际数量出现差异，需要重新清点。', effects: { reserve: -1 } }
    ],
    'dyn_signal_contradiction:field_verify': [
      { delay: 2, label: '核实结果迟到', note: '派出去核实的人比预计晚回来，这段时间的部署只能保持不变。', effects: { will: -1 } }
    ],
    'dyn_state_logistics_jam:clear_jam': [
      { delay: 2, label: '积压转移', note: '主枢纽的积压被清掉，压力转到了下一段转运点。', effects: { reserve: -1 } }
    ],
    'dyn_state_staff_clash:force_priority': [
      { delay: 2, label: '被压下的参谋意见', note: '被否掉的意见没有再进入议程，但同一批人在后续会议上不再主动提。', effects: { army: -1 } }
    ],
    'dyn_return_fast_risk:rush_clear': [
      { delay: 2, label: '清障未完成的路段', note: '为了让居民早点回去，几段路在没有完全确认的情况下开放。', effects: { safety: -2 } }
    ]
  };

  Object.keys(DELAYS).forEach(function (key) {
    const parts = key.split(':');
    const template = byIdMap[parts[0]];
    if (!template) return;
    const option = (template.options || []).filter(function (item) { return item.id === parts[1]; })[0];
    if (!option) return;
    option.delayed = (option.delayed || []).concat(DELAYS[key]);
  });

  /* 摩擦事件也要有推演属性：它们是这场战役里最容易在推演室里被追溯的那一类问题。 */
  const FRICTION_REPLAY = {
    dyn_friction_report_delay: 'capital',
    dyn_friction_road_blocked: 'bridges',
    dyn_friction_stock_mismatch: 'aid',
    dyn_friction_comms: 'signal'
  };
  Object.keys(FRICTION_REPLAY).forEach(function (id) {
    const template = byIdMap[id];
    if (template && !template.replay) template.replay = FRICTION_REPLAY[id];
  });

  /* 没有后续事件的模板统一成空数组，界面与测试都不用再猜字段是否存在。 */
  TEMPLATES.forEach(function (template) {
    if (template.follow === undefined || template.follow === null) template.follow = [];
    (template.options || []).forEach(function (option) {
      if (!Array.isArray(option.delayed)) option.delayed = [];
    });
  });

  function byId(id) { return byIdMap[id] || null; }

  function eligibleAt(state, round) {
    return TEMPLATES.filter(function (template) {
      if (round < template.window[0] || round > template.window[1]) return false;
      return conditionMet(state, template.when);
    });
  }

  /*
   * 为一个窗口挑选动态事件。
   * 排序依据是「种子 + 窗口 + 事件 id」的稳定散列，所以同种子同决策必然得到同一集合。
   * 每个窗口最多 maxEvents 条；摩擦层单独限 1 条，避免刷屏。
   */
  function roll(state, windowId) {
    if (!state || !state.campaign) return [];
    const round = windowId || state.round || 1;
    const seed = state.campaign.seed || 0;
    const dyn = state.campaign.dyn || { fired: {}, log: [] };
    const fired = dyn.fired || {};
    const candidates = eligibleAt(state, round).filter(function (template) {
      return !fired[template.id];
    }).map(function (template) {
      return { template: template, score: hashString(seed + ':' + round + ':' + template.id) };
    }).sort(function (a, b) {
      if (a.score !== b.score) return a.score - b.score;
      return a.template.id < b.template.id ? -1 : 1;
    });
    const chosen = [];
    const regular = [];
    const frictionPool = [];
    candidates.forEach(function (entry) {
      if (entry.template.layer === 'friction') frictionPool.push(entry);
      else regular.push(entry);
    });
    regular.forEach(function (entry) {
      if (chosen.length >= 2) return;
      chosen.push(entry.template);
    });
    /*
     * 摩擦层占一个独立的名额，但要先过一道「这个窗口本来就太平」的闸门：
     * 只有约三分之一的窗口会给摩擦事件留位置，再加上模板自身的发生概率，
     * 一局大约出现两三次。它的效果都很小，不会决定战役走向。
     */
    if (frictionPool.length && chosen.length < 3) {
      const gateOpen = (hashString(seed + ':' + round + ':friction-slot') % 1000) < 350;
      if (gateOpen) chosen.push(frictionPool[0].template);
    }
    return chosen;
  }

  /* 把模板变成一条可以直接交给引擎的事务。 */
  function build(state, template) {
    const options = (template.options || []).map(function (option) {
      return {
        id: option.id,
        label: option.label,
        ap: option.ap || 0,
        effects: Object.assign({}, option.effects || {}),
        coordination: option.coordination || 0,
        agencyId: option.agency || template.agency || null,
        setFlags: (option.setFlags || []).slice(),
        delayed: (option.delayed || []).slice()
      };
    });
    return {
      dynId: template.id,
      layer: template.layer,
      kicker: template.kicker || (LAYERS[template.layer] ? LAYERS[template.layer].split(' · ')[0] : '动态事件'),
      title: template.title,
      body: template.info,
      source: template.source,
      agencyId: template.agency || 'office',
      history: template.history,
      historyLabel: HISTORY_KINDS[template.history] || '',
      historyNote: template.historyNote || '',
      replay: template.replay || null,
      needAction: !!template.needAction,
      options: options,
      defaultOption: options.length ? options[options.length - 1].id : null
    };
  }

  /* 记录一次触发（写进存档，用于复现与「战役探索记录」）。 */
  function record(state, template, round) {
    if (!state || !state.campaign) return null;
    if (!state.campaign.dyn) state.campaign.dyn = { fired: {}, log: [] };
    const dyn = state.campaign.dyn;
    dyn.fired[template.id] = round;
    const entry = {
      id: template.id,
      round: round,
      layer: template.layer,
      title: template.title,
      history: template.history,
      replay: template.replay || null
    };
    dyn.log.push(entry);
    dyn.log = dyn.log.slice(-80);
    return entry;
  }

  function summary(state) {
    const dyn = state && state.campaign && state.campaign.dyn;
    const fired = dyn && dyn.fired ? dyn.fired : {};
    const ids = Object.keys(fired);
    const byLayer = { condition: 0, state: 0, friction: 0 };
    const byReplay = {};
    ids.forEach(function (id) {
      const template = byId(id);
      if (!template) return;
      if (byLayer[template.layer] !== undefined) byLayer[template.layer] += 1;
      if (template.replay) byReplay[template.replay] = (byReplay[template.replay] || 0) + 1;
    });
    return {
      total: ids.length,
      fired: ids.map(function (id) { const template = byId(id); return template ? { id: id, round: fired[id], title: template.title, layer: template.layer, replay: template.replay || null } : null; }).filter(Boolean),
      byLayer: byLayer,
      byReplay: byReplay,
      remaining: Math.max(0, TEMPLATES.length - ids.length)
    };
  }

  /* 未探索路线提示：只说「这条路线的相关事件是否经历过」，不预告结果。 */
  function branchHints(state) {
    const dyn = state && state.campaign && state.campaign.dyn;
    const fired = dyn && dyn.fired ? dyn.fired : {};
    const groups = {
      airfield: ['dyn_runway_transport', 'dyn_airfield_ground_push', 'dyn_airfield_kept_pressure', 'dyn_airfield_late_damage', 'dyn_airfield_counter_cost', 'dyn_airfield_interdict_result'],
      capital: ['dyn_capital_crowding', 'dyn_capital_single_point', 'dyn_capital_relocate_gap', 'dyn_capital_split_conflict', 'dyn_capital_authority_drift', 'dyn_state_office_backlog'],
      bridges: ['dyn_bridge_evacuation', 'dyn_bridge_engineer', 'dyn_bridge_flood_cost', 'dyn_bridge_keep_risk'],
      reserve: ['dyn_reserve_moshchun_attrition', 'dyn_reserve_brovary_follow', 'dyn_reserve_split_dispute', 'dyn_reserve_hold_risk', 'dyn_state_staff_clash'],
      aid: ['dyn_aid_silence', 'dyn_aid_conditions', 'dyn_aid_transport_delay', 'dyn_aid_allocation', 'dyn_state_logistics_jam', 'dyn_state_aid_pending'],
      signal: ['dyn_signal_contradiction', 'dyn_signal_public_expectation', 'dyn_signal_pursue_cost'],
      return: ['dyn_signal_pursue_cost', 'dyn_return_fast_risk', 'dyn_return_staged_slow']
    };
    return Object.keys(groups).map(function (key) {
      const list = groups[key];
      const seen = list.filter(function (id) { return !!fired[id]; }).length;
      return {
        node: key,
        label: REPLAY_NODES[key] || key,
        seen: seen,
        total: list.length,
        state: seen === 0 ? 'unexplored' : (seen >= list.length ? 'explored' : 'partial')
      };
    });
  }

  root.LZS_DYNAMIC = {
    version: VERSION,
    layers: LAYERS,
    historyKinds: HISTORY_KINDS,
    replayNodes: REPLAY_NODES,
    templates: TEMPLATES,
    count: TEMPLATES.length,
    byId: byId,
    hashString: hashString,
    rng: rng,
    makeSeed: makeSeed,
    conditionMet: conditionMet,
    eligibleAt: eligibleAt,
    roll: roll,
    build: build,
    record: record,
    summary: summary,
    branchHints: branchHints
  };
})(typeof window !== 'undefined' ? window : globalThis);
