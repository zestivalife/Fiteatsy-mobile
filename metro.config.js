const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);
const { transformer, resolver } = config;

const escapePathForRegex = (value) => value.replace(/[|\\{}()[\]^$+*?.-]/g, '\\$&');
const blockWorkspaceFolder = (folderName) =>
  `${escapePathForRegex(path.join(__dirname, folderName))}\\/.*`;

config.transformer = {
  ...transformer,
  babelTransformerPath: require.resolve('react-native-svg-transformer/expo')
};

config.resolver = {
  ...resolver,
  blockList: new RegExp([
    blockWorkspaceFolder('backend'),
    blockWorkspaceFolder('docs'),
    blockWorkspaceFolder('dist'),
    blockWorkspaceFolder('fixtures'),
    blockWorkspaceFolder('tmp')
  ].join('|')),
  assetExts: resolver.assetExts.filter((ext) => ext !== 'svg'),
  sourceExts: [...resolver.sourceExts, 'svg']
};

module.exports = config;
