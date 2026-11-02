# 本地美术与音频资产记录

本文件记录 v0.3.0 补充资产的制作方式、来源与许可边界。逐文件清单见 [assets/metadata/assets.json](assets/metadata/assets.json)，包体统计见 [assets/metadata/size-report.json](assets/metadata/size-report.json)。

## 正式资产

| 类别 | 数量 | 正式位置 | 用途 |
| --- | ---: | --- | --- |
| 七回合主视觉 | 7 WebP | `assets/visual/events/` | 每个事件的独立场景图，1152×640 |
| 抽象态势与档案组件 | 9 SVG | `assets/visual/maps/`、`assets/visual/archive/` | 七张非地理精确态势图、纸纹、签发印章 |
| 主题音乐 | 4 Ogg | `assets/audio/music/` | 菜单、日间、夜间、结局，同一主题变奏，32 秒循环 |
| 界面与结算音效 | 10 Ogg | `assets/audio/sfx/` | 选择、签发、拒绝、回合、延迟、警报、崩溃、结局、菜单、弹窗 |

新增运行资产共 30 个、3,316,699 字节（约 3.16 MiB）。音乐约 1.865 MiB，SFX 约 0.086 MiB，七张 WebP 约 1.206 MiB。音频只有玩家开启对应功能后才请求，不自动播放。

## 原始与中间文件

- `production/visual/raw/`：七张 1152×640 原始 PNG，共约 9.274 MiB。
- `production/visual/processed/`：七张统一分级后的中间 PNG，共约 8.566 MiB。
- `production/audio/raw/`：12 个合成 WAV 母版，共约 8.216 MiB；`menu.wav` 与 `ending.wav` 同时为主题和短音效提供素材。
- `production/visual/`：提示词、固定种子、生成清单、后期清单与可复跑脚本。
- `production/audio/`：原创合成脚本、WAV 母版和编码清单。
- `production/` 总体约 26.4 MiB；它不是网页运行依赖，GitHub Pages 不需要加载这些原始文件。

## 制作管线与来源

1. 实测本机 NVIDIA GeForce RTX 4060 Laptop GPU（8188 MiB）与既有 ComfyUI，复用 `_research/coc-game/coc_iso3d/tools/comfy_gen.py` 调用本地服务，没有重复搭建模型服务。
2. 主视觉使用本地 **SDXL Base 1.0**，25 步、Euler / Normal、CFG 7、1152×640；七张分别使用固定种子 20261102–20261108 和独立提示词。
3. 后期执行低饱和、八色军绿/琥珀分级、轻微纸粒与 WebP q84 压缩。原 `assets/events/` 七张 SVG 保留为降级备用。
4. 态势 SVG、纸纹和印章由原创程序矢量生成，不含真实地理数据、精确前线、兵力、路线或外部图片。
5. 音乐与音效由原创 NumPy 波形、包络、滤波与混音生成，再用 FFmpeg 编码 Ogg Vorbis；无第三方录音、TTS、采样或既有游戏音频。

## 许可与使用边界

- 项目根目录许可状态仍为 **UNLICENSED**；本次没有擅自改成开源或许可证不明资产可商用。
- SDXL Base 1.0 模型使用受 **CreativeML Open RAIL++-M** 约束，参考 [Stability AI 模型页](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0)。生成图随本项目 UNLICENSED 分发，**不声明为 CC0、公有领域或无限制商用素材**。对外商业发行前仍需单独复核模型条款和项目授权。
- 原创程序音频、矢量和后期脚本不引用第三方素材；随项目 UNLICENSED 使用。
- 调查过但未迁移的旧角色、纸纹与其他项目资产，不因本地可读取就被视为可复用。
- 所有场景均为合成视觉，不作为真实照片、历史文件或地理证据。人物与事件画面不添加无法核实的直接引语。

## 试听与复跑

- 双击 `production/listening-room.html` 可试听全部音乐与音效；页面不自动播放。
- `production/README.md` 记录复跑命令与目录约定。
- 修改或重新生成资产后，运行 `production/build_asset_manifest.py` 更新公开清单和包体报告。
