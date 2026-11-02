"""Consistent editorial grade for locally generated raws; writes web-ready WebP."""
from pathlib import Path
from PIL import Image, ImageEnhance, ImageFilter
import numpy as np
import json, hashlib

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
RAW = HERE / 'raw'
PROCESSED = HERE / 'processed'
OUT = ROOT / 'assets' / 'visual' / 'events'
PROCESSED.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)
PALETTE = np.array([
    [18, 21, 19], [31, 36, 32], [54, 61, 51], [78, 83, 67],
    [109, 108, 84], [151, 137, 96], [190, 166, 112], [218, 205, 169],
], dtype=np.float32)
records = []
for source in sorted(RAW.glob('*.png')):
    image = Image.open(source).convert('RGB')
    image = ImageEnhance.Color(image).enhance(0.28)
    image = ImageEnhance.Contrast(image).enhance(1.12)
    # Posterized luminance mapped to the project's charcoal/olive/amber palette.
    lum = np.asarray(image.convert('L'), dtype=np.float32) / 255.0
    lum = np.clip((lum - 0.035) / 0.93, 0, 1)
    indices = np.minimum((lum * len(PALETTE)).astype(np.int16), len(PALETTE) - 1)
    graded = PALETTE[indices]
    original = np.asarray(image, dtype=np.float32)
    # Retain a little source detail without allowing off-palette colors to dominate.
    mixed = graded * 0.78 + original * 0.22
    rng = np.random.default_rng(20261102 + len(records))
    grain = rng.normal(0, 2.1, mixed.shape[:2])[..., None]
    mixed = np.clip(mixed + grain, 0, 255).astype(np.uint8)
    result = Image.fromarray(mixed, 'RGB').resize((1152, 640), Image.Resampling.LANCZOS)
    intermediate = PROCESSED / (source.stem + '.png')
    result.save(intermediate, 'PNG', optimize=True)
    target = OUT / (source.stem + '.webp')
    result.save(target, 'WEBP', quality=84, method=6)
    records.append({
        'id': 'visual.event.' + source.stem,
        'source': 'production/visual/raw/' + source.name,
        'intermediate': 'production/visual/processed/' + intermediate.name,
        'output': 'assets/visual/events/' + target.name,
        'bytes': target.stat().st_size,
        'sha256': hashlib.sha256(target.read_bytes()).hexdigest(),
        'postprocess': 'desaturate 0.28; contrast 1.12; 8-color charcoal/olive/amber grade; seeded paper grain; 1152x640; WebP q84',
    })
    print(f"{source.stem}: {target.stat().st_size / 1024:.1f} KiB")
(HERE / 'postprocess-manifest.json').write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding='utf-8')
