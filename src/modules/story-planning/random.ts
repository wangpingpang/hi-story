export function random(w: { rng: number }) {
  w.rng = (Math.imul(w.rng, 1664525) + 1013904223) >>> 0;
  return w.rng / 4294967296;
}
export function pick<T>(w: { rng: number }, xs: T[]): T {
  return xs[Math.floor(random(w) * xs.length)];
}
export function hash(seed: string) {
  let n = 2166136261;
  for (const c of seed) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return n >>> 0;
}
