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
const DRAFT_GATED_TYPES = ['pageTemplateUpdate', 'blockUpdate', 'textUpdate', 'patchTemplateUpdate', 'richTextUpdate', 'richTextPatch'];
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
    this.previewingDraft = false;
    this.frameSelector = frameElement;
    if (!this.frame) {
      throw new Error(`iFrame cannot be found using ${frameElement}`);
    }
    this.createChannel();
    this.previewingDraft = this.computePreviewingDraft();
    this.readyHandler = event => {
      if (event.data.type === 'FRAME_READY' && event.origin === window.location.origin) {
        logger_1.logger.log("[channel] host received FRAME_READY — establishing channel");
        this.recreateChannel();
        this.previewingDraft = this.computePreviewingDraft();
        this.onFrameReady?.();
      }
    };
    window.addEventListener('message', this.readyHandler);
  }
  createChannel() {
    this.channelInstance = new MessageChannel();
    this.channelInstance.port1.onmessage = event => this.receiveMessageFromFrame(event);
    this.channelInstance.port1.onmessageerror = event => this.receiveMessageError(event);
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
  /**
   * Proactively establish the channel with a frame that is ALREADY loaded.
   *
   * `FRAME_READY` only helps when the frame announces itself after the host's
   * listener exists. On a direct refresh the parent's `window.load` (which
   * builds the host) fires AFTER the iframe has loaded and already posted
   * `FRAME_READY` — so the host misses it and the channel never forms. Calling
   * this on init covers that case; the `FRAME_READY` listener still covers
   * frames that (re)load later.
   */
  connectExistingFrame() {
    if (!this.frame?.contentWindow) return;
    logger_1.logger.log("[channel] host proactively connecting to an already-loaded frame");
    this.sendPortToFrame();
    this.previewingDraft = this.computePreviewingDraft();
    this.onFrameReady?.();
  }
  sendPortToFrame() {
    const frame = this.frame;
    const contentWindow = frame?.contentWindow;
    if (!contentWindow) {
      console.warn(`[channel] sendPortToFrame: no iframe contentWindow for ${this.frameSelector} — port handed to nothing`);
      return;
    }
    logger_1.logger.log(`[channel] host → frame: handing off Host:Create port to`, frame?.getAttribute('src'));
    contentWindow.postMessage({
      action: "Host:Create"
    }, window.location.origin, [this.channelInstance.port2]);
  }
  receiveMessageFromFrame(event) {
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
      case 'dragEventEnd':
        this.handleDragEventEnd(data);
        break;
      default:
        logger_1.logger.warn("HostChannel received unknown message type:", data.type);
    }
  }
  /**
   * Replay a frame-side drop as a GridFieldOrderableRows /reorder POST,
   * so any extension hooks the gridfield component fires on reorder run
   * just as they would for a native drag.
   */
  handleDragEventEnd(data) {
    const gridField = document.querySelector(`.grid-field[data-name="${data.key}"]`);
    if (!gridField) {
      logger_1.logger.warn(`HostChannel: no GridField for reorder data-name="${data.key}"`);
      return;
    }
    const reorderUrl = gridField.getAttribute('data-url-reorder');
    if (!reorderUrl) {
      logger_1.logger.warn(`HostChannel: GridField "${data.key}" has no data-url-reorder — is GridFieldOrderableRows installed with immediateUpdate?`);
      return;
    }
    const sortField = data.sortField ?? 'Sort';
    const gridName = data.key.replace(/\./g, '_');
    // Shape expected by GridFieldOrderableRows::getSortedIDs:
    //   { [gridName]: { GridFieldEditableColumns: { [id]: { [sortField]: <sortValue> } } } }
    const form = new FormData();
    data.orderedIds.forEach((id, index) => {
      form.append(`${gridName}[GridFieldEditableColumns][${id}][${sortField}]`, String(index + 1));
    });
    const securityID = document.querySelector('input[name="SecurityID"]')?.value;
    if (securityID) form.append('SecurityID', securityID);
    fetch(reorderUrl, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        'X-Pjax': 'CurrentField'
      },
      body: form
    }).then(response => {
      if (!response.ok) {
        logger_1.logger.warn(`Reorder POST → ${response.status}`);
      }
    }).catch(error => logger_1.logger.warn('Reorder POST failed:', error));
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
    // CMS navigation only makes sense in split mode — in preview mode the
    // form isn't visible, so the frame just staged the block instead.
    const cmsMode = this.currentCmsMode();
    // Non-inline blocks / DataObjects: navigate the CMS to the record's
    // CMSEditLink. This is the "Open ↗" behaviour from the matrix.
    if (data.inlineEditable === false && data.editLink && cmsMode === 'split') {
      logger_1.logger.log(`editBlockClick → navigating CMS to ${data.editLink}`);
      window.location.assign(data.editLink);
      return;
    }
    // In preview mode the frame is driving stage mode itself — nothing
    // for the host to do.
    if (cmsMode === 'preview') return;
    // Inline-editable blocks: open the nested element editor in the CMS
    // tree so the form fields become available to the live-update loop.
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
    // Each action has a list of fallback selectors because SilverStripe renders
    // GridField row buttons with varying classes / attribute names depending on
    // component and theme. We try the most specific marker first and fall back
    // to looser matches (href / name*) to catch legacy markup.
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
  currentCmsMode() {
    const c = document.querySelector('.cms-container');
    if (!c) return 'edit';
    if (c.classList.contains('cms-container--preview-mode')) return 'preview';
    if (c.classList.contains('cms-container--split-mode')) return 'split';
    return 'edit';
  }
  findCmsField(key, owner) {
    const selector = owner ? `[fx-key="${key}"][fx-owner="${owner}"]` : `[fx-key="${key}"]:not([fx-owner])`;
    return document.querySelector(selector);
  }
  receiveMessageError(event) {
    logger_1.logger.error("HostChannel reports error from FrameChannel:", event);
  }
  setOnFrameReady(callback) {
    this.onFrameReady = callback;
  }
  /**
   * Read the iframe's `src` and return whether it points at the Draft stage.
   * The result is cached in `this.previewingDraft` and refreshed on FRAME_READY,
   * so per-broadcast checks don't re-parse the URL.
   */
  computePreviewingDraft() {
    try {
      const src = this.frame?.getAttribute('src') || '';
      const params = new URLSearchParams(src.split('?')[1] || '');
      return params.get('stage') === 'Stage';
    } catch {
      return false;
    }
  }
  broadcastMessage(message) {
    if (this.inlineEditInProgress && message.type === 'textUpdate') {
      logger_1.logger.log(`Suppressing textUpdate echo for "${message.key}" during inline edit`);
      return;
    }
    if (DRAFT_GATED_TYPES.includes(message.type) && !this.previewingDraft) {
      logger_1.logger.log(`Suppressing ${message.type} — preview is not on Draft stage`);
      return;
    }
    if (message.type === 'textUpdate') {
      // If the preview iframe isn't in the DOM, this message goes into a
      // dead channel — the GridField detail form renders full-width with
      // no preview panel, so there's nothing to receive it. Surface that.
      if (!this.frame) {
        console.warn(`[flux] textUpdate posted but NO preview iframe is present ` + `(${this.frameSelector}). The detail form has no preview panel — nothing will receive this.`, message);
      } else {
        logger_1.logger.log(`[textUpdate] host → frame: posting (iframe present)`, message);
      }
    }
    this.channelInstance.port1.postMessage(message);
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

/***/ "./client/cms-live-updates/FluxApiClient.ts":
/*!**************************************************!*\
  !*** ./client/cms-live-updates/FluxApiClient.ts ***!
  \**************************************************/
/***/ (function(__unused_webpack_module, exports) {



Object.defineProperty(exports, "__esModule", ({
  value: true
}));
async function postJson(url, body, errorLabel) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(`${errorLabel} failed: ${response.statusText}`);
  }
  return response.json();
}
class FluxApiClient {
  constructor(apiEndpoint) {
    this.apiEndpoint = apiEndpoint;
  }
  sendPageUpdate(payload) {
    const url = `${this.apiEndpoint}/pageTemplateUpdate?pageID=${payload.pageID}`;
    return postJson(url, payload, "Template update");
  }
  sendBlockUpdate(payload, owner) {
    const url = `${this.apiEndpoint}/blockUpdate?pageID=${payload.pageID}&owner=${encodeURIComponent(owner)}`;
    return postJson(url, payload, "Block update");
  }
  sendPatchUpdate(key, value, owner) {
    const url = `${this.apiEndpoint}/shortCodesFragmentPatch`;
    return postJson(url, {
      key,
      value,
      owner
    }, "Patch update");
  }
  /**
   * Persist a chunked changeset via /flux/save. Server writes in
   * DataObject → Element → Page order inside a single transaction.
   * @TODO add a type rather than being lazy
   */
  async sendChunkedSave(payload) {
    const response = await fetch("/flux/save", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "X-SecurityID": window.FluxCsrf ?? ""
      },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    return result;
  }
}
exports["default"] = FluxApiClient;

/***/ }),

