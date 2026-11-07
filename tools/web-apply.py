#!/usr/bin/env python
"""
按 choice.json 把选中的网络图落地成首页拼贴素材。

choice.json 形如：
  { "tiga": { "design": 12, "suit": 2 }, "gaia": { "design": null, "suit": 5 }, ... }

序号对应 .cache/websheet/<sid>.png 里的标签编号，
映射关系来自 .cache/webimg/<sid>-{suit,cool,design}/ 的排序（同一套排序规则）。

产物：
  public/img/<series>/web/design.webp   设计稿（统一 480x300 横图，cover 裁切）
  public/img/<series>/web/suit.webp     皮套展示
"""
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
GROUPS = ("suit", "cool", "design")
OUT_W, OUT_H = 480, 300


def items_for(sid: str):
    """和 web-candidates-sheet.py 完全一致的枚举顺序。"""
    items = []
    for grp in GROUPS:
        d = ROOT / ".cache" / "webimg" / f"{sid}-{grp}"
        if not d.exists():
            continue
        for f in sorted(d.glob("*")):
            if f.suffix.lower() not in (".jpg", ".jpeg", ".png", ".webp"):
                continue
            items.append((grp, f))
    return items


def cover(im: Image.Image) -> Image.Image:
    im = im.convert("RGB")
    w, h = im.size
    target = OUT_W / OUT_H
    if w / h > target:
        nw = int(h * target)
        im = im.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
    else:
        nh = int(w / target)
        im = im.crop((0, (h - nh) // 2, w, (h - nh) // 2 + nh))
    return im.resize((OUT_W, OUT_H), Image.LANCZOS)


choice_path = ROOT / ".cache" / "pick" / "web-choice.json"
if not choice_path.exists():
    raise SystemExit(f"缺 {choice_path} —— 先让挑选结果写进这个文件")

choice = json.loads(choice_path.read_text(encoding="utf-8"))
ok = 0

for sid, sel in choice.items():
    items = items_for(sid)
    out_dir = ROOT / "public" / "img" / sid / "web"
    out_dir.mkdir(parents=True, exist_ok=True)

    for kind in ("design", "suit"):
        idx = sel.get(kind)
        if idx is None or idx < 0 or idx >= len(items):
            print(f"{sid:<8} {kind}: 跳过（无可选）")
            continue
        grp, f = items[idx]
        try:
            cover(Image.open(f)).save(out_dir / f"{kind}.webp", "WEBP", quality=86, method=5)
            print(f"{sid:<8} {kind}: #{idx} [{grp}] {f.name} → public/img/{sid}/web/{kind}.webp")
            ok += 1
        except Exception as e:
            print(f"{sid:<8} {kind}: 失败 {e}")

print(f"\n共落地 {ok} 张")
