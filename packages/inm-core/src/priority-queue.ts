export interface QueueItem<T> { tick: number; priority: number; sequence: number; value: T }

export class DeterministicPriorityQueue<T> {
  private heap: QueueItem<T>[] = [];

  get size(): number { return this.heap.length; }
  peek(): QueueItem<T> | undefined { return this.heap[0]; }

  push(item: QueueItem<T>): void {
    this.heap.push(item);
    let index = this.heap.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (!this.before(this.heap[index]!, this.heap[parent]!)) break;
      [this.heap[index], this.heap[parent]] = [this.heap[parent]!, this.heap[index]!];
      index = parent;
    }
  }

  pop(): QueueItem<T> | undefined {
    if (this.heap.length === 0) return undefined;
    const first = this.heap[0]!;
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      let index = 0;
      while (true) {
        const left = index * 2 + 1; const right = left + 1;
        let smallest = index;
        if (left < this.heap.length && this.before(this.heap[left]!, this.heap[smallest]!)) smallest = left;
        if (right < this.heap.length && this.before(this.heap[right]!, this.heap[smallest]!)) smallest = right;
        if (smallest === index) break;
        [this.heap[index], this.heap[smallest]] = [this.heap[smallest]!, this.heap[index]!];
        index = smallest;
      }
    }
    return first;
  }

  private before(a: QueueItem<T>, b: QueueItem<T>): boolean {
    return a.tick !== b.tick ? a.tick < b.tick : a.priority !== b.priority ? a.priority < b.priority : a.sequence < b.sequence;
  }
}
