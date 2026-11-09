# -*- coding: utf-8 -*-
"""为方法论卡片从原文中定位逐字原话（v3：按段落/句子边界取）。"""
import json, re, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
docs = json.load(open(os.path.join(ROOT, "corpus", "corpus.json"), encoding="utf-8"))
seeds = json.load(open(os.path.join(ROOT, "_src", "methods_seed.json"), encoding="utf-8"))

BAD = re.compile(r"（一九|（19|\*|这是毛泽东|编者按|^[一二三四五六七八九十]+[、.]|^第[一二三四五六七八九十]+节")

def sentences(para):
    return [s.strip() for s in re.split(r"(?<=[。！？])", para) if s.strip()]

def pick(para, hint):
    ss = sentences(para)
    for i, s in enumerate(ss):
        if hint in s:
            if BAD.search(s) or len(s) < 14:
                # 跟下一句拼
                if i + 1 < len(ss) and not BAD.search(ss[i + 1]):
                    s = s + ss[i + 1]
                elif i > 0 and not BAD.search(ss[i - 1]):
                    s = ss[i - 1] + s
            if BAD.search(s):
                continue
            return s.strip(" 　")
    return None

def plain(s):
    return re.sub(r"[^\u4e00-\u9fa5A-Za-z0-9]", "", s or "")

def doc_label(d):
    """\u628a\u7bc7\u76ee\u53d8\u6210\u300a\u7bc7\u540d\u300b\u5e74\u4efd\uff1b\u7bc7\u540d\u672c\u8eab\u5df2\u5e26\u4e66\u540d\u53f7\u65f6\u7528\uff08\u5e74\u4efd\uff09\u3002"""
    t = re.sub(r"[\uff08(][^\uff09)]*[\uff09)]\s*$", "", d["title"]).strip()
    m = re.search(r"(\d{4})", d["id"])
    y = m.group(1) if m else ""
    return (t + "\uff08" + y + "\uff09") if t.startswith("\u300a") else "\u300a" + t + "\u300b" + y

out, miss, fixed = [], [], []
for m in seeds:
    hint = m.get("quote_hint", "").strip()
    quote = m.get("quote", "").strip()
    src_id = ""
    if m.get("quote_id"):
        d = next((x for x in docs if x["id"] == m["quote_id"]), None)
        if d:
            quote, src_id = m["quote"], d["id"]
    elif hint:
        best = None
        for d in docs:
            if hint in d["text"]:
                score = sum(1 for k in re.findall(r"[\u4e00-\u9fa5]{2,}", m["src"]) if k in d["title"])
                if best is None or score > best[0]:
                    best = (score, d)
        if best:
            for para in best[1]["text"].split("\n"):
                if hint in para:
                    q = pick(para, hint)
                    if q:
                        quote, src_id = q, best[1]["id"]
                        break
    if not quote:
        miss.append(m["id"])
    mm = dict(m)
    mm["quote"] = quote
    mm["quote_verified"] = bool(src_id) or bool(m.get("manual_verified"))
    mm["quote_src_id"] = src_id
    # \u6807\u6ce8\u7684\u7bc7\u540d\u5fc5\u987b\u5c31\u662f\u5f15\u6587\u6240\u5728\u7bc7\uff0c\u5426\u5219\u9875\u9762\u4f1a\u81ea\u76f8\u77db\u76fe\uff08\u9876\u90e8\u5199 A \u7bc7\uff0c\u4e0b\u9762\u94fe\u63a5\u5230 B \u7bc7\uff09
    if quote and src_id:
        d = next((x for x in docs if x["id"] == src_id), None)
        names = re.findall(r"\u300a([^\u300b]+)\u300b", m.get("src") or "")
        if d and names:
            a = plain(names[0])
            b = plain(re.sub(r"[\uff08(][^\uff09)]*[\uff09)]\s*$", "", d["title"]))
            if not (b.startswith(a) or a.startswith(b)):
                src_seed = m["src"]
                mm["src_seed"] = src_seed
                mm["src"] = doc_label(d)
                mm["quote_note"] = "\u8fd9\u6761\u65b9\u6cd5\u4e00\u822c\u5f52\u5230%s\uff1b\u4e0b\u9762\u8fd9\u6bb5\u539f\u8bdd\u51fa\u81ea%s\u3002" % (src_seed, mm["src"])
                fixed.append((m["name"], src_seed, mm["src"]))
    out.append(mm)

json.dump(out, open(os.path.join(ROOT, "corpus", "methods.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("methods", len(out), "verified", sum(1 for x in out if x["quote_verified"]))
print("miss", miss)
print("src \u5df2\u5bf9\u9f50\u5f15\u6587\u51fa\u5904", len(fixed))
for x in fixed:
    print("  ", x[0], ":", x[1], "\u2192", x[2])
