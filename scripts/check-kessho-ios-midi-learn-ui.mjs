import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const reportPath = resolve(root, 'docs/reports/kessho-ios-midi-learn-ui-latest.json');

function read(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

function assertIncludes(source, token, label, failures) {
  if (!source.includes(token)) failures.push(`${label} missing ${token}`);
}

const failures = [];
const sheetPath = 'src/ui/midiLearn/MidiMappingBottomSheet.tsx';
const guardsPath = 'src/ui/midiLearn/iosTouchLearnGuards.ts';
const sheet = read(sheetPath);
const guards = read(guardsPath);

for (const token of [
  'role="dialog"',
  'aria-modal="true"',
  'env(safe-area-inset-bottom)',
  'minHeight: 44',
  'onClose',
  'destructive',
]) {
  assertIncludes(sheet, token, sheetPath, failures);
}

for (const token of [
  'shouldAssignIOSMidiLearnFromSliderGesture',
  'no-captured-source',
  'scroll-gesture',
  'tap-only',
  'no-value-change',
  'value-change-drag',
  'isIOSLongPressDuration',
  'iosMidiLearnSafeAreaStyle',
]) {
  assertIncludes(guards, token, guardsPath, failures);
}

const report = {
  generatedAt: new Date().toISOString(),
  status: failures.length === 0 ? 'pass' : 'fail',
  evidenceMode: 'static',
  physicalDeviceEvidenceClaimed: false,
  checkedFiles: [sheetPath, guardsPath],
  touchRules: {
    requiresCapturedSource: guards.includes('no-captured-source'),
    rejectsScrollGesture: guards.includes('scroll-gesture'),
    rejectsTapOnly: guards.includes('tap-only'),
    requiresValueChange: guards.includes('no-value-change'),
    bottomSheetSafeAreaAware: sheet.includes('env(safe-area-inset-bottom)'),
  },
  failures,
};

mkdirSync(resolve(root, 'docs/reports'), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('Kessho iOS MIDI Learn UI check passed (static)');
