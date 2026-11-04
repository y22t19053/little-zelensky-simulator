/*
 * 《小泽模拟器》v1.2.0 · 故事线系统测试
 * 覆盖：故事线结构、种子激活、分支互斥与后续因果、兜底回声、每窗口推进上限、
 * 决策文件上限、免费内容不占 AP、同种子复现。
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

function newCampaign(seed) {
  return L.createGame({ scenario: 'campaign', seed: seed || 20220224 });
}

/* 签一份文件并立刻授权，返回是否成功 */
function issueAndAuthorize(state, choiceId) {
  const r = L.issueCommand(state, choiceId);
  if (r.ok && r.command && r.command.status === 'issued') L.authorizeCommand(state, r.command.id);
  return r;
}

/* 推进一个窗口：先按当前窗口真实可签的选项签发一项并授权，再结束回合 */
function finishWindow(state) {
  const choices = L.getAvailableChoices(state);
  const pick = choices.slice().sort((a, b) => a.ap - b.ap)[0];
  if (pick) issueAndAuthorize(state, pick.id);
  const r = L.endRound(state);
  if (r.ok && state.phase === 'wrapup_offer') L.declineWrapUp(state);
  if (state.phase === 'interlude') L.continueFromInterlude(state);
  return r;
}

/* 一直推进到指定窗口（含本窗口开始时的简报阶段） */
function advanceTo(state, round) {
  let guard = 0;
  while (state.round < round && guard++ < 20 && !state.ending) finishWindow(state);
  return state;
}

console.log('v1.2 故事线测试');

/* ── 1. 结构 ─────────────────────────────────────────── */
test('故事线至少 6 条，每条有主题、节点、步骤与至少一个决策文件', () => {
  assert.ok(ST.count >= 6, '故事线数量应不少于 6，实际 ' + ST.count);
  const nodes = globalThis.LZS_DYNAMIC.replayNodes;
  let aligned = 0;
  ST.storylines.forEach((line) => {
    assert.ok(line.id && line.title && line.theme, '故事线缺少基本字段：' + line.id);
    assert.ok(typeof line.node === 'string' && line.node.length >= 3, '故事线缺少节点名：' + line.id);
    if (nodes[line.node]) aligned += 1;
    assert.ok(line.steps.length >= 3, line.id + ' 至少应有 3 个阶段，实际 ' + line.steps.length);
    const files = line.steps.filter((s) => s.kind === 'file');
    assert.ok(files.length >= 1, line.id + ' 至少需要 1 份需要总统拍板的决策文件');
  });
  assert.ok(aligned >= 6, '至少 6 条故事线要挂在推演室已有的决策节点上，实际 ' + aligned);
});

test('每个阶段都有可触发窗口、内容属性与来源，没有空洞占位', () => {
  ST.storylines.forEach((line) => {
    line.steps.forEach((step) => {
      assert.ok(Array.isArray(step.window) && step.window.length === 2, step.id + ' 缺少触发窗口');
      assert.ok(step.window[0] >= 1 && step.window[1] <= 13, step.id + ' 窗口越界');
      const titles = (step.variants || []).map((v) => v.title).concat(step.title || []);
      titles.forEach((t) => assert.ok(t && t.length >= 5, step.id + ' 标题过短：' + t));
      const bodies = (step.variants || []).map((v) => v.body || '').concat(step.body || []);
      const longest = bodies.sort((a, b) => b.length - a.length)[0] || '';
      assert.ok(longest.length >= 40, step.id + ' 正文过短，属于填充');
      assert.ok(['fact', 'reported', 'supported', 'simulated', 'assumption'].indexOf(step.history) !== -1, step.id + ' 缺少历史属性');
      if (step.kind === 'file') {
        assert.ok(step.options && step.options.length >= 2, step.id + ' 决策文件至少要有两个实质选项');
        step.options.forEach((opt) => {
          assert.ok(opt.id && opt.label, step.id + ' 选项缺少 id 或标签');
          assert.ok(typeof opt.ap === 'number', step.id + ' 选项缺少 AP');
          assert.ok(opt.setFlags && opt.setFlags.length, step.id + ' 选项没有留下分支旗标，后续无法产生因果');
        });
      }
    });
  });
});

