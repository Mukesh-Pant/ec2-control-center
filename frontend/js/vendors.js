'use strict';

/* ═══════════════════════════════════════════════════
   Vendors — services / tools we pay for
   IIFE → Vendors global
   ═══════════════════════════════════════════════════ */

const Vendors = (function () {

  // ─── Seed data ────────────────────────────────────────────────────────
  var SEED = [
    { id:'v1', name:'Anthropic', category:'AI Services', currency:'USD', amount:100,
      billingType:'recurring', recurringFrequency:'monthly', paymentForm:'Credit Card',
      agreementStart:'2025-01-01', agreementEnd:'2026-12-31', manualStatus:null,
      notes:'Claude API usage',
      services:['LLM API','AI Assistance','Claude Models'],
      contactName:'Support Team', contactEmail:'support@anthropic.com', contactPhone:'',
      invoices:[] },
    { id:'v2', name:'AWS', category:'Cloud Infrastructure', currency:'USD', amount:500,
      billingType:'irregular', recurringFrequency:null, paymentForm:'Credit Card',
      agreementStart:'2024-01-01', agreementEnd:'2027-01-01', manualStatus:null,
      notes:'Main AWS account — SaaS prod',
      services:['EC2','S3','Lambda','CloudFront','DynamoDB','RDS'],
      contactName:'AWS Support', contactEmail:'', contactPhone:'+1-800-555-0199',
      invoices:[] },
    { id:'v3', name:'Cursor', category:'AI Tools', currency:'USD', amount:20,
      billingType:'recurring', recurringFrequency:'monthly', paymentForm:'Credit Card',
      agreementStart:'2025-03-01', agreementEnd:'2026-04-01', manualStatus:null,
      notes:'AI code editor subscription',
      services:['AI Code Editor','Copilot'],
      contactName:'', contactEmail:'', contactPhone:'',
      invoices:[] },
    { id:'v4', name:'OpenAI', category:'AI Services', currency:'USD', amount:50,
      billingType:'irregular', recurringFrequency:null, paymentForm:'Credit Card',
      agreementStart:'2025-01-01', agreementEnd:'2026-12-31', manualStatus:null,
      notes:'GPT API usage',
      services:['GPT API','Image Generation','Embeddings'],
      contactName:'', contactEmail:'', contactPhone:'',
      invoices:[] },
    { id:'v5', name:'Google', category:'Cloud / Productivity', currency:'USD', amount:30,
      billingType:'recurring', recurringFrequency:'monthly', paymentForm:'Credit Card',
      agreementStart:'2024-06-01', agreementEnd:'2026-06-01', manualStatus:null,
      notes:'Workspace + GCP',
      services:['Google Workspace','GCP','Gmail','Google Drive'],
      contactName:'', contactEmail:'', contactPhone:'',
      invoices:[] },
    { id:'v6', name:'HR Service', category:'HR & Payroll', currency:'NPR', amount:50000,
      billingType:'recurring', recurringFrequency:'monthly', paymentForm:'Bank Transfer',
      agreementStart:'2025-01-01', agreementEnd:'2026-04-15', manualStatus:null,
      notes:'Monthly HR management service',
      services:['HR Management','Payroll Processing','Recruitment','Leave Tracking'],
      contactName:'HR Manager', contactEmail:'hr@hrservice.com.np', contactPhone:'+977-1-4444444',
      invoices:[] },
  ];

  // ─── Data layer ───────────────────────────────────────────────────────
  var STORAGE_KEY = 'ec2ctrl_vendors';
  var _data = null;

  function _loadData() {
    if (_data) return;
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      _data = raw ? JSON.parse(raw) : null;
    } catch (e) { _data = null; }
    if (!Array.isArray(_data) || !_data.length) {
      _data = JSON.parse(JSON.stringify(SEED));
      _persist();
    }
    // Migrate existing records to ensure new fields exist
    _data.forEach(function (v) {
      if (!v.invoices) v.invoices = [];
      if (!v.services) v.services = [];
      if (!v.contactName) v.contactName = '';
      if (!v.contactEmail) v.contactEmail = '';
      if (!v.contactPhone) v.contactPhone = '';
    });
  }

  function _persist() { localStorage.setItem(STORAGE_KEY, JSON.stringify(_data)); }

  function _uuid() { return 'v-' + Date.now() + '-' + Math.random().toString(36).substr(2, 8); }

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

  function _add(fields) {
    var v = Object.assign({ id: _uuid(), manualStatus: null, invoices: [], services: [] }, fields);
    _data.push(v);
    _persist();
    return v;
  }

  function _update(id, fields) {
    var idx = _data.findIndex(function (x) { return x.id === id; });
    if (idx < 0) return null;
    _data[idx] = Object.assign({}, _data[idx], fields);
    _persist();
    return _data[idx];
  }

  function _remove(id) {
    _data = _data.filter(function (x) { return x.id !== id; });
    _persist();
  }

  // ─── Invoice CRUD ─────────────────────────────────────────────────────

  function _addInvoice(vendorId, fields) {
    var idx = _data.findIndex(function (x) { return x.id === vendorId; });
    if (idx < 0) return;
    var inv = Object.assign({ id: 'inv-' + Date.now(), status: 'unpaid', paidDate: null, proofData: null, proofName: null, proofType: null }, fields);
    if (!_data[idx].invoices) _data[idx].invoices = [];
    _data[idx].invoices.push(inv);
    _persist();
    return inv;
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

  function _daysUntil(dateStr) {
    return Math.ceil((new Date(dateStr) - new Date()) / 86400000);
  }

  function _monthlyNpr(v) {
    if (v.billingType !== 'recurring') return null;
    var mul = { monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 };
    return FinSettings.toNpr(v.amount * (mul[v.recurringFrequency] || 1), v.currency);
  }

  // ─── UI state ─────────────────────────────────────────────────────────
  var _editId         = null;
  var _search         = '';
  var _fStatus        = 'all';
  var _fBilling       = 'all';
  var _fCurrency      = 'all';
  var _drawerVendorId = null;
  var _drawerAddInvOpen = false;
  var _pendingProof   = null; // { data, name, type }

  // ─── Helpers ──────────────────────────────────────────────────────────

  function _esc(s) {
    var d = document.createElement('div');
    d.textContent = String(s == null ? '' : s);
    return d.innerHTML;
  }

  function _fmtDate(s) {
    if (!s) return '\u2014';
    var d = new Date(s);
    return isNaN(d) ? s : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function _setEl(id, val) {
    var el = document.getElementById(id);
    if (el) el.textContent = String(val == null ? '\u2014' : val);
  }

  function _setVal(id, val) {
    var el = document.getElementById(id);
    if (el) el.value = (val == null ? '' : val);
  }

  function _getVal(id) {
    var el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  function _openOverlay(id)  { var el = document.getElementById(id); if (el) el.classList.add('open'); }
  function _closeOverlay(id) { var el = document.getElementById(id); if (el) el.classList.remove('open'); }

  // ─── Init / Tab ───────────────────────────────────────────────────────

  function init() { _loadData(); }

  function onTabActivated() { _render(); }

  // ─── Render ───────────────────────────────────────────────────────────

  function _render() {
    _renderStats();
    _renderCards();
  }

  function _renderStats() {
    var all      = getAll();
    var active   = all.filter(function (v) { return v.status === 'active' || v.status === 'expiring_soon'; });
    var expiring = all.filter(function (v) { return v.status === 'expiring_soon' || v.status === 'expired'; });
    var irreg    = all.filter(function (v) { return v.billingType === 'irregular'; });

    var monthlyNpr = 0;
    all.forEach(function (v) {
      if (v.status === 'inactive' || v.status === 'expired') return;
      var n = _monthlyNpr(v);
      if (n != null) monthlyNpr += n;
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
      if (_fStatus   !== 'all' && v.status      !== _fStatus)   return false;
      if (_fBilling  !== 'all' && v.billingType !== _fBilling)  return false;
      if (_fCurrency !== 'all' && v.currency    !== _fCurrency) return false;
      return true;
    });
  }

  // ─── Card rendering ───────────────────────────────────────────────────

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

  function _statusBadge(status) {
    var b = STATUS_BADGE[status] || ['fm-badge--gray', status];
    return '<span class="fm-badge ' + b[0] + '">' + b[1] + '</span>';
  }

  function _billingLabel(v) {
    var base = { recurring: 'Recurring', irregular: 'Irregular', 'one-time': 'One-Time' }[v.billingType] || v.billingType;
    var freq = v.recurringFrequency ? ' / ' + ({ monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly' }[v.recurringFrequency] || '') : '';
    return base + freq;
  }

  function _vendorCardHtml(v) {
    var initial = (v.name || '?').charAt(0).toUpperCase();
    var svcChips = (v.services || []).slice(0, 4).map(function (s) {
      return '<span class="fm-svc-chip">' + _esc(s) + '</span>';
    }).join('');
    if ((v.services || []).length > 4) svcChips += '<span class="fm-svc-chip more">+' + (v.services.length - 4) + '</span>';

    var days = v.agreementEnd ? _daysUntil(v.agreementEnd) : null;
    var expiryChip = (days !== null && days >= 0 && days <= 60)
      ? ' <span class="fm-chip ' + (days <= 7 ? 'red' : 'amber') + '">' + days + 'd left</span>' : '';
    var cardCls = v.status === 'expiring_soon' ? 'vnd-card--expiring' : v.status === 'expired' ? 'vnd-card--expired' : '';
    var freqShort = v.recurringFrequency ? '/'+({monthly:'mo',quarterly:'qtr',yearly:'yr'}[v.recurringFrequency]||'') : '';

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
          '<div class="vnd-card-billing">' + _billingLabel(v) + '</div>' +
        '</div>' +
        '<div class="vnd-card-expiry">' +
          (v.agreementEnd ? _fmtDate(v.agreementEnd) : '') + expiryChip +
        '</div>' +
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
    var el = document.getElementById('vnd-drawer');
    if (el) el.classList.remove('open');
    var bd = document.getElementById('vnd-drawer-backdrop');
    if (bd) bd.classList.remove('open');
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

  function _drField(label, value, isHtml) {
    return '<div class="cust-dr-field">' +
      '<div class="cust-dr-field-lbl">' + label + '</div>' +
      '<div class="cust-dr-field-val">' + (isHtml ? value : _esc(String(value || '\u2014'))) + '</div>' +
    '</div>';
  }

  function _drawerHtml(v) {
    var html = '';
    var initial = (v.name || '?').charAt(0).toUpperCase();
    var days = v.agreementEnd ? _daysUntil(v.agreementEnd) : null;
    var expiryNote = '';
    if (days !== null) {
      if (days < 0) expiryNote = '<span style="color:var(--red);font-size:12px">Expired ' + Math.abs(days) + ' days ago</span>';
      else if (days <= 60) expiryNote = '<span style="color:var(--amber);font-size:12px">' + days + ' days remaining</span>';
    }

    // ── Header ──
    html += '<div class="cust-dr-hd" style="display:flex;align-items:center;gap:14px">' +
      '<div class="vnd-card-avatar" style="width:48px;height:48px;font-size:20px;flex-shrink:0">' + _esc(initial) + '</div>' +
      '<div style="flex:1;min-width:0">' +
        '<div class="cust-dr-name">' + _esc(v.name) + '</div>' +
        '<div class="cust-dr-meta">' + _esc(v.category) +
          (expiryNote ? ' &middot; ' + expiryNote : '') +
        '</div>' +
      '</div>' +
      _statusBadge(v.status) +
    '</div>';

    // ── Services ──
    var svcChips = (v.services || []).map(function (s) { return '<span class="fm-svc-chip">' + _esc(s) + '</span>'; }).join('');
    if (svcChips) {
      html += '<div class="cust-dr-section">' +
        '<div class="cust-dr-sec-title">Services Provided</div>' +
        '<div class="fm-svcs">' + svcChips + '</div>' +
      '</div>';
    }

    // ── Billing details ──
    html += '<div class="cust-dr-section">' +
      '<div class="cust-dr-sec-title">Contract Details</div>' +
      '<div class="cust-dr-grid">' +
        _drField('Amount', FinSettings.fmtWithNpr(v.amount, v.currency), true) +
        _drField('Billing', _billingLabel(v)) +
        _drField('Payment Form', v.paymentForm || '\u2014') +
        _drField('Agreement Period', _fmtDate(v.agreementStart) + ' \u2013 ' + _fmtDate(v.agreementEnd)) +
        (v.contactName  ? _drField('Contact',  v.contactName) : '') +
        (v.contactEmail ? _drField('Email',    '<a href="mailto:' + _esc(v.contactEmail) + '">' + _esc(v.contactEmail) + '</a>', true) : '') +
        (v.contactPhone ? _drField('Phone',    v.contactPhone) : '') +
      '</div>' +
    '</div>';

    // ── Invoices & Payments ──
    html += '<div class="cust-dr-section">' +
      '<div class="cust-dr-sec-hd">' +
        '<div class="cust-dr-sec-title">Invoices &amp; Payments</div>' +
        '<button class="btn btn-xs btn-out" onclick="Vendors.toggleAddInvoice()">+ Add Invoice</button>' +
      '</div>' +
      '<div id="vnd-dr-add-inv-form" style="display:none">' + _addInvoiceFormHtml() + '</div>' +
      '<div id="vnd-dr-invoices-list">' + _invoicesHtml(v) + '</div>' +
    '</div>';

    // ── Notes ──
    if (v.notes) {
      html += '<div class="cust-dr-section"><div class="cust-dr-sec-title">Notes</div><div class="cust-dr-notes">' + _esc(v.notes) + '</div></div>';
    }

    return html;
  }

  // ─── Invoice form ─────────────────────────────────────────────────────

  function _addInvoiceFormHtml() {
    var today = new Date().toISOString().slice(0, 10);
    return '<div class="dr-inline-form">' +
      '<div class="dr-inline-grid">' +
        '<div class="fg" style="padding:0"><label class="fl">Issue Date</label><input class="finp" id="vnd-inv-date" type="date" value="' + today + '"/></div>' +
        '<div class="fg" style="padding:0"><label class="fl">Amount</label><input class="finp" id="vnd-inv-amount" type="number" min="0" step="0.01" placeholder="0.00"/></div>' +
        '<div class="fg" style="padding:0"><label class="fl">Due Date</label><input class="finp" id="vnd-inv-due" type="date"/></div>' +
        '<div class="fg" style="padding:0"><label class="fl">Description</label><input class="finp" id="vnd-inv-notes" placeholder="e.g. Monthly API charge"/></div>' +
        '<div class="fg inv-proof-row" style="padding:0">' +
          '<label class="fl">Payment Proof <span style="color:var(--ink4);font-weight:400">(Photo / PDF &mdash; max 2&thinsp;MB)</span></label>' +
          '<label class="inv-proof-label" for="vnd-inv-proof-file">' +
            '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>' +
            'Choose file to upload' +
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
    if (!invs.length) return '<div class="fm-muted-sm">No invoices recorded. Click "+ Add Invoice" to log one.</div>';
    var ST = { unpaid:'fm-badge--amber', paid:'fm-badge--green', cancelled:'fm-badge--red' };
    return '<div class="cust-inv-list">' + invs.map(function (inv) {
      return '<div class="cust-inv-row">' +
        '<div class="cust-inv-meta" style="flex-direction:column;align-items:flex-start;gap:3px">' +
          '<span class="cust-inv-date">' + _fmtDate(inv.issueDate) + '</span>' +
          (inv.dueDate ? '<span style="font-size:11.5px;color:var(--ink4)">Due ' + _fmtDate(inv.dueDate) + '</span>' : '') +
          '<span class="fm-badge ' + (ST[inv.status] || 'fm-badge--gray') + '">' + inv.status + (inv.paidDate ? ' \u00b7 ' + _fmtDate(inv.paidDate) : '') + '</span>' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">' +
          '<div class="cust-inv-amt">' + FinSettings.fmtAmt(inv.amount, v.currency) + '</div>' +
          (inv.proofData ? '<span class="inv-proof-link" onclick="Vendors._viewProof(\'' + _esc(inv.id) + '\',\'' + _esc(v.id) + '\')">' +
            '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>' +
            ' View Proof</span>' : '') +
        '</div>' +
        '<div class="cust-inv-actions">' +
          (inv.status === 'unpaid' ? '<button class="btn btn-xs btn-out" onclick="Vendors.setInvStatus(\'' + _esc(v.id) + '\',\'' + _esc(inv.id) + '\',\'paid\')">Mark Paid</button>' : '') +
          (inv.status !== 'cancelled' && inv.status !== 'paid' ? '<button class="btn btn-xs btn-out fm-btn-del" onclick="Vendors.setInvStatus(\'' + _esc(v.id) + '\',\'' + _esc(inv.id) + '\',\'cancelled\')">Cancel</button>' : '') +
        '</div>' +
      '</div>';
    }).join('') + '</div>';
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
    if (file.size > 2 * 1024 * 1024) {
      App.showToast('File exceeds 2 MB limit', 'err');
      input.value = '';
      return;
    }
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
    if (_pendingProof) {
      fields.proofData = _pendingProof.data;
      fields.proofName = _pendingProof.name;
      fields.proofType = _pendingProof.type;
    }
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

  function _viewProof(invoiceId, vendorId) {
    var idx = _data.findIndex(function (x) { return x.id === vendorId; });
    if (idx < 0) return;
    var inv = (_data[idx].invoices || []).find(function (i) { return i.id === invoiceId; });
    if (!inv || !inv.proofData) return;
    var win = window.open('', '_blank');
    if (!win) return;
    if (inv.proofType && inv.proofType.startsWith('image/')) {
      win.document.write('<!DOCTYPE html><html><body style="margin:0;background:#111;display:flex;justify-content:center;align-items:flex-start;min-height:100vh"><img src="' + inv.proofData + '" style="max-width:100%;display:block"/></body></html>');
    } else {
      win.location = inv.proofData;
    }
  }

  // ─── Add / Edit Modal ─────────────────────────────────────────────────

  function openAddModal() {
    _editId = null;
    _clearModalForm();
    _setEl('vnd-modal-title', 'Add Vendor');
    _onBillingTypeChange();
    _openOverlay('vnd-overlay');
  }

  function openEditModal(id) {
    var v = getById(id);
    if (!v) return;
    _editId = id;
    _setEl('vnd-modal-title', 'Edit Vendor');
    _setVal('vnd-m-name',         v.name);
    _setVal('vnd-m-category',     v.category);
    _setVal('vnd-m-currency',     v.currency);
    _setVal('vnd-m-amount',       v.amount);
    _setVal('vnd-m-billing-type', v.billingType);
    _setVal('vnd-m-freq',         v.recurringFrequency || 'monthly');
    _setVal('vnd-m-payment-form', v.paymentForm);
    _setVal('vnd-m-start',        v.agreementStart);
    _setVal('vnd-m-end',          v.agreementEnd);
    _setVal('vnd-m-status',       v.manualStatus || 'auto');
    _setVal('vnd-m-notes',        v.notes);
    _setVal('vnd-m-services',     (v.services || []).join(', '));
    _setVal('vnd-m-contact',      v.contactName || '');
    _setVal('vnd-m-email',        v.contactEmail || '');
    _setVal('vnd-m-phone',        v.contactPhone || '');
    _onBillingTypeChange();
    _openOverlay('vnd-overlay');
  }

  function closeModal() {
    _closeOverlay('vnd-overlay');
    _editId = null;
    var err = document.getElementById('vnd-modal-err');
    if (err) err.textContent = '';
  }

  function _clearModalForm() {
    ['vnd-m-name','vnd-m-category','vnd-m-amount','vnd-m-payment-form','vnd-m-start','vnd-m-end',
     'vnd-m-notes','vnd-m-services','vnd-m-contact','vnd-m-email','vnd-m-phone']
    .forEach(function (id) { _setVal(id, ''); });
    _setVal('vnd-m-currency',     'USD');
    _setVal('vnd-m-billing-type', 'recurring');
    _setVal('vnd-m-freq',         'monthly');
    _setVal('vnd-m-status',       'auto');
    var err = document.getElementById('vnd-modal-err');
    if (err) err.textContent = '';
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
    var payForm  = _getVal('vnd-m-payment-form');
    var start    = _getVal('vnd-m-start');
    var end      = _getVal('vnd-m-end');
    var mStatus  = _getVal('vnd-m-status');
    var notes    = _getVal('vnd-m-notes');
    var svcsRaw  = _getVal('vnd-m-services');
    var services = svcsRaw ? svcsRaw.split(',').map(function (s) { return s.trim(); }).filter(Boolean) : [];
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
      notes, services,
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
    init:               init,
    onTabActivated:     onTabActivated,
    getAll:             getAll,
    openAddModal:       openAddModal,
    openEditModal:      openEditModal,
    closeModal:         closeModal,
    openDrawer:         openDrawer,
    closeDrawer:        closeDrawer,
    toggleAddInvoice:   toggleAddInvoice,
    submitInvoice:      submitInvoice,
    setInvStatus:       setInvStatus,
    _onProofFileChange: _onProofFileChange,
    _viewProof:         _viewProof,
    confirmSave:        confirmSave,
    confirmDelete:      confirmDelete,
    onSearch:           onSearch,
    onFilterStatus:     onFilterStatus,
    onFilterBillingType:onFilterBillingType,
    onFilterCurrency:   onFilterCurrency,
    onBillingTypeChange:onBillingTypeChange,
  };

})();
