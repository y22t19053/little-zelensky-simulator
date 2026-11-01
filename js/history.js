/*
 * 小泽模拟器 · 结局后历史复盘
 * 事实、当时认知、后来确认与分析分栏保存；不参与游戏规则。
 */
(function (root) {
  'use strict';

  const HISTORY = {
    title: '结局后历史复盘',
    intro: '以下资料在本局结束后才开放。它用于比较信息环境与决策处境，不用于证明某一条游戏路线更正确。',
    timeline: [
      {
        date: '2022-02-24', label: '2月24日', title: '多方向进攻与全国动员',
        fact: '俄罗斯从多个方向对乌克兰发动大规模军事行动。乌克兰宣布戒严并实施总动员；基辅西北的霍斯托梅尔机场发生激烈争夺。',
        knownThen: '开战事实、爆炸与边境报告可以确认；各地兵力、机场控制权和进攻目标仍被相互矛盾的战报覆盖。',
        confirmedLater: '首日战斗已经显示，这不是一场只针对边境地区的有限行动。机场跑道和周边设施在争夺中受损。',
        disputed: '首日各时段的机场控制权、双方伤亡和击落战果，公开报道长期存在口径差异。',
        significance: '政治中心必须在情报不完整时同时处理首都防御、政府转移方案和社会动员。'
      },
      {
        date: '2022-02-25', label: '2月25日', title: '基辅外围战斗与撤离方案',
        fact: '基辅外围及市区出现战斗。多家媒体报道，美方官员表示愿协助乌克兰总统撤离；乌方政府继续对外发布坚守信息。',
        knownThen: '首都在承压，政府所在地面临安全风险。协助转移的具体条件与可靠性并没有完整公开。',
        confirmedLater: '总统和核心政府在本阶段留在基辅，成为政府连续性和对外传播的重要因素。',
        disputed: '广为流传的“我需要的是弹药，不是搭车”并非可核实的逐字记录；不应把后来的传播文本当作已证实原话。',
        significance: '留下与转移同时包含政治象征、个人安全和指挥连续性，不是单纯的勇敢或怯懦。'
      },
      {
        date: '2022-02-26', label: '2月26日', title: '首都防御与制裁升级',
        fact: '基辅实施更严格宵禁，城市防御继续。美国、欧盟等宣布把部分俄罗斯银行排除出 SWIFT 的共同措施；德国对致命武器援助的政策出现重大转变。',
        knownThen: '制裁和援助承诺已公开，但具体清单、交付路径与生效时间仍需落实。城市中的破坏小组报告真假混杂。',
        confirmedLater: '外部金融制裁和武器援助在此后数日扩大，但没有任何一项承诺能立即改变当夜的前线态势。',
        disputed: '戒严期间关于破坏小组和平民伤亡的个别视频与叙述，事后仍难以逐条独立核验。',
        significance: '外交成果有延迟；城市安全措施也会制造误伤、协调和行政成本。'
      },
      {
        date: '2022-02-27', label: '2月27日', title: '哈尔科夫战斗与谈判安排',
        fact: '哈尔科夫等地发生激烈战斗。俄乌双方开始就谈判地点和条件进行接触；欧盟进一步关闭对俄空域并扩大援助安排。',
        knownThen: '谈判渠道存在，但停火并无保证。南线、东线和基辅方向的态势不能由同一份战报概括。',
        confirmedLater: '首轮会谈随后在白俄罗斯边境附近举行，没有达成停火。外部支持继续增加。',
        disputed: '各方向控制区的即时地图多依赖交战方通报，不能视为同一时间点的精确事实。',
        significance: '谈判可以争取外交空间，也可能改变盟友和国内对局势的判断；它不会自动降低军事压力。'
      },
      {
        date: '2022-02-28', label: '2月28日', title: '首轮谈判与欧盟申请',
        fact: '俄乌代表团举行首轮会谈，未达成停火。乌克兰总统签署加入欧盟的申请；联合国大会紧急特别会议召开。',
        knownThen: '申请是一项正式政治行动，谈判渠道仍然存在；武器、禁飞区和入盟程序是三个不同议题。',
        confirmedLater: '欧盟在同年6月给予乌克兰候选国地位。2月28日的签署不是入盟承诺，更不是立即获得成员资格。',
        disputed: '会谈各方对目标与进展的公开表述不同，不能把“参加谈判”直接等同于任何一方接受对方条件。',
        significance: '短期谈判、长期制度申请和即时军事援助具有不同时间尺度，混为一谈会高估决策的即时效果。'
      },
      {
        date: '2022-03-01', label: '3月1日', title: '城市受击与外交动员',
        fact: '哈尔科夫行政楼遭袭，基辅电视塔附近也遭到打击。乌克兰总统向欧洲议会发表视频讲话；北约拒绝设立禁飞区的立场进一步明确。',
        knownThen: '城市基础设施和行政中心面临直接风险，外部政治声援增强；军事升级边界仍是援助决策的约束。',
        confirmedLater: '本阶段没有出现北约直接设立禁飞区的安排，援助仍以武器、资金、情报和制裁为主。',
        disputed: '袭击责任、目标和伤亡数字在即时报道中并不总是同步更新，应保留来源与时间戳。',
        significance: '国际支持可以上升，同时军事风险继续恶化；不同指标不应相互替代。'
      },
      {
        date: '2022-03-02', label: '3月2日', title: '联合国表决与后勤压力',
        fact: '联合国大会以141票赞成、5票反对、35票弃权通过 ES-11/1 决议，要求俄罗斯立即、完全、无条件撤军。难民外流和城市补给压力持续扩大。',
        knownThen: '国际政治支持、南部城市战况和难民数量都在快速变化；地方控制声明需要谨慎核实。',
        confirmedLater: '基辅在本阶段仍由乌方控制。赫尔松等地方控制信息经历了不同时间点的确认；UNHCR 的跨境人数随后继续更新，3月初突破百万。',
        disputed: '单日难民数、城市完全控制时间和双方推进范围会随统计截止时刻与来源而变化。',
        significance: '外交多数票具有政治意义，但不能直接补充燃料、弹药、床位或铁路运力。'
      }
    ],
    reflections: [
      '真实决策者面对的不是一张完整选项表，也不知道哪个后果会在何时兑现。游戏把部分处境压缩成可操作的参数，必然遗漏大量制度、个人与战场细节。',
      '玩家的选择不等于真实人物当时的全部选择。真实历史中的政府、军队、地方机构、志愿者和外国政府也并非由一个人控制。',
      '比较路线的意义，是看见注意力稀缺与系统牵制，而不是给真实人物打分。历史事实、史料争议和模拟分析必须保持边界。'
    ],
    sources: [
      { institution: '联合国新闻', title: 'UN chief appeals for peace as Russia launches military offensive', date: '2022-02-24', url: 'https://news.un.org/en/story/2022/02/1112732', accessed: '2026-11-02', supports: '开战初期的多方向进攻、联合国回应与即时国际反应。' },
      { institution: '联合国新闻', title: 'Ukraine: General Assembly to hold rare emergency special session', date: '2022-02-27', url: 'https://news.un.org/en/story/2022/02/1112822', accessed: '2026-11-02', supports: '紧急特别会议的背景与当时战场、人道局势。' },
      { institution: '联合国新闻', title: 'General Assembly adopts resolution demanding Russian withdrawal', date: '2022-03-02', url: 'https://news.un.org/en/story/2022/02/1112912', accessed: '2026-11-02', supports: '3月2日联合国大会表决与政治影响。' },
      { institution: '联合国大会', title: 'A/RES/ES-11/1 · Aggression against Ukraine', date: '2022-03-02', url: 'https://docs.un.org/en/A/RES/ES-11/1', accessed: '2026-11-02', supports: '决议正文；表决票数与决议通过日期。' },
      { institution: '北约', title: 'NATO’s response to Russia’s invasion of Ukraine', date: '持续更新', url: 'https://www.nato.int/cps/en/natohq/topics_192648.htm', accessed: '2026-11-02', supports: '北约援助、升级边界与不直接参战立场；用于区分政治支持和直接军事介入。' },
      { institution: '欧盟委员会', title: 'Ukraine: EU agrees to exclude key Russian banks from SWIFT', date: '2022-03-02', url: 'https://ec.europa.eu/commission/presscorner/detail/en/ip_22_1308', accessed: '2026-11-02', supports: 'SWIFT 措施的正式内容与生效范围；不把宣布时间等同于全部执行完成。' },
      { institution: '欧洲理事会', title: 'European Council conclusions, 23 June 2022', date: '2022-06-23', url: 'https://www.consilium.europa.eu/en/press/press-releases/2022/06/23/european-council-conclusions-23-june-2022/', accessed: '2026-11-02', supports: '后来授予候选国地位的时间；用于纠正把2月申请写成入盟承诺的误读。' },
      { institution: 'UNHCR', title: 'Ukraine Refugee Situation · Operational Data Portal', date: '持续更新', url: 'https://data.unhcr.org/en/situations/ukraine', accessed: '2026-11-02', supports: '跨境人数随日期和口径更新；用于说明3月初难民规模，不伪造逐日精确值。' }
    ]
  };

  root.LZS_HISTORY = HISTORY;
})(typeof window !== 'undefined' ? window : globalThis);
