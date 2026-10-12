import type { Stats } from "./analysis";
import type { Feedback } from "./feedback";

export type Take = {
  id: string;
  createdAt: number;
  topic: string;
  transcript: string;
  stats: Stats;
  feedback: Feedback;
};

// Personal phase: history lives in this browser only. Swap for a database at launch.
// v2: scores became "jobs done out of 4"; v1 takes (out of 10) are left behind rather than mixed in.
const KEY = "speakup.takes.v2";
const LIMIT = 100;

const EMPTY: Take[] = [];
let cache: Take[] | null = null;
const listeners = new Set<() => void>();

function read(): Take[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Take[]) : EMPTY;
  } catch {
    return EMPTY;
  }
}

// useSyncExternalStore plumbing, so the history renders without hydration mismatches.
export const takesStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot(): Take[] {
    cache ??= read();
    return cache;
  },
  getServerSnapshot(): Take[] {
    return EMPTY;
  },
};

export function saveTake(take: Take) {
  cache = [take, ...takesStore.getSnapshot()].slice(0, LIMIT);
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // Storage full or blocked: keep going, the take is still shown on screen.
  }
  listeners.forEach((l) => l());
}
