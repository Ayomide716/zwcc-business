module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { reanimated: false }]],
    // react-native-worklets/plugin replaces the old react-native-reanimated/plugin
    // as of Reanimated 4. It must stay last in the plugin list.
    plugins: ['react-native-worklets/plugin'],
  };
};
