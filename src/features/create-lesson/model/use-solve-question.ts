import { useEffect, useRef, useState } from "react";

import { type FriendlyError, friendlyError } from "@/shared/api/friendly-error";

import {
  clampCropRect,
  type PixelRect,
  type QuestionImage,
  uploadKey,
} from "../lib/crop-rect";
import { prepareImage } from "../lib/prepare-image";
import { submitLesson } from "./submit-lesson";

/**
 * The crop screen's "Çöz": prepare the framed question once, send it, hand
 * the lesson id to `onStarted`. After a failure the prepared bytes and the
 * crop are kept: "Tekrar dene" re-sends exactly the same photo (the server
 * joins the job it may already have started — no second payment), and
 * editing the frame starts from the student's own crop.
 */
export function useSolveQuestion({
  onStarted,
}: {
  /** Called only while the screen is still open. */
  onStarted: (lessonId: string) => void;
}) {
  const [phase, setPhase] = useState<"framing" | "sending" | "failed">(
    "framing",
  );
  const [error, setError] = useState<FriendlyError | null>(null);
  const [crop, setCrop] = useState<PixelRect | undefined>();
  const prepared = useRef<{ key: string; base64: string } | null>(null);
  const busy = useRef(false);
  const mounted = useRef(true);
  const started = useRef(onStarted);
  started.current = onStarted;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const send = async (image: QuestionImage, rect: PixelRect) => {
    // Set synchronously: a double tap can't send twice.
    if (busy.current) return;
    busy.current = true;
    const snapped = clampCropRect(rect, image);
    setCrop(snapped);
    setError(null);
    setPhase("sending");
    try {
      const key = uploadKey(image.uri, snapped);
      if (prepared.current?.key !== key) {
        prepared.current = { key, base64: await prepareImage(image, snapped) };
      }
      const id = await submitLesson(prepared.current.base64);
      prepared.current = null;
      if (mounted.current) started.current(id);
    } catch (e) {
      if (mounted.current) {
        setError(friendlyError(e, SEND_COPY));
        setPhase("failed");
      }
    } finally {
      busy.current = false;
    }
  };

  return {
    phase,
    error,
    /** The student's last crop (image pixels), to reopen the frame with. */
    crop,
    solve: (image: QuestionImage, rect: PixelRect) => void send(image, rect),
    /** Re-sends the same photo and crop. */
    retry: (image: QuestionImage) =>
      void send(image, crop ?? clampCropRect(undefined, image)),
    editCrop: () => setPhase("framing"),
    /** A new photo (rotation): the old crop and bytes no longer apply. */
    resetCrop: () => {
      prepared.current = null;
      setCrop(undefined);
    },
  };
}

// ── Constants ────────────────────────────────────────────────────────────────

const SEND_COPY = {
  busy: "Sunucuya şu an ulaşılamıyor. Biraz sonra tekrar dene; fotoğrafın hazır bekliyor.",
} as const;
