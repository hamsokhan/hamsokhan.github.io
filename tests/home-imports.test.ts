// The home screen loads only what it statically imports. The request code
// (zod schemas, prompts, anchoring, the SDK) must stay behind dynamic
// `import()`, so a static import of it anywhere on that path fails here.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '..');
const HEAVY = ['zod', '@anthropic-ai/sdk', 'shared/anchor.ts', 'shared/prompts.ts', 'src/ai/client.ts', 'src/ai/engine.ts'];

function resolveLocal(from: string, spec: string): string | null {
  const base = resolve(dirname(from), spec);
  return [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`].find((f) => existsSync(f) && statSync(f).isFile()) ?? null;
}

/** Every module reached through static imports (type-only imports are erased and skipped). */
function staticClosure(entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [resolve(root, entry)];
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/^\s*(import|export)\s+(?!type\b)(?:[^'";]*?\sfrom\s+)?['"]([^'"]+)['"]/gm)) {
      const spec = m[2];
      if (spec.startsWith('.')) {
        const target = resolveLocal(file, spec);
        if (target && /\.(ts|tsx)$/.test(target)) queue.push(target);
      } else seen.add(spec);
    }
  }
  return new Set([...seen].map((f) => f.replace(`${root}/`, '')));
}

describe('home screen bundle', () => {
  const closure = staticClosure('src/main.tsx');

  it('reaches the home screen and the app shell', () => {
    expect(closure).toContain('src/screens/Discover.tsx');
    expect(closure).toContain('src/ai/useAi.tsx');
    expect(closure).toContain('src/ai/settings.ts');
  });

  it('does not statically import the request code', () => {
    expect([...closure].filter((f) => HEAVY.includes(f))).toEqual([]);
  });
});
