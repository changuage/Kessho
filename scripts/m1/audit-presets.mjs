// M1 preset audit: which features do the presets stored in the repo use?
// Usage: node scripts/m1/audit-presets.mjs
// Writes a markdown table to stdout and docs/ui/harmony-handoff/m1-preset-audit.md.
// Plain Node ESM, no dependencies.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..', '..');
const PUBLIC_PRESETS = path.join(ROOT, 'public', 'presets');
const ARCHIVE_PRESETS = path.join(ROOT, 'archive', 'native-swift', 'KesshoNativeSwift', 'Kessho', 'Presets');
const REPORT_PATH = path.join(ROOT, 'docs', 'ui', 'harmony-handoff', 'm1-preset-audit.md');

// Tracked files that look like preset JSON but are not app preset state.
const EXCLUDED = [
  ['public/presets/manifest.json', 'file index only (lists StringWaves.json)'],
  ['docs/preset-cluster-analysis-2026-06-21.json', 'analysis output with metadata and payloadKeyCount only, no preset state'],
  ['src/audio/lead4opfmV2PresetBank.json', 'Lead4opFM engine voice bank with its own schema, not app state'],
];

const warnings = [];

// ---------- generic helpers ----------

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Recursively collect every { key, value, path } whose key satisfies pred.
function findKeys(node, pred, pathPrefix = '') {
  const out = [];
  const visit = (n, p) => {
    if (Array.isArray(n)) {
      n.forEach((c, i) => visit(c, `${p}[${i}]`));
      return;
    }
    if (!isObj(n)) return;
    for (const [k, v] of Object.entries(n)) {
      const childPath = p ? `${p}.${k}` : k;
      if (pred(k, v)) out.push({ key: k, value: v, path: childPath });
      visit(v, childPath);
    }
  };
  visit(node, pathPrefix);
  return out;
}

// True when the value contains an object with active === true anywhere below it.
function containsActiveTrue(v) {
  if (Array.isArray(v)) return v.some(containsActiveTrue);
  if (!isObj(v)) return false;
  if (v.active === true) return true;
  return Object.values(v).some(containsActiveTrue);
}

const fmt = (v) => {
  if (v === undefined) return '-';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000);
  if (v === null) return 'null';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};

const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');

// ---------- loading ----------

// Returns [{ corpus, file, name, id, state, wrapper }] for every preset in one file.
function loadFile(absPath, relPath) {
  const raw = JSON.parse(fs.readFileSync(absPath, 'utf8'));
  const base = path.basename(relPath);

  // Single saved preset: { id?, name?, state: {...}, synthPlayConfigs?, ... }
  if (isObj(raw) && isObj(raw.state)) {
    return [{
      kind: 'full',
      corpus: relPath,
      file: relPath,
      name: raw.name ?? base,
      id: raw.id ?? '-',
      state: raw.state,
      wrapper: raw,
    }];
  }

  // Collection of drum presets: { entries: [ { name, versions: [ { v, data } ], currentVersion } ] }
  if (isObj(raw) && Array.isArray(raw.entries)) {
    const out = [];
    for (const entry of raw.entries) {
      const versions = Array.isArray(entry.versions) ? entry.versions : [];
      const current = versions.find((ver) => ver.v === entry.currentVersion) ?? versions[versions.length - 1];
      if (!current || !isObj(current.data)) {
        warnings.push(`${relPath}: entry ${entry.id ?? entry.name} has no version data, skipped`);
        continue;
      }
      out.push({
        kind: 'drum',
        corpus: relPath,
        file: relPath,
        name: `${entry.name} (${entry.scope ?? entry.engine ?? 'drum'}, v${current.v ?? '?'})`,
        id: entry.id ?? '-',
        state: current.data,
        wrapper: {},
      });
    }
    return out;
  }

  throw new Error(`Unrecognised preset format in ${relPath}`);
}

function collectPresets() {
  const included = [];
  const presetFiles = fs.readdirSync(PUBLIC_PRESETS)
    .filter((f) => f.endsWith('.json') && f !== 'manifest.json')
    .sort();
  for (const f of presetFiles) {
    included.push({ abs: path.join(PUBLIC_PRESETS, f), rel: `public/presets/${f}` });
  }
  const archiveFiles = fs.readdirSync(ARCHIVE_PRESETS)
    .filter((f) => f.endsWith('.json'))
    .sort();
  for (const f of archiveFiles) {
    included.push({
      abs: path.join(ARCHIVE_PRESETS, f),
      rel: `archive/native-swift/KesshoNativeSwift/Kessho/Presets/${f}`,
    });
  }
  const presets = [];
  for (const f of included) presets.push(...loadFile(f.abs, f.rel));
  return { presets, included };
}

// ---------- feature detection ----------

