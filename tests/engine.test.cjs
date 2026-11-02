/*
 * 引擎回归测试（Node，无浏览器）
 * 运行：node tests/engine.test.cjs
 */
'use strict';

const assert = require('node:assert/strict');

const store = new Map();
globalThis.window = globalThis;
globalThis.localStorage = {
  getItem: function (key) { return store.has(key) ? store.get(key) : null; },
  setItem: function (key, value) { store.set(key, String(value)); },
  removeItem: function (key) { store.delete(key); },
  clear: function () { store.clear(); }
};

require('../js/events.js');
require('../js/intel.js');
require('../js/engine.js');

const L = globalThis.LZS;
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('  ok  ' + name);
  } catch (error) {
    failed += 1;
    console.error('  FAIL ' + name);
    console.error('       ' + (error && error.stack ? error.stack.split('\n').slice(0, 8).join('\n       ') : error));
  }
}

function fresh() {
  return L.createGame();
}

function setStats(state, overrides) {
  Object.keys(state.stats).forEach(function (key) {
    state.stats[key] = 80;
  });
  Object.assign(state.stats, overrides || {});
  return state;
}

console.log('\n[数据完整性]');
test('7 个连续事件，日期从 2 月 24 日到 3 月初', function () {
  assert.equal(L.events.length, 7);
  assert.equal(L.events[0].date, '2022-02-24');
  assert.ok(L.events[L.events.length - 1].date >= '2022-03-01');
  L.events.forEach(function (event) {
    assert.ok(event.dateLabel && event.time && event.title && event.kicker);
    assert.ok(event.intel && event.intel.level && event.intel.note);
    assert.ok(Array.isArray(event.situation) && event.situation.length >= 1);
    assert.ok(Array.isArray(event.known) && event.known.length >= 1);
    assert.ok(Array.isArray(event.unknown) && event.unknown.length >= 1);
    assert.equal(Object.prototype.hasOwnProperty.call(event, 'hindsight'), false, event.id + ' 仍在游玩数据中携带事后信息');
    assert.ok(Number.isFinite(event.pressureRise) && event.pressureRise > 0);
    assert.ok(Array.isArray(event.choices) && event.choices.length >= 2);
  });
});

test('所有选项都有 AP 成本、即时效果和至少两难取舍', function () {
  L.events.forEach(function (event) {
    assert.ok(event.choices.length >= 4, event.id + ' 选项不足');
    event.choices.forEach(function (choice) {
      assert.ok(choice.id && choice.title && choice.summary && choice.staff);
      assert.ok(Number.isInteger(choice.ap) && choice.ap >= 1);
      assert.ok(choice.effects && Object.keys(choice.effects).length >= 2);
      assert.ok(choice.summary.length > 10);
    });
  });
});

console.log('\n[初始状态与 AP]');
test('初始 3 AP、压力 12、七项状态在 0—100', function () {
  const state = fresh();
  assert.equal(state.round, 1);
  assert.equal(state.ap, 3);
  assert.equal(state.apMax, 3);
  assert.equal(state.pressure, 12);
  assert.deepEqual(state.stats, L.meta.initialStats);
  L.statKeys.forEach(function (key) {
    assert.ok(state.stats[key] >= 0 && state.stats[key] <= 100);
  });
});

test('签发扣 AP，效果立即结算', function () {
  const state = fresh();
  const choice = L.getChoice(L.getEvent(state), 'aid_call');
  const before = Object.assign({}, state.stats);
  const result = L.applyChoice(state, 'aid_call');
  assert.equal(result.ok, true);
  assert.equal(state.ap, 3 - choice.ap);
  assert.equal(state.stats.intl, before.intl + choice.effects.intl);
  assert.equal(state.stats.safety, before.safety + choice.effects.safety);
  assert.equal(state.pressure, 12 + choice.effects.pressure);
  assert.deepEqual(state.executed, ['aid_call']);
});

test('重复签发被拒绝，且不会二次扣 AP', function () {
  const state = fresh();
  assert.equal(L.applyChoice(state, 'address').ok, true);
  const apAfter = state.ap;
  const duplicate = L.applyChoice(state, 'address');
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.code, 'DUPLICATE');
  assert.equal(state.ap, apAfter);
  assert.equal(state.choices.length, 1);
});

test('AP 不足时拒绝签发', function () {
  const state = fresh();
  state.ap = 1;
  const result = L.applyChoice(state, 'mobilize');
  assert.equal(result.ok, false);
  assert.equal(result.code, 'AP');
  assert.equal(state.ap, 1);
});

