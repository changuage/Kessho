import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'esnext',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react')) return 'react-vendor';
          if (id.includes('@supabase')) return 'supabase';
          if (id.includes('jszip')) return 'jszip';
          if (id.includes('/src/audio/engine.ts') || id.includes('/src/audio/worklets/')) return 'audio-core';
          if (id.includes('/src/ui/state.ts')) return 'ui-state';
          return undefined;
        },
      },
    },
  },
  worker: {
    format: 'es',
  },
});
