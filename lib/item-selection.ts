/** A null/missing anchor toggles one item; a visible anchor adds its inclusive range. */
export function updateItemSelection(
  selectedIds: ReadonlySet<string>,
  visibleIds: readonly string[],
  clickedId: string,
  anchorId: string | null,
): Set<string> {
  const next = new Set(selectedIds);
  const clickedIndex = visibleIds.indexOf(clickedId);
  if (clickedIndex < 0) return next;

  const anchorIndex = anchorId === null ? -1 : visibleIds.indexOf(anchorId);
  if (anchorIndex < 0) {
    if (next.has(clickedId)) next.delete(clickedId);
    else next.add(clickedId);
    return next;
  }

  const start = Math.min(anchorIndex, clickedIndex);
  const end = Math.max(anchorIndex, clickedIndex);
  for (let index = start; index <= end; index++) next.add(visibleIds[index]);
  return next;
}