/***/ "./client/cms-live-updates/FluxBootstrap.ts":
/*!**************************************************!*\
  !*** ./client/cms-live-updates/FluxBootstrap.ts ***!
  \**************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {



/**
 * Bridges the v2 `window.FluxBootstrap` payload into the v1 `window.FluxConfig`
 * shape that FluxLiveState / FluxDirectiveManager already consume.
 *
 * Phase 2 keeps existing client modules unchanged. Phase 3 will drop the
 * FluxConfig shape entirely.
 */
Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports.adaptContextToFluxConfig = adaptContextToFluxConfig;
exports.applyContext = applyContext;
exports.applyInlineHostBootstrap = applyInlineHostBootstrap;
exports.currentContextHint = currentContextHint;
exports.applyPjaxBootstrapFromDom = applyPjaxBootstrapFromDom;
exports.fetchFluxContext = fetchFluxContext;
exports.fetchContextPayload = fetchContextPayload;
const logger_1 = __webpack_require__(/*! ../core/logger */ "./client/core/logger.ts");
/**
 * Convert a v2 context payload into the legacy FluxConfig shape.
 *
 * Preserves in-flight ChangeSet only when the same record is still being
 * edited (same page id + class). Switching records resets ChangeSet so we
 * don't misapply edits from page A onto a different record that happens to
 * share a class name.
 */
