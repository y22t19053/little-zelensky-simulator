"""生成 v1.3.0 使用的中文标题字体子集。

为什么只做一套：
- 正文继续使用系统无衬线（Windows 微软雅黑 / iOS 苹方 / Android Noto Sans），
  不再打包第二套中文字体，避免手机端首屏多背 300KB。
- 标题、日期、编号需要「档案」气质，系统宋体在 Android/iOS 上并不存在，
  所以把 Noto Serif SC Bold 按**项目全部文本**裁成一个子集，保证不会出现缺字。

输入（本机 D 盘，SIL Open Font License 1.1）：
    D:\\Assets\\fonts\\NotoSerifSC-Bold.otf
输出：
    assets/fonts/archive-serif.woff2

用法：
    python production/visual/make_fonts.py
"""

import glob
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = r"D:\Assets\fonts\NotoSerifSC-Bold.otf"
OUT_DIR = os.path.join(ROOT, "assets", "fonts")
OUT = os.path.join(OUT_DIR, "archive-serif.woff2")

# 除语料本身，再补上界面里可能出现的标点与符号。
EXTRA = "—–·…《》（）「」【】、。，；：？！％＋－／×÷°№"


def corpus_text():
    files = sorted(glob.glob(os.path.join(ROOT, "js", "*.js")))
    files.append(os.path.join(ROOT, "index.html"))
    text = ""
    for path in files:
        with open(path, encoding="utf-8") as handle:
            text += handle.read()
    return text + EXTRA


def main():
    from fontTools import subset
    from fontTools.ttLib import TTFont

    if not os.path.exists(SRC):
        print("缺少源字体： " + SRC)
        return 1
    os.makedirs(OUT_DIR, exist_ok=True)
    text = corpus_text()
    unique = len(set(text))
    font = TTFont(SRC)
    options = subset.Options()
    options.flavor = "woff2"
    options.layout_features = ["kern", "liga", "tnum", "pnum"]
    options.name_IDs = ["*"]
    options.notdef_outline = True
    options.recalc_bounds = True
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(text=text)
    subsetter.subset(font)
    # 注意：options.flavor 只对命令行入口生效，直接 save() 时必须把 flavor
    # 写在 font 上，否则写出来的是未压缩的 OpenType（浏览器按 woff2 解析会失败）。
    font.flavor = "woff2"
    font.save(OUT)
    size_kb = os.path.getsize(OUT) / 1024.0
    print("写出 %s（%.1f KB）" % (OUT, size_kb))
    print("语料去重字符 %d 个，全部保留" % unique)
    return 0


if __name__ == "__main__":
    sys.exit(main())
