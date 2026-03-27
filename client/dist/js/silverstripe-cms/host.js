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
  constructor($, fluxState, onTriggerUpdate, hostChannel, onPatchUpdate) {
    this.$ = $;
    this.fluxState = fluxState;
    this.onTriggerUpdate = onTriggerUpdate;
    this.hostChannel = hostChannel;
    this.onPatchUpdate = onPatchUpdate;
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
          return;
        }
        let previousValue = element.value ?? "";
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
          /**
           * Trigger a templateUpdate when a field changes
           * from being empty to including text
           */
          if (type === "Text" && previousValue.trim().length === 0 && String(value).trim().length > 0 && !manager.hostChannel.isInlineEditInProgress) {
            type = "HTML";
          }
          previousValue = String(value);
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
  observeKeyProxyElement(element, binding) {
    let previousValue = null;
    let isFirstRun = true;
    let observeTarget = element;
    if (binding.proxyType === "previousElementSibling") {
      observeTarget = element.previousElementSibling ?? element;
    } else if (binding.proxyType === "nextElementSibling") {
      observeTarget = element.nextElementSibling ?? element;
    }
    const observer = new MutationObserver(() => {
      const proxiedElement = binding.proxyType === "nextElementSibling" ? element : observeTarget.querySelector(binding.proxySelector);
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
    if (!editor) return;
    let previousContent = editor.getContent() ?? "";
    const sendTextUpdate = () => {
      const currentEditor = window.tinymce.get(element.id);
      if (!currentEditor.hasFocus()) return;
      const content = currentEditor.getContent();
      if (content === previousContent) return;
      previousContent = content;
      // When shortcodes are present, use the editor body's innerHTML instead
      // — TinyMCE renders shortcodes as real DOM elements that morph smoothly.
      if (this.containsShortcode(content)) {
        this.hostChannel.broadcastMessage({
          type: "richTextUpdate",
          key: binding.key,
          owner: binding.owner,
          value: currentEditor.getBody().innerHTML
        });
        return;
      }
      this.hostChannel.broadcastMessage({
        type: "textUpdate",
        key: binding.key,
        owner: binding.owner,
        event: binding.event,
        value: content
      });
    };
    const sendPatchUpdate = () => {
      const currentEditor = window.tinymce.get(element.id);
      if (!currentEditor.hasFocus()) return;
      const content = currentEditor.getContent();
      if (content === previousContent) return;
      previousContent = content;
      document.querySelector(".flux-refresh__button")?.classList.toggle("hidden", false);
      this.fluxState.updateField(binding.key, content, {
        type: "HTML",
        owner: binding.owner ?? undefined
      });
      this.hostChannel.broadcastMessage({
        type: "richTextPatch",
        key: binding.key,
        owner: binding.owner,
        value: content
      });
      this.onPatchUpdate(binding.key, content, binding.owner);
    };
    editor.on("input", () => {
      sendTextUpdate();
    });
    editor.on("Change", e => {
      if (!e.originalEvent || e.originalEvent.type === "execcommand") {
        sendPatchUpdate();
      }
    });
  }
  containsShortcode(content) {
    return /\[[a-zA-Z_][\w]*\s[^\]]*\]/.test(content);
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
  return (key = "default") => {
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
    this.suppressModalUpdate = false;
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
    this.hostChannel.setOnFrameReady(() => {
      this.sendFluxConfigToIframe();
      if (Object.keys(this.fluxState.getChangeSet()).length > 0) {
        this.sendPageTemplateUpdate();
      }
    });
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
      mutations.forEach(mutation => {
        if (mutation.attributeName === "class") {
          callback(mutation.target);
        }
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
          if (this.suppressModalUpdate) {
            logger_1.logger.log("Modal closed — skipping update (TinyMCE handled)");
            this.suppressModalUpdate = false;
            return;
          }
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
  async sendPatchUpdate(key, value, owner) {
    if (!this.fluxState.getIsActive()) return;
    this.suppressModalUpdate = true;
    try {
      const response = await fetch(`${API_ENDPOINT}/shortCodesFragmentPatch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          key,
          value,
          owner
        })
      });
      if (!response.ok) {
        throw new Error(`Patch update failed: ${response.statusText}`);
      }
      const data = await response.json();
      this.hostChannel.broadcastMessage({
        type: "patchTemplateUpdate",
        key: data.key,
        owner: data.owner,
        value: data.html
      });
    } catch (error) {
      logger_1.logger.warn("Patch update failed, falling back to full update:", error);
      this.triggerUpdate(owner);
    }
  }
  setupFluxBindings() {
    const bindingManager = new FluxDirectiveManager_1.default(this.$, this.fluxState, owner => this.triggerUpdate(owner), this.hostChannel, (key, value, owner) => this.sendPatchUpdate(key, value, owner));
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