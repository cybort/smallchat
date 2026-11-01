import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";

/** HMAC-SHA256 counter DRBG. Both ends must call `int` the same number of times. */
export class Rng {
  private counter = 0;
  private pool = new Uint8Array(0);
  private off = 0;

  constructor(private readonly seed: Uint8Array) {}

  private refill(): void {
    const c = new Uint8Array(4);
    new DataView(c.buffer).setUint32(0, this.counter++);
    this.pool = hmac(sha256, this.seed, c);
    this.off = 0;
  }

  private u32(): number {
    if (this.off + 4 > this.pool.length) this.refill();
    const x =
      this.pool[this.off] * 16777216 +
      this.pool[this.off + 1] * 65536 +
      this.pool[this.off + 2] * 256 +
      this.pool[this.off + 3];
    this.off += 4;
    return x;
  }

  /** Uniform integer in [0, n). */
  int(n: number): number {
    if (n <= 1) return 0;
    const limit = Math.floor(0x100000000 / n) * n;
    for (;;) {
      const x = this.u32();
      if (x < limit) return x % n;
    }
  }
}
