/* 小泽模拟器 v1.1.1 · 基辅战役（2022-02-24 至 2022-04-02）
   全部数值、命令、机构反馈都是模拟设计值，不是历史统计，也不是真实命令。
   游玩期文本只写当时可合理获得的信息；事后研究只在战役结束后的复盘中出现。 */
(function (root) {
  'use strict';

  const ACTS = [
    { id: 1, title: '第一幕 · 最初的 72 小时', range: '2 月 24 日 — 2 月 26 日', tone: 'shock', music: 'day', weight: 0.5, relief: 0,
      note: '信息大量涌入，多个方向同时告急。总统要先弄清自己能直接决定什么、只能授权什么。' },
    { id: 2, title: '第二幕 · 阻滞与组织防御', range: '2 月 27 日 — 3 月 5 日', tone: 'organize', music: 'day', weight: 0.22, relief: 0.3,
      note: '敌方向首都外围推进。此前的命令开始产生持续影响，道路、桥梁和后勤成为主题。' },
    { id: 3, title: '第三幕 · 消耗与关键防线', range: '3 月 6 日 — 3 月 21 日', tone: 'attrition', music: 'night', weight: 0.12, relief: 0.8,
      note: '前线不会每天发生决定性变化。弹药、轮换、机构疲劳和预备队分配决定一周后的局面。' },
    { id: 4, title: '第四幕 · 攻势受阻与撤退判断', range: '3 月 22 日 — 4 月 2 日', tone: 'uncertain', music: 'night', weight: 0.08, relief: 1.8,
      note: '对方的行动在变化，但变化的含义并不清楚。重新进入失地前，安全确认和判断同样重要。' }
  ];

  /* day = 自 2/24 起第几天（1–38）；days = 本窗口结束后内部逐日模拟的天数（合计 38）。
     ap = 本决策窗口的总统注意力上限（按窗口刷新，不跨窗口储存）。 */
  const EVENTS = [
    {
      id: 'c1', act: 1, day: 1, days: 0.5, ap: 4, interruptible: false,
      date: '2022-02-24', dateLabel: '2 月 24 日 · 凌晨', time: '凌晨', span: '数小时',
      title: '全面入侵开始', kicker: '紧急简报 · 01',
      intel: { level: '低', tone: '多源、矛盾', note: '多地同时报告导弹打击和越境，具体方向和规模仍在核对。' },
      pressureRise: 14,
      situation: [
        '凌晨起多地报告导弹和空袭，北部、东部和南部都出现越境报告。',
        '总统办公室需要在信息不完整的情况下，先确定国家机器如何进入战时状态。'
      ],
      known: ['多个方向同时遭到打击。', '首都周边的机场和军事设施在打击报告中反复出现。'],
      unknown: ['对方的主攻方向。', '首都周边会不会出现空降或机降行动。'],
      choices: [
        { id: 'c_martial', title: '宣布战时状态并启动总动员程序', ap: 2, agency: 'office',
          summary: '让国家机器在法律上进入战时轨道。', staff: '议会与地方政府需要同步执行，节奏会很紧。',
          effects: { gov: 5, will: 4, reserve: -3, pressure: -2 }, flags: ['c_martial'],
          delayed: [{ delay: 2, label: '动员程序挤压装备与登记', note: '大量报到人员需要装备、编组和登记。', effects: { reserve: -3, army: 2 } }] },
        { id: 'c_command_line', title: '建立总统与总参谋部的直接联络', ap: 1, agency: 'general_staff',
          summary: '缩短政治决定到军方执行的距离。', staff: '军方仍按指挥链执行，总统不直接指挥部队。',
          effects: { gov: 2, army: 3 }, flags: ['c_command_line'] },
        { id: 'c_first_appeal', title: '向主要伙伴发出首轮紧急请求', ap: 1, agency: 'foreign',
          summary: '把需求尽早送到伙伴桌面。', staff: '首轮请求不会立刻改变前线。',
          effects: { intl: 4 }, flags: ['c_first_appeal'],
          aid: 'appeal' },
        { id: 'c_disperse', title: '授权分散防空与航空力量', ap: 1, agency: 'general_staff',
          summary: '减少首轮打击造成的集中损失。', staff: '分散会让后续协调更复杂。',
          effects: { army: 3, reserve: -2, pressure: -1 }, flags: ['c_disperse'] }
      ]
    },
    {
      id: 'c2', act: 1, day: 1, days: 0.5, ap: 5, interruptible: false, key: true,
      date: '2022-02-24', dateLabel: '2 月 24 日 · 上午至夜间', time: '上午', span: '数小时',
      title: '安东诺夫机场', kicker: '重大决策 · 机场方向',
      intel: { level: '低', tone: '现场混乱', note: '直升机机群出现在首都西北方向，机场现场报告互相矛盾。' },
      pressureRise: 10,
      situation: [
        '首都西北的安东诺夫机场（霍斯托梅尔）方向报告大批直升机和空降人员。',
        '机场跑道能接收大型运输机。如果对方稳定控制机场，可能建立一条直接通向首都外围的空中运输通道。',
        '附近的己方力量有限。总统不能指挥现场战斗，但可以决定授权什么、优先保什么、放弃什么。'
      ],
      known: ['机场附近出现空降突击。', '机场跑道对大型运输机有价值，对双方都是如此。', '附近可用的己方力量有限。'],
      unknown: ['对方后续运输机队的规模和时间。', '现场守军能坚持多久。', '对方地面部队何时能到达机场。'],
      choices: [
        { id: 'c_deny_runway', title: '授权拒止：优先破坏跑道使用条件', ap: 2, agency: 'general_staff', exclusiveGroup: 'airfield',
          summary: '主动牺牲自己的机场，阻止对方把它变成运输通道。', staff: '工程与火力需要在现场混乱中落实，失败或延误都有可能。',
          effects: { kyiv: 4, army: -2, reserve: -3, pressure: -4 }, flags: ['c_runway_denied', 'c_airfield_lost'],
          delayed: [{ delay: 2, label: '机场失去对己方的价值', note: '机场及相关设施受损，后续调度只能依靠地面运输。', effects: { reserve: -2 } }],
          keyDecision: { node: 'airfield', purpose: '阻止对方按设想建立空中运输通道，迫使其依赖地面推进。',
            cost: '己方同样失去机场；设施损毁；地面运输和调度压力增加。', unknown: '破坏能否及时完成；对方会如何调整。', irreversible: '跑道一旦破坏，本战役内不能再使用。' } },
        { id: 'c_keep_airfield', title: '保留机场设施，集中封锁外围', ap: 1, agency: 'general_staff', exclusiveGroup: 'airfield',
          summary: '保留未来可能的使用价值，把力量放在外围道路。', staff: '如果对方稳定控制机场，空中运输的风险会持续存在。',
          effects: { reserve: 2, army: 1 }, flags: ['c_airfield_kept'],
          delayed: [{ delay: 3, when: { none: ['c_runway_denied', 'c_transport_cut'] }, label: '机场方向的空中运输风险', note: '机场仍可使用，对方可能在机场附近持续集结。', effects: { kyiv: -6, pressure: 7 } }],
          keyDecision: { node: 'airfield', purpose: '保住机场设施和未来使用价值。',
            cost: '机场可能被对方利用；风险会在随后几天持续存在。', unknown: '对方能否稳定控制机场并组织运输。', irreversible: '可在下一窗口改为拒止，但时间更晚、代价更高。' } },
        { id: 'c_counter_airfield', title: '组织反击，争夺机场控制权', ap: 2, agency: 'general_staff', exclusiveGroup: 'airfield',
          summary: '用有限的机动力量争夺机场，打乱对方的第一阶段行动。', staff: '反击力量有限，未必能长期守住机场。',
          effects: { army: -4, will: 4, kyiv: 2, pressure: -3 }, flags: ['c_airfield_contested'],
          delayed: [{ delay: 1, label: '反击力量难以长期守住机场', note: '军方报告：守住机场需要更多兵力，需要决定是否撤出并进一步破坏跑道。', effects: { army: -2 } }],
          keyDecision: { node: 'airfield', purpose: '打乱对方空降行动的节奏，争取机场控制权。',
            cost: '有限的机动力量被消耗；守不住时要另作决定。', unknown: '对方地面部队到达的时间；反击能维持多久。', irreversible: '投入的兵力和伤亡无法撤回。' } },
        { id: 'c_interdict', title: '放弃长期守机场，集中拦截后续运输', ap: 2, agency: 'general_staff', exclusiveGroup: 'airfield',
          summary: '不在机场本身投入更多兵力，把防空和火力用在可能的后续机队上。', staff: '拦截依赖情报和时机，未必能覆盖所有方向。',
          effects: { army: -2, reserve: -2, kyiv: 2, pressure: -2 }, flags: ['c_transport_cut', 'c_airfield_lost'],
          delayed: [{ delay: 2, when: { none: ['c_runway_denied'] }, label: '机场落入对方控制', note: '机场本身没有被破坏，对方开始利用机场区域集结。', effects: { kyiv: -3, pressure: 3 } }],
          keyDecision: { node: 'airfield', purpose: '承认守不住机场，转而阻止后续运输。',
            cost: '机场区域落入对方控制；防空与火力被集中使用。', unknown: '对方后续运输计划；拦截是否及时。', irreversible: '机场方向的地面控制权被放弃。' } },
        { id: 'c_airfield_reports', title: '要求机场方向每四小时报告一次', ap: 1, agency: 'general_staff',
          summary: '先建立可追踪的信息节奏。', staff: '报告越频繁，现场负担越重。',
          effects: { gov: 1, army: -1 }, flags: ['c_airfield_tracked'] }
      ]
    },
    {
      id: 'c3', act: 1, day: 2, days: 1, ap: 4, interruptible: true, key: true,
      date: '2022-02-25', dateLabel: '2 月 25 日', time: '全天', span: '1 天',
      title: '首都与政府连续性', kicker: '重大决策 · 政府在哪里',
      intel: { level: '中', tone: '部分可核实', note: '有报告称首都可能出现针对政府的行动，具体对象和时间不明。' },
      pressureRise: 8,
      situation: [
        '首都北面和西北面压力上升。总统办公室收到多份关于政府安全的报告。',
        '总统的位置不仅是安全问题，也决定国家机器的指挥中心在哪里、谁能够签字、外界怎样理解局势。'
      ],
      known: ['首都外围出现战斗。', '有关于针对政府行动的报告。'],
      unknown: ['报告中的行动是否已经在首都内部展开。', '首都外围防线能否稳定。'],
      choices: [
        { id: 'c_stay_capital', title: '总统与核心团队留在首都', ap: 2, agency: 'office', exclusiveGroup: 'capital',
          summary: '让指挥中心和政治象征都留在首都。', staff: '个人安全风险增加，安保需要持续投入。',
          effects: { gov: 6, will: 6, intl: 3, safety: -8 }, flags: ['c_stayed'],
          keyDecision: { node: 'capital', purpose: '保持国家指挥中心和政治连续性在首都。',
            cost: '总统和核心团队承担更高的安全风险。', unknown: '首都内部安全状况；首都外围能否稳住。', irreversible: '一旦公开表态，后续改变位置会被视为重大信号。' } },
        { id: 'c_split_succession', title: '留在首都，同时建立异地备用指挥', ap: 2, agency: 'office', exclusiveGroup: 'capital',
          summary: '在首都保持存在，同时让部分职能在异地待命。', staff: '两套指挥体系会增加协调成本。',
          effects: { gov: 4, will: 3, safety: -4, reserve: -2 }, flags: ['c_stayed', 'c_succession'],
          keyDecision: { node: 'capital', purpose: '既保持首都存在，又降低单点瘫痪风险。',
            cost: '指挥分散带来协调和资源成本。', unknown: '备用指挥能否在需要时顺利接替。', irreversible: '备用体系的人员和资源已被抽调。' } },
        { id: 'c_relocate', title: '将核心指挥转移到西部', ap: 2, agency: 'office', exclusiveGroup: 'capital',
          summary: '优先保证总统和核心团队的安全。', staff: '首都和外界都可能把这理解为局势恶化的信号。',
          effects: { safety: 12, gov: -2, will: -8, intl: -3, kyiv: -3 }, flags: ['c_relocated'],
          keyDecision: { node: 'capital', purpose: '优先保护国家最高指挥的安全。',
            cost: '首都和社会的信心下降；国际观感变化。', unknown: '转移后首都防务能否保持组织。', irreversible: '转移在本战役内无法完全抵消其信号意义。' } },
        { id: 'c_late_deny', title: '机场方向：撤出并进一步破坏跑道', ap: 2, agency: 'general_staff',
          requires: { any: ['c_airfield_contested', 'c_airfield_kept'] }, requireNote: '只有在机场仍被争夺或被保留时才有这个选项。',
          summary: '机场守不住时，补上拒止，避免对方利用。', staff: '比第一时间破坏更晚，执行更难。',
          effects: { kyiv: 3, army: -2, reserve: -2, pressure: -3 }, flags: ['c_runway_denied', 'c_airfield_lost'],
          keyDecision: { node: 'airfield', purpose: '在机场无法长期守住时补上拒止。', cost: '机场与设施受损；执行更晚、风险更高。', unknown: '对方是否已经开始利用机场。', irreversible: '跑道破坏后本战役内不能再用。' } },
        { id: 'c_address_nation', title: '发表公开讲话，说明政府仍在运作', ap: 1, agency: 'communications',
          summary: '降低恐慌和谣言。', staff: '讲话本身不能改变前线。',
          effects: { will: 4, intl: 2, safety: -1 } }
      ]
    },
    {
      id: 'c4', act: 1, day: 3, days: 1, ap: 4, interruptible: true,
      date: '2022-02-26', dateLabel: '2 月 26 日', time: '全天', span: '1 天',
      title: '首都内部安全', kicker: '简报 · 首都',
      intel: { level: '低', tone: '谣言多', note: '首都内部出现大量关于破坏小组的报告，其中很多无法核实。' },
      pressureRise: 6,
      situation: [
        '首都内部出现关于破坏活动和可疑标记的报告，谣言比可核实的信息传播得更快。',
        '领土防卫报到的人数超过可用装备，城市内部秩序需要同时兼顾安全和信任。'
      ],
      known: ['首都外围仍有战斗。', '城市内部的报告大量增加。'],
      unknown: ['哪些报告属实。', '城市内部是否存在有组织的破坏行动。'],
      choices: [
        { id: 'c_curfew', title: '实施长时间宵禁并开展清查', ap: 2, agency: 'interior',
          summary: '在一段时间内让街道只留下安全力量。', staff: '民众生活和物资流通会受到影响。',
          effects: { safety: 6, kyiv: 4, will: -3, reserve: -2 }, flags: ['c_curfew'] },
        { id: 'c_arm_volunteers', title: '向领土防卫志愿者分发武器', ap: 2, agency: 'interior',
          summary: '迅速扩大城市防御的人数。', staff: '登记、训练和管控都会跟不上。',
          effects: { kyiv: 5, will: 5, safety: -3, gov: -2 }, flags: ['c_armed_citizens'],
          delayed: [{ delay: 3, when: { none: ['c_counterintel'] }, label: '分发武器后的管控问题', note: '部分武器去向和人员登记不清，城市内部安全压力上升。', effects: { safety: -4, gov: -2 } }] },
        { id: 'c_counterintel', title: '授权安全部门开展反破坏行动', ap: 1, agency: 'interior',
          summary: '集中处理可核实的线索。', staff: '可核实线索有限，效果取决于情报。',
          effects: { safety: 3, gov: 2 }, flags: ['c_counterintel'] },
        { id: 'c_rumor_rules', title: '统一官方信息发布，减少谣言', ap: 1, agency: 'communications',
          summary: '让城市知道哪些信息来自官方。', staff: '信息发布会更慢，部分人会不满。',
          effects: { will: 3, gov: 1, intl: -1 } }
      ]
    },
    {
      id: 'c5', act: 2, day: 4, days: 3, ap: 5, interruptible: true, key: true,
      date: '2022-02-27', dateLabel: '2 月 27 日 — 3 月 1 日', time: '三天', span: '3 天',
      title: '伊尔平河与桥梁', kicker: '重大决策 · 西北通道',
      intel: { level: '中', tone: '前线报告', note: '对方地面部队向首都西北的伊尔平河方向推进，桥梁成为焦点。' },
      pressureRise: 10,
      situation: [
        '首都西北的伊尔平河是地面推进必须跨越的一道障碍。河上的桥梁同时是平民撤离和己方调动的通道。',
        '破坏桥梁可以减缓对方，但也会切断己方和平民的道路。河谷的部分区域可以通过放水制造障碍，代价同样明显。'
      ],
      known: ['对方地面部队正在接近伊尔平河一线。', '桥梁仍有平民通行。'],
      unknown: ['对方在哪个位置尝试渡河。', '平民撤离还需要多少时间。'],
      choices: [
        { id: 'c_blow_bridges', title: '授权破坏伊尔平河主要桥梁', ap: 2, agency: 'general_staff',
          summary: '用失去道路换取时间。', staff: '平民撤离会变得更难，己方反击也会失去通道。',
          effects: { kyiv: 6, army: 2, reserve: -2, will: -3 }, flags: ['c_bridges_blown'],
          keyDecision: { node: 'bridges', purpose: '增加对方地面推进渡河的难度。', cost: '平民撤离通道减少；己方未来反击失去道路。', unknown: '对方会不会另寻渡口。', irreversible: '桥梁在本战役内无法恢复。' } },
        { id: 'c_keep_bridges', title: '保留桥梁，集中守住渡口', ap: 2, agency: 'general_staff',
          summary: '保住撤离和反击通道。', staff: '守桥需要持续投入兵力。',
          effects: { will: 3, intl: 1, army: -3 }, flags: ['c_bridges_kept'],
          delayed: [{ delay: 2, when: { none: ['c_flooded', 'c_bridges_blown'] }, label: '对方利用桥梁推进', note: '对方部队靠近桥梁，首都西北的防御压力明显上升。', effects: { kyiv: -7, pressure: 6 } }] },
        { id: 'c_flood_valley', title: '授权在伊尔平河谷制造水障', ap: 2, agency: 'interior',
          summary: '用河谷的水位变化阻碍渡河。', staff: '附近村庄和己方行动同样会受到影响。',
          effects: { kyiv: 4, reserve: -2, will: -2 }, flags: ['c_flooded'],
          delayed: [{ delay: 3, label: '水障影响附近村庄', note: '被淹区域的居民需要安置，己方在河谷的行动也变慢。', effects: { will: -2, reserve: -1 } }],
          keyDecision: { node: 'flood', purpose: '用地形障碍增加渡河难度。', cost: '附近居民和己方行动都受影响。', unknown: '水障能维持多久；对方是否改走其他方向。', irreversible: '被淹区域短期内无法恢复。' } },
        { id: 'c_form_reserve', title: '在首都周边组建预备队', ap: 1, agency: 'general_staff',
          summary: '为下一阶段保留可以调动的力量。', staff: '预备队来自现有资源，前线会更紧。',
          effects: { army: 3, kyiv: -2, reserve: -1 }, flags: ['c_reserve_formed'] }
      ]
    },
    {
      id: 'c6', act: 2, day: 7, days: 2, ap: 4, interruptible: true,
      date: '2022-03-02', dateLabel: '3 月 2 日 — 3 月 3 日', time: '两天', span: '2 天',
      title: '北面车队与切尔尼戈夫', kicker: '简报 · 北方方向',
      intel: { level: '中', tone: '卫星与公开影像', note: '公开影像显示首都西北方向有很长的车队，北部的切尔尼戈夫方向同样承压。' },
      pressureRise: 6,
      situation: [
        '公开影像显示，首都西北方向的道路上有很长的车队移动缓慢。',
        '北部的切尔尼戈夫方向承受持续压力，那里的道路同样通向首都。'
      ],
      known: ['西北方向车队规模很大、移动缓慢。', '切尔尼戈夫方向承压。'],
      unknown: ['车队为什么移动缓慢。', '对方会把多少力量投向首都方向。'],
      choices: [
        { id: 'c_harass_convoy', title: '授权对车队补给线进行袭扰', ap: 2, agency: 'general_staff',
          summary: '针对补给和道路，而不是正面拦截。', staff: '袭扰力量有限，也会有损失。',
          effects: { army: -2, kyiv: 3, pressure: -3 }, flags: ['c_convoy_harassed'],
          delayed: [{ delay: 2, label: '车队补给困难持续', note: '车队方向的补给和道路问题持续存在（模拟推演）。', effects: { pressure: -2 } }] },
        { id: 'c_chernihiv', title: '增援切尔尼戈夫方向', ap: 2, agency: 'general_staff',
          summary: '守住北部道路，牵制对方力量。', staff: '首都周边的力量会更少。',
          effects: { army: -3, gov: 2, kyiv: -2 }, flags: ['c_chernihiv_reinforced'],
          delayed: [{ delay: 3, label: '北部方向牵制对方力量', note: '北部方向持续抵抗，首都方向的压力有所分散（模拟推演）。', effects: { kyiv: 3, pressure: -3 } }] },
        { id: 'c_logistics_hub', title: '统一铁路与公路物流调度', ap: 1, agency: 'logistics',
          summary: '在没有机场的情况下，地面运输更重要。', staff: '统一调度需要多个部门配合。',
          effects: { reserve: 4, gov: 1 }, flags: ['c_logistics_hub'],
          modifiers: [{ when: { all: ['c_airfield_lost'] }, effects: { reserve: 2 }, note: '机场已失去作用，地面物流调度的价值更高。' }] },
        { id: 'c_release_stocks', title: '动用国家储备物资', ap: 1, agency: 'logistics',
          summary: '立刻缓解首都和前线的物资紧张。', staff: '储备用掉以后，后期补充更难。',
          effects: { reserve: 5, will: 2 }, flags: ['c_stocks_released'],
          delayed: [{ delay: 4, label: '储备补充压力', note: '动用的储备需要补充，后期物资会更紧。', effects: { reserve: -5 } }] }
      ]
    },    {
      id: 'c7', act: 2, day: 9, days: 2, ap: 4, interruptible: true,
      date: '2022-03-04', dateLabel: '3 月 4 日 — 3 月 5 日', time: '两天', span: '2 天',
      title: '布恰—伊尔平：撤离与城市防御', kicker: '简报 · 西北城镇',
      intel: { level: '中', tone: '地方报告', note: '西北城镇的地方政府报告平民被困、通讯中断，部分区域无法联系。' },
      pressureRise: 6,
      situation: [
        '布恰、伊尔平及周边城镇夹在交战双方之间，平民撤离和城市防御都要用资源。',
        '部分区域已经失去联系。地方报告零散，无法确认城镇内部情况。'
      ],
      known: ['平民仍在撤离。', '部分区域通讯中断。'],
      unknown: ['被隔断区域内部的情况。', '撤离通道能维持多久。'],
      choices: [
        { id: 'c_evacuate', title: '组织平民撤离通道', ap: 2, agency: 'interior',
          summary: '尽量把平民带出交战区域。', staff: '撤离需要车辆、燃料和安全力量。',
          effects: { will: 4, intl: 3, reserve: -3, army: -1 }, flags: ['c_evacuated'],
          modifiers: [{ when: { all: ['c_bridges_blown'] }, effects: { will: -2, reserve: -1 }, note: '桥梁已被破坏，撤离只能绕行或步行，效率下降。' }] },
        { id: 'c_fortify_city', title: '在首都西北构筑城市防御', ap: 2, agency: 'general_staff',
          summary: '让首都本身具备巷战防御能力。', staff: '工事会消耗物资，也影响城市生活。',
          effects: { kyiv: 6, reserve: -3, will: -1 }, flags: ['c_city_fortified'] },
        { id: 'c_info_rules', title: '统一战时信息规则，减少暴露阵地', ap: 1, agency: 'communications',
          summary: '减少公开影像暴露阵地和行动。', staff: '公众会觉得信息变少。',
          effects: { safety: 2, army: 1, will: -1 } },
        { id: 'c_wishlist', title: '向伙伴提交具体装备清单', ap: 1, agency: 'foreign',
          summary: '把“请求支持”变成可以执行的清单。', staff: '清单进入伙伴议程需要时间。',
          effects: { intl: 2 }, flags: ['c_wishlist'],
          aid: 'equipment' }
      ]
    },
    {
      id: 'c8', act: 3, day: 11, days: 4, ap: 3, interruptible: true,
      date: '2022-03-06', dateLabel: '3 月 6 日 — 3 月 9 日', time: '四天', span: '4 天',
      title: '消耗：轮换、弹药与政府疲劳', kicker: '周报 · 消耗',
      intel: { level: '中', tone: '机构报告', note: '各机构报告人员连续工作，弹药和燃料消耗明显上升。' },
      pressureRise: 6,
      situation: [
        '前线没有每天发生决定性变化，但每天都在消耗人员、弹药和燃料。',
        '政府和地方机构已高强度运转近两周，疲劳开始影响执行质量。'
      ],
      known: ['弹药和燃料消耗上升。', '部分单位长时间没有轮换。'],
      unknown: ['补给能否跟上下一阶段的消耗。', '对方是否在准备新的攻势。'],
      choices: [
        { id: 'c_rotation', title: '批准前线轮换计划', ap: 1, agency: 'general_staff',
          summary: '让长时间作战的单位休整。', staff: '轮换期间前线会更薄。',
          effects: { kyiv: -3, army: 1 }, flags: ['c_rotation'],
          delayed: [{ delay: 2, label: '轮换单位恢复战斗力', note: '休整单位重新回到前线。', effects: { army: 5 } }] },
        { id: 'c_ammo_ration', title: '实行弹药配给与优先级', ap: 1, agency: 'logistics',
          summary: '把有限的弹药留给最关键的方向。', staff: '次要方向会感到受限。',
          effects: { reserve: 4, army: -2 }, flags: ['c_ammo_rationed'] },
        { id: 'c_decentralize', title: '授权地方军政机关在框架内自主处理', ap: 1, agency: 'office',
          summary: '不必每件事都等首都批准。', staff: '各地做法可能不一致。',
          effects: { gov: -2, will: 2, reserve: 1 }, flags: ['c_decentralized'],
          delayed: [{ delay: 2, label: '地方自主处理减轻中央负担', note: '地方机关在授权框架内处理日常事务。', effects: { gov: 3 } }] },
        { id: 'c_honest_briefing', title: '每日公开简报，承认困难', ap: 1, agency: 'communications',
          summary: '用可信的信息维持社会信任。', staff: '公开困难也会给对方提供信息。',
          effects: { will: 3, intl: 2, safety: -1 } }
      ]
    },
    {
      id: 'c9', act: 3, day: 15, days: 4, ap: 5, interruptible: true, key: true,
      date: '2022-03-10', dateLabel: '3 月 10 日 — 3 月 13 日', time: '四天', span: '4 天',
      title: '莫什春与布罗瓦雷：预备队给谁', kicker: '重大决策 · 预备队',
      intel: { level: '低', tone: '两个方向同时告急', note: '西北莫什春方向和东侧布罗瓦雷方向都报告对方在集结，两份报告都要求预备队。' },
      pressureRise: 8,
      situation: [
        '首都西北莫什春附近报告对方试图越过伊尔平河；首都东侧布罗瓦雷方向报告装甲纵队接近。',
        '可调动的预备队只够明显加强一个方向。集中力量保一个方向，另一个方向就要承受更大风险。'
      ],
      known: ['两个方向都报告压力上升。', '预备队数量有限。'],
      unknown: ['哪个方向是对方的主要努力。', '另一个方向能独自坚持多久。'],
      choices: [
        { id: 'c_reserve_moshchun', title: '预备队投向莫什春—伊尔平河', ap: 2, agency: 'general_staff', exclusiveGroup: 'reserve',
          summary: '优先守住西北河线。', staff: '东侧会更薄。',
          effects: { kyiv: 5, army: -3 }, flags: ['c_reserve_west'],
          delayed: [{ delay: 1, when: { none: ['c_brovary_ambush', 'c_chernihiv_reinforced'] }, label: '东侧压力上升', note: '布罗瓦雷方向缺少预备队；若此前没有加强北面切尔尼戈夫方向，东侧防御更紧。', effects: { kyiv: -5, pressure: 4 } }],
          keyDecision: { node: 'reserve', purpose: '守住西北河线，阻止对方越过伊尔平河。', cost: '东侧缺少预备队。', unknown: '东侧是否才是对方的主要努力。', irreversible: '预备队投入后数周内无法撤回。' } },
        { id: 'c_reserve_brovary', title: '预备队投向布罗瓦雷与东侧', ap: 2, agency: 'general_staff', exclusiveGroup: 'reserve',
          summary: '优先守住首都东侧。', staff: '西北河线会更薄。',
          effects: { kyiv: 4, army: -3 }, flags: ['c_reserve_east'],
          delayed: [{ delay: 1, when: { none: ['c_flooded', 'c_bridges_blown'] }, label: '西北河线压力上升', note: '莫什春方向缺少预备队，又没有足够的河线障碍。', effects: { kyiv: -8, pressure: 6 } }],
          keyDecision: { node: 'reserve', purpose: '守住首都东侧，阻止装甲纵队接近城区。', cost: '西北河线缺少预备队。', unknown: '西北河线能否靠此前设置的障碍坚持。', irreversible: '预备队投入后数周内无法撤回。' } },
        { id: 'c_reserve_split', title: '把预备队分成两部分', ap: 2, agency: 'general_staff', exclusiveGroup: 'reserve',
          summary: '两个方向各得一部分。', staff: '两边都只是部分加强。',
          effects: { kyiv: 3, army: -2, reserve: -2 }, flags: ['c_reserve_split'],
          delayed: [{ delay: 1, label: '两个方向都只得到部分加强', note: '两边都能坚持，但都没有余量。', effects: { kyiv: -2, army: -2 } }],
          keyDecision: { node: 'reserve', purpose: '避免把全部赌注压在一个方向。', cost: '两边都只是部分加强。', unknown: '部分加强是否足够。', irreversible: '预备队投入后数周内无法撤回。' } },
        { id: 'c_reserve_hold', title: '暂不投入预备队，留给后续', ap: 1, agency: 'general_staff', exclusiveGroup: 'reserve',
          summary: '承受当前压力，保留后续选择。', staff: '两个方向都要独自坚持。',
          effects: { army: 2 }, flags: ['c_reserve_held'],
          delayed: [{ delay: 1, label: '两个方向独自承受压力', note: '两个方向都没有得到加强。', effects: { kyiv: -6, pressure: 5 } }],
          keyDecision: { node: 'reserve', purpose: '保留预备队用于后续反击或应急。', cost: '眼下两个方向都更危险。', unknown: '两个方向能否独自坚持。', irreversible: '这段时间承受的风险无法事后弥补。' } },
        { id: 'c_brovary_ambush', title: '授权东侧以伏击和火力为主', ap: 1, agency: 'general_staff',
          summary: '东侧不依赖预备队，改用伏击和火力。', staff: '需要弹药和准备时间。',
          effects: { reserve: -3, army: -1, kyiv: 2 }, flags: ['c_brovary_ambush'] }
      ]
    },
    {
      id: 'c10', act: 3, day: 19, days: 8, ap: 4, interruptible: true,
      date: '2022-03-14', dateLabel: '3 月 14 日 — 3 月 21 日', time: '八天', span: '8 天',
      title: '长期围困：城市、外交与机构', kicker: '周报 · 持续',
      intel: { level: '中', tone: '持续报告', note: '首都周边战线变化不大，城市基础设施和机构运转的压力逐渐累积。' },
      pressureRise: 5,
      situation: [
        '这一周首都周边战线没有决定性变化，导弹和炮击持续损伤城市基础设施。',
        '对外渠道仍在运转。伙伴的援助在增加，但交付需要时间。'
      ],
      known: ['战线变化不大。', '基础设施损伤持续累积。'],
      unknown: ['对方是否在准备新的攻势。', '援助到位的节奏。'],
      choices: [
        { id: 'c_repair', title: '集中维修首都供电、供水与供暖', ap: 2, agency: 'logistics',
          summary: '让城市在长期压力下继续运转。', staff: '维修需要材料和人员。',
          effects: { will: 4, kyiv: 2, reserve: -4 }, flags: ['c_repaired'] },
        { id: 'c_talks_channel', title: '维持谈判渠道，不做领土承诺', ap: 1, agency: 'foreign',
          summary: '保留政治选项。', staff: '国内会有人质疑谈判本身。',
          effects: { intl: 3, will: -2 }, flags: ['c_talks_open'] },
        { id: 'c_air_defense_aid', title: '向伙伴争取防空与反装甲援助', ap: 1, agency: 'foreign',
          summary: '针对当前最紧的缺口。', staff: '交付需要时间。',
          effects: { intl: 2 }, flags: ['c_aid_requested'],
          aid: 'air_defense' },
        { id: 'c_civil_admin', title: '恢复首都民事管理与公共服务', ap: 1, agency: 'interior',
          summary: '让城市秩序从紧急状态转为可持续状态。', staff: '安全力量会被部分抽走。',
          effects: { gov: 3, will: 2, safety: -2 } },
        { id: 'c_staff_rest', title: '强制机构轮休', ap: 1, agency: 'office',
          summary: '减少长期疲劳造成的错误。', staff: '短期内处理速度变慢。',
          effects: { gov: 3, reserve: -1 } }
      ]
    },
    {
      id: 'c11', act: 4, day: 27, days: 7, ap: 4, interruptible: true,
      date: '2022-03-22', dateLabel: '3 月 22 日 — 3 月 28 日', time: '一周', span: '7 天',
      title: '马卡里夫与伊尔平：反击窗口', kicker: '简报 · 局部反击',
      intel: { level: '中', tone: '前线报告', note: '首都西面和西北出现局部反击机会，对方部分阵地补给困难。' },
      pressureRise: 2,
      situation: [
        '首都西面的马卡里夫方向和西北的伊尔平方向出现局部反击机会。',
        '反击需要兵力和弹药。投入反击，其他方向的余量就更少。'
      ],
      known: ['部分方向出现反击机会。', '对方部分阵地补给困难。'],
      unknown: ['对方的整体意图。', '反击后能否守住收复的地区。'],
      choices: [
        { id: 'c_counter_west', title: '支持西面和西北的局部反击', ap: 2, agency: 'general_staff',
          summary: '趁对方补给困难收复部分地区。', staff: '反击会消耗兵力和弹药。',
          effects: { kyiv: 5, army: -4, will: 3, pressure: -4 }, flags: ['c_counter_west'],
          modifiers: [
            { when: { all: ['c_reserve_held'] }, effects: { kyiv: 3, army: 2, pressure: -2 }, note: '此前保留的预备队可以投入反击。' },
            { when: { all: ['c_reserve_west'] }, effects: { army: -2 }, note: '预备队已在西北消耗，反击力量更紧。' }] },
        { id: 'c_counter_east', title: '支持东侧的有限反击', ap: 2, agency: 'general_staff',
          summary: '把对方从首都东侧推开。', staff: '东侧反击需要弹药。',
          effects: { kyiv: 3, army: -3, pressure: -3 }, flags: ['c_counter_east'] },
        { id: 'c_hold_lines', title: '维持现有防线，不主动反击', ap: 1, agency: 'general_staff',
          summary: '保存力量，不冒反击的风险。', staff: '对方会有更多时间调整。',
          effects: { army: 3, reserve: 2 }, flags: ['c_held_lines'] },
        { id: 'c_prepare_return', title: '准备收复地区的民事接管计划', ap: 1, agency: 'interior',
          summary: '提前准备排雷、物资和地方政府恢复。', staff: '需要提前抽调人员。',
          effects: { gov: 2, reserve: -1 }, flags: ['c_return_plan'] }
      ]
    },
    {
      id: 'c12', act: 4, day: 34, days: 2, ap: 5, interruptible: false, key: true,
      date: '2022-03-29', dateLabel: '3 月 29 日 — 3 月 30 日', time: '两天', span: '2 天',
      title: '撤退信号', kicker: '重大决策 · 信号是否可信',
      intel: { level: '低', tone: '对方声明与前线报告不一致', note: '对方公开表示将大幅减少首都和切尔尼戈夫方向的军事活动。部分前线报告看到车队移动，另一些报告仍有炮击。' },
      pressureRise: 0,
      situation: [
        '3 月 29 日，对方在谈判后公开表示将大幅减少首都和切尔尼戈夫方向的军事活动。',
        '公开报道中，外国官员态度谨慎，认为这可能是重新部署，不一定是撤退。',
        '前线报告不一致：有的方向看到车队后撤，有的方向仍有炮击。'
      ],
      known: ['对方发表了公开声明。', '部分方向出现车队移动。'],
      unknown: ['这是撤退、重新部署，还是争取时间。', '后撤的部队会去哪里。'],
      choices: [
        { id: 'c_trust_redeploy', title: '相信信号，提前向东调整兵力', ap: 2, agency: 'general_staff', exclusiveGroup: 'signal',
          summary: '如果对方真的撤退，可以提前准备下一阶段。', staff: '如果信号不可信，首都方向会变薄。',
          effects: { army: 4, reserve: 3, kyiv: -2 }, flags: ['c_trusted_signal'],
          keyDecision: { node: 'signal', purpose: '提前为下一阶段调整兵力。', cost: '首都方向力量减少。', unknown: '信号是否可信。', irreversible: '兵力调动后短期内难以调回。' } },
        { id: 'c_stay_alert', title: '保持戒备，等待实际证据', ap: 1, agency: 'general_staff', exclusiveGroup: 'signal',
          summary: '不根据声明调整部署。', staff: '会错过一部分提前准备的时间。',
          effects: { kyiv: 2, reserve: -1 }, flags: ['c_stayed_alert'],
          keyDecision: { node: 'signal', purpose: '不把对方的声明当成事实。', cost: '下一阶段的准备更晚。', unknown: '对方是否真的撤退。', irreversible: '错过的准备时间无法追回。' } },
        { id: 'c_pursue', title: '跟进后撤的对方部队', ap: 2, agency: 'general_staff', exclusiveGroup: 'signal',
          summary: '趁对方后撤尽量收复地区。', staff: '后撤区域可能有地雷和伏击。',
          effects: { kyiv: 4, army: -3, will: 2, reserve: -2 }, flags: ['c_pursued'],
          keyDecision: { node: 'signal', purpose: '尽快收复地区，扩大主动权。', cost: '跟进部队面临地雷和伏击风险。', unknown: '对方后撤是否有组织。', irreversible: '跟进中的损失无法撤回。' } },
        { id: 'c_verify_signal', title: '要求多来源交叉核实', ap: 1, agency: 'office',
          summary: '把对方声明、前线报告和伙伴情报放在一起判断。', staff: '核实需要时间。',
          effects: { gov: 2 }, flags: ['c_signal_verified'] },
        { id: 'c_cautious_message', title: '公开表态谨慎，不宣布胜利', ap: 1, agency: 'communications',
          summary: '避免社会过早松懈。', staff: '公众期待一个明确的好消息。',
          effects: { will: -1, intl: 2, safety: 1 } }
      ]
    },
    {
      id: 'c13', act: 4, day: 36, days: 3, ap: 5, interruptible: false, key: true,
      date: '2022-03-31', dateLabel: '3 月 31 日 — 4 月 2 日', time: '三天', span: '3 天',
      title: '重新进入与安全确认', kicker: '重大决策 · 收复地区',
      intel: { level: '中', tone: '地方报告', note: '对方离开部分城镇。重新进入的部队报告地雷、毁坏的建筑，以及需要立即调查的情况。' },
      pressureRise: -6,
      situation: [
        '首都西北的部分城镇已没有对方部队。重新进入的部队报告大量地雷和未爆物。',
        '地方报告称城镇中存在需要立即调查和记录的严重情况。'
      ],
      known: ['部分城镇已经没有对方部队。', '地雷和未爆物大量存在。'],
      unknown: ['城镇内部的全部情况。', '对方是否会再次进入。'],
      choices: [
        { id: 'c_fast_return', title: '尽快重新进入并公开宣布', ap: 1, agency: 'interior', exclusiveGroup: 'return',
          summary: '尽快恢复存在和社会信心。', staff: '排雷和安全确认可能跟不上。',
          effects: { will: 5, kyiv: 2, safety: -3 }, flags: ['c_fast_return'],
          modifiers: [{ when: { none: ['c_return_plan'] }, effects: { safety: -2, will: -2 }, note: '没有提前准备接管计划，重新进入的风险更高。' }],
          keyDecision: { node: 'return', purpose: '尽快恢复存在和信心。', cost: '排雷与安全确认不足。', unknown: '地雷与未爆物的分布。', irreversible: '公开宣布后难以退回。' } },
        { id: 'c_staged_return', title: '分阶段进入：先排雷和安全确认', ap: 2, agency: 'interior', exclusiveGroup: 'return',
          summary: '先确认安全，再恢复民事管理。', staff: '恢复更慢，居民要等待。',
          effects: { safety: 4, gov: 2, will: 1, reserve: -2 }, flags: ['c_staged_return'],
          keyDecision: { node: 'return', purpose: '降低重新进入时的伤亡风险。', cost: '恢复更慢。', unknown: '对方是否会再次进入。', irreversible: '等待的时间无法追回。' } },
        { id: 'c_document', title: '保全现场证据，邀请独立调查', ap: 1, agency: 'foreign',
          summary: '记录发生了什么，并让独立调查者进入。', staff: '调查需要时间，也需要保护现场。',
          effects: { intl: 5, gov: 1 }, flags: ['c_documented'] },
        { id: 'c_restore_services', title: '优先恢复周边基本服务', ap: 1, agency: 'logistics',
          summary: '让返回的居民有水、电和医疗。', staff: '物资会更紧。',
          effects: { will: 3, reserve: -2 } }
      ]
    }
  ];
  /* 4 月 2 日之后的可选收束阶段（第五幕）：最多 14 天，最晚 4 月 16 日。
     只模拟政府层面的优先级与资源协调，不声称两周内完成排雷或重建。
     choice.wrap 写入收束进度（0—100，界面只显示定性描述）。 */
  const WRAP_ACT = { id: 5, title: '第五幕 · 战役收束', range: '4 月 3 日 — 4 月 16 日', tone: 'aftermath', music: 'night', weight: 0, relief: 0,
    note: '大规模战斗已经过去，留下的是雷区、毁坏的道路和仍在寻找的人。这里要排的是先后次序，不是打赢什么。' };
  const WRAP_EVENTS = [
    {
      id: 'c14', act: 5, day: 39, days: 5, ap: 4, interruptible: false,
      date: '2022-04-03', dateLabel: '4 月 3 日 — 4 月 7 日', time: '五天', span: '5 天',
      title: '雷区、未爆物与重新进入', kicker: '战役收束 · 残局',
      intel: { level: '中', tone: '工兵与地方报告', note: '工兵在道路两侧和居民区入口发现大量地雷与未爆弹药。清理按优先级逐段推进，没有哪一天能宣布完成。' },
      pressureRise: 0,
      situation: [
        '首都西北的城镇已无对方部队，但道路、农田、房屋和车辆残骸里还有地雷和未爆物。',
        '居民在询问何时可以回家，记者和志愿者也在要求进入。工兵人手有限，清理只能一段一段做。'
      ],
      known: ['主干道和居民区入口发现了地雷与未爆物。', '工兵、救援和医疗力量都不够同时覆盖所有地方。'],
      unknown: ['各处雷场的完整分布。', '对方是否留下了新的布设记录。'],
      choices: [
        { id: 'w_mine_priority', title: '工兵优先清理主干道和居民区入口', ap: 2, agency: 'interior',
          summary: '先让救援车和抢修队能够通行，再向外扩展。', staff: '农田和偏远村庄要等更久。',
          effects: { safety: 2, reserve: -2 }, wrap: { mines: 18, roads: 8 }, flags: ['w_mine_priority'] },
        { id: 'w_security_check', title: '分区设检查点，限制进入', ap: 1, agency: 'interior',
          summary: '没有查清的地方不让人进，同时继续核对撤退情报。', staff: '居民会觉得回家的路被拦住了。',
          effects: { safety: 2 }, wrap: { reentry: 6, mines: 6, intel: 8 }, flags: ['w_checkpoints'] },
        { id: 'w_open_access', title: '允许居民和媒体有序进入已清理区域', ap: 1, agency: 'interior',
          summary: '让外界看到真实情况，也让居民尽快看到自己的家。', staff: '清理没跟上的地方，伤亡风险会上升。',
          effects: { will: 3, safety: -2 }, wrap: { reentry: 18, returnees: 6 }, flags: ['w_open_access'] },
        { id: 'w_rescue', title: '组织搜救队和医疗转运', ap: 1, agency: 'logistics',
          summary: '先找人、救治伤员，再谈其他。', staff: '车辆和医疗物资会被占用。',
          effects: { will: 2, reserve: -2 }, wrap: { missing: 14 }, flags: ['w_rescue'] }
      ]
    },
    {
      id: 'c15', act: 5, day: 44, days: 5, ap: 4, interruptible: false,
      date: '2022-04-08', dateLabel: '4 月 8 日 — 4 月 12 日', time: '五天', span: '5 天',
      title: '道路、桥梁与基础设施', kicker: '战役收束 · 恢复',
      intel: { level: '中', tone: '后勤与地方报告', note: '被炸毁或损坏的桥梁影响救援和物资运输。供水、供电和通信在部分城镇仍然中断。' },
      pressureRise: 0,
      situation: [
        '此前为阻滞对方而炸毁的桥梁，现在成了运送物资和疏散伤员的障碍。',
        '部分城镇没有稳定的水电和通信，医院靠备用电源运转。'
      ],
      known: ['部分桥梁与路段无法通行。', '水、电、通信恢复得不均衡。'],
      unknown: ['地下管线的受损程度。', '哪些建筑已经不能居住。'],
      choices: [
        { id: 'w_roads', title: '优先抢修通往首都的道路与桥梁', ap: 2, agency: 'logistics',
          summary: '让物资和救援车队有稳定的通道。', staff: '用掉工程力量和材料。',
          effects: { reserve: -2 }, wrap: { roads: 18, infra: 4 }, flags: ['w_roads'] },
        { id: 'w_utilities', title: '恢复水、电、供暖和通信', ap: 1, agency: 'logistics',
          summary: '先保医院和居民集中的地方。', staff: '偏远村庄要排在后面。',
          effects: { will: 2, reserve: -2 }, wrap: { infra: 16 }, flags: ['w_utilities'] },
        { id: 'w_identify', title: '统一登记失踪与遇难人员信息', ap: 1, agency: 'interior',
          summary: '家属需要一个能查询的地方。', staff: '登记比救援慢，家属会着急。',
          effects: { gov: 2 }, wrap: { missing: 14 }, flags: ['w_identify'] },
        { id: 'w_medical', title: '前移医疗点，转运伤员', ap: 1, agency: 'logistics',
          summary: '把伤员送到有条件的医院。', staff: '医疗物资会更紧。',
          effects: { will: 2, reserve: -1 }, wrap: { missing: 6, returnees: 4 } }
      ]
    },
    {
      id: 'c16', act: 5, day: 49, days: 4, ap: 3, interruptible: false,
      date: '2022-04-13', dateLabel: '4 月 13 日 — 4 月 16 日', time: '四天', span: '4 天',
      title: '平民返回与部队恢复', kicker: '战役收束 · 移交',
      intel: { level: '中', tone: '参谋部与地方报告', note: '部队需要休整和补充，地方政府希望接手日常管理。撤退情报仍在继续核实。' },
      pressureRise: 0,
      situation: [
        '参战部队已经连续作战数周，装备和人员都需要恢复。',
        '地方政府能否接手日常管理，取决于这几周里水电、道路和安全检查做到了什么程度。'
      ],
      known: ['部队需要轮换休整。', '地方政府已经开始接手部分工作。'],
      unknown: ['对方是否会在北面重新集结。', '返回的居民会不会遇到尚未发现的雷场。'],
      choices: [
        { id: 'w_returnee_conditions', title: '公布分区返回条件和时间表', ap: 1, agency: 'interior',
          summary: '告诉居民哪些地方可以回、哪些要再等。', staff: '有人会因为还不能回去而不满。',
          effects: { will: 3, gov: 1 }, wrap: { returnees: 14 }, flags: ['w_return_conditions'] },
        { id: 'w_unit_recover', title: '让参战部队分批休整、补充装备', ap: 2, agency: 'general_staff',
          summary: '先恢复战斗力，再谈后续部署。', staff: '休整期间有些方向会薄弱。',
          effects: { army: 3, reserve: -2 }, wrap: { recovery: 18 }, flags: ['w_unit_recover'] },
        { id: 'w_confirm_withdrawal', title: '继续核实撤退情报，保持警戒', ap: 1, agency: 'general_staff',
          summary: '确认对方是真撤还是换位置。', staff: '警戒会占用本该休整的兵力。',
          effects: { kyiv: 1 }, wrap: { intel: 16 }, flags: ['w_confirm_withdrawal'] },
        { id: 'w_handover', title: '向地方政府移交日常管理', ap: 1, agency: 'interior',
          summary: '中央从应急状态退回正常分工。', staff: '地方能力不足的地方可能出现空档。',
          effects: { gov: 2 }, wrap: { returnees: 6, infra: 6 }, flags: ['w_handover'] }
      ]
    }
  ];
  /* 进入窗口时的条件后果：只来自此前的命令与状态，用来让“之前的决定”在后来重新出现。 */
  const ON_ENTER = [
    { id: 'oe_runway_ground', window: 'c3', when: { any: ['c_runway_denied', 'c_transport_cut'] }, effects: { pressure: -2 },
      title: '机场方向：对方转向地面推进', text: '此前的拒止命令生效：报告称运输机方向没有形成稳定的空中运输。对方更依赖北面公路推进。' },
    { id: 'oe_runway_open', window: 'c3', when: { all: ['c_airfield_kept'], none: ['c_runway_denied', 'c_transport_cut'] }, effects: { pressure: 3 },
      title: '机场方向：跑道仍然完好', text: '机场设施保留下来。报告提醒，完好的跑道对对方同样有价值。' },
    { id: 'oe_relocated_lag', window: 'c5', when: { all: ['c_relocated'] }, effects: { gov: -3 },
      title: '转移后的协调延迟', text: '部分机构转移后，首都与转移地点之间的文件往返变慢。' },
    { id: 'oe_succession_ready', window: 'c5', when: { all: ['c_succession'] }, effects: { gov: 2 },
      title: '备用指挥链已经演练', text: '分散的继任安排完成首次演练，单点失效风险下降。' },
    { id: 'oe_ground_convoy', window: 'c6', when: { any: ['c_runway_denied', 'c_transport_cut'] }, effects: {},
      title: '北面车队', text: '由于空中运输没有成形，北面公路上的车队成为对方补给的主要方式。' },
    { id: 'oe_bridges_open', window: 'c6', when: { all: ['c_bridges_kept'], none: ['c_flooded'] }, effects: { kyiv: -3 },
      title: '伊尔平河方向：桥梁仍在', text: '保留的桥梁让本方机动更方便，也让对方的尝试更多。' },
    { id: 'oe_arms_registry', window: 'c8', when: { all: ['c_armed_citizens'], none: ['c_counterintel'] }, effects: { safety: -3, gov: -1 },
      title: '武器登记混乱', text: '紧急发放的武器缺少登记，部分街区出现误判和冲突报告。' },
    { id: 'oe_stocks_gap', window: 'c8', when: { all: ['c_release_stocks'] }, effects: { reserve: -2 },
      title: '储备提前释放的缺口', text: '早期释放的储备已经用完，补充需要时间。' },
    { id: 'oe_flood_line', window: 'c9', when: { any: ['c_flooded'] }, effects: { kyiv: 3 },
      title: '洪水限制渡河', text: '此前的放水让伊尔平河下游泛滥，莫什春方向的渡河条件变差。' },
    { id: 'oe_chernihiv_holds', window: 'c9', when: { all: ['c_chernihiv_reinforced'] }, effects: { pressure: -2 },
      title: '切尔尼戈夫方向坚持', text: '东北方向的城市仍在坚持，牵制了一部分对方力量。' },
    { id: 'oe_ammo_overrun', window: 'c10', when: { none: ['c_ammo_rationed'] }, effects: { reserve: -4 },
      title: '弹药消耗超出计划', text: '没有统一的配给规则，各方向的弹药申请都按最紧急处理。' },
    { id: 'oe_west_unstable', window: 'c11', when: { all: ['c_reserve_east'], none: ['c_flooded', 'c_bridges_blown'] }, effects: { kyiv: -3 },
      title: '西北河线仍不稳', text: '预备队在东侧，西北方向的压力没有明显缓解。' },
    { id: 'oe_convoy_strain', window: 'c11', when: { all: ['c_convoy_harassed'] }, effects: { pressure: -2 },
      title: '对方补给困难加剧', text: '长期袭扰让对方的补给线更不稳定（前线报告，未经独立核实）。' },
    { id: 'oe_reserve_ready', window: 'c11', when: { all: ['c_reserve_held'] }, effects: { army: 2 },
      title: '保留的预备队', text: '此前没有投入的预备队现在可以使用。' },
    { id: 'oe_trusted_gap', window: 'c13', when: { all: ['c_trusted_signal'], none: ['c_signal_verified'] }, effects: { kyiv: -3, safety: -2 },
      title: '首都方向变薄期间仍有炮击', text: '提前调出兵力后，首都周边仍有炮击和后卫部队的抵抗。' },
    { id: 'oe_pursuit_mines', window: 'c13', when: { all: ['c_pursued'] }, effects: { army: -4, safety: -1 },
      title: '跟进部队遭遇地雷', text: '跟进后撤部队的单位报告大量地雷和诡雷。' },
    { id: 'oe_verified', window: 'c13', when: { all: ['c_signal_verified'] }, effects: { gov: 2 },
      title: '多来源核实完成', text: '前线报告、伙伴情报和对方声明交叉核实后，判断依据更清楚。' }
  ];

  /* 内部逐日模拟时触发紧急简报（中断）的条件。 */
  const INTERRUPT = { kyiv: 20, gov: 30, safety: 18, pressure: 90 };

  /* 战役态势：六个方向的状态全部由已有旗标、状态和日期推导，不新增隐藏数值。 */
  const FRONTS = [
    { id: 'hostomel', label: '安东诺夫机场', x: 30, y: 30 },
    { id: 'bucha_irpin', label: '布恰—伊尔平', x: 36, y: 46 },
    { id: 'moshchun', label: '莫什春 · 伊尔平河', x: 46, y: 34 },
    { id: 'chernihiv', label: '切尔尼戈夫方向', x: 74, y: 10 },
    { id: 'brovary', label: '布罗瓦雷 · 东侧', x: 72, y: 50 },
    { id: 'kyiv_center', label: '基辅 · 政府中枢', x: 54, y: 58 }
  ];
  const STATUS_LABELS = {
    threat: '受威胁', pressure: '持续压力', held: '已巩固', contested: '争夺中', denied: '已拒止',
    cut: '交通受损', withdrawal: '对方后撤', reentered: '重新进入'
  };

  function has(flags, id) { return !!(flags && flags[id]); }
  function matches(flags, when) {
    if (!when) return true;
    if (when.all && !when.all.every(function (f) { return has(flags, f); })) return false;
    if (when.any && !when.any.some(function (f) { return has(flags, f); })) return false;
    if (when.none && when.none.some(function (f) { return has(flags, f); })) return false;
    return true;
  }

  function frontStatus(state, day) {
    const f = state.flags || {};
    const s = state.stats || {};
    const reentered = has(f, 'c_fast_return') || has(f, 'c_staged_return');
    const late = day >= 34;
    function pick(id) {
      if (id === 'hostomel') {
        if (reentered) return ['reentered', '对方离开后重新进入，跑道和设施受损。'];
        if (late) return ['withdrawal', '对方开始离开机场区域（报告仍在核实）。'];
        if (has(f, 'c_runway_denied')) return ['denied', '跑道已被破坏：对方控制区域，但无法当作运输机场。'];
        if (has(f, 'c_airfield_contested')) return ['contested', '反击仍在争夺机场。'];
        if (has(f, 'c_transport_cut')) return ['cut', '机场失守，但运输航线受到拦截。'];
        if (has(f, 'c_airfield_kept')) return ['threat', '跑道完好，可能被对方用于空中运输。'];
        return ['threat', '空降突击正在进行。'];
      }
      if (id === 'bucha_irpin') {
        if (reentered) return ['reentered', '重新进入，需要排雷和安全确认。'];
        if (late) return ['withdrawal', '对方部队后撤的报告增多。'];
        if (has(f, 'c_counter_west') && day >= 27) return ['contested', '局部反击正在推进。'];
        if (day < 4) return ['threat', '对方向首都西北推进。'];
        if (has(f, 'c_bridges_blown') || has(f, 'c_flooded')) return ['held', '桥梁或河谷障碍延缓了推进，但城镇仍在交战区。'];
        return ['pressure', '城镇夹在交战双方之间。'];
      }
      if (id === 'moshchun') {
        if (late) return ['withdrawal', '河线压力下降。'];
        if (day < 9) return [has(f, 'c_flooded') ? 'held' : 'threat', has(f, 'c_flooded') ? '河谷泛滥，渡河困难。' : '河线尚未成为主要战场。'];
        if (has(f, 'c_reserve_west')) return ['held', '预备队加强了河线。'];
        if (has(f, 'c_reserve_east') && !has(f, 'c_flooded')) return ['threat', '预备队在东侧，河线吃紧。'];
        return ['pressure', '对方试图渡河，本方独自承受压力。'];
      }
      if (id === 'chernihiv') {
        if (late) return ['withdrawal', '东北方向对方活动减少的报告。'];
        if (has(f, 'c_chernihiv_reinforced')) return ['held', '城市被包围但仍在坚持。'];
        return ['pressure', '城市受到持续压力。'];
      }
      if (id === 'brovary') {
        if (late) return ['withdrawal', '东侧对方后撤的报告。'];
        if (has(f, 'c_counter_east')) return ['contested', '东侧有限反击。'];
        if (has(f, 'c_reserve_east') || has(f, 'c_brovary_ambush')) return ['held', '东侧以预备队或伏击巩固。'];
        if (has(f, 'c_reserve_west')) return ['threat', '东侧缺少预备队。'];
        return [day >= 9 ? 'pressure' : 'threat', '装甲纵队方向。'];
      }
      const k = s.kyiv || 0;
      if (k >= 50 && (s.gov || 0) >= 45) return ['held', '首都与政府中枢正常运转。'];
      if (k >= 30) return ['pressure', '首都承受持续打击，政府仍在运转。'];
      return ['threat', '首都防御吃紧。'];
    }
    return FRONTS.map(function (front) {
      const r = pick(front.id);
      return { id: front.id, label: front.label, x: front.x, y: front.y, status: r[0], statusLabel: STATUS_LABELS[r[0]], note: r[1] };
    });
  }

  /* 结局 A–H。合理性：高 = 有较强历史条件和机制支持；中 = 需多个关键偏离；低 = 理论讨论，需要极端条件配合。 */
  const ENDINGS = {
    c_A: { code: 'A', title: '首都保全，攻势受挫', plausibility: '高', tone: 'held',
      summary: '首都保全，对方在首都方向的攻势受挫并撤离。国家付出了巨大代价，许多后果要在之后才能看清。' },
    c_B: { code: 'B', title: '代价高昂的存续', plausibility: '高', tone: 'costly',
      summary: '政府和首都仍在，但国家运行能力、基础设施、军事资源或社会承受力已经被大量消耗。' },
    c_C: { code: 'C', title: '空心存续', plausibility: '中', tone: 'hollow',
      summary: '政治体系保留了下来，但军事和社会能力已经极度脆弱，很难继续承受高强度战争。' },
    c_D: { code: 'D', title: '提前挫败首都方向的进攻', plausibility: '中', tone: 'held',
      summary: '多个关键条件同时成立：空中通道被拒止、河线障碍成形、对方补给受扰、局部反击及时。对方更早放弃首都方向的目标。' },
    c_E: { code: 'E', title: '长期围困与延迟撤退', plausibility: '中', tone: 'costly',
      summary: '首都保住了，但到 4 月 2 日对方仍未完成撤离。战役转入更长的消耗。' },
    c_F: { code: 'F', title: '首都严重受威胁，政府转移', plausibility: '低', tone: 'collapse',
      summary: '首都防御或国家能力出现重大失败，但国家指挥连续性保留下来，政府在其他地点继续运作。' },
    c_G: { code: 'G', title: '政府连续性断裂', plausibility: '低', tone: 'collapse',
      summary: '核心指挥和政治体系发生不可逆的中断。' },
    c_H: { code: 'H', title: '条件性政治停火或冻结', plausibility: '低', tone: 'costly',
      summary: '外交条件、军事态势和国内政治成本恰好同时满足，形成一个脆弱的停火或冻结。它不是和平，也不确定能持续。' }
  };

  function avgCoordination(state) {
    const list = Object.values(state.agencies || {});
    if (!list.length) return 50;
    return Math.round(list.reduce(function (sum, a) { return sum + (a.coordination || 0); }, 0) / list.length);
  }

  function dimensions(state) {
    const s = state.stats || {};
    const f = state.flags || {};
    const lvl = function (v, good, severe) { return v >= good ? 'good' : v <= severe ? 'severe' : 'strained'; };
    let civilian = (s.will || 0) + (has(f, 'c_evacuated') ? 8 : 0) + (has(f, 'c_staged_return') ? 6 : 0)
      - (has(f, 'c_fast_return') && !has(f, 'c_return_plan') ? 8 : 0) - (has(f, 'c_keep_bridges') ? 0 : 0);
    const initiative = 100 - (state.pressure || 0) + (has(f, 'c_counter_west') ? 8 : 0) + (has(f, 'c_counter_east') ? 5 : 0) + (has(f, 'c_held_lines') ? -4 : 0);
    const admin = avgCoordination(state);
    const rows = [
      ['continuity', '政府连续性', Math.min(s.gov || 0, (s.safety || 0) + 30), 50, 28],
      ['kyiv', '首都保全', s.kyiv || 0, 40, 18],
      ['army', '军队战斗力', s.army || 0, 38, 20],
      ['admin', '指挥与行政运行', admin, 45, 25],
      ['logistics', '后勤与基础设施', s.reserve || 0, 26, 12],
      ['civilian', '平民承受', Math.max(0, Math.min(100, civilian)), 45, 25],
      ['intl', '国际支持条件', s.intl || 0, 42, 20],
      ['initiative', '未来主动权', Math.max(0, Math.min(100, initiative)), 40, 18]
    ];
    return rows.map(function (r) { return { id: r[0], label: r[1], value: Math.round(r[2]), level: lvl(r[2], r[3], r[4]) }; });
  }

  function evaluate(state) {
    const s = state.stats || {};
    const f = state.flags || {};
    const dims = dimensions(state);
    const severe = dims.filter(function (d) { return d.level === 'severe'; });
    const reasons = [];
    const p = state.pressure || 0;
    if (state.collapseId) {
      const noBackup = !has(f, 'c_succession') && !has(f, 'c_relocated');
      if (state.collapseId === 'government' || state.collapseId === 'president' || (s.gov || 0) < 30 || (noBackup && (s.gov || 0) < 45)) {
        reasons.push('崩溃线：' + state.collapseId + '；政府连续性只剩 ' + (s.gov || 0) + '。');
        if (noBackup) reasons.push('此前没有建立继任安排，也没有转移部分职能：首都防线崩溃时，指挥体系没有可以接续的地方。');
        return { id: 'c_G', dims: dims, reasons: reasons };
      }
      reasons.push('崩溃线：' + state.collapseId + '；但政府连续性仍有 ' + (s.gov || 0) + '，指挥可以转移。');
      if (has(f, 'c_succession') || has(f, 'c_relocated')) reasons.push('此前的继任或转移安排让政府能够在其他地点继续运作。');
      return { id: 'c_F', dims: dims, reasons: reasons };
    }
    const airDenied = has(f, 'c_runway_denied') || has(f, 'c_transport_cut');
    const riverLine = has(f, 'c_bridges_blown') || has(f, 'c_flooded');
    if (airDenied && riverLine && has(f, 'c_convoy_harassed') && has(f, 'c_counter_west') && (s.kyiv || 0) >= 46 && (s.army || 0) >= 42 && p <= 55 && !severe.length) {
      reasons.push('空中通道被拒止、河线障碍成形、对方补给受扰、局部反击及时，且首都与军队都保有余量（压力 ' + p + '）。');
      return { id: 'c_D', dims: dims, reasons: reasons };
    }
    if (has(f, 'c_talks_open') && (s.intl || 0) >= 60 && (s.kyiv || 0) >= 45 && (s.will || 0) >= 45 && (s.army || 0) >= 36 && p <= 66 && !severe.length) {
      reasons.push('谈判渠道一直保持、国际支持条件高（' + s.intl + '）、军事态势稳定、国内承受力仍在。');
      return { id: 'c_H', dims: dims, reasons: reasons };
    }
    if (severe.length >= 2) {
      reasons.push('多个维度严重受损：' + severe.map(function (d) { return d.label; }).join('、') + '。');
      return { id: 'c_C', dims: dims, reasons: reasons };
    }
    const noPush = !has(f, 'c_counter_west') && !has(f, 'c_counter_east') && !has(f, 'c_pursued');
    if (p >= 80 || (noPush && (s.kyiv || 0) < 40 && p >= 60) || (has(f, 'c_trusted_signal') && !has(f, 'c_signal_verified') && (s.kyiv || 0) < 28)) {
      if (p >= 80) reasons.push('战争压力仍高（' + p + '），对方没有被迫完成撤离。');
      if (noPush && (s.kyiv || 0) < 40 && p >= 60) reasons.push('没有任何反击或跟进，首都周边对方阵地没有受到压力。');
      if (has(f, 'c_trusted_signal') && !has(f, 'c_signal_verified') && (s.kyiv || 0) < 28) reasons.push('提前调出兵力后，首都方向变薄，对方后卫得以拖延。');
      return { id: 'c_E', dims: dims, reasons: reasons };
    }
    const held = (s.gov || 0) >= 50 && (s.kyiv || 0) >= 36 && (s.army || 0) >= 36 && (s.will || 0) >= 42 && (s.intl || 0) >= 40 && (s.reserve || 0) >= 24 && (s.safety || 0) >= 15 && p < 95;
    if (held) {
      reasons.push('政府、首都、军队、社会、国际支持、储备和总统安全全部在维持线以上。');
      return { id: 'c_A', dims: dims, reasons: reasons };
    }
    const below = dims.filter(function (d) { return d.level !== 'good'; }).map(function (d) { return d.label; });
    reasons.push('撑到了 4 月 2 日，但以下方面低于维持线：' + (below.join('、') || '多项状态') + '。');
    return { id: 'c_B', dims: dims, reasons: reasons };
  }

  /* 历史基准：每个关键节点里最接近已知历史进程的选项，只用于复盘对照，不用于游玩期提示。 */
  const BASELINE = {
    airfield: { choices: ['c_counter_airfield', 'c_deny_runway'], note: '历史上机场当天就发生激烈争夺，乌方的抵抗和对跑道的破坏使其没有成为有效的空中运输通道。具体的控制时间在不同来源中有差异。' },
    capital: { choices: ['c_stay_capital', 'c_split_succession'], note: '总统和政府核心在首都继续公开运作。具体的内部继任安排没有完整公开，游戏中的方案是模拟。' },
    bridges: { choices: ['c_blow_bridges', 'c_flood_valley'], note: '伊尔平河上的桥梁被破坏，河谷部分被淹，这些都被研究者视为延缓推进的因素；放水的确切时间在报道中不一。' },
    reserve: { choices: [], note: '历史上莫什春和布罗瓦雷两个方向都坚持了下来。公开资料不支持把它简化为一次单一的预备队选择，这一节点是游戏的抽象。' },
    signal: { choices: ['c_stay_alert', 'c_verify_signal'], note: '3 月 29 日的声明之后，乌方和美方官员公开表态都很谨慎；美国国防部官员称不愿把它定性为撤退。' },
    return: { choices: [], note: '对方撤离后，乌方很快重新进入首都周边城镇。重新进入后的发现引发了多方调查。游戏不对真实人员的具体处置作评价。' }
  };

  const SOURCES = [
    { id: 'mwi', title: 'Modern War Institute at West Point：Urban Warfare Project Case Study #12: Battle of Kyiv（2025）', url: 'https://mwi.westpoint.edu/urban-warfare-project-case-study-12-battle-of-kyiv/' },
    { id: 'mvs', title: '乌克兰内务部：入侵初期主要战斗编年（官方来源，一方叙述）', url: 'https://mvs.gov.ua/en/news/xronika-osnovnix-bitv-na-pocatku-rosiiskogo-vtorgnennia' },
    { id: 'wotr', title: 'War on the Rocks：Collins, Kofman, Spencer, The Battle of Hostomel Airport（2023）', url: 'https://warontherocks.com/the-battle-of-hostomel-airport-a-key-moment-in-russias-defeat-in-kyiv/' },
    { id: 'rusi', title: 'RUSI：Preliminary Lessons in Conventional Warfighting from Russia’s Invasion of Ukraine（2022）', url: 'https://www.rusi.org/explore-our-research/publications/special-resources/preliminary-lessons-conventional-warfighting-russias-invasion-ukraine-february-july-2022' },
    { id: 'dod', title: '美国国防部：Defense Official Not Ready to Call Russian Activity in Ukraine a Retreat or Withdrawal（2022-03-29）', url: 'https://www.defense.gov/News/News-Stories/Article/Article/2982197/defense-official-not-ready-to-call-russian-activity-in-ukraine-a-retreat-or-wit/' }
  ];

  /* 事后时间线：status = confirmed（多来源确认）/ reported（公开报道，细节待核）/ disputed（来源之间有分歧）/ analysis（研究者分析）。 */
  const HISTORY = [
    { date: '2/24', node: 'invasion', event: '全面入侵开始：多地导弹打击，北、东、南多个方向越境。', known: '当天即公开报道。', status: 'confirmed', sources: ['mwi', 'rusi'] },
    { date: '2/24', node: 'airfield', event: '俄军以直升机机降突击安东诺夫（霍斯托梅尔）机场，当天发生激烈争夺。', known: '突击当天即有报道；机场控制权在不同时间点的说法不一。', status: 'disputed', sources: ['wotr', 'mwi', 'mvs'] },
    { date: '2/24–2/25', node: 'airfield', event: '乌方的抵抗、炮击和对跑道的破坏使机场没有成为俄方设想中的空中运输通道。', known: '这一判断主要来自战后研究。', status: 'analysis', sources: ['wotr', 'mwi'] },
    { date: '2/25–2/27', node: 'bridges', event: '伊尔平河上的多座桥梁被乌方破坏，以阻滞向首都西北的推进。', known: '当时有公开影像，事后研究确认其作用。', status: 'reported', sources: ['mwi'] },
    { date: '2 月底', node: 'bridges', event: '伊尔平河谷部分区域被淹，限制了渡河。', known: '有报道，确切时间各来源不同。', status: 'disputed', sources: ['mwi'] },
    { date: '2/28', node: 'talks', event: '双方代表在白俄罗斯边境举行第一轮谈判。', known: '当天公开。', status: 'confirmed', sources: ['rusi'] },
    { date: '2 月底—3 月初', node: 'convoy', event: '首都以北公路上的长车队停滞，被认为与后勤与协同问题有关。', known: '卫星图像公开报道；原因的分析来自之后的研究。', status: 'reported', sources: ['rusi', 'mwi'] },
    { date: '3 月上中旬', node: 'bucha', event: '布恰、伊尔平、霍斯托梅尔周边持续交战，平民撤离困难。', known: '当时即有报道，许多细节在之后才确认。', status: 'confirmed', sources: ['mwi', 'mvs'] },
    { date: '3 月', node: 'reserve', event: '莫什春方向发生激烈战斗，俄军试图越过伊尔平河未能形成突破。', known: '乌方官方编年有记载，独立细节有限。', status: 'reported', sources: ['mvs', 'mwi'] },
    { date: '3 月上旬', node: 'reserve', event: '布罗瓦雷方向的俄军装甲纵队遭伏击。', known: '公开影像在当时传播，规模细节不一。', status: 'reported', sources: ['mvs'] },
    { date: '3 月下旬', node: 'counter', event: '乌军在首都西面和西北的局部反击收复部分地区（如马卡里夫方向）。', known: '乌方当时宣布，之后被多方报道。', status: 'reported', sources: ['mwi', 'mvs'] },
    { date: '3/29', node: 'signal', event: '谈判后俄方宣布大幅减少首都和切尔尼戈夫方向的军事活动；美国国防部官员表示不愿把它定性为撤退，认为可能是重新部署。', known: '当天公开。', status: 'confirmed', sources: ['dod'] },
    { date: '3/30—4/2', node: 'return', event: '俄军从首都周边地区撤离，乌方宣布重新控制首都周边地区。', known: '乌方当时宣布；撤离的范围和时序在之后逐步确认。', status: 'reported', sources: ['mwi', 'mvs'] },
    { date: '4 月初', node: 'return', event: '重新进入布恰等城镇后发现大量平民遇害，随后多方展开调查。', known: '4 月初开始公开，调查在之后持续。', status: 'confirmed', sources: ['mwi'] }
  ];

  /* 研究者框架：只概括公开研究的分析视角并注明出处，不引用原话，也不把战后分析当作当时的预测。 */
  const RESEARCH = [
    { id: 'plan', title: '快速夺取首都的作战设想', source: 'rusi', text: 'RUSI 的初步经验报告讨论了俄方开局对快速瓦解乌方政府的预期，以及这种预期如何影响兵力分配和准备。这是 2022 年的战后初步分析。' },
    { id: 'air', title: '机场与空中运输通道', source: 'wotr', text: 'Collins、Kofman、Spencer 在 War on the Rocks 的文章把霍斯托梅尔机场视为俄方在首都方向的关键一环，讨论了机场没有形成运输通道对后续进程的影响。' },
    { id: 'terrain', title: '河流、桥梁与城市边缘', source: 'mwi', text: '西点现代战争研究所的城市作战案例研究讨论了伊尔平河、桥梁和城市边缘地形在首都防御中的作用，以及有限兵力如何利用这些条件。' },
    { id: 'sustain', title: '后勤、协同与持续能力', source: 'rusi', text: '多项研究把车队停滞、补给困难和部队协同问题列为俄方攻势受挫的因素之一。研究者也提醒，这不等于俄军在整场战争中缺乏作战能力。' },
    { id: 'society', title: '地方力量与社会动员', source: 'mwi', text: '研究讨论了领土防卫、地方政府和平民在首都防御中的作用，同时指出这一作用难以单独量化。' },
    { id: 'signal', title: '当时对撤退信号的判断', source: 'dod', text: '3 月 29 日美国国防部官员的公开判断是当时的判断，不是事后结论：他们不愿把俄方的行动称为撤退，认为可能是重新部署。' }
  ];

  /* 反事实：按关键节点组织。每条都说明已知、不确定、可支持的推论、不能确定之处和不同研究视角。 */
  const COUNTERFACTUALS = {
    airfield: {
      title: '如果机场的处置不同',
      known: '机场对任何一方的空中运输都有价值；当时乌方在首都附近可调动的兵力有限。',
      uncertain: '对方能把多少后续兵力空运进来，以及空运能否在持续炮击下维持。',
      inference: '在本局模型中，拒止或拦截让对方更依赖北面公路，这会提高地面车队的重要性。',
      cannot: '无法确定一个完好的机场会让首都防御提前失败；研究者对空运的潜在规模有不同估计。',
      perspectives: '一些研究强调机场是首都方向的关键一环；也有分析认为地面推进和整体后勤才是决定性因素。'
    },
    capital: {
      title: '如果政府连续性的安排不同',
      known: '总统和政府在首都公开运作，这对国内外的信心有影响。',
      uncertain: '针对领导层的威胁具体有多大，内部有哪些备用安排。',
      inference: '在本局模型中，留在首都提高连续性和社会意志，同时提高个人安全风险；转移则相反。',
      cannot: '无法据此判断真实领导人的选择是否“正确”，也不能说明转移就一定导致崩溃。',
      perspectives: '有观点强调象征性存在的作用；也有观点认为制度连续性比领导人所在地点更关键。'
    },
    bridges: {
      title: '如果伊尔平河的桥梁没有被破坏',
      known: '桥梁同时服务于本方机动、平民撤离和对方推进。',
      uncertain: '对方能否利用完好的桥梁形成突破。',
      inference: '在本局模型中，破坏桥梁和放水提高了河线的防御，但让撤离更困难。',
      cannot: '无法单独量化某一座桥对整体战局的影响。',
      perspectives: '城市作战研究通常把河流障碍视为防守方的重要条件；平民撤离的代价同样被讨论。'
    },
    reserve: {
      title: '如果预备队的投向不同',
      known: '两个方向都报告压力，预备队有限。',
      uncertain: '哪个方向是对方的主要努力。',
      inference: '在本局模型中，集中投入能稳住一个方向，但会让另一个方向更依赖此前的障碍和伏击。',
      cannot: '历史上并没有这样一次单一的总统级预备队选择；这是游戏对多个指挥决定的抽象。',
      perspectives: '一些分析强调集中力量，另一些分析强调保留机动预备队应对不确定性。'
    },
    signal: {
      title: '如果更早相信撤退信号',
      known: '对方作出了公开声明，部分方向出现车队移动。',
      uncertain: '这是撤退、重新部署还是争取时间。',
      inference: '在本局模型中，提前调出兵力可以为下一阶段争取准备时间，但首都方向会在最后几天变薄。',
      cannot: '无法确定对方会利用这段空档；后来的撤离并不说明当时的谨慎是多余的。',
      perspectives: '当时美方官员的判断是“可能是重新部署”；事后来看对方确实把重点转向东部，但这是事后才知道的。'
    },
    return: {
      title: '如果重新进入的方式不同',
      known: '收复地区存在大量地雷和未爆物。',
      uncertain: '城镇内部的全部情况。',
      inference: '在本局模型中，分阶段进入降低风险但恢复更慢；快速进入恢复信心但风险更高。',
      cannot: '游戏无法、也不应模拟真实城镇中发生的具体伤亡。',
      perspectives: '排雷与证据保全、居民返回之间的取舍，是战后多方讨论的问题。'
    }
  };

  root.LZS_CAMPAIGN = {
    id: 'kyiv_campaign',
    title: '基辅战役 · 2 月 24 日—4 月 2 日',
    saveKey: 'lzs_campaign_v1',
    schemaVersion: 4,
    totalDays: 38,
    /* 援助生命周期：请求 → 考虑 → 承诺 → 运输 → 抵达 → 分配 → 生效。
       delay 以决策窗口计；gate 不满足则顺延，顺延超过 maxSlips 后停滞并上报。
       warm：已有前期外交铺垫时，第一阶段缩短一个窗口。数量为模拟设计值，不代表真实交付数。 */
    wrapupEvents: WRAP_EVENTS,
    wrapAct: WRAP_ACT,
    aidLines: {
      appeal: { label: '首轮紧急请求', warm: [], maxSlips: 2, stages: [
        { key: 'considering', label: '伙伴内部讨论', delay: 1, note: '首轮请求已送达，伙伴正在内部讨论。' },
        { key: 'commitment', label: '作出初步承诺', delay: 2, gate: { minStat: { intl: 25 } }, effects: { intl: 3 }, note: '部分伙伴表态愿意提供支持，具体物资还没有清单。' },
        { key: 'arrival', label: '首批物资抵达', delay: 1, effects: { reserve: 2 }, note: '首批物资已到边境接收点，进入储备登记（模拟设计值）。' }
      ] },
      equipment: { label: '具体装备清单', warm: ['c_first_appeal'], maxSlips: 2, stages: [
        { key: 'considering', label: '清单进入审议', delay: 1, gate: { minStat: { intl: 25 } }, note: '伙伴已收到装备清单，正在核对来源与运输方式。' },
        { key: 'transport', label: '物资在途', delay: 1, gate: { none: ['c_transport_cut'] }, note: '物资已启运，沿陆路转运，需要边境接收和车队安排。' },
        { key: 'arrival', label: '物资抵达', delay: 1, effects: { reserve: 2 }, note: '一批装备抵达接收点，尚未分发到部队。' },
        { key: 'allocation', label: '分配到部队', delay: 1, effects: { army: 4 }, note: '参谋部已把装备分配到几个重点方向，部队开始接装（模拟设计值）。' }
      ] },
      air_defense: { label: '防空与反装甲援助', warm: ['c_first_appeal', 'c_wishlist'], maxSlips: 2, stages: [
        { key: 'commitment', label: '伙伴作出承诺', delay: 2, gate: { minStat: { intl: 25 } }, note: '伙伴同意提供防空与反装甲装备，正在安排交付。' },
        { key: 'arrival', label: '援助抵达', delay: 1, effects: { reserve: 3 }, note: '第一批援助抵达，正在清点和编组（模拟设计值）。' },
        { key: 'allocation', label: '分配与投入使用', delay: 1, effects: { army: 4 }, note: '援助已分配到重点方向，需要几天训练后才能充分使用。' }
      ] }
    },
    acts: ACTS,
    events: EVENTS,
    onEnter: ON_ENTER,
    interrupt: INTERRUPT,
    fronts: FRONTS,
    statusLabels: STATUS_LABELS,
    endings: ENDINGS,
    baseline: BASELINE,
    sources: SOURCES,
    history: HISTORY,
    research: RESEARCH,
    counterfactuals: COUNTERFACTUALS,
    matches: matches,
    frontStatus: frontStatus,
    dimensions: dimensions,
    evaluate: evaluate
  };
})(typeof window !== 'undefined' ? window : globalThis);
