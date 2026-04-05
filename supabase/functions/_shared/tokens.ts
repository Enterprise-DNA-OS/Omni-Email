const IV_LEN = 12;
const TAG_LEN = 128; // bits for AES-GCM

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** Matches Node `lib/crypto/tokens.ts`: base64(iv12 || ciphertext||tag). */
export async function decryptSecret(b64: string, keyHex: string): Promise<string> {
  const bin = atob(b64);
  const raw = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) raw[i] = bin.charCodeAt(i);
  if (raw.length < IV_LEN + 17) {
    throw new Error("Invalid ciphertext");
  }
  const iv = raw.slice(0, IV_LEN);
  const encWithTag = raw.slice(IV_LEN);
  const keyBytes = hexToBytes(keyHex);
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv, tagLength: TAG_LEN },
    key,
    encWithTag,
  );
  return new TextDecoder().decode(plain);
}

/** Refresh jobs re-encrypt tokens using the same wire format as Node. */
export async function encryptSecret(plain: string, keyHex: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const keyBytes = hexToBytes(keyHex);
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt"]);
  const encWithTag = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, tagLength: TAG_LEN },
      key,
      new TextEncoder().encode(plain),
    ),
  );
  const out = new Uint8Array(IV_LEN + encWithTag.length);
  out.set(iv, 0);
  out.set(encWithTag, IV_LEN);
  return btoa(String.fromCharCode(...out));
}
