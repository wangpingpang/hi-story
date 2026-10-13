export function assertSeed(seed: string): void {
  if (typeof seed !== 'string' || !seed.trim() || seed.length > 128) throw Error('种子须为 1–128 个字符，且不能全为空白');
}

// FNV-1a + Mulberry32; keep this algorithm stable for seeded appearance/1 models.
export function seededRandom(seed: string): () => number {
  let state = 2166136261;
  for (let i = 0; i < seed.length; i++) state = Math.imul(state ^ seed.charCodeAt(i), 16777619) >>> 0;
  return () => {
    let x = state += 0x6d2b79f5;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
