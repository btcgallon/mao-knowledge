# -*- coding: utf-8 -*-
"""逐篇拆书：调用 DeepSeek，抽取 主旨/困境/原话/史实/方法论。
用法: python analyze_articles.py [--limit N] [--ids a,b] [--workers 5]
可断点续跑：已存在且合法的 out 文件会跳过。
"""
import os, re, json, sys, time, argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "analysis")
os.makedirs(OUT, exist_ok=True)
ENV = os.path.join(HERE, ".env.local")

def get_key():
    if os.environ.get("DEEPSEEK_API_KEY"):
        return os.environ["DEEPSEEK_API_KEY"].strip()
    try:
        for line in open(ENV, encoding="utf-8"):
            if line.startswith("DEEPSEEK_API_KEY="):
                return line.split("=", 1)[1].strip()
    except FileNotFoundError:
        pass
    raise SystemExit("没有 Key：设环境变量 DEEPSEEK_API_KEY，或写在 _src/.env.local")

KEY = get_key()
API = "https://api.deepseek.com/chat/completions"

SYSTEM = """你是研究毛泽东著作与中共党史的学者，擅长把历史文本拆成「结论原话—历史史实—可迁移方法论」。
你的输出必须是严格 JSON，不要解释、不要 markdown 代码块。"""

PROMPT = """请拆解下面这篇毛泽东的文章《{title}》（{date}）。

【全文】
{body}

【输出 JSON，字段如下】
{{
 "gist": "一句话主旨，30字以内，必须是判断句",
 "situation": "当时面对的具体困境：敌我态势/争论焦点/要解决什么问题，60字以内，要具体到人、事、时间",
 "quotes": [
   {{"text": "逐字摘自原文的一段话，15-100字", "role": "结论|原则|方法|警示", "note": "这句话在说什么，20字内"}}
 ],
 "facts": ["史实要点：时间/地点/人物/决策/结果，每条40字以内"],
 "methods": [
   {{"name": "抽象成可迁移的工作方法，动词开头，10字以内", "how": "本文如何体现，40字以内", "transfer": "这个动作在非军事场景对应什么，25字以内"}}
 ],
 "tags": ["从这些里选1-4个：调查研究,军事,统一战线,组织建设,哲学认识论,经济工作,宣传文风,群众工作,党的建设,战略判断"]
}}

【硬要求】
1. quotes 必须逐字复制原文片段，一个字都不能改；不要合并两句话，不要加省略号；3-6 条，优先选能当"结论/原则"的句子。
2. facts 必须是本文提到或直接对应的历史事实，不要编造。
3. methods 2-4 条，要抽象到任何行业都能用（例如"集中优势兵力，各个歼灭敌人"→"集中资源打歼灭战"）。
4. 全部用简体中文。"""

def call(title, date, body):
    payload = {
        "model": "deepseek-chat",
        "messages": [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": PROMPT.format(title=title, date=date, body=body[:24000])},
        ],
        "temperature": 0.3,
        "max_tokens": 2200,
        "response_format": {"type": "json_object"},
    }
    r = requests.post(API, headers={"Authorization": "Bearer " + KEY, "Content-Type": "application/json"},
                      data=json.dumps(payload, ensure_ascii=False).encode("utf-8"), timeout=180)
    r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"]

def norm(s):
    return re.sub(r"[\s\u3000“”\"'‘’]", "", s or "")

def run_one(doc, retry=2):
    dst = os.path.join(OUT, doc["id"] + ".json")
    if os.path.exists(dst):
        try:
            old = json.load(open(dst, encoding="utf-8"))
            if old.get("gist") and old.get("quotes"):
                return doc["id"], "skip"
        except Exception:
            pass
    err = None
    for att in range(retry + 1):
        try:
            txt = call(doc["title"], doc["date"], doc["text"])
            data = json.loads(txt)
            src = norm(doc["text"])
            good = []
            for q in data.get("quotes", []):
                t = (q.get("text") or "").strip()
                if len(t) < 8:
                    continue
                if norm(t) in src:
                    q["verified"] = True
                    good.append(q)
                else:
                    # 容错：去掉首尾标点再试
                    t2 = norm(t).strip("。，、；：！？")
                    if t2 and t2 in src:
                        q["text"] = t2
                        q["verified"] = True
                        good.append(q)
            data["quotes"] = good
            data["id"] = doc["id"]
            data["title"] = doc["title"]
            data["date"] = doc["date"]
            data["volume"] = doc["volume"]
            data["chars"] = doc["chars"]
            data["quote_hit"] = len(good)
            json.dump(data, open(dst, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
            return doc["id"], "ok:%d/%d" % (len(good), len(data.get("quotes", [])))
        except Exception as e:
            err = e
            time.sleep(3 * (att + 1))
    return doc["id"], "FAIL:%s" % err

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--ids", default="")
    ap.add_argument("--workers", type=int, default=5)
    args = ap.parse_args()

    docs = json.load(open(os.path.join(ROOT, "corpus", "corpus.json"), encoding="utf-8"))
    wl = json.load(open(os.path.join(ROOT, "corpus", "worklist.json"), encoding="utf-8"))
    keep = {w["id"] for w in wl}
    docs = [d for d in docs if d["id"] in keep]
    if args.ids:
        ids = set(args.ids.split(","))
        docs = [d for d in docs if d["id"] in ids]
    docs.sort(key=lambda d: d["chars"])
    if args.limit:
        docs = docs[: args.limit]
    print("to process", len(docs), flush=True)

    ok = fail = skip = 0
    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        futs = {ex.submit(run_one, d): d for d in docs}
        for i, f in enumerate(as_completed(futs), 1):
            did, st = f.result()
            if st.startswith("ok"): ok += 1
            elif st == "skip": skip += 1
            else: fail += 1; print("FAIL", did, st, flush=True)
            if i % 10 == 0:
                print("%d/%d ok=%d skip=%d fail=%d" % (i, len(docs), ok, skip, fail), flush=True)
    print("DONE ok=%d skip=%d fail=%d" % (ok, skip, fail))

if __name__ == "__main__":
    main()
