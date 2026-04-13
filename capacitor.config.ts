import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.kessho.web',
  appName: 'Kessho Web',
  webDir: 'dist',
  ios: {
    includePlugins: ['@kessho/capacitor-background-audio-spike'],
  },
};

export default config;
