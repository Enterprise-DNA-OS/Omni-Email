import { NextResponse } from "next/server";
import { syncCalendarsDue } from "@/lib/calendar/sync";
import { syncDueAccounts, syncEmailAccount } from "@/lib/email/sync";
import { unsnoozeThreadsDue } from "@/lib/email/snooze";
import { processScheduledMessages } from "@/lib/email/scheduled";
import { processStaleThreads } from "@/lib/ai/auto-close-stale";

export const maxDuration = 60; // Netlify Pro allows up to 60s for Next.js routes

export async function POST(request: Request): Promise<Response> {
  const secret = request.headers.get("x-sync-secret");
  if (!secret || secret !== process.env.SYNC_CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // If a specific account ID is provided, sync just that account
  const accountId = request.headers.get("x-account-id");
  if (accountId) {
    try {
      await syncEmailAccount(accountId);
      return NextResponse.json({ synced: accountId });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "sync failed" },
        { status: 500 },
      );
    }
  }

  // Otherwise sync all due accounts
  const mail = await syncDueAccounts({ limit: 5 });
  await syncCalendarsDue({ limit: 5 });

  // Unsnooze threads whose snooze period has elapsed
  const unsnoozed = await unsnoozeThreadsDue().catch((e) => {
    console.error("unsnoozeThreadsDue error:", e);
    return 0;
  });

  // Send any scheduled messages whose send_at has passed
  const scheduled = await processScheduledMessages().catch((e) => {
    console.error("processScheduledMessages error:", e);
    return 0;
  });

  // Auto-close stale threads across all synced accounts
  // We collect the user IDs from the accounts that were just synced to scope the work.
  const staleResult = await (async () => {
    try {
      const { createAdminClient } = await import("@/lib/supabase/admin");
      const admin = createAdminClient();
      // Get distinct user IDs for recently-synced accounts.
      // We identify "recently synced" accounts as those scheduled for a future
      // sync (next_sync_at > now()), which means they completed at least one
      // successful sync cycle and have been re-queued.
      const { data: accounts } = await admin
        .from("accounts")
        .select("user_id")
        .not("next_sync_at", "is", null)
        .gt("next_sync_at", new Date().toISOString())
        .limit(20);

      const userIds = [...new Set((accounts ?? []).map((a) => a.user_id as string))];
      let totalArchived = 0;
      for (const uid of userIds.slice(0, 5)) {
        const { archived } = await processStaleThreads(uid).catch((e) => {
          console.error(`processStaleThreads error for user ${uid}:`, e);
          return { archived: 0, skipped: 0, errors: 0 };
        });
        totalArchived += archived;
      }
      return totalArchived;
    } catch (e) {
      console.error("auto-close-stale pipeline error:", e);
      return 0;
    }
  })();

  return NextResponse.json({ mail, unsnoozed, scheduled, staleArchived: staleResult });
}
