/*
 * 只读规则搜索：用真实命令台账寻找是否还能通过正常 UI 语义达到 held / hollow。
 * 运行：node tests/route-search.cjs
 * 这不是玩家攻略；它证明结局在 v0.4.1 的命令与窗口约束下仍然可达。
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
require('../js/dynamic.js');
require('../js/engine.js');
const L = globalThis.LZS;

function clone(state) { return JSON.parse(JSON.stringify(state)); }

function plansFor(state) {
  const available = L.getAvailableChoices(state);
  const plans = [];
  for (const first of available) {
    plans.push([first.id]);
    if (first.ap >= 3) continue;
    const rest = available.filter(function (choice) { return choice.id !== first.id; });
    for (const second of rest) {
      if (first.ap + second.ap <= L.apMax) plans.push([first.id, second.id]);
      if (first.ap + second.ap + 1 <= L.apMax && first.ap === 1 && second.ap === 1) {
        for (const third of rest.filter(function (choice) { return choice.id !== second.id; })) {
          if (third.ap === 1) plans.push([first.id, second.id, third.id]);
        }
      }
    }
  }
  // 去重
  const seen = new Set();
  return plans.filter(function (plan) {
    const key = plan.join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function spendWithoutIntervention(state, commands, style) {
  let used = null;
  while (!state.ending && state.ap > 0) {
    const pending = state.commands.filter(function (command) {
      return commands.indexOf(command.id) !== -1 && ['blocked', 'executing', 'issued'].indexOf(command.status) !== -1 && !command.effectsApplied;
    });
    let acted = false;
    if (style === 'delegating') {
      for (const command of pending) {
        if (state.standing && state.standing[command.agency]) continue;
        const granted = L.grantStanding(state, command.agency);
        if (granted.ok) { used = (used ? used + '+' : '') + 'standing:' + command.agency; acted = true; break; }
      }
    }
    if (!acted) {
      for (const command of pending) {
        if (state.coordinationThisRound && state.coordinationThisRound[command.agency]) continue;
        const coordinated = L.coordinateAgency(state, command.agency);
        if (coordinated.ok) { used = (used ? used + '+' : '') + 'coord:' + command.agency; acted = true; break; }
      }
    }
    if (!acted) break;
  }
  return used;
}

function playPlan(base, plan, style) {
  const state = clone(base);
  const commands = [];
  for (const id of plan) {
    if (state.ending) break;
    const issued = L.issueCommand(state, id);
    if (!issued.ok) continue;
    if (issued.command.status === 'issued') L.authorizeCommand(state, issued.command.id);
    commands.push(issued.command.id);
  }
  if (style && style !== 'hands_on') {
    const used = spendWithoutIntervention(state, commands, style);
    if (state.ending) return { state: state, plan: plan, followed: used };
    const ended = L.endRound(state);
    assert.equal(ended.ok, true, ended.error || '结束回合失败');
    if (state.phase === 'interlude') L.continueFromInterlude(state);
    return { state: state, plan: plan, followed: used };
  }
  // 总统用手上剩余 AP 推进一项阻塞命令——这是可达 held 所需的关键介入。
  let followed = null;
  if (!state.ending && state.ap > 0) {
    const blocked = state.commands.filter(function (command) {
      return commands.indexOf(command.id) !== -1 && ['blocked', 'executing'].indexOf(command.status) !== -1 && !command.effectsApplied;
    })[0];
    if (blocked) {
      const result = L.followUpCommand(state, blocked.id);
      if (result.ok) followed = blocked.choiceId;
    }
  }
  if (state.ending) return { state: state, plan: plan, followed: followed };
  const ended = L.endRound(state);
  assert.equal(ended.ok, true, ended.error || '结束回合失败');
  if (state.phase === 'interlude') L.continueFromInterlude(state);
  return { state: state, plan: plan, followed: followed };
}

function distanceTo(state, thresholds) {
  let distance = 0;
  for (const key of L.statKeys) {
    distance += Math.max(0, thresholds[key] - state.stats[key]);
  }
  return distance;
}

function heuristic(state, target) {
  if (state.ending) return state.ending.id === target ? 100000 : -100000;
  let score = -distanceTo(state, L.thresholds[target] || L.thresholds.held) * 10;
  score -= state.pressure;
  // 强烈优先保留命令窗口：已失效/阻塞会减少未来选择。
  score -= L.getCommandCounts(state).expired * 15;
  score -= L.getCommandCounts(state).blocked * 4;
  return score;
}

function search(target, beamSize, style) {
  let beam = [{ state: L.createGame(), plan: [] }];
  for (let round = 1; round <= L.finalRound; round += 1) {
    const candidates = [];
    for (const node of beam) {
      if (node.state.ending) {
        candidates.push(node);
        continue;
      }
      for (const plan of plansFor(node.state)) {
        const result = playPlan(node.state, plan, style);
        candidates.push({
          state: result.state,
          plan: node.plan.concat([{ round: round, choices: plan, followed: result.followed }])
        });
      }
    }
    candidates.sort(function (a, b) { return heuristic(b.state, target) - heuristic(a.state, target); });
    beam = candidates.slice(0, beamSize);
    const endings = beam.filter(function (node) { return node.state.ending; });
    const found = endings.filter(function (node) { return node.state.ending.id === target; })[0];
    if (found) return found;
  }
  return beam.filter(function (node) { return node.state.ending && node.state.ending.id === target; })[0] || null;
}

const STYLES = [
  { id: 'hands_on', label: '亲自介入（剩余 AP 介入阻塞命令）' },
  { id: 'delegating', label: '机构授权（常设授权 + 召集协调，不亲自介入）' },
  { id: 'coordinating', label: '中央协调（只召集协调，不亲自介入）' }
];
const summary = [];
for (const style of STYLES) {
  for (const target of ['held', 'hollow']) {
    const found = search(target, 900, style.id);
    console.log('\n风格：' + style.label + ' / 目标：' + target);
    if (!found) {
      console.log('  在 900 宽束搜索与最多三项/日组合内未找到。不能据此断言 UI 不可达，但说明该结局至少需要更精确的路线。');
      summary.push({ style: style.id, target: target, found: false });
      continue;
    }
    const interventions = found.state.interventionRounds ? found.state.interventionRounds.length : 0;
    console.log('  找到：' + found.state.ending.title + ' / 压力 ' + found.state.pressure + ' / 总统介入 ' + interventions + ' 次');
    console.log('  状态：' + L.statKeys.map(function (key) { return key + '=' + found.state.stats[key]; }).join(' '));
    console.log('  路线：');
    for (const day of found.plan) {
      console.log('    第 ' + day.round + ' 日：' + (day.choices.join(' + ') || '无') + (day.followed ? '；' + (style.id === 'hands_on' ? '总统介入 ' : '') + day.followed : ''));
    }
    summary.push({ style: style.id, target: target, found: true, pressure: found.state.pressure, interventions: interventions });
  }
}
console.log('\nSUMMARY ' + JSON.stringify(summary));
