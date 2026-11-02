/*
 * 前三日的三种总统工作方式对照（Node，无浏览器）
 * 运行：node tests/strategy-compare.cjs
 *
 * 这是规则级可观察差异审计，不是胜率模拟：
 * A 亲自介入、B 委派交接、C 接受延误。
 * 三条路线都在第一天签发同一项总动员令，后续使用同一组第二日命令；
 * 差别只来自总统如何处理执行过程。
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
require('../js/strategy.js');
require('../js/engine.js');
const L = globalThis.LZS;

function issueAndAuthorize(state, choiceId) {
  const result = L.issueCommand(state, choiceId);
  assert.equal(result.ok, true, choiceId + ' 应可签发');
  const id = result.command.id;
  const auth = L.authorizeCommand(state, id);
  assert.equal(auth.ok, true, choiceId + ' 应可授权');
  return result.command;
}

function advance(state) {
  const result = L.endRound(state);
  assert.equal(result.ok, true, '回合应可结算');
  if (state.phase === 'interlude') {
    const continued = L.continueFromInterlude(state);
    assert.equal(continued.ok, true, '夜间确认应可继续');
  }
  return result;
}

function snap(state, label) {
  return {
    label: label,
    round: state.round,
    ap: state.ap,
    pressure: state.pressure,
    stats: Object.assign({}, state.stats),
    coordination: {
      general_staff: state.agencies.general_staff.coordination,
      office: state.agencies.office.coordination
    },
    workload: {
      general_staff: state.agencies.general_staff.workload,
      office: state.agencies.office.workload
    },
    commands: state.commands.map(function (command) {
      return {
        id: command.choiceId,
        status: command.status,
        effectsApplied: !!command.effectsApplied,
        deadlineRound: command.deadlineRound,
        delegated: !!command.delegated,
        expedited: !!command.expedited
      };
    })
  };
}

function routeA() {
  const state = L.createGame();
  const command = issueAndAuthorize(state, 'mobilize');
  const follow = L.followUpCommand(state, command.id);
  assert.equal(follow.ok, true, '路线 A 应可亲自介入');
  const day1 = snap(state, 'A 第一日介入后');
  advance(state);
  const day2 = snap(state, 'A 第二日开始（第一夜后）');
  issueAndAuthorize(state, 'stay');
  issueAndAuthorize(state, 'record');
  advance(state);
  const day3 = snap(state, 'A 第三日开始（第二夜后）');
  return { day1: day1, day2: day2, day3: day3 };
}

function routeB() {
  const state = L.createGame();
  const command = issueAndAuthorize(state, 'mobilize');
  const delegated = L.delegateCommand(state, command.id, 'office');
  assert.equal(delegated.ok, true, '路线 B 应可委派');
  const day1 = snap(state, 'B 第一日委派后');
  advance(state);
  const day2 = snap(state, 'B 第二日开始（第一夜后）');
  issueAndAuthorize(state, 'stay');
  issueAndAuthorize(state, 'record');
  advance(state);
  const day3 = snap(state, 'B 第三日开始（第二夜后）');
  return { day1: day1, day2: day2, day3: day3 };
}

function routeC() {
  const state = L.createGame();
  issueAndAuthorize(state, 'mobilize');
  issueAndAuthorize(state, 'aid_call');
  const day1 = snap(state, 'C 第一日接受延误');
  advance(state);
  const day2 = snap(state, 'C 第二日开始（第一夜后）');
  issueAndAuthorize(state, 'stay');
  issueAndAuthorize(state, 'record');
  advance(state);
  const day3 = snap(state, 'C 第三日开始（第二夜后）');
  return { day1: day1, day2: day2, day3: day3 };
}

const routes = { A: routeA(), B: routeB(), C: routeC() };

const A = routes.A;
const B = routes.B;
const C = routes.C;
assert.equal(A.day1.commands[0].status, 'awaiting_feedback', 'A：第一夜前已由总统催办并执行');
assert.equal(A.day1.commands[0].effectsApplied, true);
assert.equal(B.day1.ap, 1, 'B：委派保留 1 AP，但把执行推迟一夜');
assert.equal(B.day2.commands[0].status, 'blocked', 'B：委派交接首夜不执行');
assert.equal(B.day3.commands[0].status, 'awaiting_feedback', 'B：第二夜才产生执行反馈');
assert.equal(C.day3.commands[0].status, 'expired', 'C：接受延误在最后窗口后失效');
assert.equal(C.day3.commands[0].effectsApplied, false, 'C：失效命令不得补结算');
assert.notEqual(A.day2.stats.army, B.day2.stats.army, 'A/B 第二日开始军队状态应可观察不同');
assert.notEqual(B.day3.stats.army, C.day3.stats.army, 'B/C 第三日开始军队状态应可观察不同');
assert.equal(A.day1.coordination.general_staff, 45);
assert.equal(B.day1.coordination.general_staff, 47);
assert.equal(C.day1.coordination.general_staff, 50);

console.log('《小泽模拟器》前三日路线对照（模拟设计值，不是历史统计）');
console.log('共同起点：2 月 24 日签发并授权全国总动员令；第二日使用同一组「留在班科夫街 + 录制视频」。\n');
for (const key of ['A', 'B', 'C']) {
  console.log('路线 ' + key + '：' + (key === 'A' ? '亲自介入' : key === 'B' ? '委派交接' : '接受延误'));
  for (const day of ['day1', 'day2', 'day3']) {
    const item = routes[key][day];
    console.log('  ' + item.label + '：第 ' + item.round + ' 回合 | AP ' + item.ap + ' | 压力 ' + item.pressure +
      ' | 军队 ' + item.stats.army + ' | 政府 ' + item.stats.gov +
      ' | 总参协调 ' + item.coordination.general_staff + '/在办 ' + item.workload.general_staff +
      ' | 办公室协调 ' + item.coordination.office + '/在办 ' + item.workload.office);
    console.log('    命令：' + item.commands.map(function (command) {
      return command.id + '=' + command.status + (command.effectsApplied ? '(已结算)' : '');
    }).join('；'));
  }
}
console.log('\n结论：三种处理都付出了成本。A 用 1 AP 换第一夜执行并透支总参协调；B 保留 1 AP，但把结果推迟一夜并把协调压力分摊给两个机构；C 保住机构队列与总统注意力，却在第二夜失去该命令的全部效果。');
