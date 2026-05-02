#!/usr/bin/env node
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const args = new Set(process.argv.slice(2));
const write = args.has('--write');

const tempDir = await mkdtemp(path.join(tmpdir(), 'preset-child-graph-repair-'));
const outfile = path.join(tempDir, 'preset-child-graph-repair.mjs');

try {
  await build({
    stdin: {
      contents: `
        import { createClient } from '@supabase/supabase-js';
        import fs from 'node:fs';
        import path from 'node:path';
        import process from 'node:process';
        import { repairPresetChildGraphsV2ForClient } from './src/presets/presetV2Migration.ts';

        function readEnvFile(filePath) {
          if (!fs.existsSync(filePath)) return {};
          return Object.fromEntries(
            fs.readFileSync(filePath, 'utf8')
              .split(/\\r?\\n/)
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

        const env = {
          ...readEnvFile(path.join(process.cwd(), '.env')),
          ...readEnvFile(path.join(process.cwd(), '.env.local')),
          ...process.env,
        };

        if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) {
          throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.');
        }

        const write = ${JSON.stringify(write)};
        const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
          auth: { persistSession: false },
        });

        const report = await repairPresetChildGraphsV2ForClient(client, {
          dryRun: !write,
          confirm: write ? 'MIGRATE_PRESETS_V2' : undefined,
        });

        console.log(JSON.stringify(report, null, 2));
        if (report.errors.length > 0) process.exit(1);
      `,
      resolveDir: process.cwd(),
      loader: 'ts',
    },
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    sourcemap: 'inline',
    logLevel: 'silent',
  });

  await import(pathToFileURL(outfile).href);
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