function adaptContextToFluxConfig(context) {
  const fields = {};
  const relationFields = {};
  for (const [className, slice] of Object.entries(context.schema)) {
    fields[className] = slice.Fields ?? {};
    relationFields[className] = slice.RelationFields ?? {};
  }
  const previous = window.FluxConfig;
  const previousPage = previous?.Segments?.find(s => s.Type === "Page");
  const nextPage = context.segments.find(s => s.Type === "Page");
  let changeSet = {};
  if (previousPage && nextPage && String(previousPage.ID) === String(nextPage.ID) && previousPage.ClassName === nextPage.ClassName) {
    changeSet = previous?.ChangeSet ?? {};
  }
  return {
    Segments: context.segments,
    Fields: fields,
    RelationFields: relationFields,
    ChangeSet: changeSet,
    Events: []
  };
}
function applyContext(context) {
  window.FluxConfig = adaptContextToFluxConfig(context);
  window.FluxScope = context.scope;
  logger_1.logger.log("Applied Flux context:", context.scope);
}
/**
 * Read the most-specific FluxBootstrap script tag in the document. When a
 * nested GridField item is being edited, both the LeftAndMain extension
 * and the GridFieldDetailForm extension push a `<script id="flux-bootstrap-data">`
 * into their respective forms — the inner one is later in DOM order and
 * should win.
 */
function readBootstrapScriptTag() {
  const nodes = document.querySelectorAll('script#flux-bootstrap-data');
  if (nodes.length === 0) return null;
  // Walk in reverse so the deepest (innermost form) wins.
  for (let i = nodes.length - 1; i >= 0; i--) {
    const txt = nodes[i].textContent;
    if (!txt) continue;
    try {
      return JSON.parse(txt);
    } catch {
      // try the next one
    }
  }
  return null;
}
/**
 * Host entry: read the inline bootstrap injected by the LeftAndMain or
 * GridFieldDetailForm extension. Returns the FluxConfig that was set,
 * or null if no context was present.
 */
function applyBootstrapPayload(payload) {
  if (payload.csrf) window.FluxCsrf = payload.csrf;
  if (payload.contextHint !== undefined) window.FluxContextHint = payload.contextHint;
  if (payload.inlineEditorEnabled !== undefined) window.FluxInlineEditorEnabled = payload.inlineEditorEnabled;
  applyContext(payload.context);
}
function applyInlineHostBootstrap() {
  const bootstrap = readBootstrapScriptTag() ?? window.FluxBootstrap ?? null;
  if (!bootstrap?.context) return null;
  applyBootstrapPayload(bootstrap);
  return window.FluxConfig ?? null;
}
/** Most-recent hint captured from a host-side bootstrap, for the host to ship to the frame. */
function currentContextHint() {
  return window.FluxContextHint ?? null;
}
/**
 * Host PJAX hook: read the FluxBootstrap from the most-specific
 * #flux-bootstrap-data <script> tag in the swapped form HTML.
 *
 * Standard CMS PJAX requests only fetch the CurrentForm/Content/Breadcrumbs
 * fragments — a custom fragment wouldn't be included — so the bootstrap
 * rides along inside the form HTML instead.
 */
function applyPjaxBootstrapFromDom() {
  const payload = readBootstrapScriptTag();
  if (!payload?.context) return false;
  applyBootstrapPayload(payload);
  return true;
}
/**
 * Preview-frame entry: fetch /flux/context with the params handed in by
 * the host (via the contextHint MessageChannel message). The frame can't
 * know which record/item is being edited on its own — only the CMS does.
 *
 * Resolves to the FluxConfig once applied.
 */
