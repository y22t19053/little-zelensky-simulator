# v0.4.1 策略审查与平衡记录

本文件是开发期审查记录，不是玩家攻略，也不是“真实历史最优决策”列表。所有数值均为模拟参数；本文件中的路线只用于验证机制是否连通。

## 审查范围与方法

- 读取 `js/events.js`、`js/engine.js`、`js/intel.js`、`js/main.js`、`js/history.js`、`js/review.js`、存档迁移和 `tests/`。
- 在真实命令台账上运行 `tests/strategy-compare.cjs`、`tests/balance-audit.cjs`、`tests/route-search.cjs`，并保留 `npm test` 与浏览器验收。
- 频率、胜率和搜索命中都只是发现问题的线索，不作为直接改数值的依据。没有改变结局阈值、历史事实、既有 29 项效果或 v0.3 视觉/音频。

## 29 项决策审查摘要

“观察”表示该选项的 AP 收益比或适用面值得继续观察；“保留”表示当前有明确用途和代价。没有因为在某次模拟中低频出现就删除选项。

| 回合 | 决策 | AP | 席位 | 主要即时收益 | 主要代价 / 延迟 | 审查判断 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | address 全国讲话 | 1 | 自行排队 | gov/will/intl 上升 | 总统安全−3；2 夜后 gov、reserve 回落 | 保留；低 AP 强民心 |
| 1 | mobilize 全国总动员 | 2 | 优先 | army+8、will+4 | reserve−7、gov−2；3 夜后 army、will 回落 | 保留；高投入高后续成本 |
| 1 | aid_call 致电盟友 | 1 | 自行排队 | intl+7、safety+2 | 不能立即止血；3 夜后才到账 | 保留；需关注低 AP 长期收益 |
| 1 | disperse 政府分散 | 2 | 优先 | gov+8、safety+4 | will−5、intl−2；army/reserve 继续下降 | 保留；连续性与象征的取舍 |
| 2 | stay 留在基辅 | 2 | 优先 | gov/will/kyiv 上升 | safety−12，随后再−5 | 保留；高风险政治选择 |
| 2 | relocate 转移利沃夫 | 2 | 优先 | safety+15、gov+3 | will−11、intl−4、kyiv−4；军队与政府延迟受损 | 保留；明确反代价 |
| 2 | split 职能西移 | 2 | 优先 | gov/safety/will 小幅上升 | army/reserve 下降，延迟再削 gov/army | 保留；折中选项没有突出长板 |
| 2 | record 视频不公布位置 | 1 | 自行排队 | will+4、safety+7 | gov−4、intl−2，延迟继续 | 保留；低成本避险，伤政府 |
| 3 | counterattack 反击机场 | 2 | 优先 | army/kyiv/will 上升 | reserve−5、safety−2；延迟 army/reserve 再降 | 保留；高代价的战术成功 |
| 3 | block_runway 炮击跑道 | 1 | 自行排队 | kyiv+3、army+2 | will−3、reserve−3；延迟 kyiv−4、压力+2 | 保留；即时止血、延迟反噬 |
| 3 | air_defense 防空与卫星情报 | 2 | 优先 | intl+6、army/kyiv+2 | 短期不能替代地面防御 | 观察；延迟收益强且负面少 |
| 3 | city_defense 城市防御 | 1 | 自行排队 | army+5、reserve+2 | kyiv−6、will−4；延迟再失 kyiv/safety | 保留；弃机场保军队的窄路线 |
| 4 | curfew 延长宵禁 | 1 | 自行排队 | kyiv/gov/safety 上升 | will−3、reserve−2、intl−1；延迟继续耗储备 | 保留；短期治安与长期代价 |
| 4 | arm_citizens 武装市民 | 2 | 优先 | army/will/kyiv 上升 | reserve−6、safety−6；延迟 gov/army/safety | 保留；高动员、高失控 |
| 4 | bunker 地下指挥所 | 2 | 优先 | gov+7、safety+7 | reserve−3、will−2；延迟小幅回补 | 观察；连续性收益稳定 |
| 4 | unity_gov 联合内阁 | 1 | 自行排队 | gov+6、will+2、intl+2 | safety−1；延迟 army/reserve 小幅下降 | 观察；1 AP 宽收益 |
| 4 | security_rule 安全部门接管 | 2 | 优先 | kyiv+7、safety+4 | gov−9、will−5、intl−3、压力+2；延迟再削 | 保留；强力但政治代价明显 |
| 5 | south 优先南部 | 2 | 优先 | army+4、intl+1 | kyiv−3、reserve−4；延迟 army/kyiv 回补 | 保留；方向性取舍 |
| 5 | east 死守东部 | 2 | 优先 | will+6 | army−7、reserve−5、safety−1、压力+2 | 保留；政治意志换军队 |
| 5 | delegate 战区自行撤退 | 1 | 自行排队 | army+6 | will−6、gov−2、intl−2；延迟 kyiv−1 | 保留；低成本保军队、伤政治 |
| 5 | firepower 远程火力 | 1 | 自行排队 | intl+4、army+1 | 压力+1；延迟 army+5、intl+1 | 观察；低 AP 强延迟收益 |
| 6 | eu 签署欧盟申请 | 1 | 自行排队 | intl+8、will+4、gov+2 | reserve−1；延迟 intl/will 再次上升 | 观察；1 AP 宽收益 |
| 6 | weapons 武器清单与禁飞区 | 2 | 优先 | intl+4、army+3 | safety−4、压力+4；延迟 intl/will 下降 | 保留；高外交与安全风险 |
| 6 | talks 接受谈判 | 2 | 优先 | 压力−5、gov+3、safety+2 | will−5、intl−2；延迟继续损意志 | 保留；唯一即时降压选项 |
| 6 | refuse 拒绝谈判 | 1 | 自行排队 | will+7、intl+2 | pressure+3、safety−3；延迟正向 | 保留；短期代价换意志 |
| 7 | logistics 统一后勤 | 2 | 优先 | reserve+10、army/gov+5 | will−1；无延迟 | 观察；末回合资源大补 |
| 7 | evacuate 平民撤离 | 1 | 自行排队 | kyiv/will/intl 上升 | reserve−5、army−2；无延迟 | 保留；末回合多目标收益 |
| 7 | requisition 征用民间物资 | 1 | 自行排队 | reserve+8、army+3 | will−6、gov−2、intl−1、pressure+1 | 保留；资源与社会的强硬取舍 |
| 7 | speech 全国讲话拒绝投降 | 1 | 自行排队 | will+5、gov+3、intl+1 | safety−5、pressure+3；无延迟 | 保留；末回合低 AP 意志包 |

