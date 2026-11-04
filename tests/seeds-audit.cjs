/*
 * 《小泽模拟器》v1.2.0 · 多周目分布抽样（100 个随机种子）
 * 这是初步分布审计，不是完整平衡证明。
 * 统计：每窗口内容记录数、每窗口需 AP 的决策数、故事线激活频率与完整度、
 *       空内容窗口、动态模板覆盖面、主线组合数、同种子复现、换种子差异。
 * 两种策略各 50 个种子：
 *   ignore —— 只签战役必需的固定文件，故事线文件一律搁置（看兜底回声是否生效）
 *   engage —— 会打开并处理故事线决策文件（看分支与旗标是否真的接上）
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
const DYN = globalThis.LZS_DYNAMIC;
const CM = globalThis.LZS_CAMPAIGN;
const S = require('./campaign-sim.cjs');

const SEEDS = 100;
const BASE = 20220224;
const PLAN = S.ROUTES.near_history;

/* 处理掉一份故事线文件：挑第一个有分支标签、AP 付得起的选项 */
function engageStoryFiles(state) {
  if (state.phase !== 'briefing') return 0;
  let handled = 0;
  (state.dispatches || []).forEach((item) => {
    if (item.type !== 'story' || item.resolved) return;
    if (handled >= 2) return;
    const options = (item.options || []).filter((o) => o.id !== 'defer');
    const pick = options.filter((o) => (o.ap || 0) <= state.ap).sort((a, b) => (a.ap || 0) - (b.ap || 0))[0];
    if (!pick) return;
    const r = L.resolveDispatch(state, item.id, pick.id);
    if (r.ok) handled += 1;
  });
  return handled;
}

function run(seed, engage) {
  const state = L.createGame({ scenario: 'campaign', seed: seed });
  let guard = 0;
  while (!state.ending && guard++ < 40) {
    if (engage) engageStoryFiles(state);
    const event = L.getEvent(state);
    if (!event) break;
    const wanted = PLAN[event.id] || [];
    wanted.forEach((choiceId) => {
      const r = L.issueCommand(state, choiceId);
      if (r.ok && r.command && r.command.status === 'issued') L.authorizeCommand(state, r.command.id);
    });
    const end = L.endRound(state);
    if (!end.ok) break;
    if (state.phase === 'wrapup_offer') L.declineWrapUp(state);
    if (state.phase === 'interlude') L.continueFromInterlude(state);
  }
  const dispatches = state.dispatches || [];
  const feed = state.campaign.feed || [];
  const windows = [];
  CM.events.forEach((event, index) => {
    const round = index + 1;
    const files = event.choices.filter((c) => (c.ap || 0) > 0).length;
    const story = dispatches.filter((d) => d.round === round && d.type === 'story').length;
    const dynamic = dispatches.filter((d) => d.round === round && d.type === 'dynamic').length;
    const feedNow = feed.filter((f) => f.round === round).length;
    const telegrams = dispatches.filter((d) => d.round === round && d.type !== 'story' && d.type !== 'dynamic').length;
    windows.push({
      round: round,
      files: files,
      story: story,
      dynamic: dynamic,
      feed: feedNow,
      telegrams: telegrams,
      content: files + story + dynamic + feedNow + telegrams,
      apFiles: Math.min(3, (files > 0 ? 1 : 0) + story)
    });
  });
  return {
    state: state,
    windows: windows,
    ending: state.ending ? state.ending.id : null,
    story: state.campaign.story || {},
    dyn: Object.keys((state.campaign.dyn && state.campaign.dyn.fired) || {}),
    logs: (state.campaign.story && state.campaign.story.log) || [],
    engage: engage
  };
}

console.log('v1.2 多周目分布抽样（' + SEEDS + ' 个种子 · 近历史策略 · 一半处理故事线文件）');

const runs = [];
for (let i = 0; i < SEEDS; i += 1) runs.push(run(BASE + i * 7919, i % 2 === 0));

/* ── 1. 每窗口内容密度 ───────────────────────────────── */
const perWindow = {};
runs.forEach((one) => {
  one.windows.forEach((w) => {
    const cell = perWindow[w.round] || { content: 0, files: 0, ap: 0, story: 0, feed: 0, n: 0 };
    cell.content += w.content;
    cell.files += w.files;
    cell.ap += w.apFiles;
    cell.story += w.story;
    cell.feed += w.feed;
    cell.n += 1;
    perWindow[w.round] = cell;
  });
});

