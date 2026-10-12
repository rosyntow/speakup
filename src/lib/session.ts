import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

// Server only. A signed cookie that remembers who signed up, so we don't need a user database.

export type Session = { email: string; firstName: string };

const COOKIE = "speakup_session";
const MAX_AGE = 60 * 60 * 24 * 180;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s && process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET is not set");
  return s || "dev-only-secret";
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export async function getSession(): Promise<Session | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const [payload, sig] = raw.split(".");
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString()) as Session;
  } catch {
    return null;
  }
}

export async function setSession(session: Session) {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  (await cookies()).set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/speakup",
    maxAge: MAX_AGE,
  });
}

export function cleanEmail(v: unknown) {
  const s = String(v ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) && s.length <= 254 ? s : null;
}

export function clientIp(request: Request) {
  return (
    request.headers.get("x-nf-client-connection-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    "unknown"
  );
}
