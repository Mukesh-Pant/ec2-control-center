/**
 * content.js - EC2 Control Console Login Extension
 *
 * Injected into app.onecloudutopia.com at document_start.
 * Signals to the portal that the extension is installed and bridges
 * window.postMessage calls from the page to the extension background.
 */

// ── Signal to the portal that the extension is present ──────────────────────
// wrappedJSObject is required in Firefox: content scripts run in an isolated
// XRay-wrapped world; page scripts only see properties set on the unwrapped object.
window.wrappedJSObject.EC2CTRL_EXTENSION = true;
window.dispatchEvent(new CustomEvent('EC2CTRL_EXTENSION_READY'));

// ── Bridge: portal page → extension background ───────────────────────────────
window.addEventListener('message', function (event) {
  // Only accept messages from the same window (the portal page)
  if (event.source !== window) return;
  if (!event.data || event.data.type !== 'EC2CTRL_OPEN_CONSOLE') return;

  browser.runtime.sendMessage({
    type:        'OPEN_CONSOLE_TAB',
    accountId:   event.data.accountId,
    accountName: event.data.accountName,
    loginUrl:    event.data.loginUrl,
  });
});
