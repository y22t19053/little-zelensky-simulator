/* v1.1.0 多周目档案与存档迁移测试：独立键、旧档兼容、迁移回退、不覆盖已有记录。 */
'use strict';

const assert = require('node:assert');
const path = require('node:path');

const storage = {};
globalThis.localStorage = {
  getItem: function (key) { return Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null; },
  setItem: function (key, value) { storage[key] = String(value); },
  removeItem: function (key) { delete storage[key]; },
  clear: function () { Object.keys(storage).forEach(function (key) { delete storage[key]; }); }
};
globalThis.window = globalThis;
globalThis.document = {
  createElement: function () { return { style: {}, appendChild: function () {}, setAttribute: function () {} }; },
  querySelector: function () { return null; },
  addEventListener: function () {}
};

const root = path.join(__dirname, '..');
require(path.join(root, 'js/events.js'));
require(path.join(root, 'js/intel.js'));
require(path.join(root, 'js/strategy.js'));
require(path.join(root, 'js/campaign.js'));
require(path.join(root, 'js/dynamic.js'));
require(path.join(root, 'js/replay.js'));
require(path.join(root, 'js/archive.js'));
require(path.join(root, 'js/engine.js'));

const L = globalThis.LZS;
const A = globalThis.LZS_ARCHIVE;
const R = globalThis.LZS_REPLAY;

let passed = 0;
const failures = [];
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('  ✓ ' + name);
  } catch (error) {
    failures.push({ name: name, error: error });
    console.log('  ✗ ' + name);
    console.log('    ' + (error && error.message ? error.message : error));
  }
}

/* 跑完一场战役，直接拿到结局对象。 */
function playCampaign(seed) {
  const state = L.createGame({ scenario: 'campaign', seed: seed || 20220224 });
  let guard = 0;
  while (!state.ending && guard < 40) {
    const open = L.getAvailableChoices(state);
    if (open.length) {
      const issued = L.issueCommand(state, open[0].id);
      if (issued.ok && issued.command.status === 'issued') L.authorizeCommand(state, issued.command.id);
    }
    if (state.phase === 'wrapup_offer') L.declineWrapUp(state);
    else L.endRound(state);
    if (state.phase === 'interlude') L.continueFromInterlude(state);
    guard += 1;
  }
  return state;
}

test('多周目档案：完成一场战役后追加一条探索记录，键与战役记录、推演记录互不相干', function () {
  localStorage.clear();
  const state = playCampaign(20220224);
  assert.ok(state.ending && state.ending.id, '战役没有走到结局');
  const raw = localStorage.getItem(A.storageKey);
  assert.ok(raw, '多周目档案应写进自己的键');
  const store = A.readStore();
  assert.equal(store.runs.length, 1, '应记录一场完成');
  const run = store.runs[0];
  assert.ok(run.endingId, '记录里应有结局');
  assert.equal(typeof run.seed, 'number', '记录里应保存本局种子');
  assert.ok(Array.isArray(run.events), '记录里应有已触发的条件事件');
  assert.ok(run.branches && run.branches.airfield, '记录里应有分支探明情况');
  assert.ok(Array.isArray(run.route) && run.route.length, '记录里应有走过的路线');
  assert.ok(localStorage.getItem('lzs_records_v1'), '战役记录仍然独立存在');
  assert.equal(localStorage.getItem(R.storageKey), null, '推演记录不应被档案写入');
});

test('多周目档案：第二周目用不同决策能得到不同的事件与分支记录，完成次数累加', function () {
  localStorage.clear();
  const first = playCampaign(20220224);
  const second = playCampaign(777001);
  const store = A.readStore();
  assert.equal(store.runs.length, 2, '两次完成应各记一条');
  const a = store.runs[0];
  const b = store.runs[1];
  assert.notEqual(first.campaign.seed, second.campaign.seed, '两局的种子应不同');
  assert.equal(a.seed, first.campaign.seed);
  assert.equal(b.seed, second.campaign.seed);
  const summary = A.summary();
  assert.equal(summary.completed, 2);
  assert.ok(summary.eventsSeenCount >= 2, '跨周目应记录见过的条件事件');
  assert.ok(summary.branches.length >= 1);
});

test('多周目档案：汇总里能分出已历、部分探明与未历路线，不提前泄露内容', function () {
  localStorage.clear();
  playCampaign(20220224);
  const summary = A.summary();
  assert.ok(summary.branches.length >= 1);
  summary.branches.forEach(function (branch) {
    assert.ok(['explored', 'partial', 'unexplored'].indexOf(branch.state) !== -1, '分支状态不合法：' + branch.state);
    assert.ok(branch.label, '分支应有名称');
    assert.ok(branch.hint, '分支应有不泄露内容的提示');
    assert.ok(branch.seen <= branch.total, '已见数量不应超过总数');
  });
  assert.ok(Array.isArray(summary.unexplored));
});

test('多周目档案：记录里带上推演完成情况，但不写入推演记录键', function () {
  localStorage.clear();
  playCampaign(20220224);
  const session = R.createSession('rp_airfield', { infoMode: 'then' });
  let guard = 0;
  while (!session.finished && guard < 20) {
    R.choose(session, session.visibleStep.choices[0].id);
    guard += 1;
  }
  R.recordRun(session);
  const summary = A.summary();
  assert.equal(summary.replayRuns, 1, '应统计已完成的推演次数');
  assert.deepEqual(summary.replayDone, [session.moduleId]);
});