function audit(p) {
  const s = p.state;
  const row = {};

  // randomChords
  const chordGen = findKeys(s, (k, v) => k === 'synthChordGeneratorEnabled' && v === true);
  row.randomChords = chordGen.length > 0;
  const voices = findKeys(s, (k) => k === 'synthChordGeneratorVoiceCount')[0];
  const spread = findKeys(s, (k) => /waveSpread/i.test(k))[0];
  row.randomChordsDetail = row.randomChords
    ? [voices ? `voices ${fmt(voices.value)}` : null, spread ? `waveSpread ${fmt(spread.value)}` : null]
        .filter(Boolean).join(', ') || 'on'
    : 'off';

  // randomNotes
  const leadRandom = findKeys(s, (k, v) => k === 'leadRandomEnabled' && v === true);
  row.randomNotes = leadRandom.length > 0;
  const clock = findKeys(s, (k) => k === 'leadRandomClockSource')[0];
  row.randomNotesDetail = row.randomNotes
    ? (clock ? `clock ${fmt(clock.value)}` : 'on')
    : 'off';

  // scatterActive: an object with active: true under a key containing "scatter"
  const scatterHits = findKeys(s, (k, v) => /scatter/i.test(k) && (containsActiveTrue(v) || (/active/i.test(k) && v === true)));
  row.scatterActive = scatterHits.length > 0;
  row.scatterDetail = scatterHits.length ? scatterHits.map((h) => h.path).join(', ') : 'none active';

  // authoredChords
  const reasons = [];
  const progressions = findKeys(s, (k, v) => k === 'harmonyProgression' && isObj(v));
  for (const pr of progressions) {
    if (pr.value.enabled === true && Array.isArray(pr.value.events)) {
      const authored = pr.value.events.some((e) => isObj(e.source) && e.source.type !== 'auto');
      if (authored) reasons.push('progression events not auto');
    }
  }
  const palettes = findKeys(s, (k, v) => k === 'harmonyPalette' && Array.isArray(v) && v.length > 0);
  if (palettes.length) reasons.push('palette chords set');

  // synthPlayConfigs: the raw array is always stored, so count it as authored only
  // when a config is enabled or has an active step.
  const playArrays = [p.wrapper.synthPlayConfigs, s.synthPlayConfigs].filter((v) => Array.isArray(v) && v.length > 0);
  let playTotal = 0;
  let playActive = 0;
  for (const arr of playArrays) {
    for (const cfg of arr) {
      playTotal += 1;
      const steps = isObj(cfg.chord) && Array.isArray(cfg.chord.steps) ? cfg.chord.steps : [];
      const activeStep = steps.some((st) => isObj(st) && st.active === true);
      if (cfg.enabled === true || activeStep) playActive += 1;
    }
  }
  if (playActive > 0) reasons.push(`${playActive} active synth play config(s)`);
  row.playConfigs = playTotal ? `${playActive} active of ${playTotal}` : '-';

  row.authoredChords = reasons.length > 0;
  row.authoredDetail = reasons.length ? [...new Set(reasons)].join('; ') : 'none';

  // journey: any key starting with "journey" holding a non-default value
  const journeyKeys = findKeys(s, (k) => /^journey/i.test(k));
  const isUsed = (v) => {
    if (v === true) return true;
    if (typeof v === 'number') return v !== 0;
    if (typeof v === 'string') return !['', 'off', 'none', 'false', 'default'].includes(v.toLowerCase());
    if (Array.isArray(v)) return v.length > 0;
    if (isObj(v)) return Object.keys(v).length > 0;
    return false;
  };
  const journeyUsed = journeyKeys.filter((h) => isUsed(h.value));
  row.journey = journeyUsed.length > 0;
  row.journeyDetail = journeyKeys.length
    ? journeyKeys.map((h) => `${h.key}=${fmt(h.value)}`).join(', ')
    : 'no journey keys';

  // keyDrift
  const drift = (name) => findKeys(s, (k) => k === name)[0];
  const dEnabled = drift('cofDriftEnabled');
  row.keyDrift = dEnabled ? dEnabled.value === true : false;
  if (dEnabled) {
    row.keyDriftDetail = dEnabled.value === true
      ? `on, rate ${fmt(drift('cofDriftRate')?.value)}, direction ${fmt(drift('cofDriftDirection')?.value)}, range ${fmt(drift('cofDriftRange')?.value)}`
      : 'off';
  } else {
    row.keyDriftDetail = 'key not present';
  }

  // sequencer slots: state.synthSequencerFaces.slots[i].mode
  const faces = s.synthSequencerFaces;
  if (isObj(faces) && Array.isArray(faces.slots)) {
    const modeCounts = new Map();
    for (const slot of faces.slots) {
      const mode = isObj(slot) && typeof slot.mode === 'string' ? slot.mode : 'unknown';
      modeCounts.set(mode, (modeCounts.get(mode) ?? 0) + 1);
    }
    const order = ['euclid', 'anchorWalker', 'orbit'];
    const modes = [...modeCounts.keys()].sort((a, b) => {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
    });
    row.sequencerSlotModes = modes.map((m) => ({ mode: m, count: modeCounts.get(m) }));
    row.sequencerSlots = row.sequencerSlotModes.length
      ? row.sequencerSlotModes.map((m) => `${m.mode} ×${m.count}`).join(', ')
      : '-';
  } else {
    row.sequencerSlotModes = [];
    row.sequencerSlots = '-';
  }
  row.usesWalker = row.sequencerSlotModes.some((m) => m.mode === 'anchorWalker');
  row.usesOrbit = row.sequencerSlotModes.some((m) => m.mode === 'orbit');

  return row;
}

