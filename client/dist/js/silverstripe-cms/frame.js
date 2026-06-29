/******/ (function() { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ "./client/channels/FrameChannel.ts":
/*!*****************************************!*\
  !*** ./client/channels/FrameChannel.ts ***!
  \*****************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", ({
  value: true
}));
const logger_1 = __webpack_require__(/*! ../core/logger */ "./client/core/logger.ts");
/**
 * FrameChannel can implement the onReceivedMessage either in the constructor, or via frame.onReceivedMessage
 *
 * @example client/cms-live-updates/frame.ts
 */
class FrameChannel {
  constructor(onReceivedMessage) {
    this.channel = null;
    this.messageHandler = event => this.setupMessageEvents(event);
    window.addEventListener("message", this.messageHandler);
    // Set the default handler or use the one passed in
    this.onReceivedMessage = onReceivedMessage || this.defaultMessageHandler.bind(this);
    // Signal to parent that frame is ready (handles both initial load and reloads)
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
   * Fallback if the FrameChannel implementation doesnt include custom `onReceivedMessage` handler
   * @param event
   */
  defaultMessageHandler(event) {
    logger_1.logger.log('Message called doing nothing', event);
  }
}
exports["default"] = FrameChannel;

/***/ }),

/***/ "./client/cms-live-updates/FluxBootstrap.ts":
/*!**************************************************!*\
  !*** ./client/cms-live-updates/FluxBootstrap.ts ***!
  \**************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";


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

/***/ "./client/cms-live-updates/directives/FluxDirectives.ts":
/*!**************************************************************!*\
  !*** ./client/cms-live-updates/directives/FluxDirectives.ts ***!
  \**************************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";


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

/***/ "./client/cms-live-updates/frame.ts":
/*!******************************************!*\
  !*** ./client/cms-live-updates/frame.ts ***!
  \******************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";


var __importDefault = this && this.__importDefault || function (mod) {
  return mod && mod.__esModule ? mod : {
    "default": mod
  };
};
Object.defineProperty(exports, "__esModule", ({
  value: true
}));
const FrameChannel_1 = __importDefault(__webpack_require__(/*! ../channels/FrameChannel */ "./client/channels/FrameChannel.ts"));
// @ts-expect-error -- idiomorph ships no type declarations
const idiomorph_1 = __importDefault(__webpack_require__(/*! idiomorph */ "./node_modules/idiomorph/dist/idiomorph.cjs.js"));
const logger_1 = __webpack_require__(/*! ../core/logger */ "./client/core/logger.ts");
const FluxDirectives_1 = __webpack_require__(/*! ./directives/FluxDirectives */ "./client/cms-live-updates/directives/FluxDirectives.ts");
const InlineEditor_1 = __webpack_require__(/*! ../preview/InlineEditor */ "./client/preview/InlineEditor.ts");
const FluxBootstrap_1 = __webpack_require__(/*! ./FluxBootstrap */ "./client/cms-live-updates/FluxBootstrap.ts");
const beforeNodeMorphed = oldNode => oldNode.tagName !== 'SCRIPT';
function fxSelector(msg) {
  if (msg.owner) {
    return `[fx-owner="${msg.owner}"][fx-key="${msg.key}"]`;
  }
  return `[fx-key="${msg.key}"]`;
}
function isActivelyEditing(msg) {
  const editingId = `${msg.key}|${msg.owner ?? ''}`;
  return InlineEditor_1.activeEditingFields.has(editingId);
}
const frame = new FrameChannel_1.default();
function inlineEditorEnabled() {
  return window.FluxInlineEditorEnabled === true;
}
// we re-apply the fx-* directives after morphing the DOM
function afterMorph() {
  if (!window.FluxConfig) {
    logger_1.logger.warn("afterMorph: no FluxConfig yet — fx-* not re-applied.");
    return;
  }
  (0, FluxDirectives_1.applyConfig)(window.FluxConfig);
  if (inlineEditorEnabled()) (0, InlineEditor_1.initInlineEditing)(frame.channel);
}
/**
 * Find an fx-key element for the message. Warns if missing and
 * skips updates that would clobber a field the user is actively editing.
 */
function findFxTarget(msg, kind) {
  const selector = fxSelector(msg);
  const element = document.querySelector(selector);
  if (!element) {
    console.warn(`[findFxDirective] ${kind} DROPPED: no element matched ${selector}`, msg);
    return null;
  }
  if (isActivelyEditing(msg)) {
    console.warn(`[findFxDirective] ${kind} SKIPPED: "${msg.key}|${msg.owner ?? ''}" is in activeEditingFields ` + `(a preview inline-edit focus that never blurred). selector=${selector}`, msg);
    return null;
  }
  return element;
}
function handlePageTemplateUpdate(msg) {
  logger_1.logger.log('Morphing document with new HTML...');
  logger_1.logger.time('morph');
  const newDoc = new DOMParser().parseFromString(msg.html, 'text/html');
  idiomorph_1.default.morph(document.documentElement, newDoc.documentElement, {
    head: {
      style: 'morph'
    },
    callbacks: {
      beforeNodeMorphed
    }
  });
  logger_1.logger.log('[morphing] Document morphed successfully');
  logger_1.logger.timeEnd('morph');
  afterMorph();
}
function handleBlockUpdate(msg) {
  const ownerElement = document.querySelector(msg.targetOwner);
  if (!ownerElement) {
    logger_1.logger.warn(`Block owner element not found: ${msg.targetOwner}`);
    return;
  }
  logger_1.logger.log(`Morphing block: ${msg.targetOwner}`);
  logger_1.logger.time('blockMorph');
  idiomorph_1.default.morph(ownerElement, msg.html, {
    morphStyle: 'innerHTML',
    callbacks: {
      beforeNodeMorphed
    }
  });
  logger_1.logger.log('Block morphed successfully');
  logger_1.logger.timeEnd('blockMorph');
  afterMorph();
}
function handlePatchTemplateUpdate(msg) {
  const selector = fxSelector(msg);
  const element = document.querySelector(selector);
  if (!element) {
    logger_1.logger.warn(`[patchTemplateUpdate]: element not found for ${selector}`);
    return;
  }
  element.innerHTML = msg.value;
  logger_1.logger.log(`[patchTemplateUpdate] Patched element ${selector}`);
}
function handleRichTextUpdate(msg) {
  const element = findFxTarget(msg, msg.type);
  if (!element) return;
  idiomorph_1.default.morph(element, msg.value, {
    morphStyle: 'innerHTML',
    callbacks: {
      beforeNodeMorphed
    }
  });
  logger_1.logger.log(`Morphed ${msg.type} [fx-key="${msg.key}"]`);
}
function handleTextUpdate(msg) {
  logger_1.logger.log(`[textUpdate] frame received: key="${msg.key}" owner="${msg.owner}" selector="${fxSelector(msg)}"`);
  const element = findFxTarget(msg, 'textUpdate');
  if (!element) return;
  element.textContent = msg.value;
  logger_1.logger.log(`[textUpdate] frame applied to [fx-key="${msg.key}"]`);
}
const handlers = {
  pageTemplateUpdate: handlePageTemplateUpdate,
  blockUpdate: handleBlockUpdate,
  patchTemplateUpdate: handlePatchTemplateUpdate,
  richTextUpdate: handleRichTextUpdate,
  richTextPatch: handleRichTextUpdate,
  textUpdate: handleTextUpdate
};
function updateElement(msg) {
  logger_1.logger.log('Flux message received:', msg);
  const handler = handlers[msg.type];
  if (!handler) {
    logger_1.logger.warn('Unknown message type or missing data:', msg);
    return;
  }
  handler(msg);
}
// The host's pushes carry the authoritative scope (it knows whether a block or
// relation item is being edited). Once one lands, the frame's own boot fetch
// (page-scoped, see bootstrapFrameContext) must not clobber it.
let hostContextApplied = false;
frame.onReceivedMessage = async event => {
  if (event.data.type === 'contextHint') {
    // Host telling us which slice of /flux/context to load. Fetch + apply.
    logger_1.logger.log('contextHint from host:', event.data);
    hostContextApplied = true;
    await (0, FluxBootstrap_1.fetchFluxContext)(event.data);
    if (window.FluxConfig) {
      (0, FluxDirectives_1.applyConfig)(window.FluxConfig);
      if (inlineEditorEnabled()) (0, InlineEditor_1.initInlineEditing)(frame.channel);
    }
    return;
  }
  if (event.data.type === 'configUpdate') {
    // Direct push from host (used when we already have a config in hand
    // and want to skip the extra round-trip — chunked save flow, etc.).
    hostContextApplied = true;
    window.FluxConfig = event.data.config;
    logger_1.logger.log('FluxConfig pushed from host:', window.FluxConfig);
    (0, FluxDirectives_1.applyConfig)(window.FluxConfig);
    if (inlineEditorEnabled()) (0, InlineEditor_1.initInlineEditing)(frame.channel);
    return;
  }
  if (event.data.type === 'modeChange') {
    window.FluxMode = event.data.mode;
    logger_1.logger.log('CMS mode:', event.data.mode);
    if (window.FluxConfig && inlineEditorEnabled()) (0, InlineEditor_1.initInlineEditing)(frame.channel);
    return;
  }
  updateElement(event.data);
};
function bootstrapFrameContext() {
  const context = window.FluxFrameContext;
  if (!context) return;
  if (hostContextApplied) {
    logger_1.logger.log('Inline frame context present, but host scope already applied — keeping host scope.');
    return;
  }
  (0, FluxBootstrap_1.applyContext)(context);
  if (window.FluxConfig) {
    (0, FluxDirectives_1.applyConfig)(window.FluxConfig);
    if (inlineEditorEnabled()) (0, InlineEditor_1.initInlineEditing)(frame.channel);
  }
}
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', bootstrapFrameContext, {
    once: true
  });
} else {
  bootstrapFrameContext();
}

/***/ }),

/***/ "./client/core/logger.ts":
/*!*******************************!*\
  !*** ./client/core/logger.ts ***!
  \*******************************/
/***/ (function(__unused_webpack_module, exports) {

"use strict";


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

/***/ }),

/***/ "./client/preview/FluxBlockState.ts":
/*!******************************************!*\
  !*** ./client/preview/FluxBlockState.ts ***!
  \******************************************/
/***/ (function(__unused_webpack_module, exports) {

"use strict";


/**
 * Tracks which Flux blocks/relations are currently "open" for inline editing,
 * and notifies subscribers when that set changes.
 *
 * A block is identified by its `fx-owner` selector (e.g. `#e42`).
 * Replaces the ad-hoc `openBlocks` Set that used to live inside InlineEditor.
 */
Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports.blockState = void 0;
class FluxBlockState {
  constructor() {
    this.open = new Set();
    this.listeners = new Set();
  }
  isOpen(owner) {
    return this.open.has(owner);
  }
  activeOwner() {
    // We currently allow only one open block at a time — the most-recently
    // opened wins. If multiple need to coexist, fan out the listeners.
    const it = this.open.values();
    let last = null;
    for (const owner of it) last = owner;
    return last;
  }
  openBlock(owner) {
    // Close everything else so only one block is on the stage at a time.
    for (const existing of [...this.open]) {
      if (existing !== owner) this.closeBlock(existing);
    }
    if (this.open.has(owner)) return;
    this.open.add(owner);
    this.emit({
      owner,
      open: true
    });
  }
  closeBlock(owner) {
    if (!this.open.delete(owner)) return;
    this.emit({
      owner,
      open: false
    });
  }
  toggle(owner) {
    if (this.open.has(owner)) {
      this.closeBlock(owner);
      return false;
    }
    this.openBlock(owner);
    return true;
  }
  closeAll() {
    for (const owner of [...this.open]) this.closeBlock(owner);
  }
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  emit(event) {
    for (const listener of this.listeners) listener(event);
  }
}
exports.blockState = new FluxBlockState();

/***/ }),

/***/ "./client/preview/FluxElements.ts":
/*!****************************************!*\
  !*** ./client/preview/FluxElements.ts ***!
  \****************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports.FluxUploadOverlay = exports.FluxLinkOverlay = exports.FluxInlineHandle = exports.FluxEditOpenButton = exports.FluxActionToolbar = void 0;
exports.registerFluxElements = registerFluxElements;
const FluxActionToolbar_1 = __webpack_require__(/*! ./overlays/FluxActionToolbar */ "./client/preview/overlays/FluxActionToolbar.ts");
Object.defineProperty(exports, "FluxActionToolbar", ({
  enumerable: true,
  get: function () {
    return FluxActionToolbar_1.FluxActionToolbar;
  }
}));
const FluxEditOpenButton_1 = __webpack_require__(/*! ./overlays/FluxEditOpenButton */ "./client/preview/overlays/FluxEditOpenButton.ts");
Object.defineProperty(exports, "FluxEditOpenButton", ({
  enumerable: true,
  get: function () {
    return FluxEditOpenButton_1.FluxEditOpenButton;
  }
}));
const FluxInlineHandle_1 = __webpack_require__(/*! ./overlays/FluxInlineHandle */ "./client/preview/overlays/FluxInlineHandle.ts");
Object.defineProperty(exports, "FluxInlineHandle", ({
  enumerable: true,
  get: function () {
    return FluxInlineHandle_1.FluxInlineHandle;
  }
}));
const FluxLinkOverlay_1 = __webpack_require__(/*! ./overlays/FluxLinkOverlay */ "./client/preview/overlays/FluxLinkOverlay.ts");
Object.defineProperty(exports, "FluxLinkOverlay", ({
  enumerable: true,
  get: function () {
    return FluxLinkOverlay_1.FluxLinkOverlay;
  }
}));
const FluxUploadOverlay_1 = __webpack_require__(/*! ./overlays/FluxUploadOverlay */ "./client/preview/overlays/FluxUploadOverlay.ts");
Object.defineProperty(exports, "FluxUploadOverlay", ({
  enumerable: true,
  get: function () {
    return FluxUploadOverlay_1.FluxUploadOverlay;
  }
}));
/**
 * Register every Flux overlay Custom Element exactly once. Safe to call
 * multiple times — `customElements.get(tag)` guards against re-registration
 * (which would otherwise throw).
 */
