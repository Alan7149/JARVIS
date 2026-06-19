import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.jarvis.app',
  appName: 'JARVIS',
  webDir: 'dist',
  server: {
    // When running natively, point to the live JARVIS backend via Tailscale
    // This means the app always has fresh data without bundling the frontend
    url: 'https://100.88.129.47:8000',
    cleartext: true,
    allowNavigation: ['100.88.129.47', 'localhost'],
  },
  ios: {
    contentInset: 'automatic',
    allowsLinkPreview: false,
    scrollEnabled: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#020b18',
      showSpinner: false,
    },
  },
};

export default config;
