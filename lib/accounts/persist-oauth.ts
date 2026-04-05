import { createAdminClient } from "@/lib/supabase/admin";
import { encryptSecret } from "@/lib/crypto/tokens";
import type { OAuthProvider } from "@/lib/oauth/state";

type TokenSet = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
};

export async function upsertProviderAccount(
  userId: string,
  provider: OAuthProvider,
  emailAddress: string,
  tokens: TokenSet,
): Promise<{ accountId: string }> {
  const admin = createAdminClient();
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  const { data: existing, error: findErr } = await admin
    .from("accounts")
    .select("id")
    .eq("user_id", userId)
    .eq("provider", provider)
    .eq("email_address", emailAddress)
    .maybeSingle();

  if (findErr) {
    throw findErr;
  }

  const accessEnc = encryptSecret(tokens.access_token);
  const refreshEnc = tokens.refresh_token ? encryptSecret(tokens.refresh_token) : null;

  let accountId = existing?.id as string | undefined;

  if (!accountId) {
    const { data: ins, error: insErr } = await admin
      .from("accounts")
      .insert({
        user_id: userId,
        provider,
        email_address: emailAddress,
        token_expires_at: expiresAt,
        token_invalid_at: null,
        sync_state: {},
        next_sync_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (insErr || !ins) {
      throw insErr ?? new Error("insert account failed");
    }
    accountId = ins.id as string;
  } else {
    const { error: upErr } = await admin
      .from("accounts")
      .update({
        token_expires_at: expiresAt,
        token_invalid_at: null,
        next_sync_at: new Date().toISOString(),
      })
      .eq("id", accountId);
    if (upErr) {
      throw upErr;
    }
  }

  const { error: credErr } = await admin.from("account_credentials").upsert(
    {
      account_id: accountId,
      access_token_ciphertext: accessEnc,
      refresh_token_ciphertext: refreshEnc,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "account_id" },
  );

  if (credErr) {
    throw credErr;
  }

  return { accountId };
}
