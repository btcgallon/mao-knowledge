# -*- coding: utf-8 -*-
"""把抓下来的 HTML 转成结构化文本（标题/日期/卷/正文分段/注释）。"""
import os, re, json, html

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "_src", "raw")
OUT = os.path.join(ROOT, "corpus")
os.makedirs(OUT, exist_ok=True)

# ---------- 1. 从首页确定每篇所属卷 ----------
idx = open(os.path.join(ROOT, "_src", "index.htm"), "rb").read().decode("gb18030", "ignore")
vol_map = {}
cur_vol = ""
for m in re.finditer(r"<h4>(.*?)</h4>|<a href=[\"']([^\"']+)[\"'][^>]*>(.*?)</a>", idx, re.S):
    if m.group(1):
        t = re.sub(r"<[^>]+>", "", m.group(1))
        t = re.sub(r"\s+", "", t)
        if "第" in t and "卷" in t:
            cur_vol = t
    else:
        href = m.group(2)
        if href.startswith(("marxist.org-chinese-mao-", "mia-chinese-mao-")):
            vol_map.setdefault(href.replace("/", "_"), cur_vol)

# 手工兜底：按日期归卷
def guess_vol(fn):
    m = re.search(r"(\d{4})(\d{2})?(\d{2})?", fn)
    if not m:
        return ""
    y, mo = int(m.group(1)), int(m.group(2) or 1)
    v = (y, mo)
    if v < (1937, 7):   return "第一卷"
    if v < (1941, 3):   return "第二卷"
    if v < (1945, 8):   return "第三卷"
    if v < (1949, 10):  return "第四卷"
    return "第五卷"

def clean(s):
    s = re.sub(r"<a [^>]*><sup>\[\d+\]</sup></a>", "", s)   # 去掉脚注标记
    s = re.sub(r"<script.*?</script>", "", s, flags=re.S)
    s = re.sub(r"<style.*?</style>", "", s, flags=re.S)
    s = re.sub(r"<br\s*/?>", "\n", s)
    s = re.sub(r"</p>|</h\d>|</blockquote>|</div>", "\n", s)
    s = re.sub(r"<[^>]+>", "", s)
    s = html.unescape(s)
    s = s.replace("\u3000", " ").replace("\xa0", " ")
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s.strip()

docs = []
files = sorted(os.listdir(RAW))
for fn in files:
    if not fn.endswith(".htm"):
        continue
    raw = open(os.path.join(RAW, fn), "rb").read().decode("gb18030", "ignore")
    mt = re.search(r"<title>(.*?)</title>", raw, re.S)
    title = html.unescape(re.sub(r"<[^>]+>", "", mt.group(1))).strip() if mt else fn

    # 去掉导航头
    body = raw
    body = re.sub(r"^.*?<hr[^>]*>", "", body, count=1, flags=re.S)
    body = re.sub(r"<a name='_ftn1'[\s\S]*$", "", body)   # 正文到此结束，后为注释

    # 日期
    md = re.search(r"<p class='date'>(.*?)</p>", body, re.S)
    date = clean(md.group(1)) if md else ""

    # 题注
    note = ""
    mb = re.search(r"<blockquote>(.*?)</blockquote>", body, re.S)
    if mb:
        note = clean(mb.group(1))

    # 分节
    sections = []
    parts = re.split(r"<h3[^>]*>(.*?)</h3>", body, flags=re.S)
    sections.append({"heading": "", "text": clean(parts[0])})
    for i in range(1, len(parts), 2):
        sections.append({"heading": clean(parts[i]), "text": clean(parts[i + 1]) if i + 1 < len(parts) else ""})
    # 若首段只剩标题/日期，保留但标记
    plain = "\n".join((s["heading"] + "\n" if s["heading"] else "") + s["text"] for s in sections)
    plain = re.sub(r"\n{3,}", "\n\n", plain).strip()
    chars = len(re.sub(r"\s", "", plain))
    vol = vol_map.get(fn) or guess_vol(fn)

    docs.append({
        "id": re.sub(r"\.htm$", "", fn),
        "file": fn,
        "title": title,
        "date": date,
        "volume": re.sub(r"\s+", "", vol),
        "note": note,
        "chars": chars,
        "sections": sections,
        "text": plain,
        "source": "https://www.marxists.org/chinese/maozedong/" + fn.replace("_", "/", 0) if False else fn,
    })

docs.sort(key=lambda d: d["id"])
json.dump(docs, open(os.path.join(OUT, "corpus.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)

# 纯文本合并
tot = 0
with open(os.path.join(OUT, "全文本.md"), "w", encoding="utf-8") as f:
    for d in docs:
        f.write("\n\n# 《%s》\n\n%s\n\n%s\n" % (d["title"], d["date"], d["text"]))
        tot += d["chars"]
print("docs=%d chars=%d" % (len(docs), tot))
from collections import Counter
print(Counter(d["volume"] for d in docs).most_common())
print("empty:", [d["id"] for d in docs if d["chars"] < 500][:20])
