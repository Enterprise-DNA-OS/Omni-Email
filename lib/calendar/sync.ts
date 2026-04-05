import { createAdminClient } from "@/lib/supabase/admin";
import { getValidAccessToken } from "@/lib/email/sync";

type AccountRow = {
  id: string;
  provider: "gmail" | "outlook";
};

async function syncGoogleCalendars(account: AccountRow, token: string): Promise<void> {
  const admin = createAdminClient();
  const res = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Google calendarList failed: ${await res.text()}`);
  }
  const j = (await res.json()) as {
    items?: { id?: string; summary?: string }[];
  };
  for (const cal of j.items ?? []) {
    if (!cal.id) {
      continue;
    }
    const { data: calRow, error: ce } = await admin
      .from("calendars")
      .upsert(
        {
          account_id: account.id,
          provider_calendar_id: cal.id,
          name: cal.summary ?? cal.id,
        },
        { onConflict: "account_id,provider_calendar_id" },
      )
      .select("id")
      .single();
    if (ce || !calRow) {
      continue;
    }
    const calId = calRow.id as string;
    const timeMin = new Date(Date.now() - 7 * 86400_000).toISOString();
    const timeMax = new Date(Date.now() + 60 * 86400_000).toISOString();
    const evUrl = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events`,
    );
    evUrl.searchParams.set("timeMin", timeMin);
    evUrl.searchParams.set("timeMax", timeMax);
    evUrl.searchParams.set("singleEvents", "true");
    evUrl.searchParams.set("maxResults", "250");
    const evRes = await fetch(evUrl.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!evRes.ok) {
      continue;
    }
    const evJson = (await evRes.json()) as {
      items?: {
        id?: string;
        summary?: string;
        start?: { dateTime?: string; date?: string };
        end?: { dateTime?: string; date?: string };
      }[];
    };
    for (const ev of evJson.items ?? []) {
      if (!ev.id) {
        continue;
      }
      const start =
        ev.start?.dateTime ?? (ev.start?.date ? `${ev.start.date}T00:00:00.000Z` : null);
      const end = ev.end?.dateTime ?? (ev.end?.date ? `${ev.end.date}T23:59:59.999Z` : null);
      if (!start || !end) {
        continue;
      }
      await admin.from("events").upsert(
        {
          calendar_id: calId,
          provider_event_id: ev.id,
          title: ev.summary ?? "(event)",
          start_time: start,
          end_time: end,
          raw: ev as unknown as Record<string, unknown>,
        },
        { onConflict: "calendar_id,provider_event_id" },
      );
    }
  }
}

async function syncMicrosoftCalendars(account: AccountRow, token: string): Promise<void> {
  const admin = createAdminClient();
  const res = await fetch("https://graph.microsoft.com/v1.0/me/calendars", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Graph calendars failed: ${await res.text()}`);
  }
  const j = (await res.json()) as { value?: { id?: string; name?: string }[] };
  for (const cal of j.value ?? []) {
    if (!cal.id) {
      continue;
    }
    const { data: calRow, error: ce } = await admin
      .from("calendars")
      .upsert(
        {
          account_id: account.id,
          provider_calendar_id: cal.id,
          name: cal.name ?? cal.id,
        },
        { onConflict: "account_id,provider_calendar_id" },
      )
      .select("id")
      .single();
    if (ce || !calRow) {
      continue;
    }
    const calId = calRow.id as string;
    const start = new Date(Date.now() - 7 * 86400_000).toISOString();
    const end = new Date(Date.now() + 60 * 86400_000).toISOString();
    const u = new URL(`https://graph.microsoft.com/v1.0/me/calendars/${cal.id}/calendarView`);
    u.searchParams.set("startDateTime", start);
    u.searchParams.set("endDateTime", end);
    const evRes = await fetch(u.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!evRes.ok) {
      continue;
    }
    const evJson = (await evRes.json()) as {
      value?: {
        id?: string;
        subject?: string;
        start?: { dateTime?: string; date?: string };
        end?: { dateTime?: string; date?: string };
      }[];
    };
    for (const ev of evJson.value ?? []) {
      if (!ev.id) {
        continue;
      }
      const st = ev.start?.dateTime ?? ev.start?.date;
      const en = ev.end?.dateTime ?? ev.end?.date;
      if (!st || !en) {
        continue;
      }
      await admin.from("events").upsert(
        {
          calendar_id: calId,
          provider_event_id: ev.id,
          title: ev.subject ?? "(event)",
          start_time: new Date(st).toISOString(),
          end_time: new Date(en).toISOString(),
          raw: ev as unknown as Record<string, unknown>,
        },
        { onConflict: "calendar_id,provider_event_id" },
      );
    }
  }
}

export async function syncCalendarAccount(accountId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: account, error } = await admin
    .from("accounts")
    .select("id, provider")
    .eq("id", accountId)
    .maybeSingle();
  if (error || !account) {
    throw error ?? new Error("account not found");
  }
  const acc = account as AccountRow;
  const token = await getValidAccessToken(accountId);
  if (acc.provider === "gmail") {
    await syncGoogleCalendars(acc, token);
  } else {
    await syncMicrosoftCalendars(acc, token);
  }
}

export async function syncCalendarsDue(opts?: { userId?: string; limit?: number }): Promise<void> {
  const admin = createAdminClient();
  const limit = opts?.limit ?? 8;
  let q = admin.from("accounts").select("id").limit(limit);
  if (opts?.userId) {
    q = q.eq("user_id", opts.userId);
  }
  const { data: rows } = await q;
  for (const r of rows ?? []) {
    try {
      await syncCalendarAccount(r.id as string);
    } catch (err) {
      console.error(`[calendar-sync] account ${r.id} failed:`, err);
    }
  }
}
