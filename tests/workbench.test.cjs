/*
 * v1.1.1 总统工作台：
 * 待处理清单必须来自真实状态（命令、事务电报、常设授权、决策文件），
 * 分类不能把「延期 / 委派 / 审批 / 常设授权 / 正在办理」混成同一件事。
 * 运行：node tests/workbench.test.cjs    （只读，不写存档；localStorage 用内存桩）
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
require('../js/workbench.js');
require('../js/engine.js');
const L = globalThis.LZS;
const WB = globalThis.LZS_WORKBENCH;

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed += 1; console.log('  ✓ ' + name); }
  catch (error) { failures.push({ name, error }); console.log('  ✗ ' + name + '\n      ' + (error && error.message)); }
}

function viewOf(state) { return WB.classify(state, L); }

function issue(state, id, options) {
  const r = L.issueCommand(state, id, options);
  if (!r.ok) return null;
  if (r.command.status === 'issued') L.authorizeCommand(state, r.command.id);
  return r.command;
}

function cheapChoice(state) {
  return L.getAvailableChoices(state).slice().sort((a, b) => a.ap - b.ap)[0] || null;
}

/* 走完一个窗口：签一份最便宜的文件（并授权），然后结束；结算与收束阶段自动推进。 */
function playWindow(state) {
  if (state.phase === 'wrapup_offer') { L.declineWrapUp(state); return null; }
  if (state.phase === 'interlude') { L.continueFromInterlude(state); return null; }
  const cheap = cheapChoice(state);
  if (cheap && !state.executed.length) issue(state, cheap.id);
  const ended = L.endRound(state);
  assert.equal(ended.ok, true, 'endRound 失败：' + (ended.error || ''));
  if (state.phase === 'wrapup_offer') L.declineWrapUp(state);
  if (state.phase === 'interlude') L.continueFromInterlude(state);
  return ended;
}

function setWindow(state, round) {
  /* 只用于构造跨窗口场景的只读断言：把窗口号推进到位（不改变其它规则）。 */
  state.round = round;
  state.phase = 'briefing';
}

console.log('v1.1.1 总统工作台');

/* ------------------------------------------------------------------ */
console.log('[1] 清单本身的结构');

test('每条待办都有合法类别、中文标签，且 needsAction 与类别一致', () => {
  const state = L.createGame({ scenario: 'campaign', seed: 20220224 });
  const view = viewOf(state);
  assert.ok(view.items.length > 0, '第一窗口的工作台不应是空的');
  view.items.forEach((item) => {
    assert.ok(WB.kinds[item.kind], '未知类别：' + item.kind);
    assert.equal(item.tag, WB.kinds[item.kind].tag);
    assert.equal(item.needsAction, WB.kinds[item.kind].needsAction);
    assert.ok(item.title && item.title.length > 0, '待办必须有标题');
    assert.ok(item.key, '待办必须有稳定的 key');
  });
  assert.equal(view.counts.total, view.items.length);
  assert.equal(view.counts.needs, view.needs.length);
  assert.equal(view.counts.watch, view.watch.length);
});

test('需要处理的待办一定带一个可以直接按的动作', () => {
  const state = L.createGame({ scenario: 'campaign', seed: 20220224 });
  const view = viewOf(state);
  view.needs.forEach((item) => {
    assert.ok(item.actions && item.actions.length, item.key + ' 没有可执行动作');
    item.actions.forEach((action) => {
      assert.ok(['approve', 'authorize', 'delegate', 'followup', 'choice', 'dispatch', 'intel', 'ops', 'jump'].indexOf(action.type) !== -1, '未知动作类型 ' + action.type);
      assert.ok(action.label, '动作必须有中文标签');
    });
  });
});

test('紧急项排在前面，同日按类别顺序稳定', () => {
  const state = L.createGame({ scenario: 'campaign', seed: 20220224 });
  const view = viewOf(state);
  let seenLoose = false;
  view.needs.forEach((item) => {
    if (!item.urgent) seenLoose = true;
    else assert.equal(seenLoose, false, '紧急项不应排在普通项之后');
  });
});