test('所有状态变化都夹在 0—100 之间', function () {
  const state = fresh();
  const high = L._test.applyEffectValues(state, { gov: 999, army: 999, reserve: 999 });
  assert.equal(state.stats.gov, 100);
  assert.equal(state.stats.army, 100);
  assert.equal(state.stats.reserve, 100);
  assert.equal(high.deltas.gov, 100 - L.meta.initialStats.gov);

  const low = L._test.applyEffectValues(state, { gov: -999, army: -999, safety: -999 });
  assert.equal(state.stats.gov, 0);
  assert.equal(state.stats.army, 0);
  assert.equal(state.stats.safety, 0);
  assert.ok(low.deltas.safety < 0);
});

test('互斥命令在 AP 检查之前被拒绝，不扣 AP 或写入日志', function () {
  const cases = [
    [2, 'stay', 'relocate'],
    [3, 'counterattack', 'block_runway'],
    [6, 'talks', 'refuse']
  ];
  cases.forEach(function (item) {
    const state = fresh();
    state.round = item[0];
    assert.equal(L.applyChoice(state, item[1]).ok, true);
    const before = { ap: state.ap, choices: state.choices.length, log: state.log.length };
    const result = L.applyChoice(state, item[2]);
    assert.equal(result.ok, false);
    assert.equal(result.code, 'CONFLICT');
    assert.equal(result.conflict.id, item[1]);
    assert.equal(state.ap, before.ap);
    assert.equal(state.choices.length, before.choices);
    assert.equal(state.log.length, before.log);
    assert.equal(L.getChoiceStatus(state, item[2]).state, 'conflict');
  });
});

test('互斥状态在存档恢复后仍然有效', function () {
  const state = fresh();
  state.round = 2;
  assert.equal(L.applyChoice(state, 'stay').ok, true);
  assert.equal(L.saveGame(state), true);
  const loaded = L.loadSavedGame().state;
  assert.equal(L.getChoiceStatus(loaded, 'relocate').state, 'conflict');
  const ap = loaded.ap;
  assert.equal(L.applyChoice(loaded, 'split').code, 'CONFLICT');
  assert.equal(loaded.ap, ap);
  assert.equal(L.deleteSave(), true);
});

console.log('\n[回合与延迟效果]');
test('空回合不能结束；结束一次后不能重复结算', function () {
  const state = fresh();
  const noChoice = L.endRound(state);
  assert.equal(noChoice.ok, false);
  assert.equal(noChoice.code, 'NO_CHOICE');

  assert.equal(L.applyChoice(state, 'address').ok, true);
  const first = L.endRound(state);
  assert.equal(first.ok, true);
  assert.equal(state.phase, 'interlude');
  assert.equal(state.round, 2);
  assert.equal(state.ap, 3);

  const pressure = state.pressure;
  const second = L.endRound(state);
  assert.equal(second.ok, false);
  assert.equal(second.code, 'PHASE');
  assert.equal(state.pressure, pressure);
  assert.equal(state.round, 2);
});

test('结束回合会按事件上升压力并产生夜间侵蚀', function () {
  const state = fresh();
  assert.equal(L.applyChoice(state, 'address').ok, true);
  const before = state.pressure;
  const event = L.getEvent(state);
  const result = L.endRound(state);
  assert.equal(result.ok, true);
  assert.equal(result.pressure.before, before);
  assert.equal(result.pressure.rise, event.pressureRise);
  assert.equal(state.pressure, before + event.pressureRise);
  assert.ok(result.attrition && result.attrition.kyiv < 0);
  assert.ok(result.interlude && result.interlude.round === 2);
});

test('延迟后果按 dueRound 调度并只在到期时触发', function () {
  const state = fresh();
  assert.equal(L.applyChoice(state, 'mobilize').ok, true);
  assert.equal(state.pending.length, 1);
  assert.equal(state.pending[0].dueRound, 4);

  const beforeArmy = state.stats.army;
  const beforeWill = state.stats.will;
  const resolved = L._test.resolveDueDelayed(state, 3);
  assert.equal(resolved.length, 0);
  assert.equal(state.pending.length, 1);
  assert.equal(state.stats.army, beforeArmy);
  assert.equal(state.stats.will, beforeWill);

  state.phase = 'interlude';
  const due = L._test.resolveDueDelayed(state, 4);
  assert.equal(due.length, 1);
  assert.equal(state.pending.length, 0);
  assert.equal(state.resolved.length, 1);
  assert.equal(state.resolved[0].appliedRound, 4);
  assert.ok(state.stats.army < beforeArmy);
  assert.ok(state.stats.will < beforeWill);
  assert.ok(state.resolved[0].deltas.army < 0);
  assert.ok(state.resolved[0].deltas.will < 0);
});

