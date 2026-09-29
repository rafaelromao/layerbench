import type {
  AdaptiveKeyFeature,
  AltRepeatFeature,
  FeaturePlacement,
  Layout,
  LayoutFeatures,
} from '@layoutmaster/core';
import { ArmEditor, type EditorScope, TriggersEditor } from './bodies.js';
import { ModChips, Note, Row, TextField, words } from './controls.js';

/** A feature that owns a key, found from the name the compiler recorded against it. */
export type OwningFeature =
  | { kind: 'adaptive'; index: number; feature: AdaptiveKeyFeature }
  | { kind: 'altRepeat'; feature: AltRepeatFeature }
  | { kind: 'sentenceCase' }
  | { kind: 'capsWord' };

export function owningFeature(layout: Layout, owner: string): OwningFeature | null {
  const f = layout.features ?? {};
  const index = (f.adaptiveKeys ?? []).findIndex((a) => a.id === owner);
  if (index >= 0 && f.adaptiveKeys) {
    return { kind: 'adaptive', index, feature: f.adaptiveKeys[index] };
  }
  if (f.altRepeat && owner === (f.altRepeat.id ?? 'altRepeat')) {
    return { kind: 'altRepeat', feature: f.altRepeat };
  }
  if (owner === 'sentenceCase') return { kind: 'sentenceCase' };
  if (owner === 'capsWord') return { kind: 'capsWord' };
  return null;
}

export function featureTitle(owning: OwningFeature): string {
  switch (owning.kind) {
    case 'adaptive':
      return owning.feature.label ?? owning.feature.id;
    case 'altRepeat':
      return 'Alt repeat';
    case 'sentenceCase':
      return 'Sentence case';
    case 'capsWord':
      return 'Caps word';
  }
}

const at = (p: FeaturePlacement, layer: string, key: string) => p.layer === layer && p.key === key;

/**
 * Take a feature off one key. A placed feature loses the placement; one that follows a role is
 * taken off this layer, and turned off once no layer is left — keeping its settings, so turning it
 * back on in Features finds them again.
 */
export function withoutFeatureAt(
  layout: Layout,
  owning: OwningFeature,
  layerId: string,
  keyId: string,
): LayoutFeatures {
  const f = layout.features ?? {};
  const base = layout.layers[0]?.id;
  switch (owning.kind) {
    case 'adaptive': {
      const keys = [...(f.adaptiveKeys ?? [])];
      const a = owning.feature;
      keys[owning.index] = { ...a, at: (a.at ?? []).filter((p) => !at(p, layerId, keyId)) };
      return { ...f, adaptiveKeys: keys };
    }
    case 'altRepeat': {
      const a = owning.feature;
      return { ...f, altRepeat: { ...a, at: (a.at ?? []).filter((p) => !at(p, layerId, keyId)) } };
    }
    case 'sentenceCase':
    case 'capsWord': {
      const current = f[owning.kind] ?? {};
      const on = (current.on ?? (base ? [base] : [])).filter((l) => l !== layerId);
      return {
        ...f,
        [owning.kind]: on.length > 0 ? { ...current, on } : { ...current, enabled: false },
      };
    }
  }
}

/** Put a placed feature on one more key. */
export function withFeatureAt(
  layout: Layout,
  owning: Extract<OwningFeature, { kind: 'adaptive' | 'altRepeat' }>,
  layerId: string,
  keyId: string,
): LayoutFeatures {
  const f = layout.features ?? {};
  const placement = { layer: layerId, key: keyId };
  if (owning.kind === 'altRepeat') {
    const { enabled: _on, ...a } = owning.feature;
    return { ...f, altRepeat: { ...a, at: [...(a.at ?? []), placement] } };
  }
  const keys = [...(f.adaptiveKeys ?? [])];
  // Placing it is asking for it, so a magic key that was switched off comes back on.
  const { enabled: _on, ...a } = owning.feature;
  keys[owning.index] = { ...a, at: [...(a.at ?? []), placement] };
  return { ...f, adaptiveKeys: keys };
}

