# v1.3.0 资源审计（D 盘 / 本机）

审计时间：2026-11-04。范围限定在**与设计、素材、模型、字体、图片生成相关的目录**，没有遍历个人文档、相册与聊天记录。
原始素材一律未移动、未删除、未改名。

## 1. 运行环境

| 项目 | 实际值 |
| --- | --- |
| 项目路径 | `C:\Users\11ee11\Documents\deepseek-harness\default-workspace\little-zelensky-simulator` |
| 显卡 | NVIDIA GeForce RTX 4060 Laptop GPU，8188 MiB，驱动 566.07 |
| Python | 3.12.14（本机 DSH 运行时），Pillow 12.3.0、fontTools 4.68.0、brotli 1.2.1、numpy 2.3.5 |
| 浏览器 | 本地无头 Edge（Playwright 不在用，直接走 CDP） |
| D 盘 | 已挂载，已用 460.7 GB |

## 2. 找到了什么

### 2.1 字体（`D:\Assets\fonts`，12 个文件）

| 文件 | 体积 | 许可（据文件名与来源判断） | 用途判断 |
| --- | --- | --- | --- |
| `NotoSerifSC-Bold.otf` | 24.3 MB | SIL Open Font License 1.1 | **已使用**：裁子集做标题衬线 |
| `NotoSerifSC-Regular.otf` | 23.4 MB | OFL 1.1 | 可作为正文备选，本次未用 |
| `NotoSerifSC-Black.otf` | 22.9 MB | OFL 1.1 | 未用（粗度与 Bold 重复） |
| `NotoSansSC-Regular/Medium.otf` | 15.7 / 15.8 MB | OFL 1.1 | 未用（正文继续走系统无衬线） |
| `LXGWWenKai-Regular/Medium.ttf` | 18.4 / 17.9 MB | OFL 1.1 | 未用（手写感与档案基调不符） |
| `PuHuiTi-3-55/65/85/105.ttf` | 8.1 / 8.0 / 8.0 / 2.4 MB | 阿里巴巴普惠体，官方声明免费商用 | 未用 |
| `AlimamaShuHeiTi-Bold.ttf` | 1.3 MB | 阿里妈妈数黑体，官方声明免费商用 | 未用（数字标题可备选） |

实际处理：用 `production/visual/make_fonts.py` 把 `NotoSerifSC-Bold.otf` 按**项目全部文本**（`js/*.js` + `index.html`，去重 1438 个字符）裁成 `assets/fonts/archive-serif.woff2`，462.4 KB。
没有裁中文字体正文：第二套中文字体会让手机首屏多背 300 KB 以上，收益不抵成本。

### 2.2 贴图（`D:\Assets\ambientcg`，11 个 CC0 材质包）

`Bricks075A`、`Concrete048`、`Fabric034`、`Ground054`、`Leather011`、`Metal032`、`Metal046A`、`PavingStones131`、`Plaster001`、`Tiles074`、`WoodFloor051`，每个包含 2K JPG 的 Color/Normal/Roughness/Displacement。

实际处理：用 `production/visual/make_textures.py` 取两块，转灰度、压到 256×256、导出 webp：

| 输出 | 来源 | 体积 | 用途 |
| --- | --- | --- | --- |
| `assets/visual/paper-fiber.webp` | `Fabric034.zip` / Color | 2.4 KB | 档案纸的纤维感（低不透明度叠加） |
| `assets/visual/wall-grain.webp` | `Plaster001.zip` | 0.2 KB | 背景极轻颗粒 |

没有把 2K 原图放进网页。

### 2.3 图标与 UI 包（`D:\Assets\icons`、`D:\Assets\kenney`）

- `D:\Assets\icons\game-icons-master.zip`：Game-icons.net 集合，CC BY 3.0，需逐个署名。
- `D:\Assets\kenney`：`ui-pack.zip`、`ui-pack-rpg-expansion.zip`、`game-icons.zip`、`pattern-pack.zip`、`prototype-textures.zip`、`particle-pack.zip`、`cursor-pack.zip`、`input-prompts.zip` 等，Kenney 资产均为 CC0。

判断：**本版本没有使用**。原因是这些包是通用游戏 UI 形状（圆角按钮、卡通图标、面板九宫格），与本项目「战时档案 × 新闻编辑部」的印刷排版语言冲突，混进来反而会变成「移动游戏大厅」。本项目的图标继续用文字符号 + 自绘 SVG。

### 2.4 三维与材质参考（`D:\Assets\models`、`hdri`、`blender-addons`、`D:\3D建模素材`）

`ArmChair_01.blend`、`Barrel_01.blend`、`Camera_01.blend`、`WoodenChair_01.blend` 等家具模型，7 张 `.hdr` 夜景环境光，Poly Haven 插件包；`D:\3D建模素材` 只有两段手机视频。

判断：与本项目（纯 2D 网页、俯视档案排版）无直接用途，未使用。椅子/相机模型理论上可用于 3D 场景截图，但产出风格会是渲染图，与现有矢量语言不一致。

### 2.5 图片生成环境（`C:\Users\11ee11\Tools\comfyui` + `D:\ComfyModels`）

