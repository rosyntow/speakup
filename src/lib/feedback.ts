import { z } from "zod";

// Hooks are judged by the jobs they do, not a generic grade, and the jobs depend on the kind of
// video: a news hook earns attention differently from a how-to. Shared by the feedback route
// and the UI.

export const HOOK_TYPES = {
  how_to: "How-to promise",
  result_first: "Result first",
  mistake: "Common mistake",
  contrarian: "Contrarian take",
  question: "Question",
  list: "List",
  story: "Story",
  news_tease: "News tease",
  news_direct: "News, stated plainly",
  other: "Other",
} as const;

export type JobKey = "promise" | "audience" | "proof" | "openLoop";
type JobText = { label: string; question: string };

// The same four slots, described for each kind of video.
export const CONTENT_TYPES = {
  teaching: {
    label: "Teaching",
    jobs: {
      promise: { label: "Promise", question: "Is it clear what the viewer will get or learn?" },
      audience: { label: "Who it's for", question: "Would the right viewer think “this is for me”?" },
      proof: { label: "Proof", question: "Is there a credibility signal: a number, a result, “I built this”?" },
      openLoop: { label: "Open loop", question: "Is something left unresolved, so they keep watching?" },
    },
  },
  news: {
    label: "News",
    jobs: {
      promise: {
        label: "The news",
        question: "Is it clear something new happened, either stated plainly or teased concretely and paid off fast?",
      },
      audience: { label: "Stakes", question: "Is it clear why this matters, or who it affects?" },
      proof: { label: "Credibility", question: "A named source, a specific detail, and that it's fresh (“just”, “today”)?" },
      openLoop: { label: "What it means", question: "Is the implication, the reveal or “what to do now” still to come?" },
    },
  },
  opinion: {
    label: "Opinion",
    jobs: {
      promise: { label: "The take", question: "Is the opinion clear and sharp enough to react to?" },
      audience: { label: "Who it's for", question: "Would the right viewer feel this is about them?" },
      proof: { label: "Credibility", question: "Is there a reason to listen: experience, a result, a specific example?" },
      openLoop: { label: "Open loop", question: "Is the reasoning or the “why” still to come?" },
    },
  },
  story: {
    label: "Story",
    jobs: {
      promise: { label: "The setup", question: "Is there a character, a situation and something at stake?" },
      audience: { label: "Relatability", question: "Would the right viewer see themselves in it?" },
      proof: { label: "Specificity", question: "Concrete details that make it feel real?" },
      openLoop: { label: "Tension", question: "Is the outcome unresolved, so they need to know what happened?" },
    },
  },
} as const satisfies Record<string, { label: string; jobs: Record<JobKey, JobText> }>;

export type ContentType = keyof typeof CONTENT_TYPES;
export type Rating = "strong" | "partial" | "missing";

const Job = z.object({
  rating: z.enum(["strong", "partial", "missing"]),
  evidence: z
    .string()
    .describe("Quote the exact words that do this job, or say briefly what's missing. One short sentence."),
});

const keysOf = <T extends object>(o: T) => Object.keys(o) as [Extract<keyof T, string>, ...Extract<keyof T, string>[]];

// What Claude returns (structured output).
export const ClaudeFeedbackSchema = z.object({
  contentType: z.enum(keysOf(CONTENT_TYPES)),
  hookType: z.enum(keysOf(HOOK_TYPES)),
  verdict: z.string().describe("One sentence on what this hook does well and what holds it back"),
  jobs: z.object({ promise: Job, audience: Job, proof: Job, openLoop: Job }),
  promiseLandsEarly: z
    .boolean()
    .describe("True if the first job (promise, the news, the take or the setup) is clear within roughly 10 spoken words"),
  fix: z
    .string()
    .describe("The one most valuable change for the next take: usually the biggest missing or late job. Two sentences max."),
  rewrite: z
    .string()
    .describe(
      "The line to practise: the target line exactly as given, or, only if it has a real problem, a minimal edit of it. With no target line, a version of the hook in the creator's own voice that does all four jobs, about 8-15 words. Never invent facts: put any number or detail the creator didn't say in [brackets].",
    ),
  rewriteNote: z
    .string()
    .describe("Empty if the rewrite is the target line unchanged. Otherwise one short sentence on why it changed."),
  focusNextTake: z.string().describe("The single thing to focus on in the very next take, a few words"),
});

export type ClaudeFeedback = z.infer<typeof ClaudeFeedbackSchema>;

// Computed on the server, not by Claude: points out of 4 (strong = 1, partial = 0.5).
export type Feedback = ClaudeFeedback & { score: number };

export function scoreJobs(jobs: ClaudeFeedback["jobs"]): number {
  const points: Record<Rating, number> = { strong: 1, partial: 0.5, missing: 0 };
  return Object.values(jobs).reduce((sum, j) => sum + points[j.rating], 0);
}

export function scoreLabel(score: number) {
  return score >= 3 ? "Strong" : score >= 2 ? "Good" : "Needs work";
}
