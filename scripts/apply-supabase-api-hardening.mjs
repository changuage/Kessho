#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import pg from 'pg';

const { Client } = pg;
const ROOT = process.cwd();
const SQL_FILES = [
  'supabase/migrations/20260612000000_preset_detail_read_rpc.sql',
  'supabase/migrations/20260612001000_revoke_safe_preset_summary_views.sql',
  'supabase/migrations/20260612001500_preset_runtime_read_rpcs.sql',
  'supabase/pending/20260612002000_revoke_preset_base_table_select.sql',
];
const SCHEMA_CACHE_RETRY = { retries: 5, retryDelayMs: 3000 };
const VERIFY_COMMANDS = [
  { command: 'node', args: ['scripts/audit-supabase-api-surface.mjs', '--require-detail-rpcs'], ...SCHEMA_CACHE_RETRY },
  { command: 'node', args: ['scripts/audit-supabase-api-surface.mjs', '--require-runtime-rpcs'], ...SCHEMA_CACHE_RETRY },
  { command: 'node', args: ['scripts/audit-supabase-api-surface.mjs', '--require-summary-views'], ...SCHEMA_CACHE_RETRY },
  { command: 'node', args: ['scripts/audit-supabase-api-surface.mjs', '--fail-open-base-tables'], ...SCHEMA_CACHE_RETRY },
  { command: 'node', args: ['scripts/check-supabase-revoke-readiness.mjs', '--fail-runtime-base-tables'] },
  { command: 'node', args: ['scripts/check-supabase-revoke-readiness.mjs', '--fail-browser-maintenance-base-tables'] },
  { command: 'npm', args: ['run', 'audit:supabase-egress:runtime:detail:strict'] },
];

function parseArgs(argv) {
  const args = {
    write: false,
    confirm: '',
    skipVerify: false,
  };
  for (const arg of argv) {
    if (arg === '--write') args.write = true;
    else if (arg.startsWith('--confirm=')) args.confirm = arg.slice('--confirm='.length);
    else if (arg === '--skip-verify') args.skipVerify = true;
    else if (arg === '--help' || arg === '-h') {
      console.log([
        'Usage: node scripts/apply-supabase-api-hardening.mjs [options]',
        '',
        'Dry-runs by default. With --write, applies the prepared preset API hardening SQL files',
        'to SUPABASE_DB_URL in order, then runs strict verification commands.',
        '',
        'Options:',
        '  --write                                      Execute SQL against SUPABASE_DB_URL.',
        '  --confirm=APPLY_SUPABASE_API_HARDENING       Required with --write.',
        '  --skip-verify                                Do not run post-apply verification commands.',
      ].join('\n'));
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function readEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  return Object.fromEntries(
    readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const index = line.indexOf('=');
        const key = line.slice(0, index);
        let value = line.slice(index + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"'))
          || (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        return [key, value];
      }),
  );
}

function getEnv() {
  return {
    ...readEnvFile(resolve(ROOT, '.env')),
    ...readEnvFile(resolve(ROOT, '.env.local')),
    ...process.env,
  };
}

function formatCommand({ command, args }) {
  return [command, ...args].join(' ');
}

function wait(ms) {
  return new Promise((resolveWait) => {
    setTimeout(resolveWait, ms);
  });
}

function spawnCommand(command, args) {
  return new Promise((resolveCommand, rejectCommand) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      stdio: 'inherit',
      env: process.env,
    });
    child.on('error', rejectCommand);
    child.on('exit', (code) => {
      if (code === 0) resolveCommand();
      else rejectCommand(new Error(`${command} ${args.join(' ')} exited with ${code}`));
    });
  });
}

async function runCommand(commandSpec) {
  const retries = commandSpec.retries ?? 0;
  const retryDelayMs = commandSpec.retryDelayMs ?? 0;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      await spawnCommand(commandSpec.command, commandSpec.args);
      return;
    } catch (error) {
      if (attempt >= retries) throw error;
      console.warn(
        `${formatCommand(commandSpec)} failed (${error.message}); retrying in ${retryDelayMs} ms.`,
      );
      await wait(retryDelayMs);
    }
  }
}

const args = parseArgs(process.argv.slice(2));
const missingFiles = SQL_FILES.filter((relativePath) => !existsSync(resolve(ROOT, relativePath)));
if (missingFiles.length > 0) {
  throw new Error(`Missing SQL files:\n${missingFiles.map((file) => `- ${file}`).join('\n')}`);
}

if (!args.write) {
  console.log('Supabase API hardening dry run');
  console.log('- SQL files to apply:');
  for (const file of SQL_FILES) console.log(`  ${file}`);
  console.log('- Verification commands:');
  for (const commandSpec of VERIFY_COMMANDS) {
    const retryText = commandSpec.retries
      ? ` (retries: ${commandSpec.retries}, delay: ${commandSpec.retryDelayMs} ms)`
      : '';
    console.log(`  ${formatCommand(commandSpec)}${retryText}`);
  }
  console.log('Run with --write --confirm=APPLY_SUPABASE_API_HARDENING after confirming the public access model and SUPABASE_DB_URL.');
  process.exit(0);
}

if (args.confirm !== 'APPLY_SUPABASE_API_HARDENING') {
  throw new Error('Refusing to write. Pass --confirm=APPLY_SUPABASE_API_HARDENING with --write.');
}

const env = getEnv();
if (!env.SUPABASE_DB_URL) {
  throw new Error('Missing SUPABASE_DB_URL.');
}

const client = new Client({ connectionString: env.SUPABASE_DB_URL });
await client.connect();
try {
  for (const relativePath of SQL_FILES) {
    const filePath = resolve(ROOT, relativePath);
    console.log(`Applying ${relativePath}`);
    await client.query(readFileSync(filePath, 'utf8'));
  }
} finally {
  await client.end();
}

if (!args.skipVerify) {
  for (const commandSpec of VERIFY_COMMANDS) {
    await runCommand(commandSpec);
  }
}

console.log('Supabase API hardening apply complete.');
