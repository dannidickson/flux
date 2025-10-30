/******/ (function() { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ "./client/core/logger.ts":
/*!*******************************!*\
  !*** ./client/core/logger.ts ***!
  \*******************************/
/***/ (function(__unused_webpack_module, exports) {



Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports.logger = void 0;
class Logger {
  constructor(env) {
    this.env = env;
  }
  log(...args) {
    if (this.env === 'development') {
      console.log(...args);
    }
  }
  warn(...args) {
    if (this.env === 'development') {
      console.warn(...args);
    }
  }
  error(...args) {
    if (this.env === 'development') {
      console.error(...args);
    }
  }
}
exports["default"] = Logger;
exports.logger = new Logger("development");

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
/*!*************************************!*\
  !*** ./client/bind/FrameChannel.ts ***!
  \*************************************/


Object.defineProperty(exports, "__esModule", ({
  value: true
}));
const logger_1 = __webpack_require__(/*! ../core/logger */ "./client/core/logger.ts");
/**
 * FrameChannel can implement the onRecievedMessage either in the constructor, or via frame.onRecievedMessage

 * @example client/cms-live-updates/frame.ts
 */
class FrameChannel {
  constructor(onRecievedMessage) {
    this.channel = null;
    this.messageHandler = event => this.setupMessageEvents(event);
    window.addEventListener("message", this.messageHandler);
    // Set the default handler or use the one passed in
    this.onRecievedMessage = onRecievedMessage || this.defaultMessageHandler.bind(this);
  }
  setupMessageEvents(event) {
    if (event.origin !== window.location.origin) {
      logger_1.logger.error("Origin mismatch:", event.origin, "vs", window.location.origin);
      return;
    }
    if (event.data.action === "Host:Create") {
      logger_1.logger.log("Channel connected");
      if (!event.ports || event.ports.length === 0) {
        logger_1.logger.error("No ports received!");
        return;
      }
      this.channel = event.ports[0];
      this.channel.onmessage = event => this.onRecievedMessage(event);
      this.channel.start();
      // remove the original message listener
      window.removeEventListener("message", this.messageHandler);
    }
  }
  /**
   * Fallback if the FrameChannel implementation doesnt include custom `onRecievedMessage` handler
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