"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type RecorderState = "idle" | "countdown" | "recording";

const MAX_SECONDS = 30;
const COUNTDOWN = 3;

function pickMimeType() {
  for (const type of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

// What happens when the recorder stops: send the take, throw it away, or throw it away and go again.
type StopIntent = "keep" | "discard" | "restart";

// Records one take from the mic. Calls onTake with the audio once recording stops,
// unless the take was discarded or restarted (false starts never leave the device).
export function useRecorder(onTake: (audio: Blob) => void) {
  const [state, setState] = useState<RecorderState>("idle");
  const [countdown, setCountdown] = useState(COUNTDOWN);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intentRef = useRef<StopIntent>("keep");
  const onTakeRef = useRef(onTake);
  useEffect(() => {
    onTakeRef.current = onTake;
  }, [onTake]);

  const releaseMic = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const stop = useCallback((intent: StopIntent = "keep") => {
    if (recorderRef.current?.state !== "recording") return;
    intentRef.current = intent;
    recorderRef.current.stop();
  }, []);

  const beginRecording = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;
    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    recorder.onstop = () => {
      const intent = intentRef.current;
      intentRef.current = "keep";
      if (intent === "restart") {
        // Keep the mic open so there's no new permission prompt, and count down again.
        setCountdown(COUNTDOWN);
        setState("countdown");
        return;
      }
      releaseMic();
      setState("idle");
      if (intent === "keep") onTakeRef.current(new Blob(chunks, { type: recorder.mimeType || mimeType }));
    };
    recorderRef.current = recorder;
    recorder.start();
    setElapsed(0);
    setState("recording");
  }, [releaseMic]);

  const start = useCallback(async () => {
    setError(null);
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Microphone access was blocked. Allow it in your browser settings and try again.");
      return;
    }
    setCountdown(COUNTDOWN);
    setState("countdown");
  }, []);

  // 3-2-1 before recording so dead air at the start reflects the take, not the button press.
  useEffect(() => {
    if (state !== "countdown") return;
    const id = setTimeout(() => {
      if (countdown <= 1) beginRecording();
      else setCountdown(countdown - 1);
    }, 1000);
    return () => clearTimeout(id);
  }, [state, countdown, beginRecording]);

  useEffect(() => {
    if (state !== "recording") return;
    const startedAt = Date.now();
    const id = setInterval(() => {
      const secs = (Date.now() - startedAt) / 1000;
      setElapsed(secs);
      if (secs >= MAX_SECONDS) stop("keep");
    }, 100);
    return () => clearInterval(id);
  }, [state, stop]);

  useEffect(() => releaseMic, [releaseMic]);

  const finish = useCallback(() => stop("keep"), [stop]);
  const restart = useCallback(() => stop("restart"), [stop]);
  // Works during the countdown too, before anything has been recorded.
  const discard = useCallback(() => {
    if (recorderRef.current?.state === "recording") return stop("discard");
    releaseMic();
    setState("idle");
  }, [stop, releaseMic]);

  return { state, countdown, elapsed, maxSeconds: MAX_SECONDS, error, start, finish, restart, discard };
}
