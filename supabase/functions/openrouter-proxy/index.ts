const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // 1. Verify JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

    const url = new URL(req.url);

    // ── /config endpoint — returns non-secret config values to the frontend ──
    if (url.pathname.endsWith("/config")) {
      const { data: gcid } = await serviceClient.rpc("get_secret", { secret_name: "google_client_id" });
      return new Response(JSON.stringify({ google_client_id: gcid || "" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Default: proxy to OpenRouter ──
    const { data: openrouterKey, error: keyError } = await serviceClient.rpc("get_secret", { secret_name: "openrouter_key" });
    if (keyError || !openrouterKey) return new Response("Missing API key", { status: 500, headers: corsHeaders });

    const body = await req.json();
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openrouterKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://aviator-ai.app",
        "X-Title": "Aviator AI",
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: response.status,
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});