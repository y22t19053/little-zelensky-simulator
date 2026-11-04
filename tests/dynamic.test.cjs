/*
 * v1.1 动态战役测试（Node，无浏览器）
 * 运行：node tests/dynamic.test.cjs
 * 所有数值都是模拟设计值。本测试验证的是机制：触发条件、可复现、不重复、路线差异，不是历史统计。
 */
'use strict';
const assert = require('node:assert/strict');
const S = require('./campaign-sim.cjs');
const L = globalThis.LZS;
const D = globalThis.LZS_DYNAMIC;

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { localStorage.clear(); fn(); passed += 1; console.log('  ✓ ' + name); }
  catch (e) { failed += 1; console.log('  ✗ ' + name + '\n    ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n    ') : e)); }
}

function firedOf(route, options) {
  const run = S.play(route, options || {});
  return {
    state: run.state,
    ending: run.state.ending.id,
    seed: run.state.campaign.seed,
    fired: Object.keys(run.state.campaign.dyn.fired || {})
  };
}

function dynItems(state) {
  return (state.dispatches || []).filter(function (item) { return item.type === 'dynamic'; });
}

console.log('v1.1 动态战役测试');

test('事件池：条件事件 20—30 条，三层事件齐全，每个模板都带齐事件属性', function () {
  assert.equal(D.count, D.templates.length);
  const layers = {};
  D.templates.forEach(function (template) { layers[template.layer] = (layers[template.layer] || 0) + 1; });
  assert.ok(layers.condition >= 20 && layers.condition <= 30, '条件事件层 ' + layers.condition + ' 条，应在 20—30 之间');
  assert.ok(layers.state >= 3, '状态事件层数量 ' + layers.state);
  assert.ok(layers.friction >= 3, '摩擦事件层数量 ' + layers.friction);
  assert.equal(layers.condition + layers.state + layers.friction, D.count, '三层事件之和应等于模板总数');
  D.templates.forEach(function (template) {
    assert.ok(template.id && /^dyn_/.test(template.id), template.id + ' 缺少唯一 ID');
    assert.ok(Array.isArray(template.window) && template.window.length === 2, template.id + ' 缺少时间范围');
    assert.ok(template.window[0] >= 1 && template.window[1] <= 13, template.id + ' 时间范围越界');
    assert.ok(template.when && typeof template.when === 'object', template.id + ' 缺少发生条件');
    assert.ok(template.source, template.id + ' 缺少事件来源');
    assert.ok(template.title && template.info, template.id + ' 缺少玩家可见信息');
    assert.equal(typeof template.needAction, 'boolean', template.id + ' 缺少是否需要处理');
    assert.ok(template.history && D.historyKinds[template.history], template.id + ' 缺少历史属性');
    assert.ok(template.replay && (typeof template.replay === 'string' ? template.replay.length > 0 : template.replay.length > 0), template.id + ' 缺少推演属性');
    const followOk = typeof template.follow === 'string'
      ? !!D.byId(template.follow)
      : (Array.isArray(template.follow) && template.follow.every(function (id) { return !!D.byId(id); }));
    assert.ok(followOk, template.id + ' 的后续事件指向了不存在的模板');
    /* 摩擦层只是需要知悉的局部问题，可以只有「知悉」一个处理方式；其余事件必须有两个以上不同处理方式。 */
    const minOptions = template.layer === 'friction' ? 1 : 2;
    assert.ok(Array.isArray(template.options) && template.options.length >= minOptions, template.id + ' 可选行动不足');
    template.options.forEach(function (option) {
      assert.ok(option.id && option.label, template.id + ' 选项缺少 ID 或标题');
      assert.equal(typeof option.ap, 'number', template.id + '/' + option.id + ' 缺少 AP 消耗');
      assert.ok(option.effects && typeof option.effects === 'object', template.id + '/' + option.id + ' 缺少即时效果');
      assert.ok(Array.isArray(option.delayed), template.id + '/' + option.id + ' 缺少延迟效果字段');
    });
  });
  assert.equal(new Set(D.templates.map(function (t) { return t.id; })).size, D.count, '模板 ID 不唯一');
  const withDelay = D.templates.filter(function (template) {
    return template.options.some(function (option) { return (option.delayed || []).length > 0; });
  });
  assert.ok(withDelay.length >= 8, '带真实延迟后果的事件只有 ' + withDelay.length + ' 条');
  withDelay.forEach(function (template) {
    template.options.forEach(function (option) {
      (option.delayed || []).forEach(function (spec) {
        assert.ok(spec.delay >= 1 && spec.delay <= 5, template.id + ' 延迟窗口数不合理：' + spec.delay);
        assert.ok(spec.label, template.id + ' 延迟后果缺少标题');
        assert.ok(spec.effects && typeof spec.effects === 'object', template.id + ' 延迟后果缺少效果');
      });
    });
  });
});