/** The editor for a key a feature owns: the feature itself, since that is what the key does. */
export function FeatureBody({
  scope,
  layout,
  owning,
  layerId,
  keyId,
  setFeatures,
}: {
  scope: EditorScope;
  layout: Layout;
  owning: OwningFeature;
  layerId: string;
  keyId: string;
  setFeatures: (features: LayoutFeatures) => void;
}) {
  const f = layout.features ?? {};
  const elsewhere = (placements: FeaturePlacement[] | undefined) => {
    const others = (placements ?? []).filter((p) => !at(p, layerId, keyId));
    return others.length === 0
      ? null
      : `Also on ${others.map((p) => `${layout.layers.find((l) => l.id === p.layer)?.name ?? p.layer} ${p.key}`).join(', ')} — a change here changes those too.`;
  };

  switch (owning.kind) {
    case 'adaptive': {
      const a = owning.feature;
      const update = (patch: Partial<AdaptiveKeyFeature>) => {
        const keys = [...(f.adaptiveKeys ?? [])];
        keys[owning.index] = { ...a, ...patch };
        setFeatures({ ...f, adaptiveKeys: keys });
      };
      const note = elsewhere(a.at);
      return (
        <div className="space-y-2">
          <Row label="Name">
            <TextField
              label="Magic key name"
              value={a.label ?? a.id}
              className="w-40"
              onCommit={(label) => update({ label: label || undefined })}
            />
          </Row>
          {note && <Note>{note}</Note>}
          <ArmEditor
            scope={scope}
            label="Default"
            value={a.default}
            depth={0}
            onChange={(d) => update({ default: d })}
          />
          <Note>What it types when no branch matches the key before it.</Note>
          <TriggersEditor
            scope={scope}
            depth={0}
            triggers={a.triggers}
            onChange={(triggers) => update({ triggers })}
          />
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              className="checkbox checkbox-xs"
              checked={a.strictModifiers ?? false}
              onChange={(e) => update({ strictModifiers: e.target.checked || undefined })}
            />
            Only when the key before had no modifier held
          </label>
        </div>
      );
    }

    case 'altRepeat': {
      const a = owning.feature;
      const update = (next: AltRepeatFeature) => setFeatures({ ...f, altRepeat: next });
      const stage = a.secondStage;
      const note = elsewhere(a.at);
      return (
        <div className="space-y-2">
          <Note>Repeats the previous key, unless a branch below matches it.</Note>
          {note && <Note>{note}</Note>}
          <TriggersEditor
            scope={scope}
            depth={0}
            triggers={a.triggers}
            onChange={(triggers) => update({ ...a, triggers })}
          />
          <details className="text-xs" open={stage !== undefined}>
            <summary className="cursor-pointer opacity-70">
              Second stage, after a tagged key
            </summary>
            <div className="space-y-2 pt-2">
              <Note>
                Branches tried first when the key before carried one of these tags — what firmware
                needs a one-shot layer for.
              </Note>
              <Row label="Tags">
                <TextField
                  label="Second stage tags"
                  value={(stage?.afterTags ?? []).join(' ')}
                  placeholder="alpha2"
                  className="w-40"
                  onCommit={(text) => {
                    const afterTags = words(text);
                    if (afterTags.length === 0) {
                      const { secondStage: _gone, ...rest } = a;
                      update(rest);
                    } else {
                      update({ ...a, secondStage: { triggers: [], ...stage, afterTags } });
                    }
                  }}
                />
              </Row>
              {stage && (
                <TriggersEditor
                  scope={scope}
                  depth={0}
                  name="Second stage"
                  fixedTags
                  triggers={stage.triggers}
                  onChange={(triggers) => update({ ...a, secondStage: { ...stage, triggers } })}
                />
              )}
            </div>
          </details>
        </div>
      );
    }

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
