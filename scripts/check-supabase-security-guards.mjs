#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const MIGRATIONS_DIR = path.join(ROOT, 'supabase', 'migrations');
const HARDENING_MIGRATION = '20260608003000_harden_preset_shared_permissions.sql';

const FORBIDDEN_PATTERNS = [
  {
    name: 'broad function execute grant to public API roles',
    pattern: /GRANT\s+EXECUTE\s+ON\s+ALL\s+FUNCTIONS\s+IN\s+SCHEMA\s+public\s+TO\s+(?:PUBLIC|anon|authenticated)\b/gi,
  },
  {
    name: 'direct V2 table write grant to public API roles',
    pattern: /GRANT\s+(?:INSERT|UPDATE|DELETE|ALL)(?:\s*,\s*(?:INSERT|UPDATE|DELETE))*\s+ON(?:\s+TABLE)?\s+public\.(?:presets_v2|preset_versions_v2|preset_version_refs_v2|preset_payloads_v2)\s+TO\s+(?:anon|authenticated)\b/gi,
  },
];

const REQUIRED_HARDENING_SNIPPETS = [
  'REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC',
  'REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated',
  'DROP POLICY IF EXISTS "presets_v2_insert_shared_or_own" ON public.presets_v2',
  'DROP POLICY IF EXISTS "preset_payloads_v2_insert_testing" ON public.preset_payloads_v2',
  'REVOKE INSERT, UPDATE, DELETE ON TABLE public.presets_v2 FROM anon, authenticated',
  'GRANT EXECUTE ON FUNCTION public.kessho_save_preset_v2(JSONB, JSONB, JSONB, JSONB) TO authenticated',
];

function walkSqlFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walkSqlFiles(fullPath);
    return entry.isFile() && entry.name.endsWith('.sql') ? [fullPath] : [];
  });
}

function lineNumberForIndex(text, index) {
  return text.slice(0, index).split(/\r?\n/).length;
}

const failures = [];

for (const filePath of walkSqlFiles(MIGRATIONS_DIR)) {
  const text = fs.readFileSync(filePath, 'utf8');
  for (const forbidden of FORBIDDEN_PATTERNS) {
    forbidden.pattern.lastIndex = 0;
    for (let match = forbidden.pattern.exec(text); match; match = forbidden.pattern.exec(text)) {
      failures.push(`${path.relative(ROOT, filePath)}:${lineNumberForIndex(text, match.index)} ${forbidden.name}`);
    }
  }
}

const hardeningPath = path.join(MIGRATIONS_DIR, HARDENING_MIGRATION);
if (!fs.existsSync(hardeningPath)) {
  failures.push(`Missing required hardening migration: ${path.relative(ROOT, hardeningPath)}`);
} else {
  const hardeningText = fs.readFileSync(hardeningPath, 'utf8');
  for (const snippet of REQUIRED_HARDENING_SNIPPETS) {
    if (!hardeningText.includes(snippet)) {
      failures.push(`${path.relative(ROOT, hardeningPath)} missing required snippet: ${snippet}`);
    }
  }
}

if (failures.length > 0) {
  console.error('Supabase security guard failed.');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Supabase security guard passed.');
