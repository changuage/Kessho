import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

function prunePublicArchivePlugin(): Plugin {
  return {
    name: 'kessho-prune-public-archive',
    closeBundle() {
      rmSync(resolve('dist/ARCHIVE'), { recursive: true, force: true });
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), prunePublicArchivePlugin()],
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
          if (id.includes('/src/audio/engine.ts')) return 'audio-engine';
          return undefined;
        },
      },
    },
  },
  worker: {
    format: 'es',
  },
}));
