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
  private priorityToPreemptibleRatio: number;
  private preemptibleStarvationAvoidanceCounter: number;

  /**
   *
   * @param rateLimitToMs minimum number of milliseconds between operations
   * @param ratio a ratio of priority tasks to preemptible tasks, to prevent starvation. Default: 3
   */
  constructor(rateLimitToMs: number, ratio: number = 3) {
    this.debounceMs = rateLimitToMs;
    this.priorityToPreemptibleRatio = ratio;
    this.preemptibleStarvationAvoidanceCounter = 1;
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
    const drainPreemptibleQueue =
      this.preemptibleStarvationAvoidanceCounter === 0;
    const toRun = drainPreemptibleQueue
      ? this.preemptibleQueue.shift() || this.priorityQueue.shift()
      : this.priorityQueue.shift() || this.preemptibleQueue.shift();

    if (toRun === undefined) {
      this.preemptibleStarvationAvoidanceCounter = 1;
      return;
    }

    this.rateLimiting = setTimeout(() => {
      this.rateLimiting = undefined;
      this.runImmediately();
    }, this.debounceMs);

    const promise = toRun.promise;

    this.preemptibleStarvationAvoidanceCounter =
      (this.preemptibleStarvationAvoidanceCounter + 1) %
      (this.priorityToPreemptibleRatio + 1);

    try {
      const res = toRun.task();
      const taskIsPromiseLike = res?.then !== undefined;

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
