export const HARMONY_PERFORMANCE_BANK_CODES = ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma'] as const;
const HARMONY_PERFORMANCE_BANK_KEYS = ['z', 'x', 'c', 'v', 'b', 'n', 'm', ','] as const;

export function harmonyPerformanceBankIndex(code: string, key = ''): number {
  const byCode = (HARMONY_PERFORMANCE_BANK_CODES as readonly string[]).indexOf(code);
  if (byCode >= 0) return byCode;
  return (HARMONY_PERFORMANCE_BANK_KEYS as readonly string[]).indexOf(key.toLowerCase());
}

export function harmonyPerformanceBankTrigger(index: number): string | null {
  return HARMONY_PERFORMANCE_BANK_KEYS[index]?.toUpperCase() ?? null;
}
