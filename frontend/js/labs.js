'use strict';

/* ═══════════════════════════════════════════════════
   Labs Module — EC2 Lab Provisioning (M11)
   IIFE → Labs global
   ═══════════════════════════════════════════════════ */

const Labs = (function () {

  // ─── Private state
  var loaded       = false;
  var wizardStep   = 0;       // 0 = active labs panel, 1–5 = wizard steps
  var wizardConfig = {};      // collected form values across wizard steps
  var activeLabs   = [];      // last fetched from GET /labs
  var currentLabId = null;    // labId being provisioned or viewed
  var _pollTimer   = null;    // setInterval handle for provisioning poll
  var _accounts    = [];      // cached enabled accounts list
  var _confirmCb   = null;    // pending in-page confirm callback

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

  // ─── Active Labs Panel

  async function _loadActiveLabs() {
    var listEl = document.getElementById('lbs-list');
    if (!listEl) return;
    listEl.innerHTML = '<div class="lbs-loading">Loading labs…</div>';
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

    if (activeLabs.length === 0) {
      listEl.innerHTML = '<div class="lbs-empty">No labs yet. Click "+ Create New Lab" to get started.</div>';
      return;
    }

    var role = Auth.getRole();
    var html = '<div class="lbs-grid">';

    activeLabs.forEach(function (lab) {
      var platformLabel = PLATFORM_LABELS[lab.platform] || lab.platform;
      var statusClass   = STATUS_CLASSES[lab.status]    || 'lbs-badge--gray';
      var statusLabel   = STATUS_LABELS[lab.status]     || lab.status;
      var expiry        = lab.expiresAt ? _formatExpiry(lab.expiresAt) : '';
      var paidBadge     = lab.paymentStatus === 'paid'
        ? '<span class="lbs-badge lbs-badge--green">Paid</span>'
        : '<span class="lbs-badge lbs-badge--yellow">Payment Pending</span>';
      var costStr   = lab.estimatedCost ? '$' + Number(lab.estimatedCost).toFixed(4) + ' USD' : '';
      var isLinux   = lab.platform !== 'windows';
      var labIdEsc  = _esc(lab.labId);

      html += '<div class="lbs-card">';
      html +=   '<div class="lbs-card-head">';
      html +=     '<span class="lbs-platform-badge">' + _esc(platformLabel) + '</span>';
      html +=     '<span class="lbs-badge ' + statusClass + '">' + _esc(statusLabel) + '</span>';
      html +=   '</div>';
      html +=   '<div class="lbs-card-body">';
      if (lab.labName) {
        html += '<div class="lbs-card-row"><b>Name:</b> '     + _esc(lab.labName)       + '</div>';
      }
      html +=     '<div class="lbs-card-row"><b>Instance:</b> ' + _esc(lab.instanceType) + '</div>';
      html +=     '<div class="lbs-card-row"><b>Region:</b> '   + _esc(lab.region)        + '</div>';
      if (lab.publicIp)   html += '<div class="lbs-card-row"><b>IP:</b> '   + _esc(lab.publicIp)   + '</div>';
      if (costStr)        html += '<div class="lbs-card-row"><b>Cost:</b> ' + _esc(costStr)         + '</div>';
      if (expiry)         html += '<div class="lbs-card-row lbs-expiry">'   + _esc(expiry)          + '</div>';
      html +=     '<div class="lbs-card-row">' + paidBadge + '</div>';
      html +=   '</div>';
      html +=   '<div class="lbs-card-actions">';
      if (lab.status === 'running') {
        html += '<button class="btn btn-sm btn-outline" onclick="Labs.showConnectInfo(\'' + labIdEsc + '\')">Connect</button> ';
        if (isLinux) {
          html += '<button class="btn btn-sm btn-outline" onclick="Labs.downloadKeypair(\'' + labIdEsc + '\')">Download .pem</button> ';
        }
      }
      if (lab.status === 'pending_approval') {
        if (role === 'admin') {
          html += '<button class="btn btn-sm btn-outline" onclick="Labs._viewPayment(\'' + labIdEsc + '\')">View Payment</button> ';
          html += '<button class="btn btn-sm btn-blue" onclick="Labs._approveLab(\'' + labIdEsc + '\')">Approve</button> ';
          html += '<button class="btn btn-sm btn-danger" onclick="Labs._rejectLab(\'' + labIdEsc + '\')">Reject</button> ';
        } else {
          html += '<span class="lbs-help-text">Awaiting admin approval…</span>';
        }
      }
      if (role === 'admin' && lab.status !== 'pending_approval' && lab.status !== 'rejected' && lab.status !== 'terminated') {
        html += '<button class="btn btn-sm btn-danger" onclick="Labs._confirmDelete(\'' + labIdEsc + '\')">Terminate</button>';
      }
      html +=   '</div>';
      html += '</div>';
    });

    html += '</div>';
    listEl.innerHTML = html;
  }

  function _confirmDelete(labId) {
    _showConfirm(
      'Terminate Lab?',
      'This will terminate the EC2 instance and release all associated resources. This cannot be undone.',
      async function () {
        try {
          var res  = await API.deleteLabInstance({ labId: labId });
          var data = await res.json();
          if (!res.ok) throw new Error(data.message || data.error || 'Delete failed');
          App.showToast('Lab terminated', 'ok');
          await _loadActiveLabs();
        } catch (e) {
          App.showToast('Terminate error: ' + e.message, 'err');
        }
      }
    );
  }

  // ─── Show connection info for an existing (running) lab

  function showConnectInfo(labId) {
    var lab = activeLabs.find(function (l) { return l.labId === labId; });
    if (!lab) return;
    currentLabId = labId;
    _showStep5Panel(lab);
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
      '    <h2 class="lbs-wizard-title">Create Lab — Step 1: Configure</h2>',
      '    <div class="lbs-steps">',
      '      <span class="lbs-step lbs-step--active">1</span>',
      '      <span class="lbs-step">2</span>',
      '      <span class="lbs-step">3</span>',
      '      <span class="lbs-step">4</span>',
      '    </div>',
      '  </div>',
      '  <div class="lbs-wizard-body">',
      '    <div class="lbs-form-row">',
      '      <label class="lbs-label">Lab Name <span class="lbs-help-text">(optional — used as EC2 instance name)</span></label>',
      '      <input type="text" id="lbs-s1-name" class="lbs-input" maxlength="100"',
      '             placeholder="e.g. my-dev-server" value="' + nameVal + '">',
      '    </div>',
      '    <div class="lbs-form-row">',
      '      <label class="lbs-label">AWS Account</label>',
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
      '      <label class="lbs-label">Instance Type</label>',
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
      '      <label class="lbs-label">Duration</label>',
      '      <div class="lbs-duration-grid">',
      '        <div>',
      '          <span class="lbs-sublabel">Hours I use it per day</span>',
      '          <input type="number" id="lbs-s1-hours-day" class="lbs-input" min="1" max="24"',
      '                 value="' + (wizardConfig.hoursPerDay || 8) + '" oninput="Labs._onDurationInput()">',
      '        </div>',
      '        <div>',
      '          <span class="lbs-sublabel">For how many months</span>',
      '          <input type="number" id="lbs-s1-months" class="lbs-input" min="1" max="36"',
      '                 value="' + (wizardConfig.months || 1) + '" oninput="Labs._onDurationInput()">',
      '        </div>',
      '      </div>',
      '      <p id="lbs-s1-duration-preview" class="lbs-help-text" style="margin-top:4px;"></p>',
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

  function _onDurationInput() {
    var h = parseInt((document.getElementById('lbs-s1-hours-day') || {}).value, 10) || 0;
    var m = parseInt((document.getElementById('lbs-s1-months')    || {}).value, 10) || 0;
    var preview = document.getElementById('lbs-s1-duration-preview');
    if (preview) {
      if (h > 0 && m > 0) {
        var total = h * 30 * m;
        preview.textContent = 'Total: ' + h + ' hrs/day \u00d7 ' + m + ' month' + (m === 1 ? '' : 's') + ' = ' + total.toLocaleString() + ' hours';
      } else {
        preview.textContent = '';
      }
    }
  }

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
    var hoursPerDay     = parseInt((document.getElementById('lbs-s1-hours-day') || {}).value, 10);
    var months          = parseInt((document.getElementById('lbs-s1-months')    || {}).value, 10);
    var durationHours   = hoursPerDay * 30 * months;

    var platform = '';
    var radios   = document.querySelectorAll('input[name="lbs-platform"]');
    radios.forEach(function (r) { if (r.checked) platform = r.value; });

    if (!accountId)     { App.showToast('Select an AWS account', 'err');   return false; }
    if (!region)        { App.showToast('Select a region', 'err');         return false; }
    if (!platform)      { App.showToast('Select a platform', 'err');       return false; }
    if (!instanceType)  { App.showToast('Select an instance type', 'err'); return false; }
    var minStorage = platform === 'windows' ? 35 : 8;
    if (!storageGb || storageGb < minStorage || storageGb > 500) {
      App.showToast('Storage must be between ' + minStorage + ' and 500 GB', 'err'); return false;
    }
    if (!hoursPerDay || isNaN(hoursPerDay) || hoursPerDay < 1 || hoursPerDay > 24) {
      App.showToast('Hours per day must be between 1 and 24', 'err'); return false;
    }
    if (!months || isNaN(months) || months < 1 || months > 36) {
      App.showToast('Months must be between 1 and 36', 'err'); return false;
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
    };
    return true;
  }

  // ─── Step 2: Pricing Review

  function _renderStep2(container) {
    container.innerHTML = [
      '<div class="lbs-wizard-wrap">',
      '  <div class="lbs-wizard-header">',
      '    <h2 class="lbs-wizard-title">Create Lab — Step 2: Pricing Review</h2>',
      '    <div class="lbs-steps">',
      '      <span class="lbs-step lbs-step--done">1</span>',
      '      <span class="lbs-step lbs-step--active">2</span>',
      '      <span class="lbs-step">3</span>',
      '      <span class="lbs-step">4</span>',
      '    </div>',
      '  </div>',
      '  <div class="lbs-wizard-body">',
      '    <div id="lbs-pricing-content"><div class="lbs-loading">Fetching pricing from AWS Price List API…</div></div>',
      '  </div>',
      '  <div class="lbs-wizard-footer">',
      '    <button class="btn btn-outline" onclick="Labs.prevStep()">Back</button>',
      '    <button class="btn btn-blue" id="lbs-s2-next" style="display:none" onclick="Labs.nextStep()">Confirm &amp; Proceed to Payment</button>',
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

      var durationLabel = hoursPerDay + ' hrs/day \u00d7 ' + months + ' month' + (months === 1 ? '' : 's') + ' = ' + durationHours.toLocaleString() + ' hrs';

      var rows = [
        '<tr><td>' + _esc(wizardConfig.instanceType) + ' EC2</td>' +
          '<td>$' + b.ec2Hourly.toFixed(4) + '/hr</td>' +
          '<td>$' + b.ec2Cost.toFixed(4) + '</td></tr>',
        '<tr><td>EBS gp3 (' + _esc(String(wizardConfig.storageGb)) + ' GB)</td>' +
          '<td>$' + b.ebsPerGbMonth.toFixed(4) + '/GB-mo</td>' +
          '<td>$' + b.ebsCost.toFixed(4) + '</td></tr>',
      ];
      if (wizardConfig.elasticIp) {
        rows.push(
          '<tr><td>Elastic IP</td>' +
          '<td>$' + b.eipHourly.toFixed(4) + '/hr</td>' +
          '<td>$' + b.eipCost.toFixed(4) + '</td></tr>'
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
        '      <td><b>$' + b.totalUsd.toFixed(4) + ' USD</b></td>',
        '    </tr>',
        '  </tfoot>',
        '</table>',
        '<p class="lbs-pricing-source">Rates from AWS Price List API · Verify with AWS Pricing Calculator below</p>',
        '<div class="lbs-calc-hint">',
        '  <p class="lbs-calc-hint-title">Your configuration for AWS Pricing Calculator:</p>',
        '  <ul class="lbs-calc-hint-list">',
        '    <li>Region: ' + _esc(regionLabel) + '</li>',
        '    <li>Operating System: ' + _esc(osLabel) + '</li>',
        '    <li>Instance Type: ' + _esc(wizardConfig.instanceType) + '</li>',
        '    <li>Usage: ' + _esc(String(hoursPerDay)) + ' hrs/day (Constant usage)</li>',
        '    <li>EBS: ' + _esc(String(wizardConfig.storageGb)) + ' GB gp3</li>',
        '  </ul>',
        '  <a href="https://calculator.aws/#/createCalculator/ec2-enhancement" target="_blank" rel="noopener noreferrer" class="btn btn-outline btn-sm">',
        '    Open AWS Pricing Calculator \u2192',
        '  </a>',
        '</div>',
      ].join('\n');

      var nextBtn = document.getElementById('lbs-s2-next');
      if (nextBtn) nextBtn.style.display = '';
    } catch (e) {
      contentEl.innerHTML = '<div class="lbs-err">Failed to fetch pricing: ' + _esc(e.message) + '</div>';
      App.showToast('Pricing error: ' + e.message, 'err');
    }
  }

  // ─── Step 3: Payment

  function _renderStep3(container) {
    var totalStr = wizardConfig.estimatedCost != null
      ? '$' + Number(wizardConfig.estimatedCost).toFixed(4) + ' USD'
      : '—';

    container.innerHTML = [
      '<div class="lbs-wizard-wrap">',
      '  <div class="lbs-wizard-header">',
      '    <h2 class="lbs-wizard-title">Create Lab — Step 3: Payment</h2>',
      '    <div class="lbs-steps">',
      '      <span class="lbs-step lbs-step--done">1</span>',
      '      <span class="lbs-step lbs-step--done">2</span>',
      '      <span class="lbs-step lbs-step--active">3</span>',
      '      <span class="lbs-step">4</span>',
      '    </div>',
      '  </div>',
      '  <div class="lbs-wizard-body">',
      '    <div class="lbs-payment-amount">Please pay <strong>' + _esc(totalStr) + '</strong></div>',
      '    <div class="lbs-qr-wrap">',
      '      <img src="PaymentQR.jpeg" alt="Payment QR Code" class="lbs-qr-img">',
      '    </div>',
      '    <div class="lbs-form-row" style="margin-top:16px;">',
      '      <label class="lbs-label">Upload Payment Screenshot (JPG / PNG, max 5 MB)</label>',
      '      <input type="file" id="lbs-s3-screenshot" accept="image/jpeg,image/png,image/webp" onchange="Labs._onScreenshotChange()">',
      '    </div>',
      '    <div id="lbs-s3-preview" style="display:none; margin-top:8px;">',
      '      <img id="lbs-s3-preview-img" style="max-width:200px; max-height:200px; border-radius:6px; border:1px solid #444;">',
      '    </div>',
      '    <p id="lbs-s3-status" class="lbs-help-text"></p>',
      '    <button class="btn btn-blue" id="lbs-s3-submit" onclick="Labs.submitPayment()" style="margin-top:8px;">',
      '      I\'ve Paid — Submit Screenshot',
      '    </button>',
      '    <div id="lbs-s3-proceed" style="display:none; margin-top:12px;">',
      '      <button class="btn btn-blue" onclick="Labs.nextStep()">Submit Lab Request</button>',
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
      ? '$' + Number(wizardConfig.estimatedCost).toFixed(4) + ' USD' : '';

    container.innerHTML = [
      '<div class="lbs-wizard-wrap">',
      '  <div class="lbs-wizard-header">',
      '    <h2 class="lbs-wizard-title">Create Lab — Step 4: Request Submitted</h2>',
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
      '      <h3 style="margin:8px 0 4px;">Lab Request Submitted!</h3>',
      '      <p style="margin:0; color:#aaa; font-size:0.9rem;">',
      '        Your payment has been received and your lab request is pending admin review.',
      '      </p>',
      '      ' + (costStr ? '<p style="margin:8px 0 0; color:#8bc4ff;">Estimated cost: <b>' + _esc(costStr) + '</b></p>' : ''),
      '    </div>',
      '    <p style="margin:20px 0 8px; color:#aaa; font-size:0.88rem; text-align:center;">',
      '      An admin will verify your payment and approve your request shortly.',
      '      Once approved, your EC2 instance will start provisioning automatically.',
      '      You can track the status in the <b>Labs</b> list.',
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
      'This will start provisioning the EC2 instance for this lab. The user will be charged.',
      async function () {
        try {
          var res  = await API.provisionLab({ action: 'approve', labId: labId });
          var data = await res.json();
          if (!res.ok) throw new Error(data.message || data.error || 'Approval failed');
          App.showToast('Lab approved — provisioning started', 'ok');
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
      'This will reject the lab request. No EC2 instance will be launched.',
      async function () {
        try {
          var res  = await API.provisionLab({ action: 'reject', labId: labId });
          var data = await res.json();
          if (!res.ok) throw new Error(data.message || data.error || 'Rejection failed');
          App.showToast('Lab request rejected', 'ok');
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
            _setProvisionStep(5);
            _showStep5Panel(lab);
            return;  // stop polling
          }
          if (lab.status === 'error') {
            _pollTimer = null;
            var errEl    = document.getElementById('lbs-s4-error');
            var errMsgEl = document.getElementById('lbs-s4-error-msg');
            if (errEl)    errEl.style.display = '';
            if (errMsgEl) errMsgEl.textContent = 'Instance failed to start. Check the AWS console for details.';
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
          '  <div id="lbs-win-pass" style="display:none; margin-top:10px; padding:10px; background:#1e2430; border-radius:6px;"></div>',
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
      '      <div class="lbs-info-row"><b>Instance ID:</b> <code>' + _esc(lab.instanceId || '—') + '</code></div>',
      '      <div class="lbs-info-row"><b>Platform:</b> '      + _esc(platformLabel)        + '</div>',
      '      <div class="lbs-info-row"><b>Instance:</b> '      + _esc(lab.instanceType)     + '</div>',
      '      <div class="lbs-info-row"><b>Region:</b> '        + _esc(lab.region)           + '</div>',
      '      <div class="lbs-info-row"><b>Public IP:</b> '     + _esc(ip)                   + '</div>',
      '      <div class="lbs-info-row"><b>Estimated Cost:</b> '+ _esc(costStr)              + '</div>',
      '      <div class="lbs-info-row"><b>Expires:</b> '       + _esc(expiry)               + '</div>',
      '    </div>',
      '    <p class="lbs-help-text" style="margin-top:8px;">This instance also appears in the <b>Instances</b> tab as <b>' + _esc(displayName) + '</b> — click Refresh All there to see it.</p>',
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
    var passEl = document.getElementById('lbs-win-pass');
    if (passEl) { passEl.style.display = ''; passEl.innerHTML = '<span style="color:#fff;">Retrieving password\u2026</span>'; }
    try {
      var res  = await API.getLabWindowsPassword(labId);
      var data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed to get Windows password');
      if (passEl) {
        passEl.innerHTML = '<b style="color:#fff;">Password:</b> <code style="user-select:all; font-size:15px;">' + _esc(data.password) + '</code>';
      }
    } catch (e) {
      if (passEl) passEl.innerHTML = '<span style="color:#fff;">Error: ' + _esc(e.message) + ' (password may not be ready \u2014 wait 4+ minutes after launch)</span>';
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
      'EC2 Lab Connection Info',
      '═══════════════════════════════════════',
      'Lab ID:         ' + (labId || '—'),
      'Platform:       ' + (PLATFORM_LABELS[platform] || platform || '—'),
      'Instance Type:  ' + ((lab && lab.instanceType) || wizardConfig.instanceType || '—'),
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
    showConnectInfo: showConnectInfo,
    // Confirm dialog
    confirmOk:       confirmOk,
    confirmCancel:   confirmCancel,
    // Exposed for inline onclick handlers
    _approveLab:         _approveLab,
    _rejectLab:          _rejectLab,
    _viewPayment:        _viewPayment,
    _exitWizard:         _exitWizard,
    _onDurationInput:    _onDurationInput,
    _onPlatformChange:   _onPlatformChange,
    _loadNetworkOptions: _loadNetworkOptions,
    _onVpcChange:        _onVpcChange,
    _onScreenshotChange: _onScreenshotChange,
    _confirmDelete:      _confirmDelete,
    _downloadRdp:        _downloadRdp,
    _getWindowsPassword: _getWindowsPassword,
  };

})();
