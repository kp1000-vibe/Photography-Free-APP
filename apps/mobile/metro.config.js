// Lets Metro resolve the shared `@lumen/core` package from ../../packages/core.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const corePath = path.resolve(projectRoot, '../../packages/core');

const config = getDefaultConfig(projectRoot);
config.watchFolders = [...(config.watchFolders ?? []), corePath];
config.resolver.extraNodeModules = { ...(config.resolver.extraNodeModules ?? {}), '@lumen/core': corePath };
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];

module.exports = config;