test('夜间确认只从 interlude 进入下一回合，不能重复继续', function () {
  const state = fresh();
  assert.equal(L.applyChoice(state, 'address').ok, true);
  assert.equal(L.endRound(state).ok, true);
  assert.equal(state.phase, 'interlude');
  assert.equal(L.continueFromInterlude(state).ok, true);
  assert.equal(state.phase, 'briefing');
  assert.equal(L.continueFromInterlude(state).ok, false);
});

console.log('\n[存档]');
test('保存、读取、摘要与删除存档', function () {
  const state = fresh();
  assert.equal(L.applyChoice(state, 'aid_call').ok, true);
  assert.equal(L.saveGame(state), true);
  assert.equal(L.hasSave(), true);

  const summary = L.getSaveSummary();
  assert.equal(summary.round, 1);
  assert.equal(summary.ap, 2);
  assert.equal(summary.phase, 'briefing');
  assert.ok(summary.dateLabel.includes('2月24日'));

  const loaded = L.loadSavedGame();
  assert.ok(loaded && loaded.state);
  assert.equal(loaded.state.ap, 2);
  assert.deepEqual(loaded.state.executed, ['aid_call']);
  assert.equal(loaded.state.choices.length, 1);

  assert.equal(L.deleteSave(), true);
  assert.equal(L.hasSave(), false);
  assert.equal(L.loadSavedGame(), null);
});

test('v0.1 存档可恢复，并按当前事件数据保持互斥', function () {
  const legacy = fresh();
  legacy.round = 2;
  assert.equal(L.applyChoice(legacy, 'stay').ok, true);
  const legacyPayload = JSON.parse(JSON.stringify({ version: 1, savedAt: '2026-01-01T00:00:00.000Z', state: legacy }));
  delete legacyPayload.state.__v02;
  store.set(L.saveKey, JSON.stringify(legacyPayload));
  const loaded = L.loadSavedGame();
  assert.ok(loaded && loaded.state);
  assert.equal(loaded.state.round, 2);
  const ap = loaded.state.ap;
  const conflict = L.applyChoice(loaded.state, 'relocate');
  assert.equal(conflict.code, 'CONFLICT');
  assert.equal(loaded.state.ap, ap);
});

test('损坏的存档不会让游戏崩溃', function () {
  store.set(L.saveKey, '{not valid json');
  assert.equal(L.loadSavedGame(), null);
  store.set(L.saveKey, JSON.stringify({ version: 1, state: { round: 99 } }));
  assert.equal(L.loadSavedGame(), null);
});

console.log('\n[结局判定]');
test('七种状态崩溃与压力过载分别触发对应结局', function () {
  const cases = [
    ['president', { safety: 10 }],
    ['government', { gov: 25 }],
    ['kyiv', { kyiv: 12 }],
    ['military', { army: 15 }],
    ['will', { will: 20 }],
    ['diplomatic', { intl: 10 }],
    ['logistics', { reserve: 8 }]
  ];
  cases.forEach(function (item) {
    const state = setStats(fresh(), item[1]);
    const ending = L.checkCollapse(state);
    assert.ok(ending, item[0] + ' 未触发');
    assert.equal(ending.id, item[0]);
  });

  const overload = setStats(fresh(), {});
  overload.pressure = 100;
  const ending = L.checkCollapse(overload);
  assert.equal(ending.id, 'overload');
});

test('崩溃判定优先级：总统安全优先于政府，政府优先于基辅', function () {
  const state = setStats(fresh(), { safety: 5, gov: 25, kyiv: 12 });
  assert.equal(L.checkCollapse(state).id, 'president');
  state.stats.safety = 80;
  assert.equal(L.checkCollapse(state).id, 'government');
  state.stats.gov = 80;
  assert.equal(L.checkCollapse(state).id, 'kyiv');
});

test('阶段结束可判定 held / costly / hollow', function () {
  const held = setStats(fresh(), {});
  held.pressure = 50;
  assert.equal(L.evaluateFinal(held).id, 'held');

  const costly = setStats(fresh(), {
    gov: 40, kyiv: 28, army: 30, will: 34, intl: 30, reserve: 20, safety: 14
  });
  costly.pressure = 80;
  assert.equal(L.evaluateFinal(costly).id, 'costly');

  const hollow = setStats(fresh(), {
    gov: 30, kyiv: 10, army: 10, will: 20, intl: 20, reserve: 10, safety: 5
  });
  hollow.pressure = 95;
  assert.equal(L.evaluateFinal(hollow).id, 'hollow');
});

test('hollow 必须至少两项系统跌破严重受损线', function () {
  const one = setStats(fresh(), { intl: 23 });
  one.pressure = 80;
  assert.equal(L.evaluateFinal(one).id, 'costly');
  one.stats.reserve = 17;
  const ending = L.evaluateFinal(one);
  assert.equal(ending.id, 'hollow');
  assert.equal(ending.severeCount, 2);
  assert.deepEqual(ending.severeKeys, ['intl', 'reserve']);
});