## 固定优势组合排查

- 1 AP 的 `address`、`aid_call`、`firepower`、`eu` 和 `unity_gov` 都能在不多占 2 AP 的情况下提供较宽的长期收益。它们仍是机会成本选择，因为每天只有 3 AP，且部分延迟会反噬；但从数值上看是本次最值得继续观察的一组。
- `air_defense` 与 `firepower` 都是“先投入、后回补”的军事/外交组合，没有立即扭转前线，但延迟收益稳定；两者是否过强需要真实试玩而非只看胜率判断。
- `bunker` 与 `logistics` 的即时负面很小，分别偏向政府连续性和末回合资源。它们需要 2 AP，仍受优先席位和当回合选择限制。
- 没有发现“同一选项无限重复”或“免费追问获取无限情报”：每项决策每回合只能签发一次，每份情报追问一次，阅读免费但只有六类报告。
- 委派已改为不耗 AP，但不是免费即时执行：目标机构必须有空位，交接要一夜，双方协调各−3；目标满载时拒绝，原责任不变。接受延误不是免费完成，而是占着名额直到窗口失效。
- 撤回免费，但 AP 不退、没有效果；它不是退款机制，也不能让玩家在同一回合重签同一选项。
- 固定搜索只能证明“存在路线”，不能证明“唯一最优”。本次宽束搜索找到的 held 路线需要连续七日总统介入，构成明显的注意力机会成本；它被记录为平衡风险，而不是被当作应追求的答案。

## 三种处理方式的实测对照

`npm run strategy:compare` 固定同一危机与同一后续选项，只改变处理方式：

