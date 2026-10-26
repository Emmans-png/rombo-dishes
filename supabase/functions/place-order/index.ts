import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) return json({ error: "Server configuration missing" }, 500);
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const body = await req.json();
    const customer_name = String(body.customer_name ?? "").trim();
    const phone = String(body.phone ?? "").trim();
    const fulfilment = body.fulfilment;
    const delivery_address = String(body.delivery_address ?? "").trim();
    const payment_method = body.payment_method;
    const notes = String(body.notes ?? "").trim();
    const rawItems = body.items;
    if (customer_name.length < 1 || customer_name.length > 100) return json({ error: "Enter a valid name." }, 400);
    if (phone.length < 7 || phone.length > 20) return json({ error: "Enter a valid phone number." }, 400);
    if (!(["pickup", "delivery"].includes(fulfilment))) return json({ error: "Choose pickup or delivery." }, 400);
    if (fulfilment === "delivery" && (delivery_address.length < 4 || delivery_address.length > 300)) return json({ error: "Enter a delivery address." }, 400);
    if (notes.length > 500) return json({ error: "Notes are too long." }, 400);
    if (payment_method === "online_mpesa") return json({ error: "Online M-Pesa has not been configured. Choose cash or M-Pesa on pickup/delivery for now." }, 400);
    if (payment_method !== "cash_or_mpesa_on_collection") return json({ error: "Choose an available payment method." }, 400);
    if (!Array.isArray(rawItems) || rawItems.length < 1 || rawItems.length > 30) return json({ error: "Add between 1 and 30 menu items." }, 400);
    const quantities = new Map<string, number>();
    for (const item of rawItems) {
      const id = String(item.menu_item_id ?? "");
      const qty = Number(item.quantity);
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) || !Number.isInteger(qty) || qty < 1 || qty > 50) return json({ error: "One or more cart items are invalid." }, 400);
      quantities.set(id, (quantities.get(id) || 0) + qty);
    }
    const ids = [...quantities.keys()];
    const { data: menu, error: menuError } = await admin.from("menu_items").select("id,name,price_kes,is_available").in("id", ids);
    if (menuError) return json({ error: "Could not validate menu items." }, 500);
    if (!menu || menu.length !== ids.length || menu.some((m) => !m.is_available)) return json({ error: "A selected item is unavailable. Refresh the menu and try again." }, 400);
    const lines = menu.map((m) => ({ menu_item_id: m.id, item_name: m.name, unit_price_kes: Number(m.price_kes), quantity: quantities.get(m.id)!, line_total_kes: Number(m.price_kes) * quantities.get(m.id)! }));
    const total = Math.round(lines.reduce((sum, l) => sum + l.line_total_kes, 0) * 100) / 100;
    if (!Number.isFinite(total) || total <= 0) return json({ error: "Order total is invalid." }, 400);
    const order_number = `ROM-${new Date().toISOString().slice(0,10).replaceAll("-","")}-${crypto.randomUUID().slice(0,8).toUpperCase()}`;
    const { data: order, error: orderError } = await admin.from("orders").insert({ order_number, customer_name, phone, fulfilment, delivery_address: fulfilment === "delivery" ? delivery_address : "", payment_method, payment_status: "unpaid", order_status: "received", notes, total_kes: total }).select("id,order_number,total_kes").single();
    if (orderError || !order) { console.error(orderError); return json({ error: "Could not save order. Please try again." }, 500); }
    const { error: linesError } = await admin.from("order_items").insert(lines.map((l) => ({ ...l, order_id: order.id })));
    if (linesError) {
      console.error(linesError);
      await admin.from("orders").delete().eq("id", order.id);
      return json({ error: "Could not save order items. Please try again." }, 500);
    }
    return json({ order_number: order.order_number, total_kes: order.total_kes, payment_message: "Pay by cash or M-Pesa when collecting or receiving your order. No online payment has been taken." }, 201);
  } catch (err) {
    console.error(err);
    return json({ error: "Invalid request or server error." }, 400);
  }
});
