/*
 * v1.0 治理方式端到端对比：同一套重大决策（历史近似路线），只改变日常事务的处理方式。
 * 运行：node tests/governance.test.cjs
 * 数值是模拟设计值，不是历史统计。
 */
'use strict';
const assert = require('node:assert/strict');
process.argv.push('--quiet');
const S = require('./campaign-sim.cjs');
const L = globalThis.LZS;
const PLAN = S.ROUTES.near_history;

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed += 1; console.log('  ✓ ' + name); } catch (e) { failed += 1; console.log('  ✗ ' + name + '\n    ' + (e && e.message)); }
}

function sign(state, id, options) {
  const r = L.issueCommand(state, id, options);
  if (!r.ok) return null;
  if (r.command.status === 'issued') L.authorizeCommand(state, r.command.id);
  if (r.command.status === 'blocked' && r.command.blockedCode === 'INFO' && r.command.intelReportId && L.inquireIntel(state, r.command.intelReportId).ok) L.authorizeCommand(state, r.command.id);
  return r.command;
}

/* president = 重大与例行都亲自办，余下注意力全部用于追问与协调；
 * delegation = 例行（1AP、非关键）全部委派并开常设授权；
 * military = 只给总参谋部开常设授权，其余亲自办；
 * distributed = 内务/后勤/外交各开常设授权并委派例行事务。 */
function run(style, breadth) {
  const state = L.createGame({ scenario: 'campaign' });
  const stats = { extra: 0, personalAp: 0, delegated: 0, standingHandled: 0, grants: 0, minCoordination: 100 };
  let guard = 0;
  while (!state.ending && guard++ < 40) {
    const event = L.getEvent(state);
    if (state.round === 1) {
      const grant = { delegation: ['logistics', 'interior'], military: ['general_staff'], distributed: ['interior', 'logistics', 'foreign'] }[style] || [];
      grant.forEach((id) => { if (L.grantStanding(state, id).ok) stats.grants += 1; });
    }
    (PLAN[event.id] || []).forEach((id) => {
      if (state.ending) return;
      const delegable = (style === 'delegation' || style === 'distributed') && L.checkDelegation(state, id, {}).ok;
      const c = delegable ? sign(state, id, { delegate: true }) : sign(state, id);
      if (c && c.delegation) stats.delegated += 1;
    });
    if (!state.executed.length) {
      const cheap = L.getAvailableChoices(state).sort((a, b) => a.ap - b.ap)[0];
      if (cheap) sign(state, cheap.id);
    }
    if (!state.ending && breadth) {
      /* 把省下来的注意力花在更多事务上：能委派的委派，其余亲自办。 */
      const useDelegate = style === 'delegation' || style === 'distributed';
      let n = 0;
      const pool = L.getAvailableChoices(state).filter((c) => !c.keyDecision).sort((a, b) => a.ap - b.ap || (a.id < b.id ? -1 : 1));
      for (const c of pool) {
        if (state.ending || n >= 4 || state.ap <= 0) break;
        const d = useDelegate && L.checkDelegation(state, c.id, {}).ok;
        const cmd = d ? sign(state, c.id, { delegate: true }) : (state.ap >= c.ap ? sign(state, c.id) : null);
        if (cmd) { n += 1; stats.extra += 1; if (cmd.delegation) stats.delegated += 1; }
      }
    }
    if (!state.ending && !breadth) {
      let g = 0;
      while (state.ap > 0 && g++ < 6) {
        const open = state.commands.filter((c) => ['blocked', 'executing', 'issued'].includes(c.status) && !c.effectsApplied);
        let acted = false;
        for (const c of open) {
          if (c.status === 'issued') { if (L.authorizeCommand(state, c.id).ok) { acted = true; break; } continue; }
          if (!(state.coordinationThisRound || {})[c.agency] && L.coordinateAgency(state, c.agency).ok) { acted = true; break; }
          if (L.followUpCommand(state, c.id).ok) { acted = true; break; }
        }
        if (!acted) break;
      }
    }
    if (state.ending) break;
    stats.personalAp += state.commands.filter((c) => c.round === state.round).reduce((a, c) => a + (c.paidAp != null ? c.paidAp : c.ap), 0);
    Object.values(state.agencies).forEach((a) => { stats.minCoordination = Math.min(stats.minCoordination, a.coordination); });
    const ended = L.endRound(state);
    assert.equal(ended.ok, true, event.id + ' endRound: ' + (ended.error || ''));
    if (state.phase === 'wrapup_offer') L.declineWrapUp(state);
    if (state.phase === 'interlude') L.continueFromInterlude(state);
  }
  assert.ok(state.ending, style + ' 路线没有结束（死锁）');
  Object.values(state.standing || {}).forEach((r) => { stats.standingHandled += r.handled || 0; });
  return { state, stats, ending: state.ending.id, kyiv: state.stats.kyiv, pressure: state.pressure };
}

const results = {};
['president', 'delegation', 'military', 'distributed'].forEach((style) => { results[style] = run(style); });
const wide = {};
['president', 'delegation', 'distributed'].forEach((style) => { wide[style] = run(style, true); });

