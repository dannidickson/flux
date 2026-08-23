/******/ (function() { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

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
/*!*****************************************!*\
  !*** ./client/channels/FrameChannel.ts ***!
  \*****************************************/


Object.defineProperty(exports, "__esModule", ({
  value: true
}));
const logger_1 = __webpack_require__(/*! ../core/logger */ "./client/core/logger.ts");
/**
 * Establish port-based messaging channel with the parent frame.
 * Message handler can be passed to constructor or set via onReceivedMessage property.
 *
 * @example client/cms-live-updates/frame.ts
 */
class FrameChannel {
  constructor(onReceivedMessage) {
    this.channel = null;
    this.messageHandler = event => this.setupMessageEvents(event);
    window.addEventListener("message", this.messageHandler);
    this.onReceivedMessage = onReceivedMessage || this.defaultMessageHandler.bind(this);
    if (window.parent !== window) {
      logger_1.logger.log("[channel] frame posting FRAME_READY →", window.location.href);
      window.parent.postMessage({
        type: 'FRAME_READY'
      }, window.location.origin);
    } else {
      console.warn("[channel] frame has no parent — not in an iframe, FRAME_READY not sent");
    }
  }
  setupMessageEvents(event) {
    if (event.origin !== window.location.origin) {
      logger_1.logger.error("Origin mismatch:", event.origin, "vs", window.location.origin);
      return;
    }
    if (event.data.action === "Host:Create") {
      logger_1.logger.log("[channel] frame received Host:Create — port connected");
      if (!event.ports || event.ports.length === 0) {
        console.warn("[channel] Host:Create arrived with NO ports — channel dead");
        return;
      }
      this.channel = event.ports[0];
      this.channel.onmessage = event => {
        logger_1.logger.log("[channel] frame port message:", event.data?.type);
        this.onReceivedMessage(event);
      };
      this.channel.start();
    }
  }
  /**
   * Fallback used when no custom `onReceivedMessage` handler was supplied.
   *
   * @param event
   */
  defaultMessageHandler(event) {
    logger_1.logger.log('Message called doing nothing', event);
  }
}
exports["default"] = FrameChannel;
}();
/******/ })()
;
//# sourceMappingURL=frame.js.map