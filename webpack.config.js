const Path = require('path');
const {
  JavascriptWebpackConfig,
  CssWebpackConfig,
} = require('@silverstripe/webpack-config');

const PATHS = {
  ROOT: Path.resolve(),
  styles: Path.resolve('client/styles'),
  cms: Path.resolve('client/cms-live-updates'),
  core: Path.resolve('client/core'),
  channels: Path.resolve('client/channels'),
  lux: Path.resolve('client/lux'),
  preview: Path.resolve('client/preview'),
};

const config = [
  // main JS bundle
  (() => {
    const frontendConfig = new JavascriptWebpackConfig('flux', PATHS)
      .setEntry({
        frontend: `${PATHS.core}/index.ts`,
        '/channels/host': `${PATHS.channels}/HostChannel.ts`,
        '/channels/frame': `${PATHS.channels}/FrameChannel.ts`,
        'silverstripe-cms/host': `${PATHS.cms}/host.ts`,
        'silverstripe-cms/frame': `${PATHS.cms}/frame.ts`,
      })
      .getConfig();
    // Add TypeScript support
    frontendConfig.module.rules.push({
      test: /\.(ts|tsx)$/,
      include: [PATHS.core, PATHS.channels, PATHS.cms, PATHS.lux, PATHS.preview],
      use: [
        {
          loader: 'babel-loader',
        },
        {
          loader: 'ts-loader',
        },
      ],
    });

    // Add TypeScript extensions to resolve
    frontendConfig.resolve.extensions.push('.ts', '.tsx');

    // Import *.shadow.css files as raw strings for Shadow DOM adoptedStyleSheets
    frontendConfig.module.rules.push({
      test: /\.shadow\.css$/,
      type: 'asset/source',
    });

    return frontendConfig;
  })(),
  new CssWebpackConfig('css', PATHS)
    .setEntry({
      bundle: `${PATHS.styles}/index.scss`,
      preview: `${PATHS.styles}/preview.scss`,
    })
    .getConfig(),
];

// Use WEBPACK_CHILD=js or WEBPACK_CHILD=css env var to run a single config
module.exports = process.env.WEBPACK_CHILD
  ? config.find((entry) => entry.name === process.env.WEBPACK_CHILD)
  : config;
