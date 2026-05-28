import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: {
    alias: mode === 'production'
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
      ]
      : [],
  },
  build: {
    target: 'esnext',
    sourcemap: mode !== 'production',
    rollupOptions: {
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
