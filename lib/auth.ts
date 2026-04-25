import crypto from "crypto";

type TokenPayload = {
  sub: string;
  name: string;
  email: string;
  exp: number;
};

function base64UrlEncode(input: string | Buffer) {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlDecodeToString(input: string) {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(b64, "base64").toString("utf8");
}

function getSecret() {
  const secret = process.env.AUTH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV !== "production") return "dev-insecure-auth-secret";
  throw new Error("Missing AUTH_SECRET env var");
}

export function signAuthToken(user: { id: string; name: string; email: string }, opts?: { expiresInSeconds?: number }) {
  const expiresInSeconds = opts?.expiresInSeconds ?? 60 * 60 * 24 * 7;
  const payload: TokenPayload = {
    sub: user.id,
    name: user.name,
    email: user.email,
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
  };

  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const data = `${encodedHeader}.${encodedPayload}`;

  const sig = crypto.createHmac("sha256", getSecret()).update(data).digest();
  const encodedSig = base64UrlEncode(sig);
  return `${data}.${encodedSig}`;
}

export function verifyAuthToken(token: string): { ok: true; payload: TokenPayload } | { ok: false } {
  try {
    const [encodedHeader, encodedPayload, encodedSig] = token.split(".");
    if (!encodedHeader || !encodedPayload || !encodedSig) return { ok: false };

    const data = `${encodedHeader}.${encodedPayload}`;
    const expected = crypto.createHmac("sha256", getSecret()).update(data).digest();
    const actual = Buffer.from(
      encodedSig
        .replace(/-/g, "+")
        .replace(/_/g, "/")
        .padEnd(Math.ceil(encodedSig.length / 4) * 4, "="),
      "base64",
    );

    if (actual.length !== expected.length) return { ok: false };
    if (!crypto.timingSafeEqual(actual, expected)) return { ok: false };

    const payloadStr = base64UrlDecodeToString(encodedPayload);
    const payload = JSON.parse(payloadStr) as TokenPayload;

    if (!payload?.sub || !payload?.exp) return { ok: false };
    if (typeof payload.exp !== "number") return { ok: false };

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) return { ok: false };

    return { ok: true, payload };
  } catch {
    return { ok: false };
  }
}
