import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const publishableKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !publishableKey || !serviceKey) return json({ error: "Tracking is temporarily unavailable." }, 500);

    const body = await req.json();
    const orderNumber = String(body?.order_number ?? "").trim().toUpperCase();
    const phone = String(body?.phone ?? "").trim();
    if (!/^ROM-\d{8}-[A-F0-9]{8,32}$/.test(orderNumber) || phone.length < 7 || phone.length > 20) {
      return json({ error: "Enter a valid order reference and the phone number used at checkout." }, 400);
    }

    const client = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: order, error } = await client
      .from("orders")
      .select("id,order_number,fulfilment,order_status,tracking_update,total_kes,created_at")
      .eq("order_number", orderNumber)
      .eq("phone", phone)
      .maybeSingle();
    if (error) {
      console.error(error);
      return json({ error: "Tracking is temporarily unavailable. Please try again." }, 500);
    }
    if (!order) return json({ error: "Order not found. Check the reference and phone number, then try again." }, 404);

    const { data: items, error: itemsError } = await client
      .from("order_items")
      .select("item_name,quantity")
      .eq("order_id", order.id);
    if (itemsError) {
      console.error(itemsError);
      return json({ error: "Tracking is temporarily unavailable. Please try again." }, 500);
    }

    return json({
      order: {
        order_number: order.order_number,
        fulfilment: order.fulfilment,
        order_status: order.order_status,
        tracking_update: order.tracking_update,
        total_kes: order.total_kes,
        created_at: order.created_at,
        items: items ?? [],
      },
    });
  } catch (error) {
    console.error(error);
    return json({ error: "Enter a valid order reference and phone number." }, 400);
  }
});
