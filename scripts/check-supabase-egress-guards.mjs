#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const SOURCE_DIR = path.join(ROOT, 'src');
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.mts']);
const FORBIDDEN_PATTERNS = [
  {
    name: "Supabase select('*')",
    pattern: /\.select\(\s*(['"])\*\1/g,
  },
  {
    name: 'bare Supabase select()',
    pattern: /\.select\(\s*\)/g,
  },
];

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    if (!entry.isFile() || !EXTENSIONS.has(path.extname(entry.name))) return [];
    return [fullPath];
  });
}

function lineNumberForIndex(text, index) {
  return text.slice(0, index).split(/\r?\n/).length;
}

function isSupabaseLikeSource(text) {
  return /(?:^|[^\w$])\.from\(\s*['"`]/.test(text) || text.includes('@supabase/supabase-js');
}

const failures = [];
for (const filePath of walk(SOURCE_DIR)) {
  const text = fs.readFileSync(filePath, 'utf8');
  if (!isSupabaseLikeSource(text)) continue;

  for (const forbidden of FORBIDDEN_PATTERNS) {
    forbidden.pattern.lastIndex = 0;
    for (let match = forbidden.pattern.exec(text); match; match = forbidden.pattern.exec(text)) {
      failures.push({
        filePath,
        line: lineNumberForIndex(text, match.index),
        name: forbidden.name,
      });
    }
  }
}

if (failures.length > 0) {
  console.error('Supabase egress guard failed. Use explicit summary/detail column selects.');
  for (const failure of failures) {
    console.error(`- ${path.relative(ROOT, failure.filePath)}:${failure.line} ${failure.name}`);
  }
  process.exit(1);
}

console.log('Supabase egress guard passed.');
