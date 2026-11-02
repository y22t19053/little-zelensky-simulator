"""Merge generation records into a public, source-linked asset provenance ledger."""
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
VISUAL = ROOT / 'production' / 'visual'
AUDIO = ROOT / 'production' / 'audio'
records = []
generation = json.loads((VISUAL / 'generation-manifest.json').read_text(encoding='utf-8-sig'))
post = {p['id'].split('.')[-1]: p for p in json.loads((VISUAL / 'postprocess-manifest.json').read_text(encoding='utf-8'))}
for item in generation:
    records.append({
        'id': 'event.' + item['id'], 'source': 'production/visual/raw/' + item['id'] + '.png',
        'intermediate': post[item['id']]['intermediate'] if item['id'] in post else None,
        'output': 'assets/visual/events/' + item['id'] + '.webp',
        'tool': '本地 ComfyUI API，经 _research/coc-game/coc_iso3d/tools/comfy_gen.py 调用',
        'model': 'Stability AI SDXL Base 1.0 / sd_xl_base_1.0.safetensors；25 steps；Euler / Normal；CFG 7；seed ' + str(item['seed']),
        'production': '1152×640 原始 PNG；独立英文提示词与负向词；' + ('八色低饱和分级、纸粒、WebP q84 已执行' if item['id'] in post else '后期缺失'),
        'license': '模型使用受 CreativeML Open RAIL++-M 约束；输出随本项目 UNLICENSED 分发，不声明为 CC0、公有领域或无限制商用素材。',
        'licenseReference': 'https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0',
        'use': '第 ' + item['id'] + ' 回合主视觉；原 assets/events/ 同名 SVG 为离线与降级备用。'
    })
for item in json.loads((VISUAL / 'vector-manifest.json').read_text(encoding='utf-8')):
    records.append({**item, 'source': 'production/visual/generate_vectors.py', 'tool': 'production/visual/generate_vectors.py', 'model': '无生成模型', 'production': '原创程序矢量；无外链、无真实地理数据'})
for item in json.loads((AUDIO / 'audio-manifest.json').read_text(encoding='utf-8')):
    records.append({
        **item, 'tool': 'production/audio/generate_audio.py + FFmpeg 8.1.1', 'model': '无生成模型；固定随机种子 20260224',
        'license': '本项目原创程序合成，无第三方录音或采样；随项目 UNLICENSED 使用。',
        'use': '菜单/日间/夜间/结局音乐，或界面与结算 SFX；仅用户开启后加载。'
    })
public = ROOT / 'assets' / 'metadata'
public.mkdir(parents=True, exist_ok=True)
(public / 'assets.json').write_text(json.dumps({'version': 1, 'count': len(records), 'assets': records}, ensure_ascii=False, indent=2), encoding='utf-8')

def tree_bytes(path, suffixes=None):
    files = [p for p in path.rglob('*') if p.is_file() and (suffixes is None or p.suffix.lower() in suffixes)]
    return len(files), sum(p.stat().st_size for p in files)
report = {}
for name, relative, suffixes in [
    ('eventWebP', 'assets/visual/events', {'.webp'}), ('mapsAndArchive', 'assets/visual', {'.svg'}),
    ('music', 'assets/audio/music', {'.ogg'}), ('sfx', 'assets/audio/sfx', {'.ogg'}),
    ('rawVisual', 'production/visual/raw', None), ('processedVisual', 'production/visual/processed', None),
    ('rawAudio', 'production/audio/raw', {'.wav'}), ('allProduction', 'production', None),
]:
    count, size = tree_bytes(ROOT / relative, suffixes)
    report[name] = {'path': relative, 'files': count, 'bytes': size, 'MiB': round(size / 1048576, 3)}
report['newRuntimeAssets'] = {'files': sum(report[k]['files'] for k in ('eventWebP','mapsAndArchive','music','sfx')), 'bytes': sum(report[k]['bytes'] for k in ('eventWebP','mapsAndArchive','music','sfx'))}
report['newRuntimeAssets']['MiB'] = round(report['newRuntimeAssets']['bytes']/1048576,3)
(public / 'size-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print('MANIFEST', len(records), 'runtime bytes', report['newRuntimeAssets']['bytes'], 'production bytes', report['allProduction']['bytes'])
