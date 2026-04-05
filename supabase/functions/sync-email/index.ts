import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * Optional Edge entrypoint: call your deployed Next.js cron URL instead of duplicating sync logic.
 * Set SYNC_TARGET_URL to e.g. https://your-app.vercel.app/api/internal/sync
 * and invoke with header x-sync-secret matching SYNC_CRON_SECRET.
 */
Deno.serve(async (req) => {
  const target = Deno.env.get("SYNC_TARGET_URL");
  const secret = Deno.env.get("SYNC_CRON_SECRET");
  if (!target || !secret) {
    return new Response("Missing SYNC_TARGET_URL or SYNC_CRON_SECRET", { status: 500 });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  const res = await fetch(target, {
    method: "POST",
    headers: { "x-sync-secret": secret },
  });
  const body = await res.text();
  return new Response(body, { status: res.status, headers: { "Content-Type": "application/json" } });
});
