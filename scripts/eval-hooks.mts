// Runs every hook in evals/hooks.json through SpeakUp end to end (spoken audio -> transcription
// -> Claude feedback) and checks each rating against what's expected. macOS only: it uses the
// built-in `say` and `afconvert` to turn each script into speech.
//
//   node scripts/eval-hooks.mts <base-url> <test-email> [case-id ...]
//   e.g. node scripts/eval-hooks.mts https://zina-speakup.netlify.app/speakup test@example.com
//
// The test email should be in UNLIMITED_EMAILS so the run isn't stopped by the daily limit.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { analyze as Analyze } from "../src/lib/analysis";

// Node runs .ts files directly but needs the extension; TypeScript's project settings don't allow
// it in a static import, so load it at runtime with the type from the import above.
const { analyze } = (await import(new URL("../src/lib/analysis.ts", import.meta.url).href)) as { analyze: typeof Analyze };

type Case = { id: string; note: string; topic: string; expect: "strong" | "not_strong"; script: string };

const [base, email, ...only] = process.argv.slice(2);
if (!base || !email) {
  console.error("Usage: node scripts/eval-hooks.mts <base-url> <test-email> [case-id ...]");
  process.exit(1);
}
const { cases } = JSON.parse(readFileSync(new URL("../evals/hooks.json", import.meta.url), "utf8")) as { cases: Case[] };
const selected = only.length ? cases.filter((c) => only.includes(c.id)) : cases;
const dir = mkdtempSync(join(tmpdir(), "speakup-eval-"));

const signup = await fetch(`${base}/api/signup`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ first_name: "Eval", email }),
});
const cookie = signup.headers.get("set-cookie")?.split(";")[0];
if (!signup.ok || !cookie) throw new Error(`Sign-up failed: ${signup.status}`);

let failures = 0;
for (const c of selected) {
  execFileSync("say", ["-o", join(dir, `${c.id}.aiff`), c.script]);
  execFileSync("afconvert", ["-f", "m4af", "-d", "aac", join(dir, `${c.id}.aiff`), join(dir, `${c.id}.m4a`)]);

  const tr = await fetch(`${base}/api/transcribe`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "audio/mp4" },
    body: readFileSync(join(dir, `${c.id}.m4a`)),
  }).then((r) => r.json());
  const { stats } = analyze(tr.words ?? []);
  const fb = await fetch(`${base}/api/feedback`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ topic: c.topic, transcript: tr.transcript, stats, previous: null, target: null }),
  }).then((r) => r.json());

  const pass = fb.overall && (c.expect === "strong" ? fb.overall === "strong" : fb.overall !== "strong");
  if (!pass) failures++;
  console.log(`\n${pass ? "PASS" : "FAIL"}  ${c.id}  expected ${c.expect}, got ${fb.overall ?? fb.error}`);
  if (fb.overall) {
    console.log(`  grab: ${fb.mechanism} / ${fb.grab.rating}, early: ${fb.landsEarly}, payoff: ${fb.payoff.rating}`);
    if (fb.blockers.length) console.log(`  blockers: ${fb.blockers.join(" | ")}`);
    console.log(`  verdict: ${fb.verdict}`);
    console.log(`  fix: ${fb.fix}`);
  }
}
console.log(`\n${selected.length - failures}/${selected.length} passed`);
process.exit(failures ? 1 : 0);
