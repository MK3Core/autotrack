/// <reference types="@capawesome/capacitor-android-edge-to-edge-support" />

import type { CapacitorConfig } from '@capacitor/cli';

// Android draws its status bar and navigation bar transparent by default on
// recent SDKs (edge-to-edge is enforced from API 35+, and our targetSdk is
// 36), which otherwise leaves the OS's own default grey showing through
// behind them instead of the app's actual dark theme. The EdgeToEdge plugin
// restores the traditional (non-overlapping) webview layout while properly
// coloring both bars to match; see src/main.tsx for the matching icon-style
// call (white icons for a dark bar).
const config: CapacitorConfig = {
  appId: 'com.autotrack.app',
  appName: 'AutoTrack',
  webDir: 'dist',
  plugins: {
    SystemBars: {
      insetsHandling: 'disable',
    },
    EdgeToEdge: {
      backgroundColor: '#171a21',
      statusBarColor: '#171a21',
      navigationBarColor: '#171a21',
    },
  },
};

export default config;
