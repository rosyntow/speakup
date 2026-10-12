// Safari often plays a MediaRecorder recording silently the first time (its mp4/webm output
// has unreliable timing metadata). Re-encoding to plain WAV plays reliably everywhere.
// The original recording is still what gets transcribed; this is only for listening back.

export async function playableUrl(recording: Blob): Promise<string> {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    try {
      const audio = await ctx.decodeAudioData(await recording.arrayBuffer());
      return URL.createObjectURL(toWav(audio));
    } finally {
      void ctx.close();
    }
  } catch {
    return URL.createObjectURL(recording);
  }
}

// Mono 16-bit PCM WAV. A 30-second take is about 2.6 MB at 44.1 kHz.
function toWav(audio: AudioBuffer): Blob {
  const { length, sampleRate, numberOfChannels } = audio;
  const mono = new Float32Array(length);
  for (let c = 0; c < numberOfChannels; c++) {
    const data = audio.getChannelData(c);
    for (let i = 0; i < length; i++) mono[i] += data[i] / numberOfChannels;
  }

  const buffer = new ArrayBuffer(44 + length * 2);
  const view = new DataView(buffer);
  const text = (offset: number, s: string) => [...s].forEach((ch, i) => view.setUint8(offset + i, ch.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  text(36, "data");
  view.setUint32(40, length * 2, true);
  for (let i = 0; i < length; i++) {
    const v = Math.max(-1, Math.min(1, mono[i]));
    view.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}
