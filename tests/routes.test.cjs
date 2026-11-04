/*
 * v1.1.0 路线差异化测试：八条完整路线（近历史 / 机场不同处理 / 政府自主运行 /
 * 委派与常设授权 / 西北优先 / 东侧优先 / 外援优先 / 情报谨慎）。
 * 检查：都能走到结局、触发的条件事件不同、触发原因可追溯、重大决策留下差异、
 * 同种子同决策可复现、没有重复事件、没有越界数值。
 * 运行：node tests/routes.test.cjs
 */
'use strict';

const assert = require('node:assert');
const path = require('node:path');

const store = new Map();
globalThis.window = globalThis;
globalThis.localStorage = {
  getItem: function (key) { return store.has(key) ? store.get(key) : null; },
  setItem: function (key, value) { store.set(key, String(value)); },
  removeItem: function (key) { store.delete(key); },
  clear: function () { store.clear(); }
};

const root = path.join(__dirname, '..');
['events', 'intel', 'strategy', 'campaign', 'dynamic', 'storylines', 'replay', 'archive', 'afterward', 'engine'].forEach(function (name) {
  require(path.join(root, 'js/' + name + '.js'));
});

const L = globalThis.LZS;
const D = globalThis.LZS_DYNAMIC;
const ST = globalThis.LZS_STORYLINES;
const AGENCIES = ['office', 'general_staff', 'interior', 'foreign', 'logistics', 'communications'];

let passed = 0;
const failures = [];
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('  ✓ ' + name);
  } catch (error) {
    failures.push({ name: name, error: error });
    console.log('  ✗ ' + name);
    console.log('    ' + (error && error.message ? error.message : error));
  }
}

function issue(state, id) {
  const result = L.issueCommand(state, id);
  if (!result.ok) return null;
  if (result.command.status === 'issued') L.authorizeCommand(state, result.command.id);
  return result.command;
}

function tryDelegate(state) {
  /* 委派发生在签发那一刻：由 issueCommand 的 delegate 选项把非关键事务交给承接机构自行办理。
     先试「授权范围内自行办理」，不行再试「办理方案送回总统批准」，都不行就由总统本人签发。 */
  const open = L.getAvailableChoices(state).filter(function (choice) { return !choice.keyDecision; });
  for (let i = 0; i < open.length; i += 1) {
    const autonomous = L.issueCommand(state, open[i].id, { delegate: true });
    if (autonomous.ok) {
      if (autonomous.command.status === 'issued') L.authorizeCommand(state, autonomous.command.id);
      return true;
    }
    const approval = L.issueCommand(state, open[i].id, { delegate: true, returnForApproval: true });
    if (approval.ok) {
      if (approval.command.status === 'issued') L.authorizeCommand(state, approval.command.id);
      return true;
    }
  }
  return false;
}

function issueDelegated(state, id) {
  const autonomous = L.issueCommand(state, id, { delegate: true });
  if (autonomous.ok) {
    if (autonomous.command.status === 'issued') L.authorizeCommand(state, autonomous.command.id);
    return autonomous.command;
  }
  const approval = L.issueCommand(state, id, { delegate: true, returnForApproval: true });
  if (approval.ok) {
    if (approval.command.status === 'issued') L.authorizeCommand(state, approval.command.id);
    return approval.command;
  }
  return null;
}

/* 跑一条完整路线。opts.delegate / opts.standing 用于委派与常设授权路线。 */
function play(plan, opts) {
  const o = opts || {};
  const state = L.createGame({ scenario: 'campaign', seed: o.seed || 20220224 });
  let guard = 0;
  let standingGranted = false;
  while (!state.ending && guard < 40) {
    const event = L.getEvent(state);
    const wanted = (typeof plan === 'function' ? plan(state, event) : plan[event.id]) || [];
    for (let i = 0; i < wanted.length; i += 1) {
      if (state.ending) break;
      const viaDelegation = o.delegate ? issueDelegated(state, wanted[i]) : null;
      if (!viaDelegation) issue(state, wanted[i]);
    }
    if (!state.executed.length) {
      const cheap = L.getAvailableChoices(state).sort(function (a, b) { return a.ap - b.ap; })[0];
      if (cheap) issue(state, cheap.id);
    }
    if (o.standing && !standingGranted) {
      if (L.grantStanding(state, o.standing).ok) standingGranted = true;
    }
    if (o.delegate) {
      let tries = 0;
      while (tries < 3 && state.ap > 0 && tryDelegate(state)) tries += 1;
    }
    if (state.ending) break;
    L.endRound(state);
    if (state.phase === 'wrapup_offer') L.declineWrapUp(state);
    if (state.phase === 'interlude') L.continueFromInterlude(state);
    guard += 1;
  }
  assert.ok(state.ending, '路线没有走到结局（可能死锁）');
  STAT_KEYS_FOR.forEach(function (key) {
    assert.ok(state.stats[key] >= 0 && state.stats[key] <= 100, '数值越界：' + key + '=' + state.stats[key]);
  });
  return state;
}
const STAT_KEYS_FOR = L.statKeys || ['gov', 'army', 'kyiv', 'will', 'intl', 'reserve', 'safety'];

