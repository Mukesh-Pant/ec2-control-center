/* ═══════════════════════════════════════════════
   Users Module — User & Role Management (M8)
   Admin-only: list users, assign roles, grant/revoke account access
   ═══════════════════════════════════════════════ */

const Users = (function () {

  var allAccounts = [];   // Cached from /accounts — used to populate grant modal
  var grantEmail  = '';   // Email of user for whom grant modal is open

  // ─── Role helpers ──────────────────────────────────────────────────────────

  var ROLE_LABELS = { admins: 'ADMIN', operators: 'OPERATOR', viewers: 'VIEWER' };

  function _deriveRole(groups) {
    if (!groups || !groups.length) return 'none';
    if (groups.indexOf('admins')    >= 0) return 'admins';
    if (groups.indexOf('operators') >= 0) return 'operators';
    if (groups.indexOf('viewers')   >= 0) return 'viewers';
    return 'none';
  }

  function _roleBadge(groups) {
    var role = _deriveRole(groups);
    if (role === 'none') {
      return '<span class="usr-badge usr-badge-none">NONE</span>';
    }
    return '<span class="usr-badge usr-badge-' + role + '">' + ROLE_LABELS[role] + '</span>';
  }

  // ─── Load & Render ─────────────────────────────────────────────────────────

  async function load() {
    var container = document.getElementById('users-table-wrap');
    container.innerHTML = '<div class="acct-loading">Loading users…</div>';

    try {
      var res  = await API.getUsers();
      var data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Request failed');

      // Also cache accounts list for grant modal
      try {
        var ar  = await API.getAccounts();
        var ad  = await ar.json();
        allAccounts = (ad.accounts || []).filter(function (a) { return a.enabled; });
      } catch (e) {
        allAccounts = [];
      }

      renderUserTable(data.users || []);

    } catch (err) {
      if (err.message !== 'Session expired' && err.message !== 'Unauthorized') {
        container.innerHTML = '<div class="acct-empty">Error loading users: ' + _esc(err.message) + '</div>';
        App.showToast('Failed to load users: ' + err.message, 'err');
      }
    }
  }

  function renderUserTable(users) {
    var container = document.getElementById('users-table-wrap');

    if (!users.length) {
      container.innerHTML = '<div class="acct-empty">No users found.</div>';
      return;
    }

    var rows = users.map(function (u) {
      var role         = _deriveRole(u.groups);
      var roleOptions  = _buildRoleOptions(role);
      var assignments  = (u.accountAssignments || []);
      var assignHtml   = assignments.length
        ? assignments.map(function (a) {
            return '<span class="usr-assign">' +
              _esc(a.accountId) +
              ' <span class="usr-assign-lvl">' + _esc(a.accessLevel || 'viewer') + '</span>' +
              ' <button class="usr-btn usr-btn-sm" onclick="Users.revokeAccount(\'' + _esc(u.email) + '\',\'' + _esc(a.accountId) + '\')">✕</button>' +
            '</span>';
          }).join('')
        : '<span style="color:var(--ink3);font-size:12px">None</span>';

      var enabledClass = u.enabled ? '' : ' usr-disabled';
      var statusBadge  = u.enabled
        ? '<span class="usr-status-ok">' + _esc(u.status || 'CONFIRMED') + '</span>'
        : '<span class="usr-status-dis">DISABLED</span>';

      return (
        '<tr class="usr-row' + enabledClass + '">' +
          '<td class="usr-email">' + _esc(u.email) + '</td>' +
          '<td>' + _roleBadge(u.groups) + '</td>' +
          '<td>' + statusBadge + '</td>' +
          '<td class="usr-accounts-cell">' +
            assignHtml +
            ' <button class="usr-btn usr-btn-sm usr-btn-grant" onclick="Users.openGrantModal(\'' + _esc(u.email) + '\')" title="Grant account access">＋</button>' +
          '</td>' +
          '<td class="usr-actions">' +
            '<select class="usr-role-select" id="role-sel-' + _esc(u.email) + '">' +
              roleOptions +
            '</select>' +
            '<button class="usr-btn usr-btn-apply" onclick="Users.applyRole(\'' + _esc(u.email) + '\')">Apply</button>' +
          '</td>' +
        '</tr>'
      );
    }).join('');

    container.innerHTML = (
      '<table class="usr-table">' +
        '<thead><tr>' +
          '<th>Email</th><th>Role</th><th>Status</th><th>Account Access</th><th>Change Role</th>' +
        '</tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table>'
    );
  }

  function _buildRoleOptions(currentRole) {
    var opts = [
      { value: 'none',     label: 'No role (blocked)' },
      { value: 'viewer',   label: 'Viewer (read-only)' },
      { value: 'operator', label: 'Operator (start/stop)' },
      { value: 'admin',    label: 'Admin (full access)' },
    ];
    // Map group name to option value
    var currentVal = currentRole === 'admins' ? 'admin'
                   : currentRole === 'operators' ? 'operator'
                   : currentRole === 'viewers' ? 'viewer'
                   : 'none';
    return opts.map(function (o) {
      return '<option value="' + o.value + '"' + (o.value === currentVal ? ' selected' : '') + '>' + o.label + '</option>';
    }).join('');
  }

  // ─── Set Role ──────────────────────────────────────────────────────────────

  async function applyRole(email) {
    var sel  = document.getElementById('role-sel-' + email);
    if (!sel) return;
    var role = sel.value;

    if (role === 'admin') {
      _showConfirm({
        title:        'Grant Admin Access',
        message:      'Grant admin access to ' + email + '? This gives full control over all accounts and users.',
        confirmLabel: 'Grant Admin',
        type:         'warn',
      }, async function () {
        await _doSetRole(email, role);
      });
      return;
    }

    await _doSetRole(email, role);
  }

  async function _doSetRole(email, role) {
    try {
      var res  = await API.postUsers({ action: 'setRole', email: email, role: role });
      var data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Request failed');
      App.showToast('Role updated for ' + email, 'ok');
      load();
    } catch (err) {
      App.showToast('Failed: ' + err.message, 'err');
    }
  }

  // ─── Grant Account Modal ───────────────────────────────────────────────────

  function openGrantModal(email) {
    grantEmail = email;

    var select = document.getElementById('grant-account-select');
    if (select) {
      select.innerHTML = allAccounts.length
        ? allAccounts.map(function (a) {
            return '<option value="' + _esc(a.accountId) + '">' +
              _esc(a.accountName) + ' (' + _esc(a.accountId) + ')</option>';
          }).join('')
        : '<option value="">No accounts available</option>';
    }

    var emailEl = document.getElementById('grant-user-email');
    if (emailEl) emailEl.value = email;

    var displayEl = document.getElementById('grant-modal-email');
    if (displayEl) displayEl.textContent = email;

    document.getElementById('overlay-grant').classList.add('open');
  }

  function closeGrantModal() {
    document.getElementById('overlay-grant').classList.remove('open');
    grantEmail = '';
  }

  async function confirmGrant() {
    var select    = document.getElementById('grant-account-select');
    var levelSel  = document.getElementById('grant-level-select');
    var errEl     = document.getElementById('grant-modal-err');
    var accountId = select ? select.value : '';
    var level     = levelSel ? levelSel.value : 'viewer';

    if (!accountId) {
      if (errEl) errEl.textContent = 'Please select an account.';
      return;
    }
    if (errEl) errEl.textContent = '';

    var btn = document.getElementById('btn-confirm-grant');
    if (btn) { btn.disabled = true; btn.textContent = 'Granting…'; }

    try {
      var res  = await API.postUsers({ action: 'grantAccount', email: grantEmail, accountId: accountId, accessLevel: level });
      var data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Request failed');
      App.showToast('Access granted to ' + grantEmail, 'ok');
      closeGrantModal();
      load();
    } catch (err) {
      if (errEl) errEl.textContent = err.message;
      App.showToast('Failed: ' + err.message, 'err');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Grant Access'; }
    }
  }

  // ─── Revoke Account ────────────────────────────────────────────────────────

  async function revokeAccount(email, accountId) {
    _showConfirm({
      title:        'Revoke Account Access',
      message:      'Revoke access to account ' + accountId + ' from ' + email + '?',
      confirmLabel: 'Revoke Access',
      type:         'danger',
    }, async function () {
      try {
        var res  = await API.postUsers({ action: 'revokeAccount', email: email, accountId: accountId });
        var data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Request failed');
        App.showToast('Access revoked.', 'ok');
        load();
      } catch (err) {
        App.showToast('Failed: ' + err.message, 'err');
      }
    });
  }

  // ─── Tab Activation ────────────────────────────────────────────────────────

  function onTabActivated() {
    load(); // always re-fetch — user/role changes must be reflected immediately
  }

  // ─── Init ──────────────────────────────────────────────────────────────────

  function init() {
    // Close grant modal on overlay background click
    var overlay = document.getElementById('overlay-grant');
    if (overlay) {
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) closeGrantModal();
      });
    }
    // Escape key closes modal
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeGrantModal();
    });
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  function _showConfirm(opts, onConfirm) {
    var type   = opts.type || 'danger';
    var icons  = {
      danger: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>',
      warn:   '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    };
    var btnCls = { danger: 'btn-red', warn: 'btn-amber', info: 'btn-blue' };

    var overlay = document.createElement('div');
    overlay.className = 'bk-confirm-overlay';
    overlay.innerHTML =
      '<div class="bk-confirm-card">' +
        '<div class="bk-confirm-icon-wrap bk-confirm-icon-' + type + '">' + (icons[type] || icons.danger) + '</div>' +
        '<div class="bk-confirm-title">' + _esc(opts.title) + '</div>' +
        '<div class="bk-confirm-msg">'   + _esc(opts.message) + '</div>' +
        '<div class="bk-confirm-actions">' +
          '<button class="btn btn-out"                          id="app-dlg-cancel">Cancel</button>' +
          '<button class="btn ' + (btnCls[type] || 'btn-red') + '" id="app-dlg-ok">' + _esc(opts.confirmLabel || 'Confirm') + '</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    function _remove() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }
    overlay.addEventListener('click', function (e) { if (e.target === overlay) _remove(); });
    overlay.querySelector('#app-dlg-cancel').addEventListener('click', _remove);
    overlay.querySelector('#app-dlg-ok').addEventListener('click', function () { _remove(); onConfirm(); });
  }

  function _esc(s) {
    var d = document.createElement('div');
    d.textContent = String(s == null ? '' : s);
    return d.innerHTML;
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  return {
    init:             init,
    load:             load,
    onTabActivated:   onTabActivated,
    applyRole:        applyRole,
    openGrantModal:   openGrantModal,
    closeGrantModal:  closeGrantModal,
    confirmGrant:     confirmGrant,
    revokeAccount:    revokeAccount,
  };

})();