function registerFluxElements() {
  define("flux-edit-open-btn", FluxEditOpenButton_1.FluxEditOpenButton);
  define("flux-action-toolbar", FluxActionToolbar_1.FluxActionToolbar);
  define("flux-upload-overlay", FluxUploadOverlay_1.FluxUploadOverlay);
  define("flux-link-overlay", FluxLinkOverlay_1.FluxLinkOverlay);
  define("flux-inline-handle", FluxInlineHandle_1.FluxInlineHandle);
}
function define(tag, ctor) {
  if (customElements.get(tag)) return;
  customElements.define(tag, ctor);
}

/***/ }),

/***/ "./client/preview/FluxHoverController.ts":
/*!***********************************************!*\
  !*** ./client/preview/FluxHoverController.ts ***!
  \***********************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";


/**
 * Single hover state machine for the preview frame.
 *
 * Replaces the per-widget `hoverWithGrace` callbacks. Resolves the layering
 * bug where a block button and an inner fx-key affordance could both render
 * at once.
 *
 * Rules:
 *  - The cursor's nearest `[fx-owner]` ancestor is the "active block".
 *  - If that block is *closed*, only the block-level overlays (Edit/Open
 *    button, action toolbar) show. Inner fx-key overlays are suppressed.
 *  - If that block is *open*, inner fx-key overlays show normally; the
 *    block-level button stays visible as a "Close" affordance.
 *  - When the cursor leaves both the target and the overlay, a grace
 *    timer hides the overlay so the user can move onto popups.
 */
Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports.hoverController = void 0;
const FluxBlockState_1 = __webpack_require__(/*! ./FluxBlockState */ "./client/preview/FluxBlockState.ts");
const GRACE_MS = 200;
class FluxHoverController {
  constructor() {
    this.entries = [];
    this.hideTimers = new Map();
    this.installed = false;
    this.onPointerOver = event => {
      const node = event.target;
      if (!node) return;
      const block = node.closest("[fx-owner]");
      const blockOwner = block?.getAttribute("fx-owner") ?? null;
      const ctx = {
        blockOwner
      };
      for (const entry of this.entries) {
        if (entry.overlay.contains(node)) {
          this.cancelHide(entry);
          continue;
        }
        if (!entry.target.contains(node)) continue;
        // Block-layer overlays whose target sits *inside* a different
        // open block should stand down — that block owns the stage.
        if (entry.layer === "block" && blockOwner && FluxBlockState_1.blockState.activeOwner() && FluxBlockState_1.blockState.activeOwner() !== this.ownerOf(entry.target)) {
          continue;
        }
        if (!this.isLayerActive(entry, ctx)) continue;
        this.cancelHide(entry);
        entry.show();
      }
    };
    this.onPointerOut = event => {
      const related = event.relatedTarget ?? null;
      for (const entry of this.entries) {
        const wasInside = entry.target.contains(event.target) || entry.overlay.contains(event.target);
        if (!wasInside) continue;
        const stillInside = related && (entry.target.contains(related) || entry.overlay.contains(related));
        if (stillInside) continue;
        this.scheduleHide(entry);
      }
    };
    this.hideAll = () => {
      for (const entry of this.entries) {
        this.cancelHide(entry);
        entry.hide();
      }
    };
  }
  install() {
    if (this.installed) return;
    this.installed = true;
    document.addEventListener("pointerover", this.onPointerOver, {
      capture: true
    });
    document.addEventListener("pointerout", this.onPointerOut, {
      capture: true
    });
    window.addEventListener("scroll", this.hideAll, {
      passive: true,
      capture: true
    });
    FluxBlockState_1.blockState.subscribe(event => {
      if (!event.open) this.hideAll();
    });
  }
  register(entry) {
    this.entries.push(entry);
    return () => {
      const i = this.entries.indexOf(entry);
      if (i >= 0) this.entries.splice(i, 1);
      this.cancelHide(entry);
      entry.hide();
    };
  }
  reset() {
    for (const entry of [...this.entries]) {
      this.cancelHide(entry);
      entry.hide();
    }
    this.entries.length = 0;
  }
  isLayerActive(entry, ctx) {
    if (entry.layer === "block") return true;
    // Field-layer overlays only activate when their containing block is open.
    if (!ctx.blockOwner) return false;
    return FluxBlockState_1.blockState.isOpen(ctx.blockOwner);
  }
  ownerOf(el) {
    return el.closest("[fx-owner]")?.getAttribute("fx-owner") ?? null;
  }
  scheduleHide(entry) {
    this.cancelHide(entry);
    const t = setTimeout(() => {
      this.hideTimers.delete(entry);
      entry.hide();
    }, GRACE_MS);
    this.hideTimers.set(entry, t);
  }
  cancelHide(entry) {
    const t = this.hideTimers.get(entry);
    if (t !== undefined) {
      clearTimeout(t);
      this.hideTimers.delete(entry);
    }
  }
}
exports.hoverController = new FluxHoverController();

/***/ }),

/***/ "./client/preview/FluxOverlayElement.ts":
/*!**********************************************!*\
  !*** ./client/preview/FluxOverlayElement.ts ***!
  \**********************************************/
/***/ (function(__unused_webpack_module, exports) {

"use strict";


/**
 * Shared base for Flux preview-overlay Custom Elements.
 *
 *  - ShadowDOM root with adoptedStyleSheets pipeline
 *  - attach(target) / detach() / position() / show() / hide() lifecycle
 *  - emit(): typed FrameToHostMessage dispatch on a "flux-overlay-message"
 *    CustomEvent that InlineEditor forwards onto the host channel
 *
 * Overlays are appended to `document.body` (not the target's subtree) so
 * they aren't clipped by overflow:hidden ancestors. `position(rect)` is
 * called when the controller decides to show.
 */
Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports.FluxOverlayElement = void 0;
class FluxOverlayElement extends HTMLElement {
  constructor(stylesheet) {
    super();
    this.target = null;
    this.shadow = this.attachShadow({
      mode: "open"
    });
    this.shadow.adoptedStyleSheets = [stylesheet];
  }
  attach(target) {
    this.target = target;
    if (!this.isConnected) document.body.appendChild(this);
    this.hide();
  }
  detach() {
    this.hide();
    this.target = null;
    if (this.isConnected) this.remove();
  }
  /**
   * Position the overlay relative to the target's current bounding rect.
   * Default puts it at the top-right corner; subclasses override as needed.
   */
  position(rect) {
    const r = rect ?? this.target?.getBoundingClientRect();
    if (!r) return;
    this.style.position = "fixed";
    this.style.top = `${r.top}px`;
    this.style.left = `${r.right}px`;
  }
  show() {
    if (!this.target) return;
    this.position();
    this.setAttribute("visible", "");
  }
  hide() {
    this.removeAttribute("visible");
  }
  /**
   * Emit a typed message to the host channel via a bubbling CustomEvent that
   * InlineEditor (the orchestrator) forwards onto the MessageChannel.
   */
  emit(message) {
    this.dispatchEvent(new CustomEvent("flux-overlay-message", {
      bubbles: true,
      composed: true,
      detail: message
    }));
  }
}
exports.FluxOverlayElement = FluxOverlayElement;

/***/ }),

/***/ "./client/preview/FluxScopeGuard.ts":
/*!******************************************!*\
  !*** ./client/preview/FluxScopeGuard.ts ***!
  \******************************************/
/***/ (function(__unused_webpack_module, exports) {

"use strict";


/**
 * Decides whether a Flux-bound element is editable for the current scope.
 *
 * Scope is set by the host via window.FluxScope (initialised by
 * FluxBootstrap.applyContext).
 *
 *  page          → every fx-* element is editable
 *  block         → only elements whose nearest fx-owner ancestor matches
 *                  scope.ownerId
 *  relation-item → only elements whose owner equals scope.ownerId
 */
Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports.FluxScopeGuard = void 0;
class FluxScopeGuard {
  constructor(scope) {
    this.scope = scope ?? window.FluxScope ?? {
      kind: "page",
      ownerId: null
    };
  }
  static current() {
    return new FluxScopeGuard();
  }
  get kind() {
    return this.scope.kind;
  }
  /**
   * True if the given fx-* element is in-scope for the current edit context.
   * Pass the element itself, not its owner — we resolve the nearest
   * fx-owner ancestor or the element's own fx-owner attribute.
   */
  canEdit(element) {
    if (this.scope.kind === "page") {
      return true;
    }
    const elementOwner = this.resolveOwner(element);
    if (!elementOwner) {
      return false;
    }
    return elementOwner === this.scope.ownerId;
  }
  resolveOwner(element) {
    const own = element.getAttribute("fx-owner");
    if (own) return own;
    const ancestor = element.closest("[fx-owner]");
    return ancestor?.getAttribute("fx-owner") ?? null;
  }
}
exports.FluxScopeGuard = FluxScopeGuard;

/***/ }),

/***/ "./client/preview/FluxSortable.ts":
/*!****************************************!*\
  !*** ./client/preview/FluxSortable.ts ***!
  \****************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";


/**
 * Drag-and-drop reorder within a single Flux relation.
 *
 * A drop-zone container is marked by FluxDirectives with:
 *   fx-sortable
 *   fx-grid-name="<relation>"
 *   fx-grid-item-selector="<css>"
 *   fx-grid-sort-field="<column>"  (optional — server uses default if absent)
 *
 * Each item inside has `fx-owner="<recordId>"` (already stamped by relation
 * binding). On drop, we compute the new ordered ID list from DOM order
 * and emit a `gridFieldAction` message with `action: 'reorder'`. The
 * host translates this into the same request `GridFieldOrderableRows`
 * would normally fire.
 */
Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports.initSortable = initSortable;
const logger_1 = __webpack_require__(/*! ../core/logger */ "./client/core/logger.ts");
const READY_ATTR = "fx-sortable-ready";
function initSortable(channel) {
  if (!channel) return;
  document.querySelectorAll("[fx-sortable]").forEach(zone => {
    if (zone.hasAttribute(READY_ATTR)) return;
    zone.setAttribute(READY_ATTR, "1");
    const relationKey = zone.getAttribute("fx-grid-name");
    const itemSelector = zone.getAttribute("fx-grid-item-selector");
    if (!relationKey || !itemSelector) return;
    const config = {
      relationKey,
      itemSelector,
      sortField: zone.getAttribute("fx-grid-sort-field") ?? undefined
    };
    bindZone(zone, config, channel);
  });
}
function bindZone(zone, config, channel) {
  const items = Array.from(zone.querySelectorAll(config.itemSelector));
  items.forEach(item => attachDrag(zone, item, config, channel));
}
function attachDrag(zone, item, config, channel) {
  var _a;
  item.setAttribute("draggable", "true");
  (_a = item.style).cursor || (_a.cursor = "grab");
  let fromIndex = -1;
  item.addEventListener("dragstart", event => {
    item.setAttribute("data-flux-dragging", "");
    fromIndex = indexOf(zone, item, config.itemSelector);
    event.dataTransfer?.setData("text/plain", item.getAttribute("fx-owner") ?? "");
    event.dataTransfer && (event.dataTransfer.effectAllowed = "move");
  });
  item.addEventListener("dragend", () => {
    item.removeAttribute("data-flux-dragging");
    const owner = item.getAttribute("fx-owner");
    const toIndex = indexOf(zone, item, config.itemSelector);
    if (!owner || toIndex === fromIndex || toIndex < 0) return;
    const orderedIds = Array.from(zone.querySelectorAll(config.itemSelector)).map(el => el.getAttribute("fx-owner")).filter(id => !!id);
    logger_1.logger.log(`dragEventEnd: ${config.relationKey} moved ${owner} ${fromIndex} → ${toIndex}`);
    channel.postMessage({
      type: "dragEventEnd",
      key: config.relationKey,
      owner,
      fromIndex,
      toIndex,
      orderedIds,
      sortField: config.sortField
    });
  });
  item.addEventListener("dragover", event => {
    event.preventDefault();
    const dragging = zone.querySelector("[data-flux-dragging]");
    if (!dragging || dragging === item) return;
    const rect = item.getBoundingClientRect();
    const after = event.clientY - rect.top > rect.height / 2;
    if (after) item.after(dragging);else item.before(dragging);
  });
}
function indexOf(zone, item, itemSelector) {
  const items = Array.from(zone.querySelectorAll(itemSelector));
  return items.indexOf(item);
}