function firedIds(state) {
  const dyn = state.campaign && state.campaign.dyn;
  if (!dyn || !dyn.fired) return [];
  return Object.keys(dyn.fired).sort();
}

/* 八条路线：名字 → 每窗口决策 + 额外的治理方式。 */
const ROUTES = {
  /* 1. 近历史：像公开记述那样处理跑道、守住首都、把预备队放到莫什春、先要防空。 */
  near_history: {
    plan: {
      c1: ['c_command_line', 'c_first_appeal'], c2: ['c_counter_airfield'], c3: ['c_stay_capital', 'c_address_nation'],
      c4: ['c_counterintel', 'c_rumor_rules'], c5: ['c_blow_bridges', 'c_form_reserve'], c6: ['c_harass_convoy'],
      c7: ['c_evacuate', 'c_wishlist'], c8: ['c_rotation'], c9: ['c_reserve_moshchun'],
      c10: ['c_air_defense_aid', 'c_staff_rest'], c11: ['c_counter_west', 'c_prepare_return'],
      c12: ['c_stay_alert', 'c_verify_signal'], c13: ['c_staged_return', 'c_document']
    }
  },
  /* 2. 机场不同处理：保留设施、后续地面压力与跑道反复受损的线都不一样。 */
  airfield_kept: {
    plan: {
      c1: ['c_disperse'], c2: ['c_keep_airfield', 'c_airfield_reports'], c3: ['c_split_succession'],
      c4: ['c_arm_volunteers'], c5: ['c_keep_bridges'], c6: ['c_release_stocks'], c7: ['c_info_rules'],
      c8: ['c_honest_briefing'], c9: ['c_reserve_hold'], c10: ['c_staff_rest'], c11: ['c_hold_lines'],
      c12: ['c_trust_redeploy'], c13: ['c_fast_return']
    }
  },
  /* 3. 政府自主运行：把日常事务交给机构，总统只管重大决策。 */
  gov_autonomy: {
    plan: {
      c1: ['c_disperse'], c2: ['c_deny_runway'], c3: ['c_split_succession', 'c_address_nation'],
      c4: ['c_curfew'], c5: ['c_form_reserve'], c6: ['c_logistics_hub'], c7: ['c_civil_admin'],
      c8: ['c_decentralize'], c9: ['c_reserve_split'], c10: ['c_civil_admin'], c11: ['c_prepare_return'],
      c12: ['c_verify_signal'], c13: ['c_restore_services', 'c_document']
    },
    standing: 'office'
  },
  /* 4. 委派：每个窗口把非关键事务交给承接机构，总统注意力留给重大决策。 */
  delegation: {
    plan: {
      c1: ['c_first_appeal'], c2: ['c_deny_runway'], c3: ['c_stay_capital'], c4: ['c_curfew'],
      c5: ['c_blow_bridges'], c6: ['c_chernihiv'], c7: ['c_wishlist'], c8: ['c_rotation'],
      c9: ['c_reserve_moshchun'], c10: ['c_repair'], c11: ['c_counter_west'], c12: ['c_verify_signal'],
      c13: ['c_staged_return']
    },
    delegate: true
  },
  /* 5. 西北优先：炸桥、河谷、莫什春、西侧反击。 */
  northwest: {
    plan: {
      c1: ['c_martial'], c2: ['c_deny_runway'], c3: ['c_stay_capital'], c4: ['c_counterintel'],
      c5: ['c_blow_bridges', 'c_flood_valley'], c6: ['c_chernihiv'], c7: ['c_evacuate'],
      c8: ['c_rotation'], c9: ['c_reserve_moshchun'], c10: ['c_air_defense_aid'], c11: ['c_counter_west'],
      c12: ['c_verify_signal'], c13: ['c_staged_return', 'c_document']
    }
  },
  /* 6. 东侧优先：预备队与伏击压在布罗瓦雷方向。 */
  east_first: {
    plan: {
      c1: ['c_martial'], c2: ['c_deny_runway'], c3: ['c_stay_capital'], c4: ['c_curfew'],
      c5: ['c_blow_bridges'], c6: ['c_release_stocks'], c7: ['c_fortify_city'], c8: ['c_ammo_ration'],
      c9: ['c_reserve_brovary', 'c_brovary_ambush'], c10: ['c_repair'], c11: ['c_counter_east'],
      c12: ['c_stay_alert'], c13: ['c_fast_return']
    }
  },
  /* 7. 外援优先：先提请求、给清单、开会话、要防空。 */
  aid_first: {
    plan: {
      c1: ['c_first_appeal'], c2: ['c_airfield_reports'], c3: ['c_split_succession', 'c_address_nation'],
      c4: ['c_honest_briefing'], c5: ['c_keep_bridges'], c6: ['c_logistics_hub'], c7: ['c_wishlist'],
      c8: ['c_honest_briefing'], c9: ['c_reserve_split'], c10: ['c_talks_channel', 'c_air_defense_aid'],
      c11: ['c_hold_lines'], c12: ['c_cautious_message'], c13: ['c_document', 'c_restore_services']
    }
  },
  /* 8. 情报谨慎：先反谍、先核实、只发谨慎的信号。 */
  intel_careful: {
    plan: {
      c1: ['c_command_line'], c2: ['c_airfield_reports'], c3: ['c_stay_capital'],
      c4: ['c_counterintel', 'c_rumor_rules'], c5: ['c_form_reserve'], c6: ['c_harass_convoy'],
      c7: ['c_info_rules'], c8: ['c_honest_briefing'], c9: ['c_reserve_hold'],
      c10: ['c_staff_rest', 'c_repair'], c11: ['c_prepare_return'],
      c12: ['c_verify_signal', 'c_cautious_message'], c13: ['c_document']
    }
  }
};

