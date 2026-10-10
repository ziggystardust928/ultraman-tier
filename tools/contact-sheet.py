#!/usr/bin/env python
"""把某部剧的全部分集剧照拼成一张总览图，方便一次性检查取帧质量。"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
sid = sys.argv[1] if len(sys.argv) > 1 else "tiga"
cols = int(sys.argv[2]) if len(sys.argv) > 2 else 8

files = sorted((ROOT / "public" / "img" / sid / "ep").glob("*.webp"))
if not files:
    print("没有剧照")
    raise SystemExit(1)

tw, th = 160, 90
rows = (len(files) + cols - 1) // cols
sheet = Image.new("RGB", (cols * tw, rows * (th + 14)), (14, 14, 16))
draw = ImageDraw.Draw(sheet)

for i, f in enumerate(files):
    im = Image.open(f).convert("RGB").resize((tw, th), Image.LANCZOS)
    x = (i % cols) * tw
    y = (i // cols) * (th + 14)
    sheet.paste(im, (x, y))
    draw.text((x + 3, y + th + 1), f.stem, fill=(200, 200, 210))

out = ROOT / ".cache" / f"contact-{sid}.png"
out.parent.mkdir(parents=True, exist_ok=True)
sheet.save(out, "PNG", optimize=True)
print(f"{out}  ({sheet.width}x{sheet.height}, {len(files)} 张)")
