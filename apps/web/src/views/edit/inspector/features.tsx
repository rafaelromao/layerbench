import {
  featureModule,
  type Layout,
  type LayoutFeatures,
  type WrappingFeature,
} from '@layerbench/core';
import { words } from './binding-changes.js';
import { ModuleNote, Note, Row, TextField } from './controls.js';

export function featureTitle(feature: WrappingFeature): string {
  switch (feature) {
    case 'sentenceCase':
      return 'Sentence case';
    case 'capsWord':
      return 'Caps word';
  }
}

/**
 * What a sentence space does, as zmk-sentence-case's `&sentence_space`: the space key sentence case
 * makes, and any key made one.
 */
export function SentenceSpaceNote() {
  return (
    <Note>
      Types a space. After <span className="font-mono">. ? !</span> it leaves a capital for the next
      key pressed, a layer key aside: a letter a–z comes out a capital, any other key as it is.
    </Note>
  );
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
    // The module ends a sentence at its own punctuation, and capitalises with Left Shift: there is
    // nothing to choose.
    case 'sentenceCase':
      return (
        <div className="space-y-2">
          <SentenceSpaceNote />
          <ModuleNote module={featureModule('sentenceCase')} />
        </div>
      );

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
