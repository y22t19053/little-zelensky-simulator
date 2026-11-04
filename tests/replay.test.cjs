/* v1.1.0 决策推演室测试：模块结构、解锁门槛、当时视角、反事实标注、记录隔离。 */
'use strict';

const assert = require('node:assert');
const path = require('node:path');

/* 最小 localStorage / document 模拟，与其它测试文件保持一致的做法。 */
const storage = {};
globalThis.localStorage = {
  getItem: function (key) { return Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null; },
  setItem: function (key, value) { storage[key] = String(value); },
  removeItem: function (key) { delete storage[key]; },
  clear: function () { Object.keys(storage).forEach(function (key) { delete storage[key]; }); }
};
globalThis.window = globalThis;
globalThis.document = {
  createElement: function () { return { style: {}, appendChild: function () {}, setAttribute: function () {} }; },
  querySelector: function () { return null; },
  addEventListener: function () {}
};

const root = path.join(__dirname, '..');
require(path.join(root, 'js/events.js'));
require(path.join(root, 'js/intel.js'));
require(path.join(root, 'js/strategy.js'));
require(path.join(root, 'js/campaign.js'));
require(path.join(root, 'js/dynamic.js'));
require(path.join(root, 'js/engine.js'));
require(path.join(root, 'js/replay.js'));

const R = globalThis.LZS_REPLAY;

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

/* 把一次推演从头走到结束，返回会话本身。 */
function playThrough(moduleId, infoMode) {
  const session = R.createSession(moduleId, { infoMode: infoMode || 'then' });
  let guard = 0;
  while (!session.finished && guard < 30) {
    assert.ok(session.visibleStep, '推演在中途失去了当前决策点');
    const picked = R.choose(session, session.visibleStep.choices[0].id);
    assert.ok(picked.ok, '推进推演失败：' + (picked.reason || ''));
    guard += 1;
  }
  assert.equal(session.finished, true, '推演没有走到结束');
  assert.ok(session.result, '结束后应生成结果');
  return session;
}

test('推演室：至少 3 个模块（v1.1 交付 6 个），每个都写清真实背景、当时信息、当时选择与模拟范围', function () {
  assert.ok(R.count >= 3, '推演模块只有 ' + R.count + ' 个');
  assert.ok(R.count >= 6, 'v1.1 应有 6 个推演入口，实际 ' + R.count);
  R.modules.forEach(function (module) {
    assert.ok(module.id && module.title, '模块缺少 ID 或标题');
    assert.ok(module.background && module.background.length > 40, module.id + ' 真实历史背景太短');
    assert.ok(Array.isArray(module.knownThen) && module.knownThen.length >= 2, module.id + ' 缺少当时可得信息');
    assert.ok(Array.isArray(module.optionsThen) && module.optionsThen.length >= 2, module.id + ' 缺少当时实际存在的选择');
    module.optionsThen.forEach(function (option) {
      assert.ok(R.kinds[option.kind], module.id + ' 的选项 ' + option.id + ' 历史属性不在四类里');
      assert.ok(option.note, module.id + ' 的选项 ' + option.id + ' 缺少说明');
    });
    assert.ok(module.dateLabel && module.durationLabel, module.id + ' 缺少起始时间或模拟时长');
    assert.ok(module.length && R.lengths[module.length], module.id + ' 缺少推演长度分类');
    assert.ok(module.infoLimitNote, module.id + ' 缺少信息限制说明');
    assert.ok(module.historicalBaseline && module.historicalBaseline.note, module.id + ' 缺少历史基准线说明');
    assert.ok(Array.isArray(module.uncertainty) && module.uncertainty.length >= 2, module.id + ' 缺少不确定性清单');
    assert.ok(Array.isArray(module.steps) && module.steps.length >= 3, module.id + ' 推演步数不足');
    assert.ok(module.ending && module.ending.title && module.ending.text, module.id + ' 缺少结束说明');
  });
});

test('推演室：六个决策节点都有入口，模块与节点对得上', function () {
  const nodes = {};
  R.modules.forEach(function (module) { nodes[module.node] = true; });
  ['airfield', 'capital', 'bridges', 'reserve', 'aid', 'signal'].forEach(function (node) {
    assert.ok(nodes[node], '缺少决策节点入口：' + node);
  });
});

