import { z } from "zod";

// Shared between the feedback route (as the structured-output schema) and the UI.
export const FeedbackSchema = z.object({
  score: z.number().describe("Overall hook score from 1 to 10"),
  verdict: z.string().describe("One punchy sentence summarizing the take"),
  scores: z.object({
    tension: z.number().describe("1-10: does it open a curiosity gap or stakes in the first 3 seconds?"),
    speedToPoint: z.number().describe("1-10: how fast the viewer learns what this video is about"),
    wording: z.number().describe("1-10: tight, concrete, easy to say and hear"),
    delivery: z.number().describe("1-10: pace, fillers, pauses, judged from the stats"),
  }),
  fixes: z.array(z.string()).describe("2-3 specific, actionable fixes, most important first"),
  rewrite: z
    .string()
    .describe(
      "The line to practise: the target line exactly as given, or, only if it has a real problem, a minimal edit of it. With no target line, a stronger version of the hook in the creator's own voice, sayable in under 3 seconds.",
    ),
  rewriteNote: z
    .string()
    .describe("Empty if the rewrite is the target line unchanged. Otherwise one short sentence on why it changed."),
  focusNextTake: z.string().describe("The single thing to focus on in the very next take"),
});

export type Feedback = z.infer<typeof FeedbackSchema>;
