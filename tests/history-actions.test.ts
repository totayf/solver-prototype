import { expect, test } from "bun:test";

import { canRetry } from "../src/features/create-lesson/lib/can-retry";
import {
  needsServerDelete,
  splitResults,
} from "../src/features/delete-lesson/lib/delete-plan";

test("a lesson the server no longer has only leaves the list", () => {
  expect(
    needsServerDelete({
      id: "g",
      createdAt: 0,
      status: "failed",
      error: { kind: "gone", message: "Bu ders artık yok." },
    }),
  ).toBe(false);
  expect(
    needsServerDelete({
      id: "p",
      createdAt: 0,
      status: "pending",
      stage: "solving",
    }),
  ).toBe(true);
});

test("failed server deletes stay in the list", () => {
  expect(
    splitResults([
      { id: "a", ok: true },
      { id: "b", ok: false },
    ]),
  ).toEqual({ removed: ["a"], failed: ["b"] });
});

test("a failed or lost lesson can be sent again only while its photo is kept", () => {
  const failed = {
    id: "f",
    createdAt: 0,
    status: "failed" as const,
    error: { kind: "failed" as const, message: "Ders hazırlanamadı." },
  };
  expect(canRetry({ ...failed, uploadUri: "file:///u/f.jpg" })).toBe(true);
  expect(canRetry(failed)).toBe(false);
  // The server lost it mid-generation (in-memory jobs): same photo, new job.
  expect(
    canRetry({
      ...failed,
      error: { kind: "gone", message: "Bu ders artık yok." },
      uploadUri: "file:///u/f.jpg",
    }),
  ).toBe(true);
  expect(
    canRetry({
      id: "r",
      createdAt: 0,
      status: "ready",
      title: "T",
      answer: "A",
      durationMs: 1,
    }),
  ).toBe(false);
});