async function fetchFluxContext(hint) {
  const context = await fetchContextPayload(hint);
  if (!context) return null;
  applyContext(context);
  return window.FluxConfig ?? null;
}
/**
 * Fetch the context payload without applying it. Lets callers decide whether
 * to apply — the frame's boot fetch must not clobber a more-specific scope the
 * host may have pushed while the fetch was in flight.
 */
async function fetchContextPayload(hint) {
  const params = new URLSearchParams();
  params.set("class", hint.class);
  params.set("id", String(hint.id));
  if (hint.itemID) params.set("itemID", String(hint.itemID));
  if (hint.relation) params.set("relation", hint.relation);
  try {
    const response = await fetch(`/flux/context?${params.toString()}`, {
      credentials: "same-origin",
      headers: {
        Accept: "application/json"
      }
    });
    if (!response.ok) {
      logger_1.logger.warn("Flux context fetch failed:", response.status);
      return null;
    }
    return await response.json();
  } catch (error) {
    logger_1.logger.warn("Flux context fetch error:", error);
    return null;
  }
}

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
const FluxApiClient_1 = __importDefault(__webpack_require__(/*! ./FluxApiClient */ "./client/cms-live-updates/FluxApiClient.ts"));
const FluxBootstrap_1 = __webpack_require__(/*! ./FluxBootstrap */ "./client/cms-live-updates/FluxBootstrap.ts");
const FluxDirectiveManager_1 = __importDefault(__webpack_require__(/*! ./directives/FluxDirectiveManager */ "./client/cms-live-updates/directives/FluxDirectiveManager.ts"));
const FluxLiveState_1 = __importDefault(__webpack_require__(/*! ./FluxLiveState */ "./client/cms-live-updates/FluxLiveState.ts"));
const API_ENDPOINT = "/flux";
const CMS_FRAME = 'iframe[name="cms-preview-iframe"]';
const PAGE_COOLDOWN_MS = 500;
const BLOCK_COOLDOWN_MS = 500;
/**
 * Returns a predicate that reports whether a given key has "cooled down" since
 * its last allowed call. Calling the predicate updates the last-call time.
 */