const runs = {};
Object.keys(ROUTES).forEach(function (name) {
  const config = ROUTES[name];
  runs[name] = play(config.plan, { seed: config.seed || 20220224, delegate: config.delegate, standing: config.standing });
});

test('八条完整路线都能走到结局，且没有死锁', function () {
  const names = Object.keys(runs);
  assert.equal(names.length, 8, '应有八条路线');
  names.forEach(function (name) {
    const state = runs[name];
    assert.ok(state.ending && state.ending.id, name + ' 没有结局');
    assert.ok(state.round >= 1 && state.round <= 16, name + ' 窗口数异常：' + state.round);
  });
});

test('每条路线都触发真正的条件事件，而不是只有骨架事件', function () {
  Object.keys(runs).forEach(function (name) {
    const ids = firedIds(runs[name]);
    assert.ok(ids.length >= 3, name + ' 只触发了 ' + ids.length + ' 条动态事件');
  });
});

test('不同路线触发的事件不同：任两条路线之间至少差 4 条事件', function () {
  const names = Object.keys(runs);
  const sets = {};
  names.forEach(function (name) { sets[name] = firedIds(runs[name]); });
  const pairs = [];
  for (let i = 0; i < names.length; i += 1) {
    for (let j = i + 1; j < names.length; j += 1) {
      const a = sets[names[i]];
      const b = sets[names[j]];
      const diff = a.filter(function (id) { return b.indexOf(id) === -1; })
        .concat(b.filter(function (id) { return a.indexOf(id) === -1; }));
      pairs.push({ a: names[i], b: names[j], diff: diff.length });
    }
  }
  pairs.sort(function (x, y) { return x.diff - y.diff; });
  assert.ok(pairs[0].diff >= 4, pairs[0].a + ' 与 ' + pairs[0].b + ' 只差 ' + pairs[0].diff + ' 条事件');
  const wide = pairs.filter(function (pair) { return pair.diff >= 4; }).length;
  assert.ok(wide >= 20, '差异明显的路线对只有 ' + wide + ' 对');
});

test('每条触发记录都能追溯原因：层、触发条件与窗口都在', function () {
  Object.keys(runs).forEach(function (name) {
    const state = runs[name];
    const dyn = state.campaign.dyn;
    Object.keys(dyn.fired).forEach(function (id) {
      const template = D.byId(id);
      assert.ok(template, '触发了未知模板 ' + id);
      assert.ok(['condition', 'state', 'friction'].indexOf(template.layer) !== -1, id + ' 缺少层');
      assert.ok(template.when && typeof template.when === 'object', id + ' 缺少触发条件');
      assert.ok(template.history, id + ' 缺少历史属性');
      assert.ok(Number.isInteger(dyn.fired[id]) && dyn.fired[id] >= 1, id + ' 缺少触发窗口');
    });
  });
});

