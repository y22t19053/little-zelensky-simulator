"""Build local v0.2/v0.3 screenshot comparisons; no network or browser profile access."""
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageFont, ImageOps, ImageStat
import json

ROOT = Path(__file__).resolve().parents[1]
SHOTS = ROOT / "tests" / "screenshots"
BEFORE = SHOTS / "before-v0.2"
AFTER = SHOTS / "after-v0.3"
OUT = SHOTS / "comparisons"
OUT.mkdir(parents=True, exist_ok=True)
PAIRS = [
    ("01-intro-desktop.png", "开场"),
    ("02-game-desktop.png", "第一回合"),
    ("03-game-issued.png", "签发反馈"),
    ("04-interlude-desktop.png", "夜间结算"),
    ("06-ending-desktop.png", "结局"),
    ("08-game-mobile.png", "手机端"),
]
FONT_PATH = Path(r"C:\Windows\Fonts\msyh.ttc")
FONT = ImageFont.truetype(str(FONT_PATH), 26) if FONT_PATH.exists() else ImageFont.load_default()
SMALL = ImageFont.truetype(str(FONT_PATH), 20) if FONT_PATH.exists() else ImageFont.load_default()
report = []
for filename, title in PAIRS:
    paths = [BEFORE / filename, AFTER / filename]
    images = [Image.open(path).convert("RGB") for path in paths]
    for path, image in zip(paths, images):
        assert image.width >= 320 and image.height >= 600, f"Invalid screenshot: {path}"
        assert max(ImageStat.Stat(image).var) > 20, f"Blank screenshot: {path}"
    canvas = Image.new("RGB", (1840, 780), "#111412")
    draw = ImageDraw.Draw(canvas)
    draw.text((24, 16), f"{title} · v0.2 → v0.3", font=FONT, fill="#e4dccb")
    for index, (label, image) in enumerate(zip(("v0.2 · BEFORE", "v0.3 · AFTER"), images)):
        x = 20 + index * 910
        draw.text((x + 4, 62), label, font=SMALL, fill="#c7a76a")
        fitted = ImageOps.contain(image, (890, 660), Image.Resampling.LANCZOS)
        px = x + (890 - fitted.width) // 2
        py = 100 + (660 - fitted.height) // 2
        canvas.paste(fitted, (px, py))
        draw.rectangle((x, 100, x + 889, 759), outline="#454c43", width=1)
    destination = OUT / filename
    canvas.save(destination, optimize=True)
    a = images[0].resize((480, 320), Image.Resampling.LANCZOS).convert("L")
    b = images[1].resize((480, 320), Image.Resampling.LANCZOS).convert("L")
    mean_delta = ImageStat.Stat(ImageChops.difference(a, b)).mean[0]
    report.append({"file": filename, "before": list(images[0].size), "after": list(images[1].size), "meanPixelDelta0to255": round(mean_delta, 2)})
    print(f"ok {filename}: {images[0].size} -> {images[1].size}, mean delta {mean_delta:.2f}")
(SHOTS / "comparison-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"Generated {len(report)} comparisons in {OUT}")
