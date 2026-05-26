export function numberFromState(state: Record<string, unknown> | undefined, key: string, fallback: number): number {
  const value = state?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function booleanFromState(state: Record<string, unknown> | undefined, key: string, fallback: boolean): boolean {
  const value = state?.[key];
  return typeof value === 'boolean' ? value : fallback;
}

export function stringFromState(state: Record<string, unknown> | undefined, key: string, fallback: string): string {
  const value = state?.[key];
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

export function coreProductParamValue(value: unknown, enumMap: Readonly<Record<string, number>> | null, fallback: number): number {
  if (typeof value === 'string' && enumMap && Object.prototype.hasOwnProperty.call(enumMap, value)) {
    return enumMap[value] ?? fallback;
  }
  if (typeof value === 'boolean') return value ? 1 : 0;
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
