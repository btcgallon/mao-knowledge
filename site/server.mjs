/* 毛泽东方法论 · 本地服务（静态站 + DeepSeek 诊断接口） */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { Readable } from "node:stream";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8099;
const ENV_FILE = path.join(__dirname, "..", "_src", ".env.local");
const API = "https://api.deepseek.com/chat/completions";

/* ---------- key ---------- */
function loadKey() {
  if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY;
  for (const f of [ENV_FILE]) {
    try {
      for (const line of fs.readFileSync(f, "utf8").split(/\r?\n/)) {
        if (line.startsWith("DEEPSEEK_API_KEY=")) return line.split("=").slice(1).join("=").trim();
      }
    } catch { }
  }
  return "";
}
const KEY = loadKey();

/* ---------- kb ---------- */
const KB = JSON.parse(fs.readFileSync(path.join(__dirname, "kb.js"), "utf8").replace(/^window\.KB=/, "").replace(/;$/, ""));

/* ---------- 每日一则 ---------- */
const DAILY_CASES = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "corpus", "daily_cases.json"), "utf8"));
const CONCEPTS = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "corpus", "concepts.json"), "utf8"));
const DAY = 86400000;
function dailyPack(dateStr) {
  const t = Date.parse(dateStr + "T00:00:00Z");
  const n = Number.isFinite(t) ? Math.floor(t / DAY) : Math.floor(Date.now() / DAY);
  const m = KB.methods[((n % KB.methods.length) + KB.methods.length) % KB.methods.length];
  const cs = DAILY_CASES[m.id] || [];
  const wc = cs.length ? cs[n % cs.length] : null;
  const cc = CONCEPTS[m.cat] || [];
  const concept = cc.length ? cc[n % cc.length] : null;
  const c = KB.cases[n % KB.cases.length];
  const q = KB.articles.flatMap(a => (a.quotes || []).map(x => ({ t: x.text, src: `《${a.title.replace(/（.*?）/g, "")}》${a.date || ""}` })));
  const quote = m.quote ? { t: m.quote, src: m.src } : (q.length ? q[Math.abs(n * 7) % q.length] : null);
  return {
    date: dateStr, // 第 n 天
    index: n,
    method: { id: m.id, name: m.name, cat: m.cat, hook: m.hook, quote: m.quote, src: m.src, steps: m.steps, fit: m.fit, risk: m.risk },
    workcase: wc,
    concept,
    fact: {
      name: c.name, time: c.time, place: c.place, situation: c.situation,
      decision: c.decision, result: c.result, lesson: c.lesson
    },
    quote,
  };
}

/* ---------- 检索 ---------- */
const STOP = new Set("我的你他她它是在了有不这那个就都而及与或一个上下来去说要会能可以自己人什么怎么因为所以但是如果还是已经现在时候对也被把让从到很没更多少些".split(""));
function grams(s) {
  const t = String(s || "").replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, "");
  const g = new Set();
  for (let i = 0; i < t.length - 1; i++) {
    const x = t.slice(i, i + 2);
    if (!STOP.has(x[0]) && !STOP.has(x[1])) g.add(x);
  }
  return g;
}
function score(query, target) {
  const a = grams(query), b = grams(target);
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n;
}
function pick(query, arr, weight, n) {
  return arr.map(x => ({ x, s: score(query, weight(x)) })).sort((p, q) => q.s - p.s).slice(0, n);
}

/* ---------- prompt ---------- */
function buildPrompt(situation) {
  const idx = KB.methods.map(m => `${m.id}|${m.name}|${m.hook}|${(m.steps || []).join("→")}`).join("\n");
  const topM = pick(situation, KB.methods, m => [m.name, m.hook, m.fit, m.risk, m.quote, m.cat].join(""), 12).map(r => r.x);
  const cards = topM.map(m => `【${m.name}】出处：${m.src}\n原话：${m.quote || "（无原文，后人概括）"}\n适配：${m.fit}\n风险：${m.risk}`).join("\n\n");
  const topA = pick(situation, KB.articles.filter(a => a.gist), a => [a.title, a.gist, a.situation, (a.tags || []).join("")].join(""), 5).map(r => r.x);
  const arts = topA.map(a => `《${a.title.replace(/（.*?）/g, "")}》主旨：${a.gist}；情境：${a.situation}`).join("\n");

  return `【方法论索引】（id|名称|解决什么问题|步骤）
${idx}

【可选原文卡片】
${cards}

【可参考的历史场景】
${arts}

【用户困境】
${situation}`;
}

const SYSTEM = `你是一名冷静、务实的决策顾问，唯一的知识体系是毛泽东的方法论。你不喊口号、不做政治评价、不复述宏大叙事，只做三件事：看清形势、选对方法、给出可执行动作。语气克制、具体、有分寸，像一个见过事的老参谋。`;

