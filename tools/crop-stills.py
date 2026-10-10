#!/usr/bin/env python
"""
从 B 站视频快照雪碧图里裁出一帧，作为分集剧照。

输入：data/raw/videoshot-<series>.json（由 tools/fetch-videoshot.mjs 生成）
输出：public/img/<series>/ep/<nn>.webp（320x180）

帧的选择：取雪碧图约 62% 处那一行、第 5 列。这个位置通常落在剧集中后段，
比开头（片头/黑场）和结尾（下集预告）更可能是正片画面。集号做一点微调，
避免所有缩略图都卡在同一秒。

用法：python tools/crop-stills.py [--only tiga]
"""
import json
import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
argv = sys.argv[1:]
only = argv[argv.index("--only") + 1] if "--only" in argv else None

SERIES = [s for s in ("tiga", "dyna", "gaia") if not only or s == only]

OUT_W, OUT_H = 480, 360  # 4:3 出图（原片就是 4:3）


def trim_black(frame, thresh=16, margin=2):
    """裁掉修复版的左右/上下黑边。逐列逐行看平均亮度，太暗的判为黑边。"""
    g = np.asarray(frame.convert("L"), dtype=np.float32)

    cols = np.where(g.mean(axis=0) > thresh)[0]
    rows = np.where(g.mean(axis=1) > thresh)[0]
    if len(cols) < 10 or len(rows) < 10:
        return frame

    l = max(0, cols[0] - margin)
    r = min(frame.width, cols[-1] + 1 + margin)
    t = max(0, rows[0] - margin)
    b = min(frame.height, rows[-1] + 1 + margin)
    return frame.crop((l, t, r, b))


def to_43(frame):
    """按 4:3 居中裁切，再缩放到固定尺寸。"""
    w, h = frame.size
    target = OUT_W / OUT_H
    if w / h > target:
        nw = int(h * target)
        left = (w - nw) // 2
        frame = frame.crop((left, 0, left + nw, h))
    else:
        nh = int(w / target)
        top = (h - nh) // 2
        frame = frame.crop((0, top, w, top + nh))
    return frame.resize((OUT_W, OUT_H), Image.LANCZOS)


total = 0
failed = []

for sid in SERIES:
    manifest_path = ROOT / "data" / "raw" / f"videoshot-{sid}.json"
    if not manifest_path.exists():
        print(f"{sid}: 缺清单，跳过")
        continue

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    out_dir = ROOT / "public" / "img" / sid / "ep"
    out_dir.mkdir(parents=True, exist_ok=True)

    ok = 0
    for m in manifest:
        sheet_file = m.get("sheetFile")
        if not sheet_file or not Path(sheet_file).exists():
            failed.append((sid, m["no"], "无雪碧图"))
            continue
        try:
            im = Image.open(sheet_file).convert("RGB")
            W, H = im.size
            cols = m.get("cols") or 10
            fw = m.get("frameW") or W // cols
            fh = m.get("frameH") or int(fw * 9 / 16)
            rows = max(1, H // fh)

            # 大约 62% 处，集号做 0/1/2 行的微调，避免所有缩略图卡在同一秒
            row = int(rows * 0.62) - 1 + (m["no"] % 3)
            row = max(0, min(rows - 1, row))
            col = min(cols - 1, 4)

            box = (col * fw, row * fh, (col + 1) * fw, (row + 1) * fh)
            frame = to_43(trim_black(im.crop(box)))

            out = out_dir / f"{m['no']:02d}.webp"
            frame.save(out, "WEBP", quality=82, method=5)
            ok += 1
        except Exception as e:  # noqa: BLE001
            failed.append((sid, m["no"], str(e)[:60]))

    size = sum(f.stat().st_size for f in out_dir.glob("*.webp"))
    print(f"{sid}: 裁出 {ok}/{len(manifest)} 张，{size / 1024:.0f} KB")
    total += ok

print(f"\n合计 {total} 张真实分集剧照（{OUT_W}x{OUT_H}，已去黑边）")
if failed:
    print(f"失败 {len(failed)} 张：")
    for sid, no, why in failed[:8]:
        print(f"  {sid} 第{no}话: {why}")
