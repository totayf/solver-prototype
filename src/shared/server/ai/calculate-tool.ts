import { tool } from "ai";
import { z } from "zod";

import { calculate } from "../math";

/** The `calculate` tool models call instead of doing arithmetic in their head. */
export const calculateTool = tool({
  description: [
    "Evaluate a math expression exactly. Use it for every non-trivial calculation instead of computing mentally.",
    "Returns the exact fraction when there is one and a decimal.",
    "Syntax (mathjs): 3/4 + 5/6, sqrt(48), 2^10, log(8, 2), sin(30 deg), combinations(7, 3), permutations(5, 2), factorial(6),",
    'derivative("x^3 - 3x", "x"), simplify("2x + 3x"), polynomialRoot(c0, c1, c2[, c3]) for roots of c0 + c1·x + c2·x² (+ c3·x³),',
    "lusolve([[1,1],[1,-1]], [10, 2]) for linear systems.",
  ].join(" "),
  inputSchema: z.object({
    expression: z.string().describe("One mathjs expression."),
  }),
  execute: async ({ expression }) => calculate(expression),
});
