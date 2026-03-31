'use strict';

/* ═══════════════════════════════════════════════════
   Vendors — services / tools we pay for
   IIFE → Vendors global
   ═══════════════════════════════════════════════════ */

const Vendors = (function () {

  // ─── Seed data ────────────────────────────────────────────────────────
  var SEED = [
    { id:'v1', name:'Anthropic',   category:'AI Services',          currency:'USD', amount:100,   billingType:'recurring', recurringFrequency:'monthly',   paymentForm:'Credit Card',   agreementStart:'2025-01-01', agreementEnd:'2026-12-31', manualStatus:null, notes:'Claude API usage' },
    { id:'v2', name:'AWS',         category:'Cloud Infrastructure',  currency:'USD', amount:500,   billingType:'irregular', recurringFrequency:null,          paymentForm:'Credit Card',   agreementStart:'2024-01-01', agreementEnd:'2027-01-01', manualStatus:null, notes:'Main AWS account — SaaS prod' },
    { id:'v3', name:'Cursor',      category:'AI Tools',              currency:'USD', amount:20,    billingType:'recurring', recurringFrequency:'monthly',   paymentForm:'Credit Card',   agreementStart:'2025-03-01', agreementEnd:'2026-04-01', manualStatus:null, notes:'AI code editor subscription' },
    { id:'v4', name:'OpenAI',      category:'AI Services',           currency:'USD', amount:50,    billingType:'irregular', recurringFrequency:null,          paymentForm:'Credit Card',   agreementStart:'2025-01-01', agreementEnd:'2026-12-31', manualStatus:null, notes:'GPT API usage' },
    { id:'v5', name:'Google',      category:'Cloud / Productivity',  currency:'USD', amount:30,    billingType:'recurring', recurringFrequency:'monthly',   paymentForm:'Credit Card',   agreementStart:'2024-06-01', agreementEnd:'2026-06-01', manualStatus:null, notes:'Workspace + GCP' },
    { id:'v6', name:'HR Service',  category:'HR & Payroll',          currency:'NPR', amount:50000, billingType:'recurring', recurringFrequency:'monthly',   paymentForm:'Bank Transfer', agreementStart:'2025-01-01', agreementEnd:'2026-04-15', manualStatus:null, notes:'Monthly HR management service' },
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
  }

  function _persist() { localStorage.setItem(STORAGE_KEY, JSON.stringify(_data)); }

  function _uuid() { return 'v-' + Date.now() + '-' + Math.random().toString(36).substr(2, 8); }

  // ─── CRUD (public) ────────────────────────────────────────────────────

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
    var v = Object.assign({ id: _uuid(), manualStatus: null }, fields);
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

  // Monthly NPR equivalent (null for one-time / irregular)
  function _monthlyNpr(v) {
    if (v.billingType !== 'recurring') return null;
    var mul = { monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 };
    return FinSettings.toNpr(v.amount * (mul[v.recurringFrequency] || 1), v.currency);
  }

  // ─── UI state ─────────────────────────────────────────────────────────
  var _editId    = null;
  var _search    = '';
  var _fStatus   = 'all';
  var _fBilling  = 'all';
  var _fCurrency = 'all';

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
    _renderTable();
  }

  function _renderStats() {
    var all     = getAll();
    var active  = all.filter(function (v) { return v.status === 'active' || v.status === 'expiring_soon'; });
    var expiring = all.filter(function (v) { return v.status === 'expiring_soon' || v.status === 'expired'; });
    var irreg   = all.filter(function (v) { return v.billingType === 'irregular'; });

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

  function _renderTable() {
    var tbody = document.getElementById('vnd-tbody');
    if (!tbody) return;
    var list = _getFiltered();
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="fm-empty-cell"><div class="empty"><div class="empty-ico">\uD83C\uDFE2</div><p class="empty-t">No vendors found</p></div></td></tr>';
      return;
    }
    tbody.innerHTML = list.map(_rowHtml).join('');
  }

  function _rowHtml(v) {
    var rowCls = v.status === 'expiring_soon' ? 'fm-row--amber'
               : v.status === 'expired'       ? 'fm-row--red' : '';
    var days = _daysUntil(v.agreementEnd);
    var expiryChip = (v.agreementEnd && days >= 0 && days <= 60)
      ? ' <span class="fm-chip ' + (days <= 7 ? 'red' : 'amber') + '">' + days + 'd</span>'
      : '';
    var billingLabel = { recurring: 'Recurring', irregular: 'Irregular', 'one-time': 'One-Time' }[v.billingType] || v.billingType;
    var freqLabel = v.recurringFrequency ? ' / ' + ({ monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly' }[v.recurringFrequency] || '') : '';

    return '<tr class="fm-row ' + rowCls + '">' +
      '<td><span class="fm-name">' + _esc(v.name) + '</span></td>' +
      '<td><span class="fm-cat">' + _esc(v.category) + '</span></td>' +
      '<td class="fm-cell-amt">' + FinSettings.fmtWithNpr(v.amount, v.currency) + '</td>' +
      '<td><span class="fm-billing-pill ' + _esc(v.billingType) + '">' + billingLabel + freqLabel + '</span></td>' +
      '<td class="fm-cell-dates">' + _fmtDate(v.agreementStart) + '\u00a0\u2013\u00a0' + _fmtDate(v.agreementEnd) + expiryChip + '</td>' +
      '<td>' + _statusBadge(v.status) + '</td>' +
      '<td class="fm-cell-actions">' +
        '<button class="btn btn-xs btn-out" onclick="Vendors.openEditModal(\'' + _esc(v.id) + '\')">Edit</button>' +
        '<button class="btn btn-xs btn-out fm-btn-del" onclick="Vendors.confirmDelete(\'' + _esc(v.id) + '\')">Delete</button>' +
      '</td>' +
    '</tr>';
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

  // ─── Filters ──────────────────────────────────────────────────────────

  function onSearch(val)          { _search    = val;  _renderTable(); }
  function onFilterStatus(val)    { _fStatus   = val;  _renderTable(); }
  function onFilterBillingType(val){ _fBilling = val;  _renderTable(); }
  function onFilterCurrency(val)  { _fCurrency = val;  _renderTable(); }

  // ─── Modal ────────────────────────────────────────────────────────────

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
    ['vnd-m-name','vnd-m-category','vnd-m-amount','vnd-m-payment-form','vnd-m-start','vnd-m-end','vnd-m-notes'].forEach(function (id) {
      _setVal(id, '');
    });
    _setVal('vnd-m-currency',     'USD');
    _setVal('vnd-m-billing-type', 'recurring');
    _setVal('vnd-m-freq',         'monthly');
    _setVal('vnd-m-status',       'auto');
    var err = document.getElementById('vnd-modal-err');
    if (err) err.textContent = '';
  }

  function onBillingTypeChange() { _onBillingTypeChange(); }

  function _onBillingTypeChange() {
    var bt = _getVal('vnd-m-billing-type');
    var row = document.getElementById('vnd-m-freq-row');
    if (row) row.style.display = bt === 'recurring' ? '' : 'none';
  }

  function confirmSave() {
    var errEl = document.getElementById('vnd-modal-err');
    if (errEl) errEl.textContent = '';

    var name        = _getVal('vnd-m-name');
    var category    = _getVal('vnd-m-category');
    var currency    = _getVal('vnd-m-currency');
    var amount      = parseFloat(_getVal('vnd-m-amount'));
    var billingType = _getVal('vnd-m-billing-type');
    var freq        = _getVal('vnd-m-freq');
    var payForm     = _getVal('vnd-m-payment-form');
    var start       = _getVal('vnd-m-start');
    var end         = _getVal('vnd-m-end');
    var manualSt    = _getVal('vnd-m-status');
    var notes       = _getVal('vnd-m-notes');

    function err(msg) { if (errEl) errEl.textContent = msg; }
    if (!name)              { err('Vendor name is required'); return; }
    if (!category)          { err('Category is required');   return; }
    if (isNaN(amount) || amount < 0) { err('Enter a valid amount'); return; }

    var fields = {
      name, category, currency, amount, billingType,
      recurringFrequency: billingType === 'recurring' ? freq : null,
      paymentForm: payForm, agreementStart: start, agreementEnd: end,
      manualStatus: manualSt === 'auto' ? null : manualSt, notes,
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
    confirmSave:        confirmSave,
    confirmDelete:      confirmDelete,
    onSearch:           onSearch,
    onFilterStatus:     onFilterStatus,
    onFilterBillingType:onFilterBillingType,
    onFilterCurrency:   onFilterCurrency,
    onBillingTypeChange:onBillingTypeChange,
  };

})();
