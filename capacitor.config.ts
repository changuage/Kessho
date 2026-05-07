import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.kessho.capacitor',
  appName: 'Kessho Capacitor',
  webDir: 'dist',
  ios: {
    includePlugins: [
      '@kessho/capacitor-audio-session',
      '@kessho/capacitor-midi-routing',
    ],
  },
};

export default config;
