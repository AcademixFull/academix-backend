/** Public metadata only. Authorization and private responses never use this cache. */
export class BoundedCache {
  private entries = new Map<string, { value: unknown; expires: number; timer: ReturnType<typeof setTimeout> }>();
  private pending = new Map<string, Promise<unknown>>();
  private generation = 0;
  constructor(private maximum = 128, private ttlMs = 30_000, private now = Date.now) {}
  get size() { return this.entries.size; }
  clear(): void {
    this.generation++;
    for (const entry of this.entries.values()) clearTimeout(entry.timer);
    this.entries.clear(); this.pending.clear();
  }
  async get<T>(key: string, load: () => Promise<T>): Promise<T> {
    const found = this.entries.get(key);
    if (found && found.expires > this.now()) {
      this.entries.delete(key); this.entries.set(key, found);
      return found.value as T;
    }
    if (found) { clearTimeout(found.timer); this.entries.delete(key); }
    const inflight = this.pending.get(key);
    if (inflight) return inflight as Promise<T>;
    if (this.pending.size >= this.maximum) return load();
    const revision = this.generation;
    const promise = Promise.resolve().then(load).then((value) => {
      if (this.generation !== revision) return value;
      while (this.entries.size >= this.maximum) {
        const oldest = this.entries.keys().next().value as string;
        clearTimeout(this.entries.get(oldest)!.timer); this.entries.delete(oldest);
      }
      const timer = setTimeout(() => {
        if (this.entries.get(key)?.timer === timer) this.entries.delete(key);
      }, this.ttlMs);
      timer.unref?.();
      this.entries.set(key, { value, expires: this.now() + this.ttlMs, timer });
      return value;
    }).finally(() => { if (this.pending.get(key) === promise) this.pending.delete(key); });
    this.pending.set(key, promise);
    return promise;
  }
}
