/**
 * Runs at most `limit` tasks at once; the rest wait in arrival order. Every
 * caller holding the same limiter shares the slots, so speculative work and
 * the work that is finally needed queue together instead of doubling the load.
 *
 * @example
 * const limit = createLimiter(4);
 * const clips = await Promise.all(texts.map((t) => limit(() => speak(t))));
 */
export function createLimiter(limit: number) {
  let active = 0;
  const waiting: Array<() => void> = [];

  const startNext = () => {
    if (active >= limit) return;
    const start = waiting.shift();
    if (!start) return;
    active++;
    start();
  };

  return function run<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      waiting.push(() => {
        Promise.resolve()
          .then(task)
          .then(resolve, reject)
          .finally(() => {
            active--;
            startNext();
          });
      });
      startNext();
    });
  };
}

export type Limiter = ReturnType<typeof createLimiter>;
