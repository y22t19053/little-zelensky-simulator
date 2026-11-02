/*
 * 固定优势策略排查（Node，无浏览器）
 * 运行：node tests/balance-audit.cjs [局数]
 *
 * 这不是胜率证明。它用六种可解释的策略，在真实命令台账
 *（AP、授权、机构容量、跨部门协调、委派、跟进、撤回、截止窗口）上跑完七回合，
 * 用来发现“某种低投入组合是否总能轻易获得同一组优势”。
 * 任何数值调整都必须结合规则审查与真实游玩，不能只看这里的百分比。
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

const RUNS = Math.max(1, Math.min(10000, Number(process.argv[2]) || 2000));
const POLICIES = [
  ['random', '随机选择'],
  ['short', '优先短期收益'],
  ['sustain', '优先维持低状态'],
  ['old', '优先处理旧命令'],
  ['crisis', '优先最新危机'],
  ['balanced', '尽量平均分配']
];
const STAT_KEYS = L.statKeys;
const AGENCY_IDS = Object.keys(L.intel.agencies);

function mulberry32(seed) {
  let value = seed >>> 0;
  return function () {
    value = (value + 0x6D2B79F5) >>> 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function choiceDef(id) {
  for (const event of L.events) {
    const found = event.choices.filter(function (choice) { return choice.id === id; })[0];
    if (found) return found;
  }
  return null;
}

function scoreChoice(state, id, policy) {
  const choice = choiceDef(id);
  if (!choice) return -Infinity;
  const effects = choice.effects || {};
  let score = 0;
  const lows = STAT_KEYS.slice().sort(function (a, b) { return state.stats[a] - state.stats[b]; }).slice(0, 3);
  for (const key of STAT_KEYS) {
    const delta = effects[key] || 0;
    if (policy === 'short') {
      score += delta > 0 ? delta : delta * 1.35;
    } else if (policy === 'sustain') {
      if (lows.indexOf(key) !== -1) score += delta * 2.2;
      else score += delta * 0.35;
    } else if (policy === 'crisis') {
      if (key === 'kyiv' || key === 'army' || key === 'safety') score += delta * 1.5;
      else score += delta * 0.45;
    } else if (policy === 'balanced') {
      const headroom = 100 - state.stats[key];
      score += (delta > 0 ? delta * (1 + headroom / 160) : delta * 1.15);
    } else {
      score += delta;
    }
  }
  const pressure = effects.pressure || 0;
  score -= pressure * (policy === 'crisis' ? 3 : 1.5);
  if (policy === 'old') score += choice.ap >= 2 ? 0.6 : 0;
  return score;
}

function chooseChoice(state, policy, rng) {
  const available = L.getAvailableChoices(state).map(function (choice) { return choice.id; });
  if (!available.length) return null;
  if (policy === 'random') {
    return available[Math.floor(rng() * available.length)];
  }
  return available.slice().sort(function (a, b) {
    return scoreChoice(state, b, policy) - scoreChoice(state, a, policy);
  })[0];
}

function targetAgency(state, currentId) {
  const candidates = L.getAgencyLoads(state).filter(function (load) {
    return load.id !== currentId && !load.overloaded && load.coordination >= L.strategy.agencyCoordinationFloor;
  });
  if (!candidates.length) return null;
  return candidates.sort(function (a, b) { return b.available - a.available; })[0].id;
}

function manageCommand(state, command, policy, rng) {
  if (!command || state.ending) return;
  if (policy === 'aggressive' && state.ap > 0 && ['blocked', 'executing'].indexOf(command.status) !== -1) {
    L.followUpCommand(state, command.id);
    return;
  }
  if (policy === 'delegation' && command.status === 'blocked') {
    const target = targetAgency(state, command.executorId);
    if (target) L.delegateCommand(state, command.id, target);
    return;
  }
  if (policy === 'random' && state.ap > 0 && ['blocked', 'executing'].indexOf(command.status) !== -1 && rng() < 0.22) {
    L.followUpCommand(state, command.id);
  }
}

function followOldCommand(state, policy, rng) {
  if (state.ending) return;
  if (policy === 'old') {
    const blocked = state.commands.filter(function (command) {
      return ['blocked', 'executing'].indexOf(command.status) !== -1 && !command.effectsApplied;
    })[0];
    if (blocked && state.ap > 0) L.followUpCommand(state, blocked.id);
  } else if (policy === 'random' && state.ap > 0 && rng() < 0.18) {
    const pending = state.commands.filter(function (command) {
      return ['blocked', 'executing'].indexOf(command.status) !== -1 && !command.effectsApplied;
    })[0];
    if (pending) L.followUpCommand(state, pending.id);
  }
}

function runGame(policy, seed) {
  const rng = mulberry32(seed);
  const state = L.createGame();
  let steps = 0;
  while (state.phase !== 'ending' && state.round <= L.finalRound && steps < 60) {
    steps += 1;
    followOldCommand(state, policy, rng);
    let issuedThisRound = 0;
    while (!state.ending && state.ap > 0 && issuedThisRound < 5) {
      const id = chooseChoice(state, policy === 'random' ? 'random' : policy === 'old' ? 'balanced' : policy, rng);
      if (!id) break;
      const issued = L.issueCommand(state, id);
      if (!issued.ok) break;
      issuedThisRound += 1;
      L.authorizeCommand(state, issued.command.id);
      manageCommand(state, issued.command, policy, rng);
      if (state.ap <= 0) break;
    }
    if (state.ending) break;
    if (!issuedThisRound && !state.executed.length && state.ap >= L.apMax) {
      const fallback = L.getAvailableChoices(state)[0];
      if (!fallback) throw new Error('没有可签发命令，无法完成模拟');
      const issued = L.issueCommand(state, fallback.id);
      if (!issued.ok) throw new Error('兜底签发失败：' + issued.error);
      L.authorizeCommand(state, issued.command.id);
    }
    const result = L.endRound(state);
    assert.equal(result.ok, true, result.error || '结算失败');
    if (state.phase === 'interlude') {
      const continued = L.continueFromInterlude(state);
      assert.equal(continued.ok, true, continued.error || '夜间确认失败');
    }
  }
  return {
    ending: state.ending ? state.ending.id : 'undecided',
    round: state.round,
    ap: state.ap,
    pressure: state.pressure,
    stats: Object.assign({}, state.stats),
    commands: state.commands.length,
    stages: L.getCommandCounts(state)
  };
}

function simulate(policy) {
  const outcomes = {};
  let pressure = 0;
  let commands = 0;
  let apLeft = 0;
  const sample = [];
  for (let i = 0; i < RUNS; i += 1) {
    const result = runGame(policy, 20260224 + i * 97);
    outcomes[result.ending] = (outcomes[result.ending] || 0) + 1;
    pressure += result.pressure;
    commands += result.commands;
    apLeft += result.ap;
    if (i < 3) sample.push(result);
  }
  return {
    policy: policy,
    outcomes: outcomes,
    pressure: pressure / RUNS,
    commands: commands / RUNS,
    apLeft: apLeft / RUNS,
    sample: sample
  };
}

const results = POLICIES.map(function (entry) {
  const simulation = simulate(entry[0]);
  simulation.label = entry[1];
  return simulation;
});

console.log('《小泽模拟器》固定优势排查 · ' + RUNS + ' 局/策略（模拟设计值，不是历史统计）');
console.log('策略只处理 AP、签发、授权、机构容量、委派、跟进与截止窗口；不使用隐藏随机扣分。\n');
for (const result of results) {
  const total = Object.values(result.outcomes).reduce(function (a, b) { return a + b; }, 0);
  const top = Object.keys(result.outcomes).sort(function (a, b) { return result.outcomes[b] - result.outcomes[a]; }).slice(0, 5);
  console.log(result.label + '（' + result.policy + '）');
  console.log('  平均剩余 AP ' + result.apLeft.toFixed(2) + ' | 平均签发 ' + result.commands.toFixed(2) + ' 项 | 平均最终压力 ' + result.pressure.toFixed(1));
  console.log('  ' + top.map(function (id) { return id + ' ' + (result.outcomes[id] / total * 100).toFixed(1) + '%'; }).join(' / '));
}
console.log('\n只能把这些数字当作发现问题的工作台：高胜率政策仍需逐条回看命令窗口、机构代价和玩家是否能解释原因，不能据此直接调数值。');