test('同一局里不会重复触发同一个事件', function () {
  Object.keys(runs).forEach(function (name) {
    const log = runs[name].campaign.dyn.log;
    const seen = {};
    log.forEach(function (entry) {
      const id = entry.id || entry.dynId;
      assert.ok(!seen[id], name + ' 重复触发了 ' + id);
      seen[id] = true;
    });
  });
});

test('重大决策在结局复盘里留下不同节点：八条路线不全落同一个分支', function () {
  const signature = {};
  Object.keys(runs).forEach(function (name) {
    const ending = runs[name].ending;
    assert.ok(Array.isArray(ending.divergence), name + ' 缺少分支复盘');
    signature[name] = ending.divergence.map(function (item) { return item.node + ':' + item.kind; }).sort().join('|');
  });
  const distinct = Object.keys(signature).map(function (key) { return signature[key]; })
    .filter(function (value, index, list) { return list.indexOf(value) === index; });
  assert.ok(distinct.length >= 3, '八条路线只产生 ' + distinct.length + ' 种分支复盘');
  assert.ok(signature.airfield_kept !== signature.near_history, '保留机场设施与近历史路线的分支复盘完全相同');
});

test('同种子、同决策可复现；换种子才会出现不同的摩擦事件', function () {
  const plan = ROUTES.northwest.plan;
  const first = play(plan, { seed: 20220224 });
  const second = play(plan, { seed: 20220224 });
  assert.deepEqual(firedIds(first), firedIds(second), '同种子同决策应完全复现');
  assert.equal(first.ending.id, second.ending.id, '同种子同决策的结局应一致');
  const third = play(plan, { seed: 424242 });
  const frictionSeen = function (state) {
    return firedIds(state).filter(function (id) { return D.byId(id).layer === 'friction'; }).sort();
  };
  assert.notDeepEqual(frictionSeen(first), frictionSeen(third), '换种子后摩擦事件应有变化');
});

test('委派路线确实把事务交出去，并省下总统注意力', function () {
  const delegated = runs.delegation.commands.filter(function (command) { return command.delegation; });
  assert.ok(delegated.length >= 4, '只委派了 ' + delegated.length + ' 项');
  delegated.forEach(function (command) {
    assert.ok(command.delegation.agencyId, '委派缺少承接机构');
    assert.ok(['autonomous', 'approval'].indexOf(command.delegation.mode) !== -1, '委派缺少办理方式');
    assert.ok(command.delegation.deadlineRound >= command.round, '委派缺少期限');
  });
  const baseline = runs.near_history;
  const delegatedSpent = runs.delegation.timeline.reduce(function (sum, item) { return sum + (item.apSpent || 0); }, 0);
  assert.ok(delegatedSpent < 30, '委派路线的总统注意力消耗应低于 30，实际 ' + delegatedSpent);
});

test('常设授权路线留下了授权记录，且带范围与期限', function () {
  const standing = runs.gov_autonomy.standing || {};
  const active = Object.keys(standing).filter(function (key) { return standing[key] && standing[key].grantedRound; });
  assert.ok(active.length >= 1, '没有留下常设授权记录');
  active.forEach(function (agencyId) {
    const record = standing[agencyId];
    assert.ok(record.expiresRound >= record.grantedRound, agencyId + ' 的授权没有期限');
    assert.ok(!record.revokedRound || record.revokedRound >= record.grantedRound, agencyId + ' 的撤销时间早于授予');
  });
});

test('路线差异体现在后续事件与条件上，而不只是结局名字', function () {
  const a = runs.airfield_kept;
  const b = runs.near_history;
  const nearHistoryAirfield = firedIds(b).filter(function (id) { return D.byId(id).replay === 'airfield'; });
  const keptAirfield = firedIds(a).filter(function (id) { return D.byId(id).replay === 'airfield'; });
  assert.ok(nearHistoryAirfield.length > 0, '近历史路线没有触发机场方向的后续事件');
  assert.ok(keptAirfield.length > 0, '保留设施路线没有触发机场方向的后续事件');
  const same = nearHistoryAirfield.filter(function (id) { return keptAirfield.indexOf(id) !== -1; });
  assert.ok(same.length < Math.min(nearHistoryAirfield.length, keptAirfield.length), '机场方向两条路线事件完全一样');
});

