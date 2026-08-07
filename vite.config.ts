import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const captureEnabled = process.env.VITE_KESSHO_ENABLE_GRAPH_CAPTURE === 'true';

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    {
      name: 'point-clouds-shared-bridge-asset',
      apply: 'build' as const,
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'point-clouds/shared/kessho-site-bridge.js',
          source: readFileSync(
            fileURLToPath(new URL('./point-clouds/shared/kessho-site-bridge.js', import.meta.url)),
            'utf8',
          ),
        });
        for (const fileName of [
          'point-clouds/shared/embedded/kessho-engine.html',
          'point-clouds/shared/embedded/kessho-engine.iife.js',
          'point-clouds/shared/embedded/kessho-product-core-assets.js',
        ]) {
          const sourcePath = fileURLToPath(new URL(`./${fileName}`, import.meta.url));
          if (!existsSync(sourcePath)) continue;
          this.emitFile({
            type: 'asset',
            fileName,
            source: readFileSync(sourcePath),
          });
        }
      },
    },
  ],
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  ...(process.env.KESSHO_VITE_DISABLE_HMR === '1' || process.env.KESSHO_SEQUENCER_UI_PROOF_DISABLE_HMR === '1'
    ? { server: { hmr: false } }
    : {}),
  ...(process.env.KESSHO_VITE_CACHE_DIR
    ? { cacheDir: process.env.KESSHO_VITE_CACHE_DIR }
    : {}),
  resolve: {
    alias: mode === 'production' && !captureEnabled
      ? [
        {
          find: /^\.\/audio\/referenceAudioRuntime$/,
          replacement: fileURLToPath(new URL('./src/audio/referenceAudioRuntime.unavailable.ts', import.meta.url)),
        },
        {
          find: /^\.\/referenceAudioRuntime$/,
          replacement: fileURLToPath(new URL('./src/audio/referenceAudioRuntime.unavailable.ts', import.meta.url)),
        },
        {
          find: /^\.\.\/referenceAudioRuntime$/,
          replacement: fileURLToPath(new URL('./src/audio/referenceAudioRuntime.unavailable.ts', import.meta.url)),
        },
        {
          find: /^\.\.\/\.\.\/audio\/referenceAudioRuntime$/,
          replacement: fileURLToPath(new URL('./src/audio/referenceAudioRuntime.unavailable.ts', import.meta.url)),
        },
      ]
      : [],
  },
  build: {
    target: 'esnext',
    modulePreload: { polyfill: false },
    sourcemap: mode !== 'production',
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        pointClouds: fileURLToPath(new URL('./point-clouds/index.html', import.meta.url)),
        ...(existsSync(fileURLToPath(new URL('./point-clouds/alternative-a/index.html', import.meta.url)))
          ? { pointCloudsAlternativeA: fileURLToPath(new URL('./point-clouds/alternative-a/index.html', import.meta.url)) }
          : {}),
        ...(existsSync(fileURLToPath(new URL('./point-clouds/alternative-b/index.html', import.meta.url)))
          ? { pointCloudsAlternativeB: fileURLToPath(new URL('./point-clouds/alternative-b/index.html', import.meta.url)) }
          : {}),
      },
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react')) return 'react-vendor';
          if (id.includes('@supabase')) return 'supabase';
          if (id.includes('jszip')) return 'jszip';
          if (id.includes('/src/ui/state.ts')) return 'ui-state';
          if (id.includes('/src/audio/worklets/')) return 'audio-worklets';
          if (id.includes('/src/audio/drumPresets.ts')) return 'audio-drum-presets';
          if (id.includes('/src/audio/padPresets.ts')) return 'audio-pad-presets';
          if (id.includes('/src/audio/waterPresets.ts')) return 'audio-water-presets';
          if (id.includes('/src/audio/reference/webTs/engine.ts')) return 'reference-web-ts-engine';
          return undefined;
        },
      },
    },
  },
  optimizeDeps: {
    entries: ['index.html', 'public/kessho-core-smoke.html'],
  },
  worker: {
    format: 'es',
  },
}));
