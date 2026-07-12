export type ConcurrencyTask<T> = () => Promise<T>;

/**
 * 按固定并发上限执行任务队列。
 * 任一任务失败不会中断其他任务；结果按输入顺序返回。
 */
export async function runWithConcurrencyLimit<T>(
  tasks: Array<ConcurrencyTask<T>>,
  limit: number,
  options?: {
    isCancelled?: () => boolean;
  }
): Promise<Array<PromiseSettledResult<T>>> {
  const safeLimit = Math.max(1, Math.floor(limit));
  const results: Array<PromiseSettledResult<T>> = new Array(tasks.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      if (options?.isCancelled?.()) {
        return;
      }

      const current = nextIndex;
      nextIndex += 1;
      if (current >= tasks.length) {
        return;
      }

      try {
        const value = await tasks[current]!();
        results[current] = { status: "fulfilled", value };
      } catch (reason) {
        results[current] = { status: "rejected", reason };
      }
    }
  }

  const workerCount = Math.min(safeLimit, tasks.length);
  await Promise.all(
    Array.from({ length: workerCount }, () => worker())
  );

  return results;
}
