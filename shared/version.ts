// Kept apart from the zod schemas in `contract.ts` so screens that only check
// whether a stored explanation is current do not load zod. Raise it whenever a
// prompt in `prompts.ts` or the output structure changes.
export const PROMPT_VERSION = 'p1';
