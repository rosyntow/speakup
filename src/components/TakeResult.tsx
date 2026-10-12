import { HOOK_WINDOW, PAUSE_THRESHOLD, type Stats, type Token } from "@/lib/analysis";
import { MECHANISMS, OVERALL_LABELS, type Feedback, type Overall } from "@/lib/feedback";

type Tone = "good" | "warn" | "bad" | "neutral";

const toneClass: Record<Tone, string> = {
  good: "text-good",
  warn: "text-warn",
  bad: "text-bad",
  neutral: "text-ink",
};

function StatTile({ label, value, hint, tone }: { label: string; value: string; hint: string; tone: Tone }) {
  return (
    <div className="rounded-2xl bg-surface p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${toneClass[tone]}`}>{value}</div>
      <div className="mt-0.5 text-xs text-muted">{hint}</div>
    </div>
  );
}

type Mark = "strong" | "partial" | "missing" | "too_short";

const markStyle: Record<Mark, { icon: string; className: string; label: string }> = {
  strong: { icon: "✓", className: "bg-good/15 text-good", label: "Strong" },
  partial: { icon: "~", className: "bg-warn/15 text-warn", label: "Partly" },
  missing: { icon: "✗", className: "bg-bad/15 text-bad", label: "Missing" },
  too_short: { icon: "…", className: "bg-surface-strong text-muted", label: "Too short to tell" },
};

const overallStyle: Record<Overall, string> = {
  strong: "bg-good text-white",
  good: "bg-accent text-accent-ink",
  needs_work: "bg-ink text-white",
};

