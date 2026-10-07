import type { Layout, LayoutFeatures, WrappingFeature } from '@layerbench/core';
import { ModChips, Note, Row, TextField, words } from './controls.js';

export function featureTitle(feature: WrappingFeature): string {
  switch (feature) {
    case 'sentenceCase':
      return 'Sentence case';
    case 'capsWord':
      return 'Caps word';
  }
}

/**
 * Take a feature off one key. It follows a role — the space key, the shift key — so it is taken off
 * this layer, and turned off once no layer is left, keeping its settings, so turning it back on in
 * Features finds them again.
 */
export function withoutFeatureAt(
  layout: Layout,
  feature: WrappingFeature,
  layerId: string,
): LayoutFeatures {
  const f = layout.features ?? {};
  const base = layout.layers[0]?.id;
  const current = f[feature] ?? {};
  const on = (current.on ?? (base ? [base] : [])).filter((l) => l !== layerId);
  return {
    ...f,
    [feature]: on.length > 0 ? { ...current, on } : { ...current, enabled: false },
  };
}

/** The editor for a key a feature wraps: the feature itself, since that is what the key does. */
export function FeatureBody({
  layout,
  feature,
  setFeatures,
}: {
  layout: Layout;
  feature: WrappingFeature;
  setFeatures: (features: LayoutFeatures) => void;
}) {
  const f = layout.features ?? {};
  switch (feature) {
    case 'sentenceCase': {
      const s = f.sentenceCase ?? {};
      return (
        <div className="space-y-2">
          <Note>Types a space; after the end of a sentence it also shifts the next letter.</Note>
          <Row label="After">
            <TextField
              label="Sentence-ending punctuation"
              value={(s.after ?? ['.', '?', '!']).join(' ')}
              className="w-32"
              onCommit={(text) => {
                const after = words(text);
                const next = { ...s };
                if (after.length > 0) next.after = after;
                else delete next.after;
                setFeatures({ ...f, sentenceCase: next });
              }}
            />
          </Row>
          <Row label="Shifts">
            <ModChips
              label="Modifier armed after a sentence"
              value={[s.mod ?? 'LSHIFT']}
              onChange={(mod) => setFeatures({ ...f, sentenceCase: { ...s, mod } })}
            />
          </Row>
        </div>
      );
    }

    case 'capsWord': {
      const c = f.capsWord ?? {};
      return (
        <div className="space-y-2">
          <Note>
            Shift as usual; pressed while a shift is already on, capitals until the word ends.
          </Note>
          <Row label="Continues">
            <TextField
              label="Caps word continue list"
              value={(c.continueList ?? []).join(' ')}
              placeholder="- _"
              className="w-40"
              onCommit={(text) => {
                const next = { ...c };
                if (words(text).length > 0) next.continueList = words(text);
                else delete next.continueList;
                setFeatures({ ...f, capsWord: next });
              }}
            />
          </Row>
        </div>
      );
    }
  }
}
