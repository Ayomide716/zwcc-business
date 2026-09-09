// Expo's default Metro configuration. It already resolves the `@/*` path alias
// from tsconfig.json, so no custom resolver is needed here.
const { getDefaultConfig } = require('expo/metro-config');

module.exports = getDefaultConfig(__dirname);
