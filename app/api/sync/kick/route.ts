import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncCalendarsDue } from "@/lib/calendar/sync";
import { syncDueAccounts } from "@/lib/email/sync";

export const maxDuration = 60;

export async function POST(): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Sync one account per manual kick to stay within timeout
  const mail = await syncDueAccounts({ userId: user.id, limit: 1 });
  await syncCalendarsDue({ userId: user.id, limit: 1 });
  return NextResponse.json({ mail });
}
