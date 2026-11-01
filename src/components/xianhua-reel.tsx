import { useEffect, useRef, useState } from "react";
import { barDesc, synthBars, wavBytes } from "@/lib/xianhua/reel";

export function ReelPlayer({ frames }: { frames: string[] }) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");
  const stopRef = useRef<(() => void) | null>(null);
  const frame = frames[index] ?? frames[0];

  useEffect(() => {
    return () => stopRef.current?.();
  }, []);

  function stop() {
    stopRef.current?.();
    stopRef.current = null;
    setPlaying(false);
  }

  function play() {
    stop();
    setError("");
    try {
      const ctx = new AudioContext();
    const descs = frames.map((item) => barDesc(item));
    const sound = synthBars(descs, 72, ctx.sampleRate);
    const buffer = ctx.createBuffer(1, sound.pcm.length, ctx.sampleRate);
    buffer.getChannelData(0).set(sound.pcm);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    const started = ctx.currentTime;
    source.start();
    setPlaying(true);
    let raf = 0;
    const tick = () => {
      const elapsed = ctx.currentTime - started;
      const bar = Math.min(frames.length - 1, Math.floor((elapsed * sound.rate) / sound.barSamples));
      setIndex(bar);
      if (elapsed < sound.pcm.length / sound.rate) raf = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    raf = requestAnimationFrame(tick);
    stopRef.current = () => {
      cancelAnimationFrame(raf);
      try {
        source.stop();
      } catch {
        /* already stopped */
      }
      void ctx.close();
    };
    } catch {
      setError("这个浏览器没有把声音放出来。");
      setPlaying(false);
    }
  }

  function download() {
    const descs = frames.map((item) => barDesc(item));
    const sound = synthBars(descs, 72, 22050);
    const bytes = wavBytes(sound.pcm, sound.rate);
    const blob = new Blob([Uint8Array.from(bytes)], { type: "audio/wav" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "xianhua-reel.wav";
    link.click();
    URL.revokeObjectURL(url);
  }

  if (!frame || !frame.startsWith("<svg") || /script|foreignObject|onload/i.test(frame)) return null;

  return (
    <div className="grid gap-3">
      <div className="overflow-hidden rounded-card bg-paper">
        <div className="svg-card" dangerouslySetInnerHTML={{ __html: frame }} />
      </div>
      <p className="text-sm text-muted">
        第 {index + 1} / {frames.length} 行。声音仍按这一小节的乐谱走，画面上只留歌词。
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={play} className="h-11 rounded-card bg-sage px-4 text-sm text-sage-ink">
          {playing ? "重播这条" : "播放影像"}
        </button>
        <button type="button" onClick={stop} className="h-11 rounded-card border border-border px-4 text-sm text-fg">
          停止
        </button>
        <button type="button" onClick={download} className="h-11 rounded-card border border-border px-4 text-sm text-fg">
          下载音频
        </button>
      </div>
      {error ? <p className="text-sm text-ember">{error}</p> : null}
    </div>
  );
}
