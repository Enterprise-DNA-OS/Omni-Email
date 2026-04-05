import type { Context } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

// This is a Netlify Background Function — it can run up to 15 minutes.
// It syncs one account at a time, called by the scheduled function or manually.
export default async (req: Request, _context: Context) => {
  const secret = req.headers.get("x-sync-secret");
  const cronSecret = process.env.SYNC_CRON_SECRET;
  if (!cronSecret || secret !== cronSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const admin = createClient(supabaseUrl, serviceKey);

  // Pick accounts that are due for sync (not invalid, ordered by next_sync_at)
  const { data: accounts, error } = await admin
    .from("accounts")
    .select("id")
    .is("token_invalid_at", null)
    .order("next_sync_at", { ascending: true, nullsFirst: true })
    .limit(5);

  if (error || !accounts?.length) {
    return new Response(JSON.stringify({ message: "No accounts to sync", error: error?.message }));
  }

  // Call the internal sync endpoint for each account sequentially
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
  const results: { id: string; status: string }[] = [];

  for (const account of accounts) {
    try {
      const res = await fetch(`${appUrl}/api/internal/sync`, {
        method: "POST",
        headers: {
          "x-sync-secret": cronSecret,
          "x-account-id": account.id as string,
          "Content-Type": "application/json",
        },
      });
      results.push({ id: account.id as string, status: res.ok ? "synced" : `error:${res.status}` });
    } catch (e) {
      results.push({ id: account.id as string, status: `error:${e instanceof Error ? e.message : "unknown"}` });
    }
  }

  return new Response(JSON.stringify({ results }));
};

export const config = {
  path: "/api/background-sync",
};
