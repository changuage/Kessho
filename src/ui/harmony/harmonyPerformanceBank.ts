import { HARMONY_SLOT_TRIGGER_KEYS } from '../../audio/CoreProductHarmonyControl';

export const HARMONY_PERFORMANCE_BANK_CODES = ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma'] as const;

export type HarmonyPerformanceBankScope = 'slots' | 'suggestions';

export function harmonyPerformanceBankIndex(code: string, key = ''): number {
  const byCode = (HARMONY_PERFORMANCE_BANK_CODES as readonly string[]).indexOf(code);
  if (byCode >= 0) return byCode;
  return (HARMONY_SLOT_TRIGGER_KEYS as readonly string[]).indexOf(key.toLowerCase());
}

export function harmonyPerformanceBankScope(suggestionsOpen: boolean, slashHeld: boolean): HarmonyPerformanceBankScope {
  return suggestionsOpen || slashHeld ? 'suggestions' : 'slots';
}

export function harmonyPerformanceBankTrigger(index: number): string | null {
  return HARMONY_SLOT_TRIGGER_KEYS[index]?.toUpperCase() ?? null;
}
