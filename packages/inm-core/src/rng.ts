export class SeededRandom {
  private state: number;
  constructor(seed: number) { this.state = (seed | 0) || 0x6d2b79f5; }
  nextUint32(): number {
    let value = this.state;
    value ^= value << 13; value ^= value >>> 17; value ^= value << 5;
    this.state = value | 0;
    return value >>> 0;
  }
  next(): number { return this.nextUint32() / 0x1_0000_0000; }
  int(min: number, maxExclusive: number): number {
    if (!Number.isInteger(min) || !Number.isInteger(maxExclusive) || maxExclusive <= min) throw new Error("Invalid seeded random integer range");
    return min + Math.floor(this.next() * (maxExclusive - min));
  }
}
