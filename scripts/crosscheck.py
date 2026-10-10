"""Cross-check ja-Wikipedia 各話リスト (via weblio mirror) against ladyeve 放映リスト."""
import json
import re
import sys
from lxml import html

FOOTNOTE = re.compile(r"\[[^\]]*\]")


def cell_text(el):
    txt = el.text_content()
    parts = [p.strip() for p in re.split(r"[\r\n]+", txt)]
    parts = [p for p in parts if p and p != "\u3000"]
    return " / ".join(parts) if parts else ""


def parse_table(path, want):
    doc = html.parse(path)
    root = doc.getroot()
    for t in root.xpath('//table'):
        head = " ".join(cell_text(th) for th in t.xpath(".//th"))
        if all(w in head for w in want):
            return t
    return None


def rows_of(t, ncols):
    carry = {}
    out = []
    for tr in t.xpath(".//tr"):
        cells = tr.xpath("./td")
        if not cells:
            continue
        values = [None] * ncols
        for idx, (remaining, val) in list(carry.items()):
            values[idx] = val
            carry[idx] = [remaining - 1, val]
            if carry[idx][0] <= 0:
                del carry[idx]
        col = 0
        nreal = 0
        for c in cells:
            while col < ncols and values[col] is not None:
                col += 1
            if col >= ncols:
                break
            values[col] = cell_text(c)
            nreal += 1
            rs = c.get("rowspan")
            if rs:
                try:
                    n = int(rs)
                except ValueError:
                    n = 1
                if n > 1:
                    carry[col] = [n - 1, values[col]]
            col += 1
        out.append((values, nreal, len(cells)))
    return out


def clean(s):
    if s is None:
        return None
    s = FOOTNOTE.sub("", s)
    return re.sub(r"\s+", " ", s).strip()


# ---- weblio (ja.wikipedia) ----
wt = parse_table(sys.argv[1], ["話数", "サブタイトル", "脚本", "監督"])
wr = rows_of(wt, 8)
print("weblio rows:", len(wr))
for i, (v, nreal, ncell) in enumerate(wr, 1):
    if nreal != ncell or any(x is None for x in v[:7]):
        print("  WARN row", v[0], "real:", nreal, "cells:", ncell, v)

# ---- ladyeve ----
lt = parse_table(sys.argv[2], ["話数", "サブタイトル", "脚本", "監督"])
lr = rows_of(lt, 7)
print("ladyeve rows:", len(lr))

print("\n=== compare (no | wiki_title | ladyeve_title | WIKI writer/dir | LADY writer/dir) ===")
for i in range(min(len(wr), len(lr))):
    w = wr[i][0]
    l = lr[i][0]
    print(
        f"{w[0]:>3} | {clean(w[1])} | {clean(l[2])} | {clean(w[3])} / {clean(w[4])} | {clean(l[3])} / {clean(l[4])}"
    )

dump = {
    "weblio": [
        {
            "no": clean(v[0]),
            "title": clean(v[1]),
            "monsters": clean(v[2]),
            "writer": clean(v[3]),
            "director": clean(v[4]),
            "sfx_director": clean(v[5]),
            "air_raw": clean(v[6]),
            "rating": clean(v[7]),
        }
        for v, _, _ in wr
    ],
    "ladyeve": [
        {
            "no": clean(v[0]),
            "air_raw": clean(v[1]),
            "title": clean(v[2]),
            "writer": clean(v[3]),
            "director": clean(v[4]),
            "sfx_director": clean(v[5]),
        }
        for v, _, _ in lr
    ],
}
with open(sys.argv[3], "w", encoding="utf-8") as f:
    json.dump(dump, f, ensure_ascii=False, indent=1)
print("\nsaved", sys.argv[3])