test('分类是只读的，不会改状态', () => {
  const state = L.createGame({ scenario: 'campaign', seed: 20220224 });
  const before = JSON.stringify({ ap: state.ap, commands: state.commands, dispatches: state.dispatches, flags: state.flags, standing: state.standing });
  viewOf(state);
  viewOf(state);
  const after = JSON.stringify({ ap: state.ap, commands: state.commands, dispatches: state.dispatches, flags: state.flags, standing: state.standing });
  assert.equal(after, before, '工作台分类不应修改任何状态');
});

test('七日开局也能用，且不会冒出战役专属的常设授权提示', () => {
  const classic = L.createGame({ scenario: 'classic' });
  const view = viewOf(classic);
  assert.ok(Array.isArray(view.needs));
  assert.equal(view.standingDummy, undefined);
  assert.equal(view.items.filter((item) => item.kind === 'standing').length, 0);
});

/* ------------------------------------------------------------------ */
console.log('[2] A/B：找到待办 → 完成一项 → 回到工作台，其它项仍然正确');

let flowState = null;
let firstCommandId = null;

test('A：新战役第一窗口就有待你决定的文件', () => {
  flowState = L.createGame({ scenario: 'campaign', seed: 20220224 });
  const view = viewOf(flowState);
  const decisions = view.needs.filter((item) => item.kind === 'decision');
  assert.ok(decisions.length > 0, '第一窗口应有待签决策');
  assert.ok(decisions.every((item) => item.actions.some((action) => action.type === 'choice')), '决策项应能跳到那份文件');
});

test('A：签下一份文件后，它从「待你决定」变成「待你授权」，AP 减少', () => {
  const before = viewOf(flowState);
  const apBefore = flowState.ap;
  const target = before.needs.filter((item) => item.kind === 'decision')[0];
  const choiceId = target.ref.choiceId;
  const command = issue(flowState, choiceId);
  assert.ok(command, '签发失败');
  firstCommandId = command.id;
  /* issue() 里已经尝试授权；手工把命令放回未授权状态，模拟「签了但还没授权」。 */
  command.status = 'issued';
  const after = viewOf(flowState);
  assert.ok(flowState.ap < apBefore, '签发应该消耗注意力');
  const stillDecision = after.needs.filter((item) => item.kind === 'decision' && item.ref.choiceId === choiceId);
  assert.equal(stillDecision.length, 0, '已签发的文件不应还挂在待决定里');
  const authorize = after.needs.filter((item) => item.kind === 'authorize' && item.ref.commandId === command.id);
  assert.equal(authorize.length, 1, '未授权的命令必须出现在待办里');
  assert.equal(authorize[0].needsAction, true);
});

test('A：授权之后这条命令不再需要总统处理', () => {
  const result = L.authorizeCommand(flowState, firstCommandId);
  assert.equal(result.ok, true, '授权失败：' + (result.error || ''));
  const view = viewOf(flowState);
  const row = view.items.filter((item) => item.ref && item.ref.commandId === firstCommandId)[0];
  assert.ok(row, '命令应仍然在工作台里被追踪');
  assert.notEqual(row.kind, 'authorize', '授权过的命令不应继续要求授权');
  assert.equal(row.needsAction, false, '已经授权/执行中的命令不应再算待处理');
});

