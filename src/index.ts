interface QueuedTask<T> {
  task: () => T;
  promise: {
    resolve: (res: any) => void;
    reject: (err: any) => void;
  };
}

interface RateLimitedTask<T> {
  task: () => T;
  /**
   * Default: false. Set true to allow this to be bumped by other operations.
   * Use this, for example, for non-UI background async tasks.
   */
  preemptible?: boolean;
}

/**
 * Rate limit operations, for example: to avoid saturating an API with calls
 */
export class RateLimiter {
  private debounceMs: number;
  private priorityQueue: QueuedTask<any>[] = [];
  private preemptibleQueue: QueuedTask<any>[] = [];
  private rateLimiting?: NodeJS.Timeout;
  private ratio: number;
  private counter: number;

  /**
   *
   * @param rateLimitToMs minimum number of milliseconds between operations
   * @param ratio a ratio of priority tasks to preemptible tasks, to prevent starvation. Default: 3
   */
  constructor(rateLimitToMs: number, ratio: number = 3) {
    this.debounceMs = rateLimitToMs;
    this.ratio = ratio;
    this.counter = 1;
  }

  /**
   *
   * @param req {RateLimitedTask}
   */
  runRateLimited<T>(req: RateLimitedTask<T>): Promise<T> {
    const result = new Promise<T>((resolve, reject) => {
      const queue = req.preemptible
        ? this.preemptibleQueue
        : this.priorityQueue;
      queue.push({
        task: req.task,
        promise: { resolve, reject },
      });
    });
    this.scheduleNextTask();
    return result;
  }

  private scheduleNextTask() {
    if (!this.rateLimiting) {
      this.runImmediately();
    }
  }

  private runImmediately(): void {
    const drainPreemptibleQueue = this.counter === 0;
    const toRun = drainPreemptibleQueue
      ? this.preemptibleQueue.pop() || this.priorityQueue.pop()
      : this.priorityQueue.pop() || this.preemptibleQueue.pop();

    if (!toRun) {
      this.counter = 1;
      return;
    }

    const hasFurtherQueuedTasks =
      !!this.priorityQueue.length || !!this.preemptibleQueue.length;

    if (hasFurtherQueuedTasks) {
      this.rateLimiting = setTimeout(() => {
        this.rateLimiting = undefined;
        this.runImmediately();
      }, this.debounceMs);
    }
    const promise = toRun.promise;

    this.counter = (this.counter + 1) % (this.ratio + 1);
    try {
      const res = toRun.task();
      const taskIsPromiseLike = res.then !== undefined;

      if (taskIsPromiseLike) {
        res.catch(promise.reject);
        res.then(promise.resolve);
        return;
      }
      promise.resolve(res);
      return;
    } catch (e) {
      promise.reject(e);
      return;
    }
  }
}
