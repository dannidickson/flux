/******/ (function() { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ "./client/channels/HostChannel.ts":
/*!****************************************!*\
  !*** ./client/channels/HostChannel.ts ***!
  \****************************************/
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

/***/ "./client/cms-live-updates/FluxDirectiveManager.ts":
/*!*********************************************************!*\
  !*** ./client/cms-live-updates/FluxDirectiveManager.ts ***!
  \*********************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {



Object.defineProperty(exports, "__esModule", ({
  value: true
}));
const FluxDirective_1 = __webpack_require__(/*! ../core/FluxDirective */ "./client/core/FluxDirective.ts");
class FluxDirectiveManager {
  constructor($, fluxState, onTriggerUpdate, hostChannel) {
    this.$ = $;
    this.fluxState = fluxState;
    this.onTriggerUpdate = onTriggerUpdate;
    this.hostChannel = hostChannel;
  }
  initialize() {
    const manager = this;
    this.$.entwine("flux", function ($) {
      manager.setupKeyBindings($);
      manager.setupRefreshButton($);
    });
  }
  setupKeyBindings($) {
    const manager = this;
    $("[fx-key]").entwine({
      onmatch: function (_event) {
        const element = this[0];
        const binding = (0, FluxDirective_1.fromElement)(element);
        if (!binding) return;
        // Watch for file upload / react dropdown changes
        if (binding.proxySelector) {
          manager.observeKeyProxyElement(element, binding);
          return;
        }
        if (element.tagName === "TEXTAREA" && binding.type === "HTML") {
          manager.setupTinyMCEListener(element, binding);
        }
        element.addEventListener(binding.event, listenerEvent => {
          let value;
          let type;
          if (binding.collectSelector) {
            value = Array.from(element.querySelectorAll(binding.collectSelector)).map(el => el.value);
            type = "HTML";
          } else {
            ({
              value,
              type
            } = manager.extractEventData(listenerEvent, binding.event, element));
          }
          manager.fluxState.updateField(binding.key, value, {
            type,
            owner: binding.owner ?? undefined
          });
          if (!manager.fluxState.getIsActive()) return;
          if (type === "Text") {
            manager.hostChannel.broadcastMessage({
              type: "textUpdate",
              key: binding.key,
              owner: binding.owner,
              event: binding.event,
              value
            });
            return;
          }
          manager.onTriggerUpdate(binding.owner);
        });
      }
    });
  }
  setupRefreshButton($) {
    const manager = this;
    $(".flux-refresh__button").entwine({
      onclick: function (_event) {
        const element = this[0];
        manager.onTriggerUpdate(null);
        element.classList.toggle("hidden", true);
      }
    });
  }
  /**
   * Observe a proxy container found via [fx-key]'s fx-proxy attribute.
   * Tracks first-run to avoid triggering on the initial mutation.
   */
  observeKeyProxyElement(element, binding) {
    let previousValue = null;
    let isFirstRun = true;
    // For previousElementSibling (e.g. UploadField), the [fx-key] element is a leaf
    // (the file input), and mutations happen inside its previous sibling (the holder div).
    // Observe that sibling and query the proxy within it.
    // For all other types, observe the field container itself.
    const observeTarget = binding.proxyType === "previousElementSibling" ? element.previousElementSibling ?? element : element;
    const observer = new MutationObserver(() => {
      const proxiedElement = observeTarget.querySelector(binding.proxySelector);
      if (!proxiedElement) return;
      const currentValue = (0, FluxDirective_1.getElementValue)(proxiedElement);
      if (isFirstRun) {
        previousValue = currentValue;
        isFirstRun = false;
        return;
      }
      if (currentValue !== previousValue) {
        previousValue = currentValue;
        this.fluxState.updateField(binding.key, currentValue, {
          owner: binding.owner ?? undefined
        });
        this.onTriggerUpdate(binding.owner);
      }
    });
    observer.observe(observeTarget, {
      childList: true,
      subtree: true,
      characterData: false
    });
  }
  setupTinyMCEListener(element, binding) {
    const editor = window.tinymce?.get(element.id);
    if (editor) {
      editor.on("keyup", () => {
        document.querySelector(".flux-refresh__button")?.classList.toggle("hidden", false);
        this.hostChannel.broadcastMessage({
          type: "textUpdate",
          key: binding.key,
          owner: binding.owner,
          event: binding.event,
          value: editor.getContent()
        });
      });
    }
  }
  extractEventData(event, eventType, element) {
    let value;
    let type = "HTML";
    const target = event.target;
    if (eventType === "keyup") {
      value = target.value;
      if (element.getAttribute("fx-event-type") === "templateUpdate") {
        type = "HTML";
      } else if (value.length < 1) {
        type = "HTML";
      } else {
        type = "Text";
      }
    } else if (eventType === "click") {
      value = target.checked;
      type = "HTML";
    } else if (eventType === "change") {
      value = target.value || target.checked;
      type = "HTML";
    }
    return {
      value,
      type
    };
  }
}
exports["default"] = FluxDirectiveManager;

/***/ }),

