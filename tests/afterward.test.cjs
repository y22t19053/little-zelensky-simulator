/*
 * 《小泽模拟器》v1.2.0 · 战后历史回声《后来，战争走到了这里》测试
 * 覆盖：四条记录的结构、日期与来源、争议标注、免责声明、解锁门槛，
 * 以及「后来的历史不得泄露进 2022 年战役信息流」这一条硬约束。
 */
'use strict';
const assert = require('assert');

const store = new Map();
globalThis.window = globalThis;
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear()
};

require('../js/events.js');
require('../js/intel.js');
require('../js/strategy.js');
require('../js/campaign.js');
require('../js/dynamic.js');
require('../js/storylines.js');
require('../js/afterward.js');
require('../js/engine.js');

const L = globalThis.LZS;
const ST = globalThis.LZS_STORYLINES;
const AW = globalThis.LZS_AFTERWARD;

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('  ✓ ' + name);
  } catch (error) {
    failed += 1;
    console.log('  ✗ ' + name);
    console.log('    ' + (error && error.message));
  }
}

function playCampaign(seed) {
  const state = L.createGame({ scenario: 'campaign', seed: seed || 20220224 });
  let guard = 0;
  while (!state.ending && guard++ < 40) {
    const choices = L.getAvailableChoices(state);
    const pick = choices.slice().sort((a, b) => a.ap - b.ap)[0];
    if (pick) {
      const r = L.issueCommand(state, pick.id);
      if (r.ok && r.command && r.command.status === 'issued') L.authorizeCommand(state, r.command.id);
    }
    const end = L.endRound(state);
    if (!end.ok) break;
    if (state.phase === 'wrapup_offer') L.declineWrapUp(state);
    if (state.phase === 'interlude') L.continueFromInterlude(state);
  }
  return state;
}

console.log('v1.2 战后历史回声测试');

/* ── 1. 结构 ─────────────────────────────────────────── */
test('四条后来的历史都在，标题与题注齐全', () => {
  assert.equal(AW.count, 4, '应整理四条 2022 年 4 月之后的历史进展');
  assert.ok(AW.title.indexOf('后来') !== -1, '模块标题应为《后来，战争走到了这里》');
  assert.ok(AW.kicker && AW.kicker.length >= 4, '模块缺少题注');
  const ids = AW.records.map((r) => r.id);
  ['aw_moscow_drone', 'aw_belgorod', 'aw_wagner', 'aw_kursk'].forEach((id) => {
    assert.ok(ids.indexOf(id) !== -1, '缺少记录：' + id);
  });
});

