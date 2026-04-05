import crypto from "crypto";

export type OAuthProvider = "gmail" | "outlook";

export type OAuthStatePayload = {
  userId: string;
  provider: OAuthProvider;
  nonce: string;
};

function secret(): string {
  const s = process.env.OAUTH_STATE_SECRET;
  if (!s || s.length < 16) {
    throw new Error("OAUTH_STATE_SECRET must be set (min 16 chars)");
  }
  return s;
}

export function signOAuthState(payload: OAuthStatePayload): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyOAuthState(signed: string): OAuthStatePayload {
  const [body, sig] = signed.split(".");
  if (!body || !sig) {
    throw new Error("Invalid state");
  }
  const expected = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error("Invalid state signature");
  }
  const raw = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as OAuthStatePayload;
  if (!raw.userId || !raw.provider || !raw.nonce) {
    throw new Error("Malformed state");
  }
  if (raw.provider !== "gmail" && raw.provider !== "outlook") {
    throw new Error("Bad provider");
  }
  return raw;
}
