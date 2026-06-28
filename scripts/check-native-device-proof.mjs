import fs from 'node:fs';

const path = 'docs/reports/native-device-proof-latest.md';
const required = [
  'macOS app launches',
  'macOS Product Core starts',
  'macOS background/foreground audio continuation',
  'macOS WebKit bridge rejects malformed payload',
  'iOS app/simulator builds',
  'iOS Product Core starts',
  'iOS screen-lock/background audio continuation',
  'Product Core fail-closed state shown when unavailable',
];
const acceptedResults = new Set(['PASS', 'FAIL', 'ENV_UNAVAILABLE', 'SCRIPT_MISSING']);

if (!fs.existsSync(path)) {
  console.error(`${path} is missing. Copy docs/reports/native-device-proof-template.md and complete it.`);
  process.exit(1);
}

const text = fs.readFileSync(path, 'utf8');
const failures = [];
const hasOwnerApprovedNativeException = /Owner-approved native runtime exception:\s*YES/.test(text);

for (const token of ['Commit:', 'Date:', 'Device/Simulator:', 'OS version:', 'Build type:']) {
  const metadataLine = text.split(/\r?\n/).find((line) => line.includes(token));
  if (!metadataLine || metadataLine.trim().endsWith(token)) {
    failures.push(`metadata is incomplete: ${token}`);
  }
}

for (const check of required) {
  const row = text
    .split(/\r?\n/)
    .find((line) => line.startsWith('|') && line.includes(`| ${check} |`));
  if (!row) {
    failures.push(`missing proof row: ${check}`);
    continue;
  }
  const cells = row.split('|').map((cell) => cell.trim());
  const actual = cells[3] ?? '';
  const notes = cells[4] ?? '';
  if (!acceptedResults.has(actual)) {
    failures.push(`${check}: Actual result must be one of ${[...acceptedResults].join(', ')}`);
  }
  if ((actual === 'ENV_UNAVAILABLE' || actual === 'SCRIPT_MISSING') && !hasOwnerApprovedNativeException) {
    failures.push(`${check}: ${actual} requires Owner-approved native runtime exception: YES`);
  }
  if (!notes) {
    failures.push(`${check}: Notes cell must explain the result`);
  }
}

if (!text.includes('## Command output') || !text.includes('npm run')) {
  failures.push('Command output section must include commands run');
}

if (failures.length) {
  console.error('Native device proof is incomplete.');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Native device proof file is present and structurally complete.');
