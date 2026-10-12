import type { Word } from "@/lib/analysis";
import { claimTake } from "@/lib/limits";
import { clientIp, getSession } from "@/lib/session";

const DEEPGRAM_URL =
  "https://api.deepgram.com/v1/listen?model=nova-3&language=en&smart_format=true&punctuate=true&filler_words=true&mip_opt_out=true";

const MAX_BYTES = 10 * 1024 * 1024;

type DeepgramWord = {
  word: string;
  punctuated_word?: string;
  start: number;
  end: number;
};

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Please sign up to practise." }, { status: 401 });

  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) {
    return Response.json({ error: "DEEPGRAM_API_KEY is not set in .env.local" }, { status: 500 });
  }

  const audio = await request.arrayBuffer();
  if (audio.byteLength === 0) {
    return Response.json({ error: "No audio received" }, { status: 400 });
  }
  if (audio.byteLength > MAX_BYTES) {
    return Response.json({ error: "Recording is too long" }, { status: 413 });
  }

  const limited = await claimTake(session.email, clientIp(request));
  if (limited) return Response.json({ error: limited }, { status: 429 });

  const res = await fetch(DEEPGRAM_URL, {
    method: "POST",
    headers: {
      Authorization: `Token ${key}`,
      "Content-Type": request.headers.get("content-type") ?? "audio/webm",
    },
    body: audio,
  });

  if (!res.ok) {
    console.error("Deepgram error", res.status, await res.text());
    return Response.json({ error: "Transcription failed" }, { status: 502 });
  }

  const data = await res.json();
  const alt = data?.results?.channels?.[0]?.alternatives?.[0];
  const words: Word[] = (alt?.words ?? []).map((w: DeepgramWord) => ({
    word: w.word,
    text: w.punctuated_word ?? w.word,
    start: w.start,
    end: w.end,
  }));

  return Response.json({ transcript: alt?.transcript ?? "", words });
}
