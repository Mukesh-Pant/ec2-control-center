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
  var _labFilters  = { platform: '', serverType: '', status: '', account: '', region: '', submittedBy: '' };
  var _activeFilter = 'active'; // v2 pill filter: 'all'|'active'|'pending'|'history'
  var _expandedLabId = null;   // labId of currently expanded row, or null
  var _labsPage     = 0;
  var LAB_PAGE_SIZE = 10;
  var _guideOpen    = false;   // whether the "How it works" guide is expanded
  // v2 state
  var _searchQuery  = '';
  var _sortBy       = 'cost';
  var _selectedIds  = [];      // bulk-selected labIds
  var _openMenuId   = null;    // labId whose 3-dot menu is open
  var _tickerTimers = {};      // {labId: intervalId}
  var _statusPollers = {};     // {labId: timeoutId}

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
    // Show skeleton grid while fetching
    listEl.innerHTML = _renderSkeletons(6);

    var role = typeof Auth !== 'undefined' && Auth.getRole ? Auth.getRole() : '';
    if (_accounts.length === 0) await _loadAccounts();
    if (role === 'admin' && typeof _labsUsers !== 'undefined' && _labsUsers.length === 0 && typeof _loadLabsUsers === 'function') await _loadLabsUsers();


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
    // Delegate to v2 card grid renderer
    _renderLabsListV2();
  }

  function _renderLabsListLegacy() {
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
      '<td>' + _esc(lab.labName || ('server-' + lab.labId.substring(0, 8))) + '</td>' +
      '<td>' + _esc(platformLabel) + '</td>' +
      '<td>' + _esc(lab.instanceType || '\u2014') + '</td>' +
      '<td><span class="lbs-badge ' + statusClass + '">' + _esc(statusLabel) + '</span></td>' +
      '<td>' + acctDisplay + '</td>' +
      '<td>' + _esc(lab.region || '\u2014') + '</td>' +
      '<td>' + _renderExpiry(lab) + '</td>' +
      '</tr>';
  }

  function _renderCompactRow(lab, number) {
    var statusClass = STATUS_CLASSES[lab.status] || 'lbs-badge--gray';
    var statusLabel = STATUS_LABELS[lab.status] || lab.status;
    var labIdEsc = _esc(lab.labId);
    var isExpanded = _expandedLabId === lab.labId;
    var chevClass = 'lbs-chevron' + (isExpanded ? ' lbs-chevron--open' : '');
    var rowClass = 'lbs-tbl-row msv2-compact-row' + (isExpanded ? ' lbs-tbl-row--expanded' : '');
    var platformIcon = lab.platform === 'windows' ? 'Windows' : 'Linux';
    return '<tr class="' + rowClass + '" id="lbs-row-' + labIdEsc + '" onclick="Labs._toggleRowDetail(\'' + labIdEsc + '\')">' +
      '<td><span class="' + chevClass + '" id="lbs-chev-' + labIdEsc + '">&#9658;</span></td>' +
      '<td class="msv2-row-num">' + number + '</td>' +
      '<td><div class="msv2-row-main"><div class="msv2-row-name">' + _esc(lab.labName || ('server-' + lab.labId.substring(0, 8))) + '</div><div class="msv2-row-sub">' + _esc(platformIcon) + ' · ' + _esc(lab.accountName || lab.accountId || 'Central') + '</div></div></td>' +
      '<td><span class="lbs-badge ' + statusClass + '">' + _esc(statusLabel) + '</span></td>' +
      '<td>' + _esc(lab.instanceType || '—') + '</td>' +
      '<td>' + _esc(_regionLabel(lab.region || 'ap-south-1')) + '</td>' +
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
    if (!lab || !lab.instanceId) { App.showToast('Server ID not available', 'err'); return; }
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
    if (!lab || !lab.instanceId) { App.showToast('Server ID not available', 'err'); return; }
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

  // ─── Row / card expand / collapse (v2: card-grid aware)

  function _toggleRowDetail(labId) {
    var previousLabId = _expandedLabId;
    if (_expandedLabId === labId) {
      _collapseDetail();
      return;
    }
    if (previousLabId) {
      _collapseDetail();
    }
    _expandedLabId = labId;
    // Card grid path: re-render so detail panel appears below grid
    if (document.querySelector('.msv2-grid')) {
      _renderLabsList();
      setTimeout(function () {
        var el = document.getElementById('msv2-detail-panel');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 80);
      return;
    }
    // Legacy table path (kept for safety)
    var lab = activeLabs.find(function (l) { return l.labId === labId; });
    if (!lab) return;
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
    var collapsingLabId = _expandedLabId;
    _expandedLabId = null;
    // Card grid path
    if (document.querySelector('.msv2-grid')) {
      _renderLabsList();
      return;
    }
    // Legacy table path
    var row = document.getElementById('lbs-row-' + collapsingLabId);
    if (row) {
      row.classList.remove('lbs-tbl-row--expanded');
      var chev = document.getElementById('lbs-chev-' + collapsingLabId);
      if (chev) chev.classList.remove('lbs-chevron--open');
    }
    var detailRow = document.getElementById('lbs-detail-' + collapsingLabId);
    if (detailRow) detailRow.remove();
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

  async function startWizard(initialConfig) {
    wizardConfig = initialConfig ? Object.assign({}, initialConfig) : {};
    currentLabId = null;
    _prevBilling = null;
    _currentLiveBilling = null;
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
      // Snapshot current billing so step 1 diff works if customer comes back
      _prevBilling = _currentLiveBilling || null;
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
    // Default EIP to true (checked) unless explicitly set to false
    var eipChecked = (wizardConfig.elasticIp === false) ? '' : ' checked';

    var _html = [
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
      '    <div class="lbs-wizard-trust-bar">',
      '      <span><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Provisioned within minutes of approval</span>',
      '      <span><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> 24/7 support included</span>',
      '      <span><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> Fully managed security</span>',
      '      <span><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> Transparent pricing, no hidden fees</span>',
      '    </div>',
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
      '      <select id="lbs-s1-instance" class="lbs-select" onchange="Labs._updateLiveBill()">' + instanceGroupHtml + '</select>',
      '    </div>',
      '    <div class="lbs-form-row">',
      '      <label class="lbs-label">EBS Storage (GB)</label>',
      '      <input type="number" id="lbs-s1-storage" class="lbs-input" min="8" max="500" value="' + storagVal + '" oninput="Labs._updateLiveBill()">',
      '    </div>',
      '    <div class="lbs-form-row lbs-form-row--inline">',
      '      <label class="lbs-label">Elastic IP</label>',
      '      <input type="checkbox" id="lbs-s1-eip"' + eipChecked + ' onchange="Labs._updateLiveBill()">',
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
      '        <select id="lbs-s1-uptime" class="lbs-select" style="max-width:180px;" onchange="Labs._onDateRangeChange();Labs._updateLiveBill()">',
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
      '      <label class="lbs-label">VPC / Subnet / Security Group</label>',
      '      <div class="lbs-net-auto-row">',
      '        <span id="lbs-s1-net-status" class="lbs-net-status-badge">',
      '          <span class="lbs-net-spinner" id="lbs-net-spinner" style="display:none"></span>',
      '          <span id="lbs-net-status-text">Loading network options\u2026</span>',
      '        </span>',
      '        <button class="btn btn-outline btn-xs" onclick="Labs._loadNetworkOptions()" id="lbs-net-reload-btn" style="display:none;">Reload</button>',
      '      </div>',
      '      <select id="lbs-s1-vpc" class="lbs-select" onchange="Labs._onVpcChange()" style="margin-top:8px;"><option value="">Loading\u2026</option></select>',
      '    </div>',
      '    <div class="lbs-form-row">',
      '      <label class="lbs-label">Subnet</label>',
      '      <select id="lbs-s1-subnet" class="lbs-select"><option value="">— Select VPC above —</option></select>',
      '    </div>',
      '    <div class="lbs-form-row">',
      '      <label class="lbs-label">Security Group</label>',
      '      <select id="lbs-s1-sg" class="lbs-select"><option value="">— Select VPC above —</option></select>',
      '    </div>',
      '  </div>',
      '  <div class="lbs-wizard-footer">',
      '    <button class="btn btn-outline" onclick="Labs._exitWizard()">Cancel</button>',
      '    <button class="btn btn-blue" onclick="Labs.nextStep()">Next: Pricing Review</button>',
      '  </div>',
      '</div>',
    ].join('\n');

    container.innerHTML = _html;

    // Auto-load network options for the pre-selected account + region
    _autoLoadNetworkOptions();

    // Show live bill immediately (uses current wizardConfig / template defaults)
    setTimeout(_updateLiveBill, 0);
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

  // ─── Live bill preview (step 1 — updates as customer changes config)

  var _prevBilling = null;  // stores billing snapshot before customer edits

  function _updateLiveBill() {
    if (typeof BillingEngine === 'undefined') return;
    var billEl = document.getElementById('lbs-live-bill');
    if (!billEl) return;

    var instanceType = (document.getElementById('lbs-s1-instance') || {}).value || '';
    var storageGb    = parseInt((document.getElementById('lbs-s1-storage') || {}).value || '20', 10) || 20;
    var elasticIp    = !!((document.getElementById('lbs-s1-eip') || {}).checked);
    var hoursPerDay  = parseInt((document.getElementById('lbs-s1-uptime') || {}).value || '24', 10) || 24;
    var accountId    = (document.getElementById('lbs-s1-account') || {}).value || '';

    if (!instanceType) { billEl.style.display = 'none'; return; }

    var bOpts = { instanceType: instanceType, storageGb: storageGb, hoursPerDay: hoursPerDay, isRunning: true, elasticIp: elasticIp };
    var billing;
    try {
      billing = (typeof FinSettings !== 'undefined' && FinSettings.computeWithAccountTax)
        ? FinSettings.computeWithAccountTax(accountId, bOpts)
        : BillingEngine.compute(bOpts);
    } catch (_) { billing = BillingEngine.compute(bOpts); }

    // Build diff vs previous billing (if customer changed something after seeing step 2)
    var diffHtml = '';
    if (_prevBilling && _prevBilling.finalNpr > 0) {
      var delta = billing.finalNpr - _prevBilling.finalNpr;
      var pct   = Math.abs(delta / _prevBilling.finalNpr * 100).toFixed(1);
      if (Math.abs(delta) > 0.5) {
        var sign    = delta > 0 ? '+' : '\u2212';
        var cls     = delta > 0 ? 'lbs-diff--up' : 'lbs-diff--down';
        var reasons = [];
        var prevOpts = _prevBilling._opts || {};
        if (instanceType !== (prevOpts.instanceType || ''))
          reasons.push('Server type changed from <b>' + _esc(prevOpts.instanceType || '—') + '</b> to <b>' + _esc(instanceType) + '</b>');
        if (storageGb !== (prevOpts.storageGb || 0))
          reasons.push('Storage changed from <b>' + _esc(String(prevOpts.storageGb || '—')) + ' GB</b> to <b>' + _esc(String(storageGb)) + ' GB</b>');
        if (hoursPerDay !== (prevOpts.hoursPerDay || 24))
          reasons.push('Daily uptime changed from <b>' + _esc(String(prevOpts.hoursPerDay || 24)) + ' hrs/day</b> to <b>' + _esc(String(hoursPerDay)) + ' hrs/day</b>');
        if (elasticIp !== !!(prevOpts.elasticIp))
          reasons.push(elasticIp ? 'Elastic IP <b>added</b>' : 'Elastic IP <b>removed</b>');
        var reasonList = reasons.length
          ? '<ul class="lbs-diff-reasons">' + reasons.map(function (r) { return '<li>' + r + '</li>'; }).join('') + '</ul>'
          : '';
        diffHtml =
          '<div class="lbs-diff-banner ' + cls + '">' +
            '<span class="lbs-diff-arrow">' + (delta > 0 ? '&#8679;' : '&#8681;') + '</span>' +
            '<span>Bill ' + (delta > 0 ? 'increased' : 'decreased') + ' by <b>' + BillingEngine.fmtNpr(Math.abs(delta)) + '</b> (' + sign + pct + '%)</span>' +
          '</div>' +
          reasonList;
      }
    }

    // Line-item breakdown
    var cfg = billing.cfg || BillingEngine.getConfig();
    var toNpr = function (usd) { return BillingEngine.fmtNpr(usd * cfg.usd_to_npr); };
    var rows = [
      { label: 'Compute (' + _esc(instanceType) + ')', val: toNpr(billing.instanceCost) },
      { label: 'Storage (' + storageGb + ' GB gp3)',    val: toNpr(billing.ebsCost) },
    ];
    if (elasticIp && billing.staticIpCost > 0)
      rows.push({ label: 'Elastic IP (stopped)', val: toNpr(billing.staticIpCost) });
    rows.push({ label: 'Service charges & taxes', val: toNpr(billing.wht + billing.margin + billing.vat), isTax: true });
    if (billing.rebateNpr > 0)
      rows.push({ label: 'Discount (account rebate)', val: '\u2212' + BillingEngine.fmtNpr(billing.rebateNpr), isDiscount: true });

    var tableRows = rows.map(function (r) {
      return '<tr class="' + (r.isTax ? 'lbs-lb-tax' : r.isDiscount ? 'lbs-lb-discount' : '') + '">' +
        '<td>' + r.label + '</td><td>' + r.val + '</td></tr>';
    }).join('');

    billEl.style.display = '';
    billEl.innerHTML =
      '<div class="lbs-live-bill-hd">' +
        '<span class="lbs-live-bill-title">Estimated Monthly Bill</span>' +
        '<span class="lbs-live-bill-total">' + BillingEngine.fmtNpr(billing.finalNpr) + '</span>' +
      '</div>' +
      diffHtml +
      '<table class="lbs-live-bill-table">' +
        '<tbody>' + tableRows + '</tbody>' +
      '</table>' +
      '<div class="lbs-live-bill-note">All taxes (WHT, service margin, VAT) included · ' +
        hoursPerDay + ' hrs/day uptime</div>';

    // Tag the billing snapshot with the opts for diff tracking
    billing._opts = bOpts;
    // expose so nextStep can snapshot it
    _currentLiveBilling = billing;
  }

  var _currentLiveBilling = null;

  function _autoLoadNetworkOptions() {
    // Auto-triggers network load after step 1 renders; wire account/region change events
    var accountEl = document.getElementById('lbs-s1-account');
    var regionEl  = document.getElementById('lbs-s1-region');
    if (accountEl) accountEl.addEventListener('change', function () { _loadNetworkOptions(); });
    if (regionEl)  regionEl.addEventListener('change',  function () { _loadNetworkOptions(); });
    // Trigger immediately
    _loadNetworkOptions();
  }

  async function _loadNetworkOptions() {
    var statusTextEl = document.getElementById('lbs-net-status-text');
    var spinnerEl    = document.getElementById('lbs-net-spinner');
    var reloadBtn    = document.getElementById('lbs-net-reload-btn');
    var accountEl    = document.getElementById('lbs-s1-account');
    var regionEl     = document.getElementById('lbs-s1-region');
    var accountId    = accountEl ? accountEl.value : '';
    var region       = regionEl  ? regionEl.value  : '';

    if (!accountId || !region) {
      if (statusTextEl) statusTextEl.textContent = 'Select account and region first.';
      if (reloadBtn) reloadBtn.style.display = '';
      return;
    }
    if (statusTextEl) statusTextEl.textContent = 'Loading\u2026';
    if (spinnerEl) spinnerEl.style.display = '';
    if (reloadBtn) reloadBtn.style.display = 'none';

    try {
      var res  = await API.getLabNetworkOptions(accountId, region);
      var data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed to load network options');

      var vpcs    = data.vpcs            || [];
      var subnets = data.subnets         || [];
      var sgs     = data.securityGroups  || [];

      var vpcSel = document.getElementById('lbs-s1-vpc');
      if (vpcSel) {
        // Find default VPC (isDefault=true) for auto-selection
        var defaultVpc = vpcs.find(function (v) { return v.isDefault; }) || vpcs[0] || null;
        vpcSel.innerHTML = '<option value="">— Select VPC —</option>' +
          vpcs.map(function (v) {
            var label = v.vpcId +
              (v.isDefault ? ' (default)' : '') +
              (v.name ? ' \u2014 ' + _esc(v.name) : '');
            var sel = (defaultVpc && v.vpcId === defaultVpc.vpcId) ? ' selected' : '';
            return '<option value="' + _esc(v.vpcId) + '"' + sel + '>' + label + '</option>';
          }).join('');
        // Stash subnets + SGs for VPC filtering
        vpcSel._subnets = subnets;
        vpcSel._sgs     = sgs;
        // Auto-select subnets/SGs for the default VPC
        if (defaultVpc) _onVpcChange();
      }

      if (spinnerEl)    spinnerEl.style.display    = 'none';
      if (statusTextEl) statusTextEl.textContent   = vpcs.length + ' VPC' + (vpcs.length !== 1 ? 's' : '') + ' loaded';
      if (reloadBtn)    reloadBtn.style.display     = '';
    } catch (e) {
      if (spinnerEl)    spinnerEl.style.display    = 'none';
      if (statusTextEl) statusTextEl.textContent   = 'Error: ' + e.message;
      if (reloadBtn)    reloadBtn.style.display     = '';
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
      filteredSubs.map(function (s, i) {
        var label = s.subnetId + (s.name ? ' \u2014 ' + _esc(s.name) : '') +
                    (s.availabilityZone ? ' / ' + _esc(s.availabilityZone) : '');
        return '<option value="' + _esc(s.subnetId) + '"' + (i === 0 ? ' selected' : '') + '>' + label + '</option>';
      }).join('');

    sgSel.innerHTML = '<option value="">— Select Security Group —</option>' +
      filteredSgs.map(function (g, i) {
        var label = g.groupId + ' \u2014 ' + _esc(g.groupName || '');
        return '<option value="' + _esc(g.groupId) + '"' + (i === 0 ? ' selected' : '') + '>' + label + '</option>';
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

      var b             = data.breakdown;
      var durationHours = wizardConfig.durationHours;
      wizardConfig.estimatedCost  = b.totalUsd;
      wizardConfig.priceBreakdown = b;

      var startDate  = wizardConfig.startDate || '';
      var endDate    = wizardConfig.endDate   || '';
      var totalDays  = wizardConfig.totalDays || Math.round(durationHours / 24);

      // Compute final tax-inclusive price using BillingEngine (account-specific rates if available)
      var finalNpr = _npmFmt(b.totalUsd);
      var billing  = null;
      if (typeof BillingEngine !== 'undefined') {
        var bOpts = {
          instanceType: wizardConfig.instanceType,
          storageGb:    wizardConfig.storageGb,
          hoursPerDay:  wizardConfig.hoursPerDay || 24,
          isRunning:    true,
          elasticIp:    wizardConfig.elasticIp,
        };
        // Use account-specific taxes if FinSettings has them
        if (typeof FinSettings !== 'undefined' && FinSettings.computeWithAccountTax) {
          billing = FinSettings.computeWithAccountTax(wizardConfig.accountId, bOpts);
        } else {
          billing = BillingEngine.compute(bOpts);
        }
        if (billing) finalNpr = BillingEngine.fmtNpr(billing.finalNpr);
      }

      var cfg           = (typeof BillingEngine !== 'undefined') ? BillingEngine.getConfig() : {};
      var showBreakdown = cfg.show_breakdown;

      // Build line items (only show if admin toggle is on)
      var breakdownHtml = '';
      if (showBreakdown && billing) {
        var items = [
          { label: 'Cloud compute (' + _esc(wizardConfig.instanceType) + ')', val: BillingEngine.fmtNpr(billing.instanceCost * billing.cfg.usd_to_npr) },
          { label: 'Storage (' + _esc(String(wizardConfig.storageGb)) + ' GB gp3)', val: BillingEngine.fmtNpr(billing.ebsCost * billing.cfg.usd_to_npr) },
        ];
        if (wizardConfig.elasticIp && billing.staticIpCost > 0)
          items.push({ label: 'Elastic IP', val: BillingEngine.fmtNpr(billing.staticIpCost * billing.cfg.usd_to_npr) });
        items.push({ label: 'Service & taxes', val: BillingEngine.fmtNpr((billing.wht + billing.margin + billing.vat) * billing.cfg.usd_to_npr) });
        if (billing.rebateNpr > 0)
          items.push({ label: '&#x2212; Rebate / discount', val: '&minus;' + BillingEngine.fmtNpr(billing.rebateNpr), isDiscount: true });
        var rows = items.map(function (it) {
          return '<tr class="' + (it.isDiscount ? 'lbs-price-discount' : '') + '"><td>' + it.label + '</td><td>' + it.val + '</td></tr>';
        }).join('');
        breakdownHtml =
          '<table class="lbs-price-table lbs-price-table--breakdown">' +
          '<thead><tr><th>Component</th><th>Cost (NPR)</th></tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
          '</table>';
      }

      contentEl.innerHTML = [
        '<div class="lbs-price-summary-card">',
        '  <div class="lbs-price-summary-label">Total for your server</div>',
        '  <div class="lbs-price-summary-amount">' + _esc(finalNpr) + '</div>',
        '  <div class="lbs-price-summary-meta">',
        '    ' + _esc(startDate) + ' \u2192 ' + _esc(endDate) + ' &nbsp;&middot;&nbsp; ' + totalDays + ' days &nbsp;&middot;&nbsp; ' + _esc(wizardConfig.instanceType || '') + ' &nbsp;&middot;&nbsp; ' + _esc(String(wizardConfig.storageGb)) + ' GB',
        '  </div>',
        '  <div class="lbs-price-incl-note">All taxes &amp; service charges included</div>',
        (billing && billing.rebateNpr > 0 ? '  <div class="lbs-price-rebate-badge">Discount of ' + BillingEngine.fmtNpr(billing.rebateNpr) + ' applied to your account</div>' : ''),
        '</div>',
        breakdownHtml,
        '<p class="lbs-pricing-source" style="margin-top:12px;">Live AWS pricing · Final amount is all-inclusive</p>',
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
      '    <button class="btn btn-blue" onclick="Labs._exitWizard()">View My Servers</button>',
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
            App.showToast('Server is ready!', 'ok');
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
    var displayName   = lab.labName || ('server-' + lab.labId.substring(0, 8));

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
      '    <div class="lbs-success-banner">Server Ready!</div>',
      '  </div>',
      '  <div class="lbs-wizard-body">',
      '    <div class="lbs-info-grid">',
      '      <div class="lbs-info-row"><b>Server ID:</b> <code>' + labIdEsc + '</code></div>',
      '      <div class="lbs-info-row"><b>Server Name:</b> '      + _esc(displayName)          + '</div>',
      '      <div class="lbs-info-row"><b>Server ID:</b> <code>' + _esc(lab.instanceId || '—') + '</code></div>',
      '      <div class="lbs-info-row"><b>Platform:</b> '      + _esc(platformLabel)        + '</div>',
      '      <div class="lbs-info-row"><b>Server Type:</b> ' + _esc(lab.instanceType || '—') + '</div>',
      '      <div class="lbs-info-row"><b>Region:</b> '        + _esc(lab.region)           + '</div>',
      '      <div class="lbs-info-row"><b>Public IP:</b> '     + _esc(ip)                   + '</div>',
      '      <div class="lbs-info-row"><b>Estimated Cost:</b> '+ _esc(costStr)              + '</div>',
      '      <div class="lbs-info-row"><b>Expires:</b> '       + _esc(expiry)               + '</div>',
      '    </div>',
      '    <p class="lbs-help-text" style="margin-top:8px;">Your server is now live. You can find it in your <b>My Servers</b> dashboard.</p>',
      '    ' + connectionHtml,
      '    <div style="margin-top:16px;">',
      '      <button class="btn btn-outline btn-sm" onclick="Labs.downloadLabInfo(\'' + labIdEsc + '\')">Download Server Info (.txt)</button>',
      '    </div>',
      '  </div>',
      '  <div class="lbs-wizard-footer">',
      '    <button class="btn btn-blue" onclick="Labs._exitWizard()">View My Servers</button>',
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
    a.href = url; a.download = 'server-' + labId + '.rdp'; a.click();
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
      'Server ID:      ' + (labId || '—'),
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

  // ════════════════════════════════════════════════════════════════
  // MY SERVERS v2 — Hero · Quick Launch · Cards · Billing · AI
  // ════════════════════════════════════════════════════════════════

  // ─── Region flags + labels ────────────────────────────────────

  var REGION_META = {
    'ap-south-1':     { flag: '🇮🇳', label: 'Mumbai' },
    'ap-south-2':     { flag: '🇮🇳', label: 'Hyderabad' },
    'us-east-1':      { flag: '🇺🇸', label: 'N. Virginia' },
    'us-east-2':      { flag: '🇺🇸', label: 'Ohio' },
    'us-west-1':      { flag: '🇺🇸', label: 'N. California' },
    'us-west-2':      { flag: '🇺🇸', label: 'Oregon' },
    'eu-west-1':      { flag: '🇮🇪', label: 'Ireland' },
    'eu-central-1':   { flag: '🇩🇪', label: 'Frankfurt' },
    'ap-southeast-1': { flag: '🇸🇬', label: 'Singapore' },
    'ap-southeast-2': { flag: '🇦🇺', label: 'Sydney' },
    'ap-northeast-1': { flag: '🇯🇵', label: 'Tokyo' },
  };

  function _regionFlag(region)  { return (REGION_META[region] || {}).flag  || '🌐'; }
  function _regionLabel(region) { return (REGION_META[region] || {}).label || (region || '—'); }

  // ─── Hero canvas animation ────────────────────────────────────

  function _initHeroCanvas(canvas) {
    if (!canvas || !canvas.getContext) return;
    var ctx   = canvas.getContext('2d');
    var W     = canvas.width  = canvas.offsetWidth  || 600;
    var H     = canvas.height = canvas.offsetHeight || 220;
    var nodes = [];
    var RAF   = null;

    for (var i = 0; i < 18; i++) {
      nodes.push({
        x:  Math.random() * W, y:  Math.random() * H,
        vx: (Math.random() - .5) * .4, vy: (Math.random() - .5) * .4,
        r:  2 + Math.random() * 1.5,
      });
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      // connections
      for (var a = 0; a < nodes.length; a++) {
        for (var b = a + 1; b < nodes.length; b++) {
          var dx = nodes[a].x - nodes[b].x, dy = nodes[a].y - nodes[b].y;
          var dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 110) {
            ctx.beginPath();
            ctx.moveTo(nodes[a].x, nodes[a].y);
            ctx.lineTo(nodes[b].x, nodes[b].y);
            ctx.strokeStyle = 'rgba(59,127,255,' + (1 - dist / 110) * .35 + ')';
            ctx.lineWidth = .8;
            ctx.stroke();
          }
        }
      }
      // nodes
      nodes.forEach(function (n) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(93,155,255,.7)';
        ctx.fill();
        n.x += n.vx; n.y += n.vy;
        if (n.x < 0 || n.x > W) n.vx *= -1;
        if (n.y < 0 || n.y > H) n.vy *= -1;
      });
      RAF = requestAnimationFrame(draw);
    }

    draw();
    canvas._stopAnimation = function () { if (RAF) cancelAnimationFrame(RAF); };

    // resize
    var ro = new ResizeObserver(function () {
      W = canvas.width  = canvas.offsetWidth  || 600;
      H = canvas.height = canvas.offsetHeight || 220;
    });
    ro.observe(canvas.parentElement || canvas);
  }

  // ─── Hero section ─────────────────────────────────────────────

  function _renderHero(counts) {
    var runningNpr = 0;
    var runningCnt = 0;
    activeLabs.forEach(function (lab) {
      if (lab.status === 'running') {
        runningCnt++;
        var b = typeof BillingEngine !== 'undefined'
          ? BillingEngine.compute({ instanceType: lab.instanceType, storageGb: lab.storageGb || 20, hoursPerDay: lab.hoursPerDay || 24, isRunning: true })
          : null;
        if (b) runningNpr += b.finalNpr;
      }
    });
    var nprStr = runningNpr > 0 && typeof BillingEngine !== 'undefined'
      ? BillingEngine.fmtNpr(runningNpr)
      : '—';
    return (
      '<div class="msv2-hero">' +
        '<canvas class="msv2-hero-canvas" id="msv2-hero-canvas"></canvas>' +
        '<div class="msv2-hero-content">' +
          '<div class="msv2-hero-eyebrow"><span class="msv2-hero-eyebrow-dot"></span>My Servers · ap-south-1</div>' +
          '<h1 class="msv2-hero-h1">Cloud Servers, Instantly.</h1>' +
          '<p class="msv2-hero-sub">Production-grade servers on AWS — billed transparently, managed centrally.</p>' +
          '<div class="msv2-hero-actions">' +
            '<button class="msv2-hero-btn-secondary" onclick="Labs._scrollToTemplates()">' +
              '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/></svg>' +
              'Browse Templates' +
            '</button>' +
          '</div>' +
        '</div>' +
        '<div class="msv2-hero-stats">' +
          '<div class="msv2-hero-stat"><div class="msv2-hero-stat-val">' + (counts.active || 0) + '</div><div class="msv2-hero-stat-lbl">Running</div></div>' +
          '<div class="msv2-hero-stat"><div class="msv2-hero-stat-val" style="font-size:14px;">' + _esc(nprStr) + '</div><div class="msv2-hero-stat-lbl">Monthly Spend</div></div>' +
          '<div class="msv2-hero-stat"><div class="msv2-hero-stat-val">99.9%</div><div class="msv2-hero-stat-lbl">Uptime SLA</div></div>' +
        '</div>' +
      '</div>'
    );
  }

  function _scrollToTemplates() {
    var el = document.getElementById('msv2-tpl-anchor');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  }

  // ─── Create Server CTA ────────────────────────────────────────

  function _renderCreateCta() {
    return (
      '<div class="msv2-create-cta">' +
        '<div class="msv2-create-cta-left">' +
          '<div class="msv2-create-cta-title">Create Your Server</div>' +
          '<p class="msv2-create-cta-sub">Launch a dedicated server in minutes. Choose a template or configure manually.</p>' +
        '</div>' +
        '<div class="msv2-create-cta-actions">' +
          '<button class="msv2-create-cta-btn" onclick="Labs.startWizard()">' +
            '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
            'Create Your Server' +
          '</button>' +
          '<button class="msv2-create-cta-link" onclick="Labs._scrollToTemplates()">' +
            'Browse Templates' +
            '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>' +
          '</button>' +
        '</div>' +
      '</div>'
    );
  }

  // ─── Feature columns ──────────────────────────────────────────

  function _renderFeatures() {
    return (
      '<div class="msv2-features">' +
        '<div class="msv2-feat">' +
          '<div class="msv2-feat-ico blue">⚡</div>' +
          '<div class="msv2-feat-title">Instant Provisioning</div>' +
          '<div class="msv2-feat-desc">Your server launches within minutes of payment approval. AWS EC2 infrastructure in ap-south-1 with elastic IP and key pair auto-generated.</div>' +
        '</div>' +
        '<div class="msv2-feat">' +
          '<div class="msv2-feat-ico green">🔒</div>' +
          '<div class="msv2-feat-title">Managed Security</div>' +
          '<div class="msv2-feat-desc">Custom security groups, encrypted storage, SSH key management, and Windows RDP password retrieval — all secured and audited.</div>' +
        '</div>' +
        '<div class="msv2-feat">' +
          '<div class="msv2-feat-ico violet">💳</div>' +
          '<div class="msv2-feat-title">Transparent Billing</div>' +
          '<div class="msv2-feat-desc">Real-time NPR cost tracking per server. Live spend ticker, 12-month forecast, and itemised billing with WHT, margin, and VAT included.</div>' +
        '</div>' +
      '</div>'
    );
  }

  // ─── Quick Launch Templates ───────────────────────────────────

  function _renderQuickLaunch() {
    if (typeof BillingEngine === 'undefined') return '';

    var tpls   = BillingEngine.templatePrices();
    var colors = ['c-green', 'c-blue', 'c-amber', 'c-violet', 'c-red', 'c-cyan'];
    var html   = '<div class="msv2-ql-section" id="msv2-tpl-anchor">' +
      '<div class="msv2-ql-header">' +
        '<div>' +
          '<div class="msv2-ql-title">' +
            '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>' +
            'Quick Launch' +
          '</div>' +
          '<div class="msv2-ql-sub" style="margin-top:3px;">Pre-configured templates with real AWS ap-south-1 pricing — ready in one click</div>' +
        '</div>' +
      '</div>' +
      '<div class="msv2-tpl-grid">';

    // Compute "savings vs next tier" for each template
    var prevNpr = 0;
    var tplsWithSavings = tpls.map(function (t, idx) {
      var npm = typeof BillingEngine !== 'undefined' ? BillingEngine.fmtNpr(t.billing.finalNpr) : '—';
      var pct = (idx > 0 && prevNpr > 0) ? null : null;  // savings vs custom-config baseline
      prevNpr = t.billing.finalNpr;
      return Object.assign({}, t, { npr: npm });
    });

    // Annotate "best value" and "most popular"
    var popularIdx = 2;   // E-Commerce (index 2)
    var bestValIdx = 1;   // Dev Sandbox (index 1)

    tplsWithSavings.forEach(function (t, idx) {
      var b    = t.billing;
      var col  = colors[idx % colors.length];
      var npr  = t.npr;
      var uses = t.useCases.map(function (u) { return '<span class="msv2-tpl-use">' + _esc(u) + '</span>'; }).join('');

      // Highlight banners
      var ribbonHtml = '';
      if (idx === popularIdx) ribbonHtml = '<div class="msv2-tpl-ribbon msv2-tpl-ribbon--popular">Most Popular</div>';
      if (idx === bestValIdx) ribbonHtml = '<div class="msv2-tpl-ribbon msv2-tpl-ribbon--value">Best Value</div>';

      // Savings badge (monthly tax-inclusive price converted to a catchy phrase)
      var savingsBadge = '';
      if (t.id === 'starter-blog') savingsBadge = 'Starting from ' + _esc(npr) + '/mo';
      else if (t.id === 'dev-sandbox') savingsBadge = 'Save with bundles — from ' + _esc(npr) + '/mo';
      else savingsBadge = 'From ' + _esc(npr) + '/mo';

      // Hardware highlights
      var specIcons = [
        '<div class="msv2-tpl-hw"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--blue2)"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M15 2v2M9 2v2M15 20v2M9 20v2M2 15h2M2 9h2M20 15h2M20 9h2"/></svg><span>' + t.vcpu + ' vCPU</span></div>',
        '<div class="msv2-tpl-hw"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--green2)"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg><span>' + t.ram + '</span></div>',
        '<div class="msv2-tpl-hw"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--amber)"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3"/></svg><span>' + t.storageGb + ' GB SSD</span></div>',
      ].join('');

      html +=
        '<div class="msv2-tpl-card ' + col + (idx === popularIdx ? ' msv2-tpl-card--featured' : '') + '">' +
          ribbonHtml +
          '<div class="msv2-tpl-top">' +
            '<div class="msv2-tpl-icon-wrap">' +
              '<span class="msv2-tpl-icon">' + t.icon + '</span>' +
            '</div>' +
            '<span class="tpl-badge ' + _esc(t.badgeClass) + '">' + _esc(t.badge) + '</span>' +
          '</div>' +
          '<div class="msv2-tpl-name">' + _esc(t.name) + '</div>' +
          '<div class="msv2-tpl-desc">' + _esc(t.description) + '</div>' +
          '<div class="msv2-tpl-hw-row">' + specIcons + '</div>' +
          '<div class="msv2-tpl-uses">' + uses + '</div>' +
          '<div class="msv2-tpl-divider"></div>' +
          '<div class="msv2-tpl-price-row">' +
            '<div class="msv2-tpl-price-block">' +
              '<div class="msv2-tpl-price-from">Starting from</div>' +
              '<div class="msv2-tpl-price-main">' + _esc(npr) + '</div>' +
              '<div class="msv2-tpl-price-sub">/ month &nbsp;&middot;&nbsp; all taxes incl.</div>' +
            '</div>' +
            '<button class="msv2-tpl-launch" onclick="Labs._launchTemplate(\'' + _esc(t.id) + '\')">' +
              '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" style="flex-shrink:0"><polygon points="5 3 19 12 5 21 5 3"/></svg>' +
              'Deploy Now' +
            '</button>' +
          '</div>' +
          '<div class="msv2-tpl-trust">' +
            '<span class="msv2-tpl-trust-item">' +
              '<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>' +
              'Ready in minutes' +
            '</span>' +
            '<span class="msv2-tpl-trust-item">' +
              '<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' +
              '24/7 support' +
            '</span>' +
            '<span class="msv2-tpl-trust-item">' +
              '<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>' +
              'Secure &amp; managed' +
            '</span>' +
          '</div>' +
        '</div>';
    });

    html += '</div></div>';
    return html;
  }

  function _launchTemplate(tplId) {
    if (typeof BillingEngine === 'undefined') { startWizard(); return; }
    var tpl = BillingEngine.getTemplates().find(function (t) { return t.id === tplId; });
    if (!tpl) { startWizard(); return; }
    startWizard({
      instanceType:    tpl.instanceType,
      storageGb:       tpl.storageGb,
      detailedMonitor: tpl.detailedMonitor,
      labName:         tpl.name + ' Server',
      platform:        tpl.platform || 'ubuntu',
      region:          'ap-south-1',
      hoursPerDay:     8,   // cards display 8 hrs/day price — keep it consistent
      elasticIp:       true,
    });
  }

  // ─── AI Advisor ───────────────────────────────────────────────

  function _renderAdvisor() {
    return (
      '<div class="msv2-advisor" id="msv2-advisor">' +
        '<div class="msv2-advisor-hd">' +
          '<div class="msv2-advisor-title">' +
            '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><circle cx="12" cy="17" r=".5" fill="currentColor"/></svg>' +
            'AI Server Advisor' +
            '<span class="msv2-advisor-badge">Claude AI</span>' +
          '</div>' +
          '<button class="btn btn-xs btn-out" onclick="Labs._toggleAdvisor()" id="msv2-advisor-toggle">Collapse</button>' +
        '</div>' +
        '<div class="msv2-advisor-body" id="msv2-advisor-body">' +
          '<p style="font-size:12px;color:var(--ink4);margin:0 0 12px;">Describe your project and get a template recommendation with reasoning.</p>' +
          '<div class="msv2-advisor-prompt-wrap">' +
            '<textarea class="msv2-advisor-input" id="msv2-advisor-txt" rows="3" placeholder="e.g. I need to host a Node.js API with 50k daily users, PostgreSQL database, and occasional spike traffic…"></textarea>' +
          '</div>' +
          '<button class="msv2-advisor-send" onclick="Labs._askAdvisor()" id="msv2-advisor-btn">Ask Advisor</button>' +
          '<div class="msv2-advisor-result" id="msv2-advisor-result"></div>' +
        '</div>' +
      '</div>'
    );
  }

  var _advisorOpen = true;
  function _toggleAdvisor() {
    _advisorOpen = !_advisorOpen;
    var body   = document.getElementById('msv2-advisor-body');
    var toggle = document.getElementById('msv2-advisor-toggle');
    if (body)   body.style.display   = _advisorOpen ? '' : 'none';
    if (toggle) toggle.textContent   = _advisorOpen ? 'Collapse' : 'Expand';
  }

  async function _askAdvisor() {
    var txt    = document.getElementById('msv2-advisor-txt');
    var resEl  = document.getElementById('msv2-advisor-result');
    var sendBtn = document.getElementById('msv2-advisor-btn');
    if (!txt || !resEl) return;
    var prompt = (txt.value || '').trim();
    if (!prompt) { App.showToast('Describe your use case first', 'info'); return; }

    if (sendBtn) sendBtn.disabled = true;
    resEl.className = 'msv2-advisor-result visible';
    resEl.innerHTML =
      '<div class="msv2-advisor-thinking">' +
        '<div class="msv2-advisor-thinking-dot"></div>' +
        'Analysing your requirements…' +
      '</div>';

    try {
      var body = {
        action: 'advisor',
        prompt: prompt,
        templates: typeof BillingEngine !== 'undefined'
          ? BillingEngine.getTemplates().map(function (t) { return { id: t.id, name: t.name, description: t.description, instanceType: t.instanceType, vcpu: t.vcpu, ram: t.ram, storageGb: t.storageGb }; })
          : [],
      };

      var res  = await API.provisionLab(body);
      var data = await res.json();

      if (res.ok && data.recommendation) {
        resEl.innerHTML = '<div style="line-height:1.7;">' + _esc(data.recommendation).replace(/\n/g, '<br>') + '</div>';
      } else if (data.message) {
        // Backend not wired — show a client-side recommendation
        resEl.innerHTML = _clientAdvisor(prompt);
      } else {
        resEl.innerHTML = _clientAdvisor(prompt);
      }
    } catch (_) {
      resEl.innerHTML = _clientAdvisor(prompt);
    } finally {
      if (sendBtn) sendBtn.disabled = false;
    }
  }

  function _clientAdvisor(prompt) {
    var lc = prompt.toLowerCase();
    var rec;
    if (lc.match(/game|minecraft|cs2|valheim|gaming/))
      rec = { name: 'Game Server', note: 'High CPU allocation (c5.xlarge) handles game physics and concurrent player connections without lag spikes.' };
    else if (lc.match(/api|backend|microservic|high.traffic|production/))
      rec = { name: 'Enterprise API', note: 'm5.xlarge provides balanced CPU and memory ideal for concurrent request handling and in-memory caching.' };
    else if (lc.match(/analytic|data|jupyter|spark|pandas|ml|machine learning/))
      rec = { name: 'Analytics Engine', note: 'm5.large offers strong memory-to-CPU ratio for data processing workloads and Jupyter notebooks.' };
    else if (lc.match(/shop|store|woo|magento|ecommerce|e-commerce/))
      rec = { name: 'E-Commerce', note: 't3.large handles PHP/MySQL stacks well and scales with burstable CPU for traffic spikes.' };
    else if (lc.match(/dev|test|staging|ci|node|python|docker/))
      rec = { name: 'Dev Sandbox', note: 't3.medium gives enough CPU and RAM for local development stacks with room for Docker containers.' };
    else
      rec = { name: 'Starter Blog', note: 't3.micro is ideal for low-traffic sites. You can always resize later if traffic grows.' };

    return '<strong>Recommended: ' + rec.name + '</strong><br>' + rec.note + '<br><br>' +
      '<button class="btn btn-sm btn-blue" onclick="Labs._launchTemplate(\'' + rec.name.toLowerCase().replace(/\s+/g, '-') + '\')">Launch ' + rec.name + '</button>';
  }

  // ─── Summary bar ──────────────────────────────────────────────

  function _renderSummaryBar(counts) {
    var totalNpr = 0;
    var running  = 0;
    activeLabs.forEach(function (lab) {
      if (lab.status === 'running') {
        running++;
        var b = typeof BillingEngine !== 'undefined'
          ? BillingEngine.compute({ instanceType: lab.instanceType, storageGb: lab.storageGb || 20, hoursPerDay: lab.hoursPerDay || 24, isRunning: true })
          : null;
        if (b) totalNpr += b.finalNpr;
      }
    });
    var nprStr = totalNpr > 0 && typeof BillingEngine !== 'undefined' ? BillingEngine.fmtNpr(totalNpr) : '—';
    return (
      '<div class="msv2-summary-bar">' +
        '<div class="msv2-summary-stats">' +
          '<div class="msv2-sum-stat"><span class="msv2-sum-val green">' + running + '</span><span class="msv2-sum-lbl">Active</span></div>' +
          '<div class="msv2-sum-sep"></div>' +
          '<div class="msv2-sum-stat"><span class="msv2-sum-val">' + counts.all + '</span><span class="msv2-sum-lbl">Total</span></div>' +
          '<div class="msv2-sum-sep"></div>' +
          '<div class="msv2-sum-stat"><span class="msv2-sum-val" style="font-size:16px;">' + _esc(nprStr) + '</span><span class="msv2-sum-lbl">/ month</span></div>' +
        '</div>' +
        '<button class="lbs-cta-btn" onclick="Labs.startWizard()">' +
          '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
          'New Server' +
        '</button>' +
      '</div>'
    );
  }

  // ─── Controls (search / sort / filter) ───────────────────────

  function _renderControls(counts) {
    var filters = [
      { key: 'all',     label: 'All',     count: counts.all     },
      { key: 'active',  label: 'Active',  count: counts.active  },
      { key: 'pending', label: 'Pending', count: counts.pending },
      { key: 'history', label: 'History', count: counts.history },
    ];
    var pills = filters.map(function (f) {
      var cls = 'msv2-pill' + (_activeFilter === f.key ? ' active' : '');
      return '<button class="' + cls + '" onclick="Labs._setFilter(\'' + f.key + '\')">' +
        f.label + '<span class="msv2-pill-cnt">' + (f.count || 0) + '</span></button>';
    }).join('');

    var sortOptions = [
      { val: 'cost',   label: 'Sort: Cost'    },
      { val: 'name',   label: 'Sort: Name'    },
      { val: 'status', label: 'Sort: Status'  },
      { val: 'uptime', label: 'Sort: Uptime'  },
    ].map(function (o) {
      return '<option value="' + o.val + '"' + (_sortBy === o.val ? ' selected' : '') + '>' + o.label + '</option>';
    }).join('');

    return (
      '<div class="msv2-controls">' +
        '<div class="msv2-search-wrap">' +
          '<svg class="msv2-search-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' +
          '<input class="msv2-search" type="text" placeholder="Search servers…" value="' + _esc(_searchQuery) + '" oninput="Labs._handleSearch(this.value)"/>' +
        '</div>' +
        '<div class="msv2-filter-pills">' + pills + '</div>' +
        '<select class="msv2-sort-select" onchange="Labs._setSort(this.value)">' + sortOptions + '</select>' +
      '</div>'
    );
  }

  function _handleSearch(val) {
    _searchQuery = val || '';
    _renderLabsList();
  }

  function _setSort(val) {
    _sortBy = val;
    _renderLabsList();
  }

  // ─── Bulk selection bar ───────────────────────────────────────

  function _renderBulkBar() {
    if (_selectedIds.length === 0) return '';
    return (
      '<div class="msv2-bulk-bar">' +
        '<span class="msv2-bulk-count">' + _selectedIds.length + ' selected</span>' +
        '<button class="btn btn-xs btn-green" onclick="Labs._bulkStart()">Start All</button>' +
        '<button class="btn btn-xs btn-red" onclick="Labs._bulkStop()">Stop All</button>' +
        '<button class="btn btn-xs btn-danger" onclick="Labs._bulkDelete()">Terminate All</button>' +
        '<button class="btn btn-xs btn-out" onclick="Labs._clearSelection()">Deselect All</button>' +
      '</div>'
    );
  }

  function _toggleSelect(labId) {
    var idx = _selectedIds.indexOf(labId);
    if (idx === -1) _selectedIds.push(labId);
    else            _selectedIds.splice(idx, 1);
    _renderLabsList();
  }

  function _clearSelection() {
    _selectedIds = [];
    _renderLabsList();
  }

  async function _bulkStop() {
    var ids = _selectedIds.slice();
    if (!ids.length) return;
    if (!confirm('Stop ' + ids.length + ' server(s)?')) return;
    for (var i = 0; i < ids.length; i++) {
      var lab = activeLabs.find(function (l) { return l.labId === ids[i]; });
      if (!lab || lab.status !== 'running') continue;
      try { await API.ec2Action({ action: 'stop', instanceId: lab.instanceId, accountId: lab.accountId, region: lab.region }); } catch (_) {}
    }
    App.showToast('Stop commands sent', 'ok');
    _clearSelection();
    setTimeout(_loadActiveLabs, 3000);
  }

  async function _bulkStart() {
    var ids = _selectedIds.slice();
    if (!ids.length) return;
    for (var i = 0; i < ids.length; i++) {
      var lab = activeLabs.find(function (l) { return l.labId === ids[i]; });
      if (!lab || lab.status !== 'stopped') continue;
      try { await API.ec2Action({ action: 'start', instanceId: lab.instanceId, accountId: lab.accountId, region: lab.region }); } catch (_) {}
    }
    App.showToast('Start commands sent', 'ok');
    _clearSelection();
    setTimeout(_loadActiveLabs, 3000);
  }

  async function _bulkDelete() {
    var ids = _selectedIds.slice();
    if (!ids.length) return;
    if (!confirm('Permanently terminate ' + ids.length + ' server(s)? This cannot be undone.')) return;
    for (var i = 0; i < ids.length; i++) {
      try { await API.deleteLabInstance({ labId: ids[i] }); } catch (_) {}
    }
    App.showToast('Servers terminated', 'ok');
    _clearSelection();
    _loadActiveLabs();
  }

  // ─── Three-dot menu ───────────────────────────────────────────

  function _openMenu(labId, e) {
    if (e) e.stopPropagation();
    if (_openMenuId === labId) { _openMenuId = null; _renderLabsList(); return; }
    _openMenuId = labId;
    _renderLabsList();
    // Close on outside click
    setTimeout(function () {
      document.addEventListener('click', _closeMenuOnce, { once: true });
    }, 0);
  }

  function _closeMenuOnce() {
    if (_openMenuId) { _openMenuId = null; _renderLabsList(); }
  }

  function _menuRename(labId) {
    _openMenuId = null;
    var lab = activeLabs.find(function (l) { return l.labId === labId; });
    if (!lab) return;
    var newName = prompt('Rename server:', lab.labName || ('server-' + labId.substring(0, 8)));
    if (newName && newName.trim()) {
      lab.labName = newName.trim();
      App.showToast('Renamed (local only — backend rename coming soon)', 'info');
      _renderLabsList();
    }
  }

  function _menuCloneConfig(labId) {
    _openMenuId = null;
    var lab = activeLabs.find(function (l) { return l.labId === labId; });
    if (!lab) return;
    wizardConfig = {
      instanceType:    lab.instanceType,
      storageGb:       lab.storageGb,
      platform:        lab.platform,
      region:          lab.region,
      accountId:       lab.accountId,
      labName:         (lab.labName || '') + ' (copy)',
    };
    startWizard();
  }

  function _menuViewLogs(labId) {
    _openMenuId = null;
    App.showToast('Log viewer — coming soon', 'info');
  }

  function _menuBillingHistory(labId) {
    _openMenuId = null;
    App.showToast('Billing history — coming soon', 'info');
  }

  // ─── Sparkline SVG ────────────────────────────────────────────

  function _sparkline(data, color) {
    if (!data || data.length < 2) return '<span style="color:var(--ink4);font-size:11px;">No data</span>';
    var W = 120, H = 36;
    var min = Math.min.apply(null, data), max = Math.max.apply(null, data);
    var range = max - min || 1;
    var xs = data.map(function (_, i) { return (i / (data.length - 1)) * W; });
    var ys = data.map(function (v) { return H - ((v - min) / range) * (H - 4) - 2; });
    var pts = xs.map(function (x, i) { return x + ',' + ys[i]; }).join(' ');
    var areaBottom = xs.map(function (x, i) { return x + ',' + H; });
    var areaPath = 'M ' + pts.split(' ').join(' L ') +
      ' L ' + xs[xs.length - 1] + ',' + H +
      ' L ' + xs[0] + ',' + H + ' Z';
    var linePath = 'M ' + pts.split(' ').join(' L ');
    color = color || 'var(--blue2)';
    return (
      '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" style="display:block;">' +
        '<defs><linearGradient id="sg' + Math.floor(Math.random() * 9999) + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="' + color + '" stop-opacity=".3"/><stop offset="100%" stop-color="' + color + '" stop-opacity="0"/></linearGradient></defs>' +
        '<path d="' + areaPath + '" fill="' + color + '" opacity=".15"/>' +
        '<path d="' + linePath + '" fill="none" stroke="' + color + '" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>' +
        '<circle cx="' + xs[xs.length - 1] + '" cy="' + ys[ys.length - 1] + '" r="2.5" fill="' + color + '"/>' +
      '</svg>'
    );
  }

  function _mockSparkData(lab) {
    // Generate plausible 7-day cost sparkline from billing
    var b = typeof BillingEngine !== 'undefined'
      ? BillingEngine.compute({ instanceType: lab.instanceType, storageGb: lab.storageGb || 20, hoursPerDay: lab.hoursPerDay || 24, isRunning: true })
      : null;
    var daily = b ? (b.finalNpr / 30) : 0;
    var data  = [];
    for (var i = 6; i >= 0; i--) {
      data.push(daily * (0.85 + Math.random() * 0.3));
    }
    return data;
  }

  // ─── Card grid ────────────────────────────────────────────────

  function _renderCardGrid(labs) {
    if (labs.length === 0) {
      var msg = {
        active:  'No running servers.',
        pending: 'No servers pending approval.',
        history: 'No history yet.',
        all:     'No servers match your search.',
      }[_activeFilter] || 'No servers found.';
      return '<div class="msv2-empty">' +
        '<div class="msv2-empty-icon">🖥️</div>' +
        '<div class="msv2-empty-title">Nothing here</div>' +
        '<div class="msv2-empty-desc">' + msg + '</div>' +
        '<button class="btn btn-blue" onclick="Labs.startWizard()">Provision New Server</button>' +
        '</div>';
    }

    // Staggered card entrance (CSS animation-delay via inline style)
    var html = '<div class="msv2-grid">';
    labs.forEach(function (lab, idx) {
      html += _renderCard(lab, idx);
    });
    html += '</div>';
    return html;
  }

  function _renderCard(lab, idx) {
    var labIdEsc  = _esc(lab.labId);
    var status    = lab.status || 'pending';
    var stateCls  = status === 'running' ? 'running' : (status === 'stopped' ? 'stopped' : 'pending');
    var stateLabel = STATUS_LABELS[status] || status;
    var isSelected = _selectedIds.indexOf(lab.labId) !== -1;
    var isRunning  = status === 'running';
    var isStopped  = status === 'stopped';
    var region     = lab.region || 'ap-south-1';
    var name       = lab.labName || ('server-' + lab.labId.substring(0, 8));

    // Billing
    var billing = null;
    if (typeof BillingEngine !== 'undefined') {
      billing = BillingEngine.compute({
        instanceType:    lab.instanceType,
        storageGb:       lab.storageGb || 20,
        hoursPerDay:     lab.hoursPerDay || 24,
        isRunning:       isRunning,
        detailedMonitor: !!(lab.detailedMonitor),
      });
    }
    var nprStr  = billing ? BillingEngine.fmtNpr(billing.finalNpr) : (lab.estimatedCost ? _npmFmt(Number(lab.estimatedCost)) : '—');
    var perSec  = billing ? billing.perSecondNpr : 0;

    // Sparkline (for active servers)
    var sparkHtml = '';
    if (isRunning) {
      var sparkData = _mockSparkData(lab);
      sparkHtml = _sparkline(sparkData, 'var(--blue2)');
    }

    // Live cost ticker
    var tickerHtml = '';
    if (isRunning && perSec > 0) {
      tickerHtml =
        '<div class="msv2-ticker">' +
          '<span class="msv2-ticker-dot"></span>' +
          '<span>Live</span>' +
          '<span class="msv2-ticker-val" id="msv2-tick-' + labIdEsc + '">NPR 0.000</span>' +
          '<span style="color:var(--ink4)">/s</span>' +
        '</div>';
    }

    // Three-dot menu
    var menuHtml = '';
    if (_openMenuId === lab.labId) {
      menuHtml =
        '<div class="msv2-dots-menu" id="msv2-menu-' + labIdEsc + '">' +
          '<div class="msv2-dots-item" onclick="Labs._menuRename(\'' + labIdEsc + '\')">' +
            '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' +
            'Rename' +
          '</div>' +
          '<div class="msv2-dots-item" onclick="Labs._menuCloneConfig(\'' + labIdEsc + '\')">' +
            '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>' +
            'Clone Config' +
          '</div>' +
          '<div class="msv2-dots-item" onclick="Labs._menuViewLogs(\'' + labIdEsc + '\')">' +
            '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>' +
            'View Logs' +
          '</div>' +
          '<div class="msv2-dots-item" onclick="Labs._menuBillingHistory(\'' + labIdEsc + '\')">' +
            '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>' +
            'Billing History' +
          '</div>' +
          '<div class="msv2-dots-sep"></div>' +
          '<div class="msv2-dots-item danger" onclick="Labs._confirmDelete(\'' + labIdEsc + '\')">' +
            '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>' +
            'Terminate' +
          '</div>' +
        '</div>';
    }

    var delay = (idx * 0.05).toFixed(2) + 's';
    var statusStripe = 'status-' + (status === 'running' ? 'running' : status === 'stopped' ? 'stopped' : status === 'provisioning' ? 'provisioning' : 'pending');
    var platformIcon = lab.platform === 'windows'
      ? '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" style="color:var(--blue2)"><path d="M3 5.6L10.5 4.5V11.6H3V5.6ZM11.5 4.35L21 3V11.6H11.5V4.35ZM3 12.4H10.5V19.5L3 18.4V12.4ZM11.5 12.4H21V21L11.5 19.65V12.4Z"/></svg>'
      : '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--green2)"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>';

    var expiryHtml = lab.expiresAt
      ? '<div class="msv2-card-info-item"><span class="msv2-card-info-lbl">Expires</span><span class="msv2-card-info-val">' + _renderExpiry(lab) + '</span></div>'
      : '<div class="msv2-card-info-item msv2-card-info-item--muted"><span class="msv2-card-info-lbl">Expires</span><span class="msv2-card-info-val">No expiry set</span></div>';
    var ipHtml = lab.publicIp
      ? '<div class="msv2-card-info-item"><span class="msv2-card-info-lbl">IP Address</span><span class="msv2-card-info-val msv2-card-info-mono">' + _esc(lab.publicIp) + '</span></div>'
      : '<div class="msv2-card-info-item msv2-card-info-item--muted"><span class="msv2-card-info-lbl">IP Address</span><span class="msv2-card-info-val">Not assigned</span></div>';
    var accountHtml = '<div class="msv2-card-info-item"><span class="msv2-card-info-lbl">Account</span><span class="msv2-card-info-val">' + _esc(lab.accountName || lab.accountId || 'Central') + '</span></div>';
    var statusInfoHtml = '<div class="msv2-card-info-item"><span class="msv2-card-info-lbl">State</span><span class="msv2-card-info-val">' + _esc(stateLabel) + '</span></div>';
    ipHtml += accountHtml;
    expiryHtml += statusInfoHtml;
    tickerHtml = '<div class="msv2-card-cost-note">Includes taxes and service charges</div>' + tickerHtml;
    sparkHtml = isRunning && sparkHtml
      ? '<div class="msv2-card-trend"><div class="msv2-card-meta-label">7-day spend trend</div>' + sparkHtml + '</div>'
      : '<div class="msv2-card-trend msv2-card-trend--empty"><div class="msv2-card-meta-label">7-day spend trend</div><div class="msv2-card-trend-empty">Trend appears once the server is running.</div></div>';
    var detailsBtnClass = (isStopped || isRunning) ? ' detail msv2-card-btn--secondary' : ' detail msv2-card-btn--full';

    return (
      '<div class="msv2-card ' + statusStripe + (isSelected ? ' selected' : '') + '" style="animation-delay:' + delay + '" id="msv2-card-' + labIdEsc + '">' +
        // ── Header
        '<div class="msv2-card-hd">' +
          '<div class="msv2-card-hd-left">' +
            '<div class="msv2-card-check' + (isSelected ? ' checked' : '') + '" onclick="event.stopPropagation();Labs._toggleSelect(\'' + labIdEsc + '\')" title="Select"></div>' +
            '<div class="msv2-card-title-block">' +
              '<div class="msv2-card-name" title="' + _esc(name) + '">' + _esc(name) + '</div>' +
              '<div class="msv2-card-subtitle">' +
                '<span class="msv2-card-flag">' + _regionFlag(region) + '</span>' +
                '<span class="msv2-card-region-lbl">' + _esc(_regionLabel(region)) + '</span>' +
                '<span class="msv2-card-platform-ico">' + platformIcon + '</span>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="msv2-card-hd-right">' +
            '<div class="msv2-status ' + stateCls + '">' +
              '<span class="msv2-status-dot"></span>' +
              _esc(stateLabel) +
            '</div>' +
            '<button class="msv2-dots-btn" onclick="event.stopPropagation();Labs._openMenu(\'' + labIdEsc + '\',event)" title="More actions">' +
              '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>' +
            '</button>' +
            menuHtml +
          '</div>' +
        '</div>' +
        // ── Spec chips row
        '<div class="msv2-card-specs">' +
          '<span class="msv2-card-spec-chip">' + _esc(lab.instanceType || '—') + '</span>' +
          '<span class="msv2-card-spec-chip">' + _esc(String(lab.storageGb || '—')) + ' GB</span>' +
          (lab.elasticIp ? '<span class="msv2-card-spec-chip msv2-chip--eip">Fixed IP</span>' : '') +
        '</div>' +
        // ── Info grid
        '<div class="msv2-card-info-grid">' +
          ipHtml +
          expiryHtml +
        '</div>' +
        // ── Cost block
        '<div class="msv2-card-cost-block">' +
          '<div class="msv2-card-cost-lbl">Monthly cost (incl. taxes)</div>' +
          '<div class="msv2-card-cost">' + _esc(nprStr) + '</div>' +
          tickerHtml +
        '</div>' +
        sparkHtml +
        // ── Actions
        '<div class="msv2-card-ft">' +
          (isStopped
            ? '<button class="msv2-card-btn start" onclick="event.stopPropagation();Labs._startLab(\'' + labIdEsc + '\')">' +
                '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg> Start' +
              '</button>'
            : '') +
          (isRunning
            ? '<button class="msv2-card-btn stop" onclick="event.stopPropagation();Labs._stopLab(\'' + labIdEsc + '\')">' +
                '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="18" height="18" rx="2"/></svg> Stop' +
              '</button>'
            : '') +
          '<button class="msv2-card-btn' + detailsBtnClass + '" onclick="Labs._toggleRowDetail(\'' + labIdEsc + '\')">' +
            '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7"/></svg> Details' +
          '</button>' +
        '</div>' +
      '</div>'
    );
  }

  // ─── Quick start/stop from card ───────────────────────────────

  async function _quickStart(labId) {
    var lab = activeLabs.find(function (l) { return l.labId === labId; });
    if (!lab || !lab.instanceId) { App.showToast('Server not available', 'err'); return; }
    try {
      await API.ec2Action({ action: 'start', instanceId: lab.instanceId, accountId: lab.accountId, region: lab.region });
      App.showToast((lab.labName || labId) + ' start command sent', 'ok');
      setTimeout(_loadActiveLabs, 4000);
    } catch (e) { App.showToast('Start failed: ' + e.message, 'err'); }
  }

  async function _quickStop(labId) {
    var lab = activeLabs.find(function (l) { return l.labId === labId; });
    if (!lab || !lab.instanceId) { App.showToast('Server not available', 'err'); return; }
    try {
      await API.ec2Action({ action: 'stop', instanceId: lab.instanceId, accountId: lab.accountId, region: lab.region });
      App.showToast((lab.labName || labId) + ' stop command sent', 'ok');
      setTimeout(_loadActiveLabs, 4000);
    } catch (e) { App.showToast('Stop failed: ' + e.message, 'err'); }
  }

  // ─── Cost tickers ─────────────────────────────────────────────

  function _stopAllTickers() {
    Object.keys(_tickerTimers).forEach(function (id) {
      clearInterval(_tickerTimers[id]);
    });
    _tickerTimers = {};
  }

  function _startTickers() {
    _stopAllTickers();
    activeLabs.forEach(function (lab) {
      if (lab.status !== 'running') return;
      var b = typeof BillingEngine !== 'undefined'
        ? BillingEngine.compute({ instanceType: lab.instanceType, storageGb: lab.storageGb || 20, hoursPerDay: lab.hoursPerDay || 24, isRunning: true })
        : null;
      if (!b || b.perSecondNpr <= 0) return;

      var labId = lab.labId;
      var start = Date.now();
      var rate  = b.perSecondNpr;
      var el    = document.getElementById('msv2-tick-' + labId);
      if (!el) return;

      _tickerTimers[labId] = setInterval(function () {
        var el2 = document.getElementById('msv2-tick-' + labId);
        if (!el2) { clearInterval(_tickerTimers[labId]); delete _tickerTimers[labId]; return; }
        var spent = rate * ((Date.now() - start) / 1000);
        el2.textContent = 'NPR ' + spent.toFixed(4);
      }, 333);
    });
  }

  // ─── 12-month forecast chart ──────────────────────────────────

  function _renderForecastChart(totalMonthlyNpr) {
    if (!totalMonthlyNpr || totalMonthlyNpr <= 0 || typeof BillingEngine === 'undefined') return '';
    var points = BillingEngine.forecast12m(totalMonthlyNpr, 0.04);
    var W = 440, H = 120;
    var vals  = points.map(function (p) { return p.value; });
    var maxV  = Math.max.apply(null, vals) * 1.1;
    var minV  = Math.min.apply(null, vals) * 0.9;
    var range = maxV - minV || 1;
    var pad   = { l: 60, r: 14, t: 10, b: 28 };
    var cW    = W - pad.l - pad.r;
    var cH    = H - pad.t - pad.b;

    var xs = vals.map(function (_, i) { return pad.l + (i / (vals.length - 1)) * cW; });
    var ys = vals.map(function (v) { return pad.t + cH - ((v - minV) / range) * cH; });

    var linePath = xs.map(function (x, i) { return (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + ys[i].toFixed(1); }).join(' ');
    var areaPath = linePath + ' L' + xs[xs.length - 1].toFixed(1) + ',' + (pad.t + cH) + ' L' + pad.l + ',' + (pad.t + cH) + ' Z';

    var dots = xs.map(function (x, i) {
      return '<circle cx="' + x.toFixed(1) + '" cy="' + ys[i].toFixed(1) + '" r="3" fill="var(--blue2)"/>';
    }).join('');

    var labels = points.map(function (p, i) {
      return '<text x="' + xs[i].toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="9" fill="var(--ink4)" font-family="Inter,sans-serif">' + p.label + '</text>';
    }).join('');

    var yLabels = '';
    for (var t = 0; t <= 3; t++) {
      var y = pad.t + (t / 3) * cH;
      var v = maxV - (t / 3) * (maxV - minV);
      yLabels += '<text x="' + (pad.l - 5) + '" y="' + (y + 3) + '" text-anchor="end" font-size="8" fill="var(--ink4)" font-family="Inter,sans-serif">' + (v / 1000).toFixed(0) + 'k</text>';
      yLabels += '<line x1="' + pad.l + '" y1="' + y + '" x2="' + (pad.l + cW) + '" y2="' + y + '" stroke="var(--bd)" stroke-width="0.5" stroke-dasharray="3,3"/>';
    }

    return (
      '<div class="msv2-forecast">' +
        '<div class="msv2-forecast-title">' +
          '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>' +
          '12-Month Cost Forecast (NPR, +4% growth)' +
        '</div>' +
        '<div class="msv2-chart-wrap">' +
          '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="' + H + '">' +
            '<defs><linearGradient id="fcGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--blue2)" stop-opacity=".25"/><stop offset="100%" stop-color="var(--blue2)" stop-opacity="0"/></linearGradient></defs>' +
            yLabels +
            '<path d="' + areaPath + '" fill="url(#fcGrad)"/>' +
            '<path d="' + linePath + '" fill="none" stroke="var(--blue2)" stroke-width="2" stroke-linejoin="round"/>' +
            dots + labels +
          '</svg>' +
        '</div>' +
      '</div>'
    );
  }

  // ─── Skeleton loaders ─────────────────────────────────────────

  function _renderSkeletons(count) {
    var html = '<div class="msv2-grid">';
    for (var i = 0; i < (count || 3); i++) {
      html += '<div class="msv2-skel-card"></div>';
    }
    html += '</div>';
    return html;
  }

  // ─── Admin billing config panel ───────────────────────────────

  function _renderBillingConfig() {
    var role = Auth.getRole();
    if (role !== 'admin') return '';
    var cfg = typeof BillingEngine !== 'undefined' ? BillingEngine.getConfig() : {};
    return (
      '<div class="billing-cfg-section" id="msv2-billing-cfg">' +
        '<div class="billing-cfg-title">' +
          '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>' +
          'Billing Engine Config' +
          '<span class="msv2-advisor-badge" style="background:var(--bdim);color:var(--blue2);font-size:10px;">Admin Only</span>' +
        '</div>' +
        '<div class="billing-cfg-sub">Configure rates applied to all customer invoices. Changes take effect immediately.</div>' +
        '<div class="billing-cfg-grid">' +
          '<div class="billing-cfg-field"><label class="billing-cfg-label">WHT Rate (%)</label><input class="billing-cfg-input" type="number" step="0.1" min="0" max="50" id="bcfg-wht" value="' + ((cfg.wht_rate || 0.18) * 100).toFixed(1) + '"/></div>' +
          '<div class="billing-cfg-field"><label class="billing-cfg-label">Margin Rate (%)</label><input class="billing-cfg-input" type="number" step="0.1" min="0" max="100" id="bcfg-margin" value="' + ((cfg.margin_rate || 0.12) * 100).toFixed(1) + '"/></div>' +
          '<div class="billing-cfg-field"><label class="billing-cfg-label">VAT Rate (%)</label><input class="billing-cfg-input" type="number" step="0.1" min="0" max="50" id="bcfg-vat" value="' + ((cfg.vat_rate || 0.13) * 100).toFixed(1) + '"/></div>' +
          '<div class="billing-cfg-field"><label class="billing-cfg-label">USD → NPR Rate</label><input class="billing-cfg-input" type="number" step="0.5" min="100" max="500" id="bcfg-npr" value="' + (cfg.usd_to_npr || 135) + '"/></div>' +
          '<div class="billing-cfg-field"><label class="billing-cfg-label">USD → INR Rate</label><input class="billing-cfg-input" type="number" step="0.5" min="50" max="200" id="bcfg-inr" value="' + (cfg.usd_to_inr || 84) + '"/></div>' +
        '</div>' +
        '<div class="billing-cfg-toggle">' +
          '<input type="checkbox" id="bcfg-breakdown"' + (cfg.show_breakdown ? ' checked' : '') + '/>' +
          '<label for="bcfg-breakdown">Show tax breakdown to customers (collapsed by default)</label>' +
        '</div>' +
        '<button class="billing-cfg-save" onclick="Labs._saveBillingConfig()">Save Config</button>' +
      '</div>'
    );
  }

  function _saveBillingConfig() {
    if (typeof BillingEngine === 'undefined') return;
    var wht      = parseFloat(document.getElementById('bcfg-wht').value)    / 100 || 0.18;
    var margin   = parseFloat(document.getElementById('bcfg-margin').value) / 100 || 0.12;
    var vat      = parseFloat(document.getElementById('bcfg-vat').value)    / 100 || 0.13;
    var npr      = parseFloat(document.getElementById('bcfg-npr').value)          || 135;
    var inr      = parseFloat(document.getElementById('bcfg-inr').value)          || 84;
    var breakdown = document.getElementById('bcfg-breakdown').checked;
    BillingEngine.saveConfig({ wht_rate: wht, margin_rate: margin, vat_rate: vat, usd_to_npr: npr, usd_to_inr: inr, show_breakdown: breakdown });
    App.showToast('Billing config saved', 'ok');
    _renderLabsList();
  }

  // ════════════════════════════════════════════════════════════════
  // PATCHED _renderLabsList — v2 card grid
  // ════════════════════════════════════════════════════════════════

  function _renderLabsListV2() {
    var listEl = document.getElementById('lbs-list');
    if (!listEl) return;

    _stopAllTickers();

    // ── Compute bucket counts
    var counts = { all: activeLabs.length, active: 0, pending: 0, history: 0 };
    activeLabs.forEach(function (lab) {
      if (lab.status === 'running' || lab.status === 'provisioning') counts.active++;
      else if (lab.status === 'pending_approval')                     counts.pending++;
      else if (lab.status === 'terminated' || lab.status === 'rejected') counts.history++;
    });

    // Auto-fallback
    if (_activeFilter === 'active' && counts.active === 0) _activeFilter = 'all';

    // ── Empty-state: full onboarding with hero
    if (activeLabs.length === 0) {
      listEl.innerHTML =
        _renderHero({ active: 0 }) +
        _renderCreateCta() +
        '<div id="msv2-tpl-anchor"></div>' +
        _renderQuickLaunch();

      // Init canvas
      setTimeout(function () {
        var canvas = document.getElementById('msv2-hero-canvas');
        if (canvas) _initHeroCanvas(canvas);
      }, 50);
      return;
    }

    // ── Filter visible labs
    var visible = activeLabs.filter(function (lab) {
      if (_activeFilter === 'active')  return lab.status === 'running' || lab.status === 'provisioning';
      if (_activeFilter === 'pending') return lab.status === 'pending_approval';
      if (_activeFilter === 'history') return lab.status === 'terminated' || lab.status === 'rejected';
      return true;
    });

    // ── Search filter
    if (_searchQuery) {
      var q = _searchQuery.toLowerCase();
      visible = visible.filter(function (lab) {
        return (lab.labName || '').toLowerCase().includes(q) ||
          (lab.instanceType || '').toLowerCase().includes(q) ||
          (lab.region || '').toLowerCase().includes(q) ||
          (lab.status || '').toLowerCase().includes(q);
      });
    }

    // ── Sort
    visible = visible.slice().sort(function (a, b) {
      if (_sortBy === 'name') return (a.labName || '').localeCompare(b.labName || '');
      if (_sortBy === 'status') return (a.status || '').localeCompare(b.status || '');
      if (_sortBy === 'cost') {
        var costA = typeof BillingEngine !== 'undefined' ? BillingEngine.compute({ instanceType: a.instanceType, storageGb: a.storageGb || 20 }).finalNpr : 0;
        var costB = typeof BillingEngine !== 'undefined' ? BillingEngine.compute({ instanceType: b.instanceType, storageGb: b.storageGb || 20 }).finalNpr : 0;
        return costB - costA;
      }
      return 0;
    });

    var totalPages = Math.max(1, Math.ceil(visible.length / LAB_PAGE_SIZE));
    _labsPage = Math.min(_labsPage, totalPages - 1);
    var pageItems = visible.slice(_labsPage * LAB_PAGE_SIZE, (_labsPage + 1) * LAB_PAGE_SIZE);

    var html =
      _renderHero(counts) +
      _renderCreateCta() +
      _renderQuickLaunch() +
      _renderSummaryBar(counts) +
      _renderControls(counts) +
      _renderBulkBar();

    if (visible.length === 0) {
      html += _renderCardGrid(visible);
    } else {
      html += '<table class="lbs-tbl msv2-compact-table">';
      html += '<thead class="lbs-tbl-head"><tr>';
      html += '<th></th>';
      html += '<th>#</th>';
      html += '<th>Server</th>';
      html += '<th>Status</th>';
      html += '<th>Type</th>';
      html += '<th>Region</th>';
      html += '<th>Expires</th>';
      html += '</tr></thead>';
      html += '<tbody>';
      pageItems.forEach(function (lab, idx) {
        html += _renderCompactRow(lab, idx + 1 + (_labsPage * LAB_PAGE_SIZE));
      });
      html += '</tbody></table>';

      if (visible.length > LAB_PAGE_SIZE) {
        html += '<div class="audit-pg-row msv2-pg-row">' +
          '<button class="btn-pg" onclick="Labs._labsPageNav(-1)"' + (_labsPage === 0 ? ' disabled' : '') + '>← Prev</button>' +
          '<span class="pg-info">Page ' + (_labsPage + 1) + ' of ' + totalPages + ' · ' + visible.length + ' servers</span>' +
          '<button class="btn-pg" onclick="Labs._labsPageNav(1)"' + (_labsPage >= totalPages - 1 ? ' disabled' : '') + '>Next →</button>' +
        '</div>';
      }
    }

    listEl.innerHTML = html;

    // Init canvas
    setTimeout(function () {
      var canvas = document.getElementById('msv2-hero-canvas');
      if (canvas) _initHeroCanvas(canvas);
      if (document.querySelector('.msv2-grid')) _startTickers();
    }, 50);
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
    _getWindowsPassword:   _getWindowsPassword,
    // v2 additions
    _startLab:           _startLab,
    _stopLab:            _stopLab,
    _handleSearch:       _handleSearch,
    _setSort:            _setSort,
    _toggleSelect:       _toggleSelect,
    _clearSelection:     _clearSelection,
    _bulkStart:          _bulkStart,
    _bulkStop:           _bulkStop,
    _bulkDelete:         _bulkDelete,
    _openMenu:           _openMenu,
    _menuRename:         _menuRename,
    _menuCloneConfig:    _menuCloneConfig,
    _menuViewLogs:       _menuViewLogs,
    _menuBillingHistory: _menuBillingHistory,
    _updateLiveBill:     _updateLiveBill,
    _launchTemplate:     _launchTemplate,
    _askAdvisor:         _askAdvisor,
    _toggleAdvisor:      _toggleAdvisor,
    _scrollToTemplates:  _scrollToTemplates,
    _quickStart:         _quickStart,
    _quickStop:          _quickStop,
    _saveBillingConfig:  _saveBillingConfig,
  };

})();
