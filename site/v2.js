/* 毛泽东方法论 · 拆书知识库 v2
   单文件可运行：数据在 window.KB，Key 用 WebCrypto 加密存本地 */
(function () {
"use strict";
const KB = window.KB;
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fileProtocol = location.protocol === "file:";
const PROXY = fileProtocol ? "" : location.origin;   // 走本机服务打开时可借用服务端的 Key
const isSafari = /^((?!chrome|chromium|edg\/|android).)*safari/i.test(navigator.userAgent || "");

/* ================= 服务商 ================= */
const PROVIDERS = [
  { id: "zhipu", name: "智谱 GLM-4-Flash", free: true, base: "https://open.bigmodel.cn/api/paas/v4/chat/completions", model: "glm-4-flash", models: ["glm-4-flash", "glm-4-air", "glm-4-plus"], note: "flash 长期免费，速度够用", keyUrl: "https://open.bigmodel.cn/usercenter/apikeys" },
  { id: "hunyuan", name: "腾讯混元 Lite", free: true, base: "https://api.hunyuan.cloud.tencent.com/v1/chat/completions", model: "hunyuan-lite", models: ["hunyuan-lite", "hunyuan-turbos-latest"], note: "lite 模型免费额度", keyUrl: "https://console.cloud.tencent.com/hunyuan/start" },
  { id: "silicon", name: "硅基流动", free: true, base: "https://api.siliconflow.cn/v1/chat/completions", model: "Qwen/Qwen2.5-7B-Instruct", models: ["Qwen/Qwen2.5-7B-Instruct", "Qwen/Qwen2.5-14B-Instruct", "deepseek-ai/DeepSeek-V3"], note: "有免费模型，也常送额度", keyUrl: "https://cloud.siliconflow.cn/account/ak" },
  { id: "ark", name: "豆包（火山方舟）", free: true, base: "https://ark.cn-beijing.volces.com/api/v3/chat/completions", model: "", models: [], note: "模型名要填控制台的“推理接入点 ID”（ep- 开头）", keyUrl: "https://console.volcengine.com/ark" },
  { id: "deepseek", name: "DeepSeek", free: false, base: "https://api.deepseek.com/v1/chat/completions", model: "deepseek-chat", models: ["deepseek-chat", "deepseek-reasoner"], note: "没有免费额度，但便宜、中文稳", keyUrl: "https://platform.deepseek.com/api_keys" },
  { id: "custom", name: "自定义 OpenAI 兼容", free: false, base: "", model: "", models: [], note: "任何兼容 /chat/completions 的地址", keyUrl: "" },
];
const P = id => PROVIDERS.find(p => p.id === id) || PROVIDERS[0];

/* 免费 Key 领取教程：选到哪家，就看哪家 */
const GUIDE = {
  zhipu: {
    site: "智谱开放平台", url: "https://open.bigmodel.cn/usercenter/apikeys",
    steps: [
      "打开 <b>open.bigmodel.cn</b>，手机号注册（要个人实名，几分钟）",
      "登录后点右上角头像 →「API Keys」→「创建 API Key」",
      "复制 <code>sk-</code> 开头那一整串（只显示一次），回到这里粘进第三步",
    ],
    tip: "模型名留空就是 glm-4-flash，这个模型长期免费，不花钱。",
  },
  hunyuan: {
    site: "腾讯云混元控制台", url: "https://console.cloud.tencent.com/hunyuan/api-key",
    steps: [
      "用微信或 QQ 登录<b>腾讯云</b>，完成个人实名认证",
      "进入「腾讯混元大模型」控制台，点「开通」（lite 模型免费）",
      "在「API Key 管理」页点「创建 API Key」，复制那一串",
    ],
    tip: "模型名留空就是 hunyuan-lite，免费额度够日常用。",
  },
  silicon: {
    site: "硅基流动", url: "https://cloud.siliconflow.cn/account/ak",
    steps: [
      "打开 <b>cloud.siliconflow.cn</b>，手机号注册（新用户送额度）",
      "左侧菜单「API 密钥」→「新建 API 密钥」",
      "复制 <code>sk-</code> 开头那一整串",
    ],
    tip: "模型填 Qwen/Qwen2.5-7B-Instruct（免费），或者从下面下拉列表里挑。",
  },
  deepseek: {
    site: "DeepSeek 开放平台", url: "https://platform.deepseek.com/api_keys",
    steps: [
      "打开 <b>platform.deepseek.com</b>，注册并充值（没有免费额度，但很便宜）",
      "左侧「API keys」→「创建 API key」",
      "复制 <code>sk-</code> 开头那一整串",
    ],
    tip: "模型留空 = deepseek-chat；要看推理过程可以填 deepseek-reasoner。",
  },
};
function keyGuideHTML(p) {
  const g = GUIDE[p.id];
  if (!g) return "";
  return `<details style="margin-top:12px;border:1px solid var(--line);padding:0 14px;background:#fffdf8">
    <summary style="cursor:pointer;font-size:13.5px;padding:12px 0">不知道去哪拿 Key？<b>${esc(p.name)}</b> 免费领取步骤（3 步）</summary>
    <ol style="font-size:13.5px;line-height:1.95;color:var(--ink2);padding-left:20px;margin:6px 0 0">${g.steps.map(s => `<li>${s}</li>`).join("")}</ol>
    <p class="hint" style="margin:10px 0">${g.tip}</p>
    <p style="margin:0 0 14px;font-size:13.5px"><a href="${g.url}" target="_blank" rel="noopener">打开 ${esc(g.site)} →</a></p>
  </details>`;
}

/* ================= 设置与加密 ================= */
const LS_KEY = "mk.settings.v1";     // 非敏感设置
const LS_SEAL = "mk.seal.v1";        // 加密后的 key
const LS_LOCK = "mk.lastquote";      // 金句记录
let CFG = loadCfg();
function loadCfg() {
  let c = {};
  let fresh = false;
  try {
    const raw = localStorage.getItem(LS_KEY);
    fresh = !raw;
    c = JSON.parse(raw || "{}");
  } catch { }
  // 用服务打开时默认借用服务器上的 Key（零配置）；本地文件打开时默认直连
  // 头一次打开默认落在免费那家，别人拿到文件不用先充钱
  const dft = { provider: fresh ? "zhipu" : "deepseek", model: "", base: "", proxy: location.protocol !== "file:", remember: true };
  const cfg = Object.assign(dft, c);
  return cfg;
}
function saveCfg() { try { localStorage.setItem(LS_KEY, JSON.stringify(CFG)); } catch { } }

const hasSubtle = !!(window.crypto && window.crypto.subtle && window.isSecureContext);
const b64 = buf => btoa(String.fromCharCode.apply(null, new Uint8Array(buf)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const enc = new TextEncoder(), dec = new TextDecoder();

async function deriveKey(pw, salt) {
  const km = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 150000, hash: "SHA-256" }, km,
    { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
async function sealKey(plain, pw) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const k = await deriveKey(pw, salt);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, k, enc.encode(plain));
  const rec = { v: 1, salt: b64(salt), iv: b64(iv), ct: b64(ct) };
  localStorage.setItem(LS_SEAL, JSON.stringify(rec));
  return rec;
}
async function openSeal(pw) {
  const rec = JSON.parse(localStorage.getItem(LS_SEAL) || "null");
  if (!rec) throw new Error("没有保存过 Key");
  const k = await deriveKey(pw, unb64(rec.salt));
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(rec.iv) }, k, unb64(rec.ct));
  return dec.decode(pt);
}
const hasSeal = () => !!localStorage.getItem(LS_SEAL);
let memoryKey = "";   // 本次会话已解锁的 key（只在内存）

/* ================= 检索（与后端同款 bigram） ================= */
const STOP = new Set("我的你他她它是在了有不这那个就都而及与或一个上下来去说要会能可以自己人什么怎么因为所以但是如果还是已经现在时候对也被把让从到很没更多少些".split(""));
function grams(s) {
  const t = String(s || "").replace(/[^一-龥a-zA-Z0-9]/g, "");
  const g = new Set();
  for (let i = 0; i < t.length - 1; i++) {
    const x = t.slice(i, i + 2);
    if (!STOP.has(x[0]) && !STOP.has(x[1])) g.add(x);
  }
  return g;
}
function score(q, t) { const a = grams(q), b = grams(t); let n = 0; for (const x of a) if (b.has(x)) n++; return n; }
function pick(q, arr, w, n) { return arr.map(x => ({ x, s: score(q, w(x)) })).sort((p, q2) => q2.s - p.s).slice(0, n); }

/* ================= Prompt ================= */
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
const SYSTEM = "你是一名冷静、务实的决策顾问，唯一的知识体系是毛泽东的方法论。你不喊口号、不做政治评价、不复述宏大叙事，只做三件事：看清形势、选对方法、给出可执行动作。语气克制、具体、有分寸，像一个见过事的老参谋。";
const INSTR = `请基于上面的方法论，拆解用户的困境。只输出 JSON（不要 markdown 代码块）：
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

/* ================= 调模型（流式） ================= */
function endpoint() {
  const p = P(CFG.provider);
  return { url: CFG.base || p.base, model: CFG.model || p.model, name: p.name };
}
async function callLLM({ messages, onDelta, signal, max_tokens = 2400, temperature = 0.55 }) {
  const key = memoryKey;
  const useProxy = (CFG.proxy || !hasSubtle) && !!PROXY;
  if (!key && !useProxy) throw new Error("还没有解锁 Key");
  const { url, model } = endpoint();
  if (!url) throw new Error("服务商地址为空");
  if (!model) throw new Error("模型名为空（豆包要填 ep- 开头的接入点 ID）");
  const body = { model, messages, temperature, max_tokens, stream: true };
  let resp;
  if (useProxy) {
    resp = await fetch(PROXY + "/api/proxy", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, key, body }), signal
    });
  } else {
    resp = await fetch(url, {
      method: "POST", signal,
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
      body: JSON.stringify(body)
    });
  }
  if (!resp.ok) {
    let msg = "HTTP " + resp.status;
    try { const j = await resp.json(); msg = j.error?.message || j.message || j.error || msg; } catch { }
    throw new Error(msg);
  }
  const ct = resp.headers.get("content-type") || "";
  if (!ct.includes("event-stream")) {
    const j = await resp.json();
    const t = j.choices?.[0]?.message?.content || "";
    if (onDelta) onDelta(t);
    return t;
  }
  // Safari 旧版没有 ReadableStream.getReader：整段读回来再解析，只是没有逐字动画
  if (!resp.body || typeof resp.body.getReader !== "function") {
    const all = await resp.text();
    let text = "";
    for (const line of all.split("\n")) {
      const l = line.trim();
      if (!l.startsWith("data:")) continue;
      const d = l.slice(5).trim();
      if (!d || d === "[DONE]") continue;
      try {
        const j = JSON.parse(d);
        const t = j.choices?.[0]?.delta?.content || "";
        if (t) text += t;
      } catch { }
    }
    if (text && onDelta) onDelta(text);
    return text;
  }
  const reader = resp.body.getReader();
  let buf = "", text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      const d = line.slice(5).trim();
      if (!d || d === "[DONE]") continue;
      try {
        const j = JSON.parse(d);
        const t = j.choices?.[0]?.delta?.content || "";
        if (t) { text += t; onDelta && onDelta(text); }
      } catch { }
    }
  }
  return text;
}

/* ================= 解析与校验 ================= */
function parseJSON(text) {
  let s = String(text || "").trim();
  s = s.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a > 0 || b < s.length - 1) s = s.slice(a >= 0 ? a : 0, b >= 0 ? b + 1 : s.length);
  try { return JSON.parse(s); } catch { }
  // 尝试补齐被截断的 JSON
  for (let cut = s.length; cut > 20; cut -= 1) {
    const t = s.slice(0, cut).replace(/,\s*$/, "");
    for (const tail of ["}", "]}", "\"}", "\"]}", "}}"]) {
      try { return JSON.parse(t + tail); } catch { }
    }
  }
  throw new Error("模型返回的不是完整 JSON，可以重试一次");
}
function validate(out) {
  const mById = new Map(KB.methods.map(m => [m.id, m]));
  out.read = out.read || {};
  out.methods = (out.methods || []).filter(m => m && mById.has(m.id)).slice(0, 3).map(m => {
    const k = mById.get(m.id);
    return { ...m, name: k.name, quote: (m.quote && m.quote.trim()) || k.quote || "", source: m.source || k.src || "", verified: !!k.quote_verified };
  });
  if (!out.methods.length) {
    const top = pick(JSON.stringify(out.read), KB.methods, m => [m.name, m.hook, m.fit].join(""), 1)[0].x;
    out.methods = [{ id: top.id, name: top.name, why: top.hook, quote: top.quote, source: top.src, verified: !!top.quote_verified }];
  }
  out.plan = Array.isArray(out.plan) ? out.plan : [];
  out.counter = Array.isArray(out.counter) ? out.counter : [];
  out.avoid = Array.isArray(out.avoid) ? out.avoid : [];
  return out;
}

/* ================= 进度 ================= */
const STAGES = [
  ["读懂处境", ["\"read\""]],
  ["核对方法卡", ["\"methods\""]],
  ["排出动作", ["\"plan\""]],
  ["预演反制", ["\"counter\"", "\"avoid\""]],
  ["收成一句话", ["\"line\""]],
];
let progTimer = null, t0 = 0;
function progHTML() {
  return `<div class="prog" id="prog">
    <div class="prog-h">
      <span class="dot"></span><span class="t">正在拆解</span>
      <span id="ptime">0.0s</span><span id="pchars" style="color:#a49c8c">模型还没开始回话</span>
      <button class="stop" id="stop">停止</button>
    </div>
    <div class="bar creep" id="bar"><i id="barin"></i></div>
    <ul class="steps" id="psteps">${STAGES.map(s => `<li>${s[0]}</li>`).join("")}</ul>
    <details class="rawbox" id="rawbox" open><summary>看模型实时输出（这就是它的“思考过程”）</summary><pre id="raw">等待第一个字…</pre></details>
  </div>`;
}
function progStart() {
  t0 = Date.now();
  clearInterval(progTimer);
  progTimer = setInterval(() => {
    const el = $("#ptime");
    if (el) el.textContent = ((Date.now() - t0) / 1000).toFixed(1) + "s";
  }, 100);
}
function progStop() { clearInterval(progTimer); progTimer = null; }
function progTick(text) {
  const raw = $("#raw"); if (!raw) return;
  raw.textContent = text.slice(-4000);
  raw.scrollTop = raw.scrollHeight;
  let hit = -1;
  STAGES.forEach((s, i) => { if (s[1].some(k => text.includes(k))) hit = i; });
  const lis = $$("#psteps li");
  lis.forEach((li, i) => { li.className = i < hit ? "done" : i === hit || (hit < 0 && i === 0) ? "on" : ""; });
  const base = hit < 0 ? 8 : 14 + hit * 17;
  const next = hit < 0 ? 8 : 14 + (hit + 1) * 17;
  const creep = Math.min(next - 5, base + (Date.now() - t0) / 900);
  const bar = $("#barin"); if (bar) bar.style.width = Math.min(96, creep) + "%";
  const pc = $("#pchars");
  if (pc) pc.textContent = `已生成 ${text.length} 字`;
}
function progDone() {
  progStop();
  const bar = $("#barin"); if (bar) bar.style.width = "100%";
  $$("#psteps li").forEach(li => li.className = "done");
}

/* ================= 结果渲染（编辑排版） ================= */
function renderResult(d, meta) {
  const ml = (d.methods || []).map((x, i) => `
    <div class="mblock">
      <div class="no">方法 ${["一", "二", "三"][i] || i + 1}</div>
      <h3>${esc(x.name)}</h3>
      ${x.quote ? `<blockquote class="qi"><p>${esc(x.quote)}</p>
        <span class="src">${esc(x.source || "")}${x.verified ? `<span class="ok">逐字校验</span>` : ""}</span></blockquote>` : ""}
      <p class="why">${esc(x.why)}</p>
    </div>`).join("");

  const acts = (d.plan || []).map(p => `<li><span class="when">${esc(p.title)}</span><p>${esc(p.action)}</p></li>`).join("");

  const r = d.read || {};
  const swot = [["敌 友", r.friends], ["力量对比", r.balance], ["它想拖你进", r.trap]]
    .filter(x => x[1]).map(x => `<div class="r"><div class="l">${x[0]}</div><p class="v">${esc(x[1])}</p></div>`).join("");

  const counter = (d.counter || []).map(x => `<li>${esc(x)}</li>`).join("");
  const avoid = (d.avoid || []).map(x => `<li>${esc(x)}</li>`).join("");

  const chips = (d.methods || []).map(x => `<span>${esc(x.name)}</span>`).join("");

  return `<article class="answer" id="answer">
    ${d.line ? `<div class="verdict"><div class="vk">一 句 话</div><p class="vline">${esc(d.line)}</p><div class="vmeth">${chips}</div></div>` : ""}

    ${r.main ? `<section class="lead"><div class="kicker">主 要 矛 盾</div><p class="big">${esc(r.main)}</p></section>` : ""}

    ${swot ? `<section class="swot">${swot}</section>` : ""}

    <section>
      <div class="sec-h"><span>壹</span><h3>对得上的方法</h3></div>
      <p class="sec-sub">每条都附原文原话，并标了出处；引语是程序回原文逐字比对过的。</p>
      ${ml}
    </section>

    ${acts ? `<section><div class="sec-h"><span>贰</span><h3>具体怎么做</h3></div><ol class="acts">${acts}</ol></section>` : ""}

    ${counter ? `<section><div class="sec-h"><span>叁</span><h3>对方会怎么破，你怎么接</h3></div><ul class="counter">${counter}</ul></section>` : ""}

    ${avoid ? `<section><div class="sec-h"><span>肆</span><h3>现在绝对不要做</h3></div><ul class="avoid">${avoid}</ul></section>` : ""}

    <div class="sig">
      <span>${esc(meta.model)} · 用时 ${meta.sec}s · ${meta.chars} 字</span>
      <button id="copyall">复制全文</button>
      <button id="again">再拆一次</button>
    </div>
  </article>`;
}
function bindResult(d) {
  const c = $("#copyall"); if (c) c.onclick = () => {
    const t = plainText(d);
    copyText(t).then(() => { c.textContent = "已复制"; setTimeout(() => c.textContent = "复制全文", 1600); })
      .catch(() => { c.textContent = "复制失败"; });
  };
  const a = $("#again"); if (a) a.onclick = () => { const ta = $("#situation"); if (ta) { ta.focus(); window.scrollTo({ top: ta.getBoundingClientRect().top + scrollY - 90, behavior: "smooth" }); } };
}
function plainText(d) {
  const L = [];
  if (d.line) L.push("【一句话】" + d.line);
  const r = d.read || {};
  if (r.main) L.push("【主要矛盾】" + r.main);
  [["敌友", r.friends], ["力量对比", r.balance], ["被拖进的节奏", r.trap]].forEach(([k, v]) => v && L.push(`【${k}】${v}`));
  L.push("");
  (d.methods || []).forEach((m, i) => {
    L.push(`【方法${i + 1}】${m.name}`);
    if (m.quote) L.push(`原话：${m.quote}　—— ${m.source || ""}`);
    L.push("为什么对得上：" + m.why);
    L.push("");
  });
  (d.plan || []).forEach((p, i) => L.push(`【${p.title}】${p.action}`));
  if (d.counter?.length) { L.push("【对方会怎么破】"); d.counter.forEach(x => L.push("· " + x)); }
  if (d.avoid?.length) { L.push("【现在别做】"); d.avoid.forEach(x => L.push("× " + x)); }
  return L.join("\n");
}

/* ================= 示例（?demo=1 时用来看排版） ================= */
const DEMO = {
  read: {
    main: "客户被挖走的根本原因不是价格，而是头部用渠道和品牌把“怕选错”的客户先截走了，你的主要矛盾是：在客户决策的早期环节里没有存在感。",
    friends: "同盟是已经用过你产品、有真实使用体验的老客户和愿意给你转介绍的人；对手是头部销售和他们的渠道代理；中间派是那些还没被完全锁定、在比价和比方案之间摇摆的中小客户。",
    balance: "你强在决策快、服务贴身、能改产品；弱在品牌信任和渠道覆盖；时间不站在硬拼价格这边，但站在“把老客户服务透、把细分场景做深”这边。",
    trap: "对方想把你拖进降价和拼渠道的战场，你越跟价，越消耗现金流和团队信心，最后被拖死。"
  },
  methods: [
    { id: "s-nidani", name: "你打你的，我打我的", why: "对方有钱有人有渠道，价格战你跟不起；团队有人提议降价硬拼，这正是接对方的招。你要做的是不跟价，把战场拉到头部不设防的地方：老客户的深度服务、细分场景的定制、决策链短的中小客户。" },
    { id: "k-diaocha", name: "没有调查，没有发言权", why: "客户被一个个挖走，但你们未必清楚到底为什么走。是价格、是功能、是关系、还是对方给了账期或服务承诺？不摸清这三个具体问题，降价和转定制都是拍脑袋。" },
    { id: "s-jizhong", name: "集中优势兵力，各个歼灭敌人", why: "十几个人经不起同时降价、转定制、拓渠道三条线开打。选一个最可能赢的点——比如把现有老客户里最认可你们的那批人服务到转介绍——把资源压上去，其余方向只做维持。" }
  ],
  plan: [
    { title: "24小时内", action: "老板亲自给最近三个月流失的5个客户逐个打电话，只问三个问题：当初为什么选我们、后来为什么换、如果对方哪一点没做到你会回来。不许销售代打，不许只问关系好的。" },
    { title: "这周", action: "把流失原因归成三类（价格/功能/关系），算出每类占几个；同时列出还没被挖走、但最近询价变少的老客户名单，挑出10个由老板或最懂产品的人一对一上门，带一个具体的小改进方案去，不谈降价。" },
    { title: "长期", action: "选定一个头部看不上、你们又最熟的细分场景，用三个月把它做透，形成可复制的案例和话术；其余产品线只维持不扩张，不跟价、不铺渠道。" }
  ],
  counter: [
    "对方跟进降价：不接，改口径——“我们不做最低价，我们保证你换不掉”。",
    "对方挖你的人：先把核心三人的分成和客户归属写清楚，比加薪更管用。",
    "老客户被请去参观总部：提前给他们一个只有你能给的承诺，比如“改一版不要钱”。"
  ],
  avoid: [
    "不要开全员会宣布“跟他们拼了”，会把恐慌变成行动纲领。",
    "不要同时启动降价、定制、渠道三条线，十几个人一条都做不成。",
    "不要用“我们更懂客户”这种自我安慰，要拿出具体客户的原话当证据。"
  ],
  line: "不跟价，先摸清客户为什么走，再把一个点做透。"
};

/* 每日一句只用「手挑过」的那批：能脱离上下文单独读，且点进去有完整方法卡 */
const QUOTE_IDS = [
  "k-diaocha", "k-zhuyao", "k-liangdian", "k-xiongzhong", "k-shijian",
  "s-nidani", "s-shangshi", "s-zou", "s-busi", "s-tongchou", "s-ziligengsheng", "s-nongcun",
  "e-dangwei", "e-tangangqin", "e-zhuanjin", "e-anmin",
  "p-ziyou", "p-tuanjie", "p-chengqian",
  "x-dangbagu", "x-youdifangshi",
  "m-yugong", "m-jianku", "m-yidangshi"
];
const QUOTE_BLACK = /帝国主义|美帝|蒋|国民党|日本|朝鲜|侵略|地主|资本家|革命|阶级|反动|苏维埃|军阀/;
const QUOTES = (() => {
  const out = [], seen = new Set();
  const add = (q, src, kind, id) => {
    if (!q) return;
    const t = q.replace(/\s+/g, "").trim();
    if (t.length < 14 || t.length > 96) return;
    if (/[「」“”]/.test(t) || QUOTE_BLACK.test(t) || seen.has(t)) return;
    seen.add(t);
    out.push({ t: q.trim(), src, kind, id });
  };
  QUOTE_IDS.forEach(id => {
    const m = KB.methods.find(x => x.id === id);
    if (m) add(m.quote, `${m.name} · ${m.src || ""}`, "m", m.id);
  });
  return out;
})();
function pickQuote() {
  const pool = QUOTES.length ? QUOTES : [{ t: "没有调查，没有发言权。", src: "《反对本本主义》1930", kind: "m", id: "k-diaocha" }];
  const last = localStorage.getItem(LS_LOCK);
  let q = pool[0];
  for (let k = 0; k < 8; k++) {
    q = pool[Math.floor(Math.random() * pool.length)];
    if (q.t !== last) break;
  }
  try { localStorage.setItem(LS_LOCK, q.t); } catch { }
  return q;
}
function quoteStripHTML() {
  const q = pickQuote();
  return `<div class="qstrip" id="qstrip">
    <div class="qm">今日一句</div>
    <div class="qt">${esc(q.t)}<span class="qs">${esc(q.src)}</span></div>
    <button class="qb" id="qnext">换一句</button>
  </div>`;
}
function bindQuoteStrip() {
  const b = $("#qnext"); if (!b) return;
  b.onclick = () => {
    const q = pickQuote();
    $("#qstrip").innerHTML = `<div class="qm">今日一句</div><div class="qt">${esc(q.t)}<span class="qs">${esc(q.src)}</span></div><button class="qb" id="qnext">换一句</button>`;
    bindQuoteStrip();
  };
}
/* ================= Key 解锁弹窗 ================= */
function askPassword(reason) {
  return new Promise(resolve => {
    const m = document.createElement("div");
    m.className = "modal on"; m.id = "pwmodal";
    m.innerHTML = `<div class="mbox">
      <h4>${hasSeal() ? "解锁本地 Key" : "设置本地密码"}</h4>
      <p>${hasSeal() ? "Key 用 AES-GCM 加密存在这台浏览器里，需要密码才能解开。密码不会被保存。" : "Key 会用你这个密码加密（AES-GCM / PBKDF2 15 万次）后存在本机。忘记密码只能重新填一次 Key。"}</p>
      <input class="inp" id="pw1" type="password" placeholder="${hasSeal() ? "输入密码" : "设一个密码，至少 4 位"}" autocomplete="off">
      ${hasSeal() ? "" : `<input class="inp" id="pw2" type="password" placeholder="再输一次" autocomplete="off" style="margin-top:8px">`}
      <div class="err" id="pwerr"></div>
      <div class="acts2"><button class="btn ghost" id="pwcancel">取消</button><button class="btn" id="pwok">${hasSeal() ? "解锁" : "保存并继续"}</button></div>
    </div>`;
    document.body.appendChild(m);
    const done = v => { m.remove(); resolve(v); };
    $("#pwcancel").onclick = () => done(null);
    m.onclick = e => { if (e.target === m) done(null); };
    $("#pw1").focus();
    const go = async () => {
      const a = $("#pw1").value, b = $("#pw2") ? $("#pw2").value : a;
      if (a.length < 4) return $("#pwerr").textContent = "至少 4 位";
      if (a !== b) return $("#pwerr").textContent = "两次不一致";
      if (hasSeal()) {
        try { const k = await openSeal(a); memoryKey = k; done(k); }
        catch { $("#pwerr").textContent = "密码不对"; }
      } else {
        done({ newPw: a });
      }
    };
    $("#pwok").onclick = go;
    $("#pw1").onkeydown = e => { if (e.key === "Enter") go(); };
    if ($("#pw2")) $("#pw2").onkeydown = e => { if (e.key === "Enter") go(); };
  });
}

/* ================= 视图 ================= */
const state = { view: "diagnose", cat: "全部", q: "", vol: "全部", busy: false, result: null, meta: null };
const EXAMPLES = [
  "有个人不按常理出牌，故意搅乱节奏，我一急就自乱阵脚",
  "手上同时五个项目，资源只够做一个，哪个都不敢放",
  "团队里没人说真话，开会一团和气，出了问题互相推",
  "公司比我们大十倍，正面竞争完全打不过",
  "坚持了两年没看到结果，不知道还要不要继续",
  "合作方一直画饼拖延，我还在等他兑现",
];

function viewDiagnose() {
  const p = P(CFG.provider);
  const label = memoryKey ? `${p.name} · ${CFG.model || p.model || "未填模型"} · 已解锁`
    : CFG.proxy ? `本机服务 · ${p.name.replace(/\s.*/, "")}`
    : (hasSeal() ? "Key 已加密保存，待解锁" : "还没配置模型");
  return `
  <section class="hero">
    <h1>把你的困难，<br>放进<em>毛泽东的方法</em>里</h1>
    <p>不是读语录，是拆方法：每一张卡片都有原文原话、当时的真实处境、抽象出来的做法，以及今天怎么用。</p>
    <div class="stats">
      <div><b>${KB.meta.articles}</b>篇原文拆解</div>
      <div><b>${KB.meta.methods}</b>条方法论</div>
      <div><b>${KB.meta.cases}</b>个历史战例</div>
      <div><b>${(KB.meta.chars / 10000).toFixed(0)}万</b>字原文</div>
    </div>
  </section>
  ${quoteStripHTML()}
  <section class="diagnose">
    <div>
      <div class="say">说清楚你遇到的事</div>
      <textarea id="situation" placeholder="越具体越好：谁、在什么场景、他做了什么、你现在的处境和顾虑是什么。&#10;例如：我带的项目组里有个老员工，每次开会都当面答应，会后按自己的一套做，还在群里阴阳怪气。我一纠正他，他就说我外行。我既怕冲突，又怕项目黄掉。"></textarea>
      <p style="font-size:12px;color:#a49c8c;margin:8px 0 0">输入的内容会发给你在「设置」里选的那家模型服务商；涉及真人姓名、公司机密，请先替换或打码。</p>
      <div class="row">
        <button class="btn" id="go">开始拆解</button>
        <button class="btn ghost" id="clear">清空</button>
        <span id="hint" style="font-size:12.5px;color:#8c8477">${esc(label)}</span>
      </div>
      <div class="chips" id="chips">${EXAMPLES.map(e => `<button class="chip">${esc(e)}</button>`).join("")}</div>
    </div>
    <aside class="aside">
      <h4>它会怎么拆</h4>
      <ol>
        <li>先定性质：主要矛盾是什么，谁是你的敌友</li>
        <li>再看力量：你强在哪、弱在哪、时间站在谁那边</li>
        <li>选方法：从 ${KB.meta.methods} 条里挑出真正对得上的一条</li>
        <li>给动作：24 小时内做什么、这周做什么、长期守什么</li>
        <li>给反制：对方最可能怎么破，你怎么接</li>
      </ol>
    </aside>
  </section>
  <section class="result" id="result">${state.result ? renderResult(state.result, state.meta || { model: "", sec: 0, chars: 0 }) : `<div class="dempty">还没有拆解。写下一件正在困扰你的事，越具体越好。</div>`}</section>`;
}
function bindDiagnose() {
  const ta = $("#situation");
  $$("#chips .chip").forEach(c => c.onclick = () => { ta.value = c.textContent; ta.focus(); });
  $("#clear").onclick = () => { ta.value = ""; state.result = null; $("#result").innerHTML = `<div class="dempty">还没有拆解。</div>`; };
  $("#go").onclick = runAnalyze;
  bindQuoteStrip();
}

async function ensureKey() {
  if (memoryKey) return true;
  if (CFG.proxy) return true;   // 代理模式：用服务器上已有的 Key
  if (!hasSeal()) { toast("先去「设置」里选模型、填 Key。"); goSettings(); return false; }
  if (!hasSubtle) { toast("当前页面不是安全环境（需 https 页面），无法解密 Key。可改用「先这么用（不保存）」。"); return false; }
  const v = await askPassword();
  return !!v && !!memoryKey;
}

let abortCtl = null;
async function runAnalyze() {
  if (state.busy) return;
  const text = $("#situation").value.trim();
  if (text.length < 8) return toast("再多写两句，说清楚人和事。");
  if (!(await ensureKey())) return;

  state.busy = true;
  const btn = $("#go"); btn.disabled = true; btn.innerHTML = `<span class="spin"></span>拆解中`;
  $("#result").innerHTML = progHTML();
  progStart();
  abortCtl = new AbortController();
  $("#stop").onclick = () => { abortCtl.abort(); };
  const t = Date.now();
  try {
    const raw = await callLLM({
      messages: [{ role: "system", content: SYSTEM }, { role: "user", content: buildPrompt(text) + "\n\n" + INSTR }],
      onDelta: progTick, signal: abortCtl.signal
    });
    const data = validate(parseJSON(raw));
    progDone();
    const sec = ((Date.now() - t) / 1000).toFixed(1);
    state.meta = { model: (P(CFG.provider).name + " · " + (CFG.model || P(CFG.provider).model)).trim(), sec, chars: raw.length };
    state.result = data;
    $("#result").innerHTML = renderResult(data, state.meta);
    bindResult(data);
    $("#result").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (e) {
    if (e.name === "AbortError") { $("#result").innerHTML = `<div class="notice">已停止。</div>`; }
    else {
      $("#result").innerHTML = `<div class="notice">拆解失败：${esc(e.message)}
        <br><span style="font-size:13px">常见原因：Key 不对／模型名不对／这家不允许网页直连／余额用完。去设置里点「测试一次」能看具体是哪种。</span>
        <br><button class="mini" id="goset" style="margin-top:10px">打开设置</button></div>`;
      const g = $("#goset"); if (g) g.onclick = goSettings;
    }
  } finally {
    state.busy = false; progStop();
    btn.disabled = false; btn.textContent = "开始拆解";
    abortCtl = null;
  }
}

/* --- 方法论 --- */
function viewMethods() {
  const cats = ["全部", ...Array.from(new Set(KB.methods.map(m => m.cat)))];
  const list = KB.methods.filter(m => (state.cat === "全部" || m.cat === state.cat) &&
    (!state.q || (m.name + m.hook + m.quote + m.src).includes(state.q)));
  return `
  <section style="padding-top:42px">
    <div class="sec-h"><span>方法论</span><h3>${KB.meta.methods} 张卡片</h3></div>
    <div class="tools">
      <input class="search" id="mq" placeholder="搜方法、搜原话，例如：主动权 / 集中 / 调查" value="${esc(state.q)}">
      <div class="vol-tabs" id="cats">${cats.map(c => `<button class="${c === state.cat ? "on" : ""}" data-c="${esc(c)}">${esc(c)}</button>`).join("")}</div>
    </div>
    <div class="grid">
      ${list.map(m => `<div class="card" data-m="${m.id}">
        <div class="k">${esc(m.cat)}</div>
        <h4>${esc(m.name)}</h4>
        <p>${esc(m.hook)}</p>
        ${m.quote ? `<div class="q">${esc(m.quote.slice(0, 46))}${m.quote.length > 46 ? "…" : ""}</div>` : ""}
      </div>`).join("")}
    </div>
    ${list.length ? "" : `<p style="color:#8c8477">没有找到，换个词试试。</p>`}
  </section>`;
}
function bindMethods() {
  const q = $("#mq");
  q.oninput = () => { state.q = q.value.trim(); const h = q.selectionStart; render(); const n = $("#mq"); n.focus(); n.setSelectionRange(h, h); };
  $$("#cats button").forEach(b => b.onclick = () => { state.cat = b.dataset.c; render(); });
  $$("[data-m]").forEach(c => c.onclick = () => openMethod(c.dataset.m));
}

/* --- 战例 --- */
function viewCases() {
  const mById = Object.fromEntries(KB.methods.map(m => [m.id, m]));
  return `
  <section style="padding-top:42px">
    <div class="sec-h"><span>战例库</span><h3>${KB.meta.cases} 个关键决策现场</h3></div>
    <p class="sec-sub">方法不是从口号里来的，是从这些真实的困境里逼出来的。每个战例都可以点回它用到的方法。</p>
    <div class="timeline" style="margin-top:30px">
      ${KB.cases.map(c => `<div class="tcase">
        <div class="t">${esc(c.time)} · ${esc(c.place)}</div>
        <h4>${esc(c.name)}</h4>
        <p><strong style="color:var(--ink)">困境：</strong>${esc(c.situation)}</p>
        <p><strong style="color:var(--ink)">决策：</strong>${esc(c.decision)}</p>
        <p><strong style="color:var(--ink)">结果：</strong>${esc(c.result)}</p>
        <p><strong style="color:var(--ink)">今天怎么用：</strong>${esc(c.lesson)}</p>
        ${c.quote ? `<p class="quote" style="font-family:var(--serif);border-left:2px solid var(--accent);padding-left:14px;margin:12px 0 0">「${esc(c.quote)}」<span style="font-family:var(--sans);font-size:12px;color:#8c8477">　${esc(c.quote_src || "")}</span></p>` : ""}
        ${c.saying ? `<p style="font-size:13px;color:#8c8477;margin:4px 0 0">后来的概括：「${esc(c.saying)}」</p>` : ""}
        <div class="mlinks">${(c.methods || []).map(id => mById[id] ? `<button data-m="${id}">${esc(mById[id].name)}</button>` : "").join("")}</div>
      </div>`).join("")}
    </div>
  </section>`;
}
function bindCases() { $$("[data-m]").forEach(b => b.onclick = () => openMethod(b.dataset.m)); }

/* --- 文章 --- */
function viewArticles() {
  const vols = ["全部", "第一卷", "第二卷", "第三卷", "第四卷", "第五卷"];
  const list = KB.articles.filter(a => (state.vol === "全部" || a.volume === state.vol) &&
    (!state.q || (a.title + a.gist + (a.tags || []).join("")).includes(state.q)));
  return `
  <section style="padding-top:42px">
    <div class="sec-h"><span>文章库</span><h3>${KB.meta.articles} 篇原文拆解</h3></div>
    <div class="tools"><input class="search" id="aq" placeholder="搜篇名、主旨、标签，例如：持久战 / 主要矛盾 / 统一战线" value="${esc(state.q)}"></div>
    <div class="vol-tabs" id="vols">${vols.map(v => `<button class="${v === state.vol ? "on" : ""}" data-v="${v}">${v}</button>`).join("")}</div>
    <div class="art-list">
      ${list.map(a => `<div class="art" data-a="${a.id}">
        <h4>${esc(a.title.replace(/（.*?）/g, ""))}</h4>
        <p>${esc(a.gist || "（待拆解）")}</p>
        <div class="m">${esc(a.volume)} · ${esc((a.date || "").replace(/[（）]/g, ""))} · ${(a.chars / 1000).toFixed(1)}千字</div>
      </div>`).join("")}
    </div>
    ${list.length ? "" : `<p style="color:#8c8477">没有找到。</p>`}
  </section>`;
}
function bindArticles() {
  const q = $("#aq");
  q.oninput = () => { state.q = q.value.trim(); const h = q.selectionStart; render(); const n = $("#aq"); n.focus(); n.setSelectionRange(h, h); };
  $$("#vols button").forEach(b => b.onclick = () => { state.vol = b.dataset.v; render(); });
  $$("[data-a]").forEach(c => c.onclick = () => openArticle(c.dataset.a));
}

/* --- 导读 --- */
function viewGuide() {
  return `
  <section style="padding-top:42px;max-width:800px">
    <div class="sec-h"><span>导读</span><h3>怎么读这套书</h3></div>
    <div class="sec">
      <p>《毛泽东选集》1—4卷是1951—1960年编定的选本，收1925—1949年的文章、讲话、电报，第五卷收1949—1957年。它不是一部理论专著，而是一个人在二十多年里、面对具体生死问题写下的判断记录。真正的价值不在结论本身，而在于：他在信息不全、力量悬殊、时间紧迫的条件下，怎么定性质、怎么选主攻方向、怎么把资源集中到一个点上。</p>
      <p>所以这套书最好的读法，不是从头到尾通读，而是当成一本“决策案例集”：先看当时的困境，再看他的判断，最后看这个判断在不在今天的你身上成立。</p>
    </div>
    <div class="sec">
      <div class="sec-h" style="margin-bottom:8px"><span>一</span><h3 style="font-size:18px">三种读法</h3></div>
      <p><strong>按方法读</strong>：先看「方法论」${KB.meta.methods} 张卡片，每张都标了原文原话和适用边界，缺哪一块就补哪一块。</p>
      <p><strong>按战例读</strong>：四渡赤水、延安撤退、辽沈、淮海、平津、重庆谈判——每个战例都是一次完整的决策，看他在压力下怎么取舍。</p>
      <p><strong>按时间读</strong>：从 1925 到 1957，能看到同一套方法在不同力量对比下怎么变形。</p>
    </div>
    <div class="sec">
      <div class="sec-h" style="margin-bottom:8px"><span>二</span><h3 style="font-size:18px">这套方法的边界（必读）</h3></div>
      <p>这套方法论诞生于战争和革命，它的前提是：存在明确的对手、资源极度稀缺、时间以生死计。把它搬到日常，有三条必须警惕：</p>
      <ul>
        <li><strong>不能把所有人都当对手。</strong>“分清敌友”在职场里最容易用坏——把同事、家人、合作方都当成敌我矛盾，最后四面树敌。绝大多数日常冲突是“人民内部矛盾”，该用说服、协商、调整利益，而不是斗争。</li>
        <li><strong>不能把“集中优势兵力”用成孤注一掷。</strong>它成立的前提是你能承受这一仗失败的代价。日常决策里，先算清“输了会怎样”，再决定要不要压上全部资源。</li>
        <li><strong>不能把“持久”当成拖延的借口。</strong>持久战的另一半是“战役速决”——每一仗都要有明确的、短期内可验证的结果。</li>
      </ul>
    </div>
    <div class="sec">
      <div class="sec-h" style="margin-bottom:8px"><span>三</span><h3 style="font-size:18px">本库的取舍</h3></div>
      <p>只做“方法”的拆解，不做政治评价。库内原话均从原文逐字抽取并用程序校验；少数流传很广但不见于《选集》原文的说法（如“存人失地，人地皆存”），单独标注为“流传概括”；另有少量引文出自《选集》以外，标注为“库外引文”，不与库内原文混用。</p>
      <p style="color:#8c8477;font-size:13.5px">文本依据：中文马克思主义文库《毛泽东选集》1—5卷电子全文（gb18030 编码，2026-11-06 抓取），共 ${KB.meta.articles} 篇、${(KB.meta.chars / 10000).toFixed(0)} 万字（按去空白字符计）。</p>
    </div>
  </section>`;
}

/* --- 设置 --- */
function lsOK() { try { localStorage.setItem("__t", "1"); localStorage.removeItem("__t"); return true; } catch { return false; } }
function humanErr(msg) {
  const m = String(msg || "");
  if (/Failed to fetch|NetworkError|Load failed|network/i.test(m)) return "网络没通：可能断网、被墙，或这家不允许网页直连。先换智谱 glm-4-flash（免费）试一次。";
  if (/401|Authentication|invalid.*key|api key|令牌/i.test(m)) return "Key 不对或失效了。去后台重新复制，整段粘贴，注意别带空格、引号、换行。";
  if (/402|余额|insufficient|quota|额度/i.test(m)) return "额度用完了，换一家免费的，或去充值。";
  if (/404|model.*not|no such model/i.test(m)) return "模型名不对。豆包要填 ep- 开头的接入点 ID；其他家先用默认值别改。";
  if (/429|rate|频繁|too many/i.test(m)) return "请求太频繁或免费额度限流，等一分钟再试。";
  return m;
}
function viewSettings() {
  const cur = P(CFG.provider);
  const sealed = hasSeal();
  const checks = [
    ["安全环境", window.isSecureContext],
    ["本地存储", lsOK()],
    ["浏览器加密接口", hasSubtle],
  ];
  const bad = checks.filter(c => !c[1]).length;

  return `<section style="padding-top:40px">
    <div class="setwrap">
      <div class="sec-h"><span>设置</span><h3>选模型、填 Key</h3></div>

      <p class="sec-sub">两步就好：<br>
      ① 选一家（标了「有免费」的不用充钱，推荐<b>智谱 GLM-4-Flash</b>）——不知道去哪拿，点下面的「免费领取步骤」。<br>
      ② 把 Key 粘进来 → 点「先这么用（不保存）」，立刻就能拆解；想下次不用再填，就点「加密保存」。<br>
      Key 只存在你这台电脑的浏览器里，只随请求发给你选的那家模型服务商，不经过任何第三方中转。</p>

      ${isSafari && fileProtocol ? `<div class="notice" style="margin:14px 0 0">检测到你用 <b>Safari</b> 直接打开本地文件。Safari 对 file:// 的跨域请求限制更严，AI 拆解可能连不上（浏览、搜索不受影响）。要用 AI 诊断，建议改用 <b>Chrome</b> 或 <b>Edge</b> 打开。</div>` : ""}

      ${bad ? `<div class="status" style="flex-wrap:wrap;gap:14px;border:1px solid var(--line);padding:10px 14px;background:#fffdf8">
        ${checks.map(c => `<span style="color:${c[1] ? "#2e7d4f" : "var(--accent)"}">${c[1] ? "●" : "✕"} ${esc(c[0])}</span>`).join("")}
      </div>` : ""}

      <div class="setrow" style="margin-top:26px">
        <label>第一步 · 选服务商（带“有免费”的都不用先充钱）</label>
        <div class="ptab" id="ptab">
          ${PROVIDERS.map(p => `<button class="popt ${p.id === CFG.provider ? "on" : ""}" data-p="${p.id}">
            <b>${esc(p.name)}<span class="ft ${p.free ? "" : "paid"}">${p.free ? "有免费" : "付费"}</span></b>
            <small>${esc(p.note)}</small>
          </button>`).join("")}
        </div>
        <p class="hint">${esc(cur.note)} ${cur.keyUrl ? `· <a href="${esc(cur.keyUrl)}" target="_blank" rel="noopener">去这家拿 Key →</a>` : ""}</p>
        ${keyGuideHTML(cur)}
      </div>

      <div class="setrow" id="baserow" style="${CFG.provider === "custom" ? "" : "display:none"}">
        <label>接口地址</label>
        <input class="inp" id="baseurl" placeholder="https://xxx/v1/chat/completions" value="${esc(CFG.base || "")}">
      </div>

      <div class="setrow">
        <label>第二步 · 模型（不确定就留空）</label>
        <input class="inp" id="model" list="modellist" placeholder="${esc(cur.model || "留空用默认")}" value="${esc(CFG.model || "")}">
        <datalist id="modellist">${(cur.models || []).map(m => `<option value="${esc(m)}">`).join("")}</datalist>
        <p class="hint">留空 = 用 ${esc(cur.model || "空")}${CFG.provider === "ark" ? "；豆包必须填控制台的推理接入点 ID（ep- 开头）" : ""}</p>
      </div>

      <div class="setrow">
        <label>第三步 · 填 Key</label>
        ${sealed ? `<div class="status"><span class="ok">●</span> 已加密保存 ${memoryKey ? "（本次已解锁）" : "（下次打开要输密码）"}<button class="mini" id="resetkey" style="margin-left:auto">重新填</button></div>`
      : `<div class="keybox"><input class="inp" id="apikey" type="password" placeholder="整段粘贴 Key，例如 sk-..." autocomplete="off"></div>
         <div class="row" style="margin-top:10px">
           <button class="mini pri" id="saveinmem">先这么用（不保存）</button>
           <button class="mini" id="savekey" ${hasSubtle ? "" : "disabled"}>加密保存</button>
         </div>`}
        <p class="hint">「先这么用」= 只放在内存里，关掉页面就没了，不用设密码，最省事；「加密保存」= 存到本机，下次只需输密码。两者都不会把 Key 存到任何服务器。</p>
        <div class="status" id="keystat"></div>
      </div>

      <div class="setrow">
        <button class="btn" id="test">测试一次</button>
        <div id="testout" style="font-size:13.5px;margin-top:12px;line-height:1.8"></div>
      </div>

      <div class="setrow">
        <details class="rawbox" style="border-top:1px solid var(--line);padding-top:14px">
          <summary>还是不行？点开看常见原因</summary>
          <ol style="font-size:13.5px;color:var(--ink2);line-height:1.95;padding-left:20px">
            <li><b>Key 复制不全</b>：很多人只复制了半截。去后台点「复制」，别手选。</li>
            <li><b>选错服务商</b>：在智谱拿的 Key 填到 DeepSeek 里，一定报 401。</li>
            <li><b>豆包的模型名</b>：不是 <code>doubao-pro</code>，是控制台「推理接入点」的 <code>ep-xxxxx</code>。</li>
            <li><b>免费额度要开通</b>：智谱/混元/硅基都要先在后台开通对应模型，否则报 404 或无权限。</li>
            <li><b>浏览器拦了</b>：广告拦截插件、公司网络、或者页面不是 https，都可能被拦。换个浏览器试。</li>
            <li><b>想最省事</b>：选智谱 GLM-4-Flash，这个模型免费，不用充值。</li>
          </ol>
        </details>
      </div>
    </div>
  </section>`;
}
function bindSettings() {
  $$("#ptab .popt").forEach(b => b.onclick = () => { CFG.provider = b.dataset.p; CFG.model = ""; saveCfg(); render(); });
  const bu = $("#baseurl"); if (bu) bu.oninput = () => { CFG.base = bu.value.trim(); saveCfg(); };
  const mi = $("#model"); if (mi) mi.oninput = () => { CFG.model = mi.value.trim(); saveCfg(); };
  const px = $("#proxy"); if (px) px.onchange = () => { CFG.proxy = px.checked; saveCfg(); };

  const inmem = $("#saveinmem");
  if (inmem) inmem.onclick = () => {
    const v = ($("#apikey")?.value || "").trim();
    if (!v) return toast("先把 Key 粘进来");
    memoryKey = v;
    toast("已装进内存，本次可用；关掉页面就没了");
    render();
  };
  const sk = $("#savekey");
  if (sk) sk.onclick = async () => {
    const v = ($("#apikey")?.value || "").trim();
    if (!v) return toast("先把 Key 粘进来");
    if (!hasSubtle) return toast("这个浏览器/环境下不给加密，改用「先这么用」或代理模式");
    try {
      const r = await askPassword();
      if (!r || !r.newPw) return;
      await sealKey(v, r.newPw);
      memoryKey = v;
      toast("已加密保存");
      render();
    } catch (e) {
      toast("保存失败：" + e.message + "（可改用「先这么用」）");
    }
  };
  const rs = $("#resetkey");
  if (rs) rs.onclick = () => { if (confirm("删掉已保存的 Key？")) { try { localStorage.removeItem(LS_SEAL); } catch { } memoryKey = ""; render(); } };

  const tb = $("#test");
  if (tb) tb.onclick = async () => {
    const out = $("#testout");
    out.innerHTML = `<span style="color:#8c8477">正在连 ${esc(P(CFG.provider).name)} …</span>`;
    try {
      const typed = ($("#apikey")?.value || "").trim();
      if (typed) memoryKey = typed;
      if (!memoryKey && !CFG.proxy) throw new Error("还没有 Key：去设置里填一个，或点「先这么用」");
      const t = Date.now();
      const r = await callLLM({ messages: [{ role: "user", content: "只回复两个字：可用" }], max_tokens: 12, temperature: 0 });
      out.innerHTML = `<span style="color:#2e7d4f">● 通了</span> · ${((Date.now() - t) / 1000).toFixed(1)} 秒 · 模型回「${esc(r.trim().slice(0, 20))}」<br>
        <span style="color:#8c8477">${typed ? "这次会话已经可以直接用了" : ""}</span>`;
      if (typed) render();
    } catch (e) {
      out.innerHTML = `<span style="color:var(--accent)">✕ 没通</span><br>
        <span style="color:var(--ink2)">${esc(humanErr(e.message))}</span><br>
        <span style="color:#8c8477;font-size:12px">原始信息：${esc(String(e.message).slice(0, 160))}</span><br>
        <button class="mini" id="copydiag" style="margin-top:10px">复制诊断信息</button>`;
      const cd = $("#copydiag");
      if (cd) cd.onclick = () => {
        const info = [
          "=== 毛泽东方法论 诊断 ===",
          "时间：" + new Date().toLocaleString(),
          "页面：" + location.href,
          "协议：" + location.protocol + "  secure=" + window.isSecureContext,
          "浏览器：" + navigator.userAgent,
          "localStorage：" + lsOK(),
          "crypto.subtle：" + hasSubtle,
          "服务商：" + P(CFG.provider).name + " (" + P(CFG.provider).base + ")",
          "模型：" + (CFG.model || P(CFG.provider).model),
          "代理：" + CFG.proxy + (fileProtocol ? " → " + PROXY : ""),
          "已存Key：" + hasSeal() + "  内存Key：" + (memoryKey ? "有" : "无"),
          "错误：" + e.message
        ].join("\n");
        copyText(info).then(() => { cd.textContent = "已复制"; })
          .catch(() => { cd.textContent = "复制失败，请截图"; });
      };
    }
  };
}

/* ================= 详情层 ================= */
function sheet(html) {
  let o = $("#overlay");
  if (!o) { o = document.createElement("div"); o.id = "overlay"; o.className = "overlay"; document.body.appendChild(o); }
  o.innerHTML = `<div class="sheet"><button class="close">×</button>${html}</div>`;
  o.classList.add("on");
  o.querySelector(".close").onclick = closeSheet;
  o.onclick = e => { if (e.target === o) closeSheet(); };
  document.addEventListener("keydown", escClose);
}
function escClose(e) { if (e.key === "Escape") closeSheet(); }
// Safari 从 file:// 打开时 history.replaceState 会抛 SecurityError，退回改 location.hash
function setHash(h) {
  try { history.replaceState(null, "", h); }
  catch { try { location.hash = String(h).replace(/^#/, ""); } catch { } }
}
function closeSheet() {
  const o = $("#overlay"); if (o) o.classList.remove("on");
  document.removeEventListener("keydown", escClose);
  if (/^#(m|a)\//.test(location.hash)) setHash("#" + state.view);
}
function openMethod(id) {
  const m = KB.methods.find(x => x.id === id);
  if (!m) return;
  setHash("#m/" + id);
  const art = KB.articles.find(a => a.id === m.quote_src_id);
  const cases = KB.cases.filter(c => (c.methods || []).includes(id));
  sheet(`
    <h2>${esc(m.name)}</h2>
    <div class="meta">${esc(m.cat)} · ${esc(m.src)}</div>
    <p style="font-size:17px;font-family:var(--serif)">${esc(m.hook)}</p>
    <h5>原文原话${m.quote_verified ? `<span class="badge">逐字校验</span>` : ``}</h5>
    ${m.quote ? `<div class="quote">${esc(m.quote)}</div>` : `<p style="color:#8c8477">（此条为后人概括的工作方法，未见《选集》原文，故不引原话。）</p>`}
    ${m.quote_note ? `<p style="font-size:13px;color:#8c8477">${esc(m.quote_note)}</p>` : ""}
    ${art ? `<a class="src-link" href="#" data-src="${art.id}">出自《${esc(art.title.replace(/（.*?）/g, ""))}》 →</a>` : ""}
    <h5>照着做</h5>
    <ol>${(m.steps || []).map(s => `<li>${esc(s)}</li>`).join("")}</ol>
    <h5>什么时候用</h5><p>${esc(m.fit)}</p>
    <h5>什么时候会翻车</h5><p>${esc(m.risk)}</p>
    ${cases.length ? `<h5>历史现场</h5><div class="mlinks">${cases.map(c => `<button data-case="${c.id}">${esc(c.name)} · ${esc(c.time)}</button>`).join("")}</div>` : ""}
  `);
  const src = document.querySelector("[data-src]");
  if (src) src.onclick = e => { e.preventDefault(); openArticle(src.dataset.src); };
  $$("[data-case]").forEach(b => b.onclick = () => { closeSheet(); state.view = "cases"; render(); window.scrollTo(0, 0); });
}
function openArticle(id) {
  const a = KB.articles.find(x => x.id === id);
  if (!a) return;
  setHash("#a/" + id);
  sheet(`
    <h2>${esc(a.title.replace(/（.*?）/g, ""))}</h2>
    <div class="meta">${esc(a.volume)} · ${esc((a.date || "").replace(/[（）]/g, ""))} · ${(a.chars / 1000).toFixed(1)}千字</div>
    ${a.note ? `<p style="font-size:13.5px;color:#8c8477;border-left:2px solid var(--line);padding-left:12px">${esc(a.note)}</p>` : ""}
    ${a.gist ? `<h5>主旨</h5><p style="font-family:var(--serif);font-size:17px">${esc(a.gist)}</p>` : ""}
    ${a.situation ? `<h5>当时的困境</h5><p>${esc(a.situation)}</p>` : ""}
    ${(a.quotes || []).length ? `<h5>关键原话（逐字校验）</h5>${a.quotes.map(q => `<div class="quote">${esc(q.text)}<small style="display:block;color:#8c8477;font-family:var(--sans);font-size:12px;margin-top:4px">${esc(q.role || "")}${q.note ? " · " + esc(q.note) : ""}</small></div>`).join("")}` : ""}
    ${(a.facts || []).length ? `<h5>对应的历史史实</h5><ul>${a.facts.map(f => `<li>${esc(f)}</li>`).join("")}</ul>` : ""}
    ${(a.methods || []).length ? `<h5>抽象出的方法</h5>
      <div class="mlinks">${a.methods.map(x => {
        const hit = KB.methods.find(m => m.name === x.name || (x.name && m.name.includes(x.name.slice(0, 4))));
        return hit ? `<button data-m="${hit.id}">${esc(hit.name)}</button>` : `<span class="badge gray">${esc(x.name)}</span>`;
      }).join("")}</div>
      <ul style="margin-top:10px">${a.methods.map(x => `<li><strong>${esc(x.name)}</strong>：${esc(x.how)}${x.transfer ? `<span style="color:#8c8477">（今天：${esc(x.transfer)}）</span>` : ""}</li>`).join("")}</ul>` : ""}
    <h5>全文</h5>
    <div class="fulltext">${esc(a.text).slice(0, 60000)}</div>
  `);
  $$("[data-m]").forEach(b => b.onclick = () => openMethod(b.dataset.m));
}

/* ================= 路由 ================= */
function toast(msg) {
  let t = $("#toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; document.body.appendChild(t); }
  t.textContent = msg;
  t.style.cssText = "position:fixed;left:50%;bottom:36px;transform:translateX(-50%);background:#1b1a18;color:#f3ede2;font-size:13.5px;padding:10px 18px;z-index:90;border-radius:2px;opacity:0;transition:opacity .2s";
  requestAnimationFrame(() => t.style.opacity = "1");
  clearTimeout(t._h);
  t._h = setTimeout(() => { t.style.opacity = "0"; }, 2600);
}
// Safari 从 file:// 打开时 navigator.clipboard 可能不可用，退回 execCommand
function copyText(t) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(t);
  }
  return new Promise((ok, no) => {
    try {
      const ta = document.createElement("textarea");
      ta.value = t;
      ta.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      const r = document.execCommand("copy");
      document.body.removeChild(ta);
      r ? ok() : no(new Error("copy failed"));
    } catch (e) { no(e); }
  });
}
function goSettings() { state.view = "settings"; setHash("#settings"); render(); window.scrollTo(0, 0); }

const VIEWS = ["diagnose", "methods", "cases", "articles", "guide", "settings"];
function parseHash() {
  const h = (location.hash || "").slice(1);
  if (/^m\//.test(h)) return { view: "methods", deep: ["m", h.slice(2)] };
  if (/^a\//.test(h)) return { view: "articles", deep: ["a", h.slice(2)] };
  return { view: VIEWS.includes(h) ? h : "diagnose" };
}
function render() {
  $$("nav button").forEach(b => b.classList.toggle("on", b.dataset.view === state.view));
  const gb = $("#gbtn");
  if (gb) {
    const p = P(CFG.provider);
    const mdl = CFG.model || p.model || "未填";
    gb.textContent = memoryKey ? `已解锁 · ${p.name.replace(/\s.*/, "")} · ${mdl}`
      : CFG.proxy ? `本机服务 · ${p.name.replace(/\s.*/, "")}`
      : hasSeal() ? "Key 已加密 · 待解锁" : "模型 · 未配置";
    gb.classList.toggle("live", !!memoryKey || CFG.proxy);
  }
  const app = $("#app");
  if (state.view === "diagnose") { app.innerHTML = viewDiagnose(); bindDiagnose(); }
  else if (state.view === "methods") { app.innerHTML = viewMethods(); bindMethods(); }
  else if (state.view === "cases") { app.innerHTML = viewCases(); bindCases(); }
  else if (state.view === "settings") { app.innerHTML = viewSettings(); bindSettings(); }
  else if (state.view === "guide") { app.innerHTML = viewGuide(); }
  else { app.innerHTML = viewArticles(); bindArticles(); }
  const d = parseHash().deep;
  if (d) (d[0] === "m" ? openMethod : openArticle)(decodeURIComponent(d[1]));
}

/* ================= 启动 ================= */
function init() {
  $$("nav button").forEach(b => b.onclick = () => { state.view = b.dataset.view; state.q = ""; setHash("#" + state.view); render(); window.scrollTo(0, 0); });
  const g = $("#gbtn");
  if (g) g.onclick = () => { if (memoryKey) toast("已解锁，可以拆解"); else goSettings(); };
  state.view = parseHash().view;
  if (new URLSearchParams(location.search).has("demo")) {
    const mById = Object.fromEntries(KB.methods.map(m => [m.id, m]));
    state.result = JSON.parse(JSON.stringify(DEMO));
    state.result.methods.forEach(x => {
      const k = mById[x.id]; if (k) { x.quote = k.quote; x.source = k.src; x.verified = !!k.quote_verified; }
    });
    state.meta = { model: "示例输出", sec: "8.0", chars: 1860 };
  }
  render();
  const appEl = $("#app"); if (appEl) appEl.dataset.ready = "1";
  window.addEventListener("hashchange", () => {
    const v = parseHash().view;
    if (v !== state.view) { state.view = v; render(); }
  });
  if (state.view === "diagnose") { /* 今日一句在页面上，不弹窗 */ }
}

// 暴露一点给调试/单测
window.MK = { KB, CFG, callLLM, buildPrompt, parseJSON, validate, QUOTES, sealKey, openSeal };
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
})();
