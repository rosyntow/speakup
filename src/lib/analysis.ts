// Turns word-level timestamps from the transcriber into delivery stats.
// Runs on both server and client, so keep it free of Node/browser APIs.

export type Word = {
  word: string;
  text: string; // punctuated form, for display
  start: number;
  end: number;
  confidence?: number; // transcriber's confidence, 0-1
};

export type TokenKind = "word" | "filler" | "crutch";

export type Token = Word & {
  kind: TokenKind;
  pauseBefore: number; // seconds of silence before this word
  inHookWindow: boolean; // spoken within the first HOOK_WINDOW seconds of speech
  unsure: boolean; // the transcriber wasn't confident: possibly misheard, not necessarily mumbled
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
  unsureWords: string[];
};

export const HOOK_WINDOW = 3;
export const PAUSE_THRESHOLD = 0.7;
// Below this the transcriber may have misheard the word.
export const UNSURE_CONFIDENCE = 0.7;

const FILLERS = new Set(["um", "uh", "uhm", "umm", "er", "erm", "ah", "hmm", "mm", "mhm"]);
// Only words that are almost always filler in a hook. "just" ("just published") and "like"
// ("like a real team") are usually doing real work, so they aren't flagged.
const CRUTCHES = new Set(["basically", "literally", "honestly"]);
// "So" only counts at the start of a sentence ("So today I want to...").
const SENTENCE_START_CRUTCHES = new Set(["so"]);

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
        unsureWords: [],
      },
    };
  }

  const firstStart = words[0].start;
  const tokens: Token[] = words.map((w, i) => {
    const n = normalize(w.word);
    const sentenceStart = i === 0 || /[.!?]$/.test(words[i - 1].text);
    const kind: TokenKind = FILLERS.has(n)
      ? "filler"
      : CRUTCHES.has(n) || (sentenceStart && SENTENCE_START_CRUTCHES.has(n))
        ? "crutch"
        : "word";
    const pauseBefore = i === 0 ? 0 : Math.max(0, w.start - words[i - 1].end);
    const unsure = kind === "word" && (w.confidence ?? 1) < UNSURE_CONFIDENCE;
    return { ...w, kind, pauseBefore, inHookWindow: w.start - firstStart < HOOK_WINDOW, unsure };
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
      unsureWords: tokens.filter((t) => t.unsure).map((t) => t.text),
    },
  };
}