test('故事线由种子决定：不同种子激活不同的主轴组合', () => {
  const sets = {};
  for (let i = 0; i < 40; i += 1) {
    const seed = 20220224 + i * 7919;
    const picked = ST.pick(seed);
    assert.equal(picked.active.length, ST.primaryLines, '主轴数量应固定');
    assert.equal(picked.aux.length, ST.auxLines, '辅线数量应固定');
    assert.equal(picked.active.filter((id) => picked.aux.indexOf(id) !== -1).length, 0, '主轴与辅线不能重叠');
    sets[picked.active.slice().sort().join(',')] = true;
  }
  assert.ok(Object.keys(sets).length >= 5, '40 个种子至少应产生 5 种主轴组合，实际 ' + Object.keys(sets).length);
});

test('同一种子给出同一组故事线（可复现）', () => {
  const a = ST.pick(20220224);
  const b = ST.pick(20220224);
  assert.deepEqual(a, b);
});

test('新战役把种子与激活结果写进存档', () => {
  const state = newCampaign(777);
  const story = state.campaign.story;
  assert.equal(story.seed, 777);
  assert.ok(story.active.length === ST.primaryLines);
  assert.ok(story.activated);
});

/* ── 2. 分支与因果 ───────────────────────────────────── */
test('机场故事线：两种处理方式走向互斥的回声，后续内容不同', () => {
  function runTo(seed, choiceId, targetRound) {
    const state = newCampaign(seed);
    advanceTo(state, 2);
    const issued = issueAndAuthorize(state, choiceId);
    assert.ok(issued.ok, choiceId + ' 应能在第 2 窗口签发：' + (issued.error || ''));
    advanceTo(state, targetRound);
    return state.campaign.feed.map((item) => item.stepId).concat(
      (state.dispatches || []).filter((d) => d.type === 'story').map((d) => d.storyStepId)
    );
  }
  const denied = runTo(20220224, 'c_deny_runway', 5);
  const kept = runTo(20220224, 'c_keep_airfield', 5);
  assert.ok(denied.indexOf('line_airfield_2') !== -1, '拒止跑道应出现工程器材倾斜的回声：' + denied.join(','));
  assert.ok(kept.indexOf('line_airfield_2b') !== -1, '保留设施应出现防护需求的回声：' + kept.join(','));
  assert.equal(denied.indexOf('line_airfield_2b'), -1, '两种分支不能同时出现');
  assert.equal(kept.indexOf('line_airfield_2'), -1, '两种分支不能同时出现');
});

test('故事线决策文件的选项会写入分支旗标，并在复盘中留下走向', () => {
  const state = newCampaign(20220224);
  let resolved = null;
  let guard = 0;
  while (!resolved && guard++ < 15 && !state.ending) {
    const file = (state.dispatches || []).filter((d) => d.type === 'story' && !d.resolved)[0];
    if (file && state.phase === 'briefing') {
      const branch = (file.options || []).filter((o) => o.id !== 'defer' && o.setFlags && o.setFlags.length)[0];
      assert.ok(branch, '故事线文件应有留下分支旗标的选项：' + file.storyId);
      assert.equal(file.options[file.options.length - 1].id, 'defer', '未处理时默认结算应是中性的搁置选项');
      const r = L.resolveDispatch(state, file.id, branch.id);
      assert.ok(r.ok, '应能处理故事线文件：' + (r.error || ''));
      branch.setFlags.forEach((flag) => assert.ok(state.flags[flag], '分支旗标应写入 state.flags：' + flag));
      resolved = { lineId: file.storyId, label: branch.branchLabel };
      break;
    }
    finishWindow(state);
  }
  assert.ok(resolved, '整局应至少产生一份故事线决策文件');
  const path = state.campaign.story.paths[resolved.lineId];
  assert.ok(path && path.label, '复盘应记录这条线的走向：' + JSON.stringify(path));
  assert.equal(path.label, resolved.label, '复盘记录的走向应与玩家选择的标签一致');
});

test('一直搁置时故事线不会消失，会留下按默认安排继续的回声', () => {
  const state = newCampaign(20220224);
  advanceTo(state, 12);
  const deferred = state.campaign.feed.filter((item) => item.stepId && item.stepId.indexOf('_deferred') !== -1);
  assert.ok(deferred.length >= 1, '至少应有一条兜底回声，实际 ' + deferred.length);
});

test('每个窗口每条故事线最多推进一个阶段', () => {
  const state = newCampaign(20220224);
  issueAndAuthorize(state, 'c_deny_runway');
  const pack = ST.advance(state);
  const byLine = {};
  pack.feed.concat(pack.files).forEach((item) => {
    byLine[item.lineId] = (byLine[item.lineId] || 0) + 1;
  });
  Object.keys(byLine).forEach((lineId) => {
    assert.ok(byLine[lineId] <= 1, lineId + ' 在一个窗口里推进了 ' + byLine[lineId] + ' 个阶段');
  });
});

