// A small seeded random source. The same seed always gives the same stream,
// which is what makes the city and the screenshot scenes repeatable.
// A 32-bit xor-shift: fast, tiny, and good enough for placement and flavour.

export function createRng(seed) {
  let s = (seed >>> 0) || 0x9e3779b9;
  return function next() {
    s ^= (s << 13) >>> 0;
    s ^= s >>> 17;
    s ^= (s << 5) >>> 0;
    s >>>= 0;
    return s / 4294967296;
  };
}

/** A float in [min, max). */
export function range(rng, min, max) {
  return min + rng() * (max - min);
}

/** An integer in [min, max] inclusive. */
export function int(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

/** One element of an array, uniformly. */
export function pick(rng, items) {
  return items[Math.floor(rng() * items.length)];
}

/** True with probability p. */
export function chance(rng, p) {
  return rng() < p;
}
