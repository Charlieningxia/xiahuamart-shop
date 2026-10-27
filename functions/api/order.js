// Xiahuamart order intake — Cloudflare Pages Function
// Orders are stored in the KV namespace bound as ORDERS. No payment is taken:
// per store rules, payment happens only after a group forms.
const PRICES = {"NX001": {"price": 1.37, "target": 15, "title": "奈雪的茶 · 瓶装茶", "name": "蜜桃乌龙茶 450ml"}, "NX002": {"price": 1.37, "target": 15, "title": "奈雪的茶 · 瓶装茶", "name": "青提香乌龙茶 450ml · 低糖"}, "NX003": {"price": 1.37, "target": 15, "title": "奈雪的茶 · 瓶装茶", "name": "荔枝红茶 450ml"}, "NX004": {"price": 1.37, "target": 15, "title": "奈雪的茶 · 瓶装茶", "name": "葡萄乌龙茶 450ml"}, "NX005": {"price": 1.37, "target": 15, "title": "奈雪的茶 · 瓶装茶", "name": "茉莉初雪 500ml · 0糖"}, "YJPZ001": {"price": 4.0, "target": 20, "title": "盐津铺子 · 大魔王火爆魔芋", "name": "奶油火鸡酱味 · 20包/盒"}, "YJPZ002": {"price": 4.0, "target": 20, "title": "盐津铺子 · 大魔王火爆魔芋", "name": "经典三养火鸡面酱味 · 20包/盒"}, "YJPZ005": {"price": 2.48, "target": 20, "title": "大魔王 · 袋装魔芋素毛肚", "name": "蒜蓉麻酱味 · 20包/袋"}, "MN001": {"price": 1.11, "target": 24, "title": "蒙牛早餐奶 250ml", "name": "原麦味"}, "MN002": {"price": 1.11, "target": 24, "title": "蒙牛早餐奶 250ml", "name": "核桃味"}, "MN003": {"price": 1.11, "target": 24, "title": "蒙牛早餐奶 250ml", "name": "红枣味"}, "YL001": {"price": 1.13, "target": 24, "title": "伊利营养早餐奶 250ml", "name": "麦香味"}, "SDL004": {"price": 1.51, "target": 15, "title": "三得利 · 维C饮", "name": "维C饮 针叶樱桃味 450ml"}, "QX001": {"price": 1.73, "target": 35, "title": "秋香瓜子 208g", "name": "原味"}, "QX002": {"price": 1.73, "target": 35, "title": "秋香瓜子 208g", "name": "薄盐"}, "QX003": {"price": 1.73, "target": 35, "title": "秋香瓜子 208g", "name": "黑丁儿原味"}, "SHJ008": {"price": 1.62, "target": 24, "title": "上好佳罐装薯片 85g", "name": "甜辣味"}, "SHJ009": {"price": 1.62, "target": 24, "title": "上好佳罐装薯片 85g", "name": "蜂蜜黄油味"}, "SHJ010": {"price": 1.62, "target": 24, "title": "上好佳罐装薯片 85g", "name": "披萨味"}, "YDL002": {"price": 0.85, "target": 36, "title": "永得利巧爆夹心饼干 85g", "name": "酸奶巧克力味"}, "YDL003": {"price": 0.85, "target": 36, "title": "永得利巧爆夹心饼干 85g", "name": "抹茶巧克力味"}, "YMGS003": {"price": 1.09, "target": 80, "title": "沂蒙公社冰糖葫芦 25g/串", "name": "山楂冰糖葫芦"}};
const MIN_SUBTOTAL = 20;

function json(obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
function money(v) { return Math.round(v * 100) / 100; }

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.ORDERS) return json({ ok: false, error: "订单系统尚未开通（KV 未绑定）" }, 503);
  let body;
  try { body = await request.json(); } catch (e) { return json({ ok: false, error: "请求格式错误" }, 400); }
  const name = String(body.name || "").trim().slice(0, 40);
  const phone = String(body.phone || "").trim().slice(0, 30);
  const wechat = String(body.wechat || "").trim().slice(0, 40);
  const addr = String(body.addr || "").trim().slice(0, 200);
  const note = String(body.note || "").trim().slice(0, 200);
  const referrer = String(body.referrer || "").trim().slice(0, 40);
  const method = ["pickup", "local", "ship"].includes(body.method) ? body.method : "pickup";
  const digits = phone.replace(/\D/g, "");
  if (!name) return json({ ok: false, error: "请填写姓名" }, 400);
  if (digits.length < 7 || digits.length > 15) return json({ ok: false, error: "手机号不正确" }, 400);
  if (method !== "pickup" && !addr) return json({ ok: false, error: "配送/快递需要收货地址" }, 400);
  const itemsIn = Array.isArray(body.items) ? body.items : [];
  const items = [];
  let subtotal = 0;
  for (const it of itemsIn) {
    const p = PRICES[it.sku];
    const qty = parseInt(it.qty, 10);
    if (!p || !qty || qty < 1 || qty > 200) return json({ ok: false, error: "商品或数量不正确：" + it.sku }, 400);
    subtotal += p.price * qty;
    items.push({ sku: it.sku, title: p.title, name: p.name, price: p.price, qty, target: p.target });
  }
  if (!items.length) return json({ ok: false, error: "购物车是空的" }, 400);
  subtotal = money(subtotal);
  if (subtotal < MIN_SUBTOTAL) return json({ ok: false, error: "未达到每人最低拼单额 $20" }, 400);
  const fee = method === "local" ? (subtotal >= 35 ? 0 : 5.99) : (method === "ship" ? null : 0);
  const total = fee === null ? null : money(subtotal + fee);
  const id = "XM" + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
  const order = { id, ts: new Date().toISOString(), status: "pending", name, phone, wechat, addr, note, referrer, method, items, subtotal, fee, total };
  await env.ORDERS.put("order:" + id, JSON.stringify(order));
  return json({ ok: true, id, subtotal, fee, total });
}
export async function onRequest(context) {
  if (context.request.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);
  return onRequestPost(context);
}