test('held 同时要求七项状态达标和压力低于 95', function () {
  const state = setStats(fresh(), {});
  state.pressure = 94;
  assert.equal(L.evaluateFinal(state).id, 'held');
  state.stats.reserve = 23;
  assert.equal(L.evaluateFinal(state).id, 'costly');
});

console.log('\n[完整一局]');
test('固定策略可以从头玩到结局，且结局数据完整', function () {
  const sequence = {
    1: ['aid_call', 'address'],
    2: ['stay', 'record'],
    3: ['air_defense'],
    4: ['curfew', 'arm_citizens'],
    5: ['delegate'],
    6: ['talks'],
    7: ['logistics', 'evacuate']
  };
  const state = fresh();
  let guard = 0;

  while (state.phase !== 'ending' && guard < 20) {
    guard += 1;
    const round = state.round;
    const event = L.getEvent(state);
    assert.ok(event, '第 ' + round + ' 回合缺少事件');

    const ids = sequence[round] || [];
    assert.ok(ids.length >= 1, '第 ' + round + ' 回合没有策略');
    ids.forEach(function (id) {
      const result = L.applyChoice(state, id);
      assert.equal(result.ok, true, '第 ' + round + ' 回合签发 ' + id + ' 失败：' + (result.error || ''));
    });
    assert.ok(state.executed.length >= 1);

    const pressureBefore = state.pressure;
    const end = L.endRound(state);
    assert.equal(end.ok, true, '第 ' + round + ' 回合结束失败：' + (end.error || ''));
    if (state.phase === 'ending') {
      assert.ok(state.ending);
      break;
    }
    const delayedPressure = end.interlude.pressure.delayed;
    assert.equal(end.interlude.pressure.before, pressureBefore);
    assert.equal(end.interlude.pressure.rise, event.pressureRise);
    assert.equal(end.interlude.pressure.after, state.pressure);
    assert.equal(
      state.pressure,
      Math.min(100, pressureBefore + event.pressureRise + delayedPressure),
      '第 ' + round + ' 回合压力结算与夜间摘要不一致'
    );
    if (state.phase === 'interlude') {
      assert.equal(L.continueFromInterlude(state).ok, true);
    }
  }

  assert.equal(state.phase, 'ending');
  assert.ok(state.ending && state.ending.title);
  assert.equal(state.ending.finalStats.safety, state.stats.safety);
  assert.equal(state.ending.keyChoices.length, state.choices.length);
  assert.ok(Array.isArray(state.ending.commandChains) && state.ending.commandChains.length >= 1, '结局必须带可追溯的关键命令链');
  assert.ok(state.ending.epilogue.length >= 1);
  assert.ok(state.ending.reasons.length >= 1);
  assert.ok(state.log.length >= 7);
  console.log('      结局：' + state.ending.id + ' / ' + state.ending.title +
    '；最终压力 ' + state.pressure + '；签发 ' + state.choices.length + ' 项');

  assert.equal(L.applyChoice(state, 'address').ok, false, '结局后仍可签发');
  assert.equal(L.endRound(state).ok, false, '结局后仍可结束回合');
});

console.log('\n[压力预测]');
test('压力预测与事件 pressureRise 一致', function () {
  const state = fresh();
  const forecast = L.getPressureForecast(state);
  const event = L.getEvent(state);
  assert.equal(forecast.current, state.pressure);
  assert.equal(forecast.rise, event.pressureRise);
  assert.equal(forecast.next, Math.min(100, state.pressure + event.pressureRise));
  assert.ok(forecast.attrition.kyiv < 0);
});

console.log('\n[v0.4 情报桌与总统操作]');
test('六类情报桌齐备，阅读免费且追问只扣 AP、不改国家状态', function () {
  const state = fresh();
  const reports = L.getIntelReports(state);
  assert.equal(reports.length, 6);
  ['military', 'governance', 'local', 'diplomatic', 'logistics', 'society'].forEach(function (category) {
    assert.ok(reports.some(function (report) { return report.category === category; }));
  });
  const apBefore = state.ap;
  const statsBefore = Object.assign({}, state.stats);
  const read = reports[0];
  L.markIntelRead(state, read.id);
  assert.equal(state.ap, apBefore, '阅读情报不应扣 AP');
  const inquiry = L.inquireIntel(state, read.id);
  assert.equal(inquiry.ok, true);
  assert.equal(state.ap, apBefore - 1, '追问应扣 1 AP');
  assert.deepEqual(state.stats, statsBefore, '追问不应直接改变国家状态');
  assert.equal(L.inquireIntel(state, read.id).code, 'DUPLICATE', '同一情报不可重复追问');
  assert.equal(state.ap, apBefore - 1, '重复追问不应再次扣 AP');
});

