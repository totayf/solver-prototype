import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { KATEX_CSS_MODULE, katexCssModule } from "../scripts/build-katex-css";
import { KATEX_CSS } from "../src/widgets/lesson-player/ui/katex-css.generated";

test("the player's KaTeX CSS matches the installed katex package", () => {
  // Out of date after a katex upgrade: run `bun scripts/build-katex-css.ts`.
  expect(readFileSync(KATEX_CSS_MODULE, "utf8") === katexCssModule()).toBe(
    true,
  );
});

test("layout rules only: no font URLs left for the bundler to trip over", () => {
  expect(KATEX_CSS.includes(".katex .mfrac")).toBe(true);
  expect(KATEX_CSS.includes("@font-face")).toBe(false);
  expect(KATEX_CSS.includes("url(")).toBe(false);
});
