/*
 * 《小泽模拟器》v1.2.0 · 历史回声《后来，战争走到了这里》
 *
 * 这是战役结束之后的历史回顾，不属于 2022 年 2—4 月玩家当时可知的信息，
 * 也不代表本局玩家的决定导致了这些事件。
 *
 * 每条记录分四层写明：
 *   happened  当时发生的事情（事发时间）
 *   confirmed 后来被更多来源确认的部分
 *   disputed  仍然存在争议、或无法确认的部分
 *   sources   主要来源（名称 + 链接 + 报道时间）
 *
 * 历史纪律：不写直接引语、不编部队番号与兵力、不把当事方说法写成已证实事实、
 * 不把媒体推测写成确认结论。
 */
(function (root, factory) {
  const api = factory();
  root.LZS_AFTERWARD = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
}(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const VERSION = '1.2.0';
  const TITLE = '后来，战争走到了这里';
  const KICKER = '战役之后 · 历史回顾';
  const DISCLAIMER = '这是战役结束后的历史回顾，不属于 2022 年 2—4 月玩家当时可知的信息，也不代表本局玩家的决定导致了这些事件。';

  const STATUS = {
    confirmed: '多方来源一致',
    claimed: '当事方说法',
    disputed: '存在争议',
    evolving: '仍在发展'
  };

  const RECORDS = [
    {
      id: 'aw_moscow_drone',
      order: 1,
      date: '2023-05-30',
      dateLabel: '2023 年 5 月 30 日',
      era: '战争第二年',
      title: '无人机出现在莫斯科上空',
      lead: '开战第十五个月，莫斯科的居民区第一次在白天看到了战争的样子。',
      happened: '2023 年 5 月 30 日，莫斯科遭到无人机袭击，多栋居民楼受损。俄罗斯国防部称击落或压制了 8 架无人机，并称其中有 3 架在偏离目标后被击落。这一说法来自俄方，属于当事方通报。',
      confirmed: '多家国际媒体当日与次日报道了莫斯科市区建筑受损、居民被疏散的情况，与俄方通报在「发生了袭击、有建筑受损」这一点上一致。袭击使用的是无人机，没有造成大规模伤亡。',
      disputed: '乌克兰方面否认直接参与。乌克兰总统顾问波多利亚克当日表示基辅与这次袭击没有直接关系，并预测类似行动会增加。谁具体实施了这次袭击、用什么方式组织，至今没有可独立核实的结论。「乌克兰政府下令」不能当作已证实的事实。',
      why: '开战之初，多数判断认为战火会被限制在乌克兰境内。一年多以后，俄罗斯首都的居民区成了被打击的对象；而这类行动的性质、责任和授权关系，恰恰是最难说清的部分。读到这一条时，值得留意的是「谁做的」和「谁说的」之间的距离。',
      sources: [
        { name: 'Investing.com（本文指定参考）', url: 'https://www.investing.com/news/commodities-news/ukraine-air-defences-battle-fresh-wave-of-russian-attacks-3093254', date: '2023-05-30' },
        { name: 'TASS：Kiev says unrelated to Tuesday\'s drone attacks on Moscow', url: 'https://tass.com/emergencies/1624939', date: '2023-05-30' },
        { name: 'RNZ：Ukraine denies involvement in Moscow drone strike, predicts more attacks', url: 'https://www.rnz.co.nz/news/world/491019/ukraine-denies-involvement-in-moscow-drone-strike-predicts-more-attacks', date: '2023-05-30' }
      ],
      status: 'disputed'
    },
    {
      id: 'aw_belgorod',
      order: 2,
      date: '2023-05-22',
      dateLabel: '2023 年 5 月 22—23 日',
      era: '战争第二年',
      title: '别尔哥罗德：越境的那两天',
      lead: '战斗第一次被明确报道发生在俄罗斯境内的村庄里，参与者自称是俄罗斯人。',
      happened: '2023 年 5 月 22 日，武装人员从乌克兰方向进入俄罗斯别尔哥罗德州边境地区，与俄方安全力量交火，部分村庄居民被疏散。两个自称由俄罗斯公民组成的组织——「俄罗斯志愿军团」与「自由俄罗斯军团」——宣称参与了行动。',
      confirmed: 'BBC 等媒体现场报道了别尔哥罗德州边境村庄的疏散与交火，俄方宣布实施「反恐行动」状态，并称击退了越境人员、公布了己方与对方损失。多家媒体确认这两个组织公开宣称对行动负责。',
      disputed: '乌克兰方面否认直接参与，称这些武装人员是俄罗斯公民，属于俄罗斯内部事务。这一点无法独立核实：两个组织的人员构成、与乌克兰军方或情报部门的关系，公开资料只能给出不同说法，没有一致结论。组织自述不等于独立证实的事实。俄方与乌方公布的损失数字差距很大，均无法独立核实。',
      why: '这一条最容易读成非黑即白：要么是「乌克兰的代理人行动」，要么是「俄罗斯人自己的起义」。公开资料不足以支持任何一种确定结论。对读这份档案的人来说，它更像一个提醒——战争中很多事件的「谁在指挥」是查不清的，而当事各方都有把话说满的动机。',
      sources: [
        { name: 'Investing.com（本文指定参考）', url: 'https://www.investing.com/news/world-news/factboxwho-are-the-armed-fighters-in-russias-belgorod-region-3098271', date: '2023-05-23' },
        { name: 'BBC：Belgorod raid: Insurgents defeated after rare cross-border incursion', url: 'https://www.bbc.co.uk/news/world-europe-65683374', date: '2023-05-23' },
        { name: 'The New York Times（当日直播报道）', url: 'https://www.nytimes.com/live/2023/05/24/world/russia-ukraine-news/xi-vows-stronger-ties-with-the-kremlin-during-a-meeting-with-the-russian-prime-minister', date: '2023-05-24' }
      ],
      status: 'disputed'
    },
    {
      id: 'aw_wagner',
      order: 3,
      date: '2023-06-23',
      dateLabel: '2023 年 6 月 23—24 日',
      era: '战争第二年',
      title: '三十六小时：瓦格纳向莫斯科开进又停下',
      lead: '一支在乌克兰作战的俄罗斯武装力量，掉头走向了自己的首都。',
      happened: '2023 年 6 月 23 日夜，瓦格纳集团负责人普里戈任宣布其部队进入俄罗斯境内，随后瓦格纳人员控制了顿河畔罗斯托夫的南部军区总部及周边街区。6 月 24 日，一支车队沿公路向莫斯科方向推进，中途未遭遇有效抵抗。当晚推进停止，双方宣布达成安排，瓦格纳人员撤离，针对参与者的刑事案件被撤销。',
      confirmed: '车队调动、罗斯托夫被控制、推进中途停止、事件在不到 48 小时内结束，这些在当日多国媒体与后续研究报告中一致。美国国会研究服务局在事件发生数日后的报告中，把它描述为俄罗斯军事指挥体系与政治权威之间矛盾的公开化。',
      disputed: '达成的具体安排内容、各方当时的承诺，没有完整公开的一手材料，外界只能依据有限声明与后续人事变动推断。事件对俄罗斯政治体系的长期影响不宜夸大：政权没有因此崩溃，前线也没有因此瓦解；但「指挥体系内部可以出现公开对抗」这一点，已经摆在明面上。',
      why: '2022 年 2 月时，没有人会把这支武装力量想象成能开进俄罗斯本土的对象。它说明战争会改变参与者本身：为战争组建的力量，未必只对战争生效。读到这里，可以回想一下你在战役里对「谁听谁的」这个问题做过的判断。',
      sources: [
        { name: 'Congressional Research Service（本文指定参考，IN12186）', url: 'https://www.everycrsreport.com/files/2023-06-28_IN12186_5a5e2a03d70cbdb3a10f017e08269a8f9d431997.html', date: '2023-06-28' },
        { name: 'The New York Times（6 月 24 日直播报道）', url: 'https://www.nytimes.com/live/2023/06/24/world/russia-wagner-prigozhin-ukraine-news', date: '2023-06-24' },
        { name: 'The Daily（NYT 播客：A 36-Hour Rebellion in Russia）', url: 'https://www.nytimes.com/2023/06/26/podcasts/the-daily/russia-coup-putin.html', date: '2023-06-26' }
      ],
      status: 'confirmed'
    },
    {
      id: 'aw_kursk',
      order: 4,
      date: '2024-08-06',
      dateLabel: '2024 年 8 月 6 日起',
      era: '战争第三年',
      title: '库尔斯克：战火烧到另一个州',
      lead: '这一次是乌克兰部队越境进入俄罗斯境内，并且待了下来。',
      happened: '2024 年 8 月 6 日，乌克兰部队从苏梅方向越境进入俄罗斯库尔斯克州，随后在州内推进并控制了一部分居民点。俄方宣布库尔斯克州进入紧急状态并组织撤离，双方在州内持续交战。',
      confirmed: '多家国际媒体与开源观察确认了越境的事实与初期的推进范围；乌方称其目的是牵制俄军在其他方向的兵力，并在未来的谈判中保有一个筹码。这一目的表述来自乌方，属于当事方说法。',
      disputed: '双方公布的控制面积、对方损失与战果差距很大，且随时间反复变化，均无法独立核实。这次行动不是单向的成功叙事：此后俄方持续反攻，乌方控制区逐步缩小，到 2025 年年初已发生明显变化。任何「一次越境就改变了战争走向」的说法都缺乏依据。',
      why: '把这一条与 2022 年 2—4 月放在一起看，会得到一个不太舒服的结论：同一片边境，两年多里被两个方向越过；「谁在进攻、谁在防守」在时间轴上会互换。它也在提醒：任何战果都要看后续怎么演变，而不是只看最初几天。',
      sources: [
        { name: 'Reuters（本文指定参考，经 Daily Mail 转载的全文）', url: 'https://www.dailymail.com/wires/reuters/article-14489843/TIMELINE-Ukraines-attack-Russias-fightback-Kursk.html', date: '2025-03-12' },
        { name: 'Reuters（原文链接，需在浏览器打开）', url: 'https://www.reuters.com/world/europe/ukraines-attack-russias-fightback-kursk-2025-03-12/', date: '2025-03-12' },
        { name: 'The Telegraph India：Timeline: Ukraine\'s offensive and Russia\'s response in Kursk', url: 'https://www.telegraphindia.com/gallery/timeline-ukraines-offensive-and-russias-response-in-kursk-what-both-sides-claim-photogallery-prnt/cid/2088536', date: '2024-08' }
      ],
      status: 'evolving'
    }
  ];

  const byIdMap = {};
  RECORDS.forEach(function (record) { byIdMap[record.id] = record; });

  function list() {
    return RECORDS.slice().sort(function (a, b) {
      if (a.date === b.date) return a.order - b.order;
      return a.date < b.date ? -1 : 1;
    });
  }

  /* 解锁条件与推演室一致：完整打完一次战役。 */
  function unlockState() {
    const L = (typeof window !== 'undefined' ? window : globalThis).LZS;
    if (!L || typeof L.getRecords !== 'function') return { unlocked: false, completed: 0, reason: '先完整打完一次 2022 · 基辅防御战役，这份档案才会打开。' };
    let completed = 0;
    try {
      const store = L.getRecords() || {};
      completed = (store.runs || []).filter(function (run) { return run.scenario === 'campaign'; }).length;
    } catch (error) {
      completed = 0;
    }
    return {
      unlocked: completed > 0,
      completed: completed,
      reason: completed > 0 ? '' : '先完整打完一次 2022 · 基辅防御战役，这份档案才会打开。'
    };
  }

  /* 历史纪律自检：内容里不得出现属于战役时间段之后才会被使用的说法（供测试调用）。 */
  const LEAK_TERMS = ['2023', '2024', '2025', '库尔斯克', '瓦格纳', '别尔哥罗德', '莫斯科'];

  return {
    version: VERSION,
    title: TITLE,
    kicker: KICKER,
    disclaimer: DISCLAIMER,
    status: STATUS,
    records: RECORDS,
    count: RECORDS.length,
    byId: function (id) { return byIdMap[id] || null; },
    list: list,
    unlockState: unlockState,
    leakTerms: LEAK_TERMS
  };
}));
