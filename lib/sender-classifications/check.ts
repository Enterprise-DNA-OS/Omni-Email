import { createAdminClient } from "@/lib/supabase/admin";

export type SenderClassification = "vip" | "safe" | "blocked" | "never_auto_send";

/**
 * Extract the domain part from an email address.
 * Returns null if the address is not a valid email.
 */
function extractDomain(email: string): string | null {
  const atIdx = email.lastIndexOf("@");
  if (atIdx < 1) return null;
  const domain = email.slice(atIdx + 1).toLowerCase().trim();
  return domain || null;
}

/**
 * Normalize an email address to lowercase for comparison.
 */
function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

/**
 * Check the classification for a sender by exact email AND extracted domain.
 * Exact email match takes precedence over domain match.
 * Uses the admin client so it is safe to call from the background sync pipeline.
 *
 * @returns The classification string, or null if no entry exists.
 */
export async function checkSenderClassification(
  userId: string,
  senderEmail: string,
): Promise<SenderClassification | null> {
  const admin = createAdminClient();
  const normalizedEmail = normalizeEmail(senderEmail);
  const domain = extractDomain(normalizedEmail);

  const lookupValues = [normalizedEmail];
  if (domain) {
    lookupValues.push(domain);
  }

  const { data, error } = await admin
    .from("sender_classifications")
    .select("email_or_domain, classification")
    .eq("user_id", userId)
    .in("email_or_domain", lookupValues);

  if (error || !data || data.length === 0) {
    return null;
  }

  // Prefer exact email match over domain match
  const exactMatch = data.find(
    (row) => (row.email_or_domain as string).toLowerCase() === normalizedEmail,
  );
  if (exactMatch) {
    return exactMatch.classification as SenderClassification;
  }

  const domainMatch = data.find(
    (row) => domain && (row.email_or_domain as string).toLowerCase() === domain,
  );
  if (domainMatch) {
    return domainMatch.classification as SenderClassification;
  }

  return null;
}

/**
 * Returns true if the sender is classified as VIP for this user.
 */
export async function isVipSender(userId: string, senderEmail: string): Promise<boolean> {
  const classification = await checkSenderClassification(userId, senderEmail);
  return classification === "vip";
}

/**
 * Returns true if the sender is classified as blocked for this user.
 */
export async function isBlockedSender(userId: string, senderEmail: string): Promise<boolean> {
  const classification = await checkSenderClassification(userId, senderEmail);
  return classification === "blocked";
}
