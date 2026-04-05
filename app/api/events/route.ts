import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const startParam = url.searchParams.get("start");
  const endParam = url.searchParams.get("end");
  const accountId = url.searchParams.get("accountId");

  const start = startParam ?? new Date().toISOString();
  const end = endParam ?? new Date(Date.now() + 7 * 86400_000).toISOString();

  // First get accounts belonging to this user
  const { data: userAccounts } = await supabase
    .from("accounts")
    .select("id")
    .eq("user_id", user.id);
  const userAccountIds = (userAccounts ?? []).map((a) => a.id as string);
  if (userAccountIds.length === 0) {
    return NextResponse.json({ events: [] });
  }

  let calQuery = supabase.from("calendars").select("id, account_id").in("account_id", userAccountIds);
  if (accountId) {
    calQuery = calQuery.eq("account_id", accountId);
  }
  const { data: cals, error: cErr } = await calQuery;
  if (cErr) {
    return NextResponse.json({ error: cErr.message }, { status: 500 });
  }
  const calIds = (cals ?? []).map((c) => c.id as string);
  if (calIds.length === 0) {
    return NextResponse.json({ events: [] });
  }

  const { data: events, error: eErr } = await supabase
    .from("events")
    .select("id, title, start_time, end_time, calendar_id")
    .in("calendar_id", calIds)
    .gte("start_time", start)
    .lte("start_time", end)
    .order("start_time", { ascending: true });

  if (eErr) {
    return NextResponse.json({ error: eErr.message }, { status: 500 });
  }

  const calMeta = new Map(
    (cals ?? []).map((c) => [
      c.id as string,
      { accountId: c.account_id as string },
    ]),
  );
  const accIds = [...new Set((cals ?? []).map((c) => c.account_id as string))];
  const { data: accs } = await supabase
    .from("accounts")
    .select("id, provider, email_address")
    .in("id", accIds)
    .eq("user_id", user.id);

  const accMap = Object.fromEntries(
    (accs ?? []).map((a) => [
      a.id as string,
      { provider: a.provider as string, emailAddress: a.email_address as string },
    ]),
  );

  const out = (events ?? []).map((ev) => {
    const meta = calMeta.get(ev.calendar_id as string);
    const acc = meta ? accMap[meta.accountId] : undefined;
    return {
      id: ev.id,
      title: ev.title,
      startTime: ev.start_time,
      endTime: ev.end_time,
      calendarId: ev.calendar_id,
      account: acc ?? null,
    };
  });

  return NextResponse.json({ events: out });
}