const INSTR = `请基于上面的方法论，拆解用户的困境。输出严格 JSON（不要 markdown）：
{
 "read": {
   "main": "这件事的主要矛盾是什么，一句话，必须具体到人/事/利益",
   "friends": "谁是你的同盟、谁是对手、谁是观望的中间派，各自为什么",
   "balance": "双方力量对比：你强在哪、弱在哪、时间站在谁那边",
   "trap": "你正在被拖进什么节奏，对方想让你干什么"
 },
 "methods": [
   {"id":"必须来自上面的索引 id","name":"方法名","why":"为什么这条对得上，必须引用用户的具体细节","quote":"从可选卡片里原样复制一句，没有就留空","source":"出处"}
 ],
 "plan": [
   {"title":"24小时内","action":"今晚/明天能做的具体动作，含话术或数字"},
   {"title":"这周","action":"..."},
   {"title":"长期","action":"..."}
 ],
 "counter": ["对方最可能怎么破，你怎么接；写2-4条"],
 "avoid": ["现在绝对不要做的2-3件事"],
 "line": "一句话总结，30字以内，不要模仿毛的口吻"
}
硬要求：
1. methods 选 1-3 条，不要贪多；宁可选一条真正对得上的。
2. why 和 action 里必须出现用户困境中的具体人或事，不能写通用套话。
3. quote 只能从【可选原文卡片】里逐字复制；没有合适的就留空字符串，绝不编造。
4. 不涉及阶级斗争、路线斗争等与用户场景无关的政治内容。
5. 全部简体中文。`;