test('每条记录都有日期、当时发生、后来确认、争议、为什么值得重新理解与来源', () => {
  AW.records.forEach((record) => {
    assert.ok(record.id && record.title && record.lead, record.id + ' 缺少标题或导语');
    assert.ok(record.dateLabel && record.date, record.id + ' 缺少日期');
    assert.ok(record.happened && record.happened.length >= 40, record.id + ' 缺少「当时发生了什么」');
    assert.ok(record.confirmed && record.confirmed.length >= 30, record.id + ' 缺少「后来可以确认的」');
    assert.ok(record.disputed && record.disputed.length >= 20, record.id + ' 缺少「仍有争议或无法确认」');
    assert.ok(record.why && record.why.length >= 30, record.id + ' 缺少「为什么值得重新理解战争」');
    assert.ok(AW.status[record.status], record.id + ' 状态标签不合法：' + record.status);
    assert.ok(record.sources && record.sources.length >= 2, record.id + ' 至少需要两个来源');
    record.sources.forEach((src) => {
      assert.ok(src.name && src.name.length >= 3, record.id + ' 来源缺少名称');
      assert.ok(/^https?:\/\//.test(src.url || ''), record.id + ' 来源缺少可点击链接：' + src.name);
      assert.ok(src.date, record.id + ' 来源缺少日期');
    });
  });
});

test('四条记录的时间顺序与内容边界', () => {
  const order = AW.list().map((r) => r.date);
  assert.deepEqual(order, order.slice().sort(), '记录应按时间排序');
  assert.ok(AW.list()[0].date >= '2023-01-01', '最早一条也不应早于 2023 年');
  assert.ok(AW.list()[3].date >= '2024-01-01', '库尔斯克一条应落在 2024 年');
});

test('无人机与别尔哥罗德两条保留「乌方否认直接参与」的不确定性', () => {
  const drone = AW.byId('aw_moscow_drone');
  assert.ok(/否认/.test(drone.happened + drone.confirmed + drone.disputed), '无人机一条要写明乌方否认直接参与');
  assert.equal(drone.status, 'disputed', '无人机袭击的责任归属应标为存在争议');
  const belgorod = AW.byId('aw_belgorod');
  assert.ok(/否认|自述/.test(belgorod.happened + belgorod.disputed), '别尔哥罗德一条要区分组织自述与独立证实');
  assert.equal(belgorod.status, 'disputed', '别尔哥罗德一条应标为存在争议');
  const wagner = AW.byId('aw_wagner');
  assert.equal(wagner.status, 'confirmed', '瓦格纳叛乱的核心事实应标为多方来源一致');
  assert.ok(/罗斯托夫/.test(wagner.happened), '瓦格纳一条要写到罗斯托夫');
  const kursk = AW.byId('aw_kursk');
  assert.ok(/控制区|口径|不同/.test(kursk.disputed + kursk.happened), '库尔斯克一条不能写成单向成功');
});

test('模块必须声明这不是 2022 年当时可知的信息，也不是本局决定的后果', () => {
  assert.ok(/2022/.test(AW.disclaimer), '免责声明要提到 2022 年');
  assert.ok(/不属于|不是/.test(AW.disclaimer), '免责声明要说明这些信息不属于当时可知范围');
  assert.ok(/决定/.test(AW.disclaimer), '免责声明要说明这不是本局玩家的决定导致的');
});

/* ── 2. 解锁门槛 ─────────────────────────────────────── */
test('未通关时锁定，通关一次后解锁', () => {
  store.clear();
  const locked = AW.unlockState();
  assert.equal(locked.unlocked, false, '没打完战役时不应该解锁');
  assert.ok(locked.reason && /打完|完整/.test(locked.reason), '锁定时要说明怎么解锁');
  const state = playCampaign(20220224);
  assert.ok(state.ending, '这局应该走到结局');
  const opened = AW.unlockState();
  assert.equal(opened.unlocked, true, '通关一次后应解锁');
  assert.ok(opened.completed >= 1);
});

/* ── 3. 历史纪律：不向后泄露 ──────────────────────────── */
test('后来的历史不会泄露进 2022 年战役的信息流', () => {
  const state = L.createGame({ scenario: 'campaign', seed: 20220224 });
  let guard = 0;
  const texts = [];
  while (!state.ending && guard++ < 40) {
    const choices = L.getAvailableChoices(state);
    const pick = choices.slice().sort((a, b) => a.ap - b.ap)[0];
    if (pick) {
      const r = L.issueCommand(state, pick.id);
      if (r.ok && r.command && r.command.status === 'issued') L.authorizeCommand(state, r.command.id);
    }
    (state.campaign.feed || []).forEach((item) => texts.push(item.title + item.body));
    (state.dispatches || []).forEach((item) => texts.push(item.title + item.body));
    const end = L.endRound(state);
    if (!end.ok) break;
    if (state.phase === 'wrapup_offer') L.declineWrapUp(state);
    if (state.phase === 'interlude') L.continueFromInterlude(state);
  }
  const blob = texts.join('\n');
  assert.ok(blob.length > 1000, '应收集到足够多的战役文本，实际 ' + blob.length);
  AW.leakTerms.forEach((term) => {
    assert.equal(blob.indexOf(term), -1, '战役信息流里出现了后来的历史词：「' + term + '」');
  });
});

test('故事线的内容属性只有五类，且不把推演写成史实', () => {
  const allowed = Object.keys(ST.historyKinds);
  assert.equal(allowed.length, 5, '内容属性应为五类');
  ST.storylines.forEach((line) => {
    line.steps.forEach((step) => {
      assert.ok(allowed.indexOf(step.history) !== -1, step.id + ' 的内容属性不在五类之内：' + step.history);
      if (step.history === 'simulated' || step.history === 'assumption') {
        assert.ok(step.historyNote && step.historyNote.length >= 10, step.id + ' 是推演或假设，必须写明边界');
      }
    });
  });
});

test('历史回声不与 2022 年战役事件混在一起（独立数据源）', () => {
  const campaignText = JSON.stringify(globalThis.LZS_CAMPAIGN.history || []);
  assert.ok(campaignText.length > 100, '战役历史复盘应有内容');
  AW.records.forEach((record) => {
    assert.equal(campaignText.indexOf(record.title), -1, '历史回声不应写进战役历史复盘：' + record.title);
  });
});

console.log('v1.2 战后历史回声测试：' + passed + ' 通过，' + failed + ' 失败');
if (failed) process.exit(1);
