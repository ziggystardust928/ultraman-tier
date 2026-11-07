#!/usr/bin/env python
"""
把 .cache/webimg/<sid>-{suit,cool,design} 的候选图拼成一张带编号的对照图，
方便人工/视觉模型挑选。

产物：.cache/websheet/<series>.png（4 列，每格左上角编号 + 类别）
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SERIES = [
    "tiga", "dyna", "gaia",
    "neos", "cosmos", "nexus", "max", "mebius", "sevenx", "ugmmb", "ugmmb2",
]
GROUP_LABEL = {"suit": "皮套", "cool": "帅气", "design": "设计稿"}
CELL_W, CELL_H = 300, 300
COLS = 4

out_dir = ROOT / ".cache" / "websheet"
out_dir.mkdir(parents=True, exist_ok=True)

for sid in SERIES:
    items = []
    for grp in ("suit", "cool", "design"):
        d = ROOT / ".cache" / "webimg" / f"{sid}-{grp}"
        if not d.exists():
            continue
        for f in sorted(d.glob("*")):
            if f.suffix.lower() not in (".jpg", ".jpeg", ".png", ".webp"):
                continue
            items.append((grp, f))

    if not items:
        print(f"{sid}: 无候选")
        continue

    rows = (len(items) + COLS - 1) // COLS
    sheet = Image.new("RGB", (CELL_W * COLS, CELL_H * rows), (10, 10, 11))
    draw = ImageDraw.Draw(sheet)

    for i, (grp, f) in enumerate(items):
        try:
            im = Image.open(f).convert("RGB")
        except Exception:
            continue
        im.thumbnail((CELL_W, CELL_H), Image.LANCZOS)
        x = (i % COLS) * CELL_W + (CELL_W - im.width) // 2
        y = (i // COLS) * CELL_H + (CELL_H - im.height) // 2
        sheet.paste(im, (x, y))
        # 编号标在左上角
        tag = f"{i} {GROUP_LABEL[grp]}"
        draw.rectangle([(i % COLS) * CELL_W, (i // COLS) * CELL_H, (i % COLS) * CELL_W + 10 + 13 * len(tag), (i // COLS) * CELL_H + 18], fill=(0, 0, 0))
        draw.text(((i % COLS) * CELL_W + 5, (i // COLS) * CELL_H + 3), tag, fill=(255, 255, 255))

    sheet.save(out_dir / f"{sid}.png")
    print(f"{sid:<8} {len(items)} 张候选 → .cache/websheet/{sid}.png")
