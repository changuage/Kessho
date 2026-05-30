export const backgroundAudioDeviceEvidencePath = 'docs/product-core/background-audio-device-evidence.md';

export const backgroundAudioDeviceEvidenceIds = [
  'ios-native-foreground',
  'ios-native-screen-lock',
  'ios-native-app-background',
  'ios-native-control-center',
  'ios-native-route-change',
  'macos-native-hidden',
  'macos-native-sleep-wake',
];

export const backgroundAudioDeviceEvidenceStatuses = ['pending', 'manual-pending', 'pass', 'fail'];

export const backgroundAudioDevicePassEvidenceRequirements = new Map([
  ['ios-native-foreground', ['build=', 'peak=', 'rms=', 'audible=yes']],
  ['ios-native-screen-lock', ['build=', 'peak=', 'rms=', 'screenLockAudio=continues']],
  ['ios-native-app-background', ['build=', 'peak=', 'rms=', 'appBackgroundAudio=continues']],
  ['ios-native-control-center', ['build=', 'remoteCommand=', 'playPause=pass']],
  ['ios-native-route-change', ['build=', 'routeChangeCount=', 'interruptionBeginCount=', 'audioRecovers=yes']],
  ['macos-native-hidden', ['build=', 'peak=', 'rms=', 'hiddenAudio=continues']],
  ['macos-native-sleep-wake', ['build=', 'interruptionBeginCount=', 'interruptionEndCount=', 'mediaServicesResetCount=', 'audioRecovers=yes']],
]);

export function assertEvidenceCondition(condition, message) {
  if (!condition) throw new Error(message);
}

export function parseBackgroundAudioDeviceEvidenceRows(markdown) {
  const rows = new Map();
  for (const line of markdown.split('\n')) {
    if (!line.startsWith('| ')) continue;
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
    if (cells.length < 8 || cells[0] === 'ID' || cells[0] === '---') continue;
    rows.set(cells[0], {
      id: cells[0],
      platform: cells[1],
      scenario: cells[2],
      requiredEvidence: cells[3],
      status: cells[4],
      evidence: cells[5],
      tester: cells[6],
      date: cells[7],
    });
  }
  return rows;
}

export function formatBackgroundAudioDeviceEvidenceRow(cells) {
  assertEvidenceCondition(cells.length === 8, 'background audio device evidence rows must have 8 cells');
  return `| ${cells.join(' | ')} |`;
}

export function validateBackgroundAudioDeviceEvidenceResult({
  id,
  status,
  evidence,
  tester,
  date,
  evidencePath = backgroundAudioDeviceEvidencePath,
}) {
  assertEvidenceCondition(backgroundAudioDeviceEvidenceIds.includes(id), `Unknown evidence id ${id}`);
  assertEvidenceCondition(backgroundAudioDeviceEvidenceStatuses.includes(status), `Unsupported status ${status}`);

  for (const [label, value] of [
    ['evidence', evidence],
    ['tester', tester],
    ['date', date],
  ]) {
    assertEvidenceCondition(!value.includes('|'), `${label} must not contain pipe characters`);
    assertEvidenceCondition(!value.includes('\n'), `${label} must not contain newlines`);
  }

  if (status === 'pending') {
    assertEvidenceCondition(evidence === '-' && tester === '-' && date === '-', 'pending rows must use - for evidence, tester, and date');
    return;
  }

  assertEvidenceCondition(evidence !== '-', `${status} rows must include evidence`);
  assertEvidenceCondition(tester !== '-', `${status} rows must include tester`);
  assertEvidenceCondition(/^\d{4}-\d{2}-\d{2}$/.test(date), `${status} rows must include YYYY-MM-DD date`);

  if (status === 'pass') {
    for (const token of backgroundAudioDevicePassEvidenceRequirements.get(id) ?? []) {
      assertEvidenceCondition(
        evidence.includes(token),
        `${evidencePath} row ${id} pass evidence must include ${token}`,
      );
    }
  }
}

export function updateBackgroundAudioDeviceEvidenceMarkdown(markdown, { id, status, evidence, tester, date }) {
  let updated = false;
  let updatedRow = '';
  const lines = markdown.split('\n');
  const nextLines = lines.map((line) => {
    if (!line.startsWith(`| ${id} |`)) return line;
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
    assertEvidenceCondition(cells.length === 8, `${backgroundAudioDeviceEvidencePath} row ${id} must have 8 cells`);
    cells[4] = status;
    cells[5] = evidence;
    cells[6] = tester;
    cells[7] = date;
    updated = true;
    updatedRow = formatBackgroundAudioDeviceEvidenceRow(cells);
    return updatedRow;
  });

  assertEvidenceCondition(updated, `${backgroundAudioDeviceEvidencePath} missing row ${id}`);
  return {
    markdown: nextLines.join('\n'),
    updatedRow,
  };
}
