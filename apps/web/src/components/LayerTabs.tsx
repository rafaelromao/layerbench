import type { LayerColor } from '@layoutmaster/core';
import { useEffect, useRef, useState } from 'react';
import { layerColourOf } from './layer-colour.js';

export interface LayerTabsProps {
  layers: { idx: number; id: string; name: string; color?: LayerColor }[];
  active: number;
  onSelect: (idx: number) => void;
  /** Lets a tab be renamed where it stands: double-click it, press F2 on it, or hold a finger on it. */
  onRename?: (id: string, name: string) => void;
}

/** How long a finger rests on a tab before it is renamed rather than selected. */
const LONG_PRESS_MS = 550;

/**
 * Layer selection. Arrow keys move between tabs and only the active tab is in the tab order, which
 * is what a screen reader and a keyboard user expect from a tab list.
 */
export function LayerTabs({ layers, active, onSelect, onRename }: LayerTabsProps) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const [renaming, setRenaming] = useState<string | null>(null);
  const press = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointer = useRef<string>('mouse');
  const field = useRef<HTMLInputElement>(null);
  /** Enter, Escape and the blur that follows either must settle one rename, not two. */
  const settled = useRef(false);

  useEffect(() => {
    if (renaming === null) return;
    settled.current = false;
    field.current?.focus();
    field.current?.select();
  }, [renaming]);
  useEffect(
    () => () => {
      if (press.current) clearTimeout(press.current);
    },
    [],
  );

  const move = (from: number, delta: number) => {
    const next = (from + delta + layers.length) % layers.length;
    onSelect(layers[next].idx);
    refs.current[next]?.focus();
  };
  const cancelPress = () => {
    if (press.current) clearTimeout(press.current);
    press.current = null;
  };
  const finish = (id: string, name: string | null, i: number) => {
    if (settled.current) return;
    settled.current = true;
    setRenaming(null);
    if (name !== null) onRename?.(id, name);
    // The tab comes back where the field was; focus goes with it, so the keyboard is not lost.
    requestAnimationFrame(() => refs.current[i]?.focus());
  };

  return (
    <div role="tablist" aria-label="Layers" className="tabs tabs-box tabs-sm">
      {layers.map((layer, i) => {
        const isActive = layer.idx === active;
        const colour = layerColourOf(layer.idx, layer.color);
        const dot = colour && (
          // The same colour the keys that reach this layer are drawn in.
          <span
            aria-hidden="true"
            className="inline-block size-2 rounded-full mr-1.5"
            style={{ background: colour }}
          />
        );
        if (renaming === layer.id) {
          return (
            <span key={layer.id} className="tab tab-active gap-0">
              {dot}
              <input
                ref={field}
                aria-label={`Rename ${layer.name}`}
                className="input input-xs w-28"
                defaultValue={layer.name}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    finish(layer.id, e.currentTarget.value, i);
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    finish(layer.id, null, i);
                  }
                }}
                onBlur={(e) => finish(layer.id, e.currentTarget.value, i)}
              />
            </span>
          );
        }
        return (
          <button
            key={layer.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            ref={(el) => {
              refs.current[i] = el;
            }}
            className={`tab ${isActive ? 'tab-active' : ''}`}
            title={onRename ? 'Double-click to rename' : undefined}
            // A key dragged onto a tab is sent to that layer; the drag hook looks for this.
            data-layer-drop={layer.id}
            onClick={() => onSelect(layer.idx)}
            onDoubleClick={() => onRename && setRenaming(layer.id)}
            onPointerDown={(e) => {
              pointer.current = e.pointerType;
              if (!onRename || e.pointerType !== 'touch') return;
              cancelPress();
              press.current = setTimeout(() => setRenaming(layer.id), LONG_PRESS_MS);
            }}
            onPointerUp={cancelPress}
            onPointerLeave={cancelPress}
            onPointerCancel={cancelPress}
            // A finger held on a tab would otherwise also open the browser's menu for it.
            onContextMenu={(e) => {
              if (onRename && pointer.current === 'touch') e.preventDefault();
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') {
                e.preventDefault();
                move(i, 1);
              } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                move(i, -1);
              } else if (e.key === 'F2' && onRename) {
                e.preventDefault();
                setRenaming(layer.id);
              }
            }}
          >
            {dot}
            {layer.name}
          </button>
        );
      })}
    </div>
  );
}