test('B：两项待授权时处理其一，另一项仍然正确留在待办', () => {
  const state = L.createGame({ scenario: 'campaign', seed: 20220224 });
  const a = issue(state, 'c_command_line');
  const b = issue(state, 'c_first_appeal');
  assert.ok(a && b, '应能签下两项命令');
  a.status = 'issued';
  b.status = 'issued';
  const view = viewOf(state);
  const auth = view.needs.filter((item) => item.kind === 'authorize');
  assert.equal(auth.length, 2, '两项命令都应出现在待授权里');
  assert.equal(L.authorizeCommand(state, a.id).ok, true);
  const after = viewOf(state);
  const remaining = after.needs.filter((item) => item.kind === 'authorize');
  assert.equal(remaining.length, 1, '只应处理掉一项');
  assert.equal(remaining[0].ref.commandId, b.id, '剩下的应该还是没被授权的那一项');
});

/* ------------------------------------------------------------------ */
console.log('[3] C：没有待办时的空状态');

test('C：把手上的事处理干净后，清单为空并给出可以直接结束的说明', () => {
  const state = L.createGame({ scenario: 'campaign', seed: 20220224 });
  const view = viewOf(state);
  /* 逐项处理：能授权的授权、能批准的批准、能处理电报的按第一个选项处理，直到没有 needs。 */
  let guard = 0;
  while (guard++ < 12) {
    const current = viewOf(state);
    const item = current.needs[0];
    if (!item) break;
    const action = item.actions.filter((a) => !a.disabled)[0];
    if (!action) break;
    if (action.type === 'choice') {
      const r = L.issueCommand(state, action.choiceId);
      if (!r.ok) break;
      if (r.command.status === 'issued') L.authorizeCommand(state, r.command.id);
    } else if (action.type === 'authorize') L.authorizeCommand(state, action.commandId);
    else if (action.type === 'approve') L.approveDelegated(state, action.commandId);
    else if (action.type === 'followup') L.followUpCommand(state, action.commandId);
    else if (action.type === 'dispatch') L.resolveDispatch(state, action.dispatchId, action.optionId);
    else break;
  }
  const result = viewOf(state);
  assert.equal(result.counts.needs, 0, '处理完之后不应还有必须处理的事：' + result.needs.map((i) => i.kind + ':' + i.title).join(' / '));
  assert.ok(WB.endWindowNote(result).indexOf('没有必须由你现在处理的事') !== -1, '空状态说明要明确');
});

/* ------------------------------------------------------------------ */
console.log('[4] D：存档读回来，清单一致');

test('D：存档读回之后待办清单与种子一致', () => {
  const state = L.createGame({ scenario: 'campaign', seed: 20220224 });
  issue(state, 'c_command_line');
  state.pending.push({ id: 'probe', sourceEventId: 'c1', sourceChoiceId: 'c_command_line', dueRound: 2, label: '探针', note: '', effects: {} });
  assert.equal(L.saveGame(state), true);
  const loaded = L.loadSavedGame('campaign');
  assert.ok(loaded && loaded.state, '存档应能读回');
  const a = viewOf(state);
  const b = viewOf(loaded.state);
  assert.equal(loaded.state.campaign.seed, state.campaign.seed, '种子应写进存档');
  assert.deepEqual(b.needs.map((item) => item.key).sort(), a.needs.map((item) => item.key).sort(), '读回后的待办应一致');
  assert.deepEqual(b.counts, a.counts);
});

/* ------------------------------------------------------------------ */
console.log('[5] E：延期 / 委派 / 审批 / 常设授权 / 正在办理不能混成一类');

test('E1：审批型委派 → 归入「待你批准」，动作是批准而不是授权', () => {
  const state = L.createGame({ scenario: 'campaign', seed: 20220224 });
  const r = L.issueCommand(state, 'c_command_line', { delegate: true, returnForApproval: true });
  assert.equal(r.ok, true, '审批型委派应能签下：' + (r.error || ''));
  assert.equal(r.command.status, 'blocked');
  assert.equal(r.command.blockedCode, 'APPROVAL');
  const view = viewOf(state);
  const row = view.needs.filter((item) => item.ref && item.ref.commandId === r.command.id)[0];
  assert.ok(row, '待批准的命令必须在待办里');
  assert.equal(row.kind, 'approval');
  assert.equal(row.tag, '待你批准');
  assert.ok(row.actions.some((action) => action.type === 'approve'), '必须给批准按钮');
  assert.equal(row.actions.some((action) => action.type === 'authorize'), false, '待批准不应混成待授权');
});

