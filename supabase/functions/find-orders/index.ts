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
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) return json({ error: "Order search is temporarily unavailable." }, 500);

    const body = await req.json();
    const phone = String(body?.phone ?? "").trim();
    if (phone.length < 7 || phone.length > 20 || !/^[+0-9()\-\s]+$/.test(phone)) {
      return json({ error: "Enter the phone number used at checkout." }, 400);
    }

    const client = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: orders, error } = await client
      .from("orders")
      .select("order_number,created_at")
      .eq("phone", phone)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error(error);
      return json({ error: "Order search is temporarily unavailable. Please try again." }, 500);
    }

    return json({ orders: orders ?? [] });
  } catch (error) {
    console.error(error);
    return json({ error: "Enter the phone number used at checkout." }, 400);
  }
});
