const app = getApp();
// 在「微信公众平台 → 订阅消息」里选一个同类模板，把模板 ID 填这里
const TMPL_ID = "";

function ymd(d) {
  const p = n => (n < 10 ? "0" + n : "" + n);
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}

Page({
  data: { loading: true, err: "", pack: null, dateText: "", tmpl: !!TMPL_ID },

  onLoad() {
    const d = new Date();
    this.setData({ dateText: (d.getMonth() + 1) + " 月 " + d.getDate() + " 日" });
    this.load();
  },
  onPullDownRefresh() {
    this.load(true).then(() => wx.stopPullDownRefresh());
  },
  onShareAppMessage() {
    const p = this.data.pack;
    return {
      title: p ? "每日一则 · " + p.method.name : "毛泽东方法论 · 每日一则",
      path: "/pages/daily/daily"
    };
  },

  load(force) {
    const day = ymd(new Date());
    if (!force) {
      const cache = wx.getStorageSync("daily:" + day);
      if (cache) { this.setData({ pack: cache, loading: false }); return Promise.resolve(); }
    }
    this.setData({ loading: true, err: "" });
    return new Promise(resolve => {
      wx.request({
        url: app.globalData.baseUrl + "/api/daily?date=" + day,
        success: r => {
          if (r.statusCode === 200 && r.data && r.data.method) {
            wx.setStorageSync("daily:" + day, r.data);
            this.setData({ pack: r.data, loading: false });
          } else {
            this.setData({ err: "服务返回异常（" + r.statusCode + "）", loading: false });
          }
        },
        fail: e => {
          this.setData({ err: "连不上本地服务：" + (e.errMsg || ""), loading: false });
        },
        complete: () => resolve()
      });
    });
  },

  copyAll() {
    const p = this.data.pack;
    if (!p) return;
    const t = [
      "【今日方法】" + p.method.name,
      p.method.quote ? "【原话】" + p.method.quote + "——" + p.method.src : "",
      "【它解决什么】" + p.method.hook,
      "【今天怎么做】" + (p.method.steps || []).map((s, i) => (i + 1) + ". " + s).join(" "),
      p.concept ? "【相关概念】" + p.concept.name + "：" + p.concept.text : "",
      p.workcase ? "【工作案例】" + p.workcase.title + "：" + p.workcase.story + " 做法：" + p.workcase.how : "",
      p.fact ? "【历史现场】" + p.fact.name + "（" + p.fact.time + "）：" + p.fact.decision : ""
    ].filter(Boolean).join("\n");
    wx.setClipboardData({ data: t });
  },

  toMethods() {
    const p = this.data.pack;
    if (p) wx.setStorageSync("openMethodId", p.method.id);
    wx.switchTab({ url: "/pages/methods/methods" });
  },

  subscribe() {
    if (!TMPL_ID) {
      wx.showModal({
        title: "推送还没配",
        content: "到「微信公众平台 → 订阅消息 → 公共模板库」选一个每日提醒类模板，把模板 ID 填进 pages/daily/daily.js 顶部的 TMPL_ID，再用 _src/push_daily.mjs 每天推一次。在此之前，打开小程序就能看到当天内容。",
        showCancel: false,
        confirmText: "知道了"
      });
      return;
    }
    wx.requestSubscribeMessage({
      tmplIds: [TMPL_ID],
      success: res => {
        if (res[TMPL_ID] === "accept") {
          wx.showToast({ title: "已订阅明天", icon: "success" });
          // 把 openid 交给自己的服务端登记
          wx.login({
            success: lr => {
              wx.request({
                url: app.globalData.baseUrl + "/api/subscribe",
                method: "POST",
                data: { code: lr.code, date: ymd(new Date()) }
              });
            }
          });
        } else {
          wx.showToast({ title: "没有订阅", icon: "none" });
        }
      }
    });
  }
});
