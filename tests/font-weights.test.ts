import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Only the Vazirmatn weights in src/index.css ship with the app. A Tailwind
// weight class without a matching face would be faked by the browser, so every
// weight used in the source must have its own @font-face.

const WEIGHTS: Record<string, number> = {
  thin: 100, extralight: 200, light: 300, normal: 400, medium: 500,
  semibold: 600, bold: 700, extrabold: 800, black: 900,
};

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(tsx?|css|html)$/.test(name) ? [path] : [];
  });
}

function declaredWeights(css: string): number[] {
  const faces = css.match(/@font-face\s*{[^}]*}/g) ?? [];
  return faces
    .filter((f) => /font-family:\s*Vazirmatn/.test(f))
    .map((f) => Number(/font-weight:\s*(\d+)/.exec(f)?.[1]));
}

describe('Vazirmatn weights', () => {
  const css = readFileSync('src/index.css', 'utf8');
  const declared = declaredWeights(css);

  it('declares regular and bold, without importing the full face sheet', () => {
    expect(declared).toEqual(expect.arrayContaining([400, 700]));
    expect(css).not.toContain('Vazirmatn-font-face.css');
  });

  it('has a face for every weight class used in the source', () => {
    const used = new Set<number>([400, 700]); // body text, and <strong>/<th> defaults
    for (const file of [...files('src'), ...files('shared'), 'index.html']) {
      for (const m of readFileSync(file, 'utf8').matchAll(/\bfont-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)\b/g)) {
        used.add(WEIGHTS[m[1]]);
      }
      const outsideFaces = readFileSync(file, 'utf8').replace(/@font-face\s*{[^}]*}/g, '');
      expect(outsideFaces, file).not.toMatch(/font-weight:\s*(\d{3}|bolder|lighter)/);
    }
    for (const w of used) expect(declared, `weight ${w}`).toContain(w);
  });
});
