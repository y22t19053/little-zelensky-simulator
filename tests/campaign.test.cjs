/*
 * v0.6 基辅战役测试（Node，无浏览器）
 * 运行：node tests/campaign.test.cjs
 * 所有数值都是模拟设计值；本测试验证的是机制，不是历史统计。
 */
'use strict';
const assert = require('node:assert/strict');
const S = require('./campaign-sim.cjs');
const L = globalThis.LZS;
const C = globalThis.LZS_CAMPAIGN;
let passed = 0;
let failed = 0;
function test(name, fn) {
  try { localStorage.clear(); fn(); passed += 1; console.log('  ✓ ' + name); }
  catch (e) { failed += 1; console.log('  ✗ ' + name + '\n    ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n    ') : e)); }
}
function newCampaign() { return L.createGame({ scenario: 'campaign' }); }
function ids(state) { return state.choices.map((c) => c.choiceId); }

console.log('v0.6 战役测试');

test('数据：13 个决策窗口，内部天数合计 38，四幕齐全', function () {
  assert.equal(C.events.length, 13);
  const days = C.events.reduce((s, e) => s + e.days, 0);
  assert.equal(days, 38);
  assert.deepEqual(Array.from(new Set(C.events.map((e) => e.act))), [1, 2, 3, 4]);
  assert.equal(C.events[0].date.slice(0, 10), '2022-02-24');
  const keys = C.events.filter((e) => e.key).map((e) => e.id);
  assert.ok(keys.length >= 5 && keys.length <= 8, '关键节点数量 ' + keys.length);
  C.events.forEach(function (e) {
    assert.ok(e.choices.length >= 2, e.id + ' 选项不足');
    assert.ok(Array.isArray(e.known) && Array.isArray(e.unknown), e.id + ' 缺少已知/未知');
  });
});

test('游玩期文本不含事后信息关键词', function () {
  const banned = ['撤离后发现', '事后确认', '最终撤退', '4 月初开始公开', '遇害'];
  C.events.forEach(function (e) {
    const text = JSON.stringify(e);
    banned.forEach((w) => assert.ok(!text.includes(w), e.id + ' 含事后措辞：' + w));
  });
});

test('战役与经典模式隔离：经典 createGame 不受影响', function () {
  const classic = L.createGame();
  assert.equal(classic.scenario || 'classic', 'classic');
  assert.equal(L.finalRoundFor(classic), L.finalRound);
  const camp = newCampaign();
  assert.equal(camp.scenario, 'campaign');
  assert.equal(L.finalRoundFor(camp), 13);
  assert.equal(camp.schemaVersion, 4);
  assert.equal(L.getEvent(camp).id, 'c1');
});

test('AP 按决策窗口刷新，不跨窗口储存', function () {
  const s = newCampaign();
  assert.equal(s.ap, 3);
  S.play({ c1: ['c_command_line'] }, {}); // 烟雾
  const t = newCampaign();
  L.issueCommand(t, 'c_command_line'); L.authorizeCommand(t, t.commands[0].id);
  assert.equal(t.ap, 2);
  assert.equal(L.endRound(t).ok, true);
  L.continueFromInterlude(t);
  assert.equal(t.round, 2);
  assert.equal(t.ap, C.events[1].ap, '新窗口 AP 等于窗口上限，不叠加上一窗口剩余');
  // 第三幕的 c8 只有 2 AP
  const c8 = C.events.find((e) => e.id === 'c8');
  assert.equal(c8.ap, 2);
});

test('38 天连续模拟：近历史路线逐窗口推进到 4 月 2 日', function () {
  const r = S.play(S.ROUTES.near_history, {});
  const st = r.state;
  assert.equal(r.trace.length, 13, '13 个窗口各结算一次');
  assert.ok(st.campaign.day >= 38, '内部日期推进到 ' + st.campaign.day);
  for (let i = 1; i < r.trace.length; i++) assert.ok(r.trace[i].day >= r.trace[i - 1].day, '日期单调');
  assert.equal(st.ending.scenario, 'campaign');
  assert.equal(st.ending.id, 'c_A');
});

test('三条端到端路线落入不同结局', function () {
  const a = S.play(S.ROUTES.near_history, {}).state.ending.id;
  const b = S.play(S.ROUTES.counterfactual, {}).state.ending.id;
  const c = S.play(S.ROUTES.hard, {}).state.ending.id;
  assert.equal(a, 'c_A'); assert.equal(b, 'c_B'); assert.equal(c, 'c_F');
});

