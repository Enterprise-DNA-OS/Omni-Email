/**
 * POST /api/contacts/rebuild
 *
 * Triggers a full rebuild of the contacts table for the authenticated user.
 * Scans all messages to extract contacts, then computes relationship scores.
 *
 * This is an expensive operation — callers should debounce or rate-limit.
 * Responds with the count of contacts written.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildContactsFromMessages,
  computeRelationshipScores,
} from "@/lib/ai/relationship-intelligence";

export async function POST(): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Step 1: Rebuild contact records from message history
    await buildContactsFromMessages(user.id);

    // Step 2: Score all contacts
    await computeRelationshipScores(user.id);

    // Step 3: Return count of contacts for the user
    const admin = createAdminClient();
    const { count, error: countErr } = await admin
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);

    if (countErr) {
      return NextResponse.json({ error: countErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, contactsBuilt: count ?? 0 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