function createCooldownGate(ms) {
  const lastCalled = new Map();
  return (key = "default") => {
    const now = Date.now();
    if (now - (lastCalled.get(key) ?? 0) < ms) return false;
    lastCalled.set(key, now);
    return true;
  };
}
class FluxHostCoordinator {
  constructor(url, $) {
    this.$ = $;
    this.pageReady = createCooldownGate(PAGE_COOLDOWN_MS);
    this.blockReady = createCooldownGate(BLOCK_COOLDOWN_MS);
    this.observers = [];
    this.suppressModalUpdate = false;
    this.hostChannel = new HostChannel_1.default(url, CMS_FRAME);
    this.fluxState = new FluxLiveState_1.default();
    this.api = new FluxApiClient_1.default(API_ENDPOINT);
  }
  initialize() {
    this.setupFrameReadyHandler();
    this.setupSplitModeObserver();
    this.setupModalObserver();
    this.setupFluxBindings();
    this.setupPjaxHandler();
    // The frame may have loaded (and posted FRAME_READY) before this host
    // existed — e.g. on a direct refresh, where window.load fires after the
    // iframe. Connect to it now so we don't sit on a dead channel.
    this.hostChannel.connectExistingFrame();
  }
  currentMode() {
    const cmsContainer = document.querySelector(".cms-container");
    if (!cmsContainer) {
      return "edit";
    }
    if (cmsContainer.classList.contains("cms-container--preview-mode")) {
      return "preview";
    }
    if (cmsContainer.classList.contains("cms-container--split-mode")) {
      return "split";
    }
    return "edit";
  }
  broadcastMode() {
    this.hostChannel.broadcastMessage({
      type: "modeChange",
      mode: this.currentMode()
    });
  }
  setupFrameReadyHandler() {
    this.hostChannel.setOnFrameReady(() => {
      this.sendContextHintToIframe();
      this.broadcastMode();
      this.sendPageUpdateIfChanged();
    });
  }
  /**
   * Provides a hint to the frame what the active record is, its relation
   * This can then be used to fetch additional information based on its scope and state
   */
  sendContextHintToIframe() {
    const hint = (0, FluxBootstrap_1.currentContextHint)();
    if (!hint) {
      logger_1.logger.warn("No context hint available to send to iframe");
      return;
    }
    this.hostChannel.broadcastMessage({
      type: "contextHint",
      class: hint.class,
      id: hint.id,
      itemID: hint.itemID ?? null,
      relation: hint.relation ?? null
    });
  }
  sendPageUpdateIfChanged() {
    if (this.fluxState.hasChanges()) {
      this.sendPageTemplateUpdate();
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
      mutations.forEach(mutation => {
        callback(mutation.target);
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
    let lastMode = this.currentMode();
    this.fluxState.setLiveStateActive(lastMode !== "edit");
    const observer = this.observeClassAttribute(cmsContainer, () => {
      const mode = this.currentMode();
      if (mode === lastMode) return;
      /**
       * Because we are keeping the changes, when switching to a mode with "preview"
       * We apply the config and draft state to match
       */
      if (lastMode === "edit" && mode !== "edit") {
        this.fluxState.setLiveStateActive(true);
        this.sendFluxConfigToIframe();
        this.sendPageUpdateIfChanged();
      } else if (mode === "edit") {
        this.fluxState.setLiveStateActive(false);
      }
      lastMode = mode;
      this.broadcastMode();
    });
    this.observers.push(observer);
  }
  /**
   * A workaround for Modals, when a model is closed we treat these as a 'templateUpdate' event
   * So that if we have a Link / Image etc. Its re-rendered in the preview panel
   * @returns
   */
  setupModalObserver() {
    const bodyElement = document.body;
    if (!bodyElement) return;
    const observer = this.observeClassAttribute(bodyElement, target => {
      if (target.classList.contains("modal-open")) {
        logger_1.logger.log("Modal opened");
        return;
      }
      window.setTimeout(() => {
        if (this.suppressModalUpdate) {
          logger_1.logger.log("Modal closed — skipping update (TinyMCE handled)");
          this.suppressModalUpdate = false;
          return;
        }
        logger_1.logger.log("Modal closed");
        this.sendPageTemplateUpdate();
      }, 500);
    });
    this.observers.push(observer);
  }
  async sendPageTemplateUpdate() {
    if (!this.pageReady()) {
      logger_1.logger.log("Still in cooldown, skipping update");
      return;
    }
    try {
      const payload = this.fluxState.toPageUpdatePayload();
      const response = await this.api.sendPageUpdate(payload);
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
        for (const [id, html] of Object.entries(Elements)) {
          this.hostChannel.broadcastMessage({
            type: "blockUpdate",
            html,
            targetOwner: `#e${id}`
          });
        }
      }
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
      const payload = this.fluxState.toBlockUpdatePayload(owner);
      const response = await this.api.sendBlockUpdate(payload, owner);
      if (!response.trusted) {
        logger_1.logger.warn("Block update returned unsafe html");
      }
      logger_1.logger.log(`Morphing block: ${owner}`);
      this.hostChannel.broadcastMessage({
        type: "blockUpdate",
        html: response.html,
        targetOwner: owner
      });
    } catch (error) {
      logger_1.logger.warn("Block update failed, falling back to full page update:", error);
      this.sendPageTemplateUpdate();
    }
  }
  triggerUpdate(owner) {
    if (!this.fluxState.getIsActive()) return;
    if (owner) {
      this.sendBlockUpdate(owner);
      return;
    }
    this.sendPageTemplateUpdate();
  }
  /**
   * Part of the 'Inline' preview ui work.
   * Sends all the draft state and will iterate through the blocks and save them in a single transaction.
   *
   * @TODO not yet final
   */
  async saveChunked() {
    const payload = this.fluxState.getChunkedSavePayload();
    if (payload.chunks.length === 0) {
      return {
        ok: true,
        saved: [],
        errors: []
      };
    }
    const result = await this.api.sendChunkedSave(payload);
    if (result.ok) {
      this.fluxState.clear();
      this.sendPageTemplateUpdate();
      return result;
    }
    logger_1.logger.warn("Chunked save failed:", result.errors);
    return result;
  }
  async sendPatchUpdate(key, value, owner) {
    if (!this.fluxState.getIsActive()) return;
    this.suppressModalUpdate = true;
    try {
      const data = await this.api.sendPatchUpdate(key, value, owner);
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
  /**
   * Wait so the swapped html contains the new script so we can apply the bootstrapping information
   */
  setupPjaxHandler() {
    this.$(document).on("ajaxComplete", () => {
      requestAnimationFrame(() => {
        if (!(0, FluxBootstrap_1.applyPjaxBootstrapFromDom)()) return;
        this.sendContextHintToIframe();
      });
    });
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



Object.defineProperty(exports, "__esModule", ({
  value: true
}));
/**
 * FluxLiveState — in-memory form field state for live CMS preview updates.
 *
 * Uses FluxConfig.ChangeSet (keyed by ClassName) as the single source of truth
 * for field changes. Segments provides the structural map of the page.
 */
const logger_1 = __webpack_require__(/*! ../core/logger */ "./client/core/logger.ts");
class FluxLiveState {
  constructor() {
    this.isLiveStateActive = true;
    this.pageIDOverride = null;
    this.classNameOverride = null;
  }
  getConfig() {
    if (typeof window !== "undefined" && window.FluxConfig) {
      return window.FluxConfig;
    }
    return null;
  }
  get segments() {
    return this.getConfig()?.Segments ?? [];
  }
  get pageID() {
    if (this.pageIDOverride !== null) return this.pageIDOverride;
    const page = this.segments.find(s => s.Type === "Page");
    return page?.ID ? Number(page.ID) : null;
  }
  get className() {
    if (this.classNameOverride !== null) return this.classNameOverride;
    return this.segments.find(s => s.Type === "Page")?.ClassName ?? null;
  }
  updateField(key, value, options) {
    const segment = options?.owner ? this.segments.find(s => s.owner === options.owner) : this.segments.find(s => s.Type === "Page");
    const resolvedClassName = segment?.ClassName || "";
    const config = this.getConfig();
    if (config && resolvedClassName) {
      // PHP sometimes serialises an empty ChangeSet as `[]` — normalise to `{}`.
      if (Array.isArray(config.ChangeSet)) {
        config.ChangeSet = {};
      }
      if (!config.ChangeSet[resolvedClassName]) {
        config.ChangeSet[resolvedClassName] = {};
      }
      config.ChangeSet[resolvedClassName][key] = value;
    }
    if (true) {
      window.FluxLiveState = this;
    }
  }
  getChangeSet() {
    const config = this.getConfig();
    return config?.ChangeSet || {};
  }
  hasChanges() {
    return Object.keys(this.getChangeSet()).length > 0;
  }
  clear() {
    const config = this.getConfig();
    if (config) {
      config.ChangeSet = {};
    }
  }
  /**
   * Returns the ChangeSet structured by segment Type for the API:
   *   "Page": { ClassName, ID, fields }
   *   "Element": [{ ClassName, ID, fields }, ...]
   */
  getChangeSetPayload() {
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
      if (segment.Type === "Page") {
        payload["Page"] = entry;
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
   * Full-page update payload. Throws if we don't yet know the page id.
   */
  toPageUpdatePayload() {
    if (this.pageID === null) {
      throw new Error("Missing page id");
    }
    return {
      pageID: this.pageID,
      className: this.className,
      changeSet: this.getChangeSetPayload()
    };
  }
  /**
   * Block-scoped update payload, filtered to the given owner's segment.
   */
  toBlockUpdatePayload(owner) {
    const segment = this.segments.find(s => s.owner === owner);
    if (!segment) {
      throw new Error(`No segment found for owner: ${owner}`);
    }
    const fields = this.getChangeSet()[segment.ClassName];
    if (!fields || Object.keys(fields).length === 0) {
      throw new Error(`No changes found for owner: ${owner}`);
    }
    if (this.pageID === null) {
      throw new Error("Missing page id");
    }
    return {
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
  }
  getSegments() {
    return this.segments;
  }
  /**
   * Build a chunked save payload for saving.
   * matches each ClassName to its segment, and emits one chunk per Type, Classname, ID
   */
  getChunkedSavePayload() {
    const changeSet = this.getChangeSet();
    const chunks = [];
    for (const segment of this.segments) {
      const fields = changeSet[segment.ClassName];
      if (!fields || Object.keys(fields).length === 0) continue;
      chunks.push({
        kind: segment.Type === "Page" || segment.Type === "Element" ? segment.Type : "DataObject",
        class: segment.ClassName,
        id: Number(segment.ID),
        fields
      });
    }
    return {
      context: {
        pageId: this.pageID,
        pageClass: this.className
      },
      chunks
    };
  }
  getElements() {
    return this.segments.filter(s => s.Type === "Element");
  }
  setPageID(pageID) {
    this.pageIDOverride = pageID;
  }
  setClassName(className) {
    this.classNameOverride = className;
  }
  setLiveStateActive(isActive) {
    this.isLiveStateActive = isActive;
  }
  getIsActive() {
    return this.isLiveStateActive;
  }
  debug() {
    logger_1.logger.log("FluxLiveState:", {
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

/***/ "./client/cms-live-updates/directives/FluxDirectiveManager.ts":
/*!********************************************************************!*\
  !*** ./client/cms-live-updates/directives/FluxDirectiveManager.ts ***!
  \********************************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {



Object.defineProperty(exports, "__esModule", ({
  value: true
}));
const logger_1 = __webpack_require__(/*! ../../core/logger */ "./client/core/logger.ts");
const FluxDirectives_1 = __webpack_require__(/*! ./FluxDirectives */ "./client/cms-live-updates/directives/FluxDirectives.ts");
function shouldUpgradeToHtml(previous, next, inlineEditActive) {
  if (inlineEditActive) return false;
  return previous.trim().length === 0 && String(next).trim().length > 0;
}
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
    });
  }
  setupKeyBindings($) {
    const manager = this;
    $("[fx-key]").entwine({
      onmatch: function () {
        const element = this[0];
        const binding = (0, FluxDirectives_1.fromElement)(element);
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
          previousValue = manager.handleInputChange(listenerEvent, element, binding, previousValue);
        });
      }
    });
  }
  handleInputChange(listenerEvent, element, binding, previousValue) {
    let value;
    let rawType;
    if (binding.collectSelector) {
      value = Array.from(element.querySelectorAll(binding.collectSelector)).map(el => el.value);
      rawType = "HTML";
    } else {
      ({
        value,
        type: rawType
      } = this.extractEventData(listenerEvent, binding.event, element));
    }
    // Upgrade Text → HTML when a field transitions from empty to non-empty,
    // so a full template re-render is triggered instead of a text patch.
    let type = rawType;
    if (rawType === "Text" && shouldUpgradeToHtml(previousValue, value, this.hostChannel.isInlineEditInProgress)) {
      type = "HTML";
    }
    const nextPreviousValue = String(value);
    this.fluxState.updateField(binding.key, value, {
      type,
      owner: binding.owner ?? undefined
    });
    logger_1.logger.log(`[textUpdate] host input change: key="${binding.key}" owner="${binding.owner}" type="${type}" active=${this.fluxState.getIsActive()}`, value);
    if (!this.fluxState.getIsActive()) return nextPreviousValue;
    if (type === "Text") {
      this.hostChannel.broadcastMessage({
        type: "textUpdate",
        key: binding.key,
        owner: binding.owner,
        event: binding.event,
        value
      });
      return nextPreviousValue;
    }
    this.onTriggerUpdate(binding.owner);
    return nextPreviousValue;
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
      const proxiedElement = observeTarget.querySelector(binding.proxySelector);
      if (!proxiedElement) return;
      const currentValue = (0, FluxDirectives_1.getElementValue)(proxiedElement);
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
    const getChangedContent = () => {
      const ed = window.tinymce.get(element.id);
      if (!ed?.hasFocus()) return null;
      const content = ed.getContent();
      if (content === previousContent) return null;
      previousContent = content;
      return {
        editor: ed,
        content
      };
    };
    const sendTextUpdate = () => {
      const result = getChangedContent();
      if (!result) return;
      const {
        editor: ed,
        content
      } = result;
      // When shortcodes are present, use the editor body's innerHTML instead
      // — TinyMCE renders shortcodes as real DOM elements that morph smoothly.
      if (this.containsShortcode(content)) {
        this.hostChannel.broadcastMessage({
          type: "richTextUpdate",
          key: binding.key,
          owner: binding.owner,
          value: ed.getBody().innerHTML
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
      const result = getChangedContent();
      if (!result) return;
      const {
        content
      } = result;
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
      if (element.getAttribute("fx-event-type") === "templateUpdate" || value.length < 1) {
        type = "HTML";
      } else {
        type = "Text";
      }
    } else if (eventType === "click") {
      value = target.checked;
      type = "HTML";
    } else if (eventType === "change") {
      value = target.type === "checkbox" ? target.checked : target.value;
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

/***/ "./client/cms-live-updates/directives/FluxDirectives.ts":
/*!**************************************************************!*\
  !*** ./client/cms-live-updates/directives/FluxDirectives.ts ***!
  \**************************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {



Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports.fromElement = fromElement;
exports.getElementValue = getElementValue;
exports.parse = parse;
exports.applyConfig = applyConfig;
const logger_1 = __webpack_require__(/*! ../../core/logger */ "./client/core/logger.ts");
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
function parse(root = document) {
  return Array.from(root.querySelectorAll('[fx-key]')).map(el => fromElement(el)).filter(d => d !== null);
}
function applyConfig(config) {
  const {
    Segments,
    Fields,
    RelationFields
  } = config;
  if (!Segments) return;
  for (const segment of Segments) {
    applySegmentFields(segment, Fields?.[segment.ClassName]);
    applySegmentRelations(segment, RelationFields?.[segment.ClassName]);
    applyOwnerEditLink(segment);
  }
}
function applyOwnerEditLink(segment) {
  const editLink = segment.editLink;
  if (!editLink || !segment.owner) return;
  let ownerEl = null;
  try {
    ownerEl = document.querySelector(segment.owner);
  } catch {
    return;
  }
  if (ownerEl) {
    ownerEl.setAttribute("fx-edit-link", editLink);
  }
}
function applySegmentFields(segment, segmentFields) {
  if (!segmentFields) return;
  for (const [, field] of Object.entries(segmentFields)) {
    const parts = segment.owner ? [segment.owner, field.bind] : [field.bind];
    const selector = parts.join(' ');
    let element = null;
    try {
      element = document.querySelector(selector);
    } catch {
      logger_1.logger.warn(`Flux: invalid selector for ${field.key}: ${selector} (relation-item fields are stamped via relation config)`);
      continue;
    }
    if (!element) {
      logger_1.logger.warn(`Flux: Cannot find element for: ${field.key} with selector: ${selector}`);
      continue;
    }
    element.setAttribute('fx-key', field.key);
    element.setAttribute('fx-type', field.type);
    if (segment.owner) element.setAttribute('fx-owner', segment.owner);
  }
}
function applySegmentRelations(_segment, segmentRelationFields) {
  if (!segmentRelationFields) return;
  for (const [relationName, relationField] of Object.entries(segmentRelationFields)) {
    if (relationField.idMap) {
      applyRelationById(relationName, relationField);
    } else {
      applyRelationByIndex(relationName, relationField);
    }
    applyRelationDropZone(relationName, relationField);
  }
}
function applyRelationDropZone(relationName, relationField) {
  if (!relationField.sortable || !relationField.dropZone) return;
  let zone = null;
  try {
    zone = document.querySelector(relationField.dropZone);
  } catch {
    logger_1.logger.warn(`Flux: invalid dropZone selector for ${relationName}: ${relationField.dropZone}`);
    return;
  }
  if (!zone) {
    logger_1.logger.warn(`Flux: dropZone element not found for ${relationName}: ${relationField.dropZone}`);
    return;
  }
  zone.setAttribute('fx-sortable', '');
  zone.setAttribute('fx-grid-name', relationName);
  zone.setAttribute('fx-grid-item-selector', relationField.selector);
  if (relationField.sortField) {
    zone.setAttribute('fx-grid-sort-field', relationField.sortField);
  }
}
function applyRelationById(relationName, relationField) {
  for (const [id, selector] of Object.entries(relationField.idMap)) {
    const el = document.querySelector(selector);
    if (!el) {
      logger_1.logger.warn(`Flux: Cannot find element for ${relationName} ID ${id} with selector: ${selector}`);
      continue;
    }
    applyRelationAttributes(el, id, relationName, relationField);
  }
}
function applyRelationByIndex(relationName, relationField) {
  if (!relationField.selector) {
    logger_1.logger.warn(`Flux: RelationField ${relationName} is missing a selector`);
    return;
  }
  const els = Array.from(document.querySelectorAll(relationField.selector));
  els.forEach((el, index) => {
    const id = relationField.ids?.[index];
    if (id === undefined) {
      logger_1.logger.warn(`Flux: no record ID for ${relationName}[${index}] — DOM and relation may be out of sync`);
      return;
    }
    applyRelationAttributes(el, String(id), relationName, relationField);
  });
}
function applyRelationAttributes(el, owner, relationName, relationField) {
  el.setAttribute('fx-type', 'GridField');
  el.setAttribute('fx-key', relationName);
  el.setAttribute('fx-grid-actions', JSON.stringify(relationField.actions));
  el.setAttribute('fx-owner', owner);
  if (!relationField.Fields) return;
  for (const [fieldName, fieldConfig] of Object.entries(relationField.Fields)) {
    const childEl = el.querySelector(fieldConfig.bind);
    if (!childEl) {
      logger_1.logger.warn(`Flux: Cannot find element for ${relationName}.${fieldName} with selector: ${fieldConfig.bind}`);
      continue;
    }
    childEl.setAttribute('fx-key', fieldName);
    childEl.setAttribute('fx-type', fieldConfig.type);
    childEl.setAttribute('fx-owner', owner);
  }
}

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
const FluxBootstrap_1 = __webpack_require__(/*! ./FluxBootstrap */ "./client/cms-live-updates/FluxBootstrap.ts");
window.addEventListener("load", function () {
  (0, FluxBootstrap_1.applyInlineHostBootstrap)();
  const coordinator = new FluxHostCoordinator_1.default(window.location.origin, window.jQuery);
  coordinator.initialize();
});

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