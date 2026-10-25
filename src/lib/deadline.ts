/** Bound optional provider work even when an SDK fails to settle after cancellation. */
export async function withDeadline<T>(milliseconds: number, task: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`Provider deadline exceeded after ${milliseconds}ms.`);
      controller.abort(error);
      reject(error);
    }, milliseconds);
  });
  try { return await Promise.race([task(controller.signal), timeout]); }
  finally { clearTimeout(timer); }
}
