"""Build per-episode source bundles: ja-wiki table row + monster-article plot text + zh table row."""
import json
import re
import sys
from lxml import html

np_ = re.compile(r"\[[^\]]*\]")


def cell_text(el):
    txt = el.text_content()
    parts = [p.strip() for p in re.split(r"[\r\n]+", txt)]
    parts = [p for p in parts if p and p != "\u3000"]
    return " ".join(parts)


def find_table(path, key):
    doc = html.parse(path)
    for t in doc.getroot().xpath("//table"):
        head = " ".join(cell_text(th) for th in t.xpath(".//th"))
        if key in head:
            return t
    return None


def grid(t):
    rows = [tr for tr in t.xpath(".//tr") if tr.xpath("./td|./th")]
    occupied, out = {}, []
    for ri, tr in enumerate(rows):
        grow = {c: v for (r, c), v in occupied.items() if r == ri}
        col = 0
        for cell in tr.xpath("./td|./th"):
            while col in grow:
                col += 1
            txt = cell_text(cell)
            cs = int(cell.get("colspan") or 1)
            rs = int(cell.get("rowspan") or 1)
            for dc in range(cs):
                grow[col + dc] = txt
                for dr in range(1, rs):
                    occupied[(ri + dr, col + dc)] = txt
            col += cs
        out.append([grow.get(c) for c in range(max(grow) + 1 if grow else 0)])
    n = max(len(r) for r in out)
    return [r + [None] * (n - len(r)) for r in out], [c for c in out[0]]


def main(ja_path, zh_path, mon_path, out_path):
    ja, jh = grid(find_table(ja_path, "サブタイトル"))
    ja = [dict(zip([h or f"c{i}" for i, h in enumerate(jh)], r)) for r in ja[1:] if r[0] and r[0].strip().isdigit()]

    # ---- zh (moegirl) ----
    zt = find_table(zh_path, "中文标题")
    zh = []
    if zt is not None:
        zg, zh_h = grid(zt)
        zh = [dict(zip([h or f"c{i}" for i, h in enumerate(zh_h)], r)) for r in zg[1:] if r and r[0] and "话" in (r[0] or "")]
    zhmap = {}
    for i, r in enumerate(zh, 1):
        zhmap[i] = r

    # ---- monster article: per-episode plot text ----
    doc = html.parse(mon_path)
    root = doc.getroot()
    best = None
    for div in root.xpath("//div"):
        hs = div.xpath(".//h2|.//h3")
        if len(hs) > (len(best.xpath(".//h2|.//h3")) if best is not None else 0):
            best = div
    lines = []
    for el in best.iter():
        if el.tag in ("p", "li", "dd", "h2", "h3"):
            t = " ".join(el.text_content().split())
            if t:
                lines.append((el.tag, t))
    STOP = ("デザイン", "スーツアクター", "演：", "別名", "身長", "体重", "出身地", "諸元", "脚注", "出典")
    mon_by_ep = {n: [] for n in range(1, 52)}
    for idx, (tag, txt) in enumerate(lines):
        m = re.finditer(r"第(\d{1,2})話", txt)
        eps = {int(x.group(1)) for x in m}
        if not eps:
            continue
        # gather following narration lines of the same paragraph group
        chunk = [txt]
        for tag2, t2 in lines[idx + 1: idx + 8]:
            if tag2 in ("h2", "h3") or t2.startswith(STOP):
                break
            if re.search(r"第\d{1,2}話", t2) and len(chunk) > 1:
                break
            chunk.append(t2)
            if sum(len(c) for c in chunk) > 1400:
                break
        body = " ".join(chunk)
        for e in eps:
            if 1 <= e <= 51:
                mon_by_ep[e].append(np_.sub("", body))

    out = []
    for i, row in enumerate(ja, 1):
        out.append({
            "no": i,
            "title_ja": np_.sub("", row.get("サブタイトル") or "").strip(),
            "writer": (row.get("脚本") or "").strip(),
            "director": (row.get("監督") or "").strip(),
            "sfx_director": (row.get("特技監督") or "").strip(),
            "air_raw": (row.get("放送日") or "").strip(),
            "monsters_ja": [x.strip() for x in (row.get("登場怪獣・宇宙人") or "").split(" / ") if x.strip()],
            "monster_plot_ja": mon_by_ep[i],
            "zh_row": {k: v for k, v in (zhmap.get(i) or {}).items() if v},
        })
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print("episodes:", len(out))
    print("zh rows:", len(zh), "zh headers:", zh_h if zt is not None else None)
    for r in out[:2]:
        print(r["no"], r["title_ja"], r["zh_row"])


if __name__ == "__main__":
    main(*sys.argv[1:5])
