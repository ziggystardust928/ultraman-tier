#!/usr/bin/env python
"""
从官方海报里裁出「头部细节」和「胸口/彩色计时器细节」两张特写。

首页的拼贴墙（模仿 Radiohead Public Library）需要每部剧有多种素材：
封面 / 剧照 / 设计稿 / 头部细节 / 计时器细节。
封面和剧照已有，设计稿只有 3 部有，
头部和计时器这两张可以从海报直接裁出来 —— 每部剧都有，而且是真素材。

裁切区域按海报比例取，再用亮度找主体，避免裁到纯黑边。

产物：public/img/<series>/detail/head.webp 和 chest.webp（各 320x320）
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SERIES = [
    "tiga", "dyna", "gaia",
    "neos", "cosmos", "nexus", "max", "mebius", "sevenx", "ugmmb", "ugmmb2",
]
OUT_SIZE = 320


def trim_dark(im: Image.Image, thresh: int = 12) -> Image.Image:
    """裁掉四周纯黑边（海报常有黑底）。"""
    g = np.asarray(im.convert("L"), dtype=np.float32)
    cols = np.where(g.mean(axis=0) > thresh)[0]
    rows = np.where(g.mean(axis=1) > thresh)[0]
    if len(cols) < 10 or len(rows) < 10:
        return im
    return im.crop((max(0, cols[0]), max(0, rows[0]), min(im.width, cols[-1] + 1), min(im.height, rows[-1] + 1)))


def square_crop(im: Image.Image, cx: float, cy: float, size_ratio: float) -> Image.Image:
    """以 (cx, cy) 为中心裁一个正方形。cx/cy/size_ratio 都是相对比例。"""
    w, h = im.size
    side = int(min(w, h) * size_ratio)
    left = int(w * cx - side / 2)
    top = int(h * cy - side / 2)
    left = max(0, min(w - side, left))
    top = max(0, min(h - side, top))
    return im.crop((left, top, left + side, top + side))


total = 0
for sid in SERIES:
    cover_path = ROOT / "public" / "img" / sid / "cover.webp"
    if not cover_path.exists():
        print(f"{sid}: 缺封面，跳过")
        continue

    im = trim_dark(Image.open(cover_path).convert("RGB"))
    out_dir = ROOT / "public" / "img" / sid / "detail"
    out_dir.mkdir(parents=True, exist_ok=True)

    # 头部：上半部居中区域
    head = square_crop(im, 0.5, 0.34, 0.52).resize((OUT_SIZE, OUT_SIZE), Image.LANCZOS)
    head.save(out_dir / "head.webp", "WEBP", quality=84, method=5)

    # 胸口/彩色计时器：中段居中区域。
    # 之前用 cy=0.60 太高，海报里的主体大多是站立全身像，
    # 0.60 处已经到了腰部甚至下摆，裁出来常常还是头/肩 —— 改成 0.46。
    chest = square_crop(im, 0.5, 0.46, 0.40).resize((OUT_SIZE, OUT_SIZE), Image.LANCZOS)
    chest.save(out_dir / "chest.webp", "WEBP", quality=84, method=5)

    total += 1

print(f"共 {total} 部剧，各生成 head.webp / chest.webp")