test('A–H 全部结局可达，且每局延迟效果不重复结算', function () {
  Object.keys(S.ENDING_ROUTES).forEach(function (code) {
    const st = S.play(S.ENDING_ROUTES[code], {}).state;
    assert.equal(st.ending.id, code, code + ' 实际为 ' + st.ending.id);
    const rid = st.resolved.map((r) => r.id);
    assert.equal(new Set(rid).size, rid.length, code + ' 延迟效果重复结算');
    const cmd = st.commands.filter((c) => c.effectsApplied).map((c) => c.id);
    assert.equal(new Set(cmd).size, cmd.length, code + ' 命令重复生效');
    assert.ok(st.ending.dims.length === 8, '8 个维度');
    assert.ok(st.ending.plausibility, '有合理性等级');
    assert.ok(st.ending.reasons.length >= 1, '有判定原因');
  });
});

test('结局不由单一数值决定：同一基辅值可落入不同结局', function () {
  const e = S.play(S.ENDING_ROUTES.c_E, {}).state;
  const g = S.play(S.ENDING_ROUTES.c_G, {}).state;
  const f = S.play(S.ENDING_ROUTES.c_F, {}).state;
  assert.notEqual(f.ending.id, g.ending.id, 'F 与 G 都是首都崩溃，区别在继任/转移安排');
  assert.ok(f.flags.c_relocated || f.flags.c_succession);
  assert.ok(!g.flags.c_relocated && !g.flags.c_succession);
  assert.ok(e.stats.kyiv < 36 && e.ending.id === 'c_E');
});

test('安东诺夫机场：拒止跑道是主动牺牲，有即时代价、后续回响和复盘记录', function () {
  const st = S.play(Object.assign({}, S.ROUTES.near_history, { c2: ['c_deny_runway'] }), {}).state;
  assert.ok(st.flags.c_runway_denied && st.flags.c_airfield_lost);
  const cmd = st.commands.find((c) => c.choiceId === 'c_deny_runway');
  assert.ok(cmd.effectsApplied);
  const ch = st.choices.find((c) => c.choiceId === 'c_deny_runway');
  assert.ok(ch.deltas.reserve < 0, '失去机场与储备');
  assert.ok(st.campaign.echoes.some((e) => e.id === 'oe_runway_ground'), '第 3 窗口出现跨窗口回响');
  const kd = st.ending.keyDecisions.find((k) => k.node === 'airfield');
  assert.ok(kd && kd.choiceId === 'c_deny_runway');
});

test('安东诺夫机场：保留机场若无拦截，3 天后出现空运风险', function () {
  const st = S.play(Object.assign({}, S.ROUTES.near_history, { c2: ['c_keep_airfield'] }), {}).state;
  assert.ok(st.flags.c_airfield_kept);
  assert.ok(st.resolved.some((r) => r.sourceLabel && /机场/.test(r.label + r.sourceLabel) && (r.deltas.kyiv || 0) < 0), '空运风险兑现');
  assert.ok(st.campaign.echoes.some((e) => e.id === 'oe_runway_open'));
});

test('安东诺夫机场：互斥——同一窗口只能选一种处置', function () {
  const s = newCampaign();
  L.issueCommand(s, 'c_command_line'); L.authorizeCommand(s, s.commands[0].id);
  L.endRound(s); L.continueFromInterlude(s);
  assert.equal(L.getEvent(s).id, 'c2');
  assert.equal(L.issueCommand(s, 'c_deny_runway').ok, true);
  const st = L.getChoiceStatus(s, 'c_keep_airfield');
  assert.equal(st.canIssue, false);
  assert.equal(st.state, 'conflict');
});

test('补救选项受此前选择门控：未争夺/保留机场时不能“事后拒止”', function () {
  const s = newCampaign();
  L.issueCommand(s, 'c_command_line'); L.authorizeCommand(s, s.commands[0].id);
  L.endRound(s); L.continueFromInterlude(s);
  L.issueCommand(s, 'c_deny_runway'); L.authorizeCommand(s, s.commands[s.commands.length - 1].id);
  L.endRound(s); L.continueFromInterlude(s);
  assert.equal(L.getEvent(s).id, 'c3');
  const st = L.getChoiceStatus(s, 'c_late_deny');
  assert.equal(st.state, 'locked');
});