test('签发只扣 AP 并建立 issued 命令，授权后也不立即结算', function () {
  const state = fresh();
  const statsBefore = Object.assign({}, state.stats);
  const issued = L.issueCommand(state, 'mobilize');
  assert.equal(issued.ok, true);
  assert.equal(issued.command.status, 'issued');
  assert.equal(state.ap, 1, '2 AP 命令应立即扣除注意力');
  assert.deepEqual(state.stats, statsBefore, '签发瞬间不应提前结算效果');
  const authorized = L.authorizeCommand(state, issued.command.id);
  assert.equal(authorized.ok, true);
  assert.equal(issued.command.status, 'executing');
  assert.deepEqual(state.stats, statsBefore, '授权也不应立即结算效果');
  assert.equal(state.agencies[issued.command.agency].workload, 1);
});

test('跨部门命令在夜间阻塞，跟进解除后只结算一次', function () {
  const state = fresh();
  const issued = L.issueCommand(state, 'mobilize');
  L.authorizeCommand(state, issued.command.id);
  const armyBefore = state.stats.army;
  const end = L.endRound(state);
  assert.equal(end.ok, true);
  assert.equal(issued.command.status, 'blocked', '未协调的跨部门命令应阻塞');
  assert.ok(state.stats.army < armyBefore, '阻塞命令的自身效果不应结算，只有夜间侵蚀');
  L.continueFromInterlude(state);
  const armyAfterNight = state.stats.army;
  const follow = L.followUpCommand(state, issued.command.id);
  assert.equal(follow.ok, true);
  assert.equal(issued.command.status, 'awaiting_feedback');
  assert.equal(state.stats.army, Math.min(100, armyAfterNight + 8), '跟进放行后应结算一次命令效果');
  assert.equal(L.followUpCommand(state, issued.command.id).code, 'DUPLICATE', '同一回合不可重复跟进');
});

test('召集协调满足跨部门条件，且每机构每回合只能一次', function () {
  const state = fresh();
  const issued = L.issueCommand(state, 'mobilize');
  L.authorizeCommand(state, issued.command.id);
  const agency = issued.command.agency;
  assert.equal(L.coordinateAgency(state, agency).ok, true);
  assert.equal(state.ap, 0);
  assert.equal(issued.command.coordinated, true, '召集应把本轮相关命令标记为已协调');
  state.ap = 1;
  assert.equal(L.coordinateAgency(state, agency).code, 'DUPLICATE');
  assert.equal(state.ap, 1, '重复召集不应扣 AP');
});

test('总统跟进命令消耗 1 AP，且跨日保留生命周期状态', function () {
  const state = fresh();
  const issued = L.issueCommand(state, 'address');
  L.authorizeCommand(state, issued.command.id);
  state.ap = 2;
  const follow = L.followUpCommand(state, issued.command.id);
  assert.equal(follow.ok, true);
  assert.equal(state.ap, 1);
  assert.equal(issued.command.status, 'awaiting_feedback');
  L.deleteSave();
  const emptyLoad = L.loadSavedGame();
  assert.equal(emptyLoad, null, '未保存时不应凭空恢复');
  assert.equal(L.saveGame(state), true);
  const restored = L.loadSavedGame();
  assert.ok(restored && restored.state);
  const command = restored.state.commands.filter(function (item) { return item.id === issued.command.id; })[0];
  assert.ok(command);
  assert.equal(command.status, 'awaiting_feedback');
});

test('夜间结算后命令进入等待反馈，继续到下日不重复结算原效果', function () {
  const state = fresh();
  const issued = L.issueCommand(state, 'address');
  L.authorizeCommand(state, issued.command.id);
  L.coordinateAgency(state, issued.command.agency);
  const statsBefore = Object.assign({}, state.stats);
  const end = L.endRound(state);
  assert.equal(end.ok, true);
  assert.equal(issued.command.status, 'awaiting_feedback');
  const immediateArmy = state.stats.army;
  L.continueFromInterlude(state);
  const nextRound = state.round;
  assert.equal(issued.command.effectsApplied, true);
  const round2 = L.issueCommand(state, 'record');
  assert.equal(round2.ok, true);
  L.authorizeCommand(state, round2.command.id);
  const second = L.endRound(state);
  assert.equal(second.ok, true);
  assert.equal(issued.command.effectsApplied, true);
  assert.equal(issued.command.status, 'completed', '旧命令在夜间确认后归档，不会重复执行');
  assert.equal(state.lastSettledRound >= nextRound, true);
});

test('沟通渠道消耗 1 AP 并在下一夜建立延迟反馈', function () {
  const state = fresh();
  const result = L.communicate(state, 'public');
  assert.equal(result.ok, true);
  assert.equal(state.ap, 2);
  assert.equal(result.command.status, 'awaiting_feedback');
  assert.equal(state.pending.length, 1);
  assert.equal(state.pending[0].dueRound, 2);
  assert.equal(L.communicate(state, 'public').code, 'DUPLICATE');
});

