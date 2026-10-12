"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { BASE, SITE } from "@/lib/base";
import { analyze, type Stats, type Token, type Word } from "@/lib/analysis";
import type { Feedback } from "@/lib/feedback";
import { saveTake, takesStore } from "@/lib/history";
import { playableUrl } from "@/lib/playback";
import { HOOK_TOPICS, randomTopic } from "@/lib/topics";
import { SignupGate, type Account } from "./SignupGate";
import { TakeResult } from "./TakeResult";
import { useRecorder } from "./useRecorder";

type Result = {
  id: string;
  takeNumber: number;
  transcript: string;
  tokens: Token[];
  stats: Stats;
  feedback: Feedback | null; // null while Claude is still writing it
  feedbackError: string | null;
  audioUrl: string;
};

type Phase = "ready" | "processing" | "result";

async function postJson<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

export function HookDrill() {
  const [topic, setTopic] = useState(HOOK_TOPICS[0]); // fixed first topic avoids a server/client mismatch
  const [customDraft, setCustomDraft] = useState("");
  const [editingTopic, setEditingTopic] = useState(false);
  const [phase, setPhase] = useState<Phase>("ready");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  // Takes on the current topic this session, newest last.
  const [sessionTakes, setSessionTakes] = useState<Result[]>([]);
  const history = useSyncExternalStore(takesStore.subscribe, takesStore.getSnapshot, takesStore.getServerSnapshot);
  // undefined while checking, null when signed out.
  const [account, setAccount] = useState<Account | null | undefined>(undefined);

  useEffect(() => {
    fetch(`${BASE}/api/signup`)
      .then((r) => r.json())
      .then((a) => setAccount(a.signedIn ? a : null))
      .catch(() => setAccount(null));
  }, []);

  const handleTake = useCallback(
    async (audio: Blob) => {
      setPhase("processing");
      setError(null);
      // Prepare the listen-back copy while the take is being analysed.
      const audioUrlReady = playableUrl(audio);
      try {
        const { transcript, words } = await postJson<{ transcript: string; words: Word[] }>(`${BASE}/api/transcribe`, {
          method: "POST",
          headers: { "Content-Type": audio.type || "audio/webm" },
          body: audio,
        });
        setAccount((a) => (a ? { ...a, used: a.used + 1 } : a));
        if (words.length === 0) throw new Error("Didn't catch any speech. Check your mic and try again.");

        const { tokens, stats } = analyze(words);
        const prev = sessionTakes.findLast((t) => t.feedback);

        // Show the transcript and stats straight away; Claude's feedback fills in when it arrives.
        const id = crypto.randomUUID();
        const take: Result = {
          id,
          takeNumber: sessionTakes.length + 1,
          transcript,
          tokens,
          stats,
          feedback: null,
          feedbackError: null,
          audioUrl: await audioUrlReady,
        };
        setResult(take);
        setSessionTakes((t) => [...t, take]);
        setPhase("result");

        const update = (patch: Partial<Result>) => {
          setResult((r) => (r?.id === id ? { ...r, ...patch } : r));
          setSessionTakes((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));
        };
        try {
          const feedback = await postJson<Feedback>(`${BASE}/api/feedback`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              topic,
              transcript,
              stats,
              previous: prev?.feedback ? { transcript: prev.transcript, score: prev.feedback.score } : null,
            }),
          });
          update({ feedback });
          saveTake({ id, createdAt: Date.now(), topic, transcript, stats, feedback });
        } catch (e) {
          update({ feedbackError: e instanceof Error ? e.message : "Couldn't get feedback for this take." });
        }
      } catch (e) {
        void audioUrlReady.then((url) => URL.revokeObjectURL(url));
        setError(e instanceof Error ? e.message : "Something went wrong");
        setPhase("ready");
      }
    },
    [topic, sessionTakes],
  );

  const recorder = useRecorder(handleTake);

  const changeTopic = (next: string) => {
    sessionTakes.forEach((t) => URL.revokeObjectURL(t.audioUrl));
    setTopic(next);
    setSessionTakes([]);
    setResult(null);
    setPhase("ready");
    setEditingTopic(false);
  };

  const last = sessionTakes.findLast((t) => t.feedback);
  const waitingForFeedback = !!result && !result.feedback && !result.feedbackError;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 pb-16 pt-6">
      <header className="flex items-center justify-between">
        <a href={`${BASE}/`} className="font-serif text-2xl font-medium tracking-tight">
          Speak<span className="italic text-accent">Up</span>
        </a>
        <a href={SITE} className="text-sm text-muted hover:text-ink">
          by Zina Nyarko
        </a>
      </header>

      {account === undefined ? (
        <div className="h-64 animate-pulse rounded-[20px] bg-surface" />
      ) : account === null ? (
        <SignupGate onSignedIn={setAccount} />
      ) : phase === "result" && result ? (
        <>
          <TakeResult {...result} />
          <div className="sticky bottom-4 flex gap-3">
            <button
              onClick={() => setPhase("ready")}
              disabled={waitingForFeedback}
              className="flex-1 rounded-full bg-accent px-6 py-4 text-base font-semibold text-accent-ink shadow-lg active:scale-[0.98] disabled:opacity-50"
            >
              Try again
            </button>
            <button
              onClick={() => changeTopic(randomTopic(topic))}
              disabled={waitingForFeedback}
              className="rounded-full bg-surface-strong px-6 py-4 text-base font-semibold active:scale-[0.98] disabled:opacity-50"
            >
              New topic
            </button>
          </div>
        </>
      ) : (
        <>
          <section className="rounded-[20px] border border-line bg-card p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-muted">Your hook topic</span>
              {phase === "ready" && recorder.state === "idle" && (
                <div className="flex gap-3 text-sm font-medium text-accent">
                  <button onClick={() => changeTopic(randomTopic(topic))}>Shuffle</button>
                  <button onClick={() => setEditingTopic((v) => !v)}>{editingTopic ? "Cancel" : "Use my own"}</button>
                </div>
              )}
            </div>
            {editingTopic ? (
              <form
                className="mt-3 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (customDraft.trim()) changeTopic(customDraft.trim());
                }}
              >
                <input
                  autoFocus
                  value={customDraft}
                  onChange={(e) => setCustomDraft(e.target.value)}
                  placeholder="What's your video about?"
                  className="min-w-0 flex-1 rounded-xl border border-line bg-bg px-3 py-2 text-base outline-none focus:border-accent"
                />
                <button className="rounded-xl bg-accent px-4 font-semibold text-accent-ink">Set</button>
              </form>
            ) : (
              <p className="mt-2 font-serif text-[28px] font-medium leading-tight tracking-tight">{topic}</p>
            )}
            {last && (
              <div className="mt-4 border-t border-line pt-3 text-sm">
                <span className="text-muted">
                  Take {sessionTakes.length + 1} · last score {last.feedback?.score}/10
                </span>
                <p className="mt-1 font-medium">Focus: {last.feedback?.focusNextTake}</p>
              </div>
            )}
          </section>

          <section className="flex flex-col items-center gap-4 py-6">
            {phase === "processing" ? (
              <>
                <div className="h-28 w-28 animate-pulse rounded-full bg-accent/20" />
                <p className="text-muted">Listening back to your take…</p>
              </>
            ) : recorder.state === "countdown" ? (
              <>
                <div className="flex h-28 w-28 items-center justify-center rounded-full bg-accent/15 text-5xl font-bold tabular-nums text-accent">
                  {recorder.countdown}
                </div>
                <p className="text-muted">Get ready. Start talking when the timer starts.</p>
                <button onClick={recorder.discard} className="text-sm font-medium text-muted underline underline-offset-4">
                  Cancel
                </button>
              </>
            ) : recorder.state === "recording" ? (
              <>
                <button
                  onClick={recorder.finish}
                  aria-label="Stop recording and get feedback"
                  className="relative flex h-28 w-28 items-center justify-center rounded-full bg-accent shadow-lg"
                >
                  <span className="absolute inset-0 animate-ping rounded-full bg-accent/40" />
                  <span className="relative h-9 w-9 rounded-lg bg-accent-ink" />
                </button>
                <p className="tabular-nums text-muted">
                  {recorder.elapsed.toFixed(1)}s / {recorder.maxSeconds}s · tap when you&apos;re done
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={recorder.restart}
                    className="rounded-full border border-line-strong bg-card px-5 py-2.5 text-sm font-semibold"
                  >
                    ↺ Start over
                  </button>
                  <button
                    onClick={recorder.discard}
                    className="rounded-full px-5 py-2.5 text-sm font-semibold text-muted"
                  >
                    Discard
                  </button>
                </div>
                <p className="text-xs text-muted">False start? Starting over doesn&apos;t use up a take.</p>
              </>
            ) : (
              <>
                <button
                  onClick={recorder.start}
                  aria-label="Start recording"
                  className="flex h-28 w-28 items-center justify-center rounded-full bg-accent shadow-lg transition active:scale-95"
                >
                  <span className="h-10 w-10 rounded-full bg-accent-ink" />
                </button>
                <p className="text-center text-muted">
                  Tap, then deliver your hook like the camera is rolling.
                  <br />
                  Aim for the first 3 seconds; keep going if you like.
                </p>
                <p className="text-sm font-medium text-muted">
                  {account.unlimited
                    ? "Unlimited takes"
                    : `${Math.max(0, account.limit - account.used)} of ${account.limit} takes left today`}
                </p>
              </>
            )}
            {(error || recorder.error) && (
              <p className="rounded-xl bg-bad/10 px-4 py-2 text-center text-sm text-bad">{error || recorder.error}</p>
            )}
          </section>

          {history.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-muted">Recent takes</h2>
              <ul className="mt-2 divide-y divide-line">
                {history.slice(0, 6).map((t) => (
                  <li key={t.id} className="flex items-center gap-3 py-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface font-semibold tabular-nums">
                      {t.feedback.score}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">“{t.stats.hookWindowText || t.transcript}”</p>
                      <p className="truncate text-xs text-muted">
                        {t.topic} · {new Date(t.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
