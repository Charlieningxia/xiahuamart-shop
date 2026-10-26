// Owner-only order list / status updates. Requires env ADMIN_TOKEN.
function json(obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
function authed(request, env) {
  const url = new URL(request.url);
  const t = request.headers.get("x-admin-token") || url.searchParams.get("token") || "";
  return env.ADMIN_TOKEN && t && t === env.ADMIN_TOKEN;
}
export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.ORDERS) return json({ ok: false, error: "KV 未绑定" }, 503);
  if (!authed(request, env)) return json({ ok: false, error: "unauthorized" }, 401);
  const orders = [];
  let cursor;
  do {
    const page = await env.ORDERS.list({ prefix: "order:", cursor, limit: 200 });
    for (const k of page.keys) {
      const raw = await env.ORDERS.get(k.name);
      if (raw) { try { orders.push(JSON.parse(raw)); } catch (e) {} }
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  orders.sort((a, b) => (a.ts < b.ts ? 1 : -1));
  return json({ ok: true, orders });
}
export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.ORDERS) return json({ ok: false, error: "KV 未绑定" }, 503);
  if (!authed(request, env)) return json({ ok: false, error: "unauthorized" }, 401);
  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "");
  if (!id) return json({ ok: false, error: "missing id" }, 400);
  if (body.action === "delete") { await env.ORDERS.delete("order:" + id); return json({ ok: true }); }
  if (body.action === "status") {
    const raw = await env.ORDERS.get("order:" + id);
    if (!raw) return json({ ok: false, error: "not found" }, 404);
    const o = JSON.parse(raw);
    o.status = ["pending", "formed", "paid", "done", "cancelled"].includes(body.status) ? body.status : o.status;
    await env.ORDERS.put("order:" + id, JSON.stringify(o));
    return json({ ok: true, status: o.status });
  }
  return json({ ok: false, error: "unknown action" }, 400);
}
