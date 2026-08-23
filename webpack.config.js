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
  // inlineEditor: Path.resolve('client/inline-editor'),
  // frontendEditor: Path.resolve('client/frontend-editor'),
};

// TypeScript + shadow-css support, applied to both JS configs.
// client/preview-old is retired reference code and deliberately not included.
function withTypescript(config) {
  config.module.rules.push({
    test: /\.(ts|tsx)$/,
    include: [
      PATHS.core,
      PATHS.channels,
      PATHS.cms,
      // PATHS.inlineEditor,
      // PATHS.frontendEditor,
    ],
    use: [
      {
        loader: 'babel-loader',
      },
      {
        loader: 'ts-loader',
      },
    ],
  });
  config.resolve.extensions.push('.ts', '.tsx');

  // Import *.shadow.css files as raw strings for Shadow DOM adoptedStyleSheets
  config.module.rules.push({
    test: /\.shadow\.css$/,
    type: 'asset/source',
  });

  return config;
}

const config = [
  // Host bundles — run inside the CMS document, where React/ReactDom exist as
  // globals. The default externals map keeps them external.
  withTypescript(
    new JavascriptWebpackConfig('flux', PATHS)
      .setEntry({
        '/channels/host': `${PATHS.channels}/HostChannel.ts`,
        'silverstripe-cms/host': `${PATHS.cms}/host.ts`,
        // 'frontend-editor/host': `${PATHS.frontendEditor}/host.ts`,
      })
      .getConfig()
  ),
  (() => {
    const frameConfig = new JavascriptWebpackConfig('flux-frame', PATHS)
      .setEntry({
        frontend: `${PATHS.core}/index.ts`,
        '/channels/frame': `${PATHS.channels}/FrameChannel.ts`,
        'silverstripe-cms/frame': `${PATHS.cms}/frame.ts`,
      })
      .getConfig();

    delete frameConfig.externals['react'];
    delete frameConfig.externals['react-dom'];
    delete frameConfig.externals['react-dom/client'];

    return withTypescript(frameConfig);
  })(),
  new CssWebpackConfig('css', PATHS)
    .setEntry({
      bundle: `${PATHS.styles}/index.scss`,
      preview: `${PATHS.styles}/preview.scss`,
    })
    .getConfig(),
];

// Use WEBPACK_CHILD=flux, WEBPACK_CHILD=flux-frame or WEBPACK_CHILD=css to run
// a single config
module.exports = process.env.WEBPACK_CHILD
  ? config.find((entry) => entry.name === process.env.WEBPACK_CHILD)
  : config;
