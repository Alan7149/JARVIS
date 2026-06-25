import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.jarvis.app',
  appName: 'JARVIS',
  webDir: 'dist',
  server: {
    // When running natively, point to the live JARVIS backend via Tailscale/LAN.
    // Replace YOUR_TAILSCALE_IP with your machine's Tailscale (or LAN) IP.
    url: 'https://YOUR_TAILSCALE_IP:8000',
    cleartext: true,
    allowNavigation: ['YOUR_TAILSCALE_IP', 'localhost'],
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
