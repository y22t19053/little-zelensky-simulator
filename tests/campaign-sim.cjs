/*
 * v0.6 基辅战役模拟审计：三条端到端路线 + 随机/最小行动策略分布。
 * 运行：node tests/campaign-sim.cjs [--quiet]
 * 所有数值是模拟设计值。本脚本只读，不写存档文件。
 */
'use strict';
const assert = require('node:assert/strict');
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
const quiet = process.argv.includes('--quiet');

function seeded(seed) {
  let s = seed >>> 0;
  return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function issue(state, id) {
  const r = L.issueCommand(state, id);
  if (!r.ok) return null;
  if (r.command.status === 'issued') L.authorizeCommand(state, r.command.id);
  // 低可信情报门槛：先追问（1 AP）再重新授权。
  if (r.command.status === 'blocked' && r.command.blockedCode === 'INFO' && r.command.intelReportId && L.inquireIntel(state, r.command.intelReportId).ok) L.authorizeCommand(state, r.command.id);
  return r.command;
}

// v0.7: window AP rose to 4-5. Baseline routes only spend the v0.6-equivalent budget (3) on follow-ups;
// extra AP is exercised by delegation / standing-authority / extra-decision routes.
const BASELINE_AP = 3;
function spend(state, mode) {
  let guard = 0;
  const base = state.round === 8 ? 2 : BASELINE_AP; /* c8 在 v0.6 只有 2 AP */ const floor = Math.max(0, (state.apMax || base) - base);
  while (!state.ending && state.ap > floor && guard++ < 6) {
    const open = state.commands.filter((c) => ['blocked', 'executing', 'issued'].includes(c.status) && !c.effectsApplied);
    let acted = false;
    for (const c of open) {
      if (c.status === 'issued') { if (L.authorizeCommand(state, c.id).ok) { acted = true; break; } continue; }
      if (mode === 'coordinate' && !(state.coordinationThisRound || {})[c.agency]) {
        if (L.coordinateAgency(state, c.agency).ok) { acted = true; break; }
      }
      if (L.followUpCommand(state, c.id).ok) { acted = true; break; }
    }
    if (!acted) break;
  }
}

function play(plan, opts) {
  const o = opts || {};
  /* v1.1：固定种子，使动态事件在测试中可复现；o.seed 可显式指定。 */
  const state = L.createGame({ scenario: 'campaign', seed: o.seed || 20220224 });
  const trace = [];
  let guard = 0;
  while (!state.ending && guard++ < 40) {
    const event = L.getEvent(state);
    const wanted = (typeof plan === 'function' ? plan(state, event) : plan[event.id]) || [];
    for (const id of wanted) { if (state.ending) break; issue(state, id); }
    if (!state.executed.length) {
      const cheap = L.getAvailableChoices(state).sort((a, b) => a.ap - b.ap)[0];
      if (cheap) issue(state, cheap.id);
    }
    if (!state.ending && o.spend !== false) spend(state, o.mode);
    if (state.ending) break; // 执行中即时越过崩溃线：结局在窗口内产生
    // 处理电报：默认不处理（按默认结算）。
    const before = { stats: Object.assign({}, state.stats), pressure: state.pressure, day: state.campaign.day };
    const ended = L.endRound(state);
    assert.equal(ended.ok, true, event.id + ' endRound: ' + (ended.error || ''));
    trace.push({ id: event.id, picks: state.choices.filter((c) => c.eventId === event.id).map((c) => c.choiceId), day: Math.floor(state.campaign.day), pressure: state.pressure, stats: Object.assign({}, state.stats), interrupted: !!(ended.campaign && ended.campaign.interruption) });
    /* 4 月 2 日后的收束选择：默认选 A（直接结束，沿用已判定的结局）；o.wrap === 'continue' 时进入收束阶段。 */
    if (state.phase === 'wrapup_offer') {
      if (o.wrap === 'continue') { const sw = L.startWrapUp(state); assert.equal(sw.ok, true, 'startWrapUp'); } else { const dw = L.declineWrapUp(state); assert.equal(dw.ok, true, 'declineWrapUp'); }
    }
    if (state.phase === 'interlude') L.continueFromInterlude(state);
  }
  assert.ok(state.ending, '战役没有结束（可能死锁）');
  return { state, trace };
}

const ROUTES = {
  near_history: {
    c1: ['c_command_line', 'c_first_appeal'], c2: ['c_counter_airfield'], c3: ['c_stay_capital', 'c_address_nation'],
    c4: ['c_counterintel', 'c_rumor_rules'], c5: ['c_blow_bridges', 'c_form_reserve'], c6: ['c_harass_convoy'],
    c7: ['c_evacuate', 'c_wishlist'], c8: ['c_rotation'], c9: ['c_reserve_moshchun'], /* v0.6 里伏击因 AP 不足实际未签发；v0.7 的 c9 有 5 AP，基线路线保持原实际操作 */
    c10: ['c_air_defense_aid', 'c_staff_rest'], c11: ['c_counter_west', 'c_prepare_return'], c12: ['c_stay_alert', 'c_verify_signal'],
    c13: ['c_staged_return', 'c_document']
  },
  counterfactual: {
    c1: ['c_martial'], c2: ['c_deny_runway', 'c_airfield_reports'], c3: ['c_split_succession', 'c_address_nation'],
    c4: ['c_curfew'], c5: ['c_flood_valley', 'c_form_reserve'], c6: ['c_chernihiv'],
    c7: ['c_fortify_city', 'c_wishlist'], c8: ['c_ammo_ration'], c9: ['c_reserve_brovary', 'c_brovary_ambush'],
    c10: ['c_talks_channel', 'c_air_defense_aid', 'c_civil_admin'], c11: ['c_counter_east', 'c_hold_lines'],
    c12: ['c_verify_signal', 'c_stay_alert'], c13: ['c_staged_return', 'c_document']
  },
  hard: {
    c1: ['c_disperse'], c2: ['c_keep_airfield'], c3: ['c_relocate'], c4: ['c_arm_volunteers'], c5: ['c_keep_bridges'],
    c6: ['c_release_stocks'], c7: ['c_info_rules'], c8: ['c_honest_briefing'], c9: ['c_reserve_hold'],
    c10: ['c_staff_rest'], c11: ['c_hold_lines'], c12: ['c_trust_redeploy'], c13: ['c_fast_return']
  }
};

function report(name, run) {
  const e = run.state.ending;
  if (!quiet) {
    console.log('\n=== ' + name + ' → ' + e.code + ' ' + e.title + '（合理性 ' + e.plausibility + '）day ' + e.day + ' 窗口 ' + run.state.round + ' 压力 ' + run.state.pressure);
    run.trace.forEach((t) => console.log('  ' + t.id.padEnd(4) + ' d' + String(t.day).padEnd(3) + ' p' + String(t.pressure).padEnd(4) + JSON.stringify(t.stats) + (t.interrupted ? ' [中断]' : '') + ' ' + t.picks.join(',')));
    console.log('  dims: ' + e.dims.map((d) => d.id + ':' + d.level).join(' '));
    console.log('  divergence: ' + e.divergence.map((d) => d.node + ':' + d.kind).join(' ') + ' | cf: ' + e.counterfactuals.map((c) => c.node).join(','));
  }
  return e.id;
}

const results = {};
for (const name of Object.keys(ROUTES)) results[name] = report(name, play(ROUTES[name]));

// 分布审计
function randomPolicy(rng, frugal) {
  return function (state) {
    const picks = [];
    let ap = state.ap;
    const pool = L.getAvailableChoices(state).slice().sort(() => rng() - 0.5);
    for (const choice of pool) {
      if (frugal && picks.length) break;
      if (choice.ap <= ap && rng() < 0.7) {
        const st = L.getChoiceStatus(state, choice.id);
        if (!st.canIssue) continue;
        picks.push(choice.id); ap -= choice.ap;
      }
    }
    return picks;
  };
}
function distribution(label, n, factory, opts) {
  const counts = {};
  for (let i = 0; i < n; i += 1) {
    const run = play(factory(seeded(1000 + i)), opts);
    counts[run.state.ending.code] = (counts[run.state.ending.code] || 0) + 1;
  }
  console.log('\n[' + label + '] n=' + n + ' ' + Object.keys(counts).sort().map((k) => k + ':' + counts[k]).join(' '));
  return counts;
}
/* 每个结局的定向路线（只用于测试可达性，不是推荐打法）。 */
const ENDING_ROUTES = {
  c_A: ROUTES.near_history,
  c_B: ROUTES.counterfactual,
  c_C: Object.assign({}, ROUTES.hard, { c3: ['c_address_nation'], c7: ['c_info_rules'], c11: ['c_prepare_return'] }),
  /* v1.1：动态事件（条件/状态/摩擦）会真实改变数值与后果，c_D 需要「预备队保留 + 东侧伏击」同时成立才够条件——
     这与 c_D 结局本身的描述一致（空中通道拒止、河线障碍、对方补给受扰、局部反击及时），不是把门槛降低。 */
  c_D: { c1: ['c_martial', 'c_command_line'], c2: ['c_deny_runway'], c3: ['c_stay_capital', 'c_address_nation'], c4: ['c_counterintel', 'c_curfew'], c5: ['c_blow_bridges'], c6: ['c_harass_convoy', 'c_release_stocks'], c7: ['c_wishlist', 'c_info_rules'], c8: ['c_ammo_ration', 'c_rotation'], c9: ['c_reserve_hold', 'c_brovary_ambush'], c10: ['c_staff_rest', 'c_repair'], c11: ['c_counter_west'], c12: ['c_stay_alert', 'c_cautious_message'], c13: ['c_fast_return'] }, /* v1.1：动态事件改变了数值走向，c_D 的判定（跑道拒止 + 河线障碍 + 补给受扰 + 西侧反击 + 首都/军队余量 + 压力 <= 55 + 无严重维度）需要第 13 窗口选择快速回到失地，才能在收束前把首都与军队余量托住。 */
  c_E: Object.assign({}, ROUTES.near_history, { c11: ['c_hold_lines', 'c_prepare_return'], c12: ['c_trust_redeploy'] }),
  c_F: ROUTES.hard,
  /* v1.1：c_G（政府连续性断裂）要求「没有任何继任或转移安排」+ 政府连续性低于 45 + 崩溃线被触发。
     这条路线在动态事件参与后仍然成立：西北方向保留桥梁、把预备队留在城内、授权地方自主都削弱了指挥统一，
     第 36 天首都方向崩溃，而此前既没有继任安排也没有转移部分职能。 */
  c_G: { c1: ['c_disperse'], c2: ['c_keep_airfield'], c3: ['c_address_nation'], c4: ['c_arm_volunteers'], c5: ['c_keep_bridges', 'c_form_reserve'], c6: ['c_release_stocks'], c7: ['c_info_rules'], c8: ['c_decentralize'], c9: ['c_reserve_hold'], c10: ['c_staff_rest'], c11: ['c_hold_lines'], c12: ['c_trust_redeploy'], c13: ['c_fast_return'] },
  c_H: Object.assign({}, ROUTES.counterfactual, { c1: ['c_first_appeal', 'c_command_line'], c7: ['c_wishlist', 'c_info_rules'], c12: ['c_verify_signal', 'c_cautious_message', 'c_stay_alert'], c13: ['c_staged_return', 'c_document'] })
};

module.exports = { play, ROUTES, ENDING_ROUTES, seeded, randomPolicy, distribution };
if (require.main === module) {
  const rnd = distribution('random', 600, (rng) => randomPolicy(rng, false));
  const frugal = distribution('minimal (每窗口只做一件、不跟进)', 300, (rng) => randomPolicy(rng, true), { spend: false });
  console.log('\n路线结局：' + JSON.stringify(results));
  module.exports.rnd = rnd; module.exports.frugal = frugal;
}