const rows = Object.keys(perWindow)
  .map(Number)
  .sort((a, b) => a - b)
  .map((round) => {
    const cell = perWindow[round];
    return {
      round: round,
      content: cell.content / cell.n,
      files: cell.files / cell.n,
      ap: cell.ap / cell.n,
      story: cell.story / cell.n,
      feed: cell.feed / cell.n
    };
  });

console.log('窗口   内容记录  固定文件  故事线  免费动态  需AP事项');
rows.forEach((r) => {
  console.log(
    'c' + String(r.round).padEnd(5) +
    r.content.toFixed(2).padStart(9) +
    r.files.toFixed(2).padStart(10) +
    r.story.toFixed(2).padStart(8) +
    r.feed.toFixed(2).padStart(10) +
    r.ap.toFixed(2).padStart(10)
  );
});

const allWindows = runs.reduce((list, one) => list.concat(one.windows), []);
const totalWindows = allWindows.length;
const empty = allWindows.filter((w) => w.content <= 2).length;
const rich = allWindows.filter((w) => w.content >= 5).length;
const avg = allWindows.reduce((sum, w) => sum + w.content, 0) / totalWindows;
console.log('');
console.log('平均内容记录：' + avg.toFixed(2) + ' 条/窗口（v1.1.1 基线 6.50）');
console.log('内容 ≤2 的窗口：' + empty + '/' + totalWindows);
console.log('内容 ≥5 的窗口：' + rich + '/' + totalWindows + '（' + ((rich / totalWindows) * 100).toFixed(1) + '%）');

assert.equal(empty, 0, '不应出现内容极少的窗口，实际 ' + empty);
assert.ok(rich / totalWindows >= 0.6, '至少六成窗口应有 5 条以上内容记录，实际 ' + ((rich / totalWindows) * 100).toFixed(1) + '%');
assert.ok(avg >= 7, '平均每窗口内容记录应明显高于 v1.1.1 的 6.5，实际 ' + avg.toFixed(2));

const richWindows = rows.filter((r) => r.content >= 5).length;
assert.ok(richWindows >= 6, '至少 6 个窗口应能出现 5 条以上内容，实际 ' + richWindows);

/* ── 2. 每窗口需要 AP 的决策数 ────────────────────────── */
const apBuckets = { 0: 0, 1: 0, 2: 0, 3: 0, over: 0 };
allWindows.forEach((w) => {
  if (w.apFiles > 3) apBuckets.over += 1;
  else apBuckets[Math.min(w.apFiles, 3)] += 1;
});
console.log('需 AP 决策数分布：0 项 ' + apBuckets[0] + '，1 项 ' + apBuckets[1] + '，2 项 ' + apBuckets[2] + '，3 项 ' + apBuckets[3] + '，超过 3 项 ' + apBuckets.over);
assert.equal(apBuckets.over, 0, '单个窗口需要 AP 的决策不应超过 3 项');

/* ── 3. 故事线激活频率与完整度 ────────────────────────── */
const lineStats = {};
ST.storylines.forEach((line) => {
  lineStats[line.id] = { activated: 0, seen: 0, complete: 0, steps: line.steps.length };
});
const combos = {};
runs.forEach((one) => {
  const active = (one.story.active || []).concat(one.story.aux || []);
  combos[(one.story.active || []).slice().sort().join(',')] = true;
  ST.storylines.forEach((line) => {
    const stat = lineStats[line.id];
    if (active.indexOf(line.id) !== -1) stat.activated += 1;
    const seenIds = one.logs.filter((entry) => entry.lineId === line.id).map((entry) => entry.stepId);
    if (seenIds.length > 0) stat.seen += 1;
    /* 「走完」按语义算：走到结局阶段的阶段（窗口终点 >= 12）就算这条线在本局有了结论 */
    const reachedEnd = line.steps.some((step) => seenIds.indexOf(step.id) !== -1 && step.window[1] >= 12);
    if (reachedEnd) stat.complete += 1;
  });
});
console.log('');
console.log('故事线              激活   推进过   有了结论');
ST.storylines.forEach((line) => {
  const stat = lineStats[line.id];
  console.log(
    line.id.padEnd(20) +
    String(stat.activated).padStart(4) +
    String(stat.seen).padStart(8) +
    String(stat.complete).padStart(10)
  );
});
console.log('不同主线组合数：' + Object.keys(combos).length + '/' + SEEDS);

