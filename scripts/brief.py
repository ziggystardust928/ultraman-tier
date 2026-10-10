"""Produce a compact, cleaned per-episode briefing for writing synopses."""
import json
import re
import sys

d = json.load(open(sys.argv[1], encoding="utf-8"))
out = []
for e in d:
    n = e["no"]
    title = e["title_ja"]
    seen, paras = set(), []
    for p in e["monster_plot_ja"]:
        p = re.sub(r"\s+", " ", p).strip()
        if not p or p in seen:
            continue
        # keep only material about THIS series / this episode
        if "『" in p and title not in p:
            continue
        if re.search(r"ウルトラマン(ギンガ|オメガ|デッカー|トリガー|ゼット|タイガ|オーブ|X|R/B|ゼロ)", p) and title not in p:
            continue
        if f"第{n}話" not in p and f"第{n}・" not in p and f"・第{n}話" not in p:
            continue
        seen.add(p)
        paras.append(p[:650])
    out.append({"no": n, "title_ja": title, "writer": e["writer"], "director": e["director"],
                "air": e["air_raw"], "monsters": e["monsters_ja"],
                "zh": e["zh_row"].get("中文标题"), "paras": paras[:3]})

with open(sys.argv[2], "w", encoding="utf-8") as f:
    for e in out:
        f.write(f"### EP{e['no']:02d} {e['title_ja']} | zh={e['zh']} | W={e['writer']} D={e['director']} | {e['air']}\n")
        f.write("MONSTERS: " + " ; ".join(e["monsters"]) + "\n")
        for p in e["paras"]:
            f.write("  - " + p + "\n")
        if not e["paras"]:
            f.write("  - (no episode-specific wiki text)\n")
        f.write("\n")
print("wrote", sys.argv[2], "episodes:", len(out))
print("episodes without wiki plot text:", [e["no"] for e in out if not e["paras"]])