/***/ "./client/cms-live-updates/FluxHostCoordinator.ts":
/*!********************************************************!*\
  !*** ./client/cms-live-updates/FluxHostCoordinator.ts ***!
  \********************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {



var __importDefault = this && this.__importDefault || function (mod) {
  return mod && mod.__esModule ? mod : {
    "default": mod
  };
};
Object.defineProperty(exports, "__esModule", ({
  value: true
}));
const HostChannel_1 = __importDefault(__webpack_require__(/*! ../channels/HostChannel */ "./client/channels/HostChannel.ts"));
const logger_1 = __webpack_require__(/*! ../core/logger */ "./client/core/logger.ts");
const FluxDirectiveManager_1 = __importDefault(__webpack_require__(/*! ./FluxDirectiveManager */ "./client/cms-live-updates/FluxDirectiveManager.ts"));
const FluxLiveState_1 = __importDefault(__webpack_require__(/*! ./FluxLiveState */ "./client/cms-live-updates/FluxLiveState.ts"));
const API_ENDPOINT = "/flux/api";
const CMS_FRAME = 'iframe[name="cms-preview-iframe"]';
const PAGE_COOLDOWN_MS = 500;
const BLOCK_COOLDOWN_MS = 500;
function createCooldown(ms) {
  const last = new Map();
  return (key = 'default') => {
    const now = Date.now();
    if (now - (last.get(key) ?? 0) < ms) return false;
    last.set(key, now);
    return true;
  };
}
class FluxHostCoordinator {
  constructor(url, $) {
    this.url = url;
    this.$ = $;
    this.pageReady = createCooldown(PAGE_COOLDOWN_MS);
    this.blockReady = createCooldown(BLOCK_COOLDOWN_MS);
    this.observers = [];
    this.hostChannel = new HostChannel_1.default(url, CMS_FRAME);
    this.fluxState = new FluxLiveState_1.default();
  }
  initialize() {
    this.setupIframeListeners();
    this.setupSplitModeObserver();
    this.setupModalObserver();
    this.setupFluxBindings();
  }
  setupIframeListeners() {
    const iframe = document.querySelector(CMS_FRAME);
    if (iframe) {
      iframe.addEventListener("load", () => this.sendFluxConfigToIframe());
    }
  }
  sendFluxConfigToIframe() {
    if (window.FluxConfig) {
      this.hostChannel.broadcastMessage({
        type: "configUpdate",
        config: window.FluxConfig
      });
    }
  }
  observeClassAttribute(element, callback) {
    const observer = new MutationObserver(mutations => {
      mutations.forEach(m => {
        if (m.attributeName === "class") callback(m.target);
      });
    });
    observer.observe(element, {
      attributes: true,
      attributeFilter: ["class"]
    });
    return observer;
  }
  setupSplitModeObserver() {
    const cmsContainer = document.querySelector(".cms-container");
    if (!cmsContainer) return;
    let wasSplitMode = cmsContainer.classList.contains("cms-container--split-mode");
    if (wasSplitMode) {
      this.fluxState.setLiveStateActive(true);
    }
    const observer = this.observeClassAttribute(cmsContainer, target => {
      const isSplitMode = target.classList.contains("cms-container--split-mode");
      if (isSplitMode && !wasSplitMode) {
        this.fluxState.setLiveStateActive(true);
        this.sendFluxConfigToIframe();
        if (Object.keys(this.fluxState.getChangeSet()).length > 0) {
          this.sendPageTemplateUpdate();
        }
      } else if (!isSplitMode && wasSplitMode) {
        this.fluxState.setLiveStateActive(false);
      }
      wasSplitMode = isSplitMode;
    });
    this.observers.push(observer);
  }
  setupModalObserver() {
    const bodyElement = document.body;
    if (!bodyElement) return;
    const observer = this.observeClassAttribute(bodyElement, target => {
      if (target.classList.contains("modal-open")) {
        logger_1.logger.log("Modal opened");
      } else {
        window.setTimeout(() => {
          logger_1.logger.log("Modal closed");
          this.sendPageTemplateUpdate();
        }, 500);
      }
    });
    this.observers.push(observer);
  }
  async sendPageTemplateUpdate() {
    if (!this.pageReady()) {
      logger_1.logger.log("Still in cooldown, skipping update");
      return;
    }
    try {
      const response = await this.fluxState.sendUpdate(API_ENDPOINT);
      if (!response.trusted) {
        logger_1.logger.warn("Source HTML returned unsafe html");
      }
      this.hostChannel.broadcastMessage({
        type: "pageTemplateUpdate",
        html: response.html,
        changedFields: response.changedFields
      });
      if (response.segmentTemplateChanges) {
        const {
          Elements
        } = response.segmentTemplateChanges;
        Object.entries(Elements).forEach(([id, html]) => {
          this.hostChannel.broadcastMessage({
            type: "blockUpdate",
            html,
            targetOwner: `#e${id}`
          });
        });
      }
      return response;
    } catch (error) {
      logger_1.logger.error("Template update failed:", error);
      throw error;
    }
  }
  async sendBlockUpdate(owner) {
    if (!this.blockReady(owner)) {
      logger_1.logger.log(`Block cooldown active for ${owner}, skipping`);
      return;
    }
    try {
      const response = await this.fluxState.sendBlockUpdate(API_ENDPOINT, owner);
      if (!response.trusted) {
        logger_1.logger.warn("Block update returned unsafe html");
      }
      logger_1.logger.log(`Morphing block: ${owner}`);
      this.hostChannel.broadcastMessage({
        type: "blockUpdate",
        html: response.html,
        targetOwner: owner
      });
      return response;
    } catch (error) {
      logger_1.logger.warn("Block update failed, falling back to full page update:", error);
      this.sendPageTemplateUpdate();
    }
  }
  triggerUpdate(owner) {
    if (!this.fluxState.getIsActive()) return;
    if (owner) {
      this.sendBlockUpdate(owner);
    } else {
      this.sendPageTemplateUpdate();
    }
  }
  setupFluxBindings() {
    const bindingManager = new FluxDirectiveManager_1.default(this.$, this.fluxState, owner => this.triggerUpdate(owner), this.hostChannel);
    bindingManager.initialize();
  }
  destroy() {
    this.observers.forEach(observer => observer.disconnect());
    this.observers = [];
    this.hostChannel.destroy();
  }
}
exports["default"] = FluxHostCoordinator;

