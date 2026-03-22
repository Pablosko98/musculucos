import { ExpoConfig } from 'expo/config';

const variant = process.env.APP_VARIANT;
const isDev = variant === 'development';
const isPreview = variant === 'preview';

const appName = isDev ? 'musculucos (dev)' : isPreview ? 'musculucos (preview)' : 'musculucos';
const bundleSuffix = isDev ? '.dev' : isPreview ? '.preview' : '';

const config: ExpoConfig = {
  name: appName,
  slug: 'musculucos',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'musculucos',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  splash: {
    image: './assets/images/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#09090b',
  },
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: true,
    bundleIdentifier: `com.pablosko98.musculucos${bundleSuffix}`,
  },
  android: {
    edgeToEdgeEnabled: true,
    adaptiveIcon: {
      foregroundImage: './assets/images/adaptive-icon.png',
      backgroundColor: '#09090b',
    },
    package: `com.pablosko98.musculucos${bundleSuffix}`,
  },
  web: {
    bundler: 'metro',
    output: 'static',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    'expo-sqlite',
    'expo-notifications',
    [
      '@react-native-google-signin/google-signin',
      {
        iosUrlScheme:
          'com.googleusercontent.apps.245792984579-i4ocu14nv3mvggeqkoifqju1lmgnevfn',
      },
    ],
    'expo-font',
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    router: {},
    eas: {
      projectId: '51b979af-8027-4198-975c-2a3681799a66',
    },
  },
};

export default config;
