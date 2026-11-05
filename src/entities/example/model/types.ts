/** Which exam an example question comes from (the Örnekler tabs). */
export type ExampleExam = "TYT" | "AYT" | "ZOR";

/** The models an example lesson can be written with. */
export type ExampleModel = "argon" | "opus" | "sonnet" | "sol";

export interface ExampleQuestion {
  id: string;
  exam: ExampleExam;
  subject: string;
  topic: string;
  /** Tools its default lesson really shows (board kinds, "code"); see TOOL_LABELS. */
  tools: string[];
  imageUrl: string;
  /** Lesson id per model; missing until generated. */
  lessons: Partial<Record<ExampleModel, string>>;
}

export interface ExampleCatalog {
  questions: ExampleQuestion[];
}

export const EXAMPLE_EXAMS: ExampleExam[] = ["TYT", "AYT", "ZOR"];

export const EXAMPLE_MODELS: Array<{ id: ExampleModel; label: string }> = [
  { id: "argon", label: "Gemini 4 Argon" },
  { id: "opus", label: "Claude Opus 5.5" },
  { id: "sonnet", label: "Claude Sonnet 5.5" },
  { id: "sol", label: "GPT-6.1 Sol" },
];

/** Turkish tag per tool; tools without a label are not shown. */
export const TOOL_LABELS: Record<string, string> = {
  construct: "Geometri",
  solid: "3D",
  plot: "Koordinat",
  table: "Tablo",
  numberLine: "Sayı doğrusu",
  signTable: "İşaret tablosu",
  venn: "Venn",
  tree: "Olasılık ağacı",
  chart: "Grafik",
  motion: "Hareket",
  forces: "Kuvvet",
  timeline: "Zaman çizelgesi",
  map: "Harita",
  circuit: "Devre",
  code: "Kod",
};
