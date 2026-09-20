import assert from 'node:assert/strict';
import test from 'node:test';
import {
  TRANSPORT_ASSIGNMENT_MAX_ROUTES,
  TRANSPORT_ASSIGNMENT_SIGNAL_COUNT,
  compileTransportAssignments,
  createTransportAssignmentSmoothingState,
  evaluateTransportAssignments,
  isTransportAssignmentTarget,
  sanitizeTransportAssignments,
  smoothTransportAssignmentControls,
} from './transportAssignments';
import {
  TRANSPORT_DEFAULT_CONTROLS,
  type TransportControls,
} from './visualizerTransportSchema';

function route(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'route-a',
    source: 'synth',
    signal: 'level',
    target: 'motion',
    amount: 0.5,
    ...overrides,
  };
}

function controls(): TransportControls {
  return { ...TRANSPORT_DEFAULT_CONTROLS };
}

test('assignment sanitization drops invalid routes, bounds IDs, defaults fields, and caps count', () => {
  const many = Array.from({ length: TRANSPORT_ASSIGNMENT_MAX_ROUTES + 4 }, (_, index) => route({
    id: index === 0 ? ' Route A! ' : 'route-a',
    amount: index === 0 ? 2 : -2,
    polarity: index === 0 ? 'bipolar' : undefined,
    enabled: index === 0 ? false : undefined,
  }));
  const sanitized = sanitizeTransportAssignments([
    route({ source: 'unknown' }),
    route(),
    ...many,
  ]);
  assert.equal(sanitized.length, TRANSPORT_ASSIGNMENT_MAX_ROUTES);
  assert.equal(sanitized[0]!.id, 'route-a');
  assert.equal(sanitized[0]!.amount, 0.5);
  assert.equal(sanitized[1]!.id, 'route-a-2');
  assert.equal(sanitized[1]!.amount, 1);
  assert.equal(sanitized[1]!.polarity, 'bipolar');
  assert.equal(sanitized[1]!.enabled, false);
  assert.equal(sanitized[2]!.amount, -1);
  assert.equal(sanitized[2]!.polarity, 'unipolar');
  assert.equal(sanitized[2]!.enabled, true);
  assert.deepEqual(sanitizeTransportAssignments({}), []);
});

test('compiled routes apply additive unipolar and bipolar drives without changing base', () => {
  const base = controls();
  const baseMotion = base.motion;
  const assignments = sanitizeTransportAssignments([
    route({ id: 'level-up', amount: 0.5 }),
    route({ id: 'level-bipolar', amount: 0.25, polarity: 'bipolar' }),
  ]);
  const compiled = compileTransportAssignments(assignments);
  const signals = new Float32Array(TRANSPORT_ASSIGNMENT_SIGNAL_COUNT * 2);
  signals[TRANSPORT_ASSIGNMENT_SIGNAL_COUNT] = 0.75;
  const output = controls();
  assert.equal(evaluateTransportAssignments(compiled, base, signals, output), output);
  assert.ok(Math.abs(output.motion - (baseMotion + 0.75 * 0.5 * 1.5 + 0.5 * 0.25 * 1.5)) < 0.00001);
  assert.equal(base.motion, baseMotion);
});

test('branching and absolute-time controls stay base-only while continuous targets remain assignable', () => {
  for (const key of ['medium', 'hybrid', 'react', 'octaves', 'churn', 'drift', 'flutter', 'layers', 'leafTiers', 'apShape', 'apBars', 'sunTaps', 'waterLayering', 'foldType', 'segments']) {
    assert.equal(isTransportAssignmentTarget(key), false, key);
  }
  assert.equal(isTransportAssignmentTarget('capillary'), true);
  assert.equal(isTransportAssignmentTarget('exposure'), true);
  const assignments = sanitizeTransportAssignments([
    route({ target: 'octaves', amount: 1 }),
    route({ target: 'exposure', amount: 1 }),
  ]);
  assert.equal(assignments.length, 1);
  const compiled = compileTransportAssignments(assignments);
  const signals = new Float32Array(TRANSPORT_ASSIGNMENT_SIGNAL_COUNT * 2);
  signals[TRANSPORT_ASSIGNMENT_SIGNAL_COUNT] = 1;
  const output = controls();
  evaluateTransportAssignments(compiled, TRANSPORT_DEFAULT_CONTROLS, signals, output);
  assert.equal(output.octaves, TRANSPORT_DEFAULT_CONTROLS.octaves);
  assert.equal(output.exposure, 4);
});

test('continuous assignment deltas ease in and release without changing their base controls', () => {
  const base = controls();
  const mapped = { ...base, capillary: 1 };
  const output = controls();
  const smoothing = createTransportAssignmentSmoothingState();
  smoothTransportAssignmentControls(smoothing, base, mapped, 0, output);
  assert.equal(output.capillary, base.capillary);
  smoothTransportAssignmentControls(smoothing, base, mapped, 100, output);
  assert.ok(output.capillary > base.capillary && output.capillary < 1);
  const attack = output.capillary;
  smoothTransportAssignmentControls(smoothing, base, base, 200, output);
  assert.ok(output.capillary < attack && output.capillary > base.capillary);
});

test('disabled, short, and invalid signal inputs do not produce NaN or mutate base', () => {
  const base = controls();
  const assignments = sanitizeTransportAssignments([
    route({ id: 'disabled', amount: 1, enabled: false }),
    route({ id: 'short', target: 'react', amount: 1 }),
    route({ id: 'nan', target: 'bloom', amount: 1 }),
  ]);
  const compiled = compileTransportAssignments(assignments);
  const shortSignals = new Float32Array(TRANSPORT_ASSIGNMENT_SIGNAL_COUNT);
  const output = controls();
  evaluateTransportAssignments(compiled, base, shortSignals, output);
  shortSignals[0] = Number.NaN;
  evaluateTransportAssignments(compiled, base, shortSignals, output);
  for (const value of Object.values(output)) assert.equal(Number.isNaN(value), false);
  assert.deepEqual(base, TRANSPORT_DEFAULT_CONTROLS);
});

test('repeated evaluation reuses caller-owned output', () => {
  const compiled = compileTransportAssignments(sanitizeTransportAssignments([route()]));
  const output = controls();
  const signals = new Float32Array(TRANSPORT_ASSIGNMENT_SIGNAL_COUNT * 2);
  signals[TRANSPORT_ASSIGNMENT_SIGNAL_COUNT] = 0.5;
  const first = evaluateTransportAssignments(compiled, TRANSPORT_DEFAULT_CONTROLS, signals, output);
  const firstMotion = output.motion;
  const second = evaluateTransportAssignments(compiled, TRANSPORT_DEFAULT_CONTROLS, signals, output);
  assert.equal(first, output);
  assert.equal(second, output);
  assert.equal(output.motion, firstMotion);
});
