/** Narration audio for one piece of text, as raw 16-bit mono PCM. */
export interface SpeechClip {
  pcm: Uint8Array;
  sampleRate: number;
  durationMs: number;
  /** Per-word timing relative to the clip start; null when the provider has none. */
  words: WordTiming[] | null;
}

export interface WordTiming {
  text: string;
  /** Character offset of the word in the synthesized text. */
  charStart: number;
  startMs: number;
  endMs: number;
}

export type SpeechProvider = (text: string) => Promise<SpeechClip>;
