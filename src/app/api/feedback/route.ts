import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { FeedbackSchema } from "@/lib/feedback";
import { HOOK_WINDOW, WPM_TARGET, type Stats } from "@/lib/analysis";
import { claimFeedback } from "@/lib/limits";
import { getSession } from "@/lib/session";

const client = new Anthropic();

const SYSTEM = `You are SpeakUp, a blunt but encouraging on-camera delivery coach for short-form video creators (Reels, TikTok, Shorts).

The creator just recorded one take of a video hook. You get their transcript, the words a viewer hears in the first ${HOOK_WINDOW} seconds, and delivery stats measured from word timestamps. You cannot hear tone or see their face, so judge energy only from what the stats and wording show, and never pretend otherwise.

What makes a strong hook:
- Opens a curiosity gap, stakes, or a bold claim within ${HOOK_WINDOW} seconds. No greetings, no "so today I want to talk about", no throat-clearing.
- The viewer knows what the video is about almost immediately.
- Concrete words beat vague ones ("5 hours" beats "a lot of time").
- Short-form pace target is ${WPM_TARGET.min}-${WPM_TARGET.max} words per minute. Dead air before the first word and filler words cost viewers.

Be specific to this take: quote their actual words when pointing at a problem. Fixes must be things they can do on the very next take. The rewrite must keep their idea and voice, not replace it with a generic hook. Score honestly; a 9 or 10 should be rare.`;

type Body = {
  topic?: string;
  transcript?: string;
  stats?: Stats;
  previous?: { transcript: string; score: number } | null;
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

  const { topic, transcript, stats, previous }: Body = await request.json();
  if (!transcript?.trim() || !stats) {
    return Response.json({ error: "Nothing to review: no speech was detected" }, { status: 400 });
  }

  const lines = [
    `Topic: ${topic || "(creator's own topic)"}`,
    `Transcript: "${transcript}"`,
    `First ${HOOK_WINDOW} seconds: "${stats.hookWindowText}"`,
    `Pace: ${stats.wpm} wpm over ${stats.speakingSeconds.toFixed(1)}s of speech`,
    `Filler words (um/uh): ${stats.fillerCount}`,
    `Crutch words (like/basically/so/just...): ${stats.crutchCount}`,
    `Pauses over 0.7s: ${stats.pauseCount} (longest ${stats.longestPause.toFixed(1)}s)`,
    `Dead air before first word: ${stats.deadAirStart.toFixed(1)}s`,
  ];
  if (previous) {
    lines.push(
      "",
      `Their previous take scored ${previous.score}/10: "${previous.transcript}"`,
      "Say briefly in the verdict whether this take improved on it.",
    );
  }

  try {
    const response = await client.beta.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(FeedbackSchema) },
      system: SYSTEM,
      messages: [{ role: "user", content: lines.join("\n") }],
    });

    if (response.stop_reason === "refusal" || !response.parsed_output) {
      return Response.json({ error: "Couldn't generate feedback for this take" }, { status: 502 });
    }
    return Response.json(response.parsed_output);
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
