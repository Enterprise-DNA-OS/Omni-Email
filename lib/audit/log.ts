import { createAdminClient } from "@/lib/supabase/admin";

export interface AuditLogEntry {
  id: string;
  user_id: string;
  actor: "user" | "system" | "rule";
  action: string;
  target_type: string;
  target_id: string | null;
  details: Record<string, unknown>;
  reversible: boolean;
  undone_at: string | null;
  created_at: string;
}

export interface LogAuditEventParams {
  userId: string;
  actor: "user" | "system" | "rule";
  action: string;
  targetType: string;
  targetId?: string;
  details?: Record<string, unknown>;
  reversible?: boolean;
}

/**
 * Write an audit log entry using the admin client (bypasses RLS).
 * Returns the inserted entry including its generated id.
 */
export async function logAuditEvent(params: LogAuditEventParams): Promise<AuditLogEntry> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("audit_log")
    .insert({
      user_id: params.userId,
      actor: params.actor,
      action: params.action,
      target_type: params.targetType,
      target_id: params.targetId ?? null,
      details: params.details ?? {},
      reversible: params.reversible ?? false,
    })
    .select()
    .single();

  if (error) {
    // Audit failures must not crash the main operation; log and rethrow for caller awareness
    throw new Error(`audit_log insert failed: ${error.message}`);
  }

  return data as AuditLogEntry;
}
