/*
 * 小泽模拟器 · 历史情景数据
 * ------------------------------------------------------------------
 * 说明：
 * 1. 时间线参考 2022 年 2 月 24 日至 3 月 2 日的公开报道与公开时间线。
 * 2. 所有数值都是模拟设计参数，不是历史统计，也不代表真实决策效果。
 * 3. 文电、幕僚评估与情景叙述为合成文本，不冒充真实文件，不虚构真实人物引语。
 * 4. 完整历史复盘存放在 js/history.js，只在结局后显示；游玩界面只显示当时已知与无法确认的信息。
 */
(function (root) {
  'use strict';

  const EVENTS = [
    {
      id: 'e1',
      date: '2022-02-24',
      dateLabel: '2月24日 · 周四',
      time: '凌晨 · 模拟接报',
      title: '全线入侵',
      kicker: '最高统帅部 · 第 01 号战报',
      intel: {
        level: '高',
        tone: 'high',
        note: '边境多点被突破已由多方渠道交叉确认；俄军纵深与后续梯队仍不清楚。'
      },
      pressureRise: 9,
      situation: [
        '凌晨，防空警报和边境报告几乎同时涌进班科夫街。北面、东面、南面都出现成建制越境；基辅、哈尔科夫、敖德萨等城市遭到导弹与空袭。',
        '总参谋部承认，这不是局部挑衅。议会已准备表决战时状态，但政府是否立即转入战时体制、军队是否全国动员，需要你签字。'
      ],
      known: [
        '俄罗斯从多个方向发动全面入侵，边境守军正在交战。',
        '基辅、哈尔科夫等城市遭到导弹与空袭。',
        '乌方宣布战时状态与断交的程序已经启动。'
      ],
      unknown: [
        '俄军主攻方向，以及是否试图在数日内攻占基辅。',
        '空军与防空系统实际还剩多少可用力量。',
        '西方是否会迅速提供致命性武器。'
      ],
      choices: [
        {
          id: 'address',
          title: '签署战时状态令，向全国讲话',
          ap: 1,
          summary: '宣布战时状态，通过电视与网络向全国说明局势，要求军民保持秩序。',
          staff: '能迅速稳住行政链条与民心；但公开讲话会暴露总统仍在基辅，个人风险上升。',
          effects: { gov: 4, will: 7, safety: -3, intl: 1, pressure: 1 },
          delayed: [
            {
              delay: 2,
              label: '动员承诺压到地方',
              note: '各地征召与管制同时启动，基层执行出现摩擦，行政与储备承压。',
              effects: { gov: -3, reserve: -2 }
            }
          ]
        },
        {
          id: 'mobilize',
          title: '签署全国总动员令',
          ap: 2,
          summary: '征召预备役，开放领土防卫招募，把全国人力迅速转入战时体制。',
          staff: '兵力与抵抗意志会上升；装备、训练和后勤缺口也会立刻放大。',
          effects: { army: 8, will: 4, reserve: -7, gov: -2, pressure: 2 },
          delayed: [
            {
              delay: 3,
              label: '第一批动员兵抵达集结点',
              note: '仓促征召的部队缺少足够装备与指挥骨干，组织度回落。',
              effects: { army: -5, will: -2 }
            }
          ]
        },
        {
          id: 'aid_call',
          title: '紧急致电盟友，要求军援',
          ap: 1,
          summary: '召开紧急盟友通话，提交防空、反坦克武器与情报支援清单。',
          staff: '可能抬高国际支持；但援助不会立即抵达前线，还要占用宝贵的外交注意力。',
          effects: { intl: 7, safety: 2, pressure: 1 },
          delayed: [
            {
              delay: 3,
              label: '部分援助承诺开始落地',
              note: '承诺陆续抵达，但数量与速度都低于基辅的期待。',
              effects: { intl: 4, army: 2 }
            }
          ]
        },
        {
          id: 'disperse',
          title: '命令政府分散办公',
          ap: 2,
          summary: '核心部委按预案分散到西部与中部备用设施，避免被一次打击瘫痪。',
          staff: '降低政府单点瘫痪风险；但跨地协调会变慢，也会被解读为准备撤离。',
          effects: { gov: 8, safety: 4, will: -5, intl: -2 },
          delayed: [
            {
              delay: 2,
              label: '分散办公带来协调摩擦',
              note: '文件与指挥链在不同城市之间来回，反应速度下降。',
              effects: { army: -2, reserve: -3 }
            }
          ]
        }
      ]
    },

    {
      id: 'e2',
      date: '2022-02-25',
      dateLabel: '2月25日 · 周五',
      time: '深夜至凌晨 · 模拟接报',
      title: '总统在哪里',
      kicker: '总统办公室 · 安全简报',
      intel: {
        level: '中',
        tone: 'medium',
        note: '基辅市区交火已确认；渗透小组位置与撤离方案可靠性仍未核实。'
      },
      pressureRise: 8,
      situation: [
        '入夜后，基辅市区出现交火。美方官员表示，愿协助你转移，并讨论建立流亡政府的可能性；具体方案、条件与可靠性仍未确认。总统办公室内部也在争论：总统的可见存在，究竟能稳住多少人；继续留在这里，又会让整个指挥链暴露在同一个坐标上。',
        '窗外是班科夫街，楼下警卫已经换上了防弹衣。你必须决定，明天早上全国会在哪里看到你。'
      ],
      known: [
        '基辅多个区发生战斗，政府区被列为高风险目标。',
        '美方官员表示愿协助转移总统；方案与可靠性尚未确认。',
        '总统公开露面能直接影响军民士气，也会暴露所在位置。'
      ],
      unknown: [
        '俄军渗透小组是否已经进入政府区。',
        '通讯与掩体在持续打击下能维持多久。',
        '盟友的撤离方案是否可靠。'
      ],
      choices: [
        {
          id: 'stay',
          title: '留在班科夫街',
          exclusiveGroup: 'presence',
          ap: 2,
          summary: '在班科夫街录制公开视频，宣布总统与政府仍在基辅。',
          staff: '政治连续性与士气显著上升；安全风险与指挥所暴露风险同步上升。',
          effects: { gov: 8, will: 10, safety: -12, intl: 3, kyiv: 2, pressure: 1 },
          flags: ['stay_kyiv'],
          delayed: [
            {
              delay: 2,
              label: '公开露面后，安保压力持续',
              note: '公开画面暴露了街区与建筑特征，警卫不得不反复转移路线。',
              effects: { safety: -5 }
            }
          ]
        },
        {
          id: 'relocate',
          title: '转移到利沃夫',
          exclusiveGroup: 'presence',
          ap: 2,
          summary: '将总统与核心幕僚转移至西部，保留行政连续性。',
          staff: '个人安全大幅改善；但“总统离开首都”的画面会打击士气，并削弱基辅的政治象征。',
          effects: { safety: 15, gov: 3, will: -11, intl: -4, kyiv: -4 },
          flags: ['relocated'],
          delayed: [
            {
              delay: 3,
              label: '西部指挥链与基辅脱节',
              note: '总统与首都的战地指挥之间出现时差与信息损耗。',
              effects: { army: -3, gov: -2 }
            }
          ]
        },
        {
          id: 'split',
          title: '留在基辅，部分职能西移',
          exclusiveGroup: 'presence',
          ap: 2,
          summary: '总统留在基辅，但把财政、外交与部分后勤职能迁往西部。',
          staff: '兼顾象征与连续性；但两套班子需要磨合，命令传递会变慢。',
          effects: { gov: 5, safety: 3, will: 3, army: -2, reserve: -2, pressure: 1 },
          flags: ['split_command'],
          delayed: [
            {
              delay: 3,
              label: '双轨指挥出现扯皮',
              note: '基辅与西部对同一批物资给出了不同优先级。',
              effects: { gov: -3, army: -2 }
            }
          ]
        },
        {
          id: 'record',
          title: '录制视频，不公布位置',
          ap: 1,
          summary: '发布一段不标注地点的视频，保持“总统仍在乌克兰”的印象。',
          staff: '降低定点打击风险；但模糊信息会被对手与市场解读为虚弱。',
          effects: { will: 4, safety: 7, gov: -4, intl: -2 },
          delayed: [
            {
              delay: 2,
              label: '模糊视频引发猜测',
              note: '外界开始追问总统是否已经离开基辅。',
              effects: { gov: -2, intl: -1 }
            }
          ]
        }
      ]
    },

    {
      id: 'e3',
      date: '2022-02-25',
      dateLabel: '2月25日 · 周五',
      time: '夜间 · 模拟接报',
      title: '霍斯托梅尔',
      kicker: '总参谋部 · 机场方向急报',
      intel: {
        level: '中',
        tone: 'medium',
        note: '机场控制权反复易手，双方战果都无法独立核实。'
      },
      pressureRise: 7,
      situation: [
        '距离基辅约十公里的霍斯托梅尔机场，俄军空降兵在白天突入，试图为后续大型运输机打开跑道。乌军国民卫队与特种部队正在反击。',
        '如果机场被稳固控制，基辅北面会出现一条空中补给与增兵通道；如果反击代价过高，守城兵力会被提前消耗。'
      ],
      known: [
        '机场遭到空降突击，跑道与周边设施受损。',
        '乌军正在组织反击，双方都未完全控制机场。',
        '机场距基辅市区很近，具有象征与军事双重意义。'
      ],
      unknown: [
        '俄军后续运输机是否还能降落。',
        '乌军反击部队的实际兵力与弹药。',
        '机场周边平民伤亡与设施损坏程度。'
      ],
      choices: [
        {
          id: 'counterattack',
          title: '调集精锐，反击机场',
          exclusiveGroup: 'airport',
          ap: 2,
          summary: '集中国民卫队与特种部队，要求在天亮前夺回跑道。',
          staff: '可能挫败空中增兵；但会消耗宝贵的机动兵力，并带来伤亡。',
          effects: { army: 4, kyiv: 7, will: 5, reserve: -5, safety: -2, pressure: 2 },
          delayed: [
            {
              delay: 3,
              label: '反击部队伤亡与弹药消耗',
              note: '机场方向的精锐部队需要休整与补充。',
              effects: { army: -6, reserve: -2 }
            }
          ]
        },
        {
          id: 'block_runway',
          title: '炮击跑道，放弃争夺',
          exclusiveGroup: 'airport',
          ap: 1,
          summary: '用炮兵与工程爆破破坏跑道，阻止运输机使用，主力后撤城区。',
          staff: '以较小代价让机场失去作用；但机场周边会落入敌手，政治上难看。',
          effects: { kyiv: 3, army: 2, will: -3, reserve: -3, intl: -1 },
          delayed: [
            {
              delay: 4,
              label: '机场周边失守，北面压力上升',
              note: '俄军从机场周边向基辅北郊推进。',
              effects: { kyiv: -4, pressure: 2 }
            }
          ]
        },
        {
          id: 'air_defense',
          title: '请求防空与卫星情报',
          ap: 2,
          summary: '向盟友紧急请求防空系统、卫星情报与电子战支持。',
          staff: '提高首都防空与信息优势；但需要时间，且会进一步消耗外交筹码。',
          effects: { intl: 6, army: 2, kyiv: 2, pressure: 1 },
          delayed: [
            {
              delay: 4,
              label: '防空援助部分到位',
              note: '便携式防空与情报共享开始产生效果。',
              effects: { kyiv: 5, intl: 2 }
            }
          ]
        },
        {
          id: 'city_defense',
          title: '放弃机场，转入城市防御',
          exclusiveGroup: 'airport',
          ap: 1,
          summary: '不再争夺机场，把部队撤入城区预设阵地。',
          staff: '保存兵力，缩短防线；但把北面门户让给对手，基辅将更早承受直接压力。',
          effects: { army: 5, kyiv: -6, will: -4, reserve: 2 },
          delayed: [
            {
              delay: 4,
              label: '城区防线提前接敌',
              note: '北郊战斗提前进入城市外围。',
              effects: { kyiv: -3, safety: -2 }
            }
          ]
        }
      ]
    },

    {
      id: 'e4',
      date: '2022-02-26',
      dateLabel: '2月26日 · 周六',
      time: '入夜 · 模拟接报',
      title: '首都之夜',
      kicker: '基辅市军事管理局 · 治安与防御简报',
      intel: {
        level: '高',
        tone: 'high',
        note: '市区事件已确认；渗透小组的数量、目标与背后指挥仍不清楚。'
      },
      pressureRise: 8,
      situation: [
        '基辅实行宵禁。街道上出现检查站、沙袋和反坦克障碍。市长报告，部分居民要求领取武器；安全部门则警告，俄方渗透小组正在寻找政府设施与通信节点。',
        '政府连续性与首都防御，正在争夺同一批人、同一批燃料和同一条指挥链。'
      ],
      known: [
        '基辅实施宵禁，主要路口设置检查站。',
        '俄军侦察与渗透小组在市区活动的报告增加。',
        '领土防卫部队正在组建，但训练与装备参差不齐。'
      ],
      unknown: [
        '市内潜伏小组的数量与目标。',
        '俄军主力距离基辅市中心还有多远。',
        '大规模发放武器后，治安与指挥能否维持。'
      ],
      choices: [
        {
          id: 'curfew',
          title: '延长宵禁，逐区清剿',
          ap: 1,
          summary: '延长宵禁，授权安全部门逐区清查渗透小组与武器窝点。',
          staff: '改善首都治安；但会拖慢物资运输，并加剧居民恐惧。',
          effects: { kyiv: 6, gov: 3, safety: 2, will: -3, reserve: -2, intl: -1 },
          delayed: [
            {
              delay: 4,
              label: '宵禁拖慢后勤',
              note: '检查站排队导致燃料与医疗物资迟到。',
              effects: { reserve: -3, kyiv: -1 }
            }
          ]
        },
        {
          id: 'arm_citizens',
          title: '向市民发放武器',
          ap: 2,
          summary: '扩大领土防卫招募，向通过审查的志愿者发放武器。',
          staff: '迅速膨胀抵抗力量；但武器管控、训练与后勤会立即承压。',
          effects: { army: 5, will: 9, kyiv: 3, reserve: -6, safety: -6, pressure: 2 },
          flags: ['armed_citizens'],
          delayed: [
            {
              delay: 5,
              label: '武器管控出现漏洞',
              note: '部分武器流向不明，基层指挥出现混乱。',
              effects: { gov: -4, army: -3, safety: -2 }
            }
          ]
        },
        {
          id: 'bunker',
          title: '启用地下指挥所',
          ap: 2,
          summary: '启用备用指挥所与独立通信链路，把核心决策节点转入地下。',
          staff: '提高政府与总统的生存能力；但建设与维护会占用稀缺资源，公开活动减少。',
          effects: { gov: 7, safety: 7, army: 2, reserve: -3, will: -2, pressure: 1 },
          delayed: [
            {
              delay: 4,
              label: '备用指挥所开始运转',
              note: '通信冗余改善，但人员长期在地下工作，效率下降。',
              effects: { gov: 3, army: 1 }
            }
          ]
        },
        {
          id: 'unity_gov',
          title: '组建联合战时内阁',
          ap: 1,
          summary: '邀请议会主要反对派进入战时内阁，分担政治责任。',
          staff: '扩大政治基础；但决策会更慢，也会让出部分人事与资源控制权。',
          effects: { gov: 6, will: 2, intl: 2, safety: -1 },
          delayed: [
            {
              delay: 5,
              label: '联合内阁的妥协成本',
              note: '联合政府稳定了政治，但每个决定都需要更多协商。',
              effects: { gov: 2, army: -1, reserve: -1 }
            }
          ]
        },
        {
          id: 'security_rule',
          title: '由安全部门接管地方行政',
          ap: 2,
          summary: '以反渗透为名，把地方行政、检查站与物资分配交由安全部门统一指挥。',
          staff: '首都治安与执行速度上升；但地方政府的权限被架空，政府连续性与国际形象受损。',
          effects: { kyiv: 7, safety: 4, gov: -9, will: -5, intl: -3, pressure: 2 },
          flags: ['security_rule'],
          delayed: [
            {
              delay: 3,
              label: '地方行政被架空',
              note: '市长与州政府失去权限，命令链重复，基层开始消极执行。',
              effects: { gov: -5, reserve: -2, will: -2 }
            }
          ]
        }
      ]
    },

    {
      id: 'e5',
      date: '2022-02-27',
      dateLabel: '2月27日 · 周日',
      time: '傍晚 · 模拟接报',
      title: '两条战线',
      kicker: '总参谋部 · 南部与东部战况',
      intel: {
        level: '低',
        tone: 'low',
        note: '南线通讯中断，部分报告来自地方官员；俄军真实意图无法确认。'
      },
      pressureRise: 12,
      situation: [
        '南线，赫尔松方向的压力持续上升，地方部队报告俄军正在绕过据点。东线，哈尔科夫遭到持续炮击，铁路与电力设施受损。',
        '总参谋部请求你明确优先级：南部、东部，还是基辅。资源只够勉强支撑两个方向。'
      ],
      known: [
        '南线俄军从克里米亚方向继续向北推进。',
        '哈尔科夫遭到持续炮击，城市基础设施受损。',
        '基辅北面与东北面仍有俄军部队活动。'
      ],
      unknown: [
        '赫尔松能否守住，以及地方防御是否已经瓦解。',
        '俄军是否会在南线转向敖德萨。',
        '东部战线的弹药还能支撑多久。'
      ],
      choices: [
        {
          id: 'south',
          title: '优先增援南部',
          ap: 2,
          summary: '把预备队与反坦克武器优先调往赫尔松方向。',
          staff: '可能迟滞南线推进；但基辅与东线会立刻感到兵力不足。',
          effects: { army: 4, kyiv: -3, reserve: -4, intl: 1, pressure: 1 },
          delayed: [
            {
              delay: 4,
              label: '南线增援抵达',
              note: '增援稳住了部分据点，但未能改变整体态势。',
              effects: { army: 3, kyiv: 1 }
            }
          ]
        },
        {
          id: 'east',
          title: '死守东部，拒绝撤退',
          ap: 2,
          summary: '要求东部战区不得放弃主要城市，同时追加弹药。',
          staff: '维持东部政治象征；但部队会在消耗战中损失组织度。',
          effects: { will: 6, army: -7, reserve: -5, safety: -1, pressure: 2 },
          delayed: [
            {
              delay: 4,
              label: '东部消耗战',
              note: '守住了城市，但骨干老兵与弹药消耗严重。',
              effects: { army: -4, will: 2 }
            }
          ]
        },
        {
          id: 'delegate',
          title: '授权战区自行撤退',
          ap: 1,
          summary: '允许战区指挥官在必要时放弃不利阵地，保存兵力。',
          staff: '提高军队生存能力；但“撤退”会被国内舆论视为失败。',
          effects: { army: 6, will: -6, gov: -2, intl: -2 },
          delayed: [
            {
              delay: 4,
              label: '机动防御见效',
              note: '部队避免了被包围，但失去了部分城镇。',
              effects: { army: 2, kyiv: -1 }
            }
          ]
        },
        {
          id: 'firepower',
          title: '要求远程火力与弹药',
          ap: 1,
          summary: '再次向盟友施压，要求远程火力、弹药与情报支持。',
          staff: '可能改善战场火力；但援助需要时间，且会进一步消耗外交资本。',
          effects: { intl: 4, army: 1, pressure: 1 },
          delayed: [
            {
              delay: 4,
              label: '远程火力与弹药抵达',
              note: '部分补给抵达，暂时缓解了弹药短缺。',
              effects: { army: 5, intl: 1 }
            }
          ]
        }
      ]
    },

    {
      id: 'e6',
      date: '2022-02-28',
      dateLabel: '2月28日 · 周一',
      time: '上午 · 模拟接报',
      title: '基辅的请求',
      kicker: '外交部 · 盟友通话纪要',
      intel: {
        level: '中',
        tone: 'medium',
        note: '各方公开表态已知；武器交付时间与禁飞区立场仍不明朗。'
      },
      pressureRise: 9,
      situation: [
        '第四天。欧盟与北约国家的外长们相继表态，但武器交付、禁飞区与制裁力度仍停留在争论中。基辅需要把“同情”转换成可执行的支持。',
        '同时，白俄罗斯边境的谈判渠道已经打开。接受谈判可能争取时间，也可能被解读为软弱。'
      ],
      known: [
        '多国宣布制裁，但范围与执行时间不一。',
        '乌方已正式提交加入欧盟的申请。',
        '白俄罗斯边境的谈判渠道已建立。'
      ],
      unknown: [
        '禁飞区是否会被接受。',
        '重型武器交付需要多久。',
        '谈判是否会成为俄方的战术掩护。'
      ],
      choices: [
        {
          id: 'eu',
          title: '签署欧盟申请',
          ap: 1,
          summary: '正式签署加入欧盟申请，并推动快速审议。',
          staff: '提升国际支持与国内士气；但入盟进程漫长，不能替代眼前的安全援助。',
          effects: { intl: 8, will: 4, gov: 2, reserve: -1 },
          delayed: [
            {
              delay: 1,
              label: '欧盟申请带来政治声援',
              note: '申请获得象征性支持，但正式程序仍需数年。',
              effects: { intl: 4, will: 2 }
            }
          ]
        },
        {
          id: 'weapons',
          title: '提交武器清单，要求禁飞区',
          ap: 2,
          summary: '向盟友提交重型武器清单，同时公开要求设立禁飞区。',
          staff: '把安全需求摆上桌面；但禁飞区可能被拒绝，公开施压也会消耗关系。',
          effects: { intl: 4, army: 3, safety: -4, pressure: 4 },
          delayed: [
            {
              delay: 1,
              label: '禁飞区请求被拒绝',
              note: '盟友担心升级，拒绝设立禁飞区；武器交付仍在讨论。',
              effects: { intl: -3, will: -3 }
            }
          ]
        },
        {
          id: 'talks',
          title: '接受谈判，争取时间',
          exclusiveGroup: 'negotiation',
          ap: 2,
          summary: '派代表团参加边境谈判，同时继续防御。',
          staff: '可能争取时间与舆论空间；但国内强硬派会质疑，士气也会波动。',
          effects: { pressure: -5, will: -5, gov: 3, intl: -2, safety: 2 },
          flags: ['talks'],
          delayed: [
            {
              delay: 1,
              label: '谈判未取得停火',
              note: '谈判未能停止战斗，反而让部分盟友选择观望。',
              effects: { will: -3, intl: -2, pressure: 2 }
            }
          ]
        },
        {
          id: 'refuse',
          title: '拒绝谈判，强调领土完整',
          exclusiveGroup: 'negotiation',
          ap: 1,
          summary: '公开拒绝以领土让步为前提的谈判，要求盟友加大援助。',
          staff: '凝聚国内意志；但会关闭短期外交出口，并刺激俄方升级。',
          effects: { will: 7, intl: 2, pressure: 3, safety: -3 },
          delayed: [
            {
              delay: 1,
              label: '强硬立场获得部分支持',
              note: '部分盟友公开支持乌方立场，但军事压力没有下降。',
              effects: { intl: 3, will: 2 }
            }
          ]
        }
      ]
    },

    {
      id: 'e7',
      date: '2022-03-01',
      dateLabel: '3月1日—2日 · 周二至周三',
      time: '深夜 · 模拟接报',
      title: '第七夜',
      kicker: '政府协调会议 · 最后一份简报',
      intel: {
        level: '中',
        tone: 'medium',
        note: '后勤数据来自各部门汇总，彼此矛盾；俄军下一轮突击方向不明。'
      },
      pressureRise: 11,
      situation: [
        '第六天夜里，铁路调度、燃料配给、医疗物资和预备队补充同时告急。政府内部开始互相指责。',
        '总参谋部说，接下来48小时决定基辅能不能撑住；能源部说，储备只够几天；外交部说，盟友在等待一个“还能控制局势”的信号。',
        '你只有一次机会，把有限的注意力放在最关键的环节。'
      ],
      known: [
        '后勤与政府协调已经成为主要瓶颈。',
        '基辅外围战斗持续，补给线受到威胁。',
        '盟友在观察乌方政府的运转能力。'
      ],
      unknown: [
        '俄军下一轮主要突击方向。',
        '战略储备还能支撑多久。',
        '政府内部的不满是否会公开化。'
      ],
      choices: [
        {
          id: 'logistics',
          title: '建立统一后勤调度',
          ap: 2,
          summary: '设立跨部门后勤中心，统一铁路、燃料与弹药优先级。',
          staff: '显著改善补给与协调；但会触动部门利益，短期摩擦上升。',
          effects: { reserve: 10, army: 5, gov: 5, intl: 1, will: -1 }
        },
        {
          id: 'evacuate',
          title: '保障平民撤离通道',
          ap: 1,
          summary: '优先开放人道走廊，保障平民撤离与医疗物资进入。',
          staff: '提升社会意志与国际形象；但会占用运力，并削弱前线补给。',
          effects: { kyiv: 4, will: 6, intl: 4, reserve: -5, army: -2 }
        },
        {
          id: 'requisition',
          title: '征用民间燃料与车辆',
          ap: 1,
          summary: '征用民间燃料、车辆与仓库，优先保障军队与政府。',
          staff: '快速补充储备；但会激化社会不满，损害政府信誉。',
          effects: { reserve: 8, army: 3, will: -6, gov: -2, intl: -1, pressure: 1 }
        },
        {
          id: 'speech',
          title: '全国讲话，拒绝投降',
          ap: 1,
          summary: '发表全国讲话，承认困难，但明确不会投降。',
          staff: '稳定意志与政治连续性；但公开立场会提高个人安全风险，并刺激对手。',
          effects: { will: 5, gov: 3, safety: -5, pressure: 3, intl: 1 }
        }
      ]
    }
  ];

  root.LZS_EVENTS = EVENTS;
  root.LZS_META = {
    title: '小泽模拟器',
    subtitle: 'Little Zelensky Simulator',
    tagline: '你能顶住几天？',
    version: '0.5.0',
    startPressure: 12,
    apPerRound: 3,
    initialStats: {
      gov: 54,
      army: 48,
      kyiv: 52,
      will: 60,
      intl: 42,
      reserve: 52,
      safety: 58
    },
    disclaimer:
      '本作是历史情景模拟，不是纪实作品，也不是对真实人物的评分。事件时间线参考公开报道；人物对话、文电与幕僚评估为合成文本。全部数值均为模拟设计参数，不代表真实统计、真实决策效果或真实历史因果。'
  };
})(typeof window !== 'undefined' ? window : globalThis);
