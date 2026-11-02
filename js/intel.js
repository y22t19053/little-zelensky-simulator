/*
 * 总统情报桌与机构角色（模拟抽象，不是真实机构命令记录）
 * 这里的来源、机构与角色均为游戏设计，不冒充真实文件或真实官员发言。
 */
(function (root) {
  'use strict';

  const CATEGORIES = [
    {
      id: 'military', label: '军事情况', kicker: 'MILITARY', agency: 'general_staff',
      source: '总参谋部态势室 / 防空警报汇总', focus: '战线、机场、首都防空与机动预备队',
      stats: ['army', 'kyiv'], confidenceNote: '战术级位置与敌军意图通常滞后；已确认与推断分开阅读。',
      inquiry: '要求总参说明哪个方向最可能在本夜失去协同，以及需要总统先签哪一项授权。'
    },
    {
      id: 'governance', label: '政府连续性', kicker: 'GOVERNMENT', agency: 'office',
      source: '总统办公室行政组 / 部长内阁秘书处', focus: '命令传递、授权链与备用设施',
      stats: ['gov'], confidenceNote: '文件能送达不等于能执行；各地行政能力差异很大。',
      inquiry: '要求行政组核对哪些部委仍在同一指挥链上，哪些命令已经出现重复签发。'
    },
    {
      id: 'local', label: '地方情况', kicker: 'REGIONS', agency: 'interior',
      source: '基辅市军政管理局 / 地区联络席', focus: '城市治理、宵禁、地方执行与民众反馈',
      stats: ['kyiv', 'will'], confidenceNote: '地方报告往往晚于现场数小时，且可能重复上级口径。',
      inquiry: '要求地方联络席直接说明哪些区已无法执行宵禁，以及地方需要中央提供什么。'
    },
    {
      id: 'diplomatic', label: '外交信息', kicker: 'DIPLOMATIC', agency: 'foreign',
      source: '外交部危机中心 / 盟友联络线', focus: '军援、制裁、政治支持与谈判渠道',
      stats: ['intl'], confidenceNote: '公开承诺、内部评估和实际交付是三件不同的事。',
      inquiry: '要求外交部区分已经交付、已经承诺和仍在评估的援助，并列出最早到达时间。'
    },
    {
      id: 'logistics', label: '后勤与资源', kicker: 'LOGISTICS', agency: 'logistics',
      source: '后勤联合参谋组 / 能源与交通席', focus: '燃料、弹药、医疗、铁路与储备分配',
      stats: ['reserve'], confidenceNote: '库存数字可能重复计算；运力比库存更容易先出问题。',
      inquiry: '要求后勤组核对最紧缺的三类物资，并说明哪些储备已被重复承诺给不同方向。'
    },
    {
      id: 'society', label: '公共社会', kicker: 'SOCIETY', agency: 'communications',
      source: '信息与公共沟通组 / 地方社群反馈', focus: '抵抗意愿、谣言、动员信任与公共沟通',
      stats: ['will'], confidenceNote: '舆情信号变化快，不能把单条社交媒体消息当成全国情绪。',
      inquiry: '要求沟通组说明谣言正在改变哪些行为，以及总统公开讲话最可能安抚或激怒谁。'
    }
  ];

  const AGENCIES = [
    { id: 'office', label: '总统办公室', short: '办公', focus: '授权、政治协调与政府连续性', capacity: 3 },
    { id: 'general_staff', label: '总参谋部', short: '总参', focus: '作战、防空、机动预备队与机场', capacity: 3 },
    { id: 'interior', label: '内务与地方系统', short: '内务', focus: '宵禁、城市秩序、地方执行与安保', capacity: 3 },
    { id: 'foreign', label: '外交系统', short: '外交', focus: '军援、制裁、盟友沟通与谈判渠道', capacity: 3 },
    { id: 'logistics', label: '后勤与资源系统', short: '后勤', focus: '燃料、弹药、医疗、铁路与储备', capacity: 3 },
    { id: 'communications', label: '公共沟通系统', short: '沟通', focus: '公开信息、社会信任与谣言处置', capacity: 3 }
  ];

  const COMMUNICATIONS = [
    { id: 'internal', label: '对内协调', note: '向部长内阁与地方主官说明今日优先级。', effects: { gov: 2 }, agency: 'office' },
    { id: 'public', label: '公开讲话', note: '用有限篇幅说明局势与动员要求。', effects: { will: 3 }, agency: 'communications' },
    { id: 'allies', label: '盟友通话', note: '要求把口头支持转为可核对的交付。', effects: { intl: 3 }, agency: 'foreign' },
    { id: 'local', label: '地方通话', note: '直接听取地方执行困难，避免命令空转。', effects: { kyiv: 2 }, agency: 'interior' }
  ];

  function getCategory(id) {
    return CATEGORIES.filter(function (item) { return item.id === id; })[0] || null;
  }

  function getAgency(id) {
    return AGENCIES.filter(function (item) { return item.id === id; })[0] || null;
  }

  root.LZS_INTEL = {
    categories: CATEGORIES,
    agencies: AGENCIES,
    communications: COMMUNICATIONS,
    getCategory: getCategory,
    getAgency: getAgency
  };
})(typeof window !== 'undefined' ? window : globalThis);