test('E2：自主委派 → 不出现「待你批准」', () => {
  const state = L.createGame({ scenario: 'campaign', seed: 20220224 });
  const r = L.issueCommand(state, 'c_first_appeal', { delegate: true });
  assert.equal(r.ok, true, '自主委派应能签下：' + (r.error || ''));
  const view = viewOf(state);
  const rows = view.items.filter((item) => item.ref && item.ref.commandId === r.command.id);
  assert.equal(rows.filter((item) => item.kind === 'approval').length, 0, '自主委派不需要总统批准');
});

test('E3：常设授权只在临近到期时提醒，且不算必须处理', () => {
  const state = L.createGame({ scenario: 'campaign', seed: 20220224 });
  const granted = L.grantStanding(state, 'office');
  assert.equal(granted.ok, true, '授权失败：' + (granted.error || ''));
  const rec = state.standing.office;
  setWindow(state, rec.grantedRound + 1);
  const mid = viewOf(state);
  assert.equal(mid.items.filter((item) => item.kind === 'standing').length, 0, '刚授权时不该提醒续期');
  setWindow(state, rec.expiresRound);
  const late = viewOf(state);
  const rows = late.items.filter((item) => item.kind === 'standing');
  assert.equal(rows.length, 1, '到期窗口应提醒一次');
  assert.equal(rows[0].needsAction, false, '常设授权到期属于「需要知道」，不是必须处理');
  assert.ok(rows[0].urgent, '到期应当标成紧急');
});

test('E4：正在办理的命令不进「必须处理」，但仍在清单里被追踪', () => {
  const state = L.createGame({ scenario: 'campaign', seed: 20220224 });
  const command = issue(state, 'c_command_line');
  assert.ok(command);
  const view = viewOf(state);
  const row = view.items.filter((item) => item.ref && item.ref.commandId === command.id)[0];
  assert.ok(row, '在办命令应仍在清单里');
  if (row.kind === 'running') assert.equal(row.needsAction, false);
  assert.equal(view.needs.filter((item) => item.kind === 'running').length, 0, 'running 不应出现在必须处理里');
});

test('E5：电报的「可以延后」与「等你处理」分开，且默认处理方式有说明', () => {
  const state = L.createGame({ scenario: 'campaign', seed: 20220224 });
  playWindow(state);
  const view = viewOf(state);
  view.soft.forEach((item) => {
    assert.equal(item.kind, 'optional');
    assert.equal(item.needsAction, false);
  });
  view.needs.filter((item) => item.kind === 'letter').forEach((item) => {
    assert.ok(/注意力|不耗/.test(item.meta), '来信要写清楚要不要花注意力：' + item.meta);
  });
});

/* ------------------------------------------------------------------ */
console.log('[6] F：结束窗口的提示准确，但由玩家决定');

test('F1：还有未授权的命令时，先说清楚引擎会拒绝的原因', () => {
  const state = L.createGame({ scenario: 'campaign', seed: 20220224 });
  const command = issue(state, 'c_command_line');
  command.status = 'issued';
  const blockers = WB.endWindowBlockers(state, L);
  assert.equal(blockers.length >= 1, true);
  assert.equal(blockers[0].code, 'UNAUTHORIZED');
  assert.ok(blockers[0].text.indexOf('授权') !== -1, '说明应提到授权');
  /* 引擎确实会拒绝，所以这是硬提示而不是催办。 */
  const result = L.endRound(state);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'UNAUTHORIZED');
});

test('F2：注意力一点没花就想结束，也要说清楚', () => {
  const state = L.createGame({ scenario: 'campaign', seed: 20220224 });
  const blockers = WB.endWindowBlockers(state, L);
  assert.equal(blockers.filter((item) => item.code === 'NO_CHOICE').length, 1);
});

