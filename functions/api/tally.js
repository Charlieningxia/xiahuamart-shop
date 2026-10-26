// Public per-SKU ordered quantities for the storefront progress bars.
export async function onRequestGet(context) {
  const { env } = context;
  const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };
  if (!env.ORDERS) return new Response(JSON.stringify({ tally: {} }), { headers });
  const tally = {};
  let cursor;
  do {
    const page = await env.ORDERS.list({ prefix: "order:", cursor, limit: 200 });
    for (const k of page.keys) {
      const raw = await env.ORDERS.get(k.name);
      if (!raw) continue;
      try {
        const o = JSON.parse(raw);
        if (o.status === "cancelled") continue;
        for (const it of o.items || []) tally[it.sku] = (tally[it.sku] || 0) + it.qty;
      } catch (e) {}
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return new Response(JSON.stringify({ tally }), { headers });
}
