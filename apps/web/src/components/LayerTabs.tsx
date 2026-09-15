import { useRef } from 'react';

export interface LayerTabsProps {
  layers: { idx: number; id: string; name: string }[];
  active: number;
  onSelect: (idx: number) => void;
}

/**
 * Layer selection. Arrow keys move between tabs and only the active tab is in the tab order, which
 * is what a screen reader and a keyboard user expect from a tab list.
 */
export function LayerTabs({ layers, active, onSelect }: LayerTabsProps) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const move = (from: number, delta: number) => {
    const next = (from + delta + layers.length) % layers.length;
    onSelect(layers[next].idx);
    refs.current[next]?.focus();
  };

  return (
    <div role="tablist" aria-label="Layers" className="tabs tabs-box tabs-sm">
      {layers.map((layer, i) => {
        const isActive = layer.idx === active;
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
            // A key dragged onto a tab is sent to that layer; the drag hook looks for this.
            data-layer-drop={layer.id}
            onClick={() => onSelect(layer.idx)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') {
                e.preventDefault();
                move(i, 1);
              } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                move(i, -1);
              }
            }}
          >
            {layer.name}
          </button>
        );
      })}
    </div>
  );
}
