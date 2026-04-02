/* ═══════════════════════════════════════════════
   Audit Module — Event Log
   ═══════════════════════════════════════════════

   Displays a paginated, filterable table of every
   audit event (start / stop / auto-stop / account-linked).

   Filters:
     • Instance ID or name  (text)
     • User email           (text)
     • Action               (dropdown: All | START | STOP | AUTO-STOP | ACCOUNT-LINKED)
     • Account              (dropdown: populated from returned data)

   Daily Summary has moved to billing.js.
   ═══════════════════════════════════════════════ */

const Audit = (function () {

  // ─── State ────────────────────────────────────────────────────────────
  var lastKey      = null;   // DynamoDB pagination cursor
  var isLoading    = false;
  var firstLoad    = true;   // lazy-load on first tab activation
  var _debounceTimer = null; // input debounce

  // Map of accountId → accountName collected from loaded items + instances
  var knownAccounts = {};  // { accountId: accountName }

  // User emails for the User Email combobox (admin only, loaded once)
  var _auditUsers = [];
  var _allEvents  = [];   // accumulates all fetched records across server pages
  var _auditPage  = 0;    // current display page (0-based)
  var PAGE_SIZE   = 10;

  // ─── Event Log ────────────────────────────────────────────────────────

  // Resolve an instance filter value (name or ID) to an instance ID
  function _resolveInstanceId(val) {
    if (!val) return '';
    // If it looks like an instance ID already, use as-is
    if (/^i-[0-9a-f]+$/i.test(val)) return val;
    // Try to match by name from loaded instances
    var instances = (typeof Instances !== 'undefined' && Instances.getAll) ? Instances.getAll() : [];
    var match = instances.find(function (i) {
      return i.name && i.name.toLowerCase() === val.toLowerCase();
    });
    return match ? match.instanceId : val;
  }

  async function loadEvents(reset) {
    if (isLoading) return;
    if (reset) { _allEvents = []; _auditPage = 0; lastKey = null; }

    var rawInstance    = document.getElementById('audit-filter-instance').value.trim();
    var instanceFilter = _resolveInstanceId(rawInstance);
    var userFilter     = document.getElementById('audit-filter-user').value.trim();
    var actionFilter   = document.getElementById('audit-filter-action').value;
    var accountFilter  = document.getElementById('audit-filter-account').value;

    var tbody = document.getElementById('audit-events-tbody');
    if (reset) {
      tbody.innerHTML =
        '<tr><td colspan="7" class="audit-loading">Loading events\u2026</td></tr>';
    }

    isLoading = true;
    _updatePaginationBar();

    try {
      var res = await API.getAuditLog({
        instanceId: instanceFilter || undefined,
        userEmail:  userFilter     || undefined,
        action:     actionFilter   || undefined,
        accountId:  accountFilter  || undefined,
        limit:      50,
        lastKey:    lastKey,
      });
      var data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Request failed');

      var items = data.items || [];
      lastKey = data.lastKey || null;

      items.forEach(function (item) {
        if (item.accountId) knownAccounts[item.accountId] = item.accountName || item.accountId;
      });

      _allEvents = _allEvents.concat(items);

      if (reset && _allEvents.length === 0) {
        tbody.innerHTML =
          '<tr><td colspan="7" class="audit-empty">' +
          'No audit events found. Start or stop an instance to create entries.' +
          '</td></tr>';
        _updatePaginationBar();
      } else {
        _renderAuditPage();
      }

      populateAccountDropdown();

    } catch (err) {
      if (err.message !== 'Session expired' && err.message !== 'Unauthorized') {
        if (reset) {
          tbody.innerHTML =
            '<tr><td colspan="7" class="audit-empty">Error: ' +
            escHtml(err.message) + '</td></tr>';
        }
        App.showToast('Audit load failed: ' + err.message, 'err');
      }
    } finally {
      isLoading = false;
      _updatePaginationBar();
    }
  }

  function _renderAuditPage() {
    var totalPages = Math.max(1, Math.ceil(_allEvents.length / PAGE_SIZE));
    _auditPage = Math.min(_auditPage, totalPages - 1);  // clamp after filter resets

    var start = _auditPage * PAGE_SIZE;
    var rows  = _allEvents.slice(start, start + PAGE_SIZE);

    var tbody = document.getElementById('audit-events-tbody');
    if (!tbody) return;

    tbody.innerHTML = '';
    rows.forEach(function (item) {
      var tr = document.createElement('tr');
      tr.innerHTML = buildEventRow(item);
      tbody.appendChild(tr);
    });

    var countEl = document.getElementById('audit-record-count');
    if (countEl) countEl.textContent = _allEvents.length + ' loaded';

    _updatePaginationBar();
  }

  function _updatePaginationBar() {
    var prevBtn = document.getElementById('btn-audit-prev');
    var nextBtn = document.getElementById('btn-audit-next');
    var pgInfo  = document.getElementById('audit-pg-info');
    if (!prevBtn || !nextBtn || !pgInfo) return;

    var totalPages = Math.max(1, Math.ceil(_allEvents.length / PAGE_SIZE));
    // Clamp _auditPage — guards against "Page 6 of 5" if a next-page fetch fails
    // after _auditPage was already incremented in the Next button handler
    _auditPage = Math.min(_auditPage, totalPages - 1);
    var onLastPage = _auditPage >= totalPages - 1;

    prevBtn.disabled = _auditPage === 0 || isLoading;
    nextBtn.disabled = (onLastPage && !lastKey) || isLoading;
    pgInfo.textContent = 'Page ' + (_auditPage + 1) + ' of ' + totalPages +
      ' \u00b7 ' + _allEvents.length + ' loaded';
  }

  function buildEventRow(item) {
    var actionCls = actionClass(item.action);
    var actionLabel = (item.action || '--').toUpperCase();

    // INSTANCE cell — bold name + smaller blue mono ID
    var instName = escHtml(item.instanceName || item.instanceId || '--');
    var instId   = item.instanceName ? escHtml(item.instanceId || '') : '';
    var instCell =
      '<td class="audit-cell-instance">' +
        '<div class="audit-inst-name">' + instName + '</div>' +
        (instId ? '<div class="audit-inst-id">' + instId + '</div>' : '') +
      '</td>';

    // ACCOUNT cell — account name + smaller mono ID
    var acctName = escHtml(item.accountName || item.accountId || '--');
    var acctId   = item.accountId && item.accountName ? escHtml(item.accountId) : '';
    var acctCell =
      '<td class="audit-cell-account">' +
        '<div class="audit-acct-name">' + acctName + '</div>' +
        (acctId ? '<div class="audit-acct-id">' + acctId + '</div>' : '') +
      '</td>';

    return (
      '<td class="audit-cell-mono audit-cell-time">'  + escHtml(fmtTs(item.timestamp)) + '</td>' +
      '<td><span class="audit-action ' + actionCls + '">' + escHtml(actionLabel) + '</span></td>' +
      instCell +
      '<td class="audit-cell-type">'  + escHtml(item.instanceType || '\u2014') + '</td>' +
      acctCell +
      '<td class="audit-cell-region">' + escHtml(item.region    || '\u2014') + '</td>' +
      '<td class="audit-cell-user">'   + escHtml(item.userEmail || '\u2014') + '</td>'
    );
  }

  // ─── Account Dropdown ─────────────────────────────────────────────────

  function populateAccountDropdown() {
    var sel = document.getElementById('audit-filter-account');
    if (!sel) return;
    var current = sel.value;

    // Remove all options except the first ("All accounts")
    while (sel.options.length > 1) sel.remove(1);

    Object.keys(knownAccounts).sort().forEach(function (id) {
      var opt = document.createElement('option');
      opt.value       = id;
      opt.textContent = knownAccounts[id] + ' (' + id + ')';
      sel.appendChild(opt);
    });

    // Restore previous selection if still available
    if (current) sel.value = current;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  function actionClass(action) {
    if (!action) return 'action-neutral';
    var a = action.toLowerCase();
    if (a === 'start' || a === 'scheduled-start' || a === 'auto-start') return 'action-start';
    if (a === 'stop'  || a === 'scheduled-stop')                         return 'action-stop';
    if (a === 'auto-stop-idle' || a === 'auto-stop')                     return 'action-auto';
    if (a === 'account-linked' || a === 'account_linked')                return 'action-linked';
    return 'action-neutral';
  }

  function fmtTs(ts) {
    if (!ts) return '--';
    try {
      var d = new Date(ts);
      var datePart = d.toLocaleDateString('en-GB', {
        day:   '2-digit',
        month: 'short',
        year:  'numeric',
      }); // e.g. "12 Mar 2026"
      var timePart = d.toLocaleTimeString('en-GB', {
        hour:   '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }); // e.g. "15:03:05"
      return datePart + ', ' + timePart;
    } catch (e) { return ts; }
  }

  function escHtml(s) {
    var d = document.createElement('div');
    d.textContent = String(s == null ? '' : s);
    return d.innerHTML;
  }

  // ─── Seed knownAccounts from already-loaded instances ─────────────────

  function _seedAccountsFromInstances() {
    var instances = (typeof Instances !== 'undefined' && Instances.getAll) ? Instances.getAll() : [];
    instances.forEach(function (i) {
      if (i.accountId) {
        knownAccounts[i.accountId] = i.accountName || i.accountId;
      }
    });
    populateAccountDropdown();
    _populateInstanceDatalist(instances);
  }

  function _populateInstanceDatalist(instances) {
    var dl = document.getElementById('audit-instance-datalist');
    if (!dl) return;
    dl.innerHTML = '';
    instances.forEach(function (i) {
      if (i.name && i.name !== i.instanceId) {
        var opt = document.createElement('option');
        opt.value = i.name;
        opt.setAttribute('data-id', i.instanceId);
        dl.appendChild(opt);
      }
      var opt2 = document.createElement('option');
      opt2.value = i.instanceId;
      dl.appendChild(opt2);
    });
  }

  // ─── Load user emails for User Email combobox (admin only, once) ────────

  async function _loadAuditUsers() {
    try {
      var res  = await API.getUsers();
      var data = await res.json();
      _auditUsers = (data.users || [])
        .filter(function (u) {
          var g = u.groups || [];
          return g.indexOf('admins') !== -1 || g.indexOf('operators') !== -1
              || g.indexOf('viewers') !== -1;
        })
        .map(function (u) { return u.email; });
      var dl = document.getElementById('audit-user-list');
      if (dl) {
        dl.innerHTML = _auditUsers
          .map(function (e) { return '<option value="' + e.replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '">'; })
          .join('');
      }
    } catch (_) { _auditUsers = []; }
  }

  // ─── Called by Instances.refresh() after instances load ──────────────

  function onInstancesRefreshed() {
    _populateInstanceDatalist(
      (typeof Instances !== 'undefined' && Instances.getAll) ? Instances.getAll() : []
    );
  }

  // ─── Public: called by app.js when Audit tab is clicked ───────────────

  function onTabActivated() {
    _seedAccountsFromInstances();
    if (firstLoad) {
      firstLoad = false;
      loadEvents(true);  // Load all recent events by default (no filters)
    }
    var role = typeof Auth !== 'undefined' && Auth.getRole ? Auth.getRole() : '';
    if (role === 'admin' && _auditUsers.length === 0) _loadAuditUsers();
    if (typeof App !== 'undefined' && App.makeCombobox) {
      App.makeCombobox('audit-filter-instance', function () {
        return (typeof Instances !== 'undefined' && Instances.getAll)
          ? Instances.getAll().map(function (i) { return i.name || i.instanceId; }).filter(Boolean)
          : [];
      });
      App.makeCombobox('audit-filter-user', function () { return _auditUsers; });
    }
  }

  // ─── Init — wire all event listeners ──────────────────────────────────

  function init() {
    // Search button
    document.getElementById('btn-audit-search').addEventListener('click', function () {
      loadEvents(true);
    });

    // Pagination buttons
    document.getElementById('btn-audit-prev').addEventListener('click', function () {
      if (_auditPage > 0) { _auditPage--; _renderAuditPage(); }
    });
    document.getElementById('btn-audit-next').addEventListener('click', function () {
      if ((_auditPage + 1) * PAGE_SIZE < _allEvents.length) {
        _auditPage++; _renderAuditPage();
      } else if (lastKey) {
        _auditPage++; loadEvents(false);
      }
    });

    // Clear button — reset all 4 filters then reload
    document.getElementById('btn-audit-clear').addEventListener('click', function () {
      document.getElementById('audit-filter-instance').value = '';
      document.getElementById('audit-filter-user').value     = '';
      document.getElementById('audit-filter-action').value   = '';
      document.getElementById('audit-filter-account').value  = '';
      loadEvents(true);
    });

    // Dropdowns trigger immediate search on change
    document.getElementById('audit-filter-action').addEventListener('change', function () {
      loadEvents(true);
    });
    document.getElementById('audit-filter-account').addEventListener('change', function () {
      loadEvents(true);
    });

    // Text inputs: trigger search on every keystroke (debounced 350 ms) + Enter for instant
    ['audit-filter-instance', 'audit-filter-user'].forEach(function (id) {
      var el = document.getElementById(id);
      el.addEventListener('input', function () {
        clearTimeout(_debounceTimer);
        _debounceTimer = setTimeout(function () { loadEvents(true); }, 350);
      });
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          clearTimeout(_debounceTimer);
          loadEvents(true);
        }
      });
    });
  }

  // ─── Public API ───────────────────────────────────────────────────────

  return {
    init:                init,
    onTabActivated:      onTabActivated,
    onInstancesRefreshed: onInstancesRefreshed,
    search:              function () { loadEvents(true); },
  };

})();
