/**
 * GET /api/contacts/intelligence
 *
 * Returns enriched contacts with relationship metrics from the persistent
 * contacts table. Supports:
 *   ?sort=score|frequency|neglected   (default: score)
 *   ?domain=example.com               filter by email domain
 *   ?limit=50                         max rows (default 50, max 200)
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { detectNeglectedContacts } from "@/lib/ai/relationship-intelligence";

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
  const sort = url.searchParams.get("sort") ?? "score";
  const domain = url.searchParams.get("domain") ?? null;
  const rawLimit = parseInt(url.searchParams.get("limit") ?? "50", 10);
  const limit = Math.min(Math.max(1, isNaN(rawLimit) ? 50 : rawLimit), 200);

  // neglected sort is a special case — delegate to the intelligence module
  if (sort === "neglected") {
    try {
      const neglected = await detectNeglectedContacts(user.id);
      const sliced = neglected
        .filter((c) => !domain || c.domain === domain)
        .slice(0, limit);
      return NextResponse.json({ contacts: sliced, sort: "neglected" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  // Build query against the contacts table (RLS: user sees only their own rows)
  let query = supabase
    .from("contacts")
    .select(
      "id, name, email, domain, company, relationship_score, last_inbound_at, last_outbound_at, avg_response_time_hours, message_count_in, message_count_out, first_seen_at, created_at",
    )
    .eq("user_id", user.id)
    .limit(limit);

  if (domain) {
    query = query.eq("domain", domain);
  }

  if (sort === "frequency") {
    // Total message count descending
    query = query.order("message_count_in", { ascending: false });
  } else {
    // Default: score descending
    query = query.order("relationship_score", { ascending: false });
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ contacts: data ?? [], sort });
}
