const path = require('node:path')
const { getDefaultConfig } = require('expo/metro-config')

const projectRoot = __dirname
const sharedPackage = path.resolve(projectRoot, '../packages/shared/src')
const config = getDefaultConfig(projectRoot)

// The shared package lives outside this app and has no dependencies of its own.
config.watchFolders = [sharedPackage]
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')]
config.resolver.extraNodeModules = { '@washlink/shared': sharedPackage }

module.exports = config