console.log('治理方式对比（同一套重大决策）：');
Object.keys(results).forEach((k) => {
  const r = results[k];
  console.log('  ' + k.padEnd(12) + ' 结局 ' + r.ending + '  基辅 ' + r.kyiv + '  压力 ' + r.pressure + '  总统亲自占用 AP ' + r.stats.personalAp + '  委派 ' + r.stats.delegated + '  常设授权办理 ' + r.stats.standingHandled + '  最低协调 ' + r.stats.minCoordination);
});

console.log('同一套重大决策 + 把剩余注意力花在更多事务上：');
Object.keys(wide).forEach((k) => { const r = wide[k]; console.log('  ' + k.padEnd(12) + ' 结局 ' + r.ending + '  基辅 ' + r.kyiv + '  压力 ' + r.pressure + '  额外办理 ' + r.stats.extra + ' 项  委派 ' + r.stats.delegated + '  最低协调 ' + r.stats.minCoordination); });

test('省下的注意力能办更多事：委派路线额外办理的事务多于亲自办理路线', function () {
  assert.ok(wide.delegation.stats.extra > wide.president.stats.extra, '委派 ' + wide.delegation.stats.extra + ' > 亲自 ' + wide.president.stats.extra);
  assert.ok(wide.distributed.stats.extra > wide.president.stats.extra, '分布式 ' + wide.distributed.stats.extra + ' > 亲自 ' + wide.president.stats.extra);
});

test('广度路线仍有代价：协调余量低于亲自办理路线，且都走到结局', function () {
  Object.keys(wide).forEach((k) => assert.ok(wide[k].state.ending, k));
  assert.ok(wide.delegation.stats.minCoordination < wide.president.stats.minCoordination, '委派最低协调 ' + wide.delegation.stats.minCoordination + ' < 亲自 ' + wide.president.stats.minCoordination);
});

test('四种治理方式都能走到结局，没有死锁', function () {
  Object.keys(results).forEach((k) => assert.ok(results[k].state.ending, k));
});

test('委派与常设授权确实减少总统亲自占用的 AP（但不是零）', function () {
  assert.ok(results.delegation.stats.delegated > 0, '委派路线至少发生过委派');
  assert.ok(results.delegation.stats.personalAp < results.president.stats.personalAp, '委派路线总统占用更少：' + results.delegation.stats.personalAp + ' < ' + results.president.stats.personalAp);
  assert.ok(results.delegation.stats.personalAp > 0, '重大决策仍由总统亲自承担');
});

test('委派有代价：协调余量被消耗', function () {
  assert.ok(results.delegation.stats.minCoordination <= 60, '委派路线协调余量被消耗，最低 ' + results.delegation.stats.minCoordination);
});

test('不存在无限免费收益：数值在界内，不同方式没有碾压式差距', function () {
  Object.keys(results).forEach((k) => {
    const r = results[k];
    assert.ok(r.kyiv >= 0 && r.kyiv <= 100 && r.pressure >= 0 && r.pressure <= 100, k);
  });
  const ks = Object.values(results).map((r) => r.kyiv);
  assert.ok(Math.max.apply(null, ks) - Math.min.apply(null, ks) <= 30, '治理方式差异不应造成碾压式差距：' + ks.join('/'));
});

test('撤销授权：花 1 AP、协调 -3；到期自动失效', function () {
  const s = L.createGame({ scenario: 'campaign' });
  assert.equal(L.grantStanding(s, 'logistics').ok, true);
  const apBefore = s.ap, coBefore = s.agencies.logistics.coordination;
  const r = L.revokeStanding(s, 'logistics');
  assert.equal(r.ok, true);
  assert.equal(s.ap, apBefore - 1);
  assert.equal(s.agencies.logistics.coordination, coBefore - 3);
  assert.equal(s.standing.logistics.active, false);
  assert.equal(s.standing.logistics.endReason, 'revoked');
  const t = L.createGame({ scenario: 'campaign' });
  L.grantStanding(t, 'interior');
  for (let i = 0; i < 6 && !t.ending; i++) {
    const cheap = L.getAvailableChoices(t).sort((a, b) => a.ap - b.ap)[0];
    if (cheap) sign(t, cheap.id);
    L.endRound(t);
    if (t.phase === 'interlude') L.continueFromInterlude(t);
  }
  assert.equal(t.standing.interior.active, false, '到期失效');
  assert.equal(t.standing.interior.endReason, 'expired');
});

test('重大决策不能委派', function () {
  const s = L.createGame({ scenario: 'campaign' });
  const ev = L.getEvent(s);
  const major = ev.choices.find((c) => c.keyDecision || c.ap > 1);
  assert.ok(major, '首个窗口有重大选项');
  assert.equal(L.checkDelegation(s, major.id, {}).ok, false);
});

console.log('\n治理测试：' + passed + ' 通过，' + failed + ' 失败');
if (failed) process.exit(1);
