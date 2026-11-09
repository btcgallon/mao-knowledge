# -*- coding: utf-8 -*-
"""为 51 条方法论各生成 2 个日常工作案例，供「每日一则」使用。断点续跑。"""
import json, os, sys, time, re, threading
from concurrent.futures import ThreadPoolExecutor
import urllib.request

BASE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(BASE)
OUT = os.path.join(ROOT, "corpus", "daily_cases.json")
METHODS = json.load(open(os.path.join(ROOT, "corpus", "methods.json"), encoding="utf-8"))


def load_key():
    for f in [os.path.join(BASE, ".env.local")]:
        try:
            for line in open(f, encoding="utf-8"):
                if line.startswith("DEEPSEEK_API_KEY="):
                    return line.split("=", 1)[1].strip()
        except Exception:
            pass
    return os.environ.get("DEEPSEEK_API_KEY", "")


KEY = load_key()
URL = "https://api.deepseek.com/chat/completions"
lock = threading.Lock()

SYS = "你是一名懂管理、也懂人情世故的职场教练。你写的案例要像真人真事：有具体的人、具体的数字、具体的冲突，不要鸡汤，不要口号。"

TPL = """方法论：{name}
它解决什么问题：{hook}
照着做的步骤：{steps}

请写 2 个「日常工作/生活」案例，用来演示这条方法论怎么用。要求：
1. 场景必须不同：一个偏职场（团队、客户、跨部门、上下级），一个偏生活（家庭、朋友、邻里、个人选择）。
2. story 80—140 字：谁、什么处境、具体冲突、卡在哪。要有数字或具体细节，不要「小王很努力」这种空话。
3. how 60—100 字：按上面步骤，说清这个人具体做了什么动作（先说什么话、先办哪件事），落到可执行的层面。
4. 不要提到毛泽东、革命、战争、政治，不要出现「毛主席说」。
5. 全部简体中文，不带 markdown。

输出 JSON：
{{"cases":[{{"scene":"职场","title":"12字以内","story":"...","how":"..."}},{{"scene":"生活","title":"...","story":"...","how":"..."}}]}}"""


def call(m):
    body = {
        "model": "deepseek-chat",
        "messages": [{"role": "system", "content": SYS},
                     {"role": "user", "content": TPL.format(
                         name=m["name"], hook=m.get("hook", ""),
                         steps=" → ".join(m.get("steps") or []))}],
        "temperature": 0.75,
        "max_tokens": 900,
        "response_format": {"type": "json_object"},
    }
    req = urllib.request.Request(URL, data=json.dumps(body).encode("utf-8"),
                                 headers={"Content-Type": "application/json",
                                          "Authorization": "Bearer " + KEY})
    with urllib.request.urlopen(req, timeout=90) as r:
        data = json.loads(r.read().decode("utf-8"))
    txt = data["choices"][0]["message"]["content"]
    obj = json.loads(txt)
    cases = obj.get("cases") or []
    out = []
    for c in cases[:2]:
        if not c.get("story") or not c.get("how"):
            continue
        out.append({"scene": c.get("scene", ""), "title": c.get("title", "")[:20],
                    "story": c["story"].strip(), "how": c["how"].strip()})
    return out


def main():
    done = {}
    if os.path.exists(OUT):
        done = json.load(open(OUT, encoding="utf-8"))
    todo = [m for m in METHODS if m["id"] not in done or len(done[m["id"]]) < 2]
    print("待生成", len(todo), "条", flush=True)

    def work(m):
        for attempt in range(3):
            try:
                r = call(m)
                if len(r) >= 2:
                    with lock:
                        done[m["id"]] = r
                        json.dump(done, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
                    print("ok", m["id"], m["name"], flush=True)
                    return
            except Exception as e:
                print("retry", m["id"], str(e)[:80], flush=True)
                time.sleep(2)
        print("FAIL", m["id"], m["name"], flush=True)

    with ThreadPoolExecutor(max_workers=6) as ex:
        list(ex.map(work, todo))
    json.dump(done, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("总计", len(done), "/", len(METHODS), flush=True)


if __name__ == "__main__":
    main()
