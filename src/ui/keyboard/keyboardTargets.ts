export function isEditableShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target instanceof HTMLElement && target.isContentEditable) return true;

  // Text-entry and value-editing controls must keep their native keyboard behavior,
  // including when they live inside a sequencer surface.
  if (target.closest('input, textarea, select, [contenteditable="true"], [role="slider"]')) return true;

  // The sequencer is itself a keyboard-editing surface. Pointer interaction with
  // one of its non-editable buttons must not transfer keyboard ownership away
  // from lane/step navigation just because that button retains DOM focus.
  if (target.closest('.sequencer-panel')) return false;

  return Boolean(target.closest('button, a[href], summary, [role="button"]'));
}