test('v1 存档迁移为 v2 台账，保留旧决策且不重复结算', function () {
  const state = fresh();
  L.applyChoice(state, 'address');
  const old = JSON.parse(JSON.stringify(state));
  old.version = 1;
  old.schemaVersion = 1;
  delete old.commands;
  delete old.effects;
  delete old.agencies;
  delete old.intelState;
  delete old.coordinationThisRound;
  delete old.communicationsThisRound;
  delete old.lastSettledRound;
  localStorage.setItem('lzs_save_v1', JSON.stringify({ version: 1, savedAt: new Date().toISOString(), state: old }));
  const loaded = L.loadSavedGame();
  assert.ok(loaded && loaded.state);
  assert.equal(loaded.state.version, 2);
  assert.equal(loaded.state.schemaVersion, 2);
  assert.equal(loaded.state.commands.length, 1);
  assert.equal(loaded.state.commands[0].status, 'completed');
  assert.equal(loaded.state.choices.length, 1);
  assert.deepEqual(loaded.state.stats, old.stats, '迁移不得重算旧状态');
});

console.log('\n[v0.4.1 决策重量与执行约束]');
test('1 AP 单项工作自行排队，不占机构优先席位；2 AP 命令占用席位', function () {
  const state = fresh();
  const routine = L.issueCommand(state, 'address');
  assert.equal(routine.ok, true);
  assert.equal(routine.command.slotRequired, false);
  assert.equal(L.authorizeCommand(state, routine.command.id).ok, true);
  assert.equal(state.agencies[routine.command.agency].workload, 0, '常规工作不应占用优先席位');

  const priority = L.issueCommand(state, 'mobilize');
  assert.equal(priority.command.slotRequired, true);
  const authorized = L.authorizeCommand(state, priority.command.id);
  assert.equal(authorized.ok, true);
  assert.equal(state.agencies.general_staff.workload, 1, '2 AP 跨部门命令应占用一个优先席位');
});

test('没有新签发命令但 AP 已用于其他事务时允许结束回合', function () {
  const state = fresh();
  state.ap = 0;
  assert.equal(state.executed.length, 0);
  const result = L.endRound(state);
  assert.equal(result.ok, true, '把注意力用于追问或协调后不应卡死在结束回合');
  assert.equal(state.phase, 'interlude');
});

test('机构容量满时命令阻塞；总统介入越过排队但透支协调且只结算一次', function () {
  const state = fresh();
  state.agencies.general_staff.workload = 3;
  const issued = L.issueCommand(state, 'mobilize');
  assert.equal(issued.ok, true);
  const authorized = L.authorizeCommand(state, issued.command.id);
  assert.equal(authorized.blocked, true);
  assert.equal(issued.command.status, 'blocked');
  assert.equal(issued.command.blockedCode, 'CAPACITY');
  assert.equal(state.agencies.general_staff.workload, 3, '阻塞命令不应凭空占用名额');
  assert.equal(state.stats.gov, L.meta.initialStats.gov, '阻塞时不得提前结算');

  const follow = L.followUpCommand(state, issued.command.id);
  assert.equal(follow.ok, true);
  assert.equal(state.ap, 0, '亲自介入必须支付 1 AP');
  assert.equal(state.agencies.general_staff.workload, 4, '介入会越过容量上限，留下机构透支');
  assert.equal(state.agencies.general_staff.coordination, 45, '介入透支 5 点协调余量');
  assert.equal(state.stats.gov, L.meta.initialStats.gov - 2);
  state.ap = 1;
  assert.equal(L.followUpCommand(state, issued.command.id).code, 'DUPLICATE');
  const govAfter = state.stats.gov;
  const night = L.endRound(state);
  assert.equal(night.ok, true);
  assert.equal(state.stats.gov <= govAfter, true, '夜间侵蚀可以继续扣减，但命令效果不能重复增加');
});

