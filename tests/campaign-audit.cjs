/*
 * v0.6 战役策略审计：每个关键节点逐一强制各选项，其余窗口随机（同一组种子），
 * 比较结局分布；同时对比“只做最便宜的一件事”的被动策略。数值为模拟设计值。
 * 运行：node tests/campaign-audit.cjs
 */
'use strict';
const sim = require('./campaign-sim.cjs');
const L = globalThis.LZS;
const C = globalThis.LZS_CAMPAIGN;
const N = Number(process.env.N || 240);
const GOOD = { c_A: 1, c_D: 1, c_H: 1 };
function run(force, frugal) {
  const counts = {}; let good = 0; let held = 0;
  for (let i = 0; i < N; i += 1) {
    const rng = sim.seeded(5000 + i);
    const base = sim.randomPolicy(rng, frugal);
    const policy = function (state, event) {
      const picks = force && force[event.id] ? force[event.id].slice() : [];
      return picks.concat(base(state, event).filter(function (id) { return picks.indexOf(id) === -1; }));
    };
    const out = sim.play(policy).state.ending;
    counts[out.code] = (counts[out.code] || 0) + 1;
    if (GOOD[out.id]) good += 1;
    if (out.id === 'c_A' || out.id === 'c_B' || out.id === 'c_D' || out.id === 'c_H') held += 1;
  }
  return { counts: counts, good: good / N, held: held / N };
}
function fmt(r) { return Object.keys(r.counts).sort().map(function (k) { return k + ':' + r.counts[k]; }).join(' ') + ' | A/D/H ' + (r.good * 100).toFixed(0) + '% | 首都保全且未陷入 C/E/F/G ' + (r.held * 100).toFixed(0) + '%'; }
console.log('战役策略审计（每组 ' + N + ' 局，同一组随机种子）');
console.log('\n[基准] 随机 ' + fmt(run(null, false)));
console.log('[被动] 每窗口只做一件 ' + fmt(run(null, true)));
const issues = [];
C.events.filter(function (e) { return e.key; }).forEach(function (event) {
  const opts = event.choices.filter(function (c) { return c.keyDecision && !c.requires; });
  console.log('\n[' + event.id + ' ' + event.title + ']');
  const rates = [];
  opts.forEach(function (choice) {
    const force = {}; force[event.id] = [choice.id];
    const r = run(force, false);
    rates.push(r.held);
    console.log('  ' + choice.id.padEnd(22) + fmt(r));
  });
  const max = Math.max.apply(null, rates); const min = Math.min.apply(null, rates);
  if (rates.length > 1 && max - min > 0.6) issues.push(event.id + ' 选项差距过大 ' + (min * 100).toFixed(0) + '–' + (max * 100).toFixed(0) + '%');
});
console.log('\n结论：' + (issues.length ? issues.join('；') : '没有发现单个关键选项把首都保全率拉开 60 个百分点以上。'));
console.log('提示：这些比例只说明模型内部的相对风险，不代表历史概率。');