/*
 * 《小泽模拟器》v1.1.0 · 多周目档案
 * 每完成一次「2022 · 基辅防御战役」，就往这里追加一条探索记录：
 * 走过的关键路线、见过的条件事件、探明到哪一层分支、做过哪些推演。
 * 独立存档键，与战役记录（lzs_records_v1）、推演记录（lzs_replay_v1）互不改写。
 */
(function (root) {
  'use strict';

  const VERSION = '1.1.0';
  const STORAGE_KEY = 'lzs_archive_v1';
  const BACKUP_KEY = 'lzs_archive_v1_broken';
  const MAX_RUNS = 40;

  /* 关键决策节点：结局页与档案柜都用同一套名称，避免出现两套说法。 */
  const NODES = [
    { node: 'airfield', label: '安东诺夫机场', hint: '跑道与设施的处理' },
    { node: 'capital', label: '政府连续性', hint: '核心层留在首都还是分散' },
    { node: 'bridges', label: '伊尔平河与西北', hint: '桥梁、河谷与撤离通道' },
    { node: 'reserve', label: '预备队配置', hint: '莫什春与布罗瓦雷的方向竞争' },
    { node: 'aid', label: '外援协调', hint: '请求、条件、路线与分配' },
    { node: 'signal', label: '撤退信号判断', hint: '信号核实与重新进入' },
    { node: 'return', label: '重新进入失地', hint: '排雷、清障与恢复' }
  ];

  function emptyStore() {
    return { version: 1, runs: [] };
  }

  function safeParse(raw) {
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.runs)) return null;
      return parsed;
    } catch (error) {
      return null;
    }
  }

  /*
   * 读档案。解析失败时不删不改，先把原始文本另存一份再返回空档，
   * 这样玩家已有的记录不会因为一次读取异常被静默清空。
   */
  function readStore() {
    try {
      const raw = root.localStorage && root.localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyStore();
      const parsed = safeParse(raw);
      if (parsed) {
        if (!parsed.version) parsed.version = 1;
        parsed.runs.forEach(function (run) {
          if (!Array.isArray(run.events)) run.events = [];
          if (!run.branches || typeof run.branches !== 'object') run.branches = {};
          if (!Array.isArray(run.route)) run.route = [];
        });
        return parsed;
      }
      /* 迁移/解析失败：保留原始文本到备份键，返回空档，不覆盖原数据。 */
      try { root.localStorage.setItem(BACKUP_KEY, raw); } catch (error) { /* 备份失败也要让游戏能继续 */ }
      const store = emptyStore();
      store.broken = true;
      return store;
    } catch (error) {
      const store = emptyStore();
      store.broken = true;
      return store;
    }
  }

  function writeStore(store) {
    try {
      if (!root.localStorage) return false;
      if (!store || !Array.isArray(store.runs)) return false;
      const payload = { version: 1, runs: store.runs.slice(-MAX_RUNS) };
      root.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      return true;
    } catch (error) {
      return false;
    }
  }

  function dynFired(state) {
    const dyn = state && state.campaign && state.campaign.dyn;
    return (dyn && dyn.fired) || {};
  }

  function branchSnapshot(state) {
    const out = {};
    try {
      if (root.LZS && typeof root.LZS.getBranchHints === 'function') {
        root.LZS.getBranchHints(state).forEach(function (hint) {
          out[hint.node] = { seen: hint.seen, total: hint.total, state: hint.state };
        });
      }
    } catch (error) {
      /* 没有动态事件数据时保持空对象，档案里就不显示分支。 */
    }
    return out;
  }

  function routeOf(state) {
    return (state && Array.isArray(state.choices) ? state.choices : []).map(function (item) {
      return item.choiceId || item.id;
    }).filter(Boolean).slice(0, 26);
  }

  /* 一次战役结束时追加一条记录。ending 直接用引擎产出的结局对象。 */
  function recordCampaign(state, ending) {
    if (!state || !ending) return null;
    const store = readStore();
    const fired = dynFired(state);
    const events = Object.keys(fired).map(function (id) { return id; });
    const run = {
      id: (state.campaign && state.campaign.seed ? 'seed' + state.campaign.seed : 'run') + '-' + Date.now().toString(36),
      endedAt: new Date().toISOString(),
      endingId: ending.id || '',
      endingTitle: ending.title || '',
      days: state.day || 0,
      seed: (state.campaign && state.campaign.seed) || null,
      wrappedUp: !!(state.campaign && state.campaign.wrapup && state.campaign.wrapup.used),
      events: events,
      branches: branchSnapshot(state),
      route: routeOf(state),
      stats: state.stats ? JSON.parse(JSON.stringify(state.stats)) : {}
    };
    store.runs.push(run);
    const ok = writeStore(store);
    return ok ? run : null;
  }

  /* 跨周目的汇总：已历/未历路线、见过的条件事件、做过的推演、完成次数。 */
  function summary() {
    const store = readStore();
    const runs = store.runs || [];
    const seenEvents = {};
    const branchSeen = {};
    const endings = {};
    runs.forEach(function (run) {
      (run.events || []).forEach(function (id) { seenEvents[id] = (seenEvents[id] || 0) + 1; });
      Object.keys(run.branches || {}).forEach(function (node) {
        const info = run.branches[node];
        if (!info) return;
        if (!branchSeen[node]) branchSeen[node] = { seenMax: 0, total: 0 };
        branchSeen[node].seenMax = Math.max(branchSeen[node].seenMax, info.seen || 0);
        branchSeen[node].total = Math.max(branchSeen[node].total, info.total || 0);
      });
      if (run.endingId) endings[run.endingId] = (endings[run.endingId] || 0) + 1;
    });
    let replayDone = [];
    let replayRuns = 0;
    try {
      if (root.LZS_REPLAY) {
        const replayStore = root.LZS_REPLAY.readStore();
        replayRuns = (replayStore.runs || []).length;
        const moduleIds = {};
        (replayStore.runs || []).forEach(function (run) { if (run.moduleId) moduleIds[run.moduleId] = true; });
        replayDone = Object.keys(moduleIds);
      }
    } catch (error) {
      replayDone = [];
    }
    const branches = NODES.map(function (entry) {
      const info = branchSeen[entry.node] || { seenMax: 0, total: 0 };
      const state = info.seenMax === 0 ? 'unexplored' : (info.total > 0 && info.seenMax >= info.total ? 'explored' : 'partial');
      return {
        node: entry.node,
        label: entry.label,
        hint: entry.hint,
        seen: info.seenMax,
        total: info.total,
        state: state
      };
    });
    return {
      completed: runs.length,
      lastAt: runs.length ? runs[runs.length - 1].endedAt : null,
      runs: runs.slice(-10),
      eventsSeen: Object.keys(seenEvents).sort(),
      eventsSeenCount: Object.keys(seenEvents).length,
      endings: endings,
      branches: branches,
      unexplored: branches.filter(function (item) { return item.state === 'unexplored'; }).map(function (item) { return item.label; }),
      replayDone: replayDone,
      replayRuns: replayRuns,
      broken: !!store.broken
    };
  }

  function clear() {
    try {
      if (root.localStorage) root.localStorage.removeItem(STORAGE_KEY);
      return true;
    } catch (error) {
      return false;
    }
  }

  const api = {
    version: VERSION,
    storageKey: STORAGE_KEY,
    backupKey: BACKUP_KEY,
    nodes: NODES,
    readStore: readStore,
    writeStore: writeStore,
    recordCampaign: recordCampaign,
    summary: summary,
    clear: clear
  };

  root.LZS_ARCHIVE = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
}(typeof window !== 'undefined' ? window : globalThis));