test('委派不耗 AP，但交接延迟一夜；目标满载时拒绝且原执行责任不变', function () {
  const full = fresh();
  const blocked = L.issueCommand(full, 'mobilize');
  L.authorizeCommand(full, blocked.command.id);
  full.agencies.office.workload = 3;
  const refused = L.delegateCommand(full, blocked.command.id, 'office');
  assert.equal(refused.ok, false);
  assert.equal(refused.code, 'CAPACITY');
  assert.equal(blocked.command.agency, 'general_staff', '拒绝后不应丢失原执行机构');
  assert.equal(full.ap, 1, '失败的委派不应改变 AP');

  const state = fresh();
  const issued = L.issueCommand(state, 'mobilize');
  L.authorizeCommand(state, issued.command.id);
  const apBefore = state.ap;
  const delegated = L.delegateCommand(state, issued.command.id, 'office');
  assert.equal(delegated.ok, true);
  assert.equal(state.ap, apBefore, '委派本身不消耗总统 AP');
  assert.equal(issued.command.delegated, true);
  assert.equal(issued.command.handoffRound, 2);
  assert.equal(state.agencies.general_staff.coordination, 47);
  assert.equal(state.agencies.office.coordination, 47);

  const firstNight = L.endRound(state);
  assert.equal(firstNight.ok, true);
  assert.equal(issued.command.effectsApplied, false, '交接夜不执行');
  assert.equal(issued.command.blockedCode, 'HANDOFF');
  L.continueFromInterlude(state);
  state.executed = ['test-marker'];
  const secondNight = L.endRound(state);
  assert.equal(secondNight.ok, true);
  assert.equal(issued.command.effectsApplied, true, '第二夜才执行');
  assert.equal(issued.command.status, 'awaiting_feedback', '执行后先等待反馈，不把执行中当成已完成');
  assert.equal(L.continueFromInterlude(state).ok, true);
  state.executed = ['test-marker'];
  assert.equal(L.endRound(state).ok, true);
  assert.equal(issued.command.status, 'completed', '下一夜核验反馈后才归档为完成');
});

test('接受延误会使命令超过窗口失效，而不是无限期晚执行', function () {
  const state = fresh();
  state.agencies.general_staff.workload = 3;
  const issued = L.issueCommand(state, 'mobilize');
  L.authorizeCommand(state, issued.command.id);
  assert.equal(issued.command.deadlineRound, 2);
  const govBefore = state.stats.gov;
  const first = L.endRound(state);
  assert.equal(first.ok, true);
  assert.equal(issued.command.status, 'blocked');
  L.continueFromInterlude(state);
  state.executed = ['test-marker'];
  const second = L.endRound(state);
  assert.equal(second.ok, true);
  assert.equal(issued.command.status, 'expired', '最后窗口仍无法执行时应失效');
  assert.equal(issued.command.effectsApplied, false);
  assert.equal(state.choices[0].deltas.gov, undefined, '失效命令不得结算原效果');
  assert.equal(state.stats.gov <= govBefore, true);
  assert.equal(state.agencies.general_staff.workload, 3, '失效只释放已占名额，不应改动虚构的在办负载');
});

test('最后执行窗口不能再委派，也不能授权已经超过窗口的 issued 命令', function () {
  const state = fresh();
  state.agencies.general_staff.workload = 3;
  const issued = L.issueCommand(state, 'mobilize');
  L.authorizeCommand(state, issued.command.id);
  const first = L.endRound(state);
  assert.equal(first.ok, true);
  assert.equal(issued.command.status, 'blocked');
  L.continueFromInterlude(state);
  state.executed = ['test-marker'];
  const apBefore = state.ap;
  const delegated = L.delegateCommand(state, issued.command.id, 'office');
  assert.equal(delegated.ok, false);
  assert.equal(delegated.code, 'WINDOW', '最后窗口委派来不及，应被拒绝');
  assert.equal(state.ap, apBefore, '拒绝委派不应扣 AP');
  assert.equal(issued.command.agency, 'general_staff', '拒绝委派后不应改变原执行机构');
  issued.command.status = 'issued';
  issued.command.deadlineRound = 1;
  const authorized = L.authorizeCommand(state, issued.command.id);
  assert.equal(authorized.ok, false);
  assert.equal(authorized.code, 'EXPIRED', '超过窗口的 issued 命令不可再授权');
});

test('跨日未授权的 issued 命令会在最后窗口失效，不会永久悬空', function () {
  const state = fresh();
  const issued = L.issueCommand(state, 'mobilize');
  assert.equal(issued.command.status, 'issued');
  issued.command.round = 1;
  issued.command.deadlineRound = 2;
  state.round = 2;
  state.lastSettledRound = 1;
  state.ap = 0;
  state.executed = [];
  const night = L.endRound(state);
  assert.equal(night.ok, true);
  assert.equal(issued.command.status, 'expired', '跨日未授权命令到窗口结束应失效');
  assert.equal(issued.command.effectsApplied, false, '失效命令不得结算效果');
  assert.equal(state.agencies.general_staff.workload, 0, '未占用的席位不应留下虚构负载');
});