| 处理 | 首日 AP | 首夜后 / 次日 | 第三日 |
| --- | --- | --- | --- |
| A 总统介入 | 0 | 总动员已结算；压力14；军队56、政府52；总参协调45 | 压力31；政府48；后续命令开始阻塞 |
| B 委派交接 | 1 | 总动员等待一夜；压力12；协调47；次日 HANDOFF | 压力31；总动员已结算；办公室在办2 |
| C 接受延误 | 0 | 两项命令执行中；压力12；协调50 | 压力30；军队45、政府50；总动员过期未结算 |

三条路径的首日 AP、次日命令状态、机构协调和第三日国家状态不同；没有在脚本中预设哪条应获得更高结局。

## 六种策略审计

`npm run audit:balance` 各 2000 局，使用真实签发/授权/夜间执行，不是随机改数值：

| 策略 | 结局分布 | 平均签发 | 平均压力 |
| --- | --- | --- | --- |
| 随机 | costly 95.4%、kyiv 3.0%、hollow 1.4%、president 0.1%、logistics 0.1% | 12.82 | 82.1 |
| 短期收益 | costly 100% | 14 | 79 |
| 保国家状态 | costly 100% | 13 | 78 |
| 优先旧命令 | costly 100% | 11 | 77 |
| 优先最新危机 | costly 100% | 13 | 78 |
| 平均分配 | costly 100% | 14 | 79 |

结论：没有出现“低成本、高胜率”的自动化组合；但五种基线策略均收束到 costly，说明游戏把“每次都签高收益命令”误当成好策略。该结果用于指导 UI 解释和后续真人试玩，不用于直接削弱某个选项。

## held / hollow 可达性

`npm run route:search` 在真实命令授权、容量、窗口、夜间结算与延迟台账上搜索：

- **held**：日 1 `disperse`、日 2 `stay`、日 3 `air_defense`、日 4 `curfew`、日 5 `delegate`、日 6 `talks`、日 7 `logistics`；每日签发后由总统花 1 AP 介入执行。最终压力 75，gov 76 / army 43 / kyiv 37 / will 42 / intl 45 / reserve 39 / safety 39。
- **hollow**：`disperse`、`relocate`、`air_defense`、`unity_gov`、`firepower`、`talks`、`requisition`，同样每日介入。最终压力 76，gov 67 / army 33 / kyiv 25 / will 27 / intl 45 / reserve 39 / safety 74。

这说明 11 种结局在命令与窗口约束下仍可触发，同时暴露一个真实风险：高注意力玩家可以通过每日介入把关键命令从机构队列中“提出来”，代价是当天几乎无法签发第二项命令。该路线是否过强，需要真人试玩与后续版本观察；本次不据此改结局阈值。

## 已知平衡风险

1. 低 AP 的长期收益选项（尤其 `eu`、`firepower`、`aid_call`）可能形成“先拿外援、再补军队”的常识性开局；当前用 AP 与事件窗口约束，但 UI 还没有告诉玩家这是一条被验证过的高胜率路线。
2. 每日介入一条 2 AP 命令可在单日消耗全部 3 AP，却绕开容量/协调，held 搜索命中的正是这种“单点总统制”。它的机会成本很明确，但仍需要真人试玩确认是否过强。
3. 接受延误在纸面上只是“不追加投入”，实际会把机构名额占到过期；如果玩家不打开命令中心，可能只看到夜间“已失效”，需要在后续版本增加更醒目的次日遗留提示。
4. 末回合选项没有未来延迟，`logistics` 与 `requisition` 的资源收益因此更直接；这是 7 日原型的结构限制，不应被解释为历史结论。
5. 六类策略审计没有使用 UI 的追问/收藏/沟通，只覆盖命令层；它不能替代真人试玩，也不能证明所有结局都同样容易。

## AP 结论

保留 3 AP，不增加上限，也不把所有动作统一设为 1 AP。阅读、查看状态、查看命令与日志免费；总统亲自追问、协调、介入、沟通各 1 AP；授权/委派/撤回为 0 AP。当前没有任何 AP 退款或“用委派规避执行”的路径；委派把成本换成一天交接和协调损失。若后续真人试玩仍显示 3 AP 无法支撑有意义的取舍，再单独做 AP 方案，不在本次未经证据的情况下调整。
