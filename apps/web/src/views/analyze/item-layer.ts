/**
 * The layer to show for an item of a rule — a pair, a trigram, a word — given the layer each of
 * its keys was pressed on. When they agree, that one. When the item crosses layers, the last one it
 * goes up to: a thumb on the base layer and a letter on Alpha 2 show Alpha 2, where the letter is
 * and where the base layer's keys still show through. Null when the item says nothing about it.
 */
export function itemLayer(layers: readonly number[] | undefined): number | null {
  if (!layers || layers.length === 0) return null;
  for (let i = layers.length - 1; i >= 0; i--) if (layers[i] > 0) return layers[i];
  return 0;
}
