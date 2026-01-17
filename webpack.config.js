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
  bind: Path.resolve('client/bind'),
};

const config = [
  // main JS bundle
  (() => {
    const frontendConfig = new JavascriptWebpackConfig('flux', PATHS)
      .setEntry({
        frontend: `${PATHS.core}/index.ts`,
        '/bind/host': `${PATHS.bind}/HostChannel.ts`,
        '/bind/frame': `${PATHS.bind}/FrameChannel.ts`,
        'silverstripe-cms/host': `${PATHS.cms}/host.ts`,
        'silverstripe-cms/frame': `${PATHS.cms}/frame.ts`,
      })
      .getConfig();
    // Add TypeScript support
    frontendConfig.module.rules.push({
      test: /\.(ts|tsx)$/,
      include: [PATHS.core, PATHS.bind, PATHS.cms],
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

    return frontendConfig;
  })(),
  new CssWebpackConfig('css', PATHS)
    .setEntry({
      bundle: `${PATHS.styles}/index.scss`,
    })
    .getConfig(),
];

// Use WEBPACK_CHILD=js or WEBPACK_CHILD=css env var to run a single config
module.exports = process.env.WEBPACK_CHILD
  ? config.find((entry) => entry.name === process.env.WEBPACK_CHILD)
  : config;
