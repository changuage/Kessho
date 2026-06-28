import fs from 'node:fs';

function nonEmptyLoc(file) {
  if (!fs.existsSync(file)) return 0;
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter((line) => line.trim().length > 0).length;
}

const config = JSON.parse(fs.readFileSync('config/architectureSizeBudgets.json', 'utf8'));
const failures = [];
const warnings = [];

for (const [file, budget] of Object.entries(config.files)) {
  const loc = nonEmptyLoc(file);
  if (loc > budget.noGrowthCeiling) {
    failures.push(`${file}: ${loc} non-empty LOC exceeds no-growth ceiling ${budget.noGrowthCeiling}`);
  }
  if (loc > budget.targetCeiling) {
    warnings.push(`${file}: ${loc} non-empty LOC above target ${budget.targetCeiling}`);
  }
}

for (const warning of warnings) console.warn(`WARN ${warning}`);
if (failures.length) {
  console.error('Strict architecture size budget failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Strict architecture size budget passed.');
