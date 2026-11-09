const app = getApp();

Page({
  data: {
    list: [],
    cats: ["全部", "认知", "战略", "执行", "统御", "表达", "心法"],
    cat: "全部",
    open: "",
    err: ""
  },
  onLoad() { this.load(); },
  onShow() {
    const id = wx.getStorageSync("openMethodId");
    if (id) {
      wx.removeStorageSync("openMethodId");
      this.setData({ open: id, cat: "全部" });
    }
  },
  async load() {
    try {
      const res = await new Promise((resolve, reject) => {
        wx.request({ url: app.globalData.baseUrl + "/api/methods", success: resolve, fail: reject });
      });
      if (res.statusCode !== 200) throw new Error("HTTP " + res.statusCode);
      this.setData({ list: res.data.methods, meta: res.data.meta });
    } catch (e) {
      this.setData({ err: "加载失败，请检查后端地址：" + (e.errMsg || e.message) });
    }
  },
  pickCat(e) { this.setData({ cat: e.currentTarget.dataset.c, open: "" }); },
  toggle(e) { this.setData({ open: this.data.open === e.currentTarget.dataset.id ? "" : e.currentTarget.dataset.id }); }
});
