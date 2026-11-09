/* 每天推一条「每日一则」到小程序订阅消息
 *
 * 用法（在 mao-knowledge 目录下）：
 *   set WX_APPID=wx... & set WX_SECRET=... & node _src/push_daily.mjs
 * 建议用 Windows 任务计划程序每天 07:30 跑一次。
 *
 * 前置条件：
 *   1. 小程序后台 → 订阅消息 → 从公共模板库选一个「每日提醒」类模板，记下模板 ID
 *   2. 把模板里的字段名对应到下面 FIELDS（不同模板字段不一样，必须照抄后台显示的名字）
 *   3. 用户在小程序「每日」页点过「每天提醒我」并允许，服务端才会有 openid
 *
 * 重要：订阅消息是「一次性订阅」——用户允许一次，你只能发一条。
 * 想长期每天发，只能在模板消息里挑「长期订阅」类目（个人主体基本拿不到），
 * 所以现实做法是：小程序内自己看「每日」，推送用来做温和提醒。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(HERE);
const APPID = process.env.WX_APPID || "";
const SECRET = process.env.WX_SECRET || "";
const TMPL = process.env.WX_TMPL || "";           // 模板 ID
const PAGE = "pages/daily/daily";
const SUBS = path.join(HERE, "subscribers.json");
const BASE = process.env.BASE_URL || "http://localhost:8099";

// 模板字段 → 数据。左边必须和后台模板里的字段名一字不差。
const FIELDS = (pack) => ({
  thing1: { value: cut(pack.method.name, 20) },
  thing2: { value: cut(pack.method.hook, 20) },
  thing3: { value: cut((pack.workcase && pack.workcase.title) || "打开看看今天的做法", 20) },
  date4: { value: pack.date },
});
const cut = (s, n) => (s || "").slice(0, n);

if (!APPID || !SECRET || !TMPL) {
  console.log("缺少 WX_APPID / WX_SECRET / WX_TMPL，先设置环境变量。");
  process.exit(0);
}

const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
const pack = await (await fetch(`${BASE}/api/daily?date=${today}`)).json();

let token = "";
try {
  const r = await fetch(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${APPID}&secret=${SECRET}`);
  token = (await r.json()).access_token || "";
} catch { }
if (!token) { console.error("拿 access_token 失败"); process.exit(1); }

let subs = [];
try { subs = JSON.parse(fs.readFileSync(SUBS, "utf8")); } catch { }
console.log(`今天 ${today}：${pack.method.name}，订阅者 ${subs.length} 人`);

for (const s of subs) {
  const body = {
    touser: s.openid,
    template_id: TMPL,
    page: PAGE,
    data: FIELDS(pack),
    miniprogram_state: "formal",
    lang: "zh_CN",
  };
  const r = await fetch(`https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const d = await r.json();
  console.log(s.openid.slice(0, 8) + "…", d.errcode === 0 ? "ok" : `${d.errcode} ${d.errmsg}`);
}
