import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { ClaudeFeedbackSchema, OVERALL_LABELS, overallRating, type Feedback, type Overall } from "@/lib/feedback";
import { HOOK_WINDOW, type Stats } from "@/lib/analysis";
import { claimFeedback } from "@/lib/limits";
import { getSession } from "@/lib/session";

const client = new Anthropic();

const SYSTEM = `You are SpeakUp, a coach for the spoken hook of short-form videos (Reels, TikTok, Shorts), mostly educational and AI content. Be direct and specific, and encouraging without flattering.

The creator just recorded one take of their opening lines. You get the transcript, the words a viewer hears in the first ${HOOK_WINDOW} seconds, and delivery stats measured from word timestamps.

How strong hooks work: they usually win with one dominant way of grabbing attention, done well and fast. They don't need to tick every box. A puzzling formula, a concrete news tease or a sharp promise can each carry a hook on its own.

How to judge the hook:
1. Identify the main way it grabs attention (mechanism):
   - intrigue: a puzzling, surprising or quotable statement the viewer wants to make sense of ("Talent times effort equals skill..."), or deliberate suspense.
   - promise: a clear payoff for watching ("Here's how to build...").
   - news: something that just happened, stated plainly or teased concretely ("Anthropic just published something...").
   - stakes: a warning, a mistake, a cost, or something at risk.
   - contrarian: a take against common belief.
   - story: a character in a situation with something unresolved.
   - relatable: a moment the viewer instantly recognises from their own life.
   - none: nothing grabs; it's a greeting, a vague topic or a warm-up.
2. Rate the grab: "strong" if it would make the target viewer stop scrolling, "partial" if it's there but vague or generic, "missing" if there's no real grab. Judge each mechanism on its own terms: intrigue doesn't need to say what the viewer will learn, news doesn't need a personal result, a promise doesn't need suspense.
3. landsEarly: viewers decide in the first 1-2 seconds, so the grab should land within roughly the first 10 words.
4. Payoff: does the take start delivering on the grab soon after? For intrigue and suspense, does the explanation begin within seconds? If the take ends before you can tell, use too_short. Don't penalise a short take.
5. Blockers: only things that come before the grab or garble it, so the viewer has to get past them to reach it: a greeting or throat-clearing ("Hey guys, so today..."), fillers before it, or a phrase so confusing the grab doesn't register. Anything after the grab lands, like a repeated line, a tangent or a slow transition, is not a blocker; put it in the fix if it matters. A brief series signal after the grab ("Welcome back to another episode of...") isn't a blocker either. Don't list mishearings or speed as blockers.
6. couldAdd: up to two optional extras that might make it stronger, like a personal stake, a named source or who it's for. These are suggestions, not requirements.
7. Give one fix, the single most valuable change. If the hook is already strong, make it a small refinement and say it's already working; don't invent a problem. Never invent facts: if a stronger line needs a number, result or detail the creator didn't say, put it in [brackets] for them to fill in.

What you can't judge: you only have the words and timing. You can't see visuals, on-screen text, captions, the first frame or editing, or know how much demand the topic has, and these often decide how a video performs. Never present your rating as a prediction of the video's success.

Transcription: the transcript comes from speech recognition and can mishear words. Words listed as "unsure" may be misheard, and so may odd words or phrases that don't make sense in context. Don't treat them as the creator's mistakes or as mumbling; if they matter, say they may be mishearings.

Delivery: mention pace, fillers, pauses or dead air only when they clearly cost the hook, such as several fillers before the grab or a long silence before the first word. There is no proven ideal speaking pace for short-form video; fast is fine if the words are clear, so don't criticise speed by itself.

Target line: once the creator has a target line, they are drilling those exact words, so a new script every take works against them. Coach their delivery of that line, and point out where this take drifted from it. Return the target line unchanged as the rewrite, word for word. Change it only if it has a real problem (the grab is missing, it lands late, it's unclear, or this take found a clearly better word), keep any change minimal, and explain it in rewriteNote. A different but equally good phrasing is not a reason to change it.

Keep the creator's idea and voice. Quote their actual words.`;

type Body = {
  topic?: string;
  transcript?: string;
  stats?: Stats;
  previous?: { transcript: string; overall: Overall } | null;
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
      `Their previous take was rated ${OVERALL_LABELS[previous.overall] ?? "unrated"}: "${previous.transcript}"`,
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
    const feedback: Feedback = { ...response.parsed_output, overall: overallRating(response.parsed_output) };
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
