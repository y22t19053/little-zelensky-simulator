/*
 * 《小泽模拟器》v1.2.0 · 故事线系统
 * 把「互不相关的动态事件」改造成有阶段、有分支、有延迟因果的长事件链。
 *
 * 三层内容分工（对应 v1.2.0 规范第五节）：
 *   file  —— 决策文件：真正需要总统过手，消耗注意力（一局最多 3 份，属重大时刻）
 *   brief —— 局势动态：免费阅读，让世界持续运转、为后面的重大时刻铺垫
 *   echo  —— 因果回报：此前决定产生的可见结果，明确指向当时的判断
 *
 * 历史纪律：每个步骤带 history 属性
 *   fact 已确认历史事实 / supported 历史资料支持的合理决策 /
 *   simulated 基于真实条件的模拟推演 / assumption 为游戏机制设计的假设
 *
 * 依赖：js/dynamic.js（复用 conditionMet 的条件语义）、js/engine.js 提供 state。
 * 本文件不直接改 state 的数值：数值后果一律通过返回值交给引擎，由引擎走既有规则。
 */
(function (root, factory) {
  const api = factory(root);
  root.LZS_STORYLINES = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
}(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  const VERSION = '1.2.0';
  const PRIMARY_LINES = 4;      /* 每局主要故事线数量（规范：3—4 条） */
  const AUX_LINES = 2;          /* 每局辅助线数量：只有免费动态，没有决策文件 */
  const FILE_CAP = 3;           /* 一局最多 3 份故事线决策文件（重大时刻 2—4 个的上限） */
  const FEED_CAP_PER_WINDOW = 4;/* 每窗口最多 4 条免费内容，避免刷屏 */

  const KINDS = {
    file: '决策文件',
    brief: '局势动态',
    echo: '因果回报'
  };

  /* 内容属性（v1.2 规格第十一条的五类）：
   *   fact       已确认历史事实
   *   reported   当时公开报道或当事方说法（尚未独立确认）
   *   supported  历史资料支持的合理决策
   *   simulated  基于真实条件的模拟推演
   *   assumption 为游戏运行而设计的纯机制假设
   */
  const HISTORY_KINDS = {
    fact: '已确认历史事实',
    reported: '当时公开报道或当事方说法',
    supported: '历史资料支持的合理决策',
    simulated: '基于真实条件的模拟推演',
    assumption: '为游戏机制设计的假设'
  };

  /* 每条故事线的步骤：
   *   id      唯一 ID
   *   window  [起始窗口, 截止窗口]（窗口序号 = state.round，1—13）
   *   kind    file | brief | echo
   *   when    进入条件（与 dynamic.js 同一套键：choices/flags/noneFlags/minStat/maxStat/aidAtLeast…）
   *   variants  [{ when, title, body }]——按顺序取第一个命中的分支文案，没有则用默认 title/body
   *   options （kind=file 时）[{ id, label, ap, effects, coordination, agencyId, setFlags, delayed, branchLabel, branchNote, note }]
   *   history / historyNote / source
   */
  const STORYLINES = [
    /* ── 1. 首都防御与设施拒止 ───────────────────────────── */
    {
      id: 'line_airfield',
      title: '跑道与空域',
      theme: '首都防御与设施拒止',
      node: 'airfield',
      weight: 1.0,
      summary: '安东诺夫机场的跑道与设施怎么处理，决定了整个三月首都空域的压力形态。',
      steps: [
        {
          id: 'line_airfield_1', window: [2, 4], kind: 'brief', history: 'fact',
          title: '机场方向的补充评估送到桌上',
          body: '参谋部门把机场方向的损失和设施状态重新核了一遍：跑道面上有车辆和碎片，短期内不具备起降条件；周边建筑受损情况还在统计。评估没有给出结论，只把两种代价摆在纸面上——把设施彻底废掉，后续自己也用不成；留着不管，对方可能重新利用。',
          source: '总参谋部 · 设施评估',
          historyNote: '机场争夺与跑道无法使用的状态属于这一阶段公认的事实；具体设施清单为模拟。'
        },
        {
          id: 'line_airfield_2', window: [3, 6], kind: 'echo', history: 'simulated',
          when: { choices: ['c_deny_runway', 'c_interdict', 'c_late_deny'] },
          title: '工程器材开始向机场周边倾斜',
          body: '此前对跑道和通道的处置开始反过来占用工程力量：清障、封堵和临时修补都要人。后勤那边把这份需求单排在桥梁与城市设防之后，理由是「机场方向短期内不会再用于自己」。这个排序没有人反对，但它意味着别处的工程进度要往后压。',
          source: '后勤总局 · 工程力量分配',
          historyNote: '「拒止设施会占用自己后续的工程与修复能力」是机制推演，不是史料结论。'
        },
        {
          id: 'line_airfield_2b', window: [3, 6], kind: 'echo', history: 'simulated',
          when: { choices: ['c_keep_airfield'] },
          title: '机场设施被列进了必须保护的清单',
          body: '既然设施要留着将来用，它就从「已经放弃的东西」变成了「必须守住的东西」。防空、警戒和工兵保障都要往这里分一份。参谋部只问了一句：这份保障从哪个方向扣？没有人愿意先回答。',
          source: '总统办公室 · 值班记录',
          historyNote: '设施保留会带来持续防护需求，属于基于真实条件的推演。'
        },
        {
          id: 'line_airfield_3', window: [7, 10], kind: 'brief', history: 'simulated',
          variants: [
            {
              when: { choices: ['c_deny_runway', 'c_interdict', 'c_late_deny'] },
              title: '空域压力换了形态',
              body: '机场方向不再是可以争夺的跑道，而是持续需要封控的空间。防空单位报告说，对方把侦察和打击的重点移到了城市外围的基础设施；此前在跑道上做的处置没有让空袭停下来，只是让它换了目标。'
            },
            {
              when: { choices: ['c_keep_airfield'] },
              title: '设施还在，但它一直在消耗',
              body: '机场设施仍然在手里，代价是它每天都在占用警戒和防空资源。防空单位提出，如果继续这样分配，城市上空的拦截窗口会变窄；这个提醒被记了下来，没有形成决议。'
            }
          ],
          source: '空军与防空协调 · 周报',
          historyNote: '对方把打击重点转向基础设施属于公开报道范围内的事实趋势；具体分配为模拟。'
        },
        {
          id: 'line_airfield_4', window: [9, 13], kind: 'file', history: 'simulated',
          when: { choices: ['c_deny_runway', 'c_interdict', 'c_late_deny', 'c_keep_airfield', 'c_counter_airfield', 'c_airfield_reports'] },
          title: '机场周边的处置要不要继续投入',
          body: '机场周边的状态已经稳定下来，但稳定得并不便宜：工程、防空和警戒三头都在要人。现在有一个窗口，可以决定是否把这份投入固定下来——继续维持，或者收回到更紧要的方向去。',
          source: '总统办公室 · 待签文件',
          options: [
            {
              id: 'keep_pressure', label: '维持机场方向的封控与工程保障', ap: 1, agencyId: 'general_staff', coordination: -2,
              effects: { kyiv: 2, safety: 1, reserve: -1 },
              setFlags: ['line_airfield_fixed'],
              branchLabel: '维持封控',
              branchNote: '机场方向保持封控，后续窗口的防空与工程指令会继续带着这份负担。',
              note: '首都方向的压力略降，但预备队与工程力量被长期占用。'
            },
            {
              id: 'release_pressure', label: '把资源收回到更紧要的方向', ap: 0, agencyId: 'general_staff', coordination: 2,
              effects: { reserve: 2, kyiv: -2 },
              setFlags: ['line_airfield_released'],
              branchLabel: '收回资源',
              note: '工程与预备队回来了，机场方向的保障随之变薄。'
            }
          ],
          historyNote: '「长期维持封控还是收回资源」是这一阶段的真实取舍，具体数值为游戏设定。'
        },
        {
          id: 'line_airfield_5', window: [11, 13], kind: 'echo', history: 'simulated',
          when: { flags: ['line_airfield_fixed'] },
          title: '机场方向的投入一直没有撤',
          body: '此前定下的封控与保障还在执行，机场周边没有再出现需要总统亲自处置的紧急情况——代价是，这段时间里别的方向提出的工程请求，有两项被排到了后面。',
          source: '总参谋部 · 执行反馈',
          historyNote: '机制推演：维持投入会挤占其他方向。'
        },
        {
          id: 'line_airfield_5b', window: [11, 13], kind: 'echo', history: 'simulated',
          when: { flags: ['line_airfield_released'] },
          title: '收回来的力量被别处立刻用掉了',
          body: '从机场方向收回的工程与预备力量，第二天就有了新的去处。机场周边没有再出问题，但防空单位提醒：那边的保障变薄之后，一旦对方回头，反应时间会更短。',
          source: '总参谋部 · 执行反馈',
          historyNote: '机制推演：资源收回会被其他方向吸收。'
        }
      ]
    },

    /* ── 2. 政府连续性与地方治理 ─────────────────────────── */
    {
      id: 'line_gov',
      title: '命令从哪一层发出',
      theme: '政府连续性与地方治理',
      node: 'capital',
      weight: 0.9,
      summary: '中央、部门与地方之间的权限怎么分，决定了命令能不能落到需要它的人手里。',
      steps: [
        {
          id: 'line_gov_1', window: [3, 5], kind: 'brief', history: 'supported',
          title: '州一级开始自己决定一部分事',
          body: '几个州在没有等到中央批复的情况下，自行安排了本地的路障、物资征用和人员登记。这些安排多数合理，但口径不一致：同样的征用，在相邻两个州是两套手续。地方打电话来问的，不是「能不能做」，而是「以后算谁的」。',
          source: '总统办公室 · 地方来电摘要',
          historyNote: '战争初期地方行政自行应对属于公开报道范围内的情况；具体来电为模拟。'
        },
        {
          id: 'line_gov_2', window: [4, 8], kind: 'echo', history: 'simulated',
          when: { choices: ['c_decentralize'] },
          title: '地方按自己的办法运转起来了',
          body: '此前授权地方自行处置之后，行政系统没有瘫痪，反而在几个州比中央的反应更快。代价是口径分裂：同一件事在不同州有三种做法，中央要花时间把它们对齐，而不是下命令。',
          source: '政府办公厅 · 运转情况',
          historyNote: '机制推演：放权提高反应速度、降低一致性。'
        },
        {
          id: 'line_gov_2b', window: [4, 8], kind: 'echo', history: 'simulated',
          when: { choices: ['c_split_succession', 'c_relocate', 'c_stay_capital'], noneChoices: ['c_decentralize'] },
          title: '权力仍然集中在首都这一层',
          body: '命令链条保持单一，好处是口径统一，坏处是每一个地方问题都要先在首都排队。这一周有四个州的请求因为「等中央统一口径」而停在桌上，其中两个后来自己解决了。',
          source: '政府办公厅 · 运转情况',
          historyNote: '机制推演：集中决策的排队成本。'
        },
        {
          id: 'line_gov_3', window: [6, 10], kind: 'file', history: 'supported',
          title: '地方请求把处置权明确下来',
          body: '几个州的负责人联名提出，希望在本地事务上有一份明确的处置权边界：什么可以自己决定，什么必须报批，报批多久必须回复。这不是要权，是要一个可预期的口径——现在他们按猜测办事。',
          source: '地方行政 · 联合请求',
          options: [
            {
              id: 'grant_scope', label: '给出明确的处置权边界与回复时限', ap: 1, agencyId: 'office', coordination: 3,
              effects: { gov: 2, will: 2, safety: -1 },
              setFlags: ['line_gov_scoped'],
              branchLabel: '明确授权边界',
              branchNote: '地方获得可预期的处置权，中央的审批负担下降，一致性风险上升。',
              note: '行政效率上升；后续地方自主处理的事件会更多。'
            },
            {
              id: 'keep_central', label: '维持现状，重要事项继续报批', ap: 0, agencyId: 'office', coordination: -1,
              effects: { gov: -1, safety: 2 },
              setFlags: ['line_gov_central'],
              branchLabel: '维持集中审批',
              note: '口径统一；地方继续等待，基层反应变慢。'
            }
          ],
          historyNote: '战争期间中央与地方权限的张力有公开记录；本文件为概括性模拟，不是某份真实文件。'
        },
        {
          id: 'line_gov_4', window: [9, 13], kind: 'echo', history: 'simulated',
          when: { flags: ['line_gov_scoped'] },
          title: '边界明确之后，报批量掉了一半',
          body: '处置权边界公布之后，需要首都批复的事项明显减少，地方的处理速度提上来了。同时出现了新的问题：有两个州在自己的权限内做了中央不打算做的决定，中央只能在事后纠正。',
          source: '政府办公厅 · 执行反馈',
          historyNote: '机制推演：这一段描述的是制度、资源与协调层面的合理后果，具体幅度与时间没有公开资料支持。'
        },
        {
          id: 'line_gov_5', window: [10, 13], kind: 'echo', history: 'simulated',
          when: { choices: ['c_decentralize'], minInterventions: 4 },
          title: '总统亲自过手的次数在上升',
          body: '这一段时间里，需要总统本人拍板的事项没有减少。机构在运转，但一旦涉及跨部门，还是要有人把两个部门按在同一张桌子前。值班室开始把这类事项单独列出来，因为它们消耗的是同一个人的时间。',
          source: '总统办公室 · 值班统计',
          historyNote: '机制推演：跨部门事项对总统注意力的需求。（此条与是否放权并行观察，用于说明「亲自介入」的成本。）'
        }
      ]
    },

    /* ── 3. 社会动员与组织能力 ───────────────────────────── */
    {
      id: 'line_mobilize',
      title: '登记、征用与管不过来',
      theme: '社会动员与组织能力',
      node: 'mobilize',
      weight: 0.8,
      summary: '社会动员的速度快过管理能力时，问题不在缺少愿意做事的人，而在缺少能把事接住的手续。',
      steps: [
        {
          id: 'line_mobilize_1', window: [2, 5], kind: 'brief', history: 'fact',
          title: '自愿前来的人比登记表多',
          body: '各个登记点报上来的情况差不多：来的人不少，能接收的人手不足。多数人是自发前来，没有统一编组，也没有明确任务；有人等了半天，最后自己找地方帮忙去了。地方组织承接了很大一部分，但它们之间没有统一口径。',
          source: '地方志愿组织 · 情况汇总',
          historyNote: '战争初期大量民众自发参与防卫与支援属于公开报道的事实；具体登记情况为模拟。'
        },
        {
          id: 'line_mobilize_2', window: [4, 7], kind: 'echo', history: 'simulated',
          when: { choices: ['c_arm_volunteers'] },
          title: '发放武器的决定开始反过来要求管理',
          body: '此前对自愿者的处置打开了口子，现在需要回答的是登记、佩戴标识、弹药清点和事后回收。这些事没有人反对，但都需要人手和记录。内务部门提出：如果没有统一登记，出了问题连追查都做不到。',
          source: '内务部 · 管理请求',
          historyNote: '机制推演：武装动员必然带来登记与管控成本。'
        },
        {
          id: 'line_mobilize_2b', window: [4, 7], kind: 'echo', history: 'simulated',
          when: { choices: ['c_curfew', 'c_martial'], minStat: { will: 60 } },
          title: '秩序维持住了，但志愿者的热情在消耗',
          body: '管控措施让城市秩序没有失控，也让一部分自发前来的人觉得「帮不上忙」。地方组织反馈说，最近几天主动来报到的人比上周少了，有人来了一趟就回去了。',
          source: '地方志愿组织 · 情况汇总',
          historyNote: '机制推演：管控与自发动员之间存在张力。'
        },
        {
          id: 'line_mobilize_3', window: [6, 10], kind: 'file', history: 'supported',
          title: '要把志愿力量纳入统一记录吗',
          body: '现在的状态是：需要人的地方缺人，来了人的地方缺手续。有一个办法是把登记、任务分配和物资发放并成一套记录，让地方组织按同一张表办事；代价是要抽调行政人手去维护它，而且短期内会拖慢反应速度。',
          source: '总统办公室 · 待签文件',
          options: [
            {
              id: 'register_all', label: '统一登记与任务分配，宁可慢一点', ap: 1, agencyId: 'interior', coordination: 3,
              effects: { gov: 2, safety: 2, will: -1 },
              setFlags: ['line_mobilize_registered'],
              branchLabel: '统一登记',
              branchNote: '动员变得可管理、可追溯，但短期内的响应速度下降。',
              note: '秩序与可追溯性上升；自发参与的热情略降。'
            },
            {
              id: 'keep_loose', label: '不设统一手续，让地方自己接住', ap: 0, agencyId: 'interior', coordination: -2,
              effects: { will: 2, safety: -2, gov: -1 },
              setFlags: ['line_mobilize_loose'],
              branchLabel: '维持松散组织',
              note: '反应更快、热情更高；代价是无法追溯，后续容易出清点与责任问题。'
            }
          ],
          historyNote: '战时对志愿力量的登记与管理是真实存在的行政难题；本文件为概括模拟。'
        },
        {
          id: 'line_mobilize_4', window: [8, 12], kind: 'echo', history: 'simulated',
          when: { flags: ['line_mobilize_loose'] },
          title: '物资清点出了对不上的账',
          body: '没有统一手续的后果开始显形：一批物资在三个地方同时被记成「已发放」，实际只到了一处。没有人被指认为责任人，因为当初就没有记录能指认。地方要求补一套事后登记，但这需要时间。',
          source: '后勤总局 · 清点差异',
          historyNote: '机制推演：松散组织的可追溯性代价。'
        },
        {
          id: 'line_mobilize_5', window: [9, 13], kind: 'echo', history: 'simulated',
          when: { flags: ['line_mobilize_registered'] },
          title: '登记表让一次重复申领被拦下来了',
          body: '统一登记第一次发挥了作用：同一批物资被两个地区同时申领时，记录直接对上了号，问题在发放前被发现。代价是这一周的分配比原计划晚了两天。',
          source: '后勤总局 · 执行反馈',
          historyNote: '机制推演：可追溯带来效率损失与风险下降。'
        }
      ]
    },

    /* ── 4. 情报迷雾与信息战 ─────────────────────────────── */
    {
      id: 'line_intel',
      title: '两份互相矛盾的报告',
      theme: '情报迷雾与信息战',
      node: 'signal',
      weight: 1.0,
      summary: '同一件事有两份说法时，总统要决定的是相信谁、花多少代价去核实。',
      steps: [
        {
          id: 'line_intel_1', window: [3, 6], kind: 'brief', history: 'fact',
          title: '同一方向的报告对不上',
          body: '两份来源不同、时间不同的报告摆在桌上：一份说对方在调整部署，另一份说只是轮换。两份都有可核对的部分，也都有无法核实的部分。没有人能当场判断哪一份更接近事实，只能说明各自的来源与时间差。',
          source: '情报汇总 · 来源对照',
          historyNote: '战争中情报互相矛盾属于常态，公开报道中多有描述；具体报告为模拟。'
        },
        {
          id: 'line_intel_2', window: [5, 9], kind: 'echo', history: 'simulated',
          when: { choices: ['c_counterintel', 'c_info_rules', 'c_rumor_rules'] },
          title: '信息公开的口径统一之后，谣言少了一层',
          body: '此前定下的信息发布规则开始起作用：同一件事不再出现几个部门几种说法。公开渠道的混乱减少了，但内部报告的差异并没有因此消失——对外统一，不等于对内清楚。',
          source: '新闻与信息部门 · 反馈',
          historyNote: '机制推演：这一段描述的是制度、资源与协调层面的合理后果，具体幅度与时间没有公开资料支持。'
        },
        {
          id: 'line_intel_3', window: [7, 11], kind: 'file', history: 'simulated',
          title: '要不要花代价去核实这一条',
          body: '有一条消息反复出现在不同来源里，但没有任何一方能提供可核对的细节。核实它需要派人、花时间，而且可能什么都查不到；不核实，后面的判断就只能建立在这条消息之上。',
          source: '情报汇总 · 待签文件',
          options: [
            {
              id: 'verify_hard', label: '派人实地核实，接受可能白跑一趟', ap: 1, agencyId: 'general_staff', coordination: 2,
              effects: { intl: 1, safety: 1, reserve: -1 },
              setFlags: ['line_intel_verified'],
              branchLabel: '坚持核实',
              branchNote: '后续窗口会拿到更可靠的判断，代价是这段时间的反应变慢。',
              note: '换来更可靠的信息基础；短期消耗人力与时间。'
            },
            {
              id: 'act_on_it', label: '按现有说法先动，边动边核', ap: 0, agencyId: 'general_staff', coordination: -2,
              effects: { army: 1, safety: -2 },
              setFlags: ['line_intel_acted'],
              branchLabel: '先动后核',
              note: '反应更快；如果消息是错的，代价会在两三个窗口后出现。'
            }
          ],
          historyNote: '「核实成本 vs 反应速度」是这一阶段的真实取舍；具体事件为模型推演。'
        },
        {
          id: 'line_intel_4', window: [9, 13], kind: 'echo', history: 'simulated',
          when: { flags: ['line_intel_verified'] },
          title: '核实结果回来得比预期晚，但改了一个判断',
          body: '派出去的人回来时，原定的处置窗口已经过去了一半。但他们带回的细节推翻了原先的结论：对方并不是要在这个方向加压，而是在把力量挪走。这个判断修正了后续部署，也解释了此前几份报告为什么对不上。',
          source: '情报汇总 · 核实反馈',
          historyNote: '机制推演：核实的价值是修正判断，代价是时间。'
        },
        {
          id: 'line_intel_5', window: [9, 13], kind: 'echo', history: 'simulated',
          when: { flags: ['line_intel_acted'] },
          title: '按未核实的说法动的后果出现了',
          body: '按现有说法做出的处置已经执行完，但支撑它的那条消息始终没有得到确认。相反，新的报告显示对方在那个方向的力量比预想的更完整。已经动用的资源不会退回来，只能在下一次判断里把这份代价算进去。',
          source: '情报汇总 · 事后对照',
          historyNote: '机制推演：在未核实信息上行动的风险。'
        },
        {
          id: 'line_intel_6', window: [11, 13], kind: 'brief', history: 'reported',
          title: '公开渠道与内部判断的落差被摆到了明面上',
          body: '同一件事，公开报道的说法和内部报告的判断出现了明显落差。这不一定是哪一方错了：公开渠道有它自己的节奏和限制，内部报告也有它来不及核实的地方。问题在于，对外说的话和心里相信的事如果不一致，迟早要在某个场合被追问。',
          source: '新闻与信息部门 · 内部提醒',
          historyNote: '「公开叙事与内部评估存在落差」在战争中被广泛记录；此处不指认具体报道。'
        }
      ]
    },

    /* ── 5. 国际援助与外交博弈 ───────────────────────────── */
    {
      id: 'line_aid',
      title: '承诺、运输与到货',
      theme: '国际援助与外交博弈',
      node: 'aid',
      weight: 1.1,
      summary: '援助不是一次点击，而是请求、条件、运输、到货、分配五段路，每一段都可能慢下来。',
      steps: [
        {
          id: 'line_aid_1', window: [2, 4], kind: 'echo', history: 'fact',
          when: { choices: ['c_first_appeal', 'c_wishlist', 'c_air_defense_aid', 'c_talks_channel'] },
          title: '请求发出去了，回音还没到',
          body: '对外的请求已经递到几个伙伴手上。回复不是拒绝，也不是答应——多数是「正在评估」「需要内部协调」。这一阶段能确认的只有一件事：从提出请求到物资真正落地，中间隔着很长一段不由自己决定的路。',
          source: '外交部 · 沟通记录',
          historyNote: '2022 年 2—3 月援助请求与承诺之间存在明显时间差，属公开报道范围的事实。'
        },
        {
          id: 'line_aid_2', window: [4, 7], kind: 'brief', history: 'reported',
          title: '承诺开始附带条件',
          body: '几个伙伴给出了更具体的答复，但都带着条件：有的要求说明用途与最终去向，有的要求由指定机构接收，有的把交付和此前的某些承诺绑在一起。这些条件在程序上都能理解，在时间上都是成本。',
          source: '外交部 · 答复摘要',
          historyNote: '援助附带条件与问责要求属于公开记录中的常态；具体国家与条件为概括模拟。'
        },
        {
          id: 'line_aid_3', window: [6, 10], kind: 'file', history: 'simulated',
          title: '接受条件，还是继续争取更快的通道',
          body: '有一批物资已经进入待运状态，但需要在一份文件上确认接收方式与后续核查安排。签了，东西能动；不签，还在谈的东西可能更快，也可能什么都谈不成。外交部提醒：这不是一次性的选择，后面每一批都会照这个先例办。',
          source: '外交部 · 待签文件',
          options: [
            {
              id: 'accept_terms', label: '接受核查安排，先让物资动起来', ap: 1, agencyId: 'foreign', coordination: 3,
              effects: { intl: 3, army: 1, gov: -1 },
              setFlags: ['line_aid_terms'],
              branchLabel: '接受条件',
              branchNote: '援助进入可预期的通道，行政上多一层核查负担。',
              note: '对外关系与物资流入改善；后续每批都要走同样的核查。'
            },
            {
              id: 'hold_for_better', label: '不急着签，继续谈更宽的条件', ap: 0, agencyId: 'foreign', coordination: -2,
              effects: { intl: 1, army: -1, will: 1 },
              setFlags: ['line_aid_bargain'],
              branchLabel: '继续谈判',
              note: '争取到更好的条件空间，但这一批物资继续压在待运状态。'
            }
          ],
          historyNote: '援助条件与核查安排是真实存在的谈判内容；本文件为概括模拟，不指认具体国家。'
        },
        {
          id: 'line_aid_4', window: [8, 12], kind: 'echo', history: 'simulated',
          when: { flags: ['line_aid_terms'] },
          title: '第一批到了，卸货比承诺慢',
          body: '文件签完之后，第一批物资终于落地，但时间和最初承诺的对不上：运输环节又拖了几天。到货之后还有分配问题——几个方向同时要，按什么顺序发没有现成答案。',
          source: '后勤总局 · 到货记录',
          historyNote: '机制推演：承诺、运输、到货、分配之间的多段延迟。'
        },
        {
          id: 'line_aid_5', window: [8, 12], kind: 'echo', history: 'simulated',
          when: { flags: ['line_aid_bargain'] },
          title: '谈判拖住了那一批，也拖住了后面几批',
          body: '更宽的条件没有谈成，原本待运的那一批回到了排队状态，后面几批也跟着慢了下来。伙伴那边没有关闭通道，但明显在等一个明确的答复。这一段时间里，别处需要用东西的地方只能先用库存顶着。',
          source: '外交部 · 沟通记录',
          historyNote: '机制推演：谈判拖延的连锁成本。'
        },
        {
          id: 'line_aid_6', window: [10, 13], kind: 'brief', history: 'simulated',
          title: '东西到了以后，问题换了一个',
          body: '此前最缺的东西陆续有了着落，新的问题变成能力：接收、储存、分配和投入使用各自需要人手和流程。有些物资在仓库里等了两周才发下去，不是因为没人要，而是因为没有一套能快速决定「先给谁」的机制。',
          source: '后勤总局 · 分配反馈',
          historyNote: '机制推演：援助到货后转向分配与吸收能力问题。'
        },
        {
          id: 'line_aid_7', window: [12, 13], kind: 'echo', history: 'simulated',
          when: { minStat: { intl: 55 } },
          title: '几个伙伴开始问长期的事',
          body: '随着承诺逐步兑现，几个伙伴的问题从「现在要什么」变成了「接下来怎么维持」。这类问题在这一阶段还没有答案，但它意味着援助的性质正在从应急转向别的什么东西。',
          source: '外交部 · 沟通记录',
          historyNote: '机制推演：援助关系从应急转向中长期。'
        }
      ]
    },

    /* ── 6. 预备队与国家资源 ─────────────────────────────── */
    {
      id: 'line_reserve',
      title: '把最后的预备队放在哪里',
      theme: '预备队与国家资源',
      node: 'reserve',
      weight: 0.9,
      summary: '预备队只有一个去处。放在一个方向，另一个方向就要自己撑住。',
      steps: [
        {
          id: 'line_reserve_1', window: [5, 8], kind: 'brief', history: 'supported',
          title: '两个方向同时要预备队',
          body: '西北和东侧的报告几乎同时递上来，都说明自己这一侧更危险。参谋部把两份报告并排放着，指出它们各自都成立，区别只在于判断对方主攻方向。这个判断做错了，另一侧要自己撑过一段时间。',
          source: '总参谋部 · 方向评估',
          historyNote: '基辅防御期间多方向同时承压、预备队分配是真实存在的战略难题；具体报告为模拟。'
        },
        {
          id: 'line_reserve_2', window: [7, 10], kind: 'echo', history: 'simulated',
          when: { choices: ['c_reserve_moshchun'] },
          title: '莫什春方向的消耗比计划快',
          body: '预备队投在西北之后，那一侧的推进被拖住了，但消耗速度超过计划。轮换请求已经提了两次，两次都被压了下来，因为换下来就没有人顶上去。',
          source: '总参谋部 · 战况反馈',
          historyNote: '机制推演：单方向持续投入带来轮换压力。'
        },
        {
          id: 'line_reserve_2b', window: [7, 10], kind: 'echo', history: 'simulated',
          when: { choices: ['c_reserve_brovary', 'c_brovary_ambush'] },
          title: '东侧稳住了，西北的压力没减',
          body: '东侧因为提前有了准备，局面比预想的稳。但西北方向没有拿到预备队，只能靠现有力量苦撑，报告里的语气一天比一天紧。这不是判断失误的证据，只是选择的另一面。',
          source: '总参谋部 · 战况反馈',
          historyNote: '机制推演：资源集中必然带来的另一侧风险。'
        },
        {
          id: 'line_reserve_2c', window: [7, 10], kind: 'echo', history: 'simulated',
          when: { choices: ['c_reserve_split'] },
          title: '分开用之后，两边都不够',
          body: '预备队按两个方向分开使用，结果是两边都没有形成决定性的一击，也都没有崩溃。参谋部把这个状态称为「都可以撑，但都撑不久」。',
          source: '总参谋部 · 战况反馈',
          historyNote: '机制推演：分散投入的中间状态。'
        },
        {
          id: 'line_reserve_3', window: [9, 12], kind: 'file', history: 'simulated',
          title: '要不要把最后一点储备压上去',
          body: '手里还剩一点可以动的东西：一部分训练未完成的补充人员，和一批原定留作后用的物资。压上去，眼前这一段的压力能缓解；留下来，后面还有一段路要走。没有人能保证后面一定用得上。',
          source: '总统办公室 · 待签文件',
          options: [
            {
              id: 'commit_last', label: '把最后一点储备压上去', ap: 1, agencyId: 'general_staff', coordination: -1,
              effects: { kyiv: 4, army: 2, reserve: -4 },
              setFlags: ['line_reserve_committed'],
              branchLabel: '压上最后储备',
              branchNote: '眼前稳住了，后续窗口的资源缺口会明显。',
              note: '首都与军队余量上升；后续窗口的补充能力下降。'
            },
            {
              id: 'hold_last', label: '留下这一点，用来应付后面的事', ap: 0, agencyId: 'general_staff', coordination: 1,
              effects: { reserve: 3, kyiv: -3 },
              setFlags: ['line_reserve_held'],
              branchLabel: '保留储备',
              note: '保住后续的应变余地；眼前这一段要硬撑。'
            }
          ],
          historyNote: '「动用最后储备还是保留应变能力」是这类战役中的真实取舍；数值为游戏设定。'
        },
        {
          id: 'line_reserve_4', window: [11, 13], kind: 'echo', history: 'simulated',
          when: { flags: ['line_reserve_committed'] },
          title: '压上去之后，账面上空了',
          body: '最后一点储备压上去之后，那个方向的压力确实缓解了一段。现在的问题是账面：任何新的方向需要力量，都只能从已经投入的地方抽。后勤那边把这种情况叫作「没有下一手」。',
          source: '后勤总局 · 资源台账',
          historyNote: '机制推演：这一段描述的是制度、资源与协调层面的合理后果，具体幅度与时间没有公开资料支持。'
        },
        {
          id: 'line_reserve_5', window: [11, 13], kind: 'echo', history: 'simulated',
          when: { flags: ['line_reserve_held'] },
          title: '留下来的那一点，后来真的用上了',
          body: '保留下来的储备在后一个窗口被用在了没预料到的地方——不是主攻方向，而是一处临时出现的缺口。如果当时全部压上去，这个缺口只能放弃。',
          source: '总参谋部 · 执行反馈',
          historyNote: '机制推演：保留应变能力的价值。'
        }
      ]
    },

    /* ── 7. 民生与撤离 ───────────────────────────────────── */
    {
      id: 'line_civil',
      title: '往外走的人，和留下来的人',
      theme: '民生与撤离',
      node: 'civilian',
      weight: 0.8,
      summary: '撤离不是把人送走就结束：路上、站里、落脚的地方都要有人接。',
      steps: [
        {
          id: 'line_civil_1', window: [3, 6], kind: 'brief', history: 'fact',
          title: '向西的通道在排队',
          body: '向西的道路和车站持续拥堵，出发的人多，运力有限。医疗物资和取暖用品在沿途几个点最缺。地方组织在自发接应，但它们之间的分工并不清楚，有些点排了很长的队，有些点空着。',
          source: '地方行政 · 撤离情况',
          historyNote: '2022 年 2—3 月乌克兰境内大规模人员流动与交通拥堵属公开报道的事实。'
        },
        {
          id: 'line_civil_2', window: [5, 9], kind: 'echo', history: 'simulated',
          when: { choices: ['c_evacuate'] },
          title: '撤离安排开始挤占交通与运力',
          body: '此前推进的撤离安排占住了相当一部分车辆与道路容量，军事运输的排期因此往后挪。没有人主张撤回安排——把人留在城里是另一种代价——但两边的账现在记在一起了。',
          source: '后勤总局 · 运力分配',
          historyNote: '机制推演：撤离与军事运输争夺同一批运力。'
        },
        {
          id: 'line_civil_3', window: [7, 11], kind: 'file', history: 'supported',
          title: '沿途接应点要不要由中央统一接手',
          body: '沿途的接应点目前由不同组织各自维持，能力差别很大。有意见提出由中央统一协调物资与人员，避免重复和遗漏；反对的意见是，统一之后地方那些跑得很快的组织会被拖慢。',
          source: '总统办公室 · 待签文件',
          options: [
            {
              id: 'centralize_relief', label: '统一协调接应点的物资与人员', ap: 1, agencyId: 'office', coordination: 2,
              effects: { gov: 2, will: 2, reserve: -1 },
              setFlags: ['line_civil_central'],
              branchLabel: '中央统一协调',
              branchNote: '资源覆盖更均匀，地方组织的机动性下降。',
              note: '民生保障更均衡；消耗一部分行政与物资余量。'
            },
            {
              id: 'keep_local', label: '让地方组织继续自己接', ap: 0, agencyId: 'office', coordination: -1,
              effects: { will: 1, safety: -1 },
              setFlags: ['line_civil_local'],
              branchLabel: '维持地方自办',
              note: '保住地方的速度；覆盖不均与遗漏的风险留着。'
            }
          ],
          historyNote: '战时救援与撤离的组织方式（中央协调 vs 地方/民间自办）在公开记录中都有实例；本文件为概括模拟。'
        },
        {
          id: 'line_civil_4', window: [9, 13], kind: 'echo', history: 'simulated',
          when: { flags: ['line_civil_central'] },
          title: '排队的点少了，慢的地方多了',
          body: '统一协调之后，几个明显拥堵的接应点分流开了，物资没有再出现一边缺一边积压的情况。代价是原来反应最快的两个组织现在要等调配指令，它们的人私下抱怨「还不如自己干」。',
          source: '地方行政 · 执行反馈',
          historyNote: '机制推演：这一段描述的是制度、资源与协调层面的合理后果，具体幅度与时间没有公开资料支持。'
        },
        {
          id: 'line_civil_5', window: [11, 13], kind: 'brief', history: 'simulated',
          title: '有人开始问什么时候能回去',
          body: '随着首都周边局势变化，已经有离开的人询问回返的可能。这个问题目前没有可靠答案：道路、桥涵和可能存在的爆炸物都还没有清过，回去的人要面对的不是「安全了」三个字能覆盖的事。',
          source: '地方行政 · 民众询问',
          historyNote: '机制推演：回返意愿先于安全条件出现。'
        }
      ]
    },

    /* ── 8. 撤退判断与战役收束 ───────────────────────────── */
    {
      id: 'line_withdraw',
      title: '撤了之后并不算完',
      theme: '撤退判断与战役收束',
      node: 'return',
      weight: 1.0,
      summary: '撤出的迹象出现时，最难的判断是「这是真的走了，还是在换一种打法」。',
      steps: [
        {
          id: 'line_withdraw_1', window: [9, 12], kind: 'brief', history: 'reported',
          title: '撤出的迹象出现了，但没有定论',
          body: '多个方向同时报告对方的活动强度下降，有部队离开的迹象。也有相反的信息：部分方向的炮击没有减少，甚至有新的调动。两份判断都成立——可能是真的在撤，也可能是在重新编组。',
          source: '情报汇总 · 综合判断',
          historyNote: '2022 年 3 月下旬基辅方向俄军调整部署属公开报道事实；「是撤还是重组」当时并无定论，此处保留不确定性。'
        },
        {
          id: 'line_withdraw_2', window: [10, 13], kind: 'echo', history: 'simulated',
          when: { choices: ['c_verify_signal', 'c_cautious_message'] },
          title: '核实过的那一份判断更稳',
          body: '此前坚持核实的做法让这次判断比前几次更有底：不是所有方向都在撤，但主攻方向确实在减弱。这份判断没有让人兴奋，它只是让后面的安排有了一个可以站住的前提。',
          source: '情报汇总 · 核实反馈',
          historyNote: '机制推演：这一段描述的是制度、资源与协调层面的合理后果，具体幅度与时间没有公开资料支持。'
        },
        {
          id: 'line_withdraw_3', window: [11, 13], kind: 'echo', history: 'simulated',
          when: { choices: ['c_trust_redeploy'] },
          title: '按「已经撤了」行动的那一步，回头看是有代价的',
          body: '此前把撤出信号当作确定事实来处理，让一部分力量提前转向了别的方向。这个选择在当时并不离谱，但如果对方只是重新编组，这段时间的调整就等于白做一次。现在回头看，代价已经记在账上了。',
          source: '总参谋部 · 事后对照',
          historyNote: '机制推演：过早确认撤退信号的代价。'
        },
        {
          id: 'line_withdraw_4', window: [12, 13], kind: 'file', history: 'supported',
          title: '往回收的时候，先做哪一件',
          body: '首都周边的压力在下降，但「压力下降」不等于「可以回去」。道路、桥涵、可能存在的爆炸物、失联人员、还有基本生活保障，这些都等着人。手里的人只够同时推进一件事。',
          source: '总统办公室 · 待签文件',
          options: [
            {
              id: 'clear_first', label: '先清障排爆，再谈回返', ap: 1, agencyId: 'interior', coordination: 2,
              effects: { safety: 3, will: -1, reserve: -1 },
              setFlags: ['line_return_clear'],
              branchLabel: '先排雷清障',
              branchNote: '回返时间推后，但安全基础更实。',
              note: '安全条件改善；民众回返的等待时间延长。'
            },
            {
              id: 'return_first', label: '先让生活秩序回来，边回边清', ap: 0, agencyId: 'office', coordination: -2,
              effects: { will: 3, safety: -3 },
              setFlags: ['line_return_fast'],
              branchLabel: '先恢复生活秩序',
              note: '民众信心上升；未清理路段与爆炸物带来的风险留着。'
            }
          ],
          historyNote: '俄军撤出基辅周边后留下大量未爆物、道路与民用设施受损，属公开报道事实；处置顺序的取舍为模拟。'
        },
        {
          id: 'line_withdraw_5', window: [13, 13], kind: 'echo', history: 'simulated',
          when: { flags: ['line_return_clear'] },
          title: '清障队的进度比计划慢，但没出事',
          body: '清障和排爆按顺序推进，速度比计划的慢，覆盖范围也不完整。至少到目前为止，被划为可回返的区域没有再出现新的爆炸伤人报告。这个结果算不上好消息，只是比另一种可能好。',
          source: '内务部 · 清障进度',
          historyNote: '机制推演：这一段描述的是制度、资源与协调层面的合理后果，具体幅度与时间没有公开资料支持。'
        },
        {
          id: 'line_withdraw_6', window: [13, 13], kind: 'echo', history: 'simulated',
          when: { flags: ['line_return_fast'] },
          title: '回返的人先到了没有清过的地方',
          body: '生活秩序先回来的做法让城里重新有了人，也让人走到了还没有清过的路段。报告里已经出现几起与遗留爆炸物有关的事故，数字不大，但每一次都可以追问一句：如果先清再说，会不会不一样。',
          source: '内务部 · 事故记录',
          historyNote: '机制推演：未清理区域的回返风险。此处不指认具体伤亡数字。'
        }
      ]
    }
  ];

  /* ── 兜底回声：某项始终没有形成决定时，故事线不会凭空消失 ─────────────
     每条线补一条「按部门现有做法继续」的回声，条件和两个分支旗标都不成立时才触发。
     这样即使玩家一直搁置，后续窗口仍会看到这件事的走向，而不是这条线无声消失。 */
  const DEFERRED_ECHOES = {
    line_airfield: {
      window: [10, 13], flags: ['line_airfield_fixed', 'line_airfield_released'],
      title: '机场方向一直没有等到明确说法',
      body: '工程和防空仍在按各自的理解维持机场周边。没有人拍板要不要长期投入，于是这份负担被留在了默认安排里：不算决定，但每天都在花东西。',
      source: '总参谋部 · 例行呈报'
    },
    line_gov: {
      window: [8, 13], flags: ['line_gov_scope', 'line_gov_central'],
      title: '处置权的边界还是没写下来',
      body: '地方继续按自己的理解办事，请示和汇报混在一起往上走。没有明确的边界，也没有明确的追责，事情照样在推进，只是每一件都要多绕一层。',
      source: '总统办公室 · 公文流转'
    },
    line_mobilize: {
      window: [8, 13], flags: ['line_mobilize_registered', 'line_mobilize_loose'],
      title: '登记的事一直没有定下来',
      body: '志愿力量仍然以临时方式被使用。有人重复领取了物资，也有人因为没有记录而拿不到东西。没有人为此拍板，账目就这样继续糊着。',
      source: '地方行政 · 物资清点'
    },
    line_intel: {
      window: [8, 13], flags: ['line_intel_hard', 'line_intel_acted'],
      title: '两份报告都躺在抽屉里',
      body: '互相矛盾的两份判断都没有被进一步核实，于是两种准备各做了一半。真到需要决定的时候，能用的证据仍然只有当初那一份。',
      source: '情报汇总 · 待办事项'
    },
    line_aid: {
      window: [9, 13], flags: ['line_aid_terms', 'line_aid_broad'],
      title: '求援的电文一直没有回音',
      body: '先前递出的请求没有得到明确答复，也没有被正式撤回。为了等一个可能到来的答复，有些安排被一直往后拖。',
      source: '外交部 · 往来记录'
    },
    line_reserve: {
      window: [9, 13], flags: ['line_reserve_committed', 'line_reserve_held'],
      title: '预备力量还搁在原地',
      body: '能动用的力量一直被留在手里，没有投入任何方向。它的存在本身就成了一种依赖：明明有兵，却始终在等一个更好的时机。',
      source: '总参谋部 · 力量状态'
    },
    line_civil: {
      window: [9, 13], flags: ['line_civil_central', 'line_civil_local'],
      title: '撤离和保障仍在两套办法之间',
      body: '医院、交通和供水各自按最急的部分应付。没有统一的优先级，于是谁先喊得响，谁就先拿到车和油料。',
      source: '地方行政 · 协调会记录'
    },
    line_withdraw: {
      window: [11, 13], flags: ['line_withdraw_cleared', 'line_withdraw_fast'],
      title: '撤退的迹象始终没有被核实',
      body: '关于对面动向的判断一直在两种说法之间摆。没有新的核实结论，也没有据此调整部署，局面就停在这个模糊的状态里。',
      source: '情报汇总 · 每日判断'
    }
  };

  STORYLINES.forEach(function (line) {
    const extra = DEFERRED_ECHOES[line.id];
    if (!extra) return;
    line.steps.push({
      id: line.id + '_deferred',
      window: extra.window,
      kind: 'echo',
      history: 'simulated',
      when: { noneFlags: extra.flags },
      title: extra.title,
      body: extra.body,
      source: extra.source || '总统办公室 · 值班记录',
      historyNote: '机制推演：没有明确决定时，事情会按现有安排继续，并留下代价。'
    });
    line.steps.sort(function (a, b) {
      const aw = (a.window && a.window[0]) || 0;
      const bw = (b.window && b.window[0]) || 0;
      return aw - bw;
    });
  });

  const byIdMap = {};
  STORYLINES.forEach(function (line) {
    byIdMap[line.id] = line;
    line.steps.forEach(function (step) { step.lineId = line.id; });
  });

  function hashString(text) {
    let h = 0x811c9dc5;
    const str = String(text);
    for (let i = 0; i < str.length; i += 1) {
      h ^= str.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h >>> 0;
  }

  function conditionMet(state, when) {
    if (!when) return true;
    const D = root.LZS_DYNAMIC;
    if (D && typeof D.conditionMet === 'function') return D.conditionMet(state, when);
    return true;
  }

  function rng(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* 激活：种子决定哪几条故事线成为本局主轴。同一主线集合内部仍然由玩家决定分支。 */
  function pick(seed) {
    const rand = rng(hashString('story:' + seed));
    const scored = STORYLINES.map(function (line) {
      const jitter = rand() * 0.55;
      return { line: line, score: line.weight + jitter };
    });
    scored.sort(function (a, b) { return b.score - a.score; });
    const active = scored.slice(0, PRIMARY_LINES).map(function (s) { return s.line.id; });
    const aux = scored.slice(PRIMARY_LINES, PRIMARY_LINES + AUX_LINES).map(function (s) { return s.line.id; });
    return { active: active, aux: aux };
  }

  function freshStore(state) {
    const seed = (state && state.campaign && state.campaign.seed) || 1;
    return {
      seed: seed,
      active: [],
      aux: [],
      pointers: {},
      paths: {},
      files: 0,
      log: [],
      activated: false
    };
  }

  function activate(state) {
    if (!state || !state.campaign) return null;
    const seed = state.campaign.seed || 1;
    const choice = pick(seed);
    const store = freshStore(state);
    store.active = choice.active;
    store.aux = choice.aux;
    store.active.forEach(function (id) { store.pointers[id] = 0; });
    store.aux.forEach(function (id) { store.pointers[id] = 0; });
    store.activated = true;
    state.campaign.story = store;
    return store;
  }

  function storyOf(state) {
    if (!state || !state.campaign) return null;
    if (!state.campaign.story || !state.campaign.story.activated) return activate(state);
    return state.campaign.story;
  }

  function variantOf(step, state) {
    if (!step.variants || !step.variants.length) return null;
    for (let i = 0; i < step.variants.length; i += 1) {
      if (conditionMet(state, step.variants[i].when)) return step.variants[i];
    }
    return null;
  }

  function isAux(store, lineId) {
    return (store.aux || []).indexOf(lineId) !== -1;
  }

  /* 推进一个窗口：返回本窗口要生成的故事线文件与免费内容。纯函数式，不写 state 数值。 */
  function advance(state) {
    const out = { files: [], feed: [] };
    if (!state || !state.campaign || state.phase === 'wrapup') return out;
    const store = storyOf(state);
    if (!store) return out;
    const round = state.round;
    const lines = (store.active || []).concat(store.aux || []);
    lines.forEach(function (lineId) {
      const line = byIdMap[lineId];
      if (!line) return;
      let ptr = store.pointers[lineId] || 0;
      let guard = 0;
      while (ptr < line.steps.length && guard++ < 6) {
        const step = line.steps[ptr];
        const from = (step.window && step.window[0]) || 1;
        const to = (step.window && step.window[1]) || 13;
        if (round < from) break;
        if (!conditionMet(state, step.when)) {
          if (round > to) { ptr += 1; continue; }
          /* 同一阶段的互斥分支：这一步的条件不成立时，先看看同窗口起的兄弟阶段有没有成立的 */
          let sibling = -1;
          for (let s = ptr + 1; s < line.steps.length && s <= ptr + 3; s += 1) {
            const peer = line.steps[s];
            const peerFrom = (peer.window && peer.window[0]) || 1;
            if (peerFrom !== from) break;
            if (round > ((peer.window && peer.window[1]) || 13)) continue;
            if (conditionMet(state, peer.when)) { sibling = s; break; }
          }
          if (sibling === -1) {
            /* 这一步的条件在整局里可能永远不会成立（比如玩家走了另一条分支，或者一直没打开
               那份文件）。此时不要卡死整条线：往后找下一步「窗口已开且条件成立」的非文件阶段，
               直接接上，保证故事线仍然有后续，而不是无声消失。 */
            let next = -1;
            for (let s = ptr + 1; s < line.steps.length && s <= ptr + 5; s += 1) {
              const peer = line.steps[s];
              const peerFrom = (peer.window && peer.window[0]) || 1;
              const peerTo = (peer.window && peer.window[1]) || 13;
              if (peerFrom > round) break;
              if (round > peerTo) continue;
              if (peer.kind === 'file') continue;
              if (!conditionMet(state, peer.when)) continue;
              next = s;
              break;
            }
            if (next === -1) break;
            ptr = next;
            continue;
          }
          ptr = sibling;
          continue;
        }
        const variant = variantOf(step, state);
        const title = (variant && variant.title) || step.title;
        const body = (variant && variant.body) || step.body;
        const base = {
          lineId: lineId,
          lineTitle: line.title,
          theme: line.theme,
          node: line.node,
          stepId: step.id,
          kind: step.kind,
          round: round,
          title: title,
          body: body,
          source: step.source || '',
          history: step.history || 'simulated',
          historyNote: step.historyNote || ''
        };
        if (step.kind === 'file' && !isAux(store, lineId) && store.files < FILE_CAP && out.files.length === 0) {
          /* 每份文件都补一个「暂不处置」的中性选项放在最后：它同时是未处理时的默认结算，
             保证玩家没有点开这份文件时，不会替他做出有实际代价的决定。 */
          const options = (step.options || []).map(function (opt) { return Object.assign({}, opt); });
          if (!options.some(function (opt) { return opt.id === 'defer'; })) {
            options.push({
              id: 'defer',
              label: '暂时搁置，按部门现有的做法继续',
              ap: 0,
              note: '不做决定也是一种决定：这件事会按现有安排往下走，后面还会再出现。'
            });
          }
          base.options = options;
          out.files.push(base);
          store.files += 1;
        } else if (step.kind === 'file') {
          /* 额度用完或辅助线：降级成免费动态，不占总统注意力。 */
          out.feed.push(Object.assign({}, base, {
            kind: 'brief',
            body: body + ' 这件事没有形成需要总统签字的文件，只在值班室里被记了一笔。'
          }));
        } else {
          out.feed.push(base);
        }
        ptr += 1;
        break;
      }
      store.pointers[lineId] = ptr;
    });
    if (out.feed.length > FEED_CAP_PER_WINDOW) out.feed = out.feed.slice(0, FEED_CAP_PER_WINDOW);
    return out;
  }

  function recordFile(state, file, dispatchId) {
    const store = storyOf(state);
    if (!store || !file) return;
    store.log.push({ kind: 'file', stepId: file.stepId, lineId: file.lineId, round: state.round, dispatchId: dispatchId || null, title: file.title });
    if (store.log.length > 120) store.log = store.log.slice(-120);
  }

  function recordFeed(state, items) {
    const store = storyOf(state);
    if (!store || !items || !items.length) return;
    items.forEach(function (item) {
      store.log.push({ kind: item.kind, stepId: item.stepId, lineId: item.lineId, round: state.round, title: item.title });
    });
    if (store.log.length > 120) store.log = store.log.slice(-120);
  }

  function recordPath(state, lineId, label, note) {
    const store = storyOf(state);
    if (!store) return;
    store.paths[lineId] = { label: label, note: note || '', round: state.round };
  }

  /* 复盘用：本局走过哪些故事线、各自走到哪一步、选了什么。 */
  function summary(state) {
    const store = storyOf(state);
    if (!store) return { active: [], aux: [], lines: [], files: 0, paths: {}, unexplored: STORYLINES.map(function (l) { return l.id; }) };
    const lines = STORYLINES.map(function (line) {
      const primary = (store.active || []).indexOf(line.id) !== -1;
      const auxiliary = (store.aux || []).indexOf(line.id) !== -1;
      const ptr = store.pointers[line.id] || 0;
      const path = store.paths[line.id] || null;
      return {
        id: line.id,
        title: line.title,
        theme: line.theme,
        node: line.node,
        primary: primary,
        auxiliary: auxiliary,
        seen: ptr,
        total: line.steps.length,
        state: !primary && !auxiliary ? 'unexplored' : (ptr >= line.steps.length ? 'complete' : (ptr > 0 ? 'partial' : 'pending')),
        path: path
      };
    });
    return {
      seed: store.seed,
      active: (store.active || []).slice(),
      aux: (store.aux || []).slice(),
      lines: lines,
      files: store.files || 0,
      paths: store.paths || {},
      explored: lines.filter(function (l) { return l.state !== 'unexplored'; }).map(function (l) { return l.id; }),
      unexplored: lines.filter(function (l) { return l.state === 'unexplored'; }).map(function (l) { return l.id; })
    };
  }

  /* 结局复盘用：一句话概括本局主线，不做善恶评价。 */
  function narrative(state) {
    const sum = summary(state);
    const parts = [];
    sum.active.forEach(function (id) {
      const line = byIdMap[id];
      const path = sum.paths[id];
      if (!line) return;
      parts.push(line.title + (path ? '（' + path.label + '）' : ''));
    });
    if (!parts.length) return '本局没有形成明确的故事线走向。';
    return '本局的主线是：' + parts.join('、') + '。';
  }

  /* 第一窗口的开场局势：每条主轴给一条免费动态，让玩家在第一天就知道这一局的重点在哪里。
     只写当时能知道的信息，不预告后面的结果。 */
  const OPENINGS = {
    line_airfield: {
      title: '机场方向的报告还没成形',
      body: '关于机场一带的交火，能确认的只有跑道与设施被反复提起。谁控制着哪一段，几份报告之间并不一致。'
    },
    line_gov: {
      title: '州一级的请示开始堆起来',
      body: '几个州在问同一件事：哪些决定可以自己先做，哪些必须等首都回话。这个问题现在还只是纸面上的。'
    },
    line_mobilize: {
      title: '自愿前来的人排到了登记点外面',
      body: '登记的人手不够，队列一直在加长。先收下来还是先核实身份，值班的人自己拿不定主意。'
    },
    line_intel: {
      title: '同一天里的两套说法',
      body: '两个来源对同一片区域给出了相反的判断，谁都没有更多证据。按哪一套做准备，会决定资源往哪边移动。'
    },
    line_aid: {
      title: '求援的电文发出去了，回音还没到',
      body: '几份请求已经递出，抵达时间和内容都还不确定。等待本身会占掉注意力。'
    },
    line_reserve: {
      title: '预备力量的位置还没定下来',
      body: '手上还有一点能动用的力量。放在哪个方向、留多久，现在没有人替总统决定。'
    },
    line_civil: {
      title: '出城的路上开始堵',
      body: '往西的道路上车辆在增加，医院和供水系统都在问同一个问题：要准备到什么程度。'
    },
    line_withdraw: {
      title: '没有人知道对面的下一步',
      body: '首都外围的态势还在收紧。关于对面意图的判断互相矛盾，暂时没有哪一种说法能被确认。'
    }
  };

  /* 第一窗口的免费局势动态。 */
  function opening(state) {
    const store = storyOf(state);
    if (!store) return [];
    const lines = (store.active || []).slice(0, 3);
    return lines.map(function (lineId) {
      const line = byIdMap[lineId];
      const text = OPENINGS[lineId] || { title: line ? line.title : '', body: '' };
      return {
        kind: 'brief',
        lineId: lineId,
        lineTitle: line ? line.title : '',
        theme: line ? line.theme : '',
        node: line ? line.node : '',
        stepId: 'opening',
        title: text.title,
        body: text.body,
        source: '总统办公室值班记录（模拟）',
        history: 'simulated',
        historyNote: '这一条是开局局势的模拟整理，不是具体历史报道。'
      };
    });
  }

  const STORYLINE_INDEX = STORYLINES.map(function (line) {
    return { id: line.id, title: line.title, theme: line.theme, node: line.node, steps: line.steps.length, files: line.steps.filter(function (s) { return s.kind === 'file'; }).length };
  });

  return {
    version: VERSION,
    kinds: KINDS,
    historyKinds: HISTORY_KINDS,
    storylines: STORYLINES,
    index: STORYLINE_INDEX,
    count: STORYLINES.length,
    stepCount: STORYLINES.reduce(function (n, line) { return n + line.steps.length; }, 0),
    fileCap: FILE_CAP,
    primaryLines: PRIMARY_LINES,
    auxLines: AUX_LINES,
    byId: function (id) { return byIdMap[id] || null; },
    hashString: hashString,
    pick: pick,
    activate: activate,
    storyOf: storyOf,
    advance: advance,
    recordFile: recordFile,
    recordFeed: recordFeed,
    recordPath: recordPath,
    summary: summary,
    narrative: narrative,
    opening: opening,
    openings: OPENINGS,
    conditionMet: conditionMet
  };
}));
