# 本地资产生产目录

此目录保存原始文件、生成脚本和验收工具；正式网页只读取 `../assets/` 中的压缩结果。

## 复跑环境

- Windows / 本机 ComfyUI `127.0.0.1:8188`
- NVIDIA RTX 4060 Laptop 8 GiB；SDXL Base 1.0 已在本机模型目录
- Python 3 + Pillow / NumPy
- FFmpeg 在 PATH 中

模型与生成脚本沿用机器已有环境；项目不包含模型权重，也不会自动下载模型。

## 主视觉

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
& production\visual\generate.ps1
```

`generate.ps1` 逐个调用已有 `comfy_gen.py`，避免一次性向 8 GiB 显存堆叠任务。随后自动执行低饱和分级、WebP 压缩和抽象 SVG 生成。只重新后期、不重新推理：

```powershell
python production/visual/postprocess.py
python production/visual/generate_vectors.py
```

原始 PNG 在 `visual/raw/`，固定种子与提示词在 `visual/generation-manifest.json`。

## 音乐与音效

```powershell
python production/audio/generate_audio.py
```

脚本重新合成四段主题音乐、十类 SFX，并输出 WAV 母版、Ogg Vorbis 和 `audio/audio-manifest.json`。没有使用第三方采样。

## 清单与试听

```powershell
python production/build_asset_manifest.py
```

该命令合并来源、工具、模型、制作过程、许可、用途与包体统计，写入 `../assets/metadata/`。

双击 `listening-room.html` 可逐条试听。页面使用原生音频控件，不自动播放。

## 边界

- 不读取或打包浏览器配置、私人聊天、账户、密钥或其他项目的私人素材。
- 不复制许可未核清的旧角色和纹理；不将模型输出标为无限制商用素材。
- 抽象态势不是精确地图，不表示真实前线、兵力或路线。
- 资产生产不得改动 `js/engine.js`、`js/events.js` 的玩法参数或 `lzs_save_v1`。
