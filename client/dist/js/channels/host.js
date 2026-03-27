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
/*!****************************************!*\
  !*** ./client/channels/HostChannel.ts ***!
  \****************************************/


Object.defineProperty(exports, "__esModule", ({
  value: true
}));
const logger_1 = __webpack_require__(/*! ../core/logger */ "./client/core/logger.ts");
class HostChannel {
  get isInlineEditInProgress() {
    return this.inlineEditInProgress;
  }
  get frame() {
    return document.querySelector(this.frameSelector);
  }
  constructor(url, frameElement) {
    this.onFrameReady = null;
    this.inlineEditInProgress = false;
    this.channelType = "MessageChannel";
    this.frameSelector = frameElement;
    if (!this.frame) {
      throw new Error(`iFrame cannot be found using ${frameElement}`);
    }
    this.createChannel();
    this.readyHandler = event => {
      if (event.data.type === 'FRAME_READY' && event.origin === window.location.origin) {
        logger_1.logger.log("Frame ready - establishing channel");
        this.recreateChannel();
        this.onFrameReady?.();
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
    if (this.channelInstance) {
      this.channelInstance.port1.close();
    }
    this.createChannel();
    this.sendPortToFrame();
  }
  sendPortToFrame() {
    const message = {
      action: "Host:Create"
    };
    // @ts-ignore
    this.frame.contentWindow.postMessage(message, window.location.origin, [this.channelInstance.port2]);
  }
  recieveMessageFromFrame(event) {
    const data = event.data;
    if (!data.type) {
      logger_1.logger.warn("HostChannel received message without type:", data);
    }
    switch (data.type) {
      case 'inlineEditUpdate':
        this.handleInlineEditUpdate(data);
        break;
      case 'fileUploadClick':
        this.handleFileUploadClick(data);
        break;
      case 'linkFieldClick':
        this.handleLinkFieldClick(data);
        break;
      case 'editBlockClick':
        this.handleEditBlockClick(data);
        break;
      case 'gridFieldAction':
        this.handleGridFieldAction(data);
        break;
      default:
        logger_1.logger.warn("HostChannel received unknown message type:", data.type);
    }
  }
  handleInlineEditUpdate(data) {
    const {
      key,
      value,
      owner
    } = data;
    const input = this.findCmsField(key, owner);
    if (!input) {
      logger_1.logger.warn(`HostChannel: could not find input for fx-key="${key}" fx-owner="${owner}"`);
      return;
    }
    // Use the native setter so React's controlled-input tracking stays in sync.
    const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (nativeSetter) {
      nativeSetter.call(input, value);
    } else {
      input.value = value;
    }
    this.inlineEditInProgress = true;
    input.dispatchEvent(new Event('input', {
      bubbles: true
    }));
    input.dispatchEvent(new Event('keyup', {
      bubbles: true
    }));
    this.inlineEditInProgress = false;
  }
  handleFileUploadClick(data) {
    const {
      key,
      owner
    } = data;
    const input = this.findCmsField(key, owner);
    if (!input) {
      logger_1.logger.warn(`HostChannel: could not find upload field for fx-key="${key}" fx-owner="${owner}"`);
      return;
    }
    const holder = input.previousElementSibling;
    const btn = holder?.querySelector('.uploadfield-item__view-btn');
    if (!btn) {
      logger_1.logger.warn(`HostChannel: could not find .uploadfield-item__view-btn for fx-key="${key}"`);
      return;
    }
    btn.click();
  }
  handleLinkFieldClick(data) {
    const {
      key,
      owner
    } = data;
    const input = this.findCmsField(key, owner);
    if (!input) {
      logger_1.logger.warn(`HostChannel: could not find link field for fx-key="${key}" fx-owner="${owner}"`);
      return;
    }
    const container = input.nextElementSibling;
    const btn = container?.querySelector('.link-picker__button');
    if (!btn) {
      logger_1.logger.warn(`HostChannel: could not find .link-picker__button for fx-key="${key}"`);
      return;
    }
    btn.click();
  }
  handleEditBlockClick(data) {
    const segments = window.FluxConfig?.Segments ?? [];
    const elementSegments = segments.filter(s => s.Type === 'Element');
    const index = elementSegments.findIndex(s => s.owner === data.owner);
    if (index === -1) {
      logger_1.logger.warn(`HostChannel: no Element segment found for owner "${data.owner}"`);
      return;
    }
    const el = document.querySelectorAll('.element-editor__element')[index];
    if (!el) {
      logger_1.logger.warn(`HostChannel: no .element-editor__element at index ${index}`);
      return;
    }
    el.click();
  }
  handleGridFieldAction(data) {
    const {
      key,
      owner,
      action
    } = data;
    const gridField = document.querySelector(`.grid-field[data-name="${key}"]`);
    if (!gridField) {
      logger_1.logger.warn(`HostChannel: no GridField found with data-name="${key}"`);
      return;
    }
    const row = gridField.querySelector(`[data-id="${owner}"]`);
    if (!row) {
      logger_1.logger.warn(`HostChannel: no row with data-id="${owner}" in GridField "${key}"`);
      return;
    }
    let btn = null;
    switch (action) {
      case 'edit':
        btn = row.querySelector('a.btn--icon-md, a.font-icon-edit, a[href*="/edit/"]');
        break;
      case 'delete':
        btn = row.querySelector('button.action--delete, button[name*="action_delete"]');
        break;
      case 'archive':
        btn = row.querySelector('button.action--archive, button[name*="action_archive"]');
        break;
    }
    if (!btn) {
      logger_1.logger.warn(`HostChannel: no "${action}" button found in row ${owner} of GridField "${key}"`);
      return;
    }
    btn.click();
  }
  findCmsField(key, owner) {
    const selector = owner ? `[fx-key="${key}"][fx-owner="${owner}"]` : `[fx-key="${key}"]:not([fx-owner])`;
    return document.querySelector(selector);
  }
  recieveMessageError(event) {
    logger_1.logger.error("HostChannel reports error from FrameChannel:", event);
  }
  setOnFrameReady(callback) {
    this.onFrameReady = callback;
  }
  isPreviewingDraft() {
    try {
      const src = this.frame?.getAttribute('src') || '';
      const params = new URLSearchParams(src.split('?')[1] || '');
      return params.get('stage') === 'Stage';
    } catch {
      return false;
    }
  }
  broadcastMessage(broadcastMessage) {
    if (this.inlineEditInProgress && broadcastMessage.type === 'textUpdate') {
      logger_1.logger.log(`Suppressing textUpdate echo for "${broadcastMessage.key}" during inline edit`);
      return;
    }
    const updateTypes = ['pageTemplateUpdate', 'blockUpdate', 'textUpdate', 'patchTemplateUpdate'];
    if (updateTypes.includes(broadcastMessage.type) && !this.isPreviewingDraft()) {
      logger_1.logger.log(`Suppressing ${broadcastMessage.type} — preview is not on Draft stage`);
      return;
    }
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
}();
/******/ })()
;
//# sourceMappingURL=host.js.map