test('历史属性：四类标注齐全，且都能在界面文案里说出来', function () {
  const kinds = Object.keys(D.historyKinds);
  assert.deepEqual(kinds.sort(), ['assumption', 'fact', 'simulated', 'supported']);
  kinds.forEach(function (kind) { assert.ok(D.historyKinds[kind].length >= 4, kind + ' 的标签太短'); });
  const used = {};
  D.templates.forEach(function (template) { used[template.history] = true; });
  assert.ok(Object.keys(used).length >= 3, '至少应使用三类历史属性，实际 ' + Object.keys(used).join(','));
});

test('条件事件确实由此前决策触发：拒止跑道与保留机场给出不同报告', function () {
  const deny = firedOf(S.ROUTES.counterfactual);
  const keep = firedOf(S.ROUTES.hard);
  assert.ok(deny.fired.indexOf('dyn_runway_transport') !== -1, '拒止跑道后应出现后续评估：' + deny.fired.join(','));
  assert.ok(keep.fired.indexOf('dyn_airfield_kept_pressure') !== -1, '保留机场后应出现设施压力：' + keep.fired.join(','));
  assert.ok(deny.fired.indexOf('dyn_airfield_kept_pressure') === -1, '拒止跑道不应出现「保留机场」的压力报告');
  assert.ok(keep.fired.indexOf('dyn_runway_transport') === -1, '保留机场不应出现「跑道已拒止」的后续评估');
});

test('后续事件按前一条事件接续：机场后续评估之后才有地面推进报告', function () {
  const run = S.play(S.ROUTES.near_history, {});
  const fired = run.state.campaign.dyn.fired;
  if (fired.dyn_airfield_ground_push) {
    assert.ok(fired.dyn_runway_transport, '地面推进报告必须有跑道拒止报告作为前提');
    assert.ok(fired.dyn_airfield_ground_push > fired.dyn_runway_transport, '后续事件的窗口必须晚于触发它的事件');
  }
});

test('事件不重复：同一模板一局只出现一次，触发记录与电报条数一致', function () {
  const run = S.play(S.ROUTES.counterfactual, {});
  const state = run.state;
  const firedIds = Object.keys(state.campaign.dyn.fired);
  assert.equal(new Set(firedIds).size, firedIds.length);
  const items = dynItems(state);
  const itemIds = items.map(function (item) { return item.dynId; });
  assert.equal(new Set(itemIds).size, itemIds.length, '同一条件事件在同一局里出现了两次');
  firedIds.forEach(function (id) { assert.ok(itemIds.indexOf(id) !== -1, '触发记录里的 ' + id + ' 没有对应电报'); });
});

test('同种子同决策可复现，不同种子会出现不同组合', function () {
  const a = firedOf(S.ROUTES.near_history, { seed: 20220224 });
  const b = firedOf(S.ROUTES.near_history, { seed: 20220224 });
  assert.deepEqual(a.fired, b.fired, '同种子同决策必须复现同一组事件');
  assert.equal(a.seed, 20220224);
  const seedList = [20220224, 771031, 9931, 424242, 88];
  const sets = seedList.map(function (seed) { return firedOf(S.ROUTES.near_history, { seed: seed }).fired.join(','); });
  assert.ok(new Set(sets).size > 1, '不同种子应出现不同的摩擦事件组合');
});

test('不同路线至少改变 4 个后续事件', function () {
  const near = firedOf(S.ROUTES.near_history).fired;
  const counter = firedOf(S.ROUTES.counterfactual).fired;
  const hard = firedOf(S.ROUTES.hard).fired;
  const a = new Set(near);
  const b = new Set(counter);
  const diff = near.filter(function (id) { return !b.has(id); }).concat(counter.filter(function (id) { return !a.has(id); }));
  assert.ok(diff.length >= 4, '近历史与代价高昂两条路线的动态事件差异只有 ' + diff.length + ' 条');
  const c = new Set(hard);
  const diff2 = hard.filter(function (id) { return !a.has(id); }).concat(near.filter(function (id) { return !c.has(id); }));
  assert.ok(diff2.length >= 4, '近历史与首都威胁路线的差异只有 ' + diff2.length + ' 条');
});

test('动态事件可以在事务盘里处理，消耗 AP 并留下结果', function () {
  const state = L.createGame({ scenario: 'campaign', seed: 20220224 });
  let guard = 0;
  let target = null;
  let handled = null;
  let before = 0;
  while (!state.ending && guard < 13 && !target) {
    /* 每窗口签发一项可用命令，才能结束窗口；这保证条件事件有真实的前置决策。 */
    const open = L.getAvailableChoices(state);
    if (open.length) {
      const issued = L.issueCommand(state, open[0].id);
      if (issued.ok && issued.command.status === 'issued') L.authorizeCommand(state, issued.command.id);
    }
    L.endRound(state);
    /* 事务盘在过渡阶段生成，进入下一个窗口的晨间阶段后才能处理。 */
    if (state.phase === 'interlude') L.continueFromInterlude(state);
    if (state.phase === 'briefing') {
      const items = dynItems(state).filter(function (item) { return !item.resolved; });
      if (items.length) {
        target = items[0];
        const option = target.options[0];
        assert.ok(option && typeof option.ap === 'number', '条件事件的选项应带 AP 消耗');
        before = state.ap;
        const result = L.resolveDispatch(state, target.id, option.id);
        assert.ok(result.ok, '处理条件事件失败：' + (result.error || ''));
        handled = state.dispatches.filter(function (item) { return item.id === target.id; })[0];
      }
    }
    guard += 1;
  }
  assert.ok(target, '13 个窗口内没有出现任何条件事件');
  assert.ok(handled && handled.resolved, '处理后应标记为已处理');
  assert.ok(handled.outcome && handled.outcome.label, '处理后应留下处理结果');
  assert.ok(state.ap <= before, '处理条件事件不应该增加 AP');
});

