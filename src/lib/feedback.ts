import { z } from "zod";

// Strong hooks usually win with one dominant way of grabbing attention, done well and fast,
// not by ticking every box. So the rating comes from: how strongly that main grab lands, how
// early, whether it starts paying off, and whether anything gets in its way. Other elements are
// optional suggestions, never lost points. Shared by the feedback route and the UI.

export const MECHANISMS = {
  intrigue: "Intrigue",
  promise: "Clear promise",
  news: "News",
  stakes: "Stakes or warning",
  contrarian: "Contrarian take",
  story: "Story tension",
  relatable: "Relatable moment",
  none: "No clear grab",
} as const;

export type Mechanism = keyof typeof MECHANISMS;
export type Overall = "strong" | "good" | "needs_work";

export const OVERALL_LABELS: Record<Overall, string> = {
  strong: "Strong",
  good: "Good",
  needs_work: "Needs work",
};

const keysOf = <T extends object>(o: T) => Object.keys(o) as [Extract<keyof T, string>, ...Extract<keyof T, string>[]];

// What Claude returns (structured output).
export const ClaudeFeedbackSchema = z.object({
  mechanism: z.enum(keysOf(MECHANISMS)).describe("The main way this hook grabs attention"),
  grab: z.object({
    rating: z.enum(["strong", "partial", "missing"]),
    evidence: z.string().describe("Quote the words that do the grabbing and say why they work or fall short. One sentence."),
  }),
  landsEarly: z.boolean().describe("True if the grab lands within roughly the first 10 spoken words"),
  payoff: z.object({
    rating: z
      .enum(["strong", "partial", "missing", "too_short"])
      .describe("Does the take start delivering on the grab soon after? too_short if the take ends before you can tell."),
    evidence: z.string().describe("One sentence, quoting the words that start the payoff if there are any"),
  }),
  blockers: z
    .array(z.string())
    .describe(
      "Only things before the grab, or garbling it, that the viewer must get past to reach it: a greeting or throat-clearing, fillers before it, a confusing phrase. One short sentence each, quoting the words. Empty if none. Issues after the grab belong in the fix. Don't list mishearings or speed.",
    ),
  couldAdd: z
    .array(z.string())
    .describe(
      "0-2 optional extras that might strengthen it (e.g. a personal stake, a credibility detail). Not required, and not counted against the hook.",
    ),
  verdict: z.string().describe("One sentence on what makes this hook work and what holds it back"),
  fix: z
    .string()
    .describe(
      "The one most valuable change for the next take, two sentences max. If the hook is already strong, a small refinement; don't invent a problem.",
    ),
  rewrite: z
    .string()
    .describe(
      "The line to practise: the target line exactly as given, or, only if it has a real problem, a minimal edit of it. With no target line, a version of the hook in the creator's own voice that keeps its main grab, about 8-15 words. Never invent facts: put any number or detail the creator didn't say in [brackets].",
    ),
  rewriteNote: z
    .string()
    .describe("Empty if the rewrite is the target line unchanged. Otherwise one short sentence on why it changed."),
  focusNextTake: z.string().describe("The single thing to focus on in the very next take, a few words"),
});

export type ClaudeFeedback = z.infer<typeof ClaudeFeedbackSchema>;

// The overall rating is computed here, not by Claude, so it follows fixed rules.
export type Feedback = ClaudeFeedback & { overall: Overall };

export function overallRating(f: ClaudeFeedback): Overall {
  const blocked = f.blockers.length > 0;
  if (f.grab.rating === "strong" && f.landsEarly && !blocked && f.payoff.rating !== "missing") return "strong";
  if (f.grab.rating === "strong" || (f.grab.rating === "partial" && f.landsEarly && !blocked)) return "good";
  return "needs_work";
}