test('推演室：每一步都有局势、情报和至少两个不同走向的选择，反事实字段齐全', function () {
  R.modules.forEach(function (module) {
    module.steps.forEach(function (step) {
      assert.ok(step.id && step.date && step.title, module.id + '/' + step.id + ' 缺少标题或日期');
      assert.ok(step.situation && step.situation.length > 20, module.id + '/' + step.id + ' 缺少局势说明');
      assert.ok(Array.isArray(step.intel) && step.intel.length >= 1, module.id + '/' + step.id + ' 缺少情报');
      step.intel.forEach(function (entry) {
        assert.ok(R.kinds[entry.kind], module.id + '/' + step.id + ' 的情报历史属性不合法');
        assert.ok(entry.text, module.id + '/' + step.id + ' 的情报缺少正文');
      });
      assert.ok(Array.isArray(step.choices) && step.choices.length >= 2, module.id + '/' + step.id + ' 选择不足');
      const nexts = {};
      step.choices.forEach(function (choice) {
        assert.ok(choice.id && choice.label, module.id + '/' + step.id + ' 的选择缺少 ID 或标题');
        assert.ok(choice.kind && R.kinds[choice.kind], module.id + '/' + step.id + '/' + choice.id + ' 历史属性不合法');
        assert.ok(choice.next, module.id + '/' + step.id + '/' + choice.id + ' 缺少后续步骤');
        nexts[choice.next] = true;
        assert.ok(choice.analysis, module.id + '/' + step.id + '/' + choice.id + ' 缺少反事实分析');
        ['gain', 'risk', 'need', 'enemy', 'later', 'uncertainty'].forEach(function (field) {
          assert.ok(choice.analysis[field], module.id + '/' + step.id + '/' + choice.id + ' 的反事实缺 ' + field);
        });
      });
      assert.ok(Object.keys(nexts).length >= 1, module.id + '/' + step.id + ' 的选择没有后续步骤');
      /* 选项可以有相同的下一步（同一节点内的不同做法），但分析必须真的不同。 */
      const ids = {};
      step.choices.forEach(function (choice) { ids[choice.id] = true; });
      assert.equal(Object.keys(ids).length, step.choices.length, module.id + '/' + step.id + ' 选择 ID 重复');
      const signatures = {};
      step.choices.forEach(function (choice) { signatures[choice.analysis.gain + '|' + choice.analysis.risk] = true; });
      assert.ok(Object.keys(signatures).length >= 2, module.id + '/' + step.id + ' 的选择分析几乎一样');
    });
  });
});

test('推演室：未通关前锁定并说明原因，通关一次后解锁', function () {
  localStorage.clear();
  const locked = R.unlockState();
  assert.equal(locked.unlocked, false, '没有战役记录时不应解锁');
  assert.ok(locked.reason && locked.reason.length > 5, '锁定时应说明原因');
  const save = { version: 1, runs: [{ key: 'k1', endedAt: Date.now(), endingId: 'c_A', endingTitle: '首都保全', round: 13, scenario: 'campaign', style: 'balanced', styleLabel: '均衡' }] };
  localStorage.setItem('lzs_records_v1', JSON.stringify(save));
  const state = R.unlockState();
  assert.equal(state.unlocked, true, '通关一次后应解锁');
  assert.equal(state.completed, 1, '应记住完成次数');
  assert.equal(R.summary().unlocked, true);
});

test('推演室：当时视角隐藏后来才确认的信息，全知视角可以看到', function () {
  const thenSession = R.createSession('rp_airfield', { infoMode: 'then' });
  const allSession = R.createSession('rp_airfield', { infoMode: 'all' });
  const then = thenSession.visibleStep;
  const all = allSession.visibleStep;
  assert.ok(then && all, '开始时应展示第一个决策点');
  const thenLater = then.intel.filter(function (entry) { return entry.later; });
  const allLater = all.intel.filter(function (entry) { return entry.later; });
  assert.ok(allLater.length >= 1, '全知视角应能看到后来才确认的信息');
  assert.equal(thenLater.length, 0, '当时视角不应出现后来才确认的信息');
  assert.ok(then.hiddenCount >= 1, '当时视角应说明还有多少信息被隐藏');
  assert.ok(R.moduleOf('rp_airfield').infoLimitNote.length > 10, '模块应说明这是信息限制模式');
});

