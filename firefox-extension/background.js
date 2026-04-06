/**
 * background.js - EC2 Control Console Login Extension
 *
 * Manages one named Firefox container per AWS account and tracks the open tab
 * inside it. On each "Console Login" request:
 *   - If the account's tab is already open → focus it (no new login needed)
 *   - If the container exists but tab was closed → open a new tab with the
 *     federation URL inside the same container (session cookies may still be valid)
 *   - If no container exists yet → create one named "EC2Ctrl - <accountName>"
 *     and open the federation URL inside it
 *
 * Storage key "accountSessions":
 *   { [accountId]: { containerId: string, tabId: number } }
 *   containerId is persisted across browser restarts; tabId is cleared on tab close.
 */

const STORE_KEY = 'accountSessions';

async function openConsoleTab({ accountId, accountName, loginUrl }) {
  // ── 0. Validate loginUrl is a legitimate AWS federation URL ─────────────
  try {
    const parsed = new URL(loginUrl);
    if (
      parsed.protocol !== 'https:' ||
      parsed.hostname !== 'signin.aws.amazon.com' ||
      parsed.pathname !== '/federation'
    ) {
      throw new Error('Unexpected URL shape');
    }
  } catch (err) {
    console.error('[EC2Ctrl extension] Rejected invalid loginUrl:', err.message);
    return;
  }

  // ── 1. Load persisted session map ────────────────────────────────────────
  const stored = await browser.storage.local.get(STORE_KEY);
  const sessions = stored[STORE_KEY] || {};
  const existing = sessions[accountId];

  // ── 2. Try to focus an already-open tab ──────────────────────────────────
  if (existing && existing.tabId) {
    try {
      const tab = await browser.tabs.get(existing.tabId);
      // Tab is still open - just switch to it
      await browser.tabs.update(existing.tabId, { active: true });
      await browser.windows.update(tab.windowId, { focused: true });
      return;
    } catch (_) {
      // Tab was closed - fall through to create a new one
    }
  }

  // ── 3. Get or create the named container for this account ────────────────
  let containerId = existing && existing.containerId;

  if (containerId) {
    try {
      await browser.contextualIdentities.get(containerId);
      // Container still exists - reuse it
    } catch (_) {
      // Container was deleted - recreate
      containerId = null;
    }
  }

  if (!containerId) {
    const container = await browser.contextualIdentities.create({
      name:  'EC2Ctrl \u2014 ' + accountName,
      color: 'blue',
      icon:  'fingerprint',
    });
    containerId = container.cookieStoreId;
  }

  // ── 4. Open the federation URL in the container ──────────────────────────
  const newTab = await browser.tabs.create({
    url:         loginUrl,
    cookieStoreId: containerId,
  });

  // ── 5. Persist the mapping ───────────────────────────────────────────────
  sessions[accountId] = { containerId, tabId: newTab.id };
  await browser.storage.local.set({ [STORE_KEY]: sessions });

  // ── 6. Clean up tabId when the tab is closed ─────────────────────────────
  //    (Keep containerId so the same container is reused on the next login)
  browser.tabs.onRemoved.addListener(async function onTabClosed(closedId) {
    if (closedId !== newTab.id) return;
    browser.tabs.onRemoved.removeListener(onTabClosed);

    const current = (await browser.storage.local.get(STORE_KEY))[STORE_KEY] || {};
    if (current[accountId] && current[accountId].tabId === closedId) {
      delete current[accountId].tabId;
      await browser.storage.local.set({ [STORE_KEY]: current });
    }
  });
}

// ── Listen for messages from content.js ─────────────────────────────────────
browser.runtime.onMessage.addListener(function (msg) {
  if (msg.type === 'OPEN_CONSOLE_TAB') {
    openConsoleTab(msg).catch(function (err) {
      console.error('[EC2Ctrl extension] openConsoleTab failed:', err);
    });
  }
});
