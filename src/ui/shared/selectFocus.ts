export function blurSelectAfterChange(select: HTMLSelectElement): void {
  setTimeout(() => {
    if (select.ownerDocument.activeElement === select) {
      select.blur();
    }
  }, 0);
}
