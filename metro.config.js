const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

const nativeWindConfig = withNativeWind(config, { input: './global.css' });

// Expo defaults to resolverMainFields where `react-native` wins over `main`.
// react-native-reanimated exposes TS under `react-native` and compiled JS under `main`;
// bundling `src/` breaks resolution of `./platformFunctions` from `src/index.ts`.
nativeWindConfig.resolver = {
  ...nativeWindConfig.resolver,
  resolverMainFields: ['browser', 'main', 'module', 'react-native'],
};

module.exports = nativeWindConfig;