// ---------- run ----------

const { presets, included } = collectPresets();
const rows = presets.map((p) => ({ preset: p, ...audit(p) }));

const counts = {
  total: rows.length,
  randomChords: rows.filter((r) => r.randomChords).length,
  randomNotes: rows.filter((r) => r.randomNotes).length,
  scatterActive: rows.filter((r) => r.scatterActive).length,
  authoredChords: rows.filter((r) => r.authoredChords).length,
  journey: rows.filter((r) => r.journey).length,
  keyDrift: rows.filter((r) => r.keyDrift).length,
  walker: rows.filter((r) => r.usesWalker).length,
  orbit: rows.filter((r) => r.usesOrbit).length,
};

const byCorpus = new Map();
for (const r of rows) byCorpus.set(r.preset.corpus, (byCorpus.get(r.preset.corpus) ?? 0) + 1);

const fullRows = rows.filter((r) => r.preset.kind === 'full');
const drumRows = rows.filter((r) => r.preset.kind === 'drum');

const now = new Date();
const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

const header = [
  '| Preset | Corpus | Random chords | Random notes | Scatter active | Authored chords | Journey | Key drift | Sequencer slots | Play configs |',
  '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
];
const tableRows = fullRows.map((r) => [
  r.preset.name,
  path.basename(r.preset.corpus),
  r.randomChords ? `yes, ${r.randomChordsDetail}` : 'no',
  r.randomNotes ? `yes, ${r.randomNotesDetail}` : 'no',
  r.scatterActive ? `yes, ${r.scatterDetail}` : 'no',
  r.authoredChords ? `yes, ${r.authoredDetail}` : 'no',
  r.journey ? `yes, ${r.journeyDetail}` : 'no',
  r.keyDriftDetail,
  r.sequencerSlots,
  r.playConfigs,
].map(cell));
const tableLines = [...header, ...tableRows.map((cols) => `| ${cols.join(' | ')} |`)];

const FEATURE_LABELS = [
  ['randomChords', 'random chords'],
  ['randomNotes', 'random notes'],
  ['scatterActive', 'scatter active'],
  ['authoredChords', 'authored chords'],
  ['journey', 'journey'],
  ['keyDrift', 'key drift'],
];
const drumFiles = [...new Set(drumRows.map((r) => r.preset.corpus))];
const drumLines = drumFiles.map((corpus) => {
  const rs = drumRows.filter((r) => r.preset.corpus === corpus);
  const yes = (key) => rs.filter((r) => r[key]).length;
  const parts = FEATURE_LABELS.map(([key, label]) => `${label} ${yes(key)}`);
  parts.push(`sequencer slots ${rs.filter((r) => r.sequencerSlotModes.length > 0).length}`);
  return `- ${corpus}: ${rs.length} entries, ${parts.join(', ')}`;
});

const summaryLines = [
  `- Presets audited: ${counts.total} (${[...byCorpus].map(([c, n]) => `${n} from ${c}`).join('; ')})`,
  `- Full-state presets in table: ${fullRows.length}; drum engine entries summarised below: ${drumRows.length}`,
  `- Random chords on: ${counts.randomChords}`,
  `- Random notes on: ${counts.randomNotes}`,
  `- Scatter active: ${counts.scatterActive}`,
  `- Authored chords: ${counts.authoredChords}`,
  `- Journey keys in use: ${counts.journey}`,
  `- Key drift on: ${counts.keyDrift}`,
  `- Using Walker (anchorWalker slot): ${counts.walker}`,
  `- Using Orbit (orbit slot): ${counts.orbit}`,
];

const fileLines = [
  '### Included',
  ...included.map((f) => `- ${f.rel}`),
  '',
  '### Excluded',
  ...EXCLUDED.map(([f, why]) => `- ${f}: ${why}`),
];

const warnLines = warnings.length ? ['', '### Warnings', ...warnings.map((w) => `- ${w}`)] : [];

const report = [
  '# M1 preset audit',
  '',
  `Generated by \`node scripts/m1/audit-presets.mjs\` on ${date}. Covers presets stored in the repo only; the cloud/user library is not available offline and must be audited separately before declaring migration parity.`,
  '',
  '## Summary',
  '',
  ...summaryLines,
  '',
  '## Per-preset table',
  '',
  'Full-state presets only (String Waves and the archive saves). Play configs counts a synth play config only when it is enabled or has an active step; the raw array is stored even when every config is idle.',
  '',
  ...tableLines,
  '',
  '## Drum engine presets',
  '',
  'Single-engine drum entries with no harmony or sequencer state. Each line counts entries where the feature is yes.',
  '',
  ...drumLines,
  '',
  '## Files scanned',
  '',
  ...fileLines,
  ...warnLines,
  '',
].join('\n');

process.stdout.write(report);
fs.writeFileSync(REPORT_PATH, report);
process.stderr.write(`Wrote ${path.relative(ROOT, REPORT_PATH)}\n`);
