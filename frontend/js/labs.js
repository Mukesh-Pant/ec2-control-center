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
    'amazon-linux': 'Amazon Linux 2023',
    'ubuntu':       'Ubuntu 22.04',
    'rhel':         'RHEL 9',
    'windows':      'Windows Server 2022',
  };

  var STATUS_LABELS = {
    'provisioning': 'Provisioning',
    'running':      'Running',
    'stopped':      'Stopped',
    'error':        'Error',
  };

  var STATUS_CLASSES = {
    'provisioning': 'lbs-badge--yellow',
    'running':      'lbs-badge--green',
    'stopped':      'lbs-badge--gray',
    'error':        'lbs-badge--red',
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
    { label: 'General Purpose',    types: ['t3.micro', 't3.small', 't3.medium', 't3.large'] },
    { label: 'Compute Optimized',  types: ['c5.large', 'c5.xlarge'] },
    { label: 'Memory Optimized',   types: ['r5.large', 'r5.xlarge'] },
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
      if (role === 'admin') {
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
      wizardStep = 4;
      _renderWizard();
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
        var sel = wizardConfig.instanceType === t ? ' selected' : '';
        return '<option value="' + t + '"' + sel + '>' + t + '</option>';
      }).join('');
      return '<optgroup label="' + _esc(g.label) + '">' + opts + '</optgroup>';
    }).join('');

    var durationHtml = DURATION_OPTIONS.map(function (d) {
      var sel = wizardConfig._durVal === d.value ? ' selected' : '';
      return '<option value="' + d.value + '"' + sel + '>' + d.label + '</option>';
    }).join('');

    var currentPlatform = wizardConfig.platform || 'amazon-linux';
    var platformCards = [
      { value: 'amazon-linux', label: 'Amazon Linux 2023' },
      { value: 'ubuntu',       label: 'Ubuntu 22.04'      },
      { value: 'rhel',         label: 'RHEL 9'            },
      { value: 'windows',      label: 'Windows Server 2022' },
    ].map(function (p) {
      var checked = currentPlatform === p.value ? ' checked' : '';
      return '<label class="lbs-platform-card"><input type="radio" name="lbs-platform" value="' + p.value + '"' + checked + '> ' + _esc(p.label) + '</label>';
    }).join('');

    var customHide = (wizardConfig._durVal === 'custom') ? '' : ' style="display:none"';
    var storagVal  = wizardConfig.storageGb || 20;
    var eipChecked = wizardConfig.elasticIp ? ' checked' : '';
    var customHrs  = wizardConfig.durationHours && wizardConfig._durVal === 'custom' ? wizardConfig.durationHours : '';

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
      '      <select id="lbs-s1-duration" class="lbs-select" onchange="Labs._onDurationChange()">' + durationHtml + '</select>',
      '      <input type="number" id="lbs-s1-custom-hours" class="lbs-input" min="1" max="2160"',
      '             placeholder="Hours (1–2160)" value="' + customHrs + '"' + customHide + ' style="margin-top:6px;">',
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

  function _onDurationChange() {
    var sel    = document.getElementById('lbs-s1-duration');
    var custom = document.getElementById('lbs-s1-custom-hours');
    if (sel && custom) custom.style.display = sel.value === 'custom' ? '' : 'none';
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
    var durSel          = document.getElementById('lbs-s1-duration');
    var durVal          = durSel ? durSel.value : '';

    var durationHours;
    if (durVal === 'custom') {
      durationHours = parseInt((document.getElementById('lbs-s1-custom-hours') || {}).value, 10);
    } else {
      durationHours = parseInt(durVal, 10);
    }

    var platform = '';
    var radios   = document.querySelectorAll('input[name="lbs-platform"]');
    radios.forEach(function (r) { if (r.checked) platform = r.value; });

    if (!accountId)     { App.showToast('Select an AWS account', 'err');  return false; }
    if (!region)        { App.showToast('Select a region', 'err');        return false; }
    if (!platform)      { App.showToast('Select a platform', 'err');      return false; }
    if (!instanceType)  { App.showToast('Select an instance type', 'err'); return false; }
    if (!storageGb || storageGb < 8 || storageGb > 500) {
      App.showToast('Storage must be between 8 and 500 GB', 'err'); return false;
    }
    if (!durationHours || isNaN(durationHours) || durationHours < 1 || durationHours > 2160) {
      App.showToast('Duration must be between 1 and 2160 hours', 'err'); return false;
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
      durationHours:    durationHours,
      _durVal:          durVal,   // remember for re-render on Back
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

      var b = data.breakdown;
      wizardConfig.estimatedCost = b.totalUsd;

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

      contentEl.innerHTML = [
        '<table class="lbs-price-table">',
        '  <thead><tr><th>Component</th><th>Rate</th><th>Cost</th></tr></thead>',
        '  <tbody>' + rows.join('') + '</tbody>',
        '  <tfoot>',
        '    <tr class="lbs-price-total">',
        '      <td colspan="2"><b>Total (' + _esc(String(wizardConfig.durationHours)) + ' hrs)</b></td>',
        '      <td><b>$' + b.totalUsd.toFixed(4) + ' USD</b></td>',
        '    </tr>',
        '  </tfoot>',
        '</table>',
        '<p class="lbs-pricing-source">Rates from AWS Price List API</p>',
        '<a href="https://calculator.aws/pricing/2/home" target="_blank" rel="noopener noreferrer" class="btn btn-outline btn-sm" style="margin-top:4px;">',
        '  View in AWS Pricing Calculator',
        '</a>',
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
      '      <img src="myQR.jpeg" alt="Payment QR Code" class="lbs-qr-img">',
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
      '      <button class="btn btn-blue" onclick="Labs.nextStep()">Proceed to Provision</button>',
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

  // ─── Step 4: Provisioning

  function _renderStep4(container) {
    container.innerHTML = [
      '<div class="lbs-wizard-wrap">',
      '  <div class="lbs-wizard-header">',
      '    <h2 class="lbs-wizard-title">Create Lab — Step 4: Provisioning</h2>',
      '    <div class="lbs-steps">',
      '      <span class="lbs-step lbs-step--done">1</span>',
      '      <span class="lbs-step lbs-step--done">2</span>',
      '      <span class="lbs-step lbs-step--done">3</span>',
      '      <span class="lbs-step lbs-step--active">4</span>',
      '    </div>',
      '  </div>',
      '  <div class="lbs-wizard-body">',
      '    <div id="lbs-s4-steps">',
      '      <div class="lbs-provision-step" id="lbs-ps-1">Saving payment record…</div>',
      '      <div class="lbs-provision-step" id="lbs-ps-2">Creating key pair…</div>',
      '      <div class="lbs-provision-step" id="lbs-ps-3">Launching EC2 instance…</div>',
      '      <div class="lbs-provision-step" id="lbs-ps-4">Waiting for instance to start…</div>',
      '    </div>',
      '    <div id="lbs-s4-error" style="display:none" class="lbs-err">',
      '      <p id="lbs-s4-error-msg"></p>',
      '      <button class="btn btn-outline btn-sm" style="margin-top:8px;" onclick="Labs.provision()">Retry</button>',
      '    </div>',
      '  </div>',
      '</div>',
    ].join('\n');
    provision();
  }

  function _setProvisionStep(n) {
    for (var i = 1; i <= 4; i++) {
      var el = document.getElementById('lbs-ps-' + i);
      if (!el) continue;
      if (i < n)      el.className = 'lbs-provision-step lbs-provision-step--done';
      else if (i === n) el.className = 'lbs-provision-step lbs-provision-step--active';
      else             el.className = 'lbs-provision-step';
    }
  }

  async function provision() {
    var errEl    = document.getElementById('lbs-s4-error');
    var errMsgEl = document.getElementById('lbs-s4-error-msg');
    if (errEl) errEl.style.display = 'none';
    _setProvisionStep(1);

    try {
      var body = {
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
      };

      _setProvisionStep(2);
      var res  = await API.provisionLab(body);
      var data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Provisioning failed');

      currentLabId = data.labId;
      if (data.estimatedCost != null) wizardConfig.estimatedCost = data.estimatedCost;

      _setProvisionStep(3);

      // Small delay then move to polling step
      setTimeout(function () { _setProvisionStep(4); }, 800);
      pollStatus(currentLabId);
    } catch (e) {
      if (errEl)    errEl.style.display = '';
      if (errMsgEl) errMsgEl.textContent = 'Error: ' + e.message;
      App.showToast('Provisioning failed: ' + e.message, 'err');
    }
  }

  function pollStatus(labId) {
    if (_pollTimer) clearInterval(_pollTimer);
    _pollTimer = setInterval(async function () {
      try {
        var res  = await API.getLabsList();
        var data = await res.json();
        if (!res.ok) return;
        var labs = data.labs || [];
        var lab  = labs.find(function (l) { return l.labId === labId; });
        if (!lab) return;

        if (lab.status === 'running') {
          clearInterval(_pollTimer);
          _pollTimer = null;
          activeLabs = labs;
          _setProvisionStep(5);   // all done
          _showStep5Panel(lab);
        } else if (lab.status === 'error') {
          clearInterval(_pollTimer);
          _pollTimer = null;
          var errEl    = document.getElementById('lbs-s4-error');
          var errMsgEl = document.getElementById('lbs-s4-error-msg');
          if (errEl)    errEl.style.display = '';
          if (errMsgEl) errMsgEl.textContent = 'Instance failed to start. Check the AWS console for details.';
        }
      } catch (_) { /* ignore transient network errors during poll */ }
    }, 5000);
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
    if (passEl) { passEl.style.display = ''; passEl.textContent = 'Retrieving password…'; }
    try {
      var res  = await API.getLabWindowsPassword(labId);
      var data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed to get Windows password');
      if (passEl) {
        passEl.innerHTML = '<b>Password:</b> <code style="user-select:all; font-size:15px;">' + _esc(data.password) + '</code>';
      }
    } catch (e) {
      if (passEl) passEl.textContent = 'Error: ' + e.message + ' (password may not be ready — wait 4+ minutes after launch)';
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

  return {
    init:            init,
    onTabActivated:  onTabActivated,
    startWizard:     startWizard,
    nextStep:        nextStep,
    prevStep:        prevStep,
    fetchPricing:    fetchPricing,
    submitPayment:   submitPayment,
    provision:       provision,
    pollStatus:      pollStatus,
    downloadLabInfo: downloadLabInfo,
    downloadKeypair: downloadKeypair,
    showConnectInfo: showConnectInfo,
    // Confirm dialog
    confirmOk:       confirmOk,
    confirmCancel:   confirmCancel,
    // Exposed for inline onclick handlers
    _exitWizard:         _exitWizard,
    _onDurationChange:   _onDurationChange,
    _loadNetworkOptions: _loadNetworkOptions,
    _onVpcChange:        _onVpcChange,
    _onScreenshotChange: _onScreenshotChange,
    _confirmDelete:      _confirmDelete,
    _downloadRdp:        _downloadRdp,
    _getWindowsPassword: _getWindowsPassword,
  };

})();
