const app = getApp();
const EXAMPLES = [
  "有人不按常理出牌，我一急就自乱阵脚",
  "手上五个项目，资源只够做一个",
  "团队没人说真话，开会一团和气",
  "公司比我们大十倍，正面打不过",
  "坚持两年没结果，要不要继续",
  "合作方一直画饼拖延"
];

Page({
  data: {
    text: "",
    loading: false,
    examples: EXAMPLES,
    r: null,
    err: ""
  },
  onInput(e) { this.setData({ text: e.detail.value }); },
  useExample(e) { this.setData({ text: e.currentTarget.dataset.t }); },
  async analyze() {
    const t = this.data.text.trim();
    if (t.length < 8) { wx.showToast({ title: "再多写两句", icon: "none" }); return; }
    this.setData({ loading: true, err: "", r: null });
    try {
      const res = await new Promise((resolve, reject) => {
        wx.request({
          url: app.globalData.baseUrl + "/api/analyze",
          method: "POST",
          header: { "content-type": "application/json" },
          data: { situation: t },
          timeout: 120000,
          success: resolve,
          fail: reject
        });
      });
      if (res.statusCode !== 200 || !res.data || res.data.error) {
        throw new Error((res.data && res.data.error) || ("HTTP " + res.statusCode));
      }
      this.setData({ r: res.data });
    } catch (e) {
      this.setData({ err: "拆解失败：" + (e.errMsg || e.message || e) });
    } finally {
      this.setData({ loading: false });
    }
  }
});