- ComfyUI 便携版存在（`ComfyUI_windows_portable`），启动脚本 `run_comfyui_d.bat`，默认端口 8188，**审计时未运行**（`http://127.0.0.1:8188/system_stats` 连不上）。
- 模型：`sd_xl_base_1.0`、`sd_xl_refiner_1.0`、`Juggernaut-XL_v9`、`RealVisXL_V4.0`、`Realistic_Vision_V5.1`、`sd15 v1-5-pruned`、`stable_audio_open_1.0`。
- 加速：`sdxl_lightning_8step_lora`；ControlNet：`control_canny_sdxl`、`control_depth_sdxl`、`controlnet-union-sdxl-promax`；放大：`4x-UltraSharp`（在 `upscale_models`）。
- `D:\AI\datasets\comfy_out` 有 478 个历史输出文件。

判断：图片生成环境**可用但本次没有产出任何正式素材**。原因写在下面第 4 节。

### 2.6 与本项目相关的旧素材

按 `小泽`、`zelensky`、`lzs`、`kyiv`、`基辅`、`乌克兰` 在 D 盘（深度 3）按文件名搜索：**无匹配**。项目旧素材全部在项目仓库内：

| 目录 | 内容 | 说明 |
| --- | --- | --- |
| `assets/events/*.svg` | 19 张矢量场景（入侵、安东诺夫、跑道拒止、伊尔平桥、莫什春、布罗瓦雷、切尔尼希夫、援助抵达、清障重建、办公室等待等） | v1.0 由 `production/visual/generate_campaign_scenes.cjs` 生成，本次继续复用并升级 |
| `assets/visual/events/*.webp` | 7 张 SDXL 生成场景（184–215 KB/张） | v0.3 遗留，仍在 7 个首轮事件里使用 |
| `assets/visual/maps/*.svg` | 7 张小尺寸态势示意 | v0.4 遗留，被新地图组件部分替代 |
| `assets/visual/archive/paper-fiber.svg`、`dossier-stamp.svg` | 纸张纹理与印章 | v0.5 遗留 |
| `production/visual/raw`、`processed` | 上述 webp 的中间产物 | 保留，未删除 |
| `design-preview/` | v0.3 的设计评审样板（DESIGN.md 与桌面/手机截图） | 本次美术方向的直接依据 |

## 3. 可以直接使用 / 需要加工 / 只能参考

| 类别 | 结论 |
| --- | --- |
| 直接可用 | ambientCG 两块材质（已裁成 webp）、`NotoSerifSC-Bold`（已裁子集）、现有 19 张 SVG 场景、7 张遗留 webp、仓库内纸张与印章 SVG |
| 需要加工 | 现有 SVG 场景（补图层、统一色板、加批注框）；旧 `assets/visual/maps/*.svg`（信息量不足，需要重画） |
| 只能参考 | Kenney / Game-icons 包（风格不符）、3D 家具模型与 HDR（媒介不符） |
| 许可风险 | Game-icons 为 CC BY，署名成本高；`Juggernaut-XL` / `RealVisXL` 等社区模型许可各不相同，商用需逐个确认；本版本未产出生成图，因此不引入这些风险 |

## 4. 为什么本次没有用图片生成模型产出正式美术

1. 现有视觉语言是**矢量编辑插画 + 印刷排版**，不是写实渲染。SDXL 系模型（尤其 Juggernaut/RealVis）默认往照片方向走，与「不是历史照片」的立场直接冲突：本项目从 v1.0 起就明确不伪造战场照片，混入写实生成图会让玩家误以为在看史料。
2. 生成图里的文字、旗帜、军徽、地名不可控。虽然可以靠 HTML/SVG 排版规避文字，但旗帜与徽记一旦画错就是硬错误。
3. 本版本的工作量集中在排版系统、地图与时间线这类**必须读取真实状态**的部分。这些不能用一张静态图替代，矢量是唯一合适的选择。

如果后续要做写实向的关键插画，正确的路径是单独一轮：固定提示词模板、只出**明确标注为「原创编辑插画」**的构图、逐张人工过一遍，然后才接入页面。

## 5. 本次实际产出清单

| 文件 | 类型 | 来源 | 体积 |
| --- | --- | --- | --- |
| `assets/fonts/archive-serif.woff2` | 字体子集 | `D:\Assets\fonts\NotoSerifSC-Bold.otf`（OFL 1.1） | 462.4 KB |
| `assets/visual/paper-fiber.webp` | 纹理 | ambientCG `Fabric034`（CC0） | 2.4 KB |
| `assets/visual/wall-grain.webp` | 纹理 | ambientCG `Plaster001`（CC0） | 0.2 KB |
| `assets/visual/v13/*.svg` | 矢量资产 | 本项目自绘（见 `docs/ASSET_MANIFEST.md`） | 见清单 |

## 6. 生产方案结论

- 排版与信息图：**CSS + 自绘 SVG + Canvas**，全部读取真实游戏状态。
- 关键场景：继续用矢量编辑插画，风格延续 v1.0 的 19 张场景，不引入写实照片。
- 材质：只保留两块 256×256 的 CC0 贴图，低不透明度使用。
- 字体：标题用 OFL 子集，正文走系统字体，保证手机端首屏不变慢。
- 图片生成：环境可用，但没有产出正式素材，理由见第 4 节；不把「可生成」当成「已生成」。
