import { all, create, type MathJsInstance } from "mathjs";

/**
 * Evaluates a math expression the way a careful student would check it:
 * exactly with fractions when possible (`3/4 + 5/6 → 19/12`), and always as a
 * decimal. Also understands roots, powers, logs, trig in degrees (`sin(30 deg)`),
 * combinatorics, `derivative("x^3", "x")`, `simplify(…)`, `polynomialRoot(…)`
 * and `lusolve(…)` for linear systems.
 */
export function calculate(expression: string): CalculationResult {
  try {
    const decimal = numeric.format(numeric.evaluate(expression), {
      precision: 10,
    });
    let exactValue: string | null = null;
    try {
      exactValue = exact.format(exact.evaluate(expression), {
        fraction: "ratio",
      });
    } catch {
      // Irrational results (roots, trig, logs) have no exact fraction.
    }
    return {
      expression,
      decimal,
      exact: exactValue !== decimal ? exactValue : null,
    };
  } catch (error) {
    return {
      expression,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** A sandboxed mathjs evaluator for plotting: compile once, call many times. */
export function compileFunction(expression: string): (x: number) => number {
  const compiled = numeric.compile(expression);
  return (x) => {
    const value = compiled.evaluate({ x });
    return typeof value === "number" ? value : Number.NaN;
  };
}

/** Derivative of `expression` in x, as a string mathjs can compile again. */
export function derivativeOf(expression: string): string {
  return numeric.derivative(expression, "x").toString();
}

// ── Instances ────────────────────────────────────────────────────────────────

const exact = sandboxed(create(all, { number: "Fraction" }));
const numeric = sandboxed(create(all));

/**
 * Expressions come from a model: remove the functions that can change the
 * instance itself. (Internals like `resolve` must stay — simplify uses them.)
 */
function sandboxed(math: MathJsInstance): MathJsInstance {
  const blocked = () => {
    throw new Error("Not available in this sandbox.");
  };
  math.import({ import: blocked, createUnit: blocked }, { override: true });
  return math;
}

// ── Types ────────────────────────────────────────────────────────────────────

export type CalculationResult =
  | { expression: string; decimal: string; exact: string | null }
  | { expression: string; error: string };
