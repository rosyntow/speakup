// Turns word-level timestamps from the transcriber into delivery stats.
// Runs on both server and client, so keep it free of Node/browser APIs.

export type Word = {
  word: string;
  text: string; // punctuated form, for display
  start: number;
  end: number;
};

export type TokenKind = "word" | "filler" | "crutch";

export type Token = Word & {
  kind: TokenKind;
  pauseBefore: number; // seconds of silence before this word
  inHookWindow: boolean; // spoken within the first HOOK_WINDOW seconds of speech
};

export type Stats = {
  wordCount: number; // excludes fillers
  wpm: number;
  fillerCount: number;
  crutchCount: number;
  pauseCount: number;
  longestPause: number;
  deadAirStart: number; // silence before the first word
  speakingSeconds: number;
  hookWindowText: string;
};

export const HOOK_WINDOW = 3;
export const PAUSE_THRESHOLD = 0.7;
// Short-form sweet spot: fast enough to hold attention, slow enough to follow.
export const WPM_TARGET = { min: 150, max: 185 };

const FILLERS = new Set(["um", "uh", "uhm", "umm", "er", "erm", "ah", "hmm", "mm", "mhm"]);
const CRUTCHES = new Set(["like", "basically", "literally", "actually", "so", "just", "honestly"]);

function normalize(w: string) {
  return w.toLowerCase().replace(/[^a-z']/g, "");
}

export function analyze(words: Word[]): { tokens: Token[]; stats: Stats } {
  if (words.length === 0) {
    return {
      tokens: [],
      stats: {
        wordCount: 0,
        wpm: 0,
        fillerCount: 0,
        crutchCount: 0,
        pauseCount: 0,
        longestPause: 0,
        deadAirStart: 0,
        speakingSeconds: 0,
        hookWindowText: "",
      },
    };
  }

  const firstStart = words[0].start;
  const tokens: Token[] = words.map((w, i) => {
    const n = normalize(w.word);
    const kind: TokenKind = FILLERS.has(n) ? "filler" : CRUTCHES.has(n) ? "crutch" : "word";
    const pauseBefore = i === 0 ? 0 : Math.max(0, w.start - words[i - 1].end);
    return { ...w, kind, pauseBefore, inHookWindow: w.start - firstStart < HOOK_WINDOW };
  });

  const spoken = tokens.filter((t) => t.kind !== "filler");
  const speakingSeconds = Math.max(0.1, words[words.length - 1].end - firstStart);
  const pauses = tokens.filter((t) => t.pauseBefore >= PAUSE_THRESHOLD);

  return {
    tokens,
    stats: {
      wordCount: spoken.length,
      wpm: Math.round((spoken.length / speakingSeconds) * 60),
      fillerCount: tokens.length - spoken.length,
      crutchCount: tokens.filter((t) => t.kind === "crutch").length,
      pauseCount: pauses.length,
      longestPause: pauses.reduce((m, t) => Math.max(m, t.pauseBefore), 0),
      deadAirStart: firstStart,
      speakingSeconds,
      hookWindowText: tokens
        .filter((t) => t.inHookWindow && t.kind !== "filler")
        .map((t) => t.text)
        .join(" "),
    },
  };
}
