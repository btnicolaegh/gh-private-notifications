/**
 * compat.js
 *
 * Cross-browser compatibility shim.
 *
 * Firefox exposes a Promise-based `browser` global; Chrome only exposes
 * `chrome`.  This shim makes the rest of the extension code work unchanged
 * in both browsers by aliasing `chrome` as `browser` when `browser` is not
 * defined, and by mapping the Manifest-V3 `chrome.action` API back to the
 * `browser.browserAction` name used throughout this extension.
 */

if (typeof globalThis.browser === "undefined") {
  globalThis.browser = chrome; // eslint-disable-line no-undef
}

// Manifest V3 renamed `browserAction` → `action`.
// Alias it back so all existing `browser.browserAction.*` calls work.
if (!globalThis.browser.browserAction && globalThis.browser.action) {
  globalThis.browser.browserAction = globalThis.browser.action;
}