test('存档迁移：解析失败时保留原始文本到备份键，返回空档但不清空原数据', function () {
  localStorage.clear();
  localStorage.setItem(A.storageKey, '{这不是 JSON');
  const store = A.readStore();
  assert.equal(store.runs.length, 0, '解析失败时返回空档');
  assert.equal(store.broken, true, '应标记为损坏');
  assert.equal(localStorage.getItem(A.storageKey), '{这不是 JSON', '原始数据不应被覆盖');
  assert.equal(localStorage.getItem(A.backupKey), '{这不是 JSON', '应另存一份备份');
});

test('存档迁移：缺字段的旧档案被补齐，原有条目不被丢弃', function () {
  localStorage.clear();
  localStorage.setItem(A.storageKey, JSON.stringify({ version: 1, runs: [{ id: 'old-1', endingId: 'c_A', endingTitle: '首都保全' }] }));
  const store = A.readStore();
  assert.equal(store.runs.length, 1, '旧条目应保留');
  assert.deepEqual(store.runs[0].events, []);
  assert.deepEqual(store.runs[0].branches, {});
  assert.deepEqual(store.runs[0].route, []);
});

test('存档迁移：写入时不删除已有战役记录与推演记录', function () {
  localStorage.clear();
  localStorage.setItem('lzs_records_v1', JSON.stringify({ version: 1, runs: [{ key: 'keep', scenario: 'campaign', endingId: 'c_A' }] }));
  localStorage.setItem(R.storageKey, JSON.stringify({ version: 1, runs: [{ id: 'rp-1', moduleId: 'rp_aid' }] }));
  playCampaign(20220224);
  const records = JSON.parse(localStorage.getItem('lzs_records_v1'));
  assert.ok(records.runs.some(function (run) { return run.key === 'keep'; }), '已有战役记录被删除');
  const replay = JSON.parse(localStorage.getItem(R.storageKey));
  assert.equal(replay.runs[0].id, 'rp-1', '已有推演记录被改写');
});

test('存档迁移：档案最多保留最近 40 场，不会无限增长', function () {
  localStorage.clear();
  const runs = [];
  for (let i = 0; i < 45; i += 1) runs.push({ id: 'r' + i, endingId: 'c_A', endedAt: new Date().toISOString(), events: [], branches: {}, route: [] });
  A.writeStore({ version: 1, runs: runs });
  const store = A.readStore();
  assert.equal(store.runs.length, 40);
  assert.equal(store.runs[store.runs.length - 1].id, 'r44', '应保留最近的记录');
});

test('种子写进本局存档，读回来之后还能用同一个种子复盘', function () {
  localStorage.clear();
  const state = L.createGame({ scenario: 'campaign', seed: 20220224 });
  L.saveGame(state);
  const loaded = L.loadSavedGame('campaign');
  assert.ok(loaded && loaded.state, '存档应能读回');
  assert.equal(loaded.state.campaign.seed, 20220224, '种子应写进存档');
  assert.ok(loaded.state.campaign.dyn && loaded.state.campaign.dyn.fired, '动态事件记录应写进存档');
});

test('v1.0 的 schema 5 存档仍可读，迁移时补种子而不伪造历史动态事件', function () {
  localStorage.clear();
  const state = L.createGame({ scenario: 'campaign', seed: 20220224 });
  const raw = JSON.parse(JSON.stringify(state));
  delete raw.campaign.seed;
  delete raw.campaign.dyn;
  /* v1.0 的存档是 {version:5, savedAt, state} 的包壳，test 里按同样的形状写回去。 */
  localStorage.setItem(L.campaignSaveKey, JSON.stringify({ version: 5, savedAt: new Date().toISOString(), state: raw }));
  const loaded = L.loadSavedGame('campaign');
  assert.ok(loaded && loaded.state, 'v1.0 存档应能读回');
  assert.equal(typeof loaded.state.campaign.seed, 'number', '应补一个种子');
  assert.ok(loaded.state.campaign.seed > 0);
  assert.deepEqual(loaded.state.campaign.dyn.fired, {}, '不应伪造已发生的动态事件');
  assert.deepEqual(loaded.state.campaign.dyn.log, []);
});

test('多周目档案：清空档案不影响战役记录与推演记录', function () {
  localStorage.clear();
  localStorage.setItem('lzs_records_v1', JSON.stringify({ version: 1, runs: [{ key: 'keep', scenario: 'campaign' }] }));
  localStorage.setItem(R.storageKey, JSON.stringify({ version: 1, runs: [{ id: 'rp-1' }] }));
  A.clear();
  assert.equal(A.readStore().runs.length, 0);
  assert.ok(localStorage.getItem('lzs_records_v1'), '清空档案不应删除战役记录');
  assert.ok(localStorage.getItem(R.storageKey), '清空档案不应删除推演记录');
});

console.log('');
if (failures.length) {
  console.log('v1.1 多周目档案与存档迁移测试：' + passed + ' 通过，' + failures.length + ' 失败');
  process.exit(1);
} else {
  console.log('v1.1 多周目档案与存档迁移测试：' + passed + ' 通过，0 失败');
}
