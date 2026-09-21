// Minimal Cloudflare Access JWT verification (RS256 via JWKS).
// https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/validating-json/

interface Jwk {
  kid: string;
  kty: string;
  alg?: string;
  n: string;
  e: string;
}

let cache: { teamDomain: string; keys: Jwk[]; fetchedAt: number } | null = null;
const CACHE_MS = 60 * 60 * 1000;

async function getKeys(teamDomain: string, force = false): Promise<Jwk[]> {
  if (!force && cache && cache.teamDomain === teamDomain && Date.now() - cache.fetchedAt < CACHE_MS) return cache.keys;
  // Bounded so a stalled JWKS origin degrades to a 401 instead of hanging requests.
  const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`jwks fetch failed: ${res.status}`);
  const body = (await res.json()) as { keys: Jwk[] };
  cache = { teamDomain, keys: body.keys, fetchedAt: Date.now() };
  return body.keys;
}

function b64urlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function decodeJson<T>(b64url: string): T {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(b64url))) as T;
}

export async function verifyAccessJwt(token: string, teamDomain: string, aud: string): Promise<boolean> {
  try {
    const [h, p, s] = token.split(".");
    if (!h || !p || !s) return false;
    const header = decodeJson<{ alg: string; kid: string }>(h);
    const payload = decodeJson<{ aud?: string | string[]; exp?: unknown; nbf?: unknown }>(p);
    if (header.alg !== "RS256") return false;

    const now = Math.floor(Date.now() / 1000);
    // Claims are untrusted JSON: a missing exp must fail, not compare as false.
    if (typeof payload.exp !== "number" || payload.exp <= now) return false;
    if (typeof payload.nbf === "number" && payload.nbf > now + 60) return false;
    if (payload.aud === undefined) return false;
    const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!auds.includes(aud)) return false;

    let keys = await getKeys(teamDomain);
    let jwk = keys.find((k) => k.kid === header.kid);
    if (!jwk) {
      // Key rotation: refresh the JWKS once before rejecting.
      keys = await getKeys(teamDomain, true);
      jwk = keys.find((k) => k.kid === header.kid);
      if (!jwk) return false;
    }

    const key = await crypto.subtle.importKey(
      "jwk",
      { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const data = new TextEncoder().encode(`${h}.${p}`);
    return await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlToBytes(s), data);
  } catch {
    return false;
  }
}

/** Email claim from an already-verified token, for the settings page. */
export function accessEmail(token: string): string | null {
  try {
    const p = token.split(".")[1];
    return p ? (decodeJson<{ email?: string }>(p).email ?? null) : null;
  } catch {
    return null;
  }
}
