/** A recognized word positioned on the original image (pixels, origin top-left). */
export interface OcrWord {
  /** Id the AI teacher cites (`w1`, `w2`, …), in reading order. */
  id: string;
  text: string;
  /** 0-based visual line; a span crossing lines is drawn as one box per line. */
  line: number;
  /** Corners TL, TR, BR, BL — may be rotated on skewed photos. */
  polygon: Point[];
}

export interface OcrResult {
  width: number;
  height: number;
  words: OcrWord[];
}

export type Point = [x: number, y: number];