/***/ }),

/***/ "./client/preview/FluxStage.ts":
/*!*************************************!*\
  !*** ./client/preview/FluxStage.ts ***!
  \*************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";


/**
 * "Stage" mode — when a block is open for editing, dim the rest of the
 * page so the open block reads as the active surface.
 *
 *  - Renders a single backdrop element behind the open block.
 *  - Sets `data-flux-stage` on <body> so themes can react.
 *  - Closes the open block on backdrop click, click-outside, or Esc.
 *
 * The open block itself is raised above the backdrop via the
 * `[data-flux-editing]` selector in preview.scss.
 */
Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports.stage = void 0;
const logger_1 = __webpack_require__(/*! ../core/logger */ "./client/core/logger.ts");
const FluxBlockState_1 = __webpack_require__(/*! ./FluxBlockState */ "./client/preview/FluxBlockState.ts");
const BACKDROP_ID = "flux-stage-backdrop";
const STAGE_BODY_ATTR = "data-flux-stage";
class FluxStage {
  constructor() {
    this.backdrop = null;
    this.installed = false;
    this.onPointerDown = event => {
      const activeOwner = FluxBlockState_1.blockState.activeOwner();
      if (!activeOwner) return;
      const target = event.target;
      if (!target) return;
      // Inside an open block or one of its child overlays → ignore.
      // We check for any open block element via [data-flux-editing] plus
      // any custom-element overlay (flux-*) so popups don't dismiss it.
      if (target.closest("[data-flux-editing]")) return;
      if (target.closest("flux-edit-open-btn, flux-action-toolbar, flux-upload-overlay, flux-link-overlay, flux-inline-handle")) return;
      if (target.id === BACKDROP_ID) return; // backdrop has its own handler
      // Click on bare page → close.
      logger_1.logger.log("Click outside open block → closing");
      FluxBlockState_1.blockState.closeAll();
    };
    this.onKeyDown = event => {
      if (event.key !== "Escape") return;
      if (!FluxBlockState_1.blockState.activeOwner()) return;
      logger_1.logger.log("Esc pressed → closing open block");
      FluxBlockState_1.blockState.closeAll();
    };
  }
  install() {
    if (this.installed) return;
    this.installed = true;
    FluxBlockState_1.blockState.subscribe(event => {
      if (event.open) this.show();else if (!FluxBlockState_1.blockState.activeOwner()) this.hide();
    });
    document.addEventListener("pointerdown", this.onPointerDown, {
      capture: true
    });
    document.addEventListener("keydown", this.onKeyDown);
  }
  show() {
    document.body.setAttribute(STAGE_BODY_ATTR, "");
    if (!this.backdrop) {
      const el = document.createElement("div");
      el.id = BACKDROP_ID;
      el.addEventListener("click", () => {
        logger_1.logger.log("Stage backdrop clicked → closing open block");
        FluxBlockState_1.blockState.closeAll();
      });
      document.body.appendChild(el);
      this.backdrop = el;
    }
  }
  hide() {
    document.body.removeAttribute(STAGE_BODY_ATTR);
    this.backdrop?.remove();
    this.backdrop = null;
  }
}
exports.stage = new FluxStage();

/***/ }),

/***/ "./client/preview/InlineEditor.ts":
/*!****************************************!*\
  !*** ./client/preview/InlineEditor.ts ***!
  \****************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports.activeEditingFields = void 0;
exports.initInlineEditing = initInlineEditing;
const logger_1 = __webpack_require__(/*! ../core/logger */ "./client/core/logger.ts");
const FluxBlockState_1 = __webpack_require__(/*! ./FluxBlockState */ "./client/preview/FluxBlockState.ts");
const FluxElements_1 = __webpack_require__(/*! ./FluxElements */ "./client/preview/FluxElements.ts");
const FluxHoverController_1 = __webpack_require__(/*! ./FluxHoverController */ "./client/preview/FluxHoverController.ts");
const FluxScopeGuard_1 = __webpack_require__(/*! ./FluxScopeGuard */ "./client/preview/FluxScopeGuard.ts");
const FluxSortable_1 = __webpack_require__(/*! ./FluxSortable */ "./client/preview/FluxSortable.ts");
const FluxStage_1 = __webpack_require__(/*! ./FluxStage */ "./client/preview/FluxStage.ts");
const TEXT_SELECTOR = '[fx-key][fx-type="Text"]';
const FILE_SELECTOR = '[fx-key][fx-type="UploadField"]';
const LINK_SELECTOR = '[fx-key][fx-type="LinkField"]';
exports.activeEditingFields = new Set();
const TOOLBAR_TAGS = 'flux-upload-overlay, flux-link-overlay, flux-action-toolbar, flux-edit-open-btn, flux-inline-handle';
const READY_ATTRS = ['fx-inline-ready', 'fx-block-btn-ready', 'data-flux-block'];
let initAbort = null;
let blockStateUnsubscribes = [];
/**
 * Tear down anything from a previous init: abort listeners, reset the hover
 * controller, remove the body-appended toolbars, and clear the "already
 * bound" sentinels so elements can be re-processed.
 */
function teardownPreviousInit() {
  initAbort?.abort();
  initAbort = null;
  blockStateUnsubscribes.forEach(fn => fn());
  blockStateUnsubscribes = [];
  FluxHoverController_1.hoverController.reset();
  FluxBlockState_1.blockState.closeAll();
  document.querySelectorAll(TOOLBAR_TAGS).forEach(el => el.remove());
  for (const attr of READY_ATTRS) {
    document.querySelectorAll(`[${attr}]`).forEach(el => el.removeAttribute(attr));
  }
}
function fieldId(key, owner) {
  return `${key}|${owner ?? ''}`;
}
function setBlockEditable(owner, editable) {
  document.querySelectorAll(`[fx-owner="${owner}"][fx-type="Text"]`).forEach(el => {
    el.contentEditable = String(editable);
  });
}
/**
 * Owners come in two flavours:
 *   - selector-style ("#e42") for Elemental blocks — the owner string IS the
 *     CSS selector of the block's container element
 *   - id-style ("42")          for relation items — the owner is the record
 *     id and the container is the row carrying [fx-owner="42"]
 *
 * Try id-attribute lookup first, fall back to selector lookup.
 */
function resolveOwnerEl(owner) {
  const byAttr = document.querySelector(`[fx-owner="${CSS.escape(owner)}"]`);
  if (byAttr) return byAttr;
  try {
    return document.querySelector(owner);
  } catch {
    return null;
  }
}
function initInlineEditing(channel) {
  if (!channel) {
    logger_1.logger.warn('InlineEditor: no channel available, skipping setup');
    return;
  }
  (0, FluxElements_1.registerFluxElements)();
  FluxHoverController_1.hoverController.install();
  FluxStage_1.stage.install();
  teardownPreviousInit();
  initAbort = new AbortController();
  const signal = initAbort.signal;
  const guard = FluxScopeGuard_1.FluxScopeGuard.current();
  // Reflect open/close into the DOM + contentEditable for any block.
  blockStateUnsubscribes.push(FluxBlockState_1.blockState.subscribe(({
    owner,
    open
  }) => {
    setBlockEditable(owner, open);
    const ownerEl = resolveOwnerEl(owner);
    if (ownerEl) {
      ownerEl.toggleAttribute('data-flux-editing', open);
    }
  }));
  initTextEditing(channel, signal, guard);
  initFileUploadEditing(channel, signal, guard);
  initLinkFieldEditing(channel, signal, guard);
  initGridFieldEditing(channel, signal, guard);
  initBlockEditButtons(channel, signal, guard);
  (0, FluxSortable_1.initSortable)(channel);
  // If the CMS is editing a single block or relation item, auto-stage it
  // so the user lands on the right "stage" without an extra click.
  autoStageScopedOwner();
}
/**
 * When scope.kind is 'block' or 'relation-item', the CMS is editing one
 * specific thing — open it in the frame so its stage backdrop and inner
 * affordances are immediately available.
 */
function autoStageScopedOwner() {
  const scope = window.FluxScope;
  if (!scope || scope.kind === 'page' || !scope.ownerId) return;
  // Defer to next frame so the block container has had its
  // data-flux-block attribute stamped by initBlockEditButtons.
  requestAnimationFrame(() => {
    FluxBlockState_1.blockState.openBlock(scope.ownerId);
  });
}
function initTextEditing(channel, signal, guard) {
  document.querySelectorAll(TEXT_SELECTOR).forEach(el => {
    if (el.hasAttribute('fx-inline-ready')) return;
    el.setAttribute('fx-inline-ready', '1');
    if (!guard.canEdit(el)) {
      el.setAttribute('fx-out-of-scope', '');
      return;
    }
    const owner = el.getAttribute('fx-owner') ?? null;
    const isGridFieldChild = el.closest('[fx-type="GridField"]') !== null;
    // Page-scope text without an owner is always editable; otherwise the
    // text only becomes editable when its block is open (or when nested
    // inside a GridField item, where the row itself is the unit).
    const initialEditable = owner === null || isGridFieldChild;
    el.contentEditable = String(initialEditable);
    el.addEventListener('focus', () => {
      const key = el.getAttribute('fx-key');
      exports.activeEditingFields.add(fieldId(key, owner));
    }, {
      signal
    });
    el.addEventListener('blur', () => {
      const key = el.getAttribute('fx-key');
      exports.activeEditingFields.delete(fieldId(key, owner));
    }, {
      signal
    });
    el.addEventListener('input', () => {
      const key = el.getAttribute('fx-key');
      // Fallback to a single space so the element keeps a text node and stays visible.
      const value = el.innerText.trim() || ' ';
      logger_1.logger.log(`Inline edit → key: "${key}", value: "${value}"`);
      channel.postMessage({
        type: 'inlineEditUpdate',
        key,
        value,
        owner
      });
    }, {
      signal
    });
  });
}
function initFileUploadEditing(channel, _signal, guard) {
  document.querySelectorAll(FILE_SELECTOR).forEach(el => {
    if (el.hasAttribute('fx-inline-ready')) return;
    el.setAttribute('fx-inline-ready', '1');
    if (!guard.canEdit(el)) {
      el.setAttribute('fx-out-of-scope', '');
      return;
    }
    const key = el.getAttribute('fx-key');
    const owner = el.getAttribute('fx-owner') ?? null;
    const toolbar = document.createElement('flux-upload-overlay');
    document.body.appendChild(toolbar);
    FluxHoverController_1.hoverController.register({
      layer: 'field',
      target: el,
      overlay: toolbar,
      show: () => toolbar.show(el.getBoundingClientRect()),
      hide: () => toolbar.hide()
    });
    toolbar.onPreview(() => {
      logger_1.logger.log(`File upload preview → key: "${key}"`);
      channel.postMessage({
        type: 'fileUploadClick',
        key,
        owner
      });
    });
    toolbar.onDelete(() => {
      logger_1.logger.log(`File upload unlink → key: "${key}"`);
      el.querySelector('.btn.uploadfield-item__remove-btn')?.click();
    });
  });
}
function initLinkFieldEditing(channel, signal, guard) {
  document.querySelectorAll(LINK_SELECTOR).forEach(el => {
    if (el.hasAttribute('fx-inline-ready')) return;
    el.setAttribute('fx-inline-ready', '1');
    if (!guard.canEdit(el)) {
      el.setAttribute('fx-out-of-scope', '');
      return;
    }
    const key = el.getAttribute('fx-key');
    const owner = el.getAttribute('fx-owner') ?? null;
    const dot = document.createElement('flux-link-overlay');
    document.body.appendChild(dot);
    FluxHoverController_1.hoverController.register({
      layer: 'field',
      target: el,
      overlay: dot,
      show: () => {
        const range = document.createRange();
        range.selectNodeContents(el);
        dot.show(range.getBoundingClientRect());
      },
      hide: () => dot.hide()
    });
    dot.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      logger_1.logger.log(`Link field edit dot click → key: "${key}"`);
      channel.postMessage({
        type: 'linkFieldClick',
        key,
        owner
      });
    }, {
      signal
    });
  });
}
const GRID_ACTION_ICONS = {
  edit: `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm2.92 1.83H5v-.75l9.06-9.06.75.75-8.89 9.06zM20.71 5.63l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83a1 1 0 0 0 0-1.41z"/></svg>`,
  delete: `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>`,
  archive: `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M20.54 5.23l-1.39-1.68C18.88 3.21 18.47 3 18 3H6c-.47 0-.88.21-1.16.55L3.46 5.23C3.17 5.57 3 6.02 3 6.5V19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6.5c0-.48-.17-.93-.46-1.27zM12 17.5L6.5 12H10v-2h4v2h3.5L12 17.5zM5.12 5l.81-1h12l.94 1H5.12z"/></svg>`
};
function initGridFieldEditing(channel, _signal, guard) {
  document.querySelectorAll('[fx-type="GridField"][fx-key][fx-owner]').forEach(el => {
    if (el.hasAttribute('fx-inline-ready')) return;
    el.setAttribute('fx-inline-ready', '1');
    if (!guard.canEdit(el)) {
      el.setAttribute('fx-out-of-scope', '');
      return;
    }
    const key = el.getAttribute('fx-key');
    const owner = el.getAttribute('fx-owner');
    const actions = JSON.parse(el.getAttribute('fx-grid-actions') ?? '["edit"]');
    const toolbar = document.createElement('flux-action-toolbar');
    document.body.appendChild(toolbar);
    actions.forEach(action => {
      toolbar.addAction(action, GRID_ACTION_ICONS[action] ?? action, () => {
        logger_1.logger.log(`GridField action → key: "${key}", owner: "${owner}", action: "${action}"`);
        channel.postMessage({
          type: 'gridFieldAction',
          key,
          owner,
          action
        });
      });
    });
    FluxHoverController_1.hoverController.register({
      layer: 'block',
      target: el,
      overlay: toolbar,
      show: () => toolbar.show(el.getBoundingClientRect()),
      hide: () => toolbar.hide()
    });
  });
}
/**
 * Edit/Open button — implements the behaviour matrix from flux-v2-ui-plan.md §4.
 *
 *   inline-editable + (split | preview)  → "Edit" / "Close", toggles block open
 *   non-inline       + split             → "Open ↗", host navigates CMS to editLink
 *   non-inline       + preview           → "Open ↗", host navigates CMS to editLink
 */
