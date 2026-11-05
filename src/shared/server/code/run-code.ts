import {
  getQuickJS,
  type QuickJSHandle,
  shouldInterruptAfterDeadline,
} from "quickjs-emscripten";

/**
 * Runs a short JavaScript program in a QuickJS (WebAssembly) sandbox: no
 * network, no file system, no host objects — only `console.log`. Limited to
 * TIME_LIMIT_MS and MEMORY_LIMIT_BYTES so a runaway loop can't hurt the
 * server. Returns what was printed and the value of the last expression.
 */
export async function runCode(code: string): Promise<CodeResult> {
  const quickjs = await getQuickJS();
  const runtime = quickjs.newRuntime();
  runtime.setMemoryLimit(MEMORY_LIMIT_BYTES);
  runtime.setMaxStackSize(STACK_LIMIT_BYTES);
  runtime.setInterruptHandler(
    shouldInterruptAfterDeadline(Date.now() + TIME_LIMIT_MS),
  );
  const vm = runtime.newContext();
  const lines: string[] = [];

  try {
    const log = vm.newFunction("log", (...args: QuickJSHandle[]) => {
      lines.push(args.map((arg) => format(vm.dump(arg))).join(" "));
    });
    const console = vm.newObject();
    vm.setProp(console, "log", log);
    vm.setProp(vm.global, "console", console);
    log.dispose();
    console.dispose();

    const result = vm.evalCode(code);
    if (result.error) {
      const error = vm.dump(result.error);
      result.error.dispose();
      return { output: clip(lines), error: describe(error) };
    }
    const value = vm.dump(result.value);
    result.value.dispose();
    return {
      output: clip(lines),
      ...(value === undefined ? {} : { result: clip([format(value)]) }),
    };
  } finally {
    vm.dispose();
    runtime.dispose();
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function format(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function describe(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const { name, message } = error as { name?: string; message?: string };
    return `${name ?? "Error"}: ${message ?? ""}`;
  }
  return String(error);
}

/** Keeps tool results small: long printouts waste the model's context. */
function clip(lines: string[]): string {
  const text = lines.join("\n");
  return text.length > OUTPUT_LIMIT
    ? `${text.slice(0, OUTPUT_LIMIT)}\n… (${text.length - OUTPUT_LIMIT} more characters)`
    : text;
}

// ── Constants ────────────────────────────────────────────────────────────────

const TIME_LIMIT_MS = 3_000;
const MEMORY_LIMIT_BYTES = 32 * 1024 * 1024;
const STACK_LIMIT_BYTES = 1024 * 1024;
const OUTPUT_LIMIT = 4_000;

// ── Types ────────────────────────────────────────────────────────────────────

export interface CodeResult {
  output: string;
  result?: string;
  error?: string;
}
