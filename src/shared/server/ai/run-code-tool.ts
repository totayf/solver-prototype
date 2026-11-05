import { tool } from "ai";
import { z } from "zod";

import { runCode } from "../code";

/**
 * The `run_code` tool: a JavaScript sandbox for checks a calculator can't do —
 * counting by brute force, simulating probabilities, testing a formula on
 * many values. Used in the solve stage only.
 */
export const runCodeTool = tool({
  description: [
    "Run a short JavaScript program in a sandbox (no network, about 3 seconds, standard JS only).",
    "Use it to verify answers by brute force: enumerate arrangements or subsets, simulate a random process, or test a formula over many values.",
    "Print what you need with console.log; the value of the last expression is returned too.",
  ].join(" "),
  inputSchema: z.object({
    code: z.string().describe("Plain JavaScript; no imports."),
  }),
  execute: async ({ code }) => runCode(code),
});
