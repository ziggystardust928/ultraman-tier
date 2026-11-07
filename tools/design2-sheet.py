#!/usr/bin/env python
"""为缺设计稿的 5 部剧生成「原始 + 补搜」候选对照图。"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
TARGETS = ["dyna", "neos", "sevenx", "ugmmb", "ugmmb2"]
CELL = 320
COLS = 4

out_dir = ROOT / ".cache" / "websheet2"
out_dir.mkdir(parents=True, exist_ok=True)

for sid in TARGETS:
    items = []
    for grp in ("design", "design2"):
        d = ROOT / ".cache" / "webimg" / f"{sid}-{grp}"
        if not d.exists():
            continue
        for f in sorted(d.glob("*")):
            if f.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp"):
                items.append((grp, f))
    if not items:
        print(f"{sid}: 无候选")
        continue

    rows = (len(items) + COLS - 1) // COLS
    sheet = Image.new("RGB", (CELL * COLS, CELL * rows), (10, 10, 11))
    draw = ImageDraw.Draw(sheet)
    for i, (grp, f) in enumerate(items):
        try:
            im = Image.open(f).convert("RGB")
        except Exception:
            continue
        im.thumbnail((CELL, CELL), Image.LANCZOS)
        x = (i % COLS) * CELL + (CELL - im.width) // 2
        y = (i // COLS) * CELL + (CELL - im.height) // 2
        sheet.paste(im, (x, y))
        tag = f"{i} {grp}"
        draw.rectangle([(i % COLS) * CELL, (i // COLS) * CELL, (i % COLS) * CELL + 8 + 8 * len(tag), (i // COLS) * CELL + 17], fill=(0, 0, 0))
        draw.text(((i % COLS) * CELL + 4, (i // COLS) * CELL + 3), tag, fill=(255, 255, 255))
    sheet.save(out_dir / f"{sid}.png")
    print(f"{sid:<8} {len(items)} 张 → .cache/websheet2/{sid}.png")
