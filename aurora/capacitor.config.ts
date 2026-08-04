import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Capacitor config for Aurora Messenger.
 *
 * The app loads the web UI from the VPS via WebView.
 * Override with AURORA_SERVER_URL before `npx cap sync`.
 */
const SERVER_URL = process.env.AURORA_SERVER_URL || 'https://aurro.ru'

const config: CapacitorConfig = {
  appId: 'com.aurora.messenger',
  appName: 'Aurora',
  webDir: 'out',
  server: {
    url: SERVER_URL,
    androidScheme: 'https',
    cleartext: false,
    allowNavigation: ['*'],
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#0b0b1a',
  },
  ios: {
    scheme: 'Aurora',
    backgroundColor: '#0b0b1a',
    contentInset: 'always',
    preferredContentMode: 'mobile',
    limitsNavigationsToAppBoundDomains: true,
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#0b0b1a',
      androidScaleType: 'CENTER_CROP',
      showSpinner: true,
      spinnerColor: '#3390ec',
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0b0b1a',
    },
  },
}

export default config
