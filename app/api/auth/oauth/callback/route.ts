import { NextResponse } from "next/server";
import { verifyOAuthState } from "@/lib/oauth/state";
import {
  exchangeGoogleCode,
  exchangeMicrosoftCode,
  fetchGoogleUserEmail,
  fetchMicrosoftUserEmail,
} from "@/lib/oauth/urls";
import { upsertProviderAccount } from "@/lib/accounts/persist-oauth";

function appOrigin(): string {
  const u = process.env.NEXT_PUBLIC_APP_URL;
  if (!u) {
    throw new Error("NEXT_PUBLIC_APP_URL missing");
  }
  return u.replace(/\/$/, "");
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const err = url.searchParams.get("error");

  if (err) {
    return NextResponse.redirect(`${appOrigin()}/settings?oauth_error=${encodeURIComponent(err)}`);
  }
  if (!code || !state) {
    return NextResponse.redirect(`${appOrigin()}/settings?oauth_error=missing_params`);
  }

  let payload;
  try {
    payload = verifyOAuthState(state);
  } catch {
    return NextResponse.redirect(`${appOrigin()}/settings?oauth_error=invalid_state`);
  }

  try {
    if (payload.provider === "gmail") {
      const tokens = await exchangeGoogleCode(code);
      const email = await fetchGoogleUserEmail(tokens.access_token);
      await upsertProviderAccount(payload.userId, "gmail", email, tokens);
    } else {
      const tokens = await exchangeMicrosoftCode(code);
      const email = await fetchMicrosoftUserEmail(tokens.access_token);
      await upsertProviderAccount(payload.userId, "outlook", email, tokens);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "oauth_failed";
    return NextResponse.redirect(
      `${appOrigin()}/settings?oauth_error=${encodeURIComponent(msg)}`,
    );
  }

  return NextResponse.redirect(`${appOrigin()}/settings?connected=1`);
}
