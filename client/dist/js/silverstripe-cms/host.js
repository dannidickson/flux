/******/ (function() { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ "./client/bind/HostChannel.ts":
/*!************************************!*\
  !*** ./client/bind/HostChannel.ts ***!
  \************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {



Object.defineProperty(exports, "__esModule", ({
  value: true
}));
const logger_1 = __webpack_require__(/*! ../core/logger */ "./client/core/logger.ts");
class HostChannel {
  constructor(url, frameElement) {
    this.channelType = "MessageChannel";
    this.frame = document.querySelector(frameElement);
    if (this.frame === null) {
      throw new Error(`iFrame cannot be found using ${frameElement}`);
    }
    this.createChannel();
    // Listen for FRAME_READY signal from iframe (including reloads)
    this.readyHandler = event => {
      if (event.data.type === 'FRAME_READY' && event.origin === window.location.origin) {
        logger_1.logger.log("Frame ready - establishing channel");
        this.recreateChannel();
      }
    };
    window.addEventListener('message', this.readyHandler);
  }
  createChannel() {
    this.channelInstance = new MessageChannel();
    this.channelInstance.port1.onmessage = event => this.recieveMessageFromFrame(event);
    this.channelInstance.port1.onmessageerror = event => this.recieveMessageError(event);
    this.channelInstance.port1.start();
  }
  recreateChannel() {
    logger_1.logger.log("Recreating MessageChannel for iframe reload");
    // Close old channel
    if (this.channelInstance) {
      this.channelInstance.port1.close();
    }
    // Create new channel
    this.createChannel();
    // Send new port to iframe
    this.sendPortToFrame();
  }
  sendPortToFrame() {
    const message = {
      action: "Host:Create"
    };
    // @ts-ignore
    this.frame.contentWindow.postMessage(message, window.location.origin, [this.channelInstance.port2]);
  }
  recieveMessageFromFrame(event) {}
  recieveMessageError(event) {
    logger_1.logger.error("HostChannel reports error from FrameChannel:", event);
  }
  broadcastMessage(broadcastMessage) {
    this.channelInstance.port1.postMessage(broadcastMessage);
  }
  destroy() {
    logger_1.logger.log("Destroying HostChannel");
    window.removeEventListener('message', this.readyHandler);
    if (this.channelInstance) {
      this.channelInstance.port1.close();
    }
  }
}
exports["default"] = HostChannel;

/***/ }),

/***/ "./client/cms-live-updates/FluxLiveState.ts":
/*!**************************************************!*\
  !*** ./client/cms-live-updates/FluxLiveState.ts ***!
  \**************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {



/**
 * FluxLiveState - Manages form field state for live CMS preview updates
 *
 * Tracks field changes in the CMS and sends them to the backend for template updates
 */