function initBlockEditButtons(channel, signal, guard) {
  const owners = new Set();
  document.querySelectorAll('[fx-owner]').forEach(el => {
    owners.add(el.getAttribute('fx-owner'));
  });
  owners.forEach(owner => {
    // In block / relation-item scope, only the active owner gets a button.
    if (guard.kind !== 'page' && owner !== (window.FluxScope?.ownerId ?? null)) {
      return;
    }
    const ownerEl = resolveOwnerEl(owner);
    if (!ownerEl) return;
    if (ownerEl.hasAttribute('fx-block-btn-ready')) return;
    ownerEl.setAttribute('fx-block-btn-ready', '1');
    // Marker so CSS can target the block container (vs its fx-key children).
    ownerEl.setAttribute('data-flux-block', '');
    if (getComputedStyle(ownerEl).position === 'static') {
      ownerEl.style.position = 'relative';
    }
    const isInlineEditable = ownerEl.querySelector(TEXT_SELECTOR) !== null;
    const editLink = ownerEl.getAttribute('fx-edit-link');
    // If a block has no inline-editable content and no edit link, the
    // button has nothing useful to do — skip it.
    if (!isInlineEditable && !editLink) return;
    const btn = document.createElement('flux-edit-open-btn');
    btn.inline = isInlineEditable;
    const updateButton = () => {
      if (!isInlineEditable) {
        btn.label = 'Open ↗';
        btn.open = false;
        return;
      }
      const isOpen = FluxBlockState_1.blockState.isOpen(owner);
      btn.label = isOpen ? 'Close' : 'Edit';
      btn.open = isOpen;
    };
    updateButton();
    blockStateUnsubscribes.push(FluxBlockState_1.blockState.subscribe(event => {
      if (event.owner === owner) updateButton();
    }));
    FluxHoverController_1.hoverController.register({
      layer: 'block',
      target: ownerEl,
      overlay: btn,
      show: () => {
        btn.visible = true;
      },
      hide: () => {
        btn.visible = false;
      }
    });
    btn.addEventListener('flux-click', () => {
      // In preview mode the CMS form isn't visible, so navigating to the
      // record's edit link would leave the user stranded. Stage the block
      // instead — the action toolbar / upload / link overlays still work
      // against it, and the user can close out with Esc / click-outside.
      const mode = window.FluxMode ?? 'split';
      const shouldStage = isInlineEditable || mode === 'preview';
      if (shouldStage) {
        FluxBlockState_1.blockState.toggle(owner);
        updateButton();
      }
      logger_1.logger.log(`Block button click → owner: "${owner}", inline: ${isInlineEditable}, mode: ${mode}, open: ${FluxBlockState_1.blockState.isOpen(owner)}`);
      channel.postMessage({
        type: 'editBlockClick',
        owner,
        editLink,
        inlineEditable: isInlineEditable
      });
    }, {
      signal
    });
    ownerEl.appendChild(btn);
  });
}

/***/ }),

/***/ "./client/preview/flux-edit-btn.shadow.css":
/*!*************************************************!*\
  !*** ./client/preview/flux-edit-btn.shadow.css ***!
  \*************************************************/
/***/ (function(module) {

"use strict";
module.exports = ":host {\n    position: absolute;\n    top: 0;\n    right: 0;\n    z-index: 9999;\n    display: block;\n}\n\nbutton {\n    padding: 0.4rem 1rem;\n    font-size: 1.1rem;\n    font-family: system-ui, sans-serif;\n    font-weight: 600;\n    letter-spacing: 0.03em;\n    line-height: 1.4;\n    color: #fff;\n    background: var(--flux-color-edit, #1A4877);\n    border: none;\n    border-radius: 0 0 0 0.4rem;\n    cursor: pointer;\n    white-space: nowrap;\n    opacity: 0;\n    transition: opacity 0.15s, background 0.1s;\n}\n\n:host([visible]) button {\n    opacity: 1;\n}\n\nbutton:hover {\n    filter: brightness(1.2);\n}\n";

/***/ }),

/***/ "./client/preview/flux-grid-toolbar.shadow.css":
/*!*****************************************************!*\
  !*** ./client/preview/flux-grid-toolbar.shadow.css ***!
  \*****************************************************/
/***/ (function(module) {

"use strict";
module.exports = ":host {\n    position: fixed;\n    z-index: 9999;\n    display: flex;\n    gap: 0.5rem;\n    padding: 0.5rem;\n    border-radius: 0.8rem;\n    transform: translateX(-100%);\n    opacity: 0;\n    pointer-events: none;\n    transition: opacity 0.15s;\n}\n\n:host([visible]) {\n    opacity: 1;\n    pointer-events: auto;\n}\n\nbutton {\n    display: flex;\n    align-items: center;\n    gap: 0.5rem;\n    padding: 0.5rem 1.1rem;\n    font-size: 1.3rem;\n    font-family: system-ui, sans-serif;\n    font-weight: 600;\n    letter-spacing: 0.02em;\n    color: #fff;\n    border: none;\n    border-radius: 2rem;\n    cursor: pointer;\n    white-space: nowrap;\n    transition: filter 0.1s;\n}\n\nbutton:hover {\n    filter: brightness(1.25);\n}\n\nbutton[data-action=\"edit\"]    { background: var(--flux-color-edit,    #1A4877); }\nbutton[data-action=\"delete\"]  { background: var(--flux-color-delete,  #CB3E00); }\nbutton[data-action=\"archive\"] { background: var(--flux-color-archive, #b7680a); }\n";

/***/ }),

/***/ "./client/preview/flux-link-dot.shadow.css":
/*!*************************************************!*\
  !*** ./client/preview/flux-link-dot.shadow.css ***!
  \*************************************************/
/***/ (function(module) {

"use strict";
module.exports = ":host {\n    position: fixed;\n    z-index: 9999;\n    width: 2rem;\n    height: 2rem;\n    display: flex;\n    align-items: center;\n    justify-content: center;\n    background: var(--flux-color-edit, #1A4877);\n    border: 0.2rem solid rgba(255, 255, 255, 0.9);\n    border-radius: 50%;\n    box-sizing: border-box;\n    cursor: pointer;\n    opacity: 0;\n    pointer-events: none;\n    transition: opacity 0.15s, background 0.1s;\n}\n\n:host([visible]) {\n    opacity: 1;\n    pointer-events: auto;\n}\n\n:host(:hover) {\n    filter: brightness(1.2);\n}\n";

/***/ }),

/***/ "./client/preview/flux-upload-toolbar.shadow.css":
/*!*******************************************************!*\
  !*** ./client/preview/flux-upload-toolbar.shadow.css ***!
  \*******************************************************/
/***/ (function(module) {

"use strict";
module.exports = ":host {\n    position: fixed;\n    z-index: 9999;\n    display: flex;\n    gap: 0.5rem;\n    padding: 0.5rem;\n    border-radius: 0.8rem;\n    transform: translateX(-100%);\n    opacity: 0;\n    pointer-events: none;\n    transition: opacity 0.15s;\n}\n\n:host([visible]) {\n    opacity: 1;\n    pointer-events: auto;\n}\n\nbutton {\n    display: flex;\n    align-items: center;\n    gap: 0.5rem;\n    padding: 0.5rem 1.1rem;\n    font-size: 1.3rem;\n    font-family: system-ui, sans-serif;\n    font-weight: 600;\n    letter-spacing: 0.02em;\n    color: #fff;\n    border: none;\n    border-radius: 2rem;\n    cursor: pointer;\n    white-space: nowrap;\n    transition: filter 0.1s;\n}\n\nbutton:hover {\n    filter: brightness(1.25);\n}\n\nbutton[data-action=\"preview\"] { background: var(--flux-color-edit,   #1A4877); }\nbutton[data-action=\"delete\"]  { background: var(--flux-color-delete, #CB3E00); }\n";

/***/ }),

/***/ "./client/preview/overlays/FluxActionToolbar.ts":
/*!******************************************************!*\
  !*** ./client/preview/overlays/FluxActionToolbar.ts ***!
  \******************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";


var __importDefault = this && this.__importDefault || function (mod) {
  return mod && mod.__esModule ? mod : {
    "default": mod
  };
};
Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports.FluxActionToolbar = void 0;
const flux_grid_toolbar_shadow_css_1 = __importDefault(__webpack_require__(/*! ../flux-grid-toolbar.shadow.css */ "./client/preview/flux-grid-toolbar.shadow.css"));
const FluxOverlayElement_1 = __webpack_require__(/*! ../FluxOverlayElement */ "./client/preview/FluxOverlayElement.ts");
const shadow_sheet_1 = __webpack_require__(/*! ../shadow-sheet */ "./client/preview/shadow-sheet.ts");
const styles = (0, shadow_sheet_1.createSheet)(flux_grid_toolbar_shadow_css_1.default);
/**
 * Field-level affordance for GridField / relation items.
 * Renders the actions (edit / archive / delete) declared on the GridField.
 */
class FluxActionToolbar extends FluxOverlayElement_1.FluxOverlayElement {
  constructor() {
    super(styles);
  }
  addAction(action, icon, onClick) {
    const label = action.charAt(0).toUpperCase() + action.slice(1);
    const btn = document.createElement("button");
    btn.setAttribute("data-action", action);
    btn.innerHTML = `${icon}<span>${label}</span>`;
    btn.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    });
    this.shadow.appendChild(btn);
  }
  show(rect) {
    const r = rect ?? this.target?.getBoundingClientRect();
    if (!r) return;
    this.style.top = `${r.top + 4}px`;
    this.style.left = `${r.right - 4}px`;
    this.setAttribute("visible", "");
  }
}
exports.FluxActionToolbar = FluxActionToolbar;

/***/ }),

/***/ "./client/preview/overlays/FluxEditOpenButton.ts":
/*!*******************************************************!*\
  !*** ./client/preview/overlays/FluxEditOpenButton.ts ***!
  \*******************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";


var __importDefault = this && this.__importDefault || function (mod) {
  return mod && mod.__esModule ? mod : {
    "default": mod
  };
};
Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports.FluxEditOpenButton = void 0;
const flux_edit_btn_shadow_css_1 = __importDefault(__webpack_require__(/*! ../flux-edit-btn.shadow.css */ "./client/preview/flux-edit-btn.shadow.css"));
const FluxOverlayElement_1 = __webpack_require__(/*! ../FluxOverlayElement */ "./client/preview/FluxOverlayElement.ts");
const shadow_sheet_1 = __webpack_require__(/*! ../shadow-sheet */ "./client/preview/shadow-sheet.ts");
const styles = (0, shadow_sheet_1.createSheet)(flux_edit_btn_shadow_css_1.default);
/**
 * Block-level affordance: the "Edit" / "Open" button that appears at the
 * top-right of a Flux block or relation item.
 *
 * Behaviour matrix (CMS mode × inline-editable) is wired in 6.3. For now
 * this is a thin label/state holder — clicks bubble as `flux-click` and
 * the orchestrator decides what to do.
 */
