export type SparseParamOverrides = {
  overrideCount: number;
  overrideIndices: number[];
  overrideValues: number[];
};

export function emptyParamArray(paramCount: number): number[] {
  return Array.from({ length: paramCount }, () => 0);
}

export function paramsMatch(
  a: readonly number[],
  b: readonly number[],
  paramCount: number,
  epsilon: number,
): boolean {
  for (let index = 0; index < paramCount; index += 1) {
    if (Math.abs((a[index] ?? 0) - (b[index] ?? 0)) > epsilon) return false;
  }
  return true;
}

export function sparseParamOverridesFromDiff(
  exactParams: readonly number[],
  reconstructedParams: readonly number[],
  paramCount: number,
  epsilon: number,
): SparseParamOverrides {
  const overrideIndices = emptyParamArray(paramCount);
  const overrideValues = emptyParamArray(paramCount);
  let overrideCount = 0;
  for (let paramIndex = 0; paramIndex < paramCount; paramIndex += 1) {
    if (Math.abs((exactParams[paramIndex] ?? 0) - (reconstructedParams[paramIndex] ?? 0)) <= epsilon) {
      continue;
    }
    overrideIndices[overrideCount] = paramIndex;
    overrideValues[overrideCount] = exactParams[paramIndex] ?? 0;
    overrideCount += 1;
  }
  return { overrideCount, overrideIndices, overrideValues };
}
