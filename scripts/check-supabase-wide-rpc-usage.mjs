#!/usr/bin/env node
import fs from 'node:fs';

const files = [
  'src/cloud/supabase.ts',
  'src/presets/SupabasePresetStore.ts',
  'src/presets/HybridPresetStore.ts',
];

const forbidden = [
  ".select('*')",
  '.select()',
  'kessho_lookup_preset_rows_v2',
];

const allowedComments = [
  'ALLOW_WIDE_LOOKUP_FOR_EXPORT',
  'ALLOW_WIDE_LOOKUP_FOR_ADMIN_DEBUG',
  'ALLOW_CONSTRAINED_RUNTIME_LOOKUP',
];

const failures = [];
for (const file of files) {
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  for (const token of forbidden) {
    let index = text.indexOf(token);
    while (index >= 0) {
      const nearby = text.slice(Math.max(0, index - 200), index + 200);
      if (!allowedComments.some(comment => nearby.includes(comment))) {
        failures.push(`${file}: forbidden hot-path token ${token}`);
      }
      index = text.indexOf(token, index + token.length);
    }
  }
}

if (failures.length) {
  console.error('Wide Supabase usage guard failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Wide Supabase usage guard passed.');
