import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.imeisafehaven.app',
  appName: 'IMEI Safe Haven',
  webDir: 'dist',
  plugins: {
    Camera: {
      androidScaleType: 'CENTER_CROP',
      permissions: true
    }
  },
  android: {
    allowMixedContent: false,
    backgroundColor: "#ffffff",
    captureInput: false,
    buildOptions: {
      keystorePath: undefined,
      keystoreAlias: undefined,
      keystorePassword: undefined,
      keystoreAliasPassword: undefined,
    }
  }
};

export default config;
