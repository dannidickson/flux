/**
 * Public frontend bundle entry point (see webpack.config.js → `frontend`).
 * Loaded on every rendered page via FluxExtension.
 *
 * Boots the htmx-lite fx- directive runtime so consumers can use
 * fx-get / fx-post / fx-trigger / fx-target / fx-swap on any frontend page.
 */

import { initFxDirectives } from "./FxDirectives";

initFxDirectives();

export { applyFxDirectives, initFxDirectives } from "./FxDirectives";
