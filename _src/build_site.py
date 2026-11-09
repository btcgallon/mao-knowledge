# -*- coding: utf-8 -*-
"""组装站点数据 kb.js"""
import json, os, re, glob

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = os.path.join(ROOT, "site")
os.makedirs(SITE, exist_ok=True)

corpus = json.load(open(os.path.join(ROOT, "corpus", "corpus.json"), encoding="utf-8"))
work = {w["id"]: w for w in json.load(open(os.path.join(ROOT, "corpus", "worklist.json"), encoding="utf-8"))}
methods = json.load(open(os.path.join(ROOT, "corpus", "methods.json"), encoding="utf-8"))
cases = json.load(open(os.path.join(ROOT, "_src", "cases.json"), encoding="utf-8"))

analysis = {}
for f in glob.glob(os.path.join(ROOT, "analysis", "*.json")):
    try:
        a = json.load(open(f, encoding="utf-8"))
        analysis[a["id"]] = a
    except Exception:
        pass

# 校验战例引语：逐篇比对（不能把全库拼成一串，否则会跨篇误命中）
def norm(s):
    return re.sub(r"[^一-龥A-Za-z0-9]", "", s or "")

def exact(s):
    return re.sub(r"[\s　]+", "", s or "")

def doc_label(d):
    t = re.sub(r"[（(][^）)]*[）)]\s*$", "", d["title"]).strip()
    m = re.search(r"(\d{4})", d["id"])
    y = m.group(1) if m else ""
    return (t + "（" + y + "）") if t.startswith("《") else "《" + t + "》" + y

def locate(q):
    qe, qn = exact(q), norm(q)
    if not qn:
        return None, "none"
    ex = [d for d in corpus if qe and qe in exact(d["text"])]
    if ex:
        return ex[0], "exact"
    nm = [d for d in corpus if qn in norm(d["text"])]
    if nm:
        return (nm[0] if len(nm) == 1 else None), "normalized"
    return None, "none"

for c in cases:
    d, how = locate(c.get("quote"))
    c["quote_match"] = how
    c["quote_verified"] = how != "none"
    if d and not c.get("quote_src"):
        c["quote_src"] = doc_label(d)
    if not c.get("quote_src"):
        c["quote_src"] = "库外引文（未在《选集》中核到）"

arts = []
for c in corpus:
    if c["id"] not in work:
        continue
    a = analysis.get(c["id"], {})
    title = re.sub(r"^毛泽东[:：]\s*", "", c["title"])
    arts.append({
        "id": c["id"], "title": title, "date": c["date"],
        "volume": work[c["id"]]["volume"], "chars": c["chars"],
        "note": c["note"] if len(c["note"]) <= 500 else "",
        "gist": a.get("gist", ""), "situation": a.get("situation", ""),
        "quotes": a.get("quotes", []), "facts": a.get("facts", []),
        "methods": a.get("methods", []), "tags": a.get("tags", []),
        "text": c["text"],
    })

def datekey(a):
    m = re.search(r"(\d{4})(\d{2})?(\d{2})?", a["id"])
    return int((m.group(1) or "0") + (m.group(2) or "00") + (m.group(3) or "00")) if m else 9_999_999

arts.sort(key=datekey)
kb = {
    "meta": {
        "title": "毛泽东方法论 · 拆书知识库",
        "articles": len(arts),
        "chars": sum(a["chars"] for a in arts),
        "methods": len(methods),
        "cases": len(cases),
        "built": "2026-11-06",
        "source": "中文马克思主义文库《毛泽东选集》1—5卷电子全文",
    },
    "methods": methods,
    "cases": cases,
    "articles": arts,
}
p = os.path.join(SITE, "kb.js")
with open(p, "w", encoding="utf-8") as f:
    f.write("window.KB=")
    json.dump(kb, f, ensure_ascii=False, separators=(",", ":"))
    f.write(";")
print("kb.js %.1f MB" % (os.path.getsize(p) / 1e6))
print("articles", len(arts), "with_analysis", sum(1 for a in arts if a["gist"]))
print("case quotes verified", sum(1 for c in cases if c["quote_verified"]), "/", len(cases))