test('F3：有未处理事项时给提醒，但不阻止玩家结束', () => {
  const state = L.createGame({ scenario: 'campaign', seed: 20220224 });
  issue(state, 'c_command_line');
  const view = viewOf(state);
  assert.equal(view.blockers.length, 0, '这个状态下不应有硬性阻塞');
  assert.ok(view.counts.needs > 0, '应当仍有待办');
  const note = WB.endWindowNote(view);
  assert.ok(note.indexOf('还有') !== -1 && note.indexOf('不处理也可以结束窗口') !== -1, '提示要说清楚可以自己决定：' + note);
  assert.equal(L.endRound(state).ok, true, '引擎允许在有待办时结束窗口');
});

/* ------------------------------------------------------------------ */
console.log('[7] G：进入下一窗口，新旧事项的生命周期一致');

test('G：下一窗口会生成新事项，上一窗口的命令仍被正确追踪', () => {
  const state = L.createGame({ scenario: 'campaign', seed: 20220224 });
  const command = issue(state, 'c_command_line');
  assert.ok(command);
  playWindow(state);
  const view = viewOf(state);
  assert.equal(state.round, 2, '应进入第二窗口');
  const carried = view.items.filter((item) => item.ref && item.ref.commandId === command.id);
  assert.equal(carried.length, 1, '上一窗口的命令仍应在工作台里被追踪');
  assert.ok(view.items.length > 0, '第二窗口也应有待办');
  const windows = new Set(view.items.map((item) => item.kind));
  assert.equal(windows.has('decision'), true, '新窗口应有新的待签文件');
  /* 跨窗口不会重复计同一条命令。 */
  const keys = view.items.map((item) => item.key);
  assert.equal(new Set(keys).size, keys.length, '同一项不应重复出现');
});

test('G：已失效的命令不再占用待办', () => {
  const state = L.createGame({ scenario: 'campaign', seed: 20220224 });
  const command = issue(state, 'c_command_line');
  command.status = 'expired';
  command.expiredRound = state.round;
  const view = viewOf(state);
  assert.equal(view.items.filter((item) => item.ref && item.ref.commandId === command.id).length, 0, '失效命令不应再出现在清单里');
});

/* ------------------------------------------------------------------ */
console.log('[8] H：旧存档仍可用');

test('H：v1.0 的 schema 5 存档读入后工作台照常工作', () => {
  store.clear();
  const state = L.createGame({ scenario: 'campaign', seed: 20220224 });
  const raw = JSON.parse(JSON.stringify(state));
  delete raw.campaign.seed;
  delete raw.campaign.dyn;
  raw.schemaVersion = 5;
  store.set('lzs_campaign_v1', JSON.stringify({ version: 5, savedAt: Date.now(), state: raw }));
  const loaded = L.loadSavedGame('campaign');
  assert.ok(loaded && loaded.state, 'schema 5 存档应能读回');
  assert.equal(loaded.version, 5);
  assert.equal(loaded.migratedFrom, 5);
  const view = viewOf(loaded.state);
  assert.ok(Array.isArray(view.needs));
  assert.ok(view.counts.total >= 0);
  assert.equal(typeof WB.endWindowNote(view), 'string');
  /* 迁移不能凭空造出动态事件记录。 */
  assert.deepEqual(loaded.state.campaign.dyn.fired, {});
});

/* ------------------------------------------------------------------ */
if (failures.length) {
  console.log('\n失败 ' + failures.length + ' 项，通过 ' + passed + ' 项');
  failures.forEach((item) => console.log(' - ' + item.name + '\n   ' + (item.error && item.error.stack ? item.error.stack.split('\n').slice(0, 3).join('\n   ') : item.error)));
  process.exitCode = 1;
} else {
  console.log('\n通过 ' + passed + ' 项，失败 0 项');
}
