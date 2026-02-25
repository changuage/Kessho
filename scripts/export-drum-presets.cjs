/**
 * Export drum presets from TypeScript source to JSON files.
 * Run: node scripts/export-drum-presets.cjs
 */
const fs = require('fs');
const path = require('path');

const srcFile = path.join(__dirname, '..', 'src', 'audio', 'drumPresets.ts');
const outDir = path.join(__dirname, '..', 'public', 'presets', 'DrumSynth');

// Read the TS source
const src = fs.readFileSync(srcFile, 'utf8');

// Extract all preset objects using regex
// Each preset block looks like: { name: '...', voice: '...', tags: [...], params: { ... } }
const presetRegex = /\{\s*name:\s*'([^']+)',\s*voice:\s*'([^']+)',\s*tags:\s*\[([^\]]*)\],\s*params:\s*\{([^}]+)\}\s*,?\s*\}/g;

const allPresets = {};
let match;
while ((match = presetRegex.exec(src)) !== null) {
  const name = match[1];
  const voice = match[2];
  const tagsStr = match[3];
  const paramsStr = match[4];
  
  // Parse tags
  const tags = tagsStr.match(/'([^']+)'/g)?.map(t => t.replace(/'/g, '')) || [];
  
  // Parse params
  const params = {};
  const paramLines = paramsStr.split('\n');
  for (const line of paramLines) {
    const paramMatch = line.match(/(\w+):\s*(.+?),?\s*$/);
    if (paramMatch) {
      const key = paramMatch[1];
      let val = paramMatch[2].replace(/\/\/.*$/, '').replace(/,\s*$/, '').trim();
      // Try to parse as number
      if (val.match(/^-?[\d.]+$/)) {
        val = parseFloat(val);
      } else {
        // Remove quotes and 'as const'
        val = val.replace(/'/g, '').replace(/ as const/, '').trim();
      }
      params[key] = val;
    }
  }
  
  if (!allPresets[voice]) allPresets[voice] = [];
  allPresets[voice].push({ name, voice, tags, params });
}

// Write per-voice JSON files
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const voiceCounts = {};
for (const [voice, presets] of Object.entries(allPresets)) {
  const filename = `${voice}.json`;
  const filepath = path.join(outDir, filename);
  fs.writeFileSync(filepath, JSON.stringify(presets, null, 2));
  voiceCounts[voice] = presets.length;
  console.log(`Wrote ${filepath} (${presets.length} presets)`);
}

// Write manifest
const manifest = {
  generated: new Date().toISOString(),
  voices: Object.keys(allPresets),
  files: Object.keys(allPresets).map(v => `${v}.json`),
  counts: voiceCounts,
  total: Object.values(voiceCounts).reduce((a, b) => a + b, 0)
};
fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`\nManifest: ${JSON.stringify(manifest, null, 2)}`);