/***/ }),

/***/ "./client/cms-live-updates/FluxLiveState.ts":
/*!**************************************************!*\
  !*** ./client/cms-live-updates/FluxLiveState.ts ***!
  \**************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {



/**
 * FluxLiveState - Manages form field state for live CMS preview updates
 *
 * Uses FluxConfig.ChangeSet (keyed by ClassName) as the single source of truth
 * for field changes. Segments provides the structural map of the page.
 */
Object.defineProperty(exports, "__esModule", ({
  value: true
}));
const logger_1 = __webpack_require__(/*! ../core/logger */ "./client/core/logger.ts");
class FluxLiveState {
  constructor() {
    this.isLiveStateActive = true;
    this.pageID = null;
    this.className = null;
    this.segments = [];
    this.objects = new Map();
    this.initializeFromFluxConfig();
  }
  getConfig() {
    if (typeof window !== 'undefined' && window.FluxConfig) {
      return window.FluxConfig;
    }
    return null;
  }
  /**
   * Initialize state from global FluxConfig
   */
  initializeFromFluxConfig() {
    const config = this.getConfig();
    if (config) {
      this.segments = config.Segments || [];
      const pageSegment = this.segments.find(s => s.Type === 'Page');
      if (pageSegment) {
        this.pageID = pageSegment.ID ? Number(pageSegment.ID) : null;
        this.className = pageSegment.ClassName || null;
      }
    }
  }
  /**
   * Update a field's value in the ChangeSet
   */
  updateField(key, value, options) {
    let segment;
    if (options?.owner) {
      segment = this.segments.find(s => s.owner === options.owner);
    } else {
      segment = this.segments.find(s => s.Type === 'Page');
    }
    const resolvedClassName = segment?.ClassName || '';
    const config = this.getConfig();
    if (config && resolvedClassName) {
      if (Array.isArray(config.ChangeSet)) {
        config.ChangeSet = {};
      }
      if (!config.ChangeSet[resolvedClassName]) {
        config.ChangeSet[resolvedClassName] = {};
      }
      config.ChangeSet[resolvedClassName][key] = value;
    }
    if (true) {
      // @ts-ignore
      window.FluxLiveState = this;
    }
  }
  /**
   * Get the full ChangeSet
   */
  getChangeSet() {
    const config = this.getConfig();
    return config?.ChangeSet || {};
  }
  /**
   * Find the segment metadata for a given owner
   */
  getSegmentByOwner(owner) {
    return this.segments.find(s => s.owner === owner);
  }
  /**
   * Clear all changed fields from the ChangeSet
   */
  clear() {
    const config = this.getConfig();
    if (config) {
      config.ChangeSet = {};
    }
  }
  /**
   * Build an enriched ChangeSet for the API, keyed by segment Type.
   *
   * Returns: {
   *   "Page": { ClassName, ID, fields },
   *   "Element": [{ ClassName, ID, fields }, ...]
   * }
   */
  buildChangeSetPayload() {
    const rawChangeSet = this.getChangeSet();
    const payload = {};
    for (const segment of this.segments) {
      const fields = rawChangeSet[segment.ClassName];
      if (!fields || Object.keys(fields).length === 0) continue;
      const entry = {
        ClassName: segment.ClassName,
        ID: segment.ID,
        fields
      };
      if (segment.Type === 'Page') {
        payload['Page'] = entry;
      } else {
        if (!payload[segment.Type]) {
          payload[segment.Type] = [];
        }
        payload[segment.Type].push(entry);
      }
    }
    return payload;
  }
  /**
   * Get the state as JSON for sending to the server
   */
  toJSON() {
    return {
      pageID: this.pageID,
      className: this.className,
      changeSet: this.buildChangeSetPayload()
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
   * Send full state to the backend (page + all element changes)
   */
  async sendUpdate(apiEndpoint) {
    const state = this.toJSON();
    if (this.pageID === null) {
      throw new Error(`Missing page id`);
    }
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
    return response.json();
  }
  /**
   * Send a block-scoped update for a specific segment owner
   * Filters the ChangeSet to just the relevant segment's ClassName
   */
  async sendBlockUpdate(apiEndpoint, owner) {
    const segment = this.getSegmentByOwner(owner);
    if (!segment) {
      throw new Error(`No segment found for owner: ${owner}`);
    }
    const rawChangeSet = this.getChangeSet();
    const fields = rawChangeSet[segment.ClassName];
    if (!fields || Object.keys(fields).length === 0) {
      throw new Error(`No changes found for owner: ${owner}`);
    }
    if (this.pageID === null) {
      throw new Error(`Missing page id`);
    }
    const payload = {
      pageID: this.pageID,
      className: this.className,
      changeSet: {
        [segment.Type]: [{
          ClassName: segment.ClassName,
          ID: segment.ID,
          fields
        }]
      }
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
  setPageID(pageID) {
    this.pageID = pageID;
  }
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
      changeSet: this.getChangeSet(),
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
const FluxHostCoordinator_1 = __importDefault(__webpack_require__(/*! ./FluxHostCoordinator */ "./client/cms-live-updates/FluxHostCoordinator.ts"));
window.addEventListener("load", function () {
  const coordinator = new FluxHostCoordinator_1.default(window.location.origin, window.jQuery);
  coordinator.initialize();
});

/***/ }),

/***/ "./client/core/FluxDirective.ts":
/*!**************************************!*\
  !*** ./client/core/FluxDirective.ts ***!
  \**************************************/
/***/ (function(__unused_webpack_module, exports) {



Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports.fromElement = fromElement;
exports.getElementValue = getElementValue;
function fromElement(el) {
  const key = el.getAttribute('fx-key');
  if (!key) return null;
  return {
    element: el,
    key,
    event: el.getAttribute('fx-event'),
    owner: el.getAttribute('fx-owner'),
    type: el.getAttribute('fx-type'),
    proxySelector: el.getAttribute('fx-proxy'),
    proxyType: el.getAttribute('fx-proxy-type'),
    collectSelector: el.getAttribute('fx-collect')
  };
}
function getElementValue(el) {
  return el.value ?? el.getAttribute('value') ?? '';
}

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