test('每个窗口最多一份故事线决策文件，且总文件数受上限约束', () => {
  const state = newCampaign(20220224);
  issueAndAuthorize(state, 'c_deny_runway');
  const pack = ST.advance(state);
  assert.ok(pack.files.length <= 1, '一个窗口不应同时抛出多份故事线文件');
  assert.ok(ST.fileCap >= 2 && ST.fileCap <= 4, '一局的故事线文件上限应控制在 2—4 份，实际 ' + ST.fileCap);
});

test('故事线文件会降级为免费动态，而不是塞满工作台', () => {
  const state = newCampaign(20220224);
  issueAndAuthorize(state, 'c_deny_runway');
  let files = 0;
  let degraded = 0;
  let guard = 0;
  while (state.round < 12 && guard++ < 30 && !state.ending) {
    const before = (state.dispatches || []).filter((d) => d.type === 'story').length;
    finishWindow(state);
    files = (state.dispatches || []).filter((d) => d.type === 'story').length;
    degraded = state.campaign.feed.filter((item) => /没有形成需要总统签字的文件/.test(item.body || '')).length;
    assert.ok(state.round > 0, '窗口应推进');
    assert.ok(before >= 0);
  }
  assert.ok(files <= ST.fileCap, '故事线文件总数不应超过上限，实际 ' + files);
  assert.ok(degraded >= 1, '超出上限的阶段应降级成免费动态，实际 ' + degraded);
});

/* ── 3. 内容分层 ─────────────────────────────────────── */
test('第一窗口就有免费局势动态，且不消耗注意力', () => {
  const state = newCampaign(20220224);
  const feed = state.campaign.feed || [];
  assert.ok(feed.length >= 2, '开局应至少两条免费动态，实际 ' + feed.length);
  assert.equal(state.ap, state.apMax, '免费动态不应消耗注意力');
  feed.forEach((item) => {
    assert.ok(item.title && item.body, '动态缺少标题或正文');
    assert.ok(item.history, '动态缺少内容属性');
  });
});

test('局势动态有每窗口上限，不会刷屏', () => {
  const state = newCampaign(20220224);
  issueAndAuthorize(state, 'c_deny_runway');
  let guard = 0;
  while (state.round < 9 && guard++ < 20 && !state.ending) finishWindow(state);
  const perRound = {};
  (state.campaign.feed || []).forEach((item) => {
    perRound[item.round] = (perRound[item.round] || 0) + 1;
  });
  Object.keys(perRound).forEach((round) => {
    assert.ok(perRound[round] <= 4, '第 ' + round + ' 个窗口有 ' + perRound[round] + ' 条动态，超出上限');
  });
});

test('故事线复盘能说明本局主线与走向', () => {
  const state = newCampaign(20220224);
  issueAndAuthorize(state, 'c_deny_runway');
  let guard = 0;
  while (state.round < 11 && guard++ < 24 && !state.ending) finishRound(state);
  function finishRound(g) { finishWindow(g); }
  const summary = ST.summary(state);
  assert.ok(summary.active.length === ST.primaryLines);
  const narrative = ST.narrative(state);
  assert.ok(/本局的主线是/.test(narrative), '复盘叙述应说明本局主线：' + narrative);
  const seen = summary.lines.filter((line) => line.state !== 'unexplored');
  assert.ok(seen.length >= ST.primaryLines, '至少主轴都应被算作已展开');
});

test('七日经典模式没有故事线数据', () => {
  const classic = L.createGame();
  assert.ok(!classic.campaign || !classic.campaign.story, '经典模式不应激活故事线');
});

test('存读档保留故事线与免费动态，不伪造未发生的内容', () => {
  const state = newCampaign(4242);
  issueAndAuthorize(state, 'c_deny_runway');
  ST.advance(state);
  finishWindow(state);
  L.saveGame(state);
  const loaded = L.loadSavedGame('campaign');
  assert.ok(loaded && loaded.state);
  const story = loaded.state.campaign.story;
  assert.ok(story && story.activated, '存档应保留故事线状态');
  assert.equal(story.seed, 4242);
  assert.deepEqual(story.active, state.campaign.story.active);
  assert.ok(Array.isArray(loaded.state.campaign.feed), '存档应保留免费动态');
  assert.equal(loaded.state.campaign.feed.length, state.campaign.feed.length);
});

console.log('v1.2 故事线测试：' + passed + ' 通过，' + failed + ' 失败');
if (failed) process.exit(1);
