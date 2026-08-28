export function isEditableShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  // Trigger-condition buttons belong to the sequencer's keyboard editing surface.
  // Keep lane-navigation shortcuts active after pointer edits inside that surface.
  if (target.closest('.seq-trigger-always .seq-trig-cond')) return false;
  return Boolean(target.closest('input, textarea, select, button, a[href], summary, [contenteditable="true"], [role="button"], [role="slider"]'));
}