test('条件事件的延迟后果会真的排进后续窗口', function () {
  const template = D.templates.filter(function (item) {
    return item.options.some(function (option) { return option.delayed && option.delayed.length; });
  })[0];
  assert.ok(template, '至少应有一个选项带延迟后果');
  const state = L.createGame({ scenario: 'campaign', seed: 20220224 });
  const built = D.build(state, template);
  const withDelay = built.options.filter(function (option) { return option.delayed && option.delayed.length; })[0];
  assert.ok(withDelay, '构建出的事件应保留延迟效果');
  D.record(state, template, 1);
  assert.ok(state.campaign.dyn.fired[template.id], '应写入触发记录');
  assert.ok(state.campaign.dyn.log.length, '应写入事件日志');
  /* 真的排进 pending：模拟一次处理，检查延迟后果进入后续窗口的记录。 */
  const item = { id: 'test-dyn', dynId: template.id, title: template.title, resolved: false, options: [withDelay] };
  state.dispatches.push(item);
  const result = L.resolveDispatch(state, item.id, withDelay.id);
  assert.ok(result.ok, '处理带延迟后果的选项失败：' + (result.error || ''));
  const pending = (state.pending || []).filter(function (record) {
    return record.sourceEventId === 'dyn:' + template.id;
  });
  assert.equal(pending.length, withDelay.delayed.length, '延迟后果没有全部排进后续窗口');
  assert.ok(pending[0].dueRound > state.round, '延迟后果的触发窗口应在当前窗口之后');
});

test('没有战役就不产生条件事件：七日模式不受影响', function () {
  const classic = L.createGame();
  for (let i = 0; i < 3; i += 1) { L.endRound(classic); if (classic.phase === 'interlude') L.continueFromInterlude(classic); }
  assert.equal(L.getDynamicEvents(classic).length, 0, '七日模式不应出现战役条件事件');
  assert.equal(classic.campaign && classic.campaign.dyn, undefined, '七日模式不应建立动态事件记录');
});

test('探明记录：按决策节点分组，未探索的不泄露内容', function () {
  const state = S.play(S.ROUTES.near_history, {}).state;
  const hints = L.getBranchHints(state);
  assert.ok(hints.length >= 6, '应有至少 6 个决策节点的探索状态');
  hints.forEach(function (hint) {
    assert.ok(['unexplored', 'partial', 'explored'].indexOf(hint.state) !== -1, hint.label + ' 状态非法');
    assert.ok(hint.seen <= hint.total, hint.label + ' 已见数量超过总数');
    assert.ok(!/dyn_/.test(hint.label), '不应把内部 ID 显示给玩家');
  });
  const summary = L.getDynamicSummary(state);
  assert.equal(summary.total, Object.keys(state.campaign.dyn.fired).length, '汇总里的条数应等于触发记录');
  assert.equal(summary.remaining, D.count - summary.total, '剩余可触发条数应等于模板总数减去已触发');
  assert.ok(summary.fired.length > 0);
});

test('种子写进本局存档，读回来一致', function () {
  const state = L.createGame({ scenario: 'campaign', seed: 123456 });
  assert.equal(state.campaign.seed, 123456);
  L.saveGame(state);
  const loaded = L.loadSavedGame('campaign');
  assert.ok(loaded && loaded.state);
  assert.equal(loaded.state.campaign.seed, 123456);
  assert.ok(loaded.state.campaign.dyn, '读回后应保留触发记录结构');
  assert.deepEqual(Object.keys(loaded.state.campaign.dyn.fired).sort(), Object.keys(state.campaign.dyn.fired).sort());
});

test('v1.0 存档（schema 5）仍可读，动态事件从当前窗口开始记录', function () {
  const state = L.createGame({ scenario: 'campaign', seed: 99001 });
  const raw = JSON.parse(JSON.stringify({ version: 5, savedAt: new Date().toISOString(), state: state }));
  raw.state.schemaVersion = 5;
  delete raw.state.campaign.seed;
  delete raw.state.campaign.dyn;
  localStorage.setItem(L.campaignSaveKey, JSON.stringify(raw));
  const loaded = L.loadSavedGame('campaign');
  assert.ok(loaded && loaded.state, 'v1.0 存档必须可读');
  assert.equal(loaded.state.schemaVersion, L.campaignVersion);
  assert.ok(loaded.state.campaign.seed > 0, '旧存档应补一个种子');
  assert.deepEqual(loaded.state.campaign.dyn.fired, {}, '不伪造旧存档里没有发生过的动态事件');
});

console.log('\nv1.1 动态战役测试：' + passed + ' 通过，' + failed + ' 失败');
process.exit(failed ? 1 : 0);
