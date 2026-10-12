import { getStore } from "@netlify/blobs";

// Server only. Daily usage caps so a public page can't run up the AI bill.
// Counts live in Netlify Blobs; outside Netlify (local dev) they fall back to memory.

const LIMITS = {
  person: Number(process.env.DAILY_TAKES_PER_PERSON ?? 10),
  ip: Number(process.env.DAILY_TAKES_PER_IP ?? 20),
  global: Number(process.env.DAILY_TAKES_TOTAL ?? 300),
};

// Comma-separated emails that skip every daily cap (e.g. the owner). Their takes don't count
// toward the IP or overall caps either, so they never use up the public budget.
const UNLIMITED = new Set(
  (process.env.UNLIMITED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
);
const isUnlimited = (email: string) => UNLIMITED.has(email.toLowerCase());

const memory = new Map<string, number>();

let useMemory = false;

// Fetch for Blobs that reads each response in full before handing it back. On a missing key
// the library cancels the response body, and in this runtime that cancel never settles,
// which hung every first-take-of-the-day request. A pre-read body has nothing left to cancel.
// Also bypasses Next.js's fetch caching wrapper; these are always live reads and writes.
const blobsFetch: typeof fetch = async (input, init) => {
  const f = globalThis.fetch as typeof fetch & { _nextOriginalFetch?: typeof fetch };
  const res = await (f._nextOriginalFetch ?? f)(input, init);
  const body = await res.arrayBuffer();
  const empty = body.byteLength === 0 || res.status === 204 || res.status === 304;
  return new Response(empty ? null : body, { status: res.status, statusText: res.statusText, headers: res.headers });
};

async function withStore<T>(fn: (s: ReturnType<typeof getStore>) => Promise<T>, fallback: () => T): Promise<T> {
  if (useMemory) return fallback();
  // Cap each Blobs call so a slow store can't hang a request. The timer must be cleared:
  // Netlify waits for pending timers before finishing the response.
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      fn(getStore({ name: "speakup-usage", consistency: "strong", fetch: blobsFetch })),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Blobs request timed out")), 4000);
      }),
    ]);
  } catch (e) {
    // Only fall back when there's no Netlify environment at all (local dev).
    if (e instanceof Error && e.name === "MissingBlobsEnvironmentError") {
      console.log("[limits] Netlify Blobs unavailable, counting usage in memory");
      useMemory = true;
      return fallback();
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function read(key: string) {
  return withStore(
    async (s) => Number((await s.get(key)) ?? 0),
    () => memory.get(key) ?? 0,
  );
}

async function bump(key: string) {
  const next = (await read(key)) + 1;
  await withStore(
    async (s) => {
      await s.set(key, String(next));
    },
    () => {
      memory.set(key, next);
    },
  );
}

const today = () => new Date().toISOString().slice(0, 10);
const keys = (email: string, ip: string, kind: "takes" | "feedback") => {
  const d = today();
  return {
    person: `${d}/${kind}/person/${email}`,
    ip: `${d}/${kind}/ip/${ip}`,
    global: `${d}/${kind}/global`,
  };
};

export type Usage = { used: number; limit: number; unlimited: boolean };

export async function usage(email: string): Promise<Usage> {
  return { used: await read(keys(email, "", "takes").person), limit: LIMITS.person, unlimited: isUnlimited(email) };
}

// Call before transcribing. Returns an error message if a cap is hit, otherwise records the take.
export async function claimTake(email: string, ip: string): Promise<string | null> {
  const k = keys(email, ip, "takes");
  if (isUnlimited(email)) {
    await bump(k.person); // still counted, so feedback can be matched to takes
    return null;
  }
  const [person, byIp, global] = await Promise.all([read(k.person), read(k.ip), read(k.global)]);
  if (global >= LIMITS.global) return "SpeakUp has hit its daily limit. Come back tomorrow!";
  if (person >= LIMITS.person || byIp >= LIMITS.ip)
    return `You've used all ${LIMITS.person} takes for today. Come back tomorrow for more.`;
  await Promise.all([bump(k.person), bump(k.ip), bump(k.global)]);
  return null;
}

// Feedback is the expensive call, so allow at most one per recorded take.
export async function claimFeedback(email: string): Promise<boolean> {
  const takes = await read(keys(email, "", "takes").person);
  const fk = keys(email, "", "feedback").person;
  if ((await read(fk)) >= takes) return false;
  await bump(fk);
  return true;
}
