export function productStateDebugEnabled(): boolean {
  try {
    return (
      typeof localStorage !== 'undefined' &&
      localStorage.getItem('kesshoProductStateDebug') === '1'
    );
  } catch {
    return false;
  }
}

export function logProductStateDebug(record: Record<string, unknown>): void {
  if (!productStateDebugEnabled()) return;
  console.info('[kessho-product-state]', record);
}
