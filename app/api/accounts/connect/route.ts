import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { signOAuthState, type OAuthProvider } from "@/lib/oauth/state";
import { buildAuthorizeUrl } from "@/lib/oauth/urls";
import { randomBytes } from "crypto";

export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let provider: OAuthProvider;
  try {
    const body = (await request.json()) as { provider?: string };
    if (body.provider !== "gmail" && body.provider !== "outlook") {
      return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
    }
    provider = body.provider;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const state = signOAuthState({
    userId: user.id,
    provider,
    nonce: randomBytes(16).toString("hex"),
  });

  try {
    const authorizationUrl = buildAuthorizeUrl(provider, state);
    return NextResponse.json({ authorizationUrl });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Config error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
