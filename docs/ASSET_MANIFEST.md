# 资源清单（v1.3.0）

本文件记录 v1.3.0 视觉重制里实际进入仓库的图片、字体与纹理：它们是什么、从哪来、用在哪、授权情况如何。
**凡是 AI 生成、程序绘制或本机素材的地方都写明，不给「历史照片」的错觉。**

## 一、字体

| 文件 | 实际路径 | 使用页面 | 来源 | 制作方式 | 授权 | 尺寸/格式 | 已接入 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `archive-serif.woff2` | `assets/fonts/archive-serif.woff2` | 全站标题、文件抬头、结局标题 | `D:\Assets\fonts\NotoSerifSC-Bold.otf` | `production/visual/make_fonts.py`：用 fontTools 按仓库全部界面文本（去重 1447 字）做子集，再设 `font.flavor = "woff2"` 导出 | SIL Open Font License 1.1（允许嵌入与再分发，未改字形） | 354 KB / WOFF2（`wOF2` 头，1447 字） | 是（`@font-face` + `<link rel=preload>`） |

正文与界面文字仍然走系统字体栈（`--sans` 里含 `Microsoft YaHei` / `PingFang SC` / `Noto Sans CJK SC` 等），
**没有把中文正文也塞进字体文件**，也没有打包任何需要付费授权的商业字体。

## 二、纹理

| 文件 | 实际路径 | 使用页面 | 来源 | 制作方式 | 授权 | 尺寸/格式 | 已接入 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `paper-fiber.webp` | `assets/visual/paper-fiber.webp` | 所有纸面：简报、文件、电报、归档卡 | `D:\Assets\ambientcg`（Paper 类） | `production/visual/make_textures.py`：裁切 + 缩放 + 轻微去饱和，`multiply` 叠加 | ambientCG CC0 | 2.4 KB / WebP | 是 |
| `wall-grain.webp` | `assets/visual/wall-grain.webp` | `body` 背景 | 同上（Plaster 类） | 同上，`overlay` 叠加 | ambientCG CC0 | 0.2 KB / WebP | 是 |

## 三、原创矢量插画与图示

| 文件 | 实际路径 | 使用页面 | 来源 | 制作方式 | 授权 | 尺寸/格式 | 已接入 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `cover-desk.svg` | `assets/visual/v13/cover-desk.svg` | 封面主视觉 | 本项目原创 | 手写 SVG：晨窗、落地窗帘、基辅天际线（钟楼、穹顶、抽象烟柱）、桌面文件与笔、座机、杯子、沙袋、折叠国旗、档案夹 | 项目自有 | 1600×640 / SVG（约 6 KB） | 是 |
| 态势示意图 | 由 `js/visual.js` 的 `mapHtml()` 直接生成为内联 SVG | 战役左栏「战场态势」 | 本项目原创 | 读 `L.getCampaignStatus().fronts` 的坐标，绘制河网、水库、城区、六个态势点与图例 | 项目自有 | 300×250 视口 / 内联 SVG | 是（数据实时） |
| 故事线符号 | 由 `js/visual.js` 的 `EMBLEMS` 内联 SVG path | 左栏故事线、文件标记 | 本项目原创 | 八条故事线各一枚线性符号（跑道、公文、登记表、电报、货运、账目、道路、时间轴） | 项目自有 | 24×24 / 内联 SVG | 是 |

**没有使用真实历史照片。** 封面与态势图都在页面上明确标注「原创编辑插画 · 不是历史照片」「战略示意，不表示真实兵力、精确战线或可行进路线」。
封面里的国旗只作为桌面上的折叠旗帜出现，配色取自乌克兰国旗；页面其余部分仍然是低饱和军绿 + 档案纸 + 琥珀，**没有把整页做成黄蓝**。

## 四、沿用 v0.3 至 v1.2 的既有资产（未重制）

| 类型 | 路径 | 说明 |
| --- | --- | --- |
| 事件主视觉（七日开局） | `assets/events/*.svg`（19 张） | v0.5 起沿用的矢量场景，本版只调整了外层版式 |
| 战役主视觉（SDXL） | `assets/visual/events/*.webp`（7 张） | v0.3 由本机 ComfyUI 生成，非历史照片；本版未重生成 |
| 抽象态势小图 | `assets/visual/maps/*.svg`（7 张） | 战役简报右下角的示意小图 |
| 档案装饰 | `assets/visual/archive/paper-fiber.svg`、`dossier-stamp.svg` | v0.5 起的纸纹与印章 |
| 政治漫画 | `assets/visual/intro/*.webp` | 封面上并置的两种「战争视角」，本版加了旧印刷调（去饱和 + 微棕）并保留「原创政治漫画，不是历史照片」说明 |

## 五、没有进入仓库的东西

- `D:\Assets\kenney` 的 19 个 CC0 游戏 UI 包：风格是通用圆角控件，与战争档案不符，**未使用**。
- `D:\Assets\icons\game-icons-master.zip`（CC BY 3.0）：需要逐图标署名，本轮改用手写的少量符号，**未使用**。
- `D:\Assets\models`（Blender 家具）、`D:\Assets\hdri`、`D:\3D建模素材`：与本项目无关，**未使用**。
- `D:\ComfyModels` 的 SDXL / LoRA / ControlNet：本版没有生成新图，理由见 `docs/ART_ASSET_AUDIT.md` 第三节。

## 六、校验方式

`tests/assets.test.cjs` 会检查：字体是真的 WOFF2、体积在合理区间、`@font-face` 与 preload 都在、
CSS 里引用的本地资源都存在、仓库内图片都小于 400 KB、`js/visual.js` 不含 DOM 操作、
并且可视化只读真实游戏状态而不是写死的示意数值。