test('低可信度的高投入命令必须先追问总参，换机构或催办不能替代', function () {
  const state = fresh();
  state.round = 5;
  state.lastSettledRound = 4;
  state.ap = 3;
  const preview = L.getCommandPreview(state, 'south');
  assert.equal(preview.requiresIntel, true);
  assert.equal(preview.intelSatisfied, false);
  const issued = L.issueCommand(state, 'south');
  assert.equal(issued.ok, true);
  const blocked = L.authorizeCommand(state, issued.command.id);
  assert.equal(blocked.blocked, true);
  assert.equal(issued.command.blockedCode, 'INFO');
  assert.equal(state.ap, 1);
  const follow = L.followUpCommand(state, issued.command.id);
  assert.equal(follow.ok, false);
  assert.equal(follow.code, 'INFO');
  assert.equal(state.ap, 1, '缺情报时催办不应扣 AP');
  const delegate = L.delegateCommand(state, issued.command.id, 'office');
  assert.equal(delegate.ok, false);
  assert.equal(delegate.code, 'INFO');
  assert.equal(state.ap, 1);
  const inquiry = L.inquireIntel(state, 'e5:military');
  assert.equal(inquiry.ok, true);
  assert.equal(state.ap, 0);
  assert.equal(issued.command.status, 'issued', '追问后回到待授权，而不是自动执行');
  const retry = L.authorizeCommand(state, issued.command.id);
  assert.equal(retry.ok, true);
  assert.equal(retry.blocked, undefined);
  assert.equal(issued.command.status, 'executing');
});

test('路线差异在首日命令状态、次日 AP 与机构负载上可观察', function () {
  function endAndContinue(state) {
    const result = L.endRound(state);
    assert.equal(result.ok, true);
    if (state.phase === 'interlude') L.continueFromInterlude(state);
    return result;
  }

  const intervene = fresh();
  intervene.agencies.general_staff.workload = 3;
  const interventionCommand = L.issueCommand(intervene, 'mobilize').command;
  L.authorizeCommand(intervene, interventionCommand.id);
  intervene.ap = 1;
  L.followUpCommand(intervene, interventionCommand.id);
  const interveneApAfterDay1 = intervene.ap;
  endAndContinue(intervene);
  const interveneLoadAfterDay1 = intervene.agencies.general_staff.workload;
  const interveneGovAfterDay1 = intervene.stats.gov;
  const interveneCoordAfterDay1 = intervene.agencies.general_staff.coordination;
  intervene.executed = ['test-marker'];
  endAndContinue(intervene);

  const delegate = fresh();
  const delegatedCommand = L.issueCommand(delegate, 'mobilize').command;
  L.authorizeCommand(delegate, delegatedCommand.id);
  const delegateApAfterDay1 = delegate.ap;
  L.delegateCommand(delegate, delegatedCommand.id, 'office');
  endAndContinue(delegate);
  const delegateLoadAfterDay1 = delegate.agencies.general_staff.workload;
  const delegateGovAfterDay1 = delegate.stats.gov;
  const delegateCoordAfterDay1 = delegate.agencies.general_staff.coordination;
  delegate.executed = ['test-marker'];
  endAndContinue(delegate);
  const delegateGovAfterDay2 = delegate.stats.gov;

  const delay = fresh();
  delay.agencies.general_staff.workload = 3;
  const delayedCommand = L.issueCommand(delay, 'mobilize').command;
  L.authorizeCommand(delay, delayedCommand.id);
  endAndContinue(delay);
  const delayLoadAfterDay1 = delay.agencies.general_staff.workload;
  delay.executed = ['test-marker'];
  endAndContinue(delay);

  assert.notEqual(interveneGovAfterDay1, delegateGovAfterDay1, '介入与委派在次日应产生不同国家状态');
  assert.notEqual(delegateGovAfterDay2, delay.stats.gov, '委派与接受延误在两夜后应产生不同国家状态');
  assert.equal(intervene.commands[0].status, 'completed');
  assert.equal(delegate.commands[0].status, 'awaiting_feedback', '委派路线到第二夜才执行，仍需等待反馈');
  assert.equal(delay.commands[0].status, 'expired');
  assert.equal(interveneLoadAfterDay1, 4, '首日介入后机构以越限负载留下可观察的代价');
  assert.equal(delegateLoadAfterDay1, 0, '首日委派释放原机构，目标机构到次夜才接收');
  assert.equal(delayLoadAfterDay1, 3, '接受延误不新增负载，但命令继续排队');
  assert.equal(interveneApAfterDay1, 0, '亲自介入把当天注意力用尽');
  assert.equal(delegateApAfterDay1, 1, '委派保留 1 点注意力，但把结果推后');
  assert.equal(interveneCoordAfterDay1, 45);
  assert.equal(delegateCoordAfterDay1, 47);
  assert.equal(intervene.ap, 3);
  assert.equal(delegate.ap, 3);
});

console.log('\n----------------------------------------');
console.log('通过 ' + passed + ' 项，失败 ' + failed + ' 项');

if (failed > 0) process.exitCode = 1;
