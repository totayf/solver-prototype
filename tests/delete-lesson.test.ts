import { expect, test } from "bun:test";

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
