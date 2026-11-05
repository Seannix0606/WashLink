module.exports = function babelConfig(api) {
  api.cache(true)
  return {
    presets: ['babel-preset-expo'],
    plugins: [['module-resolver', { alias: { '@': './src', '@washlink/shared': '../packages/shared/src/index.ts' } }]],
  }
}
