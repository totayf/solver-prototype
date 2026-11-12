import { describe, expect, test } from "bun:test";

import {
  NetworkError,
  RequestError,
  UserFacingError,
} from "../src/shared/api/errors";
import {
  FRIENDLY_COPY,
  friendlyError,
  isStudentFacing,
  isTransientError,
} from "../src/shared/api/friendly-error";

const refusal =
  "Bu soruda emin olamadım. Fotoğrafı daha net çekip tekrar dene.";

describe("friendlyError", () => {
  test("network failure and timeout ask to check the connection", () => {
    expect(friendlyError(new NetworkError("offline")).message).toBe(
      "İnternet bağlantını kontrol edip tekrar dene.",
    );
    expect(friendlyError(new NetworkError("timeout")).kind).toBe("offline");
  });

  test("a JSON 500 refusal from our API is shown as written", () => {
    const error = new RequestError(500, refusal, true);
    expect(friendlyError(error)).toEqual({ kind: "failed", message: refusal });
    expect(
      friendlyError(
        new RequestError(500, "Fotoğraf net değil, tekrar çek.", true),
      ).message,
    ).toBe("Fotoğraf net değil, tekrar çek.");
  });

  test("an English or technical 500 text is never shown", () => {
    for (const text of [
      "Internal Server Error",
      "TypeError: cannot read properties of undefined",
      "<html>oops</html>",
    ]) {
      const result = friendlyError(new RequestError(500, text, true), {
        failed: "Ders hazırlanamadı. Tekrar dene.",
      });
      expect(result.message).toBe("Ders hazırlanamadı. Tekrar dene.");
    }
  });

  test("server text of other statuses is ignored", () => {
    const result = friendlyError(
      new RequestError(400, "image (base64) is required", true),
    );
    expect(result.kind).toBe("unknown");
    expect(result.message).not.toContain("base64");
  });

  test("401 asks for an update, 404 uses the screen's wording", () => {
    expect(friendlyError(new RequestError(401, null, true)).kind).toBe(
      "outdated",
    );
    expect(
      friendlyError(new RequestError(401, "unauthorized", true)).message,
    ).toContain("güncellemen gerekiyor");
    expect(
      friendlyError(new RequestError(404, "not found", true), {
        gone: "Bu ders artık yok.",
      }),
    ).toEqual({ kind: "gone", message: "Bu ders artık yok." });
  });

  test("gateway answers and non-JSON 5xx are temporary", () => {
    for (const error of [
      new RequestError(502, null, false),
      new RequestError(503, "busy", true),
      new RequestError(504, null, false),
      new RequestError(500, null, false),
      new RequestError(200, null, false),
    ]) {
      expect(isTransientError(error)).toBe(true);
      expect(friendlyError(error).kind).toBe("busy");
    }
    expect(isTransientError(new NetworkError("offline"))).toBe(true);
  });

  test("final answers are not temporary", () => {
    expect(isTransientError(new RequestError(500, refusal, true))).toBe(false);
    expect(isTransientError(new RequestError(404, null, true))).toBe(false);
    expect(isTransientError(new RequestError(401, null, true))).toBe(false);
    expect(isTransientError(new Error("boom"))).toBe(false);
  });

  test("photo preparation errors keep their own Turkish message", () => {
    const error = new UserFacingError(
      "Fotoğraf hazırlanamadı, tekrar dene.",
      "image",
    );
    expect(friendlyError(error)).toEqual({
      kind: "image",
      message: "Fotoğraf hazırlanamadı, tekrar dene.",
    });
    expect(friendlyError(new RequestError(413, "too big", true)).kind).toBe(
      "image",
    );
  });

  test("anything else gets a generic message, never error.message", () => {
    const result = friendlyError(new Error("ECONNRESET socket hang up"));
    expect(result.message).toBe(FRIENDLY_COPY.unknown);
  });
});

describe("isStudentFacing", () => {
  test("accepts short Turkish sentences only", () => {
    expect(isStudentFacing("Ders oluşturulamadı, tekrar dene.")).toBe(true);
    expect(isStudentFacing("not found")).toBe(false);
    expect(isStudentFacing("x".repeat(400) + "ş")).toBe(false);
    expect(isStudentFacing('Hata: {"ş": 1}')).toBe(false);
  });
});
