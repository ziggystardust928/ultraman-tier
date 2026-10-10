"""Parse the Japanese Wikipedia 各話リスト table (fetched via weblio.jp mirror)."""
import json
import re
import sys
from lxml import html


def cell_text(el):
    txt = el.text_content()
    # collapse the internal newlines produced by <br> / block elements
    parts = [p.strip() for p in re.split(r"[\r\n]+", txt)]
    parts = [p for p in parts if p and p != "\u3000"]
    return " / ".join(parts) if parts else ""


def main(path, out):
    doc = html.parse(path)
    root = doc.getroot()
    tables = root.xpath('//table[contains(@class,"wikitable")]')
    target = None
    for t in tables:
        head = " ".join(cell_text(th) for th in t.xpath(".//th"))
        if "\u8a71\u6570" in head and "\u30b5\u30d6\u30bf\u30a4\u30c8\u30eb" in head:
            target = t
            break
    if target is None:
        print("TABLE NOT FOUND; tables:", len(tables))
        for t in tables[:10]:
            print("  header:", " | ".join(cell_text(th) for th in t.xpath(".//th"))[:200])
        sys.exit(1)

    headers = [cell_text(th) for th in target.xpath("./thead//th")] or [
        cell_text(th) for th in target.xpath(".//tr[1]/th")
    ]
    rows = target.xpath(".//tr")
    ncols = len(headers)
    carry = {}  # col index -> [remaining, value]
    out_rows = []
    for tr in rows:
        cells = tr.xpath("./td|./th")
        if not cells or all(c.tag == "th" for c in cells):
            continue
        values = [None] * ncols
        # fill carried rowspan values
        for idx, (remaining, val) in list(carry.items()):
            if idx < ncols:
                values[idx] = val
            carry[idx] = [remaining - 1, val]
            if carry[idx][0] <= 0:
                del carry[idx]
        col = 0
        for c in cells:
            while col < ncols and values[col] is not None:
                col += 1
            if col >= ncols:
                break
            val = cell_text(c)
            values[col] = val
            rs = c.get("rowspan")
            if rs:
                try:
                    n = int(rs)
                except ValueError:
                    n = 1
                if n > 1:
                    carry[col] = [n - 1, val]
            col += 1
        out_rows.append(values)

    with open(out, "w", encoding="utf-8") as f:
        json.dump({"headers": headers, "rows": out_rows}, f, ensure_ascii=False, indent=1)
    print("headers:", headers)
    print("rows:", len(out_rows))
    for r in out_rows[:3]:
        print(r)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
