import type { GenerationStage } from "./types";

/** The server's generation stages in order, with the product's wording. */
export const GENERATION_STAGES: ReadonlyArray<{
  stage: GenerationStage;
  label: string;
}> = [
  { stage: "reading", label: "Okunuyor" },
  { stage: "solving", label: "Çözülüyor" },
  { stage: "writing", label: "Anlatım yazılıyor" },
  { stage: "voicing", label: "Seslendiriliyor" },
];

export function stageLabel(stage: GenerationStage): string {
  return GENERATION_STAGES.find((s) => s.stage === stage)?.label ?? "Okunuyor";
}

export function stageIndex(stage: GenerationStage): number {
  return Math.max(
    0,
    GENERATION_STAGES.findIndex((s) => s.stage === stage),
  );
}
