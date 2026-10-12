"use client";

import { useState } from "react";
import { BASE, SITE } from "@/lib/base";

export type Account = { signedIn: true; firstName: string; used: number; limit: number; unlimited?: boolean };

export function SignupGate({ onSignedIn }: { onSignedIn: (a: Account) => void }) {
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${BASE}/api/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ first_name: firstName, email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.signedIn) throw new Error(data.error ?? "Something went wrong on our side. Please try again.");
      onSignedIn(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-6 pt-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-accent">Free hook coach</p>
        <h2 className="mt-2 font-serif text-4xl font-medium leading-[1.05] tracking-tight">
          Nail the first 3 seconds of your next video.
        </h2>
        <p className="mt-3 text-[17px] leading-relaxed text-ink-soft">
          Say your hook out loud. SpeakUp measures your pace, filler words and pauses, then tells you exactly what to
          fix before you film. Take after take, until it lands.
        </p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-3 rounded-[20px] border border-line bg-card p-5">
        <input
          required
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          placeholder="First name"
          autoComplete="given-name"
          className="rounded-xl border border-line-strong bg-bg px-4 py-3 text-base outline-none focus:border-accent"
        />
        <input
          required
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          autoComplete="email"
          className="rounded-xl border border-line-strong bg-bg px-4 py-3 text-base outline-none focus:border-accent"
        />
        <button
          disabled={busy}
          className="mt-1 rounded-full bg-ink px-6 py-3.5 text-base font-semibold text-white disabled:opacity-60"
        >
          {busy ? "One sec…" : "Start practising, free"}
        </button>
        {error && <p className="text-sm text-bad">{error}</p>}
        <p className="text-xs leading-relaxed text-muted">
          You&apos;ll get occasional emails from me about creating with AI; unsubscribe any time. Your recordings are
          transcribed and then discarded, never stored. <a className="underline" href={`${SITE}/privacy.html`}>Privacy policy</a>
        </p>
      </form>
    </section>
  );
}