class FluxEditOpenButton extends FluxOverlayElement_1.FluxOverlayElement {
  constructor() {
    super(styles);
    this._btn = document.createElement("button");
    this.shadow.appendChild(this._btn);
    this._btn.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      this.dispatchEvent(new CustomEvent("flux-click", {
        bubbles: true,
        composed: true
      }));
    });
  }
  set label(val) {
    this._btn.textContent = val;
  }
  get label() {
    return this._btn.textContent ?? "";
  }
  set visible(val) {
    if (val) this.setAttribute("visible", "");else this.removeAttribute("visible");
  }
  set inline(val) {
    if (val) this.setAttribute("inline", "");else this.removeAttribute("inline");
  }
  get inline() {
    return this.hasAttribute("inline");
  }
  set open(val) {
    if (val) this.setAttribute("open", "");else this.removeAttribute("open");
  }
  get open() {
    return this.hasAttribute("open");
  }
  // Anchored inside its target so it positions relative to the block (the
  // existing CSS uses :host { position: absolute; top: 0; right: 0 }).
  // The hover controller toggles `visible`; nothing to position.
  position() {}
}
exports.FluxEditOpenButton = FluxEditOpenButton;

/***/ }),

/***/ "./client/preview/overlays/FluxInlineHandle.ts":
/*!*****************************************************!*\
  !*** ./client/preview/overlays/FluxInlineHandle.ts ***!
  \*****************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports.FluxInlineHandle = void 0;
const FluxOverlayElement_1 = __webpack_require__(/*! ../FluxOverlayElement */ "./client/preview/FluxOverlayElement.ts");
const shadow_sheet_1 = __webpack_require__(/*! ../shadow-sheet */ "./client/preview/shadow-sheet.ts");
/**
 * Visual edit affordance for `fx-type="Text"` fields when their block is
 * open. Currently a thin underline + caret cursor styling; the actual
 * contenteditable binding is set on the target element itself by
 * InlineEditor. This overlay exists so the field gets a consistent
 * "I am editable" visual treatment without baking it into every theme.
 *
 * Reserved for use in 6.3+. Not registered yet — kept as a stub so the
 * overlays/ directory presents the full set described in the plan.
 */
const styles = (0, shadow_sheet_1.createSheet)(`
:host {
    position: fixed;
    z-index: 9998;
    pointer-events: none;
    background: var(--flux-color-inline-bar, rgba(26, 72, 119, 0.85));
    height: 2px;
    opacity: 0;
    transition: opacity 0.12s;
}
:host([visible]) { opacity: 1; }
`);
class FluxInlineHandle extends FluxOverlayElement_1.FluxOverlayElement {
  constructor() {
    super(styles);
  }
  show(rect) {
    const r = rect ?? this.target?.getBoundingClientRect();
    if (!r) return;
    this.style.top = `${r.bottom}px`;
    this.style.left = `${r.left}px`;
    this.style.width = `${r.width}px`;
    this.setAttribute("visible", "");
  }
}
exports.FluxInlineHandle = FluxInlineHandle;

/***/ }),

/***/ "./client/preview/overlays/FluxLinkOverlay.ts":
/*!****************************************************!*\
  !*** ./client/preview/overlays/FluxLinkOverlay.ts ***!
  \****************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";


var __importDefault = this && this.__importDefault || function (mod) {
  return mod && mod.__esModule ? mod : {
    "default": mod
  };
};
Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports.FluxLinkOverlay = void 0;
const flux_link_dot_shadow_css_1 = __importDefault(__webpack_require__(/*! ../flux-link-dot.shadow.css */ "./client/preview/flux-link-dot.shadow.css"));
const FluxOverlayElement_1 = __webpack_require__(/*! ../FluxOverlayElement */ "./client/preview/FluxOverlayElement.ts");
const shadow_sheet_1 = __webpack_require__(/*! ../shadow-sheet */ "./client/preview/shadow-sheet.ts");
const styles = (0, shadow_sheet_1.createSheet)(flux_link_dot_shadow_css_1.default);
/**
 * Field-level affordance for LinkField bindings — small edit dot anchored
 * to the right of the linked content. Only active when the containing
 * block is open.
 */
class FluxLinkOverlay extends FluxOverlayElement_1.FluxOverlayElement {
  constructor() {
    super(styles);
    this.shadow.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="#fff"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm2.92 1.83H5v-.75l9.06-9.06.75.75-8.89 9.06zM20.71 5.63l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83a1 1 0 0 0 0-1.41z"/></svg>`;
  }
  show(rect) {
    const r = rect ?? this.target?.getBoundingClientRect();
    if (!r) return;
    this.style.top = `${r.top - 2}px`;
    this.style.left = `${r.right + 2}px`;
    this.setAttribute("visible", "");
  }
}
exports.FluxLinkOverlay = FluxLinkOverlay;

/***/ }),

/***/ "./client/preview/overlays/FluxUploadOverlay.ts":
/*!******************************************************!*\
  !*** ./client/preview/overlays/FluxUploadOverlay.ts ***!
  \******************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";


var __importDefault = this && this.__importDefault || function (mod) {
  return mod && mod.__esModule ? mod : {
    "default": mod
  };
};
Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports.FluxUploadOverlay = void 0;
const flux_upload_toolbar_shadow_css_1 = __importDefault(__webpack_require__(/*! ../flux-upload-toolbar.shadow.css */ "./client/preview/flux-upload-toolbar.shadow.css"));
const FluxOverlayElement_1 = __webpack_require__(/*! ../FluxOverlayElement */ "./client/preview/FluxOverlayElement.ts");
const shadow_sheet_1 = __webpack_require__(/*! ../shadow-sheet */ "./client/preview/shadow-sheet.ts");
const styles = (0, shadow_sheet_1.createSheet)(flux_upload_toolbar_shadow_css_1.default);
const PREVIEW_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>`;
const DELETE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>`;
/**
 * Field-level affordance for UploadField (image/file) bindings.
 * Preview / Remove. Only active when the containing block is open.
 */
class FluxUploadOverlay extends FluxOverlayElement_1.FluxOverlayElement {
  constructor() {
    super(styles);
    this._previewBtn = document.createElement("button");
    this._previewBtn.setAttribute("data-action", "preview");
    this._previewBtn.innerHTML = `${PREVIEW_ICON}<span>Preview</span>`;
    this._deleteBtn = document.createElement("button");
    this._deleteBtn.setAttribute("data-action", "delete");
    this._deleteBtn.innerHTML = `${DELETE_ICON}<span>Delete</span>`;
    this.shadow.appendChild(this._previewBtn);
    this.shadow.appendChild(this._deleteBtn);
  }
  onPreview(handler) {
    this._previewBtn.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      handler();
    });
  }
  onDelete(handler) {
    this._deleteBtn.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      handler();
    });
  }
  show(rect) {
    const r = rect ?? this.target?.getBoundingClientRect();
    if (!r) return;
    this.style.top = `${r.top + 4}px`;
    this.style.left = `${r.right - 4}px`;
    this.setAttribute("visible", "");
  }
}
exports.FluxUploadOverlay = FluxUploadOverlay;

/***/ }),

/***/ "./client/preview/shadow-sheet.ts":
/*!****************************************!*\
  !*** ./client/preview/shadow-sheet.ts ***!
  \****************************************/
/***/ (function(__unused_webpack_module, exports) {

"use strict";


Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports.createSheet = createSheet;
function createSheet(css) {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  return sheet;
}

/***/ }),

/***/ "./node_modules/idiomorph/dist/idiomorph.cjs.js":
/*!******************************************************!*\
  !*** ./node_modules/idiomorph/dist/idiomorph.cjs.js ***!
  \******************************************************/
