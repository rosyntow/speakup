import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { ClaudeFeedbackSchema, scoreJobs, type Feedback } from "@/lib/feedback";
import { HOOK_WINDOW, type Stats } from "@/lib/analysis";
import { claimFeedback } from "@/lib/limits";
import { getSession } from "@/lib/session";

const client = new Anthropic();

const SYSTEM = `You are SpeakUp, a coach for the spoken hook of short-form educational videos (Reels, TikTok, Shorts). Be direct and specific, and encouraging without flattering.

The creator just recorded one take of their opening lines. You get the transcript, the words a viewer hears in the first ${HOOK_WINDOW} seconds, and delivery stats measured from word timestamps.

How to judge the hook:
1. Decide what kind of video this is (contentType), because each kind earns attention differently:
   - teaching: how-tos, tips, explainers.
   - news: reporting something that just happened (a release, research, an announcement, a change).
   - opinion: a take or argument.
   - story: something that happened to someone.
2. Name the hook's style (hookType). Judge it by what that style needs; don't push every hook into one formula.
3. Rate the four jobs for that kind of video, quoting the exact words that do each one. The JSON keys are always promise, audience, proof and openLoop; what they mean depends on the kind:
   - teaching: promise = what the viewer will get or learn; audience = who it's for (can be implied by the topic); proof = a credibility signal like a number, a result, a timeframe or "I built this"; openLoop = something left unresolved.
   - news: promise = the news itself, either stated plainly or teased concretely; audience = the stakes, why it matters or who it affects; proof = credibility and freshness, like a named source, a specific detail, "just" or "today"; openLoop = what it means, the reveal or what to do now, still to come.
   - opinion: promise = the take, clear enough to react to; audience = who it's for; proof = why listen, like experience or a specific example; openLoop = the reasoning still to come.
   - story: promise = the setup, with a character and something at stake; audience = relatability; proof = specific details; openLoop = an unresolved outcome.
   "strong" means the job is clearly done, "partial" means it's there but weak or vague, "missing" means it isn't there.
4. A deliberate tease is a valid technique, especially for news. When the hook withholds the specific on purpose ("X just published something nobody is taking seriously"), the first job is strong if the tease is concrete (a named source, freshness, stakes) and the transcript pays it off soon after. Don't mark it down for not stating everything up front.
5. Timing: viewers decide in the first 1-2 seconds, so the first job should land within roughly the first 10 words. Strong words that arrive late are a timing problem, not a wording problem: say so.
6. Give one fix, the single most valuable change. Usually that's the biggest missing job, or a strong job that arrives too late. If the hook already does all four jobs, say so and make the fix a small refinement rather than inventing a problem.
7. Never invent facts in a rewrite or fix. If a stronger line needs a number, result or detail the creator didn't say, put it in [brackets] for them to fill in, e.g. "These [3] tools save me [X hours] a week."

What you can't judge: you only have the words and timing. You can't see visuals, on-screen text, captions, the first frame or editing, or know how much demand the topic has, and these often decide how a video performs. Never present the hook rating as a prediction of the video's success.

Transcription: the transcript comes from speech recognition and can mishear words. Words listed as "unsure" may be misheard, and so may odd words or phrases that don't make sense in context. Don't treat them as the creator's mistakes or as mumbling; if they matter, say they may be mishearings.

Delivery: report pace, fillers, pauses and dead air only when they clearly cost the hook, such as several fillers before the promise or a long silence before the first word. There is no proven ideal speaking pace for short-form video; fast is fine if the words are clear, so don't criticise speed by itself.

Target line: once the creator has a target line, they are drilling those exact words, so a new script every take works against them. Coach their delivery of that line, and point out where this take drifted from it. Return the target line unchanged as the rewrite, word for word. Change it only if it has a real problem (a job is missing, the promise lands late, it's unclear, or this take found a clearly better word), keep any change minimal, and explain it in rewriteNote. A different but equally good phrasing is not a reason to change it.

Keep the creator's idea and voice. Quote their actual words.`;

type Body = {
  topic?: string;
  transcript?: string;
  stats?: Stats;
  previous?: { transcript: string; score: number } | null;
  target?: string | null;
};

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Please sign up to practise." }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "ANTHROPIC_API_KEY is not set in .env.local" }, { status: 500 });
  }
  if (!(await claimFeedback(session.email))) {
    return Response.json({ error: "Record a new take to get more feedback." }, { status: 429 });
  }

  const { topic, transcript, stats, previous, target }: Body = await request.json();
  if (!transcript?.trim() || !stats) {
    return Response.json({ error: "Nothing to review: no speech was detected" }, { status: 400 });
  }

  const lines = [
    `Topic: ${topic || "(creator's own topic)"}`,
    `Transcript: "${transcript}"`,
    `First ${HOOK_WINDOW} seconds: "${stats.hookWindowText}"`,
    `Pace: ${stats.wpm} wpm over ${stats.speakingSeconds.toFixed(1)}s of speech`,
    `Filler words (um/uh): ${stats.fillerCount}`,
    `Crutch words (basically/literally/honestly, sentence-initial "so"): ${stats.crutchCount}`,
    `Pauses over 0.7s: ${stats.pauseCount} (longest ${stats.longestPause.toFixed(1)}s)`,
    `Dead air before first word: ${stats.deadAirStart.toFixed(1)}s`,
    `Unsure words (possible mishearings): ${stats.unsureWords?.length ? stats.unsureWords.join(", ") : "none"}`,
  ];
  lines.push(
    "",
    target?.trim()
      ? `Target line they are practising: "${target.trim().slice(0, 300)}"`
      : "No target line yet: write one as the rewrite.",
  );
  if (previous) {
    lines.push(
      "",
      `Their previous take did ${previous.score} of 4 jobs: "${previous.transcript}"`,
      "Say briefly in the verdict whether this take improved on it.",
    );
  }

  try {
    const response = await client.beta.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(ClaudeFeedbackSchema) },
      system: SYSTEM,
      messages: [{ role: "user", content: lines.join("\n") }],
    });

    if (response.stop_reason === "refusal" || !response.parsed_output) {
      return Response.json({ error: "Couldn't generate feedback for this take" }, { status: 502 });
    }
    const feedback: Feedback = { ...response.parsed_output, score: scoreJobs(response.parsed_output.jobs) };
    return Response.json(feedback);
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return Response.json({ error: "ANTHROPIC_API_KEY is missing or invalid" }, { status: 500 });
    }
    if (err instanceof Anthropic.RateLimitError) {
      return Response.json({ error: "Rate limited, try again in a moment" }, { status: 429 });
    }
    console.error("Feedback error", err);
    // A short code (e.g. "400 invalid_request_error") helps debugging without exposing anything sensitive.
    const code = err instanceof Anthropic.APIError ? `${err.status} ${err.type ?? ""}`.trim() : "unknown";
    return Response.json({ error: "Feedback failed", code }, { status: 502 });
  }
}
