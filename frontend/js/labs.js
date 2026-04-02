'use strict';

/* ═══════════════════════════════════════════════════
   Labs Module — EC2 Lab Provisioning (M11)
   IIFE → Labs global
   ═══════════════════════════════════════════════════ */

const Labs = (function () {

  // ─── Private state
  var loaded        = false;
  var wizardStep    = 0;       // 0 = active labs panel, 1–4 = wizard steps
  var wizardConfig  = {};      // collected form values across wizard steps
  var activeLabs    = [];      // last fetched from GET /labs
  var currentLabId  = null;    // labId being provisioned or viewed
  var _pollTimer    = null;    // setTimeout handle for provisioning poll
  var _accounts     = [];      // cached enabled accounts list
  var _labsUsers    = [];      // operator + admin emails for Submitted By combobox
  var _confirmCb    = null;    // pending in-page confirm callback
  var _labFilters = { platform: '', serverType: '', status: '', account: '', region: '', submittedBy: '' };
  var _expandedLabId = null;   // labId of currently expanded row, or null
  var _labsPage     = 0;
  var LAB_PAGE_SIZE = 10;
  var _guideOpen    = false;   // whether the "How it works" guide is expanded

  function _getNprRate() { return (window.NPR_RATE && window.NPR_RATE > 0) ? window.NPR_RATE : 135; }
  function _npmFmt(usd) {
    if (usd == null || usd <= 0) return '\u2014';
    return 'NPR\u00a0' + (usd * _getNprRate()).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // ─── Display maps

  var PLATFORM_LABELS = {
    'ubuntu':  'Ubuntu Server 24.04 LTS',
    'windows': 'Windows Server 2025',
  };

  var STATUS_LABELS = {
    'pending_approval': 'Pending Approval',
    'provisioning':     'Provisioning',
    'running':          'Running',
    'stopped':          'Stopped',
    'error':            'Error',
    'rejected':         'Rejected',
    'terminated':       'Terminated',
  };

  var STATUS_CLASSES = {
    'pending_approval': 'lbs-badge--yellow',
    'provisioning':     'lbs-badge--yellow',
    'running':          'lbs-badge--green',
    'stopped':          'lbs-badge--gray',
    'error':            'lbs-badge--red',
    'rejected':         'lbs-badge--red',
    'terminated':       'lbs-badge--gray',
  };

  var REGIONS = [
    { value: 'ap-south-1',     label: 'Asia Pacific (Mumbai)'       },
    { value: 'us-east-1',      label: 'US East (N. Virginia)'       },
    { value: 'us-east-2',      label: 'US East (Ohio)'              },
    { value: 'us-west-1',      label: 'US West (N. California)'     },
    { value: 'us-west-2',      label: 'US West (Oregon)'            },
    { value: 'eu-west-1',      label: 'Europe (Ireland)'            },
    { value: 'eu-central-1',   label: 'Europe (Frankfurt)'          },
    { value: 'ap-southeast-1', label: 'Asia Pacific (Singapore)'    },
    { value: 'ap-southeast-2', label: 'Asia Pacific (Sydney)'       },
    { value: 'ap-northeast-1', label: 'Asia Pacific (Tokyo)'        },
  ];

  var INSTANCE_GROUPS = [
    { label: 'General Purpose', types: [
      { value: 't3.micro',  label: 't3.micro  — 2 vCPU \u00b7 1 GB RAM  \u00b7 Burstable'  },
      { value: 't3.small',  label: 't3.small  — 2 vCPU \u00b7 2 GB RAM  \u00b7 Burstable'  },
      { value: 't3.medium', label: 't3.medium — 2 vCPU \u00b7 4 GB RAM  \u00b7 Burstable'  },
      { value: 't3.large',  label: 't3.large  — 2 vCPU \u00b7 8 GB RAM  \u00b7 Burstable'  },
    ]},
    { label: 'Compute Optimized', types: [
      { value: 'c5.large',  label: 'c5.large  — 2 vCPU \u00b7 4 GB RAM  \u00b7 Intel Xeon' },
      { value: 'c5.xlarge', label: 'c5.xlarge — 4 vCPU \u00b7 8 GB RAM  \u00b7 Intel Xeon' },
    ]},
    { label: 'Memory Optimized', types: [
      { value: 'r5.large',  label: 'r5.large  — 2 vCPU \u00b7 16 GB RAM \u00b7 Intel Xeon' },
      { value: 'r5.xlarge', label: 'r5.xlarge — 4 vCPU \u00b7 32 GB RAM \u00b7 Intel Xeon' },
    ]},
  ];

  var DURATION_OPTIONS = [
    { value: '1',      label: '1 hour'   },
    { value: '4',      label: '4 hours'  },
    { value: '8',      label: '8 hours'  },
    { value: '24',     label: '1 day'    },
    { value: '72',     label: '3 days'   },
    { value: '168',    label: '7 days'   },
    { value: 'custom', label: 'Custom…'  },
  ];

  // ─── Utility helpers

  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function _formatExpiry(isoTs) {
    var exp    = new Date(isoTs);
    var diffMs = exp - Date.now();
    if (diffMs <= 0) {
      var mo  = exp.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' });
      var day = exp.getUTCDate();
      var hr  = String(exp.getUTCHours()).padStart(2, '0');
      var min = String(exp.getUTCMinutes()).padStart(2, '0');
      return 'Expired ' + day + ' ' + mo + ' ' + hr + ':' + min + ' UTC';
    }
    var h = Math.floor(diffMs / 3600000);
    var m = Math.floor((diffMs % 3600000) / 60000);
    if (h >= 24) {
      var d = Math.floor(h / 24);
      return 'Expires in ' + d + 'd ' + (h % 24) + 'h';
    }
    return 'Expires in ' + h + 'h ' + m + 'm';
  }

  function _sshUser(platform) {
    if (platform === 'ubuntu') return 'ubuntu';
    return 'ec2-user';
  }

  function _fileToBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload  = function () { resolve(reader.result.split(',')[1]); };
      reader.onerror = function () { reject(new Error('File read error')); };
      reader.readAsDataURL(file);
    });
  }

  // ─── In-page confirmation dialog

  function _showConfirm(title, message, onConfirm) {
    var overlay = document.getElementById('lbs-confirm-overlay');
    var titleEl = document.getElementById('lbs-confirm-title');
    var msgEl   = document.getElementById('lbs-confirm-msg');
    if (!overlay) return;
    if (titleEl) titleEl.textContent = title   || 'Confirm Action';
    if (msgEl)   msgEl.textContent   = message || '';
    _confirmCb = onConfirm || null;
    overlay.style.display = 'flex';
  }

  function confirmOk() {
    var overlay = document.getElementById('lbs-confirm-overlay');
    if (overlay) overlay.style.display = 'none';
    var cb = _confirmCb;
    _confirmCb = null;
    if (cb) cb();
  }

  function confirmCancel() {
    var overlay = document.getElementById('lbs-confirm-overlay');
    if (overlay) overlay.style.display = 'none';
    _confirmCb = null;
  }

  // ─── Init: show Labs nav for admin/operator

  function init() {
    var role = Auth.getRole();
    if (role === 'admin' || role === 'operator') {
      var nav = document.getElementById('nav-labs');
      if (nav) nav.classList.remove('hidden');
    }
  }

  // ─── Lazy-load: called by App.go('labs') on first visit

  function onTabActivated() {
    if (!loaded) {
      loaded = true;
      _loadActiveLabs();
    }
  }

  // ─── Load enabled accounts for wizard step-1 selector

  async function _loadAccounts() {
    try {
      var res  = await API.getAccounts();
      var data = await res.json();
      _accounts = (data.accounts || []).filter(function (a) { return a.enabled === true; });
    } catch (_) {
      _accounts = [];
    }
  }

  // ─── Load operator + admin emails for Submitted By combobox (admin only)

  async function _loadLabsUsers() {
    try {
      var res  = await API.getUsers();
      var data = await res.json();
      _labsUsers = (data.users || [])
        .filter(function (u) {
          var g = u.groups || [];
          return g.indexOf('admins') !== -1 || g.indexOf('operators') !== -1;
        })
        .map(function (u) { return u.email; });
    } catch (_) { _labsUsers = []; }
  }

  // ─── Active Labs Panel

  async function _loadActiveLabs() {
    var listEl = document.getElementById('lbs-list');
    if (!listEl) return;
    listEl.innerHTML = '<div class="lbs-loading">Loading labs…</div>';

    var role = typeof Auth !== 'undefined' && Auth.getRole ? Auth.getRole() : '';
    if (_accounts.length === 0) await _loadAccounts();
    if (role === 'admin' && _labsUsers.length === 0) await _loadLabsUsers();

    try {
      var res  = await API.getLabsList();
      var data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed to load labs');
      activeLabs = data.labs || [];
      _renderLabsList();
    } catch (e) {
      listEl.innerHTML = '<div class="lbs-empty">Error loading labs: ' + _esc(e.message) + '</div>';
      App.showToast('Failed to load labs: ' + e.message, 'err');
    }
  }

  function _renderLabsList() {
    var listEl = document.getElementById('lbs-list');
    if (!listEl) return;

    // Save focus so text inputs (e.g. Submitted By) survive the DOM replace
    var _focusId  = document.activeElement ? document.activeElement.id : null;
    var _selStart = null, _selEnd = null;
    if (_focusId && document.activeElement.setSelectionRange) {
      try { _selStart = document.activeElement.selectionStart;
            _selEnd   = document.activeElement.selectionEnd; } catch (e) {}
    }

    // ── Empty state (no servers at all): show full onboarding + guide expanded
    if (activeLabs.length === 0) {
      var html = [
        '<div class="lbs-onboard">',
        '  <div class="lbs-onboard-hero">',
        '    <div class="lbs-onboard-icon">&#128187;</div>',
        '    <h2 class="lbs-onboard-title">No servers yet</h2>',
        '    <p class="lbs-onboard-desc">Provision a dedicated cloud server for your training or project. Your server is ready within minutes once payment is verified by our team.</p>',
        '    <button class="btn btn-blue" onclick="Labs.startWizard()">',
        '      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
        '      Create Your First Server',
        '    </button>',
        '  </div>',
        '  ' + _renderGuide(true),
        '</div>',
      ].join('\n');
      listEl.innerHTML = html;
      return;
    }

    // ── Stats cards
    var cntAll     = activeLabs.length;
    var cntActive  = activeLabs.filter(function(l){ return l.status === 'running' || l.status === 'provisioning'; }).length;
    var cntPending = activeLabs.filter(function(l){ return l.status === 'pending_approval'; }).length;
    var cntHistory = activeLabs.filter(function(l){ return l.status === 'terminated' || l.status === 'rejected'; }).length;

    var statsHtml = '<div class="lbs-stats-row">' +
      '<div class="lbs-stat-card">' +
        '<div class="lbs-stat-ico lbs-stat-ico--blue"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/></svg></div>' +
        '<div class="lbs-stat-val">' + cntAll + '</div>' +
        '<div class="lbs-stat-lbl">Total Servers</div>' +
      '</div>' +
      '<div class="lbs-stat-card">' +
        '<div class="lbs-stat-ico lbs-stat-ico--green"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg></div>' +
        '<div class="lbs-stat-val lbs-stat-green">' + cntActive + '</div>' +
        '<div class="lbs-stat-lbl">Active</div>' +
      '</div>' +
      '<div class="lbs-stat-card">' +
        '<div class="lbs-stat-ico lbs-stat-ico--amber"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div>' +
        '<div class="lbs-stat-val lbs-stat-amber">' + cntPending + '</div>' +
        '<div class="lbs-stat-lbl">Pending</div>' +
      '</div>' +
      '<div class="lbs-stat-card">' +
        '<div class="lbs-stat-ico lbs-stat-ico--gray"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg></div>' +
        '<div class="lbs-stat-val lbs-stat-gray">' + cntHistory + '</div>' +
        '<div class="lbs-stat-lbl">History</div>' +
      '</div>' +
    '</div>';

    // ── Collapsible guide (always present, collapsed by default when servers exist)
    var guideHtml = _renderGuide(_guideOpen);

    // ── Filter bar + filtered rows
    var visible    = activeLabs.filter(_passesLabFilter);
    var totalPages = Math.max(1, Math.ceil(visible.length / LAB_PAGE_SIZE));
    _labsPage = Math.min(_labsPage, totalPages - 1);
    var pageItems = visible.slice(_labsPage * LAB_PAGE_SIZE, (_labsPage + 1) * LAB_PAGE_SIZE);
    var html = statsHtml + guideHtml + _renderFilterBar();

    if (visible.length === 0) {
      html += '<div class="lbs-empty">No servers match the current filters.' +
        (cntAll > 0 ? ' <button class="btn-audit-clear" onclick="Labs._clearLabFilters()">Clear filters</button>' : '') +
        '</div>';
      listEl.innerHTML = html;
      _restoreFocus(_focusId, _selStart, _selEnd);
      return;
    }

    html += '<table class="lbs-tbl">';
    html += '<thead class="lbs-tbl-head"><tr>';
    html += '<th></th>';
    html += '<th>Server Name</th>';
    html += '<th>Platform</th>';
    html += '<th>Server Type</th>';
    html += '<th>Status</th>';
    html += '<th>Account</th>';
    html += '<th>Region</th>';
    html += '<th>Expires</th>';
    html += '</tr></thead>';
    html += '<tbody>';
    pageItems.forEach(function (lab) { html += _renderRow(lab); });
    html += '</tbody></table>';

    if (visible.length > LAB_PAGE_SIZE) {
      html += '<div class="audit-pg-row">' +
        '<button class="btn-pg" onclick="Labs._labsPageNav(-1)"' + (_labsPage === 0 ? ' disabled' : '') + '>\u2190 Prev</button>' +
        '<span class="pg-info">Page ' + (_labsPage + 1) + ' of ' + totalPages + ' \u00b7 ' + visible.length + ' servers</span>' +
        '<button class="btn-pg" onclick="Labs._labsPageNav(1)"' + (_labsPage >= totalPages - 1 ? ' disabled' : '') + '>Next \u2192</button>' +
        '</div>';
    }

    listEl.innerHTML = html;
    _restoreFocus(_focusId, _selStart, _selEnd);

    if (typeof Auth !== 'undefined' && Auth.getRole && Auth.getRole() === 'admin') {
      if (typeof App !== 'undefined' && App.makeCombobox) {
        App.makeCombobox('lbs-filter-submittedby', function () { return _labsUsers; });
      }
    }
  }

  function _restoreFocus(id, selStart, selEnd) {
    if (!id) return;
    var el = document.getElementById(id);
    if (!el) return;
    el.focus();
    if (selStart !== null) { try { el.setSelectionRange(selStart, selEnd); } catch (e) {} }
  }

  // ─── How it works guide (always rendered, collapsible)

  function _renderGuide(open) {
    var chevron = open ? '&#9650;' : '&#9660;';
    var body = open
      ? '<div class="lbs-how-works" style="margin-top:12px;">' +
          '<div class="lbs-hw-steps">' +
            '<div class="lbs-hw-step"><div class="lbs-hw-num">1</div><div><div class="lbs-hw-label">Configure</div><div class="lbs-hw-text">Choose your operating system, server size, storage, and the dates you need the server.</div></div></div>' +
            '<div class="lbs-hw-step"><div class="lbs-hw-num">2</div><div><div class="lbs-hw-label">Pay</div><div class="lbs-hw-text">Review the estimated cost and complete payment via QR code. Upload a screenshot as proof.</div></div></div>' +
            '<div class="lbs-hw-step"><div class="lbs-hw-num">3</div><div><div class="lbs-hw-label">Get approved</div><div class="lbs-hw-text">Our team verifies your payment (usually within minutes) and sets up your server automatically.</div></div></div>' +
            '<div class="lbs-hw-step"><div class="lbs-hw-num">4</div><div><div class="lbs-hw-label">Connect</div><div class="lbs-hw-text">Download your key file and connect. Your server stays live until the expiry date.</div></div></div>' +
          '</div>' +
        '</div>'
      : '';
    return '<div class="lbs-guide-toggle" onclick="Labs._toggleGuide()">' +
      '<span class="lbs-guide-toggle-lbl">&#128218; How it works</span>' +
      '<span class="lbs-guide-toggle-chev">' + chevron + '</span>' +
      '</div>' +
      body;
  }

  function _toggleGuide() {
    _guideOpen = !_guideOpen;
    _renderLabsList();
  }

  // ─── Filter helpers

  function _passesLabFilter(lab) {
    if (_labFilters.platform   && (lab.platform || '').toLowerCase() !== _labFilters.platform) return false;
    if (_labFilters.serverType && lab.instanceType !== _labFilters.serverType)                  return false;
    if (_labFilters.status     && lab.status !== _labFilters.status)                            return false;
    if (_labFilters.account    && lab.accountId !== _labFilters.account)                        return false;
    if (_labFilters.region     && lab.region !== _labFilters.region)                            return false;
    if (_labFilters.submittedBy && !(lab.userEmail || '').toLowerCase().includes(_labFilters.submittedBy.toLowerCase())) return false;
    return true;
  }

  function _setLabFilter(field, value) {
    _labFilters[field] = value;
    _expandedLabId = null;
    _labsPage = 0;
    _renderLabsList();
  }

  function _clearLabFilters() {
    _labFilters = { platform: '', serverType: '', status: '', account: '', region: '', submittedBy: '' };
    _expandedLabId = null;
    _labsPage = 0;
    _renderLabsList();
  }

  function _labsPageNav(delta) {
    var visible    = activeLabs.filter(_passesLabFilter);
    var totalPages = Math.max(1, Math.ceil(visible.length / LAB_PAGE_SIZE));
    _labsPage = Math.max(0, Math.min(totalPages - 1, _labsPage + delta));
    _renderLabsList();
  }

  // ─── Attribute filter bar (Audit Log-style)

  function _renderFilterBar() {
    var role    = typeof Auth !== 'undefined' && Auth.getRole ? Auth.getRole() : '';
    var isAdmin = (role === 'admin');

    var types    = Array.from(new Set(activeLabs.map(function(l){ return l.instanceType; }).filter(Boolean))).sort();
    var accounts = Array.from(new Set(activeLabs.map(function(l){ return l.accountId;    }).filter(Boolean))).sort();
    var regions  = Array.from(new Set(activeLabs.map(function(l){ return l.region;       }).filter(Boolean))).sort();

    function opt(val, label, cur) {
      return '<option value="' + _esc(val) + '"' + (cur === val ? ' selected' : '') + '>' + _esc(label) + '</option>';
    }

    var totalVisible = activeLabs.filter(_passesLabFilter).length;

    return '<div class="audit-filters audit-filters-v2" style="margin-bottom:16px">' +
      '<select class="audit-select" onchange="Labs._setLabFilter(\'platform\',this.value)">' +
        opt('',        'All platforms',  _labFilters.platform) +
        opt('windows', 'Windows',        _labFilters.platform) +
        opt('ubuntu',  'Linux / Ubuntu', _labFilters.platform) +
      '</select>' +
      '<select class="audit-select" onchange="Labs._setLabFilter(\'serverType\',this.value)">' +
        opt('', 'All types', _labFilters.serverType) +
        types.map(function(t){ return opt(t, t, _labFilters.serverType); }).join('') +
      '</select>' +
      '<select class="audit-select" onchange="Labs._setLabFilter(\'status\',this.value)">' +
        opt('',                'All status',        _labFilters.status) +
        opt('running',         'Running',          _labFilters.status) +
        opt('stopped',         'Stopped',          _labFilters.status) +
        opt('provisioning',    'Provisioning',     _labFilters.status) +
        opt('pending_approval','Pending Approval', _labFilters.status) +
        opt('terminated',      'Terminated',       _labFilters.status) +
        opt('rejected',        'Rejected',         _labFilters.status) +
      '</select>' +
      '<select class="audit-select" onchange="Labs._setLabFilter(\'account\',this.value)">' +
        opt('', 'All accounts', _labFilters.account) +
        accounts.map(function(id) {
          var acct  = _accounts.find(function(a){ return a.accountId === id; });
          var label = acct ? ((acct.name || id) + ' (' + id + ')') : id;
          return opt(id, label, _labFilters.account);
        }).join('') +
      '</select>' +
      '<select class="audit-select" onchange="Labs._setLabFilter(\'region\',this.value)">' +
        opt('', 'All regions', _labFilters.region) +
        regions.map(function(r){ return opt(r, r, _labFilters.region); }).join('') +
      '</select>' +
      (isAdmin
        ? '<div class="audit-filter-input-wrap">' +
            '<svg class="audit-filter-icon" viewBox="0 0 24 24" width="14" height="14">' +
              '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>' +
            '</svg>' +
            '<input class="audit-input" id="lbs-filter-submittedby" type="text"' +
              ' placeholder="Submitted by\u2026"' +
              ' value="' + _esc(_labFilters.submittedBy) + '"' +
              ' oninput="Labs._setLabFilter(\'submittedBy\',this.value)"/>' +
          '</div>'
        : '') +
      '<button class="btn-audit-clear" onclick="Labs._clearLabFilters()">Clear</button>' +
      '<span class="audit-record-count">' + totalVisible + ' server' + (totalVisible !== 1 ? 's' : '') + '</span>' +
    '</div>';
  }

  // ─── Render a single table row

  function _renderRow(lab) {
    var platformLabel = PLATFORM_LABELS[lab.platform] || lab.platform;
    var statusClass   = STATUS_CLASSES[lab.status]    || 'lbs-badge--gray';
    var statusLabel   = STATUS_LABELS[lab.status]     || lab.status;
    var labIdEsc      = _esc(lab.labId);
    var acctDisplay   = lab.accountId ? (lab.accountId.substring(0, 8) + '\u2026') : '\u2014';
    var isExpanded    = _expandedLabId === lab.labId;
    var chevClass     = 'lbs-chevron' + (isExpanded ? ' lbs-chevron--open' : '');
    var rowClass      = 'lbs-tbl-row' + (isExpanded ? ' lbs-tbl-row--expanded' : '');

    return '<tr class="' + rowClass + '" id="lbs-row-' + labIdEsc + '" onclick="Labs._toggleRowDetail(\'' + labIdEsc + '\')">' +
      '<td><span class="' + chevClass + '" id="lbs-chev-' + labIdEsc + '">&#9658;</span></td>' +
      '<td>' + _esc(lab.labName || ('ec2ctrl-lab-' + lab.labId.substring(0, 8))) + '</td>' +
      '<td>' + _esc(platformLabel) + '</td>' +
      '<td>' + _esc(lab.instanceType || '\u2014') + '</td>' +
      '<td><span class="lbs-badge ' + statusClass + '">' + _esc(statusLabel) + '</span></td>' +
      '<td>' + acctDisplay + '</td>' +
      '<td>' + _esc(lab.region || '\u2014') + '</td>' +
      '<td>' + _renderExpiry(lab) + '</td>' +
      '</tr>';
  }

  // ─── Render expiry cell (returns HTML string)

  function _renderExpiry(lab) {
    if (!lab.expiresAt) return '<span class="lbs-expiry-dead">\u2014</span>';
    var expired = new Date(lab.expiresAt) < new Date();
    var txt = _formatExpiry(lab.expiresAt);
    return '<span class="' + (expired ? 'lbs-expiry-dead' : 'lbs-expiry-warn') + '">' + _esc(txt) + '</span>';
  }

  function _confirmDelete(labId) {
    _showConfirm(
      'Terminate Server?',
      'This will permanently terminate this server and release all associated resources. This cannot be undone.',
      async function () {
        try {
          var res  = await API.deleteLabInstance({ labId: labId });
          var data = await res.json();
          if (!res.ok) throw new Error(data.message || data.error || 'Terminate failed');
          App.showToast('Server terminated', 'ok');
          _expandedLabId = null;
          await _loadActiveLabs();
        } catch (e) {
          App.showToast('Terminate error: ' + e.message, 'err');
        }
      }
    );
  }

  function _confirmRemoveHistory(labId) {
    _showConfirm(
      'Remove from History?',
      'This will remove this entry from your history. The server is already terminated so no resources will be affected.',
      async function () {
        try {
          var res  = await API.deleteLabInstance({ labId: labId });
          var data = await res.json();
          if (!res.ok) throw new Error(data.message || data.error || 'Remove failed');
          App.showToast('Removed from history', 'ok');
          _expandedLabId = null;
          await _loadActiveLabs();
        } catch (e) {
          App.showToast('Remove error: ' + e.message, 'err');
        }
      }
    );
  }

  function _confirmCancelRequest(labId) {
    _showConfirm(
      'Cancel Server Request?',
      'This will cancel your pending server request and delete your payment submission. This cannot be undone.',
      async function () {
        try {
          var res  = await API.deleteLabInstance({ labId: labId });
          var data = await res.json();
          if (!res.ok) throw new Error(data.message || data.error || 'Cancel failed');
          App.showToast('Server request cancelled', 'ok');
          _expandedLabId = null;
          await _loadActiveLabs();
        } catch (e) {
          App.showToast('Cancel error: ' + e.message, 'err');
        }
      }
    );
  }

  // ─── Lab instance start / stop ────────────────────────────────────────────

  async function _startLab(labId) {
    var lab = activeLabs.find(function (l) { return l.labId === labId; });
    if (!lab || !lab.instanceId) { App.showToast('Instance ID not available', 'err'); return; }
    try {
      var res  = await API.ec2Action({
        action:       'start',
        instanceId:   lab.instanceId,
        accountId:    lab.accountId,
        region:       lab.region,
        instanceName: lab.labName || lab.labId,
        instanceType: lab.instanceType,
      });
      var data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Start failed');
      App.showToast('Server start initiated', 'ok');
      await _loadActiveLabs();
    } catch (e) {
      App.showToast('Start error: ' + e.message, 'err');
    }
  }

  async function _stopLab(labId) {
    var lab = activeLabs.find(function (l) { return l.labId === labId; });
    if (!lab || !lab.instanceId) { App.showToast('Instance ID not available', 'err'); return; }
    try {
      var res  = await API.ec2Action({
        action:       'stop',
        instanceId:   lab.instanceId,
        accountId:    lab.accountId,
        region:       lab.region,
        instanceName: lab.labName || lab.labId,
        instanceType: lab.instanceType,
      });
      var data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Stop failed');
      App.showToast('Server stop initiated', 'ok');
      await _loadActiveLabs();
    } catch (e) {
      App.showToast('Stop error: ' + e.message, 'err');
    }
  }

  // ─── Row expand / collapse

  function _toggleRowDetail(labId) {
    if (_expandedLabId === labId) {
      _collapseDetail();
      return;
    }
    if (_expandedLabId) _collapseDetail();

    var lab = activeLabs.find(function (l) { return l.labId === labId; });
    if (!lab) return;

    _expandedLabId = labId;
    var row = document.getElementById('lbs-row-' + labId);
    if (!row) return;
    row.classList.add('lbs-tbl-row--expanded');
    var chev = document.getElementById('lbs-chev-' + labId);
    if (chev) chev.classList.add('lbs-chevron--open');

    var detailRow = document.createElement('tr');
    detailRow.id        = 'lbs-detail-' + labId;
    detailRow.className = 'lbs-detail-row';
    detailRow.innerHTML = '<td colspan="8">' + _renderDetailPanel(lab) + '</td>';
    row.parentNode.insertBefore(detailRow, row.nextSibling);
  }

  function _collapseDetail() {
    if (!_expandedLabId) return;
    var row = document.getElementById('lbs-row-' + _expandedLabId);
    if (row) {
      row.classList.remove('lbs-tbl-row--expanded');
      var chev = document.getElementById('lbs-chev-' + _expandedLabId);
      if (chev) chev.classList.remove('lbs-chevron--open');
    }
    var detailRow = document.getElementById('lbs-detail-' + _expandedLabId);
    if (detailRow) detailRow.remove();
    _expandedLabId = null;
  }

  // ─── Render inline detail panel for an expanded row

  function _renderDetailPanel(lab) {
    var labIdEsc      = _esc(lab.labId);
    var role          = Auth.getRole();
    var isAdmin       = role === 'admin';
    var callerEmail   = Auth.getEmail ? Auth.getEmail() : '';
    var isOwner       = !!(callerEmail && (lab.userEmail === callerEmail || lab.callerEmail === callerEmail));
    var canTerminate  = isAdmin;
    var canStartStop  = isAdmin || isOwner;
    var isWindows     = lab.platform === 'windows';
    var platformLabel = PLATFORM_LABELS[lab.platform] || lab.platform || '\u2014';
    var ip            = lab.publicIp || lab.publicDns || '';
    var costStr       = lab.estimatedCost != null ? _npmFmt(Number(lab.estimatedCost)) : '\u2014';
    var expiry        = lab.expiresAt ? _formatExpiry(lab.expiresAt) : '\u2014';
    var createdAt     = lab.createdAt ? new Date(lab.createdAt).toUTCString() : '\u2014';
    var storageStr    = lab.storageGb ? lab.storageGb + ' GB' : '\u2014';

    // ── Fixed IP display
    var eipValue;
    if (lab.elasticIp && lab.allocationId) {
      eipValue = _esc(ip || '\u2014') + ' <span style="color:var(--ink3);font-size:11px;">(fixed)</span>';
    } else if (lab.elasticIp) {
      eipValue = 'Requested';
    } else {
      eipValue = 'Dynamic (changes on restart)';
    }

    // ── Server Info section (always shown)
    var stateLabel = STATUS_LABELS[lab.status] || lab.status || '\u2014';
    var stateClass = STATUS_CLASSES[lab.status] || 'lbs-badge--gray';
    var infoItems = [
      { label: 'Server ID',     value: '<code style="font-size:12px;user-select:all;">' + labIdEsc + '</code>' },
      { label: 'State',         value: '<span class="lbs-badge ' + stateClass + '">' + _esc(stateLabel) + '</span>' },
      { label: 'Created',       value: _esc(createdAt) },
      { label: 'Estimated Cost',value: _esc(costStr) },
      { label: 'Public IP',     value: _esc(ip || '\u2014') },
      { label: 'Fixed IP',      value: eipValue },
      { label: 'Platform',      value: _esc(platformLabel) },
      { label: 'Server Type',   value: _esc(lab.instanceType || '\u2014') },
      { label: 'Storage',       value: _esc(storageStr) },
      { label: 'Expires',       value: _esc(expiry) },
    ];
    if (isAdmin) {
      infoItems.splice(2, 0, { label: 'Submitted by', value: _esc(lab.userEmail || lab.callerEmail || '\u2014') });
    }

    var infoHtml = infoItems.map(function (item) {
      return '<div class="lbs-detail-info-item">' +
        '<span class="lbs-detail-info-label">' + item.label + '</span>' +
        '<span class="lbs-detail-info-value">' + item.value + '</span>' +
        '</div>';
    }).join('');

    var html = '<div class="lbs-detail-panel">' +
      '<button class="lbs-detail-close" onclick="Labs._toggleRowDetail(\'' + labIdEsc + '\')" title="Close">\u2715</button>' +
      '<div class="lbs-detail-section">' +
        '<div class="lbs-detail-section-title">Server Details</div>' +
        '<div class="lbs-detail-info-grid">' + infoHtml + '</div>' +
      '</div>';

    // ── Connection section (running only)
    if (lab.status === 'running') {
      var sshUser = _sshUser(lab.platform);
      var sshCmd  = 'ssh -i keypair.pem ' + sshUser + '@' + (ip || '(IP pending)');
      var connHtml;
      if (isWindows) {
        connHtml =
          '<button class="btn btn-sm btn-outline" onclick="Labs._downloadRdp(\'' + labIdEsc + '\')">Download RDP File</button>' +
          '<button class="btn btn-sm btn-outline" onclick="Labs._getWindowsPassword(\'' + labIdEsc + '\')">Get Windows Password</button>' +
          '<div id="lbs-win-pass-' + labIdEsc + '" class="lbs-code-block" style="display:none;margin-top:10px;"></div>';
      } else {
        connHtml =
          '<div class="lbs-code-block" style="margin-bottom:10px;">' + _esc(sshCmd) + '</div>' +
          '<button class="btn btn-sm btn-outline" onclick="Labs.downloadKeypair(\'' + labIdEsc + '\')">Download Key File (.pem)</button>';
      }
      html += '<div class="lbs-detail-section">' +
        '<div class="lbs-detail-section-title">' + (isWindows ? 'Remote Desktop Connection' : 'SSH Connection') + '</div>' +
        '<div class="lbs-detail-actions">' + connHtml + '</div>' +
        '</div>';

      // ── Actions section
      var actionBtns = '<button class="btn btn-sm btn-outline" onclick="Labs.downloadLabInfo(\'' + labIdEsc + '\')">Download Connection Info (.txt)</button>';
      if (canStartStop) {
        actionBtns += ' <button class="btn btn-sm btn-outline" onclick="Labs._stopLab(\'' + labIdEsc + '\')">&#9646;&#9646; Stop Server</button>';
      }
      if (canTerminate) {
        actionBtns += ' <button class="btn btn-sm btn-danger" onclick="Labs._confirmDelete(\'' + labIdEsc + '\')">Terminate Server</button>';
      }
      html += '<div class="lbs-detail-section">' +
        '<div class="lbs-detail-section-title">Manage Server</div>' +
        '<div class="lbs-detail-actions">' + actionBtns + '</div>' +
        '</div>';
    }

    // ── Stopped server info
    if (lab.status === 'stopped') {
      html += '<div class="lbs-detail-section">' +
        '<div class="lbs-detail-section-title">Server Stopped</div>' +
        '<div class="lbs-verification-notice">' +
          '<div class="lbs-verification-icon" style="font-size:22px;">&#9646;&#9646;</div>' +
          '<div>' +
            '<h4 class="lbs-verification-title">Server is currently stopped</h4>' +
            '<p class="lbs-verification-msg">This server is stopped and not incurring compute costs.</p>' +
          '</div>' +
        '</div>';
      var stoppedBtns = '';
      if (canStartStop) {
        stoppedBtns += '<button class="btn btn-sm btn-success" onclick="Labs._startLab(\'' + labIdEsc + '\')">&#9654; Start Server</button>';
      }
      if (canTerminate) {
        stoppedBtns += ' <button class="btn btn-sm btn-danger" onclick="Labs._confirmDelete(\'' + labIdEsc + '\')">Terminate Server</button>';
      }
      if (stoppedBtns) {
        html += '<div class="lbs-detail-actions" style="margin-top:12px;">' + stoppedBtns + '</div>';
      }
      html += '</div>';
    }

    // ── Setting up status
    if (lab.status === 'provisioning') {
      html += '<div class="lbs-detail-section">' +
        '<div class="lbs-prov-card">' +
          '<div class="lbs-prov-header">' +
            '<div class="lbs-prov-spinner"></div>' +
            '<div>' +
              '<div class="lbs-prov-title">Setting up your server&hellip;</div>' +
              '<div class="lbs-prov-sub">This typically takes 2&ndash;5 minutes. Status updates automatically.</div>' +
            '</div>' +
          '</div>' +
          '<div class="lbs-pv-timeline">' +
            '<div class="lbs-pv-step lbs-pv-done"><span class="lbs-pv-dot"></span><span>Payment verified &amp; approved</span></div>' +
            '<div class="lbs-pv-step lbs-pv-active"><span class="lbs-pv-dot"></span><span>Creating server resources (key, network, storage)</span></div>' +
            '<div class="lbs-pv-step"><span class="lbs-pv-dot"></span><span>Configuring network &amp; security</span></div>' +
            '<div class="lbs-pv-step"><span class="lbs-pv-dot"></span><span>Launching your server</span></div>' +
          '</div>' +
        '</div>' +
        '</div>';
      if (canTerminate) {
        html += '<div class="lbs-detail-section">' +
          '<div class="lbs-detail-actions"><button class="btn btn-sm btn-danger" onclick="Labs._confirmDelete(\'' + labIdEsc + '\')">Cancel &amp; Terminate</button></div>' +
          '</div>';
      }
    }

    // ── Pending approval actions
    if (lab.status === 'pending_approval') {
      if (isAdmin) {
        var costMeta  = lab.estimatedCost != null ? ' &middot; ' + _esc(_npmFmt(Number(lab.estimatedCost))) : '';
        var submitter = _esc(lab.userEmail || lab.callerEmail || '\u2014');
        html += '<div class="lbs-detail-section">' +
          '<div class="lbs-detail-section-title">Payment Review</div>' +
          '<div class="lbs-review-card">' +
            '<div class="lbs-review-top">' +
              '<span class="lbs-review-badge">&#9679; Awaiting Your Review</span>' +
              '<span class="lbs-review-meta">Submitted by ' + submitter + costMeta + '</span>' +
            '</div>' +
            '<div class="lbs-review-actions">' +
              '<button class="btn btn-sm btn-outline" onclick="Labs._viewPayment(\'' + labIdEsc + '\')">&#128247; View Payment Screenshot</button>' +
              '<button class="btn btn-sm btn-success" onclick="Labs._approveLab(\'' + labIdEsc + '\')">&#10003; Approve &amp; Provision</button>' +
              '<button class="btn btn-sm btn-danger" onclick="Labs._rejectLab(\'' + labIdEsc + '\')">&#10007; Reject</button>' +
            '</div>' +
          '</div>' +
          '</div>';
      } else {
        var cancelBtn = isOwner
          ? '<div class="lbs-detail-actions" style="margin-top:12px;"><button class="btn btn-sm btn-outline" onclick="Labs._confirmCancelRequest(\'' + labIdEsc + '\')">Cancel Request</button></div>'
          : '';
        html += '<div class="lbs-detail-section">' +
          '<div class="lbs-verification-notice">' +
            '<div class="lbs-verification-icon">&#128269;</div>' +
            '<div>' +
              '<h4 class="lbs-verification-title">Payment Verification in Progress</h4>' +
              '<p class="lbs-verification-msg">Your payment is being reviewed by our team. Your server will be set up automatically once payment is confirmed &mdash; this usually takes a few minutes. The status will change to <b>Setting Up</b> once approved.</p>' +
            '</div>' +
          '</div>' +
          cancelBtn +
          '</div>';
      }
    }

    // ── History records: allow removal
    if (lab.status === 'terminated' || lab.status === 'rejected') {
      html += '<div class="lbs-detail-section">' +
        '<div class="lbs-detail-actions">' +
          '<button class="btn btn-sm btn-outline" onclick="Labs._confirmRemoveHistory(\'' + labIdEsc + '\')">Remove from History</button>' +
        '</div>' +
        '</div>';
    }

    html += '</div>'; // close lbs-detail-panel
    return html;
  }

  // ─── Wizard control

  async function startWizard() {
    wizardConfig = {};
    currentLabId = null;
    if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }

    if (_accounts.length === 0) await _loadAccounts();

    wizardStep = 1;
    _showWizardPanel();
    _renderWizard();
  }

  function _showWizardPanel() {
    var wizEl   = document.getElementById('lbs-wizard');
    var listEl  = document.getElementById('lbs-list');
    var btnNew  = document.getElementById('lbs-btn-new');
    if (wizEl)  wizEl.style.display  = '';
    if (listEl) listEl.style.display = 'none';
    if (btnNew) btnNew.style.display = 'none';
  }

  function _exitWizard() {
    wizardStep   = 0;
    wizardConfig = {};
    currentLabId = null;
    if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }

    var wizEl   = document.getElementById('lbs-wizard');
    var listEl  = document.getElementById('lbs-list');
    var btnNew  = document.getElementById('lbs-btn-new');
    if (wizEl)  { wizEl.style.display = 'none'; wizEl.innerHTML = ''; }
    if (listEl) listEl.style.display = '';
    if (btnNew) btnNew.style.display = '';

    _labFilters.status = 'pending_approval';
    _expandedLabId = null;
    _loadActiveLabs();
  }

  function _renderWizard() {
    var wizEl = document.getElementById('lbs-wizard');
    if (!wizEl) return;
    switch (wizardStep) {
      case 1: _renderStep1(wizEl); break;
      case 2: _renderStep2(wizEl); break;
      case 3: _renderStep3(wizEl); break;
      case 4: _renderStep4(wizEl); break;
    }
  }

  function nextStep() {
    if (wizardStep === 1) {
      if (!_collectStep1()) return;
      wizardStep = 2;
      _renderWizard();
    } else if (wizardStep === 2) {
      wizardStep = 3;
      _renderWizard();
    } else if (wizardStep === 3) {
      if (!wizardConfig.paymentKey) {
        App.showToast('Please submit your payment screenshot first', 'err');
        return;
      }
      _handleLabsSubmit();
    }
  }

  function prevStep() {
    if (wizardStep > 1) {
      if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
      wizardStep--;
      _renderWizard();
    }
  }

  // ─── Step 1: Configure

  function _renderStep1(container) {
    var accountOptions = _accounts.length > 0
      ? _accounts.map(function (a) {
          var label = (a.name || a.accountId) + ' (' + a.accountId + ')';
          var sel   = wizardConfig.accountId === a.accountId ? ' selected' : '';
          return '<option value="' + _esc(a.accountId) + '"' + sel + '>' + _esc(label) + '</option>';
        }).join('')
      : '<option value="">— No enabled accounts found —</option>';

    var nameVal = wizardConfig.labName != null ? _esc(wizardConfig.labName) : '';

    var regionOptions = REGIONS.map(function (r) {
      var sel = (wizardConfig.region || 'ap-south-1') === r.value ? ' selected' : '';
      return '<option value="' + r.value + '"' + sel + '>' + r.label + '</option>';
    }).join('');

    var instanceGroupHtml = INSTANCE_GROUPS.map(function (g) {
      var opts = g.types.map(function (t) {
        var sel = wizardConfig.instanceType === t.value ? ' selected' : '';
        return '<option value="' + _esc(t.value) + '"' + sel + '>' + _esc(t.label) + '</option>';
      }).join('');
      return '<optgroup label="' + _esc(g.label) + '">' + opts + '</optgroup>';
    }).join('');

    var currentPlatform = wizardConfig.platform || 'ubuntu';
    var platformCards = [
      { value: 'ubuntu',  label: 'Ubuntu Server 24.04 LTS' },
      { value: 'windows', label: 'Windows Server 2025'     },
    ].map(function (p) {
      var checked = currentPlatform === p.value ? ' checked' : '';
      return '<label class="lbs-platform-card"><input type="radio" name="lbs-platform" value="' + p.value + '"' + checked + ' onchange="Labs._onPlatformChange()"> ' + _esc(p.label) + '</label>';
    }).join('');

    var storagVal  = wizardConfig.storageGb || (currentPlatform === 'windows' ? 35 : 20);
    var eipChecked = wizardConfig.elasticIp ? ' checked' : '';

    container.innerHTML = [
      '<div class="lbs-wizard-wrap">',
      '  <div class="lbs-wizard-header">',
      '    <h2 class="lbs-wizard-title">New Server — Step 1: Configure</h2>',
      '    <div class="lbs-steps">',
      '      <span class="lbs-step lbs-step--active">1</span>',
      '      <span class="lbs-step">2</span>',
      '      <span class="lbs-step">3</span>',
      '      <span class="lbs-step">4</span>',
      '    </div>',
      '  </div>',
      '  <div class="lbs-wizard-body">',
      '    <div class="lbs-form-row">',
      '      <label class="lbs-label">Server Name <span class="lbs-help-text">(optional)</span></label>',
      '      <input type="text" id="lbs-s1-name" class="lbs-input" maxlength="100"',
      '             placeholder="e.g. my-dev-server" value="' + nameVal + '">',
      '    </div>',
      '    <div class="lbs-form-row">',
      '      <label class="lbs-label">Account</label>',
      '      <select id="lbs-s1-account" class="lbs-select">' + accountOptions + '</select>',
      '    </div>',
      '    <div class="lbs-form-row">',
      '      <label class="lbs-label">Region</label>',
      '      <select id="lbs-s1-region" class="lbs-select">' + regionOptions + '</select>',
      '    </div>',
      '    <div class="lbs-form-row">',
      '      <label class="lbs-label">Platform</label>',
      '      <div class="lbs-platform-grid">' + platformCards + '</div>',
      '    </div>',
      '    <div class="lbs-form-row">',
      '      <label class="lbs-label">Server Type</label>',
      '      <select id="lbs-s1-instance" class="lbs-select">' + instanceGroupHtml + '</select>',
      '    </div>',
      '    <div class="lbs-form-row">',
      '      <label class="lbs-label">EBS Storage (GB)</label>',
      '      <input type="number" id="lbs-s1-storage" class="lbs-input" min="8" max="500" value="' + storagVal + '">',
      '    </div>',
      '    <div class="lbs-form-row lbs-form-row--inline">',
      '      <label class="lbs-label">Elastic IP</label>',
      '      <input type="checkbox" id="lbs-s1-eip"' + eipChecked + '>',
      '    </div>',
      '    <div class="lbs-form-row">',
      '      <label class="lbs-label">Server Duration</label>',
      '      <div class="lbs-duration-grid">',
      '        <div>',
      '          <span class="lbs-sublabel">Start Date</span>',
      '          <input type="date" id="lbs-s1-start-date" class="lbs-input"',
      '                 value="' + (wizardConfig.startDate || _todayStr()) + '" min="' + _todayStr() + '"',
      '                 oninput="Labs._onDateRangeChange()">',
      '        </div>',
      '        <div>',
      '          <span class="lbs-sublabel">End Date</span>',
      '          <input type="date" id="lbs-s1-end-date" class="lbs-input"',
      '                 value="' + (wizardConfig.endDate || _tomorrowStr()) + '" min="' + _tomorrowStr() + '"',
      '                 oninput="Labs._onDateRangeChange()">',
      '        </div>',
      '      </div>',
      '      <p id="lbs-s1-duration-preview" class="lbs-help-text" style="margin-top:4px;"></p>',
      '    </div>',
      '    <div class="lbs-form-row">',
      '      <label class="lbs-label">Daily Uptime</label>',
      '      <div class="lbs-uptime-row">',
      '        <select id="lbs-s1-uptime" class="lbs-select" style="max-width:180px;" onchange="Labs._onDateRangeChange()">',
      '          <option value="4"'  + (wizardConfig.hoursPerDay ===  4 ? ' selected' : '') + '>4 hrs/day</option>',
      '          <option value="6"'  + (wizardConfig.hoursPerDay ===  6 ? ' selected' : '') + '>6 hrs/day</option>',
      '          <option value="8"'  + (wizardConfig.hoursPerDay ===  8 ? ' selected' : '') + '>8 hrs/day (business hours)</option>',
      '          <option value="12"' + (wizardConfig.hoursPerDay === 12 ? ' selected' : '') + '>12 hrs/day</option>',
      '          <option value="16"' + (wizardConfig.hoursPerDay === 16 ? ' selected' : '') + '>16 hrs/day</option>',
      '          <option value="24"' + (!wizardConfig.hoursPerDay || wizardConfig.hoursPerDay === 24 ? ' selected' : '') + '>24 hrs/day — always on (default)</option>',
      '        </select>',
      '        <span class="lbs-help-text" style="margin-top:0;">Uptime is <b>24 hrs/day</b> by default. Choose a lower value if you plan to shut the server down between sessions — it reduces your estimated cost.</span>',
      '      </div>',
      '    </div>',
      '    <div class="lbs-form-row">',
      '      <label class="lbs-label">Network Options</label>',
      '      <button class="btn btn-outline btn-sm" onclick="Labs._loadNetworkOptions()">Load VPCs / Subnets / Security Groups</button>',
      '      <span id="lbs-s1-net-status" class="lbs-help-text"></span>',
      '    </div>',
      '    <div class="lbs-form-row">',
      '      <label class="lbs-label">VPC</label>',
      '      <select id="lbs-s1-vpc" class="lbs-select" onchange="Labs._onVpcChange()"><option value="">— Load network options first —</option></select>',
      '    </div>',
      '    <div class="lbs-form-row">',
      '      <label class="lbs-label">Subnet</label>',
      '      <select id="lbs-s1-subnet" class="lbs-select"><option value="">— Select VPC first —</option></select>',
      '    </div>',
      '    <div class="lbs-form-row">',
      '      <label class="lbs-label">Security Group</label>',
      '      <select id="lbs-s1-sg" class="lbs-select"><option value="">— Select VPC first —</option></select>',
      '    </div>',
      '  </div>',
      '  <div class="lbs-wizard-footer">',
      '    <button class="btn btn-outline" onclick="Labs._exitWizard()">Cancel</button>',
      '    <button class="btn btn-blue" onclick="Labs.nextStep()">Next: Pricing Review</button>',
      '  </div>',
      '</div>',
    ].join('\n');
  }

  function _todayStr() {
    return new Date().toISOString().slice(0, 10);
  }

  function _tomorrowStr() {
    var d = new Date(); d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }

  function _onDateRangeChange() {
    var startEl  = document.getElementById('lbs-s1-start-date');
    var endEl    = document.getElementById('lbs-s1-end-date');
    var preview  = document.getElementById('lbs-s1-duration-preview');
    if (!startEl || !endEl || !preview) return;
    var start = startEl.value;
    var end   = endEl.value;
    var uptimeEl    = document.getElementById('lbs-s1-uptime');
    var hoursPerDay = uptimeEl ? (parseInt(uptimeEl.value, 10) || 24) : 24;
    if (start && end) {
      var days = Math.round((new Date(end) - new Date(start)) / 86400000);
      if (days <= 0) {
        preview.textContent = 'End date must be after start date.';
        preview.style.color = 'var(--red)';
      } else {
        preview.style.color = '';
        var totalHours = days * hoursPerDay;
        preview.textContent = start + ' \u2192 ' + end + ' \u2014 ' + days + ' day' + (days === 1 ? '' : 's') + ' \u00d7 ' + hoursPerDay + ' hrs/day = ' + totalHours.toLocaleString() + ' total hours';
      }
    } else {
      preview.textContent = '';
    }
  }

  // Keep old function name as alias so any stray callers don't break
  function _onDurationInput() { _onDateRangeChange(); }

  function _onPlatformChange() {
    var radios = document.querySelectorAll('input[name="lbs-platform"]');
    var platform = '';
    radios.forEach(function (r) { if (r.checked) platform = r.value; });
    var storageEl = document.getElementById('lbs-s1-storage');
    if (storageEl && platform === 'windows') {
      var cur = parseInt(storageEl.value, 10) || 0;
      if (cur < 35) storageEl.value = 35;
    }
  }

  async function _loadNetworkOptions() {
    var statusEl  = document.getElementById('lbs-s1-net-status');
    var accountEl = document.getElementById('lbs-s1-account');
    var regionEl  = document.getElementById('lbs-s1-region');
    var accountId = accountEl ? accountEl.value : '';
    var region    = regionEl  ? regionEl.value  : '';

    if (!accountId || !region) {
      if (statusEl) statusEl.textContent = 'Select account and region first.';
      return;
    }
    if (statusEl) statusEl.textContent = 'Loading…';

    try {
      var res  = await API.getLabNetworkOptions(accountId, region);
      var data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed to load network options');

      var vpcs    = data.vpcs            || [];
      var subnets = data.subnets         || [];
      var sgs     = data.securityGroups  || [];

      var vpcSel = document.getElementById('lbs-s1-vpc');
      if (vpcSel) {
        vpcSel.innerHTML = '<option value="">— Select VPC —</option>' +
          vpcs.map(function (v) {
            var label = v.vpcId + (v.name ? ' (' + _esc(v.name) + ')' : '');
            return '<option value="' + _esc(v.vpcId) + '">' + label + '</option>';
          }).join('');
        // Stash subnets + SGs for filtering by VPC
        vpcSel._subnets = subnets;
        vpcSel._sgs     = sgs;
      }

      if (statusEl) statusEl.textContent = 'Loaded ' + vpcs.length + ' VPC(s).';
    } catch (e) {
      if (statusEl) statusEl.textContent = 'Error: ' + e.message;
      App.showToast('Network options error: ' + e.message, 'err');
    }
  }

  function _onVpcChange() {
    var vpcSel    = document.getElementById('lbs-s1-vpc');
    var subnetSel = document.getElementById('lbs-s1-subnet');
    var sgSel     = document.getElementById('lbs-s1-sg');
    if (!vpcSel || !subnetSel || !sgSel) return;

    var selectedVpc = vpcSel.value;
    var allSubnets  = vpcSel._subnets || [];
    var allSgs      = vpcSel._sgs     || [];

    var filteredSubs = allSubnets.filter(function (s) { return s.vpcId === selectedVpc; });
    var filteredSgs  = allSgs.filter(function (g)     { return g.vpcId === selectedVpc; });

    subnetSel.innerHTML = '<option value="">— Select Subnet —</option>' +
      filteredSubs.map(function (s) {
        var label = s.subnetId + (s.name ? ' (' + _esc(s.name) + ')' : '') +
                    (s.availabilityZone ? ' / ' + _esc(s.availabilityZone) : '');
        return '<option value="' + _esc(s.subnetId) + '">' + label + '</option>';
      }).join('');

    sgSel.innerHTML = '<option value="">— Select Security Group —</option>' +
      filteredSgs.map(function (g) {
        var label = g.groupId + ' — ' + _esc(g.groupName || '');
        return '<option value="' + _esc(g.groupId) + '">' + label + '</option>';
      }).join('');
  }

  function _collectStep1() {
    var labName         = ((document.getElementById('lbs-s1-name')     || {}).value || '').trim();
    var accountId       = (document.getElementById('lbs-s1-account')  || {}).value || '';
    var region          = (document.getElementById('lbs-s1-region')    || {}).value || '';
    var instanceType    = (document.getElementById('lbs-s1-instance')  || {}).value || '';
    var storageGbRaw    = (document.getElementById('lbs-s1-storage')   || {}).value || '';
    var storageGb       = parseInt(storageGbRaw, 10);
    var elasticIp       = !!(document.getElementById('lbs-s1-eip') || {}).checked;
    var subnetId        = (document.getElementById('lbs-s1-subnet')    || {}).value || '';
    var securityGroupId = (document.getElementById('lbs-s1-sg')        || {}).value || '';
    var vpcId           = (document.getElementById('lbs-s1-vpc')       || {}).value || '';
    var startDate     = ((document.getElementById('lbs-s1-start-date') || {}).value || '').trim();
    var endDate       = ((document.getElementById('lbs-s1-end-date')   || {}).value || '').trim();
    var totalDays     = startDate && endDate ? Math.round((new Date(endDate) - new Date(startDate)) / 86400000) : 0;
    var hoursPerDay   = parseInt((document.getElementById('lbs-s1-uptime') || {}).value || '24', 10) || 24;
    var months        = Math.max(1, Math.ceil(totalDays / 30));
    var durationHours = totalDays * hoursPerDay;

    var platform = '';
    var radios   = document.querySelectorAll('input[name="lbs-platform"]');
    radios.forEach(function (r) { if (r.checked) platform = r.value; });

    if (!accountId)     { App.showToast('Select an account', 'err');   return false; }
    if (!region)        { App.showToast('Select a region', 'err');         return false; }
    if (!platform)      { App.showToast('Select a platform', 'err');       return false; }
    if (!instanceType)  { App.showToast('Select a server type', 'err'); return false; }
    var minStorage = platform === 'windows' ? 35 : 8;
    if (!storageGb || storageGb < minStorage || storageGb > 500) {
      App.showToast('Storage must be between ' + minStorage + ' and 500 GB', 'err'); return false;
    }
    if (!startDate || !endDate) {
      App.showToast('Select a start and end date for your server', 'err'); return false;
    }
    if (totalDays <= 0) {
      App.showToast('End date must be after start date', 'err'); return false;
    }
    if (months > 36) {
      App.showToast('Server duration cannot exceed 36 months (3 years)', 'err'); return false;
    }
    if (!subnetId) {
      App.showToast('Select a subnet (click "Load Network Options" first)', 'err'); return false;
    }
    if (!securityGroupId) {
      App.showToast('Select a security group', 'err'); return false;
    }

    wizardConfig = {
      labName:          labName,
      accountId:        accountId,
      region:           region,
      platform:         platform,
      instanceType:     instanceType,
      storageGb:        storageGb,
      elasticIp:        elasticIp,
      vpcId:            vpcId,
      subnetId:         subnetId,
      securityGroupIds: [securityGroupId],
      hoursPerDay:      hoursPerDay,
      months:           months,
      durationHours:    durationHours,
      startDate:        startDate,
      endDate:          endDate,
      totalDays:        totalDays,
    };
    return true;
  }

  // ─── Step 2: Pricing Review

  function _renderStep2(container) {
    container.innerHTML = [
      '<div class="lbs-wizard-wrap">',
      '  <div class="lbs-wizard-header">',
      '    <h2 class="lbs-wizard-title">New Server — Step 2: Pricing Review</h2>',
      '    <div class="lbs-steps">',
      '      <span class="lbs-step lbs-step--done">1</span>',
      '      <span class="lbs-step lbs-step--active">2</span>',
      '      <span class="lbs-step">3</span>',
      '      <span class="lbs-step">4</span>',
      '    </div>',
      '  </div>',
      '  <div class="lbs-wizard-body">',
      '    <div id="lbs-pricing-content"><div class="lbs-loading">Fetching pricing…</div></div>',
      '  </div>',
      '  <div class="lbs-wizard-footer">',
      '    <button class="btn btn-outline" onclick="Labs.prevStep()">Back</button>',
      '    <div style="display:flex;gap:8px;align-items:center;">',
      '      <button id="lbs-s2-dl-bill" class="btn btn-outline" style="display:none;" onclick="Labs._downloadBill()">&#8681; Download Bill (NPR)</button>',
      '      <button id="lbs-s2-next" class="btn btn-blue" style="display:none;" onclick="Labs.nextStep()">Continue to Payment</button>',
      '    </div>',
      '  </div>',
      '</div>',
    ].join('\n');
    fetchPricing();
  }

  async function fetchPricing() {
    var contentEl = document.getElementById('lbs-pricing-content');
    if (!contentEl) return;
    try {
      var params = {
        instanceType:  wizardConfig.instanceType,
        region:        wizardConfig.region,
        os:            wizardConfig.platform === 'windows' ? 'windows' : 'linux',
        storageGb:     wizardConfig.storageGb,
        elasticIp:     wizardConfig.elasticIp ? 'true' : 'false',
        durationHours: wizardConfig.durationHours,
      };
      var res  = await API.getLabPricing(params);
      var data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Pricing fetch failed');

      var b           = data.breakdown;
      var hoursPerDay = wizardConfig.hoursPerDay;
      var months      = wizardConfig.months;
      var durationHours = wizardConfig.durationHours;
      wizardConfig.estimatedCost = b.totalUsd;
      wizardConfig.priceBreakdown = b;

      var startDate     = wizardConfig.startDate || '';
      var endDate       = wizardConfig.endDate   || '';
      var totalDays     = wizardConfig.totalDays || Math.round(durationHours / 24);
      var durationLabel = startDate + ' \u2192 ' + endDate + ' (' + totalDays + ' days, ' + durationHours.toLocaleString() + ' hrs)';

      var rows = [
        '<tr><td>' + _esc(wizardConfig.instanceType || '\u2014') + ' (server)</td>' +
          '<td>$' + b.ec2Hourly.toFixed(4) + '/hr</td>' +
          '<td>' + _npmFmt(b.ec2Cost) + '</td></tr>',
        '<tr><td>EBS gp3 (' + _esc(String(wizardConfig.storageGb)) + ' GB)</td>' +
          '<td>$' + b.ebsPerGbMonth.toFixed(4) + '/GB-mo</td>' +
          '<td>' + _npmFmt(b.ebsCost) + '</td></tr>',
      ];
      if (wizardConfig.elasticIp) {
        rows.push(
          '<tr><td>Elastic IP</td>' +
          '<td>$' + b.eipHourly.toFixed(4) + '/hr</td>' +
          '<td>' + _npmFmt(b.eipCost) + '</td></tr>'
        );
      }

      var regionLabel = (REGIONS.find(function (r) { return r.value === wizardConfig.region; }) || { label: wizardConfig.region }).label;
      var osLabel     = wizardConfig.platform === 'windows' ? 'Windows Server' : 'Linux (Ubuntu)';

      contentEl.innerHTML = [
        '<table class="lbs-price-table">',
        '  <thead><tr><th>Component</th><th>Rate</th><th>Cost</th></tr></thead>',
        '  <tbody>' + rows.join('') + '</tbody>',
        '  <tfoot>',
        '    <tr class="lbs-price-total">',
        '      <td colspan="2"><b>Total (' + _esc(durationLabel) + ')</b></td>',
        '      <td><b>' + _npmFmt(b.totalUsd) + '</b></td>',
        '    </tr>',
        '  </tfoot>',
        '</table>',
        '<p class="lbs-pricing-source">Live pricing · Verify with the AWS Pricing Calculator below</p>',
        '<div class="lbs-calc-hint">',
        '  <p class="lbs-calc-hint-title">Your configuration for AWS Pricing Calculator:</p>',
        '  <ul class="lbs-calc-hint-list">',
        '    <li>Region: ' + _esc(regionLabel) + '</li>',
        '    <li>Operating System: ' + _esc(osLabel) + '</li>',
        '    <li>Server Type: ' + _esc(wizardConfig.instanceType || '\u2014') + '</li>',
        '    <li>Duration: ' + _esc(String(totalDays)) + ' days (' + _esc(startDate) + ' \u2192 ' + _esc(endDate) + ')</li>',
        '    <li>EBS: ' + _esc(String(wizardConfig.storageGb)) + ' GB gp3</li>',
        '  </ul>',
        '  <a href="https://calculator.aws/#/createCalculator/ec2-enhancement" target="_blank" rel="noopener noreferrer" class="btn btn-outline btn-sm">',
        '    Open AWS Pricing Calculator \u2192',
        '  </a>',
        '</div>',
      ].join('\n');

      // Store breakdown reference for bill download
      var dlBtn = document.getElementById('lbs-s2-dl-bill');
      if (dlBtn) dlBtn.style.display = '';
      var nextBtn = document.getElementById('lbs-s2-next');
      if (nextBtn) nextBtn.style.display = '';
    } catch (e) {
      contentEl.innerHTML = '<div class="lbs-err">Failed to fetch pricing: ' + _esc(e.message) + '</div>';
      App.showToast('Pricing error: ' + e.message, 'err');
    }
  }

  // ─── Download Bill as text file (NPR)

  function _downloadBill() {
    var b       = wizardConfig.priceBreakdown;
    var rate    = _getNprRate();
    var config  = wizardConfig;
    if (!b) { App.showToast('Pricing not loaded yet', 'err'); return; }

    var REGIONS_MAP = {};
    (REGIONS || []).forEach(function (r) { REGIONS_MAP[r.value] = r.label; });
    var regionLabel = REGIONS_MAP[config.region] || config.region || '—';
    var osLabel     = config.platform === 'windows' ? 'Windows Server' : 'Linux (Ubuntu)';
    var startDate   = config.startDate || '—';
    var endDate     = config.endDate   || '—';
    var totalDays   = config.totalDays || 0;

    function nprLine(usd) {
      if (!usd || usd <= 0) return '—';
      return 'NPR ' + (usd * rate).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    var sep  = '═══════════════════════════════════════════════';
    var sep2 = '───────────────────────────────────────────────';
    var lines = [
      'SERVER BILLING ESTIMATE',
      sep,
      'Generated:      ' + new Date().toUTCString(),
      'Exchange Rate:  1 USD = NPR ' + rate.toFixed(2) + ' (live mid-market rate)',
      '',
      'CONFIGURATION',
      sep2,
      'Server Name:    ' + (config.labName || '(not named)'),
      'Account:        ' + (config.accountId || '—'),
      'Region:         ' + regionLabel,
      'Operating System: ' + osLabel,
      'Server Type:    ' + (config.instanceType || '—'),
      'Storage:        ' + (config.storageGb || '—') + ' GB (gp3 SSD)',
      'Fixed IP:       ' + (config.elasticIp ? 'Yes' : 'No'),
      'Daily Uptime:   ' + (config.hoursPerDay || 24) + ' hrs/day',
      'Duration:       ' + startDate + ' \u2192 ' + endDate + ' (' + totalDays + ' days, ' + ((config.durationHours || 0).toLocaleString()) + ' total hrs)',
      '',
      'COST BREAKDOWN',
      sep2,
      ('Server (' + (config.instanceType || '') + ')').padEnd(25) +
        ('$' + b.ec2Hourly.toFixed(4) + '/hr').padEnd(18) +
        nprLine(b.ec2Cost),
      ('Storage (' + (config.storageGb || '') + ' GB gp3)').padEnd(25) +
        ('$' + b.ebsPerGbMonth.toFixed(4) + '/GB-mo').padEnd(18) +
        nprLine(b.ebsCost),
    ];

    if (config.elasticIp) {
      lines.push(
        'Fixed IP (Elastic IP)'.padEnd(25) +
          ('$' + b.eipHourly.toFixed(4) + '/hr').padEnd(18) +
          nprLine(b.eipCost)
      );
    }

    lines = lines.concat([
      sep2,
      'TOTAL ESTIMATE'.padEnd(25) + ''.padEnd(18) + nprLine(b.totalUsd),
      sep,
      '',
      'Note: This is an estimate based on on-demand pricing.',
      'Actual costs may vary. Rates from AWS Price List.',
      'NPR conversion uses a live mid-market rate and is indicative only.',
    ]);

    var content = lines.join('\n');
    var fname   = 'server-bill-' + (config.instanceType || 'estimate').replace('.', '') + '-' + startDate + '.txt';
    var url     = URL.createObjectURL(new Blob([content], { type: 'text/plain' }));
    var a       = document.createElement('a');
    a.href = url; a.download = fname; a.click();
    URL.revokeObjectURL(url);
  }

  // ─── Step 3: Payment

  function _renderStep3(container) {
    var totalStr = wizardConfig.estimatedCost != null
      ? _npmFmt(Number(wizardConfig.estimatedCost))
      : '—';

    container.innerHTML = [
      '<div class="lbs-wizard-wrap">',
      '  <div class="lbs-wizard-header">',
      '    <h2 class="lbs-wizard-title">New Server — Step 3: Payment</h2>',
      '    <div class="lbs-steps">',
      '      <span class="lbs-step lbs-step--done">1</span>',
      '      <span class="lbs-step lbs-step--done">2</span>',
      '      <span class="lbs-step lbs-step--active">3</span>',
      '      <span class="lbs-step">4</span>',
      '    </div>',
      '  </div>',
      '  <div class="lbs-wizard-body">',
      '    <div class="lbs-payment-amount"><span style="font-size:13px;font-weight:400;color:var(--ink3);display:block;margin-bottom:4px;">Amount Due</span>' + _esc(totalStr) + '</div>',
      '    <div class="lbs-qr-wrap">',
      '      <img src="PaymentQR.png" alt="Payment QR Code" class="lbs-qr-img">',
      '    </div>',
      '    <div class="lbs-form-row" style="margin-top:16px;">',
      '      <label class="lbs-label">Upload Payment Screenshot (JPG / PNG, max 5 MB)</label>',
      '      <input type="file" id="lbs-s3-screenshot" accept="image/jpeg,image/png,image/webp" onchange="Labs._onScreenshotChange()">',
      '    </div>',
      '    <div id="lbs-s3-preview" style="display:none; margin-top:8px;">',
      '      <img id="lbs-s3-preview-img" style="max-width:200px; max-height:200px; border-radius:6px; border:1px solid var(--bd2);">',
      '    </div>',
      '    <p id="lbs-s3-status" class="lbs-help-text"></p>',
      '    <button class="btn btn-blue" id="lbs-s3-submit" onclick="Labs.submitPayment()" style="margin-top:8px;">',
      '      Upload Payment Confirmation',
      '    </button>',
      '    <div id="lbs-s3-proceed" style="display:none; margin-top:12px;">',
      '      <button class="btn btn-blue" onclick="Labs.nextStep()">Submit Server Request</button>',
      '    </div>',
      '  </div>',
      '  <div class="lbs-wizard-footer">',
      '    <button class="btn btn-outline" onclick="Labs.prevStep()">Back</button>',
      '  </div>',
      '</div>',
    ].join('\n');
  }

  function _onScreenshotChange() {
    var input   = document.getElementById('lbs-s3-screenshot');
    var preview = document.getElementById('lbs-s3-preview');
    var img     = document.getElementById('lbs-s3-preview-img');
    if (!input || !input.files || !input.files[0]) return;
    var file = input.files[0];
    if (file.size > 5 * 1024 * 1024) {
      App.showToast('File must be under 5 MB', 'err');
      input.value = '';
      return;
    }
    var url = URL.createObjectURL(file);
    if (img)     img.src           = url;
    if (preview) preview.style.display = '';
  }

  async function submitPayment() {
    var input     = document.getElementById('lbs-s3-screenshot');
    var statusEl  = document.getElementById('lbs-s3-status');
    var submitBtn = document.getElementById('lbs-s3-submit');

    if (!input || !input.files || !input.files[0]) {
      App.showToast('Please select a payment screenshot first', 'err');
      return;
    }
    var file = input.files[0];
    if (statusEl)  statusEl.textContent = 'Uploading screenshot…';
    if (submitBtn) submitBtn.disabled   = true;

    try {
      var base64 = await _fileToBase64(file);
      var res    = await API.uploadLabPayment({ fileData: base64, contentType: file.type });
      var data   = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Upload failed');

      wizardConfig.paymentKey = data.paymentKey;
      if (statusEl)  statusEl.textContent    = 'Screenshot uploaded successfully.';
      if (submitBtn) submitBtn.style.display  = 'none';
      var proceedEl = document.getElementById('lbs-s3-proceed');
      if (proceedEl) proceedEl.style.display  = '';
    } catch (e) {
      if (statusEl)  statusEl.textContent = 'Upload failed: ' + e.message;
      if (submitBtn) submitBtn.disabled   = false;
      App.showToast('Payment upload failed: ' + e.message, 'err');
    }
  }

  // ─── Step 4: Request Submitted (pending admin approval)

  function _renderStep4(container) {
    var costStr = wizardConfig.estimatedCost != null
      ? _npmFmt(Number(wizardConfig.estimatedCost)) : '';

    container.innerHTML = [
      '<div class="lbs-wizard-wrap">',
      '  <div class="lbs-wizard-header">',
      '    <h2 class="lbs-wizard-title">New Server — Step 4: Submitted</h2>',
      '    <div class="lbs-steps">',
      '      <span class="lbs-step lbs-step--done">1</span>',
      '      <span class="lbs-step lbs-step--done">2</span>',
      '      <span class="lbs-step lbs-step--done">3</span>',
      '      <span class="lbs-step lbs-step--active">4</span>',
      '    </div>',
      '  </div>',
      '  <div class="lbs-wizard-body">',
      '    <div class="lbs-submitted-banner">',
      '      <div class="lbs-submitted-icon">&#10003;</div>',
      '      <h3 style="margin:8px 0 4px;color:var(--ink);">Server Request Submitted!</h3>',
      '      <p style="margin:0;color:var(--ink3);font-size:0.9rem;">',
      '        Thank you! Your payment details have been received and are awaiting admin review.',
      '      </p>',
      '      ' + (costStr ? '<p style="margin:8px 0 0;color:var(--blue);font-weight:600;">Estimated cost: ' + _esc(costStr) + '</p>' : ''),
      '    </div>',
      '    <p style="margin:20px 0 8px;font-size:0.9rem;text-align:center;color:var(--ink3);line-height:1.6;">',
      '      Our team will verify your payment and provision your server automatically.<br>',
      '      Track the status in the <b>My Servers</b> list. You will see your server appear once approved.',
      '    </p>',
      '  </div>',
      '  <div class="lbs-wizard-footer">',
      '    <button class="btn btn-blue" onclick="Labs._exitWizard()">View My Labs</button>',
      '  </div>',
      '</div>',
    ].join('\n');
  }

  // ─── Submit lab request to backend (action=submit — no EC2 launched)

  async function _handleLabsSubmit() {
    var btnEl = document.querySelector('#lbs-s3-proceed button');
    if (btnEl) { btnEl.disabled = true; btnEl.textContent = 'Submitting…'; }

    try {
      var body = {
        action:           'submit',
        labName:          wizardConfig.labName || '',
        accountId:        wizardConfig.accountId,
        region:           wizardConfig.region,
        platform:         wizardConfig.platform,
        instanceType:     wizardConfig.instanceType,
        storageGb:        wizardConfig.storageGb,
        elasticIp:        wizardConfig.elasticIp,
        vpcId:            wizardConfig.vpcId,
        subnetId:         wizardConfig.subnetId,
        securityGroupIds: wizardConfig.securityGroupIds,
        durationHours:    wizardConfig.durationHours,
        paymentKey:       wizardConfig.paymentKey,
        estimatedCost:    wizardConfig.estimatedCost,
      };

      var res  = await API.provisionLab(body);
      var data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Submission failed');

      currentLabId = data.labId;
      wizardStep   = 4;
      _renderWizard();
    } catch (e) {
      if (btnEl) { btnEl.disabled = false; btnEl.textContent = 'Submit Lab Request'; }
      App.showToast('Submission failed: ' + e.message, 'err');
    }
  }

  // ─── Admin: approve a pending lab

  async function _approveLab(labId) {
    _showConfirm(
      'Approve Lab Request?',
      'This will provision the server for this user. The user will be charged.',
      async function () {
        try {
          var res  = await API.provisionLab({ action: 'approve', labId: labId });
          var data = await res.json();
          if (!res.ok) throw new Error(data.message || data.error || 'Approval failed');
          App.showToast('Lab approved — provisioning started', 'ok');
          _expandedLabId = null;
          await _loadActiveLabs();
        } catch (e) {
          App.showToast('Approval failed: ' + e.message, 'err');
        }
      }
    );
  }

  // ─── Admin: reject a pending lab

  async function _rejectLab(labId) {
    _showConfirm(
      'Reject Lab Request?',
      'This will reject this server request. No server will be provisioned.',
      async function () {
        try {
          var res  = await API.provisionLab({ action: 'reject', labId: labId });
          var data = await res.json();
          if (!res.ok) throw new Error(data.message || data.error || 'Rejection failed');
          App.showToast('Lab request rejected', 'ok');
          _expandedLabId = null;
          await _loadActiveLabs();
        } catch (e) {
          App.showToast('Rejection failed: ' + e.message, 'err');
        }
      }
    );
  }

  // ─── Admin: view payment screenshot for a pending lab

  async function _viewPayment(labId) {
    try {
      var res  = await API.getLabPaymentScreenshot(labId);
      var data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed to fetch screenshot');
      window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      App.showToast('Failed to open payment screenshot: ' + e.message, 'err');
    }
  }

  function pollStatus(labId) {
    if (_pollTimer) { clearTimeout(_pollTimer); _pollTimer = null; }
    var _pollInterval = 5000;  // start at 5s, doubles each cycle up to 30s

    function _tick() {
      _pollTimer = setTimeout(async function () {
        try {
          var res  = await API.getLabsList();
          var data = await res.json();
          if (!res.ok) { _schedule(); return; }
          var labs = data.labs || [];
          var lab  = labs.find(function (l) { return l.labId === labId; });
          if (!lab) { _schedule(); return; }

          if (lab.status === 'running') {
            _pollTimer = null;
            activeLabs = labs;
            _labFilters = { platform: '', serverType: '', status: '', account: '', region: '', submittedBy: '' };
            _renderLabsList();
            _toggleRowDetail(labId);
            App.showToast('Lab is ready!', 'ok');
            return;  // stop polling
          }
          if (lab.status === 'error') {
            _pollTimer = null;
            activeLabs = labs;
            _renderLabsList();
            App.showToast('Server setup failed. Please contact support if this persists.', 'err');
            return;  // stop polling
          }
          _schedule();
        } catch (_) { _schedule(); /* ignore transient network errors */ }
      }, _pollInterval);
    }

    function _schedule() {
      _pollInterval = Math.min(_pollInterval * 2, 30000);  // 5s → 10s → 20s → 30s cap
      _tick();
    }

    _tick();
  }

  // ─── Step 5: Connection Info

  function _showStep5Panel(lab) {
    var container = document.getElementById('lbs-wizard');
    if (!container) return;
    container.style.display = '';

    var isWindows     = lab.platform === 'windows';
    var platformLabel = PLATFORM_LABELS[lab.platform] || lab.platform;
    var ip            = lab.publicIp || lab.publicDns || '(IP pending)';
    var sshUser       = _sshUser(lab.platform);
    var sshCmd        = 'ssh -i keypair.pem ' + sshUser + '@' + ip;
    var costStr       = lab.estimatedCost != null
      ? '$' + Number(lab.estimatedCost).toFixed(4) + ' USD' : '—';
    var expiry        = lab.expiresAt ? _formatExpiry(lab.expiresAt) : '—';
    var labIdEsc      = _esc(lab.labId);
    var displayName   = lab.labName || ('ec2ctrl-lab-' + lab.labId);

    var connectionHtml = isWindows
      ? [
          '<div class="lbs-info-section">',
          '  <div class="lbs-info-label">RDP Connection</div>',
          '  <button class="btn btn-outline btn-sm" onclick="Labs._downloadRdp(\'' + labIdEsc + '\')">Download RDP File</button>',
          '  <button class="btn btn-outline btn-sm" onclick="Labs._getWindowsPassword(\'' + labIdEsc + '\')" style="margin-left:8px;">Get Windows Password</button>',
          '  <div id="lbs-win-pass-' + labIdEsc + '" class="lbs-code-block" style="display:none;margin-top:10px;"></div>',
          '</div>',
        ].join('\n')
      : [
          '<div class="lbs-info-section">',
          '  <div class="lbs-info-label">SSH Command</div>',
          '  <div class="lbs-code-block">' + _esc(sshCmd) + '</div>',
          '  <button class="btn btn-outline btn-sm" onclick="Labs.downloadKeypair(\'' + labIdEsc + '\')" style="margin-top:8px;">Download .pem Key</button>',
          '</div>',
        ].join('\n');

    container.innerHTML = [
      '<div class="lbs-wizard-wrap">',
      '  <div class="lbs-wizard-header">',
      '    <div class="lbs-success-banner">Lab Ready!</div>',
      '  </div>',
      '  <div class="lbs-wizard-body">',
      '    <div class="lbs-info-grid">',
      '      <div class="lbs-info-row"><b>Lab ID:</b> <code>' + labIdEsc + '</code></div>',
      '      <div class="lbs-info-row"><b>Lab Name:</b> '      + _esc(displayName)          + '</div>',
      '      <div class="lbs-info-row"><b>Server ID:</b> <code>' + _esc(lab.instanceId || '—') + '</code></div>',
      '      <div class="lbs-info-row"><b>Platform:</b> '      + _esc(platformLabel)        + '</div>',
      '      <div class="lbs-info-row"><b>Server Type:</b> ' + _esc(lab.instanceType || '—') + '</div>',
      '      <div class="lbs-info-row"><b>Region:</b> '        + _esc(lab.region)           + '</div>',
      '      <div class="lbs-info-row"><b>Public IP:</b> '     + _esc(ip)                   + '</div>',
      '      <div class="lbs-info-row"><b>Estimated Cost:</b> '+ _esc(costStr)              + '</div>',
      '      <div class="lbs-info-row"><b>Expires:</b> '       + _esc(expiry)               + '</div>',
      '    </div>',
      '    <p class="lbs-help-text" style="margin-top:8px;">Your server is now live. You can also find it in the <b>Servers</b> tab.</p>',
      '    ' + connectionHtml,
      '    <div style="margin-top:16px;">',
      '      <button class="btn btn-outline btn-sm" onclick="Labs.downloadLabInfo(\'' + labIdEsc + '\')">Download Lab Info (.txt)</button>',
      '    </div>',
      '  </div>',
      '  <div class="lbs-wizard-footer">',
      '    <button class="btn btn-blue" onclick="Labs._exitWizard()">View My Labs</button>',
      '  </div>',
      '</div>',
    ].join('\n');
  }

  // ─── Keypair download (pre-signed S3 URL)

  async function downloadKeypair(labId) {
    try {
      var res  = await API.getLabKeypair(labId);
      var data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed to get keypair URL');
      window.open(data.url, '_blank');
    } catch (e) {
      App.showToast('Keypair download error: ' + e.message, 'err');
    }
  }

  // ─── Windows RDP file download

  function _downloadRdp(labId) {
    var lab = activeLabs.find(function (l) { return l.labId === labId; });
    if (!lab) return;
    var ip  = lab.publicIp || lab.publicDns || '';
    var rdp = 'full address:s:' + ip + '\r\nusername:s:Administrator\r\nprompt for credentials:i:1\r\n';
    var url = URL.createObjectURL(new Blob([rdp], { type: 'application/rdp' }));
    var a   = document.createElement('a');
    a.href = url; a.download = 'lab-' + labId + '.rdp'; a.click();
    URL.revokeObjectURL(url);
  }

  // ─── Windows password retrieval (Lambda RSA decrypt)

  async function _getWindowsPassword(labId) {
    var passEl = document.getElementById('lbs-win-pass-' + labId);
    if (passEl) { passEl.style.display = ''; passEl.innerHTML = '<span style="color:var(--ink3);">Retrieving password\u2026</span>'; }
    try {
      var res  = await API.getLabWindowsPassword(labId);
      var data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed to get Windows password');
      if (passEl) {
        passEl.innerHTML = '<b style="color:var(--ink2);">Password:</b> <code style="user-select:all; font-size:15px;">' + _esc(data.password) + '</code>';
      }
    } catch (e) {
      if (passEl) passEl.innerHTML = '<span style="color:var(--ink3);">Error: ' + _esc(e.message) + ' (password may not be ready \u2014 wait 4+ minutes after launch)</span>';
      App.showToast('Password retrieval failed: ' + e.message, 'err');
    }
  }

  // ─── Download Lab Info (.txt)

  function downloadLabInfo(labId) {
    var lab      = activeLabs.find(function (l) { return l.labId === labId; });
    var platform = (lab && lab.platform) ? lab.platform : (wizardConfig.platform || '');
    var ip       = (lab && lab.publicIp)  ? lab.publicIp  :
                   (lab && lab.publicDns) ? lab.publicDns : '';
    var sshUser  = _sshUser(platform);
    var expiry   = (lab && lab.expiresAt) ? new Date(lab.expiresAt).toUTCString() : '—';
    var costStr  = (lab && lab.estimatedCost) != null
      ? '$' + Number(lab.estimatedCost).toFixed(4) + ' USD'
      : (wizardConfig.estimatedCost != null ? '$' + Number(wizardConfig.estimatedCost).toFixed(4) + ' USD' : '—');

    var connectSection = platform === 'windows'
      ? ['RDP Host:       ' + (ip || '—'),
         'Username:       Administrator',
         'Password:       (retrieve from portal via "Get Windows Password")'].join('\n')
      : ['SSH Command:    ssh -i keypair.pem ' + sshUser + '@' + (ip || '—')].join('\n');

    var content = [
      'Server Connection Info',
      '═══════════════════════════════════════',
      'Lab ID:         ' + (labId || '—'),
      'Platform:       ' + (PLATFORM_LABELS[platform] || platform || '—'),
      'Server Type:    ' + ((lab && lab.instanceType) || wizardConfig.instanceType || '—'),
      'Region:         ' + ((lab && lab.region)       || wizardConfig.region       || '—'),
      'Public IP:      ' + (ip || '—'),
      'Estimated Cost: ' + costStr,
      'Expires At:     ' + expiry,
      '',
      connectSection,
      '',
      'Generated: ' + new Date().toUTCString(),
    ].join('\n');

    var url = URL.createObjectURL(new Blob([content], { type: 'text/plain' }));
    var a   = document.createElement('a');
    a.href = url; a.download = 'lab-info-' + (labId || 'unknown') + '.txt'; a.click();
    URL.revokeObjectURL(url);
  }

  // ─── Public API

  function refresh() {
    _loadActiveLabs();
  }

  return {
    init:            init,
    onTabActivated:  onTabActivated,
    refresh:         refresh,
    startWizard:     startWizard,
    nextStep:        nextStep,
    prevStep:        prevStep,
    fetchPricing:    fetchPricing,
    submitPayment:   submitPayment,
    pollStatus:      pollStatus,
    downloadLabInfo: downloadLabInfo,
    downloadKeypair: downloadKeypair,
    // Confirm dialog
    confirmOk:       confirmOk,
    confirmCancel:   confirmCancel,
    // Exposed for inline onclick handlers
    _setLabFilter:       _setLabFilter,
    _clearLabFilters:    _clearLabFilters,
    _labsPageNav:        _labsPageNav,
    _toggleRowDetail:    _toggleRowDetail,
    _approveLab:         _approveLab,
    _rejectLab:          _rejectLab,
    _viewPayment:        _viewPayment,
    _exitWizard:         _exitWizard,
    _onDurationInput:    _onDurationInput,
    _onDateRangeChange:  _onDateRangeChange,
    _onPlatformChange:   _onPlatformChange,
    _loadNetworkOptions: _loadNetworkOptions,
    _onVpcChange:        _onVpcChange,
    _onScreenshotChange: _onScreenshotChange,
    _confirmDelete:        _confirmDelete,
    _confirmRemoveHistory: _confirmRemoveHistory,
    _confirmCancelRequest: _confirmCancelRequest,
    _startLab:             _startLab,
    _stopLab:              _stopLab,
    _toggleGuide:          _toggleGuide,
    _downloadBill:         _downloadBill,
    _downloadRdp:          _downloadRdp,
    _getWindowsPassword: _getWindowsPassword,
  };

})();
