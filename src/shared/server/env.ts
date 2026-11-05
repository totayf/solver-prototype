import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

/**
 * Server-only environment (Expo API routes + scripts). Never import this from
 * client code — Biome forbids `server/` imports outside server modules.
 */
export const env = createEnv({
  server: {
    // ── AI ──────────────────────────────────────────────────────────────────
    ANTHROPIC_API_KEY: z.string().min(1),
    OPENAI_API_KEY: z.string().min(1),
    GEMINI_API_KEY: z.string().min(1),

    // ── OCR ─────────────────────────────────────────────────────────────────
    GOOGLE_VISION_API_KEY: z.string().min(1),

    // ── TTS ─────────────────────────────────────────────────────────────────
    /** "openai" skips Gemini (e.g. when its daily quotas are used up). */
    TTS_PROVIDER: z.enum(["gemini", "openai"]).optional(),
    ELEVENLABS_API_KEY: z.string().min(1).optional(),
    ALANIA_API_KEY: z.string().min(1).optional(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
