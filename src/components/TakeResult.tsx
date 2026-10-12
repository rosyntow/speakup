import { HOOK_WINDOW, PAUSE_THRESHOLD, WPM_TARGET, type Stats, type Token } from "@/lib/analysis";
import type { Feedback } from "@/lib/feedback";

type Tone = "good" | "warn" | "bad";

const toneClass: Record<Tone, string> = {
  good: "text-good",
  warn: "text-warn",
  bad: "text-bad",
};

function paceTone(wpm: number): Tone {
  if (wpm >= WPM_TARGET.min && wpm <= WPM_TARGET.max) return "good";
  if (wpm >= WPM_TARGET.min - 25 && wpm <= WPM_TARGET.max + 25) return "warn";
  return "bad";
}

function StatTile({ label, value, hint, tone }: { label: string; value: string; hint: string; tone: Tone }) {
  return (
    <div className="rounded-2xl bg-surface p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${toneClass[tone]}`}>{value}</div>
      <div className="mt-0.5 text-xs text-muted">{hint}</div>
    </div>
  );
}

function ScoreBar({ label, score }: { label: string; score: number }) {
  const pct = Math.max(0, Math.min(10, score)) * 10;
  return (
    <div className="flex items-center gap-3">
      <div className="w-28 shrink-0 text-sm text-muted">{label}</div>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-strong">
        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
      <div className="w-6 text-right text-sm font-semibold tabular-nums">{score}</div>
    </div>
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
}) {
  return (
    <div className="flex flex-col gap-5">
      <section className="flex items-start gap-4" aria-live="polite">
        {feedback ? (
          <div className="flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-3xl bg-accent text-accent-ink">
            <span className="text-3xl font-bold tabular-nums leading-none">{feedback.score}</span>
            <span className="text-xs opacity-80">/ 10</span>
          </div>
        ) : (
          <div
            className={`h-20 w-20 shrink-0 rounded-3xl bg-accent/15 ${feedbackError ? "" : "animate-pulse"}`}
            aria-hidden="true"
          />
        )}
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-muted">Take {takeNumber}</div>
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
          hint={`wpm · aim ${WPM_TARGET.min}–${WPM_TARGET.max}`}
          tone={paceTone(stats.wpm)}
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
          <section className="flex flex-col gap-2.5">
            <ScoreBar label="Tension" score={feedback.scores.tension} />
            <ScoreBar label="Speed to point" score={feedback.scores.speedToPoint} />
            <ScoreBar label="Wording" score={feedback.scores.wording} />
            <ScoreBar label="Delivery" score={feedback.scores.delivery} />
          </section>

          <section>
            <h3 className="text-sm font-semibold">Fix next</h3>
            <ol className="mt-2 flex list-decimal flex-col gap-2 pl-5 text-[15px] leading-relaxed">
              {feedback.fixes.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ol>
          </section>

          <TargetLine
            targetAtTake={targetAtTake}
            currentTarget={currentTarget}
            feedback={feedback}
            onUseLine={onUseLine}
          />
        </>
      )}
    </div>
  );
}
