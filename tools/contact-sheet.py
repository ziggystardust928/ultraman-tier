#!/usr/bin/env python
"""
把一批图片拼成一张总览图，一次性检查素材质量（省 token，不用逐张看）。

用法：
  python tools/contact-sheet.py tiga                      # 迪迦分集剧照
  python tools/contact-sheet.py .cache/design-candidates/tiga --cols 8
  python tools/contact-sheet.py <目录> [--cols N] [--out 名字]
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
argv = sys.argv[1:]
if not argv:
    print(__doc__)
    raise SystemExit(1)

target = argv[0]
cols = int(argv[argv.index("--cols") + 1]) if "--cols" in argv else 8
outname = argv[argv.index("--out") + 1] if "--out" in argv else None

# 传剧集 id 时走默认剧照目录
if target in ("tiga", "dyna", "gaia") and not Path(target).exists():
    directory = ROOT / "public" / "img" / target / "ep"
else:
    directory = Path(target)
    if not directory.is_absolute():
        directory = ROOT / directory

files = sorted(p for p in directory.glob("*.webp"))
if not files:
    files = sorted(directory.glob("*.jpg")) + sorted(directory.glob("*.png"))
if not files:
    print(f"{directory} 里没有图片")
    raise SystemExit(1)

tw, th = 170, 170
rows = (len(files) + cols - 1) // cols
sheet = Image.new("RGB", (cols * tw, rows * (th + 14)), (14, 14, 16))
draw = ImageDraw.Draw(sheet)

for i, f in enumerate(files):
    im = Image.open(f).convert("RGB")
    # 居中裁成正方形再缩放，保持总览整齐
    w, h = im.size
    s = min(w, h)
    im = im.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s)).resize((tw, th), Image.LANCZOS)
    x = (i % cols) * tw
    y = (i // cols) * (th + 14)
    sheet.paste(im, (x, y))
    draw.text((x + 3, y + th + 1), f.stem, fill=(200, 200, 210))

label = outname or f"contact-{directory.name}"
out = ROOT / ".cache" / f"{label}.png"
out.parent.mkdir(parents=True, exist_ok=True)
sheet.save(out, "PNG", optimize=True)
print(f"{out}  ({sheet.width}x{sheet.height}, {len(files)} 张)")
