# -*- coding: utf-8 -*-
"""抓取中文马克思主义文库《毛泽东选集》全文（经 Clash 代理）。"""
import os, re, time, json
import requests

BASE = "https://www.marxists.org/chinese/maozedong/"
ROOT = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(ROOT, "raw")
os.makedirs(RAW, exist_ok=True)
# 需要科学上网时改这个，或设环境变量 HTTP_PROXY
PX = os.environ.get("HTTP_PROXY") or os.environ.get("HTTPS_PROXY") or ""
PROXY = {"http": PX, "https": PX} if PX else None

raw = open(os.path.join(ROOT, "index.htm"), "rb").read().decode("gb18030", "ignore")
links = re.findall(r'<a href=["\']([^"\']+)["\'][^>]*>(.*?)</a>', raw, re.S)
items = []
seen = set()
for href, title in links:
    title = re.sub(r"<[^>]+>", "", title).strip()
    if not (href.startswith("marxist.org-chinese-mao-") or href.startswith("mia-chinese-mao-")):
        continue
    if href in seen:
        continue
    seen.add(href)
    items.append({"href": href, "title": title, "file": href.replace("/", "_")})

print("total", len(items))
sess = requests.Session()
if PROXY: sess.proxies.update(PROXY)
sess.headers.update({"User-Agent": "Mozilla/5.0"})
ok = fail = 0
for i, it in enumerate(items):
    dst = os.path.join(RAW, it["file"])
    if os.path.exists(dst) and os.path.getsize(dst) > 3000:
        ok += 1
        continue
    try:
        r = sess.get(BASE + it["href"], timeout=45)
        r.encoding = "gb18030"
        if r.status_code == 200 and len(r.text) > 1000:
            open(dst, "w", encoding="gb18030", errors="ignore").write(r.text)
            ok += 1
        else:
            fail += 1
            print("BAD", r.status_code, it["href"])
    except Exception as e:
        fail += 1
        print("ERR", it["href"], e)
    time.sleep(0.4)
    if i % 20 == 0:
        print(i, ok, fail, flush=True)

json.dump(items, open(os.path.join(ROOT, "manifest.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("DONE ok=%d fail=%d" % (ok, fail))
