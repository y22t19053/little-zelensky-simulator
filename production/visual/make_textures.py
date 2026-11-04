"""从本机 D 盘 CC0 材质里裁两块小尺寸纹理，供纸张与墙面使用。

来源（ambientCG，CC0 1.0，无需署名，但仍在文档里记录）：
    Fabric034  —— 织物纤维，用于档案纸的轻微纤维感
    Plaster001 —— 抹灰墙面，用于背景的极轻颗粒

只取 Color 贴图，转灰度、压到 256×256、导出 webp，单张十几 KB。

用法：
    python production/visual/make_textures.py
"""

import io
import os
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT_DIR = os.path.join(ROOT, "assets", "visual")

SOURCES = [
    {
        "zip": r"D:\Assets\ambientcg\Fabric034.zip",
        "entry": "Fabric034_2K-JPG_Color.jpg",
        "out": "paper-fiber.webp",
        "size": 256,
        "quality": 62,
        "contrast": 0.55,
        "brightness": 1.28,
    },
    {
        "zip": r"D:\Assets\ambientcg\Plaster001.zip",
        "entry": "Plaster001_2K-JPG_Color.jpg",
        "out": "wall-grain.webp",
        "size": 256,
        "quality": 58,
        "contrast": 0.4,
        "brightness": 0.9,
    },
]


def build_one(spec):
    from PIL import Image, ImageEnhance

    if not os.path.exists(spec["zip"]):
        print("缺少材质包： " + spec["zip"])
        return None
    with zipfile.ZipFile(spec["zip"]) as archive:
        raw = archive.read(spec["entry"])
    image = Image.open(io.BytesIO(raw)).convert("L")
    # 从中央裁一块，避免边缘接缝太明显
    side = min(image.size)
    left = (image.width - side) // 2
    top = (image.height - side) // 2
    image = image.crop((left, top, left + side, top + side))
    image = image.resize((spec["size"], spec["size"]), Image.LANCZOS)
    image = ImageEnhance.Contrast(image).enhance(spec["contrast"])
    image = ImageEnhance.Brightness(image).enhance(spec["brightness"])
    out = os.path.join(OUT_DIR, spec["out"])
    image.save(out, "WEBP", quality=spec["quality"], method=6)
    return out


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for spec in SOURCES:
        out = build_one(spec)
        if out:
            print("%-18s %5.1f KB" % (os.path.basename(out), os.path.getsize(out) / 1024.0))
    return 0


if __name__ == "__main__":
    sys.exit(main())
