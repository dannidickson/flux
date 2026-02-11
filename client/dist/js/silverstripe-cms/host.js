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
    this.segments = [];
    this.objects = new Map();
    this.initializeFromFluxConfig();
  }
  /**
   * Initialize state from global FluxConfig
   * Segments is now a flat array
   */
  initializeFromFluxConfig() {
    if (typeof window !== 'undefined' && window.FluxConfig) {
      const config = window.FluxConfig;
      this.segments = config.Segments || [];
      // Find the Page segment
      const pageSegment = this.segments.find(s => s.Type === 'Page');
      if (pageSegment) {
        this.pageID = pageSegment.ID ? Number(pageSegment.ID) : null;
        this.className = pageSegment.ClassName || null;
      }
    }
  }
  /**
   * Update a field's value in the state
   * Now includes segment ownership information
   */
  updateField(key, value, options) {
    // Find the segment this field belongs to
    let segment;
    if (options?.owner) {
      // Find segment by owner
      segment = this.segments.find(s => s.owner === options.owner);
    } else {
      // Default to Page segment
      segment = this.segments.find(s => s.Type === 'Page');
    }
    this.fields.set(key, {
      key,
      value,
      type: options?.type,
      owner: options?.owner || segment?.owner,
      segmentType: options?.segmentType || segment?.Type || 'Page',
      className: options?.className || segment?.ClassName || '',
      segmentID: options?.segmentID || segment?.ID || '',
      updatedAt: Date.now()
    });
    if (true) {
      // @ts-ignore
      window.FluxLiveState = this; // Expose for debugging
    }
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
   * Get changed fields grouped by segment
   * Returns a structure that maps owner -> fields
   */
  getChangedFieldsBySegment() {
    const segmentChanges = {};
    this.fields.forEach(fieldData => {
      const segmentKey = fieldData.owner || 'Page';
      if (!segmentChanges[segmentKey]) {
        segmentChanges[segmentKey] = {
          segmentType: fieldData.segmentType,
          className: fieldData.className,
          segmentID: fieldData.segmentID,
          owner: fieldData.owner,
          fields: {}
        };
      }
      segmentChanges[segmentKey].fields[fieldData.key] = fieldData.value;
    });
    return segmentChanges;
  }
  /**
   * Clear all changed fields
   */
  clear() {
    this.fields.clear();
  }
  /**
   * Get the state as JSON for sending to the server
   * Includes segment ownership information
   */
  toJSON() {
    return {
      pageID: this.pageID,
      className: this.className,
      segments: this.segments,
      fields: this.getChangedFields(),
      segmentChanges: this.getChangedFieldsBySegment()
    };
  }
  /**
   * Get the segments array
   */
  getSegments() {
    return this.segments;
  }
  /**
   * Get only Element segments
   */
  getElements() {
    return this.segments.filter(s => s.Type === 'Element');
  }
  /**
   * Send state to the backend and get updated template
   */
  async sendUpdate(apiEndpoint) {
    const state = this.toJSON();
    console.log('state', state);
    if (this.pageID === null) {
      throw new Error(`Missing page id`);
    }
    ;
    const url = `${apiEndpoint}/pageTemplateUpdate?pageID=${this.pageID}`;
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
   * Send a block-scoped update for a specific segment owner
   */
  async sendBlockUpdate(apiEndpoint, owner) {
    const segmentChanges = this.getChangedFieldsBySegment();
    const segment = segmentChanges[owner];
    if (!segment) {
      throw new Error(`No segment changes found for owner: ${owner}`);
    }
    if (this.pageID === null) {
      throw new Error(`Missing page id`);
    }
    const payload = {
      pageID: this.pageID,
      className: this.className,
      owner: owner,
      segmentType: segment.segmentType,
      segmentClassName: segment.className,
      segmentID: segment.segmentID,
      fields: segment.fields
    };
    const url = `${apiEndpoint}/blockUpdate?pageID=${this.pageID}&owner=${encodeURIComponent(owner)}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      throw new Error(`Block update failed: ${response.statusText}`);
    }
    return response.json();
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
  addToObject(key) {
    this.objects.set(key, {
      key: key,
      type: 'object'
    });
  }
  getObjects() {
    return this.objects;
  }
  /**
   * Get debug information
   */
  debug() {
    logger_1.logger.log('FluxLiveState:', {
      pageID: this.pageID,
      className: this.className,
      segments: this.segments,
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
const logger_1 = __webpack_require__(/*! ../core/logger */ "./client/core/logger.ts");
const FluxLiveState_1 = __importDefault(__webpack_require__(/*! ./FluxLiveState */ "./client/cms-live-updates/FluxLiveState.ts"));
const API_ENDPOINT = "/flux/api";
const CMS_FRAME = 'iframe[name="cms-preview-iframe"]';
/**
 * Sends the HTML down to the frame
 * @param hostChannel
 * @param fluxState
 * @returns
 */
let lastCallTime = 0;
/**
 * Should probably consider doing this via a queue system
 * This way I can tell which updates can be skipped, or if it requires a template update
 * We need to consider this as we are listening to modal open and close, when the close is triggered
 * it fires this update, but might not require any changes.
 *
 * @param hostChannel
 * @param fluxState
 * @param cooldownMs
 * @returns
 */
async function sendPageTemplateUpdate(hostChannel, fluxState, cooldownMs = 500) {
  const now = Date.now();
  if (now - lastCallTime < cooldownMs) {
    logger_1.logger.log("Still in cooldown, skipping update");
    return; // Skip this call
  }
  lastCallTime = now;
  // Execute immediately
  try {
    const response = await fluxState.sendUpdate(API_ENDPOINT);
    if (!response.trusted) {
      console.warn("Source HTML returned unsafe html");
    }
    hostChannel.broadcastMessage({
      type: "pageTemplateUpdate",
      html: response.html,
      changedFields: response.changedFields
    });
    return response;
  } catch (error) {
    console.error("Template update failed:", error);
    throw error;
  }
}
const blockCooldowns = new Map();
async function sendBlockUpdate(hostChannel, fluxState, owner, cooldownMs = 500) {
  const now = Date.now();
  const lastCall = blockCooldowns.get(owner) || 0;
  if (now - lastCall < cooldownMs) {
    logger_1.logger.log(`Block cooldown active for ${owner}, skipping`);
    return;
  }
  blockCooldowns.set(owner, now);
  try {
    const response = await fluxState.sendBlockUpdate(API_ENDPOINT, owner);
    if (!response.trusted) {
      console.warn("Block update returned unsafe html");
    }
    console.log(`Morphing block: ${owner}`);
    hostChannel.broadcastMessage({
      type: "blockUpdate",
      html: response.html,
      targetOwner: owner
    });
    return response;
  } catch (error) {
    console.warn("Block update failed, falling back to full page update:", error);
    sendPageTemplateUpdate(hostChannel, fluxState);
  }
}
window.addEventListener("load", function () {
  const $ = window.jQuery;
  const entwine = $.entwine;
  const fluxState = new FluxLiveState_1.default();
  const url = window.location.origin;
  const hostChannel = new HostChannel_1.default(url, CMS_FRAME);
  // Send FluxConfig to iframe when it loads
  const sendFluxConfigToIframe = () => {
    if (window.FluxConfig) {
      hostChannel.broadcastMessage({
        type: "configUpdate",
        config: window.FluxConfig
      });
    }
  };
  // Send config when iframe loads
  const iframe = document.querySelector(CMS_FRAME);
  if (iframe) {
    iframe.addEventListener("load", sendFluxConfigToIframe);
  }
  // Watch for split mode changes
  const cmsContainer = document.querySelector(".cms-container");
  if (cmsContainer) {
    // Track previous split mode state to detect transitions
    let wasSplitMode = cmsContainer.classList.contains("cms-container--split-mode");
    // Set initial state without triggering update
    if (wasSplitMode) {
      fluxState.setLiveStateActive(true);
    }
    const observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        if (mutation.type === "attributes" && mutation.attributeName === "class") {
          let target = mutation.target;
          const isSplitMode = target.classList.contains("cms-container--split-mode");
          // Only trigger update when transitioning TO split mode, not when already in it
          if (isSplitMode && !wasSplitMode) {
            fluxState.setLiveStateActive(true);
            // Send config to iframe when entering split mode
            sendFluxConfigToIframe();
            // Only send template update if there are field changes
            if (fluxState.getChangedFields() && Object.keys(fluxState.getChangedFields()).length > 0) {
              sendPageTemplateUpdate(hostChannel, fluxState);
            }
          } else if (!isSplitMode && wasSplitMode) {
            fluxState.setLiveStateActive(false);
          }
          wasSplitMode = isSplitMode;
        }
      });
    });
    observer.observe(cmsContainer, {
      attributes: true,
      attributeFilter: ["class"]
    });
  }
  // Watch for modal-open class on body element
  const bodyElement = document.body;
  if (bodyElement) {
    const bodyObserver = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        if (mutation.type === "attributes" && mutation.attributeName === "class") {
          const hasModalOpen = bodyElement.classList.contains("modal-open");
          if (hasModalOpen) {
            console.log("Modal opened");
            console.log(fluxState);
          } else {
            this.setTimeout(() => {
              console.log("Modal closed");
              sendPageTemplateUpdate(hostChannel, fluxState);
            }, 500);
          }
        }
      });
    });
    bodyObserver.observe(bodyElement, {
      attributes: true,
      attributeFilter: ["class"]
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
        const owner = element.getAttribute("fx-owner") ?? null;
        const type = element.getAttribute("fx-type") ?? null;
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
            case "default":
            case "element":
            case "self":
            default:
              element = element.querySelector(proxyElement);
              break;
          }
          let previousValue = null;
          let isFirstRun = true;
          const observer = new MutationObserver(mutations => {
            const proxiedElement = element.querySelector(proxyElement);
            if (!proxiedElement) {
              return;
            }
            const currentValue = proxiedElement.value || proxiedElement.getAttribute("value") || "";
            if (isFirstRun) {
              previousValue = currentValue;
              isFirstRun = false;
              return;
            }
            if (currentValue !== previousValue) {
              previousValue = currentValue;
              fluxState.updateField(bindKey, currentValue, {
                owner: owner
              });
              owner ? sendBlockUpdate(hostChannel, fluxState, owner) : sendPageTemplateUpdate(hostChannel, fluxState);
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
        if (element.tagName === "TEXTAREA" && type === "HTML") {
          var editor = tinymce.get(element.id);
          if (editor) {
            editor.on("keyup", function () {
              document.querySelector(".flux-refresh__button").classList.toggle("hidden", false);
              // @TODO this is a good case for a 'patchUpdate'
              // where instead of generating the entire HTML, it sends a patch to the specific binding key
              // This would handle
              hostChannel.broadcastMessage({
                type: "textUpdate",
                key: bindKey,
                owner: owner,
                event: bindEvent,
                value: editor.getContent()
              });
            });
          }
        }
        element.addEventListener(bindEvent, listenerEvent => {
          let event, value, type;
          if (bindEvent === "keyup") {
            value = listenerEvent.target.value;
            if (element.getAttribute("fx-event-type") === "templateUpdate") {
              type = "HTML";
            } else if (value.length < 1) type = "HTML";else type = "Text";
          }
          if (bindEvent === "click") {
            value = listenerEvent.target.checked;
            type = "HTML";
          }
          if (bindEvent === "change") {
            value = listenerEvent.target.value || listenerEvent.target.checked;
            type = "HTML";
          }
          fluxState.updateField(bindKey, value, {
            type: type,
            owner: owner
          });
          if (!fluxState.getIsActive()) {
            return;
          }
          if (type === "Text") {
            hostChannel.broadcastMessage({
              type: "textUpdate",
              key: bindKey,
              owner: owner,
              event: bindEvent,
              value
            });
            return;
          }
          if (owner) {
            sendBlockUpdate(hostChannel, fluxState, owner);
          } else {
            sendPageTemplateUpdate(hostChannel, fluxState);
          }
        });
      }
    });
    $("[fx-proxy]").entwine({
      onmatch: function (event) {
        var self = $(this);
        let proxiedElement = self[0];
        console.log(proxiedElement);
        const parentElement = proxiedElement.closest("[fx-key]");
        const bindKey = parentElement.getAttribute("fx-key");
        const bindEvent = parentElement.getAttribute("fx-event");
        const proxyElement = parentElement.getAttribute("fx-proxy");
        const owner = parentElement.getAttribute("fx-owner") ?? null;
        const type = parentElement.getAttribute("fx-type") ?? null;
        const observer = new MutationObserver(mutations => {
          if (!proxiedElement) {
            return;
          }
          const currentValue = proxiedElement.value || proxiedElement.getAttribute("value") || "";
          let previousValue = null;
          let isFirstRun = false;
          if (currentValue !== previousValue) {
            previousValue = currentValue;
            fluxState.updateField(bindKey, currentValue, {
              owner: owner
            });
            owner ? sendBlockUpdate(hostChannel, fluxState, owner) : sendPageTemplateUpdate(hostChannel, fluxState);
          }
        });
        observer.observe(proxiedElement, {
          attributes: true,
          attributeFilter: ["value"],
          childList: true,
          subtree: true,
          characterData: false
        });
      }
    });
    $(".flux-refresh__button").entwine({
      onclick: function (event) {
        var self = $(this);
        let element = self[0];
        sendPageTemplateUpdate(hostChannel, fluxState);
        element.classList.toggle("hidden", true);
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