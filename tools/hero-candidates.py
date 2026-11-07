#!/usr/bin/env python
"""
给每部剧生成一张「候选帧拼图」，交给视觉挑选，再用 hero-apply.py 落地。

自动评分只能保证「暗调/高对比/有色彩」，但判断不了「这张帅不帅」——
之前几轮调参分别挑出了昏暗对话戏、演职员字幕、时钟特写。
所以机器只做粗筛（每部挑 24 个候选，避开片头片尾、去掉过于相似的），
最终 4 张由人/视觉模型从拼图里选。

产物：
  .cache/pick/<series>.png    4 列 × 6 行候选拼图，每格左上角标了序号
  .cache/pick/<series>.json   序号 → {集号, 帧号} 映射
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SERIES = [
    "tiga", "dyna", "gaia",
    "neos", "cosmos", "nexus", "max", "mebius", "sevenx", "ugmmb", "ugmmb2",
]
CANDIDATES = 24
COLS = 10
CELL_W, CELL_H = 320, 180


def score_frames(sheet_path: Path):
    im = Image.open(sheet_path).convert("RGB")
    a = np.asarray(im, dtype=np.uint8)
    H, W, _ = a.shape
    fw = W // COLS
    fh = int(fw * 9 / 16) or 1
    rows = H // fh
    if rows < 1:
        return []
    a = a[: rows * fh, : COLS * fw]
    frames = a.reshape(rows, fh, COLS, fw, 3).transpose(0, 2, 1, 3, 4).reshape(rows * COLS, fh, fw, 3)

    small = frames[:, ::6, ::6, :].astype(np.float32)
    lum = small @ np.array([0.299, 0.587, 0.114], dtype=np.float32)

    contrast = lum.std(axis=(1, 2))
    edge = np.abs(np.diff(lum, axis=1)).mean(axis=(1, 2)) + np.abs(np.diff(lum, axis=2)).mean(axis=(1, 2))

    rg = small[:, :, :, 0] - small[:, :, :, 1]
    yb = 0.5 * (small[:, :, :, 0] + small[:, :, :, 1]) - small[:, :, :, 2]
    colorful = np.sqrt(rg.std(axis=(1, 2)) ** 2 + yb.std(axis=(1, 2)) ** 2) + 0.3 * np.sqrt(
        rg.mean(axis=(1, 2)) ** 2 + yb.mean(axis=(1, 2)) ** 2
    )

    overexposed = (lum > 235).mean(axis=(1, 2))
    r, g, b = small[:, :, :, 0], small[:, :, :, 1], small[:, :, :, 2]
    skin = (
        (r > 95) & (g > 42) & (b > 20) & (r > g) & (r > b) & (np.abs(r - g) > 15) & (np.abs(r - b) > 15)
    ).mean(axis=(1, 2))

    def norm(x, lo, hi):
        return np.clip((x - lo) / (hi - lo), 0, 1)

    s = (
        0.34 * norm(contrast, 8, 58)
        + 0.30 * norm(edge, 1.2, 9.5)
        + 0.24 * norm(colorful, 6, 46)
        - 0.22 * norm(overexposed, 0.12, 0.5)
        - 0.22 * norm(skin, 0.12, 0.42)
        - 0.30 * (1 - norm(contrast, 3, 12))
    )
    return [(float(s[i]), i, frames[i]) for i in range(frames.shape[0])]


def fingerprint(a: np.ndarray) -> np.ndarray:
    small = np.asarray(Image.fromarray(a).resize((16, 10), Image.BILINEAR), dtype=np.float32)
    hist, _ = np.histogramdd(small.reshape(-1, 3), bins=(4, 4, 4), range=((0, 256), (0, 256), (0, 256)))
    v = hist.ravel()
    return v / (np.linalg.norm(v) + 1e-6)


def to_16x10(frame: np.ndarray, w: int, h: int) -> Image.Image:
    im = Image.fromarray(frame)
    iw, ih = im.size
    target = w / h
    if iw / ih > target:
        nw = int(ih * target)
        left = (iw - nw) // 2
        im = im.crop((left, 0, left + nw, ih))
    else:
        nh = int(iw / target)
        top = (ih - nh) // 2
        im = im.crop((0, top, iw, top + nh))
    return im.resize((w, h), Image.LANCZOS)


pick_dir = ROOT / ".cache" / "pick"
pick_dir.mkdir(parents=True, exist_ok=True)

for sid in SERIES:
    sheet_dir = ROOT / ".cache" / "videoshot" / sid
    if not sheet_dir.exists():
        print(f"{sid}: 无缓存")
        continue

    cands = []
    for sheet in sorted(sheet_dir.glob("*.jpg")):
        ep = int(sheet.stem)
        frames = score_frames(sheet)
        if not frames:
            continue
        n = len(frames)
        lo, hi = int(n * 0.12), int(n * 0.88)   # 避开 OP/ED
        for sc, idx, frame in frames[lo:hi]:
            cands.append((sc, ep, idx, frame))

    cands.sort(reverse=True, key=lambda x: x[0])

    chosen = []
    used_eps, fps = set(), []
    for c in cands:
        if c[1] in used_eps:
            continue
        fp = fingerprint(c[3])
        if any(float(fp @ p) > 0.90 for p in fps):
            continue
        chosen.append(c)
        fps.append(fp)
        used_eps.add(c[1])
        if len(chosen) == CANDIDATES:
            break

    rows = (len(chosen) + 4 - 1) // 4
    sheet = Image.new("RGB", (CELL_W * 4, CELL_H * rows), (10, 10, 11))
    draw = ImageDraw.Draw(sheet)
    for i, (sc, ep, idx, frame) in enumerate(chosen):
        x = (i % 4) * CELL_W
        y = (i // 4) * CELL_H
        sheet.paste(to_16x10(frame, CELL_W, CELL_H), (x, y))
        draw.rectangle([x, y, x + 26, y + 16], fill=(0, 0, 0))
        draw.text((x + 4, y + 3), str(i), fill=(255, 255, 255))
    sheet.save(pick_dir / f"{sid}.png")

    (pick_dir / f"{sid}.json").write_text(
        json.dumps(
            [{"i": i, "no": c[1], "frame": c[2], "score": round(c[0], 3)} for i, c in enumerate(chosen)],
            ensure_ascii=False,
            indent=1,
        ),
        encoding="utf-8",
    )
    print(f"{sid:<8} {len(chosen)} 个候选 → .cache/pick/{sid}.png")

print("\n下一步：看图选出每部 4 个序号，写进 .cache/pick/choice.json 后跑 hero-apply.py")