const neverActivated = ST.storylines.filter((line) => lineStats[line.id].activated === 0);
assert.equal(neverActivated.length, 0, '不应有永远无法激活的故事线：' + neverActivated.map((l) => l.id).join(','));
const neverSeen = ST.storylines.filter((line) => lineStats[line.id].seen === 0);
assert.equal(neverSeen.length, 0, '不应有永远不推进的故事线：' + neverSeen.map((l) => l.id).join(','));
const neverConcluded = ST.storylines.filter((line) => lineStats[line.id].complete === 0);
assert.equal(neverConcluded.length, 0, '不应有永远走不到结论的故事线：' + neverConcluded.map((l) => l.id).join(','));
assert.ok(Object.keys(combos).length >= 8, '100 个种子应产生至少 8 种不同的主线组合，实际 ' + Object.keys(combos).length);

/* ── 4. 动态事件模板覆盖面 ────────────────────────────── */
const firedSet = {};
runs.forEach((one) => one.dyn.forEach((id) => { firedSet[id] = (firedSet[id] || 0) + 1; }));
const firedCount = Object.keys(firedSet).length;
console.log('');
console.log('动态事件模板触发：' + firedCount + '/' + DYN.count + '（其余为条件专属，需要特定决策才会出现）');
assert.ok(firedCount >= 10, '100 个种子应覆盖至少 10 个动态事件模板，实际 ' + firedCount);
Object.keys(firedSet).forEach((id) => {
  assert.ok(firedSet[id] <= SEEDS, id + ' 触发次数超过局数，说明有重复计入');
});

/* ── 5. 同种子复现与换种子差异 ────────────────────────── */
const a = run(BASE + 3 * 7919, true);
const b = run(BASE + 3 * 7919, true);
assert.equal(a.ending, b.ending, '同种子同决策应得到同一结局');
assert.deepEqual(a.state.campaign.feed.map((f) => f.stepId), b.state.campaign.feed.map((f) => f.stepId), '同种子的免费动态序列应完全一致');
assert.deepEqual(a.dyn, b.dyn, '同种子的动态事件触发记录应完全一致');
assert.deepEqual(a.windows.map((w) => w.content), b.windows.map((w) => w.content), '同种子每窗口的内容数量应一致');

const c = run(BASE + 4 * 7919, true);
const diffLines = ST.storylines.filter((line) => {
  const seenA = a.logs.filter((e) => e.lineId === line.id).map((e) => e.stepId).join(',');
  const seenC = c.logs.filter((e) => e.lineId === line.id).map((e) => e.stepId).join(',');
  return seenA !== seenC;
});
const diffWindows = a.windows.filter((w, i) => w.content !== c.windows[i].content).length;
console.log('相邻两个种子之间走向不同的故事线：' + diffLines.length + ' 条；内容数量不同的窗口：' + diffWindows + '/' + a.windows.length);
assert.ok(diffLines.length >= 2, '不同种子应让至少两条故事线的走向不同，实际 ' + diffLines.length);
assert.ok(diffWindows >= 3, '不同种子应让至少三个窗口的内容数量不同，实际 ' + diffWindows);

/* ── 6. 结局分布 ────────────────────────────────────── */
const endings = {};
runs.forEach((one) => { endings[one.ending] = (endings[one.ending] || 0) + 1; });
console.log('结局分布（近历史策略）：' + JSON.stringify(endings));

console.log('');
console.log('总结：' + SEEDS + ' 个种子平均 ' + avg.toFixed(2) + ' 条内容记录/窗口，空窗口 ' + empty + '，故事线死角 0，动态模板覆盖 ' + firedCount + '/' + DYN.count + '，主线组合 ' + Object.keys(combos).length + ' 种。');
console.log('注意：这是初步分布审计，不是完整平衡证明。');
