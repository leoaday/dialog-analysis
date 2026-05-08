export class LRU {
  constructor(capacity) {
    this.capacity = capacity;
    this.map = new Map();
  }
  get(k) {
    if (!this.map.has(k)) return undefined;
    const v = this.map.get(k);
    this.map.delete(k); this.map.set(k, v);
    return v;
  }
  set(k, v) {
    if (this.map.has(k)) this.map.delete(k);
    this.map.set(k, v);
    if (this.map.size > this.capacity) {
      const first = this.map.keys().next().value;
      this.map.delete(first);
    }
  }
  has(k) { return this.map.has(k); }
}
