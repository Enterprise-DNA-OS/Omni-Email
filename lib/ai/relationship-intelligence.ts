/**
 * Relationship Intelligence
 *
 * Builds and maintains a persistent contacts table from message history.
 * Computes relationship scores based on frequency, recency, response time,
 * and bidirectionality. Detects contacts that have gone unanswered.
 *
 * All writes use createAdminClient() (bypasses RLS). Reads use createAdminClient()
 * too because this module is only ever called from authenticated API routes after
 * the caller has already verified the user session.
 */

import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function extractEmailAndName(sender: string): { email: string; name: string | null } {
  const match = sender.match(/^(.*?)\s*<([^>]+)>\s*$/);
  if (match) {
    const name = match[1].trim().replace(/^["']|["']$/g, "") || null;
    return { name, email: match[2].trim().toLowerCase() };
  }
  return { email: sender.trim().toLowerCase(), name: null };
}

function extractDomain(email: string): string | null {
  const parts = email.split("@");
  return parts.length === 2 ? parts[1].toLowerCase() : null;
}

/** Returns a score 0–100 based on days since last contact (100 = today, 0 = >180 days). */
function recencyScore(lastAt: Date | null): number {
  if (!lastAt) return 0;
  const daysSince = (Date.now() - lastAt.getTime()) / (1000 * 60 * 60 * 24);
  return Math.max(0, 100 - (daysSince / 180) * 100);
}

/** Returns a score 0–100 based on message count (saturates at 50 messages). */
function frequencyScore(count: number): number {
  return Math.min(100, (count / 50) * 100);
}

/** Returns a score 0–100 based on avg response time in hours (0h=100, 48h+=0). */
function responseTimeScore(avgHours: number | null): number {
  if (avgHours === null) return 50; // no data — neutral
  return Math.max(0, 100 - (avgHours / 48) * 100);
}

/** Returns 100 if both inbound and outbound exist, 0 otherwise. */
function bidirectionalityScore(countIn: number, countOut: number): number {
  return countIn > 0 && countOut > 0 ? 100 : 0;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Scan all messages for the given user, extract unique senders and recipients,
 * and upsert them into the contacts table with computed aggregate fields.
 *
 * This is a full rebuild — safe to call repeatedly. It does not delete contacts
 * that no longer appear in messages (they may have been manually added).
 */
export async function buildContactsFromMessages(userId: string): Promise<void> {
  const admin = createAdminClient();

  // Fetch all user account IDs so we can identify outbound messages
  const { data: accountRows, error: accErr } = await admin
    .from("accounts")
    .select("id, email_address")
    .eq("user_id", userId);

  if (accErr) throw new Error(`Failed to fetch accounts: ${accErr.message}`);

  const userEmailAddresses = new Set(
    (accountRows ?? []).map((a) => (a.email_address as string).toLowerCase()),
  );
  const userAccountIds = new Set((accountRows ?? []).map((a) => a.id as string));

  // Fetch all threads for user
  const { data: threads, error: tErr } = await admin
    .from("threads")
    .select("id")
    .eq("user_id", userId);

  if (tErr) throw new Error(`Failed to fetch threads: ${tErr.message}`);
  if (!threads || threads.length === 0) return;

  const threadIds = threads.map((t) => t.id as string);

  // Fetch all messages — process in batches of 1000 to stay within Supabase limits
  const BATCH = 1000;
  let offset = 0;
  const allMessages: Array<{
    thread_id: string;
    account_id: string;
    sender: string | null;
    recipients: unknown;
    message_at: string;
  }> = [];

  while (true) {
    const { data: msgs, error: mErr } = await admin
      .from("messages")
      .select("thread_id, account_id, sender, recipients, message_at")
      .in("thread_id", threadIds)
      .order("message_at", { ascending: true })
      .range(offset, offset + BATCH - 1);

    if (mErr) throw new Error(`Failed to fetch messages: ${mErr.message}`);
    if (!msgs || msgs.length === 0) break;
    allMessages.push(
      ...(msgs as Array<{
        thread_id: string;
        account_id: string;
        sender: string | null;
        recipients: unknown;
        message_at: string;
      }>),
    );
    if (msgs.length < BATCH) break;
    offset += BATCH;
  }

  // Build contact map: email → aggregated fields
  interface ContactAccum {
    name: string | null;
    domain: string | null;
    firstSeenAt: Date;
    lastInboundAt: Date | null;
    lastOutboundAt: Date | null;
    messageCountIn: number;
    messageCountOut: number;
    // For avg response time: track pairs [inbound_at, outbound_at] within threads
    // Simple heuristic: collect inbound timestamps and their matching outbound replies
    responsePairsSeconds: number[];
    // Track last inbound per thread to pair with next outbound
    lastInboundPerThread: Map<string, Date>;
  }

  const contactMap = new Map<string, ContactAccum>();

  function getOrCreate(email: string, name: string | null, msgAt: Date): ContactAccum {
    const existing = contactMap.get(email);
    if (existing) return existing;
    const entry: ContactAccum = {
      name,
      domain: extractDomain(email),
      firstSeenAt: msgAt,
      lastInboundAt: null,
      lastOutboundAt: null,
      messageCountIn: 0,
      messageCountOut: 0,
      responsePairsSeconds: [],
      lastInboundPerThread: new Map(),
    };
    contactMap.set(email, entry);
    return entry;
  }

  for (const msg of allMessages) {
    const msgAt = new Date(msg.message_at);
    const isOutbound = userAccountIds.has(msg.account_id);

    if (isOutbound) {
      // Recipients of outbound messages are the contacts
      const recipients = (msg.recipients ?? []) as Array<{ email?: string; name?: string } | string>;
      for (const r of recipients) {
        const raw = typeof r === "string" ? r : (r.email ?? "");
        if (!raw) continue;
        const { email, name } = extractEmailAndName(raw);
        if (!email || userEmailAddresses.has(email)) continue;

        const entry = getOrCreate(email, name ?? (typeof r === "object" ? (r.name ?? null) : null), msgAt);
        entry.messageCountOut++;
        if (!entry.lastOutboundAt || msgAt > entry.lastOutboundAt) {
          entry.lastOutboundAt = msgAt;
        }
        if (msgAt < entry.firstSeenAt) entry.firstSeenAt = msgAt;

        // Pair: if there was a previous inbound from this contact in this thread,
        // record response time
        const lastIn = entry.lastInboundPerThread.get(msg.thread_id);
        if (lastIn && msgAt > lastIn) {
          const seconds = Math.round((msgAt.getTime() - lastIn.getTime()) / 1000);
          entry.responsePairsSeconds.push(seconds);
          entry.lastInboundPerThread.delete(msg.thread_id);
        }
      }
    } else {
      // Inbound — sender is the contact
      if (!msg.sender) continue;
      const { email, name } = extractEmailAndName(msg.sender);
      if (!email || userEmailAddresses.has(email)) continue;
      // Skip obvious no-reply / automated senders
      if (/no-?reply|noreply|donotreply|mailer-daemon/i.test(email)) continue;

      const entry = getOrCreate(email, name, msgAt);
      entry.messageCountIn++;
      if (!entry.lastInboundAt || msgAt > entry.lastInboundAt) {
        entry.lastInboundAt = msgAt;
      }
      if (msgAt < entry.firstSeenAt) entry.firstSeenAt = msgAt;
      // Store last inbound per thread for response pairing
      const existing = entry.lastInboundPerThread.get(msg.thread_id);
      if (!existing || msgAt > existing) {
        entry.lastInboundPerThread.set(msg.thread_id, msgAt);
      }
    }
  }

  if (contactMap.size === 0) return;

  // Build upsert rows
  const upsertRows = Array.from(contactMap.entries()).map(([email, entry]) => {
    const avgResponseSeconds =
      entry.responsePairsSeconds.length > 0
        ? entry.responsePairsSeconds.reduce((a, b) => a + b, 0) / entry.responsePairsSeconds.length
        : null;

    return {
      user_id: userId,
      email,
      name: entry.name,
      domain: entry.domain,
      last_inbound_at: entry.lastInboundAt?.toISOString() ?? null,
      last_outbound_at: entry.lastOutboundAt?.toISOString() ?? null,
      avg_response_time_hours:
        avgResponseSeconds !== null ? parseFloat((avgResponseSeconds / 3600).toFixed(2)) : null,
      message_count_in: entry.messageCountIn,
      message_count_out: entry.messageCountOut,
      first_seen_at: entry.firstSeenAt.toISOString(),
      updated_at: new Date().toISOString(),
    };
  });

  // Upsert in chunks of 500
  const UPSERT_CHUNK = 500;
  for (let i = 0; i < upsertRows.length; i += UPSERT_CHUNK) {
    const chunk = upsertRows.slice(i, i + UPSERT_CHUNK);
    const { error: uErr } = await admin
      .from("contacts")
      .upsert(chunk, {
        onConflict: "user_id,email",
        ignoreDuplicates: false,
      });
    if (uErr) throw new Error(`Failed to upsert contacts: ${uErr.message}`);
  }
}

/**
 * Compute relationship scores for all contacts belonging to the user and
 * write the updated relationship_score back to the contacts table.
 *
 * Score formula (0–100):
 *   frequency      × 0.30
 *   recency        × 0.30
 *   response_time  × 0.20
 *   bidirectional  × 0.20
 */
export async function computeRelationshipScores(userId: string): Promise<void> {
  const admin = createAdminClient();

  const { data: contacts, error } = await admin
    .from("contacts")
    .select(
      "id, message_count_in, message_count_out, last_inbound_at, last_outbound_at, avg_response_time_hours",
    )
    .eq("user_id", userId);

  if (error) throw new Error(`Failed to fetch contacts for scoring: ${error.message}`);
  if (!contacts || contacts.length === 0) return;

  const updates = contacts.map((c) => {
    const totalMessages = (c.message_count_in as number) + (c.message_count_out as number);
    const lastInbound = c.last_inbound_at ? new Date(c.last_inbound_at as string) : null;
    const lastOutbound = c.last_outbound_at ? new Date(c.last_outbound_at as string) : null;
    const lastAny = lastInbound && lastOutbound
      ? new Date(Math.max(lastInbound.getTime(), lastOutbound.getTime()))
      : lastInbound ?? lastOutbound;

    const freq = frequencyScore(totalMessages);
    const recency = recencyScore(lastAny);
    const response = responseTimeScore(c.avg_response_time_hours as number | null);
    const bidir = bidirectionalityScore(
      c.message_count_in as number,
      c.message_count_out as number,
    );

    const score = parseFloat(
      (freq * 0.3 + recency * 0.3 + response * 0.2 + bidir * 0.2).toFixed(2),
    );

    return { id: c.id as string, relationship_score: score, updated_at: new Date().toISOString() };
  });

  // Upsert scores in chunks
  const CHUNK = 500;
  for (let i = 0; i < updates.length; i += CHUNK) {
    const chunk = updates.slice(i, i + CHUNK);
    const { error: uErr } = await admin
      .from("contacts")
      .upsert(chunk, { onConflict: "id" });
    if (uErr) throw new Error(`Failed to update relationship scores: ${uErr.message}`);
  }
}

export interface NeglectedContact {
  id: string;
  email: string;
  name: string | null;
  domain: string | null;
  relationship_score: number;
  last_inbound_at: string;
  last_outbound_at: string | null;
  message_count_in: number;
  daysSinceLastReply: number;
}

/**
 * Find contacts where the user has received messages more recently than they
 * have replied, by at least `days` days. Excludes one-off senders
 * (message_count_in <= 3).
 */
export async function detectNeglectedContacts(
  userId: string,
  days = 5,
): Promise<NeglectedContact[]> {
  const admin = createAdminClient();

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  // Contacts where last_inbound_at is older than `days` ago but more recent
  // than last_outbound_at (or there's no outbound at all), and count > 3
  const { data, error } = await admin
    .from("contacts")
    .select(
      "id, email, name, domain, relationship_score, last_inbound_at, last_outbound_at, message_count_in",
    )
    .eq("user_id", userId)
    .gt("message_count_in", 3)
    .lte("last_inbound_at", cutoff.toISOString())
    .order("last_inbound_at", { ascending: false });

  if (error) throw new Error(`Failed to fetch neglected contacts: ${error.message}`);

  const now = Date.now();
  return (data ?? [])
    .filter((c) => {
      // Must have inbound more recent than outbound (or no outbound)
      if (!c.last_inbound_at) return false;
      if (!c.last_outbound_at) return true;
      return new Date(c.last_inbound_at as string) > new Date(c.last_outbound_at as string);
    })
    .map((c) => ({
      id: c.id as string,
      email: c.email as string,
      name: c.name as string | null,
      domain: c.domain as string | null,
      relationship_score: c.relationship_score as number,
      last_inbound_at: c.last_inbound_at as string,
      last_outbound_at: c.last_outbound_at as string | null,
      message_count_in: c.message_count_in as number,
      daysSinceLastReply: Math.floor(
        (now - new Date(c.last_inbound_at as string).getTime()) / (1000 * 60 * 60 * 24),
      ),
    }));
}
