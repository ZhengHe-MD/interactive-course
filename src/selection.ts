import type { Selection } from "./types";

/** A new selection replaces the old context unless additive mode is explicit. */
export function mergeSelection(current: Selection[], incoming: Selection, multiple: boolean) {
  const existing = current.findIndex((selection) => selection.id === incoming.id);
  if (!multiple) return [incoming];
  if (existing < 0) return [...current, incoming];
  return current.map((selection) => (selection.id === incoming.id ? incoming : selection));
}

/** Turning additive mode off keeps the most recently selected context. */
export function collapseToLatestSelection(selections: Selection[]) {
  const latest = selections.at(-1);
  return latest ? [latest] : [];
}
