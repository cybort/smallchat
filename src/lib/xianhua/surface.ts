import type { BitLine } from "./codec";
import { MediaCodec, type MediaBank } from "./media";
import { ReelCodec, type ReelBank } from "./reel";
import type { ProgramCard, SpeechBank } from "./script";
import { PrivateCodec, ProgramCodec, type Dialect, type Posture } from "./veil";

/** Out-of-band frozen cover. The model is not called again after this exists. */
export type FrozenSurface = {
  v: 1;
  dialect: Dialect;
  epoch: number;
  posture: Posture;
  language: string;
  card: ProgramCard;
  speech?: { c2s: SpeechBank; s2c: SpeechBank };
  media?: { configId: string; c2s: MediaBank; s2c: MediaBank };
  reel?: { c2s: ReelBank; s2c: ReelBank };
  notes?: { c2s: string[]; s2c: string[] };
};

export type Surface = {
  dialect: Dialect;
  open(role: "client" | "server", encSeed: Uint8Array, decSeed: Uint8Array): { enc: BitLine; dec: BitLine };
};

export function surfaceOf(frozen: FrozenSurface): Surface {
  if (frozen.v !== 1) throw new Error("成稿版本不对");
  if (frozen.dialect === "speech") {
    const speech = frozen.speech;
    if (!speech?.c2s || !speech.s2c) throw new Error("缺闲聊成稿");
    return {
      dialect: "speech",
      open(role, encSeed, decSeed) {
        const outBank = role === "client" ? speech.c2s : speech.s2c;
        const inBank = role === "client" ? speech.s2c : speech.c2s;
        return { enc: new PrivateCodec(outBank, encSeed), dec: new PrivateCodec(inBank, decSeed) };
      },
    };
  }
  if (frozen.dialect === "media") {
    const media = frozen.media;
    if (!media?.c2s || !media.s2c || media.c2s.configId !== media.configId || media.s2c.configId !== media.configId) {
      throw new Error("缺媒体成稿");
    }
    return {
      dialect: "media",
      open(role, encSeed, decSeed) {
        const outBank = role === "client" ? media.c2s : media.s2c;
        const inBank = role === "client" ? media.s2c : media.c2s;
        return { enc: new MediaCodec(outBank, encSeed), dec: new MediaCodec(inBank, decSeed) };
      },
    };
  }
  if (frozen.dialect === "reel") {
    const reel = frozen.reel;
    if (!reel?.c2s || !reel.s2c) throw new Error("缺影像成稿");
    return {
      dialect: "reel",
      open(role, encSeed, decSeed) {
        const outBank = role === "client" ? reel.c2s : reel.s2c;
        const inBank = role === "client" ? reel.s2c : reel.c2s;
        return { enc: new ReelCodec(outBank, encSeed), dec: new ReelCodec(inBank, decSeed) };
      },
    };
  }
  const notes = frozen.notes;
  if (!notes?.c2s || !notes.s2c || notes.c2s.length !== 16 || notes.s2c.length !== 16) throw new Error("缺程序附言");
  const card = frozen.card;
  if (!card?.keys || !card.ops || !card.shelves) throw new Error("缺程序合同");
  return {
    dialect: "program",
    open(role, encSeed, decSeed) {
      const outNotes = role === "client" ? notes.c2s : notes.s2c;
      const inNotes = role === "client" ? notes.s2c : notes.c2s;
      const outDir = role === "client" ? "c2s" : "s2c";
      const inDir = role === "client" ? "s2c" : "c2s";
      return {
        enc: new ProgramCodec(card, outNotes, outDir, encSeed, role !== "client"),
        dec: new ProgramCodec(card, inNotes, inDir, decSeed, role === "client"),
      };
    },
  };
}