/* ---------- http ---------- */
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");

  /* ---------- 浏览器跨域转发（只放行已知模型服务商） ---------- */
  const ALLOW_HOSTS = new Set([
    "api.deepseek.com", "open.bigmodel.cn", "api.hunyuan.cloud.tencent.com",
    "api.siliconflow.cn", "ark.cn-beijing.volces.com",
  ]);
  if (url.pathname === "/api/proxy" && req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
      "Access-Control-Allow-Headers": "content-type,authorization",
      "Access-Control-Max-Age": "86400",
    });
    return res.end();
  }
  if (url.pathname === "/api/proxy" && req.method === "POST") {
    let b = "";
    req.on("data", c => { b += c; if (b.length > 400000) req.destroy(); });
    req.on("end", async () => {
      try {
        const { url: target, key, body } = JSON.parse(b || "{}");
        const u = new URL(target);
        if (u.protocol !== "https:" || !ALLOW_HOSTS.has(u.hostname)) return json(res, 403, { error: "该地址不允许代理" });
        const r = await fetch(target, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + (key || KEY) },
          body: JSON.stringify(body || {}),
        });
        res.writeHead(r.status, {
          "Content-Type": r.headers.get("content-type") || "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-cache",
        });
        if (r.body) Readable.fromWeb(r.body).pipe(res);
        else res.end();
      } catch (e) {
        json(res, 500, { error: e.message });
      }
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/analyze") {
    let body = "";
    req.on("data", c => { body += c; if (body.length > 200000) req.destroy(); });
    req.on("end", async () => {
      try {
        const { situation } = JSON.parse(body || "{}");
        if (!situation || situation.trim().length < 6) return json(res, 400, { error: "请把困境写清楚一点" });
        if (!KEY) return json(res, 500, { error: "未找到 DEEPSEEK_API_KEY" });

        const payload = {
          model: "deepseek-chat",
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: buildPrompt(situation) + "\n\n" + INSTR },
          ],
          temperature: 0.55,
          max_tokens: 2400,
          response_format: { type: "json_object" },
        };
        const t0 = Date.now();
        const r = await fetch(API, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + KEY },
          body: JSON.stringify(payload),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error?.message || "模型接口错误 " + r.status);
        const out = JSON.parse(data.choices[0].message.content);

        // 校验：只保留索引里存在的方法
        const valid = new Map(KB.methods.map(m => [m.id, m]));
        out.methods = (out.methods || []).filter(m => valid.has(m.id)).slice(0, 3).map(m => {
          const k = valid.get(m.id);
          return { ...m, name: k.name, quote: m.quote || k.quote, source: m.source || k.src };
        });
        if (!out.methods.length) {
          const top = pick(situation, KB.methods, m => [m.name, m.hook, m.fit].join(""), 1)[0].x;
          out.methods = [{ id: top.id, name: top.name, why: top.hook, quote: top.quote, source: top.src }];
        }
        console.log(`[analyze] ${situation.length}字 ${Date.now() - t0}ms methods=${out.methods.map(m => m.name).join(",")}`);
        json(res, 200, out);
      } catch (e) {
        console.error("[analyze] ERROR", e.message);
        json(res, 500, { error: e.message });
      }
    });
    return;
  }
  /* 小程序订阅消息：用 js_code 换 openid 并登记（可选功能） */
  if (url.pathname === "/api/subscribe" && req.method === "POST") {
    let b = "";
    req.on("data", c => { b += c; });
    req.on("end", async () => {
      try {
        const { code, date } = JSON.parse(b || "{}");
        const appid = process.env.WX_APPID, secret = process.env.WX_SECRET;
        if (!appid || !secret) return json(res, 200, { ok: false, reason: "服务端未配置 WX_APPID / WX_SECRET" });
        const u = `https://api.weixin.qq.com/sns/jscode2session?appid=${appid}&secret=${secret}&js_code=${code}&grant_type=authorization_code`;
        const r = await fetch(u); const d = await r.json();
        if (!d.openid) return json(res, 200, { ok: false, reason: d.errmsg || "换不到 openid" });
        const f = path.join(__dirname, "..", "_src", "subscribers.json");
        let arr = [];
        try { arr = JSON.parse(fs.readFileSync(f, "utf8")); } catch { }
        if (!arr.some(x => x.openid === d.openid)) arr.push({ openid: d.openid, since: date || new Date().toISOString().slice(0, 10) });
        fs.writeFileSync(f, JSON.stringify(arr, null, 1), "utf8");
        json(res, 200, { ok: true, total: arr.length });
      } catch (e) { json(res, 500, { ok: false, reason: e.message }); }
    });
    return;
  }
  if (url.pathname === "/api/daily") {
    const d = url.searchParams.get("date") || new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
    const pack = dailyPack(d);
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" });
    return res.end(JSON.stringify(pack));
  }
  if (url.pathname === "/api/health") return json(res, 200, { ok: true, key: !!KEY, methods: KB.methods.length, articles: KB.articles.length });
  if (url.pathname === "/api/methods") return json(res, 200, { methods: KB.methods, cases: KB.cases, meta: KB.meta });
  if (url.pathname === "/api/method") {
    const m = KB.methods.find(x => x.id === url.searchParams.get("id"));
    return m ? json(res, 200, m) : json(res, 404, { error: "not found" });
  }

  /* ---------- 微信公众号（被动回复） ---------- */
  if (url.pathname === "/wechat" && req.method === "GET") {
    const { signature, timestamp, nonce, echostr } = Object.fromEntries(url.searchParams);
    const token = process.env.WECHAT_TOKEN || "mao2026";
    const s = crypto.createHash("sha1").update([token, timestamp, nonce].sort().join("")).digest("hex");
    res.writeHead(200, { "Content-Type": "text/plain" });
    return res.end(s === signature ? echostr : "bad signature");
  }
  if (url.pathname === "/wechat" && req.method === "POST") {
    let body = "";
    req.on("data", c => { body += c; });
    req.on("end", () => {
      const pickTag = t => {
        const m = body.match(new RegExp("<" + t + "><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></" + t + ">"));
        return m ? m[1] : "";
      };
      const to = pickTag("ToUserName"), from = pickTag("FromUserName"), content = pickTag("Content").trim();
      try {
        const ans = wechatAnswer(content);
        const xml = `<xml><ToUserName><![CDATA[${from}]]></ToUserName><FromUserName><![CDATA[${to}]]></FromUserName><CreateTime>${Math.floor(Date.now() / 1000)}</CreateTime><MsgType><![CDATA[text]]></MsgType><Content><![CDATA[${ans}]]></Content></xml>`;
        res.writeHead(200, { "Content-Type": "application/xml" });
        res.end(xml);
      } catch (e) {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("");
      }
    });
    return;
  }

  // static
  let p = decodeURIComponent(url.pathname);
  if (p === "/") p = "/index.html";
  const file = path.join(__dirname, path.normalize(p).replace(/^([/\\])+/, ""));
  if (!file.startsWith(__dirname)) { res.writeHead(403); return res.end("forbidden"); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); return res.end("404"); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
    res.end(buf);
  });
});
/* 公众号 5 秒内必须回复：走本地检索，不调大模型 */
function wechatAnswer(text) {
  if (!text) return "把你的困难直接发给我，越具体越好。\n例：同事不按常理出牌，我一急就自乱阵脚。";
  if (/^(帮助|help|怎么用|使用)$/i.test(text)) {
    return "直接把困难发给我，我会从毛泽东的方法论里挑一条最对得上的，给你原话、做法和提醒。\n例：对手故意搅乱节奏，我总被带着走。\n需要完整方案（诊断+分步+反制），请打开小程序「毛泽东方法论」。";
  }
  const top = pick(text, KB.methods, m => [m.name, m.hook, m.fit, m.risk, m.quote, m.cat].join(""), 2).map(r => r.x);
  const a = top[0];
  const b = top[1];
  const lines = [
    `【对得上的方法】${a.name}`,
    a.quote ? `【原话】${a.quote}` : "",
    `【先做这一步】${(a.steps || [])[0] || a.hook}`,
    `【别踩】${a.risk}`,
    b && b.id !== a.id ? `【也可以看看】${b.name}——${b.hook}` : "",
    `【完整拆解】诊断主要矛盾 + 分步动作 + 反制，请打开小程序「毛泽东方法论」。`
  ].filter(Boolean).join("\n");
  return lines.slice(0, 900);
}

function json(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify(obj));
}
server.listen(PORT, () => {
  console.log(`\n  毛泽东方法论 · 拆书知识库`);
  console.log(`  http://localhost:${PORT}`);
  console.log(`  方法 ${KB.methods.length} 条 / 文章 ${KB.articles.length} 篇 / Key ${KEY ? "已加载" : "缺失"}\n`);
});
