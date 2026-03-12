/* ═══════════════════════════════════════════════
   Accounts Module — Multi-Account Management (M5)
   ═══════════════════════════════════════════════ */

const Accounts = (function () {

  var loaded = false;

  // ─── Load & Render Account Cards ───────────────────────────────────────────

  async function load() {
    var container = document.getElementById('accounts-grid');
    container.innerHTML = '<div class="acct-loading">Loading accounts…</div>';

    try {
      var res  = await API.getAccounts();
      var data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Request failed');

      var accounts = data.accounts || [];
      renderAccountCards(accounts);
      loaded = true;

    } catch (err) {
      if (err.message !== 'Session expired' && err.message !== 'Unauthorized') {
        container.innerHTML = '<div class="acct-empty">Error loading accounts: ' + _esc(err.message) + '</div>';
        App.showToast('Failed to load accounts: ' + err.message, 'err');
      }
    }
  }

  function renderAccountCards(accounts) {
    var container = document.getElementById('accounts-grid');
    if (accounts.length === 0) {
      container.innerHTML = '<div class="acct-empty">No accounts registered yet. Click "Add Account" to get started.</div>';
      return;
    }

    container.innerHTML = '';
    accounts.forEach(function (acct) {
      var card = document.createElement('div');
      card.className = 'act-card' +
        (acct.isCentral  ? ' central'       : '') +
        (!acct.enabled   ? ' disabled-card'  : '');
      card.setAttribute('data-account-id', acct.accountId);
      card.innerHTML = _buildCard(acct);
      container.appendChild(card);
    });
  }

  function _buildCard(acct) {
    var isCentral = acct.isCentral;

    var statusTag = acct.enabled
      ? '<span class="act-tag enabled">Enabled</span>'
      : '<span class="act-tag disabled">Disabled</span>';
    if (isCentral) {
      statusTag = '<span class="act-tag central">Central</span>';
    }

    var nameHtml = (isCentral
      ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="var(--green)" style="margin-right:4px;vertical-align:-2px"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg>'
      : '') + _esc(acct.accountName);

    var roleDisplay = isCentral
      ? '<span style="font-style:italic;color:var(--ink3);font-size:11px">LOCAL (Lambda credentials)</span>'
      : '<span class="act-role-arn" title="' + _esc(acct.roleArn) + '">' + _esc(_shortenArn(acct.roleArn)) + '</span>';

    var testBtn   = '<button class="act-btn act-btn-test"    onclick="Accounts.testConnection(\'' + _esc(acct.accountId) + '\')">Test</button>';
    var toggleBtn = isCentral ? '' : (acct.enabled
      ? '<button class="act-btn act-btn-disable" onclick="Accounts.setEnabled(\'' + _esc(acct.accountId) + '\', false)">Disable</button>'
      : '<button class="act-btn act-btn-enable"  onclick="Accounts.setEnabled(\'' + _esc(acct.accountId) + '\', true)">Enable</button>');
    var removeBtn = isCentral ? '' :
      '<button class="act-btn act-btn-remove" onclick="Accounts.removeAccount(\'' + _esc(acct.accountId) + '\', \'' + _esc(acct.accountName) + '\')">Remove</button>';

    return (
      '<div class="act-card-hd">' +
        '<div>' +
          '<div class="act-name">' + nameHtml + '</div>' +
          '<div class="act-tags" style="margin-top:6px">' + statusTag + '</div>' +
        '</div>' +
      '</div>' +
      '<div style="margin-bottom:12px">' +
        '<div style="font-size:11px;color:var(--ink3);margin-bottom:2px">Account ID</div>' +
        '<div class="act-id">' + _esc(acct.accountId) + '</div>' +
      '</div>' +
      '<div style="margin-bottom:14px">' +
        '<div style="font-size:11px;color:var(--ink3);margin-bottom:2px">Cross-Account Role</div>' +
        '<div class="act-role-arn">' + roleDisplay + '</div>' +
      '</div>' +
      '<div class="act-actions">' +
        testBtn + toggleBtn + removeBtn +
      '</div>'
    );
  }

  function _shortenArn(arn) {
    if (!arn || arn === 'LOCAL') return arn;
    var parts = arn.split(':');
    if (parts.length >= 6) return '…:' + parts.slice(5).join(':');
    return arn;
  }

  // ─── Actions ───────────────────────────────────────────────────────────────

  async function setEnabled(accountId, enabled) {
    var action = enabled ? 'enable' : 'disable';
    try {
      var res  = await API.postAccounts({ action: action, accountId: accountId });
      var data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Request failed');
      App.showToast('Account ' + action + 'd.', 'ok');
      App.log('Account ' + accountId + ' ' + action + 'd.', 'ok');
      load();
    } catch (err) {
      App.showToast('Failed: ' + err.message, 'err');
    }
  }

  async function testConnection(accountId) {
    var btn = document.querySelector('[data-account-id="' + accountId + '"] .btn-test');
    if (btn) { btn.disabled = true; btn.textContent = 'Testing…'; }

    try {
      var res  = await API.postAccounts({ action: 'test', accountId: accountId });
      var data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Request failed');

      if (data.success) {
        App.showToast('✓ ' + data.message, 'ok');
        App.log('Connection test OK — ' + accountId + ': ' + data.message, 'ok');
      } else {
        App.showToast('Connection failed: ' + data.message, 'err');
        App.log('Connection test FAILED — ' + accountId + ': ' + data.message, 'err');
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
      var res  = await API.postAccounts({ action: 'remove', accountId: accountId });
      var data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Request failed');
      App.showToast('Account removed.', 'ok');
      App.log('Account ' + accountId + ' (' + accountName + ') removed.', 'sys');
      load();
    } catch (err) {
      App.showToast('Failed: ' + err.message, 'err');
    }
  }

  // ─── Modal ─────────────────────────────────────────────────────────────────

  function openModal() {
    document.getElementById('modal-acct-id').value   = '';
    document.getElementById('modal-acct-name').value = '';
    document.getElementById('modal-acct-role').value = '';
    document.getElementById('modal-err').textContent  = '';
    document.getElementById('overlay').classList.add('open');
  }

  function closeModal() {
    document.getElementById('overlay').classList.remove('open');
  }

  async function confirmAdd() {
    var accountId   = document.getElementById('modal-acct-id').value.trim();
    var accountName = document.getElementById('modal-acct-name').value.trim();
    var roleArn     = document.getElementById('modal-acct-role').value.trim();
    var errEl       = document.getElementById('modal-err');

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

    var btn = document.getElementById('btn-modal-add');
    btn.disabled    = true;
    btn.textContent = 'Adding…';

    try {
      var res  = await API.postAccounts({ action: 'add', accountId: accountId, accountName: accountName, roleArn: roleArn });
      var data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Request failed');

      App.showToast('Account added successfully.', 'ok');
      App.log('Member account added: ' + accountId + ' (' + accountName + ')', 'ok');
      closeModal();
      load();

    } catch (err) {
      errEl.textContent = err.message;
    } finally {
      btn.disabled    = false;
      btn.textContent = 'Add Account';
    }
  }

  // ─── Tab Activation ────────────────────────────────────────────────────────

  function onTabActivated() {
    if (!loaded) load();
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  function _esc(s) {
    var d = document.createElement('div');
    d.textContent = String(s == null ? '' : s);
    return d.innerHTML;
  }

  // ─── Init ──────────────────────────────────────────────────────────────────

  function init() {
    var modalAcctId   = document.getElementById('modal-acct-id');
    var modalAcctName = document.getElementById('modal-acct-name');
    var modalAcctRole = document.getElementById('modal-acct-role');

    [modalAcctId, modalAcctName, modalAcctRole].forEach(function (el) {
      if (el) el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') confirmAdd();
      });
    });
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  return {
    init:           init,
    load:           load,
    onTabActivated: onTabActivated,
    setEnabled:     setEnabled,
    testConnection: testConnection,
    removeAccount:  removeAccount,
    openModal:      openModal,
    closeModal:     closeModal,
    confirmAdd:     confirmAdd,
  };

})();