/***/ (function(module) {

/**
 * @typedef {object} ConfigHead
 *
 * @property {'merge' | 'append' | 'morph' | 'none'} [style]
 * @property {boolean} [block]
 * @property {boolean} [ignore]
 * @property {function(Element): boolean} [shouldPreserve]
 * @property {function(Element): boolean} [shouldReAppend]
 * @property {function(Element): boolean} [shouldRemove]
 * @property {function(Element, {added: Node[], kept: Element[], removed: Element[]}): void} [afterHeadMorphed]
 */

/**
 * @typedef {object} ConfigCallbacks
 *
 * @property {function(Node): boolean} [beforeNodeAdded]
 * @property {function(Node): void} [afterNodeAdded]
 * @property {function(Element, Node): boolean} [beforeNodeMorphed]
 * @property {function(Element, Node): void} [afterNodeMorphed]
 * @property {function(Element): boolean} [beforeNodeRemoved]
 * @property {function(Element): void} [afterNodeRemoved]
 * @property {function(string, Element, "update" | "remove"): boolean} [beforeAttributeUpdated]
 */

/**
 * @typedef {object} Config
 *
 * @property {'outerHTML' | 'innerHTML'} [morphStyle]
 * @property {boolean} [ignoreActive]
 * @property {boolean} [ignoreActiveValue]
 * @property {boolean} [restoreFocus]
 * @property {ConfigCallbacks} [callbacks]
 * @property {ConfigHead} [head]
 */

/**
 * @typedef {function} NoOp
 *
 * @returns {void}
 */

/**
 * @typedef {object} ConfigHeadInternal
 *
 * @property {'merge' | 'append' | 'morph' | 'none'} style
 * @property {boolean} [block]
 * @property {boolean} [ignore]
 * @property {(function(Element): boolean) | NoOp} shouldPreserve
 * @property {(function(Element): boolean) | NoOp} shouldReAppend
 * @property {(function(Element): boolean) | NoOp} shouldRemove
 * @property {(function(Element, {added: Node[], kept: Element[], removed: Element[]}): void) | NoOp} afterHeadMorphed
 */

/**
 * @typedef {object} ConfigCallbacksInternal
 *
 * @property {(function(Node): boolean) | NoOp} beforeNodeAdded
 * @property {(function(Node): void) | NoOp} afterNodeAdded
 * @property {(function(Node, Node): boolean) | NoOp} beforeNodeMorphed
 * @property {(function(Node, Node): void) | NoOp} afterNodeMorphed
 * @property {(function(Node): boolean) | NoOp} beforeNodeRemoved
 * @property {(function(Node): void) | NoOp} afterNodeRemoved
 * @property {(function(string, Element, "update" | "remove"): boolean) | NoOp} beforeAttributeUpdated
 */

/**
 * @typedef {object} ConfigInternal
 *
 * @property {'outerHTML' | 'innerHTML'} morphStyle
 * @property {boolean} [ignoreActive]
 * @property {boolean} [ignoreActiveValue]
 * @property {boolean} [restoreFocus]
 * @property {ConfigCallbacksInternal} callbacks
 * @property {ConfigHeadInternal} head
 */

/**
 * @typedef {Object} IdSets
 * @property {Set<string>} persistentIds
 * @property {Map<Node, Set<string>>} idMap
 */

/**
 * @typedef {Function} Morph
 *
 * @param {Element | Document} oldNode
 * @param {Element | Node | HTMLCollection | Node[] | string | null} newContent
 * @param {Config} [config]
 * @returns {undefined | Node[]}
 */

// base IIFE to define idiomorph
/**
 *
 * @type {{defaults: ConfigInternal, morph: Morph}}
 */
var Idiomorph = (function () {
  "use strict";

  /**
   * @typedef {object} MorphContext
   *
   * @property {Element} target
   * @property {Element} newContent
   * @property {ConfigInternal} config
   * @property {ConfigInternal['morphStyle']} morphStyle
   * @property {ConfigInternal['ignoreActive']} ignoreActive
   * @property {ConfigInternal['ignoreActiveValue']} ignoreActiveValue
   * @property {ConfigInternal['restoreFocus']} restoreFocus
   * @property {Map<Node, Set<string>>} idMap
   * @property {Set<string>} persistentIds
   * @property {ConfigInternal['callbacks']} callbacks
   * @property {ConfigInternal['head']} head
   * @property {HTMLDivElement} pantry
   * @property {Element[]} activeElementAndParents
   */

  //=============================================================================
  // AND NOW IT BEGINS...
  //=============================================================================

  const noOp = () => {};
  /**
   * Default configuration values, updatable by users now
   * @type {ConfigInternal}
   */
  const defaults = {
    morphStyle: "outerHTML",
    callbacks: {
      beforeNodeAdded: noOp,
      afterNodeAdded: noOp,
      beforeNodeMorphed: noOp,
      afterNodeMorphed: noOp,
      beforeNodeRemoved: noOp,
      afterNodeRemoved: noOp,
      beforeAttributeUpdated: noOp,
    },
    head: {
      style: "merge",
      shouldPreserve: (elt) => elt.getAttribute("im-preserve") === "true",
      shouldReAppend: (elt) => elt.getAttribute("im-re-append") === "true",
      shouldRemove: noOp,
      afterHeadMorphed: noOp,
    },
    restoreFocus: true,
  };

  /**
   * Core idiomorph function for morphing one DOM tree to another
   *
   * @param {Element | Document} oldNode
   * @param {Element | Node | HTMLCollection | Node[] | string | null} newContent
   * @param {Config} [config]
   * @returns {Promise<Node[]> | Node[]}
   */
  function morph(oldNode, newContent, config = {}) {
    oldNode = normalizeElement(oldNode);
    const newNode = normalizeParent(newContent);
    const ctx = createMorphContext(oldNode, newNode, config);

    const morphedNodes = saveAndRestoreFocus(ctx, () => {
      return withHeadBlocking(
        ctx,
        oldNode,
        newNode,
        /** @param {MorphContext} ctx */ (ctx) => {
          if (ctx.morphStyle === "innerHTML") {
            morphChildren(ctx, oldNode, newNode);
            return Array.from(oldNode.childNodes);
          } else {
            return morphOuterHTML(ctx, oldNode, newNode);
          }
        },
      );
    });

    ctx.pantry.remove();
    return morphedNodes;
  }

  /**
   * Morph just the outerHTML of the oldNode to the newContent
   * We have to be careful because the oldNode could have siblings which need to be untouched
   * @param {MorphContext} ctx
   * @param {Element} oldNode
   * @param {Element} newNode
   * @returns {Node[]}
   */
  function morphOuterHTML(ctx, oldNode, newNode) {
    const oldParent = normalizeParent(oldNode);
    morphChildren(
      ctx,
      oldParent,
      newNode,
      // these two optional params are the secret sauce
      oldNode, // start point for iteration
      oldNode.nextSibling, // end point for iteration
    );
    // this is safe even with siblings, because normalizeParent returns a SlicedParentNode if needed.
    return Array.from(oldParent.childNodes);
  }

  /**
   * @param {MorphContext} ctx
   * @param {Function} fn
   * @returns {Promise<Node[]> | Node[]}
   */
  function saveAndRestoreFocus(ctx, fn) {
    if (!ctx.config.restoreFocus) return fn();
    let activeElement =
      /** @type {HTMLInputElement|HTMLTextAreaElement|null} */ (
        document.activeElement
      );

    // don't bother if the active element is not an input or textarea
    if (
      !(
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement
      )
    ) {
      return fn();
    }

    const { id: activeElementId, selectionStart, selectionEnd } = activeElement;

    const results = fn();

    if (
      activeElementId &&
      activeElementId !== document.activeElement?.getAttribute("id")
    ) {
      activeElement = ctx.target.querySelector(`[id="${activeElementId}"]`);
      activeElement?.focus();
    }
    if (activeElement && !activeElement.selectionEnd && selectionEnd) {
      activeElement.setSelectionRange(selectionStart, selectionEnd);
    }

    return results;
  }

  const morphChildren = (function () {
    /**
     * This is the core algorithm for matching up children.  The idea is to use id sets to try to match up
     * nodes as faithfully as possible.  We greedily match, which allows us to keep the algorithm fast, but
     * by using id sets, we are able to better match up with content deeper in the DOM.
     *
     * Basic algorithm:
     * - for each node in the new content:
     *   - search self and siblings for an id set match, falling back to a soft match
     *   - if match found
     *     - remove any nodes up to the match:
     *       - pantry persistent nodes
     *       - delete the rest
     *     - morph the match
     *   - elsif no match found, and node is persistent
     *     - find its match by querying the old root (future) and pantry (past)
     *     - move it and its children here
     *     - morph it
     *   - else
     *     - create a new node from scratch as a last result
     *
     * @param {MorphContext} ctx the merge context
     * @param {Element} oldParent the old content that we are merging the new content into
     * @param {Element} newParent the parent element of the new content
     * @param {Node|null} [insertionPoint] the point in the DOM we start morphing at (defaults to first child)
     * @param {Node|null} [endPoint] the point in the DOM we stop morphing at (defaults to after last child)
     */
    function morphChildren(
      ctx,
      oldParent,
      newParent,
      insertionPoint = null,
      endPoint = null,
    ) {
      // normalize
      if (
        oldParent instanceof HTMLTemplateElement &&
        newParent instanceof HTMLTemplateElement
      ) {
        // @ts-ignore we can pretend the DocumentFragment is an Element
        oldParent = oldParent.content;
        // @ts-ignore ditto
        newParent = newParent.content;
      }
      insertionPoint ||= oldParent.firstChild;

      // run through all the new content
      for (const newChild of newParent.childNodes) {
        // once we reach the end of the old parent content skip to the end and insert the rest
        if (insertionPoint && insertionPoint != endPoint) {
          const bestMatch = findBestMatch(
            ctx,
            newChild,
            insertionPoint,
            endPoint,
          );
          if (bestMatch) {
            // if the node to morph is not at the insertion point then remove/move up to it
            if (bestMatch !== insertionPoint) {
              removeNodesBetween(ctx, insertionPoint, bestMatch);
            }
            morphNode(bestMatch, newChild, ctx);
            insertionPoint = bestMatch.nextSibling;
            continue;
          }
        }

        // if the matching node is elsewhere in the original content
        if (newChild instanceof Element) {
          // we can pretend the id is non-null because the next `.has` line will reject it if not
          const newChildId = /** @type {String} */ (
            newChild.getAttribute("id")
          );
          if (ctx.persistentIds.has(newChildId)) {
            // move it and all its children here and morph
            const movedChild = moveBeforeById(
              oldParent,
              newChildId,
              insertionPoint,
              ctx,
            );
            morphNode(movedChild, newChild, ctx);
            insertionPoint = movedChild.nextSibling;
            continue;
          }
        }

        // last resort: insert the new node from scratch
        const insertedNode = createNode(
          oldParent,
          newChild,
          insertionPoint,
          ctx,
        );
        // could be null if beforeNodeAdded prevented insertion
        if (insertedNode) {
          insertionPoint = insertedNode.nextSibling;
        }
      }

      // remove any remaining old nodes that didn't match up with new content
      while (insertionPoint && insertionPoint != endPoint) {
        const tempNode = insertionPoint;
        insertionPoint = insertionPoint.nextSibling;
        removeNode(ctx, tempNode);
      }
    }

    /**
     * This performs the action of inserting a new node while handling situations where the node contains
     * elements with persistent ids and possible state info we can still preserve by moving in and then morphing
     *
     * @param {Element} oldParent
     * @param {Node} newChild
     * @param {Node|null} insertionPoint
     * @param {MorphContext} ctx
     * @returns {Node|null}
     */
    function createNode(oldParent, newChild, insertionPoint, ctx) {
      if (ctx.callbacks.beforeNodeAdded(newChild) === false) return null;
      if (ctx.idMap.has(newChild)) {
        // node has children with ids with possible state so create a dummy elt of same type and apply full morph algorithm
        const newEmptyChild = document.createElement(
          /** @type {Element} */ (newChild).tagName,
        );
        oldParent.insertBefore(newEmptyChild, insertionPoint);
        morphNode(newEmptyChild, newChild, ctx);
        ctx.callbacks.afterNodeAdded(newEmptyChild);
        return newEmptyChild;
      } else {
        // optimisation: no id state to preserve so we can just insert a clone of the newChild and its descendants
        const newClonedChild = document.importNode(newChild, true); // importNode to not mutate newParent
        oldParent.insertBefore(newClonedChild, insertionPoint);
        ctx.callbacks.afterNodeAdded(newClonedChild);
        return newClonedChild;
      }
    }

    //=============================================================================
    // Matching Functions
    //=============================================================================
    const findBestMatch = (function () {
      /**
       * Scans forward from the startPoint to the endPoint looking for a match
       * for the node. It looks for an id set match first, then a soft match.
       * We abort softmatching if we find two future soft matches, to reduce churn.
       * @param {Node} node
       * @param {MorphContext} ctx
       * @param {Node | null} startPoint
       * @param {Node | null} endPoint
       * @returns {Node | null}
       */
      function findBestMatch(ctx, node, startPoint, endPoint) {
        let softMatch = null;
        let nextSibling = node.nextSibling;
        let siblingSoftMatchCount = 0;

        let cursor = startPoint;
        while (cursor && cursor != endPoint) {
          // soft matching is a prerequisite for id set matching
          if (isSoftMatch(cursor, node)) {
            if (isIdSetMatch(ctx, cursor, node)) {
              return cursor; // found an id set match, we're done!
            }

            // we haven't yet saved a soft match fallback
            if (softMatch === null) {
              // the current soft match will hard match something else in the future, leave it
              if (!ctx.idMap.has(cursor)) {
                // save this as the fallback if we get through the loop without finding a hard match
                softMatch = cursor;
              }
            }
          }
          if (
            softMatch === null &&
            nextSibling &&
            isSoftMatch(cursor, nextSibling)
          ) {
            // The next new node has a soft match with this node, so
            // increment the count of future soft matches
            siblingSoftMatchCount++;
            nextSibling = nextSibling.nextSibling;

            // If there are two future soft matches, block soft matching for this node to allow
            // future siblings to soft match. This is to reduce churn in the DOM when an element
            // is prepended.
            if (siblingSoftMatchCount >= 2) {
              softMatch = undefined;
            }
          }

          // if the current node contains active element, stop looking for better future matches,
          // because if one is found, this node will be moved to the pantry, reparenting it and thus losing focus
          // @ts-ignore pretend cursor is Element rather than Node, we're just testing for array inclusion
          if (ctx.activeElementAndParents.includes(cursor)) break;

          cursor = cursor.nextSibling;
        }

        return softMatch || null;
      }

      /**
       *
       * @param {MorphContext} ctx
       * @param {Node} oldNode
       * @param {Node} newNode
       * @returns {boolean}
       */
      function isIdSetMatch(ctx, oldNode, newNode) {
        let oldSet = ctx.idMap.get(oldNode);
        let newSet = ctx.idMap.get(newNode);

        if (!newSet || !oldSet) return false;

        for (const id of oldSet) {
          // a potential match is an id in the new and old nodes that
          // has not already been merged into the DOM
          // But the newNode content we call this on has not been
          // merged yet and we don't allow duplicate IDs so it is simple
          if (newSet.has(id)) {
            return true;
          }
        }
        return false;
      }

      /**
       *
       * @param {Node} oldNode
       * @param {Node} newNode
       * @returns {boolean}
       */
      function isSoftMatch(oldNode, newNode) {
        // ok to cast: if one is not element, `id` and `tagName` will be undefined and we'll just compare that.
        const oldElt = /** @type {Element} */ (oldNode);
        const newElt = /** @type {Element} */ (newNode);

        return (
          oldElt.nodeType === newElt.nodeType &&
          oldElt.tagName === newElt.tagName &&
          // If oldElt has an `id` with possible state and it doesn't match newElt.id then avoid morphing.
          // We'll still match an anonymous node with an IDed newElt, though, because if it got this far,
          // its not persistent, and new nodes can't have any hidden state.
          // We can't use .id because of form input shadowing, and we can't count on .getAttribute's presence because it could be a document-fragment
          (!oldElt.getAttribute?.("id") ||
            oldElt.getAttribute?.("id") === newElt.getAttribute?.("id"))
        );
      }

      return findBestMatch;
    })();

    //=============================================================================
    // DOM Manipulation Functions
    //=============================================================================

    /**
     * Gets rid of an unwanted DOM node; strategy depends on nature of its reuse:
     * - Persistent nodes will be moved to the pantry for later reuse
     * - Other nodes will have their hooks called, and then are removed
     * @param {MorphContext} ctx
     * @param {Node} node
     */
    function removeNode(ctx, node) {
      // are we going to id set match this later?
      if (ctx.idMap.has(node)) {
        // skip callbacks and move to pantry
        moveBefore(ctx.pantry, node, null);
      } else {
        // remove for realsies
        if (ctx.callbacks.beforeNodeRemoved(node) === false) return;
        node.parentNode?.removeChild(node);
        ctx.callbacks.afterNodeRemoved(node);
      }
    }

    /**
     * Remove nodes between the start and end nodes
     * @param {MorphContext} ctx
     * @param {Node} startInclusive
     * @param {Node} endExclusive
     * @returns {Node|null}
     */
    function removeNodesBetween(ctx, startInclusive, endExclusive) {
      /** @type {Node | null} */
      let cursor = startInclusive;
      // remove nodes until the endExclusive node
      while (cursor && cursor !== endExclusive) {
        let tempNode = /** @type {Node} */ (cursor);
        cursor = cursor.nextSibling;
        removeNode(ctx, tempNode);
      }
      return cursor;
    }

    /**
     * Search for an element by id within the document and pantry, and move it using moveBefore.
     *
     * @param {Element} parentNode - The parent node to which the element will be moved.
     * @param {string} id - The ID of the element to be moved.
     * @param {Node | null} after - The reference node to insert the element before.
     *                              If `null`, the element is appended as the last child.
     * @param {MorphContext} ctx
     * @returns {Element} The found element
     */
    function moveBeforeById(parentNode, id, after, ctx) {
      const target =
        /** @type {Element} - will always be found */
        (
          // ctx.target.id unsafe because of form input shadowing
          // ctx.target could be a document fragment which doesn't have `getAttribute`
          (ctx.target.getAttribute?.("id") === id && ctx.target) ||
            ctx.target.querySelector(`[id="${id}"]`) ||
            ctx.pantry.querySelector(`[id="${id}"]`)
        );
      removeElementFromAncestorsIdMaps(target, ctx);
      moveBefore(parentNode, target, after);
      return target;
    }

    /**
     * Removes an element from its ancestors' id maps. This is needed when an element is moved from the
     * "future" via `moveBeforeId`. Otherwise, its erstwhile ancestors could be mistakenly moved to the
     * pantry rather than being deleted, preventing their removal hooks from being called.
     *
     * @param {Element} element - element to remove from its ancestors' id maps
     * @param {MorphContext} ctx
     */
    function removeElementFromAncestorsIdMaps(element, ctx) {
      // we know id is non-null String, because this function is only called on elements with ids
      const id = /** @type {String} */ (element.getAttribute("id"));
      /** @ts-ignore - safe to loop in this way **/
      while ((element = element.parentNode)) {
        let idSet = ctx.idMap.get(element);
        if (idSet) {
          idSet.delete(id);
          if (!idSet.size) {
            ctx.idMap.delete(element);
          }
        }
      }
    }

    /**
     * Moves an element before another element within the same parent.
     * Uses the proposed `moveBefore` API if available (and working), otherwise falls back to `insertBefore`.
     * This is essentialy a forward-compat wrapper.
     *
     * @param {Element} parentNode - The parent node containing the after element.
     * @param {Node} element - The element to be moved.
     * @param {Node | null} after - The reference node to insert `element` before.
     *                              If `null`, `element` is appended as the last child.
     */
    function moveBefore(parentNode, element, after) {
      // @ts-ignore - use proposed moveBefore feature
      if (parentNode.moveBefore) {
        try {
          // @ts-ignore - use proposed moveBefore feature
          parentNode.moveBefore(element, after);
        } catch (e) {
          // fall back to insertBefore as some browsers may fail on moveBefore when trying to move Dom disconnected nodes to pantry
          parentNode.insertBefore(element, after);
        }
      } else {
        parentNode.insertBefore(element, after);
      }
    }

    return morphChildren;
  })();

  //=============================================================================
  // Single Node Morphing Code
  //=============================================================================
  const morphNode = (function () {
    /**
     * @param {Node} oldNode root node to merge content into
     * @param {Node} newContent new content to merge
     * @param {MorphContext} ctx the merge context
     * @returns {Node | null} the element that ended up in the DOM
     */
    function morphNode(oldNode, newContent, ctx) {
      if (ctx.ignoreActive && oldNode === document.activeElement) {
        // don't morph focused element
        return null;
      }

      if (ctx.callbacks.beforeNodeMorphed(oldNode, newContent) === false) {
        return oldNode;
      }

      if (oldNode instanceof HTMLHeadElement && ctx.head.ignore) {
        // ignore the head element
      } else if (
        oldNode instanceof HTMLHeadElement &&
        ctx.head.style !== "morph"
      ) {
        // ok to cast: if newContent wasn't also a <head>, it would've got caught in the `!isSoftMatch` branch above
        handleHeadElement(
          oldNode,
          /** @type {HTMLHeadElement} */ (newContent),
          ctx,
        );
      } else {
        morphAttributes(oldNode, newContent, ctx);
        if (!ignoreValueOfActiveElement(oldNode, ctx)) {
          // @ts-ignore newContent can be a node here because .firstChild will be null
          morphChildren(ctx, oldNode, newContent);
        }
      }
      ctx.callbacks.afterNodeMorphed(oldNode, newContent);
      return oldNode;
    }

    /**
     * syncs the oldNode to the newNode, copying over all attributes and
     * inner element state from the newNode to the oldNode
     *
     * @param {Node} oldNode the node to copy attributes & state to
     * @param {Node} newNode the node to copy attributes & state from
     * @param {MorphContext} ctx the merge context
     */
    function morphAttributes(oldNode, newNode, ctx) {
      let type = newNode.nodeType;

      // if is an element type, sync the attributes from the
      // new node into the new node
      if (type === 1 /* element type */) {
        const oldElt = /** @type {Element} */ (oldNode);
        const newElt = /** @type {Element} */ (newNode);

        const oldAttributes = oldElt.attributes;
        const newAttributes = newElt.attributes;
        for (const newAttribute of newAttributes) {
          if (ignoreAttribute(newAttribute.name, oldElt, "update", ctx)) {
            continue;
          }
          if (oldElt.getAttribute(newAttribute.name) !== newAttribute.value) {
            oldElt.setAttribute(newAttribute.name, newAttribute.value);
          }
        }
        // iterate backwards to avoid skipping over items when a delete occurs
        for (let i = oldAttributes.length - 1; 0 <= i; i--) {
          const oldAttribute = oldAttributes[i];

          // toAttributes is a live NamedNodeMap, so iteration+mutation is unsafe
          // e.g. custom element attribute callbacks can remove other attributes
          if (!oldAttribute) continue;

          if (!newElt.hasAttribute(oldAttribute.name)) {
            if (ignoreAttribute(oldAttribute.name, oldElt, "remove", ctx)) {
              continue;
            }
            oldElt.removeAttribute(oldAttribute.name);
          }
        }

        if (!ignoreValueOfActiveElement(oldElt, ctx)) {
          syncInputValue(oldElt, newElt, ctx);
        }
      }

      // sync text nodes
      if (type === 8 /* comment */ || type === 3 /* text */) {
        if (oldNode.nodeValue !== newNode.nodeValue) {
          oldNode.nodeValue = newNode.nodeValue;
        }
      }
    }

    /**
     * NB: many bothans died to bring us information:
     *
     *  https://github.com/patrick-steele-idem/morphdom/blob/master/src/specialElHandlers.js
     *  https://github.com/choojs/nanomorph/blob/master/lib/morph.jsL113
     *
     * @param {Element} oldElement the element to sync the input value to
     * @param {Element} newElement the element to sync the input value from
     * @param {MorphContext} ctx the merge context
     */
    function syncInputValue(oldElement, newElement, ctx) {
      if (
        oldElement instanceof HTMLInputElement &&
        newElement instanceof HTMLInputElement &&
        newElement.type !== "file"
      ) {
        let newValue = newElement.value;
        let oldValue = oldElement.value;

        // sync boolean attributes
        syncBooleanAttribute(oldElement, newElement, "checked", ctx);
        syncBooleanAttribute(oldElement, newElement, "disabled", ctx);

        if (!newElement.hasAttribute("value")) {
          if (!ignoreAttribute("value", oldElement, "remove", ctx)) {
            oldElement.value = "";
            oldElement.removeAttribute("value");
          }
        } else if (oldValue !== newValue) {
          if (!ignoreAttribute("value", oldElement, "update", ctx)) {
            oldElement.setAttribute("value", newValue);
            oldElement.value = newValue;
          }
        }
        // TODO: QUESTION(1cg): this used to only check `newElement` unlike the other branches -- why?
        // did I break something?
      } else if (
        oldElement instanceof HTMLOptionElement &&
        newElement instanceof HTMLOptionElement
      ) {
        syncBooleanAttribute(oldElement, newElement, "selected", ctx);
      } else if (
        oldElement instanceof HTMLTextAreaElement &&
        newElement instanceof HTMLTextAreaElement
      ) {
        let newValue = newElement.value;
        let oldValue = oldElement.value;
        if (ignoreAttribute("value", oldElement, "update", ctx)) {
          return;
        }
        if (newValue !== oldValue) {
          oldElement.value = newValue;
        }
        if (
          oldElement.firstChild &&
          oldElement.firstChild.nodeValue !== newValue
        ) {
          oldElement.firstChild.nodeValue = newValue;
        }
      }
    }

    /**
     * @param {Element} oldElement element to write the value to
     * @param {Element} newElement element to read the value from
     * @param {string} attributeName the attribute name
     * @param {MorphContext} ctx the merge context
     */
    function syncBooleanAttribute(oldElement, newElement, attributeName, ctx) {
      // @ts-ignore this function is only used on boolean attrs that are reflected as dom properties
      const newLiveValue = newElement[attributeName],
        // @ts-ignore ditto
        oldLiveValue = oldElement[attributeName];
      if (newLiveValue !== oldLiveValue) {
        const ignoreUpdate = ignoreAttribute(
          attributeName,
          oldElement,
          "update",
          ctx,
        );
        if (!ignoreUpdate) {
          // update attribute's associated DOM property
          // @ts-ignore this function is only used on boolean attrs that are reflected as dom properties
          oldElement[attributeName] = newElement[attributeName];
        }
        if (newLiveValue) {
          if (!ignoreUpdate) {
            // https://developer.mozilla.org/en-US/docs/Glossary/Boolean/HTML
            // this is the correct way to set a boolean attribute to "true"
            oldElement.setAttribute(attributeName, "");
          }
        } else {
          if (!ignoreAttribute(attributeName, oldElement, "remove", ctx)) {
            oldElement.removeAttribute(attributeName);
          }
        }
      }
    }

    /**
     * @param {string} attr the attribute to be mutated
     * @param {Element} element the element that is going to be updated
     * @param {"update" | "remove"} updateType
     * @param {MorphContext} ctx the merge context
     * @returns {boolean} true if the attribute should be ignored, false otherwise
     */
    function ignoreAttribute(attr, element, updateType, ctx) {
      if (
        attr === "value" &&
        ctx.ignoreActiveValue &&
        element === document.activeElement
      ) {
        return true;
      }
      return (
        ctx.callbacks.beforeAttributeUpdated(attr, element, updateType) ===
        false
      );
    }

    /**
     * @param {Node} possibleActiveElement
     * @param {MorphContext} ctx
     * @returns {boolean}
     */
    function ignoreValueOfActiveElement(possibleActiveElement, ctx) {
      return (
        !!ctx.ignoreActiveValue &&
        possibleActiveElement === document.activeElement &&
        possibleActiveElement !== document.body
      );
    }

    return morphNode;
  })();

  //=============================================================================
  // Head Management Functions
  //=============================================================================
  /**
   * @param {MorphContext} ctx
   * @param {Element} oldNode
   * @param {Element} newNode
   * @param {function} callback
   * @returns {Node[] | Promise<Node[]>}
   */
  function withHeadBlocking(ctx, oldNode, newNode, callback) {
    if (ctx.head.block) {
      const oldHead = oldNode.querySelector("head");
      const newHead = newNode.querySelector("head");
      if (oldHead && newHead) {
        const promises = handleHeadElement(oldHead, newHead, ctx);
        // when head promises resolve, proceed ignoring the head tag
        return Promise.all(promises).then(() => {
          const newCtx = Object.assign(ctx, {
            head: {
              block: false,
              ignore: true,
            },
          });
          return callback(newCtx);
        });
      }
    }
    // just proceed if we not head blocking
    return callback(ctx);
  }

  /**
   *  The HEAD tag can be handled specially, either w/ a 'merge' or 'append' style
   *
   * @param {Element} oldHead
   * @param {Element} newHead
   * @param {MorphContext} ctx
   * @returns {Promise<void>[]}
   */
  function handleHeadElement(oldHead, newHead, ctx) {
    let added = [];
    let removed = [];
    let preserved = [];
    let nodesToAppend = [];

    // put all new head elements into a Map, by their outerHTML
    let srcToNewHeadNodes = new Map();
    for (const newHeadChild of newHead.children) {
      srcToNewHeadNodes.set(newHeadChild.outerHTML, newHeadChild);
    }

    // for each elt in the current head
    for (const currentHeadElt of oldHead.children) {
      // If the current head element is in the map
      let inNewContent = srcToNewHeadNodes.has(currentHeadElt.outerHTML);
      let isReAppended = ctx.head.shouldReAppend(currentHeadElt);
      let isPreserved = ctx.head.shouldPreserve(currentHeadElt);
      if (inNewContent || isPreserved) {
        if (isReAppended) {
          // remove the current version and let the new version replace it and re-execute
          removed.push(currentHeadElt);
        } else {
          // this element already exists and should not be re-appended, so remove it from
          // the new content map, preserving it in the DOM
          srcToNewHeadNodes.delete(currentHeadElt.outerHTML);
          preserved.push(currentHeadElt);
        }
      } else {
        if (ctx.head.style === "append") {
          // we are appending and this existing element is not new content
          // so if and only if it is marked for re-append do we do anything
          if (isReAppended) {
            removed.push(currentHeadElt);
            nodesToAppend.push(currentHeadElt);
          }
        } else {
          // if this is a merge, we remove this content since it is not in the new head
          if (ctx.head.shouldRemove(currentHeadElt) !== false) {
            removed.push(currentHeadElt);
          }
        }
      }
    }

    // Push the remaining new head elements in the Map into the
    // nodes to append to the head tag
    nodesToAppend.push(...srcToNewHeadNodes.values());

    let promises = [];
    for (const newNode of nodesToAppend) {
      // TODO: This could theoretically be null, based on type
      let newElt = /** @type {ChildNode} */ (
        document.createRange().createContextualFragment(newNode.outerHTML)
          .firstChild
      );
      if (ctx.callbacks.beforeNodeAdded(newElt) !== false) {
        if (
          ("href" in newElt && newElt.href) ||
          ("src" in newElt && newElt.src)
        ) {
          /** @type {(result?: any) => void} */ let resolve;
          let promise = new Promise(function (_resolve) {
            resolve = _resolve;
          });
          newElt.addEventListener("load", function () {
            resolve();
          });
          promises.push(promise);
        }
        oldHead.appendChild(newElt);
        ctx.callbacks.afterNodeAdded(newElt);
        added.push(newElt);
      }
    }

    // remove all removed elements, after we have appended the new elements to avoid
    // additional network requests for things like style sheets
    for (const removedElement of removed) {
      if (ctx.callbacks.beforeNodeRemoved(removedElement) !== false) {
        oldHead.removeChild(removedElement);
        ctx.callbacks.afterNodeRemoved(removedElement);
      }
    }

    ctx.head.afterHeadMorphed(oldHead, {
      added: added,
      kept: preserved,
      removed: removed,
    });
    return promises;
  }

  //=============================================================================
  // Create Morph Context Functions
  //=============================================================================
  const createMorphContext = (function () {
    /**
     *
     * @param {Element} oldNode
     * @param {Element} newContent
     * @param {Config} config
     * @returns {MorphContext}
     */
    function createMorphContext(oldNode, newContent, config) {
      const { persistentIds, idMap } = createIdMaps(oldNode, newContent);

      const mergedConfig = mergeDefaults(config);
      const morphStyle = mergedConfig.morphStyle || "outerHTML";
      if (!["innerHTML", "outerHTML"].includes(morphStyle)) {
        throw `Do not understand how to morph style ${morphStyle}`;
      }

      return {
        target: oldNode,
        newContent: newContent,
        config: mergedConfig,
        morphStyle: morphStyle,
        ignoreActive: mergedConfig.ignoreActive,
        ignoreActiveValue: mergedConfig.ignoreActiveValue,
        restoreFocus: mergedConfig.restoreFocus,
        idMap: idMap,
        persistentIds: persistentIds,
        pantry: createPantry(),
        activeElementAndParents: createActiveElementAndParents(oldNode),
        callbacks: mergedConfig.callbacks,
        head: mergedConfig.head,
      };
    }

    /**
     * Deep merges the config object and the Idiomorph.defaults object to
     * produce a final configuration object
     * @param {Config} config
     * @returns {ConfigInternal}
     */
    function mergeDefaults(config) {
      let finalConfig = Object.assign({}, defaults);

      // copy top level stuff into final config
      Object.assign(finalConfig, config);

      // copy callbacks into final config (do this to deep merge the callbacks)
      finalConfig.callbacks = Object.assign(
        {},
        defaults.callbacks,
        config.callbacks,
      );

      // copy head config into final config  (do this to deep merge the head)
      finalConfig.head = Object.assign({}, defaults.head, config.head);

      return finalConfig;
    }

    /**
     * @returns {HTMLDivElement}
     */
    function createPantry() {
      const pantry = document.createElement("div");
      pantry.hidden = true;
      document.body.insertAdjacentElement("afterend", pantry);
      return pantry;
    }

    /**
     * @param {Element} oldNode
     * @returns {Element[]}
     */
    function createActiveElementAndParents(oldNode) {
      /** @type {Element[]} */
      let activeElementAndParents = [];
      let elt = document.activeElement;
      if (elt?.tagName !== "BODY" && oldNode.contains(elt)) {
        while (elt) {
          activeElementAndParents.push(elt);
          if (elt === oldNode) break;
          elt = elt.parentElement;
        }
      }
      return activeElementAndParents;
    }

    /**
     * Returns all elements with an ID contained within the root element and its descendants
     *
     * @param {Element} root
     * @returns {Element[]}
     */
    function findIdElements(root) {
      let elements = Array.from(root.querySelectorAll("[id]"));
      // root could be a document fragment which doesn't have `getAttribute`
      if (root.getAttribute?.("id")) {
        elements.push(root);
      }
      return elements;
    }

    /**
     * A bottom-up algorithm that populates a map of Element -> IdSet.
     * The idSet for a given element is the set of all IDs contained within its subtree.
     * As an optimzation, we filter these IDs through the given list of persistent IDs,
     * because we don't need to bother considering IDed elements that won't be in the new content.
     *
     * @param {Map<Node, Set<string>>} idMap
     * @param {Set<string>} persistentIds
     * @param {Element} root
     * @param {Element[]} elements
     */
    function populateIdMapWithTree(idMap, persistentIds, root, elements) {
      for (const elt of elements) {
        // we can pretend id is non-null String, because the .has line will reject it immediately if not
        const id = /** @type {String} */ (elt.getAttribute("id"));
        if (persistentIds.has(id)) {
          /** @type {Element|null} */
          let current = elt;
          // walk up the parent hierarchy of that element, adding the id
          // of element to the parent's id set
          while (current) {
            let idSet = idMap.get(current);
            // if the id set doesn't exist, create it and insert it in the map
            if (idSet == null) {
              idSet = new Set();
              idMap.set(current, idSet);
            }
            idSet.add(id);

            if (current === root) break;
            current = current.parentElement;
          }
        }
      }
    }

    /**
     * This function computes a map of nodes to all ids contained within that node (inclusive of the
     * node).  This map can be used to ask if two nodes have intersecting sets of ids, which allows
     * for a looser definition of "matching" than tradition id matching, and allows child nodes
     * to contribute to a parent nodes matching.
     *
     * @param {Element} oldContent  the old content that will be morphed
     * @param {Element} newContent  the new content to morph to
     * @returns {IdSets}
     */
    function createIdMaps(oldContent, newContent) {
      const oldIdElements = findIdElements(oldContent);
      const newIdElements = findIdElements(newContent);

      const persistentIds = createPersistentIds(oldIdElements, newIdElements);

      /** @type {Map<Node, Set<string>>} */
      let idMap = new Map();
      populateIdMapWithTree(idMap, persistentIds, oldContent, oldIdElements);

      /** @ts-ignore - if newContent is a duck-typed parent, pass its single child node as the root to halt upwards iteration */
      const newRoot = newContent.__idiomorphRoot || newContent;
      populateIdMapWithTree(idMap, persistentIds, newRoot, newIdElements);

      return { persistentIds, idMap };
    }

    /**
     * This function computes the set of ids that persist between the two contents excluding duplicates
     *
     * @param {Element[]} oldIdElements
     * @param {Element[]} newIdElements
     * @returns {Set<string>}
     */
    function createPersistentIds(oldIdElements, newIdElements) {
      let duplicateIds = new Set();

      /** @type {Map<string, string>} */
      let oldIdTagNameMap = new Map();
      for (const { id, tagName } of oldIdElements) {
        if (oldIdTagNameMap.has(id)) {
          duplicateIds.add(id);
        } else {
          oldIdTagNameMap.set(id, tagName);
        }
      }

      let persistentIds = new Set();
      for (const { id, tagName } of newIdElements) {
        if (persistentIds.has(id)) {
          duplicateIds.add(id);
        } else if (oldIdTagNameMap.get(id) === tagName) {
          persistentIds.add(id);
        }
        // skip if tag types mismatch because its not possible to morph one tag into another
      }

      for (const id of duplicateIds) {
        persistentIds.delete(id);
      }
      return persistentIds;
    }

    return createMorphContext;
  })();

  //=============================================================================
  // HTML Normalization Functions
  //=============================================================================
  const { normalizeElement, normalizeParent } = (function () {
    /** @type {WeakSet<Node>} */
    const generatedByIdiomorph = new WeakSet();

    /**
     *
     * @param {Element | Document} content
     * @returns {Element}
     */
    function normalizeElement(content) {
      if (content instanceof Document) {
        return content.documentElement;
      } else {
        return content;
      }
    }

    /**
     *
     * @param {null | string | Node | HTMLCollection | Node[] | Document & {generatedByIdiomorph:boolean}} newContent
     * @returns {Element}
     */
    function normalizeParent(newContent) {
      if (newContent == null) {
        return document.createElement("div"); // dummy parent element
      } else if (typeof newContent === "string") {
        return normalizeParent(parseContent(newContent));
      } else if (
        generatedByIdiomorph.has(/** @type {Element} */ (newContent))
      ) {
        // the template tag created by idiomorph parsing can serve as a dummy parent
        return /** @type {Element} */ (newContent);
      } else if (newContent instanceof Node) {
        if (newContent.parentNode) {
          // we can't use the parent directly because newContent may have siblings
          // that we don't want in the morph, and reparenting might be expensive (TODO is it?),
          // so instead we create a fake parent node that only sees a slice of its children.
          /** @type {Element} */
          return /** @type {any} */ (new SlicedParentNode(newContent));
        } else {
          // a single node is added as a child to a dummy parent
          const dummyParent = document.createElement("div");
          dummyParent.append(newContent);
          return dummyParent;
        }
      } else {
        // all nodes in the array or HTMLElement collection are consolidated under
        // a single dummy parent element
        const dummyParent = document.createElement("div");
        for (const elt of [...newContent]) {
          dummyParent.append(elt);
        }
        return dummyParent;
      }
    }

    /**
     * A fake duck-typed parent element to wrap a single node, without actually reparenting it.
     * This is useful because the node may have siblings that we don't want in the morph, and it may also be moved
     * or replaced with one or more elements during the morph. This class effectively allows us a window into
     * a slice of a node's children.
     * "If it walks like a duck, and quacks like a duck, then it must be a duck!" -- James Whitcomb Riley (1849–1916)
     */
    class SlicedParentNode {
      /** @param {Node} node */
      constructor(node) {
        this.originalNode = node;
        this.realParentNode = /** @type {Element} */ (node.parentNode);
        this.previousSibling = node.previousSibling;
        this.nextSibling = node.nextSibling;
      }

      /** @returns {Node[]} */
      get childNodes() {
        // return slice of realParent's current childNodes, based on previousSibling and nextSibling
        const nodes = [];
        let cursor = this.previousSibling
          ? this.previousSibling.nextSibling
          : this.realParentNode.firstChild;
        while (cursor && cursor != this.nextSibling) {
          nodes.push(cursor);
          cursor = cursor.nextSibling;
        }
        return nodes;
      }

      /**
       * @param {string} selector
       * @returns {Element[]}
       */
      querySelectorAll(selector) {
        return this.childNodes.reduce((results, node) => {
          if (node instanceof Element) {
            if (node.matches(selector)) results.push(node);
            const nodeList = node.querySelectorAll(selector);
            for (let i = 0; i < nodeList.length; i++) {
              results.push(nodeList[i]);
            }
          }
          return results;
        }, /** @type {Element[]} */ ([]));
      }

      /**
       * @param {Node} node
       * @param {Node} referenceNode
       * @returns {Node}
       */
      insertBefore(node, referenceNode) {
        return this.realParentNode.insertBefore(node, referenceNode);
      }

      /**
       * @param {Node} node
       * @param {Node} referenceNode
       * @returns {Node}
       */
      moveBefore(node, referenceNode) {
        // @ts-ignore - use new moveBefore feature
        return this.realParentNode.moveBefore(node, referenceNode);
      }

      /**
       * for later use with populateIdMapWithTree to halt upwards iteration
       * @returns {Node}
       */
      get __idiomorphRoot() {
        return this.originalNode;
      }
    }

    /**
     *
     * @param {string} newContent
     * @returns {Node | null | DocumentFragment}
     */
    function parseContent(newContent) {
      let parser = new DOMParser();

      // remove svgs to avoid false-positive matches on head, etc.
      let contentWithSvgsRemoved = newContent.replace(
        /<svg(\s[^>]*>|>)([\s\S]*?)<\/svg>/gim,
        "",
      );

      // if the newContent contains a html, head or body tag, we can simply parse it w/o wrapping
      if (
        contentWithSvgsRemoved.match(/<\/html>/) ||
        contentWithSvgsRemoved.match(/<\/head>/) ||
        contentWithSvgsRemoved.match(/<\/body>/)
      ) {
        let content = parser.parseFromString(newContent, "text/html");
        // if it is a full HTML document, return the document itself as the parent container
        if (contentWithSvgsRemoved.match(/<\/html>/)) {
          generatedByIdiomorph.add(content);
          return content;
        } else {
          // otherwise return the html element as the parent container
          let htmlElement = content.firstChild;
          if (htmlElement) {
            generatedByIdiomorph.add(htmlElement);
          }
          return htmlElement;
        }
      } else {
        // if it is partial HTML, wrap it in a template tag to provide a parent element and also to help
        // deal with touchy tags like tr, tbody, etc.
        let responseDoc = parser.parseFromString(
          "<body><template>" + newContent + "</template></body>",
          "text/html",
        );
        let content = /** @type {HTMLTemplateElement} */ (
          responseDoc.body.querySelector("template")
        ).content;
        generatedByIdiomorph.add(content);
        return content;
      }
    }

    return { normalizeElement, normalizeParent };
  })();

  //=============================================================================
  // This is what ends up becoming the Idiomorph global object
  //=============================================================================
  return {
    morph,
    defaults,
  };
})();

module.exports = Idiomorph;


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
/******/ 	var __webpack_exports__ = __webpack_require__("./client/cms-live-updates/frame.ts");
/******/ 	
/******/ })()
;
//# sourceMappingURL=frame.js.map