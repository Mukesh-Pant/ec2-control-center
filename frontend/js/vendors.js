'use strict';

/* ═══════════════════════════════════════════════════
   Vendors — services / tools we pay for
   IIFE → Vendors global
   ═══════════════════════════════════════════════════ */

const Vendors = (function () {

  // ─── Constants ────────────────────────────────────────────────────────

  var CURRENCIES = [
    { code:'USD', label:'USD — US Dollar' },
    { code:'EUR', label:'EUR — Euro' },
    { code:'GBP', label:'GBP — British Pound' },
    { code:'AED', label:'AED — UAE Dirham' },
    { code:'SAR', label:'SAR — Saudi Riyal' },
    { code:'SGD', label:'SGD — Singapore Dollar' },
    { code:'AUD', label:'AUD — Australian Dollar' },
    { code:'CAD', label:'CAD — Canadian Dollar' },
    { code:'JPY', label:'JPY — Japanese Yen' },
    { code:'CNY', label:'CNY — Chinese Yuan' },
    { code:'NPR', label:'NPR — Nepali Rupee' },
    { code:'INR', label:'INR — Indian Rupee' },
    { code:'PKR', label:'PKR — Pakistani Rupee' },
    { code:'BDT', label:'BDT — Bangladeshi Taka' },
    { code:'QAR', label:'QAR — Qatari Riyal' },
  ];

  var PAYMENT_METHODS = [
    'Credit Card','Debit Card','Bank Transfer','SWIFT Transfer',
    'Wire Transfer','PayPal','Stripe','eSewa','Fonepay','UPI',
    'NEFT / RTGS','Cheque','Cash','Crypto',
  ];

  var DEFAULT_SERVICES = [
    'Cloud Compute','Cloud Storage','CDN','Database','Serverless',
    'AI / LLM API','Machine Learning','AI Code Editor',
    'HR Management','Payroll Processing','Recruitment',
    'Email Service','Communication','Analytics','Monitoring',
    'Security / WAF','Domain & DNS','Payment Gateway',
    'Software Development','Consulting','Billing Management',
    'Design Tools','Project Management','Version Control',
  ];

  // ─── Seed data ────────────────────────────────────────────────────────
  var SEED = [
    { id:'v1', name:'Anthropic', category:'AI Services', currency:'USD', amount:100,
      billingType:'recurring', recurringFrequency:'monthly', paymentForm:'Credit Card',
      agreementStart:'2025-01-01', agreementEnd:'2026-12-31', manualStatus:null,
      notes:'Claude API usage',
      services:['AI / LLM API','AI Code Editor'],
      contactName:'Support', contactEmail:'support@anthropic.com', contactPhone:'',
      invoices:[] },
    { id:'v2', name:'AWS', category:'Cloud Infrastructure', currency:'USD', amount:500,
      billingType:'irregular', recurringFrequency:null, paymentForm:'Credit Card',
      agreementStart:'2024-01-01', agreementEnd:'2027-01-01', manualStatus:null,
      notes:'Main AWS account — SaaS prod',
      services:['Cloud Compute','Cloud Storage','CDN','Serverless','Database'],
      contactName:'AWS Support', contactEmail:'', contactPhone:'+1-800-555-0199',
      invoices:[] },
    { id:'v3', name:'Cursor', category:'AI Tools', currency:'USD', amount:20,
      billingType:'recurring', recurringFrequency:'monthly', paymentForm:'Credit Card',
      agreementStart:'2025-03-01', agreementEnd:'2026-04-01', manualStatus:null,
      notes:'AI code editor subscription',
      services:['AI Code Editor'],
      contactName:'', contactEmail:'', contactPhone:'', invoices:[] },
    { id:'v4', name:'OpenAI', category:'AI Services', currency:'USD', amount:50,
      billingType:'irregular', recurringFrequency:null, paymentForm:'Credit Card',
      agreementStart:'2025-01-01', agreementEnd:'2026-12-31', manualStatus:null,
      notes:'GPT API usage',
      services:['AI / LLM API','Machine Learning'],
      contactName:'', contactEmail:'', contactPhone:'', invoices:[] },
    { id:'v5', name:'Google', category:'Cloud / Productivity', currency:'USD', amount:30,
      billingType:'recurring', recurringFrequency:'monthly', paymentForm:'Credit Card',
      agreementStart:'2024-06-01', agreementEnd:'2026-06-01', manualStatus:null,
      notes:'Workspace + GCP',
      services:['Cloud Compute','Email Service','Analytics'],
      contactName:'', contactEmail:'', contactPhone:'', invoices:[] },
    { id:'v6', name:'HR Service', category:'HR & Payroll', currency:'NPR', amount:50000,
      billingType:'recurring', recurringFrequency:'monthly', paymentForm:'Bank Transfer',
      agreementStart:'2025-01-01', agreementEnd:'2026-04-15', manualStatus:null,
      notes:'Monthly HR management service',
      services:['HR Management','Payroll Processing','Recruitment'],
      contactName:'HR Manager', contactEmail:'hr@hrservice.com.np', contactPhone:'+977-1-4444444',
      invoices:[] },
  ];

  // ─── Data layer ───────────────────────────────────────────────────────
  var STORAGE_KEY = 'ec2ctrl_vendors';
  var _data = null;

  function _loadData() {
    if (_data) return;
    try { var raw = localStorage.getItem(STORAGE_KEY); _data = raw ? JSON.parse(raw) : null; }
    catch (e) { _data = null; }
    if (!Array.isArray(_data) || !_data.length) { _data = JSON.parse(JSON.stringify(SEED)); _persist(); }
    _data.forEach(function (v) {
      if (!v.invoices)     v.invoices = [];
      if (!v.services)     v.services = [];
      if (!v.contactName)  v.contactName = '';
      if (!v.contactEmail) v.contactEmail = '';
      if (!v.contactPhone) v.contactPhone = '';
    });
  }

  function _persist() { localStorage.setItem(STORAGE_KEY, JSON.stringify(_data)); }
  function _uuid()    { return 'v-' + Date.now() + '-' + Math.random().toString(36).substr(2, 8); }

  // ─── CRUD ────────────────────────────────────────────────────────────
  function getAll() {
    _loadData();
    return _data.map(function (v) { return Object.assign({}, v, { status: _computeStatus(v) }); });
  }

  function getById(id) {
    _loadData();
    var v = _data.find(function (x) { return x.id === id; });
    return v ? Object.assign({}, v, { status: _computeStatus(v) }) : null;
  }

  function _add(fields)    { var v = Object.assign({ id: _uuid(), manualStatus: null, invoices: [], services: [] }, fields); _data.push(v); _persist(); return v; }
  function _update(id, f)  { var i = _data.findIndex(function (x) { return x.id === id; }); if (i < 0) return null; _data[i] = Object.assign({}, _data[i], f); _persist(); return _data[i]; }
  function _remove(id)     { _data = _data.filter(function (x) { return x.id !== id; }); _persist(); }

  // ─── Invoice CRUD ─────────────────────────────────────────────────────
  function _addInvoice(vendorId, fields) {
    var idx = _data.findIndex(function (x) { return x.id === vendorId; });
    if (idx < 0) return;
    var inv = Object.assign({ id: 'inv-' + Date.now(), status: 'unpaid', paidDate: null, proofData: null, proofName: null, proofType: null }, fields);
    if (!_data[idx].invoices) _data[idx].invoices = [];
    _data[idx].invoices.push(inv);
    _persist();
  }

  function _updateInvoiceStatus(vendorId, invoiceId, newStatus) {
    var idx = _data.findIndex(function (x) { return x.id === vendorId; });
    if (idx < 0) return;
    var inv = (_data[idx].invoices || []).find(function (i) { return i.id === invoiceId; });
    if (!inv) return;
    inv.status = newStatus;
    if (newStatus === 'paid') inv.paidDate = new Date().toISOString().slice(0, 10);
    _persist();
  }

  function _deleteInvoice(vendorId, invoiceId) {
    var idx = _data.findIndex(function (x) { return x.id === vendorId; });
    if (idx < 0) return;
    _data[idx].invoices = (_data[idx].invoices || []).filter(function (i) { return i.id !== invoiceId; });
    _persist();
  }

  // ─── Status computation ───────────────────────────────────────────────
  function _computeStatus(v) {
    if (v.manualStatus === 'inactive') return 'inactive';
    if (!v.agreementEnd) return 'active';
    var days = _daysUntil(v.agreementEnd);
    var threshold = FinSettings.get().expiryWarningDays;
    if (days < 0)          return 'expired';
    if (days <= threshold) return 'expiring_soon';
    return 'active';
  }

  function _daysUntil(dateStr) { return Math.ceil((new Date(dateStr) - new Date()) / 86400000); }

  function _monthlyNpr(v) {
    if (v.billingType !== 'recurring') return null;
    var mul = { monthly: 1, quarterly: 1/3, yearly: 1/12 };
    return FinSettings.toNpr(v.amount * (mul[v.recurringFrequency] || 1), v.currency);
  }

  // ─── UI state ─────────────────────────────────────────────────────────
  var _editId           = null;
  var _search           = '';
  var _fStatus          = 'all';
  var _fBilling         = 'all';
  var _fCurrency        = 'all';
  var _drawerVendorId   = null;
  var _drawerAddInvOpen = false;
  var _pendingProof     = null;
  var _editServices     = []; // tag picker state for modal

  // ─── Helpers ──────────────────────────────────────────────────────────
  function _esc(s) { var d = document.createElement('div'); d.textContent = String(s == null ? '' : s); return d.innerHTML; }
  function _fmtDate(s) { if (!s) return '\u2014'; var d = new Date(s); return isNaN(d) ? s : d.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }); }
  function _setEl(id, val) { var el = document.getElementById(id); if (el) el.textContent = String(val == null ? '\u2014' : val); }
  function _setVal(id, val) { var el = document.getElementById(id); if (el) el.value = (val == null ? '' : val); }
  function _getVal(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }
  function _openOverlay(id)  { var el = document.getElementById(id); if (el) el.classList.add('open'); }
  function _closeOverlay(id) { var el = document.getElementById(id); if (el) el.classList.remove('open'); }

  function _currencyOptions(selected) {
    return CURRENCIES.map(function (c) {
      return '<option value="' + c.code + '"' + (c.code === selected ? ' selected' : '') + '>' + c.label + '</option>';
    }).join('');
  }

  function _paymentOptions(selected) {
    var opts = PAYMENT_METHODS.map(function (m) {
      return '<option value="' + _esc(m) + '"' + (m === selected ? ' selected' : '') + '>' + _esc(m) + '</option>';
    }).join('');
    var customSel = (selected && PAYMENT_METHODS.indexOf(selected) < 0) ? ' selected' : '';
    return '<option value="">— Select —</option>' + opts +
      '<option value="__custom__"' + customSel + '>Other (type below)…</option>';
  }

  // ─── Init / Tab ───────────────────────────────────────────────────────
  function init() { _loadData(); }
  function onTabActivated() { _render(); }

  // ─── Render ───────────────────────────────────────────────────────────
  function _render() { _renderStats(); _renderCards(); }

  function _renderStats() {
    var all      = getAll();
    var active   = all.filter(function (v) { return v.status === 'active' || v.status === 'expiring_soon'; });
    var expiring = all.filter(function (v) { return v.status === 'expiring_soon' || v.status === 'expired'; });
    var irreg    = all.filter(function (v) { return v.billingType === 'irregular'; });
    var monthlyNpr = 0;
    all.forEach(function (v) {
      if (v.status === 'inactive' || v.status === 'expired') return;
      var n = _monthlyNpr(v); if (n != null) monthlyNpr += n;
    });
    _setEl('vnd-stat-monthly',   'NPR\u00a0' + Math.round(monthlyNpr).toLocaleString('en-IN'));
    _setEl('vnd-stat-active',    active.length);
    _setEl('vnd-stat-expiring',  expiring.length);
    _setEl('vnd-stat-irregular', irreg.length);
  }

  function _getFiltered() {
    var q = _search.toLowerCase();
    return getAll().filter(function (v) {
      if (q && v.name.toLowerCase().indexOf(q) < 0 && v.category.toLowerCase().indexOf(q) < 0) return false;
      if (_fStatus   !== 'all' && v.status      !== _fStatus)  return false;
      if (_fBilling  !== 'all' && v.billingType !== _fBilling) return false;
      if (_fCurrency !== 'all' && v.currency    !== _fCurrency) return false;
      return true;
    });
  }

  // ─── Cards ────────────────────────────────────────────────────────────
  function _renderCards() {
    var grid = document.getElementById('vnd-card-grid');
    if (!grid) return;
    var list = _getFiltered();
    if (!list.length) {
      grid.innerHTML = '<div class="empty" style="padding:48px 0"><div class="empty-ico">\uD83C\uDFE2</div><p class="empty-t">No vendors found</p></div>';
      return;
    }
    grid.innerHTML = list.map(_vendorCardHtml).join('');
  }

  var STATUS_BADGE = {
    active:        ['fm-badge--green', 'Active'],
    expiring_soon: ['fm-badge--amber', 'Expiring Soon'],
    expired:       ['fm-badge--red',   'Expired'],
    inactive:      ['fm-badge--gray',  'Inactive'],
  };
  function _statusBadge(s) { var b = STATUS_BADGE[s] || ['fm-badge--gray', s]; return '<span class="fm-badge ' + b[0] + '">' + b[1] + '</span>'; }

  function _billingLabel(v) {
    var base = { recurring:'Recurring', irregular:'Irregular', 'one-time':'One-Time' }[v.billingType] || v.billingType;
    var freq = v.recurringFrequency ? ' / ' + ({ monthly:'Monthly', quarterly:'Quarterly', yearly:'Yearly' }[v.recurringFrequency] || '') : '';
    return base + freq;
  }

  function _vendorCardHtml(v) {
    var initial  = (v.name || '?').charAt(0).toUpperCase();
    var svcChips = (v.services || []).slice(0, 3).map(function (s) { return '<span class="fm-svc-chip">' + _esc(s) + '</span>'; }).join('');
    if ((v.services || []).length > 3) svcChips += '<span class="fm-svc-chip more">+' + (v.services.length - 3) + '</span>';
    var days      = v.agreementEnd ? _daysUntil(v.agreementEnd) : null;
    var expiryChip = (days !== null && days >= 0 && days <= 60) ? ' <span class="fm-chip ' + (days <= 7 ? 'red' : 'amber') + '">' + days + 'd</span>' : '';
    var cardCls   = v.status === 'expiring_soon' ? 'vnd-card--expiring' : v.status === 'expired' ? 'vnd-card--expired' : '';
    var freqShort = v.recurringFrequency ? '/' + ({ monthly:'mo', quarterly:'qtr', yearly:'yr' }[v.recurringFrequency] || '') : '';

    return '<div class="vnd-card ' + cardCls + '" onclick="Vendors.openDrawer(\'' + _esc(v.id) + '\')">' +
      '<div class="vnd-card-top">' +
        '<div class="vnd-card-avatar">' + _esc(initial) + '</div>' +
        '<div class="vnd-card-info">' +
          '<div class="vnd-card-name">' + _esc(v.name) + '</div>' +
          '<div class="vnd-card-cat">' + _esc(v.category) + '</div>' +
        '</div>' +
        '<div style="flex-shrink:0">' + _statusBadge(v.status) + '</div>' +
      '</div>' +
      (svcChips ? '<div class="vnd-card-svcs">' + svcChips + '</div>' : '') +
      '<div class="vnd-card-footer">' +
        '<div>' +
          '<div class="vnd-card-amt">' + FinSettings.fmtAmt(v.amount, v.currency) + freqShort + '</div>' +
          '<div class="vnd-card-billing">' + _billingLabel(v) + ' &middot; ' + _esc(v.paymentForm || 'N/A') + '</div>' +
        '</div>' +
        '<div class="vnd-card-expiry">' + (v.agreementEnd ? _fmtDate(v.agreementEnd) : '') + expiryChip + '</div>' +
      '</div>' +
      '<div class="vnd-card-actions" onclick="event.stopPropagation()">' +
        '<button class="btn btn-xs btn-out" onclick="Vendors.openEditModal(\'' + _esc(v.id) + '\')">Edit</button>' +
        '<button class="btn btn-xs btn-out fm-btn-del" onclick="Vendors.confirmDelete(\'' + _esc(v.id) + '\')">Delete</button>' +
      '</div>' +
    '</div>';
  }

  // ─── Filters ──────────────────────────────────────────────────────────
  function onSearch(val)            { _search    = val; _renderCards(); }
  function onFilterStatus(val)      { _fStatus   = val; _renderCards(); }
  function onFilterBillingType(val) { _fBilling  = val; _renderCards(); }
  function onFilterCurrency(val)    { _fCurrency = val; _renderCards(); }

  // ─── Vendor Drawer ────────────────────────────────────────────────────
  function openDrawer(id) {
    var v = getById(id);
    if (!v) return;
    _drawerVendorId   = id;
    _drawerAddInvOpen = false;
    _pendingProof     = null;
    _renderDrawer(v);
    document.getElementById('vnd-drawer').classList.add('open');
    document.getElementById('vnd-drawer-backdrop').classList.add('open');
  }

  function closeDrawer() {
    _drawerVendorId = null;
    var el = document.getElementById('vnd-drawer'); if (el) el.classList.remove('open');
    var bd = document.getElementById('vnd-drawer-backdrop'); if (bd) bd.classList.remove('open');
  }

  function _renderDrawer(v) {
    var wrap = document.getElementById('vnd-drawer-body');
    if (!wrap) return;
    wrap.innerHTML = _drawerHtml(v);
  }

  function _refreshDrawer() {
    if (!_drawerVendorId) return;
    var v = getById(_drawerVendorId);
    if (v) _renderDrawer(v);
  }

  function _drawerHtml(v) {
    var initial  = (v.name || '?').charAt(0).toUpperCase();
    var days     = v.agreementEnd ? _daysUntil(v.agreementEnd) : null;
    var expiryNote = '';
    if (days !== null) {
      if (days < 0) expiryNote = ' &middot; <span style="color:var(--red)">Expired ' + Math.abs(days) + 'd ago</span>';
      else if (days <= 60) expiryNote = ' &middot; <span style="color:var(--amber)">' + days + 'd remaining</span>';
    }

    var html = '';

    // ── Hero strip ──
    html += '<div style="display:flex;align-items:center;gap:16px;padding:18px 22px 16px;background:linear-gradient(135deg,#f8faff,#eef3ff);border-bottom:1px solid var(--bd)">' +
      '<div class="vnd-card-avatar" style="width:52px;height:52px;font-size:22px;border-radius:14px;background:linear-gradient(135deg,var(--blue),var(--blue2));color:#fff;box-shadow:0 4px 12px rgba(36,96,224,.3)">' + _esc(initial) + '</div>' +
      '<div style="flex:1;min-width:0">' +
        '<div style="font-size:20px;font-weight:800;color:var(--ink)">' + _esc(v.name) + '</div>' +
        '<div style="font-size:13px;color:var(--ink3);margin-top:3px">' + _esc(v.category) + expiryNote + '</div>' +
      '</div>' +
      _statusBadge(v.status) +
    '</div>';

    // ── Services ──
    if ((v.services || []).length) {
      var chips = v.services.map(function (s) { return '<span class="fm-svc-chip">' + _esc(s) + '</span>'; }).join('');
      html += '<div class="cust-dr-section">' +
        '<div class="cust-dr-sec-title">Services Provided</div>' +
        '<div class="fm-svcs">' + chips + '</div>' +
      '</div>';
    }

    // ── Contract details ──
    html += '<div class="cust-dr-section">' +
      '<div class="cust-dr-sec-title">Contract Details</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:14px">' +
        '<div class="cust-amt-card"><div class="cust-amt-card-lbl">Amount</div><div class="cust-amt-card-val">' + FinSettings.fmtAmt(v.amount, v.currency) + '</div><div style="font-size:10px;color:var(--ink4)">' + _esc(v.currency) + ' &middot; ' + _billingLabel(v) + '</div></div>' +
        '<div class="cust-amt-card"><div class="cust-amt-card-lbl">Agreement Start</div><div class="cust-amt-card-val" style="font-size:13px">' + _fmtDate(v.agreementStart) + '</div></div>' +
        '<div class="cust-amt-card"><div class="cust-amt-card-lbl">Agreement End</div><div class="cust-amt-card-val' + (days !== null && days < 0 ? ' red' : days !== null && days <= 60 ? ' amber' : '') + '" style="font-size:13px">' + _fmtDate(v.agreementEnd) + '</div></div>' +
      '</div>' +
      '<div class="cust-dr-grid">' +
        _drF('Payment Method', v.paymentForm || '\u2014') +
        (v.contactName  ? _drF('Contact',  v.contactName) : '') +
        (v.contactEmail ? _drF('Email',    '<a href="mailto:' + _esc(v.contactEmail) + '">' + _esc(v.contactEmail) + '</a>', true) : '') +
        (v.contactPhone ? _drF('Phone',    v.contactPhone) : '') +
      '</div>' +
    '</div>';

    // ── Invoices ──
    html += '<div class="cust-dr-section">' +
      '<div class="cust-dr-sec-hd">' +
        '<div class="cust-dr-sec-title">Invoices &amp; Payments</div>' +
        '<button class="btn btn-xs btn-out" onclick="Vendors.toggleAddInvoice()">+ Log Invoice</button>' +
      '</div>' +
      '<div id="vnd-dr-add-inv-form" style="display:none">' + _addInvoiceFormHtml(v) + '</div>' +
      '<div id="vnd-dr-invoices-list">' + _invoicesHtml(v) + '</div>' +
    '</div>';

    // ── Notes ──
    if (v.notes) {
      html += '<div class="cust-dr-section"><div class="cust-dr-sec-title">Notes</div><div class="cust-dr-notes">' + _esc(v.notes) + '</div></div>';
    }

    return html;
  }

  function _drF(label, value, isHtml) {
    return '<div class="cust-dr-field">' +
      '<div class="cust-dr-field-lbl">' + label + '</div>' +
      '<div class="cust-dr-field-val">' + (isHtml ? value : _esc(String(value || '\u2014'))) + '</div>' +
    '</div>';
  }

  // ─── Invoice form ─────────────────────────────────────────────────────
  function _addInvoiceFormHtml(v) {
    var today = new Date().toISOString().slice(0, 10);
    return '<div class="dr-inline-form">' +
      '<div class="dr-inline-grid">' +
        '<div class="fg" style="padding:0"><label class="fl">Issue Date</label><input class="finp" id="vnd-inv-date" type="date" value="' + today + '"/></div>' +
        '<div class="fg" style="padding:0"><label class="fl">Amount (' + _esc(v ? v.currency : 'USD') + ')</label><input class="finp" id="vnd-inv-amount" type="number" min="0" step="0.01" placeholder="0.00"/></div>' +
        '<div class="fg" style="padding:0"><label class="fl">Due Date</label><input class="finp" id="vnd-inv-due" type="date"/></div>' +
        '<div class="fg" style="padding:0"><label class="fl">Description</label><input class="finp" id="vnd-inv-notes" placeholder="e.g. Monthly API charge"/></div>' +
        '<div class="fg inv-proof-row" style="padding:0">' +
          '<label class="fl">Payment Proof <span style="color:var(--ink4);font-weight:400">(Photo / PDF — max 2 MB)</span></label>' +
          '<label class="inv-proof-label" for="vnd-inv-proof-file">' +
            '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>' +
            'Choose file…' +
          '</label>' +
          '<input class="inv-proof-input" type="file" id="vnd-inv-proof-file" accept="image/*,.pdf" onchange="Vendors._onProofFileChange(this)"/>' +
          '<div class="inv-proof-name" id="vnd-inv-proof-name"></div>' +
        '</div>' +
      '</div>' +
      '<div class="dr-inline-actions">' +
        '<button class="btn btn-xs btn-out" onclick="Vendors.toggleAddInvoice()">Cancel</button>' +
        '<button class="btn btn-xs btn-blue" onclick="Vendors.submitInvoice()">Save Invoice</button>' +
      '</div>' +
    '</div>';
  }

  function _invoicesHtml(v) {
    var invs = (v.invoices || []).slice().sort(function (a, b) { return b.issueDate > a.issueDate ? 1 : -1; });
    if (!invs.length) return '<div class="fm-muted-sm" style="padding:4px 0">No invoices yet. Click &ldquo;+ Log Invoice&rdquo; to add one.</div>';
    var ST = { unpaid:'fm-badge--amber', paid:'fm-badge--green', cancelled:'fm-badge--red' };
    return invs.map(function (inv) {
      return '<div class="fin-dr-inv-row">' +
        '<div class="fin-dr-inv-status">' +
          '<span class="fm-badge ' + (ST[inv.status] || 'fm-badge--gray') + '">' + inv.status + (inv.paidDate ? ' &middot; ' + _fmtDate(inv.paidDate) : '') + '</span>' +
          '<span style="font-size:12px;color:var(--ink4)">' + _fmtDate(inv.issueDate) + (inv.dueDate ? ' &rarr; ' + _fmtDate(inv.dueDate) : '') + '</span>' +
          (inv.notes ? '<span style="font-size:11.5px;color:var(--ink3)">' + _esc(inv.notes) + '</span>' : '') +
        '</div>' +
        '<div class="fin-dr-inv-amt">' + FinSettings.fmtAmt(inv.amount, v.currency) + '</div>' +
        '<div style="display:flex;align-items:center;gap:4px">' +
          (inv.proofData ? '<span class="inv-proof-link" onclick="Vendors._viewProof(\'' + _esc(inv.id) + '\',\'' + _esc(v.id) + '\')" title="View proof"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></span>' : '') +
        '</div>' +
        '<div class="fin-dr-inv-actions">' +
          (inv.status === 'unpaid' ? '<button class="btn btn-xs btn-out" onclick="Vendors.setInvStatus(\'' + _esc(v.id) + '\',\'' + _esc(inv.id) + '\',\'paid\')">Mark Paid</button>' : '') +
          (inv.status !== 'cancelled' && inv.status !== 'paid' ? '<button class="btn btn-xs btn-out fm-btn-del" onclick="Vendors.setInvStatus(\'' + _esc(v.id) + '\',\'' + _esc(inv.id) + '\',\'cancelled\')">Cancel</button>' : '') +
          '<button class="fin-dr-del-btn" onclick="Vendors.deleteInvoice(\'' + _esc(v.id) + '\',\'' + _esc(inv.id) + '\')" title="Delete invoice">&times;</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  // ─── Drawer actions ───────────────────────────────────────────────────
  function toggleAddInvoice() {
    _drawerAddInvOpen = !_drawerAddInvOpen;
    _pendingProof = null;
    var el = document.getElementById('vnd-dr-add-inv-form');
    if (el) el.style.display = _drawerAddInvOpen ? '' : 'none';
  }

  function _onProofFileChange(input) {
    var file = input.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { App.showToast('File exceeds 2 MB limit', 'err'); input.value = ''; return; }
    var reader = new FileReader();
    reader.onload = function (e) {
      _pendingProof = { data: e.target.result, name: file.name, type: file.type };
      var nameEl = document.getElementById('vnd-inv-proof-name');
      if (nameEl) nameEl.textContent = '\u2713 ' + file.name;
    };
    reader.readAsDataURL(file);
  }

  function submitInvoice() {
    var date = _getVal('vnd-inv-date');
    var amt  = parseFloat(_getVal('vnd-inv-amount'));
    var due  = _getVal('vnd-inv-due');
    var note = _getVal('vnd-inv-notes');
    if (isNaN(amt) || amt <= 0) { App.showToast('Enter a valid amount', 'err'); return; }
    var fields = { issueDate: date, amount: amt, dueDate: due || null, notes: note };
    if (_pendingProof) { fields.proofData = _pendingProof.data; fields.proofName = _pendingProof.name; fields.proofType = _pendingProof.type; }
    _addInvoice(_drawerVendorId, fields);
    _pendingProof = null;
    App.showToast('Invoice saved', 'ok');
    _drawerAddInvOpen = false;
    _refreshDrawer();
  }

  function setInvStatus(vendorId, invoiceId, status) {
    _updateInvoiceStatus(vendorId, invoiceId, status);
    App.showToast('Invoice ' + status, 'ok');
    _refreshDrawer();
  }

  function deleteInvoice(vendorId, invoiceId) {
    if (!window.confirm('Delete this invoice? This cannot be undone.')) return;
    _deleteInvoice(vendorId, invoiceId);
    App.showToast('Invoice deleted', 'ok');
    _refreshDrawer();
  }

  function _viewProof(invoiceId, vendorId) {
    var idx = _data.findIndex(function (x) { return x.id === vendorId; });
    if (idx < 0) return;
    var inv = (_data[idx].invoices || []).find(function (i) { return i.id === invoiceId; });
    if (!inv || !inv.proofData) return;
    var win = window.open('', '_blank');
    if (!win) return;
    if (inv.proofType && inv.proofType.startsWith('image/')) {
      win.document.write('<!DOCTYPE html><html><body style="margin:0;background:#111;display:flex;justify-content:center"><img src="' + inv.proofData + '" style="max-width:100%"/></body></html>');
    } else { win.location = inv.proofData; }
  }

  // ─── Tag picker (modal services) ──────────────────────────────────────
  function _renderTagPicker() {
    var container = document.getElementById('vnd-m-tags');
    if (!container) return;
    container.innerHTML = _editServices.map(function (s, i) {
      return '<span class="tag-pill">' + _esc(s) +
        '<button class="tag-pill-del" onclick="Vendors._removeTag(' + i + ')" type="button">&times;</button>' +
      '</span>';
    }).join('');
  }

  function _removeTag(i) {
    _editServices.splice(i, 1);
    _renderTagPicker();
  }

  function addTagFromDropdown() {
    var sel = document.getElementById('vnd-m-svc-sel');
    if (!sel) return;
    var val = sel.value;
    if (val === '__custom__') {
      var custom = (document.getElementById('vnd-m-svc-custom') || {}).value || '';
      custom = custom.trim();
      if (!custom) return;
      if (_editServices.indexOf(custom) < 0) { _editServices.push(custom); _renderTagPicker(); }
      var custEl = document.getElementById('vnd-m-svc-custom');
      if (custEl) custEl.value = '';
    } else if (val && _editServices.indexOf(val) < 0) {
      _editServices.push(val);
      _renderTagPicker();
      sel.value = '';
    }
  }

  function onSvcSelChange() {
    var sel = document.getElementById('vnd-m-svc-sel');
    var row = document.getElementById('vnd-m-svc-custom-row');
    if (row) row.style.display = (sel && sel.value === '__custom__') ? '' : 'none';
  }

  function onPaymentChange() {
    var sel = document.getElementById('vnd-m-payment-form');
    var row = document.getElementById('vnd-m-payment-custom-row');
    if (row) row.style.display = (sel && sel.value === '__custom__') ? '' : 'none';
  }

  // ─── Add / Edit Modal ─────────────────────────────────────────────────
  function openAddModal() {
    _editId = null;
    _editServices = [];
    _clearModalForm();
    _setEl('vnd-modal-title', 'Add Vendor');
    _onBillingTypeChange();
    _renderTagPicker();
    _openOverlay('vnd-overlay');
  }

  function openEditModal(id) {
    var v = getById(id);
    if (!v) return;
    _editId = id;
    _editServices = (v.services || []).slice();
    _setEl('vnd-modal-title', 'Edit Vendor');
    _setVal('vnd-m-name',      v.name);
    _setVal('vnd-m-category',  v.category);
    _setVal('vnd-m-currency',  v.currency);
    _setVal('vnd-m-amount',    v.amount);
    _setVal('vnd-m-billing-type', v.billingType);
    _setVal('vnd-m-freq',      v.recurringFrequency || 'monthly');
    _setVal('vnd-m-start',     v.agreementStart);
    _setVal('vnd-m-end',       v.agreementEnd);
    _setVal('vnd-m-status',    v.manualStatus || 'auto');
    _setVal('vnd-m-notes',     v.notes);
    _setVal('vnd-m-contact',   v.contactName || '');
    _setVal('vnd-m-email',     v.contactEmail || '');
    _setVal('vnd-m-phone',     v.contactPhone || '');

    // Payment method
    var pm = v.paymentForm || '';
    var isCustomPm = pm && PAYMENT_METHODS.indexOf(pm) < 0;
    _setVal('vnd-m-payment-form', isCustomPm ? '__custom__' : pm);
    var custRow = document.getElementById('vnd-m-payment-custom-row');
    if (custRow) { custRow.style.display = isCustomPm ? '' : 'none'; }
    if (isCustomPm) { _setVal('vnd-m-payment-custom', pm); }

    _onBillingTypeChange();
    _renderTagPicker();
    _openOverlay('vnd-overlay');
  }

  function closeModal() {
    _closeOverlay('vnd-overlay');
    _editId = null;
    var err = document.getElementById('vnd-modal-err');
    if (err) err.textContent = '';
  }

  function _clearModalForm() {
    ['vnd-m-name','vnd-m-category','vnd-m-amount','vnd-m-start','vnd-m-end',
     'vnd-m-notes','vnd-m-contact','vnd-m-email','vnd-m-phone','vnd-m-payment-custom',
     'vnd-m-svc-custom'].forEach(function (id) { _setVal(id, ''); });
    _setVal('vnd-m-currency',     'USD');
    _setVal('vnd-m-billing-type', 'recurring');
    _setVal('vnd-m-freq',         'monthly');
    _setVal('vnd-m-status',       'auto');
    _setVal('vnd-m-payment-form', '');
    _setVal('vnd-m-svc-sel',      '');
    var err = document.getElementById('vnd-modal-err');
    if (err) err.textContent = '';
    var custRow = document.getElementById('vnd-m-payment-custom-row');
    if (custRow) custRow.style.display = 'none';
    var svcCustRow = document.getElementById('vnd-m-svc-custom-row');
    if (svcCustRow) svcCustRow.style.display = 'none';
  }

  function onBillingTypeChange() { _onBillingTypeChange(); }
  function _onBillingTypeChange() {
    var bt  = _getVal('vnd-m-billing-type');
    var row = document.getElementById('vnd-m-freq-row');
    if (row) row.style.display = bt === 'recurring' ? '' : 'none';
  }

  function confirmSave() {
    var errEl = document.getElementById('vnd-modal-err');
    if (errEl) errEl.textContent = '';
    var name     = _getVal('vnd-m-name');
    var category = _getVal('vnd-m-category');
    var currency = _getVal('vnd-m-currency');
    var amount   = parseFloat(_getVal('vnd-m-amount'));
    var billing  = _getVal('vnd-m-billing-type');
    var freq     = _getVal('vnd-m-freq');
    var pmSel    = _getVal('vnd-m-payment-form');
    var payForm  = pmSel === '__custom__' ? _getVal('vnd-m-payment-custom') : pmSel;
    var start    = _getVal('vnd-m-start');
    var end      = _getVal('vnd-m-end');
    var mStatus  = _getVal('vnd-m-status');
    var notes    = _getVal('vnd-m-notes');
    var contact  = _getVal('vnd-m-contact');
    var email    = _getVal('vnd-m-email');
    var phone    = _getVal('vnd-m-phone');

    function err(msg) { if (errEl) errEl.textContent = msg; }
    if (!name)               { err('Vendor name is required');  return; }
    if (!category)           { err('Category is required');     return; }
    if (isNaN(amount) || amount < 0) { err('Enter a valid amount'); return; }

    var fields = {
      name, category, currency, amount,
      billingType: billing,
      recurringFrequency: billing === 'recurring' ? freq : null,
      paymentForm: payForm, agreementStart: start, agreementEnd: end,
      manualStatus: mStatus === 'auto' ? null : mStatus,
      notes, services: _editServices.slice(),
      contactName: contact, contactEmail: email, contactPhone: phone,
    };

    if (_editId) { _update(_editId, fields); App.showToast('Vendor updated', 'ok'); }
    else         { _add(fields);             App.showToast('Vendor added', 'ok'); }
    closeModal();
    _render();
    if (typeof FinNotifications !== 'undefined') FinNotifications.refresh();
  }

  function confirmDelete(id) {
    var v = getById(id);
    if (!v) return;
    if (!window.confirm('Delete vendor "' + v.name + '"? This cannot be undone.')) return;
    _remove(id);
    App.showToast('Vendor removed', 'ok');
    _render();
    if (typeof FinNotifications !== 'undefined') FinNotifications.refresh();
  }

  // ─── Public ───────────────────────────────────────────────────────────
  return {
    init, onTabActivated, getAll,
    openAddModal, openEditModal, closeModal, confirmSave, confirmDelete,
    openDrawer, closeDrawer,
    toggleAddInvoice, submitInvoice, setInvStatus, deleteInvoice,
    _onProofFileChange, _viewProof,
    onSearch, onFilterStatus, onFilterBillingType, onFilterCurrency,
    onBillingTypeChange, onSvcSelChange, onPaymentChange,
    addTagFromDropdown, _removeTag,
    CURRENCIES, PAYMENT_METHODS, DEFAULT_SERVICES,
    _currencyOptions, _paymentOptions,
  };

})();
