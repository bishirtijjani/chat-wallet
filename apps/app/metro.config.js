// Metro config tuned for the npm-workspaces monorepo: watch the repo root so
// changes in packages/shared are picked up, and resolve modules from both the
// app's and the root's node_modules.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = true;

// Expo modules are registered by class; the production minifier must not mangle
// class/function names or `registerWebModule` rejects them ("Module
// implementation must be a class") in the web export.
config.transformer.minifierConfig = {
  ...(config.transformer.minifierConfig ?? {}),
  keep_classnames: true,
  keep_fnames: true,
  mangle: { keep_classnames: true, keep_fnames: true },
};

module.exports = config;
