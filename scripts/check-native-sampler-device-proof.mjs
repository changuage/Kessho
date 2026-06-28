import fs from 'node:fs';

const path = 'docs/reports/native-sampler-device-proof-latest.md';
const required = [
  'Sample 1 Piano',
  'Sample 1 + Sample 2 using same Piano asset',
  'one decode/register path',
  'memory warning',
  'background for 60s',
  'route change while sample voices active',
];

if (!fs.existsSync(path)) {
  console.error(`${path} is missing.`);
  process.exit(1);
}

const text = fs.readFileSync(path, 'utf8');
const failures = [];
for (const token of required) {
  if (!text.includes(token)) failures.push(`missing: ${token}`);
}

for (const line of text.split(/\r?\n/)) {
  if (!line.startsWith('|') || !line.includes('| PASS |')) continue;
  const cells = line.split('|').map((cell) => cell.trim());
  if (cells[2] === 'PASS' && !cells[3]) {
    failures.push(`incomplete PASS row: ${cells[1]}`);
  }
}

if (!text.includes('## Command output') || !text.includes('npm run')) {
  failures.push('Command output section must include npm commands');
}

if (failures.length) {
  console.error('Native sampler proof is incomplete.');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Native sampler proof file is structurally complete.');