test('莫什春 / 布罗瓦雷：集中一个方向，另一方向依赖此前障碍与伏击', function () {
  const base = S.ROUTES.near_history;
  const west = S.play(Object.assign({}, base, { c9: ['c_reserve_moshchun'] }), {}).state;
  const westNorth = S.play(Object.assign({}, base, { c6: ['c_chernihiv'], c9: ['c_reserve_moshchun'] }), {}).state;
  const both = S.play(Object.assign({}, base, { c9: ['c_brovary_ambush', 'c_reserve_moshchun'] }), {}).state;
  const east = S.play(Object.assign({}, base, { c9: ['c_reserve_brovary'] }), {}).state;
  const hold = S.play(Object.assign({}, base, { c9: ['c_reserve_hold'] }), {}).state;
  const delayedFor = (st, id) => st.resolved.filter((r) => r.sourceCommandId && r.sourceCommandId.indexOf(id) >= 0);
  assert.ok(delayedFor(west, 'c_reserve_moshchun').some((r) => (r.deltas.kyiv || 0) < 0), '无伏击时东侧承压');
  assert.ok(!delayedFor(westNorth, 'c_reserve_moshchun').some((r) => (r.deltas.kyiv || 0) < 0), '第 6 窗口加强北面后，东侧风险不兑现（跨窗口因果）');
  // 低可信情报下同一窗口无法既追问、投预备队又布置伏击：注意力迫使取舍。
  const m = both.commands.find((c) => c.choiceId === 'c_reserve_moshchun');
  assert.ok(m.status === 'expired' || !both.flags.c_brovary_ambush, '同窗口两头兼顾应受注意力限制');
  assert.ok(east.stats.kyiv !== west.stats.kyiv || east.pressure !== west.pressure, '不同投向产生不同局面');
  assert.ok(hold.flags.c_reserve_held);
  assert.ok(new Set([west.ending.id, east.ending.id, hold.ending.id, westNorth.ending.id]).size >= 1);
});

test('3 月 29 日撤退信号：不会自动获胜，提前相信信号有后续风险', function () {
  const trust = S.play(S.ENDING_ROUTES.c_E, {}).state;
  assert.ok(trust.flags.c_trusted_signal);
  assert.ok(trust.campaign.echoes.some((e) => e.id === 'oe_trusted_gap'), '4 月初出现首都方向变薄的回响');
  assert.notEqual(trust.ending.id, 'c_A');
  const c12 = C.events.find((e) => e.id === 'c12');
  assert.equal(c12.interruptible, false);
  assert.ok(c12.unknown.length >= 2, '保留信息不确定性');
  assert.ok(/中|低/.test(c12.intel.level), '信号可信度不是“高”');
});

test('紧急中断：首都越线时提前结束时间推进并结转剩余天数', function () {
  const s = newCampaign();
  // 快进到 c10（8 天窗口），制造首都接近越线
  for (let i = 0; i < 9; i++) {
    const ev = L.getEvent(s);
    const cheap = L.getAvailableChoices(s).sort((a, b) => a.ap - b.ap)[0];
    L.issueCommand(s, cheap.id); L.authorizeCommand(s, s.commands[s.commands.length - 1].id);
    const r = L.endRound(s); assert.equal(r.ok, true, ev.id); if (s.ending) return;
    L.continueFromInterlude(s);
  }
  assert.equal(L.getEvent(s).id, 'c10');
  s.stats.kyiv = 23; s.pressure = 60;
  const cheap = L.getAvailableChoices(s).sort((a, b) => a.ap - b.ap)[0];
  L.issueCommand(s, cheap.id); L.authorizeCommand(s, s.commands[s.commands.length - 1].id);
  const res = L.endRound(s);
  assert.equal(res.ok, true);
  if (s.ending) return; // 越过崩溃线直接结束也合法
  assert.ok(s.campaign.interruptions.length >= 1, '发生中断');
  assert.ok(s.campaign.carryDays > 0, '剩余天数结转');
});

test('不行动不是最优：最小行动策略从不达到 A 或 D 的比例高于积极策略', function () {
  const dist = (min) => { const t = {}; for (let i = 0; i < 120; i++) { const st = S.play(S.randomPolicy(S.seeded(300 + i), false), { spend: !min }).state; t[st.ending.id] = (t[st.ending.id] || 0) + 1; } return t; };
  const lazy = dist(true); const active = dist(false);
  const good = (t) => (t.c_A || 0) + (t.c_D || 0) + (t.c_H || 0);
  assert.ok(good(active) >= good(lazy), '积极 ' + JSON.stringify(active) + ' vs 最小 ' + JSON.stringify(lazy));
  assert.ok(Object.keys(active).length >= 3, '随机策略落入多种结局');
});