/* ── v1.2：故事线让不同路线产生不同的叙事过程 ─────────── */
function playWithStory(plan, opts) {
  const o = opts || {};
  const state = L.createGame({ scenario: 'campaign', seed: o.seed || 20220224 });
  let guard = 0;
  while (!state.ending && guard++ < 40) {
    if (state.phase === 'briefing') {
      (state.dispatches || []).forEach(function (item) {
        if (item.type !== 'story' || item.resolved) return;
        const pick = (item.options || []).filter(function (opt) {
          return opt.id !== 'defer' && (opt.ap || 0) <= state.ap;
        }).sort(function (a, b) { return (a.ap || 0) - (b.ap || 0); })[0];
        if (pick) L.resolveDispatch(state, item.id, pick.id);
      });
    }
    const event = L.getEvent(state);
    if (!event) break;
    const wanted = (typeof plan === 'function' ? plan(state, event) : plan[event.id]) || [];
    wanted.forEach(function (id) { issue(state, id); });
    if (!state.executed.length) {
      const cheap = L.getAvailableChoices(state).sort(function (a, b) { return a.ap - b.ap; })[0];
      if (cheap) issue(state, cheap.id);
    }
    L.endRound(state);
    if (state.phase === 'wrapup_offer') L.declineWrapUp(state);
    if (state.phase === 'interlude') L.continueFromInterlude(state);
  }
  assert.ok(state.ending, '路线没有走到结局');
  return state;
}

function storySignature(state) {
  const store = state.campaign.story || {};
  return (store.log || []).map(function (entry) { return entry.lineId + ':' + entry.stepId; }).sort();
}

test('八条路线都会展开故事线，且没有一条线完全没有下文', function () {
  const names = Object.keys(ROUTES);
  assert.ok(names.length >= 8, '应至少八条路线，实际 ' + names.length);
  const samples = ['near_history', 'airfield_kept', 'gov_autonomy', 'northwest'];
  samples.forEach(function (name) {
    const state = playWithStory(ROUTES[name].plan, { seed: 20220224 });
    const signature = storySignature(state);
    assert.ok(signature.length >= 3, name + ' 的故事线推进太少：' + signature.length);
    const store = state.campaign.story;
    assert.ok((store.active || []).length >= ST.primaryLines, name + ' 没有激活足够的主轴故事线');
  });
});

test('不同路线的故事线走向不同，不是只改结局名字', function () {
  const a = storySignature(playWithStory(ROUTES.near_history.plan, { seed: 20220224 }));
  const b = storySignature(playWithStory(ROUTES.airfield_kept.plan, { seed: 20220224 }));
  const c = storySignature(playWithStory(ROUTES.gov_autonomy.plan, { seed: 20220224, standing: 'office' }));
  const sameAsA = b.filter(function (id) { return a.indexOf(id) !== -1; });
  assert.ok(sameAsA.length < a.length, '保留设施路线与近历史路线故事线完全一样');
  const sigA = a.join('|');
  const sigB = b.join('|');
  const sigC = c.join('|');
  assert.ok(sigA !== sigC, '政府自主路线与近历史路线故事线完全一样');
  assert.ok(sigB !== sigC, '保留设施路线与政府自主路线故事线完全一样');
});

test('处理故事线文件会改变后续窗口的内容，而不只是最终数字', function () {
  const engaged = playWithStory(ROUTES.near_history.plan, { seed: 20220224 });
  const ignored = play(ROUTES.near_history.plan, { seed: 20220224 });
  const engagedFeed = (engaged.campaign.feed || []).map(function (item) { return item.stepId; }).filter(Boolean);
  const ignoredFeed = (ignored.campaign.feed || []).map(function (item) { return item.stepId; }).filter(Boolean);
  const onlyEngaged = engagedFeed.filter(function (id) { return ignoredFeed.indexOf(id) === -1; });
  const onlyIgnored = ignoredFeed.filter(function (id) { return engagedFeed.indexOf(id) === -1; });
  assert.ok(onlyEngaged.length + onlyIgnored.length >= 3, '处理与不处理故事线文件，后续动态应至少差三条，实际 ' + (onlyEngaged.length + onlyIgnored.length));
  const engagedPaths = Object.keys((engaged.campaign.story || {}).paths || {});
  assert.ok(engagedPaths.length >= 1, '处理过文件之后应留下至少一条线的走向记录');
});

console.log('');
if (failures.length) {
  console.log('v1.1 八条完整路线测试：' + passed + ' 通过，' + failures.length + ' 失败');
  process.exit(1);
} else {
  console.log('v1.1 八条完整路线测试：' + passed + ' 通过，0 失败');
}

