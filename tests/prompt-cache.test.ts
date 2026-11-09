import { describe, expect, it } from 'vitest';
import { buildPrompt } from '../src/ai/client';
import { tokenUsage } from '../src/ai/engine';
import { libraryPoem } from '../src/data/library';
import { poemBlock, poemText } from '../shared/prompts';

const poem = libraryPoem('hafez-ghazal-1')!;
const ctx = { title: poem.title, poet: poem.poetName, origin: poem.origin, sourceTitle: poem.source?.fullTitle ?? null, verses: poem.verses.map((v) => v.misras) };

describe('prompt caching', () => {
  it('keeps the cached part identical for every verse of a poem', () => {
    const a = buildPrompt(poem, 1, '<task>\nx\n</task>');
    const b = buildPrompt(poem, 3, '<task>\ny\n</task>');
    expect(a.poem).toBe(b.poem);
    expect(a.poem).not.toContain('selected_verse');
    expect(a.rest).toContain('<selected_verse number="1">');
    expect(b.rest).toContain('<selected_verse number="3">');
  });

  it('sends exactly the text the model saw before caching', () => {
    const p = buildPrompt(poem, 2, '<task>\nt\n</task>');
    expect(`${p.poem}\n\n${p.rest}`).toBe(`${poemBlock(ctx, 2)}\n\n<task>\nt\n</task>`);
    expect(p.poem).toBe(poemText(ctx));
  });

  it('counts cached and newly cached input in the input total', () => {
    expect(tokenUsage({ input_tokens: 120, output_tokens: 300, cache_creation_input_tokens: 900, cache_read_input_tokens: 0 }))
      .toEqual({ inputTokens: 1020, outputTokens: 300, cachedInputTokens: 0 });
    expect(tokenUsage({ input_tokens: 120, output_tokens: 300, cache_creation_input_tokens: 0, cache_read_input_tokens: 900 }))
      .toEqual({ inputTokens: 1020, outputTokens: 300, cachedInputTokens: 900 });
    expect(tokenUsage({ input_tokens: 50, output_tokens: 10, cache_creation_input_tokens: null, cache_read_input_tokens: null }))
      .toEqual({ inputTokens: 50, outputTokens: 10, cachedInputTokens: 0 });
  });
});