function CheckRow({ mark, title, children }: { mark: Mark; title: string; children: React.ReactNode }) {
  const style = markStyle[mark];
  return (
    <li className="flex gap-3">
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${style.className}`}
        aria-label={style.label}
      >
        {style.icon}
      </span>
      <div>
        <div className="text-[15px] font-semibold">{title}</div>
        <p className="text-sm leading-relaxed text-ink-soft">{children}</p>
      </div>
    </li>
  );
}

function Transcript({ tokens }: { tokens: Token[] }) {
  return (
    <p className="text-lg leading-9">
      {tokens.map((t, i) => (
        <span key={i}>
          {t.pauseBefore >= PAUSE_THRESHOLD && (
            <span className="mx-1 rounded-full bg-surface-strong px-2 py-0.5 align-middle text-xs text-muted">
              {t.pauseBefore.toFixed(1)}s
            </span>
          )}
          <span
            className={[
              t.kind === "filler" && "rounded bg-bad/15 px-1 text-bad line-through",
              t.kind === "crutch" && "underline decoration-warn decoration-2 underline-offset-4",
              t.inHookWindow && t.kind === "word" && "font-semibold",
              t.unsure && "underline decoration-muted decoration-dotted decoration-2 underline-offset-4",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {t.text}
          </span>{" "}
        </span>
      ))}
    </p>
  );
}

// Ignore case, punctuation and spacing when deciding whether Claude changed the target line.
const sameLine = (a: string, b: string) => {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return norm(a) === norm(b);
};

function TargetLine({
  targetAtTake,
  currentTarget,
  feedback,
  onUseLine,
}: {
  targetAtTake: string | null;
  currentTarget: string | null;
  feedback: Feedback;
  onUseLine: (line: string) => void;
}) {
  const suggestion = feedback.rewrite;
  if (!targetAtTake) {
    return (
      <section className="rounded-2xl border-2 border-dashed border-accent/50 p-4">
        <div className="text-xs font-medium uppercase tracking-wide text-accent">Try saying it like this</div>
        <p className="mt-1 text-lg font-semibold leading-snug">“{suggestion}”</p>
        <p className="mt-2 text-xs text-muted">This is now your target line for this topic.</p>
      </section>
    );
  }
  const tweaked = !sameLine(targetAtTake, suggestion);
  const adopted = !!currentTarget && sameLine(currentTarget, suggestion);
  return (
    <section className="flex flex-col gap-3 rounded-2xl border-2 border-dashed border-accent/50 p-4">
      <div>
        <div className="text-xs font-medium uppercase tracking-wide text-accent">Your target line</div>
        <p className="mt-1 text-lg font-semibold leading-snug">“{targetAtTake}”</p>
        {!tweaked && <p className="mt-2 text-xs text-muted">Keep drilling this line.</p>}
      </div>
      {tweaked && (
        <div className="border-t border-line pt-3">
          <div className="text-xs font-medium uppercase tracking-wide text-muted">Suggested tweak</div>
          <p className="mt-1 text-[17px] font-medium leading-snug">“{suggestion}”</p>
          {feedback.rewriteNote && <p className="mt-1 text-sm text-ink-soft">{feedback.rewriteNote}</p>}
          <button
            onClick={() => onUseLine(suggestion)}
            disabled={adopted}
            className="mt-3 rounded-full border border-line-strong bg-card px-4 py-2 text-sm font-semibold disabled:border-transparent disabled:bg-transparent disabled:px-0 disabled:text-good"
          >
            {adopted ? "✓ Now your target line" : "Use this line instead"}
          </button>
        </div>
      )}
    </section>
  );
}

export function TakeResult({
  takeNumber,
  tokens,
  stats,
  feedback,
  feedbackError,
  audioUrl,
  targetAtTake = null,
  currentTarget = null,
  onUseLine = () => {},
  previousWpm = null,
}: {
  takeNumber: number;
  tokens: Token[];
  stats: Stats;
  feedback: Feedback | null; // null while Claude is still writing it
  feedbackError?: string | null;
  audioUrl: string | null;
  targetAtTake?: string | null; // the target line the creator was practising on this take
  currentTarget?: string | null;
  onUseLine?: (line: string) => void;
  previousWpm?: number | null; // pace of the previous take on this topic, for comparison
}) {
  return (
    <div className="flex flex-col gap-5">
      <section className="flex items-start gap-4" aria-live="polite">
        {feedback ? (
          <div
            className={`flex h-24 w-24 shrink-0 flex-col items-center justify-center rounded-3xl px-2 text-center ${overallStyle[feedback.overall]}`}
          >
            <span className="text-[11px] font-medium uppercase tracking-wide opacity-80">Hook</span>
            <span className="text-lg font-bold leading-tight">{OVERALL_LABELS[feedback.overall]}</span>
          </div>
        ) : (
          <div
            className={`h-24 w-24 shrink-0 rounded-3xl bg-accent/15 ${feedbackError ? "" : "animate-pulse"}`}
            aria-hidden="true"
          />
        )}
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-muted">
            Take {takeNumber}
            {feedback && ` · ${MECHANISMS[feedback.mechanism] ?? "Hook"}`}
          </div>
          {feedback ? (
            <p className="mt-1 text-lg font-medium leading-snug">{feedback.verdict}</p>
          ) : feedbackError ? (
            <p className="mt-1 text-[15px] leading-snug text-bad">
              {feedbackError} Your stats below are still accurate.
            </p>
          ) : (
            <p className="mt-1 text-lg font-medium leading-snug text-muted">Your coach is reviewing this take…</p>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-line p-4">
        <div className="text-xs font-medium uppercase tracking-wide text-muted">
          What viewers hear in {HOOK_WINDOW}s
        </div>
        <p className="mt-1 text-xl font-semibold">“{stats.hookWindowText || "…"}”</p>
        {audioUrl && <audio className="mt-3 w-full" controls preload="auto" src={audioUrl} />}
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label="Pace"
          value={`${stats.wpm}`}
          hint={previousWpm ? `wpm · last take ${previousWpm}` : "words per minute"}
          tone="neutral"
        />
        <StatTile
          label="Fillers"
          value={`${stats.fillerCount}`}
          hint={stats.crutchCount ? `+ ${stats.crutchCount} crutch words` : "um, uh, er"}
          tone={stats.fillerCount === 0 ? "good" : stats.fillerCount <= 2 ? "warn" : "bad"}
        />
        <StatTile
          label="Pauses"
          value={`${stats.pauseCount}`}
          hint={stats.pauseCount ? `longest ${stats.longestPause.toFixed(1)}s` : `none over ${PAUSE_THRESHOLD}s`}
          tone={stats.pauseCount === 0 ? "good" : stats.pauseCount <= 2 ? "warn" : "bad"}
        />
        <StatTile
          label="Dead air"
          value={`${stats.deadAirStart.toFixed(1)}s`}
          hint="before first word"
          tone={stats.deadAirStart < 0.5 ? "good" : stats.deadAirStart < 1 ? "warn" : "bad"}
        />
      </section>

      <section className="rounded-2xl bg-surface p-4">
        <Transcript tokens={tokens} />
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          <span>
            <b className="font-semibold text-fg">Bold</b> = first {HOOK_WINDOW}s
          </span>
          <span>
            <span className="text-bad line-through">struck</span> = filler
          </span>
          <span>
            <span className="underline decoration-warn decoration-2">underlined</span> = crutch word
          </span>
          {stats.unsureWords.length > 0 && (
            <span>
              <span className="underline decoration-muted decoration-dotted decoration-2">dotted</span> = may be misheard
            </span>
          )}
        </div>
      </section>

      {!feedback ? (
        !feedbackError && (
          <section className="flex flex-col gap-3" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-4 animate-pulse rounded-full bg-surface" style={{ width: `${90 - i * 15}%` }} />
            ))}
          </section>
        )
      ) : (
        <>
          <section>
            <h3 className="text-sm font-semibold">How your hook works</h3>
            <ul className="mt-3 flex flex-col gap-3">
              <CheckRow mark={feedback.grab.rating} title={`The grab: ${MECHANISMS[feedback.mechanism] ?? "Hook"}`}>
                {feedback.grab.evidence}
              </CheckRow>
              <CheckRow mark={feedback.landsEarly ? "strong" : "missing"} title="Lands early">
                {feedback.landsEarly
                  ? "The grab lands within the first 10 or so words."
                  : "The grab arrives late. Viewers decide in the first second or two, so get it into the first 10 or so words."}
              </CheckRow>
              <CheckRow mark={feedback.payoff.rating} title="Starts paying off">
                {feedback.payoff.evidence}
              </CheckRow>
              <CheckRow mark={feedback.blockers.length ? "missing" : "strong"} title="Nothing in the way">
                {feedback.blockers.length ? feedback.blockers.join(" ") : "No greeting, filler or warm-up before the grab."}
              </CheckRow>
            </ul>
            {feedback.couldAdd.length > 0 && (
              <div className="mt-4 rounded-xl bg-surface px-3 py-2.5">
                <div className="text-xs font-medium uppercase tracking-wide text-muted">Could add (optional)</div>
                <ul className="mt-1 list-disc pl-5 text-sm leading-relaxed text-ink-soft">
                  {feedback.couldAdd.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section className="rounded-2xl bg-card p-4">
            <h3 className="text-sm font-semibold">Fix next</h3>
            <p className="mt-1 text-[15px] leading-relaxed">{feedback.fix}</p>
          </section>

          <TargetLine
            targetAtTake={targetAtTake}
            currentTarget={currentTarget}
            feedback={feedback}
            onUseLine={onUseLine}
          />

          <p className="text-xs leading-relaxed text-muted">
            SpeakUp rates the spoken words of your opening only. Visuals, on-screen text, captions and how much demand
            the topic has aren&apos;t included, and they often matter just as much.
          </p>
        </>
      )}
    </div>
  );
}
