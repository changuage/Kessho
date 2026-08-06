import { DEFAULT_STATE, type SliderState } from '../ui/state';
import { PARAM_REGISTRY } from './ParamRegistry';

export interface ProductCorePresetBoundaryIssue {
  key: keyof SliderState;
  expected: 'finite-number' | 'boolean' | 'string' | 'array' | 'object';
  actual: string;
}

export interface ProductCorePresetBoundaryValidation {
  valid: boolean;
  issues: ProductCorePresetBoundaryIssue[];
}

function describeValue(value: unknown): string {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

export function validateProductCorePresetBoundaryState(state: SliderState): ProductCorePresetBoundaryValidation {
  const issues: ProductCorePresetBoundaryIssue[] = [];
  const record = state as unknown as Record<string, unknown>;

  for (const key of Object.keys(PARAM_REGISTRY) as (keyof SliderState)[]) {
    if (!(key in DEFAULT_STATE)) continue;
    const expected = DEFAULT_STATE[key];
    const value = record[String(key)];

    if (typeof expected === 'number') {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        issues.push({ key, expected: 'finite-number', actual: describeValue(value) });
      }
      continue;
    }

    if (typeof expected === 'boolean') {
      if (typeof value !== 'boolean') {
        issues.push({ key, expected: 'boolean', actual: describeValue(value) });
      }
      continue;
    }

    if (typeof expected === 'string') {
      if (typeof value !== 'string') {
        issues.push({ key, expected: 'string', actual: describeValue(value) });
      }
      continue;
    }

    if (Array.isArray(expected)) {
      if (!Array.isArray(value)) {
        issues.push({ key, expected: 'array', actual: describeValue(value) });
      }
      continue;
    }

    if (expected && typeof expected === 'object' && (value === null || typeof value !== 'object' || Array.isArray(value))) {
      issues.push({ key, expected: 'object', actual: describeValue(value) });
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

export function enforceProductCorePresetBoundaryState(state: SliderState): SliderState {
  const validation = validateProductCorePresetBoundaryState(state);
  if (!validation.valid) {
    const summary = validation.issues
      .slice(0, 8)
      .map((issue) => `${String(issue.key)} expected ${issue.expected}, got ${issue.actual}`)
      .join('; ');
    throw new Error(`Product Core preset boundary validation failed: ${summary}`);
  }
  return state;
}
