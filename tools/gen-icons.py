#!/usr/bin/env python
"""
生成 PWA 应用图标。

从官方海报里裁出迪迦头部那块（辨识度最高，缩到 192px 还看得清），
再按 PWA 要求出普通图标和 maskable 图标。

maskable 的规则：系统会按各种形状裁切，只有中心 80% 的圆内是安全区，
所以内容要缩到 80% 并居中放在实色底上。

用法：python tools/gen-icons.py
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "icons"
OUT.mkdir(parents=True, exist_ok=True)

BG = (10, 10, 11)

# 海报是 440x586，迪迦的头部大致在这个方形区域内
HEAD_BOX = (108, 236, 424, 552)

poster = Image.open(ROOT / "public" / "img" / "tiga" / "cover.webp").convert("RGB")
head = poster.crop(HEAD_BOX)
print(f"海报 {poster.size} → 头部裁切 {head.size}")


def save(img: Image.Image, name: str, size: int) -> None:
    img.resize((size, size), Image.LANCZOS).save(OUT / name, "PNG", optimize=True)
    print(f"  {name:26} {size}x{size}  {(OUT / name).stat().st_size / 1024:.1f} KB")


# 普通图标：直接方形缩放
square = head.resize((512, 512), Image.LANCZOS)
save(square, "icon-192.png", 192)
save(square, "icon-512.png", 512)

# maskable：内容缩到 80%，居中放在实色底上
inner = int(512 * 0.8)
maskable = Image.new("RGB", (512, 512), BG)
maskable.paste(head.resize((inner, inner), Image.LANCZOS), ((512 - inner) // 2, (512 - inner) // 2))
save(maskable, "icon-maskable-512.png", 512)

# iOS 主屏图标
save(square, "apple-touch-icon.png", 180)

# 启动图 / 分享图用的横版
save(head, "icon-1024.png", 1024)
