"""Extract the 各話リスト table into a grid, honouring both rowspan and colspan."""
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


def clean(s):
    if s is None:
        return None
    s = FOOTNOTE.sub("", s)
    s = s.replace("\u3000", " ")
    return re.sub(r"\s+", " ", s).strip() or None


def find_table(path, want):
    doc = html.parse(path)
    for t in doc.getroot().xpath("//table"):
        head = " ".join(cell_text(th) for th in t.xpath(".//th"))
        if all(w in head for w in want):
            return t
    return None


def grid(t):
    """Expand the table into a rectangular grid honouring rowspan/colspan."""
    out = []          # list of [cell_text_or_None]
    occupied = {}     # (row, col) -> text  (from spans)
    rows = [tr for tr in t.xpath(".//tr") if tr.xpath("./td|./th")]
    occupied = {}
    for ri, tr in enumerate(rows):
        gridrow = {}
        for (r, c), v in list(occupied.items()):
            if r == ri:
                gridrow[c] = v
        col = 0
        for cell in tr.xpath("./td|./th"):
            while col in gridrow:
                col += 1
            txt = cell_text(cell)
            try:
                cs = int(cell.get("colspan") or 1)
            except ValueError:
                cs = 1
            try:
                rs = int(cell.get("rowspan") or 1)
            except ValueError:
                rs = 1
            for dc in range(cs):
                gridrow[col + dc] = txt
                for dr in range(1, rs):
                    occupied[(ri + dr, col + dc)] = txt
            col += cs
        ncols = max(gridrow) + 1 if gridrow else 0
        out.append([gridrow.get(c) for c in range(ncols)])
    return out


def main(path, out):
    t = find_table(path, ["話数", "サブタイトル", "脚本", "監督"])
    if t is None:
        sys.exit("table not found")
    g = grid(t)
    ncols = max(len(r) for r in g)
    g = [r + [None] * (ncols - len(r)) for r in g]
    headers = [clean(c) for c in g[0]]
    body = [r for r in g[1:] if any(x is not None for x in r)]
    print("headers:", headers)
    print("data rows:", len(body))
    recs = []
    for r in body:
        rec = {headers[i] if i < len(headers) and headers[i] else f"col{i}": clean(r[i]) for i in range(ncols)}
        recs.append(rec)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(recs, f, ensure_ascii=False, indent=1)
    for rec in recs:
        print(" | ".join(f"{k}={v}" for k, v in rec.items()))
    print("saved", out)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
