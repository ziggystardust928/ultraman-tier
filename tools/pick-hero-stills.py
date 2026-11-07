#!/usr/bin/env python
"""
从雪碧图里挑「最帅气/最有氛围感」的 4 帧作为首页拼贴素材。

上一版只从「每集一张剧照」里挑，结果选出来全是昏暗的室内对话戏和道具特写 ——
因为评分只看了「暗 + 有彩色亮点」，而特摄里那种画面通常是实验室场景。

这一版改成扫描雪碧图里的**全部帧**（每集约 60 帧，全书约 2.4 万帧），
评分也换成更贴合「帅气名场面」的指标：

  1. 对比度   —— 戏剧光（逆光、光束、暗场里的发光体）
  2. 边缘密度 —— 动作、皮套纹理、怪兽鳞甲，画面越「有内容」越高
  3. 色彩饱满 —— Hasler-Süsstrunk colorfulness
  4. 中心主体 —— 中间区域的细节密度相对四周的比值，特摄构图主体基本居中
  5. 反过曝   —— 大面积死白（纯光效/转场帧）扣分

产物：
  data/raw/hero-stills.json           每部剧选中的帧（集号 + 帧序号 + 分数）
  public/img/<series>/hero/1..4.webp  480x300 横图
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SERIES = [
    "tiga", "dyna", "gaia",
    "neos", "cosmos", "nexus", "max", "mebius", "sevenx", "ugmmb", "ugmmb2",
]
PICK = 4
OUT_W, OUT_H = 480, 300
COLS = 10


def score_frames(sheet_path: Path):
    """返回 [(score, frame_index, frame_rgb_array)]。"""
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

    # 降采样后算指标，快很多
    small = frames[:, ::6, ::6, :].astype(np.float32)
    lum = small @ np.array([0.299, 0.587, 0.114], dtype=np.float32)

    contrast = lum.std(axis=(1, 2))
    # 边缘密度（简单差分梯度）
    gy = np.abs(np.diff(lum, axis=1)).mean(axis=(1, 2))
    gx = np.abs(np.diff(lum, axis=2)).mean(axis=(1, 2))
    edge = gx + gy

    rg = small[:, :, :, 0] - small[:, :, :, 1]
    yb = 0.5 * (small[:, :, :, 0] + small[:, :, :, 1]) - small[:, :, :, 2]
    colorful = np.sqrt(rg.std(axis=(1, 2)) ** 2 + yb.std(axis=(1, 2)) ** 2) + 0.3 * np.sqrt(
        rg.mean(axis=(1, 2)) ** 2 + yb.mean(axis=(1, 2)) ** 2
    )

    # 中心主体 vs 四周
    h2, w2 = lum.shape[1], lum.shape[2]
    cy0, cy1 = int(h2 * 0.22), int(h2 * 0.78)
    cx0, cx1 = int(w2 * 0.25), int(w2 * 0.75)
    center = lum[:, cy0:cy1, cx0:cx1].std(axis=(1, 2))
    border_mask = np.ones((h2, w2), bool)
    border_mask[cy0:cy1, cx0:cx1] = False
    border = np.array([f[border_mask].std() for f in lum])

    overexposed = (lum > 235).mean(axis=(1, 2))

    # 肤色占比：人物特写（尤其人脸）细节多、对比强，很容易被上面的指标误判成「有氛围」。
    # 特摄的帅气画面应该是皮套 / 怪兽 / 爆炸 / 光束，所以看到大面积肤色就扣分。
    r, g, b = small[:, :, :, 0], small[:, :, :, 1], small[:, :, :, 2]
    skin = (
        (r > 95) & (g > 42) & (b > 20) & (r > g) & (r > b) & (np.abs(r - g) > 15) & (np.abs(r - b) > 15)
    ).mean(axis=(1, 2))

    # 主体占比：中间比四周细节多，说明是「一个大家伙占满画面」而不是空旷远景
    center_edge = np.abs(np.diff(lum[:, cy0:cy1, cx0:cx1], axis=1)).mean(axis=(1, 2))

    def norm(x, lo, hi):
        return np.clip((x - lo) / (hi - lo), 0, 1)

    s = (
        0.30 * norm(contrast, 8, 58)
        + 0.26 * norm(edge, 1.2, 9.5)
        + 0.20 * norm(colorful, 6, 46)
        + 0.12 * norm(center / (border + 1e-3), 0.8, 2.4)
        + 0.12 * norm(center_edge, 0.8, 6.0)
        - 0.25 * norm(overexposed, 0.12, 0.5)
        - 0.60 * norm(skin, 0.10, 0.40)
        # 死黑帧（转场）直接压低
        - 0.30 * (1 - norm(contrast, 3, 12))
    )

    out = []
    for i in range(frames.shape[0]):
        out.append((float(s[i]), i, frames[i], fh, fw))
    return out


def to_16x10(frame: np.ndarray) -> Image.Image:
    im = Image.fromarray(frame)
    w, h = im.size
    target = OUT_W / OUT_H
    if w / h > target:
        nw = int(h * target)
        left = (w - nw) // 2
        im = im.crop((left, 0, left + nw, h))
    else:
        nh = int(w / target)
        top = (h - nh) // 2
        im = im.crop((0, top, w, top + nh))
    return im.resize((OUT_W, OUT_H), Image.LANCZOS)


def trim_bars(im: Image.Image, thresh: int = 14) -> Image.Image:
    """裁掉 4:3 原片在 16:9 帧里的左右黑边。"""
    g = np.asarray(im.convert("L"), dtype=np.float32)
    cols = np.where(g.mean(axis=0) > thresh)[0]
    if len(cols) < 20:
        return im
    return im.crop((cols[0], 0, cols[-1] + 1, im.height))


report = {}

for sid in SERIES:
    sheet_dir = ROOT / ".cache" / "videoshot" / sid
    if not sheet_dir.exists():
        print(f"{sid}: 无雪碧图缓存，跳过")
        continue

    candidates = []
    for sheet in sorted(sheet_dir.glob("*.jpg")):
        ep = int(sheet.stem)
        frames = score_frames(sheet)
        if not frames:
            continue
        # 只取每集 12%~88% 区间的帧：
        # 开头是 OP/标题卡、结尾是 ED/下集预告，那些帧常常带大量字幕和演职员表，
        # 之前没限制，结果首页挑出来一堆「監修 高野宏一」这种字幕帧。
        n = len(frames)
        lo, hi = int(n * 0.12), int(n * 0.88)
        for sc, idx, frame, fh, fw in frames[lo:hi]:
            candidates.append((sc, ep, idx, frame))

    if not candidates:
        print(f"{sid}: 无可用帧")
        continue

    candidates.sort(reverse=True, key=lambda x: x[0])

    # 选 4 张，两个约束：
    #   1. 必须来自不同集数
    #   2. 彼此不能太像（用降采样后的颜色直方图做距离）——
    #      否则会出现「4 张全是爆炸」这种，虽然单张都够帅但没有版面变化
    def fingerprint(a: np.ndarray) -> np.ndarray:
        small = np.asarray(Image.fromarray(a).resize((16, 10), Image.BILINEAR), dtype=np.float32)
        hist, _ = np.histogramdd(
            small.reshape(-1, 3), bins=(4, 4, 4), range=((0, 256), (0, 256), (0, 256))
        )
        v = hist.ravel()
        return v / (np.linalg.norm(v) + 1e-6)

    picks = []
    used_eps = set()
    picked_fp = []
    for c in candidates:
        if c[1] in used_eps:
            continue
        fp = fingerprint(c[3])
        # 与已选帧的直方图相似度（1=完全相同）
        if any(float(fp @ p) > 0.92 for p in picked_fp):
            continue
        picks.append(c)
        picked_fp.append(fp)
        used_eps.add(c[1])
        if len(picks) == PICK:
            break

    # 兜底：凑不满就放宽去重
    if len(picks) < PICK:
        for c in candidates:
            if all(c[1] != p[1] or c[2] != p[2] for p in picks):
                picks.append(c)
            if len(picks) == PICK:
                break

    out_dir = ROOT / "public" / "img" / sid / "hero"
    out_dir.mkdir(parents=True, exist_ok=True)
    # 覆盖写即可，不删旧文件 —— 预览服务/PWA 可能正占着，删会报 WinError 32
    for old in out_dir.glob("*.webp"):
        if int(old.stem) > PICK:
            try:
                old.unlink()
            except OSError:
                pass

    info = []
    for i, (sc, ep, idx, frame) in enumerate(picks, 1):
        img = trim_bars(Image.fromarray(frame))
        to_16x10(np.asarray(img)).save(out_dir / f"{i}.webp", "WEBP", quality=86, method=5)
        info.append({"no": ep, "frame": idx, "score": round(sc, 3)})

    report[sid] = info
    print(f"{sid:<8} " + "  ".join(f"第{d['no']}话#f{d['frame']}({d['score']})" for d in info))

(ROOT / "data" / "raw" / "hero-stills.json").write_text(
    json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8"
)
print(f"\n共 {len(report)} 部剧 × {PICK} 张 → public/img/<series>/hero/")
