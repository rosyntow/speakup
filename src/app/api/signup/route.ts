import { after } from "next/server";
import { kitSubscribe } from "@/lib/kit";
import { usage } from "@/lib/limits";
import { cleanEmail, getSession, setSession } from "@/lib/session";

// GET: who's signed in and how many takes they have left today.
export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ signedIn: false });
  return Response.json({ signedIn: true, firstName: session.firstName, ...(await usage(session.email)) });
}

// POST { first_name, email }: sign up, add to Kit, remember them with a signed cookie.
export async function POST(request: Request) {
  const data = await request.json().catch(() => ({}));
  const email = cleanEmail(data.email);
  const firstName = String(data.first_name ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (!email) return Response.json({ error: "Please enter a valid email address." }, { status: 400 });

  // Best-effort and after the response: a slow or broken Kit shouldn't stop someone practising.
  after(() => kitSubscribe({ email, firstName, tags: ["SpeakUp"] }).catch((e) => console.error("[signup] Kit failed:", e)));

  try {
    await setSession({ email, firstName });
  } catch (e) {
    console.error("[signup] couldn't set session:", e);
    return Response.json({ error: "SpeakUp isn't fully set up yet. Please try again later." }, { status: 500 });
  }
  const started = Date.now();
  const used = await usage(email).catch((e) => {
    console.error(`[signup] usage lookup failed after ${Date.now() - started}ms:`, e);
    return null;
  });
  return Response.json({ signedIn: true, firstName, ...(used ?? { used: 0, limit: 10, unlimited: false }) });
}
