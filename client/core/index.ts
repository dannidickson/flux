/**
 * Public frontend bundle entry point (webpack `frontend`), loaded on every rendered page.
 * Boots the fx- directive runtime.
 */

import { initFxDirectives } from "./FxDirectives";

initFxDirectives();

export { applyFxDirectives, initFxDirectives } from "./FxDirectives";
