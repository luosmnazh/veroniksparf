/** Простой ограничитель «N запросов за окно» в памяти процесса. */
export class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private limit: number,
    private windowMs: number,
  ) {}

  /** true — запрос разрешён. */
  take(key: string, now = Date.now()): boolean {
    const from = now - this.windowMs;
    const list = (this.hits.get(key) ?? []).filter((t) => t > from);
    if (list.length >= this.limit) {
      this.hits.set(key, list);
      return false;
    }
    list.push(now);
    this.hits.set(key, list);
    if (this.hits.size > 10_000) this.sweep(from);
    return true;
  }

  private sweep(from: number): void {
    for (const [k, list] of this.hits) {
      if (!list.some((t) => t > from)) this.hits.delete(k);
    }
  }
}
