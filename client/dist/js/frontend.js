/******/ (function() { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ "./client/core/FxDirectives.ts":
/*!*************************************!*\
  !*** ./client/core/FxDirectives.ts ***!
  \*************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {



/**
 * htmx-lite directive runtime: fx-get, fx-post, fx-trigger, fx-target, fx-swap.
 *
 * Scope is deliberately small — no SSE, no out-of-band swaps, no extended
 * trigger syntax. A point of unification rather than a feature surface.
 *
 *   <button fx-get="/partial" fx-target="#out" fx-swap="innerHTML">Reload</button>
 *
 * Default trigger:
 *   - <a>, <button>          → click
 *   - <input>, <select>      → change
 *   - <form>                 → submit
 *   - anything else          → load (fires once on init)
 */
Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports.applyFxDirectives = applyFxDirectives;
exports.initFxDirectives = initFxDirectives;
const logger_1 = __webpack_require__(/*! ./logger */ "./client/core/logger.ts");
const READY_ATTR = "fx-directive-ready";
function defaultTrigger(el) {
  const tag = el.tagName;
  if (tag === "A" || tag === "BUTTON") return "click";
  if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return "change";
  if (tag === "FORM") return "submit";
  return "load";
}
function parseSwap(value) {
  const allowed = ["innerHTML", "outerHTML", "beforebegin", "afterbegin", "beforeend", "afterend"];
  if (value && allowed.includes(value)) {
    return value;
  }
  return "innerHTML";
}
function resolveTarget(el, targetSelector) {
  if (!targetSelector || targetSelector === "this") return el;
  return document.querySelector(targetSelector);
}
function performSwap(target, html, strategy) {
  if (strategy === "innerHTML") {
    target.innerHTML = html;
    return;
  }
  if (strategy === "outerHTML") {
    target.outerHTML = html;
    return;
  }
  target.insertAdjacentHTML(strategy, html);
}
async function fire(el, method, url) {
  const target = resolveTarget(el, el.getAttribute("fx-target"));
  if (!target) {
    logger_1.logger.warn(`fx-${method.toLowerCase()}: target not found for`, el);
    return;
  }
  const swap = parseSwap(el.getAttribute("fx-swap"));
  let body;
  if (method === "POST" && el.tagName === "FORM") {
    body = new FormData(el);
  }
  try {
    const response = await fetch(url, {
      method,
      credentials: "same-origin",
      body
    });
    if (!response.ok) {
      logger_1.logger.warn(`fx-${method.toLowerCase()} ${url} → ${response.status}`);
      return;
    }
    performSwap(target, await response.text(), swap);
  } catch (error) {
    logger_1.logger.warn(`fx-${method.toLowerCase()} ${url} failed:`, error);
  }
}
function bind(el) {
  if (el.hasAttribute(READY_ATTR)) return;
  const getUrl = el.getAttribute("fx-get");
  const postUrl = el.getAttribute("fx-post");
  if (!getUrl && !postUrl) return;
  el.setAttribute(READY_ATTR, "1");
  const method = getUrl ? "GET" : "POST";
  const url = getUrl ?? postUrl;
  const trigger = el.getAttribute("fx-trigger") || defaultTrigger(el);
  if (trigger === "load") {
    void fire(el, method, url);
    return;
  }
  el.addEventListener(trigger, event => {
    if (trigger === "submit" || trigger === "click") {
      event.preventDefault();
    }
    void fire(el, method, url);
  });
}
function applyFxDirectives(root = document) {
  root.querySelectorAll("[fx-get], [fx-post]").forEach(bind);
}
function initFxDirectives() {
  const run = () => applyFxDirectives();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, {
      once: true
    });
    return;
  }
  run();
}

/***/ }),

/***/ "./client/core/logger.ts":
/*!*******************************!*\
  !*** ./client/core/logger.ts ***!
  \*******************************/
/***/ (function(__unused_webpack_module, exports) {



// Logger only outputs in development.
Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports.logger = void 0;
const isDev = "development" === 'development';
const noop = () => {};
function bind(method) {
  return isDev ? console[method].bind(console) : noop;
}
exports.logger = {
  log: bind('log'),
  warn: bind('warn'),
  error: bind('error'),
  table: bind('table'),
  time: bind('time'),
  timeEnd: bind('timeEnd'),
  timeLog: bind('timeLog')
};

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry needs to be wrapped in an IIFE because it needs to be isolated against other modules in the chunk.
!function() {
var exports = __webpack_exports__;
/*!******************************!*\
  !*** ./client/core/index.ts ***!
  \******************************/


/**
 * Public frontend bundle entry point (see webpack.config.js → `frontend`).
 * Loaded on every rendered page via FluxExtension.
 *
 * Boots the htmx-lite fx- directive runtime so consumers can use
 * fx-get / fx-post / fx-trigger / fx-target / fx-swap on any frontend page.
 */
Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports.initFxDirectives = exports.applyFxDirectives = void 0;
const FxDirectives_1 = __webpack_require__(/*! ./FxDirectives */ "./client/core/FxDirectives.ts");
(0, FxDirectives_1.initFxDirectives)();
var FxDirectives_2 = __webpack_require__(/*! ./FxDirectives */ "./client/core/FxDirectives.ts");
Object.defineProperty(exports, "applyFxDirectives", ({
  enumerable: true,
  get: function () {
    return FxDirectives_2.applyFxDirectives;
  }
}));
Object.defineProperty(exports, "initFxDirectives", ({
  enumerable: true,
  get: function () {
    return FxDirectives_2.initFxDirectives;
  }
}));
}();
/******/ })()
;
//# sourceMappingURL=frontend.js.map