Object.defineProperty(exports, "__esModule", ({
  value: true
}));
const logger_1 = __webpack_require__(/*! ../core/logger */ "./client/core/logger.ts");
class FluxLiveState {
  constructor() {
    this.isLiveStateActive = true;
    this.fields = new Map();
    this.pageID = null;
    this.className = null;
    this.initializeFromFluxLiveConfig();
  }
  /**
   * Initialize state from global FluxConfig
   */
  initializeFromFluxLiveConfig() {
    if (typeof window !== 'undefined' && window.FluxLiveConfig) {
      const config = window.FluxLiveConfig;
      this.pageID = config.DataObjectID || null;
      this.className = config.ClassName || null;
    }
  }
  /**
   * Update a field's value in the state
   */
  updateField(key, value, type) {
    this.fields.set(key, {
      key,
      value,
      type,
      updatedAt: Date.now()
    });
  }
  /**
   * Get a field's current value
   */
  getField(key) {
    const field = this.fields.get(key);
    return field ? field.value : null;
  }
  /**
   * Get all changed fields as a plain object
   */
  getChangedFields() {
    const fields = {};
    this.fields.forEach((fieldData, key) => {
      fields[key] = fieldData.value;
    });
    return fields;
  }
  /**
   * Clear all changed fields
   */
  clear() {
    this.fields.clear();
  }
  /**
   * Get the state as JSON for sending to the server
   */
  toJSON() {
    return {
      pageID: this.pageID,
      className: this.className,
      fields: this.getChangedFields()
    };
  }
  /**
   * Send state to the backend and get updated template
   */
  async sendUpdate(apiEndpoint) {
    const state = this.toJSON();
    if (this.pageID === null) {
      throw new Error(`Missing page id`);
    }
    ;
    const url = `${apiEndpoint}/templateUpdate?pageID=${this.pageID}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(state)
    });
    if (!response.ok) {
      throw new Error(`Template update failed: ${response.statusText}`);
    }
    const data = await response.json();
    return data;
  }
  /**
   * Set the page ID
   */
  setPageID(pageID) {
    this.pageID = pageID;
  }
  /**
   * Set the class name
   */
  setClassName(className) {
    this.className = className;
  }
  setLiveStateActive(isActive) {
    this.isLiveStateActive = isActive;
  }
  getIsActive() {
    return this.isLiveStateActive;
  }
  /**
   * Get debug information
   */
  debug() {
    logger_1.logger.log('FluxLiveState:', {
      pageID: this.pageID,
      className: this.className,
      fields: this.getChangedFields(),
      fieldCount: this.fields.size,
      isLiveStateActive: this.isLiveStateActive
    });
  }
}
exports["default"] = FluxLiveState;

/***/ }),

/***/ "./client/cms-live-updates/host.ts":
/*!*****************************************!*\
  !*** ./client/cms-live-updates/host.ts ***!
  \*****************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {



var __importDefault = this && this.__importDefault || function (mod) {
  return mod && mod.__esModule ? mod : {
    "default": mod
  };
};
Object.defineProperty(exports, "__esModule", ({
  value: true
}));
// @ts-nocheck
/* eslint-disable */
const HostChannel_1 = __importDefault(__webpack_require__(/*! ../bind/HostChannel */ "./client/bind/HostChannel.ts"));
const FluxLiveState_1 = __importDefault(__webpack_require__(/*! ./FluxLiveState */ "./client/cms-live-updates/FluxLiveState.ts"));
const API_ENDPOINT = "/flux/api";
const CMS_FRAME = 'iframe[name="cms-preview-iframe"]';
/**
 * Sends the HTML down to the frame
 * @param hostChannel
 * @param fluxState
 * @returns
 */
async function sendTemplateUpdate(hostChannel, fluxState) {
  return fluxState.sendUpdate(API_ENDPOINT).then(response => {
    if (!response.trusted) {
      console.warn("Source HTML returned unsafe html");
    }
    // Broadcast the HTML to the iframe for live updates
    hostChannel.broadcastMessage({
      type: 'templateUpdate',
      html: response.html,
      changedFields: response.changedFields
    });
    return response;
  }).catch(error => {
    console.error("Template update failed:", error);
    throw error;
  });
}
window.addEventListener("load", function () {
  const $ = window.jQuery;
  const entwine = $.entwine;
  const fluxState = new FluxLiveState_1.default();
  const url = window.location.origin;
  const hostChannel = new HostChannel_1.default(url, CMS_FRAME);
  // Watch for split mode changes
  const cmsContainer = document.querySelector('.cms-container');
  if (cmsContainer) {
    const observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          let target = mutation.target;
          if (target.classList.contains('cms-container--split-mode')) {
            fluxState.setLiveStateActive(true);
            sendTemplateUpdate(hostChannel, fluxState);
          } else {
            fluxState.setLiveStateActive(false);
          }
        }
      });
    });
    observer.observe(cmsContainer, {
      attributes: true,
      attributeFilter: ['class']
    });
  }
  entwine("flux", function ($) {
    $("[fx-key]").entwine({
      onmatch: function (event) {
        var self = $(this);
        let element = self[0];
        const bindKey = element.getAttribute("fx-key");
        const bindEvent = element.getAttribute("fx-event");
        const proxyElement = element.getAttribute("fx-proxy");
        // Watch for file upload / react dropdown changes
        if (proxyElement) {
          const proxyElementType = element.getAttribute("fx-proxy-type");
          switch (proxyElementType) {
            case "document":
              element = document.querySelector(proxyElement);
              break;
            case "previousElementSibling":
              element = element.previousElementSibling;
              break;
          }
          let previousValue = null;
          let isFirstRun = true;
          const observer = new MutationObserver(mutations => {
            const proxiedElement = element.querySelector(proxyElement);
            if (!proxiedElement) {
              return;
            }
            const currentValue = proxiedElement.value || proxiedElement.getAttribute('value') || '';
            if (isFirstRun) {
              previousValue = currentValue;
              isFirstRun = false;
              return;
            }
            if (currentValue !== previousValue) {
              previousValue = currentValue;
              fluxState.updateField(bindKey, currentValue);
              sendTemplateUpdate(hostChannel, fluxState);
            }
          });
          observer.observe(element, {
            attributes: true,
            attributeFilter: ["value"],
            childList: true,
            subtree: true,
            characterData: false
          });
          return;
        }
        if (!element) return;
        element.addEventListener(bindEvent, listenerEvent => {
          let event, value, type;
          if (bindEvent === "keyup") {
            value = listenerEvent.target.value;
            type = 'Text';
          }
          if (bindEvent === "click") {
            value = listenerEvent.target.checked;
            type = 'HTML';
          }
          if (bindEvent === "change") {
            value = listenerEvent.target.value || listenerEvent.target.checked;
            type = 'HTML';
          }
          fluxState.updateField(bindKey, value);
          if (!fluxState.getIsActive()) {
            return;
          }
          if (type === 'Text') {
            hostChannel.broadcastMessage({
              type: 'textUpdate',
              key: bindKey,
              event: bindEvent,
              value
            });
            return;
          }
          sendTemplateUpdate(hostChannel, fluxState);
        });
      }
    });
  });
});

/***/ }),

/***/ "./client/core/logger.ts":
/*!*******************************!*\
  !*** ./client/core/logger.ts ***!
  \*******************************/
/***/ (function(__unused_webpack_module, exports) {



Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports.logger = void 0;
/**
 * Logger will only output for development env only
 */
class Logger {
  constructor(env) {
    if (env === 'development') {
      // Bind console methods directly to preserve call stack location
      this.log = console.log.bind(console);
      this.warn = console.warn.bind(console);
      this.error = console.error.bind(console);
      this.table = console.table.bind(console);
      this.time = console.time.bind(console);
      this.timeEnd = console.timeEnd.bind(console);
      this.timeLog = console.timeLog.bind(console);
    } else {
      // No-op functions for non-development
      this.log = () => {};
      this.warn = () => {};
      this.error = () => {};
      this.table = () => {};
      this.time = () => {};
      this.timeEnd = () => {};
      this.timeLog = () => {};
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
/******/ 		__webpack_modules__[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	// This entry module is referenced by other modules so it can't be inlined
/******/ 	var __webpack_exports__ = __webpack_require__("./client/cms-live-updates/host.ts");
/******/ 	
/******/ })()
;
//# sourceMappingURL=host.js.map