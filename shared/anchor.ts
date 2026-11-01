import { z } from 'zod';
import { AnchorSchema, ModelOutput, type AnchoredRef, type ModelOutputs, type Section } from './contract';
import { resolveAnchor } from './text';

const AnchoredRefSchema = z.object({ quote: z.string(), anchor: AnchorSchema.nullable() });
const W = ModelOutput.words.shape.items.element;
const G = ModelOutput.grammar.shape.rows.element;
const D = ModelOutput.devices.shape.items.element;

/** Schemas for what the server sends to the app after anchoring. */
export const ExplainedSchema = {
  simple: ModelOutput.simple,
  words: z.object({ items: z.array(W.extend({ ref: AnchoredRefSchema })) }),
  structure: ModelOutput.structure,
  grammar: ModelOutput.grammar.extend({ rows: z.array(G.extend({ ref: AnchoredRefSchema })) }),
  devices: z.object({ items: z.array(D.extend({ ref: AnchoredRefSchema })) }),
  deeper: ModelOutput.deeper,
} as const;

type RawRef = { misra: number; from: number; to: number; quote: string };

function anchor(misras: string[], ref: RawRef): AnchoredRef {
  return { quote: ref.quote, anchor: resolveAnchor(misras, ref) };
}

type Replace<T, K extends keyof T, V> = Omit<T, K> & { [P in K]: V };

export type Explained = {
  simple: ModelOutputs['simple'];
  words: { items: Replace<ModelOutputs['words']['items'][number], 'ref', AnchoredRef>[] };
  structure: ModelOutputs['structure'];
  grammar: Replace<ModelOutputs['grammar'], 'rows', Replace<ModelOutputs['grammar']['rows'][number], 'ref', AnchoredRef>[]>;
  devices: { items: Replace<ModelOutputs['devices']['items'][number], 'ref', AnchoredRef>[] };
  deeper: ModelOutputs['deeper'];
};

/** Replaces model token refs with validated anchors against the original misras. */
export function anchorSection<S extends Section>(section: S, data: ModelOutputs[S], misras: string[]): Explained[S] {
  switch (section) {
    case 'words': {
      const d = data as ModelOutputs['words'];
      return { items: d.items.map((it) => ({ ...it, ref: anchor(misras, it.ref) })) } as Explained[S];
    }
    case 'grammar': {
      const d = data as ModelOutputs['grammar'];
      return { ...d, rows: d.rows.map((r) => ({ ...r, ref: anchor(misras, r.ref) })) } as Explained[S];
    }
    case 'devices': {
      const d = data as ModelOutputs['devices'];
      return { items: d.items.map((it) => ({ ...it, ref: anchor(misras, it.ref) })) } as Explained[S];
    }
    default:
      return data as unknown as Explained[S];
  }
}
