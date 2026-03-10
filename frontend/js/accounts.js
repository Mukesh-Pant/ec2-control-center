/* ═══════════════════════════════════════════════
   Accounts Module — Multi-Account Management (M5)
   ═══════════════════════════════════════════════ */

const Accounts = (function () {

  var loaded = false;

  // ─── Load & Render Account Cards ───────────────────────────────────────────

  async function loadAccounts() {
    var container = document.getElementById('accounts-tbody');
    container.innerHTML = '<div class="acct-loading">Loading accounts...</div>';

    try {
      var res  = await API.call('/accounts', 'GET', null);
      var data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Request failed');

      var accounts = data.accounts || [];
      renderAccountCards(accounts);
      loaded = true;

    } catch (err) {
      if (err.message !== 'Session expired' && err.message !== 'Unauthorized') {
        container.innerHTML = '<div class="acct-empty">Error loading accounts: ' + escHtml(err.message) + '</div>';
        App.showToast('Failed to load accounts: ' + err.message, 'err');
      }
    }
  }

  function renderAccountCards(accounts) {
    var container = document.getElementById('accounts-tbody');
    if (accounts.length === 0) {
      container.innerHTML = '<div class="acct-empty">No accounts registered yet. Click "Add Account" to get started.</div>';
      return;
    }

    container.innerHTML = '';
    accounts.forEach(function (acct) {
      var card = document.createElement('div');
      card.className = 'acct-card' +
        (acct.isCentral           ? ' central'      : '') +
        (!acct.enabled            ? ' disabled-card' : '');
      card.setAttribute('data-account-id', acct.accountId);
      card.innerHTML = buildAccountCard(acct);
      container.appendChild(card);
    });
  }

  function buildAccountCard(acct) {
    var isCentral = acct.isCentral;

    // Status badge
    var statusBadge = acct.enabled
      ? '<span class="acct-badge badge-enabled">Enabled</span>'
      : '<span class="acct-badge badge-disabled">Disabled</span>';
    if (isCentral) {
      statusBadge = '<span class="acct-badge badge-central">Central</span>';
    }

    // Name with optional star icon for central
    var nameHtml = (isCentral
      ? '<svg class="central-icon" width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg>'
      : '') +
      escHtml(acct.accountName);

    // Role ARN display
    var roleDisplay = isCentral
      ? '<span class="acct-role-local">LOCAL (Lambda credentials)</span>'
      : '<span class="acct-role-arn" title="' + escHtml(acct.roleArn) + '">' + escHtml(shortenArn(acct.roleArn)) + '</span>';

    // Action buttons
    var testBtn = '<button class="acct-btn btn-test" onclick="Accounts.testConnection(\'' + escHtml(acct.accountId) + '\')">Test</button>';

    var toggleBtn = isCentral ? '' :
      (acct.enabled
        ? '<button class="acct-btn btn-disable" onclick="Accounts.setEnabled(\'' + escHtml(acct.accountId) + '\', false)">Disable</button>'
        : '<button class="acct-btn btn-enable"  onclick="Accounts.setEnabled(\'' + escHtml(acct.accountId) + '\', true)">Enable</button>');

    var removeBtn = isCentral ? '' :
      '<button class="acct-btn btn-remove" onclick="Accounts.removeAccount(\'' + escHtml(acct.accountId) + '\', \'' + escHtml(acct.accountName) + '\')">Remove</button>';

    return (
      '<div class="acct-card-header">' +
        '<div class="acct-card-name">' + nameHtml + '</div>' +
        statusBadge +
      '</div>' +
      '<div class="acct-card-body">' +
        '<div class="acct-field">' +
          '<div class="acct-field-label">Account ID</div>' +
          '<div class="acct-field-value">' + escHtml(acct.accountId) + '</div>' +
        '</div>' +
        '<div class="acct-field">' +
          '<div class="acct-field-label">Cross-Account Role</div>' +
          '<div class="acct-field-value">' + roleDisplay + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="acct-card-footer">' +
        testBtn + toggleBtn + removeBtn +
      '</div>'
    );
  }

  function shortenArn(arn) {
    if (!arn || arn === 'LOCAL') return arn;
    var parts = arn.split(':');
    if (parts.length >= 6) return '…:' + parts.slice(5).join(':');
    return arn;
  }

  // ─── Actions ───────────────────────────────────────────────────────────────

  async function setEnabled(accountId, enabled) {
    var action = enabled ? 'enable' : 'disable';
    try {
      var res  = await API.call('/accounts', 'POST', { action: action, accountId: accountId });
      var data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Request failed');
      App.showToast('Account ' + action + 'd.', 'ok');
      App.addLog('Account ' + accountId + ' ' + action + 'd.', 'ok');
      loadAccounts();
    } catch (err) {
      App.showToast('Failed: ' + err.message, 'err');
    }
  }

  async function testConnection(accountId) {
    var btn = document.querySelector('[data-account-id="' + accountId + '"] .btn-test');
    if (btn) { btn.disabled = true; btn.textContent = 'Testing…'; }

    try {
      var res  = await API.call('/accounts', 'POST', { action: 'test', accountId: accountId });
      var data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Request failed');

      if (data.success) {
        App.showToast('✓ ' + data.message, 'ok');
        App.addLog('Connection test OK — ' + accountId + ': ' + data.message, 'ok');
      } else {
        App.showToast('Connection failed: ' + data.message, 'err');
        App.addLog('Connection test FAILED — ' + accountId + ': ' + data.message, 'err');
      }
    } catch (err) {
      App.showToast('Test error: ' + err.message, 'err');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Test'; }
    }
  }

  async function removeAccount(accountId, accountName) {
    if (!confirm('Remove account "' + accountName + '" (' + accountId + ') from the portal?\n\nInstances from this account will no longer be visible.')) {
      return;
    }
    try {
      var res  = await API.call('/accounts', 'POST', { action: 'remove', accountId: accountId });
      var data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Request failed');
      App.showToast('Account removed.', 'ok');
      App.addLog('Account ' + accountId + ' (' + accountName + ') removed.', 'sys');
      loadAccounts();
    } catch (err) {
      App.showToast('Failed: ' + err.message, 'err');
    }
  }

  // ─── Add Account Form ──────────────────────────────────────────────────────

  function toggleAddForm() {
    var form = document.getElementById('add-account-form');
    var btn  = document.getElementById('btn-show-add-account');
    var visible = form.style.display !== 'none';
    form.style.display = visible ? 'none' : 'block';
    btn.innerHTML = visible
      ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Add Account'
      : '✕ Cancel';
  }

  async function submitAddAccount() {
    var accountId   = document.getElementById('add-acct-id').value.trim();
    var accountName = document.getElementById('add-acct-name').value.trim();
    var roleArn     = document.getElementById('add-acct-role').value.trim();
    var errEl       = document.getElementById('add-acct-error');

    errEl.textContent = '';

    if (!accountId || !accountName || !roleArn) {
      errEl.textContent = 'All fields are required.';
      return;
    }
    if (!/^\d{12}$/.test(accountId)) {
      errEl.textContent = 'Account ID must be exactly 12 digits.';
      return;
    }
    if (!roleArn.startsWith('arn:aws:iam::')) {
      errEl.textContent = 'Role ARN must start with arn:aws:iam::';
      return;
    }

    var btn = document.getElementById('btn-add-account-submit');
    btn.disabled = true;
    btn.textContent = 'Adding…';

    try {
      var res  = await API.call('/accounts', 'POST', {
        action:      'add',
        accountId:   accountId,
        accountName: accountName,
        roleArn:     roleArn,
      });
      var data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Request failed');

      App.showToast('Account added successfully.', 'ok');
      App.addLog('Member account added: ' + accountId + ' (' + accountName + ')', 'ok');

      document.getElementById('add-acct-id').value   = '';
      document.getElementById('add-acct-name').value = '';
      document.getElementById('add-acct-role').value = '';
      toggleAddForm();
      loadAccounts();

    } catch (err) {
      errEl.textContent = err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Add Account';
    }
  }

  // ─── Tab Activation ────────────────────────────────────────────────────────

  function onTabActivated() {
    if (!loaded) loadAccounts();
  }

  // ─── Helper ────────────────────────────────────────────────────────────────

  function escHtml(s) {
    var d = document.createElement('div');
    d.textContent = String(s == null ? '' : s);
    return d.innerHTML;
  }

  // ─── Init ──────────────────────────────────────────────────────────────────

  function init() {
    document.getElementById('btn-show-add-account').addEventListener('click', toggleAddForm);
    document.getElementById('btn-add-account-submit').addEventListener('click', submitAddAccount);

    // Cancel button inside the form
    var cancelBtn = document.getElementById('btn-cancel-add-account');
    if (cancelBtn) cancelBtn.addEventListener('click', toggleAddForm);

    document.getElementById('btn-reload-accounts').addEventListener('click', function () {
      loaded = false;
      loadAccounts();
    });

    ['add-acct-id', 'add-acct-name', 'add-acct-role'].forEach(function (id) {
      document.getElementById(id).addEventListener('keydown', function (e) {
        if (e.key === 'Enter') submitAddAccount();
      });
    });
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  return {
    init:           init,
    onTabActivated: onTabActivated,
    setEnabled:     setEnabled,
    testConnection: testConnection,
    removeAccount:  removeAccount,
  };

})();