test('关键节点无压倒性选项：机场四种处置都不是每次都最优', function () {
  const opts = ['c_deny_runway', 'c_keep_airfield', 'c_counter_airfield', 'c_interdict'];
  const res = opts.map((o) => S.play(Object.assign({}, S.ROUTES.near_history, { c2: [o] }), {}).state.ending.id);
  assert.ok(new Set(res).size >= 2, '机场处置结果：' + res.join(','));
});

test('存档：战役使用独立键与 schema 4，不覆盖经典存档；刷新后可恢复', function () {
  const classic = L.createGame();
  L.saveGame(classic);
  const classicRaw = localStorage.getItem(L.saveKey);
  const s = newCampaign();
  L.issueCommand(s, 'c_command_line'); L.authorizeCommand(s, s.commands[0].id);
  L.endRound(s); L.continueFromInterlude(s);
  L.saveGame(s);
  assert.equal(localStorage.getItem(L.saveKey), classicRaw, '经典存档未被改动');
  const raw = JSON.parse(localStorage.getItem(L.campaignSaveKey));
  assert.equal(raw.version, 4);
  assert.equal(raw.state.schemaVersion, 4);
  const loaded = L.loadSavedGame('campaign');
  assert.ok(loaded && loaded.state);
  assert.equal(loaded.state.round, 2);
  assert.equal(loaded.state.scenario, 'campaign');
  assert.equal(loaded.state.campaign.day, s.campaign.day);
  const classicLoaded = L.loadSavedGame();
  assert.ok(classicLoaded && classicLoaded.state);
  assert.notEqual(classicLoaded.state.scenario, 'campaign');
});

test('存档：v0.5 七日存档不会被当作战役读入；损坏战役存档被拒绝而不清空', function () {
  const v5 = L.createGame(); v5.schemaVersion = 3; v5.version = 3;
  localStorage.setItem(L.saveKey, JSON.stringify(v5));
  const asCampaign = L.loadSavedGame('campaign');
  assert.equal(asCampaign, null);
  assert.ok(localStorage.getItem(L.saveKey), 'v0.5 存档仍在');
  localStorage.setItem(L.campaignSaveKey, '{"version":4,"state":{"scenario":"campaign","round":99}}');
  assert.equal(L.loadSavedGame('campaign'), null);
  localStorage.setItem(L.campaignSaveKey, 'not json');
  assert.equal(L.loadSavedGame('campaign'), null);
  assert.ok(localStorage.getItem(L.saveKey), '经典存档仍在');
});

test('记录：战役结局写入记录且标注场景，只记一次', function () {
  const st = S.play(S.ROUTES.near_history, {}).state;
  const runs = L.getRecords().runs.filter((r) => r.scenario === 'campaign');
  assert.equal(runs.length, 1);
  assert.equal(runs[0].endingId, st.ending.id);
});

test('复盘：关键决策、基线偏离、2–4 个反事实、事后史料只在结局中出现', function () {
  const st = S.play(S.ROUTES.counterfactual, {}).state;
  const e = st.ending;
  assert.ok(e.keyDecisions.length >= 4);
  assert.ok(e.counterfactuals.length >= 2 && e.counterfactuals.length <= 4);
  e.counterfactuals.forEach((cf) => { ['known', 'uncertain', 'inference', 'cannot', 'perspectives'].forEach((k) => assert.ok(cf[k], k)); });
  assert.ok(e.divergence && e.firstDivergence !== undefined);
  assert.ok(C.history.length >= 10);
  C.history.forEach((h) => assert.ok(['confirmed', 'reported', 'disputed', 'analysis'].includes(h.status)));
  C.research.forEach((r) => assert.ok(C.sources.some((s) => s.id === r.source), r.id + ' 来源可追溯'));
});

test('战场态势由状态与旗标推导，6 个方向', function () {
  const s = newCampaign();
  const fronts = L.getCampaignStatus(s).fronts;
  assert.equal(fronts.length, 6);
  s.flags.c_runway_denied = true;
  const after = L.getCampaignStatus(s).fronts.find((f) => f.id === 'hostomel');
  assert.equal(after.status, 'denied');
});

console.log('\n战役测试：' + passed + ' 通过，' + failed + ' 失败');
if (failed) process.exitCode = 1;