test('推演室：选择可以一路走到结束，结果里带着差异比较与免责说明', function () {
  const session = playThrough('rp_capital', 'then');
  const result = session.result;
  assert.equal(result.disclaimer, R.disclaimer);
  assert.ok(result.disclaimer.indexOf('模型推演') !== -1, '免责说明必须写明是模型推演');
  assert.ok(result.steps >= 3, '应记录玩家走过的步骤');
  assert.ok(result.path.length === result.steps);
  assert.ok(Array.isArray(result.divergences) && result.divergences.length === 1, '应与历史基准线做一次对照');
  assert.ok(result.divergences[0].baseline, '对照里应写出历史更接近的选择');
  assert.ok(result.lines.length === result.steps);
  result.lines.forEach(function (line) {
    assert.ok(line.gain && line.risk && line.need && line.enemy && line.later && line.uncertainty, '反事实分析字段不全');
  });
  assert.ok(result.ending && result.ending.text, '缺少结束说明');
  assert.ok(Array.isArray(result.uncertainty) && result.uncertainty.length >= 2, '结束时应列出无法确认的结论');
});

test('推演室：历史基准线指向真实选项，没有单独历史结论的节点明确标成假设', function () {
  R.modules.forEach(function (module) {
    const baseline = module.historicalBaseline.choice;
    const allChoiceIds = {};
    module.steps.forEach(function (step) {
      step.choices.forEach(function (choice) { allChoiceIds[choice.id] = true; });
    });
    if (baseline === null) {
      /* 两个方向都坚持过、公开资料不足以简化成一次选择，就明确写成假设，而不是硬编一个基准线。 */
      assert.ok(/假设|不支持|不足以/.test(module.historicalBaseline.note), module.id + ' 没有基准线时应说明这是假设');
      return;
    }
    assert.ok(allChoiceIds[baseline], module.id + ' 的历史基准线选择不在任何一步里：' + baseline);
  });
  const withBaseline = R.modules.filter(function (module) { return module.historicalBaseline.choice; });
  assert.ok(withBaseline.length >= 5, '至少 5 个节点应该有可对照的历史基准线');
});

test('推演记录写进独立存档键，不污染战役记录', function () {
  localStorage.clear();
  const session = playThrough('rp_signal', 'then');
  const record = R.recordRun(session);
  assert.ok(record && record.id, '没有写回记录');
  assert.ok(localStorage.getItem(R.storageKey), '推演记录应写入自己的键');
  assert.equal(localStorage.getItem('lzs_records_v1'), null, '不应创建或改写战役记录');
  const store = R.readStore();
  assert.equal(store.runs.length, 1);
  assert.equal(store.runs[0].moduleId, 'rp_signal');
  assert.ok(store.runs[0].path.length >= 3);
  assert.equal(typeof store.runs[0].diverged, 'boolean');
  const summary = R.summary();
  assert.equal(summary.totalRuns, 1);
  assert.equal(summary.modules.length, R.count);
});

test('推演室：历史属性四类都能在模块里找到实例，且文案里用中文说清', function () {
  const used = {};
  R.modules.forEach(function (module) {
    module.optionsThen.forEach(function (option) { used[option.kind] = true; });
    module.steps.forEach(function (step) {
      step.choices.forEach(function (choice) { used[choice.kind] = true; });
      step.intel.forEach(function (entry) { used[entry.kind] = true; });
    });
  });
  Object.keys(R.kinds).forEach(function (kind) {
    assert.ok(used[kind], '推演里没有出现历史属性：' + R.kinds[kind]);
    assert.ok(/[\u4e00-\u9fa5]/.test(R.kinds[kind]), '历史属性标签应是中文');
  });
});

test('推演室：模块与动态事件共用同一套决策节点名，两边能对上', function () {
  const D = globalThis.LZS_DYNAMIC;
  R.modules.forEach(function (module) {
    assert.ok(D.replayNodes[module.node], '推演节点名与动态事件不一致：' + module.node);
    const related = D.templates.filter(function (template) { return template.replay === module.node; });
    assert.ok(related.length >= 1, '推演节点没有对应的动态事件：' + module.node);
  });
});

test('推演室：不叫架空剧本，界面用词与数据一致', function () {
  const text = JSON.stringify(R.modules);
  ['架空历史剧本', '平行历史剧本', '关卡选择', '已解锁关卡'].forEach(function (word) {
    assert.equal(text.indexOf(word), -1, '推演文案里出现了不该有的说法：' + word);
  });
  assert.ok(R.disclaimer.indexOf('不代表真实历史') !== -1);
});

console.log('');
if (failures.length) {
  console.log('v1.1 决策推演测试：' + passed + ' 通过，' + failures.length + ' 失败');
  process.exit(1);
} else {
  console.log('v1.1 决策推演测试：' + passed + ' 通过，0 失败');
}
