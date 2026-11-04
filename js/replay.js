/*
 * 小泽模拟器 v1.1.0 · 决策推演室
 *
 * 这里不是「架空历史剧本选择器」。每个推演都从一场战役里真实存在过的决策点出发，
 * 只模拟与该决策直接相关的后续，并且明确区分：
 *   fact        历史事实（有公开资料）
 *   supported   历史资料支持的合理决策（当时确实被讨论或做过）
 *   simulated   基于真实条件的模拟推演（条件真实，走向是模型推演）
 *   assumption  为游戏机制设计的假设（没有资料支持，仅服务玩法）
 *
 * 所有推演结论都必须带「模型推演，不代表真实历史」。
 */
(function (root) {
  'use strict';

  const VERSION = '1.1.0';
  const STORAGE_KEY = 'lzs_replay_v1';
  const DISCLAIMER = '模型推演，不代表真实历史';

  /* 与 js/dynamic.js 的四类属性保持一致，避免同一概念两套说法。 */
  const KINDS = {
    fact: '历史事实',
    supported: '历史资料支持的合理决策',
    simulated: '基于真实条件的模拟推演',
    assumption: '为游戏机制设计的假设'
  };

  const LENGTHS = {
    short: '短推演 · 3—5 个决策点',
    medium: '中推演 · 5—7 个决策点',
    long: '长推演 · 7—9 个决策点'
  };

  /* ------------------------------------------------------------------ 模块一：安东诺夫机场 */
  const AIRFIELD = {
    id: 'rp_airfield',
    node: 'airfield',
    title: '安东诺夫机场：第一时间拒止跑道',
    subtitle: '是否在对方空中运输落地之前，把跑道本身变成不能用的东西',
    dateLabel: '2022 年 2 月 24 日',
    durationLabel: '模拟 3 天（2 月 24 日 — 2 月 26 日）',
    length: 'medium',
    background: '2 月 24 日清晨，俄方以直升机机降方式突入基辅西北的安东诺夫（戈斯托梅利）机场。机场跑道如果完好，就可能成为后续空中运输的落脚点；乌方守军在当天与随后几天反复争夺这一区域。公开资料普遍认为机场没有成为有效的空中运输通道，但具体控制时间、破坏方式与决策链条在不同来源中并不一致。',
    knownThen: [
      '机场方向发生直升机机降，跑道设施是对方最可能优先争夺的目标。',
      '本方在该方向的常驻兵力有限，重火力与工程器材都不在机场附近。',
      '如果跑道被完整占领，对方可能以运输机持续投送兵力与装备。',
      '机场周边的火力（火箭炮、航空兵）能否及时支援并不确定。'
    ],
    optionsThen: [
      { id: 'deny', label: '用火炮与航空兵直接打击跑道', kind: 'supported', note: '公开报道与研究普遍提到乌方对跑道的炮击与破坏，具体时间与执行单位有差异。' },
      { id: 'hold', label: '先守住设施，之后再决定是否破坏', kind: 'supported', note: '机场当天确实发生反复争夺，乌方一度有夺回并重新控制部分区域的报道。' },
      { id: 'interdict', label: '只拦截后续空运，不动跑道', kind: 'assumption', note: '资料不支持把它当作一个独立方案，这里作为对照选项存在。' }
    ],
    infoLimitNote: '推演只使用 2 月 24 日当天一名决策者合理可得的信息：机场方向有直升机机降、本方在该方向兵力薄弱、跑道的意义清楚。此后才被确认的细节（具体损失、双方轮换时间、外部评估）在「当时视角」下不会显示。',
    historicalBaseline: {
      choice: 'a1_fire',
      note: '历史进程更接近「跑道被破坏、机场没有成为有效空运通道」，但这不是一次干净的单点决策，而是数天争夺的结果。'
    },
    uncertainty: [
      '机场跑道的实际可用程度在 2 月 24 日至 25 日之间如何变化，公开资料并不一致。',
      '本方火力对跑道的破坏效果没有可靠的公开量化数据。',
      '对方计划中的空运规模只能从后续行动反推，不能视为已知事实。'
    ],
    steps: [
      {
        id: 'a1',
        date: '2 月 24 日 · 上午',
        title: '跑道还在谁手里并不清楚',
        situation: '机场方向报告混乱：有直升机机降，也有本方部队仍在设施附近的报告。上级要求你在半小时内给出方向性意见。',
        intel: [
          { text: '机场方向发生直升机机降（当时可得）', kind: 'fact' },
          { text: '本方在该方向没有足够的常驻兵力同时守住跑道与航站设施（当时可得）', kind: 'fact' },
          { text: '该方向能否得到及时火力支援尚不确定（当时可得）', kind: 'fact' },
          { text: '后续研究认为机场最终没有成为有效空运通道（事后确认，当时不可得）', kind: 'simulated', later: true }
        ],
        choices: [
          { id: 'a1_fire', label: '立刻请求火力打击跑道', next: 'a2', kind: 'supported', note: '与后来的实际做法方向一致。', analysis: { gain: '跑道一旦不可用，对方空中投送的落脚点就消失', risk: '机场设施与周边民用区域一同受损，本方此后也难以使用', need: '可用的火炮或航空兵，且能在数小时内响应', enemy: '对方可能改为以地面推进为主，减少对机场的依赖', later: '机场方向从「争夺设施」变成「争夺通道」，本方在该方向的兵力需求下降', uncertainty: '火力是否真的能在当天到位，公开资料无法确认' } },
          { id: 'a1_hold', label: '先组织守军守住设施，暂不破坏', next: 'a2', kind: 'supported', note: '机场当天确有反复争夺。', analysis: { gain: '设施完整，若夺回可立即使用；政治上也更像「守住自己的东西」', risk: '守军兵力不足时，设施与跑道都可能被完整接管', need: '能在数小时内增援的步兵与装甲', enemy: '对方一旦控制跑道，可能立即尝试空运投送', later: '本方必须在很短时间内决定是增援还是破坏，选择空间收窄', uncertainty: '当时本方在机场周边实际可用兵力没有可靠公开数字' } },
          { id: 'a1_wait', label: '先等情报明确再决定', next: 'a2', kind: 'assumption', note: '作为对照选项，资料不支持把它当作当时的正式方案。', analysis: { gain: '避免误判造成的自伤与浪费', risk: '跑道完好的时间越长，对方尝试空运的窗口越大', need: '可靠的侦察与通信', enemy: '对方会利用这段窗口加固机场方向', later: '后续窗口里本方需要额外投入才能补上跑道问题', uncertainty: '等待的代价取决于对方是否真的准备了空运，这一点当时无法确认' } }
        ]
      },
      {
        id: 'a2',
        date: '2 月 24 日 · 下午',
        title: '机场之外还有一条通道',
        situation: '如果跑道不能用，对方仍可能通过地面推进接近首都西北。参谋提出两个方向：把资源压在机场，或者转向伊尔平河一线。',
        intel: [
          { text: '对方地面纵队也在向基辅西北方向推进（当时可得）', kind: 'fact' },
          { text: '本方在西北方向的工程器材有限（当时可得）', kind: 'fact' },
          { text: '后续资料显示西北方向最终成为主要威胁方向（事后确认）', kind: 'simulated', later: true }
        ],
        choices: [
          { id: 'a2_airfield', label: '继续把注意力放在机场方向', next: 'a3', kind: 'simulated', note: '条件真实，取舍是模型推演。', analysis: { gain: '机场方向不会因为资源转移而再次失守', risk: '西北方向的河线与桥梁没有得到准备，后续代价更高', need: '同一批兵力在两地之间来回', enemy: '对方可以从西北方向绕开机场', later: '桥梁与河线相关的后续事件会更被动', uncertainty: '两地同时吃紧的程度无法从公开资料量化' } },
          { id: 'a2_river', label: '把资源转向伊尔平河一线', next: 'a3', kind: 'supported', note: '西北方向后来确实是防御重点。', analysis: { gain: '河线与桥梁提前得到准备，后续防御更有余地', risk: '机场方向可能被完整控制，短时间内无法改变', need: '工程器材与能执行爆破的分队', enemy: '对方可能加快机场方向的推进以利用本方转移', later: '桥梁相关的条件事件更容易出现，且更早有准备', uncertainty: '转移时机是否来得及，取决于双方当时的实际速度' } }
        ]
      },
      {
        id: 'a3',
        date: '2 月 25 日',
        title: '跑道坏了，问题没有结束',
        situation: '跑道被破坏之后，机场方向并没有安静下来。报告显示对方仍在设施周边活动，本方也有人在附近。',
        intel: [
          { text: '跑道受损不等于机场区域被完全控制（当时可得）', kind: 'fact' },
          { text: '设施保留下来对本方也有价值，但需要兵力看守（当时可得）', kind: 'fact' },
          { text: '后来的评估认为机场方向长期处于炮火可达范围（事后确认）', kind: 'simulated', later: true }
        ],
        choices: [
          { id: 'a3_secure', label: '派少量兵力守住设施，并把跑道问题定期复查', next: 'a4', kind: 'simulated', note: '条件真实，做法是模型推演。', analysis: { gain: '设施不会无人看守，跑道状态可以持续确认', risk: '兵力被长期占用在一个不会再产生决定性影响的方向', need: '轮换与后勤', enemy: '对方会用炮火与侦察维持压力', later: '后续窗口里会出现设施安全与轮换压力', uncertainty: '看守兵力的规模没有资料支持' } },
          { id: 'a3_leave', label: '撤出该方向，把兵力用到别处', next: 'a4', kind: 'simulated', note: '条件真实，取舍是模型推演。', analysis: { gain: '兵力集中到更需要的地方', risk: '设施与跑道状态无人确认，报告只能靠外部来源', need: '其他方向的接收与整编', enemy: '对方可能重新使用设施', later: '机场方向的报告会变慢、变模糊', uncertainty: '撤出后对方实际如何使用机场，公开资料不足以判断' } }
        ]
      },
      {
        id: 'a4',
        date: '2 月 26 日',
        title: '一份关于空运能力的评估',
        situation: '情报部门送来一份评估：对方是否还有能力向这一方向投送重型装备。评估内容与现场报告并不完全一致。',
        intel: [
          { text: '现场报告说跑道已经不能使用（当时可得）', kind: 'fact' },
          { text: '情报评估认为对方仍可能在别处建立空运通道（当时可得）', kind: 'simulated' },
          { text: '两者不一致时，需要判断该相信哪一方（当时可得）', kind: 'fact' }
        ],
        choices: [
          { id: 'a4_trust_field', label: '以现场报告为准，把资源转去别的方向', next: 'end', kind: 'simulated', note: '条件真实，判断是模型推演。', analysis: { gain: '资源不被重复投入', risk: '如果评估是对的，本方会对新的空运通道反应迟缓', need: '可靠的现场确认', enemy: '可能在其他机场或简易跑道尝试', later: '后续窗口可能出现新的空运相关情报', uncertainty: '当时两类情报的可信度都无法独立核实' } },
          { id: 'a4_check', label: '要求交叉核实，同时保持监视', next: 'end', kind: 'supported', note: '交叉核实是当时的常规做法。', analysis: { gain: '避免单一线报误判', risk: '核实需要时间，窗口很短', need: '侦察与通信资源', enemy: '利用核实期继续行动', later: '后续情报事件会带更明确的来源说明', uncertainty: '核实结果是否及时到达没有资料支持' } }
        ]
      }
    ],
    ending: {
      title: '机场方向的结论',
      text: '机场没有成为有效的空中运输落脚点，这一点在公开研究中有较多共识；但它是「在几天内反复争夺、由多个决定叠加」的结果，而不是一次决定性打击。把这一方向当成单一按钮，会看不见后面几天真实的消耗与轮换。'
    }
  };

  /* ------------------------------------------------------------------ 模块二：政府连续性 */
  const CAPITAL = {
    id: 'rp_capital',
    node: 'capital',
    title: '政府连续性：人留下，还是职能分开',
    subtitle: '留在首都与保留一个能接续的指挥体系，是不是同一件事',
    dateLabel: '2022 年 2 月 24 日 — 2 月 25 日',
    durationLabel: '模拟 5 天（2 月 24 日 — 2 月 28 日）',
    length: 'medium',
    background: '战争开始后，乌克兰最高领导层公开留在基辅，这一点被广泛报道，也成为战时政治象征的一部分。与此同时，任何政府在遭受直接打击时都需要考虑指挥体系能否接续。公开资料对具体的继任安排细节并不完整，多数分析只确认「核心层留在首都」与「部分职能向外转移」这两件事同时存在。',
    knownThen: [
      '首都可能成为打击目标，核心机构集中在一处的风险很清楚。',
      '公开露面与留在首都被视为政治信号，离开会被解读为放弃。',
      '如果核心层遭遇打击，需要有明确的接续规则。',
      '把部分职能迁到西部会牵动通信与命令流程。'
    ],
    optionsThen: [
      { id: 'stay', label: '核心层全部留在首都，公开露面', kind: 'fact', note: '与公开报道一致。' },
      { id: 'split', label: '核心层留下，部分职能与人员分散到西部', kind: 'supported', note: '多数分析认为确实存在分散与备份安排，细节未完整公开。' },
      { id: 'relocate', label: '把核心指挥整体转移到西部', kind: 'assumption', note: '资料不支持这一方案，这里作为对照。' }
    ],
    infoLimitNote: '推演只使用 2 月 24 日当天可得的信息：首都是打击目标、核心机构集中、离开有政治代价。具体的继任文件内容与分散地点属于事后才被讨论的内容，在「当时视角」下不显示。',
    historicalBaseline: {
      choice: 'b1_split',
      note: '公开资料更接近「核心层留在首都 + 部分职能与人员分散」，但内部分工细节没有完整公开，游戏里的方案是模拟。'
    },
    uncertainty: [
      '继任与授权安排的具体内容没有被完整公开。',
      '分散出去的职能在多大程度上实际接管了日常工作，无法核实。',
      '政治信号与军事安全之间的真实权衡过程没有第一手记录。'
    ],
    steps: [
      {
        id: 'b1',
        date: '2 月 24 日 · 上午',
        title: '先决定谁留在哪里',
        situation: '安全部门建议把部分核心人员转移出首都。政治上，任何转移都可能被解读为撤离。',
        intel: [
          { text: '首都存在被直接打击的风险（当时可得）', kind: 'fact' },
          { text: '领导人留在首都有明确的象征意义（当时可得）', kind: 'fact' },
          { text: '此后国际报道大量强调领导层留在基辅（事后确认）', kind: 'simulated', later: true }
        ],
        choices: [
          { id: 'b1_all_stay', label: '所有人留在首都，不做分散', next: 'b2', kind: 'supported', note: '与公开报道的「留在首都」一致，但完全不分摊风险是推演。', analysis: { gain: '政治上最清晰，指挥链最短', risk: '一次成功打击就可能让整个指挥体系同时失去', need: '对首都防空与安保的高度依赖', enemy: '对方会更倾向于打「斩首」类目标', later: '后续窗口里政府连续性会持续承压', uncertainty: '完全不做分散是否真的是当时状态，无法确认' } },
          { id: 'b1_split', label: '核心层留下，部分职能与人员分散', next: 'b2', kind: 'supported', note: '与多数分析的方向一致。', analysis: { gain: '指挥体系有了接续点', risk: '分散会拖慢命令流程，也会产生「谁说了算」的摩擦', need: '通信与授权规则的重新安排', enemy: '对方可能试图打断两地之间的通信', later: '后续会出现授权与命令归属的摩擦事件', uncertainty: '分散的规模与地点没有公开资料' } },
          { id: 'b1_relocate', label: '核心指挥整体转移到西部', next: 'b2', kind: 'assumption', note: '资料不支持，作为对照。', analysis: { gain: '指挥体系整体更安全', risk: '政治上被解读为放弃首都，国内与国际信号都变差', need: '新的通信与办公体系', enemy: '对方会放大「政府已撤离」的叙事', later: '首都方向的士气与协调都会受损', uncertainty: '这一方案在当时的实际讨论程度没有资料' } }
        ]
      },
      {
        id: 'b2',
        date: '2 月 25 日',
        title: '命令从哪来',
        situation: '分散安排开始运作后，部门与地方开始出现「这件事该找谁」的问题。有人按原流程上报首都，有人直接找已经转移出去的那部分。',
        intel: [
          { text: '分散后命令归属不清是常见问题（当时可得）', kind: 'simulated' },
          { text: '战时对响应速度的要求高于平时（当时可得）', kind: 'fact' }
        ],
        choices: [
          { id: 'b2_central', label: '明确一条线：所有重要事项仍由首都决定', next: 'b3', kind: 'simulated', note: '条件真实，取舍是模型推演。', analysis: { gain: '责任清楚，不会出现两个口径', risk: '首都成为瓶颈，响应变慢', need: '足够的办公与通信能力', enemy: '对方打击首都通信节点会产生更大影响', later: '注意力会更容易积压', uncertainty: '当时实际采用的口径没有完整资料' } },
          { id: 'b2_delegate', label: '把日常事务授权给各部门与地方，只留重大事项', next: 'b3', kind: 'simulated', note: '条件真实，取舍是模型推演。', analysis: { gain: '响应更快，首都注意力集中到少数事项', risk: '各地做法不一致，事后需要重新统一', need: '清晰的授权边界与反馈机制', enemy: '可能利用地方之间的差异', later: '会出现地方自主与统一指挥的摩擦', uncertainty: '授权的实际边界没有资料支持' } }
        ]
      },
      {
        id: 'b3',
        date: '2 月 26 日',
        title: '继任规则要不要写下来',
        situation: '有人提出：即使现在没事，也应该把「万一」写清楚。写下规则本身会被外界知道。',
        intel: [
          { text: '明确的继任规则能避免最坏情况下的争权（当时可得）', kind: 'simulated' },
          { text: '规则一旦公开，也可能被解读为对自身安全的悲观判断（当时可得）', kind: 'simulated' }
        ],
        choices: [
          { id: 'b3_write', label: '写成正式安排，只在极小范围知悉', next: 'b4', kind: 'supported', note: '多数政府都会做类似安排，具体形式未知。', analysis: { gain: '最坏情况下指挥体系不会真空', risk: '文件本身成为情报目标', need: '安全的分发与保管', enemy: '可能针对性打击接续人员', later: '政府连续性在崩溃时仍能维持', uncertainty: '这类安排的真实存在与内容无法核实' } },
          { id: 'b3_informal', label: '不写文件，靠口头默契', next: 'b4', kind: 'assumption', note: '作为对照。', analysis: { gain: '不留痕迹，不会被外界解读', risk: '真到需要时，默契不一定被承认', need: '内部高度信任', enemy: '—', later: '崩溃时政府连续性可能直接断裂', uncertainty: '—' } }
        ]
      },
      {
        id: 'b4',
        date: '2 月 27 日',
        title: '公开露面与安全',
        situation: '一次公开露面能稳定人心，但也暴露位置。安全部门要求在露面方式上做选择。',
        intel: [
          { text: '公开露面被普遍认为对士气重要（当时可得）', kind: 'fact' },
          { text: '位置暴露会带来直接风险（当时可得）', kind: 'fact' },
          { text: '此后公开露面的画面被广泛引用（事后确认）', kind: 'simulated', later: true }
        ],
        choices: [
          { id: 'b4_public', label: '照常公开露面，不做额外掩饰', next: 'b5', kind: 'fact', note: '与公开报道一致。', analysis: { gain: '信号强，国内外都看得清楚', risk: '位置暴露的风险由安保承担', need: '可靠的安保与防空', enemy: '可能尝试利用公开信息定位', later: '士气与国际支持更稳', uncertainty: '具体安保措施没有资料' } },
          { id: 'b4_recorded', label: '用预先录制的画面代替现场', next: 'b5', kind: 'assumption', note: '作为对照，资料不支持。', analysis: { gain: '位置不暴露', risk: '一旦被识别为录制，信号反而变弱', need: '严格的保密', enemy: '会尝试证明领导人已离开', later: '信任成本上升', uncertainty: '—' } }
        ]
      },
      {
        id: 'b5',
        date: '2 月 28 日',
        title: '两条线怎么合回去',
        situation: '分散出去的职能已经形成自己的工作节奏。现在要考虑：是让它长期存在，还是在局势稳定后收回来。',
        intel: [
          { text: '分散越久，收回成本越高（当时可得）', kind: 'simulated' },
          { text: '战事仍在继续，稳定还看不到（当时可得）', kind: 'fact' }
        ],
        choices: [
          { id: 'b5_keep', label: '保持两条线，明确各自边界', next: 'end', kind: 'simulated', note: '条件真实，取舍是模型推演。', analysis: { gain: '抗打击能力保留', risk: '长期存在会形成两套口径', need: '持续的协调成本', enemy: '可能针对两地通信', later: '后续窗口里出现协调摩擦', uncertainty: '—' } },
          { id: 'b5_merge', label: '逐步并回一条线', next: 'end', kind: 'simulated', note: '条件真实，取舍是模型推演。', analysis: { gain: '命令统一，响应更快', risk: '抗打击能力下降', need: '安全的集中办公地点', enemy: '集中即意味着单点目标', later: '首都方向的单点风险上升', uncertainty: '—' } }
        ]
      }
    ],
    ending: {
      title: '政府连续性的结论',
      text: '「留在首都」与「指挥体系能接续」是两件事，公开资料只对前者有明确记录。把两者混为一谈，会让崩溃线上的一切都变成运气问题。'
    }
  };

  /* ------------------------------------------------------------------ 模块三：伊尔平河与西北 */
  const BRIDGES = {
    id: 'rp_bridges',
    node: 'bridges',
    title: '伊尔平河：桥梁是防御工事，还是通道',
    subtitle: '炸掉桥梁挡住对方，也挡住自己人、撤离与补给',
    dateLabel: '2022 年 2 月下旬',
    durationLabel: '模拟 6 天（2 月 25 日 — 3 月 2 日）',
    length: 'medium',
    background: '伊尔平河一线的桥梁与河谷被研究者视为延缓俄方从西北方向推进的重要因素之一，部分河谷被放水淹没也有报道。桥梁被破坏的代价是双向的：它同时切断对方的推进路线与本方的机动、撤离和补给。公开资料对具体爆破时间与执行单位有差异。',
    knownThen: [
      '西北方向是对方推进的主要轴线之一。',
      '桥梁是可破坏的关键节点，也是本方日常交通的一部分。',
      '河谷地形可以被利用，但放水影响范围难以精确控制。',
      '平民撤离仍在使用这些桥。'
    ],
    optionsThen: [
      { id: 'blow', label: '主动爆破桥梁', kind: 'fact', note: '有公开报道支持桥梁被破坏。' },
      { id: 'flood', label: '利用河谷放水', kind: 'supported', note: '有报道提到部分河谷被淹，具体时间不一。' },
      { id: 'keep', label: '保留桥梁，靠兵力防守', kind: 'assumption', note: '作为对照，资料不支持把它当作主方案。' }
    ],
    infoLimitNote: '推演只使用当时可得的信息：西北方向是主要威胁、桥梁既是通道也是障碍、平民还在使用桥梁。具体的水文条件与淹没范围在「当时视角」下不显示。',
    historicalBaseline: {
      choice: 'c1_now',
      note: '公开研究更接近「桥梁被破坏 + 部分河谷被淹」，但把两者当成一次决定并不准确。'
    },
    uncertainty: [
      '各座桥梁被破坏的确切时间与顺序在不同来源中不一致。',
      '放水对推进路线的实际阻滞程度缺乏公开量化评估。',
      '平民撤离与工程爆破之间的协调过程没有第一手记录。'
    ],
    steps: [
      {
        id: 'c1',
        date: '2 月 25 日',
        title: '桥还在用',
        situation: '工程分队报告可以实施爆破，但桥面上仍有撤离的车辆。是否现在就炸，需要有人拍板。',
        intel: [
          { text: '桥面仍有平民车辆通行（当时可得）', kind: 'fact' },
          { text: '对方推进速度不明（当时可得）', kind: 'fact' },
          { text: '此后报道普遍把桥梁破坏列为延缓推进的因素（事后确认）', kind: 'simulated', later: true }
        ],
        choices: [
          { id: 'c1_now', label: '立即爆破，不管还在通行', next: 'c2', kind: 'supported', note: '方向与后来的做法一致，但「立即」是推演。', analysis: { gain: '推进路线被立刻切断', risk: '仍在桥上的平民与车辆直接受害，政治与道义代价极大', need: '能承担后果的决定', enemy: '需要改道或架设临时通道', later: '撤离路线被迫改变，后续撤离压力上升', uncertainty: '当时桥面实际通行状况没有可靠记录' } },
          { id: 'c1_wait', label: '等撤离高峰过去，设定最后时限', next: 'c2', kind: 'supported', note: '更接近有组织撤离的现实做法。', analysis: { gain: '减少平民伤亡', risk: '对方可能在这段窗口内接近桥梁', need: '可靠的通行管控与倒计时', enemy: '可能抢在爆破前占桥', later: '可能出现桥梁争夺相关事件', uncertainty: '时限设定的依据没有资料' } },
          { id: 'c1_keep', label: '暂不爆破，靠兵力防守', next: 'c2', kind: 'assumption', note: '作为对照。', analysis: { gain: '保留本方机动与补给路线', risk: '对方可能完整夺桥并通过', need: '足够的守桥兵力', enemy: '会集中力量夺桥', later: '西北方向的防御会更被动', uncertainty: '—' } }
        ]
      },
      {
        id: 'c2',
        date: '2 月 26 日',
        title: '河谷要不要放水',
        situation: '工程与水利部门报告：可以通过控制水位淹没部分低地，但影响范围难以精确控制，也会淹到本方与平民的土地。',
        intel: [
          { text: '低地可以被淹没（当时可得）', kind: 'fact' },
          { text: '淹没范围与时间难以精确控制（当时可得）', kind: 'fact' },
          { text: '公开报道提到部分河谷被淹（事后确认）', kind: 'supported', later: true }
        ],
        choices: [
          { id: 'c2_flood', label: '开闸放水', next: 'c3', kind: 'supported', note: '有报道支持，具体时间与规模不确定。', analysis: { gain: '低地变成障碍，对方的重装备难以通过', risk: '本方与平民的土地、道路一同被淹，恢复成本高', need: '水利设施控制权与工程评估', enemy: '只能绕行或等待水位下降', later: '后续会出现排涝与设施恢复需求', uncertainty: '淹没面积与持续时间没有公开数据' } },
          { id: 'c2_hold', label: '不动水利设施，只做工程障碍', next: 'c3', kind: 'simulated', note: '条件真实，取舍是模型推演。', analysis: { gain: '不会造成不可逆的附带损害', risk: '障碍强度弱于放水', need: '工程器材与时间', enemy: '可能找到绕行路线', later: '工程力量需求更高', uncertainty: '—' } }
        ]
      },
      {
        id: 'c3',
        date: '2 月 27 日',
        title: '桥没了，自己人怎么过',
        situation: '桥梁破坏后，本方在河西的部队与河东的补给之间出现断点。有人在报告里直接写：我们把自己也切断了。',
        intel: [
          { text: '桥梁破坏对本方机动同样生效（当时可得）', kind: 'fact' },
          { text: '临时通道与渡河器材有限（当时可得）', kind: 'simulated' }
        ],
        choices: [
          { id: 'c3_pontoon', label: '优先架设临时通道与渡河点', next: 'c4', kind: 'simulated', note: '条件真实，做法是模型推演。', analysis: { gain: '本方机动与补给恢复', risk: '临时通道同样可能被破坏，也会成为对方目标', need: '工程器材与防空掩护', enemy: '会尝试打断架设', later: '后续窗口出现工程部队请求', uncertainty: '当时实际架设能力没有公开资料' } },
          { id: 'c3_accept', label: '接受断点，让河西部队就地坚持', next: 'c4', kind: 'simulated', note: '条件真实，取舍是模型推演。', analysis: { gain: '不需要额外工程资源', risk: '河西部队补给与轮换困难，战力持续下降', need: '—', enemy: '会试图围困河西部队', later: '河西方向的消耗事件更频繁', uncertainty: '—' } }
        ]
      },
      {
        id: 'c4',
        date: '2 月 28 日',
        title: '撤离路线只剩一条',
        situation: '桥梁被破坏后，平民撤离只能走少数几条路线，其中一条已经进入对方火力可达范围。',
        intel: [
          { text: '撤离路线高度集中（当时可得）', kind: 'simulated' },
          { text: '撤离通道的安全无法完全保证（当时可得）', kind: 'fact' }
        ],
        choices: [
          { id: 'c4_reroute', label: '改道并公开提示，接受速度变慢', next: 'c5', kind: 'simulated', note: '条件真实，做法是模型推演。', analysis: { gain: '减少暴露在火力下的时间', risk: '撤离速度下降，滞留人口增加', need: '交通管控与地方配合', enemy: '可能针对新的路线', later: '滞留人口带来的保障压力上升', uncertainty: '—' } },
          { id: 'c4_keep_route', label: '维持现有路线，用运力弥补风险', next: 'c5', kind: 'simulated', note: '条件真实，取舍是模型推演。', analysis: { gain: '撤离速度快', risk: '伤亡风险落在平民身上', need: '更多车辆与组织者', enemy: '—', later: '内部安全与信任受影响', uncertainty: '—' } }
        ]
      },
      {
        id: 'c5',
        date: '3 月 1 日',
        title: '谁来修、谁来决定修哪座桥',
        situation: '工程部队报告：修复能力有限，只能先选一处。地方要求先恢复民用通行，军队要求先恢复机动路线。',
        intel: [
          { text: '工程能力有限，必须排序（当时可得）', kind: 'simulated' },
          { text: '民用与军用需求同时存在（当时可得）', kind: 'fact' }
        ],
        choices: [
          { id: 'c5_military', label: '先修军事机动路线', next: 'end', kind: 'simulated', note: '条件真实，取舍是模型推演。', analysis: { gain: '防御与轮换更快恢复', risk: '民用通行继续受限，地方压力上升', need: '工程器材与掩护', enemy: '会重点打击修复点', later: '地方与中央的摩擦增加', uncertainty: '—' } },
          { id: 'c5_civil', label: '先修民用通道', next: 'end', kind: 'simulated', note: '条件真实，取舍是模型推演。', analysis: { gain: '撤离与保障恢复，社会稳定改善', risk: '军事机动仍受限', need: '工程器材', enemy: '—', later: '军事方向的消耗上升', uncertainty: '—' } }
        ]
      }
    ],
    ending: {
      title: '河线的结论',
      text: '桥梁与河谷既是防御工事，也是本方的生活与补给线。把它们当成单纯的防御数值，会看不见破坏之后的撤离、工程与恢复问题——而这些问题在战役后半段会一直存在。'
    }
  };

  /* ------------------------------------------------------------------ 模块四：预备队 */
  const RESERVE = {
    id: 'rp_reserve',
    node: 'reserve',
    title: '预备队：莫什春还是布罗瓦雷',
    subtitle: '同一批兵力，压在哪一个方向',
    dateLabel: '2022 年 3 月上中旬',
    durationLabel: '模拟 6 天（3 月 8 日 — 3 月 14 日）',
    length: 'medium',
    background: '基辅西北的莫什春与东侧的布罗瓦雷在第聂伯河两岸都发生了激烈战斗，公开资料对两个方向都坚持下来有较多共识，但对具体兵力调动顺序与规模没有一致说法。把这件事简化为一次「二选一」，本身就是游戏的抽象。',
    knownThen: [
      '西北与东侧两个方向同时吃紧。',
      '本方可用于机动的预备队数量有限。',
      '参谋对「哪个方向更危险」意见不一致。',
      '把兵力分散到两个方向会同时削弱两边。'
    ],
    optionsThen: [
      { id: 'moshchun', label: '集中到西北莫什春方向', kind: 'supported', note: '该方向确有激战与坚守。' },
      { id: 'brovary', label: '集中到东侧布罗瓦雷方向', kind: 'supported', note: '该方向同样有激战。' },
      { id: 'split', label: '两边各分一部分', kind: 'simulated', note: '资源分配是模型推演。' }
    ],
    infoLimitNote: '推演只使用当时可得的信息：两个方向都在吃紧、预备队数量不足、参谋意见不一致。具体兵力数字没有任何可靠公开来源，因此推演里不出现数字。',
    historicalBaseline: {
      choice: null,
      note: '公开资料不支持把这件事简化成一次单一选择——两个方向都坚持了下来。这是本作最需要标明「游戏假设」的一个节点。'
    },
    uncertainty: [
      '两个方向的实际兵力规模与调动顺序没有可靠公开数字。',
      '「先哪个方向」的真实决策过程没有第一手记录。',
      '任一模拟的二选一都会掩盖同时坚持的事实。'
    ],
    steps: [
      {
        id: 'd1',
        date: '3 月 8 日',
        title: '只有一批人',
        situation: '参谋会议开了两个小时，两种意见各有一半人支持。你能调动的只有一批人。',
        intel: [
          { text: '两个方向同时吃紧（当时可得）', kind: 'fact' },
          { text: '预备队数量不足以同时加强两边（当时可得）', kind: 'simulated' },
          { text: '公开研究认为两个方向最终都守住了（事后确认）', kind: 'simulated', later: true }
        ],
        choices: [
          { id: 'd1_moshchun', label: '压向西北莫什春', next: 'd2', kind: 'supported', note: '与西北方向的激战记录一致。', analysis: { gain: '西北方向的推进被拖住，首都西北侧压力下降', risk: '东侧变薄，对方可能从布罗瓦雷方向取得突破', need: '机动与补给能跟上', enemy: '可能把重点转到东侧', later: '东侧的后续事件会更凶险', uncertainty: '两边兵力的真实对比没有资料' } },
          { id: 'd1_brovary', label: '压向东侧布罗瓦雷', next: 'd2', kind: 'supported', note: '与东侧的激战记录一致。', analysis: { gain: '东侧威胁被压住，河对岸的炮火威胁下降', risk: '西北方向压力上升', need: '跨河机动与协同', enemy: '可能加强西北方向', later: '西北方向的消耗事件更频繁', uncertainty: '跨河协同的实际难度不明' } },
          { id: 'd1_split', label: '两边各分一部分', next: 'd2', kind: 'simulated', note: '分配方式是模型推演。', analysis: { gain: '两边都不至于完全失守', risk: '两边都不够，最终都只勉强撑住', need: '更强的协调与后勤', enemy: '会选择最薄的一侧突破', later: '两个方向的报告都会显示勉强', uncertainty: '—' } }
        ]
      },
      {
        id: 'd2',
        date: '3 月 9 日',
        title: '参谋的第二份意见',
        situation: '被否掉的那一派参谋递上第二份意见：即使这次选择不变，也应该给另一个方向留下最低限度的机动力量。',
        intel: [
          { text: '另一个方向同样需要最低限度机动力量（当时可得）', kind: 'simulated' },
          { text: '不同意见本身是信息，不是阻力（当时可得）', kind: 'fact' }
        ],
        choices: [
          { id: 'd2_accept', label: '接受，留出一小部分机动力量', next: 'd3', kind: 'simulated', note: '条件真实，做法是模型推演。', analysis: { gain: '另一方向有了最低限度的应对能力', risk: '主攻方向的兵力被进一步稀释', need: '精确的调度', enemy: '—', later: '两个方向都不会出现完全无兵可调的情况', uncertainty: '—' } },
          { id: 'd2_reject', label: '不接受，保持集中', next: 'd3', kind: 'simulated', note: '条件真实，取舍是模型推演。', analysis: { gain: '主攻方向兵力最集中', risk: '另一方向一旦出事就没有缓冲', need: '—', enemy: '会利用另一方向的空虚', later: '另一方向可能突然告急', uncertainty: '—' } }
        ]
      },
      {
        id: 'd3',
        date: '3 月 11 日',
        title: '报告里的数字对不上',
        situation: '两个方向的战报都称自己「击退多次进攻」，但双方报告的损失与投入兵力互相对不上。',
        intel: [
          { text: '基层战报普遍夸大或保守（当时可得）', kind: 'fact' },
          { text: '不同来源的损失数字长期不一致（事后确认）', kind: 'fact', later: true }
        ],
        choices: [
          { id: 'd3_audit', label: '要求两个方向统一报告的统计口径', next: 'd4', kind: 'supported', note: '统一口径是常规做法。', analysis: { gain: '后续判断有可比基础', risk: '占用基层时间，短期内报告更慢', need: '参谋与通信资源', enemy: '—', later: '后续情报事件带更可靠的口径', uncertainty: '—' } },
          { id: 'd3_trust', label: '先按报告判断，不做统一', next: 'd4', kind: 'simulated', note: '条件真实，取舍是模型推演。', analysis: { gain: '不打断基层节奏', risk: '基于不一致的数据做后续决定', need: '—', enemy: '—', later: '可能出现基于错误估计的调配', uncertainty: '—' } }
        ]
      },
      {
        id: 'd4',
        date: '3 月 13 日',
        title: '要不要追击',
        situation: '一侧报告对方开始后撤。是追击扩大战果，还是稳住阵地等确认。',
        intel: [
          { text: '后撤可能是真的，也可能是诱饵（当时可得）', kind: 'fact' },
          { text: '追击会暴露侧翼（当时可得）', kind: 'simulated' }
        ],
        choices: [
          { id: 'd4_pursue', label: '有限追击，保持侧翼掩护', next: 'end', kind: 'simulated', note: '条件真实，做法是模型推演。', analysis: { gain: '可能扩大战果，缴获与俘获机会增加', risk: '进入对方预设火力区域', need: '可靠的侧翼与通信', enemy: '可能设伏', later: '后续出现伤亡与缴获相关报告', uncertainty: '对方后撤的真实原因没有资料' } },
          { id: 'd4_hold', label: '不追，先巩固阵地', next: 'end', kind: 'simulated', note: '条件真实，取舍是模型推演。', analysis: { gain: '不会因为贪功而受损', risk: '对方有秩序撤离，之后还能再来', need: '—', enemy: '可以安全撤离并重整', later: '后续窗口里对方仍保有余力', uncertainty: '—' } }
        ]
      }
    ],
    ending: {
      title: '预备队的结论',
      text: '历史上两个方向都坚持下来了，公开资料不支持「一次二选一」的叙事。这个推演的价值不在于选出正确答案，而在于看清：集中与分散各有代价，而真实情况很可能是两边都只勉强撑住。'
    }
  };

  /* ------------------------------------------------------------------ 模块五：外援 */
  const AID = {
    id: 'rp_aid',
    node: 'aid',
    title: '外援：请求什么，接受什么条件',
    subtitle: '从提出请求到装备真的能用，中间有很多不能跳过的环节',
    dateLabel: '2022 年 2 月下旬 — 3 月',
    durationLabel: '模拟 8 天（2 月 26 日 — 3 月 5 日）',
    length: 'long',
    background: '战争开始后，乌克兰向伙伴国家提出军事援助请求，西方国家陆续提供反坦克武器、便携防空武器与其它装备。公开资料对首批援助的种类与到达时间有较多报道，但具体的请求内容、附加条件与分配过程并不完整公开。援助从承诺到形成战斗力通常需要运输、交接、训练与分配等多个环节。',
    knownThen: [
      '本方在反坦克与防空方面存在明显缺口。',
      '伙伴国家的决策流程与国内政治会拖慢交付。',
      '装备到了不等于能用，还需要训练、弹药与维护。',
      '公开请求会引起对方与中立国的反应。'
    ],
    optionsThen: [
      { id: 'broad', label: '公开提出尽可能宽的请求', kind: 'supported', note: '乌方确实公开呼吁援助。' },
      { id: 'narrow', label: '只提最急需的几类装备', kind: 'simulated', note: '请求清单的实际内容没有完整公开。' },
      { id: 'quiet', label: '不走公开渠道，只做双边接触', kind: 'assumption', note: '作为对照。' }
    ],
    infoLimitNote: '推演只使用当时可得的信息：装备缺口清楚、伙伴流程慢、交付不等于可用。此后才公开的具体清单、交付批次数与条件，在「当时视角」下不显示。',
    historicalBaseline: {
      choice: 'e1_broad',
      note: '公开呼吁援助与随后获得反坦克、便携防空装备有报道支持；具体请求与条件属于模型推演。'
    },
    uncertainty: [
      '请求清单的具体内容与优先顺序没有完整公开。',
      '交付批次的到达时间在公开报道中差异较大。',
      '援助是否附有使用条件，公开资料不足以确认。'
    ],
    steps: [
      {
        id: 'e1',
        date: '2 月 26 日',
        title: '开口要什么',
        situation: '外交渠道问：需要什么，最好列出来。请求越具体越容易推动，也越早暴露本方缺口。',
        intel: [
          { text: '反坦克与防空缺口最急（当时可得）', kind: 'fact' },
          { text: '公开清单会被对方研究（当时可得）', kind: 'fact' }
        ],
        choices: [
          { id: 'e1_broad', label: '公开提出宽泛请求，包括重装备', next: 'e2', kind: 'supported', note: '公开呼吁有报道支持，重装备部分属于推演。', analysis: { gain: '政治压力大，可能推动更快决策', risk: '部分请求不现实，反而分散注意力；也可能被解读为局势更糟', need: '外交与舆论资源', enemy: '会借此宣传外部介入', later: '外交相关事件增多，条件问题更早出现', uncertainty: '重装备请求在当时是否真的提出，没有资料' } },
          { id: 'e1_narrow', label: '只列反坦克与便携防空', next: 'e2', kind: 'simulated', note: '清单内容是模型推演。', analysis: { gain: '务实，交付可能性高', risk: '重型装备缺口仍在', need: '较少的外交资源', enemy: '—', later: '后续仍会出现重装备不足的问题', uncertainty: '—' } },
          { id: 'e1_quiet', label: '只做双边接触，不公开请求', next: 'e2', kind: 'assumption', note: '作为对照。', analysis: { gain: '不暴露缺口，不刺激对方', risk: '政治压力不足，交付更慢', need: '—', enemy: '—', later: '援助相关事件整体延后', uncertainty: '—' } }
        ]
      },
      {
        id: 'e2',
        date: '2 月 28 日',
        title: '第一批援助去哪',
        situation: '一小批反坦克武器已经进入境内。几个方向都在要求，数量只够一个方向。',
        intel: [
          { text: '首批数量有限（当时可得）', kind: 'fact' },
          { text: '不同方向缺口都很大（当时可得）', kind: 'simulated' }
        ],
        choices: [
          { id: 'e2_northwest', label: '优先西北方向', next: 'e3', kind: 'simulated', note: '分配是模型推演。', analysis: { gain: '西北方向的装甲威胁得到缓解', risk: '东侧仍然缺反坦克手段', need: '训练与分发', enemy: '—', later: '东侧反装甲能力仍不足', uncertainty: '首批装备的实际去向没有公开资料' } },
          { id: 'e2_east', label: '优先东侧与东北方向', next: 'e3', kind: 'simulated', note: '分配是模型推演。', analysis: { gain: '东侧威胁被压制', risk: '西北方向仍薄', need: '跨河运输', enemy: '—', later: '西北方向的消耗更明显', uncertainty: '—' } },
          { id: 'e2_reserve', label: '先入库统一分配，不急着下发', next: 'e3', kind: 'simulated', note: '分配是模型推演。', analysis: { gain: '可以按统一标准分配，避免浪费', risk: '前线等待期间继续受损', need: '仓储与运输', enemy: '—', later: '出现分配与清点相关摩擦', uncertainty: '—' } }
        ]
      },
      {
        id: 'e3',
        date: '3 月 1 日',
        title: '附加条件',
        situation: '一个伙伴国家表示可以提供更多装备，但希望明确这些装备不会被用于某些用途。',
        intel: [
          { text: '援助国关心装备的使用方式（当时可得）', kind: 'simulated' },
          { text: '接受条件会限制用法，拒绝会失去这批援助（当时可得）', kind: 'fact' }
        ],
        choices: [
          { id: 'e3_accept', label: '接受条件，换取更大批量', next: 'e4', kind: 'simulated', note: '条件是模型推演，公开资料不足以确认。', analysis: { gain: '获得更多装备', risk: '一部分用法被限制，可能在关键时刻束手', need: '内部管控与记录', enemy: '—', later: '某些行动选项会显示为受限', uncertainty: '这类条件是否真实存在无法核实' } },
          { id: 'e3_refuse', label: '不接受限制，转向其它来源', next: 'e4', kind: 'simulated', note: '条件与转向都是模型推演。', analysis: { gain: '保持用法自由', risk: '这一批援助可能拿不到', need: '更多外交渠道', enemy: '—', later: '援助总量低于可获得水平', uncertainty: '—' } }
        ]
      },
      {
        id: 'e4',
        date: '3 月 2 日',
        title: '运输卡在路上',
        situation: '一批援助在邻国边境滞留了三天，理由从手续到航班都有，没有人能给出确定时间。',
        intel: [
          { text: '运输环节经常成为瓶颈（当时可得）', kind: 'simulated' },
          { text: '滞留原因可能不止一个（当时可得）', kind: 'fact' }
        ],
        choices: [
          { id: 'e4_push', label: '外交层面持续催办', next: 'e5', kind: 'supported', note: '催办是常规做法。', analysis: { gain: '可能缩短滞留时间', risk: '占用外交注意力，也可能被视为施压', need: '外交资源', enemy: '—', later: '外交关系相关事件增多', uncertainty: '催办的实际效果没有资料' } },
          { id: 'e4_alternative', label: '同时开辟备用运输路线', next: 'e5', kind: 'simulated', note: '路线选择是模型推演。', analysis: { gain: '不依赖单一路线', risk: '备用路线更慢、成本更高', need: '运输与协调资源', enemy: '可能打击运输节点', later: '出现路线安全相关事件', uncertainty: '—' } }
        ]
      },
      {
        id: 'e5',
        date: '3 月 3 日',
        title: '到了不等于能用',
        situation: '装备到了，但会操作的人不够，弹药与维护也没有配套。有人建议先训练再发，有人建议发了边打边学。',
        intel: [
          { text: '新装备需要训练与配套（当时可得）', kind: 'fact' },
          { text: '前线等不起长时间训练（当时可得）', kind: 'fact' }
        ],
        choices: [
          { id: 'e5_train', label: '先集中训练再下发', next: 'e6', kind: 'simulated', note: '做法是模型推演。', analysis: { gain: '使用效率更高，损耗更低', risk: '前线在等待期间继续承受损失', need: '训练场地与教官', enemy: '—', later: '装备形成战斗力的时间更晚但更稳', uncertainty: '—' } },
          { id: 'e5_field', label: '边打边学，先发到前线', next: 'e6', kind: 'simulated', note: '做法是模型推演。', analysis: { gain: '立刻有反装甲能力', risk: '误用、损耗与缴获风险', need: '现场指导', enemy: '可能缴获未使用的装备', later: '出现装备清点与损耗问题', uncertainty: '—' } }
        ]
      },
      {
        id: 'e6',
        date: '3 月 5 日',
        title: '效果反馈',
        situation: '第一批装备已经使用了一周。报告说有效，也有人说数量太少、改变不了局面。',
        intel: [
          { text: '援助对战场的实际影响需要时间才能评估（当时可得）', kind: 'simulated' },
          { text: '各类报告的评价会不一致（当时可得）', kind: 'fact' }
        ],
        choices: [
          { id: 'e6_continue', label: '继续按同一路径请求下一批', next: 'end', kind: 'simulated', note: '取舍是模型推演。', analysis: { gain: '渠道成熟，交付更快', risk: '忽略实际使用中的问题', need: '持续的外交投入', enemy: '—', later: '援助阶段继续推进', uncertainty: '—' } },
          { id: 'e6_review', label: '先做使用评估，再决定下一批清单', next: 'end', kind: 'supported', note: '评估后再请求是常规做法。', analysis: { gain: '下一批更贴合实际缺口', risk: '评估需要时间，请求延后', need: '参谋与前线反馈', enemy: '—', later: '下一批的种类更准确，但更晚', uncertainty: '—' } }
        ]
      }
    ],
    ending: {
      title: '外援的结论',
      text: '援助不是一个「+10 支持」的事件，而是请求、考虑、承诺、运输、到达、分配、使用七个环节的链条。任何一环卡住，纸面上的援助都不会变成前线能力。'
    }
  };

  /* ------------------------------------------------------------------ 模块六：撤退信号 */
  const SIGNAL = {
    id: 'rp_signal',
    node: 'signal',
    title: '撤退信号：先动，还是先核实',
    subtitle: '对方开始后撤时，最大的风险是把自己的判断当成事实',
    dateLabel: '2022 年 3 月底',
    durationLabel: '模拟 4 天（3 月 30 日 — 4 月 2 日）',
    length: 'short',
    background: '3 月底，俄方宣布将减少基辅与切尔尼希夫方向的军事行动，随后部队从基辅周边撤出。公开分析普遍认为这是作战重点转移，而不是善意让步；同时，乌方在这一阶段对「对方是否真的撤离」保持谨慎，并逐步向北部与东北方向恢复控制。具体的判断过程与核实方式没有完整公开。',
    knownThen: [
      '对方宣布减少基辅方向行动，但宣布不等于实际撤离。',
      '本方此前多次因过早判断而吃亏。',
      '后撤可能是为了重新部署，而不是结束行动。',
      '过早把兵力调走会让首都方向变薄。'
    ],
    optionsThen: [
      { id: 'verify', label: '先核实，再调整部署', kind: 'supported', note: '公开分析普遍强调谨慎判断。' },
      { id: 'trust', label: '接受对方说法，立即调整部署', kind: 'assumption', note: '资料不支持，这里作为对照。' },
      { id: 'pursue', label: '不等核实，直接跟进施压', kind: 'simulated', note: '条件是真实的，做法是模型推演。' }
    ],
    infoLimitNote: '推演只使用当时可得的信息：对方宣布减少行动、本方有过误判教训、后撤可能是重新部署。此后确认的撤离规模与重新部署方向，在「当时视角」下不显示。',
    historicalBaseline: {
      choice: 'f1_verify',
      note: '公开分析更接近「谨慎评估 + 逐步恢复控制」，但具体决策过程没有第一手记录。'
    },
    uncertainty: [
      '对方宣布与实际行动之间的时间差没有精确公开记录。',
      '乌方内部对撤退信号的判断过程没有第一手资料。',
      '「谨慎」与「迟缓」的界线在当时的实际把握无法重现。'
    ],
    steps: [
      {
        id: 'f1',
        date: '3 月 30 日',
        title: '一个说法，两种解读',
        situation: '对方宣布减少基辅方向行动。情报部门给出两种解读：真的在撤，或者是在为别的方向腾出手。',
        intel: [
          { text: '对方宣布减少基辅方向行动（当时可得）', kind: 'fact' },
          { text: '宣布与行动之间可能有差距（当时可得）', kind: 'fact' },
          { text: '此后分析普遍认为是作战重点转移（事后确认）', kind: 'supported', later: true }
        ],
        choices: [
          { id: 'f1_verify', label: '先核实再调整，保持现有部署', next: 'f2', kind: 'supported', note: '与公开分析的谨慎判断一致。', analysis: { gain: '不会因为误判而把兵力调空', risk: '如果对方真的撤了，本方反应会慢', need: '可靠的侦察与时间', enemy: '可能利用这段时间完成撤离', later: '后续窗口提供更明确的核实结果', uncertainty: '—' } },
          { id: 'f1_trust', label: '接受说法，立即把兵力调往东侧', next: 'f2', kind: 'assumption', note: '资料不支持，作为对照。', analysis: { gain: '东侧更早得到加强', risk: '首都方向变薄，如果判断错了代价极大', need: '快速机动能力', enemy: '可能利用空虚反扑', later: '首都方向的崩溃风险上升', uncertainty: '—' } },
          { id: 'f1_pursue', label: '不等核实，直接跟进施压', next: 'f2', kind: 'simulated', note: '条件是真实的，做法是模型推演。', analysis: { gain: '可能扩大战果、加快对方撤离', risk: '进入对方预设阵地，承受不必要的损失', need: '侧翼掩护与后勤', enemy: '后卫可能设伏', later: '出现伤亡与缴获事件', uncertainty: '—' } }
        ]
      },
      {
        id: 'f2',
        date: '3 月 31 日',
        title: '两个方向的情报矛盾',
        situation: '一份情报说对方主力已经离开，另一份说只是换了阵地。两份都不算硬证据。',
        intel: [
          { text: '情报之间存在矛盾（当时可得）', kind: 'fact' },
          { text: '矛盾本身说明核实不足（当时可得）', kind: 'simulated' }
        ],
        choices: [
          { id: 'f2_cross', label: '要求交叉核实，暂不调整部署', next: 'f3', kind: 'supported', note: '谨慎核实是常规做法。', analysis: { gain: '避免基于矛盾情报做决定', risk: '时间成本', need: '侦察资源', enemy: '—', later: '后续情报更可靠', uncertainty: '—' } },
          { id: 'f2_pick', label: '按更符合直觉的一份先动', next: 'f3', kind: 'simulated', note: '取舍是模型推演。', analysis: { gain: '抓住时间窗口', risk: '如果选错，代价由部署承担', need: '—', enemy: '—', later: '出现基于错误判断的后果', uncertainty: '—' } }
        ]
      },
      {
        id: 'f3',
        date: '4 月 1 日',
        title: '回去之前先问一句',
        situation: '北部一些村镇已经不在对方控制下。是否立即进入，还是等排雷与安全确认。',
        intel: [
          { text: '撤出区域可能留有爆炸物（当时可得）', kind: 'fact' },
          { text: '居民希望尽快恢复秩序（当时可得）', kind: 'fact' },
          { text: '此后排雷与清理成为长期工作（事后确认）', kind: 'supported', later: true }
        ],
        choices: [
          { id: 'f3_fast', label: '尽快进入，恢复秩序', next: 'f4', kind: 'simulated', note: '做法是模型推演。', analysis: { gain: '居民更早得到保障，秩序恢复快', risk: '排雷未完成时进入会造成伤亡', need: '工兵与医疗', enemy: '可能留有陷阱', later: '出现爆炸物伤害与清理需求', uncertainty: '—' } },
          { id: 'f3_staged', label: '分阶段进入，先排雷再恢复', next: 'f4', kind: 'supported', note: '与后来的实际做法方向一致。', analysis: { gain: '减少爆炸物伤亡', risk: '恢复更慢，居民不满', need: '工兵与清理资源', enemy: '—', later: '排雷与清障成为后续主要工作', uncertainty: '排雷进度没有资料' } }
        ]
      },
      {
        id: 'f4',
        date: '4 月 2 日',
        title: '撤退不等于结束',
        situation: '对方已经从基辅方向撤出，但东侧与南侧的作战仍在继续。有人主张把这次撤退当作转折点来宣传。',
        intel: [
          { text: '其它方向作战仍在继续（当时可得）', kind: 'fact' },
          { text: '把撤退宣传为胜利有政治收益，也有风险（当时可得）', kind: 'simulated' },
          { text: '此后战事重心确实转向东部与南部（事后确认）', kind: 'supported', later: true }
        ],
        choices: [
          { id: 'f4_claim', label: '宣传为重大转折', next: 'end', kind: 'assumption', note: '作为对照。', analysis: { gain: '短期士气与国际支持上升', risk: '与现实落差会在后续显现', need: '—', enemy: '会拿这一点反击宣传', later: '后续出现信任落差', uncertainty: '—' } },
          { id: 'f4_sober', label: '只说明事实，不宣布转折', next: 'end', kind: 'supported', note: '更接近公开表态的谨慎程度。', analysis: { gain: '不会给后续留下落差', risk: '士气收益较小', need: '—', enemy: '—', later: '后续叙事更稳', uncertainty: '—' } }
        ]
      }
    ],
    ending: {
      title: '撤退信号的结论',
      text: '撤退信号最难的地方不在于「对方走了没有」，而在于本方要在一个不能完全确认的时刻做出部署决定。把核对当成怯懦、把跟进当成勇敢，都会付出代价。'
    }
  };

  const MODULES = [AIRFIELD, CAPITAL, BRIDGES, RESERVE, AID, SIGNAL];

  const BY_ID = {};
  MODULES.forEach(function (module) { BY_ID[module.id] = module; });

  function copy(value) { return JSON.parse(JSON.stringify(value)); }

  function moduleOf(id) {
    return BY_ID[id] ? copy(BY_ID[id]) : null;
  }

  function stepOf(module, stepId) {
    if (!module) return null;
    for (let index = 0; index < module.steps.length; index += 1) {
      if (module.steps[index].id === stepId) return module.steps[index];
    }
    return null;
  }

  function lengthLabel(module) {
    return LENGTHS[(module && module.length) || 'medium'] || LENGTHS.medium;
  }

  /* 只展示当时合理可得的信息；标记 later 的条目属于事后确认，在「当时视角」下隐藏。 */
  function visibleIntel(intel, infoMode) {
    return (intel || []).filter(function (item) {
      if (infoMode === 'then' && item.later) return false;
      return true;
    });
  }

  /* 一次推演的过程记录：只落实玩家实际做过的选择，不生成另外的历史。 */
  function createSession(moduleId, options) {
    const module = moduleOf(moduleId);
    if (!module) return null;
    const opts = options || {};
    const first = module.steps[0];
    return {
      id: 'rp-' + module.id + '-' + Date.now().toString(36),
      moduleId: module.id,
      title: module.title,
      infoMode: opts.infoMode === 'all' ? 'all' : 'then',
      startedAt: new Date().toISOString(),
      finished: false,
      stepId: first.id,
      stepCount: module.steps.length,
      path: [],
      visibleStep: buildStep(module, first.id, opts.infoMode === 'all' ? 'all' : 'then')
    };
  }

  function buildStep(module, stepId, infoMode) {
    const step = stepOf(module, stepId);
    if (!step) return null;
    return {
      id: step.id,
      date: step.date,
      title: step.title,
      situation: step.situation,
      intel: visibleIntel(step.intel, infoMode),
      hiddenCount: (step.intel || []).length - visibleIntel(step.intel, infoMode).length,
      choices: (step.choices || []).map(function (choice) {
        return {
          id: choice.id,
          label: choice.label,
          kind: choice.kind,
          kindLabel: KINDS[choice.kind] || KINDS.simulated,
          note: choice.note
        };
      })
    };
  }

  function choose(session, choiceId) {
    if (!session || session.finished) return { ok: false, reason: '这道推演已经结束。' };
    const module = BY_ID[session.moduleId];
    const step = stepOf(module, session.stepId);
    if (!step) return { ok: false, reason: '没有找到对应的决策点。' };
    let picked = null;
    (step.choices || []).forEach(function (choice) { if (choice.id === choiceId) picked = choice; });
    if (!picked) return { ok: false, reason: '没有找到这个选项。' };
    session.path.push({
      stepId: step.id,
      stepTitle: step.title,
      date: step.date,
      choiceId: picked.id,
      label: picked.label,
      kind: picked.kind,
      kindLabel: KINDS[picked.kind] || KINDS.simulated,
      analysis: copy(picked.analysis || {})
    });
    if (picked.next === 'end' || session.path.length >= module.steps.length) {
      session.finished = true;
      session.finishedAt = new Date().toISOString();
      session.result = buildResult(module, session);
      session.visibleStep = null;
      return { ok: true, finished: true, result: session.result };
    }
    session.stepId = picked.next;
    session.visibleStep = buildStep(module, picked.next, session.infoMode);
    return { ok: true, finished: false, step: session.visibleStep };
  }

  /* 与历史基准线比较：只说「同一节点上历史更接近哪个选项」，并给出模型推演的收益/风险。 */
  function buildResult(module, session) {
    const baselineChoice = module.historicalBaseline ? module.historicalBaseline.choice : null;
    const firstPath = session.path[0] || null;
    const same = baselineChoice && firstPath ? firstPath.choiceId === baselineChoice : null;
    const divergences = [];
    if (baselineChoice) {
      /* 基准线指向的选项可能在第一步之后的某一步，因此标签与所在步骤都从全部步骤里找。 */
      let baselineLabel = null;
      let baselineStep = null;
      module.steps.forEach(function (step) {
        (step.choices || []).forEach(function (choice) {
          if (choice.id === baselineChoice) {
            baselineLabel = choice.label;
            if (!baselineStep) baselineStep = step.title;
          }
        });
      });
      if (!baselineLabel) {
        const option = (module.optionsThen || []).filter(function (o) { return o.id === baselineChoice; })[0];
        baselineLabel = option ? option.label : baselineChoice;
      }
      divergences.push({
        step: baselineStep || (firstPath ? firstPath.stepTitle : ''),
        player: firstPath ? (firstPath.choiceId === baselineChoice ? firstPath.label : '你走的是：' + firstPath.label) : '（没有做出选择）',
        baseline: baselineLabel,
        same: same
      });
    }
    const lines = session.path.map(function (entry) {
      const analysis = entry.analysis || {};
      return {
        step: entry.stepTitle,
        date: entry.date,
        choice: entry.label,
        kindLabel: entry.kindLabel,
        gain: analysis.gain || '—',
        risk: analysis.risk || '—',
        need: analysis.need || '—',
        enemy: analysis.enemy || '—',
        later: analysis.later || '—',
        uncertainty: analysis.uncertainty || '—'
      };
    });
    return {
      moduleId: module.id,
      title: module.title,
      disclaimer: DISCLAIMER,
      infoMode: session.infoMode,
      infoModeLabel: session.infoMode === 'then' ? '当时视角（隐藏事后确认的信息）' : '完整视角（包含事后确认的信息）',
      steps: session.path.length,
      path: session.path.map(function (entry) { return entry.label; }),
      divergences: divergences,
      baselineNote: module.historicalBaseline ? module.historicalBaseline.note : '',
      lines: lines,
      ending: module.ending,
      uncertainty: module.uncertainty || [],
      note: '这里的收益、风险与后续都是模型推演，用来帮助理解当时的取舍结构，不是已经发生过的事情。'
    };
  }

  /* ---------------------------------------------------------------- 解锁与记录 */

  function readStore() {
    try {
      const raw = root.localStorage && root.localStorage.getItem(STORAGE_KEY);
      if (!raw) return { version: 1, runs: [] };
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return { version: 1, runs: [] };
      if (!Array.isArray(parsed.runs)) parsed.runs = [];
      if (!parsed.version) parsed.version = 1;
      return parsed;
    } catch (error) {
      return { version: 1, runs: [] };
    }
  }

  function writeStore(store) {
    try {
      if (!root.localStorage) return false;
      root.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
      return true;
    } catch (error) {
      return false;
    }
  }

  /* 解锁条件：至少完成过一次完整的基辅战役（历史战役记录里存在战役条目）。
     与战役记录共用同一个来源，但不改写它。 */
  function unlockState() {
    let completed = 0;
    try {
      if (root.LZS && typeof root.LZS.getRecords === 'function') {
        const records = root.LZS.getRecords();
        const runs = (records && records.runs) || [];
        completed = runs.filter(function (run) { return run && run.scenario === 'campaign'; }).length;
      }
    } catch (error) {
      completed = 0;
    }
    return {
      unlocked: completed > 0,
      completed: completed,
      completedCampaigns: completed,
      reason: completed > 0 ? '' : '先完整打完一次 2022 · 基辅防御战役，档案柜才会打开。'
    };
  }

  function recordRun(session) {
    if (!session || !session.result) return null;
    const store = readStore();
    const entry = {
      id: session.id,
      moduleId: session.moduleId,
      title: session.title,
      finishedAt: session.finishedAt || new Date().toISOString(),
      infoMode: session.infoMode,
      steps: session.result.steps,
      path: session.result.path,
      diverged: session.result.divergences.some(function (item) { return item.same === false; })
    };
    store.runs.push(entry);
    /* 保留最近 40 次推演记录，避免无限增长。 */
    if (store.runs.length > 40) store.runs = store.runs.slice(store.runs.length - 40);
    writeStore(store);
    return entry;
  }

  function summary() {
    const store = readStore();
    const byModule = {};
    MODULES.forEach(function (module) {
      byModule[module.id] = { id: module.id, title: module.title, attempts: 0, lastAt: null, diverged: 0 };
    });
    store.runs.forEach(function (run) {
      const slot = byModule[run.moduleId];
      if (!slot) return;
      slot.attempts += 1;
      slot.lastAt = run.finishedAt || slot.lastAt;
      if (run.diverged) slot.diverged += 1;
    });
    const unlock = unlockState();
    return {
      unlocked: unlock.unlocked,
      completedCampaigns: unlock.completedCampaigns,
      modules: MODULES.map(function (module) {
        return {
          id: module.id,
          node: module.node,
          title: module.title,
          subtitle: module.subtitle,
          dateLabel: module.dateLabel,
          durationLabel: module.durationLabel,
          lengthLabel: lengthLabel(module),
          steps: module.steps.length,
          attempts: byModule[module.id].attempts,
          lastAt: byModule[module.id].lastAt,
          diverged: byModule[module.id].diverged
        };
      }),
      totalRuns: store.runs.length
    };
  }

  function historyNote(moduleId) {
    const module = BY_ID[moduleId];
    if (!module) return null;
    return {
      background: module.background,
      knownThen: module.knownThen,
      optionsThen: module.optionsThen,
      infoLimitNote: module.infoLimitNote,
      historicalBaseline: module.historicalBaseline,
      uncertainty: module.uncertainty
    };
  }

  const api = {
    version: VERSION,
    storageKey: STORAGE_KEY,
    disclaimer: DISCLAIMER,
    kinds: KINDS,
    lengths: LENGTHS,
    modules: MODULES,
    byId: BY_ID,
    count: MODULES.length,
    moduleOf: moduleOf,
    stepOf: stepOf,
    lengthLabel: lengthLabel,
    visibleIntel: visibleIntel,
    buildStep: buildStep,
    createSession: createSession,
    choose: choose,
    buildResult: buildResult,
    unlockState: unlockState,
    readStore: readStore,
    recordRun: recordRun,
    summary: summary,
    historyNote: historyNote
  };

  root.LZS_REPLAY = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
}(typeof window !== 'undefined' ? window : globalThis));
